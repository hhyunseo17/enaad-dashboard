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

    // 차트 **구조색**(축 눈금·범례·항목 라벨·그리드)의 다크→라이트 매핑.
    // 계열 채움색은 여기 없다 — categoryColors(5대분류), SERIES_PALETTE(서수),
    // SERIES_ROLES(목표·비교·전월대비)가 각각 테마별 값을 따로 갖는다.
    const CHART_COLOR_MAP = {
      '#21232A': '#E5E8EB', '#8B95A1': '#4E5968', '#B0B8C1': '#4E5968', '#F2F4F6': '#191F28',
    };
    function CH(hex) { return currentTheme === 'light' ? (CHART_COLOR_MAP[hex] || hex) : hex; }

    // ==========================================================================
    // 계열 역할색 — 5대분류가 아닌 차트(목표/실적, 대행사 비교, 전월대비)가 쓰는 색.
    //
    // CHART_COLOR_MAP과 달리 **테마별 값을 나란히 적는다.** 저 표는 다크 값을 키로 삼고
    // 라이트를 치환해 오는 구조라, 다크가 원본이고 라이트가 파생이 된다. 한쪽을 손보면
    // 다른 쪽이 따라 움직이고, 두 테마를 각자 최적으로 잡을 수가 없다.
    // 여기서는 역할에 이름을 주고 light/dark를 각각 적는다 — categoryColors와 같은 방식이다.
    //
    // 회색 두 단계가 이 표의 핵심이다. 'ref'(목표·전년동월·전월 기준선)와 'prev'는 한 차트
    // 안에서 나란히 서므로 **서로 벌어져 있어야** 하고, 동시에 ref는 배경에서도 보여야 한다.
    // 예전 값은 라이트에서 ref가 1.46이라 흰 종이였고, 그걸 올렸더니 이번엔 prev와 1.32로
    // 붙었다. 두 조건을 같이 만족하는 지점으로 다시 잡았다 — 라이트 2.01/3.81(사이 1.90),
    // 다크 2.42/6.66(사이 2.75). 다크는 위로 더 벌 수 있어 라이트와 같은 값을 쓰지 않는다.
    const SERIES_ROLES = {
      // 두 축을 지킨다.
      //
      // (1) **색상은 대시보드에 이미 있는 것만 쓴다** — 파랑 211° · 빨강 3° · 초록 135° ·
      //     주황 35° · 무채. 한때 신규/증액을 청록(163°)과 연두(118°)로 갈라 봤는데,
      //     화면 어디에도 없는 색상이 둘 늘어나 그 차트만 따로 노는 것처럼 보였다.
      //     같은 초록 안에서 명도로 가르는 편이 화면 전체와 맞는다.
      //
      // (2) **명도대를 5대분류에 맞춘다.** 5대분류는 라이트 L63~73, 다크 L50~61에 모여 있다.
      //     대비 목표만 보고 값을 잡았더니 이 역할색들이 L30~72로 흩어졌고(특히 MoM 신규가
      //     L30), 화면의 나머지보다 훨씬 무겁고 탁해 보였다. 배경 대비가 다소 낮아지더라도
      //     같은 대역에 두는 쪽을 택한다 — 이 대시보드는 선명함이 우선이다.
      //
      // 라이트와 다크는 **서로 파생 관계가 아니다.** 각 테마의 카드면에 대고 따로 풀었고,
      // 한쪽을 고쳐도 다른 쪽이 따라 움직이지 않는다.
      //
      // 참조 회색만 대역 밖(라이트 L81)에 둔다. 물러나 있는 것이 역할이기 때문이고, 대신
      // 바로 옆에 서는 전월 회색과는 벌어져 있어야 한다(라이트 1.99 / 다크 2.37).
      ref:       { light: '#CACED3', dark: '#586069' },  // 목표 · 전년동월 · MoM 전월
      prev:      { light: '#89929F', dark: '#949DA8' },  // 대행사 전월
      curr:      { light: '#47A0FF', dark: '#2E91FA' },  // 대행사 당월
      line:      { light: '#FFA629', dark: '#FFB347' },  // 구간별 분포 합산 매출액 선
      // 그 선의 데이터라벨. 선과 같은 색을 쓰면 안 된다 — 라벨이 막대 위로 얹히는 자리가 있어
      // 흰 카드에서 1.96이어도 막대 위에서는 1.2까지 떨어진다. 어둡게만 해도 막대 위에서는
      // 1.7에 그치므로(배경이 흰색이 아니다), 라벨 뒤에 카드색 칩을 깔아 배경을 카드로 고정하고
      // 글자는 카드 대비만 맞춘다. 텍스트는 면적이 작아 어둡게 해도 갈색으로 읽히지 않는다 —
      // 넓은 면인 선을 어둡게 못 하는 것과 다른 조건이다.
      lineLabel: { light: '#B35C00', dark: '#FFB347' },
      // 전월대비 발산형 램프(신규 → 증액 → 유지 → 감액 → 중지).
      // 초록 두 단계는 같은 색상(135°)에서 명도로만 가른다. 서로 맞닿지 않고(사이에 전월
      // 회색 막대가 있다) 둘 다 '증가' 쪽이라 같은 계열로 읽히는 것이 맞다.
      momNew:    { light: '#33CC59', dark: '#2BAB4B' },
      momUp:     { light: '#87E39E', dark: '#73DE8D' },
      momFlat:   { light: '#969DA6', dark: '#9298A0' },
      momDown:   { light: '#FFB347', dark: '#FAA938' },
      momStop:   { light: '#FF7C75', dark: '#FF645C' }
    };
    function RC(role) {
      const r = SERIES_ROLES[role];
      return r ? r[currentTheme === 'light' ? 'light' : 'dark'] : '#8B95A1';
    }

    Chart.register(ChartDataLabels);

    // 범례와 플롯 영역 사이 여백.
    // Chart.js에는 '범례 아래 여백' 옵션이 없다(labels.padding은 항목 사이 간격이다).
    // 범례 박스의 fit()이 계산한 높이에 여백을 더하는 것이 표준 해법이다.
    // 이게 없으면 가장 높은 막대의 데이터라벨이 범례에 달라붙는다.
    Chart.register({
      id: 'ddLegendSpacing',
      beforeInit(chart) {
        const legend = chart.legend;
        if (!legend) return;
        const originalFit = legend.fit;
        legend.fit = function () { originalFit.call(this); this.height += 20; };
      }
    });
    Chart.defaults.set('plugins.datalabels', { display: false });
    function dataLabelTextColor() { return currentTheme === 'light' ? '#191F28' : '#F2F4F6'; }

    // 차트 채움용 톤 조정 — **채도는 그대로 두고 명도만 올린다.**
    //
    // HIG 시스템 컬러는 버튼·아이콘 같은 '작은 강조'를 전제로 만든 값이라, 그대로 차트에 쓰면
    // 화면의 30~40%가 만채도로 덮여 눈이 피로하다.
    //
    // 흰색을 섞으면(tint) 채도까지 같이 떨어져 탁해진다. 실제로 편하게 읽히는 톤을 뜯어보면
    // 채도는 그대로이고 명도만 높다 — 예: #007AFF(S100 L50) → #4795FF(S100 L64).
    // 그래서 HSL에서 L만 올린다. 색이 연해지는 게 아니라 밝아진다.
    function ddLift(hex, dL) {
      const h = String(hex).replace('#', '');
      const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
      let r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      let hue = 0, sat = 0; const lum = (max + min) / 2;
      if (max !== min) {
        const d = max - min;
        sat = lum > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0));
        else if (max === g) hue = (b - r) / d + 2;
        else hue = (r - g) / d + 4;
        hue /= 6;
      }
      const L = Math.min(0.92, lum + dL);
      const hk = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p; };
      let R, G, B;
      if (sat === 0) { R = G = B = L; }
      else {
        const q = L < 0.5 ? L * (1 + sat) : L + sat - L * sat, pp = 2 * L - q;
        R = hk(pp, q, hue + 1/3); G = hk(pp, q, hue); B = hk(pp, q, hue - 1/3);
      }
      // **hex로 돌려줘야 한다.** ddMixHex/ddHexAlpha가 hex만 파싱하므로 rgb() 문자열을 주면
      // parseInt가 NaN을 내고 막대가 검게 칠해진다.
      const to = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
      return `#${to(R)}${to(G)}${to(B)}`.toUpperCase();
    }
    // 라이트에서만 적용한다. 어두운 배경은 색을 흡수해 같은 채도라도 덜 부담스럽고,
    // 오히려 명도를 올리면 더 튄다.
    //
    function ddSoften(hex) {
      return currentTheme === 'light' ? ddLift(hex, 0.14) : hex;
    }

    // 5대분류가 아닌 계열(방송/디지털, 채널, 포트폴리오 '기타' 모드 등)에 쓰는 서수 팔레트.
    // 예전에는 Tailwind 10색이라 화면 안에서 혼자 다른 팔레트였다. HIG 시스템 컬러로 통일하고,
    // 계열색과 마찬가지로 테마별 변형을 쓴다.
    const SERIES_PALETTE_LIGHT = ['#007AFF','#FF9500','#34C759','#9450D8','#30B0C7','#FF2D55','#5856D6','#FFCC00','#A2845E','#8E8E93'];
    const SERIES_PALETTE_DARK  = ['#0A84FF','#FF9F0A','#30D158','#A970E8','#40C8E0','#FF375F','#5E5CE6','#FFD60A','#AC8E68','#98989D'];
    function seriesColor(i) {
      const pal = currentTheme === 'light' ? SERIES_PALETTE_LIGHT : SERIES_PALETTE_DARK;
      return ddSoften(pal[i % pal.length]);
    }

    // 5대분류 계열색을 현재 테마에 맞춰 돌려준다. 색상(hue)은 두 테마 동일, 명도만 다르다.
    function catColor(name) {
      const hex = (currentTheme === 'light' ? categoryColorsLight : categoryColorsDark)[name];
      return hex && ddSoften(hex);
    }

    // 값축 그리드 — 아주 흐리게. 막대마다 합계 라벨이 이미 붙어 있어 촘촘한 눈금은 대부분 중복이고,
    // 줄이 많을수록 정작 읽어야 할 숫자가 뒤로 밀린다. 눈금 개수도 5개로 제한한다(기본은 8~11개).
    function ddGridColor() {
      return currentTheme === 'light' ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.07)';
    }
    // 값축 공통 설정 — grid/눈금개수/축선을 한 곳에서 정한다.
    function ddValueAxis(extra) {
      return Object.assign({
        grace: '15%',
        ticks: { color: CH('#8B95A1'), maxTicksLimit: 5, padding: 6 },
        border: { display: false },
        grid: { color: ddGridColor(), drawTicks: false }
      }, extra || {});
    }

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
        // 그라데이션도 명도로만 만든다. 검정/흰색을 섞으면 채도가 떨어져 탁해진다(ddLift 주석 참고).
        // 밑동이 진하고 끝으로 갈수록 밝아진다 — 반대로 하면 스택 맨 아래에 오는 계열
        // (보통 비중이 가장 큰 일반광고)이 항상 제일 물빠져 보인다.
        const base = currentTheme === 'light' ? ddLift(hex, -0.10) : ddLift(hex, 0.12);
        const tip  = currentTheme === 'light' ? ddLift(hex,  0.08) : ddLift(hex, -0.04);

        // **각 세그먼트 자기 구간을 기준으로** 그린다.
        // 차트 영역 전체를 기준으로 잡으면(특히 대각선) 세그먼트 하나가 그 띠의 아주 얇은 구간만
        // 지나가 사실상 단색이 된다. 목표/실적 차트는 단일 계열이라 '막대 사이' 변화로 읽혀서
        // 같은 방식이 통했지만, 스택에서는 층마다 자기 안에서 흘러야 눈에 보인다.
        //
        // 요소(el.base/el.y)를 읽으면 안 된다 — backgroundColor는 요소 좌표가 계산되기 전
        // (_getSharedOptions) 단계에서 평가되어 NaN이 들어온다. 스케일에서 직접 구간을 구한다.
        const meta = chart.getDatasetMeta(ctx.datasetIndex);
        const scale = meta && chart.scales[horizontal ? meta.xAxisID : meta.yAxisID];
        if (!scale) return hex;
        let below = 0;
        for (let d = 0; d < ctx.datasetIndex; d++) {
          const pv = chart.data.datasets[d].data[ctx.dataIndex];
          if (typeof pv === 'number' && isFinite(pv)) below += pv;
        }
        const val = chart.data.datasets[ctx.datasetIndex].data[ctx.dataIndex];
        if (typeof val !== 'number' || !isFinite(val) || val === 0) return hex;
        const pStart = scale.getPixelForValue(below);
        const pEnd = scale.getPixelForValue(below + val);
        if (!isFinite(pStart) || !isFinite(pEnd) || Math.abs(pEnd - pStart) < 1) return hex;
        const g = horizontal
          ? chart.ctx.createLinearGradient(pStart, 0, pEnd, 0)
          : chart.ctx.createLinearGradient(0, pStart, 0, pEnd);
        g.addColorStop(0, base);
        g.addColorStop(1, tip);
        return g;
      };
    }

    // 스택 세그먼트 구분선 — 도넛과 같은 방식(카드 배경색 테두리)을 막대에도 쓴다.
    // 차트 종류가 달라도 '겹쳐 쌓인 층'은 같은 언어로 표현되어야 한다. 도넛만 갈라져 있고
    // 스택 막대는 붙어 있으면 같은 구조가 다르게 읽힌다.
    // 세로 스택은 위쪽 모서리, 가로 스택은 오른쪽 모서리에만 준다 — 층이 맞닿는 면이 거기다.
    function ddStackSeparator(horizontal) {
      return {
        borderColor: ddSurfaceColor(),
        borderWidth: horizontal ? { right: 0.3 } : { top: 0.3 }
      };
    }

    // 그룹 막대(목표/실적, 전월/당월 등) 사이 간격 — 스택·도넛과 같은 0.3px로 맞춘다.
    // 스택은 맞닿는 면이 하나(위 또는 오른쪽)지만 그룹은 좌우로 붙으므로 양쪽에 절반씩 준다.
    function ddGroupSeparator() {
      return {
        borderColor: ddSurfaceColor(),
        borderWidth: { left: 0.15, right: 0.15 }
      };
    }

    // 도넛 원호 채움 — 링 안쪽에서 바깥으로 흐른다.
    // 원호에 선형 그라데이션을 걸면 조각 위치마다 밝기가 달라져 같은 계열이 다른 색으로 보인다.
    // 방사형으로 하면 모든 조각이 '안쪽 진함 → 바깥 밝음'이라는 같은 규칙을 따르므로
    // 계열 구분은 유지되면서 막대와 같은 결의 입체감만 생긴다.
    // 요소 좌표는 옵션 해석 시점에 없으므로 차트 영역에서 중심·반지름을 구한다.
    function ddArcFill(hex) {
      return (ctx) => {
        const chart = ctx.chart, area = chart.chartArea;
        if (!area) return hex;
        const cx = (area.left + area.right) / 2, cy = (area.top + area.bottom) / 2;
        const outer = Math.min(area.right - area.left, area.bottom - area.top) / 2;
        const cut = parseFloat(String(chart.options.cutout || '0')) / 100;
        const inner = outer * (isFinite(cut) && cut > 0 ? cut : 0.6);
        if (!isFinite(outer) || outer <= 0 || outer - inner < 1) return hex;
        const base = currentTheme === 'light' ? ddLift(hex, -0.10) : ddLift(hex, 0.12);
        const tip  = currentTheme === 'light' ? ddLift(hex,  0.08) : ddLift(hex, -0.04);
        const g = chart.ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
        g.addColorStop(0, base);
        g.addColorStop(1, tip);
        return g;
      };
    }

    // 장식용 대각 그라데이션이 쓰는 색 짝.
    //
    // 예전에는 호출부가 catColor('일반광고')와 catColor('IMC')를 넘겼다. 그런데 이 그라데이션은
    // 바로 아래 주석대로 '순수 장식'이라 5대분류와 아무 관계가 없다. 계열 팔레트를 읽을 이유가
    // 없었는데 읽고 있었고, 그래서 IMC를 빨강으로 옮기자 목표대비 실적 막대와 구간별 분포 막대가
    // 같이 파랑→빨강으로 바뀌었다. 계열색을 건드릴 때마다 무관한 차트가 따라 움직이는 연결이었다.
    //
    // 장식은 장식대로 값을 고정한다. 파랑에서 보라로 흐르는 이 짝이 원래 화면에 나오던 모습이다.
    // (ddSoften을 태우는 것도 예전과 같다 — catColor를 거치던 때와 동일한 결과가 나온다.)
    const DUO_FILL_LIGHT = ['#007AFF', '#9450D8'];
    const DUO_FILL_DARK  = ['#0A84FF', '#A970E8'];
    function ddDuoPair() {
      const p = currentTheme === 'light' ? DUO_FILL_LIGHT : DUO_FILL_DARK;
      return [ddSoften(p[0]), ddSoften(p[1])];
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
      btn.innerText = isHidden ? '▲ 상세조건' : '▼ 상세조건';
    }

    function toggleTheme() {
      currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', currentTheme);
      const btn = document.getElementById('themeToggleBtn');
      if (btn) btn.innerText = currentTheme === 'dark' ? '☀️ 라이트' : '🌙 다크';
      if (rawData.length > 0) switchView(currentView, false);
    }
