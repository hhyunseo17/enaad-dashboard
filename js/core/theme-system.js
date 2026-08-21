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
    // 이 표에는 성격이 다른 두 종류가 섞여 있다. 값을 고칠 때 반드시 구분해야 한다.
    //   (a) 구조색 — 축·범례·그리드 텍스트. 배경 대비 4.5:1 이상(텍스트 기준).
    //   (b) 채움색 — 막대·선·도넛에 실제로 칠해지는 색. 흰 배경 대비 3.0:1 이상.
    // 예전에는 (b)가 (a)와 같은 감각으로 옅게 잡혀 있어 라이트에서 막대가 지워졌다.
    // 특히 전년동월/목표 막대(#3A4258→#D1D6DB)는 1.46:1로 사실상 흰 종이였다.
    const CHART_COLOR_MAP = {
      // (a) 구조색 — 유지
      '#21232A': '#E5E8EB',   // 그리드 선
      '#8B95A1': '#4E5968',   // 값축 눈금
      '#B0B8C1': '#4E5968',   // 범례
      '#F2F4F6': '#191F28',   // 항목축 라벨

      // (b) 채움색 — 흰 배경 대비 하한을 지킨다.
      // 비교 막대 3종은 '당월 > 전월 > 전년동월' 순으로 앞에 나와야 한다. 다크에서는 명도로
      // 그 순서를 만들었지만(어두울수록 뒤로), 라이트에서는 방향이 뒤집힌다(밝을수록 뒤로).
      // 당월은 명도가 아니라 **색상(파랑)** 으로 앞에 나오므로 두 회색만 명도로 갈라 놓는다.
      '#3A4258': '#AEB3BC',   // 전년동월 · 목표 (가장 뒤. 1.46 → 2.11)
      '#6B7280': '#79838F',   // 전월       (3.04 → 3.85)
      '#60A5FA': '#0064FF',   // 당월       (4.92, 유지)
      '#94A3B8': '#79838F',   // MoM '유지' (3.04 → 3.85)
      '#F87171': '#D8362A',   // 감소 · 중지 (3.55 → 4.69)
      '#FBBF24': '#C77400',   // 경고       (2.20 → 3.54)
      '#FFB547': '#C77400',   // 채널 차트 합산 매출액 선. 표에 아예 없어 라이트에서
                              // #FFB547 그대로(1.85:1) 그려지던 누락 지점이다.

      // MoM 발산형 램프(신규→증액→유지→감액→중지).
      // "양 끝이 진하고 중간이 옅다"는 원래 의도는 유지하되, 옅은 쪽도 3.0:1 위에 둔다.
      // 예전 값은 증액 #34C759(2.22), 감액 #FF9500(2.20)으로 둘 다 하한 미달이었다.
      '#4ADE80': '#00752F',   // 신규 (3.66 → 5.86)
      '#2FA97A': '#2AA35A',   // 증액 (2.22 → 3.24)
      '#E08A5F': '#C4741F'    // 감액 (2.20 → 3.32)
    };
    function CH(hex) { return currentTheme === 'light' ? (CHART_COLOR_MAP[hex] || hex) : hex; }
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

    // 차트 채움용 톤 조정 — **채도는 그대로 두고 명도만 움직인다.**
    //
    // HIG 시스템 컬러는 버튼·아이콘 같은 '작은 강조'를 전제로 만든 값이라, 그대로 차트에 쓰면
    // 화면의 30~40%가 만채도로 덮여 눈이 피로하다.
    //
    // 흰색·검정을 섞으면(tint/shade) 채도까지 같이 떨어져 탁해진다. 실제로 편하게 읽히는 톤을
    // 뜯어보면 채도는 그대로이고 명도만 다르다 — 예: #007AFF(S100 L50) → #4795FF(S100 L64).
    // 어느 쪽으로 얼마나 움직일지는 ddToneLight가 배경 대비로부터 정한다(아래 참고).
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
      // 아래쪽 클램프가 필요하다. ddToneLight가 −0.45까지 내려보내는데, L이 음수가 되면
      // hk()가 범위 밖 값을 돌려주고 결과가 깨진 hex가 된다.
      const L = Math.max(0, Math.min(0.92, lum + dL));
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
    // ==========================================================================
    // 라이트 톤 보정 — **일률적인 명도 가산은 흰 배경에서 성립하지 않는다.**
    //
    // 예전에는 라이트에서 모든 계열색에 ddLift(hex, +0.14)를 걸었다. 어두운 배경 기준으로는
    // 맞는 발상이지만(색을 흡수하므로 그대로 두고, 밝은 배경에서는 부드럽게), 흰 배경에서
    // 밝히는 것은 곧 대비를 깎는 것이다. 실측 결과 다섯 계열색이 전부 3.0:1 미만이었다.
    //   일반광고 2.74 / IMC 2.69 / 인포머셜 1.78 / 큐톤광고 1.78 / 기타광고 2.09
    // 같은 색들이 다크에서는 4.7~8.4였다. 즉 라이트 차트가 다크의 1/2~1/5 대비로 그려졌다.
    //
    // 더 결정적인 것은 **필요한 보정 방향이 색상(hue)마다 반대**라는 점이다. 흰 배경에서
    // 3.5:1을 맞추려면 파랑은 +0.05까지만 올릴 수 있고, 초록·주황은 −0.11로 내려야 한다.
    // HIG System Green/Orange는 작은 아이콘·토글용으로 검증된 값이지 화면의 30~40%를 덮는
    // 색면용이 아니다. 그래서 고정 ΔL 대신 **대비 목표**를 주고 명도를 그 지점까지만 움직인다.
    //
    // 여전히 "채도는 두고 명도만" 원칙(ddLift 주석 참고)을 지킨다. 달라진 것은 이동량을
    // 상수로 박지 않고 배경 대비로부터 역산한다는 점뿐이다.
    // ==========================================================================
    const LIGHT_SURFACE = '#FFFFFF';   // 라이트에서 차트가 올라앉는 카드 표면(--bg-elevated)
    const LIGHT_FILL_MIN_CR = 3.5;     // 색면 본체 (WCAG 그래픽 요소 하한 3.0에 여유 추가)
    const LIGHT_FILL_TIP_MIN_CR = 3.0; // 그라데이션의 밝은 끝 — 여기까지 하한을 지킨다

    function ddRelLum(hex) {
      const h = String(hex).replace('#', '');
      const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
    }
    function ddContrast(a, b) {
      const l1 = ddRelLum(a), l2 = ddRelLum(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }

    // 흰 표면 대비 minCR을 만족하는 **가장 밝은** 색을 돌려준다.
    // +0.14에서 출발해 내려오므로, 여유가 있는 색(파랑·보라)은 예전처럼 부드럽게 뜨고
    // 여유가 없는 색(초록·주황)은 필요한 만큼만 눌린다. 렌더 루프에서 반복 호출되므로 캐시한다.
    const _toneCache = new Map();
    function ddToneLight(hex, minCR) {
      const key = hex + '|' + minCR;
      if (_toneCache.has(key)) return _toneCache.get(key);
      let out = ddLift(hex, -0.45);
      for (let d = 0.14; d >= -0.45; d -= 0.005) {
        const c = ddLift(hex, d);
        if (ddContrast(c, LIGHT_SURFACE) >= minCR) { out = c; break; }
      }
      _toneCache.set(key, out);
      return out;
    }

    // 다크는 손대지 않는다 — 어두운 배경은 원색을 그대로 받아준다(실측 4.7~8.4:1).
    function ddSoften(hex) {
      return currentTheme === 'light' ? ddToneLight(hex, LIGHT_FILL_MIN_CR) : hex;
    }

    // 막대·도넛 그라데이션의 양 끝(밑동/끝). ddBarFill과 ddArcFill이 같은 값을 써야 하므로
    // 한 곳에서 정한다 — 막대만 갈라지고 도넛은 안 갈라지면 같은 구조가 다르게 읽힌다.
    //
    // 라이트의 밝은 끝은 **그냥 올리면 안 된다.** ddSoften이 본체를 3.5:1에 맞춰 놔도
    // 거기서 +0.08을 더 올리면 끝단이 2.17:1까지 떨어져 스택 상단 세그먼트가 지워진다.
    // 그래서 끝단도 ddToneLight로 하한(3.0:1)을 걸어, 여유가 있는 색에서만 실제로 밝아진다.
    function ddFillStops(hex) {
      if (currentTheme === 'light') {
        const base = ddLift(hex, -0.10);
        let tip = ddToneLight(ddLift(hex, 0.08), LIGHT_FILL_TIP_MIN_CR);
        // 하한 클램프가 밑동보다 어두운 끝을 만들면 "밑동이 진하고 끝이 밝다"는 규칙이 뒤집힌다.
        // 본체가 애초에 하한 근처인 색 — 전년동월·목표 같은 옅은 참조 막대 — 에서만 일어난다.
        // 그때는 끝을 본체 색 그대로 두어 방향은 지키고 폭만 좁힌다.
        if (ddRelLum(tip) < ddRelLum(base)) tip = hex;
        return [base, tip];
      }
      return [ddLift(hex, 0.12), ddLift(hex, -0.04)];
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
        const [base, tip] = ddFillStops(hex);

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
        const [base, tip] = ddFillStops(hex);
        const g = chart.ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
        g.addColorStop(0, base);
        g.addColorStop(1, tip);
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
      // 깊이별 배경 (1 → 5).
      // 예전 램프(#ECEFF3→#FFFFFF)는 상대휘도 86.0→100에 5단을 욱여넣어 양 끝 대비가 1.153에
      // 그쳤다. 같은 램프의 다크가 1.340이었으니 라이트 계층 폭이 43%밖에 안 됐고, 실제로는
      // 깊이 3·4·5(#F7F9FA/#FBFCFD/#FFFFFF)가 눈으로 구분되지 않았다.
      // 시작점을 74.9로 내려 폭을 1.313까지 벌린다 — 다크와 사실상 같은 계층 강도가 된다.
      // 깊이 1이 페이지 바탕(#ECEDF1, 84.8)보다 진해지는 것은 의도한 것이다. 최상위 그룹 행이
      // 표 안에서 가장 앞에 나와야 하고, 표는 흰 카드 위에 놓이므로 바탕과 경쟁하지 않는다.
      '#1E293B': '#DCE1E9', '#151C2C': '#E6EAF0', '#11151F': '#EFF2F6',
      '#0D1117': '#F7F9FB', '#090C10': '#FFFFFF',
      // 채널·광고주·대행사 피벗의 중간 톤 배경 — 다크에서 깊이 2~3 사이에 놓인 값들이다.
      '#172033': '#E6EAF0', '#1A2234': '#E6EAF0', '#141824': '#EFF2F6',
      // 깊이별 텍스트 (1 → 5) — 배경 램프와 짝을 이뤄 계층을 이중으로 표현.
      // 새 배경 위에서 13.5 / 12.2 / 9.2 / 7.2 / 6.0 — 전 단계 AA 상회.
      '#F8FAFC': '#111827', '#CBD5E1': '#1F2937', '#94A3B8': '#374151',
      '#64748B': '#4B5563', '#475569': '#5B6470',
      // 헤더 / 총합계 / 강조
      '#1D4ED8': '#0050D9', '#1E3A8A': '#E8F2FF', '#1E40AF': '#0064FF',
      '#60A5FA': '#0064FF', '#93C5FD': '#0064FF', '#C4B5FD': '#7B61FF',
      // 증감 표시 — 셀 텍스트다. 예전 #FF4040(3.68)·#FF9500(2.20)은 숫자 옆 작은 글씨로는
      // 약했다. 차트 채움과 같은 계열로 맞추되 텍스트라 한 단계 더 진하게 둔다.
      '#4ADE80': '#00752F', '#F87171': '#C62828', '#FFB547': '#B36600',
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
