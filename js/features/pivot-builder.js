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
      channelOrder: (a, b) => pvOrderListCompare(PV_CHANNEL_ORDER, a, b),
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
      const H = opt.header;
      const rows = [];
      for (let depth = 0; depth < L; depth++) {
        const cells = [];
        let i = 0;
        while (i < visibleColumns.length) {
          const col = visibleColumns[i];
          if (col.path.length <= depth) { i++; continue; } // 앞 깊이에서 rowspan으로 이미 덮인 열
          if (col.path.length - 1 === depth) {
            const span = L - depth > 1 ? ` rowspan="${L - depth}"` : '';
            if (col.isSubtotal) {
              const label = `${pvFormatFieldValue(col.groupField, col.groupValue)} 요약`;
              cells.push(`<th${span}${H.subtotal}>${label}</th>`);
            } else {
              const label = pvFormatFieldValue(colFields[depth], col.path[col.path.length - 1]);
              cells.push(`<th${span}${H.leaf}>${label}</th>`);
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
            cells.push(`<th colspan="${span}"${H.group}>${toggle}${label}</th>`);
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
    // 스타일은 의미로 재구성하지 않고 **원본 문자열 그대로** 옮긴다. 이 표를 예쁘게 정리하고 싶어질
    // 텐데, 그러면 mapPivotHtml의 치환 키가 어긋나 라이트 모드에서 조용히 색이 죽는다.
    //   label    행 라벨(첫) 칸
    //   month    일반 값 칸 (깊이마다 굵기가 다른 피벗이 있다 — 담당자별)
    //   subtotal 그룹 소계 칸 / total 행 총합계 칸 (깊이별로 다르면 여기서 덮어쓴다)
    const PV_STYLE_CELL = { month: 'text-align:right;' };
    const PV_STYLE_TREE = [
      { rowClass: 'row-channel', label: 'background:#1E293B; color:#F8FAFC; font-weight:700;', ...PV_STYLE_CELL },
      { rowClass: 'row-category', label: 'background:#151C2C; color:#CBD5E1;', ...PV_STYLE_CELL },
      { rowClass: 'row-subcategory', label: 'background:#11151F; color:#94A3B8;', ...PV_STYLE_CELL },
    ];
    // 담당자별 5단계 — 라벨 칸뿐 아니라 값 칸의 굵기도 깊이마다 다르다(원본 genCells의 fontW 인자).
    const PV_STYLE_MANAGER = [
      { rowClass: '', label: 'background:#1E293B; color:#F8FAFC; font-weight:700;', month: 'text-align:right; font-weight:700;' },
      { rowClass: '', label: 'background:#151C2C; color:#CBD5E1; font-weight:700;', month: 'text-align:right; font-weight:600;' },
      { rowClass: '', label: 'background:#11151F; color:#94A3B8;', month: 'text-align:right; font-weight:500;' },
      { rowClass: '', label: 'background:#0D1117; color:#64748B;', month: 'text-align:right; font-weight:400;' },
      { rowClass: '', label: 'background:#090C10; color:#475569; font-size:12px;', month: 'text-align:right; font-weight:400;' },
    ];
    // 항목/부서/담당자 계열이 공유하는 소계·총합계 칸 색.
    const PV_SUBTOTAL_STYLE_TREE = 'text-align:right; font-weight: 400; background:rgba(30,58,138,0.1);';
    const PV_TOTAL_STYLE_TREE = 'text-align:right; font-weight: 500; background:rgba(30,64,175,0.2);';

    // 채널/광고주/대행사 계열 — 위 셋과 달리 소계·총합계 칸 색이 **깊이마다 다르고**, 1단계 라벨에는
    // 인라인 배경이 없다(<strong>만 두른다). 별개 계열이므로 통일하려 들지 말 것.
    const PV_STYLE_CHANNEL = [
      { rowClass: 'row-channel', label: '',
        labelWrap: (s) => `<strong>${s}</strong>`,
        month: 'text-align: right; font-weight: 400;',
        subtotal: 'text-align: right; font-weight: 500; color: #93C5FD; background: #1E293B;',
        total: 'text-align: right; font-weight: 500; color: #60A5FA; background: #1E3A8A;' },
      { rowClass: 'row-category', label: 'background: #151C2C; color: #CBD5E1;',
        // inline-flex 래퍼는 토글이 있을 때만 감싼다 — 광고주별 피벗의 2단계는 잎이라 래퍼가 없다.
        labelWrap: (s, hasToggle) => hasToggle ? `<span style="display:inline-flex; align-items:center;">${s}</span>` : s,
        month: 'text-align: right; font-weight: 500;',
        subtotal: 'text-align: right; font-weight: 600; background: #172033;',
        total: 'text-align: right; font-weight: 400; background: #1E293B; color: #93C5FD;' },
      { rowClass: 'row-subcategory', label: 'background: #11151F; color: #94A3B8;',
        month: 'text-align: right; font-weight: 400;',
        subtotal: 'text-align: right; font-weight: 500; background: #141824;',
        total: 'text-align: right; font-weight: 600; background: #1A2234; color: #93C5FD;' },
    ];

    // 헤더 <th>에 붙일 속성 문자열. `!important`가 붙은 hex도 mapPivotHtml의 치환 키다.
    const PV_HEADER_TREE = {
      label: ' style="text-align:left; vertical-align:middle;"',
      group: '', leaf: '',
      subtotal: ' class="pv-th-summary"',
      total: ' class="pv-th-total" style="z-index:35;"',
    };
    const PV_HEADER_CHANNEL = {
      label: ' style="text-align: left; vertical-align: middle;"',
      group: ' style="text-align: center;"',
      leaf: ' style="text-align: center;"',
      subtotal: ' style="text-align: center; background: #1E3A8A !important; color: #93C5FD !important;"',
      total: ' style="text-align: center; background: #1E40AF !important; color: #FFFFFF !important; font-weight: 500; vertical-align: middle; z-index: 35;"',
    };

    // 총합계 행의 칸 속성.
    const PV_GRAND_TREE = {
      month: ' style="text-align:right; font-weight: 500;"',
      subtotal: ' class="pv-num-sum"',
      total: ' class="pv-num-total"',
    };
    const PV_GRAND_CHANNEL = {
      month: ' style="text-align: right; font-weight: 500; color: #FFFFFF;"',
      subtotal: ' style="text-align: right; font-weight: 500; color: #93C5FD; background: #1E3A8A;"',
      total: ' style="text-align: right; font-weight: 500; color: #FFFFFF; background: #1D4ED8;"',
    };

    // 채널 표시 순서 — 매출순이 아니라 편성 순서(원본 renderChannelPivotTable의 targetOrder).
    const PV_CHANNEL_ORDER = ['ENA', 'ENA DRAMA', 'ENA PLAY', 'ENA STORY', 'ONCE', 'OLIFE', 'ENA SPORTS', 'CHING', 'ONT', '헬스메디TV'];

    // 접힘 상태를 두 객체에 나눠 담는 피벗(채널·대행사)을 위한 어댑터.
    // 1단계는 앞 객체, `||`가 들어간 하위 경로는 뒤 객체로 보낸다 — 엔진은 맵 하나만 알면 되고,
    // 기존 toggleChannelNode/toggleAgencyNode 등이 쓰던 전역도 그대로 살아 있어 스위치를 껐다 켜도 이어진다.
    function pvSplitMap(topMap, deepMap) {
      const pick = (k) => (typeof k === 'string' && k.includes('||')) ? deepMap : topMap;
      return new Proxy({}, {
        get: (_, k) => pick(k)[k],
        set: (_, k, v) => { pick(k)[k] = v; return true; },
        has: (_, k) => k in pick(k),
        deleteProperty: (_, k) => { delete pick(k)[k]; return true; },
        ownKeys: () => [...Object.keys(topMap), ...Object.keys(deepMap)],
        getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
      });
    }

    const PIVOT_PRESETS = {
      category: {
        rows: ['categoryReclassified', 'subCategory', 'subCategory3'],
        rowFallbacks: ['기타', '일반', '일반'], // 값이 비었을 때 쓰던 기본값(원본 렌더러와 동일)
        fieldSorters: { categoryReclassified:'valueDesc', subCategory:'valueDesc', subCategory3:'labelAsc' },
        columns: ['year', 'month'],
        values: [{ field: 'amount', agg: 'sum' }],
        sourceFilter: null,
        columnDefaultExpanded: true,
        subtotalDepths: [0],          // 연도 그룹마다 "N년 요약"
        toggleDepth: 0,               // 연도 열 접기/펼치기
        depthStyles: PV_STYLE_TREE,
        subtotalStyle: PV_SUBTOTAL_STYLE_TREE,
        totalStyle: PV_TOTAL_STYLE_TREE,
        header: PV_HEADER_TREE,
        grandTotal: PV_GRAND_TREE,
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
        // 1단계-B 시범: 이 피벗에만 세부데이터식 빌더 사이드바를 붙였다.
        resetBtn: 'catPivotResetBtn',
        layoutId: 'catPivotLayout', builderBtn: 'catPivotBuilderBtn',
        builderDom: { fieldList:'catDdFieldList', filterBar:'catDdFilterBar', filters:'catDdWellFilterBody', columns:'catDdWellColumnsBody', rows:'catDdWellRowsBody', values:'catDdWellValuesBody' },
      },

      dept: {
        rows: ['dept', 'categoryReclassified', 'subCategory'],
        rowFallbacks: ['(미지정)', '기타', '일반'],
        fieldSorters: { dept:'deptOrder', categoryReclassified:'valueDesc', subCategory:'labelAsc' }, // 부서는 매출순이 아니라 팀 번호순
        columns: ['year', 'month'],
        values: [{ field: 'amount', agg: 'sum' }],
        sourceFilter: null,
        columnDefaultExpanded: true,
        subtotalDepths: [0],
        toggleDepth: 0,
        depthStyles: PV_STYLE_TREE,
        subtotalStyle: PV_SUBTOTAL_STYLE_TREE,
        totalStyle: PV_TOTAL_STYLE_TREE,
        header: PV_HEADER_TREE,
        grandTotal: PV_GRAND_TREE,
        expandedRows: () => expandedDeptPivot,
        expandedCols: () => expandedDeptYearColumns,
        render: () => renderDeptPivotTable(),
        dom: { head1: 'deptPivotHeaderRow1', head2: 'deptPivotHeaderRow2', body: 'deptPivotTableBody', total: 'deptPivotTotalAmount' },
      },

      manager: {
        rows: ['dept', 'manager', 'categoryReclassified', 'advertiser', 'channel'],
        rowFallbacks: ['(미지정)', '(미지정)', '기타', '(미지정)', '(미지정)'],
        fieldSorters: { dept:'deptOrder', manager:'valueDesc', categoryReclassified:'valueDesc', advertiser:'valueDesc', channel:'valueDesc' },
        columns: ['year', 'month'],
        values: [{ field: 'amount', agg: 'sum' }],
        sourceFilter: null,
        columnDefaultExpanded: true,
        subtotalDepths: [0],
        toggleDepth: 0,
        depthStyles: PV_STYLE_MANAGER,
        subtotalStyle: PV_SUBTOTAL_STYLE_TREE,
        totalStyle: PV_TOTAL_STYLE_TREE,
        header: PV_HEADER_TREE,
        grandTotal: PV_GRAND_TREE,
        expandedRows: () => expandedMgrPivot,
        expandedCols: () => expandedMgrYearColumns,
        render: () => renderManagerPivotTable(),
        dom: { head1: 'mgrPivotHeaderRow1', head2: 'mgrPivotHeaderRow2', body: 'mgrPivotTableBody', total: 'managerPivotTotalAmount' },
      },

      // --- 채널/광고주/대행사 계열 -------------------------------------------------
      // 광고주별·대행사별의 사전 필터는 categoryReclassified가 아니라 **categoryOriginal**이다.
      // 재분류 전 원본 대분류 기준이라, 바꾸면 수치가 달라진다.
      channel: {
        rows: ['channel', 'categoryReclassified', 'subCategory'],
        rowFallbacks: ['(미지정)', '기타', '일반'],
        fieldSorters: { channel:'channelOrder', categoryReclassified:'categoryOrder', subCategory:'labelAsc' },
        columns: ['year', 'month'],
        values: [{ field: 'amount', agg: 'sum' }],
        sourceFilter: null,
        columnDefaultExpanded: true,
        subtotalDepths: [0],
        toggleDepth: 0,
        depthStyles: PV_STYLE_CHANNEL,
        header: PV_HEADER_CHANNEL,
        grandTotal: PV_GRAND_CHANNEL,
        expandedRows: () => pvSplitMap(expandedChannels, expandedCategories),
        expandedCols: () => expandedYearColumns,
        render: () => renderChannelPivotTable(),
        dom: { head1: 'pivotTableHeaderRow1', head2: 'pivotTableHeaderRow2', body: 'pivotTableBody', total: 'pivotTotalAmount' },
      },

      advertiser: {
        rows: ['advertiser', 'categoryReclassified'],
        rowFallbacks: ['(미지정)', '기타'],
        fieldSorters: { advertiser:'valueDesc', categoryReclassified:'categoryOrder' },
        columns: ['year', 'month'],
        values: [{ field: 'amount', agg: 'sum' }],
        sourceFilter: (r) => r.categoryOriginal === '일반광고' || r.categoryOriginal === 'IMC',
        columnDefaultExpanded: true,
        subtotalDepths: [0],
        toggleDepth: 0,
        depthStyles: PV_STYLE_CHANNEL,
        header: PV_HEADER_CHANNEL,
        grandTotal: PV_GRAND_CHANNEL,
        expandedRows: () => expandedAdvertisers,
        expandedCols: () => expandedAdvertiserYearColumns,
        render: () => renderAdvertiserPivotTable(),
        dom: { head1: 'advertiserPivotHeaderRow1', head2: 'advertiserPivotHeaderRow2', body: 'advertiserPivotTableBody', total: 'advertiserPivotTotalAmount' },
      },

      agency: {
        rows: ['agencyGroup', 'agency', 'advertiser'],
        rowFallbacks: ['(미지정)', '(미지정)', '(미지정)'],
        fieldSorters: { agencyGroup:'valueDesc', agency:'valueDesc', advertiser:'valueDesc' },
        columns: ['year', 'month'],
        values: [{ field: 'amount', agg: 'sum' }],
        sourceFilter: (r) => r.categoryOriginal === '일반광고' || r.categoryOriginal === 'IMC',
        columnDefaultExpanded: true,
        subtotalDepths: [0],
        toggleDepth: 0,
        depthStyles: PV_STYLE_CHANNEL,
        header: PV_HEADER_CHANNEL,
        grandTotal: PV_GRAND_CHANNEL,
        expandedRows: () => pvSplitMap(expandedAgencyGroups, expandedAgencies),
        expandedCols: () => expandedAgencyYearColumns,
        render: () => renderAgencyPivotTable(),
        dom: { head1: 'agencyPivotHeaderRow1', head2: 'agencyPivotHeaderRow2', body: 'agencyPivotTableBody', total: 'agencyPivotTotalAmount' },
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
    // 합계/평균은 백만원 반올림 정수(원본 렌더러와 동일), 개수/고유개수는 건수 그대로.
    // 집계 방식을 안 보고 무조건 1e6으로 나누면 '개수 : 광고주' 같은 값이 통째로 0이 된다.
    function pvFormatCell(value, agg) {
      if (agg === 'count' || agg === 'distinct') return value ? value.toLocaleString() : '-';
      // 값이 없을 때만 대시. **음수를 대시로 감추지 않는다** — 회계조정은 음수인 경우가 많아서,
      // `m > 0`으로 거르던 원래 조건에서는 회계 기준으로 보면 그 행이 통째로 '-'였다.
      // -0.4백만이 Math.round로 -0이 되는 것만 0으로 되돌린다(그대로 두면 "-0"으로 찍힌다).
      if (!value) return '-';
      const r = Math.round(value / 1000000);
      return (Object.is(r, -0) ? 0 : r).toLocaleString();
    }

    // 정렬은 **레벨 번호가 아니라 필드**에 붙는다. 사용자가 축 순서를 바꿔도 부서는 팀 순서,
    // 채널은 편성 순서를 그대로 따라가야 하기 때문이다. 프리셋에 없는 필드는 값 내림차순.
    function pvRowSorterFor(preset, field) {
      const name = (preset.fieldSorters && preset.fieldSorters[field]) || 'valueDesc';
      return PV_ROW_SORTERS[name] || PV_ROW_SORTERS.valueDesc;
    }

    function pvRenderRows(node, preset, depth, ancestorPath, visibleColumns, valueDefs, expandedRows, out, rowFields) {
      const hasMore = depth + 1 < rowFields.length;
      const primary = valueDefs[0];
      const nodeTotal = (n) => pvComputeMetric(n.metrics[PV_ROWTOTAL], primary);
      const sorter = pvRowSorterFor(preset, rowFields[depth]);
      const keys = Object.keys(node.children).sort((a, b) => sorter(a, b, nodeTotal(node.children[a]), nodeTotal(node.children[b])));

      keys.forEach(k => {
        const child = node.children[k];
        const path = ancestorPath.concat(k);
        const pathKey = path.join('||');
        const isExpanded = !!expandedRows[pathKey];
        const st = preset.depthStyles[Math.min(depth, preset.depthStyles.length - 1)];
        const toggle = hasMore ? `<span class="toggle-icon" onclick="togglePvRowNode('${preset.key}','${pvEsc(pathKey)}')">${isExpanded ? '-' : '+'}</span>` : '';
        const trClass = st.rowClass ? ` class="${st.rowClass}"` : '';
        const label = st.labelWrap ? st.labelWrap(toggle + k, hasMore) : (toggle + k);

        let html = `<tr${trClass}><td class="indent-step-${Math.min(depth + 1, 5)}" style="${st.label}">${label}</td>`;
        visibleColumns.forEach(col => {
          const m = pvMergeMetrics(child, col.leafKeys);
          // 소계·총합계 칸 색은 클래스가 아니라 인라인이다 — pv-num-sum/pv-num-total은
          // pivot-table.css에서 `.row-grand-total` 아래에만 정의돼 있어 데이터 행에는 효과가 없다.
          const style = col.isSubtotal ? (st.subtotal || preset.subtotalStyle) : (st.month || 'text-align:right;');
          html += `<td style="${style}">${pvFormatCell(pvComputeMetric(m, primary), primary.agg)}</td>`;
        });
        html += `<td style="${st.total || preset.totalStyle}">${pvFormatCell(nodeTotal(child), primary.agg)}</td></tr>`;
        out.push(html);

        if (hasMore && isExpanded) pvRenderRows(child, preset, depth + 1, path, visibleColumns, valueDefs, expandedRows, out, rowFields);
      });
    }

    // ==========================================================================
    // 실행 중 축 구성 — 빌더 패널이 여기를 고치고, 렌더는 여기만 읽는다.
    // 프리셋은 '처음 모양'이자 초기화 기준으로만 남는다. 형태는 세부데이터의 detailDataConfig와
    // 동일하게 맞춰서(rows/columns는 필드 키 배열, values는 {id,field,agg}) 빌더 패널 코드를 공유한다.
    // ==========================================================================
    function pvConfigFor(viewKey) {
      if (!pivotConfigs[viewKey]) pvResetConfig(viewKey);
      return pivotConfigs[viewKey];
    }

    // 빌더 패널(필드 목록 + 필터/열/행/값 well)의 실제 코드는 js/features/detail-data.js에 있고,
    // 이 컨텍스트를 통해 두 화면이 나눠 쓴다. 인라인 onclick은 인자를 받지 않으므로 **지금 보고 있는
    // 화면(currentView)**으로 대상을 정한다 — 어차피 패널은 한 번에 하나만 떠 있다.
    // ctx가 null이면 세부데이터 자신을 뜻한다.
    // 상단 필터바의 취급고/회계 토글이 이미 정하는 축이라 필드 목록에서 뺀다.
    // (세부데이터는 자기 목록을 그대로 쓴다 — 거기서도 빼려면 ctx 없이도 걸리게 옮길 것.)
    const PV_HIDDEN_FIELDS = new Set(['revenueBasis']);
    function pvBuilderCtxFor(viewKey) {
      const p = PIVOT_PRESETS[viewKey];
      if (!p || !p.builderDom) return null;
      return { config: pvConfigFor(viewKey), render: () => p.render(), dom: p.builderDom, viewKey, maxValues: 1, hiddenFields: PV_HIDDEN_FIELDS };
    }
    function pvBuilderCtx() { return pvBuilderCtxFor(currentView); }
    function renderPvBuilderPanel(viewKey) {
      const ctx = pvBuilderCtxFor(viewKey);
      if (ctx) renderDetailDataBuilderPanels(ctx);
    }
    function pvResetConfig(viewKey) {
      const p = PIVOT_PRESETS[viewKey];
      pivotConfigs[viewKey] = {
        filters: [],
        rows: p.rows.slice(),
        columns: p.columns.slice(),
        values: p.values.map((v) => ({ id: detailDataValueIdCounter++, field: v.field, agg: v.agg })),
      };
    }
    function pvIsConfigDefault(viewKey) {
      const p = PIVOT_PRESETS[viewKey], c = pvConfigFor(viewKey);
      const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
      return c.filters.length === 0 && same(c.rows, p.rows) && same(c.columns, p.columns)
        && c.values.length === p.values.length && c.values.every((v, i) => v.field === p.values[i].field && v.agg === p.values[i].agg);
    }
    // 빌더 사이드바 접기/펼치기. 일반 피벗은 조회가 목적이라 기본은 접힘이다.
    function pvToggleBuilder(viewKey) {
      const preset = PIVOT_PRESETS[viewKey]; if (!preset || !preset.layoutId) return;
      const el = document.getElementById(preset.layoutId); if (!el) return;
      const open = el.classList.toggle('dd-layout-collapsed') === false;
      const btn = preset.builderBtn && document.getElementById(preset.builderBtn);
      if (btn) btn.innerText = open ? '⚙ 편집 닫기' : '⚙ 표 편집';
      if (open) renderPvBuilderPanel(viewKey); // 접혀 있는 동안 갱신을 건너뛴 경우를 대비
    }

    function pvResetPivot(viewKey) {
      pvResetConfig(viewKey);
      const m = PIVOT_PRESETS[viewKey].expandedRows(); Object.keys(m).forEach(k => { delete m[k]; });
      PIVOT_PRESETS[viewKey].render();
    }

    function renderPresetPivot(viewKey) {
      const preset = PIVOT_PRESETS[viewKey];
      if (!preset) return;
      preset.key = viewKey; // 인라인 onclick이 자기 프리셋을 되찾을 수 있게
      const cfg = pvConfigFor(viewKey);

      let rows = preset.sourceFilter ? filteredData.filter(preset.sourceFilter) : filteredData;
      // 빌더 패널의 필터 well — 상단 전역 필터바가 이미 좁힌 결과 위에 더 얹는다.
      if (cfg.filters.length) {
        rows = rows.filter(r => cfg.filters.every(f => !f.selected || f.selected.length === 0 || f.selected.includes(String(r[f.field]))));
      }
      const rowFields = cfg.rows, colFields = cfg.columns;
      const expandedRows = preset.expandedRows();
      const expandedCols = preset.expandedCols();
      const valueDefs = cfg.values.length ? cfg.values : preset.values;
      // 축을 바꾸면 원본 순서 기준의 기본값(기타/일반/…)은 의미가 없어지므로 프리셋 순서일 때만 쓴다.
      const sameRows = rowFields.length === preset.rows.length && rowFields.every((f, i) => f === preset.rows[i]);
      const fallbacks = sameRows ? preset.rowFallbacks : null;

      renderPvBuilderPanel(viewKey);
      // 프리셋과 달라졌을 때만 '원래대로'를 보여준다 — 평소 화면을 어지럽히지 않는다.
      const resetBtn = preset.resetBtn && document.getElementById(preset.resetBtn);
      if (resetBtn) resetBtn.style.display = pvIsConfigDefault(viewKey) ? 'none' : '';
      if (colFields.length === 0 || rowFields.length === 0) {
        document.getElementById(preset.dom.head1).innerHTML = mapPivotHtml(`<th${preset.header.label}>구분</th>`);
        document.getElementById(preset.dom.head2).innerHTML = '';
        document.getElementById(preset.dom.body).innerHTML =
          `<tr><td style="text-align:center; color:var(--text-tertiary); padding:16px;">${rowFields.length ? '열' : '행'} 영역에 필드를 놓으세요</td></tr>`;
        document.getElementById(preset.dom.total).innerText = '0 백만';
        return;
      }

      const { root, colCombos } = pvBuildTree(rows, rowFields, colFields, valueDefs, fallbacks);

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
        header: preset.header,
      };
      const visibleColumns = pvBuildVisibleColumns(liveCombos, colFields, expandedCols, opt);
      const headerRows = pvRenderColumnHeaderRows(visibleColumns, colFields, opt);

      const h1 = `<th rowspan="${colFields.length}"${preset.header.label}>구분</th>`
        + headerRows[0]
        + `<th rowspan="${colFields.length}"${preset.header.total}>총합계</th>`;
      document.getElementById(preset.dom.head1).innerHTML = mapPivotHtml(h1);
      document.getElementById(preset.dom.head2).innerHTML = mapPivotHtml(headerRows[1] || '');

      const out = [];
      pvRenderRows(root, preset, 0, [], visibleColumns, valueDefs, expandedRows, out, rowFields);

      let body = out.join('');
      body += `<tr class="row-grand-total"><td class="indent-step-1">총합계</td>`;
      const G = preset.grandTotal;
      visibleColumns.forEach(col => {
        const m = pvMergeMetrics(root, col.leafKeys);
        body += `<td${col.isSubtotal ? G.subtotal : G.month}>${pvFormatCell(pvComputeMetric(m, primary), primary.agg)}</td>`;
      });
      const grand = pvComputeMetric(root.metrics[PV_ROWTOTAL], primary);
      body += `<td${G.total}>${pvFormatCell(grand, primary.agg)}</td></tr>`;
      document.getElementById(preset.dom.body).innerHTML = mapPivotHtml(body);

      document.getElementById(preset.dom.total).innerText = (primary.agg === 'count' || primary.agg === 'distinct')
        ? `${(grand || 0).toLocaleString()} 건`
        : `${Math.round((grand || 0) / 1000000).toLocaleString()} 백만`;
    }
