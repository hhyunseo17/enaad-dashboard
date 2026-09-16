# 지표 대시보드 (경쟁채널 벤치마크)

**코드**: `js/core/metrics-data-loader.js`(연결·파싱·자사매출 치환) + `js/features/metrics-dashboard.js`(매출/M-S) + `js/features/metrics-ratings.js`(CPRP/시청률/GRP + 상세표) · **화면**: 헤더 "지표 대시보드" 탭 → `metricsMain`(개요) / `metricsDetail`(File1 상세)

## 개요
광고전략팀이 정기 수신하는 외부 리포트 2종을 KT ENA 내부 매출과 나란히 벤치마킹하는 화면. 기존 매출 대시보드(`main` 이하 15개 뷰)와 완전히 분리된 두 번째 데이터셋·컨트롤로 동작한다 — `selectedYears`/`selectedMonths`/`revenueBasisMode`(state.js)를 공유하지 않고, 이 탭 전용 상태(`metricsSelectedYear` 등, state.js 하단 별도 블록)를 쓴다.

## 데이터 소스 — File2는 분석에서 제외(2026-09-16), File1 하나로 통일
원래 계획은 File1(경쟁채널 지표 현황)+File2(매체별 광고비 raw) 두 파일을 병행해 매출·M-S는 File2, 시청률·GRP·CPRP는 File1로 나눠 썼다. 그런데 File2는 마감 전 달(예: 9월)엔 KT ENA를 뺀 **전 채널그룹이 0원 플레이스홀더**라, 그 값을 기준으로 뽑는 기본 사업자 랭킹·①②캐스케이딩이 계속 어긋나는 버그의 근본 원인이었다(아래 로그 11·23번). 반면 File1의 "01.방송사업자 광고매출"은 14개 사업자 전원이 마감 전 달에도 실측/추정 값을 보고한다(0이 아님, Supabase로 직접 확인) — 그래서 **File2를 분석에서 완전히 제외하고 File1 하나로 매출·시장규모·M/S·CPRP·시청률·GRP·광고주수를 전부 구성**하기로 했다(사용자 요청, "그냥 파일2는 분석에서 제외하자").

| 소스 | 테이블 | ETL | API | 사용 여부 |
|---|---|---|---|---|
| File1: 경쟁채널 지표 현황 | `competitor_ratings` | `scripts/etl/load-competitor-data.mjs` | `/api/competitor-ratings` | 사용 — 지표 대시보드 전체의 유일한 소스 |
| File2: 매체별 광고비 raw | `competitor_revenue` | (같은 스크립트) | `/api/competitor-revenue` | **미사용**(fetch 자체를 안 함) — 서빙 인프라·ETL·테이블은 롤백 여지로 그대로 둠 |

- **적재**: `node scripts/etl/load-competitor-data.mjs <File1.xlsx> <File2.xlsx>` — 여전히 두 파일을 다 받아 두 테이블에 upsert한다(ETL 스크립트는 안 바꿈, `competitor_revenue` 테이블도 계속 채워짐). 프론트가 `/api/competitor-revenue`를 더 이상 호출하지 않을 뿐이다.
- **API**: `functions/api/competitor-ratings.js` → `shared/supabase-proxy.mjs`의 `handleCompetitorRatingsRequest()` → `proxyView(env, 'competitor_ratings')`(다른 `/api/*`와 같은 PostgREST 프록시 함수, 페이지네이션 포함). `requireAuth`가 아니라 `requireMetricsAccess`를 쓴다(로그인만으로 부족 — 이메일 허용목록, 아래 "접근 제한" 절). `functions/api/competitor-revenue.js`도 코드는 남아있지만 호출하는 곳이 없다.
- Supabase 행은 snake_case로 오므로 `js/core/metrics-data-loader.js`의 `fetchMetricsDataHttp()`가 camelCase로 필드명만 바꿔준다 — 그 외 가공(정규화·번호 제거·wide→long)은 전부 ETL 쪽에서 이미 끝난 채로 들어온다. 클라이언트에는 SheetJS 파싱이 없다.
- (참고: R2 직접 서빙을 시도했다가 이 Cloudflare Pages 프로젝트에서 버킷 바인딩이 원인 불명으로 전혀 붙지 않아 Supabase로 옮긴 이력은 2026-09-15 결정이고 File2 제외와는 무관하다.)

