// ============================================================
// js/features/agency-comp.js
// 대행사 전년·전월 비교: 계산+차트+피벗
// ============================================================
    function setAgencyCompMode(mode) {
      agencyCompMetricMode = mode;
      document.getElementById('btnAgencyCompRevenue').classList.toggle('active', mode === 'revenue');
      document.getElementById('btnAgencyCompCount').classList.toggle('active', mode === 'count');
      renderAgencyCompChart();
    }

    function computeAgencyCompData() {
      if (selectedYears.length !== 1 || selectedMonths.length !== 1) return null;
      const cy = selectedYears[0]; const cm = selectedMonths[0];
      let pmY = cy, pmM = cm - 1; if (pmM === 0) { pmM = 12; pmY = cy - 1; }
      const py = cy - 1;

      const commonMatch = makeCommonMatch(r => r.categoryOriginal === '일반광고' || r.categoryOriginal === 'IMC');

      const currRows = rawData.filter(r => r.year === cy && r.month === cm && commonMatch(r));
      const prevMonthRows = rawData.filter(r => r.year === pmY && r.month === pmM && commonMatch(r));
      const prevYearRows = rawData.filter(r => r.year === py && r.month === cm && commonMatch(r));
      return { cy, cm, pmY, pmM, py, currRows, prevMonthRows, prevYearRows };
    }

    function renderAgencyCompChart() {
      const container = document.getElementById('agencyCompChartContainer');
      const emptyMsg = document.getElementById('agencyCompEmptyMessage');
      const compData = computeAgencyCompData();
      const cardBox = document.getElementById('agencyCompCardBox');

      if (!compData) {
        container.style.display = 'none'; emptyMsg.style.display = 'block';
        if (chartInstances.agencyComp) { chartInstances.agencyComp.destroy(); chartInstances.agencyComp = null; }
        if (cardBox) cardBox.classList.remove('clickable');
        return;
      }
      container.style.display = ''; emptyMsg.style.display = 'none';
      if (cardBox) cardBox.classList.add('clickable');

      const { cy, cm, pmY, pmM, py, currRows, prevMonthRows, prevYearRows } = compData;

      function aggregate(rows) {
        const map = {};
        rows.forEach(r => { const g = r.agencyGroup || '(미지정)'; if (!map[g]) map[g] = { revenue: 0, advertisers: new Set() }; map[g].revenue += r.amount; map[g].advertisers.add(r.advertiser); });
        return map;
      }
      const currMap = aggregate(currRows); const prevMonthMap = aggregate(prevMonthRows); const prevYearMap = aggregate(prevYearRows);
      const topGroups = Object.entries(currMap).sort((a,b) => b[1].revenue - a[1].revenue).slice(0, 8).map(g => g[0]);
      const getVal = (map, grp) => { const d = map[grp]; if (!d) return 0; return agencyCompMetricMode === 'revenue' ? d.revenue / 1e8 : d.advertisers.size; };

      const unitLabel = agencyCompMetricMode === 'revenue' ? '억원' : '개사';
      const ctx = document.getElementById('chartAgencyComp').getContext('2d');
      if (chartInstances.agencyComp) chartInstances.agencyComp.destroy();
      chartInstances.agencyComp = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: topGroups,
          datasets: [
            { label: `전년동월(${py}.${cm})`, data: topGroups.map(g => getVal(prevYearMap, g)), backgroundColor: ddBarFill(RC('ref')), borderRadius: 5, ...ddGroupSeparator(), barPercentage: 1, categoryPercentage: 0.8,
              datalabels: { display: 'auto', anchor: 'end', align: 'top', color: dataLabelTextColor(), font: { size: 10, weight: '400' }, formatter: (v) => v > 0 ? v.toFixed(1) : '' }
            },
            { label: `전월(${pmY}.${pmM})`, data: topGroups.map(g => getVal(prevMonthMap, g)), backgroundColor: ddBarFill(RC('prev')), borderRadius: 5, ...ddGroupSeparator(), barPercentage: 1, categoryPercentage: 0.8,
              datalabels: { display: 'auto', anchor: 'end', align: 'top', color: dataLabelTextColor(), font: { size: 10, weight: '400' }, formatter: (v) => v > 0 ? v.toFixed(1) : '' }
            },
            { label: `당월(${cy}.${cm})`, data: topGroups.map(g => getVal(currMap, g)), backgroundColor: ddBarFill(RC('curr')), borderRadius: 5, ...ddGroupSeparator(), barPercentage: 1, categoryPercentage: 0.8,
              datalabels: { display: 'auto', anchor: 'end', align: 'top', color: dataLabelTextColor(), font: { size: 10, weight: '400' }, formatter: (v) => v > 0 ? v.toFixed(1) : '' }
            }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24 } },
          plugins: {
            legend: { display: true, position: 'top', labels: { color: CH('#B0B8C1'), font: { size: 12, weight: '400' } } },
            tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unitLabel}` } }
          },
          scales: { y: ddValueAxis({ ticks: { color: CH('#8B95A1'), maxTicksLimit: 5, padding: 6, callback: v => v + (agencyCompMetricMode === 'revenue' ? '억' : '') } }), x: { ticks: { color: CH('#F2F4F6'), font: { size: 11, weight: '400' } }, grid: { display: false } } }
        }
      });
    }

    function openAgencyCompPivotView() {
      const compData = computeAgencyCompData();
      if (!compData) return; // 연도·월 각 1개 선택 상태(=차트가 보이는 상태)가 아니면 진입 불가
      switchView('agencyCompPivot');
    }

    // 행 토글은 일반 피벗과 공용(togglePvRowNode)이다. 이 두 이름은 예전 표기가 남아 있을 경우를 위한 래퍼.
    function toggleCompAgencyGroupNode(grp) { togglePvRowNode('agencyCompPivot', grp); }
    function toggleCompAgencyNode(grp, agy) { togglePvRowNode('agencyCompPivot', grp + '||' + agy); }
    function expandAllAgencyCompNodes(state) {
      const compData = computeAgencyCompData(); if (!compData) return;
      // 행 축이 바뀌면 펼칠 경로도 달라지므로 트리를 실제로 만들어 그 경로를 쓴다.
      const map = PIVOT_PRESETS.agencyCompPivot.expandedRows();
      const rowFields = pvConfigFor('agencyCompPivot').rows;
      (function walk(node, path, depth) {
        if (depth >= rowFields.length - 1) return; // 잎은 펼칠 것이 없다
        Object.keys(node.children).forEach(k => {
          const p = path.concat(k);
          map[p.join('||')] = state;
          walk(node.children[k], p, depth + 1);
        });
      })(acBuildTree(compData, rowFields), [], 0);
      renderAgencyCompPivotTable();
    }

    function fmtAgencyCompRatio(base, curr) {
      const diffM = Math.round((curr - base) / 1e6);
      const diffStr = (diffM > 0 ? '+' : '') + diffM.toLocaleString();
      if (base === 0 && curr === 0) return { rateText: '-', diffText: '-', color: CH('#8B95A1') };
      if (base === 0) return { rateText: '신규', diffText: diffStr, color: '#4ADE80' };
      if (curr === 0) return { rateText: '-100.0%', diffText: diffStr, color: RC('negative') };
      const rate = (curr - base) / base * 100;
      return { rateText: `${rate >= 0 ? '+' : ''}${rate.toFixed(1)}%`, diffText: diffStr, color: rate >= 0 ? '#4ADE80' : RC('negative') };
    }

    // 행 축을 배열로 받는 트리. 노드마다 세 기간(전년동월 py / 전월 pm / 당월 cy)을 함께 누적한다.
    // 세 기간이 **한 노드에서 만나는 것**이 이 표의 전부이므로, 연·월은 축이 될 수 없다(빌더에서도 막았다).
    function acBuildTree(compData, rowFields) {
      const makeNode = () => ({ py: 0, pm: 0, cy: 0, children: {} });
      const root = makeNode();
      const add = (rows, key) => rows.forEach(r => {
        let n = root; n[key] += r.amount;
        rowFields.forEach(f => {
          const raw = r[f];
          const v = (raw === undefined || raw === null || raw === '') ? '(미지정)' : String(raw);
          if (!n.children[v]) n.children[v] = makeNode();
          n = n.children[v]; n[key] += r.amount;
        });
      });
      add(compData.prevYearRows, 'py'); add(compData.prevMonthRows, 'pm'); add(compData.currRows, 'cy');
      return root;
    }

    // 깊이별 셀 색. 원본 렌더러가 인라인으로 넣던 값을 그대로 옮겼다 — mapPivotHtml()의 치환 키이므로
    // **문자열 표기를 바꾸지 말 것**. 4단계 아래는 담당자별 피벗과 같은 램프를 이어 붙였다.
    const AC_STYLES = [
      { rowClass: 'row-channel', label: '', wrap: (s) => `<strong>${s}</strong>`,
        num: 'text-align: right; font-weight: 400;', cur: 'text-align: right; font-weight: 500; color: #60A5FA;', w: 'font-weight: 400; ' },
      { rowClass: 'row-category', label: 'background: #151C2C; color: #CBD5E1;',
        num: 'text-align: right;', cur: 'text-align: right; color: #93C5FD;', w: '' },
      { rowClass: 'row-subcategory', label: 'background: #11151F; color: #94A3B8;',
        num: 'text-align: right;', cur: 'text-align: right;', w: '' },
      { rowClass: '', label: 'background:#0D1117; color:#64748B;',
        num: 'text-align: right;', cur: 'text-align: right;', w: '' },
      { rowClass: '', label: 'background:#090C10; color:#475569; font-size:12px;',
        num: 'text-align: right;', cur: 'text-align: right;', w: '' },
    ];

    const AC_SORT_METRICS = [['cy', '당월'], ['py', '전년'], ['pm', '전월']];
    function acOpenRowSortMenu(ev, depth) {
      return pvOpenMetricRowSortMenu(ev, 'agencyCompPivot', depth, AC_SORT_METRICS, 'pvPickMetricRowSort');
    }

    function renderAgencyCompPivotTable() {
      const compData = computeAgencyCompData();
      const tbody = document.getElementById('agencyCompPivotTableBody');
      const cfg = pvConfigFor('agencyCompPivot');
      renderPvBuilderPanel('agencyCompPivot');
      const resetBtn = document.getElementById('agencyCompPivotResetBtn');
      if (resetBtn) resetBtn.style.display = pvIsConfigDefault('agencyCompPivot') ? 'none' : '';
      if (!compData) { tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 40px; color: var(--text-secondary);">연도와 월을 각각 1개씩 선택하면 표시됩니다.</td></tr>`; document.getElementById('agencyCompPivotTotalAmount').innerText = `0 백만`; return; }

      const { cy, cm, pmY, pmM, py } = compData;
      document.getElementById('agencyCompPivotTitle').innerText = `주요 대행사 전년·전월 비교 상세 (전년 ${py}.${cm} / 전월 ${pmY}.${pmM} / 당월 ${cy}.${cm})`;
      document.getElementById('agencyCompPivotHeaderRow').innerHTML = `
        <th style="text-align: left;" oncontextmenu="return acOpenRowSortMenu(event,0)" title="우클릭: 첫 단계 정렬">구분</th>
        <th style="text-align: right;">전년(${py}.${cm}) 금액</th>
        <th style="text-align: right;">전월(${pmY}.${pmM}) 금액</th>
        <th style="text-align: right;">당월(${cy}.${cm}) 금액</th>
        <th style="text-align: right;">전년비(%)</th>
        <th style="text-align: right;">전년비(금액)</th>
        <th style="text-align: right;">전월비(%)</th>
        <th style="text-align: right;">전월비(금액)</th>`;

      const rowFields = cfg.rows;
      if (rowFields.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 40px; color: var(--text-secondary);">행 영역에 필드를 놓으세요</td></tr>`;
        document.getElementById('agencyCompPivotTotalAmount').innerText = `0 백만`;
        return;
      }
      const root = acBuildTree(compData, rowFields);

      const fmtM = (won) => { const m = Math.round(won / 1e6); if (!m) return '-'; return m.toLocaleString(); };
      document.getElementById('agencyCompPivotTotalAmount').innerText = `${Math.round(root.cy / 1e6).toLocaleString()} 백만`;

      // 한 행의 값 칸 일곱 개(전년·전월·당월 금액 + 전년비 %·금액 + 전월비 %·금액).
      const cellsHtml = (n, st) => {
        const yoy = fmtAgencyCompRatio(n.py, n.cy); const mom = fmtAgencyCompRatio(n.pm, n.cy);
        return `<td style="${st.num}">${fmtM(n.py)}</td><td style="${st.num}">${fmtM(n.pm)}</td><td style="${st.cur}">${fmtM(n.cy)}</td>`
          + `<td style="text-align: right; ${st.w}color: ${yoy.color};">${yoy.rateText}</td><td style="text-align: right; ${st.w}color: ${yoy.color};">${yoy.diffText}</td>`
          + `<td style="text-align: right; ${st.w}color: ${mom.color};">${mom.rateText}</td><td style="text-align: right; ${st.w}color: ${mom.color};">${mom.diffText}</td>`;
      };

      const expandedRows = PIVOT_PRESETS.agencyCompPivot.expandedRows();
      const out = [];
      (function renderLevel(node, depth, ancestorPath) {
        const hasMore = depth + 1 < rowFields.length;
        const field = rowFields[depth];
        const sorter = pvMetricRowSorter(field, cfg, (n, by) => n[by] || 0, (a, b, na, nb) => nb.cy - na.cy);
        const keys = Object.keys(node.children).sort((a, b) => sorter(a, b, node.children[a], node.children[b]));
        keys.forEach(k => {
          const child = node.children[k];
          const path = ancestorPath.concat(k);
          const pathKey = path.join('||');
          const isExpanded = !!expandedRows[pathKey];
          const st = AC_STYLES[Math.min(depth, AC_STYLES.length - 1)];
          const toggle = hasMore ? `<span class="toggle-icon" onclick="togglePvRowNode('agencyCompPivot','${pvEsc(pathKey)}')">${isExpanded ? '-' : '+'}</span>` : '';
          const inner = toggle + pvFormatFieldValue(field, k);
          const label = st.wrap ? st.wrap(inner) : inner;
          const trClass = st.rowClass ? ` class="${st.rowClass}"` : '';
          const menu = ` oncontextmenu="return acOpenRowSortMenu(event,${depth})"`;
          out.push(`<tr${trClass}><td class="indent-step-${Math.min(depth + 1, 5)}"${menu} style="${st.label}">${label}</td>${cellsHtml(child, st)}</tr>`);
          if (hasMore && isExpanded) renderLevel(child, depth + 1, path);
        });
      })(root, 0, []);

      const totYoY = fmtAgencyCompRatio(root.py, root.cy); const totMoM = fmtAgencyCompRatio(root.pm, root.cy);
      let html = out.join('');
      html += `<tr class="row-grand-total"><td class="indent-step-1">총합계</td><td style="text-align: right;">${fmtM(root.py)}</td><td style="text-align: right;">${fmtM(root.pm)}</td><td style="text-align: right;">${fmtM(root.cy)}</td><td style="text-align: right;">${totYoY.rateText}</td><td style="text-align: right;">${totYoY.diffText}</td><td style="text-align: right;">${totMoM.rateText}</td><td style="text-align: right;">${totMoM.diffText}</td></tr>`;
      tbody.innerHTML = mapPivotHtml(html);
    }

