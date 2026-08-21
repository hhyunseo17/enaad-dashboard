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
      let newAdvCount = 0; Object.values(advMonthlyMapNew).forEach(item => { if (item.amount > 0 && isNewAdvertiserMonth(item.advertiser, item.monthStr)) newAdvCount++; });

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

    // 연도가 바뀌면 0에서 다시 쌓는다. 목표가 연 단위로 편성되므로 "연초부터 얼마나 왔는가"가
    // 읽는 값이고, 2025+2026을 함께 볼 때 24개월을 통으로 누적하면 연도 간 비교가 불가능해진다.
    // months는 renderGoalTrendChart()에서 이미 연·월 오름차순으로 정렬된 'y-m' 배열이다.
    function cumulativeByYear(months, vals) {
      let runningYear = null; let running = 0;
      return months.map((ym, i) => {
        const y = ym.split('-')[0];
        if (y !== runningYear) { runningYear = y; running = 0; }
        running += vals[i];
        return running;
      });
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

      let actualVals = months.map(ym => {
        const [y, m] = ym.split('-').map(Number);
        return rawData.filter(r => r.bonbuRevenueStatus === '본부매출' && r.revenueBasis === '실적' && r.year === y && r.month === m)
          .reduce((s, r) => s + r.amount, 0) / 1e8;
      });
      let targetVals = months.map(ym => {
        const [y, m] = ym.split('-').map(Number);
        return salesTargets.filter(t => t.year === y && t.month === m).reduce((s, t) => s + t.targetWon, 0) / 1e8;
      });

      const isCumulative = goalTrendMode === 'cumulative';
      if (isCumulative) {
        actualVals = cumulativeByYear(months, actualVals);
        targetVals = cumulativeByYear(months, targetVals);
      }
      const seriesPrefix = isCumulative ? '누적 ' : '';

      chartInstances.goalTrend = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: [
          // 목표/실적 둘 다 같은 두께의 얇은 막대로 나란히(안 겹치게) 배치.
          // 색 역할 규칙: 기준(목표)은 중립 회색, 현재(실적)는 강조색. 두 목표 차트가 동일 규칙을 쓴다.
          { label: seriesPrefix + '목표', data: targetVals, backgroundColor: ddBarFill(RC('ref')), borderRadius: 5, ...ddGroupSeparator(), barPercentage: 1, categoryPercentage: 0.8,
            datalabels: { display: false }
          },
          { label: seriesPrefix + '실적', data: actualVals, backgroundColor: ddDuoFill(...ddDuoPair()), borderRadius: 5, ...ddGroupSeparator(), barPercentage: 1, categoryPercentage: 0.8,
            datalabels: { display: 'auto', anchor: 'end', align: 'top', offset: 6, color: dataLabelTextColor(), font: { size: 11, weight: '400' }, formatter: (v) => v > 0 ? v.toFixed(1) + '억' : '' }
          }
        ] },
        options: {
          responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24 } },
          plugins: {
            legend: { display: true, position: 'top', labels: { color: CH('#B0B8C1'), font: { size: 12, weight: '400' } } },
            tooltip: { callbacks: { title: (t) => `귀속월: ${t[0].label}${isCumulative ? ' (연초부터 누적)' : ''}`, label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(2)} 억원`,
                afterBody: (t) => {
                  const idx = t[0].dataIndex; const actual = actualVals[idx]; const target = targetVals[idx];
                  const rate = target > 0 ? (actual / target * 100).toFixed(1) + '%' : '-';
                  return [``, `${isCumulative ? '누적 달성률' : '달성률'}: ${rate}`];
                }
              }
            }
          },
          scales: { x: { ticks: { color: CH('#F2F4F6'), font: { size: 12, weight: '400' } }, grid: { display: false } }, y: ddValueAxis({ ticks: { color: CH('#8B95A1'), maxTicksLimit: 5, padding: 6, callback: v => v + '억' } }) }
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
          // 목표/실적 둘 다 같은 두께의 얇은 막대로 나란히(안 겹치게) 배치.
          // 월별 목표 차트와 같은 색 규칙을 쓴다 — 예전엔 두 차트가 서로 다른 색 쌍(파랑/주황 vs 회색/초록)이었다.
          { label: '목표', data: targetVals, backgroundColor: ddBarFill(RC('ref')), borderRadius: 5, ...ddGroupSeparator(), barPercentage: 1, categoryPercentage: 0.8,
            datalabels: { display: false }
          },
          { label: '실적', data: actualVals, backgroundColor: ddDuoFill(...ddDuoPair()), borderRadius: 5, ...ddGroupSeparator(), barPercentage: 1, categoryPercentage: 0.8,
            datalabels: { display: 'auto', anchor: 'end', align: 'top', offset: 6, color: dataLabelTextColor(), font: { size: 11, weight: '400' }, formatter: (v) => v > 0 ? v.toFixed(1) + '억' : '' }
          }
        ] },
        options: {
          responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24 } },
          plugins: {
            legend: { display: true, position: 'top', labels: { color: CH('#B0B8C1'), font: { size: 12, weight: '400' } } },
            tooltip: { callbacks: { title: (t) => `${groupLabelText}: ${t[0].label}`, label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(2)} 억원`,
                afterBody: (t) => {
                  const idx = t[0].dataIndex; const actual = actualVals[idx]; const target = targetVals[idx];
                  const rate = target > 0 ? (actual / target * 100).toFixed(1) + '%' : '-';
                  return [``, `달성률: ${rate}`];
                }
              }
            }
          },
          scales: { x: { ticks: { color: CH('#F2F4F6'), font: { size: 12, weight: '400' } }, grid: { display: false } }, y: ddValueAxis({ ticks: { color: CH('#8B95A1'), maxTicksLimit: 5, padding: 6, callback: v => v + '억' } }) }
        }
      });
    }

    // ==========================================================================
    // 목표 대비 실적 피벗 (월별 / 부서별) — 위 두 차트의 카드 클릭으로 진입
    //
    // 두 피벗은 행 축만 다르고 열 축·집계 규칙은 완전히 같아 아래 공용 함수를 나눠 쓴다.
    // **연결된 차트와 숫자가 어긋나면 안 되므로** 스코프·필터 규칙을 renderGoalTrendChart()/
    // renderGoalBreakdownChart()와 동일하게 유지한다:
    //   - 기간: buildGoalScopeSet() (월 미선택 시 실적이 있는 월까지만 — 진행 중 연도의 달성률 왜곡 방지)
    //   - 대상: 본부매출 + 실적(취급고)만. 회계조정 행 제외
    //   - **좌측 체크박스 필터(부서/채널/방송·디지털/대분류·대행사·광고주 검색)는 반영하지 않는다.**
    //     목표(salesTargets)가 그 축들로 쪼개져 있지 않아, 필터를 걸면 실적만 줄고 목표는 그대로라
    //     달성률이 거짓으로 낮아진다. 차트도 같은 이유로 미반영이며, 화면 상단에 그 사실을 명시한다.
    // 금액 단위는 다른 피벗과 같이 백만원. 달성률은 실적합÷목표합이다(개별 달성률의 평균이 아니다).
    // ==========================================================================

    // 열 축(연/월). 실적이 아직 없어도 목표가 있는 월은 열로 세워야 "목표는 있는데 실적 0"이
    // 보인다 — buildGoalScopeSet()이 이미 그 범위를 준다.
    function buildGoalPivotAxis() {
      const scopeSet = buildGoalScopeSet();
      const yearMonthsMap = {};
      scopeSet.forEach(ym => {
        const [y, m] = ym.split('-').map(Number);
        if (!yearMonthsMap[y]) yearMonthsMap[y] = [];
        yearMonthsMap[y].push(m);
      });
      const years = Object.keys(yearMonthsMap).map(Number).sort((a, b) => b - a);
      years.forEach(y => yearMonthsMap[y].sort((a, b) => a - b));
      return { scopeSet, years, yearMonthsMap };
    }

    function goalPivotSourceRows(scopeSet) {
      return {
        targets: salesTargets.filter(t => scopeSet.has(t.year + '-' + t.month)),
        actuals: rawData.filter(r => r.bonbuRevenueStatus === '본부매출' && r.revenueBasis === '실적' && scopeSet.has(r.year + '-' + r.month))
      };
    }

    function goalNode() { return { t: 0, a: 0, yrs: {} }; }
    function goalAddToNode(node, yr, m, tAmt, aAmt) {
      node.t += tAmt; node.a += aAmt;
      if (!node.yrs[yr]) node.yrs[yr] = { t: 0, a: 0, m: {} };
      node.yrs[yr].t += tAmt; node.yrs[yr].a += aAmt;
      if (!node.yrs[yr].m[m]) node.yrs[yr].m[m] = { t: 0, a: 0 };
      node.yrs[yr].m[m].t += tAmt; node.yrs[yr].m[m].a += aAmt;
    }

    function goalMetricThs(cls) { const c = cls ? ` class="${cls}"` : ''; return `<th${c}>목표</th><th${c}>실적</th><th${c}>달성률</th>`; }

    // 헤더 3줄: 연도 → 월 → 목표/실적/달성률. 다른 피벗은 2줄이라 이 두 표만 .pivot-tri-header를 단다.
    function goalPivotHeaderHtml(viewType, years, yearMonthsMap, expandedMap, rowLabel, labelMinWidth) {
      let h1 = `<th rowspan="3" style="text-align:left; min-width:${labelMinWidth}px; vertical-align:middle;">${rowLabel}</th>`;
      let h2 = '', h3 = '';
      years.forEach(yr => {
        const isExp = expandedMap[yr] !== false;
        const months = yearMonthsMap[yr] || [];
        const groupCount = isExp ? months.length + 1 : 1; // +1 = 연 요약
        h1 += `<th colspan="${groupCount * 3}"><span class="year-toggle-btn" onclick="toggleYearColumn('${viewType}', ${yr})">${isExp ? '-' : '+'}</span> ${yr}년</th>`;
        if (isExp) months.forEach(m => { h2 += `<th colspan="3">${m}월</th>`; h3 += goalMetricThs(''); });
        h2 += `<th colspan="3" class="pv-th-summary">${yr}년 요약</th>`; h3 += goalMetricThs('pv-th-summary');
      });
      h1 += `<th colspan="3" rowspan="2" class="pv-th-total" style="z-index:35;">총합계</th>`;
      h3 += goalMetricThs('pv-th-total');
      return { h1: h1, h2: h2, h3: h3 };
    }

    // 목표/실적/달성률 3칸. 달성률 색은 피벗 색표(PIVOT_COLOR_MAP)에 이미 있는 증감색을 그대로 쓴다.
    function goalTriCells(v, fontW, bg) {
      const t = v ? v.t : 0; const a = v ? v.a : 0;
      const rate = t > 0 ? (a / t * 100) : null;
      const rateStyle = rate === null ? '' : (rate >= 100 ? 'color:#4ADE80;' : 'color:#F87171;');
      const num = (x) => Math.abs(x) >= 0.5 ? Math.round(x).toLocaleString() : '-';
      return `<td style="text-align:right; font-weight:${fontW}; ${bg}">${num(t)}</td>`
        + `<td style="text-align:right; font-weight:${fontW}; ${bg}">${num(a)}</td>`
        + `<td style="text-align:right; font-weight:${fontW}; ${bg}${rateStyle}">${rate === null ? '-' : rate.toFixed(1) + '%'}</td>`;
    }

    function goalCellsHtml(node, years, yearMonthsMap, expandedMap, fontW) {
      let cells = '';
      years.forEach(yr => {
        const isExp = expandedMap[yr] !== false;
        const yrObj = (node && node.yrs[yr]) ? node.yrs[yr] : { t: 0, a: 0, m: {} };
        if (isExp) (yearMonthsMap[yr] || []).forEach(m => { cells += goalTriCells(yrObj.m[m], fontW, ''); });
        cells += goalTriCells(yrObj, fontW, 'background:rgba(30,58,138,0.1);');
      });
      cells += goalTriCells(node, fontW, 'background:rgba(30,64,175,0.2);');
      return cells;
    }

    // 회계기준에는 목표가 없어 표 자체가 성립하지 않는다(차트도 동일하게 placeholder를 띄운다).
    function renderGoalPivotUnavailable(prefix) {
      document.getElementById(prefix + 'HeaderRow1').innerHTML = `<th style="text-align:left;">구분</th>`;
      document.getElementById(prefix + 'HeaderRow2').innerHTML = '';
      document.getElementById(prefix + 'HeaderRow3').innerHTML = '';
      document.getElementById(prefix + 'TableBody').innerHTML = `<tr><td style="text-align:center; padding:30px; color:var(--text-tertiary);">취급고 기준에서만 제공됩니다</td></tr>`;
    }

    function goalRateText(t, a) { return t > 0 ? (a / t * 100).toFixed(1) + '%' : '-'; }

    // ── 월별 목표 대비 실적 피벗 — 행: 대분류 ────────────────────────────────
    function renderGoalTrendPivotTable() {
      if (revenueBasisMode === 'accounting') { renderGoalPivotUnavailable('goalTrendPivot'); document.getElementById('goalTrendPivotTotal').innerText = '-'; return; }

      const axis = buildGoalPivotAxis(); const years = axis.years; const yearMonthsMap = axis.yearMonthsMap;
      const src = goalPivotSourceRows(axis.scopeSet);
      const expandedMap = expandedGoalTrendYearColumns;

      const hdr = goalPivotHeaderHtml('goalTrend', years, yearMonthsMap, expandedMap, '대분류', 200);
      document.getElementById('goalTrendPivotHeaderRow1').innerHTML = mapPivotHtml(hdr.h1);
      document.getElementById('goalTrendPivotHeaderRow2').innerHTML = mapPivotHtml(hdr.h2);
      document.getElementById('goalTrendPivotHeaderRow3').innerHTML = mapPivotHtml(hdr.h3);

      const tree = {}; const grand = goalNode();
      const ensure = (cat) => { if (!tree[cat]) tree[cat] = goalNode(); return tree[cat]; };
      src.targets.forEach(t => { const cat = t.categoryReclassified || '기타광고'; goalAddToNode(ensure(cat), t.year, t.month, t.targetWon / 1e6, 0); goalAddToNode(grand, t.year, t.month, t.targetWon / 1e6, 0); });
      src.actuals.forEach(r => { const cat = r.categoryReclassified || '기타광고'; goalAddToNode(ensure(cat), r.year, r.month, 0, r.amount / 1e6); goalAddToNode(grand, r.year, r.month, 0, r.amount / 1e6); });

      const cats = Object.keys(tree).sort(compareGoalCategoryOrder);

      let html = '';
      cats.forEach(cat => {
        html += `<tr><td class="indent-step-1" style="background:#1E293B; color:#F8FAFC; font-weight:700;">${cat}</td>${goalCellsHtml(tree[cat], years, yearMonthsMap, expandedMap, '600')}</tr>`;
      });
      html += `<tr class="row-grand-total"><td class="indent-step-1">총합계</td>${goalCellsHtml(grand, years, yearMonthsMap, expandedMap, '500')}</tr>`;
      document.getElementById('goalTrendPivotTableBody').innerHTML = mapPivotHtml(html);
      document.getElementById('goalTrendPivotTotal').innerText = goalRateText(grand.t, grand.a);
    }

    // ── 목표 피벗 엑셀 다운로드 ──────────────────────────────────────────────
    // 화면의 넓은 표(연×월×3지표)를 그대로 옮기지 않고, 다른 피벗 export와 같은 **롱 포맷**
    // (한 행 = 한 연월×축 조합)으로 내보낸다. exportPivotExcel()의 기존 시트들과 형식이 같아야
    // 엑셀에서 다시 피벗을 돌릴 수 있고, 병합 헤더는 피벗 원본으로 쓸 수 없다.
    //
    // 금액은 **백만원 소수 1자리**(CLAUDE.md 금액 표기 규칙). 기존 export 시트들은 정수로 반올림하지만
    // 여기서는 행이 연월×부서×담당자×대분류까지 잘게 쪼개져(2026년 기준 248행) 행마다 버린 소수가
    // 합계에서 8백만원까지 어긋났다. 엑셀에서 다시 합산해 대시보드와 대조하는 표라 그 오차가 그대로
    // 눈에 띈다. 소수 1자리면 같은 조건에서 오차가 1백만원 미만으로 떨어진다.
    // 달성률은 소수 1자리 숫자(목표 0이면 빈칸).
    function exportGoalPivotExcel(kind) {
      if (revenueBasisMode === 'accounting') { alert('목표 대비 실적은 취급고 기준에서만 제공됩니다.'); return; }

      const axis = buildGoalPivotAxis();
      const src = goalPivotSourceRows(axis.scopeSet);
      const isDept = kind === 'dept';

      // 키: 연|월|(부서|담당자|)대분류
      const map = {};
      const keyOf = (y, m, dept, mgr, cat) => isDept ? `${y}|${m}|${dept}|${mgr}|${cat}` : `${y}|${m}|${cat}`;
      const ensure = (y, m, dept, mgr, cat) => {
        const k = keyOf(y, m, dept, mgr, cat);
        if (!map[k]) map[k] = { y: y, m: m, dept: dept, mgr: mgr, cat: cat, t: 0, a: 0 };
        return map[k];
      };
      src.targets.forEach(t => { ensure(t.year, t.month, t.dept || '(미지정)', t.manager || '(미지정)', t.categoryReclassified || '기타광고').t += t.targetWon; });
      src.actuals.forEach(r => { ensure(r.year, r.month, r.dept || '(미지정)', r.manager || '(미지정)', r.categoryReclassified || '기타광고').a += r.amount; });

      const list = Object.values(map).filter(v => v.t !== 0 || v.a !== 0);
      if (list.length === 0) { alert('다운로드할 데이터가 없습니다.'); return; }
      list.sort((x, y2) => x.y - y2.y || x.m - y2.m
        || (isDept ? (compareDeptOrder(x.dept, y2.dept) || x.mgr.localeCompare(y2.mgr)) : 0)
        || compareGoalCategoryOrder(x.cat, y2.cat));

      const exportRows = list.map(v => {
        const row = { '연도': v.y, '귀속월': `${v.y}-${String(v.m).padStart(2, '0')}` };
        if (isDept) { row['부서'] = v.dept; row['담당자'] = v.mgr; }
        row['대분류'] = v.cat;
        row['목표(백만원)'] = Number((v.t / 1e6).toFixed(1));
        row['실적(백만원)'] = Number((v.a / 1e6).toFixed(1));
        row['달성률(%)'] = v.t > 0 ? Number((v.a / v.t * 100).toFixed(1)) : '';
        return row;
      });

      const sheetName = isDept ? '부서별목표대비실적' : '월별목표대비실적';
      const ws = XLSX.utils.json_to_sheet(exportRows); const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, `KT_ENA_${sheetName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }

    // 5대분류 고정 순서. 목록에 없는 값이 들어오면(데이터 이상) 뒤에 이름순으로 붙인다.
    function compareGoalCategoryOrder(a, b) {
      const ia = categoryOrderList.indexOf(a); const ib = categoryOrderList.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1 || ib !== -1) return ia !== -1 ? -1 : 1;
      return a.localeCompare(b);
    }

    // ── 부서별 목표 대비 실적 피벗 — 행: 부서 → 담당자 → 대분류 ──────────────
    function renderGoalDeptPivotTable() {
      if (revenueBasisMode === 'accounting') { renderGoalPivotUnavailable('goalDeptPivot'); document.getElementById('goalDeptPivotTotal').innerText = '-'; return; }

      const axis = buildGoalPivotAxis(); const years = axis.years; const yearMonthsMap = axis.yearMonthsMap;
      const src = goalPivotSourceRows(axis.scopeSet);
      const expandedMap = expandedGoalDeptYearColumns;

      const hdr = goalPivotHeaderHtml('goalDept', years, yearMonthsMap, expandedMap, '부서 → 담당자 → 대분류', 300);
      document.getElementById('goalDeptPivotHeaderRow1').innerHTML = mapPivotHtml(hdr.h1);
      document.getElementById('goalDeptPivotHeaderRow2').innerHTML = mapPivotHtml(hdr.h2);
      document.getElementById('goalDeptPivotHeaderRow3').innerHTML = mapPivotHtml(hdr.h3);

      const tree = {}; const grand = goalNode();
      const ensure = (l1, l2, l3) => {
        if (!tree[l1]) tree[l1] = { node: goalNode(), subs: {} };
        if (!tree[l1].subs[l2]) tree[l1].subs[l2] = { node: goalNode(), subs: {} };
        if (!tree[l1].subs[l2].subs[l3]) tree[l1].subs[l2].subs[l3] = { node: goalNode() };
        return [tree[l1].node, tree[l1].subs[l2].node, tree[l1].subs[l2].subs[l3].node, grand];
      };
      src.targets.forEach(t => ensure(t.dept || '(미지정)', t.manager || '(미지정)', t.categoryReclassified || '기타광고')
        .forEach(n => goalAddToNode(n, t.year, t.month, t.targetWon / 1e6, 0)));
      src.actuals.forEach(r => ensure(r.dept || '(미지정)', r.manager || '(미지정)', r.categoryReclassified || '기타광고')
        .forEach(n => goalAddToNode(n, r.year, r.month, 0, r.amount / 1e6)));

      let html = '';
      Object.keys(tree).sort(compareDeptOrder).forEach(l1 => {
        const isL1Exp = !!expandedGoalDeptPivot[l1];
        html += `<tr><td class="indent-step-1" style="background:#1E293B; color:#F8FAFC; font-weight:700;"><span class="toggle-icon" onclick="toggleGoalDeptPivotNode('${l1}')">${isL1Exp ? '-' : '+'}</span>${l1}</td>${goalCellsHtml(tree[l1].node, years, yearMonthsMap, expandedMap, '700')}</tr>`;
        if (!isL1Exp) return;
        // 담당자는 목표+실적 합이 큰 순 (부서만 팀 번호 순서를 따른다)
        const l2Keys = Object.keys(tree[l1].subs).sort((a, b) => (tree[l1].subs[b].node.t + tree[l1].subs[b].node.a) - (tree[l1].subs[a].node.t + tree[l1].subs[a].node.a));
        l2Keys.forEach(l2 => {
          const isL2Exp = !!expandedGoalDeptPivot[`${l1}||${l2}`];
          html += `<tr><td class="indent-step-2" style="background:#151C2C; color:#CBD5E1; font-weight:700;"><span class="toggle-icon" onclick="toggleGoalDeptPivotNode('${l1}','${l2}')">${isL2Exp ? '-' : '+'}</span>${l2}</td>${goalCellsHtml(tree[l1].subs[l2].node, years, yearMonthsMap, expandedMap, '600')}</tr>`;
          if (!isL2Exp) return;
          Object.keys(tree[l1].subs[l2].subs).sort(compareGoalCategoryOrder).forEach(l3 => {
            html += `<tr><td class="indent-step-3" style="background:#11151F; color:#94A3B8;">${l3}</td>${goalCellsHtml(tree[l1].subs[l2].subs[l3].node, years, yearMonthsMap, expandedMap, '400')}</tr>`;
          });
        });
      });
      html += `<tr class="row-grand-total"><td class="indent-step-1">총합계</td>${goalCellsHtml(grand, years, yearMonthsMap, expandedMap, '500')}</tr>`;
      document.getElementById('goalDeptPivotTableBody').innerHTML = mapPivotHtml(html);
      document.getElementById('goalDeptPivotTotal').innerText = goalRateText(grand.t, grand.a);
    }

