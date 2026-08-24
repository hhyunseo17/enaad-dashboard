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

    // 차트 **구조색**(축 눈금·범례·항목 라벨·그리드).
    // 계열 채움색은 여기 없다 — categoryColors(5대분류), SERIES_PALETTE(서수),
    // SERIES_ROLES(목표·비교·전월대비)가 각각 테마별 값을 갖는다.
    //
    // 예전에는 다크 값을 키로 삼고 라이트만 치환해 오는 표였다. 그러면 다크가 원본, 라이트가
    // 파생이 되어 다크 값을 바꾸려면 호출부 리터럴을 전부 찾아 고쳐야 했다(실제로 참조 막대를
    // 고칠 때 그랬다). 키는 그대로 두되 **두 테마 값을 나란히** 적는다 — 호출부는 그대로이고,
    // 이제 어느 쪽이든 이 표 한 곳에서 고칠 수 있다.
    const CHART_COLOR_MAP = {
      '#21232A': { light: '#E5E8EB', dark: '#21232A' },  // 그리드 선
      '#8B95A1': { light: '#4E5968', dark: '#8B95A1' },  // 값축 눈금
      '#B0B8C1': { light: '#4E5968', dark: '#B0B8C1' },  // 범례
      '#F2F4F6': { light: '#191F28', dark: '#F2F4F6' }   // 항목축 라벨
    };
    function CH(hex) {
      const r = CHART_COLOR_MAP[hex];
      return r ? r[currentTheme === 'light' ? 'light' : 'dark'] : hex;
    }

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
      // 참조 회색은 라이트에서만 대역 밖(L81)에 둔다. 밝은 카드에서는 더 밝아지는 것이 곧
      // 물러나는 것이기 때문이다.
      // **다크에서는 같은 논리를 뒤집어 적용하지 않는다.** 한때 다크 참조를 L38까지 내렸는데,
      // 그건 라이트의 거울상일 뿐이고 화면에서는 막대가 카드에 뚫린 구멍처럼 보였다. 다크에서
      // 물러남은 '어두워지는 것'이 아니라 '옆 회색보다 덜 밝은 것'으로 충분하다.
      // **다크 값은 렌더된 밝기를 기준으로 잡아야 한다.** ddBarFill이 밑동을 +0.12 밝히므로
      // 여기 적힌 단색은 화면에 나오는 밝기가 아니다. 이걸 놓치고 단색만 보고 올렸더니
      // 회색 막대가 데이터 막대보다 밝아져 참조가 주인공이 돼버렸다(전월 11.11 > 당월 7.49).
      // 밑동 기준으로 참조 8.76 · 전월 12.25 · 참조↔전월 1.40.
      // 다크 회색은 검정 쪽이 아니라 흰색 쪽에 둔다 — 어두운 카드에서 어두운 회색은 배경에
      // 녹아 막대가 아니라 구멍처럼 보인다. 밝은 회색이라도 채도가 낮으므로 뒤로 물러난다.
      // 당월(6.02)보다 전월이 밝지만 문제되지 않는다 — 당월은 채도 100의 파랑이라 색으로
      // 앞에 서고, 회색은 밝아도 뒤로 물러난다. 위계를 밝기 하나에 맡지 않는 이유가 이것이다.
      //
      // **다크 회색에는 채도를 준다(s18~22).** 무채에 가까운 회색(s7~9)으로 두면 채도 60~100인
      // 데이터 색 옆에서 흐리멍텅해 보인다 — 밝기를 어떻게 조절해도 그 인상은 사라지지 않는다.
      // 밝기만 만지다 두 번 헛돌았다(너무 밝아 참조가 주인공이 되거나, 너무 어두워 안 보이거나).
      // 푸른 기를 준 회색으로 두면 편한 밝기에 두면서도 죽어 보이지 않고, 당월 파랑은
      // 채도(s95)로 앞에 선다 — 위계를 밝기 하나에만 맡기지 않는다.
      // 두 테마가 서로의 반전이 아니라는 뜻이다 — 물러나는 방식도, 기준으로 삼는 값도 다르다.
      ref:       { light: '#CACED3', dark: '#8B9CB1' },  // 목표 · 전년동월 · MoM 전월
      prev:      { light: '#89929F', dark: '#B1BAC6' },  // 대행사 전월
      curr:      { light: '#47A0FF', dark: '#0F83FF' },  // 당월 · 비교 차트의 주인공
      // 다크 값을 라이트보다 진하게 잡는 이유: ddBarFill이 다크에서 밑동을 +0.12 밝히는데,
      // 밝은 색은 그 지점에서 유효채도가 무너진다(같은 S여도 L이 높으면 옅게 보인다).
      // 예전 다크 당월 #2E91FA(l58)는 밑동이 l70이 되어 유효채도가 80 → 57로 떨어졌다.
      // 5대분류 다크가 l50~52에 정의된 것과 같은 이유다 — 밑동이 l62~64에 오도록 맞춘다.
      //
      // 구간별 분포 합산 매출액 선. 대비를 벌려 보려고 L58까지 내렸었는데 여전히 갈색기가
      // 남았다 — 주황은 대역(L62~71) 아래로 내려가는 순간 호박색·갈색으로 읽힌다.
      // 큐톤광고와 같은 L64에 둔다. 대비 1.78로 낮지만 선명하고, 이 선의 숫자는 아래
      // 데이터라벨이 카드색 칩 위에 따로 얹혀 읽히므로 선 자체가 진할 필요가 없다.
      line:      { light: '#FFB347', dark: '#FFA21F' },
      // 증감 표시 텍스트(대행사 비교의 감소율, MoM 요약줄). 채움이 아니라 글자라 별개다.
      negative:  { light: '#E03A2E', dark: '#FF645C' }
    };
    function RC(role) {
      const r = SERIES_ROLES[role];
      return r ? r[currentTheme === 'light' ? 'light' : 'dark'] : '#8B95A1';
    }

    Chart.register(ChartDataLabels);

    // **차트 글꼴은 본문과 따로 논다.** Chart.js는 캔버스에 직접 그리므로 body의 font-family를
    // 상속하지 않는다 — 지정하지 않으면 자체 기본값('Helvetica Neue')으로 그리고, 한글은
    // 시스템 폰트로 떨어진다. 즉 지금까지 축·범례·데이터라벨은 본문과 다른 글꼴이었다.
    // 본문 폰트 시범 적용과 한 세트로 여기서도 같은 값을 지정한다(layout.css의 body 참고).
    //
    // **차트 옵션에 family를 직접 적지 말 것.** 예전에는 features/*.js의 축·범례·데이터라벨
    // 40곳에 `font: { family: 'Pretendard', ... }`가 박혀 있었고, 그게 이 기본값을 덮었다.
    // 그래서 본문만 새 글꼴로 바뀌고 차트는 통째로 예전 글꼴로 남았다. 전부 지웠으니
    // 이제 글꼴은 이 한 줄로만 정해진다 — size와 weight만 각 차트에서 지정한다.
    Chart.defaults.font.family = "'IBM Plex Sans KR', 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif";

    // **웹폰트가 늦게 도착하면 캔버스는 스스로 다시 그리지 않는다.** HTML 텍스트는 폰트가
    // 로드되는 순간 자동으로 갈아입지만, 차트는 그릴 때 쓴 글꼴로 픽셀이 굳는다. 그래서
    // 첫 화면에서 본문만 새 글꼴이고 차트는 폴백으로 남는 일이 생긴다(다음 필터 조작 때
    // 재생성되면서 뒤늦게 바뀐다). 폰트 로딩이 끝나면 살아 있는 차트를 한 번 갱신한다.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        Object.keys(chartInstances || {}).forEach((k) => {
          const c = chartInstances[k];
          if (c && typeof c.update === 'function') c.update('none');
        });
      }).catch(() => {});
    }

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

    // 차트 글자 두께. 화면 쪽 --fw-ui와 같은 이유로 라이트만 한 단계 올린다 — 밝은 바탕의 어두운
    // 글자는 같은 두께라도 어두운 바탕의 밝은 글자보다 가늘어 보인다. 다크가 읽기 좋은 쪽이므로
    // 그쪽을 기준으로 두고 라이트를 맞춘다.
    // CSS 변수로 못 하는 이유: Chart.js는 캔버스에 직접 그려서 --fw-ui가 닿지 않는다. 값을 여기서 준다.
    // (테마를 토글하면 toggleTheme이 현재 뷰를 다시 그리므로 차트가 새 값으로 다시 만들어진다.)
    function FW() { return currentTheme === 'light' ? '500' : '400'; }

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

    // 5대분류가 아닌 계열(방송/디지털, 채널, 부서, 포트폴리오 '기타' 모드 등)에 쓰는 서수 팔레트.
    //
    // **순서가 곧 설계다.** seriesColor(i)는 i번째 계열에 i번째 색을 준다. 실제로 쓰이는 건
    // 대부분 앞쪽 몇 개이므로, 앞 6개가 색상환에서 가장 멀리 떨어지도록 배치했다
    // (최소 22°). 예전 순서는 주황(35°) 바로 옆이 갈색(34°)이라 **1° 차이**였고,
    // 노랑(48°)까지 세 색이 한 구역에 몰려 있었다.
    //
    // 갈색(#A2845E, 채도 27%)은 뺐다. 이 화면에서 라이트는 탁한 색이 없어야 한다는 게
    // 기준인데, 채도 27%짜리 베이지는 정확히 그 반대였다. 비어 있던 마젠타 구역(312°)으로
    // 옮겨 채운다 — 이제 유채색 최저 채도가 60%다.
    //
    // 부서가 8개 이상이라 10칸을 줄일 수는 없다(줄이면 서로 다른 부서가 같은 색이 된다).
    // 남은 최소 색상차 13°(주황↔노랑)는 순서상 2번과 8번이라 웬만한 차트에서는 같이 나오지 않는다.
    //
    // 3번 초록은 135°(연두)에서 155°(에메랄드)로 옮겼다. 5대분류 인포머셜과 같은 이유다 —
    // 노랑 쪽으로 기운 초록이 화면에서 혼자 계열 없이 떠 보였다(state.js 주석 참고).
    // 다만 여기서는 165°까지 가지 않는다. 5번이 189° 청록이라 165°면 간격이 24°로 좁아진다.
    // 155°면 34° — 앞 6색 최소 간격 22° 규칙 안에 여유 있게 들어온다.
    const SERIES_PALETTE_LIGHT = ['#47A0FF','#FFB347','#6AD7AA','#B88AE5','#68C8D9','#FF758F','#E378CE','#FFDC52','#8B8AE5','#B2B5B8'];
    const SERIES_PALETTE_DARK  = ['#0A81FF','#FF990A','#2ED18D','#AB6EE7','#49BFD4','#FF385D','#DD4BC0','#FFCE0A','#6462DF','#989BA0'];
    function seriesColor(i) {
      const pal = currentTheme === 'light' ? SERIES_PALETTE_LIGHT : SERIES_PALETTE_DARK;
      return pal[i % pal.length];
    }

    // 5대분류 계열색을 현재 테마에 맞춰 돌려준다. 색상(hue)은 두 테마 동일, 명도만 다르다.
    //
    // **항상 색을 돌려준다(undefined 없음).** 5대분류에 없는 이름 — 원본에 새 대분류가 들어와
    // classifyCategory가 그대로 통과시킨 값 — 이면 전용 보라를 준다(state.js 주석 참고).
    // 그래서 호출부에 남아 있는 `catColor(cat) || catColor('기타광고')` 폴백은 이제 닿지 않는다.
    // 지우지 않고 두는 이유는 그 자리들이 전부 인라인 한 줄짜리 dataset 정의라, 폴백을 걷어내는
    // 편집이 얻는 것보다 잘못 건드릴 위험이 크기 때문이다.
    function catColor(name) {
      const hex = (currentTheme === 'light' ? categoryColorsLight : categoryColorsDark)[name];
      if (hex) return hex;
      return currentTheme === 'light' ? categoryColorUnknownLight : categoryColorUnknownDark;
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
    // 채움 팩토리가 돌려주는 함수에 '이 계열의 단색이 무엇인지'를 붙여 둔다.
    //
    // 범례 칩 때문이다. Chart.js는 dataset.backgroundColor를 그대로 칩에 칠하는데, 그 값이
    // 그라데이션이면 **차트 좌표계로 정의된 그라데이션**이 작은 칩에 들어간다. 칩은 그중
    // 자기 위치가 걸치는 구간만 보이므로 같은 계열이라도 차트마다 다른 색으로 나온다 —
    // 세로 스택과 가로 스택은 그라데이션 축이 아예 달라서 특히 크게 어긋난다.
    // (대행사 Top10의 빨강과 월별 추이의 빨강이 달라 보이던 원인이 이것이다.)
    function ddFlat(hex, fn) { fn.ddFlat = hex; return fn; }

    // 범례는 항상 단색으로 그린다. 막대의 그라데이션은 질감일 뿐 계열 정체성이 아니므로,
    // 범례가 보여줘야 하는 것은 그 계열의 색 하나다.
    const _ddGenLabels = Chart.defaults.plugins.legend.labels.generateLabels;
    Chart.defaults.plugins.legend.labels.generateLabels = function (chart) {
      const items = _ddGenLabels.call(this, chart);
      items.forEach((li) => {
        const ds = chart.data.datasets[li.datasetIndex === undefined ? 0 : li.datasetIndex];
        if (!ds) return;
        const bg = ds.backgroundColor;
        // 도넛처럼 항목마다 색이 다른 경우는 dataset에 붙여 둔 배열에서 꺼낸다.
        const flat = (bg && bg.ddFlat) || (ds.ddFlatList && ds.ddFlatList[li.index]);
        if (flat) { li.fillStyle = flat; li.strokeStyle = flat; }
      });
      return items;
    };

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
      return ddFlat(hex, (ctx) => {
        const chart = ctx.chart, area = chart.chartArea;
        if (!area) return hex;
        // 그라데이션도 명도로만 만든다. 검정/흰색을 섞으면 채도가 떨어져 탁해진다(ddLift 주석 참고).
        // 밑동이 진하고 끝으로 갈수록 밝아진다 — 반대로 하면 스택 맨 아래에 오는 계열
        // (보통 비중이 가장 큰 일반광고)이 항상 제일 물빠져 보인다.
        //
        // **라이트에서 끝은 정의값 그 자체다(+0).** 예전에는 끝을 +0.08까지 밀었는데, 파랑
        // 기준색이 L64이니 막대 끝이 L72가 됐다. 누적 막대에서 시선이 가장 오래 머무는 곳이
        // 거기라, 화면 전체가 흰 쪽으로 빠져 보였다 — 기준색을 아무리 진하게 잡아도 그 위에
        // 얹힌 +0.08은 그대로 남으므로 색을 바꿔서는 고쳐지지 않는 문제였다.
        // 이제 코드에 적힌 값이 곧 막대 끝의 색이고, 밑동만 그보다 진하다. 이동폭은 18 → 14로
        // 좁아졌지만 입체감은 남고, 무엇보다 **적힌 색이 화면에 실제로 나온다** — 예전에는
        // 어느 색을 고르든 실제로 보일 색을 머릿속으로 환산해야 했다.
        // 다크는 그대로 둔다. 밑동을 밝히는 방향이라 같은 문제가 없다.
        const base = currentTheme === 'light' ? ddLift(hex, -0.14) : ddLift(hex, 0.12);
        const tip  = currentTheme === 'light' ? ddLift(hex,  0.00) : ddLift(hex, -0.04);

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
      });
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
    // 주의: 이 함수는 '맞닿은 막대 사이의 선'만 담당한다. 그룹 안 막대가 서로 떨어져 보이는 것은
    // 이 값이 아니라 Chart.js의 barPercentage(기본 0.9) 때문이다. 기본값을 그대로 두면 막대 폭이
    // 자기 슬롯의 90%만 차지해 10%가 빈틈으로 남고, 0.15px 구분선은 그 틈 안에서 의미가 없어진다.
    // 그룹 막대를 쓰는 차트는 barPercentage: 1, categoryPercentage: 0.8을 함께 지정해야
    // 스택 차트(구분선 0.3px)와 같은 밀도로 보인다.
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
      return ddFlat(hex, (ctx) => {
        const chart = ctx.chart, area = chart.chartArea;
        if (!area) return hex;
        const cx = (area.left + area.right) / 2, cy = (area.top + area.bottom) / 2;
        const outer = Math.min(area.right - area.left, area.bottom - area.top) / 2;
        const cut = parseFloat(String(chart.options.cutout || '0')) / 100;
        const inner = outer * (isFinite(cut) && cut > 0 ? cut : 0.6);
        if (!isFinite(outer) || outer <= 0 || outer - inner < 1) return hex;
        // 막대와 같은 폭을 쓴다 — 도넛만 다르면 같은 화면에서 조각과 막대의 색이 어긋난다.
        const base = currentTheme === 'light' ? ddLift(hex, -0.14) : ddLift(hex, 0.12);
        const tip  = currentTheme === 'light' ? ddLift(hex,  0.00) : ddLift(hex, -0.04);
        const g = chart.ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
        g.addColorStop(0, base);
        g.addColorStop(1, tip);
        return g;
      });
    }

    // 장식용 대각 그라데이션이 쓰는 색 짝.
    //
    // 예전에는 호출부가 catColor('일반광고')와 catColor('IMC')를 넘겼다. 그런데 이 그라데이션은
    // 바로 아래 주석대로 '순수 장식'이라 5대분류와 아무 관계가 없다. 계열 팔레트를 읽을 이유가
    // 없었는데 읽고 있었고, 그래서 IMC를 빨강으로 옮기자 목표대비 실적 막대와 구간별 분포 막대가
    // 같이 파랑→빨강으로 바뀌었다. 계열색을 건드릴 때마다 무관한 차트가 따라 움직이는 연결이었다.
    //
    // 장식은 장식대로 값을 고정한다. 파랑에서 보라로 흐르는 이 짝이 원래 화면에 나오던 모습이다.
    const DUO_FILL_LIGHT = ['#479FFF', '#B88AE5'];
    // ddDuoFill은 ddBarFill과 달리 밑동을 밝히지 않는다. 그래서 같은 값을 쓰면 실적 막대가
    // 다크에서 화면상 가장 어두운 막대가 된다(4.68~5.01 vs 다른 막대 6~9). 리프트된 값을
    // 직접 적어 다른 막대와 같은 밝기대에 놓는다.
    //
    // 다만 밝히는 데는 천장이 있다. 유효채도는 L50에서 최대이고 거기서 멀어질수록 떨어지므로
    // (같은 S여도 옅게 보인다) 밝힐수록 물이 빠진다. 당월을 #2E93FF(l59)까지 올렸더니
    // 밑동 유효채도가 82 → 58로 떨어져 5대분류(72)보다 탁해졌다. 채움색은 유효채도 70 안팎을
    // 상한으로 보고 그보다 밝게 만들지 않는다.
    //
    // 그 결과 회색(참조 6.46 · 전월 9.08)이 당월(6.50)보다 밝다. 그래도 위계는 유지된다 —
    // 회색은 채도 20 안팎이고 당월은 100이라, 앞에 서는 것은 채도 쪽이다.
    const DUO_FILL_DARK  = ['#2990FF', '#A970E8'];
    function ddDuoPair() {
      return currentTheme === 'light' ? DUO_FILL_LIGHT : DUO_FILL_DARK;
    }

    // 다색 대각 그라데이션 채움 — **단일 계열 차트에만 쓴다.**
    // 색이 계열(5대분류)을 뜻하는 차트에 쓰면 범례가 무의미해진다. 실적 막대나 광고주 수처럼
    // 계열이 하나뿐이라 색에 의미가 없는 곳에서는 순수 장식이므로 무해하고, 화면이 풍부해진다.
    function ddDuoFill(fromHex, toHex) {
      return ddFlat(fromHex, (ctx) => {
        const chart = ctx.chart, area = chart.chartArea;
        if (!area) return fromHex;
        const g = chart.ctx.createLinearGradient(area.left, area.bottom, area.right, area.top);
        g.addColorStop(0, fromHex);
        g.addColorStop(1, toHex);
        return g;
      });
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
    // 피벗 표의 색. **키는 렌더러가 HTML에 박아 넣는 토큰이고, 값은 테마별로 따로 적는다.**
    //
    // 예전에는 `{다크값: 라이트값}` 형태였고 mapPivotHtml이 라이트에서만 돌았다. 그래서 다크는
    // 렌더러가 쓴 리터럴이 그대로 화면에 나왔고 — 즉 다크 값을 고치려면 features/*.js 곳곳의
    // 인라인 hex를 전부 찾아 고쳐야 했다. 이제 두 테마 모두 이 표를 거치므로,
    // 다크 색도 여기 한 곳에서 바꿀 수 있다. 키와 dark 값이 같은 항목은 지금 화면 그대로다.
    const PIVOT_COLOR_MAP = {
      // 깊이별 배경 (1 → 5)
      '#1E293B': { light: '#ECEFF3', dark: '#1E293B' },
      '#151C2C': { light: '#F2F4F7', dark: '#151C2C' },
      '#11151F': { light: '#F7F9FA', dark: '#11151F' },
      '#0D1117': { light: '#FBFCFD', dark: '#0D1117' },
      '#090C10': { light: '#FFFFFF', dark: '#090C10' },
      // 채널·광고주·대행사 피벗의 중간 톤 배경
      '#172033': { light: '#F2F4F7', dark: '#172033' },
      '#1A2234': { light: '#F2F4F7', dark: '#1A2234' },
      '#141824': { light: '#F7F9FA', dark: '#141824' },
      // 깊이별 텍스트 (1 → 5) — 배경 램프와 짝을 이뤄 계층을 이중으로 표현
      '#F8FAFC': { light: '#111827', dark: '#F8FAFC' },
      '#CBD5E1': { light: '#1F2937', dark: '#CBD5E1' },
      '#94A3B8': { light: '#374151', dark: '#94A3B8' },
      '#64748B': { light: '#4B5563', dark: '#64748B' },
      '#475569': { light: '#5B6470', dark: '#475569' },
      // 헤더 / 총합계 / 강조
      '#1D4ED8': { light: '#0050D9', dark: '#1D4ED8' },
      '#1E3A8A': { light: '#E8F2FF', dark: '#1E3A8A' },
      '#1E40AF': { light: '#0064FF', dark: '#1E40AF' },
      '#60A5FA': { light: '#0064FF', dark: '#60A5FA' },
      '#93C5FD': { light: '#0064FF', dark: '#93C5FD' },
      '#C4B5FD': { light: '#7B61FF', dark: '#C4B5FD' },
      // 증감 표시
      '#4ADE80': { light: '#00A85A', dark: '#4ADE80' },
      '#F87171': { light: '#FF4040', dark: '#F87171' },
      '#FFB547': { light: '#FF9500', dark: '#FFB547' },
      // 연 요약·총합계 열의 반투명 틴트. hex가 아니라 rgba로 적혀 있어 한동안 치환에서
      // 누락됐고, 라이트에서 영구히 다크 네이비로 남던 지점이다.
      // (불투명 hex로 바꾸면 다크의 10% 틴트가 짙은 네이비가 되므로 rgba 그대로 둔다.)
      'rgba(30,58,138,0.1)': { light: 'rgba(0,100,255,0.06)', dark: 'rgba(30,58,138,0.1)' },
      'rgba(30,64,175,0.2)': { light: 'rgba(0,100,255,0.10)', dark: 'rgba(30,64,175,0.2)' }
    };
    // 두 테마 모두에서 돈다. 다크에서 그냥 통과시키면 렌더러 리터럴이 곧 다크 색이 되어,
    // 다크만 손보는 일이 불가능해진다.
    function mapPivotHtml(html) {
      const t = currentTheme === 'light' ? 'light' : 'dark';
      let out = html;
      Object.keys(PIVOT_COLOR_MAP).forEach(k => { out = out.split(k).join(PIVOT_COLOR_MAP[k][t]); });
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
      if (btn) btn.innerText = currentTheme === 'dark' ? '☀️ 라이트모드' : '🌙 다크모드';
      if (rawData.length > 0) switchView(currentView, false);
    }
