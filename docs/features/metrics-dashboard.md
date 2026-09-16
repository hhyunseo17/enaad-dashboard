# 지표 대시보드 (경쟁채널 벤치마크)

**코드**: `js/core/metrics-data-loader.js`(연결·파싱·자사매출 치환) + `js/features/metrics-dashboard.js`(매출/M-S) + `js/features/metrics-ratings.js`(CPRP/시청률/GRP + 상세표) · **화면**: 헤더 "지표 대시보드" 탭 → `metricsMain`(개요) / `metricsDetail`(File1 상세)

## 개요
광고전략팀이 정기 수신하는 외부 리포트 2종을 KT ENA 내부 매출과 나란히 벤치마킹하는 화면. 기존 매출 대시보드(`main` 이하 15개 뷰)와 완전히 분리된 두 번째 데이터셋·컨트롤로 동작한다 — `selectedYears`/`selectedMonths`/`revenueBasisMode`(state.js)를 공유하지 않고, 이 탭 전용 상태(`metricsSelectedYear` 등, state.js 하단 별도 블록)를 쓴다.

## 데이터 소스 — R2가 아니라 Supabase (2026-09-15 전환)
원래 계획은 `addata.xlsx`와 같은 R2 고정 키+Pages Function 프록시+클라이언트 SheetJS 파싱이었다(당시 "지금은 R2 유지" 결정도 이 문서에 있었다). 그런데 **이 Cloudflare Pages 프로젝트에서 R2 버킷 바인딩이 원인 불명으로 전혀 붙지 않는 문제**가 있었다 — 대시보드에 바인딩을 정확히 추가하고, 삭제 후 재생성하고, 이름을 아예 새로 만들어도(`TEST_BUCKET`) `context.env`에 안 잡혔다(반면 `SUPABASE_URL` 같은 일반 텍스트/Secret 변수는 정상 작동 — R2 바인딩만의 계정/프로젝트 차원 문제로 보임). 원인을 못 찾아 R2 경로를 포기하고 Supabase로 옮겼다.

| 소스 | 테이블 | ETL | API |
|---|---|---|---|
| File1: 경쟁채널 지표 현황 | `competitor_ratings` | `scripts/etl/load-competitor-data.mjs` | `/api/competitor-ratings` |
| File2: 매체별 광고비 raw | `competitor_revenue` | (같은 스크립트) | `/api/competitor-revenue` |

- **적재**: `node scripts/etl/load-competitor-data.mjs <File1.xlsx> <File2.xlsx>` — File1/File2를 wide→long 변환·채널명 정규화까지 마친 뒤 두 테이블에 upsert(unique key: ratings=`year,index_mode,metric_code,channel,month`, revenue=`channel,year,month`). `sales_targets`(`load-targets.mjs`)와 같은 패턴 — 배치/컷오버 없음, 리포트 갱신 때마다 재실행. 파일에서 사라진 과거 행은 upsert만으로는 안 지워진다(수동 확인 필요, load-targets.mjs와 동일한 한계).
- **API**: `functions/api/competitor-ratings.js`/`competitor-revenue.js` → `shared/supabase-proxy.mjs`의 `handleCompetitorRatingsRequest()`/`handleCompetitorRevenueRequest()` → `proxyView(env, 'competitor_ratings'|'competitor_revenue')`(다른 `/api/*`와 같은 PostgREST 프록시 함수, 페이지네이션 포함). `requireAuth`가 아니라 `requireMetricsAccess`를 쓴다(로그인만으로 부족 — 이메일 허용목록, 아래 "접근 제한" 절).
- **테이블은 작아서**(2만/8천행대, `v_bonbu_sales`의 26,000행과 비교해도 비슷한 규모지만 컬럼 수가 훨씬 적다) 별도 뷰나 컬럼 별칭 단축 없이 `select=*` 그대로 쓴다.
- Supabase 행은 snake_case(`operator_major` 등)로 오므로 `js/core/metrics-data-loader.js`의 `fetchMetricsDataHttp()`가 camelCase(`operatorMajor` 등)로 필드명만 바꿔준다 — 그 외 가공(정규화·번호 제거·wide→long)은 전부 ETL 쪽에서 이미 끝난 채로 들어온다. 클라이언트에는 이제 SheetJS 파싱이 없다.
- R2 기반 구버전 코드(`functions/competitor-ratings.js`/`competitor-revenue.js`, `parseCompetitorRatingsWorkbook()`/`parseCompetitorRevenueWorkbook()`)는 삭제했다 — R2 바인딩 문제가 이 프로젝트 자체의 문제라 "안전망"으로 남겨둘 이유가 없었다(작동한 적이 없는 경로).

**지연 로딩**: 부팅 시(`init.js`)가 아니라 "지표 대시보드" 탭을 처음 열 때 `fetchMetricsDataHttp()`가 1회 호출된다(`renderMetricsDashboard()`가 매번 부르지만 진행 중/완료된 fetch가 있으면 그 프라미스를 그대로 돌려주므로 idempotent). `rawData`(메인 매출)가 아직 없는 극단적인 경우엔 "매출 데이터 로딩 중" 메시지를 띄우고 1.5초 후 재시도한다.

## ENA 자사매출 치환 — "왜 파싱 시점에 하는가"
File2·File1 어느 쪽도 ENA 자신의 수치는 외부 조사기관 추정치라 내부 매출보다 정확도가 떨어진다. 그래서 **파싱 직후, 렌더 이전에** `rebuildMetricsSubstitution()`가 File2의 KT ENA 관련 행만 `computeEnaMonthlyRevenue()` 결과로 덮어쓴다:
- `metricsRevenueDataOriginal` — 파싱 원본. 절대 손대지 않는다(캐시).
- `metricsRevenueData` — 파생본. KPI·차트·피벗이 전부 **이 배열 하나만** 읽는다(소스가 하나로 통일).

치환 대상은 두 종류:
1. **채널그룹 `KT ENA` 자기참조 총합 행**(`channel === channelGroup`) — 사업자 비교용. `computeEnaMonthlyRevenue(y, m)`(채널필터 없음, `KT_ENA_FAMILY_CHANNELS` 10개 전체 합).
2. **개별 채널 `ENA` 행** — 대표채널 비교용. `computeEnaMonthlyRevenue(y, m, 'ENA')`.

렌더 시점에 치환하지 않는 이유: 취급고/회계 토글마다, 또는 KPI·5개 차트·상세표마다 매번 다시 계산하면 (a) 토글 타이밍에 따라 화면 조각마다 다른 값을 잠깐 보여줄 수 있고 (b) 계산 로직이 여러 곳에 흩어져 한쪽만 고치는 버그가 나기 쉽다. 토글이 바뀔 때 한 번만 `metricsRevenueData`를 다시 만들면 그 뒤로는 전부 단순 읽기다.

