function drawTopology(data) {
  const container = document.getElementById('topology-svg');
  container.innerHTML = '';

  const nodes = [];
  const edges = [];

  const centerX = 500;
  const centerY = 250;
  const horizontalGap = 280;
  const verticalGap = 120;
  const fixedNodeWidth = 150;
  const fixedNodeHeight = 55;

  // 노드 색상 정의
  const nodeColors = {
    center: {
      background: '#74c0fc', // 파란색
      border: '#4dabf7',
    },
    side: {
      background: '#ced4da', // 회색톤
      border: '#adb5bd',
    },
  };

  // 중앙 노드(자국) 생성
  nodes.push({
    id: data.center,
    label: `자국\n\n${data.center}`,
    // title: `[ 시설현황 ]\n\nㅇ ${data.center_equipments.join('\nㅇ ')}`,
    title: `[ 시설현황 ]\n\nㅇ `,
    x: centerX,
    y: centerY,
    shape: 'box',
    fixed: true,
    font: {
      size: 20,
      face: 'Arial',
      bold: { size: 48, color: '#000000', face: 'Arial' },
    },
    margin: 12,
    widthConstraint: { minimum: fixedNodeWidth, maximum: fixedNodeWidth },
    heightConstraint: { minimum: fixedNodeHeight, maximum: fixedNodeHeight },
    color: nodeColors.center,
  });

  // 상위국들 - 우측에 배치
  const upperCount = data.upper.length;
  const upperStartY = centerY - ((upperCount - 1) * verticalGap) / 2;

  data.upper.forEach((item, i) => {
    const y = upperStartY + i * verticalGap;
    nodes.push({
      id: item.remote_guksa_name,
      label: `대국 (상위국)\n\n${item.remote_guksa_name}`,
      title: `[ 시설현황 ]\n\nㅇ ${item.remote_equipments.join('\nㅇ ')}`,
      x: centerX + horizontalGap,
      y: y,
      shape: 'box',
      fixed: true,
      font: {
        size: 20,
        face: 'Arial',
        bold: { size: 48, color: '#000000', face: 'Arial' },
      },
      margin: 12,
      widthConstraint: { minimum: fixedNodeWidth, maximum: fixedNodeWidth },
      heightConstraint: { minimum: fixedNodeHeight, maximum: fixedNodeHeight },
      color: nodeColors.side,
    });

    edges.push({
      from: data.center,
      to: item.remote_guksa_name,
      dashes:
        item.link_type.includes('M/W') ||
        item.link_type.includes('MW') ||
        item.link_type.includes('mw'),
      color: {
        color:
          item.link_type.includes('M/W') ||
          item.link_type.includes('MW') ||
          item.link_type.includes('mw')
            ? 'black'
            : item.link_type.includes('한전광')
            ? 'orange'
            : 'red',
      },
      arrows: '',
      label: item.link_type,
      font: { align: 'middle', size: 20 },
      width: 5,
    });
  });

  // 하위국들 - 좌측에 배치
  const lowerCount = data.lower.length;
  const lowerStartY = centerY - ((lowerCount - 1) * verticalGap) / 2;

  data.lower.forEach((item, i) => {
    const y = lowerStartY + i * verticalGap;
    nodes.push({
      id: item.remote_guksa_name,
      label: `대국 (하위국)\n\n${item.remote_guksa_name}`,
      title: `[ 시설현황 ]\n\nㅇ ${item.remote_equipments.join('\nㅇ ')}`,
      x: centerX - horizontalGap,
      y: y,
      shape: 'box',
      fixed: true,
      font: {
        size: 20,
        face: 'Arial',
        bold: { size: 48, color: '#000000', face: 'Arial' },
      },
      margin: 12,
      widthConstraint: { minimum: fixedNodeWidth, maximum: fixedNodeWidth },
      heightConstraint: { minimum: fixedNodeHeight, maximum: fixedNodeHeight },
      color: nodeColors.side,
    });

    edges.push({
      from: data.center,
      to: item.remote_guksa_name,
      dashes:
        item.link_type.includes('M/W') ||
        item.link_type.includes('MW') ||
        item.link_type.includes('mw'),
      color: {
        color:
          item.link_type.includes('M/W') ||
          item.link_type.includes('MW') ||
          item.link_type.includes('mw')
            ? 'black'
            : item.link_type.includes('한전광')
            ? 'orange'
            : 'red',
      },
      arrows: '',
      label: item.link_type,
      font: { align: 'middle', size: 20 },
      width: 5,
    });
  });

  // 국사 정보 업데이트
  //   document.getElementById('guksa-name').textContent = data.guksa_info.guksa_name;
  //   document.getElementById('guksa-type').textContent = data.guksa_info.guksa_type;
  //   document.getElementById('operation-depart').textContent = data.guksa_info.operation_depart;

  // 경보 목록 업데이트
  // const alarmList = document.getElementById('alarm-list');
  // alarmList.innerHTML = '';
  // data.alarms.forEach((alarm) => {
  //   const row = document.createElement('tr');
  //   row.innerHTML = `
  //           <td>${alarm.equip.equip_name}</td>
  //           <td>${alarm.alarm_message}</td>
  //           <td>${alarm.alarm_grade}</td>
  //       `;
  //   alarmList.appendChild(row);
  // });

  const dataSet = {
    nodes: new vis.DataSet(nodes),
    edges: new vis.DataSet(edges),
  };

  const options = {
    physics: false,
    interaction: {
      dragNodes: true,
      zoomView: false,
      hover: true,
      tooltipDelay: 300,
    },
    nodes: {
      shape: 'box',
      borderWidth: 2,
      shadow: {
        enabled: true,
        color: 'rgba(0,0,0,0.2)',
        size: 5,
      },
    },
    edges: {
      smooth: {
        enabled: true,
        type: 'straightCross',
      },
      width: 4,
    },
  };

  new vis.Network(container, dataSet, options);
}
