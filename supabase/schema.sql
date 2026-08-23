-- ============================================================
-- supabase/schema.sql
-- KT ENA 광고사업본부 매출 대시보드 — Supabase 스키마
--
-- 계층: raw_sales_rows(bronze) → v_sales_normalized(silver) → v_bonbu_sales(gold)
--       + upfront_contracts(ETL 산출 실체 테이블) + etl_load_batches/current_batch(적재 이력+컷오버 포인터)
--       + sales_targets(목표 적재 실체 테이블, scripts/etl/load-targets.mjs가 채움, 배치/컷오버 없음)
--
-- 이 스키마는 scripts/etl/*.mjs가 채우고, 대시보드는 Worker 프록시(worker.js /api/*)를 통해서만
-- v_bonbu_sales / upfront_contracts / sales_targets / v_latest_batch_info 네 개를 읽는다. 원본(raw_sales_rows)과
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
  industry                      text not null default '(미지정)',       -- 원본 '업종대분류'
  industry_mid                  text not null default '(미지정)',       -- 원본 '업종중분류'
  industry_sub                  text not null default '(미지정)',       -- 원본 '업종소분류'
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
-- 2. v_sales_normalized (silver) — 정규화 + 5대분류 재분류 + skylife큐톤 담당자 재배분. 필터링은 하지 않는다.
--    최신 배치(current_batch)만 노출한다.
--
-- skylife큐톤 담당자 재배분 (docs/data-rules.md 10번 항목, 사용자 확정 비율):
--   원본 데이터는 sub_category='skylife큐톤'인 행 전액이 담당자 '박영상' 한 명에게 잡혀 있으나,
--   실제로는 여러 담당자가 나눠 갖는 구조라 아래 규칙으로 raw 행 1개를 N개 행으로 쪼갠다(부서는
--   원본 그대로 유지, 담당자·금액만 분배). 규칙에 해당하지 않는 skylife큐톤 행(연도 불일치, 2025년
--   미정의 소분류)은 재배분하지 않고 원본 담당자를 그대로 유지한다.
--     2025년 소분류 LiveAD+/심포니/영업대행수수료: 박영상 50% / 남형진 50%
--     2025년 소분류 장초수/인포결합:              박영상 65% / 김기철 35%
--     2026년 1~4월(소분류 무관):                  박영상 50% / 남형진 50%
--     2026년 5~12월(소분류 무관):                 박영상 50% / 남형진 30% / 이신우 20%
--
-- 구현: 커스텀 복합타입 + unnest 대신, 각 규칙을 UNION ALL 브랜치로 풀어 쓴다. Postgres/SQL Editor에서
-- CASE 분기마다 다른 배열 타입을 만들어 unnest하는 방식은 타입 통일이 깨지기 쉬워(실제로 겪은 문제),
-- 브랜치별로 그냥 SELECT를 하나씩 쓰는 게 더 단순하고 안전하다. 마지막 조각은 항상 "원금 - 앞 조각들의
-- 반올림 합"(나머지 방식)으로 계산해 SUM(amount_won)이 재배분 전후 정확히 보존되게 한다.
--
-- 알려진 미세 차이(수정 대상 아님): Postgres round()는 0에서 먼 쪽으로, JS Math.round()는 큰 쪽으로
-- 반올림한다. 그래서 **금액이 음수이면서 배분액이 정확히 .5로 떨어지는 skylife큐톤 행**에서만
-- 이 뷰와 data-loader.js의 getManagerSplitParts가 담당자별로 1원 차이를 낸다(예: -3,333,333 × 50%
-- → SQL -1,666,667 / JS -1,666,666). 나머지 방식이라 합계는 양쪽 모두 보존되고, 운영 경로는
-- Supabase 하나뿐이라 실제 영향은 xlsx로 롤백했을 때의 담당자별 1원뿐이다.
-- ------------------------------------------------------------

-- 배치 한정(src CTE): **10개 브랜치가 모두 최신 배치만 본다.** 예전에는 각 브랜치가
-- raw_sales_rows 전체를 조건 없이 훑었다. 상위 v_sales_normalized가 load_batch_id로 좁히지만
-- 그 조건은 조인 바깥쪽 r에만 걸리므로, split 쪽은 지금까지 적재한 **모든 배치**를 브랜치마다
-- 다시 스캔했다. 배치는 삭제되지 않고 superseded 표시만 되므로(scripts/etl/README.md), ETL을
-- 돌릴수록 /api/sales 응답이 느려지는 구조였다. src를 materialized로 한 번만 만들어 재사용한다.
create or replace view v_manager_split as
  with src as materialized (
    select r.*
    from raw_sales_rows r
    where r.load_batch_id = (select batch_id from current_batch where id = 1)
  )

  -- 규칙 없음(기본) → 원본 담당자 그대로 1행.
  -- **아래 8개 규칙 브랜치의 여집합으로 적는다.** 예전에는 해당 조건을 따로 열거했는데, 그러다
  -- 2026년이면서 month가 1~12 밖인 행이 어느 브랜치에도 안 잡혀 조용히 사라지는 구멍이 있었다
  -- (data-loader.js의 getManagerSplitParts는 그 경우 원본 담당자로 폴백한다). 여집합으로 적으면
  -- 규칙이 늘어도 "어디에도 안 걸리는 행"이 생기지 않는다.
  select r.id as raw_id, 1 as split_idx, r.manager as split_manager, r.amount_won as split_amount
  from src r
  where not (
       (r.sub_category = 'skylife큐톤' and r.year = 2025 and r.sub_category3 in ('LiveAD+', '심포니', '영업대행수수료', '장초수', '인포결합'))
    or (r.sub_category = 'skylife큐톤' and r.year = 2026 and r.month between 1 and 12)
  )

  union all
  -- 2025년 LiveAD+/심포니/영업대행수수료: 박영상 50% / 남형진 50%
  select r.id, 1, '박영상', round(r.amount_won * 0.5)::bigint
  from src r
  where r.sub_category = 'skylife큐톤' and r.year = 2025 and r.sub_category3 in ('LiveAD+', '심포니', '영업대행수수료')
  union all
  select r.id, 2, '남형진', r.amount_won - round(r.amount_won * 0.5)::bigint
  from src r
  where r.sub_category = 'skylife큐톤' and r.year = 2025 and r.sub_category3 in ('LiveAD+', '심포니', '영업대행수수료')

  union all
  -- 2025년 장초수/인포결합: 박영상 65% / 김기철 35%
  select r.id, 1, '박영상', round(r.amount_won * 0.65)::bigint
  from src r
  where r.sub_category = 'skylife큐톤' and r.year = 2025 and r.sub_category3 in ('장초수', '인포결합')
  union all
  select r.id, 2, '김기철', r.amount_won - round(r.amount_won * 0.65)::bigint
  from src r
  where r.sub_category = 'skylife큐톤' and r.year = 2025 and r.sub_category3 in ('장초수', '인포결합')

  union all
  -- 2026년 1~4월(소분류 무관): 박영상 50% / 남형진 50%
  select r.id, 1, '박영상', round(r.amount_won * 0.5)::bigint
  from src r
  where r.sub_category = 'skylife큐톤' and r.year = 2026 and r.month between 1 and 4
  union all
  select r.id, 2, '남형진', r.amount_won - round(r.amount_won * 0.5)::bigint
  from src r
  where r.sub_category = 'skylife큐톤' and r.year = 2026 and r.month between 1 and 4

  union all
  -- 2026년 5~12월(소분류 무관): 박영상 50% / 남형진 30% / 이신우 20%
  select r.id, 1, '박영상', round(r.amount_won * 0.5)::bigint
  from src r
  where r.sub_category = 'skylife큐톤' and r.year = 2026 and r.month between 5 and 12
  union all
  select r.id, 2, '남형진', round(r.amount_won * 0.3)::bigint
  from src r
  where r.sub_category = 'skylife큐톤' and r.year = 2026 and r.month between 5 and 12
  union all
  select r.id, 3, '이신우', r.amount_won - round(r.amount_won * 0.5)::bigint - round(r.amount_won * 0.3)::bigint
  from src r
  where r.sub_category = 'skylife큐톤' and r.year = 2026 and r.month between 5 and 12;

create or replace view v_sales_normalized as
select
  r.id * 100 + s.split_idx as id,   -- 합성 id: 최대 3분할이므로 100이면 raw id 간 충돌 없음(맨 뒤 raw_id 컬럼으로 원본 추적 가능)
  r.load_batch_id,
  r.month_str,
  r.year,
  r.month,
  r.dept,
  s.split_manager as manager,
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
  s.split_amount as amount_won,

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
  end as excluded_reason,

  r.id as raw_id,   -- 재배분으로 쪼개진 행의 원본 raw_sales_rows.id 추적용. CREATE OR REPLACE VIEW 제약상 새 컬럼은 항상 맨 뒤에 추가.

  -- 업종 중·소분류. 자리는 industry 옆이 자연스럽지만 **맨 뒤여야 한다** — CREATE OR REPLACE VIEW는
  -- 기존 컬럼의 이름·순서를 바꿀 수 없어서, 중간에 끼우면 뷰를 drop 하지 않는 한 적용 자체가 실패한다.
  r.industry_mid,
  r.industry_sub

from raw_sales_rows r
join v_manager_split s on s.raw_id = r.id
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
-- 4b. sales_targets — 목표 적재 실체 테이블(scripts/etl/load-targets.mjs가 채움, target.xlsx `목표 합산` 시트)
--     담당자 x 5대분류 x 연월 단위. 배치/컷오버 개념 없음(분기/반기 단위로 담당자가 수동 재적재,
--     upsert만 수행하므로 파일에서 삭제된 과거 행은 자동 정리되지 않음 — README 참고).
--     현재는 취급고(실적) 기준 목표만 존재. 회계기준 목표가 생기면 basis 컬럼을 추가할 것.
-- ------------------------------------------------------------

create table if not exists sales_targets (
  id                     bigint generated always as identity primary key,
  manager                text not null,
  dept                   text not null default '(미지정)',       -- 목표 수립 시점 스냅샷, 조인 키 아님(참고용)
  category_reclassified  text not null,                          -- 5대분류 값(일반광고/IMC/인포머셜/큐톤광고/기타광고)
  year                   int not null,
  month                  int not null,
  target_amount_won      bigint not null,                        -- 취급고(실적) 기준 원 단위
  updated_at             timestamptz not null default now(),
  unique (manager, category_reclassified, year, month)
);

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
alter table sales_targets enable row level security;
-- 정책을 하나도 만들지 않으므로 anon/authenticated는 RLS에 의해 전부 차단된다. service_role은 BYPASSRLS로 무관.

revoke all on raw_sales_rows from anon, authenticated;
revoke all on etl_load_batches from anon, authenticated;
revoke all on current_batch from anon, authenticated;
revoke all on upfront_contracts from anon, authenticated;
revoke all on sales_targets from anon, authenticated;
revoke all on v_manager_split from anon, authenticated;
revoke all on v_sales_normalized from anon, authenticated;
revoke all on v_bonbu_sales from anon, authenticated;
revoke all on v_upfront_contracts_current from anon, authenticated;
revoke all on v_latest_batch_info from anon, authenticated;

grant select on raw_sales_rows, etl_load_batches, current_batch, upfront_contracts, sales_targets,
  v_manager_split, v_sales_normalized, v_bonbu_sales, v_upfront_contracts_current, v_latest_batch_info
  to service_role;
grant insert, update on raw_sales_rows, etl_load_batches, current_batch, upfront_contracts, sales_targets to service_role;
