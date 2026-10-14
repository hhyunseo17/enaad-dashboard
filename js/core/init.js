// ============================================================
// js/core/init.js
// 앱 부트스트랩 — 모든 모듈 로드 후 마지막에 실행
// ============================================================
    window.addEventListener('DOMContentLoaded', async () => {
      await ensureAuthenticated();
      setupEventListeners();
      setupProgramAdEventListeners(); // 프로그램별 광고매출 탭 — 데이터는 탭을 처음 열 때 지연 로딩
      if (salesAccessAllowed) {
        initDataConnection();
      } else {
        // 매출 권한이 없으면(예: programAd 전용 계정) /api/sales 등이 전부 403이라 매출 데이터 적재 자체를
        // 하지 않는다. 로딩 오버레이를 걷고 허용된 첫 탭으로 직접 들어간다(view-router.js).
        showLoading(false);
        enterInitialViewWithoutSales();
      }
      // url에 빈 문자열 = 현재 URL 유지. 해시가 붙어 들어온 경우 그 값을 state에도 실어 둔다
      // (실제 화면 전환은 데이터 적재가 끝난 뒤 finalizeLoadedData가 restoreViewFromHash로 한다).
      history.replaceState({ view: viewKeyFromHash() }, '', '');
      if (window.innerWidth <= 768) {
        const el = document.getElementById('filterBarCollapsible');
        const btn = document.getElementById('filterBarToggleBtn');
        if (el && btn) { el.style.display = 'none'; btn.innerText = '▼ 조회영역 펼치기'; }
      }
    });