**지연 로딩**: 부팅 시(`init.js`)가 아니라 "지표 대시보드" 탭을 처음 열 때 `fetchMetricsDataHttp()`가 1회 호출된다(`renderMetricsDashboard()`가 매번 부르지만 진행 중/완료된 fetch가 있으면 그 프라미스를 그대로 돌려주므로 idempotent). `rawData`(메인 매출)가 아직 없는 극단적인 경우엔 "매출 데이터 로딩 중" 메시지를 띄우고 1.5초 후 재시도한다.

## ENA 자사매출 치환 — "왜 파싱 시점에 하는가"
File1도 ENA 자신의 수치는 외부 조사기관 추정치라 내부 매출보다 정확도가 떨어진다. 그래서 **파싱 직후, 렌더 이전에** `rebuildMetricsSubstitution()`가 `metricsRatingsData`의 `metric_code==='01'`(사업자별 광고매출) 행에서 `metricsRevenueData`를 매번 새로 만들면서, KT ENA 행만 `computeEnaMonthlyRevenue()` 결과로 덮어쓴다:
- `metricsRatingsData` — File1 파싱 원본 전체(01번도 포함). 절대 손대지 않는다(캐시).
- `metricsRevenueData` — 파생본. KPI·차트·피벗이 전부 **이 배열 하나만** 읽는다.

File1은 사업자 단위로만 보고하고(File2 같은 세부채널 분해가 없음) `channel`과 `channelGroup`이 항상 같은 값이라, 치환 대상은 **KT ENA 사업자 행 하나뿐**이다 — `computeEnaMonthlyRevenue(y, m)`(`KT_ENA_FAMILY_CHANNELS` 10개 전체 합, 채널필터 인자 자체가 없어짐). File2 시절에 있던 "② 개별 채널 ENA 행"(대표채널 비교용 별도 치환) 개념은 사라졌다 — 매출은 애초에 사업자 단위로만 존재하기 때문(아래 "비교단위" 절 참고).

렌더 시점에 치환하지 않는 이유: 취급고/회계 토글마다, 또는 KPI·5개 차트·상세표마다 매번 다시 계산하면 (a) 토글 타이밍에 따라 화면 조각마다 다른 값을 잠깐 보여줄 수 있고 (b) 계산 로직이 여러 곳에 흩어져 한쪽만 고치는 버그가 나기 쉽다. 토글이 바뀔 때 한 번만 `metricsRevenueData`를 다시 만들면 그 뒤로는 전부 단순 읽기다.

## 자사 매출기준 — 버튼은 이 탭에도 있지만 메인 대시보드와 전역 상태를 공유 (2026-09-15 변경)
원래 plan은 이 탭 전용 `metricsBasisMode` 토글(메인의 전역 `revenueBasisMode`와 완전 분리)이었다. 처음엔 토글 자체를 없앴었으나(버튼을 지우고 항상 전역값만 읽게 함), **사용자가 다시 정정**: "취급고를 누르면 매출 대시보드의 취급고 숫자를, 회계를 누르면 회계 숫자를 가져와야 한다" — 버튼 자체는 이 탭에도 있어야 하고, 눌렀을 때 숫자가 바뀌어야 한다는 것. "KT ENA/ENA 채널 매출은 매출 대시보드에 있는 숫자를 그대로 가져와 타사와 더하는 개념"이라는 원래 취지는 유지하되, **버튼은 이 탭에 두고 그 버튼이 전역 상태를 직접 바꾸는 방식**으로 최종 확정:
- 컨트롤바 Row1에 "매출 기준"(취급고/회계) 버튼이 있다(`#btnMetricsBasisPerformance`/`#btnMetricsBasisAccounting`). `onclick="setMetricsRevenueBasis(mode)"`(metrics-dashboard.js)가 내부적으로 `js/core/data-loader.js`의 `setRevenueBasis(mode)`를 그대로 호출한다 — 전역 `revenueBasisMode`를 바꾸고, 메인 대시보드 쪽 버튼 active 상태·`updateMonthPillAvailability()`·`applyFilters()`까지 전부 같이 갱신된다(단, `applyFilters()`는 `currentView`가 `metricsMain`이면 아무 렌더 분기에도 안 걸려 안전하게 no-op — `filteredData`만 새로 계산해 둔다). 그 다음 이 탭 자신의 버튼 active 상태와 `renderMetricsDashboard()`를 마저 호출한다.
- 반대 방향(메인 대시보드 버튼으로 바꾼 뒤 이 탭에 들어오는 경우)도 어긋나지 않는다 — `renderMetricsDashboard()`가 매 렌더마다 최신 `revenueBasisMode` 기준으로 이 탭 버튼의 active 클래스를 다시 맞춘다.
- `computeEnaMonthlyRevenue(year, month, channelFilter?)`(`metrics-data-loader.js`)와 그 안의 `matchesMetricsBasis(r)`가 전역 `revenueBasisMode`(state.js)를 직접 읽는다. `matchesMetricsBasis()`는 그래도 `kpi.js`의 `matchesCurrentBasis()`와 같은 규칙(취급고=실적만/회계=실적+회계조정)을 복제한 별도 함수로 유지한다 — core(`metrics-data-loader.js`)가 features(`kpi.js`)의 함수를 직접 호출하면 레이어가 거꾸로 의존하게 되기 때문(스크립트 로드 순서 관례 위반).
- `rebuildMetricsSubstitution()`(인자 없음)이 `renderMetricsDashboard()`의 매 렌더마다 다시 호출된다 — 어느 쪽 버튼으로 바뀌었든, 또는 이 탭에서 다른 컨트롤을 조작해 재렌더가 돌 때마다 항상 최신 값 기준으로 KT ENA 부분이 재계산된다.

