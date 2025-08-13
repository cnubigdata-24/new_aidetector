/**
 * UIManager.js - UI 렌더링 및 업데이트 전담 매니저
 */

import { stateManager as StateManager } from './StateManager.js';
import { dashboardComponent as DashboardComponent } from './DashboardComponent.js';
import { DOMBuilder } from '../utils/DOMBuilder.js';
import CommonUtils from '../utils/CommonUtils.js';
import { simpleMatch } from '../utils/StringMatcher.js';

// 설정 상수
const UI_CONFIG = {
  MAX_TABLE_ROWS: 100,
  DEFAULT_VIEW: {
    SECTOR: '전송',
  },
};

class UIManager {
  constructor() {
    // DOM 캐시 최적화
    this.domElements = {
      searchEquipName: null,
      searchGuksa: null,
      alarmTableBody: null,
      equipFilterInput: null,
      'table-search-input': null,
    };

    // FaultDashboardApp 인스턴스 참조 (이벤트 처리용)
    this.appInstance = null;

    // 한 번만 설정하는 완벽한 이벤트 위임
    this.setupDocumentEventDelegation();

    console.log('🎨 UIManager 초기화 완료');
  }

  // 완벽한 이벤트 위임 설정
  setupDocumentEventDelegation() {
    document.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-action]');
      if (!button || !this.appInstance) return;

      const action = button.dataset.action;
      e.preventDefault();
      e.stopPropagation();

