// ============================================================
// js/core/filters.js
// 필터 UI + applyFilters() — 매출분류/필터 규칙의 단일 지점 (커스텀 조합은 shared-helpers.js의 makeCommonMatch() 참고)
// ============================================================
    function updateFilterCheckboxes(isInit) {
      const baseFiltered = rawData.filter(r => {
        if (r.bonbuRevenueStatus !== '본부매출') return false;
        if (selectedYears.length > 0 && !selectedYears.includes(r.year)) return false;
        if (selectedMonths.length > 0 && !selectedMonths.includes(r.month)) return false;
        return true;
      });

      // **부서명 커스텀 정렬 적용 (매출순이 아닌 1팀, 2팀.. 순서)**
      const depts = [...new Set(baseFiltered.map(r => r.dept))].filter(Boolean).sort(compareDeptOrder);
      const targetOrder = ['ENA', 'ENA DRAMA', 'ENA PLAY', 'ENA STORY', 'ONCE', 'OLIFE', 'ENA SPORTS', 'CHING', 'ONT', '헬스메디TV'];
      const channels = [...new Set(baseFiltered.map(r => r.channel))].filter(Boolean).sort((a,b) => {
        let idxA = targetOrder.indexOf(a); let idxB = targetOrder.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1; if (idxB !== -1) return 1;
        return a.localeCompare(b);
      });
      const broads = [...new Set(baseFiltered.map(r => r.broadDigital))].filter(Boolean).sort((a, b) => (broadOrderMap[a] || 99) - (broadOrderMap[b] || 99));
      const cats = [...categoryOrderList];

      renderCheckboxList('Dept', depts, isInit);
      renderCheckboxList('Channel', channels, isInit);
      renderCheckboxList('Broad', broads, isInit);
      renderCheckboxList('Category', cats, isInit);
    }

    function renderCheckboxList(type, list, isInit) {
      const container = document.getElementById(`list${type}Checkboxes`);
      let html = '';
      let allSelectedFlag = type === 'Dept' ? isAllDeptsSelected : (type === 'Channel' ? isAllChannelsSelected : (type === 'Broad' ? isAllBroadsSelected : isAllCategoriesSelected));
      let currentSelectedList = type === 'Dept' ? selectedDepts : (type === 'Channel' ? selectedChannels : (type === 'Broad' ? selectedBroads : selectedCategories));

      list.forEach(item => {
        let isChecked = isInit ? true : (allSelectedFlag || currentSelectedList.includes(item));
        html += `<label class="checkbox-item"><input type="checkbox" value="${item}" onchange="onCheckboxChange('${type}')" ${isChecked ? 'checked' : ''}> ${item}</label>`;
      });
      container.innerHTML = html;
      syncSelectedState(type);
      const checkAll = document.getElementById(`checkAll${type}`);
      if (checkAll) checkAll.checked = allSelectedFlag;
    }

    function toggleAllCheckboxes(type, master) {
      const container = document.getElementById(`list${type}Checkboxes`);
      container.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = master.checked);
      syncSelectedState(type); applyFilters();
    }

    function onCheckboxChange(type) {
      const container = document.getElementById(`list${type}Checkboxes`);
      const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]'));
      const checkAll = document.getElementById(`checkAll${type}`);
      const allChecked = checkboxes.every(cb => cb.checked);
      const someChecked = checkboxes.some(cb => cb.checked);
      if (checkAll) { checkAll.checked = allChecked; checkAll.indeterminate = someChecked && !allChecked; }
      syncSelectedState(type); applyFilters();
    }

    function syncSelectedState(type) {
      const container = document.getElementById(`list${type}Checkboxes`);
      const checkboxes = container.querySelectorAll('input[type="checkbox"]');
      const checkedVals = Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
      const isAllChecked = (checkedVals.length === checkboxes.length) || (checkboxes.length === 0);

      if (type === 'Dept') { selectedDepts = checkedVals; isAllDeptsSelected = isAllChecked; }
      else if (type === 'Channel') { selectedChannels = checkedVals; isAllChannelsSelected = isAllChecked; }
      else if (type === 'Broad') { selectedBroads = checkedVals; isAllBroadsSelected = isAllChecked; }
      else if (type === 'Category') { selectedCategories = checkedVals; isAllCategoriesSelected = isAllChecked; }
      updateDropdownLabel(type);
    }

    function updateDropdownLabel(type) {
      const container = document.getElementById(`list${type}Checkboxes`);
      const checkboxes = container.querySelectorAll('input[type="checkbox"]');
      const checked = container.querySelectorAll('input[type="checkbox"]:checked');
      const label = document.getElementById(`label${type}`);

      let defaultText = '전체 선택';
      if (type === 'Dept') defaultText = '전체 부서'; else if (type === 'Channel') defaultText = '전체 채널'; else if (type === 'Broad') defaultText = '전체 구분'; else if (type === 'Category') defaultText = '전체 대분류';
      if (checked.length === 0) label.innerText = '선택 없음';
      else if (checked.length === checkboxes.length) label.innerText = defaultText;
      else label.innerText = `${checked.length}개 선택됨`;
    }

    function setupYearPills(isInit) {
      const years = [...new Set(rawData.map(r => r.year))].sort((a, b) => b - a);
      const container = document.getElementById('yearPills');
      let html = `<button class="pill-btn" data-year="all">전체</button>`;
      years.forEach(y => { html += `<button class="pill-btn" data-year="${y}">${y}년</button>`; });
      container.innerHTML = html;

      if (isInit) {
        const currentYear = new Date().getFullYear();
        let defaultYear = years.includes(currentYear) ? currentYear : (years.length > 0 ? years[0] : 'all');
        selectedYears = defaultYear === 'all' ? [] : [defaultYear];
      }

      if (selectedYears.length === 0) container.querySelector('[data-year="all"]').classList.add('active');
      else { selectedYears.forEach(y => { const btn = container.querySelector(`[data-year="${y}"]`); if (btn) btn.classList.add('active'); }); }

      container.querySelectorAll('.pill-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const val = e.target.getAttribute('data-year');
          if (val === 'all') { container.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active')); e.target.classList.add('active'); selectedYears = []; } 
          else {
            container.querySelector('[data-year="all"]').classList.remove('active'); e.target.classList.toggle('active');
            const activeBtns = container.querySelectorAll('.pill-btn:not([data-year="all"]).active');
            if (activeBtns.length === 0) { container.querySelector('[data-year="all"]').classList.add('active'); selectedYears = []; } 
            else { selectedYears = Array.from(activeBtns).map(b => parseInt(b.getAttribute('data-year'))); }
          }
          updateMonthPillAvailability();
          updateFilterCheckboxes(false); applyFilters();
        });
      });
      updateMonthPillAvailability();
    }

    function updateMonthPillAvailability() {
      const container = document.getElementById('monthPills');
      if (!container) return;
      const scopeYears = selectedYears.length > 0 ? selectedYears : [...new Set(rawData.map(r => r.year))];
      const availableMonths = new Set();
      rawData.forEach(r => { if (scopeYears.includes(r.year) && r.amount > 0) availableMonths.add(r.month); });

      // 기존에 특정 월이 선택돼 있었다면, 더 이상 데이터가 없는 월은 선택에서 제외
      if (selectedMonths.length > 0) selectedMonths = selectedMonths.filter(m => availableMonths.has(m));
      const isImplicitAll = selectedMonths.length === 0; // "전체"를 눌러서 아무 월도 명시 선택 안 한 상태
      // 개별 월을 하나씩 눌러서 결국 선택 가능한 월을 전부 골랐다면, 의미상 "전체"와 동일하므로 같이 강조
      const isExplicitAll = !isImplicitAll && availableMonths.size > 0 && [...availableMonths].every(m => selectedMonths.includes(m));

      container.querySelectorAll('.pill-btn').forEach(btn => {
        const val = btn.getAttribute('data-month');
        if (val === 'all') return;
        const m = parseInt(val);
        const isAvailable = availableMonths.has(m);
        btn.disabled = !isAvailable;
        btn.classList.toggle('disabled', !isAvailable);
        if (!isAvailable) { btn.classList.remove('active'); return; }
        // "전체" 상태에서는 개별 월을 켜지 않는다. 바로 위 연도 pill과 동일한 규칙이다 —
        // 전체가 켜져 있고 개별은 꺼져 있다가, 하나를 누르면 그 달만 선택된다(가산식).
        btn.classList.toggle('active', selectedMonths.includes(m));
      });

      const allBtn = container.querySelector('[data-month="all"]');
      if (allBtn) allBtn.classList.toggle('active', isImplicitAll || isExplicitAll);
    }

    function setupMonthPills() {
      const container = document.getElementById('monthPills');
      container.querySelectorAll('.pill-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          if (e.target.disabled) return;
          const val = e.target.getAttribute('data-month');
          if (val === 'all') { selectedMonths = []; }
          else {
            // 가산식: 누르면 그 달이 선택에 들어오고, 다시 누르면 빠진다. 전부 빠지면 "전체"로 돌아간다.
            // (예전에는 "전체" 상태에서 개별 월을 누르면 그 달만 빼는 감산식이었다. 개별 월이 전부
            //  켜져 보이는 화면과는 맞았지만, 바로 위 연도 pill과 정반대라 6월만 보려면 7번을 눌러야 했다.)
            const m = parseInt(val);
            if (selectedMonths.includes(m)) selectedMonths = selectedMonths.filter(x => x !== m);
            else selectedMonths = [...selectedMonths, m];
          }
          updateMonthPillAvailability();
          updateFilterCheckboxes(false); applyFilters();
        });
      });
    }

    function applyFilters() {
      const agencyTxt = document.getElementById('inputAgency').value.trim().toLowerCase();
      const advTxt = document.getElementById('inputAdvertiser').value.trim().toLowerCase();

      filteredData = rawData.filter(r => {
        if (r.bonbuRevenueStatus !== '본부매출') return false;
        if (revenueBasisMode === 'performance' && r.revenueBasis !== '실적') return false;
        if (selectedYears.length > 0 && !selectedYears.includes(r.year)) return false;
        if (selectedMonths.length > 0 && !selectedMonths.includes(r.month)) return false;

        if (!isAllDeptsSelected && !selectedDepts.includes(r.dept)) return false;
        if (!isAllChannelsSelected && !selectedChannels.includes(r.channel)) return false;
        if (!isAllBroadsSelected && !selectedBroads.includes(r.broadDigital)) return false;
        if (!isAllCategoriesSelected) {
          let matchCategory = false;
          selectedCategories.forEach(sc => { if (r.categoryReclassified === sc) matchCategory = true; });
          if (!matchCategory) return false;
        }
        
        if (agencyTxt && !(r.agency.toLowerCase().includes(agencyTxt) || r.agencyGroup.toLowerCase().includes(agencyTxt))) return false;
        if (advTxt && !r.advertiser.toLowerCase().includes(advTxt)) return false;
        return true;
      });

      // 이 렌더가 화면 전환인지 단순 필터 변경인지에 따라 차트 애니메이션 길이를 정한다
      // (switchView가 cfg.render() 동안만 진입 플래그를 세운다 — theme-system.js 참고)
      applyChartAnimDuration();

      if (currentView === 'main') renderDashboard();
      else if (currentView === 'channel') renderChannelPivotTable();
      else if (currentView === 'bucket') renderBucketPivotTable();
      else if (currentView === 'advertiser') renderAdvertiserPivotTable();
      else if (currentView === 'agency') renderAgencyPivotTable();
      else if (currentView === 'category') renderCategoryPivotTable();
      else if (currentView === 'dept') renderDeptPivotTable();
      else if (currentView === 'manager') renderManagerPivotTable();
      else if (currentView === 'momPivot') renderMoMPivotTable();
      else if (currentView === 'agencyCompPivot') renderAgencyCompPivotTable();
      else if (currentView === 'newAdvPivot') renderNewAdvPivotTable();
      else if (currentView === 'upfrontPivot') renderUpfrontPivotTable();
      else if (currentView === 'detailData') renderDetailDataPivot();
    }

    function resetFilters() {
      revenueBasisMode = 'performance';
      document.getElementById('btnBasisPerformance').classList.add('active'); document.getElementById('btnBasisAccounting').classList.remove('active');

      const yContainer = document.getElementById('yearPills');
      yContainer.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
      const years = [...new Set(rawData.map(r => r.year))];
      const currentYear = new Date().getFullYear();
      let defaultYear = years.includes(currentYear) ? currentYear : (years.length > 0 ? Math.max(...years) : 'all');
      
      if (defaultYear === 'all') { selectedYears = []; yContainer.querySelector('[data-year="all"]').classList.add('active'); } 
      else { selectedYears = [defaultYear]; const targetBtn = yContainer.querySelector(`[data-year="${defaultYear}"]`); if (targetBtn) targetBtn.classList.add('active'); }

      selectedMonths = [];
      const mContainer = document.getElementById('monthPills');
      mContainer.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
      mContainer.querySelector('[data-month="all"]').classList.add('active');

      updateFilterCheckboxes(true);
      document.getElementById('inputAgency').value = ''; document.getElementById('inputAdvertiser').value = '';
      applyFilters();
    }

    // ==========================================================================
    // [누락되었던 차트 기능 토글 및 신규 광고주 판별 함수]
    // ==========================================================================
