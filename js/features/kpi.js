// ============================================================
// js/features/kpi.js
// KPI 카드 렌더 + 업프론트 목표(월할) 계산
// ============================================================
    function renderKPIs() {
      const totalRev = filteredData.reduce((acc, r) => acc + r.amount, 0);
      let currentYear = new Date().getFullYear();
      if (selectedYears.length === 1) currentYear = selectedYears[0]; else if (selectedYears.length > 1) currentYear = Math.max(...selectedYears); else if (rawData.length > 0) currentYear = Math.max(...rawData.map(r=>r.year));
      let activeMonths = selectedMonths.length > 0 ? [...selectedMonths] : [...new Set(rawData.filter(r => r.year === currentYear && r.bonbuRevenueStatus === '본부매출').map(r => r.month))];

      document.getElementById('kpiTotalRevenue').innerText = formatCurrencyKorean(totalRev);
      document.getElementById('kpiTotalSub').innerText = `선택 기간 총 누적 실적`;

      let prevRev = 0; let prevTargetData = [];
      const agencyTxt = document.getElementById('inputAgency').value.trim().toLowerCase(); const advTxt = document.getElementById('inputAdvertiser').value.trim().toLowerCase();
      if (selectedYears.length === 1) {
        const prevYear = selectedYears[0] - 1;
        const prevYearFiltered = rawData.filter(r => {
          if (r.bonbuRevenueStatus !== '본부매출') return false; if (revenueBasisMode === 'performance' && r.revenueBasis !== '실적') return false; if (r.year !== prevYear) return false; if (!activeMonths.includes(r.month)) return false;
          if (!isAllDeptsSelected && !selectedDepts.includes(r.dept)) return false; if (!isAllChannelsSelected && !selectedChannels.includes(r.channel)) return false; if (!isAllBroadsSelected && !selectedBroads.includes(r.broadDigital)) return false;
          if (!isAllCategoriesSelected) { let matchCategory = false; selectedCategories.forEach(sc => { if (r.categoryReclassified === sc) matchCategory = true; }); if (!matchCategory) return false; }
          if (agencyTxt && !(r.agency.toLowerCase().includes(agencyTxt) || r.agencyGroup.toLowerCase().includes(agencyTxt))) return false; if (advTxt && !r.advertiser.toLowerCase().includes(advTxt)) return false; return true;
        });
        prevRev = prevYearFiltered.reduce((acc, r) => acc + r.amount, 0);
        prevTargetData = prevYearFiltered.filter(r => { const isOneN = (r.oneNFlag || '').toString().trim() === '1' || (r.oneNFlag || '').toString().toLowerCase() === 'y'; return (r.categoryOriginal === '일반광고' || r.categoryOriginal === 'IMC') && r.subCategory3 !== '배분수익' && !isOneN; });
      }

      const diffRev = totalRev - prevRev; const growthRate = prevRev > 0 ? (diffRev / prevRev) * 100 : 0; const diffFormatted = (diffRev >= 0 ? '+' : '') + formatCurrencyKorean(diffRev);
      if (selectedYears.length === 1) {
        document.getElementById('kpiYoYDiff').innerText = diffFormatted;
        const growthBadge = document.getElementById('kpiGrowthBadge');
        if (growthRate >= 0) { growthBadge.className = 'badge-growth up'; growthBadge.innerText = `+${growthRate.toFixed(1)}% ▲`; } else { growthBadge.className = 'badge-growth down'; growthBadge.innerText = `${growthRate.toFixed(1)}% ▼`; }
        growthBadge.style.display = 'inline-flex'; document.getElementById('kpiGrowthText').innerText = `작년 동기 (${formatCurrencyKoreanShort(prevRev)}) 대비`;
      } else { document.getElementById('kpiYoYDiff').innerText = '-'; document.getElementById('kpiGrowthBadge').style.display = 'none'; document.getElementById('kpiGrowthText').innerText = `단일 연도 선택 시 제공`; }

      renderUpfrontKPI();

      const hasGeneralOrIMC = isAllCategoriesSelected || selectedCategories.includes('일반광고') || selectedCategories.includes('IMC');
      if (!hasGeneralOrIMC) {
        document.getElementById('kpiAvgRevPerAdv').innerText = `- 원`; document.getElementById('kpiAdvCountSub').innerText = `조건 해당 없음 (일반/IMC 전용)`;
        const advGrowthBadge = document.getElementById('kpiAdvGrowthBadge'); if (advGrowthBadge) advGrowthBadge.style.display = 'none';
        document.getElementById('kpiNewAdvCount').innerText = `- 개사`; document.getElementById('kpiNewAdvSub').innerText = `조건 해당 없음 (일반/IMC 전용)`; return; 
      } else { const advGrowthBadge = document.getElementById('kpiAdvGrowthBadge'); if (advGrowthBadge) advGrowthBadge.style.display = 'inline-flex'; }

      const targetData = filteredData.filter(r => { const isOneN = (r.oneNFlag || '').toString().trim() === '1' || (r.oneNFlag || '').toString().toLowerCase() === 'y'; return (r.categoryOriginal === '일반광고' || r.categoryOriginal === 'IMC') && r.subCategory3 !== '배분수익' && !isOneN; });
      const monthlyAdvMap = {}; targetData.forEach(r => { const key = r.monthStr + '||' + r.advertiser; monthlyAdvMap[key] = (monthlyAdvMap[key] || 0) + r.amount; });

      let totalAdvCount = 0; let targetRevenue = 0;
      Object.entries(monthlyAdvMap).forEach(([key, sumAmount]) => { if (sumAmount > 0) { totalAdvCount++; targetRevenue += sumAmount; } });
      const avgRevPerAdv = totalAdvCount > 0 ? targetRevenue / totalAdvCount : 0;
      let prevAvgRevPerAdv = 0; let prevTotalAdvCount = 0;
      
      if (selectedYears.length === 1) {
        const prevMonthlyAdvMap = {}; prevTargetData.forEach(r => { const key = r.monthStr + '||' + r.advertiser; prevMonthlyAdvMap[key] = (prevMonthlyAdvMap[key] || 0) + r.amount; });
        let prevTargetRevenue = 0; Object.values(prevMonthlyAdvMap).forEach(sumAmount => { if (sumAmount > 0) { prevTotalAdvCount++; prevTargetRevenue += sumAmount; } });
        prevAvgRevPerAdv = prevTotalAdvCount > 0 ? prevTargetRevenue / prevTotalAdvCount : 0;
      }
      const advGrowthRate = prevAvgRevPerAdv > 0 ? ((avgRevPerAdv - prevAvgRevPerAdv) / prevAvgRevPerAdv) * 100 : 0;
      const advGrowthBadge = document.getElementById('kpiAdvGrowthBadge');
      if (advGrowthBadge) { if (advGrowthRate >= 0) { advGrowthBadge.className = 'badge-growth up'; advGrowthBadge.innerText = `+${advGrowthRate.toFixed(1)}% ▲`; } else { advGrowthBadge.className = 'badge-growth down'; advGrowthBadge.innerText = `${advGrowthRate.toFixed(1)}% ▼`; } }
      const advCountDiff = totalAdvCount - prevTotalAdvCount; let advCountDiffStr = selectedYears.length === 1 ? ` (${advCountDiff >= 0 ? '+' : ''}${advCountDiff.toLocaleString()}개)` : '';

      document.getElementById('kpiAvgRevPerAdv').innerText = `${Math.round(avgRevPerAdv).toLocaleString()} 원`;
      document.getElementById('kpiAdvCountSub').innerText = `선택기간 누적 광고주수: ${totalAdvCount.toLocaleString()} 개${advCountDiffStr}`;

      const advMonthlyMapNew = {}; targetData.forEach(r => { const key = r.monthStr + '||' + r.advertiser; if (!advMonthlyMapNew[key]) advMonthlyMapNew[key] = { advertiser: r.advertiser, monthStr: r.monthStr, amount: 0 }; advMonthlyMapNew[key].amount += r.amount; });
      let newAdvCount = 0; Object.values(advMonthlyMapNew).forEach(item => { if (item.amount > 0 && isNewAdvertiserMonth(item.advertiser, item.monthStr, rawData)) newAdvCount++; });

      document.getElementById('kpiNewAdvCount').innerText = `${newAdvCount.toLocaleString()} 개사`; document.getElementById('kpiNewAdvSub').innerText = `일반+IMC / 1/N 제외 (12개월 이력 없음)`;
    }

    function computeUpfrontTargetDynamic() {
      // 선택된 연/월 스코프와 겹치는 개월 수만큼 계약금액을 월할 계산 (연걸침 계약 자동 안분)
      const scopeYears = selectedYears.length > 0 ? selectedYears : [...new Set(rawData.map(r => r.year))];
      const scopeMonths = selectedMonths.length > 0 ? selectedMonths : [1,2,3,4,5,6,7,8,9,10,11,12];
      const scopeSet = new Set();
      scopeYears.forEach(y => scopeMonths.forEach(m => scopeSet.add(y + '-' + m)));

      let targetTotal = 0;
      upfrontContracts.forEach(c => {
        let overlap = 0;
        const startIdx = c.start.y * 12 + c.start.m; const endIdx = c.end.y * 12 + c.end.m;
        for (let idx = startIdx; idx <= endIdx; idx++) {
          const yy = Math.floor((idx - 1) / 12); const mm = ((idx - 1) % 12) + 1;
          if (scopeSet.has(yy + '-' + mm)) overlap++;
        }
        targetTotal += c.targetWon * overlap / c.totalMonths;
      });
      return targetTotal;
    }

    function renderUpfrontKPI() {
      const targetTotal = computeUpfrontTargetDynamic();
      const actualTotal = filteredData.filter(r => r.isUpfront).reduce((s,r) => s + r.amount, 0);
      const achieveRate = targetTotal > 0 ? (actualTotal / targetTotal * 100) : 0;

      document.getElementById('kpiUpfrontActual').innerText = formatCurrencyKorean(actualTotal);
      const badge = document.getElementById('kpiUpfrontAchieveBadge');
      if (badge) { badge.className = achieveRate >= 100 ? 'badge-growth up' : 'badge-growth down'; badge.innerText = targetTotal > 0 ? `${achieveRate.toFixed(1)}% 달성` : '계약 없음'; }
      const targetEok = (targetTotal / 1e8).toFixed(2);
      document.getElementById('kpiUpfrontSub').innerText = `계약금액 약 ${targetEok}억원(월할 추정치) 대비`;
    }

