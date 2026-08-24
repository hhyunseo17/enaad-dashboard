// ============================================================
// js/core/state.js
// ?�역 ?�태 변??+ ?�상 ?�레??+ ?�마 ?�퍼(CH/mapPivotHtml/toggleTheme) ??가??먼�? 로드
// ============================================================
    const DATA_URL = './addata';
    // 'xlsx': R2의 addata.xlsx를 클라이언트가 SheetJS로 파싱(레거시, 안전망으로 코드는 유지).
    // 'supabase': /api/* 프록시(Pages Functions, functions/api/*.js)를 거쳐 Supabase v_bonbu_sales/upfront_contracts 조회.
    // 문제 생기면 이 한 줄을 'xlsx'로 되돌리는 배포만으로 즉시 롤백 가능.
    const DATA_SOURCE_MODE = 'supabase';
    // /api/sales에 `?batch=<배치ID>`를 붙일지 여부. 붙이면 Cloudflare 엣지가 배치 단위로 응답을
    // 캐시해 왕복 자체가 사라진다(shared/supabase-proxy.mjs 참고). false로 두면 파라미터가 빠지고
    // 서버도 캐시 경로를 건너뛰어 예전과 동일하게 동작한다 — 되돌리기 1단계.
    // (서버 쪽 즉시 차단은 Pages 환경변수 EDGE_CACHE_DISABLED=1.)
    const USE_EDGE_CACHE = true;
    // 일반 피벗을 공용 엔진(js/features/pivot-builder.js)으로 그릴지 여부.
    // false로 두면 detail-pivots.js의 기존 렌더러가 그대로 돈다 — 두 경로 모두 코드가 살아 있고,
    // 접힘 상태(expandedCatPivot / expandedCatYearColumns)도 키 형식이 같아 껐다 켜도 이어진다.
    // 현재 엔진으로 넘어간 것은 항목별 피벗 하나뿐이다.
    const USE_PIVOT_ENGINE = true;
    // 일반 피벗의 실행 중 축 구성 { viewKey: {filters, rows, columns, values} }.
    // 형태는 세부데이터의 detailDataConfig와 동일 — 빌더 패널 코드를 두 화면이 나눠 쓰기 때문이다.
    // 비어 있으면 pivot-builder.js가 PIVOT_PRESETS에서 채운다(= 프리셋이 곧 '처음 모양'이자 초기화 기준).
    // 세션 안에서만 유지된다 — 새로고침하면 프리셋으로 돌아간다.
    let pivotConfigs = {};
    let lastSeenBatchId = null; // Supabase 모드에서 배치 변경 감지 폴링에 사용
    // 사용자가 '확인'을 누른 미지의 대분류 목록(정렬 후 join한 문자열).
    // 배치 갱신 폴링이 돌 때마다 같은 배너를 다시 띄우지 않기 위한 것이다.
    // localStorage가 아니라 메모리에 두는 이유: 새로고침하면 다시 보이는 편이 맞다 —
    // 아직 분류 규칙이 갱신되지 않았다는 사실 자체는 그대로이기 때문이다.
    let dismissedUnknownCategorySig = '';
    let rawData = [];
    let filteredData = [];
    let tableDisplayData = [];
    let rawSourceSheetRef = null; // '변?? ?�트�?그�?�??�운로드?�기 ?�한 ?�본 ?�트 객체 참조
    let workbookModifiedDate = null; // ?��? ?�일 ?��? 메�??�이??Core Properties)??최종 ?�???�각
    let rawSourceSheetName = '';

    let currentView = 'main'; 

    let expandedYearColumns = {}; 
    let expandedBucketYearColumns = {};
    let expandedAdvertiserYearColumns = {};
    let expandedAgencyYearColumns = {};
    let expandedCatYearColumns = {};
    let expandedDeptYearColumns = {};
    let expandedMgrYearColumns = {};
    let expandedGoalTrendYearColumns = {};  // 목표 대비 실적 피벗(월별) — 연도 열 펼침
    let expandedGoalDeptYearColumns = {};   // 목표 대비 실적 피벗(부서별) — 연도 열 펼침

    let expandedChannels = {};    
    let expandedCategories = {};  
    let expandedSubCategories = {};
    let expandedAdvertisers = {}; 
    let expandedAgencyGroups = {};
    let expandedAgencies = {};
    let expandedBucketMetricSections = { '광고주수': true, '?�균매출': true, '?�계매출': true };
    let expandedBucketAdvertisers = {}; // 구간�?분석 ?�벗: �?구간(bucket tier) ??광고�?목록 ?�침 ?�태 (기본 ?��? ?�힘)

    let expandedCatPivot = {};
    let expandedDeptPivot = {};
    let expandedMgrPivot = {};
    let expandedGoalDeptPivot = {}; // 목표 대비 실적 피벗(부서별): 부서 → 담당자 트리 펼침 상태 (기본 전부 접힘)
    // 월별 목표 피벗은 원래 행이 대분류 한 단계뿐이라 펼침 상태가 필요 없었다. 표 편집으로 부서·담당자를
    // 더 얹을 수 있게 되면서 자기 맵이 생겼다(부서별 피벗과 섞이면 안 되므로 별도).
    let expandedGoalTrendPivot = {};

    // 세부데이터 탐색 탭(자유 피벗 빌더): 상단 전역 필터바(연/월/부서/채널/방송디지털/대분류/매출기준 등)를 그대로 받아서
    // 시작하고(getDetailDataBaseRows()가 filteredData를 기준으로 삼음), 아래쪽 드래그앤드롭 필터는 전역 필터바가
    // 커버하지 못하는 추가 필드(담당자/대행사그룹/중분류/소분류/업종/회계계정/업프론트여부와, 전역 검색과 별개로 더
    // 좁히고 싶을 수 있는 대행사/광고주)만을 위한 보조 수단이다.
    // 값도 비워 둔 채 시작한다. 예전에는 '합계 : 금액'을 미리 넣어 뒀는데, 빈 화면에서 무엇부터
    // 해야 하는지 알려주지 못하면서(행·열은 비어 있다) 값 하나만 이미 놓여 있어 오히려 어중간했다.
    // 이제 세 영역이 모두 비어 있고 각 well이 "필드를 끌어 놓으세요"로 같은 말을 한다.
    // sorts/colSort는 다른 피벗과 같은 형태다(js/features/pivot-builder.js가 이 형태를 읽는다).
    let detailDataConfig = {
      filters: [],
      rows: [],
      columns: [],
      values: [],
      sorts: {},
      colSort: null
    };
    let detailDataValueIdCounter = 1; // 다음에 추가될 값(values) 항목의 id — 같은 필드를 여러 번 넣어도 개별 항목으로 구분하기 위함
    let expandedDetailDataPivot = {};
    let expandedDetailDataColPivot = {}; // 열 필드 트리 접기/펼치기 상태(행과 동일한 방식) — 키는 열 경로를 '||'로 join.
    let detailDataDragPayload = null; // 드래그 중인 { field, valueId } 임시 보관 (valueId: 값 영역 내 기존 항목을 재정렬하는 경우만 채워짐)
    let detailDataOpenFilterField = null;

    let advertiserActiveMonthIndex = {}; // ?�규광고�??�별 ?�능개선?? advertiser -> [{monthStr, time}] ?�렬??배열
    let expandedMoMCategories = {}; // ?�월?��?증감 ?�벗: 카테고리�??�침 ?�태 (기본 ?��? ?�힘)
    let agencyCompMetricMode = 'revenue'; // 주요 ?�?�사 ?�년·?�월 비교 차트: 매출/광고주수 ?��?
    let expandedCompAgencyGroups = {}; let expandedCompAgencies = {}; // ?�?�사 비교 ?�세 ?�벗 ?�리 ?�침 ?�태
    let expandedNewAdvGroups = {}; // ?�규광고�??�세 ?�벗: ????그룹�??�침 ?�태 (기본 ?��? ?�힘)
    let expandedNewAdvYears = {}; // ?�규광고�??�세 ?�벗: ??레벨 ?�침 ?�태 (기본 ?��? ?�힘)
    let upfrontContracts = []; // ?�프론트 계약 목록 (광고�??�프론트??+계약기간 기�? ?�일 그룹)
    let salesTargets = []; // 목표 목록 (담당자 x 5대분류 x 연월 x 매출기준(basis) 단위, sales_targets 테이블)
    let expandedUpfrontDepts = {}; let expandedUpfrontAdvertisers = {}; // ?�프론트 ?�적 ?�벗 ?�리 ?�침 ?�태 (기본 ?��? ?�힘)
    let isFirstLoad = true;

    let revenueBasisMode = 'performance';
    let channelScaleMode = 'linear';

    let selectedYears = [];  
    let selectedMonths = []; 
    let selectedDepts = [];
    let selectedChannels = [];
    let selectedBroads = [];
    let selectedCategories = []; 

    let isAllDeptsSelected = true;
    let isAllChannelsSelected = true;
    let isAllBroadsSelected = true;
    let isAllCategoriesSelected = true;

    let trendChartMode = 'monthly'; 
    let portfolioMode = 'categoryReclassified'; 
    let rankAgencyMode = 'agency';
    let deptMode = 'categoryReclassified';
    let managerMode = 'categoryReclassified';
    let goalBreakdownMode = 'dept'; // 목표 대비 실적 분해 차트(chartGoalBreakdown): 부서/담당자 토글
    // 월별 목표 대비 실적 추이 차트(chartGoalTrend): 월별/누적 토글.
    // 누적은 **연도별로 리셋**한다 — 목표가 연 단위로 편성되므로 연초부터의 누적 달성률이 읽는 값이고,
    // 여러 해를 함께 볼 때 24개월을 통으로 누적하면 연도 간 비교가 불가능해진다.
    let goalTrendMode = 'monthly';

    let currentPage = 1;
    let rowsPerPage = 25;
    let maxPages = 1;
    let sortCol = 'monthStr';
    let sortAsc = false;

    let chartInstances = {};

    // 5대분류 계열색 — 화면에서 색이 '정체성'을 담는 유일한 자리다(그 외는 중립/강조/증감만 쓴다).
    //
    // Apple HIG 시스템 컬러를 쓴다. 핵심은 색이 예뻐서가 아니라 **라이트/다크 변형이 애초에
    // 따로 정의되어 있다는 점**이다. 예전에는 한 벌을 두 배경에 다 썼는데, 그 값들은 어두운
    // 배경 기준으로 조율된 것이라 흰 배경에서는 명도가 높아 물빠져 보였다(특히 기타광고 회색).
    //
    // 색상(hue)은 두 테마에서 동일하다 — '파랑=일반광고'라는 인식은 그대로 유지되고,
    // 배경에 맞춰 명도만 달라진다.
    //
    //   일반광고  System Blue    가장 큰 비중이라 기준점
    //   IMC       System Red   예전에는 보라(270°)였다. 그런데 IMC는 항상 일반광고(211°) 바로 위에
    //                          쌓이는데 둘의 색상차가 59°밖에 안 됐다 — 팔레트에서 가장 붙어 있는
    //                          쌍이 하필 유일하게 맞닿는 쌍이었다. 게다가 이 팔레트는 명도차가
    //                          거의 없어(맞닿는 이웃끼리 1.00~1.16) 색상만으로 구분해야 하는데,
    //                          그 유일한 축에서 가장 좁은 자리였던 셈이다.
    //                          빨강으로 옮기면 152°로 벌어진다. 인접한 보라·인디고 안에서 고르는
    //                          것보다 이쪽이 근본적이다.
    //                          주황(35°)과는 32°로 가깝지만 스택에서 맞닿지 않는다(사이에 인포머셜이
    //                          있다). 범례에서만 나란히 서므로 실사용에서 문제되지 않는다.
    //                          채도·명도는 건드리지 않았다 — 어둡게·탁하게 가는 안(명도까지 벌리는
    //                          방식)은 선명함을 잃어서 택하지 않았다.
    //   인포머셜  System Green
    //   큐톤광고  System Orange
    //   기타광고  System Gray    어드레서블·콘텐츠편성 등을 흡수한 '잔여' 버킷이라 무채색이 맞다
    // **두 테마의 값을 각각 직접 적는다.** 예전에는 여기 정의값에 catColor()가 ddSoften(+0.14)을
    // 태워 라이트 화면색을 만들어냈다 — 즉 적힌 값은 다크용이고 라이트는 계산 결과였다.
    // 그러면 (a) 코드를 읽어도 라이트에 무엇이 나오는지 알 수 없고 (b) 한 테마만 손볼 수가 없다.
    // 아래 라이트 값은 대부분 그 계산이 만들어내던 값 그대로다. IMC만 다르다 — 계산 결과는
    // #FF7F77(L73)이었는데, 빨강은 그 명도에서 분홍·살몬으로 읽힌다. 명도를 고를 수 있게 된
    // 김에 L62로 내려 빨강이 빨강으로 보이게 했다. 나머지 계열(L63~64)과 같은 대역이고,
    // 흰 카드 대비도 2.50에서 3.29로 올라간다.
    //
    // **인포머셜 초록은 135°가 아니라 165°(제이드)다.** System Green(135°)은 노랑 쪽으로 기운
    // 초록이라 화면에서 혼자 연두로 읽혔다. 원인은 명도가 아니다 — 라이트 기준 OKL 79.7로
    // 주황(82.1)보다 오히려 낮았고, 어둡게 내리면 대역을 벗어나 이끼색이 됐다. 계열이 없는 게
    // 문제였다: 파랑 211 · 빨강 4 · 주황 35 · 무채 사이에서 135°만 홀로 떨어져 있었다.
    // 명도는 그대로 두고 색상만 165°로 옮겨 파랑 쪽에 붙였다(OKL 79.8, 사실상 동일).
    // 파랑과는 46° 떨어져 있어 누적 막대에서 일반광고와 붙어 보이지 않는다.
    // 서수 팔레트의 초록(theme-system.js)은 155°로 10° 덜 옮겼다 — 그쪽은 189° 청록이 이웃이라
    // 165°까지 가면 간격이 좁아진다. 같은 이유로 두 초록은 값이 다르다.
    //
    // **라이트 채도는 56이 아니라 68이다(다크는 그대로 64).** ddBarFill의 라이트 끝을 +0.08에서
    // 0으로 내렸을 때(theme-system.js 주석 참고) 다른 계열은 렌더링 색량이 9~15% 올랐는데
    // 제이드만 4.5%에 그쳤다 — 165°는 이 명도대에서 sRGB 천장이 낮아, 명도를 내려도 색이
    // 붙지 않는다(밑동 크로마는 0.130 → 0.121로 오히려 떨어졌다). 옆이 다 진해진 만큼 혼자
    // 물러나 탁해 보였다. 명도는 건드리지 않고 채도만 올려 렌더링 평균 크로마를 0.117 → 0.133,
    // 즉 다른 색들과 같은 폭으로 맞췄다. 렌더링 평균 명도는 74.6으로 전후 동일하다.
    // **여기서 더 올리지 말 것.** 세 단계(0.140)면 주황(0.162)에 근접해 인포머셜이 비중에
    // 비해 앞으로 나선다 — 반대 방향으로 튄다.
    const categoryColorsLight = {
      '일반광고': '#479FFF',
      'IMC': '#FF4D3D',
      '인포머셜': '#43DBB5',
      '큐톤광고': '#FFB347',
      '기타광고': '#B3B3B6'
    };
    const categoryColorsDark = {
      '일반광고': '#0A84FF',
      'IMC': '#FF453A',
      '인포머셜': '#2ED1A8',
      '큐톤광고': '#FF9F0A',
      '기타광고': '#98989D'
    };
    // 5대분류에 없는 대분류가 원본에 들어왔을 때 쓰는 색.
    //
    // **회색으로 두면 안 된다.** 예전에는 catColor()가 undefined를 돌려주고 호출부가
    // `catColor(cat) || catColor('기타광고')`로 받아 무채색으로 떨어뜨렸다. 그러면 화면에서
    // 기타광고와 완전히 같은 색이 되어, 새 분류가 들어와도 차트만 봐서는 알 방법이 없다.
    // (게다가 도넛과 부서·담당자 차트는 같은 상황에서 seriesColor(i)로 빠져 서수 팔레트 색을 썼다.
    //  즉 같은 미지의 분류가 차트마다 다른 색으로 나왔다.)
    //
    // 보라를 고른 이유: 5대분류가 파랑·빨강·초록·주황·무채를 전부 차지하고 있어 남은 자리가 없다.
    // 보라는 서수 팔레트 4번(#B88AE5/#AB6EE7)으로 이미 화면에 있는 색이라 새 색상을 들이는 게
    // 아니고, 5대분류 어느 것과도 헷갈리지 않는다. 값도 그 팔레트에서 그대로 가져와 5대분류
    // 명도대(라이트 L72 · 다크 L67) 안에 들어온다 — 옆 막대보다 뜨거나 무겁지 않다.
    const categoryColorUnknownLight = '#B88AE5';
    const categoryColorUnknownDark = '#AB6EE7';
    // 테마를 모르는 곳(레거시 참조)을 위한 기본값. 새 코드는 catColor()를 쓴다.
    const categoryColors = categoryColorsDark;
    const categoryOrderList = ['일반광고', 'IMC', '인포머셜', '큐톤광고', '기타광고'];

    // 화면에 세울 대분류 목록 = 5대분류 고정 순서 + 데이터에 실제로 있는 미지의 값(뒤에 이름순).
    //
    // **차트 계열과 대분류 필터 목록은 categoryOrderList를 직접 쓰면 안 되고 이 함수를 거쳐야 한다.**
    // classifyCategory가 모르는 대분류를 그대로 통과시키므로(의도된 동작 — data-loader.js 주석 참고)
    // 고정 배열로 계열을 만들면 그 행들이 **어느 계열에도 속하지 못해 금액이 통째로 사라진다.**
    // 실제로 그랬다: 추이 차트가 KPI보다 2.43억 적게 나왔고, 총합계는 KPI 쪽만 맞아서
    // "차트가 좀 낮네" 정도로만 보였다. 스택 막대는 빠진 계열이 눈에 띄지 않는다.
    // 대분류 필터 목록도 같은 이유로 이 함수를 쓴다 — 목록에 없으면 체크박스로 걸러낼 수 없고,
    // 사용자가 다른 대분류를 하나라도 해제하는 순간 선택 목록에서 빠져 조용히 제외된다.
    //
    // 순서를 '뒤'로 두는 이유: 앞에 오면 5대분류의 고정 순서(일반광고부터)가 흔들려 매번 다른 표처럼
    // 읽힌다. 피벗들(detail-pivots.js, pivot-builder.js의 pvOrderListCompare, kpi.js의
    // compareGoalCategoryOrder)이 이미 '아는 것 먼저, 모르는 것 뒤에 이름순'으로 정렬하고 있어 그와도 맞다.
    function categoryListWithUnknown(rows) {
      const known = new Set(categoryOrderList);
      const extra = [...new Set((rows || rawData).map(r => r.categoryReclassified))]
        .filter(c => c && !known.has(c)).sort();
      return [...categoryOrderList, ...extra];
    }
    const broadOrderMap = { '방송': 1, '디지털': 2, '기타': 3 };

    // 부서 정렬용 커스텀 배열 (매출이 아닌 팀 번호 순서 정렬). 광고사업1팀이 항상 최우선.
    // 여기 없는 부서(신설팀 등)는 이 목록 뒤, customDeptTailOrder 앞에 알파벳순으로 붙는다 — compareDeptOrder()(shared-helpers.js) 참고.
    const customDeptOrder = [
      '광고사업1팀', '광고사업2팀', '광고사업3팀',
      '공공비즈팀', '뉴미디어광고팀', '디지털영업팀'
    ];
    // 목록에 있든 없든 이 부서들은 항상 맨 뒤(이 순서대로)
    const customDeptTailOrder = ['광고전략팀', '광고사업본부'];

    // chartColors(11색)와 colorPaletteList(10색)가 여기 있었다. 둘 다 Tailwind 계보라
    // 나머지 팔레트(Apple HIG 계보)와 회색·초록의 색조가 미세하게 어긋났고 — 예를 들어
    // 초록이 #34C759(135도)와 #22C55E(142도)로 공존했다 — 정성 구분이라는 같은 역할에
    // 팔레트가 네 벌 도는 원인이었다.
    //   · colorPaletteList : 정의만 있고 참조하는 곳이 0곳. 삭제.
    //   · chartColors      : 실제 쓰임은 `catColor(cat) || chartColors.blue` 폴백 5곳뿐이었다.
    //                        그런데 그 폴백은 정체를 모르는 계열을 하필 일반광고와 같은 파랑으로
    //                        칠했다. 폴백을 catColor('기타광고')로 바꿔 무채색으로 떨어뜨린다 —
    //                        '기타광고'가 원래 잔여 버킷이므로 뜻도 맞는다.
