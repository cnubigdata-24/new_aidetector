// 국사 토폴로지 맵 구성 컴포넌트

// 싱글톤
import { stateManager as StateManager } from './StateManager.js';
import { tooltipManager as TooltipManager } from '../utils/TooltipManager.js';
import { colorManager as ColorManager } from '../utils/ColorManager.js';

import CommonUtils from '../utils/CommonUtils.js';
import MessageManager from '../utils/MessageManager.js';

// 설정 상수
const GUKSA_MAP_CONFIG = {
  DEFAULT_WIDTH: 800,
  DEFAULT_HEIGHT: 600,
  ZOOM: {
    MIN: 0.1,
    MAX: 10,
    SCALE_FACTOR: 1.5,
    TRANSITION_DURATION: 300,
  },
  NODE: {
    WIDTH: 120,
    HEIGHT: 80,
    MIN_WIDTH: 60,
    MIN_HEIGHT: 40,
    MAX_WIDTH: 200,
    MAX_HEIGHT: 120,
    BORDER_RADIUS: 8,
  },
  EQUIPMENT: {
    RADIUS: 6,
    SPACING: 15,
  },
  LAYOUT: {
    GRID_SPACING_X: 180,
    GRID_SPACING_Y: 120,
    MARGIN: 50,
  },
  ANIMATION: {
    DURATION: 500,
    TRANSITION_DURATION: 300,
  },
};

const VIEW_MODES = {
  OVERVIEW: 'overview',
  DETAILED: 'detailed',
  EQUIPMENT_FOCUS: 'focus',
};

export class GuksaMapComponent {
  constructor(containerId = 'map-container') {
    this.containerId = containerId;
    this.container = null;
    this.svg = null;
    this.g = null;
    this.zoom = null;
    this.simulation = null; // 시뮬레이션 인스턴스 추가

    // 레이어 구분
    this.connectionLayer = null;
    this.guksaLayer = null;
    this.equipmentLayer = null;
    this.labelLayer = null;

    // 데이터
    this.guksaData = [];
    this.equipmentData = [];
    this.connectionData = [];
    this.guksaMap = new Map();

    // 상태
    this.currentViewMode = VIEW_MODES.OVERVIEW;
    this.selectedGuksa = null;
    this.highlightedConnections = new Set();
    this.currentTransform = d3.zoomIdentity;
    this.isInitialized = false;

    this.init();
  }

  // ================================
  // 초기화 및 설정
  // ================================

  init() {
    try {
      this.container = this.getContainer();
      if (!this.container) return;

      if (typeof d3 !== 'undefined') {
        this.setupSVG();
        this.setupZoom();
        this.setupEventListeners();
      }

      this.isInitialized = true;
      console.log('✅ GuksaMapComponent 초기화 완료');
    } catch (error) {
      this.handleError('GuksaMapComponent 초기화 실패', error);
    }
  }