      switch (action) {
        case 'filter':
          this.appInstance.performTableSearch();
          break;
        case 'reset':
          this.appInstance.resetTableFilter();
          break;
        case 'CSV':
          this.appInstance.downloadCSVFile();
          break;
        case 'clear-chat':
          this.appInstance.clearChatMessages();
          break;
        case 'rag':
          this.appInstance.openFaultDetectorPopup();
          break;
      }
    });

    // 검색 입력 필드용 키보드 이벤트
    document.addEventListener('keydown', (e) => {
      if (e.target.id === 'table-search-input' && e.key === 'Enter') {
        e.preventDefault();
        if (this.appInstance) {
          this.appInstance.performTableSearch();
        }
      }
    });
  }

  // FaultDashboardApp 인스턴스 설정
  setAppInstance(appInstance) {
    this.appInstance = appInstance;
    console.log('✅ UIManager에 FaultDashboardApp 인스턴스 설정 완료');
  }

  // ==================== DOM 요소 관리 ====================

  // DOM 요소 지연 로딩 - 필요할 때만 캐싱
  getElement(id) {
    if (!this.domElements[id]) {
      this.domElements[id] = document.getElementById(id);
    }
    return this.domElements[id];
  }

  // DOM 캐시 정리
  clearDOMCache() {
    Object.keys(this.domElements).forEach((key) => {
      this.domElements[key] = null;
    });
  }

  // ==================== UI 업데이트 통합 메서드 ====================

  // 통합된 UI 업데이트 메서드
  async updateAllUI() {
    // ✅ 최적화: StateManager의 캐싱된 통계 사용
    const alarmData = StateManager.get('totalAlarmDataList', []);

    const tasks = [
      () => DashboardComponent.renderDashboard(alarmData),
      () => DashboardComponent.updateHeaderInfo(alarmData),
      () => this.updateGuksaList(),
      () => this.updateSidebarEquipmentList(),
      () => this.updateAlarmTable(),
    ];

    // 순차 실행으로 UI 블로킹 방지
    for (const task of tasks) {
      await this.executeUITask(task);
    }
  }

  // UI 작업 실행 헬퍼
  async executeUITask(task) {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        try {
          task();
        } catch (error) {
          console.error('UI 작업 실행 실패:', error);
        }
        resolve();
      });
    });
  }

  // UI 업데이트: 국사 정보, 사이드바 장비 정보, 경보 테이블
  updateUI(alarmData) {
    // UI 업데이트
    this.updateAllUI();

    // 현재 선택된 분야 유지
    const currentSelectedSector = StateManager.get('selectedSector', UI_CONFIG.DEFAULT_VIEW.SECTOR);
    this.syncSectorSelection(currentSelectedSector);
  }

  // 뷰 버튼 업데이트
  updateViewButtons(currentMapType) {
    try {
      const equipBtn = this.getElement('equip-view-btn');
      const guksaBtn = this.getElement('guksa-view-btn');

      if (equipBtn && guksaBtn) {
        equipBtn.classList.toggle('active', currentMapType === 'equip');
        guksaBtn.classList.toggle('active', currentMapType === 'guksa');
      }
    } catch (error) {
      console.error('뷰 버튼 업데이트 실패:', error);
    }
  }

  // 분야 선택 동기화 (라디오 버튼만)
  syncSectorSelection(selectedSector) {
    try {
      // 사이드바 라디오 버튼 동기화만 처리
      const sectorRadio = document.querySelector(`input[name="sector"][value="${selectedSector}"]`);
      if (sectorRadio && !sectorRadio.checked) {
        sectorRadio.checked = true;
        console.log(`📻 사이드바 라디오 버튼 동기화: ${selectedSector}`);
      }

      console.log(`✅ 분야 선택 동기화 완료: ${selectedSector}`);
    } catch (error) {
      console.error('분야 선택 동기화 실패:', error);
    }
  }

  // UI 상태 동기화
  syncUIWithState() {
    try {
      const selectedSector = StateManager.get('selectedSector', UI_CONFIG.DEFAULT_VIEW.SECTOR);
      const sectorRadio = document.querySelector(`input[name="sector"][value="${selectedSector}"]`);
      if (sectorRadio) sectorRadio.checked = true;
    } catch (error) {
      console.error('UI 상태 동기화 실패:', error);
    }
  }

  // ==================== 사이드바 장비 목록 관리 ====================

  // 사이드바 장비 목록 업데이트
  updateSidebarEquipmentList() {
    try {
      const selectedSector = StateManager.get('selectedSector', UI_CONFIG.DEFAULT_VIEW.SECTOR);
      const selectedGuksa = StateManager.get('selectedGuksa', '');

      // 공통 메서드들 사용
      const filteredAlarms = this.filterAlarmsBySectorAndGuksa(selectedSector, selectedGuksa);
      const equipmentList = this.createEquipmentListFromAlarms(filteredAlarms);

      this.renderEquipmentSelect(equipmentList, selectedSector, selectedGuksa);
      this.setFilteredEquipmentList(equipmentList);

      console.log(`✅ 사이드바 장비 목록 업데이트 완료: ${equipmentList.length}개`);
    } catch (error) {
      console.error('사이드바 장비 목록 업데이트 실패:', error);
    }
  }

  // 장비 선택 목록 렌더링
  renderEquipmentSelect(equipmentList, selectedSector, selectedGuksa) {
    const equipSelect = this.getElement('searchEquipName');
    if (!equipSelect) return;

    equipSelect.innerHTML = '';

    // 기본 옵션 추가
    this.addDefaultEquipmentOption(equipSelect, equipmentList, selectedSector, selectedGuksa);

    // 장비 목록 추가 (이미 정렬된 상태)
    if (equipmentList.length > 0) {
      this.addEquipmentOptions(equipSelect, equipmentList);
    } else {
      this.addNoEquipmentOption(equipSelect, selectedSector);
    }
  }

  // 디폴트 장비 옵션 추가 (DOMBuilder 사용)
  addDefaultEquipmentOption(equipSelect, equipmentList, selectedSector, selectedGuksa) {
    let guksaFilter = '';
    if (selectedGuksa) {
      const guksaData = StateManager.get('guksaDataList', []);
      const selectedGuksaInfo = guksaData.find((g) => g.guksa_id == selectedGuksa);
      guksaFilter = selectedGuksaInfo ? `(${selectedGuksaInfo.guksa_name})` : '';
    }
    const option = DOMBuilder.createOption(
      '',
      `전체 ${selectedSector} 장비${guksaFilter} (${equipmentList.length}개)`
    );
    equipSelect.appendChild(option);
  }

  // 장비 옵션 추가 (DOMBuilder 사용)
  addEquipmentOptions(equipSelect, equipmentList) {
    const fragment = document.createDocumentFragment();

    equipmentList.forEach((equipment) => {
      const text = `${equipment.equip_name} (${equipment.alarmCount}건)${
        equipment.validAlarmCount > 0 ? ` [유효:${equipment.validAlarmCount}]` : ''
      }`;
      const option = DOMBuilder.createOption(equipment.equip_id, text, {
        title: `${equipment.equip_type} | ${equipment.guksa_name}`,
        styles: equipment.validAlarmCount > 0 ? { color: '#e74c3c' } : {},
      });
      fragment.appendChild(option);
    });

    equipSelect.appendChild(fragment);
  }

  // 장비 없음 옵션 추가 (DOMBuilder 사용)
  addNoEquipmentOption(equipSelect, selectedSector) {
    const option = DOMBuilder.createOption('', `${selectedSector} 분야 경보장비가 없습니다.`, {
      disabled: true,
      styles: { color: '#999' },
    });
    equipSelect.appendChild(option);
  }

  // 전역 장비 목록 업데이트
  setFilteredEquipmentList(filteredList) {
    StateManager.set('filteredEquipmentList', filteredList);
  }

  // ==================== 국사 목록 관리 ====================

  // 국사 목록 업데이트 (DOMBuilder 사용)
  updateGuksaList() {
    try {
      const guksaData = StateManager.get('guksaDataList', []);
      const guksaSelect = this.getElement('searchGuksa');

      if (!guksaSelect || !Array.isArray(guksaData)) return;

      // 현재 선택된 국사 값 백업
      const currentSelectedGuksa = guksaSelect.value;

      // 기존 옵션 제거 (첫 번째 제외)
      while (guksaSelect.children.length > 1) {
        guksaSelect.removeChild(guksaSelect.lastChild);
      }

      const sortedGuksas = this.sortGuksasByType(guksaData);
      this.addGuksaOptions(guksaSelect, sortedGuksas);

      // 기존 선택값 복원
      if (currentSelectedGuksa) {
        guksaSelect.value = currentSelectedGuksa;
        console.log(`🏢 국사 목록 업데이트 완료 (기존 선택값 유지: ${currentSelectedGuksa})`);
      } else {
        console.log(`🏢 국사 목록 업데이트 완료`);
      }
    } catch (error) {
      console.error('국사 목록 업데이트 실패:', error);
    }
  }

  // 국사 정렬 (사이드바 국사목록을 모국 기준 가나다 순 정렬)
  sortGuksasByType(guksaData) {
    const mokukGuksas = guksaData
      .filter((guksa) => guksa?.guksa_type === '모국')
      .sort((a, b) => (a.guksa_name || '').localeCompare(b.guksa_name || '', 'ko-KR'));

    const jagukGuksas = guksaData
      .filter((guksa) => guksa?.guksa_type === '자국')
      .sort((a, b) => (a.guksa_name || '').localeCompare(b.guksa_name || '', 'ko-KR'));

    return { mokukGuksas, jagukGuksas };
  }

  // 국사 옵션 버튼 추가 (DOMBuilder 사용)
  addGuksaOptions(guksaSelect, { mokukGuksas, jagukGuksas }) {
    [...mokukGuksas, ...jagukGuksas].forEach((guksa) => {
      const option = DOMBuilder.createOption(
        guksa.guksa_id,
        `${guksa.guksa_name} (${guksa.guksa_type})`
      );
      guksaSelect.appendChild(option);
    });
  }

  // ==================== 경보 테이블 관리 ====================

  // 경보 테이블 업데이트
  updateAlarmTable() {
    try {
      const filterData = this.getFilterData();
      const filteredAlarms = this.getFilteredAlarms(filterData);

      this.addTableSearchFilters();
      this.renderAlarmTableBody(
        filteredAlarms,
        filterData.selectedSector,
        filterData.selectedGuksa
      );
    } catch (error) {
      console.error('경보 테이블 업데이트 실패:', error);
    }
  }

  // 경보 테이블 본문 렌더링
  renderAlarmTableBody(filteredAlarms, selectedSector, selectedGuksa) {
    const tbody = this.getElement('alarmTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (filteredAlarms.length === 0) {
      // guksaData에서 선택된 국사 정보 찾기
      let guksaFilter = '';
      if (selectedGuksa) {
        const guksaData = StateManager.get('guksaDataList', []);
        const selectedGuksaInfo = guksaData.find((g) => g.guksa_id == selectedGuksa);
        guksaFilter = selectedGuksaInfo ? `(${selectedGuksaInfo.guksa_name})` : '';
      }

      tbody.innerHTML = `
        <tr><td colspan="8" style="text-align: center; padding: 20px; color: #666;">
          ${selectedSector} 분야${guksaFilter}의 경보 데이터가 없습니다.
        </td></tr>
      `;
    } else {
      this.addAlarmRows(tbody, filteredAlarms);
    }
  }

  // 경보 테이블 행 추가
  addAlarmRows(tbody, filteredAlarms) {
    const sortedAlarms = filteredAlarms
      .sort((a, b) => new Date(b.occur_datetime) - new Date(a.occur_datetime))
      .slice(0, UI_CONFIG.MAX_TABLE_ROWS);

    if (sortedAlarms.length === 0) {
      tbody.innerHTML = `
        <tr class="no-data-row">
          <td colspan="8" class="no-data-cell">
            <div class="no-data-content">
              <span class="no-data-icon">📋</span>
              <span class="no-data-text">경보 데이터가 없습니다</span>
            </div>
          </td>
        </tr>
      `;
    } else {
      const fragment = document.createDocumentFragment();
      sortedAlarms.forEach((alarm) => {
        const row = document.createElement('tr');
        if (alarm.valid_yn === 'Y') row.classList.add('valid-alarm');
        row.innerHTML = this.createAlarmRowHTML(alarm);
        fragment.appendChild(row);
      });
      tbody.innerHTML = '';
      tbody.appendChild(fragment);
    }
  }

  // 경보 테이블 Row HTML 생성
  createAlarmRowHTML(alarm) {
    return `
      <td title="${alarm.guksa_name}">${alarm.guksa_name}</td>
      <td title="${alarm.sector}">${alarm.sector}</td>
      <td title="${alarm.sector === '선로' || alarm.valid_yn === 'Y' ? '유효' : '무효'}">${
      alarm.sector === '선로' || alarm.valid_yn === 'Y' ? '유효' : '무효'
    }</td>
      <td title="${alarm.occur_datetime}">${CommonUtils.formatDateTime(alarm.occur_datetime)}</td>
      <td title="${CommonUtils.escapeHtml(alarm.equip_id)}">${CommonUtils.escapeHtml(
      alarm.equip_id
    )}</td>
      <td title="${CommonUtils.escapeHtml(alarm.equip_type)}">${CommonUtils.escapeHtml(
      alarm.equip_type
    )}</td>
      <td title="${CommonUtils.escapeHtml(alarm.equip_name)}">${CommonUtils.escapeHtml(
      alarm.equip_name
    )}</td>
      <td title="${CommonUtils.escapeHtml(alarm.alarm_message)}">${CommonUtils.escapeHtml(
      alarm.alarm_message
    )}</td>
    `;
  }

  // ==================== 테이블 검색 필터 UI ====================

  // 하단 경보 테이블 검색 필터 추가
  addTableSearchFilters() {
    try {
      const table = document.querySelector('.alarm-table');
      const tableContainer =
        table?.closest('.table-container') || document.querySelector('.bottom-div');

      if (!table || !tableContainer) return;

      const existingFilter = tableContainer.querySelector('.table-filter-container');
      if (existingFilter) {
        table.classList.add('loaded');
        return;
      }

      const filterHTML = this.createTableFilterHTML();

      // 필터 UI 삽입
      if (tableContainer.classList.contains('table-container')) {
        tableContainer.insertAdjacentHTML('afterbegin', filterHTML);
      } else {
        const actualTableContainer = tableContainer.querySelector('.table-container');
        if (actualTableContainer) {
          actualTableContainer.insertAdjacentHTML('afterbegin', filterHTML);
        } else {
          table.insertAdjacentHTML('beforebegin', filterHTML);
        }
      }

      table.classList.add('loaded');
    } catch (error) {
      console.error('테이블 검색 필터 추가 실패:', error);
    }
  }

  // 하단 경보 테이블 필터 UI HTML 생성
  createTableFilterHTML() {
    return `
      <div class="table-filter-container">
        <div class="filter-form">
          <div class="search-group">
            <input type="text" class="filter-input" placeholder="🔍 경보 현황 테이블 검색..." id="table-search-input">
            <button class="filter-btn" data-action="filter" style="width: 100px;">Filter</button>
            <button class="filter-btn" data-action="reset" style="width: 100px;">Reset</button>
            <button class="filter-btn" data-action="CSV" title="경보 데이터를 CSV 파일로 다운로드">Download File</button>
          </div>
          <div class="action-group">

            <!-- M/W 실시간 점검 체크박스 -->
            <label class="mw-check-label"> <input type="checkbox" id="mw-check" checked>&nbsp; M/W 실시간 점검</label>

            <button class="ai-rag-btn" data-action="rag" title="Advanced RAG 기반 장애사례 유사도 검색/조회"> RAG 유사 장애사례 조회 </button>
            
            <button class="filter-btn" data-action="clear-chat" title="채팅창의 모든 메시지를 초기화합니다">Clear Messages</button>
          </div>
        </div>
      </div>
    `;
  }

  // 필터링된 테이블 업데이트
  updateTableWithFilteredData(filteredData) {
    try {
      const tbody = this.getElement('alarmTableBody');
      if (!tbody) return;

      tbody.innerHTML = '';

      if (filteredData.length === 0) {
        tbody.innerHTML = `
          <tr><td colspan="8" style="text-align: center; padding: 20px; color: #666;">
            🔍 검색 결과가 없습니다<br>
            <small style="color: #999; font-size: 12px;">다른 키워드로 다시 검색해보세요</small>
          </td></tr>
        `;
      } else {
        this.addAlarmRows(tbody, filteredData);
      }
    } catch (error) {
      console.error('필터링된 테이블 업데이트 실패:', error);
    }
  }

  // ==================== 장비 검색 필터 UI ====================

  // 검색 필터 적용된 장비 목록 업데이트 (DOMBuilder 사용)
  updateEquipmentSelectWithFilter(filteredEquipments, searchTerm) {
    const equipSelect = this.getElement('searchEquipName');
    if (!equipSelect) return;

    equipSelect.innerHTML = '';

    // 검색 결과 헤더
    const defaultOption = DOMBuilder.createOption(
      '',
      `[검색결과] ${filteredEquipments.length}개 장비`
    );
    equipSelect.appendChild(defaultOption);

    if (filteredEquipments.length === 0) {
      this.addNoSearchResultOption(equipSelect);
    } else {
      this.addFilteredEquipmentOptions(equipSelect, filteredEquipments);
    }

    console.log(`🔍 장비 검색: "${searchTerm}" - ${filteredEquipments.length}개 결과`);
  }

  // 검색 결과 없음 옵션 추가 (DOMBuilder 사용)
  addNoSearchResultOption(equipSelect) {
    const noResultOption = DOMBuilder.createOption('', '❌ 검색 결과가 없습니다.', {
      disabled: true,
    });
    equipSelect.appendChild(noResultOption);
  }

  // 필터링된 장비 옵션 추가 (DOMBuilder 사용)
  addFilteredEquipmentOptions(equipSelect, filteredEquipments) {
    filteredEquipments.forEach((equipment) => {
      let text = `${equipment.equip_name} (${equipment.alarmCount || 0}건)`;

      if (equipment.validAlarmCount > 0) {
        text += ` [유효:${equipment.validAlarmCount}]`;
      }

      const option = DOMBuilder.createOption(equipment.equip_id, text, {
        styles: equipment.validAlarmCount > 0 ? { color: '#e74c3c' } : {},
      });

      equipSelect.appendChild(option);
    });
  }

  // ==================== 데이터 필터링 헬퍼 메서드 ====================

  // 필터 데이터 조회를 위한 전역 상태변수 설정값 조회
  getFilterData() {
    return {
      selectedSector: StateManager.get('selectedSector', UI_CONFIG.DEFAULT_VIEW.SECTOR),
      selectedGuksa: StateManager.get('selectedGuksa', ''),
      alarmData: StateManager.get('totalAlarmDataList', []),
      guksaData: StateManager.get('guksaDataList', []),
    };
  }

  // 경보 테이블 필터링
  getFilteredAlarms(filterData) {
    const { selectedSector, selectedGuksa, alarmData, guksaData } = filterData;

    // 선택된 장비가 있는지 확인
    const selectedEquipment = StateManager.get('selectedEquipment');

    console.log(
      `🔍 [getFilteredAlarms] 시작: 선택장비=${selectedEquipment}, 분야=${selectedSector}`
    );

    if (selectedEquipment) {
      // 선택된 장비가 있으면 현재 맵의 경보만 반환
      const currentMapData = StateManager.getCurrentMapData();

      console.log(
        `🗺️ [맵기반필터링] 맵데이터 존재: ${!!currentMapData}, 노드수: ${
          currentMapData?.nodes?.length || 0
        }`
      );

      if (currentMapData && currentMapData.alarms && currentMapData.alarms.length > 0) {
        console.log(
          `✅ [맵기반필터링] 성공: 선택장비=${selectedEquipment}, 맵경보=${currentMapData.alarms.length}건`
        );

        // 맵 경보 상세 로그 (처음 3개만)
        currentMapData.alarms.slice(0, 3).forEach((alarm, index) => {
          console.log(
            `   - 맵경보[${index}]: ${alarm.equip_id} | ${alarm.alarm_message?.substring(0, 50)}...`
          );
        });

        return currentMapData.alarms;
      } else {
        console.warn(`⚠️ [맵기반필터링] 실패: 맵데이터 없음 또는 경보 없음`);
        console.log(`   - currentMapData: ${!!currentMapData}`);
        console.log(`   - currentMapData.alarms: ${currentMapData?.alarms?.length || 0}건`);
        return [];
      }
    }

    // 선택된 장비가 없으면 기존 로직 유지 (분야별 필터링)
    console.log(
      `🔍 [분야기반필터링] 조건: 분야=${selectedSector}, 국사=${
        selectedGuksa || '전체'
      }, 전체데이터=${alarmData.length}건`
    );

    // 더 안전한 문자열 비교 (공백 제거 + 대소문자 통일)
    let filteredAlarms = alarmData.filter((alarm) => {
      if (!alarm || !alarm.sector) {
        console.warn('⚠️ sector 정보가 없는 경보:', alarm);
        return false;
      }

      const alarmSector = String(alarm.sector).trim().toLowerCase();
      const targetSector = String(selectedSector).trim().toLowerCase();

      return alarmSector === targetSector;
    });

    console.log(`📊 [분야기반필터링] 분야 필터링 결과: ${filteredAlarms.length}건`);

    if (selectedGuksa) {
      const selectedGuksaInfo = guksaData.find((g) => g.guksa_id == selectedGuksa);
      if (selectedGuksaInfo) {
        filteredAlarms = filteredAlarms.filter(
          (alarm) => alarm.guksa_name === selectedGuksaInfo.guksa_name
        );
        console.log(`📊 [분야기반필터링] 국사 필터링 결과: ${filteredAlarms.length}건`);
      }
    }

    return filteredAlarms;
  }

  // 1단계: 기본 장비 목록 생성 (공통 로직)
  createEquipmentListFromAlarms(alarmList) {
    const equipmentMap = new Map();

    alarmList.forEach((alarm) => {
      if (!alarm || !alarm.equip_id) return;

      // 장비 정보 수집
      if (!equipmentMap.has(alarm.equip_id)) {
        equipmentMap.set(alarm.equip_id, {
          equip_id: alarm.equip_id,
          equip_name: alarm.equip_name || alarm.equip_id,
          equip_type: alarm.equip_type,
          guksa_name: alarm.guksa_name,
          sector: alarm.sector,
          alarmCount: 0,
          validAlarmCount: 0,
        });
      }

      const equipment = equipmentMap.get(alarm.equip_id);
      equipment.alarmCount++;
      if (alarm.valid_yn === 'Y' || alarm.sector === '선로') {
        equipment.validAlarmCount++;
      }
    });

    const equipmentList = Array.from(equipmentMap.values());

    // 장비명으로 정렬
    equipmentList.sort((a, b) => (a.equip_name || '').localeCompare(b.equip_name || '', 'ko-KR'));

    return equipmentList;
  }

  // 2단계: 경보 필터링 (공통 로직)
  filterAlarmsBySectorAndGuksa(selectedSector, selectedGuksa) {
    const alarmData = StateManager.get('totalAlarmDataList', []);

    return alarmData.filter((alarm) => {
      if (!alarm || !alarm.equip_id) return false;

      // 분야 필터링
      const alarmSector = String(alarm.sector || '')
        .trim()
        .toLowerCase();
      const targetSector = String(selectedSector || '')
        .trim()
        .toLowerCase();
      if (alarmSector !== targetSector) return false;

      // 국사 필터링
      if (selectedGuksa) {
        const guksaData = StateManager.get('guksaDataList', []);
        const selectedGuksaInfo = guksaData.find((g) => g.guksa_id == selectedGuksa);
        if (selectedGuksaInfo && alarm.guksa_name !== selectedGuksaInfo.guksa_name) return false;
      }

      return true;
    });
  }

  // 3단계: 검색 필터링 (공통 로직)
  filterAlarmsBySearch(alarmList, searchTerm) {
    if (!searchTerm) return alarmList;

    return alarmList.filter((alarm) => {
      const searchText = [
        alarm.equip_id,
        alarm.equip_name,
        alarm.equip_type,
        alarm.alarm_message,
        alarm.guksa_name,
      ]
        .filter((field) => field)
        .map((field) => String(field))
        .join(' ');

      return simpleMatch?.(searchText, searchTerm);
    });
  }

  // ==================== 메모리 정리 ====================

  destroy() {
    this.clearDOMCache();
    console.log('🧹 UIManager 메모리 정리 완료');
  }
}

// 싱글톤 인스턴스 생성 및 내보내기
export const uiManager = new UIManager();
export default UIManager;
