// ================================
// CommonUtils.js - 통합 유틸리티 모듈
// ================================

// ================================
// 1. 기본 유틸리티 함수들
// ================================

import { stateManager as StateManager } from '../core/StateManager.js'; // 싱글톤

export function formatNumber(num) {
  return parseInt(num || 0).toLocaleString('ko-KR');
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day} ${hour}:${minute}`;
  } catch {
    return dateStr;
  }
}

// 툴팁용 날짜 포맷팅 (별칭)
export function formatDateTimeForToolTip(dateStr) {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export function formatDateTimeLong(dateTimeString) {
  try {
    if (!dateTimeString) return '-';
    const date = new Date(dateTimeString);
    return date.toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (error) {
    return dateTimeString || '-';
  }
}

// HTML 이스케이프 함수
export function escapeHtml(text) {
  if (typeof text !== 'string') return text;

  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ================================
// 2. API 호출 함수
// ================================

export async function callApi(url, data = null, options = {}) {
  const { method = data ? 'POST' : 'GET', timeout = 30000, headers = {}, retries = 2 } = options;

  const defaultHeaders = {
    'Content-Type': 'application/json',
    ...headers,
  };

  const requestOptions = {
    method: method,
    headers: defaultHeaders,
    ...options,
  };

  if (data && (method === 'POST' || method === 'PUT')) {
    requestOptions.body = JSON.stringify(data);
  }

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        ...requestOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      lastError = error;
      console.error(`API 호출 실패 (시도 ${attempt + 1}/${retries + 1}):`, error);

      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

// REST API 호출 공통 함수
export async function callMapApi(url, data = null, options = {}) {
  const {
    method = data ? 'POST' : 'GET',
    timeout = 30000,
    headers = {},
    retries = 2,
    onProgress = null, // 새로 추가: 진행상황 콜백
  } = options;

  const defaultHeaders = {
    'Content-Type': 'application/json',
    ...headers,
  };

  const requestOptions = {
    method: method,
    headers: defaultHeaders,
    ...options,
  };

  if (data && (method === 'POST' || method === 'PUT')) {
    requestOptions.body = JSON.stringify(data);
  }

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // 진행상황 알림
      if (onProgress) {
        onProgress(`REST API를 호출 중입니다... (${attempt + 1}/${retries + 1})`);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        ...requestOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      // 성공 시 진행상황 알림
      if (onProgress) {
        onProgress('API 호출 완료');
      }

      return result;
    } catch (error) {
      lastError = error;
      console.error(`API 호출 실패 (시도 ${attempt + 1}/${retries + 1}):`, error);

      if (attempt < retries) {
        if (onProgress) {
          onProgress(`재시도 중... (${attempt + 2}/${retries + 1})`);
        }
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

// ================================
// 3. 맵 관련 유틸리티 함수들
// ================================

/**
 * 맵 로딩 메시지 표시 (맵 간섭 방지)
 */
export function showMapLoadingMessage(message, container = null) {
  // 로딩 메시지 표시 비활성화
  //return;

  const targetContainer = container || document.getElementById('map-container');
  if (!targetContainer) return;

  targetContainer.innerHTML = `
    <div class="map-loading-message" style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: 20px;
      text-align: center;
      color: #777;
      background: white;
      border-radius: 4px;
    ">
      <div style="font-size: 24px; margin-bottom: 16px;">⏳</div>
      <div style="font-size: 16px; color: rgb(134, 134, 134);">${message}</div>
    </div>
  `;
}

// showMapErrorMessage 함수 뒤에 추가할 새로운 함수들
export function showMapSectorChangeMessage(sectorName, container = null) {
  const targetContainer = container || document.getElementById('map-container');
  if (!targetContainer) return;

  targetContainer.innerHTML = `
    <div class="sector-change-message" style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: 20px;
      text-align: center;
      color: #777;
      background: white;
      border-radius: 4px;
    ">
      <div style="font-size: 16px; margin-bottom: 8px; color:  rgb(134, 134, 134);">✔️ '${sectorName}' 분야로 변경되었습니다.</div>

    </div>
  `;
}

// 요구사항: 맵뷰 변경 메시지 표시 함수 추가
export function showMapViewChangeMessage(mapViewType, container = null) {
  const targetContainer = container || document.getElementById('map-container');
  if (!targetContainer) return;

  targetContainer.innerHTML = `
    <div class="view-change-message" style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: 20px;
      text-align: center;
      color: #777;
      background: white;
      border-radius: 4px;
    ">
      <div style="font-size: 16px; margin-bottom: 8px; color: rgb(134, 134, 134);">✔️ MAP View가 '${mapViewType}'으로 변경되었습니다.</div>
 
    </div>
  `;
}

export function clearMapMessages(container = null) {
  const mapContainer = container || document.getElementById('map-container');
  if (!mapContainer) return;

  // EquipmentMapComponent에서 사용하는 모든 메시지 관련 클래스들 제거
  const messages = mapContainer.querySelectorAll(
    '.map-loading-overlay, .map-loading-content, .map-loading-text, .simple-map-message'
  );
  messages.forEach((message) => message.remove());
}

// 새로 추가 (EquipmentMapComponent의 updateLoadingMessage와 호환)
export function updateMapLoadingMessage(message, container = null) {
  const mapContainer = container || document.getElementById('map-container');
  if (!mapContainer) return;

  const loadingText = mapContainer.querySelector('.loading-text');
  if (loadingText) {
    loadingText.textContent = '⏳ ' + message;
  }
}

/**
 * 맵 에러 메시지 표시
 */
export function showMapErrorMessage(equipId, errorMessage, container = null) {
  const targetContainer = container || document.getElementById('map-container');
  if (!targetContainer) return;

  targetContainer.innerHTML = `
    <div class="map-error-message" style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: 20px;
      text-align: center;
      color: #777;
      background: white;
      border-radius: 4px;
    ">
      <div style="font-size: 16px; margin-bottom: 8px; color: rgb(134, 134, 134);">❌ 장비 '${equipId}' 토폴로지 생성에 실패했습니다.</div>
      <div style="font-size: 12px; line-height: 1.5; color: #777;">${errorMessage}</div>
    </div>
  `;
}

export function showErrorMessage(message, containerId = 'map-container') {
  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = `
      <div class="commonutils-general-error-container">
        <div class="commonutils-general-error-icon">⚠️</div>
        <div class="commonutils-general-error-message">${message}</div>
      </div>
    `;
  }
}

// ================================
// 4. 성능 관련 함수들
// ================================

export function checkPerformance() {
  const elementCount = document.querySelectorAll('*').length;
  const isOptimal = elementCount < 5000;

  const suggestions = [];
  if (elementCount > 10000) {
    suggestions.push('DOM 요소 수가 너무 많습니다. 가상화를 고려하세요.');
  }
  if (elementCount > 5000) {
    suggestions.push('불필요한 DOM 요소를 제거하세요.');
  }

  return {
    elementCount,
    isOptimal,
    suggestions,
  };
}

export function checkMemoryUsage() {
  if (!performance.memory) {
    return { available: false };
  }

  const memory = performance.memory;
  const usedMB = Math.round(memory.usedJSHeapSize / 1024 / 1024);
  const totalMB = Math.round(memory.totalJSHeapSize / 1024 / 1024);
  const limitMB = Math.round(memory.jsHeapSizeLimit / 1024 / 1024);

  return {
    available: true,
    used: usedMB,
    total: totalMB,
    limit: limitMB,
    usage: Math.round((usedMB / limitMB) * 100),
  };
}

// ================================
// 5. DOM 조작 유틸리티
// ================================

export function sortData(data, key, direction = 'asc') {
  if (!Array.isArray(data)) return data;

  return [...data].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];

    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

export function getDragAfterElement(container, x, y) {
  const draggableElements = [...container.querySelectorAll('.draggable:not(.dragging)')];

  return draggableElements.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;

      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    },
    { offset: Number.NEGATIVE_INFINITY }
  ).element;
}

// ================================
// 6. DOM 최적화 함수
// ================================

export function optimizeDOM() {
  let removedElements = 0;
  const beforeCount = document.querySelectorAll('*').length;

  // 숨겨진 요소들 제거
  const hiddenElements = document.querySelectorAll('[style*="display: none"]');
  hiddenElements.forEach((el) => {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
      removedElements++;
    }
  });

  // 빈 텍스트 노드 제거
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, (node) =>
    node.textContent.trim() === '' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
  );

  const emptyTextNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    emptyTextNodes.push(node);
  }

  emptyTextNodes.forEach((node) => {
    if (node.parentNode) {
      node.parentNode.removeChild(node);
      removedElements++;
    }
  });

  const afterCount = document.querySelectorAll('*').length;

  return {
    beforeCount,
    afterCount,
    removedElements,
    improvement: beforeCount > afterCount,
  };
}

// ================================
// 7. 기존 함수들 (기존 코드와의 호환성)
// ================================

function renderSimpleEquipmentMap(equipId, data) {
  console.log('❌ renderSimpleEquipmentMap 호출됨');
  console.trace('호출 스택:');

  const mapContainer = document.getElementById('map-container');
  if (!mapContainer) return;

  // 이미 D3 맵이 있으면 건드리지 않음
  const existingSvg = mapContainer.querySelector('svg');
  if (existingSvg) {
    console.log('🛡️ 기존 D3 맵 발견, renderSimpleEquipmentMap 건너뜀');
    return;
  }

  // 맵 보호 상태 확인
  const mapStatus = StateManager.get('mapStatus') || {};
  if (mapStatus.activeMapExists) {
    const timeDiff = Date.now() - (mapStatus.timestamp || 0);
    if (timeDiff < 15000) {
      // 15초 이내
      console.log('🛡️ 활성 맵 보호 상태, renderSimpleEquipmentMap 건너뜀');
      return;
    }
  }

  // 기존 로직은 그대로 두되, 맵이 없을 때만 실행
  console.log('📋 간단한 장비 맵 렌더링 실행');
  if (mapContainer) {
    mapContainer.innerHTML = `
      <div class="commonutils-simple-equipment-map">
        <h3>장비 토폴로지: ${equipId}</h3>
        <p>장비 수: ${data.equipment_list?.length || 0}개</p>
        <p>링크 수: ${data.links?.length || 0}개</p>
        <small>상세 맵 렌더링을 위해 페이지를 새로고침해주세요.</small>
      </div>
    `;
  }
}

// 기본 데이터 로딩 함수들
export function loadAlarmData() {
  return fetch('/api/get_alarm_data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ time_filter: 30 }),
  })
    .then((response) => response.json())
    .then((data) => {
      const alarmData = data.alarms || data || [];

      // StateManager에 저장
      StateManager.set('alarmData', alarmData);
      StateManager.set('totalAlarmDataList', alarmData); // 호환성용

      console.log(`📊 알람 데이터 로드: ${alarmData.length}개`);

      return alarmData;
    })
    .catch((error) => {
      console.error('알람 데이터 로드 실패:', error);
      return [];
    });
}

export function loadEquipmentData() {
  const selectedSector = getSelectedSector();
  return fetch('/api/get_equipment_data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sector: selectedSector }),
  })
    .then((response) => response.json())
    .then((data) => {
      const equipmentData = data.equipments || data || [];

      console.log(`📊 장비 데이터 로드: ${equipmentData.length}개 (분야: ${selectedSector})`);

      return Array.isArray(equipmentData) ? equipmentData : [];
    })
    .catch((error) => {
      console.error('장비 데이터 로드 실패:', error);
      return [];
    });
}

export function loadGuksaData() {
  return fetch('/api/guksa_list', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })
    .then((response) => response.json())
    .then((data) => {
      const guksaData = data || [];

      console.log(`📊 국사 데이터 로드: ${guksaData.length}개`);

      return Array.isArray(guksaData) ? guksaData : [];
    })
    .catch((error) => {
      console.error('국사 데이터 로드 실패:', error);
      return [];
    });
}

export function updateSidebarEquipmentList() {
  try {
    const alarmData = StateManager.get('alarmData') || [];
    const selectedSector = getSelectedSector();

    // 현재 선택된 분야의 경보 장비 목록 추출
    const sectorAlarms = alarmData.filter(
      (alarm) =>
        alarm && alarm.sector && alarm.sector.toLowerCase() === selectedSector.toLowerCase()
    );

    // 장비별로 그룹화
    const equipmentMap = new Map();
    sectorAlarms.forEach((alarm) => {
      const equipId = alarm.equip_id;
      const equipName = alarm.equip_name;

      if (equipId && equipName) {
        if (!equipmentMap.has(equipId)) {
          equipmentMap.set(equipId, {
            equip_id: equipId,
            equip_name: equipName,
            guksa_name: alarm.guksa_name,
            alarmCount: 0,
            validAlarmCount: 0,
          });
        }

        const equipment = equipmentMap.get(equipId);
        equipment.alarmCount++;
        if (alarm.valid_yn === 'Y') {
          equipment.validAlarmCount++;
        }
      }
    });

    // 사이드바 장비 목록 업데이트
    const equipSelect = document.getElementById('searchEquipName');
    if (equipSelect) {
      equipSelect.innerHTML = '';

      // 기본 옵션 추가
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = `전체 ${selectedSector} 장비 (${equipmentMap.size}개)`;
      equipSelect.appendChild(defaultOption);

      // 장비 목록 추가 (가나다 순 정렬)
      const sortedEquipments = Array.from(equipmentMap.values()).sort((a, b) =>
        a.equip_name.localeCompare(b.equip_name, 'ko-KR')
      );

      sortedEquipments.forEach((equipment) => {
        const option = document.createElement('option');
        option.value = equipment.equip_id;
        option.textContent = `${equipment.equip_name} (${equipment.alarmCount}건)`;
        if (equipment.validAlarmCount > 0) {
          option.textContent += ` [유효:${equipment.validAlarmCount}]`;
          option.style.color = '#e74c3c';
        }
        equipSelect.appendChild(option);
      });

      console.log(
        `📋 사이드바 장비 목록 업데이트: ${selectedSector} 분야 ${equipmentMap.size}개 장비`
      );
    }
  } catch (error) {
    console.error('사이드바 장비 목록 업데이트 실패:', error);
  }
}

export function updateAlarmTable() {
  try {
    const alarmData = StateManager.get('alarmData') || [];
    const selectedSector = getSelectedSector();

    // 현재 선택된 분야의 경보 데이터 필터링
    const sectorAlarms = alarmData.filter(
      (alarm) =>
        alarm && alarm.sector && alarm.sector.toLowerCase() === selectedSector.toLowerCase()
    );

    console.log(`📊 테이블 업데이트: ${selectedSector} 분야 ${sectorAlarms.length}개 경보`);

    // 테이블 바디 업데이트
    const tbody = document.getElementById('alarmTableBody');
    if (tbody) {
      tbody.innerHTML = '';

      if (sectorAlarms.length === 0) {
        const emptyRow = document.createElement('tr');
        emptyRow.className = 'commonutils-alarm-table-empty-row';
        emptyRow.innerHTML = `
      <td colspan="8" class="commonutils-alarm-table-empty-cell">
        ${selectedSector} 분야의 경보 데이터가 없습니다.
      </td>
    `;
        tbody.appendChild(emptyRow);
      } else {
        // 최신 경보부터 표시 (최대 100개)
        const displayAlarms = sectorAlarms
          .sort((a, b) => new Date(b.occur_datetime) - new Date(a.occur_datetime))
          .slice(0, 100);

        displayAlarms.forEach((alarm) => {
          const row = document.createElement('tr');
          row.className = 'commonutils-alarm-table-row';
          if (alarm.valid_yn === 'Y') {
            row.classList.add('valid-alarm');
          }

          row.innerHTML = `
            <td title="${alarm.guksa_name}">${alarm.guksa_name}</td>
            <td title="${alarm.sector}">${alarm.sector}</td>
            <td title="${alarm.valid_yn === 'Y' ? '유효' : '무효'}">${
            alarm.valid_yn === 'Y' ? '유효' : '무효'
          }</td>
            <td title="${alarm.occur_datetime}">${formatDateTime(alarm.occur_datetime)}</td>
            <td title="${alarm.equip_id}">${alarm.equip_id}</td>
            <td title="${alarm.equip_type}">${alarm.equip_type}</td>
            <td title="${alarm.equip_name}">${alarm.equip_name}</td>
            <td title="${alarm.alarm_message}">${alarm.alarm_message}</td>
          `;

          tbody.appendChild(row);
        });
      }
    }
  } catch (error) {
    console.error('경보 테이블 업데이트 실패:', error);
  }
}

function getSelectedSector() {
  // StateManager에서 먼저 확인
  const storedSector = StateManager.get('selectedSector');
  if (storedSector) {
    return storedSector;
  }

  // DOM에서 확인 (fallback)
  const selectedRadio = document.querySelector('input[name="sector"]:checked');
  const sector = selectedRadio ? selectedRadio.value : 'IP';

  // StateManager에 저장
  StateManager.set('selectedSector', sector);

  return sector;
}

/**
 * 분야별 장비 통계 계산 (공통 로직)
 */
export function calculateSectorEquipmentStats(alarmData, selectedSector = null) {
  if (!Array.isArray(alarmData)) {
    console.warn('유효하지 않은 알람 데이터:', typeof alarmData);
    return {};
  }

  const stats = {};
  const DEFAULT_SECTORS = ['MW', '선로', '전송', 'IP', '무선', '교환'];

  DEFAULT_SECTORS.forEach((sector) => {
    // ✅ 통일된 필터링 로직
    const sectorAlarms = alarmData.filter((alarm) => {
      if (!alarm || !alarm.sector) return false;

      // 정확한 매칭
      if (alarm.sector === sector) return true;

      // 대소문자 무시 매칭
      if (alarm.sector.toLowerCase() === sector.toLowerCase()) return true;

      // 트림 후 매칭
      if (alarm.sector.trim() === sector.trim()) return true;

      return false;
    });

    const validAlarms = sectorAlarms.filter((alarm) => alarm.valid_yn === 'Y');

    // ✅ 중복 제거를 위한 장비 그룹핑 (동일한 로직)
    const equipmentMap = new Map();
    sectorAlarms.forEach((alarm) => {
      const equipId = alarm.equip_id;
      if (equipId && alarm.equip_name) {
        if (!equipmentMap.has(equipId)) {
          equipmentMap.set(equipId, {
            equip_id: equipId,
            equip_name: alarm.equip_name,
            equip_type: alarm.equip_type || '알수없음',
            guksa_name: alarm.guksa_name || '알수없음',
            sector: alarm.sector,
            alarmCount: 0,
            validAlarmCount: 0,
          });
        }
        const equipment = equipmentMap.get(equipId);
        equipment.alarmCount++;
        if (alarm.valid_yn === 'Y') equipment.validAlarmCount++;
      }
    });

    stats[sector] = {
      totalAlarms: sectorAlarms.length,
      validAlarms: validAlarms.length,
      equipmentCount: equipmentMap.size, // ✅ 중복 제거된 장비 수
      validPercentage:
        sectorAlarms.length > 0 ? Math.round((validAlarms.length / sectorAlarms.length) * 100) : 0,
      equipmentList: Array.from(equipmentMap.values()),
    };
  });

  return stats;
}

export function handleSectorChange(selectedSector) {
  console.log(`🎯 분야 변경: ${selectedSector}`);

  // 라디오 버튼 업데이트
  const targetRadio = document.querySelector(`input[name="sector"][value="${selectedSector}"]`);
  if (targetRadio) {
    targetRadio.checked = true;
  }

  // 전역 변수 업데이트
  StateManager.set('selectedSector', selectedSector);

  // UI 업데이트
  updateSidebarEquipmentList();
  updateAlarmTable();
  updateDashboardHighlight(selectedSector);
}

function updateDashboardHighlight(selectedSector) {
  // 모든 카드에서 selected 클래스 제거
  document.querySelectorAll('.dashboard-card').forEach((card) => {
    card.classList.remove('selected');
  });

  // 선택된 분야 카드에 selected 클래스 추가
  const selectedCard = document.querySelector(`[data-sector="${selectedSector}"]`);
  if (selectedCard) {
    selectedCard.classList.add('selected');
  }
}

// ================================
// 맵 상태 관리 헬퍼 함수들
// ================================

export function setMapActiveStatus(isActive = true) {
  StateManager.set('mapStatus', {
    activeMapExists: isActive,
    timestamp: Date.now(),
  });
}

export function getMapActiveStatus() {
  const mapStatus = StateManager.get('mapStatus') || {};
  return {
    activeMapExists: mapStatus.activeMapExists || false,
    timestamp: mapStatus.timestamp || 0,
  };
}

// ================================
// 통합 네임스페이스 객체
// ================================
const commonUtils = {
  format: { formatNumber, formatDateTime, formatDateTimeForToolTip, formatDateTimeLong },
  api: { callApi, callMapApi },
  map: {
    showMapLoadingMessage,
    showMapErrorMessage,
    clearMapMessages,
    updateMapLoadingMessage,
    showMapSectorChangeMessage,
    showMapViewChangeMessage,
  },
  state: { setMapActiveStatus, getMapActiveStatus },
  performance: { checkPerformance, checkMemoryUsage, optimizeDOM },
  dom: { sortData, getDragAfterElement },

  calculateSectorEquipmentStats,
  updateSidebarEquipmentList,
  updateAlarmTable,
  handleSectorChange,

  loadAlarmData,
  loadEquipmentData,
  loadGuksaData,
  escapeHtml,
  showErrorMessage,

  // 직접 접근 가능한 주요 함수들
  formatNumber,
  formatDateTime,
  callApi,
  callMapApi,
  showMapLoadingMessage,
  showMapErrorMessage,
  clearMapMessages,
  updateMapLoadingMessage,
  showMapSectorChangeMessage,
  showMapViewChangeMessage,
  setMapActiveStatus,
  getMapActiveStatus,
};

// Default export로 네임스페이스 객체 제공
export default commonUtils;

// ================================
// 8. ES6 모듈로 사용 시 자동 실행이 필요한 경우
// ================================

// 필요한 경우 각 컴포넌트에서 개별적으로 호출:
// import CommonUtils from './utils/CommonUtils.js';
// CommonUtils.loadAlarmData().then(() => {
//   CommonUtils.updateSidebarEquipmentList();
//   CommonUtils.updateAlarmTable();
// });
