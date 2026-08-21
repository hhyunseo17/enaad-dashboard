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
- `computeRevenueTargetForScope()` — 선택 연/월 스코프(미선택 시 전체)와 겹치는 `salesTargets` 전부(담당자·대분류 불문) 합산.
- `computeRevenuePerformanceActualForScope()` — 본부매출+실적(취급고)+선택 연/월 스코프로 `rawData` 집계. 좌측 부서/채널/대분류 체크박스 필터와 무관(목표가 그 축으로 안 쪼개지므로, 업프론트 계약금액 집계와 동일 원칙).
- `renderGoalKPI()` — 위 두 compute 함수로 달성률 배지(`kpiGoalAchieveBadge`)와 실적/목표 텍스트(`kpiGoalActual`/`kpiGoalSub`) 렌더 + 연간 목표 대비 진도율(`kpiGoalAnnualProgress`, `selectedYears.length === 1`일 때만 노출) 렌더. `revenueBasisMode === 'accounting'`(회계기준)이면 계산하지 않고 `-`/배지 숨김/진도율 숨김/"회계기준 목표 미제공"으로 빈칸 처리(목표가 취급고 전용이라 회계기준과 섞으면 기준이 어긋나기 때문).
- `renderGoalTrendChart()` — `chartGoalTrend` 캔버스에 연/월 스코프의 월별 목표·실적 막대. `goalTrendMode`(`'monthly'`|`'cumulative'`, 기본 `'monthly'`, `setGoalTrendMode()`로 토글, 버튼 id `btnGoalTrendMonthly`/`btnGoalTrendCumulative`)로 월별/누적 전환. **누적은 `cumulativeByYear()`로 연도가 바뀔 때 0에서 다시 쌓는다** — 목표가 연 단위 편성이라 "연초부터 얼마나 왔는가"가 읽는 값이고, 2025+2026을 함께 볼 때 24개월을 통으로 누적하면 연도 간 비교가 불가능해지기 때문. 누적 모드에서는 범례가 "누적 목표/누적 실적", 툴팁이 "(연초부터 누적)"·"누적 달성률"로 바뀐다.
- `renderGoalBreakdownChart()` — `chartGoalBreakdown` 캔버스에 **현재 선택된 연/월 스코프** 기준 부서별 또는 담당자별 목표(line) 대비 실적(bar) 콤보 차트. `goalBreakdownMode`(`'dept'`|`'manager'`, 기본 `'dept'`, `js/features/shared-helpers.js`의 `setGoalBreakdownMode()`로 토글, 버튼 id `btnGoalBreakdownDept`/`btnGoalBreakdownManager`)로 그룹 축 전환. 그룹키는 `salesTargets[].dept`/`rawData[].dept`(부서 모드) 또는 `salesTargets[].manager`/`rawData[].manager`(담당자 모드) — 좌측 부서/채널/대분류 체크박스 필터는 미반영(목표가 그 축으로 안 쪼개지므로 KPI 카드와 동일 원칙), 연/월 스코프만 반영. 부서 모드는 `customDeptOrder` 순서로, 담당자 모드는 목표+실적 합산 큰 순으로 정렬(상한 없음 — 목표가 있는 담당자는 전부 포함). 툴팁에 그룹별 달성률(%) 표시. 회계기준일 때는 캔버스를 숨기고 `chartGoalBreakdownPlaceholder`에 "취급고 기준에서만 제공됩니다" 안내 문구를 표시.

## 목표 대비 실적 피벗 (두 차트의 드릴다운)
두 차트 카드를 클릭하면 각각 피벗 뷰로 진입한다 — `openGoalTrendPivotView()`(`goalTrendPivot`) / `openGoalDeptPivotView()`(`goalDeptPivot`).

