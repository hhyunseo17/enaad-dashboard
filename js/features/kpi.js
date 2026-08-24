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

    // 목표가 실제로 등록된 연-월 집합. 목표 합이 0인 달은 분모가 될 수 없으므로 제외한다.
    function buildRegisteredTargetMonthSet() {
      const sums = {};
      salesTargets.forEach(t => { const k = t.year + '-' + t.month; sums[k] = (sums[k] || 0) + t.targetWon; });
      const set = new Set();
      Object.keys(sums).forEach(k => { if (sums[k] > 0) set.add(k); });
      return set;
    }

    // 목표 KPI/차트/피벗 공용 연-월 스코프. 월을 명시적으로 선택했으면 그대로 쓰지만,
    // "전체"(미선택)일 때는 연도별로 무조건 1~12월을 다 넣지 않고 그 연도에 실제 실적 데이터가
    // 있는 월까지만 스코프에 넣는다 — 그렇지 않으면 진행 중인 연도(예: 아직 8월까지만 실적이 쌓인 26년)를
    // "전체"로 볼 때 9~12월치 목표까지 분모에 끼어들어 달성률이 실제보다 낮게 나온다.
    //
    // 그리고 마지막에 **목표가 등록된 연-월만 남긴다.** 반대 방향의 같은 왜곡을 막기 위한 것이다:
    // 목표는 2023년부터 등록돼 있는데 실적은 2019년부터 있어서, 연/월을 아무것도 선택하지 않으면
    // 2019~2022 실적이 분자에만 들어가 달성률이 138.3%로 부풀려졌다. 목표가 없는 기간은 "달성"을
    // 따질 수 있는 구간이 아니므로 분자·분모 양쪽에서 함께 뺀다.
    // (스코프가 비면 달성률을 계산하지 않고 KPI·차트·피벗 모두 "등록된 목표 없음"으로 비운다.)
    function buildGoalScopeSet() {
      const scopeYears = selectedYears.length > 0 ? selectedYears : [...new Set(rawData.map(r => r.year))];
      const rawScope = new Set();
      if (selectedMonths.length > 0) {
        scopeYears.forEach(y => selectedMonths.forEach(m => rawScope.add(y + '-' + m)));
      } else {
        scopeYears.forEach(y => {
          const monthsWithData = new Set(rawData.filter(r => r.year === y && r.bonbuRevenueStatus === '본부매출').map(r => r.month));
          if (monthsWithData.size === 0) { for (let m = 1; m <= 12; m++) rawScope.add(y + '-' + m); }
          else monthsWithData.forEach(m => rawScope.add(y + '-' + m));
        });
      }

      const registered = buildRegisteredTargetMonthSet();
      const scopeSet = new Set();
      rawScope.forEach(ym => { if (registered.has(ym)) scopeSet.add(ym); });
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
      // 목표가 등록된 연월이 스코프에 하나도 없으면 달성률을 계산하지 않는다. 예전에는 이때도
      // 실적 금액을 띄웠는데, 옆에 목표가 없으니 "무엇 대비"인지 알 수 없는 숫자였다.
      const targetEok = (targetTotal / 1e8).toFixed(2); const actualEok = (actualTotal / 1e8).toFixed(2);
      document.getElementById('kpiGoalSub').innerText = targetTotal > 0 ? `실적 ${actualEok}억 / 목표 ${targetEok}억원` : `선택 기간에 등록된 목표 없음`;

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

    // 차트를 지우고 안내 문구만 남긴다(회계기준 / 목표 미등록 두 경우 공용).
    function showGoalChartPlaceholder(canvas, placeholder, chartKey, message) {
      if (chartInstances[chartKey]) { chartInstances[chartKey].destroy(); chartInstances[chartKey] = null; }
      canvas.style.display = 'none';
      if (placeholder) { placeholder.innerText = message; placeholder.style.display = 'flex'; }
    }
    const GOAL_NO_TARGET_MSG = '선택 기간에 등록된 목표가 없습니다';

    function renderGoalTrendChart() {
      // 선택된 연/월 스코프(전체면 실적 존재 월까지, 그중 목표가 등록된 월만)의 월별 목표 대비 실적 추이
      const canvas = document.getElementById('chartGoalTrend');
      const placeholder = document.getElementById('chartGoalTrendPlaceholder');
      if (!canvas) return;

      if (revenueBasisMode === 'accounting') { showGoalChartPlaceholder(canvas, placeholder, 'goalTrend', '취급고 기준에서만 제공됩니다'); return; }

      const months = [...buildGoalScopeSet()].sort((a, b) => {
        const [ay, am] = a.split('-').map(Number); const [by, bm] = b.split('-').map(Number);
        return ay - by || am - bm;
      });
      if (months.length === 0) { showGoalChartPlaceholder(canvas, placeholder, 'goalTrend', GOAL_NO_TARGET_MSG); return; }

      canvas.style.display = '';
      if (placeholder) placeholder.style.display = 'none';
      const ctx = canvas.getContext('2d'); if (chartInstances.goalTrend) chartInstances.goalTrend.destroy();
      const labels = months.map(ym => { const [y, m] = ym.split('-'); return `${y}-${String(m).padStart(2, '0')}`; });

      // 집계·누적은 원 단위로 하고, 억 환산은 차트에 넘기기 직전 한 번만 한다.
      let actualWon = months.map(ym => {
        const [y, m] = ym.split('-').map(Number);
        return rawData.filter(r => r.bonbuRevenueStatus === '본부매출' && r.revenueBasis === '실적' && r.year === y && r.month === m)
          .reduce((s, r) => s + r.amount, 0);
      });
      let targetWon = months.map(ym => {
        const [y, m] = ym.split('-').map(Number);
        return salesTargets.filter(t => t.year === y && t.month === m).reduce((s, t) => s + t.targetWon, 0);
      });

      const isCumulative = goalTrendMode === 'cumulative';
      if (isCumulative) {
        actualWon = cumulativeByYear(months, actualWon);
        targetWon = cumulativeByYear(months, targetWon);
      }
      const seriesPrefix = isCumulative ? '누적 ' : '';
      const actualVals = actualWon.map(v => v / 1e8);
      const targetVals = targetWon.map(v => v / 1e8);

      chartInstances.goalTrend = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: [
          // 목표/실적 둘 다 같은 두께의 얇은 막대로 나란히(안 겹치게) 배치.
          // 색 역할 규칙: 기준(목표)은 중립 회색, 현재(실적)는 강조색. 두 목표 차트가 동일 규칙을 쓴다.
          { label: seriesPrefix + '목표', data: targetVals, backgroundColor: ddBarFill(RC('ref')), borderRadius: 5, ...ddGroupSeparator(), barPercentage: 1, categoryPercentage: 0.8,
            datalabels: { display: false }
          },
          { label: seriesPrefix + '실적', data: actualVals, backgroundColor: ddDuoFill(...ddDuoPair()), borderRadius: 5, ...ddGroupSeparator(), barPercentage: 1, categoryPercentage: 0.8,
            datalabels: { display: 'auto', anchor: 'end', align: 'top', offset: 6, color: dataLabelTextColor(), font: { size: 11, weight: FW() }, formatter: (v) => v > 0 ? v.toFixed(1) + '억' : '' }
          }
        ] },
        options: {
          responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24 } },
          plugins: {
            legend: { display: true, position: 'top', labels: { color: CH('#B0B8C1'), font: { size: 12, weight: FW() } } },
            tooltip: { callbacks: { title: (t) => `귀속월: ${t[0].label}${isCumulative ? ' (연초부터 누적)' : ''}`, label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(2)} 억원`,
                afterBody: (t) => {
                  const idx = t[0].dataIndex; const actual = actualVals[idx]; const target = targetVals[idx];
                  const rate = target > 0 ? (actual / target * 100).toFixed(1) + '%' : '-';
                  return [``, `${isCumulative ? '누적 달성률' : '달성률'}: ${rate}`];
                }
              }
            }
          },
          scales: { x: { ticks: { color: CH('#F2F4F6'), font: { size: 12, weight: FW() } }, grid: { display: false } }, y: ddValueAxis({ ticks: { color: CH('#8B95A1'), maxTicksLimit: 5, padding: 6, callback: v => v + '억' } }) }
        }
      });
    }

    function renderGoalBreakdownChart() {
      // 현재 선택된 연/월 스코프 기준 부서별/담당자별 목표 대비 실적 (좌측 체크박스 필터 미반영 — 목표가 그 축으로 안 쪼개지므로)
      const canvas = document.getElementById('chartGoalBreakdown');
      const placeholder = document.getElementById('chartGoalBreakdownPlaceholder');
      if (!canvas) return;

      if (revenueBasisMode === 'accounting') { showGoalChartPlaceholder(canvas, placeholder, 'goalBreakdown', '취급고 기준에서만 제공됩니다'); return; }

      const scopeSet = buildGoalScopeSet();
      if (scopeSet.size === 0) { showGoalChartPlaceholder(canvas, placeholder, 'goalBreakdown', GOAL_NO_TARGET_MSG); return; }

      canvas.style.display = '';
      if (placeholder) placeholder.style.display = 'none';
      const ctx = canvas.getContext('2d'); if (chartInstances.goalBreakdown) chartInstances.goalBreakdown.destroy();

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
            datalabels: { display: 'auto', anchor: 'end', align: 'top', offset: 6, color: dataLabelTextColor(), font: { size: 11, weight: FW() }, formatter: (v) => v > 0 ? v.toFixed(1) + '억' : '' }
          }
        ] },
        options: {
          responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24 } },
          plugins: {
            legend: { display: true, position: 'top', labels: { color: CH('#B0B8C1'), font: { size: 12, weight: FW() } } },
            tooltip: { callbacks: { title: (t) => `${groupLabelText}: ${t[0].label}`, label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(2)} 억원`,
                afterBody: (t) => {
                  const idx = t[0].dataIndex; const actual = actualVals[idx]; const target = targetVals[idx];
                  const rate = target > 0 ? (actual / target * 100).toFixed(1) + '%' : '-';
                  return [``, `달성률: ${rate}`];
                }
              }
            }
          },
          scales: { x: { ticks: { color: CH('#F2F4F6'), font: { size: 12, weight: FW() } }, grid: { display: false } }, y: ddValueAxis({ ticks: { color: CH('#8B95A1'), maxTicksLimit: 5, padding: 6, callback: v => v + '억' } }) }
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

    // 열 축의 값은 filteredData가 아니라 **목표 스코프**에서 나온다. 실적이 아직 없어도 목표가 있는
    // 달은 열로 세워야 "목표는 있는데 실적 0"이 보이기 때문이다 — buildGoalScopeSet()이 그 범위를 준다.
    function goalPivotSourceRows(scopeSet) {
      return {
        targets: salesTargets.filter(t => scopeSet.has(t.year + '-' + t.month)),
        actuals: rawData.filter(r => r.bonbuRevenueStatus === '본부매출' && r.revenueBasis === '실적' && scopeSet.has(r.year + '-' + r.month))
      };
    }

    // 목표와 실적을 **같은 모양의 레코드 한 벌**로 합친다. 두 표가 하나로 합쳐지는 지점이 여기다 —
    // salesTargets는 담당자 × 5대분류 × 연월 단위이고 실적은 그보다 잘지만, 축 다섯 개
    // (연·월·부서·담당자·대분류)는 양쪽에 다 있다. 그 다섯 안에서는 행·열 어디에 어떤 순서로 놓아도
    // 목표와 실적이 같은 칸에서 만나므로 달성률이 성립한다. 채널·광고주·대행사가 빠진 이유도 같다 —
    // 목표가 그 축으로 편성되지 않아 실적만 쪼개지고 분모는 그대로가 되기 때문이다.
    //
    // 누적은 **전부 원 단위 정수로** 한다. 예전에는 백만원으로 나눈 뒤 더했는데, 축소된 단위로
    // 쌓으면 표시 단계마다 반올림이 겹쳐 행 합과 총합계가 어긋난다(엑셀로 내보내 다시 더해 보면
    // 8백만원까지 벌어졌다). 단위 변환은 화면·파일에 내보내는 마지막 순간에만 한다.
    function goalRecords(src) {
      const recs = [];
      src.targets.forEach(t => recs.push({
        year: t.year, month: t.month, dept: t.dept || '(미지정)', manager: t.manager || '(미지정)',
        categoryReclassified: t.categoryReclassified || '기타광고', t: t.targetWon, a: 0
      }));
      src.actuals.forEach(r => recs.push({
        year: r.year, month: r.month, dept: r.dept || '(미지정)', manager: r.manager || '(미지정)',
        categoryReclassified: r.categoryReclassified || '기타광고', t: 0, a: r.amount
      }));
      return recs;
    }

    // 행 N단계 × 열 N단계 트리. 노드마다 열 키별 {목표 t, 실적 a}를 들고, PV_ROWTOTAL에 행 전체 합을 둔다.
    // 열 조합의 정렬 규칙은 일반 피벗과 같은 것을 쓴다(연은 최근부터, 월은 1월부터 — pivot-builder.js).
    function goalBuildTree(recs, rowFields, colFields, cfg) {
      const makeNode = () => ({ m: {}, children: {} });
      const root = makeNode();
      const combos = new Map();
      const add = (n, key, r) => { const b = n.m[key] || (n.m[key] = { t: 0, a: 0 }); b.t += r.t; b.a += r.a; };
      recs.forEach(r => {
        const combo = colFields.map(f => String(r[f]));
        const colKey = combo.length ? combo.join('||') : PV_ALLCOL;
        if (!combos.has(colKey)) combos.set(colKey, combo);
        let n = root;
        add(n, colKey, r); add(n, PV_ROWTOTAL, r);
        rowFields.forEach(f => {
          const v = String(r[f]);
          if (!n.children[v]) n.children[v] = makeNode();
          n = n.children[v];
          add(n, colKey, r); add(n, PV_ROWTOTAL, r);
        });
      });
      if (colFields.length === 0) combos.set(PV_ALLCOL, []);
      const colCombos = [...combos.values()].sort((a, b) => {
        for (let i = 0; i < colFields.length; i++) {
          const c = pvCompareFieldValues(colFields[i], a[i], b[i], pvColumnDir(colFields[i], cfg));
          if (c !== 0) return c;
        }
        return 0;
      });
      return { root: root, colCombos: colCombos };
    }

    // 접힌 열 그룹 하나가 여러 잎을 대표하므로 그 잎들을 합쳐 한 칸으로 만든다.
    function goalMergeCells(node, leafKeys) {
      if (leafKeys.length === 1) return node.m[leafKeys[0]];
      let t = 0, a = 0;
      leafKeys.forEach(k => { const b = node.m[k]; if (b) { t += b.t; a += b.a; } });
      return { t: t, a: a };
    }

    function goalMetricThs(cls) { const c = cls ? ` class="${cls}"` : ''; return `<th${c}>목표</th><th${c}>실적</th><th${c}>달성률</th>`; }

    // 목표/실적/달성률 3칸. 값은 원 단위로 들어오고 여기서만 백만원으로 바꾼다.
    // 달성률 색은 피벗 색표(PIVOT_COLOR_MAP)에 이미 있는 증감색을 그대로 쓴다.
    function goalTriCells(v, fontW, bg) {
      const t = v ? v.t : 0; const a = v ? v.a : 0;
      const rate = t > 0 ? (a / t * 100) : null;
      const rateStyle = rate === null ? '' : (rate >= 100 ? 'color:#4ADE80;' : 'color:#F87171;');
      const num = (won) => Math.abs(won) >= 5e5 ? Math.round(won / 1e6).toLocaleString() : '-';
      return `<td style="text-align:right; font-weight:${fontW}; ${bg}">${num(t)}</td>`
        + `<td style="text-align:right; font-weight:${fontW}; ${bg}">${num(a)}</td>`
        + `<td style="text-align:right; font-weight:${fontW}; ${bg}${rateStyle}">${rate === null ? '-' : rate.toFixed(1) + '%'}</td>`;
    }

    // 한 행의 값 칸 전부(보이는 열 + 맨 끝 총합계). 소계·총합계 칸의 배경은 인라인이며
    // mapPivotHtml()의 치환 키이므로 **문자열 표기를 바꾸지 말 것**.
    function goalCellsHtml(node, visibleColumns, fontW) {
      let cells = '';
      visibleColumns.forEach(col => {
        cells += goalTriCells(goalMergeCells(node, col.leafKeys), fontW, col.isSubtotal ? 'background:rgba(30,58,138,0.1);' : '');
      });
      cells += goalTriCells(node.m[PV_ROWTOTAL], fontW, 'background:rgba(30,64,175,0.2);');
      return cells;
    }

    // 표가 성립하지 않는 경우(회계기준 / 등록된 목표 없음 / 행이 빈 경우) 공용 빈 상태.
    // 헤더는 줄 수가 열 축 깊이에 따라 달라지므로 thead를 통째로 쓴다.
    function goalTheadEl(prefix) { return document.querySelector('#' + prefix + 'Table thead'); }
    function renderGoalPivotUnavailable(prefix, message) {
      const thead = goalTheadEl(prefix);
      if (thead) thead.innerHTML = `<tr><th style="text-align:left; vertical-align:middle;">구분</th></tr>`;
      document.getElementById(prefix + 'TableBody').innerHTML = `<tr><td style="text-align:center; padding:30px; color:var(--text-tertiary);">${message}</td></tr>`;
      document.getElementById(prefix + 'Total').innerText = '-';
    }

    function goalRateText(t, a) { return t > 0 ? (a / t * 100).toFixed(1) + '%' : '-'; }

    // ── 행 정렬 ──────────────────────────────────────────────────────────────
    // 일반 피벗의 정렬자를 그대로 못 쓴다 — 저쪽은 값이 하나지만 여기는 한 칸에 셋(목표·실적·달성률)이라
    // "값 큰 순"이 무엇 기준인지 먼저 정해야 한다. 그래서 메뉴에서 기준을 고르게 하고, 기본값은
    // 원래 두 표가 쓰던 순서를 그대로 따른다(부서=팀 번호순, 대분류=5대분류 순, 담당자=목표+실적 큰 순).
    const GOAL_FIELD_ORDER_SORTER = {
      dept: (a, b) => compareDeptOrder(a, b),
      categoryReclassified: (a, b) => compareGoalCategoryOrder(a, b),
    };
    function goalMetricOf(v, by) {
      if (!v) return by === 'rate' ? -1 : 0;
      if (by === 't') return v.t;
      if (by === 'a') return v.a;
      return v.t > 0 ? v.a / v.t : -1; // 달성률. 목표가 없으면 비교할 수 없으므로 맨 뒤로 보낸다.
    }
    function goalRowSorterFor(field, cfg) {
      const s = cfg && cfg.sorts && cfg.sorts[field];
      if (s) {
        if (s.by === 'label') return (a, b) => pvCompareFieldValues(field, a, b, s.dir);
        if (s.by === 'preset' && GOAL_FIELD_ORDER_SORTER[field]) {
          const base = GOAL_FIELD_ORDER_SORTER[field];
          return (a, b) => (s.dir === 'desc' ? -1 : 1) * base(a, b);
        }
        const sign = s.dir === 'asc' ? 1 : -1;
        return (a, b, va, vb) => sign * (goalMetricOf(va, s.by) - goalMetricOf(vb, s.by));
      }
      if (GOAL_FIELD_ORDER_SORTER[field]) return GOAL_FIELD_ORDER_SORTER[field];
      // 연·월이 행으로 오면 매출순이 아니라 시간 순이 기본이다(열에 있을 때와 같은 방향).
      if (field === 'year' || field === 'month') return (a, b) => pvCompareFieldValues(field, a, b, pvColumnDir(field, cfg));
      return (a, b, va, vb) => (vb.t + vb.a) - (va.t + va.a);
    }

    // ── 우클릭 메뉴 ──────────────────────────────────────────────────────────
    const GOAL_SORT_METRICS = [['a', '실적'], ['t', '목표'], ['rate', '달성률', '높은', '낮은']];
    function goalOpenRowSortMenu(ev, viewKey, depth) {
      return pvOpenMetricRowSortMenu(ev, viewKey, depth, GOAL_SORT_METRICS, 'goalPickRowSort', GOAL_FIELD_ORDER_SORTER);
    }
    function goalPickRowSort(viewKey, field, val) {
      pvCloseRowSortMenu();
      const cfg = pvConfigFor(viewKey);
      if (!cfg.sorts) cfg.sorts = {};
      const parts = val.split(':');
      cfg.sorts[field] = { by: parts[0], dir: parts[1] };
      cfg.colSort = null; // 레벨별로 정하겠다는 뜻이므로 전 레벨 공통(열 기준) 정렬은 푼다
      renderGoalPivot(viewKey);
    }
    // 열 헤더 우클릭. 값이 있는 열이면 "그 열의 무엇 기준으로 행을 정렬할지"를 먼저 묻고,
    // 그 아래에 축 나열 순서를 붙인다. orderDepth < 0이면 축이 없는 열(총합계)이다.
    function goalOpenColMenu(ev, viewKey, orderDepth, pathKey, label) {
      const cfg = pvConfigFor(viewKey);
      const items = [];
      if (pathKey) {
        const cs = cfg.colSort;
        const on = (by, d) => !!(cs && cs.pathKey === pathKey && cs.dir === d && (cs.by || 'a') === by);
        items.push(['이 열 기준 행 정렬', false, '']); // 구획 제목(클릭 안 됨)
        [['a', '실적'], ['t', '목표'], ['rate', '달성률']].forEach(pair => {
          items.push([`${pair[1]} 내림차순`, on(pair[0], 'desc'), `goalSetColumnSort('${viewKey}','${pvEsc(pathKey)}','${pair[0]}','desc')`]);
          items.push([`${pair[1]} 오름차순`, on(pair[0], 'asc'), `goalSetColumnSort('${viewKey}','${pvEsc(pathKey)}','${pair[0]}','asc')`]);
        });
      }
      const field = orderDepth >= 0 ? cfg.columns[orderDepth] : null;
      if (field) {
        const dir = (cfg.sorts && cfg.sorts[field]) ? cfg.sorts[field].dir : null;
        items.push([`${detailDataFieldLabel(field)} 열 순서`, false, '']);
        items.push(['오름차순', dir === 'asc', `goalPickColOrder('${viewKey}','${pvEsc(field)}','asc')`]);
        items.push(['내림차순', dir === 'desc', `goalPickColOrder('${viewKey}','${pvEsc(field)}','desc')`]);
      }
      if (!items.length) return true;
      return pvShowMenu(ev, label, items);
    }
    function goalSetColumnSort(viewKey, pathKey, by, dir) {
      pvCloseRowSortMenu();
      pvConfigFor(viewKey).colSort = { pathKey: pathKey, by: by, dir: dir };
      renderGoalPivot(viewKey);
    }
    function goalPickColOrder(viewKey, field, dir) {
      pvCloseRowSortMenu();
      const cfg = pvConfigFor(viewKey);
      if (!cfg.sorts) cfg.sorts = {};
      cfg.sorts[field] = { by: 'label', dir: dir };
      renderGoalPivot(viewKey);
    }
    function toggleGoalPivotNode(viewKey, pathKey) {
      const map = PIVOT_PRESETS[viewKey].expandedRows();
      map[pathKey] = !map[pathKey];
      renderGoalPivot(viewKey);
    }

    // 깊이별 행 라벨 색과 값 칸 굵기. 원래 부서별 피벗이 쓰던 3단 램프를 그대로 쓰고,
    // 축을 다섯 개까지 쌓을 수 있게 아래로 두 단을 더 두었다(담당자별 피벗과 같은 값).
    const GOAL_ROW_STYLES = [
      { label: 'background:#1E293B; color:#F8FAFC; font-weight:700;', fontW: '700' },
      { label: 'background:#151C2C; color:#CBD5E1; font-weight:700;', fontW: '600' },
      { label: 'background:#11151F; color:#94A3B8;', fontW: 'var(--fw-ui)' },
      { label: 'background:#0D1117; color:#64748B;', fontW: 'var(--fw-ui)' },
      { label: 'background:#090C10; color:#475569; font-size:12px;', fontW: 'var(--fw-ui)' },
    ];

    function goalRenderRows(node, viewKey, depth, ancestorPath, visibleColumns, rowFields, cfg, expandedRows, out) {
      const hasMore = depth + 1 < rowFields.length;
      const field = rowFields[depth];
      const zero = { t: 0, a: 0 };
      const tot = (n) => n.m[PV_ROWTOTAL] || zero;

      // 열 헤더에서 건 정렬이 있으면 그 열 기준으로, 없으면 필드별 규칙으로 정렬한다.
      // 열 기준은 **모든 레벨에 같이** 걸린다(헤더는 하나인데 행 계층은 여럿이라 나눌 수가 없다).
      const cs = cfg.colSort;
      const sortCol = cs ? (cs.pathKey === PV_GRAND ? PV_GRAND : visibleColumns.find(c => c.pathKey === cs.pathKey)) : null;
      let keys;
      if (sortCol) {
        const by = cs.by || 'a'; // 헤더 좌클릭은 기준을 안 고르므로 실적으로 본다
        const sign = cs.dir === 'asc' ? 1 : -1;
        const val = (n) => sortCol === PV_GRAND ? tot(n) : goalMergeCells(n, sortCol.leafKeys);
        keys = Object.keys(node.children).sort((a, b) =>
          sign * (goalMetricOf(val(node.children[a]), by) - goalMetricOf(val(node.children[b]), by)));
      } else {
        const sorter = goalRowSorterFor(field, cfg);
        keys = Object.keys(node.children).sort((a, b) => sorter(a, b, tot(node.children[a]), tot(node.children[b])));
      }

      keys.forEach(k => {
        const child = node.children[k];
        const path = ancestorPath.concat(k);
        const pathKey = path.join('||');
        const isExpanded = !!expandedRows[pathKey];
        const st = GOAL_ROW_STYLES[Math.min(depth, GOAL_ROW_STYLES.length - 1)];
        const toggle = hasMore ? `<span class="toggle-icon" onclick="toggleGoalPivotNode('${viewKey}','${pvEsc(pathKey)}')">${isExpanded ? '-' : '+'}</span>` : '';
        const menu = ` oncontextmenu="return goalOpenRowSortMenu(event,'${viewKey}',${depth})"`;
        out.push(`<tr><td class="indent-step-${Math.min(depth + 1, 5)}"${menu} style="${st.label}">${toggle}${pvFormatFieldValue(field, k)}</td>`
          + `${goalCellsHtml(child, visibleColumns, st.fontW)}</tr>`);
        if (hasMore && isExpanded) goalRenderRows(child, viewKey, depth + 1, path, visibleColumns, rowFields, cfg, expandedRows, out);
      });
    }

    // ── 목표 대비 실적 피벗 본체 (월별 / 부서별 공용) ────────────────────────
    // 두 화면의 차이는 **처음 행 축뿐**이다(대분류 / 부서→담당자→대분류). 나머지는 전부 같아서
    // 예전에는 같은 코드가 두 벌 있었다. 이제 축은 pvConfigFor(viewKey)가 들고 있고 표 편집으로 바뀐다.
    function renderGoalPivot(viewKey) {
      const preset = PIVOT_PRESETS[viewKey];
      const prefix = viewKey; // DOM id 접두사가 뷰 키와 같다 (goalTrendPivot / goalDeptPivot)
      const cfg = pvConfigFor(viewKey);
      const rowFields = cfg.rows, colFields = cfg.columns;

      // 빌더 패널과 '원래대로'는 표가 성립하지 않는 경우에도 그린다 — 축을 되돌려서 빠져나올 수 있어야 한다.
      renderPvBuilderPanel(viewKey);
      const resetBtn = preset.resetBtn && document.getElementById(preset.resetBtn);
      if (resetBtn) resetBtn.style.display = pvIsConfigDefault(viewKey) ? 'none' : '';

      if (revenueBasisMode === 'accounting') { renderGoalPivotUnavailable(prefix, '취급고 기준에서만 제공됩니다'); return; }
      const scopeSet = buildGoalScopeSet();
      if (scopeSet.size === 0) { renderGoalPivotUnavailable(prefix, GOAL_NO_TARGET_MSG); return; }
      if (rowFields.length === 0) { renderGoalPivotUnavailable(prefix, '행 영역에 필드를 놓으세요'); return; }

      const recs = goalRecords(goalPivotSourceRows(scopeSet));
      const tree = goalBuildTree(recs, rowFields, colFields, cfg);
      const root = tree.root;

      const opt = {
        subtotalDepths: new Set(preset.subtotalDepths || []),
        columnDefaultExpanded: true,
        toggleDepth: preset.toggleDepth,
        presetKey: viewKey,
        expandedCols: preset.expandedCols(),
        cfg: cfg,
        header: PV_HEADER_TREE,
        spanMul: 3, // 한 열이 목표·실적·달성률 세 칸
        colClick: (pk) => ` data-pvsort="1" onclick="pvSortByColumn('${viewKey}','${pvEsc(pk)}')"`,
        colMenu: (orderDepth, pathKey, label) => ` oncontextmenu="return goalOpenColMenu(event,'${viewKey}',${orderDepth},'${pvEsc(pathKey || '')}','${pvEsc(label)}')"`,
      };
      const visibleColumns = colFields.length ? pvBuildVisibleColumns(tree.colCombos, colFields, opt.expandedCols, opt) : [];
      const headerRows = colFields.length ? pvRenderColumnHeaderRows(visibleColumns, colFields, opt) : [];

      // 헤더는 열 축 깊이 + 지표 한 줄. 열 축이 [연, 월]이면 예전과 같은 3줄이 된다.
      const L = headerRows.length;
      // 열 축 L줄 + 지표 1줄. 열이 아예 없으면(총합계만) 축 줄이 없어도 지표 줄은 있어야 하므로 2줄이 된다.
      const headRows = L >= 1 ? L + 1 : 2;
      const cs = cfg.colSort;
      const grandMark = (cs && cs.pathKey === PV_GRAND) ? (cs.dir === 'asc' ? ' ▲' : ' ▼') : '';
      let head = `<tr><th rowspan="${headRows}"${PV_HEADER_TREE.label} data-pvsort="1" onclick="pvClearColumnSort('${viewKey}')" oncontextmenu="return goalOpenRowSortMenu(event,'${viewKey}',0)" title="클릭: 열 기준 정렬 해제 · 우클릭: 첫 단계 정렬">구분${cs ? ' ↺' : ''}</th>`
        + (headerRows[0] || '')
        + `<th colspan="3" rowspan="${Math.max(L, 1)}"${PV_HEADER_TREE.total} data-pvsort="1" onclick="pvSortByColumn('${viewKey}','${PV_GRAND}')" oncontextmenu="return goalOpenColMenu(event,'${viewKey}',-1,'${PV_GRAND}','총합계')">총합계${grandMark}</th></tr>`;
      for (let d = 1; d < L; d++) head += `<tr>${headerRows[d]}</tr>`;
      head += `<tr>${visibleColumns.map(c => goalMetricThs(c.isSubtotal ? 'pv-th-summary' : '')).join('')}${goalMetricThs('pv-th-total')}</tr>`;
      const thead = goalTheadEl(prefix);
      if (thead) thead.innerHTML = mapPivotHtml(head);

      const out = [];
      goalRenderRows(root, viewKey, 0, [], visibleColumns, rowFields, cfg, preset.expandedRows(), out);
      let body = out.join('');
      body += `<tr class="row-grand-total"><td class="indent-step-1">총합계</td>${goalCellsHtml(root, visibleColumns, '500')}</tr>`;
      document.getElementById(prefix + 'TableBody').innerHTML = mapPivotHtml(body);

      const g = root.m[PV_ROWTOTAL] || { t: 0, a: 0 };
      document.getElementById(prefix + 'Total').innerText = goalRateText(g.t, g.a);
    }

    // 기존 진입점(VIEW_CONFIG·filters.js·view-router.js)이 그대로 동작하도록 이름을 남긴다.
    function renderGoalTrendPivotTable() { renderGoalPivot('goalTrendPivot'); }

    // ── 목표 피벗 엑셀 다운로드 ──────────────────────────────────────────────
    // 화면의 넓은 표(연×월×3지표)를 그대로 옮기지 않고, 다른 피벗 export와 같은 **롱 포맷**
    // (한 행 = 한 연월×축 조합)으로 내보낸다. exportPivotExcel()의 기존 시트들과 형식이 같아야
    // 엑셀에서 다시 피벗을 돌릴 수 있고, 병합 헤더는 피벗 원본으로 쓸 수 없다.
    //
    // 금액은 **원 단위 정수**로 낸다. 백만원으로 줄여 내보내면 행마다 반올림이 붙고, 이 표는 행이
    // 연월×부서×담당자×대분류까지 잘게 쪼개져(2026년 기준 248행) 그 오차가 합계에서 8백만원까지
    // 벌어졌다. 엑셀에서 다시 합산해 대시보드와 대조하는 표라 그 차이가 그대로 드러난다.
    // 원 단위로 내면 반올림이 아예 없어 합계가 화면과 정확히 일치한다 — 표시 단위는 화면(백만원)과
    // 다르지만, 숫자는 어디서나 원 단위로 들고 있다가 보여줄 때만 줄인다는 원칙을 따른 것이다.
    // 달성률은 소수 1자리 숫자(목표 0이면 빈칸).
    function exportGoalPivotExcel(kind) {
      if (revenueBasisMode === 'accounting') { alert('목표 대비 실적은 취급고 기준에서만 제공됩니다.'); return; }

      const isDept = kind === 'dept';
      const viewKey = isDept ? 'goalDeptPivot' : 'goalTrendPivot';
      const scopeSet = buildGoalScopeSet();
      if (scopeSet.size === 0) { alert(GOAL_NO_TARGET_MSG + '.'); return; }

      // **화면의 축을 그대로 따라간다.** 표 편집으로 축을 바꿨는데 파일이 예전 축으로 나오면
      // 엑셀에서 다시 합산해 대조하는 이 표의 쓰임이 깨진다. 연·월은 롱 포맷의 고정 열이므로 뺀다.
      const cfg = pvConfigFor(viewKey);
      const axisFields = cfg.rows.concat(cfg.columns)
        .filter(f => f !== 'year' && f !== 'month')
        .filter((f, i, arr) => arr.indexOf(f) === i);

      const map = {};
      goalRecords(goalPivotSourceRows(scopeSet)).forEach(r => {
        const keys = axisFields.map(f => r[f]);
        const k = [r.year, r.month].concat(keys).join('|');
        if (!map[k]) map[k] = { y: r.year, m: r.month, keys: keys, t: 0, a: 0 };
        map[k].t += r.t; map[k].a += r.a;
      });

      const list = Object.values(map).filter(v => v.t !== 0 || v.a !== 0);
      if (list.length === 0) { alert('다운로드할 데이터가 없습니다.'); return; }
      const cmpField = (f, a, b) => f === 'dept' ? compareDeptOrder(a, b)
        : f === 'categoryReclassified' ? compareGoalCategoryOrder(a, b)
        : String(a).localeCompare(String(b), 'ko');
      list.sort((x, y2) => {
        if (x.y !== y2.y) return x.y - y2.y;
        if (x.m !== y2.m) return x.m - y2.m;
        for (let i = 0; i < axisFields.length; i++) { const c = cmpField(axisFields[i], x.keys[i], y2.keys[i]); if (c) return c; }
        return 0;
      });

      const exportRows = list.map(v => {
        const row = { '연도': v.y, '귀속월': `${v.y}-${String(v.m).padStart(2, '0')}` };
        axisFields.forEach((f, i) => { row[detailDataFieldLabel(f)] = v.keys[i]; });
        row['목표(원)'] = Math.round(v.t);
        row['실적(원)'] = Math.round(v.a);
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

    // ── 부서별 목표 대비 실적 피벗 — 처음 행 축: 부서 → 담당자 → 대분류 ──────
    // 본체는 renderGoalPivot() 하나이고 여기서는 뷰 키만 넘긴다.
    function renderGoalDeptPivotTable() { renderGoalPivot('goalDeptPivot'); }

