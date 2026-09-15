// ============================================================
// js/core/metrics-data-loader.js
// 지표 대시보드(경쟁채널 벤치마크) 전용 데이터 연결 — data-loader.js 다음, features/* 이전 로드
//
// File1(경쟁채널 지표 현황)·File2(매체별 광고비 raw)는 원래 R2에서 xlsx로 직접 서빙했으나,
// 이 Cloudflare Pages 프로젝트에서 R2 바인딩이 원인 불명으로 전혀 붙지 않는 문제가 있어(2026-09-15,
// 이름을 바꿔 새로 만들어도 재현 — DASHBOARD_BUCKET/TEST_BUCKET 둘 다 env에 안 잡힘. SUPABASE_URL 등
// 일반 변수는 정상 작동) Supabase로 옮겼다. scripts/etl/load-competitor-data.mjs가 두 엑셀을 미리
// long-format으로 파싱해 competitor_ratings/competitor_revenue 테이블에 적재해두면, 여기서는
// /api/competitor-ratings·/api/competitor-revenue(supabase-proxy 경유, requireMetricsAccess로 이메일
// 허용목록 검사)로 이미 정리된 JSON을 그대로 받는다 — SheetJS 파싱은 이제 이 파일에 없다(ETL 쪽에만
// 있음, 두 파싱 로직은 동일한 코드를 유지할 것 — scripts/etl/load-competitor-data.mjs 상단 주석 참고).
// ENA 자신의 수치는 외부 추정치보다 내부 매출(rawData)이 정확하므로, File2에서 KT ENA 쪽 매출만
// 내부 값으로 치환한다(자세한 배경은 docs/features/metrics-dashboard.md).
//
// 지연 로딩 대상: 부팅 시(init.js)가 아니라 "지표 대시보드" 탭을 처음 열 때 fetchMetricsDataHttp()가
// 1회 호출된다(호출부는 js/features/metrics-dashboard.js). 이 파일은 fetch/치환만 담당하고
// 렌더링은 전혀 하지 않는다 — data-loader.js가 rawData까지만 책임지는 것과 같은 경계.
// ============================================================

    // ------------------------------------------------------------
    // ENA/CATV 화이트리스트
    // ------------------------------------------------------------
    // File2 `변환용` 시트의 채널그룹 값. KT ENA 계열 전체를 가리키는 상수 — 사업자 비교(①)의 자사 그룹 키.
    const ENA_CHANNEL_GROUP = 'KT ENA';
    // File1(`변환용취합`)은 채널별로 ENA/ENA DRAMA/ENA PLAY/ENA STORY 4개만 있고 "KT ENA 합계" 행이
    // 없다(plan 확정사항 5) — 그래서 CPRP·채널시청률 등 File1 기반 지표는 대표채널 하나만 쓴다.
    const ENA_CHANNELS = ['ENA', 'ENA DRAMA', 'ENA PLAY', 'ENA STORY'];
    // File1 기반 지표(CPRP/채널시청률/eq-GRPs 등)에서 비교 의미가 약한 DRAMA/PLAY/STORY는 빼고
    // 대표채널 "ENA" 단일값만 쓴다(plan 확정사항 5).
    const ENA_REPRESENTATIVE_CHANNEL = 'ENA';
    // rawData(메인 매출 데이터셋) 쪽 KT ENA 계열 채널 전체 — js/core/filters.js의 updateFilterCheckboxes()
    // 안에 있는 targetOrder 배열과 동일 목록이다(그 배열은 함수 지역 스코프라 여기서 재사용할 수 없어
    // 그대로 복제해 둔다 — 값이 바뀌면 두 곳을 함께 고칠 것). File2의 "KT ENA" 채널그룹 11개
    // 세부채널(ENA/ENA DRAMA/ENA PLAY/ENA STORY/ONCE/OLIFE/CHING/ONT/헬스메디TV/ENA SPORTS/기타광고매출)과는
    // 이름이 정확히 1:1 대응하지 않는다(예: rawData에는 "기타광고매출"이라는 채널명이 없다) — 그래서
    // computeEnaMonthlyRevenue()는 File2 쪽 세부채널을 따라가지 않고 rawData 쪽 이 목록으로 직접 합산한다.
    const KT_ENA_FAMILY_CHANNELS = ['ENA', 'ENA DRAMA', 'ENA PLAY', 'ENA STORY', 'ONCE', 'OLIFE', 'ENA SPORTS', 'CHING', 'ONT', '헬스메디TV'];

    // ------------------------------------------------------------
    // 전역 상태 (data-loader.js의 rawData/filteredData와 같은 방식 — 평범한 top-level let)
    // ------------------------------------------------------------
    let metricsRevenueDataOriginal = []; // File2 파싱 원본(long-format), 절대 손대지 않는다 — 캐시로만 유지
    let metricsRevenueData = [];         // 취급고/회계 토글에 따라 KT ENA 부분을 내부값으로 치환한 파생 배열 — 렌더는 이것만 읽는다
    let metricsRatingsData = [];         // File1 파싱 결과(long-format), 01/02.광고매출 행은 제외
    let metricsDataLoaded = false;       // fetchMetricsDataHttp() 성공 여부
    let metricsDataFetchPromise = null;  // 진행 중이거나 완료된 fetch를 캐시 — 지연 로딩을 호출부가 여러 번 트리거해도 1회만 fetch
    // 취급고/회계(매출기준)는 이 탭 전용 상태(metricsBasisMode)를 따로 두지 않는다 — "취급고를
    // 누르면 매출 대시보드의 취급고 숫자를, 회계를 누르면 회계 숫자를 가져와 KT ENA/ENA 채널 매출로
    // 쓴다"는 개념(2026-09-15, 사용자 요청)이라, 이 탭에도 버튼은 있지만(dashboard.html) 항상 메인
    // 대시보드와 공유하는 전역 revenueBasisMode(state.js)를 직접 바꾼다 — 두 화면이 항상 같은 값을
    // 보게 하기 위해서다(setMetricsRevenueBasis(), metrics-dashboard.js).

    const METRICS_RATINGS_URL = '/api/competitor-ratings';
    const METRICS_REVENUE_URL = '/api/competitor-revenue';

    // ------------------------------------------------------------
    // fetchMetricsDataHttp() — 지연 로딩 진입점
    // ------------------------------------------------------------
    // js/core/data-loader.js의 fetchDataSupabase()와 동일한 패턴 — getAuthorizationHeader()로 JWT를
    // Authorization 헤더에 실어 /api/* 프록시를 부른다(credentials:'include'는 이제 불필요 — R2
    // 직접 서빙 때 쓰던 방식). idempotent: 이미 진행 중이거나 끝난 fetch가 있으면 그 프라미스를
    // 그대로 돌려준다(중복 fetch 방지). 실패하면 캐시를 비워서 다음 호출(탭 재진입 등)이 재시도할 수 있게 한다.
    function fetchMetricsDataHttp() {
      if (metricsDataFetchPromise) return metricsDataFetchPromise;

      const fetchJson = (url) => getAuthorizationHeader().then(authHeader =>
        fetch(url, { cache: 'no-store', headers: authHeader ? { Authorization: authHeader } : {} })
      ).then(res => {
        if (res.status === 403) throw new Error('경쟁채널 지표 열람 권한이 없습니다.');
        if (!res.ok) {
          return res.text().then(body => {
            throw new Error(`HTTP Error ${res.status} (${url})${body ? ' — ' + body.slice(0, 300) : ''}`);
          });
        }
        return res.json();
      });

      // Supabase 행은 snake_case(ETL이 그렇게 적재 — scripts/etl/load-competitor-data.mjs)라
      // 나머지 코드 전체가 기대하는 camelCase 필드명으로 변환한다. 필드명 매핑 외 가공 없음
      // (정규화·치환·파싱은 ETL 쪽에서 이미 끝난 채로 들어온다).
      metricsDataFetchPromise = Promise.all([
        fetchJson(METRICS_RATINGS_URL),
        fetchJson(METRICS_REVENUE_URL)
      ]).then(([ratingsRows, revenueRows]) => {
        metricsRatingsData = ratingsRows.map(r => ({
          year: r.year, indexMode: r.index_mode, metricCode: r.metric_code, metricLabel: r.metric_label,
          channel: r.channel, month: r.month, value: Number(r.value)
        }));
        metricsRevenueDataOriginal = revenueRows.map(r => ({
          channel: r.channel, operatorMajor: r.operator_major, operatorMid: r.operator_mid,
          channelGroup: r.channel_group, year: r.year, month: r.month, revenue: Number(r.revenue)
        }));
        injectOperatorRevenueFromRatings();
        rebuildMetricsSubstitution();
        metricsDataLoaded = true;
        return { ratings: metricsRatingsData, revenue: metricsRevenueData };
      }).catch(err => {
        metricsDataFetchPromise = null; // 재시도 가능하도록 캐시 해제
        metricsDataLoaded = false;
        console.error('[metrics-data-loader] 지표 대시보드 데이터 로드 실패:', err);
        throw err;
      });

      return metricsDataFetchPromise;
    }

    // ------------------------------------------------------------
    // computeEnaMonthlyRevenue() — 메인 매출 데이터셋(rawData)에서 ENA 자체 월매출 재계산
    // ------------------------------------------------------------
    // js/features/kpi.js의 matchesCurrentBasis(kpi.js:114-116)와 같은 규칙(취급고=실적만/회계=
    // 실적+회계조정)을 이 파일 자체 함수로 복제한 것 — 전역 revenueBasisMode를 그대로 읽는 건
    // 똑같지만, core(metrics-data-loader.js)가 features(kpi.js)의 함수를 直접 호출하면 레이어가
    // 거꾸로 의존하게 돼(스크립트 로드 순서 관례 위반) 직접 호출하지 않고 복제해 둔다.
    function matchesMetricsBasis(r) {
      return revenueBasisMode === 'accounting' || r.revenueBasis === '실적';
    }

    // channelFilter 생략 시 KT_ENA_FAMILY_CHANNELS 전체 합(= File2 "채널그룹=KT ENA" 치환용),
    // channelFilter 지정 시(예: 'ENA') 그 단일 rawData.channel 값만 합산(= File2 대표채널 'ENA' 치환용).
    function computeEnaMonthlyRevenue(year, month, channelFilter) {
      if (!rawData || rawData.length === 0) return 0;
      const channels = channelFilter ? [channelFilter] : KT_ENA_FAMILY_CHANNELS;
      return rawData
        .filter(r => r.bonbuRevenueStatus === '본부매출'
          && matchesMetricsBasis(r)
          && r.year === year && r.month === month
          && channels.includes(r.channel))
        .reduce((sum, r) => sum + r.amount, 0);
    }

    // File1 "01.방송사업자 광고매출" 채널명(사업자 단위) → File2 채널그룹명. 표기가 갈리는 5개만
    // 적어둔다(실 샘플로 확인, 2026-09-15) — 나머지 9개(KBS/KT ENA/JTBC/TV조선/채널A/MBN/KBS N/
    // 티캐스트/iHQ)는 두 파일에서 이름이 같다. 이건 File1 채널명→File2 그룹명 방향(매출 주입용)이고,
    // metrics-dashboard.js의 CPRP/채널시청률/eq-GRPs용 대표채널 목록(METRICS_RATINGS_FIXED_CHANNELS)과는
    // 용도가 다르다 — 그쪽은 사업자→채널 매핑이 아니라 고정된 대표채널 목록이다(2026-09-15 변경).
    const RATINGS_OPERATOR_TO_REVENUE_GROUP = {
      'CJ ENM': 'CJENM', 'MBC Plus': 'MBC PLUS', 'MBC(전국)': 'MBC', 'SBS 계열': 'SBS미디어넷', 'SBS(민방포함)': 'SBS'
    };

    // ------------------------------------------------------------
    // injectOperatorRevenueFromRatings() — "사업자 비교" 매출의 소스를 File2 채널그룹 합산에서
    // File1 "01.방송사업자 광고매출"로 바꾼다(2026-09-15, 사용자 요청 — 세부 채널별 매출은 계속
    // File2를 쓰고, 사업자 단위 총액만 File1이 직접 보고하는 값을 쓴다).
    // ------------------------------------------------------------
    // metricsGroupRevenueMap()(metrics-dashboard.js)은 이미 "채널그룹 자기참조 행(channel===
    // channelGroup)이 있으면 그 값을 그룹 합계로 우선한다"는 로직을 갖고 있다 — 그래서 그 자기참조
    // 행 자체를 File1 값으로 만들어 두면, M/S·랭킹·트렌드·KPI 등 나머지 코드는 전혀 안 건드려도
    // 자동으로 File1 기반 사업자 매출을 쓰게 된다. File1엔 사업자대분류/중분류(범위 토글용)가 없어
    // File2 쪽 같은 채널그룹의 값을 이름으로 조인해서 그대로 가져온다 — 대응하는 File2 채널그룹이
    // 없는 사업자(예: 이번 리포트에 새로 추가된 곳)는 조용히 건너뛰고 기존 File2 합산 폴백을 쓴다.
    // KT ENA 자기참조 행도 여기서 File1 값으로 먼저 채워지지만, rebuildMetricsSubstitution()이
    // 뒤이어 무조건 내부 실측치로 덮어쓰므로(어느 쪽이 원본이었든) 결과에 영향 없다.
    function injectOperatorRevenueFromRatings() {
      const scopeByGroup = {};
      metricsRevenueDataOriginal.forEach(r => {
        if (!scopeByGroup[r.channelGroup]) scopeByGroup[r.channelGroup] = { operatorMajor: r.operatorMajor, operatorMid: r.operatorMid };
      });

      const injected = [];
      // File1은 미보고 미래월도 0으로 채워 내보낸다(다른 지표들과 동일한 placeholder — 이미
      // metricsRatingsLatestPeriod()/renderMetricsMiniTrendChart()에서 value!==0으로 걸러낸 문제와 같은
      // 원인). 여기서 걸러내지 않으면 그 0행이 채널그룹 자기참조 매출로 주입되어 metricsRevenueData에
      // 실제 데이터 없는 미래월(예: 10~12월)이 "존재하는 월"처럼 섞여 들어간다(월별 매출/M-S 차트에
      // 없는 달이 0으로 나타나는 원인이었다, 2026-09-15).
      metricsRatingsData.filter(r => r.metricCode === '01' && r.value !== 0).forEach(r => {
        const group = RATINGS_OPERATOR_TO_REVENUE_GROUP[r.channel] || r.channel;
        const scope = scopeByGroup[group];
        if (!scope) return; // File2에 대응 채널그룹 없음 — 기존 합산 폴백 유지
        injected.push({
          channel: group, channelGroup: group, operatorMajor: scope.operatorMajor, operatorMid: scope.operatorMid,
          year: r.year, month: r.month, revenue: Math.round(r.value * 1000000) // File1도 백만원 단위(File2와 동일)
        });
      });
      if (injected.length === 0) return;

      const injectedKeys = new Set(injected.map(r => r.channelGroup + '|' + r.year + '|' + r.month));
      metricsRevenueDataOriginal = metricsRevenueDataOriginal
        .filter(r => !(r.channel === r.channelGroup && injectedKeys.has(r.channelGroup + '|' + r.year + '|' + r.month)))
        .concat(injected);
    }

    // ------------------------------------------------------------
    // rebuildMetricsSubstitution() — 취급고/회계 토글이 바뀔 때마다 UI가 호출
    // ------------------------------------------------------------
    // metricsRevenueDataOriginal(캐시, 불변)을 기준으로 KT ENA 관련 두 종류의 행만 내부 재계산값으로
    // 덮어써 metricsRevenueData(파생본)를 새로 만든다. KT ENA 그룹이 아닌 나머지 경쟁사 행은 손대지 않는다.
    //
    // ① "채널그룹='KT ENA' 합계" 행 — File2 원본에 채널명이 자기 채널그룹명과 같은 자기참조 행
    //    (channel === channelGroup)이 있다면 그 행을 그룹 합계로 간주해 덮어쓴다(사업자 비교용).
    //    ⚠ 검증 불가 지점: 샘플 파일이 없어 File2가 실제로 이런 자기참조 합계 행을 포함하는지
    //    확인하지 못했다. 만약 원본에 그런 행이 없다면(개별 세부채널 행만 있다면) 아래에서
    //    월별로 부족분을 합성해 추가한다 — 어느 쪽이든 사업자 비교 모드가 항상 채널그룹 합계
    //    행 하나를 찾을 수 있게 하기 위함.
    // ② 개별 "채널='ENA'" 행 — 대표채널 비교용. computeEnaMonthlyRevenue(y, m, 'ENA')로 교체.
    // KT ENA 그룹의 나머지 세부채널 행(ONCE/OLIFE/CHING/ONT/헬스메디TV/ENA SPORTS/기타광고매출 등)은
    // 원본 그대로 둔다 — plan에 따르면 세부 채널별 대응은 불필요하고 그룹 단위 치환만 하면 된다.
    // basisMode 인자 없음 — computeEnaMonthlyRevenue()가 전역 revenueBasisMode를 직접 읽으므로
    // (위 "취급고/회계는 메인 대시보드를 그대로 따른다" 참고) 호출부가 값을 넘길 필요가 없다.
    function rebuildMetricsSubstitution() {
      if (!Array.isArray(metricsRevenueDataOriginal) || metricsRevenueDataOriginal.length === 0) {
        metricsRevenueData = [];
        return;
      }

      const ymKey = (y, m) => y + '-' + m;
      const totalCache = {};   // ① 그룹 합계 캐시 (연-월 단위, 이번 호출 범위 내에서만 유효)
      const channelCache = {}; // ② 대표채널 ENA 캐시

      metricsRevenueData = metricsRevenueDataOriginal.map(row => {
        if (row.channelGroup !== ENA_CHANNEL_GROUP) return row; // KT ENA 그룹이 아니면 원본 그대로

        const key = ymKey(row.year, row.month);

        if (row.channel === row.channelGroup) { // ① 그룹 자기참조 합계 행
          if (!(key in totalCache)) totalCache[key] = computeEnaMonthlyRevenue(row.year, row.month);
          return Object.assign({}, row, { revenue: totalCache[key] });
        }

        if (row.channel === ENA_REPRESENTATIVE_CHANNEL) { // ② 대표채널 ENA 개별 행
          if (!(key in channelCache)) channelCache[key] = computeEnaMonthlyRevenue(row.year, row.month, ENA_REPRESENTATIVE_CHANNEL);
          return Object.assign({}, row, { revenue: channelCache[key] });
        }

        return row; // KT ENA 그룹의 나머지 세부채널 — 원본 유지
      });

      // 원본에 ① 자기참조 합계 행이 아예 없었던 연-월은 합성해서 추가한다(위 주석의 검증 불가 지점 대응).
      const presentTotalKeys = new Set(
        metricsRevenueData
          .filter(r => r.channelGroup === ENA_CHANNEL_GROUP && r.channel === r.channelGroup)
          .map(r => ymKey(r.year, r.month))
      );
      const allKtEnaKeys = new Set();
      const sampleByKey = {};
      metricsRevenueDataOriginal.forEach(r => {
        if (r.channelGroup !== ENA_CHANNEL_GROUP) return;
        const key = ymKey(r.year, r.month);
        allKtEnaKeys.add(key);
        if (!sampleByKey[key]) sampleByKey[key] = r;
      });
      allKtEnaKeys.forEach(key => {
        if (presentTotalKeys.has(key)) return;
        const sample = sampleByKey[key];
        if (!(key in totalCache)) totalCache[key] = computeEnaMonthlyRevenue(sample.year, sample.month);
        metricsRevenueData.push({
          channel: ENA_CHANNEL_GROUP, operatorMajor: sample.operatorMajor, operatorMid: sample.operatorMid,
          channelGroup: ENA_CHANNEL_GROUP, year: sample.year, month: sample.month, revenue: totalCache[key]
        });
      });
    }
