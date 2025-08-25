// ================================
// FailurePointManager.js - 장애점 추정 관리자
// ================================

import CommonUtils from '../utils/CommonUtils.js';
import MessageManager from '../utils/MessageManager.js';
import { stateManager as StateManager } from './StateManager.js';

class FailurePointManager {
  constructor() {
    this.currentFailurePoints = [];
    this.animationElements = [];

    // 오류 메시지 중복 방지 플래그
    this._linkErrorShown = false;
    this._nodeErrorShown = false;

    // 분석 완료 콜백 함수
    this.onAnalysisComplete = null;

    // 단계별 장애점 카운터 (간단하고 명확한 구조)
    this.step1_link_count = 0; // 1단계: 선로 장애점

    this.step2_mw_count = 0; // 2단계: MW 장애점
    this.step2_mw_fading_count = 0; // 2단계: MW 페이딩 세부
    this.step2_mw_antenna_count = 0; // 2단계: MW 안테나 정렬/편파 세부
    this.step2_mw_equipment_count = 0; // 2단계: MW 장비/전원 세부
    this.step2_mw_interference_count = 0; // 2단계: MW 간섭/혼선 세부
    this.step2_mw_error_count = 0; // 2단계: MW 전송Error 세부
    this.step2_mw_voltage_count = 0; // 2단계: MW 전압 세부

    this.step3_upper_count = 0; // 3단계: 상위 장비 장애점
    this.step4_exchange_count = 0; // 4단계: 교환 장애점
    this.step5_transmission_count = 0; // 5단계: 전송 장애점
    this.step6_ip_count = 0; // 6단계: IP 장애점
    this.step7_wireless_count = 0; // 7단계: 무선 장애점
    this.total_unique_nodes = 0; // 전체 고유 노드 수

    // 단계별 마지막 메시지 ID 추적
    this.lastStepMessages = {};
  }

  // 현재 장애점 목록 조회
  getCurrentFailurePoints() {
    return [...this.currentFailurePoints];
  }

  // 현재 분석 상태 확인 (호환성 유지)
  isCurrentlyAnalyzing() {
    return false; // 간단한 구현
  }

  /**
   * 장애점 분석 시작
   * @param {Array} nodes - 현재 맵의 노드들
   * @param {Array} links - 현재 맵의 링크들
   * @param {Array} alarmData - 전체 경보 정보
   * @param {Function} onComplete - 분석 완료 콜백 (선택적)
   * @param {Boolean} isMwRealTimeCheck - M/W 실시간 SNMP 점검 활성화 여부 (선택적)
   */
  async analyzeFailurePoints(
    nodes,
    links,
    alarmDataWithoutCable,
    onComplete = null,
    isMwRealTimeCheck = false
  ) {
    console.log('🔍 장애점 분석 시작...');
    console.log('🔍 M/W 실시간 SNMP 점검 모드:', isMwRealTimeCheck ? '활성화' : '비활성화');

    this._initializeAnalysis(onComplete);

    try {
      console.log('🚀 장애점 분석 시작');
      const requestData = this.prepareAnalysisData(
        nodes,
        links,
        alarmDataWithoutCable,
        isMwRealTimeCheck
      );
      const result = await this.callFailurePointAPI(requestData);
      await this.processAnalysisResult(result);
    } catch (error) {
      await this._handleAnalysisError(error);
    }
  }

  // 분석 초기화
  _initializeAnalysis(onComplete) {
    // 이전 분석 결과 및 진행상황 메시지 완전 초기화
    this.clearHighlights();
    this.currentFailurePoints = [];
    this.resetCounters();
    this.lastStepMessages = {};
    this.onAnalysisComplete = onComplete;
  }

  // 분석 오류 처리
  async _handleAnalysisError(error) {
    console.error('장애점 분석 실패:', error);

    try {
      const errorMessagePromise = MessageManager.addErrorMessageWithTyping(
        `장애점 분석 중 오류가 발생했습니다: ${error.message}`,
        { speed: 0.2 }
      );

      if (errorMessagePromise) {
        errorMessagePromise.finally(() => {
          this.callAnalysisCompleteCallback();
        });
      } else {
        this.callAnalysisCompleteCallback();
      }
    } catch (messageError) {
      console.error('❌ 오류 메시지 추가 실패:', messageError);
      this.callAnalysisCompleteCallback();
    }
  }

  // 분석 데이터 준비
  prepareAnalysisData(nodes, links, alarmDataWithoutCable, isMwRealTimeCheck = false) {
    console.log('📊 장애점 분석 데이터 준비 중...');
    console.log(
      '🔍 [디버깅] isMwRealTimeCheck 값:',
      isMwRealTimeCheck,
      '(타입:',
      typeof isMwRealTimeCheck,
      ')'
    );

    // 전체 경보 데이터에서 선로 분야만 필터링
    const allAlarmData = this.getAllAlarmData();
    const cableAlarmData = allAlarmData.filter((alarm) => alarm && alarm.sector === '선로');

    // 입력 데이터 로깅
    this._logInputData(nodes, links, alarmDataWithoutCable, cableAlarmData);

    // 선로 제외 모든 분야 경보 데이터 필터링
    const filteredAlarmData = alarmDataWithoutCable.filter((alarm) => alarm);
    console.log(
      '📊 선로 제외 경보 필터링 결과:',
      alarmDataWithoutCable.length,
      '→',
      filteredAlarmData.length
    );

    const requestData = {
      nodes: this._prepareNodesData(nodes),
      links: this._prepareLinksData(links),
      alarms: filteredAlarmData, // 선로 제외 모든 분야 경보 데이터
      cableAlarms: cableAlarmData, // 추가: 선로분야 경보 데이터만 별도 전달
      isMwRealTimeCheck, // MW 실시간 SNMP 점검 체크 여부 전달
    };

    console.log('🔍 [디버깅] 최종 요청 데이터 isMwRealTimeCheck:', requestData.isMwRealTimeCheck);
    this._logFinalData(requestData);
    return requestData;
  }

  // 입력 데이터 로깅
  _logInputData(nodes, links, alarmDataWithoutCable, cableAlarmData) {
    console.log('📥 입력 데이터 현황:');
    console.log('  - nodes:', nodes.length, '개');
    console.log('  - links:', links.length, '개');
    console.log(
      '  - 맵 필터링된 alarmDataWithoutCable:',
      alarmDataWithoutCable.length,
      '개 (선로 제외 모든 분야)'
    );
    console.log('  - 선로 경보 데이터:', cableAlarmData.length, '개 (선로분야만)');

    // 선로 경보 샘플 확인
    if (cableAlarmData.length > 0) {
      console.log('📊 선로 경보 샘플 (최대 3개):');
      cableAlarmData.slice(0, 3).forEach((alarm, index) => {
        console.log(
          `  [${index + 1}] equip_name: ${alarm.equip_name}, alarm_message: ${alarm.alarm_message}`
        );
      });
    } else {
      console.warn('⚠️ 선로 경보가 없습니다. 선로 장애점 분석이 제한됩니다.');
    }

    // 노드별 경보 수 확인
    console.log('📊 노드별 경보 현황:');
    nodes.forEach((node, index) => {
      const nodeAlarms = node.alarms || [];
      console.log(`  [${index + 1}] ${node.name}: ${nodeAlarms.length}개 경보`);
    });

    // 링크별 경보 수 확인
    console.log('📊 링크별 경보 현황:');
    links.forEach((link, index) => {
      const linkAlarms = link.linkAlarms || link.alarms || [];
      console.log(`  [${index + 1}] ${link.link_name}: ${linkAlarms.length}개 경보`);

      // 링크 속성 디버깅
      console.log(`    - linkAlarms: ${(link.linkAlarms || []).length}개`);
      console.log(`    - alarms: ${(link.alarms || []).length}개`);
      console.log(`    - hasAlarm: ${link.hasAlarm}`);
      console.log(`    - alarmCount: ${link.alarmCount}`);

      // 실제 경보 데이터 샘플 출력 (첫 번째 경보만)
      if (linkAlarms.length > 0) {
        console.log(`    - 첫 번째 경보 샘플:`, linkAlarms[0]);
      }
    });
  }

