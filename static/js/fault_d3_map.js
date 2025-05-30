// 국사 기준 맵 관련 상수 정의
const GUKSA_MAP_CONFIG = {
  // 국사-장비 간 기본 간격
  GUKSA_TO_EQUIP_MIN: 50,
  GUKSA_TO_EQUIP_MAX: 150,
  GUKSA_TO_EQUIP_MULTIPLIER: 5,

  // 분야별 그룹 간격 (화면에 맞게 조정) - 기본 간격 증가
  GROUP_BASE_WIDTH: 200,
  GROUP_SPACING: 350, // 250 → 350 (그룹 간 간격 더 증가)
  GROUP_MARGIN: 30,

  // 노드 수에 따른 동적 간격 조정
  NODE_COUNT_THRESHOLD: 20,
  EXTRA_SPACING_PER_10_NODES: 30,

  // 그룹 내 노드 배치
  NODE_VERTICAL_SPACING: 45,
  NODE_HORIZONTAL_SPACING: 60,
  NODES_PER_COLUMN: 8,
  NODES_PER_ROW: 3,

  // SVG 크기 (고해상도 모니터 지원)
  SVG_WIDTH: 1600,
  SVG_HEIGHT: 600,

  // 경계 설정
  BOUNDARY_MARGIN: 30,

  // 줌 설정
  ZOOM_MIN_SCALE: 0.2,
  ZOOM_MAX_SCALE: 3.0,
};

const COLORS = {
  DEFAULT: {
    FILL: '#ff5555',
    BORDER: '#cc0000',
  },
  GUKSA: {
    FILL: '#0056b3',
    BORDER: '#003366',
  },
  SECTOR: {
    MW: { FILL: '#ffaa00', BORDER: '#e67700' },
    선로: { FILL: '#ff8833', BORDER: '#cc5500' },
    전송: { FILL: '#ff66cc', BORDER: '#cc0099' },
    IP: { FILL: '#ff3333', BORDER: '#cc0000' },
    무선: { FILL: '#ffcc66', BORDER: '#cc9933' },
    교환: { FILL: '#cc0000', BORDER: '#990000' },
  },
};

const LAYOUT = {
  LEFT_MARGIN: 80,
  TOP_MARGIN: 80,

  // 국사 노드 위치 상수 - 좌측 가장자리에 고정하되 화면에 보이도록 조정
  GUKSA_X: 100, // -100 → 100 (화면 내부 좌측에 고정)
  GUKSA_Y: 300, // 국사 노드 Y 위치 (맵 세로 중앙)

  // 장비 노드 크기 (더 작게 조정: 23 → 18)
  NODE_RADIUS: 18, // 23 → 18 (더 작게)
  NODE_RADIUS_HOVER: 22, // 27 → 22 (더 작게)

  // 국사 노드 크기 (더 작게 조정)
  GUKSA_WIDTH: 120, // 144 → 120 (더 작게)
  GUKSA_WIDTH_HOVER: 126, // 151 → 126 (더 작게)

  GUKSA_HEIGHT: 40, // 50 → 40 (더 작게)
  GUKSA_HEIGHT_HOVER: 44, // 54 → 44 (더 작게)

  // 경보 배지 크기 (더 작게 조정)
  BADGE_RADIUS: 10, // 13 → 10 (더 작게)
  BADGE_RADIUS_HOVER: 12, // 16 → 12 (더 작게)

  SECTOR_SPACING: 800,
  SECTOR_ORDER: ['MW', '선로', '전송', 'IP', '무선', '교환'],
};

const STYLE = {
  NODE_STROKE_WIDTH: 2.5,
  LINK_STROKE_WIDTH: 2,
  LINK_OPACITY: 0.6,

  FONT_SIZE: {
    GUKSA: '16px',
    SECTOR: '14px',
    LABEL: '16px',
    BADGE: '11px',
    BADGE_HOVER: '12px',
  },
};

const FORCE = {
  LINK_DISTANCE: 100,
  CHARGE_STRENGTH: -10,
  X_STRENGTH: 1.0,
  Y_STRENGTH: 0.4,
  COLLIDE_RADIUS: 20,
  ALPHA_DECAY: 0.04,
  ALPHA: 0.15,
};

// ========================================
// 화면 크기에 따른 동적 크기 계산 함수
// ========================================

// 화면 크기에 따른 동적 레이아웃 계산
function calculateDynamicLayout(containerWidth, containerHeight) {
  // 기본 크기 (1920x1080 기준)
  const baseWidth = 1920;
  const baseHeight = 1080;

  // 현재 화면 크기 비율 계산
  const widthRatio = containerWidth / baseWidth;
  const heightRatio = containerHeight / baseHeight;
  const scaleFactor = Math.min(widthRatio, heightRatio);

  // 노드 크기 스케일 제한 (최소 크기를 1.5배로 증가)
  const nodeScaleFactor = Math.max(1.2, Math.min(2.4, scaleFactor * 1.3)); //

  // 분야별 간격 스케일 제한 (더 큰 범위)
  const spacingScaleFactor = Math.max(1.0, Math.min(2.0, scaleFactor));

  return {
    // 장비 노드 크기 (최소 크기를 1.5배로 증가)
    NODE_RADIUS: Math.max(24, Math.round(20 * nodeScaleFactor)), // 16 → 24px, 18 → 27px (1.5배)
    NODE_RADIUS_HOVER: Math.max(30, Math.round(25 * nodeScaleFactor)), // 20 → 30px, 22 → 33px (1.5배)

    // 국사 노드 크기 (최소 크기를 1.5배로 증가)
    GUKSA_WIDTH: Math.max(150, Math.round(130 * nodeScaleFactor)), // 100 → 150px, 120 → 180px (1.5배)
    GUKSA_WIDTH_HOVER: Math.max(159, Math.round(160 * nodeScaleFactor)), // 106 → 159px, 126 → 189px (1.5배)
    GUKSA_HEIGHT: Math.max(52, Math.round(50 * nodeScaleFactor)), // 35 → 52px, 40 → 60px (1.5배)
    GUKSA_HEIGHT_HOVER: Math.max(60, Math.round(55 * nodeScaleFactor)), // 40 → 60px, 44 → 66px (1.5배)

    // 경보 배지 크기 (최소 크기를 1.5배로 증가)
    BADGE_RADIUS: Math.max(12, Math.round(13 * nodeScaleFactor)), // 8 → 12px, 10 → 15px (1.5배)
    BADGE_RADIUS_HOVER: Math.max(15, Math.round(15 * nodeScaleFactor)), // 10 → 15px, 12 → 18px (1.5배)

    // 폰트 크기 (최소 크기를 1.5배로 증가)
    FONT_SIZE: {
      GUKSA: Math.max(21, Math.round(20 * nodeScaleFactor)) + 'px', // 14 → 21px, 16 → 24px (1.5배)
      SECTOR: Math.max(18, Math.round(16 * nodeScaleFactor)) + 'px', // 12 → 18px, 14 → 21px (1.5배)
      LABEL: Math.max(21, Math.round(18 * nodeScaleFactor)) + 'px', // 14 → 21px, 16 → 24px (1.5배)
      BADGE: Math.max(15, Math.round(13 * nodeScaleFactor)) + 'px', // 10 → 15px, 11 → 16px (1.5배)
      BADGE_HOVER: Math.max(16, Math.round(15 * nodeScaleFactor)) + 'px', // 11 → 16px, 12 → 18px (1.5배)
    },

    // 분야별 그룹 간격 (노드 수에 따른 세분화된 조정)
    GROUP_SPACING: calculateGroupSpacing(spacingScaleFactor),

    // 스케일 팩터 정보
    scaleFactor: scaleFactor,
    nodeScaleFactor: nodeScaleFactor,
    spacingScaleFactor: spacingScaleFactor,
    originalScale: scaleFactor,
  };
}