**⚠ 검증 불가 지점**: File2 `변환용` 시트가 실제로 채널그룹 자기참조 총합 행을 포함하는지 샘플 파일이 없어 확인하지 못했다. `rebuildMetricsSubstitution()`은 그런 행이 없으면 월별로 합성해서 추가하므로 KT ENA는 항상 안전하지만, **경쟁사 채널그룹은 이 보장이 없다** — `metricsGroupRevenueMap()`(metrics-dashboard.js)이 자기참조 행이 있으면 그것을, 없으면 그 그룹의 세부 채널 합을 쓰는 폴백을 갖고 있다(더블카운트 방지). 실 파일로 반드시 교차검증할 것.

## 자사 매출기준 — 버튼은 이 탭에도 있지만 메인 대시보드와 전역 상태를 공유 (2026-09-15 변경)
원래 plan은 이 탭 전용 `metricsBasisMode` 토글(메인의 전역 `revenueBasisMode`와 완전 분리)이었다. 처음엔 토글 자체를 없앴었으나(버튼을 지우고 항상 전역값만 읽게 함), **사용자가 다시 정정**: "취급고를 누르면 매출 대시보드의 취급고 숫자를, 회계를 누르면 회계 숫자를 가져와야 한다" — 버튼 자체는 이 탭에도 있어야 하고, 눌렀을 때 숫자가 바뀌어야 한다는 것. "KT ENA/ENA 채널 매출은 매출 대시보드에 있는 숫자를 그대로 가져와 타사와 더하는 개념"이라는 원래 취지는 유지하되, **버튼은 이 탭에 두고 그 버튼이 전역 상태를 직접 바꾸는 방식**으로 최종 확정:
- 컨트롤바 Row1에 "매출 기준"(취급고/회계) 버튼이 있다(`#btnMetricsBasisPerformance`/`#btnMetricsBasisAccounting`). `onclick="setMetricsRevenueBasis(mode)"`(metrics-dashboard.js)가 내부적으로 `js/core/data-loader.js`의 `setRevenueBasis(mode)`를 그대로 호출한다 — 전역 `revenueBasisMode`를 바꾸고, 메인 대시보드 쪽 버튼 active 상태·`updateMonthPillAvailability()`·`applyFilters()`까지 전부 같이 갱신된다(단, `applyFilters()`는 `currentView`가 `metricsMain`이면 아무 렌더 분기에도 안 걸려 안전하게 no-op — `filteredData`만 새로 계산해 둔다). 그 다음 이 탭 자신의 버튼 active 상태와 `renderMetricsDashboard()`를 마저 호출한다.
- 반대 방향(메인 대시보드 버튼으로 바꾼 뒤 이 탭에 들어오는 경우)도 어긋나지 않는다 — `renderMetricsDashboard()`가 매 렌더마다 최신 `revenueBasisMode` 기준으로 이 탭 버튼의 active 클래스를 다시 맞춘다.
- `computeEnaMonthlyRevenue(year, month, channelFilter?)`(`metrics-data-loader.js`)와 그 안의 `matchesMetricsBasis(r)`가 전역 `revenueBasisMode`(state.js)를 직접 읽는다. `matchesMetricsBasis()`는 그래도 `kpi.js`의 `matchesCurrentBasis()`와 같은 규칙(취급고=실적만/회계=실적+회계조정)을 복제한 별도 함수로 유지한다 — core(`metrics-data-loader.js`)가 features(`kpi.js`)의 함수를 직접 호출하면 레이어가 거꾸로 의존하게 되기 때문(스크립트 로드 순서 관례 위반).
- `rebuildMetricsSubstitution()`(인자 없음)이 `renderMetricsDashboard()`의 매 렌더마다 다시 호출된다 — 어느 쪽 버튼으로 바뀌었든, 또는 이 탭에서 다른 컨트롤을 조작해 재렌더가 돌 때마다 항상 최신 값 기준으로 KT ENA 부분이 재계산된다.

## M/S(시장점유율) 공식
```
M/S(%) = KT ENA 사업자 총합(치환값) ÷ "범위" 토글이 가리키는 시장 총매출 × 100
```
- **범위**: 지상파+유료방송(전체) / 유료방송(기본, `사업자대분류 === '유료방송'`) / 케이블(`사업자중분류 === '케이블'`). `metricsScopeMatchRow()`(metrics-dashboard.js)가 File2 원본 컬럼을 그대로 필터링 — 별도 재분류 없음.
- 분모도 그 범위 안 KT ENA 항목은 치환값으로 넣은 뒤 합산한다(`computeEnaPayTvMarketShare()`가 `metricsGroupRevenueMap()` 결과를 그대로 합산).
- M/S 트렌드차트는 %선이 아니라 **누적(stacked) 막대**다 — 월별 막대 하나 = 범위 시장 총매출, "KT ENA"(강조색)+"기타"(중립색) 두 구간, % 라벨은 ENA 구간 위에 직접 표기.

## 사업자 매출의 진짜 출처 — File2 합산이 아니라 File1 "01.방송사업자 광고매출" (2026-09-15)
"사업자 비교" 모드(M/S·시장규모·매출 트렌드/랭킹)의 매출은 **File2 채널그룹 합산이 아니라 File1의 "01.방송사업자 광고매출" 값을 직접 쓴다** — File1이 사업자 단위로 이미 집계해 보고하는 수치가 있는데 File2 세부 채널을 다시 합산하는 건 이중작업이고 값도 미세하게 어긋날 수 있어서(사용자 요청으로 전환). **"대표채널 비교" 모드(개별 채널 단위)는 계속 File2를 쓴다** — File1엔 채널 단위 세부 매출이 없다(02.채널별 광고매출은 여전히 안 쓴다).

