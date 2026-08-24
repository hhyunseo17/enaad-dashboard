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
              ranking, trend-portfolio-channel, detail-pivots, detail-data, kpi)
css/                       theme / layout / pivot-table
js/core/                   state, theme-system, data-loader, filters, view-router, init
js/features/               shared-helpers, detail-pivots, kpi,
                           trend-portfolio-channel, mom, agency-comp,
                           new-advertiser, upfront, ranking, bucket, detail-data
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
[CDN] xlsx, chart.js, chartjs-plugin-datalabels, IBM Plex Sans KR(+Pretendard 폴백)
[CSS] css/theme.css → layout.css → pivot-table.css
[JS]
  js/core/state.js                 전역변수·색상팔레트 (가장 먼저)
  js/core/theme-system.js          CH/mapPivotHtml/toggleTheme + Chart.register
  js/core/data-loader.js           연결·파싱·정규화 + export/유틸
  js/core/filters.js               체크박스/필터/applyFilters()
  js/features/shared-helpers.js    신규광고주 판별, 차트 모드 토글
  js/features/pivot-builder.js     피벗 엔진 + PIVOT_PRESETS (detail-pivots보다 먼저)
  js/features/detail-pivots.js     항목/부서/담당자/채널/광고주/대행사 피벗
  js/features/kpi.js               KPI 카드 + 업프론트 목표(월할)
  js/features/trend-portfolio-channel.js
  js/features/mom.js
  js/features/agency-comp.js
  js/features/new-advertiser.js
  js/features/upfront.js
  js/features/ranking.js
  js/features/bucket.js
  js/features/detail-data.js       세부데이터 탐색(자유 피벗 빌더) — 상단 전역 필터바(filteredData) 기준
  js/core/view-router.js           VIEW_CONFIG/switchView (features 참조 → features 이후)
  js/core/init.js                  DOMContentLoaded 부트스트랩 (반드시 마지막)
```
> reviewer는 이 순서를 어긴 로드(features가 core보다 먼저 등)를 오류로 잡는다.

## 테마 전환 — 세 갈래 경로 (정리 대상)
라이트/다크 전환이 한 곳이 아니라 **세 경로**로 나뉘어 있다. 색을 건드릴 때 세 곳을 모두 봐야 한다.

| 경로 | 위치 | 대상 |
|---|---|---|
| CSS 변수 | `css/theme.css` | `var(--…)`를 쓰는 모든 스타일 |
| `CH(hex)` | `theme-system.js`의 `CHART_COLOR_MAP` | Chart.js 옵션 객체 (차트 생성 시점에 평가) |
| `mapPivotHtml(html)` | `theme-system.js`의 `PIVOT_COLOR_MAP` | 피벗 렌더러가 만든 HTML **문자열**을 `innerHTML` 직전에 일괄 치환 |

**`mapPivotHtml` 주의사항**
- HTML을 인식하지 않는 단순 `split().join()`이다. 셀 *텍스트*에 같은 문자열이 있어도 치환된다.
- 키는 **대문자 6자리 hex 또는 rgba 문자열 전체**와 정확히 일치해야 한다. 같은 색이라도 표기법이 다르면 치환되지 않는다(과거 `rgba(30,58,138,0.1)`이 `#1E3A8A`와 같은 색인데 누락되던 버그의 원인).
- **`<tbody>`뿐 아니라 `<thead>`도 반드시 통과시켜야 한다.** 헤더에도 `#1E3A8A`/`#1E40AF`가 인라인으로 박혀 있다.
- 행 깊이 램프는 다크·라이트가 **같은 방향**(깊어질수록 페이지 바닥에서 멀어짐)을 유지해야 한다. 여러 깊이를 같은 값으로 접으면 라이트 모드에서 트리 계층이 사라진다.

## Sticky 첫 열과 행 깊이 색 — `!important` 금지
피벗의 행 깊이 배경은 렌더러가 **첫 번째 `<td>`에 인라인으로** 넣는다. 그런데 그 셀은 동시에
sticky 첫 열이기도 하다. 따라서 `.pivot-tree-table td:first-child`의 `background`/`color`에
`!important`를 붙이면 **인라인 깊이 색을 덮어써서 램프가 통째로 죽는다.**

- `pivot-table.css`의 `td:first-child` 배경/글자색은 `!important` 없이 둔다 — 인라인 배경이 없는
  피벗(세부데이터 등)을 위한 **불투명 fallback** 역할만 한다. sticky 열은 반드시 불투명해야 한다.
- `th:first-child`와 `.row-grand-total td:first-child`는 깊이 색과 무관하므로 `!important`를 유지한다.
- `theme.css`의 라이트 오버라이드도 같은 규칙을 따른다.

> 장기적으로는 피벗 렌더러가 인라인 hex 대신 클래스를 출력하도록 바꿔 `mapPivotHtml`과 `CH`를 함께 폐기하는 것이 목표다.


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

### `/api/sales` 응답은 컬럼 별칭(2자)을 쓴다 — 두 파일을 함께 고칠 것
`v_bonbu_sales`는 26,000행대라 응답 시간의 상당 부분이 **페이로드 바이트 수에 딸려 온다**(뷰 계산 자체는 0.2~0.3초, 클라이언트의 parse+매핑은 합계 0.1초로 무시 가능). 그런데 `select=*` 응답 21.98MB 중 **14.64MB(67%)가 행마다 반복되는 컬럼 이름**이었고 값은 7.34MB뿐이었다. 그래서 PostgREST 별칭(`select=ms:month_str,…`)으로 키를 2자로 줄이고, 프론트가 읽지 않는 5개 컬럼(`load_batch_id`/`is_bonbu`/`is_excluded`/`excluded_reason`/`raw_id`)은 아예 뺀다.

