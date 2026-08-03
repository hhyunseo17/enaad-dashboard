// ============================================================
// js/core/data-loader.js
// 데이터 연결·파싱·정규화(프론트/백 경계) + 엑셀 export/유틸 — Supabase 전환 시 이 파일 교체
// ============================================================
    function setupEventListeners() {
      document.getElementById('excelFileInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) readManualFile(file);
      });
      document.getElementById('btnToggleDropzone').addEventListener('click', () => {
        const dz = document.getElementById('fileDropzone');
        dz.style.display = (dz.style.display === 'flex') ? 'none' : 'flex';
      });
      const dz = document.getElementById('fileDropzone');
      dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('active'); });
      dz.addEventListener('dragleave', () => dz.classList.remove('active'));
      dz.addEventListener('drop', (e) => {
        e.preventDefault();
        dz.classList.remove('active');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) readManualFile(e.dataTransfer.files[0]);
      });
      document.getElementById('inputAgency').addEventListener('input', applyFilters);
      document.getElementById('inputAdvertiser').addEventListener('input', applyFilters);
      setupMonthPills();
      window.addEventListener('click', (e) => {
        if (!e.target.closest('.multi-dropdown')) document.querySelectorAll('.multi-dropdown-panel').forEach(p => p.classList.remove('show'));
      });
    }

    function toggleMultiDropdown(type) {
      const panel = document.getElementById(`panel${type}`);
      const isShow = panel.classList.contains('show');
      document.querySelectorAll('.multi-dropdown-panel').forEach(p => p.classList.remove('show'));
      if (!isShow) panel.classList.add('show');
    }

    function setRevenueBasis(mode) {
      revenueBasisMode = mode;
      document.getElementById('btnBasisPerformance').classList.toggle('active', mode === 'performance');
      document.getElementById('btnBasisAccounting').classList.toggle('active', mode === 'accounting');
      applyFilters();
    }
    function setChannelScale(mode) {
      channelScaleMode = mode;
      document.getElementById('btnChannelLinear').classList.toggle('active', mode === 'linear');
      document.getElementById('btnChannelLog').classList.toggle('active', mode === 'logarithmic');
      renderChannelChart();
    }

    function initDataConnection() {
      const isHttp = location.protocol.startsWith('http');
      const dot = document.getElementById('statusDot');
      const text = document.getElementById('statusModeText');
      if (isHttp) {
        dot.className = 'status-dot'; text.innerText = '실시간 연결됨 (30분 주기)';
        document.getElementById('btnToggleDropzone').style.display = 'none';
        fetchDataHttp(); setInterval(fetchDataHttp, 1800000);
      } else {
        dot.className = 'status-dot manual'; text.innerText = '수동 업로드 모드';
        document.getElementById('btnToggleDropzone').style.display = '';
        showLoading(false); document.getElementById('fileDropzone').style.display = 'flex';
      }
    }

    function fetchDataHttp() {
      if (typeof DATA_URL === 'undefined') {
        console.error('DATA_URL is not defined. Ensure js/core/state.js is loaded before data-loader.js');
        showLoading(false);
        showErrorMessage('데이터 URL이 정의되어 있지 않습니다. 스크립트 로드 순서에 문제가 있습니다. (state.js 확인)');
        return;
      }
      showLoading(true);
      const cacheBustUrl = DATA_URL + '?t=' + Date.now();
      fetch(cacheBustUrl, { cache: 'no-store', credentials: 'include' })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
          // Detect Cloudflare Access redirect which returns HTML login page
          if (res.url && res.url.includes('cloudflareaccess.com')) throw new Error('Cloudflare Access authentication required');
          const lm = res.headers.get('last-modified');
          return res.arrayBuffer().then(buf => ({ buf, lm }));
        })
        .then(({ buf, lm }) => {
          processWorkbookBuffer(buf);
          const modDate = workbookModifiedDate || (lm ? new Date(lm) : null);
          document.getElementById('fileLastModified').innerText = '원본 수정: ' + (modDate ? modDate.toLocaleString() : '확인 불가');
          document.getElementById('statusDot').className = 'status-dot'; document.getElementById('statusModeText').innerText = '실시간 연결됨 (30분 주기)';
          document.getElementById('btnToggleDropzone').style.display = 'none';
          document.getElementById('fileDropzone').style.display = 'none';
          showLoading(false); hideErrorMessage();
        }).catch(err => {
          showLoading(false); showErrorMessage(`데이터 로드 실패: ${err.message}`);
          document.getElementById('fileDropzone').style.display = 'flex';
          document.getElementById('btnToggleDropzone').style.display = '';
          document.getElementById('statusDot').className = 'status-dot manual'; document.getElementById('statusModeText').innerText = '연결 실패 - 수동 업로드 필요';
        });
    }

    function readManualFile(file) {
      showLoading(true);
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          processWorkbookBuffer(e.target.result);
          const modDate = workbookModifiedDate || new Date(file.lastModified);
          document.getElementById('fileLastModified').innerText = '원본 수정: ' + modDate.toLocaleString();
          document.getElementById('statusDot').className = 'status-dot manual'; document.getElementById('statusModeText').innerText = '수동 업로드됨';
          showLoading(false); hideErrorMessage();
        } catch (err) {
          showLoading(false); showErrorMessage(`Excel 로드 오류: ${err.message}`);
        }
      };
      reader.onerror = () => { showLoading(false); showErrorMessage('파일을 읽는 중 오류가 발생했습니다.'); };
      reader.readAsArrayBuffer(file);
    }

    function processWorkbookBuffer(buffer) {
      try {
        const wb = XLSX.read(buffer, { type: 'array' });
        workbookModifiedDate = (wb.Props && wb.Props.ModifiedDate) ? wb.Props.ModifiedDate : null;
        let targetSheetName = wb.SheetNames.find(name => name.includes('변환'));
        if (!targetSheetName) targetSheetName = wb.SheetNames[0];
        
        const sheet = wb.Sheets[targetSheetName];
        rawSourceSheetRef = sheet;
        rawSourceSheetName = targetSheetName;
        const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });

        const bonbuRows = jsonRows.filter(r => {
          const isBonbu = (r['본부매출여부'] || '').toString().trim();
          const rawCat = (r['대분류'] || '').toString().trim();
          const rawSub = (r['중분류'] || '').toString().trim();
          // 매출 미인식 규칙: 교환광고는 전부 제외, 대행수익은 skylife큐톤(→큐톤광고로 분류)만 예외적으로 인정하고 나머지는 제외
          if (rawCat === '교환광고') return false;
          if (rawCat === '대행수익' && rawSub !== 'skylife큐톤') return false;
          return isBonbu === '본부매출';
        });

        let idxCounter = 0;
        rawData = [];

        bonbuRows.forEach(r => {
          const monthStr = parseMonthValue(r['귀속월']);
          const y = parseInt(monthStr.split('-')[0]) || 2025;
          const m = parseInt(monthStr.split('-')[1]) || 1;

          const rawCategory = (r['대분류'] || '기타').toString().trim();
          const rawSubCategory = (r['중분류'] || '(미지정)').toString().trim();
          const rawSubCategory3 = (r['소분류'] || '').toString().trim();
          const oneNFlag = (r['1/N여부'] || '').toString().trim();
          const reclassifiedCat = classifyCategory(rawCategory, rawSubCategory);
          const revBasis = (r['매출기준'] || '실적').toString().trim();
          const isBonbuVal = (r['본부매출여부'] || '').toString().trim();
          const adv = (r['광고주'] || '(미지정)').toString().trim();
          const broadDigitalVal = (r['방송디지털'] || r['방송/디지털'] || '기타').toString().trim();

          let rawChannel = (r['채널'] || r['매체'] || '(미지정)').toString().trim();
          let normalizedChannel = rawChannel;
          const upperCh = rawChannel.toUpperCase();
          if (upperCh.includes('CHING') || rawChannel.includes('채널ING')) normalizedChannel = 'CHING';
          else if (upperCh.includes('ONT')) normalizedChannel = 'ONT';
          else if (rawChannel.includes('헬스메디') || upperCh.includes('HEALTH')) normalizedChannel = '헬스메디TV';

          let rawGrp = (r['대행사그룹'] || r['대행사 그룹'] || r['대행사'] || '(미지정)').toString().trim();
          let agy = (r['대행사'] || '(미지정)').toString().trim();
          if (agy.includes('에스엠컨텐츠앤커뮤니케이션즈')) agy = 'SM C&C';
          let grpDisp = rawGrp;
          if (['캐러트코리아', '덴츠', '아이프로스펙트코리아', '엠플리파이', '휘닉스커뮤니케이션즈'].some(name => rawGrp.includes(name) || agy.includes(name))) {
            grpDisp = '덴츠(G)';
          } else if (rawGrp.includes('레오버넷') || rawGrp === '레오버넷') { grpDisp = '레오버넷(G)'; } 
          else if (rawGrp.includes('명애드컴') || rawGrp === '명애드컴') { grpDisp = '명애드컴'; } 
          else if (rawGrp.includes('HSAD') || rawGrp.includes('hsad') || rawGrp === 'HSAD') { grpDisp = 'HSAD(G)'; }
          else if (rawGrp.includes('옴니콤') || ['TBWA KOREA', 'TBWA', '비비디오코리아', 'BBDO', '옴니콤미디어그룹코리아', '옴니콤', 'PHD'].some(name => agy.includes(name))) { grpDisp = '옴니콤광고그룹'; }
          else if (rawGrp.includes('에스엠컨텐츠앤커뮤니케이션즈')) { grpDisp = 'SM C&C'; }

          let rowAmount = Number(r['금액']) || 0;
          if (!reclassifiedCat) return;

          const isUpfrontVal = (r['업프론트'] || '').toString().trim() === '업프론트';
          const contractStartYM = parseDateToYM(r['계약시작일']);
          const contractEndYM = parseDateToYM(r['계약종료일']);
          const contractStartDate = parseDateFull(r['계약시작일']);
          const contractEndDate = parseDateFull(r['계약종료일']);
          const contractAmountText = (r['업프론트 계약금액'] || '').toString().trim();
          const grossNetFlag = (r['GROSS/NET'] || '').toString().trim();
          const upfrontAdvertiser = (r['광고주(업프론트용)'] || adv || '(미지정)').toString().trim();

          rawData.push({
            id: idxCounter++, monthStr: monthStr, year: y, month: m,
            dept: (r['부서'] || '(미지정)').toString().trim(), manager: (r['담당자'] || '(미지정)').toString().trim(),
            advertiser: adv, agency: agy, agencyGroup: grpDisp, channel: normalizedChannel, industry: (r['업종대분류'] || '(미지정)').toString().trim(),
            broadDigital: broadDigitalVal, categoryOriginal: rawCategory, subCategory: rawSubCategory || '일반', subCategory3: rawSubCategory3,
            oneNFlag: oneNFlag, categoryReclassified: reclassifiedCat, revenueBasis: revBasis, bonbuRevenueStatus: isBonbuVal,
            remark: r['비고'], amount: rowAmount,
            isUpfront: isUpfrontVal, contractStartYM: contractStartYM, contractEndYM: contractEndYM,
            contractStartDate: contractStartDate, contractEndDate: contractEndDate,
            contractAmountText: contractAmountText, grossNetFlag: grossNetFlag, upfrontAdvertiser: upfrontAdvertiser
          });
        });

        // 신규광고주 판별용 인덱스 재구축 (advertiser별 amount>0 활동월을 1회만 스캔해 정렬 배열로 캐시)
        advertiserActiveMonthIndex = {};
        const seenAdvMonth = new Set();
        rawData.forEach(r => {
          if (r.amount <= 0) return;
          const dedupeKey = r.advertiser + '||' + r.monthStr;
          if (seenAdvMonth.has(dedupeKey)) return;
          seenAdvMonth.add(dedupeKey);
          if (!advertiserActiveMonthIndex[r.advertiser]) advertiserActiveMonthIndex[r.advertiser] = [];
          advertiserActiveMonthIndex[r.advertiser].push({ monthStr: r.monthStr, time: new Date(r.monthStr + '-01').getTime() });
        });
        Object.values(advertiserActiveMonthIndex).forEach(arr => arr.sort((a, b) => a.time - b.time));

        // 업프론트 계약 목록 재구축: 광고주(업프론트용)+계약시작+계약종료 기준 1차 유일 그룹 (대행사가 여러 개여도 1개 계약으로 묶음)
        const contractMap = {};
        rawData.forEach(r => {
          if (!r.isUpfront || !r.contractStartYM || !r.contractEndYM) return;
          const key = r.upfrontAdvertiser + '||' + r.contractStartYM.y + '-' + r.contractStartYM.m + '||' + r.contractEndYM.y + '-' + r.contractEndYM.m;
          if (!contractMap[key]) contractMap[key] = { advertiser: r.upfrontAdvertiser, start: r.contractStartYM, end: r.contractEndYM, amountText: r.contractAmountText, hasNet: false };
          if (r.grossNetFlag === 'NET') contractMap[key].hasNet = true;
        });

        // 2차: 같은 광고주 + 같은 계약금액 텍스트가 겹치는 기간으로 여러 번 등재된 경우(계약 갱신/재기재 등) 하나로 병합 - 중복 집계 방지
        const byAdvText = {};
        Object.values(contractMap).forEach(g => {
          const k = g.advertiser + '||' + g.amountText;
          if (!byAdvText[k]) byAdvText[k] = [];
          byAdvText[k].push(g);
        });
        const mergedGroups = [];
        Object.values(byAdvText).forEach(list => {
          list.sort((a,b) => (a.start.y * 12 + a.start.m) - (b.start.y * 12 + b.start.m));
          let current = null;
          list.forEach(g => {
            const gs = g.start.y * 12 + g.start.m; const ge = g.end.y * 12 + g.end.m;
            if (!current) { current = { advertiser: g.advertiser, amountText: g.amountText, hasNet: g.hasNet, sIdx: gs, eIdx: ge }; return; }
            if (gs <= current.eIdx) { current.eIdx = Math.max(current.eIdx, ge); current.hasNet = current.hasNet || g.hasNet; }
            else { mergedGroups.push(current); current = { advertiser: g.advertiser, amountText: g.amountText, hasNet: g.hasNet, sIdx: gs, eIdx: ge }; }
          });
          if (current) mergedGroups.push(current);
        });

        upfrontContracts = mergedGroups.map(g => {
          const parsed = parseContractAmountText(g.amountText);
          const targetWon = (g.hasNet && parsed.net != null) ? parsed.net : parsed.gross;
          const totalMonths = g.eIdx - g.sIdx + 1;
          const start = { y: Math.floor((g.sIdx - 1) / 12), m: ((g.sIdx - 1) % 12) + 1 };
          const end = { y: Math.floor((g.eIdx - 1) / 12), m: ((g.eIdx - 1) % 12) + 1 };
          return { advertiser: g.advertiser, start: start, end: end, amountText: g.amountText, hasNet: g.hasNet, grossWon: parsed.gross, netWon: parsed.net, targetWon: targetWon, totalMonths: totalMonths };
        }).filter(c => c.totalMonths > 0 && c.targetWon > 0);

        const allYears = [...new Set(rawData.map(r => r.year))];
        allYears.forEach(y => {
          if (expandedYearColumns[y] === undefined) expandedYearColumns[y] = true;
          if (expandedBucketYearColumns[y] === undefined) expandedBucketYearColumns[y] = true;
          if (expandedAdvertiserYearColumns[y] === undefined) expandedAdvertiserYearColumns[y] = true;
          if (expandedAgencyYearColumns[y] === undefined) expandedAgencyYearColumns[y] = true;
          if (expandedCatYearColumns[y] === undefined) expandedCatYearColumns[y] = true;
          if (expandedDeptYearColumns[y] === undefined) expandedDeptYearColumns[y] = true;
          if (expandedMgrYearColumns[y] === undefined) expandedMgrYearColumns[y] = true;
        });

        setupYearPills(isFirstLoad);
        updateFilterCheckboxes(isFirstLoad);
        applyFilters();
        isFirstLoad = false;
      } catch (err) { showLoading(false); showErrorMessage(`Excel 파싱 오류: ${err.message}`); }
    }

    function classifyCategory(rawCat, rawSub) {
      rawCat = (rawCat || '').toString().trim(); rawSub = (rawSub || '').toString().trim();
      const lowerSub = rawSub.toLowerCase();
      if (rawCat === '일반광고') return '일반광고'; if (rawCat === '인포머셜') return '인포머셜'; if (rawCat === 'IMC') return 'IMC';
      if (rawCat === '큐톤광고' || lowerSub.includes('skylife')) return '큐톤광고';
      if (['기타광고', '어드레서블', '콘텐츠편성', '기타수익', 'ARA', '대행수익'].includes(rawCat) || rawSub === '자사큐톤' || rawSub === '티온애드') return '기타광고';
      return rawCat || '기타광고';
    }

    function parseMonthValue(val) {
      if (!val) return '2025-01';
      if (val instanceof Date) return `${val.getUTCFullYear()}-${String(val.getUTCMonth() + 1).padStart(2, '0')}`;
      if (typeof val === 'number') { const parsed = XLSX.SSF.parse_date_code(val); if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}`; }
      const s = String(val).trim();
      if (s.length >= 7 && s.includes('-')) return s.substring(0, 7);
      return s || '2025-01';
    }

    function parseDateToYM(val) {
      if (!val) return null;
      if (val instanceof Date) return { y: val.getUTCFullYear(), m: val.getUTCMonth() + 1 };
      if (typeof val === 'number') { const parsed = XLSX.SSF.parse_date_code(val); if (parsed) return { y: parsed.y, m: parsed.m }; }
      const s = String(val).trim();
      const dm = s.match(/^(\d{4})[-./](\d{1,2})/);
      if (dm) return { y: parseInt(dm[1]), m: parseInt(dm[2]) };
      return null;
    }

    function parseDateFull(val) {
      if (!val) return null;
      if (val instanceof Date) return val;
      if (typeof val === 'number') { const p = XLSX.SSF.parse_date_code(val); if (p) return new Date(Date.UTC(p.y, p.m - 1, p.d || 1)); }
      const s = String(val).trim();
      const dm = s.match(/^(\d{4})[-./](\d{1,2})[-./]?(\d{0,2})/);
      if (dm) return new Date(Date.UTC(parseInt(dm[1]), parseInt(dm[2]) - 1, dm[3] ? parseInt(dm[3]) : 1));
      return null;
    }

    function parseContractAmountText(text) {
      if (!text) return { gross: 0, net: null };
      const s = text.toString();
      const baseMatch = s.match(/^\s*([0-9]+(?:\.[0-9]+)?)\s*억원/);
      const gross = baseMatch ? Math.round(parseFloat(baseMatch[1]) * 1e8) : 0;
      const netMatch = s.match(/Net\s*([0-9]+(?:\.[0-9]+)?)\s*억원/i);
      const net = netMatch ? Math.round(parseFloat(netMatch[1]) * 1e8) : null;
      return { gross, net };
    }

    function exportPivotExcel(viewType) {
      if (filteredData.length === 0) { alert('다운로드할 데이터가 없습니다.'); return; }
      let exportRows = []; let sheetName = '';

      if (viewType === 'cat') { sheetName = '분류별피벗테이블'; exportRows = filteredData.map(r => ({ '연도': r.year, '귀속월': r.monthStr, '대분류(원본)': r.categoryOriginal, '대분류(재분류)': r.categoryReclassified, '중분류': r.subCategory, '소분류': r.subCategory3, '금액(백만원)': Math.round(r.amount / 1000000) })); }
      else if (viewType === 'dept') { sheetName = '부서별피벗테이블'; exportRows = filteredData.map(r => ({ '연도': r.year, '귀속월': r.monthStr, '부서': r.dept, '대분류': r.categoryOriginal, '중분류': r.subCategory, '금액(백만원)': Math.round(r.amount / 1000000) })); }
      else if (viewType === 'mgr') { sheetName = '담당별피벗테이블'; exportRows = filteredData.map(r => ({ '연도': r.year, '귀속월': r.monthStr, '부서': r.dept, '담당자': r.manager, '대분류': r.categoryReclassified, '광고주': r.advertiser, '채널': r.channel, '금액(백만원)': Math.round(r.amount / 1000000) })); }
      else if (viewType === 'channel') { sheetName = '채널피벗테이블'; exportRows = filteredData.map(r => ({ '연도': r.year, '채널': r.channel, '대분류': r.categoryReclassified, '중분류': r.subCategory, '귀속월': r.monthStr, '부서': r.dept, '담당자': r.manager, '광고주': r.advertiser, '대행사': r.agency, '금액(백만원)': Math.round(r.amount / 1000000) })); }
      else if (viewType === 'bucket') { sheetName = '광고주구간피벗테이블'; exportRows = filteredData.map(r => ({ '연도': r.year, '귀속월': r.monthStr, '광고주': r.advertiser, '대분류': r.categoryReclassified, '금액(백만원)': Math.round(r.amount / 1000000) })); }
      else if (viewType === 'advertiser') { sheetName = '광고주전체피벗테이블'; exportRows = filteredData.filter(r => r.categoryOriginal === '일반광고' || r.categoryOriginal === 'IMC').map(r => ({ '연도': r.year, '귀속월': r.monthStr, '광고주': r.advertiser, '대분류': r.categoryReclassified, '금액(백만원)': Math.round(r.amount / 1000000) })); }
      else if (viewType === 'agency') { sheetName = '대행사전체피벗테이블'; exportRows = filteredData.filter(r => r.categoryOriginal === '일반광고' || r.categoryOriginal === 'IMC').map(r => ({ '연도': r.year, '귀속월': r.monthStr, '대행사그룹': r.agencyGroup, '대행사': r.agency, '광고주': r.advertiser, '금액(백만원)': Math.round(r.amount / 1000000) })); }
      const ws = XLSX.utils.json_to_sheet(exportRows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, sheetName); XLSX.writeFile(wb, `KT_ENA_${sheetName}_${new Date().toISOString().slice(0,10)}.xlsx`);
    }

    function renderTableData() {
      const query = document.getElementById('tableSearchInput').value.trim().toLowerCase();
      tableDisplayData = filteredData.filter(r => {
        if (!query) return true;
        return (r.dept.toLowerCase().includes(query) || r.manager.toLowerCase().includes(query) || r.advertiser.toLowerCase().includes(query) || r.agency.toLowerCase().includes(query) || r.agencyGroup.toLowerCase().includes(query) || r.channel.toLowerCase().includes(query) || r.industry.toLowerCase().includes(query) || r.broadDigital.toLowerCase().includes(query) || r.categoryReclassified.toLowerCase().includes(query) || r.revenueBasis.toLowerCase().includes(query));
      });
      tableDisplayData.sort((a, b) => { let valA = a[sortCol]; let valB = b[sortCol]; if (typeof valA === 'string') valA = valA.toLowerCase(); if (typeof valB === 'string') valB = valB.toLowerCase(); if (valA < valB) return sortAsc ? -1 : 1; if (valA > valB) return sortAsc ? 1 : -1; return 0; });
      document.getElementById('tableRecordCount').innerText = `총 ${tableDisplayData.length.toLocaleString()} 건`; maxPages = Math.ceil(tableDisplayData.length / rowsPerPage) || 1; if (currentPage > maxPages) currentPage = maxPages;
      const startIdx = (currentPage - 1) * rowsPerPage; const endIdx = startIdx + rowsPerPage; const pageRows = tableDisplayData.slice(startIdx, endIdx); const tbody = document.getElementById('tableBody');
      if (pageRows.length === 0) { tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 30px; color: var(--text-tertiary);">조건에 부합하는 데이터가 없습니다.</td></tr>`; } 
      else {
        tbody.innerHTML = mapPivotHtml(pageRows.map(r => `<tr><td>${r.monthStr}</td><td><span class="tag-badge">${r.dept}</span></td><td>${r.manager}</td><td style="font-weight: 700;">${r.advertiser}</td><td>${r.agency}</td><td>${r.channel}</td><td>${r.industry}</td><td>${r.broadDigital}</td><td><span class="tag-badge" style="${getCategoryBadgeStyle(r.categoryReclassified)}">${r.categoryReclassified}</span></td><td><span class="tag-badge" style="${r.revenueBasis === '회계조정' ? 'background: rgba(255,181,71,0.15); color: #FFB547;' : ''}">${r.revenueBasis}</span></td><td class="amount-cell">${r.amount.toLocaleString()} 원</td></tr>`).join(''));
      }
      document.getElementById('pageInfo').innerText = `${tableDisplayData.length > 0 ? startIdx + 1 : 0} - ${Math.min(endIdx, tableDisplayData.length)} / 총 ${tableDisplayData.length.toLocaleString()}건`; document.getElementById('pageNumbers').innerText = `${currentPage} / ${maxPages}`;
    }

    function sortTable(col) { if (sortCol === col) sortAsc = !sortAsc; else { sortCol = col; sortAsc = true; } renderTableData(); }
    function onTableSearch() { currentPage = 1; renderTableData(); }
    function onChangeRowsPerPage() { rowsPerPage = parseInt(document.getElementById('selectRowsPerPage').value) || 25; currentPage = 1; renderTableData(); }
    function goToPage(p) { if (p < 1) p = 1; if (p > maxPages) p = maxPages; currentPage = p; renderTableData(); }
    function exportRawSourceData() {
      if (!rawSourceSheetRef) { alert('다운로드할 원본 데이터가 없습니다. 먼저 데이터를 불러와 주세요.'); return; }
      const wbOut = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wbOut, rawSourceSheetRef, rawSourceSheetName || '변환');
      XLSX.writeFile(wbOut, `addata_원본_${rawSourceSheetName || '변환'}_${new Date().toISOString().slice(0,10)}.xlsx`);
    }

    function exportToExcel() {
      if (tableDisplayData.length === 0) { alert('다운로드할 데이터가 없습니다.'); return; }
      const exportRows = tableDisplayData.map(r => ({ '귀속월': r.monthStr, '부서': r.dept, '담당자': r.manager, '광고주': r.advertiser, '대행사': r.agency, '대행사그룹': r.agencyGroup, '채널': r.channel, '업종대분류': r.industry, '방송/디지털': r.broadDigital, '대분류': r.categoryReclassified, '매출기준': r.revenueBasis, '금액': r.amount }));
      const ws = XLSX.utils.json_to_sheet(exportRows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'KT_ENA_본부매출내역'); XLSX.writeFile(wb, `KT_ENA_광고매출내역_${revenueBasisMode}_${new Date().toISOString().slice(0,10)}.xlsx`);
    }

    function getCategoryBadgeStyle(cat) { const color = categoryColors[cat] || '#4795FF'; let r = parseInt(color.slice(1, 3), 16); let g = parseInt(color.slice(3, 5), 16); let b = parseInt(color.slice(5, 7), 16); return `background: rgba(${r}, ${g}, ${b}, 0.15); color: ${color}; border-color: rgba(${r}, ${g}, ${b}, 0.3);`; }
    function formatCurrencyKorean(val) { if (Math.abs(val) >= 1e8) return (val / 1e8).toFixed(2) + ' 억원'; if (Math.abs(val) >= 1e4) return (val / 1e4).toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' 만원'; return val.toLocaleString() + ' 원'; }
    function formatCurrencyKoreanShort(val) { if (Math.abs(val) >= 1e8) return (val / 1e8).toFixed(1) + '억원'; if (Math.abs(val) >= 1e4) return (val / 1e4).toFixed(0) + '만원'; return val.toLocaleString() + '원'; }

    function showLoading(show) { document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none'; }
    function showErrorMessage(msg) { const banner = document.getElementById('errorBanner'); document.getElementById('errorMessage').innerText = msg; banner.style.display = 'flex'; }
    function hideErrorMessage() { document.getElementById('errorBanner').style.display = 'none'; }
