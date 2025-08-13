/**
 * MessageManager 클래스
 * 클래스를 직접 사용하는 표준 방식
 * 네임스페이스 호출을 위한 정적 메서드 추가
 */

import { formatDateTimeForToolTip, escapeHtml } from '../utils/CommonUtils.js';

const MESSAGE_TYPES = {
  SYSTEM: 'system',
  ERROR: 'error',
  SUCCESS: 'success',
  WARNING: 'warning',
  INFO: 'info',
  ANALYSIS: 'analysis',
  SUMMARY: 'summary',
  ALARM_STATUS: 'alarm-status',
  USER: 'user',
  ANALYZING: 'analyzing',
  ALARM: 'alarm',
};

const MESSAGE_CONFIG = {
  MAX_MESSAGES: 100,
  AUTO_HIDE_DELAY: 0,
  SCROLL_ANIMATION: 300,
  TIMESTAMP_FORMAT: 'HH:MM',
  FALLBACK_TO_CONSOLE: true,
};

// 타이핑 효과 속도 상수 정의 (더욱 빠른 속도로 수정)
const TYPING_SPEEDS = {
  ULTRA_FAST: 0, // 극도로 빠름 - 즉시 표시
  VERY_FAST: 0.1, // 매우 빠름 - 거의 즉시
  FAST: 1, // 빠름 - 매우 빠르게
  NORMAL: 5, // 보통 - 빠르게
  SLOW: 15, // 느림 - 기존 보통 속도
  VERY_SLOW: 25, // 매우 느림 - 기존 느림 속도

  // 메시지 타입별 기본 속도 (훨씬 더 빠르게 수정)
  PROGRESS: 0, // 진행 상황 메시지 - 즉시 표시
  SUMMARY: 0, // 요약 결과 메시지 - 즉시 표시
  ERROR: 0, // 오류 메시지 - 즉시 표시
  SUCCESS: 0, // 성공 메시지 - 즉시 표시
  ANALYZING: 0, // 분석 중 메시지 - 즉시 표시
  DEFAULT: 0, // 기본 속도 - 즉시 표시
};

/*
사용법 예시:
1. 기본 사용:
   MessageManager.addMessageWithTypingEffect('메시지', { speed: TYPING_SPEEDS.FAST });

2. 메시지 타입별 기본 속도 사용:
   MessageManager.addProgressMessageWithTyping('진행 중...', { speed: TYPING_SPEEDS.PROGRESS });

3. 커스텀 속도:
   MessageManager.addMessageWithTypingEffect('메시지', { speed: 10 }); // 매우 빠름
*/

export class MessageManager {
  constructor(containerId = 'chat-messages-area') {
    this.containerId = containerId;
    this.container = null;
    this.messages = [];
    this.messageId = 0;
    this.maxMessages = MESSAGE_CONFIG.MAX_MESSAGES;
    this.fallbackMode = false;

    // 타이핑 효과 관련 상태
    this.isTyping = false;
    this.typingQueue = [];
    this.currentTypingElement = null;
    this.typingSpeed = TYPING_SPEEDS.DEFAULT; // 글자당 대기 시간 (ms)

    this.init();
    console.log('💬 MessageManager 초기화 완료');
  }

  // ================================
  // 기존 인스턴스 메서드들 (동일)
  // ================================

  init() {
    try {
      this.container = document.getElementById(this.containerId);
      if (!this.container) {
        console.warn(`⚠️ 채팅 컨테이너를 찾을 수 없습니다: ${this.containerId}`);
        this.fallbackMode = true;
        return;
      }
      this.setupInitialMessage();
      this.setupEventListeners();
    } catch (error) {
      console.error('MessageManager 초기화 중 오류:', error);
      this.fallbackMode = true;
    }
  }

  setupInitialMessage() {
    if (!this.container || this.fallbackMode) return;
    try {
      const initialMessage = `
        <div class="chat-message system">
          <div class="message-content">
            💡 장애점 찾기를 클릭하면 AI 분석 결과가 여기에 표시됩니다.
          </div>
          <div class="message-time">${this.getCurrentTime()}</div>
        </div>
      `;
      this.container.innerHTML = initialMessage;
    } catch (error) {
      console.error('초기 메시지 설정 중 오류:', error);
    }
  }

  setupEventListeners() {
    try {
      const chatInput = document.getElementById('chat-input');
      const chatSendBtn = document.getElementById('chat-send-btn');

      if (chatInput && chatSendBtn) {
        chatInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            this.handleUserMessage(chatInput.value);
            chatInput.value = '';
          }
        });

