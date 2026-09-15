# 지표 대시보드 (경쟁채널 벤치마크)

**코드**: `js/core/metrics-data-loader.js`(연결·파싱·자사매출 치환) + `js/features/metrics-dashboard.js`(매출/M-S) + `js/features/metrics-ratings.js`(CPRP/시청률/GRP + 상세표) · **화면**: 헤더 "지표 대시보드" 탭 → `metricsMain`(개요) / `metricsDetail`(File1 상세)

## 개요
광고전략팀이 정기 수신하는 외부 리포트 2종을 KT ENA 내부 매출과 나란히 벤치마킹하는 화면. 기존 매출 대시보드(`main` 이하 15개 뷰)와 완전히 분리된 두 번째 데이터셋·컨트롤로 동작한다 — `selectedYears`/`selectedMonths`/`revenueBasisMode`(state.js)를 공유하지 않고, 이 탭 전용 상태(`metricsSelectedYear` 등, state.js 하단 별도 블록)를 쓴다.

## 데이터 소스 (R2 고정 키 → Pages Function 프록시 → 클라이언트 파싱)
| 소스 | R2 키 / 프록시 | 시트 | 담당 |
|---|---|---|---|
| File1: 경쟁채널 지표 현황 | `competitor-ratings.xlsx` → `functions/competitor-ratings.js` | `변환용취합` (`연도｜INDEX｜구분｜채널｜1…12`) | 시청률·GRP·CPRP 등 16개 방송 지표 → `metricsRatingsData` |
| File2: 매체별 광고비 raw | `competitor-revenue.xlsx` → `functions/competitor-revenue.js` | `변환용` (`채널｜사업자대분류｜사업자중분류｜채널그룹｜YYYY-MM…`) | 매출·시장규모·M/S → `metricsRevenueData` |

두 프록시 모두 `addata.js`(기존 매출 데이터용)를 그대로 미러링한다(`context.env.DASHBOARD_BUCKET.get()` → etag/Cache-Control → `object.body` 스트림). 파일명이 갱신 때마다 바뀌므로 고정 키에 덮어쓰는 방식이라 프론트는 파일명을 몰라도 된다.

**지연 로딩**: 부팅 시(`init.js`)가 아니라 "지표 대시보드" 탭을 처음 열 때 `fetchMetricsDataHttp()`가 1회 호출된다(`renderMetricsDashboard()`가 매번 부르지만 진행 중/완료된 fetch가 있으면 그 프라미스를 그대로 돌려주므로 idempotent). `rawData`(메인 매출)가 아직 없는 극단적인 경우엔 "매출 데이터 로딩 중" 메시지를 띄우고 1.5초 후 재시도한다.

## ENA 자사매출 치환 — "왜 파싱 시점에 하는가"
File2·File1 어느 쪽도 ENA 자신의 수치는 외부 조사기관 추정치라 내부 매출보다 정확도가 떨어진다. 그래서 **파싱 직후, 렌더 이전에** `rebuildMetricsSubstitution(basisMode)`가 File2의 KT ENA 관련 행만 `computeEnaMonthlyRevenue()` 결과로 덮어쓴다:
- `metricsRevenueDataOriginal` — 파싱 원본. 절대 손대지 않는다(캐시).
- `metricsRevenueData` — 파생본. KPI·차트·피벗이 전부 **이 배열 하나만** 읽는다(소스가 하나로 통일).

치환 대상은 두 종류:
1. **채널그룹 `KT ENA` 자기참조 총합 행**(`channel === channelGroup`) — 사업자 비교용. `computeEnaMonthlyRevenue(y, m, basisMode)`(채널필터 없음, `KT_ENA_FAMILY_CHANNELS` 10개 전체 합).
2. **개별 채널 `ENA` 행** — 대표채널 비교용. `computeEnaMonthlyRevenue(y, m, basisMode, 'ENA')`.

렌더 시점에 치환하지 않는 이유: 취급고/회계 토글마다, 또는 KPI·5개 차트·상세표마다 매번 다시 계산하면 (a) 토글 타이밍에 따라 화면 조각마다 다른 값을 잠깐 보여줄 수 있고 (b) 계산 로직이 여러 곳에 흩어져 한쪽만 고치는 버그가 나기 쉽다. 토글이 바뀔 때 한 번만 `metricsRevenueData`를 다시 만들면 그 뒤로는 전부 단순 읽기다.

**⚠ 검증 불가 지점**: File2 `변환용` 시트가 실제로 채널그룹 자기참조 총합 행을 포함하는지 샘플 파일이 없어 확인하지 못했다. `rebuildMetricsSubstitution()`은 그런 행이 없으면 월별로 합성해서 추가하므로 KT ENA는 항상 안전하지만, **경쟁사 채널그룹은 이 보장이 없다** — `metricsGroupRevenueMap()`(metrics-dashboard.js)이 자기참조 행이 있으면 그것을, 없으면 그 그룹의 세부 채널 합을 쓰는 폴백을 갖고 있다(더블카운트 방지). 실 파일로 반드시 교차검증할 것.

