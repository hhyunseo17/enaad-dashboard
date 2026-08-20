// ============================================================
// js/features/detail-data.js
// 세부데이터 탐색: 자유 탐색형 피벗 빌더 (필터/열/행/값 드래그앤드롭 + rawData 즉시 재집계)
// 전역 필터바(applyFilters())와 무관한 독립 탭 — rawData를 직접 읽는다.
// ============================================================
    const DETAIL_DATA_FIELDS = [
      { key: 'year', label: '연' }, { key: 'month', label: '귀속월' },
      { key: 'dept', label: '부서' }, { key: 'manager', label: '담당자' },
      { key: 'advertiser', label: '광고주' }, { key: 'agency', label: '대행사' }, { key: 'agencyGroup', label: '대행사그룹' },
      { key: 'categoryOriginal', label: '원본대분류' },
      { key: 'subCategory', label: '중분류' }, { key: 'subCategory3', label: '소분류' },
      { key: 'channel', label: '채널' }, { key: 'industry', label: '업종' }, { key: 'broadDigital', label: '방송/디지털' },
      { key: 'revenueBasis', label: '회계계정' }, { key: 'isUpfront', label: '업프론트여부' },
      { key: 'amount', label: '금액' }
    ];
    // 재분류 대분류(categoryReclassified)는 원본대분류와 나란히 두면 헷갈리므로 이 탭에서는 제외 — 원본대분류만 사용.

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

    // ==========================================================================
    // 집계 로직
    // ==========================================================================
    function getDetailDataBaseRows() {
      return rawData.filter(r => {
        if (r.bonbuRevenueStatus !== '본부매출') return false;
        if (detailDataRevenueBasisMode === 'performance' && r.revenueBasis !== '실적') return false; // '회계'는 실적+회계조정 전체 통과
        return detailDataConfig.filters.every(f => {
          if (!f.selected || f.selected.length === 0) return true;
          return f.selected.includes(String(r[f.field]));
        });
      });
    }

    function setDetailDataRevenueBasisMode(mode) {
      detailDataRevenueBasisMode = mode;
      const btnPerf = document.getElementById('ddBtnBasisPerformance');
      const btnAcct = document.getElementById('ddBtnBasisAccounting');
      if (btnPerf) btnPerf.classList.toggle('active', mode === 'performance');
      if (btnAcct) btnAcct.classList.toggle('active', mode === 'accounting');
      renderDetailDataPivot();
    }

    function setDetailDataValueAgg(field, agg) {
      const v = detailDataConfig.values.find(x => x.field === field);
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

    // colFieldDefs 깊이만큼의 그룹핑 헤더 행들을 <th> 배열(행별)로 반환. valuesPerCol만큼 각 그룹의 colspan을 곱한다.
    function renderDetailDataColumnHeaderRows(colCombos, colFieldDefs, valuesPerCol) {
      const rowsHtml = [];
      for (let depth = 0; depth < colFieldDefs.length; depth++) {
        const cells = []; let i = 0;
        while (i < colCombos.length) {
          const prefix = colCombos[i].slice(0, depth + 1);
          let span = 1;
          while (i + span < colCombos.length && ddArraysEqual(colCombos[i + span].slice(0, depth + 1), prefix)) span++;
          cells.push(`<th colspan="${span * valuesPerCol}" style="text-align:center;">${prefix[depth]}</th>`);
          i += span;
        }
        rowsHtml.push(cells);
      }
      return rowsHtml;
    }

    function renderDetailDataNodeRows(node, rowFieldDefs, depth, ancestorPath, colKeys, valueDefs, out) {
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
        let html = `<tr><td class="${indentClass}">${toggle}${k}</td>`;
        colKeys.forEach(ck => {
          const m = child.metrics[ck];
          valueDefs.forEach(v => { html += `<td style="text-align:right;">${fmtDetailDataMetricCell(computeDetailDataMetric(m, v), v.agg)}</td>`; });
        });
        const rt = child.metrics.__ROWTOTAL__;
        valueDefs.forEach(v => { html += `<td style="text-align:right; font-weight:800;">${fmtDetailDataMetricCell(computeDetailDataMetric(rt, v), v.agg)}</td>`; });
        html += `</tr>`;
        out.push(html);
        if (hasMore && isExpanded) renderDetailDataNodeRows(child, rowFieldDefs, depth + 1, path, colKeys, valueDefs, out);
      });
    }

    // ==========================================================================
    // 필드 배치 상태(필터/열/행/값) — 한 필드는 동시에 한 곳에만 존재
    // ==========================================================================
    function getDetailDataPlacedFields() {
      const s = new Set();
      detailDataConfig.filters.forEach(f => s.add(f.field));
      detailDataConfig.rows.forEach(f => s.add(f));
      detailDataConfig.columns.forEach(f => s.add(f));
      detailDataConfig.values.forEach(v => s.add(v.field));
      return s;
    }

    function removeDetailDataFieldEverywhere(fieldKey) {
      detailDataConfig.filters = detailDataConfig.filters.filter(f => f.field !== fieldKey);
      detailDataConfig.rows = detailDataConfig.rows.filter(f => f !== fieldKey);
      detailDataConfig.columns = detailDataConfig.columns.filter(f => f !== fieldKey);
      detailDataConfig.values = detailDataConfig.values.filter(v => v.field !== fieldKey);
      if (detailDataOpenFilterField === fieldKey) detailDataOpenFilterField = null;
    }

    function removeDetailDataField(wellName, key) {
      if (wellName === 'filters') detailDataConfig.filters = detailDataConfig.filters.filter(f => f.field !== key);
      else if (wellName === 'values') detailDataConfig.values = detailDataConfig.values.filter(v => v.field !== key);
      else detailDataConfig[wellName] = detailDataConfig[wellName].filter(f => f !== key);
      if (detailDataOpenFilterField === key) detailDataOpenFilterField = null;
      renderDetailDataPivot();
    }

    // ==========================================================================
    // 드래그앤드롭
    // ==========================================================================
    function onDetailDataDragStart(ev, fieldKey) {
      detailDataDragField = fieldKey;
      ev.dataTransfer.setData('text/plain', fieldKey);
      ev.dataTransfer.effectAllowed = 'move';
      if (ev.currentTarget && ev.currentTarget.classList) ev.currentTarget.classList.add('dd-dragging');
    }
    function onDetailDataWellDragOver(ev) { ev.preventDefault(); if (ev.currentTarget.classList) ev.currentTarget.classList.add('drag-over'); }
    function onDetailDataWellDragLeave(ev) { if (ev.currentTarget.classList) ev.currentTarget.classList.remove('drag-over'); }

    function onDetailDataWellDrop(ev, wellName) {
      ev.preventDefault();
      if (ev.currentTarget && ev.currentTarget.classList) ev.currentTarget.classList.remove('drag-over');
      const fieldKey = ev.dataTransfer.getData('text/plain') || detailDataDragField;
      detailDataDragField = null;
      if (!fieldKey) return;
      if (wellName === 'list') { removeDetailDataFieldEverywhere(fieldKey); renderDetailDataPivot(); return; }
      if (fieldKey === 'amount' && wellName !== 'values') return; // amount는 값 well 전용
      removeDetailDataFieldEverywhere(fieldKey);
      if (wellName === 'filters') detailDataConfig.filters.push({ field: fieldKey, selected: [] });
      else if (wellName === 'values') detailDataConfig.values.push({ field: fieldKey, agg: fieldKey === 'amount' ? 'sum' : 'count' });
      else detailDataConfig[wellName].push(fieldKey);
      renderDetailDataPivot();
    }

    function onDetailDataChipDrop(ev, wellName, targetFieldKey) {
      ev.preventDefault(); ev.stopPropagation();
      if (ev.currentTarget && ev.currentTarget.classList) ev.currentTarget.classList.remove('drag-over');
      const fieldKey = ev.dataTransfer.getData('text/plain') || detailDataDragField;
      detailDataDragField = null;
      if (!fieldKey || fieldKey === targetFieldKey) return;
      if (fieldKey === 'amount' && wellName !== 'values') return;
      removeDetailDataFieldEverywhere(fieldKey);
      if (wellName === 'filters') {
        const arr = detailDataConfig.filters; const idx = arr.findIndex(f => f.field === targetFieldKey);
        arr.splice(idx < 0 ? arr.length : idx, 0, { field: fieldKey, selected: [] });
      } else if (wellName === 'values') {
        const arr = detailDataConfig.values; const idx = arr.findIndex(v => v.field === targetFieldKey);
        arr.splice(idx < 0 ? arr.length : idx, 0, { field: fieldKey, agg: fieldKey === 'amount' ? 'sum' : 'count' });
      } else {
        const arr = detailDataConfig[wellName]; const idx = arr.indexOf(targetFieldKey);
        arr.splice(idx < 0 ? arr.length : idx, 0, fieldKey);
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
      return DETAIL_DATA_FIELDS.filter(f => !placed.has(f.key)).map(f =>
        `<div class="dd-field-chip" draggable="true" data-field="${f.key}" ondragstart="onDetailDataDragStart(event,'${f.key}')" ondragend="this.classList.remove('dd-dragging')">${f.label}</div>`
      ).join('');
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
        const select = `<select class="dd-agg-select" onclick="event.stopPropagation();" onchange="setDetailDataValueAgg('${ddEsc(v.field)}', this.value)">${opts.map(a =>
          `<option value="${a}" ${a === v.agg ? 'selected' : ''}>${DETAIL_DATA_AGG_LABELS[a]}</option>`
        ).join('')}</select>`;
        return `<div class="dd-field-chip dd-field-chip-placed dd-field-chip-value" draggable="true" data-field="${v.field}"
          ondragstart="onDetailDataDragStart(event,'${v.field}')" ondragend="this.classList.remove('dd-dragging')">
          <span>${label}</span>${select}<span class="dd-chip-remove" onclick="event.stopPropagation(); removeDetailDataField('values','${v.field}')">✕</span>
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
      const { root, colCombos, colKeys } = buildDetailDataTree(baseRows, rowFieldDefs, colFieldDefs, valueDefs);

      const multiValue = valueDefs.length > 1;
      const valuesPerCol = multiValue ? valueDefs.length : 1;
      const rowLabel = rowFieldDefs.length ? rowFieldDefs.map(f => f.label).join(' / ') : '구분';

      // 그룹핑 행: 열 필드가 있으면 필드별 colspan 그룹, 없으면 (단일값일 때만) "합계" 한 칸.
      let groupRows = colFieldDefs.length > 0
        ? renderDetailDataColumnHeaderRows(colCombos, colFieldDefs, valuesPerCol)
        : (multiValue ? [] : [[`<th colspan="1" style="text-align:center;">합계</th>`]]);
      const rows = groupRows.map(r => r.slice());

      // 값이 2개 이상이면 맨 아래에 "합계 : 금액" 식 값 라벨 행을 추가로 붙인다(엑셀의 Σ값 다중 표시와 동일).
      if (multiValue) {
        const valueRowCells = [];
        colKeys.forEach(() => { valueDefs.forEach(v => valueRowCells.push(`<th style="text-align:center; font-size:11px; font-weight:700;">${getDetailDataValueLabel(v)}</th>`)); });
        rows.push(valueRowCells);
        const lastIdx = rows.length - 1;
        valueDefs.forEach(v => rows[lastIdx].push(`<th style="text-align:center; font-size:11px; font-weight:800; background:#1E40AF !important; color:#FFFFFF !important;">${getDetailDataValueLabel(v)}</th>`));
      }
      if (groupRows.length > 0) {
        rows[0].push(`<th colspan="${valuesPerCol}" rowspan="${groupRows.length}" style="background:#1E40AF !important; color:#FFFFFF !important; font-weight:900;">총합계</th>`);
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
        const totalCols = 1 + colKeys.length * valueDefs.length + valueDefs.length;
        bodyHtml += `<tr><td colspan="${totalCols}" style="text-align:center; color:var(--text-tertiary); padding:16px;">행 또는 열 영역에 필드를 놓으세요</td></tr>`;
      } else if (rowFieldDefs.length > 0) {
        const out = [];
        renderDetailDataNodeRows(root, rowFieldDefs, 0, [], colKeys, valueDefs, out);
        bodyHtml += out.join('');
      }
      bodyHtml += `<tr class="row-grand-total"><td class="indent-step-1">총합계</td>`;
      colKeys.forEach(ck => {
        const m = root.metrics[ck];
        valueDefs.forEach(v => { bodyHtml += `<td style="text-align:right; font-weight:900;">${fmtDetailDataMetricCell(computeDetailDataMetric(m, v), v.agg)}</td>`; });
      });
      const rootTotal = root.metrics.__ROWTOTAL__;
      valueDefs.forEach(v => { bodyHtml += `<td style="text-align:right; font-weight:900;">${fmtDetailDataMetricCell(computeDetailDataMetric(rootTotal, v), v.agg)}</td>`; });
      bodyHtml += `</tr>`;
      document.getElementById('detailDataTableBody').innerHTML = mapPivotHtml(bodyHtml);

      const primary = valueDefs[0];
      const primaryTotal = computeDetailDataMetric(rootTotal, primary);
      document.getElementById('detailDataTotalAmount').innerText = (primary.agg === 'sum' || primary.agg === 'avg')
        ? `${fmtDetailDataAmount(primaryTotal)} 백만`
        : `${primaryTotal.toLocaleString('ko-KR')} 건`;
    }