## M/S(시장점유율) 공식 — 카드마다 "시장"의 정의가 다르다 (2026-09-16 재설계)
KPI1·2("전체방송광고 시장규모"/"유료방송광고 시장규모")와 나머지(KPI3 M/S·M/S트렌드·"방송광고시장 규모 추이"차트·비중 토글)는 서로 다른 "시장" 정의를 쓴다 — 사용자 확인: "1·2번은 진짜 전체 산업 규모로 그대로, 3번(M/S)부터는 ①선택 사업자 합 기준".

```
KPI1·2 (진짜 전체 산업 규모, ①②선택과 무관):
  시장규모 = "범위" 토글이 가리키는 전체 사업자 총매출 합
  → computeEnaPayTvMarketShare(y, m, scopeMode)

KPI3(M/S)·M/S트렌드·시장규모추이차트·비중 (①선택 사업자 기준):
  시장 = ①에서 선택된 사업자들의 매출 합(ENA 포함, "범위" 토글과 무관 — 선택 자체가 이미 그
         시점의 범위 안에서 고른 것들이라 이중 필터링하지 않는다)
  M/S(%) = KT ENA 사업자 총합(치환값) ÷ 위 "시장" × 100  ← 분자는 항상 ENA로 고정
  → computeEnaSelectionMarketShare(y, m)
```

- **범위**: 지상파+유료방송(전체) / 유료방송(기본, 종편+케이블) / 케이블. File1엔 File2의 사업자대분류/사업자중분류 같은 스코프 컬럼이 없어, `METRICS_OPERATOR_SCOPE`(metrics-data-loader.js)라는 사업자→범위 하드코딩 맵으로 직접 분류한다(2026-09-16, 사용자 확인) — 지상파: KBS/MBC(전국)/SBS(민방포함), 종편: JTBC/TV조선/채널A/MBN, 케이블: KT ENA/CJ ENM/MBC Plus/SBS 계열/KBS N/티캐스트/iHQ. `metricsScopeMatchRow()`(metrics-dashboard.js)가 각 매출 행의 `scope` 필드(치환 시점에 이 맵으로 채워짐)를 그대로 필터링. **재설계 후 "범위" 토글의 실질 역할은 ①사업자 선택 후보군을 좁히는 것과 기본 선택 랭킹의 스코프뿐** — KPI1·2는 이 토글과 무관하게 각각 'all'/'payTv' 고정, KPI3 이후는 아예 이 토글을 안 본다(①에서 이미 고른 이름만 합산).
- M/S 트렌드차트는 %선(꺾은선) 하나만 그린다 — 목업 초안엔 누적(stacked) 막대 아이디어도 있었으나 실제 구현은 라인 차트다.
- "방송광고시장 규모 추이"(왼쪽) 차트는 원래 지상파/종편/케이블 3개 카테고리로 쌓았으나, ①선택 사업자별 스택으로 바뀌었다(위 "재설계" 참고) — ENA는 강조색, 나머지는 서수 팔레트, "비중" 모드는 선택 사업자들 사이의 월별 구성비(100% 누적).

## 사업자(①) ↔ 채널(②) 매핑, 표시 이름 — 전부 하드코딩 (2026-09-16)
File1엔 File2의 "채널그룹→세부채널" 같은 대응관계를 알려주는 컬럼이 전혀 없다. 그래서 세 개의 하드코딩 맵(`metrics-data-loader.js`)이 이 파일 전체의 사업자/채널 개념을 떠받친다 — 전부 사람이 Supabase에 직접 질의해 실제 데이터를 대조하며 만들었다(2026-09-16):

