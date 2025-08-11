/**
 * RAGPopupWindow - AI RAG 유사 장애사례 조회 팝업창 관리 클래스
 */

import { DOMBuilder } from '../utils/DOMBuilder.js';
import { stateManager as StateManager } from './StateManager.js';
import MessageManager from '../utils/MessageManager.js';

export class RAGPopupWindow {
  constructor() {
    this.isInitialized = false;
    console.log('🏠 RAGPopupWindow 생성자 완료');
  }

  /**
   * AI RAG 모달 팝업 열기 (메인 진입점)
   */
  async openFaultDetectorPopup() {
    try {
      console.log('🚀 AI RAG 장애분석 팝업 열기 시작...');

      const analysisData = await this.prepareAnalysisData();
      if (!analysisData) return;

      this.createFaultDetectorModal(analysisData.postData);
      this.showAnalysisStartMessage(analysisData.baseNode, analysisData.mapAlarms.length);
    } catch (error) {
      console.error('❌ AI 장애분석 팝업 열기 실패:', error);
      this.handleError('AI 장애분석 시작 실패', error);
    }
  }

  /**
   * 1. 분석 데이터 준비 (분리된 메서드)
   */
  async prepareAnalysisData() {
    const currentMapData = this.getCurrentMapData();
    if (!this.validateMapDataForAnalysis(currentMapData)) {
      return null;
    }

    const mapAlarms = this.getMapRelatedAlarms(currentMapData.nodes);
    const baseNode = currentMapData.baseNode || currentMapData.nodes[0];
    const guksaName = this.extractGuksaName(mapAlarms, baseNode);

    const postData = {
      baseNode: {
        equip_id: baseNode.id,
        equip_name: baseNode.name,
        sector: baseNode.sector || StateManager.get('selectedSector', 'IP'),
        guksa_name: guksaName,
      },
      alarms: mapAlarms,
    };

    console.log('📤 POST 데이터:', postData);
    return { postData, baseNode, mapAlarms };
  }

  /**
   * 현재 맵 데이터 조회 (StateManager에서)
   */
  getCurrentMapData() {
    try {
      console.log('🗺️ 현재 맵 데이터 조회 중...');

      // StateManager에서 현재 맵 데이터 조회
      const mapData = StateManager.getCurrentMapData();

      if (!mapData) {
        MessageManager.addErrorMessage('📌 분석할 NW 토폴로지가 없습니다. 장비를 먼저 선택하세요.');
        return null;
      }

      // 노드가 없는 경우만 제외 (1개 노드도 분석 가능하도록 변경)
      if (!mapData.nodes || mapData.nodes.length === 0) {
        MessageManager.addErrorMessage('📌 분석할 장비가 없습니다. 장비를 먼저 선택하세요.');
        return null;
      }

      console.log(
        `✅ 맵 데이터 조회 성공: 노드 ${mapData.nodes.length}개, 링크 ${
          mapData.links ? mapData.links.length : 0
        }개`
      );
      return mapData;
    } catch (error) {
      console.error('❌ 현재 맵 데이터 조회 실패:', error);
      MessageManager.addErrorMessage('📌 맵 데이터 조회 중 오류가 발생했습니다.');
      return null;
    }
  }

  /**
   * 1.1 맵 데이터 유효성 검사 (분석용)
   */
  validateMapDataForAnalysis(mapData) {
    if (!mapData || !mapData.nodes || mapData.nodes.length === 0) {
      console.error('❌ 맵 데이터 없음:', mapData);
      return false;
    }
    return true;
  }

  /**
   * 1.2 맵 관련 경보 추출
   */
  getMapRelatedAlarms(nodes) {
    const nodeIds = new Set(nodes.map((node) => node.id));
    console.log('🏷️ 노드 ID 목록:', Array.from(nodeIds));

    const totalAlarmData = StateManager.get('totalAlarmDataList', []);
    console.log('📊 전체 경보 데이터 개수:', totalAlarmData.length);

    const mapAlarms = totalAlarmData.filter((alarm) => alarm && nodeIds.has(alarm.equip_id));
    console.log('🔍 맵 관련 경보 필터링 결과:', mapAlarms.length);
    console.log(
      '📋 맵 관련 경보 목록:',
      mapAlarms.map((a) => ({ equip_id: a.equip_id, message: a.alarm_message }))
    );

    if (mapAlarms.length === 0) {
      console.warn('⚠️ 경보 데이터 없음 - 빈 데이터로 계속 진행');
    }

    return mapAlarms;
  }

  /**
   * 1.3 국사명 추출
   */
  extractGuksaName(mapAlarms, baseNode) {
    const baseNodeAlarms = mapAlarms.filter((alarm) => alarm.equip_id === baseNode.id);
    const guksaName =
      baseNodeAlarms.length > 0
        ? baseNodeAlarms[0].guksa_name
        : mapAlarms.length > 0
        ? mapAlarms[0].guksa_name
        : '알수없음';

    console.log('🏢 추출된 국사명:', guksaName);
    return guksaName;
  }

  /**
   * 분석 시작 메시지 표시
   */
  showAnalysisStartMessage(baseNode, alarmCount) {
    MessageManager.addAnalyzingMessage?.(
      `🔍 현재 MAP의 경보들과 유사한 장애사례를 분석합니다. <br><br> • 기준 장비: ${baseNode.name} <br> • 전체 경보 수: ${alarmCount} 건`
    );
  }

