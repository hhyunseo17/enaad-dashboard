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
    // 확인, 2026-09-15 — "260910 기준" 리포트인데 10~12월 CPRP·채널시청률이 전부 정확히 0). "최신
    // 달"을 고를 때 0은 "아직 안 채워짐"으로 보고 건너뛴다 — CPRP·시청률·GRP는 실제로 0이 나올 일이
    // 없는 지표라, 값 0을 진짜 데이터로 오인하면 KPI가 (안 채워진) 최신 달을 골라 0으로 찍힌다.
    function metricsRatingsLatestPeriod(metricCode, channel, indexMode, year) {
      if (!metricCode) return null;
      let months = metricsRatingsData.filter(r => r.metricCode === metricCode && r.channel === channel && r.indexMode === indexMode && r.year === year && r.value !== 0).map(r => r.month);
      if (metricsSelectedMonths.length > 0) months = months.filter(m => metricsSelectedMonths.includes(m)); // 월 선택 pill(비어있으면 전체)
      return months.length ? { year, month: Math.max(...months) } : null;
    }
    function metricsRatingsValueAt(metricCode, channel, indexMode, period) {
      if (!metricCode || !period) return null;
      const row = metricsRatingsData.find(r => r.metricCode === metricCode && r.channel === channel && r.indexMode === indexMode && r.year === period.year && r.month === period.month);
      return row ? row.value : null;
    }

    function renderMetricsRatingsKpis() {
      const channel = ENA_REPRESENTATIVE_CHANNEL;
      const idx = metricsIndexMode;

      // CPRP — File1 원본은 "천원" 단위라 ×1,000 해서 원 단위로 표기한다(plan 확정사항 3).
      const cprpCode = metricsFindMetricCode(METRICS_LABEL.cprp, idx);
      const cprpPeriod = metricsRatingsLatestPeriod(cprpCode, channel, idx, metricsSelectedYear);
      const cprpNow = metricsRatingsValueAt(cprpCode, channel, idx, cprpPeriod);
      const cprpMom = metricsRatingsValueAt(cprpCode, channel, idx, metricsPrevMonthPeriod(cprpPeriod));
      const cprpYoy = metricsRatingsValueAt(cprpCode, channel, idx, metricsPrevYearPeriod(cprpPeriod));
      document.getElementById('metricsKpiCprpValue').innerText = cprpNow !== null ? Math.round(cprpNow * 1000).toLocaleString() + ' 원' : '- 원';
      document.getElementById('metricsKpiCprpSub').innerText = cprpPeriod ? `${cprpPeriod.year}년 ${cprpPeriod.month}월(${idx}) · 원 단위 환산(×1,000)` : '경쟁채널 지표 현황 파일';
      metricsRenderBadge('metricsKpiCprpMomBadge', '전월', metricsGrowthPct(cprpNow, cprpMom), '%');
      metricsRenderBadge('metricsKpiCprpYoyBadge', '전년', metricsGrowthPct(cprpNow, cprpYoy), '%');

      // ENA 채널시청률 — 소수점 셋째 자리까지(plan 확정사항 3, File1 원본 정밀도를 살린다).
      const ratingCode = metricsFindMetricCode(METRICS_LABEL.rating, idx, true); // exact — "채널시청률 1%당 eq-GRPs"(08)와 접두어 충돌 방지
      const ratingPeriod = metricsRatingsLatestPeriod(ratingCode, channel, idx, metricsSelectedYear);
      const ratingNow = metricsRatingsValueAt(ratingCode, channel, idx, ratingPeriod);
      const ratingMom = metricsRatingsValueAt(ratingCode, channel, idx, metricsPrevMonthPeriod(ratingPeriod));
      const ratingYoy = metricsRatingsValueAt(ratingCode, channel, idx, metricsPrevYearPeriod(ratingPeriod));
      document.getElementById('metricsKpiRatingValue').innerText = ratingNow !== null ? ratingNow.toFixed(3) + ' %' : '- %';
      document.getElementById('metricsKpiRatingSub').innerText = ratingPeriod ? `${ratingPeriod.year}년 ${ratingPeriod.month}월(${idx})` : '경쟁채널 지표 현황 파일';
      metricsRenderBadge('metricsKpiRatingMomBadge', '전월', metricsPointDiff(ratingNow, ratingMom), '%p');
      metricsRenderBadge('metricsKpiRatingYoyBadge', '전년', metricsPointDiff(ratingNow, ratingYoy), '%p');

      // 시청률 1%당 매출 — File1 원본값 그대로(재계산 안 함), 일평균/프라임타임 토글과 무관하게
      // 항상 '전체' 기준으로 고정한다(plan 확정사항 4 — M/S와 마찬가지로 이 토글의 영향을 받지 않는다).
      const rprCode = metricsFindMetricCode(METRICS_LABEL.revPerRating, '전체');
      const rprPeriod = metricsRatingsLatestPeriod(rprCode, channel, '전체', metricsSelectedYear);
      const rprNow = metricsRatingsValueAt(rprCode, channel, '전체', rprPeriod);
      const rprMom = metricsRatingsValueAt(rprCode, channel, '전체', metricsPrevMonthPeriod(rprPeriod));
      const rprYoy = metricsRatingsValueAt(rprCode, channel, '전체', metricsPrevYearPeriod(rprPeriod));
      document.getElementById('metricsKpiRevPerRatingValue').innerText = rprNow !== null ? metricsFmtNum(rprNow, 2) + ' 억원' : '- 억원';
      document.getElementById('metricsKpiRevPerRatingSub').innerText = rprPeriod ? `${rprPeriod.year}년 ${rprPeriod.month}월 · 파일 원본값(일평균 기준, 토글 무관)` : '경쟁채널 지표 현황 파일';
      metricsRenderBadge('metricsKpiRevPerRatingMomBadge', '전월', metricsGrowthPct(rprNow, rprMom), '%');
      metricsRenderBadge('metricsKpiRevPerRatingYoyBadge', '전년', metricsGrowthPct(rprNow, rprYoy), '%');
    }

    // ------------------------------------------------------------
    // CPRP / 채널시청률 / eq-GRPs 미니 트렌드 3종 — 매출 비교와 같은 채널 선택을 공유(plan 확정사항).
    // ------------------------------------------------------------
    function renderMetricsMiniTrendChart(canvasId, chartKey, metricCode, valueMultiplier, valueSuffix, decimals) {
      const canvas = document.getElementById(canvasId); if (!canvas) return;
      if (chartInstances[chartKey]) { chartInstances[chartKey].destroy(); chartInstances[chartKey] = null; }
      if (!metricCode) return; // 해당 라벨의 지표를 File1에서 찾지 못함 — 빈 캔버스로 둔다.

      // value===0인 달은 제외한다 — File1의 미보고 미래 달 placeholder(위 metricsRatingsLatestPeriod
      // 주석 참고). 안 걸러내면 트렌드 끝부분이 0으로 뚝 떨어져 보인다.
      let months = [...new Set(metricsRatingsData.filter(r => r.metricCode === metricCode && r.indexMode === metricsIndexMode && r.year === metricsSelectedYear && r.value !== 0).map(r => r.month))].sort((a, b) => a - b);
      if (metricsSelectedMonths.length > 0) months = months.filter(m => metricsSelectedMonths.includes(m)); // 월 선택 pill(비어있으면 전체)
      const labels = months.map(m => `${m}월`);
      const channels = metricsRatingsChannelSelection();

      const datasets = channels.map((ch, idx) => {
        const color = ch === ENA_REPRESENTATIVE_CHANNEL ? RC('curr') : seriesColor(idx);
        const data = months.map(m => {
          const row = metricsRatingsData.find(r => r.metricCode === metricCode && r.indexMode === metricsIndexMode && r.year === metricsSelectedYear && r.month === m && r.channel === ch);
          return row ? row.value * valueMultiplier : null;
        });
        return { label: ch, data, borderColor: color, backgroundColor: color, fill: false, tension: 0.3, borderWidth: ch === ENA_REPRESENTATIVE_CHANNEL ? 3 : 2, pointRadius: 2.5, spanGaps: true };
      });

      const ctx = canvas.getContext('2d');
      chartInstances[chartKey] = new Chart(ctx, {
        type: 'line', data: { labels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false, layout: { padding: { top: 16 } },
          plugins: { legend: { display: true, position: 'top', labels: { color: CH('#B0B8C1'), font: { size: 10, weight: FW() }, boxWidth: 10 } },
            tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.raw !== null ? metricsFmtNum(c.raw, decimals) : '-'}${valueSuffix}` } } },
          scales: { x: { offset: true, ticks: { color: CH('#F2F4F6'), font: { size: 10, weight: FW() } }, grid: { display: false } },
            y: ddValueAxis({ ticks: { color: CH('#8B95A1'), maxTicksLimit: 4, padding: 4, callback: v => metricsFmtNum(v, decimals <= 1 ? 0 : decimals) + valueSuffix } }) }
        }
      });
    }
    function renderMetricsCprpTrendChart() { renderMetricsMiniTrendChart('chartMetricsCprpTrend', 'metricsCprpTrend', metricsFindMetricCode(METRICS_LABEL.cprp, metricsIndexMode), 1000, '원', 0); }
    function renderMetricsRatingTrendChart() { renderMetricsMiniTrendChart('chartMetricsRatingTrend', 'metricsRatingTrend', metricsFindMetricCode(METRICS_LABEL.rating, metricsIndexMode, true), 1, '%', 3); }
    function renderMetricsGrpTrendChart() { renderMetricsMiniTrendChart('chartMetricsGrpTrend', 'metricsGrpTrend', metricsFindMetricCode(METRICS_LABEL.grp, metricsIndexMode), 1, '', 1); }

    // ------------------------------------------------------------
    // 지표별 값 표기 — 지표마다 단위가 다르므로(%, 원, GRP, 억원, 건수…) pvFormatCell(금액 전용,
    // ÷1,000,000)을 쓸 수 없다. metricLabel 텍스트로 단위를 판별한다.
    // "08. 채널시청률 1%당 eq-GRPs"가 '시청률'을 포함하면서 '매출'은 없는 라벨이라 GRP 체크를
    // 먼저 해야 한다 — 순서를 바꾸면(시청률 체크가 먼저면) 08이 %로 잘못 찍힌다(실 샘플로 확인,
    // 2026-09-15). 나머지(광고주수/브랜드수 등)는 전부 건수라 마지막 분기(숫자만)로 충분하다.
    // ------------------------------------------------------------
    function metricsFormatRatingValue(metricLabel, value) {
      if (value === null || value === undefined) return '-';
      if (metricLabel.includes('CPRP')) return Math.round(value * 1000).toLocaleString() + '원';
      if (metricLabel.includes('시청률') && metricLabel.includes('매출')) return metricsFmtNum(value, 2) + '억원';
      if (metricLabel.includes('GRP')) return metricsFmtNum(value, 1);
      if (metricLabel.includes('시청률')) return value.toFixed(3) + '%';
      return value.toLocaleString(undefined, { maximumFractionDigits: 2 }); // 광고주수/브랜드수 등 — 전부 건수
    }

    // ------------------------------------------------------------
    // 상세표 티저 — metricsMain 하단, 전체 지표 중 앞 6개만 보여준다("더 보기" → metricsDetail).
    // ------------------------------------------------------------
    function renderMetricsDetailTeaser() {
      const head = document.getElementById('metricsDetailTeaserHead');
      const body = document.getElementById('metricsDetailTeaserBody');
      if (!head || !body) return;
      const channels = metricsRatingsChannelSelection();
      const scoped = metricsRatingsData.filter(r => r.indexMode === metricsIndexMode);
      const period = metricsLatestPeriod(scoped, metricsSelectedYear);

      head.innerHTML = `<th style="text-align:left;">지표</th>` + channels.map(c => `<th style="text-align:right;">${c}</th>`).join('');
      if (!period) { body.innerHTML = `<tr><td colspan="${channels.length + 1}" style="text-align:center; color:var(--text-tertiary); padding:16px;">선택 연도에 데이터가 없습니다</td></tr>`; return; }

      const labels = [...new Set(scoped.map(r => r.metricLabel))].slice(0, 6);
      body.innerHTML = labels.map(label => {
        const cells = channels.map(ch => {
          const row = scoped.find(r => r.metricLabel === label && r.channel === ch && r.year === period.year && r.month === period.month);
          return `<td style="text-align:right;">${metricsFormatRatingValue(label, row ? row.value : null)}</td>`;
        }).join('');
        return `<tr><td>${label}</td>${cells}</tr>`;
      }).join('');
    }

    // ------------------------------------------------------------
    // metricsDetail — File1 16개 지표 × 채널 전체 상세(연도별 월 열). "정적 트리 표"(1차 버전 —
    // 드래그앤드롭 빌더는 없다). pvBuildTree/pvBuildVisibleColumns/pvRenderColumnHeaderRows(전부
    // 범용, 금액 가정 없음)는 그대로 재사용하고, 행 렌더·셀 포맷만 지표별로 자체 작성한다 —
    // pvRenderRows/pvFormatCell은 모든 값을 금액(÷1,000,000)으로 가정해 그대로 쓸 수 없다
    // (js/features/pivot-builder.js의 PIVOT_PRESETS.metricsDetail 주석 참고).
    // ------------------------------------------------------------
    function renderMetricsDetailPivot() {
      const preset = PIVOT_PRESETS.metricsDetail;
      preset.key = 'metricsDetail';
      const cfg = pvConfigFor('metricsDetail');
      const rowFields = cfg.rows, colFields = cfg.columns;
      const rows = metricsRatingsData.filter(r => r.indexMode === metricsIndexMode);

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
      metricsRenderDetailRows(root, 0, [], visibleColumns, rowFields, preset.expandedRows(), out);
      document.getElementById('metricsDetailTableBody').innerHTML = mapPivotHtml(out.join(''));
    }

    // pvRenderRows와 같은 트리 재귀 구조이지만, 셀 포맷이 1단계 행 값(지표명)에 따라 달라진다는
    // 점만 다르다 — 그래서 그 하나를 위해 엔진 함수를 그대로 못 쓰고 이 얇은 사본을 둔다.
    function metricsRenderDetailRows(node, depth, ancestorPath, visibleColumns, rowFields, expandedRows, out) {
      const hasMore = depth + 1 < rowFields.length;
      const keys = Object.keys(node.children).sort((a, b) => pvCompareNames(a, b));
      const rowMetricLabel = depth === 0 ? null : ancestorPath[0]; // 채널(depth1) 행의 포맷 기준은 부모(지표) 라벨

      keys.forEach(k => {
        const child = node.children[k];
        const path = ancestorPath.concat(k);
        const pathKey = path.join('||');
        const isExpanded = !!expandedRows[pathKey];
        const thisMetricLabel = depth === 0 ? k : rowMetricLabel;
        const toggle = hasMore ? `<span class="toggle-icon" onclick="togglePvRowNode('metricsDetail','${pvEsc(pathKey)}')">${isExpanded ? '-' : '+'}</span>` : '';
        const st = depth === 0 ? 'background:#1E293B; color:#F8FAFC; font-weight:700;' : 'background:#151C2C; color:#CBD5E1;';
        let html = `<tr><td class="indent-step-${Math.min(depth + 1, 5)}" style="${st}">${toggle}${k}</td>`;
        visibleColumns.forEach(col => {
          const m = pvMergeMetrics(child, col.leafKeys);
          const val = m ? m.sums.value : null;
          html += `<td style="text-align:right;">${metricsFormatRatingValue(thisMetricLabel, val === undefined ? null : val)}</td>`;
        });
        html += `</tr>`;
        out.push(html);
        if (hasMore && isExpanded) metricsRenderDetailRows(child, depth + 1, path, visibleColumns, rowFields, expandedRows, out);
      });
    }
