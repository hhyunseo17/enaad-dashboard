// ============================================================
// js/features/detail-data.js
// 세부데이터 탐색: 자유 탐색형 피벗 빌더 (필터/열/행/값 드래그앤드롭 + rawData 즉시 재집계)
// 전역 필터바(applyFilters())와 무관한 독립 탭 — rawData를 직접 읽는다.
// ============================================================
    const DETAIL_DATA_FIELDS = [
      { key: 'year', label: '연' }, { key: 'month', label: '귀속월' },
      { key: 'dept', label: '부서' }, { key: 'manager', label: '담당자' },
      { key: 'advertiser', label: '광고주' }, { key: 'agency', label: '대행사' }, { key: 'agencyGroup', label: '대행사그룹' },
      { key: 'categoryReclassified', label: '대분류' },
      { key: 'subCategory', label: '중분류' }, { key: 'subCategory3', label: '소분류' },
      { key: 'channel', label: '채널' }, { key: 'industry', label: '업종' }, { key: 'broadDigital', label: '방송/디지털' },
      { key: 'revenueBasis', label: '회계계정' }, { key: 'isUpfront', label: '업프론트여부' },
      { key: 'amount', label: '금액' }
    ];
    // 상단 전역 필터바가 이미 연/월/부서/채널/방송·디지털/대분류를 커버하므로, 아래쪽 드래그앤드롭
    // 필터 well에는 이 필드들을 놓을 수 없다(행/열/값에는 계속 쓸 수 있음) — onDetailDataWellDrop/onDetailDataChipDrop에서 가드.
    // 대행사/광고주는 전역 검색이 부분일치라 별도로 더 좁히고 싶을 수 있어 필터 well에서도 허용.
    const DD_FILTER_BAR_COVERED_FIELDS = new Set(['year', 'month', 'dept', 'channel', 'broadDigital', 'categoryReclassified']);

    const DETAIL_DATA_AGG_LABELS = { sum: '합계', avg: '평균', count: '개수', distinct: '고유 개수' };

    function detailDataFieldLabel(key) { const f = DETAIL_DATA_FIELDS.find(x => x.key === key); return f ? f.label : key; }
    function ddEsc(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
    function getDetailDataAggOptions(field) { return field === 'amount' ? ['sum', 'avg', 'count', 'distinct'] : ['count', 'distinct']; }
    function getDetailDataValueLabel(v) { return `${DETAIL_DATA_AGG_LABELS[v.agg] || v.agg} : ${detailDataFieldLabel(v.field)}`; }

    function fmtDetailDataAmount(won) {
      const m = (won || 0) / 1000000;
      return m.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    }
    function fmtDetailDataMetricCell(value, agg) {
      if (agg === 'sum' || agg === 'avg') return value ? fmtDetailDataAmount(value) : '-';
      return value ? value.toLocaleString('ko-KR') : '-';
    }

    // 행/열 트리의 그룹 라벨 표시용 — 연/월은 숫자 그대로가 아니라 "2026년"/"1월"로 표기.
    function ddFormatFieldValue(fieldKey, rawValue) {
      if (rawValue === '(미지정)') return rawValue;
      if (fieldKey === 'year') return `${rawValue}년`;
      if (fieldKey === 'month') return `${rawValue}월`;
      return rawValue;
    }

    // ==========================================================================
    // 집계 로직
    // ==========================================================================
    function getDetailDataBaseRows() {
      // 본부매출/매출기준/연·월/부서/채널/방송디지털/대분류/대행사·광고주 검색은 상단 전역 필터바(filteredData)가 이미 적용.
      return filteredData.filter(r => {
        return detailDataConfig.filters.every(f => {
          if (!f.selected || f.selected.length === 0) return true;
          return f.selected.includes(String(r[f.field]));
        });
      });
    }

    function setDetailDataValueAgg(id, agg) {
      const v = detailDataConfig.values.find(x => x.id === id);
      if (!v) return;
      v.agg = agg;
      renderDetailDataPivot();
    }

    // 노드 하나의 특정 colKey(또는 '__ROWTOTAL__') 구간에 누적되는 원시 집계치.
    // sum/avg는 sums[field], count는 rowCount, distinct는 distinctSets[field]에서 계산.
    function computeDetailDataMetric(metrics, v) {
      if (!metrics) return 0;
      if (v.agg === 'sum') return metrics.sums[v.field] || 0;
      if (v.agg === 'avg') return metrics.rowCount ? (metrics.sums[v.field] || 0) / metrics.rowCount : 0;
      if (v.agg === 'count') return metrics.rowCount || 0;
      if (v.agg === 'distinct') return metrics.distinctSets[v.field] ? metrics.distinctSets[v.field].size : 0;
      return 0;
    }

    // rowFieldDefs/colFieldDefs 깊이만큼 재귀 그룹핑. valueDefs(복수 가능)별로 sum/avg/count/고유개수를 함께 누적.
    // '__ROWTOTAL__'은 열 구분과 무관하게(=행 전체 기준) 그 노드의 총합/고유개수를 구하기 위한 전용 버킷.
    function buildDetailDataTree(rows, rowFieldDefs, colFieldDefs, valueDefs) {
      const normalize = (v) => (v === undefined || v === null || v === '') ? '(미지정)' : v;
      const sumFields = new Set(valueDefs.filter(v => v.agg === 'sum' || v.agg === 'avg').map(v => v.field));
      const distinctFields = new Set(valueDefs.filter(v => v.agg === 'distinct').map(v => v.field));

      const colComboMap = new Map();
      rows.forEach(r => {
        const combo = colFieldDefs.map(cf => normalize(r[cf.key]));
        const key = combo.length ? combo.join('||') : '__TOTAL__';
        if (!colComboMap.has(key)) colComboMap.set(key, combo);
      });
      if (colFieldDefs.length === 0) colComboMap.set('__TOTAL__', []);
      const colCombos = [...colComboMap.values()].sort((a, b) => {
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
          const c = String(a[i] ?? '').localeCompare(String(b[i] ?? ''), 'ko');
          if (c !== 0) return c;
        }
        return 0;
      });
      const colKeys = colCombos.map(c => c.length ? c.join('||') : '__TOTAL__');

      const makeNode = () => ({ metrics: {}, children: {} });
      const root = makeNode();

      function touchNode(node, key, r) {
        if (!node.metrics[key]) node.metrics[key] = { rowCount: 0, sums: {}, distinctSets: {} };
        const m = node.metrics[key];
        m.rowCount++;
        sumFields.forEach(f => { m.sums[f] = (m.sums[f] || 0) + (Number(r[f]) || 0); });
        distinctFields.forEach(f => { if (!m.distinctSets[f]) m.distinctSets[f] = new Set(); m.distinctSets[f].add(r[f]); });
      }

      rows.forEach(r => {
        const combo = colFieldDefs.map(cf => normalize(r[cf.key]));
        const colKey = combo.length ? combo.join('||') : '__TOTAL__';

        let node = root;
        touchNode(node, colKey, r); touchNode(node, '__ROWTOTAL__', r);

        rowFieldDefs.forEach(rf => {
          const val = normalize(r[rf.key]);
          if (!node.children[val]) node.children[val] = makeNode();
          node = node.children[val];
          touchNode(node, colKey, r); touchNode(node, '__ROWTOTAL__', r);
        });
      });

      return { root, colCombos, colKeys };
    }

    function ddArraysEqual(a, b) { return a.length === b.length && a.every((v, i) => v === b[i]); }

    // colCombos(정렬된 leaf 조합 목록)를 depth별 값 트리로 재구성. 각 노드는 그 아래 모든 leaf 조합의 join key 목록(leafKeys)을 들고 있다
    // — 열이 접혔을 때 그 leafKeys를 모두 합산해서 하나의 병합 열로 보여주기 위함.
    function buildDetailDataColumnValueTree(colCombos) {
      const root = { children: new Map(), leafKeys: [] };
      colCombos.forEach(combo => {
        let node = root;
        combo.forEach(val => {
          if (!node.children.has(val)) node.children.set(val, { children: new Map(), leafKeys: [] });
          node = node.children.get(val);
        });
        node.leafKeys.push(combo.length ? combo.join('||') : '__TOTAL__');
      });
      (function propagate(node) {
        if (node.children.size === 0) return node.leafKeys;
        let all = [];
        node.children.forEach(c => { all = all.concat(propagate(c)); });
        node.leafKeys = all;
        return all;
      })(root);
      return root;
    }

    // 행과 동일한 "기본 접힘" 규칙: 열 필드의 1레벨(값) 자체는 항상 보이고, 그 하위 레벨은 expandedDetailDataColPivot에
    // 펼쳐진 경로만 재귀 진입 — 접힌 그룹은 leafKeys를 그대로 들고 있는 병합 열 1개로 축약된다.
    function walkDetailDataColumnNode(node, depth, path, colFieldDefsLen, visibleColumns) {
      const isLastDepth = depth === colFieldDefsLen;
      if (isLastDepth) {
        visibleColumns.push({ path: path.slice(), leafKeys: node.leafKeys, canToggle: false, isExpanded: false, pathKey: path.join('||') });
        return;
      }
      const pathKey = path.join('||');
      const isExpanded = !!expandedDetailDataColPivot[pathKey];
      if (!isExpanded) {
        visibleColumns.push({ path: path.slice(), leafKeys: node.leafKeys, canToggle: true, isExpanded: false, pathKey });
        return;
      }
      const childVals = [...node.children.keys()].sort((a, b) => String(a).localeCompare(String(b), 'ko'));
      childVals.forEach(v => walkDetailDataColumnNode(node.children.get(v), depth + 1, path.concat(v), colFieldDefsLen, visibleColumns));
    }

    // 실제로 렌더링될 열(펼쳐진 leaf 또는 접힌 병합 그룹) 목록을 반환.
    function buildDetailDataVisibleColumns(colCombos, colFieldDefsLen) {
      if (colFieldDefsLen === 0) return [{ path: [], leafKeys: ['__TOTAL__'], canToggle: false, isExpanded: false, pathKey: '' }];
      const tree = buildDetailDataColumnValueTree(colCombos);
      const visibleColumns = [];
      const topVals = [...tree.children.keys()].sort((a, b) => String(a).localeCompare(String(b), 'ko'));
      topVals.forEach(v => walkDetailDataColumnNode(tree.children.get(v), 1, [v], colFieldDefsLen, visibleColumns));
      return visibleColumns;
    }

    // visibleColumns 기준 depth별 그룹핑 헤더 행 <th> 배열 반환. 접힌 그룹은 자기 depth에서 남은 헤더 행 전부를 rowspan으로 덮고 토글 아이콘을 붙인다.
    function renderDetailDataColumnHeaderRows(visibleColumns, colFieldDefs, valuesPerCol) {
      const colFieldDefsLen = colFieldDefs.length;
      const rowsHtml = [];
      for (let depth = 0; depth < colFieldDefsLen; depth++) {
        const cells = []; let i = 0;
        while (i < visibleColumns.length) {
          const col = visibleColumns[i];
          if (col.path.length <= depth) { i++; continue; } // 앞선 depth에서 이미 rowspan으로 덮인 열 — 건너뜀
          if (col.path.length - 1 === depth) {
            const rowspan = colFieldDefsLen - depth;
            const toggle = col.canToggle ? `<span class="toggle-icon" onclick="toggleDetailDataColNode('${ddEsc(col.pathKey)}')">${col.isExpanded ? '-' : '+'}</span>` : '';
            const label = ddFormatFieldValue(colFieldDefs[depth].key, col.path[col.path.length - 1]);
            cells.push(`<th colspan="${valuesPerCol}" rowspan="${rowspan}" style="text-align:center; vertical-align:middle;">${toggle}${label}</th>`);
            i++;
          } else {
            const prefix = col.path.slice(0, depth + 1);
            let span = 0; let j = i;
            while (j < visibleColumns.length && visibleColumns[j].path.length > depth && ddArraysEqual(visibleColumns[j].path.slice(0, depth + 1), prefix)) { span++; j++; }
            const label = ddFormatFieldValue(colFieldDefs[depth].key, prefix[depth]);
            cells.push(`<th colspan="${span * valuesPerCol}" style="text-align:center;">${label}</th>`);
            i = j;
          }
        }
        rowsHtml.push(cells);
      }
      return rowsHtml;
    }

    // 한 행 노드에서 여러 leafKey(접힌 열 그룹)의 metrics를 합산 — leafKeys가 1개면 그대로 반환.
    function mergeDetailDataMetrics(node, leafKeys) {
      if (leafKeys.length === 1) return node.metrics[leafKeys[0]];
      const merged = { rowCount: 0, sums: {}, distinctSets: {} };
      leafKeys.forEach(k => {
        const m = node.metrics[k];
        if (!m) return;
        merged.rowCount += m.rowCount;
        Object.keys(m.sums).forEach(f => { merged.sums[f] = (merged.sums[f] || 0) + m.sums[f]; });
        Object.keys(m.distinctSets).forEach(f => {
          if (!merged.distinctSets[f]) merged.distinctSets[f] = new Set();
          m.distinctSets[f].forEach(val => merged.distinctSets[f].add(val));
        });
      });
      return merged;
    }

    function renderDetailDataNodeRows(node, rowFieldDefs, depth, ancestorPath, visibleColumns, valueDefs, out) {
      const hasMore = depth + 1 < rowFieldDefs.length;
      const sortMetric = (childNode) => computeDetailDataMetric(childNode.metrics.__ROWTOTAL__, valueDefs[0]);
      const keys = Object.keys(node.children).sort((a, b) => sortMetric(node.children[b]) - sortMetric(node.children[a]));
      keys.forEach(k => {
        const child = node.children[k];
        const path = ancestorPath.concat(k);
        const pathKey = path.join('||');
        const isExpanded = !!expandedDetailDataPivot[pathKey];
        const indentClass = `indent-step-${Math.min(depth + 1, 5)}`;
        const toggle = hasMore ? `<span class="toggle-icon" onclick="toggleDetailDataNode('${ddEsc(pathKey)}')">${isExpanded ? '-' : '+'}</span>` : '';
        let html = `<tr><td class="${indentClass}">${toggle}${ddFormatFieldValue(rowFieldDefs[depth].key, k)}</td>`;
        visibleColumns.forEach(col => {
          const m = mergeDetailDataMetrics(child, col.leafKeys);
          valueDefs.forEach(v => { html += `<td style="text-align:right;">${fmtDetailDataMetricCell(computeDetailDataMetric(m, v), v.agg)}</td>`; });
        });
        const rt = child.metrics.__ROWTOTAL__;
        valueDefs.forEach(v => { html += `<td style="text-align:right; font-weight: 500;">${fmtDetailDataMetricCell(computeDetailDataMetric(rt, v), v.agg)}</td>`; });
        html += `</tr>`;
        out.push(html);
        if (hasMore && isExpanded) renderDetailDataNodeRows(child, rowFieldDefs, depth + 1, path, visibleColumns, valueDefs, out);
      });
    }

    // ==========================================================================
    // 필드 배치 상태(필터/열/행/값)
    // 필터/행/열 세 영역끼리는 한 필드가 한 곳에만 존재(상호 배타적). 값 영역은 완전히 독립 —
    // 다른 영역에 이미 쓰인 필드도 값에 자유롭게 추가할 수 있고, 같은 필드를 여러 번(다른 집계로) 넣을 수 있다.
    // ==========================================================================
    function getDetailDataPlacedFields() {
      const s = new Set();
      detailDataConfig.filters.forEach(f => s.add(f.field));
      detailDataConfig.rows.forEach(f => s.add(f));
      detailDataConfig.columns.forEach(f => s.add(f));
      detailDataConfig.values.forEach(v => s.add(v.field));
      return s;
    }

    // 필터/행/열에서만 제거(값은 건드리지 않음) — 이 세 영역 간 이동 시 사용.
    function removeDetailDataFieldFromStructuralAreas(fieldKey) {
      detailDataConfig.filters = detailDataConfig.filters.filter(f => f.field !== fieldKey);
      detailDataConfig.rows = detailDataConfig.rows.filter(f => f !== fieldKey);
      detailDataConfig.columns = detailDataConfig.columns.filter(f => f !== fieldKey);
      if (detailDataOpenFilterField === fieldKey) detailDataOpenFilterField = null;
    }

    // 필터/행/열/값 전부에서 제거 — 필드 목록으로 다시 드래그(완전히 빼기)했을 때만 사용.
    function removeDetailDataFieldEverywhere(fieldKey) {
      removeDetailDataFieldFromStructuralAreas(fieldKey);
      detailDataConfig.values = detailDataConfig.values.filter(v => v.field !== fieldKey);
    }

    function removeDetailDataField(wellName, key) {
      if (wellName === 'filters') detailDataConfig.filters = detailDataConfig.filters.filter(f => f.field !== key);
      else if (wellName === 'values') detailDataConfig.values = detailDataConfig.values.filter(v => v.id !== key);
      else detailDataConfig[wellName] = detailDataConfig[wellName].filter(f => f !== key);
      if (detailDataOpenFilterField === key) detailDataOpenFilterField = null;
      renderDetailDataPivot();
    }

    // ==========================================================================
    // 드래그앤드롭
    // ==========================================================================
    function onDetailDataDragStart(ev, fieldKey, valueId) {
      const payload = { field: fieldKey, valueId: (valueId === undefined ? null : valueId) };
      detailDataDragPayload = payload;
      ev.dataTransfer.setData('text/plain', JSON.stringify(payload));
      ev.dataTransfer.effectAllowed = 'move';
      if (ev.currentTarget && ev.currentTarget.classList) ev.currentTarget.classList.add('dd-dragging');
    }
    function onDetailDataWellDragOver(ev) { ev.preventDefault(); if (ev.currentTarget.classList) ev.currentTarget.classList.add('drag-over'); }
    function onDetailDataWellDragLeave(ev) { if (ev.currentTarget.classList) ev.currentTarget.classList.remove('drag-over'); }

    function getDetailDataDragPayload(ev) {
      try {
        const raw = ev.dataTransfer.getData('text/plain');
        if (raw) return JSON.parse(raw);
      } catch (e) { /* dragover 단계 등 일부 브라우저에서 getData가 비어있을 수 있음 — 아래 백업 변수로 폴백 */ }
      return detailDataDragPayload;
    }

    function makeDetailDataValueEntry(fieldKey) {
      return { id: detailDataValueIdCounter++, field: fieldKey, agg: fieldKey === 'amount' ? 'sum' : 'count' };
    }

    function onDetailDataWellDrop(ev, wellName) {
      ev.preventDefault();
      if (ev.currentTarget && ev.currentTarget.classList) ev.currentTarget.classList.remove('drag-over');
      const payload = getDetailDataDragPayload(ev);
      detailDataDragPayload = null;
      if (!payload || !payload.field) return;
      const fieldKey = payload.field;
      if (wellName === 'list') { removeDetailDataFieldEverywhere(fieldKey); renderDetailDataPivot(); return; }
      if (fieldKey === 'amount' && wellName !== 'values') return; // amount는 값 well 전용
      if (wellName === 'filters' && DD_FILTER_BAR_COVERED_FIELDS.has(fieldKey)) return; // 상단 전역 필터바에서만 조정
      if (wellName === 'values') {
        if (payload.valueId != null) {
          // 값 영역 내 기존 항목을 빈 공간에 드롭 — 새로 추가하지 않고 맨 뒤로 이동만
          const arr = detailDataConfig.values;
          const idx = arr.findIndex(v => v.id === payload.valueId);
          if (idx >= 0) { const [item] = arr.splice(idx, 1); arr.push(item); }
        } else {
          detailDataConfig.values.push(makeDetailDataValueEntry(fieldKey));
        }
      } else {
        removeDetailDataFieldFromStructuralAreas(fieldKey);
        if (wellName === 'filters') detailDataConfig.filters.push({ field: fieldKey, selected: [] });
        else detailDataConfig[wellName].push(fieldKey);
      }
      renderDetailDataPivot();
    }

    function onDetailDataChipDrop(ev, wellName, targetKey) {
      ev.preventDefault(); ev.stopPropagation();
      if (ev.currentTarget && ev.currentTarget.classList) ev.currentTarget.classList.remove('drag-over');
      const payload = getDetailDataDragPayload(ev);
      detailDataDragPayload = null;
      if (!payload || !payload.field) return;
      const fieldKey = payload.field;
      if (fieldKey === 'amount' && wellName !== 'values') return;
      if (wellName === 'filters' && DD_FILTER_BAR_COVERED_FIELDS.has(fieldKey)) return; // 상단 전역 필터바에서만 조정
      if (wellName === 'values') {
        const arr = detailDataConfig.values;
        if (payload.valueId != null) {
          if (payload.valueId === targetKey) return; // 자기 자신 위에 드롭
          const fromIdx = arr.findIndex(v => v.id === payload.valueId);
          if (fromIdx < 0) return;
          const [item] = arr.splice(fromIdx, 1);
          const targetIdx = arr.findIndex(v => v.id === targetKey);
          arr.splice(targetIdx < 0 ? arr.length : targetIdx, 0, item);
        } else {
          const targetIdx = arr.findIndex(v => v.id === targetKey);
          arr.splice(targetIdx < 0 ? arr.length : targetIdx, 0, makeDetailDataValueEntry(fieldKey));
        }
      } else {
        if (fieldKey === targetKey) return;
        removeDetailDataFieldFromStructuralAreas(fieldKey);
        if (wellName === 'filters') {
          const arr = detailDataConfig.filters; const idx = arr.findIndex(f => f.field === targetKey);
          arr.splice(idx < 0 ? arr.length : idx, 0, { field: fieldKey, selected: [] });
        } else {
          const arr = detailDataConfig[wellName]; const idx = arr.indexOf(targetKey);
          arr.splice(idx < 0 ? arr.length : idx, 0, fieldKey);
        }
      }
      renderDetailDataPivot();
    }

    // ==========================================================================
    // 필터 값 팝오버
    // ==========================================================================
    function getDetailDataFieldUniqueValues(fieldKey) {
      const set = new Set();
      rawData.forEach(r => { const v = r[fieldKey]; if (v !== undefined && v !== null && v !== '') set.add(v); });
      return [...set].sort((a, b) => String(a).localeCompare(String(b), 'ko'));
    }
    function toggleDetailDataFilterPopover(fieldKey) {
      detailDataOpenFilterField = detailDataOpenFilterField === fieldKey ? null : fieldKey;
      renderDetailDataPivot();
    }
    function toggleDetailDataFilterValue(fieldKey, value) {
      const filt = detailDataConfig.filters.find(f => f.field === fieldKey);
      if (!filt) return;
      const idx = filt.selected.indexOf(value);
      if (idx >= 0) filt.selected.splice(idx, 1); else filt.selected.push(value);
      renderDetailDataPivot();
    }

    // ==========================================================================
    // 빌더 패널(필드목록 + 필터/열/행/값 well) 렌더링
    // ==========================================================================
    function renderDetailDataFieldListHtml() {
      const placed = getDetailDataPlacedFields();
      return DETAIL_DATA_FIELDS.map(f => {
        const activeClass = placed.has(f.key) ? ' dd-field-chip-active' : '';
        const title = DD_FILTER_BAR_COVERED_FIELDS.has(f.key) ? ' title="필터는 상단 전역 필터바에서 조정 (행/열/값에는 배치 가능)"' : '';
        return `<div class="dd-field-chip${activeClass}" draggable="true" data-field="${f.key}"${title} ondragstart="onDetailDataDragStart(event,'${f.key}')" ondragend="this.classList.remove('dd-dragging')">${f.label}</div>`;
      }).join('');
    }

    function renderDetailDataWellFieldChips(wellName, fieldKeys) {
      return fieldKeys.map(key => {
        const label = detailDataFieldLabel(key);
        return `<div class="dd-field-chip dd-field-chip-placed" draggable="true" data-field="${key}"
          ondragstart="onDetailDataDragStart(event,'${key}')" ondragend="this.classList.remove('dd-dragging')"
          ondragover="event.preventDefault(); event.stopPropagation();"
          ondrop="onDetailDataChipDrop(event,'${wellName}','${key}')">
          <span>${label}</span><span class="dd-chip-remove" onclick="event.stopPropagation(); removeDetailDataField('${wellName}','${key}')">✕</span>
        </div>`;
      }).join('');
    }

    function renderDetailDataFilterChips() {
      return detailDataConfig.filters.map(f => {
        const label = detailDataFieldLabel(f.field);
        const isOpen = detailDataOpenFilterField === f.field;
        const countText = f.selected.length === 0 ? '전체' : `${f.selected.length}개 선택`;
        let popover = '';
        if (isOpen) {
          const values = getDetailDataFieldUniqueValues(f.field);
          popover = `<div class="dd-filter-popover" onclick="event.stopPropagation();">${values.map(v =>
            `<label class="dd-filter-popover-item"><input type="checkbox" ${f.selected.includes(String(v)) ? 'checked' : ''} onchange="toggleDetailDataFilterValue('${ddEsc(f.field)}','${ddEsc(String(v))}')"> ${String(v)}</label>`
          ).join('')}</div>`;
        }
        return `<div class="dd-field-chip dd-field-chip-filter" draggable="true" data-field="${f.field}"
          ondragstart="onDetailDataDragStart(event,'${f.field}')" ondragend="this.classList.remove('dd-dragging')"
          ondragover="event.preventDefault(); event.stopPropagation();"
          ondrop="onDetailDataChipDrop(event,'filters','${f.field}')">
          <span onclick="event.stopPropagation(); toggleDetailDataFilterPopover('${f.field}')">${label} (${countText})</span>
          <span class="dd-chip-remove" onclick="event.stopPropagation(); removeDetailDataField('filters','${f.field}')">✕</span>
          ${popover}
        </div>`;
      }).join('');
    }

    function renderDetailDataValuesChips() {
      return detailDataConfig.values.map(v => {
        const label = detailDataFieldLabel(v.field);
        const opts = getDetailDataAggOptions(v.field);
        const select = `<select class="dd-agg-select" onclick="event.stopPropagation();" onchange="setDetailDataValueAgg(${v.id}, this.value)">${opts.map(a =>
          `<option value="${a}" ${a === v.agg ? 'selected' : ''}>${DETAIL_DATA_AGG_LABELS[a]}</option>`
        ).join('')}</select>`;
        return `<div class="dd-field-chip dd-field-chip-placed dd-field-chip-value" draggable="true" data-field="${v.field}" data-value-id="${v.id}"
          ondragstart="onDetailDataDragStart(event,'${v.field}', ${v.id})" ondragend="this.classList.remove('dd-dragging')"
          ondragover="event.preventDefault(); event.stopPropagation();"
          ondrop="onDetailDataChipDrop(event,'values', ${v.id})">
          <span>${label}</span>${select}<span class="dd-chip-remove" onclick="event.stopPropagation(); removeDetailDataField('values', ${v.id})">✕</span>
        </div>`;
      }).join('');
    }

    function renderDetailDataBuilderPanels() {
      const fieldListEl = document.getElementById('ddFieldList');
      const filterBarEl = document.getElementById('ddFilterBar');
      const filterWellEl = document.getElementById('ddWellFilterBody');
      const colEl = document.getElementById('ddWellColumnsBody');
      const rowEl = document.getElementById('ddWellRowsBody');
      const valEl = document.getElementById('ddWellValuesBody');
      if (!fieldListEl || !filterBarEl || !filterWellEl || !colEl || !rowEl || !valEl) return;
      fieldListEl.innerHTML = renderDetailDataFieldListHtml();
      // 필터 바(표 위, 실제 값 선택용)와 사이드바 필터 well(배치/순서 조정용)은 같은 detailDataConfig.filters를 두 곳에 나눠 보여준다 — 엑셀 피벗의 필드 목록 필터 영역 vs 상단 필터 드롭다운과 동일한 구조.
      filterBarEl.innerHTML = renderDetailDataFilterChips();
      filterWellEl.innerHTML = renderDetailDataWellFieldChips('filters', detailDataConfig.filters.map(f => f.field)) || `<div class="dd-well-placeholder">필드를 끌어 놓으세요</div>`;
      colEl.innerHTML = renderDetailDataWellFieldChips('columns', detailDataConfig.columns) || `<div class="dd-well-placeholder">필드를 끌어 놓으세요</div>`;
      rowEl.innerHTML = renderDetailDataWellFieldChips('rows', detailDataConfig.rows) || `<div class="dd-well-placeholder">필드를 끌어 놓으세요</div>`;
      valEl.innerHTML = renderDetailDataValuesChips() || `<div class="dd-well-placeholder">필드를 끌어 놓으세요</div>`;
    }

    // ==========================================================================
    // 메인 렌더 — 필드 배치가 바뀔 때마다 매번 rawData부터 재계산(캐시 없음)
    // ==========================================================================
    function renderDetailDataPivot() {
      renderDetailDataBuilderPanels();

      const valueDefs = detailDataConfig.values;
      if (valueDefs.length === 0) {
        document.getElementById('detailDataTableHead').innerHTML = `<tr><th style="text-align:left;">구분</th></tr>`;
        document.getElementById('detailDataTableBody').innerHTML = `<tr><td style="text-align:center; color:var(--text-tertiary); padding:16px;">값 영역에 필드를 놓으세요</td></tr>`;
        document.getElementById('detailDataTotalAmount').innerText = '0.0 백만';
        return;
      }

      const rowFieldDefs = detailDataConfig.rows.map(k => DETAIL_DATA_FIELDS.find(f => f.key === k)).filter(Boolean);
      const colFieldDefs = detailDataConfig.columns.map(k => DETAIL_DATA_FIELDS.find(f => f.key === k)).filter(Boolean);

      const baseRows = getDetailDataBaseRows();
      const { root, colCombos } = buildDetailDataTree(baseRows, rowFieldDefs, colFieldDefs, valueDefs);
      const visibleColumns = buildDetailDataVisibleColumns(colCombos, colFieldDefs.length);

      const multiValue = valueDefs.length > 1;
      const valuesPerCol = multiValue ? valueDefs.length : 1;
      const rowLabel = rowFieldDefs.length ? rowFieldDefs.map(f => f.label).join(' / ') : '구분';

      // 그룹핑 행: 열 필드가 있으면 필드별 colspan 그룹(접힌 그룹은 병합 1칸 + 토글), 없으면 (단일값일 때만) "합계" 한 칸.
      let groupRows = colFieldDefs.length > 0
        ? renderDetailDataColumnHeaderRows(visibleColumns, colFieldDefs, valuesPerCol)
        : (multiValue ? [] : [[`<th colspan="1" style="text-align:center;">합계</th>`]]);
      const rows = groupRows.map(r => r.slice());

      // 값이 2개 이상이면 맨 아래에 "합계 : 금액" 식 값 라벨 행을 추가로 붙인다(엑셀의 Σ값 다중 표시와 동일).
      if (multiValue) {
        const valueRowCells = [];
        visibleColumns.forEach(() => { valueDefs.forEach(v => valueRowCells.push(`<th style="text-align:center; font-size:11px; font-weight:700;">${getDetailDataValueLabel(v)}</th>`)); });
        rows.push(valueRowCells);
        const lastIdx = rows.length - 1;
        valueDefs.forEach(v => rows[lastIdx].push(`<th style="text-align:center; font-size:11px; font-weight:500; background:#1E40AF !important; color:#FFFFFF !important;">${getDetailDataValueLabel(v)}</th>`));
      }
      if (groupRows.length > 0) {
        rows[0].push(`<th colspan="${valuesPerCol}" rowspan="${groupRows.length}" style="background:#1E40AF !important; color:#FFFFFF !important; font-weight:500;">총합계</th>`);
      }
      const headDepth = Math.max(rows.length, 1);

      let headHtml = '';
      for (let d = 0; d < headDepth; d++) {
        headHtml += '<tr>';
        if (d === 0) headHtml += `<th rowspan="${headDepth}" style="text-align:left; min-width:280px; vertical-align:middle;">${rowLabel}</th>`;
        headHtml += (rows[d] || []).join('');
        headHtml += '</tr>';
      }
      document.getElementById('detailDataTableHead').innerHTML = mapPivotHtml(headHtml);

      let bodyHtml = '';
      if (rowFieldDefs.length === 0 && colFieldDefs.length === 0) {
        const totalCols = 1 + visibleColumns.length * valueDefs.length + valueDefs.length;
        bodyHtml += `<tr><td colspan="${totalCols}" style="text-align:center; color:var(--text-tertiary); padding:16px;">행 또는 열 영역에 필드를 놓으세요</td></tr>`;
      } else if (rowFieldDefs.length > 0) {
        const out = [];
        renderDetailDataNodeRows(root, rowFieldDefs, 0, [], visibleColumns, valueDefs, out);
        bodyHtml += out.join('');
      }
      bodyHtml += `<tr class="row-grand-total"><td class="indent-step-1">총합계</td>`;
      visibleColumns.forEach(col => {
        const m = mergeDetailDataMetrics(root, col.leafKeys);
        valueDefs.forEach(v => { bodyHtml += `<td style="text-align:right; font-weight: 500;">${fmtDetailDataMetricCell(computeDetailDataMetric(m, v), v.agg)}</td>`; });
      });
      const rootTotal = root.metrics.__ROWTOTAL__;
      valueDefs.forEach(v => { bodyHtml += `<td style="text-align:right; font-weight: 500;">${fmtDetailDataMetricCell(computeDetailDataMetric(rootTotal, v), v.agg)}</td>`; });
      bodyHtml += `</tr>`;
      document.getElementById('detailDataTableBody').innerHTML = mapPivotHtml(bodyHtml);

      const primary = valueDefs[0];
      const primaryTotal = computeDetailDataMetric(rootTotal, primary);
      document.getElementById('detailDataTotalAmount').innerText = (primary.agg === 'sum' || primary.agg === 'avg')
        ? `${fmtDetailDataAmount(primaryTotal)} 백만`
        : `${primaryTotal.toLocaleString('ko-KR')} 건`;
    }