  /**
   * 2. AI RAG 모달 팝업 생성
   */
  createFaultDetectorModal(postData) {
    // 기존 모달 제거
    const existingModal = document.getElementById('fault-detector-modal');
    if (existingModal) {
      existingModal.remove();
    }

    const modalOverlay = this.createModalOverlay(postData);
    this.attachModalEvents(modalOverlay);
    document.body.appendChild(modalOverlay);
  }

  /**
   * 2-1. 모달 오버레이 생성 (원래 스타일 복원)
   */
  createModalOverlay(postData) {
    const modalOverlay = DOMBuilder.createDiv('fault-detector-modal', '', {
      id: 'fault-detector-modal',
    });

    // 원래 스타일로 모달 오버레이 설정
    modalOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
    `;

    const modalContainer = DOMBuilder.createDiv('fault-detector-modal-container');

    // 원래 크기로 모달 컨테이너 설정
    modalContainer.style.cssText = `
      width: 90%;
      height: 90%;
      max-width: 1200px;
      max-height: 800px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `;

    const modalHeader = this.createModalHeader(postData.baseNode, postData.alarms.length);
    const modalBody = this.createModalBody(postData);

    modalContainer.appendChild(modalHeader);
    modalContainer.appendChild(modalBody);
    modalOverlay.appendChild(modalContainer);

    return modalOverlay;
  }

  /**
   * 2-2. 모달 헤더 생성 (원래 스타일 복원)
   */
  createModalHeader(baseNode, alarmCount) {
    const modalHeader = DOMBuilder.createDiv('fault-detector-modal-header');

    // 원래 파란색 헤더 스타일로 수정
    modalHeader.style.cssText = `
      background-color: #007bff;
      color: white;
      padding: 10px 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 16px;
      font-weight: bold;
    `;

    const modalTitle = DOMBuilder.createElement('div', {
      textContent: `AI RAG 유사 장애사례 조회 - ${baseNode.equip_name} (${alarmCount}건)`,
    });

    const closeButton = DOMBuilder.createButton('×', 'fault-detector-modal-close', {
      id: 'close-modal-btn',
    });

    closeButton.style.cssText = `
      background: none;
      border: none;
      color: white;
      font-size: 20px;
      cursor: pointer;
      padding: 0;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    modalHeader.appendChild(modalTitle);
    modalHeader.appendChild(closeButton);

    return modalHeader;
  }

  /**
   * 2-3. 모달 바디 생성 (원래 스타일 복원)
   */
  createModalBody(postData) {
    const modalBody = DOMBuilder.createDiv('fault-detector-modal-body');

    // 모달 바디 스타일 설정
    modalBody.style.cssText = `
      flex: 1;
      overflow: hidden;
    `;

    const iframe = DOMBuilder.createElement(
      'iframe',
      {
        className: 'fault-detector-modal-iframe',
      },
      {
        width: '100%',
        height: '100%',
        border: 'none',
      }
    );

    modalBody.appendChild(iframe);

    console.log('📡 POST 요청 시작 - /api/fault-detector');

    // fetch로 POST 요청 보내고 응답을 iframe에 표시
    fetch('/api/fault-detector', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        baseNode: postData.baseNode,
        alarms: postData.alarms,
      }),
    })
      .then((response) => {
        console.log('📡 서버 응답 상태:', response.status, response.statusText);

        if (!response.ok) {
          throw new Error(`서버 오류: ${response.status} ${response.statusText}`);
        }

        return response.text(); // HTML 응답으로 변경
      })
      .then((html) => {
        console.log('📄 HTML 응답 수신 완료');

        // 응답 HTML을 iframe에 직접 작성
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        iframeDoc.open();
        iframeDoc.write(html);
        iframeDoc.close();

        console.log('✅ iframe에 HTML 로드 완료');
      })
      .catch((error) => {
        console.error('❌ 데이터 로딩 실패:', error);
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        iframeDoc.open();
        iframeDoc.write(`
            <div style="padding: 20px; font-family: Arial, sans-serif;">
              <h3 style="color: #dc3545;">❌ 데이터 로딩 실패</h3>
              <p>${error.message}</p>
              <p>잠시 후 다시 시도해주세요.</p>
            </div>
          `);
        iframeDoc.close();
      });

    return modalBody;
  }

  /**
   * 2-4. AI RAG 모달 팝업 이벤트 처리
   */
  attachModalEvents(modalOverlay) {
    const closeModal = () => modalOverlay.remove();

    // 닫기 버튼
    const closeButton = modalOverlay.querySelector('#close-modal-btn');
    closeButton.addEventListener('click', closeModal);

    // 오버레이 클릭
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });

    // ESC 키
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  }

  /**
   * 에러 처리
   */
  handleError(message, error) {
    console.error(`❌ ${message}:`, error);
    MessageManager.addErrorMessage?.(`${message}: ${error.message}`);
  }

  /**
   * 메모리 정리
   */
  destroy() {
    // 기존 모달 제거
    const existingModal = document.getElementById('fault-detector-modal');
    if (existingModal) {
      existingModal.remove();
    }

    console.log('🧹 RAGPopupWindow 메모리 정리 완료');
  }
}

// 싱글톤 인스턴스 생성
export const ragPopupWindow = new RAGPopupWindow();
