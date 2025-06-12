/**
 * 장비 토폴로지 맵 구성 컴포넌트
 */

import { stateManager as StateManager } from './StateManager.js';
import { faultDashboardApp as FaultDashboardApp } from './FaultDashboardApp.js';
import { tooltipManager as TooltipManager } from '../utils/TooltipManager.js';
import { colorManager as ColorManager } from '../utils/ColorManager.js';
import CommonUtils from '../utils/CommonUtils.js';
import MessageManager from '../utils/MessageManager.js';

// 설정 상수 통합
const MAP_CONFIG = {
  DEFAULT_WIDTH: 800,
  DEFAULT_HEIGHT: 600,
  ZOOM: {
    MIN: 0.1,
    MAX: 10,
    SCALE_FACTOR: 1.5,
    TRANSITION_DURATION: 300,
  },
  NODE: {
    RADIUS: { DEFAULT: 20, SELECTED: 25 },
    LABEL_MAX_LENGTH: 35,
  },
  LAYOUT: {
    LEVEL_GAP: 400,
    MIN_DISTANCE: 100,
    EQUIPMENT_SPACING: 50,
    MAX_ANGLE: 50,
  },
  SIMULATION: {
    LINK_DISTANCE: 150,
    LINK_STRENGTH: 0.8,
    CHARGE_STRENGTH: -800,
    COLLISION_RADIUS: 40,
    ALPHA_DECAY: 0.02,
    INITIAL_ALPHA: 0.1,
    AUTO_STOP_DELAY: 1500,
  },
  ANIMATION: {
    DURATION: 600,
    INITIAL_SCALE: 3,
    LOADING_CLEAR_DELAY: 1000,
  },
  MAX_EQUIPMENT_COUNT: 50,
};

export class EquipmentMapComponent {
  //장비 토폴로지 맵 컴포넌트 생성자 - 기본 속성 초기화 및 초기화
  constructor(containerId = 'map-container') {
    this.containerId = containerId;
    this.container = null;
    this.svg = null;
    this.g = null;
    this.simulation = null;
    this.zoom = null;
    this.nodes = [];
    this.links = [];
    this.selectedNodes = new Set();
    this.isInitialized = false;
    this.currentTransform = d3.zoomIdentity;
    this.connectionMap = new Map();
    this.linkRelations = [];

    // 렌더링 요소들
    this.nodeElements = null;
    this.linkElements = null;
    this.linkLabels = null;

    this.init();
  }

  //컴포넌트 초기화 - 컨테이너 확인, SVG 설정, 줌 설정, 전역 이벤트 설정
  init() {
    try {
      this.container = this.getContainer();
      if (!this.container) return;

      if (typeof d3 !== 'undefined') {
        this.setupSVG();
        this.setupZoom();
      }

      this.isInitialized = true;
      console.log('✅ EquipmentMapComponent 초기화 완료');
    } catch (error) {
      this.handleError('EquipmentMapComponent 초기화 실패', error);
    }
  }