- **적재**: ETL(`load-competitor-data.mjs`)이 이제 metric_code `01`도 `competitor_ratings`에 적재한다(`02`만 계속 제외). 단위는 다른 지표와 동일하게 변환 없이 원본(백만원) 그대로 저장 — CPRP의 ×1,000 관례와 같은 이유.
- **주입 지점**: `js/core/metrics-data-loader.js`의 `injectOperatorRevenueFromRatings()` — fetch 직후, `rebuildMetricsSubstitution()` 이전에 1회 호출. File1의 사업자별 매출 행을, File2 쪽 **채널그룹 자기참조 행(channel===channelGroup)**으로 만들어 `metricsRevenueDataOriginal`에 주입(있으면 교체, 없으면 추가)한다. `metricsGroupRevenueMap()`(metrics-dashboard.js)이 원래 "자기참조 행 우선" 로직을 갖고 있어서, 이 주입 하나만으로 M/S·랭킹·트렌드·KPI 전부가 자동으로 File1 기반 값을 쓰게 된다(다른 코드 변경 없음).
- **이름 조인**: File1 사업자명이 File2 채널그룹명과 5곳 갈린다(`RATINGS_OPERATOR_TO_REVENUE_GROUP`, metrics-data-loader.js) — CJ ENM→CJENM, MBC Plus→MBC PLUS, MBC(전국)→MBC, SBS 계열→SBS미디어넷, SBS(민방포함)→SBS. File1엔 사업자대분류/중분류(범위 토글용)가 없어서 이 조인으로 File2 쪽 분류를 그대로 가져온다 — 대응하는 File2 그룹이 없는 사업자는 조용히 건너뛰고 기존 File2 합산 폴백을 쓴다.
- **KT ENA는 영향 없음**: 여기서 주입된 KT ENA 행도 `rebuildMetricsSubstitution()`이 곧바로 내부 실측치로 덮어쓴다 — 원본이 File1이든 File2든 결과는 항상 `computeEnaMonthlyRevenue()` 값.
- **CPRP·채널시청률·eq-GRPs는 이 변경과 무관** — 고정 대표채널 목록(아래 "비교단위" 절 참고)만 쓴다. 사업자 매출 소스 변경은 오직 **매출/M-S 계산**에만 영향을 준다.

## CPRP·시청률·eq-GRPs — File1 원본을 그대로 쓰는 이유
`11.시청률 1%당 매출(억원)`은 File1이 자체 계산해 둔 값을 그대로 쓴다(내부 매출로 재계산하지 않는다). 분자(매출 추정치)만 내부값으로 바꾸면 분모(채널시청률, ENA 단일 채널 기준)와 스코프가 안 맞아 오히려 왜곡된다. CPRP·GRP·시청률도 동일하게 "File1 원본" 취급.

**참고(향후 옵션 메모)**: `CPRP = 채널 매출 ÷ 15초 GRPs`, `시청률 1%당 매출 = 채널 매출 ÷ 채널 시청률`. 둘 다 분자가 "채널 매출"이라 나중에 ENA만 내부 매출로 재계산해 끼워 넣는 것도 공식상 가능하지만, 1차 버전은 File1 원본 그대로다.

- **CPRP는 원 단위로 표기** — File1 원본 컬럼은 "천원" 단위라 화면에 낼 때 ×1,000 한다. `metricsRatingsData`의 `value` 필드 자체는 천원 단위 그대로 남아 있다(데이터 계층은 변환하지 않는다 — plan 항목 3) — 그래서 곱셈은 **렌더 코드에만** 있다(KPI 카드 `metricsKpiCprpValue`, 미니 트렌드차트, 상세표 `metricsFormatRatingValue()` 세 곳 전부).
- **채널시청률은 소수점 셋째 자리까지** 표기(예: 0.684%) — File1 정밀도를 살린다.
- **일평균/프라임타임 토글**(`metricsIndexMode`, File1의 `INDEX` 컬럼)은 CPRP·채널시청률·eq-GRPs에만 영향을 준다. **M/S와 시청률 1%당 매출은 이 토글과 무관** — M/S는 File2 파생값이라 애초에 INDEX 축이 없고, 시청률 1%당 매출은 KPI 렌더 코드가 `indexMode`를 무시하고 항상 `'전체'`로 고정 조회한다(`renderMetricsRatingsKpis()`의 `rprCode` 조회 참고).

## 대표채널 ENA 단일값을 쓰는 이유
File1(`변환용취합`)은 ENA/ENA DRAMA/ENA PLAY/ENA STORY 4개 개별 채널만 있고 "KT ENA 합계" 행이 없다. DRAMA/PLAY/STORY는 보조 채널이라 경쟁사와 비교하는 의미가 약해, CPRP·채널시청률·eq-GRPs·시청률1%당매출은 **대표채널 "ENA" 값만** 쓴다(`ENA_REPRESENTATIVE_CHANNEL`, metrics-data-loader.js).

## 비교단위 — 사업자 비교 / 대표채널 비교
- **사업자 비교(기본)**: File2 `채널그룹` 기준 총합. ENA는 위 ① 치환값.
- **대표채널 비교**: File2 `채널` 기준 개별 브랜드. ENA는 위 ② 치환값.
- 선택 UI는 "① 사업자" → "② 채널" 2단 캐스케이딩 체크박스 팝오버(`.multi-dropdown` 패턴 재사용, `toggleMultiDropdown()`은 `data-loader.js`의 기존 범용 함수를 그대로 쓴다). ②는 ①에서 캐스케이딩되며, 사업자 비교 모드에서는 비활성화되고 "전체(사업자 총합)"로 표시된다.
- **File1(경쟁채널 지표 현황)은 채널그룹 개념이 없다** — 그래서 CPRP/채널시청률/eq-GRPs 미니차트·상세표 티저는 위쪽 ①사업자/②채널 선택과 완전히 무관하게, `METRICS_RATINGS_FIXED_CHANNELS`(metrics-dashboard.js)라는 고정 목록만 보여준다: `ENA, tvN, JTBC, SBS Plus, MBC every1, KBS Joy` — ENA는 항상 대표채널. (**2026-09-15 변경**: 원래는 ①사업자 선택을 `OPERATOR_TO_RATINGS_CHANNEL_ALIAS` 매핑으로 따라가게 했었으나, CJENM 사업자가 File1에서 "CJ ENM"이라는 집계성 채널로 잡혀 tvN 같은 실제 채널명이 아니라 사용자에게 낯설어 보였다 — 그래서 사업자 선택을 아예 안 따르고 눈에 익은 대표채널 고정 목록으로 바꿨다. 목록 조정은 그 상수만 고치면 된다.) `metricsResolveRatingsChannelName()`이 대소문자 차이(예: "SBS PLUS" vs "SBS Plus")를 흡수해 실제 File1 표기를 찾아준다. (참고: `metricsDetail` 전체 상세표는 이 제한과 무관하게 File1의 모든 채널을 그대로 보여준다 — "상세" 드릴다운의 의도된 동작.)

## 상세표(`metricsDetail`) — 왜 `renderPresetPivot()`을 그대로 안 쓰는가
`js/features/pivot-builder.js`의 `PIVOT_PRESETS.metricsDetail`에 등록은 돼 있지만(`togglePvRowNode`/`togglePvColNode`/`pvConfigFor` 같은 공용 상호작용을 물려받기 위해), 실제 렌더는 `renderMetricsDetailPivot()`(metrics-ratings.js)이라는 자체 함수가 맡는다.

