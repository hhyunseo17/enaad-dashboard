// ============================================================
// js/features/metrics-ratings.js
// 지표 대시보드(경쟁채널 벤치마크) — File1(경쟁채널 지표 현황) 쪽: KPI 3·4·5(CPRP/채널시청률/
// 시청률1%당매출), CPRP/채널시청률/eq-GRPs 미니 트렌드 3종, 상세표 티저, metricsDetail 전체 상세.
// 컨트롤바·매출 쪽 KPI 1·2·오케스트레이션(renderMetricsDashboard())은 js/features/metrics-dashboard.js
// (이 파일보다 먼저 로드 — metricsScopeMatchRow/metricsRenderBadge/metricsFindMetricCode 등 공용
// 헬퍼가 거기 있다). 자세한 배경은 docs/features/metrics-dashboard.md 참고.
// ============================================================

    // ------------------------------------------------------------
    // KPI 3·4·5 — CPRP(원) / ENA 채널시청률(소수 3자리) / 시청률 1%당 매출(억원)
    // ------------------------------------------------------------
    // File1 원본이 아직 안 걷힌 미래 달을 값 0으로 미리 채워둔 placeholder 행을 갖고 있다(실 샘플로
    // 확인, 2026-09-15 — "260910 기준" 리포트인데 10~12월 CPRP·채널시청률이 전부 정확히 0). value===0을
    // "아직 안 채워짐"으로 보고 건너뛴다 — CPRP·시청률·GRP는 실제로 0이 나올 일이 없는 지표라, 값
    // 0을 진짜 데이터로 오인하면 평균이 그만큼 낮아져 버린다.
    function metricsRatingsValueAt(metricCode, channel, indexMode, period) {
      if (!metricCode || !period) return null;
      const row = metricsRatingsData.find(r => r.metricCode === metricCode && r.channel === channel && r.indexMode === indexMode && r.year === period.year && r.month === period.month);
      return row ? row.value : null;
    }
    // 주어진 기간 목록(periods)에 걸친 File1 원본 값의 단순평균 — CPRP·채널시청률·시청률1%당매출
    // 전부 이 방식으로 통일한다(2026-09-16, 사용자 확정: 처음엔 "CPRP의 산식은 채널 기준으로
    // 매출/eq-GRPs"라고 했다가 곧바로 "아니면 CPRP도 그냥 평균내"로 단순화 — 셋 다 재계산 없이
    // File1 원본 월별 값을 조회조건 기간만큼 평균낸다). value===0(미보고 placeholder) 달은
    // metricsRatingsValueAt이 그 행을 찾아도 그대로 포함시키지 않도록, 호출부가 periods 자체를
    // 이미 value!==0인 달로만 걸러서 넘긴다(metricsSelectedPeriods(scopedRows) 패턴).
    function metricsRatingsAverageAt(periods, metricCode, channel, indexMode) {
      if (!periods.length) return null;
      const vals = periods.map(p => metricsRatingsValueAt(metricCode, channel, indexMode, p)).filter(v => v !== null && v !== undefined);
      return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    }
    // KPI 3장 공용 계산 — metricCode를 조회조건(연도 복수선택×월 선택) 안에서 평균낸 현재값 + 전월비/
    // 전년비 비교값을 한 번에 구한다. 전월비(MoM)는 "선택 기간이 정확히 한 달"일 때만 의미가 있어
    // (여러 달 평균의 "전월"이 뭘 가리키는지 모호해서) 그때만 계산하고, 전년비(YoY)는 여러 연도가
    // 선택되면(단일-앵커 관례) 숨기되 여러 달 평균이어도 "그 달들의 전년 동월 평균"과는 비교할 수
    // 있어 그대로 계산한다(2026-09-16, "지표 대시보드 전체로 확장" 확정 원칙과 동일).
    function metricsRatingsKpiOf(metricCode, channel, indexMode, isMultiYear) {
      if (!metricCode) return { curr: null, mom: null, yoy: null, periods: [] };
      const scoped = metricsRatingsData.filter(r => r.metricCode === metricCode && r.channel === channel && r.indexMode === indexMode && r.value !== 0);
      const periods = metricsSelectedPeriods(scoped);
      const curr = metricsRatingsAverageAt(periods, metricCode, channel, indexMode);
      const mom = periods.length === 1 ? metricsRatingsAverageAt([metricsPrevMonthPeriod(periods[0])], metricCode, channel, indexMode) : null;
      const yoy = isMultiYear ? null : metricsRatingsAverageAt(periods.map(p => ({ year: p.year - 1, month: p.month })), metricCode, channel, indexMode);
      return { curr, mom, yoy, periods };
    }

    function renderMetricsRatingsKpis() {
      const channel = ENA_REPRESENTATIVE_CHANNEL;
      const idx = metricsIndexMode;
      const isMultiYear = metricsYearsInScope().length > 1;

      // CPRP — File1 원본은 "천원" 단위라 ×1,000 해서 원 단위로 표기한다(plan 확정사항 3).
      const cprpCode = metricsFindMetricCode(METRICS_LABEL.cprp, idx);
      const cprp = metricsRatingsKpiOf(cprpCode, channel, idx, isMultiYear);
      document.getElementById('metricsKpiCprpValue').innerText = cprp.curr !== null ? Math.round(cprp.curr * 1000).toLocaleString() + ' 원' : '- 원';
      document.getElementById('metricsKpiCprpSub').innerText = cprp.periods.length ? `${metricsPeriodRangeLabel(cprp.periods)}(${idx}) 평균 · 원 단위 환산(×1,000)` : '경쟁채널 지표 현황 파일';
      metricsRenderBadge('metricsKpiCprpMomBadge', '전월', metricsGrowthPct(cprp.curr, cprp.mom), '%');
      metricsRenderBadge('metricsKpiCprpYoyBadge', '전년', metricsGrowthPct(cprp.curr, cprp.yoy), '%');

      // ENA 채널시청률 — 소수점 셋째 자리까지(plan 확정사항 3, File1 원본 정밀도를 살린다).
      const ratingCode = metricsFindMetricCode(METRICS_LABEL.rating, idx, true); // exact — "채널시청률 1%당 eq-GRPs"(08)와 접두어 충돌 방지
      const rating = metricsRatingsKpiOf(ratingCode, channel, idx, isMultiYear);
      document.getElementById('metricsKpiRatingValue').innerText = rating.curr !== null ? rating.curr.toFixed(3) + ' %' : '- %';
      document.getElementById('metricsKpiRatingSub').innerText = rating.periods.length ? `${metricsPeriodRangeLabel(rating.periods)}(${idx}) 평균` : '경쟁채널 지표 현황 파일';
      // 원값 자체가 0.1%대라 %p 배지도 기본 소수 1자리로는 실제 변화가 "+0.0%p"로 뭉개진다 —
      // 메인 값과 같은 3자리로(metricsRenderBadge decimals 인자, 2026-09-16).
      metricsRenderBadge('metricsKpiRatingMomBadge', '전월', metricsPointDiff(rating.curr, rating.mom), '%p', 3);
      metricsRenderBadge('metricsKpiRatingYoyBadge', '전년', metricsPointDiff(rating.curr, rating.yoy), '%p', 3);

      // 시청률 1%당 매출 — File1 원본값 그대로(재계산 안 함), 일평균/프라임타임 토글과 무관하게
      // 항상 '전체' 기준으로 고정한다(plan 확정사항 4 — M/S와 마찬가지로 이 토글의 영향을 받지 않는다).
      const rprCode = metricsFindMetricCode(METRICS_LABEL.revPerRating, '전체');
      const rpr = metricsRatingsKpiOf(rprCode, channel, '전체', isMultiYear);
      document.getElementById('metricsKpiRevPerRatingValue').innerText = rpr.curr !== null ? metricsFmtNum(rpr.curr, 2) + ' 억원' : '- 억원';
      document.getElementById('metricsKpiRevPerRatingSub').innerText = rpr.periods.length ? `${metricsPeriodRangeLabel(rpr.periods)} 평균 · 파일 원본값(일평균 기준, 토글 무관)` : '경쟁채널 지표 현황 파일';
      metricsRenderBadge('metricsKpiRevPerRatingMomBadge', '전월', metricsGrowthPct(rpr.curr, rpr.mom), '%');
      metricsRenderBadge('metricsKpiRevPerRatingYoyBadge', '전년', metricsGrowthPct(rpr.curr, rpr.yoy), '%');
    }

    // ------------------------------------------------------------
    // CPRP / 채널시청률 / eq-GRPs / 광고주수 미니 트렌드 4종 — 매출 비교와 같은 채널 선택을 공유(plan 확정사항).
    // ------------------------------------------------------------
    // indexMode를 인자로 받는다(과거엔 전역 metricsIndexMode를 함수 안에서 직접 읽었다) — 광고주수(12번)는
    // File1에 애초에 '전체' 하나뿐이라(일평균/프라임타임 구분 자체가 없음, 실 샘플로 확인 2026-09-15)
    // 위쪽 토글이 '프라임타임'이어도 항상 '전체'로 고정 조회해야 한다. CPRP·채널시청률·eq-GRPs는
    // 그대로 metricsIndexMode를 넘겨 기존 동작을 유지한다.
    function renderMetricsMiniTrendChart(canvasId, chartKey, metricCode, valueMultiplier, valueSuffix, decimals, indexMode) {
      const canvas = document.getElementById(canvasId); if (!canvas) return;
      if (chartInstances[chartKey]) { chartInstances[chartKey].destroy(); chartInstances[chartKey] = null; }
      if (!metricCode) return; // 해당 라벨의 지표를 File1에서 찾지 못함 — 빈 캔버스로 둔다.

      // value===0인 달은 제외한다 — File1의 미보고 미래 달 placeholder(위 metricsRatingsAverageAt
      // 주석 참고). 안 걸러내면 트렌드 끝부분이 0으로 뚝 떨어져 보인다. metricsSelectedPeriods()에
      // 이 metricCode+indexMode로 미리 좁힌 배열을 넘겨 연도 복수선택까지 그대로 반영한다
      // (2026-09-16, "지표 대시보드 전체로 확장" 확정 — metricsMonthsInYear()가 이미 월 선택 pill도
      // 걸러주므로 그 로직은 그대로 재사용).
      const scopedRows = metricsRatingsData.filter(r => r.metricCode === metricCode && r.indexMode === indexMode && r.value !== 0);
      const periods = metricsSelectedPeriods(scopedRows);
      const labels = periods.map(metricsPeriodLabel);
      // File1의 채널 단위 지표(03~15번)는 실제로 15개 채널만 있다(위 "①②선택" 관련 주석 참고) —
      // MBN/TV조선/채널A/iHQ/티캐스트처럼 그 15개에 없는 사업자를 대표채널로 골라도 이 지표엔 값
      // 자체가 없어 빈 줄만 그려졌다. 범례에 있는데 선이 안 보이는 게 혼란스럽다는 지적(2026-09-16,
      // "여기는 다 안 나오는 거 같은데? 5개만 보여") — "데이터가 아예 없는 채널은 범례에서 제외"로
      // 확정. ①②선택 자체(metricsSelectedOperators/Channels)는 안 건드리고, 이 4개 미니차트가
      // 그리는 시점에만 "이 metricCode+indexMode로 File1에 단 한 행이라도 있는 채널"만 남긴다
      // (연도 제한 없이 확인 — 구조적으로 없는 채널과 "이 연도만 마침 없는" 채널을 구분하기 위해서다).
      const channels = metricsRatingsChannelSelection()
        .filter(ch => metricsRatingsData.some(r => r.metricCode === metricCode && r.indexMode === indexMode && r.channel === ch));
      // 대표채널 'ENA'만 강조색(파랑)을 받는다 — ENA DRAMA/PLAY/STORY까지 전부 파랑이면 ②에서
      // 여러 개를 동시에 골랐을 때 서로 구분이 안 된다(2026-09-16, 사용자 지적: "ENA 계열채널도
      // ENA랑 색이 다 너무 똑같아서 별로네" — ②가 다중 채널 확장을 지원하게 되면서 ENA 계열 여러
      // 개가 한 차트에 같이 뜨는 경우가 생겼다). ENA DRAMA 등은 이제 경쟁사와 같은 팔레트에서
      // 각자 다른 색을 받는다 — "ENA 계열이라는 표시"보다 "서로 구분되는 것"이 우선.
      const nonEnaChannels = channels.filter(ch => ch !== ENA_REPRESENTATIVE_CHANNEL);

      const datasets = channels.map((ch) => {
        const isEna = ch === ENA_REPRESENTATIVE_CHANNEL;
        const color = isEna ? RC('curr') : metricsCompetitorColor(nonEnaChannels.indexOf(ch)); // 0번(파랑)은 ENA 전용
        const data = periods.map(p => {
          const row = metricsRatingsData.find(r => r.metricCode === metricCode && r.indexMode === indexMode && r.year === p.year && r.month === p.month && r.channel === ch);
          return row ? row.value * valueMultiplier : null;
        });
        return { label: ch, data, borderColor: color, backgroundColor: color, fill: false, tension: 0.3, borderWidth: isEna ? 3 : 2, pointRadius: 2.5, spanGaps: true, _isEna: isEna };
      });

      // suggestedMax는 "적어도 이만큼은 돼야 한다"는 하한 힌트일 뿐 상한을 막지 못한다 — grace를
      // 꺼도 Chart.js가 maxTicksLimit에 맞춰 "예쁜 간격"(니스넘버, 보통 1/2/5×10^n)을 고르는 과정에서
      // suggestedMax를 그대로 한 단계 더 올림해버려(예: 실제 최댓값 420만원 근처인데도 축은 여전히
      // 600만원까지) 데이터가 없는 빈 구간이 크게 남았다(사용자 재지적, 2026-09-15) — suggestedMax가
      // 아니라 진짜 상한을 강제하는 `max`를 써서 축이 그 값을 절대 넘지 못하게 한다.
      const allValues = datasets.flatMap(ds => ds.data).filter(v => v !== null && v !== undefined && isFinite(v));
      const maxVal = allValues.length ? Math.max(...allValues) : 0;

      const ctx = canvas.getContext('2d');
      chartInstances[chartKey] = new Chart(ctx, {
        type: 'line', data: { labels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false, layout: { padding: { top: 16 } },
          // 범례·축 폰트 크기는 "매출 트렌드"(renderMetricsRevenueTrendChart)와 같은 수준으로 맞춘다
          // (2026-09-15, 사용자 요청 — 카드 크기를 이미 매출 트렌드와 맞췄으니 글자 크기도 맞아야 함).
          plugins: { legend: { display: true, position: 'top', labels: { color: CH('#B0B8C1'), font: { size: 13, weight: FW() }, generateLabels: metricsLegendGenerateLabels } },
            tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.raw !== null ? metricsFmtNum(c.raw, decimals) : '-'}${valueSuffix}` } } },
          scales: { x: { offset: true, ticks: { color: CH('#F2F4F6'), font: { size: 13, weight: FW() } }, grid: { display: false } },
            y: ddValueAxis({ grace: 0, max: maxVal > 0 ? maxVal * 1.1 : undefined, ticks: { color: CH('#8B95A1'), maxTicksLimit: 5, padding: 6, font: { size: 13, weight: FW() }, callback: v => metricsFmtNum(v, decimals <= 1 ? 0 : decimals) + valueSuffix } }) }
        }
      });
    }
    function renderMetricsCprpTrendChart() { renderMetricsMiniTrendChart('chartMetricsCprpTrend', 'metricsCprpTrend', metricsFindMetricCode(METRICS_LABEL.cprp, metricsIndexMode), 1000, '원', 0, metricsIndexMode); }
    function renderMetricsRatingTrendChart() { renderMetricsMiniTrendChart('chartMetricsRatingTrend', 'metricsRatingTrend', metricsFindMetricCode(METRICS_LABEL.rating, metricsIndexMode, true), 1, '%', 3, metricsIndexMode); }
    function renderMetricsGrpTrendChart() { renderMetricsMiniTrendChart('chartMetricsGrpTrend', 'metricsGrpTrend', metricsFindMetricCode(METRICS_LABEL.grp, metricsIndexMode), 1, '', 1, metricsIndexMode); }
    // 광고주수(12번)는 File1에 '전체' 인덱스만 있다 — 항상 '전체'로 고정 조회(위 함수 주석 참고).
    function renderMetricsAdvCountTrendChart() { renderMetricsMiniTrendChart('chartMetricsAdvCountTrend', 'metricsAdvCountTrend', metricsFindMetricCode(METRICS_LABEL.advCount, '전체', true), 1, '개사', 0, '전체'); }

    // metricsMain의 "② 채널" 변경 전용 재렌더 — ②는 이 4개 미니차트(metricsRatingsChannelSelection()
    // 참고)만 바꾼다. KPI 1~6·시장규모 추이·M/S·매출 트렌드/랭킹은 전부 ①선택 사업자 기준이라
    // ②를 바꿔도 값이 그대로인데, renderMetricsDashboard() 전체를 다시 부르면 이 차트들도 매번
    // destroy+재생성돼(Chart.js) 인트로 애니메이션이 다시 돈다 — 값은 안 바뀌었는데 뭔가 바뀐 것처럼
    // 보여 헷갈린다는 지적(2026-09-16, 사용자: "채널을 선택하는 경우에 사업자 매출 차트는 안 바뀔
    // 거잖아? 이거 새로 불러오는 애니메이션이 있어서 값 바뀌는 줄 알고 헷갈리더라고"). ②변경 시엔
    // 이 4개만 다시 그린다.
    function renderMetricsChannelDependentCharts() {
      renderMetricsCprpTrendChart();
      renderMetricsRatingTrendChart();
      renderMetricsGrpTrendChart();
      renderMetricsAdvCountTrendChart();
    }

    // ------------------------------------------------------------
    // CPRP/채널시청률/eq-GRPs/광고주수 미니 트렌드 4종의 피벗 dataSource(2026-09-16, 사용자 요청:
    // "CPRP, 시청률, eq GRPs, 광고주수도 각각 피벗테이블 연결해줘") — renderMetricsMiniTrendChart()와
    // 같은 필터링 원칙(metricCode+indexMode로 좁히고, value===0 미보고 placeholder 제외, 이 지표에
    // 실제 데이터가 있는 채널만, 조회조건 연도/월로 제한)을 그대로 따라 차트와 피벗이 항상 같은
    // 채널·기간을 보여주게 맞춘다.
    // ------------------------------------------------------------
    function metricsRatingsDataForPivot(labelKey, indexMode, exact) {
      const code = metricsFindMetricCode(labelKey, indexMode, exact);
      if (!code) return [];
      const scoped = metricsRatingsData.filter(r => r.metricCode === code && r.indexMode === indexMode && r.value !== 0);
      const channels = metricsRatingsChannelSelection().filter(ch => scoped.some(r => r.channel === ch));
      const periodSet = new Set(metricsSelectedPeriods(scoped).map(p => p.year + '-' + p.month));
      return scoped.filter(r => channels.includes(r.channel) && periodSet.has(r.year + '-' + r.month));
    }
    function metricsCprpDataForPivot() { return metricsRatingsDataForPivot(METRICS_LABEL.cprp, metricsIndexMode, false); }
    function metricsRatingDataForPivot() { return metricsRatingsDataForPivot(METRICS_LABEL.rating, metricsIndexMode, true); } // exact — 08번과 접두어 충돌 방지(위 METRICS_LABEL 주석 참고)
    function metricsGrpDataForPivot() { return metricsRatingsDataForPivot(METRICS_LABEL.grp, metricsIndexMode, false); }
    function metricsAdvCountDataForPivot() { return metricsRatingsDataForPivot(METRICS_LABEL.advCount, '전체', true); } // 광고주수는 항상 '전체' 고정(위 렌더 함수 주석 참고)

    // 위 4개 피벗 상세 화면의 "② 채널" 체크박스 후보 목록 — 메인 페이지의 기본 후보(metricsChannelsForOperators())를
    // 그대로 쓰면 이 지표에 값이 아예 없는 채널(예: MBN/TV조선처럼 File1 채널 단위 지표 15개에 없는
    // 사업자)까지 섞여 나온다(2026-09-16, 사용자 지적: "이 차트들에서도 예를들어 지금 값이 있는
    // 채널들은 클릭하면 띄워줘야지" — 미니차트 범례는 이미 "데이터 없는 채널 제외"인데, 피벗의 ②채널
    // 후보 목록은 그 필터를 안 타고 있었다). 범위 안 사업자 전체 후보에서 이 metricCode+indexMode로
    // 실제 값이 하나라도 있는 채널만 남긴다.
    function metricsRatingsChannelCandidates(labelKey, indexMode, exact) {
      const code = metricsFindMetricCode(labelKey, indexMode, exact);
      if (!code) return [];
      const withData = new Set();
      metricsRatingsData.forEach(r => { if (r.metricCode === code && r.indexMode === indexMode && r.value !== 0) withData.add(r.channel); });
      return metricsChannelsForOperators(metricsAllOperatorGroups()).filter(ch => withData.has(ch));
    }
    function metricsCprpChannelCandidates() { return metricsRatingsChannelCandidates(METRICS_LABEL.cprp, metricsIndexMode, false); }
    function metricsRatingChannelCandidates() { return metricsRatingsChannelCandidates(METRICS_LABEL.rating, metricsIndexMode, true); }
    function metricsGrpChannelCandidates() { return metricsRatingsChannelCandidates(METRICS_LABEL.grp, metricsIndexMode, false); }
    function metricsAdvCountChannelCandidates() { return metricsRatingsChannelCandidates(METRICS_LABEL.advCount, '전체', true); }

    // ------------------------------------------------------------
    // 지표별 값 표기 — 지표마다 단위가 다르므로(%, 원, GRP, 억원, 건수…) pvFormatCell(금액 전용,
    // ÷1,000,000)을 쓸 수 없다. metricLabel 텍스트로 단위를 판별한다.
    // "08. 채널시청률 1%당 eq-GRPs"가 '시청률'을 포함하면서 '매출'은 없는 라벨이라 GRP 체크를
    // 먼저 해야 한다 — 순서를 바꾸면(시청률 체크가 먼저면) 08이 %로 잘못 찍힌다(실 샘플로 확인,
    // 2026-09-15). 나머지(광고주수/브랜드수 등)는 전부 건수라 마지막 분기(숫자만)로 충분하다.
    // ------------------------------------------------------------
    function metricsFormatRatingValue(metricLabel, value) {
      if (value === null || value === undefined) return '-';
      if (metricLabel.includes('AD Ratio')) return (value * 100).toFixed(1) + '%'; // File1 원본이 0~1 사이 비율값(2026-09-16, 사용자 요청)
      if (metricLabel.includes('CPRP')) return Math.round(value * 1000).toLocaleString() + '원';
      if (metricLabel.includes('시청률') && metricLabel.includes('매출')) return metricsFmtNum(value, 2) + '억원';
      if (metricLabel.includes('GRP')) return metricsFmtNum(value, 1);
      if (metricLabel.includes('시청률')) return value.toFixed(3) + '%';
      return value.toLocaleString(undefined, { maximumFractionDigits: 2 }); // 광고주수/브랜드수 등 — 전부 건수
    }
    // 합계(요약) 행에서 값을 아예 안 보여줄 지표들 — 비율/평균/건수 성격이라 채널을 다 더하거나
    // 단순합산하면 의미가 없다(2026-09-16, 사용자 요청: "이것들은 요약 값 다 넣지 말아줘" +
    // 후속 요청: "채널시청률 1%당 eq-GRPs도 요약 없애줘"). 08(채널시청률 1%당 eq-GRPs)도
    // CPRP와 같은 "1%당" 비율 지표라 요약에서 제외 — eq-GRPs 원값 계열(06/07)·채널시청률(03/04)만
    // 그대로 둔다(시청률·GRP는 도달량 성격이라 채널 총합이 "그 구간 전체 임팩트"로 그나마 해석
    // 가능하지만, 아래 10개는 그렇지 않다).
    const METRICS_DETAIL_NO_SUMMARY_CODES = new Set(['05', '08', '09', '10', '11', '12', '13', '14', '15', '16']);

    // ------------------------------------------------------------
    // metricsDetail — File1 16개 지표 × 채널 전체 상세(연도별 월 열). "정적 트리 표"(1차 버전 —
    // 드래그앤드롭 빌더는 없다). pvBuildTree/pvBuildVisibleColumns/pvRenderColumnHeaderRows(전부
    // 범용, 금액 가정 없음)는 그대로 재사용하고, 행 렌더·셀 포맷만 지표별로 자체 작성한다 —
    // pvRenderRows/pvFormatCell은 모든 값을 금액(÷1,000,000)으로 가정해 그대로 쓸 수 없다
    // (js/features/pivot-builder.js의 PIVOT_PRESETS.metricsDetail 주석 참고).
    // ------------------------------------------------------------
    // File1 원본의 지표 번호(01./03./09.…) 순서 — metricLabel은 번호를 뗀 텍스트라(파일 헤더 주석
    // 참고) metricCode로 다시 정렬해야 한다. 모든 지표가 metricsRatingsData에 최소 1행은 있다는
    // 전제로 첫 등장 행의 metricCode를 그대로 쓴다(2026-09-16, 사용자 요청: "순서는 원본 파일에
    // 있는 순서대로 놓자").
    function metricsDetailMetricOrder() {
      const order = {};
      metricsRatingsData.forEach(r => { if (!(r.metricLabel in order)) order[r.metricLabel] = r.metricCode; });
      return order;
    }
    // "③ 지표 선택" 체크박스 — ①사업자/②채널과 같은 멀티선택 패턴(metrics-dashboard.js 참고),
    // 비어있으면 전체(2026-09-16, 사용자 요청: "각 항목(열제목) 선택할 수 있게 해주고"). 목록도
    // File1 원본 순서(위 metricsDetailMetricOrder())로 보여준다.
    function renderMetricsDetailMetricCheckboxes() {
      const container = document.getElementById('listMetricsDetailMetricCheckboxes'); if (!container) return;
      const order = metricsDetailMetricOrder();
      const list = Object.keys(order).sort((a, b) => (parseInt(order[a], 10) || 0) - (parseInt(order[b], 10) || 0));
      container.innerHTML = list.map(label => `<label class="checkbox-item"><input type="checkbox" value="${label}" onchange="onMetricsDetailMetricCheckboxChange()" ${metricsDetailSelectedMetrics.includes(label) ? 'checked' : ''}> ${label}</label>`).join('');
      const checkAll = document.getElementById('checkAllMetricsDetailMetric');
      if (checkAll) { const all = list.length > 0 && list.every(l => metricsDetailSelectedMetrics.includes(l)); checkAll.checked = all; checkAll.indeterminate = !all && metricsDetailSelectedMetrics.length > 0; }
      const label = document.getElementById('labelMetricsDetailMetric');
      if (label) {
        if (metricsDetailSelectedMetrics.length === 0) label.innerText = '전체 지표';
        else if (metricsDetailSelectedMetrics.length <= 2) label.innerText = metricsDetailSelectedMetrics.join(', ');
        else label.innerText = `${metricsDetailSelectedMetrics.length}개 선택됨`;
      }
    }
    function onMetricsDetailMetricCheckboxChange() {
      const container = document.getElementById('listMetricsDetailMetricCheckboxes');
      metricsDetailSelectedMetrics = Array.from(container.querySelectorAll('input:checked')).map(cb => cb.value);
      renderMetricsDetailPivot();
    }

    // VIEW_CONFIG.metricsDetail.render()의 실제 진입점 — 다른 8개 피벗 상세 화면(renderMetricsPivotView)
    // 과 같은 원칙으로, 그리기 전에 이 화면 전용 연도/월 pill부터 세팅한다(2026-09-16, 사용자 지적:
    // "경쟁채널 지표 상세 페이지도 조회조건은 메인 페이지에 있는 걸 써야지" — 이전엔 pill 자체가 없어
    // 조회조건과 무관하게 File1이 갖고 있는 연도 전체가 항상 나왔다).
    function renderMetricsDetailView() {
      metricsSetupYearPills('metricsDetailYearPills', renderMetricsDetailView);
      metricsSetupMonthPills('metricsDetailMonthPills', renderMetricsDetailView);
      renderMetricsDetailPivot();
    }
    function renderMetricsDetailPivot() {
      const preset = PIVOT_PRESETS.metricsDetail;
      preset.key = 'metricsDetail';
      renderMetricsDetailMetricCheckboxes();
      const cfg = pvConfigFor('metricsDetail');
      const rowFields = cfg.rows, colFields = cfg.columns;
      // value!==0 — File1이 아직 안 걷힌 미래 달을 0으로 미리 채워둔 placeholder 행을 실 데이터로
      // 오인하지 않도록 제외한다(위 4개 미니차트/피벗과 동일한 원칙, docs 로그 9·11번 참고 — 실제로
      // 2026년 10~12월 다수 지표에 이 placeholder가 전 채널 0으로 박혀 있음을 Supabase로 확인,
      // 2026-09-16 사용자 지적: "10~12월에 0으로 입력돼 있는 건 그냥 비워놔야돼"). 조회조건(연도/월
      // 선택)도 메인 페이지·다른 8개 피벗 상세 화면과 같은 원칙으로 반영 — 이전엔 필터링이 아예 없어
      // File1이 갖고 있는 연도 전체(2025년~)가 조회조건과 무관하게 항상 다 나왔다(2026-09-16, 사용자
      // 지적: "조회조건은 메인 페이지에 있는 걸 써야지. 25년부터 다 나오네 여기").
      let rows = metricsRatingsData.filter(r => r.indexMode === metricsIndexMode && r.value !== 0);
      const periodSet = new Set(metricsSelectedPeriods(rows).map(p => p.year + '-' + p.month));
      rows = rows.filter(r => periodSet.has(r.year + '-' + r.month));
      if (metricsDetailSelectedMetrics.length > 0) rows = rows.filter(r => metricsDetailSelectedMetrics.includes(r.metricLabel));

      const { root, colCombos } = pvBuildTree(rows, rowFields, colFields, cfg.values, ['(미지정)', '(미지정)'], cfg);

      const opt = { subtotalDepths: new Set(), columnDefaultExpanded: true, toggleDepth: 0, presetKey: 'metricsDetail', expandedCols: preset.expandedCols(), cfg, header: PV_HEADER_TREE };
      const visibleColumns = pvBuildVisibleColumns(colCombos, colFields, opt.expandedCols, opt);
      const headerRows = pvRenderColumnHeaderRows(visibleColumns, colFields, opt);

      const h1 = `<th rowspan="${colFields.length}" style="text-align:left; vertical-align:middle;">지표 / 채널</th>` + (headerRows[0] || '');
      document.getElementById('metricsDetailHeaderRow1').innerHTML = mapPivotHtml(h1);
      document.getElementById('metricsDetailHeaderRow2').innerHTML = mapPivotHtml(headerRows[1] || '');

      if (rowFields.length === 0 || rows.length === 0) {
        document.getElementById('metricsDetailTableBody').innerHTML = `<tr><td style="text-align:center; color:var(--text-tertiary); padding:16px;">표시할 데이터가 없습니다</td></tr>`;
        return;
      }
      const out = [];
      metricsRenderDetailRows(root, 0, [], visibleColumns, rowFields, preset.expandedRows(), !!preset.rowDefaultExpanded, metricsDetailMetricOrder(), out);
      document.getElementById('metricsDetailTableBody').innerHTML = mapPivotHtml(out.join(''));
    }

    // pvRenderRows와 같은 트리 재귀 구조이지만, 셀 포맷이 1단계 행 값(지표명)에 따라 달라진다는
    // 점만 다르다 — 그래서 그 하나를 위해 엔진 함수를 그대로 못 쓰고 이 얇은 사본을 둔다.
    function metricsRenderDetailRows(node, depth, ancestorPath, visibleColumns, rowFields, expandedRows, rowDefaultExpanded, metricOrder, out) {
      const hasMore = depth + 1 < rowFields.length;
      // depth 0(지표)은 File1 원본 번호 순서, 그 아래(채널 등)는 기존처럼 가나다순(2026-09-16,
      // 사용자 요청: "순서는 원본 파일에 있는 순서대로 놓자" — metricLabel엔 번호가 없어(파일 헤더
      // 주석 참고) metricCode로 정렬해야 한다).
      const keys = depth === 0
        ? Object.keys(node.children).sort((a, b) => (parseInt(metricOrder[a], 10) || 0) - (parseInt(metricOrder[b], 10) || 0))
        : Object.keys(node.children).sort((a, b) => pvCompareNames(a, b));
      const rowMetricLabel = depth === 0 ? null : ancestorPath[0]; // 채널(depth1) 행의 포맷 기준은 부모(지표) 라벨

      keys.forEach(k => {
        const child = node.children[k];
        const path = ancestorPath.concat(k);
        const pathKey = path.join('||');
        // rowDefaultExpanded — pivot-builder.js togglePvRowNode()와 같은 원칙: 명시적으로 false가
        // 아닌 한 펼침으로 읽는다(2026-09-16, 사용자 요청: "기본적으로 펼쳐놔야될 거 같은데").
        const isExpanded = rowDefaultExpanded ? (expandedRows[pathKey] !== false) : !!expandedRows[pathKey];
        const thisMetricLabel = depth === 0 ? k : rowMetricLabel;
        const toggle = hasMore ? `<span class="toggle-icon" onclick="togglePvRowNode('metricsDetail','${pvEsc(pathKey)}')">${isExpanded ? '-' : '+'}</span>` : '';
        const st = depth === 0 ? 'background:#1E293B; color:#F8FAFC; font-weight:700;' : 'background:#151C2C; color:#CBD5E1;';
        let html = `<tr><td class="indent-step-${Math.min(depth + 1, 5)}" style="${st}">${toggle}${k}</td>`;
        // 요약(depth 0) 행에서 이 지표가 METRICS_DETAIL_NO_SUMMARY_CODES에 있으면 합계 자체를 아예
        // 계산·표시하지 않는다(위 상수 선언부 참고) — 채널(depth 1 이하) 행은 그대로 실값을 보여준다.
        const suppressSummary = depth === 0 && METRICS_DETAIL_NO_SUMMARY_CODES.has(metricOrder[k]);
        visibleColumns.forEach(col => {
          let val = null;
          if (!suppressSummary) { const m = pvMergeMetrics(child, col.leafKeys); val = m ? m.sums.value : null; }
          html += `<td style="text-align:right;">${metricsFormatRatingValue(thisMetricLabel, val === undefined ? null : val)}</td>`;
        });
        html += `</tr>`;
        out.push(html);
        if (hasMore && isExpanded) metricsRenderDetailRows(child, depth + 1, path, visibleColumns, rowFields, expandedRows, rowDefaultExpanded, metricOrder, out);
      });
    }

    // ------------------------------------------------------------
    // "1%↑ 시청률 프로그램 수" — 드라마&영화/오락 2개 장르, 채널별 그룹막대 + 월별 추이 라인
    // (2026-09-17 신규). 데이터 소스는 program_ratings_monthly(채널×프로그램×장르×연월 사전집계,
    // 본방만 — ETL 처리 완료, js/core/metrics-data-loader.js의 programRatingsData). ①②(사업자/채널)
    // 선택과 무관 — 원본이 13개 채널 전체를 담은 별도 데이터셋이라 그 selection을 걸러내지 않는다.
    // 연/월 조회기간만 metricsSelectedPeriods()로 적용(다른 미니차트들과 같은 관례).
    //
    // 그 달 그 프로그램(본방)의 평균 시청률 = rating_sum ÷ episode_count. 여러 달에 걸친 평균은
    // 월별 평균끼리 다시 평균내면 안 되고(회차 수 적은 달이 과대반영됨) rating_sum과 episode_count를
    // 각각 합산한 뒤 나누는 가중평균이어야 한다 — 왼쪽 채널별 막대가 이 방식.
    // ------------------------------------------------------------
    const METRICS_GENRE_QUALIFYING_GENRES = ['드라마&영화', '오락'];
    const METRICS_GENRE_QUALIFYING_THRESHOLD = 0.01; // 평균 시청률 1%

    // 왼쪽 막대(채널별) — (channel, program, genre) 단위로 조회기간 내 rating_sum/episode_count를
    // 합산한 가중평균이 임계값 이상이면 그 프로그램을 "달성"으로 카운트한다.
    function computeGenreQualifyingByChannel() {
      const periodSet = new Set(metricsSelectedPeriods(programRatingsData).map(p => p.year + '-' + p.month));
      const rows = programRatingsData.filter(r => METRICS_GENRE_QUALIFYING_GENRES.includes(r.genre) && periodSet.has(r.year + '-' + r.month));

      const groups = new Map();
      rows.forEach(r => {
        const key = r.channel + '|' + r.program + '|' + r.genre;
        const g = groups.get(key) || { channel: r.channel, genre: r.genre, ratingSum: 0, episodeCount: 0 };
        g.ratingSum += r.ratingSum; g.episodeCount += r.episodeCount;
        groups.set(key, g);
      });

      const counts = {}; // counts[channel] = { '드라마&영화': n, '오락': n }
      groups.forEach(g => {
        if (g.episodeCount > 0 && (g.ratingSum / g.episodeCount) >= METRICS_GENRE_QUALIFYING_THRESHOLD) {
          counts[g.channel] = counts[g.channel] || {};
          counts[g.channel][g.genre] = (counts[g.channel][g.genre] || 0) + 1;
        }
      });
      return counts;
    }

    // 오른쪽 라인(월별, 전체 채널 합산) — program_ratings_monthly가 이미 월 단위라 그 달 행 자체가
    // "그 프로그램의 그 달 평균"이다. 채널 무관하게 (year,month,genre) 단위로 카운트만 합산한다.
    function computeGenreQualifyingMonthlyTrend() {
      const periodSet = new Set(metricsSelectedPeriods(programRatingsData).map(p => p.year + '-' + p.month));
      const counts = {}; // counts['2026-3'] = { '드라마&영화': n, '오락': n }
      programRatingsData
        .filter(r => METRICS_GENRE_QUALIFYING_GENRES.includes(r.genre) && periodSet.has(r.year + '-' + r.month) && r.episodeCount > 0 && (r.ratingSum / r.episodeCount) >= METRICS_GENRE_QUALIFYING_THRESHOLD)
        .forEach(r => {
          const key = r.year + '-' + r.month;
          counts[key] = counts[key] || {};
          counts[key][r.genre] = (counts[key][r.genre] || 0) + 1;
        });
      return counts;
    }

    // 왼쪽: 채널별 그룹 막대(드라마&영화/오락 나란히). x축은 (합계) 내림차순 — 랭킹차트류와 같은 관례.
    function renderMetricsGenreQualifyingBarChart() {
      const canvas = document.getElementById('chartMetricsGenreQualifyingBar'); if (!canvas) return;
      if (chartInstances.metricsGenreQualifyingBar) { chartInstances.metricsGenreQualifyingBar.destroy(); chartInstances.metricsGenreQualifyingBar = null; }

      const counts = computeGenreQualifyingByChannel();
      const channels = Object.keys(counts).sort((a, b) => {
        const totalA = (counts[a]['드라마&영화'] || 0) + (counts[a]['오락'] || 0);
        const totalB = (counts[b]['드라마&영화'] || 0) + (counts[b]['오락'] || 0);
        return totalB - totalA;
      });

      const dramaColor = seriesColor(0);
      const varietyColor = seriesColor(1);
      const dramaData = channels.map(ch => counts[ch]['드라마&영화'] || 0);
      const varietyData = channels.map(ch => counts[ch]['오락'] || 0);

      const ctx = canvas.getContext('2d');
      chartInstances.metricsGenreQualifyingBar = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: channels,
          datasets: [
            { label: '드라마&영화', data: dramaData, backgroundColor: ddBarFill(dramaColor, false), borderRadius: 4, barPercentage: 1, categoryPercentage: 0.8, ...ddGroupSeparator(),
              datalabels: { display: 'auto', anchor: 'end', align: 'end', offset: 2, color: dataLabelTextColor(), font: { size: 12, weight: FW() }, formatter: (v) => v > 0 ? v : '' } },
            { label: '오락', data: varietyData, backgroundColor: ddBarFill(varietyColor, false), borderRadius: 4, barPercentage: 1, categoryPercentage: 0.8, ...ddGroupSeparator(),
              datalabels: { display: 'auto', anchor: 'end', align: 'end', offset: 2, color: dataLabelTextColor(), font: { size: 12, weight: FW() }, formatter: (v) => v > 0 ? v : '' } },
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24 } },
          plugins: { legend: { display: true, position: 'top', labels: { color: CH('#B0B8C1'), font: { size: 13, weight: FW() }, generateLabels: metricsLegendGenerateLabels } },
            tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.raw}개` } } },
          scales: { x: { ticks: { color: CH('#F2F4F6'), font: { size: 13, weight: FW() } }, grid: { display: false } },
            y: ddValueAxis({ grace: '10%', ticks: { color: CH('#8B95A1'), maxTicksLimit: 5, padding: 6, font: { size: 13, weight: FW() }, callback: v => Number.isInteger(v) ? v : '' } }) }
        }
      });
    }

    // 오른쪽: 월별 추이 라인(전체 채널 합산, 장르별 2개 선). x축은 metricsSelectedPeriods() 시간순 —
    // 여러 연도가 섞이면 metricsPeriodLabel()이 "25.9" 형식으로, 한 연도뿐이면 "9월"로 표기한다.
    function renderMetricsGenreQualifyingTrendChart() {
      const canvas = document.getElementById('chartMetricsGenreQualifyingTrend'); if (!canvas) return;
      if (chartInstances.metricsGenreQualifyingTrend) { chartInstances.metricsGenreQualifyingTrend.destroy(); chartInstances.metricsGenreQualifyingTrend = null; }

      const periods = metricsSelectedPeriods(programRatingsData);
      const labels = periods.map(metricsPeriodLabel);
      const counts = computeGenreQualifyingMonthlyTrend();

      const dramaColor = seriesColor(0);
      const varietyColor = seriesColor(1);
      const dramaData = periods.map(p => { const c = counts[p.year + '-' + p.month]; return c ? (c['드라마&영화'] || 0) : 0; });
      const varietyData = periods.map(p => { const c = counts[p.year + '-' + p.month]; return c ? (c['오락'] || 0) : 0; });

      const ctx = canvas.getContext('2d');
      chartInstances.metricsGenreQualifyingTrend = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: '드라마&영화', data: dramaData, borderColor: dramaColor, backgroundColor: dramaColor, fill: false, tension: 0.3, borderWidth: 2, pointRadius: 2.5 },
            { label: '오락', data: varietyData, borderColor: varietyColor, backgroundColor: varietyColor, fill: false, tension: 0.3, borderWidth: 2, pointRadius: 2.5 },
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false, layout: { padding: { top: 16 } },
          plugins: { legend: { display: true, position: 'top', labels: { color: CH('#B0B8C1'), font: { size: 13, weight: FW() }, generateLabels: metricsLegendGenerateLabels } },
            tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.raw}개` } } },
          scales: { x: { offset: true, ticks: { color: CH('#F2F4F6'), font: { size: 13, weight: FW() } }, grid: { display: false } },
            y: ddValueAxis({ grace: '10%', ticks: { color: CH('#8B95A1'), maxTicksLimit: 5, padding: 6, font: { size: 13, weight: FW() }, callback: v => Number.isInteger(v) ? v : '' } }) }
        }
      });
    }