// 노드 수에 따른 그룹 간격 계산 함수
function calculateGroupSpacing(spacingScaleFactor) {
  // 전역 노드 수 정보를 가져오기 (임시로 기본값 사용, 실제로는 setupNodePositions에서 재조정)
  const baseSpacing = 350; // 기본 간격
  return Math.max(250, Math.round(baseSpacing * spacingScaleFactor)); // 최소 250px
}

// ========================================
// 메인 함수들 (기존 구조 유지)
// ========================================

// 토폴로지 맵 생성 함수
function createGuksaTopologyMap(equipData) {
  // 맵 컨테이너 초기화
  const mapContainer = document.getElementById('map-container');
  mapContainer.innerHTML = '';

  // 컨테이너 크기 가져오기
  const containerWidth = mapContainer.clientWidth || GUKSA_MAP_CONFIG.SVG_WIDTH;
  const containerHeight = mapContainer.clientHeight || GUKSA_MAP_CONFIG.SVG_HEIGHT;

  // 화면 크기에 따른 동적 레이아웃 계산
  const dynamicLayout = calculateDynamicLayout(containerWidth, containerHeight);

  // 전역 변수로 저장 (마우스 이벤트에서 사용)
  window.currentDynamicLayout = dynamicLayout;

  console.log('동적 레이아웃 적용:', {
    containerSize: `${containerWidth}x${containerHeight}`,
    scaleFactor: dynamicLayout.scaleFactor,
    nodeRadius: dynamicLayout.NODE_RADIUS,
    groupSpacing: dynamicLayout.GROUP_SPACING,
  });

  // 국사 이름 또는 ID를 확인
  const guksaName = equipData.guksa_name || equipData.guksa_id || '알 수 없는 국사';

  // 노드 및 링크 데이터 준비
  const nodes = [
    { id: guksaName, type: 'guksa', color: COLORS.GUKSA.FILL, borderColor: COLORS.GUKSA.BORDER },
  ];

  const links = [];

  // 분야별 노드와 링크 생성
  const uniqueEquipMap = createEquipNodes(equipData.equip_list);

  // 유니크한 장비 노드 추가 및 링크 생성
  addEquipNodesToMap(uniqueEquipMap, nodes, links, guksaName);

  // 노드가 없으면 메시지 표시 후 종료
  if (nodes.length <= 1) {
    mapContainer.innerHTML =
      '<div class="no-data-message">표시할 장비 토폴로지 데이터가 없습니다.</div>';
    return;
  }

  // SVG 설정 및 생성
  const { svg, container, currentZoom, width, height, zoom } = setupSVG(mapContainer);

  // 제목 추가
  addTitle(mapContainer, guksaName, nodes.length - 1);

  // 줌 컨트롤 패널 추가
  addZoomControlPanel(mapContainer, svg, zoom, width, height);

  // 노드 위치 설정 (동적 레이아웃 적용)
  setupNodePositions(nodes, dynamicLayout);

  // 툴팁 생성
  const tooltip = createTooltip();

  // 힘 시뮬레이션 생성 (동적 레이아웃 적용)
  const simulation = createSimulation(nodes, links, dynamicLayout);

  // 링크 생성
  const link = createLinks(container, links);

  // 노드 생성 (동적 레이아웃 적용)
  const node = createNodes(container, nodes, simulation, tooltip, dynamicLayout);

  // 시뮬레이션 업데이트 함수 설정
  setupSimulation(simulation, nodes, link, node);
}

// 장비 노드 생성 함수 (기존 유지)
function createEquipNodes(equipList) {
  const uniqueEquipMap = new Map();

  // 분야별 카운터
  const sectorCounts = {
    MW: 0,
    선로: 0,
    전송: 0,
    IP: 0,
    무선: 0,
    교환: 0,
  };

  equipList.forEach((equip) => {
    // 장비 이름 없으면 건너뛰기
    if (!equip.equip_name) return;

    // 동일 장비 처리 - 장비명으로 그룹화
    if (uniqueEquipMap.has(equip.equip_name)) {
      // 이미 존재하는 장비면 알람 메시지 추가
      const existingEquip = uniqueEquipMap.get(equip.equip_name);
      if (equip.alarm_message) {
        if (!existingEquip.alarmMessages) {
          existingEquip.alarmMessages = [];
          // 기존 alarmMessage가 있으면 배열의 첫 항목으로 추가
          if (existingEquip.alarmMessage) {
            existingEquip.alarmMessages.push(existingEquip.alarmMessage);
          }
        }
        existingEquip.alarmMessages.push(equip.alarm_message);
      }
    } else {
      // 최초 발견된 장비 처리
      const sector = equip.sector || '알 수 없음';

      // 분야별 카운터 증가
      if (sectorCounts[sector] !== undefined) {
        sectorCounts[sector]++;
      } else {
        sectorCounts[sector] = 1;
      }

      // 분야에 따른 색상 설정
      const colorSet = COLORS.SECTOR[sector] || COLORS.DEFAULT;

      // 새 장비 정보 저장
      const newEquip = {
        id: equip.equip_name,
        type: 'equip',
        sector: sector,
        sectorIndex: sectorCounts[sector],
        alarmMessage: equip.alarm_message || '',
        color: colorSet.FILL,
        borderColor: colorSet.BORDER,
      };

      // 장비 맵에 저장
      uniqueEquipMap.set(equip.equip_name, newEquip);
    }
  });

  return uniqueEquipMap;
}

// 노드와 링크에 장비 추가 (기존 유지)
function addEquipNodesToMap(uniqueEquipMap, nodes, links, guksaName) {
  for (const equip of uniqueEquipMap.values()) {
    nodes.push(equip);

    // 국사와 장비 간 링크 생성
    links.push({
      source: guksaName,
      target: equip.id,
      sector: equip.sector,
    });
  }
}