- **`METRICS_OPERATOR_CHANNEL_MAP`** — ①사업자 → ②채널(들). File1의 03/09 등 채널 단위 지표에 실제로 존재하는 채널만 매핑된다:
  - `KT ENA` → ENA, ENA DRAMA, ENA PLAY, ENA STORY
  - `CJ ENM` → tvN, tvN DRAMA, tvN SHOW, tvN STORY
  - `MBC Plus` → MBC every1, MBC드라마넷
  - `SBS 계열` → SBS Plus, SBS funE
  - `KBS N` → KBS JOY, KBS드라마
  - 나머지 8개 사업자(JTBC/채널A/MBN/TV조선/SBS(민방포함)/KBS/MBC(전국)/티캐스트/iHQ)는 이 맵에 없다 — `metricsChannelsForOperator(op)`가 매핑이 없으면 사업자명 자기 자신을 유일한 채널로 반환한다(`|| [op]`).
- **`METRICS_OPERATOR_SCOPE`** — ①사업자 → 지상파/종편/케이블(위 "M/S 공식" 절의 범위 매핑과 동일 맵).
- **`METRICS_OPERATOR_DISPLAY_NAME`** — File1 원본 표기가 딱딱하거나(`SBS(민방포함)`) 다른 화면에서 익숙한 표기와 달라서(`SBS 계열`보다 `SBS미디어넷`) 체크박스·범례·랭킹차트 라벨에서만 바꿔치기한다: `SBS(민방포함)→SBS`, `MBC(전국)→MBC`, `SBS 계열→SBS미디어넷`, `KBS N→KBSN`, `MBC Plus→MBC PLUS`. 데이터 조회 키는 항상 File1 원본 표기를 그대로 쓴다.

**⚠ 채널 단위 지표의 커버리지 한계**: File1의 03(채널시청률)~15번 지표는 실제로 **15개 채널만** 존재한다(위 매핑에 나온 KT ENA 4개+CJ ENM 4개+MBC Plus 2개+SBS 계열 2개+KBS N 2개+JTBC 1개). 즉 **TV조선/채널A/MBN/KBS/MBC(전국)/SBS(민방포함)/티캐스트/iHQ는 CPRP·채널시청률·eq-GRPs·광고주수에 개별 채널 데이터가 아예 없다** — 이 8개 사업자를 ①에서 선택하면(대표채널이 자기 자신으로 폴백) 매출 트렌드/랭킹에는 정상적으로 나오지만 CPRP/시청률/GRP 미니차트에는 빈 줄로 나온다(에러 아님, File1 자체의 커버리지 한계 — 이 리포트가 애초에 ENA와 직접 비교되는 PP/종편 드라마·예능 채널 위주로 시청률을 추적하기 때문으로 추정). `metricsDetail` 전체 상세표(16개 지표 전부)는 이 한계와 무관하게 각 지표가 실제로 갖고 있는 채널만 보여준다.

## CPRP·시청률·eq-GRPs — File1 원본을 그대로 쓰는 이유
`11.시청률 1%당 매출(억원)`은 File1이 자체 계산해 둔 값을 그대로 쓴다(내부 매출로 재계산하지 않는다). 분자(매출 추정치)만 내부값으로 바꾸면 분모(채널시청률, ENA 단일 채널 기준)와 스코프가 안 맞아 오히려 왜곡된다. CPRP·GRP·시청률도 동일하게 "File1 원본" 취급.

**참고(향후 옵션 메모)**: `CPRP = 채널 매출 ÷ 15초 GRPs`, `시청률 1%당 매출 = 채널 매출 ÷ 채널 시청률`. 둘 다 분자가 "채널 매출"이라 나중에 ENA만 내부 매출로 재계산해 끼워 넣는 것도 공식상 가능하지만, 1차 버전은 File1 원본 그대로다.

- **CPRP는 원 단위로 표기** — File1 원본 컬럼은 "천원" 단위라 화면에 낼 때 ×1,000 한다. `metricsRatingsData`의 `value` 필드 자체는 천원 단위 그대로 남아 있다(데이터 계층은 변환하지 않는다 — plan 항목 3) — 그래서 곱셈은 **렌더 코드에만** 있다(KPI 카드 `metricsKpiCprpValue`, 미니 트렌드차트, 상세표 `metricsFormatRatingValue()` 세 곳 전부).
- **채널시청률은 소수점 셋째 자리까지** 표기(예: 0.684%) — File1 정밀도를 살린다.
- **일평균/프라임타임 토글**(`metricsIndexMode`, File1의 `INDEX` 컬럼)은 CPRP·채널시청률·eq-GRPs에만 영향을 준다. **M/S와 시청률 1%당 매출은 이 토글과 무관** — M/S는 File2 파생값이라 애초에 INDEX 축이 없고, 시청률 1%당 매출은 KPI 렌더 코드가 `indexMode`를 무시하고 항상 `'전체'`로 고정 조회한다(`renderMetricsRatingsKpis()`의 `rprCode` 조회 참고).

