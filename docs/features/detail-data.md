# 세부데이터 탐색 (자유 피벗 빌더)

**코드**: `js/features/detail-data.js` · **뷰**: `detailData` (`js/core/view-router.js`) · **진입**: 헤더 상시 버튼 `openDetailDataView()`

## 개요
기존 6개 상세 피벗(`js/features/detail-pivots.js`)은 행·열 조합이 코드에 고정돼 있다. 이 탭은 엑셀 피벗테이블처럼 우측 필드 패널에서 필터/열/행/값 4개 영역으로 드래그앤드롭해 배치를 바꿀 때마다 `rawData`를 다시 훑어 그 자리에서 재집계하는 **완전 반응형** 탐색용 탭이다.

- **상단 전역 필터바를 그대로 반영한다.** `getDetailDataBaseRows()`가 `filteredData`(=`applyFilters()` 결과)에서 시작 — 본부매출 고정, 매출기준(취급고/회계) 토글, 연/월/부서/채널/방송·디지털/대분류 드롭다운, 대행사·광고주 검색이 모두 상단과 동일하게 적용된다. `applyFilters()`도 `currentView==='detailData'`일 때 `renderDetailDataPivot()`을 호출하도록 등록돼 있어(`js/core/filters.js`), 이 탭을 보고 있는 중에 상단 필터를 바꾸면 즉시 재집계된다.
- **아래쪽 드래그앤드롭 필터 well은 보조 수단.** 상단 필터바가 이미 커버하는 6개 필드(연/월/부서/채널/방송디지털/대분류)는 필터 well에 놓을 수 없다(행/열/값에는 계속 배치 가능) — `DD_FILTER_BAR_COVERED_FIELDS`로 `onDetailDataWellDrop`/`onDetailDataChipDrop`에서 가드. 대행사/광고주는 상단 검색이 부분일치라 더 좁히고 싶을 수 있어 필터 well에서도 예외적으로 허용. 나머지(담당자/대행사그룹/중분류/소분류/업종/회계계정/업프론트여부)만 순수하게 이 탭 전용 추가 필터다.
- **본부매출 기준은 고정 전제.** 상단 필터바에서도 항상 강제되는 값이라 `DETAIL_DATA_FIELDS`에 필터 필드로 노출하지 않는다.
- **캐시 없음.** 필드 배치가 바뀔 때마다 `renderDetailDataPivot()`이 처음부터 다시 계산한다.
- 기존 6개 피벗 탭(`detail-pivots.js`)은 이 작업으로 전혀 수정하지 않았다.

## 레이아웃
엑셀 피벗테이블과 동일한 배치: 표가 좌측 메인 영역에서 상단부터 바로 시작하고(`.dd-main`), 필드 패널은 우측에 좁게 고정된 사이드바(`.dd-sidebar`, `position: sticky`)로 붙는다. 필터 well에 놓인 필드는 사이드바 안의 압축 칩(순서·제거용)과, 표 바로 위 `#ddFilterBar`의 값 선택용 드롭다운 칩(엑셀의 상단 필터 드롭다운과 동일 위치) 두 곳에 동시에 반영된다 — 둘 다 같은 `detailDataConfig.filters`를 읽고 쓰는 서로 다른 렌더 표면일 뿐이다.

## 전역 상태 (`js/core/state.js`)
```js
detailDataConfig = {
  filters: [ { field, selected: [] }, ... ],           // 기본 빈 배열 — 사용자가 드래그해야 채워짐
  rows: [ 'dept', 'manager', ... ],                     // 필드 key 배열, 순서 = 중첩 순서
  columns: [ ... ],
  values: [ { id: 0, field: 'amount', agg: 'sum' } ]    // id로 개별 식별 — 같은 필드를 여러 번 넣을 수 있음
};
detailDataValueIdCounter    // 다음에 추가될 값(values) 항목의 id
expandedDetailDataPivot     // 트리 접기/펼치기 상태. 키는 조상 경로를 '||'로 join.
detailDataDragPayload       // 드래그 중인 { field, valueId } (valueId: 값 영역 내 기존 항목 재정렬 시에만 채워짐)
detailDataOpenFilterField   // 값 선택 팝오버가 열려있는 필터 필드 key
```
매출기준(취급고/회계)은 이 탭 전용 상태 없이 전역 `revenueBasisMode`를 그대로 쓴다(상단 토글 하나로 통일).

## 필드 카탈로그
`DETAIL_DATA_FIELDS` — `rawData`/`filteredData` row의 camelCase 필드명을 그대로 사용(16개). `bonbuRevenueStatus`(항상 본부매출 고정)와 매출기준 토글에 대응하는 의사 필드는 목록에 없다. **대분류는 `categoryReclassified`(재분류된 5대분류)를 노출** — 다른 상세 피벗(`detail-pivots.js`)·상단 필터바와 동일한 기준으로 맞춰서, skylife큐톤 같은 재분류 예외 건이 여기서도 큐톤광고로 집계된다. 원본대분류(`categoryOriginal`)는 이 탭에서 제외.