## 자사 매출기준 토글 — 메인과 독립
`metricsBasisMode`(`metrics-data-loader.js`, 기본 `'performance'`)는 메인 대시보드의 전역 `revenueBasisMode`와 **완전히 분리**돼 있다. `setMetricsBasisMode(mode)`(metrics-dashboard.js)가 바뀔 때마다 `rebuildMetricsSubstitution(mode)`를 불러 KT ENA 부분만 다시 계산한다. `matchesMetricsBasis(r, basisMode)`(metrics-data-loader.js)는 `kpi.js`의 `matchesCurrentBasis()`와 같은 규칙(취급고=실적만/회계=실적+회계조정)을 이 탭 전용 인자로 복제한 것 — 전역 함수를 건드리지 않아 기존 4개 호출부에 영향이 없다.

## M/S(시장점유율) 공식
```
M/S(%) = KT ENA 사업자 총합(치환값) ÷ "범위" 토글이 가리키는 시장 총매출 × 100
```
- **범위**: 지상파+유료방송(전체) / 유료방송(기본, `사업자대분류 === '유료방송'`) / 케이블(`사업자중분류 === '케이블'`). `metricsScopeMatchRow()`(metrics-dashboard.js)가 File2 원본 컬럼을 그대로 필터링 — 별도 재분류 없음.
- 분모도 그 범위 안 KT ENA 항목은 치환값으로 넣은 뒤 합산한다(`computeEnaPayTvMarketShare()`가 `metricsGroupRevenueMap()` 결과를 그대로 합산).
- M/S 트렌드차트는 %선이 아니라 **누적(stacked) 막대**다 — 월별 막대 하나 = 범위 시장 총매출, "KT ENA"(강조색)+"기타"(중립색) 두 구간, % 라벨은 ENA 구간 위에 직접 표기.

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
- **File1(경쟁채널 지표 현황)은 채널그룹 개념이 없다** — 그래서 CPRP/채널시청률/eq-GRPs 미니차트·상세표·상세표 티저는 비교단위가 '사업자'여도 채널명 직접 선택으로 좁힌다(`metricsRatingsChannelSelection()`, metrics-dashboard.js): ENA는 항상 대표채널로 고정하고, 나머지는 사업자명이 File1의 실제 채널명과 정확히 일치하는 것만 자동으로 잡는다(예: 사업자명이 곧 대표채널명인 경우). **이 매핑은 실 샘플 파일로 검증되지 않았다** — 사람이 File1/File2 실제 채널명을 대조해 확인 필요.

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
| `fetchMetricsDataHttp()` | metrics-data-loader.js | File1·File2 병렬 fetch(idempotent 캐시) |
| `parseCompetitorRatingsWorkbook()` / `parseCompetitorRevenueWorkbook()` | metrics-data-loader.js | SheetJS 세부사항이 갇힌 단일 지점, wide→long 변환 |
| `computeEnaMonthlyRevenue(y, m, basisMode, channelFilter?)` | metrics-data-loader.js | rawData에서 ENA 계열 월매출 재계산 |
| `rebuildMetricsSubstitution(basisMode)` | metrics-data-loader.js | `metricsRevenueDataOriginal` → `metricsRevenueData` 파생(KT ENA만 치환) |
| `metricsGroupRevenueMap(period, scopeMode)` | metrics-dashboard.js | 채널그룹별 월 매출 총합(자기참조 행 우선, 없으면 세부채널 합) |
| `computeEnaPayTvMarketShare(y, m, scopeMode)` | metrics-dashboard.js | M/S 공식 그대로(plan에 명시된 함수명) |
| `metricsEnsureDefaultSelections()` | metrics-dashboard.js | 최초 렌더 시 연도/①사업자 기본값 채움(사용자가 고른 뒤로는 건드리지 않음) |
| `renderMetricsDashboard()` | metrics-dashboard.js | `VIEW_CONFIG.metricsMain.render()` — 지연 fetch, 로딩/에러 상태, 컨트롤·KPI·차트 전부 오케스트레이션 |
| `renderMetricsRevenueKpis()` | metrics-dashboard.js | KPI① 시장규모, KPI② M/S |
| `renderMetricsRatingsKpis()` | metrics-ratings.js | KPI③ CPRP, KPI④ 채널시청률, KPI⑤ 시청률1%당매출 |
| `renderMetricsMarketShareChart()` | metrics-dashboard.js | M/S 트렌드(누적 막대) |
| `renderMetricsRevenueTrendChart()` / `renderMetricsRevenueRankingChart()` | metrics-dashboard.js | 매출 트렌드(라인) / 랭킹(가로막대) |
| `renderMetricsMiniTrendChart()`(+3개 래퍼) | metrics-ratings.js | CPRP/채널시청률/eq-GRPs 미니 트렌드 |
| `renderMetricsDetailPivot()` | metrics-ratings.js | `metricsDetail` 상세표 |

