# KPI 카드

**코드**: `js/features/kpi.js` · **화면**: 메인 상단 KPI 카드 6종 + 부서별/담당자별 목표 대비 실적 차트

## 개요
본부 총매출 / 전년동기 대비 증감 / 광고주당 매출 / 신규 광고주 / 업프론트 실적 / 본부 목표 대비 달성률.
- 카드별 강조색 + 클릭 가능한 카드는 해당 색 윤곽선. 연결 없는 카드(총매출·전년동기·목표 대비 달성률)는 hover 무반응.
- 6번째 카드 "본부 목표 대비 달성률"(`kpi-accent-teal`)은 `sales_targets`(담당자×5대분류×연월 목표, `/api/targets` → `salesTargets` 전역) 대비 **본부 전체 실적 합산 하나만** 보여준다. 카드 자체의 담당자별/대분류별 드릴다운은 범위 밖 — 대신 아래 차트가 부서/담당자 분해 뷰를 담당.
- 선택 연도가 1개일 때는 카드 하단에 "연간 목표 대비 진도율"(해당 기간 실적 ÷ 선택 연도 전체(12개월) 목표)을 작은 글씨로 추가 표시. 연도 미선택/복수선택 시 숨김.

## 핵심 함수
- `renderKPIs()` — 6개 카드 값 계산·표시(내부에서 `renderUpfrontKPI()`, `renderGoalKPI()` 호출).
- `computeUpfrontTargetDynamic()` — 선택 연/월과 겹치는 개월 월할 계산(업프론트 계약금액용).
- `renderUpfrontKPI()` — 업프론트 실적 합계 + 달성률 + "약 XX.XX억원(월할 추정치)".
- `buildGoalScopeSet()` — 목표 관련 KPI/차트/피벗이 **모두 공유하는 연-월 스코프**. 월 미선택 시 그 연도에 실적이 있는 월까지만 넣고(진행 중 연도의 9~12월 목표가 분모에 끼는 것 방지), 마지막에 **목표가 등록된 연-월만 남긴다**(`buildRegisteredTargetMonthSet()`, 월 목표 합 > 0). 목표는 2023-01~2026-12만 등록돼 있고 실적은 2019년부터 있어, 좁히지 않으면 2019~2022 실적이 분자에만 들어가 달성률이 138.3%로 부풀려졌다. 목표가 없는 기간은 달성을 따질 구간이 아니므로 **분자·분모 양쪽에서 함께 뺀다.**
- 스코프가 비면(예: 2019~2022만 선택) 달성률을 계산하지 않는다 — KPI는 `-` + "선택 기간에 등록된 목표 없음", 두 차트는 placeholder("선택 기간에 등록된 목표가 없습니다"), 두 피벗은 같은 문구의 빈 표. 예전에는 이때 목표 없이 실적 금액만 띄워, "무엇 대비"인지 알 수 없는 숫자가 남았다.
- `computeRevenueTargetForScope()` — 선택 연/월 스코프와 겹치는 `salesTargets` 전부(담당자·대분류 불문) 합산.
- `computeRevenuePerformanceActualForScope()` — 본부매출+실적(취급고)+선택 연/월 스코프로 `rawData` 집계. 좌측 부서/채널/대분류 체크박스 필터와 무관(목표가 그 축으로 안 쪼개지므로, 업프론트 계약금액 집계와 동일 원칙).
- `renderGoalKPI()` — 위 두 compute 함수로 달성률 배지(`kpiGoalAchieveBadge`)와 실적/목표 텍스트(`kpiGoalActual`/`kpiGoalSub`) 렌더 + 연간 목표 대비 진도율(`kpiGoalAnnualProgress`, `selectedYears.length === 1`일 때만 노출) 렌더. `revenueBasisMode === 'accounting'`(회계기준)이면 계산하지 않고 `-`/배지 숨김/진도율 숨김/"회계기준 목표 미제공"으로 빈칸 처리(목표가 취급고 전용이라 회계기준과 섞으면 기준이 어긋나기 때문).
- `renderGoalTrendChart()` — `chartGoalTrend` 캔버스에 연/월 스코프의 월별 목표·실적 막대. `goalTrendMode`(`'monthly'`|`'cumulative'`, 기본 `'monthly'`, `setGoalTrendMode()`로 토글, 버튼 id `btnGoalTrendMonthly`/`btnGoalTrendCumulative`)로 월별/누적 전환. **누적은 `cumulativeByYear()`로 연도가 바뀔 때 0에서 다시 쌓는다** — 목표가 연 단위 편성이라 "연초부터 얼마나 왔는가"가 읽는 값이고, 2025+2026을 함께 볼 때 24개월을 통으로 누적하면 연도 간 비교가 불가능해지기 때문. 누적 모드에서는 범례가 "누적 목표/누적 실적", 툴팁이 "(연초부터 누적)"·"누적 달성률"로 바뀐다.
- `renderGoalBreakdownChart()` — `chartGoalBreakdown` 캔버스에 **현재 선택된 연/월 스코프** 기준 부서별 또는 담당자별 목표(line) 대비 실적(bar) 콤보 차트. `goalBreakdownMode`(`'dept'`|`'manager'`, 기본 `'dept'`, `js/features/shared-helpers.js`의 `setGoalBreakdownMode()`로 토글, 버튼 id `btnGoalBreakdownDept`/`btnGoalBreakdownManager`)로 그룹 축 전환. 그룹키는 `salesTargets[].dept`/`rawData[].dept`(부서 모드) 또는 `salesTargets[].manager`/`rawData[].manager`(담당자 모드) — 좌측 부서/채널/대분류 체크박스 필터는 미반영(목표가 그 축으로 안 쪼개지므로 KPI 카드와 동일 원칙), 연/월 스코프만 반영. 부서 모드는 `customDeptOrder` 순서로, 담당자 모드는 목표+실적 합산 큰 순으로 정렬(상한 없음 — 목표가 있는 담당자는 전부 포함). 툴팁에 그룹별 달성률(%) 표시. 회계기준일 때는 캔버스를 숨기고 `chartGoalBreakdownPlaceholder`에 "취급고 기준에서만 제공됩니다" 안내 문구를 표시.