  // 노드 데이터 준비
  _prepareNodesData(nodes) {
    return nodes.map((node) => ({
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
    }));
  }

  // 링크 데이터 준비
  _prepareLinksData(links) {
    return links.map((link) => ({
      id: link.id,
      source: typeof link.source === 'object' ? link.source.id : link.source,
      target: typeof link.target === 'object' ? link.target.id : link.target,
      link_name: link.link_name,
      link_field: link.link_field,
      cable_aroot: link.cable_aroot,
      cable_broot: link.cable_broot,
      up_down: link.up_down,
      alarms: link.linkAlarms || link.alarms || [],
    }));
  }

  // 최종 전송 데이터 로깅
  _logFinalData(requestData) {
    console.log('🚀 서버로 전송할 데이터:');
    console.log('  - nodes:', requestData.nodes.length, '개');
    console.log('  - links:', requestData.links.length, '개');
    console.log('  - alarms:', requestData.alarms.length, '개 (선로 제외 모든 분야)');
    console.log('  - cableAlarms:', requestData.cableAlarms.length, '개 (선로분야)');
    console.log('  - 첫 번째 노드 샘플:', requestData.nodes[0]);
    if (requestData.links.length > 0) {
      console.log('  - 첫 번째 링크 샘플:', requestData.links[0]);
    }
    if (requestData.cableAlarms.length > 0) {
      console.log('  - 첫 번째 선로 경보 샘플:', requestData.cableAlarms[0]);
    }
  }