  getContainer() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error(`국사 맵 컨테이너를 찾을 수 없습니다: ${this.containerId}`);
    }
    return container;
  }

  setupSVG() {
    const { width, height } = this.getContainerDimensions();
    d3.select(this.container).selectAll('svg').remove();

    this.svg = d3
      .select(this.container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('background', '#ffffff');

    this.g = this.svg
      .append('g')
      .attr('class', 'guksa-map-main-group')
      .style('transform-origin', '0 0');

    // 레이어 생성
    this.connectionLayer = this.g.append('g').attr('class', 'connection-layer');
    this.guksaLayer = this.g.append('g').attr('class', 'guksa-layer');
    this.equipmentLayer = this.g.append('g').attr('class', 'equipment-layer');
    this.labelLayer = this.g.append('g').attr('class', 'label-layer');

    // 컨테이너 overflow 설정 (잘림 방지)
    this.container.style.overflow = 'visible';
  }

  getContainerDimensions() {
    const rect = this.container.getBoundingClientRect();
    return {
      width: rect.width || GUKSA_MAP_CONFIG.DEFAULT_WIDTH,
      height: rect.height || GUKSA_MAP_CONFIG.DEFAULT_HEIGHT,
    };
  }

  setupZoom() {
    this.zoom = d3
      .zoom()
      .scaleExtent([0.2, 3.0])
      .filter(this.zoomFilter.bind(this))
      .on('zoom', this.onZoom.bind(this));

    this.svg.call(this.zoom);
  }

  zoomFilter(event) {
    // 컨트롤 패널 클릭 시 줌/패닝 비활성화
    if (event.target.closest('.map-control-panel')) return false;
    // 노드(click on node) 위에서 시작된 mousedown은 개별 드래그용, 줌/패닝 차단
    if (event.type === 'mousedown' && event.target.closest('.node')) return false;
    // 마우스 휠과 배경 mousedown은 허용
    if (event.type === 'wheel' || event.type === 'dblclick') return true;
    if (event.type === 'mousedown') return true;
    return false;
  }

  onZoom(event) {
    this.g.attr('transform', event.transform);
    this.currentTransform = event.transform;
  }

  setupEventListeners() {
    StateManager.on('totalAlarmDataList', () => {
      this.refreshMapData();
    });

    StateManager.on('selectedSector', () => {
      this.updateVisibility();
    });

    StateManager.on('selectedGuksa', (data) => {
      this.selectGuksa(data.value);
    });

    window.addEventListener('resize', this.handleResize.bind(this));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.clearSelection();
      }
    });
  }

  // ================================
  // 메인 렌더링 메서드
  // ================================

  async renderGuksaMap(equipmentData, options = {}) {
    try {
      const { selectedGuksa = null, showProgress = true } = options;

      if (showProgress) {
        CommonUtils.showMapLoadingMessage('국사 기준 맵을 생성하고 있습니다...');
      }

      console.log('🏢 국사 맵 렌더링 시작...');

      //       if (!selectedGuksa && (!equipmentData || equipmentData.length === 0)) {
      //         this.renderEmptyGuksaMap();
      //         return;
      //       }

      if (selectedGuksa) {
        await this.renderGuksaTopology(selectedGuksa, equipmentData, options);
        return;
      }

      this.renderFullGuksaMap(equipmentData, options);
    } catch (error) {
      console.error('국사 맵 렌더링 실패:', error);
      CommonUtils.showMapErrorMessage(`국사 맵 렌더링 실패: ${error.message}`);
    }
  }

  // 국사 맵 토폴로지 렌더링
  async renderGuksaTopology(guksaName, equipmentData, options = {}) {
    try {
      console.log(`🏢 국사 토폴로지 렌더링: ${guksaName}`);

      CommonUtils.showMapLoadingMessage(
        `✔️ 국사 ${guksaName}의 장비 토폴로지를 로드하고 있습니다.`
      );

      // API 호출
      const topologyData = await this.fetchGuksaTopology(guksaName);

      if (topologyData && topologyData.equip_list && topologyData.equip_list.length > 0) {
        console.log(`✅ 토폴로지 데이터 수신: ${topologyData.equip_list.length}개 장비`);
        this.createGuksaTopologyMap(topologyData);
      } else {
        console.log(`⚠️ 토폴로지 데이터 없음: ${guksaName}`);

        this.renderFallbackGuksaMap({
          guksa_name: guksaName,
          equip_list: [],
          error_message: `✔️ 국사 '${guksaName}'의 장비 정보를 찾을 수 없습니다.`,
        });
      }

      console.log(`✅ 국사 ${guksaName} 토폴로지 렌더링 완료`);
    } catch (error) {
      console.error(`국사 토폴로지 렌더링 실패 (${guksaName}):`, error);

      this.renderFallbackGuksaMap({
        guksa_name: guksaName,
        equip_list: [],
        error_message: `오류가 발생했습니다: ${error.message}`,
      });
    }
  }

  renderFullGuksaMap(equipmentData, options = {}) {
    const { animateTransition = false } = options; // 장비 기준 애니메이션 제거

    console.log(`- 장비 데이터: ${equipmentData?.length || 0}개`);

    this.preprocessGuksaData(equipmentData);
    this.analyzeConnections();
    this.calculatePositions();

    this.renderConnections(false); // 애니메이션 제거
    this.renderGuksas(false); // 애니메이션 제거

    if (this.currentViewMode !== VIEW_MODES.OVERVIEW) {
      this.renderEquipments(false); // 애니메이션 제거
    }

    this.container.style.display = 'block';
    this.container.innerHTML = '';
    this.container.appendChild(this.svg.node());

    // 기존 불필요한 애니메이션 제거 - 즉시 화면에 맞춤
    this.fitToScreen();

    console.log('✅ 전체 국사 맵 렌더링 완료');
  }

  // ================================
  // 데이터 처리
  // ================================

  async fetchGuksaTopology(guksaName) {
    try {
      console.log(`🔍 국사 토폴로지 API 호출: ${guksaName}`);

      // 한국어 국사명을 안전하게 인코딩
      const encodedGuksaName = encodeURIComponent(guksaName);

      const response = await fetch(`/api/topology/${encodedGuksaName}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        console.warn(`⚠️ 국사 토폴로지 API 오류: ${response.status} - ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      console.log(`✅ 국사 토폴로지 데이터 수신:`, data);

      return data;
    } catch (error) {
      console.error('❌ 국사 토폴로지 데이터 가져오기 실패:', error);
      return null;
    }
  }

  createGuksaTopologyMap(data) {
    try {
      console.log('🏢 국사 토폴로지 맵 생성 (fault_d3_map.js 방식):', data?.guksa_name);
      console.log('📊 받은 데이터:', data);

      // 맵 컨테이너 초기화
      this.clearMap();

      if (!data) {
        console.log('❌ 데이터가 없음');
        this.renderFallbackGuksaMap(null);
        return;
      }

      if (!data.equip_list || data.equip_list.length === 0) {
        console.log('❌ 장비 리스트가 비어있음:', data);
        this.renderFallbackGuksaMap({
          ...data,
          error_message: data.error || '해당 국사에 등록된 장비가 없습니다',
        });
        return;
      }

      // 컨테이너 크기 가져오기
      const { width, height } = this.getContainerDimensions();

      // 국사 이름
      const guksaName = data.guksa_name || data.guksa_id || '알 수 없는 국사';

      // 노드 및 링크 데이터 준비
      const nodes = [
        {
          id: guksaName,
          type: 'guksa',
          color: '#0056b3',
          borderColor: '#0056b3',
          nodeCount: data.equip_list.length,
        },
      ];

      const links = [];

      // 분야별 노드와 링크 생성
      const uniqueEquipMap = this.createEquipNodes(data.equip_list);

      // 유니크한 장비 노드 추가 및 링크 생성
      this.addEquipNodesToMap(uniqueEquipMap, nodes, links, guksaName);

      // 노드가 없으면 메시지 표시 후 종료
      if (nodes.length <= 1) {
        console.log('❌ 유효한 노드가 없음 - 상세 정보:', {
          총노드수: nodes.length,
          국사노드: nodes.filter((n) => n.type === 'guksa').length,
          장비노드: nodes.filter((n) => n.type === 'equip').length,
          uniqueEquipMap크기: uniqueEquipMap.size,
          원본장비수: data.equip_list.length,
        });
        this.renderFallbackGuksaMap({
          ...data,
          error_message: '표시할 장비 토폴로지 데이터가 없습니다.',
        });
        return;
      }

      console.log(`✅ 토폴로지 노드 준비 완료: 국사 1개 + 장비 ${nodes.length - 1}개`);
      console.log(`📊 링크 수: ${links.length}개`);
      console.log(`📦 노드 상세:`, {
        국사노드: nodes.filter((n) => n.type === 'guksa').map((n) => ({ id: n.id, type: n.type })),
        장비노드샘플: nodes
          .filter((n) => n.type === 'equip')
          .slice(0, 5)
          .map((n) => ({
            id: n.id,
            displayName: n.displayName,
            sector: n.sector,
          })),
      });

      // SVG 설정 및 생성
      this.setupTopologySVG(width, height);

      // 제목 추가
      this.addTopologyTitle(guksaName, nodes.length - 1);

      // 줌 컨트롤 패널 추가
      this.addTopologyZoomControls();

      // 노드 위치 설정
      console.log('📍 노드 위치 설정 시작...');
      this.setupTopologyNodePositions(nodes);
      console.log('✅ 노드 위치 설정 완료');

      // 툴팁 생성
      console.log('🔧 툴팁 생성 시작...');
      const tooltip = this.createTopologyTooltip();
      console.log('✅ 툴팁 생성 완료');

      // 힘 시뮬레이션 생성
      console.log('⚡ 힘 시뮬레이션 생성 시작...');
      const simulation = this.createTopologySimulation(nodes, links);
      console.log('✅ 힘 시뮬레이션 생성 완료');

      // 링크 생성
      console.log('🔗 링크 생성 시작...');
      const link = this.createTopologyLinks(links);
      console.log('✅ 링크 생성 완료');

      // 노드 생성
      console.log('🎯 노드 생성 시작...');
      const node = this.createTopologyNodes(nodes, simulation, tooltip);
      console.log('✅ 노드 생성 완료');

      // 시뮬레이션 업데이트 함수 설정
      console.log('🔄 시뮬레이션 업데이트 설정 시작...');
      this.setupTopologySimulation(simulation, nodes, link, node);
      console.log('✅ 시뮬레이션 업데이트 설정 완료');

      // StateManager에 데이터 저장
      if (data?.guksa_name) {
        StateManager.set('guksaTopologyCache', data);
      }

      // 로딩 메시지 제거
      console.log('🧹 로딩 메시지 제거...');
      CommonUtils.clearMapMessages?.();

      // 로딩 메시지가 제거되지 않을 경우 직접 제거
      setTimeout(() => {
        const loadingElements = this.container.querySelectorAll(
          '.map-loading-message, .map-loading-overlay, .map-loading-content'
        );
        loadingElements.forEach((el) => el.remove());
      }, 100);

      console.log('✅ 국사 토폴로지 맵 생성 완료 (fault_d3_map.js 방식)');
    } catch (error) {
      console.error('국사 토폴로지 맵 생성 실패:', error);
      this.renderFallbackGuksaMap({
        ...data,
        error_message: `❌ 국사 기준 토폴로지 맵 생성 중 오류 발생: ${error.message}`,
      });
    }
  }

  renderGuksaTopologyDirect(data) {
    // createGuksaTopologyMap으로 통합
    this.createGuksaTopologyMap(data);
  }

  // fault_d3_map.js 방식의 장비 노드 생성
  createEquipNodes(equipList) {
    console.log('🏗️ createEquipNodes 시작...');
    console.log('📊 입력 데이터 샘플:', equipList.slice(0, 3));

    const uniqueEquipMap = new Map();

    // 분야별 카운터
    const sectorCounts = {
      MW: 0,
      선로: 0,
      전송: 0,
      IP: 0,
      무선: 0,
      교환: 0,
      '알 수 없음': 0,
      기타: 0,
    };

    let processedCount = 0;
    let skippedCount = 0;
    const duplicateNames = [];
    const emptyNames = [];

    equipList.forEach((equip, index) => {
      console.log(`📦 장비 ${index + 1}/${equipList.length}:`, {
        equip_id: equip.equip_id,
        equip_name: equip.equip_name,
        sector: equip.sector,
        유효성: {
          'equip_name 존재': !!equip.equip_name,
          'equip_name 빈값 아님': equip.equip_name && equip.equip_name.trim() !== '',
          'equip_id 존재': !!equip.equip_id,
        },
      });

      // 장비 이름 검증
      if (!equip.equip_name || equip.equip_name.trim() === '') {
        console.log(
          `⚠️ 장비명이 없어 건너뜀: equip_id=${equip.equip_id}, equip_name="${equip.equip_name}"`
        );
        emptyNames.push(equip.equip_id);
        skippedCount++;
        return;
      }

      // 동일 장비 처리 - 장비명으로만 체크 (equip_id는 다를 수 있음)
      if (uniqueEquipMap.has(equip.equip_name)) {
        console.log(`🔄 중복 장비명으로 건너뜀: "${equip.equip_name}" (이미 존재함)`);
        duplicateNames.push(equip.equip_name);
        skippedCount++;
        return;
      }

      const sector = equip.sector || '알 수 없음';

      // 분야별 카운터 증가
      if (sectorCounts[sector] !== undefined) {
        sectorCounts[sector]++;
      } else {
        // 예상치 못한 분야는 '알 수 없음'으로 처리
        console.log(`⚠️ 알 수 없는 분야: "${sector}", '알 수 없음'으로 처리`);
        sectorCounts['알 수 없음']++;
      }

      // 3. ColorManager를 사용하여 분야별 색상 설정
      const fill = ColorManager.getDashboardSectorColor(sector);
      const border = ColorManager.getDarkColor(fill);

      // 장비명이 너무 길면 줄이기 (토폴로지 표시용)
      const displayName =
        equip.equip_name.length > 50 ? equip.equip_name.substring(0, 50) + '...' : equip.equip_name;

      const newEquip = {
        id: equip.equip_name, // 원본 장비명을 ID로 사용
        displayName: displayName, // 표시용 이름
        equip_id: equip.equip_id,
        type: 'equip',
        sector: sector,
        sectorIndex: sectorCounts[sector],
        color: fill,
        borderColor: border,
        guksa_name: equip.guksa_name,
      };

      uniqueEquipMap.set(equip.equip_name, newEquip);
      processedCount++;

      console.log(`✅ 장비 추가: "${displayName}" → 분야: ${sector}`);
    });

    console.log(
      `📊 처리 결과: 총 ${equipList.length}개 → 처리됨 ${processedCount}개, 건너뜀 ${skippedCount}개`
    );

    if (duplicateNames.length > 0) {
      console.log(`🔄 중복된 장비명들 (${duplicateNames.length}개):`, duplicateNames);
    }

    if (emptyNames.length > 0) {
      console.log(`📭 빈 장비명들 (${emptyNames.length}개):`, emptyNames);
    }

    console.log(`📊 분야별 분포:`, sectorCounts);
    console.log(`✅ createEquipNodes 완료: ${uniqueEquipMap.size}개 장비`);
    return uniqueEquipMap;
  }

  // 노드와 링크에 장비 추가
  addEquipNodesToMap(uniqueEquipMap, nodes, links, guksaName) {
    console.log(
      `🔗 노드와 링크 추가 시작: 장비 ${uniqueEquipMap.size}개, 기존 노드 ${nodes.length}개`
    );

    let addedNodes = 0;
    let addedLinks = 0;

    for (const equip of uniqueEquipMap.values()) {
      nodes.push(equip);
      addedNodes++;

      // 국사와 장비 간 링크 생성
      const link = {
        source: guksaName,
        target: equip.id,
        sector: equip.sector,
      };
      links.push(link);
      addedLinks++;

      console.log(`  📦 노드 추가: ${equip.id} (분야: ${equip.sector})`);
    }

    console.log(
      `✅ 노드와 링크 추가 완료: 노드 +${addedNodes}개 (총 ${nodes.length}개), 링크 +${addedLinks}개 (총 ${links.length}개)`
    );
  }

  // 토폴로지용 SVG 설정 - 우측 하단 등장 애니메이션 추가
  setupTopologySVG(width, height) {
    // 컨테이너 크기에 맞는 viewBox 설정
    const viewBoxWidth = width;
    const viewBoxHeight = height;

    // SVG 생성 - 컨테이너 전체 영역 활용
    this.svg = d3
      .select(this.container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${viewBoxWidth} ${viewBoxHeight}`)
      .style('background', '#ffffff');

    // 줌/패닝을 위한 루트 그룹
    this.g = this.svg.append('g').style('transform-origin', '0 0');

    // 전체 패닝을 원활히 하기 위해 캡처용 투명 사각형 추가 (노드 뒤쪽)
    this.g
      .insert('rect', ':first-child')
      .attr('class', 'zoom-capture')
      .attr('x', -viewBoxWidth)
      .attr('y', -viewBoxHeight)
      .attr('width', viewBoxWidth * 3)
      .attr('height', viewBoxHeight * 3)
      .style('fill', 'none')
      .style('pointer-events', 'all');

    // 즉시 표시
    this.g.style('opacity', 1);

    // 레이어 생성
    this.connectionLayer = this.g.append('g').attr('class', 'connection-layer');
    this.guksaLayer = this.g.append('g').attr('class', 'guksa-layer');
    this.equipmentLayer = this.g.append('g').attr('class', 'equipment-layer');
    this.labelLayer = this.g.append('g').attr('class', 'label-layer');

    // 컨테이너 overflow 설정 (잘림 방지)
    this.container.style.overflow = 'visible';

    // 줌/패닝 설정 - 노드 드래그와 배경 패닝 분리
    this.zoom = d3
      .zoom()
      .scaleExtent([0.2, 3.0])
      .filter(this.zoomFilter.bind(this))
      .on('zoom', this.onZoom.bind(this));

    // SVG에 줌 기능 적용
    this.svg.call(this.zoom);
  }

  // 제목 추가
  addTopologyTitle(guksaName, equipmentCount) {
    const titleDiv = document.createElement('div');
    titleDiv.className = 'map-title';
    titleDiv.style.cssText = `
      position: absolute;
      top: 10px;
      left: 10px;
      background: white;
      padding: 8px 12px;
      border-radius: 4px;
      border: 0;
      font-size: 11pt;
      font-weight: normal; 
      z-index: 1000;
      color: #333;
    `;
    titleDiv.textContent = `• 국사: '${guksaName}' (연결된 장비: ${equipmentCount} 대)`;
    this.container.appendChild(titleDiv);
  }

  // 줌 컨트롤 추가 - 그라데이션 제거 (2번 요구사항)
  addTopologyZoomControls() {
    // fault_d3_map.js의 addMapZoomControlPanel 함수 기능 구현
    const controlPanel = document.createElement('div');
    controlPanel.className = 'map-control-panel';
    controlPanel.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      background: white;
      border-radius: 4px;
      border: 0;
      padding: 1px;
      z-index: 1000;
      display: flex;
      gap: 1px;
    `;

    // 줌 인 버튼
    const zoomInBtn = this.createZoomButton('+', () => this.zoomIn());
    controlPanel.appendChild(zoomInBtn);

    // 줌 아웃 버튼
    const zoomOutBtn = this.createZoomButton('-', () => this.zoomOut());
    controlPanel.appendChild(zoomOutBtn);

    // 리셋 버튼
    const resetBtn = this.createZoomButton('Restore', () => this.resetZoom());
    resetBtn.style.width = '70px';
    resetBtn.style.fontSize = '12px';
    controlPanel.appendChild(resetBtn);

    this.container.appendChild(controlPanel);
  }

  createZoomButton(text, onClick) {
    const button = document.createElement('button');
    button.textContent = text;
    button.style.cssText = `
      margin: 1px;
      padding: 4px 0px;
      cursor: pointer;
      font-size: 15px;
      border: 1px solid #ccc;
      background: white;
      border-radius: 3px;
      width: 28px;
      height: 25px;
    `;
    button.onclick = onClick;
    return button;
  }

  zoomIn() {
    this.performZoom('in');
  }

  zoomOut() {
    this.performZoom('out');
  }

  resetZoom() {
    const { width, height } = this.getContainerDimensions();

    // 모든 노드의 범위 계산
    const nodes = this.g.selectAll('.node').data();
    if (nodes.length === 0) return;

    // 최초 맵 로드 시 크기와 위치로 복원
    let minX = Infinity,
      minY = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity;

    nodes.forEach((d) => {
      const nodeSize = d.type === 'guksa' ? 100 : 50; // 노드 크기 고려
      minX = Math.min(minX, d.x - nodeSize);
      minY = Math.min(minY, d.y - nodeSize);
      maxX = Math.max(maxX, d.x + nodeSize);
      maxY = Math.max(maxY, d.y + nodeSize);
    });

    // 화면 공간을 최대한 활용하도록 패딩 조정
    const padding = 80; // 적당한 패딩
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const dx = maxX - minX;
    const dy = maxY - minY;

    // 화면 공간을 최대한 활용하면서도 적절한 크기 유지
    const scale = Math.min(width / dx, height / dy, 1); // 최대 크기 제한
    const tx = (width - scale * (minX + maxX)) / 2;
    const ty = (height - scale * (minY + maxY)) / 2;

    // 리셋 애니메이션 제거
    this.svg.call(this.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }

  preprocessGuksaData(equipmentData) {
    const guksaGroups = d3.group(equipmentData, (d) => d.guksa_name);
    this.guksaData = [];
    this.guksaMap.clear();

    guksaGroups.forEach((equipments, guksaName) => {
      const enrichedEquipments = equipments.map((equip) => ({
        ...equip,
        alarms: this.getEquipmentAlarms(equip.equip_id),
      }));

      const stats = this.calculateGuksaStats(enrichedEquipments);

      const guksaInfo = {
        guksa_id: guksaName,
        guksa_name: guksaName,
        equipments: enrichedEquipments,
        stats: stats,
        x: null,
        y: null,
        width: this.calculateGuksaWidth(enrichedEquipments.length),
        height: this.calculateGuksaHeight(enrichedEquipments.length),
      };

      this.guksaData.push(guksaInfo);
      this.guksaMap.set(guksaName, guksaInfo);
    });

    this.equipmentData = equipmentData.map((equip) => ({
      ...equip,
      alarms: this.getEquipmentAlarms(equip.equip_id),
    }));

    StateManager.setCurrentGuksaList(this.guksaData);
    console.log(
      `📊 국사 데이터 전처리 완료: ${this.guksaData.length}개 국사, ${this.equipmentData.length}개 장비`
    );
  }

  getEquipmentAlarms(equipId) {
    const alarmData = StateManager.get('totalAlarmDataList', []);
    return alarmData.filter(
      (alarm) => alarm && (alarm.equip_id === equipId || alarm.equip_name === equipId)
    );
  }

  calculateGuksaStats(equipments) {
    const totalEquipments = equipments.length;
    const equipmentsWithAlarms = equipments.filter((e) => e.alarms && e.alarms.length > 0);
    const totalAlarms = equipments.reduce((sum, e) => sum + (e.alarms?.length || 0), 0);
    const validAlarms = equipments.reduce(
      (sum, e) => sum + (e.alarms?.filter((a) => a.valid_yn === 'Y').length || 0),
      0
    );

    const sectorCounts = {};
    equipments.forEach((equip) => {
      const sector = equip.equip_field || 'Unknown';
      sectorCounts[sector] = (sectorCounts[sector] || 0) + 1;
    });

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

  calculateGuksaWidth(equipmentCount) {
    const base = GUKSA_MAP_CONFIG.NODE.WIDTH;
    const factor = Math.min(equipmentCount / 10, 2);
    return Math.min(
      Math.max(base * factor, GUKSA_MAP_CONFIG.NODE.MIN_WIDTH),
      GUKSA_MAP_CONFIG.NODE.MAX_WIDTH
    );
  }

  calculateGuksaHeight(equipmentCount) {
    const base = GUKSA_MAP_CONFIG.NODE.HEIGHT;
    const factor = Math.min(equipmentCount / 15, 1.5);
    return Math.min(
      Math.max(base * factor, GUKSA_MAP_CONFIG.NODE.MIN_HEIGHT),
      GUKSA_MAP_CONFIG.NODE.MAX_HEIGHT
    );
  }

  // ================================
  // 레이아웃 및 위치 계산
  // ================================

  analyzeConnections() {
    this.connectionData = [];

    const sectorGroups = d3.group(this.guksaData, (d) => d.stats.primarySector);

    sectorGroups.forEach((guksas, sector) => {
      if (guksas.length > 1) {
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

  calculatePositions() {
    this.calculateGridPositions();
  }

  calculateGridPositions() {
    const { width, height } = this.getContainerDimensions();

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
  }

  // ================================
  // 렌더링 메서드들
  // ================================

  // 1. 초기 맵 애니메이션 추가
  renderConnections(animate = false) {
    // animate 기본값을 false로 변경
    const connections = this.connectionLayer
      .selectAll('.connection')
      .data(this.connectionData)
      .enter()
      .append('path')
      .attr('class', 'connection')
      .attr('d', (d) => this.generateConnectionPath(d))
      .style('stroke', '#ccc')
      .style('stroke-width', 2)
      .style('fill', 'none')
      .style('opacity', 0.6); // 애니메이션 제거하고 바로 표시

    this.connectionLayer
      .selectAll('.connection')
      .on('mouseover', this.handleConnectionMouseOver.bind(this))
      .on('mouseout', this.handleConnectionMouseOut.bind(this));
  }

  // 초기 맵 애니메이션 추가
  renderGuksas(animate = false) {
    // animate 기본값을 false로 변경
    const guksaGroups = this.guksaLayer
      .selectAll('.guksa-group')
      .data(this.guksaData)
      .enter()
      .append('g')
      .attr('class', 'guksa-group')
      .attr('transform', (d) => `translate(${d.x},${d.y})`)
      .style('opacity', 1); // 애니메이션 제거하고 바로 표시

    guksaGroups
      .append('rect')
      .attr('class', 'guksa-node')
      .attr('width', (d) => d.width)
      .attr('height', (d) => d.height)
      .attr('x', (d) => -d.width / 2)
      .attr('y', (d) => -d.height / 2)
      .attr('rx', GUKSA_MAP_CONFIG.NODE.BORDER_RADIUS)
      .attr('ry', GUKSA_MAP_CONFIG.NODE.BORDER_RADIUS)
      .style('fill', (d) => this.getGuksaFillColor(d))
      .style('stroke', (d) => this.getGuksaStrokeColor(d))
      .style('stroke-width', (d) => this.getGuksaStrokeWidth(d))
      .style('filter', 'url(#drop-shadow)')
      .style('cursor', 'pointer');

    guksaGroups
      .append('text')
      .attr('class', 'guksa-name')
      .attr('text-anchor', 'middle')
      .attr('dy', '-0.2em')
      .style('font-size', '11px')
      .style('font-weight', 'bold')
      .style('fill', '#fff')
      .style('pointer-events', 'none')
      .text((d) => this.getGuksaDisplayName(d));

    guksaGroups
      .append('text')
      .attr('class', 'guksa-stats')
      .attr('text-anchor', 'middle')
      .attr('dy', '1em')
      .style('font-size', '11px')
      .style('fill', '#fff')
      .style('pointer-events', 'none')
      .text((d) => `${d.stats.totalEquipments}대 | ${d.stats.totalAlarms}건`);

    guksaGroups
      .on('click', this.handleGuksaClick.bind(this))
      .on('mouseover', this.handleGuksaMouseOver.bind(this))
      .on('mouseout', this.handleGuksaMouseOut.bind(this));

    this.updateGuksaSelection();
  }

  // 초기 맵 애니메이션 추가
  renderEquipments(animate = false) {
    // animate 기본값을 false로 변경
    if (this.currentViewMode === VIEW_MODES.OVERVIEW) {
      return;
    }

    this.guksaData.forEach((guksa, guksaIndex) => {
      this.renderGuksaEquipments(guksa, false, guksaIndex); // 애니메이션 제거
    });
  }

  renderGuksaEquipments(guksa, animate = false, guksaIndex = 0) {
    const equipmentGroup = this.equipmentLayer
      .selectAll(`.equipment-group-${guksa.guksa_name.replace(/\s+/g, '-')}`)
      .data([guksa]);

    const equipmentGroupEnter = equipmentGroup
      .enter()
      .append('g')
      .attr('class', `equipment-group equipment-group-${guksa.guksa_name.replace(/\s+/g, '-')}`);

    const equipmentGroupUpdate = equipmentGroupEnter.merge(equipmentGroup);

    const equipmentSelection = equipmentGroupUpdate
      .selectAll('.equipment-node')
      .data(guksa.equipments, (d) => d.equip_id);

    equipmentSelection.exit().remove();

    const equipmentEnter = equipmentSelection
      .enter()
      .append('circle')
      .attr('class', 'equipment-node')
      .style('opacity', 1) // 애니메이션 제거하고 바로 표시
      .style('cursor', 'pointer')
      .on('click', this.handleEquipmentClick.bind(this))
      .on('mouseover', this.handleEquipmentMouseOver.bind(this))
      .on('mouseout', this.handleEquipmentMouseOut.bind(this));

    const equipmentUpdate = equipmentEnter.merge(equipmentSelection);
    const equipmentPositions = this.calculateEquipmentPositions(guksa);

    equipmentUpdate
      .attr('cx', (d, i) => guksa.x + equipmentPositions[i].x)
      .attr('cy', (d, i) => guksa.y + equipmentPositions[i].y)
      .attr('r', (d) => this.getEquipmentRadius(d))
      .attr('fill', (d) => this.getEquipmentFillColor(d))
      .attr('stroke', (d) => this.getEquipmentStrokeColor(d))
      .attr('stroke-width', 1.5)
      .style('opacity', 1); // 애니메이션 제거하고 바로 표시
  }

  calculateEquipmentPositions(guksa) {
    const equipments = guksa.equipments;
    const positions = [];

    const maxCols = Math.floor((guksa.width - 20) / GUKSA_MAP_CONFIG.EQUIPMENT.SPACING);
    const cols = Math.min(maxCols, Math.ceil(Math.sqrt(equipments.length)));

    const spacingX = GUKSA_MAP_CONFIG.EQUIPMENT.SPACING;
    const spacingY = GUKSA_MAP_CONFIG.EQUIPMENT.SPACING;

    const startX = -guksa.width / 2 + spacingX;
    const startY = -guksa.height / 2 + 30;

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

  // ================================
  // 스타일링 및 이벤트 처리
  // ================================

  getGuksaFillColor(guksa) {
    if (this.selectedGuksa === guksa.guksa_name) {
      return 'url(#selected-guksa-gradient)';
    }
    return 'url(#guksa-gradient)';
  }

  getGuksaStrokeColor(guksa) {
    if (this.selectedGuksa === guksa.guksa_name) {
      return '#c0392b';
    }
    return '#34495e';
  }

  getGuksaStrokeWidth(guksa) {
    if (this.selectedGuksa === guksa.guksa_name) {
      return 3;
    }
    return 2;
  }

  getGuksaDisplayName(guksa) {
    return guksa.guksa_name.length > 50
      ? guksa.guksa_name.substring(0, 50) + '...'
      : guksa.guksa_name;
  }

  getEquipmentRadius(equipment) {
    const hasAlarms = equipment.alarms && equipment.alarms.length > 0;
    return hasAlarms ? GUKSA_MAP_CONFIG.EQUIPMENT.RADIUS + 2 : GUKSA_MAP_CONFIG.EQUIPMENT.RADIUS;
  }

  getEquipmentFillColor(equipment) {
    return ColorManager.getEquipmentNodeColor(equipment.equip_field);
  }

  getEquipmentStrokeColor(equipment) {
    const hasAlarms = equipment.alarms && equipment.alarms.length > 0;
    return hasAlarms ? '#e74c3c' : '#34495e';
  }

  generateConnectionPath(connection) {
    const sourceGuksa = this.guksaMap.get(connection.source);
    const targetGuksa = this.guksaMap.get(connection.target);

    if (!sourceGuksa || !targetGuksa) return '';

    const x1 = sourceGuksa.x;
    const y1 = sourceGuksa.y;
    const x2 = targetGuksa.x;
    const y2 = targetGuksa.y;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const dr = Math.sqrt(dx * dx + dy * dy);

    return `M${x1},${y1}A${dr},${dr} 0 0,1 ${x2},${y2}`;
  }

  // ================================
  // 이벤트 핸들러
  // ================================

  handleGuksaClick(event, guksa) {
    event.stopPropagation();

    if (this.selectedGuksa === guksa.guksa_name) {
      if (this.currentViewMode === VIEW_MODES.EQUIPMENT_FOCUS) {
        this.setViewMode(VIEW_MODES.DETAILED);
      } else {
        this.setViewMode(VIEW_MODES.EQUIPMENT_FOCUS);
        this.focusOnGuksa(guksa.guksa_name);
      }
    } else {
      this.selectGuksa(guksa.guksa_name);
    }

    console.log(`🏢 국사 선택: ${guksa.guksa_name}`);
  }

  handleGuksaMouseOver(event, guksa) {
    TooltipManager.showGuksaTooltip(event, {
      guksa_id: guksa.guksa_id,
      guksa_name: guksa.guksa_name,
      equipmentCount: guksa.stats.totalEquipments,
      alarmCount: guksa.stats.validAlarms,
      sectors: guksa.stats.sectors,
    });

    this.highlightConnectedGuksas(guksa.guksa_name);
  }

  handleGuksaMouseOut(event, guksa) {
    TooltipManager.startAutoHideTimer();
    this.clearGuksaHighlight();
  }

  handleEquipmentClick(event, equipment) {
    event.stopPropagation();
    console.log(`⚙️ 장비 선택: ${equipment.equip_name} (${equipment.equip_id})`);
    StateManager.set('selectedEquipment', equipment.equip_id, { source: 'guksa-map-click' });
  }

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

  handleEquipmentMouseOut(event, equipment) {
    TooltipManager.startAutoHideTimer();
  }

  // ================================
  // 뷰 모드 및 상호작용
  // ================================

  selectGuksa(guksaName) {
    this.selectedGuksa = guksaName;
    this.updateGuksaSelection();
    StateManager.set('selectedGuksa', guksaName, { source: 'guksa-map-click' });
  }

  clearSelection() {
    this.selectedGuksa = null;
    this.updateGuksaSelection();
    StateManager.set('selectedGuksa', '', { source: 'guksa-map-clear' });
  }

  updateGuksaSelection() {
    // 장비 기준: 애니메이션 제거
    this.guksaLayer
      .selectAll('.guksa-node')
      .select('.guksa-background')
      .attr('fill', (d) => this.getGuksaFillColor(d))
      .attr('stroke', (d) => this.getGuksaStrokeColor(d))
      .attr('stroke-width', (d) => this.getGuksaStrokeWidth(d));
  }

  setViewMode(viewMode) {
    if (this.currentViewMode === viewMode) return;

    console.log(`👁️ 뷰 모드 변경: ${this.currentViewMode} → ${viewMode}`);

    const previousMode = this.currentViewMode;
    this.currentViewMode = viewMode;

    if (viewMode === VIEW_MODES.OVERVIEW) {
      this.hideEquipments();
    } else if (previousMode === VIEW_MODES.OVERVIEW) {
      this.showEquipments();
    }

    if (viewMode === VIEW_MODES.EQUIPMENT_FOCUS && this.selectedGuksa) {
      this.focusOnGuksa(this.selectedGuksa);
    } else if (previousMode === VIEW_MODES.EQUIPMENT_FOCUS) {
      this.fitToScreen();
    }
  }

  showEquipments() {
    this.renderEquipments(false); // 장비 기준: 애니메이션 제거
  }

  hideEquipments() {
    // 장비 기준: 애니메이션 제거
    this.equipmentLayer.selectAll('.equipment-group').style('opacity', 0).remove();
  }

  focusOnGuksa(guksaName) {
    const guksa = this.guksaMap.get(guksaName);
    if (!guksa) return;

    const scale = 3;
    const { width, height } = this.getContainerDimensions();
    const translate = [width / 2 - scale * guksa.x, height / 2 - scale * guksa.y];

    // 포커스 애니메이션 제거
    this.svg.call(
      this.zoom.transform,
      d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
    );

    this.guksaLayer
      .selectAll('.guksa-node')
      .style('opacity', (d) => (d.guksa_name === guksaName ? 1 : 0.3));
  }

  highlightConnectedGuksas(guksaName) {
    this.highlightedConnections.clear();

    this.connectionData.forEach((connection) => {
      if (connection.source === guksaName || connection.target === guksaName) {
        this.highlightedConnections.add(`${connection.source}-${connection.target}`);
      }
    });

    this.updateConnectionHighlight();
  }

  clearGuksaHighlight() {
    this.highlightedConnections.clear();
    this.updateConnectionHighlight();
  }

  updateConnectionHighlight() {
    this.connectionLayer
      .selectAll('.guksa-connection')
      .style('opacity', (d) => {
        const key = `${d.source}-${d.target}`;
        return this.highlightedConnections.has(key) ? 0.8 : 0.3;
      })
      .attr('stroke-width', (d) => {
        const key = `${d.source}-${d.target}`;
        return this.highlightedConnections.has(key) ? 4 : 2;
      });
  }

  // ================================
  // 줌 및 기타 기능
  // ================================

  fitToScreen() {
    if (!this.guksaData.length || !this.svg) return;

    const bounds = this.calculateBounds();
    const { width, height } = this.getContainerDimensions();

    const boundWidth = bounds.maxX - bounds.minX;
    const boundHeight = bounds.maxY - bounds.minY;

    if (boundWidth === 0 || boundHeight === 0) return;

    const midX = (bounds.minX + bounds.maxX) / 2;
    const midY = (bounds.minY + bounds.maxY) / 2;

    const scale = Math.min(width / boundWidth, height / boundHeight) * 0.8;
    const translate = [width / 2 - scale * midX, height / 2 - scale * midY];

    // 2번 문제: fit to screen 애니메이션 제거
    this.svg.call(
      this.zoom.transform,
      d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
    );
  }

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

  // ================================
  // 데이터 업데이트
  // ================================

  refreshMapData() {
    console.log('🔄 국사 맵 데이터 새로고침...');

    this.equipmentData.forEach((equipment) => {
      equipment.alarms = this.getEquipmentAlarms(equipment.equip_id);
    });

    this.guksaData.forEach((guksa) => {
      guksa.equipments.forEach((equipment) => {
        equipment.alarms = this.getEquipmentAlarms(equipment.equip_id);
      });
      guksa.stats = this.calculateGuksaStats(guksa.equipments);
    });

    StateManager.setCurrentGuksaList(this.guksaData);

    this.guksaLayer
      .selectAll('.guksa-node')
      .select('.guksa-stats')
      .text((d) => `${d.stats.totalEquipments}대 | ${d.stats.validAlarms}개 경보`);

    // 2번 문제: 알람 표시기 업데이트 애니메이션 제거
    this.guksaLayer
      .selectAll('.guksa-alarm-indicator')
      .attr('r', (d) => (d.stats.validAlarms > 0 ? 6 : 0))
      .style('opacity', (d) => (d.stats.validAlarms > 0 ? 1 : 0));

    if (this.currentViewMode !== VIEW_MODES.OVERVIEW) {
      // 2번 문제: 장비 노드 업데이트 애니메이션 제거
      this.equipmentLayer
        .selectAll('.equipment-node')
        .attr('r', (d) => this.getEquipmentRadius(d))
        .attr('fill', (d) => this.getEquipmentFillColor(d))
        .attr('stroke', (d) => this.getEquipmentStrokeColor(d));
    }
  }

  updateVisibility() {
    const selectedSector = StateManager.get('selectedSector');

    if (!selectedSector) {
      this.guksaLayer.selectAll('.guksa-node').style('opacity', 1);
      this.equipmentLayer.selectAll('.equipment-node').style('opacity', 1);
      return;
    }

    this.guksaLayer.selectAll('.guksa-node').style('opacity', (d) => {
      return d.stats.sectors.includes(selectedSector) ? 1 : 0.3;
    });

    this.equipmentLayer
      .selectAll('.equipment-node')
      .style('opacity', (d) => (d.equip_field === selectedSector ? 1 : 0.2));
  }

  handleResize() {
    if (!this.svg || !this.container) return;

    const { width, height } = this.getContainerDimensions();
    this.svg.attr('viewBox', `0 0 ${width} ${height}`);
  }

  // ================================
  // 유틸리티 및 정리
  // ================================

  handleError(message, error) {
    console.error(`❌ ${message}:`, error);
    MessageManager?.addErrorMessage?.(`${message}: ${error.message}`);
  }

  clearMap() {
    this.selectedGuksa = null;
    this.highlightedConnections.clear();
    this.guksaData = [];
    this.equipmentData = [];
    this.connectionData = [];
    this.guksaMap.clear();

    if (this.svg) {
      this.connectionLayer.selectAll('*').remove();
      this.guksaLayer.selectAll('*').remove();
      this.equipmentLayer.selectAll('*').remove();
      this.labelLayer.selectAll('*').remove();
    }
  }

  destroy() {
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('keydown', this.clearSelection);

    this.clearMap();

    if (this.container) {
      d3.select(this.container).selectAll('svg').remove();
    }

    console.log('🗑️ GuksaMapComponent 정리 완료');
  }

  getStats() {
    const alarmGuksas = this.guksaData.filter((g) => g.stats.validAlarms > 0);
    const totalEquipments = this.guksaData.reduce((sum, g) => sum + g.stats.totalEquipments, 0);
    const totalAlarms = this.guksaData.reduce((sum, g) => sum + g.stats.validAlarms, 0);

    return {
      isInitialized: this.isInitialized,
      guksaCount: this.guksaData.length,
      alarmGuksaCount: alarmGuksas.length,
      totalEquipments,
      totalAlarms,
      currentViewMode: this.currentViewMode,
      selectedGuksa: this.selectedGuksa,
    };
  }

  // 노드 위치 설정 (fault_d3_map.js 방식)
  setupTopologyNodePositions(nodes) {
    const { width, height } = this.getContainerDimensions();
    const guksaNode = nodes[0];

    // 국사 노드 초기 위치만 설정 (고정 제거)
    guksaNode.x = 100; // 좌측 여백을 고정값으로 지정하여 국사 노드를 화면 맨 좌측에 배치
    guksaNode.y = height / 2;

    const sectorGroups = d3.group(
      nodes.filter((n) => n.type === 'equip'),
      (d) => d.sector
    );

    // 분야별 그룹 위치 설정 (X축 목표 지점 설정)
    this.setupSectorGroupPositions(sectorGroups, guksaNode.x, width);
  }

  // 1. 분야별 그룹의 목표 X위치 설정
  setupSectorGroupPositions(sectorGroups, guksaX, width) {
    const SECTOR_ORDER = ['MW', '선로', '전송', 'IP', '무선', '교환'];
    const activeSectors = SECTOR_ORDER.filter((sector) => sectorGroups.has(sector));

    const marginRight = width * 0.05;
    const startX = guksaX + 300; // 국사 노드와의 기본 간격을 300px 로 확대
    const usableWidth = width - startX - marginRight;
    const groupSpacing = activeSectors.length > 1 ? usableWidth / (activeSectors.length - 1) : 0;

    activeSectors.forEach((sector, index) => {
      const groupNodes = sectorGroups.get(sector);
      const groupCenterX = startX + index * groupSpacing;
      groupNodes.forEach((node) => {
        node.groupCenterX = groupCenterX; // 시뮬레이션에서 사용할 목표 X좌표
      });
    });
  }

  // 툴팁 생성
  createTopologyTooltip() {
    return d3
      .select('body')
      .append('div')
      .attr('class', 'topology-tooltip')
      .style('opacity', 0)
      .style('position', 'absolute')
      .style('background-color', 'white')
      .style('border', '1px solid #ddd')
      .style('border-radius', '4px')
      .style('padding', '8px')
      .style('pointer-events', 'auto')
      .style('font-size', '12px')
      .style('z-index', 10)
      .style('max-width', '350px')
      .style('max-height', '300px');
  }

  // 힘 시뮬레이션 생성 - 그룹핑 강화
  createTopologySimulation(nodes, links) {
    const { width, height } = this.getContainerDimensions();

    const simulation = d3
      .forceSimulation(nodes)
      .force(
        'link',
        d3
          .forceLink(links)
          .id((d) => d.id)
          .distance(45) // 링크 거리 절반으로 감소
          .strength(0.3)
      )
      .force('charge', d3.forceManyBody().strength(-50)) // 반발력을 더욱 낮춰 노드 간 충돌 완화
      .force(
        'x',
        d3
          .forceX((d) => {
            if (d.type === 'guksa') return width * 0.15; // 국사는 좌측 고정
            return d.groupCenterX || width / 2; // 각 분야 목표 중심
          })
          .strength(1.0) // 분야별 X 축 정렬 강도 유지
      )
      .force('y', d3.forceY(height / 2).strength(0.1))
      .force('collide', d3.forceCollide().radius(20).strength(1)); // 충돌 반경을 더 줄여 노드 밀집 완화

    this.simulation = simulation; // 인스턴스 저장
    return simulation;
  }

  // 3. 올바른 드래그 핸들러 구현
  dragstarted(event, d) {
    if (!event.active) this.simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  dragended(event, d) {
    if (!event.active) this.simulation.alphaTarget(0);
    // drag 후 위치에 노드를 고정합니다. fx와 fy를 해제하지 않습니다.
  }

  renderFallbackGuksaMap(data) {
    const { guksa_name, error_message } = data;

    // 간단한 1줄 메시지로 표시
    let message = '';
    if (error_message) {
      message = error_message;
    } else if (data.equip_count === 0) {
      message = `❌ ${guksa_name || '해당'} 국사에 수용된 장비를 찾을 수 없습니다.`;
    } else {
      message = `❌ ${guksa_name || '해당'} 국사의 토폴로지 데이터를 로드할 수 없습니다.`;
    }

    // 기존 컨테이너 내용 제거
    this.container.innerHTML = '';

    // 심플한 메시지 표시 (MessageManager/EquipmentMapComponent 방식)
    const messageDiv = document.createElement('div');
    messageDiv.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: 20px;
      text-align: center;
      color: #777;
      font-size: 16px;
      background: white;
      border-radius: 4px;
    `;
    messageDiv.textContent = message;

    this.container.appendChild(messageDiv);
  }

  // 링크 생성
  createTopologyLinks(links) {
    return this.connectionLayer
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', (d) => ColorManager.getDashboardSectorColor(d.sector))
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', 2);
  }

  // 노드 생성
  createTopologyNodes(nodes, simulation, tooltip) {
    const node = this.guksaLayer
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', (d) => `node ${d.type === 'guksa' ? 'node-guksa' : `node-${d.sector}`}`)
      .style('cursor', 'pointer')
      // 개별 노드 드래그 핸들러 복원
      .call(
        d3
          .drag()
          .on('start', (event, d) => this.dragstarted(event, d))
          .on('drag', (event, d) => this.dragged(event, d))
          .on('end', (event, d) => this.dragended(event, d))
      );

    // 노드 형태 추가
    node.each(function (d) {
      const selection = d3.select(this);

      // 국사 노드인 경우 설정
      if (d.type === 'guksa') {
        // ColorManager의 GUKSA_FILL과 GUKSA_BORDER 사용
        const guksaColors = ColorManager.getGuksaMapColor('guksa');
        selection
          .append('rect')
          .attr('width', 90)
          .attr('height', 30)
          .attr('x', -45)
          .attr('y', -15)
          .attr('rx', 5)
          .attr('ry', 5)
          .attr('fill', guksaColors.fill)
          .attr('stroke', guksaColors.border)
          .attr('stroke-width', 2.5);
      } else {
        // 일반 노드인 경우 설정
        selection
          .append('circle')
          .attr('r', 14)
          .attr('fill', ColorManager.getDashboardSectorColor(d.sector)) // FIELD_COLORS 일관성 사용
          .attr('stroke', d.borderColor)
          .attr('stroke-width', 2.5);
      }
    });

    // 경보 배지 추가
    this.addAlarmBadges(node, nodes);

    // 텍스트 추가
    node
      .append('text')
      .text((d) => {
        if (d.type === 'guksa') return d.id.substring(0, 5);
        return d.sector;
      })
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', 'white')
      .attr('font-size', (d) => (d.type === 'guksa' ? '13px' : '11px'))
      .attr('font-weight', 'bold');

    // 라벨 추가
    node
      .append('text')
      .text((d) => {
        if (d.type === 'guksa') return '';
        const labelText = d.displayName || d.id;
        const maxLength = 20;
        return labelText.length > maxLength ? labelText.slice(0, maxLength) + '...' : labelText;
      })
      .attr('text-anchor', 'middle')
      .attr('x', 0)
      .attr('y', (d) => (d.type === 'guksa' ? 26.25 : 31.25))
      .attr('font-size', '13px')
      .attr('fill', '#333');

    // 마우스 이벤트 추가
    node
      .on('mouseover', (event, d) => this.handleTopologyMouseOverImproved(event, d, tooltip))
      .on('mouseout', (event, d) => this.handleTopologyMouseOut(event, d, tooltip))
      .on('click', (event, d) => this.handleTopologyClick(event, d));

    return node;
  }

  // 개선된 마우스 오버 핸들러
  handleTopologyMouseOverImproved(event, d, tooltip) {
    // TooltipManager 사용하여 상세한 툴팁 표시
    if (d.type === 'guksa') {
      const guksaData = {
        guksa_id: d.id,
        guksa_name: d.id,
        equipmentCount: d.nodeCount || '알 수 없음',
        alarmCount: d.alarmCount || 0,
        alarms: d.alarmMessages || [],
      };
      TooltipManager.showGuksaTooltip(event, guksaData);
    } else {
      const equipmentData = {
        equip_id: d.equip_id || d.id,
        equip_name: d.id,
        equip_type: d.sector,
        equip_field: d.sector,
        guksa_name: d.guksa_name,
        alarms: d.alarmMessages || [],
      };
      TooltipManager.showEquipmentTooltip(event, equipmentData);
    }

    // 노드 크기 증가 애니메이션 제거
    if (d.type === 'guksa') {
      d3.select(event.currentTarget)
        .select('rect')
        .attr('width', 94.5)
        .attr('height', 33)
        .attr('x', -47.25)
        .attr('y', -16.5);
    } else {
      d3.select(event.currentTarget).select('circle').attr('r', 17);
    }
  }

  // 시뮬레이션 설정
  setupTopologySimulation(simulation, nodes, link, node) {
    const { width, height } = this.getContainerDimensions();
    const margin = 30;

    simulation.on('tick', () => {
      // 노드 위치 제한 (화면 밖으로 나가지 않도록)
      node.attr('transform', (d) => {
        d.x = Math.max(margin, Math.min(width - margin, d.x));
        d.y = Math.max(margin, Math.min(height - margin, d.y));
        return `translate(${d.x},${d.y})`;
      });

      // 링크 위치 업데이트
      link
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y);
    });
  }

  // 마우스 이벤트 핸들러들
  handleTopologyMouseOver(event, d, tooltip) {
    let tooltipContent = '';

    if (d.type === 'guksa') {
      tooltipContent = `<strong>• 국사:</strong> ${d.id}<br><strong>• 장비 수:</strong> ${
        d.nodeCount || '알 수 없음'
      }`;
    } else {
      // 원본 장비명 (id)을 툴팁에 표시
      const equipmentName = d.id; // 원본 전체 장비명
      const maxTooltipLength = 60; // 툴팁에서는 더 긴 이름 허용
      const displayEquipName =
        equipmentName.length > maxTooltipLength
          ? equipmentName.substring(0, maxTooltipLength) + '...'
          : equipmentName;

      tooltipContent = `
        <strong>• 장비:</strong> ${displayEquipName}<br>
        <strong>• 분야:</strong> ${d.sector}<br>
        <strong>• 국사:</strong> ${d.guksa_name}<br>
      `;
    }

    tooltip
      .html(tooltipContent)
      .style('left', event.pageX + 10 + 'px')
      .style('top', event.pageY - 28 + 'px')
      .style('opacity', 0.9); // 애니메이션 제거

    // 노드 크기 증가 애니메이션 제거
    if (d.type === 'guksa') {
      d3.select(event.currentTarget)
        .select('rect')
        .attr('width', 126)
        .attr('height', 44)
        .attr('x', -63)
        .attr('y', -22);
    } else {
      d3.select(event.currentTarget).select('circle').attr('r', 22);
    }
  }

  handleTopologyMouseOut(event, d, tooltip) {
    TooltipManager.startAutoHideTimer();

    // 노드 크기 원복 애니메이션 제거
    if (d.type === 'guksa') {
      d3.select(event.currentTarget)
        .select('rect')
        .attr('width', 90)
        .attr('height', 30)
        .attr('x', -45)
        .attr('y', -15);
    } else {
      d3.select(event.currentTarget).select('circle').attr('r', 14);
    }
  }

  handleTopologyClick(event, d) {
    console.log('토폴로지 노드 클릭:', d);
    if (d.type === 'equip') {
      // 장비 상세 정보 표시 등의 액션
      StateManager.set('selectedEquipment', d.equip_id);
    }
  }

  // 실제 경보 배지 추가 부분
  addAlarmBadges(node, nodes) {
    console.log('🚨 경보 배지 추가 시작...');

    // StateManager에서 알람 데이터 가져오기
    const alarmData =
      StateManager.get('totalAlarmDataList', []) || StateManager.get('alarmData', []);
    console.log('📊 전체 알람 데이터:', alarmData.length, '개');

    node.each(function (d) {
      const selection = d3.select(this);

      // 노드별 알람 필터링
      let nodeAlarms = [];
      if (d.type === 'guksa') {
        nodeAlarms = alarmData.filter((alarm) => alarm && alarm.guksa_name === d.id);
      } else {
        nodeAlarms = alarmData.filter(
          (alarm) =>
            alarm &&
            (alarm.equip_name === d.id ||
              alarm.equip_id === d.equip_id ||
              (alarm.equip_name && d.id && alarm.equip_name.includes(d.id)))
        );
      }

      const alarmCount = nodeAlarms.length;
      console.log(`📦 ${d.type} "${d.id}" 알람 수:`, alarmCount);

      // 알람이 있는 경우에만 배지 추가
      if (alarmCount > 0 && d.type !== 'guksa') {
        // EquipmentMapComponent와 동일한 스타일 적용
        selection
          .append('circle')
          .attr('class', 'alarm-badge')
          .attr('cx', 16) // 통일된 위치
          .attr('cy', -16) // 통일된 위치
          .attr('r', 10) // 통일된 크기
          .style('fill', '#e74c3c')
          .style('fill-opacity', 0.8) // EquipmentMapComponent와 동일
          .style('stroke', 'white')
          .style('stroke-width', 1); // 통일된 테두리

        selection
          .append('text')
          .attr('class', 'alarm-badge-text')
          .attr('x', 16)
          .attr('y', -19)
          .attr('text-anchor', 'middle')
          .attr('dy', '0.3em')
          .style('font-size', '11px')
          .style('font-weight', 'bold')
          .style('fill', 'white')
          .style('pointer-events', 'none')
          .text(alarmCount > 99 ? '99+' : alarmCount); // 99+ 표시 로직 추가

        // 노드에 알람 정보 저장
        d.alarmMessages = nodeAlarms;
        d.alarmCount = alarmCount;
      }
    });

    console.log('✅ 경보 배지 추가 완료');
  }

  // 4. ZoomIn, ZoomOut 통합
  performZoom(direction) {
    const { width, height } = this.getContainerDimensions();
    const currentTransform = d3.zoomTransform(this.svg.node());

    const scaleFactor = direction === 'in' ? 1.2 : 0.8;
    const minScale = 0.2;
    const maxScale = 3.0;

    const newScale = Math.max(minScale, Math.min(maxScale, currentTransform.k * scaleFactor));

    const centerX = width / 2;
    const centerY = height / 2;
    const worldCenterX = (centerX - currentTransform.x) / currentTransform.k;
    const worldCenterY = (centerY - currentTransform.y) / currentTransform.k;
    const newX = centerX - worldCenterX * newScale;
    const newY = centerY - worldCenterY * newScale;

    this.svg.call(this.zoom.transform, d3.zoomIdentity.translate(newX, newY).scale(newScale));
  }

  // 5. 중복 코드 제거 - 마우스 이벤트 핸들러 통합
  handleConnectionMouseOver(event, connection) {
    // 연결선 강조 표시
    d3.select(event.currentTarget).style('stroke-width', 4).style('opacity', 1);
  }

  handleConnectionMouseOut(event, connection) {
    // 연결선 원상복구
    d3.select(event.currentTarget).style('stroke-width', 2).style('opacity', 0.6);
  }

  // 2. 줌/패닝 필터: 노드 위에서는 드래그, 빈 공간에서는 패닝
  zoomFilter(event) {
    // 컨트롤 패널 클릭 시 줌/패닝 비활성화
    if (event.target.closest('.map-control-panel')) return false;
    // 노드(click on node) 위에서 시작된 mousedown은 개별 드래그용, 줌/패닝 차단
    if (event.type === 'mousedown' && event.target.closest('.node')) return false;
    // 마우스 휠과 배경 mousedown은 허용
    if (event.type === 'wheel' || event.type === 'dblclick') return true;
    if (event.type === 'mousedown') return true;
    return false;
  }

  // 줌/패닝 이벤트 핸들러
  onZoom(event) {
    this.g.attr('transform', event.transform);
    this.currentTransform = event.transform;
  }
}

export default GuksaMapComponent;
