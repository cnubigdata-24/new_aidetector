// 장비 네트워크 맵 생성 함수
function createEquipmentNetworkMap(data) {
  // 맵 컨테이너 초기화
  const mapContainer = document.getElementById('map-container');
  mapContainer.innerHTML = '';

  console.log('장비맵 데이터:', data); // 디버깅용 로그 추가

  // 장비 목록과 링크 정보 추출
  const equipmentList = data.equipment_list || [];
  const links = data.links || [];

  if (equipmentList.length === 0) {
    mapContainer.innerHTML = '<div class="no-data-message">표시할 장비 데이터가 없습니다.</div>';
    return;
  }

  // 제목을 맵 컨테이너 상단에 고정으로 배치 (SVG 밖에 위치)
  const titleDiv = document.createElement('div');
  titleDiv.className = 'map-title';
  titleDiv.textContent = `장비 연결 현황 (${equipmentList.length}개 장비)`;
  mapContainer.appendChild(titleDiv);

  // SVG 설정 - 맵 크기 증가
  const width = mapContainer.clientWidth || 1000;
  const height = 400; // 높이 약간 증가

  // 줌 기능 추가를 위한 전체 그룹 생성
  const svg = d3
    .select('#map-container')
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', [0, 0, width, height])
    .attr('style', 'max-width: 100%; height: auto; margin-top: -50px;'); // 위쪽 마진 추가

  // 줌 동작을 위한 컨테이너 그룹
  const container = svg.append('g');

  // 줌 행동 정의
  const zoom = d3
    .zoom()
    .scaleExtent([0.5, 5]) // 줌 범위 확장 (0.5x ~ 5x)
    .on('zoom', (event) => {
      container.attr('transform', event.transform);
    });

  // SVG에 줌 기능 적용
  svg.call(zoom);

  // 노드 색상 설정 - 분야별로 동일한 색상 적용
  const fieldColors = {
    MW: '#ff8c00', // 주황색
    IP: '#2ca02c', // 녹색
    교환: '#d62728', // 빨간색
    전송: '#9467bd', // 보라색
    선로: '#8c564b', // 갈색
    무선: '#1f77b4', // 파란색
    고도: '#e31a1c', // 빨간색
    //     L3: '#e31a1c', // 빨간색
    //     OLT: '#4caf50', // 녹색
    //     MSPP: '#9467bd', // 보라색
  };

  function getNodeColor(equipField) {
    // 필드값이 있으면 사용, 없으면 장비 타입으로 시도
    if (fieldColors[equipField]) {
      return fieldColors[equipField];
    }

    // 분야명에 특정 키워드가 포함되어 있는지 확인
    for (const [key, color] of Object.entries(fieldColors)) {
      if (equipField && equipField.includes(key)) {
        return color;
      }
    }

    return '#999'; // 기본 회색
  }

  // 장비 ID 매핑용 해시맵 생성
  const equipmentMap = {};

  // 노드 데이터 준비 - id 필드를 일관되게 설정
  const nodesData = equipmentList.map((d) => {
    // ID 필드 우선순위: equip_id가 있으면 사용, 없으면 id 사용
    const nodeId = d.equip_id || d.id;

    const node = {
      id: nodeId,
      equip_id: nodeId,
      equip_name: d.equip_name || '장비' + nodeId,
      equip_type: d.equip_type || '타입 미상',
      equip_field: d.equip_field || '분야 미상',
      guksa_name: d.guksa_name || '정보 없음',
      up_down: d.up_down || 'none',
      // 추가 속성 (나중에 참조하기 위한 용도)
      connections: [],
      level: -1, // 레벨 초기화 (토폴로지 분석에 사용)
    };

    // 장비 ID 맵에 저장
    equipmentMap[nodeId] = node;

    return node;
  });

  // 링크 유효성 검사 및 준비
  const validLinks = links.filter((link) => {
    // ID 필드 추출 (equip_id 또는 source)
    const sourceId = link.equip_id || link.source;
    const targetId = link.link_equip_id || link.target;

    // source와 target 모두 존재하는지 확인
    const valid = equipmentMap[sourceId] && equipmentMap[targetId];
    if (!valid) {
      console.log(`유효하지 않은 링크 제외: ${sourceId} -> ${targetId}`);
    }
    return valid;
  });

  console.log(`총 링크 ${links.length}개 중 유효 링크 ${validLinks.length}개 사용`);

  // 유효한 링크만 사용
  const linksData = validLinks.map((d) => {
    const sourceId = d.equip_id || d.source;
    const targetId = d.link_equip_id || d.target;

    return {
      source: sourceId,
      target: targetId,
      cable_num: d.cable_num || '', // cable_num이 없으면 빈 문자열로 설정
      sourceField: equipmentMap[sourceId]?.equip_field,
      targetField: equipmentMap[targetId]?.equip_field,
    };
  });

  // 연결 정보 구축 (각 노드마다 연결된 노드 목록)
  linksData.forEach((link) => {
    const source = equipmentMap[link.source];
    const target = equipmentMap[link.target];

    if (source && !source.connections.includes(link.target)) {
      source.connections.push(link.target);
    }

    if (target && !target.connections.includes(link.source)) {
      target.connections.push(link.source);
    }
  });

  // 네트워크 토폴로지 분석 및 계층 구조 파악
  function analyzeNetworkTopology() {
    // 연결 정도(degree)가 가장 높은 노드를 루트/중앙 노드로 간주
    let centralNodeId = null;
    let maxConnections = -1;

    // 중앙 노드 찾기 - 연결이 가장 많은 노드
    for (const node of nodesData) {
      if (node.connections.length > maxConnections) {
        maxConnections = node.connections.length;
        centralNodeId = node.id;
      }
    }

    // 중앙 노드가 없으면 첫 번째 노드를 사용
    if (centralNodeId === null && nodesData.length > 0) {
      centralNodeId = nodesData[0].id;
    }

    // 루트 노드부터 BFS로 레벨 할당
    if (centralNodeId !== null) {
      const visited = new Set();
      const queue = [{ id: centralNodeId, level: 0, parent: null }];

      // 레벨에 따른 노드 분류
      const levels = {};

      while (queue.length > 0) {
        const { id, level, parent } = queue.shift();

        if (visited.has(id)) continue;
        visited.add(id);

        const node = equipmentMap[id];
        node.level = level;
        node.parent = parent;

        // 레벨 별로 노드 저장
        if (!levels[level]) levels[level] = [];
        levels[level].push(id);

        // 연결된 노드들에 대해 레벨 할당
        for (const connectedId of node.connections) {
          if (!visited.has(connectedId)) {
            queue.push({ id: connectedId, level: level + 1, parent: id });
          }
        }
      }

      return { centralNodeId, levels };
    }

    return { centralNodeId: null, levels: {} };
  }

  // 네트워크 토폴로지 분석
  const { centralNodeId, levels } = analyzeNetworkTopology();

  // 맵 중앙 계산 - 위쪽으로 이동
  const centerX = width / 2;
  const centerY = height / 2 - 60; // 위쪽으로 이동

  // 노드 간 간격 설정 (가로/세로)
  const horizontalSpacing = 280; // 간격 설정
  const verticalSpacing = 80; // 세로 간격

  // 노드 위치 설정 - 레벨 기반 배치
  function assignNodePositions() {
    // 중앙 노드가 있으면 중앙에 배치
    if (centralNodeId) {
      const centralNode = equipmentMap[centralNodeId];
      centralNode.fx = centerX;
      centralNode.fy = centerY;
      centralNode.x = centerX;
      centralNode.y = centerY;
    }

    // 레벨별 노드 수 확인
    const levelCounts = {};
    for (const level in levels) {
      levelCounts[level] = levels[level].length;
    }

    // 가로 중심 배치를 위한 설정
    const horizontalLevels = {}; // 왼쪽(-1), 오른쪽(1) 배치를 위한 객체

    // 중앙 노드의 연결 상태 분석
    if (centralNodeId && levels['1']) {
      // 중앙 노드에서 연결된 노드들을 왼쪽/오른쪽으로 분류
      const leftNodes = [];
      const rightNodes = [];

      // 첫 번째 레벨 노드들을 균등하게 좌우로 나누기
      levels['1'].forEach((nodeId, idx) => {
        if (idx < levels['1'].length / 2) {
          leftNodes.push(nodeId);
        } else {
          rightNodes.push(nodeId);
        }
      });

      // 왼쪽, 오른쪽 그룹 저장
      horizontalLevels[-1] = leftNodes;
      horizontalLevels[1] = rightNodes;

      // 나머지 레벨의 노드들은 부모 노드의 위치에 따라 배치
      for (let level = 2; level <= Math.max(...Object.keys(levels).map(Number)); level++) {
        if (!levels[level]) continue;

        // 왼쪽, 오른쪽 노드 그룹 초기화
        if (!horizontalLevels[-level]) horizontalLevels[-level] = [];
        if (!horizontalLevels[level]) horizontalLevels[level] = [];

        // 해당 레벨의 각 노드에 대해
        levels[level].forEach((nodeId) => {
          const node = equipmentMap[nodeId];
          const parentId = node.parent;

          // 부모 노드가 왼쪽에 있는지 오른쪽에 있는지 확인
          let parentDirection = 0;
          for (const dir in horizontalLevels) {
            if (horizontalLevels[dir].includes(parentId)) {
              parentDirection = Math.sign(Number(dir));
              break;
            }
          }

          // 부모 노드의 방향에 따라 배치
          if (parentDirection < 0) {
            horizontalLevels[-level].push(nodeId);
          } else if (parentDirection > 0) {
            horizontalLevels[level].push(nodeId);
          } else {
            // 부모 방향을 알 수 없는 경우 균등 분배
            if (horizontalLevels[-level].length <= horizontalLevels[level].length) {
              horizontalLevels[-level].push(nodeId);
            } else {
              horizontalLevels[level].push(nodeId);
            }
          }
        });
      }
    } else {
      // 중앙 노드가 없는 경우 모든 노드를 가로로 일렬 배치
      let allNodes = [];
      for (const level in levels) {
        allNodes = allNodes.concat(levels[level]);
      }
      horizontalLevels[1] = allNodes;
    }

    // 가로 배치 간격 계산
    const maxNodesInDirection = Math.max(
      ...Object.values(horizontalLevels).map((nodes) => nodes.length)
    );
    const effectiveHorizontalSpacing = Math.min(
      horizontalSpacing,
      (width * 0.8) / (maxNodesInDirection + 1)
    );

    // 각 방향별로 노드 배치
    for (const direction in horizontalLevels) {
      const dir = Number(direction);
      const directionNodes = horizontalLevels[direction];
      const absLevel = Math.abs(dir);

      // 해당 방향의 노드 수
      const nodeCount = directionNodes.length;

      // 각 노드 배치
      directionNodes.forEach((nodeId, index) => {
        const node = equipmentMap[nodeId];

        // X 위치: 중앙에서 방향에 따라 간격 배치
        const xPos = centerX + (dir > 0 ? 1 : -1) * effectiveHorizontalSpacing * absLevel;

        // Y 위치: 노드 수에 따라 균등 배치
        let yPos;
        if (nodeCount <= 1) {
          yPos = centerY; // 단일 노드는 중앙에
        } else {
          // 여러 노드는 고르게 분포
          const totalHeight = Math.min(height * 0.7, nodeCount * verticalSpacing);
          const yOffset =
            (index - (nodeCount - 1) / 2) * (totalHeight / Math.max(1, nodeCount - 1));
          yPos = centerY + yOffset;
        }

        // 위치 설정
        node.fx = xPos;
        node.fy = yPos;
        node.x = xPos;
        node.y = yPos;
      });
    }

    // 연결되지 않은 노드들 처리 (있을 경우)
    const unvisitedNodes = nodesData.filter((node) => node.level === -1);
    if (unvisitedNodes.length > 0) {
      // 맵 하단에 일렬로 배치
      const bottomY = centerY + verticalSpacing * 3;
      unvisitedNodes.forEach((node, index) => {
        const xPos = centerX + effectiveHorizontalSpacing * (index - unvisitedNodes.length / 2);
        node.fx = xPos;
        node.fy = bottomY;
        node.x = xPos;
        node.y = bottomY;
      });
    }
  }

  // 노드 위치 할당
  assignNodePositions();

  // 특정 링크 쌍 사이의 복수 링크를 파악하여 인덱싱
  const linkPairs = {};
  linksData.forEach((link) => {
    // 소스/타겟 ID를 항상 일관된 순서로 사용 (작은 ID가 먼저 오도록)
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;

    const pairKey = [Math.min(sourceId, targetId), Math.max(sourceId, targetId)].join('-');

    if (!linkPairs[pairKey]) {
      linkPairs[pairKey] = [];
    }

    linkPairs[pairKey].push(link);
  });

  // 두 노드 사이의 복수 링크 처리를 위한 함수 개선
  function getLinkOffset(d) {
    if (!d.source || !d.target) return 0;

    // 소스/타겟 ID 추출
    const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
    const targetId = typeof d.target === 'object' ? d.target.id : d.target;

    // 일관된 쌍 키 생성
    const pairKey = [Math.min(sourceId, targetId), Math.max(sourceId, targetId)].join('-');
    const linkGroup = linkPairs[pairKey];

    if (!linkGroup || linkGroup.length <= 1) {
      return 0; // 단일 링크는 오프셋 없음
    }

    // 현재 링크의 인덱스 찾기 (객체 참조로 정확한 비교)
    let linkIndex = -1;
    for (let i = 0; i < linkGroup.length; i++) {
      if (linkGroup[i] === d) {
        linkIndex = i;
        break;
      }
    }

    // 인덱스를 찾지 못했거나 총 링크 수가 1개 이하면 0 반환
    if (linkIndex === -1 || linkGroup.length <= 1) return 0;

    // 링크 수에 따라 곡률 결정 - 노드 높이에 비례하게 설정
    const totalLinks = linkGroup.length;
    const NODE_HEIGHT = 50; // 노드 높이

    // 링크 순서에 따른 간격 계산
    // 첫번째 링크는 위쪽, 마지막 링크는 아래쪽에 배치되도록 계산
    // 예: 2개 링크면 노드 높이의 1/4, 3/4 지점에 배치
    const position = (linkIndex + 1) / (totalLinks + 1);

    // 소스/타겟 위치 구하기
    const sourceX = typeof d.source === 'object' ? d.source.x : equipmentMap[d.source].x;
    const targetX = typeof d.target === 'object' ? d.target.x : equipmentMap[d.target].x;
    const sourceY = typeof d.source === 'object' ? d.source.y : equipmentMap[d.source].y;
    const targetY = typeof d.target === 'object' ? d.target.y : equipmentMap[d.target].y;

    // 링크 길이와 방향 계산
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const linkLength = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    // 노드 높이에 비례하는 오프셋 계산
    // 0.5를 빼서 중심을 0으로 맞춤 (예: 3개 링크면 -0.33, 0, 0.33)
    const normalizedOffset = position - 0.5;

    // 노드 높이의 비율에 따른 오프셋 적용
    const nodeHeightRatio = NODE_HEIGHT * 0.8; // 노드 높이의 80%를 사용

    // 수직 방향으로의 오프셋 계산
    const verticalOffsetStrength = nodeHeightRatio * normalizedOffset;

    // 링크 방향에 수직인 벡터 계산
    const offsetX = Math.sin(angle) * verticalOffsetStrength;
    const offsetY = -Math.cos(angle) * verticalOffsetStrength;

    // 오프셋 저장
    d.offsetX = offsetX;
    d.offsetY = offsetY;

    // 특별한 플래그 추가 - 여러 링크 중 하나임을 표시
    d.isMultiLink = true;
    d.linkIndex = linkIndex;
    d.totalLinks = totalLinks;

    return Math.abs(verticalOffsetStrength);
  }

  // 초기화 코드 추가 - 맨 처음에 모든 링크에 오프셋 적용
  linksData.forEach(getLinkOffset);

  // 링크 그리기
  const link = container
    .append('g')
    .attr('class', 'links')
    .selectAll('g')
    .data(linksData)
    .enter()
    .append('g')
    .attr('cursor', 'pointer') // 포인터 커서 추가
    .call(d3.drag().on('start', linkDragStarted).on('drag', linkDragged).on('end', linkDragEnded));

  // 링크 선 - 곡선 지원 추가
  link
    .append('path')
    .attr('class', 'equip-link')
    .attr('stroke', (d) => {
      // MW-MW 링크는 검은색 점선
      if (d.sourceField === 'MW' && d.targetField === 'MW') {
        return 'black';
      }
      // 여러 링크 중 하나면 약간씩 다른 빨간색 계열 사용
      else if (d.isMultiLink) {
        // 링크 인덱스에 따라 약간씩 다른 색상
        const baseColor = 200; // 기본 빨간색 R값
        const variation = d.linkIndex * 25; // 링크마다 25씩 차이
        return `rgb(${Math.max(baseColor - variation, 150)}, 0, 0)`;
      }
      // 기본 링크는 빨간색
      else {
        return '#FF0000';
      }
    })
    .attr('stroke-width', 3)
    .attr('fill', 'none')
    .attr('stroke-linecap', 'round')
    .attr('stroke-dasharray', (d) =>
      d.sourceField === 'MW' && d.targetField === 'MW' ? '6,4' : null
    ); // MW-MW만 점선

  // 링크 텍스트 배경 (사각형) 부분을 아래처럼 수정
  link
    .append('rect')
    .attr('class', 'link-label-bg')
    .attr('fill', 'none') // 내부 배경색 없음
    .attr('stroke', 'none') // 외곽선 없음
    .attr('width', 0) // 크기 0 (사실상 안 보임)
    .attr('height', 0)
    .attr('opacity', 0); // 완전히 투명

  // 링크 텍스트 (케이블 번호) - cable_num이 있을 때만 생성
  link.each(function (d) {
    if (d.cable_num && d.cable_num.trim() !== '') {
      d3.select(this)
        .append('text')
        .attr('class', 'link-label')
        .attr('dy', 0)
        .attr('text-anchor', 'middle')
        .attr('font-size', '15px')
        .attr('font-weight', 'bold')
        .attr('fill', '#333')
        .text(d.cable_num)
        .call(
          d3.drag().on('start', linkDragStarted).on('drag', linkDragged).on('end', linkDragEnded)
        );
    }
  });

  // 링크 그룹에 마우스 이벤트 추가 (MW-MW 색깔)
  link
    .on('mouseover', function (event, d) {
      if (d.sourceField === 'MW' && d.targetField === 'MW') {
        d3.select(this).select('path').attr('stroke-width', 5);
      } else {
        d3.select(this).select('path').attr('stroke-width', 5).attr('stroke', '#FF3333');
      }
      d3.select(this).select('rect').attr('stroke', '#999').attr('stroke-width', 1);
    })
    .on('mouseout', function (event, d) {
      if (d.sourceField === 'MW' && d.targetField === 'MW') {
        d3.select(this).select('path').attr('stroke-width', 3);
      } else {
        d3.select(this).select('path').attr('stroke-width', 3).attr('stroke', '#FF0000');
      }
      d3.select(this).select('rect').attr('stroke', '#ddd').attr('stroke-width', 0.5);
    });

  // 노드 그리기
  const node = container
    .append('g')
    .attr('class', 'nodes')
    .selectAll('.node')
    .data(nodesData)
    .enter()
    .append('g')
    .attr('class', (d) => `equip-node node-${d.equip_field}`)
    .call(d3.drag().on('start', dragstarted).on('drag', dragged).on('end', dragended));

  // 노드 사각형 - 투명도 제거, 분야별 색상 통일
  node
    .append('rect')
    .attr('width', 180) // 노드 너비
    .attr('height', 50) // 노드 높이
    .attr('rx', 20) // 둥근 모서리
    .attr('ry', 20)
    .attr('fill', (d) => getNodeColor(d.equip_field)) // 항상 분야 색상 적용
    .attr('fill-opacity', 1) // 투명도 제거
    .attr('stroke', '#fff') // 테두리 색상
    .attr('stroke-width', 2); // 테두리 두께

  // 분야(field) 텍스트 - 노드 위에 추가, 분야별 동일 색상
  node
    .append('text')
    .attr('dx', 90) // 노드 중앙에 맞춤
    .attr('dy', -10) // 노드 위에 위치
    .attr('text-anchor', 'middle')
    .attr('fill', (d) => getNodeColor(d.equip_field)) // 분야별 색상 적용
    .attr('font-size', '14px')
    .attr('font-weight', 'bold')
    .text((d) => d.equip_field);

  // 노드 텍스트 (장비 이름)
  node
    .append('text')
    .attr('dx', 90) // 노드 중앙에 맞춤
    .attr('dy', 23) // 위치 조정
    .attr('text-anchor', 'middle')
    .attr('fill', 'white')
    .text((d) => d.equip_name)
    .style('font-size', '16px')
    .style('font-weight', 'bold')
    .style('text-shadow', '1px 1px 1px rgba(0,0,0,0.3)'); // 텍스트 가독성 효과

  // 노드 텍스트 (ID, 타입) 추가 - 글자 크기 키움
  node
    .append('text')
    .attr('dx', 90) // 노드 중앙에 맞춤
    .attr('dy', 40) // 아래쪽에 위치
    .attr('text-anchor', 'middle')
    .attr('fill', 'white')
    .text((d) => `(${d.equip_id}, ${d.equip_type})`)
    .style('font-size', '14px')
    .style('font-weight', 'bold');

  // 툴팁 요소 생성
  const tooltip = d3
    .select('body')
    .append('div')
    .attr('class', 'equip-map-tooltip')
    .style('opacity', 0);

  // 노드에 마우스 이벤트 추가 - 흔들림 효과 제거
  node
    .on('mouseover', function (event, d) {
      tooltip.transition().duration(200).style('opacity', 0.9);

      // 툴팁 내용
      tooltip
        .html(
          `
        <div style="font-weight:bold; font-size:14px; color:#333; margin-bottom:5px; border-bottom:1px solid #eee; padding-bottom:3px;">${
          d.equip_name
        }</div>
        <div style="margin-top:3px;"><span style="font-weight:bold; color:#555;">유형:</span> ${
          d.equip_type
        }</div>
        <div><span style="font-weight:bold; color:#555;">분야:</span> ${d.equip_field}</div>
        <div><span style="font-weight:bold; color:#555;">국사:</span> ${
          d.guksa_name || '미상'
        }</div>
        <div><span style="font-weight:bold; color:#555;">ID:</span> ${d.equip_id}</div>
      `
        )
        .style('left', event.pageX + 10 + 'px')
        .style('top', event.pageY - 28 + 'px');

      // 호버 시 노드 강조 (transform 효과 대신 테두리 강조로 변경)
      d3.select(this).select('rect').attr('stroke-width', 4).attr('stroke', '#333');
    })
    .on('mouseout', function () {
      tooltip.transition().duration(500).style('opacity', 0);

      // 원래 스타일로 복원
      d3.select(this).select('rect').attr('stroke-width', 2).attr('stroke', '#fff');
    });

  // 시뮬레이션 기능을 제거하고 직접 위치 업데이트
  updatePositions();

  // 드래그 시작 함수
  function dragstarted(event, d) {
    // 드래그 중인 노드를 위로 올리기
    d3.select(this).raise();

    // 드래그 중인 클래스 추가
    d3.select(this).classed('dragging', true);

    // 다른 노드들 약간 투명하게
    node
      .filter((n) => n.id !== d.id)
      .select('rect')
      .style('opacity', 0.7);

    // 연결된 링크는 강조, 나머지 링크는 흐리게
    link.each(function (l) {
      if (!l.source || !l.target) return;

      const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
      const targetId = typeof l.target === 'object' ? l.target.id : l.target;

      if (sourceId === d.id || targetId === d.id) {
        d3.select(this).select('path').style('stroke-width', 3.5).style('opacity', 1);
      } else {
        d3.select(this).select('path').style('opacity', 0.3);
      }
    });
  }

  // 드래그 진행 함수
  function dragged(event, d) {
    d.x = event.x;
    d.y = event.y;
    updatePositions(); // 위치 업데이트
  }

  // 드래그 종료 함수
  function dragended(event, d) {
    // 위치 고정 (드래그 후에도 유지)
    d.fx = d.x;
    d.fy = d.y;

    // 드래그 중인 클래스 제거
    d3.select(this).classed('dragging', false);

    // 모든 노드와 링크 원래 스타일로 복원
    node.select('rect').style('opacity', 1);
    link.select('path').style('opacity', 1).style('stroke-width', 3);
  }

  // 노드와 링크 위치 업데이트 함수
  function updatePositions() {
    // 노드 위치 업데이트
    node.attr('transform', (d) => `translate(${d.x - 90}, ${d.y - 25})`);

    // 링크 곡선 업데이트 (path 사용)
    link.select('path').attr('d', (d) => {
      if (!d.source || !d.target) return '';

      const sourceX = typeof d.source === 'object' ? d.source.x : equipmentMap[d.source].x;
      const sourceY = typeof d.source === 'object' ? d.source.y : equipmentMap[d.source].y;
      const targetX = typeof d.target === 'object' ? d.target.x : equipmentMap[d.target].x;
      const targetY = typeof d.target === 'object' ? d.target.y : equipmentMap[d.target].y;

      // 오프셋 적용
      const offsetX = d.offsetX || 0;
      const offsetY = d.offsetY || 0;

      // 여러 링크 중 하나인 경우 곡선으로 그리기
      if (d.isMultiLink) {
        // 링크 길이 계산
        const dx = targetX - sourceX;
        const dy = targetY - sourceY;

        // 중간점 (제어점) - 오프셋 적용
        const midX = (sourceX + targetX) / 2 + offsetX;
        const midY = (sourceY + targetY) / 2 + offsetY;

        // 2차 베지어 곡선으로 그리기
        return `M ${sourceX} ${sourceY} Q ${midX} ${midY} ${targetX} ${targetY}`;
      } else if (Math.abs(offsetX) > 5 || Math.abs(offsetY) > 5) {
        // 사용자가 드래그한 링크는 오프셋에 따라 곡선으로
        const midX = (sourceX + targetX) / 2 + offsetX;
        const midY = (sourceY + targetY) / 2 + offsetY;
        return `M ${sourceX} ${sourceY} Q ${midX} ${midY} ${targetX} ${targetY}`;
      } else {
        // 단일 링크는 직선으로
        return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
      }
    });

    // 링크 텍스트 위치 업데이트
    link
      .select('text')
      .attr('x', (d) => {
        if (!d.source || !d.target) return 0;
        const sourceX = typeof d.source === 'object' ? d.source.x : equipmentMap[d.source].x;
        const targetX = typeof d.target === 'object' ? d.target.x : equipmentMap[d.target].x;
        const midX = (sourceX + targetX) / 2;
        return midX + (d.offsetX || 0);
      })
      .attr('y', (d) => {
        if (!d.source || !d.target) return 0;
        const sourceY = typeof d.source === 'object' ? d.source.y : equipmentMap[d.source].y;
        const targetY = typeof d.target === 'object' ? d.target.y : equipmentMap[d.target].y;
        const midY = (sourceY + targetY) / 2;
        return midY - 12 + (d.offsetY || 0);
      });
  }

  // 링크 드래그 시작 함수
  function linkDragStarted(event, d) {
    // 노드 위로 올라가지 않도록 맨 뒤로 보내기 (노드가 위에 그려지도록)
    d3.select(this.parentNode).lower();

    // 드래그 시작 위치 저장
    d.dragStartX = event.x;
    d.dragStartY = event.y;
    d.startOffsetX = d.offsetX || 0;
    d.startOffsetY = d.offsetY || 0;

    // 드래그 중임을 표시
    d.isDragging = true;
  }

  // 링크 드래그 종료 함수
  function linkDragEnded(event, d) {
    // 드래그 종료 표시
    d.isDragging = false;
  }

  // 링크 드래그 중 함수
  function linkDragged(event, d) {
    // 드래그 오프셋 계산
    const dx = event.x - d.dragStartX;
    const dy = event.y - d.dragStartY;

    // 오프셋 업데이트
    d.offsetX = d.startOffsetX + dx;
    d.offsetY = d.startOffsetY + dy;

    // 동일한 소스-타겟 링크는 모두 같은 오프셋 값 공유
    link
      .filter(function (l) {
        return l.source === d.source && l.target === d.target;
      })
      .each(function (l) {
        l.offsetX = d.offsetX;
        l.offsetY = d.offsetY;

        // 링크가 항상 곡선으로 그려지도록 isMultiLink 플래그 설정
        if (Math.abs(l.offsetX) > 5 || Math.abs(l.offsetY) > 5) {
          l.isMultiLink = true;
        }
      });

    // 위치 업데이트
    updatePositions();
  }

  // 전체 그래프를 화면에 맞추는 함수
  function fitAllNodes() {
    // 모든 노드와 링크 오프셋 범위 계산
    let minX = Infinity,
      minY = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity;

    // 노드 범위 계산
    nodesData.forEach((d) => {
      minX = Math.min(minX, d.x - 100);
      minY = Math.min(minY, d.y - 50);
      maxX = Math.max(maxX, d.x + 100);
      maxY = Math.max(maxY, d.y + 50);
    });

    // 링크 오프셋 범위 고려
    linksData.forEach((d) => {
      const offsetX = d.offsetX || 0;
      const offsetY = d.offsetY || 0;

      if (Math.abs(offsetX) > 0 || Math.abs(offsetY) > 0) {
        const sourceX = typeof d.source === 'object' ? d.source.x : equipmentMap[d.source].x;
        const sourceY = typeof d.source === 'object' ? d.source.y : equipmentMap[d.source].y;
        const targetX = typeof d.target === 'object' ? d.target.x : equipmentMap[d.target].x;
        const targetY = typeof d.target === 'object' ? d.target.y : equipmentMap[d.target].y;

        minX = Math.min(minX, sourceX + offsetX - 20, targetX + offsetX - 20);
        minY = Math.min(minY, sourceY + offsetY - 20, targetY + offsetY - 20);
        maxX = Math.max(maxX, sourceX + offsetX + 20, targetX + offsetX + 20);
        maxY = Math.max(maxY, sourceY + offsetY + 20, targetY + offsetY + 20);
      }
    });

    // 패딩 추가
    const padding = 50;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    // 화면에 맞게 스케일과 위치 계산
    const dx = maxX - minX;
    const dy = maxY - minY;
    const scale = Math.min(width / dx, height / dy, 0.9);
    const tx = (width - scale * (minX + maxX)) / 2;
    const ty = (height - scale * (minY + maxY)) / 2;

    // 변환 적용 (부드러운 전환)
    svg
      .transition()
      .duration(500)
      .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }

  // 컨트롤 패널 추가
  function addControlPanel() {
    const controlPanel = d3
      .select('#map-container')
      .append('div')
      .attr('class', 'map-control-panel')
      .style('position', 'absolute')
      .style('top', '10px')
      .style('right', '10px')
      .style('background', 'white')
      .style('border', '1px solid #ddd')
      .style('border-radius', '4px')
      .style('padding', '5px')
      .style('z-index', '1000');

    // 맵 다시 맞추기 버튼
    controlPanel
      .append('button')
      .attr('class', 'fit-map-btn')
      .style('margin', '2px')
      .style('padding', '5px 10px')
      .style('cursor', 'pointer')
      .text('맵 맞추기')
      .on('click', () => fitAllNodes());
  }

  // 컨트롤 패널 추가 (활성화)
  addControlPanel();

  // 맵을 화면에 맞추기
  setTimeout(fitAllNodes, 100);
}
