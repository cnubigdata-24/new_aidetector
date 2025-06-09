/**
 * 통합 상태 관리 모듈: 전역 인스턴스 싱글톤 패턴 적용
 * 파일 위치: src/core/StateManager.js
 */

import { formatDateTime } from '../utils/CommonUtils.js';

// ================================
// 1. 상태 타입 및 상수 정의
// ================================

const STATE_TYPES = {
  ALARM_DATA: 'alarmData',
  SELECTED_SECTOR: 'selectedSector',
  SELECTED_VIEW: 'selectedView',
  CURRENT_PAGE: 'currentPage',
  EQUIPMENT_DATA: 'equipmentData',
  UI_STATE: 'uiState',
  MAP_STATE: 'mapState',
  FILTER_STATE: 'filterState',
};

const DEFAULT_STATE = {
  // 알람 관련 데이터
  totalAlarmDataList: [],
  summaryAlarmData: [],
  filteredAlarmData: [],

  // 장비 관련 데이터
  allEquipmentData: [],
  allEquipmentList: [],
  filteredEquipmentList: [],

  // UI 상태
  selectedSector: 'IP',
  selectedView: 'equip', // 'equip' | 'guksa'
  currentPage: 1,

  // 필터 상태
  selectedGuksa: '',
  selectedEquipment: '',
  timeFilter: '30',

  // 맵 상태
  currentMapData: null,
  currentRootCauseResults: {
    nodes: [],
    nodeNames: [],
    timestamp: null,
  },

  // 현재 맵 상태 - 노드, 링크, 기준 노드, 경보 데이터
  currentMapNodes: [],
  currentMapLinks: [],
  currentBaseNode: null,
  currentMapAlarms: [],

  // 기타 UI 상태
  sidebarCollapsed: false,
  tableColumnsState: {},
  paginationState: {
    currentPage: 1,
    pageSize: 5,
    totalItems: 0,
  },
};

const SECTORS = ['MW', '선로', '전송', 'IP', '무선', '교환'];

// ================================
// 2. StateManager 클래스
// ================================

class StateManager {
  constructor() {
    this.state = { ...DEFAULT_STATE };
    this.listeners = new Map();
    this.history = [];
    this.maxHistorySize = 50;
    this.isInitialized = false;
    this.syncInProgress = false; // 순환 참조 방지

    this.init();
    console.log('🗂️ StateManager 초기화 완료');
  }

  /**
   * 초기화 (안전성 강화)
   */
  init() {
    try {
      this.setupEventSystem();
      this.setupLegacyCompatibility();
      this.isInitialized = true;
    } catch (error) {
      console.error('StateManager 초기화 중 오류:', error);
    }
  }

  // ================================
  // 3. 기본 상태 관리 메서드 (안전성 강화)
  // ================================

  /**
   * 상태 값 가져오기 (안전성 강화)
   */
  get(key, defaultValue = undefined) {
    try {
      const value = this.state[key];
      return value !== undefined ? value : defaultValue;
    } catch (error) {
      console.error(`상태 조회 중 오류 (${key}):`, error);
      return defaultValue;
    }
  }

  /**
   * 상태 값 설정 (안전성 강화)
   */
  set(key, value, options = {}) {
    try {
      const { silent = false, source = 'unknown' } = options;

      const oldValue = this.state[key];

      // 값이 실제로 변경된 경우만 처리
      if (this.isValueChanged(oldValue, value)) {
        // 히스토리에 기록
        this.addToHistory(key, oldValue, value, source);

        // 상태 업데이트
        this.state[key] = value;

        // 이벤트 발생 (silent 모드가 아닌 경우)
        if (!silent) {
          this.emit(key, {
            key,
            value,
            oldValue,
            source,
            timestamp: new Date(),
          });

          // 전역 변경 이벤트도 발생
          this.emit('stateChanged', {
            key,
            value,
            oldValue,
            source,
            timestamp: new Date(),
          });
        }

        // 기존 전역 변수 동기화 (순환 참조 방지)
        if (!this.syncInProgress) {
          this.syncLegacyGlobals(key, value);
        }

        console.log(`🗂️ 상태 변경: ${key} = ${this.stringifyValue(value)} (source: ${source})`);
      }

      return this;
    } catch (error) {
      console.error(`상태 설정 중 오류 (${key}):`, error);
      return this;
    }
  }

