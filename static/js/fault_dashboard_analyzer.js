/**
 * 분야별 장애의심 장비 노드와 링크 분석을 위한 룰 베이스 시스템
 *
 * 주요 기능:
 * 1. 선로 분야 링크 장애 판단
 * 2. MW-MW 구간 페이딩 체크 (API 호출)
 * 3. MW 장비 한전 정전 체크 (API 호출)
 * 4. 장애 시각화 처리
 */

// 🔴 🟡 🟢 ✅ ⚡ 💡 ✨ 🎯 📊 ❌ ⏱️

// 상수 정의
const FAILURE_TYPES = {
  LINE_FAILURE: 'line_failure',
  MW_FADING: 'mw_fading',
  MW_POWER_FAILURE: 'mw_power_failure',
  ROOT_CAUSE: 'root_cause',
};

const VISUAL_EFFECTS = {
  BLINK_DURATION: 1000,
  STROKE_WIDTH_NORMAL: 3,
  STROKE_WIDTH_HIGHLIGHT: 6,
  LABEL_OFFSET_Y: -20,
};

// 전역 변수
let failureAnalysisResults = {
  lineFailures: [],
  mwFadingLinks: [],
  mwPowerFailures: [],
  analysisTimestamp: null,
};

// 메인 장애 분석 함수 - 모든 분석을 순서대로 실행
async function analyzeFailurePatterns(nodesData, linksData, alarmDataList) {
  console.log('=== 장애 패턴 분석 시작 ===');

  try {
    // 분석 결과 초기화
    resetFailureAnalysis();

    // 1. 선로 분야 링크 장애 체크 - 메시지 제거
    console.log('1. 선로 분야 링크 장애 분석 중...');
    await checkLineFailure(linksData, alarmDataList);

    // 2. MW-MW 구간 페이딩 체크 - 메시지 제거
    console.log('2. MW-MW 구간 페이딩 분석 중...');
    await checkMWFading(linksData, nodesData, alarmDataList);

    // 3. MW 장비 한전 정전 체크 - 메시지 제거
    console.log('3. MW 장비 한전 정전 분석 중...');
    await checkMWPowerFailure(nodesData, alarmDataList);

    // 4. 분석 결과 시각화 적용
    console.log('4. 장애 시각화 적용 중...');
    applyFailureVisualization();

    // 5. 분석 결과 요약 출력
    printAnalysisSummary();

    console.log('=== 장애 패턴 분석 완료 ===');
  } catch (error) {
    console.error('장애 패턴 분석 중 오류 발생:', error);
    if (typeof addChatMessage === 'function') {
      addChatMessage(`❌ <strong>분석 중 오류 발생:</strong> ${error.message}`, 'error');
    }
  }
}

async function checkLineFailure(linksData, alarmDataList) {
  console.log('선로 분야 링크 장애 체크 시작...');

  const lineFailureLinks = [];

  if (!linksData || !Array.isArray(linksData)) {
    console.warn('링크 데이터가 없습니다.');
    return;
  }

  linksData.forEach((link, index) => {
    try {
      const sourceField = link.sourceField;
      const targetField = link.targetField;
      const isLineLink = sourceField === '선로' || targetField === '선로';

      if (isLineLink) {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;

        const hasAlarm =
          alarmDataList &&
          alarmDataList.some(
            (alarm) => alarm && (alarm.equip_id === sourceId || alarm.equip_id === targetId)
          );

        if (hasAlarm) {
          const failureInfo = {
            linkIndex: index,
            linkId: `${sourceId}-${targetId}`,
            sourceId: sourceId,
            targetId: targetId,
            sourceField: sourceField,
            targetField: targetField,
            failureType: FAILURE_TYPES.LINE_FAILURE,
            description: '선로 분야 링크 장애 의심',
            timestamp: new Date().toISOString(),
          };

          lineFailureLinks.push(failureInfo);
          console.log(`선로 링크 장애 발견: ${sourceId} <-> ${targetId}`);
        }
      }
    } catch (error) {
      console.error(`링크 ${index} 분석 중 오류:`, error);
    }
  });

  // 결과 저장
  failureAnalysisResults.lineFailures = lineFailureLinks;

  // 🔥 제거: addChatMessage 호출 부분 삭제
  // (printAnalysisSummary에서 통합해서 처리)

  console.log(`선로 분야 링크 장애 체크 완료: ${lineFailureLinks.length}개 발견`);
}

