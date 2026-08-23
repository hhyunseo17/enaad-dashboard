// ============================================================
// js/features/pivot-builder.js
// 피벗 엔진 — 행 N단계 × 열 N단계 × 값 복수를 프리셋 하나로 그린다.
//
// 항목별·부서별·담당자별·채널별·광고주별·대행사별 여섯 피벗은 골격이 여덟 단계까지 같은
// 복사본이었다(detail-pivots.js). 차이는 행 필드 배열, 사전 필터, 레벨별 정렬, 깊이별 인라인 색,
// DOM id뿐이라 그 다섯 가지만 프리셋으로 받고 나머지는 여기 한 벌만 둔다.
//
// 엔진 자체는 js/features/detail-data.js(세부데이터 탐색)에서 가져왔다. 그쪽은 아직 자기 사본을
// 쓴다 — 엔진에 문제가 생겼을 때 잘 돌아가던 화면까지 같이 죽지 않도록, 일반 피벗을 먼저
// 옮겨 검증한 뒤 합친다. **두 곳을 동시에 고칠 일이 생기면 그때 통합할 것.**
//
// 세부데이터와 다른 점은 다섯 가지이고, 전부 기존 표시 형태를 그대로 재현하기 위한 것이다:
//   1. 그룹 소계 열   — 연도를 펼친 상태에서도 월 뒤에 "2026년 요약"이 붙는다
//   2. 열 기본 펼침   — 세부데이터는 접힘이 기본, 이쪽은 연도가 펼침이 기본
//   3. 필드별 열 정렬 — 연도는 내림차순, 월은 숫자 오름차순(문자 정렬이면 1,10,11,12,2… 가 된다)
//   4. 레벨별 행 정렬 — 값 내림차순 / 이름순 / 부서·대분류 고유 순서
//   5. 깊이별 셀 색   — 렌더러가 인라인으로 넣던 hex를 프리셋으로 옮겼다
// ============================================================

    const PV_ROWTOTAL = '__ROWTOTAL__';   // 열 구분과 무관한 행 전체 합계용 버킷
    const PV_SUBTOTAL = '__SUBTOTAL__';   // 그룹 소계 열을 잎(leaf)처럼 다루기 위한 표식
    const PV_ALLCOL = '__TOTAL__';        // 열 필드가 없을 때의 단일 버킷

    function pvEsc(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

    // 열 값 표시: 연/월은 숫자 그대로가 아니라 "2026년"/"1월"로 적는다.
    function pvFormatFieldValue(fieldKey, rawValue) {
      if (rawValue === '(미지정)') return rawValue;
      if (fieldKey === 'year') return `${rawValue}년`;
      if (fieldKey === 'month') return `${rawValue}월`;
      return rawValue;
    }

    // 열 축 정렬 규칙. 여기 없는 필드는 한국어 로케일 문자열 비교.
    // **월을 문자열로 비교하면 1, 10, 11, 12, 2, 3… 순이 된다.** 연도는 최근이 왼쪽에 오도록 내림차순.
    const PV_FIELD_SORT = {
      year: (a, b) => Number(b) - Number(a),
      month: (a, b) => Number(a) - Number(b),
    };
    function pvCompareFieldValues(fieldKey, a, b) {
      const f = PV_FIELD_SORT[fieldKey];
      if (f) return f(a, b);
      return String(a).localeCompare(String(b), 'ko');
    }

    // 행 정렬자. 프리셋이 레벨마다 하나씩 고른다. total은 그 노드의 행 전체 합계(PV_ROWTOTAL 기준).
    const PV_ROW_SORTERS = {
      valueDesc: (a, b, ta, tb) => tb - ta,
      valueAsc: (a, b, ta, tb) => ta - tb,
      labelAsc: (a, b) => String(a).localeCompare(String(b), 'ko'),
      labelDesc: (a, b) => String(b).localeCompare(String(a), 'ko'),
      deptOrder: (a, b) => compareDeptOrder(a, b),                 // shared-helpers.js
      categoryOrder: (a, b) => pvOrderListCompare(categoryOrderList, a, b), // state.js
    };
    // 고정 순서 목록 기준 비교 — 목록에 있는 것이 먼저, 둘 다 없으면 이름순.
    function pvOrderListCompare(list, a, b) {
      const ia = list.indexOf(a), ib = list.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return String(a).localeCompare(String(b), 'ko');
    }

    // ==========================================================================
    // 집계
    // ==========================================================================
    function pvComputeMetric(metrics, v) {
      if (!metrics) return 0;
      if (v.agg === 'sum') return metrics.sums[v.field] || 0;
      if (v.agg === 'avg') return metrics.rowCount ? (metrics.sums[v.field] || 0) / metrics.rowCount : 0;
      if (v.agg === 'count') return metrics.rowCount || 0;
      if (v.agg === 'distinct') return metrics.distinctSets[v.field] ? metrics.distinctSets[v.field].size : 0;
      return 0;
    }

    // rowFields/colFields 깊이만큼 재귀 그룹핑하며 valueDefs별 집계를 함께 누적한다.
    // rowFallbacks[i]는 i번째 행 필드가 비었을 때 쓸 이름이다. 원본 렌더러가 `r.subCategory || '일반'`
    // 식으로 각자 다른 기본값을 쓰고 있어서(항목별은 기타/일반/일반) 그걸 그대로 받는다.
    function pvBuildTree(rows, rowFields, colFields, valueDefs, rowFallbacks) {
      const empty = (v) => (v === undefined || v === null || v === '');
      const norm = (v) => empty(v) ? '(미지정)' : v;
      const normRow = (v, i) => empty(v) ? ((rowFallbacks && rowFallbacks[i]) || '(미지정)') : v;
      const sumFields = new Set(valueDefs.filter(v => v.agg === 'sum' || v.agg === 'avg').map(v => v.field));
      const distinctFields = new Set(valueDefs.filter(v => v.agg === 'distinct').map(v => v.field));

      const colComboMap = new Map();
      rows.forEach(r => {
        const combo = colFields.map(f => norm(r[f]));
        const key = combo.length ? combo.join('||') : PV_ALLCOL;
        if (!colComboMap.has(key)) colComboMap.set(key, combo);
      });
      if (colFields.length === 0) colComboMap.set(PV_ALLCOL, []);
      const colCombos = [...colComboMap.values()].sort((a, b) => {
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
          const c = pvCompareFieldValues(colFields[i], a[i] ?? '', b[i] ?? '');
          if (c !== 0) return c;
        }
        return 0;
      });

      const makeNode = () => ({ metrics: {}, children: {} });
      const root = makeNode();

      function touch(node, key, r) {
        if (!node.metrics[key]) node.metrics[key] = { rowCount: 0, sums: {}, distinctSets: {} };
        const m = node.metrics[key];
        m.rowCount++;
        sumFields.forEach(f => { m.sums[f] = (m.sums[f] || 0) + (Number(r[f]) || 0); });
        distinctFields.forEach(f => { if (!m.distinctSets[f]) m.distinctSets[f] = new Set(); m.distinctSets[f].add(r[f]); });
      }

      rows.forEach(r => {
        const combo = colFields.map(f => norm(r[f]));
        const colKey = combo.length ? combo.join('||') : PV_ALLCOL;
        let node = root;
        touch(node, colKey, r); touch(node, PV_ROWTOTAL, r);
        rowFields.forEach((f, i) => {
          const val = normRow(r[f], i);
          if (!node.children[val]) node.children[val] = makeNode();
          node = node.children[val];
          touch(node, colKey, r); touch(node, PV_ROWTOTAL, r);
        });
      });

      return { root, colCombos };
    }

    // 접힌 그룹 하나가 여러 잎을 대표하므로, 그 잎들의 집계를 합쳐 한 칸으로 만든다.
    function pvMergeMetrics(node, leafKeys) {
      if (leafKeys.length === 1) return node.metrics[leafKeys[0]];
      const merged = { rowCount: 0, sums: {}, distinctSets: {} };
      leafKeys.forEach(k => {
        const m = node.metrics[k];
        if (!m) return;
        merged.rowCount += m.rowCount;
        Object.keys(m.sums).forEach(f => { merged.sums[f] = (merged.sums[f] || 0) + m.sums[f]; });
        Object.keys(m.distinctSets).forEach(f => {
          if (!merged.distinctSets[f]) merged.distinctSets[f] = new Set();
          m.distinctSets[f].forEach(v => merged.distinctSets[f].add(v));
        });
      });
      return merged;
    }

    // ==========================================================================
    // 열 축
    // ==========================================================================
    function pvBuildColumnValueTree(colCombos) {
      const root = { children: new Map(), leafKeys: [] };
      colCombos.forEach(combo => {
        let node = root;
        combo.forEach(val => {
          if (!node.children.has(val)) node.children.set(val, { children: new Map(), leafKeys: [] });
          node = node.children.get(val);
        });
        node.leafKeys.push(combo.length ? combo.join('||') : PV_ALLCOL);
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

    // 그룹 소계가 있는 깊이에서는 **펼치든 접든 소계 열을 하나 붙인다.** 접혀 있으면 그것만 남고,
    // 펼치면 자식들 뒤에 붙는다 — 기존 여섯 피벗이 "2026년 요약"을 두 경우 모두 보여주던 방식 그대로다.
    // 소계 열의 path 끝에 PV_SUBTOTAL을 달아 잎과 같은 깊이에 두면, 헤더 조립이 별도 분기 없이 맞아떨어진다.
    function pvWalkColumnNode(node, depth, path, colFields, expandedCols, opt, out) {
      if (depth === colFields.length) {
        out.push({ path: path.slice(), leafKeys: node.leafKeys, isSubtotal: false, pathKey: path.join('||') });
        return;
      }
      const pathKey = path.join('||');
      const hasSubtotal = opt.subtotalDepths.has(depth - 1);
      const expanded = opt.columnDefaultExpanded ? (expandedCols[pathKey] !== false) : !!expandedCols[pathKey];

      if (expanded) {
        const childVals = [...node.children.keys()].sort((a, b) => pvCompareFieldValues(colFields[depth], a, b));
        childVals.forEach(v => pvWalkColumnNode(node.children.get(v), depth + 1, path.concat(v), colFields, expandedCols, opt, out));
      }
      if (hasSubtotal) {
        out.push({ path: path.concat(PV_SUBTOTAL), leafKeys: node.leafKeys, isSubtotal: true, groupValue: path[path.length - 1], groupField: colFields[depth - 1], pathKey: pathKey + '||' + PV_SUBTOTAL });
      } else if (!expanded) {
        out.push({ path: path.slice(), leafKeys: node.leafKeys, isSubtotal: false, pathKey });
      }
    }

    function pvBuildVisibleColumns(colCombos, colFields, expandedCols, opt) {
      if (colFields.length === 0) return [{ path: [], leafKeys: [PV_ALLCOL], isSubtotal: false, pathKey: '' }];
      const tree = pvBuildColumnValueTree(colCombos);
      const out = [];
      const topVals = [...tree.children.keys()].sort((a, b) => pvCompareFieldValues(colFields[0], a, b));
      topVals.forEach(v => pvWalkColumnNode(tree.children.get(v), 1, [v], colFields, expandedCols, opt, out));
      return out;
    }

    function pvArraysEqual(a, b) { return a.length === b.length && a.every((v, i) => v === b[i]); }

    // 깊이별 헤더 행. 자기 깊이에서 끝나는 열(소계 등)은 남은 헤더 행을 rowspan으로 덮는다.
    function pvRenderColumnHeaderRows(visibleColumns, colFields, opt) {
      const L = colFields.length;
      const rows = [];
      for (let depth = 0; depth < L; depth++) {
        const cells = [];
        let i = 0;
        while (i < visibleColumns.length) {
          const col = visibleColumns[i];
          if (col.path.length <= depth) { i++; continue; } // 앞 깊이에서 rowspan으로 이미 덮인 열
          if (col.path.length - 1 === depth) {
            const rowspan = L - depth;
            if (col.isSubtotal) {
              const label = `${pvFormatFieldValue(col.groupField, col.groupValue)} 요약`;
              cells.push(`<th class="pv-th-summary" rowspan="${rowspan}" style="text-align:center; vertical-align:middle;">${label}</th>`);
            } else {
              const label = pvFormatFieldValue(colFields[depth], col.path[col.path.length - 1]);
              cells.push(`<th rowspan="${rowspan}" style="text-align:center; vertical-align:middle;">${label}</th>`);
            }
            i++;
          } else {
            const prefix = col.path.slice(0, depth + 1);
            let span = 0, j = i;
            while (j < visibleColumns.length && visibleColumns[j].path.length > depth && pvArraysEqual(visibleColumns[j].path.slice(0, depth + 1), prefix)) { span++; j++; }
            const value = prefix[depth];
            const label = pvFormatFieldValue(colFields[depth], value);
            // 이 깊이가 접기 대상이면 토글 아이콘을 붙인다(연도 열 펼침/접기).
            let toggle = '';
            if (opt.toggleDepth === depth) {
              const key = prefix.join('||');
              const expanded = opt.columnDefaultExpanded ? (opt.expandedCols[key] !== false) : !!opt.expandedCols[key];
              toggle = `<span class="year-toggle-btn" onclick="togglePvColNode('${opt.presetKey}','${pvEsc(value)}')">${expanded ? '-' : '+'}</span> `;
            }
            cells.push(`<th colspan="${span}" style="text-align:center;">${toggle}${label}</th>`);
            i = j;
          }
        }
        rows.push(cells.join(''));
      }
      return rows;
    }

    // ==========================================================================
    // 프리셋
    // ==========================================================================
    // 깊이별 행 라벨 셀 색. 렌더러가 인라인으로 박아 넣던 값을 그대로 옮겼다 —
    // theme-system.js의 mapPivotHtml()이 이 문자열을 키로 라이트 값을 치환하므로 **표기를 바꾸지 말 것**
    // (대문자 6자리 hex / rgba 문자열 전체가 정확히 일치해야 한다).
    const PV_DEPTH_STYLE_TREE = [
      { rowClass: 'row-channel', bg: '#1E293B', color: '#F8FAFC', weight: '700' },
      { rowClass: 'row-category', bg: '#151C2C', color: '#CBD5E1', weight: '' },
      { rowClass: 'row-subcategory', bg: '#11151F', color: '#94A3B8', weight: '' },
    ];

    const PIVOT_PRESETS = {
      category: {
        rows: ['categoryReclassified', 'subCategory', 'subCategory3'],
        rowFallbacks: ['기타', '일반', '일반'], // 값이 비었을 때 쓰던 기본값(원본 렌더러와 동일)
        rowSorters: ['valueDesc', 'valueDesc', 'labelAsc'],
        columns: ['year', 'month'],
        values: [{ field: 'amount', agg: 'sum' }],
        sourceFilter: null,
        columnDefaultExpanded: true,
        subtotalDepths: [0],          // 연도 그룹마다 "N년 요약"
        toggleDepth: 0,               // 연도 열 접기/펼치기
        depthStyles: PV_DEPTH_STYLE_TREE,
        // 접힘 상태는 **기존 전역 객체를 그대로 쓴다.** 키 형식도 같아서(`l1`, `l1||l2`)
        // USE_PIVOT_ENGINE을 껐다 켜도 펼쳐둔 상태가 유지된다.
        //
        // 이름이 아니라 클로저로 잡는 이유: state.js의 전역은 `let`으로 선언돼 있고, 클래식 스크립트의
        // top-level `let`은 **window 속성이 되지 않는다**(스크립트 스코프에만 산다). `window['expandedCatPivot']`은
        // 조용히 undefined가 된다. 반면 렉시컬 참조는 파일이 달라도 같은 전역 스코프라 그대로 닿는다.
        expandedRows: () => expandedCatPivot,
        expandedCols: () => expandedCatYearColumns,
        render: () => renderCategoryPivotTable(), // 스위치를 존중하도록 원래 진입점으로 되돌아간다
        dom: { head1: 'catPivotHeaderRow1', head2: 'catPivotHeaderRow2', body: 'catPivotTableBody', total: 'categoryPivotTotalAmount' },
      },
    };

    // 인라인 onclick에서 부르는 토글 — 프리셋 키를 같이 넘겨 뷰마다 함수를 새로 만들지 않는다.
    function togglePvRowNode(presetKey, pathKey) {
      const preset = PIVOT_PRESETS[presetKey]; if (!preset) return;
      const map = preset.expandedRows();
      map[pathKey] = !map[pathKey];
      preset.render();
    }
    function togglePvColNode(presetKey, value) {
      const preset = PIVOT_PRESETS[presetKey]; if (!preset) return;
      const map = preset.expandedCols();
      // 기본 펼침이라 undefined는 '펼침'으로 읽힌다 — 접는 방향으로만 뒤집는다.
      map[value] = preset.columnDefaultExpanded ? (map[value] === false) : !map[value];
      preset.render();
    }

    // ==========================================================================
    // 렌더
    // ==========================================================================
    // 금액은 원 단위로 누적해 두고 표시 직전에만 백만원으로 줄인다(원본과 동일하게 반올림 정수).
    function pvFormatCell(won) {
      const m = (won || 0) / 1000000;
      return m > 0 ? Math.round(m).toLocaleString() : '-';
    }

    function pvRowSorterFor(preset, depth) {
      const name = preset.rowSorters[depth] || 'valueDesc';
      return PV_ROW_SORTERS[name] || PV_ROW_SORTERS.valueDesc;
    }

    function pvRenderRows(node, preset, depth, ancestorPath, visibleColumns, valueDefs, expandedRows, out) {
      const hasMore = depth + 1 < preset.rows.length;
      const primary = valueDefs[0];
      const nodeTotal = (n) => pvComputeMetric(n.metrics[PV_ROWTOTAL], primary);
      const sorter = pvRowSorterFor(preset, depth);
      const keys = Object.keys(node.children).sort((a, b) => sorter(a, b, nodeTotal(node.children[a]), nodeTotal(node.children[b])));

      keys.forEach(k => {
        const child = node.children[k];
        const path = ancestorPath.concat(k);
        const pathKey = path.join('||');
        const isExpanded = !!expandedRows[pathKey];
        const st = preset.depthStyles[Math.min(depth, preset.depthStyles.length - 1)];
        const toggle = hasMore ? `<span class="toggle-icon" onclick="togglePvRowNode('${preset.key}','${pvEsc(pathKey)}')">${isExpanded ? '-' : '+'}</span>` : '';
        const weight = st.weight ? ` font-weight:${st.weight};` : '';

        let html = `<tr class="${st.rowClass}"><td class="indent-step-${Math.min(depth + 1, 5)}" style="background:${st.bg}; color:${st.color};${weight}">${toggle}${k}</td>`;
        visibleColumns.forEach(col => {
          const m = pvMergeMetrics(child, col.leafKeys);
          // 소계·총합계 열의 옅은 파랑은 인라인으로 둔다 — pv-num-sum/pv-num-total 클래스는
          // pivot-table.css에서 `.row-grand-total` 아래에만 정의돼 있어 데이터 행에는 아무 효과가 없다.
          // 이 rgba 문자열은 theme-system.js의 PIVOT_COLOR_MAP 키라서 **표기를 바꾸면 라이트에서 치환되지 않는다.**
          const style = col.isSubtotal
            ? 'text-align:right; font-weight: 400; background:rgba(30,58,138,0.1);'
            : 'text-align:right;';
          html += `<td style="${style}">${pvFormatCell(pvComputeMetric(m, primary))}</td>`;
        });
        html += `<td style="text-align:right; font-weight: 500; background:rgba(30,64,175,0.2);">${pvFormatCell(nodeTotal(child))}</td></tr>`;
        out.push(html);

        if (hasMore && isExpanded) pvRenderRows(child, preset, depth + 1, path, visibleColumns, valueDefs, expandedRows, out);
      });
    }

    function renderPresetPivot(viewKey) {
      const preset = PIVOT_PRESETS[viewKey];
      if (!preset) return;
      preset.key = viewKey; // 인라인 onclick이 자기 프리셋을 되찾을 수 있게

      const rows = preset.sourceFilter ? filteredData.filter(preset.sourceFilter) : filteredData;
      const expandedRows = preset.expandedRows();
      const expandedCols = preset.expandedCols();
      const valueDefs = preset.values;

      const { root, colCombos } = pvBuildTree(rows, preset.rows, preset.columns, valueDefs, preset.rowFallbacks);

      // 금액이 0뿐인 열(월)은 만들지 않는다 — 원본 렌더러가 `amount > 0`인 월만 헤더에 넣던 것과 같다.
      const primary = valueDefs[0];
      const liveCombos = colCombos.filter(c => {
        const key = c.length ? c.join('||') : PV_ALLCOL;
        return pvComputeMetric(root.metrics[key], primary) > 0;
      });

      const opt = {
        subtotalDepths: new Set(preset.subtotalDepths || []),
        columnDefaultExpanded: !!preset.columnDefaultExpanded,
        toggleDepth: preset.toggleDepth,
        presetKey: viewKey,
        expandedCols,
      };
      const visibleColumns = pvBuildVisibleColumns(liveCombos, preset.columns, expandedCols, opt);
      const headerRows = pvRenderColumnHeaderRows(visibleColumns, preset.columns, opt);

      const h1 = `<th rowspan="${preset.columns.length}" style="text-align:left; vertical-align:middle;">구분</th>`
        + headerRows[0]
        + `<th rowspan="${preset.columns.length}" class="pv-th-total" style="z-index:35;">총합계</th>`;
      document.getElementById(preset.dom.head1).innerHTML = mapPivotHtml(h1);
      document.getElementById(preset.dom.head2).innerHTML = mapPivotHtml(headerRows[1] || '');

      const out = [];
      pvRenderRows(root, preset, 0, [], visibleColumns, valueDefs, expandedRows, out);

      let body = out.join('');
      body += `<tr class="row-grand-total"><td class="indent-step-1">총합계</td>`;
      // 총합계 행만 클래스를 쓴다(pivot-table.css가 이 행에 한해 정의해 둔 것) — 원본과 동일.
      visibleColumns.forEach(col => {
        const m = pvMergeMetrics(root, col.leafKeys);
        body += col.isSubtotal
          ? `<td class="pv-num-sum">${pvFormatCell(pvComputeMetric(m, primary))}</td>`
          : `<td style="text-align:right; font-weight: 500;">${pvFormatCell(pvComputeMetric(m, primary))}</td>`;
      });
      const grand = pvComputeMetric(root.metrics[PV_ROWTOTAL], primary);
      body += `<td class="pv-num-total">${pvFormatCell(grand)}</td></tr>`;
      document.getElementById(preset.dom.body).innerHTML = mapPivotHtml(body);

      document.getElementById(preset.dom.total).innerText = `${Math.round((grand || 0) / 1000000).toLocaleString()} 백만`;
    }
