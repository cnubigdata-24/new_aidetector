/**
 * 테이블 컬럼 리사이저 - 바닐라 자바스크립트 구현
 * 테이블 헤더 리사이즈 핸들 추가, 드래그 컬럼 너비 조정, 컬럼 필터 기능
 */
document.addEventListener('DOMContentLoaded', function () {
  console.log('[TableResizer] DOM 로드 완료, 테이블 리사이저 초기화 시작');

  // 로딩 약간 지연시켜 다른 스크립트가 먼저 로드되도록
  setTimeout(() => {
    // 경보 테이블 요소 가져오기
    const table = document.getElementById('alarmTable');
    if (!table) {
      console.error('[TableResizer] 테이블(#alarmTable)을 찾을 수 없습니다.');
      return;
    }

    console.log('[TableResizer] 테이블 요소 발견:', table);
    initializeTableResizer(table);

    // 테이블 상단에 검색 필터 영역 추가
    addTableSearchFilters(table);

    // 테이블 데이터 로드 후 유효 경보 행에 클래스 추가하는 함수 호출
    setupValidAlarmHighlighting();
  }, 500); // 500ms 지연
});

/**
 * 테이블에 리사이즈 기능 초기화
 * @param {HTMLElement} table - 대상 테이블 요소
 */
function initializeTableResizer(table) {
  // 테이블 준비
  prepareTable(table);

  // 각 컬럼에 리사이즈 핸들 추가
  addResizeHandles(table);

  // 디버깅 정보 출력
  console.log('[TableResizer] 테이블 리사이저 초기화 완료');
}

/**
 * 테이블 준비 - 초기 설정
 * @param {HTMLElement} table - 대상 테이블 요소
 */
function prepareTable(table) {
  console.log('[TableResizer] 테이블 준비 시작');

  // 테이블 레이아웃 모드 설정
  table.style.tableLayout = 'fixed';

  // 기존 colgroup 제거 (중복 방지)
  const existingColgroup = table.querySelector('colgroup');
  if (existingColgroup) {
    console.log('[TableResizer] 기존 colgroup 제거');
    existingColgroup.remove();
  }

  // 테이블에 colgroup 생성
  const colgroup = document.createElement('colgroup');
  const headerCells = table.querySelectorAll('thead th');

  console.log(`[TableResizer] 헤더 셀 수: ${headerCells.length}`);

  // 각 헤더 셀에 대한 col 요소 생성
  const initialWidths = [70, 70, 100, 150, 120, 120, 200, 300];
  headerCells.forEach((th, index) => {
    const col = document.createElement('col');

    // 초기 너비 설정 (명시적으로 고정)
    const width = initialWidths[index] || 100;
    col.style.width = `${width}px`;
    col.setAttribute('data-initial-width', width);

    colgroup.appendChild(col);
    console.log(`[TableResizer] 컬럼 ${index} 너비: ${width}px`);
  });

  // colgroup을 테이블의 첫 번째 자식으로 삽입
  table.insertBefore(colgroup, table.firstChild);

  // 테이블 레이아웃 강제로 고정 (중요)
  setTimeout(() => {
    table.style.tableLayout = 'fixed';
    console.log('[TableResizer] 테이블 레이아웃 강제 고정');
  }, 100);

  console.log('[TableResizer] 테이블 준비 완료');
}

/**
 * 각 컬럼에 리사이즈 핸들 추가
 * @param {HTMLElement} table - 대상 테이블 요소
 */
