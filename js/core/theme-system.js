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

    // ==========================================================================
    // 차트 애니메이션 길이 — 같은 애니메이션이 두 가지 역할을 해서 길이를 나눈다.
    //  · 최초 진입/화면 전환: 연출. 길게 가도 기다린다는 느낌이 없다.
    //  · 필터 변경: "값이 바뀌었다"는 신호만 필요하다. 여기서 1초를 쓰면 연출이 아니라
    //    지연으로 읽힌다(누른 사람은 이미 무엇을 볼지 알고 눌렀기 때문).
    // 차트 12종을 각각 고치는 대신 렌더 직전에 Chart.defaults를 한 번 바꾼다.
    // (모든 차트가 destroy 후 new Chart로 재생성되므로 생성 시점의 default를 그대로 집어간다.)
    //
    // 참고: 지금은 매 렌더가 destroy+재생성이라 막대가 항상 0에서 자란다. 그래서 "무엇이
    // 어떻게 바뀌었는지"까지는 못 알린다. 데이터셋 구조가 그대로일 때 chart.update()로
    // 전환하면 이전 값에서 새 값으로 이동해 변화가 훨씬 잘 읽힌다 — 차트 공통 설정 정리 시 검토.
    const CHART_ANIM_ENTRY_MS = 1000;    // 최초 진입 · 화면 전환
    const CHART_ANIM_REFILTER_MS = 300;  // 필터/토글 변경
    let chartAnimIsViewEntry = false;
    function prefersReducedMotion() {
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    function setChartAnimForViewEntry(isEntry) { chartAnimIsViewEntry = isEntry; }
    function applyChartAnimDuration() {
      const ms = prefersReducedMotion() ? 0
        : (chartAnimIsViewEntry ? CHART_ANIM_ENTRY_MS : CHART_ANIM_REFILTER_MS);
      Chart.defaults.set('animation', { duration: ms });
    }

    // 피벗 테이블 HTML 문자열 내 다크 전용 색상을 라이트 등가색으로 일괄 치환
    //
    // 행 깊이 램프는 "표면에서 멀어질수록 배경이 페이지 바닥에서 멀어진다"는 규칙을 두 테마에서
    // 같은 방향으로 유지한다 — 다크는 깊어질수록 어두워지고, 라이트는 깊어질수록 밝아진다.
    // (과거에는 깊이 3·4·5 배경이 모두 #FFFFFF로, 텍스트 #CBD5E1·#F8FAFC가 모두 #191F28로
    //  접혀서 라이트 모드에서 트리 계층이 통째로 사라졌다.)
    const PIVOT_COLOR_MAP = {
      // 깊이별 배경 (1 → 5)
      '#1E293B': '#ECEFF3', '#151C2C': '#F2F4F7', '#11151F': '#F7F9FA',
      '#0D1117': '#FBFCFD', '#090C10': '#FFFFFF',
      // 채널·광고주·대행사 피벗의 중간 톤 배경
      '#172033': '#F2F4F7', '#1A2234': '#F2F4F7', '#141824': '#F7F9FA',
      // 깊이별 텍스트 (1 → 5) — 배경 램프와 짝을 이뤄 계층을 이중으로 표현
      '#F8FAFC': '#111827', '#CBD5E1': '#1F2937', '#94A3B8': '#374151',
      '#64748B': '#4B5563', '#475569': '#5B6470',
      // 헤더 / 총합계 / 강조
      '#1D4ED8': '#0050D9', '#1E3A8A': '#E8F2FF', '#1E40AF': '#0064FF',
      '#60A5FA': '#0064FF', '#93C5FD': '#0064FF', '#C4B5FD': '#7B61FF',
      // 증감 표시
      '#4ADE80': '#00A85A', '#F87171': '#FF4040', '#FFB547': '#FF9500',
      // 연 요약·총합계 열의 반투명 틴트. hex가 아니라 rgba로 적혀 있어 그동안 치환에서
      // 누락되었고, 라이트 모드에서 영구히 다크 네이비로 남던 지점이다.
      // (불투명 hex로 바꾸면 다크 모드의 10% 틴트가 짙은 네이비가 되므로 rgba 그대로 매핑한다.)
      'rgba(30,58,138,0.1)': 'rgba(0,100,255,0.06)',
      'rgba(30,64,175,0.2)': 'rgba(0,100,255,0.10)'
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
