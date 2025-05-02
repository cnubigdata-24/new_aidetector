const fields = ['MW', '선로', '전송', 'IP', '무선', '교환'];
const dashboard = d3.select('#dashboard');
let currentFilterSector = ''; // 현재 필터링된 분야
let alarmData = [];
let currentPage = 1;
const pageSize = 10;
let allEquipmentData = [];

// 초기화 함수
function initializeDashboard() {
  dashboard.html(''); // 기존 내용 삭제

  // 가로 배열을 위해 바로 6개 분야를 추가
  fields.forEach((field) => {
    dashboard
      .append('div')
      .attr('class', 'dashboard-box draggable')
      .attr('data-sector', field)
      .attr('draggable', 'true').html(`
        <h3>${field} 분야</h3>
        <div class="dashboard-content">
          <div>· 경보 장비: <span class="equipment-count">0대</span></div>
          <div>· 전체 경보: <span class="alarm-count">0개</span></div>
          <div>· 유효 경보: <span class="valid-count">0개 (0%)</span></div>
        </div>
      `);
  });

  // 클릭 이벤트 연결
  initializeDashboardBoxClickEvents();
}

function getColumnNameByIndex(index) {
  const columns = [
    'guksa_id',
    'sector',
    'valid_yn',
    'occur_datetime',
    'equip_type',
    'equip_name',
    'alarm_message',
  ];
  return columns[index] || 'guksa_id';
}

function sortData(data, column, direction) {
  console.log(`정렬 실행: ${column}, 방향: ${direction}, 데이터 수: ${data.length}`);

  return [...data].sort((a, b) => {
    // null, undefined 처리
    const valueA =
      a[column] === undefined || a[column] === null ? '' : a[column].toString().toLowerCase();
    const valueB =
      b[column] === undefined || b[column] === null ? '' : b[column].toString().toLowerCase();

    // 숫자 정렬 처리 (숫자로 변환 가능한 경우)
    if (!isNaN(Number(valueA)) && !isNaN(Number(valueB))) {
      return (Number(valueA) - Number(valueB)) * direction;
    }

    // 문자열 정렬
    if (valueA < valueB) return -1 * direction;
    if (valueA > valueB) return 1 * direction;
    return 0;
  });
}

// 드래그 앤 드롭 기능 구현
function initializeDragAndDrop() {
  const draggables = document.querySelectorAll('.draggable');
  draggables.forEach((draggable) => {
    draggable.addEventListener('dragstart', () => {
      draggable.classList.add('dragging');
    });

    draggable.addEventListener('dragend', () => {
      draggable.classList.remove('dragging');
    });
  });

  const containers = document.querySelectorAll('.draggable-container, .dashboard-row');
  containers.forEach((container) => {
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      const afterElement = getDragAfterElement(container, e.clientX, e.clientY);
      const draggable = document.querySelector('.dragging');
      if (afterElement == null) {
        container.appendChild(draggable);
      } else {
        container.insertBefore(draggable, afterElement);
      }
    });
  });
}

function getDragAfterElement(container, x, y) {
  const draggableElements = [...container.querySelectorAll('.draggable:not(.dragging)')];

  return draggableElements.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = {
        x: x - box.left - box.width / 2,
        y: y - box.top - box.height / 2,
      };

      if (
        offset.x < 0 &&
        offset.y < 0 &&
        offset.x > closest.offset.x &&
        offset.y > closest.offset.y
      ) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    },
    { offset: { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY } }
  ).element;
}