  /**
   * 다중 상태 값 설정
   */
  setState(newState, options = {}) {
    try {
      const { silent = false, source = 'batch' } = options;

      Object.entries(newState).forEach(([key, value]) => {
        this.set(key, value, { silent: true, source });
      });

      if (!silent) {
        this.emit('batchStateChanged', {
          changes: newState,
          source,
          timestamp: new Date(),
        });
      }

      return this;
    } catch (error) {
      console.error('다중 상태 설정 중 오류:', error);
      return this;
    }
  }

  /**
   * 상태 초기화
   */
  reset(keysToReset = null) {
    try {
      const resetKeys = keysToReset || Object.keys(DEFAULT_STATE);

      resetKeys.forEach((key) => {
        if (DEFAULT_STATE.hasOwnProperty(key)) {
          this.set(key, DEFAULT_STATE[key], { source: 'reset' });
        }
      });

      console.log('🗂️ 상태 초기화 완료:', resetKeys);
      return this;
    } catch (error) {
      console.error('상태 초기화 중 오류:', error);
      return this;
    }
  }

  // ================================
  // 4. 특화된 상태 관리 메서드들
  // ================================

  /**
   * 전체 장비 경보 데이터 관리
   */
  setAlarmData(alarmData, options = {}) {
    try {
      const { source = 'api' } = options;

      let data = alarmData;

      this.setState(
        {
          totalAlarmDataList: Array.isArray(alarmData) ? [...alarmData] : [],
          summaryAlarmData: Array.isArray(alarmData) ? [...alarmData] : [],
        },
        { source }
      );

      this.setState({ totalAlarmDataList: data });

      if (!data) {
        console.warn('StateManager: 알람 데이터가 null/undefined입니다. 빈 배열로 설정합니다.');
        data = [];
      }

      if (!Array.isArray(data)) {
        console.warn('StateManager: 알람 데이터가 배열이 아닙니다:', typeof data, data);
        data = [];
      }

      console.log(`📊 StateManager: 알람 데이터 설정 - ${data.length}개 항목`);
      this.setState({ totalAlarmDataList: data });

      // ✅ 추가: 데이터 변경 시 자동 검증
      if (typeof window !== 'undefined' && window.verifyDataSync) {
        setTimeout(() => {
          window.verifyDataSync();
        }, 100);
      }

      // 필터링된 데이터도 업데이트
      this.updateFilteredAlarmData();

      return this;
    } catch (error) {
      console.error('알람 데이터 설정 중 오류:', error);
      return this;
    }
  }

  /**
   * 선택된 분야 Sector 변경
   */
  setSelectedSector(sector, options = {}) {
    try {
      const { source = 'user' } = options;

      if (SECTORS.includes(sector)) {
        this.set('selectedSector', sector, { source });
        this.set('currentPage', 1, { source: 'sector-change' }); // 페이지 초기화
        this.updateFilteredAlarmData();
      } else {
        console.warn(`잘못된 분야: ${sector}. 유효한 분야: ${SECTORS.join(', ')}`);
      }

      return this;
    } catch (error) {
      console.error('분야 선택 중 오류:', error);
      return this;
    }
  }

  /**
   * 선택된 뷰 View Mode 변경 (Equip, Guksa)
   */
  setSelectedView(view, options = {}) {
    try {
      const { source = 'user' } = options;

      if (['equip', 'guksa'].includes(view)) {
        this.set('selectedView', view, { source });
      } else {
        console.warn(`잘못된 뷰 타입: ${view}. 유효한 타입: equip, guksa`);
      }

      return this;
    } catch (error) {
      console.error('뷰 선택 중 오류:', error);
      return this;
    }
  }

