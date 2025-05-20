// 상수 정의
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
  NODE_RADIUS: 15,
  NODE_RADIUS_HOVER: 18,
  GUKSA_WIDTH: 60,
  GUKSA_HEIGHT: 40,
  GUKSA_WIDTH_HOVER: 66,
  GUKSA_HEIGHT_HOVER: 45,
  BADGE_RADIUS: 8,
  BADGE_RADIUS_HOVER: 10,
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
    BADGE: '8px',
    BADGE_HOVER: '10px',
  },
};

const FORCE = {
  LINK_DISTANCE: 100,
  CHARGE_STRENGTH: -50,
  X_STRENGTH: 1,
  Y_STRENGTH: 0.3,
  COLLIDE_RADIUS: 20,
  ALPHA_DECAY: 0.05,
  ALPHA: 0.3,
};

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
    mapContainer.innerHTML = '<div class="no-data-message">표시할 장비 데이터가 없습니다.</div>';
    return;
  }

  // SVG 설정 및 생성
  const { svg, container, currentZoom } = setupSVG(mapContainer);

  // 제목 추가
  addTitle(mapContainer, guksaName, nodes.length - 1);

  // 범례 추가
  addLegend(mapContainer);

  // 노드 위치 설정
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

// 장비 노드 생성 함수
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

// 노드와 링크에 장비 추가
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

// SVG 설정 및 생성
function setupSVG(mapContainer) {
  const width = mapContainer.clientWidth || 800;
  const height = 400;

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
    .scaleExtent([0.5, 3]) // 줌 범위 (0.5x ~ 3x)
    .on('zoom', (event) => {
      container.attr('transform', event.transform);
      currentZoom = event.transform;
    });

  // SVG에 줌 기능 적용
  svg.call(zoom);

  return { svg, container, currentZoom, width, height };
}

// 제목 추가
function addTitle(mapContainer, guksaName, equipmentCount) {
  const titleDiv = document.createElement('div');
  titleDiv.className = 'map-title';
  titleDiv.textContent = `${guksaName} 경보 장비(${equipmentCount} 대)`;
  mapContainer.appendChild(titleDiv);
}

// 범례 추가
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

// 노드 위치 설정
function setupNodePositions(nodes) {
  // 분야별 노드 그룹화
  const sectorGroups = {};

  for (let i = 1; i < nodes.length; i++) {
    const node = nodes[i];
    if (!sectorGroups[node.sector]) {
      sectorGroups[node.sector] = [];
    }
    sectorGroups[node.sector].push(node);
  }

  // 국사 노드 위치 고정
  nodes[0].fx = LAYOUT.LEFT_MARGIN;
  nodes[0].fy = LAYOUT.TOP_MARGIN;

  // 각 분야를 수평으로 배치
  const rightWidth = 600; // 오른쪽 영역 너비 (적절히 조정)
  const sectorCount = LAYOUT.SECTOR_ORDER.length;

  LAYOUT.SECTOR_ORDER.forEach((sector, index) => {
    if (sectorGroups[sector] && sectorGroups[sector].length > 0) {
      // 분야별 x 위치 설정 (균등 간격)
      const xPos = LAYOUT.LEFT_MARGIN + 200 + (rightWidth / sectorCount) * index;

      // 분야 내 노드 수직 배치
      const nodes = sectorGroups[sector];
      const sectorHeight = 300; // 수직 공간
      const nodeSpacing = Math.min(40, sectorHeight / nodes.length);

      nodes.forEach((node, i) => {
        // y 위치를 균등하게 배분 (분야 내 순서에 따라)
        const yOffset = i * nodeSpacing;
        const yPos = LAYOUT.TOP_MARGIN + yOffset;

        // 초기 위치 지정
        node.x = xPos;
        node.y = yPos;
      });
    }
  });
}

// 툴팁 생성
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

// 힘 시뮬레이션 생성
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
          return d.x || 400; // 기본 중앙 위치
        })
        .strength(FORCE.X_STRENGTH)
    )
    .force(
      'y',
      d3
        .forceY()
        .y((d) => {
          if (d.type === 'guksa') return LAYOUT.TOP_MARGIN;
          return d.y || 200; // 기본 중앙 위치
        })
        .strength(FORCE.Y_STRENGTH)
    )
    .force('collide', d3.forceCollide().radius(FORCE.COLLIDE_RADIUS))
    .alphaDecay(FORCE.ALPHA_DECAY)
    .alpha(FORCE.ALPHA);
}

// 링크 생성
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

// 노드 생성
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

// 마우스 오버 처리
function handleMouseOver(element, event, d, tooltip) {
  let tooltipContent = '';

  if (d.type === 'guksa') {
    tooltipContent = `<strong>국사:</strong> ${d.id}<br><strong>장비 수:</strong> ${
      d.nodeCount || '알 수 없음'
    }`;
  } else {
    // 기본 장비 정보
    tooltipContent = `
      <strong>장비:</strong> ${d.id}<br>
      <strong>분야:</strong> ${d.sector}<br>
    `;

    // 경보 메시지 추가
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

// 마우스 아웃 처리
function handleMouseOut(element, tooltip) {
  tooltip.transition().duration(500).style('opacity', 0);

  // 강조 효과 제거
  d3.select(element)
    .select('rect')
    .transition()
    .duration(200)
    .attr('width', LAYOUT.GUKSA_WIDTH)
    .attr('height', LAYOUT.GUKSA_HEIGHT)
    .attr('x', -LAYOUT.GUKSA_WIDTH / 2)
    .attr('y', -LAYOUT.GUKSA_HEIGHT / 2);

  d3.select(element).select('circle').transition().duration(200).attr('r', LAYOUT.NODE_RADIUS);

  // 경보 배지 원래 크기로
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

// 시뮬레이션 설정
function setupSimulation(simulation, nodes, link, node) {
  simulation.on('tick', () => {
    // 노드 위치 제한 (화면 벗어나지 않도록)
    nodes.forEach((d) => {
      if (d.type !== 'guksa') {
        // 국사 노드는 고정
        d.x = Math.max(30, Math.min(770, d.x)); // 적절히 조정된 범위
        d.y = Math.max(30, Math.min(370, d.y)); // 적절히 조정된 범위
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

// 드래그 시작 함수
function dragstarted(event, d, simulation) {
  if (!event.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x;
  d.fy = d.y;
}

// 드래그 중 함수
function dragged(event, d) {
  d.fx = event.x;
  d.fy = event.y;
}

// 드래그 종료 함수
function dragended(event, d, simulation) {
  if (!event.active) simulation.alphaTarget(0);
  d.fx = d.x;
  d.fy = d.y;
}