// 사이드바 리사이즈 기능
function initializeSidebarResize() {
  const dragHandle = document.getElementById('drag-handle');
  const leftSidebar = document.querySelector('.left-sidebar');
  const toggleBtn = document.getElementById('toggle-btn');
  let isResizing = false;
  let originalWidth = leftSidebar ? leftSidebar.offsetWidth || 280 : 280; // 초기 너비 저장

  // 드래그 핸들 이벤트 리스너
  if (dragHandle) {
    dragHandle.addEventListener('mousedown', function (e) {
      isResizing = true;
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', stopResize);
      // 이벤트 전파 방지
      e.preventDefault();
      e.stopPropagation();
    });
  } else {
    console.error('드래그 핸들 요소를 찾을 수 없습니다.');
  }

  // 토글 버튼 클릭 이벤트
  if (toggleBtn) {
    toggleBtn.addEventListener('click', function () {
      if (leftSidebar.style.width === '0px') {
        leftSidebar.style.width = originalWidth + 'px';
        toggleBtn.innerHTML = '◀';
      } else {
        // 사이드바를 숨기기 전에 현재 크기 저장
        if (leftSidebar.offsetWidth > 0) {
          originalWidth = leftSidebar.offsetWidth;
        }
        leftSidebar.style.width = '0px';
        toggleBtn.innerHTML = '▶';
      }
    });
  } else {
    console.error('토글 버튼 요소를 찾을 수 없습니다.');
  }

  // 마우스 이동 핸들러
  function handleMouseMove(e) {
    if (!isResizing) return;

    const newWidth = e.clientX;

    // 최소 및 최대 너비 제한
    if (newWidth >= 180 && newWidth < 400) {
      leftSidebar.style.width = newWidth + 'px';
      originalWidth = newWidth; // 조정된 너비 저장
    }
  }

  // 리사이징 종료 핸들러
  function stopResize() {
    if (isResizing) {
      isResizing = false;
      // 문서 전체의 이벤트 리스너 제거
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', stopResize);
    }
  }

  // 페이지 벗어날 경우 리사이징 중지
  document.addEventListener('mouseleave', stopResize);
}

// 체크박스 이벤트 초기화
function initializeCheckboxEvents() {
  console.log('체크박스 이벤트 초기화 시작...');

  // DOM 요소 확인
  const allSectorsCheckbox = document.getElementById('allSectors');
  const sectorCheckboxes = document.querySelectorAll('.sector-checkbox');

  console.log(`'전체' 체크박스 찾음: ${allSectorsCheckbox ? '성공' : '실패'}`);
  console.log(`분야 체크박스 개수: ${sectorCheckboxes.length}개 찾음`);

  if (!allSectorsCheckbox) {
    console.error("'전체' 체크박스(#allSectors)를 찾을 수 없습니다!");
    return;
  }

  if (sectorCheckboxes.length === 0) {
    console.error('분야 체크박스(.sector-checkbox)를 찾을 수 없습니다!');
    return;
  }

  // 전체 체크박스 이벤트
  allSectorsCheckbox.addEventListener('change', function () {
    const isChecked = this.checked;
    console.log(`'전체' 체크박스 변경: ${isChecked ? '선택됨' : '해제됨'}`);

    // 모든 분야 체크박스에 적용
    sectorCheckboxes.forEach((checkbox, index) => {
      checkbox.checked = isChecked;
      console.log(
        `분야 체크박스 ${index + 1} (${checkbox.value}): ${isChecked ? '선택됨' : '해제됨'}`
      );
    });

    // 장비명 목록 업데이트
    updateEquipmentList();
  });

  // 개별 체크박스 이벤트
  sectorCheckboxes.forEach((checkbox, index) => {
    checkbox.addEventListener('change', function () {
      console.log(`분야 체크박스 '${this.value}' 변경: ${this.checked ? '선택됨' : '해제됨'}`);

      // 모든 체크박스가 선택되었는지 확인
      const allChecked = Array.from(sectorCheckboxes).every((cb) => cb.checked);
      console.log(
        `모든 분야 체크박스 선택 상태: ${allChecked ? '모두 선택됨' : '일부 선택되지 않음'}`
      );

      // '전체' 체크박스 상태 업데이트
      allSectorsCheckbox.checked = allChecked;
      console.log(`'전체' 체크박스 상태 업데이트: ${allChecked ? '선택됨' : '해제됨'}`);

      // 장비명 목록 업데이트
      updateEquipmentList();
    });
  });

  console.log('체크박스 이벤트 초기화 완료');
}

// 검색 시 분야 체크박스 상태 확인 함수 추가
function getSelectedSectors() {
  // 선택된 분야 목록 가져오기
  const selectedSectors = Array.from(document.querySelectorAll('.sector-checkbox:checked')).map(
    (cb) => cb.value
  );

  console.log(`선택된 분야: ${selectedSectors.join(', ')} (총 ${selectedSectors.length}개)`);
  return selectedSectors;
}