function addResizeHandles(table) {
  const headerCells = table.querySelectorAll('thead th');
  const cols = table.querySelectorAll('colgroup col');

  // 기존 리사이저 제거 (중복 방지)
  table.querySelectorAll('.col-resizer').forEach((resizer) => resizer.remove());

  headerCells.forEach((th, index) => {
    // 마지막 컬럼은 리사이즈 핸들 생략 (선택사항)
    if (index === headerCells.length - 1) return;

    // 헤더에 position 설정 확인
    th.style.position = 'relative';

    // 리사이즈 핸들 생성
    const resizer = document.createElement('div');
    resizer.className = 'col-resizer';
    resizer.innerHTML = ''; // 내용 비움

    // 핸들 위치 강제 조정
    resizer.style.position = 'absolute';
    resizer.style.top = '0';
    resizer.style.right = '0';
    resizer.style.width = '8px';
    resizer.style.height = '100%';
    resizer.style.cursor = 'col-resize';
    resizer.style.zIndex = '20';

    th.appendChild(resizer);

    // 리사이즈 핸들에 이벤트 리스너 추가
    resizer.addEventListener('mousedown', function (e) {
      e.preventDefault();
      e.stopPropagation(); // 버블링 방지

      console.log(`[TableResizer] 컬럼 ${index} 리사이징 시작`);

      // 현재 컬럼과 col 요소
      const col = cols[index];
      if (!col) {
        console.error(`[TableResizer] 컬럼 ${index}에 대한 col 요소 없음`);
        return;
      }

      const startX = e.clientX; // 클라이언트 좌표 사용
      const startWidth = col.offsetWidth;

      console.log(`[TableResizer] 시작 너비: ${startWidth}px, 시작 X: ${startX}`);

      // 리사이징 중 스타일
      resizer.classList.add('col-resizing');
      resizer.style.backgroundColor = 'rgba(0, 123, 255, 0.7)';
      document.body.style.cursor = 'col-resize'; // 커서 스타일 변경

      // 마우스 이동 이벤트
      function handleMouseMove(e) {
        // 이동 거리 계산
        const offset = e.clientX - startX;

        // 새 너비 계산 (최소 50px)
        const newWidth = Math.max(50, startWidth + offset);

        // 너비 적용
        col.style.width = `${newWidth}px`;

        // 디버깅 정보 (많은 로그 발생 방지용 throttle)
        if (Math.abs(offset) % 20 === 0) {
          console.log(`[TableResizer] 리사이징 중: ${newWidth}px (오프셋: ${offset})`);
        }
      }

      // 마우스 업 이벤트
      function handleMouseUp(e) {
        console.log(`[TableResizer] 리사이징 종료`);

        // 스타일 원복
        resizer.classList.remove('col-resizing');
        resizer.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
        document.body.style.cursor = '';

        // 이벤트 리스너 제거
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);

        // 최종 너비 기록
        const finalWidth = cols[index].offsetWidth;
        console.log(`[TableResizer] 최종 너비: ${finalWidth}px`);
      }

      // 문서 레벨 이벤트 리스너
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    });
  });

  console.log('[TableResizer] 리사이즈 핸들 추가 완료');
}

/**
 * 테이블 상단에 컬럼 선택 필터 추가
 * @param {HTMLElement} table - 대상 테이블 요소
 */
function addTableSearchFilters(table) {
  console.log('[TableSearch] 테이블 검색 필터 추가 시작');

  // 테이블 컨테이너 찾기
  const tableContainer = table.closest('.table-container');
  if (!tableContainer) {
    console.error('[TableSearch] 테이블 컨테이너를 찾을 수 없습니다.');
    return;
  }

  // 기존 필터 컨테이너 제거 (있으면)
  const existingFilter = tableContainer.querySelector('.table-filter-container');
  if (existingFilter) {
    existingFilter.remove();
  }

  // 검색 필터 컨테이너 생성
  const filterContainer = document.createElement('div');
  filterContainer.className = 'table-filter-container';

  // 컬럼 선택 필터 폼 생성
  const filterForm = document.createElement('div');
  filterForm.className = 'filter-form';

  // 컬럼 선택 레이블
  const labelColumn = document.createElement('span');
  labelColumn.className = 'filter-label';
  labelColumn.textContent = '대상 컬럼';
  filterForm.appendChild(labelColumn);

  // 컬럼 선택 드롭다운
  const columnSelect = document.createElement('select');
  columnSelect.className = 'filter-select';
  columnSelect.id = 'filter-column-select';

  // 헤더 셀 가져오기
  const headerCells = table.querySelectorAll('thead th');

  // 전체 옵션 추가
  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = '전체';
  columnSelect.appendChild(allOption);

  // 각 컬럼에 대한 옵션 추가
  headerCells.forEach((th, index) => {
    const headerText = th.textContent.replace('|', '').trim();
    const option = document.createElement('option');
    option.value = index.toString();
    option.textContent = headerText;
    columnSelect.appendChild(option);
  });

  filterForm.appendChild(columnSelect);

  // 필터 값 입력 레이블
  const labelValue = document.createElement('span');
  labelValue.className = 'filter-label';
  labelValue.textContent = '';
  filterForm.appendChild(labelValue);

  // 필터 값 입력 필드
  const filterInput = document.createElement('input');
  filterInput.type = 'text';
  filterInput.className = 'filter-input';
  filterInput.id = 'filter-value-input';
  filterInput.placeholder = '검색어 입력...';

  // 엔터키 이벤트 추가
  filterInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.keyCode === 13) {
      e.preventDefault(); // 기본 동작 방지
      applyTableFilter(); // Filter 버튼과 동일한 함수 호출
    }
  });

  filterForm.appendChild(filterInput);

  // 필터 적용 버튼
  const filterButton = document.createElement('button');
  filterButton.className = 'filter-button';
  filterButton.textContent = 'Filter';
  filterButton.addEventListener('click', applyTableFilter);
  filterForm.appendChild(filterButton);

  filterContainer.appendChild(filterForm);

  // 필터 초기화 버튼
  const resetButton = document.createElement('button');
  resetButton.className = 'filter-reset';
  resetButton.textContent = 'Reset Filter';
  resetButton.addEventListener('click', resetTableFilter);
  filterContainer.appendChild(resetButton);

  // 필터 컨테이너를 테이블 앞에 삽입
  tableContainer.insertBefore(filterContainer, table);

  console.log('[TableSearch] 테이블 검색 필터 추가 완료');
}

