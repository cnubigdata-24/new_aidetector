// 🚩 🔴 🟡 🟢 🔵 ✅ ⚡ 🔥 💡 ✨ 🎯 📊 ❌ ⏱️ 🧭 🗺️ 🔄 ⏳ 📌 🗂️ 🔍 💬 🗨️ ▶️ ⏹️

// 테이블 관련 상수
const ALARM_TABLE_PAGE_SIZE = 5;
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

// 분야 관련 상수
const SECTORS = ['MW', '선로', '전송', 'IP', '무선', '교환'];

// 노드 관련 상수
const NODE_WIDTH = 250;
const NODE_WIDTH_HALF = NODE_WIDTH / 2;
const NODE_HEIGHT = 50;
const NODE_CORNER_RADIUS = 10;
const NODE_STROKE_WIDTH = 2;
const NODE_HOVER_STROKE_WIDTH = 4;
const MAX_NODE_NAME_LENGTH = 20;

// 링크 관련 상수
const LINK_STROKE_WIDTH = 3;
const LINK_HOVER_STROKE_WIDTH = 10;
const LINK_OPACITY = 0.7;
const LINK_HOVER_OPACITY = 1;

// 맵 관련 상수 (장비 연결 기준)
const EQUIP_MAP_CONFIG = {
  MAP_HEIGHT: 500,
  MAP_PADDING: 50,
  MAP_MARGIN_TOP: -50,
  HORIZONTAL_SPACING: 400,
  VERTICAL_SPACING: 70,
  ZOOM_MIN_SCALE: 0.3, // 0.8 → 0.3으로 감소하여 더 많이 축소 가능
  ZOOM_MAX_SCALE: 3.0,
};

// 툴크 관련 상수
const TOOLTIP_DURATION = 200;
const TOOLTIP_AUTO_HIDE_DELAY = 10000; // 10초
const MAX_TOOLTIP_ALARMS = 5;

// 근본 원인 노드 관련 상수 - 여기에 추가
const ROOT_CAUSE_HIGHLIGHT_COLOR = '#FF5533'; // 밝은 적색 (근본원인 강조색)
const ROOT_CAUSE_STROKE_WIDTH = 3; // 테두리 두께
const ROOT_CAUSE_ANIMATION_DURATION = 1000; // 애니메이션 지속 시간

const nodeZoom = d3
  .zoom()
  .scaleExtent([1, 1.05])
  .on('zoom', function (event) {
    d3.select(this).attr('transform', event.transform);
  });

// 분야별 색상
const FIELD_COLORS = {
  MW: '#ff8c00', // 주황색
  IP: '#2ca02c', // 녹색
  교환: '#279fd6', // 하늘색
  전송: '#9467bd', // 보라색
  선로: '#8c564b', // 갈색
  무선: '#51f13c', // 파란색
  기타: '#999999', // 회색 (기타/미분류)
};

// 기본 색상 상수
const DEFAULT_COLOR = '#999'; // 기본 회색
const LINK_COLOR = '#FF0000'; // 링크 기본 색상
const LINK_HOVER_COLOR = '#FF3333'; // 링크 호버 색상
const LINK_MULTI_BASE_COLOR = 200; // 다중 링크 기본 색상 R값
const LINK_MULTI_VARIATION = 25; // 링크마다 색상 변화 값
const FIRST_CENTRAL_NODE_BORDER_COLOR = '#000000';

const DEFAULT_MAP_STYLES = `
  /* 동적 스타일만 유지 */
  .equip-node rect {
    width: ${NODE_WIDTH}px;
    height: ${NODE_HEIGHT}px;
    rx: ${NODE_CORNER_RADIUS};
    ry: ${NODE_CORNER_RADIUS};
    stroke-width: ${NODE_STROKE_WIDTH};
  }

  .equip-link {
    stroke-width: ${LINK_STROKE_WIDTH};
    stroke-opacity: ${LINK_OPACITY};
  }

  .equip-link:hover {
    stroke-width: ${LINK_HOVER_STROKE_WIDTH};
    stroke-opacity: ${LINK_HOVER_OPACITY};
  }

  /* 분야별 노드 색상 */
  .node-MW rect {
    fill: ${FIELD_COLORS.MW};
  }

  .node-IP rect {
    fill: ${FIELD_COLORS.IP};
  }

  .node-교환 rect {
    fill: ${FIELD_COLORS.교환};
  }

  .node-전송 rect {
    fill: ${FIELD_COLORS.전송};
  }

  .node-선로 rect {
    fill: ${FIELD_COLORS.선로};
  }

  .node-무선 rect {
    fill: ${FIELD_COLORS.무선};
  }

  .node-기타 rect {
    fill: ${FIELD_COLORS.기타};
  }
  
`;

