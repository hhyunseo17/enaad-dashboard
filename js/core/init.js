// ============================================================
// js/core/init.js
// 앱 부트스트랩 — 모든 모듈 로드 후 마지막에 실행
// ============================================================
    window.addEventListener('DOMContentLoaded', () => {
      setupEventListeners();
      initDataConnection();
      history.replaceState({ view: 'main' }, '', '');
      if (window.innerWidth <= 768) {
        const el = document.getElementById('filterBarCollapsible');
        const btn = document.getElementById('filterBarToggleBtn');
        if (el && btn) { el.style.display = 'none'; btn.innerText = '▼ 조회영역 펼치기'; }
      }
    });
