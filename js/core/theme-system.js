// ============================================================
// js/core/theme-system.js
// 다크/라이트 테마 전환 + 차트/피벗 색상 매핑(CH, mapPivotHtml)
// 색상 토큰(CSS 변수)은 css/theme.css 참조
// ============================================================
    let currentTheme = 'dark'; // 'dark' | 'light'

    // 차트(Chart.js) 구조색 다크→라이트 매핑. 팔레트(chartColors/categoryColors/momColors)는 두 테마 공통으로 그대로 사용.
    const CHART_COLOR_MAP = {
      '#21232A': '#E5E8EB', '#8B95A1': '#4E5968', '#B0B8C1': '#4E5968', '#F2F4F6': '#191F28',
      '#3A4258': '#D1D6DB', '#6B7280': '#8B95A1', '#60A5FA': '#0064FF', '#94A3B8': '#8B95A1',
      '#F87171': '#FF4040', '#FBBF24': '#FF9500'
    };
    function CH(hex) { return currentTheme === 'light' ? (CHART_COLOR_MAP[hex] || hex) : hex; }
    Chart.register(ChartDataLabels);
    Chart.defaults.set('plugins.datalabels', { display: false });
    function dataLabelTextColor() { return currentTheme === 'light' ? '#191F28' : '#F2F4F6'; }

    // 피벗 테이블 HTML 문자열 내 다크 전용 색상을 라이트 등가색으로 일괄 치환
    const PIVOT_COLOR_MAP = {
      '#090C10': '#FFFFFF', '#0D1117': '#FFFFFF', '#11151F': '#FFFFFF', '#141824': '#FFFFFF',
      '#151C2C': '#F9FAFB', '#172033': '#F2F4F6', '#1A2234': '#F2F4F6', '#1D4ED8': '#0050D9',
      '#1E293B': '#F2F4F6', '#1E3A8A': '#E8F2FF', '#1E40AF': '#0064FF', '#475569': '#4E5968',
      '#4ADE80': '#00A85A', '#60A5FA': '#0064FF', '#64748B': '#4E5968', '#93C5FD': '#0064FF',
      '#94A3B8': '#4E5968', '#C4B5FD': '#7B61FF', '#CBD5E1': '#191F28', '#F87171': '#FF4040',
      '#F8FAFC': '#191F28', '#FFB547': '#FF9500'
    };
    function mapPivotHtml(html) {
      if (currentTheme !== 'light') return html;
      let out = html;
      Object.keys(PIVOT_COLOR_MAP).forEach(k => { out = out.split(k).join(PIVOT_COLOR_MAP[k]); });
      return out;
    }

    function toggleFilterBar() {
      const el = document.getElementById('filterBarCollapsible');
      const btn = document.getElementById('filterBarToggleBtn');
      const isHidden = el.style.display === 'none';
      el.style.display = isHidden ? '' : 'none';
      btn.innerText = isHidden ? '▲ 조회영역 접기' : '▼ 조회영역 펼치기';
    }

    function toggleTheme() {
      currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', currentTheme);
      const btn = document.getElementById('themeToggleBtn');
      if (btn) btn.innerText = currentTheme === 'dark' ? '☀️ 라이트' : '🌙 다크';
      if (rawData.length > 0) switchView(currentView, false);
    }
