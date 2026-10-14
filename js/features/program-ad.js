// ============================================================
// js/features/program-ad.js
// 프로그램별 광고매출 & GRPs 탭(family: 'programAd'): 컨트롤바(연/월/채널/장르/프로그램 검색) /
// KPI 5장 / 차트 4종 / 프로그램 피벗 표(공용 엔진 programAdMain) / 항목별 상세 피벗(공용 엔진 programAdDetail) / Excel
//
// 기존 별도 저장소(program-ad)의 index.html·app.js 기능을 그대로 옮기고 디자인만 이 대시보드 것을 쓴다.
// 매출·지표 탭과 완전히 독립이다 — rawData/filteredData/applyFilters/revenueBasisMode 등 매출 쪽 상태를
// 읽지도 바꾸지도 않는다. 데이터는 programad-data-loader.js의 programAdRows, 필터 결과는
// programAdFilteredRows, UI 상태는 state.js의 programAd* 변수. 전역 스코프를 공유하므로 모든 이름에
// programAd 접두사를 붙인다.
//
// 피벗 두 개는 공용 엔진(pivot-builder.js)의 PIVOT_PRESETS.programAdMain / programAdDetail이 그린다 — 지표 탭 피벗과
// 같은 방식으로 dataSource만 이 탭 데이터(programAdFilteredRows)를 가리킨다(docs/features/program-ad.md).
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
    // KPI·차트는 억원. (피벗의 백만원 소수 1자리 서식은 엔진 쪽 PV_FMT_PROGRAM_AD_MONEY 한 곳에서 정한다.)
    function programAdFmt100M(won, d) {
      if (!won || isNaN(won)) return '0억원';
      return (won / 1e8).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '억원';
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
        if (list) list.addEventListener('change', () => { programAdSyncCheckboxState(type); applyProgramAdFilters(); });
      });
      const search = document.getElementById('inputProgramAdSearch');
      if (search) search.addEventListener('input', () => { applyProgramAdFilters(); });
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
      applyProgramAdFilters();
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
      applyProgramAdFilters();
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
      applyProgramAdFilters();
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
      applyProgramAdFilters();
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
      applyProgramAdFilters();
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
    function applyProgramAdFilters() {
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
      applyChartAnimDuration();
      if (currentView === 'programAdMain') renderProgramAdContent();
      else if (currentView === 'programAdDetail') renderProgramAdPivot('programAdDetail');
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
      applyProgramAdFilters();
    }

    function renderProgramAdContent() {
      renderProgramAdKpis();
      renderProgramAdCharts();
      renderProgramAdPivot('programAdMain');
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
      // 진입 지표가 바뀌면 값 필드가 달라지므로 표 구성(값·축·정렬)과 행 펼침을 처음 모양으로 되돌린다.
      pvResetConfig('programAdDetail');
      Object.keys(expandedProgramAdDetailPivot).forEach(k => { delete expandedProgramAdDetailPivot[k]; });
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
    // 피벗 두 개 — 공용 엔진(pivot-builder.js)의 PIVOT_PRESETS.programAdMain(본표) / programAdDetail(상세)
    //
    // 지표 탭 피벗(metricsRevenueTrendPivot 등)과 같은 방식이다. 프리셋의 dataSource가 매출 쪽 전역이 아니라 이
    // 탭의 programAdRows를 컨트롤바(연/월/채널/장르/프로그램 검색)로 좁힌 결과를 읽는다. 컨트롤바에 있는 조건은
    // 여기(위쪽)에서만 걸고, 빌더의 필터 well에는 놓을 수 없게 막아 이중으로 걸리지 않는다.
    // 프리셋 키가 곧 뷰 키(programAdMain/programAdDetail)여야 빌더 드래그앤드롭이 동작한다.
    // ------------------------------------------------------------
    // 지금 그려지는 값(빌더 구성의 첫 값, 값 well이 비면 프리셋 기본값)이 합계(sum)이면 그 필드가 0인 행은 뺀다 —
    // 0은 합에 영향이 없고, 빼지 않으면 해당 지표가 없는 프로그램이 `-` 행으로 줄줄이 나온다. 평균·개수는 0 행이
    // 결과를 바꾸므로 거르지 않는다. 사용자가 값 well에서 필드를 바꾸면 그 필드 기준으로 따라간다.
    function programAdCurrentValueDef(viewKey) {
      const cfg = pvConfigFor(viewKey);
      return cfg.values[0] || PIVOT_PRESETS[viewKey].values[0];
    }
    function programAdPivotRows(viewKey) {
      const v = programAdCurrentValueDef(viewKey);
      if (!v || v.agg !== 'sum') return programAdFilteredRows;
      const f = v.field;
      return programAdFilteredRows.filter(r => r[f]);
    }
    function programAdMainDataForPivot() { return programAdPivotRows('programAdMain'); }
    function programAdDetailDataForPivot() { return programAdPivotRows('programAdDetail'); }

    // 상세 피벗의 값 정의 — 차트에서 들어온 지표의 필드(장르 차트는 전체매출). 프리셋의 values getter가 부른다.
    function programAdDetailValueDef() {
      const key = programAdDetailMetric === 'genre' ? 'tot' : programAdDetailMetric;
      const field = PROGRAM_AD_METRICS[key].field;
      return { field, agg: 'sum', format: PV_VALUE_FORMAT_BY_FIELD[field] };
    }

    function programAdMetricByField(field) {
      return Object.values(PROGRAM_AD_METRICS).find(m => m.field === field) || null;
    }

    // 표 위 "합계 : 전체매출 (백만원)" 문구 — 값 well에서 필드·집계를 바꾸면 따라 바뀐다.
    function programAdValueCaption(v) {
      if (!v) return '합계';
      const label = detailDataFieldLabel(v.field);
      if (v.agg === 'count' || v.agg === 'distinct') return `${DETAIL_DATA_AGG_LABELS[v.agg]} : ${label} (건)`;
      const m = programAdMetricByField(v.field);
      return `${v.agg === 'avg' ? '평균' : '합계'} : ${label} (${m && m.kind === 'grps' ? 'GRPs' : '백만원'})`;
    }

    // 엔진이 그린 뒤 이 탭에만 있는 보조 요소(합계 문구·상세 제목·빈 데이터 안내)를 채운다.
    // 프리셋의 render가 이 함수라서 토글·정렬·빌더 조작 등 엔진이 다시 그리는 모든 경로를 거친다.
    function renderProgramAdPivot(viewKey) {
      const preset = PIVOT_PRESETS[viewKey];
      renderPresetPivot(viewKey);
      const captionEl = document.getElementById(viewKey + 'PivotTotalLabel');
      if (captionEl) captionEl.innerText = programAdValueCaption(programAdCurrentValueDef(viewKey)); // 값 well이 비면 실제로 그려진 기본값 이름
      if (viewKey === 'programAdDetail') renderProgramAdDetailTitle();
      if (!preset.dataSource().length) {
        document.getElementById(preset.dom.body).innerHTML =
          '<tr><td colspan="100" style="text-align:center; color:var(--text-tertiary); padding:40px;">선택된 조건에 해당하는 데이터가 없습니다.</td></tr>';
      }
    }

    function renderProgramAdDetailTitle() {
      const key = programAdDetailMetric;
      const valueKey = key === 'genre' ? 'tot' : key;
      const dot = (key !== 'genre' && valueKey !== 'tot') ? `<span class="programad-dot" style="background:${PAC(valueKey)}; width:10px; height:10px;"></span>` : '';
      document.getElementById('programAdDetailTitle').innerHTML = dot + programAdEscapeHtml(PROGRAM_AD_DETAIL_TITLES[key] || '매출 상세 분석');
    }

    // VIEW_CONFIG.programAdDetail.render()의 진입점 (view-router.js)
    function renderProgramAdDetail() {
      const bodyEl = document.getElementById('programAdDetailPivotTableBody');
      if (!programAdDataLoaded) {
        bodyEl.innerHTML = '<tr><td style="padding:40px; text-align:center;">데이터를 불러오는 중입니다…</td></tr>';
        fetchProgramAdDataHttp()
          .then(() => { if (currentView === 'programAdDetail') renderProgramAdDetail(); })
          .catch(err => { bodyEl.innerHTML = `<tr><td style="padding:40px; text-align:center; color:var(--accent-red);">${programAdEscapeHtml('데이터를 불러오지 못했습니다: ' + (err && err.message ? err.message : err))}</td></tr>`; });
        return;
      }
      initProgramAdFilters();
      renderProgramAdDataAsOfLabel();
      applyProgramAdFilters(); // 현재 필터로 programAdFilteredRows를 만들고 상세 피벗까지 그린다
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
