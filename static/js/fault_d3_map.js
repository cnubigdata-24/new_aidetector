// 네트워크 맵 생성 함수
function createNetworkMap(equipData) {
  // 맵 컨테이너 초기화
  const mapContainer = document.getElementById('map-container');
  mapContainer.innerHTML = '';

  // 국사 이름 또는 ID를 확인
  const guksaName = equipData.guksa_name || equipData.guksa_id || '알 수 없는 국사';

  // 노드 및 링크 데이터 준비
  const nodes = [
    { id: guksaName, type: 'guksa', color: '#0056b3' }, // 국사 노드 (파란색)
  ];

  const links = [];

  // 중복 장비 이름 처리를 위한 맵
  const uniqueEquipNames = new Map();

  // 분야별 카운터
  const sectorCounts = {
    MW: 0,
    선로: 0,
    전송: 0,
    IP: 0,
    무선: 0,
    교환: 0,
  };

  // 장비 노드 추가
  equipData.equip_list.forEach((equip, index) => {
    // 장비 이름 없으면 건너뛰기
    if (!equip.equip_name) return;

    // 중복 장비 처리 (동일 이름의 장비가 있으면 카운트 추가)
    let equipName = equip.equip_name;
    if (uniqueEquipNames.has(equipName)) {
      const count = uniqueEquipNames.get(equipName) + 1;
      uniqueEquipNames.set(equipName, count);
      equipName = `${equipName} (${count})`;
    } else {
      uniqueEquipNames.set(equipName, 1);
    }

    // 분야별 카운터 증가
    const sector = equip.sector || '알 수 없음';
    if (sectorCounts[sector] !== undefined) {
      sectorCounts[sector]++;
    } else {
      sectorCounts[sector] = 1;
    }

    // 분야에 따라 색상 지정
    let color = '#666'; // 기본 색상
    switch (sector) {
      case 'MW':
        color = '#ff8c00'; // 주황색
        break;
      case 'IP':
        color = '#2ca02c'; // 녹색
        break;
      case '교환':
        color = '#d62728'; // 빨간색
        break;
      case '전송':
        color = '#9467bd'; // 보라색
        break;
      case '선로':
        color = '#8c564b'; // 갈색
        break;
      case '무선':
        color = '#1f77b4'; // 파란색
        break;
    }

    nodes.push({
      id: equipName,
      type: 'equip',
      sector: sector,
      sectorIndex: sectorCounts[sector], // 분야 내 순서 저장
      alarmMessage: equip.alarm_message || '',
      color: color,
    });

    // 국사와 장비 간 링크 생성
    links.push({
      source: guksaName,
      target: equipName,
      sector: sector,
    });
  });

  // 노드가 없으면 메시지 표시 후 종료
  if (nodes.length <= 1) {
    mapContainer.innerHTML = '<div class="no-data-message">표시할 장비 데이터가 없습니다.</div>';
    return;
  }

  // SVG 설정
  const width = mapContainer.clientWidth || 800;
  const height = 400;

  // 줌 기능 추가를 위한 전체 그룹 생성
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
  let currentZoom = {
    k: 1, // 줌 레벨
    x: 0, // x 오프셋
    y: 0, // y 오프셋
  };

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

  // 제목 추가 (중앙 상단에 배치)
  container
    .append('text')
    .attr('x', 130)
    .attr('y', 30)
    .attr('text-anchor', 'middle')
    .style('font-size', '16px')
    .style('font-weight', 'bold')
    .text(` 국사[${guksaName}] 경보발생 장비(${nodes.length - 1} 대)`);

  // 국사 노드 좌측에 배치
  const centerY = height / 2;

  const leftMargin = 80; // 국사 노드를 더 좌측으로 이동
  const topMargin = 80; // 국사 노드 수직 위치
  nodes[0].fx = leftMargin;
  nodes[0].fy = topMargin;

  // 분야별 정렬 순서 정의 (MW, 선로, 전송, IP, 무선, 교환 순서)
  const sectorOrder = ['MW', '선로', '전송', 'IP', '무선', '교환'];

  // 분야별 노드 그룹화
  const sectorGroups = {};
  for (let i = 1; i < nodes.length; i++) {
    const node = nodes[i];
    if (!sectorGroups[node.sector]) {
      sectorGroups[node.sector] = [];
    }
    sectorGroups[node.sector].push(node);
  }

  // 각 분야를 수평으로 배치
  const rightWidth = width - leftMargin - 100; // 오른쪽 영역 너비
  const sectorPositions = {};

  sectorOrder.forEach((sector, index) => {
    if (sectorGroups[sector] && sectorGroups[sector].length > 0) {
      // 분야별 x 위치 설정 (균등 간격)
      const xPos = leftMargin + 200 + (rightWidth / sectorOrder.length) * index;
      sectorPositions[sector] = xPos;

      // 분야 내 노드 수직 배치
      const nodes = sectorGroups[sector];
      const sectorHeight = height - 100; // 수직 공간
      const nodeSpacing = Math.min(40, sectorHeight / nodes.length);

      nodes.forEach((node, i) => {
        // y 위치를 균등하게 배분 (분야 내 순서에 따라)
        const yOffset = i * nodeSpacing;
        const yPos = 80 + yOffset;

        // 초기 위치 지정
        node.x = xPos;
        node.y = yPos;
      });
    }
  });

  // 툴팁 요소 생성
  const tooltip = d3
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
    .style('z-index', 10);

  // 범례 생성 (우측 상단에 배치)
  const legend = container
    .append('g')
    .attr('class', 'legend')
    .attr('transform', `translate(${width - 130}, 10)`);

  // 범례 배경
  legend
    .append('rect')
    .attr('width', 120)
    .attr('height', 160)
    .attr('fill', 'white')
    .attr('stroke', '#ddd')
    .attr('rx', 5)
    .attr('fill-opacity', 0.8);

  // 범례 제목
  legend
    .append('text')
    .attr('x', 10)
    .attr('y', 20)
    .text('분야별 색상')
    .style('font-weight', 'bold')
    .style('font-size', '12px');

  // 범례 항목
  const sectors = [
    { name: '국사', color: '#0056b3' },
    { name: 'MW', color: '#ff8c00' },
    { name: '선로', color: '#8c564b' },
    { name: '전송', color: '#9467bd' },
    { name: 'IP', color: '#2ca02c' },
    { name: '무선', color: '#1f77b4' },
    { name: '교환', color: '#d62728' },
  ];

  sectors.forEach((sector, i) => {
    // 색상 원
    legend
      .append('circle')
      .attr('cx', 20)
      .attr('cy', 40 + i * 16)
      .attr('r', 6)
      .attr('fill', sector.color);

    // 텍스트
    legend
      .append('text')
      .attr('x', 35)
      .attr('y', 44 + i * 16)
      .text(sector.name)
      .style('font-size', '12px');
  });

  // 힘 시뮬레이션 생성 및 조정
  const simulation = d3
    .forceSimulation(nodes)
    .force(
      'link',
      d3
        .forceLink(links)
        .id((d) => d.id)
        .distance((d) => {
          // 동일 분야 내에서 순서에 따라 거리 조정
          if (d.target.sectorIndex) {
            return 100; // 기본 거리
          }
          return 100;
        })
    )
    .force('charge', d3.forceManyBody().strength(-50))
    .force(
      'x',
      d3
        .forceX()
        .x((d) => {
          if (d.type === 'guksa') return leftMargin;
          return sectorPositions[d.sector] || width / 2;
        })
        .strength(1)
    ) // 분야별 x 위치로 강하게 당김
    .force(
      'y',
      d3
        .forceY()
        .y((d) => {
          if (d.type === 'guksa') return centerY;
          return d.y || centerY;
        })
        .strength(0.3)
    )
    .force('collide', d3.forceCollide().radius(20)) // 노드 간 충돌 방지
    .alphaDecay(0.05) // 시뮬레이션이 점점 안정화되는 속도
    .alpha(0.3); // 초기 시뮬레이션 강도

  // 링크 생성
  const link = container
    .append('g')
    .selectAll('line')
    .data(links)
    .enter()
    .append('line')
    .attr('stroke', (d) => {
      // 분야에 따른 링크 색상
      switch (d.sector) {
        case 'MW':
          return '#ff8c00';
        case 'IP':
          return '#2ca02c';
        case '교환':
          return '#d62728';
        case '전송':
          return '#9467bd';
        case '선로':
          return '#8c564b';
        default:
          return '#999';
      }
    })
    .attr('stroke-opacity', 0.6)
    .attr('stroke-width', 2);

  // 노드 그룹 생성
  const node = container
    .append('g')
    .selectAll('g')
    .data(nodes)
    .enter()
    .append('g')
    .attr('class', (d) => `node ${d.type === 'guksa' ? 'node-guksa' : `node-${d.sector}`}`)
    .call(d3.drag().on('start', dragstarted).on('drag', dragged).on('end', dragended));

  // 노드에 원 추가
  node
    .append('circle')
    .attr('r', (d) => (d.type === 'guksa' ? 25 : 15))
    .attr('fill', (d) => d.color)
    .attr('stroke', (d) => (d.type === 'guksa' ? '#001f3f' : '#333'))
    .attr('stroke-width', 2);

  // 노드 내부에 텍스트 추가
  node
    .append('text')
    .text((d) => {
      if (d.type === 'guksa') return d.id.substring(0, 5); // 국사명 표시 (짧게)
      return d.sector; // 분야만 표시
    })
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('fill', 'white')
    .attr('font-size', (d) => (d.type === 'guksa' ? '12px' : '10px'))
    .attr('font-weight', 'bold');

  // 노드 아래에 텍스트 라벨 추가
  node
    .append('text')
    .text((d) => {
      if (d.type === 'guksa') return ''; // 국사 노드는 내부에 이미 표시함
      // 장비는 이름만 표시 (길이 제한)
      const maxLength = 15;
      return d.id.length > maxLength ? d.id.slice(0, maxLength) + '...' : d.id;
    })
    .attr('text-anchor', 'middle')
    .attr('x', 0)
    .attr('y', (d) => (d.type === 'guksa' ? 35 : 25))
    .attr('font-size', '10px')
    .attr('fill', '#333');

  // 툴팁 이벤트 추가
  node
    .on('mouseover', function (event, d) {
      let tooltipContent = '';

      if (d.type === 'guksa') {
        tooltipContent = `<strong>국사:</strong> ${d.id}<br><strong>장비 수:</strong> ${
          nodes.length - 1
        }`;
      } else {
        tooltipContent = `
        <strong>장비:</strong> ${d.id}<br>
        <strong>분야:</strong> ${d.sector}<br>
        ${d.alarmMessage ? `<strong>경보:</strong> ${d.alarmMessage}` : ''}
      `;
      }

      tooltip
        .html(tooltipContent)
        .style('left', event.pageX + 10 + 'px')
        .style('top', event.pageY - 28 + 'px')
        .transition()
        .duration(200)
        .style('opacity', 0.9);

      // 마우스 오버 시 강조 효과
      d3.select(this)
        .select('circle')
        .transition()
        .duration(200)
        .attr('r', d.type === 'guksa' ? 28 : 18);
    })
    .on('mouseout', function () {
      tooltip.transition().duration(500).style('opacity', 0);

      // 강조 효과 제거
      d3.select(this)
        .select('circle')
        .transition()
        .duration(200)
        .attr('r', (d) => (d.type === 'guksa' ? 25 : 15));
    });

  // 시뮬레이션 틱마다 위치 업데이트
  simulation.on('tick', () => {
    // 노드 위치 제한 (화면 벗어나지 않도록)
    nodes.forEach((d) => {
      if (d.type !== 'guksa') {
        // 국사 노드는 고정
        d.x = Math.max(30, Math.min(width - 30, d.x));
        d.y = Math.max(30, Math.min(height - 30, d.y));
      }
    });

    link
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y);

    node.attr('transform', (d) => `translate(${d.x},${d.y})`);
  });

  // 드래그 함수들
  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);

    // 모든 노드를 드래그한 위치에 고정 (국사 노드 포함)
    d.fx = d.x;
    d.fy = d.y;
  }

  // 시뮬레이션 시작
  simulation.restart();
}
