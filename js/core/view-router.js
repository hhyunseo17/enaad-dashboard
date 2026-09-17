// ============================================================
// js/core/view-router.js
// 화면(뷰) 라우팅: VIEW_CONFIG / switchView / open* / popstate — features 이후 로드
// ============================================================
    window.addEventListener('popstate', (e) => {
      // history.state가 비는 경우(주소창에 #뷰를 직접 입력, 해시 링크로 진입)를 위해 해시로 폴백한다.
      const viewKey = (e.state && e.state.view) || viewKeyFromHash();
      switchView(viewKey, false);
    });

    // 새로고침해도 보던 피벗 화면에 머물게 하는 최소 장치.
    // 예전에는 switchView가 pushState의 url 인자로 빈 문자열을 넘겨(= 현재 URL 유지) 주소가 한 번도
    // 바뀌지 않았다. 뒤로가기는 history.state에 실린 {view}로 동작했지만 그 state는 새로고침을 넘기지
    // 못하므로, 로드되면 언제나 메인이었다. 이제 뷰 키를 해시에 남긴다.
    // 쿼리가 아니라 해시인 이유: 해시는 서버로 가지 않아 Cloudflare Pages의 라우팅·Zero Trust 설정을
    // 건드릴 일이 없다.
    function viewKeyFromHash() {
      const key = decodeURIComponent((location.hash || '').replace(/^#/, ''));
      return VIEW_CONFIG[key] ? key : 'main';
    }
    // 데이터 적재가 끝난 뒤에 부른다(finalizeLoadedData). 피벗 렌더러는 filteredData를 읽으므로
    // 그 전에 부르면 빈 표가 그려진다.
    function restoreViewFromHash() {
      const key = viewKeyFromHash();
      if (key !== 'main') switchView(key, false);
    }

    function renderDashboard() {
      renderKPIs(); renderTrendChart(); renderGoalTrendChart(); renderGoalBreakdownChart(); renderPortfolioChart(); renderChannelChart(); renderAdvBucketChart();
      renderRankAgencyChart(); renderRankAdvertiserChart(); renderDeptChart(); renderManagerChart(); renderMoMChart(); renderAgencyCompChart(); renderTableData();
    }

    // ==========================================================================
    // VIEW OPENERS & TOGGLERS
    // ==========================================================================
    function hideAllViews() { document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active')); }
    // family: 'sales'(기존 매출 대시보드 15개 뷰) | 'metrics'(지표 대시보드 2개 뷰).
    // switchView()가 이 값으로 상단 탭 강조와 filter-bar 표시 여부를 정한다(지표 탭은 자기 컨트롤바를 쓴다).
    const VIEW_CONFIG = {
      main: { containerId: 'mainDashboardView', title: '광고사업본부 매출 분석 대시보드', showBreadcrumb: false, family: 'sales', render: () => { applyFilters(); } },
      category: { containerId: 'categoryPivotView', title: '항목별 (대·중·소분류) 월별 분석', showBreadcrumb: true, family: 'sales', render: () => renderCategoryPivotTable() },
      dept: { containerId: 'deptPivotView', title: '부서별 / 항목별 (대·중분류) 월별 분석', showBreadcrumb: true, family: 'sales', render: () => renderDeptPivotTable() },
      manager: { containerId: 'managerPivotView', title: '부서별 / 담당자별 / 대분류 / 광고주 분석', showBreadcrumb: true, family: 'sales', render: () => renderManagerPivotTable() },
      goalTrendPivot: { containerId: 'goalTrendPivotView', title: '월별 목표 대비 실적 (대분류별)', showBreadcrumb: true, family: 'sales', render: () => renderGoalTrendPivotTable() },
      goalDeptPivot: { containerId: 'goalDeptPivotView', title: '부서별 / 담당자별 목표 대비 실적', showBreadcrumb: true, family: 'sales', render: () => renderGoalDeptPivotTable() },
      channel: { containerId: 'channelPivotView', title: '연도별 / 채널별 통합 분석', showBreadcrumb: true, family: 'sales', render: () => { renderChannelPivotTable(); document.getElementById('pivotHeaderTitle').innerText = document.getElementById('headerMainTitle').innerText; } },
      bucket: { containerId: 'bucketPivotView', title: '월단위 광고주 금액 구간별 분포', showBreadcrumb: true, family: 'sales', render: () => renderBucketPivotTable() },
      advertiser: { containerId: 'advertiserPivotView', title: '광고주별 ➔ 대분류 월별 실적', showBreadcrumb: true, family: 'sales', render: () => renderAdvertiserPivotTable() },
      agency: { containerId: 'agencyPivotView', title: '대행사그룹 ➔ 대행사 ➔ 광고주 월별 실적', showBreadcrumb: true, family: 'sales', render: () => renderAgencyPivotTable() },
      momPivot: { containerId: 'momPivotView', title: '전월대비 광고주 증감 상세', showBreadcrumb: true, family: 'sales', render: () => renderMoMPivotTable() },
      agencyCompPivot: { containerId: 'agencyCompPivotView', title: '주요 대행사 전년·전월 비교 상세', showBreadcrumb: true, family: 'sales', render: () => renderAgencyCompPivotTable() },
      newAdvPivot: { containerId: 'newAdvPivotView', title: '신규 광고주 상세', showBreadcrumb: true, family: 'sales', render: () => renderNewAdvPivotTable() },
      upfrontPivot: { containerId: 'upfrontPivotView', title: '업프론트 실적 현황', showBreadcrumb: true, family: 'sales', render: () => renderUpfrontPivotTable() },
      detailData: { containerId: 'detailDataView', title: '세부데이터 탐색', showBreadcrumb: true, family: 'sales', render: () => renderDetailDataPivot() },
      // --- 지표 대시보드(경쟁채널 벤치마크) ---------------------------------------
      // parentView를 명시하지 않는 위 15개는 returnToParentView()가 'main'으로 기본 처리한다(동작 그대로 유지).
      metricsMain: { containerId: 'metricsMainView', title: '경쟁채널 지표 대시보드', showBreadcrumb: false, family: 'metrics', render: () => renderMetricsDashboard() },
      metricsDetail: { containerId: 'metricsDetailView', title: '경쟁채널 지표 상세', showBreadcrumb: true, family: 'metrics', parentView: 'metricsMain', render: () => renderMetricsDetailView() },
      // 매출 4개 차트(시장규모 추이/M-S 트렌드/매출 트렌드/매출 랭킹)의 "카드 클릭 → 전용 피벗 화면"
      // (2026-09-16, 사용자 요청 — 매출 대시보드의 openCategoryPivotView() 등과 같은 관례). 각 프리셋은
      // js/features/pivot-builder.js의 PIVOT_PRESETS에 등록돼 있다 — render()는 그 엔진(renderPresetPivot)을
      // 그대로 호출한다.
      // render()가 renderMetricsPivotView(viewKey)를 쓴다 — 프리셋을 그리기 전에 그 화면 전용
      // 연도/월 조회조건 pill(metrics-dashboard.js)부터 세팅한다(2026-09-16, 사용자 요청: "조회조건이
      // 위에 보여야지" — 매출 대시보드의 filter-bar가 모든 피벗 화면에서 계속 보이고 조작 가능한 것과
      // 구조를 맞춘다).
      metricsMarketByScopePivot: { containerId: 'metricsMarketByScopePivotView', title: '방송광고시장 규모 추이 — 피벗 상세', showBreadcrumb: true, family: 'metrics', parentView: 'metricsMain', render: () => renderMetricsPivotView('metricsMarketByScopePivot') },
      metricsMsTrendPivot: { containerId: 'metricsMsTrendPivotView', title: 'KT ENA M/S 트렌드 — 피벗 상세', showBreadcrumb: true, family: 'metrics', parentView: 'metricsMain', render: () => renderMetricsPivotView('metricsMsTrendPivot') },
      metricsRevenueTrendPivot: { containerId: 'metricsRevenueTrendPivotView', title: '매출 트렌드 — 피벗 상세', showBreadcrumb: true, family: 'metrics', parentView: 'metricsMain', render: () => renderMetricsPivotView('metricsRevenueTrendPivot') },
      metricsRevenueRankingPivot: { containerId: 'metricsRevenueRankingPivotView', title: '매출 랭킹 — 피벗 상세', showBreadcrumb: true, family: 'metrics', parentView: 'metricsMain', render: () => renderMetricsPivotView('metricsRevenueRankingPivot') },
      // CPRP/채널시청률/eq-GRPs/광고주수 미니 트렌드 4종의 "카드 클릭 → 전용 피벗 화면"(2026-09-16,
      // 사용자 요청: "CPRP, 시청률, eq GRPs, 광고주수도 각각 피벗테이블 연결해줘") — 위 매출 4개와 같은 관례.
      metricsCprpTrendPivot: { containerId: 'metricsCprpTrendPivotView', title: 'CPRP 트렌드 — 피벗 상세', showBreadcrumb: true, family: 'metrics', parentView: 'metricsMain', render: () => renderMetricsPivotView('metricsCprpTrendPivot') },
      metricsRatingTrendPivot: { containerId: 'metricsRatingTrendPivotView', title: '채널시청률 트렌드 — 피벗 상세', showBreadcrumb: true, family: 'metrics', parentView: 'metricsMain', render: () => renderMetricsPivotView('metricsRatingTrendPivot') },
      metricsGrpTrendPivot: { containerId: 'metricsGrpTrendPivotView', title: 'eq-GRPs 트렌드 — 피벗 상세', showBreadcrumb: true, family: 'metrics', parentView: 'metricsMain', render: () => renderMetricsPivotView('metricsGrpTrendPivot') },
      metricsAdvCountTrendPivot: { containerId: 'metricsAdvCountTrendPivotView', title: '광고주수 트렌드 — 피벗 상세', showBreadcrumb: true, family: 'metrics', parentView: 'metricsMain', render: () => renderMetricsPivotView('metricsAdvCountTrendPivot') },
      // "1%↑ 시청률 프로그램 수" 채널별 막대 + 월별 추이 라인의 "카드 클릭 → 전용 피벗 화면"
      // (2026-09-17 신규) — 위 매출·CPRP 계열 8개와 같은 관례. Bar 쪽은 한 번 전용 렌더러
      // renderMetricsGenreRatingBandPivot()(정적 2차원 표)로 바뀌었다가, 메인 조회 pill이 사라지는
      // 문제로 다른 8개와 동일한 renderMetricsPivotView() 경로로 되돌아왔다(2026-09-17).
      metricsGenreQualifyingBarPivot: { containerId: 'metricsGenreQualifyingBarPivotView', title: '1%↑ 시청률 프로그램 수 (채널별) — 구간별 분포 — 피벗 상세', showBreadcrumb: true, family: 'metrics', parentView: 'metricsMain', render: () => renderMetricsPivotView('metricsGenreQualifyingBarPivot') },
      metricsGenreQualifyingTrendPivot: { containerId: 'metricsGenreQualifyingTrendPivotView', title: '1%↑ 시청률 프로그램 수 (월별 추이) — 피벗 상세', showBreadcrumb: true, family: 'metrics', parentView: 'metricsMain', render: () => renderMetricsPivotView('metricsGenreQualifyingTrendPivot') },
    };

    function switchView(viewKey, pushHistory) {
      if (pushHistory === undefined) pushHistory = true;
      const cfg = VIEW_CONFIG[viewKey]; if (!cfg) return;
      // 롤백 스위치(METRICS_DASHBOARD_ENABLED, state.js) 꺼짐 또는 이메일 허용목록 밖이면 해시로
      // 직접 진입해도 못 들어오게 막는다 — 헤더 탭 숨김(js/core/auth.js)은 콘솔로 우회 가능해서
      // 여기가 실제 방어선이다(단, 진짜 방어선은 파일 자체를 막는 서버 쪽 403 — requireMetricsAccess).
      if (cfg.family === 'metrics' && !metricsAccessAllowed) { switchView('main', pushHistory); return; }
      currentView = viewKey; hideAllViews();
      document.getElementById(cfg.containerId).classList.add('active');
      document.getElementById('breadcrumbBox').style.display = cfg.showBreadcrumb ? 'flex' : 'none';
      document.getElementById('headerMainTitle').innerText = cfg.title;
      // 매출 탭은 filter-bar, 지표 탭은 .metrics-control-bar — 서로 반대로 토글한다.
      const filterBarSection = document.getElementById('filterBarSection');
      if (filterBarSection) filterBarSection.style.display = cfg.family === 'metrics' ? 'none' : '';
      // "실시간 연결/원본 수정"(매출 데이터 전용) — filter-bar와 같은 원칙으로 매출 쪽 전체(15개 뷰)에서
      // 계속 보이고, 지표 탭에서만 숨긴다(2026-09-16, 사용자: "이거까지는 매출대시보드 내에서는 고정").
      const salesStatusLegend = document.getElementById('salesStatusLegend');
      if (salesStatusLegend) salesStatusLegend.style.display = cfg.family === 'metrics' ? 'none' : '';
      // 지표 탭 전용 컨트롤바(연도/월/①②/매출기준) — filter-bar와 정확히 반대로 토글한다. 예전엔
      // #metricsMainView 안에 갇혀 있어서 metricsMain을 벗어나면(다른 view-section으로 바뀌면) 이
      // hideAllViews()가 손대지 않아도 컨테이너 자체가 사라지며 같이 사라졌다 — 이제 dashboard.html에서
      // 모든 view-section의 형제로 옮겨졌으므로 여기서 명시적으로 켜고 꺼야 한다(2026-09-17, 사용자
      // 지적: "매출 대시보드처럼 이런 식으로 피벗테이블 화면이 나와야지. 상세조건 조회 화면은 위에
      // 남겨놓고" — metricsMain/metricsDetail + 피벗 상세 10개 전부에서 이 바 하나를 공유한다).
      const metricsControlBar = document.querySelector('.metrics-control-bar');
      if (metricsControlBar) metricsControlBar.style.display = cfg.family === 'metrics' ? '' : 'none';
      syncDashboardTabs(cfg.family);
      // 화면 전환 중 생성되는 차트만 긴 인트로를 쓴다. render() 안에서 applyFilters()가
      // 다시 불릴 수 있으므로(main 뷰), 플래그는 render()가 끝나면 반드시 되돌린다.
      setChartAnimForViewEntry(true);
      // finally에서 기본값을 짧은 쪽으로 되돌려 둔다 — 이후 차트 모드 토글(setTrendChartMode 등)은
      // applyFilters()를 거치지 않고 render*Chart()를 직접 부르므로, 그때 남아있는 기본값을 쓴다.
      try { cfg.render(); } finally { setChartAnimForViewEntry(false); applyChartAnimDuration(); }
      // url 인자에 빈 문자열을 넘기면 현재 URL이 유지되어 주소에 아무 흔적이 남지 않는다.
      // 메인은 해시를 걷어내고, 나머지는 #뷰키를 남겨 새로고침·주소 공유가 그 화면으로 열리게 한다.
      if (pushHistory) history.pushState({ view: viewKey }, '', viewKey === 'main' ? location.pathname + location.search : '#' + viewKey);
    }

    function returnToMainDashboard() { switchView('main'); }
    // breadcrumb의 "⬅" 버튼은 이제 이 함수를 부른다(하드코딩된 returnToMainDashboard() 대신).
    // parentView 미지정 뷰(기존 11개 매출 드릴다운)는 'main'으로 기본 처리되어 동작이 예전과 같다.
    // returnToMainDashboard() 자신은 .brand-logo가 여전히 직접 호출하므로 그대로 남겨 둔다.
    function returnToParentView() {
      const cfg = VIEW_CONFIG[currentView];
      switchView((cfg && cfg.parentView) || 'main');
    }
    // 헤더 탭 스트립("매출 대시보드"/"지표 대시보드") 활성 표시. family 기준으로 켠다 —
    // 매출 쪽 15개 뷰 중 어디에 있든 "매출 대시보드" 탭이, metricsMain/metricsDetail 어디든
    // "지표 대시보드" 탭이 켜진다.
    function syncDashboardTabs(family) {
      const salesTab = document.getElementById('dashboardTabSales');
      const metricsTab = document.getElementById('dashboardTabMetrics');
      if (salesTab) salesTab.classList.toggle('active', family !== 'metrics');
      if (metricsTab) metricsTab.classList.toggle('active', family === 'metrics');
      // 헤더 "세부데이터" 버튼은 매출/지표 두 탭에서 서로 다른 화면(detailData/metricsDetail)을
      // 여는데 라벨이 같아 헷갈렸다(2026-09-16, 사용자 요청: "세부데이터 표기를 매출 세부데이터 /
      // 지표 세부데이터 이렇게 바꾸자") — 지금 보고 있는 탭에 맞춰 라벨을 바꾼다.
      const detailDataBtn = document.getElementById('detailDataBtn');
      if (detailDataBtn) detailDataBtn.textContent = family === 'metrics' ? '🔍 지표 세부데이터' : '🔍 매출 세부데이터';
    }
    function openMetricsMainView() { switchView('metricsMain'); }
    function openMetricsDetailView() { switchView('metricsDetail'); }
    function openCategoryPivotView() { switchView('category'); }
    function openDeptPivotView() { switchView('dept'); }
    function openManagerPivotView() { switchView('manager'); }
    function openChannelPivotView() { switchView('channel'); }
    function openBucketPivotView() { switchView('bucket'); }
    function openAdvertiserPivotView() { switchView('advertiser'); }
    function openAgencyPivotView() { switchView('agency'); }
    // 매출 대시보드에서 누르면 기존 세부데이터(자유 피벗 빌더)로, 지표 대시보드에서 누르면
    // 경쟁채널 지표 상세(metricsDetail)로 — 헤더의 "세부데이터" 버튼 하나가 지금 보고 있는 탭에
    // 맞는 상세 화면을 연다(2026-09-16, 사용자 요청: "세부데이터를 매출대시보드에서 누르면 기존처럼
    // 뜨면 되고, 지표대시보드에서 누르면 아래에 있는 표들이 나오는 거야").
    function openDetailDataView() {
      const family = (VIEW_CONFIG[currentView] || {}).family;
      switchView(family === 'metrics' ? 'metricsDetail' : 'detailData');
    }
    function openGoalTrendPivotView() { switchView('goalTrendPivot'); }
    function openGoalDeptPivotView() { switchView('goalDeptPivot'); }
    function openMetricsMarketByScopePivotView() { switchView('metricsMarketByScopePivot'); }
    function openMetricsMsTrendPivotView() { switchView('metricsMsTrendPivot'); }
    function openMetricsRevenueTrendPivotView() { switchView('metricsRevenueTrendPivot'); }
    function openMetricsRevenueRankingPivotView() { switchView('metricsRevenueRankingPivot'); }
    function openMetricsCprpTrendPivotView() { switchView('metricsCprpTrendPivot'); }
    function openMetricsRatingTrendPivotView() { switchView('metricsRatingTrendPivot'); }
    function openMetricsGrpTrendPivotView() { switchView('metricsGrpTrendPivot'); }
    function openMetricsAdvCountTrendPivotView() { switchView('metricsAdvCountTrendPivot'); }
    function openMetricsGenreQualifyingBarPivotView() { switchView('metricsGenreQualifyingBarPivot'); }
    function openMetricsGenreQualifyingTrendPivotView() { switchView('metricsGenreQualifyingTrendPivot'); }

    function toggleYearColumn(viewType, yr) {
      if (viewType === 'channel') { expandedYearColumns[yr] = !expandedYearColumns[yr]; renderChannelPivotTable(); }
      else if (viewType === 'bucket') { expandedBucketYearColumns[yr] = !expandedBucketYearColumns[yr]; renderBucketPivotTable(); }
      else if (viewType === 'advertiser') { expandedAdvertiserYearColumns[yr] = !expandedAdvertiserYearColumns[yr]; renderAdvertiserPivotTable(); }
      else if (viewType === 'agency') { expandedAgencyYearColumns[yr] = !expandedAgencyYearColumns[yr]; renderAgencyPivotTable(); }
      else if (viewType === 'cat') { expandedCatYearColumns[yr] = !expandedCatYearColumns[yr]; renderCategoryPivotTable(); }
      else if (viewType === 'dept') { expandedDeptYearColumns[yr] = !expandedDeptYearColumns[yr]; renderDeptPivotTable(); }
      else if (viewType === 'mgr') { expandedMgrYearColumns[yr] = !expandedMgrYearColumns[yr]; renderManagerPivotTable(); }
      else if (viewType === 'goalTrend') { expandedGoalTrendYearColumns[yr] = !expandedGoalTrendYearColumns[yr]; renderGoalTrendPivotTable(); }
      else if (viewType === 'goalDept') { expandedGoalDeptYearColumns[yr] = !expandedGoalDeptYearColumns[yr]; renderGoalDeptPivotTable(); }
    }
    function expandAllYears(viewType, expand) {
      // 목표 피벗은 열 축이 filteredData가 아니라 목표 스코프(buildGoalScopeSet)에서 나오므로
      // 연도 목록도 거기서 가져오고, applyFilters()를 거치지 않고 자기 표만 다시 그린다.
      if (viewType === 'goalTrend' || viewType === 'goalDept') {
        const goalYears = new Set();
        buildGoalScopeSet().forEach(ym => goalYears.add(Number(ym.split('-')[0])));
        const map = viewType === 'goalTrend' ? expandedGoalTrendYearColumns : expandedGoalDeptYearColumns;
        goalYears.forEach(yr => { map[yr] = expand; });
        if (viewType === 'goalTrend') renderGoalTrendPivotTable(); else renderGoalDeptPivotTable();
        return;
      }
      const years = [...new Set(filteredData.map(r => r.year))];
      years.forEach(yr => {
        if (viewType === 'channel') expandedYearColumns[yr] = expand;
        else if (viewType === 'bucket') expandedBucketYearColumns[yr] = expand;
        else if (viewType === 'advertiser') expandedAdvertiserYearColumns[yr] = expand;
        else if (viewType === 'agency') expandedAgencyYearColumns[yr] = expand;
        else if (viewType === 'cat') expandedCatYearColumns[yr] = expand;
        else if (viewType === 'dept') expandedDeptYearColumns[yr] = expand;
        else if (viewType === 'mgr') expandedMgrYearColumns[yr] = expand;
      });
      applyFilters();
    }

    function toggleCatPivotNode(l1, l2) { const k = l2 ? `${l1}||${l2}` : l1; expandedCatPivot[k] = !expandedCatPivot[k]; renderCategoryPivotTable(); }
    function toggleDeptPivotNode(l1, l2) { const k = l2 ? `${l1}||${l2}` : l1; expandedDeptPivot[k] = !expandedDeptPivot[k]; renderDeptPivotTable(); }
    function toggleMgrPivotNode(l1, l2, l3, l4) { let k = l1; if(l2) k += `||${l2}`; if(l3) k += `||${l3}`; if(l4) k += `||${l4}`; expandedMgrPivot[k] = !expandedMgrPivot[k]; renderManagerPivotTable(); }
    // 목표 피벗의 행 토글은 이제 toggleGoalPivotNode(뷰키, 경로)가 처리한다(행 축이 뷰마다 다르므로).
    // 이 이름은 예전 표기가 남아 있을 경우를 위한 얇은 래퍼로만 둔다.
    function toggleGoalDeptPivotNode(l1, l2) { toggleGoalPivotNode('goalDeptPivot', l2 ? `${l1}||${l2}` : l1); }
    function toggleDetailDataNode(path) { expandedDetailDataPivot[path] = !expandedDetailDataPivot[path]; renderDetailDataPivot(); }
    function toggleDetailDataColNode(path) { expandedDetailDataColPivot[path] = !expandedDetailDataColPivot[path]; renderDetailDataPivot(); }

    function toggleChannelNode(chName) { expandedChannels[chName] = !expandedChannels[chName]; renderChannelPivotTable(); }
    function toggleCategoryNode(chName, catName) { expandedCategories[`${chName}||${catName}`] = !expandedCategories[`${chName}||${catName}`]; renderChannelPivotTable(); }
    function toggleAdvertiserNode(advName) { expandedAdvertisers[advName] = !expandedAdvertisers[advName]; renderAdvertiserPivotTable(); }
    function toggleAgencyGroupNode(groupName) { expandedAgencyGroups[groupName] = !expandedAgencyGroups[groupName]; renderAgencyPivotTable(); }
    function toggleAgencyNode(groupName, agencyName) { expandedAgencies[`${groupName}||${agencyName}`] = !expandedAgencies[`${groupName}||${agencyName}`]; renderAgencyPivotTable(); }
    function toggleBucketMetricSection(metricName) { expandedBucketMetricSections[metricName] = !expandedBucketMetricSections[metricName]; renderBucketPivotTable(); }
    function toggleBucketAdvertisers(metricName, bucketKey) { const k = metricName + '||' + bucketKey; expandedBucketAdvertisers[k] = !expandedBucketAdvertisers[k]; renderBucketPivotTable(); }


    // ==========================================================================
    // 1. 항목별 (대중소) 피벗
    // ==========================================================================