// 장비명 목록 업데이트 함수
function updateEquipmentList() {
  const selectedSectors = Array.from(document.querySelectorAll('.sector-checkbox:checked')).map(
    (cb) => cb.value
  );

  const equipNameSelect = document.getElementById('searchEquipName');
  equipNameSelect.innerHTML = '<option value="">전체 장비명</option>';

  if (!allEquipmentData || allEquipmentData.length === 0) {
    console.log('장비 데이터가 없습니다.');
    return;
  }

  // 선택된 분야의 장비만 필터링
  const filteredEquipment = allEquipmentData.filter((equip) =>
    selectedSectors.includes(equip.sector)
  );

  // 고유한 장비명만 추출하여 정렬
  const uniqueEquipNames = [...new Set(filteredEquipment.map((e) => e.equip_name))].sort();

  // select 옵션 추가
  uniqueEquipNames.forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    equipNameSelect.appendChild(option);
  });
}

// 경보 데이터 검색
async function searchAlarms() {
  try {
    // 현재 선택된 분야 해제
    currentFilterSector = '';
    d3.selectAll('.dashboard-box').classed('selected', false);

    // 정렬 상태 초기화
    window.currentSortedData = null;
    sortColumn = null;
    document.querySelectorAll('.alarm-table th').forEach((th) => {
      th.classList.remove('sort-asc', 'sort-desc');
    });

    // 검색 파라미터 가져오기
    const guksa_id = document.getElementById('searchGuksa').value;

    // 선택된 분야들 가져오기 (체크된 체크박스만)
    const sectors = Array.from(document.querySelectorAll('.sector-checkbox:checked')).map(
      (e) => e.value
    );

    const equip_name = document.getElementById('searchEquipName').value;
    const timeFilter = document.getElementById('timeFilter').value;

    // 로그 추가
    console.log(
      `검색 실행: 국사=${guksa_id}, 분야=${sectors.join(
        ','
      )}, 장비명=${equip_name}, 시간=${timeFilter}`
    );

    // 요청 객체 생성
    const requestData = {
      guksa_id,
      sectors,
      equip_name,
      timeFilter,
    };

    console.log('API 요청 데이터:', requestData);

    const response = await fetch('/api/alarm_dashboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData),
    });

    // 응답 상태 확인
    console.log('응답 상태:', response.status, response.statusText);

    if (!response.ok) {
      throw new Error(`서버 오류: ${response.status} ${response.statusText}`);
    }

    // 응답 텍스트로 먼저 확인
    const responseText = await response.text();
    console.log('응답 원본 텍스트:', responseText);

    // 빈 응답이 아니면 JSON으로 파싱
    let data = [];
    if (responseText && responseText.trim() !== '') {
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error('JSON 파싱 오류:', e);
        // 파싱 오류가 발생해도 빈 배열로 처리
        data = [];
      }
    }

    console.log('파싱된 데이터:', data);

    // 데이터 유효성 검사 수정
    if (!Array.isArray(data)) {
      console.warn('유효하지 않은 데이터 형식 - 배열로 변환:', data);
      data = []; // 빈 배열로 초기화
    }

    alarmData = data;
    currentPage = 1;

    // 현재 필터가 있으면 적용, 없으면 전체 데이터
    if (currentFilterSector) {
      const filteredData = alarmData.filter((d) => d.sector === currentFilterSector);
      updateAlarmTable(filteredData);
    } else {
      updateAlarmTable(alarmData);
    }

    // 대시보드 업데이트
    updateDashboard();

    console.log(`총 ${alarmData.length}개의 경보 데이터를 가져왔습니다.`);
  } catch (error) {
    console.error('경보 데이터 가져오기 오류:', error);
    // 데이터를 가져오지 못해도 UI를 업데이트하기 위해 빈 배열 사용
    alarmData = [];
    updateAlarmTable(alarmData);
    updateDashboard();

    // 사용자에게 친절한 메시지로 표시
    const tbody = d3.select('#alarmTableBody');
    tbody.html('');
    tbody
      .append('tr')
      .append('td')
      .attr('colspan', 6)
      .style('text-align', 'center')
      .text('데이터를 가져오는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
  }
}