// SVG 설정 및 생성 (반응형 개선)
function setupSVG(mapContainer) {
  const width = mapContainer.clientWidth || GUKSA_MAP_CONFIG.SVG_WIDTH;
  const height = GUKSA_MAP_CONFIG.SVG_HEIGHT;

  // 고해상도 모니터를 위한 viewBox 최적화
  const viewBoxWidth = Math.max(1400, width); // 최소 1400px 너비 보장
  const viewBoxHeight = height;

  // SVG 생성 - 반응형 설정 개선
  const svg = d3
    .select('#map-container')
    .append('svg')
    .attr('viewBox', `0 0 ${viewBoxWidth} ${viewBoxHeight}`)
    .attr('preserveAspectRatio', 'xMinYMid meet') // xMidYMid → xMinYMid (좌측 정렬)
    .style('width', '100%')
    .style('height', '100%')
    .style('max-width', '100%'); // 최대 너비 제한

  // 줌 동작을 위한 컨테이너 그룹
  const container = svg.append('g');

  // 현재 줌 상태 저장
  let currentZoom = { k: 1, x: 0, y: 0 };

  // 줌 행동 정의
  const zoom = d3
    .zoom()
    .scaleExtent([GUKSA_MAP_CONFIG.ZOOM_MIN_SCALE, GUKSA_MAP_CONFIG.ZOOM_MAX_SCALE])
    .on('zoom', (event) => {
      container.attr('transform', event.transform);
      currentZoom = event.transform;
    });

  // SVG에 줌 기능 적용 (마우스 휠 줌 비활성화)
  svg.call(zoom).on('wheel.zoom', null);

  return { svg, container, currentZoom, width, height, zoom };
}

// 제목 추가 (기존 유지)
function addTitle(mapContainer, guksaName, equipmentCount) {
  const titleDiv = document.createElement('div');
  titleDiv.className = 'map-title';
  titleDiv.textContent = `${guksaName} 경보 장비(${equipmentCount} 대)`;
  mapContainer.appendChild(titleDiv);
}

// 공통 줌 컨트롤 패널 추가 함수 (전역 사용 가능)
function addMapZoomControlPanel(mapContainer, svg, zoom, width, height, options = {}) {
  // 기본 옵션 설정
  const defaultOptions = {
    zoomMinScale: GUKSA_MAP_CONFIG.ZOOM_MIN_SCALE,
    zoomMaxScale: GUKSA_MAP_CONFIG.ZOOM_MAX_SCALE,
    mapPadding: 30, // 패딩 줄임
    nodeMargin: 50,
    position: { top: '10px', right: '10px' },
  };

  const config = { ...defaultOptions, ...options };

  const controlPanel = document.createElement('div');
  controlPanel.className = 'map-control-panel';

  controlPanel.style.marginTop = '-10px';
  controlPanel.style.marginRight = '-10px';
  controlPanel.style.position = 'absolute';
  controlPanel.style.top = config.position.top;
  controlPanel.style.right = config.position.right;
  controlPanel.style.background = 'white';
  controlPanel.style.border = '0px solid #ddd';
  controlPanel.style.borderRadius = '4px';
  controlPanel.style.padding = '1px';
  controlPanel.style.zIndex = '1000';
  controlPanel.style.display = 'flex';
  controlPanel.style.flexDirection = 'row';
  controlPanel.style.gap = '1px';
  controlPanel.style.boxShadow = '0 0px 0px rgba(0,0,0,0.1)';

  // 줌 인 버튼
  const zoomInBtn = document.createElement('button');
  zoomInBtn.textContent = '+';
  zoomInBtn.style.margin = '1px';
  zoomInBtn.style.padding = '4px 0px';
  zoomInBtn.style.cursor = 'pointer';
  zoomInBtn.style.fontSize = '15px';
  zoomInBtn.style.border = '1px solid #ccc';
  zoomInBtn.style.background = '#f8f9fa';
  zoomInBtn.style.borderRadius = '3px';
  zoomInBtn.style.width = '28px';
  zoomInBtn.style.height = '25px';
  zoomInBtn.onclick = () => {
    // svg가 D3 selection인지 DOM 노드인지 확인
    const svgElement = svg.node ? svg.node() : svg;
    const svgSelection = svg.node ? svg : d3.select(svg);

    const currentTransform = d3.zoomTransform(svgElement);
    const newScale = Math.min(currentTransform.k * 1.2, config.zoomMaxScale);

    // 현재 뷰포트의 중앙점
    const centerX = width / 2;
    const centerY = height / 2;

    // 현재 중심점의 월드 좌표 계산
    const worldCenterX = (centerX - currentTransform.x) / currentTransform.k;
    const worldCenterY = (centerY - currentTransform.y) / currentTransform.k;

    // 새로운 변환에서 같은 월드 좌표가 중심에 오도록 계산
    const newX = centerX - worldCenterX * newScale;
    const newY = centerY - worldCenterY * newScale;

    svgSelection
      .transition()
      .duration(300)
      .call(zoom.transform, d3.zoomIdentity.translate(newX, newY).scale(newScale));
  };
  controlPanel.appendChild(zoomInBtn);

  // 줌 아웃 버튼
  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.textContent = '-';
  zoomOutBtn.style.margin = '1px';
  zoomOutBtn.style.padding = '4px 0px';
  zoomOutBtn.style.cursor = 'pointer';
  zoomOutBtn.style.fontSize = '15px';
  zoomOutBtn.style.border = '1px solid #ccc';
  zoomOutBtn.style.background = '#f8f9fa';
  zoomOutBtn.style.borderRadius = '3px';
  zoomOutBtn.style.width = '28px';
  zoomOutBtn.style.height = '25px';
  zoomOutBtn.onclick = () => {
    // svg가 D3 selection인지 DOM 노드인지 확인
    const svgElement = svg.node ? svg.node() : svg;
    const svgSelection = svg.node ? svg : d3.select(svg);

    const currentTransform = d3.zoomTransform(svgElement);
    const newScale = Math.max(currentTransform.k * 0.8, config.zoomMinScale);

    // 현재 뷰포트의 중앙점
    const centerX = width / 2;
    const centerY = height / 2;

    // 현재 중심점의 월드 좌표 계산
    const worldCenterX = (centerX - currentTransform.x) / currentTransform.k;
    const worldCenterY = (centerY - currentTransform.y) / currentTransform.k;

    // 새로운 변환에서 같은 월드 좌표가 중심에 오도록 계산
    const newX = centerX - worldCenterX * newScale;
    const newY = centerY - worldCenterY * newScale;

    svgSelection
      .transition()
      .duration(300)
      .call(zoom.transform, d3.zoomIdentity.translate(newX, newY).scale(newScale));
  };
  controlPanel.appendChild(zoomOutBtn);

  // 중앙으로 이동 + 줌 리셋 버튼
  const fitBtn = document.createElement('button');
  fitBtn.textContent = 'Restore';
  fitBtn.style.marginLeft = '2px';
  fitBtn.style.marginRight = '5px';
  fitBtn.style.marginTop = '1px';
  fitBtn.style.marginBottom = '1px';
  fitBtn.style.width = '70px';
  fitBtn.style.height = '25px';
  fitBtn.style.padding = '4px 4px';
  fitBtn.style.cursor = 'pointer';
  fitBtn.style.fontSize = '12px';
  fitBtn.style.border = '1px solid #ccc';
  fitBtn.style.background = '#f8f9fa';
  fitBtn.onclick = () => {
    // svg가 D3 selection인지 DOM 노드인지 확인
    const svgElement = svg.node ? svg.node() : svg;
    const svgSelection = svg.node ? svg : d3.select(svg);

    // 모든 노드의 범위 계산
    const nodes = svgSelection.selectAll('.node, .equip-node').data();
    if (nodes.length === 0) return;

    let minX = Infinity,
      minY = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity;

    nodes.forEach((d) => {
      const margin = config.nodeMargin;
      minX = Math.min(minX, d.x - margin);
      minY = Math.min(minY, d.y - margin);
      maxX = Math.max(maxX, d.x + margin);
      maxY = Math.max(maxY, d.y + margin);
    });

    // 링크 오프셋 범위도 고려 (장비 토폴로지용)
    if (options.includeLinks && typeof linksData !== 'undefined') {
      linksData.forEach((d) => {
        const offsetX = d.offsetX || 0;
        const offsetY = d.offsetY || 0;

        if (Math.abs(offsetX) > 0 || Math.abs(offsetY) > 0) {
          const sourceX = typeof d.source === 'object' ? d.source.x : _equipmentMap[d.source].x;
          const sourceY = typeof d.source === 'object' ? d.source.y : _equipmentMap[d.source].y;
          const targetX = typeof d.target === 'object' ? d.target.x : _equipmentMap[d.target].x;
          const targetY = typeof d.target === 'object' ? d.target.y : _equipmentMap[d.target].y;

          minX = Math.min(minX, sourceX + offsetX - 20, targetX + offsetX - 20);
          minY = Math.min(minY, sourceY + offsetY - 20, targetY + offsetY - 20);
          maxX = Math.max(maxX, sourceX + offsetX + 20, targetX + offsetX + 20);
          maxY = Math.max(maxY, sourceY + offsetY + 20, targetY + offsetY + 20);
        }
      });
    }

    // 패딩 추가
    const padding = config.mapPadding;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    // 화면에 맞게 스케일과 위치 계산 - 최소 1배율 유지
    const dx = maxX - minX;
    const dy = maxY - minY;
    const scale = Math.min(width / dx, height / dy, 1.0); // 0.5 → 1.0으로 변경하여 최소 1배율 유지
    const tx = (width - scale * (minX + maxX)) / 2;
    const ty = (height - scale * (minY + maxY)) / 2;

    // 변환 적용 (부드러운 전환)
    svgSelection
      .transition()
      .duration(500)
      .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  };
  controlPanel.appendChild(fitBtn);

  mapContainer.appendChild(controlPanel);
}

