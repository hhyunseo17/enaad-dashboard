// ============================================================
// js/core/state.js
// ?„ì—­ ?íƒœ ë³€??+ ?‰ìƒ ?”ë ˆ??+ ?Œë§ˆ ?¬í¼(CH/mapPivotHtml/toggleTheme) ??ê°€??ë¨¼ì? ë¡œë“œ
// ============================================================
    const DATA_URL = './addata';
    let rawData = [];
    let filteredData = [];
    let tableDisplayData = [];
    let rawSourceSheetRef = null; // 'ë³€?? ?œíŠ¸ë¥?ê·¸ë?ë¡??¤ìš´ë¡œë“œ?˜ê¸° ?„í•œ ?ë³¸ ?œíŠ¸ ê°ì²´ ì°¸ì¡°
    let workbookModifiedDate = null; // ?‘ì? ?Œì¼ ?´ë? ë©”í??°ì´??Core Properties)??ìµœì¢… ?€???œê°
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
    let expandedBucketMetricSections = { 'ê´‘ê³ ì£¼ìˆ˜': true, '?‰ê· ë§¤ì¶œ': true, '?©ê³„ë§¤ì¶œ': true };
    let expandedBucketAdvertisers = {}; // êµ¬ê°„ë³?ë¶„ì„ ?¼ë²—: ê°?êµ¬ê°„(bucket tier) ??ê´‘ê³ ì£?ëª©ë¡ ?¼ì¹¨ ?íƒœ (ê¸°ë³¸ ?„ë? ?‘í˜)

    let expandedCatPivot = {};
    let expandedDeptPivot = {};
    let expandedMgrPivot = {};

    let advertiserActiveMonthIndex = {}; // ? ê·œê´‘ê³ ì£??ë³„ ?±ëŠ¥ê°œì„ ?? advertiser -> [{monthStr, time}] ?•ë ¬??ë°°ì—´
    let expandedMoMCategories = {}; // ?„ì›”?€ë¹?ì¦ê° ?¼ë²—: ì¹´í…Œê³ ë¦¬ë³??¼ì¹¨ ?íƒœ (ê¸°ë³¸ ?„ë? ?‘í˜)
    let agencyCompMetricMode = 'revenue'; // ì£¼ìš” ?€?‰ì‚¬ ?„ë…„Â·?„ì›” ë¹„êµ ì°¨íŠ¸: ë§¤ì¶œ/ê´‘ê³ ì£¼ìˆ˜ ? ê?
    let expandedCompAgencyGroups = {}; let expandedCompAgencies = {}; // ?€?‰ì‚¬ ë¹„êµ ?ì„¸ ?¼ë²— ?¸ë¦¬ ?¼ì¹¨ ?íƒœ
    let expandedNewAdvGroups = {}; // ? ê·œê´‘ê³ ì£??ì„¸ ?¼ë²—: ????ê·¸ë£¹ë³??¼ì¹¨ ?íƒœ (ê¸°ë³¸ ?„ë? ?‘í˜)
    let upfrontContracts = []; // ?…í”„ë¡ íŠ¸ ê³„ì•½ ëª©ë¡ (ê´‘ê³ ì£??…í”„ë¡ íŠ¸??+ê³„ì•½ê¸°ê°„ ê¸°ì? ? ì¼ ê·¸ë£¹)
    let expandedUpfrontDepts = {}; let expandedUpfrontAdvertisers = {}; // ?…í”„ë¡ íŠ¸ ?¤ì  ?¼ë²— ?¸ë¦¬ ?¼ì¹¨ ?íƒœ (ê¸°ë³¸ ?„ë? ?‘í˜)
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
      '?¼ë°˜ê´‘ê³ ': '#4795FF',
      'IMC': '#A855F7',
      '?¸í¬ë¨¸ì…œ': '#38BDF8',
      '?í†¤ê´‘ê³ ': '#FFB547',
      'ê¸°í?ê´‘ê³ ': '#4ADE80'
    };
    const categoryOrderList = ['?¼ë°˜ê´‘ê³ ', 'IMC', '?¸í¬ë¨¸ì…œ', '?í†¤ê´‘ê³ ', 'ê¸°í?ê´‘ê³ '];
    const broadOrderMap = { 'ë°©ì†¡': 1, '?”ì???: 2, 'ê¸°í?': 3 };

    // **ë¶€???•ë ¬???„í•œ ë¶€??ì»¤ìŠ¤?€ ë°°ì—´ (ë§¤ì¶œ?œì´ ?„ë‹Œ ?€ ë²ˆí˜¸ ?œì„œ ?•ë ¬??**
    const customDeptOrder = [
      'ê´‘ê³ ?¬ì—…1?€', 'ê´‘ê³ ?¬ì—…2?€', 'ê´‘ê³ ?¬ì—…3?€', 
      'ê³µê³µë¹„ì¦ˆ?€', '?”ì??¸ì˜?…í?', 'ê´‘ê³ ?„ëµ?€', 'ê´‘ê³ ?¬ì—…ë³¸ë?'
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
