// 노드 관련 상수
const NODE_WIDTH = 250;
const NODE_WIDTH_HALF = NODE_WIDTH / 2;
const NODE_HEIGHT = 50;
const NODE_CORNER_RADIUS = 10;
const NODE_STROKE_WIDTH = 2;
const NODE_HOVER_STROKE_WIDTH = 4;
const MAX_NODE_NAME_LENGTH = 20;

// 링크 관련 상수
const LINK_STROKE_WIDTH = 3;
const LINK_HOVER_STROKE_WIDTH = 5;
const LINK_OPACITY = 0.7;
const LINK_HOVER_OPACITY = 1;

// 맵 관련 상수
const MAP_HEIGHT = 500;
const MAP_PADDING = 50;
const MAP_MARGIN_TOP = -100;
const HORIZONTAL_SPACING = 450;
const VERTICAL_SPACING = 100;
const ZOOM_MIN_SCALE = 0.5;
const ZOOM_MAX_SCALE = 5;

// 툴팁 관련 상수
const TOOLTIP_DURATION = 200;
const TOOLTIP_AUTO_HIDE_DELAY = 10000; // 10초
const MAX_TOOLTIP_ALARMS = 5;

// 분야별 색상
const FIELD_COLORS = {
  MW: '#ff8c00', // 주황색
  IP: '#2ca02c', // 녹색
  교환: '#279fd6', // 하늘색
  전송: '#9467bd', // 보라색
  선로: '#8c564b', // 갈색
  무선: '#51f13c', // 파란색
};

// 기본 색상 상수
const DEFAULT_COLOR = '#999'; // 기본 회색
const LINK_COLOR = '#FF0000'; // 링크 기본 색상
const LINK_HOVER_COLOR = '#FF3333'; // 링크 호버 색상
const LINK_MULTI_BASE_COLOR = 200; // 다중 링크 기본 색상 R값
const LINK_MULTI_VARIATION = 25; // 링크마다 색상 변화 값

// 스타일 정의 - CSS를 JavaScript로 통합
const STYLES = `
  /* 노드 스타일 */
  .equip-node {
    cursor: pointer;
  }

  .equip-node rect {
    width: ${NODE_WIDTH}px;
    height: ${NODE_HEIGHT}px;
    rx: ${NODE_CORNER_RADIUS};
    ry: ${NODE_CORNER_RADIUS};
    fill-opacity: 1;
    stroke-width: ${NODE_STROKE_WIDTH};
  }

  /* hover 효과에서 transform 제거하고 테두리만 변경 */
  .equip-node:hover rect {
    stroke-width: 3;
    filter: brightness(1.05);
  }

  /* 링크 스타일 */
  .equip-link {
    stroke-width: ${LINK_STROKE_WIDTH};
    stroke-opacity: ${LINK_OPACITY};
  }

  .equip-link:hover {
    stroke-width: ${LINK_HOVER_STROKE_WIDTH};
    stroke-opacity: ${LINK_HOVER_OPACITY};
  }

  /* 링크 라벨 스타일 */
  .link-label-bg {
    fill: white;
    fill-opacity: 0.9;
    rx: 6;
    ry: 6;
    stroke: #ddd;
    stroke-width: 0.5;
  }

  .link-label {
    text-anchor: middle;
    font-weight: bold;
    font-size: 15px;
    fill: #333;
  }

  /* 맵 제목 스타일 */
  .map-title {
    position: absolute;
    top: 3px;
    left: 0px;
    font-size: 14px;
    font-weight: bold;
    color: #333;
    z-index: 20;
    background-color: rgba(249, 249, 249, 0.8);
    padding: 5px 10px;
    border-radius: 4px;
  }

  /* 분야별 노드 색상 - 색상 개선 */
  .node-MW rect {
    fill: ${FIELD_COLORS.MW};
    box-shadow: 0 4px 8px rgba(255, 140, 0, 0.3);
  }

  .node-IP rect {
    fill: ${FIELD_COLORS.IP};
    box-shadow: 0 4px 8px rgba(44, 160, 44, 0.3);
  }

  .node-교환 rect {
    fill: ${FIELD_COLORS.교환};
    box-shadow: 0 4px 8px rgba(35, 21, 230, 0.3);
  }

  .node-전송 rect {
    fill: ${FIELD_COLORS.전송};
    box-shadow: 0 4px 8px rgba(148, 103, 189, 0.3);
  }

  .node-선로 rect {
    fill: ${FIELD_COLORS.선로};
    box-shadow: 0 4px 8px rgba(140, 86, 75, 0.3);
  }

  .node-무선 rect {
    fill: ${FIELD_COLORS.무선};
    box-shadow: 0 4px 8px rgba(35, 122, 8, 0.3);
  }

  /* 중앙 노드(도초 MSPP) 스타일 - 노란색으로 강조 */
  .center-node rect {
    fill: #ffcc00;
    stroke: #ff8800;
    stroke-width: 3;
  }


  /* 툴팁 스타일 */
  .equip-map-tooltip {
    position: absolute;
    padding: 10px;
    background: white;
    border: 1px solid #ddd;
    border-radius: 6px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.3s;
    z-index: 1000;
  }

  /* 맵 컨트롤 패널 */
  .map-control-panel {
    position: absolute;
    top: 10px;
    right: 10px;
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 5px;
    z-index: 1000;
  }

  .fit-map-btn {
    margin: 2px;
    padding: 5px 10px;
    cursor: pointer;
    border-radius: 4px;
    border: 1px solid #ccc;
    background: #f5f5f5;
  }

  .fit-map-btn:hover {
    background: #e9e9e9;
  }

  .no-data-message {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    color: #888;
    font-style: italic;
  }
`;