// 기존 함수는 새로운 공통 함수를 호출하도록 변경
function addZoomControlPanel(mapContainer, svg, zoom, width, height) {
  addMapZoomControlPanel(mapContainer, svg, zoom, width, height, {
    zoomMinScale: GUKSA_MAP_CONFIG.ZOOM_MIN_SCALE,
    zoomMaxScale: GUKSA_MAP_CONFIG.ZOOM_MAX_SCALE,
    nodeMargin: 50,
  });
}

// 범례 추가 (기존 유지)
function addLegend(mapContainer) {
  const legendDiv = document.createElement('div');
  legendDiv.className = 'map-legend';
  legendDiv.style.position = 'absolute';
  legendDiv.style.top = '10px';
  legendDiv.style.right = '10px';
  legendDiv.style.background = 'white';
  legendDiv.style.border = '1px solid #ddd';
  legendDiv.style.borderRadius = '5px';
  legendDiv.style.padding = '10px';
  legendDiv.style.zIndex = '1000';
  legendDiv.style.width = '80px';
  legendDiv.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
  legendDiv.style.fontSize = '12px';

  // 범례 제목
  const legendTitle = document.createElement('div');
  legendTitle.textContent = '분야별 색상';
  legendTitle.style.fontWeight = 'bold';
  legendTitle.style.marginBottom = '8px';
  legendTitle.style.paddingBottom = '5px';
  legendTitle.style.borderBottom = '1px solid #eee';
  legendDiv.appendChild(legendTitle);

  // 범례 항목
  const sectors = [
    { name: '국사', color: COLORS.GUKSA.FILL, borderColor: COLORS.GUKSA.BORDER },
    ...LAYOUT.SECTOR_ORDER.map((sector) => ({
      name: sector,
      color: COLORS.SECTOR[sector].FILL,
      borderColor: COLORS.SECTOR[sector].BORDER,
    })),
  ];

  sectors.forEach((sector) => {
    const legendItem = document.createElement('div');
    legendItem.style.display = 'flex';
    legendItem.style.alignItems = 'center';
    legendItem.style.marginBottom = '5px';

    const colorCircle = document.createElement('div');
    colorCircle.style.width = '12px';
    colorCircle.style.height = '12px';
    colorCircle.style.borderRadius = '50%';
    colorCircle.style.backgroundColor = sector.color;
    colorCircle.style.border = `1.5px solid ${sector.borderColor}`;
    colorCircle.style.marginRight = '8px';

    const sectorName = document.createElement('span');
    sectorName.textContent = sector.name;

    legendItem.appendChild(colorCircle);
    legendItem.appendChild(sectorName);
    legendDiv.appendChild(legendItem);
  });

  mapContainer.appendChild(legendDiv);
}

// ========================================
// 핵심 개선: 노드 위치 설정 함수
// ========================================
function setupNodePositions(nodes, dynamicLayout) {
  // 분야별 노드 그룹화
  const sectorGroups = {};
  let totalEquipCount = 0;

  for (let i = 1; i < nodes.length; i++) {
    const node = nodes[i];
    totalEquipCount++;
    if (!sectorGroups[node.sector]) {
      sectorGroups[node.sector] = [];
    }
    sectorGroups[node.sector].push(node);
  }

  // 국사 노드 위치를 동적으로 계산 - 화면 크기에 관계없이 좌측에 고정
  const mapContainer = document.getElementById('map-container');
  const containerWidth = mapContainer ? mapContainer.clientWidth : GUKSA_MAP_CONFIG.SVG_WIDTH;

  // 국사 노드 X 위치: 컨테이너 너비의 10% 지점에 고정 (최소 100px, 최대 200px)
  const guksaX = Math.max(100, Math.min(200, containerWidth * 0.1));

  // 국사 노드 위치 고정 - 좌측에 안전하게 배치
  nodes[0].fx = guksaX;
  nodes[0].fy = GUKSA_MAP_CONFIG.SVG_HEIGHT / 2; // 세로 중앙

  // 항상 분야별 그룹 배치 사용 (원형 배치 비활성화)
  // 장비가 많아도 그룹핑 유지
  setupSectorGroupPositions(sectorGroups, totalEquipCount, guksaX, dynamicLayout);
}