  // 장애점 추정 API 호출
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
      return this._handleStreamingResponse(sessionId);
    } catch (error) {
      console.error('❌ 스트리밍 API 호출 실패:', error);
      return this._fallbackToSyncAPI(requestData);
    }
  }

  // 스트리밍 응답 처리
  _handleStreamingResponse(sessionId) {
    return new Promise((resolve, reject) => {
      const eventSource = new EventSource(`/api/infer_failure_point_stream/${sessionId}`);
      let finalResult = null;

      eventSource.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'progress':
              this._handleProgressMessage(data.message);
              break;

            case 'result':
              finalResult = data.data;
              console.log('✅ 분석 결과 수신 완료');
              break;

            case 'complete':
              eventSource.close();
              if (finalResult) {
                resolve(finalResult);
              } else {
                reject(new Error('분석 결과를 받지 못했습니다.'));
              }
              break;

            case 'error':
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
  }

  // 진행상황 메시지 처리
  _handleProgressMessage(progressMsg) {
    const stepMatch = progressMsg.match(/🚩 \[(\d)단계\]/);
    if (stepMatch) {
      const stepNumber = stepMatch[1];
      const stepKey = `step${stepNumber}`;

      // 기존 단계 메시지가 있으면 업데이트, 없으면 새로 생성
      if (this.lastStepMessages && this.lastStepMessages[stepKey]) {
        MessageManager.updateMessage(this.lastStepMessages[stepKey], progressMsg);
      } else {
        const message = MessageManager.addProgressMessageWithTyping(progressMsg, {
          speed: 0.2,
          type: 'analyzing',
        });

        if (!this.lastStepMessages) {
          this.lastStepMessages = {};
        }

        if (message && message.id) {
          this.lastStepMessages[stepKey] = message.id;
        }
      }
    } else {
      // 단계 메시지가 아닌 경우 일반 처리
      MessageManager.addProgressMessageWithTyping(progressMsg, {
        speed: 0.2,
        type: 'analyzing',
      });
    }

    console.log('📋 진행상황:', progressMsg);
  }

  // 동기 API 폴백
  async _fallbackToSyncAPI(requestData) {
    console.log('🔄 API 서버 호출 재시도 중...');
    MessageManager.addAnalyzingMessageWithTyping('🔄 API 서버 호출 재시도 중...', { speed: 0 });

    const response = await CommonUtils.callApi('/api/infer_failure_point', requestData, {
      method: 'POST',
      timeout: 30000,
      onProgress: (status) => {
        MessageManager.addAnalyzingMessageWithTyping(`🔍 장애점을 분석/추정 중...: ${status}`, {
          speed: 0,
        });
      },
    });

    if (!response || response.error) {
      throw new Error(response?.error || '장애점 분석 API 호출 실패');
    }

    return response;
  }

  // 분석 결과 처리 - 콜백 호출 보장
  async processAnalysisResult(result) {
    try {
      console.log('📋 장애점 분석 결과 처리 중...', result);

      // result 객체 안전성 확보
      const safeResult = result || {};
      this.currentFailurePoints = safeResult.failure_points || [];
      const summary = safeResult.summary || {};

      this.showSummaryMessage(summary);

      // 장애점이 있으면 맵에 애니메이션 표시
      if (this.currentFailurePoints.length > 0) {
        await this.highlightFailurePointsOnMap();
        this.showDetailedResults(); // 이 메서드 내부에서 콜백 호출
      } else {
        await this._handleNoFailurePoints();
      }

      console.log('📋 장애점 분석 결과 처리 완료');
    } catch (error) {
      await this._handleResultProcessingError(error);
    }
  }

  // 장애점이 없는 경우 처리
  async _handleNoFailurePoints() {
    try {
      const messagePromise = MessageManager.addSuccessMessageWithTyping(
        '✅ 분석 완료: 현재 감지된 장애점이 없습니다.',
        { speed: 0 }
      );

      if (messagePromise && typeof messagePromise.then === 'function') {
        messagePromise.finally(() => {
          this.callAnalysisCompleteCallback();
        });
      } else {
        setTimeout(() => {
          this.callAnalysisCompleteCallback();
        }, 1000);
      }
    } catch (messageError) {
      console.error('❌ 성공 메시지 추가 실패:', messageError);
      this.callAnalysisCompleteCallback();
    }
  }

  // 결과 처리 오류 핸들링
  async _handleResultProcessingError(error) {
    console.error('❌ 장애점 분석 결과 처리 중 오류:', error);

    // 안전한 폴백 처리
    this.currentFailurePoints = [];

    try {
      const errorMessagePromise = MessageManager.addErrorMessageWithTyping(
        '장애점 분석 결과 처리 중 오류가 발생했습니다.',
        { speed: 0 }
      );

      if (errorMessagePromise && typeof errorMessagePromise.then === 'function') {
        errorMessagePromise.finally(() => {
          this.callAnalysisCompleteCallback();
        });
      } else {
        setTimeout(() => {
          this.callAnalysisCompleteCallback();
        }, 1000);
      }
    } catch (messageError) {
      console.error('❌ 오류 메시지 추가도 실패:', messageError);
      this.callAnalysisCompleteCallback();
    }
  }

  // 요약 메시지 표시
  showSummaryMessage(summary) {
    try {
      // 🔧 백엔드 summary를 우선 사용, 없으면 자체 계산
      let analysisResults;

      if (summary && typeof summary === 'object' && summary.mw_equipment_failures !== undefined) {
        // 백엔드에서 계산된 summary 사용
        console.log('📊 백엔드 summary 사용:', summary);
        analysisResults = {
          total_failure_points: summary.total_failure_points || this.currentFailurePoints.length,
          step1_link_count: summary.link_failures || 0,
          step2_mw_count: summary.mw_equipment_failures || 0, // 백엔드 MW 카운트 사용
          step3_upper_count: summary.upper_node_failures || 0,
          step4_exchange_count: summary.exchange_failures || 0,
          step5_transmission_count: summary.transmission_failures || 0,
          step6_ip_count: summary.ip_failures || 0,
          step7_wireless_count: summary.wireless_failures || 0,
        };
      } else {
        // 폴백: 프론트엔드 자체 계산
        console.log('📊 프론트엔드 자체 계산 사용');
        try {
          analysisResults = this.calculateFailurePointSummary();
        } catch (calcError) {
          console.error('❌ calculateFailurePointSummary 오류:', calcError);
          // 마지막 폴백: 간단한 카운팅
          analysisResults = {
            total_failure_points: this.currentFailurePoints.length,
            step1_link_count: 0,
            step2_mw_count: 0,
            step3_upper_count: 0,
            step4_exchange_count: 0,
            step5_transmission_count: 0,
            step6_ip_count: 0,
            step7_wireless_count: 0,
          };
        }
      }

      const message = `
      <span style="color: red; font-weight: bold;">📌 장애점 분석/추론이 완료되었습니다.</span><br><br>
      • 장애점 추정 결과: 총 ${analysisResults.total_failure_points}개<br>
      ----------------------------------------------------<br>
      • 1단계) 선로 장애점: ${analysisResults.step1_link_count}개<br>
      • 2단계) MW 장애점: ${analysisResults.step2_mw_count}개<br>
      • 3단계) 상위 장비 장애점: ${analysisResults.step3_upper_count}개<br>
      • 4단계) 교환 장애점: ${analysisResults.step4_exchange_count}개<br>
      • 5단계) 전송 장애점: ${analysisResults.step5_transmission_count}개<br>
      • 6단계) IP 장애점: ${analysisResults.step6_ip_count}개<br>
      • 7단계) 무선 장애점: ${analysisResults.step7_wireless_count}개
    `;

      MessageManager.addErrorMessageWithTyping(message, {
        type: 'error',
        speed: 0,
      });

      console.log('📋 최종 표시 요약 결과:', analysisResults);
      console.log('📋 장애점 상세 데이터:', this.currentFailurePoints);
    } catch (error) {
      console.error('❌ 요약 메시지 표시 오류:', error);

      // 최종 폴백 메시지
      try {
        const fallbackMessage = `
        <span style="color: red; font-weight: bold;">📌 장애점 분석/추론이 완료되었습니다.</span><br><br>
        • 장애점 추정 결과: 총 ${this.currentFailurePoints.length}개<br>
        `;
        MessageManager.addErrorMessageWithTyping(fallbackMessage, {
          type: 'error',
          speed: 0,
        });
      } catch (fallbackError) {
        console.error('❌ 폴백 메시지도 실패:', fallbackError);
      }
    }
  }

  // MW 세부 장애 내역 텍스트 생성 (1 이상인 항목만 표시)
  _buildMWDetailsText(analysisResults) {
    if (analysisResults.step2_mw_count === 0) {
      return ''; // 전체가 0이면 세부 내역 표시 안함
    }

    const details = [];

    if (analysisResults.step2_mw_fading_count > 0) {
      details.push(`페이딩: ${analysisResults.step2_mw_fading_count}건`);
    }
    if (analysisResults.step2_mw_link_disconnect_count > 0) {
      details.push(`링크단절/HW장애: ${analysisResults.step2_mw_link_disconnect_count}건`);
    }
    if (analysisResults.step2_mw_error_count > 0) {
      details.push(`서비스장애: ${analysisResults.step2_mw_error_count}건`);
    }
    if (analysisResults.step2_mw_voltage_count > 0) {
      details.push(`저전압: ${analysisResults.step2_mw_voltage_count}건`);
    }

    return details.length > 0 ? ` (${details.join(', ')})` : '';
  }

  // 장애점 요약 계산 (단계별 카운터 기반)
  calculateFailurePointSummary() {
    // 모든 카운터 초기화
    this.step1_link_count = 0;

    this.step2_mw_count = 0;

    this.step2_mw_fading_count = 0;
    this.step2_mw_link_disconnect_count = 0;
    this.step2_mw_error_count = 0;
    this.step2_mw_voltage_count = 0;

    this.step3_upper_count = 0;
    this.step4_exchange_count = 0;
    this.step5_transmission_count = 0;
    this.step6_ip_count = 0;
    this.step7_wireless_count = 0;

    this.total_unique_nodes = 0;

    // 동일 노드의 중복 장애점 통합
    const consolidatedFailurePoints = this.consolidateFailurePoints(this.currentFailurePoints);
    this.total_failure_points = consolidatedFailurePoints.length;

    console.log(`📊 통합된 장애점 수: ${consolidatedFailurePoints.length}개`);

    // 각 장애점을 단계별로 분류
    consolidatedFailurePoints.forEach((failurePoint, index) => {
      console.log(
        `🔢 장애점 ${index + 1}/${consolidatedFailurePoints.length} 분류 중: ${failurePoint.name}`
      );

      // 단계별 분류 및 카운터 업데이트
      const step = this.classifyFailurePointStep(failurePoint);

      console.log(`✅ 분류 완료: ${failurePoint.name} → ${step}단계`);

      // 노드 타입인 경우 고유 노드 수 증가
      if (failurePoint.type === 'node') {
        this.total_unique_nodes++;
      }
    });

    console.log(`🔍 카운터 검증 완료: 총 ${this.total_failure_points}개 장애점 분류됨`);

    return {
      step1_link_count: this.step1_link_count,

      step2_mw_count: this.step2_mw_count,
      step2_mw_fading_count: this.step2_mw_fading_count,
      step2_mw_link_disconnect_count: this.step2_mw_link_disconnect_count,
      step2_mw_error_count: this.step2_mw_error_count,
      step2_mw_voltage_count: this.step2_mw_voltage_count,

      step3_upper_count: this.step3_upper_count,
      step4_exchange_count: this.step4_exchange_count,
      step5_transmission_count: this.step5_transmission_count,
      step6_ip_count: this.step6_ip_count,
      step7_wireless_count: this.step7_wireless_count,
      total_failure_points: this.total_failure_points,
      total_unique_nodes: this.total_unique_nodes,
    };
  }

  // 동일 노드의 중복 장애점 통합
  consolidateFailurePoints(failurePoints) {
    if (!failurePoints || failurePoints.length === 0) {
      return [];
    }

    // 노드별로 그룹화
    const nodeGroups = {};
    const linkFailures = [];

    failurePoints.forEach((fp) => {
      if (fp.type === 'link') {
        linkFailures.push(fp);
      } else if (fp.type === 'node' || fp.type === 'MW') {
        // MW 타입도 노드로 처리
        const nodeId = fp.id;
        (nodeGroups[nodeId] ||= []).push(fp);
      } else {
        // 기타 타입들도 노드로 처리 (안전장치)
        console.log(`🔍 알 수 없는 타입 발견, 노드로 처리: ${fp.type}`, fp);
        const nodeId = fp.id;
        (nodeGroups[nodeId] ||= []).push(fp);
      }
    });

    const consolidatedFailures = [...linkFailures]; // 링크 장애점은 그대로 유지

    // 노드별 장애점 통합
    Object.keys(nodeGroups).forEach((nodeId) => {
      const nodeFailures = nodeGroups[nodeId];

      if (nodeFailures.length === 1) {
        // 단일 장애점은 그대로 추가
        consolidatedFailures.push(nodeFailures[0]);
      } else {
        // 다중 장애점 통합
        const consolidatedFailure = this.mergeNodeFailures(nodeFailures);
        consolidatedFailures.push(consolidatedFailure);

        console.log(`🔄 노드 ${nodeId}의 ${nodeFailures.length}개 장애점을 1개로 통합:`, {
          original: nodeFailures.map((f) => f.failure_type),
          consolidated: consolidatedFailure.failure_type,
        });
      }
    });

    return consolidatedFailures;
  }

  // 동일 노드의 여러 장애점을 하나로 통합
  mergeNodeFailures(nodeFailures) {
    if (!nodeFailures || nodeFailures.length === 0) {
      return null;
    }

    if (nodeFailures.length === 1) {
      return nodeFailures[0];
    }

    // 기본 정보는 첫 번째 장애점에서 가져오기
    const baseFailure = nodeFailures[0];

    // 장애 타입들 수집 및 통합
    const failureTypes = nodeFailures.map((f) => f.failure_type || '').filter((t) => t);
    const inferenceDetails = nodeFailures.map((f) => f.inference_detail || '').filter((d) => d);
    const allAlarms = nodeFailures.reduce((acc, f) => acc.concat(f.alarms || []), []);

    // 중복 제거된 장애 타입
    const uniqueFailureTypes = [...new Set(failureTypes)];

    // 세부내역을 더 명확하게 구성
    const detailedInference = `
      <strong>🔄 동일 노드 다중 장애점 통합 (총 ${nodeFailures.length}개)</strong><br><br>
      <strong>📋 통합된 장애 유형:</strong><br>
      • ${uniqueFailureTypes.join('<br>• ')}<br><br>
      <strong>📝 세부 분석 내역:</strong><br>
      ${inferenceDetails
        .map((detail, index) => `<strong>[${index + 1}]</strong> ${detail}`)
        .join('<br><br>')}
    `;

    // 통합된 장애점 생성
    const mergedFailure = {
      ...baseFailure,
      failure_type:
        uniqueFailureTypes.length > 1
          ? `복합 장애 (${uniqueFailureTypes.length}개 유형)`
          : uniqueFailureTypes[0],
      inference_detail: detailedInference,
      alarms: this.removeDuplicateAlarms(allAlarms),
      confidence: Math.max(...nodeFailures.map((f) => f.confidence || 0)),
      // MW 관련 플래그들 통합
      mw_fading_failure: nodeFailures.some((f) => f.mw_fading_failure),
      mw_voltage_failure: nodeFailures.some((f) => f.mw_voltage_failure),
      mw_error_failure: nodeFailures.some((f) => f.mw_error_failure),
      equipment_type:
        baseFailure.equipment_type || nodeFailures.find((f) => f.equipment_type)?.equipment_type,
      // 통합 정보 추가
      is_merged: true,
      original_failure_count: nodeFailures.length,
      original_failures: nodeFailures.map((f) => ({
        type: f.failure_type,
        detail: f.inference_detail,
        confidence: f.confidence,
      })),
    };

    return mergedFailure;
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

  // 맵 준비 상태 확인
  isMapReady() {
    // D3 엘리먼트 존재 확인
    const hasNodes = !d3.selectAll('.nodes .node-group').empty();
    const hasLinks = !d3.selectAll('.links line').empty();
    const hasMapContainer = document.getElementById('map-container') !== null;

    console.log(`맵 상태 확인: 노드=${hasNodes}, 링크=${hasLinks}, 컨테이너=${hasMapContainer}`);

    return hasMapContainer && (hasNodes || hasLinks);
  }

  // 장애점 노드 하이라이트
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

          // MW 장비인 경우 배지 추가
          this.addMWBadgesIfNeeded(nodeElement, nodeId);
        } else {
          console.warn(`⚠️ 노드 circle 엘리먼트를 찾을 수 없음: ${nodeId}`);
        }
      } else {
        console.warn(`⚠️ 노드 엘리먼트를 찾을 수 없음: ${nodeId}`);
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

  // MW 장비에 필요한 배지 추가
  addMWBadgesIfNeeded(nodeElement, nodeId) {
    try {
      const failurePoint = this.currentFailurePoints.find((fp) => fp.id === nodeId);
      if (!failurePoint || failurePoint.equipment_type !== 'MW') {
        return;
      }

      console.log(`🏷️ MW 배지 추가 시작: ${nodeId}`, failurePoint);

      const hasFading = failurePoint.mw_fading_failure;
      const hasVoltage = failurePoint.mw_voltage_failure;
      const hasLinkDisconnect = failurePoint.mw_link_disconnect_failure;
      const hasError = failurePoint.mw_error_failure;

      // 통합 배지 텍스트 결정 (존재하는 장애 유형만 추가)
      const failureTypes = [];
      if (hasFading) failureTypes.push('페이딩');
      if (hasVoltage) failureTypes.push('저전압');
      if (hasLinkDisconnect) failureTypes.push('링크단절/HW장애');
      if (hasError) failureTypes.push('서비스장애');

      // 장애 유형이 있는 경우에만 배지 추가
      if (failureTypes.length > 0) {
        const badgeText = failureTypes.join(', ');
        this.addMWBadge(nodeElement, badgeText, nodeId);
      }
    } catch (error) {
      console.error(`❌ MW 배지 추가 오류 (${nodeId}):`, error);
    }
  }

  // MW 통합 배지 생성 (노드 좌측에 위치)
  addMWBadge(nodeElement, badgeText, nodeId) {
    try {
      console.log(`🏷️ MW 통합 배지 생성: ${nodeId} - ${badgeText}`);

      // 노드 반지름
      const nodeRadius = 15; // 기본 노드 반지름

      // 배지를 노드 기준으로 상대적 위치 설정 (노드 중심 기준)
      const badgeX = -nodeRadius - 35; // 노드 중심에서 좌측으로 35px
      const badgeY = -15; // 노드 중심에서 위쪽으로 15px

      // 🔧 핵심 수정: 배지 그룹을 노드 그룹 내부에 직접 추가
      const badgeGroup = nodeElement
        .append('g')
        .attr('class', `mw-badge-${nodeId}`)
        .attr('transform', `translate(${badgeX}, ${badgeY})`);

      // 배지 배경 (둥근 사각형)
      const padding = 6;
      const fontSize = 12; // 글자 크기 약간 축소
      const textWidth = badgeText.length * 12; // 글자당 너비
      const badgeWidth = textWidth + padding * 2.5;
      const badgeHeight = badgeText.length > 20 ? 30 : 20; // 텍스트가 길면 높이 증가

      // 텍스트 길이에 따른 x 위치 조절
      let rectX = -badgeWidth / 2 + 6;
      let textX = 6;

      // 텍스트가 길 경우 여러 줄로 나누기
      let lines = [badgeText];
      if (badgeText.length > 20) {
        lines = this.splitTextIntoLines(badgeText);
      }

      badgeGroup
        .append('rect')
        .attr('x', rectX)
        .attr('y', -badgeHeight / 2)
        .attr('width', badgeWidth)
        .attr('height', badgeHeight)
        .attr('rx', 8) // 둥근 모서리
        .attr('ry', 8)
        .attr('fill', '#ff4444') // 빨간색 배경
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 1)
        .attr('opacity', 0.9);

      // 여러 줄의 텍스트 추가
      lines.forEach((line, index) => {
        const yOffset = lines.length === 1 ? 0 : (index - (lines.length - 1) / 2) * 12;
        badgeGroup
          .append('text')
          .attr('x', textX)
          .attr('y', yOffset)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .attr('fill', 'white')
          .attr('font-size', `${fontSize}px`)
          .attr('font-weight', 'bold')
          .attr('font-family', 'Arial, sans-serif')
          .text(line.trim());
      });

      console.log(
        `✅ MW 통합 배지 생성 완료: ${nodeId} - ${badgeText} (상대위치: ${badgeX}, ${badgeY})`
      );
    } catch (error) {
      console.error(`❌ MW 통합 배지 생성 오류 (${nodeId}):`, error);
    }
  }

  // 긴 텍스트를 여러 줄로 나누는 헬퍼 메서드
  splitTextIntoLines(text) {
    const parts = text.split(', ');
    const lines = [];
    let currentLine = '';

    parts.forEach((part) => {
      if (currentLine.length + part.length > 20) {
        if (currentLine) lines.push(currentLine);
        currentLine = part;
      } else {
        currentLine = currentLine ? `${currentLine}, ${part}` : part;
      }
    });
    if (currentLine) lines.push(currentLine);

    return lines;
  }

  // 장애점 노드 애니메이션 적용
  applyNodeAnimation(nodeElement, circle, nodeId) {
    try {
      // 현재 스타일 저장
      const nodeData = nodeElement.datum();
      const originalStroke = nodeData?.isTarget ? '#004085' : '#fff';
      const originalWidth = nodeData?.isTarget ? '4px' : '2px';

      // 애니메이션 상태 플래그
      let isAnimating = true;

      // 노드 엘리먼트에 장애점 마커 추가 (hover 이벤트와 구분하기 위함)
      nodeElement.classed('failure-point-animated', true);
      circle.classed('failure-point-circle', true);

      // 애니메이션 함수
      const animate = () => {
        if (!isAnimating) return;

        try {
          circle
            .transition()
            .duration(300)
            .ease(d3.easeQuadInOut)
            .attr('stroke', '#ff0000')
            .attr('stroke-width', '8px')
            .transition()
            .duration(300)
            .ease(d3.easeQuadInOut)
            .attr('stroke', '#ff6b6b')
            .attr('stroke-width', '3px')
            .on('end', () => {
              if (isAnimating) {
                setTimeout(animate, 50);
              }
            })
            .on('interrupt', () => {
              // 애니메이션 중단시 장애점 애니메이션인 경우에만 복원하지 않음
              if (!circle.classed('failure-point-circle')) {
                circle.attr('stroke', originalStroke).attr('stroke-width', originalWidth);
              }
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
          nodeElement.classed('failure-point-animated', false);
          circle.classed('failure-point-circle', false);
        },
        originalStyles: { originalStroke, originalWidth },
      });

      console.log(`✨ 노드 애니메이션 시작: ${nodeId}`);
    } catch (error) {
      console.error(`❌ 노드 애니메이션 적용 오류 (${nodeId}):`, error);
    }
  }

  // 장애점 링크 하이라이트
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

      // 모든 링크 엘리먼트 조회 (path 또는 line)
      let allLinks = linksContainer.selectAll('path');
      if (allLinks.empty()) {
        // path가 없으면 line으로 시도
        allLinks = linksContainer.selectAll('line');
        if (allLinks.empty()) {
          console.warn('⚠️ 링크 엘리먼트(path 또는 line)가 없습니다.');
          return;
        }
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

        // 링크 데이터에 장애점 경보 정보 업데이트
        this.updateLinkDataWithFailureAlarms(linkElement, linkId);

        // 애니메이션 적용
        this.applyLinkAnimation(linkElement, linkId);

        // 선로 장애점에 경보 배지 추가
        this.addLinkAlarmBadgeIfNeeded(linkElement, linkId);
      } else {
        console.warn(`⚠️ 링크 엘리먼트를 찾을 수 없음: ${linkId}`);
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

  // 링크 데이터에 장애점 경보 정보 업데이트
  updateLinkDataWithFailureAlarms(linkElement, linkId) {
    try {
      // 해당 링크의 장애점 정보 찾기
      const failurePoint = this.currentFailurePoints.find((fp) => fp.id === linkId);
      if (!failurePoint || failurePoint.type !== 'link') {
        return;
      }

      console.log(`🔄 링크 데이터 업데이트: ${linkId}`, failurePoint);

      // 링크 데이터 가져오기
      const linkData = linkElement.datum();
      if (!linkData) {
        console.warn(`⚠️ 링크 데이터가 없습니다: ${linkId}`);
        return;
      }

      // 장애점에서 가져온 경보 정보로 링크 데이터 업데이트
      const cableAlarms = failurePoint.alarms || [];

      // 기존 링크 경보 정보 업데이트
      linkData.linkAlarms = cableAlarms;
      linkData.hasAlarm = cableAlarms.length > 0;
      linkData.alarmCount = cableAlarms.length;

      console.log(`✅ 링크 데이터 업데이트 완료: ${linkId}`, {
        경보수: cableAlarms.length,
        hasAlarm: linkData.hasAlarm,
        샘플경보: cableAlarms.slice(0, 2).map((alarm) => ({
          equip_name: alarm.equip_name,
          alarm_message: alarm.alarm_message,
          occur_datetime: alarm.occur_datetime,
        })),
      });
    } catch (error) {
      console.error(`❌ 링크 데이터 업데이트 오류 (${linkId}):`, error);
    }
  }

  // 장애점 링크 애니메이션 적용
  applyLinkAnimation(linkElement, linkId) {
    try {
      // 링크 데이터에서 MW 링크인지 확인
      const linkData = linkElement.datum();
      const isMWLink = linkData && linkData.isMWLink;

      console.log(`🔗 링크 애니메이션 적용: ${linkId}, MW링크: ${isMWLink}`);

      // 현재 스타일 저장
      const originalStroke = linkElement.attr('stroke') || '#666';
      const originalWidth = linkElement.attr('stroke-width') || '3';
      const originalOpacity = linkElement.attr('stroke-opacity') || '0.8';

      // MW 링크와 선로 링크에 따른 애니메이션 색상 설정
      const animationStroke1 = isMWLink ? originalStroke : '#ff0000'; // MW는 원래색, 선로는 빨간색
      const animationStroke2 = isMWLink ? originalStroke : '#ff6b6b'; // MW는 원래색, 선로는 연한 빨간색

      // 애니메이션 상태 플래그
      let isAnimating = true;

      // 링크 엘리먼트에 장애점 마커 추가 (hover 이벤트와 구분하기 위함)
      linkElement.classed('failure-point-animated', true);

      // 애니메이션 함수
      const animate = () => {
        if (!isAnimating) return;

        try {
          linkElement
            .transition()
            .duration(300)
            .ease(d3.easeQuadInOut)
            .attr('stroke', animationStroke1)
            .attr('stroke-width', '8px')
            .attr('stroke-opacity', '1')
            .transition()
            .duration(300)
            .ease(d3.easeQuadInOut)
            .attr('stroke', animationStroke2)
            .attr('stroke-width', '3px')
            .attr('stroke-opacity', '0.8')
            .on('end', () => {
              if (isAnimating) {
                setTimeout(animate, 100);
              }
            })
            .on('interrupt', () => {
              // 애니메이션 중단시 원래 스타일로 복원
              if (!linkElement.classed('failure-point-animated')) {
                linkElement
                  .attr('stroke', originalStroke)
                  .attr('stroke-width', originalWidth)
                  .attr('stroke-opacity', originalOpacity);
              }
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
          linkElement.classed('failure-point-animated', false);
        },
        originalStyles: { originalStroke, originalWidth, originalOpacity },
        isMWLink: isMWLink,
      });

      console.log(`✨ 링크 애니메이션 시작: ${linkId} (MW: ${isMWLink})`);
    } catch (error) {
      console.error(`❌ 링크 애니메이션 적용 오류 (${linkId}):`, error);
    }
  }

  // 상세 결과 메시지 표시 (단계별 정보 포함)
  showDetailedResults() {
    // 통합된 장애점 기준으로 표시
    const consolidatedFailurePoints = this.consolidateFailurePoints(this.currentFailurePoints);

    let messagePromises = []; // 타이핑 메시지 완료를 추적하기 위한 배열

    consolidatedFailurePoints.forEach((failurePoint, index) => {
      // 장애점 단계 분류 및 stepInfo 가져오기
      const step = this.classifyFailurePointStep(failurePoint);
      const stepInfo = this.getStepInfoByClassification(step);

      // 관련 경보 찾기
      const allAlarmData = this.getAllAlarmData();
      const relatedAlarms = this.findAllRelatedAlarms(failurePoint, allAlarmData);
      const validAlarms = relatedAlarms.filter((alarm) => alarm && alarm.alarm_message);

      // 상세 정보 구성
      let detailInfo = '';
      if (failurePoint.is_merged) {
        detailInfo = `• 통합된 장애점: ${failurePoint.original_failure_count}개의 장애가 통합됨<br>`;
      }

      // 경보 목록 HTML 생성
      const alarmListHtml = MessageManager.generateAnalysisAlarmListHTML(relatedAlarms);

      const message = `
        📌 <strong style="color: red;">장애점 #${index + 1} <br><br> ${stepInfo.prefix}${
        failurePoint.name
      }</strong><br><br>
        • 유형: ${failurePoint.failure_type}<br>
        • ${failurePoint.type === 'node' ? '장비' : '링크'} ID: ${failurePoint.id}<br><br>
        • 추정 내역: <br>${failurePoint.inference_detail}<br>
        ${detailInfo}<br>
        • 경보 현황: 전체 ${relatedAlarms.length}건${
        relatedAlarms.length > 0 ? `${alarmListHtml}` : ''
      }
      `;

      // 타이핑 효과로 출력하여 메시지 순서 보장
      const messagePromise = MessageManager.addWarningMessageWithTyping(message, {
        type: 'warning',
        speed: 0.2,
      });

      // Promise가 반환되는 경우 추적
      if (messagePromise && typeof messagePromise.then === 'function') {
        messagePromises.push(messagePromise);
      }
    });

    // 🔧 콜백 호출 로직 개선 - 더 안전한 처리
    if (messagePromises.length > 0) {
      Promise.allSettled(messagePromises) // allSettled 사용으로 일부 실패해도 계속 진행
        .then((results) => {
          console.log('📝 모든 상세 메시지 처리 완료:', results);
          this.callAnalysisCompleteCallback();
        })
        .catch((error) => {
          console.error('❌ 상세 메시지 처리 중 오류:', error);
          // 오류가 있어도 콜백은 실행
          this.callAnalysisCompleteCallback();
        });
    } else {
      // Promise가 없는 경우 약간의 지연 후 콜백 실행
      setTimeout(() => {
        this.callAnalysisCompleteCallback();
      }, 1000);
    }
  }

  // 분석 완료 콜백 호출
  callAnalysisCompleteCallback() {
    try {
      console.log('🎯 장애점 분석 및 메시지 표시 완전 완료');

      // 🔧 변수명 통일 및 안전성 검사 강화
      if (this.onAnalysisComplete && typeof this.onAnalysisComplete === 'function') {
        console.log('📞 분석 완료 콜백 호출');

        try {
          this.onAnalysisComplete();
        } catch (callbackError) {
          console.error('❌ 콜백 실행 중 오류:', callbackError);
        }

        this.onAnalysisComplete = null; // 콜백 초기화
      } else {
        console.warn('⚠️ 분석 완료 콜백이 없거나 함수가 아닙니다:', typeof this.onAnalysisComplete);
      }
    } catch (error) {
      console.error('❌ 분석 완료 콜백 호출 중 최상위 오류:', error);
    }
  }

  /**
   * 장애점 단계별 분류 및 카운터 업데이트 (개선된 버전 - sector 기반)
   * @param {Object} failurePoint - 장애점 객체
   * @returns {number} - 장애점 단계 (1~7)
   */
  classifyFailurePointStep(failurePoint) {
    const type = failurePoint.type || '';
    const sector = failurePoint.sector || failurePoint.field || '';
    const failureDesc = failurePoint.failure_desc || failurePoint.failure_type || '';

    console.log(`🔍 장애점 단계 분류: ${failurePoint.name}`, {
      type,
      sector,
      failureDesc,
    });

    // 1단계: 선로 장애점 (type='link')
    if (type === 'link') {
      console.log(`✅ 1단계 선로 장애점: ${failurePoint.name}`);
      this.step1_link_count++;
      return 1;
    }

    // 2단계: MW 장비 장애점 (sector='MW', 단 상위 장비 장애는 제외)
    if (
      sector === 'MW' &&
      !failureDesc.includes('상위 장비 장애') &&
      !failureDesc.includes('경보 Tree 탐색')
    ) {
      console.log(`✅ 2단계 MW 장애점: ${failurePoint.name}`);
      this.step2_mw_count++;

      // MW 세부 분류 (4가지 세부 장애 유형)
      const hasFading = this._isMWFadingFailure(failurePoint);
      const hasLinkDisconnect = this._isMWLinkDisconnectFailure(failurePoint);
      const hasError = this._isMWErrorFailure(failurePoint);
      const hasVoltage = this._isMWVoltageFailure(failurePoint);

      if (hasFading) {
        this.step2_mw_fading_count++;
        console.log(`🔸 MW 페이딩 장애 카운트: ${failurePoint.name}`);
      }
      if (hasLinkDisconnect) {
        this.step2_mw_link_disconnect_count++;
        console.log(`🔸 MW 링크단절/HW장애 카운트: ${failurePoint.name}`);
      }
      if (hasError) {
        this.step2_mw_error_count++;
        console.log(`🔸 MW 서비스장애 카운트: ${failurePoint.name}`);
      }
      if (hasVoltage) {
        this.step2_mw_voltage_count++;
        console.log(`🔸 MW 전압 장애 카운트: ${failurePoint.name}`);
      }

      // 디버깅 로그
      console.log(
        `🔍 MW 세부 분류 결과: ${failurePoint.name} - 페이딩: ${hasFading}, 링크단절: ${hasLinkDisconnect}, Error: ${hasError}, 전압: ${hasVoltage}`
      );

      return 2;
    }

    // 3단계: 상위 장비 장애점 (특별한 failure_desc 패턴)
    if (failureDesc.includes('상위 장비 장애') || failureDesc.includes('경보 Tree 탐색')) {
      console.log(`✅ 3단계 상위 장비 장애점: ${failurePoint.name}`);
      this.step3_upper_count++;
      return 3;
    }

    // 4단계: 교환 장애점 (sector='교환')
    if (sector === '교환') {
      console.log(`✅ 4단계 교환 장애점: ${failurePoint.name}`);
      this.step4_exchange_count++;
      return 4;
    }

    // 5단계: 전송 장애점 (sector='전송')
    if (sector === '전송') {
      console.log(`✅ 5단계 전송 장애점: ${failurePoint.name}`);
      this.step5_transmission_count++;
      return 5;
    }

    // 6단계: IP 장애점 (sector='IP')
    if (sector === 'IP') {
      console.log(`✅ 6단계 IP 장애점: ${failurePoint.name}`);
      this.step6_ip_count++;
      return 6;
    }

    // 7단계: 무선 장애점 (sector='무선')
    if (sector === '무선') {
      console.log(`✅ 7단계 무선 장애점: ${failurePoint.name}`);
      this.step7_wireless_count++;
      return 7;
    }

    // 기본값: 3단계 상위 장비 장애점으로 분류
    console.log(`⚠️ 3단계 상위 장비 장애점 (기본값): ${failurePoint.name} - sector: ${sector}`);
    this.step3_upper_count++;
    return 3;
  }

  // 분류에 따른 단계 정보 반환
  getStepInfoByClassification(classification) {
    switch (classification) {
      case 1:
        return { step: 1, prefix: '[1단계 선로] ' };
      case 2:
        return { step: 2, prefix: '[2단계 MW] ' };
      case 3:
        return { step: 3, prefix: '[3단계 상위장비] ' };
      case 4:
        return { step: 4, prefix: '[4단계 교환] ' };
      case 5:
        return { step: 5, prefix: '[5단계 전송] ' };
      case 6:
        return { step: 6, prefix: '[6단계 IP] ' };
      case 7:
        return { step: 7, prefix: '[7단계 무선] ' };
      default:
        return { step: 3, prefix: '[3단계 상위장비] ' }; // 기본값
    }
  }

  // StateManager에서 전체 경보 데이터 가져오기
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

  // 장애점과 관련된 모든 경보 찾기
  findAllRelatedAlarms(failurePoint, allAlarmData) {
    try {
      let relatedAlarms = [];

      // 링크 장애점의 경우 장애점 객체에 직접 포함된 경보를 사용
      if (failurePoint.type === 'link' && failurePoint.alarms) {
        console.log(
          `🔗 링크 장애점 "${failurePoint.name}": 장애점 내부 경보 사용 (${failurePoint.alarms.length}건)`
        );
        relatedAlarms = Array.isArray(failurePoint.alarms) ? failurePoint.alarms : [];
      } else {
        // 노드 장애점의 경우 기존 방식으로 StateManager에서 경보 찾기
        relatedAlarms.push(...this.findFailurePointAlarms(failurePoint, allAlarmData));
      }

      // 중복 제거 (동일한 경보가 여러 번 포함될 수 있음)
      const uniqueAlarms = this.removeDuplicateAlarms(relatedAlarms);

      console.log(`🔍 장애점 "${failurePoint.name}"의 관련 경보: ${uniqueAlarms.length}건`);
      return uniqueAlarms;
    } catch (error) {
      console.error(`장애점 관련 경보 찾기 실패 (${failurePoint.id}):`, error);
      return failurePoint.alarms || []; // 기존 데이터로 폴백
    }
  }

  // 장애점의 관련 경보 찾기
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

  // 중복 경보 제거
  removeDuplicateAlarms(alarms) {
    const uniqueMap = new Map();

    alarms.forEach((alarm) => {
      // 고유 키 생성 (장비ID 또는 장비명 + 발생시간 + 경보메시지)
      const equipIdentifier = alarm.equip_id || alarm.equip_name || 'unknown';
      const uniqueKey = `${equipIdentifier}_${alarm.occur_datetime || ''}_${
        alarm.alarm_message || ''
      }`;

      if (!uniqueMap.has(uniqueKey)) {
        uniqueMap.set(uniqueKey, alarm);
      }
    });

    return Array.from(uniqueMap.values());
  }

  // 장애점 하이라이트 효과 제거
  clearHighlights() {
    console.log('🧹 기존 장애점 하이라이트 제거 중...');

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

              // 장애점 관련 클래스 제거
              element.classed('failure-point-animated', false);
            }

            // 원래 스타일로 복원
            if (type === 'node' && circle && !circle.empty() && originalStyles) {
              circle
                .attr('stroke', originalStyles.originalStroke)
                .attr('stroke-width', originalStyles.originalWidth)
                .classed('failure-point-circle', false); // 클래스 제거

              // MW 통합 배지 제거
              if (element && !element.empty()) {
                console.log(`🧹 MW 배지 제거: ${id}`);
              }
            } else if (type === 'link' && element && !element.empty() && originalStyles) {
              element
                .attr('stroke', originalStyles.originalStroke)
                .attr('stroke-width', originalStyles.originalWidth)
                .attr('stroke-opacity', originalStyles.originalOpacity)
                .classed('failure-point-animated', false); // 클래스 제거
            }
          } catch (itemError) {
            console.warn(`애니메이션 개별 정리 중 오류 (${type} ${id}):`, itemError);
          }
        }
      );

      // 모든 장애점 관련 클래스 강제 제거
      try {
        if (typeof d3 !== 'undefined') {
          // MW 배지 제거
          d3.selectAll('[class*="mw-badge-"]').remove();

          // 링크 경보 배지 제거
          d3.selectAll('[class*="link-alarm-badge-"]').remove();

          // 장애점 애니메이션 클래스 제거
          d3.selectAll('.failure-point-animated').classed('failure-point-animated', false);
          d3.selectAll('.failure-point-circle').classed('failure-point-circle', false);

          console.log('🧹 모든 MW 배지, 링크 경보 배지 및 장애점 클래스 강제 제거 완료');
        }
      } catch (badgeError) {
        console.warn('MW 배지 및 클래스 강제 제거 중 오류:', badgeError);
      }

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

      // D3 트랜지션 및 클래스 강제 정리 (최후 수단)
      try {
        if (typeof d3 !== 'undefined') {
          d3.selectAll('.links line').interrupt();
          d3.selectAll('.nodes .node-group circle').interrupt();

          // MW 통합 배지 강제 제거
          d3.selectAll('[class*="mw-badge-"]').remove();

          // 링크 경보 배지 강제 제거
          d3.selectAll('[class*="link-alarm-badge-"]').remove();

          // 장애점 관련 클래스 강제 제거
          d3.selectAll('.failure-point-animated').classed('failure-point-animated', false);
          d3.selectAll('.failure-point-circle').classed('failure-point-circle', false);
        }
      } catch (d3Error) {
        console.warn('D3 트랜지션 및 클래스 강제 정리 중 오류:', d3Error);
      }
    }
  }

  // 선로 장애점에 경보 배지 추가
  addLinkAlarmBadgeIfNeeded(linkElement, linkId) {
    try {
      // 해당 링크의 장애점 정보 찾기
      const failurePoint = this.currentFailurePoints.find((fp) => fp.id === linkId);
      if (!failurePoint || failurePoint.type !== 'link') {
        return;
      }

      console.log(`🚨 선로 장애점 경보 배지 추가: ${linkId}`, failurePoint);

      // 링크 데이터 가져오기
      const linkData = linkElement.datum();
      if (!linkData) {
        console.warn(`⚠️ 링크 데이터가 없습니다: ${linkId}`);
        return;
      }

      // 장애점에 포함된 경보 개수 확인
      const alarmCount = (failurePoint.alarms || []).length;
      if (alarmCount === 0) {
        console.log(`ℹ️ 선로 장애점에 경보가 없습니다: ${linkId}`);
        return;
      }

      // 링크 중간 지점 계산
      const sourceX = linkData.source.x || 0;
      const sourceY = linkData.source.y || 0;
      const targetX = linkData.target.x || 0;
      const targetY = linkData.target.y || 0;

      const midX = (sourceX + targetX) / 2;
      const midY = (sourceY + targetY) / 2;

      // 링크 경보 배지 생성
      this.addLinkAlarmBadge(linkElement, alarmCount, midX, midY, linkId);

      console.log(`✅ 선로 경보 배지 추가 완료: ${linkId}, 경보 ${alarmCount}개`);
    } catch (error) {
      console.error(`❌ 선로 경보 배지 추가 오류 (${linkId}):`, error);
    }
  }

  // 링크 경보 배지 생성 (링크 라벨 위에 위치)
  addLinkAlarmBadge(linkElement, alarmCount, x, y, linkId) {
    try {
      console.log(`🏷️ 링크 경보 배지 생성: ${linkId} - ${alarmCount}개 경보`);

      // 링크 경보 배지 그룹 생성 (라벨 위에 배치)
      const badgeGroup = d3
        .select(linkElement.node().parentNode)
        .append('g')
        .attr('class', `link-alarm-badge-${linkId}`)
        .attr('transform', `translate(${x}, ${y - 30})`); // 라벨보다 30px 위에 배치

      // 배지 원형 배경
      badgeGroup
        .append('circle')
        .attr('r', 10) // 크기를 약간 줄임
        .attr('fill', '#ff8c00')
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 2)
        .style('filter', 'drop-shadow(0px 2px 4px rgba(0,0,0,0.3))')
        .style('cursor', 'pointer');

      // 경보 개수 텍스트
      badgeGroup
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('fill', '#ffffff')
        .attr('font-size', '10px')
        .attr('font-weight', 'bold')
        .text(alarmCount > 99 ? '99+' : alarmCount)
        .style('cursor', 'pointer')
        .style('user-select', 'none');

      // 배지 애니메이션 (처음 나타날 때)
      badgeGroup
        .style('opacity', 0)
        .transition()
        .duration(500)
        .style('opacity', 1)
        .attr('transform', `translate(${x}, ${y - 30}) scale(1.2)`)
        .transition()
        .duration(200)
        .attr('transform', `translate(${x}, ${y - 30}) scale(1)`);

      // 클릭 이벤트 추가 (경보 상세 정보 표시)
      badgeGroup.on('click', () => {
        this.showLinkAlarmDetails(linkId);
      });

      // 애니메이션 추적을 위해 저장
      this.animationElements.push({
        type: 'link-badge',
        id: linkId,
        element: badgeGroup,
        linkData: linkElement.datum(), // 링크 데이터도 함께 저장
        stopAnimation: () => {
          badgeGroup.remove();
        },
        originalStyles: null,
        // 위치 업데이트 메서드 추가
        updatePosition: () => {
          const linkData = linkElement.datum();
          if (linkData && linkData.source && linkData.target) {
            const sourceX = linkData.source.x || 0;
            const sourceY = linkData.source.y || 0;
            const targetX = linkData.target.x || 0;
            const targetY = linkData.target.y || 0;
            const midX = (sourceX + targetX) / 2;
            const midY = (sourceY + targetY) / 2;
            badgeGroup.attr('transform', `translate(${midX}, ${midY - 30})`);
          }
        },
      });

      console.log(`✨ 링크 경보 배지 생성 완료: ${linkId} (위치: ${x}, ${y - 30})`);
    } catch (error) {
      console.error(`❌ 링크 경보 배지 생성 오류 (${linkId}):`, error);
    }
  }

  // 링크 경보 상세 정보 표시
  showLinkAlarmDetails(linkId) {
    try {
      const failurePoint = this.currentFailurePoints.find((fp) => fp.id === linkId);
      if (!failurePoint) {
        console.warn(`⚠️ 장애점을 찾을 수 없습니다: ${linkId}`);
        return;
      }

      const alarms = failurePoint.alarms || [];
      if (alarms.length === 0) {
        MessageManager.addMessage(`선로 "${failurePoint.name}"에 경보가 없습니다.`, {
          type: 'info',
        });
        return;
      }

      // 경보 목록 HTML 생성
      const alarmListHTML = MessageManager.generateAnalysisAlarmListHTML(alarms);

      // 메시지 생성
      const message = `
        <div>
          <h4 style="margin: 0 0 10px 0; color: #ff8c00;">🔗 선로 장애점: ${failurePoint.name}</h4>
          <p style="margin: 0 0 10px 0;">총 <strong>${alarms.length}개</strong>의 선로 경보가 발생했습니다.</p>
          ${alarmListHTML}
        </div>
      `;

      MessageManager.addMessage(message, {
        type: 'info',
        allowHtml: true,
        duration: 10000, // 10초간 표시
      });

      console.log(`ℹ️ 선로 경보 상세 정보 표시: ${linkId}, ${alarms.length}개 경보`);
    } catch (error) {
      console.error(`❌ 선로 경보 상세 정보 표시 오류 (${linkId}):`, error);
    }
  }

  // MW 장애점 세부 분류 (통합된 메서드)
  _classifyMWFailureType(failurePoint, failureType) {
    const mwFailureTypes = {
      fading: {
        flag: 'mw_fading_failure',
        keywords: ['페이딩', '전파 페이딩', '전파수신 오류', 'RSL', 'TSL', 'SNR', 'XPI'],
      },
      linkDisconnect: {
        flag: 'mw_link_disconnect_failure',
        keywords: ['링크단절', 'HW장애', '링크 단절', 'H/W장애', '하드웨어 장애'],
      },
      error: {
        flag: 'mw_error_failure',
        keywords: ['MW 전송 Error', 'Error', 'ERR', 'BER', 'ES', 'SES'],
      },
      voltage: {
        flag: 'mw_voltage_failure',
        keywords: ['전압', '저전압', '배터리', '한전', '정전', 'VOLT', '배터리 모드'],
      },
    };

    const config = mwFailureTypes[failureType];
    if (!config) return false;

    // 1. 기존 플래그 우선 확인
    if (failurePoint[config.flag] === true) {
      return true;
    }

    // 2. failure_desc 및 failure_type에서 키워드 확인
    const failureDesc = failurePoint.failure_desc || failurePoint.failure_type || '';
    if (config.keywords.some((keyword) => failureDesc.includes(keyword))) {
      return true;
    }

    // 3. inference_detail에서 키워드 확인
    const inferenceDetail = failurePoint.inference_detail || '';
    if (config.keywords.some((keyword) => inferenceDetail.includes(keyword))) {
      return true;
    }

    return false;
  }

  // 편의 메서드들 (기존 호환성 유지)
  _isMWFadingFailure(failurePoint) {
    return this._classifyMWFailureType(failurePoint, 'fading');
  }

  _isMWLinkDisconnectFailure(failurePoint) {
    return this._classifyMWFailureType(failurePoint, 'linkDisconnect');
  }

  _isMWErrorFailure(failurePoint) {
    return this._classifyMWFailureType(failurePoint, 'error');
  }

  _isMWVoltageFailure(failurePoint) {
    return this._classifyMWFailureType(failurePoint, 'voltage');
  }

  resetCounters() {
    // 모든 카운터를 0으로 초기화
    const counters = [
      'step1_link_count',
      'step2_mw_count',
      'step2_mw_fading_count',
      'step2_mw_link_disconnect_count',
      'step2_mw_error_count',
      'step2_mw_voltage_count',
      'step3_upper_count',
      'step4_exchange_count',
      'step5_transmission_count',
      'step6_ip_count',
      'step7_wireless_count',
      'total_unique_nodes',
    ];

    counters.forEach((counter) => {
      this[counter] = 0;
    });
  }

  // 안전한 메시지 처리 유틸리티
  async _safeMessageHandler(messagePromise, callback) {
    try {
      if (messagePromise && typeof messagePromise.then === 'function') {
        messagePromise.finally(() => {
          if (callback) callback();
        });
      } else {
        setTimeout(() => {
          if (callback) callback();
        }, 100);
      }
    } catch (error) {
      console.error('❌ 메시지 처리 오류:', error);
      if (callback) callback();
    }
  }
}

// 싱글톤 인스턴스 생성 및 export
export const failurePointManager = new FailurePointManager();