// MW 장비간 링크에서 페이딩 현상 확인 및 API 호출
async function checkMWFading(linksData, nodesData, alarmDataList) {
  console.log('MW-MW 구간 페이딩 체크 시작...');

  const mwFadingResults = [];

  if (!linksData || !Array.isArray(linksData)) {
    console.warn('링크 데이터가 없습니다.');
    if (typeof addChatMessage === 'function') {
      addChatMessage('<strong>❌ 2. MW-MW 구간 페이딩 분석:</strong> 링크 데이터 없음', 'error');
    }
    return;
  }

  const mwLinks = linksData.filter((link) => {
    const sourceField = link.sourceField;
    const targetField = link.targetField;
    return sourceField === 'MW' && targetField === 'MW';
  });

  console.log(`MW-MW 링크 ${mwLinks.length}개 발견`);

  for (const link of mwLinks) {
    try {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;

      const hasAlarm =
        alarmDataList &&
        alarmDataList.some(
          (alarm) => alarm && (alarm.equip_id === sourceId || alarm.equip_id === targetId)
        );

      if (hasAlarm) {
        const fadingResult = await callMWFadingAPI(sourceId, targetId);

        if (fadingResult && fadingResult.is_fading === 'fading') {
          const fadingInfo = {
            linkId: `${sourceId}-${targetId}`,
            sourceId: sourceId,
            targetId: targetId,
            failureType: FAILURE_TYPES.MW_FADING,
            description: '페이딩 의심',
            apiResult: fadingResult,
            timestamp: new Date().toISOString(),
          };

          mwFadingResults.push(fadingInfo);
          console.log(`MW 페이딩 발견: ${sourceId} <-> ${targetId}`);
        }
      }
    } catch (error) {
      console.error(`MW 페이딩 체크 오류 (${link.source} <-> ${link.target}):`, error);
    }
  }

  // 결과 저장
  failureAnalysisResults.mwFadingLinks = mwFadingResults;

  console.log(`MW-MW 구간 페이딩 체크 완료: ${mwFadingResults.length}개 발견`);
}

async function checkMWPowerFailure(nodesData, alarmDataList) {
  console.log('MW 장비 한전 정전 체크 시작...');

  const mwPowerFailures = [];

  if (!nodesData || !Array.isArray(nodesData)) {
    console.warn('노드 데이터가 없습니다.');
    if (typeof addChatMessage === 'function') {
      addChatMessage('<strong>❌ 3. MW 장비 한전 정전 분석:</strong> 노드 데이터 없음', 'error');
    }
    return;
  }

  const mwNodes = nodesData.filter((node) => node && node.equip_field === 'MW');
  console.log(`MW 장비 ${mwNodes.length}개 발견`);

  for (const node of mwNodes) {
    try {
      const hasAlarm = node.alarms && node.alarms.length > 0;

      if (hasAlarm) {
        const powerResult = await callMWPowerAPI(node.equip_id, node.guksa_name);

        if (powerResult && powerResult.battery_mode === 'battery') {
          const powerFailureInfo = {
            nodeId: node.equip_id,
            equipName: node.equip_name,
            equipType: node.equip_type,
            guksaName: node.guksa_name,
            failureType: FAILURE_TYPES.MW_POWER_FAILURE,
            description: '한전 정전 의심 장비',
            apiResult: powerResult,
            timestamp: new Date().toISOString(),
          };

          mwPowerFailures.push(powerFailureInfo);
          console.log(`MW 정전 의심: ${node.equip_name} (${node.equip_id})`);
        }
      }
    } catch (error) {
      console.error(`MW 정전 체크 오류 (${node.equip_id}):`, error);
    }
  }

  // 결과 저장
  failureAnalysisResults.mwPowerFailures = mwPowerFailures;

  console.log(`MW 장비 한전 정전 체크 완료: ${mwPowerFailures.length}개 발견`);
}

// MW 페이딩 체크 API 호출
async function callMWFadingAPI(sourceEquipId, targetEquipId) {
  try {
    const requestData = {
      source_equip_id: sourceEquipId,
      target_equip_id: targetEquipId,
      check_type: 'fading_analysis',
    };

    const response = await fetch('/api/check_mw_fading', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      throw new Error(`❌ API 호출 실패: ${response.status}`);
    }

    const result = await response.json();
    console.log(`MW 페이딩 API 결과 (${sourceEquipId}-${targetEquipId}):`, result);

    return result;
  } catch (error) {
    console.error('MW 페이딩 API 호출 오류:', error);
    return null;
  }
}

