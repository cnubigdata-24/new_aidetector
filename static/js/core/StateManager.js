/**
 * 통합 상태 관리 모듈: 전역 인스턴스 싱글톤 패턴 적용
 * 파일 위치: src/core/StateManager.js
 */

import { formatDateTime, SECTORS } from '../utils/CommonUtils.js';

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
  allEquipmentList: [],
  filteredEquipmentList: [],

  // UI 상태
  selectedSector: '전송',
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

  // 장비 맵 뷰 상태 변수 - 노드, 링크, 기준 노드, 경보 데이터
  currentMapNodes: [],
  currentMapLinks: [],
  currentBaseNode: null,
  currentMapAlarms: [],

  // 국사 맵 뷰 관련 변수
  currentGuksaList: [], // 국사 목록 (배열)
  guksaTopologyCache: new Map(), // 국사별 토폴로지 캐시

  // 기타 UI 상태
  sidebarCollapsed: false,
  tableColumnsState: {},
  paginationState: {
    currentPage: 1,
    pageSize: 5,
    totalItems: 0,
  },

  // 테이블 정렬 상태
  currentSortedData: null,
  sortColumn: null,
  sortDirection: 1,
};

// SECTORS 상수는 CommonUtils에서 가져옴

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

    // ✅ 추가: 통계 캐싱을 위한 변수들
    this.statsCache = {
      data: null,
      dataHash: null,
      stats: null,
      lastUpdated: null,
    };

    // ✅ 추가: 정렬된 장비 목록 캐시
    this.sortedEquipmentCache = new Map();

    this.init();
    console.log('🗂️ StateManager 초기화 완료');
  }

  // 초기화 (안전성 강화)
  init() {
    try {
      this.setupEventSystem();
      this.isInitialized = true;
    } catch (error) {
      console.error('StateManager 초기화 중 오류:', error);
    }
  }

  // ================================
  // 3. 기본 상태 관리 메서드 (안전성 강화)
  // ================================

  // 상태 값 가져오기 (안전성 강화)
  get(key, defaultValue = undefined) {
    try {
      const value = this.state[key];
      return value !== undefined ? value : defaultValue;
    } catch (error) {
      console.error(`상태 조회 중 오류 (${key}):`, error);
      return defaultValue;
    }
  }

  // 상태 값 설정 (안전성 강화)
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

        console.log(`🗂️ 상태 변경: ${key} = ${this.stringifyValue(value)} (source: ${source})`);
      }

      return this;
    } catch (error) {
      console.error(`상태 설정 중 오류 (${key}):`, error);
      return this;
    }
  }

  // 다중 상태 값 설정
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

  // 상태 초기화
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

  // 전체 장비 경보 데이터 관리
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

      // ✅ 추가: 데이터 변경 시 캐시 무효화
      this.invalidateStatsCache();
      this.invalidateEquipmentCache();

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

  // 선택된 분야 Sector 변경
  setSelectedSector(sector, options = {}) {
    try {
      const { source = 'user' } = options;

      if (SECTORS.includes(sector)) {
        this.set('selectedSector', sector, { source });
        this.set('currentPage', 1, { source: 'sector-change' }); // 페이지 초기화

        // 🔧 분야 변경 시 선택된 장비 초기화 (이벤트 발생하도록 silent: false)
        this.set('selectedEquipment', null, { source: 'sector-change' });

        // 🔧 맵 상태도 초기화
        this.setCurrentMapData([], [], null, []);

        console.log(`✅ 분야 변경으로 인한 상태 초기화: 장비선택=null, 맵데이터=초기화`);

        // 🔧 비동기로 처리하여 메인 스레드 블로킹 방지
        requestAnimationFrame(() => {
          this.updateFilteredAlarmData();
        });
      } else {
        console.warn(`잘못된 분야: ${sector}. 유효한 분야: ${SECTORS.join(', ')}`);
      }

      return this;
    } catch (error) {
      console.error('분야 선택 중 오류:', error);
      return this;
    }
  }

  // 선택된 뷰 View Mode 변경 (Equip, Guksa)
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

  // 장비 기초 데이터 관리
  setEquipmentData(equipmentData, options = {}) {
    try {
      const { source = 'api' } = options;

      let data = equipmentData;

      // ✅ 추가: 데이터 검증
      if (!data) {
        console.warn('StateManager: 장비 데이터가 null/undefined입니다. 빈 배열로 설정합니다.');
        data = [];
      }

      if (!Array.isArray(data)) {
        console.warn('StateManager: 장비 데이터가 배열이 아닙니다:', typeof data, data);
        data = [];
      }

      this.setState(
        {
          allEquipmentList: [...data],
          filteredEquipmentList: [...data], // 초기에는 전체 목록과 동일
        },
        { source }
      );

      console.log(`🔧 StateManager: 장비 데이터 설정 - ${data.length}개 항목`);

      return this;
    } catch (error) {
      console.error('장비 데이터 설정 중 오류:', error);
      return this;
    }
  }

  // 페이지네이션 상태 관리
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

  // 분야 Sector로 필터링된 경보 데이터 업데이트
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

  // 현재 페이지의 알람 데이터 가져오기
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

  // ✅ 개선: Sector 분야별 통계 가져오기 (캐싱 적용)
  getSectorStats(forceRefresh = false) {
    try {
      const totalData = this.get('totalAlarmDataList', []);

      // 캐시 유효성 검사
      if (!forceRefresh && this.isStatsCacheValid(totalData)) {
        console.log('📊 통계 캐시 사용');
        return this.statsCache.stats;
      }

      console.log('📊 통계 재계산 시작...');
      const stats = this.calculateSectorStatsOptimized(totalData);

      // 캐시 업데이트
      this.updateStatsCache(totalData, stats);

      return stats;
    } catch (error) {
      console.error('분야별 통계 조회 중 오류:', error);
      return {};
    }
  }

  // ✅ 신규: 최적화된 분야별 통계 계산
  calculateSectorStatsOptimized(alarmData) {
    const stats = {};

    // 분야별로 데이터를 한 번에 그룹화
    const sectorGroups = {};
    SECTORS.forEach((sector) => {
      sectorGroups[sector] = [];
    });

    // 단일 루프로 분야별 데이터 분류
    alarmData.forEach((alarm) => {
      if (alarm && alarm.sector) {
        const sector = SECTORS.find((s) => s.toLowerCase() === alarm.sector.toLowerCase());
        if (sector && sectorGroups[sector]) {
          sectorGroups[sector].push(alarm);
        }
      }
    });

    // 각 분야별 통계 계산
    SECTORS.forEach((sector) => {
      const sectorData = sectorGroups[sector] || [];
      const validAlarms = sectorData.filter((item) => item.valid_yn === 'Y');

      // 장비 정보를 Map으로 관리하여 중복 제거와 통계 계산을 동시에 수행
      const equipmentMap = new Map();
      sectorData.forEach((alarm) => {
        if (alarm.equip_id && alarm.equip_name) {
          const equipId = alarm.equip_id;
          if (!equipmentMap.has(equipId)) {
            equipmentMap.set(equipId, {
              equip_id: equipId,
              equip_name: alarm.equip_name,
              equip_type: alarm.equip_type || '알수없음',
              guksa_name: alarm.guksa_name || '알수없음',
              sector: alarm.sector,
              alarms: [],
              alarmCount: 0,
              validAlarmCount: 0,
            });
          }

          const equipment = equipmentMap.get(equipId);
          equipment.alarms.push(alarm);
          equipment.alarmCount++;
          if (alarm.valid_yn === 'Y') {
            equipment.validAlarmCount++;
          }
        }
      });

      // ✅ 최적화: 장비 목록을 미리 정렬하여 저장
      const sortedEquipmentList = Array.from(equipmentMap.values()).sort((a, b) =>
        a.equip_name.localeCompare(b.equip_name, 'ko-KR', {
          numeric: true,
          sensitivity: 'base',
        })
      );

      stats[sector] = {
        totalAlarms: sectorData.length,
        validAlarms: validAlarms.length,
        equipmentCount: equipmentMap.size,
        validPercentage:
          sectorData.length > 0 ? Math.round((validAlarms.length / sectorData.length) * 100) : 0,
        equipmentList: sortedEquipmentList, // 이미 정렬된 목록
        equipmentMap: equipmentMap,
      };
    });

    return stats;
  }

  // ✅ 신규: 통계 캐시 유효성 검사
  isStatsCacheValid(currentData) {
    if (!this.statsCache.stats || !this.statsCache.lastUpdated) {
      return false;
    }

    // 데이터 해시 비교로 변경 여부 확인
    const currentHash = this.generateDataHash(currentData);
    const cacheExpired = Date.now() - this.statsCache.lastUpdated > 60000; // 1분 캐시

    return this.statsCache.dataHash === currentHash && !cacheExpired;
  }

  // ✅ 신규: 데이터 해시 생성
  generateDataHash(data) {
    if (!Array.isArray(data) || data.length === 0) {
      return 'empty';
    }

    // 간단한 해시: 데이터 길이 + 첫 번째와 마지막 항목의 정보
    const first = data[0];
    const last = data[data.length - 1];

    return `${data.length}-${first?.equip_id || 'none'}-${last?.equip_id || 'none'}-${
      first?.occur_datetime || 'none'
    }`;
  }

  // ✅ 신규: 통계 캐시 업데이트
  updateStatsCache(data, stats) {
    this.statsCache = {
      data: data,
      dataHash: this.generateDataHash(data),
      stats: stats,
      lastUpdated: Date.now(),
    };
  }

  // ✅ 신규: 통계 캐시 무효화
  invalidateStatsCache() {
    this.statsCache = {
      data: null,
      dataHash: null,
      stats: null,
      lastUpdated: null,
    };
  }

  // ✅ 신규: 장비 캐시 무효화
  invalidateEquipmentCache() {
    this.sortedEquipmentCache.clear();
  }

  // ✅ 신규: 특정 분야의 정렬된 장비 목록 가져오기
  getSortedEquipmentList(sector, selectedGuksa = null) {
    try {
      const cacheKey = `${sector}-${selectedGuksa || 'all'}`;

      // 캐시에 있으면 반환
      if (this.sortedEquipmentCache.has(cacheKey)) {
        return this.sortedEquipmentCache.get(cacheKey);
      }

      const stats = this.getSectorStats();
      let equipmentList = stats[sector]?.equipmentList || [];

      // 국사 필터 적용
      if (selectedGuksa) {
        const guksaData = this.get('guksaDataList', []);
        const selectedGuksaInfo = guksaData.find((g) => g.guksa_id == selectedGuksa);
        if (selectedGuksaInfo) {
          equipmentList = equipmentList.filter(
            (equipment) => equipment.guksa_name === selectedGuksaInfo.guksa_name
          );
        }
      }

      // 캐시에 저장
      this.sortedEquipmentCache.set(cacheKey, equipmentList);

      return equipmentList;
    } catch (error) {
      console.error('정렬된 장비 목록 조회 중 오류:', error);
      return [];
    }
  }

  // ✅ 신규: 통합된 통계 및 장비 목록 가져오기
  getSectorStatsWithEquipment(sector, selectedGuksa = null) {
    try {
      const stats = this.getSectorStats();
      const equipmentList = this.getSortedEquipmentList(sector, selectedGuksa);

      return {
        ...stats[sector],
        filteredEquipmentList: equipmentList,
      };
    } catch (error) {
      console.error('분야별 통계 및 장비 목록 조회 중 오류:', error);
      return {
        totalAlarms: 0,
        validAlarms: 0,
        equipmentCount: 0,
        validPercentage: 0,
        equipmentList: [],
        filteredEquipmentList: [],
      };
    }
  }

  // ================================
  // 6. 맵 상태 관리
  // ================================
  // 현재 맵 데이터 설정 - 노드, 링크, 기준 노드, 경보 데이터 상태 관리
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

      // 🔧 맵 데이터 업데이트 후 테이블 갱신 트리거
      this.emit('mapDataReady', {
        nodes,
        links,
        baseNode,
        timestamp: Date.now(),
      });

      return this;
    } catch (error) {
      console.error('맵 상태 설정 중 오류:', error);
      return this;
    }
  }

  // 현재 맵 데이터 조회 - 실제 맵 데이터와 경보 매칭 처리 포함
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

  // 맵 데이터와 경보 데이터 매칭 (정확 매칭만)
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

  // 현재 맵과 관련된 경보만 사전 필터링
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

  // 현재 국사 목록 설정
  setCurrentGuksaList(guksaList) {
    this.set('currentGuksaList', Array.isArray(guksaList) ? [...guksaList] : [], {
      source: 'guksa-list-update',
    });
    return this;
  }

  // 현재 국사 목록 조회 (배열)
  getCurrentGuksaList() {
    return this.get('currentGuksaList', []);
  }

  // 국사 Map 형태로 조회 (필요할 때만 생성)
  getCurrentGuksaMap() {
    const guksaList = this.getCurrentGuksaList();
    const guksaMap = new Map();

    guksaList.forEach((guksa) => {
      if (guksa && guksa.guksa_name) {
        guksaMap.set(guksa.guksa_name, guksa);
      }
    });

    return guksaMap;
  }

  // 특정 국사 조회 (이름으로)
  getGuksaByName(guksaName) {
    const guksaList = this.getCurrentGuksaList();
    return guksaList.find((guksa) => guksa.guksa_name === guksaName) || null;
  }

  // 특정 국사 조회 (ID로)
  getGuksaById(guksaId) {
    const guksaList = this.getCurrentGuksaList();
    return guksaList.find((guksa) => guksa.guksa_id === guksaId) || null;
  }

  // ================================
  // 7. 이벤트 시스템 (안전성 강화)
  // ================================

  // 이벤트 리스너 등록
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

  // 이벤트 리스너 제거
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

  // 이벤트 발생 (안전성 강화)
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

  // 한 번만 실행되는 이벤트 리스너
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
  // 8. 이벤트 시스템 설정
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
  // 9. 유틸리티 메서드들 (안전성 강화)
  // ================================

  // 값 변경 여부 확인
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

  // 값을 문자열로 변환 (로깅용)
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

  // 히스토리에 변경사항 기록 (안전성 강화)
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
  // 10. 통계정보 상태정보 조회
  // ================================

  // 통계 정보 (안전성 강화)
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

  // 상태 검증 (안전성 강화)
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

  // ✅ 신규: 컴포넌트 정리 (메모리 누수 방지)
  destroy() {
    try {
      // 이벤트 리스너 정리
      this.listeners.clear();

      // 캐시 정리
      this.invalidateStatsCache();
      this.invalidateEquipmentCache();

      // 상태 초기화
      this.state = { ...DEFAULT_STATE };

      // 히스토리 정리
      this.history = [];

      this.isInitialized = false;

      console.log('🗑️ StateManager 정리 완료 (캐시 포함)');
    } catch (error) {
      console.error('StateManager 정리 중 오류:', error);
    }
  }
}

// 싱글톤 인스턴스 생성
export const stateManager = new StateManager();
