# scripts/etl — 엑셀 → Supabase 적재

프론트엔드(빌드 도구 없음)와 무관한 독립 Node 프로젝트. 담당자가 `addata.xlsx`를 갱신할 때마다 수동으로 실행한다.

## 최초 설정
```
cd scripts/etl
npm install
cp .env.example .env   # SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 채워넣기 (service_role — anon 아님)
```
`supabase/schema.sql`을 먼저 Supabase 프로젝트에 적용해야 한다(SQL Editor에 붙여넣기, 또는 `psql "$SUPABASE_DB_URL" -f ../../supabase/schema.sql`).

## 실행
```
node run.mjs "C:\경로\addata.xlsx"
```
1. 엑셀 `변환` 시트 파싱 → 새 배치(`etl_load_batches`) 등록 → `raw_sales_rows` 전량 적재(제외 대상 행 포함)
2. 업프론트 계약 병합(K2 로직) → `upfront_contracts` 적재
3. 직전 배치 대비 diff 검증(`validate.mjs`) — 카테고리·연도별 합계, 행 수 비교
4. 검증 통과 시에만 `current_batch` 포인터를 새 배치로 원자적 갱신(컷오버). 실패 시 컷오버하지 않고 종료(exit code 1) — 이전 배치가 계속 서빙되므로 안전.

## 컬럼을 새로 추가할 때 (예: 업종 중·소분류)

`raw_sales_rows`에 컬럼을 더할 때는 **테이블 → 뷰 두 개 → 재적재** 순서를 지킨다. 순서를 바꾸면
중간 단계에서 실패한다(뷰가 없는 컬럼을 참조하거나, ETL이 없는 컬럼에 insert를 시도한다).

1. **테이블에 컬럼 추가** — SQL Editor에서. `if not exists`라 여러 번 돌려도 안전하다.
   ```sql
   alter table raw_sales_rows add column if not exists industry_mid text not null default '(미지정)';
   alter table raw_sales_rows add column if not exists industry_sub text not null default '(미지정)';
   ```
2. **`v_sales_normalized` 다시 만들기** — `schema.sql`의 `create or replace view v_sales_normalized …`
   블록만 복사해 실행한다(파일 전체를 다시 돌려도 되지만 불필요하다).
3. **`v_bonbu_sales` 다시 만들기** — `select *`는 만들 때 컬럼 목록이 **박제되므로**, 아래 뷰를
   다시 만들지 않으면 새 컬럼이 프론트까지 오지 않는다. 2번만 하고 끝내기 쉬운 지점이다.
   ```sql
   create or replace view v_bonbu_sales as
   select * from v_sales_normalized where is_bonbu and not is_excluded;
   ```
4. **ETL 재실행** — `node run.mjs "…\addata.xlsx"`. 이때부터 실제 값이 들어간다.
   그전까지는 새 컬럼이 기본값(`(미지정)`)으로만 보인다. 에러가 아니다.

> ⚠ **뷰의 새 컬럼은 반드시 SELECT 목록 맨 뒤에 적는다.** `create or replace view`는 기존 컬럼의
> 이름·순서를 바꿀 수 없어서, 의미상 어울리는 자리(예: `industry` 옆)에 끼워 넣으면
> `cannot change name of view column` 으로 적용 자체가 실패한다. 자리를 옮기려면 뷰를 drop 해야 하는데,
> `v_bonbu_sales`가 딸려 있어 cascade가 필요하다 — 그럴 이유가 없다.

확인:
```sql
select industry, industry_mid, industry_sub, count(*)
from v_bonbu_sales group by 1,2,3 order by 4 desc limit 10;
```

## 롤백
배치는 삭제되지 않고 `superseded`로만 표시된다. 문제가 늦게 발견되면 `current_batch.batch_id`를 이전 `etl_load_batches.id`로 직접 UPDATE하면 즉시 이전 상태로 돌아간다.

## R2 업로드와의 관계
R2(`addata.xlsx`)에도 계속 업로드하는 것을 권장(백업/xlsx 모드 안전망 목적). 이 스크립트는 R2 업로드를 대체하지 않고 별도로 실행한다.

## 목표 적재 (`load-targets.mjs`)
`run.mjs`(매출 ETL)와는 독립된 스크립트다. `target.xlsx`의 `목표 합산` 시트(담당자 | 부서 | 매출기준 | 대분류 | 귀속월 | 목표)를
읽어 5대분류로 재분류(`대행수익` 등은 `기타광고`로 흡수)한 뒤 `sales_targets` 테이블에 upsert한다. 배치/컷오버 개념이
없으므로 목표를 분기·반기 단위로 갱신할 때마다 아래 명령을 재실행하면 된다.
```
node load-targets.mjs "C:\경로\target.xlsx"
```
`매출기준` 컬럼 값은 `취급고`/`회계` 둘 중 하나여야 한다(`js`의 `revenueBasisMode` 값에 맞춰 각각 `performance`/`accounting`으로 변환해 적재). 두 기준이 같은 (담당자, 대분류, 연월)에 별도 행으로 공존하므로 `sales_targets`의 유니크 키는 `basis`까지 포함한다.

주의: upsert만 수행하므로 파일에서 삭제되거나 하향 수정된 과거 목표 행은 자동으로 정리되지 않는다 — 목표가
줄거나 없어진 경우 재적재 후 Supabase에서 `sales_targets`를 수동으로 확인/삭제해야 한다.

### `basis` 컬럼 마이그레이션 (기존 `sales_targets`에 1회만)
기존 테이블은 `basis` 컬럼과 그걸 포함한 유니크 제약이 없다. SQL Editor에서 한 번만 실행:
```sql
alter table sales_targets add column if not exists basis text not null default 'performance';
alter table sales_targets add constraint sales_targets_basis_check check (basis in ('performance', 'accounting'));

-- 기존 (manager, category_reclassified, year, month) 유니크 제약을 basis 포함으로 교체.
-- 제약 이름이 자동 생성돼 환경마다 다를 수 있어 카탈로그에서 직접 찾아 드롭한다.
do $$
declare
  v_name text;
begin
  select conname into v_name
  from pg_constraint
  where conrelid = 'sales_targets'::regclass and contype = 'u';
  if v_name is not null then
    execute format('alter table sales_targets drop constraint %I', v_name);
  end if;
end $$;

alter table sales_targets add constraint sales_targets_basis_unique
  unique (manager, category_reclassified, year, month, basis);
```
그 다음 `load-targets.mjs`를 재실행하면 취급고/회계 두 기준이 각자 행으로 채워진다.
