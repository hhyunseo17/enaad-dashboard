// ============================================================
// js/features/new-advertiser.js
// 신규 광고주: 계산+피벗
// ============================================================
    function computeNewAdvertiserData() {
      const hasGeneralOrIMC = isAllCategoriesSelected || selectedCategories.includes('일반광고') || selectedCategories.includes('IMC');
      if (!hasGeneralOrIMC) return null;

      const commonMatch = makeCommonMatch(isAdvMetricEligible);

      // 선택된 연/월(복수 가능) 및 기타 필터를 반영한 대상 데이터
      const targetData = filteredData.filter(r => commonMatch(r));
      const ymSet = new Set(targetData.filter(r => r.amount > 0).map(r => `${r.year}-${r.month}`));
      const ymList = [...ymSet].map(s => { const [y, m] = s.split('-').map(Number); return { year: y, month: m }; }).sort((a,b) => a.year - b.year || a.month - b.month);

      // 연도별 광고주 누적매출 사전 집계 (전체 rawData 1회 스캔, 연도/월 제한 없이 나머지 필터만 반영)
      const yearAdvMap = {};
      rawData.forEach(r => {
        if (!commonMatch(r)) return;
        const key = r.year + '||' + r.advertiser;
        yearAdvMap[key] = (yearAdvMap[key] || 0) + r.amount;
      });

      // 연 > 월 2단 트리. 여러 연도를 선택했을 때 연 단위 소계(광고주수/해당월 매출 합/해당연도 누적매출 합)를 낼 수 있도록 연과 월을 분리해서 쌓는다.
      const years = {};
      ymList.forEach(({ year, month }) => {
        const monthStr = `${year}-${String(month).padStart(2, '0')}`;
        const monthRows = targetData.filter(r => r.year === year && r.month === month);
        const advMap = {};
        monthRows.forEach(r => { advMap[r.advertiser] = (advMap[r.advertiser] || 0) + r.amount; });

        const items = [];
        Object.entries(advMap).forEach(([adv, amount]) => {
          if (amount > 0 && isNewAdvertiserMonth(adv, monthStr)) {
            const yearAmount = yearAdvMap[year + '||' + adv] || 0;
            items.push({ advertiser: adv, monthAmount: amount, yearAmount });
          }
        });
        if (items.length > 0) {
          items.sort((a,b) => b.monthAmount - a.monthAmount);
          const monthTotal = items.reduce((s,i) => s + i.monthAmount, 0);
          const yearTotalSum = items.reduce((s,i) => s + i.yearAmount, 0);
          if (!years[year]) years[year] = { year, months: {}, monthKeys: [] };
          const monthKey = `${year}-${month}`;
          years[year].months[monthKey] = { year, month, items, monthTotal, yearTotalSum };
          years[year].monthKeys.push(monthKey);
        }
      });

      Object.values(years).forEach(y => {
        y.monthKeys.sort((a, b) => y.months[a].month - y.months[b].month);
        y.advCount = y.monthKeys.reduce((s, k) => s + y.months[k].items.length, 0);
        y.monthTotalSum = y.monthKeys.reduce((s, k) => s + y.months[k].monthTotal, 0);
        y.yearTotalSum = y.monthKeys.reduce((s, k) => s + y.months[k].yearTotalSum, 0);
      });
      return years;
    }

    function openNewAdvPivotView() {
      switchView('newAdvPivot');
    }

    function toggleNewAdvGroup(key) { expandedNewAdvGroups[key] = !expandedNewAdvGroups[key]; renderNewAdvPivotTable(); }
    function toggleNewAdvYear(year) { expandedNewAdvYears[year] = !expandedNewAdvYears[year]; renderNewAdvPivotTable(); }
    function expandAllNewAdvGroups(state) {
      const data = computeNewAdvertiserData(); if (!data) return;
      Object.keys(data).forEach(y => {
        expandedNewAdvYears[y] = state;
        data[y].monthKeys.forEach(k => { expandedNewAdvGroups[k] = state; });
      });
      renderNewAdvPivotTable();
    }

    function renderNewAdvPivotTable() {
      const data = computeNewAdvertiserData();
      const tbody = document.getElementById('newAdvPivotTableBody');
      if (!data) { tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 40px; color: var(--text-secondary);">일반광고 또는 IMC가 선택된 상태에서만 표시됩니다.</td></tr>`; document.getElementById('newAdvPivotTotalAmount').innerText = `0 백만`; return; }

      const yearKeys = Object.keys(data).sort((a, b) => Number(a) - Number(b));
      const fmtM = (won) => { const m = won / 1e6; if (!m) return '-'; return m.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }); };
      const totalCount = yearKeys.reduce((s,y) => s + data[y].advCount, 0);
      const grandMonthTotal = yearKeys.reduce((s,y) => s + data[y].monthTotalSum, 0);
      const monthGroupCount = yearKeys.reduce((s,y) => s + data[y].monthKeys.length, 0);
      document.getElementById('newAdvPivotTitle').innerText = `신규 광고주 상세 (${monthGroupCount}개 월, 총 ${totalCount.toLocaleString()}개사)`;
      document.getElementById('newAdvPivotTotalAmount').innerText = `${Math.round(grandMonthTotal / 1e6).toLocaleString()} 백만`;

      if (yearKeys.length === 0) { tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 40px; color: var(--text-secondary);">해당 조건의 신규 광고주가 없습니다.</td></tr>`; return; }

      let html = '';
      yearKeys.forEach(yearKey => {
        const y = data[yearKey]; const isYearExpanded = !!expandedNewAdvYears[yearKey];
        html += `<tr class="row-channel"><td class="indent-step-1"><strong><span class="toggle-icon" onclick="toggleNewAdvYear('${yearKey}')">${isYearExpanded ? '-' : '+'}</span>${y.year}년</strong></td><td style="text-align: right; font-weight: 500;">${y.advCount.toLocaleString()}</td><td style="text-align: right; font-weight: 500; color: #93C5FD;">${fmtM(y.monthTotalSum)}</td><td style="text-align: right; font-weight: 500; color: #C4B5FD;">${fmtM(y.yearTotalSum)}</td></tr>`;
        if (isYearExpanded) {
          y.monthKeys.forEach(key => {
            const g = y.months[key]; const isExpanded = !!expandedNewAdvGroups[key];
            html += `<tr class="row-category"><td class="indent-step-2" style="background: #151C2C; color: #CBD5E1;"><span class="toggle-icon" onclick="toggleNewAdvGroup('${key}')">${isExpanded ? '-' : '+'}</span>${g.month}월</td><td style="text-align: right; font-weight: 500;">${g.items.length.toLocaleString()}</td><td style="text-align: right; font-weight: 500; color: #93C5FD;">${fmtM(g.monthTotal)}</td><td style="text-align: right; font-weight: 500; color: #C4B5FD;">${fmtM(g.yearTotalSum)}</td></tr>`;
            if (isExpanded) {
              g.items.forEach(item => {
                html += `<tr class="row-subcategory"><td class="indent-step-3" style="background: #11151F; color: #94A3B8;">${item.advertiser}</td><td style="text-align: right;">-</td><td style="text-align: right;">${fmtM(item.monthAmount)}</td><td style="text-align: right;">${fmtM(item.yearAmount)}</td></tr>`;
              });
            }
          });
        }
      });
      const grandYearTotal = yearKeys.reduce((s,y) => s + data[y].yearTotalSum, 0);
      html += `<tr class="row-grand-total"><td class="indent-step-1">총합계</td><td style="text-align: right;">${totalCount.toLocaleString()}</td><td style="text-align: right;">${fmtM(grandMonthTotal)}</td><td style="text-align: right;">${fmtM(grandYearTotal)}</td></tr>`;
      tbody.innerHTML = mapPivotHtml(html);
    }