  /**
   * 장비 기초 데이터 관리
   */
  setEquipmentData(equipmentData, options = {}) {
    try {
      const { source = 'api' } = options;

      let data = equipmentData;

      this.setState(
        {
          allEquipmentData: Array.isArray(equipmentData) ? [...equipmentData] : [],
          allEquipmentList: Array.isArray(equipmentData) ? [...equipmentData] : [],
          filteredEquipmentList: Array.isArray(equipmentData) ? [...equipmentData] : [],
        },
        { source }
      );

      // ✅ 추가: 데이터 검증
      if (!data) {
        console.warn('StateManager: 장비 데이터가 null/undefined입니다. 빈 배열로 설정합니다.');
        data = [];
      }

      if (!Array.isArray(data)) {
        console.warn('StateManager: 장비 데이터가 배열이 아닙니다:', typeof data, data);
        data = [];
      }

      console.log(`🔧 StateManager: 장비 데이터 설정 - ${data.length}개 항목`);
      this.setState({ allEquipmentData: data });

      return this;
    } catch (error) {
      console.error('장비 데이터 설정 중 오류:', error);
      return this;
    }
  }

  /**
   * 페이지네이션 상태 관리
   */
  setPagination(pageInfo, options = {}) {
    try {
      const currentPagination = this.get('paginationState', {});
      const newPagination = {
        ...currentPagination,
        ...pageInfo,
      };

      this.set('paginationState', newPagination, {
        source: 'pagination',
        ...options,
      });

      console.log(`📄 페이지네이션 상태 업데이트:`, newPagination);
      return this;
    } catch (error) {
      console.error('페이지네이션 설정 중 오류:', error);
      return this;
    }
  }

  // ================================
  // 5. 필터링 및 파생 상태 메서드
  // ================================

  /**
   * 분야 Sector로 필터링된 경보 데이터 업데이트
   */
  updateFilteredAlarmData() {
    try {
      const totalData = this.get('totalAlarmDataList', []);
      const selectedSector = this.get('selectedSector');

      const filteredData = totalData.filter(
        (item) => item && item.sector && item.sector.toLowerCase() === selectedSector.toLowerCase()
      );

      this.set('filteredAlarmData', filteredData, {
        silent: true,
        source: 'filter-update',
      });

      // 페이지네이션 정보도 업데이트
      this.setPagination(
        {
          totalItems: filteredData.length,
        },
        { source: 'filter-update' }
      );

      return filteredData;
    } catch (error) {
      console.error('필터링된 알람 데이터 업데이트 중 오류:', error);
      return [];
    }
  }

  /**
   * 현재 페이지의 알람 데이터 가져오기
   */
  getCurrentPageAlarmData() {
    try {
      const filteredData = this.get('filteredAlarmData', []);
      const currentPage = this.get('currentPage', 1);
      const pageSize = this.get('paginationState', {}).pageSize || 5;

      const startIndex = (currentPage - 1) * pageSize;
      const endIndex = startIndex + pageSize;

      return filteredData.slice(startIndex, endIndex);
    } catch (error) {
      console.error('현재 페이지 알람 데이터 조회 중 오류:', error);
      return [];
    }
  }

  /**
   * Sector 분야별 통계 가져오기
   */
  getSectorStats() {
    try {
      const totalData = this.get('totalAlarmDataList', []);
      const stats = {};

      SECTORS.forEach((sector) => {
        const sectorData = totalData.filter(
          (item) => item && item.sector && item.sector.toLowerCase() === sector.toLowerCase()
        );

        const validAlarms = sectorData.filter((item) => item.valid_yn === 'Y');
        const uniqueEquipment = new Set(sectorData.map((item) => item.equip_name));

        stats[sector] = {
          totalAlarms: sectorData.length,
          validAlarms: validAlarms.length,
          equipmentCount: uniqueEquipment.size,
          validPercentage:
            sectorData.length > 0 ? Math.round((validAlarms.length / sectorData.length) * 100) : 0,
        };
      });

      return stats;
    } catch (error) {
      console.error('분야별 통계 조회 중 오류:', error);
      return {};
    }
  }

  // ================================
  // 6. 맵 상태 관리
  // ================================

