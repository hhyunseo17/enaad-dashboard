# 상세 피벗 (항목/부서/담당자/채널/광고주/대행사별)

**코드**: `js/features/detail-pivots.js`

## 구성 (각 뷰)
- `renderCategoryPivotTable()` — 대·중·소분류 월별.
- `renderDeptPivotTable()` — 부서 → 항목 월별.
- `renderManagerPivotTable()` — 부서 → 담당자 → 대분류 → 광고주.
- `renderChannelPivotTable()` — 채널 트리.
- `renderAdvertiserPivotTable()` / `renderAgencyPivotTable()` — 광고주별 / 대행사별 (일반+IMC).

## 규칙/주의
- 계산 로직을 서로 공유하지 않음(각자 독립) → 역할적으로 한 파일에 묶었을 뿐.
- 전부 기본 접힘. 백만원 소수1자리.
- 광고주별/대행사별은 일반광고+IMC 기준 (표 상단 표기).
