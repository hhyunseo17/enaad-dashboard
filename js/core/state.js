// ============================================================
// js/core/state.js
// ?�역 ?�태 변??+ ?�상 ?�레??+ ?�마 ?�퍼(CH/mapPivotHtml/toggleTheme) ??가??먼�? 로드
// ============================================================
    const DATA_URL = './addata';
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

    let advertiserActiveMonthIndex = {}; // ?�규광고�??�별 ?�능개선?? advertiser -> [{monthStr, time}] ?�렬??배열
    let expandedMoMCategories = {}; // ?�월?��?증감 ?�벗: 카테고리�??�침 ?�태 (기본 ?��? ?�힘)
    let agencyCompMetricMode = 'revenue'; // 주요 ?�?�사 ?�년·?�월 비교 차트: 매출/광고주수 ?��?
    let expandedCompAgencyGroups = {}; let expandedCompAgencies = {}; // ?�?�사 비교 ?�세 ?�벗 ?�리 ?�침 ?�태
    let expandedNewAdvGroups = {}; // ?�규광고�??�세 ?�벗: ????그룹�??�침 ?�태 (기본 ?��? ?�힘)
    let upfrontContracts = []; // ?�프론트 계약 목록 (광고�??�프론트??+계약기간 기�? ?�일 그룹)
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

    let currentPage = 1;
    let rowsPerPage = 25;
    let maxPages = 1;
    let sortCol = 'monthStr';
    let sortAsc = false;

    let chartInstances = {};

    const categoryColors = {
      '일반광고': '#4795FF',
      'IMC': '#A855F7',
      '인포머셜': '#14B8A6',
      '큐톤광고': '#FFB547',
      '기타광고': '#4ADE80'
    };
    const categoryOrderList = ['일반광고', 'IMC', '인포머셜', '큐톤광고', '기타광고'];
    const broadOrderMap = { '방송': 1, '디지털': 2, '기타': 3 };

    // **부???�렬???�한 부??커스?� 배열 (매출?�이 ?�닌 ?� 번호 ?�서 ?�렬??**
    const customDeptOrder = [
      '광고영업1부', '광고영업2부', '광고영업3부',
      '공공비즈팀', '영업지원팀', '광고전략팀', '광고사업본부'
    ];

    const chartColors = {
      blue: '#4795FF', cyan: '#38BDF8', green: '#4ADE80', orange: '#FFB547',
      purple: '#A855F7', pink: '#EC4899', red: '#FF6B6B', yellow: '#FACC15',
      indigo: '#6366F1', teal: '#14B8A6'
    };
    const colorPaletteList = [
      '#4795FF', '#38BDF8', '#4ADE80', '#FFB547', '#A855F7',
      '#EC4899', '#6366F1', '#14B8A6', '#FACC15', '#FF6B6B'
    ];
