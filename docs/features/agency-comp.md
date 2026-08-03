# 대행사 전년·전월 비교

**코드**: `js/features/agency-comp.js` · **화면**: 메인 카드(차트) + `agencyCompPivot` 상세 뷰

## 개요
대행사그룹 기준 당월/전월/전년동월 비교. 매출·광고주수 토글.
- 기준: 일반광고 + IMC.
- **연도·월 각 1개 선택 시에만** 동작. 카드 클릭 → 상세 피벗.

## 핵심 함수
- `computeAgencyCompData()` — 차트·피벗 공용.
- `renderAgencyCompChart()` — 당월 매출 상위 8개 그룹, 전년/전월/당월 3막대. `agencyCompMetricMode`(revenue|count) 토글.
- `renderAgencyCompPivotTable()` — 대행사그룹 → 대행사 → 광고주 3단 트리.

## 규칙/주의
- 피벗 컬럼: 전년 / 전월 / 당월 / 전년비(%) / 전년비(금액) / 전월비(%) / 전월비(금액) — %와 금액 열 분리.
- 금액 단위(백만원)는 표 상단에 1회 표기.
- 각 단계 정렬: 당월 금액 큰 순.
- 비율: 기준0=신규, 당월0=-100%.
