# 상세 피벗 (항목/부서/담당자/채널/광고주/대행사별)

**코드**: `js/features/detail-pivots.js`

## 구성 (각 뷰)
- `renderCategoryPivotTable()` — 대·중·소분류 월별.
- `renderDeptPivotTable()` — 부서 → 항목 월별.
- `renderManagerPivotTable()` — 부서 → 담당자 → 대분류 → 광고주.
- `renderChannelPivotTable()` — 채널 트리.
- `renderAdvertiserPivotTable()` / `renderAgencyPivotTable()` — 광고주별 / 대행사별 (일반+IMC).

## 엔진 소비자 (programAd)
`PIVOT_PRESETS.programAdMain`(본표: 장르→프로그램→채널 × 연→월)과 `programAdDetail`(상세: 장르→프로그램 × 연→월)이 같은 엔진을 쓴다. 매출 쪽 전역이 아니라 `dataSource: programAd*DataForPivot()`(program-ad.js, 컨트롤바 필터 결과)를 읽는 지표 피벗과 같은 패턴이다. 엔진 쪽에 더해진 것은 전부 옵트인이다:
- `format.zeroDash`(0을 `-`로), `PV_VALUE_FORMAT_BY_FIELD`(값 well에 필드를 놓을 때 붙는 서식: 매출=백만원 소수1자리, GRPs=소수2자리).
- 프리셋 단위 `fieldOrderSorters`(장르 '기본 순서')·`filterBarCoveredFields`(컨트롤바가 이미 가리는 장르·프로그램을 필터 well에서 막음), `PV_ROW_SORTERS.genreOrder`.
- 값 필드 8종(`revTotal`~`grpHousehold`)은 `DD_VALUE_ONLY_FIELDS`(값 well 전용).
- 엔진은 값을 한 번에 하나만 그린다(`maxValues: 1`) — 여러 값을 나란히 놓는 표는 아니다. 값 well에서 필드를 바꿔 본다.

## 규칙/주의
- 계산 로직을 서로 공유하지 않음(각자 독립) → 역할적으로 한 파일에 묶었을 뿐.
- 전부 기본 접힘. 백만원 소수1자리.
- 광고주별/대행사별은 일반광고+IMC 기준 (표 상단 표기).
