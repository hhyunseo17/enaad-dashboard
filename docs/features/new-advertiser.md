# 신규 광고주

**코드**: `js/features/new-advertiser.js` · **화면**: KPI 카드 + `newAdvPivot` 상세 뷰

## 개요
직전 12개월 매출 이력이 없는 광고주 = 신규.
- 기준: 일반광고 + IMC. 배분수익·1/N 제외.

## 핵심 함수
- `computeNewAdvertiserData()` — 선택된 연/월 조합별로 신규 광고주 집계, **연 > 월** 2단 트리로 반환(`{ [year]: { year, months: { [year-month]: {...} }, monthKeys, advCount, monthTotalSum, yearTotalSum } }`). 연도별 누적매출 사전집계(O(n)).
- `isNewAdvertiserMonth()` — 광고주별 활동월 인덱스(`advertiserActiveMonthIndex`) 기반 판별.
- `renderNewAdvPivotTable()` — 연(`toggleNewAdvYear`/`expandedNewAdvYears`) → 월(`toggleNewAdvGroup`/`expandedNewAdvGroups`) → 광고주 3단 토글. 컬럼: 광고주수 / 해당월 매출 / 해당연도 누적매출. 연 행은 그 연도에 속한 월들의 합계(소계)를 표시.

## 규칙/주의
- 성능: 신규 판별은 O(n²) 금지. 사전 인덱스 사용.
- 선택된 여러 연도를 각각 별도 연 그룹(소계 포함)으로, 그 안에 월을 중첩해서 표시.
