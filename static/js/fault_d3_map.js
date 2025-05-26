// 간격 및 배치 관련 상수 정의
const SPACING_CONFIG = {
  // 국사-장비 간 기본 간격 (더 줄임)
  GUKSA_TO_EQUIP_MIN: 50, // 300 → 200 (더 가깝게)
  GUKSA_TO_EQUIP_MAX: 150, // 600 → 400 (더 가깝게)
  GUKSA_TO_EQUIP_MULTIPLIER: 5, // 8 → 5 (증가율도 줄임)

  // 분야별 그룹 간격
  GROUP_BASE_WIDTH: 250,
  GROUP_SPACING: 250,

  // 그룹 내 노드 간격
  NODE_VERTICAL_SPACING: 100,
  NODE_HORIZONTAL_SPACING: 120,
  NODES_PER_COLUMN: 8,

  // SVG 크기
  SVG_WIDTH: 1400, // 1600 → 1400 (폭도 조금 줄임)
  SVG_HEIGHT: 600,

  // 경계 설정
  BOUNDARY_MARGIN: 30,
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

  NODE_RADIUS: 16,
  NODE_RADIUS_HOVER: 19,

  GUKSA_WIDTH: 100,
  GUKSA_WIDTH_HOVER: 105,

  GUKSA_HEIGHT: 35,
  GUKSA_HEIGHT_HOVER: 38,

  BADGE_RADIUS: 9,
  BADGE_RADIUS_HOVER: 11,

  SECTOR_SPACING: 800,
  SECTOR_ORDER: ['MW', '선로', '전송', 'IP', '무선', '교환'],
};

const STYLE = {
  NODE_STROKE_WIDTH: 2.5,
  LINK_STROKE_WIDTH: 2,
  LINK_OPACITY: 0.6,

  FONT_SIZE: {
    GUKSA: '13px',
    SECTOR: '12px',
    LABEL: '11px',
    BADGE: '9px',
    BADGE_HOVER: '10px',
  },
};

const FORCE = {
  LINK_DISTANCE: 100,
  CHARGE_STRENGTH: -30,
  X_STRENGTH: 1.5,
  Y_STRENGTH: 0.5,
  COLLIDE_RADIUS: 18,
  ALPHA_DECAY: 0.05,
  ALPHA: 0.3,
};

// ========================================
// 메인 함수들 (기존 구조 유지)
// ========================================