// HTML 특수문자 이스케이프 함수
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 드래그 요소 위치 계산
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

// 숫자에 천 단위 콤마를 추가
function formatNumber(num) {
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

// 날짜 시간 형식 포맷팅
function formatDateTime(datetimeStr) {
  if (!datetimeStr) return '-';
  return datetimeStr.replace('T', ' ').substring(0, 19);
}

// 시간 포맷팅 함수 (맵의 툴팁에 경보발생시간 추가)
function formatDateTimeForToolTip(dateTimeStr) {
  if (!dateTimeStr) return '-';

  try {
    const date = new Date(dateTimeStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day} ${hour}:${minute}`;
  } catch (e) {
    return dateTimeStr; // 변환 실패 시 원본 문자열 반환
  }
}
// 일반 에러 메시지 표시
function showErrorMessage(message) {
  alert(message);
}

// 테이블 에러 메시지 표시
function showTableErrorMessage(message) {
  const tbody = document.getElementById('alarmTableBody');
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

// API 호출 공통 함수
async function callApi(endpoint, params = {}) {
  console.log(`API 호출: ${endpoint}`, params);

  try {
    // 네트워크 타임아웃 설정
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30초 타임아웃

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    clearTimeout(timeoutId); // 타임아웃 해제

    if (!response.ok) {
      throw new Error(`서버 오류 (${response.status})`);
    }

    const responseText = await response.text();

    if (!responseText || responseText.trim() === '') {
      console.warn('빈 API 응답');
      return null;
    }

    try {
      const jsonData = JSON.parse(responseText);
      return jsonData || null;
    } catch (parseError) {
      console.error('JSON 파싱 오류:', parseError);
      console.error('원본 응답 일부:', responseText.substring(0, 100) + '...');
      // JSON 파싱 오류시 빈 배열 반환하여 다음 단계 처리 가능하게 함
      return { alarms: [] };
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`API 호출 타임아웃: ${endpoint}`);
    } else {
      console.error(`API 호출 실패: ${endpoint}`, error);
    }
    return { alarms: [] }; // 오류 발생 시 빈 배열 반환
  }
}

// 페이지네이션 렌더링
function renderPagination(totalItems) {
  const totalPages = Math.ceil(totalItems / ALARM_TABLE_PAGE_SIZE);

  // 페이지네이션 높이에 따라 테이블 컨테이너 조정
  adjustTableHeight(totalPages);

  DOM.pagination().pagination({
    items: totalItems,
    itemsOnPage: ALARM_TABLE_PAGE_SIZE,
    currentPage: _currentPage,
    displayedPages: 10,
    edges: 4,
    prevText: 'Prev',
    nextText: 'Next',
    onPageClick: function (pageNumber) {
      _currentPage = pageNumber;
      updateCurrentPageData(); // 정렬 상태가 유지된 데이터로 페이지 갱신
    },
  });

  // 페이지네이션 초기화 후 강제로 커스텀 스타일 적용 - 여러 번 시도
  setTimeout(() => {
    forcePaginationStyles();
  }, 100);

  setTimeout(() => {
    forcePaginationStyles();
  }, 300);

  setTimeout(() => {
    forcePaginationStyles();
  }, 500);
}

// 페이지네이션 스타일 강제 적용 함수
function forcePaginationStyles() {
  const paginationContainer = document.getElementById('pagination');
  if (!paginationContainer) {
    console.warn('페이지네이션 컨테이너를 찾을 수 없습니다.');
    return;
  }

  // 컨테이너 스타일 강제 적용 - cssText로 모든 스타일 덮어쓰기
  paginationContainer.style.cssText = `
    height: 32px !important;
    line-height: 32px !important;
    min-height: 32px !important;
    max-height: 32px !important;
    margin: 0 !important;
    padding: 5px 0 !important;
    text-align: center !important;
    font-size: 12px !important;
    border-top: 1px solid #dee2e6 !important;
    border-left: none !important;
    border-right: none !important;
    border-bottom: none !important;
    background-color: #ffffff !important;
    background-image: none !important;
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
    flex-shrink: 0 !important;
    width: 100% !important;
    z-index: 5 !important;
    overflow: hidden !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    visibility: visible !important;
  `;

  // simplePagination 요소들 강제 스타일 적용
  const simplePagination = paginationContainer.querySelector('.simple-pagination');
  if (simplePagination) {
    simplePagination.style.cssText = `
      display: flex !important;
      justify-content: center !important;
      align-items: center !important;
      width: 100% !important;
      height: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      background: transparent !important;
      background-image: none !important;
      border: none !important;
      list-style: none !important;
      visibility: visible !important;
    `;

    const ul = simplePagination.querySelector('ul');
    if (ul) {
      ul.style.cssText = `
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
        gap: 3px !important;
        margin: 0 !important;
        padding: 0 !important;
        list-style: none !important;
        background: transparent !important;
        background-image: none !important;
        border: none !important;
        flex-wrap: nowrap !important;
        visibility: visible !important;
        float: none !important;
      `;

      // 모든 li 요소에 강제 스타일 적용
      const listItems = ul.querySelectorAll('li');
      listItems.forEach((li) => {
        li.style.cssText = `
          display: inline-flex !important;
          margin: 0 !important;
          padding: 0 !important;
          list-style: none !important;
          background: transparent !important;
          background-image: none !important;
          border: none !important;
          float: none !important;
          visibility: visible !important;
        `;

        // a, span 요소에 강제 스타일 적용
        const links = li.querySelectorAll('a, span');
        links.forEach((link) => {
          // 상태별 스타일 결정
          const isCurrentPage = li.classList.contains('current');
          const isDisabled = li.classList.contains('disabled');

          let backgroundColor = '#ffffff';
          let borderColor = '#e0e0e0';
          let color = '#333333';
          let fontWeight = 'normal';
          let cursor = 'pointer';

          if (isCurrentPage) {
            backgroundColor = '#6c757d';
            borderColor = '#6c757d';
            color = 'white';
            fontWeight = '700';
          } else if (isDisabled) {
            backgroundColor = '#f8f9fa';
            borderColor = '#e0e0e0';
            color = '#999999';
            cursor = 'not-allowed';
          }

          link.style.cssText = `
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            min-width: 24px !important;
            width: auto !important;
            height: 22px !important;
            padding: 1px 4px !important;
            margin: 0 !important;
            font-size: 13px !important;
            font-weight: ${fontWeight} !important;
            text-decoration: none !important;
            border: 1px solid ${borderColor} !important;
            border-radius: 2px !important;
            background-color: ${backgroundColor} !important;
            background-image: none !important;
            color: ${color} !important;
            cursor: ${cursor} !important;
            box-shadow: none !important;
            text-shadow: none !important;
            line-height: 20px !important;
            vertical-align: middle !important;
            float: none !important;
            visibility: visible !important;
            position: static !important;
          `;

          // 호버 이벤트 추가 (비활성화되지 않은 일반 버튼만)
          if (!isDisabled && !isCurrentPage) {
            // 기존 이벤트 리스너 제거
            link.onmouseenter = null;
            link.onmouseleave = null;

            link.addEventListener('mouseenter', function () {
              this.style.backgroundColor = '#f5f5f5';
              this.style.borderColor = '#cccccc';
              this.style.color = '#333333';
            });

            link.addEventListener('mouseleave', function () {
              this.style.backgroundColor = '#ffffff';
              this.style.borderColor = '#e0e0e0';
              this.style.color = '#333333';
            });
          }
        });
      });
    }
  }

  console.log('페이지네이션 스타일 강제 적용 완료');
}

// 페이지네이션 표시 시 테이블 높이 자동 조정
function adjustTableHeight(totalPages) {
  const tableContainer = document.querySelector('.table-container');
  if (!tableContainer) return;

  if (totalPages > 1) {
    // 페이지네이션이 필요한 경우, 테이블 컨테이너 높이 조정
    tableContainer.style.height = 'calc(100% - 50px)';
  } else {
    // 페이지네이션이 필요 없는 경우
    tableContainer.style.height = '100%';
  }
}

// 검색 상태 초기화
function resetSearchState() {
  document.querySelectorAll('.alarm-table th').forEach((th) => {
    th.classList.remove('sort-asc', 'sort-desc');
  });
}

// 대시보드 레이아웃 설정
function setDashboardLayout() {
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
function clearMapContainer() {
  const mapContainer = document.getElementById('map-container');
  if (mapContainer) {
    mapContainer.style.display = 'block';
    // 내용은 비워두고 showDashboard 함수에서 채우도록 함
    mapContainer.innerHTML = '';
  }
}

// 맵 로딩 메시지 표시
function showMapLoadingMessage(message) {
  const mapContainer = DOM.mapContainer();
  if (mapContainer) {
    mapContainer.innerHTML = `<div class="loading-indicator">⏳ ${message}</div>`;
  }
}

// 맵 에러 메시지 표시
function showMapErrorMessage(message) {
  const mapContainer = DOM.mapContainer();
  if (mapContainer) {
    mapContainer.innerHTML = `<div class="error-message">❌ ${message}</div>`;
  }
}

// 좌측 사이드바 초기 상태 설정
function setSidebarState() {
  const leftSidebar = document.querySelector('.left-sidebar');
  const toggleBtn = document.getElementById('toggle-btn');

  if (leftSidebar && toggleBtn) {
    // 초기 클래스 설정
    toggleBtn.innerHTML = '◀';
  }
}
// 좌측 사이드바 Resizing
function initSidebarResize() {
  const dragHandle = document.getElementById('drag-handle');
  const leftSidebar = document.querySelector('.left-sidebar');
  const toggleBtn = document.getElementById('toggle-btn');

  let isResizing = false;
  let originalWidth = leftSidebar.offsetWidth; // 초기 너비 저장
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

  // 좌우 수직바 ◀ 토글박스 클릭 이벤트
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
    if (newWidth >= 0 && newWidth < 900) {
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

// Sector 분야별 대시보드 드래그 앤 드롭 기능
function initDragAndDrop() {
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
// 최근 경보 발생 시간 업데이트
function updateRecentUpdateTime(recentTime) {
  const recentUpdateTimeEl = document.getElementById('recent-update-time');

  if (!recentUpdateTimeEl) return;

  if (recentTime) {
    recentUpdateTimeEl.textContent = `| 최근 경보  ${formatDateTime(recentTime)}`;
  } else {
    recentUpdateTimeEl.textContent = `| 최근 경보  `;
  }
}

// 경보 테이블 필터링
function updateFilteredAlarmTable() {
  console.log(`경보 테이블 필터링: ${_selectedSector}`);

  if (!_totalAlarmDataList?.length) {
    const msg = '경보 데이터가 없습니다. 실시간 경보 수집 버튼을 눌러 데이터를 가져오세요.';
    console.warn(msg);
    showTableErrorMessage(msg);

    return;
  }

  const selectedSector = _selectedSector.toLowerCase();
  const filteredData = _totalAlarmDataList.filter(
    (item) => item.sector?.toLowerCase() === selectedSector
  );

  if (!filteredData.length) {
    const msg = `"${_selectedSector}" 분야의 데이터가 없습니다.`;
    console.log(msg);
    showTableErrorMessage(msg);

    return;
  }
  console.log(`경보 테이블 필터링: (데이터 ${filteredData.length}개)`);

  if (!Array.isArray(filteredData) || filteredData.length === 0) {
    console.error('유효하지 않거나 비어 있는 데이터:', filterData);

    showTableErrorMessage('표시할 데이터가 없습니다.');
    DOM.pagination().empty();

    return;
  }

  const totalItems = filteredData.length;
  console.log(`페이지 렌더링 (총 "${totalItems}"개 항목)`);

  renderPagination(totalItems);
  updateCurrentPageData();

  console.log('경보 테이블 업데이트 완료');
}

// 경보 테이블의 페이지 데이터를 안전하게 처리하는 유틸리티 함수
function getPageDataSafely(dataArray, prefix = '') {
  // 데이터가 없는 경우 처리
  if (!dataArray || dataArray.length === 0) {
    console.log(`${prefix} 데이터가 없습니다.`);
    return { success: false, message: '표시할 데이터가 없습니다.' };
  }

  // _currentPage 유효성 검사
  const totalPages = Math.ceil(dataArray.length / ALARM_TABLE_PAGE_SIZE);
  if (_currentPage <= 0 || _currentPage > totalPages) {
    console.warn(`${prefix} 현재 페이지(${_currentPage})가 유효하지 않아 1페이지로 재설정합니다.`);
    _currentPage = 1;
  }

  // 경보 테이블 페이지 데이터 계산
  const start = (_currentPage - 1) * ALARM_TABLE_PAGE_SIZE;
  const end = start + ALARM_TABLE_PAGE_SIZE;

  // 시작 인덱스가 배열 범위를 벗어나는지 확인
  if (start >= dataArray.length) {
    console.warn(
      `${prefix} 시작 인덱스(${start})가 데이터 길이(${dataArray.length})를 초과합니다.`
    );
    _currentPage = 1;
    const pageData = dataArray.slice(0, ALARM_TABLE_PAGE_SIZE);
    console.log(
      `${prefix} 페이지 재설정: 시작=0, 끝=${ALARM_TABLE_PAGE_SIZE}, 데이터 길이=${pageData.length}`
    );

    if (pageData.length > 0) {
      return { success: true, data: pageData, isReset: true };
    } else {
      return { success: false, message: '현재 페이지에 표시할 데이터가 없습니다.', isReset: true };
    }
  }

  // 경보 테이블 정상적인 페이지 데이터 반환
  const pageData = dataArray.slice(start, end);
  console.log(`${prefix} 페이지 계산: 시작=${start}, 끝=${end}, 데이터 길이=${pageData.length}`);

  if (!pageData || pageData.length === 0) {
    console.log(`${prefix} 현재 페이지에 표시할 데이터가 없음`);
    return { success: false, message: '현재 페이지에 표시할 데이터가 없습니다.' };
  }

  return { success: true, data: pageData };
}

// 현재 경보 테이블 페이지에 맞춰 경보 테이블 표시
function updateCurrentPageData() {
  console.log('updateCurrentPageData 함수 실행');

  let filterData = [];

  console.log(`현재 페이지 데이터 표시 준비: 현재 분야=${_selectedSector || '모든 분야'}`);
  console.log(`전체 데이터 개수: ${_totalAlarmDataList.length}`);

  filterData = _totalAlarmDataList.filter(
    (d) => d && d.sector && d.sector.toLowerCase() === _selectedSector.toLowerCase()
  );

  console.log(
    `화면에 표시할 데이터: ${filterData.length}개 항목, 현재 분야: ${
      _selectedSector || '분야 없음'
    }`
  );

  // 여기도 데이터 길이 체크
  if (!filterData || filterData.length === 0) {
    showTableErrorMessage(
      _selectedSector
        ? `${_selectedSector} 분야의 표시할 데이터가 없습니다.`
        : '표시할 데이터가 없습니다.'
    );
    return;
  }

  // 페이지 데이터 안전하게 가져오기
  const result = getPageDataSafely(filterData, '페이지 데이터');

  if (result.success) {
    addRowsToAlarmTable(result.data);
  } else {
    showTableErrorMessage(
      _selectedSector ? `${_selectedSector} 분야의 ${result.message}` : result.message
    );
  }
}

// 좌측 사이드바 경보발생 장비 필터 설정
function initEquipmentFilter() {
  console.log('[EquipFilter] 장비 검색 필터 초기화');

  const filterInput = document.getElementById('equipFilterInput');
  const filterBtn = document.getElementById('equipFilterBtn');
  const resetBtn = document.getElementById('equipResetBtn');

  if (!filterInput || !filterBtn || !resetBtn) {
    console.error('[EquipFilter] 필터 요소를 찾을 수 없습니다.');
    return;
  }

  // Filter 버튼 클릭 이벤트
  filterBtn.addEventListener('click', applyEquipmentFilter);

  // Reset 버튼 클릭 이벤트
  resetBtn.addEventListener('click', resetEquipmentFilter);

  // 입력 필드에서 엔터키 이벤트
  filterInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyEquipmentFilter();
    }
  });

  console.log('[EquipFilter] 장비 검색 필터 초기화 완료');
}

/**
 * 좌측 사이드바 경보발생 장비 필터 적용
 */
function applyEquipmentFilter() {
  const filterInput = document.getElementById('equipFilterInput');
  const searchTerm = filterInput.value.toLowerCase().trim();

  console.log(`[EquipFilter] 필터 적용: "${searchTerm}"`);

  if (searchTerm === '') {
    // 검색어가 없으면 전체 표시
    resetEquipmentFilter();
    return;
  }

  // 장비명에서 검색어와 일치하는 항목 필터링
  _filteredEquipmentList = _allEquipmentList.filter((equip) => {
    const equipName = (equip.equip_name || '').toLowerCase();
    const equipId = (equip.equip_id || '').toLowerCase();

    // 장비명 또는 장비ID에서 검색
    return equipName.includes(searchTerm) || equipId.includes(searchTerm);
  });

  console.log(`[EquipFilter] 필터링 결과: ${_filteredEquipmentList.length}개 장비`);

  // select 박스 업데이트
  updateEquipmentSelectBox(_filteredEquipmentList);
}

/**
 * 좌측 사이드바 경보발생 장비 필터 초기화
 */
function resetEquipmentFilter() {
  const filterInput = document.getElementById('equipFilterInput');

  // 입력 필드 초기화
  if (filterInput) {
    filterInput.value = '';
  }

  console.log('[EquipFilter] 필터 초기화');

  // 전체 장비 목록으로 복원
  _filteredEquipmentList = [..._allEquipmentList];
  updateEquipmentSelectBox(_filteredEquipmentList);
}

/**
 * 장비 select 박스 업데이트
 * @param {Array} equipmentList - 표시할 장비 목록
 */
function updateEquipmentSelectBox(equipmentList) {
  const selectElement = document.getElementById('searchEquipName');

  // 기존 옵션 제거
  selectElement.innerHTML = '';

  // 필터링된 장비 목록 추가
  equipmentList.forEach((equip) => {
    const option = document.createElement('option');

    // 기존 방식과 동일하게 설정
    option.value = equip.equip_name;
    option.textContent = equip.equip_name;
    option.dataset.equipId = equip.equip_id;

    selectElement.appendChild(option);
  });

  console.log(`[EquipFilter] select 박스 업데이트 완료: ${equipmentList.length}개 장비`);
}

/**
 * 전체 장비 목록 저장 (기존 장비 로딩 함수에서 호출)
 * @param {Array} equipmentList - 전체 장비 목록
 */
function setAllEquipmentList(equipmentList) {
  _allEquipmentList = equipmentList || [];
  _filteredEquipmentList = [..._allEquipmentList];

  console.log(`[EquipFilter] 전체 장비 목록 설정: ${_allEquipmentList.length}개`);

  // select 박스 초기 설정
  updateEquipmentSelectBox(_filteredEquipmentList);
}

// DOM 로드 완료 후 초기화
document.addEventListener('DOMContentLoaded', function () {
  // 약간 지연시켜 다른 스크립트가 먼저 로드되도록
  setTimeout(() => {
    initEquipmentFilter();
  }, 1000);
});

function applyLinkVisualEffect(linkIds) {
  if (!linkIds || linkIds.length === 0) return;

  console.log('링크 애니메이션 적용 시작:', linkIds);

  // 링크에 강조 효과 적용
  d3.selectAll('.equip-link')
    .filter((d) => linkIds.includes(d.id))
    .each(function (d) {
      const linkElement = d3.select(this);

      // 링크 색상과 두께 변경
      linkElement
        .classed('root-cause-link', true)
        .attr('stroke', '#FF0000')
        .attr('stroke-width', LINK_STROKE_WIDTH * 1.5);

      // 점멸 애니메이션 추가
      linkElement.node().innerHTML = `
        <animate attributeName="stroke-opacity" 
                 values="1;0.3;1" 
                 dur="1s" 
                 repeatCount="indefinite" />
        <animate attributeName="stroke-width" 
                 values="${LINK_STROKE_WIDTH * 1.5};${LINK_STROKE_WIDTH * 2.5};${
        LINK_STROKE_WIDTH * 1.5
      }" 
                 dur="1s" 
                 repeatCount="indefinite" />
      `;

      // "장애 구간" 라벨 추가
      const linkGroup = linkElement.closest('g');
      d3.select(linkGroup)
        .append('text')
        .attr('class', 'root-cause-link-label')
        .attr('x', function () {
          const source = typeof d.source === 'object' ? d.source : _equipmentMap[d.source];
          const target = typeof d.target === 'object' ? d.target : _equipmentMap[d.target];
          return (source.x + target.x) / 2;
        })
        .attr('y', function () {
          const source = typeof d.source === 'object' ? d.source : _equipmentMap[d.source];
          const target = typeof d.target === 'object' ? d.target : _equipmentMap[d.target];
          return (source.y + target.y) / 2 - 15;
        })
        .attr('fill', '#FF0000')
        .attr('font-weight', 'bold')
        .text('장애 구간');

      console.log(`링크 애니메이션 적용: ${d.id}`);
    });
}

// SVG 애니메이션을 직접 사용한 노드 강조 함수
function applyVisualPatternEffect(nodeIds) {
  if (!nodeIds || nodeIds.length === 0) return;

  console.log('애니메이션 적용 시작:', nodeIds);

  // 기존 강조 효과 제거
  clearRootCauseEffects();

  // 노드에 강조 효과 적용
  d3.selectAll('.equip-node')
    .filter((d) => nodeIds.includes(d.id))
    .each(function (d) {
      const nodeElement = d3.select(this);
      const rectElement = nodeElement.select('rect');

      // 애니메이션 ID 생성 - 각 노드마다 고유한 ID 필요
      const animationId = `pulse-${d.id.replace(/[^a-zA-Z0-9]/g, '_')}`;

      // 스타일 적용
      rectElement
        .classed('root-cause-node', true)
        .attr('stroke', ROOT_CAUSE_HIGHLIGHT_COLOR)
        .attr('stroke-width', ROOT_CAUSE_STROKE_WIDTH);

      // 애니메이션용 defs 요소 생성 (중복 방지)
      let svgElement = d3.select('#map-container svg');
      if (svgElement.empty()) {
        console.error('SVG 요소를 찾을 수 없습니다!');
        return;
      }

      let defs = svgElement.select('defs');
      if (defs.empty()) {
        defs = svgElement.append('defs');
      }

      if (defs.select(`#${animationId}`).empty()) {
        defs
          .append('animate')
          .attr('id', animationId)
          .attr('attributeName', 'stroke-width')
          .attr(
            'values',
            `${ROOT_CAUSE_STROKE_WIDTH};${ROOT_CAUSE_STROKE_WIDTH * 2.5};${ROOT_CAUSE_STROKE_WIDTH}`
          )
          .attr('dur', '1.0s')
          .attr('repeatCount', 'indefinite');
      }

      // rect 내부에 stroke 애니메이션 삽입
      rectElement.node().innerHTML = `<animate attributeName="stroke-width" values="${ROOT_CAUSE_STROKE_WIDTH};${
        ROOT_CAUSE_STROKE_WIDTH * 2.5
      };${ROOT_CAUSE_STROKE_WIDTH}" dur="0.5s" repeatCount="indefinite" />`;

      // 기존 분야명 텍스트를 찾아 "전송 장애 의심" 등으로 업데이트
      nodeElement
        .selectAll('text')
        .filter(function () {
          return d3.select(this).attr('dy') === '-10';
        })
        .each(function () {
          const original = d3.select(this).text();
          if (!original.includes('(장애 의심)')) {
            d3.select(this).text(`${original} (장애 의심)`);
          }
        });

      console.log(`노드 애니메이션 적용: ${d.equip_name} (ID: ${d.id})`);
    });
}

