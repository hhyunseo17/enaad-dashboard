# 아키텍처 & 파일 구조

## 분리 원칙
- **역할 단위(core/)**: 여러 기능이 공유하는 인프라. 상태·데이터·필터·테마·라우팅.
- **기능 단위(features/)**: 계산 함수를 차트/피벗/KPI가 함께 쓰는 것끼리 한 파일. "같이 수정될 일이 많은가"가 기준.
- **판단 규칙**: 계산 로직을 다른 화면과 공유하거나 하나의 기능으로 인식되면 features/에 묶는다. 여러 기능이 공유하는 인프라는 core/로 뺀다. 파일이 400줄을 넘으면 그때 쪼갠다.

## 폴더 구조
```
dashboard.html                 뼈대: DOM 구조 + <link>/<script src> 나열만
CLAUDE.md                  지도 + 대원칙
README.md                  설치/실행/배포 안내
docs/                      문서 (js/features와 1:1 매칭)
  data-rules.md  architecture.md
  features/  (mom, agency-comp, bucket, new-advertiser, upfront,
              ranking, trend-portfolio-channel, detail-pivots, kpi)
css/                       theme / layout / pivot-table
js/core/                   state, theme-system, data-loader, filters, view-router, init
js/features/               shared-helpers, detail-pivots, kpi,
                           trend-portfolio-channel, mom, agency-comp,
                           new-advertiser, upfront, ranking, bucket
functions/                 Cloudflare Pages Functions — 실제 배포(Pages)가 실행하는 경로
  addata.js  index.js  api/sales.js  api/upfront-contracts.js  api/latest-batch.js  api/targets.js
shared/supabase-proxy.mjs  Supabase 프록시 공용 로직 (functions/api/*.js + worker.js가 공유)
.claude/agents/            feature-dev, data, reviewer
worker.js / wrangler.toml  standalone Cloudflare Worker(R2 서빙 + Supabase 프록시) 설정 — 현재 미배포, 향후 Pages→Worker 전환 대비
supabase/schema.sql        Supabase 스키마 (raw_sales_rows/v_sales_normalized/v_bonbu_sales/upfront_contracts 등)
scripts/etl/               엑셀 → Supabase 적재 스크립트 (독립 Node 프로젝트, 수동 실행)
```
> **배포 방식**: 이 프로젝트는 Cloudflare Pages(Git 연동 자동배포)로 서빙된다. 정적 파일(dashboard.html/js/css)은 저장소 그대로 서빙되고, 동적 엔드포인트(`/api/*`, `/addata`)는 `functions/` 아래 파일이 처리한다. `worker.js`는 이 요청들을 실행하지 않는다 — standalone Worker 배포로 전환할 때를 위해 동일 로직을 `shared/supabase-proxy.mjs`로 공유해 둔 것뿐이다.

## 스크립트 로드 순서 (dashboard.html) — 중요
전역 스코프 공유 방식이므로 **순서가 곧 의존성**이다. dashboard.html은 아래 순서로 로드한다:
```
[CDN] xlsx, chart.js, chartjs-plugin-datalabels, Pretendard
[CSS] css/theme.css → layout.css → pivot-table.css
[JS]
  js/core/state.js                 전역변수·색상팔레트 (가장 먼저)
  js/core/theme-system.js          CH/mapPivotHtml/toggleTheme + Chart.register
  js/core/data-loader.js           연결·파싱·정규화 + export/유틸
  js/core/filters.js               체크박스/필터/applyFilters()
  js/features/shared-helpers.js    신규광고주 판별, 차트 모드 토글
  js/features/detail-pivots.js     항목/부서/담당자/채널/광고주/대행사 피벗
  js/features/kpi.js               KPI 카드 + 업프론트 목표(월할)
  js/features/trend-portfolio-channel.js
  js/features/mom.js
  js/features/agency-comp.js
  js/features/new-advertiser.js
  js/features/upfront.js
  js/features/ranking.js
  js/features/bucket.js
  js/core/view-router.js           VIEW_CONFIG/switchView (features 참조 → features 이후)
  js/core/init.js                  DOMContentLoaded 부트스트랩 (반드시 마지막)
```
> reviewer는 이 순서를 어긴 로드(features가 core보다 먼저 등)를 오류로 잡는다.


## 데이터 흐름
```
[xlsx 모드]      fetchDataHttp() → processWorkbookBuffer() → rawData[] (K2병합+업프론트파싱은 이 파일 안에서 수행)
[supabase 모드]  fetchDataSupabase() → /api/sales,/api/upfront-contracts,/api/targets(Worker 프록시)
                 → Supabase v_bonbu_sales/upfront_contracts/sales_targets (K2병합·재분류는 scripts/etl/+schema.sql에서 이미 완료)
                 → mapRowFromSupabase() → rawData[] (targets는 mapSalesTargetFromSupabase() → salesTargets[])
                 (두 경로 모두 finalizeLoadedData()로 합류: 신규광고주 인덱스 재구축 등)
filters.js       →  filteredData[]  (applyFilters() 적용)
features/*.js    →  filteredData/rawData를 읽어 차트·피벗 렌더
```
- **프론트/백 경계 = data-loader.js.** `js/core/state.js`의 `DATA_SOURCE_MODE`('xlsx'|'supabase')로 전환. 두 경로 모두 `rawData`/`filteredData` shape을 동일하게 유지하는 게 계약(contract) — features/*는 무수정.
- Supabase 접근은 반드시 `/api/*` 프록시(Pages 배포 시 `functions/api/*.js`, Zero Trust 보호 범위 안) 경유. 브라우저가 Supabase(`*.supabase.co`)에 anon key로 직접 쿼리하지 않는다.

## 검증 (빌드 도구 없음)
- 문법: 각 js 파일 `node --check`.
- 전역 참조 무결성: 수정 파일이 참조하는 전역변수/함수가 state.js·다른 파일에 실제 존재하는지 grep 대조.
- id 참조: `getElementById('x')` ↔ HTML `id="x"` 대조, 중복 id 확인.
- onclick 참조: `onclick="fn("` ↔ `function fn` 대조.
- (선택) 스모크: 로드 순서대로 합쳐 원본과 동작 비교.