// 토폴로지 맵 생성 함수
function createGuksaTopologyMap(equipData) {
  // 맵 컨테이너 초기화
  const mapContainer = document.getElementById('map-container');
  mapContainer.innerHTML = '';

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
  const { svg, container, currentZoom } = setupSVG(mapContainer);

  // 제목 추가
  addTitle(mapContainer, guksaName, nodes.length - 1);

  // 범례 추가
  // addLegend(mapContainer); // 범례는 일단 제거

  // 노드 위치 설정 (개선된 함수 사용)
  setupNodePositions(nodes);

  // 툴팁 생성
  const tooltip = createTooltip();

  // 힘 시뮬레이션 생성
  const simulation = createSimulation(nodes, links);

  // 링크 생성
  const link = createLinks(container, links);

  // 노드 생성
  const node = createNodes(container, nodes, simulation, tooltip);

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

// SVG 설정 및 생성 (크기 개선)
function setupSVG(mapContainer) {
  const width = mapContainer.clientWidth || SPACING_CONFIG.SVG_WIDTH;
  const height = SPACING_CONFIG.SVG_HEIGHT;

  // SVG 생성
  const svg = d3
    .select('#map-container')
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', [0, 0, width, height])
    .attr('style', 'max-width: 100%; height: auto;');

  // 줌 동작을 위한 컨테이너 그룹
  const container = svg.append('g');

  // 현재 줌 상태 저장
  let currentZoom = { k: 1, x: 0, y: 0 };

  // 줌 행동 정의
  const zoom = d3
    .zoom()
    .scaleExtent([0.5, 3])
    .on('zoom', (event) => {
      container.attr('transform', event.transform);
      currentZoom = event.transform;
    });

  // SVG에 줌 기능 적용
  svg.call(zoom);

  return { svg, container, currentZoom, width, height };
}

// 제목 추가 (기존 유지)
function addTitle(mapContainer, guksaName, equipmentCount) {
  const titleDiv = document.createElement('div');
  titleDiv.className = 'map-title';
  titleDiv.textContent = `${guksaName} 경보 장비(${equipmentCount} 대)`;
  mapContainer.appendChild(titleDiv);
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
function setupNodePositions(nodes) {
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

  // 국사 노드 위치 고정
  nodes[0].fx = LAYOUT.LEFT_MARGIN;
  nodes[0].fy = LAYOUT.TOP_MARGIN;

  // 항상 분야별 그룹 배치 사용 (원형 배치 비활성화)
  // 장비가 많아도 그룹핑 유지
  setupSectorGroupPositions(sectorGroups, totalEquipCount);
}

// 분야별 그룹 위치 설정 (개선된 그룹핑)
function setupSectorGroupPositions(sectorGroups, totalEquipCount) {
  // 장비 수에 따라 동적으로 시작 거리 조정
  let startDistance;

  if (totalEquipCount <= 50) {
    // 장비가 적으면 가까이 배치
    startDistance = SPACING_CONFIG.GUKSA_TO_EQUIP_MIN;
  } else if (totalEquipCount <= 150) {
    // 중간 정도면 적당히 배치
    startDistance =
      SPACING_CONFIG.GUKSA_TO_EQUIP_MIN +
      (totalEquipCount - 50) * (SPACING_CONFIG.GUKSA_TO_EQUIP_MULTIPLIER / 2);
  } else {
    // 장비가 많으면 더 멀리 배치
    startDistance = Math.min(
      SPACING_CONFIG.GUKSA_TO_EQUIP_MAX,
      SPACING_CONFIG.GUKSA_TO_EQUIP_MIN + totalEquipCount * SPACING_CONFIG.GUKSA_TO_EQUIP_MULTIPLIER
    );
  }

  let groupIndex = 0;

  // MW, 선로, 전송, IP, 무선, 교환 순서로 그룹 배치
  LAYOUT.SECTOR_ORDER.forEach((sector) => {
    if (sectorGroups[sector] && sectorGroups[sector].length > 0) {
      const sectorNodes = sectorGroups[sector];

      // 그룹의 기본 X 위치 계산
      const groupBaseX =
        LAYOUT.LEFT_MARGIN + startDistance + groupIndex * SPACING_CONFIG.GROUP_SPACING;

      // 그룹 내 노드들을 격자 형태로 배치
      sectorNodes.forEach((node, nodeIndex) => {
        // 열과 행 계산
        const column = Math.floor(nodeIndex / SPACING_CONFIG.NODES_PER_COLUMN);
        const row = nodeIndex % SPACING_CONFIG.NODES_PER_COLUMN;

        // 노드 위치 설정
        node.x = groupBaseX + column * SPACING_CONFIG.NODE_HORIZONTAL_SPACING;
        node.y = LAYOUT.TOP_MARGIN + row * SPACING_CONFIG.NODE_VERTICAL_SPACING;

        // 그룹 정보 추가
        node.groupIndex = groupIndex;
        node.sector = sector;
      });

      console.log(
        `그룹 ${groupIndex} [${sector}]: ${sectorNodes.length}개 노드, X위치: ${groupBaseX}`
      );
      groupIndex++;
    }
  });
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
function createSimulation(nodes, links) {
  return d3
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
          if (d.type === 'guksa') return LAYOUT.LEFT_MARGIN;
          // 그룹별 X 위치 유지
          if (d.groupIndex !== undefined) {
            const startDistance = Math.max(
              SPACING_CONFIG.GUKSA_TO_EQUIP_MIN,
              SPACING_CONFIG.GUKSA_TO_EQUIP_MAX
            );
            return LAYOUT.LEFT_MARGIN + startDistance + d.groupIndex * SPACING_CONFIG.GROUP_SPACING;
          }
          return LAYOUT.LEFT_MARGIN + 600; // 기본값
        })
        .strength(1.8) // X 위치 유지 강도 증가
    )
    .force(
      'y',
      d3
        .forceY()
        .y((d) => {
          if (d.type === 'guksa') return LAYOUT.TOP_MARGIN;
          return LAYOUT.TOP_MARGIN + 200; // 기본 Y 위치
        })
        .strength(0.3) // Y 위치는 더 자유롭게
    )
    .force('collide', d3.forceCollide().radius(FORCE.COLLIDE_RADIUS))
    .alphaDecay(FORCE.ALPHA_DECAY)
    .alpha(FORCE.ALPHA);
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
function createNodes(container, nodes, simulation, tooltip) {
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
        .attr('width', LAYOUT.GUKSA_WIDTH)
        .attr('height', LAYOUT.GUKSA_HEIGHT)
        .attr('x', -LAYOUT.GUKSA_WIDTH / 2)
        .attr('y', -LAYOUT.GUKSA_HEIGHT / 2)
        .attr('rx', 5)
        .attr('ry', 5)
        .attr('fill', d.color)
        .attr('stroke', d.borderColor)
        .attr('stroke-width', STYLE.NODE_STROKE_WIDTH);
    } else {
      selection
        .append('circle')
        .attr('r', LAYOUT.NODE_RADIUS)
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
    .attr('cx', 12)
    .attr('cy', -12)
    .attr('r', LAYOUT.BADGE_RADIUS)
    .attr('fill', '#f7f7f7')
    .attr('stroke', 'white')
    .attr('stroke-width', 1.5);

  // 경보 개수 텍스트 추가
  node
    .filter((d) => d.type === 'equip' && d.alarmMessages && d.alarmMessages.length > 1)
    .append('text')
    .attr('class', 'alarm-count-guksa')
    .attr('x', 12)
    .attr('y', -11)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('fill', 'black')
    .attr('font-size', STYLE.FONT_SIZE.BADGE)
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
    .attr('font-size', (d) => (d.type === 'guksa' ? STYLE.FONT_SIZE.GUKSA : STYLE.FONT_SIZE.SECTOR))
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
    .attr('y', (d) => (d.type === 'guksa' ? 40 : 25))
    .attr('font-size', STYLE.FONT_SIZE.LABEL)
    .attr('fill', '#333');

  // 국사 노드 위에 "국사" 라벨 추가
  node
    .filter((d) => d.type === 'guksa')
    .append('text')
    .text('국사')
    .attr('text-anchor', 'middle')
    .attr('x', 0)
    .attr('y', -25)
    .attr('font-size', STYLE.FONT_SIZE.LABEL)
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
      .attr('width', LAYOUT.GUKSA_WIDTH_HOVER)
      .attr('height', LAYOUT.GUKSA_HEIGHT_HOVER)
      .attr('x', -LAYOUT.GUKSA_WIDTH_HOVER / 2)
      .attr('y', -LAYOUT.GUKSA_HEIGHT_HOVER / 2);
  } else {
    d3.select(element)
      .select('circle')
      .transition()
      .duration(200)
      .attr('r', LAYOUT.NODE_RADIUS_HOVER);
  }

  // 경보 배지 크기 조정
  d3.select(element)
    .select('.alarm-badge-guksa')
    .transition()
    .duration(200)
    .attr('r', LAYOUT.BADGE_RADIUS_HOVER)
    .attr('cx', 15)
    .attr('cy', -15);

  d3.select(element)
    .select('.alarm-count-guksa')
    .transition()
    .duration(200)
    .attr('x', 15)
    .attr('y', -13)
    .attr('font-size', STYLE.FONT_SIZE.BADGE_HOVER);
}