// 분야별 그룹 위치 설정 (개선된 그룹핑)
function setupSectorGroupPositions(sectorGroups, totalEquipCount, guksaX, dynamicLayout) {
  // 분야 수 계산 (실제 노드가 있는 분야만)
  const activeSectorCount = Object.keys(sectorGroups).length;
  const avgNodesPerSector = totalEquipCount / activeSectorCount;

  // 국사 우측으로 최소 간격 보장 (기본 최소 300px)
  const minGuksaDistance = 250;

  // 분야별 그룹간 최소 간격 보장 (노드간 간격보다 훨씬 크게)
  const minGroupSpacing = Math.max(500, dynamicLayout.NODE_RADIUS * 17); // 400 → 1200px (3배 증가), 12배 → 36배 (3배 증가)

  // 전체 장비 수에 따른 기본 간격 조정 (50개 단위로 세분화)
  let baseSpacing = Math.max(minGroupSpacing, dynamicLayout.GROUP_SPACING);

  // 전체 노드 수에 따른 간격 조정 (50개 단위) - 최소 간격 보장
  if (totalEquipCount <= 50) {
    // 50개 이하: 간격을 줄이되 최소 간격 보장
    baseSpacing = Math.max(minGroupSpacing, dynamicLayout.GROUP_SPACING * 0.8); // 80%로 축소하되 최소값 보장
    console.log(
      `전체 ${totalEquipCount}개 (50개 이하) → 기본 간격: ${baseSpacing}px (최소 ${minGroupSpacing}px 보장)`
    );
  } else if (totalEquipCount <= 100) {
    // 51-100개: 기본 간격
    baseSpacing = Math.max(minGroupSpacing, dynamicLayout.GROUP_SPACING * 1.0);
    console.log(`전체 ${totalEquipCount}개 (51-100개) → 기본 간격: ${baseSpacing}px`);
  } else if (totalEquipCount <= 150) {
    // 101-150개: 약간 증가, 전체 화면에 맞게 조정
    const containerWidth = document.getElementById('map-container')?.clientWidth || 1600;
    const maxSpacing = Math.max(
      minGroupSpacing,
      Math.min(600, (containerWidth / activeSectorCount) * 0.75)
    );
    baseSpacing = Math.min(
      maxSpacing,
      Math.max(minGroupSpacing, dynamicLayout.GROUP_SPACING * 1.3)
    );
    console.log(
      `전체 ${totalEquipCount}개 (101-150개) → 화면 맞춤 간격: ${baseSpacing}px (최대 ${maxSpacing}px 제한)`
    );
  } else if (totalEquipCount <= 200) {
    // 151-200개: 더 큰 간격
    baseSpacing = Math.max(minGroupSpacing, dynamicLayout.GROUP_SPACING * 1.6);
    console.log(`전체 ${totalEquipCount}개 (151-200개) → 간격 증가: ${baseSpacing}px`);
  } else {
    // 200개 초과: 최대 간격
    baseSpacing = Math.max(minGroupSpacing, dynamicLayout.GROUP_SPACING * 2.0);
    console.log(`전체 ${totalEquipCount}개 (200개 초과) → 최대 간격: ${baseSpacing}px`);
  }

  // 150개 이하는 전체 화면에 맞도록 추가 조정하되 최소 간격 보장
  if (totalEquipCount <= 150) {
    const containerWidth = document.getElementById('map-container')?.clientWidth || 1600;

    // 사용 가능한 화면 너비 계산
    const availableWidth = containerWidth - guksaX - minGuksaDistance - 200; // 국사 위치, 최소 거리, 여백 제외
    const requiredWidth = activeSectorCount * baseSpacing;

    if (requiredWidth > availableWidth && availableWidth > 0) {
      // 화면을 초과하면 간격을 줄이되 최소 간격은 보장
      const adjustedSpacing = Math.max(minGroupSpacing, availableWidth / activeSectorCount);
      baseSpacing = adjustedSpacing;
      console.log(
        `화면 맞춤 조정: ${totalEquipCount}개 → 간격 ${baseSpacing}px (화면 너비 ${containerWidth}px에 맞춤, 최소 ${minGroupSpacing}px 보장)`
      );
    }
  }

  // 국사와 장비 간 시작 거리 동적 조정 (최소 거리 보장)
  let startDistance = Math.max(minGuksaDistance, baseSpacing * 0.6);

  if (totalEquipCount <= 50) {
    startDistance = Math.max(minGuksaDistance, baseSpacing * 0.5);
  } else if (totalEquipCount <= 100) {
    startDistance = Math.max(minGuksaDistance, baseSpacing * 0.6);
  } else if (totalEquipCount <= 150) {
    startDistance = Math.max(minGuksaDistance, baseSpacing * 0.7);
  } else {
    startDistance = Math.max(minGuksaDistance, baseSpacing * 0.8);
  }

  console.log(`국사 우측 거리: ${startDistance}px (최소 ${minGuksaDistance}px 보장)`);
  console.log(`분야별 그룹 간격: ${baseSpacing}px (최소 ${minGroupSpacing}px 보장)`);
  console.log(`활성 분야 수: ${activeSectorCount}개`);

  let groupIndex = 0;
  let cumulativeX = guksaX + startDistance; // 누적 X 위치

  // MW, 선로, 전송, IP, 무선, 교환 순서로 그룹 배치 (노드가 있는 분야만)
  LAYOUT.SECTOR_ORDER.forEach((sector) => {
    if (sectorGroups[sector] && sectorGroups[sector].length > 0) {
      const sectorNodes = sectorGroups[sector];
      const nodeCount = sectorNodes.length;

      // 그룹의 X 위치 설정
      const groupBaseX = cumulativeX;

      // 그룹 내 노드들을 원형으로 배치 (격자 대신)
      sectorNodes.forEach((node, nodeIndex) => {
        const groupCenterX = groupBaseX + 100; // 그룹 중심 X
        const groupCenterY = 300; // 그룹 중심 Y (맵 중앙)

        if (sectorNodes.length === 1) {
          // 노드가 1개면 중심에 배치
          node.x = groupCenterX;
          node.y = groupCenterY;
        } else if (sectorNodes.length <= 6) {
          // 노드가 6개 이하면 작은 원형으로 배치
          const radius = 60; // 50 → 60 (조금 더 크게)
          const angle = (nodeIndex / sectorNodes.length) * 2 * Math.PI;
          node.x = groupCenterX + radius * Math.cos(angle);
          node.y = groupCenterY + radius * Math.sin(angle);
        } else if (sectorNodes.length <= 15) {
          // 노드가 15개 이하면 중간 원형으로 배치
          const radius = 90; // 80 → 90 (조금 더 크게)
          const angle = (nodeIndex / sectorNodes.length) * 2 * Math.PI;
          node.x = groupCenterX + radius * Math.cos(angle);
          node.y = groupCenterY + radius * Math.sin(angle);
        } else {
          // 노드가 많으면 이중 원형으로 배치
          const innerRadius = 70; // 60 → 70 (조금 더 크게)
          const outerRadius = 140; // 120 → 140 (조금 더 크게)
          const innerCount = Math.min(8, Math.floor(sectorNodes.length / 2));

          if (nodeIndex < innerCount) {
            // 내부 원
            const angle = (nodeIndex / innerCount) * 2 * Math.PI;
            node.x = groupCenterX + innerRadius * Math.cos(angle);
            node.y = groupCenterY + innerRadius * Math.sin(angle);
          } else {
            // 외부 원
            const outerIndex = nodeIndex - innerCount;
            const outerCount = sectorNodes.length - innerCount;
            const angle = (outerIndex / outerCount) * 2 * Math.PI;
            node.x = groupCenterX + outerRadius * Math.cos(angle);
            node.y = groupCenterY + outerRadius * Math.sin(angle);
          }
        }

        // 힘 시뮬레이션을 위한 목표 위치 저장
        node.targetX = node.x;
        node.targetY = node.y;

        // 그룹 정보 추가
        node.groupIndex = groupIndex;
        node.sector = sector;
        node.groupCenterX = groupCenterX; // 그룹 중심 저장
        node.groupCenterY = groupCenterY;
      });

      console.log(
        `그룹 ${groupIndex} [${sector}]: ${sectorNodes.length}개 노드, X위치: ${groupBaseX}, 다음 그룹까지 거리: ${baseSpacing}px`
      );

      // 다음 그룹을 위한 누적 X 위치 업데이트 (최소 간격 보장)
      cumulativeX += baseSpacing;
      groupIndex++;
    }
  });

  console.log(
    `총 맵 너비: ${cumulativeX - guksaX}px, 마지막 그룹 X위치: ${cumulativeX - baseSpacing}px`
  );
}

