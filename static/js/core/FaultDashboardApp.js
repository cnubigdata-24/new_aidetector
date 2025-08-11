/**
 * FaultDashboardApp 리팩토링 버전
 */

// 싱글톤
import { tooltipManager as TooltipManager } from '../utils/TooltipManager.js';
import { colorManager as ColorManager } from '../utils/ColorManager.js';
import { stateManager as StateManager } from './StateManager.js';
import { dashboardComponent as DashboardComponent } from './DashboardComponent.js';
import { simpleMatch, advancedMatch } from '../utils/StringMatcher.js';

import { failurePointManager } from './FailurePointManager.js';
import { ragPopupWindow } from './RAGPopupWindow.js'; // RAG 팝업창 모듈

// 클래스와 함수
import CommonUtils, { SECTORS } from '../utils/CommonUtils.js';
import MessageManagerClass from '../utils/MessageManager.js'; // 클래스 임포트
import GuksaMapComponent from './GuksaMapComponent.js';
import EquipmentMapComponent from './EquipmentMapComponent.js';
import { sectorLoadingManager } from '../utils/SectorLoadingManager.js'; // 공통 로딩 매니저

// UI 관련 클래스
import { uiManager } from './UIManager.js'; // UI 관리자
import { DOMBuilder } from '../utils/DOMBuilder.js'; // clearChatMessages에서만 사용

// 설정 상수
const CONFIG = {
  API_ENDPOINTS: {
    ALARM_DATA: '/api/alarm_dashboard',
    EQUIPMENT_DATA: '/api/get_equipment_data',
    GUKSA_LIST: '/api/guksa_list',
  },
  DEFAULT_VIEW: {
    SECTOR: '전송',
    MAP_TYPE: 'equip',
    TIME_FILTER: '30',
  },
  MAP_TYPES: {
    EQUIPMENT: 'equip',
    GUKSA: 'guksa',
  },
  MAX_TABLE_ROWS: 100,
  SECTOR_CHANGE_DELAY: 16, // ✅ 최적화: 한 프레임(16ms) 딜레이
};

