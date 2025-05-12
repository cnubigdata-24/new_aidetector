/**
 * 경보 대시보드 시스템: 주요 기능: 분야별 경보 표시, 데이터 필터링, 테이블 정렬, 국사/장비 기준 뷰 등
 */

// 상수 및 전역 변수 정의
const FIELDS = ['MW', '선로', '전송', 'IP', '무선', '교환'];
const PAGE_SIZE = 10;
const TABLE_COLUMNS = [
  'guksa_id',
  'sector',
  'valid_yn',
  'occur_datetime',
  'equip_id',
  'equip_type',
  'equip_name',
  'alarm_message',
];

// 상태 변수들
let currentFilterSector = ''; // 현재 필터링된 분야
let alarmData = []; // 경보 데이터
let summaryAlarmData = []; // 요약 경보 데이터
let currentPage = 1; // 현재 페이지
let allEquipmentData = []; // 모든 장비 데이터
let currentView = 'equipment'; // 현재 뷰 (장비 기준 또는 국사 기준)
let sortColumn = null; // 정렬 컬럼
let sortDirection = 1; // 정렬 방향 (1: 오름차순, -1: 내림차순)

// DOM 요소 선택 유틸리티 함수
const DOM = {
  dashboard: () => d3.select('#dashboard'),
  mapContainer: () => document.getElementById('map-container'),
  alarmTableBody: () => document.getElementById('alarmTableBody'),
  searchGuksa: () => document.getElementById('searchGuksa'),
  searchEquipName: () => document.getElementById('searchEquipName'),
  timeFilter: () => document.getElementById('timeFilter'),
  pagination: () => $('#pagination'),
  leftSidebar: () => document.querySelector('.left-sidebar'),
  toggleBtn: () => document.getElementById('toggle-btn'),
  dragHandle: () => document.getElementById('drag-handle'),
  equipmentViewBtn: () => document.getElementById('equipment-view-btn'),
  guksaViewBtn: () => document.getElementById('guksa-view-btn'),
};

// 유틸리티 함수들

