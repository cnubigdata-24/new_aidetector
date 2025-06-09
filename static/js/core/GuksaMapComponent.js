/**
 * STEP 10: 국사 맵 컴포넌트 모듈
 * 파일 위치: src/core/GuksaMapComponent.js
 *
 * 1. fault_d3_map.js의 국사 기준 맵 기능 모듈화
 * 2. 국사별 장비 그룹핑 및 시각화
 * 3. 계층적 맵 구조 (국사 > 장비)
 * 4. 동적 확대/축소 및 드릴다운 기능
 * 5. 지리적 위치 기반 배치 (옵션)
 */

import CommonUtils from '../utils/CommonUtils.js'; // 공통 유틸리티 Function

import { colorManager as ColorManager } from '../utils/ColorManager.js'; // 싱글톤
import { tooltipManager as TooltipManager } from '../utils/TooltipManager.js'; // 싱글톤
import { stateManager as StateManager } from './StateManager.js'; // 싱글톤

// ================================
// 1. 국사 맵 설정 및 상수 정의
// ================================

const GUKSA_MAP_CONFIG = {
  // 기본 크기
  DEFAULT_WIDTH: 800,
  DEFAULT_HEIGHT: 600,

  // 줌 설정
  ZOOM_MIN: 0.5,
  ZOOM_MAX: 8,
  ZOOM_INITIAL: 1,

  // 국사 노드 설정
  GUKSA_NODE: {
    WIDTH: 120,
    HEIGHT: 80,
    MIN_WIDTH: 60,
    MIN_HEIGHT: 40,
    MAX_WIDTH: 200,
    MAX_HEIGHT: 120,
    BORDER_RADIUS: 8,
  },

  // 장비 노드 설정 (국사 내부)
  EQUIPMENT_NODE: {
    RADIUS: 6,
    MIN_RADIUS: 4,
    MAX_RADIUS: 10,
    SPACING: 15,
  },

  // 연결선 설정
  CONNECTION: {
    STROKE_WIDTH: 2,
    HIGHLIGHTED_WIDTH: 4,
    CURVE_OFFSET: 20,
  },

  // 레이아웃 설정
  LAYOUT: {
    GRID_SPACING_X: 180,
    GRID_SPACING_Y: 120,
    MARGIN: 50,
    CENTER_FORCE: 0.1,
  },

  // 애니메이션
  ANIMATION_DURATION: 500,
  TRANSITION_DURATION: 300,

  // 성능
  MAX_GUKSA_DISPLAY: 50,
  MAX_EQUIPMENT_PER_GUKSA: 20,
};

const GUKSA_LAYOUTS = {
  GRID: 'grid',
  FORCE: 'force',
  GEOGRAPHIC: 'geographic',
  HIERARCHICAL: 'hierarchical',
};

const VIEW_MODES = {
  OVERVIEW: 'overview', // 국사만 표시
  DETAILED: 'detailed', // 국사 + 장비 표시
  EQUIPMENT_FOCUS: 'focus', // 선택된 국사의 장비 확대
};

// ================================
// 2. GuksaMapComponent 클래스
// ================================

export class GuksaMapComponent {
  constructor(containerId = 'map-container') {
    this.containerId = containerId;
    this.container = null;
    this.svg = null;
    this.g = null; // 메인 그룹 (줌/팬 대상)

    // 레이어 구분
    this.connectionLayer = null;
    this.guksaLayer = null;
    this.equipmentLayer = null;
    this.labelLayer = null;

    // 데이터
    this.guksaData = [];
    this.equipmentData = [];
    this.connectionData = [];
    this.guksaMap = new Map(); // guksa_name -> guksa 매핑

    // 레이아웃 및 상태
    this.currentLayout = GUKSA_LAYOUTS.GRID;
    this.currentViewMode = VIEW_MODES.OVERVIEW;
    this.selectedGuksa = null;
    this.highlightedConnections = new Set();

    // D3 객체들
    this.zoom = null;
    this.currentTransform = d3.zoomIdentity;

    // 상태
    this.isInitialized = false;

    // 이벤트 핸들러 바인딩
    this.handleGuksaClick = this.handleGuksaClick.bind(this);
    this.handleGuksaMouseOver = this.handleGuksaMouseOver.bind(this);
    this.handleGuksaMouseOut = this.handleGuksaMouseOut.bind(this);
    this.handleEquipmentClick = this.handleEquipmentClick.bind(this);
    this.handleEquipmentMouseOver = this.handleEquipmentMouseOver.bind(this);
    this.handleEquipmentMouseOut = this.handleEquipmentMouseOut.bind(this);

    this.init();
    console.log('🏢 GuksaMapComponent 초기화 완료');
  }

  // ================================
  // 3. 초기화 및 설정
  // ================================

  /**
   * 초기화
   */
  init() {
    try {
      this.container = document.getElementById(this.containerId);

      if (!this.container) {
        console.warn(`국사 맵 컨테이너를 찾을 수 없습니다: ${this.containerId}`);
        return;
      }

      this.setupContainer();
      this.setupSVG();
      this.setupZoom();
      this.setupEventListeners();
      this.isInitialized = true;

      console.log('✅ GuksaMapComponent 초기화 완료');
    } catch (error) {
      console.error('GuksaMapComponent 초기화 중 오류:', error);
    }
  }

  /**
   * 컨테이너 설정
   */
  setupContainer() {
    this.container.style.position = 'relative';
    this.container.style.overflow = 'hidden';
    this.container.style.background = '#f1f3f4';
  }

  /**
   * SVG 설정
   */
  setupSVG() {
    // 기존 SVG 제거
    d3.select(this.container).selectAll('svg').remove();

    const rect = this.container.getBoundingClientRect();
    const width = rect.width || GUKSA_MAP_CONFIG.DEFAULT_WIDTH;
    const height = rect.height || GUKSA_MAP_CONFIG.DEFAULT_HEIGHT;

    // SVG 생성
    this.svg = d3
      .select(this.container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('background', '#f1f3f4');

    // 정의 영역 (패턴, 그라디언트 등)
    this.setupDefs();

    // 메인 그룹 (줌/팬 적용 대상)
    this.g = this.svg.append('g').attr('class', 'guksa-map-main-group');

    // 레이어 순서대로 생성
    this.connectionLayer = this.g.append('g').attr('class', 'connection-layer');
    this.guksaLayer = this.g.append('g').attr('class', 'guksa-layer');
    this.equipmentLayer = this.g.append('g').attr('class', 'equipment-layer');
    this.labelLayer = this.g.append('g').attr('class', 'label-layer');

    console.log(`📐 국사 맵 SVG 설정 완료: ${width}x${height}`);
  }

  /**
   * 정의 영역 설정 (패턴, 그라디언트 등)
   */
  setupDefs() {
    const defs = this.svg.append('defs');

    // 국사 그라디언트
    const guksaGradient = defs
      .append('linearGradient')
      .attr('id', 'guksa-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    guksaGradient
      .append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#4a90e2')
      .attr('stop-opacity', 0.9);

    guksaGradient
      .append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#2c5aa0')
      .attr('stop-opacity', 1);

    // 선택된 국사 그라디언트
    const selectedGuksaGradient = defs
      .append('linearGradient')
      .attr('id', 'selected-guksa-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    selectedGuksaGradient
      .append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#ff6b6b')
      .attr('stop-opacity', 0.9);

    selectedGuksaGradient
      .append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#e74c3c')
      .attr('stop-opacity', 1);

    // 드롭 섀도우 필터
    const dropShadow = defs
      .append('filter')
      .attr('id', 'drop-shadow')
      .attr('x', '-20%')
      .attr('y', '-20%')
      .attr('width', '140%')
      .attr('height', '140%');

    dropShadow
      .append('feDropShadow')
      .attr('dx', 2)
      .attr('dy', 2)
      .attr('stdDeviation', 3)
      .attr('flood-color', '#00000040');
  }

  /**
   * 줌 기능 설정
   */
  setupZoom() {
    this.zoom = d3
      .zoom()
      .scaleExtent([GUKSA_MAP_CONFIG.ZOOM_MIN, GUKSA_MAP_CONFIG.ZOOM_MAX])
      .on('zoom', this.handleZoom.bind(this));

    this.svg.call(this.zoom);
  }

  /**
   * 이벤트 리스너 설정
   */
  setupEventListeners() {
    // StateManager 이벤트
    StateManager.on('totalAlarmDataList', () => {
      this.refreshMapData();
    });

    StateManager.on('selectedSector', () => {
      this.updateVisibility();
    });

    StateManager.on('selectedGuksa', (data) => {
      this.selectGuksa(data.value);
    });

    // 윈도우 리사이즈
    window.addEventListener('resize', this.handleResize.bind(this));

    // ESC 키로 선택 해제
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.clearSelection();
      }
    });
  }