// MW 정전 체크 API 호출
async function callMWPowerAPI(equipId, guksaName) {
  try {
    const requestData = {
      equip_id: equipId,
      guksa_name: guksaName,
      check_type: 'power_analysis',
    };

    const response = await fetch('/api/check_mw_power', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      throw new Error(`❌ API 호출 실패: ${response.status}`);
    }

    const result = await response.json();
    console.log(`MW 정전 API 결과 (${equipId}):`, result);

    return result;
  } catch (error) {
    console.error('MW 정전 API 호출 오류:', error);
    return null;
  }
}

// 분석 결과를 맵에 시각적으로 표시
function applyFailureVisualization() {
  console.log('장애 시각화 적용 시작...');

  // 기존 장애 표시 제거
  clearFailureVisualization();

  // 1. 선로 링크 장애 시각화
  applyLineFailureVisualization();

  // 2. MW 페이딩 링크 시각화
  applyMWFadingVisualization();

  // 3. MW 정전 노드 시각화
  applyMWPowerFailureVisualization();

  console.log('장애 시각화 적용 완료');
}

// 선로 링크 장애 시각화
function applyLineFailureVisualization() {
  if (!failureAnalysisResults.lineFailures || failureAnalysisResults.lineFailures.length === 0) {
    return;
  }

  console.log(`선로 링크 장애 시각화: ${failureAnalysisResults.lineFailures.length}개`);

  failureAnalysisResults.lineFailures.forEach((failure) => {
    // 링크 찾기
    const linkElement = d3.selectAll('.equip-link').filter((d) => {
      const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
      const targetId = typeof d.target === 'object' ? d.target.id : d.target;
      return (
        (sourceId === failure.sourceId && targetId === failure.targetId) ||
        (sourceId === failure.targetId && targetId === failure.sourceId)
      );
    });

    if (!linkElement.empty()) {
      // 링크 블링크 효과 적용
      applyLinkBlinkEffect(linkElement, '선로 장애 의심', '#FF4444');
    }
  });
}

// MW 페이딩 링크 시각화
function applyMWFadingVisualization() {
  if (!failureAnalysisResults.mwFadingLinks || failureAnalysisResults.mwFadingLinks.length === 0) {
    return;
  }

  console.log(`MW 페이딩 링크 시각화: ${failureAnalysisResults.mwFadingLinks.length}개`);

  failureAnalysisResults.mwFadingLinks.forEach((failure) => {
    // 링크 찾기
    const linkElement = d3.selectAll('.equip-link').filter((d) => {
      const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
      const targetId = typeof d.target === 'object' ? d.target.id : d.target;
      return (
        (sourceId === failure.sourceId && targetId === failure.targetId) ||
        (sourceId === failure.targetId && targetId === failure.sourceId)
      );
    });

    if (!linkElement.empty()) {
      // 링크 블링크 효과 적용
      applyLinkBlinkEffect(linkElement, '페이딩 의심', '#FF8800');
    }
  });
}

// MW 정전 노드 시각화
function applyMWPowerFailureVisualization() {
  if (
    !failureAnalysisResults.mwPowerFailures ||
    failureAnalysisResults.mwPowerFailures.length === 0
  ) {
    return;
  }

  console.log(`MW 정전 노드 시각화: ${failureAnalysisResults.mwPowerFailures.length}개`);

  failureAnalysisResults.mwPowerFailures.forEach((failure) => {
    // 노드 찾기
    const nodeElement = d3.selectAll('.equip-node').filter((d) => d.equip_id === failure.nodeId);

    if (!nodeElement.empty()) {
      // 노드 블링크 효과 적용
      applyNodeBlinkEffect(nodeElement, '한전 정전 의심 장비', '#AA0000');
    }
  });
}