## 규칙/주의
- 전역 상태는 `state.js` 하단 "지표 대시보드 전용 UI 상태" 블록만 쓴다(`metricsSelectedYear`/`metricsIndexMode`/`metricsScopeMode`/`metricsCompareUnit`/`metricsSelectedOperators`/`metricsSelectedChannels`/`expandedMetricsDetailPivot`/`expandedMetricsDetailYearColumns`). 메인 대시보드 전역과 이름이 비슷해도 절대 같은 변수가 아니다.
- 차트 색은 `theme-system.js`의 `CH()`/`RC()`/`seriesColor()`만 쓴다. 5대분류(`catColor()`)는 이 탭의 축(사업자/채널)과 무관하므로 쓰지 않는다 — ENA는 `RC('curr')`(강조), 나머지는 `seriesColor(i)`(서수 팔레트) 또는 `RC('ref')`(중립, 랭킹차트 비선택 항목).
- 금액: KPI/차트는 억원, 상세표는 지표 단위별로 다르다(백만원 고정 아님 — 위 "왜 renderPresetPivot()을 그대로 안 쓰는가" 참고, CLAUDE.md 절대원칙 8의 "피벗=백만원" 규칙이 이 표에는 그대로 적용되지 않는 유일한 예외).
- `js/core/filters.js`는 건드리지 않는다 — 이 탭의 필터링은 전부 `metricsScopeMatchRow()`/`metricsGroupRevenueMap()` 등 이 파일들 자체 함수로 처리한다.

## 접근 제한 — 롤아웃 초기 이메일 허용목록
다른 `/api/*`·`addata.js`는 로그인만 하면 전원 접근 가능하지만, 이 기능(File1/File2)만 예외로 소수(현재 1인, `hyunseo@ktena.co.kr`)에게만 공개한다.

- **실제 차단(서버)**: `shared/supabase-proxy.mjs`의 `requireMetricsAccess(env, request)` — JWT를 검증한 뒤 `email`이 허용목록에 없으면 403. 허용목록은 Cloudflare Pages 환경변수 `METRICS_ALLOWED_EMAILS`(콤마 구분)로 재배포 없이 갱신하며, 미설정 시 코드 내 기본값(`hyunseo@ktena.co.kr`) 하나만 허용한다. `functions/competitor-ratings.js`/`competitor-revenue.js` 둘 다 `onRequest` 맨 앞에서 호출한다.
- **UI 숨김(클라이언트)**: `js/core/auth.js`의 `METRICS_ALLOWED_EMAILS` 배열 + `applyMetricsAccessGate()` — `ensureAuthenticated()`가 로그인 세션 확정 후 호출해 허용되지 않은 이메일이면 헤더의 `#dashboardTabMetrics` 탭 버튼 자체를 숨긴다. 이건 UX일 뿐이라 콘솔로 우회 가능 — 실제 방어선은 위 서버 쪽 403.
- **두 목록은 반드시 같이 갱신한다.** 어긋나면 "탭은 보이는데 데이터는 403 에러"(auth.js만 갱신) 또는 "탭은 없는데 URL로 들어가면 실제로는 허용됨"(supabase-proxy.mjs만 갱신) 같은 불일치가 생긴다.
- **사람 추가/제거 절차**: ① Cloudflare Pages 대시보드 → 환경변수 `METRICS_ALLOWED_EMAILS`에 이메일 추가(콤마 구분, Production/Preview 둘 다) → ② `js/core/auth.js`의 `METRICS_ALLOWED_EMAILS` 배열도 같은 목록으로 수정 후 재배포. 팀 전체 공개로 전환할 때는 이 절 전체(서버 체크 호출 + 클라이언트 숨김 로직)를 제거하면 된다 — 다른 `/api/*`와 동일하게 "로그인만 하면 접근 가능"으로 돌아간다.
- 클라이언트 fetch(`js/core/metrics-data-loader.js`의 `fetchMetricsDataHttp()`)는 `getAuthorizationHeader()`(auth.js)로 JWT를 `Authorization: Bearer` 헤더에 실어 보낸다 — 이게 없으면 서버 쪽 `requireMetricsAccess()`가 401로 막는다.

## 확인 필요 (실 File1/File2 샘플 확보 후)
1. File2가 채널그룹 자기참조 총합 행(`channel === channelGroup`)을 실제로 포함하는지 — KT ENA는 데이터 계층이 없으면 합성하지만 경쟁사는 폴백 합산에 의존한다.
2. File1의 metricCode 번호 체계 — 특히 "06/07.eq-GRPs"로 보이는 두 코드가 실제로 무엇을 가르는지(전체/프라임타임 중복인지, 다른 개념인지). `metricsFindMetricCode()`는 라벨 텍스트로 찾고 `indexMode`로 동률을 깨지만, 사람이 원본 "구분" 열을 직접 보고 확인해야 한다.
3. `metricsRatingsChannelSelection()`의 "사업자명 = File1 채널명" 매핑 — 경쟁사 채널명이 실제로 몇 개나 일치하는지, 안 맞는 사업자가 있으면 미니차트·상세표 티저에서 조용히 빠진다(에러 없이 ENA 단독으로 줄어들 뿐이다).
4. 상세표(`metricsDetail`)의 16개 지표 중 03/09/11 외 나머지(10/12~16, 광고주수·브랜드수 등) 단위 — `metricsFormatRatingValue()`의 최종 `else` 분기(숫자만 표기)가 실제로 맞는 단위인지.
