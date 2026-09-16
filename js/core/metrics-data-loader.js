// ============================================================
// js/core/metrics-data-loader.js
// 지표 대시보드(경쟁채널 벤치마크) 전용 데이터 연결 — data-loader.js 다음, features/* 이전 로드
//
// File2(매체별 광고비 raw)는 분석에서 제외했다(2026-09-16, 사용자 요청) — 마감 전 달(예: 9월)엔
// KT ENA를 뺀 전 채널그룹이 0원 플레이스홀더라 기본 사업자 랭킹·①②캐스케이딩이 계속 엉키는
// 버그의 근본 원인이었다. File1(경쟁채널 지표 현황)의 "01.방송사업자 광고매출" 지표가 이미 14개
// 사업자 단위로 매달 실제 값을 보고하고 있어(File2와 달리 마감 전 달도 0이 아닌 실측/추정치가
// 들어있음, Supabase로 직접 확인) 매출·시장규모·M/S를 포함한 지표 대시보드 전체를 이제 File1
// 하나로만 구성한다. File2 서빙 인프라(functions/competitor-revenue.js, ETL, R2 키)는 롤백 여지를
// 남겨 그대로 두되, 이 파일은 더 이상 호출하지 않는다.
//
// File1은 R2에서 xlsx로 직접 서빙했으나, 이 Cloudflare Pages 프로젝트에서 R2 바인딩이 원인 불명으로
// 전혀 붙지 않는 문제가 있어(2026-09-15, 이름을 바꿔 새로 만들어도 재현) Supabase로 옮겼다.
// scripts/etl/load-competitor-data.mjs가 엑셀을 미리 long-format으로 파싱해 competitor_ratings
// 테이블에 적재해두면, 여기서는 /api/competitor-ratings(supabase-proxy 경유, requireMetricsAccess로
// 이메일 허용목록 검사)로 이미 정리된 JSON을 그대로 받는다 — SheetJS 파싱은 이제 이 파일에 없다
// (ETL 쪽에만 있음, 두 파싱 로직은 동일한 코드를 유지할 것).
// ENA 자신의 수치는 외부 추정치보다 내부 매출(rawData)이 정확하므로, File1의 KT ENA 행만 내부 값으로
// 치환한다(자세한 배경은 docs/features/metrics-dashboard.md).
//
// 지연 로딩 대상: 부팅 시(init.js)가 아니라 "지표 대시보드" 탭을 처음 열 때 fetchMetricsDataHttp()가
// 1회 호출된다(호출부는 js/features/metrics-dashboard.js). 이 파일은 fetch/치환만 담당하고
// 렌더링은 전혀 하지 않는다 — data-loader.js가 rawData까지만 책임지는 것과 같은 경계.
// ============================================================

    // ------------------------------------------------------------
    // ENA/CATV 화이트리스트
    // ------------------------------------------------------------
    // File1 "01.방송사업자 광고매출"의 채널명 — 사업자(①) 단위 키. KT ENA 계열 전체를 가리키는 상수.
    const ENA_CHANNEL_GROUP = 'KT ENA';
    // File1의 채널 단위(03/09 등) 지표는 채널별로 ENA/ENA DRAMA/ENA PLAY/ENA STORY 4개만 있고 "KT ENA
    // 합계" 행이 없다 — 그래서 CPRP·채널시청률 등에서 KT ENA를 "사업자 비교"로 볼 땐 대표채널 하나만 쓴다.
    const ENA_CHANNELS = ['ENA', 'ENA DRAMA', 'ENA PLAY', 'ENA STORY'];
    const ENA_REPRESENTATIVE_CHANNEL = 'ENA';
    // rawData(메인 매출 데이터셋) 쪽 KT ENA 계열 채널 전체 — js/core/filters.js의 updateFilterCheckboxes()
    // 안에 있는 targetOrder 배열과 동일 목록이다(그 배열은 함수 지역 스코프라 여기서 재사용할 수 없어
    // 그대로 복제해 둔다 — 값이 바뀌면 두 곳을 함께 고칠 것).
    // **'기타' 누락으로 1~9월 누적이 33.67억원 적게 잡혔었다**(2026-09-16, 사용자 지적: "1~9월
    // 446.75억원으로 돼 있는데 왜 지표에선 413억원이야" — Supabase로 직접 대조해 413.08억+33.67억
    // ('기타' 채널의 1~9월 실적 합)=446.75억으로 정확히 일치함을 확인). rawData.channel 값 중
    // "기타"는 skylife큐톤·IMC 인서트애드 등 실제 매출인데(원본 목록을 짤 때 빠졌던 것으로 보임)
    // 이 회사 매출 전체가 KT ENA 계열 채널뿐이라 본부매출로 잡히는 모든 채널이 결국 ENA 총계에
    // 포함돼야 한다 — 그래서 이 목록에도 추가한다.
    const KT_ENA_FAMILY_CHANNELS = ['ENA', 'ENA DRAMA', 'ENA PLAY', 'ENA STORY', 'ONCE', 'OLIFE', 'ENA SPORTS', 'CHING', 'ONT', '헬스메디TV', '기타'];

    // ------------------------------------------------------------
    // 사업자(①) ↔ 채널(②) 매핑, 사업자 ↔ 범위(지상파/종편/케이블) — File1엔 이 대응관계를 알려주는
    // 컬럼이 없어(File2의 채널그룹/사업자대분류·중분류 같은 개념이 없음) 사람이 직접 확인해 하드코딩한다
    // (2026-09-16, 사용자 제공·확인 — File1 metric_code='03'(채널시청률) 등 채널 단위 지표에 실제로 존재하는
    // 15개 채널명을 Supabase로 확인해 대조함). 세부채널이 없는 사업자(지상파·종편 등 대부분)는 사업자명
    // 자체가 유일한 채널이라 이 맵에 없는 사업자는 자기 이름 하나짜리 배열로 취급한다(metricsChannelsForOperator).
    const METRICS_OPERATOR_CHANNEL_MAP = {
      'KT ENA': ['ENA', 'ENA DRAMA', 'ENA PLAY', 'ENA STORY'],
      'CJ ENM': ['tvN', 'tvN DRAMA', 'tvN SHOW', 'tvN STORY'],
      'MBC Plus': ['MBC every1', 'MBC드라마넷'],
      'SBS 계열': ['SBS Plus', 'SBS funE'],
      'KBS N': ['KBS JOY', 'KBS드라마'],
    };
    function metricsChannelsForOperator(op) { return METRICS_OPERATOR_CHANNEL_MAP[op] || [op]; }
    // 시청률·CPRP 같은 비율 지표는 사업자 내 여러 채널 값을 더하거나 평균낼 수 없다(레이트라 가산 불가) —
    // "사업자 비교" 모드에서는 그 사업자의 대표채널(매핑의 첫 채널, 없으면 사업자명 자체) 하나로 근사한다.
    function metricsRepresentativeChannel(op) {
      const list = METRICS_OPERATOR_CHANNEL_MAP[op];
      return list ? list[0] : op;
    }
    const METRICS_OPERATOR_SCOPE = {
      'KBS': '지상파', 'MBC(전국)': '지상파', 'SBS(민방포함)': '지상파',
      'JTBC': '종편', 'TV조선': '종편', '채널A': '종편', 'MBN': '종편',
      'KT ENA': '케이블', 'CJ ENM': '케이블', 'MBC Plus': '케이블', 'SBS 계열': '케이블',
      'KBS N': '케이블', '티캐스트': '케이블', 'iHQ': '케이블',
    };
    // 체크박스 표시용 이름 — File1 원본 표기가 딱딱하거나(예: "SBS(민방포함)") 다른 화면에서 익숙한
    // 표기와 달라서(예: "SBS 계열"보다 "SBS미디어넷") 사업자 목록 렌더링에서만 바꿔치기한다. 데이터
    // 조회 키(competitor_ratings.channel)는 항상 File1 원본 표기를 그대로 쓴다.
    const METRICS_OPERATOR_DISPLAY_NAME = {
      'SBS(민방포함)': 'SBS', 'MBC(전국)': 'MBC', 'SBS 계열': 'SBS미디어넷', 'KBS N': 'KBSN', 'MBC Plus': 'MBC PLUS',
    };
    function metricsOperatorDisplayName(op) { return METRICS_OPERATOR_DISPLAY_NAME[op] || op; }

    // ------------------------------------------------------------
    // 전역 상태 (data-loader.js의 rawData/filteredData와 같은 방식 — 평범한 top-level let)
    // ------------------------------------------------------------
    let metricsRevenueData = [];         // File1 "01.방송사업자 광고매출"에서 뽑은 사업자별 월매출(KT ENA는 내부값으로 치환) — 렌더는 이것만 읽는다
    let metricsRatingsData = [];         // File1 파싱 결과(long-format) 전체 — 01번(매출)도 포함, metricsRevenueData는 이 배열에서 파생
    let metricsDataLoaded = false;       // fetchMetricsDataHttp() 성공 여부
    let metricsDataFetchPromise = null;  // 진행 중이거나 완료된 fetch를 캐시 — 지연 로딩을 호출부가 여러 번 트리거해도 1회만 fetch
    // 리포트(File1) 자체의 "as of" 날짜 — /api/competitor-ratings-meta(competitor_ratings_meta 싱글턴
    // 테이블, scripts/etl/load-competitor-data.mjs가 File1 내부 "{연도}년" 시트 H2를 읽어 채움). "최신
    // 데이터가 있는 연/월"과는 다른 개념(전자는 리포트 발행 기준일, 후자는 그 안에 몇 월치 실적이
    // 채워졌는지) — js/features/metrics-dashboard.js의 renderMetricsDataAsOfLabel()이 이 값을 우선
    // 쓰고, null이면(ETL을 이 컬럼이 생긴 뒤로 재실행하지 않았거나 조회 실패) 기존 계산으로 폴백한다.
    let metricsReportAsOfDate = null;
    // 취급고/회계(매출기준)는 이 탭 전용 상태(metricsBasisMode)를 따로 두지 않는다 — "취급고를
    // 누르면 매출 대시보드의 취급고 숫자를, 회계를 누르면 회계 숫자를 가져와 KT ENA/ENA 채널 매출로
    // 쓴다"는 개념(2026-09-15, 사용자 요청)이라, 이 탭에도 버튼은 있지만(dashboard.html) 항상 메인
    // 대시보드와 공유하는 전역 revenueBasisMode(state.js)를 직접 바꾼다 — 두 화면이 항상 같은 값을
    // 보게 하기 위해서다(setMetricsRevenueBasis(), metrics-dashboard.js).

    const METRICS_RATINGS_URL = '/api/competitor-ratings';
    const METRICS_RATINGS_META_URL = '/api/competitor-ratings-meta';

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

      // 리포트 as-of 날짜는 부가 정보다 — 조회에 실패하거나(엔드포인트가 아직 배포 전이거나) 값이
      // 아직 비어 있어도(ETL을 이 컬럼이 생긴 뒤로 재실행하지 않은 환경) 지표 대시보드 전체가 막히면
      // 안 된다. 그래서 이 fetch는 절대 reject하지 않고(catch로 흡수) metricsReportAsOfDate만 세팅한다
      // — 실패해도 null로 남아 렌더 쪽이 기존 계산으로 폴백한다.
      const metaPromise = fetchJson(METRICS_RATINGS_META_URL).then(rows => {
        const row = Array.isArray(rows) ? rows[0] : null;
        metricsReportAsOfDate = (row && row.report_as_of_date) ? row.report_as_of_date : null;
      }).catch(err => {
        metricsReportAsOfDate = null;
        console.warn('[metrics-data-loader] 리포트 as-of 날짜 조회 실패(기존 방식으로 폴백):', err.message);
      });

      // Supabase 행은 snake_case(ETL이 그렇게 적재 — scripts/etl/load-competitor-data.mjs)라
      // 나머지 코드 전체가 기대하는 camelCase 필드명으로 변환한다. 필드명 매핑 외 가공 없음
      // (정규화·치환·파싱은 ETL 쪽에서 이미 끝난 채로 들어온다). File2는 더 이상 fetch하지 않는다
      // (위 파일 헤더 주석 참고 — 분석에서 완전히 제외, 2026-09-16).
      const ratingsPromise = fetchJson(METRICS_RATINGS_URL).then(ratingsRows => {
        metricsRatingsData = ratingsRows.map(r => ({
          year: r.year, indexMode: r.index_mode, metricCode: r.metric_code, metricLabel: r.metric_label,
          channel: r.channel, month: r.month, value: Number(r.value)
        }));
        rebuildMetricsSubstitution();
      });

      // metaPromise는 절대 reject하지 않으므로 Promise.all이 실패하는 경우는 ratingsPromise가
      // 실패했을 때뿐이다 — as-of 날짜 부가 조회가 핵심 데이터 로드를 절대 막지 않는다.
      metricsDataFetchPromise = Promise.all([ratingsPromise, metaPromise]).then(() => {
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

    // KT_ENA_FAMILY_CHANNELS(ENA 계열 전체) 합산 — File1의 KT ENA 사업자 행을 그대로 안 쓰고
    // 이 값으로 치환한다(자세한 배경은 파일 헤더 주석 참고).
    function computeEnaMonthlyRevenue(year, month) {
      if (!rawData || rawData.length === 0) return 0;
      return rawData
        .filter(r => r.bonbuRevenueStatus === '본부매출'
          && matchesMetricsBasis(r)
          && r.year === year && r.month === month
          && KT_ENA_FAMILY_CHANNELS.includes(r.channel))
        .reduce((sum, r) => sum + r.amount, 0);
    }

    // ------------------------------------------------------------
    // rebuildMetricsSubstitution() — 취급고/회계 토글이 바뀔 때마다, 그리고 fetch 직후 UI가 호출
    // ------------------------------------------------------------
    // metricsRatingsData(캐시, fetch 이후 불변)의 metric_code='01'(사업자별 광고매출) 행에서
    // metricsRevenueData(파생본)를 매번 새로 만든다 — KT ENA 행만 내부 실측치로 덮어쓰고 나머지
    // 사업자는 File1 값(백만원→원 환산)을 그대로 쓴다. File1은 사업자 단위 보고뿐이라(File2처럼
    // 세부채널 분해가 없음) channel과 channelGroup이 항상 같다 — "그룹 자기참조 합계 행"을 합성해야
    // 했던 File2 시절의 복잡한 폴백 로직이 통째로 필요 없어졌다.
    function rebuildMetricsSubstitution() {
      const totalCache = {}; // 연-월 단위 KT ENA 합계 캐시(이번 호출 범위 내에서만 유효)
      metricsRevenueData = metricsRatingsData
        .filter(r => r.metricCode === '01' && r.value !== 0) // File1은 미보고 미래월도 0으로 채워 내보낸다 — 실제 데이터 없는 달을 걸러낸다
        .map(r => {
          let revenue;
          if (r.channel === ENA_CHANNEL_GROUP) {
            const key = r.year + '-' + r.month;
            if (!(key in totalCache)) totalCache[key] = computeEnaMonthlyRevenue(r.year, r.month);
            revenue = totalCache[key];
          } else {
            revenue = Math.round(r.value * 1000000); // File1 metric 01 단위는 백만원
          }
          return { channel: r.channel, channelGroup: r.channel, scope: METRICS_OPERATOR_SCOPE[r.channel] || null, year: r.year, month: r.month, revenue };
        });
    }