// 링크 블링크 효과 적용
function applyLinkBlinkEffect(linkElement, labelText, color) {
  // 링크 그룹 가져오기
  const linkGroup = d3.select(linkElement.node().parentNode);

  // 블링크 효과를 위한 클래스 추가
  linkGroup.classed('failure-blink-link', true);

  // 링크 스타일 변경
  linkElement.attr('stroke', color).attr('stroke-width', VISUAL_EFFECTS.STROKE_WIDTH_HIGHLIGHT);

  // 애니메이션 적용
  linkElement.node().innerHTML = `
    <animate attributeName="stroke-width" 
             values="${VISUAL_EFFECTS.STROKE_WIDTH_NORMAL};${VISUAL_EFFECTS.STROKE_WIDTH_HIGHLIGHT};${VISUAL_EFFECTS.STROKE_WIDTH_NORMAL}" 
             dur="${VISUAL_EFFECTS.BLINK_DURATION}ms" 
             repeatCount="indefinite" />
    <animate attributeName="stroke-opacity" 
             values="1;0.3;1" 
             dur="${VISUAL_EFFECTS.BLINK_DURATION}ms" 
             repeatCount="indefinite" />
  `;

  // 라벨 추가
  addFailureLabel(linkGroup, labelText, color, true);
}

// 노드 블링크 효과 적용
function applyNodeBlinkEffect(nodeElement, labelText, color) {
  // 블링크 효과를 위한 클래스 추가
  nodeElement.classed('failure-blink-node', true);

  // 노드 외곽선 스타일 변경
  nodeElement
    .select('rect')
    .attr('stroke', color)
    .attr('stroke-width', VISUAL_EFFECTS.STROKE_WIDTH_HIGHLIGHT);

  // 애니메이션 적용
  nodeElement.select('rect').node().innerHTML = `
    <animate attributeName="stroke-width" 
             values="${VISUAL_EFFECTS.STROKE_WIDTH_NORMAL};${VISUAL_EFFECTS.STROKE_WIDTH_HIGHLIGHT};${VISUAL_EFFECTS.STROKE_WIDTH_NORMAL}" 
             dur="${VISUAL_EFFECTS.BLINK_DURATION}ms" 
             repeatCount="indefinite" />
    <animate attributeName="stroke-opacity" 
             values="1;0.3;1" 
             dur="${VISUAL_EFFECTS.BLINK_DURATION}ms" 
             repeatCount="indefinite" />
  `;

  // 라벨 추가
  addFailureLabel(nodeElement, labelText, color, false);
}

// 장애 라벨 추가
function addFailureLabel(element, labelText, color, isLink) {
  // 기존 장애 라벨 제거
  element.selectAll('.failure-label').remove();

  // 새 라벨 추가
  const label = element
    .append('text')
    .attr('class', 'failure-label')
    .attr('fill', color)
    .attr('font-size', '12px')
    .attr('font-weight', 'bold')
    .attr('text-anchor', 'middle')
    .text(`(${labelText})`)
    .style('pointer-events', 'none');

  if (isLink) {
    // 링크 라벨 위치 설정
    label
      .attr('x', function () {
        const linkData = d3.select(this.parentNode).datum();
        if (!linkData.source || !linkData.target) return 0;
        const sourceX =
          typeof linkData.source === 'object' ? linkData.source.x : equipmentMap[linkData.source].x;
        const targetX =
          typeof linkData.target === 'object' ? linkData.target.x : equipmentMap[linkData.target].x;
        return (sourceX + targetX) / 2;
      })
      .attr('y', function () {
        const linkData = d3.select(this.parentNode).datum();
        if (!linkData.source || !linkData.target) return 0;
        const sourceY =
          typeof linkData.source === 'object' ? linkData.source.y : equipmentMap[linkData.source].y;
        const targetY =
          typeof linkData.target === 'object' ? linkData.target.y : equipmentMap[linkData.target].y;
        return (sourceY + targetY) / 2 + VISUAL_EFFECTS.LABEL_OFFSET_Y;
      });
  } else {
    // 노드 라벨 위치 설정 (노드 위쪽)
    label.attr('x', NODE_WIDTH / 2).attr('y', VISUAL_EFFECTS.LABEL_OFFSET_Y);
  }
}

// 기존 장애 시각화 제거
function clearFailureVisualization() {
  console.log('기존 장애 시각화 제거...');

  // 블링크 클래스 제거
  d3.selectAll('.failure-blink-link, .failure-blink-node').classed(
    'failure-blink-link failure-blink-node',
    false
  );

  // 장애 라벨 제거
  d3.selectAll('.failure-label').remove();

  // 링크 스타일 복원
  d3.selectAll('.equip-link')
    .attr('stroke', '#FF0000')
    .attr('stroke-width', VISUAL_EFFECTS.STROKE_WIDTH_NORMAL)
    .each(function () {
      // 애니메이션 제거
      this.innerHTML = '';
    });

  // 노드 스타일 복원 (기존 root-cause가 아닌 경우만)
  d3.selectAll('.equip-node')
    .filter(function () {
      return !d3.select(this).classed('root-cause-node');
    })
    .select('rect')
    .attr('stroke', '#fff')
    .attr('stroke-width', 2)
    .each(function () {
      // 애니메이션 제거
      this.innerHTML = '';
    });
}