  // ================================
  // 4. 데이터 처리 및 전처리
  // ================================

  /**
   * 국사 맵 데이터 렌더링 (개선된 버전)
   */
  renderGuksaMap(equipmentData, options = {}) {
    try {
      const {
        layout = GUKSA_LAYOUTS.GRID,
        viewMode = VIEW_MODES.OVERVIEW,
        showProgress = true,
        animateTransition = true,
        selectedGuksa = null,
      } = options;

      if (showProgress) {
        CommonUtils.showMapLoadingMessage('국사 기준 맵을 생성하고 있습니다...');
      }

      console.log('🏢 국사 맵 렌더링 시작...');

      // 초기 로딩 시에는 빈 맵 표시
      if (!selectedGuksa && (!equipmentData || equipmentData.length === 0)) {
        this.renderEmptyGuksaMap();
        return;
      }

      // 특정 국사가 선택된 경우 해당 국사의 장비만 로드
      if (selectedGuksa) {
        this.renderGuksaTopology(selectedGuksa, equipmentData, options);
        return;
      }

      // 기존 전체 렌더링 로직 (필요한 경우에만)
      this.renderFullGuksaMap(equipmentData, options);
    } catch (error) {
      console.error('국사 맵 렌더링 실패:', error);
      CommonUtils.showMapErrorMessage(`국사 맵 렌더링 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * 빈 국사 맵 표시
   */
  //   renderEmptyGuksaMap() {
  //     this.clearMap();

  //     const mapContainer = document.getElementById('map-container');
  //     if (mapContainer) {
  //       mapContainer.innerHTML = `
  //         <div class="empty-guksa-map-message" style="
  //           display: flex;
  //           flex-direction: column;
  //           justify-content: center;
  //           align-items: center;
  //           height: 100%;
  //           color: #666;
  //           font-size: 16px;
  //         ">
  //           <div style="margin-bottom: 20px;">
  //             🏢 국사 기준 맵
  //           </div>
  //           <div style="font-size: 14px; text-align: center; line-height: 1.5;">
  //             사이드바에서 국사를 선택하거나<br>
  //             경보 테이블에서 국사를 클릭하면<br>
  //             해당 국사의 분야별 장비가 표시됩니다.
  //           </div>
  //         </div>
  //       `;
  //     }

  //     console.log('📋 빈 국사 맵 표시 완료');
  //   }
  // 기존 renderEmptyGuksaMap 메서드 수정
  renderEmptyGuksaMap() {
    this.clearMap();

    const mapContainer = document.getElementById('map-container');
    if (mapContainer) {
      mapContainer.innerHTML = `
      <div class="initial-message">
        <div class="map-icon">🗺️</div>
        <div class="map-message-title">${this.currentSelectedSector} 분야 준비 완료</div>
        <div class="map-message-subtitle">
          좌측에서 장비를 선택하거나<br>
          하단 테이블에서 장비를 클릭하면<br>
          토폴로지가 표시됩니다
        </div>
      </div>
    `;
    }

    console.log('📋 초기 맵 상태 표시 완료');
  }

  /**
   * 특정 국사의 토폴로지 렌더링
   */
  async renderGuksaTopology(guksaName, equipmentData, options = {}) {
    try {
      console.log(`🏢 국사 토폴로지 렌더링 시작: ${guksaName}`);

      CommonUtils.showMapLoadingMessage(`국사 ${guksaName}의 장비 토폴로지를 로드하고 있습니다...`);

      // 1. API 데이터 시도
      let topologyData = null;
      try {
        topologyData = await this.fetchGuksaTopology(guksaName);
      } catch (apiError) {
        console.warn('국사 API 호출 실패, 로컬 데이터로 처리:', apiError.message);
      }

      // 2. API 데이터가 있으면 기존 함수 사용
      if (topologyData && topologyData.equip_list) {
        this.createGuksaTopologyMap(topologyData);
        return;
      }

      // 3. API 실패시 로컬 데이터로 국사 맵 생성
      console.log('로컬 데이터로 국사 맵 생성');
      const localGuksaData = this.createLocalGuksaTopology(guksaName, equipmentData);
      this.renderLocalGuksaMap(localGuksaData);

      console.log(`✅ 국사 ${guksaName} 토폴로지 렌더링 완료`);
    } catch (error) {
      console.error(`국사 토폴로지 렌더링 실패 (${guksaName}):`, error);
      this.renderFallbackGuksaMap({ guksa_name: guksaName, equip_list: equipmentData || [] });
    }
  }

  /**
   * 로컬 국사 토폴로지 데이터 생성
   */
  createLocalGuksaTopology(guksaName, equipmentData) {
    const allEquipment = equipmentData || window._allEquipmentData || [];
    const alarmData = StateManager.get('totalAlarmDataList', []);

    // 해당 국사의 모든 장비 필터링
    const guksaEquipment = allEquipment.filter((e) => e.guksa_name === guksaName);

    // 분야별로 그룹핑
    const sectorGroups = {};
    guksaEquipment.forEach((equip) => {
      const sector = equip.equip_field || 'Unknown';
      if (!sectorGroups[sector]) {
        sectorGroups[sector] = [];
      }

      // 알람 정보 추가
      const equipWithAlarms = {
        ...equip,
        alarms: alarmData.filter(
          (alarm) => alarm.equip_id === equip.equip_id || alarm.equip_name === equip.equip_name
        ),
      };

      sectorGroups[sector].push(equipWithAlarms);
    });

    return {
      guksa_name: guksaName,
      equip_list: guksaEquipment,
      sector_groups: sectorGroups,
      total_count: guksaEquipment.length,
    };
  }

  /**
   * 로컬 국사 맵 렌더링
   */
  renderLocalGuksaMap(guksaData) {
    try {
      const { guksa_name, sector_groups, total_count } = guksaData;

      console.log(`로컬 국사 맵 렌더링: ${guksa_name}, 총 ${total_count}개 장비`);

      // 기존 맵 클리어
      this.clearMap();

      // 국사 맵 형태로 렌더링
      this.renderFullGuksaMap(guksaData.equip_list, {
        layout: 'hierarchical',
        viewMode: 'detailed',
        showProgress: false,
        animateTransition: true,
      });
    } catch (error) {
      console.error('로컬 국사 맵 렌더링 실패:', error);
      this.renderFallbackGuksaMap(guksaData);
    }
  }
  /**
   * 로컬 국사 맵 렌더링
   */
  renderLocalGuksaMap(guksaData) {
    try {
      const { guksa_name, sector_groups, total_count } = guksaData;

      console.log(`로컬 국사 맵 렌더링: ${guksa_name}, 총 ${total_count}개 장비`);

      // 기존 맵 클리어
      this.clearMap();

      // 국사 맵 형태로 렌더링
      this.renderFullGuksaMap(guksaData.equip_list, {
        layout: 'hierarchical',
        viewMode: 'detailed',
        showProgress: false,
        animateTransition: true,
      });
    } catch (error) {
      console.error('로컬 국사 맵 렌더링 실패:', error);
      this.renderFallbackGuksaMap(guksaData);
    }
  }

  /**
   * 국사 토폴로지 데이터 가져오기
   */
  async fetchGuksaTopology(guksaName) {
    try {
      // ✅ API 엔드포인트 체크
      const response = await fetch(`/api/topology/${encodeURIComponent(guksaName)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        // ✅ 404 등 오류시 null 반환
        console.warn(`국사 토폴로지 API 오류: ${response.status}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('국사 토폴로지 데이터 가져오기 실패:', error);
      // ✅ 네트워크 오류시 null 반환
      return null;
    }
  }

  /**
   * 기존 createGuksaTopologyMap 로직 통합
   */
  createGuksaTopologyMap(data) {
    // 기존 fault_d3_map.js의 createGuksaTopologyMap 함수 로직을 여기에 통합
    // 이는 기존 코드와의 호환성을 위해 전역 함수를 호출하는 방식으로 구현
    if (typeof window.createGuksaTopologyMap === 'function') {
      window.createGuksaTopologyMap(data);
    } else {
      console.warn(
        'createGuksaTopologyMap 함수를 찾을 수 없습니다. 기존 스크립트가 로드되지 않았을 수 있습니다.'
      );
      this.renderFallbackGuksaMap(data);
    }
  }

  /**
   * 폴백 국사 맵 렌더링
   */
  renderFallbackGuksaMap(data) {
    const mapContainer = document.getElementById('map-container');
    if (mapContainer) {
      mapContainer.innerHTML = `
        <div class="fallback-guksa-map" style="padding: 20px; text-align: center;">
          <h3>국사 토폴로지: ${data.guksa_name || '알 수 없는 국사'}</h3>
          <p>장비 수: ${data.equip_list?.length || 0}개</p>
          <small>상세 맵 렌더링을 위해 페이지를 새로고침해주세요.</small>
        </div>
      `;
    }
  }

  /**
   * 전체 국사 맵 렌더링 (기존 로직)
   */
  renderFullGuksaMap(equipmentData, options = {}) {
    const {
      layout = GUKSA_LAYOUTS.GRID,
      viewMode = VIEW_MODES.OVERVIEW,
      animateTransition = true,
    } = options;

    console.log(`- 장비 데이터: ${equipmentData?.length || 0}개`);
    console.log(`- 레이아웃: ${layout}`);
    console.log(`- 뷰 모드: ${viewMode}`);

    // 데이터 검증
    if (!this.validateData(equipmentData)) {
      throw new Error('유효하지 않은 장비 데이터');
    }

    // 국사별 데이터 그룹핑
    this.preprocessGuksaData(equipmentData);

    // 레이아웃 설정
    this.currentLayout = layout;
    this.currentViewMode = viewMode;

    // 연결 관계 분석
    this.analyzeConnections();

    // 위치 계산
    this.calculatePositions();

    // 렌더링
    this.renderConnections(animateTransition);
    this.renderGuksas(animateTransition);

    if (viewMode !== VIEW_MODES.OVERVIEW) {
      this.renderEquipments(animateTransition);
    }

    this.renderLabels(animateTransition);

    // 맵 컨테이너 표시
    this.container.style.display = 'block';
    this.container.innerHTML = '';
    this.container.appendChild(this.svg.node());

    // 초기 뷰 설정
    setTimeout(() => {
      this.fitToScreen();
    }, 500);

    console.log('✅ 전체 국사 맵 렌더링 완료');

    // 전역 변수 동기화 (하위 호환성)
    if (typeof window !== 'undefined') {
      window._currentGuksaData = this.guksaData;
      window._currentGuksaMap = this.guksaMap;
    }
  }

  /**
   * 데이터 검증
   */
  validateData(equipmentData) {
    if (!Array.isArray(equipmentData)) {
      console.error('장비 데이터가 배열이 아닙니다:', equipmentData);
      return false;
    }

    if (equipmentData.length === 0) {
      console.warn('장비 데이터가 비어있습니다.');
      return false;
    }

    // 필수 필드 확인
    const requiredFields = ['equip_id', 'equip_name', 'guksa_name'];
    const invalidEquipment = equipmentData.filter(
      (equip) => !equip || !requiredFields.every((field) => equip[field])
    );

    if (invalidEquipment.length > 0) {
      console.error('필수 필드가 없는 장비들:', invalidEquipment);
      return false;
    }

    return true;
  }

  /**
   * 국사별 데이터 전처리
   */
  preprocessGuksaData(equipmentData) {
    // 국사별로 장비 그룹핑
    const guksaGroups = d3.group(equipmentData, (d) => d.guksa_name);

    this.guksaData = [];
    this.guksaMap.clear();

    guksaGroups.forEach((equipments, guksaName) => {
      // 각 장비의 알람 데이터 추가
      const enrichedEquipments = equipments.map((equip) => ({
        ...equip,
        alarms: this.getEquipmentAlarms(equip.equip_id),
      }));

      // 국사 통계 계산
      const stats = this.calculateGuksaStats(enrichedEquipments);

      const guksaInfo = {
        guksa_id: guksaName, // ID와 이름이 같다고 가정
        guksa_name: guksaName,
        equipments: enrichedEquipments,
        stats: stats,
        x: null, // 위치는 나중에 계산
        y: null,
        width: this.calculateGuksaWidth(enrichedEquipments.length),
        height: this.calculateGuksaHeight(enrichedEquipments.length),
      };

      this.guksaData.push(guksaInfo);
      this.guksaMap.set(guksaName, guksaInfo);
    });

    // 장비 데이터도 별도 저장 (빠른 검색용)
    this.equipmentData = equipmentData.map((equip) => ({
      ...equip,
      alarms: this.getEquipmentAlarms(equip.equip_id),
    }));

    console.log(
      `📊 국사 데이터 전처리 완료: ${this.guksaData.length}개 국사, ${this.equipmentData.length}개 장비`
    );
  }

  /**
   * 장비의 알람 데이터 가져오기
   */
  getEquipmentAlarms(equipId) {
    const alarmData = StateManager.get('totalAlarmDataList', []);
    return alarmData.filter(
      (alarm) => alarm && (alarm.equip_id === equipId || alarm.equip_name === equipId)
    );
  }

  /**
   * 국사 통계 계산
   */
  calculateGuksaStats(equipments) {
    const totalEquipments = equipments.length;
    const equipmentsWithAlarms = equipments.filter((e) => e.alarms && e.alarms.length > 0);
    const totalAlarms = equipments.reduce((sum, e) => sum + (e.alarms?.length || 0), 0);
    const validAlarms = equipments.reduce(
      (sum, e) => sum + (e.alarms?.filter((a) => a.valid_yn === 'Y').length || 0),
      0
    );

    // 분야별 장비 수
    const sectorCounts = {};
    equipments.forEach((equip) => {
      const sector = equip.equip_field || 'Unknown';
      sectorCounts[sector] = (sectorCounts[sector] || 0) + 1;
    });

    // 주요 분야 (가장 많은 장비를 가진 분야)
    const primarySector =
      Object.entries(sectorCounts).sort(([, a], [, b]) => b - a)[0]?.[0] || 'Unknown';

    return {
      totalEquipments,
      equipmentsWithAlarms: equipmentsWithAlarms.length,
      totalAlarms,
      validAlarms,
      alarmRate:
        totalEquipments > 0 ? Math.round((equipmentsWithAlarms.length / totalEquipments) * 100) : 0,
      sectorCounts,
      primarySector,
      sectors: Object.keys(sectorCounts),
    };
  }

  /**
   * 국사 크기 계산
   */
  calculateGuksaWidth(equipmentCount) {
    const base = GUKSA_MAP_CONFIG.GUKSA_NODE.WIDTH;
    const factor = Math.min(equipmentCount / 10, 2);
    return Math.min(
      Math.max(base * factor, GUKSA_MAP_CONFIG.GUKSA_NODE.MIN_WIDTH),
      GUKSA_MAP_CONFIG.GUKSA_NODE.MAX_WIDTH
    );
  }

  calculateGuksaHeight(equipmentCount) {
    const base = GUKSA_MAP_CONFIG.GUKSA_NODE.HEIGHT;
    const factor = Math.min(equipmentCount / 15, 1.5);
    return Math.min(
      Math.max(base * factor, GUKSA_MAP_CONFIG.GUKSA_NODE.MIN_HEIGHT),
      GUKSA_MAP_CONFIG.GUKSA_NODE.MAX_HEIGHT
    );
  }

  // ================================
  // 5. 레이아웃 및 위치 계산
  // ================================

  /**
   * 연결 관계 분석
   */
  analyzeConnections() {
    this.connectionData = [];

    // 실제 구현에서는 링크 데이터나 장비 간 연결 정보를 사용
    // 여기서는 같은 분야 국사들 간의 논리적 연결을 표시

    const sectorGroups = d3.group(this.guksaData, (d) => d.stats.primarySector);

    sectorGroups.forEach((guksas, sector) => {
      if (guksas.length > 1) {
        // 같은 분야의 국사들을 연결
        for (let i = 0; i < guksas.length - 1; i++) {
          for (let j = i + 1; j < guksas.length; j++) {
            this.connectionData.push({
              source: guksas[i].guksa_name,
              target: guksas[j].guksa_name,
              type: 'sector',
              sector: sector,
              weight: 1,
            });
          }
        }
      }
    });

    console.log(`🔗 연결 관계 분석 완료: ${this.connectionData.length}개 연결`);
  }

  /**
   * 위치 계산
   */
  calculatePositions() {
    switch (this.currentLayout) {
      case GUKSA_LAYOUTS.GRID:
        this.calculateGridPositions();
        break;
      case GUKSA_LAYOUTS.FORCE:
        this.calculateForcePositions();
        break;
      case GUKSA_LAYOUTS.GEOGRAPHIC:
        this.calculateGeographicPositions();
        break;
      case GUKSA_LAYOUTS.HIERARCHICAL:
        this.calculateHierarchicalPositions();
        break;
      default:
        this.calculateGridPositions();
    }
  }

  /**
   * 그리드 레이아웃 위치 계산
   */
  calculateGridPositions() {
    const rect = this.container.getBoundingClientRect();
    const width = rect.width || GUKSA_MAP_CONFIG.DEFAULT_WIDTH;
    const height = rect.height || GUKSA_MAP_CONFIG.DEFAULT_HEIGHT;

    const cols = Math.ceil(Math.sqrt(this.guksaData.length));
    const rows = Math.ceil(this.guksaData.length / cols);

    const spacingX = GUKSA_MAP_CONFIG.LAYOUT.GRID_SPACING_X;
    const spacingY = GUKSA_MAP_CONFIG.LAYOUT.GRID_SPACING_Y;

    const totalWidth = cols * spacingX;
    const totalHeight = rows * spacingY;

    const startX = (width - totalWidth) / 2 + spacingX / 2;
    const startY = (height - totalHeight) / 2 + spacingY / 2;

    this.guksaData.forEach((guksa, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);

      guksa.x = startX + col * spacingX;
      guksa.y = startY + row * spacingY;
    });

    console.log('📐 그리드 레이아웃 위치 계산 완료');
  }

  /**
   * 포스 레이아웃 위치 계산
   */
  calculateForcePositions() {
    const rect = this.container.getBoundingClientRect();
    const width = rect.width || GUKSA_MAP_CONFIG.DEFAULT_WIDTH;
    const height = rect.height || GUKSA_MAP_CONFIG.DEFAULT_HEIGHT;

    // D3 Force Simulation 사용
    const simulation = d3
      .forceSimulation(this.guksaData)
      .force('charge', d3.forceManyBody().strength(-1000))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force(
        'collision',
        d3.forceCollide().radius((d) => Math.max(d.width, d.height) / 2 + 20)
      )
      .force(
        'link',
        d3
          .forceLink(this.connectionData)
          .id((d) => d.guksa_name)
          .distance(200)
          .strength(0.1)
      )
      .stop();

    // 시뮬레이션 수동 실행
    for (let i = 0; i < 300; ++i) simulation.tick();

    console.log('🌀 포스 레이아웃 위치 계산 완료');
  }

  /**
   * 지리적 레이아웃 위치 계산 (추후 확장)
   */
  calculateGeographicPositions() {
    // 실제 지리적 좌표가 있다면 사용
    // 현재는 그리드 레이아웃으로 대체
    this.calculateGridPositions();
    console.log('🗺️ 지리적 레이아웃 (그리드로 대체)');
  }

  /**
   * 계층적 레이아웃 위치 계산
   */
  calculateHierarchicalPositions() {
    // 분야별로 계층 구조 생성
    const sectorGroups = d3.group(this.guksaData, (d) => d.stats.primarySector);
    const sectors = Array.from(sectorGroups.keys());

    const rect = this.container.getBoundingClientRect();
    const width = rect.width || GUKSA_MAP_CONFIG.DEFAULT_WIDTH;
    const height = rect.height || GUKSA_MAP_CONFIG.DEFAULT_HEIGHT;

    const sectorHeight = height / sectors.length;

    sectors.forEach((sector, sectorIndex) => {
      const guksas = sectorGroups.get(sector);
      const sectorCenterY = sectorHeight * (sectorIndex + 0.5);

      const guksaWidth = width / (guksas.length + 1);

      guksas.forEach((guksa, guksaIndex) => {
        guksa.x = guksaWidth * (guksaIndex + 1);
        guksa.y = sectorCenterY;
      });
    });

    console.log('🏗️ 계층적 레이아웃 위치 계산 완료');
  }

  // ================================
  // 6. 렌더링 메서드들
  // ================================

  /**
   * 연결선 렌더링
   */
  renderConnections(animate = true) {
    const connectionSelection = this.connectionLayer
      .selectAll('.guksa-connection')
      .data(this.connectionData, (d) => `${d.source}-${d.target}`);

    // EXIT
    connectionSelection
      .exit()
      .transition()
      .duration(animate ? GUKSA_MAP_CONFIG.ANIMATION_DURATION : 0)
      .style('opacity', 0)
      .remove();

    // ENTER
    const connectionEnter = connectionSelection
      .enter()
      .append('path')
      .attr('class', 'guksa-connection')
      .style('opacity', 0)
      .style('fill', 'none')
      .style('pointer-events', 'none');

    // UPDATE + ENTER
    const connectionUpdate = connectionEnter.merge(connectionSelection);

    connectionUpdate
      .transition()
      .duration(animate ? GUKSA_MAP_CONFIG.ANIMATION_DURATION : 0)
      .style('opacity', 0.3)
      .attr('stroke', (d) => ColorManager.getEquipmentNodeColor(d.sector))
      .attr('stroke-width', GUKSA_MAP_CONFIG.CONNECTION.STROKE_WIDTH)
      .attr('stroke-dasharray', '5,5')
      .attr('d', (d) => this.generateConnectionPath(d));
  }

  /**
   * 국사 노드 렌더링
   */
  renderGuksas(animate = true) {
    const guksaSelection = this.guksaLayer
      .selectAll('.guksa-node')
      .data(this.guksaData, (d) => d.guksa_name);

    // EXIT
    guksaSelection
      .exit()
      .transition()
      .duration(animate ? GUKSA_MAP_CONFIG.ANIMATION_DURATION : 0)
      .style('opacity', 0)
      .remove();

    // ENTER
    const guksaEnter = guksaSelection
      .enter()
      .append('g')
      .attr('class', 'guksa-node')
      .style('opacity', 0)
      .style('cursor', 'pointer')
      .on('click', this.handleGuksaClick)
      .on('mouseover', this.handleGuksaMouseOver)
      .on('mouseout', this.handleGuksaMouseOut);

    // 국사 배경 사각형
    guksaEnter
      .append('rect')
      .attr('class', 'guksa-background')
      .attr('rx', GUKSA_MAP_CONFIG.GUKSA_NODE.BORDER_RADIUS)
      .attr('ry', GUKSA_MAP_CONFIG.GUKSA_NODE.BORDER_RADIUS)
      .style('filter', 'url(#drop-shadow)');

    // 국사 제목
    guksaEnter
      .append('text')
      .attr('class', 'guksa-title')
      .attr('text-anchor', 'middle')
      .style('font-weight', 'bold')
      .style('font-size', '12px')
      .style('fill', 'white')
      .style('pointer-events', 'none');

    // 통계 정보
    guksaEnter
      .append('text')
      .attr('class', 'guksa-stats')
      .attr('text-anchor', 'middle')
      .style('font-size', '10px')
      .style('fill', 'white')
      .style('opacity', 0.9)
      .style('pointer-events', 'none');

    // 알람 표시기
    guksaEnter
      .append('circle')
      .attr('class', 'guksa-alarm-indicator')
      .attr('r', 0)
      .style('fill', '#e74c3c')
      .style('stroke', 'white')
      .style('stroke-width', 2);

    // UPDATE + ENTER
    const guksaUpdate = guksaEnter.merge(guksaSelection);

    guksaUpdate
      .transition()
      .duration(animate ? GUKSA_MAP_CONFIG.ANIMATION_DURATION : 0)
      .style('opacity', 1)
      .attr('transform', (d) => `translate(${d.x - d.width / 2}, ${d.y - d.height / 2})`);

    // 배경 업데이트
    guksaUpdate
      .select('.guksa-background')
      .transition()
      .duration(animate ? GUKSA_MAP_CONFIG.ANIMATION_DURATION : 0)
      .attr('width', (d) => d.width)
      .attr('height', (d) => d.height)
      .attr('fill', (d) => this.getGuksaFillColor(d))
      .attr('stroke', (d) => this.getGuksaStrokeColor(d))
      .attr('stroke-width', (d) => this.getGuksaStrokeWidth(d));

    // 제목 업데이트
    guksaUpdate
      .select('.guksa-title')
      .attr('x', (d) => d.width / 2)
      .attr('y', (d) => d.height / 2 - 10)
      .text((d) => this.getGuksaDisplayName(d));

    // 통계 업데이트
    guksaUpdate
      .select('.guksa-stats')
      .attr('x', (d) => d.width / 2)
      .attr('y', (d) => d.height / 2 + 8)
      .text((d) => `${d.stats.totalEquipments}대 | ${d.stats.validAlarms}개 경보`);

    // 알람 표시기 업데이트
    guksaUpdate
      .select('.guksa-alarm-indicator')
      .transition()
      .duration(animate ? GUKSA_MAP_CONFIG.ANIMATION_DURATION : 0)
      .attr('cx', (d) => d.width - 15)
      .attr('cy', 15)
      .attr('r', (d) => (d.stats.validAlarms > 0 ? 6 : 0))
      .style('opacity', (d) => (d.stats.validAlarms > 0 ? 1 : 0));
  }

  /**
   * 장비 노드 렌더링 (상세 모드에서만)
   */
  renderEquipments(animate = true) {
    if (this.currentViewMode === VIEW_MODES.OVERVIEW) {
      return;
    }

    // 각 국사별로 장비 렌더링
    this.guksaData.forEach((guksa) => {
      this.renderGuksaEquipments(guksa, animate);
    });
  }

  /**
   * 특정 국사의 장비들 렌더링
   */
  renderGuksaEquipments(guksa, animate = true) {
    const equipmentGroup = this.equipmentLayer
      .selectAll(`.equipment-group-${guksa.guksa_name.replace(/\s+/g, '-')}`)
      .data([guksa]);

    const equipmentGroupEnter = equipmentGroup
      .enter()
      .append('g')
      .attr('class', `equipment-group equipment-group-${guksa.guksa_name.replace(/\s+/g, '-')}`);

    const equipmentGroupUpdate = equipmentGroupEnter.merge(equipmentGroup);

    // 장비 노드들
    const equipmentSelection = equipmentGroupUpdate
      .selectAll('.equipment-node')
      .data(guksa.equipments, (d) => d.equip_id);

    // EXIT
    equipmentSelection
      .exit()
      .transition()
      .duration(animate ? GUKSA_MAP_CONFIG.TRANSITION_DURATION : 0)
      .style('opacity', 0)
      .remove();

    // ENTER
    const equipmentEnter = equipmentSelection
      .enter()
      .append('circle')
      .attr('class', 'equipment-node')
      .style('opacity', 0)
      .style('cursor', 'pointer')
      .on('click', this.handleEquipmentClick)
      .on('mouseover', this.handleEquipmentMouseOver)
      .on('mouseout', this.handleEquipmentMouseOut);

    // UPDATE + ENTER
    const equipmentUpdate = equipmentEnter.merge(equipmentSelection);

    // 장비 위치 계산
    const equipmentPositions = this.calculateEquipmentPositions(guksa);

    equipmentUpdate
      .transition()
      .duration(animate ? GUKSA_MAP_CONFIG.TRANSITION_DURATION : 0)
      .style('opacity', 1)
      .attr('cx', (d, i) => guksa.x + equipmentPositions[i].x)
      .attr('cy', (d, i) => guksa.y + equipmentPositions[i].y)
      .attr('r', (d) => this.getEquipmentRadius(d))
      .attr('fill', (d) => this.getEquipmentFillColor(d))
      .attr('stroke', (d) => this.getEquipmentStrokeColor(d))
      .attr('stroke-width', 1.5);
  }

  /**
   * 국사 내 장비 위치 계산
   */
  calculateEquipmentPositions(guksa) {
    const equipments = guksa.equipments;
    const positions = [];

    const maxCols = Math.floor((guksa.width - 20) / GUKSA_MAP_CONFIG.EQUIPMENT_NODE.SPACING);
    const maxRows = Math.floor((guksa.height - 40) / GUKSA_MAP_CONFIG.EQUIPMENT_NODE.SPACING);

    const cols = Math.min(maxCols, Math.ceil(Math.sqrt(equipments.length)));
    const rows = Math.ceil(equipments.length / cols);

    const spacingX = GUKSA_MAP_CONFIG.EQUIPMENT_NODE.SPACING;
    const spacingY = GUKSA_MAP_CONFIG.EQUIPMENT_NODE.SPACING;

    const startX = -guksa.width / 2 + spacingX;
    const startY = -guksa.height / 2 + 30; // 제목 공간 확보

    equipments.forEach((equipment, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);

      positions.push({
        x: startX + col * spacingX,
        y: startY + row * spacingY,
      });
    });

    return positions;
  }

  /**
   * 라벨 렌더링
   */
  renderLabels(animate = true) {
    // 현재는 국사 노드 내부에 라벨이 포함되어 있으므로 별도 처리 없음
    // 필요시 외부 라벨 추가 가능
  }

  // ================================
  // 7. 스타일링 메서드들
  // ================================

  /**
   * 국사 채우기 색상
   */
  getGuksaFillColor(guksa) {
    if (this.selectedGuksa === guksa.guksa_name) {
      return 'url(#selected-guksa-gradient)';
    }
    return 'url(#guksa-gradient)';
  }

  /**
   * 국사 테두리 색상
   */
  getGuksaStrokeColor(guksa) {
    if (this.selectedGuksa === guksa.guksa_name) {
      return '#c0392b';
    }
    return '#34495e';
  }

  /**
   * 국사 테두리 두께
   */
  getGuksaStrokeWidth(guksa) {
    if (this.selectedGuksa === guksa.guksa_name) {
      return 3;
    }
    return 2;
  }

  /**
   * 국사 표시 이름
   */
  getGuksaDisplayName(guksa) {
    return guksa.guksa_name.length > 10
      ? guksa.guksa_name.substring(0, 10) + '...'
      : guksa.guksa_name;
  }

  /**
   * 장비 반지름
   */
  getEquipmentRadius(equipment) {
    const hasAlarms = equipment.alarms && equipment.alarms.length > 0;
    return hasAlarms
      ? GUKSA_MAP_CONFIG.EQUIPMENT_NODE.MAX_RADIUS
      : GUKSA_MAP_CONFIG.EQUIPMENT_NODE.RADIUS;
  }

  /**
   * 장비 채우기 색상
   */
  getEquipmentFillColor(equipment) {
    return ColorManager.getEquipmentNodeColor(equipment.equip_field);
  }

  /**
   * 장비 테두리 색상
   */
  getEquipmentStrokeColor(equipment) {
    const hasAlarms = equipment.alarms && equipment.alarms.length > 0;
    return hasAlarms ? '#e74c3c' : '#34495e';
  }

  /**
   * 연결선 경로 생성
   */
  generateConnectionPath(connection) {
    const sourceGuksa = this.guksaMap.get(connection.source);
    const targetGuksa = this.guksaMap.get(connection.target);

    if (!sourceGuksa || !targetGuksa) return '';

    const x1 = sourceGuksa.x;
    const y1 = sourceGuksa.y;
    const x2 = targetGuksa.x;
    const y2 = targetGuksa.y;

    // 곡선 경로 생성
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dr = Math.sqrt(dx * dx + dy * dy);

    return `M${x1},${y1}A${dr},${dr} 0 0,1 ${x2},${y2}`;
  }

  // ================================
  // 8. 이벤트 핸들러들
  // ================================

  /**
   * 국사 클릭 이벤트
   */
  handleGuksaClick(event, guksa) {
    event.stopPropagation();

    if (this.selectedGuksa === guksa.guksa_name) {
      // 이미 선택된 국사 클릭 시 선택 해제 또는 상세 뷰 토글
      if (this.currentViewMode === VIEW_MODES.EQUIPMENT_FOCUS) {
        this.setViewMode(VIEW_MODES.DETAILED);
      } else {
        this.setViewMode(VIEW_MODES.EQUIPMENT_FOCUS);
        this.focusOnGuksa(guksa.guksa_name);
      }
    } else {
      // 새로운 국사 선택
      this.selectGuksa(guksa.guksa_name);
    }

    console.log(`🏢 국사 선택: ${guksa.guksa_name}`);
  }

  /**
   * 국사 마우스 오버 이벤트
   */
  handleGuksaMouseOver(event, guksa) {
    TooltipManager.showGuksaTooltip(event, {
      guksa_id: guksa.guksa_id,
      guksa_name: guksa.guksa_name,
      equipmentCount: guksa.stats.totalEquipments,
      alarmCount: guksa.stats.validAlarms,
      sectors: guksa.stats.sectors,
    });

    // 연결된 국사들 하이라이트
    this.highlightConnectedGuksas(guksa.guksa_name);
  }

  /**
   * 국사 마우스 아웃 이벤트
   */
  handleGuksaMouseOut(event, guksa) {
    TooltipManager.hide();
    this.clearGuksaHighlight();
  }

  /**
   * 장비 클릭 이벤트
   */
  handleEquipmentClick(event, equipment) {
    event.stopPropagation();

    console.log(`⚙️ 장비 선택: ${equipment.equip_name} (${equipment.equip_id})`);

    // StateManager에 선택된 장비 정보 저장
    StateManager.set('selectedEquipment', equipment.equip_id, { source: 'guksa-map-click' });
  }

  /**
   * 장비 마우스 오버 이벤트
   */
  handleEquipmentMouseOver(event, equipment) {
    TooltipManager.showEquipmentTooltip(event, {
      equip_id: equipment.equip_id,
      equip_name: equipment.equip_name,
      equip_type: equipment.equip_type,
      equip_field: equipment.equip_field,
      guksa_name: equipment.guksa_name,
      alarms: equipment.alarms,
    });
  }

  /**
   * 장비 마우스 아웃 이벤트
   */
  handleEquipmentMouseOut(event, equipment) {
    TooltipManager.hide();
  }

  // ================================
  // 9. 뷰 모드 및 상호작용
  // ================================

  /**
   * 국사 선택
   */
  selectGuksa(guksaName) {
    this.selectedGuksa = guksaName;
    this.updateGuksaSelection();

    // StateManager 업데이트
    StateManager.set('selectedGuksa', guksaName, { source: 'guksa-map-click' });
  }

  /**
   * 선택 해제
   */
  clearSelection() {
    this.selectedGuksa = null;
    this.updateGuksaSelection();

    // StateManager 업데이트
    StateManager.set('selectedGuksa', '', { source: 'guksa-map-clear' });
  }

  /**
   * 국사 선택 상태 업데이트
   */
  updateGuksaSelection() {
    this.guksaLayer
      .selectAll('.guksa-node')
      .select('.guksa-background')
      .transition()
      .duration(GUKSA_MAP_CONFIG.TRANSITION_DURATION)
      .attr('fill', (d) => this.getGuksaFillColor(d))
      .attr('stroke', (d) => this.getGuksaStrokeColor(d))
      .attr('stroke-width', (d) => this.getGuksaStrokeWidth(d));
  }

  /**
   * 뷰 모드 설정
   */
  setViewMode(viewMode) {
    if (this.currentViewMode === viewMode) return;

    console.log(`👁️ 뷰 모드 변경: ${this.currentViewMode} → ${viewMode}`);

    const previousMode = this.currentViewMode;
    this.currentViewMode = viewMode;

    // 장비 표시/숨김
    if (viewMode === VIEW_MODES.OVERVIEW) {
      this.hideEquipments();
    } else if (previousMode === VIEW_MODES.OVERVIEW) {
      this.showEquipments();
    }

    // 장비 포커스 모드 처리
    if (viewMode === VIEW_MODES.EQUIPMENT_FOCUS && this.selectedGuksa) {
      this.focusOnGuksa(this.selectedGuksa);
    } else if (previousMode === VIEW_MODES.EQUIPMENT_FOCUS) {
      this.fitToScreen();
    }
  }

  /**
   * 장비 표시
   */
  showEquipments() {
    this.renderEquipments(true);
  }

  /**
   * 장비 숨김
   */
  hideEquipments() {
    this.equipmentLayer
      .selectAll('.equipment-group')
      .transition()
      .duration(GUKSA_MAP_CONFIG.TRANSITION_DURATION)
      .style('opacity', 0)
      .remove();
  }

  /**
   * 특정 국사에 포커스
   */
  focusOnGuksa(guksaName) {
    const guksa = this.guksaMap.get(guksaName);
    if (!guksa) return;

    // 선택된 국사로 줌
    const scale = 3;
    const rect = this.container.getBoundingClientRect();
    const translate = [rect.width / 2 - scale * guksa.x, rect.height / 2 - scale * guksa.y];

    this.svg
      .transition()
      .duration(750)
      .call(
        this.zoom.transform,
        d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
      );

    // 다른 국사들 흐리게 표시
    this.guksaLayer
      .selectAll('.guksa-node')
      .transition()
      .duration(GUKSA_MAP_CONFIG.TRANSITION_DURATION)
      .style('opacity', (d) => (d.guksa_name === guksaName ? 1 : 0.3));
  }

  /**
   * 연결된 국사들 하이라이트
   */
  highlightConnectedGuksas(guksaName) {
    this.highlightedConnections.clear();

    this.connectionData.forEach((connection) => {
      if (connection.source === guksaName || connection.target === guksaName) {
        this.highlightedConnections.add(`${connection.source}-${connection.target}`);
      }
    });

    this.updateConnectionHighlight();
  }

  /**
   * 국사 하이라이트 제거
   */
  clearGuksaHighlight() {
    this.highlightedConnections.clear();
    this.updateConnectionHighlight();
  }

  /**
   * 연결선 하이라이트 업데이트
   */
  updateConnectionHighlight() {
    this.connectionLayer
      .selectAll('.guksa-connection')
      .transition()
      .duration(200)
      .style('opacity', (d) => {
        const key = `${d.source}-${d.target}`;
        return this.highlightedConnections.has(key) ? 0.8 : 0.3;
      })
      .attr('stroke-width', (d) => {
        const key = `${d.source}-${d.target}`;
        return this.highlightedConnections.has(key)
          ? GUKSA_MAP_CONFIG.CONNECTION.HIGHLIGHTED_WIDTH
          : GUKSA_MAP_CONFIG.CONNECTION.STROKE_WIDTH;
      });
  }

  // ================================
  // 10. 줌 및 기타 기능
  // ================================

  /**
   * 줌 이벤트 처리
   */
  handleZoom(event) {
    this.currentTransform = event.transform;
    this.g.attr('transform', this.currentTransform);
  }

  /**
   * 화면에 맞추기
   */
  fitToScreen() {
    if (!this.guksaData.length || !this.svg) return;

    const bounds = this.calculateBounds();
    const fullWidth = this.container.clientWidth;
    const fullHeight = this.container.clientHeight;

    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;

    if (width === 0 || height === 0) return;

    const midX = (bounds.minX + bounds.maxX) / 2;
    const midY = (bounds.minY + bounds.maxY) / 2;

    const scale = Math.min(fullWidth / width, fullHeight / height) * 0.8; // 여백 추가

    const translate = [fullWidth / 2 - scale * midX, fullHeight / 2 - scale * midY];

    this.svg
      .transition()
      .duration(750)
      .call(
        this.zoom.transform,
        d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
      );
  }

  /**
   * 경계 계산
   */
  calculateBounds() {
    if (!this.guksaData.length) {
      return { minX: 0, maxX: 100, minY: 0, maxY: 100 };
    }

    return {
      minX: d3.min(this.guksaData, (d) => d.x - d.width / 2) - 50,
      maxX: d3.max(this.guksaData, (d) => d.x + d.width / 2) + 50,
      minY: d3.min(this.guksaData, (d) => d.y - d.height / 2) - 50,
      maxY: d3.max(this.guksaData, (d) => d.y + d.height / 2) + 50,
    };
  }

  /**
   * 줌 레벨 설정
   */
  setZoomLevel(level) {
    if (!this.svg) return;

    if (level === 'fit') {
      this.fitToScreen();
      return;
    }

    const rect = this.container.getBoundingClientRect();
    const scale = level;
    const translate = [rect.width / 2, rect.height / 2];

    this.svg
      .transition()
      .duration(500)
      .call(
        this.zoom.transform,
        d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
      );
  }

  // ================================
  // 11. 데이터 업데이트 및 관리
  // ================================

  /**
   * 맵 데이터 새로고침
   */
  refreshMapData() {
    console.log('🔄 국사 맵 데이터 새로고침...');

    // 모든 장비의 알람 데이터 업데이트
    this.equipmentData.forEach((equipment) => {
      equipment.alarms = this.getEquipmentAlarms(equipment.equip_id);
    });

    // 국사별 통계 재계산
    this.guksaData.forEach((guksa) => {
      guksa.equipments.forEach((equipment) => {
        equipment.alarms = this.getEquipmentAlarms(equipment.equip_id);
      });
      guksa.stats = this.calculateGuksaStats(guksa.equipments);
    });

    // 국사 노드 업데이트
    this.guksaLayer
      .selectAll('.guksa-node')
      .select('.guksa-stats')
      .text((d) => `${d.stats.totalEquipments}대 | ${d.stats.validAlarms}개 경보`);

    // 알람 표시기 업데이트
    this.guksaLayer
      .selectAll('.guksa-alarm-indicator')
      .transition()
      .duration(GUKSA_MAP_CONFIG.TRANSITION_DURATION)
      .attr('r', (d) => (d.stats.validAlarms > 0 ? 6 : 0))
      .style('opacity', (d) => (d.stats.validAlarms > 0 ? 1 : 0));

    // 장비 노드 업데이트 (상세 모드인 경우)
    if (this.currentViewMode !== VIEW_MODES.OVERVIEW) {
      this.equipmentLayer
        .selectAll('.equipment-node')
        .transition()
        .duration(GUKSA_MAP_CONFIG.TRANSITION_DURATION)
        .attr('r', (d) => this.getEquipmentRadius(d))
        .attr('fill', (d) => this.getEquipmentFillColor(d))
        .attr('stroke', (d) => this.getEquipmentStrokeColor(d));
    }
  }

  /**
   * 가시성 업데이트 (분야 필터링)
   */
  updateVisibility() {
    const selectedSector = StateManager.get('selectedSector');

    if (!selectedSector) {
      // 전체 표시
      this.guksaLayer.selectAll('.guksa-node').style('opacity', 1);
      this.equipmentLayer.selectAll('.equipment-node').style('opacity', 1);
      return;
    }

    // 선택된 분야 관련 국사만 강조
    this.guksaLayer.selectAll('.guksa-node').style('opacity', (d) => {
      return d.stats.sectors.includes(selectedSector) ? 1 : 0.3;
    });

    // 선택된 분야 장비만 강조
    this.equipmentLayer
      .selectAll('.equipment-node')
      .style('opacity', (d) => (d.equip_field === selectedSector ? 1 : 0.2));
  }

  /**
   * 리사이즈 처리
   */
  handleResize() {
    if (!this.svg || !this.container) return;

    const rect = this.container.getBoundingClientRect();
    const width = rect.width || GUKSA_MAP_CONFIG.DEFAULT_WIDTH;
    const height = rect.height || GUKSA_MAP_CONFIG.DEFAULT_HEIGHT;

    this.svg.attr('viewBox', `0 0 ${width} ${height}`);

    // 레이아웃 재계산이 필요한 경우
    // this.calculatePositions();
    // this.renderGuksas(false);
  }

  // ================================
  // 12. 상태 관리 및 진단
  // ================================

  /**
   * 현재 상태 가져오기
   */
  getState() {
    return {
      isInitialized: this.isInitialized,
      guksaCount: this.guksaData.length,
      equipmentCount: this.equipmentData.length,
      connectionCount: this.connectionData.length,
      currentLayout: this.currentLayout,
      currentViewMode: this.currentViewMode,
      selectedGuksa: this.selectedGuksa,
      currentZoom: this.currentTransform.k,
    };
  }

  /**
   * 통계 정보
   */
  getStats() {
    const alarmGuksas = this.guksaData.filter((g) => g.stats.validAlarms > 0);
    const totalEquipments = this.guksaData.reduce((sum, g) => sum + g.stats.totalEquipments, 0);
    const totalAlarms = this.guksaData.reduce((sum, g) => sum + g.stats.validAlarms, 0);

    return {
      ...this.getState(),
      alarmGuksaCount: alarmGuksas.length,
      totalEquipments,
      totalAlarms,
      averageEquipmentsPerGuksa: totalEquipments / this.guksaData.length || 0,
      guksaDistribution: this.guksaData.map((g) => ({
        name: g.guksa_name,
        equipments: g.stats.totalEquipments,
        alarms: g.stats.validAlarms,
      })),
    };
  }

  /**
   * 진단 정보
   */
  diagnose() {
    const diagnosis = {
      ...this.getState(),
      containerExists: !!this.container,
      svgExists: !!this.svg,
      layerCount: 4, // connection, guksa, equipment, label
      bounds: this.calculateBounds(),
    };

    console.table(diagnosis);
    return diagnosis;
  }

  /**
   * 맵 정리
   */
  clearMap() {
    // 선택 상태 초기화
    this.selectedGuksa = null;
    this.highlightedConnections.clear();

    // 데이터 초기화
    this.guksaData = [];
    this.equipmentData = [];
    this.connectionData = [];
    this.guksaMap.clear();

    // SVG 정리
    if (this.svg) {
      this.connectionLayer.selectAll('*').remove();
      this.guksaLayer.selectAll('*').remove();
      this.equipmentLayer.selectAll('*').remove();
      this.labelLayer.selectAll('*').remove();
    }

    console.log('🗑️ 국사 맵 정리 완료');
  }

  /**
   * 컴포넌트 정리
   */
  destroy() {
    // 이벤트 리스너 제거
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('keydown', this.clearSelection);

    // 맵 정리
    this.clearMap();

    // SVG 제거
    if (this.container) {
      d3.select(this.container).selectAll('svg').remove();
    }

    console.log('🗑️ GuksaMapComponent 정리 완료');
  }
}

// ================================
// 13. 전역 인스턴스 및 호환성
// ================================

/**
 * 싱글톤 인스턴스 생성
 */
export const guksaMapComponent = new GuksaMapComponent();

/**
 * 하위 호환성을 위한 전역 함수 등록
 */
export function registerGuksaMapGlobalFunctions() {
  if (typeof window !== 'undefined') {
    // 기존 함수들을 래퍼로 등록
    window.renderGuksaMap = (equipmentData, options) => {
      return guksaMapComponent.renderGuksaMap(equipmentData, options);
    };

    window.clearGuksaMap = () => {
      return guksaMapComponent.clearMap();
    };

    window.fitGuksaMapToScreen = () => {
      return guksaMapComponent.fitToScreen();
    };

    window.setGuksaMapZoom = (level) => {
      return guksaMapComponent.setZoomLevel(level);
    };

    window.setGuksaMapLayout = (layout) => {
      guksaMapComponent.currentLayout = layout;
      guksaMapComponent.calculatePositions();
      guksaMapComponent.renderGuksas(true);
      guksaMapComponent.renderConnections(true);
    };

    window.setGuksaMapViewMode = (viewMode) => {
      return guksaMapComponent.setViewMode(viewMode);
    };

    // 새로운 함수들
    window.refreshGuksaMapData = () => guksaMapComponent.refreshMapData();
    window.getGuksaMapStats = () => guksaMapComponent.getStats();
    window.clearGuksaMapSelection = () => guksaMapComponent.clearSelection();
    window.selectGuksa = (guksaName) => guksaMapComponent.selectGuksa(guksaName);

    // GuksaMapComponent 인스턴스도 전역 등록
    window.guksaMapComponent = guksaMapComponent;

    console.log('✅ GuksaMapComponent 전역 함수 등록 완료');
  }
}

// 즉시 전역 함수 등록 (기존 코드 호환성)
registerGuksaMapGlobalFunctions();
