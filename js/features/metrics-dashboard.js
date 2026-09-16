// ============================================================
// js/features/metrics-dashboard.js
// 지표 대시보드(경쟁채널 벤치마크) — 매출/M-S 쪽: 컨트롤바, KPI 1·2(시장규모/M-S), M/S 트렌드(누적막대),
// 매출 트렌드(라인)/랭킹(가로막대), ①사업자·②채널 독립 멀티셀렉트, 오케스트레이션(renderMetricsDashboard()).
// CPRP/채널시청률/eq-GRPs·시청률1%당매출·상세표는 js/features/metrics-ratings.js(다음 순서 파일).
//
// 데이터 계약은 js/core/metrics-data-loader.js가 전부 정의한다(fetchMetricsDataHttp/rebuildMetricsSubstitution/
// computeEnaMonthlyRevenue/metricsRevenueData 등) — 여기서는 그 결과만 읽는다. 자세한 배경·공식은
// docs/features/metrics-dashboard.md 참고.
// ============================================================

    // ------------------------------------------------------------
    // 공용 소형 헬퍼 — 두 파일(metrics-dashboard.js/metrics-ratings.js)이 함께 쓴다.
    // ------------------------------------------------------------

    // "범위" 토글이 가리키는 행 매칭. row.scope(지상파/종편/케이블)는 metrics-data-loader.js의
    // METRICS_OPERATOR_SCOPE 하드코딩 맵에서 온다(File1엔 File2의 사업자대분류/중분류 같은 스코프
    // 컬럼이 없어 사람이 직접 분류, 2026-09-16).
    function metricsScopeMatchRow(row, scopeMode) {
      const mode = scopeMode || metricsScopeMode;
      if (mode === 'all') return true;
      if (mode === 'cable') return row.scope === '케이블';
      return row.scope === '종편' || row.scope === '케이블'; // 'payTv' 기본값
    }

    // 데이터에 실제로 있는 (연도 내) 월 목록 — 오름차순. metricsSelectedMonths(월 선택 pill, 비어있으면
    // 전체)로 좁힌다 — 매출 대시보드의 selectedMonths와 같은 원칙, 이 탭 전용 상태라 전역과 분리.
    function metricsMonthsInYear(rows, year) {
      const months = [...new Set(rows.filter(r => r.year === year).map(r => r.month))].sort((a, b) => a - b);
      return metricsSelectedMonths.length > 0 ? months.filter(m => metricsSelectedMonths.includes(m)) : months;
    }
    function metricsPrevMonthPeriod(p) {
      if (!p) return null;
      return p.month === 1 ? { year: p.year - 1, month: 12 } : { year: p.year, month: p.month - 1 };
    }
    function metricsPrevYearPeriod(p) { return p ? { year: p.year - 1, month: p.month } : null; }

    // 연도 선택(복수) 스코프 — 비어있으면(="전체" pill을 명시적으로 고른 상태) 데이터에 있는 연도
    // 전부를, 아니면 선택된 연도만 오름차순으로 돌려준다. 매출 대시보드의 selectedYears와 같은
    // 원칙(2026-09-16, "지표 대시보드 전체로 확장" 확정) — 아래 metricsSelectedPeriods()가 이
    // 목록으로 연도×월을 순회한다.
    function metricsYearsInScope() {
      if (metricsSelectedYears.length > 0) return [...metricsSelectedYears].sort((a, b) => a - b);
      return [...new Set(metricsRevenueData.map(r => r.year))].sort((a, b) => a - b);
    }
    // 단일-연도 전제 기능(YoY 등 — filters.js의 "단일 앵커" 관례와 같은 원칙, 2026-09-16)이 기준으로
    // 삼는 "대표 연도" — 연도 스코프 중 최신.
    function metricsPrimaryYear() {
      const years = metricsYearsInScope();
      return years.length ? years[years.length - 1] : new Date().getFullYear();
    }
    // rows(데이터 배열) 안에서 연도 스코프 × 월 선택(비어있으면 그 연도의 전체 월)을 모두 펼친
    // {year,month} 목록 — 연도→월 오름차순. "선택 연도 하나"를 전제로 짠 단일-루프 대신 차트/KPI가
    // 전부 이 목록 하나로 순회하도록 통일한다.
    function metricsSelectedPeriods(rows) {
      const periods = [];
      metricsYearsInScope().forEach(year => { metricsMonthsInYear(rows, year).forEach(month => periods.push({ year, month })); });
      return periods;
    }
    // 차트 x축 라벨 — 연도가 스코프에 하나뿐이면 기존과 동일하게 "9월", 여러 연도가 섞이면 어느
    // 해인지 구분이 안 되므로 "25.9"(연도 뒤 2자리+점+월) 형식을 쓴다.
    function metricsPeriodLabel(p) {
      return metricsYearsInScope().length > 1 ? `${String(p.year).slice(2)}.${p.month}` : `${p.month}월`;
    }
    // "조회조건"(연도/월 선택) 전체를 사람이 읽는 한 줄로 — KPI 서브라벨·랭킹차트 제목이 쓴다.
    // 단일 기간이면 "2026년 9월", 한 연도 안 여러 달이면 기존과 동일한 "~월 누적", 여러 연도가
    // 섞이면 "2025~2026년 누적(N개월)"로 뭉뚱그린다(연도별로 선택된 달이 다를 수 있어 월 목록을
    // 그대로 나열하면 너무 길어진다).
    function metricsPeriodRangeLabel(periods) {
      if (!periods.length) return '';
      if (periods.length === 1) return `${periods[0].year}년 ${periods[0].month}월`;
      const years = [...new Set(periods.map(p => p.year))];
      if (years.length === 1) {
        const months = periods.map(p => p.month);
        const isContiguous = months.every((m, i) => i === 0 || m === months[i - 1] + 1);
        return isContiguous ? `${years[0]}년 ${months[0]}~${months[months.length - 1]}월 누적` : `${years[0]}년 ${months.join(',')}월 누적`;
      }
      return `${years[0]}~${years[years.length - 1]}년 누적(${periods.length}개월)`;
    }

    // 매출 4개 차트 피벗(pivot-builder.js PIVOT_PRESETS)의 dataSource — 위쪽 "조회조건"(연도/월 선택)
    // 으로 미리 좁힌 파생 배열. 매출 대시보드의 filteredData(top filter-bar로 이미 좁혀진 뒤 피벗에
    // 들어감)와 구조를 맞춘다(2026-09-16, 사용자 지적: "기본값은 26년 전체인데 피벗도 그래야지 —
    // 조회조건 위에 그대로 걸려있는 게 매출대시보드랑 구조적으로 같다"). metricsRevenueData 원본을
    // 그대로 넘기면 File1이 갖고 있는 2021~2026년 전체가 다 보여 위쪽 조회조건과 안 맞았다.
    function metricsRevenueDataForPivot() {
      const years = metricsYearsInScope();
      return metricsRevenueData.filter(r => years.includes(r.year) && (metricsSelectedMonths.length === 0 || metricsSelectedMonths.includes(r.month)));
    }

    // "KT ENA M/S 트렌드" 피벗의 dataSource — 매출 원본을 그대로 넘기면 "M/S 눌렀는데 왜 매출이
    // 나오지?"가 된다(2026-09-16, 사용자 지적). M/S는 revenue를 합산한 값이 아니라 "그 사업자 매출
    // ÷ ①선택 사업자 합"이라는 비율이라 pivot 엔진의 sum(revenue)으로는 절대 재현이 안 된다.
    // 처음엔 KT ENA 한 줄만 냈는데, 이어진 요청("M/S 테이블에서는 KT ENA만 나오지 말고 사업자별로
    // 다 나와야지")으로 ①선택 사업자 전원의 share(%)를 각자 행으로 낸다 — computeEnaSelectionMarketShare()
    // 의 분모 계산(metricsGroupRevenueMap({year,month},'all') 위에서 ①선택 사업자 합)과 같은 공식을
    // 분자만 사업자별로 바꿔 재사용한다. metricsSelectedPeriods(metricsRevenueData) — 차트
    // (renderMetricsMarketShareChart)와 완전히 같은 기간 목록을 써서 차트와 피벗이 항상 같은 달들을
    // 보여주게 맞춘다.
    function metricsMsTrendDataForPivot() {
      const ops = metricsSelectedOperators.length ? metricsSelectedOperators : [ENA_CHANNEL_GROUP];
      const rows = [];
      metricsSelectedPeriods(metricsRevenueData).forEach(p => {
        const groups = metricsGroupRevenueMap(p, 'all');
        const market = ops.reduce((s, op) => s + (groups[op] || 0), 0);
        ops.forEach(op => {
          rows.push({ channelGroup: op, year: p.year, month: p.month, share: market > 0 ? ((groups[op] || 0) / market * 100) : 0 });
        });
      });
      return rows;
    }

    // 전월비/전년비 배지 공용 계산. curr/prev 어느 한쪽이라도 없으면(연-월 데이터 없음) null —
    // 호출부가 배지를 숨긴다. prev===0은 성장률(%) 계산에서만 분모라 막고, %p 차이는 0도 유효하다.
    function metricsGrowthPct(curr, prev) {
      if (curr === null || curr === undefined || prev === null || prev === undefined || prev === 0) return null;
      return (curr - prev) / prev * 100;
    }
    function metricsPointDiff(curr, prev) {
      if (curr === null || curr === undefined || prev === null || prev === undefined) return null;
      return curr - prev;
    }
    // 1000단위 콤마 포함 숫자 포맷 — 이 탭의 금액(억원/억) 표기는 toFixed()만 쓰면 1,000단위 콤마가
    // 안 붙는다(예: "1441.23"). CPRP(metrics-ratings.js)는 이미 toLocaleString()을 쓰고 있었으니
    // 나머지도 맞춘다(2026-09-15, 사용자 요청).
    function metricsFmtNum(value, decimals) {
      return Number(value).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }
    // KPI 카드 배지 렌더. unit '%'는 상대성장률(전월/전년 대비 증감률), '%p'는 이미 %인 값(M/S·시청률)의
    // 절대 차이 — 퍼센트의 퍼센트 성장률은 읽기 어려워서 이 둘을 구분한다(plan 확정사항 3).
    // decimals 기본값 1 — 대부분의 배지(M/S %p, 매출 성장률 %)는 값 자체가 한 자리 수~두 자리
    // %대라 소수 1자리로 충분하다. ENA 채널시청률처럼 원값 자체가 0.1%대인 지표는 1자리로는 진짜
    // 변화(예: +0.015%p)가 전부 "+0.0%p"로 뭉개져 사라진다 — 호출부가 이 값의 자릿수에 맞는
    // decimals를 넘길 수 있게 열어둔다(2026-09-16, 사용자 지적: 화면에 "전년 +0.0%p"만 보이길래
    // "이거 전년비 확인해볼래"라고 물어봄 — Supabase 실측으로 0.1065%→0.1215%, 실제로는 +0.015%p
    // 증가가 있었는데 toFixed(1)에 가려 0으로 보인 것이었다).
    function metricsRenderBadge(elId, label, value, unit, decimals) {
      const el = document.getElementById(elId);
      if (!el) return;
      if (value === null || value === undefined || !isFinite(value)) { el.style.display = 'none'; return; }
      const d = decimals === undefined ? 1 : decimals;
      el.style.display = 'inline-flex';
      el.className = 'badge-growth ' + (value >= 0 ? 'up' : 'down');
      el.innerText = `${label} ${value >= 0 ? '+' : ''}${value.toFixed(d)}${unit} ${value >= 0 ? '▲' : '▼'}`;
    }

    // 화면 맨 위 "데이터 기준" 한 줄.
    //
    // 우선순위 1: metricsReportAsOfDate(js/core/metrics-data-loader.js, /api/competitor-ratings-meta) —
    // File1(경쟁채널 지표 현황) 엑셀 내부 "{연도}년" 시트 H2에 적힌 리포트 발행 기준일을 그대로 보여준다
    // (2026-09-16, 사용자 확인 — "최신 데이터가 있는 달"과는 다른 개념이라 원본 그대로 표기해야 함).
    // 우선순위 2(폴백): 이 값이 없으면(ETL을 이 컬럼이 생긴 뒤로 재실행하지 않은 환경, 또는 조회 실패)
    // 기존 방식대로 metric_code='01'(방송사업자 광고매출, 14개 사업자 전원이 매달 보고 — 모든 사업자·
    // 채널이 다 채워지는 제일 신뢰도 높은 지표) 기준 "실제 데이터가 있는 최신 연/월"을 계산해 보여준다.
    // value===0인 미보고 placeholder 행은 제외(다른 곳과 동일한 관례).
    function renderMetricsDataAsOfLabel() {
      const el = document.getElementById('metricsDataAsOfLabel'); if (!el) return;

      if (typeof metricsReportAsOfDate === 'string' && metricsReportAsOfDate) {
        const m = metricsReportAsOfDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) {
          el.innerText = `데이터 기준: ${Number(m[1])}년 ${Number(m[2])}월 ${Number(m[3])}일`;
          return;
        }
      }

      const rows = metricsRatingsData.filter(r => r.metricCode === '01' && r.value !== 0);
      if (!rows.length) { el.innerText = ''; return; }
      const latest = rows.reduce((a, b) => (b.year > a.year || (b.year === a.year && b.month > a.month)) ? b : a);
      el.innerText = `데이터 기준: ${latest.year}년 ${latest.month}월`;
    }

    // File1(경쟁채널 지표 현황)은 "구분" 원문에서 번호(01./03. 등)를 뗀 텍스트가 metricLabel이다.
    // 번호 자체(metricCode)는 파일마다 밀릴 수 있어 라벨 텍스트로 코드를 찾는다. 실 샘플(2026-09-15)로
    // 16개 전체 확인됨 — 06="누적 eq-GRPs" / 07="1일 eq-GRPs" / 08="채널시청률 1%당 eq-GRPs"로 서로
    // 다른 지표다(추측했던 "같은 지표의 INDEX 분화"가 아니었다). "누적"은 연간 누적이 아니라 **월
    // 누적**이다 — Supabase 실측으로 확인(2026-09-15): 06번 값이 연중 계속 커지지 않고 매달 오르내리며,
    // "260910 기준"(9월 10일자) 리포트의 9월 값만 유독 확 낮다 — 9월이 아직 10일치 데이터만 쌓인
    // 진행중 월이라 월 누적이 그만큼 작게 나온 것(연간 누적이라면 그럴 수 없다). GRP 트렌드는 사용자
    // 요청으로 이 "월 누적"(06)을 쓴다(과거엔 07="1일 평균"을 썼었다). 공백은 원본에서 항목마다 들쭉날쭉하다(예:
    // "채널 시청률"엔 공백이 있고 "채널시청률 1%당 eq-GRPs"엔 없다, "1% 당"처럼 %뒤에도 공백이 있다) —
    // 그래서 비교 전에 공백을 전부 제거한다. 그래도 "채널 시청률"(03)은 공백만 지우면 "채널시청률
    // 1%당 eq-GRPs"(08)의 접두어와 겹치므로, rating만 부분일치가 아니라 완전일치로 찾는다.
    // advCount(12.광고주 수)는 완전일치로 찾는다 — 부분일치("광고주수")로 찾으면 16."사업자별
    // 광고주수(120초 미만)"도 공백 제거 후 이 문자열을 포함해 같이 걸린다(실 샘플로 확인, 2026-09-15).
    const METRICS_LABEL = { rating: '채널시청률', cprp: 'CPRP', revPerRating: '시청률1%당매출', grp: '누적eq-GRPs', advCount: '광고주수(일반+인포전체)' };
    function metricsStripWs(s) { return (s || '').replace(/\s+/g, ''); }
    function metricsFindMetricCode(labelSubstring, indexMode, exact) {
      const target = metricsStripWs(labelSubstring);
      const matches = [...new Set(metricsRatingsData.filter(r => {
        const label = metricsStripWs(r.metricLabel);
        return exact ? label === target : label.includes(target);
      }).map(r => r.metricCode))];
      if (matches.length <= 1) return matches[0] || null;
      const withIndex = matches.find(code => metricsRatingsData.some(r => r.metricCode === code && r.indexMode === indexMode));
      return withIndex || matches[0];
    }

    // ------------------------------------------------------------
    // File1(경쟁채널 지표 현황) 사업자별 매출 집계 — M/S·시장규모·매출 트렌드/랭킹이 공유
    // ------------------------------------------------------------
    // 사업자(=채널그룹, File1은 세부채널 분해가 없어 항상 같은 값)별 월 매출 총합 맵.
    function metricsGroupRevenueMap(period, scopeMode) {
      const out = {};
      metricsRevenueData.filter(r => r.year === period.year && r.month === period.month && metricsScopeMatchRow(r, scopeMode))
        .forEach(r => { out[r.channelGroup] = (out[r.channelGroup] || 0) + r.revenue; });
      return out;
    }

    // M/S 공식(KPI1·2 전용 — 진짜 전체 산업 규모 기준): ENA 사업자 총합(치환값) ÷ "범위" 토글이
    // 가리키는 시장 총매출 × 100. KPI1·2("전체방송광고 시장규모"/"유료방송광고 시장규모")는 ①②선택과
    // 무관하게 항상 이 진짜 전체 규모를 보여주기로 함(2026-09-16, 사용자 확인 — "이 둘은 진짜 전체
    // 산업 규모로 그대로"). KPI3(M/S)·M/S트렌드·시장규모추이차트·비중은 아래 selection 버전을 쓴다.
    function computeEnaPayTvMarketShare(year, month, scopeMode) {
      const groups = metricsGroupRevenueMap({ year, month }, scopeMode || metricsScopeMode);
      const market = Object.values(groups).reduce((s, v) => s + v, 0);
      const ena = groups[ENA_CHANNEL_GROUP] || 0;
      return { market, ena, share: market > 0 ? (ena / market * 100) : 0 };
    }
    function metricsMarketAndShareAt(period, scopeMode) { return period ? computeEnaPayTvMarketShare(period.year, period.month, scopeMode) : null; }
    // 선택된 기간들(연도 복수선택 × 월 선택 pill — metricsSelectedPeriods())을 누적 합산한 버전.
    // KPI1·2가 "월선택 전체"인데도 최신 1개월(9월)만 보여줘 매출 랭킹/트렌드와 기준이 안 맞아
    // 보인다는 지적(2026-09-16, 사용자: "월선택 전체인데 1~9월로 안 나오지? 9월만 같은데")을 받아
    // 신설 — renderMetricsRevenueKpis()가 단일 기간 선택 땐 여전히 위 단일-기간 버전을 쓰고, 여러
    // 기간(달 또는 연도, 또는 둘 다)이 선택되면 이걸 쓴다.
    function metricsMarketAndShareOverPeriods(periods, scopeMode) {
      if (!periods.length) return null;
      let market = 0, ena = 0;
      periods.forEach(p => {
        const groups = metricsGroupRevenueMap(p, scopeMode);
        market += Object.values(groups).reduce((s, v) => s + v, 0);
        ena += groups[ENA_CHANNEL_GROUP] || 0;
      });
      return { market, ena, share: market > 0 ? (ena / market * 100) : 0 };
    }

    // M/S 공식(KPI3·M/S트렌드·시장규모추이차트·비중 — ①선택 사업자 기준): "시장"이 전체 사업자가
    // 아니라 ①에서 선택된 사업자들의 합(ENA 포함)으로 바뀐다 — M/S는 여전히 ENA ÷ 그 합(분자는
    // 항상 ENA로 고정, 사용자가 다른 사업자를 골라도 분자가 바뀌지 않는다). "범위" 토글과 무관하게
    // ①에서 실제로 선택된 이름만 합산한다(scope='all'로 조회 — 선택 자체가 이미 ①드롭다운에서 그
    // 시점의 범위 안에서 고른 것들이라 이중 필터링하지 않는다. 2026-09-16, 사용자 요청: "사업자,
    // 채널에 따라 시장, 비중, M/S 등등 바뀌는 게 맞을 거 같아" + "KT ENA 기준이어야 되는 건 맞는데").
    function computeEnaSelectionMarketShare(year, month) {
      const groups = metricsGroupRevenueMap({ year, month }, 'all');
      const ops = metricsSelectedOperators.length ? metricsSelectedOperators : [ENA_CHANNEL_GROUP];
      const market = ops.reduce((s, op) => s + (groups[op] || 0), 0);
      const ena = groups[ENA_CHANNEL_GROUP] || 0;
      return { market, ena, share: market > 0 ? (ena / market * 100) : 0 };
    }
    function metricsSelectionMarketAndShareAt(period) { return period ? computeEnaSelectionMarketShare(period.year, period.month) : null; }
    // 위 metricsMarketAndShareOverPeriods()의 선택 사업자 기준 버전 — KPI3(M/S)가 쓴다.
    function metricsSelectionMarketAndShareOverPeriods(periods) {
      if (!periods.length) return null;
      const ops = metricsSelectedOperators.length ? metricsSelectedOperators : [ENA_CHANNEL_GROUP];
      let market = 0, ena = 0;
      periods.forEach(p => {
        const groups = metricsGroupRevenueMap(p, 'all');
        ops.forEach(op => { market += (groups[op] || 0); });
        ena += groups[ENA_CHANNEL_GROUP] || 0;
      });
      return { market, ena, share: market > 0 ? (ena / market * 100) : 0 };
    }

    // ------------------------------------------------------------
    // ① 사업자 / ② 채널 후보 목록 — File1(경쟁채널 지표 현황) 하나로 통일(2026-09-16).
    // ------------------------------------------------------------
    // 정렬: KT ENA 항상 맨 앞 → 지상파/종편/케이블 그룹별로 묶어서 → 그룹 안에서는 가나다순
    // (2026-09-16, 사용자 요청 — "케이블은 케이블끼리, 종편은 종편끼리 붙여놔줘". METRICS_OPERATOR_SCOPE는
    // metrics-data-loader.js의 사업자→범위 하드코딩 맵을 그대로 재사용).
    const METRICS_SCOPE_ORDER = { '지상파': 0, '종편': 1, '케이블': 2 };
    // "구분별" 스택(방송광고시장 규모 추이 차트, metricsMarketByScopeGrouping==='category') 전용
    // 고정 색 — 지상파는 빨강, 종편은 에메랄드/민트, 케이블은 파랑(2026-09-16, 사용자 요청: "케이블
    // 파랑, 종편 에메랄드/민트, 지상파 빨강으로 하자"). 값은 새로 만들지 않고 화면에 이미 있는
    // categoryColorsLight/Dark(state.js)의 IMC(빨강)/인포머셜(에메랄드)/일반광고(파랑)를 그대로
    // 재사용한다 — CLAUDE.md 절대원칙(색상은 화면에 이미 있는 hue만 쓴다)과 같은 이유. 이 3구분은
    // 사업자 여럿을 묶은 집계라 metricsCompetitorColor()의 "파랑은 ENA 전용" 제약과는 다른 맥락이다.
    const METRICS_SCOPE_CATEGORY_COLOR = {
      '지상파': { light: '#FF4D3D', dark: '#FF453A' },
      '종편':   { light: '#43DBB5', dark: '#2ED1A8' },
      '케이블': { light: '#479FFF', dark: '#0A84FF' }
    };
    function metricsScopeCategoryColor(cat) {
      const c = METRICS_SCOPE_CATEGORY_COLOR[cat];
      return c ? c[currentTheme === 'light' ? 'light' : 'dark'] : metricsCompetitorColor(0);
    }
    function metricsAllOperatorGroups() {
      const set = new Set();
      metricsRevenueData.filter(r => metricsScopeMatchRow(r, metricsScopeMode)).forEach(r => set.add(r.channelGroup));
      return [...set].sort((a, b) => {
        if (a === ENA_CHANNEL_GROUP) return -1;
        if (b === ENA_CHANNEL_GROUP) return 1;
        const rankDiff = (METRICS_SCOPE_ORDER[METRICS_OPERATOR_SCOPE[a]] ?? 99) - (METRICS_SCOPE_ORDER[METRICS_OPERATOR_SCOPE[b]] ?? 99);
        return rankDiff !== 0 ? rankDiff : a.localeCompare(b, 'ko');
      });
    }
    // 선택된 사업자(들)에 속한 개별 채널 후보 — metrics-data-loader.js의 METRICS_OPERATOR_CHANNEL_MAP
    // 하드코딩 맵을 그대로 따른다(File1엔 사업자→채널 대응관계를 알려주는 컬럼이 없다).
    function metricsChannelsForOperators(ops) {
      const set = new Set();
      ops.forEach(op => metricsChannelsForOperator(op).forEach(ch => set.add(ch)));
      return [...set];
    }
    // CPRP/채널시청률/eq-GRPs/광고주수/상세표가 쓰는 채널 목록 — 위 ①②선택을 그대로 공유한다
    // (2026-09-16, 사용자 요청 — 예전엔 File1↔File2 별칭이 안 맞는 문제로 고정 목록을 썼으나, 이제
    // 매출까지 전부 File1 하나뿐이라 그 문제 자체가 없어졌다). "사업자 비교/대표채널 비교" 토글은
    // 폐지했다(2026-09-16, 사용자 지적 — "②채널을 어차피 직접 찍으니 토글이 의미 없다") — ②에서
    // 실제로 체크한 채널이 있으면 그대로 쓰고, 비어 있으면 ①선택 사업자의 대표채널(①의 첫 번째
    // 하위 채널, 없으면 사업자명 자체 — CPRP·시청률 같은 비율 지표는 사업자 내 여러 채널 값을
    // 더하거나 평균낼 수 없어 하나로 근사한다)로 자동 대체한다.
    function metricsRatingsChannelSelection() {
      if (metricsSelectedChannels.length > 0) return metricsSelectedChannels;
      return metricsSelectedOperators.map(metricsRepresentativeChannel);
    }

    // 첫 렌더에서만 기본값을 채운다(사용자가 이미 고른 선택은 건드리지 않는다).
    function metricsEnsureDefaultSelections() {
      if (!metricsYearsInitialized) {
        const years = [...new Set(metricsRevenueData.map(r => r.year))];
        metricsSelectedYears = years.length ? [Math.max(...years)] : [new Date().getFullYear()];
        metricsYearsInitialized = true;
      }
      if (!metricsOperatorsInitialized) {
        // 기본값은 "범위"(기본 유료방송) 안에 있는 사업자 전부다(2026-09-16, 사용자 요청: "유료방송에
        // 들어가는 모든 사업자 다 찍어줘야돼") — top4만 뽑던 이전 랭킹 로직은 폐지. metricsAllOperatorGroups()가
        // 이미 metricsScopeMode로 후보를 좁히고 KT ENA를 맨 앞에 두는 정렬까지 해주므로 그대로 쓴다.
        // `.length===0`이 아니라 별도 초기화 플래그로 판단한다 — 안 그러면 사용자가 "전체선택"을 눌러
        // 전부 해제했을 때(배열이 다시 []가 됨) 다음 렌더에서 이 기본값이 도로 채워져 "전체 해제가
        // 안 되는" 버그가 있었다(2026-09-16, 사용자 지적).
        metricsSelectedOperators = metricsAllOperatorGroups();
        metricsOperatorsInitialized = true;
      }
      // ②채널은 기본값을 채우지 않는다 — 비워두면 metricsRatingsChannelSelection()이 알아서
      // ①사업자별 대표채널로 자동 대체한다(위 함수 주석 참고).
    }

    // ------------------------------------------------------------
    // 컨트롤 핸들러
    // ------------------------------------------------------------
    // 취급고/회계(매출기준) 버튼은 이 탭에도 있지만 이 탭 전용 상태를 따로 두지 않는다 — 전역
    // revenueBasisMode(state.js, 메인 대시보드와 공유)를 그대로 바꾼다. data-loader.js의
    // setRevenueBasis()를 그대로 재사용해 메인 대시보드 쪽 버튼 active 상태·필터(applyFilters())도
    // 함께 갱신되게 하고, 이 탭 자신의 버튼 active 상태와 렌더는 별도로 마저 처리한다(그쪽 함수는
    // 이 탭의 DOM/렌더를 모른다). renderMetricsDashboard()가 매번 rebuildMetricsSubstitution()을
    // 다시 불러 KT ENA 부분을 새 기준으로 재계산한다.
    function setMetricsRevenueBasis(mode) {
      setRevenueBasis(mode); // data-loader.js — 전역 revenueBasisMode + 메인 대시보드 버튼/필터
      document.getElementById('btnMetricsBasisPerformance').classList.toggle('active', mode === 'performance');
      document.getElementById('btnMetricsBasisAccounting').classList.toggle('active', mode === 'accounting');
      renderMetricsDashboard();
    }
    function setMetricsIndexMode(mode) {
      metricsIndexMode = mode;
      document.getElementById('btnMetricsIndexAll').classList.toggle('active', mode === '전체');
      document.getElementById('btnMetricsIndexPrime').classList.toggle('active', mode === '프라임타임');
      renderMetricsDashboard();
    }
    function setMetricsScopeMode(mode) {
      metricsScopeMode = mode;
      document.getElementById('btnMetricsScopeAll').classList.toggle('active', mode === 'all');
      document.getElementById('btnMetricsScopePayTv').classList.toggle('active', mode === 'payTv');
      document.getElementById('btnMetricsScopeCable').classList.toggle('active', mode === 'cable');
      // 범위 토글에 따라 ①선택도 자동으로 들어오고 나가야 한다(2026-09-16, 사용자 요청: "지상파+
      // 유료방송 일때는 지상파 3개 채널이 추가로 찍혔다가 유료방송을 클릭하면 그 3개 채널이 빠져야지,
      // 케이블 찍었을 때는 또 종편 채널들이 빠져야될 거고" + "토글에 따라 각 채널그룹들이 자동으로
      // 들어왔다 나갔다 해야되는데"). 매번 먼저 "새 범위 밖으로 나간 선택"을 걸러내고(metricsScopeMatchRow —
      // KT ENA는 scope가 '케이블'이라 세 모드 전부에서 항상 살아남는다), 그 다음 'all'로 넓힐 때만
      // 지상파 3사를 추가한다 — 좁힐 때 지상파/종편이 자동으로 빠지고, 다시 넓히면 지상파가 자동으로
      // 돌아오는 왕복 토글이 된다(이전엔 좁힐 때 선택을 그대로 뒀었는데, 그러면 "유료방송"으로 좁혀도
      // 지상파 3사가 여전히 체크된 채 남아 범위와 선택이 어긋났다).
      metricsSelectedOperators = metricsSelectedOperators.filter(op => metricsScopeMatchRow({ scope: METRICS_OPERATOR_SCOPE[op] }, mode));
      if (mode === 'all') {
        Object.keys(METRICS_OPERATOR_SCOPE).filter(op => METRICS_OPERATOR_SCOPE[op] === '지상파').forEach(op => {
          if (!metricsSelectedOperators.includes(op)) metricsSelectedOperators.push(op);
        });
      }
      renderMetricsDashboard();
    }
    function setMetricsMarketByScopeMode(mode) {
      metricsMarketByScopeMode = mode;
      document.getElementById('btnMetricsScopeChartAmount').classList.toggle('active', mode === 'amount');
      document.getElementById('btnMetricsScopeChartShare').classList.toggle('active', mode === 'share');
      renderMetricsMarketByScopeChart();
    }
    function setMetricsMarketByScopeGrouping(mode) {
      metricsMarketByScopeGrouping = mode;
      document.getElementById('btnMetricsScopeGroupOperator').classList.toggle('active', mode === 'operator');
      document.getElementById('btnMetricsScopeGroupCategory').classList.toggle('active', mode === 'category');
      renderMetricsMarketByScopeChart();
    }
    // 연도/월 조회조건 pill — metricsMain 자신뿐 아니라 매출 4개 피벗 상세 화면(metricsMarketByScopePivot
    // 등, view-router.js)도 이 조회조건을 그대로 보여주고 조작할 수 있어야 한다(2026-09-16, 사용자
    // 지적 — "조회조건이 위에 보여야지", 매출 대시보드의 filter-bar가 모든 피벗 화면에서 계속
    // 보이고 조작 가능한 것과 구조를 맞춘다). containerId/onChange를 인자로 받는 범용 버전을 만들고,
    // metricsMain 전용 함수들은 그 버전을 자기 컨테이너로 호출하는 얇은 래퍼로 남긴다 — 전역 상태
    // (metricsSelectedYears/Months)는 하나뿐이라 어느 화면에서 바꾸든 나머지 화면에도 그대로 이어진다.
    // 연도 pill도 월 pill과 같은 복수선택 규칙(클릭=교체, 재클릭=해제, Ctrl/⌘/Shift=가감)을 쓴다 —
    // 매출 대시보드의 setupYearPills()(js/core/filters.js)와 정확히 같은 패턴, nextPillSelection/
    // isAdditiveClick도 그대로 재사용(2026-09-16, 사용자 요청: "조회조건에 연도가 복수선택이 안
    // 되네" → "지표 대시보드 전체로 확장"하기로 확정). "전체" 버튼(빈 배열)도 매출 대시보드와 같은
    // 의미 — 데이터에 있는 모든 연도를 합산해서 본다는 뜻이지, "아직 안 골랐음"이 아니다.
    function metricsSetupYearPills(containerId, onChange) {
      const container = document.getElementById(containerId);
      if (!container) return;
      if (!container.dataset.wired) {
        const years = [...new Set(metricsRevenueData.map(r => r.year))].sort((a, b) => b - a);
        container.innerHTML = `<button class="pill-btn" data-year="all">전체</button>` +
          years.map(y => `<button class="pill-btn" data-year="${y}">${y}년</button>`).join('');
        container.dataset.wired = '1';
        container.querySelectorAll('.pill-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const val = btn.getAttribute('data-year');
            if (val === 'all') metricsSelectedYears = [];
            else metricsSelectedYears = nextPillSelection(metricsSelectedYears, parseInt(val, 10), isAdditiveClick(e));
            metricsSyncYearPillActive(containerId);
            onChange();
          });
        });
      }
      metricsSyncYearPillActive(containerId); // 다른 화면에서 바뀐 값과 동기화(월 pill과 동일 원칙)
    }
    function metricsSyncYearPillActive(containerId) {
      const container = document.getElementById(containerId);
      if (!container) return;
      container.querySelectorAll('.pill-btn').forEach(btn => {
        const val = btn.getAttribute('data-year');
        btn.classList.toggle('active', val === 'all' ? metricsSelectedYears.length === 0 : metricsSelectedYears.includes(parseInt(val, 10)));
      });
    }
    function metricsSyncMonthPillActive(containerId) {
      const container = document.getElementById(containerId);
      if (!container) return;
      container.querySelectorAll('.pill-btn').forEach(btn => {
        const val = btn.getAttribute('data-month');
        btn.classList.toggle('active', val === 'all' ? metricsSelectedMonths.length === 0 : metricsSelectedMonths.includes(parseInt(val, 10)));
      });
    }
    // metricsMain의 #metricsMonthPills는 dashboard.html에 정적 마크업(전체+1~12월)이 이미 있어 그대로
    // 재사용하지만, 피벗 상세 화면들은 빈 컨테이너라 마크업 자체를 여기서 만든다(1~12월 버튼을 4번
    // 손으로 반복해 적어두지 않기 위해) — 둘 다 같은 함수로 처리한다(컨테이너에 버튼이 이미 있으면 생성을 건너뜀).
    function metricsSetupMonthPills(containerId, onChange) {
      const container = document.getElementById(containerId);
      if (!container) return;
      if (!container.dataset.wired) {
        if (!container.querySelector('.pill-btn')) {
          container.innerHTML = ['all', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
            .map(v => `<button class="pill-btn${v === 'all' ? ' active' : ''}" data-month="${v}">${v === 'all' ? '전체' : v + '월'}</button>`).join('');
        }
        container.dataset.wired = '1';
        container.querySelectorAll('.pill-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const val = btn.getAttribute('data-month');
            if (val === 'all') metricsSelectedMonths = [];
            else metricsSelectedMonths = nextPillSelection(metricsSelectedMonths, parseInt(val, 10), isAdditiveClick(e));
            metricsSyncMonthPillActive(containerId);
            onChange();
          });
        });
      }
      metricsSyncMonthPillActive(containerId); // 다른 화면에서 바뀐 값과 동기화(예: 상세에서 바꾸고 metricsMain으로 복귀)
    }
    function setupMetricsYearPills() { metricsSetupYearPills('metricsYearPills', renderMetricsDashboard); }
    function setupMetricsMonthPills() { metricsSetupMonthPills('metricsMonthPills', renderMetricsDashboard); }
    function syncMetricsMonthPillActive() { metricsSyncMonthPillActive('metricsMonthPills'); }

    // 매출 4개 + 지표 4개 피벗 상세 화면(view-router.js VIEW_CONFIG)의 공통 진입점 — 조회조건 pill과
    // ①②선택 체크박스를 전부 그 화면 전용 컨테이너(viewKey+'YearPills' 등)에 붙이고 프리셋을 그린다
    // (2026-09-16, 사용자 지적: "각 피벗테이블에서 이 상단조회는 메인 페이지에 있는 걸 같이 써야지.
    // 채널 확장하려고 해도 할 수가 없네" — 예전엔 연도/월 pill만 있고 ①②는 metricsMain에만 있어서
    // 피벗 화면 안에서는 채널 선택을 못 바꿨다).
    function renderMetricsPivotView(viewKey) {
      const rerender = () => renderMetricsPivotView(viewKey);
      metricsSetupYearPills(viewKey + 'YearPills', rerender);
      metricsSetupMonthPills(viewKey + 'MonthPills', rerender);
      metricsSetupOperatorCheckboxes(viewKey + 'OperatorCheckboxes', viewKey + 'CheckAllOperator', viewKey + 'LabelOperator', rerender);
      // channelCandidates(선택) — CPRP/채널시청률/eq-GRPs/광고주수 피벗은 이 지표에 실제 값이 있는
      // 채널만 후보로 좁힌 함수를 프리셋에 등록해 둔다(metrics-ratings.js) — 나머지(매출/M-S 4종)는
      // 미지정이라 기존처럼 "범위 안 사업자 전체의 모든 하위 채널"을 그대로 쓴다.
      const preset = PIVOT_PRESETS[viewKey];
      metricsSetupChannelCheckboxes(viewKey + 'ChannelCheckboxes', viewKey + 'CheckAllChannel', viewKey + 'LabelChannel', rerender, preset && preset.channelCandidates);
      renderPresetPivot(viewKey);
    }

    // ── ①사업자·②채널 멀티셀렉트(기존 .multi-dropdown 패턴 재사용, toggleMultiDropdown()은 data-loader.js가
    // 범용으로 이미 제공) — 서로 독립적으로 선택한다(2026-09-16, 사용자 요청: "사업자선택이랑 채널선택이
    // 자유롭지 않네? 그냥 이거 독립적으로 선택하게 하자" — 예전엔 ②후보가 ①에서 체크한 사업자에만
    // 캐스케이딩됐고, ①을 바꾸면 ②선택이 조용히 잘려나갔다). ②의 후보 목록은 "범위" 안 사업자 전체
    // (`metricsAllOperatorGroups()`)를 기준으로 하되, ①에서 실제로 뭘 체크했는지는 더 이상 안 본다.
    //
    // metricsMain과 8개 피벗 상세 화면이 전부 이 체크박스를 조작할 수 있어야 해서(위 renderMetricsPivotView()
    // 주석 참고), 연도/월 pill과 같은 원칙으로 containerId 3개(목록/전체선택/라벨) + onChange 콜백을
    // 받는 범용 버전으로 짰다 — inline onchange="..." HTML 문자열 대신 addEventListener로 콜백을 JS
    // 클로저 그대로 넘긴다(문자열로는 함수 참조를 못 넘기므로, 화면마다 다른 렌더 대상을 알려줄 방법이
    // 이것뿐이다). 후보 목록 자체가 매번 바뀔 수 있어(범위 토글 등) 매 렌더마다 innerHTML을 통째로
    // 새로 만든다 — 월 pill처럼 "한 번만 만들고 재사용"하지 않는다.
    function metricsSetupOperatorCheckboxes(listId, checkAllId, labelId, onChange) {
      const container = document.getElementById(listId); if (!container) return;
      const list = metricsAllOperatorGroups();
      container.innerHTML = list.map(op => `<label class="checkbox-item"><input type="checkbox" value="${op}" ${metricsSelectedOperators.includes(op) ? 'checked' : ''}> ${metricsOperatorDisplayName(op)}</label>`).join('');
      container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
          metricsSelectedOperators = Array.from(container.querySelectorAll('input:checked')).map(x => x.value);
          metricsSyncOperatorCheckboxHeader(checkAllId, labelId);
          onChange();
        });
      });
      const checkAll = document.getElementById(checkAllId);
      if (checkAll) {
        checkAll.onchange = () => {
          container.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = checkAll.checked);
          metricsSelectedOperators = Array.from(container.querySelectorAll('input:checked')).map(x => x.value);
          metricsSyncOperatorCheckboxHeader(checkAllId, labelId);
          onChange();
        };
      }
      metricsSyncOperatorCheckboxHeader(checkAllId, labelId);
    }
    function metricsSyncOperatorCheckboxHeader(checkAllId, labelId) {
      const list = metricsAllOperatorGroups();
      const checkAll = document.getElementById(checkAllId);
      if (checkAll) { const all = list.length > 0 && list.every(op => metricsSelectedOperators.includes(op)); checkAll.checked = all; checkAll.indeterminate = !all && metricsSelectedOperators.length > 0; }
      const label = document.getElementById(labelId);
      if (label) {
        const sel = metricsSelectedOperators.map(metricsOperatorDisplayName);
        label.innerText = sel.length === 0 ? '선택 없음' : sel.length <= 2 ? sel.join(', ') : `${sel.length}개 선택됨`;
      }
    }
    function setupMetricsOperatorCheckboxes() { metricsSetupOperatorCheckboxes('listMetricsOperatorCheckboxes', 'checkAllMetricsOperator', 'labelMetricsOperator', renderMetricsDashboard); }

    // candidatesFn(선택) — 지정 없으면 기존과 동일하게 "범위 안 사업자 전체의 모든 하위 채널"
    // (metricsChannelsForOperators(metricsAllOperatorGroups())). CPRP/채널시청률/eq-GRPs/광고주수
    // 피벗 4종은 이 지표에 실제 값이 있는 채널만 후보로 좁힌 함수를 넘긴다(2026-09-16, 사용자 지적:
    // "이 차트들에서도 예를들어 지금 값이 있는 채널들은 클릭하면 띄워줘야지" + "ENA DRAMA, tvN
    // DRAMA 등등 같은 것들도 말이야" — 미니차트 범례처럼 데이터 없는 채널은 아예 후보에서 빼되,
    // ENA DRAMA/tvN DRAMA 같은 대표채널 아닌 하위 채널도 값만 있으면 그대로 후보에 남긴다).
    function metricsSetupChannelCheckboxes(listId, checkAllId, labelId, onChange, candidatesFn) {
      const container = document.getElementById(listId); if (!container) return;
      const getList = candidatesFn || (() => metricsChannelsForOperators(metricsAllOperatorGroups()));
      const list = getList();
      container.innerHTML = list.map(ch => `<label class="checkbox-item"><input type="checkbox" value="${ch}" ${metricsSelectedChannels.includes(ch) ? 'checked' : ''}> ${ch}</label>`).join('');
      container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
          metricsSelectedChannels = Array.from(container.querySelectorAll('input:checked')).map(x => x.value);
          metricsSyncChannelCheckboxHeader(checkAllId, labelId, getList);
          onChange();
        });
      });
      const checkAll = document.getElementById(checkAllId);
      if (checkAll) {
        checkAll.onchange = () => {
          container.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = checkAll.checked);
          metricsSelectedChannels = Array.from(container.querySelectorAll('input:checked')).map(x => x.value);
          metricsSyncChannelCheckboxHeader(checkAllId, labelId, getList);
          onChange();
        };
      }
      metricsSyncChannelCheckboxHeader(checkAllId, labelId, getList);
    }
    function metricsSyncChannelCheckboxHeader(checkAllId, labelId, getList) {
      const list = (getList || (() => metricsChannelsForOperators(metricsAllOperatorGroups())))();
      const checkAll = document.getElementById(checkAllId);
      if (checkAll) { const all = list.length > 0 && list.every(ch => metricsSelectedChannels.includes(ch)); checkAll.checked = all; checkAll.indeterminate = !all && metricsSelectedChannels.length > 0; }
      const label = document.getElementById(labelId);
      if (label) {
        const sel = metricsSelectedChannels;
        label.innerText = sel.length === 0 ? '대표채널 자동' : sel.length <= 2 ? sel.join(', ') : `${sel.length}개 선택됨`;
      }
    }
    // onChange가 renderMetricsDashboard()(전체 재렌더)가 아니라 renderMetricsChannelDependentCharts()
    // (metrics-ratings.js, ②에 실제로 의존하는 미니차트 4개만)인 이유는 그 함수 주석 참고 — ②는
    // KPI·시장규모·M/S·매출 트렌드/랭킹 어느 것도 안 바꾸는데 전체를 다시 그리면 안 바뀐 차트까지
    // Chart.js가 destroy+재생성돼 인트로 애니메이션이 돌아 "값이 바뀐 줄" 헷갈리게 했다(2026-09-16,
    // 사용자 지적). 최초 렌더(페이지 진입 시 renderMetricsDashboard()가 이 함수를 호출하는 그 순간)는
    // onChange를 안 타므로 영향 없다 — 사용자가 실제로 ②를 조작할 때만 이 좁은 재렌더가 쓰인다.
    function setupMetricsChannelCheckboxes() { metricsSetupChannelCheckboxes('listMetricsChannelCheckboxes', 'checkAllMetricsChannel', 'labelMetricsChannel', renderMetricsChannelDependentCharts); }

    // metricsDetail 상세표 "③ 지표 선택"(metrics-ratings.js)만 아직 이 범용 함수를 쓴다 — ①②는
    // 위 metricsSetupXxxCheckboxes()가 각자 처리하므로 더 이상 여기서 다루지 않는다.
    function toggleAllMetricsCheckboxes(type, master) {
      const container = document.getElementById(`listMetrics${type}Checkboxes`);
      container.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = master.checked);
      onMetricsDetailMetricCheckboxChange();
    }

    // ------------------------------------------------------------
    // KPI 1·2·3 — 전체방송광고 시장규모(범위 'all' 고정) / 유료방송광고 시장규모(범위 'payTv' 고정) /
    // 유료방송광고시장 M/S(①선택 사업자 합 기준). 1·2번은 "범위" 토글과 무관하게 항상 같은 두
    // 스코프를 보여주기로 함(2026-09-15, 사용자 요청).
    //
    // **월 선택을 반영해 누적 합산한다**(2026-09-16, 사용자 지적 — "월선택 전체인데 1~9월로 안
    // 나오지? 9월만 같은데" + "KT ENA 숫자도 이상하네"). 예전엔 항상 `metricsLatestPeriod()`(최근
    // 단일 월)만 봐서, 위쪽 "월 선택" pill이 "전체"(1~9월)여도 9월 한 달치 스냅샷만 보여줬다 —
    // 매출 랭킹 차트가 이미 쓰고 있는 "선택된 모든 달 누적 합산" 패턴(`metricsMonthsInYear()`)을
    // 그대로 재사용한다. 단일 월만 선택했을 땐 이전과 동일(합계=그 달 값과 같음).
    // 전월비(MoM)는 여러 달을 합산한 상태에서는 "전월" 자체가 의미가 없어(9개월 누적의 직전 1개월과
    // 비교할 대상이 없음) 단일 월 선택일 때만 보여주고, 여러 달/전체 선택 시엔 배지를 숨긴다.
    // 전년비(YoY)는 누적 상태에서도 "같은 개월수의 전년 동기"와 비교하면 되므로 그대로 유지한다.
    // ------------------------------------------------------------
    function renderMetricsRevenueKpis() {
      const periods = metricsSelectedPeriods(metricsRevenueData);
      if (!periods.length) {
        ['MarketSizeAll', 'MarketSize', 'Share'].forEach(k => {
          document.getElementById(`metricsKpi${k}Value`).innerText = k === 'Share' ? '- %' : '- 억원';
          metricsRenderBadge(`metricsKpi${k}MomBadge`, '', null); metricsRenderBadge(`metricsKpi${k}YoyBadge`, '', null);
        });
        return;
      }
      const isRange = periods.length > 1;
      // 전년비(YoY)는 "선택 연도 하나"가 전제인 단일-앵커 기능이다(js/core/filters.js의 selectedYears
      // 단일-앵커 관례와 같은 원칙, 2026-09-16 "지표 대시보드 전체로 확장" 확정) — 여러 연도를 같이
      // 선택하면 "그 전년"이 어느 해를 가리키는지 모호해져 배지를 숨긴다. 전월비(MoM)는 원래도 여러
      // 기간(달) 선택 시 숨겼는데, 그 기준이 이제 "여러 달" 뿐 아니라 "여러 연도"도 포함한다(periods.length가
      // 그 둘을 이미 합쳐서 센다).
      const isMultiYear = metricsYearsInScope().length > 1;
      const periodLabel = metricsPeriodRangeLabel(periods);
      const latestPeriod = periods[periods.length - 1];
      const yoyPeriods = isMultiYear ? [] : periods.map(p => ({ year: p.year - 1, month: p.month }));

      const currAll = metricsMarketAndShareOverPeriods(periods, 'all');
      const momAll = isRange ? null : metricsMarketAndShareAt(metricsPrevMonthPeriod(latestPeriod), 'all');
      const yoyAll = isMultiYear ? null : metricsMarketAndShareOverPeriods(yoyPeriods, 'all');
      document.getElementById('metricsKpiMarketSizeAllValue').innerText = metricsFmtNum(currAll.market / 1e8, 2) + ' 억원';
      document.getElementById('metricsKpiMarketSizeAllSub').innerText = `${periodLabel} · 경쟁채널 지표 현황 파일 · 지상파+유료방송`;
      metricsRenderBadge('metricsKpiMarketSizeAllMomBadge', '전월', momAll && metricsGrowthPct(currAll.market, momAll.market), '%');
      metricsRenderBadge('metricsKpiMarketSizeAllYoyBadge', '전년', metricsGrowthPct(currAll.market, yoyAll && yoyAll.market), '%');

      const currPay = metricsMarketAndShareOverPeriods(periods, 'payTv');
      const momPay = isRange ? null : metricsMarketAndShareAt(metricsPrevMonthPeriod(latestPeriod), 'payTv');
      const yoyPay = isMultiYear ? null : metricsMarketAndShareOverPeriods(yoyPeriods, 'payTv');
      document.getElementById('metricsKpiMarketSizeValue').innerText = metricsFmtNum(currPay.market / 1e8, 2) + ' 억원';
      document.getElementById('metricsKpiMarketSizeSub').innerText = `${periodLabel} · 경쟁채널 지표 현황 파일 · 종편+케이블`;
      metricsRenderBadge('metricsKpiMarketSizeMomBadge', '전월', momPay && metricsGrowthPct(currPay.market, momPay.market), '%');
      metricsRenderBadge('metricsKpiMarketSizeYoyBadge', '전년', metricsGrowthPct(currPay.market, yoyPay && yoyPay.market), '%');

      // M/S는 KPI1·2와 달리 ①선택 사업자 합 기준(2026-09-16) — "시장"이 전체가 아니라 지금 고른
      // 사업자들의 합(ENA 포함)이라, 어떤 경쟁사를 고르느냐에 따라 값이 달라진다.
      const currSel = metricsSelectionMarketAndShareOverPeriods(periods);
      const momSel = isRange ? null : metricsSelectionMarketAndShareAt(metricsPrevMonthPeriod(latestPeriod));
      const yoySel = isMultiYear ? null : metricsSelectionMarketAndShareOverPeriods(yoyPeriods);
      document.getElementById('metricsKpiShareValue').innerText = currSel.share.toFixed(1) + ' %';
      document.getElementById('metricsKpiShareSub').innerText = `KT ENA(치환값) ${metricsFmtNum(currSel.ena / 1e8, 2)}억원 ÷ 선택 사업자 ${metricsSelectedOperators.length}개 합 ${metricsFmtNum(currSel.market / 1e8, 2)}억원 · ${periodLabel}`;
      metricsRenderBadge('metricsKpiShareMomBadge', '전월', momSel && metricsPointDiff(currSel.share, momSel.share), '%p');
      metricsRenderBadge('metricsKpiShareYoyBadge', '전년', metricsPointDiff(currSel.share, yoySel && yoySel.share), '%p');
    }

    // ------------------------------------------------------------
    // 방송광고시장 규모 추이 — 기본은 ①선택 사업자별로 쌓는다(2026-09-16 — "시장"·"비중"도 M/S와
    // 똑같이 ①선택을 따라야 한다는 지적). "사업자별/구분별" 토글(metricsMarketByScopeGrouping)로
    // 지상파/종편/케이블 구분별 스택도 볼 수 있다(2026-09-16, 사용자 요청: "기존처럼 지상파/종편/
    // 케이블 구분으로 볼 수 있는 거도 같이 있었으면 좋겠거든? 물론 선택된 사업자 기준이겠지") — 이
    // 구분별 뷰도 전체 시장이 아니라 ①선택 사업자만 그 소속 구분으로 묶어 집계한다. ENA는 강조색
    // (RC('curr')), 나머지는 서수 팔레트(seriesColor) — 매출 트렌드/랭킹차트와 동일한 색 규칙.
    // "비중" 모드(metricsMarketByScopeMode==='share')는 같은 구성을 월별 100% 누적으로 바꾼다.
    // ------------------------------------------------------------
    function renderMetricsMarketByScopeChart() {
      const canvas = document.getElementById('chartMetricsMarketByScope'); if (!canvas) return;
      if (chartInstances.metricsMarketByScope) { chartInstances.metricsMarketByScope.destroy(); chartInstances.metricsMarketByScope = null; }

      const periods = metricsSelectedPeriods(metricsRevenueData);
      const ops = metricsSelectedOperators;
      const isShare = metricsMarketByScopeMode === 'share';
      const byCategory = metricsMarketByScopeGrouping === 'category';
      if (!periods.length || !ops.length) { document.getElementById('metricsMarketByScopeChartTitle').innerText = '방송광고시장 규모 추이'; return; }
      const labels = periods.map(metricsPeriodLabel);

      // series: byCategory면 ①선택 사업자들이 실제로 속한 지상파/종편/케이블만(있는 것만) 지상파→
      // 종편→케이블 순서로(케이블이 배열 맨 끝 = 스택 맨 위, KT ENA가 속한 구분이라 이미 맨 위에 옴),
      // 아니면 사업자별로 ①선택 순서 그대로 — 단, KT ENA는 항상 배열 맨 끝(=스택 맨 위)에 오도록
      // 재배치한다(2026-09-16, 사용자 요청: "맨 위에 KT ENA를 놔줘" — Chart.js는 datasets 배열의
      // 마지막 항목을 스택 맨 위에 그린다). 색상은 원래 ①선택 순서(ENA가 맨 앞인 상태)를 기준으로
      // 먼저 배정한 뒤 배열만 stable sort로 옮겨서, 재배치 때문에 다른 사업자들의 색이 밀리지 않게 한다.
      let series;
      if (byCategory) {
        const presentCats = [...new Set(ops.map(op => METRICS_OPERATOR_SCOPE[op]).filter(Boolean))]
          .sort((a, b) => METRICS_SCOPE_ORDER[a] - METRICS_SCOPE_ORDER[b]);
        series = presentCats.map(cat => ({ key: cat, label: cat, color: metricsScopeCategoryColor(cat) }));
        document.getElementById('metricsMarketByScopeChartTitle').innerText = `방송광고시장 규모 추이 (${presentCats.join('/')}, 선택 사업자 기준)`;
      } else {
        // 색 인덱스는 원래 배열 위치(i)가 아니라 "ENA를 뺀 목록에서 몇 번째인지"로 매긴다 — i를
        // 그대로 쓰면 metricsCompetitorColor()의 (i%9)+1 순환에서 i=1과 i=10처럼 9씩 차이나는
        // 인덱스끼리 같은 나머지가 나와 서로 다른 두 사업자가 같은 색을 받는 충돌이 있었다
        // (2026-09-16, 사용자 지적 — "채널A랑 SBS미디어넷 거의 같은 색인데").
        const nonEnaOps = ops.filter(op => !metricsIsEnaName(op));
        series = ops.map(op => ({ key: op, label: metricsOperatorDisplayName(op), color: metricsIsEnaName(op) ? RC('curr') : metricsCompetitorColor(nonEnaOps.indexOf(op)), isEna: metricsIsEnaName(op) }));
        series.sort((a, b) => (a.isEna === b.isEna) ? 0 : (a.isEna ? 1 : -1)); // stable — ENA만 맨 끝으로, 나머지 상대 순서 유지
        document.getElementById('metricsMarketByScopeChartTitle').innerText = `방송광고시장 규모 추이 (선택 사업자 ${ops.length}개 합)`;
      }

      const dataBySeries = series.map(() => []);
      periods.forEach(p => {
        const groups = metricsGroupRevenueMap(p, 'all'); // 선택 자체가 이미 범위 안에서 고른 것 — 이중 필터링 안 함
        const valueByKey = {};
        if (byCategory) {
          series.forEach(s => { valueByKey[s.key] = 0; });
          ops.forEach(op => { const cat = METRICS_OPERATOR_SCOPE[op]; if (cat && valueByKey.hasOwnProperty(cat)) valueByKey[cat] += (groups[op] || 0); });
        } else {
          ops.forEach(op => { valueByKey[op] = groups[op] || 0; });
        }
        const monthTotal = series.reduce((s, ser) => s + valueByKey[ser.key], 0);
        series.forEach((ser, i) => {
          const v = valueByKey[ser.key];
          dataBySeries[i].push(isShare ? (monthTotal > 0 ? (v / monthTotal * 100) : 0) : (v / 1e8));
        });
      });

      const ctx = canvas.getContext('2d');
      chartInstances.metricsMarketByScope = new Chart(ctx, {
        type: 'bar',
        data: {
          labels, datasets: series.map((ser, i) => ({
            label: ser.label, data: dataBySeries[i], backgroundColor: ddBarFill(ser.color), borderRadius: 0, _isEna: !!ser.isEna, ...ddStackSeparator(),
            // "비중" 모드는 각 스택 구간 안에 그 구간의 %를 직접 라벨로 넣는다(2026-09-16, 사용자 요청:
            // "비중에는 차트 내부에 몇 %인지 데이터레이블 넣어줄래?"). 구간이 너무 얇으면(5% 미만) 글자가
            // 삐져나오거나 겹쳐서 아예 생략 — "금액" 모드의 합계 라벨(스택 맨 위에만, 막대 밖 표시)과는
            // 성격이 달라 분기를 완전히 나눴다.
            datalabels: isShare ? {
              display: (dctx) => (dctx.dataset.data[dctx.dataIndex] || 0) >= 5,
              anchor: 'center', align: 'center', color: '#fff', font: { size: 12, weight: FW() },
              formatter: (value) => value.toFixed(0) + '%'
            } : {
              // 합계 라벨은 스택 맨 위 계열 하나에만 붙인다(js/features/trend-portfolio-channel.js와 동일 패턴).
              display: (ctx) => i === series.length - 1,
              anchor: 'end', align: 'top', offset: 4, color: dataLabelTextColor(), font: { size: 13, weight: FW() },
              formatter: (value, ctx) => { let total = 0; ctx.chart.data.datasets.forEach(ds => { total += ds.data[ctx.dataIndex] || 0; }); return total > 0 ? metricsFmtNum(total, 1) + '억' : ''; }
            }
          }))
        },
        options: {
          responsive: true, maintainAspectRatio: false, layout: { padding: { top: 16 } },
          plugins: { legend: { display: true, position: 'top', labels: { color: CH('#B0B8C1'), font: { size: 14, weight: FW() }, generateLabels: metricsLegendGenerateLabels } },
            tooltip: { callbacks: { label: (c) => isShare ? `${c.dataset.label}: ${c.raw.toFixed(1)}%` : `${c.dataset.label}: ${metricsFmtNum(c.raw, 2)} 억원` } } },
          scales: { x: { stacked: true, offset: true, ticks: { color: CH('#F2F4F6'), font: { size: 14, weight: FW() } }, grid: { display: false } },
            y: ddValueAxis({ stacked: true, max: isShare ? 100 : undefined, ticks: { color: CH('#8B95A1'), maxTicksLimit: 5, padding: 6, font: { size: 14, weight: FW() }, callback: v => isShare ? v + '%' : metricsFmtNum(v, 0) + '억' } }) }
        }
      });
    }

    // ------------------------------------------------------------
    // KT ENA M/S 트렌드 — 꺾은선. ①선택 사업자 합 기준 M/S(%)를 보여준다(2026-09-16 — 왼쪽 시장규모
    // 차트·KPI3와 같은 기준으로 통일, computeEnaSelectionMarketShare() 참고).
    // ------------------------------------------------------------
    function renderMetricsMarketShareChart() {
      const canvas = document.getElementById('chartMetricsMarketShare'); if (!canvas) return;
      if (chartInstances.metricsMs) { chartInstances.metricsMs.destroy(); chartInstances.metricsMs = null; }
      document.getElementById('metricsMsChartTitle').innerText = `KT ENA M/S (선택 사업자 ${metricsSelectedOperators.length}개 기준)`;

      const periods = metricsSelectedPeriods(metricsRevenueData);
      if (!periods.length) return;
      const labels = periods.map(metricsPeriodLabel);
      const shareVals = periods.map(p => computeEnaSelectionMarketShare(p.year, p.month).share);

      const ctx = canvas.getContext('2d');
      chartInstances.metricsMs = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [
          { label: 'M/S', data: shareVals, borderColor: RC('curr'), backgroundColor: RC('curr'), fill: false, tension: 0.3, borderWidth: 3, pointRadius: 3,
            datalabels: { display: 'auto', anchor: 'end', align: 'top', color: dataLabelTextColor(), font: { size: 13, weight: FW() }, formatter: (v) => v.toFixed(1) + '%' } }
        ] },
        options: {
          responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24 } },
          plugins: { legend: { display: false },
            tooltip: { callbacks: { label: (c) => `M/S: ${c.raw.toFixed(2)}%` } } },
          // offset:true — 선 그래프는 기본이 false라 첫/끝 점이 y축·플롯 경계에 딱 붙어 보인다(사용자
          // 지적, 2026-09-15). 막대 그래프의 기본 여백처럼 양쪽에 카테고리 반 칸만큼 띄운다.
          scales: { x: { offset: true, ticks: { color: CH('#F2F4F6'), font: { size: 14, weight: FW() } }, grid: { display: false } },
            y: ddValueAxis({ ticks: { color: CH('#8B95A1'), maxTicksLimit: 5, padding: 6, font: { size: 14, weight: FW() }, callback: v => v + '%' } }) }
        }
      });
    }

    // ------------------------------------------------------------
    // 매출 트렌드(라인, 비교단위별) / 매출 랭킹(가로막대, 선택 항목 강조)
    // ------------------------------------------------------------
    function metricsIsEnaName(name) { return name === ENA_CHANNEL_GROUP || name === ENA_REPRESENTATIVE_CHANNEL; }
    // 모든 지표 대시보드 차트의 범례에서 KT ENA(또는 대표채널 'ENA')를 항상 맨 앞에 오도록 재배치
    // (2026-09-16, 사용자 요청: "모든 차트에서 범례는 KT ENA가 가장 앞에 나오도록"). 실제 datasets
    // 배열 순서(스택 차트는 "ENA가 스택 맨 위" 요구 때문에 배열 맨 끝에 온다 — 위 renderMetricsMarketByScopeChart
    // 참고)는 그대로 두고, 범례 항목만 안정 정렬(stable sort)로 옮긴다 — 각 데이터셋에 미리 붙여둔
    // `_isEna` 플래그로 판별(라벨 텍스트는 채널/사업자마다 표시 이름이 달라 파싱하기 불안정하다).
    function metricsLegendGenerateLabels(chart) {
      const items = Chart.defaults.plugins.legend.labels.generateLabels(chart);
      items.sort((a, b) => {
        const aEna = !!(chart.data.datasets[a.datasetIndex] && chart.data.datasets[a.datasetIndex]._isEna);
        const bEna = !!(chart.data.datasets[b.datasetIndex] && chart.data.datasets[b.datasetIndex]._isEna);
        return (aEna === bEna) ? 0 : (aEna ? -1 : 1);
      });
      return items;
    }
    // KT ENA 전용 경쟁사 팔레트 — 왜 theme-system.js의 서수 팔레트(seriesColor(), 10색)를 그대로 못
    // 쓰는지: 그 팔레트의 0번이 KT ENA 전용 강조색 RC('curr')과 같은 계열의 파랑이라 빼야 했는데,
    // 그러면 9색밖에 안 남는다 — File1 사업자는 최대 14개(ENA 포함, "지상파+유료방송" 범위 선택
    // 시)라 ENA를 뺀 비ENA가 최대 13개까지 나올 수 있고, 9색으로는 부족해 몇 번째와 아홉 번째
    // 뒤 항목이 반드시 겹친다(2026-09-16, 실제로 발생 — "채널A랑 SBS미디어넷 거의 같은 색인데,
    // 파란색은 KT ENA 하나만 쓰자"는 요구와 "9개 넘으면 색이 부족하다"는 두 요구를 함께 만족하려면
    // 이 화면 전용으로 최소 13색이 필요하다). 그래서 서수 팔레트를 재활용하는 대신 파랑(180~245°)을
    // 통째로 비워 둔 13색 전용 팔레트를 새로 둔다 — 색상환을 고르게 나눠 서로 최소 20°+ 떨어뜨렸다.
    // **배열 순서는 색상환 순서(빨주노초파남보)가 아니다** — 처음엔 hue 오름차순으로 배열했더니
    // 인덱스가 인접한 사업자끼리(즉 화면에 나란히 뜨는 경우가 많은 항목끼리) 색상환에서도 이웃이라
    // 여러 개를 같이 보면 "무지개"로 읽혔다(2026-09-16, 사용자 지적 — "채도 명도는 그대로인게
    // 좋은데 너무 빨주노초파남보로 배열이 돼있어서 그런 거 같기도 해"). 같은 13개 hue를 그대로 두고
    // "12개 중 5번째씩 건너뛰기"(gcd(5,12)=1)로 순서만 섞어, 배열에서 인접한 두 색이 색상환에서는
    // 항상 116° 이상(맨 끝→처음 순환 포함) 떨어지도록 재배치했다 — 값은 하나도 안 바뀌었다.
    const METRICS_COMPETITOR_PALETTE_LIGHT = ['#E78B74','#59CF6D','#E378CE','#B9D85A','#8B8AE5','#FFB347','#6AD7AA','#FF758F','#76CF59','#B88AE5','#FFDC52','#68C8D9','#B2B5B8'];
    const METRICS_COMPETITOR_PALETTE_DARK  = ['#E76240','#30CF4B','#E147C2','#AED831','#5D5AE2','#FFA629','#43D698','#FF5271','#58CF30','#9E5AE2','#FFD429','#41C1D8','#93999F'];
    // ⚠ 호출부 주의: i는 반드시 "ENA를 뺀 목록"에서 0부터 매긴 인덱스여야 한다(원래 배열 위치를
    // 그대로 넘기면 안 됨 — ENA가 차지한 자리만큼 인덱스가 밀려 있어 다른 계열끼리 겹칠 수 있다).
    // `list.filter(x => !isEna(x)).indexOf(x)` 패턴으로 다시 매긴 인덱스를 넘길 것.
    function metricsCompetitorColor(i) {
      const pal = currentTheme === 'light' ? METRICS_COMPETITOR_PALETTE_LIGHT : METRICS_COMPETITOR_PALETTE_DARK;
      return pal[i % pal.length];
    }

    // 선형/로그 축 토글 — CJ ENM처럼 압도적으로 큰 사업자가 하나 섞이면 선형축에서 나머지가 전부
    // 바닥에 뭉개져 보인다(사용자 지적, 2026-09-15). "로그"는 값 자체(억원)는 그대로 두고 축 간격만
    // 로그로 압축해 큰/작은 계열을 한 차트에서 같이 비교할 수 있게 한다 — 로그축은 0 이하 값을 그릴 수
    // 없으므로(Chart.js 제약) 그 달에 매출이 0인 계열의 점은 로그 모드에서 안 그려질 수 있다(선형
    // 모드로 돌리면 정상적으로 0으로 보인다 — 데이터 손실이 아니라 표시 방식의 한계).
    function setMetricsRevenueTrendScale(mode) {
      metricsRevenueTrendScale = mode;
      document.getElementById('btnMetricsRevenueTrendLinear').classList.toggle('active', mode === 'linear');
      document.getElementById('btnMetricsRevenueTrendLog').classList.toggle('active', mode === 'log');
      renderMetricsRevenueTrendChart();
    }
    // 매출(File1 "01.방송사업자 광고매출")은 사업자 단위로만 존재한다(세부채널 분해가 없음) — 그래서
    // 트렌드/랭킹 두 차트는 "비교단위"(사업자/대표채널) 토글과 무관하게 항상 ①에서 선택된 사업자
    // 기준으로 그린다. 그 토글은 CPRP/채널시청률/eq-GRPs/광고주수 미니 트렌드에만 영향을 준다
    // (metricsRatingsChannelSelection() 참고, 2026-09-16).
    function renderMetricsRevenueTrendChart() {
      const canvas = document.getElementById('chartMetricsRevenueTrend'); if (!canvas) return;
      if (chartInstances.metricsRevTrend) { chartInstances.metricsRevTrend.destroy(); chartInstances.metricsRevTrend = null; }
      const periods = metricsSelectedPeriods(metricsRevenueData);
      const labels = periods.map(metricsPeriodLabel);
      const names = metricsSelectedOperators;
      const isLog = metricsRevenueTrendScale === 'log';
      const nonEnaNames = names.filter(n => !metricsIsEnaName(n)); // metricsCompetitorColor() 색 충돌 방지(아래 참고)

      const datasets = names.map((name) => {
        const data = periods.map(p => {
          const v = (metricsGroupRevenueMap(p, metricsScopeMode)[name] || 0) / 1e8;
          return isLog && v <= 0 ? null : v; // 로그축은 0 이하를 못 그린다 — null이면 spanGaps로 선만 이어준다.
        });
        const color = metricsIsEnaName(name) ? RC('curr') : metricsCompetitorColor(nonEnaNames.indexOf(name));
        return { label: metricsOperatorDisplayName(name), data, borderColor: color, backgroundColor: color, fill: false, tension: 0.3, borderWidth: metricsIsEnaName(name) ? 3 : 2, pointRadius: 3, pointBackgroundColor: color, spanGaps: true, _isEna: metricsIsEnaName(name) };
      });

      const ctx = canvas.getContext('2d');
      chartInstances.metricsRevTrend = new Chart(ctx, {
        type: 'line', data: { labels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24 } },
          plugins: { legend: { display: true, position: 'top', labels: { color: CH('#B0B8C1'), font: { size: 13, weight: FW() }, generateLabels: metricsLegendGenerateLabels } },
            tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${metricsFmtNum(c.raw, 2)} 억원` } } },
          // grace:0 — 매출은 음수가 될 수 없는데 ddValueAxis() 기본값(grace:15%)이 데이터 최솟값(0
          // 근처) 아래로도 15% 여유를 대칭으로 붙여, Chart.js가 "예쁜 간격"을 고르는 과정에서 축이
          // -100억부터 시작해버렸다(사용자 지적, 2026-09-16: "얘는 -100억부터 있는 이유가 뭐야") —
          // 매출 랭킹 차트(아래 renderMetricsRevenueRankingChart)가 이미 같은 이유로 grace:0을 쓰고
          // 있었다. 로그축은 애초에 0 이하를 그릴 수 없어 이 문제가 없으므로 기본값을 그대로 둔다.
          scales: { x: { offset: true, ticks: { color: CH('#F2F4F6'), font: { size: 13, weight: FW() } }, grid: { display: false } },
            y: ddValueAxis({ type: isLog ? 'logarithmic' : 'linear', grace: isLog ? '15%' : 0, ticks: { color: CH('#8B95A1'), maxTicksLimit: isLog ? 8 : 5, padding: 6, font: { size: 13, weight: FW() }, callback: v => metricsFmtNum(v, 0) + '억' } }) }
        }
      });
    }

    // "조회조건"(위 연도/월 선택)이 여러 기간을 가리키면(예: "전체" = 1~9월, 또는 여러 연도) 랭킹도
    // 그 기간 누적 합계로 집계한다 — 예전엔 항상 "최신 1개월"만 봤는데, 월 선택이 "전체"인데 랭킹은
    // 9월 한 달만 나오는 게 조회조건과 안 맞아 보인다는 지적(2026-09-15)을 받아 수정. 단일 월만
    // 선택했을 땐 이전과 동일하게 그 한 달만 보여준다(합계=그 달 값과 같음). 제목 포맷은
    // metricsPeriodRangeLabel(periods)(위 공용 헬퍼 절)로 통일.
    function renderMetricsRevenueRankingChart() {
      const canvas = document.getElementById('chartMetricsRevenueRanking'); if (!canvas) return;
      if (chartInstances.metricsRevRank) { chartInstances.metricsRevRank.destroy(); chartInstances.metricsRevRank = null; }
      const periods = metricsSelectedPeriods(metricsRevenueData);
      // 어느 기간을 보고 있는지 화면에 안 보이면(범례도 꺼져 있다) 조회조건(위쪽 연도/월 선택)과
      // 맞는지 확인할 방법이 없다 — 제목에 실제 기준 기간을 박아 넣는다(사용자 지적, 2026-09-15).
      const titleEl = document.getElementById('metricsRevenueRankingChartTitle');
      if (titleEl) titleEl.innerText = periods.length ? `매출 랭킹 (${metricsPeriodRangeLabel(periods)})` : '매출 랭킹';
      if (!periods.length) return;
      // 매출은 사업자 단위로만 존재한다 — "비교단위" 토글과 무관하게 항상 ①선택 사업자 기준(위 트렌드
      // 차트와 동일한 이유, 2026-09-16).
      const selected = new Set(metricsSelectedOperators);

      const sums = {};
      periods.forEach(p => {
        const groups = metricsGroupRevenueMap(p, metricsScopeMode);
        Object.keys(groups).forEach(g => { sums[g] = (sums[g] || 0) + groups[g]; });
      });
      const entries = Object.entries(sums).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const names = entries.map(e => e[0]);
      const labels = names.map(metricsOperatorDisplayName);
      const values = entries.map(e => e[1] / 1e8);
      const colors = names.map(name => (metricsIsEnaName(name) || selected.has(name)) ? RC('curr') : RC('ref'));

      const ctx = canvas.getContext('2d');
      chartInstances.metricsRevRank = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: metricsPeriodRangeLabel(periods) + ' 매출', data: values,
          backgroundColor: (c) => ddBarFill(colors[c.dataIndex], true)(c), borderRadius: 4,
          datalabels: { display: 'auto', anchor: 'end', align: 'right', offset: 4, color: dataLabelTextColor(), font: { size: 13, weight: FW() }, formatter: (v) => v > 0 ? metricsFmtNum(v, 1) + '억' : '' } }] },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24, right: 44 } },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.label}: ${metricsFmtNum(c.raw, 2)} 억원` } } },
          scales: { x: ddValueAxis({ grace: 0, ticks: { color: CH('#8B95A1'), maxTicksLimit: 7, padding: 6, font: { size: 13, weight: FW() }, callback: v => metricsFmtNum(v, 0) + '억' } }), y: { ticks: { color: CH('#F2F4F6'), font: { size: 13, weight: FW() } }, grid: { display: false } } }
        }
      });
    }

    // ------------------------------------------------------------
    // 오케스트레이션 — VIEW_CONFIG.metricsMain.render()의 진입점(view-router.js)
    // ------------------------------------------------------------
    function renderMetricsDashboard() {
      const loadingEl = document.getElementById('metricsLoadingMessage');
      const errorEl = document.getElementById('metricsErrorMessage');
      const bodyEl = document.getElementById('metricsContentBody');

      const loadingTextEl = document.getElementById('metricsLoadingMessageText');
      if (!metricsDataLoaded) {
        loadingTextEl.innerText = '경쟁채널 지표 데이터를 불러오는 중입니다…';
        loadingEl.style.display = 'flex'; errorEl.style.display = 'none'; bodyEl.style.display = 'none';
        fetchMetricsDataHttp()
          .then(() => { if (currentView === 'metricsMain') renderMetricsDashboard(); })
          .catch(err => {
            loadingEl.style.display = 'none';
            errorEl.style.display = ''; errorEl.innerText = '경쟁채널 지표 데이터를 불러오지 못했습니다: ' + (err && err.message ? err.message : err);
          });
        return;
      }
      if (!rawData || rawData.length === 0) {
        // 자사(ENA) 매출 치환에 rawData(메인 매출 데이터셋)가 필요하다 — 정상 흐름이면 부팅 시 이미
        // 로드돼 있지만(plan 확정사항), 극단적으로 먼저 열린 경우를 위해 짧게 대기 후 재시도한다.
        loadingTextEl.innerText = '매출 데이터 로딩 중…'; loadingEl.style.display = 'flex'; bodyEl.style.display = 'none';
        setTimeout(() => { if (currentView === 'metricsMain') renderMetricsDashboard(); }, 1500);
        return;
      }

      loadingEl.style.display = 'none'; errorEl.style.display = 'none'; bodyEl.style.display = 'flex';

      renderMetricsDataAsOfLabel();

      // 취급고/회계는 이 탭 전용 상태가 없이 전역 revenueBasisMode를 그대로 공유한다(위 "컨트롤
      // 핸들러" 절 참고) — 메인 대시보드 쪽 버튼으로 바뀐 채 이 탭을 다시 열거나 렌더가 다시 도는
      // 경우를 대비해, 렌더할 때마다 최신 값 기준으로 KT ENA 부분을 다시 계산하고(metrics-data-loader.js)
      // 이 탭 버튼의 active 표시도 그 값에 맞춰 다시 동기화한다.
      rebuildMetricsSubstitution();
      document.getElementById('btnMetricsBasisPerformance').classList.toggle('active', revenueBasisMode === 'performance');
      document.getElementById('btnMetricsBasisAccounting').classList.toggle('active', revenueBasisMode === 'accounting');

      metricsEnsureDefaultSelections();
      setupMetricsYearPills();
      setupMetricsMonthPills();
      syncMetricsMonthPillActive();
      setupMetricsOperatorCheckboxes();
      setupMetricsChannelCheckboxes();

      renderMetricsRevenueKpis();
      renderMetricsRatingsKpis();          // metrics-ratings.js
      renderMetricsMarketByScopeChart();
      renderMetricsMarketShareChart();
      renderMetricsRevenueTrendChart();
      renderMetricsRevenueRankingChart();
      renderMetricsCprpTrendChart();        // metrics-ratings.js
      renderMetricsRatingTrendChart();      // metrics-ratings.js
      renderMetricsGrpTrendChart();         // metrics-ratings.js
      renderMetricsAdvCountTrendChart();    // metrics-ratings.js
    }