## 목표 대비 실적 피벗 (두 차트의 드릴다운)
두 차트 카드를 클릭하면 각각 피벗 뷰로 진입한다 — `openGoalTrendPivotView()`(`goalTrendPivot`) / `openGoalDeptPivotView()`(`goalDeptPivot`).

**두 표는 `renderGoalPivot(viewKey)` 하나가 그린다.** 차이는 처음 행 축뿐이고(`PIVOT_PRESETS`의 `goalTrendPivot` = `[대분류]` / `goalDeptPivot` = `[부서, 담당자, 대분류]`), 나머지 규칙은 완전히 같다. `renderGoalTrendPivotTable()`/`renderGoalDeptPivotTable()`은 뷰 키만 넘기는 래퍼로 남아 기존 진입점(`VIEW_CONFIG`·`filters.js`·`view-router.js`)이 그대로 동작한다.

- 축은 실행 중에 바꾼다 — `⚙ 표 편집`(`pvToggleBuilder`)으로 여는 빌더 사이드바에서 행/열 well을 드래그. 상태는 다른 피벗과 같은 `pivotConfigs[viewKey]`이며 `↺ 원래대로`(`pvResetPivot`)로 프리셋 복귀. 새로고침하면 프리셋으로 돌아간다.
- **놓을 수 있는 필드는 다섯 개뿐이다** — 연·월·부서·담당자·대분류(`PV_GOAL_FIELDS`). `salesTargets`가 담당자 × 5대분류 × 연월 단위라 이 다섯 안에서는 목표와 실적이 같은 칸에서 만나지만, 채널·광고주·대행사를 축에 놓으면 실적만 쪼개지고 목표는 그대로라 달성률이 거짓으로 낮아진다. 목록에서 감추는 것과 드롭 거부(`ddFieldAllowed`) 양쪽으로 막는다.
- 빌더 패널에 **필터·값 well은 두지 않는다.** 값은 목표·실적·달성률로 고정이고, 필터를 걸면 좌측 체크박스 필터를 미반영하는 것과 같은 이유로 분모만 남는다.
- 정렬: 행 라벨 우클릭 = 그 단계 필드의 정렬(실적/목표/달성률 큰·작은 순, 이름순, 부서·대분류는 기본 순서), 열 헤더 우클릭 = 그 열 기준 행 정렬 + 그 축의 나열 순서, 열 헤더 좌클릭 = 그 열 실적 기준 토글. 기본값은 예전 두 표가 쓰던 순서 그대로(부서 = 팀 번호순, 대분류 = 5대분류순, 담당자 = 목표+실적 큰 순).
- 공용: `goalPivotSourceRows()`(목표/실적 원천) · `goalRecords()`(두 소스를 같은 모양의 레코드 한 벌로) · `goalBuildTree()`(행 N단계 × 열 N단계) · `goalCellsHtml()`/`goalTriCells()`(셀 3칸). 열 축 조립·헤더 렌더·접기는 일반 피벗과 같은 `pivot-builder.js` 함수를 쓴다(`pvBuildVisibleColumns`/`pvRenderColumnHeaderRows`, 후자에 `spanMul:3`을 넘겨 한 열을 세 칸으로 벌린다).
- **헤더가 3줄이라 이 두 표만 `.pivot-tri-header` 클래스를 단다**(`css/pivot-table.css`). 다른 피벗은 2줄이다. 줄 수는 **열 축 깊이 + 지표 한 줄**이라 축을 바꾸면 2~6줄이 되므로 `thead`를 통째로 다시 그리고, sticky `top`은 각 줄 32px 가정으로 6줄까지 정의돼 있다.
- 행 트리 펼침: `expandedGoalDeptPivot` / `expandedGoalTrendPivot`(뷰별로 따로, 기본 전부 접힘), `toggleGoalPivotNode(viewKey, pathKey)`.
- 연도 열 펼침: `expandedGoalTrendYearColumns` / `expandedGoalDeptYearColumns`, 헤더의 `+/-`는 `togglePvColNode(viewKey, 값)`(일반 피벗과 공용). `expandAllYears()`는 이 둘만 `filteredData`가 아니라 `buildGoalScopeSet()`에서 연도를 뽑고 `applyFilters()`를 거치지 않는다(열 축이 목표 스코프에서 나오므로).
- 달성률은 **실적합 ÷ 목표합**이다(개별 달성률의 평균이 아니다). 목표가 0이면 `-`. 금액 단위는 다른 피벗과 같이 백만원.
- 회계기준이면 차트와 동일하게 "취급고 기준에서만 제공됩니다"만 표시(`renderGoalPivotUnavailable()`).
- 엑셀 다운로드: `exportGoalPivotExcel('trend'|'dept')`. 화면의 넓은 표가 아니라 **롱 포맷**(한 행 = 연월×축 조합)으로 내보낸다 — 병합 헤더는 엑셀에서 다시 피벗을 돌릴 수 없기 때문. 축 열은 **현재 화면의 행·열 구성을 그대로 따라간다**(연·월은 고정 열이라 제외). 회계기준·목표 미등록 스코프에서는 alert로 차단.
- **집계 규칙은 연결된 차트와 반드시 같아야 한다** — 스코프 `buildGoalScopeSet()`, 본부매출+실적만, 좌측 체크박스 필터 미반영. 검증: 4개 시나리오(전체/2026/2026 1~3월/2025)에서 피벗 총합계 = `computeRevenueTargetForScope()`/`computeRevenuePerformanceActualForScope()` 일치 확인.