이유: `pvRenderRows()`/`pvFormatCell()`(엔진 공용 렌더러)은 모든 셀 값을 **금액**으로 가정해 무조건 ÷1,000,000 한다. File1 지표는 단위가 제각각이라(%, 원, GRP, 억원, 건수…) 그대로 통과시키면 숫자가 깨진다. 그래서:
- `pvBuildTree`/`pvBuildVisibleColumns`/`pvRenderColumnHeaderRows`(전부 필드명 문자열 기반, 금액 가정이 없는 범용 함수)는 그대로 재사용.
- 행 렌더(`metricsRenderDetailRows()`)와 셀 포맷(`metricsFormatRatingValue()`)만 자체 작성 — 1단계 행 값(지표명)에 따라 %/원/GRP/억원 중 무엇으로 찍을지 결정한다. 정확한 단위 매핑은 라벨 텍스트 부분일치로 판별하며(`metricLabel.includes('CPRP')` 등), **실 샘플로 검증 필요**(아래 "확인 필요" 참고).
- `renderPresetPivot()`은 그래도 `preset.dataSource` 접근자를 하나 얻었다(기존 6개 프리셋은 미지정 시 `filteredData` 기본값 유지) — 향후 이 엔진을 File1에도 완전히 통합하려면(포맷 후크 추가 등) 그 지점에서 이어가면 된다.
- 1차 버전은 **드래그앤드롭 빌더 패널이 없는 정적 트리 표**다(행 축 `metricLabel → channel` 고정, 열 축 `year → month` 고정). 열 헤더의 연도 접기/펼치기(`togglePvColNode`)는 동작하지만, 열 헤더 클릭 정렬(`pvSortByColumn`)은 값은 바뀌어도 내 행 렌더러가 그 정렬을 반영하지 않는다(알려진 제약, 아래 참고).

## 핵심 함수 지도
| 함수 | 파일 | 역할 |
|---|---|---|
| `fetchMetricsDataHttp()` | metrics-data-loader.js | `/api/competitor-ratings`·`/api/competitor-revenue` 병렬 fetch(idempotent 캐시) + snake_case→camelCase 매핑 |
| `parseCompetitorRatingsWorkbook()` / `parseCompetitorRevenueWorkbook()` | scripts/etl/load-competitor-data.mjs | SheetJS 세부사항이 갇힌 단일 지점, wide→long 변환(ETL 쪽으로 이전, 클라이언트엔 더 이상 없음) |
| `computeEnaMonthlyRevenue(y, m, channelFilter?)` | metrics-data-loader.js | rawData에서 ENA 계열 월매출 재계산(전역 revenueBasisMode 직접 읽음) |
| `rebuildMetricsSubstitution()` | metrics-data-loader.js | `metricsRevenueDataOriginal` → `metricsRevenueData` 파생(KT ENA만 치환), 매 렌더마다 재호출 |
| `metricsGroupRevenueMap(period, scopeMode)` | metrics-dashboard.js | 채널그룹별 월 매출 총합(자기참조 행 우선, 없으면 세부채널 합) |
| `computeEnaPayTvMarketShare(y, m, scopeMode)` | metrics-dashboard.js | M/S 공식 그대로(plan에 명시된 함수명) |
| `metricsEnsureDefaultSelections()` | metrics-dashboard.js | 최초 렌더 시 연도/①사업자 기본값 채움(사용자가 고른 뒤로는 건드리지 않음) |
| `renderMetricsDashboard()` | metrics-dashboard.js | `VIEW_CONFIG.metricsMain.render()` — 지연 fetch, 로딩/에러 상태, 컨트롤·KPI·차트 전부 오케스트레이션 |
| `renderMetricsRevenueKpis()` | metrics-dashboard.js | KPI① 시장규모, KPI② M/S |
| `renderMetricsRatingsKpis()` | metrics-ratings.js | KPI③ CPRP, KPI④ 채널시청률, KPI⑤ 시청률1%당매출 |
| `renderMetricsMarketShareChart()` | metrics-dashboard.js | M/S 트렌드(누적 막대) |
| `renderMetricsRevenueTrendChart()` / `renderMetricsRevenueRankingChart()` | metrics-dashboard.js | 매출 트렌드(라인) / 랭킹(가로막대) |
| `renderMetricsMiniTrendChart()`(+4개 래퍼) | metrics-ratings.js | CPRP/채널시청률/eq-GRPs/광고주수 미니 트렌드(2026-09-15: `indexMode`를 인자로 받도록 변경 — 광고주수는 File1에 '전체'뿐이라 토글과 무관하게 고정 조회해야 해서) |
| `renderMetricsDetailPivot()` | metrics-ratings.js | `metricsDetail` 상세표 |

## 규칙/주의
- 전역 상태는 `state.js` 하단 "지표 대시보드 전용 UI 상태" 블록만 쓴다(`metricsSelectedYear`/`metricsIndexMode`/`metricsScopeMode`/`metricsCompareUnit`/`metricsSelectedOperators`/`metricsSelectedChannels`/`expandedMetricsDetailPivot`/`expandedMetricsDetailYearColumns`). 메인 대시보드 전역과 이름이 비슷해도 절대 같은 변수가 아니다.
- 차트 색은 `theme-system.js`의 `CH()`/`RC()`/`seriesColor()`만 쓴다. 5대분류(`catColor()`)는 이 탭의 축(사업자/채널)과 무관하므로 쓰지 않는다 — ENA는 `RC('curr')`(강조), 나머지는 `seriesColor(i)`(서수 팔레트) 또는 `RC('ref')`(중립, 랭킹차트 비선택 항목).
- 금액: KPI/차트는 억원, 상세표는 지표 단위별로 다르다(백만원 고정 아님 — 위 "왜 renderPresetPivot()을 그대로 안 쓰는가" 참고, CLAUDE.md 절대원칙 8의 "피벗=백만원" 규칙이 이 표에는 그대로 적용되지 않는 유일한 예외).
- `js/core/filters.js`는 건드리지 않는다 — 이 탭의 필터링은 전부 `metricsScopeMatchRow()`/`metricsGroupRevenueMap()` 등 이 파일들 자체 함수로 처리한다.

## 접근 제한 — 롤아웃 초기 이메일 허용목록
다른 `/api/*`·`addata.js`는 로그인만 하면 전원 접근 가능하지만, 이 기능(File1/File2)만 예외로 소수(현재 1인, `hyunseo@ktena.co.kr`)에게만 공개한다.