// 툴팁 생성 (기존 유지)
function createTooltip() {
  return d3
    .select('body')
    .append('div')
    .attr('class', 'map-tooltip')
    .style('opacity', 0)
    .style('position', 'absolute')
    .style('background-color', 'white')
    .style('border', '1px solid #ddd')
    .style('border-radius', '4px')
    .style('padding', '8px')
    .style('pointer-events', 'none')
    .style('font-size', '12px')
    .style('z-index', 10)
    .style('max-width', '350px')
    .style('overflow-y', 'auto')
    .style('scrollbar-width', 'thin')
    .style('scrollbar-color', '#ccc #f1f1f1')
    .style('max-height', '300px');
}

// 장비가 많을 때 사용할 원형 배치 함수 (기존 구조 유지)
function setupCircularLayout(nodes, sectorGroups, totalEquipCount) {
  nodes[0].fx = LAYOUT.LEFT_MARGIN;
  nodes[0].fy = LAYOUT.TOP_MARGIN;

  const radius = Math.min(200, 120 + totalEquipCount * 0.5);
  const centerX = LAYOUT.LEFT_MARGIN + 400;
  const centerY = LAYOUT.TOP_MARGIN + 150;

  let angleIndex = 0;
  const totalNodes = totalEquipCount;

  LAYOUT.SECTOR_ORDER.forEach((sector) => {
    if (sectorGroups[sector] && sectorGroups[sector].length > 0) {
      const sectorNodes = sectorGroups[sector];

      sectorNodes.forEach((node) => {
        const angle = (angleIndex / totalNodes) * 2 * Math.PI;
        node.x = centerX + radius * Math.cos(angle);
        node.y = centerY + radius * Math.sin(angle);
        angleIndex++;
      });
    }
  });
}

// 힘 시뮬레이션 생성 (그룹 유지 강화)
function createSimulation(nodes, links, dynamicLayout) {
  const simulation = d3
    .forceSimulation(nodes)
    .force(
      'link',
      d3
        .forceLink(links)
        .id((d) => d.id)
        .distance(() => FORCE.LINK_DISTANCE)
    )
    .force('charge', d3.forceManyBody().strength(FORCE.CHARGE_STRENGTH))
    .force(
      'x',
      d3
        .forceX()
        .x((d) => {
          if (d.type === 'guksa') return LAYOUT.GUKSA_X; // 상수 사용
          // 동적으로 계산된 목표 X 위치 사용
          if (d.targetX !== undefined) {
            return d.targetX;
          }
          // 그룹별 X 위치 유지 (fallback)
          if (d.groupIndex !== undefined) {
            const startDistance = Math.max(
              GUKSA_MAP_CONFIG.GUKSA_TO_EQUIP_MIN,
              GUKSA_MAP_CONFIG.GUKSA_TO_EQUIP_MAX
            );
            return (
              LAYOUT.GUKSA_X + startDistance + d.groupIndex * dynamicLayout.GROUP_SPACING // 상수 사용
            );
          }
          return LAYOUT.GUKSA_X + 600; // 상수 사용
        })
        .strength(1.0) // X 위치 유지 강도 감소 (2.0 → 1.0, 애니메이션 안정화)
    )
    .force(
      'y',
      d3
        .forceY()
        .y((d) => {
          if (d.type === 'guksa') return LAYOUT.GUKSA_Y; // 상수 사용
          // 동적으로 계산된 목표 Y 위치 사용
          if (d.targetY !== undefined) {
            return d.targetY;
          }
          return 80 + 200; // 기본 Y 위치도 조정
        })
        .strength(0.4) // Y 위치 강도 감소 (0.8 → 0.4, 애니메이션 안정화)
    )
    .force('collide', d3.forceCollide().radius(dynamicLayout.NODE_RADIUS * 1.8)) // 충돌 반지름을 노드 크기에 맞게 증가 (30 → NODE_RADIUS * 1.8)
    .alphaDecay(FORCE.ALPHA_DECAY)
    .alpha(FORCE.ALPHA);

  // 분야별 그룹 응집력 추가 (원형 배치에 맞게 조정)
  simulation.force('sector-group', () => {
    const alpha = simulation.alpha();

    nodes.forEach((d) => {
      if (d.type === 'equip' && d.groupCenterX !== undefined && d.groupCenterY !== undefined) {
        // 그룹 중심으로 약하게 끌어당기기 (원형 유지)
        const dx = d.groupCenterX - d.x;
        const dy = d.groupCenterY - d.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // 그룹 중심에서 너무 멀어지지 않도록 제한 (반지름 증가)
        const maxDistance = 200; // 150 → 200으로 증가
        if (distance > maxDistance) {
          const strength = 0.08 * alpha; // 0.05 → 0.08로 증가 (더 강한 응집력)
          d.vx += (dx / distance) * strength;
          d.vy += (dy / distance) * strength;
        }

        // 그룹 내 적당한 거리 유지 (너무 가까워지지 않도록)
        const minDistance = dynamicLayout.NODE_RADIUS * 2.5; // 노드 반지름의 2.5배 최소 거리
        if (distance < minDistance && distance > 0) {
          const strength = 0.02 * alpha; // 약한 밀어내는 힘
          d.vx -= (dx / distance) * strength;
          d.vy -= (dy / distance) * strength;
        }
      }
    });
  });

  // 분야별 그룹 간 분리 강화 (간격 증가에 맞게 조정)
  simulation.force('sector-separation', () => {
    const alpha = simulation.alpha();

    nodes.forEach((d, i) => {
      if (d.type === 'equip') {
        nodes.forEach((other, j) => {
          if (i !== j && other.type === 'equip' && d.sector !== other.sector) {
            // 다른 분야 노드와의 거리 계산
            const dx = other.x - d.x;
            const dy = other.y - d.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // 분야별 최소 분리 거리 설정 (그룹 간격에 맞춰 대폭 증가)
            const minSeparation = Math.max(180, dynamicLayout.NODE_RADIUS * 6); // 120 → 180px, 노드 반지름의 6배

            if (distance < minSeparation && distance > 0) {
              // 서로 밀어내는 힘 적용 (강도 증가)
              const force = ((minSeparation - distance) / distance) * alpha * 0.15; // 0.05 → 0.15로 증가 (3배 강화)
              const fx = dx * force;
              const fy = dy * force;

              d.vx -= fx;
              d.vy -= fy;
              other.vx += fx;
              other.vy += fy;
            }
          }
        });
      }
    });
  });

  // 시뮬레이션이 안정화되면 노드 고정 해제 (드래그 가능하도록)
  simulation.on('tick', () => {
    if (simulation.alpha() < 0.05) {
      // 시뮬레이션이 거의 안정화되면 고정 해제
      nodes.forEach((d) => {
        if (d.type === 'equip') {
          d.fx = null;
          d.fy = null;
        }
      });
    }
  });

  return simulation;
}

