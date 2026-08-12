-- ============================================================
-- supabase/schema.sql
-- KT ENA 광고사업본부 매출 대시보드 — Supabase 스키마
--
-- 계층: raw_sales_rows(bronze) → v_sales_normalized(silver) → v_bonbu_sales(gold)
--       + upfront_contracts(ETL 산출 실체 테이블) + etl_load_batches/current_batch(적재 이력+컷오버 포인터)
--
-- 이 스키마는 scripts/etl/*.mjs가 채우고, 대시보드는 Worker 프록시(worker.js /api/*)를 통해서만
-- v_bonbu_sales / upfront_contracts / v_latest_batch_info 세 개를 읽는다. 원본(raw_sales_rows)과
-- 적재 이력(etl_load_batches)은 service_role(ETL/Worker)만 접근 가능하며 외부에 노출하지 않는다.
--
-- 적용: Supabase SQL Editor 또는 `psql "$SUPABASE_DB_URL" -f supabase/schema.sql`
-- ============================================================

-- ------------------------------------------------------------
-- 0. 적재 이력 / 컷오버 포인터
-- ------------------------------------------------------------

create table if not exists etl_load_batches (
  id                       bigint generated always as identity primary key,
  source_file_name         text,
  source_file_modified_at  timestamptz,
  row_count                int,
  loaded_at                timestamptz not null default now(),
  loaded_by                text,
  status                   text not null default 'loading'
                             check (status in ('loading', 'loaded', 'validated', 'failed', 'superseded')),
  validation_summary       jsonb,
  notes                    text
);

-- 정확히 1행만 갖는 싱글턴 포인터. batch_id를 UPDATE하는 것이 곧 "원자적 컷오버".
create table if not exists current_batch (
  id        smallint primary key check (id = 1),
  batch_id  bigint references etl_load_batches(id)
);
insert into current_batch (id, batch_id) values (1, null)
  on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 1. raw_sales_rows (bronze)
--
-- 엑셀 `변환` 시트 행을 적재한다. 문자열/카테고리 컬럼은 원본 그대로(재분류는 v_sales_normalized에서
-- CASE WHEN으로 수행 — SQL에서 감사 가능하도록). 단, 날짜·숫자·불리언 컬럼(귀속월/계약일자/업프론트 여부/
-- 업프론트 계약금액)은 SheetJS의 엑셀 시리얼 날짜 파싱(XLSX.SSF.parse_date_code) 등 Node 쪽에서만 가능한
-- 파싱이 필요해 scripts/etl/transform.mjs가 파싱을 마친 뒤 이미 타입이 정해진 값으로 적재한다
-- (data-loader.js의 parseMonthValue/parseDateToYM/parseDateFull/조건 로직을 그대로 이식).
-- 제외 대상 행(교환광고/대행수익 등)도 감사 목적으로 전량 적재하므로 절대 외부에 노출하지 않는다.
-- ------------------------------------------------------------

create table if not exists raw_sales_rows (
  id                            bigint generated always as identity primary key,
  load_batch_id                 bigint not null references etl_load_batches(id),
  source_row_no                 int,

  month_str                     text not null,   -- 'YYYY-MM' (parseMonthValue 이식 결과)
  year                          int not null,
  month                         int not null,

  dept                          text not null default '(미지정)',
  manager                       text not null default '(미지정)',
  advertiser                    text not null default '(미지정)',
  agency_raw                    text not null default '(미지정)',       -- 원본 '대행사'
  agency_group_raw              text not null default '(미지정)',       -- 원본 '대행사그룹'|'대행사 그룹'|'대행사' 폴백
  channel_raw                   text not null default '(미지정)',       -- 원본 '채널'|'매체' 폴백
  industry                      text not null default '(미지정)',
  broad_digital                 text not null default '기타',

  category_original             text not null default '기타',           -- 원본 '대분류'
  sub_category                  text not null default '(미지정)',       -- 원본 '중분류'
  sub_category3                 text not null default '',               -- 원본 '소분류'
  one_n_flag                    text not null default '',

  revenue_basis                 text not null default '실적',           -- '실적' | '회계조정'
  bonbu_revenue_status          text not null default '',               -- '본부매출' 이어야 집계 대상
  remark                        text,

  amount_won                    bigint not null default 0,

  is_upfront                    boolean not null default false,
  contract_start_y              int,
  contract_start_m              int,
  contract_end_y                int,
  contract_end_m                int,
  contract_start_date           date,
  contract_end_date             date,

  upfront_contract_amount_eok   numeric(12, 2) not null default 0,      -- 억원 단위 숫자
  gross_net_flag                text not null default '',               -- '' | 'GROSS' | 'NET'
  upfront_advertiser_raw        text,                                    -- 원본 '광고주(업프론트용)'
  upfront_note                  text,                                    -- 원본 '업프론트 비고'

  created_at                    timestamptz not null default now()
);

create index if not exists idx_raw_sales_rows_batch on raw_sales_rows (load_batch_id);
create index if not exists idx_raw_sales_rows_batch_bonbu on raw_sales_rows (load_batch_id, bonbu_revenue_status);

-- ------------------------------------------------------------
-- 2. v_sales_normalized (silver) — 정규화 + 5대분류 재분류. 필터링은 하지 않는다.
--    최신 배치(current_batch)만 노출한다.
-- ------------------------------------------------------------

create or replace view v_sales_normalized as
select
  r.id,
  r.load_batch_id,
  r.month_str,
  r.year,
  r.month,
  r.dept,
  r.manager,
  r.advertiser,

  -- 대행사 정규화 (data-loader.js:164-165)
  case
    when r.agency_raw like '%에스엠컨텐츠앤커뮤니케이션즈%' then 'SM C&C'
    else r.agency_raw
  end as agency,

  -- 대행사그룹 정규화 (data-loader.js:166-173). 원본 agency_raw(미치환)를 그대로 판정에 사용해도
  -- SM C&C 치환 여부와 무관하게 동일한 분기 결과가 나오므로 원본값 기준으로 이식.
  case
    when r.agency_group_raw like '%캐러트코리아%' or r.agency_raw like '%캐러트코리아%'
      or r.agency_group_raw like '%덴츠%' or r.agency_raw like '%덴츠%'
      or r.agency_group_raw like '%아이프로스펙트코리아%' or r.agency_raw like '%아이프로스펙트코리아%'
      or r.agency_group_raw like '%엠플리파이%' or r.agency_raw like '%엠플리파이%'
      or r.agency_group_raw like '%휘닉스커뮤니케이션즈%' or r.agency_raw like '%휘닉스커뮤니케이션즈%'
      then '덴츠(G)'
    when r.agency_group_raw like '%레오버넷%' then '레오버넷(G)'
    when r.agency_group_raw like '%명애드컴%' then '명애드컴'
    when r.agency_group_raw ilike '%HSAD%' then 'HSAD(G)'
    when r.agency_group_raw like '%옴니콤%'
      or r.agency_raw in ('TBWA KOREA', 'TBWA', '비비디오코리아', 'BBDO', '옴니콤미디어그룹코리아', '옴니콤', 'PHD')
      then '옴니콤광고그룹'
    when r.agency_group_raw like '%에스엠컨텐츠앤커뮤니케이션즈%' then 'SM C&C'
    else r.agency_group_raw
  end as agency_group,

  -- 채널 정규화 (data-loader.js:157-161)
  case
    when r.channel_raw ilike '%CHING%' or r.channel_raw like '%채널ING%' then 'CHING'
    when r.channel_raw ilike '%ONT%' then 'ONT'
    when r.channel_raw like '%헬스메디%' or r.channel_raw ilike '%HEALTH%' then '헬스메디TV'
    else r.channel_raw
  end as channel,

  r.industry,
  r.broad_digital,
  r.category_original,
  r.sub_category,
  r.sub_category3,
  r.one_n_flag,

  -- 5대분류 재분류 (classifyCategory, data-loader.js:278-285)
  case
    when r.category_original = '일반광고' then '일반광고'
    when r.category_original = '인포머셜' then '인포머셜'
    when r.category_original = 'IMC' then 'IMC'
    when r.category_original = '큐톤광고' or r.sub_category ilike '%skylife%' then '큐톤광고'
    when r.category_original in ('기타광고', '어드레서블', '콘텐츠편성', '기타수익', 'ARA', '대행수익')
      or r.sub_category = '자사큐톤' or r.sub_category = '티온애드' then '기타광고'
    else coalesce(nullif(r.category_original, ''), '기타광고')
  end as category_reclassified,

  r.revenue_basis,
  r.bonbu_revenue_status,
  r.remark,
  r.amount_won,

  r.is_upfront,
  r.contract_start_y,
  r.contract_start_m,
  r.contract_end_y,
  r.contract_end_m,
  r.contract_start_date,
  r.contract_end_date,
  r.upfront_contract_amount_eok,
  round(r.upfront_contract_amount_eok * 100000000)::bigint as contract_amount_won,
  r.gross_net_flag,
  r.upfront_advertiser_raw,
  r.upfront_note,

  -- 본부매출 판정 + 매출 미인식 사전 필터 (data-loader.js:128-136)
  (r.bonbu_revenue_status = '본부매출') as is_bonbu,
  case
    when r.category_original = '교환광고' then true
    when r.category_original = '대행수익' and r.sub_category <> 'skylife큐톤' then true
    else false
  end as is_excluded,
  case
    when r.category_original = '교환광고' then '교환광고 미인식'
    when r.category_original = '대행수익' and r.sub_category <> 'skylife큐톤' then '대행수익 미인식(skylife큐톤 예외 아님)'
    else null
  end as excluded_reason

from raw_sales_rows r
where r.load_batch_id = (select batch_id from current_batch where id = 1);

-- ------------------------------------------------------------
-- 3. v_bonbu_sales (gold) — 프론트(Worker 프록시)가 유일하게 읽는 매출 뷰.
--
-- 주의: revenue_basis(실적/회계조정) 필터는 여기서 걸지 않는다. 실적+회계조정 행을 전부 반환하고,
-- 매출기준(취급고/회계) 토글은 기존과 동일하게 프론트(js/core/filters.js applyFilters())가 클라이언트에서
-- 처리한다 — 뷰에서 실적만 걸러버리면 회계 모드 자체가 불가능해지기 때문 (CLAUDE.md 구 로드맵의 실수).
-- ------------------------------------------------------------

create or replace view v_bonbu_sales as
select *
from v_sales_normalized
where is_bonbu and not is_excluded;

-- ------------------------------------------------------------
-- 4. upfront_contracts — ETL이 채우는 실체 테이블 (K2 병합 결과, 매 쿼리 재계산 금지)
--    그룹핑→기간비교→sweep 병합은 절차적 로직이라 SQL VIEW로 표현 불가 (scripts/etl/upfront-merge.mjs 참고)
-- ------------------------------------------------------------

create table if not exists upfront_contracts (
  id                   bigint generated always as identity primary key,
  load_batch_id        bigint not null references etl_load_batches(id),
  advertiser           text not null,
  group_key            text not null,             -- 병합 키(upfront_note 또는 upfront_advertiser_raw) — 디버깅용
  start_year           int not null,
  start_month          int not null,
  end_year             int not null,
  end_month            int not null,
  target_amount_won    bigint not null,
  has_net              boolean not null default false,
  total_months         int not null,
  source_raw_row_ids   bigint[] not null default '{}',
  created_at           timestamptz not null default now()
);

create index if not exists idx_upfront_contracts_batch on upfront_contracts (load_batch_id);

create or replace view v_upfront_contracts_current as
select *
from upfront_contracts
where load_batch_id = (select batch_id from current_batch where id = 1);

-- ------------------------------------------------------------
-- 5. v_latest_batch_info — 대시보드가 "원본 수정" 표시 + 배치 변경 감지 폴링에 쓰는 경량 뷰
-- ------------------------------------------------------------

create or replace view v_latest_batch_info as
select
  b.id as batch_id,
  b.loaded_at,
  b.source_file_modified_at,
  b.row_count,
  b.status
from current_batch c
join etl_load_batches b on b.id = c.batch_id;

-- ------------------------------------------------------------
-- 6. 접근통제
--
-- 승인된 접근 경로는 "Cloudflare Worker 프록시"다: 브라우저는 Zero Trust로 보호되는 대시보드
-- 도메인(worker.js의 /api/*)만 호출하고, Worker가 서버 측에서 SUPABASE_SERVICE_ROLE_KEY로 Supabase를
-- 대신 조회한다. service_role은 Postgres BYPASSRLS 속성을 가진 Supabase 기본 역할이라 RLS를 우회하므로,
-- 아래 설정의 목적은 "혹시 anon/authenticated key가 유출되거나 잘못 사용되더라도 아무것도 못 읽게" 막는
-- 방어선이다 — anon key는 이 프로젝트에서 프론트에 절대 노출하지 않는다.
-- ------------------------------------------------------------

alter table raw_sales_rows enable row level security;
alter table etl_load_batches enable row level security;
alter table current_batch enable row level security;
alter table upfront_contracts enable row level security;
-- 정책을 하나도 만들지 않으므로 anon/authenticated는 RLS에 의해 전부 차단된다. service_role은 BYPASSRLS로 무관.

revoke all on raw_sales_rows from anon, authenticated;
revoke all on etl_load_batches from anon, authenticated;
revoke all on current_batch from anon, authenticated;
revoke all on upfront_contracts from anon, authenticated;
revoke all on v_sales_normalized from anon, authenticated;
revoke all on v_bonbu_sales from anon, authenticated;
revoke all on v_upfront_contracts_current from anon, authenticated;
revoke all on v_latest_batch_info from anon, authenticated;

grant select on raw_sales_rows, etl_load_batches, current_batch, upfront_contracts,
  v_sales_normalized, v_bonbu_sales, v_upfront_contracts_current, v_latest_batch_info
  to service_role;
grant insert, update on raw_sales_rows, etl_load_batches, current_batch, upfront_contracts to service_role;
