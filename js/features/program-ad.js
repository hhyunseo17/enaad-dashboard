// ============================================================
// js/features/program-ad.js
// 프로그램별 광고매출 & GRPs 탭(family: 'programAd'): 컨트롤바(연/월/채널/장르/프로그램 검색) /
// KPI 5장 / 차트 4종 / 프로그램 피벗 표(아코디언·정렬·페이지·Excel) / 항목별 상세 피벗(programAdDetail)
//
// 기존 별도 저장소(program-ad)의 index.html·app.js 기능을 그대로 옮기고 디자인만 이 대시보드 것을 쓴다.
// 매출·지표 탭과 완전히 독립이다 — rawData/filteredData/applyFilters/revenueBasisMode 등 매출 쪽 상태를
// 읽지도 바꾸지도 않는다. 데이터는 programad-data-loader.js의 programAdRows, 필터 결과는
// programAdFilteredRows, UI 상태는 state.js의 programAd* 변수. 전역 스코프를 공유하므로 모든 이름에
// programAd 접두사를 붙인다.
//
// 피벗 엔진(pivot-builder.js)은 쓰지 않는다: 이 표는 '프로그램 단일 축 + 채널 아코디언 + 컬럼 정렬 +
// 페이지네이션'이라는 고정 동작이고 엔진은 행 N단계×열 N단계×값 복수를 데이터 필터바(filteredData)와
// 묶어 쓰는 구조라, 이 탭의 독립 상태와 섞이지 않게 원본 동작을 그대로 옮겼다(docs/features/program-ad.md).
// ============================================================

    const PROGRAM_AD_CHANNEL_ORDER = ['ENA', 'ENA DRAMA', 'ENA PLAY', 'ENA STORY', 'ONCE', 'OLIFE', 'ENA SPORTS', 'CHING', 'ONT', '헬스메디TV'];

    // 지표 키 → 행 필드/라벨. 키는 정렬·상세 피벗·색(PAC, theme-system.js)에서 공통으로 쓴다.
    const PROGRAM_AD_METRICS = {
      pkg:      { field: 'revPackage',     label: '일반광고(패키지)',    short: '패키지',   kind: 'rev' },
      gen:      { field: 'revGeneralGrps', label: '일반광고(GRPs기여)',  short: 'GRPs기여', kind: 'rev' },
      info:     { field: 'revInfomercial', label: '인포머셜',            short: '인포',     kind: 'rev' },
      imc:      { field: 'revImc',         label: 'IMC',                 short: 'IMC',      kind: 'rev' },
      oth:      { field: 'revOther',       label: '기타광고',            short: '기타',     kind: 'rev' },
      grps2049: { field: 'grp2049',        label: '2049 GRPs',           short: '2049 GRPs', kind: 'grps' },
      grpsHh:   { field: 'grpHousehold',   label: '가구 GRPs',           short: '가구 GRPs', kind: 'grps' },
      tot:      { field: 'revTotal',       label: '전체매출',            short: '전체매출', kind: 'rev' }
    };
    const PROGRAM_AD_REV_KEYS = ['pkg', 'gen', 'info', 'imc', 'oth'];
    const PROGRAM_AD_DETAIL_TITLES = {
      pkg: '일반광고(패키지) 매출 상세 분석', gen: '일반광고(GRPs기여) 매출 상세 분석', info: '인포머셜 매출 상세 분석',
      imc: 'IMC 매출 상세 분석', oth: '기타광고 매출 상세 분석',
      grps2049: '프로그램별 2049 GRPs 상세 분석', grpsHh: '프로그램별 가구 GRPs 상세 분석',
      genre: '장르별 프로그램 매출 상세 분석'
    };

    // ------------------------------------------------------------
    // 공통 유틸
    // ------------------------------------------------------------
    // 데이터 기반 문자열(채널/장르/프로그램명)을 innerHTML·속성에 넣을 때는 반드시 거친다(XSS).
    function programAdEscapeHtml(str) {
      return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function programAdLabel(v) { return v ? v : '(미지정)'; }
    // 0 값은 '–'. 숫자 d자리.
    function programAdFmtNum(v, d) {
      if (v === null || v === undefined || isNaN(v) || !v) return '–';
      return Number(v).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
    }
    // 피벗·표의 매출은 백만원 소수 1자리(CLAUDE.md 절대원칙 8), KPI·차트는 억원.
    function programAdFmtMillion(won) { return programAdFmtNum(won / 1e6, 1); }
    function programAdFmt100M(won, d) {
      if (!won || isNaN(won)) return '0억원';
      return (won / 1e8).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '억원';
    }
    function programAdFmtCell(metricKey, v) {
      return PROGRAM_AD_METRICS[metricKey].kind === 'grps' ? programAdFmtNum(v, 2) : programAdFmtMillion(v);
    }
    // 장르 정렬: 드라마&영화 → 오락 → 정보 → 나머지 가나다.
    function programAdGenreRank(genreName) {
      if (!genreName) return 10;
      const g = String(genreName).trim().toLowerCase();
      if (g.includes('드라마') || g.includes('영화')) return 1;
      if (g.includes('오락') || g.includes('예능')) return 2;
      if (g.includes('정보') || g.includes('시사')) return 3;
      return 10;
    }
    function programAdCompareGenre(a, b) {
      const ra = programAdGenreRank(a), rb = programAdGenreRank(b);
      return ra !== rb ? ra - rb : String(a).localeCompare(String(b), 'ko');
    }
    function programAdSum(rows, field) { let s = 0; for (let i = 0; i < rows.length; i++) s += rows[i][field]; return s; }
    function programAdAllYears() { return [...new Set(programAdRows.map(r => r.year))].sort((a, b) => a - b); }
    // 선택된 연도(없으면 전체)에 데이터가 있는 월 집합
    function programAdAvailableMonths() {
      const ys = programAdFilterStates.year;
      const set = new Set();
      programAdRows.forEach(r => { if (ys.length === 0 || ys.includes(r.year)) set.add(r.month); });
      return set;
    }

    // ------------------------------------------------------------
    // 이벤트 바인딩 — init.js가 부팅 시 한 번 부른다(요소는 dashboard.html에 항상 있다).
    // ------------------------------------------------------------
    function setupProgramAdEventListeners() {
      const yearBox = document.getElementById('programAdYearPills');
      const monthBox = document.getElementById('programAdMonthPills');
      const onPill = (type) => (e) => {
        const btn = e.target.closest('.pill-btn');
        if (!btn || btn.disabled) return;
        const val = btn.getAttribute('data-value');
        if (val === 'all') programAdToggleAllPills(type);
        else programAdTogglePill(type, Number(val), e);
      };
      if (yearBox) yearBox.addEventListener('click', onPill('year'));
      if (monthBox) monthBox.addEventListener('click', onPill('month'));
      ['channel', 'genre'].forEach(type => {
        const list = document.getElementById('listProgramAd' + (type === 'channel' ? 'Channel' : 'Genre') + 'Checkboxes');
        if (list) list.addEventListener('change', () => { programAdSyncCheckboxState(type); applyProgramAdFilters(false); });
      });
      const search = document.getElementById('inputProgramAdSearch');
      if (search) search.addEventListener('input', () => { applyProgramAdFilters(false); });
    }

    // ------------------------------------------------------------
    // 필터 초기화/렌더 (연·월 pill, 채널·장르 체크박스)
    // ------------------------------------------------------------
    function programAdDefaultYear() {
      const ys = programAdAllYears();
      return ys.length ? ys[ys.length - 1] : null; // 최신 연도
    }

    // 데이터 적재 후 최초 1회: 최신 연도 + 그 연도의 전체 월 + 전체 채널/장르.
    function initProgramAdFilters() {
      if (programAdFiltersInitialized) return;
      programAdFiltersInitialized = true;
      buildProgramAdDropdowns();
      programAdResetToDefault();
    }

    function programAdResetToDefault() {
      const dy = programAdDefaultYear();
      programAdFilterStates.year = dy ? [dy] : [];
      programAdFilterStates.month = [...programAdAvailableMonths()].sort((a, b) => a - b);
      programAdSetAllCheckboxes(true);
      const search = document.getElementById('inputProgramAdSearch');
      if (search) search.value = '';
      renderProgramAdPills();
    }

    // 로고 클릭 — 최초 로드와 동일한 기본 상태(최신 연도, 월/채널/장르 전체)로 되돌린다. "필터 초기화"(전체 선택)와 다르다.
    function applyProgramAdDefaultFilters() {
      if (!programAdDataLoaded || !programAdFiltersInitialized) return;
      programAdResetToDefault();
      programAdCurrentPage = 1;
      applyProgramAdFilters(false);
    }

    // "필터 초기화" 버튼 — 전체 연도·전체 월·전체 채널/장르.
    function resetProgramAdFilters() {
      if (!programAdDataLoaded) return;
      programAdFilterStates.year = programAdAllYears();
      programAdFilterStates.month = [...programAdAvailableMonths()].sort((a, b) => a - b);
      programAdSetAllCheckboxes(true);
      const search = document.getElementById('inputProgramAdSearch');
      if (search) search.value = '';
      renderProgramAdPills();
      applyProgramAdFilters(false);
    }

    function renderProgramAdPills() {
      const years = programAdAllYears().slice().reverse();
      const sel = programAdFilterStates;
      const allYearSel = years.length > 0 && sel.year.length === years.length;
      let yh = `<button class="pill-btn ${allYearSel ? 'active' : ''}" data-value="all">전체</button>`;
      years.forEach(y => { yh += `<button class="pill-btn ${sel.year.includes(y) ? 'active' : ''}" data-value="${y}">${y}년</button>`; });
      document.getElementById('programAdYearPills').innerHTML = yh;

      const avail = programAdAvailableMonths();
      const availList = [...avail].sort((a, b) => a - b);
      const allMonthSel = availList.length > 0 && availList.every(m => sel.month.includes(m));
      let mh = `<button class="pill-btn ${allMonthSel ? 'active' : ''}" data-value="all">전체</button>`;
      for (let m = 1; m <= 12; m++) {
        if (!avail.has(m)) mh += `<button class="pill-btn disabled" disabled title="해당 연도에 데이터가 없습니다" data-value="${m}">${m}월</button>`;
        else mh += `<button class="pill-btn ${sel.month.includes(m) ? 'active' : ''}" data-value="${m}">${m}월</button>`;
      }
      document.getElementById('programAdMonthPills').innerHTML = mh;
    }

    // 일반 클릭 = 단일 선택(대체), Ctrl(⌘)+클릭 = 가감.
    function programAdTogglePill(type, val, evt) {
      if (type === 'month' && !programAdAvailableMonths().has(val)) return;
      const additive = !!(evt && (evt.ctrlKey || evt.metaKey));
      const list = programAdFilterStates[type];
      if (additive) {
        const idx = list.indexOf(val);
        if (idx > -1) list.splice(idx, 1); else list.push(val);
      } else {
        programAdFilterStates[type] = [val];
      }
      if (type === 'year') programAdPruneMonths();
      renderProgramAdPills();
      applyProgramAdFilters(false);
    }

    function programAdToggleAllPills(type) {
      if (type === 'year') {
        const all = programAdAllYears();
        programAdFilterStates.year = programAdFilterStates.year.length === all.length ? [] : [...all];
        programAdPruneMonths();
      } else {
        const avail = [...programAdAvailableMonths()].sort((a, b) => a - b);
        const allSel = avail.every(m => programAdFilterStates.month.includes(m));
        programAdFilterStates.month = allSel ? [] : avail;
      }
      renderProgramAdPills();
      applyProgramAdFilters(false);
    }

    // 연도를 바꾼 뒤 데이터 없는 월은 선택에서 빼고, 하나도 안 남으면 가능한 월 전체를 고른다.
    function programAdPruneMonths() {
      const avail = programAdAvailableMonths();
      programAdFilterStates.month = programAdFilterStates.month.filter(m => avail.has(m));
      if (programAdFilterStates.month.length === 0 && avail.size > 0) programAdFilterStates.month = [...avail].sort((a, b) => a - b);
    }

    function buildProgramAdDropdowns() {
      const chSet = new Set(programAdRows.map(r => r.channel));
      const channels = PROGRAM_AD_CHANNEL_ORDER.filter(c => chSet.has(c));
      chSet.forEach(c => { if (!channels.includes(c)) channels.push(c); });
      const genres = [...new Set(programAdRows.map(r => r.genre))].sort(programAdCompareGenre);
      const fill = (listId, type, items) => {
        document.getElementById(listId).innerHTML = items.map(v =>
          `<label class="checkbox-item"><input type="checkbox" class="chk-programad-${type}" value="${programAdEscapeHtml(v)}" checked>${programAdEscapeHtml(programAdLabel(v))}</label>`).join('');
      };
      fill('listProgramAdChannelCheckboxes', 'channel', channels);
      fill('listProgramAdGenreCheckboxes', 'genre', genres);
    }

    function programAdSetAllCheckboxes(checked) {
      ['channel', 'genre'].forEach(type => {
        document.querySelectorAll('.chk-programad-' + type).forEach(c => { c.checked = checked; });
        programAdSyncCheckboxState(type);
      });
    }

    function onProgramAdSelectAll(type, el) {
      document.querySelectorAll('.chk-programad-' + type).forEach(c => { c.checked = el.checked; });
      programAdSyncCheckboxState(type);
      applyProgramAdFilters(false);
    }

    // 체크박스 → 상태 + 라벨 + 전체선택 체크 동기화.
    function programAdSyncCheckboxState(type) {
      const chks = Array.from(document.querySelectorAll('.chk-programad-' + type));
      const vals = chks.filter(c => c.checked).map(c => c.value);
      programAdFilterStates[type] = vals;
      const cap = type === 'channel' ? 'Channel' : 'Genre';
      const allBox = document.getElementById('checkAllProgramAd' + cap);
      if (allBox) allBox.checked = chks.length > 0 && vals.length === chks.length;
      const label = document.getElementById('labelProgramAd' + cap);
      if (label) {
        const allText = type === 'channel' ? '전체 채널' : '전체 장르';
        if (vals.length === 0 || vals.length === chks.length) label.innerText = allText;
        else label.innerText = programAdLabel(vals[0]) + (vals.length > 1 ? ` 외 ${vals.length - 1}건` : '');
      }
    }

    // ------------------------------------------------------------
    // 필터 적용 → 현재 화면 다시 그리기
    // ------------------------------------------------------------
    function applyProgramAdFilters(preservePage) {
      const st = programAdFilterStates;
      const search = (document.getElementById('inputProgramAdSearch').value || '').trim().toLowerCase();
      programAdProgramSearch = search;
      programAdFilteredRows = programAdRows.filter(r => {
        if (st.year.length && !st.year.includes(r.year)) return false;
        if (st.month.length && !st.month.includes(r.month)) return false;
        if (st.channel.length && !st.channel.includes(r.channel)) return false;
        if (st.genre.length && !st.genre.includes(r.genre)) return false;
        if (search && !r.program.toLowerCase().includes(search)) return false;
        return true;
      });
      if (!preservePage) programAdCurrentPage = 1;
      applyChartAnimDuration();
      if (currentView === 'programAdMain') renderProgramAdContent();
      else if (currentView === 'programAdDetail') renderProgramAdDetailTable();
    }

    // 데이터가 아직 없으면 지연 로딩을 시작하고 false. 끝나면 현재 화면을 다시 그린다.
    // errorEl이 주어지면 로딩 실패 메시지를 거기에 표시한다.
    function programAdEnsureData(viewKey, loadingEl, errorEl, rerender) {
      if (programAdDataLoaded) return true;
      if (loadingEl) loadingEl.style.display = 'flex';
      if (errorEl) errorEl.style.display = 'none';
      fetchProgramAdDataHttp()
        .then(() => { if (currentView === viewKey) rerender(); })
        .catch(err => {
          if (loadingEl) loadingEl.style.display = 'none';
          if (errorEl) { errorEl.style.display = ''; errorEl.innerText = '프로그램별 광고매출 데이터를 불러오지 못했습니다: ' + (err && err.message ? err.message : err); }
        });
      return false;
    }

    function renderProgramAdDataAsOfLabel() {
      const el = document.getElementById('programAdDataAsOfLabel'); if (!el) return;
      if (!programAdRows.length) { el.innerText = ''; return; }
      let best = 0;
      programAdRows.forEach(r => { const k = r.year * 100 + r.month; if (k > best) best = k; });
      el.innerText = `데이터 기준: ${Math.floor(best / 100)}년 ${best % 100}월 마감`;
    }

    // ------------------------------------------------------------
    // VIEW_CONFIG.programAdMain.render()의 진입점 (view-router.js)
    // ------------------------------------------------------------
    function renderProgramAdMain() {
      const loadingEl = document.getElementById('programAdLoadingMessage');
      const errorEl = document.getElementById('programAdErrorMessage');
      const bodyEl = document.getElementById('programAdContentBody');
      if (!programAdEnsureData('programAdMain', loadingEl, errorEl, renderProgramAdMain)) { bodyEl.style.display = 'none'; return; }
      loadingEl.style.display = 'none'; errorEl.style.display = 'none'; bodyEl.style.display = 'flex';
      initProgramAdFilters();
      renderProgramAdDataAsOfLabel();
      applyProgramAdFilters(true);
    }

    function renderProgramAdContent() {
      renderProgramAdKpis();
      renderProgramAdCharts();
      renderProgramAdTable();
    }

    function renderProgramAdKpis() {
      const rows = programAdFilteredRows;
      document.getElementById('programAdKpiTotal').innerText = programAdFmt100M(programAdSum(rows, 'revTotal'), 2);
      const grps = (v) => v ? programAdFmtNum(v, 2) : '0.00';
      document.getElementById('programAdKpi2049').innerText = grps(programAdSum(rows, 'grp2049'));
      document.getElementById('programAdKpiHh').innerText = grps(programAdSum(rows, 'grpHousehold'));
      document.getElementById('programAdKpiPkg').innerText = programAdFmt100M(programAdSum(rows, 'revPackage'), 2);
      document.getElementById('programAdKpiGen').innerText = programAdFmt100M(programAdSum(rows, 'revGeneralGrps'), 2);
    }

    // ------------------------------------------------------------
    // 차트 4종
    // ------------------------------------------------------------
    function openProgramAdDetail(metricKey) {
      programAdDetailMetric = metricKey;
      switchView('programAdDetail');
    }

    function programAdPointerHover(e, el) { if (e.native && e.native.target) e.native.target.style.cursor = el[0] ? 'pointer' : 'default'; }

    function programAdMakeChart(key, canvasId, config) {
      if (chartInstances[key]) { chartInstances[key].destroy(); delete chartInstances[key]; }
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      chartInstances[key] = new Chart(canvas.getContext('2d'), config);
    }

    function renderProgramAdCharts() {
      const rows = programAdFilteredRows;

      // 1) 5대 광고매출 항목별 비중 (도넛)
      const mixVals = PROGRAM_AD_REV_KEYS.map(k => programAdSum(rows, PROGRAM_AD_METRICS[k].field) / 1e8);
      const mixLabels = PROGRAM_AD_REV_KEYS.map(k => PROGRAM_AD_METRICS[k].label);
      const mixColors = PROGRAM_AD_REV_KEYS.map(k => PAC(k));
      const mixTotal = mixVals.reduce((a, b) => a + b, 0);
      programAdMakeChart('programAdRevenueMix', 'chartProgramAdRevenueMix', {
        type: 'doughnut',
        data: { labels: mixLabels, datasets: [{
          data: mixVals, backgroundColor: (c) => ddArcFill(mixColors[c.dataIndex])(c), ddFlatList: mixColors,
          borderWidth: 0.3, borderColor: ddSurfaceColor(), borderAlign: 'inner', hoverOffset: 6,
          datalabels: {
            display: (ctx) => mixTotal > 0 && ctx.dataset.data[ctx.dataIndex] / mixTotal > 0.04, // 4% 이상 조각에만 표시
            color: '#FFFFFF', font: { size: 12, weight: FW() }, textStrokeColor: 'rgba(0,0,0,0.22)', textStrokeWidth: 1.5,
            formatter: (v) => v.toFixed(1) + '억'
          }
        }] },
        options: {
          responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24 } }, cutout: '60%', onHover: programAdPointerHover,
          onClick: (e, els) => { if (els.length) openProgramAdDetail(PROGRAM_AD_REV_KEYS[els[0].index]); },
          plugins: {
            legend: { position: 'right', labels: { color: CH('#B0B8C1'), font: { size: 12, weight: FW() } } },
            tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.raw.toFixed(2)} 억원 (${mixTotal ? ((c.raw / mixTotal) * 100).toFixed(1) : '0.0'}%)` } }
          }
        },
        plugins: [{
          id: 'programAdMixCenterText',
          afterDraw(chart) {
            const { ctx, chartArea: { left, right, top, bottom } } = chart;
            ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.font = `600 19px 'IBM Plex Sans KR', 'Pretendard', sans-serif`;
            ctx.fillStyle = CH('#F2F4F6');
            ctx.fillText(`${mixTotal.toFixed(2)}억원`, (left + right) / 2, (top + bottom) / 2);
            ctx.restore();
          }
        }]
      });

      // 2) TOP 10 프로그램 매출 세부 구성 (가로 스택바)
      const pMap = {};
      rows.forEach(r => {
        const p = pMap[r.program] || (pMap[r.program] = { pkg: 0, gen: 0, info: 0, imc: 0, oth: 0, tot: 0 });
        p.pkg += r.revPackage; p.gen += r.revGeneralGrps; p.info += r.revInfomercial; p.imc += r.revImc; p.oth += r.revOther; p.tot += r.revTotal;
      });
      const top10 = Object.entries(pMap).sort((a, b) => b[1].tot - a[1].tot).slice(0, 10);
      const lastKey = PROGRAM_AD_REV_KEYS[PROGRAM_AD_REV_KEYS.length - 1];
      programAdMakeChart('programAdBreakdown', 'chartProgramAdBreakdown', {
        type: 'bar',
        data: { labels: top10.map(p => programAdLabel(p[0])), datasets: PROGRAM_AD_REV_KEYS.map(k => ({
          label: PROGRAM_AD_METRICS[k].label, data: top10.map(p => p[1][k] / 1e8),
          backgroundColor: ddBarFill(PAC(k), true), borderRadius: 0, ...ddStackSeparator(true),
          datalabels: {
            display: (ctx) => k === lastKey, anchor: 'end', align: 'right', offset: 4, color: dataLabelTextColor(), font: { size: 11, weight: FW() },
            formatter: (v, ctx) => { let t = 0; ctx.chart.data.datasets.forEach(ds => { t += ds.data[ctx.dataIndex] || 0; }); return t > 0 ? t.toFixed(1) + '억' : ''; }
          }
        })) },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24, right: 44 } }, onHover: programAdPointerHover,
          onClick: (e, els, chart) => { if (els.length) openProgramAdDetail(PROGRAM_AD_REV_KEYS[els[0].datasetIndex]); },
          plugins: {
            legend: { display: true, position: 'top', labels: { color: CH('#B0B8C1'), font: { size: 13, weight: FW() } } },
            tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.raw.toFixed(2)} 억원` } }
          },
          scales: {
            x: ddValueAxis({ stacked: true, grace: 0, ticks: { color: CH('#8B95A1'), maxTicksLimit: 7, padding: 6, callback: v => v + '억' } }),
            y: { stacked: true, ticks: { color: CH('#F2F4F6'), font: { weight: FW() }, autoSkip: false }, grid: { display: false } }
          }
        }
      });

      // 3) 프로그램별 2049 vs 가구 GRPs (세로 그룹바, 2049 상위 10개)
      const gMap = {};
      rows.forEach(r => {
        const g = gMap[r.program] || (gMap[r.program] = { prog: r.program, g2049: 0, gHH: 0 });
        g.g2049 += r.grp2049; g.gHH += r.grpHousehold;
      });
      const topGrps = Object.values(gMap).sort((a, b) => b.g2049 - a.g2049).slice(0, 10);
      const grpLabel = { display: (ctx) => ctx.dataset.data[ctx.dataIndex] > 0, anchor: 'end', align: 'end', offset: 2, color: dataLabelTextColor(), font: { size: 11, weight: FW() }, formatter: (v) => v > 0 ? programAdFmtNum(v, 0) : '' };
      programAdMakeChart('programAdGrps', 'chartProgramAdGrps', {
        type: 'bar',
        data: { labels: topGrps.map(p => programAdLabel(p.prog)), datasets: [
          { label: '2049 GRPs', data: topGrps.map(p => p.g2049), backgroundColor: ddBarFill(PAC('grps2049')), borderRadius: 0, barPercentage: 1, categoryPercentage: 0.8, ...ddGroupSeparator(), datalabels: grpLabel },
          { label: '가구 GRPs', data: topGrps.map(p => p.gHH), backgroundColor: ddBarFill(PAC('grpsHh')), borderRadius: 0, barPercentage: 1, categoryPercentage: 0.8, ...ddGroupSeparator(), datalabels: grpLabel }
        ] },
        options: {
          responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24 } }, onHover: programAdPointerHover,
          onClick: (e, els) => { if (els.length) openProgramAdDetail(els[0].datasetIndex === 0 ? 'grps2049' : 'grpsHh'); },
          plugins: {
            legend: { position: 'top', labels: { color: CH('#B0B8C1'), font: { size: 13, weight: FW() } } },
            tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${programAdFmtNum(c.raw, 1)}` } }
          },
          scales: {
            x: { ticks: { color: CH('#F2F4F6'), font: { size: 11, weight: FW() }, autoSkip: false }, grid: { display: false } },
            y: ddValueAxis({ ticks: { color: CH('#8B95A1'), maxTicksLimit: 5, padding: 6, callback: v => programAdFmtNum(v, 0) } })
          }
        }
      });

      // 4) 장르별 매출 집행 현황 (가로 바) — 드라마&영화 → 오락 → 정보 → 나머지 가나다. 단일 계열이라 색에 의미가 없다 → 장식 그라데이션.
      const genreMap = {};
      rows.forEach(r => { genreMap[r.genre] = (genreMap[r.genre] || 0) + r.revTotal; });
      const genres = Object.entries(genreMap).sort((a, b) => programAdCompareGenre(a[0], b[0]));
      const duo = ddDuoPair();
      programAdMakeChart('programAdGenre', 'chartProgramAdGenre', {
        type: 'bar',
        data: { labels: genres.map(g => programAdLabel(g[0])), datasets: [{
          label: '매출액', data: genres.map(g => g[1] / 1e8), backgroundColor: ddDuoFill(duo[0], duo[1]), borderRadius: 0,
          datalabels: { display: (ctx) => ctx.dataset.data[ctx.dataIndex] > 0, anchor: 'end', align: 'right', offset: 4, color: dataLabelTextColor(), font: { size: 11, weight: FW() }, formatter: (v) => v > 0 ? v.toFixed(1) + '억' : '' }
        }] },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24, right: 44 } }, onHover: programAdPointerHover,
          onClick: () => openProgramAdDetail('genre'),
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.raw.toFixed(2)} 억원` } } },
          scales: {
            x: ddValueAxis({ grace: 0, ticks: { color: CH('#8B95A1'), maxTicksLimit: 7, padding: 6, callback: v => v + '억' } }),
            y: { ticks: { color: CH('#F2F4F6'), font: { weight: FW() } }, grid: { display: false } }
          }
        }
      });
    }

    // ------------------------------------------------------------
    // 프로그램 피벗 표 (채널·장르·프로그램 그룹 → 채널별 아코디언)
    // ------------------------------------------------------------
    const PROGRAM_AD_TABLE_COLS = [
      { key: 'channel', label: '채널', text: true },
      { key: 'genre', label: '장르', text: true },
      { key: 'prog', label: '프로그램', text: true },
      { key: 'grps2049', label: '2049 GRPs', metric: 'grps2049' },
      { key: 'grpsHh', label: '가구 GRPs', metric: 'grpsHh' },
      { key: 'pkg', label: '패키지', metric: 'pkg' },
      { key: 'gen', label: 'GRPs기여', metric: 'gen' },
      { key: 'info', label: '인포', metric: 'info' },
      { key: 'imc', label: 'IMC', metric: 'imc' },
      { key: 'oth', label: '기타', metric: 'oth' },
      { key: 'tot', label: '전체매출', metric: 'tot' }
    ];

    function sortProgramAdTable(col) {
      if (programAdSortCol === col) programAdSortDir = programAdSortDir === 'desc' ? 'asc' : 'desc';
      else { programAdSortCol = col; programAdSortDir = (col === 'channel' || col === 'genre' || col === 'prog') ? 'asc' : 'desc'; }
      renderProgramAdTable();
    }
    function changeProgramAdPage(d) { programAdCurrentPage += d; renderProgramAdTable(); }
    function toggleProgramAdRow(i) {
      document.querySelectorAll(`.programad-child-row[data-pa-row="${i}"]`).forEach(r => r.classList.toggle('open'));
      const icon = document.getElementById('programAdToggleIcon' + i);
      if (icon) icon.innerText = icon.innerText === '▶' ? '▼' : '▶';
    }

    // 프로그램별 합산 + 채널별 하위 합산
    function programAdAggregateByProgram(rows) {
      const map = new Map();
      rows.forEach(d => {
        let p = map.get(d.program);
        if (!p) { p = { prog: d.program, genre: d.genre, channel: d.channel, grps2049: 0, grpsHh: 0, pkg: 0, gen: 0, info: 0, imc: 0, oth: 0, tot: 0, chs: new Map() }; map.set(d.program, p); }
        let c = p.chs.get(d.channel);
        if (!c) { c = { ch: d.channel, grps2049: 0, grpsHh: 0, pkg: 0, gen: 0, info: 0, imc: 0, oth: 0, tot: 0 }; p.chs.set(d.channel, c); }
        [p, c].forEach(o => {
          o.grps2049 += d.grp2049; o.grpsHh += d.grpHousehold; o.pkg += d.revPackage; o.gen += d.revGeneralGrps;
          o.info += d.revInfomercial; o.imc += d.revImc; o.oth += d.revOther; o.tot += d.revTotal;
        });
      });
      return Array.from(map.values());
    }

    function renderProgramAdTable() {
      const data = programAdAggregateByProgram(programAdFilteredRows);
      const col = programAdSortCol, dir = programAdSortDir;
      data.sort((a, b) => {
        let va, vb;
        if (col === 'channel') { va = a.channel || ''; vb = b.channel || ''; }
        else if (col === 'genre') { va = a.genre || ''; vb = b.genre || ''; }
        else if (col === 'prog') { va = a.prog || ''; vb = b.prog || ''; }
        else { va = a[col] || 0; vb = b[col] || 0; }
        if (typeof va === 'string') return dir === 'asc' ? va.localeCompare(vb, 'ko') : vb.localeCompare(va, 'ko');
        return dir === 'asc' ? va - vb : vb - va;
      });

      // 헤더 — 정렬 아이콘 + 항목 색 점(색은 테마별 PAC()). 테마 전환 시 화면이 다시 그려지므로 색도 따라온다.
      let head = '<tr>';
      PROGRAM_AD_TABLE_COLS.forEach(c => {
        const active = programAdSortCol === c.key;
        const icon = active ? (programAdSortDir === 'asc' ? '▲' : '▼') : '↕';
        const dot = (c.metric && c.metric !== 'tot') ? `<span class="programad-dot" style="background:${PAC(c.metric)};"></span>` : '';
        head += `<th data-pvsort="${c.key}" onclick="sortProgramAdTable('${c.key}')" style="${c.text ? 'text-align:left;' : 'text-align:right;'}">${dot}${c.label} <span style="${active ? 'color:var(--primary-blue);' : 'opacity:0.55;'}">${icon}</span></th>`;
      });
      head += '</tr>';
      document.getElementById('programAdTableHead').innerHTML = head;

      const totalPages = Math.ceil(data.length / PROGRAM_AD_PAGE_SIZE) || 1;
      if (programAdCurrentPage > totalPages) programAdCurrentPage = totalPages;
      if (programAdCurrentPage < 1) programAdCurrentPage = 1;
      const start = (programAdCurrentPage - 1) * PROGRAM_AD_PAGE_SIZE;
      const pageData = data.slice(start, start + PROGRAM_AD_PAGE_SIZE);

      const numCells = (o, bold) => PROGRAM_AD_TABLE_COLS.slice(3).map(c =>
        `<td class="programad-num" style="${bold && (c.key === 'tot' || c.key === 'pkg') ? 'font-weight:600;' : ''}">${programAdFmtCell(c.metric, o[c.key])}</td>`).join('');
      let html = '';
      if (!pageData.length) html = '<tr><td colspan="11" style="text-align:center; padding:24px;">데이터가 없습니다.</td></tr>';
      else pageData.forEach((row, i) => {
        const chList = Array.from(row.chs.values());
        const chText = chList.length > 1 ? `${chList[0].ch} 등` : chList[0].ch;
        html += `<tr class="programad-parent-row" onclick="toggleProgramAdRow(${i})">
          <td><span class="toggle-icon" id="programAdToggleIcon${i}">▶</span><strong>${programAdEscapeHtml(programAdLabel(chText))}</strong></td>
          <td>${programAdEscapeHtml(programAdLabel(row.genre))}</td><td><strong>${programAdEscapeHtml(programAdLabel(row.prog))}</strong></td>${numCells(row, true)}</tr>`;
        chList.forEach(ch => {
          html += `<tr class="programad-child-row" data-pa-row="${i}">
            <td style="color:var(--text-secondary); padding-left:36px;">└ ${programAdEscapeHtml(programAdLabel(ch.ch))}</td><td></td><td></td>${numCells(ch, false)}</tr>`;
        });
      });
      document.getElementById('programAdTableBody').innerHTML = html;
      document.getElementById('programAdPageInfo').innerText = `${data.length ? start + 1 : 0} - ${Math.min(start + PROGRAM_AD_PAGE_SIZE, data.length)} / 총 ${data.length.toLocaleString('ko-KR')}건`;
      document.getElementById('btnProgramAdPrevPage').disabled = programAdCurrentPage <= 1;
      document.getElementById('btnProgramAdNextPage').disabled = programAdCurrentPage >= totalPages;
    }

    // ------------------------------------------------------------
    // 항목별 상세 피벗 (programAdDetail) — 프로그램(또는 장르 → 프로그램) × 연도(펼치면 월) 값
    // ------------------------------------------------------------
    function toggleProgramAdPivotYear(year) {
      programAdExpandedYears[year] = !programAdExpandedYears[year];
      renderProgramAdDetailTable();
    }
    function toggleProgramAdGenreGroup(i) {
      document.querySelectorAll(`.programad-child-row[data-pa-row="g${i}"]`).forEach(r => r.classList.toggle('open'));
      const icon = document.getElementById('programAdGenreIcon' + i);
      if (icon) icon.innerText = icon.innerText === '▶' ? '▼' : '▶';
    }

    function renderProgramAdDetail() {
      const errorEl = document.getElementById('programAdDetailTable');
      if (!programAdDataLoaded) {
        errorEl.innerHTML = '<tbody><tr><td style="padding:40px; text-align:center;">데이터를 불러오는 중입니다…</td></tr></tbody>';
        fetchProgramAdDataHttp()
          .then(() => { if (currentView === 'programAdDetail') renderProgramAdDetail(); })
          .catch(err => { errorEl.innerHTML = `<tbody><tr><td style="padding:40px; text-align:center; color:var(--accent-red);">${programAdEscapeHtml('데이터를 불러오지 못했습니다: ' + (err && err.message ? err.message : err))}</td></tr></tbody>`; });
        return;
      }
      initProgramAdFilters();
      renderProgramAdDataAsOfLabel();
      applyProgramAdFilters(true); // 현재 필터로 programAdFilteredRows를 만들고 renderProgramAdDetailTable()까지 호출
    }

    function renderProgramAdDetailTable() {
      const key = programAdDetailMetric;
      const isGenre = key === 'genre';
      const valueKey = isGenre ? 'tot' : key;
      const field = PROGRAM_AD_METRICS[valueKey].field;
      const titleEl = document.getElementById('programAdDetailTitle');
      const dot = isGenre ? '' : (valueKey !== 'tot' ? `<span class="programad-dot" style="background:${PAC(valueKey)}; width:10px; height:10px;"></span>` : '');
      titleEl.innerHTML = dot + programAdEscapeHtml(PROGRAM_AD_DETAIL_TITLES[key] || '매출 상세 분석');

      // 값이 0인 행은 제외(원본과 동일) → 연도/월 목록도 값이 있는 것만 나온다.
      const ymMonths = {};      // year → Set(month)
      const progMap = {};       // program → { total, years: { y: { total, m: {month: v} } } }
      const genreMap = {};      // genre → { total, programs: { prog: same shape } }
      programAdFilteredRows.forEach(d => {
        const v = d[field]; if (!v) return;
        (ymMonths[d.year] || (ymMonths[d.year] = new Set())).add(d.month);
        const add = (node) => {
          node.total += v;
          const y = node.years[d.year] || (node.years[d.year] = { total: 0, m: {} });
          y.total += v; y.m[d.month] = (y.m[d.month] || 0) + v;
        };
        const pNode = (map, name) => map[name] || (map[name] = { total: 0, years: {} });
        if (isGenre) {
          const g = genreMap[d.genre] || (genreMap[d.genre] = { total: 0, years: {}, programs: {} });
          add(g); add(pNode(g.programs, d.program));
        } else add(pNode(progMap, d.program));
      });

      const years = Object.keys(ymMonths).map(Number).sort((a, b) => b - a);
      const monthsOf = {};
      years.forEach(y => { monthsOf[y] = [...ymMonths[y]].sort((a, b) => a - b); });
      const fmt = (v) => programAdFmtCell(valueKey, v);
      const cellStyle = (v) => v > 0 ? '' : 'color:var(--text-tertiary);';

      let h1 = `<tr><th rowspan="2" style="text-align:left;">${isGenre ? '장르 / 프로그램' : '프로그램'}</th>`;
      let h2 = '<tr>';
      years.forEach(y => {
        const exp = !!programAdExpandedYears[y];
        h1 += `<th colspan="${exp ? monthsOf[y].length + 1 : 1}" class="pv-th-summary" style="cursor:pointer;" onclick="toggleProgramAdPivotYear(${y})"><span class="year-toggle-btn">${exp ? '−' : '+'}</span> ${y}년</th>`;
        if (exp) monthsOf[y].forEach(m => { h2 += `<th>${m}월</th>`; });
        h2 += '<th class="pv-th-summary">연간합계</th>';
      });
      h1 += '<th rowspan="2" class="pv-th-total">전체 총합계</th></tr>'; h2 += '</tr>';

      const cells = (node) => {
        let s = '';
        years.forEach(y => {
          const yn = node.years[y];
          if (programAdExpandedYears[y]) monthsOf[y].forEach(m => { const v = yn && yn.m[m] ? yn.m[m] : 0; s += `<td class="programad-num" style="${cellStyle(v)}">${fmt(v)}</td>`; });
          const yt = yn ? yn.total : 0;
          s += `<td class="programad-num" style="font-weight:600; ${cellStyle(yt)}">${fmt(yt)}</td>`;
        });
        return s + `<td class="programad-num" style="font-weight:600;">${fmt(node.total)}</td>`;
      };

      let body = '';
      if (isGenre) {
        const genres = Object.keys(genreMap).sort((a, b) => { const r = programAdGenreRank(a) - programAdGenreRank(b); return r !== 0 ? r : genreMap[b].total - genreMap[a].total; });
        if (!genres.length) body = '<tr><td colspan="100" style="text-align:center; padding:40px;">선택된 조건에 해당하는 장르 데이터가 없습니다.</td></tr>';
        genres.forEach((g, gi) => {
          const gn = genreMap[g];
          body += `<tr class="programad-parent-row" onclick="toggleProgramAdGenreGroup(${gi})"><td><span class="toggle-icon" id="programAdGenreIcon${gi}">▶</span><strong>[장르] ${programAdEscapeHtml(programAdLabel(g))}</strong></td>${cells(gn)}</tr>`;
          Object.keys(gn.programs).sort((a, b) => gn.programs[b].total - gn.programs[a].total).forEach(p => {
            body += `<tr class="programad-child-row" data-pa-row="g${gi}"><td style="color:var(--text-secondary); padding-left:36px;">└ ${programAdEscapeHtml(programAdLabel(p))}</td>${cells(gn.programs[p])}</tr>`;
          });
        });
      } else {
        const progs = Object.keys(progMap).sort((a, b) => progMap[b].total - progMap[a].total);
        if (!progs.length) body = '<tr><td colspan="100" style="text-align:center; padding:40px;">선택된 조건에 해당하는 데이터가 없습니다.</td></tr>';
        progs.forEach(p => { body += `<tr><td><strong>${programAdEscapeHtml(programAdLabel(p))}</strong></td>${cells(progMap[p])}</tr>`; });
      }
      document.getElementById('programAdDetailTable').innerHTML = `<thead>${h1}${h2}</thead><tbody>${body}</tbody>`;
    }

    // ------------------------------------------------------------
    // Excel 다운로드 (SheetJS는 dashboard.html이 CDN으로 로드)
    // ------------------------------------------------------------
    function programAdToday() { return new Date().toISOString().substring(0, 10); }

    function exportProgramAdToExcel() {
      if (!programAdFilteredRows.length) { alert('다운로드할 데이터가 없습니다.'); return; }
      const out = programAdFilteredRows.map(d => ({
        '조회 기간': `${d.year}-${String(d.month).padStart(2, '0')}`, '채널': d.channel, '장르': d.genre, '프로그램': d.program,
        'GRPs(2049)': d.grp2049, 'GRPs(가구)': d.grpHousehold,
        '일반광고(패키지)': d.revPackage, '일반광고(GRPs기여)': d.revGeneralGrps, '인포머셜': d.revInfomercial, 'IMC': d.revImc, '기타광고': d.revOther, '전체 매출': d.revTotal
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(out), '월별_광고실적_상세');
      XLSX.writeFile(wb, `KT_ENA_프로그램별_광고매출_월별실적_${programAdToday()}.xlsx`);
    }

    function exportProgramAdDetailToExcel() {
      const table = document.getElementById('programAdDetailTable');
      if (!table || table.rows.length === 0) { alert('다운로드할 피벗 데이터가 없습니다.'); return; }
      const wb = XLSX.utils.table_to_book(table, { raw: true });
      const title = (document.getElementById('programAdDetailTitle').innerText || '피벗_상세분석').trim();
      XLSX.writeFile(wb, `KT_ENA_${title}_${programAdToday()}.xlsx`);
    }