## 대표채널 ENA 단일값을 쓰는 이유
File1(`변환용취합`)은 ENA/ENA DRAMA/ENA PLAY/ENA STORY 4개 개별 채널만 있고 "KT ENA 합계" 행이 없다. DRAMA/PLAY/STORY는 보조 채널이라 경쟁사와 비교하는 의미가 약해, CPRP·채널시청률·eq-GRPs·시청률1%당매출은 **대표채널 "ENA" 값만** 쓴다(`ENA_REPRESENTATIVE_CHANNEL`, metrics-data-loader.js).

## ①②선택이 CPRP/시청률/GRP에 적용되는 방식 — "비교단위" 토글은 폐지됨 (2026-09-16)
매출(01번 지표)은 **사업자 단위로만** 존재하고(세부채널 분해가 없음), CPRP/시청률/GRP(03~15번 지표)은 **채널 단위**로 존재하지만 그중 15개 채널만(위 "사업자↔채널 매핑" 절 참고) — 그래서 매출 트렌드/랭킹/M-S/KPI는 항상 ①사업자(`metricsSelectedOperators`) 기준이고, CPRP/채널시청률/eq-GRPs/광고주수 미니차트·`metricsDetail` 상세표 티저는 `metricsRatingsChannelSelection()`(metrics-dashboard.js)이 담당한다:
- ②에서 실제로 체크한 채널이 있으면 그대로 쓴다.
- 비어 있으면 ①선택 사업자의 **대표채널**(`metricsRepresentativeChannel()`: `METRICS_OPERATOR_CHANNEL_MAP`의 첫 채널, 없으면 사업자명 자체)로 자동 대체한다 — CPRP·시청률 같은 비율 지표는 사업자 내 여러 채널 값을 더하거나 평균낼 수 없어서(레이트라 가산 불가) 대표 하나로 근사한다.