export class FaultDashboardApp {
  // 생성자
  constructor() {
    // 데이터 캐시 초기화
    this.dataCache = new Map();
    this.isInitialized = false;

    this.equipmentMapComponent = null;
    this.guksaMapComponent = null;
    this.currentMapType = 'equip';

    // 🔒 장애점 분석 중복 실행 방지
    this._isAnalyzing = false;

    // 메서드 바인딩
    this.bindEventHandlers();

    // 앱 상태 초기화
    this.currentSelectedSector = 'MW';
    this.filteredEquipmentList = [];
    this.currentSelectedRowIndex = -1;
    this.sidebarInitialized = false;

    // 이벤트 리스너 중복 등록 방지 플래그
    this._eventListenersAttached = false;

    // UI 매니저에 앱 인스턴스 설정
    uiManager.setAppInstance(this);
    console.log('🏠 FaultDashboardApp 생성자 완료');
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

  // 사이드바 장비 검색 필터 처리
  handleEquipmentFilter() {
    try {
      const filterInput = uiManager.getElement('equipFilterInput');
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

  async initialize() {
    try {
      console.log('🔧 FaultDashboardApp 초기화 시작...');

      await this.setupApp();
      this.isInitialized = true;

      // this.showInitializationSuccess();
      console.log('✅ FaultDashboardApp 초기화 완료');
    } catch (error) {
      this.handleError('초기화 실패', error);
    }
  }

  async setupApp() {
    // 뷰 버튼 업데이트 (equip, guksa)
    //uiManager.updateViewButtons(this.currentMapType);

    this.setupEventListeners();
    this.setupStateListeners();
    this.setupInitialState();

    await this.loadInitialData();
  }

  // 이벤트 리스너 설정 (버튼, 키보드, 경보 테이블)
  setupEventListeners() {
    try {
      // 통합된 이벤트 리스너 등록 (중복 방지는 내부에서 처리)
      this.attachAllEventListeners();
      console.log('🎧 이벤트 리스너 설정 완료');
    } catch (error) {
      console.error('❌ 이벤트 리스너 설정 실패:', error);
    }
  }

  // 모든 이벤트 리스너를 한 곳에서 관리
  attachAllEventListeners() {
    // 이벤트 리스너 중복 등록 방지
    if (this._eventListenersAttached) {
      console.log('이벤트 리스너가 이미 등록되어 스킵');
      return;
    }

    try {
      // 문서 레벨 이벤트 위임 (한 번만 등록)
      document.addEventListener('click', this.handleDocumentClick.bind(this), { once: false });
      document.addEventListener('change', this.handleDocumentChange.bind(this), { once: false });
      document.addEventListener('keydown', this.handleGlobalKeydown.bind(this), {
        passive: false,
        once: false,
      });

      // 경보 테이블 이벤트
      this.attachTableEvents();

      // 🔒 이벤트 리스너 등록 완료 플래그
      this._eventListenersAttached = true;

      console.log('🎧 이벤트 리스너 등록 완료');
    } catch (error) {
      console.error('❌ 이벤트 리스너 등록 실패:', error);
      this._eventListenersAttached = false; // 실패 시 플래그 리셋
    }
  }
  setupStateListeners() {
    StateManager.on('selectedSector', (data) => {
      const { value: selectedSector, oldValue: previousSector, source } = data;

      if (selectedSector === previousSector) {
        return; // 동일한 분야로의 변경은 무시
      }

      console.log(
        `[FaultDashboardApp] 분야 변경: ${previousSector} → ${selectedSector} (${source})`
      );

      this.currentSelectedSector = selectedSector;

      // ✅ 핵심 최적화: 모든 처리를 즉시 동기 실행 (딜레이 제거)
      uiManager.syncSectorSelection(selectedSector);

      this.updateDataAfterSectorChange();

      // ✅ 로딩 완료 처리
      sectorLoadingManager.finishSectorChangeLoading();

      // 맵 변경 메시지 표시 (필요시에만)
      if (source === 'dashboard-click' || source === 'sidebar-radio') {
        CommonUtils.showMapSectorChangeMessage?.(selectedSector);
      }
    });

    // 장비 선택/해제 시 테이블 업데이트 (맵 준비 전에는 실행하지 않음)
    StateManager.on('selectedEquipment', (data) => {
      const { value: selectedEquipment, oldValue: previousEquipment } = data;

      console.log(
        `[FaultDashboardApp] 장비 선택 변경: ${previousEquipment} → ${selectedEquipment}`
      );

      // 장비가 선택해제된 경우에만 즉시 테이블 업데이트
      if (!selectedEquipment) {
        uiManager.updateAlarmTable();
      }
    });

    // 🔧 새로 추가: 맵 데이터 준비 완료 시 테이블 업데이트
    StateManager.on('mapDataReady', (data) => {
      const { nodes, links } = data;
      const selectedEquipment = StateManager.get('selectedEquipment');

      console.log(
        `[FaultDashboardApp] 맵 데이터 준비 완료: 노드 ${nodes.length}개, 선택장비: ${selectedEquipment}`
      );

      // 선택된 장비가 있고 맵 데이터가 준비되었을 때만 테이블 업데이트
      if (selectedEquipment && nodes.length > 0) {
        // 짧은 딜레이 후 테이블 업데이트 (맵 데이터 정착 시간 확보)
        setTimeout(() => {
          uiManager.updateAlarmTable();
        }, 100);
      }
    });
  }

  // 클릭 이벤트 핸들러
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

    // 통합 경보 조회 버튼
    if (target.id === 'fault-query-btn') {
      event.preventDefault();
      this.handleIntegratedAlarmQuery();
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

  // ========== 통합 경보 조회 기능 ==========

  // 통합 경보 조회 처리 (Refresh와 동일한 초기화 + 사용자 선택 기간 조회)
  async handleIntegratedAlarmQuery() {
    try {
      console.log('🔄 통합 경보 조회 시작...');

      // 1. 시작일시와 종료일시 유효성 검사
      const startDateTime = document.getElementById('startDateTime').value;
      const endDateTime = document.getElementById('endDateTime').value;

      if (!startDateTime || !endDateTime) {
        this.addMSG('시작일시와 종료일시를 모두 입력해주세요.', 'error');
        return;
      }

      // 2. 시작일시가 종료일시보다 늦지 않은지 확인
      if (new Date(startDateTime) > new Date(endDateTime)) {
        this.addMSG('시작일시는 종료일시보다 늦을 수 없습니다.', 'error');
        return;
      }

      // 3. Refresh와 동일한 초기화 작업 수행
      this.performRefreshLikeReset();

      // 4. 사용자가 선택한 기간으로 경보 데이터 재조회
      console.log(`🔍 사용자 선택 기간 조회: ${startDateTime} ~ ${endDateTime}`);

      const alarmData = await this.loadAlarmData(false); // isInitialLoad = false로 설정

      if (alarmData && alarmData.length > 0) {
        console.log(`✅ 통합 경보 조회 완료: ${alarmData.length}개 경보 조회됨`);
        this.addMSG(`통합 경보 조회 완료: ${alarmData.length}개의 경보를 조회했습니다.`, 'success');
      } else {
        console.log('⚠️ 선택한 기간에 경보가 없습니다.');
        this.addMSG('선택한 기간에 경보가 없습니다.', 'warning');
      }
    } catch (error) {
      this.handleError('통합 경보 조회 실패', error);
    }
  }

  // Refresh 버튼과 동일한 초기화 작업 수행
  performRefreshLikeReset() {
    try {
      console.log('🔄 Refresh와 동일한 초기화 작업 수행...');

      // 1. 맵 인스턴스 완전 정리 (기존 함수 활용)
      this.cleanupAllMapInstance();

      // 2. StateManager 초기화 (주요 상태값들 리셋)
      StateManager.reset([
        'selectedEquipment',
        'selectedAlarmRow',
        'currentPage',
        'filteredAlarmData',
      ]);

      // 3. 대시보드 카드 선택 해제
      DashboardComponent.clearSelection();

      // 4. 테이블 필터 및 정렬 상태 초기화
      this.resetTableState();

      // 5. 채팅 메시지 초기화
      this.clearChatMessages();

      // 6. UI 요소들 초기화
      this.resetUIElements();

      // 7. 맵 컨테이너 초기 메시지 복원
      this.resetMapContainer();

      console.log('✅ 초기화 작업 완료');
    } catch (error) {
      console.error('❌ 초기화 작업 실패:', error);
    }
  }

  // 맵 컨테이너 초기 상태로 복원
  resetMapContainer() {
    try {
      const mapContainer = document.getElementById('map-container');
      if (mapContainer) {
        // 맵 컨테이너를 기본 메시지로 초기화
        mapContainer.innerHTML =
          '<div class="initial-message">좌측 경보 장비를 선택하면 NW 맵이 표시됩니다.</div>';
        console.log('🗺️ 맵 컨테이너 초기 메시지 복원 완료');
      }
    } catch (error) {
      console.error('❌ 맵 컨테이너 초기화 실패:', error);
    }
  }

  // 테이블 상태 초기화
  resetTableState() {
    try {
      // resetTableFilter 함수 활용 (검색 입력창 초기화 + 테이블 업데이트)
      this.resetTableFilter();

      // StateManager를 통한 정렬 상태 초기화
      StateManager.reset(['currentSortedData', 'sortColumn', 'sortDirection']);

      // 테이블 헤더의 정렬 표시 제거
      const tableHeaders = document.querySelectorAll('.alarm-table th');
      tableHeaders.forEach((th) => {
        th.classList.remove('sort-asc', 'sort-desc');
      });

      console.log('🔄 테이블 상태 초기화 완료');
    } catch (error) {
      console.error('❌ 테이블 상태 초기화 실패:', error);
      throw error; // 오류를 다시 던져서 호출자가 알 수 있도록 함
    }
  }

  // UI 요소들 초기화
  resetUIElements() {
    console.log('🔄 UI 요소들 초기화 시작...');

    // 장비 필터 입력창 초기화
    const equipFilterInput = document.getElementById('equipFilterInput');
    if (equipFilterInput) {
      equipFilterInput.value = '';
    }

    // 장비 선택 목록 초기화 (선택 해제)
    const equipNameSelect = document.getElementById('searchEquipName');
    if (equipNameSelect) {
      equipNameSelect.selectedIndex = -1;
    }

    // 국사 선택 목록 초기화 (전체 국사로 리셋)
    const guksaSelect = document.getElementById('searchGuksa');
    if (guksaSelect) {
      guksaSelect.value = ''; // 전체 국사
    }

    // 분야 선택을 기본값("전송")으로 리셋
    const defaultSectorRadio = document.querySelector('input[name="sector"][value="전송"]');
    if (defaultSectorRadio) {
      defaultSectorRadio.checked = true;
      // StateManager에 반영
      StateManager.setSelectedSector('전송', { source: 'refresh-reset' });
    }

    console.log('✅ UI 요소들 초기화 완료');
  }

  // 변경 이벤트 핸들러
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
      // HTML에서 실제 체크된 값을 읽어서 사용
      const checkedSectorRadio = document.querySelector('input[name="sector"]:checked');
      const initialSector = checkedSectorRadio ? checkedSectorRadio.value : 'IP';

      StateManager.setState({
        selectedSector: initialSector,
        selectedView: CONFIG.DEFAULT_VIEW.MAP_TYPE,
        timeFilter: CONFIG.DEFAULT_VIEW.TIME_FILTER,
        selectedGuksa: '',
      });

      uiManager.syncUIWithState();
      console.log(`🎯 초기 상태 설정 완료: 선택된 분야 = ${initialSector}`);
    } catch (error) {
      console.error('❌ 초기 상태 설정 실패:', error);
    }
  }

  // 상단 대시보드 분야 카드 클릭 이벤트 처리
  attachDashboardCardEvents() {
    // DashboardComponent는 자체 이벤트 리스너를 등록
    // 여기서는 클릭 이벤트를 StateManager로 전달하도록 역할 분리
    console.log('ℹ️ 대시보드 카드 이벤트 처리는 DashboardComponent에서 위임받아 처리합니다.');
  }

  // 경보 테이블 관련 이벤트들을 한 곳에서 관리
  attachTableEvents() {
    const tableContainer = document.querySelector('.table-container');
    if (!tableContainer) return;

    // 경보 테이블 포커스 및 키보드 네비게이션
    tableContainer.addEventListener('click', (event) => {
      // 필터 UI 및 버튼 클릭을 제외하고 테이블 영역 클릭 시에만 포커스
      if (event.target.closest('table.alarm-table')) {
        tableContainer.focus();
      }
    });
    tableContainer.addEventListener('keydown', (event) => {
      this.handleTableKeyboardNavigation(event);
    });

    // 경보 테이블 행 클릭 이벤트 위임
    tableContainer.addEventListener('click', (event) => {
      const row = event.target.closest('tr');
      if (row && row.parentElement.id === 'alarmTableBody') {
        this.handleTableRowClick(row);
      }
    });
  }

  // 사이드바 장비 필터 이벤트 설정 (키 입력, 클릭)
  setupEquipmentFilterEvents() {
    // 이벤트 리스너가 이미 전체적으로 설정되었다면 리턴
    if (this._eventListenersAttached) return;

    const elements = [
      {
        id: 'equipFilterInput',
        event: 'keypress',
        handler: (e) => {
          if (e.key === 'Enter') this.handleEquipmentFilter();
        },
      },
      { id: 'equipFilterBtn', event: 'click', handler: this.handleEquipmentFilter },
      { id: 'equipResetBtn', event: 'click', handler: this.handleEquipmentFilterReset },
    ];

    elements.forEach(({ id, event, handler }) => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener(event, handler.bind(this), { passive: true });
      }
    });

    console.log('🔧 장비 필터 이벤트 설정 완료');
  }