  /**
   * 현재 맵 데이터 설정 - 노드, 링크, 기준 노드, 경보 데이터 상태 관리
   */
  setCurrentMapData(nodes = [], links = [], baseNode = null, alarms = []) {
    try {
      console.log(`🗺️ 맵 데이터 설정: 노드 ${nodes.length}개, 링크 ${links.length}개`);

      // 맵에 노드가 없는 경우 모든 상태를 비움
      if (!nodes || nodes.length === 0) {
        this.set('currentMapNodes', [], { source: 'mapUpdate', silent: true });
        this.set('currentMapLinks', [], { source: 'mapUpdate', silent: true });
        this.set('currentBaseNode', null, { source: 'mapUpdate', silent: true });
        this.set('currentMapAlarms', [], { source: 'mapUpdate', silent: true });

        console.log('🗺️ 맵 상태 초기화 - 노드 없음');
      } else {
        this.set('currentMapNodes', nodes, { source: 'mapUpdate', silent: true });
        this.set('currentMapLinks', links, { source: 'mapUpdate', silent: true });
        this.set('currentBaseNode', baseNode, { source: 'mapUpdate', silent: true });

        // alarms는 더 이상 사용하지 않음 (getCurrentMapData에서 매칭)
        this.set('currentMapAlarms', [], { source: 'mapUpdate', silent: true });

        console.log(
          `🗺️ 맵 상태 업데이트: 노드 ${nodes.length}개, 링크 ${links.length}개, baseNode: ${
            baseNode ? '설정됨' : '⚠️ null'
          }`
        );
      }

      // 전체 맵 상태 변경 이벤트 발생
      this.emit('currentMapDataChanged', {
        nodes,
        links,
        baseNode,
        alarms: [], // 실시간 매칭하므로 빈 배열
      });

      return this;
    } catch (error) {
      console.error('맵 상태 설정 중 오류:', error);
      return this;
    }
  }

  /**
   * 현재 맵 데이터 조회 - 실제 맵 데이터와 경보 매칭 처리 포함
   */
  getCurrentMapData() {
    try {
      const nodes = this.get('currentMapNodes', []);
      const links = this.get('currentMapLinks', []);
      const baseNode = this.get('currentBaseNode', null);
      const totalAlarmData = this.get('totalAlarmDataList', []);

      // 노드가 없는 경우만 null 반환
      if (!nodes || nodes.length === 0) {
        return null;
      }

      // 이미 enriched된 데이터인지 확인
      const isAlreadyEnriched = nodes.length > 0 && nodes[0].hasOwnProperty('alarmMessages');

      let enrichedData;
      if (isAlreadyEnriched) {
        // 이미 enriched된 데이터도 경보 필터링은 다시 수행 (포함 매칭 적용)
        console.log(
          `🔄 이미 enriched된 데이터 재처리: 노드 ${nodes.length}개, 경보 ${totalAlarmData.length}건`
        );

        // preFilterMapRelatedAlarms를 사용하여 올바른 경보 필터링
        const mapRelatedAlarms = this.preFilterMapRelatedAlarms(nodes, links, totalAlarmData);

        enrichedData = {
          nodes: nodes,
          links: links,
          enrichedNodes: nodes,
          enrichedLinks: links,
          filteredAlarms: mapRelatedAlarms, // 포함 매칭이 적용된 올바른 필터링
        };
      } else {
        // 원본 데이터는 enrichMapDataWithAlarms 처리
        enrichedData = this.enrichMapDataWithAlarms(nodes, links, totalAlarmData);
      }

      return {
        nodes: enrichedData.nodes,
        links: enrichedData.links,
        baseNode,
        alarms: enrichedData.filteredAlarms,
      };
    } catch (error) {
      console.error('❌ 현재 맵 데이터 조회 실패:', error);
      return null;
    }
  }

