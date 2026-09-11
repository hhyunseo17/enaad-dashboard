// ============================================================
// js/core/metrics-data-loader.js
// 지표 대시보드(경쟁채널 벤치마크) 전용 데이터 연결·파싱 — data-loader.js 다음, features/* 이전 로드
//
// File1(경쟁채널 지표 현황, R2 키 competitor-ratings.xlsx)과 File2(매체별 광고비 raw,
// R2 키 competitor-revenue.xlsx)를 functions/competitor-ratings.js / functions/competitor-revenue.js
// 프록시로 받아 파싱한다. ENA 자신의 수치는 외부 추정치보다 내부 매출(rawData)이 정확하므로,
// File2에서 KT ENA 쪽 매출만 내부 값으로 치환한다(자세한 배경은 docs/features/metrics-dashboard.md).
//
// 지연 로딩 대상: 부팅 시(init.js)가 아니라 "지표 대시보드" 탭을 처음 열 때 fetchMetricsDataHttp()가
// 1회 호출된다(호출부는 js/features/metrics-dashboard.js). 이 파일은 fetch/parse/치환만 담당하고
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
    // 이 탭 전용 취급고/회계 토글 기본값. 메인 대시보드의 revenueBasisMode(state.js)와 절대 공유하지 않는다
    // (plan 확정사항 2) — UI가 토글을 바꿀 때마다 이 값을 갱신하고 rebuildMetricsSubstitution(newMode)를 부른다.
    let metricsBasisMode = 'performance';

    const METRICS_RATINGS_URL = './competitor-ratings';
    const METRICS_REVENUE_URL = './competitor-revenue';
    const REVENUE_SHEET_NAME = '변환용';
    const RATINGS_SHEET_NAME = '변환용취합';
    const YM_COL_REGEX = /^(\d{4})-(\d{2})$/;
    const RATINGS_MONTH_COLS = Array.from({ length: 12 }, (_, i) => String(i + 1));

    // ------------------------------------------------------------
    // fetchMetricsDataHttp() — 지연 로딩 진입점
    // ------------------------------------------------------------
    // fetchDataHttp()(data-loader.js)와 동일한 상대경로+캐시버스팅+credentials:'include' 패턴을 쓴다.
    // idempotent: 이미 진행 중이거나 끝난 fetch가 있으면 그 프라미스를 그대로 돌려준다(중복 fetch 방지).
    // 실패하면 캐시를 비워서 다음 호출(탭 재진입 등)이 재시도할 수 있게 한다.
    function fetchMetricsDataHttp() {
      if (metricsDataFetchPromise) return metricsDataFetchPromise;

      const fetchWorkbook = (url) => {
        const cacheBustUrl = url + '?t=' + Date.now();
        return fetch(cacheBustUrl, { cache: 'no-store', credentials: 'include' })
          .then(res => {
            if (!res.ok) throw new Error(`HTTP Error ${res.status} (${url})`);
            if (res.url && res.url.includes('cloudflareaccess.com')) throw new Error('Cloudflare Access authentication required');
            return res.arrayBuffer();
          })
          .then(buf => XLSX.read(buf, { type: 'array' }));
      };

      metricsDataFetchPromise = Promise.all([
        fetchWorkbook(METRICS_RATINGS_URL),
        fetchWorkbook(METRICS_REVENUE_URL)
      ]).then(([ratingsWb, revenueWb]) => {
        metricsRatingsData = parseCompetitorRatingsWorkbook(ratingsWb);
        metricsRevenueDataOriginal = parseCompetitorRevenueWorkbook(revenueWb);
        rebuildMetricsSubstitution(metricsBasisMode);
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

    // 채널명 whitespace 정규화 — 원본에 'ENA PLAY '처럼 trailing space가 섞여 있는 경우가 실제로
    // 있다고 확인됨(plan 참고). 다른 정규화(대소문자 등)는 하지 않는다 — 원본 표기를 그대로 신뢰.
    function normalizeMetricsChannelName(val) {
      return (val === null || val === undefined) ? '' : val.toString().trim();
    }

    // ------------------------------------------------------------
    // parseCompetitorRevenueWorkbook() — File2(매체별 광고비 raw), 시트 `변환용`
    // 컬럼: 채널｜사업자대분류｜사업자중분류｜채널그룹｜2019-01…2026-07 (연월 wide 컬럼)
    // wide → long: 채널×연월 조합 1행. 시트/컬럼이 예상과 다르면 던지지 않고 [] + console.warn.
    // ------------------------------------------------------------
    function parseCompetitorRevenueWorkbook(workbook) {
      try {
        const sheet = workbook.Sheets[REVENUE_SHEET_NAME];
        if (!sheet) {
          console.warn(`[metrics-data-loader] File2(경쟁채널 매출)에 "${REVENUE_SHEET_NAME}" 시트가 없습니다. 시트 목록: ${workbook.SheetNames.join(', ')}`);
          return [];
        }
        const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
        if (jsonRows.length === 0) {
          console.warn(`[metrics-data-loader] File2 "${REVENUE_SHEET_NAME}" 시트에 데이터 행이 없습니다.`);
          return [];
        }

        const firstRowKeys = Object.keys(jsonRows[0]);
        const requiredCols = ['채널', '사업자대분류', '사업자중분류', '채널그룹'];
        const missingCols = requiredCols.filter(c => !firstRowKeys.includes(c));
        if (missingCols.length > 0) {
          console.warn(`[metrics-data-loader] File2 "${REVENUE_SHEET_NAME}" 시트에 예상 컬럼이 없습니다(누락: ${missingCols.join(', ')}). 실제 컬럼: ${firstRowKeys.join(', ')}`);
          return [];
        }

        const ymCols = firstRowKeys.filter(k => YM_COL_REGEX.test(k));
        if (ymCols.length === 0) {
          console.warn(`[metrics-data-loader] File2 "${REVENUE_SHEET_NAME}" 시트에서 "YYYY-MM" 형식의 월별 매출 컬럼을 찾지 못했습니다.`);
          return [];
        }

        const rows = [];
        jsonRows.forEach(r => {
          const channel = normalizeMetricsChannelName(r['채널']);
          if (!channel) return;
          const channelGroup = normalizeMetricsChannelName(r['채널그룹']) || channel;
          const operatorMajor = (r['사업자대분류'] || '').toString().trim();
          const operatorMid = (r['사업자중분류'] || '').toString().trim();

          ymCols.forEach(col => {
            const m = col.match(YM_COL_REGEX);
            const year = parseInt(m[1], 10);
            const month = parseInt(m[2], 10);
            const revenue = Number(r[col]) || 0;
            rows.push({ channel, operatorMajor, operatorMid, channelGroup, year, month, revenue });
          });
        });
        return rows;
      } catch (err) {
        console.warn('[metrics-data-loader] File2(경쟁채널 매출) 파싱 중 오류:', err);
        return [];
      }
    }

    // ------------------------------------------------------------
    // parseCompetitorRatingsWorkbook() — File1(경쟁채널 지표 현황), 시트 `변환용취합`
    // 컬럼: 연도｜INDEX｜구분｜채널｜1…12 (월 wide 컬럼, 연도별로 행이 나뉨)
    // 구분값(예: "03.채널시청률")에서 번호 접두어를 떼어 metricCode/metricLabel로 분리.
    // 01/02.광고매출 행은 스킵(File2로 대체 — plan 확정사항).
    // ------------------------------------------------------------
    function parseCompetitorRatingsWorkbook(workbook) {
      try {
        const sheet = workbook.Sheets[RATINGS_SHEET_NAME];
        if (!sheet) {
          console.warn(`[metrics-data-loader] File1(경쟁채널 지표)에 "${RATINGS_SHEET_NAME}" 시트가 없습니다. 시트 목록: ${workbook.SheetNames.join(', ')}`);
          return [];
        }
        const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
        if (jsonRows.length === 0) {
          console.warn(`[metrics-data-loader] File1 "${RATINGS_SHEET_NAME}" 시트에 데이터 행이 없습니다.`);
          return [];
        }

        const firstRowKeys = Object.keys(jsonRows[0]);
        const requiredCols = ['연도', 'INDEX', '구분', '채널'];
        const missingCols = requiredCols.filter(c => !firstRowKeys.includes(c));
        if (missingCols.length > 0) {
          console.warn(`[metrics-data-loader] File1 "${RATINGS_SHEET_NAME}" 시트에 예상 컬럼이 없습니다(누락: ${missingCols.join(', ')}). 실제 컬럼: ${firstRowKeys.join(', ')}`);
          return [];
        }

        const rows = [];
        jsonRows.forEach(r => {
          const year = parseInt(r['연도'], 10);
          if (!year) return;
          const indexMode = (r['INDEX'] || '').toString().trim();
          const rawGubun = (r['구분'] || '').toString().trim();
          if (!rawGubun) return;
          const codeMatch = rawGubun.match(/^(\d+)\./);
          const metricCode = codeMatch ? codeMatch[1] : '';
          // 01/02.광고매출은 쓰지 않는다 — File2 기반 파생 매출로 대체(plan 확정사항).
          if (metricCode === '01' || metricCode === '02') return;
          const metricLabel = codeMatch ? rawGubun.slice(codeMatch[0].length).trim() : rawGubun;
          const channel = normalizeMetricsChannelName(r['채널']);
          if (!channel) return;

          RATINGS_MONTH_COLS.forEach(col => {
            if (!(col in r)) return;
            if (r[col] === '') return;
            const value = Number(r[col]);
            if (isNaN(value)) return;
            rows.push({ year, indexMode, metricCode, metricLabel, channel, month: parseInt(col, 10), value });
          });
        });
        return rows;
      } catch (err) {
        console.warn('[metrics-data-loader] File1(경쟁채널 지표) 파싱 중 오류:', err);
        return [];
      }
    }

    // ------------------------------------------------------------
    // computeEnaMonthlyRevenue() — 메인 매출 데이터셋(rawData)에서 ENA 자체 월매출 재계산
    // ------------------------------------------------------------
    // js/features/kpi.js의 matchesCurrentBasis(kpi.js:114-116)와 같은 원칙을 이 탭 전용 basisMode
    // 인자로 로컬 복제한 것. 전역 matchesCurrentBasis는 건드리지 않는다(그 함수는 전역
    // revenueBasisMode를 읽는데, 이 탭은 자기만의 토글을 쓰므로 인자로 받아야 한다).
    function matchesMetricsBasis(r, basisMode) {
      return basisMode === 'accounting' || r.revenueBasis === '실적';
    }

    // channelFilter 생략 시 KT_ENA_FAMILY_CHANNELS 전체 합(= File2 "채널그룹=KT ENA" 치환용),
    // channelFilter 지정 시(예: 'ENA') 그 단일 rawData.channel 값만 합산(= File2 대표채널 'ENA' 치환용).
    function computeEnaMonthlyRevenue(year, month, basisMode, channelFilter) {
      if (!rawData || rawData.length === 0) return 0;
      const channels = channelFilter ? [channelFilter] : KT_ENA_FAMILY_CHANNELS;
      return rawData
        .filter(r => r.bonbuRevenueStatus === '본부매출'
          && matchesMetricsBasis(r, basisMode)
          && r.year === year && r.month === month
          && channels.includes(r.channel))
        .reduce((sum, r) => sum + r.amount, 0);
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
    // ② 개별 "채널='ENA'" 행 — 대표채널 비교용. computeEnaMonthlyRevenue(y, m, basisMode, 'ENA')로 교체.
    // KT ENA 그룹의 나머지 세부채널 행(ONCE/OLIFE/CHING/ONT/헬스메디TV/ENA SPORTS/기타광고매출 등)은
    // 원본 그대로 둔다 — plan에 따르면 세부 채널별 대응은 불필요하고 그룹 단위 치환만 하면 된다.
    function rebuildMetricsSubstitution(basisMode) {
      if (!Array.isArray(metricsRevenueDataOriginal) || metricsRevenueDataOriginal.length === 0) {
        metricsRevenueData = [];
        return;
      }

      const ymKey = (y, m) => y + '-' + m;
      const totalCache = {};   // ① 그룹 합계 캐시 (연-월 단위, basisMode 고정된 이번 호출 범위 내에서만 유효)
      const channelCache = {}; // ② 대표채널 ENA 캐시

      metricsRevenueData = metricsRevenueDataOriginal.map(row => {
        if (row.channelGroup !== ENA_CHANNEL_GROUP) return row; // KT ENA 그룹이 아니면 원본 그대로

        const key = ymKey(row.year, row.month);

        if (row.channel === row.channelGroup) { // ① 그룹 자기참조 합계 행
          if (!(key in totalCache)) totalCache[key] = computeEnaMonthlyRevenue(row.year, row.month, basisMode);
          return Object.assign({}, row, { revenue: totalCache[key] });
        }

        if (row.channel === ENA_REPRESENTATIVE_CHANNEL) { // ② 대표채널 ENA 개별 행
          if (!(key in channelCache)) channelCache[key] = computeEnaMonthlyRevenue(row.year, row.month, basisMode, ENA_REPRESENTATIVE_CHANNEL);
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
        if (!(key in totalCache)) totalCache[key] = computeEnaMonthlyRevenue(sample.year, sample.month, basisMode);
        metricsRevenueData.push({
          channel: ENA_CHANNEL_GROUP, operatorMajor: sample.operatorMajor, operatorMid: sample.operatorMid,
          channelGroup: ENA_CHANNEL_GROUP, year: sample.year, month: sample.month, revenue: totalCache[key]
        });
      });
    }