// 마우스 아웃 처리 (기존 유지)
function handleMouseOut(element, tooltip) {
  tooltip.transition().duration(500).style('opacity', 0);

  d3.select(element)
    .select('rect')
    .transition()
    .duration(200)
    .attr('width', LAYOUT.GUKSA_WIDTH)
    .attr('height', LAYOUT.GUKSA_HEIGHT)
    .attr('x', -LAYOUT.GUKSA_WIDTH / 2)
    .attr('y', -LAYOUT.GUKSA_HEIGHT / 2);

  d3.select(element).select('circle').transition().duration(200).attr('r', LAYOUT.NODE_RADIUS);

  d3.select(element)
    .select('.alarm-badge-guksa')
    .transition()
    .duration(200)
    .attr('r', LAYOUT.BADGE_RADIUS)
    .attr('cx', 12)
    .attr('cy', -12);

  d3.select(element)
    .select('.alarm-count-guksa')
    .transition()
    .duration(200)
    .attr('x', 12)
    .attr('y', -10)
    .attr('font-size', STYLE.FONT_SIZE.BADGE);
}

// 시뮬레이션 설정 (경계 개선)
function setupSimulation(simulation, nodes, link, node) {
  simulation.on('tick', () => {
    // 노드 위치 제한 (화면 벗어나지 않도록)
    nodes.forEach((d) => {
      if (d.type !== 'guksa') {
        d.x = Math.max(
          SPACING_CONFIG.BOUNDARY_MARGIN,
          Math.min(SPACING_CONFIG.SVG_WIDTH - SPACING_CONFIG.BOUNDARY_MARGIN, d.x)
        );
        d.y = Math.max(
          SPACING_CONFIG.BOUNDARY_MARGIN,
          Math.min(SPACING_CONFIG.SVG_HEIGHT - SPACING_CONFIG.BOUNDARY_MARGIN, d.y)
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
