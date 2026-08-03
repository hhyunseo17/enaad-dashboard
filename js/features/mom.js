// ============================================================
// js/features/mom.js
// 전월대비(MoM) 증감: 계산+차트+피벗
// ============================================================
    function computeMoMData() {
      if (selectedYears.length !== 1 || selectedMonths.length !== 1) return null;
      const cy = selectedYears[0]; const cm = selectedMonths[0];
      let py = cy, pm = cm - 1; if (pm === 0) { pm = 12; py = cy - 1; }

      const agencyTxt = document.getElementById('inputAgency').value.trim().toLowerCase();
      const advTxt = document.getElementById('inputAdvertiser').value.trim().toLowerCase();
      const commonMatch = (r) => {
        if (r.bonbuRevenueStatus !== '본부매출') return false;
        if (revenueBasisMode === 'performance' && r.revenueBasis !== '실적') return false;
        if (!isAllDeptsSelected && !selectedDepts.includes(r.dept)) return false;
        if (!isAllChannelsSelected && !selectedChannels.includes(r.channel)) return false;
        if (!isAllBroadsSelected && !selectedBroads.includes(r.broadDigital)) return false;
        if (agencyTxt && !(r.agency.toLowerCase().includes(agencyTxt) || r.agencyGroup.toLowerCase().includes(agencyTxt))) return false;
        if (advTxt && !r.advertiser.toLowerCase().includes(advTxt)) return false;
        return isAdvMetricEligible(r);
      };

      const currRows = rawData.filter(r => r.year === cy && r.month === cm && commonMatch(r));
      const prevRows = rawData.filter(r => r.year === py && r.month === pm && commonMatch(r));

      const currMap = {}; currRows.forEach(r => { currMap[r.advertiser] = (currMap[r.advertiser] || 0) + r.amount; });
      const prevMap = {}; prevRows.forEach(r => { prevMap[r.advertiser] = (prevMap[r.advertiser] || 0) + r.amount; });

      const allAdvertisers = new Set([...Object.keys(currMap), ...Object.keys(prevMap)]);
      const orderedKeys = ['신규', '증액', '유지', '감액', '중지'];
      const buckets = {}; orderedKeys.forEach(k => { buckets[k] = { count: 0, currSum: 0, prevSum: 0, items: [] }; });

      allAdvertisers.forEach(adv => {
        const curr = currMap[adv] || 0; const prev = prevMap[adv] || 0;
        let cls;
        if (prev <= 0 && curr > 0) cls = '신규';
        else if (curr <= 0 && prev > 0) cls = '중지';
        else if (curr > prev) cls = '증액';
        else if (curr < prev) cls = '감액';
        else cls = '유지';
        buckets[cls].count++; buckets[cls].currSum += curr; buckets[cls].prevSum += prev;
        buckets[cls].items.push({ advertiser: adv, prev, curr, diff: curr - prev });
      });
      orderedKeys.forEach(k => { if (k === '감액' || k === '중지') buckets[k].items.sort((a, b) => a.diff - b.diff); else buckets[k].items.sort((a, b) => b.diff - a.diff); });

      const totalCurr = currRows.reduce((s,r) => s + r.amount, 0);
      const totalPrev = prevRows.reduce((s,r) => s + r.amount, 0);
      return { cy, cm, py, pm, orderedKeys, buckets, totalCurr, totalPrev };
    }

    function renderMoMChart() {
      const container = document.getElementById('momChartContainer');
      const emptyMsg = document.getElementById('momEmptyMessage');
      const summaryBar = document.getElementById('momSummaryBar');
      const momCardBox = document.getElementById('momCardBox');
      const mom = computeMoMData();

      if (!mom) {
        container.style.display = 'none'; summaryBar.style.display = 'none'; emptyMsg.style.display = 'block';
        if (chartInstances.mom) { chartInstances.mom.destroy(); chartInstances.mom = null; }
        if (momCardBox) momCardBox.classList.remove('clickable');
        return;
      }
      container.style.display = ''; summaryBar.style.display = 'flex'; emptyMsg.style.display = 'none';
      if (momCardBox) momCardBox.classList.add('clickable');

      const { cy, cm, py, pm, orderedKeys, buckets, totalCurr, totalPrev } = mom;
      const diff = totalCurr - totalPrev; const diffRate = totalPrev > 0 ? (diff / totalPrev * 100) : 0;

      summaryBar.innerHTML = `
        <span><strong style="color:#FFFFFF;">${cy}년 ${cm}월(당월)</strong> 합계: <strong style="color:#60A5FA;">${formatCurrencyKorean(totalCurr)}</strong></span>
        <span><strong style="color:#94A3B8;">${py}년 ${pm}월(전월)</strong> 합계: <strong style="color:#94A3B8;">${formatCurrencyKorean(totalPrev)}</strong></span>
        <span>전월비 증감: <strong style="color:${diff >= 0 ? '#4ADE80' : CH('#F87171')};">${diff >= 0 ? '+' : ''}${formatCurrencyKorean(diff)} (${diffRate >= 0 ? '+' : ''}${diffRate.toFixed(1)}%)</strong></span>
      `;

      const momColors = { 신규: '#4ADE80', 증액: '#60A5FA', 유지: '#94A3B8', 감액: '#FBBF24', 중지: '#F87171' };

      const ctx = document.getElementById('chartMoM').getContext('2d');
      if (chartInstances.mom) chartInstances.mom.destroy();
      chartInstances.mom = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: orderedKeys.map(k => `${k} (${buckets[k].count.toLocaleString()}개사)`),
          datasets: [
            { label: '전월 금액(억원)', data: orderedKeys.map(k => buckets[k].prevSum / 1e8), backgroundColor: CH('#3A4258'), borderRadius: 4,
              datalabels: { display: 'auto', anchor: 'end', align: 'top', color: dataLabelTextColor(), font: { family: 'Pretendard', size: 11, weight: '700' }, formatter: (v) => v > 0 ? v.toFixed(1) + '억' : '' }
            },
            { label: '당월 금액(억원)', data: orderedKeys.map(k => buckets[k].currSum / 1e8), backgroundColor: orderedKeys.map(k => momColors[k]), borderRadius: 4,
              datalabels: { display: 'auto', anchor: 'end', align: 'top', color: dataLabelTextColor(), font: { family: 'Pretendard', size: 11, weight: '700' }, formatter: (v) => v > 0 ? v.toFixed(1) + '억' : '' }
            }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24 } },
          plugins: {
            legend: { display: true, position: 'top', labels: { color: CH('#B0B8C1'), font: { family: 'Pretendard', size: 13, weight: '600' } } },
            tooltip: { callbacks: { label: (ctx) => { const k = orderedKeys[ctx.dataIndex]; const b = buckets[k]; const d = b.currSum - b.prevSum; return `${ctx.dataset.label}: ${ctx.raw.toFixed(2)} 억원 (전월비 ${d >= 0 ? '+' : ''}${(d/1e8).toFixed(2)}억)`; } } }
          },
          scales: { y: { grace: '15%', ticks: { color: CH('#8B95A1'), callback: v => v + '억' }, grid: { color: CH('#21232A') } }, x: { ticks: { color: CH('#F2F4F6'), font: { family: 'Pretendard', size: 11, weight: '600' } }, grid: { display: false } } }
        }
      });
    }

    function openMoMPivotView() {
      const mom = computeMoMData();
      if (!mom) return; // 연도·월 각 1개 선택 상태(=메인 차트가 보이는 상태)가 아니면 진입 불가
      switchView('momPivot');
    }

    function toggleMoMCategory(key) { expandedMoMCategories[key] = !expandedMoMCategories[key]; renderMoMPivotTable(); }
    function expandAllMoMCategories(state) { ['신규', '증액', '유지', '감액', '중지'].forEach(k => { expandedMoMCategories[k] = state; }); renderMoMPivotTable(); }

    function renderMoMPivotTable() {
      const mom = computeMoMData();
      const tbody = document.getElementById('momPivotTableBody');
      if (!mom) { tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 40px; color: var(--text-secondary);">연도와 월을 각각 1개씩 선택하면 표시됩니다.</td></tr>`; document.getElementById('momPivotTotalAmount').innerText = `0 백만`; return; }

      const { cy, cm, py, pm, orderedKeys, buckets, totalCurr, totalPrev } = mom;
      document.getElementById('momPivotTitle').innerText = `전월대비 광고주 증감 상세 (${py}년 ${pm}월 → ${cy}년 ${cm}월)`;
      document.getElementById('momPivotTotalAmount').innerText = `${Math.round((totalCurr - totalPrev) / 1e6).toLocaleString()} 백만`;

      const fmtM = (won) => { const m = won / 1e6; if (!m) return '-'; return m.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }); };
      const fmtDiffM = (won) => { const m = won / 1e6; if (!m) return '-'; return (m >= 0 ? '+' : '') + m.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }); };

      let html = '';
      orderedKeys.forEach(k => {
        const b = buckets[k]; const isExpanded = !!expandedMoMCategories[k]; const bDiff = b.currSum - b.prevSum;
        html += `<tr class="row-channel"><td class="indent-step-1"><strong><span class="toggle-icon" onclick="toggleMoMCategory('${k}')">${isExpanded ? '-' : '+'}</span>${k} (${b.count.toLocaleString()}개사)</strong></td><td style="text-align: right; font-weight: 800;">${fmtM(b.prevSum)}</td><td style="text-align: right; font-weight: 800; color: #93C5FD;">${fmtM(b.currSum)}</td><td style="text-align: right; font-weight: 800; color: ${bDiff >= 0 ? '#4ADE80' : CH('#F87171')};">${fmtDiffM(bDiff)}</td></tr>`;
        if (isExpanded) {
          b.items.forEach(item => {
            html += `<tr class="row-category"><td class="indent-step-2" style="background: #151C2C; color: #CBD5E1;">${item.advertiser}</td><td style="text-align: right;">${fmtM(item.prev)}</td><td style="text-align: right;">${fmtM(item.curr)}</td><td style="text-align: right; color: ${item.diff >= 0 ? '#4ADE80' : CH('#F87171')};">${fmtDiffM(item.diff)}</td></tr>`;
          });
        }
      });
      html += `<tr class="row-grand-total"><td class="indent-step-1">총합계</td><td style="text-align: right;">${fmtM(totalPrev)}</td><td style="text-align: right;">${fmtM(totalCurr)}</td><td style="text-align: right;">${fmtDiffM(totalCurr - totalPrev)}</td></tr>`;
      tbody.innerHTML = mapPivotHtml(html);
    }