## 값(Values) — 다중 필드 + 집계방식, 필터/행/열과 완전히 독립
- 값 well에는 **`amount`를 포함해 어떤 필드든** 여러 개 동시에 배치할 수 있다. 이미 필터/행/열에 쓰이고 있는 필드도 값에 자유롭게 추가할 수 있고, **같은 필드를 값 안에서 여러 번**(예: 광고주 합계 + 광고주 평균 + 광고주 개수) 넣을 수 있다 — 값 항목마다 `id`로 구분되므로 하나를 지워도 나머지엔 영향 없음.
- 필드별 집계방식(`agg`)을 칩에 붙은 `<select>`(`.dd-agg-select`, `setDetailDataValueAgg(id, agg)`)로 선택: `sum`(합계)·`avg`(평균)는 `amount`에서만, `count`(개수)·`distinct`(고유 개수)는 모든 필드에서 가능(`getDetailDataAggOptions()`). `amount`를 놓으면 기본 `sum`, 그 외 필드는 기본 `count`.
- 값이 2개 이상이면(`multiValue`) 헤더 맨 아래에 "합계 : 금액" 식 값 라벨 행이 추가되고, 각 열 조합이 값 개수만큼 하위 컬럼으로 갈라진다. 값이 1개일 땐 기존과 동일하게 별도 행 없이 표시.

## 집계 로직
- `getDetailDataBaseRows()` — `filteredData`(상단 전역 필터바 적용 결과)에서 시작해, `detailDataConfig.filters`를 순회하며 그 위에 얹는 추가 드래그앤드롭 필터를 적용한다. `selected`가 비어있으면 그 필드는 통과.
- `buildDetailDataTree(rows, rowFieldDefs, colFieldDefs, valueDefs)` — 행 필드 깊이만큼 재귀 그룹핑. 각 노드는 `metrics[colKey] = { rowCount, sums, distinctSets }`를 열 조합별로 쌓고, 열과 무관한 노드 전체 합/고유개수용으로 `metrics['__ROWTOTAL__']`도 별도 누적한다(행 총합 열이 "각 열의 평균의 합"이 아니라 올바르게 재계산되도록). `computeDetailDataMetric(metrics, {field, agg})`가 이 raw 누적치에서 sum/avg/count/distinct 값을 뽑아낸다.
- `renderDetailDataColumnHeaderRows(colCombos, colFieldDefs, valuesPerCol)` — 정렬된 열 조합 목록에서 depth별로 동일 접두사를 묶어 colspan(× valuesPerCol)을 계산.
- `renderDetailDataNodeRows()` — 행 트리를 재귀 렌더링, 첫 번째 값 필드 기준 내림차순 정렬. 조상 경로를 `||`로 join한 키로 `expandedDetailDataPivot`을 조회(펼침 시에만 하위 재귀).

## 드래그앤드롭
- **필드 목록은 절대 항목이 사라지지 않는다** — 배치 여부와 무관하게 `DETAIL_DATA_FIELDS` 전체를 항상 보여준다(`renderDetailDataFieldListHtml()`). 어딘가에 배치된 필드는 `dd-field-chip-active` 클래스로 테두리만 강조.
- **필터 well 전용 가드**: `DD_FILTER_BAR_COVERED_FIELDS`(연/월/부서/채널/방송디지털/대분류)는 상단 전역 필터바 담당이라 필터 well로 드롭해도 무시된다(`onDetailDataWellDrop`/`onDetailDataChipDrop`에서 `wellName==='filters'`일 때 조기 return) — 행/열/값 well에는 그대로 놓을 수 있다. 필드 목록 칩에는 안내용 `title` 툴팁이 붙는다.
- **필터/행/열 세 영역끼리는 상호 배타적** — 한 필드가 이 세 곳 중 한 곳에 있으면 나머지 두 곳에서는 자동 제거(`removeDetailDataFieldFromStructuralAreas()`), 이동 시 사용.
- **값(values) 영역은 완전히 독립** — 필터/행/열에 이미 있는 필드도 값에 자유롭게 추가되고, 값 안에서 같은 필드를 여러 번(다른 `id`로) 추가할 수 있다. 필드 목록에서 값 well로 드롭할 때마다 `makeDetailDataValueEntry()`가 새 `id`를 발급해 push — 기존 값 항목을 지우지 않는다.
- 드래그 페이로드는 `{ field, valueId }` 객체(JSON 직렬화, `onDetailDataDragStart(ev, fieldKey, valueId)` → `detailDataDragPayload`). `valueId`가 있으면 "값 영역 내 기존 항목 재정렬"(이동만, 새로 추가 안 함), 없으면 "필드 목록에서 새로 끌어옴"(새 항목 추가)으로 구분.
- well 안 칩도 draggable — 같은 well 내 드롭으로 순서 변경(`onDetailDataChipDrop`), 다른 well로 드롭 시 이동(필터/행/열 한정) 또는 추가(값).
- 필드 목록(`#ddFieldList`)에 되돌리기(드래그백)하면 `removeDetailDataFieldEverywhere()`로 필터/행/열/값 전부에서 제거.
- 필터 칩(표 위 `#ddFilterBar` 쪽) 클릭 → 팝오버(`.dd-filter-popover`)에서 `rawData` 고유값 체크박스 선택.

## 표기 규칙
- `sum`/`avg` 값은 백만원 단위 **소수 1자리**(CLAUDE.md 절대원칙 8), `count`/`distinct` 값은 정수(천단위 콤마). 0/빈값은 공통으로 '-'.
