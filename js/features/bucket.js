// ============================================================
// js/features/bucket.js
// 구간별 광고주 금액 분포: 차트+피벗
// ============================================================
    function getBucketTierKey(amount) {
      if (amount >= 100000000) return '1억 이상';
      if (amount >= 50000000) return '0.5~1억원';
      if (amount >= 40000000) return '0.4~0.5억원';
      if (amount >= 30000000) return '0.3~0.4억원';
      if (amount >= 20000000) return '0.2~0.3억원';
      if (amount >= 10000000) return '0.1~0.2억원';
      return '0.1억원 미만';
    }

    function renderBucketPivotTable() {
      // 차트(renderAdvBucketChart)와 동일한 기준: 일반광고+IMC, 배분수익 제외, 1/N 제외
      const targetData = filteredData.filter(r => isAdvMetricEligible(r));

      const years = [...new Set(targetData.map(r => r.year))].sort((a,b)=>b-a);
      const yearMonthsMap = {};
      years.forEach(yr => { const monthsWithData = new Set(); targetData.filter(r => r.year === yr && r.amount > 0).forEach(r => monthsWithData.add(r.month)); yearMonthsMap[yr] = [...monthsWithData].sort((a,b)=>a-b); });

      // 헤더 (연도 펼침/접기 + 연도요약 + 총합계)
      let headerRow1 = `<th rowspan="2" style="text-align: left; min-width: 220px; vertical-align: middle;">구분</th>`; let headerRow2 = ``;
      years.forEach(yr => {
        const isExpanded = expandedBucketYearColumns[yr] !== false; const activeMonths = yearMonthsMap[yr] || []; const toggleSymbol = isExpanded ? '-' : '+';
        if (isExpanded) {
          headerRow1 += `<th colspan="${activeMonths.length + 1}" style="text-align: center;"><span class="year-toggle-btn" onclick="toggleYearColumn('bucket', ${yr})">${toggleSymbol}</span> ${yr}년</th>`;
          activeMonths.forEach(m => { headerRow2 += `<th style="text-align: center;">${m}월</th>`; });
          headerRow2 += `<th style="text-align: center; background: #1E3A8A !important; color: #93C5FD !important;">${yr}년 요약</th>`;
        } else { headerRow1 += `<th rowspan="1" style="text-align: center;"><span class="year-toggle-btn" onclick="toggleYearColumn('bucket', ${yr})">${toggleSymbol}</span> ${yr}년</th>`; headerRow2 += `<th style="text-align: center; background: #1E3A8A !important; color: #93C5FD !important;">${yr}년 요약</th>`; }
      });
      headerRow1 += `<th rowspan="2" style="text-align: center; background: #1E40AF !important; color: #FFFFFF !important; font-weight: 900; vertical-align: middle;">총합계</th>`;
      document.getElementById('bucketPivotHeaderRow1').innerHTML = headerRow1; document.getElementById('bucketPivotHeaderRow2').innerHTML = headerRow2;

      // 월단위 광고주별 합산금액 → 구간 배정
      const advMonthMap = {};
      targetData.forEach(r => { const key = `${r.year}||${r.month}||${r.advertiser}`; advMonthMap[key] = (advMonthMap[key] || 0) + r.amount; });

      const cellData = {};
      bucketTierOrder.forEach(b => { cellData[b] = { years: {}, totalCount: 0, totalSum: 0, advertisers: {} }; years.forEach(yr => { cellData[b].years[yr] = { months: {}, yearCount: 0, yearSum: 0 }; }); });

      Object.entries(advMonthMap).forEach(([key, amount]) => {
        if (amount <= 0) return;
        const [yrStr, mStr, adv] = key.split('||'); const yr = parseInt(yrStr); const m = parseInt(mStr);
        if (!years.includes(yr)) return;
        const bKey = getBucketTierKey(amount); const cell = cellData[bKey];
        if (!cell.years[yr].months[m]) cell.years[yr].months[m] = { count: 0, sum: 0 };
        cell.years[yr].months[m].count += 1; cell.years[yr].months[m].sum += amount;
        cell.years[yr].yearCount += 1; cell.years[yr].yearSum += amount;
        cell.totalCount += 1; cell.totalSum += amount;

        if (!cell.advertisers[adv]) cell.advertisers[adv] = { years: {}, totalSum: 0 };
        if (!cell.advertisers[adv].years[yr]) cell.advertisers[adv].years[yr] = { months: {}, yearSum: 0 };
        cell.advertisers[adv].years[yr].months[m] = (cell.advertisers[adv].years[yr].months[m] || 0) + amount;
        cell.advertisers[adv].years[yr].yearSum += amount;
        cell.advertisers[adv].totalSum += amount;
      });

      const grandTotalCount = bucketTierOrder.reduce((s,b) => s + cellData[b].totalCount, 0);
      const grandTotalSum = bucketTierOrder.reduce((s,b) => s + cellData[b].totalSum, 0);
      document.getElementById('bucketPivotTotalAmount').innerText = `${Math.round(grandTotalSum/1e6).toLocaleString()} 백만`;

      const metricSections = [
        { key: '광고주수', label: '광고주 수 (개사)' },
        { key: '평균매출', label: '평균 매출 (백만원)' },
        { key: '합계매출', label: '합계 매출 (백만원)' }
      ];
      // 광고주수는 정수, 평균/합계매출은 백만원 단위 소수점 1자리로 표기
      const fmtBucketVal = (val, isCount) => { if (!val || val <= 0) return '-'; return isCount ? Math.round(val).toLocaleString() : val.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }); };

      let tbodyHtml = '';
      metricSections.forEach(sec => {
        const isCount = sec.key === '광고주수';
        const isSecExpanded = expandedBucketMetricSections[sec.key] !== false;
        tbodyHtml += `<tr class="row-channel"><td class="indent-step-1"><strong><span class="toggle-icon" onclick="toggleBucketMetricSection('${sec.key}')">${isSecExpanded ? '-' : '+'}</span>${sec.label}</strong></td>`;
        years.forEach(yr => {
          const isYrExpanded = expandedBucketYearColumns[yr] !== false; const activeMonths = yearMonthsMap[yr] || [];
          const yCount = bucketTierOrder.reduce((s,b)=> s + cellData[b].years[yr].yearCount, 0);
          const ySum = bucketTierOrder.reduce((s,b)=> s + cellData[b].years[yr].yearSum, 0);
          const yVal = sec.key === '광고주수' ? yCount : sec.key === '평균매출' ? (yCount>0 ? ySum/yCount/1e6 : 0) : ySum/1e6;
          if (isYrExpanded) {
            activeMonths.forEach(m => {
              let cVal = 0, sVal = 0;
              bucketTierOrder.forEach(b => { const mo = cellData[b].years[yr].months[m]; if (mo) { cVal += mo.count; sVal += mo.sum; } });
              const val = sec.key === '광고주수' ? cVal : sec.key === '평균매출' ? (cVal>0 ? sVal/cVal/1e6 : 0) : sVal/1e6;
              tbodyHtml += `<td style="text-align: right; font-weight: 700;">${fmtBucketVal(val, isCount)}</td>`;
            });
            tbodyHtml += `<td style="text-align: right; font-weight: 800; color: #93C5FD; background: #1E293B;">${fmtBucketVal(yVal, isCount)}</td>`;
          } else { tbodyHtml += `<td style="text-align: right; font-weight: 800; color: #93C5FD; background: #1E293B;">${fmtBucketVal(yVal, isCount)}</td>`; }
        });
        const totalVal = sec.key === '광고주수' ? grandTotalCount : sec.key === '평균매출' ? (grandTotalCount>0 ? grandTotalSum/grandTotalCount/1e6 : 0) : grandTotalSum/1e6;
        tbodyHtml += `<td style="text-align: right; font-weight: 900; color: #60A5FA; background: #1E3A8A;">${fmtBucketVal(totalVal, isCount)}</td></tr>`;

        if (isSecExpanded) {
          bucketTierOrder.forEach(bKey => {
            const bData = cellData[bKey];
            const advToggleKey = sec.key + '||' + bKey; const isBucketAdvExpanded = !!expandedBucketAdvertisers[advToggleKey];
            tbodyHtml += `<tr class="row-category"><td class="indent-step-2" style="background: #151C2C; color: #CBD5E1;"><span class="toggle-icon" onclick="toggleBucketAdvertisers('${sec.key}', '${bKey}')">${isBucketAdvExpanded ? '-' : '+'}</span>${bKey}</td>`;
            years.forEach(yr => {
              const isYrExpanded = expandedBucketYearColumns[yr] !== false; const activeMonths = yearMonthsMap[yr] || []; const yrObj = bData.years[yr];
              const yVal = sec.key === '광고주수' ? yrObj.yearCount : sec.key === '평균매출' ? (yrObj.yearCount>0 ? yrObj.yearSum/yrObj.yearCount/1e6 : 0) : yrObj.yearSum/1e6;
              if (isYrExpanded) {
                activeMonths.forEach(m => {
                  const mo = yrObj.months[m]; const cVal = mo ? mo.count : 0; const sVal = mo ? mo.sum : 0;
                  const val = sec.key === '광고주수' ? cVal : sec.key === '평균매출' ? (cVal>0 ? sVal/cVal/1e6 : 0) : sVal/1e6;
                  tbodyHtml += `<td style="text-align: right; font-weight: 500;">${fmtBucketVal(val, isCount)}</td>`;
                });
                tbodyHtml += `<td style="text-align: right; font-weight: 600; background: #172033;">${fmtBucketVal(yVal, isCount)}</td>`;
              } else { tbodyHtml += `<td style="text-align: right; font-weight: 600; background: #172033;">${fmtBucketVal(yVal, isCount)}</td>`; }
            });
            const bTotal = sec.key === '광고주수' ? bData.totalCount : sec.key === '평균매출' ? (bData.totalCount>0 ? bData.totalSum/bData.totalCount/1e6 : 0) : bData.totalSum/1e6;
            tbodyHtml += `<td style="text-align: right; font-weight: 700; background: #1E293B; color: #93C5FD;">${fmtBucketVal(bTotal, isCount)}</td></tr>`;

            if (isBucketAdvExpanded) {
              const advertisers = Object.keys(bData.advertisers).sort((a,b) => bData.advertisers[b].totalSum - bData.advertisers[a].totalSum);
              advertisers.forEach(adv => {
                const aData = bData.advertisers[adv];
                tbodyHtml += `<tr class="row-subcategory"><td class="indent-step-3" style="background: #11151F; color: #94A3B8;">${adv}</td>`;
                years.forEach(yr => {
                  const isYrExpanded = expandedBucketYearColumns[yr] !== false; const activeMonths = yearMonthsMap[yr] || []; const aYrObj = aData.years[yr] || { months: {}, yearSum: 0 };
                  const aYVal = sec.key === '광고주수' ? (aYrObj.yearSum > 0 ? 1 : 0) : aYrObj.yearSum / 1e6;
                  if (isYrExpanded) {
                    activeMonths.forEach(m => {
                      const mv = aYrObj.months[m] || 0;
                      const aVal = sec.key === '광고주수' ? (mv > 0 ? 1 : 0) : mv / 1e6;
                      tbodyHtml += `<td style="text-align: right; font-weight: 400;">${fmtBucketVal(aVal, isCount)}</td>`;
                    });
                    tbodyHtml += `<td style="text-align: right; font-weight: 500; background: #141824;">${fmtBucketVal(aYVal, isCount)}</td>`;
                  } else { tbodyHtml += `<td style="text-align: right; font-weight: 500; background: #141824;">${fmtBucketVal(aYVal, isCount)}</td>`; }
                });
                const aTotal = sec.key === '광고주수' ? (aData.totalSum > 0 ? 1 : 0) : aData.totalSum / 1e6;
                tbodyHtml += `<td style="text-align: right; font-weight: 600; background: #1A2234; color: #93C5FD;">${fmtBucketVal(aTotal, isCount)}</td></tr>`;
              });
            }
          });
        }
      });
      document.getElementById('bucketPivotTableBody').innerHTML = mapPivotHtml(tbodyHtml);
    }