원래는 "사업자 비교/대표채널 비교" 토글로 이 둘을 명시적으로 전환했었으나, 사용자가 지적: "②채널을 어차피 직접 찍으니 토글이 의미 없다" — ②를 체크하는 행위 자체가 이미 명시적 선택이라 별도 모드 스위치가 불필요했다. 토글·`metricsCompareUnit`(state.js)·`setMetricsCompareUnit()`을 전부 제거하고, ②채널 드롭다운을 상시 활성화(예전엔 "대표채널 비교" 모드에서만 활성화됐다)했다.

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
| `fetchMetricsDataHttp()` | metrics-data-loader.js | `/api/competitor-ratings` fetch(idempotent 캐시) + snake_case→camelCase 매핑(File2 fetch는 제거됨, 2026-09-16) |
| `computeEnaMonthlyRevenue(y, m)` | metrics-data-loader.js | rawData에서 ENA 계열 월매출 재계산(전역 revenueBasisMode 직접 읽음, channelFilter 인자는 제거됨 — 매출이 사업자 단위뿐이라 필요 없어짐) |
| `rebuildMetricsSubstitution()` | metrics-data-loader.js | `metricsRatingsData`의 metric_code='01' 행 → `metricsRevenueData` 파생(KT ENA만 치환), 매 렌더마다 재호출 |
| `metricsChannelsForOperator(op)` / `metricsRepresentativeChannel(op)` / `metricsOperatorDisplayName(op)` | metrics-data-loader.js | ①사업자→②채널/대표채널/표시이름 하드코딩 맵 접근자(위 "사업자↔채널 매핑" 절) |
| `metricsGroupRevenueMap(period, scopeMode)` | metrics-dashboard.js | 사업자별 월 매출 총합(File1은 세부채널 분해가 없어 자기참조 폴백 로직 자체가 필요 없어짐) |
| `computeEnaPayTvMarketShare(y, m, scopeMode)` | metrics-dashboard.js | KPI1·2 전용 — 범위 토글이 가리키는 전체 사업자 합 기준 M/S(plan에 명시된 함수명, 2026-09-16부터 KPI1·2에만 씀) |
| `computeEnaSelectionMarketShare(y, m)` | metrics-dashboard.js | KPI3(M/S)·M/S트렌드·시장규모추이차트·비중 전용 — ①선택 사업자 합 기준(2026-09-16 신설) |
| `metricsEnsureDefaultSelections()` | metrics-dashboard.js | 최초 렌더 시(단, `metricsOperatorsInitialized` 플래그로 판단 — `.length===0` 아님, 2026-09-16) 연도/①사업자 기본값 채움 — ①사업자는 "범위" 토글이 가리키는 전체(`metricsAllOperatorGroups()`)로 채운다(top4 랭킹 로직 폐지) |
| `renderMetricsDataAsOfLabel()` | metrics-dashboard.js | 화면 상단 "데이터 기준: YYYY년 M월" 한 줄(File1 metric_code='01' 최신 연/월, 2026-09-16 신설 — 출처 범례 폐지) |
| `renderMetricsDashboard()` | metrics-dashboard.js | `VIEW_CONFIG.metricsMain.render()` — 지연 fetch, 로딩/에러 상태, 컨트롤·KPI·차트 전부 오케스트레이션 |
| `renderMetricsRevenueKpis()` | metrics-dashboard.js | KPI① 시장규모, KPI② M/S |
| `renderMetricsRatingsKpis()` | metrics-ratings.js | KPI③ CPRP, KPI④ 채널시청률, KPI⑤ 시청률1%당매출 |
| `renderMetricsMarketShareChart()` | metrics-dashboard.js | M/S 트렌드(누적 막대) |
| `renderMetricsRevenueTrendChart()` / `renderMetricsRevenueRankingChart()` | metrics-dashboard.js | 매출 트렌드(라인) / 랭킹(가로막대) — 항상 ①사업자 기준(비교단위 토글 무관, 2026-09-16) |
| `metricsRatingsChannelSelection()` | metrics-dashboard.js | CPRP/채널시청률/eq-GRPs/광고주수/상세표 티저가 쓰는 채널 목록 — 비교단위 토글에 따라 대표채널(사업자 비교) 또는 ②선택 채널(대표채널 비교) 반환(2026-09-16, 예전 고정 목록 대체) |
| `renderMetricsMiniTrendChart()`(+4개 래퍼) | metrics-ratings.js | CPRP/채널시청률/eq-GRPs/광고주수 미니 트렌드(2026-09-15: `indexMode`를 인자로 받도록 변경 — 광고주수는 File1에 '전체'뿐이라 토글과 무관하게 고정 조회해야 해서) |
| `renderMetricsDetailPivot()` | metrics-ratings.js | `metricsDetail` 상세표 |

