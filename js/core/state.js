// ============================================================
// js/core/state.js
// 전역 상태 변수 + 색상 팔레트 + 테마 헬퍼(CH/mapPivotHtml/toggleTheme) — 가장 먼저 로드
// ============================================================
    const DATA_URL = './addata.xlsx';
    let rawData = [];
    let filteredData = [];
    let tableDisplayData = [];
    let rawSourceSheetRef = null; // '변환' 시트를 그대로 다운로드하기 위한 원본 시트 객체 참조
    let workbookModifiedDate = null; // 엑셀 파일 내부 메타데이터(Core Properties)의 최종 저장 시각
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
    let expandedBucketMetricSections = { '광고주수': true, '평균매출': true, '합계매출': true };
    let expandedBucketAdvertisers = {}; // 구간별 분석 피벗: 각 구간(bucket tier) 내 광고주 목록 펼침 상태 (기본 전부 접힘)

    let expandedCatPivot = {};
    let expandedDeptPivot = {};
    let expandedMgrPivot = {};

    let advertiserActiveMonthIndex = {}; // 신규광고주 판별 성능개선용: advertiser -> [{monthStr, time}] 정렬된 배열
    let expandedMoMCategories = {}; // 전월대비 증감 피벗: 카테고리별 펼침 상태 (기본 전부 접힘)
    let agencyCompMetricMode = 'revenue'; // 주요 대행사 전년·전월 비교 차트: 매출/광고주수 토글
    let expandedCompAgencyGroups = {}; let expandedCompAgencies = {}; // 대행사 비교 상세 피벗 트리 펼침 상태
    let expandedNewAdvGroups = {}; // 신규광고주 상세 피벗: 연/월 그룹별 펼침 상태 (기본 전부 접힘)
    let upfrontContracts = []; // 업프론트 계약 목록 (광고주(업프론트용)+계약기간 기준 유일 그룹)
    let expandedUpfrontDepts = {}; let expandedUpfrontAdvertisers = {}; // 업프론트 실적 피벗 트리 펼침 상태 (기본 전부 접힘)
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
      '인포머셜': '#38BDF8',
      '큐톤광고': '#FFB547',
      '기타광고': '#4ADE80'
    };
    const categoryOrderList = ['일반광고', 'IMC', '인포머셜', '큐톤광고', '기타광고'];
    const broadOrderMap = { '방송': 1, '디지털': 2, '기타': 3 };

    // **부서 정렬을 위한 부서 커스텀 배열 (매출순이 아닌 팀 번호 순서 정렬용)**
    const customDeptOrder = [
      '광고사업1팀', '광고사업2팀', '광고사업3팀', 
      '공공비즈팀', '디지털영업팀', '광고전략팀', '광고사업본부'
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
