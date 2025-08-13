// ================================
// AnalysisInterruption.js - 분석 중단 관리자 (전역 변수 없는 개선된 버전)
// ================================

/**
 * 7단계 장애점 분석 중 방해 이벤트 모니터링 및 중단 확인 관리
 * - 전역 변수 사용 없이 EventTarget 상속 + 의존성 주입 패턴 사용
 * - 전체 화면 오버레이 확인창 제공
 */
class AnalysisInterruption extends EventTarget {
  constructor() {
    super();
    this.isAnalysisInProgress = false;
    this.pendingInterruption = false;
    this.eventListenersAttached = false;
    this.originalEventHandler = null;
    this.currentSessionId = null;
    this.overlayElement = null;

    // 의존성 객체들 (생성자에서 주입받음)
    this.faultDashboardApp = null;
    this.failurePointManager = null;

    // 모니터링할 이벤트 목록 (5개로 축소)
    this.monitoredEvents = [
      { selector: '#fault-query-btn', event: 'click', description: '통합 경보 조회' },
      {
        selector: 'input[name="sector"]',
        event: 'change',
        description: '경보 장비 선택의 분야 변경',
      },
      { selector: '#searchEquipName', event: 'change', description: '경보 장비 선택의 장비 변경' },
      { selector: '#alarmTableBody tr', event: 'click', description: '경보 테이블 Row 선택' },
      {
        selector: '.dashboard-sector-simple',
        event: 'click',
        description: '상단 분야 대시보드 카드 변경',
      },
    ];
  }

  // 의존성 주입
  setDependencies(faultDashboardApp, failurePointManager) {
    this.faultDashboardApp = faultDashboardApp;
    this.failurePointManager = failurePointManager;
  }

  // AbortController 주입 메서드 (window 의존성 제거)
  setAbortController(abortController) {
    this.currentAbortController = abortController;
  }

  // 분석 시작 시 호출
  startAnalysisMonitoring(sessionId = null) {
    console.log('🔍 분석 모니터링 시작');
    this.isAnalysisInProgress = true;
    this.currentSessionId = sessionId;
    this.attachEventListeners();

    // 분석 시작 이벤트 발생
    this.dispatchEvent(
      new CustomEvent('analysisStarted', {
        detail: { sessionId },
      })
    );
  }

  // 분석 완료 시 호출
  stopAnalysisMonitoring() {
    console.log('✅ 분석 모니터링 중지');
    this.isAnalysisInProgress = false;
    this.pendingInterruption = false;
    this.currentSessionId = null;
    this.removeEventListeners();
    this.hideConfirmationOverlay();

    // 분석 완료 이벤트 발생
    this.dispatchEvent(new CustomEvent('analysisStopped'));
  }

  // 이벤트 리스너 등록
  attachEventListeners() {
    if (this.eventListenersAttached) return;

    this.monitoredEvents.forEach(({ selector, event, description }) => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((element) => {
        element.addEventListener(event, this.handleInterruptionEvent.bind(this, description), true);
      });
    });

    // 동적으로 생성되는 요소들을 위한 이벤트 위임 (캡처링 + 우선순위 높음)
    document.addEventListener('click', this.handleDynamicClick.bind(this), {
      capture: true,
      passive: false,
    });
    document.addEventListener('change', this.handleDynamicChange.bind(this), {
      capture: true,
      passive: false,
    });