  //맵 컨테이너 DOM 요소 조회
  getContainer() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error(`맵 컨테이너를 찾을 수 없습니다: ${this.containerId}`);
    }
    return container;
  }

  //SVG 요소 생성 및 기본 설정
  setupSVG() {
    const { width, height } = this.getContainerDimensions();
    d3.select(this.container).selectAll('svg').remove();

    this.svg = d3
      .select(this.container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('background', '#f8f9fa');

    this.g = this.svg.append('g').attr('class', 'map-main-group');
  }

  //컨테이너의 너비/높이 계산
  getContainerDimensions() {
    const rect = this.container.getBoundingClientRect();
    return {
      width: rect.width || MAP_CONFIG.DEFAULT_WIDTH,
      height: rect.height || MAP_CONFIG.DEFAULT_HEIGHT,
    };
  }

  //장애점 찾기 버튼에 대한 전역 이벤트 위임 설정
  setupGlobalEventDelegation() {
    document.addEventListener('click', (e) => {
      if (e.target.id === 'fault-point-chat-btn') {
        e.preventDefault();
        e.stopPropagation();
        console.log('🔍 장애점 찾기 버튼 클릭 감지');
        FaultDashboardApp.handleFaultAnalysis();
        return;
      }
    });
    console.log('🌐 전역 이벤트 위임 설정 완료');
  }

  //D3 줌 기능 초기화 및 설정
  setupZoom() {
    this.zoom = d3
      .zoom()
      .scaleExtent([MAP_CONFIG.ZOOM.MIN, MAP_CONFIG.ZOOM.MAX])
      .filter(this.zoomFilter.bind(this))
      .on('zoom', this.onZoom.bind(this));

    if (this.svg) {
      this.svg.call(this.zoom).on('wheel.zoom', null);
    }
  }

  //줌 이벤트 필터링 - 줌 컨트롤 버튼에서는 줌 비활성화
  zoomFilter(event) {
    if (event.target.closest('.zoom-controls-container')) {
      return false;
    }
    return (
      event.type === 'wheel' ||
      event.type === 'dblclick' ||
      (event.type === 'mousedown' &&
        !event.target.closest('circle') &&
        !event.target.closest('.node-group'))
    );
  }

  //줌 이벤트 처리 - 맵 그룹 변환 적용
  onZoom(event) {
    if (this.g) {
      this.g.attr('transform', event.transform);
      this.currentTransform = event.transform;
    }
  }

  //장비 토폴로지 렌더링 메인 진입점 - 전체 프로세스 제어
  async renderEquipmentTopology(equipId, equipmentData, linkData, options = {}) {
    try {
      console.log(`🔧 장비 토폴로지 렌더링: ${equipId}`);

      if (!this.container) {
        throw new Error('맵 컨테이너가 없습니다.');
      }

      this.showLoadingMessage();
      const targetEquip = this.findTargetEquipment(equipId, equipmentData);
      const relatedEquipment = await this.findRelatedEquipment(targetEquip, equipmentData);
      this.drawTopologyMap(relatedEquipment, targetEquip);
    } catch (error) {
      this.handleRenderError(equipId, error);
    }
  }

  //토폴로지 생성 중 로딩 메시지 표시 ############ TO DO : 메시지 표시 중복 처리 여부 확인 필요
  showLoadingMessage() {
    CommonUtils.map?.showMapLoadingMessage?.('NW 토폴로지 MAP을 생성합니다.', this.container);
  }

  //타겟 장비 검색 - 경보 데이터 또는 장비 데이터에서 조회
  findTargetEquipment(equipId, equipmentData) {
    if (!equipId) throw new Error('장비 ID가 필요합니다.');

    const targetEquip =
      this.searchInAlarmData(equipId) || this.searchInEquipmentData(equipId, equipmentData);

    if (!targetEquip) {
      throw new Error('장비를 찾을 수 없습니다.');
    }

    return targetEquip;
  }

  //경보 데이터에서 타겟 장비 검색 및 경보 정보 수집
  searchInAlarmData(equipId) {
    const alarmData = StateManager.get('totalAlarmDataList', []);
    const matchingAlarm = alarmData.find((alarm) => alarm && alarm.equip_id === equipId);

    if (!matchingAlarm) return null;

    const allAlarmsForEquip = alarmData.filter(
      (alarm) => alarm && alarm.equip_id === matchingAlarm.equip_id
    );

    return {
      equip_id: matchingAlarm.equip_id,
      equip_name: matchingAlarm.equip_name,
      equip_type: matchingAlarm.equip_type,
      equip_field: matchingAlarm.sector,
      guksa_name: matchingAlarm.guksa_name,
      valid_yn: matchingAlarm.valid_yn,
      alarm_message: matchingAlarm.alarm_message,
      alarms: allAlarmsForEquip,
      alarmCount: allAlarmsForEquip.length,
      validAlarmCount: allAlarmsForEquip.filter((a) => a.valid_yn === 'Y').length,
    };
  }

  //장비 데이터에서 타겟 장비 검색
  searchInEquipmentData(equipId, equipmentData) {
    return equipmentData?.find((e) => e && e.equip_id === equipId);
  }

  //API를 통한 연결된 장비 검색 및 토폴로지 구성
  async findRelatedEquipment(targetEquip, equipmentData) {
    if (!targetEquip) return [];

    try {
      console.log(`API를 통한 연결된 장비 검색 시작: ${targetEquip.equip_id}`);

      const apiResult = await this.callTopologyAPI(targetEquip);
      this.processAPIResponse(apiResult);

      const equipmentMap = this.buildEquipmentMap(apiResult, targetEquip);
      const result = Array.from(equipmentMap.values());

      this.logSearchResults(result);
      return result;
    } catch (error) {
      console.error('❌ API 기반 장비 검색 실패:', error);
      return [];
    }
  }

  //장비 토폴로지 구성용 API 호출
  async callTopologyAPI(targetEquip) {
    return (
      (await CommonUtils.api?.callMapApi?.(
        '/api/alarm_dashboard_equip',
        {
          equip_id: targetEquip.equip_id,
          guksa_name: targetEquip.guksa_name,
        },
        {
          method: 'POST',
          timeout: 30000,
          retries: 2,
          onProgress: (status) => {
            CommonUtils.map?.updateMapLoadingMessage?.(`NW 토폴로지 구성 API 호출: ${status}`);
          },
        }
      )) || { equipment: {}, links: [] }
    );
  }

  //API 응답 결과 처리 - 연결 관계 맵 생성
  processAPIResponse(apiResult) {
    const { equipment: apiEquipment, links: apiLinks } = apiResult;
    this.connectionMap = new Map();
    this.linkRelations = apiLinks || [];
    this.buildConnectionMap(apiLinks);
    console.log(`🔗 연결 관계 맵 생성 완료: ${this.connectionMap.size}개 연결`);
  }

  //장비 연결 정보를 파싱하여 연결 관계 맵 생성
  buildConnectionMap(apiLinks) {
    if (!Array.isArray(apiLinks)) return;

    apiLinks.forEach((linkKey) => {
      const parts = linkKey.split(':::');
      if (parts.length >= 4) {
        const [sourceId, targetId, linkName, upDown] = parts;
        this.addConnectionToMap(sourceId, targetId, linkName, upDown);
      }
    });
  }

  //개별 연결 정보를 연결 관계 맵에 추가
  addConnectionToMap(sourceId, targetId, linkName, upDown) {
    const sourceKey = `${sourceId}_${targetId}`;
    const targetKey = `${targetId}_${sourceId}`;

    this.connectionMap.set(sourceKey, {
      connected: true,
      upDown: upDown,
      linkName: linkName,
      direction: 'source_to_target',
    });

    this.connectionMap.set(targetKey, {
      connected: true,
      upDown: upDown === 'up' ? 'down' : 'up',
      linkName: linkName,
      direction: 'target_to_source',
    });
  }

  //API 결과를 기반으로 장비 맵 데이터 구조 생성
  buildEquipmentMap(apiResult, targetEquip) {
    const { equipment: apiEquipment } = apiResult;
    const alarmData = StateManager.get('totalAlarmDataList', []);
    const equipmentMap = new Map();

    if (apiEquipment) {
      Object.values(apiEquipment).forEach((apiEquip) => {
        const equipmentInfo = this.createEquipmentInfo(apiEquip, alarmData, targetEquip);
        equipmentMap.set(apiEquip.equip_id, equipmentInfo);
      });
    }

    this.ensureTargetEquipment(equipmentMap, targetEquip, alarmData);
    return equipmentMap;
  }

  //개별 장비 정보 객체 생성
  createEquipmentInfo(apiEquip, alarmData, targetEquip) {
    const equipAlarms = alarmData.filter((alarm) => alarm && alarm.equip_id === apiEquip.equip_id);

    return {
      equip_id: apiEquip.equip_id,
      equip_name: apiEquip.equip_name || apiEquip.equip_id,
      equip_type: apiEquip.equip_type || '알수없음',
      equip_field: apiEquip.equip_field || '알수없음',
      guksa_name: apiEquip.guksa_name || targetEquip.guksa_name,
      up_down: apiEquip.up_down || 'unknown',
      alarms: this.processAlarmData(equipAlarms),
      alarmCount: equipAlarms.length,
      validAlarmCount: equipAlarms.filter((alarm) => alarm.valid_yn === 'Y').length,
      isTarget: apiEquip.equip_id === targetEquip.equip_id,
    };
  }

  //경보 데이터 가공 및 정제
  processAlarmData(equipAlarms) {
    return equipAlarms.map((alarm) => ({
      alarm_message: alarm.alarm_message,
      occur_datetime: alarm.occur_datetime,
      valid_yn: alarm.valid_yn,
      alarm_grade: alarm.alarm_grade,
    }));
  }

  //타겟 장비가 맵에 포함되도록 보장
  ensureTargetEquipment(equipmentMap, targetEquip, alarmData) {
    if (!equipmentMap.has(targetEquip.equip_id)) {
      const targetAlarms = alarmData.filter(
        (alarm) => alarm && alarm.equip_id === targetEquip.equip_id
      );

      equipmentMap.set(targetEquip.equip_id, {
        ...targetEquip,
        alarms: this.processAlarmData(targetAlarms),
        alarmCount: targetAlarms.length,
        validAlarmCount: targetAlarms.filter((alarm) => alarm.valid_yn === 'Y').length,
        isTarget: true,
        up_down: 'center',
      });
    } else {
      const existingEquip = equipmentMap.get(targetEquip.equip_id);
      existingEquip.isTarget = true;
      existingEquip.up_down = 'center';
    }
  }

  //장비 검색 결과 로깅
  logSearchResults(result) {
    console.log(`🎯 API 기반 관련 장비 검색 완료: ${result.length}개 장비`);
    console.log('📊 연결 관계 장비 토폴로지 조회 결과:', {
      총_장비수: result.length,
      상위_장비: result.filter((e) => e.up_down === 'up').length,
      하위_장비: result.filter((e) => e.up_down === 'down').length,
      중앙_장비: result.filter((e) => e.up_down === 'center').length,
    });
  }

  // 맵 그리기 메인 메서드
  drawTopologyMap(equipmentList, targetEquip) {
    if (typeof d3 === 'undefined') {
      throw new Error('D3.js가 로드되지 않았습니다.');
    }

    try {
      const { width, height } = this.initializeMap();
      const { nodes, links } = this.prepareMapData(equipmentList, targetEquip, width, height);
      this.renderMapElements(nodes, links, width, height);
      this.showSuccessMessage(targetEquip, equipmentList);
      console.log('✅ 맵 그리기 완료');
    } catch (error) {
      this.handleDrawError(targetEquip, error);
    }
  }

  initializeMap() {
    const parentPanel = this.container.closest('.left-map-panel');
    const containerRect =
      parentPanel?.getBoundingClientRect() || this.container.getBoundingClientRect();

    const width = Math.max(containerRect.width || 800, 400);
    const height = Math.max(containerRect.height || 500, 300);

    this.container.innerHTML = '';

    this.svg = d3
      .select(this.container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('background', '#ffffff');

    this.g = this.svg.append('g').attr('class', 'map-main-group');
    this.setupZoom();

    return { width, height };
  }

  prepareMapData(equipmentList, targetEquip, width, height) {
    const centerX = width / 2;
    const centerY = height / 2;

    const nodes = this.createMapNodes(equipmentList, targetEquip, centerX, centerY);
    const links = this.createMapLinks(nodes, targetEquip);

    this.nodes = nodes;
    this.links = links;

    console.log(`🗺️ 맵 데이터 준비 완료: 노드 ${nodes.length}개, 링크 ${links.length}개`);
    return { nodes, links };
  }

  // 핵심 렌더링 메서드 (하나로 통합)
  renderMapElements(nodes, links, width, height) {
    try {
      const alarmData = StateManager.get('totalAlarmDataList', []);
      const enrichedData = StateManager.enrichMapDataWithAlarms(nodes, links, alarmData);

      this.nodes = enrichedData.nodes;
      this.links = enrichedData.links;

      this.addZoomControls(width, height);
      this.addMapTitle(enrichedData.nodes);
      this.renderLinks(enrichedData.links);
      this.renderNodes(enrichedData.nodes);
      this.setupOptimizedPositioning(enrichedData.nodes, enrichedData.links, width, height);
      this.applyMapAnimation();

      console.log('✅ 맵 렌더링 완료');

      setTimeout(() => {
        CommonUtils.map?.clearMapMessages?.(this.container);
      }, MAP_CONFIG.ANIMATION.LOADING_CLEAR_DELAY);
    } catch (error) {
      this.handleRenderElementsError(nodes, error);
    }
  }

  // 링크 렌더링 (최적화된 단일 버전)
  renderLinks(links) {
    const linkGroup = this.g.append('g').attr('class', 'links');

    this.linkElements = linkGroup
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr(
        'stroke',
        (d) => ColorManager.getLinkColor?.(d.sourceNode.field, d.targetNode.field) || '#666'
      )
      .attr('stroke-width', 3)
      .attr('stroke-opacity', 0.8)
      .attr('stroke-dasharray', (d) => {
        const isMWLink = d.sourceNode.field === 'MW' && d.targetNode.field === 'MW';
        return isMWLink ? '8,4' : 'none';
      })
      .style('pointer-events', 'stroke')
      .style('cursor', 'pointer')
      .attr('class', 'connection-line');

    this.linkLabels = linkGroup
      .selectAll('text')
      .data(links)
      .enter()
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', -8)
      .style('font-size', '11px')
      .style('fill', '#ee4106')
      .style('pointer-events', 'all')
      .style('user-select', 'none')
      .style('cursor', 'pointer')
      .attr('class', 'connection-label')
      .text((d) => d.link_name);
  }

  // 노드 렌더링 (최적화된 단일 버전)
  renderNodes(nodes) {
    const nodeGroup = this.g.append('g').attr('class', 'nodes');
    const alarmCache = this.buildAlarmCache();

    this.nodeElements = nodeGroup
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node-group')
      .style('cursor', 'pointer')
      .style('pointer-events', 'all');

    this.addNodeElements(this.nodeElements, alarmCache);
  }

  buildAlarmCache() {
    const totalAlarmData = StateManager.get('totalAlarmDataList', []);
    const alarmCache = new Map();

    totalAlarmData.forEach((alarm) => {
      if (alarm?.equip_id) {
        alarmCache.set(alarm.equip_id, (alarmCache.get(alarm.equip_id) || 0) + 1);
      }
    });

    return alarmCache;
  }

  addNodeElements(nodeElements, alarmCache) {
    // 노드 원
    nodeElements
      .append('circle')
      .attr('r', (d) =>
        d.isTarget ? MAP_CONFIG.NODE.RADIUS.SELECTED : MAP_CONFIG.NODE.RADIUS.DEFAULT
      )
      .attr('fill', (d) => ColorManager.getDashboardSectorColor(d.field) || '#999999')
      .attr('stroke', (d) =>
        d.isTarget
          ? ColorManager.getDarkColor?.(ColorManager.getEquipmentNodeColor?.(d.field), 0.6) ||
            '#004085'
          : '#fff'
      )
      .attr('stroke-width', (d) => (d.isTarget ? 4 : 2))
      .style('transition', 'all 0.2s ease');

    // 필드 라벨
    nodeElements
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.3em')
      .style('font-size', '11px')
      .style('font-weight', 'bold')
      .style('fill', 'white')
      .style('pointer-events', 'none')
      .text((d) => d.field.substring(0, 3));

    // 알람 배지
    nodeElements.each(function (d) {
      const equipId = d.equip_id || d.id || '';
      const alarmCount = alarmCache.get(equipId) || 0;

      if (alarmCount > 0) {
        const g = d3.select(this);

        g.append('circle')
          .attr('class', 'alarm-badge')
          .attr('cx', 20)
          .attr('cy', -20)
          .attr('r', 12)
          .style('fill', '#e74c3c')
          .style('fill-opacity', 0.8) // 0.0 (완전투명) ~ 1.0 (불투명)
          .style('stroke', 'white')
          .style('stroke-width', 2)
          .style('pointer-events', 'none');

        g.append('text')
          .attr('x', 20)
          .attr('y', -20)
          .attr('text-anchor', 'middle')
          .attr('dy', '0.3em')
          .style('font-size', '11px')
          .style('font-weight', 'bold')
          .style('fill', 'white')
          .style('pointer-events', 'none')
          .text(alarmCount > 99 ? '99+' : alarmCount);
      }
    });

    // 장비 이름
    nodeElements
      .append('text')
      .text((d) => d.name)
      .attr('font-size', '13px')
      .attr('text-anchor', 'middle')
      .attr('dy', '35px')
      .attr('fill', '#333')
      .style('pointer-events', 'none');
  }

  // 위치 설정 최적화
  setupOptimizedPositioning(nodes, links, width, height) {
    this.nodeElements.attr('transform', (d) => `translate(${d.x}, ${d.y})`);

    const nodeMap = new Map();
    nodes.forEach((node) => nodeMap.set(node.id, node));
    this.connectLinksToNodes(links, nodeMap);

    const updatePositions = this.createThrottledPositionUpdater();
    this.attachDragHandler();

    if (nodes.length <= 2) {
      updatePositions();
    } else if (nodes.length > 20) {
      console.log(`🎯 노드 ${nodes.length}개: 성능을 위해 시뮬레이션 비활성화`);
      updatePositions();
    } else {
      this.setupOptimizedSimulation(nodes, links, width, height, updatePositions);
    }
  }

  createThrottledPositionUpdater() {
    let isUpdating = false;

    return () => {
      if (isUpdating) return;
      isUpdating = true;

      requestAnimationFrame(() => {
        if (this.linkElements && !this.linkElements.empty()) {
          this.linkElements
            .attr('x1', (d) => d.source.x)
            .attr('y1', (d) => d.source.y)
            .attr('x2', (d) => d.target.x)
            .attr('y2', (d) => d.target.y);
        }

        if (this.linkLabels && !this.linkLabels.empty()) {
          this.linkLabels
            .attr('x', (d) => (d.source.x + d.target.x) / 2)
            .attr('y', (d) => (d.source.y + d.target.y) / 2);
        }

        if (this.nodeElements && !this.nodeElements.empty()) {
          this.nodeElements.attr('transform', (d) => `translate(${d.x}, ${d.y})`);
        }

        isUpdating = false;
      });
    };
  }

  setupOptimizedSimulation(nodes, links, width, height, updatePositions) {
    // 노드가 적은 경우 (1-2개)에는 다른 설정을 사용
    const isSmallNetwork = nodes.length <= 2;

    this.simulation = d3
      .forceSimulation(nodes)
      .force(
        'link',
        d3
          .forceLink(links)
          .id((d) => d.id)
          .distance(isSmallNetwork ? 200 : MAP_CONFIG.SIMULATION.LINK_DISTANCE)
          .strength(isSmallNetwork ? 0.1 : MAP_CONFIG.SIMULATION.LINK_STRENGTH) // ✅ 기존값 복원
      )
      .force(
        'charge',
        d3.forceManyBody().strength(isSmallNetwork ? -200 : MAP_CONFIG.SIMULATION.CHARGE_STRENGTH) // ✅ 기존값 복원
      )
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(MAP_CONFIG.SIMULATION.COLLISION_RADIUS))
      .alphaDecay(isSmallNetwork ? 0.1 : MAP_CONFIG.SIMULATION.ALPHA_DECAY) // ✅ 기존값 복원
      .alpha(isSmallNetwork ? 0.05 : MAP_CONFIG.SIMULATION.INITIAL_ALPHA); // ✅ 기존값 복원

    this.fixNodePositions(nodes);
    this.simulation.on('tick', updatePositions);

    setTimeout(() => {
      if (this.simulation) {
        this.simulation.stop();
        this.fixNodePositions(nodes);
      }
    }, 800);
  }

  connectLinksToNodes(links, nodeMap) {
    links.forEach((link) => {
      if (typeof link.source === 'string') {
        link.source = nodeMap.get(link.source) || { id: link.source, x: 0, y: 0 };
      }
      if (typeof link.target === 'string') {
        link.target = nodeMap.get(link.target) || { id: link.target, x: 0, y: 0 };
      }
    });
  }

  fixNodePositions(nodes) {
    nodes.forEach((node) => {
      if (node.fx !== undefined) {
        node.fx = node.x;
        node.fy = node.y;
      }
    });
  }

  attachDragHandler() {
    if (!this.nodeElements || this.nodeElements.empty()) {
      console.warn('nodeElements가 없어 드래그 핸들러를 설정할 수 없습니다.');
      return;
    }

    const dragHandler = d3
      .drag()
      .on('start', this.onDragStart.bind(this))
      .on('drag', this.onDrag.bind(this))
      .on('end', this.onDragEnd.bind(this));

    this.nodeElements.call(dragHandler);
  }

  onDragStart(event, d) {
    if (this.simulation) {
      this.simulation.stop();
    }
    d.fx = d.x;
    d.fy = d.y;
  }

  onDrag(event, d) {
    d.fx = event.x;
    d.fy = event.y;
    d.x = event.x;
    d.y = event.y;
    this.updateSingleNodePosition(d);
  }

  onDragEnd(event, d) {
    d.fx = event.x;
    d.fy = event.y;
    d.x = event.x;
    d.y = event.y;
    this.updateConnectedLinks(d);
  }

  updateSingleNodePosition(node) {
    this.g
      .selectAll('.node-group')
      .filter((d) => d.id === node.id)
      .attr('transform', `translate(${node.x}, ${node.y})`);

    this.throttledUpdateConnectedLinks(node);
  }

  updateConnectedLinks(node) {
    requestAnimationFrame(() => {
      this.g
        .selectAll('.connection-line')
        .filter((d) => d.source.id === node.id || d.target.id === node.id)
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y);

      this.g
        .selectAll('.connection-label')
        .filter((d) => d.source.id === node.id || d.target.id === node.id)
        .attr('x', (d) => (d.source.x + d.target.x) / 2)
        .attr('y', (d) => (d.source.y + d.target.y) / 2);
    });
  }

  throttledUpdateConnectedLinks(node) {
    if (!this._linkUpdateTimeout) {
      this._linkUpdateTimeout = setTimeout(() => {
        this.updateConnectedLinks(node);
        this._linkUpdateTimeout = null;
      }, 16);
    }
  }

  // 애니메이션 및 이벤트 설정
  applyMapAnimation() {
    this.cleanupEvents();
    this.attachOptimizedEvents();
    this.applyOptimizedScaleAnimation();
  }

  attachOptimizedEvents() {
    if (!this.nodeElements || this.nodeElements.empty()) return;

    let hoverTimer = null;

    this.nodeElements
      .on('mouseenter', (event, d) => {
        if (hoverTimer) {
          clearTimeout(hoverTimer);
          hoverTimer = null;
        }

        TooltipManager?.showEquipmentTooltip?.(event, {
          equip_id: d.id,
          equip_name: d.name,
          equip_type: d.type || '',
          equip_field: d.field,
          guksa_name: d.guksa,
        });

        d3.select(event.currentTarget)
          .select('circle')
          .style('filter', 'brightness(1.2) drop-shadow(0 2px 4px rgba(0,0,0,0.3))')
          .style('stroke-width', '3px');
      })
      .on('mouseleave', (event, d) => {
        hoverTimer = setTimeout(() => {
          TooltipManager?.hide?.();
        }, 100);

        d3.select(event.currentTarget)
          .select('circle')
          .style('filter', 'none')
          .style('stroke-width', d.isTarget ? '4px' : '2px');
      })
      .on('click', this.onNodeClick.bind(this));

    if (this.linkElements && !this.linkElements.empty()) {
      this.linkElements
        .on('mouseenter', (event, d) => {
          this.showLinkTooltip(event, d);
          d3.select(event.currentTarget).style('stroke-width', '5px').style('stroke-opacity', '1');
        })
        .on('mouseleave', (event, d) => {
          TooltipManager?.hide?.();
          d3.select(event.currentTarget)
            .style('stroke-width', '3px')
            .style('stroke-opacity', '0.8');
        });
    }

    if (this.linkLabels && !this.linkLabels.empty()) {
      this.linkLabels
        .on('mouseenter', (event, d) => {
          this.showLinkTooltip(event, d);
          const correspondingLink = this.linkElements.filter((linkData) => linkData.id === d.id);
          correspondingLink.style('stroke-width', '5px').style('stroke-opacity', '1');
        })
        .on('mouseleave', (event, d) => {
          TooltipManager?.hide?.();
          const correspondingLink = this.linkElements.filter((linkData) => linkData.id === d.id);
          correspondingLink.style('stroke-width', '3px').style('stroke-opacity', '0.8');
        });
    }
  }

  applyOptimizedScaleAnimation() {
    try {
      const nodeGroup = this.g.select('.nodes');
      const linkGroup = this.g.select('.links');

      if (nodeGroup.empty() || linkGroup.empty()) return;

      [nodeGroup, linkGroup].forEach((group) => {
        group
          .style('transform', `scale(${MAP_CONFIG.ANIMATION.INITIAL_SCALE})`)
          .style('opacity', '1');
      });

      setTimeout(() => {
        [nodeGroup, linkGroup].forEach((group) => {
          group
            .transition()
            .duration(MAP_CONFIG.ANIMATION.DURATION)
            .ease(d3.easeBackOut.overshoot(1.1))
            .style('transform', 'scale(1)');
        });
      }, 100);
    } catch (error) {
      console.error('스케일 애니메이션 오류:', error);
    }
  }

  cleanupEvents() {
    if (this.nodeElements) {
      this.nodeElements.on('mouseenter', null);
      this.nodeElements.on('mouseleave', null);
      this.nodeElements.on('click', null);
    }

    if (this.linkElements) {
      this.linkElements.on('mouseenter', null);
      this.linkElements.on('mouseleave', null);
    }

    if (this.linkLabels) {
      this.linkLabels.on('mouseenter', null);
      this.linkLabels.on('mouseleave', null);
    }
  }

  onNodeClick(event, d) {
    event.stopPropagation();

    this.nodeElements
      .selectAll('circle')
      .attr('stroke', (node) =>
        node.isTarget
          ? ColorManager.getDarkColor?.(ColorManager.getEquipmentNodeColor?.(node.field), 0.6) ||
            '#004085'
          : '#fff'
      )
      .attr('stroke-width', (node) => (node.isTarget ? 4 : 2));

    d3.select(event.currentTarget)
      .select('circle')
      .attr(
        'stroke',
        ColorManager.getDarkColor?.(ColorManager.getEquipmentNodeColor?.(d.field), 0.6) || '#004085'
      )
      .attr('stroke-width', 4);
  }

  showLinkTooltip(event, d) {
    TooltipManager?.showLinkTooltip?.(event, {
      link_name: d.link_name,
      link_field: d.link_field,
      link_type: d.link_type,
      section: `${d.sourceNode.name} - ${d.targetNode.name}`,
      cable_aroot: d.cable_aroot,
      cable_broot: d.cable_broot,
      sourceNode: d.sourceNode,
      targetNode: d.targetNode,
      alarms: [...(d.sourceNode.alarms || []), ...(d.targetNode.alarms || [])],
    });
  }

  // 노드 및 링크 생성 메서드들 (맵 노드 생성 - 타겟 노드 생성 및 계층 구조 기반 배치)
  createMapNodes(equipmentList, targetEquip, centerX, centerY) {
    const nodes = [];
    nodes.push(this.createEquipNode(targetEquip, centerX, centerY, 'center', 0, true));

    const hierarchy = this.buildHierarchy(equipmentList, targetEquip.equip_id);
    this.arrangeNodesByHierarchy(hierarchy, centerX, centerY, nodes);
    this.adjustMapCenter(nodes, centerX, centerY);

    console.log(`🎯 최종 배치: 총 ${nodes.length}개 노드`);
    return nodes;
  }

  //장비 이름이 길 경우 문자열 축소 처리
  truncateEquipmentName(name) {
    return name?.length > MAP_CONFIG.NODE.LABEL_MAX_LENGTH
      ? name.substring(0, MAP_CONFIG.NODE.LABEL_MAX_LENGTH) + '...'
      : name;
  }

  //BFS 알고리즘을 사용한 장비 계층 구조 생성
  buildHierarchy(equipmentList, centralEquipId) {
    const hierarchy = {};
    const visited = new Set();
    const connections = this.extractConnections();

    const queue = [{ equipId: centralEquipId, level: 0, upDown: 'center' }];
    visited.add(centralEquipId);

    while (queue.length > 0) {
      const { equipId, level, upDown } = queue.shift();

      this.addEquipmentToHierarchy(hierarchy, level, upDown, equipId, equipmentList);
      this.processConnectedEquipments(queue, visited, connections, equipId, level);
    }

    return hierarchy;
  }

  //연결 관계 추출 - 연결 관계 데이터 추출
  extractConnections() {
    const connections = [];

    if (Array.isArray(this.linkRelations)) {
      this.linkRelations.forEach((linkKey) => {
        const parts = linkKey.split(':::');
        if (parts.length >= 4) {
          const [source, target, linkName, upDown] = parts;
          connections.push({ source, target, linkName, upDown });
        }
      });
    }

    return connections;
  }

  //장비 계층 구조 업데이트 - 장비 정보 추가
  addEquipmentToHierarchy(hierarchy, level, upDown, equipId, equipmentList) {
    if (!hierarchy[level]) {
      hierarchy[level] = { up: [], down: [], center: [] };
    }

    const equipInfo = equipmentList.find((e) => e.equip_id === equipId);
    if (!equipInfo) return;

    if (level === 0) {
      hierarchy[level].center.push(equipInfo);
    } else if (upDown === 'up') {
      hierarchy[level].up.push(equipInfo);
    } else {
      hierarchy[level].down.push(equipInfo);
    }
  }

  //연결된 장비 처리 - 연결 관계 데이터 필터링 및 처리
  processConnectedEquipments(queue, visited, connections, equipId, level) {
    const connectedEquips = connections.filter(
      (conn) =>
        (conn.source === equipId || conn.target === equipId) &&
        !visited.has(conn.source === equipId ? conn.target : conn.source)
    );

    connectedEquips.forEach((conn) => {
      const nextEquipId = conn.source === equipId ? conn.target : conn.source;
      const nextUpDown = conn.source === equipId ? conn.upDown : this.reverseUpDown(conn.upDown);

      if (!visited.has(nextEquipId)) {
        visited.add(nextEquipId);
        queue.push({
          equipId: nextEquipId,
          level: level + 1,
          upDown: nextUpDown,
        });
      }
    });
  }

  // 연결 방향 반대로 변환 (상위/하위 중복 링크 방지)
  reverseUpDown(upDown) {
    switch (upDown) {
      case 'up':
        return 'down';
      case 'down':
        return 'up';
      default:
        return upDown;
    }
  }

  //계층 구조를 기반으로 노드 배치
  arrangeNodesByHierarchy(hierarchy, centerX, centerY, nodes) {
    Object.keys(hierarchy).forEach((levelStr) => {
      const level = parseInt(levelStr);
      const levelData = hierarchy[level];

      console.log(`📊 레벨 ${level}:`, {
        center: levelData.center?.length || 0,
        up: levelData.up?.length || 0,
        down: levelData.down?.length || 0,
      });

      if (level === 0) return;

      if (levelData.up?.length > 0) {
        const x = centerX + level * MAP_CONFIG.LAYOUT.LEVEL_GAP;
        this.arrangeEquipmentsAtPosition(levelData.up, x, centerY, 'up', level, nodes);
      }

      if (levelData.down?.length > 0) {
        const x = centerX - level * MAP_CONFIG.LAYOUT.LEVEL_GAP;
        this.arrangeEquipmentsAtPosition(levelData.down, x, centerY, 'down', level, nodes);
      }
    });
  }

  //특정 위치에 장비들 배치
  arrangeEquipmentsAtPosition(equipList, centerX, centerY, upDownType, level, nodes) {
    const equipCount = equipList.length;

    if (equipCount === 1) {
      this.createEquipNode(equipList[0], centerX, centerY, upDownType, level, false, nodes);
    } else if (equipCount > 1) {
      this.arrangeMultipleEquipments(equipList, centerX, centerY, upDownType, level, nodes);
    }
  }

  //여러 장비들 배치 - 필드 기반 그룹별 배치
  arrangeMultipleEquipments(equipList, centerX, centerY, upDownType, level, nodes) {
    const fieldGroups = this.groupByField(equipList);
    const fieldNames = Object.keys(fieldGroups).sort();
    const totalFields = fieldNames.length;

    if (totalFields === 1) {
      this.arrangeEquipmentsHorizontally(
        fieldGroups[fieldNames[0]],
        centerX,
        centerY,
        upDownType,
        level,
        nodes
      );
    } else {
      this.arrangeEquipmentsInFanPattern(
        fieldGroups,
        fieldNames,
        centerX,
        centerY,
        upDownType,
        level,
        nodes
      );
    }
  }

  // 장비들을 수평으로 배치
  arrangeEquipmentsHorizontally(equipments, centerX, centerY, upDownType, level, nodes) {
    equipments.forEach((equip, index) => {
      this.createEquipNode(equip, centerX, centerY, upDownType, level, false, nodes);
    });
  }

  // 장비들을 부채꼴 패턴으로 배치
  arrangeEquipmentsInFanPattern(
    fieldGroups,
    fieldNames,
    centerX,
    centerY,
    upDownType,
    level,
    nodes
  ) {
    const totalFields = fieldNames.length;
    const maxAngle = Math.min(MAP_CONFIG.LAYOUT.MAX_ANGLE, totalFields * 15);
    const angles = this.calculateSymmetricAngles(totalFields, maxAngle);

    fieldNames.forEach((fieldName, fieldIndex) => {
      const equipInField = fieldGroups[fieldName];
      const fieldAngle = angles[fieldIndex] || 0;

      equipInField.forEach((equip, equipIndex) => {
        const distance =
          MAP_CONFIG.LAYOUT.MIN_DISTANCE + equipIndex * MAP_CONFIG.LAYOUT.EQUIPMENT_SPACING;
        const angleRad = fieldAngle * (Math.PI / 180);

        const x = centerX + distance * Math.cos(angleRad);
        const y = centerY + distance * Math.sin(angleRad);

        this.createEquipNode(equip, x, y, upDownType, level, false, nodes);
      });
    });
  }

  // 대칭 각도 계산 (홀수/짝수 개수에 따라)
  calculateSymmetricAngles(totalFields, maxAngle) {
    const angles = [];

    if (totalFields % 2 === 1) {
      const halfFields = Math.floor(totalFields / 2);
      angles.push(0);
      for (let i = 1; i <= halfFields; i++) {
        const angle = (maxAngle / halfFields) * i;
        angles.unshift(-angle);
        angles.push(angle);
      }
    } else {
      const halfFields = totalFields / 2;
      for (let i = 1; i <= halfFields; i++) {
        const angle = (maxAngle / halfFields) * (i - 0.5);
        angles.unshift(-angle);
        angles.push(angle);
      }
    }

    return angles.sort((a, b) => a - b);
  }

  // 장비를 분야(Sector)별로 그룹화
  groupByField(equipList) {
    const fieldGroups = {};
    equipList.forEach((equip) => {
      const field = equip.equip_field || '기타';
      if (!fieldGroups[field]) {
        fieldGroups[field] = [];
      }
      fieldGroups[field].push(equip);
    });
    return fieldGroups;
  }

  // 개별 장비 노드 객체 생성
  createEquipNode(equip, x, y, upDownType, level, isTarget = false, nodes = null) {
    const node = {
      id: equip.equip_id,
      name: this.truncateEquipmentName(equip.equip_name || equip.equip_id),
      field: equip.equip_field || '기타',
      guksa: equip.guksa_name || '알수없음',
      isTarget,
      hasAlarm: (equip.validAlarmCount || 0) > 0,
      alarmCount: equip.alarmCount || equip.alarms?.length || 0,
      validAlarmCount: equip.validAlarmCount || 0,
      alarms: equip.alarms || [],
      up_down: upDownType,
      level,
      x,
      y,
    };

    if (isTarget) {
      node.fx = x;
      node.fy = y;
    }

    if (nodes && Array.isArray(nodes)) {
      nodes.push(node);
    }

    return node;
  }

  // 맵 중심 위치 조정
  adjustMapCenter(nodes, originalCenterX, originalCenterY) {
    if (nodes.length <= 1) return;

    const bounds = this.calculateNodeBounds(nodes);
    const offsets = this.calculateCenterOffsets(bounds, originalCenterX, originalCenterY);
    this.applyOffsets(nodes, offsets);

    console.log(
      `🎯 맵 중심 조정: 이동 거리 x=${Math.round(offsets.x)}, y=${Math.round(offsets.y)}`
    );
  }

  // 노드들의 경계 영역 계산
  calculateNodeBounds(nodes) {
    const xPositions = nodes.map((n) => n.x);
    const yPositions = nodes.map((n) => n.y);

    return {
      minX: Math.min(...xPositions),
      maxX: Math.max(...xPositions),
      minY: Math.min(...yPositions),
      maxY: Math.max(...yPositions),
    };
  }

  // 중심 이동을 위한 오프셋 계산
  calculateCenterOffsets(bounds, originalCenterX, originalCenterY) {
    const actualCenterX = (bounds.minX + bounds.maxX) / 2;
    const actualCenterY = (bounds.minY + bounds.maxY) / 2;

    return {
      x: originalCenterX - actualCenterX,
      y: originalCenterY - actualCenterY,
    };
  }

  // 모든 노드에 오프셋 적용
  applyOffsets(nodes, offsets) {
    nodes.forEach((node) => {
      node.x += offsets.x;
      node.y += offsets.y;

      if (node.fx !== undefined) node.fx += offsets.x;
      if (node.fy !== undefined) node.fy += offsets.y;
    });
  }

  // 맵 링크 생성 - 연결 관계 데이터 기반 링크 생성
  createMapLinks(nodes, targetEquip) {
    const links = [];
    const targetNode = nodes.find((n) => n.isTarget);

    if (!targetNode || nodes.length <= 1) return links;

    if (this.linkRelations?.length > 0) {
      this.createAPIBasedLinks(links, nodes);
    }

    return links;
  }

  // API 기반 링크 생성 - 연결 관계 데이터 기반 링크 생성
  createAPIBasedLinks(links, nodes) {
    console.log(`🔗 API 기반 링크 생성 시작: ${this.linkRelations.length}개 링크 관계`);

    this.linkRelations.forEach((linkKey) => {
      const parts = linkKey.split(':::');
      if (parts.length >= 4) {
        const [sourceId, targetId, linkName, upDown] = parts;
        this.createLinkIfNodesExist(links, nodes, sourceId, targetId, linkName, upDown);
      }
    });

    console.log(`🎯 API 기반 링크 생성 완료: ${links.length}개 링크`);
  }

  // 노드가 존재하는 경우 링크 생성
  createLinkIfNodesExist(links, nodes, sourceId, targetId, linkName, upDown) {
    const sourceNode = nodes.find((n) => n.id === sourceId);
    const targetNode = nodes.find((n) => n.id === targetId);

    if (!sourceNode || !targetNode) {
      console.warn(`⚠️ 노드를 찾을 수 없음: ${sourceId} 또는 ${targetId}`);
      return;
    }

    const existingLink = links.find(
      (link) =>
        (link.source === sourceId && link.target === targetId) ||
        (link.source === targetId && link.target === sourceId)
    );

    if (existingLink) return;

    const linkInfo = this.generateLinkInfo(sourceNode, targetNode, linkName, upDown);
    links.push({
      id: `${sourceId}-${targetId}`,
      source: sourceId,
      target: targetId,
      ...linkInfo,
      sourceNode: sourceNode,
      targetNode: targetNode,
    });

    console.log(`✅ 링크 생성: ${sourceNode.name} → ${targetNode.name} (${upDown})`);
  }

  // 링크 정보 생성 - 링크 이름, 필드, 타입, 케이블 루트 정보 생성
  generateLinkInfo(sourceNode, targetNode, linkName = null, upDown = 'unknown') {
    const isMWLink = sourceNode.field === 'MW' && targetNode.field === 'MW';

    return {
      link_name: linkName || `${sourceNode.name} ↔ ${targetNode.name}`,
      link_field: isMWLink ? 'MW' : '선로',
      link_type: isMWLink ? 'MW' : '광케이블',
      cable_aroot: `${sourceNode.guksa} - ${targetNode.guksa} A루트`,
      cable_broot: `${sourceNode.guksa} - ${targetNode.guksa} B루트`,
      up_down: upDown,
    };
  }

  // 줌 컨트롤 및 UI 메서드들
  addZoomControls(width, height) {
    try {
      const existingControls = this.container.querySelector('.zoom-controls-container');
      if (existingControls) {
        console.log('✅ 기존 줌 컨트롤 유지');
        return;
      }

      this.addZoomControlsStyle();
      const controlsContainer = this.createZoomControlsContainer();
      this.container.appendChild(controlsContainer);

      console.log('✅ HTML 줌 컨트롤 버튼 추가 완료');
    } catch (error) {
      console.error('줌 컨트롤 추가 중 오류:', error);
    }
  }

  // 줌 컨트롤 스타일 추가
  addZoomControlsStyle() {
    if (document.querySelector('#zoom-controls-style')) return;

    const style = document.createElement('style');
    style.id = 'zoom-controls-style';
    style.textContent = `
      .zoom-controls-container {
        position: absolute;
        top: 10px;
        right: 10px;
        display: flex;
        flex-direction: row;
        gap: 5px;
        z-index: 1000;
      }
      .map-zoom-btn {
        background: #ffffff;
        border: 1px solid #ddd;
        border-radius: 4px;
        width: 32px;
        height: 32px;
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.2s;
      }
      .map-zoom-btn:hover {
        background: #f0f0f0;
        border-color: #999;
      }
      .map-zoom-btn.restore {
        font-size: 10px;
        width: 60px;
      }
    `;
    document.head.appendChild(style);
  }

  // 줌 컨트롤 컨테이너 생성
  createZoomControlsContainer() {
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'zoom-controls-container';
    controlsContainer.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      display: flex;
      flex-direction: row;
      gap: 5px;
      z-index: 100;
    `;

    const buttons = [
      { text: '+', handler: this.performZoomIn.bind(this) },
      { text: '-', handler: this.performZoomOut.bind(this) },
      { text: 'Restore', class: 'restore', handler: this.performRestore.bind(this) },
    ];

    buttons.forEach(({ text, handler, class: className }) => {
      const button = document.createElement('button');
      button.className = `map-zoom-btn ${className || ''}`;
      button.textContent = text;
      button.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        handler();
      };
      controlsContainer.appendChild(button);
    });

    this.container.style.position = 'relative';
    return controlsContainer;
  }

  // 확대 컨트롤 실행
  performZoomIn() {
    this.performZoom(MAP_CONFIG.ZOOM.SCALE_FACTOR, '확대');
  }

  // 축소 컨트롤 실행
  performZoomOut() {
    this.performZoom(1 / MAP_CONFIG.ZOOM.SCALE_FACTOR, '축소');
  }

  // 확대/축소 컨트롤 실행
  performZoom(scaleFactor, action) {
    try {
      console.log(`🔍 ${action} 버튼 클릭`);

      if (!this.svg || !this.zoom) {
        console.warn('SVG 또는 zoom 객체를 찾을 수 없습니다.');
        return;
      }

      const currentTransform = this.currentTransform;
      const newScale = Math.max(
        MAP_CONFIG.ZOOM.MIN,
        Math.min(currentTransform.k * scaleFactor, MAP_CONFIG.ZOOM.MAX)
      );

      const { centerX, centerY } = this.getViewportCenter();
      const { worldCenterX, worldCenterY } = this.getWorldCenter(
        centerX,
        centerY,
        currentTransform
      );
      const { newX, newY } = this.calculateNewPosition(
        centerX,
        centerY,
        worldCenterX,
        worldCenterY,
        newScale
      );

      const newTransform = d3.zoomIdentity.translate(newX, newY).scale(newScale);

      this.svg
        .transition()
        .duration(MAP_CONFIG.ZOOM.TRANSITION_DURATION)
        .call(this.zoom.transform, newTransform);

      console.log(`${action} 완료: ${currentTransform.k.toFixed(2)} → ${newScale.toFixed(2)}`);
    } catch (error) {
      console.error(`${action} 실행 중 오류:`, error);
    }
  }

  // 확대/축소 컨트롤 실행
  getViewportCenter() {
    const rect = this.container.getBoundingClientRect();
    return {
      centerX: rect.width / 2,
      centerY: rect.height / 2,
    };
  }

  // 확대/축소 컨트롤 실행
  getWorldCenter(centerX, centerY, transform) {
    return {
      worldCenterX: (centerX - transform.x) / transform.k,
      worldCenterY: (centerY - transform.y) / transform.k,
    };
  }

  // 확대/축소 컨트롤 실행
  calculateNewPosition(centerX, centerY, worldCenterX, worldCenterY, newScale) {
    return {
      newX: centerX - worldCenterX * newScale,
      newY: centerY - worldCenterY * newScale,
    };
  }

  // 확대/축소 컨트롤 실행
  performRestore() {
    try {
      console.log('🔄 복원 버튼 클릭');

      if (!this.svg || !this.zoom) {
        console.warn('SVG 또는 zoom 객체를 찾을 수 없습니다.');
        return;
      }

      this.svg.transition().duration(500).call(this.zoom.transform, d3.zoomIdentity);
      this.currentTransform = d3.zoomIdentity;
      console.log('복원 완료');
    } catch (error) {
      console.error('복원 실행 중 오류:', error);
    }
  }

  // 맵 제목 추가
  addMapTitle(nodes) {
    const targetNode = nodes.find((n) => n.isTarget);
    if (!targetNode) return;

    this.svg
      .append('text')
      .attr('class', 'map-title-text')
      .attr('x', 15)
      .attr('y', 25)
      .style('font-size', '14px')
      .style('font-weight', 'normal')
      .style('fill', 'rgb(29, 133, 226)')
      .style('pointer-events', 'none')
      .text(`• 대상 장비: ${targetNode.name} (국사: ${targetNode.guksa})`);
  }

  // 성공 메시지 표시
  showSuccessMessage(targetEquip, equipmentList) {
    if (MessageManager?.addSuccessMessage) {
      this.removeExistingFaultButtons();

      MessageManager.addSuccessMessage(
        `✅ NW 토폴로지 MAP 생성을 완료했습니다. <br><br> • 기준 장비: ${targetEquip.equip_name} <br> • 연결된 장비: 총 ${equipmentList.length} 대` +
          '<div id="fault-point-chat-btn-container"><br>→ 이제 <strong><a id="fault-point-chat-btn" href="#">장애점 찾기</a></strong>를 클릭해서 분석을 시작해보세요.</div>',
        { type: 'success' }
      );

      console.log('✅ 장애점 찾기 버튼 메시지 생성 완료');
    }
  }

  // 기존 장애점 찾기 버튼 제거
  removeExistingFaultButtons() {
    const existingButtons = document.querySelectorAll('#fault-point-chat-btn-container');
    existingButtons.forEach((btn) => {
      btn.remove();
      console.log('🗑️ 기존 장애점 찾기 버튼 제거됨');
    });
  }

  // 에러 처리 메서드들
  handleError(message, error) {
    console.error(`❌ ${message}:`, error);
    MessageManager?.addErrorMessage?.(`${message}: ${error.message}`);
  }

  // 렌더링 에러 처리
  handleRenderError(equipId, error) {
    console.error(`장비 토폴로지 렌더링 실패:`, error);
    this.showErrorMap(equipId, `장비 토폴로지 생성 실패: ${error.message}`);
  }

  // 맵 그리기 에러 처리
  handleDrawError(targetEquip, error) {
    console.error('❌ 맵 그리기 실패:', error);
    const equipId = targetEquip?.equip_id || 'Unknown';
    this.showErrorMap(equipId, error.message);
  }

  // D3 요소 렌더링 에러 처리
  handleRenderElementsError(nodes, error) {
    console.error('❌ D3 요소 렌더링 실패:', error);
    const targetEquipId = nodes?.find((n) => n.isTarget)?.id || 'Unknown';
    this.showErrorMap(targetEquipId, error.message);
  }

  // 장비 맵 에러 표시
  showErrorMap(equipId, errorMessage) {
    try {
      if (MessageManager?.addErrorMessage) {
        MessageManager.addErrorMessage(`장비 ${equipId} 토폴로지 생성 실패: ${errorMessage}`, {
          persistent: false,
        });
      }

      CommonUtils.map?.showMapErrorMessage?.(equipId, errorMessage, this.container);
      console.error(`❌ 장비 맵 에러: ${equipId} - ${errorMessage}`);
    } catch (error) {
      console.error('❌ 에러 맵 표시 중 오류:', error);
    }
  }

  // 맵 정리
  clearMap() {
    if (this.container) {
      this.container.innerHTML = '';
    }
    if (this.svg) {
      this.svg.remove();
    }
    this.nodes = [];
    this.links = [];
  }

  // 메모리 정리
  destroy() {
    console.log('🗑️ EquipmentMapComponent 정리 시작...');

    if (this._linkUpdateTimeout) {
      clearTimeout(this._linkUpdateTimeout);
      this._linkUpdateTimeout = null;
    }

    if (this.simulation) {
      this.simulation.stop();
      this.simulation.on('tick', null);
      this.simulation = null;
    }

    this.cleanupEvents();

    if (this.svg) {
      this.svg.on('.zoom', null);
      this.svg.selectAll('*').remove();
      this.svg.remove();
      this.svg = null;
    }

    if (this.container) {
      this.container.innerHTML = '';
    }

    this.nodes = [];
    this.links = [];
    this.selectedNodes.clear();
    this.connectionMap.clear();
    this.linkRelations = [];
    this.nodeElements = null;
    this.linkElements = null;
    this.linkLabels = null;
    this.g = null;
    this.zoom = null;

    console.log('✅ EquipmentMapComponent 정리 완료');
  }

  getState() {
    return {
      isInitialized: this.isInitialized,
      nodeCount: this.nodes.length,
      linkCount: this.links.length,
    };
  }
}

export default EquipmentMapComponent;