// 분석 결과 초기화
function resetFailureAnalysis() {
  failureAnalysisResults = {
    lineFailures: [],
    mwFadingLinks: [],
    mwPowerFailures: [],
    analysisTimestamp: new Date().toISOString(),
  };

  console.log('장애 분석 결과 초기화 완료');
}

// 분석 결과 요약 출력
function printAnalysisSummary() {
  console.log('=== 장애 분석 결과 요약 ===');
  console.log(`분석 시간: ${failureAnalysisResults.analysisTimestamp}`);
  console.log(`선로 링크 장애: ${failureAnalysisResults.lineFailures.length}개`);
  console.log(`MW 페이딩 링크: ${failureAnalysisResults.mwFadingLinks.length}개`);
  console.log(`MW 정전 장비: ${failureAnalysisResults.mwPowerFailures.length}개`);

  // 🔥 수정: 모든 분석 결과를 하나의 통합 메시지로 표시
  if (typeof addChatMessage === 'function') {
    const lineCount = failureAnalysisResults.lineFailures?.length || 0;
    const fadingCount = failureAnalysisResults.mwFadingLinks?.length || 0;
    const powerCount = failureAnalysisResults.mwPowerFailures?.length || 0;
    const totalFailures = lineCount + fadingCount + powerCount;

    // 통합된 하나의 메시지 생성
    let unifiedMessage = '<strong>🔍 장애점 찾기 분석 결과</strong><br><br>';

    unifiedMessage += `<strong>1. 선로 분야 장애:</strong> `;
    unifiedMessage += lineCount > 0 ? `🔴 ${lineCount}개 발견됨<br>` : `🟢 발견되지 않음<br>`;

    unifiedMessage += `<strong>2. MW-MW 구간 페이딩석:</strong> `;
    unifiedMessage +=
      fadingCount > 0 ? `🔴 ${fadingCount}개 페이딩 의심 링크 발견됨<br>` : `🟢 발견되지 않음<br>`;

    unifiedMessage += `<strong>3. MW 장비 한전 정전 추정:</strong> `;
    unifiedMessage +=
      powerCount > 0
        ? `🔴 ${powerCount}개 정전 의심 장비 발견됨<br><br>`
        : `🟢 배터리 모드 장비 없음<br><br>`;

    if (totalFailures > 0) {
      unifiedMessage += `<strong>📊 종합 결과:</strong> 총 ${totalFailures}개의 장애 패턴이 감지되었습니다.<br>`;
      unifiedMessage += `💡 맵에서 해당 장비/링크가 강조 표시됩니다.`;

      // 상세 결과를 채팅창에 표시
      setTimeout(() => {
        if (typeof displayFailureAnalysisResultsToChat === 'function') {
          displayFailureAnalysisResultsToChat();
        }
      }, 500);
    } else {
      unifiedMessage += `<strong>> 분석 완료:</strong> 모든 장비가 정상 상태입니다.`;
    }

    // 하나의 통합된 메시지로 표시
    addChatMessage(unifiedMessage, 'summary');
  }

  // 상세 결과 출력
  if (failureAnalysisResults.lineFailures.length > 0) {
    console.log('선로 링크 장애 상세:');
    failureAnalysisResults.lineFailures.forEach((failure, index) => {
      console.log(`  ${index + 1}. ${failure.sourceId} <-> ${failure.targetId}`);
    });
  }

  if (failureAnalysisResults.mwFadingLinks.length > 0) {
    console.log('MW 페이딩 링크 상세:');
    failureAnalysisResults.mwFadingLinks.forEach((failure, index) => {
      console.log(
        `  ${index + 1}. ${failure.sourceId} <-> ${failure.targetId} - ${
          failure.apiResult?.result_msg || 'N/A'
        }`
      );
    });
  }

  if (failureAnalysisResults.mwPowerFailures.length > 0) {
    console.log('MW 정전 장비 상세:');
    failureAnalysisResults.mwPowerFailures.forEach((failure, index) => {
      console.log(
        `  ${index + 1}. ${failure.equipName} (${failure.nodeId}) - ${
          failure.apiResult?.result_msg || 'N/A'
        }`
      );
    });
  }

  console.log('=== 분석 결과 요약 완료 ===');
}