// 현재 페이지에 맞춰 테이블 표시
function updateCurrentPageData() {
  let displayData = [];

  // 정렬된 데이터가 있으면 사용
  if (window.currentSortedData && window.currentSortedData.length > 0) {
    displayData = window.currentSortedData;
  } else {
    // 없으면 기본 데이터 필터링
    if (currentFilterSector) {
      displayData = alarmData.filter((d) => d.sector === currentFilterSector);
    } else {
      displayData = alarmData;
    }
  }

  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const paginatedData = displayData.slice(start, end);

  updateAlarmTableContent(paginatedData);
}

// 테이블에 데이터 표시만 (페이지네이션 제외)
function updateAlarmTableContent(data) {
  const tbody = d3.select('#alarmTableBody');
  tbody.html('');

  if (!data || data.length === 0) {
    tbody
      .append('tr')
      .append('td')
      .attr('colspan', 7) // 컬럼 개수 업데이트
      .style('text-align', 'center')
      .text('표시할 데이터가 없습니다.');
    return;
  }

  data.forEach((d) => {
    const isValid = d.valid_yn === 'Y';
    const validStatus = isValid ? '유효' : '무효';

    const row = tbody.append('tr').classed('valid-alarm-row', isValid);
    let alarm_details = '';

    row
      .append('td')
      .attr('class', 'col-guksa')
      .text(d.guksa_id || '-');
    row
      .append('td')
      .attr('class', 'col-sector')
      .text(d.sector || '-');
    row.append('td').attr('class', 'col-valid').text(validStatus);

    // 발생시간 컬럼 추가
    row
      .append('td')
      .attr('class', 'col-occur-time')
      .text(d.occur_datetime && d.occur_datetime.trim() !== '' ? d.occur_datetime : '-');

    row
      .append('td')
      .attr('class', 'col-equip-type')
      .text(d.equip_type || '-');
    row
      .append('td')
      .attr('class', 'col-equip-name')
      .text(d.equip_name || '-');

    alarm_details = d.fault_reason
      ? d.fault_reason + '::' + (d.alarm_message || '-')
      : d.alarm_message || '-';

    row
      .append('td')
      .attr('class', 'col-alarm-message')
      .text(alarm_details || '-');
  });
}

// 대시보드 업데이트 함수 수정
function updateDashboard() {
  // 각 분야별 데이터 집계
  const summary = {};
  fields.forEach((field) => {
    summary[field] = [];
  });

  console.log('대시보드 업데이트 시작, 경보 데이터 개수:', alarmData ? alarmData.length : 0);

  // 분야별로 데이터 분류
  if (alarmData && alarmData.length > 0) {
    alarmData.forEach((item) => {
      // 필드가 존재하고 fields 배열에 있는지 확인
      if (item.sector && fields.includes(item.sector)) {
        if (!summary[item.sector]) {
          summary[item.sector] = [];
        }
        summary[item.sector].push(item);
      }
    });
  }

  // 전체 현황 계산
  let totalEquipmentCount = 0;
  let totalAlarmCount = 0;
  let totalValidCount = 0;

  // 각 분야별 현황 합산
  fields.forEach((field) => {
    const items = summary[field] || [];
    const validAlarms = items.filter((d) => d.valid_yn === 'Y').length;
    const uniqueEquipmentCount = new Set(items.map((d) => d.equip_name)).size;

    totalEquipmentCount += uniqueEquipmentCount;
    totalAlarmCount += items.length;
    totalValidCount += validAlarms;
  });

  // 전체 현황 업데이트 - 천 단위 콤마 포맷팅 추가
  document.getElementById(
    'total-equipment-count'
  ).textContent = `경보 장비(${formatNumberWithCommas(totalEquipmentCount)}대),`;
  document.getElementById('total-alarm-count').textContent = `전체 경보(${formatNumberWithCommas(
    totalAlarmCount
  )}건),`;
  document.getElementById('total-valid-count').textContent = `유효 경보(${formatNumberWithCommas(
    totalValidCount
  )}개)`;

  // 각 분야별 대시보드 업데이트
  fields.forEach((field) => {
    const box = d3.select(`[data-sector="${field}"]`);

    // 박스가 존재하는지 확인
    if (box.empty()) {
      console.warn(`분야 [${field}]에 해당하는 대시보드 요소를 찾을 수 없습니다.`);
      return;
    }

    const items = summary[field] || [];
    const validAlarms = items.filter((d) => d.valid_yn === 'Y').length;
    const uniqueEquipmentCount = new Set(items.map((d) => d.equip_name)).size;
    const validPercentage = items.length ? Math.round((validAlarms / items.length) * 100) : 0;

    // 유효 경보가 있는 경우 색상 변경
    if (validAlarms > 0) {
      box.classed('has-valid-alarms', true);
      box.select('h3').style('color', '#ff8c00');
    } else {
      box.classed('has-valid-alarms', false);
      box.select('h3').style('color', '#333');
    }

    // 대시보드 내용 업데이트
    box.select('.equipment-count').text(`${uniqueEquipmentCount}대`);
    box.select('.alarm-count').text(`${items.length}개`);

    // 유효 경보 하이라이트
    const validCountSpan = box.select('.valid-count');
    validCountSpan.text(`${validAlarms}개 (${validPercentage}%)`);
    if (validAlarms > 0) {
      validCountSpan.classed('highlight-valid', true);
    } else {
      validCountSpan.classed('highlight-valid', false);
    }
  });
}