  /**
   * 맵 데이터와 경보 데이터 매칭 (정확 매칭만)
   */
  enrichMapDataWithAlarms(nodes, links, totalAlarmData) {
    try {
      // 현재 맵과 관련된 경보만 사전 필터링
      const mapRelatedAlarms = this.preFilterMapRelatedAlarms(nodes, links, totalAlarmData);

      // 경보 데이터를 equip_id로 그룹화 (정확 매칭만)
      const alarmsByEquipId = new Map();
      mapRelatedAlarms.forEach((alarm) => {
        const equipId = String(alarm.equip_id || '').trim();
        if (equipId && alarm.alarm_message) {
          if (!alarmsByEquipId.has(equipId)) {
            alarmsByEquipId.set(equipId, []);
          }
          alarmsByEquipId.get(equipId).push(alarm.alarm_message);
        }
      });

      // 노드에 경보 정보 추가 (정확 매칭만)
      const enrichedNodes = nodes.map((node) => {
        const nodeId = String(node.equip_id || node.id || '').trim();
        const alarmMessages = alarmsByEquipId.get(nodeId) || [];

        return {
          ...node,
          alarmMessages: alarmMessages,
          alarmCount: alarmMessages.length,
          hasAlarms: alarmMessages.length > 0,
        };
      });

      // 링크에 경보 정보 추가 (정확 매칭만)
      const enrichedLinks = links.map((link) => {
        const linkId = String(link.link_name || link.id || '').trim();
        const alarmMessages = alarmsByEquipId.get(linkId) || [];

        return {
          ...link,
          alarmMessages: alarmMessages,
          alarmCount: alarmMessages.length,
          hasAlarms: alarmMessages.length > 0,
        };
      });

      return {
        nodes: enrichedNodes,
        links: enrichedLinks,
        enrichedNodes: enrichedNodes,
        enrichedLinks: enrichedLinks,
        filteredAlarms: mapRelatedAlarms,
      };
    } catch (error) {
      console.error('enrichMapDataWithAlarms 오류:', error);
      return {
        nodes: nodes || [],
        links: links || [],
        enrichedNodes: nodes || [],
        enrichedLinks: links || [],
        filteredAlarms: [],
      };
    }
  }

  /**
   * 현재 맵과 관련된 경보만 사전 필터링
   */
  preFilterMapRelatedAlarms(nodes, links, totalAlarmData) {
    try {
      // 현재 맵의 모든 ID 수집
      const allNodeIds = nodes
        .map((n) => String(n.equip_id || n.id || '').trim())
        .filter((id) => id);
      const allLinkIds = links
        .map((l) => String(l.link_name || l.id || '').trim())
        .filter((id) => id);
      const allMapIds = [...allNodeIds, ...allLinkIds];

      // 정확 매칭만 수행
      const relatedAlarms = totalAlarmData.filter((alarm) => {
        const alarmEquipId = String(alarm.equip_id || '').trim();
        return alarmEquipId && allMapIds.includes(alarmEquipId);
      });

      return relatedAlarms;
    } catch (error) {
      console.error('맵 관련 경보 필터링 오류:', error);
      return [];
    }
  }

  // ================================
  // 7. 이벤트 시스템 (안전성 강화)
  // ================================

  /**
   * 이벤트 리스너 등록
   */
  on(event, callback) {
    try {
      if (typeof callback !== 'function') {
        console.warn('이벤트 리스너는 함수여야 합니다:', typeof callback);
        return () => {};
      }

      if (!this.listeners.has(event)) {
        this.listeners.set(event, new Set());
      }
      this.listeners.get(event).add(callback);

      return () => this.off(event, callback); // 제거 함수 반환
    } catch (error) {
      console.error('이벤트 리스너 등록 중 오류:', error);
      return () => {};
    }
  }

  /**
   * 이벤트 리스너 제거
   */
  off(event, callback) {
    try {
      if (this.listeners.has(event)) {
        this.listeners.get(event).delete(callback);
      }
      return this;
    } catch (error) {
      console.error('이벤트 리스너 제거 중 오류:', error);
      return this;
    }
  }

  /**
   * 이벤트 발생 (안전성 강화)
   */
  emit(event, data) {
    try {
      if (this.listeners.has(event)) {
        this.listeners.get(event).forEach((callback) => {
          try {
            callback(data);
          } catch (error) {
            console.error(`이벤트 리스너 실행 중 오류 (${event}):`, error);
          }
        });
      }
      return this;
    } catch (error) {
      console.error('이벤트 발생 중 오류:', error);
      return this;
    }
  }

