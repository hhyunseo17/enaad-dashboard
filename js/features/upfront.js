// ============================================================
// js/features/upfront.js
// 업프론트 계약 대비 실적: 계산+피벗 (계약 병합/파싱은 data-loader 참조)
// ============================================================
    function computeUpfrontPivotData() {
      if (selectedYears.length !== 1) return null;
      const cy = selectedYears[0];
      const rows = filteredData.filter(r => r.isUpfront && r.year === cy);
      const months = [...new Set(rows.map(r => r.month))].sort((a,b) => a - b);
      return { cy, months, rows };
    }

    // 계약 참조를 노드에 모은다. 계약 식별 키는 계약기간(연-월)만 사용한다 — 같은 기간에 GROSS/NET 행이
    // 별도로 존재해도 동일 계약이므로 금액 텍스트가 달라도 병합한다(data-loader.js의 contractMap과 같은
    // 그룹핑 기준, 대원칙 6).
    function upAddContract(node, r) {
      if (!r.contractAmountText) return;
      const periodKey = (r.contractStartYM ? r.contractStartYM.y + '-' + r.contractStartYM.m : '') + '~' + (r.contractEndYM ? r.contractEndYM.y + '-' + r.contractEndYM.m : '');
      const baseText = r.contractAmountText.replace(' (NET)', '');
      // (NET) 표기는 GROSS/NET 컬럼이 아니라 업프론트 비고란에 "net"이 명시된 경우에만 붙인다.
      const remarkHasNet = /net/i.test(r.upfrontRemark || '');
      const existing = node.contractByPeriod[periodKey];
      if (!existing) {
        node.contractByPeriod[periodKey] = { baseText: baseText, hasNet: remarkHasNet, start: r.contractStartDate, end: r.contractEndDate };
      } else {
        if (remarkHasNet) existing.hasNet = true;
        if (r.contractStartDate && (!existing.start || r.contractStartDate < existing.start)) existing.start = r.contractStartDate;
        if (r.contractEndDate && (!existing.end || r.contractEndDate > existing.end)) existing.end = r.contractEndDate;
      }
    }

    // 행 축을 배열로 받는 트리. 노드마다 월별 금액·합계·계약 참조를 누적한다.
    // **계약 병합 단위는 노드다.** 행 위계를 바꾸면 병합 단위도 바뀌므로 계약금액·시작일·종료일의
    // 표시값이 정당하게 달라진다(오류가 아니다).
    function upBuildTree(rows, rowFields) {
      const makeNode = () => ({ months: {}, total: 0, contractByPeriod: {}, children: {} });
      const root = makeNode();
      rows.forEach(r => {
        let n = root;
        const touch = (node) => {
          node.months[r.month] = (node.months[r.month] || 0) + r.amount;
          node.total += r.amount;
          upAddContract(node, r);
        };
        touch(n);
        rowFields.forEach(f => {
          const raw = r[f];
          const v = (raw === undefined || raw === null || raw === '') ? '(미지정)' : String(raw);
          if (!n.children[v]) n.children[v] = makeNode();
          n = n.children[v]; touch(n);
        });
      });
      return root;
    }

    function openUpfrontPivotView() { switchView('upfrontPivot'); }
    // 행 토글은 일반 피벗과 공용(togglePvRowNode)이다. 아래 둘은 예전 표기를 위한 래퍼.
    function toggleUpfrontDeptNode(dept) { togglePvRowNode('upfrontPivot', dept); }
    function toggleUpfrontAdvertiserNode(dept, adv) { togglePvRowNode('upfrontPivot', dept + '||' + adv); }
    function expandAllUpfrontNodes(state) {
      const data = computeUpfrontPivotData(); if (!data) return;
      const map = PIVOT_PRESETS.upfrontPivot.expandedRows();
      const rowFields = pvConfigFor('upfrontPivot').rows;
      (function walk(node, path, depth) {
        if (depth >= rowFields.length - 1) return; // 잎은 펼칠 것이 없다
        Object.keys(node.children).forEach(k => {
          const p = path.concat(k);
          map[p.join('||')] = state;
          walk(node.children[k], p, depth + 1);
        });
      })(upBuildTree(data.rows, rowFields), [], 0);
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

    // 깊이별 셀 색. 원본이 인라인으로 넣던 값 그대로다(mapPivotHtml의 치환 키라 표기를 바꾸지 말 것).
    const UP_STYLES = [
      { rowClass: 'row-channel', label: '', wrap: (s) => `<strong>${s}</strong>`,
        num: 'text-align: right; font-weight: 400;', total: 'text-align: right; font-weight: 500; color: #60A5FA;' },
      { rowClass: 'row-category', label: 'background: #151C2C; color: #CBD5E1;',
        num: 'text-align: right;', total: 'text-align: right; font-weight: 400; color: #93C5FD;' },
      { rowClass: 'row-subcategory', label: 'background: #11151F; color: #94A3B8;',
        num: 'text-align: right;', total: 'text-align: right;' },
      { rowClass: '', label: 'background:#0D1117; color:#64748B;', num: 'text-align: right;', total: 'text-align: right;' },
      { rowClass: '', label: 'background:#090C10; color:#475569; font-size:12px;', num: 'text-align: right;', total: 'text-align: right;' },
    ];

    function upOpenRowSortMenu(ev, depth) {
      return pvOpenMetricRowSortMenu(ev, 'upfrontPivot', depth, [['total', '금액']], 'pvPickMetricRowSort');
    }
    // 열 헤더 기준 행 정렬용 값. 월 키는 HTML에서 문자열로 돌아오지만 months의 키도 문자열이라 그대로 닿는다.
    function upColValue(n, key) { return key === PV_GRAND ? n.total : (n.months[key] || 0); }

    // 한 노드의 계약 참조를 화면 문구로. 병합 단위가 노드이므로 어느 위계에 놓이느냐에 따라 달라진다.
    function upContractCells(node) {
      const raw = Object.values(node.contractByPeriod).map(c => ({ text: c.baseText + (c.hasNet ? ' (NET)' : ''), start: c.start, end: c.end }));
      const contracts = mergeContractRefs(raw);
      if (contracts.length === 0) return { text: '-', start: null, end: null };
      return {
        text: contracts.map(c => c.text).join(', '),
        start: contracts.reduce((min, c) => (!min || (c.start && c.start < min)) ? c.start : min, null),
        end: contracts.reduce((max, c) => (!max || (c.end && c.end > max)) ? c.end : max, null),
      };
    }

    function renderUpfrontPivotTable() {
      const data = computeUpfrontPivotData();
      const tbody = document.getElementById('upfrontPivotTableBody');
      const cfg = pvConfigFor('upfrontPivot');
      renderPvBuilderPanel('upfrontPivot');
      const resetBtn = document.getElementById('upfrontPivotResetBtn');
      if (resetBtn) resetBtn.style.display = pvIsConfigDefault('upfrontPivot') ? 'none' : '';
      if (!data) { document.getElementById('upfrontPivotHeaderRow').innerHTML = `<th style="text-align: left;">구분</th><th style="text-align: left;">업프론트 계약금액</th><th style="text-align: center;">계약시작일</th><th style="text-align: center;">계약종료일</th>`; tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 40px; color: var(--text-secondary);">연도를 1개만 선택하면 표시됩니다.</td></tr>`; document.getElementById('upfrontPivotTotalAmount').innerText = `0 억원`; return; }

      const { cy, months, rows } = data;
      const rowFields = cfg.rows;
      document.getElementById('upfrontPivotTitle').innerText = `업프론트 실적 현황 (${cy}년)`;

      // 계약금액·기간 열은 **업프론트광고주가 행 축에 있을 때만** 둔다. 계약은 그 광고주 단위로 맺어지므로,
      // 축에서 빠지면 어느 줄에 붙여야 할지가 없어진다(부서 줄에 계약금액을 적으면 여러 계약이 뭉개진다).
      const contractDepth = rowFields.indexOf('upfrontAdvertiser');
      const contractCols = contractDepth >= 0;
      // 월 열과 총합계 열은 정렬 대상이다 — 좌클릭이 방향을 토글하고, 우클릭으로 오름/내림을 직접 고른다.
      // 계약 세 열은 노드마다 병합된 텍스트·기간이라 정렬 대상으로 두지 않는다.
      const upCs = cfg.colSort;
      const sortTh = (key, label) => `<th style="text-align: right;" data-pvsort="1" onclick="pvSortByColumn('upfrontPivot','${key}')" oncontextmenu="return pvOpenFixedColMenu(event,'upfrontPivot','${key}','${label}')">${label}${pvColSortMark('upfrontPivot', key)}</th>`;
      let headerHtml = `<th style="text-align: left;" data-pvsort="1" onclick="pvClearColumnSort('upfrontPivot')" oncontextmenu="return upOpenRowSortMenu(event,0)" title="클릭: 열 기준 정렬 해제 · 우클릭: 첫 단계 정렬">구분${upCs ? ' ↺' : ''}</th>`;
      if (contractCols) headerHtml += `<th style="text-align: left;">업프론트 계약금액</th><th style="text-align: center;">계약시작일</th><th style="text-align: center;">계약종료일</th>`;
      months.forEach(m => { headerHtml += sortTh(m, `${m}월`); });
      headerHtml += sortTh(PV_GRAND, '총합계');
      document.getElementById('upfrontPivotHeaderRow').innerHTML = mapPivotHtml(headerHtml);

      const fmtEok = (won) => { const v = won / 1e8; if (!v) return '-'; return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
      const blanks = (bg) => contractCols ? `<td${bg}></td><td${bg}></td><td${bg}></td>` : '';

      if (rowFields.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${1 + (contractCols ? 3 : 0) + months.length + 1}" style="text-align:center; padding: 40px; color: var(--text-secondary);">행 영역에 필드를 놓으세요</td></tr>`;
        document.getElementById('upfrontPivotTotalAmount').innerText = `0 억원`;
        return;
      }

      const root = upBuildTree(rows, rowFields);
      const expandedRows = PIVOT_PRESETS.upfrontPivot.expandedRows();
      const out = [];

      const monthCells = (node, style) => months.map(m => `<td style="${style}">${fmtEok(node.months[m] || 0)}</td>`).join('');

      (function renderLevel(node, depth, ancestorPath) {
        const hasMore = depth + 1 < rowFields.length;
        const field = rowFields[depth];
        // 열 헤더에서 건 정렬은 모든 레벨에 같이 걸린다. 레벨마다 다르게 두려면 행 라벨 우클릭을 쓴다.
        let keys;
        if (cfg.colSort) {
          const sign = cfg.colSort.dir === 'asc' ? 1 : -1;
          keys = Object.keys(node.children).sort((a, b) =>
            sign * (upColValue(node.children[a], cfg.colSort.pathKey) - upColValue(node.children[b], cfg.colSort.pathKey)));
        } else {
          const sorter = pvMetricRowSorter(field, cfg, (n) => n.total, (a, b, na, nb) => nb.total - na.total);
          keys = Object.keys(node.children).sort((a, b) => sorter(a, b, node.children[a], node.children[b]));
        }
        keys.forEach(k => {
          const child = node.children[k];
          const path = ancestorPath.concat(k);
          const pathKey = path.join('||');
          const isExpanded = !!expandedRows[pathKey];
          const st = UP_STYLES[Math.min(depth, UP_STYLES.length - 1)];
          const toggle = hasMore ? `<span class="toggle-icon" onclick="togglePvRowNode('upfrontPivot','${pvEsc(pathKey)}')">${isExpanded ? '-' : '+'}</span>` : '';
          const inner = toggle + pvFormatFieldValue(field, k);
          const label = st.wrap ? st.wrap(inner) : inner;
          const trClass = st.rowClass ? ` class="${st.rowClass}"` : '';
          const menu = ` oncontextmenu="return upOpenRowSortMenu(event,${depth})"`;
          let cells = '';
          if (contractCols) {
            if (depth === contractDepth) {
              const c = upContractCells(child);
              cells = `<td style="color: #93C5FD;">${c.text}</td><td style="text-align: center;">${fmtDateShort(c.start)}</td><td style="text-align: center;">${fmtDateShort(c.end)}</td>`;
            } else cells = blanks('');
          }
          out.push(`<tr${trClass}><td class="indent-step-${Math.min(depth + 1, 5)}"${menu} style="${st.label}">${label}</td>${cells}`
            + `${monthCells(child, st.num)}<td style="${st.total}">${fmtEok(child.total)}</td></tr>`);

          if (hasMore && isExpanded) {
            renderLevel(child, depth + 1, path);
            // 첫 단계를 펼치면 그 아래가 길어져 무엇의 하위였는지 놓치기 쉬워서, 끝에 그 단계 합을 한 번 더 적는다.
            if (depth === 0) {
              out.push(`<tr class="row-category" style="border-top: 1px solid var(--border-default);"><td class="indent-step-1" style="font-weight: 700; background: #1E293B;">${pvFormatFieldValue(field, k)} 요약</td>`
                + blanks(' style="background: #1E293B;"')
                + months.map(m => `<td style="text-align: right; font-weight: 500; background: #1E293B;">${fmtEok(child.months[m] || 0)}</td>`).join('')
                + `<td style="text-align: right; font-weight: 500; background: #1E293B; color: #93C5FD;">${fmtEok(child.total)}</td></tr>`);
            }
          }
        });
      })(root, 0, []);

      document.getElementById('upfrontPivotTotalAmount').innerText = `${(root.total / 1e8).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 억원`;

      let html = out.join('');
      html += `<tr class="row-grand-total"><td class="indent-step-1">총합계</td>${blanks('')}`;
      months.forEach(m => { html += `<td style="text-align: right;">${fmtEok(root.months[m] || 0)}</td>`; });
      html += `<td style="text-align: right;">${fmtEok(root.total)}</td></tr>`;

      tbody.innerHTML = mapPivotHtml(html);
    }