// 기존 강조 효과를 모두 제거하는 함수
function clearRootCauseEffects() {
  // 기존 애니메이션 중지
  if (window.rootCauseAnimationTimer) {
    clearInterval(window.rootCauseAnimationTimer);
    window.rootCauseAnimationTimer = null;
  }

  // 모든 root-cause-node 클래스 제거
  d3.selectAll('.root-cause-node')
    .classed('root-cause-node', false)
    .attr('stroke', '#fff')
    .attr('stroke-width', NODE_STROKE_WIDTH)
    .style('filter', null);

  // 모든 root-cause-link 클래스 제거
  d3.selectAll('.root-cause-link')
    .classed('root-cause-link', false)
    .attr('stroke', LINK_COLOR)
    .attr('stroke-width', LINK_STROKE_WIDTH)
    .attr('stroke-opacity', LINK_OPACITY);

  // 모든 라벨 제거
  d3.selectAll('.root-cause-label, .root-cause-link-label').remove();
}

// 채팅 메시지 추가 함수
function addChatMessage(content, type = 'system', isAlarmMessage = false) {
  const chatArea = document.getElementById('chat-messages-area');
  if (!chatArea) return;

  const messageDiv = document.createElement('div');

  // 경보 현황 메시지인지 경우 핑크색 백그라운드 alarm-status CSS 적용
  let messageType = type;
  if (isAlarmMessage) {
    messageType = 'alarm-status';
  }

  messageDiv.className = `chat-message ${messageType}`;

  const currentTime = new Date().toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  messageDiv.innerHTML = `
    <div class="message-content">${content}</div>
    <div class="message-time">${currentTime}</div>
  `;

  chatArea.appendChild(messageDiv);
  chatArea.scrollTop = chatArea.scrollHeight;
}