## 규칙/주의
- 전역 상태는 `state.js` 하단 "지표 대시보드 전용 UI 상태" 블록만 쓴다(`metricsSelectedYear`/`metricsIndexMode`/`metricsScopeMode`/`metricsSelectedOperators`/`metricsSelectedChannels`/`expandedMetricsDetailPivot`/`expandedMetricsDetailYearColumns`). 메인 대시보드 전역과 이름이 비슷해도 절대 같은 변수가 아니다.
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
24. **[대규모 재설계] File2를 분석에서 완전히 제외 — File1 하나로 통일 (2026-09-16)** — 23번 조사 도중 사용자가 근본 해결을 요청: "그냥 파일2는 분석에서 제외하자". File2는 마감 전 달마다 KT ENA 제외 전원이 0원 플레이스홀더인 게 반복되는 버그의 근본 원인이었다(11·23번 모두 이 문제의 다른 증상). Supabase로 File1의 "01.방송사업자 광고매출"을 직접 확인한 결과 14개 사업자 전원이 마감 전 달에도 실측/추정 값을 보고하고 있어(9월 CJ ENM 204억 등 전부 nonzero) 이 문제 자체가 사라짐을 확인 — File2 fetch(`METRICS_REVENUE_URL`)와 `injectOperatorRevenueFromRatings()`(File1→File2 조인 주입 로직), `metricsRevenueDataOriginal` 캐시, "자기참조 합계 행 합성" 폴백을 전부 제거하고 `rebuildMetricsSubstitution()`이 File1 metric_code='01' 행에서 직접 `metricsRevenueData`를 만들도록 재작성. 이어서 사용자가 "사업자-채널도 파일1에 있는 채널만 대상으로 하고, M/S도 죄다 파일1에 있는 걸로 해" + 직접 제공한 사업자→범위(지상파/종편/케이블) 매핑을 받아 `METRICS_OPERATOR_SCOPE`로 하드코딩(위 "M/S 공식" 절 참고). 처음엔 "File1 metric 01은 사업자 단위뿐이니 ①→②채널 캐스케이딩 자체가 불필요해지는 것 아니냐"고 되물었으나, 사용자가 "아니 채널 필요해" + 직접 사업자→채널 매핑(KT ENA/CJ ENM/MBC PLUS/SBS미디어넷/KBSN 5개 + 나머지는 자기 자신)을 제공 — `METRICS_OPERATOR_CHANNEL_MAP`으로 하드코딩하고, 매출 트렌드/랭킹은 매출이 사업자 단위로만 존재해 이 토글과 무관하게 항상 ①기준으로 고정. 마지막으로 "미니트렌드 차트에도 적용하자"는 요청에 따라 CPRP/채널시청률/eq-GRPs/광고주수와 상세표 티저가 쓰던 고정 6채널 목록(`METRICS_RATINGS_FIXED_CHANNELS`)을 폐지하고 `metricsRatingsChannelSelection()`이 ①②선택을 그대로 따르도록 재설계(사업자 비교 모드는 대표채널로 근사). 부작용: File1의 채널 단위 지표(03~15번)는 실제로 15개 채널만 있어(위 "사업자↔채널 매핑" 절 참고) TV조선/채널A/MBN/KBS/MBC(전국)/SBS(민방포함)/티캐스트/iHQ 8개 사업자는 CPRP/시청률/GRP 미니차트에서 빈 줄로 나온다 — File1 자체의 데이터 커버리지 한계이며 버그가 아니다. File2 서빙 인프라(`functions/api/competitor-revenue.js`, ETL, `competitor_revenue` 테이블)는 롤백 여지를 남겨 삭제하지 않고 그대로 뒀다.
25. **[재설계] "시장"·"비중"·M/S가 KPI1·2를 빼고 전부 ①선택 사업자 기준으로 바뀜 (2026-09-16)** — 24번 직후 사용자가 "사업자, 채널에 따라 시장, 비중, M/S 등등 바뀌는 게 맞을 거 같아"라고 지적. 처음엔 "M/S 분자도 선택한 사업자로 바뀌어야 하나" 되물었으나 사용자가 정정: "어떻게 하는 게 나을까? KT ENA 기준이어야 되는 건 맞는데" — 분자(ENA)는 고정하고 분모("시장")만 ①선택 기준으로 바꾸는 것으로 합의. 이어서 KPI1·2("전체방송광고/유료방송광고 시장규모")도 포함할지 물었더니 "아니오, 1·2번은 진짜 전체 산업 규모로 그대로"라고 확정 — 결과적으로 카드마다 "시장"의 정의가 갈리는 구조가 됐다(위 "M/S 공식" 절 참고): KPI1·2는 `computeEnaPayTvMarketShare()`(범위 토글 기준 전체 사업자 합, 그대로 유지)를, KPI3(M/S)·M/S트렌드·"방송광고시장 규모 추이"차트·비중 토글은 신설한 `computeEnaSelectionMarketShare()`(①선택 사업자 합, 범위 토글 무시)를 쓴다. "방송광고시장 규모 추이" 차트는 지상파/종편/케이블 3카테고리 스택에서 ①선택 사업자별 스택으로 갈아엎었다(`METRICS_SCOPE_CATEGORIES`/`METRICS_SCOPE_CATEGORY_COLOR_INDEX`/`metricsScopeCategoriesForMode()` 삭제, 이제 안 씀). 재설계 후 "범위" 토글의 실질 역할은 ①사업자 선택 후보군을 좁히는 것과 기본 선택 랭킹의 스코프뿐이다 — KPI3 이후 차트들은 이 토글을 아예 안 본다.
26. **[UI 단순화] "비교단위"(사업자 비교/대표채널 비교) 토글 폐지** — 사용자가 스크린샷을 보고 지적: "이거는 의미 없겠다 어차피 사업자와 채널을 찍으니"(2026-09-16). ②채널을 직접 체크하는 것 자체가 이미 명시적 선택이라, 그 위에 "어느 걸 쓸지"를 또 고르는 토글은 군더더기였다. `metricsCompareUnit`(state.js)·`setMetricsCompareUnit()`·컨트롤바의 "비교단위" pill 2개를 전부 제거하고, ②채널 드롭다운을 상시 활성화(예전엔 "대표채널 비교" 모드에서만 활성화)로 바꿨다. `metricsRatingsChannelSelection()`은 이제 ②가 비어있는지만 본다 — 비어있으면 ①사업자별 대표채널로 자동 대체, 채워져 있으면 그대로 사용. 같은 김에 "범위" 토글 옆에 붙여뒀던 장문 안내문구("①사업자 선택 후보군만 좁힘…")도 지적받아 제거 — 컨트롤바 힌트는 짧게 유지한다.
27. **[설계 변경] 기본 ①사업자 선택 = "범위" 안 전체, top4 랭킹 로직 폐지** — 사용자 요청: "기본 선택은 유료방송으로 되어있고 유료방송에 들어가는 모든 사업자 다 찍어줘야돼"(2026-09-16). 23번에서 힘들게 고쳤던 "연중 누적 합산 top4" 랭킹 로직 자체를 없애고, `metricsEnsureDefaultSelections()`가 그냥 `metricsAllOperatorGroups()`(현재 "범위" 토글이 가리키는 후보 전체, KT ENA 맨 앞 정렬)를 그대로 기본 선택으로 채우도록 단순화 — 기본값이 "유료방송" 범위이므로 첫 진입 시 KT ENA + 종편 4개 + 케이블 6개(총 11개)가 전부 체크된 채로 시작한다.
28. **[UI 정리 + 버그 수정] 출처 범례 폐지, ①②독립 선택, "전체선택" 완전 토글 (2026-09-16)** — 세 가지 지적을 한 번에 처리: (a) 화면 맨 위 "자사(ENA)/매출·M-S/시청률류 출처" 범례 칩 2개와 ②채널 옆 장문 안내문구를 전부 지적받아 삭제("이거 필요 없고", "채널 옆에 주저리주저리도 지워") — 대신 `renderMetricsDataAsOfLabel()`을 신설해 File1 metric_code='01'의 실제 최신 연/월을 "데이터 기준: YYYY년 M월" 한 줄로만 보여준다("며칠 기준인지만 띄워주면 될 거 같아 경쟁채널 지표에 있는 날짜로"). (b) "사업자선택이랑 채널선택이 자유롭지 않네? 그냥 이거 독립적으로 선택하게 하자" — ②채널 후보 목록을 `metricsChannelsForOperators(metricsSelectedOperators)`(①이 체크한 것만)에서 `metricsChannelsForOperators(metricsAllOperatorGroups())`(범위 안 전체 사업자 채널)로 바꾸고, `onMetricsOperatorCheckboxChange()`에서 ①이 바뀔 때 ②선택을 잘라내던 캐스케이딩 코드를 제거 — 이제 ①②는 완전히 독립이다. (c) **[치명적, 수정됨]** "전체를 누르면 체크가 됐다가 전체가 해제될 수도 있게 돼야지" — `metricsEnsureDefaultSelections()`가 `metricsSelectedOperators.length === 0`을 "아직 기본값을 안 채웠다"는 신호로 오해해, 사용자가 "전체선택" 체크박스로 전부 해제해도(배열이 다시 `[]`가 됨) 다음 렌더에서 곧바로 기본값(범위 안 전체)으로 도로 채워져 **전체 해제가 물리적으로 불가능했다**. `metricsOperatorsInitialized`(state.js) 불린 플래그를 신설해 "최초 1회만 기본값 채움"과 "지금 선택이 0개"를 구분 — 플래그가 이미 true면 배열이 비어 있어도 다시 채우지 않는다.

## 남은 확인 필요
1. 상세표(`metricsDetail`)의 16개 지표 중 03/08/09/11 외 나머지(01/02는 미사용, 04/05/06/07/10/12~16)는 라벨 자체에 단위가 괄호로 적혀 있다(예: "13. 광고주 당 매출(백만원)") — `metricsFormatRatingValue()`의 최종 `else` 분기는 지금 전부 "숫자만" 표기라 이 단위 텍스트를 반영하지 않는다. 틀린 값은 아니지만(원본 숫자 그대로 표기) 단위 표기가 빠져 있다 — 필요하면 라벨의 괄호 안 텍스트를 그대로 읽어 접미사로 붙이는 개선을 나중에 추가.
2. SBS미디어넷→SBS Plus 근사(위 6번) — 실제 화면에서 이 근사가 괜찮은지 사람 확인 필요.
3. ~~File1 원본 파일 용량이 46MB로 커서 클라이언트 첫 진입이 느릴 수 있다~~ — Supabase 전환(위 참고)으로 해소됨. 이제 클라이언트는 `competitor_ratings`(21,258행) JSON만 받는다 — 46MB xlsx 자체는 ETL 실행 시에만 Node가 읽는다.