// 분석 결과 가져오기 (외부에서 접근용)
function getFailureAnalysisResults() {
  return JSON.parse(JSON.stringify(failureAnalysisResults));
}

// 특정 타입의 장애만 시각화 토글
function toggleFailureTypeVisualization(failureType, show = true) {
  switch (failureType) {
    case FAILURE_TYPES.LINE_FAILURE:
      if (show) {
        applyLineFailureVisualization();
      } else {
        // 선로 장애 시각화만 제거
        d3.selectAll('.failure-blink-link')
          .filter(function () {
            return d3.select(this).select('.failure-label').text().includes('선로 장애');
          })
          .classed('failure-blink-link', false)
          .selectAll('.failure-label')
          .remove();
      }
      break;

    case FAILURE_TYPES.MW_FADING:
      if (show) {
        applyMWFadingVisualization();
      } else {
        // MW 페이딩 시각화만 제거
        d3.selectAll('.failure-blink-link')
          .filter(function () {
            return d3.select(this).select('.failure-label').text().includes('페이딩');
          })
          .classed('failure-blink-link', false)
          .selectAll('.failure-label')
          .remove();
      }
      break;

    case FAILURE_TYPES.MW_POWER_FAILURE:
      if (show) {
        applyMWPowerFailureVisualization();
      } else {
        // MW 정전 시각화만 제거
        d3.selectAll('.failure-blink-node')
          .filter(function () {
            return d3.select(this).select('.failure-label').text().includes('정전');
          })
          .classed('failure-blink-node', false)
          .selectAll('.failure-label')
          .remove();
      }
      break;
  }
}

// 외부에서 접근 가능하도록 전역 함수로 등록
window.analyzeFailurePatterns = analyzeFailurePatterns;
window.getFailureAnalysisResults = getFailureAnalysisResults;
window.clearFailureVisualization = clearFailureVisualization;
window.toggleFailureTypeVisualization = toggleFailureTypeVisualization;

// 채팅창 초기화 함수
function clearChatMessages() {
  const chatArea = document.getElementById('chat-messages-area');
  if (!chatArea) return;

  // 시스템 초기 메시지만 남기고 모든 메시지 제거
  chatArea.innerHTML = `
    <div class="chat-message system">
      <div class="message-content">
        💡 장애점 찾기 버튼을 클릭하면 AI 분석 결과가 여기에 표시됩니다.
      </div>
      <div class="message-time">${new Date().toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
      })}</div>
    </div>
  `;

  console.log('채팅창이 초기화되었습니다.');
}

// 장애점 찾기 버튼 클릭 시 분석 실행 함수
async function runFailureAnalysis() {
  console.log('장애점 찾기 버튼 클릭 - 분석 시작');

  // 현재 맵에 표시된 노드와 링크 데이터 가져오기
  const currentNodes = d3.selectAll('.equip-node').data();
  const currentLinks = d3.selectAll('.equip-link').data();

  if (!currentNodes || currentNodes.length === 0) {
    addChatMessage(
      '❌ <strong>분석할 장비 데이터가 없습니다.</strong><br>먼저 장비를 선택해주세요.',
      'error'
    );
    return;
  }

  if (!_totalAlarmDataList || _totalAlarmDataList.length === 0) {
    addChatMessage(
      '❌ <strong>경보 데이터가 없습니다.</strong><br>실시간 경보 수집을 먼저 실행해주세요.',
      'error'
    );
    return;
  }

  try {
    // 분석 실행 메시지
    addChatMessage('🔍 <strong>장애점 분석을 시작합니다...</strong>', 'analyzing');

    // 장애 패턴 분석 실행
    await analyzeFailurePatterns(currentNodes, currentLinks, _totalAlarmDataList);

    console.log('장애점 찾기 분석 완료');
  } catch (error) {
    console.error('장애점 찾기 분석 중 오류:', error);
    addChatMessage(`❌ <strong>분석 중 오류가 발생했습니다:</strong> ${error.message}`, 'error');
  }
}

// 전역 함수로 등록
window.clearChatMessages = clearChatMessages;
window.runFailureAnalysis = runFailureAnalysis;
