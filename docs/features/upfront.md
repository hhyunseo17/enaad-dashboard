# 업프론트 계약 대비 실적

**코드**: `js/features/upfront.js` · **화면**: KPI 카드 + `upfrontPivot` 상세 뷰

## 개요
업프론트 계약금액(근사) 대비 실제 실적. 부서→광고주(업프론트용)→대행사 피벗.

## 핵심 함수
- `computeUpfrontTargetDynamic()` — 선택 연/월과 겹치는 개월 월할 계산.
- `renderUpfrontKPI()` — 실적 합계 + 달성률 + "약 XX.XX억원(월할 추정치)".
- `computeUpfrontPivotData()` / `renderUpfrontPivotTable()` — 연도 1개 선택 시. 계약금액/시작일/종료일 참고열 + 월별 실적.

## 규칙/주의 (★ data-rules.md 6·7 필수)
- 계약 병합/파싱은 **data-loader에서** 완료된 값을 쓴다. 여기서 재파싱 금지.
- 계약금액은 근사치. 연걸침은 팀 수기배분이라 재현 불가.
- 부서 정렬: customDeptOrder(1·2·3팀 순).
- 겹치는 동일 계약금액 텍스트는 참고열에서 병합 표시.
