// ============================================================
// js/features/upfront.js
// 업프론트 계약 대비 실적: 계산+피벗 (계약 병합/파싱은 data-loader 참조)
// ============================================================
    function computeUpfrontPivotData() {
      if (selectedYears.length !== 1) return null;
      const cy = selectedYears[0];
      const rows = filteredData.filter(r => r.isUpfront && r.year === cy);
      const months = [...new Set(rows.map(r => r.month))].sort((a,b) => a - b);

      const tree = {};
      rows.forEach(r => {
        const dept = r.dept; const adv = r.upfrontAdvertiser; const agy = r.agency;
        if (!tree[dept]) tree[dept] = { months: {}, total: 0, advertisers: {} };
        tree[dept].months[r.month] = (tree[dept].months[r.month] || 0) + r.amount;
        tree[dept].total += r.amount;

        const advKey = adv;
        if (!tree[dept].advertisers[advKey]) tree[dept].advertisers[advKey] = { months: {}, total: 0, agencies: {}, contractByPeriod: {} };
        const advNode = tree[dept].advertisers[advKey];
        advNode.months[r.month] = (advNode.months[r.month] || 0) + r.amount;
        advNode.total += r.amount;
        if (r.contractAmountText) {
          // 계약 식별 키는 계약기간(연-월)만 사용한다. 같은 기간에 GROSS/NET 행이 별도로 존재해도
          // 동일 계약이므로 금액 텍스트가 달라도 병합 — data-loader.js의 contractMap과 동일한 그룹핑 기준(원칙 6).
          const periodKey = (r.contractStartYM ? r.contractStartYM.y + '-' + r.contractStartYM.m : '') + '~' + (r.contractEndYM ? r.contractEndYM.y + '-' + r.contractEndYM.m : '');
          const baseText = r.contractAmountText.replace(' (NET)', '');
          // (NET) 표기는 GROSS/NET 컬럼이 아니라 업프론트 비고란에 "net"이 명시된 경우에만 붙인다.
          const remarkHasNet = /net/i.test(r.upfrontRemark || '');
          const existing = advNode.contractByPeriod[periodKey];
          if (!existing) {
            advNode.contractByPeriod[periodKey] = { baseText, hasNet: remarkHasNet, start: r.contractStartDate, end: r.contractEndDate };
          } else {
            if (remarkHasNet) existing.hasNet = true;
            if (r.contractStartDate && (!existing.start || r.contractStartDate < existing.start)) existing.start = r.contractStartDate;
            if (r.contractEndDate && (!existing.end || r.contractEndDate > existing.end)) existing.end = r.contractEndDate;
          }
        }

        if (!advNode.agencies[agy]) advNode.agencies[agy] = { months: {}, total: 0 };
        advNode.agencies[agy].months[r.month] = (advNode.agencies[agy].months[r.month] || 0) + r.amount;
        advNode.agencies[agy].total += r.amount;
      });

      return { cy, months, tree };
    }

    function openUpfrontPivotView() { switchView('upfrontPivot'); }
    function toggleUpfrontDeptNode(dept) { expandedUpfrontDepts[dept] = !expandedUpfrontDepts[dept]; renderUpfrontPivotTable(); }
    function toggleUpfrontAdvertiserNode(dept, adv) { const key = dept + '||' + adv; expandedUpfrontAdvertisers[key] = !expandedUpfrontAdvertisers[key]; renderUpfrontPivotTable(); }
    function expandAllUpfrontNodes(state) {
      const data = computeUpfrontPivotData(); if (!data) return;
      Object.keys(data.tree).forEach(dept => {
        expandedUpfrontDepts[dept] = state;
        Object.keys(data.tree[dept].advertisers).forEach(adv => { expandedUpfrontAdvertisers[dept + '||' + adv] = state; });
      });
      renderUpfrontPivotTable();
    }

    function fmtDateShort(d) { if (!d) return '-'; return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`; }

    function mergeContractRefs(list) {
      const byText = {};
      list.forEach(c => { if (!byText[c.text]) byText[c.text] = []; byText[c.text].push(c); });
      const merged = [];
      Object.values(byText).forEach(arr => {
        arr.sort((a,b) => (a.start ? a.start.getTime() : 0) - (b.start ? b.start.getTime() : 0));
        let cur = null;
        arr.forEach(c => {
          if (!cur) { cur = { text: c.text, start: c.start, end: c.end }; return; }
          const curEndTime = cur.end ? cur.end.getTime() : -Infinity;
          const cStartTime = c.start ? c.start.getTime() : Infinity;
          if (cStartTime <= curEndTime) { if (c.end && (!cur.end || c.end > cur.end)) cur.end = c.end; }
          else { merged.push(cur); cur = { text: c.text, start: c.start, end: c.end }; }
        });
        if (cur) merged.push(cur);
      });
      return merged;
    }

    function renderUpfrontPivotTable() {
      const data = computeUpfrontPivotData();
      const tbody = document.getElementById('upfrontPivotTableBody');
      if (!data) { document.getElementById('upfrontPivotHeaderRow').innerHTML = `<th style="text-align: left;">부서 / 광고주(업프론트용) / 대행사</th><th style="text-align: left;">업프론트 계약금액</th><th style="text-align: center;">계약시작일</th><th style="text-align: center;">계약종료일</th>`; tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 40px; color: var(--text-secondary);">연도를 1개만 선택하면 표시됩니다.</td></tr>`; document.getElementById('upfrontPivotTotalAmount').innerText = `0 억원`; return; }

      const { cy, months, tree } = data;
      document.getElementById('upfrontPivotTitle').innerText = `업프론트 실적 현황 (${cy}년)`;

      let headerHtml = `<th style="text-align: left;">부서 / 광고주(업프론트용) / 대행사</th><th style="text-align: left;">업프론트 계약금액</th><th style="text-align: center;">계약시작일</th><th style="text-align: center;">계약종료일</th>`;
      months.forEach(m => { headerHtml += `<th style="text-align: right;">${m}월</th>`; });
      headerHtml += `<th style="text-align: right;">총합계</th>`;
      document.getElementById('upfrontPivotHeaderRow').innerHTML = mapPivotHtml(headerHtml);

      const fmtEok = (won) => { const v = won / 1e8; if (!v) return '-'; return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

      const depts = Object.keys(tree).sort(compareDeptOrder);
      let grandTotal = 0; const grandMonthTotals = {}; months.forEach(m => { grandMonthTotals[m] = 0; });

      let html = '';
      depts.forEach(dept => {
        const dNode = tree[dept]; const isDeptExpanded = !!expandedUpfrontDepts[dept];
        grandTotal += dNode.total; months.forEach(m => { grandMonthTotals[m] += (dNode.months[m] || 0); });

        html += `<tr class="row-channel"><td class="indent-step-1"><strong><span class="toggle-icon" onclick="toggleUpfrontDeptNode('${dept.replace(/'/g,"\\'")}')">${isDeptExpanded ? '-' : '+'}</span>${dept}</strong></td><td></td><td></td><td></td>`;
        months.forEach(m => { html += `<td style="text-align: right; font-weight: 400;">${fmtEok(dNode.months[m] || 0)}</td>`; });
        html += `<td style="text-align: right; font-weight: 500; color: #60A5FA;">${fmtEok(dNode.total)}</td></tr>`;

        if (isDeptExpanded) {
          const advertisers = Object.keys(dNode.advertisers).sort((a,b) => dNode.advertisers[b].total - dNode.advertisers[a].total);
          advertisers.forEach(adv => {
            const aNode = dNode.advertisers[adv]; const advKey = dept + '||' + adv; const isAdvExpanded = !!expandedUpfrontAdvertisers[advKey];
            const contractRaw = Object.values(aNode.contractByPeriod).map(c => ({ text: c.baseText + (c.hasNet ? ' (NET)' : ''), start: c.start, end: c.end }));
            const contracts = mergeContractRefs(contractRaw);
            const contractText = contracts.length > 0 ? contracts.map(c => c.text).join(', ') : '-';
            const startD = contracts.length > 0 ? contracts.reduce((min,c) => (!min || (c.start && c.start < min)) ? c.start : min, null) : null;
            const endD = contracts.length > 0 ? contracts.reduce((max,c) => (!max || (c.end && c.end > max)) ? c.end : max, null) : null;

            html += `<tr class="row-category"><td class="indent-step-2" style="background: #151C2C; color: #CBD5E1;"><span class="toggle-icon" onclick="toggleUpfrontAdvertiserNode('${dept.replace(/'/g,"\\'")}', '${adv.replace(/'/g,"\\'")}')">${isAdvExpanded ? '-' : '+'}</span>${adv}</td><td style="color: #93C5FD;">${contractText}</td><td style="text-align: center;">${fmtDateShort(startD)}</td><td style="text-align: center;">${fmtDateShort(endD)}</td>`;
            months.forEach(m => { html += `<td style="text-align: right;">${fmtEok(aNode.months[m] || 0)}</td>`; });
            html += `<td style="text-align: right; font-weight: 400; color: #93C5FD;">${fmtEok(aNode.total)}</td></tr>`;

            if (isAdvExpanded) {
              const agencies = Object.keys(aNode.agencies).sort((a,b) => aNode.agencies[b].total - aNode.agencies[a].total);
              agencies.forEach(agy => {
                const gNode = aNode.agencies[agy];
                html += `<tr class="row-subcategory"><td class="indent-step-3" style="background: #11151F; color: #94A3B8;">${agy}</td><td></td><td></td><td></td>`;
                months.forEach(m => { html += `<td style="text-align: right;">${fmtEok(gNode.months[m] || 0)}</td>`; });
                html += `<td style="text-align: right;">${fmtEok(gNode.total)}</td></tr>`;
              });
            }
          });
          html += `<tr class="row-category" style="border-top: 1px solid var(--border-default);"><td class="indent-step-1" style="font-weight: 700; background: #1E293B;">${dept} 요약</td><td style="background: #1E293B;"></td><td style="background: #1E293B;"></td><td style="background: #1E293B;"></td>`;
          months.forEach(m => { html += `<td style="text-align: right; font-weight: 500; background: #1E293B;">${fmtEok(dNode.months[m] || 0)}</td>`; });
          html += `<td style="text-align: right; font-weight: 500; background: #1E293B; color: #93C5FD;">${fmtEok(dNode.total)}</td></tr>`;
        }
      });

      document.getElementById('upfrontPivotTotalAmount').innerText = `${(grandTotal / 1e8).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 억원`;

      html += `<tr class="row-grand-total"><td class="indent-step-1">총합계</td><td></td><td></td><td></td>`;
      months.forEach(m => { html += `<td style="text-align: right;">${fmtEok(grandMonthTotals[m])}</td>`; });
      html += `<td style="text-align: right;">${fmtEok(grandTotal)}</td></tr>`;

      tbody.innerHTML = mapPivotHtml(html);
    }

