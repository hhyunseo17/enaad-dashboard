// ============================================================
// js/features/metrics-dashboard.js
// 지표 대시보드(경쟁채널 벤치마크) — 매출/M-S 쪽: 컨트롤바, KPI 1·2(시장규모/M-S), M/S 트렌드(누적막대),
// 매출 트렌드(라인)/랭킹(가로막대), 사업자·채널 캐스케이딩 멀티셀렉트, 오케스트레이션(renderMetricsDashboard()).
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
    function metricsScopeLabel(scopeMode) {
      const mode = scopeMode || metricsScopeMode;
      return mode === 'all' ? '지상파+유료방송' : mode === 'cable' ? '케이블' : '유료방송';
    }

    // 데이터에 실제로 있는 (연도 내) 월 목록 — 오름차순. metricsSelectedMonths(월 선택 pill, 비어있으면
    // 전체)로 좁힌다 — 매출 대시보드의 selectedMonths와 같은 원칙, 이 탭 전용 상태라 전역과 분리.
    function metricsMonthsInYear(rows, year) {
      const months = [...new Set(rows.filter(r => r.year === year).map(r => r.month))].sort((a, b) => a - b);
      return metricsSelectedMonths.length > 0 ? months.filter(m => metricsSelectedMonths.includes(m)) : months;
    }
    // 그 연도의 가장 최근 월. 없으면 null.
    function metricsLatestPeriod(rows, year) {
      const months = metricsMonthsInYear(rows, year);
      return months.length ? { year, month: months[months.length - 1] } : null;
    }
    function metricsPrevMonthPeriod(p) {
      if (!p) return null;
      return p.month === 1 ? { year: p.year - 1, month: 12 } : { year: p.year, month: p.month - 1 };
    }
    function metricsPrevYearPeriod(p) { return p ? { year: p.year - 1, month: p.month } : null; }

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
    function metricsRenderBadge(elId, label, value, unit) {
      const el = document.getElementById(elId);
      if (!el) return;
      if (value === null || value === undefined || !isFinite(value)) { el.style.display = 'none'; return; }
      el.style.display = 'inline-flex';
      el.className = 'badge-growth ' + (value >= 0 ? 'up' : 'down');
      el.innerText = `${label} ${value >= 0 ? '+' : ''}${value.toFixed(1)}${unit} ${value >= 0 ? '▲' : '▼'}`;
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

    // M/S 공식(plan 확정사항): ENA 사업자 총합(치환값) ÷ "범위" 토글이 가리키는 시장 총매출 × 100.
    function computeEnaPayTvMarketShare(year, month, scopeMode) {
      const groups = metricsGroupRevenueMap({ year, month }, scopeMode || metricsScopeMode);
      const market = Object.values(groups).reduce((s, v) => s + v, 0);
      const ena = groups[ENA_CHANNEL_GROUP] || 0;
      return { market, ena, share: market > 0 ? (ena / market * 100) : 0 };
    }
    function metricsMarketAndShareAt(period, scopeMode) { return period ? computeEnaPayTvMarketShare(period.year, period.month, scopeMode) : null; }

    // ------------------------------------------------------------
    // ① 사업자 / ② 채널 후보 목록 — File1(경쟁채널 지표 현황) 하나로 통일(2026-09-16).
    // ------------------------------------------------------------
    function metricsAllOperatorGroups() {
      const set = new Set();
      metricsRevenueData.filter(r => metricsScopeMatchRow(r, metricsScopeMode)).forEach(r => set.add(r.channelGroup));
      return [...set].sort((a, b) => (a === ENA_CHANNEL_GROUP ? -1 : b === ENA_CHANNEL_GROUP ? 1 : a.localeCompare(b, 'ko')));
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
    // 매출까지 전부 File1 하나뿐이라 그 문제 자체가 없어졌다). "대표채널 비교"(metricsCompareUnit
    // ==='channel')면 실제로 선택된 개별 채널(②)을, "사업자 비교"면 각 사업자의 대표채널(①의 첫
    // 번째 하위 채널, 없으면 사업자명 자체 — CPRP·시청률 같은 비율 지표는 사업자 내 여러 채널 값을
    // 더하거나 평균낼 수 없어 하나로 근사한다)을 쓴다.
    function metricsRatingsChannelSelection() {
      if (metricsCompareUnit === 'channel' && metricsSelectedChannels.length > 0) return metricsSelectedChannels;
      return metricsSelectedOperators.map(metricsRepresentativeChannel);
    }

    // 첫 렌더에서만 기본값을 채운다(사용자가 이미 고른 선택은 건드리지 않는다).
    function metricsEnsureDefaultSelections() {
      if (metricsSelectedYear === null) {
        const years = [...new Set(metricsRevenueData.map(r => r.year))];
        metricsSelectedYear = years.length ? Math.max(...years) : new Date().getFullYear();
      }
      if (metricsSelectedOperators.length === 0) {
        // 최근 단일 월(metricsLatestPeriod) 스냅샷으로 랭킹을 매기면 File2가 아직 마감 전인 달(예:
        // 9월)엔 KT ENA를 제외한 전 채널그룹이 0원 플레이스홀더라 "동률 0원" 임의 순서로 top4가
        // 뽑히는 버그가 있었다(2026-09-16, 사용자 지적 — 기본 선택된 사업자가 실제 매출 순위와
        // 무관해 보이고, 거기서 캐스케이딩되는 ②채널 목록도 같이 이상해짐). renderMetricsRevenueRankingChart()와
        // 동일하게 연중 누적 합산으로 랭킹을 매겨 마감 전 0원 달의 영향을 없앤다.
        const months = metricsMonthsInYear(metricsRevenueData, metricsSelectedYear);
        const sums = {};
        months.forEach(m => {
          const groups = metricsGroupRevenueMap({ year: metricsSelectedYear, month: m }, metricsScopeMode);
          Object.keys(groups).forEach(g => { sums[g] = (sums[g] || 0) + groups[g]; });
        });
        const ranked = Object.entries(sums).filter(([g, v]) => g !== ENA_CHANNEL_GROUP && v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4).map(e => e[0]);
        metricsSelectedOperators = [ENA_CHANNEL_GROUP, ...ranked];
      }
      if (metricsCompareUnit === 'channel' && metricsSelectedChannels.length === 0) {
        metricsSelectedChannels = metricsChannelsForOperators(metricsSelectedOperators).slice(0, 5);
      }
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
      renderMetricsDashboard();
    }
    function setMetricsMarketByScopeMode(mode) {
      metricsMarketByScopeMode = mode;
      document.getElementById('btnMetricsScopeChartAmount').classList.toggle('active', mode === 'amount');
      document.getElementById('btnMetricsScopeChartShare').classList.toggle('active', mode === 'share');
      renderMetricsMarketByScopeChart();
    }
    function setMetricsCompareUnit(unit) {
      metricsCompareUnit = unit;
      document.getElementById('btnMetricsCompareOperator').classList.toggle('active', unit === 'operator');
      document.getElementById('btnMetricsCompareChannel').classList.toggle('active', unit === 'channel');
      const chBtn = document.getElementById('btnMetricsChannelDropdown');
      if (chBtn) chBtn.disabled = unit !== 'channel';
      if (unit === 'channel' && metricsSelectedChannels.length === 0) metricsSelectedChannels = metricsChannelsForOperators(metricsSelectedOperators).slice(0, 5);
      renderMetricsDashboard();
    }

    function setupMetricsYearPills() {
      const container = document.getElementById('metricsYearPills');
      if (!container) return;
      const years = [...new Set(metricsRevenueData.map(r => r.year))].sort((a, b) => b - a);
      container.innerHTML = years.map(y => `<button class="pill-btn${y === metricsSelectedYear ? ' active' : ''}" data-year="${y}">${y}년</button>`).join('');
      container.querySelectorAll('.pill-btn').forEach(btn => {
        btn.addEventListener('click', () => { metricsSelectedYear = parseInt(btn.getAttribute('data-year'), 10); renderMetricsDashboard(); });
      });
    }

    // 월 선택 — dashboard.html에 정적 마크업(전체+1~12월, 매출 대시보드 #monthPills와 동일 구조)이라
    // 매번 다시 그릴 필요 없이 클릭 핸들러만 한 번 붙인다(container.dataset.wired로 중복 바인딩 방지).
    // nextPillSelection()/isAdditiveClick()은 js/core/filters.js의 기존 범용 헬퍼 재사용.
    function setupMetricsMonthPills() {
      const container = document.getElementById('metricsMonthPills');
      if (!container || container.dataset.wired) return;
      container.dataset.wired = '1';
      container.querySelectorAll('.pill-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const val = btn.getAttribute('data-month');
          if (val === 'all') metricsSelectedMonths = [];
          else metricsSelectedMonths = nextPillSelection(metricsSelectedMonths, parseInt(val, 10), isAdditiveClick(e));
          syncMetricsMonthPillActive();
          renderMetricsDashboard();
        });
      });
    }
    function syncMetricsMonthPillActive() {
      const container = document.getElementById('metricsMonthPills');
      if (!container) return;
      container.querySelectorAll('.pill-btn').forEach(btn => {
        const val = btn.getAttribute('data-month');
        btn.classList.toggle('active', val === 'all' ? metricsSelectedMonths.length === 0 : metricsSelectedMonths.includes(parseInt(val, 10)));
      });
    }

    // ── ①사업자 → ②채널 캐스케이딩 멀티셀렉트(기존 .multi-dropdown 패턴 재사용, toggleMultiDropdown()은 data-loader.js가 범용으로 이미 제공) ──
    function renderMetricsOperatorCheckboxes() {
      const container = document.getElementById('listMetricsOperatorCheckboxes'); if (!container) return;
      const list = metricsAllOperatorGroups();
      container.innerHTML = list.map(op => `<label class="checkbox-item"><input type="checkbox" value="${op}" onchange="onMetricsOperatorCheckboxChange()" ${metricsSelectedOperators.includes(op) ? 'checked' : ''}> ${metricsOperatorDisplayName(op)}</label>`).join('');
      const checkAll = document.getElementById('checkAllMetricsOperator');
      if (checkAll) { const all = list.length > 0 && list.every(op => metricsSelectedOperators.includes(op)); checkAll.checked = all; checkAll.indeterminate = !all && metricsSelectedOperators.length > 0; }
    }
    function onMetricsOperatorCheckboxChange() {
      const container = document.getElementById('listMetricsOperatorCheckboxes');
      metricsSelectedOperators = Array.from(container.querySelectorAll('input:checked')).map(cb => cb.value);
      const validChannels = new Set(metricsChannelsForOperators(metricsSelectedOperators));
      metricsSelectedChannels = metricsSelectedChannels.filter(c => validChannels.has(c)); // ②는 ①에 캐스케이딩
      renderMetricsDashboard();
    }
    function renderMetricsChannelCheckboxes() {
      const container = document.getElementById('listMetricsChannelCheckboxes'); if (!container) return;
      const list = metricsChannelsForOperators(metricsSelectedOperators);
      container.innerHTML = list.map(ch => `<label class="checkbox-item"><input type="checkbox" value="${ch}" onchange="onMetricsChannelCheckboxChange()" ${metricsSelectedChannels.includes(ch) ? 'checked' : ''}> ${ch}</label>`).join('');
      const checkAll = document.getElementById('checkAllMetricsChannel');
      if (checkAll) { const all = list.length > 0 && list.every(ch => metricsSelectedChannels.includes(ch)); checkAll.checked = all; checkAll.indeterminate = !all && metricsSelectedChannels.length > 0; }
    }
    function onMetricsChannelCheckboxChange() {
      const container = document.getElementById('listMetricsChannelCheckboxes');
      metricsSelectedChannels = Array.from(container.querySelectorAll('input:checked')).map(cb => cb.value);
      renderMetricsDashboard();
    }
    function toggleAllMetricsCheckboxes(type, master) {
      const container = document.getElementById(`listMetrics${type}Checkboxes`);
      container.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = master.checked);
      if (type === 'Operator') onMetricsOperatorCheckboxChange(); else onMetricsChannelCheckboxChange();
    }
    function updateMetricsDropdownLabel(type) {
      const label = document.getElementById(`labelMetrics${type}`); if (!label) return;
      if (type === 'Channel' && metricsCompareUnit !== 'channel') { label.innerText = '전체(사업자 총합)'; return; }
      const sel = type === 'Operator' ? metricsSelectedOperators.map(metricsOperatorDisplayName) : metricsSelectedChannels;
      if (sel.length === 0) label.innerText = '선택 없음';
      else if (sel.length <= 2) label.innerText = sel.join(', ');
      else label.innerText = `${sel.length}개 선택됨`;
    }

    // ------------------------------------------------------------
    // KPI 1·2·3 — 전체방송광고 시장규모(범위 'all' 고정) / 유료방송광고 시장규모(범위 'payTv' 고정) /
    // 유료방송광고시장 M/S(범위 'payTv' 고정). 세 카드 모두 "범위" 토글과 무관하게 항상 같은 두 스코프를
    // 보여주기로 함(2026-09-15, 사용자 요청) — 그 아래 매출 트렌드/랭킹·M/S 트렌드 차트는 기존처럼
    // "범위" 토글(metricsScopeMode)을 그대로 따른다. 스코프가 코드에서 고정되므로 제목도 정적(HTML)이다.
    // ------------------------------------------------------------
    function renderMetricsRevenueKpis() {
      const period = metricsLatestPeriod(metricsRevenueData, metricsSelectedYear);
      if (!period) {
        ['MarketSizeAll', 'MarketSize', 'Share'].forEach(k => {
          document.getElementById(`metricsKpi${k}Value`).innerText = k === 'Share' ? '- %' : '- 억원';
          metricsRenderBadge(`metricsKpi${k}MomBadge`, '', null); metricsRenderBadge(`metricsKpi${k}YoyBadge`, '', null);
        });
        return;
      }
      const currAll = metricsMarketAndShareAt(period, 'all');
      const momAll = metricsMarketAndShareAt(metricsPrevMonthPeriod(period), 'all');
      const yoyAll = metricsMarketAndShareAt(metricsPrevYearPeriod(period), 'all');
      document.getElementById('metricsKpiMarketSizeAllValue').innerText = metricsFmtNum(currAll.market / 1e8, 2) + ' 억원';
      document.getElementById('metricsKpiMarketSizeAllSub').innerText = `${period.year}년 ${period.month}월 · 경쟁채널 지표 현황 파일 · 지상파+유료방송`;
      metricsRenderBadge('metricsKpiMarketSizeAllMomBadge', '전월', metricsGrowthPct(currAll.market, momAll && momAll.market), '%');
      metricsRenderBadge('metricsKpiMarketSizeAllYoyBadge', '전년', metricsGrowthPct(currAll.market, yoyAll && yoyAll.market), '%');

      const currPay = metricsMarketAndShareAt(period, 'payTv');
      const momPay = metricsMarketAndShareAt(metricsPrevMonthPeriod(period), 'payTv');
      const yoyPay = metricsMarketAndShareAt(metricsPrevYearPeriod(period), 'payTv');
      document.getElementById('metricsKpiMarketSizeValue').innerText = metricsFmtNum(currPay.market / 1e8, 2) + ' 억원';
      document.getElementById('metricsKpiMarketSizeSub').innerText = `${period.year}년 ${period.month}월 · 경쟁채널 지표 현황 파일 · 종편+케이블`;
      metricsRenderBadge('metricsKpiMarketSizeMomBadge', '전월', metricsGrowthPct(currPay.market, momPay && momPay.market), '%');
      metricsRenderBadge('metricsKpiMarketSizeYoyBadge', '전년', metricsGrowthPct(currPay.market, yoyPay && yoyPay.market), '%');

      document.getElementById('metricsKpiShareValue').innerText = currPay.share.toFixed(1) + ' %';
      document.getElementById('metricsKpiShareSub').innerText = `KT ENA(치환값) ${metricsFmtNum(currPay.ena / 1e8, 2)}억원 ÷ 유료방송 시장 ${metricsFmtNum(currPay.market / 1e8, 2)}억원`;
      metricsRenderBadge('metricsKpiShareMomBadge', '전월', metricsPointDiff(currPay.share, momPay && momPay.share), '%p');
      metricsRenderBadge('metricsKpiShareYoyBadge', '전년', metricsPointDiff(currPay.share, yoyPay && yoyPay.share), '%p');
    }

    // ------------------------------------------------------------
    // 방송광고시장 규모 추이 — "범위" 토글(metricsScopeMode)이 가리키는 구분만 쌓는다(2026-09-15,
    // 사용자 요청 — 예전엔 범위와 무관하게 지상파/종편/케이블 셋을 항상 다 보여줬으나, 위쪽 조회조건과
    // 안 맞다는 지적으로 범위에 맞춰 좁힌다). 색은 카테고리별로 고정 인덱스를 써서 범위가 바뀌어도
    // (예: 유료방송→케이블) 같은 카테고리가 항상 같은 색을 유지한다.
    // 그룹별로 자기참조 행 우선/세부채널 합산 폴백을 쓰는 metricsGroupRevenueMap()을 그대로 재사용해
    // 중복 합산을 피한다(같은 그룹을 자기참조 총합 + 세부채널로 두 번 더하지 않음).
    // "비중" 모드(metricsMarketByScopeMode==='share')는 같은 카테고리 구성을 월별 100% 누적으로 바꿔
    // "범위 안에서 각 구분이 차지하는 비중이 달에 따라 어떻게 바뀌는지"를 보여준다.
    // ------------------------------------------------------------
    const METRICS_SCOPE_CATEGORIES = ['지상파', '종편', '케이블'];
    const METRICS_SCOPE_CATEGORY_COLOR_INDEX = { '지상파': 0, '종편': 1, '케이블': 2 };
    function metricsScopeCategoriesForMode(scopeMode) {
      if (scopeMode === 'cable') return ['케이블'];
      if (scopeMode === 'all') return METRICS_SCOPE_CATEGORIES;
      return ['종편', '케이블']; // 'payTv' 기본값
    }
    function renderMetricsMarketByScopeChart() {
      const canvas = document.getElementById('chartMetricsMarketByScope'); if (!canvas) return;
      if (chartInstances.metricsMarketByScope) { chartInstances.metricsMarketByScope.destroy(); chartInstances.metricsMarketByScope = null; }

      const months = metricsMonthsInYear(metricsRevenueData, metricsSelectedYear);
      const categories = metricsScopeCategoriesForMode(metricsScopeMode);
      const isShare = metricsMarketByScopeMode === 'share';
      document.getElementById('metricsMarketByScopeChartTitle').innerText = `방송광고시장 규모 추이 (${categories.join('/')})`;
      if (!months.length) return;
      const labels = months.map(m => `${m}월`);

      // 채널그룹 → scope(지상파/종편/케이블) 조회용 — 그룹당 행 하나만 있으면 되므로 캐시.
      const scopeByGroup = {};
      metricsRevenueData.forEach(r => { if (!scopeByGroup[r.channelGroup]) scopeByGroup[r.channelGroup] = r.scope; });

      const dataByCat = categories.map(() => []);
      months.forEach(m => {
        const groups = metricsGroupRevenueMap({ year: metricsSelectedYear, month: m }, metricsScopeMode); // 위 컨트롤바의 "범위" 토글 그대로 반영
        const catTotal = {}; categories.forEach(c => { catTotal[c] = 0; });
        Object.keys(groups).forEach(g => {
          const cat = scopeByGroup[g];
          if (cat && catTotal.hasOwnProperty(cat)) catTotal[cat] += groups[g];
        });
        const monthTotal = categories.reduce((s, c) => s + catTotal[c], 0);
        categories.forEach((cat, i) => {
          dataByCat[i].push(isShare ? (monthTotal > 0 ? (catTotal[cat] / monthTotal * 100) : 0) : (catTotal[cat] / 1e8));
        });
      });

      const colors = categories.map(cat => seriesColor(METRICS_SCOPE_CATEGORY_COLOR_INDEX[cat]));
      const ctx = canvas.getContext('2d');
      chartInstances.metricsMarketByScope = new Chart(ctx, {
        type: 'bar',
        data: {
          labels, datasets: categories.map((cat, i) => ({
            label: cat, data: dataByCat[i], backgroundColor: ddBarFill(colors[i]), borderRadius: 0, ...ddStackSeparator(),
            datalabels: isShare ? { display: false } : {
              // 합계 라벨은 스택 맨 위 계열 하나에만 붙인다(js/features/trend-portfolio-channel.js와 동일 패턴).
              display: (ctx) => cat === categories[categories.length - 1],
              anchor: 'end', align: 'top', offset: 4, color: dataLabelTextColor(), font: { size: 12, weight: FW() },
              formatter: (value, ctx) => { let total = 0; ctx.chart.data.datasets.forEach(ds => { total += ds.data[ctx.dataIndex] || 0; }); return total > 0 ? metricsFmtNum(total, 1) + '억' : ''; }
            }
          }))
        },
        options: {
          responsive: true, maintainAspectRatio: false, layout: { padding: { top: 16 } },
          plugins: { legend: { display: true, position: 'top', labels: { color: CH('#B0B8C1'), font: { size: 13, weight: FW() } } },
            tooltip: { callbacks: { label: (c) => isShare ? `${c.dataset.label}: ${c.raw.toFixed(1)}%` : `${c.dataset.label}: ${metricsFmtNum(c.raw, 2)} 억원` } } },
          scales: { x: { stacked: true, offset: true, ticks: { color: CH('#F2F4F6'), font: { size: 13, weight: FW() } }, grid: { display: false } },
            y: ddValueAxis({ stacked: true, max: isShare ? 100 : undefined, ticks: { color: CH('#8B95A1'), maxTicksLimit: 5, padding: 6, callback: v => isShare ? v + '%' : metricsFmtNum(v, 0) + '억' } }) }
        }
      });
    }

    // ------------------------------------------------------------
    // KT ENA M/S 트렌드 — 꺾은선. "범위" 토글이 가리키는 시장 기준 M/S(%)만 보여준다
    // (왼쪽 시장규모 차트는 지상파/종편/케이블 고정 3분류, 이쪽은 범위 토글에 따라 달라짐).
    // ------------------------------------------------------------
    function renderMetricsMarketShareChart() {
      const canvas = document.getElementById('chartMetricsMarketShare'); if (!canvas) return;
      if (chartInstances.metricsMs) { chartInstances.metricsMs.destroy(); chartInstances.metricsMs = null; }
      document.getElementById('metricsMsChartTitle').innerText = `KT ENA M/S 트렌드 (${metricsScopeLabel()})`;

      const months = metricsMonthsInYear(metricsRevenueData, metricsSelectedYear);
      if (!months.length) return;
      const labels = months.map(m => `${m}월`);
      const shareVals = months.map(m => computeEnaPayTvMarketShare(metricsSelectedYear, m, metricsScopeMode).share);

      const ctx = canvas.getContext('2d');
      chartInstances.metricsMs = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [
          { label: 'M/S', data: shareVals, borderColor: RC('curr'), backgroundColor: RC('curr'), fill: false, tension: 0.3, borderWidth: 3, pointRadius: 3,
            datalabels: { display: 'auto', anchor: 'end', align: 'top', color: dataLabelTextColor(), font: { size: 11, weight: FW() }, formatter: (v) => v.toFixed(1) + '%' } }
        ] },
        options: {
          responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24 } },
          plugins: { legend: { display: false },
            tooltip: { callbacks: { label: (c) => `M/S: ${c.raw.toFixed(2)}%` } } },
          // offset:true — 선 그래프는 기본이 false라 첫/끝 점이 y축·플롯 경계에 딱 붙어 보인다(사용자
          // 지적, 2026-09-15). 막대 그래프의 기본 여백처럼 양쪽에 카테고리 반 칸만큼 띄운다.
          scales: { x: { offset: true, ticks: { color: CH('#F2F4F6'), font: { size: 13, weight: FW() } }, grid: { display: false } },
            y: ddValueAxis({ ticks: { color: CH('#8B95A1'), maxTicksLimit: 5, padding: 6, callback: v => v + '%' } }) }
        }
      });
    }

    // ------------------------------------------------------------
    // 매출 트렌드(라인, 비교단위별) / 매출 랭킹(가로막대, 선택 항목 강조)
    // ------------------------------------------------------------
    function metricsIsEnaName(name) { return name === ENA_CHANNEL_GROUP || name === ENA_REPRESENTATIVE_CHANNEL; }

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
      const months = metricsMonthsInYear(metricsRevenueData, metricsSelectedYear);
      const labels = months.map(m => `${m}월`);
      const names = metricsSelectedOperators;
      const isLog = metricsRevenueTrendScale === 'log';

      const datasets = names.map((name, idx) => {
        const data = months.map(m => {
          const v = (metricsGroupRevenueMap({ year: metricsSelectedYear, month: m }, metricsScopeMode)[name] || 0) / 1e8;
          return isLog && v <= 0 ? null : v; // 로그축은 0 이하를 못 그린다 — null이면 spanGaps로 선만 이어준다.
        });
        const color = metricsIsEnaName(name) ? RC('curr') : seriesColor(idx);
        return { label: metricsOperatorDisplayName(name), data, borderColor: color, backgroundColor: color, fill: false, tension: 0.3, borderWidth: metricsIsEnaName(name) ? 3 : 2, pointRadius: 3, pointBackgroundColor: color, spanGaps: true };
      });

      const ctx = canvas.getContext('2d');
      chartInstances.metricsRevTrend = new Chart(ctx, {
        type: 'line', data: { labels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24 } },
          plugins: { legend: { display: true, position: 'top', labels: { color: CH('#B0B8C1'), font: { size: 12, weight: FW() } } },
            tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${metricsFmtNum(c.raw, 2)} 억원` } } },
          scales: { x: { offset: true, ticks: { color: CH('#F2F4F6'), font: { size: 12, weight: FW() } }, grid: { display: false } },
            y: ddValueAxis({ type: isLog ? 'logarithmic' : 'linear', ticks: { color: CH('#8B95A1'), maxTicksLimit: isLog ? 8 : 5, padding: 6, callback: v => metricsFmtNum(v, 0) + '억' } }) }
        }
      });
    }

    // "조회조건"(위 연도/월 선택)이 여러 달을 가리키면(예: "전체" = 1~9월) 랭킹도 그 기간 누적
    // 합계로 집계한다 — 예전엔 항상 "최신 1개월"만 봤는데, 월 선택이 "전체"인데 랭킹은 9월 한 달만
    // 나오는 게 조회조건과 안 맞아 보인다는 지적(2026-09-15)을 받아 수정. 단일 월만 선택했을 땐
    // 이전과 동일하게 그 한 달만 보여준다(합계=그 달 값과 같음).
    function metricsPeriodRangeLabel(year, months) {
      if (months.length === 0) return '';
      if (months.length === 1) return `${year}년 ${months[0]}월`;
      const isContiguous = months.every((m, i) => i === 0 || m === months[i - 1] + 1);
      return isContiguous ? `${year}년 ${months[0]}~${months[months.length - 1]}월 누적` : `${year}년 ${months.join(',')}월 누적`;
    }
    function renderMetricsRevenueRankingChart() {
      const canvas = document.getElementById('chartMetricsRevenueRanking'); if (!canvas) return;
      if (chartInstances.metricsRevRank) { chartInstances.metricsRevRank.destroy(); chartInstances.metricsRevRank = null; }
      const months = metricsMonthsInYear(metricsRevenueData, metricsSelectedYear);
      // 어느 기간을 보고 있는지 화면에 안 보이면(범례도 꺼져 있다) 조회조건(위쪽 연도/월 선택)과
      // 맞는지 확인할 방법이 없다 — 제목에 실제 기준 기간을 박아 넣는다(사용자 지적, 2026-09-15).
      const titleEl = document.getElementById('metricsRevenueRankingChartTitle');
      if (titleEl) titleEl.innerText = months.length ? `매출 랭킹 (${metricsPeriodRangeLabel(metricsSelectedYear, months)})` : '매출 랭킹';
      if (!months.length) return;
      // 매출은 사업자 단위로만 존재한다 — "비교단위" 토글과 무관하게 항상 ①선택 사업자 기준(위 트렌드
      // 차트와 동일한 이유, 2026-09-16).
      const selected = new Set(metricsSelectedOperators);

      const sums = {};
      months.forEach(m => {
        const groups = metricsGroupRevenueMap({ year: metricsSelectedYear, month: m }, metricsScopeMode);
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
        data: { labels, datasets: [{ label: metricsPeriodRangeLabel(metricsSelectedYear, months) + ' 매출', data: values,
          backgroundColor: (c) => ddBarFill(colors[c.dataIndex], true)(c), borderRadius: 4,
          datalabels: { display: 'auto', anchor: 'end', align: 'right', offset: 4, color: dataLabelTextColor(), font: { size: 11, weight: FW() }, formatter: (v) => v > 0 ? metricsFmtNum(v, 1) + '억' : '' } }] },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24, right: 44 } },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.label}: ${metricsFmtNum(c.raw, 2)} 억원` } } },
          scales: { x: ddValueAxis({ grace: 0, ticks: { color: CH('#8B95A1'), maxTicksLimit: 7, padding: 6, callback: v => metricsFmtNum(v, 0) + '억' } }), y: { ticks: { color: CH('#F2F4F6'), font: { weight: FW() } }, grid: { display: false } } }
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

      if (!metricsDataLoaded) {
        loadingEl.innerText = '경쟁채널 지표 데이터를 불러오는 중입니다…';
        loadingEl.style.display = ''; errorEl.style.display = 'none'; bodyEl.style.display = 'none';
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
        loadingEl.innerText = '매출 데이터 로딩 중…'; loadingEl.style.display = ''; bodyEl.style.display = 'none';
        setTimeout(() => { if (currentView === 'metricsMain') renderMetricsDashboard(); }, 1500);
        return;
      }

      loadingEl.style.display = 'none'; errorEl.style.display = 'none'; bodyEl.style.display = 'flex';

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
      renderMetricsOperatorCheckboxes();
      renderMetricsChannelCheckboxes();
      updateMetricsDropdownLabel('Operator');
      updateMetricsDropdownLabel('Channel');

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
      renderMetricsDetailTeaser();          // metrics-ratings.js
    }
