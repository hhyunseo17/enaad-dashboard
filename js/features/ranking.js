// ============================================================
// js/features/ranking.js
// 랭킹 차트: Top10 대행사·광고주 / 부서별 / 담당자별
// ============================================================
    function renderRankAgencyChart() {
      const ctx = document.getElementById('chartRankAgency').getContext('2d'); if (chartInstances.rankAgency) chartInstances.rankAgency.destroy();
      const targetData = filteredData.filter(r => r.categoryOriginal === '일반광고' || r.categoryOriginal === 'IMC'); const subCats = ['일반광고', 'IMC']; 
      let chartLabels = []; let datasets = [];

      if (rankAgencyMode === 'agency') {
        const groupMap = {}; targetData.forEach(r => { groupMap[r.agency || '기타'] = (groupMap[r.agency || '기타'] || 0) + r.amount; });
        const sortedAgencies = Object.entries(groupMap).sort((a,b) => b[1] - a[1]).slice(0, 10).map(s => s[0]);
        chartLabels = sortedAgencies;
        datasets = subCats.map(cat => ({ label: cat, data: sortedAgencies.map(agency => targetData.filter(r => r.agency === agency && r.categoryReclassified === cat).reduce((s, r) => s + r.amount, 0) / 1e8), backgroundColor: ddBarFill(catColor(cat) || chartColors.blue, true), borderRadius: 0, ...ddStackSeparator(true),
          datalabels: { display: (ctx) => cat === subCats[subCats.length - 1], anchor: 'end', align: 'right', offset: 4, color: dataLabelTextColor(), font: { family: 'Pretendard', size: 10, weight: '700' },
            formatter: (v, ctx) => { let total = 0; ctx.chart.data.datasets.forEach(ds => { total += ds.data[ctx.dataIndex] || 0; }); return total > 0 ? total.toFixed(1) + '억' : ''; } }
        }));
      } else {
        const groupMap = {};
        targetData.forEach(r => { let grp = r.agencyGroup || '(미지정)'; groupMap[grp] = (groupMap[grp] || 0) + r.amount; });
        const topGroups = Object.entries(groupMap).sort((a,b) => b[1] - a[1]).slice(0, 10).map(g => g[0]);
        chartLabels = topGroups;
        datasets = subCats.map(cat => ({ label: cat, data: topGroups.map(grp => targetData.filter(r => r.agencyGroup === grp && r.categoryReclassified === cat).reduce((s, r) => s + r.amount, 0) / 1e8), backgroundColor: ddBarFill(catColor(cat) || chartColors.blue, true), borderRadius: 0, ...ddStackSeparator(true),
          datalabels: { display: (ctx) => cat === subCats[subCats.length - 1], anchor: 'end', align: 'right', offset: 4, color: dataLabelTextColor(), font: { family: 'Pretendard', size: 10, weight: '700' },
            formatter: (v, ctx) => { let total = 0; ctx.chart.data.datasets.forEach(ds => { total += ds.data[ctx.dataIndex] || 0; }); return total > 0 ? total.toFixed(1) + '억' : ''; } }
        }));
      }

      chartInstances.rankAgency = new Chart(ctx, { type: 'bar', data: { labels: chartLabels, datasets: datasets }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24 } }, plugins: { legend: { display: true, position: 'top', labels: { color: CH('#B0B8C1'), font: { family: 'Pretendard', size: 12, weight: '600' } } }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(2)} 억원` } } }, scales: { x: ddValueAxis({ stacked: true, grace: '20%', ticks: { color: CH('#8B95A1'), maxTicksLimit: 5, padding: 6, callback: v => v + '억' } }), y: { stacked: true, ticks: { color: CH('#F2F4F6'), font: { family: 'Pretendard', weight: '600' } }, grid: { display: false } } } } });
    }

    function renderRankAdvertiserChart() {
      const ctx = document.getElementById('chartRankAdvertiser').getContext('2d'); if (chartInstances.rankAdvertiser) chartInstances.rankAdvertiser.destroy();
      const targetData = filteredData.filter(r => r.categoryOriginal === '일반광고' || r.categoryOriginal === 'IMC'); const groupMap = {}; targetData.forEach(r => { groupMap[r.advertiser || '기타'] = (groupMap[r.advertiser || '기타'] || 0) + r.amount; });
      const sortedAdvertisers = Object.entries(groupMap).sort((a,b) => b[1] - a[1]).slice(0, 10).map(s => s[0]); const subCats = ['일반광고', 'IMC'];
      const datasets = subCats.map(cat => ({ label: cat, data: sortedAdvertisers.map(adv => targetData.filter(r => r.advertiser === adv && r.categoryReclassified === cat).reduce((s, r) => s + r.amount, 0) / 1e8), backgroundColor: ddBarFill(catColor(cat) || chartColors.slate, true), borderRadius: 0, ...ddStackSeparator(true),
        datalabels: { display: (ctx) => cat === subCats[subCats.length - 1], anchor: 'end', align: 'right', offset: 4, color: dataLabelTextColor(), font: { family: 'Pretendard', size: 10, weight: '700' },
          formatter: (v, ctx) => { let total = 0; ctx.chart.data.datasets.forEach(ds => { total += ds.data[ctx.dataIndex] || 0; }); return total > 0 ? total.toFixed(1) + '억' : ''; } }
      }));
      chartInstances.rankAdvertiser = new Chart(ctx, { type: 'bar', data: { labels: sortedAdvertisers, datasets: datasets }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24 } }, plugins: { legend: { display: true, position: 'top', labels: { color: CH('#B0B8C1'), font: { family: 'Pretendard', size: 12, weight: '600' } } }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(2)} 억원` } } }, scales: { x: ddValueAxis({ stacked: true, grace: '20%', ticks: { color: CH('#8B95A1'), maxTicksLimit: 5, padding: 6, callback: v => v + '억' } }), y: { stacked: true, ticks: { color: CH('#F2F4F6'), font: { family: 'Pretendard', weight: '600' } }, grid: { display: false } } } } });
    }

    function renderDeptChart() {
      const ctx = document.getElementById('chartDept').getContext('2d'); if (chartInstances.dept) chartInstances.dept.destroy();
      const deptSumMap = {}; filteredData.forEach(r => { deptSumMap[r.dept] = (deptSumMap[r.dept] || 0) + r.amount; });
      
      // **부서 정렬 로직 적용 (매출순이 아닌 팀 순서)**
      const topDepts = Object.keys(deptSumMap).sort(compareDeptOrder);

      let subKeys = deptMode === 'categoryReclassified' ? [...categoryOrderList] : [...new Set(filteredData.map(r => r[deptMode]))].filter(Boolean).sort((a, b) => (broadOrderMap[a] || 99) - (broadOrderMap[b] || 99));
      const datasets = subKeys.map((subK, idx) => ({ label: subK, data: topDepts.map(dept => filteredData.filter(r => r.dept === dept && r[deptMode] === subK).reduce((s, r) => s + r.amount, 0) / 1e8), backgroundColor: ddBarFill((deptMode === 'categoryReclassified' && catColor(subK)) ? catColor(subK) : colorPaletteList[idx % colorPaletteList.length]), borderRadius: 0, ...ddStackSeparator(),
        datalabels: { display: (ctx) => idx === subKeys.length - 1, anchor: 'end', align: 'top', offset: 4, color: dataLabelTextColor(), font: { family: 'Pretendard', size: 10, weight: '700' },
          formatter: (v, ctx) => { let total = 0; ctx.chart.data.datasets.forEach(ds => { total += ds.data[ctx.dataIndex] || 0; }); return total > 0 ? total.toFixed(1) + '억' : ''; } }
      }));
      chartInstances.dept = new Chart(ctx, { type: 'bar', data: { labels: topDepts, datasets: datasets }, options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24 } }, plugins: { legend: { position: 'top', labels: { color: CH('#B0B8C1'), font: { family: 'Pretendard', size: 12, weight: '600' } } }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(2)} 억원` } } }, scales: { x: { stacked: true, ticks: { color: CH('#F2F4F6'), font: { family: 'Pretendard', size: 12, weight: '600' } }, grid: { display: false } }, y: ddValueAxis({ stacked: true, ticks: { color: CH('#8B95A1'), maxTicksLimit: 5, padding: 6, callback: v => v + '억' } }) } } });
    }

    function renderManagerChart() {
      const ctx = document.getElementById('chartManager').getContext('2d'); if (chartInstances.manager) chartInstances.manager.destroy();
      const managerSumMap = {}; filteredData.forEach(r => { managerSumMap[r.manager] = (managerSumMap[r.manager] || 0) + r.amount; });
      const topManagers = Object.entries(managerSumMap).sort((a,b) => b[1] - a[1]).slice(0, 10).map(s => s[0]);
      let subKeys = managerMode === 'categoryReclassified' ? [...categoryOrderList] : [...new Set(filteredData.map(r => r[managerMode]))].filter(Boolean).sort((a, b) => (broadOrderMap[a] || 99) - (broadOrderMap[b] || 99));
      const datasets = subKeys.map((subK, idx) => ({ label: subK, data: topManagers.map(mgr => filteredData.filter(r => r.manager === mgr && r[managerMode] === subK).reduce((s, r) => s + r.amount, 0) / 1e8), backgroundColor: ddBarFill((managerMode === 'categoryReclassified' && catColor(subK)) ? catColor(subK) : colorPaletteList[idx % colorPaletteList.length]), borderRadius: 0, ...ddStackSeparator(),
        datalabels: { display: (ctx) => idx === subKeys.length - 1, anchor: 'end', align: 'top', offset: 4, color: dataLabelTextColor(), font: { family: 'Pretendard', size: 10, weight: '700' },
          formatter: (v, ctx) => { let total = 0; ctx.chart.data.datasets.forEach(ds => { total += ds.data[ctx.dataIndex] || 0; }); return total > 0 ? total.toFixed(1) + '억' : ''; } }
      }));
      chartInstances.manager = new Chart(ctx, { type: 'bar', data: { labels: topManagers, datasets: datasets }, options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24 } }, plugins: { legend: { position: 'top', labels: { color: CH('#B0B8C1'), font: { family: 'Pretendard', size: 12, weight: '600' } } }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(2)} 억원` } } }, scales: { x: { stacked: true, ticks: { color: CH('#F2F4F6'), font: { family: 'Pretendard', size: 12, weight: '600' } }, grid: { display: false } }, y: ddValueAxis({ stacked: true, ticks: { color: CH('#8B95A1'), maxTicksLimit: 5, padding: 6, callback: v => v + '억' } }) } } });
    }

    // ==========================================================================
    // 기존 채널 통합 피벗 기능 유지
    // ==========================================================================
