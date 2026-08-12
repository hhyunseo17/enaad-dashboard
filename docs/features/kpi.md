# KPI 카드

**코드**: `js/features/kpi.js` · **화면**: 메인 상단 KPI 카드 5종

## 개요
본부 총매출 / 전년동기 대비 증감 / 광고주당 매출 / 신규 광고주 / 업프론트 실적.
- 카드별 강조색 + 클릭 가능한 카드는 해당 색 윤곽선. 연결 없는 카드(총매출·전년동기)는 hover 무반응.

## 핵심 함수
- `renderKPIs()` — 5개 카드 값 계산·표시.
- `computeUpfrontTargetDynamic()` — 선택 연/월과 겹치는 개월 월할 계산.
- `renderUpfrontKPI()` — 업프론트 실적 합계 + 달성률 + "약 XX.XX억원(월할 추정치)".

## 규칙/주의
- 집계는 filteredData(applyFilters() 적용) 기준.
- 클릭 연결: 광고주당매출→bucket, 신규광고주→newAdvPivot, 업프론트→upfrontPivot.
- 금액: 억원.
