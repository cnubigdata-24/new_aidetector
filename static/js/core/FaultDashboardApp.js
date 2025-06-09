/**
 * FaultDashboardApp 리팩토링 버전
 */

// 싱글톤
import { guksaMapComponent } from './GuksaMapComponent.js';
import { tooltipManager as TooltipManager } from '../utils/TooltipManager.js';
import { colorManager as ColorManager } from '../utils/ColorManager.js';
import { stateManager as StateManager } from './StateManager.js';
import { dashboardComponent as DashboardComponent } from './DashboardComponent.js';
import { simpleMatch, advancedMatch } from '../utils/StringMatcher.js';

import { failurePointManager } from './FailurePointManager.js';

// 클래스와 함수
import CommonUtils from '../utils/CommonUtils.js';
import MessageManager from '../utils/MessageManager.js';
import EquipmentMapComponent from './EquipmentMapComponent.js';

// 설정 상수
const CONFIG = {
  API_ENDPOINTS: {
    ALARM_DATA: '/api/get_alarm_data',
    EQUIPMENT_DATA: '/api/get_equipment_data',
    GUKSA_LIST: '/api/guksa_list',
  },
  DEFAULT_VIEW: {
    SECTOR: 'IP',
    MAP_TYPE: 'equip',
    TIME_FILTER: '30',
  },
  MAP_TYPES: {
    EQUIPMENT: 'equip',
    GUKSA: 'guksa',
  },
  MAX_TABLE_ROWS: 100,
  SECTOR_CHANGE_DELAY: 20,
};

