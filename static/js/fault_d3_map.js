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

  // 중복 장비 이름 처리를 위한 맵 - 동일 장비는 하나의 노드로 통합
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

  // 장비 노드 추가 - 장비별로 그룹화
  equipData.equip_list.forEach((equip) => {
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
      // 최초 발견된 장비는 새 객체로 저장 분야별 카운터 증가
      const sector = equip.sector || '알 수 없음';
      if (sectorCounts[sector] !== undefined) {
        sectorCounts[sector]++;
      } else {
        sectorCounts[sector] = 1;
      }

      // 분야에 따라 색상 지정 - 경보 색상을 더 잘 구분되도록 변경
      let color = '#ff5555'; // 기본 경보 색상 (빨간색)
      let borderColor = '#cc0000'; // 기본 테두리 색상 (더 진한 빨간색)

      switch (sector) {
        case 'MW':
          color = '#ffaa00'; // 주황색 (더 밝게)
          borderColor = '#e67700'; // 더 진한 주황색
          break;
        case 'IP':
          color = '#ff3333'; // 선명한 빨간색
          borderColor = '#cc0000'; // 진한 빨간색
          break;
        case '교환':
          color = '#cc0000'; // 더 밝은 빨간색으로 변경
          borderColor = '#990000'; // 테두리도 어두운 빨간색으로
          break;
        case '전송':
          color = '#ff66cc'; // 핑크색
          borderColor = '#cc0099'; // 진한 핑크색
          break;
        case '선로':
          color = '#ff8833'; // 연한 주황색
          borderColor = '#cc5500'; // 진한 주황색
          break;
        case '무선':
          color = '#ffcc66'; // 매우 연한 주황색
          borderColor = '#cc9933'; // 진한 황금색
          break;
      }

      // 새 장비 정보 저장
      const newEquip = {
        id: equip.equip_name,
        type: 'equip',
        sector: sector,
        sectorIndex: sectorCounts[sector],
        alarmMessage: equip.alarm_message || '',
        color: color,
        borderColor: borderColor, // 테두리 색상 추가
      };

      // 장비 맵에 저장
      uniqueEquipMap.set(equip.equip_name, newEquip);
    }
  });

  // 유니크한 장비 노드만 추가
  for (const equip of uniqueEquipMap.values()) {
    nodes.push(equip);

    // 국사와 장비 간 링크 생성 (한 번만)
    links.push({
      source: guksaName,
      target: equip.id,
      sector: equip.sector,
    });
  }

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
    .text(`${guksaName} 경보발생 장비(${nodes.length - 1} 대)`);

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
    .style('z-index', 10)
    .style('max-width', '350px') // 툴팁 최대 너비 설정
    .style('overflow-y', 'auto') // 내용이 많을 경우 스크롤 추가
    .style('max-height', '300px'); // 최대 높이 제한

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
    { name: '국사', color: '#0056b3', borderColor: '#003366' },
    { name: 'MW', color: '#ffaa00', borderColor: '#e67700' },
    { name: '선로', color: '#ff8833', borderColor: '#cc5500' },
    { name: '전송', color: '#ff66cc', borderColor: '#cc0099' },
    { name: 'IP', color: '#ff3333', borderColor: '#cc0000' },
    { name: '무선', color: '#ffcc66', borderColor: '#cc9933' },
    { name: '교환', color: '#cc0000', borderColor: '#990000' },
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
      // 분야에 따른 링크 색상 변경 - 노드와 같은 색상으로 변경
      switch (d.sector) {
        case 'MW':
          return '#ffaa00'; // 주황색 (더 밝게)
        case 'IP':
          return '#ff3333'; // 선명한 빨간색
        case '교환':
          return '#cc0000'; // 교환 색상 변경
        case '전송':
          return '#ff66cc'; // 핑크색
        case '선로':
          return '#ff8833'; // 연한 주황색
        case '무선':
          return '#ffcc66'; // 매우 연한 주황색
        default:
          return '#ff5555'; // 기본 빨간색
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

  // 노드에 원 또는 사각형 추가 (국사는 라운드된 사각형, 장비는 원)
  node.each(function (d) {
    const selection = d3.select(this);

    if (d.type === 'guksa') {
      // 국사 노드는 라운드된 사각형으로
      selection
        .append('rect')
        .attr('width', 60)
        .attr('height', 40)
        .attr('x', -30) // 중앙 배치를 위해 width의 절반만큼 왼쪽으로
        .attr('y', -20) // 중앙 배치를 위해 height의 절반만큼 위로
        .attr('rx', 5) // 모서리 둥글게 (값 축소)
        .attr('ry', 5) // 모서리 둥글게 (값 축소)
        .attr('fill', d.color)
        .attr('stroke', '#001f3f')
        .attr('stroke-width', 2.5);
    } else {
      // 장비 노드는 원형 유지
      selection
        .append('circle')
        .attr('r', 15)
        .attr('fill', d.color)
        .attr('stroke', d.borderColor || '#333')
        .attr('stroke-width', 2.5);
    }
  });

  // 경보 개수 표시 배지 추가 (여러 경보가 있는 장비 노드에만)
  node
    .filter((d) => d.type === 'equip' && d.alarmMessages && d.alarmMessages.length > 1)
    .append('circle')
    .attr('class', 'alarm-badge')
    .attr('cx', 12)
    .attr('cy', -12)
    .attr('r', 8)
    .attr('fill', '#f7f7f7') // 연한 회색 계열로 직접 지정
    .attr('stroke', 'white')
    .attr('stroke-width', 1.5);

  // 경보 개수 텍스트 추가
  node
    .filter((d) => d.type === 'equip' && d.alarmMessages && d.alarmMessages.length > 1)
    .append('text')
    .attr('class', 'alarm-count')
    .attr('x', 12)
    .attr('y', -11)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('fill', 'black') // 검은색으로 변경
    .attr('font-size', '12px')
    .attr('font-weight', 'bold')
    .text((d) => d.alarmMessages.length);

  // 노드 내부에 텍스트 추가 - 위치 조정 (국사 노드는 사각형 중앙에)
  node
    .append('text')
    .text((d) => {
      if (d.type === 'guksa') return d.id.substring(0, 5); // 국사명 표시 (짧게)
      return d.sector; // 분야만 표시
    })
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('fill', 'white')
    .attr('font-size', (d) => (d.type === 'guksa' ? '13px' : '12px'))
    .attr('font-weight', 'bold')
    .attr('dy', (d) => (d.type === 'guksa' ? 0 : 0)); // 국사 노드는 중앙에 텍스트

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
    .attr('y', (d) => (d.type === 'guksa' ? 40 : 25))
    .attr('font-size', '11px')
    .attr('fill', '#333');

  // 마우스 오버 시 강조 효과 업데이트
  node
    .on('mouseover', function (event, d) {
      let tooltipContent = '';

      if (d.type === 'guksa') {
        tooltipContent = `<strong>국사:</strong> ${d.id}<br><strong>장비 수:</strong> ${
          nodes.length - 1
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
          tooltipContent +=
            '<ul style="margin: 2px 0; padding-left: 15px; list-style-type: disc;">';
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

      // 마우스 오버 시 강조 효과 - 국사는 사각형, 장비는 원 처리
      if (d.type === 'guksa') {
        d3.select(this)
          .select('rect')
          .transition()
          .duration(200)
          .attr('width', 66)
          .attr('height', 45)
          .attr('x', -33)
          .attr('y', -22.5);
      } else {
        d3.select(this).select('circle').transition().duration(200).attr('r', 18);
      }

      // 경보 여러개인 경우 배지도 커지게
      d3.select(this)
        .select('.alarm-badge')
        .transition()
        .duration(200)
        .attr('r', 10)
        .attr('cx', 15)
        .attr('cy', -15);

      d3.select(this)
        .select('.alarm-count')
        .transition()
        .duration(200)
        .attr('x', 15)
        .attr('y', -13)
        .attr('font-size', '10px');
    })
    .on('mouseout', function (event, d) {
      tooltip.transition().duration(500).style('opacity', 0);

      // 강조 효과 제거 - 국사는 사각형, 장비는 원 처리
      if (d.type === 'guksa') {
        d3.select(this)
          .select('rect')
          .transition()
          .duration(200)
          .attr('width', 60)
          .attr('height', 40)
          .attr('x', -30)
          .attr('y', -20);
      } else {
        d3.select(this).select('circle').transition().duration(200).attr('r', 15);
      }

      // 경보 배지 원래 크기로
      d3.select(this)
        .select('.alarm-badge')
        .transition()
        .duration(200)
        .attr('r', 8)
        .attr('cx', 12)
        .attr('cy', -12);

      d3.select(this)
        .select('.alarm-count')
        .transition()
        .duration(200)
        .attr('x', 12)
        .attr('y', -10)
        .attr('font-size', '8px');
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