// 링크 생성 (기존 유지)
function createLinks(container, links) {
  return container
    .append('g')
    .selectAll('line')
    .data(links)
    .enter()
    .append('line')
    .attr('stroke', (d) => {
      return d.sector && COLORS.SECTOR[d.sector]
        ? COLORS.SECTOR[d.sector].FILL
        : COLORS.DEFAULT.FILL;
    })
    .attr('stroke-opacity', STYLE.LINK_OPACITY)
    .attr('stroke-width', STYLE.LINK_STROKE_WIDTH);
}

// 노드 생성 (기존 유지)
function createNodes(container, nodes, simulation, tooltip, dynamicLayout) {
  const node = container
    .append('g')
    .selectAll('g')
    .data(nodes)
    .enter()
    .append('g')
    .attr('class', (d) => `node ${d.type === 'guksa' ? 'node-guksa' : `node-${d.sector}`}`)
    .call(
      d3
        .drag()
        .on('start', (event, d) => dragstarted(event, d, simulation))
        .on('drag', dragged)
        .on('end', (event, d) => dragended(event, d, simulation))
    );

  // 노드 형태 추가 (국사: 사각형, 장비: 원)
  node.each(function (d) {
    const selection = d3.select(this);

    if (d.type === 'guksa') {
      selection
        .append('rect')
        .attr('width', dynamicLayout.GUKSA_WIDTH)
        .attr('height', dynamicLayout.GUKSA_HEIGHT)
        .attr('x', -dynamicLayout.GUKSA_WIDTH / 2)
        .attr('y', -dynamicLayout.GUKSA_HEIGHT / 2)
        .attr('rx', 5)
        .attr('ry', 5)
        .attr('fill', d.color)
        .attr('stroke', d.borderColor)
        .attr('stroke-width', STYLE.NODE_STROKE_WIDTH);
    } else {
      selection
        .append('circle')
        .attr('r', dynamicLayout.NODE_RADIUS)
        .attr('fill', d.color)
        .attr('stroke', d.borderColor)
        .attr('stroke-width', STYLE.NODE_STROKE_WIDTH);
    }
  });

  // 경보 개수 표시 배지 추가
  node
    .filter((d) => d.type === 'equip' && d.alarmMessages && d.alarmMessages.length > 1)
    .append('circle')
    .attr('class', 'alarm-badge-guksa')
    .attr('cx', (d) => {
      // 노드 크기에 맞춰 배지 위치 조정 (노드 우상단에 적절히 겹치도록)
      const nodeRadius = dynamicLayout.NODE_RADIUS;
      return nodeRadius * 0.7; // 노드 반지름의 70% 지점
    })
    .attr('cy', (d) => {
      // 노드 크기에 맞춰 배지 위치 조정 (노드 우상단에 적절히 겹치도록)
      const nodeRadius = dynamicLayout.NODE_RADIUS;
      return -nodeRadius * 0.7; // 노드 반지름의 70% 지점 (위쪽)
    })
    .attr('r', dynamicLayout.BADGE_RADIUS)
    .attr('fill', '#f7f7f7')
    .attr('stroke', 'white')
    .attr('stroke-width', 1.5);

  // 경보 개수 텍스트 추가
  node
    .filter((d) => d.type === 'equip' && d.alarmMessages && d.alarmMessages.length > 1)
    .append('text')
    .attr('class', 'alarm-count-guksa')
    .attr('x', (d) => {
      // 배지와 동일한 위치
      const nodeRadius = dynamicLayout.NODE_RADIUS;
      return nodeRadius * 0.7;
    })
    .attr('y', (d) => {
      // 배지와 동일한 위치 (약간 아래로 조정하여 중앙 정렬)
      const nodeRadius = dynamicLayout.NODE_RADIUS;
      return -nodeRadius * 0.7 + 1;
    })
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('fill', 'black')
    .attr('font-size', dynamicLayout.FONT_SIZE.BADGE)
    .attr('font-weight', 'bold')
    .text((d) => d.alarmMessages.length);

  // 노드 내부 텍스트 추가
  node
    .append('text')
    .text((d) => {
      if (d.type === 'guksa') return d.id.substring(0, 5);
      return d.sector;
    })
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('fill', 'white')
    .attr('font-size', (d) =>
      d.type === 'guksa' ? dynamicLayout.FONT_SIZE.GUKSA : dynamicLayout.FONT_SIZE.SECTOR
    )
    .attr('font-weight', 'bold');

  // 노드 아래 라벨 추가
  node
    .append('text')
    .text((d) => {
      if (d.type === 'guksa') return '';
      const maxLength = 15;
      return d.id.length > maxLength ? d.id.slice(0, maxLength) + '...' : d.id;
    })
    .attr('text-anchor', 'middle')
    .attr('x', 0)
    .attr('y', (d) => (d.type === 'guksa' ? 72 : 40))
    .attr('font-size', dynamicLayout.FONT_SIZE.LABEL)
    .attr('fill', '#333');

  // 국사 노드 위에 "국사" 라벨 추가
  node
    .filter((d) => d.type === 'guksa')
    .append('text')
    .text('국사')
    .attr('text-anchor', 'middle')
    .attr('x', 0)
    .attr('y', -45)
    .attr('font-size', dynamicLayout.FONT_SIZE.LABEL)
    .attr('font-weight', 'bold')
    .attr('fill', '#333');

  // 마우스 이벤트 추가
  node
    .on('mouseover', function (event, d) {
      handleMouseOver(this, event, d, tooltip);
    })
    .on('mouseout', function (event, d) {
      handleMouseOut(this, tooltip);
    });

  return node;
}