// 장비 ID 매핑용 해시맵 생성
const equipmentMap = {};

// 스타일 시트 추가 함수
function addStyleSheet() {
  const styleEl = document.createElement('style');
  styleEl.textContent = STYLES;
  document.head.appendChild(styleEl);
}

// 장비 네트워크 맵 생성 함수
function createEquipmentNetworkMap(data, alarmDataList) {
  // 스타일 시트 추가
  addStyleSheet();

  console.log('경보 데이터 확인:', {
    alarmDataListProvided: !!alarmDataList,
    alarmCount: alarmDataList ? alarmDataList.length : 0,
    sampleAlarm: alarmDataList && alarmDataList.length > 0 ? alarmDataList[0] : null,
  });

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

  // 노드 데이터 준비 - id 필드를 일관되게 설정
  const nodesData = equipmentList.map((d) => {
    // ID 필드 우선순위: equip_id가 있으면 사용, 없으면 id 사용
    const nodeId = d.equip_id || d.id;

    let nodeAlarms = [];
    if (alarmDataList && Array.isArray(alarmDataList)) {
      nodeAlarms = alarmDataList.filter((alarm) => alarm && alarm.equip_id === nodeId);
      // 디버깅: 장비별 경보 수 로깅
      if (nodeAlarms.length > 0) {
        console.log(`장비 ${nodeId}(${d.equip_name}): ${nodeAlarms.length}개 경보 발견`);
      }
    }

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
      alarms: nodeAlarms,
    };

    // 장비 ID 맵에 저장
    equipmentMap[nodeId] = node;

    return node;
  });

  // 제목을 맵 컨테이너 상단에 고정으로 배치 (SVG 밖에 위치)
  const titleDiv = document.createElement('div');
  titleDiv.className = 'map-title';
  titleDiv.textContent = `장비 연결 현황 (${equipmentList.length} 대)`;
  mapContainer.appendChild(titleDiv);

  // SVG 설정 - 맵 크기 증가
  const width = mapContainer.clientWidth || 1000;
  const height = MAP_HEIGHT;

  // 줌 기능 추가를 위한 전체 그룹 생성
  const svg = d3
    .select('#map-container')
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', [0, 0, width, height])
    .attr('style', `max-width: 100%; height: auto; margin-top: ${MAP_MARGIN_TOP}px;`); // 위쪽 마진 추가

  // 줌 동작을 위한 컨테이너 그룹
  const container = svg.append('g');

  // 줌 행동 정의
  const zoom = d3
    .zoom()
    .scaleExtent([ZOOM_MIN_SCALE, ZOOM_MAX_SCALE]) // 줌 범위 확장
    .on('zoom', (event) => {
      container.attr('transform', event.transform);
    });

  // SVG에 줌 기능 적용
  svg.call(zoom);

  // 모든 툴팁 숨기기 함수
  function hideAllTooltips() {
    d3.selectAll('.map-tooltip, .equip-map-tooltip').style('opacity', 0);
  }

  // 노드 색상 가져오기 함수
  function getNodeColor(equipField) {
    // 필드값이 있으면 사용, 없으면 장비 타입으로 시도
    if (FIELD_COLORS[equipField]) {
      return FIELD_COLORS[equipField];
    }

    // 분야명에 특정 키워드가 포함되어 있는지 확인
    for (const [key, color] of Object.entries(FIELD_COLORS)) {
      if (equipField && equipField.includes(key)) {
        return color;
      }
    }

    return DEFAULT_COLOR; // 기본 회색
  }

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

  // 노드간 링크 정보 구축 (각 노드마다 연결된 노드 목록)
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

  // NW 토폴로지 분석 및 계층 구조 파악
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

  // NW 토폴로지 분석
  const { centralNodeId, levels } = analyzeNetworkTopology();

  // 맵 중앙 계산 - 위쪽으로 이동
  const centerX = width / 2;
  const centerY = height / 2 - 40; // 위쪽으로 이동

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
      HORIZONTAL_SPACING,
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
          const totalHeight = Math.min(height * 0.7, nodeCount * VERTICAL_SPACING);
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
      const bottomY = centerY + VERTICAL_SPACING * 3;
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

  // 특정 링크 쌍 사이의 멀티 링크를 파악하여 인덱싱
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

  // 두 노드 사이의 멀티 링크 처리를 위한 함수 개선
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
        const baseColor = LINK_MULTI_BASE_COLOR; // 기본 빨간색 R값
        const variation = d.linkIndex * LINK_MULTI_VARIATION; // 링크마다 색상 변화
        return `rgb(${Math.max(baseColor - variation, 150)}, 0, 0)`;
      }
      // 기본 링크는 빨간색
      else {
        return LINK_COLOR;
      }
    })
    .attr('stroke-width', LINK_STROKE_WIDTH)
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

  // 링크 텍스트 (케이블 번호) - 20자까지만 표시
  link.each(function (d) {
    if (d.cable_num && d.cable_num.trim() !== '') {
      const cableText = d.cable_num.length > 20 ? d.cable_num.slice(0, 20) + '...' : d.cable_num;

      d3.select(this)
        .append('text')
        .attr('class', 'link-label')
        .attr('dy', 0)
        .attr('text-anchor', 'middle')
        .attr('font-size', '15px')
        .attr('font-weight', 'bold')
        .attr('fill', '#333')
        .text(cableText)
        .call(
          d3.drag().on('start', linkDragStarted).on('drag', linkDragged).on('end', linkDragEnded)
        );
    }
  });

  // 툴팁 요소 생성 (노드/링크 공용)
  const tooltip = d3
    .select('body')
    .append('div')
    .attr('class', 'equip-map-tooltip')
    .style('opacity', 0);

  // 노드/링크 툴팁 표시 함수 (공통)
  function showTooltip(event, d, isLink = false) {
    if (window.tooltipTimer) {
      clearTimeout(window.tooltipTimer);
      window.tooltipTimer = null;
    }
    tooltip.transition().duration(TOOLTIP_DURATION).style('opacity', 0.9);

    // 노드/링크 정보 추출
    let equip_id, equip_type, equip_field, equip_name, guksa_name, alarms;
    if (isLink) {
      // 링크의 source/target에서 정보 추출
      const source = typeof d.source === 'object' ? d.source : equipmentMap[d.source];
      const target = typeof d.target === 'object' ? d.target : equipmentMap[d.target];
      // 링크의 대표 장비(예: source) 기준으로 정보 표시 (양쪽 다 보여주고 싶으면 확장 가능)
      // to do list => 현재 링크 툴팁에 표시되는 경보는 소스 노드의 경보임 => 링크의 경보를 보여주도록 수정 필요 #########
      equip_id = source.equip_id;
      equip_type = source.equip_type;
      equip_field = source.equip_field;
      equip_name = source.equip_name;
      guksa_name = source.guksa_name;
      alarms = source.alarms;
    } else {
      equip_id = d.equip_id;
      equip_type = d.equip_type;
      equip_field = d.equip_field;
      equip_name = d.equip_name;
      guksa_name = d.guksa_name;
      alarms = d.alarms;
    }

    // 경보 내역 HTML 생성 (공통 함수 사용)
    const alarmHtml = createAlarmHtml(equip_id);

    // 툴팁 내용
    tooltip
      .html(
        `
      <div style="font-weight:bold; font-size:14px; color:#333; margin-bottom:5px; border-bottom:1px solid #eee; padding-bottom:3px;">${equip_name}</div>
      <div style="margin-top:3px;"><span style="font-weight:bold; color:#555;">유형:</span> ${equip_type}</div>
      <div><span style="font-weight:bold; color:#555;">분야:</span> ${equip_field}</div>
      <div><span style="font-weight:bold; color:#555;">국사:</span> ${guksa_name || '미상'}</div>
      <div><span style="font-weight:bold; color:#555;">ID:</span> ${equip_id}</div>${alarmHtml}
    `
      )
      .style('left', event.pageX + 10 + 'px')
      .style('top', event.pageY - 28 + 'px')
      .style('max-width', '350px')
      .style('width', 'auto');

    window.tooltipTimer = setTimeout(function () {
      tooltip.style('opacity', 0);
    }, TOOLTIP_AUTO_HIDE_DELAY);
  }

  // 툴팁 숨김 함수 (공통)
  function hideTooltip() {
    tooltip.transition().duration(500).style('opacity', 0);
  }

  // 노드에 마우스 이벤트 추가 - 흔들림 효과 제거
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
    .attr('width', NODE_WIDTH) // 노드 너비
    .attr('height', NODE_HEIGHT) // 노드 높이
    .attr('rx', NODE_CORNER_RADIUS) // 둥근 모서리
    .attr('ry', NODE_CORNER_RADIUS)
    .attr('fill', (d) => getNodeColor(d.equip_field)) // 항상 분야 색상 적용
    .attr('fill-opacity', 1) // 투명도 제거
    .attr('stroke', '#fff') // 테두리 색상
    .attr('stroke-width', NODE_STROKE_WIDTH); // 테두리 두께

  // 분야(field 또는 sector) 텍스트 - 노드 위에 추가, 분야별 동일 색상
  node
    .append('text')
    .attr('dx', NODE_WIDTH_HALF) // 노드 중앙에 맞춤
    .attr('dy', -10) // 노드 위에 위치
    .attr('text-anchor', 'middle') // 중앙 정렬
    .attr('fill', (d) => getNodeColor(d.equip_field)) // 분야별 색상 적용
    .attr('font-size', '14px')
    .attr('font-weight', 'bold')
    .text((d) => d.equip_field);

  // 노드 텍스트 (장비 이름)
  node
    .append('text')
    .attr('dx', NODE_WIDTH_HALF) // 노드 중앙에 맞춤
    .attr('dy', 23) // 위치 조정
    .attr('text-anchor', 'middle')
    .attr('fill', 'white')
    .text((d) => {
      // 20자 제한
      const name = d.equip_name || '';
      return name.length > MAX_NODE_NAME_LENGTH
        ? name.slice(0, MAX_NODE_NAME_LENGTH) + '...'
        : name;
    })
    .style('font-size', '16px')
    .style('font-weight', 'bold')
    .style('text-shadow', '1px 1px 1px rgba(0,0,0,0.3)');

  // 노드 텍스트 (타입, ID) 추가
  node
    .append('text')
    .attr('dx', NODE_WIDTH_HALF) // 노드 중앙에 맞춤
    .attr('dy', 40) // 아래쪽에 위치
    .attr('text-anchor', 'middle')
    .attr('fill', 'white')
    .text((d) => {
      // 20자 제한
      const type = d.equip_type || '';
      const id = d.equip_id || '';
      const label = `${type}:${id}`;

      return label.length > MAX_NODE_NAME_LENGTH
        ? label.slice(0, MAX_NODE_NAME_LENGTH) + '...'
        : label;
    })
    .style('font-size', '14px')
    .style('font-weight', 'bold');

  // 노드에 경보 개수 배지 - (노드 우상단)
  node
    .filter((d) => d.alarms && d.alarms.length > 0) // alarms 배열이 있고 길이가 0보다 큰 노드만
    .append('circle')
    .attr('class', 'alarm-badge')
    .attr('cx', NODE_WIDTH - 7) // 노드 우측에 배치
    .attr('cy', -3) // 노드 위에 배치
    .attr('r', 14) // 배지 크기
    .attr('fill', '#ff3333') // 빨간색 배경
    .attr('stroke', 'white')
    .attr('stroke-width', 1.2);

  // 노드에 경보 개수 텍스트
  node
    .filter((d) => d.alarms && d.alarms.length > 0)
    .append('text')
    .attr('class', 'alarm-count')
    .attr('x', NODE_WIDTH - 7) // 원과 같은 x 위치
    .attr('y', -2) // 약간 조정하여 원 중앙에 위치
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('fill', 'black') // 흰색 텍스트
    .attr('font-size', '14px')
    .attr('font-weight', 'bold')
    .text((d) => d.alarms.length);

  // 노드에 마우스 이벤트 추가 - 흔들림 효과 제거
  node
    .on('mouseover', function (event, d) {
      showTooltip(event, d, false);
      d3.select(this)
        .select('rect')
        .attr('stroke-width', NODE_HOVER_STROKE_WIDTH)
        .attr('stroke', '#333');
    })
    .on('mouseout', function () {
      hideTooltip();
      d3.select(this).select('rect').attr('stroke-width', NODE_STROKE_WIDTH).attr('stroke', '#fff');
    })
    .on('mouseleave', function () {
      hideTooltip();
      d3.select(this).select('rect').attr('stroke-width', NODE_STROKE_WIDTH).attr('stroke', '#fff');
    });

  // 링크 그룹에 마우스 이벤트 추가 (MW-MW 색깔)
  link
    .on('mouseover', function (event, d) {
      showTooltip(event, d, true);
      if (d.sourceField === 'MW' && d.targetField === 'MW') {
        d3.select(this).select('path').attr('stroke-width', LINK_HOVER_STROKE_WIDTH);
      } else {
        d3.select(this)
          .select('path')
          .attr('stroke-width', LINK_HOVER_STROKE_WIDTH)
          .attr('stroke', LINK_HOVER_COLOR);
      }
      d3.select(this).select('rect').attr('stroke', '#999').attr('stroke-width', 1);
    })
    .on('mouseout', function (event, d) {
      hideTooltip();
      if (d.sourceField === 'MW' && d.targetField === 'MW') {
        d3.select(this).select('path').attr('stroke-width', LINK_STROKE_WIDTH);
      } else {
        d3.select(this)
          .select('path')
          .attr('stroke-width', LINK_STROKE_WIDTH)
          .attr('stroke', LINK_COLOR);
      }
      d3.select(this).select('rect').attr('stroke', '#ddd').attr('stroke-width', 0.5);
    });

  // SVG 자체에 mouseleave 이벤트 추가 - 맵 영역 벗어날 때 툴팁 숨김
  svg.on('mouseleave', function () {
    hideAllTooltips();
    hideTooltip();
  });

  // 시뮬레이션 기능을 제거하고 직접 위치 업데이트
  updatePositions();

  // 장비의 경보 내역 HTML을 생성하는 함수
  function createAlarmHtml(equipId, maxAlarms = MAX_TOOLTIP_ALARMS) {
    // 장비 ID로 경보 내역 찾기 (전역 변수인 _totalAlarmDataList에서 검색)
    let alarmList = [];
    let allAlarms = [];

    if (alarmDataList && Array.isArray(alarmDataList)) {
      // 전달받은 alarmDataList 사용 (최신화된 경보 데이터)
      allAlarms = alarmDataList.filter((alarm) => alarm && alarm.equip_id === equipId);
      alarmList = allAlarms.slice(0, maxAlarms);
    } else if (window._totalAlarmDataList && Array.isArray(window._totalAlarmDataList)) {
      // 만약 전달받은 alarmDataList가 없으면 window._totalAlarmDataList 사용 (폴백)
      allAlarms = window._totalAlarmDataList.filter((alarm) => alarm && alarm.equip_id === equipId);
      alarmList = allAlarms.slice(0, maxAlarms);
    }

    // 경보 내역 HTML 생성
    let alarmHtml = '';

    if (alarmList.length > 0) {
      alarmHtml = `
      <div style="margin-top:10px; border-top:1px solid #eee; padding-top:5px;">
        <div style="font-weight:bold; color:#d9534f; margin-bottom:5px;">최근 경보 내역:</div>
    `;

      alarmList.forEach((alarm) => {
        const validClass = alarm.valid_yn === 'Y' ? 'color:#d9534f;font-weight:bold;' : '';
        alarmHtml += `
        <div style="margin-bottom:3px;${validClass}">
          <span style="font-size:12px;">${
            formatDateTimeForToolTip(alarm.occur_datetime) || '-'
          }</span>: 
          ${alarm.alarm_message || '메시지 없음'}
        </div>
      `;
      });

      if (allAlarms.length > maxAlarms) {
        alarmHtml += `<div style="font-size:12px;font-style:italic;text-align:right;margin-top:3px;">+ ${
          allAlarms.length - maxAlarms
        }개 더 있음...</div>`;
      }

      alarmHtml += `</div>`;
    } else {
      alarmHtml = `
      <div style="margin-top:10px; border-top:1px solid #eee; padding-top:5px;">
        <div style="color:#777; font-style:italic;">경보 내역이 없습니다.</div>
      </div>
    `;
    }

    return alarmHtml;
  }

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
    link.select('path').style('opacity', 1).style('stroke-width', LINK_STROKE_WIDTH);
  }

  // 노드와 링크 위치 업데이트 함수
  function updatePositions() {
    // 노드 위치 업데이트
    node.attr('transform', (d) => `translate(${d.x - NODE_WIDTH / 2}, ${d.y - NODE_HEIGHT / 2})`);

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
    minX -= MAP_PADDING;
    minY -= MAP_PADDING;
    maxX += MAP_PADDING;
    maxY += MAP_PADDING;

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
