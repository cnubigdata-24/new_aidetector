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
  async renderEquipmentTopology(equipId, equipmentData) {
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
    CommonUtils.map?.showMapLoadingMessage?.('NW 토폴로지 MAP을 생성 중입니다.', this.container);
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

    apiLinks.forEach((linkData) => {
      if (typeof linkData === 'object' && linkData.source && linkData.target) {
        const { source, target, link_name, up_down, cable_aroot, cable_broot, link_type } =
          linkData;
        console.log(`🔍 API 링크 데이터:`, {
          source,
          target,
          link_name,
          link_type: `'${link_type}'`,
          up_down,
        });
        this.addConnectionToMap(
          source,
          target,
          link_name,
          up_down,
          cable_aroot,
          cable_broot,
          link_type
        );
      } else {
        console.error('❌ 잘못된 링크 데이터 형식:', linkData);
        console.error(
          '   예상 형식: {source, target, link_name, up_down, cable_aroot, cable_broot, link_type}'
        );
      }
    });
  }

  //개별 연결 정보를 연결 관계 맵에 추가
  addConnectionToMap(
    sourceId,
    targetId,
    linkName,
    upDown,
    cable_aroot = '',
    cable_broot = '',
    link_type = ''
  ) {
    const sourceKey = `${sourceId}_${targetId}`;
    const targetKey = `${targetId}_${sourceId}`;

    this.connectionMap.set(sourceKey, {
      connected: true,
      upDown: upDown,
      linkName: linkName,
      cable_aroot: cable_aroot,
      cable_broot: cable_broot,
      link_type: link_type,
      direction: 'source_to_target',
    });

    this.connectionMap.set(targetKey, {
      connected: true,
      upDown: upDown === 'up' ? 'down' : 'up',
      linkName: linkName,
      cable_aroot: cable_aroot,
      cable_broot: cable_broot,
      link_type: link_type,
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

      // 장애점 분석을 위한 기본 정보 미리 준비 및 캐싱
      this.prepareFailureAnalysisData(targetEquip, equipmentList);

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

    // 스프레드 레이아웃 최종 조정 추가
    this.adjustSpreadLayoutCenter(nodes, centerX, centerY);

    this.nodes = nodes;
    this.links = links;

    console.log(`🗺️ 맵 데이터 준비 완료: 노드 ${nodes.length}개, 링크 ${links.length}개`);
    return { nodes, links };
  }

  // 핵심 렌더링 메서드 (하나로 통합)
  renderMapElements(nodes, links, width, height) {
    try {
      // StateManager.enrichMapDataWithAlarms 대신 직접 데이터 사용
      this.nodes = nodes;
      this.links = links;

      this.addZoomControls(width, height);
      this.addMapTitle(nodes);

      // 링크를 먼저 렌더링 (노드 뒤에 위치하도록)
      this.renderLinks(links);

      // 노드를 나중에 렌더링 (링크 위에 위치하도록)
      this.renderNodes(nodes);

      this.setupOptimizedPositioning(nodes, links, width, height);

      // 초기 링크 경로 설정
      this.updateAllLinkPaths();

      this.applyMapAnimation();

      console.log('✅ 맵 렌더링 완료');

      setTimeout(() => {
        CommonUtils.map?.clearMapMessages?.(this.container);
      }, MAP_CONFIG.ANIMATION.LOADING_CLEAR_DELAY);
    } catch (error) {
      this.handleRenderElementsError(nodes, error);
    }
  }

  // 모든 링크 경로 업데이트
  updateAllLinkPaths() {
    if (this.linkElements && !this.linkElements.empty()) {
      this.linkElements.attr('d', (d) => this.generateCurvePath(d));
    }
  }

  // 곡선 경로 생성 함수
  generateCurvePath(linkData) {
    // 안전성 체크
    if (!linkData || !linkData.source || !linkData.target) {
      console.warn('⚠️ 링크 데이터가 불완전합니다:', linkData);
      return 'M 0 0 L 0 0';
    }

    const sourceX = linkData.source.x || 0;
    const sourceY = linkData.source.y || 0;
    const targetX = linkData.target.x || 0;
    const targetY = linkData.target.y || 0;

    const offset = linkData.curveOffset || 0;

    if (Math.abs(offset) < 1) {
      // 직선 경로 (오프셋이 거의 없는 경우)
      return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
    } else {
      // 곡선 경로 계산
      const midX = (sourceX + targetX) / 2;
      const midY = (sourceY + targetY) / 2;

      // 링크에 수직인 방향으로 오프셋 적용
      const dx = targetX - sourceX;
      const dy = targetY - sourceY;
      const length = Math.sqrt(dx * dx + dy * dy);

      if (length > 0) {
        const perpX = -dy / length;
        const perpY = dx / length;

        const controlX = midX + perpX * offset;
        const controlY = midY + perpY * offset;

        // 이차 베지어 곡선 생성
        const path = `M ${sourceX} ${sourceY} Q ${controlX} ${controlY} ${targetX} ${targetY}`;

        // 디버깅: 곡선 링크만 로그 출력
        if (Math.abs(offset) > 20) {
          console.log(`🔗 곡선 링크 "${linkData.link_name}": 오프셋=${offset}, 경로=${path}`);
        }

        return path;
      } else {
        // 길이가 0인 경우 직선으로 처리
        console.warn('⚠️ 링크 길이가 0입니다:', linkData.link_name);
        return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
      }
    }
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

    // 경보 배지
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
          .style('fill-opacity', 0.8) // 0.0 (완전 투명) ~ 1.0 (불투명)
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

    // 링크 연결 후 경보 배지 위치 재설정
    if (this.linkAlarmBadges && !this.linkAlarmBadges.empty()) {
      this.updateLinkAlarmBadgePositions();
    }

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
          // 곡선 경로 지원
          this.linkElements.attr('d', (d) => this.generateCurvePath(d));
        }

        if (this.linkLabels && !this.linkLabels.empty()) {
          // 곡선 오프셋을 고려한 라벨 위치
          this.linkLabels
            .attr('x', (d) => {
              const midX = (d.source.x + d.target.x) / 2;
              const offset = d.curveOffset || 0;
              if (Math.abs(offset) > 1) {
                const dx = d.target.x - d.source.x;
                const dy = d.target.y - d.source.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                if (length > 0) {
                  const perpX = -dy / length;
                  return midX + perpX * offset * 0.3;
                }
              }
              return midX;
            })
            .attr('y', (d) => {
              const midY = (d.source.y + d.target.y) / 2;
              const offset = d.curveOffset || 0;
              if (Math.abs(offset) > 1) {
                const dx = d.target.x - d.source.x;
                const dy = d.target.y - d.source.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                if (length > 0) {
                  const perpY = dx / length;
                  return midY + perpY * offset * 0.3 - 5;
                }
              }
              return midY - 5;
            });
        }

        if (this.nodeElements && !this.nodeElements.empty()) {
          this.nodeElements.attr('transform', (d) => `translate(${d.x}, ${d.y})`);
        }

        // 링크 경보 배지 위치 업데이트 (링크 라벨과 함께 이동)
        if (this.linkAlarmBadges && !this.linkAlarmBadges.empty()) {
          this.updateLinkAlarmBadgePositions();
        }

        // 동적 링크 경보 배지 위치 업데이트 (장애점 추론 후 추가된 배지들)
        this.updateDynamicLinkBadgePositions();

        isUpdating = false;
      });
    };
  }

  setupOptimizedSimulation(nodes, links, width, height, updatePositions) {
    const nodeCount = nodes.length;

    // 스프레드 레이아웃에 최적화된 force 파라미터
    const forceConfig = this.getSpreadLayoutForceConfig(nodeCount, width, height);

    this.simulation = d3
      .forceSimulation(nodes)
      .force(
        'link',
        d3
          .forceLink(links)
          .id((d) => d.id)
          .distance(forceConfig.linkDistance)
          .strength(forceConfig.linkStrength)
      )
      .force('charge', d3.forceManyBody().strength(forceConfig.chargeStrength))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(forceConfig.collisionRadius))
      .force('boundary', this.createBoundaryForce(width, height)) // 경계 제한 추가
      .alphaDecay(forceConfig.alphaDecay)
      .alpha(forceConfig.initialAlpha);

    // 타겟 노드 고정 (소수 노드일 때는 더 강하게 고정)
    const targetNode = nodes.find((n) => n.isTarget);
    if (targetNode) {
      targetNode.fx = width / 2;
      targetNode.fy = height / 2;

      // 소수 노드일 때는 다른 노드들도 초기 위치에 가깝게 유지
      if (nodes.length <= 4) {
        nodes.forEach((node) => {
          if (!node.isTarget) {
            // 초기 위치를 약하게 고정 (시뮬레이션 후 해제)
            node.fx = node.x;
            node.fy = node.y;
          }
        });

        // 500ms 후 고정 해제 (자연스러운 미세 조정 허용)
        setTimeout(() => {
          nodes.forEach((node) => {
            if (!node.isTarget) {
              node.fx = null;
              node.fy = null;
            }
          });
        }, 500);
      }
    }

    this.simulation.on('tick', updatePositions);

    // 더 오래 시뮬레이션 실행 (자연스러운 분산을 위해)
    setTimeout(() => {
      if (this.simulation) {
        this.simulation.stop();
        this.fixNodePositions(nodes);
      }
    }, forceConfig.simulationDuration);
  }

  // 스프레드 레이아웃에 최적화된 force 설정
  getSpreadLayoutForceConfig(nodeCount, width, height) {
    const area = width * height;
    const density = (nodeCount / area) * 1000000;

    // 소수 노드일 때 특별 설정
    if (nodeCount <= 4) {
      let linkDistance, chargeStrength;

      if (nodeCount === 2) {
        // 2개 노드: 더 큰 거리와 더 약한 힘
        const minDistance = Math.min(width, height) * 0.45;
        linkDistance = Math.max(400, minDistance); // 증가된 거리 반영
        chargeStrength = -150; // 더 약한 반발력 (노드들이 초기 위치 유지하도록)
      } else {
        // 3-4개 노드: 기존 설정
        const baseDistance = Math.min(width, height) * 0.25;
        linkDistance = Math.max(200, baseDistance);
        chargeStrength = -300;
      }

      return {
        linkDistance: linkDistance,
        linkStrength: 0.05, // 더 약한 링크 강도 (특히 2개 노드에서 효과적)
        chargeStrength: chargeStrength,
        collisionRadius: 80,
        alphaDecay: 0.15, // 더 빠른 안정화
        initialAlpha: 0.15, // 더 낮은 초기 에너지
        simulationDuration: 600, // 더 짧은 시뮬레이션 시간
      };
    }

    // 기존 로직 (5개 이상일 때)
    return {
      linkDistance: Math.max(50, Math.min(150, Math.sqrt(area / nodeCount) * 2)),
      linkStrength: nodeCount < 10 ? 0.3 : 0.1,
      chargeStrength: Math.max(-1000, -50 * nodeCount),
      collisionRadius: Math.max(25, 60 - nodeCount),
      alphaDecay: density > 0.1 ? 0.05 : 0.02,
      initialAlpha: 0.3,
      simulationDuration: Math.max(1000, Math.min(3000, nodeCount * 100)),
    };
  }

  // 화면 경계 제한 force
  createBoundaryForce(width, height) {
    const padding = 50;

    return (alpha) => {
      this.nodes.forEach((node) => {
        if (node.isTarget) return; // 타겟 노드는 제외

        // 화면 경계를 벗어나지 않도록 제한
        if (node.x < padding) node.vx += (padding - node.x) * alpha * 0.1;
        if (node.x > width - padding) node.vx += (width - padding - node.x) * alpha * 0.1;
        if (node.y < padding) node.vy += (padding - node.y) * alpha * 0.1;
        if (node.y > height - padding) node.vy += (height - padding - node.y) * alpha * 0.1;
      });
    };
  }

  // 노드들이 화면 중앙에 잘 배치되도록 최종 조정
  adjustSpreadLayoutCenter(nodes, centerX, centerY) {
    if (nodes.length <= 1) return;

    // 타겟 노드 제외한 노드들의 중심점 계산
    const otherNodes = nodes.filter((n) => !n.isTarget);
    if (otherNodes.length === 0) return;

    const totalNodes = nodes.length;

    // 4개 노드일 때는 특별 처리 (지그재그 배치 고려)
    if (totalNodes === 4) {
      // 모든 노드(타겟 포함)의 Y축 경계 확인
      const allYPositions = nodes.map((n) => n.y);
      const minY = Math.min(...allYPositions);
      const maxY = Math.max(...allYPositions);
      const currentCenterY = (minY + maxY) / 2;

      // Y축이 화면 위쪽으로 치우쳐져 있으면 아래로 이동
      let yOffset = centerY - currentCenterY;

      // 추가로 아래쪽으로 조금 더 이동 (사용자 요청)
      const additionalDownwardOffset = 30; // 30px 아래로 추가 이동
      yOffset += additionalDownwardOffset;

      if (Math.abs(yOffset) > 30) {
        // 임계값을 50에서 30으로 낮춤 (더 민감하게 조정)
        nodes.forEach((node) => {
          node.y += yOffset * 0.7; // 60%에서 70%로 증가 (더 강한 조정)
          if (node.fy !== undefined) {
            node.fy = node.y;
          }
        });

        console.log(
          `📍 4개 노드 수직 중앙 조정: Y오프셋=${yOffset.toFixed(1)}px 적용 (추가 하향 이동 포함)`
        );
      }

      return;
    }

    // 기존 로직 (2-3개 노드)
    const avgX = otherNodes.reduce((sum, n) => sum + n.x, 0) / otherNodes.length;
    const avgY = otherNodes.reduce((sum, n) => sum + n.y, 0) / otherNodes.length;

    const offsetX = centerX - avgX;
    const offsetY = centerY - avgY;

    if (Math.abs(offsetX) > 100 || Math.abs(offsetY) > 100) {
      otherNodes.forEach((node) => {
        node.x += offsetX * 0.3;
        node.y += offsetY * 0.3;
      });
    }
  }

  connectLinksToNodes(links, nodeMap) {
    // 더 유연한 노드 찾기 함수
    const findNodeFlexibly = (nodeId) => {
      // 1. 정확한 매칭 시도
      let node = nodeMap.get(nodeId);
      if (node) return node;

      // 2. 문자열로 변환 후 트림하여 매칭 시도
      const trimmedId = String(nodeId).trim();
      node = nodeMap.get(trimmedId);
      if (node) return node;

      // 3. nodeMap의 모든 키에 대해 트림 비교
      for (const [key, value] of nodeMap) {
        if (String(key).trim() === trimmedId) {
          return value;
        }
      }

      // 4. 대소문자 무시하고 트림 비교
      const lowerTrimmedId = trimmedId.toLowerCase();
      for (const [key, value] of nodeMap) {
        if (String(key).trim().toLowerCase() === lowerTrimmedId) {
          return value;
        }
      }

      return null;
    };

    const validLinks = [];

    links.forEach((link) => {
      let isValidLink = true;

      if (typeof link.source === 'string') {
        const sourceNode = findNodeFlexibly(link.source);
        if (sourceNode) {
          link.source = sourceNode;
          console.log(`✅ 소스 노드 연결 성공: ${link.source.id}`);
        } else {
          console.warn(`❌ 소스 노드를 찾을 수 없음: "${link.source}"`);
          isValidLink = false;
        }
      }

      if (typeof link.target === 'string') {
        const targetNode = findNodeFlexibly(link.target);
        if (targetNode) {
          link.target = targetNode;
          console.log(`✅ 타겟 노드 연결 성공: ${link.target.id}`);
        } else {
          console.warn(`❌ 타겟 노드를 찾을 수 없음: "${link.target}"`);
          isValidLink = false;
        }
      }

      if (isValidLink && link.source && link.target) {
        validLinks.push(link);
      } else if (!isValidLink) {
        console.warn(`🗑️ 유효하지 않은 링크 제거: "${link.link_name}"`);
      }
    });

    // 원본 배열 갱신
    links.length = 0;
    links.push(...validLinks);

    // linksWithAlarms도 동일하게 처리
    if (this.linksWithAlarms && this.linksWithAlarms.length > 0) {
      const validAlarmsLinks = [];

      this.linksWithAlarms.forEach((link) => {
        let isValidLink = true;

        if (typeof link.source === 'string') {
          const sourceNode = findNodeFlexibly(link.source);
          if (sourceNode) {
            link.source = sourceNode;
          } else {
            isValidLink = false;
          }
        }

        if (typeof link.target === 'string') {
          const targetNode = findNodeFlexibly(link.target);
          if (targetNode) {
            link.target = targetNode;
          } else {
            isValidLink = false;
          }
        }

        if (isValidLink && link.source && link.target) {
          validAlarmsLinks.push(link);
        }
      });

      this.linksWithAlarms.length = 0;
      this.linksWithAlarms.push(...validAlarmsLinks);
    }

    console.log(
      `🔗 링크 연결 완료: ${validLinks.length}개 유효 링크, ${
        links.length - validLinks.length
      }개 제거됨`
    );
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

    // 드래그 중 실시간 링크 업데이트
    this.updateConnectedLinksRealtime(d);
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
  }

  // 드래그 중 실시간 링크 업데이트
  updateConnectedLinksRealtime(node) {
    // 연결된 링크 실시간 업데이트 (곡선 경로 지원)
    this.g
      .selectAll('.connection-line')
      .filter((d) => d.source.id === node.id || d.target.id === node.id)
      .attr('d', (d) => this.generateCurvePath(d));

    // 연결된 링크 라벨 실시간 업데이트 (곡선 고려)
    this.g
      .selectAll('.connection-label')
      .filter((d) => d.source.id === node.id || d.target.id === node.id)
      .attr('x', (d) => {
        const midX = (d.source.x + d.target.x) / 2;
        const offset = d.curveOffset || 0;
        if (Math.abs(offset) > 1) {
          // 곡선인 경우 라벨 위치 조정
          const dx = d.target.x - d.source.x;
          const dy = d.target.y - d.source.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          if (length > 0) {
            const perpX = -dy / length;
            return midX + perpX * offset * 0.3; // 곡선의 30% 지점에 라벨 배치
          }
        }
        return midX;
      })
      .attr('y', (d) => {
        const midY = (d.source.y + d.target.y) / 2;
        const offset = d.curveOffset || 0;
        if (Math.abs(offset) > 1) {
          // 곡선인 경우 라벨 위치 조정
          const dx = d.target.x - d.source.x;
          const dy = d.target.y - d.source.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          if (length > 0) {
            const perpY = dx / length;
            return midY + perpY * offset * 0.3 - 5; // 곡선의 30% 지점에 라벨 배치
          }
        }
        return midY - 5;
      });

    // 연결된 링크의 경보 배지도 실시간 업데이트
    this.updateLinkAlarmBadgePositions(node);

    // 동적 링크 경보 배지 위치 업데이트 (장애점 추론 후 추가된 배지들)
    this.updateDynamicLinkBadgePositions();
  }

  updateConnectedLinks(node) {
    requestAnimationFrame(() => {
      // 연결된 링크 업데이트 (곡선 경로 지원)
      this.g
        .selectAll('.connection-line')
        .filter((d) => d.source.id === node.id || d.target.id === node.id)
        .attr('d', (d) => this.generateCurvePath(d));

      // 연결된 링크 라벨 업데이트 (곡선 고려)
      this.g
        .selectAll('.connection-label')
        .filter((d) => d.source.id === node.id || d.target.id === node.id)
        .attr('x', (d) => {
          const midX = (d.source.x + d.target.x) / 2;
          const offset = d.curveOffset || 0;
          if (Math.abs(offset) > 1) {
            // 곡선인 경우 라벨 위치 조정
            const dx = d.target.x - d.source.x;
            const dy = d.target.y - d.source.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            if (length > 0) {
              const perpX = -dy / length;
              return midX + perpX * offset * 0.3; // 곡선의 30% 지점에 라벨 배치
            }
          }
          return midX;
        })
        .attr('y', (d) => {
          const midY = (d.source.y + d.target.y) / 2;
          const offset = d.curveOffset || 0;
          if (Math.abs(offset) > 1) {
            // 곡선인 경우 라벨 위치 조정
            const dx = d.target.x - d.source.x;
            const dy = d.target.y - d.source.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            if (length > 0) {
              const perpY = dx / length;
              return midY + perpY * offset * 0.3 - 5; // 곡선의 30% 지점에 라벨 배치
            }
          }
          return midY - 5;
        });

      // 링크 경보 배지 위치도 업데이트
      this.updateLinkAlarmBadgePositions(node);

      // 동적 링크 경보 배지 위치도 업데이트
      this.updateDynamicLinkBadgePositions();
    });
  }

  // 링크 경보 배지 위치 업데이트 (곡선 오프셋 고려)
  updateLinkAlarmBadgePositions(targetNode = null) {
    if (
      !this.linkAlarmBadges ||
      this.linkAlarmBadges.empty() ||
      !this.linksWithAlarms ||
      this.linksWithAlarms.length === 0
    ) {
      return;
    }

    console.log('🔄 링크 경보 배지 위치 업데이트 시작...');

    this.linkAlarmBadges.each(function (linkData) {
      // 데이터가 없으면 건너뛰기
      if (!linkData) return;

      // 타겟 노드가 지정된 경우, 해당 노드와 연결된 링크만 업데이트
      if (targetNode) {
        const isConnectedToTarget =
          (linkData.source && linkData.source.id === targetNode.id) ||
          (linkData.target && linkData.target.id === targetNode.id) ||
          (typeof linkData.source === 'string' && linkData.source === targetNode.id) ||
          (typeof linkData.target === 'string' && linkData.target === targetNode.id);

        if (!isConnectedToTarget) {
          return;
        }
      }

      // 소스와 타겟 노드 좌표 얻기
      let sourceX, sourceY, targetX, targetY;

      // 소스 노드 좌표
      if (linkData.source && typeof linkData.source === 'object') {
        sourceX = linkData.source.x || 0;
        sourceY = linkData.source.y || 0;
      } else if (linkData.sourceNode) {
        sourceX = linkData.sourceNode.x || 0;
        sourceY = linkData.sourceNode.y || 0;
      } else {
        sourceX = 0;
        sourceY = 0;
      }

      // 타겟 노드 좌표
      if (linkData.target && typeof linkData.target === 'object') {
        targetX = linkData.target.x || 100;
        targetY = linkData.target.y || 100;
      } else if (linkData.targetNode) {
        targetX = linkData.targetNode.x || 100;
        targetY = linkData.targetNode.y || 100;
      } else {
        targetX = 100;
        targetY = 100;
      }

      // 링크 중심점 계산
      const midX = (sourceX + targetX) / 2;
      const midY = (sourceY + targetY) / 2;

      // 곡선 오프셋 고려한 배지 위치 계산
      let badgeX = midX;
      let badgeY = midY - 30; // 기본 위치

      const offset = linkData.curveOffset || 0;
      if (Math.abs(offset) > 1) {
        // 곡선인 경우 경보 배지도 곡선 방향으로 이동
        const dx = targetX - sourceX;
        const dy = targetY - sourceY;
        const length = Math.sqrt(dx * dx + dy * dy);

        if (length > 0) {
          const perpX = -dy / length;
          const perpY = dx / length;

          // 곡선의 중점에서 약간 위쪽에 배지 배치
          badgeX = midX + perpX * offset * 0.3;
          badgeY = midY + perpY * offset * 0.3 - 30;
        }
      }

      // 링크 경보 배지 위치 업데이트
      d3.select(this).attr('transform', `translate(${badgeX}, ${badgeY})`);

      // 디버깅 로그
      if (targetNode) {
        console.log(
          `📍 배지 위치 업데이트: ${linkData.link_name} - (${badgeX.toFixed(1)}, ${badgeY.toFixed(
            1
          )}) 오프셋: ${offset}`
        );
      }
    });

    if (!targetNode) {
      console.log('✅ 모든 링크 경보 배지 위치 업데이트 완료');
    }
  }

  // 동적 링크 경보 배지 위치 업데이트 (장애점 추론 후 추가된 배지들)
  updateDynamicLinkBadgePositions() {
    try {
      // FailurePointManager의 동적 배지들 업데이트
      if (typeof window !== 'undefined' && window.failurePointManager) {
        const animationElements = window.failurePointManager.animationElements || [];

        animationElements.forEach((element) => {
          if (element.type === 'link-badge' && element.updatePosition) {
            try {
              element.updatePosition();
            } catch (error) {
              console.warn(`동적 링크 배지 위치 업데이트 실패 (${element.id}):`, error);
            }
          }
        });
      }
    } catch (error) {
      console.warn('동적 링크 배지 위치 업데이트 중 오류:', error);
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

        // 장애점 애니메이션 중인 노드는 스타일 변경하지 않음
        const nodeElement = d3.select(event.currentTarget);
        if (!nodeElement.classed('failure-point-animated')) {
          nodeElement
            .select('circle')
            .style('filter', 'brightness(1.2) drop-shadow(0 2px 4px rgba(0,0,0,0.3))')
            .style('stroke-width', '3px');
        }
      })
      .on('mouseleave', (event, d) => {
        hoverTimer = setTimeout(() => {
          TooltipManager?.startAutoHideTimer?.();
        }, 100);

        // 장애점 애니메이션 중인 노드는 스타일 변경하지 않음
        const nodeElement = d3.select(event.currentTarget);
        if (!nodeElement.classed('failure-point-animated')) {
          nodeElement
            .select('circle')
            .style('filter', 'none')
            .style('stroke-width', d.isTarget ? '4px' : '2px');
        }
      })
      .on('click', this.onNodeClick.bind(this));

    if (this.linkElements && !this.linkElements.empty()) {
      this.linkElements
        .on('mouseenter', (event, d) => {
          this.showLinkTooltip(event, d);

          // 장애점 애니메이션 중인 링크는 스타일 변경하지 않음
          const linkElement = d3.select(event.currentTarget);
          if (!linkElement.classed('failure-point-animated')) {
            linkElement.style('stroke-width', '5px').style('stroke-opacity', '1');
          }
        })
        .on('mouseleave', (event, d) => {
          TooltipManager?.startAutoHideTimer?.();

          // 장애점 애니메이션 중인 링크는 스타일 변경하지 않음
          const linkElement = d3.select(event.currentTarget);
          if (!linkElement.classed('failure-point-animated')) {
            linkElement.style('stroke-width', '3px').style('stroke-opacity', '0.8');
          }
        });
    }

    if (this.linkLabels && !this.linkLabels.empty()) {
      this.linkLabels
        .on('mouseenter', (event, d) => {
          this.showLinkTooltip(event, d);
          const correspondingLink = this.linkElements.filter((linkData) => linkData.id === d.id);

          // 장애점 애니메이션 중인 링크는 스타일 변경하지 않음
          if (!correspondingLink.classed('failure-point-animated')) {
            correspondingLink.style('stroke-width', '5px').style('stroke-opacity', '1');
          }
        })
        .on('mouseleave', (event, d) => {
          TooltipManager?.startAutoHideTimer?.();
          const correspondingLink = this.linkElements.filter((linkData) => linkData.id === d.id);

          // 장애점 애니메이션 중인 링크는 스타일 변경하지 않음
          if (!correspondingLink.classed('failure-point-animated')) {
            correspondingLink.style('stroke-width', '3px').style('stroke-opacity', '0.8');
          }
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
    // MW 링크와 선로 링크 구분하여 경보 표시
    let alarmsToShow = [];
    let cableAlarmCount = 0;

    if (d.isMWLink) {
      // MW 링크는 경보 표시 제외
      alarmsToShow = [];
    } else {
      // 선로 링크의 경우: 케이블 매칭된 경보만 표시
      const cableAlarms = d.linkAlarms || [];
      alarmsToShow = [
        ...cableAlarms,
        ...(d.sourceNode.alarms || []),
        ...(d.targetNode.alarms || []),
      ];
      cableAlarmCount = cableAlarms.length;

      console.log(`🔍 선로 링크 "${d.link_name}" 툴팁 경보 정보:`, {
        cableAlarms: cableAlarms.length,
        sourceNodeAlarms: (d.sourceNode.alarms || []).length,
        targetNodeAlarms: (d.targetNode.alarms || []).length,
        totalAlarms: alarmsToShow.length,
      });
    }

    TooltipManager?.showLinkTooltip?.(event, {
      link_name: d.link_name,
      link_field: d.link_field,
      link_type: d.link_type,
      section: `${d.sourceNode.name} - ${d.targetNode.name}`,
      cable_aroot: d.cable_aroot,
      cable_broot: d.cable_broot,
      sourceNode: d.sourceNode,
      targetNode: d.targetNode,
      alarms: alarmsToShow,
      cableAlarmCount: cableAlarmCount, // 케이블 매칭된 경보 수 추가
      linkId: d.id || d.link_name, // 장애점 찾기를 위한 링크 ID 추가
    });
  }

  // 노드 및 링크 생성 메서드들 (맵 노드 생성 - 타겟 노드 생성 및 계층 구조 기반 배치)
  createMapNodes(equipmentList, targetEquip, centerX, centerY) {
    const nodes = [];
    const totalNodes = equipmentList.length;

    // 2개 노드인 경우는 타겟 노드 위치를 나중에 조정하므로 일단 중앙에 배치
    const targetNode = this.createEquipNode(targetEquip, centerX, centerY, 'center', 0, true);
    nodes.push(targetNode);

    // 나머지 노드들을 스프레드 레이아웃으로 배치
    const otherEquipments = equipmentList.filter((e) => e.equip_id !== targetEquip.equip_id);
    this.arrangeNodesInSpreadLayout(otherEquipments, targetNode, centerX, centerY, nodes);

    console.log(`🎯 스프레드 레이아웃 배치: 총 ${nodes.length}개 노드`);
    return nodes;
  }

  // 스프레드 레이아웃으로 노드들 배치
  arrangeNodesInSpreadLayout(equipmentList, targetNode, centerX, centerY, nodes) {
    if (equipmentList.length === 0) return;

    const totalNodes = equipmentList.length + 1; // 타겟 노드 포함
    const { width, height } = this.getContainerDimensions();

    // 소수 노드일 때 특별 처리
    if (totalNodes <= 4) {
      this.arrangeSmallNetwork(equipmentList, targetNode, centerX, centerY, nodes, width, height);
      return;
    }

    // 기존 로직 (5개 이상일 때)
    const fieldGroups = this.groupByField(equipmentList);
    const fieldNames = Object.keys(fieldGroups);
    const layoutRadius = Math.min(width, height) * 0.35;

    let nodeIndex = 0;

    fieldNames.forEach((fieldName, fieldIndex) => {
      const fieldEquipments = fieldGroups[fieldName];

      const fieldAngle = (2 * Math.PI * fieldIndex) / fieldNames.length;
      const fieldCenterX = centerX + Math.cos(fieldAngle) * layoutRadius * 0.6;
      const fieldCenterY = centerY + Math.sin(fieldAngle) * layoutRadius * 0.6;

      fieldEquipments.forEach((equip, equipIndex) => {
        let nodeX, nodeY;

        if (fieldEquipments.length === 1) {
          nodeX = fieldCenterX;
          nodeY = fieldCenterY;
        } else {
          const equipAngle = (2 * Math.PI * equipIndex) / fieldEquipments.length;
          const equipRadius = Math.min(80, layoutRadius * 0.3);

          nodeX = fieldCenterX + Math.cos(equipAngle) * equipRadius;
          nodeY = fieldCenterY + Math.sin(equipAngle) * equipRadius;
        }

        const randomOffset = 20;
        nodeX += (Math.random() - 0.5) * randomOffset;
        nodeY += (Math.random() - 0.5) * randomOffset;

        const node = this.createEquipNode(equip, nodeX, nodeY, fieldName, 1, false, nodes);
        nodeIndex++;
      });
    });

    console.log(`📍 스프레드 레이아웃: ${fieldNames.length}개 분야, ${nodeIndex}개 노드 배치`);
  }

  // 소수 노드(2-4개)일 때 특별 배치
  arrangeSmallNetwork(equipmentList, targetNode, centerX, centerY, nodes, width, height) {
    const totalNodes = equipmentList.length + 1; // 타겟 노드 포함

    console.log(`🎯 소수 노드 특별 배치: ${totalNodes}개 노드`);

    if (totalNodes === 2) {
      // 2개 노드: 중앙 기준 수평 배치 - 간격을 더 늘리고 중앙에 배치
      const minDistance = Math.min(width, height) * 0.45; // 화면 크기의 45%로 증가
      const twoNodeDistance = Math.max(400, minDistance); // 최소 400px로 증가
      const halfDistance = twoNodeDistance / 2;

      const otherEquip = equipmentList[0];

      // 타겟 노드를 왼쪽에, 다른 노드를 오른쪽에 배치하여 중앙 균형 맞춤
      // 타겟 노드 위치 조정
      const targetNodeInNodes = nodes.find((n) => n.isTarget);
      if (targetNodeInNodes) {
        targetNodeInNodes.x = centerX - halfDistance;
        targetNodeInNodes.fx = centerX - halfDistance; // 고정 위치도 업데이트
      }

      // 다른 노드를 오른쪽에 배치
      const nodeX = centerX + halfDistance;
      const nodeY = centerY;

      this.createEquipNode(otherEquip, nodeX, nodeY, otherEquip.equip_field, 1, false, nodes);

      console.log(
        `📍 2개 노드 중앙 수평 배치: 총 거리 ${twoNodeDistance}px, 각 노드는 중심에서 ±${halfDistance}px`
      );
    } else if (totalNodes === 3) {
      // 3개 노드: 수평 일직선 배치 (기존 로직 유지 - 사용자가 만족)
      const minDistance = Math.min(width, height) * 0.25;
      const baseDistance = Math.max(200, minDistance);
      const distance = baseDistance * 1.2;

      equipmentList.forEach((equip, index) => {
        const nodeX = centerX + (index === 0 ? -distance : distance);
        const nodeY = centerY;

        this.createEquipNode(equip, nodeX, nodeY, equip.equip_field, 1, false, nodes);
      });

      console.log(`📍 3개 노드 수평 배치: 간격 ${distance}px`);
    } else if (totalNodes === 4) {
      // 4개 노드: 지그재그 배치 - 링크 가시성 최적화, 중앙 배치
      const minDistance = Math.min(width, height) * 0.25;
      const baseDistance = Math.max(200, minDistance);
      const distance = baseDistance * 1.1;

      // 지그재그 패턴: 12시, 3시, 7시 방향으로 배치
      const positions = [
        { x: centerX, y: centerY - distance }, // 12시 (위쪽)
        { x: centerX + distance, y: centerY }, // 3시 (오른쪽)
        { x: centerX - distance * 0.7, y: centerY + distance * 0.8 }, // 7시-8시 방향 (왼쪽 아래)
      ];

      equipmentList.forEach((equip, index) => {
        if (index < positions.length) {
          const pos = positions[index];
          this.createEquipNode(equip, pos.x, pos.y, equip.equip_field, 1, false, nodes);
        }
      });

      console.log(`📍 4개 노드 지그재그 배치: 거리 ${distance}px (12시-3시-7시 방향)`);
      console.log(
        `   위치: 12시(${centerX}, ${centerY - distance}), 3시(${
          centerX + distance
        }, ${centerY}), 7시(${centerX - distance * 0.7}, ${centerY + distance * 0.8})`
      );
    }
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
      this.linkRelations.forEach((linkData) => {
        if (typeof linkData === 'object' && linkData.source && linkData.target) {
          const { source, target, link_name, up_down } = linkData;
          connections.push({
            source,
            target,
            linkName: link_name,
            upDown: up_down,
          });
        } else {
          console.error('❌ 잘못된 링크 데이터 형식:', linkData);
          console.error(
            '   예상 형식: {source, target, link_name, up_down, cable_aroot, cable_broot, link_type}'
          );
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

    // 디버깅: 노드 ID 목록 출력
    const nodeIds = nodes.map((n) => n.id);
    console.log(`📋 생성된 노드 ID 목록 (${nodeIds.length}개):`, nodeIds);

    this.linkRelations.forEach((linkData, index) => {
      if (typeof linkData === 'object' && linkData.source && linkData.target) {
        const { source, target, link_name, up_down, cable_aroot, cable_broot, link_type } =
          linkData;

        console.log(`🔗 링크 #${index + 1} "${link_name}":`, {
          source: source,
          target: target,
          sourceExists: nodes.some((n) => n.id === source),
          targetExists: nodes.some((n) => n.id === target),
        });

        this.createLinkIfNodesExist(
          links,
          nodes,
          source,
          target,
          link_name,
          up_down,
          cable_aroot,
          cable_broot,
          link_type
        );
      } else {
        console.error('❌ 잘못된 링크 데이터 형식:', linkData);
        console.error(
          '   예상 형식: {source, target, link_name, up_down, cable_aroot, cable_broot, link_type}'
        );
      }
    });

    console.log(`🎯 API 기반 링크 생성 완료: ${links.length}개 링크`);
  }

  // 노드가 존재하는 경우 링크 생성 (멀티 링크 지원)
  createLinkIfNodesExist(
    links,
    nodes,
    sourceId,
    targetId,
    linkName,
    upDown,
    cable_aroot = '',
    cable_broot = '',
    link_type = ''
  ) {
    const sourceNode = nodes.find((n) => n.id === sourceId);
    const targetNode = nodes.find((n) => n.id === targetId);

    if (!sourceNode || !targetNode) {
      console.warn(`⚠️ 노드를 찾을 수 없음: ${sourceId} 또는 ${targetId}`);
      return;
    }

    // 링크 고유 ID 생성 (link_name 포함하여 동일 노드 간 여러 링크 허용)
    const linkId = `${sourceId}-${targetId}-${linkName}`;

    // 동일한 link_name을 가진 정확히 같은 링크만 중복 체크
    const existingLink = links.find(
      (link) =>
        link.id === linkId ||
        (link.source === sourceId && link.target === targetId && link.link_name === linkName) ||
        (link.source === targetId && link.target === sourceId && link.link_name === linkName)
    );

    if (existingLink) {
      console.log(`⚠️ 동일한 링크가 이미 존재: ${linkName} (${sourceId} ↔ ${targetId})`);
      return;
    }

    const linkInfo = this.generateLinkInfo(
      sourceNode,
      targetNode,
      linkName,
      upDown,
      cable_aroot,
      cable_broot,
      link_type
    );

    const linkData = {
      id: linkId, // 고유 ID 사용
      source: sourceId,
      target: targetId,
      ...linkInfo,
      sourceNode: sourceNode,
      targetNode: targetNode,
      // 초기에는 경보 정보 없음 - 장애점 추론 후 동적 추가
      linkAlarms: [],
      hasAlarm: false,
      alarmCount: 0,
      isMWLink: sourceNode.field === 'MW' && targetNode.field === 'MW',
    };

    links.push(linkData);

    console.log(
      `✅ 링크 생성: ${sourceNode.name} → ${targetNode.name} (${upDown}) [ID: ${linkId}]`
    );
    console.log(`   케이블 정보: A루트='${cable_aroot}', B루트='${cable_broot}'`);
    console.log(`   링크 타입: '${linkData.link_type}'`);
  }

  // 링크의 케이블 정보와 선로 경보 매칭
  generateLinkInfo(
    sourceNode,
    targetNode,
    linkName = null,
    upDown = 'unknown',
    cable_aroot = '',
    cable_broot = '',
    link_type = ''
  ) {
    const isMWLink = sourceNode.field === 'MW' && targetNode.field === 'MW';

    // 백엔드에서 제공된 실제 케이블 정보가 있으면 사용, 없으면 기본값 생성
    const finalCableARoot = cable_aroot || `${sourceNode.guksa} - ${targetNode.guksa} A루트`;
    const finalCableBRoot = cable_broot || `${sourceNode.guksa} - ${targetNode.guksa} B루트`;

    // 백엔드에서 제공된 link_type을 그대로 사용 (비어있거나 null일 수 있음)
    // MW 링크는 예외적으로 'MW'로 설정
    const finalLinkType = isMWLink ? 'MW' : link_type;

    return {
      link_name: linkName || `${sourceNode.name} ↔ ${targetNode.name}`,
      link_field: isMWLink ? 'MW' : '선로',
      link_type: finalLinkType,
      cable_aroot: finalCableARoot,
      cable_broot: finalCableBRoot,
      up_down: upDown,
    };
  }

  // 링크 렌더링 (멀티 링크 지원)
  renderLinks(links) {
    const linkGroup = this.g.append('g').attr('class', 'links');
    const alarmData = StateManager.get('totalAlarmDataList', []);

    console.log('🔍 전체 경보 데이터:', alarmData.length, '개');

    // 동일한 노드 간 여러 링크 그룹핑 및 오프셋 계산
    const linkGroups = this.groupLinksByNodePair(links);
    this.calculateLinkOffsets(linkGroups, links);

    // 각 링크에 경보 정보 추가
    links.forEach((link) => {
      const isMWLink = link.sourceNode.field === 'MW' && link.targetNode.field === 'MW';
      let linkAlarms = [];

      console.log(`🔍 링크 "${link.link_name}" 경보 체크 중:`, {
        isMWLink: isMWLink,
        sourceField: link.sourceNode.field,
        targetField: link.targetNode.field,
        linkName: link.link_name,
      });

      if (!isMWLink) {
        // 선로 링크인 경우: link_name과 equip_name 비교
        console.log(`🔍 선로 링크 "${link.link_name}" 경보 매칭 시도 중...`);

        linkAlarms = alarmData.filter((alarm) => {
          if (!alarm || !alarm.equip_name) return false;

          // 정확한 매칭만 허용
          const exactMatch = alarm.equip_name === link.link_name;

          if (exactMatch) {
            console.log(`✅ 선로 링크 경보 매칭:`, {
              alarmEquipName: alarm.equip_name,
              linkName: link.link_name,
              alarmMessage: alarm.alarm_message,
              sector: alarm.sector,
            });
          }
          return exactMatch;
        });

        // 선로 링크에서 매칭이 안 된 경우 추가 디버깅
        if (linkAlarms.length === 0) {
          console.log(`❌ 선로 링크 "${link.link_name}" 경보와 매칭된 선로 없음`);
        }
      }

      const hasAlarm = linkAlarms.length > 0;

      console.log(`📊 링크 "${link.link_name}" 최종 경보 결과:`, {
        hasAlarm: hasAlarm,
        alarmCount: linkAlarms.length,
        linkAlarms: linkAlarms,
      });

      // 링크 데이터에 경보 정보 저장
      link.hasAlarm = hasAlarm;
      link.isMWLink = isMWLink;
      link.linkAlarms = linkAlarms; // 실제 경보 데이터 저장
      link.alarmCount = linkAlarms.length; // 정확한 경보 개수
    });

    // 곡선 링크 렌더링 (path 요소 사용)
    this.linkElements = linkGroup
      .selectAll('path')
      .data(links)
      .enter()
      .append('path')
      .attr('stroke', (d) => {
        // 한전광: link_type이 "한전광"이면 빨간색
        if (d.link_type && d.link_type === '한전광') {
          return '#f00202'; // 빨간색
        }
        // KT 광선로: 링크가 MW가 아니고 경보가 있으면 빨간색, 그렇지 않으면 기본 색상
        if (!d.isMWLink && d.hasAlarm) {
          return '#ff0000'; // 빨간색
        }
        return ColorManager.getLinkColor?.(d.sourceNode.field, d.targetNode.field) || '#666';
      })
      .attr('stroke-width', 3)
      .attr('stroke-opacity', 0.8)
      .attr('stroke-dasharray', (d) => {
        // MW 링크는 점선, 선로 링크 중 경보가 있으면 점선, 나머지는 실선
        if (d.isMWLink) {
          return '8,4'; // MW 링크는 기존대로 점선
        } else if (d.hasAlarm) {
          return '6,3'; // 선로 링크에 경보가 있으면 점선
        }
        return 'none'; // 선로 링크에 경보가 없으면 실선
      })
      .attr('fill', 'none')
      .style('pointer-events', 'stroke')
      .style('cursor', 'pointer')
      .attr('class', 'connection-line')
      .on('mouseenter', (event, d) => {
        this.showLinkTooltip(event, d);
      })
      .on('mouseleave', () => {
        TooltipManager?.startAutoHideTimer?.();
      });

    // 링크 레이블 렌더링
    this.linkLabels = linkGroup
      .selectAll('text')
      .data(links)
      .enter()
      .append('text')
      .attr('text-anchor', 'middle')

      // 아랫쪽 레이블 위치를 15에서 22로 조정
      .attr('dy', (d) => (d.labelPosition === 'bottom' ? 22 : -5))
      .style('font-size', '11px')
      .style('fill', (d) => {
        // link_type이 "한전광" 색 설정
        if (d.link_type && d.link_type === '한전광') {
          return '#f00202'; // 링크 색상과 동일
        }
        return '#818181'; // 기본 회색
      })
      .style('pointer-events', 'all')
      .style('user-select', 'none')
      .style('cursor', 'pointer')
      .attr('class', 'connection-label')
      .text((d) => {
        // link_type이 "한전광"이면 "[한전광]" prefix 추가
        if (d.link_type && d.link_type === '한전광') {
          return `[한전광] ${d.link_name}`;
        }
        return d.link_name;
      })
      .on('mouseenter', (event, d) => {
        this.showLinkTooltip(event, d);
      })
      .on('mouseleave', () => {
        TooltipManager?.startAutoHideTimer?.();
      });

    // 링크 경보 배지 렌더링 (경보가 있는 링크만)
    this.renderLinkAlarmBadges(linkGroup, links);
  }

  // 동일한 노드 간 링크 그룹핑
  groupLinksByNodePair(links) {
    const groups = new Map();

    links.forEach((link) => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;

      // 노드 쌍을 정규화 (작은 ID가 먼저 오도록)
      const key = sourceId < targetId ? `${sourceId}-${targetId}` : `${targetId}-${sourceId}`;

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(link);
    });

    return groups;
  }

  // 링크 오프셋 계산 (멀티 링크가 있는 경우 곡선으로 분리)
  calculateLinkOffsets(linkGroups, links) {
    linkGroups.forEach((groupLinks, key) => {
      if (groupLinks.length > 1) {
        const totalLinks = groupLinks.length;
        const offsetStep = 25; // 오프셋 간격을 줄임 (40 -> 25)

        groupLinks.forEach((link, index) => {
          // 중앙을 기준으로 대칭적으로 배치
          const offset = (index - (totalLinks - 1) / 2) * offsetStep;
          link.curveOffset = offset;

          // 레이블 위치 설정
          if (totalLinks === 2) {
            // 2개 링크인 경우: 위/아래 배치
            link.labelPosition = index === 0 ? 'top' : 'bottom';
          } else if (totalLinks % 2 === 0) {
            // 짝수개인 경우: 절반은 위, 절반은 아래
            link.labelPosition = index < totalLinks / 2 ? 'top' : 'bottom';
          } else {
            // 홀수개인 경우: 중앙은 위, 나머지는 위/아래 번갈아가며
            if (index === Math.floor(totalLinks / 2)) {
              link.labelPosition = 'top';
            } else if (index < Math.floor(totalLinks / 2)) {
              link.labelPosition = 'top';
            } else {
              link.labelPosition = 'bottom';
            }
          }

          console.log(
            `🔗 링크 "${link.link_name}" 곡선 오프셋: ${offset}, 레이블 위치: ${link.labelPosition}`
          );
        });
      } else {
        // 단일 링크는 직선이고 레이블은 위에 배치
        groupLinks[0].curveOffset = 0;
        groupLinks[0].labelPosition = 'top';
      }
    });
  }

  // 링크 경보 배지 렌더링
  renderLinkAlarmBadges(linkGroup, links) {
    // 경보가 있는 링크만 필터링
    const linksWithAlarms = links.filter(
      (link) => !link.isMWLink && link.hasAlarm && link.alarmCount > 0
    );

    console.log(`🚨 경보가 있는 링크: ${linksWithAlarms.length}개`);

    if (linksWithAlarms.length === 0) {
      // 링크 경보 배지 참조 초기화
      this.linkAlarmBadges = null;
      this.linksWithAlarms = [];

      return;
    }

    // 링크 경보 배지 그룹 생성
    const alarmBadgeGroup = linkGroup.append('g').attr('class', 'link-alarm-badges');

    // D3 데이터 바인딩을 통해 배지 생성
    const badgeGroups = alarmBadgeGroup
      .selectAll('.link-alarm-badge-group')
      .data(linksWithAlarms, (d) => d.id) // 고유 ID로 데이터 바인딩
      .enter()
      .append('g')
      .attr('class', 'link-alarm-badge-group')
      .attr('data-link-id', (d) => d.id);

    // 각 배지 그룹에 원과 텍스트 추가
    const self = this; // this 컨텍스트 저장
    badgeGroups.each(function (linkData) {
      const badgeGroup = d3.select(this);

      // 링크 경보 배지 원
      badgeGroup
        .append('circle')
        .attr('class', 'link-alarm-badge')
        .attr('r', 10)
        .style('fill', '#ff8c00')
        .style('fill-opacity', 0.9)
        .style('stroke', 'white')
        .style('stroke-width', 2)
        .style('cursor', 'pointer')
        .on('mouseenter', (event) => {
          self.showLinkTooltip(event, linkData);
        })
        .on('mouseleave', () => {
          TooltipManager?.startAutoHideTimer?.();
        });

      // 링크 경보 개수 텍스트
      badgeGroup
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.3em')
        .style('font-size', '10px')
        .style('font-weight', 'bold')
        .style('fill', 'white')
        .style('pointer-events', 'none')
        .text(linkData.alarmCount > 99 ? '99+' : linkData.alarmCount);
    });

    // 링크 경보 배지 참조 저장
    this.linkAlarmBadges = alarmBadgeGroup.selectAll('.link-alarm-badge-group');
    this.linksWithAlarms = linksWithAlarms;

    // 초기 위치 설정
    this.updateLinkAlarmBadgePositions();

    console.log(`✅ 링크 경보 배지 렌더링 완료: ${linksWithAlarms.length}개 링크에 경보`);
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
      .text(`• 선택 장비: ${targetNode.name} (국사: ${targetNode.guksa})`);
  }

  /**
   * 장애점 분석을 위한 기본 정보를 미리 준비하고 캐싱
   * @param {Object} targetEquip - 중심 장비 정보
   * @param {Array} equipmentList - 전체 장비 목록
   */
  prepareFailureAnalysisData(targetEquip, equipmentList) {
    try {
      console.log('🚀 장애점 분석 기본 정보 준비 시작...');

      // 1. 노드와 링크 데이터 정리
      const preparedData = {
        nodes: this.nodes || [],
        links: this.links || [],
        equipment_summary: {
          total_nodes: equipmentList.length,
          target_equipment: targetEquip,
          field_distribution: this.calculateFieldDistribution(equipmentList),
          alarm_summary: this.calculateAlarmSummary(equipmentList),
        },
        timestamp: new Date().toISOString(),
        version: '1.0',
      };

      // 2. StateManager에 캐싱
      StateManager.set('prepared_failure_analysis_data', preparedData);

      // 3. 간소화된 로깅 정보 미리 생성
      const loggingCache = this.generateLoggingCache(equipmentList);
      StateManager.set('failure_analysis_logging_cache', loggingCache);

      console.log(
        `✅ 장애점 분석 기본 정보 준비 완료: 노드 ${preparedData.nodes.length}개, 링크 ${preparedData.links.length}개`
      );
      console.log('📊 분야별 분포:', preparedData.equipment_summary.field_distribution);
    } catch (error) {
      console.error('❌ 장애점 분석 기본 정보 준비 실패:', error);
    }
  }

  /**
   * 분야별 장비 분포 계산
   */
  calculateFieldDistribution(equipmentList) {
    const distribution = {};
    let totalAlarms = 0;

    equipmentList.forEach((equip) => {
      const field = equip.field || 'Unknown';
      const alarmCount = equip.alarms ? equip.alarms.length : 0;

      if (!distribution[field]) {
        distribution[field] = { count: 0, alarms: 0 };
      }
      distribution[field].count++;
      distribution[field].alarms += alarmCount;
      totalAlarms += alarmCount;
    });

    distribution.total_alarms = totalAlarms;
    return distribution;
  }

  /**
   * 경보 요약 정보 계산
   */
  calculateAlarmSummary(equipmentList) {
    let totalAlarms = 0;
    let validAlarms = 0;
    const sectorCounts = {};

    equipmentList.forEach((equip) => {
      if (equip.alarms) {
        equip.alarms.forEach((alarm) => {
          totalAlarms++;
          if (alarm.valid_yn === 'Y') {
            validAlarms++;
          }

          const sector = alarm.sector || 'Unknown';
          sectorCounts[sector] = (sectorCounts[sector] || 0) + 1;
        });
      }
    });

    return {
      total: totalAlarms,
      valid: validAlarms,
      invalid: totalAlarms - validAlarms,
      by_sector: sectorCounts,
    };
  }

  /**
   * 로깅 캐시 생성 (상세 로깅 최적화를 위한 미리 계산된 정보)
   */
  generateLoggingCache(equipmentList) {
    const cache = {
      summary: {
        equipment_count: equipmentList.length,
        field_summary: {},
        alarm_summary: {
          total: 0,
          by_field: {},
        },
      },
      detailed_info: {
        nodes: [],
        links: [],
      },
      generated_at: new Date().toISOString(),
    };

    // 분야별 요약 생성
    equipmentList.forEach((equip, index) => {
      const field = equip.field || 'Unknown';
      const alarmCount = equip.alarms ? equip.alarms.length : 0;

      // 분야별 카운트
      if (!cache.summary.field_summary[field]) {
        cache.summary.field_summary[field] = { count: 0, alarms: 0 };
      }
      cache.summary.field_summary[field].count++;
      cache.summary.field_summary[field].alarms += alarmCount;

      // 전체 경보 카운트
      cache.summary.alarm_summary.total += alarmCount;
      if (!cache.summary.alarm_summary.by_field[field]) {
        cache.summary.alarm_summary.by_field[field] = 0;
      }
      cache.summary.alarm_summary.by_field[field] += alarmCount;

      // 상세 정보 (필요 시 사용)
      cache.detailed_info.nodes.push({
        index: index + 1,
        name: equip.name || equip.id || 'Unknown',
        field: field,
        level: equip.level || 0,
        alarm_count: alarmCount,
      });
    });

    // 링크 정보도 캐싱
    if (this.links) {
      this.links.forEach((link, index) => {
        cache.detailed_info.links.push({
          index: index + 1,
          name: link.link_name || link.id || 'Unknown',
          alarm_count: link.alarms ? link.alarms.length : 0,
        });
      });
    }

    return cache;
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

    // 링크 경보 배지 이벤트도 정리
    if (this.g) {
      this.g.selectAll('.link-alarm-badge').on('mouseenter', null).on('mouseleave', null);
    }

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
}

export default EquipmentMapComponent;