  // 초기 데이터 로드 (경보, 장비, 국사)
  async loadInitialData() {
    try {
      console.log('📊 초기 데이터 로딩 시작...');

      const [alarmData, equipmentData, guksaData] = await Promise.all([
        this.loadAlarmData(true), // 초기 로드임을 표시 - 디폴트 값 사용
        this.loadEquipmentData(),
        this.loadGuksaData(),
      ]);

      this.updateDataCache({ alarmData, equipmentData, guksaData });
      this.updateStateManager(alarmData, equipmentData, guksaData);

      // 초기 로드 시에만 디폴트 값으로 UI 업데이트
      this.updateUIWithDefaults(alarmData);
    } catch (error) {
      this.handleError('초기 기본 데이터 로드 실패', error);
    }
  }

  // 초기 로드 시에만 사용하는 UI 업데이트 (디폴트 값 적용: "전체 국사", "전송" 분야)
  async updateUIWithDefaults(alarmData) {
    // 뷰 버튼 초기화
    uiManager.updateViewButtons(this.currentMapType);

    // 전체 UI 업데이트
    await uiManager.updateAllUI();

    // 초기 로드 시에만 디폴트 분야로 설정
    uiManager.syncSectorSelection(CONFIG.DEFAULT_VIEW.SECTOR);

    // 대시보드 렌더링 후 이벤트 리스너 등록
    this.attachDashboardCardEvents();

    console.log('🎨 UI 요소 설정 완료');
  }

  // 전역 상태 관리자 변수 업데이트
  updateStateManager(alarmData, equipmentData, guksaData) {
    StateManager.setAlarmData(alarmData);
    StateManager.setEquipmentData(equipmentData);
    StateManager.set('guksaDataList', guksaData);
  }

  // 통합된 메시지 처리 메서드
  addMSG(message, type = 'info') {
    const messageManager = MessageManagerClass;
    const methodName = `add${type.charAt(0).toUpperCase() + type.slice(1)}Message`;

    if (typeof messageManager[methodName] === 'function') {
      messageManager[methodName](message);
    } else {
      const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
      const methods = { success: 'log', error: 'error', warning: 'warn', info: 'log' };
      console[methods[type] || 'log'](`${icons[type] || '📝'} ${type.toUpperCase()}:`, message);
    }
  }

  // 공통 에러 처리 간소화
  logError(context, error) {
    console.error(`❌ ${context}:`, error);
    this.addMSG(`${context}: ${error.message}`, 'error');
  }