  /**
   * 한 번만 실행되는 이벤트 리스너
   */
  once(event, callback) {
    const wrappedCallback = (data) => {
      try {
        callback(data);
        this.off(event, wrappedCallback);
      } catch (error) {
        console.error('일회성 이벤트 리스너 실행 중 오류:', error);
      }
    };
    return this.on(event, wrappedCallback);
  }

  // ================================
  // 8. 기존 시스템과의 호환성 (개선됨)
  // ================================

  /**
   * 기존 전역 변수와의 호환성 설정 (안전성 강화)
   */
  setupLegacyCompatibility() {
    if (typeof window === 'undefined') return;

    try {
      // 기존 전역 변수들을 StateManager로 연결
      const legacyMappings = {
        _totalAlarmDataList: 'totalAlarmDataList',
        _selectedSector: 'selectedSector',
        _selectedView: 'selectedView',
        _currentPage: 'currentPage',
        _summaryAlarmData: 'summaryAlarmData',
        _allEquipmentData: 'allEquipmentData',
      };

      // 안전한 Proxy 설정
      Object.entries(legacyMappings).forEach(([globalVar, stateKey]) => {
        try {
          // 기존 값 확인
          if (window[globalVar] !== undefined && window[globalVar] !== null) {
            this.set(stateKey, window[globalVar], { silent: true, source: 'legacy-init' });
          }

          // Getter/Setter 정의
          Object.defineProperty(window, globalVar, {
            get: () => this.get(stateKey),
            set: (value) => {
              if (!this.syncInProgress) {
                this.syncInProgress = true;
                this.set(stateKey, value, { source: 'legacy-global' });
                this.syncInProgress = false;
              }
            },
            configurable: true,
            enumerable: true,
          });
        } catch (error) {
          console.warn(`전역 변수 ${globalVar} 설정 중 오류:`, error);
        }
      });

      console.log('🔗 기존 전역 변수 호환성 설정 완료');
    } catch (error) {
      console.error('전역 변수 호환성 설정 중 오류:', error);
    }
  }

  /**
   * 기존 전역 변수 동기화 (순환 참조 방지)
   */
  syncLegacyGlobals(key, value) {
    if (typeof window === 'undefined' || this.syncInProgress) return;

    try {
      const reverseMapping = {
        totalAlarmDataList: '_totalAlarmDataList',
        selectedSector: '_selectedSector',
        selectedView: '_selectedView',
        currentPage: '_currentPage',
        summaryAlarmData: '_summaryAlarmData',
        allEquipmentData: '_allEquipmentData',
      };

      const globalVar = reverseMapping[key];
      if (globalVar) {
        // 순환 참조 방지
        this.syncInProgress = true;

        try {
          // descriptor 확인하여 안전하게 설정
          const descriptor = Object.getOwnPropertyDescriptor(window, globalVar);
          if (!descriptor || !descriptor.set) {
            window[globalVar] = value;
          }
        } catch (error) {
          console.warn(`전역 변수 동기화 실패: ${globalVar}`, error);
        } finally {
          this.syncInProgress = false;
        }
      }
    } catch (error) {
      console.error('전역 변수 동기화 중 오류:', error);
      this.syncInProgress = false;
    }
  }

  // ================================
  // 9. 이벤트 시스템 설정
  // ================================

  setupEventSystem() {
    try {
      // 주요 상태 변경 시 특별한 처리
      this.on('selectedSector', (data) => {
        console.log(`🎯 분야 Sector 변경: ${data.oldValue} → ${data.value}`);
      });

      this.on('selectedView', (data) => {
        console.log(`👁️ 뷰 View Mode 변경: ${data.oldValue} → ${data.value}`);
      });

      this.on('totalAlarmDataList', (data) => {
        console.log(`📊 전체 장비 경보 현황 데이터 업데이트: ${data.value.length}개 항목`);
      });
    } catch (error) {
      console.error('이벤트 시스템 설정 중 오류:', error);
    }
  }

