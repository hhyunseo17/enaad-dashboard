# 세부데이터 탐색 (자유 피벗 빌더)

**코드**: `js/features/detail-data.js` · **뷰**: `detailData` (`js/core/view-router.js`) · **진입**: 헤더 상시 버튼 `openDetailDataView()`

## 개요
기존 6개 상세 피벗(`js/features/detail-pivots.js`)은 행·열 조합이 코드에 고정돼 있다. 이 탭은 엑셀 피벗테이블처럼 우측 필드 패널에서 필터/열/행/값 4개 영역으로 드래그앤드롭해 배치를 바꿀 때마다 `rawData`를 다시 훑어 그 자리에서 재집계하는 **완전 반응형** 탐색용 탭이다.

- **상단 전역 필터바와 무관한 독립형.** `applyFilters()`를 호출하지 않고 `rawData`를 직접 읽는다.
- **본부매출 기준은 고정 전제.** `getDetailDataBaseRows()`에서 `bonbuRevenueStatus==='본부매출'`을 항상 강제하며, 필터 필드로 노출/변경할 수 없다(`DETAIL_DATA_FIELDS`에도 없음).
- **매출기준(취급고/회계)은 상단 상시 토글.** 전역 필터바의 매출 기준 토글과 동일한 UI(`revenue-basis-toggle`/`revenue-basis-btn`)를 이 탭 전용 상태(`detailDataRevenueBasisMode`)로 재사용. 드래그앤드롭 필드 목록에는 존재하지 않는다 — `setDetailDataRevenueBasisMode(mode)`로만 변경.
- **캐시 없음.** 필드 배치가 바뀔 때마다 `renderDetailDataPivot()`이 처음부터 다시 계산한다.
- 기존 6개 피벗 탭(`detail-pivots.js`)은 이 작업으로 전혀 수정하지 않았다.

## 레이아웃
엑셀 피벗테이블과 동일한 배치: 표가 좌측 메인 영역에서 상단부터 바로 시작하고(`.dd-main`), 필드 패널은 우측에 좁게 고정된 사이드바(`.dd-sidebar`, `position: sticky`)로 붙는다. 필터 well에 놓인 필드는 사이드바 안의 압축 칩(순서·제거용)과, 표 바로 위 `#ddFilterBar`의 값 선택용 드롭다운 칩(엑셀의 상단 필터 드롭다운과 동일 위치) 두 곳에 동시에 반영된다 — 둘 다 같은 `detailDataConfig.filters`를 읽고 쓰는 서로 다른 렌더 표면일 뿐이다.

## 전역 상태 (`js/core/state.js`)
```js
detailDataConfig = {
  filters: [ { field, selected: [] }, ... ],       // 기본 빈 배열 — 사용자가 드래그해야 채워짐
  rows: [ 'dept', 'manager', ... ],                 // 필드 key 배열, 순서 = 중첩 순서
  columns: [ ... ],
  values: [ { field: 'amount', agg: 'sum' } ]       // 여러 개 배치 가능, 필드별 agg 독립 설정
};
expandedDetailDataPivot     // 트리 접기/펼치기 상태. 키는 조상 경로를 '||'로 join.
detailDataDragField         // 드래그 중인 필드 key (dataTransfer 백업용)
detailDataOpenFilterField   // 값 선택 팝오버가 열려있는 필터 필드 key
detailDataRevenueBasisMode  // 'performance'(취급고, 기본값) | 'accounting'(회계) — 상단 토글 전용, filters 배열과 무관
```

## 필드 카탈로그
`DETAIL_DATA_FIELDS` — `rawData` row의 camelCase 필드명을 그대로 사용(16개). `bonbuRevenueStatus`(항상 본부매출 고정)와 매출기준 토글에 대응하는 의사 필드는 목록에 없다. **대분류는 `categoryOriginal`(원본대분류)만 노출** — 재분류된 `categoryReclassified`(다른 피벗의 '대분류')와 나란히 두면 헷갈린다는 피드백에 따라 이 탭에서는 제외.

## 값(Values) — 다중 필드 + 집계방식
- 값 well에는 **`amount`를 포함해 어떤 필드든** 여러 개 동시에 배치할 수 있다(과거엔 `amount` 1개로 고정이었음).
- 필드별 집계방식(`agg`)을 칩에 붙은 `<select>`(`.dd-agg-select`, `setDetailDataValueAgg(field, agg)`)로 선택: `sum`(합계)·`avg`(평균)는 `amount`에서만, `count`(개수)·`distinct`(고유 개수)는 모든 필드에서 가능(`getDetailDataAggOptions()`). `amount`를 놓으면 기본 `sum`, 그 외 필드는 기본 `count`.
- 값이 2개 이상이면(`multiValue`) 헤더 맨 아래에 "합계 : 금액" 식 값 라벨 행이 추가되고, 각 열 조합이 값 개수만큼 하위 컬럼으로 갈라진다. 값이 1개일 땐 기존과 동일하게 별도 행 없이 표시.

## 집계 로직
- `getDetailDataBaseRows()` — `bonbuRevenueStatus==='본부매출'`과 `detailDataRevenueBasisMode`(취급고 시 `revenueBasis==='실적'`)를 먼저 고정 적용한 뒤, `detailDataConfig.filters`를 순회하며 나머지 드래그앤드롭 필터를 적용한다. `selected`가 비어있으면 그 필드는 통과.
- `buildDetailDataTree(rows, rowFieldDefs, colFieldDefs, valueDefs)` — 행 필드 깊이만큼 재귀 그룹핑. 각 노드는 `metrics[colKey] = { rowCount, sums, distinctSets }`를 열 조합별로 쌓고, 열과 무관한 노드 전체 합/고유개수용으로 `metrics['__ROWTOTAL__']`도 별도 누적한다(행 총합 열이 "각 열의 평균의 합"이 아니라 올바르게 재계산되도록). `computeDetailDataMetric(metrics, {field, agg})`가 이 raw 누적치에서 sum/avg/count/distinct 값을 뽑아낸다.
- `renderDetailDataColumnHeaderRows(colCombos, colFieldDefs, valuesPerCol)` — 정렬된 열 조합 목록에서 depth별로 동일 접두사를 묶어 colspan(× valuesPerCol)을 계산.
- `renderDetailDataNodeRows()` — 행 트리를 재귀 렌더링, 첫 번째 값 필드 기준 내림차순 정렬. 조상 경로를 `||`로 join한 키로 `expandedDetailDataPivot`을 조회(펼침 시에만 하위 재귀).

## 드래그앤드롭
- 필드 목록 칩 → 4개 well(`ddWellFilter/Columns/Rows/Values`)로 드롭. 한 필드는 동시에 한 곳에만 존재(`removeDetailDataFieldEverywhere()`로 이동 전 제거) — 값 well도 예외 없이 필드당 1개(같은 필드를 다른 집계로 두 번 넣는 것은 미지원).
- well 안 칩도 draggable — 같은 well 내 드롭으로 순서 변경(`onDetailDataChipDrop`), 다른 well로 드롭 시 이동.
- 필드 목록(`#ddFieldList`)에 되돌리기(드래그백)도 지원.
- 필터 칩(표 위 `#ddFilterBar` 쪽) 클릭 → 팝오버(`.dd-filter-popover`)에서 `rawData` 고유값 체크박스 선택.

## 표기 규칙
- `sum`/`avg` 값은 백만원 단위 **소수 1자리**(CLAUDE.md 절대원칙 8), `count`/`distinct` 값은 정수(천단위 콤마). 0/빈값은 공통으로 '-'.