        chatSendBtn.addEventListener('click', () => {
          this.handleUserMessage(chatInput.value);
          chatInput.value = '';
        });
      }
    } catch (error) {
      console.error('이벤트 리스너 설정 중 오류:', error);
    }
  }

  addMessage(content, options = {}) {
    const {
      type = MESSAGE_TYPES.SYSTEM,
      isAlarmMessage = false,
      timestamp = new Date(),
      autoHide = false,
      persistent = false,
      metadata = {},
    } = options;

    if (!content || typeof content !== 'string') {
      console.warn('유효하지 않은 메시지 내용:', content);
      return null;
    }

    const safeContent = String(content || '').trim();
    if (!safeContent) {
      console.warn('빈 메시지 내용은 추가할 수 없습니다.');
      return null;
    }

    const messageType = isAlarmMessage ? MESSAGE_TYPES.ALARM_STATUS : type;
    const message = {
      id: ++this.messageId,
      content: safeContent,
      type: messageType,
      timestamp: timestamp,
      persistent: persistent,
      metadata: metadata,
    };

    this.messages.push(message);
    this.trimMessages();

    if (this.fallbackMode || !this.container) {
      this.logToConsole(message);
      return message;
    }

    try {
      const messageElement = this.createMessageElement(message);
      this.container.appendChild(messageElement);
      this.scrollToBottom();

      if (autoHide && MESSAGE_CONFIG.AUTO_HIDE_DELAY > 0) {
        setTimeout(() => {
          this.removeMessage(message.id);
        }, MESSAGE_CONFIG.AUTO_HIDE_DELAY);
      }
    } catch (error) {
      console.error('DOM 메시지 추가 중 오류:', error);
      this.logToConsole(message);
    }

    const logContent = safeContent.length > 50 ? safeContent.substring(0, 50) + '...' : safeContent;
    console.log(`💬 메시지 추가: [${messageType}] ${logContent}`);
    return message;
  }

  // 개별 메시지 타입 메서드들
  addSystemMessage(content, options = {}) {
    return this.addMessage(content, { ...options, type: MESSAGE_TYPES.SYSTEM });
  }

  addErrorMessage(content, options = {}) {
    return this.addMessage(content, { ...options, type: MESSAGE_TYPES.ERROR });
  }

  addSuccessMessage(content, options = {}) {
    return this.addMessage(content, { ...options, type: MESSAGE_TYPES.SUCCESS });
  }

  addWarningMessage(content, options = {}) {
    return this.addMessage(content, { ...options, type: MESSAGE_TYPES.WARNING });
  }

  addInfoMessage(content, options = {}) {
    return this.addMessage(content, { ...options, type: MESSAGE_TYPES.INFO });
  }

  addAnalysisMessage(content, isAlarmRelated = false, options = {}) {
    return this.addMessage(content, {
      ...options,
      type: MESSAGE_TYPES.ANALYSIS,
      isAlarmMessage: isAlarmRelated,
    });
  }

  addAnalyzingMessage(content, options = {}) {
    return this.addMessage(content, { ...options, type: MESSAGE_TYPES.ANALYZING });
  }

  clearMessages() {
    try {
      this.messages = this.messages.filter((msg) => msg.persistent);
      if (this.container && !this.fallbackMode) {
        this.setupInitialMessage();
      }
      console.log('💬 메시지 창이 초기화되었습니다.');
    } catch (error) {
      console.error('메시지 창 초기화 중 오류:', error);
    }
  }

  // ================================
  // 🎯 핵심: 정적 메서드로 네임스페이스 API 제공
  // ================================

  static getInstance() {
    // 이미 생성된 싱글톤 인스턴스 반환
    return messageManager;
  }

  // 정적 메서드들 - 네임스페이스 호출용
  static addMessage(content, options = {}) {
    return messageManager.addMessage(content, options);
  }

  static addSystemMessage(content, options = {}) {
    return messageManager.addSystemMessage(content, options);
  }

  static addErrorMessage(content, options = {}) {
    return messageManager.addErrorMessage(content, options);
  }

  static addSuccessMessage(content, options = {}) {
    return messageManager.addSuccessMessage(content, options);
  }

  static addWarningMessage(content, options = {}) {
    return messageManager.addWarningMessage(content, options);
  }

  static addInfoMessage(content, options = {}) {
    return messageManager.addInfoMessage(content, options);
  }

  static addAnalysisMessage(content, isAlarmRelated = false, options = {}) {
    return messageManager.addAnalysisMessage(content, isAlarmRelated, options);
  }

  static addAnalyzingMessage(content, options = {}) {
    return messageManager.addAnalyzingMessage(content, options);
  }

  static clearMessages() {
    return messageManager.clearMessages();
  }

  // 타이핑 효과 관련 정적 메서드들
  static addMessageWithTypingEffect(content, options = {}) {
    return messageManager.addMessageWithTypingEffect(content, options);
  }

  static addSystemMessageWithTyping(content, options = {}) {
    return messageManager.addMessageWithTypingEffect(content, {
      ...options,
      type: MESSAGE_TYPES.SYSTEM,
    });
  }

  static addErrorMessageWithTyping(content, options = {}) {
    return messageManager.addMessageWithTypingEffect(content, {
      ...options,
      type: MESSAGE_TYPES.ERROR,
    });
  }

  static addSuccessMessageWithTyping(content, options = {}) {
    return messageManager.addMessageWithTypingEffect(content, {
      ...options,
      type: MESSAGE_TYPES.SUCCESS,
    });
  }

  static addWarningMessageWithTyping(content, options = {}) {
    return messageManager.addMessageWithTypingEffect(content, {
      ...options,
      type: MESSAGE_TYPES.WARNING,
    });
  }

  static addAnalyzingMessageWithTyping(content, options = {}) {
    return messageManager.addMessageWithTypingEffect(content, {
      ...options,
      type: MESSAGE_TYPES.ANALYZING,
    });
  }

  static addProgressMessageWithTyping(content, options = {}) {
    return messageManager.addMessageWithTypingEffect(content, {
      ...options,
      type: MESSAGE_TYPES.INFO,
    });
  }

  static stopTyping() {
    return messageManager.stopTyping();
  }

  // 타이핑 속도 설정 메서드
  setTypingSpeed(speed) {
    // 0ms(즉시 표시)부터 허용하도록 변경
    this.typingSpeed = Math.max(0, Math.min(500, speed));
  }

  // 기타 유틸리티 메서드들...
  logToConsole(message) {
    const timeStr = this.formatTime(message.timestamp);
    const prefix = this.getConsolePrefix(message.type);
    const cleanContent = message.content.replace(/<[^>]*>/g, '');
    console.log(`${prefix}[${timeStr}] ${cleanContent}`);
  }

  getConsolePrefix(type) {
    const prefixes = {
      [MESSAGE_TYPES.SYSTEM]: '🔧',
      [MESSAGE_TYPES.ERROR]: '❌',
      [MESSAGE_TYPES.SUCCESS]: '✅',
      [MESSAGE_TYPES.WARNING]: '⚠️',
      [MESSAGE_TYPES.INFO]: 'ℹ️',
      [MESSAGE_TYPES.ANALYSIS]: '🔍',
      [MESSAGE_TYPES.SUMMARY]: '📊',
      [MESSAGE_TYPES.ALARM_STATUS]: '🚨',
      [MESSAGE_TYPES.ANALYZING]: '⏳',
      [MESSAGE_TYPES.USER]: '👤',
      [MESSAGE_TYPES.ALARM]: '📌',
    };
    return prefixes[type] || '💬';
  }

  createMessageElement(message) {
    try {
      const messageDiv = document.createElement('div');
      messageDiv.className = `chat-message ${message.type}`;
      messageDiv.setAttribute('data-message-id', message.id);

      const timeString = this.formatTime(message.timestamp);
      const sanitizedContent = this.sanitizeContent(message.content);

      messageDiv.innerHTML = `
        <div class="message-content">${sanitizedContent}</div>
        <div class="message-time">${timeString}</div>
      `;

      return messageDiv;
    } catch (error) {
      console.error('메시지 요소 생성 중 오류:', error);
      const fallbackDiv = document.createElement('div');
      fallbackDiv.textContent = `[${message.type}] ${message.content}`;
      fallbackDiv.className = 'chat-message error';
      return fallbackDiv;
    }
  }

  removeMessage(messageId) {
    try {
      this.messages = this.messages.filter((msg) => msg.id !== messageId);
      if (this.container) {
        const messageElement = this.container.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
          messageElement.remove();
        }
      }
    } catch (error) {
      console.error('메시지 제거 중 오류:', error);
    }
  }

  trimMessages() {
    try {
      if (this.messages.length > this.maxMessages) {
        const removeCount = this.messages.length - this.maxMessages;
        const removedMessages = this.messages.splice(0, removeCount);

        if (this.container) {
          removedMessages.forEach((msg) => {
            const element = this.container.querySelector(`[data-message-id="${msg.id}"]`);
            if (element) element.remove();
          });
        }
      }
    } catch (error) {
      console.error('메시지 트림 중 오류:', error);
    }
  }

  scrollToBottom() {
    try {
      if (this.container) {
        this.container.scrollTop = this.container.scrollHeight;
      }
    } catch (error) {
      console.error('스크롤 이동 중 오류:', error);
    }
  }

  formatTime(timestamp) {
    try {
      if (!(timestamp instanceof Date)) {
        timestamp = new Date(timestamp);
      }
      return timestamp.toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (error) {
      console.error('시간 포맷팅 오류:', error);
      return '--:--';
    }
  }

  getCurrentTime() {
    return this.formatTime(new Date());
  }

  sanitizeContent(content) {
    if (typeof content !== 'string') {
      return String(content);
    }

    let sanitized = content
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '')
      .replace(/javascript:/gi, '');

    return sanitized;
  }

  handleUserMessage(content) {
    if (!content || content.trim() === '') return;

    this.addMessage(content, {
      type: MESSAGE_TYPES.USER,
    });

    setTimeout(() => {
      this.addSystemMessage('메시지를 받았습니다. 추후 AI 응답 기능이 추가될 예정입니다.');
    }, 500);
  }

  /**
   * 타이핑 효과와 함께 메시지 추가
   * @param {string} content - 메시지 내용
   * @param {Object} options - 옵션 설정
   * @returns {Promise<Object>} - 메시지 객체
   */
  async addMessageWithTypingEffect(content, options = {}) {
    const {
      type = MESSAGE_TYPES.SYSTEM,
      isAlarmMessage = false,
      timestamp = new Date(),
      persistent = false,
      metadata = {},
      speed = this.typingSpeed,
    } = options;

    if (!content || typeof content !== 'string') {
      console.warn('유효하지 않은 메시지 내용:', content);
      return null;
    }

    const safeContent = String(content || '').trim();
    if (!safeContent) {
      console.warn('빈 메시지 내용은 추가할 수 없습니다.');
      return null;
    }

    const messageType = isAlarmMessage ? MESSAGE_TYPES.ALARM_STATUS : type;
    const message = {
      id: ++this.messageId,
      content: safeContent,
      type: messageType,
      timestamp: timestamp,
      persistent: persistent,
      metadata: metadata,
    };

    this.messages.push(message);
    this.trimMessages();

    if (this.fallbackMode || !this.container) {
      this.logToConsole(message);
      return message;
    }

    // 타이핑 효과 처리
    return new Promise((resolve) => {
      const typingTask = {
        message,
        speed,
        resolve,
      };

      if (this.isTyping) {
        // 현재 타이핑 중이면 큐에 추가
        this.typingQueue.push(typingTask);
      } else {
        // 즉시 타이핑 시작
        this.startTyping(typingTask);
      }
    });
  }

  /**
   * 타이핑 효과 시작
   * @param {Object} typingTask - 타이핑 작업 객체
   */
  async startTyping(typingTask) {
    const { message, speed, resolve } = typingTask;
    this.isTyping = true;

    try {
      // 빈 메시지 엘리먼트 생성
      const messageElement = this.createEmptyMessageElement(message);
      this.container.appendChild(messageElement);
      this.currentTypingElement = messageElement;
      this.scrollToBottom();

      // 메시지 내용에서 HTML 태그와 텍스트 분리
      const content = message.content;
      await this.typeContent(messageElement, content, speed);

      // 타이핑 완료
      this.finishTyping();
      resolve(message);
    } catch (error) {
      console.error('타이핑 효과 중 오류:', error);
      this.finishTyping();
      resolve(message);
    }
  }

  /**
   * 빈 메시지 엘리먼트 생성
   * @param {Object} message - 메시지 객체
   * @returns {HTMLElement} - 메시지 엘리먼트
   */
  createEmptyMessageElement(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${message.type}`;
    messageDiv.setAttribute('data-message-id', message.id);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = ''; // 빈 상태로 시작

    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = this.formatTime(message.timestamp);

    messageDiv.appendChild(contentDiv);
    messageDiv.appendChild(timeDiv);

    return messageDiv;
  }

  // 3. typeContent 메서드 수정 (기존 라인 724-774 교체)
  // 핵심: 청크 단위 처리로 브라우저 setTimeout 제한 우회
  async typeContent(element, content, speed) {
    const contentDiv = element.querySelector('.message-content');

    // 즉시 표시 모드
    if (speed === 0) {
      contentDiv.innerHTML = this.sanitizeContent(content);
      return;
    }

    // HTML을 파싱하여 텍스트와 태그 분리
    const parts = this.parseHTMLContent(content);
    let currentHTML = '';

    // 타이핑 커서 CSS 추가
    this.addTypingCursorStyle();

    for (const part of parts) {
      if (part.isTag) {
        // HTML 태그는 즉시 추가
        currentHTML += part.content;
        contentDiv.innerHTML = currentHTML + '<span class="typing-cursor">|</span>';
      } else {
        // 극도로 빠른 타이핑을 위한 청크 단위 처리
        if (speed <= 1) {
          // 1ms 이하일 때: 훨씬 더 많은 글자를 한 번에 처리
          const chars = part.content.split('');
          let chunkSize;

          if (speed === 0) {
            // 즉시 표시
            currentHTML += part.content;
            contentDiv.innerHTML = currentHTML + '<span class="typing-cursor">|</span>';
            this.scrollToBottom();
          } else {
            // 매우 빠른 속도: 청크 크기를 대폭 증가
            chunkSize = speed <= 0.1 ? 10 : speed <= 0.5 ? 8 : 5;

            for (let i = 0; i < chars.length; i += chunkSize) {
              if (!this.isTyping) break;

              const chunk = chars.slice(i, i + chunkSize).join('');
              currentHTML += chunk;
              contentDiv.innerHTML = currentHTML + '<span class="typing-cursor">|</span>';
              this.scrollToBottom();

              // 매우 빠른 지연 처리
              await this.fastDelay();
            }
          }
        } else {
          // 일반 타이핑 (1ms 초과)
          for (const char of part.content) {
            if (!this.isTyping) break;

            currentHTML += char;
            contentDiv.innerHTML = currentHTML + '<span class="typing-cursor">|</span>';
            this.scrollToBottom();

            await this.delay(speed);
          }
        }
      }
    }

    // 타이핑 완료 후 커서 제거
    contentDiv.innerHTML = currentHTML;
  }

  // 빠른 타이핑을 위한 새로운 메서드
  async fastTypeText(text, currentHTML, contentDiv, speed) {
    if (speed === 0) {
      // 즉시 표시
      return;
    }

    const chars = text.split('');
    // 청크 크기를 증가하여 더 빠르게 처리
    let chunkSize;
    if (speed <= 0.1) {
      chunkSize = 15; // 매우 빠른 속도일 때 큰 청크
    } else if (speed <= 0.5) {
      chunkSize = 10; // 빠른 속도일 때 중간 청크
    } else if (speed < 1) {
      chunkSize = 5; // 보통 속도일 때 작은 청크
    } else {
      chunkSize = 2; // 느린 속도일 때 기존 방식
    }

    // requestAnimationFrame을 사용하여 브라우저 제한 우회
    for (let i = 0; i < chars.length; i += chunkSize) {
      if (!this.isTyping) break;

      const chunk = chars.slice(i, i + chunkSize).join('');
      currentHTML += chunk;
      contentDiv.innerHTML = currentHTML + '<span class="typing-cursor">|</span>';
      this.scrollToBottom();

      // 지연 처리 최적화
      if (speed < 1) {
        await this.fastDelay();
      } else {
        await this.delay(speed);
      }
    }
  }

  // requestAnimationFrame을 사용한 빠른 지연
  fastDelay() {
    return new Promise((resolve) => {
      requestAnimationFrame(resolve);
    });
  }

  // 타이핑 커서 스타일 추가
  addTypingCursorStyle() {
    // 이미 스타일이 추가되어 있는지 확인
    if (document.querySelector('#typing-cursor-style')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'typing-cursor-style';
    style.textContent = `
      .typing-cursor {
        animation: blink 1s infinite;
        font-weight: bold;
        color: #ff8c42; /* 주황색 계열 커서 */
      }
      
      @keyframes blink {
        0%, 50% { opacity: 1; }
        51%, 100% { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * HTML 내용을 텍스트와 태그로 분리
   * @param {string} content - HTML 내용
   * @returns {Array} - 파싱된 부분들의 배열
   */
  parseHTMLContent(content) {
    const parts = [];
    const tagRegex = /<[^>]+>/g;
    let lastIndex = 0;
    let match;

    while ((match = tagRegex.exec(content)) !== null) {
      // 태그 이전의 텍스트
      if (match.index > lastIndex) {
        const text = content.slice(lastIndex, match.index);
        if (text) {
          parts.push({ content: text, isTag: false });
        }
      }

      // HTML 태그
      parts.push({ content: match[0], isTag: true });
      lastIndex = match.index + match[0].length;
    }

    // 마지막 텍스트
    if (lastIndex < content.length) {
      const text = content.slice(lastIndex);
      if (text) {
        parts.push({ content: text, isTag: false });
      }
    }

    return parts;
  }

  // 딜레이 함수 (대기시간)
  delay(ms) {
    if (ms <= 0) {
      return Promise.resolve();
    }

    // 1ms 미만은 requestAnimationFrame 사용
    if (ms < 1) {
      return this.fastDelay();
    }

    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // 7. 편의 메서드: 즉시 표시
  static addMessageInstant(content, options = {}) {
    return messageManager.addMessageWithTypingEffect(content, {
      ...options,
      speed: TYPING_SPEEDS.INSTANT,
    });
  }

  // 8. 편의 메서드: 극도로 빠른 타이핑
  static addMessageUltraFast(content, options = {}) {
    return messageManager.addMessageWithTypingEffect(content, {
      ...options,
      speed: TYPING_SPEEDS.ULTRA_FAST,
    });
  }

  // 타이핑 완료 처리
  finishTyping() {
    this.isTyping = false;
    this.currentTypingElement = null;

    // 큐에 대기 중인 메시지가 있으면 다음 타이핑 시작
    if (this.typingQueue.length > 0) {
      const nextTask = this.typingQueue.shift();
      setTimeout(() => {
        this.startTyping(nextTask);
      }, 100); // 짧은 딜레이 후 다음 메시지 시작
    }
  }

  // 타이핑 효과 중단
  stopTyping() {
    this.isTyping = false;
    this.typingQueue = [];
    this.currentTypingElement = null;
  }

  // 타이핑 속도 설정
  setTypingSpeed(speed) {
    this.typingSpeed = Math.max(0.1, Math.min(500, speed)); // 0.1-500ms 범위로 제한 (매우 빠른 속도 허용)
  }

  // ================================
  // 📋 경보 목록 HTML 생성 기능
  // ================================

  /**
   * 경보 목록 HTML 생성
   * @param {Array} alarms - 경보 배열
   * @param {Object} options - 옵션 설정
   * @returns {string} - 생성된 HTML 문자열
   */
  generateAlarmListHTML(alarms = [], options = {}) {
    const {
      style = 'dashboard', // 'dashboard', 'tooltip', 'analysis'
      maxHeight = '200px',
      maxDisplay = null,
      showValidBadge = true,
      showTimestamp = true,
      containerClass = 'alarm-details',
      emptyMessage = '경보 내역이 없습니다.',
      title = null,
    } = options;

    if (!alarms || alarms.length === 0) {
      // 대시보드 스타일에서는 빈 경보 목록에 대해 빈 문자열 반환 (불필요한 빈 박스 방지)
      if (style === 'dashboard') {
        return '';
      }
      return this.generateEmptyAlarmHTML(emptyMessage, style, title);
    }

    // 경보 정렬 (최신순)
    const sortedAlarms = [...alarms].sort(
      (a, b) => new Date(b.occur_datetime || 0) - new Date(a.occur_datetime || 0)
    );

    // 표시할 경보 제한
    const displayAlarms = maxDisplay ? sortedAlarms.slice(0, maxDisplay) : sortedAlarms;

    const alarmItems = displayAlarms
      .map((alarm) => this.createAlarmItemHTML(alarm, { style, showValidBadge, showTimestamp }))
      .join('');

    return this.generateAlarmContainerHTML(alarmItems, {
      style,
      maxHeight,
      containerClass,
      totalCount: alarms.length,
      displayCount: displayAlarms.length,
      title,
    });
  }

  /**
   * 빈 경보 목록 HTML 생성
   * @param {string} emptyMessage - 빈 목록 메시지
   * @param {string} style - 스타일 타입
   * @param {string} title - 제목
   * @returns {string} - HTML 문자열
   */
  generateEmptyAlarmHTML(emptyMessage, style, title) {
    if (style === 'tooltip') {
      return `
        <div class="tooltip-alarm-section">
          ${title ? `<div class="tooltip-section-title">${title}</div>` : ''}
          <div class="tooltip-no-alarms">${emptyMessage}</div>
        </div>
      `;
    }

    return `
      <div class="alarm-details empty" style="padding: 10px; text-align: center; color: #666;">
        ${emptyMessage}
      </div>
    `;
  }

  /**
   * 경보 컨테이너 HTML 생성
   * @param {string} alarmItems - 경보 아이템들 HTML
   * @param {Object} options - 옵션
   * @returns {string} - HTML 문자열
   */
  generateAlarmContainerHTML(alarmItems, options) {
    const { style, maxHeight, containerClass, totalCount, displayCount, title } = options;

    if (style === 'tooltip') {
      let html = `
        <div class="tooltip-alarm-section">
          ${title ? `<div class="tooltip-section-title">${title}</div>` : ''}
          <div class="tooltip-alarm-list">
            ${alarmItems}
          </div>
      `;

      if (totalCount > displayCount) {
        html += `
          <div class="tooltip-alarm-more">
            + ${totalCount - displayCount}개 더 있음...
          </div>
        `;
      }

      html += '</div>';
      return html;
    }

    // 대시보드 및 분석 스타일
    return `
      <div class="${containerClass}" style="max-height: ${maxHeight}; overflow-y: auto; margin-top: 10px; padding: 8px; background: #f9f9f9; border-radius: 4px; border: 1px solid #ddd;">
        ${
          title
            ? `<div style="font-weight: bold; margin-bottom: 5px; color: #333;">${title}</div>`
            : ''
        }
        <div style="margin-top: 5px;">
          ${alarmItems}
        </div>
      </div>
    `;
  }

  /**
   * 개별 경보 아이템 HTML 생성
   * @param {Object} alarm - 경보 객체
   * @param {Object} options - 옵션
   * @returns {string} - HTML 문자열
   */
  createAlarmItemHTML(alarm, options = {}) {
    const { style = 'dashboard', showValidBadge = true, showTimestamp = true } = options;

    // 유효성 판단 (선로 경보는 항상 유효로 처리)
    const isValidAlarm = alarm.sector === '선로' || alarm.valid_yn === 'Y';

    // 장애점 찾기에서 발견된 경보인지 확인
    const isFailurePointAlarm = alarm.is_failure_point === true;

    // 메시지 처리 (선로 경보의 경우 display_message 우선 사용)
    let displayMessage;
    if (alarm.sector === '선로' && alarm.display_message) {
      displayMessage = alarm.display_message;
    } else {
      displayMessage = alarm.alarm_message || '경보 내용 없음';
    }

    // HTML 이스케이프 처리
    displayMessage = this.sanitizeContent(displayMessage);

    if (style === 'tooltip') {
      return this.createTooltipAlarmItemHTML(alarm, {
        isValidAlarm,
        isFailurePointAlarm,
        displayMessage,
        showTimestamp,
      });
    }

    return this.createDashboardAlarmItemHTML(alarm, {
      isValidAlarm,
      isFailurePointAlarm,
      displayMessage,
      showValidBadge,
      showTimestamp,
    });
  }

  /**
   * 툴팁용 경보 아이템 HTML 생성
   * @param {Object} alarm - 경보 객체
   * @param {Object} options - 처리된 옵션들
   * @returns {string} - HTML 문자열
   */
  createTooltipAlarmItemHTML(alarm, options) {
    const { isValidAlarm, isFailurePointAlarm, displayMessage, showTimestamp } = options;

    const validClass = isValidAlarm ? 'valid-alarm' : 'invalid-alarm';
    const failurePointClass = isFailurePointAlarm ? 'failure-point-alarm' : '';

    // 시간 포맷팅
    let timeStr = '-';
    if (showTimestamp && alarm.occur_datetime) {
      timeStr = this.formatAlarmDateTime(alarm.occur_datetime);
    }

    // 메시지 길이 제한 (툴팁용)
    const truncatedMessage =
      displayMessage.length > 40 ? displayMessage.slice(0, 37) + '...' : displayMessage;

    // 장애점 경보 표시 아이콘
    const failureIcon = isFailurePointAlarm ? '🔥 ' : '';

    return `
      <div class="tooltip-alarm-item ${validClass} ${failurePointClass}">
        ${showTimestamp ? `<div class="tooltip-alarm-time">${timeStr}</div>` : ''}
        <div class="tooltip-alarm-message">${failureIcon}${truncatedMessage}</div>
        ${isFailurePointAlarm ? '<div class="tooltip-failure-badge">장애점</div>' : ''}
      </div>
    `;
  }

  /**
   * 대시보드용 경보 아이템 HTML 생성
   * @param {Object} alarm - 경보 객체
   * @param {Object} options - 처리된 옵션들
   * @returns {string} - HTML 문자열
   */
  createDashboardAlarmItemHTML(alarm, options) {
    const { isValidAlarm, isFailurePointAlarm, displayMessage, showValidBadge, showTimestamp } =
      options;

    // 유효성 배지
    let validBadge = '';
    if (showValidBadge) {
      if (isValidAlarm) {
        const badgeColor = isFailurePointAlarm ? '#ff8c00' : '#e74c3c'; // 장애점 경보는 주황색
        validBadge = `<span style="background: ${badgeColor}; color: white; padding: 1px 4px; border-radius: 2px; font-size: 10px;">유효</span>`;
      } else {
        validBadge =
          '<span style="background: #95a5a6; color: white; padding: 1px 4px; border-radius: 2px; font-size: 10px;">무효</span>';
      }
    }

    // 테두리 색상
    const borderColor = isValidAlarm ? (isFailurePointAlarm ? '#ff8c00' : '#e74c3c') : '#95a5a6';

    // 시간 포맷팅
    let timeStr = '시간 미상';
    if (showTimestamp && alarm.occur_datetime) {
      timeStr = this.formatAlarmDateTime(alarm.occur_datetime);
    }

    // 장애점 표시 아이콘
    const failureIcon = isFailurePointAlarm ? '🔥 ' : '';

    return `
      <div style="margin-bottom: 8px; padding: 6px; background: white; border-radius: 3px; border-left: 3px solid ${borderColor};">
        ${
          showTimestamp
            ? `<div style="font-size: 11px; color: #666; margin-bottom: 2px;">
          ${timeStr} ${validBadge}
        </div>`
            : ''
        }
        <div style="font-size: 12px; color: #333;">
          ${failureIcon}${displayMessage}
        </div>
      </div>
    `;
  }

  /**
   * 경보 시간 포맷팅
   * @param {string|Date} datetime - 날짜/시간
   * @returns {string} - 포맷된 문자열
   */
  formatAlarmDateTime(datetime) {
    try {
      if (!datetime) return '-';

      // formatDateTimeForToolTip 함수가 있으면 사용, 없으면 기본 포맷팅
      if (typeof formatDateTimeForToolTip === 'function') {
        return formatDateTimeForToolTip(datetime) || '-';
      }

      // 기본 포맷팅
      const date = new Date(datetime);
      if (isNaN(date.getTime())) return '-';

      return date.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (error) {
      console.error('경보 시간 포맷팅 오류:', error);
      return '-';
    }
  }

  // ================================
  // 📋 정적 메서드로 경보 목록 HTML 생성 API 제공
  // ================================

  /**
   * 경보 목록 HTML 생성 (정적 메서드)
   * @param {Array} alarms - 경보 배열
   * @param {Object} options - 옵션 설정
   * @returns {string} - 생성된 HTML 문자열
   */
  static generateAlarmListHTML(alarms = [], options = {}) {
    return messageManager.generateAlarmListHTML(alarms, options);
  }

  /**
   * 대시보드용 경보 목록 HTML 생성
   * @param {Array} alarms - 경보 배열
   * @param {Object} options - 옵션 설정
   * @returns {string} - 생성된 HTML 문자열
   */
  static generateDashboardAlarmListHTML(alarms = [], options = {}) {
    return messageManager.generateAlarmListHTML(alarms, {
      style: 'dashboard',
      ...options,
    });
  }

  /**
   * 툴팁용 경보 목록 HTML 생성
   * @param {Array} alarms - 경보 배열
   * @param {Object} options - 옵션 설정
   * @returns {string} - 생성된 HTML 문자열
   */
  static generateTooltipAlarmListHTML(alarms = [], options = {}) {
    return messageManager.generateAlarmListHTML(alarms, {
      style: 'tooltip',
      maxDisplay: 5,
      title: '📋 최근 경보 내역',
      ...options,
    });
  }

  /**
   * 장애점 분석용 경보 목록 HTML 생성
   * @param {Array} alarms - 경보 배열
   * @param {Object} options - 옵션 설정
   * @returns {string} - 생성된 HTML 문자열
   */
  static generateAnalysisAlarmListHTML(alarms = [], options = {}) {
    return messageManager.generateAlarmListHTML(alarms, {
      style: 'analysis',
      showValidBadge: true,
      ...options,
    });
  }

  /**
   * 기존 메시지를 업데이트 (스트리밍 진행상황용)
   * @param {number} messageId - 업데이트할 메시지 ID
   * @param {string} newContent - 새로운 내용
   * @param {Object} options - 옵션
   * @returns {boolean} - 업데이트 성공 여부
   */
  updateMessage(messageId, newContent, options = {}) {
    try {
      // 메시지 객체 찾기
      const messageIndex = this.messages.findIndex((msg) => msg.id === messageId);
      if (messageIndex === -1) {
        console.warn(`메시지 ID ${messageId}를 찾을 수 없습니다.`);
        return false;
      }

      // 메시지 내용 업데이트
      this.messages[messageIndex].content = newContent;
      this.messages[messageIndex].timestamp = new Date();

      // DOM 요소 업데이트
      if (this.container) {
        const messageElement = this.container.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
          const contentElement = messageElement.querySelector('.message-content');
          if (contentElement) {
            const sanitizedContent = this.sanitizeContent(newContent);
            contentElement.innerHTML = sanitizedContent;

            // 타임스탬프 업데이트
            const timeElement = messageElement.querySelector('.message-time');
            if (timeElement) {
              timeElement.textContent = this.formatTime(new Date());
            }

            // 스크롤을 맨 아래로 이동
            this.scrollToBottom();
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      console.error('메시지 업데이트 중 오류:', error);
      return false;
    }
  }

  /**
   * 기존 메시지를 업데이트 (타이핑 효과 포함)
   * @param {number} messageId - 업데이트할 메시지 ID
   * @param {string} newContent - 새로운 내용
   * @param {Object} options - 옵션
   * @returns {Promise<boolean>} - 업데이트 성공 여부
   */
  async updateMessageWithTyping(messageId, newContent, options = {}) {
    try {
      const {
        speed = this.typingSpeed,
        append = false, // 기존 내용에 추가할지 여부
      } = options;

      // 메시지 객체 찾기
      const messageIndex = this.messages.findIndex((msg) => msg.id === messageId);
      if (messageIndex === -1) {
        console.warn(`메시지 ID ${messageId}를 찾을 수 없습니다.`);
        return false;
      }

      // DOM 요소 찾기
      if (!this.container) {
        return false;
      }

      const messageElement = this.container.querySelector(`[data-message-id="${messageId}"]`);
      if (!messageElement) {
        return false;
      }

      const contentElement = messageElement.querySelector('.message-content');
      if (!contentElement) {
        return false;
      }

      // 내용 결정 (추가 모드일 경우 기존 내용에 추가)
      const finalContent = append ? this.messages[messageIndex].content + newContent : newContent;

      // 메시지 객체 업데이트
      this.messages[messageIndex].content = finalContent;
      this.messages[messageIndex].timestamp = new Date();

      // 타이핑 효과로 내용 업데이트
      await this.typeContentUpdate(contentElement, finalContent, speed);

      // 타임스탬프 업데이트
      const timeElement = messageElement.querySelector('.message-time');
      if (timeElement) {
        timeElement.textContent = this.formatTime(new Date());
      }

      return true;
    } catch (error) {
      console.error('타이핑 효과 메시지 업데이트 중 오류:', error);
      return false;
    }
  }

  /**
   * 타이핑 효과로 콘텐츠 업데이트
   * @param {HTMLElement} element - 업데이트할 요소
   * @param {string} content - 새로운 내용
   * @param {number} speed - 타이핑 속도
   */
  async typeContentUpdate(element, content, speed) {
    try {
      // 기존 내용 지우기
      element.innerHTML = '';

      // 타이핑 효과로 새 내용 표시
      const segments = this.parseHTMLContent(content);

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];

        if (segment.isHTML) {
          element.insertAdjacentHTML('beforeend', segment.content);
        } else {
          const characters = segment.content.split('');
          for (let j = 0; j < characters.length; j++) {
            element.insertAdjacentText('beforeend', characters[j]);
            this.scrollToBottom();
            await this.delay(speed);
          }
        }
      }
    } catch (error) {
      console.error('타이핑 효과 업데이트 중 오류:', error);
      // 오류 발생 시 즉시 전체 내용 표시
      element.innerHTML = this.sanitizeContent(content);
    }
  }

  // 정적 메서드 추가
  static updateMessage(messageId, newContent, options = {}) {
    return messageManager.updateMessage(messageId, newContent, options);
  }

  static updateMessageWithTyping(messageId, newContent, options = {}) {
    return messageManager.updateMessageWithTyping(messageId, newContent, options);
  }
}

// ================================
// Export 설정
// ================================

// 싱글톤 인스턴스 생성
console.log('🔧 MessageManager 싱글톤 인스턴스 생성 중...');
const messageManager = new MessageManager();
console.log('✅ MessageManager 싱글톤 인스턴스 생성 완료:', messageManager);

// Named exports

export { messageManager, MESSAGE_TYPES, TYPING_SPEEDS };

// Default export (클래스 자체)
export default MessageManager;