  // ================================
  // 10. 유틸리티 메서드들 (안전성 강화)
  // ================================

  /**
   * 값 변경 여부 확인 (안전성 강화)
   */
  isValueChanged(oldValue, newValue) {
    try {
      // null/undefined 처리
      if (oldValue === newValue) return false;
      if (oldValue == null && newValue == null) return false;
      if (oldValue == null || newValue == null) return true;

      // 배열이나 객체의 경우 깊은 비교
      if (Array.isArray(oldValue) && Array.isArray(newValue)) {
        return JSON.stringify(oldValue) !== JSON.stringify(newValue);
      }

      if (typeof oldValue === 'object' && typeof newValue === 'object') {
        return JSON.stringify(oldValue) !== JSON.stringify(newValue);
      }

      return oldValue !== newValue;
    } catch (error) {
      console.error('값 변경 비교 중 오류:', error);
      return true; // 오류 발생 시 변경된 것으로 간주
    }
  }

  /**
   * 값을 문자열로 변환 (로깅용)
   */
  stringifyValue(value) {
    try {
      if (value === null) return 'null';
      if (value === undefined) return 'undefined';
      if (Array.isArray(value)) {
        return `Array(${value.length})`;
      }
      if (typeof value === 'object') {
        return `Object(${Object.keys(value).length} keys)`;
      }
      return String(value);
    } catch (error) {
      console.error('값 문자열화 중 오류:', error);
      return '[stringify error]';
    }
  }

  /**
   * 히스토리에 변경사항 기록 (안전성 강화)
   */
  addToHistory(key, oldValue, newValue, source) {
    try {
      this.history.push({
        key,
        oldValue,
        newValue,
        source,
        timestamp: new Date(),
      });

      // 히스토리 크기 제한
      if (this.history.length > this.maxHistorySize) {
        this.history.shift();
      }
    } catch (error) {
      console.error('히스토리 기록 중 오류:', error);
    }
  }

  // ================================
  // 11. 통계정보 상태정보 조회
  // ================================

  /**
   * 통계 정보 (안전성 강화)
   */
  getStats() {
    try {
      const sectorStats = this.getSectorStats();

      return {
        isInitialized: this.isInitialized,
        stateKeys: Object.keys(this.state).length,
        listeners: Object.fromEntries(
          Array.from(this.listeners.entries()).map(([event, listeners]) => [event, listeners.size])
        ),
        historySize: this.history.length,
        sectorStats,
        currentState: {
          selectedSector: this.get('selectedSector'),
          selectedView: this.get('selectedView'),
          currentPage: this.get('currentPage'),
          totalAlarms: this.get('totalAlarmDataList', []).length,
          filteredAlarms: this.get('filteredAlarmData', []).length,
        },
      };
    } catch (error) {
      console.error('통계 정보 조회 중 오류:', error);
      return {
        error: '통계 정보 조회 실패',
        isInitialized: this.isInitialized,
      };
    }
  }

  /**
   * 상태 검증 (안전성 강화)
   */
  validate() {
    const errors = [];

    try {
      // 필수 상태 확인
      const requiredStates = ['selectedSector', 'selectedView', 'currentPage'];
      requiredStates.forEach((key) => {
        if (this.get(key) === undefined) {
          errors.push(`필수 상태 누락: ${key}`);
        }
      });

      // 유효한 분야 확인
      const selectedSector = this.get('selectedSector');
      if (selectedSector && !SECTORS.includes(selectedSector)) {
        errors.push(`잘못된 분야: ${selectedSector}`);
      }

      // 유효한 뷰 확인
      const selectedView = this.get('selectedView');
      if (selectedView && !['equip', 'guksa'].includes(selectedView)) {
        errors.push(`잘못된 뷰: ${selectedView}`);
      }
    } catch (error) {
      errors.push(`검증 중 오류: ${error.message}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

// ================================
// 12. 전역 인스턴스 및 호환성
// ================================

/**
 * 싱글톤 인스턴스 생성
 */
export const stateManager = new StateManager();