/**
 * 테이블 필터 적용 함수
 */
function applyTableFilter() {
  // 선택된 컬럼과 검색 값 가져오기
  const columnSelect = document.getElementById('filter-column-select');
  const filterInput = document.getElementById('filter-value-input');

  if (!columnSelect || !filterInput) {
    console.error('[TableSearch] 필터 요소를 찾을 수 없습니다.');
    return;
  }

  const columnIndex = columnSelect.value;
  const filterValue = filterInput.value.toLowerCase().trim();

  // 필터 값이 없으면 전체 데이터 표시
  if (filterValue === '') {
    // **여기서 장비 select를 강제로 전체로 초기화**
    document.getElementById('searchEquipName').value = '';

    searchAlarms(true); // 원본 데이터 다시 로드
    return;
  }

  console.log(`[TableSearch] 필터 적용: 컬럼=${columnIndex}, 값=${filterValue}`);

  // 테이블 가져오기
  const table = document.getElementById('alarmTable');
  if (!table) return;

  // 원본 데이터 참조 - 전역변수 _totalAlarmDataList 직접 사용
  let sourceData = [];

  try {
    // 전역 변수에서 데이터 가져오기
    if (typeof _totalAlarmDataList !== 'undefined' && typeof _selectedSector !== 'undefined') {
      sourceData = _totalAlarmDataList.filter(
        (item) => item && item.sector && item.sector.toLowerCase() === _selectedSector.toLowerCase()
      );
    }
    console.log('[TableSearch] 분야별 데이터 수:', sourceData.length);
  } catch (error) {
    console.error('[TableSearch] 데이터 접근 오류:', error);
  }

  if (!Array.isArray(sourceData) || sourceData.length === 0) {
    console.error('[TableSearch] 원본 데이터가 배열이 아니거나 비어 있습니다.');
    alert('검색할 데이터가 없습니다. 먼저 데이터를 로드해주세요.');
    return;
  }

  // 첫 번째 데이터 항목만 로깅 (디버깅용)
  if (sourceData.length > 0) {
    console.log('[TableSearch] 데이터 샘플:', sourceData[0]);
  }

  // 데이터 필터링
  let filteredData;

  if (columnIndex === '') {
    // 전체 컬럼 검색 (모든 필드에서 검색)
    filteredData = sourceData.filter((item) => {
      // 모든 필드 값을 문자열로 합쳐서 검색 (null/undefined 안전하게 처리)
      const allValues = Object.values(item || {})
        .map((val) => (val === null || val === undefined ? '' : String(val).toLowerCase()))
        .join(' ');
      return allValues.includes(filterValue);
    });
  } else {
    // 특정 컬럼 검색
    const colIdx = parseInt(columnIndex);
    const fieldName = getColumnFieldByIndex(colIdx);

    if (!fieldName) {
      console.error(`[TableSearch] 유효하지 않은 컬럼 인덱스: ${colIdx}`);
      return;
    }

    console.log(`[TableSearch] 필드명으로 필터링: ${fieldName}`);

    filteredData = sourceData.filter((item) => {
      if (!item) return false;

      // 필드 접근 방식 개선 (item[fieldName] 또는 항목에 다른 방식으로 접근)
      let fieldValue = '';

      if (item[fieldName] !== undefined) {
        // 직접 필드 접근
        fieldValue = String(item[fieldName] || '').toLowerCase();
      } else if (item.hasOwnProperty(fieldName)) {
        // hasOwnProperty로 확인
        fieldValue = String(item[fieldName] || '').toLowerCase();
      } else {
        // 컬럼 인덱스로 직접 값 접근 시도
        const values = Object.values(item);
        if (colIdx < values.length) {
          fieldValue = String(values[colIdx] || '').toLowerCase();
        }
      }

      return fieldValue.includes(filterValue);
    });
  }

  console.log(`[TableSearch] 필터링 결과: ${filteredData.length}개 행 일치`);

  // 결과가 있는 경우 테이블 업데이트
  if (filteredData.length > 0) {
    // 필터링된 데이터로 테이블 갱신
    window.currentSortedData = filteredData;

    // updateAlarmTable 함수가 있으면 호출
    if (typeof updateAlarmTable === 'function') {
      updateAlarmTable(filteredData);
    } else {
      // updateAlarmTable 함수가 없으면 직접 테이블 업데이트
      updateTableWithFilteredData(filteredData);
    }
  } else {
    // 결과가 없는 경우 메시지 표시
    const tbody = table.querySelector('tbody');
    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="8" style="text-align:center; padding:10px;">검색 결과가 없습니다.</td></tr>';
    }
  }
}