// 노드 이름 가져오기 헬퍼 함수
function getNodeName(nodeId) {
  if (typeof _equipmentMap !== 'undefined' && _equipmentMap[nodeId]) {
    return _equipmentMap[nodeId].equip_name || nodeId;
  }
  return nodeId;
}

// 채팅창 상단에 최초 한번만 표시되는 기본 안내 메시지 추가 (페이지 로드 시)
let isFirstTimeMessage = true;

// 장비 변경 시 채팅창 초기화 함수 수정 - 기본 메시지 개선
function handleEquipChangeEvent(equipInfo) {
  console.log('장비 변경 감지:', equipInfo);

  // 채팅창 초기화
  clearChatMessages();

  // 장비 변경 시 안내 메시지 (경보 정보 포함)
  const equipName = equipInfo?.equipName || equipInfo?.equip_name || '알 수 없는 장비';
  const equipId = equipInfo?.equipId || equipInfo?.equip_id || '';

  let isAlarmMessage = false;
  let message = `<strong>📌 선택된 장비의 최근 경보현황입니다.</strong><br>`;

  message += `&nbsp&nbsp • 분야: ${equipInfo.equipSector} (타입: ${equipInfo.equipType})`;
  message += `<br>&nbsp&nbsp • 국사: ${equipInfo.guksaName}`;
  message += `<br>&nbsp&nbsp • 장비명: ${equipName}`;

  if (equipId) {
    message += `<br>&nbsp&nbsp • 장비ID: ${equipId}`;

    // 해당 장비의 최근 경보 5개 추가
    const equipAlarms = getRecentAlarmsForEquip(equipId, 5);

    if (equipAlarms.length > 0) {
      isAlarmMessage = true;
      message += `<br>&nbsp&nbsp • 최근 경보: ${equipAlarms.length}개`;

      equipAlarms.forEach((alarm, index) => {
        const alarmTime = formatDateTimeForToolTip(alarm.occur_datetime) || '-';
        const alarmMsg = escapeHtml(alarm.alarm_message) || '메시지 없음';

        const truncatedMsg = alarmMsg.length > 50 ? alarmMsg.slice(0, 50) + '...' : alarmMsg;
        // message += `<br> &nbsp&nbsp ${index + 1}. ${alarmTime}: ${truncatedMsg}`;
        message += `<br> &nbsp&nbsp&nbsp&nbsp [${alarmTime}] ${truncatedMsg}`;
      });
    } else {
      message += `<br>&nbsp&nbsp • 최근 경보: 없음`;
    }
  }

  addChatMessage(message, 'system', isAlarmMessage);
}