- `renderGoalTrendPivotTable()` — 행: 대분류(5대분류 고정순). 열: 연 → 월 → 목표/실적/달성률.
- `renderGoalDeptPivotTable()` — 행: 부서 → 담당자 → 대분류(부서만 `compareDeptOrder`, 담당자는 목표+실적 합 큰 순). 열 동일. 트리 접힘 상태는 `expandedGoalDeptPivot`, 기본 전부 접힘.
- 공용: `buildGoalPivotAxis()`(열 축) · `goalPivotSourceRows()`(목표/실적 원천) · `goalAddToNode()`(누적) · `goalPivotHeaderHtml()`(헤더 3줄) · `goalCellsHtml()`/`goalTriCells()`(셀 3칸).
- **헤더가 3줄이라 이 두 표만 `.pivot-tri-header` 클래스를 단다**(`css/pivot-table.css`). 다른 피벗은 2줄이며, 세 번째 줄의 sticky `top:64px`은 앞 두 줄이 각 32px이라는 기존 가정을 그대로 이어받는다.
- 연도 열 펼침: `expandedGoalTrendYearColumns` / `expandedGoalDeptYearColumns`, `toggleYearColumn('goalTrend'|'goalDept', yr)`. `expandAllYears()`는 이 둘만 `filteredData`가 아니라 `buildGoalScopeSet()`에서 연도를 뽑고 `applyFilters()`를 거치지 않는다(열 축이 목표 스코프에서 나오므로).
- 달성률은 **실적합 ÷ 목표합**이다(개별 달성률의 평균이 아니다). 목표가 0이면 `-`. 금액 단위는 다른 피벗과 같이 백만원.
- 회계기준이면 차트와 동일하게 "취급고 기준에서만 제공됩니다"만 표시(`renderGoalPivotUnavailable()`).
- 엑셀 다운로드: `exportGoalPivotExcel('trend'|'dept')`. 화면의 넓은 표가 아니라 **롱 포맷**(한 행 = 연월×축 조합)으로 내보낸다 — 병합 헤더는 엑셀에서 다시 피벗을 돌릴 수 없기 때문. 금액은 **백만원 소수 1자리**로, 기존 `exportPivotExcel()` 시트들의 정수 반올림과 다르다(행이 잘게 쪼개져 정수로 버리면 합계가 8백만원까지 어긋났다). 회계기준에서는 alert로 차단.
- **집계 규칙은 연결된 차트와 반드시 같아야 한다** — 스코프 `buildGoalScopeSet()`, 본부매출+실적만, 좌측 체크박스 필터 미반영. 검증: 4개 시나리오(전체/2026/2026 1~3월/2025)에서 피벗 총합계 = `computeRevenueTargetForScope()`/`computeRevenuePerformanceActualForScope()` 일치 확인.

> **알려진 특성(피벗이 원인 아님)**: 연/월을 아무것도 선택하지 않으면 달성률이 138.3%로 나온다. `salesTargets`는 2023년부터만 있는데 실적은 2019년부터 있어, 목표가 없는 2019~2022 실적이 분자에만 들어가기 때문이다. KPI 카드·차트도 같은 값을 낸다. 피벗에서는 2019~2022 열의 목표가 `-`로 보여 원인이 드러난다.

## 규칙/주의
- 총매출/전년동기/광고주당/신규광고주 카드는 filteredData(applyFilters() 적용) 기준. 목표 대비 달성률(KPI+차트+피벗)만 예외적으로 본부매출+실적+연월 스코프 고정 집계(좌측 체크박스 필터 미반영).
- 클릭 연결: 광고주당매출→bucket, 신규광고주→newAdvPivot, 업프론트→upfrontPivot, 월별 목표차트→goalTrendPivot, 부서별 목표차트→goalDeptPivot. 목표 대비 달성률 **카드**는 클릭 연결 없음.
- 금액: 억원.
- `renderGoalBreakdownChart()`는 `js/core/view-router.js`의 `renderDashboard()`에서 `renderTrendChart()` 옆에 같이 호출됨.
