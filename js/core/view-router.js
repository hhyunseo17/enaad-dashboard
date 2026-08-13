// ============================================================
// js/core/view-router.js
// 화면(뷰) 라우팅: VIEW_CONFIG / switchView / open* / popstate — features 이후 로드
// ============================================================
    window.addEventListener('popstate', (e) => {
      const viewKey = (e.state && e.state.view) || 'main';
      switchView(viewKey, false);
    });

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
      category: { containerId: 'categoryPivotView', title: '항목별 (대·중·소분류) 월별 수주 실적 분석', showBreadcrumb: true, render: () => renderCategoryPivotTable() },
      dept: { containerId: 'deptPivotView', title: '부서별 / 항목별 (대·중분류) 월별 분석', showBreadcrumb: true, render: () => renderDeptPivotTable() },
      manager: { containerId: 'managerPivotView', title: '부서별 / 담당자별 / 대분류 / 광고주 상세 분석', showBreadcrumb: true, render: () => renderManagerPivotTable() },
      channel: { containerId: 'channelPivotView', title: '연도별 / 채널별 통합 분석', showBreadcrumb: true, render: () => { renderChannelPivotTable(); document.getElementById('pivotHeaderTitle').innerText = document.getElementById('headerMainTitle').innerText; } },
      bucket: { containerId: 'bucketPivotView', title: '월단위 광고주 금액 구간별 분포', showBreadcrumb: true, render: () => renderBucketPivotTable() },
      advertiser: { containerId: 'advertiserPivotView', title: '광고주별 ➔ 대분류 월별 실적 (전체 광고주)', showBreadcrumb: true, render: () => renderAdvertiserPivotTable() },
      agency: { containerId: 'agencyPivotView', title: '대행사그룹 ➔ 대행사 ➔ 광고주 월별 실적', showBreadcrumb: true, render: () => renderAgencyPivotTable() },
      momPivot: { containerId: 'momPivotView', title: '전월대비 광고주 증감 상세', showBreadcrumb: true, render: () => renderMoMPivotTable() },
      agencyCompPivot: { containerId: 'agencyCompPivotView', title: '주요 대행사 전년·전월 비교 상세', showBreadcrumb: true, render: () => renderAgencyCompPivotTable() },
      newAdvPivot: { containerId: 'newAdvPivotView', title: '신규 광고주 상세', showBreadcrumb: true, render: () => renderNewAdvPivotTable() },
      upfrontPivot: { containerId: 'upfrontPivotView', title: '업프론트 실적 현황', showBreadcrumb: true, render: () => renderUpfrontPivotTable() }
    };

    function switchView(viewKey, pushHistory) {
      if (pushHistory === undefined) pushHistory = true;
      const cfg = VIEW_CONFIG[viewKey]; if (!cfg) return;
      currentView = viewKey; hideAllViews();
      document.getElementById(cfg.containerId).classList.add('active');
      document.getElementById('breadcrumbBox').style.display = cfg.showBreadcrumb ? 'flex' : 'none';
      document.getElementById('headerMainTitle').innerText = cfg.title;
      cfg.render();
      if (pushHistory) history.pushState({ view: viewKey }, '', '');
    }

    function returnToMainDashboard() { switchView('main'); }
    function openCategoryPivotView() { switchView('category'); }
    function openDeptPivotView() { switchView('dept'); }
    function openManagerPivotView() { switchView('manager'); }
    function openChannelPivotView() { switchView('channel'); }
    function openBucketPivotView() { switchView('bucket'); }
    function openAdvertiserPivotView() { switchView('advertiser'); }
    function openAgencyPivotView() { switchView('agency'); }

    function toggleYearColumn(viewType, yr) {
      if (viewType === 'channel') { expandedYearColumns[yr] = !expandedYearColumns[yr]; renderChannelPivotTable(); }
      else if (viewType === 'bucket') { expandedBucketYearColumns[yr] = !expandedBucketYearColumns[yr]; renderBucketPivotTable(); }
      else if (viewType === 'advertiser') { expandedAdvertiserYearColumns[yr] = !expandedAdvertiserYearColumns[yr]; renderAdvertiserPivotTable(); }
      else if (viewType === 'agency') { expandedAgencyYearColumns[yr] = !expandedAgencyYearColumns[yr]; renderAgencyPivotTable(); }
      else if (viewType === 'cat') { expandedCatYearColumns[yr] = !expandedCatYearColumns[yr]; renderCategoryPivotTable(); }
      else if (viewType === 'dept') { expandedDeptYearColumns[yr] = !expandedDeptYearColumns[yr]; renderDeptPivotTable(); }
      else if (viewType === 'mgr') { expandedMgrYearColumns[yr] = !expandedMgrYearColumns[yr]; renderManagerPivotTable(); }
    }
    function expandAllYears(viewType, expand) {
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
