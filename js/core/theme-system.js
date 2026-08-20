// ============================================================
// js/core/theme-system.js
// 다크/라이트 테마 전환 + 차트/피벗 색상 매핑(CH, mapPivotHtml)
// 색상 토큰(CSS 변수)은 css/theme.css 참조
// ============================================================
    // 테마 결정 순서: 저장된 사용자 선택 → OS 설정 → 라이트(기본).
    //
    // 기본값을 라이트로 둔 이유: 이 대시보드는 화면 캡처가 보고서·PPT·인쇄로 나가고,
    // 대부분의 사용자는 테마를 바꿀 수 있다는 것 자체를 모른다. 즉 기본값이 곧 제품이다.
    // 다크는 그대로 유지한다 — 쓰던 사람이 불편해지면 안 된다. 한 번 바꾸면 기억된다.
    const THEME_STORAGE_KEY = 'enaad-theme';
    function resolveInitialTheme() {
      try {
        const saved = localStorage.getItem(THEME_STORAGE_KEY);
        if (saved === 'dark' || saved === 'light') return saved;
      } catch (e) { /* 프라이빗 모드 등에서 localStorage 접근이 막힐 수 있다 */ }
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
      // TODO(라이트 재구축 완료 시): 이 폴백을 'light'로 바꾸면 기본값 전환이 끝난다.
      // 라이트를 바닥부터 다시 쌓는 중이라, 완성 전까지는 기존 사용자가 미완성 화면을 보지 않도록 다크를 유지한다.
      return 'dark';
    }
    let currentTheme = resolveInitialTheme(); // 'dark' | 'light'
    document.documentElement.setAttribute('data-theme', currentTheme);

    // 차트(Chart.js) 구조색 다크→라이트 매핑. 팔레트(chartColors/categoryColors/momColors)는 두 테마 공통으로 그대로 사용.
    const CHART_COLOR_MAP = {
      '#21232A': '#E5E8EB', '#8B95A1': '#4E5968', '#B0B8C1': '#4E5968', '#F2F4F6': '#191F28',
      '#3A4258': '#D1D6DB', '#6B7280': '#8B95A1', '#60A5FA': '#0064FF', '#94A3B8': '#8B95A1',
      '#F87171': '#FF4040', '#FBBF24': '#FF9500',
      // MoM 발산형 램프(신규→중지)용. 라이트 배경에서는 채도를 낮추고 명도를 떨어뜨린다.
      '#4ADE80': '#00A85A', '#2FA97A': '#0E7A55', '#E08A5F': '#C25A28'
    };
    function CH(hex) { return currentTheme === 'light' ? (CHART_COLOR_MAP[hex] || hex) : hex; }
    Chart.register(ChartDataLabels);
    Chart.defaults.set('plugins.datalabels', { display: false });
    function dataLabelTextColor() { return currentTheme === 'light' ? '#191F28' : '#F2F4F6'; }

    // ==========================================================================
    // 차트 표면 질감 — 막대/영역에 아주 옅은 그라데이션을 입혀 깊이를 준다.
    //
    // 색상(hue)은 계열 정체성을 담고 있으므로 절대 섞지 않는다. 같은 색의 투명도만 흐르게 해서
    // 평평한 단색이 주는 '기본 차트' 느낌만 걷어내는 것이 목적이다.
    //
    // 스택 막대에서도 세그먼트 단위가 아니라 **차트 영역 전체**를 기준으로 그라데이션을 만든다.
    // 세그먼트마다 따로 그리면 층마다 띠가 생겨 오히려 지저분해진다. 영역 기준으로 하면
    // 스택 하나가 아래에서 위로 이어지는 하나의 흐름으로 읽힌다.
    // ==========================================================================
    function ddHexAlpha(hex, alpha) {
      const h = String(hex).replace('#', '');
      const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
      return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
    }

    // 차트가 올라앉는 카드 표면색. 도넛 세그먼트를 배경색 테두리로 갈라놓을 때 쓴다.
    // CSS 토큰을 단일 진실 공급원으로 두고 JS는 읽기만 한다(테마 전환 시 차트가 재생성되므로 매번 최신값).
    function ddSurfaceColor() {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--bg-elevated').trim();
      return v || (currentTheme === 'light' ? '#FFFFFF' : '#171C26');
    }

    // 두 색을 t 비율로 섞는다(0=a, 1=b).
    function ddMixHex(a, b, t) {
      const p = (h) => { const s = String(h).replace('#',''); const n = parseInt(s.length===3 ? s.split('').map(c=>c+c).join('') : s, 16);
        return [(n>>16)&255, (n>>8)&255, n&255]; };
      const [r1,g1,b1] = p(a), [r2,g2,b2] = p(b);
      const m = (x,y) => Math.round(x + (y - x) * t);
      return `rgb(${m(r1,r2)}, ${m(g1,g2)}, ${m(b1,b2)})`;
    }

    // 막대 채움 — 밑동이 밝고 끝으로 갈수록 원래 색으로 돌아온다.
    //
    // **알파로 그라데이션을 만들면 안 된다.** 반투명 색은 배경과 섞이면서 채도가 떨어져
    // 색 전체가 탁해 보인다(어두운 배경에서 특히 심하다). 그래서 두 스톱 모두 불투명하게 두고
    // 명도만 움직인다. 다크에서는 밑동을 흰쪽으로, 라이트에서는 검은쪽으로 살짝 민다.
    //
    // 밑동을 강조하는 이유: 반대로 하면 스택 맨 아래에 오는 계열 — 보통 비중이 가장 큰
    // 일반광고 — 이 항상 제일 물빠져 보인다.
    // Chart.js는 레이아웃 전에도 backgroundColor를 한 번 평가하므로 chartArea가 없으면 단색으로 돌려준다.
    function ddBarFill(hex, horizontal) {
      return (ctx) => {
        const chart = ctx.chart, area = chart.chartArea;
        if (!area) return hex;
        const lit = currentTheme === 'light' ? ddMixHex(hex, '#000000', 0.10) : ddMixHex(hex, '#FFFFFF', 0.16);
        const g = horizontal
          ? chart.ctx.createLinearGradient(area.left, 0, area.right, 0)
          : chart.ctx.createLinearGradient(0, area.bottom, 0, area.top);
        g.addColorStop(0, lit);
        g.addColorStop(1, hex);
        return g;
      };
    }

    // 다색 대각 그라데이션 채움 — **단일 계열 차트에만 쓴다.**
    // 색이 계열(5대분류)을 뜻하는 차트에 쓰면 범례가 무의미해진다. 실적 막대나 광고주 수처럼
    // 계열이 하나뿐이라 색에 의미가 없는 곳에서는 순수 장식이므로 무해하고, 화면이 풍부해진다.
    function ddDuoFill(fromHex, toHex) {
      return (ctx) => {
        const chart = ctx.chart, area = chart.chartArea;
        if (!area) return fromHex;
        const g = chart.ctx.createLinearGradient(area.left, area.bottom, area.right, area.top);
        g.addColorStop(0, fromHex);
        g.addColorStop(1, toHex);
        return g;
      };
    }

    // 선 차트 아래 영역 채움 — 선 색에서 시작해 바닥으로 갈수록 사라진다.
    function ddAreaFill(hex) {
      return (ctx) => {
        const chart = ctx.chart, area = chart.chartArea;
        if (!area) return ddHexAlpha(hex, 0.14);
        const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
        g.addColorStop(0, ddHexAlpha(hex, 0.28));
        g.addColorStop(1, ddHexAlpha(hex, 0));
        return g;
      };
    }

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