- **실제 차단(서버)**: `shared/supabase-proxy.mjs`의 `requireMetricsAccess(env, request)` — JWT를 검증한 뒤 `email`이 허용목록에 없으면 403. 허용목록은 Cloudflare Pages 환경변수 `METRICS_ALLOWED_EMAILS`(콤마 구분)로 재배포 없이 갱신하며, 미설정 시 코드 내 기본값(`hyunseo@ktena.co.kr`) 하나만 허용한다. `handleCompetitorRatingsRequest()`/`handleCompetitorRevenueRequest()`(shared/supabase-proxy.mjs) 둘 다 맨 앞에서 호출 — `functions/api/competitor-ratings.js`/`competitor-revenue.js`가 그 얇은 진입점이다.
- **UI 숨김(클라이언트)**: `js/core/auth.js`의 `METRICS_ALLOWED_EMAILS` 배열 + `applyMetricsAccessGate()` — `ensureAuthenticated()`가 로그인 세션 확정 후 호출해 허용되지 않은 이메일이면 헤더의 `#dashboardTabMetrics` 탭 버튼 자체를 숨긴다. 이건 UX일 뿐이라 콘솔로 우회 가능 — 실제 방어선은 위 서버 쪽 403.
- **두 목록은 반드시 같이 갱신한다.** 어긋나면 "탭은 보이는데 데이터는 403 에러"(auth.js만 갱신) 또는 "탭은 없는데 URL로 들어가면 실제로는 허용됨"(supabase-proxy.mjs만 갱신) 같은 불일치가 생긴다.
- **사람 추가/제거 절차**: ① Cloudflare Pages 대시보드 → 환경변수 `METRICS_ALLOWED_EMAILS`에 이메일 추가(콤마 구분, Production/Preview 둘 다) → ② `js/core/auth.js`의 `METRICS_ALLOWED_EMAILS` 배열도 같은 목록으로 수정 후 재배포. 팀 전체 공개로 전환할 때는 이 절 전체(서버 체크 호출 + 클라이언트 숨김 로직)를 제거하면 된다 — 다른 `/api/*`와 동일하게 "로그인만 하면 접근 가능"으로 돌아간다.
- 클라이언트 fetch(`js/core/metrics-data-loader.js`의 `fetchMetricsDataHttp()`)는 `getAuthorizationHeader()`(auth.js)로 JWT를 `Authorization: Bearer` 헤더에 실어 보낸다 — 이게 없으면 서버 쪽 `requireMetricsAccess()`가 401로 막는다.

## 롤백 스위치
`js/core/state.js`의 `METRICS_DASHBOARD_ENABLED`(기본 `true`) — `DATA_SOURCE_MODE`와 같은 패턴. 신규 기능 특성상 배포 후 문제(렌더 오류, 잘못된 수치 등)가 생기면 **이 한 줄을 `false`로 바꾸는 배포만으로 즉시 롤백**할 수 있다(코드/커밋을 되돌릴 필요 없음):
- `js/core/auth.js`의 `applyMetricsAccessGate()`가 이메일 허용목록과 별개로 이 값을 확인 — `false`면 허용목록에 있는 사람에게도 헤더 탭을 숨긴다.
- `js/core/view-router.js`의 `switchView()`가 `family === 'metrics'`인 뷰(= `metricsMain`/`metricsDetail`) 진입 자체를 막고 `main`으로 돌려보낸다 — 탭이 숨겨진 상태에서도 해시(`#metricsMain`)로 직접 들어오는 경우까지 막는 용도.
- 어느 쪽도 실제 데이터 접근(File1/File2)을 막지는 않는다 — 그건 여전히 서버 쪽 `requireMetricsAccess()`(위 절) 몫이다. 이 스위치는 어디까지나 **화면(UI) 롤백**용이고, 데이터 자체를 잠그려면 이메일 허용목록을 비우거나 `METRICS_ALLOWED_EMAILS` 환경변수를 빈 값으로 바꿔야 한다.

## 실 샘플로 검증 완료 (2026-09-15)
`(IMC 실적기준) ENA 경쟁채널 지표 현황 (260910 기준).xlsx` / `(IMC 실적기준) 매체별 광고비 raw (8월 마감, 9월 스타트).xlsx` 두 실 파일로 프로덕션 코드를 직접 돌려 검증(Node에 `xlsx` 패키지로 실행, `scripts/etl`의 기존 관례와 동일한 방식) — 아래 항목은 전부 **버그로 확인되어 수정 완료**됐다. 재발 방지용으로 남겨둔다.

1. **[치명적, 수정됨] File2 연월 컬럼 포맷이 가정과 달랐다.** 계획 당시엔 `"2026-07"`(YYYY-MM)로 가정했지만 실제 헤더는 `"2026-07-01"`(항상 일=01, 날짜 서식 셀)이다. 기존 `YM_COL_REGEX`(`/^(\d{4})-(\d{2})$/`)는 이 형식에 전혀 매치하지 않아 **File2 파싱이 통째로 빈 배열을 반환**했다(매출·M-S·랭킹·트렌드 전부 빈 화면). `metrics-data-loader.js`의 정규식을 `-\d{2}$` 트레일링 매치로 수정.
2. **[치명적, 수정됨] "채널시청률" 라벨 검색이 엉뚱한 지표(08)에 걸렸다.** File1의 실제 "구분" 값은 03="채널 시청률"(공백 있음), 08="채널시청률 1%당 eq-GRPs"(공백 없음, "채널시청률"로 시작) — 계획 당시 검색어 `'채널시청률'`(공백 없음)이 부분일치로 03이 아니라 08에 먼저 걸렸다. `metricsFindMetricCode()`에 `exact` 옵션을 추가해 rating 검색만 완전일치로 바꿔 해결(`js/features/metrics-dashboard.js`/`metrics-ratings.js`). 같은 이유로 상세표 셀 포맷터(`metricsFormatRatingValue()`)도 GRP 체크를 시청률 체크보다 앞에 두도록 순서를 바꿨다(안 그러면 08 행이 %로 잘못 찍힘).
3. **eq-GRPs는 정말 두 지표였다** — 06="누적 eq-GRPs"(연간 누적치), 07="1일 eq-GRPs"(월별 1일 평균). "INDEX(전체/프라임타임) 중복 아닌지" 우려가 있었는데 아니었다 — CPRP·채널시청률처럼 "1일" 단위 성격인 07을 GRP 트렌드에 쓴다(06은 상세표에서만 조회 가능).
4. **"시청률 1%당 매출" 라벨도 공백 위치가 달랐다**("1%당"이 아니라 "1% 당") — 검색·비교 전에 공백을 전부 제거하도록 `metricsFindMetricCode()`를 고쳐서 이런 공백 드리프트에 전반적으로 강해졌다.
5. **File1 안에서도 같은 방송사가 표기 두 가지로 쪼개져 있었다** — "MBC(전국)"/"MBC 전국", "SBS(민방포함)"/"SBS (민방포함)". `parseCompetitorRatingsWorkbook()`에 `canonicalizeRatingsChannelName()`을 추가해 파싱 시점에 하나로 합친다(안 그러면 같은 채널의 월별 데이터가 두 이름으로 쪼개져 최신월 조회·트렌드에서 일부 달이 빠진다).
6. **`metricsRatingsChannelSelection()`의 "사업자명 = File1 채널명" 가정이 5개 사업자에서 깨졌다** — File2 채널그룹명 `MBC`/`SBS`/`MBC PLUS`/`CJENM`/`SBS미디어넷`이 File1 채널명과 표기가 달라(괄호·공백·대소문자) 전부 매칭 실패, "사업자 비교" 모드에서 CPRP/채널시청률/GRP 미니차트·상세표가 이 5개 사업자에 대해 조용히 비었다. `OPERATOR_TO_RATINGS_CHANNEL_ALIAS` 별칭 맵으로 5개 전부 수정(`metrics-dashboard.js`) — 단 **SBS미디어넷→"SBS Plus"는 근사치**다(File1에 사업자 단위 행이 없어 대표 서브채널 하나로 대신함, 실제로 SBS미디어넷 전체를 대표하는 값인지는 아님).
7. **File2에 KT ENA 자기참조 총합 행은 실제로 없다** — 우려했던 대로였고, 기존 합성 로직(`rebuildMetricsSubstitution()`)이 정상 동작함을 실 데이터로 확인.

