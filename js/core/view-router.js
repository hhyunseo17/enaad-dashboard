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
    const VIEW_CONFIG = {
      main: { containerId: 'mainDashboardView', title: '광고사업본부 매출 분석 대시보드', showBreadcrumb: false, render: () => { applyFilters(); } },
      category: { containerId: 'categoryPivotView', title: '항목별 (대·중·소분류) 월별 분석', showBreadcrumb: true, render: () => renderCategoryPivotTable() },
      dept: { containerId: 'deptPivotView', title: '부서별 / 항목별 (대·중분류) 월별 분석', showBreadcrumb: true, render: () => renderDeptPivotTable() },
      manager: { containerId: 'managerPivotView', title: '부서별 / 담당자별 / 대분류 / 광고주 분석', showBreadcrumb: true, render: () => renderManagerPivotTable() },
      goalTrendPivot: { containerId: 'goalTrendPivotView', title: '월별 목표 대비 실적 (대분류별)', showBreadcrumb: true, render: () => renderGoalTrendPivotTable() },
      goalDeptPivot: { containerId: 'goalDeptPivotView', title: '부서별 / 담당자별 목표 대비 실적', showBreadcrumb: true, render: () => renderGoalDeptPivotTable() },
      channel: { containerId: 'channelPivotView', title: '연도별 / 채널별 통합 분석', showBreadcrumb: true, render: () => { renderChannelPivotTable(); document.getElementById('pivotHeaderTitle').innerText = document.getElementById('headerMainTitle').innerText; } },
      bucket: { containerId: 'bucketPivotView', title: '월단위 광고주 금액 구간별 분포', showBreadcrumb: true, render: () => renderBucketPivotTable() },
      advertiser: { containerId: 'advertiserPivotView', title: '광고주별 ➔ 대분류 월별 실적', showBreadcrumb: true, render: () => renderAdvertiserPivotTable() },
      agency: { containerId: 'agencyPivotView', title: '대행사그룹 ➔ 대행사 ➔ 광고주 월별 실적', showBreadcrumb: true, render: () => renderAgencyPivotTable() },
      momPivot: { containerId: 'momPivotView', title: '전월대비 광고주 증감 상세', showBreadcrumb: true, render: () => renderMoMPivotTable() },
      agencyCompPivot: { containerId: 'agencyCompPivotView', title: '주요 대행사 전년·전월 비교 상세', showBreadcrumb: true, render: () => renderAgencyCompPivotTable() },
      newAdvPivot: { containerId: 'newAdvPivotView', title: '신규 광고주 상세', showBreadcrumb: true, render: () => renderNewAdvPivotTable() },
      upfrontPivot: { containerId: 'upfrontPivotView', title: '업프론트 실적 현황', showBreadcrumb: true, render: () => renderUpfrontPivotTable() },
      detailData: { containerId: 'detailDataView', title: '세부데이터 탐색', showBreadcrumb: true, render: () => renderDetailDataPivot() }
    };

    function switchView(viewKey, pushHistory) {
      if (pushHistory === undefined) pushHistory = true;
      const cfg = VIEW_CONFIG[viewKey]; if (!cfg) return;
      currentView = viewKey; hideAllViews();
      document.getElementById(cfg.containerId).classList.add('active');
      document.getElementById('breadcrumbBox').style.display = cfg.showBreadcrumb ? 'flex' : 'none';
      document.getElementById('headerMainTitle').innerText = cfg.title;
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
    function openCategoryPivotView() { switchView('category'); }
    function openDeptPivotView() { switchView('dept'); }
    function openManagerPivotView() { switchView('manager'); }
    function openChannelPivotView() { switchView('channel'); }
    function openBucketPivotView() { switchView('bucket'); }
    function openAdvertiserPivotView() { switchView('advertiser'); }
    function openAgencyPivotView() { switchView('agency'); }
    function openDetailDataView() { switchView('detailData'); }
    function openGoalTrendPivotView() { switchView('goalTrendPivot'); }
    function openGoalDeptPivotView() { switchView('goalDeptPivot'); }

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
