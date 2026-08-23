// ============================================================
// js/features/detail-pivots.js
// 상세 피벗: 항목/부서/담당자/채널/광고주/대행사별
// ============================================================
    // 이 피벗은 공용 엔진으로 옮겼다(js/features/pivot-builder.js의 PIVOT_PRESETS.category).
    // 아래 원본은 **되돌리기 장치로 남겨 둔다** — state.js의 USE_PIVOT_ENGINE을 false로 하면
    // 즉시 이 코드가 다시 돈다. 엔진이 여섯 피벗을 모두 흡수하고 한동안 문제가 없으면 지운다.
    function renderCategoryPivotTable() {
      if (typeof USE_PIVOT_ENGINE !== 'undefined' && USE_PIVOT_ENGINE) { renderPresetPivot('category'); return; }
      const targetData = filteredData;
      const years = [...new Set(targetData.map(r => r.year))].sort((a,b)=>b-a);
      const yearMonthsMap = {};
      years.forEach(yr => { const monthsWithData = new Set(); targetData.filter(r => r.year === yr && r.amount > 0).forEach(r => monthsWithData.add(r.month)); yearMonthsMap[yr] = [...monthsWithData].sort((a,b)=>a-b); });

      let h1 = `<th rowspan="2" style="text-align:left; vertical-align:middle;">구분</th>`, h2 = ``;
      years.forEach(yr => {
        const isExp = expandedCatYearColumns[yr] !== false; const activeMonths = yearMonthsMap[yr] || [];
        if (isExp) { h1 += `<th colspan="${activeMonths.length+1}"><span class="year-toggle-btn" onclick="toggleYearColumn('cat', ${yr})">-</span> ${yr}년</th>`; activeMonths.forEach(m => h2 += `<th>${m}월</th>`); h2 += `<th class="pv-th-summary">${yr}년 요약</th>`; } 
        else { h1 += `<th rowspan="1"><span class="year-toggle-btn" onclick="toggleYearColumn('cat', ${yr})">+</span> ${yr}년</th>`; h2 += `<th class="pv-th-summary">${yr}년 요약</th>`; }
      });
      h1 += `<th rowspan="2" class="pv-th-total" style="z-index:35;">총합계</th>`;
      document.getElementById('catPivotHeaderRow1').innerHTML = mapPivotHtml(h1); document.getElementById('catPivotHeaderRow2').innerHTML = mapPivotHtml(h2);

      let grandTotalSum = 0; let totalByYM = {}; let totalByY = {};
      const tree = {};
      targetData.forEach(r => {
        const yr = r.year || 2025; const m = r.month || 1; const amtM = r.amount / 1000000;
        const l1 = r.categoryReclassified || '기타'; const l2 = r.subCategory || '일반'; const l3 = r.subCategory3 || '일반';
        if(!tree[l1]) tree[l1] = { total:0, yrs:{}, subs:{} };
        if(!tree[l1].subs[l2]) tree[l1].subs[l2] = { total:0, yrs:{}, subs:{} };
        if(!tree[l1].subs[l2].subs[l3]) tree[l1].subs[l2].subs[l3] = { total:0, yrs:{} };
        const addToNode = (node) => { node.total += amtM; if(!node.yrs[yr]) node.yrs[yr] = { sum:0, m:{} }; node.yrs[yr].sum += amtM; node.yrs[yr].m[m] = (node.yrs[yr].m[m]||0) + amtM; };
        addToNode(tree[l1]); addToNode(tree[l1].subs[l2]); addToNode(tree[l1].subs[l2].subs[l3]);
        const ym = `${yr}-${m}`; totalByYM[ym] = (totalByYM[ym]||0) + amtM; totalByY[yr] = (totalByY[yr]||0) + amtM; grandTotalSum += amtM;
      });
      document.getElementById('categoryPivotTotalAmount').innerText = `${Math.round(grandTotalSum).toLocaleString()} 백만`;

      const genCells = (node) => {
        let cells = '';
        years.forEach(yr => {
          const isExp = expandedCatYearColumns[yr] !== false; const activeM = yearMonthsMap[yr] || []; const yrObj = (node && node.yrs[yr]) ? node.yrs[yr] : {sum:0, m:{}};
          if(isExp) { activeM.forEach(m => { cells += `<td style="text-align:right;">${yrObj.m[m]>0?Math.round(yrObj.m[m]).toLocaleString():'-'}</td>`; }); }
          cells += `<td style="text-align:right; font-weight: 400; background:rgba(30,58,138,0.1);">${yrObj.sum>0?Math.round(yrObj.sum).toLocaleString():'-'}</td>`;
        });
        cells += `<td style="text-align:right; font-weight: 500; background:rgba(30,64,175,0.2);">${node?Math.round(node.total).toLocaleString():'-'}</td>`;
        return cells;
      };

      let html = '';
      const l1Keys = Object.keys(tree).sort((a,b)=>tree[b].total - tree[a].total);
      l1Keys.forEach(l1 => {
        const isL1Exp = !!expandedCatPivot[l1];
        html += `<tr class="row-channel"><td class="indent-step-1" style="background:#1E293B; color:#F8FAFC; font-weight:700;"><span class="toggle-icon" onclick="toggleCatPivotNode('${l1}')">${isL1Exp?'-':'+'}</span>${l1}</td>${genCells(tree[l1])}</tr>`;
        if(isL1Exp) {
          const l2Keys = Object.keys(tree[l1].subs).sort((a,b)=>tree[l1].subs[b].total - tree[l1].subs[a].total);
          l2Keys.forEach(l2 => {
            const isL2Exp = !!expandedCatPivot[`${l1}||${l2}`];
            html += `<tr class="row-category"><td class="indent-step-2" style="background:#151C2C; color:#CBD5E1;"><span class="toggle-icon" onclick="toggleCatPivotNode('${l1}','${l2}')">${isL2Exp?'-':'+'}</span>${l2}</td>${genCells(tree[l1].subs[l2])}</tr>`;
            if(isL2Exp) {
              const l3Keys = Object.keys(tree[l1].subs[l2].subs).sort();
              l3Keys.forEach(l3 => { html += `<tr class="row-subcategory"><td class="indent-step-3" style="background:#11151F; color:#94A3B8;">${l3}</td>${genCells(tree[l1].subs[l2].subs[l3])}</tr>`; });
            }
          });
        }
      });
      html += `<tr class="row-grand-total"><td class="indent-step-1">총합계</td>`;
      years.forEach(yr => {
        const isExp = expandedCatYearColumns[yr] !== false;
        if(isExp) { (yearMonthsMap[yr]||[]).forEach(m => { html += `<td style="text-align:right; font-weight: 500;">${totalByYM[`${yr}-${m}`]>0?Math.round(totalByYM[`${yr}-${m}`]).toLocaleString():'-'}</td>`; }); }
        html += `<td class="pv-num-sum">${totalByY[yr]>0?Math.round(totalByY[yr]).toLocaleString():'-'}</td>`;
      });
      html += `<td class="pv-num-total">${Math.round(grandTotalSum).toLocaleString()}</td></tr>`;
      document.getElementById('catPivotTableBody').innerHTML = mapPivotHtml(html);
    }


    // ==========================================================================
    // 2. 부서별 (부서/대/중) 피벗
    // ==========================================================================
    // 공용 엔진으로 이관됨(PIVOT_PRESETS.dept). 아래 원본은 USE_PIVOT_ENGINE=false용 되돌리기 장치.
    function renderDeptPivotTable() {
      if (typeof USE_PIVOT_ENGINE !== 'undefined' && USE_PIVOT_ENGINE) { renderPresetPivot('dept'); return; }
      const targetData = filteredData;
      const years = [...new Set(targetData.map(r => r.year))].sort((a,b)=>b-a);
      const yearMonthsMap = {};
      years.forEach(yr => { const monthsWithData = new Set(); targetData.filter(r => r.year === yr && r.amount > 0).forEach(r => monthsWithData.add(r.month)); yearMonthsMap[yr] = [...monthsWithData].sort((a,b)=>a-b); });

      let h1 = `<th rowspan="2" style="text-align:left; vertical-align:middle;">구분</th>`, h2 = ``;
      years.forEach(yr => {
        const isExp = expandedDeptYearColumns[yr] !== false; const activeMonths = yearMonthsMap[yr] || [];
        if (isExp) { h1 += `<th colspan="${activeMonths.length+1}"><span class="year-toggle-btn" onclick="toggleYearColumn('dept', ${yr})">-</span> ${yr}년</th>`; activeMonths.forEach(m => h2 += `<th>${m}월</th>`); h2 += `<th class="pv-th-summary">${yr}년 요약</th>`; } 
        else { h1 += `<th rowspan="1"><span class="year-toggle-btn" onclick="toggleYearColumn('dept', ${yr})">+</span> ${yr}년</th>`; h2 += `<th class="pv-th-summary">${yr}년 요약</th>`; }
      });
      h1 += `<th rowspan="2" class="pv-th-total" style="z-index:35;">총합계</th>`;
      document.getElementById('deptPivotHeaderRow1').innerHTML = mapPivotHtml(h1); document.getElementById('deptPivotHeaderRow2').innerHTML = mapPivotHtml(h2);

      let grandTotalSum = 0; let totalByYM = {}; let totalByY = {};
      const tree = {};
      targetData.forEach(r => {
        const yr = r.year || 2025; const m = r.month || 1; const amtM = r.amount / 1000000;
        const l1 = r.dept || '(미지정)'; const l2 = r.categoryReclassified || '기타'; const l3 = r.subCategory || '일반';
        if(!tree[l1]) tree[l1] = { total:0, yrs:{}, subs:{} };
        if(!tree[l1].subs[l2]) tree[l1].subs[l2] = { total:0, yrs:{}, subs:{} };
        if(!tree[l1].subs[l2].subs[l3]) tree[l1].subs[l2].subs[l3] = { total:0, yrs:{} };
        const addToNode = (node) => { node.total += amtM; if(!node.yrs[yr]) node.yrs[yr] = { sum:0, m:{} }; node.yrs[yr].sum += amtM; node.yrs[yr].m[m] = (node.yrs[yr].m[m]||0) + amtM; };
        addToNode(tree[l1]); addToNode(tree[l1].subs[l2]); addToNode(tree[l1].subs[l2].subs[l3]);
        const ym = `${yr}-${m}`; totalByYM[ym] = (totalByYM[ym]||0) + amtM; totalByY[yr] = (totalByY[yr]||0) + amtM; grandTotalSum += amtM;
      });
      document.getElementById('deptPivotTotalAmount').innerText = `${Math.round(grandTotalSum).toLocaleString()} 백만`;

      const genCells = (node) => {
        let cells = '';
        years.forEach(yr => {
          const isExp = expandedDeptYearColumns[yr] !== false; const activeM = yearMonthsMap[yr] || []; const yrObj = (node && node.yrs[yr]) ? node.yrs[yr] : {sum:0, m:{}};
          if(isExp) { activeM.forEach(m => { cells += `<td style="text-align:right;">${yrObj.m[m]>0?Math.round(yrObj.m[m]).toLocaleString():'-'}</td>`; }); }
          cells += `<td style="text-align:right; font-weight: 400; background:rgba(30,58,138,0.1);">${yrObj.sum>0?Math.round(yrObj.sum).toLocaleString():'-'}</td>`;
        });
        cells += `<td style="text-align:right; font-weight: 500; background:rgba(30,64,175,0.2);">${node?Math.round(node.total).toLocaleString():'-'}</td>`;
        return cells;
      };

      let html = '';
      // **부서 정렬 로직 적용 (매출순이 아닌 팀 순서)**
      const l1Keys = Object.keys(tree).sort(compareDeptOrder);

      l1Keys.forEach(l1 => {
        const isL1Exp = !!expandedDeptPivot[l1];
        html += `<tr class="row-channel"><td class="indent-step-1" style="background:#1E293B; color:#F8FAFC; font-weight:700;"><span class="toggle-icon" onclick="toggleDeptPivotNode('${l1}')">${isL1Exp?'-':'+'}</span>${l1}</td>${genCells(tree[l1])}</tr>`;
        if(isL1Exp) {
          const l2Keys = Object.keys(tree[l1].subs).sort((a,b)=>tree[l1].subs[b].total - tree[l1].subs[a].total);
          l2Keys.forEach(l2 => {
            const isL2Exp = !!expandedDeptPivot[`${l1}||${l2}`];
            html += `<tr class="row-category"><td class="indent-step-2" style="background:#151C2C; color:#CBD5E1;"><span class="toggle-icon" onclick="toggleDeptPivotNode('${l1}','${l2}')">${isL2Exp?'-':'+'}</span>${l2}</td>${genCells(tree[l1].subs[l2])}</tr>`;
            if(isL2Exp) {
              const l3Keys = Object.keys(tree[l1].subs[l2].subs).sort();
              l3Keys.forEach(l3 => { html += `<tr class="row-subcategory"><td class="indent-step-3" style="background:#11151F; color:#94A3B8;">${l3}</td>${genCells(tree[l1].subs[l2].subs[l3])}</tr>`; });
            }
          });
        }
      });
      html += `<tr class="row-grand-total"><td class="indent-step-1">총합계</td>`;
      years.forEach(yr => {
        const isExp = expandedDeptYearColumns[yr] !== false;
        if(isExp) { (yearMonthsMap[yr]||[]).forEach(m => { html += `<td style="text-align:right; font-weight: 500;">${totalByYM[`${yr}-${m}`]>0?Math.round(totalByYM[`${yr}-${m}`]).toLocaleString():'-'}</td>`; }); }
        html += `<td class="pv-num-sum">${totalByY[yr]>0?Math.round(totalByY[yr]).toLocaleString():'-'}</td>`;
      });
      html += `<td class="pv-num-total">${Math.round(grandTotalSum).toLocaleString()}</td></tr>`;
      document.getElementById('deptPivotTableBody').innerHTML = mapPivotHtml(html);
    }


    // ==========================================================================
    // 3. 담당자별 (부서/담당/대/광고주/채널) 5계층 피벗
    // ==========================================================================
    // 공용 엔진으로 이관됨(PIVOT_PRESETS.manager). 아래 원본은 USE_PIVOT_ENGINE=false용 되돌리기 장치.
    function renderManagerPivotTable() {
      if (typeof USE_PIVOT_ENGINE !== 'undefined' && USE_PIVOT_ENGINE) { renderPresetPivot('manager'); return; }
      const targetData = filteredData;
      const years = [...new Set(targetData.map(r => r.year))].sort((a,b)=>b-a);
      const yearMonthsMap = {};
      years.forEach(yr => { const monthsWithData = new Set(); targetData.filter(r => r.year === yr && r.amount > 0).forEach(r => monthsWithData.add(r.month)); yearMonthsMap[yr] = [...monthsWithData].sort((a,b)=>a-b); });

      let h1 = `<th rowspan="2" style="text-align:left; vertical-align:middle;">구분</th>`, h2 = ``;
      years.forEach(yr => {
        const isExp = expandedMgrYearColumns[yr] !== false; const activeMonths = yearMonthsMap[yr] || [];
        if (isExp) { h1 += `<th colspan="${activeMonths.length+1}"><span class="year-toggle-btn" onclick="toggleYearColumn('mgr', ${yr})">-</span> ${yr}년</th>`; activeMonths.forEach(m => h2 += `<th>${m}월</th>`); h2 += `<th class="pv-th-summary">${yr}년 요약</th>`; } 
        else { h1 += `<th rowspan="1"><span class="year-toggle-btn" onclick="toggleYearColumn('mgr', ${yr})">+</span> ${yr}년</th>`; h2 += `<th class="pv-th-summary">${yr}년 요약</th>`; }
      });
      h1 += `<th rowspan="2" class="pv-th-total" style="z-index:35;">총합계</th>`;
      document.getElementById('mgrPivotHeaderRow1').innerHTML = mapPivotHtml(h1); document.getElementById('mgrPivotHeaderRow2').innerHTML = mapPivotHtml(h2);

      let grandTotalSum = 0; let totalByYM = {}; let totalByY = {};
      const tree = {};
      targetData.forEach(r => {
        const yr = r.year || 2025; const m = r.month || 1; const amtM = r.amount / 1000000;
        const l1 = r.dept || '(미지정)'; const l2 = r.manager || '(미지정)'; const l3 = r.categoryReclassified || '기타'; const l4 = r.advertiser || '(미지정)'; const l5 = r.channel || '(미지정)';
        if(!tree[l1]) tree[l1] = { total:0, yrs:{}, subs:{} };
        if(!tree[l1].subs[l2]) tree[l1].subs[l2] = { total:0, yrs:{}, subs:{} };
        if(!tree[l1].subs[l2].subs[l3]) tree[l1].subs[l2].subs[l3] = { total:0, yrs:{}, subs:{} };
        if(!tree[l1].subs[l2].subs[l3].subs[l4]) tree[l1].subs[l2].subs[l3].subs[l4] = { total:0, yrs:{}, subs:{} };
        if(!tree[l1].subs[l2].subs[l3].subs[l4].subs[l5]) tree[l1].subs[l2].subs[l3].subs[l4].subs[l5] = { total:0, yrs:{} };
        const addToNode = (node) => { node.total += amtM; if(!node.yrs[yr]) node.yrs[yr] = { sum:0, m:{} }; node.yrs[yr].sum += amtM; node.yrs[yr].m[m] = (node.yrs[yr].m[m]||0) + amtM; };
        addToNode(tree[l1]); addToNode(tree[l1].subs[l2]); addToNode(tree[l1].subs[l2].subs[l3]); addToNode(tree[l1].subs[l2].subs[l3].subs[l4]); addToNode(tree[l1].subs[l2].subs[l3].subs[l4].subs[l5]);
        const ym = `${yr}-${m}`; totalByYM[ym] = (totalByYM[ym]||0) + amtM; totalByY[yr] = (totalByY[yr]||0) + amtM; grandTotalSum += amtM;
      });
      document.getElementById('managerPivotTotalAmount').innerText = `${Math.round(grandTotalSum).toLocaleString()} 백만`;

      const genCells = (node, fontW='normal') => {
        let cells = '';
        years.forEach(yr => {
          const isExp = expandedMgrYearColumns[yr] !== false; const activeM = yearMonthsMap[yr] || []; const yrObj = (node && node.yrs[yr]) ? node.yrs[yr] : {sum:0, m:{}};
          if(isExp) { activeM.forEach(m => { cells += `<td style="text-align:right; font-weight:${fontW};">${yrObj.m[m]>0?Math.round(yrObj.m[m]).toLocaleString():'-'}</td>`; }); }
          cells += `<td style="text-align:right; font-weight: 400; background:rgba(30,58,138,0.1);">${yrObj.sum>0?Math.round(yrObj.sum).toLocaleString():'-'}</td>`;
        });
        cells += `<td style="text-align:right; font-weight: 500; background:rgba(30,64,175,0.2);">${node?Math.round(node.total).toLocaleString():'-'}</td>`;
        return cells;
      };

      let html = '';
      // **부서 정렬 로직 적용 (매출순이 아닌 팀 순서)**
      const l1Keys = Object.keys(tree).sort(compareDeptOrder);

      l1Keys.forEach(l1 => {
        const isL1Exp = !!expandedMgrPivot[l1];
        html += `<tr><td class="indent-step-1" style="background:#1E293B; color:#F8FAFC; font-weight:700;"><span class="toggle-icon" onclick="toggleMgrPivotNode('${l1}')">${isL1Exp?'-':'+'}</span>${l1}</td>${genCells(tree[l1], '700')}</tr>`;
        if(isL1Exp) {
          const l2Keys = Object.keys(tree[l1].subs).sort((a,b)=>tree[l1].subs[b].total - tree[l1].subs[a].total);
          l2Keys.forEach(l2 => {
            const isL2Exp = !!expandedMgrPivot[`${l1}||${l2}`];
            html += `<tr><td class="indent-step-2" style="background:#151C2C; color:#CBD5E1; font-weight:700;"><span class="toggle-icon" onclick="toggleMgrPivotNode('${l1}','${l2}')">${isL2Exp?'-':'+'}</span>${l2}</td>${genCells(tree[l1].subs[l2], '600')}</tr>`;
            if(isL2Exp) {
              const l3Keys = Object.keys(tree[l1].subs[l2].subs).sort((a,b)=>tree[l1].subs[l2].subs[b].total - tree[l1].subs[l2].subs[a].total);
              l3Keys.forEach(l3 => {
                const isL3Exp = !!expandedMgrPivot[`${l1}||${l2}||${l3}`];
                html += `<tr><td class="indent-step-3" style="background:#11151F; color:#94A3B8;"><span class="toggle-icon" onclick="toggleMgrPivotNode('${l1}','${l2}','${l3}')">${isL3Exp?'-':'+'}</span>${l3}</td>${genCells(tree[l1].subs[l2].subs[l3], '500')}</tr>`;
                if(isL3Exp) {
                  const l4Keys = Object.keys(tree[l1].subs[l2].subs[l3].subs).sort((a,b)=>tree[l1].subs[l2].subs[l3].subs[b].total - tree[l1].subs[l2].subs[l3].subs[a].total);
                  l4Keys.forEach(l4 => {
                    const isL4Exp = !!expandedMgrPivot[`${l1}||${l2}||${l3}||${l4}`];
                    html += `<tr><td class="indent-step-4" style="background:#0D1117; color:#64748B;"><span class="toggle-icon" onclick="toggleMgrPivotNode('${l1}','${l2}','${l3}','${l4}')">${isL4Exp?'-':'+'}</span>${l4}</td>${genCells(tree[l1].subs[l2].subs[l3].subs[l4], '400')}</tr>`;
                    if(isL4Exp) {
                      const l5Keys = Object.keys(tree[l1].subs[l2].subs[l3].subs[l4].subs).sort((a,b)=>tree[l1].subs[l2].subs[l3].subs[l4].subs[b].total - tree[l1].subs[l2].subs[l3].subs[l4].subs[a].total);
                      l5Keys.forEach(l5 => { html += `<tr><td class="indent-step-5" style="background:#090C10; color:#475569; font-size:12px;">${l5}</td>${genCells(tree[l1].subs[l2].subs[l3].subs[l4].subs[l5], '400')}</tr>`; });
                    }
                  });
                }
              });
            }
          });
        }
      });
      html += `<tr class="row-grand-total"><td class="indent-step-1">총합계</td>`;
      years.forEach(yr => {
        const isExp = expandedMgrYearColumns[yr] !== false;
        if(isExp) { (yearMonthsMap[yr]||[]).forEach(m => { html += `<td style="text-align:right; font-weight: 500;">${totalByYM[`${yr}-${m}`]>0?Math.round(totalByYM[`${yr}-${m}`]).toLocaleString():'-'}</td>`; }); }
        html += `<td class="pv-num-sum">${totalByY[yr]>0?Math.round(totalByY[yr]).toLocaleString():'-'}</td>`;
      });
      html += `<td class="pv-num-total">${Math.round(grandTotalSum).toLocaleString()}</td></tr>`;
      document.getElementById('mgrPivotTableBody').innerHTML = mapPivotHtml(html);
    }


    // ==========================================================================
    // 차트 렌더링
    // ==========================================================================
    function renderChannelPivotTable() {
      // 공용 엔진으로 이관됨(PIVOT_PRESETS.channel). 아래 원본은 USE_PIVOT_ENGINE=false용 되돌리기 장치.
      if (typeof USE_PIVOT_ENGINE !== 'undefined' && USE_PIVOT_ENGINE) { renderPresetPivot('channel'); return; }
      const targetData = filteredData;
      const years = [...new Set(targetData.map(r => r.year))].sort((a,b)=>b-a);
      const yearMonthsMap = {}; years.forEach(yr => { const monthsWithData = new Set(); targetData.filter(r => r.year === yr && r.amount > 0).forEach(r => monthsWithData.add(r.month)); yearMonthsMap[yr] = [...monthsWithData].sort((a,b)=>a-b); });

      let headerRow1 = `<th rowspan="2" style="text-align: left; vertical-align: middle;">구분</th>`; let headerRow2 = ``;
      years.forEach(yr => {
        const isExpanded = expandedYearColumns[yr] !== false; const activeMonths = yearMonthsMap[yr] || []; const toggleSymbol = isExpanded ? '-' : '+';
        if (isExpanded) {
          headerRow1 += `<th colspan="${activeMonths.length + 1}" style="text-align: center;"><span class="year-toggle-btn" onclick="toggleYearColumn('channel', ${yr})">${toggleSymbol}</span> ${yr}년</th>`;
          activeMonths.forEach(m => { headerRow2 += `<th style="text-align: center;">${m}월</th>`; });
          headerRow2 += `<th style="text-align: center; background: #1E3A8A !important; color: #93C5FD !important;">${yr}년 요약</th>`;
        } else { headerRow1 += `<th rowspan="1" style="text-align: center;"><span class="year-toggle-btn" onclick="toggleYearColumn('channel', ${yr})">${toggleSymbol}</span> ${yr}년</th>`; headerRow2 += `<th style="text-align: center; background: #1E3A8A !important; color: #93C5FD !important;">${yr}년 요약</th>`; }
      });
      headerRow1 += `<th rowspan="2" style="text-align: center; background: #1E40AF !important; color: #FFFFFF !important; font-weight: 500; vertical-align: middle; z-index: 35;">총합계</th>`;
      document.getElementById('pivotTableHeaderRow1').innerHTML = mapPivotHtml(headerRow1); document.getElementById('pivotTableHeaderRow2').innerHTML = mapPivotHtml(headerRow2);

      const channelTree = {}; let grandTotalSum = 0; let grandTotalByYearMonth = {}; let grandTotalByYear = {};    
      years.forEach(yr => { grandTotalByYear[yr] = 0; const activeMonths = yearMonthsMap[yr] || []; activeMonths.forEach(m => { grandTotalByYearMonth[`${yr}-${m}`] = 0; }); });

      targetData.forEach(r => {
        const yr = r.year || 2025; const ch = r.channel || '(미지정)'; const cat = r.categoryReclassified || '기타'; const subCat = r.subCategory || '일반'; const m = r.month || 1; const amtMillion = (r.amount || 0) / 1000000;
        if (!channelTree[ch]) channelTree[ch] = { totalSum: 0, years: {}, categories: {} };
        if (!channelTree[ch].years[yr]) channelTree[ch].years[yr] = { yearSum: 0, months: {} };
        const ymKey = `${yr}-${m}`; channelTree[ch].years[yr].months[m] = (channelTree[ch].years[yr].months[m] || 0) + amtMillion; channelTree[ch].years[yr].yearSum += amtMillion; channelTree[ch].totalSum += amtMillion;
        if (!channelTree[ch].categories[cat]) channelTree[ch].categories[cat] = { totalSum: 0, years: {}, subCategories: {} };
        if (!channelTree[ch].categories[cat].years[yr]) channelTree[ch].categories[cat].years[yr] = { yearSum: 0, months: {} };
        channelTree[ch].categories[cat].years[yr].months[m] = (channelTree[ch].categories[cat].years[yr].months[m] || 0) + amtMillion; channelTree[ch].categories[cat].years[yr].yearSum += amtMillion; channelTree[ch].categories[cat].totalSum += amtMillion;
        if (!channelTree[ch].categories[cat].subCategories[subCat]) channelTree[ch].categories[cat].subCategories[subCat] = { totalSum: 0, years: {} };
        if (!channelTree[ch].categories[cat].subCategories[subCat].years[yr]) channelTree[ch].categories[cat].subCategories[subCat].years[yr] = { yearSum: 0, months: {} };
        channelTree[ch].categories[cat].subCategories[subCat].years[yr].yearSum += amtMillion; channelTree[ch].categories[cat].subCategories[subCat].totalSum += amtMillion;
        if (grandTotalByYearMonth[ymKey] !== undefined) grandTotalByYearMonth[ymKey] += amtMillion; grandTotalByYear[yr] = (grandTotalByYear[yr] || 0) + amtMillion; grandTotalSum += amtMillion;
      });

      document.getElementById('pivotTotalAmount').innerText = `${Math.round(grandTotalSum).toLocaleString()} 백만`;
      let tbodyHtml = ''; const targetOrder = ['ENA', 'ENA DRAMA', 'ENA PLAY', 'ENA STORY', 'ONCE', 'OLIFE', 'ENA SPORTS', '기타', 'CHING', 'ONT', '헬스메디TV'];
      const channels = Object.keys(channelTree).sort((a,b) => { let idxA = targetOrder.indexOf(a); let idxB = targetOrder.indexOf(b); if (idxA !== -1 && idxB !== -1) return idxA - idxB; if (idxA !== -1) return -1; if (idxB !== -1) return 1; return a.localeCompare(b); });

      channels.forEach(ch => {
        const chData = channelTree[ch]; const isChExpanded = !!expandedChannels[ch];
        tbodyHtml += `<tr class="row-channel"><td class="indent-step-1"><strong><span class="toggle-icon" onclick="toggleChannelNode('${ch}')">${isChExpanded ? '-' : '+'}</span>${ch}</strong></td>`;
        years.forEach(yr => {
          const isYrExpanded = expandedYearColumns[yr] !== false; const activeMonths = yearMonthsMap[yr] || []; const yrObj = chData.years[yr] || { yearSum: 0, months: {} };
          if (isYrExpanded) { activeMonths.forEach(m => { const val = yrObj.months[m] || 0; tbodyHtml += `<td style="text-align: right; font-weight: 400;">${val > 0 ? Math.round(val).toLocaleString() : '-'}</td>`; }); tbodyHtml += `<td style="text-align: right; font-weight: 500; color: #93C5FD; background: #1E293B;">${yrObj.yearSum > 0 ? Math.round(yrObj.yearSum).toLocaleString() : '-'}</td>`; } 
          else { tbodyHtml += `<td style="text-align: right; font-weight: 500; color: #93C5FD; background: #1E293B;">${yrObj.yearSum > 0 ? Math.round(yrObj.yearSum).toLocaleString() : '-'}</td>`; }
        });
        tbodyHtml += `<td style="text-align: right; font-weight: 500; color: #60A5FA; background: #1E3A8A;">${Math.round(chData.totalSum).toLocaleString()}</td></tr>`;
        
        if (isChExpanded) {
          const categories = Object.keys(chData.categories).sort((a,b) => { let idxA = categoryOrderList.indexOf(a); let idxB = categoryOrderList.indexOf(b); if (idxA !== -1 && idxB !== -1) return idxA - idxB; if (idxA !== -1) return -1; if (idxB !== -1) return 1; return a.localeCompare(b); });
          categories.forEach(cat => {
            const catKey = `${ch}||${cat}`; const isCatExpanded = !!expandedCategories[catKey]; const catData = chData.categories[cat];
            tbodyHtml += `<tr class="row-category"><td class="indent-step-2" style="background: #151C2C; color: #CBD5E1;"><span style="display:inline-flex; align-items:center;"><span class="toggle-icon" onclick="toggleCategoryNode('${ch}', '${cat}')">${isCatExpanded ? '-' : '+'}</span>${cat}</span></td>`;
            years.forEach(yr => {
              const isYrExpanded = expandedYearColumns[yr] !== false; const activeMonths = yearMonthsMap[yr] || []; const yrObj = catData.years[yr] || { yearSum: 0, months: {} };
              if (isYrExpanded) { activeMonths.forEach(m => { const val = yrObj.months[m] || 0; tbodyHtml += `<td style="text-align: right; font-weight: 500;">${val > 0 ? Math.round(val).toLocaleString() : '-'}</td>`; }); tbodyHtml += `<td style="text-align: right; font-weight: 600; background: #172033;">${yrObj.yearSum > 0 ? Math.round(yrObj.yearSum).toLocaleString() : '-'}</td>`; } 
              else { tbodyHtml += `<td style="text-align: right; font-weight: 600; background: #172033;">${yrObj.yearSum > 0 ? Math.round(yrObj.yearSum).toLocaleString() : '-'}</td>`; }
            });
            tbodyHtml += `<td style="text-align: right; font-weight: 400; background: #1E293B; color: #93C5FD;">${Math.round(catData.totalSum).toLocaleString()}</td></tr>`;

            if (isCatExpanded) {
              const subCategories = Object.keys(catData.subCategories).sort();
              subCategories.forEach(subCat => {
                const subCatData = catData.subCategories[subCat];
                tbodyHtml += `<tr class="row-subcategory"><td class="indent-step-3" style="background: #11151F; color: #94A3B8;">${subCat}</td>`;
                years.forEach(yr => {
                  const isYrExpanded = expandedYearColumns[yr] !== false; const activeMonths = yearMonthsMap[yr] || []; const yrObj = subCatData.years[yr] || { yearSum: 0, months: {} };
                  if (isYrExpanded) { activeMonths.forEach(m => { const val = yrObj.months[m] || 0; tbodyHtml += `<td style="text-align: right; font-weight: 400;">${val > 0 ? Math.round(val).toLocaleString() : '-'}</td>`; }); tbodyHtml += `<td style="text-align: right; font-weight: 500; background: #141824;">${yrObj.yearSum > 0 ? Math.round(yrObj.yearSum).toLocaleString() : '-'}</td>`; } 
                  else { tbodyHtml += `<td style="text-align: right; font-weight: 500; background: #141824;">${yrObj.yearSum > 0 ? Math.round(yrObj.yearSum).toLocaleString() : '-'}</td>`; }
                });
                tbodyHtml += `<td style="text-align: right; font-weight: 600; background: #1A2234; color: #93C5FD;">${Math.round(subCatData.totalSum).toLocaleString()}</td></tr>`;
              });
            }
          });
        }
      });
      tbodyHtml += `<tr class="row-grand-total"><td class="indent-step-1">총합계</td>`;
      years.forEach(yr => {
        const isYrExpanded = expandedYearColumns[yr] !== false; const activeMonths = yearMonthsMap[yr] || [];
        if (isYrExpanded) { activeMonths.forEach(m => { const ymKey = `${yr}-${m}`; const val = grandTotalByYearMonth[ymKey] || 0; tbodyHtml += `<td style="text-align: right; font-weight: 500; color: #FFFFFF;">${val > 0 ? Math.round(val).toLocaleString() : '-'}</td>`; }); const ySumVal = grandTotalByYear[yr] || 0; tbodyHtml += `<td style="text-align: right; font-weight: 500; color: #93C5FD; background: #1E3A8A;">${ySumVal > 0 ? Math.round(ySumVal).toLocaleString() : '-'}</td>`; } 
        else { const ySumVal = grandTotalByYear[yr] || 0; tbodyHtml += `<td style="text-align: right; font-weight: 500; color: #93C5FD; background: #1E3A8A;">${ySumVal > 0 ? Math.round(ySumVal).toLocaleString() : '-'}</td>`; }
      });
      tbodyHtml += `<td style="text-align: right; font-weight: 500; color: #FFFFFF; background: #1D4ED8;">${Math.round(grandTotalSum).toLocaleString()}</td></tr>`;
      document.getElementById('pivotTableBody').innerHTML = mapPivotHtml(tbodyHtml);
    }

    function renderAdvertiserPivotTable() {
      // 공용 엔진으로 이관됨(PIVOT_PRESETS.advertiser). 아래 원본은 USE_PIVOT_ENGINE=false용 되돌리기 장치.
      if (typeof USE_PIVOT_ENGINE !== 'undefined' && USE_PIVOT_ENGINE) { renderPresetPivot('advertiser'); return; }
      // 광고주 ➔ 대분류 (2단계 트리), 일반광고+IMC 기준
      const targetData = filteredData.filter(r => r.categoryOriginal === '일반광고' || r.categoryOriginal === 'IMC');
      const years = [...new Set(targetData.map(r => r.year))].sort((a,b)=>b-a);
      const yearMonthsMap = {}; years.forEach(yr => { const monthsWithData = new Set(); targetData.filter(r => r.year === yr && r.amount > 0).forEach(r => monthsWithData.add(r.month)); yearMonthsMap[yr] = [...monthsWithData].sort((a,b)=>a-b); });

      let headerRow1 = `<th rowspan="2" style="text-align: left; vertical-align: middle;">구분</th>`; let headerRow2 = ``;
      years.forEach(yr => {
        const isExpanded = expandedAdvertiserYearColumns[yr] !== false; const activeMonths = yearMonthsMap[yr] || []; const toggleSymbol = isExpanded ? '-' : '+';
        if (isExpanded) {
          headerRow1 += `<th colspan="${activeMonths.length + 1}" style="text-align: center;"><span class="year-toggle-btn" onclick="toggleYearColumn('advertiser', ${yr})">${toggleSymbol}</span> ${yr}년</th>`;
          activeMonths.forEach(m => { headerRow2 += `<th style="text-align: center;">${m}월</th>`; });
          headerRow2 += `<th style="text-align: center; background: #1E3A8A !important; color: #93C5FD !important;">${yr}년 요약</th>`;
        } else { headerRow1 += `<th rowspan="1" style="text-align: center;"><span class="year-toggle-btn" onclick="toggleYearColumn('advertiser', ${yr})">${toggleSymbol}</span> ${yr}년</th>`; headerRow2 += `<th style="text-align: center; background: #1E3A8A !important; color: #93C5FD !important;">${yr}년 요약</th>`; }
      });
      headerRow1 += `<th rowspan="2" style="text-align: center; background: #1E40AF !important; color: #FFFFFF !important; font-weight: 500; vertical-align: middle; z-index: 35;">총합계</th>`;
      document.getElementById('advertiserPivotHeaderRow1').innerHTML = mapPivotHtml(headerRow1); document.getElementById('advertiserPivotHeaderRow2').innerHTML = mapPivotHtml(headerRow2);

      const advTree = {}; let grandTotalSum = 0; let grandTotalByYearMonth = {}; let grandTotalByYear = {};
      years.forEach(yr => { grandTotalByYear[yr] = 0; const activeMonths = yearMonthsMap[yr] || []; activeMonths.forEach(m => { grandTotalByYearMonth[`${yr}-${m}`] = 0; }); });

      targetData.forEach(r => {
        const yr = r.year || 2025; const adv = r.advertiser || '(미지정)'; const cat = r.categoryReclassified || '기타'; const m = r.month || 1; const amtMillion = (r.amount || 0) / 1000000;
        if (!advTree[adv]) advTree[adv] = { totalSum: 0, years: {}, categories: {} };
        if (!advTree[adv].years[yr]) advTree[adv].years[yr] = { yearSum: 0, months: {} };
        const ymKey = `${yr}-${m}`; advTree[adv].years[yr].months[m] = (advTree[adv].years[yr].months[m] || 0) + amtMillion; advTree[adv].years[yr].yearSum += amtMillion; advTree[adv].totalSum += amtMillion;
        if (!advTree[adv].categories[cat]) advTree[adv].categories[cat] = { totalSum: 0, years: {} };
        if (!advTree[adv].categories[cat].years[yr]) advTree[adv].categories[cat].years[yr] = { yearSum: 0, months: {} };
        advTree[adv].categories[cat].years[yr].months[m] = (advTree[adv].categories[cat].years[yr].months[m] || 0) + amtMillion; advTree[adv].categories[cat].years[yr].yearSum += amtMillion; advTree[adv].categories[cat].totalSum += amtMillion;
        if (grandTotalByYearMonth[ymKey] !== undefined) grandTotalByYearMonth[ymKey] += amtMillion; grandTotalByYear[yr] = (grandTotalByYear[yr] || 0) + amtMillion; grandTotalSum += amtMillion;
      });

      document.getElementById('advertiserPivotTotalAmount').innerText = `${Math.round(grandTotalSum).toLocaleString()} 백만`;
      const advertisers = Object.keys(advTree).sort((a,b) => advTree[b].totalSum - advTree[a].totalSum);

      let tbodyHtml = '';
      advertisers.forEach(adv => {
        const advData = advTree[adv]; const isAdvExpanded = !!expandedAdvertisers[adv]; const advEsc = adv.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        tbodyHtml += `<tr class="row-channel"><td class="indent-step-1"><strong><span class="toggle-icon" onclick="toggleAdvertiserNode('${advEsc}')">${isAdvExpanded ? '-' : '+'}</span>${adv}</strong></td>`;
        years.forEach(yr => {
          const isYrExpanded = expandedAdvertiserYearColumns[yr] !== false; const activeMonths = yearMonthsMap[yr] || []; const yrObj = advData.years[yr] || { yearSum: 0, months: {} };
          if (isYrExpanded) { activeMonths.forEach(m => { const val = yrObj.months[m] || 0; tbodyHtml += `<td style="text-align: right; font-weight: 400;">${val > 0 ? Math.round(val).toLocaleString() : '-'}</td>`; }); tbodyHtml += `<td style="text-align: right; font-weight: 500; color: #93C5FD; background: #1E293B;">${yrObj.yearSum > 0 ? Math.round(yrObj.yearSum).toLocaleString() : '-'}</td>`; }
          else { tbodyHtml += `<td style="text-align: right; font-weight: 500; color: #93C5FD; background: #1E293B;">${yrObj.yearSum > 0 ? Math.round(yrObj.yearSum).toLocaleString() : '-'}</td>`; }
        });
        tbodyHtml += `<td style="text-align: right; font-weight: 500; color: #60A5FA; background: #1E3A8A;">${Math.round(advData.totalSum).toLocaleString()}</td></tr>`;

        if (isAdvExpanded) {
          const categories = Object.keys(advData.categories).sort((a,b) => { let idxA = categoryOrderList.indexOf(a); let idxB = categoryOrderList.indexOf(b); if (idxA !== -1 && idxB !== -1) return idxA - idxB; if (idxA !== -1) return -1; if (idxB !== -1) return 1; return a.localeCompare(b); });
          categories.forEach(cat => {
            const catData = advData.categories[cat];
            tbodyHtml += `<tr class="row-category"><td class="indent-step-2" style="background: #151C2C; color: #CBD5E1;">${cat}</td>`;
            years.forEach(yr => {
              const isYrExpanded = expandedAdvertiserYearColumns[yr] !== false; const activeMonths = yearMonthsMap[yr] || []; const yrObj = catData.years[yr] || { yearSum: 0, months: {} };
              if (isYrExpanded) { activeMonths.forEach(m => { const val = yrObj.months[m] || 0; tbodyHtml += `<td style="text-align: right; font-weight: 500;">${val > 0 ? Math.round(val).toLocaleString() : '-'}</td>`; }); tbodyHtml += `<td style="text-align: right; font-weight: 600; background: #172033;">${yrObj.yearSum > 0 ? Math.round(yrObj.yearSum).toLocaleString() : '-'}</td>`; }
              else { tbodyHtml += `<td style="text-align: right; font-weight: 600; background: #172033;">${yrObj.yearSum > 0 ? Math.round(yrObj.yearSum).toLocaleString() : '-'}</td>`; }
            });
            tbodyHtml += `<td style="text-align: right; font-weight: 400; background: #1E293B; color: #93C5FD;">${Math.round(catData.totalSum).toLocaleString()}</td></tr>`;
          });
        }
      });

      tbodyHtml += `<tr class="row-grand-total"><td class="indent-step-1">총합계</td>`;
      years.forEach(yr => {
        const isYrExpanded = expandedAdvertiserYearColumns[yr] !== false; const activeMonths = yearMonthsMap[yr] || [];
        if (isYrExpanded) { activeMonths.forEach(m => { const ymKey = `${yr}-${m}`; const val = grandTotalByYearMonth[ymKey] || 0; tbodyHtml += `<td style="text-align: right; font-weight: 500; color: #FFFFFF;">${val > 0 ? Math.round(val).toLocaleString() : '-'}</td>`; }); const ySumVal = grandTotalByYear[yr] || 0; tbodyHtml += `<td style="text-align: right; font-weight: 500; color: #93C5FD; background: #1E3A8A;">${ySumVal > 0 ? Math.round(ySumVal).toLocaleString() : '-'}</td>`; }
        else { const ySumVal = grandTotalByYear[yr] || 0; tbodyHtml += `<td style="text-align: right; font-weight: 500; color: #93C5FD; background: #1E3A8A;">${ySumVal > 0 ? Math.round(ySumVal).toLocaleString() : '-'}</td>`; }
      });
      tbodyHtml += `<td style="text-align: right; font-weight: 500; color: #FFFFFF; background: #1D4ED8;">${Math.round(grandTotalSum).toLocaleString()}</td></tr>`;
      document.getElementById('advertiserPivotTableBody').innerHTML = mapPivotHtml(tbodyHtml);
    }

    function renderAgencyPivotTable() {
      // 공용 엔진으로 이관됨(PIVOT_PRESETS.agency). 아래 원본은 USE_PIVOT_ENGINE=false용 되돌리기 장치.
      if (typeof USE_PIVOT_ENGINE !== 'undefined' && USE_PIVOT_ENGINE) { renderPresetPivot('agency'); return; }
      // 대행사그룹 ➔ 대행사 ➔ 광고주 (3단계 트리), 일반광고+IMC 기준
      const targetData = filteredData.filter(r => r.categoryOriginal === '일반광고' || r.categoryOriginal === 'IMC');
      const years = [...new Set(targetData.map(r => r.year))].sort((a,b)=>b-a);
      const yearMonthsMap = {}; years.forEach(yr => { const monthsWithData = new Set(); targetData.filter(r => r.year === yr && r.amount > 0).forEach(r => monthsWithData.add(r.month)); yearMonthsMap[yr] = [...monthsWithData].sort((a,b)=>a-b); });

      let headerRow1 = `<th rowspan="2" style="text-align: left; vertical-align: middle;">구분</th>`; let headerRow2 = ``;
      years.forEach(yr => {
        const isExpanded = expandedAgencyYearColumns[yr] !== false; const activeMonths = yearMonthsMap[yr] || []; const toggleSymbol = isExpanded ? '-' : '+';
        if (isExpanded) {
          headerRow1 += `<th colspan="${activeMonths.length + 1}" style="text-align: center;"><span class="year-toggle-btn" onclick="toggleYearColumn('agency', ${yr})">${toggleSymbol}</span> ${yr}년</th>`;
          activeMonths.forEach(m => { headerRow2 += `<th style="text-align: center;">${m}월</th>`; });
          headerRow2 += `<th style="text-align: center; background: #1E3A8A !important; color: #93C5FD !important;">${yr}년 요약</th>`;
        } else { headerRow1 += `<th rowspan="1" style="text-align: center;"><span class="year-toggle-btn" onclick="toggleYearColumn('agency', ${yr})">${toggleSymbol}</span> ${yr}년</th>`; headerRow2 += `<th style="text-align: center; background: #1E3A8A !important; color: #93C5FD !important;">${yr}년 요약</th>`; }
      });
      headerRow1 += `<th rowspan="2" style="text-align: center; background: #1E40AF !important; color: #FFFFFF !important; font-weight: 500; vertical-align: middle; z-index: 35;">총합계</th>`;
      document.getElementById('agencyPivotHeaderRow1').innerHTML = mapPivotHtml(headerRow1); document.getElementById('agencyPivotHeaderRow2').innerHTML = mapPivotHtml(headerRow2);

      const grpTree = {}; let grandTotalSum = 0; let grandTotalByYearMonth = {}; let grandTotalByYear = {};
      years.forEach(yr => { grandTotalByYear[yr] = 0; const activeMonths = yearMonthsMap[yr] || []; activeMonths.forEach(m => { grandTotalByYearMonth[`${yr}-${m}`] = 0; }); });

      targetData.forEach(r => {
        const yr = r.year || 2025; const grp = r.agencyGroup || '(미지정)'; const agy = r.agency || '(미지정)'; const adv = r.advertiser || '(미지정)'; const m = r.month || 1; const amtMillion = (r.amount || 0) / 1000000;
        if (!grpTree[grp]) grpTree[grp] = { totalSum: 0, years: {}, agencies: {} };
        if (!grpTree[grp].years[yr]) grpTree[grp].years[yr] = { yearSum: 0, months: {} };
        const ymKey = `${yr}-${m}`; grpTree[grp].years[yr].months[m] = (grpTree[grp].years[yr].months[m] || 0) + amtMillion; grpTree[grp].years[yr].yearSum += amtMillion; grpTree[grp].totalSum += amtMillion;
        if (!grpTree[grp].agencies[agy]) grpTree[grp].agencies[agy] = { totalSum: 0, years: {}, advertisers: {} };
        if (!grpTree[grp].agencies[agy].years[yr]) grpTree[grp].agencies[agy].years[yr] = { yearSum: 0, months: {} };
        grpTree[grp].agencies[agy].years[yr].months[m] = (grpTree[grp].agencies[agy].years[yr].months[m] || 0) + amtMillion; grpTree[grp].agencies[agy].years[yr].yearSum += amtMillion; grpTree[grp].agencies[agy].totalSum += amtMillion;
        if (!grpTree[grp].agencies[agy].advertisers[adv]) grpTree[grp].agencies[agy].advertisers[adv] = { totalSum: 0, years: {} };
        if (!grpTree[grp].agencies[agy].advertisers[adv].years[yr]) grpTree[grp].agencies[agy].advertisers[adv].years[yr] = { yearSum: 0, months: {} };
        grpTree[grp].agencies[agy].advertisers[adv].years[yr].months[m] = (grpTree[grp].agencies[agy].advertisers[adv].years[yr].months[m] || 0) + amtMillion; grpTree[grp].agencies[agy].advertisers[adv].years[yr].yearSum += amtMillion; grpTree[grp].agencies[agy].advertisers[adv].totalSum += amtMillion;
        if (grandTotalByYearMonth[ymKey] !== undefined) grandTotalByYearMonth[ymKey] += amtMillion; grandTotalByYear[yr] = (grandTotalByYear[yr] || 0) + amtMillion; grandTotalSum += amtMillion;
      });

      document.getElementById('agencyPivotTotalAmount').innerText = `${Math.round(grandTotalSum).toLocaleString()} 백만`;
      const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const groups = Object.keys(grpTree).sort((a,b) => grpTree[b].totalSum - grpTree[a].totalSum);

      let tbodyHtml = '';
      groups.forEach(grp => {
        const grpData = grpTree[grp]; const isGrpExpanded = !!expandedAgencyGroups[grp];
        tbodyHtml += `<tr class="row-channel"><td class="indent-step-1"><strong><span class="toggle-icon" onclick="toggleAgencyGroupNode('${esc(grp)}')">${isGrpExpanded ? '-' : '+'}</span>${grp}</strong></td>`;
        years.forEach(yr => {
          const isYrExpanded = expandedAgencyYearColumns[yr] !== false; const activeMonths = yearMonthsMap[yr] || []; const yrObj = grpData.years[yr] || { yearSum: 0, months: {} };
          if (isYrExpanded) { activeMonths.forEach(m => { const val = yrObj.months[m] || 0; tbodyHtml += `<td style="text-align: right; font-weight: 400;">${val > 0 ? Math.round(val).toLocaleString() : '-'}</td>`; }); tbodyHtml += `<td style="text-align: right; font-weight: 500; color: #93C5FD; background: #1E293B;">${yrObj.yearSum > 0 ? Math.round(yrObj.yearSum).toLocaleString() : '-'}</td>`; }
          else { tbodyHtml += `<td style="text-align: right; font-weight: 500; color: #93C5FD; background: #1E293B;">${yrObj.yearSum > 0 ? Math.round(yrObj.yearSum).toLocaleString() : '-'}</td>`; }
        });
        tbodyHtml += `<td style="text-align: right; font-weight: 500; color: #60A5FA; background: #1E3A8A;">${Math.round(grpData.totalSum).toLocaleString()}</td></tr>`;

        if (isGrpExpanded) {
          const agencies = Object.keys(grpData.agencies).sort((a,b) => grpData.agencies[b].totalSum - grpData.agencies[a].totalSum);
          agencies.forEach(agy => {
            const agyKey = `${grp}||${agy}`; const isAgyExpanded = !!expandedAgencies[agyKey]; const agyData = grpData.agencies[agy];
            tbodyHtml += `<tr class="row-category"><td class="indent-step-2" style="background: #151C2C; color: #CBD5E1;"><span style="display:inline-flex; align-items:center;"><span class="toggle-icon" onclick="toggleAgencyNode('${esc(grp)}', '${esc(agy)}')">${isAgyExpanded ? '-' : '+'}</span>${agy}</span></td>`;
            years.forEach(yr => {
              const isYrExpanded = expandedAgencyYearColumns[yr] !== false; const activeMonths = yearMonthsMap[yr] || []; const yrObj = agyData.years[yr] || { yearSum: 0, months: {} };
              if (isYrExpanded) { activeMonths.forEach(m => { const val = yrObj.months[m] || 0; tbodyHtml += `<td style="text-align: right; font-weight: 500;">${val > 0 ? Math.round(val).toLocaleString() : '-'}</td>`; }); tbodyHtml += `<td style="text-align: right; font-weight: 600; background: #172033;">${yrObj.yearSum > 0 ? Math.round(yrObj.yearSum).toLocaleString() : '-'}</td>`; }
              else { tbodyHtml += `<td style="text-align: right; font-weight: 600; background: #172033;">${yrObj.yearSum > 0 ? Math.round(yrObj.yearSum).toLocaleString() : '-'}</td>`; }
            });
            tbodyHtml += `<td style="text-align: right; font-weight: 400; background: #1E293B; color: #93C5FD;">${Math.round(agyData.totalSum).toLocaleString()}</td></tr>`;

            if (isAgyExpanded) {
              const advertisers = Object.keys(agyData.advertisers).sort((a,b) => agyData.advertisers[b].totalSum - agyData.advertisers[a].totalSum);
              advertisers.forEach(adv => {
                const advData = agyData.advertisers[adv];
                tbodyHtml += `<tr class="row-subcategory"><td class="indent-step-3" style="background: #11151F; color: #94A3B8;">${adv}</td>`;
                years.forEach(yr => {
                  const isYrExpanded = expandedAgencyYearColumns[yr] !== false; const activeMonths = yearMonthsMap[yr] || []; const yrObj = advData.years[yr] || { yearSum: 0, months: {} };
                  if (isYrExpanded) { activeMonths.forEach(m => { const val = yrObj.months[m] || 0; tbodyHtml += `<td style="text-align: right; font-weight: 400;">${val > 0 ? Math.round(val).toLocaleString() : '-'}</td>`; }); tbodyHtml += `<td style="text-align: right; font-weight: 500; background: #141824;">${yrObj.yearSum > 0 ? Math.round(yrObj.yearSum).toLocaleString() : '-'}</td>`; }
                  else { tbodyHtml += `<td style="text-align: right; font-weight: 500; background: #141824;">${yrObj.yearSum > 0 ? Math.round(yrObj.yearSum).toLocaleString() : '-'}</td>`; }
                });
                tbodyHtml += `<td style="text-align: right; font-weight: 600; background: #1A2234; color: #93C5FD;">${Math.round(advData.totalSum).toLocaleString()}</td></tr>`;
              });
            }
          });
        }
      });

      tbodyHtml += `<tr class="row-grand-total"><td class="indent-step-1">총합계</td>`;
      years.forEach(yr => {
        const isYrExpanded = expandedAgencyYearColumns[yr] !== false; const activeMonths = yearMonthsMap[yr] || [];
        if (isYrExpanded) { activeMonths.forEach(m => { const ymKey = `${yr}-${m}`; const val = grandTotalByYearMonth[ymKey] || 0; tbodyHtml += `<td style="text-align: right; font-weight: 500; color: #FFFFFF;">${val > 0 ? Math.round(val).toLocaleString() : '-'}</td>`; }); const ySumVal = grandTotalByYear[yr] || 0; tbodyHtml += `<td style="text-align: right; font-weight: 500; color: #93C5FD; background: #1E3A8A;">${ySumVal > 0 ? Math.round(ySumVal).toLocaleString() : '-'}</td>`; }
        else { const ySumVal = grandTotalByYear[yr] || 0; tbodyHtml += `<td style="text-align: right; font-weight: 500; color: #93C5FD; background: #1E3A8A;">${ySumVal > 0 ? Math.round(ySumVal).toLocaleString() : '-'}</td>`; }
      });
      tbodyHtml += `<td style="text-align: right; font-weight: 500; color: #FFFFFF; background: #1D4ED8;">${Math.round(grandTotalSum).toLocaleString()}</td></tr>`;
      document.getElementById('agencyPivotTableBody').innerHTML = mapPivotHtml(tbodyHtml);
    }
    const bucketTierOrder = ['1억 이상', '0.5~1억원', '0.4~0.5억원', '0.3~0.4억원', '0.2~0.3억원', '0.1~0.2억원', '0.1억원 미만'];