export class FaultDashboardApp {
  // 생성자
  constructor() {
    // 데이터 캐시 초기화
    this.dataCache = new Map();
    this.isInitialized = false;
    this.equipmentMapComponent = null;
    this._keyboardHandlersAttached = false; // 키보드 핸들러 중복 방지 플래그

    // 메서드 바인딩
    this.bindEventHandlers();

    this.domCache = new Map();
    this.setupDOMCache();

    console.log('🏠 FaultDashboardApp 생성자 완료');
  }
  //DOM 쿼리 캐싱 최적화
  setupDOMCache() {
    const selectors = [
      'searchEquipName',
      'searchGuksa',
      'alarmTableBody',
      'table-search-input',
      'equipFilterInput',
      'chat-messages-area',
    ];

    selectors.forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        this.domCache.set(id, element);
      }
    });
  }

  getCachedElement(id) {
    return this.domCache.get(id) || document.getElementById(id);
  }

  bindEventHandlers() {
    this.handleSectorChange = this.debounce(this.handleSectorChange.bind(this), 150);
    this.handleViewToggle = this.handleViewToggle.bind(this);
    this.handleFaultAnalysis = this.handleFaultAnalysis.bind(this);
    this.handleEquipmentFilter = this.handleEquipmentFilter.bind(this);
    this.handleEquipmentFilterReset = this.handleEquipmentFilterReset.bind(this);
    this.handleGuksaChange = this.handleGuksaChange.bind(this);
    this.handleEquipmentSelect = this.handleEquipmentSelect.bind(this);
  }

  // 디바운싱 유틸리티
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func.apply(this, args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  createStandardButton(config) {
    const button = document.createElement('button');
    button.className = config.className || 'standard-btn';
    button.textContent = config.text;

    if (config.width) button.style.width = config.width;
    if (config.title) button.title = config.title;
    if (config.styles) Object.assign(button.style, config.styles);

    return button;
  }

  attachStandardButtonEvents(button, handler) {
    button.addEventListener('keydown', (e) => e.stopPropagation());
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      handler.call(this);
    });
  }

  async initialize() {
    try {
      console.log('🔧 FaultDashboardApp 초기화 시작...');

      await this.setupApp();
      this.isInitialized = true;

      this.showInitializationSuccess();
      console.log('✅ FaultDashboardApp 초기화 완료');
    } catch (error) {
      this.handleError('초기화 실패', error);
    }
  }

  async setupApp() {
    this.setupUIElements();
    this.setupEventListeners();
    this.setupStateListeners();
    this.setupInitialState();
    await this.loadInitialData();
  }

  // 뷰 버튼 업데이트 (equip, guksa)
  setupUIElements() {
    this.updateViewButtons();
    console.log('🎨 UI 요소 설정 완료');
  }

  // 이벤트 리스너 설정 (버튼, 키보드, 경보 테이블)
  setupEventListeners() {
    if (this.eventListenersAttached) {
      console.log('⚠️ 이벤트 리스너가 이미 등록되어 있습니다.');
      return;
    }

    try {
      this.attachBasicEventListenersExceptDashboard(); // 대시보드 카드 제외하고 등록
      this.attachTableEvents();
      this.setupKeyboardHandlers();
      this.eventListenersAttached = true;
      console.log('🎧 이벤트 리스너 설정 완료 (대시보드 카드 제외)');
    } catch (error) {
      console.error('❌ 이벤트 리스너 설정 실패:', error);
    }
  }

  // 상태 변경 감지 리스너 설정
  setupStateListeners() {
    StateManager.on('selectedSector', (data) => {
      const { value: selectedSector, oldValue: previousSector, source } = data;

      if (selectedSector === previousSector) {
        return; // 동일한 분야로의 변경은 무시
      }

      console.log(
        `[State Listener] 분야 변경 감지: ${previousSector} -> ${selectedSector} (source: ${source})`
      );

      this.currentSelectedSector = selectedSector;

      // UI와 데이터 동기화
      this.syncSectorSelection(selectedSector);

      if (typeof CommonUtils?.showMapSectorChangeMessage === 'function') {
        CommonUtils.showMapSectorChangeMessage(selectedSector);
      }

      setTimeout(() => this.updateDataAfterSectorChange(), CONFIG.SECTOR_CHANGE_DELAY);
    });
  }

  // 기본 이벤트 리스너 추가 (대시보드 카드 제외)
  attachBasicEventListenersExceptDashboard() {
    // 이벤트 위임으로 한 번에 처리 - passive 옵션 제거
    document.addEventListener('click', this.handleDocumentClick.bind(this));
    document.addEventListener('change', this.handleDocumentChange.bind(this));

    console.log('🎧 이벤트 위임 설정 완료');
  }

  // 새로 추가할 메서드들
  handleDocumentClick(event) {
    const target = event.target;

    // 햄버거 버튼
    if (target.closest('.hamburger-btn')) {
      this.toggleSidebar();
      return;
    }

    // 뷰 토글 버튼
    if (target.id === 'equip-view-btn') {
      event.preventDefault();
      this.handleViewToggle('equip');
      return;
    }

    if (target.id === 'guksa-view-btn') {
      event.preventDefault();
      this.handleViewToggle('guksa');
      return;
    }

    // 장애점 찾기 버튼
    if (target.id === 'fault-point-btn') {
      event.preventDefault();
      this.handleFaultAnalysis();
      return;
    }

    // 필터 버튼들
    if (target.id === 'equipFilterBtn') {
      this.handleEquipmentFilter();
      return;
    }

    if (target.id === 'equipResetBtn') {
      this.handleEquipmentFilterReset();
      return;
    }
  }

  handleDocumentChange(event) {
    const target = event.target;

    // 분야 라디오 버튼
    if (target.name === 'sector') {
      this.handleSectorChange(event);
      return;
    }

    // 국사 선택
    if (target.id === 'searchGuksa') {
      this.handleGuksaChange(event);
      return;
    }

    // 장비 선택
    if (target.id === 'searchEquipName') {
      this.handleEquipmentSelect(event);
      return;
    }
  }

  // 전역 상태값 설정 (선택된 분야, 선택된 뷰 모드)
  setupInitialState() {
    try {
      StateManager.setState({
        selectedSector: CONFIG.DEFAULT_VIEW.SECTOR,
        selectedView: CONFIG.DEFAULT_VIEW.MAP_TYPE,
        timeFilter: CONFIG.DEFAULT_VIEW.TIME_FILTER,
        selectedGuksa: '',
      });

      this.syncUIWithState();
      console.log('🎯 초기 상태 설정 완료');
    } catch (error) {
      console.error('❌ 초기 상태 설정 실패:', error);
    }
  }

  // 상단 대시보드 카드 클릭 이벤트 추가
  attachDashboardCardEvents() {
    // DashboardComponent가 자체적으로 이벤트 리스너를 등록하고,
    // 여기서 발생한 클릭 이벤트를 StateManager를 통해 전달하도록 역할이 분리되었습니다.
    // 따라서 FaultDashboardApp에서는 더 이상 이벤트 리스너를 중복으로 등록하지 않습니다.
    console.log('ℹ️ 대시보드 카드 이벤트 처리는 DashboardComponent에서 위임받아 처리합니다.');
  }

  // 경보 테이블 관련 이벤트들을 한 곳에서 관리
  attachTableEvents() {
    const tableContainer = document.querySelector('.table-container');
    if (tableContainer) {
      tableContainer.addEventListener('click', () => tableContainer.focus());
      tableContainer.addEventListener('keydown', (event) => {
        this.handleTableKeyboardNavigation(event);
      });

      // 테이블 행 클릭 이벤트 위임 추가
      tableContainer.addEventListener('click', (event) => {
        const row = event.target.closest('tr');
        if (row && row.parentElement.id === 'alarmTableBody') {
          this.handleTableRowClick(row);
        }
      });
    }
  }

  // 사이드바 이벤트 리스너 추가 (국사 변경, 장비 선택)
  attachDropdownEvents() {
    const guksaSelect = document.getElementById('searchGuksa');
    const equipSelect = document.getElementById('searchEquipName');

    guksaSelect?.addEventListener('change', this.handleGuksaChange);
    equipSelect?.addEventListener('change', this.handleEquipmentSelect);
  }

  // 상단 메뉴 뷰 모드 토글 이벤트 리스너 추가
  attachViewToggleEvents() {
    const buttons = [
      { id: 'equip-view-btn', type: CONFIG.MAP_TYPES.EQUIPMENT },
      { id: 'guksa-view-btn', type: CONFIG.MAP_TYPES.GUKSA },
      { id: 'fault-point-btn', handler: this.handleFaultAnalysis }, // 장애점 찾기 버튼 (사이드바)
    ];

    buttons.forEach(({ id, type, handler }) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.preventDefault(); // <a> 태그일 경우 기본 링크 이동 방지
          (handler || (() => this.handleViewToggle(type)))();
        });
      }
    });
  }

  // 키보드 이벤트 핸들러 설정
  setupKeyboardHandlers() {
    if (this._keyboardHandlersAttached) {
      return;
    }

    // 이벤트 위임 방식으로 변경
    document.addEventListener('keydown', this.handleGlobalKeydown.bind(this), { passive: false });

    this._keyboardHandlersAttached = true;
    console.log('🎹 최적화된 키보드 핸들러 설정 완료');
  }

  handleGlobalKeydown(event) {
    const target = event.target;
    const targetId = target.id;

    switch (targetId) {
      case 'searchEquipName':
        this.handleEquipmentListNavigation(event);
        break;
      case 'equipFilterInput':
        // 엔터키 처리 추가
        if (event.key === 'Enter') {
          event.preventDefault();
          this.handleEquipmentFilter();
        }
        this.preventPropagation(event);
        break;
      case 'searchGuksa':
      case 'timeFilter':
        this.preventPropagation(event);
        break;
      case 'chat-input':
        this.handleChatInput(event);
        break;
    }
  }

  // 이벤트 전파 방지
  preventPropagation(event) {
    event.stopPropagation();
  }

  // 챗봇 입력 이벤트 핸들러
  handleChatInput(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      document.getElementById('chat-send-btn')?.click();
    }
    event.stopPropagation();
  }

  // 사이드바 장비 필터 이벤트 설정 (키 입력, 클릭)
  setupEquipmentFilterEvents() {
    // 이미 설정되었다면 리턴
    if (this._filterEventsAttached) return;

    const elements = [
      { id: 'equipFilterInput', event: 'keypress', handler: this.handleFilterKeyPress },
      { id: 'equipFilterBtn', event: 'click', handler: this.handleEquipmentFilter },
      { id: 'equipResetBtn', event: 'click', handler: this.handleEquipmentFilterReset },
    ];

    elements.forEach(({ id, event, handler }) => {
      const element = document.getElementById(id);
      if (element) {
        // DOM 조작 없이 직접 리스너만 등록
        element.addEventListener(event, handler.bind(this), { passive: true });
      }
    });

    this._filterEventsAttached = true;
    console.log('🔧 장비 필터 이벤트 설정 완료');
  }

  // 장비 필터 키 입력 이벤트 핸들러
  handleFilterKeyPress(event) {
    if (event.key === 'Enter') {
      this.handleEquipmentFilter();
    }
  }

  // 초기 데이터 로드 (경보, 장비, 국사)
  async loadInitialData() {
    try {
      const dataLoaders = [
        { name: '전체 경보', loader: () => this.loadAlarmData() },
        { name: '장비 목록', loader: () => this.loadEquipmentData() },
        { name: '국사 목록', loader: () => this.loadGuksaData() },
      ];

      const results = await this.executeDataLoaders(dataLoaders);
      const [alarmData, equipmentData, guksaData] = results;

      this.updateDataCache({ alarmData, equipmentData, guksaData });
      this.updateStateManager(alarmData, equipmentData, guksaData);
      this.updateUI(alarmData);

      MessageManager.addSuccessMessage('✅ 분야별 전체 최신 경보 데이터 수집을 완료했습니다.');
    } catch (error) {
      this.handleError('초기 기본 데이터 로드 실패', error);
    }
  }

  // 실제 데이터 로드 실행 (데이터 로딩 스트리밍 최적화)
  async executeDataLoaders(dataLoaders) {
    const results = [];

    // 순차 로딩으로 메모리 사용량 분산
    for (const { name, loader } of dataLoaders) {
      try {
        console.log(`${name} 로딩 시작...`);

        const data = await loader();
        results.push(data || []);

        // 데이터 로딩 즉시 해당 UI만 업데이트 (점진적 로딩)
        this.updateUIImmediately(name, data);

        console.log(`✅ ${name} 완료: ${data?.length || 0}개`);

        // 브라우저에게 제어권 양보 (UI 반응성 유지)
        await new Promise((resolve) => setTimeout(resolve, 0));
      } catch (error) {
        console.error(`❌ ${name} 실패:`, error);
        results.push([]);
      }
    }

    return results;
  }

  updateUIImmediately(dataType, data) {
    requestAnimationFrame(() => {
      switch (dataType) {
        case '전체 경보':
          // 헤더 정보만 즉시 업데이트
          DashboardComponent.updateHeaderInfo(data);
          break;
        case '장비 목록':
          // 사이드바만 즉시 업데이트
          this.updateSidebarEquipmentList();
          break;
        case '국사 목록':
          // 국사 드롭다운만 즉시 업데이트
          this.updateGuksaList();
          break;
      }
    });
  }

  // 전역 상태 관리자 변수 업데이트
  updateStateManager(alarmData, equipmentData, guksaData) {
    StateManager.setAlarmData(alarmData);
    StateManager.setEquipmentData(equipmentData);
    StateManager.set('guksaDataList', guksaData);
  }

  // UI 업데이트 (국사 정보, 사이드바 장비 정보, 경보 테이블, 디폴트 분야 Sector 선택)
  updateUI(alarmData) {
    // 순차적 업데이트를 비동기로 처리하여 UI 블로킹 방지
    this.updateUIAsync(() => {
      DashboardComponent.renderDashboard(alarmData);
      DashboardComponent.updateHeaderInfo(alarmData);

      // 대시보드가 렌더링된 후에 이벤트 리스너 등록
      this.attachDashboardCardEvents();
    });

    this.updateUIAsync(() => {
      this.updateGuksaList();
    });

    this.updateUIAsync(() => {
      this.updateSidebarEquipmentList();
    });

    this.updateUIAsync(() => {
      this.updateAlarmTable();
      this.syncSectorSelection(CONFIG.DEFAULT_VIEW.SECTOR);
    });
  }

  // 경보 데이터 로드
  async loadAlarmData() {
    const timeFilter = StateManager.get('timeFilter', CONFIG.DEFAULT_VIEW.TIME_FILTER);
    const response = await CommonUtils.callApi(CONFIG.API_ENDPOINTS.ALARM_DATA, {
      time_filter: timeFilter,
    });

    return this.validateArrayData(response?.alarms || response, '알람');
  }

  // 장비 데이터 로드
  async loadEquipmentData() {
    const selectedSector = StateManager.get('selectedSector', CONFIG.DEFAULT_VIEW.SECTOR);
    const response = await CommonUtils.callApi(CONFIG.API_ENDPOINTS.EQUIPMENT_DATA, {
      sector: selectedSector,
    });

    return this.validateArrayData(response?.equipments || response, '장비');
  }

  // 국사 데이터 로드
  async loadGuksaData() {
    const response = await CommonUtils.callApi(CONFIG.API_ENDPOINTS.GUKSA_LIST);
    return this.validateArrayData(response, '국사');
  }

  // 데이터 유효성 검사
  validateArrayData(data, dataType) {
    if (!Array.isArray(data)) {
      console.warn(`${dataType} 데이터가 배열이 아닙니다:`, typeof data, data);
      return [];
    }
    return data;
  }

  // 데이터 캐시 업데이트
  updateDataCache(newData) {
    Object.entries(newData).forEach(([key, value]) => {
      this.dataCache.set(key, value);
    });
    this.dataCache.set('lastUpdate', new Date());
  }

  // 분야 Sector 변경 이벤트 핸들러 (사이드바 라디오 버튼용)
  async handleSectorChange(event) {
    try {
      const selectedSector = event.target.value;
      const previousSector = StateManager.get('selectedSector');

      if (selectedSector === previousSector) {
        return; // 중복 클릭 방지
      }

      // 상태 변경을 StateManager에 위임합니다.
      // StateManager 리스너가 모든 후속 작업을 처리합니다.
      StateManager.setSelectedSector(selectedSector, { source: 'sidebar-radio' });
    } catch (error) {
      this.handleError('사이드바 분야 변경 처리 실패', error);
    }
  }

  // 분야 Sector 변경 실행
  async performSectorChange(selectedSector, previousSector) {
    requestAnimationFrame(() => this.syncSectorSelection(selectedSector));

    // 데이터 업데이트 (지연 실행)
    setTimeout(() => this.updateDataAfterSectorChange(), CONFIG.SECTOR_CHANGE_DELAY);

    // 장비 필터 입력 초기화
    const equipFilterInput = document.getElementById('equipFilterInput');
    if (equipFilterInput) {
      equipFilterInput.value = '';
    }
  }

  // syncSectorSelection 메서드 수정 - 청킹 처리 추가
  syncSectorSelection(selectedSector) {
    try {
      // 라디오 버튼은 즉시 처리 (단일 요소)
      const sectorRadio = document.querySelector(`input[name="sector"][value="${selectedSector}"]`);
      if (sectorRadio && !sectorRadio.checked) {
        sectorRadio.checked = true;
      }

      // 🔧 대시보드 박스들은 청킹 처리로 비동기 업데이트
      const dashboardBoxes = document.querySelectorAll('.dashboard-box');
      this.updateDashboardBoxesAsync(dashboardBoxes, selectedSector);

      console.log(`🔄 분야 선택 동기화 시작: ${selectedSector}`);
    } catch (error) {
      console.error('분야 선택 동기화 실패:', error);
    }
  }

  // 분야 sector 변경 시 대시보드 박스 비동기 업데이트
  updateDashboardBoxesAsync(boxes, selectedSector) {
    const CHUNK_SIZE = 5; // 한 번에 5개씩 처리
    let index = 0;

    const processChunk = () => {
      const endIndex = Math.min(index + CHUNK_SIZE, boxes.length);

      for (let i = index; i < endIndex; i++) {
        const box = boxes[i];
        box.classList.remove('selected');
        const boxTitle = box.querySelector('h3')?.textContent?.trim();
        if (boxTitle === selectedSector) {
          box.classList.add('selected');
        }
      }

      index = endIndex;

      if (index < boxes.length) {
        // 다음 청크를 다음 프레임에서 처리
        requestAnimationFrame(processChunk);
      } else {
        console.log(`✅ 분야 선택 동기화 완료: ${selectedSector}`);
      }
    };

    if (boxes.length > 0) {
      requestAnimationFrame(processChunk);
    }
  }

  // 분야 Sector 변경 후 데이터 업데이트 (사이드바 장비 목록, 경보 테이블)
  updateDataAfterSectorChange() {
    // 순차적 업데이트를 비동기로 처리
    this.updateUIAsync(() => {
      this.updateSidebarEquipmentList();
    });

    this.updateUIAsync(() => {
      this.updateAlarmTable();
    });
  }

  // 맵 로딩 상태 설정
  setMapLoadingState(selectedSector) {
    this.mapLoadingState = {
      isLoading: true,
      message: selectedSector
        ? `${selectedSector} 분야로 전환 중...`
        : '맵을 초기화하고 있습니다...',
    };
  }

  // 분야 변경 UI 표시
  showSectorChangeUI(selectedSector) {
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer) return;

    mapContainer.innerHTML = this.generateSectorChangeHTML(selectedSector);
  }

  // 분야 변경 UI 생성
  generateSectorChangeHTML(selectedSector) {
    return `
      <div class="sector-change-overlay">
        <div class="change-content">
          <div class="sector-icon">
            <span class="sector-icon-text">🔄</span>
          </div>
          <div class="change-title">분야 변경 완료</div>
          <div class="change-message">${selectedSector || '기본'} 분야</div>
          <div class="change-instruction">
            좌측에서 장비를 선택하거나<br>
            아래 테이블에서 장비를 클릭하면<br>
            NW 토폴로지가 표시됩니다.
          </div>
          <div class="ready-badge">
            ✨ ${selectedSector} 분야 준비 완료
          </div>
        </div>
        <div class="change-animation"></div>
      </div>
    `;
  }

  // 맵 인스턴스 정리, 초기화
  cleanupMapInstance() {
    try {
      if (this.equipMapComponent) {
        this.equipMapComponent.destroy();
        this.equipMapComponent = null;
      }

      // StateManager의 맵 상태도 초기화
      StateManager.setCurrentMapData([], [], null, []);

      const mapContainer = document.getElementById('map-container');
      if (mapContainer) {
        mapContainer.innerHTML = '';
      }
    } catch (error) {
      console.error('맵 인스턴스 정리 중 오류:', error);
    }
  }

  // 맵 인스턴스 정리, 초기화
  async createAndRenderMap(equipId) {
    try {
      // 기존 인스턴스 정리
      this.cleanupMapInstance();

      // 새 인스턴스 생성 및 렌더링
      this.equipMapComponent = new EquipmentMapComponent('map-container');

      const alarmData = StateManager.get('totalAlarmDataList', []);
      const equipmentData = StateManager.get('allEquipmentList', []);

      await this.equipMapComponent.renderEquipmentTopology(equipId, equipmentData, [], {
        showProgress: true,
        showAllSectors: true,
      });

      // 맵 생성 완료 후 StateManager에 맵 상태 업데이트
      if (this.equipMapComponent?.nodes) {
        console.log(`✅ 맵 생성 성공: ${equipId} (노드 ${this.equipMapComponent.nodes.length}개)`);

        // baseNode 찾기 (개선된 로직)
        // 1차: 실제 생성된 노드 중에서 equipId와 정확 매칭
        let baseNode = this.equipMapComponent.nodes.find(
          (node) => String(node.equip_id || node.id || '').trim() === String(equipId).trim()
        );

        // 2차: 정확 매칭 실패 시 포함 매칭
        if (!baseNode) {
          baseNode = this.equipMapComponent.nodes.find((node) => {
            const nodeId = String(node.equip_id || node.id || '').trim();
            return (
              nodeId.includes(String(equipId).trim()) || String(equipId).trim().includes(nodeId)
            );
          });
        }

        // 3차: 마지막으로 equipmentData에서 찾기
        if (!baseNode) {
          const equipData = equipmentData.find(
            (equip) => String(equip.equip_id).trim() === String(equipId).trim()
          );
          if (equipData) {
            console.log(`🔍 baseNode를 equipmentData에서 찾음: ${equipData.equip_name}`);
            baseNode = equipData;
          }
        }

        if (baseNode) {
          console.log(
            `✅ baseNode 설정 성공: ${baseNode.equip_name || baseNode.name || baseNode.equip_id}`
          );
        } else {
          console.warn(`⚠️ baseNode를 찾을 수 없음: equipId=${equipId}`);
          console.log(
            `📋 생성된 노드 ID 목록:`,
            this.equipMapComponent.nodes.map((n) => n.equip_id || n.id)
          );
        }

        // StateManager에 enriched된 맵 데이터 전달
        StateManager.setCurrentMapData(
          this.equipMapComponent.nodes,
          this.equipMapComponent.links,
          baseNode || null,
          []
        );
      } else {
        console.warn('⚠️ 맵 노드 생성 실패 - 상태 초기화');
        StateManager.setCurrentMapData([], [], null, []);
      }
    } catch (error) {
      console.error(`❌ 맵 생성 실패 (${equipId}):`, error);
      this.handleMapError(equipId, error);
    }
  }

  // 장비 토폴로지 로드 실패 처리
  handleMapError(equipId, error) {
    console.error(`NW 토폴로지 로드 실패 (${equipId}):`, error);

    // 에러 시 인스턴스 정리
    this.cleanupMapInstance();

    CommonUtils.showMapErrorMessage?.(`NW 토폴로지 로드에 실패했습니다.<br> ${error.message}`);
  }

  // UI 업데이트 메서드들 최적화
  updateSidebarEquipmentList() {
    try {
      const filterData = this.getFilterData();
      const stats = CommonUtils.calculateSectorEquipmentStats?.(filterData.alarmData) || {};
      const filteredList = this.getFilteredEquipmentList(stats, filterData);

      this.renderEquipmentSelect(filteredList, filterData.selectedSector, filterData.selectedGuksa);
      this.setFilteredEquipmentList(filteredList);

      console.log(`✅ 사이드바 장비 목록 업데이트 완료: ${filteredList.length}개`);
    } catch (error) {
      this.handleError('사이드바 장비 목록 업데이트 실패', error);
    }
  }

  // 필터 데이터 조회를 위한 전역 상태변수 설정값 조회
  getFilterData() {
    return {
      selectedSector: StateManager.get('selectedSector', CONFIG.DEFAULT_VIEW.SECTOR),
      selectedGuksa: StateManager.get('selectedGuksa', ''),
      alarmData: StateManager.get('totalAlarmDataList', []),
      guksaData: StateManager.get('guksaDataList', []),
    };
  }

  // 필터 데이터 기반 장비 목록 필터링
  getFilteredEquipmentList(stats, filterData) {
    const { selectedSector, selectedGuksa, guksaData } = filterData;
    let equipmentList = stats[selectedSector]?.equipmentList || [];

    if (selectedGuksa) {
      const selectedGuksaInfo = guksaData.find((g) => g.guksa_id == selectedGuksa);
      if (selectedGuksaInfo) {
        equipmentList = equipmentList.filter(
          (equipment) => equipment.guksa_name === selectedGuksaInfo.guksa_name
        );
      }
    }

    return equipmentList;
  }

  // 장비 선택 목록 렌더링
  renderEquipmentSelect(equipmentList, selectedSector, selectedGuksa) {
    const equipSelect = this.getCachedElement('searchEquipName');
    if (!equipSelect) return;

    equipSelect.innerHTML = '';

    // 기본 옵션 추가
    this.addDefaultEquipmentOption(equipSelect, equipmentList, selectedSector, selectedGuksa);

    // 장비 목록 추가
    if (equipmentList.length > 0) {
      this.addEquipmentOptions(equipSelect, equipmentList);
    } else {
      this.addNoEquipmentOption(equipSelect, selectedSector);
    }
  }

  // 디폴트 장비 옵션 추가
  addDefaultEquipmentOption(equipSelect, equipmentList, selectedSector, selectedGuksa) {
    const guksaFilter = selectedGuksa ? ' (선택된 국사)' : '';
    const option = this.createSelectOption(
      '',
      `전체 ${selectedSector} 장비${guksaFilter} (${equipmentList.length}개)`
    );
    equipSelect.appendChild(option);
  }

  createSelectOption(value, text, options = {}) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    if (options.title) option.title = options.title;
    if (options.disabled) option.disabled = options.disabled;
    if (options.styles) Object.assign(option.style, options.styles);
    return option;
  }

  // 장비 옵션 추가
  addEquipmentOptions(equipSelect, equipmentList) {
    const fragment = document.createDocumentFragment();

    equipmentList
      .sort((a, b) =>
        a.equip_name.localeCompare(b.equip_name, 'ko-KR', { numeric: true, sensitivity: 'base' })
      )
      .forEach((equipment) => {
        const text = `${equipment.equip_name} (${equipment.alarmCount}건)${
          equipment.validAlarmCount > 0 ? ` [유효:${equipment.validAlarmCount}]` : ''
        }`;
        const option = this.createSelectOption(equipment.equip_id, text, {
          title: `${equipment.equip_type} | ${equipment.guksa_name}`,
          styles: equipment.validAlarmCount > 0 ? { color: '#e74c3c' } : {},
        });
        fragment.appendChild(option);
      });

    equipSelect.appendChild(fragment); // 한번만 리플로우
  }

  // 장비 없음 옵션 추가
  addNoEquipmentOption(equipSelect, selectedSector) {
    const noEquipOption = document.createElement('option');
    noEquipOption.value = '';
    noEquipOption.textContent = `${selectedSector} 분야에 경보 발생 장비가 없습니다.`;
    noEquipOption.disabled = true;
    noEquipOption.style.color = '#999';
    equipSelect.appendChild(noEquipOption);
  }

  // 전역 장비 목록 업데이트
  setFilteredEquipmentList(filteredList) {
    StateManager.set('filteredEquipmentList', filteredList);
  }

  // 공통 에러 처리
  handleError(message, error) {
    console.error(`❌ ${message}:`, error);
    MessageManager.addErrorMessage?.(`📌 ${message}: ${error.message}`, { type: 'error' });
  }

  // 초기화 성공 메시지 표시
  showInitializationSuccess() {
    MessageManager.addMessage?.(
      '✅ AI Detector 시스템을 성공적으로 로드했습니다.<br><br>' +
        '• 모든 모듈을 안정적으로 로드했습니다.<br>' +
        '• 실시간 데이터 동기화를 완료했습니다.',
      { type: 'success' }
    );
  }

  // 기타 필수 메서드들
  setupStateListeners() {
    StateManager.on('selectedSector', (data) => {
      const { value: selectedSector, oldValue: previousSector, source } = data;

      if (selectedSector === previousSector) {
        return;
      }

      console.log(
        `[State Listener] 분야 변경 감지: ${previousSector} -> ${selectedSector} (source: ${source})`
      );

      this.currentSelectedSector = selectedSector;

      // 🔧 모든 UI 업데이트를 비동기로 처리
      requestAnimationFrame(() => {
        this.syncSectorSelection(selectedSector);

        if (typeof CommonUtils?.showMapSectorChangeMessage === 'function') {
          CommonUtils.showMapSectorChangeMessage(selectedSector);
        }
      });

      setTimeout(() => this.updateDataAfterSectorChange(), CONFIG.SECTOR_CHANGE_DELAY);
    });
  }

  // 국사 목록 업데이트
  updateGuksaList() {
    try {
      const guksaData = StateManager.get('guksaDataList', []);
      const guksaSelect = document.getElementById('searchGuksa');

      if (!guksaSelect || !Array.isArray(guksaData)) return;

      // 기존 옵션 제거 (첫 번째 제외)
      while (guksaSelect.children.length > 1) {
        guksaSelect.removeChild(guksaSelect.lastChild);
      }

      const sortedGuksas = this.sortGuksasByType(guksaData);
      this.addGuksaOptions(guksaSelect, sortedGuksas);

      console.log(`🏢 국사 목록 업데이트 완료`);
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

  // 국사 옵션 버튼 추가
  addGuksaOptions(guksaSelect, { mokukGuksas, jagukGuksas }) {
    [...mokukGuksas, ...jagukGuksas].forEach((guksa) => {
      const option = document.createElement('option');
      option.value = guksa.guksa_id;
      option.textContent = `${guksa.guksa_name} (${guksa.guksa_type})`;
      guksaSelect.appendChild(option);
    });
  }

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

  // 경보 테이블 필터링
  getFilteredAlarms(filterData) {
    const { selectedSector, selectedGuksa, alarmData, guksaData } = filterData;

    let filteredAlarms = alarmData.filter(
      (alarm) => alarm?.sector?.toLowerCase() === selectedSector.toLowerCase()
    );

    if (selectedGuksa) {
      const selectedGuksaInfo = guksaData.find((g) => g.guksa_id == selectedGuksa);
      if (selectedGuksaInfo) {
        filteredAlarms = filteredAlarms.filter(
          (alarm) => alarm.guksa_name === selectedGuksaInfo.guksa_name
        );
      }
    }

    return filteredAlarms;
  }

  // 경보 테이블 본문 렌더링
  renderAlarmTableBody(filteredAlarms, selectedSector, selectedGuksa) {
    const tbody = document.getElementById('alarmTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (filteredAlarms.length === 0) {
      const guksaFilter = selectedGuksa ? ' (선택된 국사)' : '';
      tbody.innerHTML = `
        <tr><td colspan="8" style="text-align: center; padding: 20px; color: #666;">
          ${selectedSector} 분야${guksaFilter}의 경보 데이터가 없습니다.
        </td></tr>
      `;
    } else {
      this.addAlarmRows(tbody, filteredAlarms);
    }
  }

  // 경보 테이블 Row 동적 추가, 렌더링
  async addAlarmRows(tbody, filteredAlarms) {
    const sortedAlarms = filteredAlarms
      .sort((a, b) => new Date(b.occur_datetime) - new Date(a.occur_datetime))
      .slice(0, CONFIG.MAX_TABLE_ROWS);

    // 청킹 처리로 UI 블로킹 방지
    await this.addAlarmRowsChunked(tbody, sortedAlarms);
  }

  // 대용량 데이터 청킹 처리 + 테이블 렌더링 가상화 => 성능 개선
  async addAlarmRowsChunked(tbody, alarmList) {
    const CHUNK_SIZE = 20; // 더 작은 청크로 반응성 향상
    const MAX_VISIBLE_ROWS = 100; // 너무 많은 행은 성능 저하

    // 표시할 데이터 제한
    const displayData = alarmList.slice(0, MAX_VISIBLE_ROWS);
    const chunks = this.chunkArray(displayData, CHUNK_SIZE);

    // 성능 모니터링
    const startTime = performance.now();

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // DocumentFragment로 배치 처리
      const fragment = document.createDocumentFragment();

      chunk.forEach((alarm) => {
        const row = document.createElement('tr');
        if (alarm.valid_yn === 'Y') row.classList.add('valid-alarm');
        row.innerHTML = this.createAlarmRowHTML(alarm);
        fragment.appendChild(row);
      });

      tbody.appendChild(fragment);

      // 성능 체크: 16ms(60fps) 초과 시 지연 처리
      const elapsed = performance.now() - startTime;
      if (elapsed > 16 && i < chunks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    // 더 많은 데이터가 있으면 알림 표시
    if (alarmList.length > MAX_VISIBLE_ROWS) {
      this.showDataLimitNotice(tbody, alarmList.length, MAX_VISIBLE_ROWS);
    }

    console.log(
      `✅ 테이블 렌더링 완료: ${displayData.length}행 in ${performance.now() - startTime}ms`
    );
  }

  showDataLimitNotice(tbody, totalCount, displayedCount) {
    const noticeRow = document.createElement('tr');
    noticeRow.style.backgroundColor = '#f8f9fa';
    noticeRow.innerHTML = `
    <td colspan="8" style="text-align: center; padding: 10px; font-style: italic; color: #666;">
      성능을 위해 ${displayedCount}개 행만 표시됩니다. (전체: ${totalCount}개)
      <br>
      <small>필터를 사용하여 결과를 좁혀보세요.</small>
    </td>
  `;
    tbody.appendChild(noticeRow);
  }

  // 배열 청킹 유틸리티
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  // 경보 테이블 Row HTML 생성
  createAlarmRowHTML(alarm) {
    return `
      <td title="${alarm.guksa_name}">${alarm.guksa_name}</td>
      <td title="${alarm.sector}">${alarm.sector}</td>
      <td title="${alarm.valid_yn === 'Y' ? '유효' : '무효'}">${
      alarm.valid_yn === 'Y' ? '유효' : '무효'
    }</td>
      <td title="${alarm.occur_datetime}">${CommonUtils.formatDateTime(alarm.occur_datetime)}</td>
      <td title="${alarm.equip_id}">${alarm.equip_id}</td>
      <td title="${alarm.equip_type}">${alarm.equip_type}</td>
      <td title="${alarm.equip_name}">${alarm.equip_name}</td>
      <td title="${alarm.alarm_message}">${alarm.alarm_message}</td>
    `;
  }

  // 나머지 메서드들은 기존 기능 유지하되 에러 처리만 표준화
  syncUIWithState() {
    try {
      const selectedSector = StateManager.get('selectedSector', CONFIG.DEFAULT_VIEW.SECTOR);
      const sectorRadio = document.querySelector(`input[name="sector"][value="${selectedSector}"]`);
      if (sectorRadio) sectorRadio.checked = true;
    } catch (error) {
      console.error('UI 상태 동기화 실패:', error);
    }
  }

  // 뷰 버튼 업데이트
  updateViewButtons() {
    try {
      const equipBtn = document.getElementById('equip-view-btn');
      const guksaBtn = document.getElementById('guksa-view-btn');

      if (equipBtn && guksaBtn) {
        equipBtn.classList.toggle('active', this.currentMapType === CONFIG.MAP_TYPES.EQUIPMENT);
        guksaBtn.classList.toggle('active', this.currentMapType === CONFIG.MAP_TYPES.GUKSA);
      }
    } catch (error) {
      console.error('뷰 버튼 업데이트 실패:', error);
    }
  }

  // 국사 변경 이벤트 처리
  handleGuksaChange(event) {
    try {
      const selectedGuksa = event.target.value;
      StateManager.set('selectedGuksa', selectedGuksa);

      this.updateSidebarEquipmentList();
      this.updateAlarmTable();

      console.log(`🏢 국사 변경: ${selectedGuksa || '전체'}`);
    } catch (error) {
      console.error('국사 변경 실패:', error);
    }
  }

  // 뷰 버튼 클릭 이벤트 처리
  handleViewToggle(mapType) {
    try {
      if (this.currentMapType === mapType) return;

      this.currentMapType = mapType;
      StateManager.set('selectedView', mapType);
      this.updateViewButtons();

      const mapTypeName = mapType === CONFIG.MAP_TYPES.EQUIPMENT ? '장비 연결 기준' : '국사 기준';
      MessageManager.addMessage?.(`✔️ 맵 뷰를 ${mapTypeName}으로 변경했습니다.`, { type: 'info' });

      console.log(`👁️ 뷰 변경: ${mapType}`);
    } catch (error) {
      console.error('뷰 변경 실패:', error);
    }
  }

  // 장애점 분석 이벤트 처리 ######### 장애점 분석 기능 추가 #########
  async handleFaultAnalysis() {
    try {
      console.log('🔍 장애점 분석 시작...');

      // 분석 중 중복 실행 방지
      if (failurePointManager.isCurrentlyAnalyzing()) {
        MessageManager.addMessage('⚠️ 이미 장애점 분석이 진행 중입니다.', { type: 'warning' });
        return;
      }

      // 현재 맵 데이터 확인: 노드 2개 이상 존재 여부 확인
      const currentMapData = this.getCurrentMapData();

      // getCurrentMapData에서 이미 메시지를 표시했으면 조용히 종료
      if (!currentMapData) {
        return;
      }

      // 경보 1건 이상 존재 여부 확인
      if (!this.validateMapData(currentMapData)) {
        return;
      }

      // 장애점 분석 실행
      await failurePointManager.analyzeFailurePoints(
        currentMapData.nodes,
        currentMapData.links,
        currentMapData.alarms
      );

      // 분석 완료 후 맵 상태 확인 (선택적 실행)
      this.ensureTooltipEventsAfterAnimation();

      console.log('✅ 장애점 분석 완료');
    } catch (error) {
      this.handleError('장애점 분석 실패', error);
    }
  }

  /**
   * 애니메이션 후 툴팁 이벤트 정상화 확인
   */
  ensureTooltipEventsAfterAnimation() {
    try {
      // 애니메이션 적용 후 약간의 지연을 두고 맵 상태 확인
      setTimeout(() => {
        try {
          const mapContainer = document.getElementById('map-container');
          if (!mapContainer) {
            console.warn('⚠️ 맵 컨테이너를 찾을 수 없습니다.');
            return;
          }

          // 맵 요소들이 정상적으로 렌더링되었는지 확인
          const nodeElements = mapContainer.querySelectorAll('.node-group');
          const linkElements = mapContainer.querySelectorAll('.connection-line');

          console.log(
            `🎯 맵 요소 상태 확인: 노드 ${nodeElements.length}개, 링크 ${linkElements.length}개`
          );

          // 간단한 상태 확인만 수행
          if (nodeElements.length > 0 || linkElements.length > 0) {
            console.log('✅ 맵 요소들이 정상적으로 렌더링되었습니다.');
          } else {
            console.warn('⚠️ 맵 요소를 찾을 수 없습니다.');
          }
        } catch (innerError) {
          console.warn('⚠️ 맵 상태 확인 중 내부 오류 (무시):', innerError);
        }
      }, 1000);
    } catch (error) {
      console.warn('⚠️ 맵 상태 확인 초기화 실패 (무시):', error);
    }
  }

  /**
   * 현재 맵 데이터 조회 (장애점 분석용)
   */
  getCurrentMapData() {
    try {
      console.log('🗺️ 현재 맵 데이터 조회 중...');

      // StateManager에서 현재 맵 데이터 조회
      const mapData = StateManager.getCurrentMapData();

      if (!mapData) {
        MessageManager.addErrorMessage('📌 분석할 NW 토폴로지가 없습니다. 장비를 먼저 선택하세요.');
        return null;
      }

      // 노드가 없는 경우만 제외 (1개 노드도 분석 가능하도록 변경)
      if (!mapData.nodes || mapData.nodes.length === 0) {
        MessageManager.addErrorMessage('📌 분석할 장비가 없습니다. 장비를 먼저 선택하세요.');
        return null;
      }

      console.log(
        `✅ 맵 데이터 조회 성공: 노드 ${mapData.nodes.length}개, 링크 ${
          mapData.links ? mapData.links.length : 0
        }개`
      );
      return mapData;
    } catch (error) {
      console.error('❌ 현재 맵 데이터 조회 실패:', error);
      MessageManager.addErrorMessage('📌 맵 데이터 조회 중 오류가 발생했습니다.');
      return null;
    }
  }

  /**
   * 맵 데이터 유효성 검사
   */
  validateMapData(mapData) {
    const { nodes, links, alarms } = mapData;

    console.log(
      `🔍 맵 데이터 검증: 노드 ${nodes.length}개, 링크 ${links.length}개, 경보 ${alarms.length}건`
    );

    // 경보 데이터 검증
    if (!Array.isArray(alarms) || alarms.length === 0) {
      console.warn('⚠️ 경보 데이터가 없습니다.');

      // 노드별 경보 상세 확인
      const nodeAlarmCounts = nodes.map((node) => ({
        equip_id: node.equip_id,
        alarmCount: node.alarmCount || 0,
      }));
      console.log('🔍 노드별 경보 개수:', nodeAlarmCounts);

      MessageManager.addErrorMessage('현재 발생한 경보가 없어 장애점을 찾을 수 없습니다.');
      return false;
    }

    console.log(
      `✅ 데이터 검증 완료: 노드 ${nodes.length}개, 링크 ${links.length}개, 경보 ${alarms.length}건`
    );
    return true;
  }

  // 경보 테이블 행 클릭 이벤트 처리
  handleTableRowClick(row) {
    try {
      // 기존 하이라이트 제거
      document
        .querySelectorAll('#alarmTableBody tr')
        .forEach((r) => r.classList.remove('selected-row'));
      row.classList.add('selected-row');

      // 현재 선택된 행 인덱스 업데이트
      const allRows = document.querySelectorAll('#alarmTableBody tr');
      this.currentSelectedRowIndex = Array.from(allRows).indexOf(row);

      const equipInfo = this.extractEquipmentInfo(row);
      if (equipInfo.equipId) {
        this.showEquipmentSelectedMessage(equipInfo);
        this.loadEquipmentTopology(equipInfo.equipId);
      }
    } catch (error) {
      console.error('테이블 행 클릭 처리 실패:', error);
    }
  }

  // 장비 정보 추출
  extractEquipmentInfo(row) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 8) return {};

    return {
      equipId: cells[4]?.textContent?.trim(),
      equipName: cells[6]?.textContent?.trim(),
      sector: cells[1]?.textContent?.trim(),
      equipType: cells[5]?.textContent?.trim(),
      guksaName: cells[0]?.textContent?.trim(),
    };
  }

  // 장비 선택 메시지 표시
  showEquipmentSelectedMessage(equipInfo) {
    try {
      const alarmData = StateManager.get('totalAlarmDataList', []);
      const selectedEquipment =
        alarmData.find((alarm) => alarm.equip_id === equipInfo.equipId) || equipInfo;

      this.displayEquipmentMessage(selectedEquipment);
    } catch (error) {
      console.error('장비 선택 메시지 표시 실패:', error);
    }
  }

  // 장비 토폴로지 로드 (단순화된 인스턴스 관리)
  async loadEquipmentTopology(equipId) {
    if (!equipId) {
      console.warn('장비 ID가 없습니다.');
      return;
    }

    try {
      console.log(`🔧 장비 토폴로지 로드: ${equipId}`);

      CommonUtils.showMapLoadingMessage?.(
        `장비 ${equipId} 토폴로지 데이터를 수집하고 분석 중입니다`
      );

      await this.createAndRenderMap(equipId);
    } catch (error) {
      this.handleMapError(equipId, error);
    }
  }

  // 채팅창 장비 선택 메시지 표시
  displayEquipmentMessage(equipment) {
    try {
      const alarmData = StateManager.get('totalAlarmDataList', []);
      const equipmentAlarms = alarmData.filter((alarm) => alarm.equip_id === equipment.equip_id);
      const validAlarms = equipmentAlarms.filter((alarm) => alarm.valid_yn === 'Y');

      const messageContent = this.generateEquipmentMessageContent(
        equipment,
        equipmentAlarms,
        validAlarms
      );

      // MessageManager를 사용하여 메시지 추가
      MessageManager.addErrorMessage(
        messageContent,
        {
          metadata: {
            equipmentId: equipment.equip_id,
            alarmCount: equipmentAlarms.length,
            validAlarmCount: validAlarms.length,
          },
        },
        { type: 'error' }
      );
    } catch (error) {
      this.handleError('장비 선택 메시지 표시 실패', error);
    }
  }

  generateEquipmentMessageContent(equipment, equipmentAlarms, validAlarms) {
    const alarmDetails = this.generateAlarmListHTML(equipmentAlarms);

    return `<strong>📌 경보발생 장비가 선택되었습니다.</strong><br><br>
           • 분야: ${equipment.sector || '알수없음'}<br>
           • 장비유형: ${equipment.equip_type || '알수없음'}<br>
           • 장비ID: ${equipment.equip_id}<br>
           • 장비명: ${equipment.equip_name}<br>
           • 국사: ${equipment.guksa_name || '알수없음'}<br><br>
           • 경보현황: 전체 ${equipmentAlarms.length}건 (유효 ${validAlarms.length}건)
${alarmDetails}`;
  }

  generateAlarmListHTML(equipmentAlarms) {
    if (equipmentAlarms.length === 0) return '';

    const alarmItems = equipmentAlarms
      .sort((a, b) => new Date(b.occur_datetime) - new Date(a.occur_datetime))
      .map((alarm) => this.createAlarmItemHTML(alarm))
      .join('');

    return `
      <div class="alarm-details" style="max-height: 200px; overflow-y: auto; margin-top: 10px; padding: 8px; background: #f9f9f9; border-radius: 4px; border: 1px solid #ddd;">
        <div style="margin-top: 5px;">
          ${alarmItems}
        </div>
      </div>
    `;
  }

  createAlarmItemHTML(alarm) {
    const validBadge =
      alarm.valid_yn === 'Y'
        ? '<span style="background: #e74c3c; color: white; padding: 1px 4px; border-radius: 2px; font-size: 10px;">유효</span>'
        : '<span style="background: #95a5a6; color: white; padding: 1px 4px; border-radius: 2px; font-size: 10px;">무효</span>';

    const borderColor = alarm.valid_yn === 'Y' ? '#e74c3c' : '#95a5a6';

    return `
      <div style="margin-bottom: 8px; padding: 6px; background: white; border-radius: 3px; border-left: 3px solid ${borderColor};">
        <div style="font-size: 11px; color: #666; margin-bottom: 2px;">
          ${alarm.occur_datetime || '시간 미상'} ${validBadge}
        </div>
        <div style="font-size: 12px; color: #333;">
          ${alarm.alarm_message || '경보 내용 없음'}
        </div>
      </div>
    `;
  }

  // 사이드바 장비 목록 변경 키보드 네비게이션
  handleEquipmentListNavigation(event) {
    try {
      // 방향키가 아닌 경우 처리하지 않음
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        return;
      }

      // 이벤트 전파 방지 (중복 처리 방지)
      event.preventDefault();
      event.stopPropagation();

      const equipSelect = event.target;
      if (!equipSelect) {
        console.warn('장비 선택 요소를 찾을 수 없습니다.');
        return;
      }

      const options = equipSelect.querySelectorAll('option');
      if (options.length === 0) return;

      let currentIndex = equipSelect.selectedIndex;
      let newIndex = this.getNewIndex(event.key, currentIndex, options.length);

      if (newIndex !== currentIndex) {
        equipSelect.selectedIndex = newIndex;

        // change 이벤트를 수동으로 발생시켜 맵 렌더링 트리거
        const changeEvent = new Event('change', { bubbles: true });
        equipSelect.dispatchEvent(changeEvent);

        console.log(
          `장비 목록 키보드 이동: ${currentIndex} → ${newIndex} (${options[newIndex]?.textContent})`
        );
      }
    } catch (error) {
      console.error('장비 목록 키보드 네비게이션 실패:', error);
    }
  }

  // 사이드바 장비 목록 변경 키보드 네비게이션 인덱스 계산
  getNewIndex(key, currentIndex, optionsLength) {
    switch (key) {
      case 'ArrowUp':
        return currentIndex > 0 ? currentIndex - 1 : optionsLength - 1;
      case 'ArrowDown':
        return currentIndex < optionsLength - 1 ? currentIndex + 1 : 0;
      case 'Home':
        return 0;
      case 'End':
        return optionsLength - 1;
      default:
        return currentIndex;
    }
  }

  // 사이드바 장비 선택 이벤트 처리
  handleEquipmentSelect(event) {
    try {
      const selectedEquipId = event.target.value;
      if (!selectedEquipId) return;

      const alarmData = StateManager.get('totalAlarmDataList', []);
      const selectedEquipment = alarmData.find((alarm) => alarm.equip_id === selectedEquipId);

      if (selectedEquipment) {
        this.showEquipmentSelectedMessage(selectedEquipment);
        this.loadEquipmentTopology(selectedEquipId);
      }
    } catch (error) {
      console.error('장비 선택 처리 실패:', error);
    }
  }

  // 사이드바 장비 검색 필터 처리
  handleEquipmentFilter() {
    try {
      const filterInput = document.getElementById('equipFilterInput');
      if (!filterInput) return;

      const searchTerm = filterInput.value?.trim().toLowerCase();
      if (!searchTerm) {
        this.handleEquipmentFilterReset();
        return;
      }

      this.applyEquipmentFilter(searchTerm);
    } catch (error) {
      console.error('장비 검색 필터 처리 실패:', error);
    }
  }

  // 사이드바 장비 검색 필터 적용
  applyEquipmentFilter(searchTerm) {
    const filteredEquipmentList = StateManager.get('filteredEquipmentList', []);

    if (!Array.isArray(filteredEquipmentList)) {
      this.updateSidebarEquipmentList();
      return;
    }

    const filteredEquipments = filteredEquipmentList.filter((equipment) =>
      equipment?.equip_name?.toLowerCase().includes(searchTerm)
    );

    this.updateEquipmentSelectWithFilter(filteredEquipments, searchTerm);
  }

  // 사이드바 장비 검색 필터 적용
  updateEquipmentSelectWithFilter(filteredEquipments, searchTerm) {
    const equipSelect = document.getElementById('searchEquipName');
    if (!equipSelect) return;

    equipSelect.innerHTML = '';

    // 검색 결과 헤더
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = `[검색결과] ${filteredEquipments.length}개 장비`;
    equipSelect.appendChild(defaultOption);

    if (filteredEquipments.length === 0) {
      this.addNoSearchResultOption(equipSelect);
    } else {
      this.addFilteredEquipmentOptions(equipSelect, filteredEquipments);
    }

    console.log(`🔍 장비 검색: "${searchTerm}" - ${filteredEquipments.length}개 결과`);
  }

  // 사이드바 장비 검색 필터 결과 없음 옵션 추가
  addNoSearchResultOption(equipSelect) {
    const noResultOption = document.createElement('option');
    noResultOption.value = '';
    noResultOption.textContent = '❌ 검색 결과가 없습니다.';
    noResultOption.disabled = true;
    equipSelect.appendChild(noResultOption);
  }

  // 사이드바 장비 검색 필터 결과 옵션 추가
  addFilteredEquipmentOptions(equipSelect, filteredEquipments) {
    filteredEquipments
      .sort((a, b) => a.equip_name.localeCompare(b.equip_name, 'ko-KR'))
      .forEach((equipment) => {
        const option = document.createElement('option');
        option.value = equipment.equip_id;
        option.textContent = `${equipment.equip_name} (${equipment.alarmCount || 0}건)`;

        if (equipment.validAlarmCount > 0) {
          option.textContent += ` [유효:${equipment.validAlarmCount}]`;
          option.style.color = '#e74c3c';
        }
        equipSelect.appendChild(option);
      });
  }

  // 사이드바 장비 검색 필터 초기화
  handleEquipmentFilterReset() {
    try {
      const filterInput = document.getElementById('equipFilterInput');
      if (filterInput) {
        filterInput.value = '';
      }
      this.updateSidebarEquipmentList();
      console.log('🔄 장비 검색 필터 초기화 완료');
    } catch (error) {
      console.error('장비 검색 필터 초기화 실패:', error);
    }
  }

  // 하단 경보 테이블 검색 필터 추가
  addTableSearchFilters() {
    try {
      const table = document.querySelector('.alarm-table');
      const tableContainer =
        table?.closest('.table-container') || document.querySelector('.bottom-div');

      if (!table || !tableContainer) return;

      const existingFilter = tableContainer.querySelector('.table-filter-container');
      if (existingFilter) {
        setTimeout(() => table.classList.add('loaded'), 100);
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

      this.attachTableFilterEventListeners(tableContainer);

      setTimeout(() => table.classList.add('loaded'), 100);
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
            <button class="filter-btn" data-action="excel" title="경보 데이터를 엑셀로 다운로드">Excel 다운로드</button>
          </div>
          <div class="action-group">
            <button class="filter-btn" data-action="clear-chat" title="채팅창의 모든 메시지를 초기화합니다">Clear Messages</button>
            <button class="ai-search-btn" data-action="rag" title="Advanced RAG 기반 장애사례 유사도 검색/조회">AI RAG 사례 조회</button>
            <button class="ai-search-btn" data-action="copilot" title="MS Copilot Agent 기반 과거 장애사례 Q&A">Copilot Agent 챗봇</button>
          </div>
        </div>
      </div>
    `;
  }

  // 하단 경보 테이블 필터 이벤트 리스너 부착 (이벤트 위임 사용)
  attachTableFilterEventListeners(container) {
    const searchInput = container.querySelector('#table-search-input');
    if (searchInput) {
      searchInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          this.performTableSearch();
        }
      });
      ['click', 'focus', 'blur'].forEach((event) => {
        searchInput.addEventListener(event, (e) => e.stopPropagation());
      });
    }

    container.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-action]');
      if (!button) return;

      const action = button.dataset.action;
      e.stopPropagation();

      switch (action) {
        case 'filter':
          this.performTableSearch();
          break;
        case 'reset':
          this.resetTableFilter();
          break;
        case 'excel':
          this.downloadExcel();
          break;
        case 'clear-chat':
          this.clearChatMessages();
          break;
        case 'rag':
          this.openFaultDetectorPopup();
          break;
        case 'copilot':
          // 정의된 동작 없음
          break;
      }
    });
  }

  // 하단 경보 테이블 검색 필터 테이블 검색
  performTableSearch() {
    try {
      const searchInput = document.getElementById('table-search-input');
      const searchTerm = searchInput?.value?.trim();

      if (!searchTerm) {
        this.resetTableFilter();
        return;
      }

      const filteredData = this.getSearchFilteredData(searchTerm);
      this.updateTableWithFilteredData(filteredData);

      console.log(`🔍 테이블 검색: "${searchTerm}" - ${filteredData.length}개 결과`);
    } catch (error) {
      console.error('테이블 검색 실패:', error);
    }
  }

  // 하단 경보 테이블 검색 필터 테이블 검색
  getSearchFilteredData(searchTerm) {
    const filterData = this.getFilterData();
    let filteredData = filterData.alarmData.filter((alarm) => {
      if (!alarm || alarm.sector?.toLowerCase() !== filterData.selectedSector.toLowerCase()) {
        return false;
      }

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

      return simpleMatch?.(searchText, searchTerm); // StringMatcher 유틸 사용 검색 필터링
    });

    // 국사 필터 적용
    if (filterData.selectedGuksa) {
      const selectedGuksaInfo = filterData.guksaData.find(
        (g) => g.guksa_id == filterData.selectedGuksa
      );
      if (selectedGuksaInfo) {
        filteredData = filteredData.filter(
          (alarm) => alarm.guksa_name === selectedGuksaInfo.guksa_name
        );
      }
    }

    return filteredData;
  }

  // 하단 경보 테이블 검색 필터 테이블 검색
  updateTableWithFilteredData(filteredData) {
    try {
      const tbody = document.getElementById('alarmTableBody');
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

  // 하단 경보 테이블 검색 필터 리셋
  resetTableFilter() {
    try {
      const searchInput = document.getElementById('table-search-input');
      if (searchInput) {
        searchInput.value = '';
      }
      this.updateAlarmTable();
      console.log('🔄 테이블 필터 초기화 완료');
    } catch (error) {
      console.error('테이블 필터 초기화 실패:', error);
    }
  }

  // 하단 경보 테이블 Excel 다운로드 구현
  downloadExcel() {
    try {
      const filterData = this.getFilterData();
      const filteredAlarms = this.getFilteredAlarms(filterData);

      if (filteredAlarms.length === 0) {
        MessageManager.addErrorMessage?.('다운로드할 데이터가 없습니다.');
        return;
      }

      const csvContent = this.generateCSVContent(filteredAlarms);
      this.downloadCSVFile(csvContent, filterData);

      MessageManager.addSuccessMessage?.(
        `📊 ${filteredAlarms.length}건의 경보 데이터를 다운로드했습니다.`
      );
    } catch (error) {
      this.handleError('엑셀 다운로드 실패', error);
    }
  }

  // 하단 경보 테이블 Excel 다운로드 구현
  generateCSVContent(filteredAlarms) {
    const headers = [
      '국사',
      '분야',
      '유효/무효',
      '발생시간',
      '장비ID',
      '장비유형',
      '장비명',
      '경보내용',
    ];

    const rows = filteredAlarms.map((alarm) =>
      [
        `"${alarm.guksa_name || ''}"`,
        `"${alarm.sector || ''}"`,
        `"${alarm.valid_yn === 'Y' ? '유효' : '무효'}"`,
        `"${alarm.occur_datetime || ''}"`,
        `"${alarm.equip_id || ''}"`,
        `"${alarm.equip_type || ''}"`,
        `"${alarm.equip_name || ''}"`,
        `"${alarm.alarm_message || ''}"`,
      ].join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  }

  downloadCSVFile(csvContent, filterData) {
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);

    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    const guksaFilter = filterData.selectedGuksa ? '_선택국사' : '';
    link.setAttribute(
      'download',
      `경보데이터_${filterData.selectedSector}${guksaFilter}_${timestamp}.csv`
    );

    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // AI RAG 모달 팝업 열기
  async openFaultDetectorPopup() {
    try {
      console.log('🚀 AI RAG 장애분석 팝업 열기 시작...');

      // 현재 맵 데이터 가져오기
      const currentMapData = this.getCurrentMapData();
      console.log('🗺️ getCurrentMapData 결과:', currentMapData);

      if (!currentMapData || !currentMapData.nodes || currentMapData.nodes.length === 0) {
        console.error('❌ 맵 데이터 없음:', currentMapData);
        MessageManager.addErrorMessage?.('분석할 NW 토폴로지가 없습니다. 장비를 먼저 선택하세요.');
        return;
      }

      // 현재 맵의 노드들과 관련된 경보만 필터링
      const nodeIds = new Set(currentMapData.nodes.map((node) => node.id));
      console.log('🏷️ 노드 ID 목록:', Array.from(nodeIds));

      const totalAlarmData = StateManager.get('totalAlarmDataList', []);
      console.log('📊 전체 경보 데이터 개수:', totalAlarmData.length);

      const mapAlarms = totalAlarmData.filter((alarm) => {
        return alarm && nodeIds.has(alarm.equip_id);
      });
      console.log('🔍 맵 관련 경보 필터링 결과:', mapAlarms.length);
      console.log(
        '📋 맵 관련 경보 목록:',
        mapAlarms.map((a) => ({ equip_id: a.equip_id, message: a.alarm_message }))
      );

      if (mapAlarms.length === 0) {
        console.warn('⚠️ 경보 데이터 없음 - 빈 데이터로 계속 진행');
        // 경보가 없어도 분석 가능하도록 변경
        // MessageManager.addErrorMessage?.('현재 맵의 장비들에서 경보 데이터가 없습니다.');
        // return;
      }

      // 기준 노드 정보
      const baseNode = currentMapData.baseNode || currentMapData.nodes[0];
      console.log('🎯 기준 노드:', baseNode);

      // 기준 노드와 관련된 경보에서 국사명 추출
      const baseNodeAlarms = mapAlarms.filter((alarm) => alarm.equip_id === baseNode.id);
      const guksaName =
        baseNodeAlarms.length > 0
          ? baseNodeAlarms[0].guksa_name
          : mapAlarms.length > 0
          ? mapAlarms[0].guksa_name
          : '알수없음';

      console.log('🏢 추출된 국사명:', guksaName);

      // POST 데이터 준비
      const postData = {
        baseNode: {
          equip_id: baseNode.id,
          equip_name: baseNode.name,
          sector: baseNode.sector || StateManager.get('selectedSector', 'IP'),
          guksa_name: guksaName,
        },
        alarms: mapAlarms,
      };

      console.log('📤 POST 데이터:', postData);

      // 팝업 생성
      this.createFaultDetectorModal(postData);

      MessageManager.addAnalyzingMessage?.(
        `🔍 현재 MAP의 모든 경보들과 유사한 사례를 분석합니다. <br><br> • 기준 장비: ${baseNode.name} <br> • 전체 경보 수: ${mapAlarms.length} 건`
      );
    } catch (error) {
      console.error('❌ AI 장애분석 팝업 열기 실패:', error);
      this.handleError('AI 장애분석 시작 실패', error);
    }
  }

  // AI RAG 모달 팝업 생성
  createFaultDetectorModal(postData) {
    // 기존 모달 제거
    const existingModal = document.getElementById('fault-detector-modal');
    if (existingModal) {
      existingModal.remove();
    }

    const modalOverlay = this.createModalOverlay(postData);
    this.attachModalEvents(modalOverlay);
    document.body.appendChild(modalOverlay);
  }

  // createModalOverlay 함수 수정
  createModalOverlay(postData) {
    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'fault-detector-modal';
    modalOverlay.className = 'fault-detector-modal';

    const modalContainer = document.createElement('div');
    modalContainer.className = 'fault-detector-modal-container';

    const modalHeader = this.createModalHeader(postData.baseNode, postData.alarms.length);
    const modalBody = this.createModalBody(postData);

    modalContainer.appendChild(modalHeader);
    modalContainer.appendChild(modalBody);
    modalOverlay.appendChild(modalContainer);

    return modalOverlay;
  }

  // createModalHeader 함수 수정
  createModalHeader(baseNode, alarmCount) {
    const modalHeader = document.createElement('div');
    modalHeader.className = 'fault-detector-modal-header';

    const modalTitle = document.createElement('h3');
    modalTitle.className = 'fault-detector-modal-title';
    modalTitle.textContent = `AI RAG 유사 장애사례 조회 - ${baseNode.equip_name} (${alarmCount}건)`;

    const closeButton = document.createElement('button');
    closeButton.id = 'close-modal-btn';
    closeButton.className = 'fault-detector-modal-close';
    closeButton.textContent = '×';

    modalHeader.appendChild(modalTitle);
    modalHeader.appendChild(closeButton);

    return modalHeader;
  }

  // createModalBody 함수
  createModalBody(postData) {
    const modalBody = document.createElement('div');
    modalBody.className = 'fault-detector-modal-body';

    const iframe = document.createElement('iframe');
    iframe.className = 'fault-detector-modal-iframe';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';

    modalBody.appendChild(iframe);

    console.log('📡 POST 요청 시작 - /api/fault-detector');
    console.log('📤 요청 데이터:', JSON.stringify(postData, null, 2));

    // fetch로 POST 요청 보내고 응답을 iframe에 표시
    fetch('/api/fault-detector', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(postData),
    })
      .then((response) => {
        console.log('📡 서버 응답 상태:', response.status, response.statusText);
        console.log('📡 응답 헤더:', [...response.headers.entries()]);

        if (!response.ok) {
          throw new Error(`서버 오류: ${response.status} ${response.statusText}`);
        }

        return response.text();
      })
      .then((html) => {
        console.log('📄 HTML 응답 길이:', html.length);
        console.log('📄 HTML 응답 미리보기:', html.substring(0, 500) + '...');

        // 응답 HTML을 iframe에 직접 작성
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        iframeDoc.open();
        iframeDoc.write(html);
        iframeDoc.close();

        console.log('✅ iframe에 HTML 로드 완료');

        // iframe 로드 완료 후 내부 상태 확인
        iframe.onload = () => {
          try {
            const iframeWindow = iframe.contentWindow;
            const faultData = iframeWindow.faultData;
            console.log('🎯 iframe 내부 faultData:', faultData);

            if (faultData) {
              console.log('📊 전달된 데이터 확인:');
              console.log('  - baseNode:', faultData.baseNode);
              console.log('  - alarms 개수:', faultData.alarms ? faultData.alarms.length : 0);
              console.log('  - alarm_count:', faultData.alarm_count);
            } else {
              console.error('❌ iframe 내부에 faultData가 없습니다!');
            }
          } catch (e) {
            console.error('❌ iframe 내부 상태 확인 실패:', e);
          }
        };
      })
      .catch((error) => {
        console.error('❌ 데이터 로딩 실패:', error);
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        iframeDoc.open();
        iframeDoc.write(`<div style="padding: 20px;">데이터 로딩 실패: ${error.message}</div>`);
        iframeDoc.close();
      });

    return modalBody;
  }

  // AI RAG 모달 팝업 이벤트 처리
  attachModalEvents(modalOverlay) {
    const closeModal = () => modalOverlay.remove();

    // 닫기 버튼
    const closeButton = modalOverlay.querySelector('#close-modal-btn');
    closeButton.addEventListener('click', closeModal);

    // 오버레이 클릭
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });

    // ESC 키
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  }

  // 상위 메뉴 햄버거 버튼 토글
  toggleSidebar() {
    const elements = {
      sidebar: document.querySelector('.left-sidebar'),
      rightContent: document.querySelector('.right-content'),
      hamburgerBtn: document.querySelector('.hamburger-btn'),
    };

    if (Object.values(elements).every((el) => el)) {
      elements.sidebar.classList.toggle('collapsed');
      elements.rightContent.classList.toggle('expanded');
      elements.hamburgerBtn.classList.toggle('active');

      const isCollapsed = elements.sidebar.classList.contains('collapsed');
      console.log(`🍔 사이드바 ${isCollapsed ? '접기' : '펴기'} 완료`);
    }
  }

  // 하단 경보 테이블 키보드 네비게이션
  handleTableKeyboardNavigation(event) {
    try {
      const table = document.querySelector('.alarm-table tbody');
      if (!table) return;

      const rows = table.querySelectorAll('tr');
      if (rows.length === 0) return;

      const newRowIndex = this.calculateNewRowIndex(event.key, rows.length);
      if (newRowIndex === this.currentSelectedRowIndex) return;

      this.updateSelectedRow(rows, newRowIndex);
      this.scrollToSelectedRow(rows[newRowIndex]);
      this.handleTableRowClick(rows[newRowIndex]);
    } catch (error) {
      console.error('테이블 키보드 네비게이션 처리 실패:', error);
    }
  }

  // 하단 경보 테이블 키보드 네비게이션 인덱스 계산
  calculateNewRowIndex(key, rowsLength) {
    switch (key) {
      case 'ArrowUp':
        return this.currentSelectedRowIndex - 1 < 0
          ? rowsLength - 1
          : this.currentSelectedRowIndex - 1;
      case 'ArrowDown':
        return (this.currentSelectedRowIndex + 1) % rowsLength;
      case 'PageUp':
        return Math.max(0, this.currentSelectedRowIndex - 10);
      case 'PageDown':
        return Math.min(rowsLength - 1, this.currentSelectedRowIndex + 10);
      default:
        return this.currentSelectedRowIndex;
    }
  }

  // 하단 경보 테이블 키보드 네비게이션 현재 선택 행 업데이트
  updateSelectedRow(rows, newRowIndex) {
    rows[this.currentSelectedRowIndex]?.classList.remove('selected-row');
    rows[newRowIndex]?.classList.add('selected-row');
    this.currentSelectedRowIndex = newRowIndex;
  }

  // 하단 경보 테이블 키보드 네비게이션 현재 선택 행 스크롤
  scrollToSelectedRow(row) {
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  destroy() {
    this.cleanupMapInstance();
  }

  // 채팅창 메시지 초기화
  clearChatMessages() {
    try {
      const chatContainer = document.getElementById('chat-messages-area');

      // 모든 메시지 제거
      chatContainer.innerHTML = '';

      // 기본 시스템 메시지 다시 추가
      const currentTime = new Date().toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
      });

      const systemMessage = document.createElement('div');
      systemMessage.className = 'chat-message system';
      systemMessage.innerHTML = `
        <div class="message-content">
          💡 장애점 찾기를 클릭하면 AI 분석 결과가 여기에 표시됩니다.
        </div>
        <div class="message-time">${currentTime}</div>
      `;

      chatContainer.appendChild(systemMessage);

      // 스크롤을 맨 아래로 이동
      chatContainer.scrollTop = chatContainer.scrollHeight;

      console.log('✅ 채팅 메시지 초기화 완료');

      // 성공 메시지 표시
      if (MessageManager?.addSuccessMessage) {
        MessageManager.addSuccessMessage('🧹 메시지 창이 초기화되었습니다.');
      }
    } catch (error) {
      console.error('❌ 채팅 메시지 초기화 실패:', error);
      if (MessageManager?.addErrorMessage) {
        MessageManager.addErrorMessage('메시지 창 초기화에 실패했습니다.');
      }
    }
  }

  // UI 업데이트를 다음 프레임으로 지연
  updateUIAsync(callback) {
    requestAnimationFrame(() => {
      requestAnimationFrame(callback);
    });
  }
}

// 싱글톤 인스턴스 생성
export const faultDashboardApp = new FaultDashboardApp();

// 전역 함수 등록
export function registerFaultDashboardAppGlobalFunctions() {
  if (typeof window !== 'undefined') {
    window.initializeApp = () => faultDashboardApp.initialize();
    console.log('✅ FaultDashboardApp 전역 함수 등록 완료');
  }
}

// 자동 등록
registerFaultDashboardAppGlobalFunctions();