실측(8쌍 교차): 23.15MB → 12.08MB, 총 소요 2,121ms → 1,629ms(평균 23%). 페이로드는 절반이 됐으나 시간은 그만큼 줄지 않는다 — 왕복 지연과 뷰 계산이라는 고정 비용이 남는다. **회차 편차가 ±30%(Supabase 공유 인스턴스)이므로 이 수치를 다시 잴 때는 반드시 교차 반복 측정할 것.** 단발 측정은 38%로도 14%로도 나온다. 남은 1.6초는 페이로드가 아니라 왕복 자체라서, 아래 엣지 캐시로 없앤다.

- 별칭 표의 원본: `shared/supabase-proxy.mjs`의 `SALES_COLUMN_ALIASES`
- 대응 매핑: `js/core/data-loader.js`의 `mapRowFromSupabase()`
- **빌드 도구가 없어 두 파일이 상수를 공유할 수 없다.** 한쪽만 고치면 전 컬럼이 조용히 `undefined`가 되므로(금액 0, 문자열 undefined인 대시보드는 원인 추적이 어렵다) `assertSalesRowShape()`가 첫 행의 키를 검사해 에러 배너로 즉시 실패시킨다. 컬럼을 추가·변경할 때는 세 곳(별칭표·매핑·`SALES_EXPECTED_KEYS`)을 모두 손댈 것.
- `bonbu_revenue_status`(`bs`)는 이 뷰에서 항상 `'본부매출'`이라 뺄 수 있지만 **일부러 남긴다.** 모든 집계가 이 값으로 본부매출을 판정하므로(CLAUDE.md 절대원칙 1) 클라이언트가 지어내는 상수로 바꾸면 그 가드가 형해화된다.
- 나머지 세 엔드포인트(`upfront-contracts`/`targets`/`latest-batch`)는 응답이 0.3MB 미만이라 `select=*` 그대로 둔다.

### `/api/sales` 배치 단위 엣지 캐시 — 무효화 로직이 없는 것이 설계다
데이터는 ETL 컷오버 때만 바뀐다. 그래서 프론트가 `/api/sales?batch=<배치ID>`로 요청하고, 프록시가 그 URL을 키로 `caches.default`에 응답을 통째로 넣는다. **컷오버로 배치 ID가 바뀌면 URL이 달라져 새 키가 자연히 미스 나므로 무효화 코드가 아예 필요 없다.** 옛 객체는 LRU로 밀려난다.

검토 후 버린 두 안:
- **ETL이 purge 호출**: ETL이 수동 실행이라 한 번 빼먹으면 낡은 숫자를 조용히 계속 보여준다. Cloudflare API 토큰 관리도 늘어난다.
- **서버가 매 요청마다 배치 ID를 조회해 키 생성**: 캐시가 맞아도 Supabase 왕복이 하나 남아 목표치를 그 자체로 다 먹는다.

대가로 `/api/latest-batch`가 `/api/sales`보다 앞에 서게 됐다(프론트가 ID를 알아야 URL을 만든다). 그래서 거기에도 **60초 TTL**을 건다 — 배치 변경 감지가 최대 그만큼 늦어지지만 ETL이 수동이라 무해하다. `upfront-contracts`/`targets`는 병렬 그대로다.

- **`sales_targets`는 캐시하지 않는다.** 배치와 무관하게(ETL 없이) 수정될 수 있어서 배치 ID를 키로 삼으면 낡은 값이 고착된다.
- **인증이 캐시보다 앞이다.** Cloudflare Access가 Pages Function 앞단에서 검사하므로 인증된 요청만 도달하고, `caches.default`는 함수 안에서만 접근하는 서버 측 캐시다. 브라우저로 나가는 헤더는 `private`으로 바꿔 공용 프록시에 남지 않게 한다(캐시에 넣는 사본만 `public` — Cache API가 `private` 응답을 저장하지 않는다).
- **응답 헤더 `X-Edge-Cache`**(`HIT`/`MISS`/`OFF`)로 동작을 확인할 수 있다.

**되돌리는 방법 세 겹** (안쪽부터):
1. `js/core/state.js`의 `USE_EDGE_CACHE = false` — `?batch=`가 빠지고 서버도 캐시 경로를 건너뛴다(배포 한 줄).
2. Pages 환경변수 `EDGE_CACHE_DISABLED=1` — **재배포 없이 즉시**.
3. 해당 커밋 revert.

핸들러가 `env` 외에 `request`(캐시 키)와 `waitUntil`(응답 후 백그라운드 `cache.put`)을 받으므로, 시그니처를 바꿀 때는 `shared/supabase-proxy.mjs`·`functions/api/sales.js`·`functions/api/latest-batch.js`·`worker.js`를 함께 볼 것.

## 검증 (빌드 도구 없음)
- 문법: 각 js 파일 `node --check`.
- 전역 참조 무결성: 수정 파일이 참조하는 전역변수/함수가 state.js·다른 파일에 실제 존재하는지 grep 대조.
- id 참조: `getElementById('x')` ↔ HTML `id="x"` 대조, 중복 id 확인.
- onclick 참조: `onclick="fn("` ↔ `function fn` 대조.
- (선택) 스모크: 로드 순서대로 합쳐 원본과 동작 비교.