// 특정 장비의 최근 경보를 가져오는 함수
function getRecentAlarmsForEquip(equipId, maxCount = 3) {
  if (!_totalAlarmDataList || !Array.isArray(_totalAlarmDataList)) {
    return [];
  }

  // 해당 장비의 경보만 필터링하고 시간순 정렬
  const equipAlarms = _totalAlarmDataList
    .filter((alarm) => alarm && alarm.equip_id === equipId)
    .sort((a, b) => {
      const dateA = new Date(a.occur_datetime || 0);
      const dateB = new Date(b.occur_datetime || 0);
      return dateB - dateA; // 최신순 정렬
    })
    .slice(0, maxCount);

  return equipAlarms;
}

// 전역 함수 등록
window.handleEquipChangeEvent = handleEquipChangeEvent;
window.EQUIP_MAP_CONFIG = EQUIP_MAP_CONFIG;

// 테이블 및 분야 관련 상수들 전역 등록
window.ALARM_TABLE_PAGE_SIZE = ALARM_TABLE_PAGE_SIZE;
window.TABLE_COLUMNS = TABLE_COLUMNS;
window.SECTORS = SECTORS;

// 하위 호환성을 위한 개별 상수들도 등록
window.MAP_HEIGHT = EQUIP_MAP_CONFIG.MAP_HEIGHT;
window.MAP_PADDING = EQUIP_MAP_CONFIG.MAP_PADDING;
window.MAP_MARGIN_TOP = EQUIP_MAP_CONFIG.MAP_MARGIN_TOP;
window.HORIZONTAL_SPACING = EQUIP_MAP_CONFIG.HORIZONTAL_SPACING;
window.VERTICAL_SPACING = EQUIP_MAP_CONFIG.VERTICAL_SPACING;
window.ZOOM_MIN_SCALE = EQUIP_MAP_CONFIG.ZOOM_MIN_SCALE;
window.ZOOM_MAX_SCALE = EQUIP_MAP_CONFIG.ZOOM_MAX_SCALE;