// 마우스 오버 처리 (기존 유지)
function handleMouseOver(element, event, d, tooltip) {
  // 전역 동적 레이아웃 사용 (기본값 설정)
  const layout = window.currentDynamicLayout || {
    GUKSA_WIDTH_HOVER: LAYOUT.GUKSA_WIDTH_HOVER,
    GUKSA_HEIGHT_HOVER: LAYOUT.GUKSA_HEIGHT_HOVER,
    NODE_RADIUS_HOVER: LAYOUT.NODE_RADIUS_HOVER,
    BADGE_RADIUS_HOVER: LAYOUT.BADGE_RADIUS_HOVER,
    FONT_SIZE: STYLE.FONT_SIZE,
  };

  let tooltipContent = '';

  if (d.type === 'guksa') {
    tooltipContent = `<strong>국사:</strong> ${d.id}<br><strong>장비 수:</strong> ${
      d.nodeCount || '알 수 없음'
    }`;
  } else {
    tooltipContent = `
      <strong>장비:</strong> ${d.id}<br>
      <strong>분야:</strong> ${d.sector}<br>
    `;

    if (d.alarmMessages && d.alarmMessages.length > 0) {
      tooltipContent += `<strong>경보 (${d.alarmMessages.length}개):</strong><br>`;
      tooltipContent += '<ul style="margin: 2px 0; padding-left: 15px; list-style-type: disc;">';
      d.alarmMessages.forEach((msg, index) => {
        tooltipContent += `<li style="margin-bottom: 3px;">${index + 1}. ${msg}</li>`;
      });
      tooltipContent += '</ul>';
    } else if (d.alarmMessage) {
      tooltipContent += `<strong>경보:</strong> ${d.alarmMessage}`;
    }
  }

  tooltip
    .html(tooltipContent)
    .style('left', event.pageX + 10 + 'px')
    .style('top', event.pageY - 28 + 'px')
    .transition()
    .duration(200)
    .style('opacity', 0.9);

  // 마우스 오버 시 강조 효과
  if (d.type === 'guksa') {
    d3.select(element)
      .select('rect')
      .transition()
      .duration(200)
      .attr('width', layout.GUKSA_WIDTH_HOVER)
      .attr('height', layout.GUKSA_HEIGHT_HOVER)
      .attr('x', -layout.GUKSA_WIDTH_HOVER / 2)
      .attr('y', -layout.GUKSA_HEIGHT_HOVER / 2);
  } else {
    d3.select(element)
      .select('circle')
      .transition()
      .duration(200)
      .attr('r', layout.NODE_RADIUS_HOVER);
  }

  // 경보 배지 크기 조정
  d3.select(element)
    .select('.alarm-badge-guksa')
    .transition()
    .duration(200)
    .attr('r', layout.BADGE_RADIUS_HOVER)
    .attr('cx', (d) => {
      // 호버 시에도 노드 크기에 맞춰 위치 조정
      const nodeRadius = layout.NODE_RADIUS_HOVER || layout.NODE_RADIUS;
      return nodeRadius * 0.7;
    })
    .attr('cy', (d) => {
      // 호버 시에도 노드 크기에 맞춰 위치 조정
      const nodeRadius = layout.NODE_RADIUS_HOVER || layout.NODE_RADIUS;
      return -nodeRadius * 0.7;
    });

  d3.select(element)
    .select('.alarm-count-guksa')
    .transition()
    .duration(200)
    .attr('x', (d) => {
      // 호버 시에도 배지와 동일한 위치
      const nodeRadius = layout.NODE_RADIUS_HOVER || layout.NODE_RADIUS;
      return nodeRadius * 0.7;
    })
    .attr('y', (d) => {
      // 호버 시에도 배지와 동일한 위치
      const nodeRadius = layout.NODE_RADIUS_HOVER || layout.NODE_RADIUS;
      return -nodeRadius * 0.7 + 1;
    })
    .attr('font-size', layout.FONT_SIZE.BADGE_HOVER);
}

// 마우스 아웃 처리 (기존 유지)
function handleMouseOut(element, tooltip) {
  // 전역 동적 레이아웃 사용 (기본값 설정)
  const layout = window.currentDynamicLayout || {
    GUKSA_WIDTH: LAYOUT.GUKSA_WIDTH,
    GUKSA_HEIGHT: LAYOUT.GUKSA_HEIGHT,
    NODE_RADIUS: LAYOUT.NODE_RADIUS,
    BADGE_RADIUS: LAYOUT.BADGE_RADIUS,
    FONT_SIZE: STYLE.FONT_SIZE,
  };

  tooltip.transition().duration(500).style('opacity', 0);

  d3.select(element)
    .select('rect')
    .transition()
    .duration(200)
    .attr('width', layout.GUKSA_WIDTH)
    .attr('height', layout.GUKSA_HEIGHT)
    .attr('x', -layout.GUKSA_WIDTH / 2)
    .attr('y', -layout.GUKSA_HEIGHT / 2);

  d3.select(element).select('circle').transition().duration(200).attr('r', layout.NODE_RADIUS);

  d3.select(element)
    .select('.alarm-badge-guksa')
    .transition()
    .duration(200)
    .attr('r', layout.BADGE_RADIUS)
    .attr('cx', (d) => {
      // 일반 상태에서도 노드 크기에 맞춰 위치 조정
      const nodeRadius = layout.NODE_RADIUS;
      return nodeRadius * 0.7;
    })
    .attr('cy', (d) => {
      // 일반 상태에서도 노드 크기에 맞춰 위치 조정
      const nodeRadius = layout.NODE_RADIUS;
      return -nodeRadius * 0.7;
    });

  d3.select(element)
    .select('.alarm-count-guksa')
    .transition()
    .duration(200)
    .attr('x', (d) => {
      // 일반 상태에서도 배지와 동일한 위치
      const nodeRadius = layout.NODE_RADIUS;
      return nodeRadius * 0.7;
    })
    .attr('y', (d) => {
      // 일반 상태에서도 배지와 동일한 위치
      const nodeRadius = layout.NODE_RADIUS;
      return -nodeRadius * 0.7 + 1;
    })
    .attr('font-size', layout.FONT_SIZE.BADGE);
}

// 시뮬레이션 설정 (경계 개선)
function setupSimulation(simulation, nodes, link, node) {
  simulation.on('tick', () => {
    // 노드 위치 제한 (화면 벗어나지 않도록)
    nodes.forEach((d) => {
      if (d.type !== 'guksa') {
        d.x = Math.max(
          GUKSA_MAP_CONFIG.BOUNDARY_MARGIN,
          Math.min(GUKSA_MAP_CONFIG.SVG_WIDTH - GUKSA_MAP_CONFIG.BOUNDARY_MARGIN, d.x)
        );
        d.y = Math.max(
          GUKSA_MAP_CONFIG.BOUNDARY_MARGIN,
          Math.min(GUKSA_MAP_CONFIG.SVG_HEIGHT - GUKSA_MAP_CONFIG.BOUNDARY_MARGIN, d.y)
        );
      }
    });

    link
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y);

    node.attr('transform', (d) => `translate(${d.x},${d.y})`);
  });
}

// 드래그 시작 함수 (기존 유지)
function dragstarted(event, d, simulation) {
  if (!event.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x;
  d.fy = d.y;
}

// 드래그 중 함수 (기존 유지)
function dragged(event, d) {
  d.fx = event.x;
  d.fy = event.y;
}

// 드래그 종료 함수 (기존 유지)
function dragended(event, d, simulation) {
  if (!event.active) simulation.alphaTarget(0);
  d.fx = d.x;
  d.fy = d.y;
}

// 전역 함수 등록
window.createGuksaTopologyMap = createGuksaTopologyMap;
window.addMapZoomControlPanel = addMapZoomControlPanel;
window.GUKSA_MAP_CONFIG = GUKSA_MAP_CONFIG;
window.COLORS = COLORS;
