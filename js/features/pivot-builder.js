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

    // 이름 정렬은 자연 정렬로 한다 — 한글은 가나다, 영문은 abc, 숫자는 수의 크기대로.
    // numeric 없이는 '광고주10'이 '광고주9'보다 앞에 온다(문자 하나씩 비교하므로).
    const PV_COLLATE = { numeric: true, sensitivity: 'base' };

    // 엑셀과 같은 무리 순서로 나눈다: (주)… 같은 기호 → 숫자 → 영문 → 한글.
    // localeCompare('ko')만 쓰면 한글이 영문보다 앞에 와서 엑셀과 반대가 된다.
    function pvNameRank(s) {
      const ch = String(s == null ? '' : s).trim().charAt(0);
      if (!ch) return 9;
      if (ch >= '0' && ch <= '9') return 1;
      if (/[A-Za-z]/.test(ch)) return 2;
      if (/[\uAC00-\uD7A3\u3131-\u318E]/.test(ch)) return 3; // 한글 음절과 자모
      return 0; // 괄호·기호 등은 맨 앞
    }
    function pvCompareNames(a, b) {
      const ra = pvNameRank(a), rb = pvNameRank(b);
      if (ra !== rb) return ra - rb;
      return String(a).localeCompare(String(b), 'ko', PV_COLLATE);
    }

    const PV_ROWTOTAL = '__ROWTOTAL__';   // 열 구분과 무관한 행 전체 합계용 버킷
    const PV_SUBTOTAL = '__SUBTOTAL__';   // 그룹 소계 열을 잎(leaf)처럼 다루기 위한 표식
    const PV_ALLCOL = '__TOTAL__';        // 열 필드가 없을 때의 단일 버킷

    function pvEsc(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

    // 행·열 값 표시. 연/월은 숫자 그대로가 아니라 "2026년"/"1월"로, 업프론트여부는 true/false 대신
    // 사람이 읽는 말로 적는다. **표시만 바꾼다** — 접힘 상태 키와 필터 선택값은 원래 값 그대로여야 한다.
    // (js/features/detail-data.js의 ddFormatFieldValue가 같은 표를 들고 있다. 한쪽을 고치면 같이 고칠 것.)
    function pvFormatFieldValue(fieldKey, rawValue) {
      if (rawValue === '(미지정)') return rawValue;
      if (fieldKey === 'year') return `${rawValue}년`;
      if (fieldKey === 'month') return `${rawValue}월`;
      if (fieldKey === 'isUpfront') return String(rawValue) === 'true' ? '업프론트' : '업프론트 미계약';
      return rawValue;
    }

    // 열 축 정렬 규칙. 여기 없는 필드는 한국어 로케일 문자열 비교.
    // **월을 문자열로 비교하면 1, 10, 11, 12, 2, 3… 순이 된다.** 연도는 최근이 왼쪽에 오도록 내림차순.
    // 비교자는 **항상 오름차순**으로 정의하고 방향은 따로 곱한다 — 그래야 사용자가 고른
    // 오름/내림이 필드 종류와 무관하게 같은 뜻이 된다.
    const PV_FIELD_SORT_ASC = {
      year: (a, b) => Number(a) - Number(b),
      month: (a, b) => Number(a) - Number(b),
    };
    // 기본 방향. 연도만 최근이 왼쪽에 오도록 내림차순이고 나머지는 오름차순이다.
    const PV_FIELD_DEFAULT_DIR = { year: 'desc' };
    function pvColumnDir(fieldKey, cfg) {
      const s = cfg && cfg.sorts && cfg.sorts[fieldKey];
      return (s && s.dir) || PV_FIELD_DEFAULT_DIR[fieldKey] || 'asc';
    }
    function pvCompareFieldValues(fieldKey, a, b, dir) {
      const f = PV_FIELD_SORT_ASC[fieldKey];
      const r = f ? f(a, b) : pvCompareNames(a, b);
      return dir === 'desc' ? -r : r;
    }

    // 행 정렬자. 프리셋이 레벨마다 하나씩 고른다. total은 그 노드의 행 전체 합계(PV_ROWTOTAL 기준).
    const PV_ROW_SORTERS = {
      valueDesc: (a, b, ta, tb) => tb - ta,
      valueAsc: (a, b, ta, tb) => ta - tb,
      labelAsc: (a, b) => pvCompareNames(a, b),
      labelDesc: (a, b) => pvCompareNames(b, a),
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
      return pvCompareNames(a, b);
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
    function pvBuildTree(rows, rowFields, colFields, valueDefs, rowFallbacks, cfg) {
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
          const c = pvCompareFieldValues(colFields[i], a[i] ?? '', b[i] ?? '', pvColumnDir(colFields[i], cfg));
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
        const childVals = [...node.children.keys()].sort((a, b) => pvCompareFieldValues(colFields[depth], a, b, pvColumnDir(colFields[depth], opt.cfg)));
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
      const topVals = [...tree.children.keys()].sort((a, b) => pvCompareFieldValues(colFields[0], a, b, pvColumnDir(colFields[0], opt.cfg)));
      topVals.forEach(v => pvWalkColumnNode(tree.children.get(v), 1, [v], colFields, expandedCols, opt, out));
      return out;
    }

    function pvArraysEqual(a, b) { return a.length === b.length && a.every((v, i) => v === b[i]); }

    // 깊이별 헤더 행. 자기 깊이에서 끝나는 열(소계 등)은 남은 헤더 행을 rowspan으로 덮는다.
    function pvRenderColumnHeaderRows(visibleColumns, colFields, opt) {
      const cs = opt.cfg && opt.cfg.colSort;
      const mark = (pk) => (cs && cs.pathKey === pk) ? (cs.dir === 'asc' ? ' ▲' : ' ▼') : '';
      // class가 아니라 data 속성으로 표시한다 — H.subtotal 등이 이미 class를 갖고 있어서 class를
      // 한 번 더 붙이면 같은 속성이 두 번 나오고 파서가 뒤엣것을 통째로 버린다. 그래서 정렬 표시가
      // 조용히 사라졌었다(onclick은 남고 클래스만 없어져 눈에 잘 안 띈다).
      const click = opt.colClick || ((pk) => ` data-pvsort="1" onclick="pvSortByColumn('${opt.presetKey}','${pvEsc(pk)}')"`);
      // 좌클릭은 '이 열 값으로 행 정렬', 우클릭은 '이 축의 순서'. 서로 다른 일이라 갈라 둔다.
      // 우클릭은 행 라벨에서든 열 헤더에서든 "여기 기준으로 정렬"이어야 뜻이 같다.
      // 값이 있는 열이면 그 열 기준 행 정렬을 먼저 보여주고, 그 아래에 축 나열 순서를 붙인다.
      // 그룹 헤더(연도)는 한 칸에 값이 여러 개라 "이 열 기준"이 성립하지 않으므로 축 순서만.
      // colClick/colMenu를 프리셋이 덮어쓸 수 있게 열어 둔 이유: 목표 피벗은 한 열이 세 칸(목표·실적·달성률)이라
      // '값'이 무엇인지가 갈라져서, 같은 메뉴를 쓸 수 없다.
      const menu = opt.colMenu || ((orderDepth, pathKey, label) => ` oncontextmenu="return pvOpenColMenu(event,'${opt.presetKey}',${orderDepth},'${pvEsc(pathKey || '')}','${pvEsc(label)}')"`);
      // 한 열이 여러 칸을 차지하는 표(목표 피벗 = 3칸)를 위해 colspan을 곱한다. 기본은 1칸.
      const spanMul = opt.spanMul || 1;
      const mulAttr = spanMul > 1 ? ` colspan="${spanMul}"` : '';
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
            const span = (L - depth > 1 ? ` rowspan="${L - depth}"` : '') + mulAttr;
            if (col.isSubtotal) {
              const label = `${pvFormatFieldValue(col.groupField, col.groupValue)} 요약`;
              // 소계 칸도 우클릭을 받는다 — 연도를 접으면 화면에 보이는 열 제목이 이것뿐이라,
              // 여기서 안 되면 "열 순서가 안 먹는다"가 된다. 소계는 한 단계 위 그룹(연)에 속한다.
              cells.push(`<th${span}${H.subtotal}${click(col.pathKey)}${menu(depth - 1, col.pathKey, label)}>${label}${mark(col.pathKey)}</th>`);
            } else {
              const label = pvFormatFieldValue(colFields[depth], col.path[col.path.length - 1]);
              cells.push(`<th${span}${H.leaf}${click(col.pathKey)}${menu(depth, col.pathKey, label)}>${label}${mark(col.pathKey)}</th>`);
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
            cells.push(`<th colspan="${span * spanMul}"${H.group}${menu(depth, '', label)}>${toggle}${label}</th>`);
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
      { rowClass: '', label: 'background:#0D1117; color:#64748B;', month: 'text-align:right; font-weight:var(--fw-ui);' },
      { rowClass: '', label: 'background:#090C10; color:#475569; font-size:12px;', month: 'text-align:right; font-weight:var(--fw-ui);' },
    ];
    // 항목/부서/담당자 계열이 공유하는 소계·총합계 칸 색.
    const PV_SUBTOTAL_STYLE_TREE = 'text-align:right; font-weight: var(--fw-ui); background:rgba(30,58,138,0.1);';
    const PV_TOTAL_STYLE_TREE = 'text-align:right; font-weight: 500; background:rgba(30,64,175,0.2);';

    // 채널/광고주/대행사 계열 — 위 셋과 달리 소계·총합계 칸 색이 **깊이마다 다르고**, 1단계 라벨에는
    // 인라인 배경이 없다(<strong>만 두른다). 별개 계열이므로 통일하려 들지 말 것.
    const PV_STYLE_CHANNEL = [
      { rowClass: 'row-channel', label: '',
        labelWrap: (s) => `<strong>${s}</strong>`,
        month: 'text-align: right; font-weight: var(--fw-ui);',
        subtotal: 'text-align: right; font-weight: 500; color: #93C5FD; background: #1E293B;',
        total: 'text-align: right; font-weight: 500; color: #60A5FA; background: #1E3A8A;' },
      { rowClass: 'row-category', label: 'background: #151C2C; color: #CBD5E1;',
        // inline-flex 래퍼는 토글이 있을 때만 감싼다 — 광고주별 피벗의 2단계는 잎이라 래퍼가 없다.
        labelWrap: (s, hasToggle) => hasToggle ? `<span style="display:inline-flex; align-items:center;">${s}</span>` : s,
        month: 'text-align: right; font-weight: 500;',
        subtotal: 'text-align: right; font-weight: 600; background: #172033;',
        total: 'text-align: right; font-weight: var(--fw-ui); background: #1E293B; color: #93C5FD;' },
      { rowClass: 'row-subcategory', label: 'background: #11151F; color: #94A3B8;',
        month: 'text-align: right; font-weight: var(--fw-ui);',
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
    const PV_CHANNEL_ORDER = ['ENA', 'ENA DRAMA', 'ENA PLAY', 'ENA STORY', 'ONCE', 'OLIFE', 'ENA SPORTS', '기타', 'CHING', 'ONT', '헬스메디TV'];

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
        resetBtn: 'deptPivotResetBtn',
        layoutId: 'deptPivotLayout', builderBtn: 'deptPivotBuilderBtn',
        builderDom: { fieldList:'deptDdFieldList', filterBar:'deptDdFilterBar', filters:'deptDdWellFilterBody', columns:'deptDdWellColumnsBody', rows:'deptDdWellRowsBody', values:'deptDdWellValuesBody' },
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
        resetBtn: 'mgrPivotResetBtn',
        layoutId: 'mgrPivotLayout', builderBtn: 'mgrPivotBuilderBtn',
        builderDom: { fieldList:'mgrDdFieldList', filterBar:'mgrDdFilterBar', filters:'mgrDdWellFilterBody', columns:'mgrDdWellColumnsBody', rows:'mgrDdWellRowsBody', values:'mgrDdWellValuesBody' },
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
        resetBtn: 'chPivotResetBtn',
        layoutId: 'chPivotLayout', builderBtn: 'chPivotBuilderBtn',
        builderDom: { fieldList:'chDdFieldList', filterBar:'chDdFilterBar', filters:'chDdWellFilterBody', columns:'chDdWellColumnsBody', rows:'chDdWellRowsBody', values:'chDdWellValuesBody' },
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
        resetBtn: 'advPivotResetBtn',
        layoutId: 'advPivotLayout', builderBtn: 'advPivotBuilderBtn',
        builderDom: { fieldList:'advDdFieldList', filterBar:'advDdFilterBar', filters:'advDdWellFilterBody', columns:'advDdWellColumnsBody', rows:'advDdWellRowsBody', values:'advDdWellValuesBody' },
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
        resetBtn: 'agyPivotResetBtn',
        layoutId: 'agyPivotLayout', builderBtn: 'agyPivotBuilderBtn',
        builderDom: { fieldList:'agyDdFieldList', filterBar:'agyDdFilterBar', filters:'agyDdWellFilterBody', columns:'agyDdWellColumnsBody', rows:'agyDdWellRowsBody', values:'agyDdWellValuesBody' },
        dom: { head1: 'agencyPivotHeaderRow1', head2: 'agencyPivotHeaderRow2', body: 'agencyPivotTableBody', total: 'agencyPivotTotalAmount' },
      },

      // --- 목표 대비 실적 2종 ------------------------------------------------------
      // 이 둘은 **엔진이 그리지 않는다**(render가 renderGoalPivot으로 나간다). 한 열이 목표·실적·달성률
      // 세 칸이고 값이 두 소스(salesTargets / rawData)에서 오기 때문이다. 그래도 프리셋으로 등록하는
      // 이유는 축 구성(pvConfigFor)·열 접기(togglePvColNode)·빌더 패널·원래대로가 전부 뷰 키만 보고
      // 도는 공용 코드라, 등록만 해두면 그 상호작용을 그대로 물려받기 때문이다.
      //
      // 놓을 수 있는 필드를 다섯 개로 묶어 둔 것이 핵심 제약이다(PV_GOAL_FIELDS). 목표(salesTargets)는
      // **담당자 × 5대분류 × 연월** 단위로만 편성돼 있어서, 채널·광고주·대행사를 축에 놓으면 실적만
      // 쪼개지고 목표는 그대로라 달성률이 거짓으로 낮아진다(kpi.js의 스코프 주석 참고).
      goalTrendPivot: {
        goal: true,
        rows: ['categoryReclassified'],
        columns: ['year', 'month'],
        values: [],
        columnDefaultExpanded: true,
        subtotalDepths: [0],
        toggleDepth: 0,
        expandedRows: () => expandedGoalTrendPivot,
        expandedCols: () => expandedGoalTrendYearColumns,
        render: () => renderGoalPivot('goalTrendPivot'),
        resetBtn: 'goalTrendPivotResetBtn',
        layoutId: 'goalTrendPivotLayout', builderBtn: 'goalTrendPivotBuilderBtn',
        builderDom: { fieldList:'goalTrendDdFieldList', columns:'goalTrendDdWellColumnsBody', rows:'goalTrendDdWellRowsBody' },
      },

      goalDeptPivot: {
        goal: true,
        rows: ['dept', 'manager', 'categoryReclassified'],
        columns: ['year', 'month'],
        values: [],
        columnDefaultExpanded: true,
        subtotalDepths: [0],
        toggleDepth: 0,
        expandedRows: () => expandedGoalDeptPivot,
        expandedCols: () => expandedGoalDeptYearColumns,
        render: () => renderGoalPivot('goalDeptPivot'),
        resetBtn: 'goalDeptPivotResetBtn',
        layoutId: 'goalDeptPivotLayout', builderBtn: 'goalDeptPivotBuilderBtn',
        builderDom: { fieldList:'goalDeptDdFieldList', columns:'goalDeptDdWellColumnsBody', rows:'goalDeptDdWellRowsBody' },
      },

      // --- 대행사비교 / 업프론트 ---------------------------------------------------
      // 이 둘도 엔진이 그리지 않는다(열이 축이 아니라 고정 지표 열이다 — 전년/전월/당월 + 증감,
      // 계약금액/기간 + 월별). 행 축만 바꿀 수 있으므로 빌더에는 행 well 하나만 둔다.
      agencyCompPivot: {
        custom: true,
        rows: ['agencyGroup', 'agency', 'advertiser'],
        columns: [], values: [],
        expandedRows: () => pvSplitMap(expandedCompAgencyGroups, expandedCompAgencies),
        expandedCols: () => ({}),
        render: () => renderAgencyCompPivotTable(),
        resetBtn: 'agencyCompPivotResetBtn',
        layoutId: 'agencyCompPivotLayout', builderBtn: 'agencyCompPivotBuilderBtn',
        builderDom: { fieldList:'agencyCompDdFieldList', rows:'agencyCompDdWellRowsBody' },
      },

      upfrontPivot: {
        custom: true,
        rows: ['dept', 'upfrontAdvertiser', 'agency'],
        columns: [], values: [],
        expandedRows: () => pvSplitMap(expandedUpfrontDepts, expandedUpfrontAdvertisers),
        expandedCols: () => ({}),
        render: () => renderUpfrontPivotTable(),
        resetBtn: 'upfrontPivotResetBtn',
        layoutId: 'upfrontPivotLayout', builderBtn: 'upfrontPivotBuilderBtn',
        builderDom: { fieldList:'upfrontDdFieldList', rows:'upfrontDdWellRowsBody' },
      },

      // 세부데이터는 자기 렌더러(detail-data.js)와 자기 config(detailDataConfig)를 그대로 쓴다.
      // 여기 등록하는 이유는 정렬 메뉴·열 정렬이 뷰 키만 보고 도는 공용 코드이기 때문이다.
      // **builderDom을 두지 않는다** — 두면 pvBuilderCtx()가 걸려서 자기 패널을 남의 것으로 착각한다.
      detailData: {
        custom: true,
        rows: [], columns: [], values: [],
        expandedRows: () => expandedDetailDataPivot,
        expandedCols: () => expandedDetailDataColPivot,
        render: () => renderDetailDataPivot(),
      },
    };

    // 목표 피벗의 빌더 패널에 내보내는 필드. 목표가 이 축들로만 편성돼 있어서 이 밖은 놓을 수 없다.
    const PV_GOAL_FIELDS = ['year', 'month', 'dept', 'manager', 'categoryReclassified'];

    // 대행사비교는 **연·월을 축에 놓을 수 없다.** 세 기간(전년동월·전월·당월)이 서로 다른 연월의 행에서
    // 오기 때문에, 연이나 월로 행을 가르면 같은 줄에서 만나야 할 세 값이 서로 다른 줄로 흩어진다.
    const PV_AC_FIELDS = ['agencyGroup', 'agency', 'advertiser', 'dept', 'manager',
      'categoryReclassified', 'subCategory', 'subCategory3', 'channel', 'industry', 'broadDigital', 'isUpfront'];

    // 업프론트는 연 1개 선택이 전제이고 월이 이미 열 축이라 둘 다 뺀다.
    // upfrontAdvertiser(업프론트광고주)는 이 표에만 쓰는 필드라 공용 필드 목록에는 없다.
    const PV_UP_FIELDS = ['dept', 'upfrontAdvertiser', 'agency', 'agencyGroup', 'advertiser', 'manager',
      'categoryReclassified', 'subCategory', 'channel', 'industry', 'broadDigital'];

    // 뷰별 필드 화이트리스트(빌더 목록에 이 순서로 나오고, 드롭도 이것만 받는다).
    const PV_FIELD_WHITELIST = {
      goalTrendPivot: PV_GOAL_FIELDS, goalDeptPivot: PV_GOAL_FIELDS,
      agencyCompPivot: PV_AC_FIELDS, upfrontPivot: PV_UP_FIELDS,
    };

    const PV_GRAND = '__GRAND__'; // 총합계 열의 가상 pathKey (visibleColumns에는 없다)

    // 열 헤더 클릭 — 같은 열을 다시 누르면 방향이 뒤집힌다. 처음 누르면 큰 값부터.
    function pvSortByColumn(viewKey, pathKey) {
      const cfg = pvConfigFor(viewKey);
      const cur = cfg.colSort;
      cfg.colSort = (cur && cur.pathKey === pathKey && cur.dir === 'desc') ? { pathKey, dir: 'asc' } : { pathKey, dir: 'desc' };
      PIVOT_PRESETS[viewKey].render();
    }
    function pvClearColumnSort(viewKey) {
      const cfg = pvConfigFor(viewKey);
      if (!cfg.colSort) return;
      cfg.colSort = null;
      PIVOT_PRESETS[viewKey].render();
    }

    // 행 라벨 우클릭 메뉴 — 그 레벨의 필드에만 적용된다.
    function pvOpenRowSortMenu(ev, viewKey, depth) {
      const cfg = pvConfigFor(viewKey);
      const field = cfg.rows[depth];
      if (!field) return true;
      const isYm = (field === 'year' || field === 'month');
      const cur = (cfg.sorts && cfg.sorts[field]) ? `${cfg.sorts[field].by}:${cfg.sorts[field].dir}` : '';
      const items = [
        ['value:desc', '값 큰 순'], ['value:asc', '값 작은 순'],
        ['label:asc', isYm ? '오름차순' : '이름 오름차순'], ['label:desc', isYm ? '내림차순' : '이름 내림차순'],
      ];
      if (PV_FIELD_ORDER_SORTER[field]) items.push(['preset:asc', '기본 순서'], ['preset:desc', '기본 순서 역순']);
      return pvShowMenu(ev, `${detailDataFieldLabel(field)} 정렬`,
        items.map(([v, t]) => [t, v === cur, `pvPickRowSort('${viewKey}','${pvEsc(field)}','${v}')`]));
    }
    // 한 행에 값이 여러 가지인 표(목표 = 목표·실적·달성률, 대행사비교 = 전년·전월·당월)의 행 정렬 메뉴.
    // 저런 표에서는 "값 큰 순"이 무엇 기준인지 갈리므로 기준을 먼저 고르게 한다.
    //   metrics  [[정렬키, 표시이름, 큰쪽 말, 작은쪽 말], ...] — 뒤 둘은 생략하면 '큰'/'작은'
    //            (달성률은 "큰 순"보다 "높은 순"이 읽기 자연스럽다)
    //   pickFn   고른 값을 적용할 전역 함수 이름(표마다 자기 렌더러를 불러야 해서 이름으로 받는다)
    //   orderMap 그 필드에 고유 순서가 있는지 판단할 표(없으면 '기본 순서' 항목을 빼고 보여준다)
    function pvOpenMetricRowSortMenu(ev, viewKey, depth, metrics, pickFn, orderMap) {
      const cfg = pvConfigFor(viewKey);
      const field = cfg.rows[depth];
      if (!field) return true;
      const cur = (cfg.sorts && cfg.sorts[field]) ? `${cfg.sorts[field].by}:${cfg.sorts[field].dir}` : '';
      const isYm = (field === 'year' || field === 'month');
      const items = [];
      metrics.forEach(pair => {
        items.push([`${pair[1]} ${pair[2] || '큰'} 순`, `${pair[0]}:desc`]);
        items.push([`${pair[1]} ${pair[3] || '작은'} 순`, `${pair[0]}:asc`]);
      });
      items.push([isYm ? '오름차순' : '이름 오름차순', 'label:asc'], [isYm ? '내림차순' : '이름 내림차순', 'label:desc']);
      if ((orderMap || PV_FIELD_ORDER_SORTER)[field]) items.push(['기본 순서', 'preset:asc'], ['기본 순서 역순', 'preset:desc']);
      return pvShowMenu(ev, `${detailDataFieldLabel(field)} 정렬`,
        items.map(it => [it[0], it[1] === cur, `${pickFn}('${viewKey}','${pvEsc(field)}','${it[1]}')`]));
    }
    // 위 메뉴에서 고른 값을 저장하고 그 표를 다시 그린다. 표마다 다른 것이 없어 하나로 쓴다.
    function pvPickMetricRowSort(viewKey, field, val) {
      pvCloseRowSortMenu();
      const cfg = pvConfigFor(viewKey);
      if (!cfg.sorts) cfg.sorts = {};
      const p = val.split(':');
      cfg.sorts[field] = { by: p[0], dir: p[1] };
      cfg.colSort = null;
      PIVOT_PRESETS[viewKey].render();
    }
    // 위 메뉴가 정한 정렬을 실제 비교자로 바꾼다. metricOf(노드, 기준키)는 표마다 다르므로 받는다.
    function pvMetricRowSorter(field, cfg, metricOf, fallback, orderMap) {
      const s = cfg && cfg.sorts && cfg.sorts[field];
      const om = orderMap || PV_FIELD_ORDER_SORTER;
      if (s) {
        if (s.by === 'label') return (a, b) => pvCompareFieldValues(field, a, b, s.dir);
        if (s.by === 'preset' && om[field]) {
          const base = PV_ROW_SORTERS[om[field]];
          return s.dir === 'desc' ? (a, b) => -base(a, b) : base;
        }
        const sign = s.dir === 'asc' ? 1 : -1;
        return (a, b, na, nb) => sign * (metricOf(na, s.by) - metricOf(nb, s.by));
      }
      if (om[field]) return PV_ROW_SORTERS[om[field]];
      if (PV_FIELD_SORT_ASC[field]) return (a, b) => pvCompareFieldValues(field, a, b, pvColumnDir(field, cfg));
      return fallback;
    }

    // 열 헤더 우클릭. 값이 있는 열이면 "그 열 기준 행 정렬"이 먼저고, 그 아래에 축 나열 순서를 둔다.
    // orderDepth < 0 이면 축이 없는 열(총합계)이라 값 정렬만 나온다.
    function pvOpenColMenu(ev, viewKey, orderDepth, pathKey, label) {
      const cfg = pvConfigFor(viewKey);
      const items = [];
      if (pathKey) {
        const cs = cfg.colSort;
        const on = (d) => !!(cs && cs.pathKey === pathKey && cs.dir === d);
        items.push(['값 내림차순', on('desc'), `pvSetColumnSort('${viewKey}','${pvEsc(pathKey)}','desc')`]);
        items.push(['값 오름차순', on('asc'), `pvSetColumnSort('${viewKey}','${pvEsc(pathKey)}','asc')`]);
      }
      const field = orderDepth >= 0 ? cfg.columns[orderDepth] : null;
      if (field) {
        const dir = (cfg.sorts && cfg.sorts[field]) ? cfg.sorts[field].dir : null;
        items.push([`${detailDataFieldLabel(field)} 열 순서`, false, '']); // 구획 제목(클릭 안 됨)
        items.push(['오름차순', dir === 'asc', `pvPickColOrder('${viewKey}','${pvEsc(field)}','asc')`]);
        items.push(['내림차순', dir === 'desc', `pvPickColOrder('${viewKey}','${pvEsc(field)}','desc')`]);
      }
      if (!items.length) return true;
      return pvShowMenu(ev, label, items);
    }
    // 방향을 명시해 거는 열 정렬(메뉴용). 헤더 좌클릭은 pvSortByColumn이 토글로 처리한다.
    function pvSetColumnSort(viewKey, pathKey, dir) {
      pvCloseRowSortMenu();
      pvConfigFor(viewKey).colSort = { pathKey, dir };
      PIVOT_PRESETS[viewKey].render();
    }
    // 열이 축이 아니라 **고정 지표**인 표(대행사비교 = 전년·전월·당월·증감, 업프론트 = 월별·총합계)의
    // 헤더 우클릭. 축 순서라는 개념이 없으므로 "이 열 기준 행 정렬"만 고른다.
    // 좌클릭은 일반 피벗과 같이 pvSortByColumn이 방향을 토글한다.
    function pvOpenFixedColMenu(ev, viewKey, key, label) {
      const cs = pvConfigFor(viewKey).colSort;
      const on = (d) => !!(cs && cs.pathKey === key && cs.dir === d);
      const items = [
        ['내림차순', on('desc'), `pvSetColumnSort('${viewKey}','${pvEsc(key)}','desc')`],
        ['오름차순', on('asc'), `pvSetColumnSort('${viewKey}','${pvEsc(key)}','asc')`],
      ];
      if (cs) items.push(['정렬 해제', false, `pvClearColumnSortFromMenu('${viewKey}')`]);
      return pvShowMenu(ev, label, items);
    }
    function pvClearColumnSortFromMenu(viewKey) { pvCloseRowSortMenu(); pvClearColumnSort(viewKey); }
    // 정렬이 걸린 열에 붙는 화살표.
    function pvColSortMark(viewKey, key) {
      const cs = pvConfigFor(viewKey).colSort;
      return (cs && cs.pathKey === key) ? (cs.dir === 'asc' ? ' ▲' : ' ▼') : '';
    }
    function pvPickColOrder(viewKey, field, dir) {
      pvCloseRowSortMenu();
      const cfg = pvConfigFor(viewKey);
      if (!cfg.sorts) cfg.sorts = {};
      if (!dir) delete cfg.sorts[field]; else cfg.sorts[field] = { by: 'label', dir };
      PIVOT_PRESETS[viewKey].render();
    }
    // 메뉴 하나를 두 곳(행 라벨·열 헤더)이 나눠 쓴다. items: [표시문구, 현재값여부, onclick식]
    function pvShowMenu(ev, title, items) {
      ev.preventDefault(); ev.stopPropagation();
      let el = document.getElementById('pvRowSortMenu');
      if (!el) { el = document.createElement('div'); el.id = 'pvRowSortMenu'; el.className = 'pv-row-menu'; document.body.appendChild(el); }
      el.innerHTML = `<div class="pv-row-menu-title">${title}</div>`
        + items.map(([t, on, fn]) => fn
            ? `<div class="pv-row-menu-item${on ? ' is-on' : ''}" onclick="${fn}">${t}</div>`
            : `<div class="pv-row-menu-sep">${t}</div>`).join('');
      el.style.display = 'block';
      const w = 160, h = el.offsetHeight || 200;
      el.style.left = Math.min(ev.clientX, window.innerWidth - w - 8) + 'px';
      el.style.top = Math.min(ev.clientY, window.innerHeight - h - 8) + 'px';
      setTimeout(() => document.addEventListener('click', pvCloseRowSortMenu, { once: true }), 0);
      return false;
    }

    function pvCloseRowSortMenu() {
      const el = document.getElementById('pvRowSortMenu');
      if (el) el.style.display = 'none';
    }
    function pvPickRowSort(viewKey, field, val) {
      pvCloseRowSortMenu();
      const cfg = pvConfigFor(viewKey);
      if (!cfg.sorts) cfg.sorts = {};
      if (!val) delete cfg.sorts[field];
      else { const [by, dir] = val.split(':'); cfg.sorts[field] = { by, dir }; }
      cfg.colSort = null; // 레벨별로 정하겠다는 뜻이므로 전 레벨 공통 정렬은 푼다
      PIVOT_PRESETS[viewKey].render();
    }

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
    // 필드가 스스로 갖는 고정 순서(프리셋과 무관하다 — 부서는 어디서나 팀 번호순이다).
    const PV_FIELD_ORDER_SORTER = { dept: 'deptOrder', categoryReclassified: 'categoryOrder', channel: 'channelOrder' };
    function pvRowSorterFor(preset, field, cfg) {
      // 이름순은 **필드를 아는** 비교자로 만든다. 연·월을 문자로 비교하면 1, 10, 11, 12, 2… 가 된다.
      const byLabel = (dir) => (a, b) => pvCompareFieldValues(field, a, b, dir === 'desc' ? 'desc' : 'asc');
      const s = cfg && cfg.sorts && cfg.sorts[field];
      if (s) {
        const flip = (fn) => (a, b, ta, tb) => -fn(a, b, ta, tb);
        if (s.by === 'value') return s.dir === 'asc' ? PV_ROW_SORTERS.valueAsc : PV_ROW_SORTERS.valueDesc;
        if (s.by === 'label') return byLabel(s.dir);
        if (s.by === 'preset' && PV_FIELD_ORDER_SORTER[field]) {
          const base = PV_ROW_SORTERS[PV_FIELD_ORDER_SORTER[field]];
          return s.dir === 'asc' ? base : flip(base);
        }
      }
      // 연·월이 행에 오면 매출순이 아니라 시간 순이 기본이다(연은 최근부터, 월은 1월부터).
      if (PV_FIELD_SORT_ASC[field]) return byLabel(PV_FIELD_DEFAULT_DIR[field] || 'asc');
      const name = (preset.fieldSorters && preset.fieldSorters[field]) || 'valueDesc';
      return PV_ROW_SORTERS[name] || PV_ROW_SORTERS.valueDesc;
    }

    function pvRenderRows(node, preset, depth, ancestorPath, visibleColumns, valueDefs, expandedRows, out, rowFields, cfg) {
      const hasMore = depth + 1 < rowFields.length;
      const primary = valueDefs[0];
      const nodeTotal = (n) => pvComputeMetric(n.metrics[PV_ROWTOTAL], primary);

      // 열 헤더를 눌러 건 정렬이 있으면 그 열 값으로, 없으면 필드별 규칙으로 정렬한다.
      // 열 기준은 **모든 레벨에 같이** 걸린다 — 헤더는 하나인데 행 계층은 여럿이라 달리 나눌 수가 없다.
      // 레벨마다 다르게 두고 싶으면 행 라벨 우클릭(필드별 설정)을 쓴다.
      const cs = cfg && cfg.colSort;
      const sortCol = cs ? (cs.pathKey === PV_GRAND ? PV_GRAND : visibleColumns.find(c => c.pathKey === cs.pathKey)) : null;
      let keys;
      if (sortCol) {
        const val = (n) => sortCol === PV_GRAND
          ? nodeTotal(n)
          : pvComputeMetric(pvMergeMetrics(n, sortCol.leafKeys), primary);
        const sign = cs.dir === 'asc' ? 1 : -1;
        keys = Object.keys(node.children).sort((a, b) => sign * (val(node.children[a]) - val(node.children[b])));
      } else {
        const sorter = pvRowSorterFor(preset, rowFields[depth], cfg);
        keys = Object.keys(node.children).sort((a, b) => sorter(a, b, nodeTotal(node.children[a]), nodeTotal(node.children[b])));
      }

      keys.forEach(k => {
        const child = node.children[k];
        const path = ancestorPath.concat(k);
        const pathKey = path.join('||');
        const isExpanded = !!expandedRows[pathKey];
        const st = preset.depthStyles[Math.min(depth, preset.depthStyles.length - 1)];
        const toggle = hasMore ? `<span class="toggle-icon" onclick="togglePvRowNode('${preset.key}','${pvEsc(pathKey)}')">${isExpanded ? '-' : '+'}</span>` : '';
        const trClass = st.rowClass ? ` class="${st.rowClass}"` : '';
        // 표시용 이름만 바꾼다 — 접힘 상태 키(pathKey)는 원래 값 그대로여야 한다.
        const shown = pvFormatFieldValue(rowFields[depth], k);
        const label = st.labelWrap ? st.labelWrap(toggle + shown, hasMore) : (toggle + shown);

        // 우클릭하면 **이 레벨의 필드**에 대한 정렬 메뉴가 뜬다. 열 헤더 클릭은 전 레벨 공통이라
        // 레벨별로 다르게 두려면 이쪽이 유일한 길이다.
        const menu = ` oncontextmenu="return pvOpenRowSortMenu(event,'${preset.key}',${depth})"`;
        let html = `<tr${trClass}><td class="indent-step-${Math.min(depth + 1, 5)}"${menu} style="${st.label}">${label}</td>`;
        visibleColumns.forEach(col => {
          const m = pvMergeMetrics(child, col.leafKeys);
          // 소계·총합계 칸 색은 클래스가 아니라 인라인이다 — pv-num-sum/pv-num-total은
          // pivot-table.css에서 `.row-grand-total` 아래에만 정의돼 있어 데이터 행에는 효과가 없다.
          const style = col.isSubtotal ? (st.subtotal || preset.subtotalStyle) : (st.month || 'text-align:right;');
          html += `<td style="${style}">${pvFormatCell(pvComputeMetric(m, primary), primary.agg)}</td>`;
        });
        html += `<td style="${st.total || preset.totalStyle}">${pvFormatCell(nodeTotal(child), primary.agg)}</td></tr>`;
        out.push(html);

        if (hasMore && isExpanded) pvRenderRows(child, preset, depth + 1, path, visibleColumns, valueDefs, expandedRows, out, rowFields, cfg);
      });
    }

    // ==========================================================================
    // 실행 중 축 구성 — 빌더 패널이 여기를 고치고, 렌더는 여기만 읽는다.
    // 프리셋은 '처음 모양'이자 초기화 기준으로만 남는다. 형태는 세부데이터의 detailDataConfig와
    // 동일하게 맞춰서(rows/columns는 필드 키 배열, values는 {id,field,agg}) 빌더 패널 코드를 공유한다.
    // ==========================================================================
    function pvConfigFor(viewKey) {
      // 세부데이터만 예외 — 프리셋(=처음 모양)이라는 것이 없는 화면이라 자기 config를 그대로 쓴다.
      if (viewKey === 'detailData') return detailDataConfig;
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
      // 화이트리스트가 있는 뷰(목표·대행사비교·업프론트)는 그 목록만 패널에 내보내고 드롭도 그것만 받는다.
      // 나머지 여섯은 null — 공용 필드 목록 전부.
      const list = PV_FIELD_WHITELIST[viewKey] || null;
      return {
        config: pvConfigFor(viewKey), render: () => p.render(), dom: p.builderDom, viewKey,
        maxValues: 1, hiddenFields: PV_HIDDEN_FIELDS,
        fieldList: list, allowedFields: list ? new Set(list) : null,
      };
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
        sorts: {},
        colSort: null,
      };
    }
    function pvIsConfigDefault(viewKey) {
      const p = PIVOT_PRESETS[viewKey], c = pvConfigFor(viewKey);
      const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
      return c.filters.length === 0 && !c.colSort && Object.keys(c.sorts || {}).length === 0 && same(c.rows, p.rows) && same(c.columns, p.columns)
        && c.values.length === p.values.length && c.values.every((v, i) => v.field === p.values[i].field && v.agg === p.values[i].agg);
    }
    // 빌더 사이드바 접기/펼치기. 일반 피벗은 조회가 목적이라 기본은 접힘이다.
    function pvToggleBuilder(viewKey) {
      const preset = PIVOT_PRESETS[viewKey]; if (!preset || !preset.layoutId) return;
      const el = document.getElementById(preset.layoutId); if (!el) return;
      const open = el.classList.toggle('dd-layout-collapsed') === false;
      const btn = preset.builderBtn && document.getElementById(preset.builderBtn);
      // 이름('표 편집')은 그대로 두고 **눌린 상태와 화살표 방향**으로만 알린다 — 버튼 폭이 흔들리지
      // 않고, 무엇을 여는 버튼인지가 계속 보인다. 화살표는 패널이 오른쪽에서 들고 나는 방향이다:
      // 닫힘 ◀(끌어온다) / 열림 ▶(밀어낸다). 회전(transform)이 아니라 글자를 바꾼다 —
      // 이 자리는 flex 아이템이라 display가 block으로 바뀌는 등 변수가 있어 글자 교체가 확실하다.
      if (btn) {
        btn.classList.toggle('is-on', open);
        const caret = btn.querySelector('.btn-caret');
        if (caret) caret.textContent = open ? '▶' : '◀';
      }
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

      const { root, colCombos } = pvBuildTree(rows, rowFields, colFields, valueDefs, fallbacks, cfg);

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
        cfg,
        header: preset.header,
      };
      const visibleColumns = pvBuildVisibleColumns(liveCombos, colFields, expandedCols, opt);
      const headerRows = pvRenderColumnHeaderRows(visibleColumns, colFields, opt);

      const cs = cfg.colSort;
      const grandMark = (cs && cs.pathKey === PV_GRAND) ? (cs.dir === 'asc' ? ' ▲' : ' ▼') : '';
      // 구분 열은 행 축을 대표하는 자리다. 좌클릭은 열 기준 정렬 해제, 우클릭은 **첫 단계**의 정렬.
      // 더 아래 단계는 그 행 라벨을 직접 우클릭하면 된다 — 여기에 전 단계를 다 넣으면
      // 담당자별 5단계에서 메뉴가 스무 줄을 넘는다.
      const h1 = `<th rowspan="${colFields.length}"${preset.header.label} data-pvsort="1" onclick="pvClearColumnSort('${viewKey}')" oncontextmenu="return pvOpenRowSortMenu(event,'${viewKey}',0)" title="클릭: 열 기준 정렬 해제 · 우클릭: 첫 단계 정렬">구분${cs ? ' ↺' : ''}</th>`
        + headerRows[0]
        + `<th rowspan="${colFields.length}"${preset.header.total} data-pvsort="1" onclick="pvSortByColumn('${viewKey}','${PV_GRAND}')" oncontextmenu="return pvOpenColMenu(event,'${viewKey}',-1,'${PV_GRAND}','총합계')">총합계${grandMark}</th>`;
      document.getElementById(preset.dom.head1).innerHTML = mapPivotHtml(h1);
      document.getElementById(preset.dom.head2).innerHTML = mapPivotHtml(headerRows[1] || '');

      const out = [];
      pvRenderRows(root, preset, 0, [], visibleColumns, valueDefs, expandedRows, out, rowFields, cfg);

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