// 경보 테이블 업데이트 함수 수정 - 컬럼 클래스 추가
function updateAlarmTable(data) {
  const totalItems = data.length;
  renderPagination(totalItems);
  updateCurrentPageData();
}

function renderPagination(totalItems) {
  const totalPages = Math.ceil(totalItems / pageSize);

  $('#pagination').pagination({
    items: totalItems,
    itemsOnPage: pageSize,
    currentPage: currentPage,
    displayedPages: 5,
    edges: 2,
    prevText: '이전',
    nextText: '다음',
    onPageClick: function (pageNumber) {
      currentPage = pageNumber;
      updateCurrentPageData(); // 정렬 상태가 유지된 데이터로 페이지 갱신
    },
  });
}

// 정렬 상태 변수 추가
let sortColumn = null;
let sortDirection = 1; // 1: 오름차순, -1: 내림차순

// 테이블 헤더 클릭 이벤트 설정 - 정렬 문제 수정
function setupTableHeaderSort() {
  const headers = document.querySelectorAll('.alarm-table th');

  headers.forEach((header, index) => {
    // 중복 방지: 기존 이벤트 제거
    const newHeader = header.cloneNode(true);
    header.parentNode.replaceChild(newHeader, header);

    newHeader.style.cursor = 'pointer';

    newHeader.addEventListener('click', () => {
      const column = getColumnNameByIndex(index);
      console.log(`정렬 시도: 컬럼=${column}, 현재 정렬=${sortColumn}, 방향=${sortDirection}`);

      if (sortColumn === column) {
        sortDirection *= -1; // 정렬 방향 뒤집기
      } else {
        sortColumn = column;
        sortDirection = 1; // 기본 오름차순
      }

      // 현재 필터링된 데이터를 가져옴
      let currentData = [...alarmData]; // 복사본 생성
      if (currentFilterSector) {
        currentData = currentData.filter((d) => d.sector === currentFilterSector);
      }

      // 데이터 정렬
      const sortedData = sortData(currentData, column, sortDirection);

      // 정렬된 데이터를 표시 (alarmData는 그대로 두고 현재 보여지는 데이터만 정렬)
      currentPage = 1;
      renderPagination(sortedData.length);
      updateAlarmTableContent(sortedData.slice(0, pageSize));

      // 정렬 표시 갱신 - 모든 헤더에서 정렬 클래스 제거 후 현재 헤더에만 적용
      document.querySelectorAll('.alarm-table th').forEach((th) => {
        th.classList.remove('sort-asc', 'sort-desc');
      });

      newHeader.classList.add(sortDirection === 1 ? 'sort-asc' : 'sort-desc');

      // sortedData 저장 (임시 저장소)
      window.currentSortedData = sortedData;

      console.log(`정렬 완료: 컬럼=${column}, 방향=${sortDirection}, 행 수=${sortedData.length}`);
    });
  });
}

