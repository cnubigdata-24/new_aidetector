/**
 * 장애점 추정 관리자 (싱글톤)
 */

import CommonUtils from '../utils/CommonUtils.js';
import MessageManager from '../utils/MessageManager.js';
import { stateManager as StateManager } from './StateManager.js';

class FailurePointManager {
  constructor() {
    this.isAnalyzing = false;
    this.currentFailurePoints = [];
    this.animationElements = [];

    // 오류 메시지 중복 방지 플래그
    this._linkErrorShown = false;
    this._nodeErrorShown = false;
  }

  /**
   * 장애점 분석 시작
   * @param {Array} nodes - 현재 맵의 노드들
   * @param {Array} links - 현재 맵의 링크들
   * @param {Array} alarmData - 전체 경보 정보
   */
  async analyzeFailurePoints(nodes, links, alarmData) {
    if (this.isAnalyzing) {
      console.warn('이미 장애점 분석이 진행 중입니다.');
      return;
    }

    try {
      this.isAnalyzing = true;

      // 분석 시작 메시지 (제거 - 중복 방지)
      // MessageManager.addAnalyzingMessage('🔍 장애점 분석을 시작합니다...');

      // API 요청 데이터 준비
      const requestData = this.prepareAnalysisData(nodes, links, alarmData);

      // 장애점 추정 API 호출
      const result = await this.callFailurePointAPI(requestData);

      // 결과 처리
      await this.processAnalysisResult(result);
    } catch (error) {
      this.handleAnalysisError(error);
    } finally {
      this.isAnalyzing = false;
    }
  }

  /**
   * 분석 데이터 준비
   */
  prepareAnalysisData(nodes, links, alarmData) {
    console.log('📊 장애점 분석 데이터 준비 중...');

    // 입력 데이터 로깅
    console.log('📥 입력 데이터 현황:');
    console.log('  - nodes:', nodes.length, '개');
    console.log('  - links:', links.length, '개');
    console.log('  - alarmData:', alarmData.length, '개');

    // 노드별 경보 수 확인
    console.log('📊 노드별 경보 현황:');
    nodes.forEach((node, index) => {
      const nodeAlarms = node.alarms || [];
      console.log(`  [${index + 1}] ${node.name}: ${nodeAlarms.length}개 경보`);
    });

    // 링크별 경보 수 확인
    console.log('📊 링크별 경보 현황:');
    links.forEach((link, index) => {
      const linkAlarms = link.alarms || [];
      console.log(`  [${index + 1}] ${link.link_name}: ${linkAlarms.length}개 경보`);
    });

    // 전체 경보 데이터 필터링 확인
    const filteredAlarmData = alarmData.filter((alarm) => alarm); // 모든 경보 포함 (유효+무효)
    console.log('📊 전체 경보 필터링 결과:', alarmData.length, '→', filteredAlarmData.length);

    const requestData = {
      nodes: nodes.map((node) => ({
        id: node.id,
        name: node.name,
        field: node.field,
        guksa: node.guksa,
        up_down: node.up_down,
        level: node.level,
        hasAlarm: node.hasAlarm,
        alarmCount: node.alarmCount,
        validAlarmCount: node.validAlarmCount,
        alarms: node.alarms || [],
      })),
      links: links.map((link) => ({
        id: link.id,
        source: typeof link.source === 'object' ? link.source.id : link.source,
        target: typeof link.target === 'object' ? link.target.id : link.target,
        link_name: link.link_name,
        link_field: link.link_field,
        up_down: link.up_down,
        alarms: link.alarms || [],
      })),
      alarms: filteredAlarmData,
    };

    // 최종 전송 데이터 로깅
    console.log('🚀 서버로 전송할 데이터:');
    console.log('  - nodes:', requestData.nodes.length, '개');
    console.log('  - links:', requestData.links.length, '개');
    console.log('  - alarms:', requestData.alarms.length, '개');
    console.log('  - 첫 번째 노드 샘플:', requestData.nodes[0]);
    if (requestData.links.length > 0) {
      console.log('  - 첫 번째 링크 샘플:', requestData.links[0]);
    }

    return requestData;
  }

