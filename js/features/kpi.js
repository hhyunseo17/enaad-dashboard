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
        prevTargetData = prevYearFiltered.filter(r => isAdvMetricEligible(r));
      }

      const diffRev = totalRev - prevRev; const growthRate = prevRev > 0 ? (diffRev / prevRev) * 100 : 0; const diffFormatted = (diffRev >= 0 ? '+' : '') + formatCurrencyKorean(diffRev);
      if (selectedYears.length === 1) {
        document.getElementById('kpiYoYDiff').innerText = diffFormatted;
        const growthBadge = document.getElementById('kpiGrowthBadge');
        if (growthRate >= 0) { growthBadge.className = 'badge-growth up'; growthBadge.innerText = `+${growthRate.toFixed(1)}% ▲`; } else { growthBadge.className = 'badge-growth down'; growthBadge.innerText = `${growthRate.toFixed(1)}% ▼`; }
        growthBadge.style.display = 'inline-flex'; document.getElementById('kpiGrowthText').innerText = `작년 동기 (${formatCurrencyKoreanShort(prevRev)}) 대비`;
      } else { document.getElementById('kpiYoYDiff').innerText = '-'; document.getElementById('kpiGrowthBadge').style.display = 'none'; document.getElementById('kpiGrowthText').innerText = `단일 연도 선택 시 제공`; }

      renderUpfrontKPI();
      renderGoalKPI();

      const hasGeneralOrIMC = isAllCategoriesSelected || selectedCategories.includes('일반광고') || selectedCategories.includes('IMC');
      if (!hasGeneralOrIMC) {
        document.getElementById('kpiAvgRevPerAdv').innerText = `- 원`; document.getElementById('kpiAdvCountSub').innerText = `조건 해당 없음 (일반/IMC 전용)`;
        const advGrowthBadge = document.getElementById('kpiAdvGrowthBadge'); if (advGrowthBadge) advGrowthBadge.style.display = 'none';
        document.getElementById('kpiNewAdvCount').innerText = `- 개사`; document.getElementById('kpiNewAdvSub').innerText = `조건 해당 없음 (일반/IMC 전용)`; return; 
      } else { const advGrowthBadge = document.getElementById('kpiAdvGrowthBadge'); if (advGrowthBadge) advGrowthBadge.style.display = 'inline-flex'; }

      const targetData = filteredData.filter(r => isAdvMetricEligible(r));
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

    // 목표 KPI/차트 공용 연-월 스코프. 월을 명시적으로 선택했으면 그대로 쓰지만,
    // "전체"(미선택)일 때는 연도별로 무조건 1~12월을 다 넣지 않고 그 연도에 실제 실적 데이터가
    // 있는 월까지만 스코프에 넣는다 — 그렇지 않으면 진행 중인 연도(예: 아직 8월까지만 실적이 쌓인 26년)를
    // "전체"로 볼 때 9~12월치 목표까지 분모에 끼어들어 달성률이 실제보다 낮게 나온다.
    function buildGoalScopeSet() {
      const scopeYears = selectedYears.length > 0 ? selectedYears : [...new Set(rawData.map(r => r.year))];
      const scopeSet = new Set();
      if (selectedMonths.length > 0) {
        scopeYears.forEach(y => selectedMonths.forEach(m => scopeSet.add(y + '-' + m)));
        return scopeSet;
      }
      scopeYears.forEach(y => {
        const monthsWithData = new Set(rawData.filter(r => r.year === y && r.bonbuRevenueStatus === '본부매출').map(r => r.month));
        if (monthsWithData.size === 0) { for (let m = 1; m <= 12; m++) scopeSet.add(y + '-' + m); }
        else monthsWithData.forEach(m => scopeSet.add(y + '-' + m));
      });
      return scopeSet;
    }

    function computeRevenueTargetForScope() {
      // 선택된 연/월 스코프(미선택 시 실적 존재 월까지)와 겹치는 담당자×대분류 목표를 전부 합산 (본부 전체 합산 기준)
      const scopeSet = buildGoalScopeSet();
      return salesTargets
        .filter(t => scopeSet.has(t.year + '-' + t.month))
        .reduce((sum, t) => sum + t.targetWon, 0);
    }

    function computeRevenuePerformanceActualForScope() {
      // 목표가 부서/채널/대분류 축으로 쪼개져 있지 않으므로, 좌측 체크박스 필터와 무관하게
      // 본부매출 + 실적(취급고) + 선택 연/월 스코프로만 집계 (업프론트 KPI의 계약금액 집계와 동일 원칙)
      const scopeSet = buildGoalScopeSet();
      return rawData
        .filter(r => r.bonbuRevenueStatus === '본부매출' && r.revenueBasis === '실적' && scopeSet.has(r.year + '-' + r.month))
        .reduce((sum, r) => sum + r.amount, 0);
    }

    function renderGoalKPI() {
      const badge = document.getElementById('kpiGoalAchieveBadge');
      const annualEl = document.getElementById('kpiGoalAnnualProgress');
      if (revenueBasisMode === 'accounting') {
        document.getElementById('kpiGoalActual').innerText = '-';
        if (badge) badge.style.display = 'none';
        document.getElementById('kpiGoalSub').innerText = `회계기준 목표 미제공`;
        if (annualEl) annualEl.style.display = 'none';
        return;
      }

      const targetTotal = computeRevenueTargetForScope();
      const actualTotal = computeRevenuePerformanceActualForScope();
      const achieveRate = targetTotal > 0 ? (actualTotal / targetTotal * 100) : 0;

      // 본부 총 매출액 카드에 이미 금액이 있으니, 이 카드는 달성률(%)을 크게 보여주는 게 핵심.
      document.getElementById('kpiGoalActual').innerText = targetTotal > 0 ? `${achieveRate.toFixed(1)}%` : '-';
      if (badge) {
        // 미달일 때는 굳이 배지로 표 내지 않고, 달성했을 때만 강조 표시
        if (targetTotal > 0 && achieveRate >= 100) {
          badge.style.display = 'inline-flex'; badge.className = 'badge-growth up'; badge.innerText = '목표 달성 ▲';
        } else {
          badge.style.display = 'none';
        }
      }
      const targetEok = (targetTotal / 1e8).toFixed(2); const actualEok = (actualTotal / 1e8).toFixed(2);
      document.getElementById('kpiGoalSub').innerText = targetTotal > 0 ? `실적 ${actualEok}억 / 목표 ${targetEok}억원` : `실적 ${actualEok}억 (목표 미등록)`;

      // 연간 목표 대비 진도율: 단일 연도 선택 시에만 노출 (해당 기간 실적 ÷ 선택 연도 전체(12개월) 목표)
      if (annualEl) {
        if (selectedYears.length === 1) {
          annualEl.style.display = '';
          const annualTargetTotal = salesTargets
            .filter(t => t.year === selectedYears[0])
            .reduce((sum, t) => sum + t.targetWon, 0);
          if (annualTargetTotal > 0) {
            const annualRate = actualTotal / annualTargetTotal * 100;
            annualEl.innerText = `연간 목표 대비 진도율: ${annualRate.toFixed(1)}% (연간 목표 약 ${(annualTargetTotal / 1e8).toFixed(2)}억원)`;
          } else {
            annualEl.innerText = `연간 목표 미등록`;
          }
        } else {
          annualEl.style.display = 'none';
        }
      }
    }

    function renderGoalTrendChart() {
      // 선택된 연/월 스코프(전체면 실적 존재 월까지)의 월별 목표 대비 실적 추이 — 본부 전체 합산 기준
      const canvas = document.getElementById('chartGoalTrend');
      const placeholder = document.getElementById('chartGoalTrendPlaceholder');
      if (!canvas) return;

      if (revenueBasisMode === 'accounting') {
        if (chartInstances.goalTrend) { chartInstances.goalTrend.destroy(); chartInstances.goalTrend = null; }
        canvas.style.display = 'none';
        if (placeholder) placeholder.style.display = 'flex';
        return;
      }
      canvas.style.display = '';
      if (placeholder) placeholder.style.display = 'none';

      const ctx = canvas.getContext('2d'); if (chartInstances.goalTrend) chartInstances.goalTrend.destroy();

      const months = [...buildGoalScopeSet()].sort((a, b) => {
        const [ay, am] = a.split('-').map(Number); const [by, bm] = b.split('-').map(Number);
        return ay - by || am - bm;
      });
      const labels = months.map(ym => { const [y, m] = ym.split('-'); return `${y}-${String(m).padStart(2, '0')}`; });

      const actualVals = months.map(ym => {
        const [y, m] = ym.split('-').map(Number);
        return rawData.filter(r => r.bonbuRevenueStatus === '본부매출' && r.revenueBasis === '실적' && r.year === y && r.month === m)
          .reduce((s, r) => s + r.amount, 0) / 1e8;
      });
      const targetVals = months.map(ym => {
        const [y, m] = ym.split('-').map(Number);
        return salesTargets.filter(t => t.year === y && t.month === m).reduce((s, t) => s + t.targetWon, 0) / 1e8;
      });

      chartInstances.goalTrend = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: [
          // 목표/실적을 나란히 배치하되 barPercentage/categoryPercentage로 상당폭 겹치게(원래 두께는 유지) —
          // 실적(order 값이 더 큰 쪽, Chart.js는 order가 큰 데이터셋을 나중에 그려서 위로 오게 함)이 겹치는 부분에서 위로 보이게 한다.
          { label: '목표', data: targetVals, backgroundColor: chartColors.blue, borderRadius: 0, barPercentage: 1.5, categoryPercentage: 0.55, order: 1,
            datalabels: { display: false }
          },
          { label: '실적', data: actualVals, backgroundColor: chartColors.orange, borderRadius: 0, barPercentage: 1.5, categoryPercentage: 0.55, order: 2,
            datalabels: { display: 'auto', anchor: 'end', align: 'top', offset: 10, color: chartColors.orange, font: { family: 'Pretendard', size: 11, weight: '700' }, formatter: (v) => v > 0 ? v.toFixed(1) + '억' : '' }
          }
        ] },
        options: {
          responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24 } },
          plugins: {
            legend: { display: true, position: 'top', labels: { color: CH('#B0B8C1'), font: { family: 'Pretendard', size: 13, weight: '600' } } },
            tooltip: { callbacks: { title: (t) => `귀속월: ${t[0].label}`, label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(2)} 억원`,
                afterBody: (t) => {
                  const idx = t[0].dataIndex; const actual = actualVals[idx]; const target = targetVals[idx];
                  const rate = target > 0 ? (actual / target * 100).toFixed(1) + '%' : '-';
                  return [``, `달성률: ${rate}`];
                }
              }
            }
          },
          scales: { x: { ticks: { color: CH('#F2F4F6'), font: { family: 'Pretendard', size: 12, weight: '600' } }, grid: { display: false } }, y: { grace: '15%', ticks: { color: CH('#8B95A1'), callback: v => v + '억' }, grid: { color: CH('#21232A') } } }
        }
      });
    }

    function renderGoalBreakdownChart() {
      // 현재 선택된 연/월 스코프 기준 부서별/담당자별 목표 대비 실적 (좌측 체크박스 필터 미반영 — 목표가 그 축으로 안 쪼개지므로)
      const canvas = document.getElementById('chartGoalBreakdown');
      const placeholder = document.getElementById('chartGoalBreakdownPlaceholder');
      if (!canvas) return;

      if (revenueBasisMode === 'accounting') {
        if (chartInstances.goalBreakdown) { chartInstances.goalBreakdown.destroy(); chartInstances.goalBreakdown = null; }
        canvas.style.display = 'none';
        if (placeholder) placeholder.style.display = 'flex';
        return;
      }
      canvas.style.display = '';
      if (placeholder) placeholder.style.display = 'none';

      const ctx = canvas.getContext('2d'); if (chartInstances.goalBreakdown) chartInstances.goalBreakdown.destroy();

      const scopeSet = buildGoalScopeSet();
      const groupField = goalBreakdownMode === 'dept' ? 'dept' : 'manager';
      const groupLabelText = goalBreakdownMode === 'dept' ? '부서' : '담당자';

      const scopedTargets = salesTargets.filter(t => scopeSet.has(t.year + '-' + t.month));
      const scopedActuals = rawData.filter(r => r.bonbuRevenueStatus === '본부매출' && r.revenueBasis === '실적' && scopeSet.has(r.year + '-' + r.month));

      const groupSet = new Set();
      scopedTargets.forEach(t => { if (t[groupField]) groupSet.add(t[groupField]); });
      scopedActuals.forEach(r => { if (r[groupField]) groupSet.add(r[groupField]); });
      let groups = [...groupSet].filter(g => {
        const t = scopedTargets.filter(x => x[groupField] === g).reduce((s, x) => s + x.targetWon, 0);
        return t > 0; // 목표가 아예 없는 그룹만 제외 — 목표는 있는데 실적이 0인 경우(0% 달성)는 의미 있는 정보라 보여준다
      });

      if (goalBreakdownMode === 'dept') {
        groups.sort(compareDeptOrder);
      } else {
        // 담당자 모드: 목표+실적 합산 큰 순 정렬 (목표가 있는 담당자는 전부 포함, 별도 상한 없음)
        const sortKey = {};
        groups.forEach(g => {
          const t = scopedTargets.filter(x => x[groupField] === g).reduce((s, x) => s + x.targetWon, 0);
          const a = scopedActuals.filter(x => x[groupField] === g).reduce((s, x) => s + x.amount, 0);
          sortKey[g] = t + a;
        });
        groups.sort((a, b) => sortKey[b] - sortKey[a]);
      }

      const actualVals = groups.map(g => scopedActuals.filter(r => r[groupField] === g).reduce((s, r) => s + r.amount, 0) / 1e8);
      const targetVals = groups.map(g => scopedTargets.filter(t => t[groupField] === g).reduce((s, t) => s + t.targetWon, 0) / 1e8);

      chartInstances.goalBreakdown = new Chart(ctx, {
        type: 'bar',
        data: { labels: groups, datasets: [
          // 목표/실적을 나란히 배치하되 barPercentage/categoryPercentage로 상당폭 겹치게(원래 두께는 유지) —
          // 실적(order 값이 더 큼 → 나중에 그려짐)이 겹치는 부분에서 위로 오도록. 월별 추이 차트(파랑/주황)와
          // 구분되도록 이 차트는 회색/초록 유지.
          { label: '목표', data: targetVals, backgroundColor: '#8B95A1', borderRadius: 0, barPercentage: 1.5, categoryPercentage: 0.55, order: 1,
            datalabels: { display: false }
          },
          { label: '실적', data: actualVals, backgroundColor: chartColors.green, borderRadius: 0, barPercentage: 1.5, categoryPercentage: 0.55, order: 2,
            datalabels: { display: 'auto', anchor: 'end', align: 'top', clip: false,
              // 실적 막대 기준 10px만 띄우면 목표 막대가 더 클 때 그 목표 막대와 겹친다.
              // 두 막대 중 더 높은 쪽(대개 목표) 위로 라벨이 뜨도록 부족한 픽셀만큼 오프셋을 더한다.
              offset: (ctx) => {
                const idx = ctx.dataIndex; const yScale = ctx.chart.scales.y;
                const actual = actualVals[idx]; const target = targetVals[idx];
                const base = 10;
                if (target > actual) return base + Math.max(0, yScale.getPixelForValue(actual) - yScale.getPixelForValue(target));
                return base;
              },
              color: chartColors.green, font: { family: 'Pretendard', size: 11, weight: '700' }, formatter: (v) => v > 0 ? v.toFixed(1) + '억' : '' }
          }
        ] },
        options: {
          responsive: true, maintainAspectRatio: false, layout: { padding: { top: 40 } },
          plugins: {
            legend: { display: true, position: 'top', labels: { color: CH('#B0B8C1'), font: { family: 'Pretendard', size: 13, weight: '600' } } },
            tooltip: { callbacks: { title: (t) => `${groupLabelText}: ${t[0].label}`, label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(2)} 억원`,
                afterBody: (t) => {
                  const idx = t[0].dataIndex; const actual = actualVals[idx]; const target = targetVals[idx];
                  const rate = target > 0 ? (actual / target * 100).toFixed(1) + '%' : '-';
                  return [``, `달성률: ${rate}`];
                }
              }
            }
          },
          scales: { x: { ticks: { color: CH('#F2F4F6'), font: { family: 'Pretendard', size: 12, weight: '600' } }, grid: { display: false } }, y: { grace: '30%', ticks: { color: CH('#8B95A1'), callback: v => v + '억' }, grid: { color: CH('#21232A') } } }
        }
      });
    }

