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

## 롤백
배치는 삭제되지 않고 `superseded`로만 표시된다. 문제가 늦게 발견되면 `current_batch.batch_id`를 이전 `etl_load_batches.id`로 직접 UPDATE하면 즉시 이전 상태로 돌아간다.

## R2 업로드와의 관계
R2(`addata.xlsx`)에도 계속 업로드하는 것을 권장(백업/xlsx 모드 안전망 목적). 이 스크립트는 R2 업로드를 대체하지 않고 별도로 실행한다.

## 목표 적재 (`load-targets.mjs`)
`run.mjs`(매출 ETL)와는 독립된 스크립트다. `target.xlsx`의 `목표 합산` 시트(담당자 | 부서 | 대분류 | 귀속월 | 목표)를
읽어 5대분류로 재분류(`대행수익` 등은 `기타광고`로 흡수)한 뒤 `sales_targets` 테이블에 upsert한다. 배치/컷오버 개념이
없으므로 목표를 분기·반기 단위로 갱신할 때마다 아래 명령을 재실행하면 된다.
```
node load-targets.mjs "C:\경로\target.xlsx"
```
주의: upsert만 수행하므로 파일에서 삭제되거나 하향 수정된 과거 목표 행은 자동으로 정리되지 않는다 — 목표가
줄거나 없어진 경우 재적재 후 Supabase에서 `sales_targets`를 수동으로 확인/삭제해야 한다.