// 숫자에 천 단위 콤마를 추가하는 함수
function formatNumberWithCommas(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// 컬럼 인덱스로 컬럼명 가져오기
function getColumnNameByIndex(index) {
  return TABLE_COLUMNS[index] || 'guksa_id';
}

// 데이터 정렬 함수
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

// 초기화 함수
function initializeDashboard() {
  const dashboard = DOM.dashboard();
  dashboard.html(''); // 기존 내용 삭제

  // 가로 배열을 위해 바로 6개 분야를 추가
  FIELDS.forEach((field) => {
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

// 드래그 앤 드롭 기능
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

/**
 * 이벤트 핸들러 초기화 함수들
 */

// 네트워크 타입(분야) 라디오 버튼 이벤트 초기화
function initializeNetworkTypeEvents() {
  const networkTypeRadios = document.querySelectorAll('input[name="networkType"]');

  networkTypeRadios.forEach((radio) => {
    radio.addEventListener('change', function () {
      if (this.checked) {
        const selectedSector = this.value;
        // 해당 dashboard-box에 클릭 이벤트 트리거
        const boxEl = document.querySelector(`.dashboard-box[data-sector="${selectedSector}"]`);
        if (boxEl) {
          boxEl.dispatchEvent(new MouseEvent('click'));
        }
      }
    });
  });
}

// 대시보드 박스 클릭 이벤트
function initializeDashboardBoxClickEvents() {
  d3.selectAll('.dashboard-box').on('click', async function () {
    const sector = d3.select(this).attr('data-sector');
    // 라디오 버튼 동기화
    const radio = document.querySelector(`input[name="networkType"][value="${sector}"]`);
    if (radio) {
      radio.checked = true;
      await updateEquipmentListBySector(sector);
    }
    // 테이블 갱신 (radio 선택 반영)
    await searchAlarms();
    // UI 하이라이트: 선택된 박스 강조
    document.querySelectorAll('.dashboard-box').forEach((el) => el.classList.remove('selected'));
    this.classList.add('selected');
  });
}

// 체크박스 이벤트 초기화 (간소화)
function initializeCheckboxEvents() {
  console.log('체크박스 이벤트 초기화 완료');
}

// 테이블 헤더 클릭 이벤트 설정 - 정렬
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
      updateAlarmTableContent(sortedData.slice(0, PAGE_SIZE));

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

// 테이블 행 클릭 이벤트 설정 함수
function setupTableRowClick() {
  const tbody = DOM.alarmTableBody();
  if (!tbody) return;

  tbody.addEventListener('click', function (event) {
    // 행 엘리먼트 찾기
    const row = event.target.closest('tr');
    if (!row) return;

    // 행에서 국사 ID 추출
    const guksaId = row.getAttribute('data-guksa-id');
    // 행에서 장비 ID 추출 (equip_id 열에서 가져옴)
    const equipIdCell = row.querySelector('.col-equip-id');
    const equipId = equipIdCell ? equipIdCell.textContent.trim() : '';

    if (!guksaId) {
      console.error('행에 guksa_id 속성이 설정되어 있지 않습니다.');
      return;
    }

    console.log(`선택한 국사 ID: ${guksaId}, 장비 ID: ${equipId}, 현재 뷰: ${currentView}`);

    // 현재 뷰에 따라 다른 함수 호출
    if (currentView === 'guksa') {
      // 국사 기준일 때 기존 국사 네트워크 맵 표시
      fetchEquipmentByGuksaId(guksaId);
    } else {
      // 장비 기준일 때 장비 네트워크 맵 표시
      fetchEquipmentNetworkByGuksaId(guksaId, equipId);
    }
  });
}

// 장비/국사 기준 전환 버튼 초기화 및 이벤트 설정
function setupViewToggleButtons() {
  const equipmentViewBtn = DOM.equipmentViewBtn();
  const guksaViewBtn = DOM.guksaViewBtn();

  if (!equipmentViewBtn || !guksaViewBtn) {
    console.error('뷰 전환 버튼을 찾을 수 없습니다.');
    return;
  }

  // 초기 클래스 설정 (페이지 로드 시 장비 기준)
  document.body.classList.add('equipment-view');
  document.body.classList.remove('guksa-view');

  // 장비 기준 버튼 클릭 이벤트
  equipmentViewBtn.addEventListener('click', function () {
    if (currentView !== 'equipment') {
      currentView = 'equipment';
      // 클래스 전환
      document.body.classList.add('equipment-view');
      document.body.classList.remove('guksa-view');
      updateViewButtons();
      showEquipmentDashboard();
    }
  });

  // 국사 기준 버튼 클릭
  guksaViewBtn.addEventListener('click', function () {
    if (currentView !== 'guksa') {
      currentView = 'guksa';
      // 클래스 전환
      document.body.classList.add('guksa-view');
      document.body.classList.remove('equipment-view');

      updateViewButtons();
      showGuksaDashboard();
    }
  });

  // 버튼 활성화 상태 업데이트
  function updateViewButtons() {
    equipmentViewBtn.classList.toggle('active', currentView === 'equipment');
    guksaViewBtn.classList.toggle('active', currentView === 'guksa');
  }
}

// 장비 기준 대시보드 표시
function showEquipmentDashboard() {
  // 대시보드 영역 표시
  const dashboardElement = document.getElementById('dashboard');
  if (dashboardElement) {
    dashboardElement.style.display = 'flex';
  }

  // 맵 컨테이너 유지하되 내용 비움
  const mapContainer = DOM.mapContainer();
  if (mapContainer) {
    mapContainer.style.display = 'block';

    // 테이블에서 국사/장비를 선택하기 전에는 안내 메시지를 표시
    mapContainer.innerHTML =
      '<div class="instruction-message" style="color: #666; text-align: center; margin-top: 20px; font-style: italic;">' +
      '아래 테이블 클릭 시 해당 국사와 연결된 경보발생 장비들이 여기에 표시됩니다.<br></div>';
  }

  // 현재 보유한 데이터로 대시보드 갱신
  updateDashboard();
}

// 국사 기준 대시보드 표시
function showGuksaDashboard() {
  // 맵 컨테이너 표시 (국사 기준에서는 맵을 표시)
  const mapContainer = DOM.mapContainer();
  if (mapContainer) {
    mapContainer.style.display = 'block';

    mapContainer.innerHTML =
      '<div class="instruction-message" style="color: #666; text-align: center; margin-top: 20px; font-style: italic;">' +
      '아래 테이블 클릭 시 해당 국사와 연결된 경보발생 장비들이 여기에 표시됩니다.<br></div>';
  }

  // 대시보드 영역 계속 표시 (현재 국사 기준 뷰는 개발 중이므로 대시보드도 함께 표시)
  const dashboardElement = document.getElementById('dashboard');
  if (dashboardElement) {
    dashboardElement.style.display = 'flex';
  }

  // 현재 보유한 데이터로 대시보드 갱신 (계속 보이도록)
  updateDashboard();
}

/**
 * 데이터 처리 함수들
 */

// 선택된 분야에 따라 장비 목록 업데이트
async function updateEquipmentListBySector(sector) {
  console.log(`분야에 따른 장비 목록 업데이트 시작: ${sector}`);

  try {
    const guksaSelect = DOM.searchGuksa();
    const guksaId = guksaSelect ? guksaSelect.value : '';

    // API 호출 데이터 준비
    const requestData = {
      sector: sector,
    };

    // 국사가 선택된 경우 추가
    if (guksaId) {
      requestData.guksa_id = guksaId;
    }

    // API 호출
    const response = await fetch('/api/equipment_by_sector', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      throw new Error(`API 오류: ${response.status}`);
    }

    const data = await response.json();
    console.log('장비 목록 데이터:', data);

    // 장비 선택 드롭다운 업데이트
    const equipSelect = DOM.searchEquipName();
    equipSelect.innerHTML = ''; // 기존 옵션 제거

    if (data && data.length > 0) {
      // 장비 목록 표시
      data.forEach((equip) => {
        const option = document.createElement('option');
        option.value = equip.equip_name;
        option.textContent = equip.equip_name;
        option.dataset.equipId = equip.equip_id;
        equipSelect.appendChild(option);
      });
    } else {
      // 장비가 없는 경우
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '해당 분야의 장비가 없습니다';
      equipSelect.appendChild(option);
    }
  } catch (error) {
    console.error('장비 목록 가져오기 오류:', error);
    showErrorMessage('장비 목록을 가져오는 중 오류가 발생했습니다.');
  }
}

// 경보 데이터 검색
async function searchAlarms() {
  try {
    // 현재 선택된 분야 해제
    currentFilterSector = '';
    d3.selectAll('.dashboard-box').classed('selected', false);

    // 정렬 상태 초기화
    resetSearchState();

    // 검색 파라미터 가져오기
    const guksa_id = DOM.searchGuksa().value;

    // 선택된 분야(네트워크 타입 라디오 버튼) 가져오기
    let sectors = [];
    const networkRadio = document.querySelector('input[name="networkType"]:checked');
    if (networkRadio) {
      sectors = [networkRadio.value];
    } else {
      // 기존 체크박스 사용 시에도 호환
      sectors = Array.from(document.querySelectorAll('.sector-checkbox:checked')).map(
        (e) => e.value
      );
    }

    const equip_name = DOM.searchEquipName().value;
    const timeFilter = DOM.timeFilter().value;

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

    // 경보 데이터 API 호출
    const alarmResponse = await apiCall('/api/alarm_dashboard', requestData);
    alarmData = ensureArray(alarmResponse);

    // 요약 데이터 API 호출 (국사 ID만 전달)
    const summaryResponse = await apiCall('/api/alarm_dashboard', { guksa_id });
    summaryAlarmData = ensureArray(summaryResponse);

    // 페이지 초기화
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
    alarmData = [];

    updateAlarmTable(alarmData);
    updateDashboard();
    showTableErrorMessage('데이터를 가져오는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
  }
}

// API 호출 공통 함수
async function apiCall(url, data) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`서버 오류: ${response.status} ${response.statusText}`);
  }

  const responseText = await response.text();

  if (!responseText || responseText.trim() === '') {
    return [];
  }

  try {
    return JSON.parse(responseText);
  } catch (e) {
    console.error('JSON 파싱 오류:', e);
    return [];
  }
}

// 배열 확인 유틸리티 함수
function ensureArray(data) {
  if (!data) return [];
  return Array.isArray(data) ? data : [];
}

// 검색 상태 초기화
function resetSearchState() {
  window.currentSortedData = null;
  sortColumn = null;
  sortDirection = 1;
  document.querySelectorAll('.alarm-table th').forEach((th) => {
    th.classList.remove('sort-asc', 'sort-desc');
  });
}

// 테이블 에러 메시지 표시
function showTableErrorMessage(message) {
  const tbody = DOM.alarmTableBody();
  if (!tbody) return;

  tbody.innerHTML = '';
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = 8;
  cell.textContent = message;
  cell.style.textAlign = 'center';
  row.appendChild(cell);
  tbody.appendChild(row);
}

// 일반 에러 메시지 표시
function showErrorMessage(message) {
  alert(message);
}

/**
 * 테이블 및 페이지네이션 관련 함수들
 */

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

  const start = (currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const paginatedData = displayData.slice(start, end);

  updateAlarmTableContent(paginatedData);
}

// 경보 테이블 업데이트 함수
function updateAlarmTable(data) {
  const totalItems = data.length;
  renderPagination(totalItems);
  updateCurrentPageData();
}

// 페이지네이션 렌더링
function renderPagination(totalItems) {
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);

  // 페이지네이션 높이에 따라 테이블 컨테이너 조정
  adjustTableHeight(totalPages);

  DOM.pagination().pagination({
    items: totalItems,
    itemsOnPage: PAGE_SIZE,
    currentPage: currentPage,
    displayedPages: 10,
    edges: 4,
    prevText: 'Prev',
    nextText: 'Next',
    onPageClick: function (pageNumber) {
      currentPage = pageNumber;
      updateCurrentPageData(); // 정렬 상태가 유지된 데이터로 페이지 갱신
    },
  });
}

// 페이지네이션 표시 시 테이블 높이 자동 조정
function adjustTableHeight(totalPages) {
  const tableContainer = document.querySelector('.table-container');
  if (!tableContainer) return;

  if (totalPages > 1) {
    // 페이지네이션이 필요한 경우, 테이블 컨테이너 높이 조정
    tableContainer.style.height = 'calc(100% - 40px)';
  } else {
    // 페이지네이션이 필요 없는 경우
    tableContainer.style.height = '100%';
  }
}

// 테이블에 데이터 표시
function updateAlarmTableContent(data) {
  const tBody = DOM.alarmTableBody();
  if (!tBody) return;

  tBody.innerHTML = '';

  if (!data || data.length === 0) {
    showTableErrorMessage('데이터가 없습니다');
    return;
  }

  // 유효경보 표시 준비
  const validCounts = {}; // 분야별 유효 경보 카운트
  FIELDS.forEach((field) => {
    validCounts[field] = 0;
  });

  // 테이블 행 생성
  data.forEach((item) => {
    const row = document.createElement('tr');

    // 국사 ID를 data 속성으로 추가 (클릭 이벤트에서 사용)
    row.setAttribute('data-guksa-id', item.guksa_id);

    // 유효경보인 경우 행 스타일 적용
    if (item.valid_yn === 'Y') {
      row.classList.add('valid-alarm-row');
      // 해당 분야의 유효 경보 카운트 증가
      if (FIELDS.includes(item.sector)) {
        validCounts[item.sector] += 1;
      }
    }

    // 테이블 셀 생성 및 추가
    const cells = [
      { value: item.guksa_id || '-', className: 'col-guksa' },
      { value: item.sector || '-', className: 'col-sector' },
      { value: item.valid_yn === 'Y' ? '유효' : '무효', className: 'col-valid' },
      { value: formatDateTime(item.occur_datetime), className: 'col-occur-time' },
      { value: item.equip_id || '', className: 'col-equip-id' },
      { value: item.equip_type || '-', className: 'col-equip-type' },
      { value: item.equip_name || '-', className: 'col-equip-name' },
      { value: item.alarm_message || '-', className: 'col-alarm-message' },
    ];

    cells.forEach((cell) => {
      const td = document.createElement('td');
      td.className = cell.className;
      td.textContent = cell.value;
      row.appendChild(td);
    });

    // 행을 테이블에 추가
    tBody.appendChild(row);
  });

  // 대시보드 박스 업데이트 (유효 경보 강조)
  FIELDS.forEach((field) => {
    if (validCounts[field] > 0) {
      const box = document.querySelector(`.dashboard-box[data-sector="${field}"]`);
      if (box) {
        box.classList.add('has-valid-alarms');
      }
    }
  });
}

// 날짜 시간 형식 포맷팅
function formatDateTime(datetimeStr) {
  if (!datetimeStr) return '-';
  return datetimeStr.replace('T', ' ').substring(0, 19);
}

/**
 * 대시보드 업데이트 함수
 */
function updateDashboard() {
  // station-only 요약 데이터로 집계
  const summary = {};
  FIELDS.forEach((field) => {
    summary[field] = [];
  });

  console.log(
    '대시보드 업데이트 시작, 요약 데이터 개수:',
    summaryAlarmData ? summaryAlarmData.length : 0
  );

  // 분야별로 데이터 분류 (station-only)
  if (summaryAlarmData && summaryAlarmData.length > 0) {
    summaryAlarmData.forEach((item) => {
      // 필드가 존재하고 fields 배열에 있는지 확인
      if (item.sector && FIELDS.includes(item.sector)) {
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
  FIELDS.forEach((field) => {
    const items = summary[field] || [];
    const validAlarms = items.filter((d) => d.valid_yn === 'Y').length;
    const uniqueEquipmentCount = new Set(items.map((d) => d.equip_name)).size;

    totalEquipmentCount += uniqueEquipmentCount;
    totalAlarmCount += items.length;
    totalValidCount += validAlarms;
  });

  // 전체 현황 업데이트 - 천 단위 콤마 포맷팅 추가
  updateSummaryDisplay(totalEquipmentCount, totalAlarmCount, totalValidCount);

  // 각 분야별 대시보드 업데이트
  updateFieldDashboards(summary);
}

// 전체 요약 표시 업데이트
function updateSummaryDisplay(equipmentCount, alarmCount, validCount) {
  const elements = {
    equipmentCount: document.getElementById('total-equipment-count'),
    alarmCount: document.getElementById('total-alarm-count'),
    validCount: document.getElementById('total-valid-count'),
  };

  if (elements.equipmentCount) {
    elements.equipmentCount.textContent = `경보 장비(${formatNumberWithCommas(equipmentCount)}대),`;
  }

  if (elements.alarmCount) {
    elements.alarmCount.textContent = `전체 경보(${formatNumberWithCommas(alarmCount)}건),`;
  }

  if (elements.validCount) {
    elements.validCount.textContent = `유효 경보(${formatNumberWithCommas(validCount)}개)`;
  }
}

// 분야별 대시보드 업데이트
function updateFieldDashboards(summary) {
  FIELDS.forEach((field) => {
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
    validCountSpan.classed('highlight-valid', validAlarms > 0);
  });
}

/**
 * 맵 관련 함수들
 */

// 장비 정보 조회 및 맵 표시
async function fetchEquipmentByGuksaId(guksaId) {
  if (!guksaId) {
    console.error('국사 ID가 제공되지 않았습니다.');
    return;
  }

  try {
    // 맵 컨테이너에 로딩 표시
    showMapLoadingMessage('데이터를 불러오는 중...');

    console.log(`/api/get_equiplist API 호출: ${guksaId}`);

    // API 호출
    const response = await fetch('/api/get_equiplist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guksa_id: guksaId }),
    });

    if (!response.ok) {
      throw new Error(`서버 오류 (${response.status})`);
    }

    const responseText = await response.text();
    if (!responseText || responseText.trim() === '') {
      throw new Error('서버에서 빈 응답이 반환되었습니다.');
    }

    // JSON 파싱
    const equipmentData = JSON.parse(responseText);
    console.log('파싱된 장비 데이터:', equipmentData);

    // 데이터 형식 변환
    const formattedData = formatEquipmentData(equipmentData, guksaId);

    // 장비 목록이 비어있는지 확인
    if (formattedData.equip_list.length === 0) {
      showMapErrorMessage('표시할 장비 데이터가 없습니다.');
      return;
    }

    // 네트워크 맵 생성
    createNetworkMapIfAvailable(formattedData);
  } catch (error) {
    console.error('장비 정보 조회 중 오류 발생:', error);
    showMapErrorMessage(
      `장비 정보를 불러오는 중 오류가 발생했습니다.<br>상세 오류: ${error.message}`
    );
  }
}

// 장비 네트워크 정보 조회 및 맵 표시
async function fetchEquipmentNetworkByGuksaId(guksaId, equipId) {
  console.log(`fetchEquipmentNetworkByGuksaId 실행: guksaId=${guksaId}, equipId=${equipId}`);

  // 국사 ID 또는 장비 ID 중 하나는 필요함
  if (!guksaId && !equipId) {
    console.error('국사 ID와 장비 ID가 모두 제공되지 않았습니다.');
    showMapErrorMessage('국사 또는 장비 정보가 필요합니다.');
    return;
  }

  try {
    // 맵 컨테이너에 로딩 표시
    showMapLoadingMessage('장비 연결 데이터를 불러오는 중...');

    console.log(
      `/api/alarm_dashboard_equip API 호출 준비: 국사=${guksaId || '없음'}, 장비=${
        equipId || '없음'
      }`
    );

    // 현재 선택된 장비명 가져오기
    const selectedEquipName = DOM.searchEquipName().value;
    console.log(`선택된 장비명: ${selectedEquipName}`);

    // API 요청 데이터
    const requestData = {
      guksa_id: guksaId || '', // 빈 문자열로 전달하여 API에서 equipId로 조회하도록 함
      sectors: ['all'], // 모든 분야를 포함하도록 설정
      equip_name: selectedEquipName,
      equip_id: equipId || '',
    };

    console.log('API 요청 데이터:', requestData);

    // API 호출
    const response = await fetch('/api/alarm_dashboard_equip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData),
    });

    console.log(`API 응답 상태: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      throw new Error(`서버 오류 (${response.status})`);
    }

    const responseText = await response.text();
    console.log('API 응답 텍스트 길이:', responseText.length);

    if (!responseText || responseText.trim() === '') {
      throw new Error('서버에서 빈 응답이 반환되었습니다.');
    }

    // JSON 파싱
    const equipmentData = JSON.parse(responseText);
    console.log('파싱된 장비 네트워크 데이터:', equipmentData);

    // 데이터 형식 변환
    const formattedData = formatEquipmentNetworkData(equipmentData);
    console.log('포맷팅된 데이터:', formattedData);

    // 장비 목록이 비어있는지 확인
    if (formattedData.equipment_list.length === 0) {
      console.warn('표시할 장비 데이터가 없습니다.');
      showMapErrorMessage('표시할 장비 데이터가 없습니다.');
      return;
    }

    // 장비 네트워크 맵 생성
    console.log('createEquipmentNetworkMapIfAvailable 함수 호출 직전');
    createEquipmentNetworkMapIfAvailable(formattedData);
  } catch (error) {
    console.error('장비 네트워크 정보 조회 중 오류 발생:', error);
    showMapErrorMessage(
      `장비 네트워크 정보를 불러오는 중 오류가 발생했습니다.<br>상세 오류: ${error.message}`
    );
  }
}

// 맵 로딩 메시지 표시
function showMapLoadingMessage(message) {
  const mapContainer = DOM.mapContainer();
  if (mapContainer) {
    mapContainer.innerHTML = `<div class="loading-indicator">${message}</div>`;
  }
}

// 맵 에러 메시지 표시
function showMapErrorMessage(message) {
  const mapContainer = DOM.mapContainer();
  if (mapContainer) {
    mapContainer.innerHTML = `<div class="error-message">${message}</div>`;
  }
}

// 장비 데이터 형식 변환
function formatEquipmentData(equipmentData, guksaId) {
  // 기본 형식 정의
  let formattedData = {
    equip_list: [],
    guksa_name: equipmentData.guksa_name || '알 수 없음',
    guksa_id: equipmentData.guksa_id || guksaId,
  };

  // 데이터 구조 확인 및 변환
  if (equipmentData.equip_list && Array.isArray(equipmentData.equip_list)) {
    // 이미 올바른 형식
    formattedData.equip_list = equipmentData.equip_list;
  } else if (equipmentData.equipment_list && Array.isArray(equipmentData.equipment_list)) {
    // equipment_list 형식을 equip_list로 변환
    formattedData.equip_list = equipmentData.equipment_list;
  } else if (Array.isArray(equipmentData)) {
    // 배열이 직접 전달된 경우
    formattedData.equip_list = equipmentData;
  } else {
    // 기타 형식 - 필드명이 다를 수 있음을 고려
    const possibleListFields = ['equip_list', 'equipment_list', 'nodes', 'equipments'];
    for (const field of possibleListFields) {
      if (equipmentData[field] && Array.isArray(equipmentData[field])) {
        formattedData.equip_list = equipmentData[field];
        break;
      }
    }
  }

  return formattedData;
}

// 장비 네트워크 데이터 형식 변환
function formatEquipmentNetworkData(equipmentData) {
  // 기본 형식 정의
  let formattedData = {
    equipment_list: [],
    links: [],
  };

  // 데이터 구조 확인 및 변환
  if (equipmentData.equipment_list && Array.isArray(equipmentData.equipment_list)) {
    // 이미 올바른 형식
    formattedData = equipmentData;
  } else if (equipmentData.equip_list && Array.isArray(equipmentData.equip_list)) {
    // equip_list 형식을 equipment_list로 변환
    formattedData = {
      equipment_list: equipmentData.equip_list,
      links: equipmentData.links || [],
    };
  } else if (Array.isArray(equipmentData)) {
    // 배열이 직접 전달된 경우
    formattedData.equipment_list = equipmentData;
  } else {
    // 기타 형식 - 필드명이 다를 수 있음을 고려
    const possibleListFields = ['equipment_list', 'equip_list', 'nodes', 'equipments'];
    for (const field of possibleListFields) {
      if (equipmentData[field] && Array.isArray(equipmentData[field])) {
        formattedData.equipment_list = equipmentData[field];
        break;
      }
    }

    const possibleLinkFields = ['links', 'edges', 'connections'];
    for (const field of possibleLinkFields) {
      if (equipmentData[field] && Array.isArray(equipmentData[field])) {
        formattedData.links = equipmentData[field];
        break;
      }
    }
  }

  return formattedData;
}

// 네트워크 맵 생성 (외부 라이브러리 함수가 있는지 확인)
function createNetworkMapIfAvailable(formattedData) {
  if (typeof createNetworkMap === 'function') {
    createNetworkMap(formattedData);
  } else {
    console.error('createNetworkMap 함수를 찾을 수 없습니다.');
    showMapErrorMessage('네트워크 맵을 표시할 수 없습니다. 브라우저 콘솔을 확인하세요.');
  }
}

// 장비 네트워크 맵 생성 (외부 라이브러리 함수가 있는지 확인)
function createEquipmentNetworkMapIfAvailable(formattedData) {
  console.log('createEquipmentNetworkMapIfAvailable 함수 실행', formattedData);

  if (typeof createEquipmentNetworkMap === 'function') {
    console.log('createEquipmentNetworkMap 함수 호출');
    createEquipmentNetworkMap(formattedData);
  } else {
    console.error(
      'createEquipmentNetworkMap 함수를 찾을 수 없습니다. fault_dashboard_equip.js가 로드되지 않았습니다.'
    );
    showMapErrorMessage('장비 네트워크 맵을 표시할 수 없습니다. 브라우저 콘솔을 확인하세요.');
  }
}

/**
 * 국사 목록 및 기타 이벤트 처리
 */

// 국사 선택 변경 시 장비 목록과 경보 데이터를 갱신하는 함수
function updateSectorOptions() {
  const guksaId = DOM.searchGuksa().value;
  const networkTypeRadio = document.querySelector('input[name="networkType"]:checked');
  const sector = networkTypeRadio ? networkTypeRadio.value : '';

  // 장비 목록 갱신
  updateEquipmentListBySector(sector);

  // 경보 데이터 갱신
  searchAlarms();
}

// 국사 목록 로드 함수
async function loadGuksaList() {
  try {
    const response = await fetch('/api/guksa_list');
    if (!response.ok) {
      throw new Error('서버 응답 오류: ' + response.status);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error('형식 오류: 배열이 아님');
    }

    // 국사 선택 드롭다운 업데이트
    const select = DOM.searchGuksa();
    if (!select) return;

    data.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.guksa_id;

      // 자국 표시가 있는 경우 추가
      let text = item.guksa_name;
      if (item.guksa_type === '자국') {
        text += ' (자국)';
      }

      option.textContent = text;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('국사 목록 로드 실패:', error);
  }
}

// 대시보드 외곽 클릭 이벤트 처리 - 선택 해제
function initializeDashboardOuterClickEvent() {
  const topDashboard = document.querySelector('.top-dashboard');
  if (!topDashboard) return;

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

// 장비 선택 변경 이벤트 초기화
function initializeEquipmentSelectEvent() {
  const equipSelect = DOM.searchEquipName();
  if (!equipSelect) {
    console.error('장비 선택 요소를 찾을 수 없습니다.');
    return;
  }

  console.log('장비 선택 이벤트 리스너 추가');

  equipSelect.addEventListener('change', function (event) {
    console.log('장비 선택 change 이벤트 발생!');

    // 선택된 장비의 정보 가져오기
    const selectedIndex = event.target.selectedIndex;
    console.log(`선택된 인덱스: ${selectedIndex}`);

    if (selectedIndex < 0) {
      console.warn('유효한 인덱스가 선택되지 않았습니다.');
      return;
    }

    const selectedOption = this.options[selectedIndex];
    const equipName = this.value;

    console.log(`선택된 옵션:`, selectedOption);
    console.log(`선택된 장비명: ${equipName}`);

    if (!equipName) {
      console.warn('장비명이 선택되지 않았습니다.');
      return;
    }

    // 장비 ID 가져오기 (dataset에서)
    let equipId = '';
    if (selectedOption && selectedOption.dataset.equipId) {
      equipId = selectedOption.dataset.equipId;
    }

    if (!equipId) {
      console.warn('장비 ID가 없습니다. 장비를 다시 선택해주세요.');
      return;
    }

    console.log(`선택된 장비: ${equipName}, ID: ${equipId}`);

    // 뷰를 장비 기준으로 변경
    currentView = 'equipment';
    console.log(`뷰 변경: ${currentView}`);

    // 장비 기준 버튼 활성화
    const equipBtn = document.getElementById('equipment-view-btn');
    const guksaBtn = document.getElementById('guksa-view-btn');
    if (equipBtn && guksaBtn) {
      equipBtn.classList.add('active');
      guksaBtn.classList.remove('active');
      console.log('장비 기준 버튼 활성화');
    } else {
      console.warn('장비/국사 기준 버튼을 찾을 수 없습니다.');
    }

    // 국사 ID (선택적)
    const stationId = DOM.searchGuksa().value || '';
    console.log(`국사 ID: ${stationId || '지정되지 않음(장비 ID로 조회)'}`);

    // API 호출하여 맵 그리기 - 장비 ID가 있으면 국사 ID가 없어도 API에서 처리 가능
    console.log('fetchEquipmentNetworkByGuksaId 함수 호출 직전');
    fetchEquipmentNetworkByGuksaId(stationId, equipId);
  });
}

/**
 * 검색 관련 유틸리티 함수들
 */

// 선택된 분야 목록 가져오기
function getSelectedSectors() {
  const selectedSectors = Array.from(document.querySelectorAll('.sector-checkbox:checked')).map(
    (cb) => cb.value
  );

  console.log(`선택된 분야: ${selectedSectors.join(', ')} (총 ${selectedSectors.length}개)`);
  return selectedSectors;
}

// 장비명 목록 업데이트 함수
function updateEquipmentList() {
  const selectedSectors = getSelectedSectors();
  const equipNameSelect = DOM.searchEquipName();

  if (!equipNameSelect) return;

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

/**
 * 메인 초기화 및 DOM 준비 이벤트
 */
// 좌측 사이드바 Resize
function initializeSidebarResize() {
  const dragHandle = DOM.dragHandle();
  const leftSidebar = DOM.leftSidebar();
  const toggleBtn = DOM.toggleBtn();

  if (!leftSidebar || !toggleBtn) {
    console.error('사이드바 또는 토글 버튼 요소를 찾을 수 없습니다.');
    return;
  }

  let isResizing = false;
  let originalWidth = leftSidebar.offsetWidth || 280; // 초기 너비 저장
  let originalPadding = window.getComputedStyle(leftSidebar).getPropertyValue('padding-left'); // 초기 패딩 저장

  // 드래그 핸들 이벤트 리스너
  if (dragHandle) {
    dragHandle.addEventListener('mousedown', function (e) {
      isResizing = true;
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', stopResize);
      e.preventDefault();
      e.stopPropagation();
    });
  } else {
    console.error('드래그 핸들 요소를 찾을 수 없습니다.');
  }

  // 토글 버튼 클릭 이벤트
  toggleBtn.addEventListener('click', function () {
    const isHidden = leftSidebar.style.width === '0px';

    if (isHidden) {
      leftSidebar.style.width = originalWidth + 'px';
      leftSidebar.style.paddingLeft = originalPadding;
      toggleBtn.innerHTML = '◀';
    } else {
      if (leftSidebar.offsetWidth > 0) {
        originalWidth = leftSidebar.offsetWidth;
        originalPadding = window.getComputedStyle(leftSidebar).getPropertyValue('padding-left');
      }
      leftSidebar.style.width = '0px';
      leftSidebar.style.paddingLeft = '0px';
      toggleBtn.innerHTML = '▶';
    }
  });

  // 마우스 이동 핸들러
  function handleMouseMove(e) {
    if (!isResizing) return;

    const newWidth = e.clientX;
    if (newWidth >= 180 && newWidth < 400) {
      leftSidebar.style.width = newWidth + 'px';
      originalWidth = newWidth;
    }
  }

  // 리사이징 종료 핸들러
  function stopResize() {
    if (isResizing) {
      isResizing = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', stopResize);
    }
  }

  // 마우스가 창을 벗어나면 리사이징 중지
  document.addEventListener('mouseleave', stopResize);
}

// 초기화 함수
function initialize() {
  initializeDashboard();
  initializeDragAndDrop();
  setupTableHeaderSort();
  setupTableRowClick();
  setupViewToggleButtons();
  initializeNetworkTypeEvents();
  initializeDashboardOuterClickEvent();
  initializeEquipmentSelectEvent();

  // 추가: 장비 선택 박스에 직접 click 이벤트도 바인딩 (dblclick 이벤트도 추가)
  const equipSelect = DOM.searchEquipName();
  if (equipSelect) {
    console.log('장비 선택 박스에 추가 이벤트 바인딩');

    // 더블 클릭 이벤트 추가
    equipSelect.addEventListener('dblclick', function (event) {
      console.log('장비 선택 dblclick 이벤트 발생!');
      const selectedEquipName = this.value;

      if (selectedEquipName) {
        console.log(`더블클릭으로 선택된 장비: ${selectedEquipName}`);

        // 현재 선택된 옵션에서 장비 ID 가져오기
        const selectedOption = this.options[this.selectedIndex];
        let equipId = '';
        if (selectedOption && selectedOption.dataset.equipId) {
          equipId = selectedOption.dataset.equipId;
        }

        // 뷰를 장비 기준으로 변경
        currentView = 'equipment';

        // 장비 기준 버튼 활성화
        const equipBtn = document.getElementById('equipment-view-btn');
        const guksaBtn = document.getElementById('guksa-view-btn');

        if (equipBtn && guksaBtn) {
          equipBtn.classList.add('active');
          guksaBtn.classList.remove('active');
        }

        // 장비 맵 표시
        const stationId = DOM.searchGuksa().value;
        fetchEquipmentNetworkByGuksaId(stationId, equipId);
      }
    });
  }

  // 기본값으로 장비 목록 초기화
  updateEquipmentListBySector('IP');

  // 기본 검색 수행
  searchAlarms();
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
  // 대시보드 클래스 강제 적용
  setupDashboardLayout();

  // 맵 컨테이너 초기화
  initializeMapContainer();

  // 사이드바 초기 상태 설정
  setupInitialSidebarState();

  // 사이드바 리사이즈 초기화
  initializeSidebarResize();

  // 국사 목록 로드
  loadGuksaList();

  // 모든 초기화 함수 호출
  initialize();
});

// 대시보드 레이아웃 설정
function setupDashboardLayout() {
  const dashboardEl = document.getElementById('dashboard');
  if (dashboardEl) {
    dashboardEl.style.display = 'flex';
    dashboardEl.style.flexDirection = 'row';
    dashboardEl.style.flexWrap = 'nowrap';
    dashboardEl.style.width = '100%';
    dashboardEl.style.overflowX = 'auto';
  }
}

// 맵 컨테이너 초기화
function initializeMapContainer() {
  const mapContainer = DOM.mapContainer();
  if (mapContainer) {
    mapContainer.style.display = 'block';
    mapContainer.innerHTML =
      '<div class="instruction-message" style="color: #666; text-align: center; margin-top: 20px; font-style: italic;">' +
      '아래 경보내역 테이블 클릭 시 해당 장비와 연결된 장비들이 표시됩니다.<br></div>';
  }
}

// 사이드바 초기 상태 설정
function setupInitialSidebarState() {
  const leftSidebar = DOM.leftSidebar();
  const toggleBtn = DOM.toggleBtn();

  if (leftSidebar && toggleBtn) {
    // 초기 버튼 상태 설정
    toggleBtn.innerHTML = '◀';

    // 초기 너비가 설정되어 있지 않으면 기본값 설정
    if (!leftSidebar.style.width) {
      leftSidebar.style.width = '280px';
    }
  }
}

// 모듈 내보내기 (필요한 경우)
// 이 모듈을 다른 모듈에서 사용하려면 다음과 같이 내보낼 수 있습니다
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initialize,
    searchAlarms,
    updateEquipmentListBySector,
    updateDashboard,
    currentView,
  };
}