/**
 * 필터링된 데이터로 테이블 업데이트 (updateAlarmTable 함수가 없을 경우)
 * @param {Array} data - 필터링된 데이터 배열
 */
function updateTableWithFilteredData(data) {
  const tbody = document.getElementById('alarmTableBody');
  if (!tbody) return;

  // 테이블 내용 초기화
  tbody.innerHTML = '';

  // 페이지당 행 수
  const rowsPerPage = ALARM_TABLE_PAGE_SIZE;
  const currentPage = 1;

  // 현재 페이지에 표시할 데이터 추출
  const startIdx = (currentPage - 1) * rowsPerPage;
  const pageData = data.slice(startIdx, startIdx + rowsPerPage);

  // 테이블에 행 추가 (addRowsToAlarmTable과 동일한 방식)
  pageData.forEach((item) => {
    if (!item) return;

    const row = document.createElement('tr');

    // guksa_id 데이터 속성 추가 (클릭 이벤트에 필요)
    row.setAttribute('data-guksa-id', item.guksa_id || '');

    // 유효 경보 행에 클래스 추가 (Y 또는 '유효' 모두 처리)
    if (item.valid_yn === 'Y' || item.valid_yn === '유효') {
      row.classList.add('valid-alarm');
    }

    // 국사 이름 처리
    let guksaName = item.guksa_name || item.guksa_id || '-';

    // addRowsToAlarmTable과 동일한 셀 구조 사용
    const cells = [
      { value: guksaName, className: 'col-guksa', title: item.guksa_id },
      { value: item.sector || '-', className: 'col-sector' },
      { value: item.valid_yn === 'Y' ? '유효' : '무효', className: 'col-valid' },
      {
        value:
          typeof formatDateTime === 'function'
            ? formatDateTime(item.occur_datetime)
            : item.occur_datetime || '-',
        className: 'col-occur-time',
      },
      { value: item.equip_id || '', className: 'col-equip-id' },
      { value: item.equip_type || '-', className: 'col-equip-type' },
      { value: item.equip_name || '-', className: 'col-equip-name' },
      { value: item.alarm_message || '-', className: 'col-alarm-message' },
    ];

    // 셀 생성 및 추가
    cells.forEach((cell) => {
      const td = document.createElement('td');
      td.className = cell.className;
      td.textContent = cell.value;

      if (cell.title) {
        td.title = cell.title;
      }

      row.appendChild(td);
    });

    tbody.appendChild(row);
  });

  // 페이지네이션 업데이트
  updatePagination(data.length, rowsPerPage, currentPage);
}

/**
 * 간단한 페이지네이션 업데이트
 */
function updatePagination(totalItems, rowsPerPage, currentPage) {
  const pagination = document.getElementById('pagination');
  if (!pagination) return;

  // 페이지 수 계산
  const totalPages = Math.ceil(totalItems / rowsPerPage);

  // 간단한 페이지네이션 생성
  pagination.innerHTML = '';

  // 이전 페이지 버튼
  if (totalPages > 1) {
    const prevBtn = document.createElement('button');
    prevBtn.textContent = '이전';
    prevBtn.disabled = currentPage <= 1;
    pagination.appendChild(prevBtn);

    // 페이지 버튼
    for (let i = 1; i <= Math.min(totalPages, 5); i++) {
      const pageBtn = document.createElement('button');
      pageBtn.textContent = i;
      pageBtn.classList.toggle('active', i === currentPage);
      pagination.appendChild(pageBtn);
    }

    // 다음 페이지 버튼
    const nextBtn = document.createElement('button');
    nextBtn.textContent = '다음';
    nextBtn.disabled = currentPage >= totalPages;
    pagination.appendChild(nextBtn);
  }
}