  // 1. 경보 데이터 로드
  async loadAlarmData(isInitialLoad = false) {
    try {
      const startDateTime = document.getElementById('startDateTime').value;
      const endDateTime = document.getElementById('endDateTime').value;

      // 시작일시와 종료일시가 모두 입력되었는지 확인
      if (!startDateTime || !endDateTime) {
        this.addMSG('시작일시와 종료일시를 모두 입력해주세요.', 'error');
        return [];
      }

      // DB의 varchar(20) 형식에 맞춰 변환 (YYYY-MM-DD HH:MM:SS)
      const startDate = this.formatDateTimeForDB(new Date(startDateTime));
      const endDate = this.formatDateTimeForDB(new Date(endDateTime));

      console.log(`🔍 날짜 변환 결과 - 시작: ${startDate}, 종료: ${endDate}`);

      // 현재 선택된 국사 값만 가져오기 (분야는 항상 전체로 조회)
      let selectedGuksaId = null;

      if (!isInitialLoad) {
        // 통합 경보 조회 버튼을 눌렀을 때는 현재 선택된 국사만 사용
        const selectedGuksa = StateManager.get('selectedGuksa', '');
        if (selectedGuksa) {
          selectedGuksaId = selectedGuksa;
        }
      }
      // isInitialLoad가 true인 경우(페이지 로드시)는 기존 디폴트 값(null) 사용

      console.log(
        `🔍 경보 조회 조건: 국사=${selectedGuksaId || '전체'}, 분야=전체 (전역 데이터 저장용)`
      );

      // 분야는 항상 전체([])로 조회, 전역 데이터에 모든 분야 저장
      const response = await CommonUtils.callApi(CONFIG.API_ENDPOINTS.ALARM_DATA, {
        guksa_id: selectedGuksaId, // 선택된 국사 (null이면 전체)
        sectors: [], // 항상 전체 분야 조회 (빈 배열 = 전체)
        equip_name: null, // 전체 장비
        startDateTime: startDate,
        endDateTime: endDate,
      });

      const alarmData = this.validateArrayData(response?.alarms || response, '알람');

      // 초기 로드가 아닐 경우에만 상태 및 UI 업데이트
      if (!isInitialLoad) {
        this.updateDataCache({ alarmData });
        StateManager.setAlarmData(alarmData); // 전체 분야 데이터를 전역 상태에 저장
        uiManager.updateUI(alarmData); // UI는 현재 선택된 분야로 필터링하여 표시
      }

      return alarmData;
    } catch (error) {
      this.handleError('경보 데이터 로드 실패', error);
      return [];
    }
  }

  // 2.장비 데이터 로드
  async loadEquipmentData() {
    const selectedSector = StateManager.get('selectedSector', CONFIG.DEFAULT_VIEW.SECTOR);
    const response = await CommonUtils.callApi(CONFIG.API_ENDPOINTS.EQUIPMENT_DATA, {
      sector: selectedSector,
    });

    return this.validateArrayData(response?.equipments || response, '장비');
  }

  // 3. 국사 데이터 로드
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

