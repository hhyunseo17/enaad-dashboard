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
            { label: `전년동월(${py}.${cm})`, data: topGroups.map(g => getVal(prevYearMap, g)), backgroundColor: ddBarFill(CH('#3A4258')), borderRadius: 5,
              datalabels: { display: 'auto', anchor: 'end', align: 'top', color: dataLabelTextColor(), font: { family: 'Pretendard', size: 10, weight: '700' }, formatter: (v) => v > 0 ? v.toFixed(1) : '' }
            },
            { label: `전월(${pmY}.${pmM})`, data: topGroups.map(g => getVal(prevMonthMap, g)), backgroundColor: ddBarFill(CH('#6B7280')), borderRadius: 5,
              datalabels: { display: 'auto', anchor: 'end', align: 'top', color: dataLabelTextColor(), font: { family: 'Pretendard', size: 10, weight: '700' }, formatter: (v) => v > 0 ? v.toFixed(1) : '' }
            },
            { label: `당월(${cy}.${cm})`, data: topGroups.map(g => getVal(currMap, g)), backgroundColor: ddBarFill(CH('#60A5FA')), borderRadius: 5,
              datalabels: { display: 'auto', anchor: 'end', align: 'top', color: dataLabelTextColor(), font: { family: 'Pretendard', size: 10, weight: '700' }, formatter: (v) => v > 0 ? v.toFixed(1) : '' }
            }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24 } },
          plugins: {
            legend: { display: true, position: 'top', labels: { color: CH('#B0B8C1'), font: { family: 'Pretendard', size: 12, weight: '600' } } },
            tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unitLabel}` } }
          },
          scales: { y: ddValueAxis({ ticks: { color: CH('#8B95A1'), maxTicksLimit: 5, padding: 6, callback: v => v + (agencyCompMetricMode === 'revenue' ? '억' : '') } }), x: { ticks: { color: CH('#F2F4F6'), font: { family: 'Pretendard', size: 11, weight: '600' } }, grid: { display: false } } }
        }
      });
    }

    function openAgencyCompPivotView() {
      const compData = computeAgencyCompData();
      if (!compData) return; // 연도·월 각 1개 선택 상태(=차트가 보이는 상태)가 아니면 진입 불가
      switchView('agencyCompPivot');
    }

    function toggleCompAgencyGroupNode(grp) { expandedCompAgencyGroups[grp] = !expandedCompAgencyGroups[grp]; renderAgencyCompPivotTable(); }
    function toggleCompAgencyNode(grp, agy) { const key = grp + '||' + agy; expandedCompAgencies[key] = !expandedCompAgencies[key]; renderAgencyCompPivotTable(); }
    function expandAllAgencyCompNodes(state) {
      const compData = computeAgencyCompData(); if (!compData) return;
      const allRows = [...compData.currRows, ...compData.prevMonthRows, ...compData.prevYearRows];
      allRows.forEach(r => { const g = r.agencyGroup || '(미지정)'; const a = r.agency || '(미지정)'; expandedCompAgencyGroups[g] = state; expandedCompAgencies[g + '||' + a] = state; });
      renderAgencyCompPivotTable();
    }

    function fmtAgencyCompRatio(base, curr) {
      const diffM = Math.round((curr - base) / 1e6);
      const diffStr = (diffM > 0 ? '+' : '') + diffM.toLocaleString();
      if (base === 0 && curr === 0) return { rateText: '-', diffText: '-', color: CH('#8B95A1') };
      if (base === 0) return { rateText: '신규', diffText: diffStr, color: '#4ADE80' };
      if (curr === 0) return { rateText: '-100.0%', diffText: diffStr, color: CH('#F87171') };
      const rate = (curr - base) / base * 100;
      return { rateText: `${rate >= 0 ? '+' : ''}${rate.toFixed(1)}%`, diffText: diffStr, color: rate >= 0 ? '#4ADE80' : CH('#F87171') };
    }

    function renderAgencyCompPivotTable() {
      const compData = computeAgencyCompData();
      const tbody = document.getElementById('agencyCompPivotTableBody');
      if (!compData) { tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 40px; color: var(--text-secondary);">연도와 월을 각각 1개씩 선택하면 표시됩니다.</td></tr>`; document.getElementById('agencyCompPivotTotalAmount').innerText = `0 백만`; return; }

      const { cy, cm, pmY, pmM, py, currRows, prevMonthRows, prevYearRows } = compData;
      document.getElementById('agencyCompPivotTitle').innerText = `주요 대행사 전년·전월 비교 상세 (전년 ${py}.${cm} / 전월 ${pmY}.${pmM} / 당월 ${cy}.${cm})`;
      document.getElementById('agencyCompPivotHeaderRow').innerHTML = `
        <th style="text-align: left; min-width: 280px;">대행사그룹 / 대행사 / 광고주</th>
        <th style="text-align: right;">전년(${py}.${cm}) 금액</th>
        <th style="text-align: right;">전월(${pmY}.${pmM}) 금액</th>
        <th style="text-align: right;">당월(${cy}.${cm}) 금액</th>
        <th style="text-align: right;">전년비(%)</th>
        <th style="text-align: right;">전년비(금액)</th>
        <th style="text-align: right;">전월비(%)</th>
        <th style="text-align: right;">전월비(금액)</th>`;

      // 트리 구축: 그룹 -> 대행사 -> 광고주, 각 py/pm/cy 금액 누적
      const tree = {};
      function addRows(rows, key) {
        rows.forEach(r => {
          const g = r.agencyGroup || '(미지정)'; const a = r.agency || '(미지정)'; const adv = r.advertiser || '(미지정)';
          if (!tree[g]) tree[g] = { py: 0, pm: 0, cy: 0, agencies: {} };
          tree[g][key] += r.amount;
          if (!tree[g].agencies[a]) tree[g].agencies[a] = { py: 0, pm: 0, cy: 0, advertisers: {} };
          tree[g].agencies[a][key] += r.amount;
          if (!tree[g].agencies[a].advertisers[adv]) tree[g].agencies[a].advertisers[adv] = { py: 0, pm: 0, cy: 0 };
          tree[g].agencies[a].advertisers[adv][key] += r.amount;
        });
      }
      addRows(prevYearRows, 'py'); addRows(prevMonthRows, 'pm'); addRows(currRows, 'cy');

      const fmtM = (won) => { const m = Math.round(won / 1e6); if (!m) return '-'; return m.toLocaleString(); };
      const grandTotalCy = Object.values(tree).reduce((s, g) => s + g.cy, 0);
      document.getElementById('agencyCompPivotTotalAmount').innerText = `${Math.round(grandTotalCy / 1e6).toLocaleString()} 백만`;

      const groups = Object.keys(tree).sort((a,b) => tree[b].cy - tree[a].cy);
      let html = '';
      groups.forEach(grp => {
        const gData = tree[grp]; const isGrpExpanded = !!expandedCompAgencyGroups[grp];
        const gYoY = fmtAgencyCompRatio(gData.py, gData.cy); const gMoM = fmtAgencyCompRatio(gData.pm, gData.cy);
        html += `<tr class="row-channel"><td class="indent-step-1"><strong><span class="toggle-icon" onclick="toggleCompAgencyGroupNode('${grp.replace(/'/g,"\\'")}')">${isGrpExpanded ? '-' : '+'}</span>${grp}</strong></td><td style="text-align: right; font-weight: 700;">${fmtM(gData.py)}</td><td style="text-align: right; font-weight: 700;">${fmtM(gData.pm)}</td><td style="text-align: right; font-weight: 800; color: #60A5FA;">${fmtM(gData.cy)}</td><td style="text-align: right; font-weight: 700; color: ${gYoY.color};">${gYoY.rateText}</td><td style="text-align: right; font-weight: 700; color: ${gYoY.color};">${gYoY.diffText}</td><td style="text-align: right; font-weight: 700; color: ${gMoM.color};">${gMoM.rateText}</td><td style="text-align: right; font-weight: 700; color: ${gMoM.color};">${gMoM.diffText}</td></tr>`;

        if (isGrpExpanded) {
          const agencies = Object.keys(gData.agencies).sort((a,b) => gData.agencies[b].cy - gData.agencies[a].cy);
          agencies.forEach(agy => {
            const aData = gData.agencies[agy]; const agyKey = grp + '||' + agy; const isAgyExpanded = !!expandedCompAgencies[agyKey];
            const aYoY = fmtAgencyCompRatio(aData.py, aData.cy); const aMoM = fmtAgencyCompRatio(aData.pm, aData.cy);
            html += `<tr class="row-category"><td class="indent-step-2" style="background: #151C2C; color: #CBD5E1;"><span class="toggle-icon" onclick="toggleCompAgencyNode('${grp.replace(/'/g,"\\'")}', '${agy.replace(/'/g,"\\'")}')">${isAgyExpanded ? '-' : '+'}</span>${agy}</td><td style="text-align: right;">${fmtM(aData.py)}</td><td style="text-align: right;">${fmtM(aData.pm)}</td><td style="text-align: right; color: #93C5FD;">${fmtM(aData.cy)}</td><td style="text-align: right; color: ${aYoY.color};">${aYoY.rateText}</td><td style="text-align: right; color: ${aYoY.color};">${aYoY.diffText}</td><td style="text-align: right; color: ${aMoM.color};">${aMoM.rateText}</td><td style="text-align: right; color: ${aMoM.color};">${aMoM.diffText}</td></tr>`;

            if (isAgyExpanded) {
              const advertisers = Object.keys(aData.advertisers).sort((a,b) => aData.advertisers[b].cy - aData.advertisers[a].cy);
              advertisers.forEach(adv => {
                const advData = aData.advertisers[adv];
                const advYoY = fmtAgencyCompRatio(advData.py, advData.cy); const advMoM = fmtAgencyCompRatio(advData.pm, advData.cy);
                html += `<tr class="row-subcategory"><td class="indent-step-3" style="background: #11151F; color: #94A3B8;">${adv}</td><td style="text-align: right;">${fmtM(advData.py)}</td><td style="text-align: right;">${fmtM(advData.pm)}</td><td style="text-align: right;">${fmtM(advData.cy)}</td><td style="text-align: right; color: ${advYoY.color};">${advYoY.rateText}</td><td style="text-align: right; color: ${advYoY.color};">${advYoY.diffText}</td><td style="text-align: right; color: ${advMoM.color};">${advMoM.rateText}</td><td style="text-align: right; color: ${advMoM.color};">${advMoM.diffText}</td></tr>`;
              });
            }
          });
        }
      });

      const totalPy = Object.values(tree).reduce((s, g) => s + g.py, 0);
      const totalPm = Object.values(tree).reduce((s, g) => s + g.pm, 0);
      const totYoY = fmtAgencyCompRatio(totalPy, grandTotalCy); const totMoM = fmtAgencyCompRatio(totalPm, grandTotalCy);
      html += `<tr class="row-grand-total"><td class="indent-step-1">총합계</td><td style="text-align: right;">${fmtM(totalPy)}</td><td style="text-align: right;">${fmtM(totalPm)}</td><td style="text-align: right;">${fmtM(grandTotalCy)}</td><td style="text-align: right;">${totYoY.rateText}</td><td style="text-align: right;">${totYoY.diffText}</td><td style="text-align: right;">${totMoM.rateText}</td><td style="text-align: right;">${totMoM.diffText}</td></tr>`;
      tbody.innerHTML = mapPivotHtml(html);
    }