### 금액은 원 단위로 들고 있다가 표시할 때만 줄인다
목표 피벗의 누적(`goalBuildTree`)은 **원 단위 정수**로 하고 백만원 환산은 `goalTriCells()`에서만 한다. 차트의 누적(`cumulativeByYear`)도 원 단위로 더한 뒤 마지막에 억으로 나눈다. 엑셀 export는 `목표(원)`/`실적(원)` 컬럼으로 **반올림 없이** 원 단위 정수를 낸다(기존 `exportPivotExcel()` 시트들이 백만원 정수를 쓰는 것과 다르다).

축소된 단위로 쌓으면 행마다 반올림이 겹친다. 부서별 피벗은 행이 연월×부서×담당자×대분류까지 쪼개져 2026년 기준 248행인데, 백만원으로 줄여 내보냈을 때 합계가 대시보드와 **8백만원** 어긋났다(소수 1자리로도 1백만원이 남았다). 엑셀에서 다시 합산해 화면과 대조하는 표라 그 차이가 그대로 드러난다. 원 단위로 내면 오차가 정확히 0이다.

## 규칙/주의
- 총매출/전년동기/광고주당/신규광고주 카드는 filteredData(applyFilters() 적용) 기준. 목표 대비 달성률(KPI+차트+피벗)만 예외적으로 본부매출+실적+연월 스코프 고정 집계(좌측 체크박스 필터 미반영).
- 클릭 연결: 광고주당매출→bucket, 신규광고주→newAdvPivot, 업프론트→upfrontPivot, 월별 목표차트→goalTrendPivot, 부서별 목표차트→goalDeptPivot. 목표 대비 달성률 **카드**는 클릭 연결 없음.
- 금액: 억원.
- `renderGoalBreakdownChart()`는 `js/core/view-router.js`의 `renderDashboard()`에서 `renderTrendChart()` 옆에 같이 호출됨.