  /**
   * 장애점 추정 API 호출
   */
  async callFailurePointAPI(requestData) {
    console.log('🚀 장애점 추정 API 호출 중...');

    // 세션 ID 생성
    const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    // 스트리밍 요청 데이터 준비
    const streamingRequestData = {
      ...requestData,
      streaming: true,
      session_id: sessionId,
    };

    try {
      // 1. 스트리밍 분석 시작 요청
      const startResponse = await CommonUtils.callApi(
        '/api/infer_failure_point',
        streamingRequestData,
        {
          method: 'POST',
          timeout: 10000,
        }
      );

      if (!startResponse || !startResponse.success) {
        throw new Error(startResponse?.error || '장애점 분석 시작 실패');
      }

      console.log('📡 스트리밍 분석 시작됨, 세션 ID:', sessionId);

      // 2. 스트리밍 데이터 수신
      return new Promise((resolve, reject) => {
        const eventSource = new EventSource(`/api/infer_failure_point_stream/${sessionId}`);
        let finalResult = null;

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            switch (data.type) {
              case 'progress':
                // 진행 상황을 채팅창에 표시
                MessageManager.addErrorMessage(data.message);
                console.log('📋 진행상황:', data.message);
                break;

              case 'result':
                // 최종 결과 저장
                finalResult = data.data;
                console.log('✅ 분석 결과 수신 완료');
                break;

              case 'complete':
                // 분석 완료
                eventSource.close();
                if (finalResult) {
                  resolve(finalResult);
                } else {
                  reject(new Error('분석 결과를 받지 못했습니다.'));
                }
                break;

              case 'error':
                // 오류 발생
                eventSource.close();
                reject(new Error(data.message || '분석 중 오류 발생'));
                break;

              case 'heartbeat':
                // 연결 유지 신호 - 무시
                break;

              default:
                console.log('📡 알 수 없는 메시지 타입:', data.type);
            }
          } catch (parseError) {
            console.error('❌ 스트리밍 데이터 파싱 오류:', parseError);
          }
        };

        eventSource.onerror = (error) => {
          console.error('❌ 스트리밍 연결 오류:', error);
          eventSource.close();
          reject(new Error('스트리밍 연결 오류'));
        };

        // 타임아웃 설정 (120초)
        setTimeout(() => {
          if (eventSource.readyState !== EventSource.CLOSED) {
            eventSource.close();
            reject(new Error('분석 시간이 초과되었습니다.'));
          }
        }, 120000);
      });
    } catch (error) {
      console.error('❌ 스트리밍 API 호출 실패:', error);

      // 폴백: 기존 동기 방식으로 재시도
      console.log('🔄 기존 동기 방식으로 재시도...');
      MessageManager.addAnalyzingMessage('🔄 기존 방식으로 재시도 중...');

      const response = await CommonUtils.callApi('/api/infer_failure_point', requestData, {
        method: 'POST',
        timeout: 30000,
        onProgress: (status) => {
          MessageManager.addAnalyzingMessage(`🔍 장애점을 분석/추정 중...: ${status}`);
        },
      });

      if (!response || response.error) {
        throw new Error(response?.error || '장애점 분석 API 호출 실패');
      }

      return response;
    }
  }

  /**
   * 분석 결과 처리
   */
  async processAnalysisResult(result) {
    try {
      console.log('📋 장애점 분석 결과 처리 중...', result);

      // result 객체 안전성 확보
      const safeResult = result || {};
      this.currentFailurePoints = safeResult.failure_points || [];
      const summary = safeResult.summary || {};

      // 결과 요약 메시지
      this.showSummaryMessage(summary);

      // 장애점이 있으면 맵에 애니메이션 표시
      if (this.currentFailurePoints.length > 0) {
        await this.highlightFailurePointsOnMap();
        this.showDetailedResults();
      } else {
        MessageManager.addSuccessMessage('✅ 분석 완료: 현재 감지된 장애점이 없습니다.');
      }

      console.log('📋 장애점 분석 결과 처리 완료');
    } catch (error) {
      console.error('❌ 장애점 분석 결과 처리 중 오류:', error);

      // 안전한 폴백 처리
      this.currentFailurePoints = [];
      try {
        MessageManager.addErrorMessage('장애점 분석 결과 처리 중 오류가 발생했습니다.');
      } catch (messageError) {
        console.error('❌ 오류 메시지 추가도 실패:', messageError);
      }
    }
  }

  /**
   * 요약 메시지 표시
   */
  showSummaryMessage(summary) {
    try {
      // summary 객체 안전성 확보
      const safeSummary = summary || {};

      const message = `
        📌 장애점 분석/추론이 완료되었습니다.<br><br>
        • 장애점 추정 결과: 총 ${safeSummary.total_failure_points || 0}개<br>
        ----------------------------------------------------<br>
        • 1단계) 선로 장애점: ${safeSummary.link_failures || 0}개<br>
        • 2단계) MW 장애점: ${safeSummary.mw_equipment_failures || 0}개 (페이딩: ${
        safeSummary.mw_fading_failures || 0
      }개, 전압: ${safeSummary.mw_voltage_failures || 0}개)<br>
        • 3단계) 상위 노드 장애점: ${safeSummary.upper_node_failures || 0}개<br>
        • 4단계) 교환 장애점: ${safeSummary.exchange_failures || 0}개<br>
        • 5단계) 전송 장애점: ${safeSummary.transmission_failures || 0}개
      `;

      MessageManager.addErrorMessage(message, { type: 'error' });

      console.log('📋 장애점 분석 요약 메시지 표시 완료');
    } catch (error) {
      console.error('❌ 요약 메시지 표시 중 오류:', error);

      // 폴백 메시지
      const fallbackMessage = '📌 장애점 분석이 완료되었습니다. 자세한 결과는 콘솔을 확인해주세요.';
      try {
        MessageManager.addErrorMessage(fallbackMessage, { type: 'error' });
      } catch (fallbackError) {
        console.error('❌ 폴백 메시지도 실패:', fallbackError);
      }
    }
  }

  /**
   * 맵에서 장애점 하이라이트 표시
   */
  async highlightFailurePointsOnMap() {
    console.log('🎨 맵에서 장애점 하이라이트 표시 중...');

    // 맵이 로드되었는지 확인
    if (!this.isMapReady()) {
      console.warn('⚠️ 맵이 아직 준비되지 않았습니다. 잠시 후 다시 시도합니다.');

      // 잠시 후 재시도
      setTimeout(() => {
        if (this.isMapReady()) {
          this.highlightFailurePointsOnMap();
        } else {
          MessageManager.addMessage(
            '⚠️ 네트워크 토폴로지 맵이 로드되지 않아 장애점 표시가 제한됩니다.',
            { type: 'warning' }
          );
        }
      }, 1000);
      return;
    }

    // 기존 애니메이션 정리
    this.clearHighlights();

    // 장애점별 하이라이트 처리
    this.currentFailurePoints.forEach((failurePoint, index) => {
      setTimeout(() => {
        if (failurePoint.type === 'node') {
          this.highlightFailureNode(failurePoint.id);
        } else if (failurePoint.type === 'link') {
          this.highlightFailureLink(failurePoint.id);
        }
      }, index * 300); // 순차적으로 애니메이션 적용
    });
  }

  /**
   * 맵 준비 상태 확인
   */
  isMapReady() {
    // D3 엘리먼트 존재 확인
    const hasNodes = !d3.selectAll('.nodes .node-group').empty();
    const hasLinks = !d3.selectAll('.links line').empty();
    const hasMapContainer = document.getElementById('map-container') !== null;

    console.log(`맵 상태 확인: 노드=${hasNodes}, 링크=${hasLinks}, 컨테이너=${hasMapContainer}`);

    return hasMapContainer && (hasNodes || hasLinks);
  }

  /**
   * 장애점 노드 하이라이트
   */
  highlightFailureNode(nodeId) {
    try {
      console.log(`🔵 노드 하이라이트 시도: ${nodeId}`);

      // D3가 로드되었는지 확인
      if (typeof d3 === 'undefined') {
        console.warn('⚠️ D3.js가 로드되지 않았습니다.');
        return;
      }

      // 노드 컨테이너 존재 확인
      const nodesContainer = d3.select('.nodes');
      if (nodesContainer.empty()) {
        console.warn('⚠️ 노드 컨테이너(.nodes)를 찾을 수 없습니다.');
        return;
      }

      // 모든 노드 그룹 조회
      const allNodes = nodesContainer.selectAll('.node-group');
      if (allNodes.empty()) {
        console.warn('⚠️ 노드 그룹(.node-group)이 없습니다.');
        return;
      }

      // 여러 방법으로 노드 엘리먼트 찾기
      let nodeElement = null;
      let foundMethod = '';

      // 방법 1: 정확한 ID 매칭
      nodeElement = allNodes.filter(function (d) {
        return d && d.id === nodeId;
      });

      if (!nodeElement.empty()) {
        foundMethod = '정확한 ID 매칭';
      } else {
        // 방법 2: 부분 매칭
        nodeElement = allNodes.filter(function (d) {
          if (!d) return false;
          return d.id && (d.id.includes(nodeId) || nodeId.includes(d.id));
        });

        if (!nodeElement.empty()) {
          foundMethod = '부분 매칭';
        }
      }

      if (!nodeElement.empty()) {
        console.log(`✅ 노드 엘리먼트 발견 (${foundMethod}): ${nodeId}`);

        // circle 엘리먼트 확인
        const circle = nodeElement.select('circle');
        if (!circle.empty()) {
          // 안전한 애니메이션 적용
          this.applyNodeAnimation(nodeElement, circle, nodeId);
        } else {
          console.warn(`⚠️ 노드 circle 엘리먼트를 찾을 수 없음: ${nodeId}`);
        }
      } else {
        console.warn(`⚠️ 노드 엘리먼트를 찾을 수 없음: ${nodeId}`);
        this.debugNodeElements(allNodes);
      }
    } catch (error) {
      console.error(`❌ 노드 하이라이트 최상위 오류 (${nodeId}):`, error);

      // 사용자에게 알림 (너무 많은 메시지 방지)
      if (!this._nodeErrorShown) {
        MessageManager.addMessage(`⚠️ 노드 하이라이트 표시 중 오류가 발생했습니다.`, {
          type: 'warning',
        });
        this._nodeErrorShown = true;
      }
    }
  }

  /**
   * 장애점 노드 애니메이션 적용
   */
  applyNodeAnimation(nodeElement, circle, nodeId) {
    try {
      // 현재 스타일 저장
      const nodeData = nodeElement.datum();
      const originalStroke = nodeData?.isTarget ? '#004085' : '#fff';
      const originalWidth = nodeData?.isTarget ? '4px' : '2px';

      // 애니메이션 상태 플래그
      let isAnimating = true;

      // 애니메이션 함수
      const animate = () => {
        if (!isAnimating) return;

        try {
          circle
            .transition()
            .duration(300) // 애니매이션 속도 조절
            .ease(d3.easeQuadInOut) // 또는 .ease(d3.easeLinear)

            .attr('stroke', '#ff0000')
            .attr('stroke-width', '8px')
            .transition()
            .duration(300) // 애니매이션 속도 조절
            .ease(d3.easeQuadInOut) // 또는 .ease(d3.easeLinear)

            .attr('stroke', '#ff6b6b')
            .attr('stroke-width', '3px')
            .on('end', () => {
              if (isAnimating) {
                setTimeout(animate, 50); // 짧은 지연 후 반복
              }
            })
            .on('interrupt', () => {
              // 애니메이션 중단시 원래 스타일로 복원
              circle.attr('stroke', originalStroke).attr('stroke-width', originalWidth);
            });
        } catch (animError) {
          console.error(`노드 애니메이션 실행 오류 (${nodeId}):`, animError);
          isAnimating = false;
        }
      };

      // 애니메이션 시작
      animate();

      // 애니메이션 추적을 위해 저장
      this.animationElements.push({
        type: 'node',
        id: nodeId,
        element: nodeElement,
        circle: circle,
        stopAnimation: () => {
          isAnimating = false;
        },
        originalStyles: { originalStroke, originalWidth },
      });

      console.log(`✨ 노드 애니메이션 시작: ${nodeId}`);
    } catch (error) {
      console.error(`❌ 노드 애니메이션 적용 오류 (${nodeId}):`, error);
    }
  }

  /**
   * 노드 디버깅 정보 출력
   */
  debugNodeElements(allNodes) {
    try {
      console.log('🔍 현재 맵의 노드 디버깅 정보:');
      console.log(`  - 총 노드 수: ${allNodes.size()}`);

      const nodeData = [];
      allNodes.each(function (d, i) {
        if (d) {
          nodeData.push({
            index: i,
            id: d.id,
            name: d.name,
            field: d.field,
            isTarget: d.isTarget,
          });
        }
      });

      console.table(nodeData);
    } catch (debugError) {
      console.error('노드 디버깅 정보 출력 오류:', debugError);
    }
  }

  /**
   * 장애점 링크 하이라이트
   */
  highlightFailureLink(linkId) {
    try {
      console.log(`🔗 링크 하이라이트 시도: ${linkId}`);

      // D3가 로드되었는지 확인
      if (typeof d3 === 'undefined') {
        console.warn('⚠️ D3.js가 로드되지 않았습니다.');
        return;
      }

      // 링크 컨테이너 존재 확인
      const linksContainer = d3.select('.links');
      if (linksContainer.empty()) {
        console.warn('⚠️ 링크 컨테이너(.links)를 찾을 수 없습니다.');
        return;
      }

      // 모든 링크 엘리먼트 조회
      const allLinks = linksContainer.selectAll('line');
      if (allLinks.empty()) {
        console.warn('⚠️ 링크 엘리먼트(line)가 없습니다.');
        return;
      }

      // 여러 방법으로 링크 엘리먼트 찾기
      let linkElement = null;
      let foundMethod = '';

      // 방법 1: 정확한 ID 매칭
      linkElement = allLinks.filter(function (d) {
        return d && d.id === linkId;
      });

      if (!linkElement.empty()) {
        foundMethod = '정확한 ID 매칭';
      } else {
        // 방법 2: 소스-타겟 조합으로 찾기
        linkElement = allLinks.filter(function (d) {
          if (!d) return false;

          const parts = linkId.split('-');
          if (parts.length >= 2) {
            const sourceId = parts[0];
            const targetId = parts.slice(1).join('-');

            const sourceMatch = ((d.source && d.source.id) || d.source) === sourceId;
            const targetMatch = ((d.target && d.target.id) || d.target) === targetId;

            return sourceMatch && targetMatch;
          }
          return false;
        });

        if (!linkElement.empty()) {
          foundMethod = '소스-타겟 조합 매칭';
        }
      }

      // 방법 3: 부분 매칭 (마지막 수단)
      if (linkElement.empty()) {
        linkElement = allLinks.filter(function (d) {
          if (!d || !d.id) return false;
          return d.id.includes(linkId) || linkId.includes(d.id);
        });

        if (!linkElement.empty()) {
          foundMethod = '부분 매칭';
        }
      }

      if (!linkElement.empty()) {
        console.log(`✅ 링크 엘리먼트 발견 (${foundMethod}): ${linkId}`);

        // 애니메이션 적용
        this.applyLinkAnimation(linkElement, linkId);
      } else {
        console.warn(`⚠️ 링크 엘리먼트를 찾을 수 없음: ${linkId}`);
        this.debugLinkElements(allLinks);
      }
    } catch (error) {
      console.error(`❌ 링크 하이라이트 최상위 오류 (${linkId}):`, error);

      // 사용자에게 알림 (너무 많은 메시지 방지)
      if (!this._linkErrorShown) {
        MessageManager.addMessage(`⚠️ 링크 하이라이트 표시 중 오류가 발생했습니다.`, {
          type: 'warning',
        });
        this._linkErrorShown = true;
      }
    }
  }

  /**
   * 장애점 링크 애니메이션 적용
   */
  applyLinkAnimation(linkElement, linkId) {
    try {
      // 현재 스타일 저장
      const originalStroke = linkElement.attr('stroke') || '#666';
      const originalWidth = linkElement.attr('stroke-width') || '3';
      const originalOpacity = linkElement.attr('stroke-opacity') || '0.8';

      // 애니메이션 상태 플래그
      let isAnimating = true;

      // 애니메이션 함수
      const animate = () => {
        if (!isAnimating) return;

        try {
          linkElement
            .transition()
            .duration(300) // 애니매이션 속도 조절
            .ease(d3.easeQuadInOut) // 또는 .ease(d3.easeLinear)

            .attr('stroke', '#ff0000')
            .attr('stroke-width', '8px')
            .attr('stroke-opacity', '1')
            .transition()
            .duration(300) // 애니매이션 속도 조절
            .ease(d3.easeQuadInOut) // 또는 .ease(d3.easeLinear)

            .attr('stroke', '#ff6b6b')
            .attr('stroke-width', '4px')
            .attr('stroke-opacity', '0.8')
            .on('end', () => {
              if (isAnimating) {
                setTimeout(animate, 100); // 짧은 지연 후 반복
              }
            })
            .on('interrupt', () => {
              // 애니메이션 중단시 원래 스타일로 복원
              linkElement
                .attr('stroke', originalStroke)
                .attr('stroke-width', originalWidth)
                .attr('stroke-opacity', originalOpacity);
            });
        } catch (animError) {
          console.error(`애니메이션 실행 오류 (${linkId}):`, animError);
          isAnimating = false;
        }
      };

      // 애니메이션 시작
      animate();

      // 애니메이션 추적을 위해 저장
      this.animationElements.push({
        type: 'link',
        id: linkId,
        element: linkElement,
        stopAnimation: () => {
          isAnimating = false;
        },
        originalStyles: { originalStroke, originalWidth, originalOpacity },
      });

      console.log(`✨ 링크 애니메이션 시작: ${linkId}`);
    } catch (error) {
      console.error(`❌ 링크 애니메이션 적용 오류 (${linkId}):`, error);
    }
  }

  /**
   * 링크 디버깅 정보 출력
   */
  debugLinkElements(allLinks) {
    try {
      console.log('🔍 현재 맵의 링크 디버깅 정보:');
      console.log(`  - 총 링크 수: ${allLinks.size()}`);

      const linkData = [];
      allLinks.each(function (d, i) {
        if (d) {
          linkData.push({
            index: i,
            id: d.id,
            source: d.source?.id || d.source,
            target: d.target?.id || d.target,
            link_name: d.link_name,
          });
        }
      });

      console.table(linkData);
    } catch (debugError) {
      console.error('디버깅 정보 출력 오류:', debugError);
    }
  }

  /**
   * 상세 결과 메시지 표시
   */
  showDetailedResults() {
    this.currentFailurePoints.forEach((failurePoint, index) => {
      // StateManager에서 전체 경보 데이터 가져오기
      const allAlarmData = this.getAllAlarmData();

      // 장애점에 해당하는 모든 경보 찾기
      const relatedAlarms = this.findAllRelatedAlarms(failurePoint, allAlarmData);

      // 유효한 경보와 전체 경보 구분
      const validAlarms = relatedAlarms.filter((alarm) => alarm.valid_yn === 'Y');

      // FaultDashboardApp.js의 generateAlarmListHTML 로직 적용
      const alarmListHtml = this.generateAlarmListHTML(relatedAlarms);

      const message = `
      📌 <strong style="color: red;">장애점 #${index + 1} <br><br> ${
        failurePoint.name
      }</strong><br><br>
      • 유형: ${failurePoint.failure_type}<br>
      • ${failurePoint.type === 'node' ? '노드' : '링크'} ID: ${failurePoint.id}<br>
      • 추정 내역: ${failurePoint.inference_detail}<br>
      • 경보현황: 전체 ${relatedAlarms.length}건 (유효 ${validAlarms.length}건, 무효 ${
        relatedAlarms.length - validAlarms.length
      }건)
      ${alarmListHtml}
    `;

      MessageManager.addErrorMessage(message, { type: 'warning' });
    });
  }

  /**
   * StateManager에서 전체 경보 데이터 가져오기
   */
  getAllAlarmData() {
    try {
      // StateManager를 통해 전체 경보 데이터 가져오기
      const alarmData = StateManager.get('totalAlarmDataList', []);

      console.log(`📊 전체 경보 데이터 조회: ${alarmData.length}건`);
      return Array.isArray(alarmData) ? alarmData : [];
    } catch (error) {
      console.error('전체 경보 데이터 조회 실패:', error);
      return [];
    }
  }

  /**
   * 장애점과 관련된 모든 경보 찾기
   */
  findAllRelatedAlarms(failurePoint, allAlarmData) {
    try {
      const relatedAlarms = [];

      relatedAlarms.push(...this.findFailurePointAlarms(failurePoint, allAlarmData));

      // 중복 제거 (동일한 경보가 여러 번 포함될 수 있음)
      const uniqueAlarms = this.removeDuplicateAlarms(relatedAlarms);

      console.log(`🔍 장애점 "${failurePoint.name}"의 관련 경보: ${uniqueAlarms.length}건`);
      return uniqueAlarms;
    } catch (error) {
      console.error(`장애점 관련 경보 찾기 실패 (${failurePoint.id}):`, error);
      return failurePoint.alarms || []; // 기존 데이터로 폴백
    }
  }

  /**
   * 장애점의 관련 경보 찾기
   */
  findFailurePointAlarms(failurePoint, allAlarmData) {
    const nodeId = failurePoint.equip_id || failurePoint.id || '';
    const nodeName = failurePoint.equip_name || failurePoint.name || '';

    return allAlarmData.filter((alarm) => {
      if (!alarm) return false;

      // 정확 매칭만 수행 - StateManager와 동일한 로직
      if (alarm.equip_id === nodeId) {
        return true;
      }

      return false;
    });
  }

  /**
   * 중복 경보 제거
   */
  removeDuplicateAlarms(alarms) {
    const uniqueMap = new Map();

    alarms.forEach((alarm) => {
      // 고유 키 생성 (장비ID + 발생시간 + 경보메시지)
      const uniqueKey = `${alarm.equip_id || ''}_${alarm.occur_datetime || ''}_${
        alarm.alarm_message || ''
      }`;

      if (!uniqueMap.has(uniqueKey)) {
        uniqueMap.set(uniqueKey, alarm);
      }
    });

    return Array.from(uniqueMap.values());
  }

  generateAlarmListHTML(equipmentAlarms) {
    if (equipmentAlarms.length === 0) return '';

    const alarmItems = equipmentAlarms
      .sort((a, b) => new Date(b.occur_datetime) - new Date(a.occur_datetime))
      .map((alarm) => this.createAlarmItemHTML(alarm))
      .join('');

    return `
    <div class="alarm-details" style="max-height: 200px; overflow-y: auto; margin-top: 10px; padding: 8px; background: #f9f9f9; border-radius: 4px; border: 1px solid #ddd;">
      <div style="margin-top: 5px;">
        ${alarmItems}
      </div>
    </div>
  `;
  }

  createAlarmItemHTML(alarm) {
    const validBadge =
      alarm.valid_yn === 'Y'
        ? '<span style="background: #e74c3c; color: white; padding: 1px 4px; border-radius: 2px; font-size: 10px;">유효</span>'
        : '<span style="background: #95a5a6; color: white; padding: 1px 4px; border-radius: 2px; font-size: 10px;">무효</span>';

    const borderColor = alarm.valid_yn === 'Y' ? '#e74c3c' : '#95a5a6';

    return `
    <div style="margin-bottom: 8px; padding: 6px; background: white; border-radius: 3px; border-left: 3px solid ${borderColor};">
      <div style="font-size: 11px; color: #666; margin-bottom: 2px;">
        ${alarm.occur_datetime || '시간 미상'} ${validBadge}
      </div>
      <div style="font-size: 12px; color: #333;">
        ${alarm.alarm_message || '경보 내용 없음'}
      </div>
    </div>
  `;
  }
  /**
   * 하이라이트 정리
   */
  clearHighlights() {
    console.log('🧹 기존 장애점 하이라이트 정리 중...');

    try {
      // 애니메이션 중단 및 스타일 복원
      this.animationElements.forEach(
        ({ type, id, element, circle, stopAnimation, originalStyles }) => {
          try {
            console.log(`🧹 ${type} 애니메이션 정리: ${id}`);

            // 애니메이션 중단
            if (stopAnimation && typeof stopAnimation === 'function') {
              stopAnimation();
            }

            // 기존 트랜지션 중단
            if (element && !element.empty()) {
              element.selectAll('*').interrupt();
            }

            // 원래 스타일로 복원
            if (type === 'node' && circle && !circle.empty() && originalStyles) {
              circle
                .attr('stroke', originalStyles.originalStroke)
                .attr('stroke-width', originalStyles.originalWidth);
            } else if (type === 'link' && element && !element.empty() && originalStyles) {
              element
                .attr('stroke', originalStyles.originalStroke)
                .attr('stroke-width', originalStyles.originalWidth)
                .attr('stroke-opacity', originalStyles.originalOpacity);
            }
          } catch (itemError) {
            console.warn(`애니메이션 개별 정리 중 오류 (${type} ${id}):`, itemError);
          }
        }
      );

      // 배열 초기화
      this.animationElements = [];

      // 오류 플래그 초기화
      this._linkErrorShown = false;
      this._nodeErrorShown = false;

      console.log('✅ 장애점 하이라이트 정리 완료');
    } catch (error) {
      console.error('❌ 하이라이트 정리 중 전체 오류:', error);

      // 강제로 배열 초기화 및 플래그 리셋
      this.animationElements = [];
      this._linkErrorShown = false;
      this._nodeErrorShown = false;

      // D3 트랜지션 강제 중단 (최후 수단)
      try {
        if (typeof d3 !== 'undefined') {
          d3.selectAll('.links line').interrupt();
          d3.selectAll('.nodes .node-group circle').interrupt();
        }
      } catch (d3Error) {
        console.warn('D3 트랜지션 강제 중단 중 오류:', d3Error);
      }
    }
  }

  /**
   * 장애점 분석 초기화
   */
  reset() {
    console.log('🔄 장애점 분석 상태 초기화 시작...');

    try {
      // 하이라이트 정리
      this.clearHighlights();

      // 상태 초기화
      this.currentFailurePoints = [];
      this.isAnalyzing = false;

      // 오류 플래그 초기화
      this._linkErrorShown = false;
      this._nodeErrorShown = false;

      console.log('✅ 장애점 분석 상태 초기화 완료');
    } catch (error) {
      console.error('❌ 상태 초기화 중 오류:', error);

      // 강제 초기화
      this.currentFailurePoints = [];
      this.isAnalyzing = false;
      this.animationElements = [];
      this._linkErrorShown = false;
      this._nodeErrorShown = false;
    }
  }

  /**
   * 분석 오류 처리
   */
  handleAnalysisError(error) {
    console.error('❌ 장애점 분석 실패:', error);
    console.error('스택 트레이스:', error.stack);

    // 구체적인 오류 메시지 생성
    let errorMessage = '장애점 분석 중 오류가 발생했습니다.';

    if (error.message.includes('fetch')) {
      errorMessage = '서버와의 통신 중 오류가 발생했습니다. 네트워크 연결을 확인해주세요.';
    } else if (error.message.includes('timeout')) {
      errorMessage = '분석 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.';
    } else if (error.message.includes('parse')) {
      errorMessage = '분석 결과 처리 중 오류가 발생했습니다.';
    }

    MessageManager.addErrorMessage(errorMessage);

    // 오류 발생시 상태 초기화
    this.clearHighlights();
    this.currentFailurePoints = [];
  }

  /**
   * 현재 분석 상태 확인
   */
  isCurrentlyAnalyzing() {
    return this.isAnalyzing;
  }

  /**
   * 현재 장애점 목록 조회
   */
  getCurrentFailurePoints() {
    return [...this.currentFailurePoints];
  }
}

// 싱글톤 인스턴스 생성 및 export
export const failurePointManager = new FailurePointManager();

// 전역 접근을 위해 window 객체에 등록
if (typeof window !== 'undefined') {
  window.FailurePointManagerInstance = failurePointManager;
}

export default failurePointManager;
