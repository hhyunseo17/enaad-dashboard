// ============================================================
// js/core/state.js
// ?�역 ?�태 변??+ ?�상 ?�레??+ ?�마 ?�퍼(CH/mapPivotHtml/toggleTheme) ??가??먼�? 로드
// ============================================================
    const DATA_URL = './addata';
    // 'xlsx': R2의 addata.xlsx를 클라이언트가 SheetJS로 파싱(레거시, 안전망으로 코드는 유지).
    // 'supabase': /api/* 프록시(Pages Functions, functions/api/*.js)를 거쳐 Supabase v_bonbu_sales/upfront_contracts 조회.
    // 문제 생기면 이 한 줄을 'xlsx'로 되돌리는 배포만으로 즉시 롤백 가능.
    const DATA_SOURCE_MODE = 'supabase';
    let lastSeenBatchId = null; // Supabase 모드에서 배치 변경 감지 폴링에 사용
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

    // 세부데이터 탐색 탭(자유 피벗 빌더): 상단 전역 필터바(연/월/부서/채널/방송디지털/대분류/매출기준 등)를 그대로 받아서
    // 시작하고(getDetailDataBaseRows()가 filteredData를 기준으로 삼음), 아래쪽 드래그앤드롭 필터는 전역 필터바가
    // 커버하지 못하는 추가 필드(담당자/대행사그룹/중분류/소분류/업종/회계계정/업프론트여부와, 전역 검색과 별개로 더
    // 좁히고 싶을 수 있는 대행사/광고주)만을 위한 보조 수단이다.
    let detailDataConfig = {
      filters: [],
      rows: [],
      columns: [],
      values: [{ id: 0, field: 'amount', agg: 'sum' }]
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
    let upfrontContracts = []; // ?�프론트 계약 목록 (광고�??�프론트??+계약기간 기�? ?�일 그룹)
    let salesTargets = []; // 목표 목록 (담당자 x 5대분류 x 연월 단위, sales_targets 테이블)
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
    //   IMC       System Indigo  파랑과 이웃하되 확실히 갈리는 보라
    //   인포머셜  System Green
    //   큐톤광고  System Orange
    //   기타광고  System Gray    어드레서블·콘텐츠편성 등을 흡수한 '잔여' 버킷이라 무채색이 맞다
    const categoryColorsLight = {
      '일반광고': '#007AFF',
      'IMC': '#5856D6',
      '인포머셜': '#34C759',
      '큐톤광고': '#FF9500',
      '기타광고': '#8E8E93'
    };
    const categoryColorsDark = {
      '일반광고': '#0A84FF',
      'IMC': '#5E5CE6',
      '인포머셜': '#30D158',
      '큐톤광고': '#FF9F0A',
      '기타광고': '#98989D'
    };
    // 테마를 모르는 곳(레거시 참조)을 위한 기본값. 새 코드는 catColor()를 쓴다.
    const categoryColors = categoryColorsDark;
    const categoryOrderList = ['일반광고', 'IMC', '인포머셜', '큐톤광고', '기타광고'];
    const broadOrderMap = { '방송': 1, '디지털': 2, '기타': 3 };

    // 부서 정렬용 커스텀 배열 (매출이 아닌 팀 번호 순서 정렬). 광고사업1팀이 항상 최우선.
    // 여기 없는 부서(신설팀 등)는 이 목록 뒤, customDeptTailOrder 앞에 알파벳순으로 붙는다 — compareDeptOrder()(shared-helpers.js) 참고.
    const customDeptOrder = [
      '광고사업1팀', '광고사업2팀', '광고사업3팀',
      '공공비즈팀', '뉴미디어광고팀', '디지털영업팀'
    ];
    // 목록에 있든 없든 이 부서들은 항상 맨 뒤(이 순서대로)
    const customDeptTailOrder = ['광고전략팀', '광고사업본부'];

    const chartColors = {
      blue: '#2563EB', cyan: '#06B6D4', green: '#22C55E', orange: '#F59E0B',
      purple: '#8B5CF6', pink: '#EC4899', red: '#EF4444', yellow: '#FACC15',
      indigo: '#4F46E5', teal: '#0EA5A4',
      // 분류를 알 수 없을 때 쓰는 중립색. 계열색과 겹치지 않아야 하므로 fallback 전용으로만 쓴다.
      slate: '#64748B'
    };
    const colorPaletteList = [
      '#2563EB', '#06B6D4', '#22C55E', '#F59E0B', '#8B5CF6',
      '#EC4899', '#4F46E5', '#0EA5A4', '#FACC15', '#EF4444'
    ];