  // Date 객체를 DB의 varchar(20) 형식(YYYY-MM-DD HH:MM:SS)으로 변환
  formatDateTimeForDB(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      throw new Error('유효한 Date 객체가 필요합니다.');
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
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

      // 1. 즉시 로딩 상태 표시
      sectorLoadingManager.startSectorChangeLoading('sidebar-radio');

      // 2. 작은 딜레이 후 실제 상태 변경 (UI 업데이트 우선 처리)
      setTimeout(() => {
        try {
          // 상태 변경을 StateManager에 위임
          // StateManager 리스너가 모든 후속 작업을 처리
          StateManager.setSelectedSector(selectedSector, { source: 'sidebar-radio' });
        } catch (error) {
          sectorLoadingManager.showError(error, 'sidebar-radio');
        }
      }, 50);
    } catch (error) {
      console.error('사이드바 분야 변경 처리 실패:', error);
      sectorLoadingManager.showError(error, 'sidebar-radio');
    }
  }

  updateDataAfterSectorChange() {
    // ✅ 최적화: StateManager의 캐싱된 데이터 사용
    uiManager.updateSidebarEquipmentList();
    uiManager.updateAlarmTable();
  }

  cleanupAllMapInstance() {
    try {
      // 모든 맵 컴포넌트 정리
      [this.equipmentMapComponent, this.guksaMapComponent, this.equipMapComponent].forEach(
        (component) => {
          if (component) {
            component.destroy();
            component = null;
          }
        }
      );

      // StateManager 상태 초기화
      StateManager.setCurrentMapData([], [], null, []);

      // DOM 정리
      const mapContainer = document.getElementById('map-container');
      if (mapContainer) {
        mapContainer.innerHTML = '';
      }
    } catch (error) {
      console.error('맵 정리 중 오류:', error);
    }
  }

  // 맵 인스턴스 정리, 초기화
  async createAndRenderMap(equipId) {
    try {
      // 기존 인스턴스 정리
      this.cleanupAllMapInstance();

      const currentMapType = this.currentMapType || 'equip';

      if (currentMapType === 'equip') {
        // 1. 장비 기준 맵
        this.equipmentMapComponent = new EquipmentMapComponent('map-container');

        const alarmData = StateManager.get('totalAlarmDataList', []);
        const equipmentData = StateManager.get('allEquipmentList', []);

        await this.equipmentMapComponent.renderEquipmentTopology(equipId, equipmentData, [], {
          showProgress: true,
          showAllSectors: true,
        });

        // 맵 생성 완료 후 StateManager에 맵 상태 업데이트
        if (this.equipmentMapComponent?.nodes) {
          console.log(
            `✅ 장비 맵 생성 성공: ${equipId} (노드 ${this.equipmentMapComponent.nodes.length}개)`
          );

          let baseNode = this.equipmentMapComponent.nodes.find(
            (node) => String(node.equip_id || node.id || '').trim() === String(equipId).trim()
          );

          if (baseNode) {
            console.log(
              `✅ baseNode 설정 성공: ${baseNode.equip_name || baseNode.name || baseNode.equip_id}`
            );
          }

          StateManager.setCurrentMapData(
            this.equipmentMapComponent.nodes,
            this.equipmentMapComponent.links,
            baseNode || null,
            []
          );
        }
      } else {
        // 2. 국사 기준 맵
        this.guksaMapComponent = new GuksaMapComponent('map-container');

        const alarmData = StateManager.get('totalAlarmDataList', []);
        const equipmentData = StateManager.get('allEquipmentList', []);

        // 선택된 장비의 국사명 찾기
        const targetEquip =
          alarmData.find((alarm) => alarm.equip_id === equipId) ||
          equipmentData.find((equip) => equip.equip_id === equipId);

        if (targetEquip && targetEquip.guksa_name) {
          await this.guksaMapComponent.renderGuksaMap(equipmentData, {
            selectedGuksa: targetEquip.guksa_name,
            showProgress: true,
          });

          console.log(`✅ 국사 맵 생성 성공: ${targetEquip.guksa_name}`);
        }
      }
    } catch (error) {
      console.error(`❌ 맵 생성 실패 (${equipId}):`, error);
      this.handleMapError(equipId, error);
    }
  }

  // 국사 토폴로지 로드
  async loadGuksaTopology(equipId) {
    try {
      console.log(`🏢 국사 토폴로지 로드: ${equipId}`);

      CommonUtils.showMapLoadingMessage?.(
        `장비 ${equipId}가 속한 국사의 토폴로지 데이터를 수집하고 분석 중입니다`
      );

      await this.createAndRenderMap(equipId);
    } catch (error) {
      this.handleMapError(equipId, error);
    }
  }

  // 장비 토폴로지 로드 실패 처리
  handleMapError(equipId, error) {
    console.error(`NW 토폴로지 로드 실패 (${equipId}):`, error);

    // 에러 시 인스턴스 정리
    this.cleanupAllMapInstance();

    CommonUtils.showMapErrorMessage?.(`NW 토폴로지 로드에 실패했습니다.<br> ${error.message}`);
  }

  // 공통 에러 처리
  handleError(message, error) {
    this.logError(message, error);
  }

  // 초기화 성공 메시지 표시
  showInitializationSuccess() {
    MessageManager.addMessage?.('✅ AI Detector 시스템을 성공적으로 로드했습니다.', {
      type: 'success',
    });
  }

  // 국사 변경 이벤트 처리
  handleGuksaChange(event) {
    try {
      const selectedGuksa = event.target.value;
      StateManager.set('selectedGuksa', selectedGuksa);

      console.log(`🏢 국사 변경: ${selectedGuksa || '전체'} (자동 필터링 비활성화)`);
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
      uiManager.updateViewButtons(this.currentMapType);

      // 기존 맵 정리
      this.cleanupAllMapInstance();

      const mapTypeName = mapType === 'equip' ? '장비 기준' : '국사 기준';

      // 맵뷰 변경 메시지 표시
      CommonUtils.showMapViewChangeMessage?.(mapTypeName);

      // 현재 선택된 장비가 있으면 새로운 뷰 모드로 다시 렌더링
      const selectedEquipment = StateManager.get('selectedEquipment');
      if (selectedEquipment) {
        if (mapType === 'equip') {
          this.loadEquipmentTopology(selectedEquipment);
        } else {
          this.loadGuksaTopology(selectedEquipment);
        }
      }

      console.log(`👁️ 뷰 변경: ${mapType}`);
    } catch (error) {
      console.error('뷰 변경 실패:', error);
    }
  }

  // ========== 장애점 분석 기능  ==========

  // 장애점 분석 이벤트 처리 (메인 진입점)
  async handleFaultAnalysis() {
    // 🔒 중복 실행 방지 (유일한 방어)
    if (this._isAnalyzing) {
      return;
    }

    this._isAnalyzing = true;

    // 🔧 버튼 상태 복구 함수 (중복 코드 방지)
    const restoreButtonState = () => {
      console.log('🔄 버튼 상태 복구 실행');
      this.updateAnalysisButtonState(false);
      this._isAnalyzing = false;
      this.ensureTooltipEventsAfterAnimation();
    };

    try {
      console.log('🔍 장애점 분석 시작...');

      // 현재 맵 데이터 확인
      const currentMapData = this.getCurrentMapData();
      if (!currentMapData) {
        console.warn('⚠️ 맵 데이터가 없어서 분석을 중단합니다.');
        restoreButtonState(); // ✅ 상태 복구 추가
        return;
      }

      if (!this.validateMapData(currentMapData)) {
        console.warn('⚠️ 맵 데이터 검증 실패로 분석을 중단합니다.');
        restoreButtonState(); // ✅ 상태 복구 추가
        return;
      }

      // MW 실시간 점검 체크박스 상태 확인
      const mwCheckbox = document.getElementById('mw-check');
      const isMwRealTimeCheck = mwCheckbox && mwCheckbox.checked;
      console.log('🔍 M/W 실시간 SNMP 점검 상태:', isMwRealTimeCheck ? '활성화' : '비활성화');

      // 버튼 UI 업데이트 (UX용)
      this.updateAnalysisButtonState(true);

      // 분석 완료 콜백 (1-7단계 모두 완료 후 호출)
      const onAnalysisComplete = () => {
        console.log('🔄 전체 분석 완료 콜백 호출됨 - 버튼 상태 복구');
        restoreButtonState();
      };

      // 장애점 분석 실행 (MW 실시간 SNMP 점검 상태 전달)
      await failurePointManager.analyzeFailurePoints(
        currentMapData.nodes,
        currentMapData.links,
        currentMapData.alarms,
        onAnalysisComplete,
        isMwRealTimeCheck // MW 실시간 SNMP 점검 상태 전달
      );

      console.log('✅ 장애점 분석 호출 완료 (비동기 진행 중)');
    } catch (error) {
      this.handleError('장애점 분석 실패', error);
      // 에러 발생 시에도 버튼 상태 복구
      restoreButtonState(); // ✅ 통합된 복구 함수 사용
    }
  }

  // 분석 버튼 상태 업데이트
  updateAnalysisButtonState(isAnalyzing) {
    const faultPointBtn = document.getElementById('fault-point-btn');

    if (faultPointBtn) {
      faultPointBtn.disabled = isAnalyzing;
      faultPointBtn.textContent = isAnalyzing ? '분석 중...' : '장애점 찾기';
      faultPointBtn.style.opacity = isAnalyzing ? '0.6' : '1';
    }
  }

  // 애니메이션 후 툴팁 이벤트 정상화 확인
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

  // 현재 맵 데이터 조회 (장애점 분석용)
  getCurrentMapData() {
    try {
      console.log('🗺️ 현재 맵 데이터 조회 중...');

      // 1. 먼저 선택된 장비가 있는지 확인
      const selectedEquipment = StateManager.get('selectedEquipment');
      if (!selectedEquipment) {
        this.addMSG('📌 장애점 분석 대상 장비가 없습니다.', 'error');
        return null;
      }

      // 2. StateManager에서 현재 맵 데이터 조회
      const mapData = StateManager.getCurrentMapData();

      if (!mapData) {
        this.addMSG(
          '📌 분석할 NW 토폴로지가 없습니다.<br>' +
            '장비 선택 후 토폴로지가 로드되지 않았습니다. 다시 장비를 선택해주세요.',
          'error'
        );
        return null;
      }

      // 3. 노드 데이터 확인
      if (!mapData.nodes || mapData.nodes.length === 0) {
        this.addMSG(
          '📌 분석할 장비 노드가 없습니다.<br>' +
            '장비를 다시 선택하거나 페이지를 새로고침 후 시도해주세요.',
          'error'
        );
        return null;
      }

      // 4. 전체 경보 데이터 확인 (mapData.alarms가 아닌 전역 데이터 확인)
      const totalAlarmData = StateManager.get('totalAlarmDataList', []);
      if (!totalAlarmData || totalAlarmData.length === 0) {
        this.addMSG(
          '📌 분석할 경보 데이터가 없습니다.<br>' +
            '"통합 경보 조회" 버튼을 눌러 경보 데이터를 먼저 조회해주세요.',
          'error'
        );
        return null;
      }

      // 5. 맵 데이터에 전체 경보 데이터 추가
      const enhancedMapData = {
        ...mapData,
        alarms: totalAlarmData, // 전역 경보 데이터 사용
      };

      console.log(
        `✅ 맵 데이터 조회 성공: 노드 ${enhancedMapData.nodes.length}개, 링크 ${
          enhancedMapData.links ? enhancedMapData.links.length : 0
        }개, 경보 ${enhancedMapData.alarms.length}건`
      );

      return enhancedMapData;
    } catch (error) {
      console.error('❌ 현재 맵 데이터 조회 실패:', error);
      this.addMSG('📌 맵 데이터 조회 중 오류가 발생했습니다.', 'error');
      return null;
    }
  }

  // 맵 데이터 유효성 검사
  validateMapData(mapData) {
    const { nodes, links, alarms } = mapData;

    console.log(
      `🔍 맵 데이터 검증: 노드 ${nodes.length}개, 링크 ${links ? links.length : 0}개, 경보 ${
        alarms ? alarms.length : 0
      }건`
    );

    // 1. 기본 데이터 구조 검증
    if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
      this.addMSG('📌 분석할 장비 노드가 없습니다. 장비를 다시 선택해주세요.', 'error');
      return false;
    }

    // 2. 경보 데이터 검증
    if (!Array.isArray(alarms) || alarms.length === 0) {
      console.warn('⚠️ 전체 경보 데이터가 없습니다.');
      this.addMSG(
        '📌 현재 조회된 경보 데이터가 없습니다.<br>' +
          '"통합 경보 조회" 버튼을 눌러 경보 데이터를 먼저 조회해주세요.',
        'error'
      );
      return false;
    }

    // 3. 선택된 장비와 관련된 경보가 있는지 확인
    const selectedEquipment = StateManager.get('selectedEquipment');
    const relatedAlarms = alarms.filter((alarm) =>
      nodes.some(
        (node) =>
          String(node.equip_id || node.id) === String(alarm.equip_id) ||
          String(node.equip_id || node.id) === String(selectedEquipment)
      )
    );

    if (relatedAlarms.length === 0) {
      // 노드별 경보 상세 확인
      const nodeAlarmCounts = nodes.map((node) => ({
        equip_id: node.equip_id || node.id,
        equip_name: node.equip_name || node.name,
        alarmCount: node.alarmCount || 0,
      }));
      console.log('🔍 노드별 경보 개수:', nodeAlarmCounts);

      this.addMSG(
        '📌 선택된 장비와 관련된 경보가 없습니다.<br>' +
          '경보가 발생한 다른 장비를 선택하거나 시간 범위를 조정해주세요.',
        'error'
      );
      return false;
    }

    console.log(
      `✅ 데이터 검증 완료: 노드 ${nodes.length}개, 링크 ${links ? links.length : 0}개, ` +
        `전체 경보 ${alarms.length}건, 관련 경보 ${relatedAlarms.length}건`
    );
    return true;
  }

  // ############# AI RAG 팝업 관련 메서드들 ##################
  // AI RAG 모달 팝업 열기 (RAGPopupWindow 클래스로 위임)
  async openFaultDetectorPopup() {
    try {
      console.log('🚀 AI RAG 장애분석 팝업 열기 (RAGPopupWindow로 위임)');
      await ragPopupWindow.openFaultDetectorPopup();
    } catch (error) {
      console.error('❌ AI 장애분석 팝업 열기 실패:', error);
      this.handleError('AI 장애분석 시작 실패', error);
    }
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
      console.log(`📋 테이블 행 선택: ${equipInfo.equipId} (${equipInfo.equipName})`);

      // 선택된 경보 정보만 표시 (맵 새로 그리지 않음)
      if (equipInfo.equipId) {
        this.showEquipmentSelectedMessage(equipInfo);
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
      this.addMSG(messageContent, 'error');
    } catch (error) {
      this.handleError('장비 선택 메시지 표시 실패', error);
    }
  }

  generateEquipmentMessageContent(equipment, equipmentAlarms, validAlarms) {
    // 경보가 있는 경우에만 알람 디테일 HTML 생성
    let alarmDetails = '';
    if (equipmentAlarms && equipmentAlarms.length > 0) {
      const messageManager = MessageManagerClass;
      const generatedDetails = messageManager.generateDashboardAlarmListHTML
        ? messageManager.generateDashboardAlarmListHTML(equipmentAlarms)
        : '';

      // 생성된 HTML이 실제로 내용이 있는지 확인 (공백이나 빈 태그 제외)
      if (
        generatedDetails &&
        generatedDetails.trim() &&
        !generatedDetails.match(/^<div[^>]*>\s*<\/div>$/)
      ) {
        alarmDetails = generatedDetails;
      }
    }

    const baseMessage = `<strong>📌 경보발생 장비가 선택되었습니다.</strong><br><br>
           • 분야: ${equipment.sector || '알수없음'}<br>
           • 장비유형: ${equipment.equip_type || '알수없음'}<br>
           • 장비ID: ${equipment.equip_id}<br>
           • 장비명: ${equipment.equip_name}<br>
           • 국사: ${equipment.guksa_name || '알수없음'}<br><br>
           • 경보현황: 전체 ${equipmentAlarms.length}건 (유효 ${validAlarms.length}건)`;

    // 경보 상세 정보가 있으면 추가, 없으면 기본 메시지만 반환
    return alarmDetails ? `${baseMessage}<br>${alarmDetails}` : baseMessage;
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
      if (!selectedEquipId) {
        // 선택 해제 시 상태 초기화
        StateManager.set('selectedEquipment', null);
        return;
      }

      const alarmData = StateManager.get('totalAlarmDataList', []);
      const selectedEquipment = alarmData.find((alarm) => alarm.equip_id === selectedEquipId);

      if (selectedEquipment) {
        // 선택된 장비를 상태에 저장
        StateManager.set('selectedEquipment', selectedEquipId);

        this.showEquipmentSelectedMessage(selectedEquipment);
        this.loadEquipmentTopology(selectedEquipId);

        console.log(`✅ 장비 선택 완료: ${selectedEquipId} (${selectedEquipment.equip_name})`);
      } else {
        console.warn(`⚠️ 선택된 장비 정보를 찾을 수 없음: ${selectedEquipId}`);
        StateManager.set('selectedEquipment', null);
      }
    } catch (error) {
      console.error('장비 선택 처리 실패:', error);
      StateManager.set('selectedEquipment', null);
    }
  }

  // 사이드바 장비 검색 필터 처리
  handleEquipmentFilterReset() {
    try {
      const filterInput = uiManager.getElement('equipFilterInput');
      if (filterInput) {
        filterInput.value = '';
      }
      uiManager.updateSidebarEquipmentList();
      console.log('🔄 장비 검색 필터 초기화 완료');
    } catch (error) {
      console.error('장비 검색 필터 초기화 실패:', error);
    }
  }

  generateEquipmentListFromAlarms(selectedSector, selectedGuksa) {
    console.log(`🔍 장비 목록 생성: 분야=${selectedSector}, 국사=${selectedGuksa || '전체'}`);

    // 🔧 통합: 공통 메서드들 사용
    const filteredAlarms = uiManager.filterAlarmsBySectorAndGuksa(selectedSector, selectedGuksa);
    const equipmentList = uiManager.createEquipmentListFromAlarms(filteredAlarms);

    console.log(
      `📊 생성된 장비 목록: ${equipmentList.length}개 (필터링된 경보: ${filteredAlarms.length}건)`
    );
    return equipmentList;
  }

  applyEquipmentFilter(searchTerm) {
    try {
      const selectedSector = StateManager.get('selectedSector', CONFIG.DEFAULT_VIEW.SECTOR);
      const selectedGuksa = StateManager.get('selectedGuksa', '');

      // 🔧 통합: 공통 메서드들 조합 사용
      const basicFiltered = uiManager.filterAlarmsBySectorAndGuksa(selectedSector, selectedGuksa);
      const searchFiltered = uiManager.filterAlarmsBySearch(basicFiltered, searchTerm);
      const equipmentList = uiManager.createEquipmentListFromAlarms(searchFiltered);

      console.log(
        `🔍 "${searchTerm}" 검색: 매칭 경보 ${searchFiltered.length}건 → 장비 ${equipmentList.length}개`
      );
      uiManager.updateEquipmentSelectWithFilter(equipmentList, searchTerm);
    } catch (error) {
      console.error('장비 검색 필터 처리 실패:', error);
    }
  }

  // 하단 경보 테이블 검색 필터 테이블 검색
  performTableSearch() {
    try {
      const searchInput = uiManager.getElement('table-search-input');
      const searchTerm = searchInput?.value?.trim();

      if (!searchTerm) {
        this.resetTableFilter();
        return;
      }

      const filteredData = this.getSearchFilteredData(searchTerm);
      uiManager.updateTableWithFilteredData(filteredData);

      console.log(`🔍 테이블 검색: "${searchTerm}" - ${filteredData.length}개 결과`);
    } catch (error) {
      console.error('테이블 검색 실패:', error);
    }
  }

  // 하단 경보 테이블 검색 필터 테이블 검색
  getSearchFilteredData(searchTerm) {
    const filterData = uiManager.getFilterData();
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

      return simpleMatch?.(searchText, searchTerm);
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

  // 하단 경보 테이블 검색 필터 리셋
  resetTableFilter() {
    try {
      const searchInput = uiManager.getElement('table-search-input');
      if (searchInput) {
        searchInput.value = '';
      }
      uiManager.updateAlarmTable();
      console.log('🔄 테이블 필터 초기화 완료');
    } catch (error) {
      console.error('테이블 필터 초기화 실패:', error);
    }
  }

  // 하단 경보 테이블 CSV 다운로드 구현
  downloadCSVFile() {
    try {
      const filterData = uiManager.getFilterData();
      const filteredAlarms = uiManager.getFilteredAlarms(filterData);

      if (filteredAlarms.length === 0) {
        this.addMSG('다운로드할 데이터가 없습니다.', 'error');
        return;
      }

      const csvContent = this.generateCSVContent(filteredAlarms);
      this.performCSVDownload(csvContent, filterData);

      this.addMSG(`📊 ${filteredAlarms.length}건의 경보 데이터를 다운로드했습니다.`, 'success');
    } catch (error) {
      this.handleError('CSV 다운로드 실패', error);
    }
  }

  // 하단 경보 테이블 CSV 다운로드 구현
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
        `"${alarm.sector === '선로' || alarm.valid_yn === 'Y' ? '유효' : '무효'}"`,
        `"${alarm.occur_datetime || ''}"`,
        `"${alarm.equip_id || ''}"`,
        `"${alarm.equip_type || ''}"`,
        `"${alarm.equip_name || ''}"`,
        `"${alarm.alarm_message || ''}"`,
      ].join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  }

  performCSVDownload(csvContent, filterData) {
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
    this.cleanupAllMapInstance();
    this.dataCache.clear();

    // RAG 팝업 정리
    ragPopupWindow.destroy();

    // UI 매니저 정리
    uiManager.destroy();

    // 이벤트 리스너 정리
    if (this._keyboardHandlersAttached) {
      document.removeEventListener('keydown', this.handleGlobalKeydown);
      this._keyboardHandlersAttached = false;
    }

    console.log('🧹 FaultDashboardApp 메모리 정리 완료');
  }

  // 채팅창 메시지 초기화
  clearChatMessages() {
    try {
      console.log('🧹 채팅창 메시지 초기화 시작...');

      // DOM 요소를 직접 찾기
      let chatContainer = document.getElementById('chat-messages-area');

      if (!chatContainer) {
        // 대체 선택자로 시도
        chatContainer = document.querySelector('.chat-messages-container');
        if (!chatContainer) {
          console.error('❌ 채팅 컨테이너를 찾을 수 없습니다');
          return;
        }
      }

      // 모든 메시지 제거
      chatContainer.innerHTML = '';

      // 기본 시스템 메시지 다시 추가
      const currentTime = new Date().toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
      });

      const systemMessage = DOMBuilder.createDiv(
        'chat-message system',
        `
        <div class="message-content">
          💡 장애점 찾기를 클릭하면 AI 분석 결과가 여기에 표시됩니다.
        </div>
        <div class="message-time">${currentTime}</div>
      `
      );

      chatContainer.appendChild(systemMessage);

      // 스크롤을 맨 아래로 이동
      chatContainer.scrollTop = chatContainer.scrollHeight;

      console.log('✅ 채팅 메시지 초기화 완료');
    } catch (error) {
      console.error('❌ 채팅 메시지 초기화 실패:', error);
    }
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

  // 장애점 분석 진행 상태 확인
  isAnalysisInProgress() {
    return this._isAnalyzing;
  }

  // 장애점 분석 관련 요소인지 확인
  isAnalysisRelatedElement(target) {
    const analysisRelatedIds = ['fault-point-btn'];
    const analysisRelatedClasses = ['chat-container', 'chat-messages', 'chat-input-container'];

    // ID 확인
    if (analysisRelatedIds.includes(target.id)) {
      return true;
    }

    // 클래스 확인
    for (const className of analysisRelatedClasses) {
      if (target.closest(`.${className}`)) {
        return true;
      }
    }

    // 채팅 관련 링크 확인
    if (
      target.tagName === 'A' &&
      (target.textContent.includes('계속') ||
        target.textContent.includes('중단') ||
        target.id.includes('continue-analysis') ||
        target.id.includes('stop-analysis'))
    ) {
      return true;
    }

    return false;
  }

  // 타겟 정보 추출
  getTargetInfo(target) {
    if (target.id) {
      switch (target.id) {
        case 'equip-view-btn':
          return '장비뷰';
        case 'guksa-view-btn':
          return '국사뷰';
        case 'equipFilterBtn':
          return '장비필터';
        case 'equipResetBtn':
          return '필터리셋';
        default:
          return target.id;
      }
    }

    if (target.textContent) {
      return target.textContent.trim().substring(0, 20);
    }

    return '알 수 없는 요소';
  }

  // 분석 제어 링크 이벤트 처리
  attachAnalysisControlLinks(originalTarget) {
    const continueLink = document.getElementById('continue-analysis');
    const stopLink = document.getElementById('stop-analysis');

    if (continueLink) {
      continueLink.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('🔄 사용자가 장애점 분석 계속을 선택했습니다.');

        // 메시지 제거
        const messageElement = continueLink.closest('.chat-message');
        if (messageElement) {
          messageElement.remove();
        }

        // 간단한 확인 메시지
        this.addMSG('✅ 장애점 분석을 계속 진행합니다.', 'success');
      });
    }

    if (stopLink) {
      stopLink.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('🛑 사용자가 장애점 분석 중단을 선택했습니다.');

        this.stopAnalysisAndExecuteOriginalAction(originalTarget);
      });
    }
  }
  // 분석 중단 후 원래 액션 실행
  async stopAnalysisAndExecuteOriginalAction(originalTarget) {
    try {
      // 진행 중인 분석 중단
      if (failurePointManager) {
        // 기존 하이라이트 제거
        failurePointManager.clearHighlights();
        console.log('🛑 장애점 분석이 중단되었습니다.');
      }

      // 분석 버튼 상태 복원 (통합된 메서드 사용)
      this.restoreFaultAnalysisButton();

      // 메시지 제거
      const messageElement = document.querySelector('#stop-analysis')?.closest('.chat-message');
      if (messageElement) {
        messageElement.remove();
      }

      // 중단 완료 메시지
      this.addMSG('🛑 장애점 분석이 중단되었습니다.', 'warning');

      // 잠시 후 원래 액션 실행
      setTimeout(() => {
        this.executeOriginalAction(originalTarget);
      }, 500);
    } catch (error) {
      console.error('❌ 분석 중단 처리 중 오류:', error);
      this.addMSG('❌ 분석 중단 처리 중 오류가 발생했습니다.', 'error');
    }
  }

  // 원래 액션 실행
  executeOriginalAction(target) {
    console.log('🔄 원래 액션 실행:', target.id || target.textContent);

    try {
      // 원래 클릭했던 버튼의 액션 실행
      switch (target.id) {
        case 'equip-view-btn':
          this.handleViewToggle('equip');
          break;
        case 'guksa-view-btn':
          this.handleViewToggle('guksa');
          break;
        case 'equipFilterBtn':
          this.handleEquipmentFilter();
          break;
        case 'equipResetBtn':
          this.handleEquipmentFilterReset();
          break;
        default:
          console.log('⚠️ 처리할 수 없는 액션:', target.id);
      }
    } catch (error) {
      console.error('❌ 원래 액션 실행 중 오류:', error);
    }
  }

  // 장애점 분석 버튼 상태 복원
  restoreFaultAnalysisButton() {
    const faultPointBtn = document.getElementById('fault-point-btn');
    if (faultPointBtn) {
      faultPointBtn.disabled = false;
      faultPointBtn.textContent = '장애점 찾기';
      faultPointBtn.style.opacity = '1';
    }
  }
}

// 싱글톤 인스턴스 생성
export const faultDashboardApp = new FaultDashboardApp();
