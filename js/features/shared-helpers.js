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