## Supabase 전환 후 실 데이터로 추가 확인된 버그 (2026-09-15, 로그인해서 실제로 띄워본 뒤 발견)
8. **[치명적, 수정됨] File2 매출 수치가 백만원 단위인데 원 단위로 그대로 적재됐다.** ENA 자사매출 치환값(`computeEnaMonthlyRevenue()`, `rawData.amount` 기준 — 원 단위)과 100만 배 차이가 나서 M/S가 항상 KT ENA 100%로 나오고 경쟁사 매출이 사실상 0으로 묻혔다. `scripts/etl/load-competitor-data.mjs`에서 `revenue`에 `×1,000,000`을 적용해 원 단위로 통일 후 재적재.
9. **[수정됨] File1이 아직 안 걷힌 미래 달을 값 0으로 미리 채워둔 placeholder 행을 갖고 있었다** — "260910 기준" 리포트인데 10~12월 CPRP·채널시청률이 정확히 0. "최신 달"을 고르는 로직(`metricsRatingsLatestPeriod()`, 미니 트렌드차트)이 이 0을 진짜 데이터로 오인해 KPI가 전부 0/미니차트 끝부분이 0으로 찍혔다. 두 곳 다 `value !== 0` 조건을 추가해 0-달을 "미보고"로 건너뛰도록 수정.
10. **월 선택 UI가 누락돼 있었다** — plan에 "연도·월 선택 UI 재사용"이 명시돼 있었는데 연도만 구현되고 월이 빠져 있었음. `metricsSelectedMonths`(state.js) + `#metricsMonthPills`(매출 대시보드 `#monthPills`와 동일 마크업/패턴, `nextPillSelection()`/`isAdditiveClick()` 재사용) 추가 — `metricsMonthsInYear()`(M/S·매출 트렌드차트) · `metricsRatingsLatestPeriod()`(KPI 3·4·5) · 미니 트렌드차트 월 목록에 전부 반영.
11. **[치명적, 수정됨] `injectOperatorRevenueFromRatings()`가 File1의 placeholder 0행까지 그대로 주입했다** — 8번과 같은 File1 미보고월=0 문제인데, 이번엔 CPRP/시청률이 아니라 **매출 쪽**을 오염시켰다: metric_code `01`(사업자 매출)의 0행이 KT ENA뿐 아니라 **모든 사업자**의 채널그룹 자기참조 매출로 주입되면서, `metricsRevenueData`에 실제 데이터 없는 미래월(예: 10~12월)이 "매출 0인 진짜 월"처럼 섞여 들어갔다 — 그 결과 M/S 트렌드 라인이 10~12월에 0.0%로 평평하게 이어지는 등 없는 달이 있는 것처럼 보였다. `injectOperatorRevenueFromRatings()`의 필터에 `r.value !== 0`을 추가해 해결(9번과 동일한 조건, 적용 지점만 다름).
12. **M/S 트렌드 카드를 분리하며 왼쪽 "시장규모" 차트가 위쪽 "범위" 토글을 무시하고 있었다** — 지상파/종편/케이블 3개를 범위와 무관하게 항상 다 그렸는데, 사용자가 "유료방송으로 조회 중인데 지상파까지 나오는 게 이상하다"고 지적 — `metricsScopeCategoriesForMode()`를 추가해 "범위" 토글(all→3개/payTv→종편+케이블/cable→케이블만)에 맞춰 카테고리 자체를 좁히도록 수정, 카드 제목도 동적으로 반영. 같은 요청으로 (a) 스택 막대 맨 위에 월별 합계 데이터 라벨 추가(`trend-portfolio-channel.js`의 기존 "합계 라벨은 마지막 계열에만" 패턴 재사용), (b) 카드 헤더에 "금액/비중" 토글(`metricsMarketByScopeMode`, state.js) 추가 — "비중"은 같은 카테고리 구성을 월별 100% 누적으로 바꿔 범위 안 구성비 변화를 보여준다. 이 절 위쪽의 `grid-zone3`(65%/35% 비대칭 레이아웃)를 두 섹션 다 `grid-zone5`(50%/50%)로도 수정 — 원래 "절반씩"을 의도했는데 잘못된 CSS 클래스를 복사해 65/35로 나오고 있었다.
13. **KPI 카드가 5장→6장으로 재편됐다** — 기존엔 "시장규모"/"M/S" 두 장이 위쪽 "범위" 토글을 따라 제목·값이 바뀌는 방식이었는데, 사용자가 "전체방송광고 시장규모/유료방송광고 시장규모/유료방송광고시장 M/S"를 **범위 토글과 무관하게 항상 고정으로** 보고 싶다고 요청 — `renderMetricsRevenueKpis()`가 이제 `computeEnaPayTvMarketShare()`를 `'all'`/`'payTv'` 두 스코프로 각각 고정 호출한다(제목도 정적 HTML로 변경, 더 이상 `metricsScopeLabel()`로 갈아끼우지 않음). "범위" 토글은 여전히 그 아래 매출 트렌드/랭킹·M/S 트렌드 차트·시장규모 막대 차트에는 그대로 적용된다 — KPI 카드만 고정, 나머지 차트는 토글 반응형이라는 비대칭이 의도된 것이니 헷갈리지 말 것.
14. **1,000단위 콤마 누락 + 선 그래프가 y축에 붙어 보임** — 이 탭의 억원/억/GRP 표기가 CPRP(`toLocaleString()` 이미 적용)만 빼고 전부 `toFixed()`만 써서 1,441.23억처럼 큰 값도 콤마 없이 나왔다. `metricsFmtNum(value, decimals)`(metrics-dashboard.js, `Number.toLocaleString` 래퍼) 하나로 통일해 KPI·차트 데이터라벨·툴팁·축 눈금 전부에 적용. 선 그래프(M/S 트렌드·매출 트렌드·CPRP/시청률/GRP 미니차트)는 Chart.js 기본값상 category 스케일의 `offset`이 line 컨트롤러에서 false라 첫/끝 데이터포인트가 플롯 경계(y축)에 딱 붙어 보였다 — 네 곳 다 x축에 `offset: true` 추가(막대 그래프의 기본 여백과 동일한 효과).
15. **CJENM 사업자 매출이 다른 사업자 대비 압도적으로 커서 "매출 트렌드" 선그래프에서 나머지가 바닥에 뭉쳐 보였다** — Supabase에 직접 질의해 확인한 결과 **버그가 아니라 실제 규모 차이**였다: File2 원본에서도 8월 CJENM 그룹(tvN 계열 다수 채널 합산) 매출이 약 185억으로, MBC PLUS·SBS미디어넷(각 50~60억)의 3배 이상이다. 그래도 "같이 비교하고 싶다"는 요청에 따라 "매출 트렌드" 카드에 **선형/로그 축 토글**(`metricsRevenueTrendScale`, state.js) 추가 — 로그 모드는 Chart.js 로그축 제약상 값이 0 이하인 점을 못 그리므로 그 달은 `null`(spanGaps로 선만 이어짐)로 바꾼다.
16. **[치명적, 수정됨] "매출 랭킹"이 월 선택을 "전체"(1~9월)로 둬도 항상 최신 1개월(9월)만 보여줬다** — `metricsLatestPeriod()`(단일 기간 반환)만 쓰던 게 원인. 조회조건이 "전체"인데 랭킹이 9월 한 달치만 나오는 건 다른 카드(예: KPI, 트렌드)와 기준이 안 맞아 보인다는 지적(2026-09-15) — `renderMetricsRevenueRankingChart()`를 `metricsMonthsInYear()`가 반환하는 **선택된 모든 달을 합산**하도록 고쳤다(단일 월만 선택했을 땐 그 한 달 = 합계와 동일해 이전과 결과가 같다). 카드 제목도 어느 달을 보여주는지 전혀 안 보이던 문제(범례를 꺼둔 차트라 기준 기간이 툴팁에만 있었음)까지 같이 고쳐 `metricsPeriodRangeLabel()`로 `(YYYY년 M월)` 또는 `(YYYY년 M~N월 누적)`을 동적으로 표기한다.
    - **조사 중 발견(데이터 자체의 특성, 버그 아님)**: 이 조사 과정에서 File2(`매체별 광고비 raw`)가 "8월 마감"이라 **9월 행이 채널 단위로 단 하나도 없다**는 걸 Supabase 쿼리로 확인했다 — 9월 수치는 전부 File2가 아니라 File1의 "01.방송사업자 광고매출"(사업자 매출의 진짜 출처, 위 절 참고) 추정치에서 온 것이다. File1 자체도 "260910 기준"(9월 10일자) 리포트이므로 9월 값은 완결된 월 실적이 아니라 **월중 추정치**일 가능성이 높다 — 설계상 의도된 동작(File2가 못 따라간 최신월을 File1 사업자 총계로 메운다)이지만, 월초·월중에 조회하면 그 달 수치가 나중에 리포트가 갱신되며 바뀔 수 있다는 점은 사용자가 알아둘 필요가 있다.