/**
 * 테이블 필터 초기화 함수
 */
function resetTableFilter() {
  // 필터 입력 필드 초기화
  const columnSelect = document.getElementById('filter-column-select');
  const filterInput = document.getElementById('filter-value-input');

  if (columnSelect) columnSelect.value = '';
  if (filterInput) filterInput.value = '';

  // 원래 데이터로 테이블 갱신
  if (typeof searchAlarms === 'function') {
    searchAlarms();
  } else {
    console.error('[TableSearch] searchAlarms 함수를 찾을 수 없습니다.');
    alert('테이블 갱신 함수를 찾을 수 없습니다.');
  }
}

/**
 * 컬럼 인덱스를 필드 이름으로 변환
 * @param {number} index - 컬럼 인덱스
 * @returns {string} 필드 이름
 */
function getColumnFieldByIndex(index) {
  // 컬럼 필드 매핑
  const columnFields = [
    'guksa_name', // 국사
    'sector', // 분야
    'valid_yn', // 유효/무효
    'occur_datetime', // 발생시간
    'equip_id', // 장비ID
    'equip_type', // 장비유형
    'equip_name', // 장비명
    'alarm_message', // 경보내용
  ];

  return columnFields[index] || null;
}

/**
 * 유효 경보 행에 클래스 추가 함수
 */
function setupValidAlarmHighlighting() {
  console.log('[TableSearch] 유효 경보 행 하이라이팅 설정');

  // 약간 지연시켜 테이블이 모두 로드된 후 실행
  setTimeout(() => {
    const tbody = document.getElementById('alarmTableBody');
    if (!tbody) return;

    // 모든 행 확인
    const rows = tbody.querySelectorAll('tr');

    rows.forEach((row) => {
      // 유효/무효 셀은 3번째 컬럼 (인덱스 2)
      const validCell = row.querySelector('td:nth-child(3)');

      if (validCell && validCell.textContent.trim() === '유효') {
        row.classList.add('valid-alarm');
      } else {
        row.classList.remove('valid-alarm');
      }
    });

    console.log('[TableSearch] 유효 경보 행 하이라이팅 완료');
  }, 300);
}

// 테이블 데이터가 업데이트될 때마다 유효 경보 행에 클래스 추가
// 기존 updateAlarmTable 함수가 호출된 후 실행되어야 함
if (
  typeof window.originalUpdateAlarmTable === 'undefined' &&
  typeof window.updateAlarmTable === 'function'
) {
  window.originalUpdateAlarmTable = window.updateAlarmTable;

  window.updateAlarmTable = function (data) {
    // 원래 함수 호출
    window.originalUpdateAlarmTable(data);

    // 더 이상 여기서 setupValidAlarmHighlighting()을 호출하지 않음
    // 이미 원본 함수에서 처리됨
  };
}

/**
 * 유효 경보 행에 클래스 추가 함수
 * fault_dashboard.js의 updateAlarmTableContent 함수를 훅하여 사용하는 방식으로 변경
 */
function patchAlarmTableContentFunction() {
  // 원본 함수가 있는지 확인
  if (
    typeof window.updateAlarmTableContent === 'function' &&
    typeof window.originalUpdateAlarmTableContent === 'undefined'
  ) {
    console.log('[TableSearch] 원본 테이블 렌더링 함수를 확장합니다');

    // 원본 함수 저장
    window.originalUpdateAlarmTableContent = window.updateAlarmTableContent;

    // 함수 재정의
    window.updateAlarmTableContent = function (data) {
      // 원본 함수 호출
      window.originalUpdateAlarmTableContent(data);

      // 테이블 행 처리 (이미 DOM에 추가된 행에 클래스 추가)
      const tbody = document.getElementById('alarmTableBody');
      if (!tbody) return;

      // 모든 행 확인
      const rows = tbody.querySelectorAll('tr');
      rows.forEach((row) => {
        // 유효/무효 셀은 3번째 컬럼 (인덱스 2)
        const validCell = row.querySelector('td:nth-child(3)');

        if (validCell && validCell.textContent.trim() === '유효') {
          row.classList.add('valid-alarm');
        } else {
          row.classList.remove('valid-alarm');
        }
      });

      console.log('[TableSearch] 유효 경보 행 스타일 적용 완료');
    };
  }
}

// 간소화된 페이지네이션 관련 코드
document.addEventListener('DOMContentLoaded', function () {
  // 원본 테이블 렌더링 함수 패치
  setTimeout(() => {
    patchAlarmTableContentFunction();
  }, 1000); // 테이블 렌더링 함수가 로드된 후 실행
});
