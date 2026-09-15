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

    // "범위" 토글이 가리키는 File2 행 매칭. 사업자대분류/사업자중분류는 이미 원본에 있는 컬럼이라
    // 별도 재분류 없이 그대로 필터링한다(plan 확정사항).
    function metricsScopeMatchRow(row, scopeMode) {
      const mode = scopeMode || metricsScopeMode;
      if (mode === 'all') return true;
      if (mode === 'cable') return row.operatorMid === '케이블';
      return row.operatorMajor === '유료방송'; // 'payTv' 기본값
    }
    function metricsScopeLabel(scopeMode) {
      const mode = scopeMode || metricsScopeMode;
      return mode === 'all' ? '지상파+유료방송' : mode === 'cable' ? '케이블' : '유료방송';
    }

    // 데이터에 실제로 있는 (연도 내) 월 목록 — 오름차순.
    function metricsMonthsInYear(rows, year) {
      return [...new Set(rows.filter(r => r.year === year).map(r => r.month))].sort((a, b) => a - b);
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
    // 다른 지표다(추측했던 "같은 지표의 INDEX 분화"가 아니었다). GRP 트렌드는 CPRP·채널시청률과
    // 같은 "1일 단위" 성격으로 맞추기 위해 07을 쓴다. 공백은 원본에서 항목마다 들쭉날쭉하다(예:
    // "채널 시청률"엔 공백이 있고 "채널시청률 1%당 eq-GRPs"엔 없다, "1% 당"처럼 %뒤에도 공백이 있다) —
    // 그래서 비교 전에 공백을 전부 제거한다. 그래도 "채널 시청률"(03)은 공백만 지우면 "채널시청률
    // 1%당 eq-GRPs"(08)의 접두어와 겹치므로, rating만 부분일치가 아니라 완전일치로 찾는다.
    const METRICS_LABEL = { rating: '채널시청률', cprp: 'CPRP', revPerRating: '시청률1%당매출', grp: '1일eq-GRPs' };
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
    // File2(매체별 광고비 raw) 채널그룹 집계 — M/S·시장규모·매출 트렌드/랭킹이 공유
    // ------------------------------------------------------------
    // 채널그룹별 월 매출 총합 맵. File2에 채널그룹 자기참조 총합 행(channel===channelGroup)이
    // 있으면 그 값을 쓰고(KT ENA는 metrics-data-loader.js가 항상 보장), 없는 경쟁 그룹은 그
    // 그룹에 속한 세부 채널 행을 직접 합산한다(데이터 agent가 File2 실제 스키마를 검증하지 못해
    // 자기참조 행의 존재 여부가 그룹마다 다를 수 있다는 전제로 양쪽 다 대응 — docs 참고).
    function metricsGroupRevenueMap(period, scopeMode) {
      const periodRows = metricsRevenueData.filter(r => r.year === period.year && r.month === period.month && metricsScopeMatchRow(r, scopeMode));
      const selfRef = {}; const seenSelfRef = new Set(); const summed = {};
      periodRows.forEach(r => {
        summed[r.channelGroup] = (summed[r.channelGroup] || 0) + r.revenue;
        if (r.channel === r.channelGroup) { selfRef[r.channelGroup] = (selfRef[r.channelGroup] || 0) + r.revenue; seenSelfRef.add(r.channelGroup); }
      });
      const out = Object.assign({}, selfRef);
      Object.keys(summed).forEach(g => { if (!seenSelfRef.has(g)) out[g] = summed[g]; });
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
    // ① 사업자 / ② 채널 후보 목록 — File2에서 동적으로 뽑는다(실 채널그룹명을 하드코딩하지 않는다).
    // ------------------------------------------------------------
    function metricsAllOperatorGroups() {
      const set = new Set();
      metricsRevenueData.filter(r => metricsScopeMatchRow(r, metricsScopeMode)).forEach(r => set.add(r.channelGroup));
      return [...set].sort((a, b) => (a === ENA_CHANNEL_GROUP ? -1 : b === ENA_CHANNEL_GROUP ? 1 : a.localeCompare(b, 'ko')));
    }
    // 선택된 사업자(들)에 속한 개별 채널 후보. 세부 채널이 없고 자기참조 총합 행만 있는 사업자는
    // 그 자기참조 채널명 자체를 유일한 "채널" 후보로 남긴다(예: 1채널짜리 지상파).
    function metricsChannelsForOperators(ops) {
      const set = new Set();
      metricsRevenueData.forEach(r => { if (ops.includes(r.channelGroup) && r.channel !== r.channelGroup) set.add(r.channel); });
      ops.forEach(op => { if (!metricsRevenueData.some(r => r.channelGroup === op && r.channel !== r.channelGroup)) set.add(op); });
      return [...set].sort((a, b) => a.localeCompare(b, 'ko'));
    }
    // File1(경쟁채널 지표 현황)은 채널그룹 개념이 없다(개별 채널명만 있다) — 그래서 CPRP/채널시청률/
    // eq-GRPs 차트·상세표는 비교단위가 '사업자'여도 채널명 직접 선택으로 좁힌다: ENA는 항상 대표채널
    // ENA로 고정하고, 나머지는 '대표채널 비교' 선택을 그대로 쓰거나(② 선택 시) '사업자 비교'에서는
    // 사업자명(File2 채널그룹)이 File1의 채널명과 완전히 일치하는 것만 자동으로 잡는다.
    // 실 샘플로 확인됨(2026-09-15) — 표기가 달라 완전일치가 안 되는 주요 사업자 5개는 별도 매핑:
    // MBC/SBS는 File1이 "MBC(전국)"/"SBS(민방포함)"로 적고, MBC PLUS·CJENM은 대소문자·공백만 다르다.
    // SBS미디어넷은 File1에 사업자 단위 행 자체가 없어 대표 채널 하나(SBS Plus)로 근사한다 — 이건
    // 진짜 매핑이 아니라 근사치이므로 실제로 SBS미디어넷 전체를 대표하는지 사람이 확인 필요.
    const OPERATOR_TO_RATINGS_CHANNEL_ALIAS = {
      'MBC': 'MBC(전국)', 'SBS': 'SBS(민방포함)', 'MBC PLUS': 'MBC Plus', 'CJENM': 'CJ ENM', 'SBS미디어넷': 'SBS Plus'
    };
    function metricsRatingsChannelSelection() {
      const set = new Set([ENA_REPRESENTATIVE_CHANNEL]);
      if (metricsCompareUnit === 'channel') {
        metricsSelectedChannels.forEach(c => set.add(c));
      } else {
        const ratingChannels = new Set(metricsRatingsData.map(r => r.channel));
        metricsSelectedOperators.forEach(op => {
          if (op === ENA_CHANNEL_GROUP) return;
          const mapped = OPERATOR_TO_RATINGS_CHANNEL_ALIAS[op] || op;
          if (ratingChannels.has(mapped)) set.add(mapped);
        });
      }
      return [...set];
    }

    // 첫 렌더에서만 기본값을 채운다(사용자가 이미 고른 선택은 건드리지 않는다).
    function metricsEnsureDefaultSelections() {
      if (metricsSelectedYear === null) {
        const years = [...new Set(metricsRevenueData.map(r => r.year))];
        metricsSelectedYear = years.length ? Math.max(...years) : new Date().getFullYear();
      }
      if (metricsSelectedOperators.length === 0) {
        const period = metricsLatestPeriod(metricsRevenueData, metricsSelectedYear);
        const groups = period ? metricsGroupRevenueMap(period, metricsScopeMode) : {};
        const ranked = Object.entries(groups).filter(([g]) => g !== ENA_CHANNEL_GROUP).sort((a, b) => b[1] - a[1]).slice(0, 4).map(e => e[0]);
        metricsSelectedOperators = [ENA_CHANNEL_GROUP, ...ranked];
      }
      if (metricsCompareUnit === 'channel' && metricsSelectedChannels.length === 0) {
        metricsSelectedChannels = metricsChannelsForOperators(metricsSelectedOperators).slice(0, 5);
      }
    }

    // ------------------------------------------------------------
    // 컨트롤 핸들러
    // ------------------------------------------------------------
    function setMetricsBasisMode(mode) {
      metricsBasisMode = mode;
      document.getElementById('btnMetricsBasisPerformance').classList.toggle('active', mode === 'performance');
      document.getElementById('btnMetricsBasisAccounting').classList.toggle('active', mode === 'accounting');
      rebuildMetricsSubstitution(mode); // metrics-data-loader.js — KT ENA 부분만 다시 계산
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

    // ── ①사업자 → ②채널 캐스케이딩 멀티셀렉트(기존 .multi-dropdown 패턴 재사용, toggleMultiDropdown()은 data-loader.js가 범용으로 이미 제공) ──
    function renderMetricsOperatorCheckboxes() {
      const container = document.getElementById('listMetricsOperatorCheckboxes'); if (!container) return;
      const list = metricsAllOperatorGroups();
      container.innerHTML = list.map(op => `<label class="checkbox-item"><input type="checkbox" value="${op}" onchange="onMetricsOperatorCheckboxChange()" ${metricsSelectedOperators.includes(op) ? 'checked' : ''}> ${op}</label>`).join('');
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
      const sel = type === 'Operator' ? metricsSelectedOperators : metricsSelectedChannels;
      if (sel.length === 0) label.innerText = '선택 없음';
      else if (sel.length <= 2) label.innerText = sel.join(', ');
      else label.innerText = `${sel.length}개 선택됨`;
    }

    // ------------------------------------------------------------
    // KPI 1·2 — [범위]광고시장 규모 / [범위]광고시장 M/S
    // ------------------------------------------------------------
    function renderMetricsRevenueKpis() {
      const scopeLabel = metricsScopeLabel();
      document.getElementById('metricsKpiMarketSizeTitle').innerText = `${scopeLabel} 광고시장 규모`;
      document.getElementById('metricsKpiShareTitle').innerText = `${scopeLabel} 광고시장 M/S`;

      const period = metricsLatestPeriod(metricsRevenueData, metricsSelectedYear);
      if (!period) {
        document.getElementById('metricsKpiMarketSizeValue').innerText = '- 억원';
        document.getElementById('metricsKpiShareValue').innerText = '- %';
        ['MarketSize', 'Share'].forEach(k => { metricsRenderBadge(`metricsKpi${k}MomBadge`, '', null); metricsRenderBadge(`metricsKpi${k}YoyBadge`, '', null); });
        return;
      }
      const curr = metricsMarketAndShareAt(period);
      const momV = metricsMarketAndShareAt(metricsPrevMonthPeriod(period));
      const yoyV = metricsMarketAndShareAt(metricsPrevYearPeriod(period));

      document.getElementById('metricsKpiMarketSizeValue').innerText = (curr.market / 1e8).toFixed(2) + ' 억원';
      document.getElementById('metricsKpiMarketSizeSub').innerText = `${period.year}년 ${period.month}월 · 매체별 광고비 raw 파일`;
      metricsRenderBadge('metricsKpiMarketSizeMomBadge', '전월', metricsGrowthPct(curr.market, momV && momV.market), '%');
      metricsRenderBadge('metricsKpiMarketSizeYoyBadge', '전년', metricsGrowthPct(curr.market, yoyV && yoyV.market), '%');

      document.getElementById('metricsKpiShareValue').innerText = curr.share.toFixed(1) + ' %';
      document.getElementById('metricsKpiShareSub').innerText = `KT ENA(치환값) ${(curr.ena / 1e8).toFixed(2)}억원 ÷ 시장 ${(curr.market / 1e8).toFixed(2)}억원`;
      metricsRenderBadge('metricsKpiShareMomBadge', '전월', metricsPointDiff(curr.share, momV && momV.share), '%p');
      metricsRenderBadge('metricsKpiShareYoyBadge', '전년', metricsPointDiff(curr.share, yoyV && yoyV.share), '%p');
    }

    // ------------------------------------------------------------
    // M/S 트렌드 — 누적(stacked) 막대. KT ENA(강조) + 기타(범위 내 나머지 합), % 라벨은 ENA 구간 위에.
    // ------------------------------------------------------------
    function renderMetricsMarketShareChart() {
      const canvas = document.getElementById('chartMetricsMarketShare'); if (!canvas) return;
      if (chartInstances.metricsMs) { chartInstances.metricsMs.destroy(); chartInstances.metricsMs = null; }
      document.getElementById('metricsMsChartTitle').innerText = `M/S 트렌드 (${metricsScopeLabel()})`;

      const months = metricsMonthsInYear(metricsRevenueData, metricsSelectedYear);
      if (!months.length) return;
      const labels = months.map(m => `${m}월`);
      const enaVals = [], otherVals = [], shareVals = [];
      months.forEach(m => {
        const r = computeEnaPayTvMarketShare(metricsSelectedYear, m, metricsScopeMode);
        enaVals.push(r.ena / 1e8); otherVals.push((r.market - r.ena) / 1e8); shareVals.push(r.share);
      });

      const ctx = canvas.getContext('2d');
      chartInstances.metricsMs = new Chart(ctx, {
        type: 'bar',
        data: {
          labels, datasets: [
            { label: 'KT ENA', data: enaVals, backgroundColor: ddBarFill(RC('curr')), borderRadius: 0, ...ddStackSeparator(),
              datalabels: { display: 'auto', color: '#FFFFFF', font: { size: 11, weight: FW() }, anchor: 'center', align: 'center', formatter: (v, c) => v > 0 ? shareVals[c.dataIndex].toFixed(1) + '%' : '' } },
            { label: '기타', data: otherVals, backgroundColor: ddBarFill(RC('ref')), borderRadius: 0, ...ddStackSeparator() }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24 } },
          plugins: { legend: { display: true, position: 'top', labels: { color: CH('#B0B8C1'), font: { size: 13, weight: FW() } } },
            tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.raw.toFixed(2)} 억원` } } },
          scales: { x: { stacked: true, ticks: { color: CH('#F2F4F6'), font: { size: 13, weight: FW() } }, grid: { display: false } },
            y: ddValueAxis({ stacked: true, ticks: { color: CH('#8B95A1'), maxTicksLimit: 5, padding: 6, callback: v => v + '억' } }) }
        }
      });
    }

    // ------------------------------------------------------------
    // 매출 트렌드(라인, 비교단위별) / 매출 랭킹(가로막대, 선택 항목 강조)
    // ------------------------------------------------------------
    function metricsIsEnaName(name) { return name === ENA_CHANNEL_GROUP || name === ENA_REPRESENTATIVE_CHANNEL; }

    function renderMetricsRevenueTrendChart() {
      const canvas = document.getElementById('chartMetricsRevenueTrend'); if (!canvas) return;
      if (chartInstances.metricsRevTrend) { chartInstances.metricsRevTrend.destroy(); chartInstances.metricsRevTrend = null; }
      const months = metricsMonthsInYear(metricsRevenueData, metricsSelectedYear);
      const labels = months.map(m => `${m}월`);
      const isOperator = metricsCompareUnit === 'operator';
      const names = isOperator ? metricsSelectedOperators : metricsSelectedChannels;

      const datasets = names.map((name, idx) => {
        const data = months.map(m => {
          if (isOperator) return (metricsGroupRevenueMap({ year: metricsSelectedYear, month: m }, metricsScopeMode)[name] || 0) / 1e8;
          return metricsRevenueData.filter(r => r.year === metricsSelectedYear && r.month === m && r.channel === name).reduce((s, r) => s + r.revenue, 0) / 1e8;
        });
        const color = metricsIsEnaName(name) ? RC('curr') : seriesColor(idx);
        return { label: name, data, borderColor: color, backgroundColor: color, fill: false, tension: 0.3, borderWidth: metricsIsEnaName(name) ? 3 : 2, pointRadius: 3, pointBackgroundColor: color };
      });

      const ctx = canvas.getContext('2d');
      chartInstances.metricsRevTrend = new Chart(ctx, {
        type: 'line', data: { labels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24 } },
          plugins: { legend: { display: true, position: 'top', labels: { color: CH('#B0B8C1'), font: { size: 12, weight: FW() } } },
            tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.raw.toFixed(2)} 억원` } } },
          scales: { x: { ticks: { color: CH('#F2F4F6'), font: { size: 12, weight: FW() } }, grid: { display: false } },
            y: ddValueAxis({ ticks: { color: CH('#8B95A1'), maxTicksLimit: 5, padding: 6, callback: v => v + '억' } }) }
        }
      });
    }

    function renderMetricsRevenueRankingChart() {
      const canvas = document.getElementById('chartMetricsRevenueRanking'); if (!canvas) return;
      if (chartInstances.metricsRevRank) { chartInstances.metricsRevRank.destroy(); chartInstances.metricsRevRank = null; }
      const period = metricsLatestPeriod(metricsRevenueData, metricsSelectedYear);
      if (!period) return;
      const isOperator = metricsCompareUnit === 'operator';
      const selected = new Set(isOperator ? metricsSelectedOperators : metricsSelectedChannels);

      let entries;
      if (isOperator) {
        entries = Object.entries(metricsGroupRevenueMap(period, metricsScopeMode));
      } else {
        const map = {};
        metricsRevenueData.filter(r => r.year === period.year && r.month === period.month && metricsScopeMatchRow(r, metricsScopeMode)).forEach(r => { map[r.channel] = (map[r.channel] || 0) + r.revenue; });
        entries = Object.entries(map);
      }
      entries = entries.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const labels = entries.map(e => e[0]);
      const values = entries.map(e => e[1] / 1e8);
      const colors = labels.map(name => (metricsIsEnaName(name) || selected.has(name)) ? RC('curr') : RC('ref'));

      const ctx = canvas.getContext('2d');
      chartInstances.metricsRevRank = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: `${period.year}-${String(period.month).padStart(2, '0')} 매출`, data: values,
          backgroundColor: (c) => ddBarFill(colors[c.dataIndex], true)(c), borderRadius: 4,
          datalabels: { display: 'auto', anchor: 'end', align: 'right', offset: 4, color: dataLabelTextColor(), font: { size: 11, weight: FW() }, formatter: (v) => v > 0 ? v.toFixed(1) + '억' : '' } }] },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24, right: 44 } },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.label}: ${c.raw.toFixed(2)} 억원` } } },
          scales: { x: ddValueAxis({ grace: 0, ticks: { color: CH('#8B95A1'), maxTicksLimit: 7, padding: 6, callback: v => v + '억' } }), y: { ticks: { color: CH('#F2F4F6'), font: { weight: FW() } }, grid: { display: false } } }
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

      metricsEnsureDefaultSelections();
      setupMetricsYearPills();
      renderMetricsOperatorCheckboxes();
      renderMetricsChannelCheckboxes();
      updateMetricsDropdownLabel('Operator');
      updateMetricsDropdownLabel('Channel');

      renderMetricsRevenueKpis();
      renderMetricsRatingsKpis();          // metrics-ratings.js
      renderMetricsMarketShareChart();
      renderMetricsRevenueTrendChart();
      renderMetricsRevenueRankingChart();
      renderMetricsCprpTrendChart();        // metrics-ratings.js
      renderMetricsRatingTrendChart();      // metrics-ratings.js
      renderMetricsGrpTrendChart();         // metrics-ratings.js
      renderMetricsDetailTeaser();          // metrics-ratings.js
    }
