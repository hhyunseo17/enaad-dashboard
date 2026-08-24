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
      // 업종은 소스에 대·중·소 세 컬럼이 있고 셋 다 적재한다(scripts/etl/transform.mjs → raw_sales_rows
      // industry/industry_mid/industry_sub → 프록시 iu/i2/i3 → data-loader industry/industryMid/industrySub).
      { key: 'channel', label: '채널' },
      { key: 'industry', label: '업종대분류' }, { key: 'industryMid', label: '업종중분류' }, { key: 'industrySub', label: '업종소분류' },
      { key: 'broadDigital', label: '방송/디지털' },
      { key: 'revenueBasis', label: '회계계정' }, { key: 'isUpfront', label: '업프론트여부' },
      { key: 'amount', label: '금액' }
    ];
    // 상단 전역 필터바가 이미 연/월/부서/채널/방송·디지털/대분류를 커버하므로, 아래쪽 드래그앤드롭
    // 필터 well에는 이 필드들을 놓을 수 없다(행/열/값에는 계속 쓸 수 있음) — onDetailDataWellDrop/onDetailDataChipDrop에서 가드.
    // 대행사/광고주는 전역 검색이 부분일치라 별도로 더 좁히고 싶을 수 있어 필터 well에서도 허용.
    const DD_FILTER_BAR_COVERED_FIELDS = new Set(['year', 'month', 'dept', 'channel', 'broadDigital', 'categoryReclassified']);

    const DETAIL_DATA_AGG_LABELS = { sum: '합계', avg: '평균', count: '개수', distinct: '고유 개수' };

    // ── 빌더 패널 공유 ────────────────────────────────────────────────────────
    // 이 파일의 필드 목록·드래그앤드롭·필터 팝오버는 세부데이터 전용이었지만, 일반 피벗(pivot-builder.js)도
    // 같은 패널을 쓴다. 대상은 pvBuilderCtx()가 정한다 — null이면 세부데이터 자신.
    // 인라인 onclick이 인자를 받지 않으므로 '지금 보고 있는 화면' 기준이고, 패널은 한 번에 하나만 뜬다.
    const DD_DOM = { fieldList:'ddFieldList', filterBar:'ddFilterBar', filters:'ddWellFilterBody', columns:'ddWellColumnsBody', rows:'ddWellRowsBody', values:'ddWellValuesBody' };
    function ddCtx() { return (typeof pvBuilderCtx === 'function') ? pvBuilderCtx() : null; }
    function ddCfg() { const c = ddCtx(); return c ? c.config : detailDataConfig; }
    // 일반 피벗은 아직 값이 하나일 때만 그릴 수 있다(엔진에 다중 값 열 분할이 없다).
    // 패널이 허용하는 것과 실제로 그려지는 것이 어긋나면 안 되므로, 새 값을 놓으면 앞의 것을 밀어낸다.
    function ddCapValues() {
      const c = ddCtx(); if (!c || !c.maxValues) return;
      if (c.config.values.length > c.maxValues) c.config.values = c.config.values.slice(-c.maxValues);
    }
    function ddRerender() { const c = ddCtx(); if (c) c.render(); else renderDetailDataPivot(); }
    // 목표 피벗은 놓을 수 있는 필드가 다섯 개로 정해져 있다(목표가 그 축으로만 편성돼 있어서).
    // 목록에서 감추는 것만으로는 부족하다 — 다른 화면에서 끌어온 칩이 드롭될 수 있으므로 드롭에서도 막는다.
    function ddFieldAllowed(fieldKey) {
      const c = ddCtx();
      return !c || !c.allowedFields || c.allowedFields.has(fieldKey);
    }

    // 특정 화면에서만 쓰는 필드는 공용 목록에 넣지 않고 여기에만 이름을 둔다 — 세부데이터와 여섯 피벗의
    // 필드 목록이 그 화면에서만 의미 있는 항목으로 길어지지 않게 하기 위함이다.
    const DD_EXTRA_FIELD_LABELS = { upfrontAdvertiser: '업프론트광고주' };
    function detailDataFieldLabel(key) {
      const f = DETAIL_DATA_FIELDS.find(x => x.key === key);
      return f ? f.label : (DD_EXTRA_FIELD_LABELS[key] || key);
    }
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

    // 행/열 트리의 그룹 라벨과 필터 목록 표시용 — 연/월은 "2026년"/"1월", 업프론트여부는 true/false 대신
    // 사람이 읽는 말로. **표시만 바꾼다** — 접힘 상태 키와 필터 선택값은 원래 값 그대로여야 한다.
    // (js/features/pivot-builder.js의 pvFormatFieldValue가 같은 표를 들고 있다. 한쪽을 고치면 같이 고칠 것.)
    function ddFormatFieldValue(fieldKey, rawValue) {
      if (rawValue === '(미지정)') return rawValue;
      if (fieldKey === 'year') return `${rawValue}년`;
      if (fieldKey === 'month') return `${rawValue}월`;
      if (fieldKey === 'isUpfront') return String(rawValue) === 'true' ? '업프론트' : '업프론트 미계약';
      return rawValue;
    }

    // ==========================================================================
    // 집계 로직
    // ==========================================================================
    function getDetailDataBaseRows() {
      // 본부매출/매출기준/연·월/부서/채널/방송디지털/대분류/대행사·광고주 검색은 상단 전역 필터바(filteredData)가 이미 적용.
      return filteredData.filter(r => {
        return ddCfg().filters.every(f => {
          if (!f.selected || f.selected.length === 0) return true;
          return f.selected.includes(String(r[f.field]));
        });
      });
    }

    function setDetailDataValueAgg(id, agg) {
      const v = ddCfg().values.find(x => x.id === id);
      if (!v) return;
      v.agg = agg;
      ddRerender();
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
      // 열 값 정렬은 일반 피벗과 같은 규칙을 쓴다(pivot-builder.js) — 연은 최근부터, 월은 숫자 순.
      // 문자열 비교만 하면 월이 1, 10, 11, 12, 2… 순으로 깨진다. 사용자가 헤더 우클릭으로 고른
      // 방향(cfg.sorts)도 여기서 함께 반영된다.
      const cfg = ddCfg();
      const colCombos = [...colComboMap.values()].sort((a, b) => {
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
          const key = colFieldDefs[i] ? colFieldDefs[i].key : '';
          const c = pvCompareFieldValues(key, a[i] ?? '', b[i] ?? '', pvColumnDir(key, cfg));
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
    function walkDetailDataColumnNode(node, depth, path, colFieldDefs, visibleColumns) {
      const colFieldDefsLen = colFieldDefs.length;
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
      const key = colFieldDefs[depth] ? colFieldDefs[depth].key : '';
      const dir = pvColumnDir(key, ddCfg());
      const childVals = [...node.children.keys()].sort((a, b) => pvCompareFieldValues(key, a, b, dir));
      childVals.forEach(v => walkDetailDataColumnNode(node.children.get(v), depth + 1, path.concat(v), colFieldDefs, visibleColumns));
    }

    // 실제로 렌더링될 열(펼쳐진 leaf 또는 접힌 병합 그룹) 목록을 반환.
    function buildDetailDataVisibleColumns(colCombos, colFieldDefs) {
      if (colFieldDefs.length === 0) return [{ path: [], leafKeys: ['__TOTAL__'], canToggle: false, isExpanded: false, pathKey: '' }];
      const tree = buildDetailDataColumnValueTree(colCombos);
      const visibleColumns = [];
      const key = colFieldDefs[0].key;
      const dir = pvColumnDir(key, ddCfg());
      const topVals = [...tree.children.keys()].sort((a, b) => pvCompareFieldValues(key, a, b, dir));
      topVals.forEach(v => walkDetailDataColumnNode(tree.children.get(v), 1, [v], colFieldDefs, visibleColumns));
      return visibleColumns;
    }

    // visibleColumns 기준 depth별 그룹핑 헤더 행 <th> 배열 반환. 접힌 그룹은 자기 depth에서 남은 헤더 행 전부를 rowspan으로 덮고 토글 아이콘을 붙인다.
    function renderDetailDataColumnHeaderRows(visibleColumns, colFieldDefs, valuesPerCol) {
      const colFieldDefsLen = colFieldDefs.length;
      const cs = ddCfg().colSort;
      const mark = (pk) => (cs && cs.pathKey === pk) ? (cs.dir === 'asc' ? ' ▲' : ' ▼') : '';
      // 다른 피벗과 같은 조작 — 좌클릭은 '이 열 값으로 행 정렬', 우클릭은 그 열 기준 정렬 + 축 나열 순서.
      // class가 아니라 data 속성으로 표시하는 이유는 pivot-builder.js의 같은 자리 주석 참고.
      const sortAttrs = (pk, depth, label) => ` data-pvsort="1" onclick="pvSortByColumn('detailData','${ddEsc(pk)}')"`
        + ` oncontextmenu="return pvOpenColMenu(event,'detailData',${depth},'${ddEsc(pk)}','${ddEsc(label)}')"`;
      const rowsHtml = [];
      for (let depth = 0; depth < colFieldDefsLen; depth++) {
        const cells = []; let i = 0;
        while (i < visibleColumns.length) {
          const col = visibleColumns[i];
          if (col.path.length <= depth) { i++; continue; } // 앞선 depth에서 이미 rowspan으로 덮인 열 — 건너뜀
          if (col.path.length - 1 === depth) {
            const rowspan = colFieldDefsLen - depth;
            // 접기 아이콘이 헤더 정렬까지 같이 일으키지 않도록 여기서 이벤트를 끊는다.
            const toggle = col.canToggle ? `<span class="toggle-icon" onclick="event.stopPropagation(); toggleDetailDataColNode('${ddEsc(col.pathKey)}')">${col.isExpanded ? '-' : '+'}</span>` : '';
            const label = ddFormatFieldValue(colFieldDefs[depth].key, col.path[col.path.length - 1]);
            cells.push(`<th colspan="${valuesPerCol}" rowspan="${rowspan}" style="text-align:center; vertical-align:middle;"${sortAttrs(col.pathKey, depth, label)}>${toggle}${label}${mark(col.pathKey)}</th>`);
            i++;
          } else {
            const prefix = col.path.slice(0, depth + 1);
            let span = 0; let j = i;
            while (j < visibleColumns.length && visibleColumns[j].path.length > depth && ddArraysEqual(visibleColumns[j].path.slice(0, depth + 1), prefix)) { span++; j++; }
            const label = ddFormatFieldValue(colFieldDefs[depth].key, prefix[depth]);
            // 그룹 헤더는 한 칸에 값이 여러 개라 '이 열 기준'이 성립하지 않는다 — 축 순서만 받는다.
            cells.push(`<th colspan="${span * valuesPerCol}" style="text-align:center;" oncontextmenu="return pvOpenColMenu(event,'detailData',${depth},'','${ddEsc(label)}')">${label}</th>`);
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

    // 세부데이터는 프리셋(=필드별 기본 정렬표)이 없다. 빈 프리셋을 주면 pvRowSorterFor가
    // 연·월은 시간 순, 나머지는 값 큰 순이라는 기본값으로 떨어진다 — 지금까지의 동작과 같다.
    const DD_NO_PRESET_SORTERS = { fieldSorters: {} };

    function renderDetailDataNodeRows(node, rowFieldDefs, depth, ancestorPath, visibleColumns, valueDefs, out) {
      const hasMore = depth + 1 < rowFieldDefs.length;
      const cfg = ddCfg();
      const primary = valueDefs[0];
      const sortMetric = (childNode) => computeDetailDataMetric(childNode.metrics.__ROWTOTAL__, primary);

      // 열 헤더를 눌러 건 정렬이 있으면 그 열 값으로, 없으면 필드별 규칙으로(pivot-builder.js).
      // 열 기준은 모든 레벨에 같이 걸린다 — 레벨마다 다르게 두려면 행 라벨 우클릭을 쓴다.
      const cs = cfg.colSort;
      const sortCol = cs ? (cs.pathKey === PV_GRAND ? PV_GRAND : visibleColumns.find(c => c.pathKey === cs.pathKey)) : null;
      let keys;
      if (sortCol) {
        const val = (n) => sortCol === PV_GRAND ? sortMetric(n)
          : computeDetailDataMetric(mergeDetailDataMetrics(n, sortCol.leafKeys), primary);
        const sign = cs.dir === 'asc' ? 1 : -1;
        keys = Object.keys(node.children).sort((a, b) => sign * (val(node.children[a]) - val(node.children[b])));
      } else {
        const sorter = pvRowSorterFor(DD_NO_PRESET_SORTERS, rowFieldDefs[depth].key, cfg);
        keys = Object.keys(node.children).sort((a, b) => sorter(a, b, sortMetric(node.children[a]), sortMetric(node.children[b])));
      }

      keys.forEach(k => {
        const child = node.children[k];
        const path = ancestorPath.concat(k);
        const pathKey = path.join('||');
        const isExpanded = !!expandedDetailDataPivot[pathKey];
        const indentClass = `indent-step-${Math.min(depth + 1, 5)}`;
        const toggle = hasMore ? `<span class="toggle-icon" onclick="toggleDetailDataNode('${ddEsc(pathKey)}')">${isExpanded ? '-' : '+'}</span>` : '';
        const menu = ` oncontextmenu="return pvOpenRowSortMenu(event,'detailData',${depth})"`;
        let html = `<tr><td class="${indentClass}"${menu}>${toggle}${ddFormatFieldValue(rowFieldDefs[depth].key, k)}</td>`;
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
    // **인자로 받은 cfg를 쓴다.** 예전에는 전부 ddCfg()를 읽어서 인자가 무시됐는데, 지금은
    // 보고 있지 않은 화면의 패널을 그릴 수도 있어(renderPresetPivot) 남의 배치가 칠해지게 된다.
    function getDetailDataPlacedFields(cfg) {
      cfg = cfg || ddCfg();
      const s = new Set();
      (cfg.filters || []).forEach(f => s.add(f.field));
      (cfg.rows || []).forEach(f => s.add(f));
      (cfg.columns || []).forEach(f => s.add(f));
      (cfg.values || []).forEach(v => s.add(v.field));
      return s;
    }

    // 필터/행/열에서만 제거(값은 건드리지 않음) — 이 세 영역 간 이동 시 사용.
    function removeDetailDataFieldFromStructuralAreas(fieldKey) {
      ddCfg().filters = ddCfg().filters.filter(f => f.field !== fieldKey);
      ddCfg().rows = ddCfg().rows.filter(f => f !== fieldKey);
      ddCfg().columns = ddCfg().columns.filter(f => f !== fieldKey);
      if (detailDataOpenFilterField === fieldKey) detailDataOpenFilterField = null;
    }

    // 필터/행/열/값 전부에서 제거 — 필드 목록으로 다시 드래그(완전히 빼기)했을 때만 사용.
    function removeDetailDataFieldEverywhere(fieldKey) {
      removeDetailDataFieldFromStructuralAreas(fieldKey);
      ddCfg().values = ddCfg().values.filter(v => v.field !== fieldKey);
    }

    function removeDetailDataField(wellName, key) {
      if (wellName === 'filters') ddCfg().filters = ddCfg().filters.filter(f => f.field !== key);
      else if (wellName === 'values') ddCfg().values = ddCfg().values.filter(v => v.id !== key);
      else ddCfg()[wellName] = ddCfg()[wellName].filter(f => f !== key);
      if (detailDataOpenFilterField === key) detailDataOpenFilterField = null;
      ddRerender();
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
    function onDetailDataWellDragOver(ev) {
      ev.preventDefault();
      pvClearDropLines(); // 빈 공간 위 = 맨 뒤에 붙는다
      if (ev.currentTarget.classList) ev.currentTarget.classList.add('drag-over');
    }
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
      if (wellName === 'list') { removeDetailDataFieldEverywhere(fieldKey); ddRerender(); return; }
      if (!ddFieldAllowed(fieldKey)) return; // 이 패널이 받지 않는 필드(목표 피벗)
      if (fieldKey === 'amount' && wellName !== 'values') return; // amount는 값 well 전용
      if (wellName === 'filters' && DD_FILTER_BAR_COVERED_FIELDS.has(fieldKey)) return; // 상단 전역 필터바에서만 조정
      if (wellName === 'values') {
        if (payload.valueId != null) {
          // 값 영역 내 기존 항목을 빈 공간에 드롭 — 새로 추가하지 않고 맨 뒤로 이동만
          const arr = ddCfg().values;
          const idx = arr.findIndex(v => v.id === payload.valueId);
          if (idx >= 0) { const [item] = arr.splice(idx, 1); arr.push(item); }
        } else {
          ddCfg().values.push(makeDetailDataValueEntry(fieldKey)); ddCapValues();
        }
      } else {
        removeDetailDataFieldFromStructuralAreas(fieldKey);
        if (wellName === 'filters') ddCfg().filters.push({ field: fieldKey, selected: [] });
        else ddCfg()[wellName].push(fieldKey);
      }
      ddRerender();
    }

    function onDetailDataChipDrop(ev, wellName, targetKey) {
      ev.preventDefault(); ev.stopPropagation();
      if (ev.currentTarget && ev.currentTarget.classList) ev.currentTarget.classList.remove('drag-over', 'dd-drop-before');
      const payload = getDetailDataDragPayload(ev);
      detailDataDragPayload = null;
      if (!payload || !payload.field) return;
      const fieldKey = payload.field;
      if (!ddFieldAllowed(fieldKey)) return; // 이 패널이 받지 않는 필드(목표 피벗)
      if (fieldKey === 'amount' && wellName !== 'values') return;
      if (wellName === 'filters' && DD_FILTER_BAR_COVERED_FIELDS.has(fieldKey)) return; // 상단 전역 필터바에서만 조정
      if (wellName === 'values') {
        const arr = ddCfg().values;
        if (payload.valueId != null) {
          if (payload.valueId === targetKey) return; // 자기 자신 위에 드롭
          const fromIdx = arr.findIndex(v => v.id === payload.valueId);
          if (fromIdx < 0) return;
          const [item] = arr.splice(fromIdx, 1);
          const targetIdx = arr.findIndex(v => v.id === targetKey);
          arr.splice(targetIdx < 0 ? arr.length : targetIdx, 0, item);
        } else {
          const targetIdx = arr.findIndex(v => v.id === targetKey);
          arr.splice(targetIdx < 0 ? arr.length : targetIdx, 0, makeDetailDataValueEntry(fieldKey)); ddCapValues();
        }
      } else {
        if (fieldKey === targetKey) return;
        removeDetailDataFieldFromStructuralAreas(fieldKey);
        if (wellName === 'filters') {
          const arr = ddCfg().filters; const idx = arr.findIndex(f => f.field === targetKey);
          arr.splice(idx < 0 ? arr.length : idx, 0, { field: fieldKey, selected: [] });
        } else {
          const arr = ddCfg()[wellName]; const idx = arr.indexOf(targetKey);
          arr.splice(idx < 0 ? arr.length : idx, 0, fieldKey);
        }
      }
      ddRerender();
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
      ddRerender();
    }
    function toggleDetailDataFilterValue(fieldKey, value) {
      const filt = ddCfg().filters.find(f => f.field === fieldKey);
      if (!filt) return;
      const idx = filt.selected.indexOf(value);
      if (idx >= 0) filt.selected.splice(idx, 1); else filt.selected.push(value);
      ddRerender();
    }

    // ==========================================================================
    // 빌더 패널(필드목록 + 필터/열/행/값 well) 렌더링
    // ==========================================================================
    // hidden: 이 패널에서 아예 내보내지 않을 필드. 일반 피벗은 매출기준(revenueBasis)을 감춘다 —
    // 상단 필터바의 취급고/회계 토글이 이미 그 축을 정하고 있어서, 축에 놓아 봐야
    // 취급고에서는 '실적' 한 줄만 나오고 회계에서는 두 줄이 나오는 게 전부다.
    // list: 이 패널이 내보낼 필드 키 배열(화이트리스트가 있는 뷰 — 목표·대행사비교·업프론트).
    //       주어진 순서 그대로 나온다. null이면 공용 목록 전체에서 hidden만 뺀다.
    function renderDetailDataFieldListHtml(cfg, hidden, list) {
      const placed = getDetailDataPlacedFields(cfg);
      const allowed = !!list;
      const fields = list ? list.map(k => ({ key: k, label: detailDataFieldLabel(k) }))
                          : DETAIL_DATA_FIELDS.filter(f => !(hidden && hidden.has(f.key)));
      return fields.map(f => {
        const activeClass = placed.has(f.key) ? ' dd-field-chip-active' : '';
        // 화이트리스트가 있는 패널(목표 피벗)에는 필터 well 자체가 없으므로 이 안내를 붙이지 않는다 —
        // 게다가 그 표는 좌측 상세필터를 반영하지 않아(달성률 왜곡 방지) 문구가 사실과 어긋난다.
        const title = (!allowed && DD_FILTER_BAR_COVERED_FIELDS.has(f.key)) ? ' title="필터는 상단 전역 필터바에서 조정 (행/열/값에는 배치 가능)"' : '';
        return `<div class="dd-field-chip${activeClass}" draggable="true" data-field="${f.key}"${title} ondragstart="onDetailDataDragStart(event,'${f.key}')" ondragend="onDetailDataDragEnd(event)">${f.label}</div>`;
      }).join('');
    }

    // 행/열 well은 **순서가 곧 위계**다(위가 상위). 칩을 세로로 쌓아 두었으므로 위아래 순서가
    // 그대로 위계라, 따로 번호를 붙이지 않는다. 드래그 중에는 어느 칩 앞에 끼워지는지
    // 그 칩 위쪽 틈에 가로선으로 미리 보여준다(onDetailDataChipDrop이 대상 "앞"에 삽입).
    function renderDetailDataWellFieldChips(wellName, fieldKeys) {
      return fieldKeys.map(key => {
        const label = detailDataFieldLabel(key);
        return `<div class="dd-field-chip dd-field-chip-placed" draggable="true" data-field="${key}"
          ondragstart="onDetailDataDragStart(event,'${key}')" ondragend="onDetailDataDragEnd(event)"
          ondragover="onDetailDataChipDragOver(event)" ondragleave="onDetailDataChipDragLeave(event)"
          ondrop="onDetailDataChipDrop(event,'${wellName}','${key}')">
          <span>${label}</span><span class="dd-chip-remove" onclick="event.stopPropagation(); removeDetailDataField('${wellName}','${key}')">✕</span>
        </div>`;
      }).join('');
    }

    // 정렬은 표 안에서 정한다 — 행은 라벨 우클릭, 열은 헤더 우클릭(pivot-builder.js).
    // 패널에도 셀렉트를 두었었지만 같은 일을 두 번 하는 자리가 되어 걷어냈다.
    function pvClearDropLines() {
      document.querySelectorAll('.dd-drop-before').forEach(el => el.classList.remove('dd-drop-before'));
    }
    // dragleave로 지우면 칩 안의 라벨/✕로 커서가 넘어갈 때마다 선이 깜빡인다.
    // 대신 dragover마다 전부 지우고 지금 칩에만 다시 긋는다 — 항상 한 곳에만 선이 선다.
    function onDetailDataChipDragOver(ev) {
      ev.preventDefault(); ev.stopPropagation();
      pvClearDropLines();
      if (ev.currentTarget && ev.currentTarget.classList) ev.currentTarget.classList.add('dd-drop-before');
    }
    function onDetailDataChipDragLeave(ev) { /* dragover에서 일괄 정리한다 — 여기서 지우면 깜빡인다 */ }
    // 드래그가 끝나면 화면 어디에 남아 있을지 모르는 표시들을 한 번에 걷는다.
    function onDetailDataDragEnd(ev) {
      if (ev.currentTarget && ev.currentTarget.classList) ev.currentTarget.classList.remove('dd-dragging');
      document.querySelectorAll('.dd-drop-before').forEach(el => el.classList.remove('dd-drop-before'));
      document.querySelectorAll('.dd-well.drag-over').forEach(el => el.classList.remove('drag-over'));
    }

    function renderDetailDataFilterChips(cfg) {
      cfg = cfg || ddCfg();
      return ddCfg().filters.map(f => {
        const label = detailDataFieldLabel(f.field);
        const isOpen = detailDataOpenFilterField === f.field;
        const countText = f.selected.length === 0 ? '전체' : `${f.selected.length}개 선택`;
        let popover = '';
        if (isOpen) {
          const values = getDetailDataFieldUniqueValues(f.field);
          popover = `<div class="dd-filter-popover" onclick="event.stopPropagation();">${values.map(v =>
            `<label class="dd-filter-popover-item"><input type="checkbox" ${f.selected.includes(String(v)) ? 'checked' : ''} onchange="toggleDetailDataFilterValue('${ddEsc(f.field)}','${ddEsc(String(v))}')"> ${ddFormatFieldValue(f.field, String(v))}</label>`
          ).join('')}</div>`;
        }
        return `<div class="dd-field-chip dd-field-chip-filter" draggable="true" data-field="${f.field}"
          ondragstart="onDetailDataDragStart(event,'${f.field}')" ondragend="onDetailDataDragEnd(event)"
          ondragover="onDetailDataChipDragOver(event)" ondragleave="onDetailDataChipDragLeave(event)"
          ondrop="onDetailDataChipDrop(event,'filters','${f.field}')">
          <span onclick="event.stopPropagation(); toggleDetailDataFilterPopover('${f.field}')">${label} (${countText})</span>
          <span class="dd-chip-remove" onclick="event.stopPropagation(); removeDetailDataField('filters','${f.field}')">✕</span>
          ${popover}
        </div>`;
      }).join('');
    }

    // 집계 방식은 **우클릭 메뉴**로 고른다. 예전에는 칩 안에 <select>를 넣었는데, well이 사이드바를
    // 반으로 나눠 쓰는 폭(약 160px)이라 셀렉트가 자리를 먹고 필드 이름이 "금.."으로 잘렸다.
    // 표 안의 정렬도 같은 방식(우클릭)이라 조작이 하나로 모인다.
    function renderDetailDataValuesChips(cfg) {
      cfg = cfg || ddCfg();
      return ddCfg().values.map(v => {
        return `<div class="dd-field-chip dd-field-chip-placed dd-field-chip-value" draggable="true" data-field="${v.field}" data-value-id="${v.id}"
          ondragstart="onDetailDataDragStart(event,'${v.field}', ${v.id})" ondragend="onDetailDataDragEnd(event)"
          ondragover="onDetailDataChipDragOver(event)" ondragleave="onDetailDataChipDragLeave(event)"
          ondrop="onDetailDataChipDrop(event,'values', ${v.id})"
          oncontextmenu="return ddOpenValueAggMenu(event, ${v.id})" title="우클릭: 집계 방식 변경">
          <span>${getDetailDataValueLabel(v)}</span><span class="dd-chip-remove" onclick="event.stopPropagation(); removeDetailDataField('values', ${v.id})">✕</span>
        </div>`;
      }).join('');
    }
    function ddOpenValueAggMenu(ev, id) {
      const v = ddCfg().values.find(x => x.id === id);
      if (!v) return true;
      return pvShowMenu(ev, `${detailDataFieldLabel(v.field)} 집계`,
        getDetailDataAggOptions(v.field).map(a => [DETAIL_DATA_AGG_LABELS[a], a === v.agg, `ddPickValueAgg(${id},'${a}')`]));
    }
    function ddPickValueAgg(id, agg) { pvCloseRowSortMenu(); setDetailDataValueAgg(id, agg); }

    // ctx를 넘기면 그 피벗의 패널에 그린다(일반 피벗). 안 넘기면 세부데이터 자신.
    // **cfg는 ddCfg()가 아니라 ctx에서 꺼낸다** — renderPresetPivot은 보고 있지 않은 화면을 그릴 수도
    // 있어서 currentView 기준으로 잡으면 남의 패널에 그려 넣게 된다.
    function renderDetailDataBuilderPanels(ctx) {
      const dom = ctx ? ctx.dom : DD_DOM;
      const cfg = ctx ? ctx.config : detailDataConfig;
      // **없는 칸은 건너뛴다.** 목표 피벗 패널은 열·행 두 well만 둔다 — 값은 목표·실적·달성률로 고정이고,
      // 필터는 걸면 실적만 줄고 목표는 그대로라 달성률이 거짓으로 낮아진다(좌측 필터바를 미반영하는 것과 같은 이유).
      const el = (id) => id ? document.getElementById(id) : null;
      const fieldListEl = el(dom.fieldList);
      if (!fieldListEl) return;
      const filterBarEl = el(dom.filterBar);
      const filterWellEl = el(dom.filters);
      const colEl = el(dom.columns);
      const rowEl = el(dom.rows);
      const valEl = el(dom.values);
      const placeholder = `<div class="dd-well-placeholder">필드를 끌어 놓으세요</div>`;
      fieldListEl.innerHTML = renderDetailDataFieldListHtml(cfg, ctx && ctx.hiddenFields, (ctx && ctx.fieldList) || null);
      // 필터 바(표 위, 실제 값 선택용)와 사이드바 필터 well(배치/순서 조정용)은 같은 cfg.filters를 두 곳에 나눠 보여준다 — 엑셀 피벗의 필드 목록 필터 영역 vs 상단 필터 드롭다운과 동일한 구조.
      if (filterBarEl) filterBarEl.innerHTML = renderDetailDataFilterChips(cfg);
      if (filterWellEl) filterWellEl.innerHTML = renderDetailDataWellFieldChips('filters', (cfg.filters || []).map(f => f.field)) || placeholder;
      if (colEl) colEl.innerHTML = renderDetailDataWellFieldChips('columns', cfg.columns) || placeholder;
      if (rowEl) rowEl.innerHTML = renderDetailDataWellFieldChips('rows', cfg.rows) || placeholder;
      if (valEl) valEl.innerHTML = renderDetailDataValuesChips(cfg) || placeholder;
    }

    // ==========================================================================
    // 메인 렌더 — 필드 배치가 바뀔 때마다 매번 rawData부터 재계산(캐시 없음)
    // ==========================================================================
    function renderDetailDataPivot() {
      renderDetailDataBuilderPanels(null);

      const valueDefs = ddCfg().values;
      if (valueDefs.length === 0) {
        document.getElementById('detailDataTableHead').innerHTML = `<tr><th style="text-align:left;">구분</th></tr>`;
        document.getElementById('detailDataTableBody').innerHTML = `<tr><td style="text-align:center; color:var(--text-tertiary); padding:16px;">값 영역에 필드를 놓으세요</td></tr>`;
        document.getElementById('detailDataTotalAmount').innerText = '0.0 백만';
        return;
      }

      const rowFieldDefs = ddCfg().rows.map(k => DETAIL_DATA_FIELDS.find(f => f.key === k)).filter(Boolean);
      const colFieldDefs = ddCfg().columns.map(k => DETAIL_DATA_FIELDS.find(f => f.key === k)).filter(Boolean);

      const baseRows = getDetailDataBaseRows();
      const { root, colCombos } = buildDetailDataTree(baseRows, rowFieldDefs, colFieldDefs, valueDefs);
      const visibleColumns = buildDetailDataVisibleColumns(colCombos, colFieldDefs);

      const multiValue = valueDefs.length > 1;
      const valuesPerCol = multiValue ? valueDefs.length : 1;
      // 다른 피벗과 같이 '구분'으로 고정한다. 어떤 필드가 행에 놓였는지는 우측 행 well이 이미 보여주므로
      // 여기에 필드명을 이어 붙이면 열 폭만 잡아먹는다(행이 3단계면 "부서 / 담당자 / 대분류"가 된다).
      const rowLabel = '구분';

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
      const ddCs = ddCfg().colSort;
      const grandMark = (ddCs && ddCs.pathKey === PV_GRAND) ? (ddCs.dir === 'asc' ? ' ▲' : ' ▼') : '';
      if (groupRows.length > 0) {
        rows[0].push(`<th colspan="${valuesPerCol}" rowspan="${groupRows.length}" style="background:#1E40AF !important; color:#FFFFFF !important; font-weight:500;" data-pvsort="1" onclick="pvSortByColumn('detailData','${PV_GRAND}')" oncontextmenu="return pvOpenColMenu(event,'detailData',-1,'${PV_GRAND}','총합계')">총합계${grandMark}</th>`);
      }
      const headDepth = Math.max(rows.length, 1);

      let headHtml = '';
      for (let d = 0; d < headDepth; d++) {
        headHtml += '<tr>';
        // 구분 열은 행 축을 대표하는 자리다 — 좌클릭은 열 기준 정렬 해제, 우클릭은 첫 단계의 정렬.
        if (d === 0) headHtml += `<th rowspan="${headDepth}" style="text-align:left; vertical-align:middle;" data-pvsort="1" onclick="pvClearColumnSort('detailData')" oncontextmenu="return pvOpenRowSortMenu(event,'detailData',0)" title="클릭: 열 기준 정렬 해제 · 우클릭: 첫 단계 정렬">${rowLabel}${ddCs ? ' ↺' : ''}</th>`;
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