// 초기 장비 데이터 가져오기
async function fetchEquipmentData() {
  try {
    const response = await fetch('/api/equipment_list');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    allEquipmentData = await response.json();
    console.log('장비 데이터 로드 완료:', allEquipmentData.length);
    updateEquipmentList();
  } catch (error) {
    console.error('장비 데이터 가져오기 오류:', error);
    allEquipmentData = [];
  }
}

// 페이지 로드 시 초기화 실행
function initialize() {
  initializeDashboard();
  fetchEquipmentData();
  initializeCheckboxEvents();

  searchAlarms();
  setupTableHeaderSort(); // 테이블 헤더 정렬 설정 추가
}

// 페이지네이션 표시 시 테이블 높이 자동 조정
function adjustTableHeight(totalPages) {
  const bottomDiv = document.querySelector('.bottom-div');
  const tableContainer = document.querySelector('.table-container');

  if (totalPages > 1) {
    // 페이지네이션이 필요한 경우, 테이블 컨테이너 높이 조정
    tableContainer.style.height = 'calc(100% - 40px)';
  } else {
    // 페이지네이션이 필요 없는 경우
    tableContainer.style.height = '100%';
  }
}

// 숫자에 천 단위 콤마를 추가하는 함수
function formatNumberWithCommas(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// 테이블 컬럼 리사이징 기능 구현
function setupColumnResizing() {
  const table = document.querySelector('.alarm-table');
  const headers = table.querySelectorAll('th');

  headers.forEach((header) => {
    // 각 헤더에 리사이저 핸들 추가
    const resizer = document.createElement('div');
    resizer.className = 'column-resizer';
    header.appendChild(resizer);

    let startX, startWidth;

    // 드래그 시작 이벤트
    resizer.addEventListener('mousedown', (e) => {
      startX = e.pageX;
      startWidth = header.offsetWidth;

      // 리사이징 중임을 표시
      resizer.classList.add('resizing');

      // 이벤트 전파 방지
      e.preventDefault();
      e.stopPropagation();

      // 드래그 이벤트 리스너 추가
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    // 드래그 중 이벤트
    function onMouseMove(e) {
      // 새 너비 계산
      const newWidth = startWidth + (e.pageX - startX);

      // 최소 너비 제한
      if (newWidth >= 30) {
        // 헤더 너비 설정
        header.style.width = `${newWidth}px`;
        header.style.minWidth = `${newWidth}px`;

        // 해당 열의 모든 셀 너비 설정
        const colIndex = Array.from(headers).indexOf(header);
        const rows = table.querySelectorAll('tbody tr');

        rows.forEach((row) => {
          const cell = row.cells[colIndex];
          if (cell) {
            cell.style.width = `${newWidth}px`;
            cell.style.minWidth = `${newWidth}px`;
          }
        });
      }
    }

    // 드래그 종료 이벤트
    function onMouseUp() {
      resizer.classList.remove('resizing');

      // 이벤트 리스너 제거
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      // 컬럼 너비 저장 (선택 사항)
      saveColumnWidths();
    }
  });
}

// 컬럼 너비 저장 (로컬 스토리지 활용)
function saveColumnWidths() {
  const headers = document.querySelectorAll('.alarm-table th');
  const widths = Array.from(headers).map((header) => header.style.width);

  localStorage.setItem('tableColumnWidths', JSON.stringify(widths));
}

// 저장된 컬럼 너비 불러오기
function loadColumnWidths() {
  const savedWidths = localStorage.getItem('tableColumnWidths');

  if (savedWidths) {
    const widths = JSON.parse(savedWidths);
    const headers = document.querySelectorAll('.alarm-table th');

    widths.forEach((width, index) => {
      if (headers[index] && width) {
        headers[index].style.width = width;
        headers[index].style.minWidth = width;

        // 해당 열의 모든 셀에도 적용
        const rows = document.querySelectorAll('.alarm-table tbody tr');
        rows.forEach((row) => {
          const cell = row.cells[index];
          if (cell) {
            cell.style.width = width;
            cell.style.minWidth = width;
          }
        });
      }
    });
  }
}

function initializeDashboardBoxClickEvents() {
  d3.selectAll('.dashboard-box').on('click', function () {
    const sector = d3.select(this).attr('data-sector');
    const hasValidAlarms = d3.select(this).classed('has-valid-alarms');

    if (currentFilterSector === sector) {
      currentFilterSector = '';
      d3.selectAll('.dashboard-box').classed('selected', false);

      d3.selectAll('.dashboard-box h3').each(function () {
        const box = d3.select(this.parentNode);
        const hasAlarms = box.classed('has-valid-alarms');
        d3.select(this).style('color', hasAlarms ? '#ff8c00' : '#333');
      });

      currentPage = 1;
      // 정렬 상태 초기화
      window.currentSortedData = null;
      sortColumn = null;
      document.querySelectorAll('.alarm-table th').forEach((th) => {
        th.classList.remove('sort-asc', 'sort-desc');
      });

      renderPagination(alarmData.length);
      updateCurrentPageData();
    } else {
      currentFilterSector = sector;
      d3.selectAll('.dashboard-box').classed('selected', false);
      d3.select(this).classed('selected', true);

      d3.selectAll('.dashboard-box h3').each(function () {
        const box = d3.select(this.parentNode);
        const isSelected = box.classed('selected');
        const hasAlarms = box.classed('has-valid-alarms');

        if (isSelected) {
          d3.select(this).style('color', hasAlarms ? '#e65c00' : '#0056b3');
        } else {
          d3.select(this).style('color', hasAlarms ? '#ff8c00' : '#333');
        }
      });

      const filteredData = alarmData.filter((d) => d.sector === sector);
      currentPage = 1;
      // 정렬 상태 초기화
      window.currentSortedData = null;
      sortColumn = null;
      document.querySelectorAll('.alarm-table th').forEach((th) => {
        th.classList.remove('sort-asc', 'sort-desc');
      });

      renderPagination(filteredData.length);
      updateCurrentPageData();
    }
  });
}

// 테이블 행 클릭 시 국사 ID 가져오는 함수
// 테이블 행 클릭 시 국사 ID 가져오는 함수
function setupTableRowClick() {
  const tableBody = document.querySelector('.alarm-table tbody');

  tableBody.addEventListener('click', function (event) {
    const clickedRow = event.target.closest('tr');

    if (!clickedRow) return;

    // 첫 번째 열(국사 ID)의 텍스트 가져오기
    const guksaId = clickedRow.querySelector('td:first-child').textContent.trim();

    console.log('클릭한 국사 ID:', guksaId);
    console.log('클릭한 행 데이터:', clickedRow.innerHTML);

    // 빈 값이나 '-' 값 체크
    if (!guksaId || guksaId === '-') {
      console.warn('유효하지 않은 국사 ID:', guksaId);
      return;
    }

    // 국사 ID로 장비 정보 조회 함수 호출
    fetchEquipmentByGuksaId(guksaId);
  });
}

// 장비 정보 조회 함수 - 네트워크 맵 생성 연결
function fetchEquipmentByGuksaId(guksaId) {
  try {
    if (!guksaId) {
      console.error('국사 ID가 제공되지 않았습니다.');
      return;
    }

    // 맵 컨테이너에 로딩 표시
    const mapContainer = document.getElementById('map-container');
    mapContainer.innerHTML = '<div class="loading-indicator">데이터를 불러오는 중...</div>';

    console.log(`/api/get_equiplist API 호출: ${guksaId}`);

    // API 호출
    fetch('/api/get_equiplist', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ guksa_id: guksaId }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`서버 오류 (${response.status})`);
        }
        return response.text();
      })
      .then((responseText) => {
        console.log('API 응답:', responseText);

        // 빈 응답 체크
        if (!responseText || responseText.trim() === '') {
          throw new Error('서버에서 빈 응답이 반환되었습니다.');
        }

        // JSON 파싱
        const equipmentData = JSON.parse(responseText);

        // 데이터 유효성 검사
        if (
          !equipmentData ||
          !equipmentData.equip_list ||
          !Array.isArray(equipmentData.equip_list)
        ) {
          throw new Error('유효하지 않은 장비 데이터 형식입니다.');
        }

        // 장비 목록이 비어있는지 확인
        if (equipmentData.equip_list.length === 0) {
          mapContainer.innerHTML =
            '<div class="no-data-message">해당 국사에 등록된 장비가 없습니다.</div>';
          return;
        }

        console.log('장비 데이터 로드 완료:', equipmentData);

        // 네트워크 맵 생성 (network_map.js의 함수 호출)
        createNetworkMap(equipmentData);
      })
      .catch((error) => {
        console.error('장비 정보 조회 중 오류 발생:', error);

        // 사용자에게 오류 메시지 표시
        const mapContainer = document.getElementById('map-container');
        mapContainer.innerHTML = `<div class="error-message">
        <p>장비 정보를 불러오는 중 오류가 발생했습니다.</p>
        <p>상세 오류: ${error.message}</p>
      </div>`;
      });
  } catch (error) {
    console.error('장비 정보 조회 중 오류 발생:', error);

    // 사용자에게 오류 메시지 표시
    const mapContainer = document.getElementById('map-container');
    mapContainer.innerHTML = `<div class="error-message">
      <p>장비 정보를 불러오는 중 오류가 발생했습니다.</p>
      <p>상세 오류: ${error.message}</p>
    </div>`;
  }
}