    this.eventListenersAttached = true;
    console.log('📡 이벤트 리스너 등록 완료');
  }

  // 이벤트 리스너 제거
  removeEventListeners() {
    if (!this.eventListenersAttached) return;

    this.monitoredEvents.forEach(({ selector, event }) => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((element) => {
        element.removeEventListener(event, this.handleInterruptionEvent, true);
      });
    });

    document.removeEventListener('click', this.handleDynamicClick.bind(this), true);
    document.removeEventListener('change', this.handleDynamicChange.bind(this), true);

    this.eventListenersAttached = false;
    console.log('🔌 이벤트 리스너 제거 완료');
  }

  // 동적 클릭 이벤트 처리
  handleDynamicClick(event) {
    if (!this.isAnalysisInProgress) return;

    const target = event.target;

    // 대시보드 카드 클릭 (정확한 1개 셀렉터만 사용)
    if (target.closest('.dashboard-sector-simple')) {
      this.handleInterruptionEvent('상단 분야 대시보드 카드 변경', event);
      return;
    }

    // 테이블 행 클릭
    if (target.closest('#alarmTableBody tr')) {
      this.handleInterruptionEvent('경보 테이블 Row 선택', event);
      return;
    }
  }

  // 동적 변경 이벤트 처리
  handleDynamicChange(event) {
    if (!this.isAnalysisInProgress) return;

    const target = event.target;

    // 분야 라디오 버튼
    if (target.name === 'sector') {
      this.handleInterruptionEvent('경보 장비 선택의 분야 변경', event);
      return;
    }

    // 장비 선택
    if (target.id === 'searchEquipName') {
      this.handleInterruptionEvent('경보 장비 선택의 장비 변경', event);
      return;
    }
  }

  // 방해 이벤트 처리
  handleInterruptionEvent(description, event) {
    if (!this.isAnalysisInProgress || this.pendingInterruption) return;

    console.log(`⚠️ 분석 중 방해 이벤트 감지: ${description}`);

    // 이벤트 중단
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    // 원본 이벤트 저장
    this.originalEventHandler = () => {
      // 원본 동작 복원
      this.removeEventListeners();

      // 잠시 후 이벤트 재실행
      setTimeout(() => {
        if (event.type === 'click') {
          event.target.click();
        } else if (event.type === 'change') {
          event.target.dispatchEvent(new Event('change', { bubbles: true }));
        }
        this.attachEventListeners();
      }, 100);
    };

    // 전체 화면 오버레이로 확인 메시지 표시
    this.showConfirmationOverlay(description);
  }

  // 전체 화면 오버레이로 확인 메시지 표시 (전역 변수 사용 안함)
  showConfirmationOverlay(eventDescription) {
    this.pendingInterruption = true;

    // 기존 오버레이 제거
    this.hideConfirmationOverlay();

    // 오버레이 생성
    this.overlayElement = document.createElement('div');
    this.overlayElement.className = 'analysis-interruption-overlay';
    this.overlayElement.innerHTML = `
      <div class="interruption-dialog">
        <div class="interruption-header">
          <h3>🔍 7단계 장애점 분석 진행 중</h3>
        </div>
        <div class="interruption-content">
          <p><strong>${eventDescription}</strong> 이벤트가 감지되었습니다.</p>
          <p>현재 진행 중인 7단계 장애점 분석을 어떻게 처리하시겠습니까?</p>
        </div>
        <div class="interruption-actions">
          <button class="btn-interrupt-abort">중단</button>
          <button class="btn-interrupt-continue">계속</button>
        </div>
      </div>
    `;

    // 버튼 이벤트 리스너 등록 (전역 변수 사용 안함)
    const abortBtn = this.overlayElement.querySelector('.btn-interrupt-abort');
    const continueBtn = this.overlayElement.querySelector('.btn-interrupt-continue');

    abortBtn.addEventListener('click', () => this.handleInterruptionChoice(true));
    continueBtn.addEventListener('click', () => this.handleInterruptionChoice(false));

    // 스타일 추가
    this.addOverlayStyles();

    // 오버레이를 body에 추가
    document.body.appendChild(this.overlayElement);

    // 애니메이션 효과
    setTimeout(() => {
      this.overlayElement.classList.add('show');
    }, 10);
  }

  // 전체 화면 오버레이 스타일 추가
  addOverlayStyles() {
    if (document.getElementById('analysis-interruption-styles')) return;

    const style = document.createElement('style');
    style.id = 'analysis-interruption-styles';
    style.textContent = `
      .analysis-interruption-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        z-index: 10000;
        display: flex;
        justify-content: center;
        align-items: center;
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .analysis-interruption-overlay.show {
        opacity: 1;
      }

      .interruption-dialog {
        background: white;
        border-radius: 12px;
        min-width: 500px;
        max-width: 600px;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
        transform: scale(0.9);
        transition: transform 0.3s ease;
      }

      .analysis-interruption-overlay.show .interruption-dialog {
        transform: scale(1);
      }

      .interruption-header {
        background: #f8f9fa;
        padding: 24px;
        border-radius: 12px 12px 0 0;
        border-bottom: 1px solid #dee2e6;
        text-align: center;
      }

      .interruption-header h3 {
        margin: 0;
        color: #495057;
        font-size: 20px;
        font-weight: 600;
      }

      .interruption-content {
        padding: 24px;
        text-align: center;
        line-height: 1.6;
      }

      .interruption-content p {
        margin: 0 0 16px 0;
        color: #333;
        font-size: 16px;
      }

      .interruption-content p:last-child {
        margin-bottom: 0;
        font-weight: 600;
        color: #495057;
      }

      .interruption-actions {
        padding: 24px;
        display: flex;
        gap: 16px;
        justify-content: center;
        border-top: 1px solid #dee2e6;
      }

      .interruption-actions button {
        padding: 12px 32px;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        font-size: 16px;
        min-width: 120px;
      }

      .btn-interrupt-abort {
        background: #dc3545;
        color: white;
      }

      .btn-interrupt-abort:hover {
        background: #c82333;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(220, 53, 69, 0.3);
      }

      .btn-interrupt-continue {
        background: #28a745;
        color: white;
      }

      .btn-interrupt-continue:hover {
        background: #218838;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3);
      }
    `;
    document.head.appendChild(style);
  }

  // 중단 선택 처리
  handleInterruptionChoice(shouldAbort) {
    this.pendingInterruption = false;
    this.hideConfirmationOverlay();

    if (shouldAbort) {
      // "중단" 선택: 7단계 분석 중단 후 기존 이벤트 실행
      console.log('🛑 분석 중단 후 기존 이벤트 실행');
      this.interruptAnalysis();
    } else {
      // "계속" 선택: 7단계 분석 계속 진행, 기존 이벤트는 중단
      console.log('🔄 분석 계속 진행, 기존 이벤트 중단');
      // 원본 이벤트 핸들러 초기화 (실행하지 않음)
      this.originalEventHandler = null;
    }
  }

  // 분석 중단 처리
  async interruptAnalysis() {
    try {
      console.log('🛑 7단계 분석 중단 처리 시작');

      // 1. 먼저 EventSource 연결을 즉시 강제 종료 (메시지 수신 차단)
      this.forceCloseAllConnections();

      // 2. FailurePointManager 강제 중단
      if (this.failurePointManager && typeof this.failurePointManager.stopAnalysis === 'function') {
        console.log('🛑 FailurePointManager 강제 중단 실행');
        this.failurePointManager.stopAnalysis();
      }

      // 3. 백엔드 세션 중단 (EventSource가 이미 닫혔으므로 안전)
      if (this.currentSessionId) {
        console.log('🛑 백엔드 세션 중단 요청');
        await this.abortCurrentAnalysis();
      }

      // 4. FaultDashboardApp 분석 상태 복원
      if (this.faultDashboardApp) {
        console.log('🛑 FaultDashboardApp 분석 상태 복원');
        this.faultDashboardApp._isAnalyzing = false;
        this.faultDashboardApp.updateAnalysisButtonState(false);
      }

      // 5. 분석 상태 초기화
      this.stopAnalysisMonitoring();

      // 6. 분석 중단 이벤트 발생
      this.dispatchEvent(
        new CustomEvent('analysisInterrupted', {
          detail: { sessionId: this.currentSessionId },
        })
      );

      // 7. 중단 완료 메시지
      if (window.MessageManager) {
        window.MessageManager.addErrorMessage('🛑 장애점 분석이 중단되었습니다.');
      }

      // 8. 원본 이벤트 실행
      if (this.originalEventHandler) {
        console.log('🔄 원본 이벤트 실행');
        setTimeout(() => {
          this.originalEventHandler();
          this.originalEventHandler = null;
        }, 500); // 약간의 지연을 두어 안정성 확보
      }
    } catch (error) {
      console.error('❌ 분석 중단 처리 중 오류:', error);
      if (window.MessageManager) {
        window.MessageManager.addErrorMessage('분석 중단 처리 중 오류가 발생했습니다.');
      }
    }
  }

  // 모든 연결 강제 종료
  forceCloseAllConnections() {
    try {
      console.log('🔌 모든 분석 연결 강제 종료');

      // FailurePointManager를 통한 EventSource 종료 (강화된 버전)
      if (this.failurePointManager && this.failurePointManager.currentEventSource) {
        const eventSource = this.failurePointManager.currentEventSource;
        console.log(`🔌 EventSource 상태: ${eventSource.readyState} (0=연결중, 1=열림, 2=닫힘)`);

        if (eventSource.readyState !== EventSource.CLOSED) {
          console.log('🔌 EventSource 강제 종료 실행');
          eventSource.close();
        }
        this.failurePointManager.currentEventSource = null;
        console.log('✅ EventSource 종료 완료');
      }

      // 주입된 AbortController 중단
      if (this.currentAbortController) {
        console.log('🔌 주입된 AbortController 중단');
        this.currentAbortController.abort();
        this.currentAbortController = null;
      }

      // FailurePointManager를 통한 AbortController 종료
      if (this.failurePointManager && this.failurePointManager.currentAbortController) {
        console.log('🔌 FailurePointManager AbortController 중단');
        this.failurePointManager.currentAbortController.abort();
        this.failurePointManager.currentAbortController = null;
      }

      console.log('✅ 모든 연결 강제 종료 완료');
    } catch (error) {
      console.error('❌ 연결 강제 종료 중 오류:', error);
    }
  }

  // 백엔드 분석 세션 중단 (강화된 버전)
  async abortCurrentAnalysis() {
    if (!this.currentSessionId) {
      console.warn('⚠️ 중단할 세션 ID가 없습니다.');
      return;
    }

    try {
      console.log(`🛑 백엔드 세션 강제 중단 요청: ${this.currentSessionId}`);

      // 백엔드 중단 API 호출 (타임아웃 설정)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5초 타임아웃

      try {
        const response = await fetch(`/api/abort_analysis/${this.currentSessionId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const result = await response.json();
          console.log('✅ 백엔드 세션 중단 완료:', result);
        } else {
          const error = await response.json();
          console.warn('⚠️ 백엔드 세션 중단 실패:', error);
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          console.warn('⚠️ 백엔드 중단 요청 타임아웃 (5초)');
        } else {
          console.error('❌ 백엔드 세션 중단 요청 오류:', fetchError);
        }
      }

      // 백엔드 응답과 관계없이 프론트엔드에서 강제 중단 처리
      console.log('🔧 프론트엔드 강제 중단 처리 실행');
    } catch (error) {
      console.error('❌ 백엔드 세션 중단 처리 중 최상위 오류:', error);
    } finally {
      // 세션 ID 초기화 (중단 완료 표시)
      this.currentSessionId = null;
    }
  }

  // 확인 오버레이 숨기기
  hideConfirmationOverlay() {
    if (this.overlayElement) {
      this.overlayElement.classList.remove('show');
      setTimeout(() => {
        if (this.overlayElement && this.overlayElement.parentNode) {
          this.overlayElement.parentNode.removeChild(this.overlayElement);
        }
        this.overlayElement = null;
      }, 300);
    }
  }

  // 분석 상태 확인
  getAnalysisStatus() {
    return {
      isAnalysisInProgress: this.isAnalysisInProgress,
      pendingInterruption: this.pendingInterruption,
      currentSessionId: this.currentSessionId,
      eventListenersAttached: this.eventListenersAttached,
    };
  }
}

// ES6 모듈 내보내기 (전역 변수 사용 안함)
export default AnalysisInterruption;
