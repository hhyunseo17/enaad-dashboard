// ============================================================
// js/features/shared-helpers.js
// 여러 기능이 공유하는 소형 헬퍼(신규광고주 판별, 차트 모드 토글)
// ============================================================
    // 광고주 단위 지표(신규광고주/광고주당매출/구간별분포/MoM 광고주별 등) 산정의 공통 대상 조건:
    // 본부매출 + 일반광고/IMC + 배분수익·1/N 제외
    function isAdvMetricEligible(r) {
      const isOneN = (r.oneNFlag || '').toString().trim() === '1' || (r.oneNFlag || '').toString().toLowerCase() === 'y';
      return r.bonbuRevenueStatus === '본부매출' && (r.categoryOriginal === '일반광고' || r.categoryOriginal === 'IMC') && r.subCategory3 !== '배분수익' && !isOneN;
    }

    // mom.js/agency-comp.js/new-advertiser.js가 공유하던 필터 체인(본부매출+취급고/회계+부서/채널/방송구분+대행사·광고주 텍스트 검색)을
    // 단일 지점으로 통합. applyFilters()(filters.js)와 조건은 동일하되, 연/월·대분류 필터는 호출부가 별도로 처리하므로 여기 포함하지 않는다.
    // eligibilityFn으로 마지막 대상범위 조건(예: isAdvMetricEligible, 일반광고/IMC 여부)을 주입받는다.
    function makeCommonMatch(eligibilityFn) {
      const agencyTxt = document.getElementById('inputAgency').value.trim().toLowerCase();
      const advTxt = document.getElementById('inputAdvertiser').value.trim().toLowerCase();
      return (r) => {
        if (r.bonbuRevenueStatus !== '본부매출') return false;
        if (revenueBasisMode === 'performance' && r.revenueBasis !== '실적') return false;
        if (!isAllDeptsSelected && !selectedDepts.includes(r.dept)) return false;
        if (!isAllChannelsSelected && !selectedChannels.includes(r.channel)) return false;
        if (!isAllBroadsSelected && !selectedBroads.includes(r.broadDigital)) return false;
        if (agencyTxt && !(r.agency.toLowerCase().includes(agencyTxt) || r.agencyGroup.toLowerCase().includes(agencyTxt))) return false;
        if (advTxt && !r.advertiser.toLowerCase().includes(advTxt)) return false;
        return eligibilityFn(r);
      };
    }

    function isNewAdvertiserMonth(advName, currentMonthStr) {
      const arr = advertiserActiveMonthIndex[advName];
      if (!arr || arr.length === 0) return true;
      const targetTime = new Date(currentMonthStr + '-01').getTime();
      const oneYearMs = 365 * 24 * 60 * 60 * 1000;
      for (let entry of arr) {
        if (entry.monthStr === currentMonthStr) continue;
        if (entry.time >= targetTime) break; // 정렬되어 있으므로 이후는 모두 targetTime 이후 → 더 볼 필요 없음
        if ((targetTime - entry.time) <= oneYearMs) return false;
      }
      return true;
    }

    function setTrendChartMode(mode) { trendChartMode = mode; document.getElementById('btnMonthlyActual').classList.toggle('active', mode === 'monthly'); document.getElementById('btnCumulativeActual').classList.toggle('active', mode === 'cumulative'); renderTrendChart(); }
    function setPortfolioMode(mode) { portfolioMode = mode; document.getElementById('btnPortfolioCat').classList.toggle('active', mode === 'categoryReclassified'); document.getElementById('btnPortfolioBroad').classList.toggle('active', mode === 'broadDigital'); renderPortfolioChart(); }
    function setRankAgencyMode(mode) { rankAgencyMode = mode; document.getElementById('btnRankAgencySolo').classList.toggle('active', mode === 'agency'); document.getElementById('btnRankAgencyGroup').classList.toggle('active', mode === 'agencyGroup'); renderRankAgencyChart(); }
    function setDeptMode(mode) { deptMode = mode; document.getElementById('btnDeptCategory').classList.toggle('active', mode === 'categoryReclassified'); document.getElementById('btnDeptBroad').classList.toggle('active', mode === 'broadDigital'); renderDeptChart(); }
    function setManagerMode(mode) { managerMode = mode; document.getElementById('btnManagerCategory').classList.toggle('active', mode === 'categoryReclassified'); document.getElementById('btnManagerBroad').classList.toggle('active', mode === 'broadDigital'); renderManagerChart(); }

