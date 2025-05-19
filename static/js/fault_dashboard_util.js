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

// 시간 포맷팅 함수 (맵의 툴팀에 경보발생시간 추가)
function formatDateTimeForToolTip(dateTimeStr) {
  if (!dateTimeStr) return '-';

  try {
    const date = new Date(dateTimeStr);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
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
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);

  // 페이지네이션 높이에 따라 테이블 컨테이너 조정
  adjustTableHeight(totalPages);

  DOM.pagination().pagination({
    items: totalItems,
    itemsOnPage: PAGE_SIZE,
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

    // 초기 너비가 설정되어 있지 않으면 기본값 설정
    if (!leftSidebar.style.width) {
      leftSidebar.style.width = '260px';
    }
  }
}
// 좌측 사이드바 Resizing
function initSidebarResize() {
  const dragHandle = document.getElementById('drag-handle');
  const leftSidebar = document.querySelector('.left-sidebar');
  const toggleBtn = document.getElementById('toggle-btn');

  let isResizing = false;
  let originalWidth = leftSidebar.offsetWidth || 250; // 초기 너비 저장
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
    recentUpdateTimeEl.textContent = `최근 경보: ${formatDateTime(recentTime)}`;
  } else {
    recentUpdateTimeEl.textContent = `최근 경보: -`;
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

// 경보 테이블 초기화
function initAlarmTable() {
  console.log('경보 테이블 초기화');

  try {
    // 기존 테이블 Resizer 해제
    if (window.tableResizer) {
      window.tableResizer.dispose();
      delete window.tableResizer;
    }
  } catch (e) {
    console.warn('테이블 Resizer 해제 오류:', e);
  }
}

// 경보 테이블의 페이지 데이터를 안전하게 처리하는 유틸리티 함수
function getPageDataSafely(dataArray, prefix = '') {
  // 데이터가 없는 경우 처리
  if (!dataArray || dataArray.length === 0) {
    console.log(`${prefix} 데이터가 없습니다.`);
    return { success: false, message: '표시할 데이터가 없습니다.' };
  }

  // _currentPage 유효성 검사
  const totalPages = Math.ceil(dataArray.length / PAGE_SIZE);
  if (_currentPage <= 0 || _currentPage > totalPages) {
    console.warn(`${prefix} 현재 페이지(${_currentPage})가 유효하지 않아 1페이지로 재설정합니다.`);
    _currentPage = 1;
  }

  // 페이지 데이터 계산
  const start = (_currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;

  // 시작 인덱스가 배열 범위를 벗어나는지 확인
  if (start >= dataArray.length) {
    console.warn(
      `${prefix} 시작 인덱스(${start})가 데이터 길이(${dataArray.length})를 초과합니다.`
    );
    _currentPage = 1;
    const pageData = dataArray.slice(0, PAGE_SIZE);
    console.log(`${prefix} 페이지 재설정: 시작=0, 끝=${PAGE_SIZE}, 데이터 길이=${pageData.length}`);

    if (pageData.length > 0) {
      return { success: true, data: pageData, isReset: true };
    } else {
      return { success: false, message: '현재 페이지에 표시할 데이터가 없습니다.', isReset: true };
    }
  }

  // 정상적인 페이지 데이터 반환
  const pageData = dataArray.slice(start, end);
  console.log(`${prefix} 페이지 계산: 시작=${start}, 끝=${end}, 데이터 길이=${pageData.length}`);

  if (!pageData || pageData.length === 0) {
    console.log(`${prefix} 현재 페이지에 표시할 데이터가 없음`);
    return { success: false, message: '현재 페이지에 표시할 데이터가 없습니다.' };
  }

  return { success: true, data: pageData };
}

// 현재 페이지에 맞춰 경보 테이블 표시
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