17. **CPRP/채널시청률/eq-GRPs 미니 트렌드 3종을 4종으로 확장 — 12."광고주 수(일반+인포 전체)" 추가** — Supabase에서 `competitor_ratings`의 `metric_code`/`metric_label` 목록을 직접 조회해 확인: 12번 라벨은 "광고주 수 (일반+인포 전체)"이고 **INDEX가 '전체' 하나뿐**이다(11.시청률1%당매출과 같은 성격 — 일평균/프라임타임 구분 자체가 없음). 그래서 `renderMetricsMiniTrendChart()`가 전역 `metricsIndexMode`를 함수 안에서 직접 읽던 것을 **인자로 받도록 변경**했다 — 안 그러면 위쪽 토글이 "프라임타임"일 때 광고주수 차트가 조용히 빈 화면이 된다(File1에 그 INDEX 자체가 없어서). CPRP·채널시청률·eq-GRPs는 그대로 `metricsIndexMode`를 넘겨 기존과 동일하게 토글에 반응한다. 라벨 검색은 부분일치("광고주수")를 쓰면 16."사업자별 광고주수(120초 미만)"와 공백 제거 후 겹쳐서(둘 다 "광고주수" 포함) `exact: true` + 라벨 전체 문자열로 찾는다.
18. **미니 트렌드 4종을 3열→2열(화면 절반 크기)로 재배치** — 3종일 때 3열 그리드(`.metrics-mini-grid`)를 쓰고 있었는데, 4번째(광고주수) 추가에 맞춰 다른 섹션(`grid-zone5`, 50/50)과 같은 폭 원칙으로 통일해 달라는 요청(2026-09-15) — 2열×2행으로 변경(`css/layout.css`), 세로 높이도 `.card-box`/`.chart-container` 기본값(380px/280px, "매출 트렌드" 카드와 동일)을 물려받도록 자체 min-height 재정의를 없앴다.
19. **[치명적, 1차 시도 미완/2차에서 수정됨] 미니 트렌드 y축이 실제 데이터보다 훨씬 위까지 올라갔다** — CPRP 실제 최댓값이 2026년 기준 420만원대(tvN 9월)인데 축 눈금이 600만원까지 나왔다(사용자 지적, 2026-09-15). 1차 시도: `grace: 0` + 실제 최댓값의 1.1배를 `suggestedMax`로 계산해 넘김 — **그런데도 여전히 600만원까지 나왔다**(사용자 재지적). 원인 재확인: `suggestedMax`는 "적어도 이만큼은 커야 한다"는 하한 힌트일 뿐 상한을 막지 않는다 — `maxTicksLimit:4~5`에 맞춰 Chart.js가 "예쁜 간격"(니스넘버, 1/2/5×10^n)을 고르는 과정에서 그 힌트값을 한 단계 더 올림해버렸다. `suggestedMax`를 진짜 상한을 강제하는 **`max`**로 교체해 해결(축이 그 값을 절대 못 넘음). 같은 김에 범례·축 폰트 크기(10→12)·y축 `maxTicksLimit`(4→5)도 "매출 트렌드" 차트와 맞췄다(카드 크기를 이미 맞췄으니 글자 크기도 맞아야 한다는 요청).
20. **eq-GRPs 트렌드를 07(1일 eq-GRPs)에서 06(누적 eq-GRPs)으로 전환 — "월누적" 요청(2026-09-15)** — `METRICS_LABEL.grp`를 `'1일eq-GRPs'`에서 `'누적eq-GRPs'`로 바꿔 `metricsFindMetricCode()`가 06번을 찾도록 했다. **"누적"의 실제 의미를 Supabase 실측으로 재확인**: 연간 누적(계속 커지는 값)이 아니라 **월 누적**이다 — 06번 값이 매달 오르내리고, "260910 기준"(9월 10일자) 리포트의 9월 값만 유독 확 낮다(예: ENA 8월 2155→9월 835) — 9월이 아직 10일치만 쌓인 진행중 월이라 월 누적이 그만큼 작게 나온 것이고, 연간 누적이었다면 이렇게 떨어질 수 없다. 06/07 둘 다 INDEX(전체/프라임타임) 두 값을 다 갖고 있어 일평균/프라임타임 토글은 그대로 유지된다. 카드 제목에 "(월누적)"을 붙여 07(1일 평균)과 혼동하지 않게 표기.
21. **자사 매출기준(취급고/회계) 전용 토글을 폐지 — 메인 대시보드를 그대로 따르게 함(2026-09-15, 사용자 요청)** — 컨트롤바 Row1("매출 기준" 토글) 통째로 삭제, `metricsBasisMode`/`setMetricsBasisMode()` 제거, `computeEnaMonthlyRevenue()`/`matchesMetricsBasis()`/`rebuildMetricsSubstitution()`이 인자 대신 전역 `revenueBasisMode`를 직접 읽도록 변경, `renderMetricsDashboard()`가 매 렌더마다 `rebuildMetricsSubstitution()`을 재호출해 메인 대시보드에서 바뀐 값과 항상 동기화되게 함.
22. **[21번 정정] 버튼 자체는 이 탭에도 있어야 했다** — 21번에서 버튼까지 지웠더니 사용자가 바로 정정: "회계기준/취급고 기준 토글을 없애면 안 되지, 그거에 따라 숫자가 바뀌어야 되는데" + "취급고를 누르면 매출 대시보드에 있는 취급고 숫자를, 회계를 누르면 회계 숫자를 가져와야 한다"(2026-09-15). 즉 없애야 했던 건 **버튼**이 아니라 **이 탭만의 독립된 별도 상태**였다 — 버튼은 다시 넣고(`#btnMetricsBasisPerformance`/`#btnMetricsBasisAccounting`, `onclick="setMetricsRevenueBasis(mode)"`), 그 버튼이 이 탭 전용 값이 아니라 **전역 `revenueBasisMode`를 직접** 바꾸게 했다(`setMetricsRevenueBasis()`가 `data-loader.js`의 `setRevenueBasis()`를 그대로 호출 — 메인 대시보드 버튼/필터까지 같이 갱신됨). 위 "자사 매출기준" 절 최신 버전 참고 — 21번 설명 중 "토글 자체가 없다"는 이제 틀린 서술이다(버튼은 있다, 상태만 공유).
23. **[치명적, 수정됨] 기본 선택된 "①사업자" 목록이 실제 매출 순위와 무관해 보였다 — ②채널 목록도 같이 이상해짐** — 사용자가 드롭다운을 열어 "5개 선택됨"인데 체크된 항목이 눈에 안 띄는 걸 이상하다고 지적, 이어서 "옆에 채널도 이상해"라고 지적(2026-09-16). 원인: `metricsEnsureDefaultSelections()`가 `metricsLatestPeriod()`(최근 단일 월)로 top4 사업자를 뽑았는데, File2가 아직 마감 전인 9월엔 KT ENA(File1 치환값)를 뺀 **전 채널그룹이 0원 플레이스홀더**라(11번 항목의 File2판 — 9월 File2 raw 자체가 전부 0, KT ENA만 File1로 주입돼 채워짐) 나머지 4자리가 "동률 0원" 임의 순서로(Object.entries 순회 순서) 뽑혔다 — 실제로는 CJENM·JTBC·기타·TV조선(1~8월 유료방송 누적 기준 1~4위, Supabase 실측)이 뽑혀야 하는데 순서가 보장되지 않았다. `renderMetricsRevenueRankingChart()`에 이미 있던 "연중 누적 합산" 패턴을 그대로 재사용해 `metricsEnsureDefaultSelections()`도 `metricsMonthsInYear()`가 반환하는 모든 달을 합산한 뒤(0원인 달은 자동으로 영향 없음) `v > 0` 필터까지 걸어 랭킹을 매기도록 수정. ②채널 캐스케이딩 목록(`metricsChannelsForOperators()`)은 ①사업자 선택을 그대로 입력받는 구조라 이 수정 하나로 같이 정상화된다.

## 남은 확인 필요
1. 상세표(`metricsDetail`)의 16개 지표 중 03/08/09/11 외 나머지(01/02는 미사용, 04/05/06/07/10/12~16)는 라벨 자체에 단위가 괄호로 적혀 있다(예: "13. 광고주 당 매출(백만원)") — `metricsFormatRatingValue()`의 최종 `else` 분기는 지금 전부 "숫자만" 표기라 이 단위 텍스트를 반영하지 않는다. 틀린 값은 아니지만(원본 숫자 그대로 표기) 단위 표기가 빠져 있다 — 필요하면 라벨의 괄호 안 텍스트를 그대로 읽어 접미사로 붙이는 개선을 나중에 추가.
2. SBS미디어넷→SBS Plus 근사(위 6번) — 실제 화면에서 이 근사가 괜찮은지 사람 확인 필요.
3. ~~File1 원본 파일 용량이 46MB로 커서 클라이언트 첫 진입이 느릴 수 있다~~ — Supabase 전환(위 참고)으로 해소됨. 이제 클라이언트는 `competitor_ratings`(21,258행) JSON만 받는다 — 46MB xlsx 자체는 ETL 실행 시에만 Node가 읽는다.