// 대시보드 외곽 클릭 이벤트 처리
document.addEventListener('DOMContentLoaded', function () {
  const topDashboard = document.querySelector('.top-dashboard');
  if (topDashboard) {
    topDashboard.addEventListener('click', function (event) {
      // 클릭된 요소가 대시보드 박스가 아닌 경우에만 처리
      if (!event.target.closest('.dashboard-box')) {
        // 모든 선택 해제
        d3.selectAll('.dashboard-box').classed('selected', false);
        currentFilterSector = '';

        // 모든 경보 데이터로 테이블 업데이트
        updateAlarmTable(alarmData);
      }
    });
  }
});

document.addEventListener('DOMContentLoaded', () => {
  // dashboard 클래스 강제 적용
  const dashboardEl = document.getElementById('dashboard');
  if (dashboardEl) {
    dashboardEl.style.display = 'flex';
    dashboardEl.style.flexDirection = 'row';
    dashboardEl.style.flexWrap = 'nowrap';
    dashboardEl.style.width = '100%';
    dashboardEl.style.overflowX = 'auto';
  }

  // 기존 초기화 함수 호출
  initialize();
  initializeDashboardBoxClickEvents();
  initializeCheckboxEvents();
  setupColumnResizing();
  loadColumnWidths();
  setupTableHeaderSort(); // 테이블 헤더 정렬 설정 추가

  // 사이드바 리사이즈 기능 초기화
  initializeSidebarResize();

  // 사이드바 초기 상태 설정
  const leftSidebar = document.querySelector('.left-sidebar');
  const toggleBtn = document.getElementById('toggle-btn');

  if (leftSidebar && toggleBtn) {
    // 초기 버튼 상태 설정
    toggleBtn.innerHTML = '◀';

    // 초기 너비가 설정되어 있지 않으면 기본값 설정
    if (!leftSidebar.style.width) {
      leftSidebar.style.width = '280px';
    }
  }

  // 테이블 행 클릭 이벤트 설정 (기존 코드)
  setupTableRowClick();

  // 기본 맵 컨테이너 메시지 설정 (기존 코드)
  const mapContainer = document.getElementById('map-container');
  if (mapContainer) {
    mapContainer.innerHTML =
      '<div class="initial-message">테이블에서 국사를 선택하면 네트워크 맵이 표시됩니다.</div>';
  }
});

// 검색 결과 초기화 함수에 정렬 상태 초기화 추가
function resetSearchState() {
  // 정렬 상태 초기화
  window.currentSortedData = null;
  sortColumn = null;
  sortDirection = 1;
  document.querySelectorAll('.alarm-table th').forEach((th) => {
    th.classList.remove('sort-asc', 'sort-desc');
  });
}
