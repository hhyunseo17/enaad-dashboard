// ============================================================
// js/features/trend-portfolio-channel.js
// 메인 개요 차트: 트렌드/포트폴리오/채널/구간분포
// ============================================================
    function renderTrendChart() {
      const ctx = document.getElementById('chartTrend').getContext('2d'); if (chartInstances.trend) chartInstances.trend.destroy();
      const sortedMonths = [...new Set(filteredData.map(r => r.monthStr))].sort(); const categories = [...categoryOrderList];
      const datasets = categories.map(cat => {
        let cumulativeSum = 0;
        const data = sortedMonths.map(m => {
          const monthlyCatSum = filteredData.filter(r => r.monthStr === m && r.categoryReclassified === cat).reduce((sum, r) => sum + r.amount, 0) / 1e8;
          if (trendChartMode === 'cumulative') { cumulativeSum += monthlyCatSum; return cumulativeSum; } return monthlyCatSum;
        });
        return { label: cat, data: data, backgroundColor: ddBarFill(catColor(cat) || catColor('기타광고')), borderRadius: 0, ...ddStackSeparator(),
          datalabels: {
            display: (ctx) => cat === categories[categories.length - 1],
            anchor: 'end', align: 'top', offset: 4, color: dataLabelTextColor(), font: { size: 12, weight: FW() },
            formatter: (value, ctx) => { let total = 0; ctx.chart.data.datasets.forEach(ds => { total += ds.data[ctx.dataIndex] || 0; }); return total > 0 ? `${total.toFixed(1)}억` : ''; }
          }
        };
      });
      chartInstances.trend = new Chart(ctx, {
        type: 'bar', data: { labels: sortedMonths, datasets: datasets },
        options: {
          responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24 } },
          plugins: { legend: { display: true, position: 'top', labels: { color: CH('#B0B8C1'), font: { size: 12, weight: FW() } } },
            tooltip: { callbacks: { title: (t) => `귀속월: ${t[0].label}`, label: () => null, afterBody: (t) => {
                  let mt = 0; let bd = []; t[0].chart.data.datasets.forEach(ds => { const v = ds.data[t[0].dataIndex] || 0; mt += v; if (v > 0) bd.push(`  • ${ds.label}: ${v.toFixed(2)} 억원`); });
                  return [`💰 총 매출: ${mt.toFixed(2)} 억원`, ``, ...bd];
                }
              }
            }
          },
          scales: { x: { stacked: true, ticks: { color: CH('#F2F4F6'), font: { size: 12, weight: FW() } }, grid: { display: false } }, y: ddValueAxis({ stacked: true, ticks: { color: CH('#8B95A1'), maxTicksLimit: 5, padding: 6, callback: v => v + '억' } }) }
        }
      });
    }

    function renderPortfolioChart() {
      const ctx = document.getElementById('chartPortfolio').getContext('2d'); if (chartInstances.portfolio) chartInstances.portfolio.destroy();
      const groupMap = {}; filteredData.forEach(r => { const k = r[portfolioMode] || '기타'; groupMap[k] = (groupMap[k] || 0) + r.amount; });
      let sorted = Object.entries(groupMap);
      if (portfolioMode === 'broadDigital') sorted.sort((a, b) => (broadOrderMap[a[0]] || 99) - (broadOrderMap[b[0]] || 99)); else if (portfolioMode === 'categoryReclassified') sorted.sort((a, b) => categoryOrderList.indexOf(a[0]) - categoryOrderList.indexOf(b[0])); else { sorted.sort((a, b) => b[1] - a[1]); sorted = sorted.slice(0, 8); }
      const labels = sorted.map(s => s[0]); const dataVals = sorted.map(s => s[1] / 1e8);
      const bgColors = labels.map((k, i) => (portfolioMode === 'categoryReclassified' && catColor(k)) ? catColor(k) : seriesColor(i));

      const totalSum = dataVals.reduce((a,b) => a+b, 0) || 1;
      chartInstances.portfolio = new Chart(ctx, { type: 'doughnut', data: { labels: labels, datasets: [{ // 세그먼트 분리는 라운드/spacing이 아니라 '카드 배경색 테두리'로 낸다.
        // borderRadius는 링 두께에 비해 크면 작은 조각이 호가 아니라 알약처럼 뭉개지고,
        // spacing은 조각을 바깥으로 밀어 원이 어긋나 보인다. 배경색 테두리는 형태를 건드리지 않는다.
        data: dataVals, backgroundColor: (c) => ddArcFill(bgColors[c.dataIndex])(c), ddFlatList: bgColors, borderWidth: 0.3, borderColor: ddSurfaceColor(), borderAlign: 'inner', hoverOffset: 6,
        datalabels: {
          display: 'auto', color: '#FFFFFF', font: { size: 12, weight: FW() }, textStrokeColor: 'rgba(0,0,0,0.22)', textStrokeWidth: 1.5,
          formatter: (value) => `${((value / totalSum) * 100).toFixed(1)}%`
        }
      // cutout 68% → 60%. 링이 얇으면 비중이 작은 조각은 색면이 아니라 실선처럼 보여
      // 5대분류 계열색을 알아보기 어렵고, 안쪽 % 라벨도 호를 넘어간다.
      }] }, options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24 } }, cutout: '60%', plugins: { legend: { position: 'right', labels: { color: CH('#B0B8C1'), font: { size: 11, weight: FW() } } }, tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw.toFixed(2)} 억원 (${((ctx.raw / (dataVals.reduce((a,b)=>a+b,0)||1))*100).toFixed(1)}%)` } } } } });
    }

    function renderChannelChart() {
      const ctx = document.getElementById('chartChannel').getContext('2d'); if (chartInstances.channel) chartInstances.channel.destroy();
      const targetOrder = ['ENA', 'ENA DRAMA', 'ENA PLAY', 'ENA STORY', 'ONCE', 'OLIFE', 'ENA SPORTS', 'CHING', 'ONT', '헬스메디TV'];
      const channelMap = {}; filteredData.forEach(r => { channelMap[r.channel || '기타'] = true; });
      const labels = [...targetOrder]; let hasOther = false; Object.keys(channelMap).forEach(ch => { if (!targetOrder.includes(ch) && ch !== '(미지정)') hasOther = true; }); if (hasOther) labels.push('기타');
      const datasets = categoryOrderList.map(cat => {
        const data = labels.map(chLabel => { if (chLabel === '기타') return filteredData.filter(r => !targetOrder.includes(r.channel) && r.categoryReclassified === cat).reduce((s, r) => s + r.amount, 0) / 1e8; return filteredData.filter(r => r.channel === chLabel && r.categoryReclassified === cat).reduce((s, r) => s + r.amount, 0) / 1e8; });
        return { label: cat, data: data, backgroundColor: ddBarFill(catColor(cat) || catColor('기타광고')), borderRadius: 0, ...ddStackSeparator(),
          datalabels: {
            display: (ctx) => cat === categoryOrderList[categoryOrderList.length - 1],
            anchor: 'end', align: 'top', offset: 4, color: dataLabelTextColor(), font: { size: 11, weight: FW() },
            formatter: (value, ctx) => { let total = 0; ctx.chart.data.datasets.forEach(ds => { total += ds.data[ctx.dataIndex] || 0; }); return total > 0 ? total.toFixed(1) + '억' : ''; }
          }
        };
      });

      chartInstances.channel = new Chart(ctx, {
        type: 'bar', data: { labels: labels, datasets: datasets },
        options: {
          responsive: true, maintainAspectRatio: false, layout: { padding: { top: 24 } },
          plugins: { legend: { display: true, position: 'top', labels: { color: CH('#B0B8C1'), font: { size: 12, weight: FW() } } }, tooltip: { callbacks: { title: (t) => `채널명: ${t[0].label}`, label: () => null, afterBody: (t) => { let ct = 0; let bd = []; t[0].chart.data.datasets.forEach(ds => { const v = ds.data[t[0].dataIndex] || 0; ct += v; if (v > 0) bd.push(`  • ${ds.label}: ${v.toFixed(2)} 억원`); }); return [`💰 채널 매출: ${ct.toFixed(2)} 억원`, ``, ...bd]; } } } },
          scales: { x: { stacked: true, ticks: { color: CH('#F2F4F6'), font: { size: 12, weight: FW() } }, grid: { display: false } }, y: ddValueAxis({ stacked: true, type: channelScaleMode, ticks: { color: CH('#8B95A1'), maxTicksLimit: 5, padding: 6, callback: v => v + '억' } }) }
        }
      });
    }

    function renderAdvBucketChart() {
      const ctx = document.getElementById('chartAdvBucket').getContext('2d'); if (chartInstances.advBucket) chartInstances.advBucket.destroy();
      const targetData = filteredData.filter(r => isAdvMetricEligible(r));
      const advMonthMap = {}; targetData.forEach(r => { const key = r.monthStr + '||' + r.advertiser; advMonthMap[key] = (advMonthMap[key] || 0) + r.amount; });
      // x축 순서 = 이 객체의 키 순서. **작은 구간에서 큰 구간으로 오름차순**이라 1억 이상이 맨 오른쪽에 온다.
      // 구간별 피벗(detail-pivots.js의 bucketTierOrder)은 반대로 큰 금액이 위다 — 표는 첫 줄이
      // 제일 큰 것이어야 읽히고, 축은 왼쪽에서 오른쪽으로 커져야 읽히기 때문이라 일부러 다르게 둔다.
      // 아래 분류 if 체인은 값으로 구간을 고르므로 이 키 순서와 무관하다.
      const buckets = { '0.1억원 미만': { count: 0, sum: 0 }, '0.1~0.2억원': { count: 0, sum: 0 }, '0.2~0.3억원': { count: 0, sum: 0 }, '0.3~0.4억원': { count: 0, sum: 0 }, '0.4~0.5억원': { count: 0, sum: 0 }, '0.5~1억원': { count: 0, sum: 0 }, '1억 이상': { count: 0, sum: 0 } };
      Object.values(advMonthMap).forEach(amount => { if (amount > 0) { let bKey = ''; if (amount >= 100000000) bKey = '1억 이상'; else if (amount >= 50000000) bKey = '0.5~1억원'; else if (amount >= 40000000) bKey = '0.4~0.5억원'; else if (amount >= 30000000) bKey = '0.3~0.4억원'; else if (amount >= 20000000) bKey = '0.2~0.3억원'; else if (amount >= 10000000) bKey = '0.1~0.2억원'; else bKey = '0.1억원 미만'; buckets[bKey].count++; buckets[bKey].sum += amount; } });
      const labels = Object.keys(buckets); const countVals = labels.map(k => buckets[k].count); const sumVals = labels.map(k => buckets[k].sum / 1e8);

      // 꺾은선(광고주 수)이 쓰는 y1은 숨은 축이라 눈금은 아무 데도 안 보인다. 그래서 범위를
      // 자유롭게 잡아 **선이 앉는 높이만** 정할 수 있다.
      //
      // 0부터 시작하면 구간이 잘게 쪼개지는 오른쪽 끝에서 선이 바닥에 붙는다 — 광고주 수가
      // 한 자리로 떨어지는 구간에서 선이 x축과 겹쳐 읽히고, 그 위 막대와도 뒤엉킨다.
      // 축 아래쪽에 음수 여백을 두어 가장 낮은 점이 차트 높이의 LINE_FLOOR 아래로는
      // 내려오지 않게 한다.
      // (선이 이미 높이 떠 있으면 min은 0에 머문다 — 필요할 때만 밀어 올린다.)
      //
      // 위쪽 여백도 25%에서 10%로 줄인다. 광고주 수가 가장 많은 구간은 매출도 가장 큰 구간이라
      // 봉우리와 제일 높은 막대가 같은 자리에서 만나는데, 25%로는 둘이 3px까지 붙어 선의
      // 데이터라벨이 막대 라벨에 밀려 사라졌다. 여백을 줄이면 봉우리가 그만큼 위로 올라가
      // 막대 꼭대기와 벌어진다. 위로 넘칠 걱정은 없다 — layout.padding.top 32px이 받아 준다.
      const LINE_FLOOR = 0.28;
      const y1Max = Math.max(...countVals, 1) * 1.10;
      const y1Min = Math.min(0, (Math.min(...countVals) - LINE_FLOOR * y1Max) / (1 - LINE_FLOOR));

      chartInstances.advBucket = new Chart(ctx, {
        type: 'bar',
        // 막대=합산 매출액, 꺾은선=광고주 수. 색·라운드·라벨판 등 **꾸밈은 전부 형태에 붙어 있고**
        // 실어 나르는 값만 서로 바꿨다 — 꺾은선 라벨의 판(backgroundColor)과 offset은 선이 막대 위를
        // 지나가서 필요한 것이지 '매출액'이라서 붙은 게 아니므로, 내용이 바뀌어도 선 쪽에 남는다.
        data: { labels: labels, datasets: [ { type: 'bar', label: '합산 매출액', data: sumVals, backgroundColor: ddDuoFill(...ddDuoPair()), yAxisID: 'y', borderRadius: 6, order: 2,
          datalabels: { display: 'auto', anchor: 'end', align: 'top', color: dataLabelTextColor(), font: { size: 11, weight: FW() }, formatter: (v) => v > 0 ? v.toFixed(1) + '억' : '' }
        }, { type: 'line', label: '광고주 수', data: countVals, borderColor: RC('line'), backgroundColor: ddAreaFill(RC('line')), fill: true, tension: 0.35, borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: RC('line'), pointBorderWidth: 0, yAxisID: 'y1', order: 1,
          datalabels: { display: 'auto', anchor: 'end', align: 'top', offset: 8, color: dataLabelTextColor(),
            backgroundColor: ddSurfaceColor(), borderRadius: 4, padding: { top: 2, bottom: 1, left: 4, right: 4 },
            font: { size: 11, weight: FW() }, formatter: (v) => v > 0 ? v + '개' : '' }
        } ] },
        options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 32 } }, plugins: { legend: { display: true, position: 'top', labels: { color: CH('#B0B8C1'), padding: 20, font: { size: 12, weight: FW() } } }, tooltip: { callbacks: { title: (t) => `구간: ${t[0].label}`, label: (ctx) => ctx.dataset.type === 'bar' ? `합산 매출액: ${ctx.raw.toFixed(2)} 억원` : `광고주 수: ${ctx.raw.toLocaleString()} 개사` } } }, scales: { x: { ticks: { color: CH('#F2F4F6'), font: { size: 12, weight: FW() } }, grid: { display: false } },
          // 보이는 축(y)은 막대를 따라간다. 이제 억 단위라 stepSize:1을 뺐다 — 개수일 때는 눈금을
          // 정수로 묶는 값이었지만 억에 그대로 두면 1억 간격으로 눈금이 박혀 축이 뭉갠다.
          y: ddValueAxis({ type: 'linear', position: 'left', grace: '20%', ticks: { color: CH('#8B95A1'), maxTicksLimit: 5, padding: 6, callback: v => v + '억' } }), y1: { type: 'linear', position: 'right', min: y1Min, max: y1Max, display: false } } }
      });
    }