// 색상 관련 변수들 전역 등록
window.FIELD_COLORS = FIELD_COLORS;
window.DEFAULT_COLOR = DEFAULT_COLOR;
window.LINK_COLOR = LINK_COLOR;
window.LINK_HOVER_COLOR = LINK_HOVER_COLOR;
window.LINK_MULTI_BASE_COLOR = LINK_MULTI_BASE_COLOR;
window.LINK_MULTI_VARIATION = LINK_MULTI_VARIATION;
window.FIRST_CENTRAL_NODE_BORDER_COLOR = FIRST_CENTRAL_NODE_BORDER_COLOR;
window.DEFAULT_MAP_STYLES = DEFAULT_MAP_STYLES;

// 추가 유틸리티 함수들
window.addChatMessage = addChatMessage;
window.applyVisualPatternEffect = applyVisualPatternEffect;
window.applyLinkVisualEffect = applyLinkVisualEffect;
window.clearRootCauseEffects = clearRootCauseEffects;
window.getNodeName = getNodeName;
window.getRecentAlarmsForEquip = getRecentAlarmsForEquip;

// 상수들도 전역으로 등록
window.NODE_WIDTH = NODE_WIDTH;
window.NODE_HEIGHT = NODE_HEIGHT;
window.NODE_CORNER_RADIUS = NODE_CORNER_RADIUS;
window.NODE_STROKE_WIDTH = NODE_STROKE_WIDTH;
window.LINK_STROKE_WIDTH = LINK_STROKE_WIDTH;
window.TOOLTIP_DURATION = TOOLTIP_DURATION;
window.ROOT_CAUSE_HIGHLIGHT_COLOR = ROOT_CAUSE_HIGHLIGHT_COLOR;
window.ROOT_CAUSE_STROKE_WIDTH = ROOT_CAUSE_STROKE_WIDTH;
