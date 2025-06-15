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

// 타이핑 효과 속도 상수 정의
const TYPING_SPEEDS = {
  VERY_FAST: 10, // 매우 빠름 (per character)
  FAST: 20, // 빠름
  NORMAL: 30, // 보통
  SLOW: 50, // 느림
  VERY_SLOW: 70, // 매우 느림

  // 메시지 타입별 기본 속도
  PROGRESS: 10, // 진행 상황 메시지
  SUMMARY: 7, // 요약 결과 메시지
  ERROR: 15, // 오류 메시지
  SUCCESS: 10, // 성공 메시지
  ANALYZING: 10, // 분석 중 메시지
  DEFAULT: 10, // 기본 속도
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

  static setTypingSpeed(speed) {
    return messageManager.setTypingSpeed(speed);
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

  /**
   * 메시지 내용을 타이핑 효과로 출력
   * @param {HTMLElement} element - 메시지 엘리먼트
   * @param {string} content - 출력할 내용
   * @param {number} speed - 타이핑 속도 (ms)
   */
  async typeContent(element, content, speed) {
    const contentDiv = element.querySelector('.message-content');

    // HTML을 파싱하여 텍스트와 태그 분리
    const parts = this.parseHTMLContent(content);
    let currentHTML = '';

    // 타이핑 커서 CSS 추가 (한 번만)
    this.addTypingCursorStyle();

    for (const part of parts) {
      if (part.isTag) {
        // HTML 태그는 즉시 추가
        currentHTML += part.content;
        contentDiv.innerHTML = currentHTML + '<span class="typing-cursor">|</span>';
      } else {
        // 텍스트는 글자 단위로 타이핑
        for (const char of part.content) {
          if (!this.isTyping) break; // 타이핑이 중단된 경우

          currentHTML += char;
          contentDiv.innerHTML = currentHTML + '<span class="typing-cursor">|</span>';
          this.scrollToBottom();

          // 글자 간 딜레이
          await this.delay(speed);
        }
      }
    }

    // 타이핑 완료 후 커서 제거
    contentDiv.innerHTML = currentHTML;
  }

  /**
   * 타이핑 커서 스타일 추가
   */
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

  /**
   * 딜레이 함수
   * @param {number} ms - 대기 시간 (밀리초)
   * @returns {Promise}
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 타이핑 완료 처리
   */
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

  /**
   * 타이핑 효과 중단
   */
  stopTyping() {
    this.isTyping = false;
    this.typingQueue = [];
    this.currentTypingElement = null;
  }

  /**
   * 타이핑 속도 설정
   * @param {number} speed - 글자당 대기 시간 (ms)
   */
  setTypingSpeed(speed) {
    this.typingSpeed = Math.max(10, Math.min(500, speed)); // 10-500ms 범위로 제한
  }
}

// ================================
// Export 설정
// ================================

// 싱글톤 인스턴스 생성
console.log('🔧 MessageManager 싱글톤 인스턴스 생성 중...');
const messageManager = new MessageManager();
console.log('✅ MessageManager 싱글톤 인스턴스 생성 완료:', messageManager);

// 하위 호환성을 위한 전역 함수 등록
export function registerMessageGlobalFunctions() {
  if (typeof window !== 'undefined') {
    try {
      console.log('🔧 MessageManager 전역 함수 등록 시작...');

      // 기존 래퍼 함수들
      window.addChatMessage = (content, type = 'system', isAlarmMessage = false) => {
        return messageManager.addMessage(content, { type, isAlarmMessage });
      };

      window.addSystemMessage = (content) => messageManager.addSystemMessage(content);
      window.addAnalysisMessage = (content, isAlarmRelated = false) =>
        messageManager.addAnalysisMessage(content, isAlarmRelated);
      window.addErrorMessage = (content) => messageManager.addErrorMessage(content);
      window.addSuccessMessage = (content) => messageManager.addSuccessMessage(content);
      window.addAnalyzingMessage = (content) => messageManager.addAnalyzingMessage(content);
      window.addWarningMessage = (content) => messageManager.addWarningMessage(content);
      window.addInfoMessage = (content) => messageManager.addInfoMessage(content);

      console.log('✅ 기본 메시지 함수들 등록 완료');

      // 타이핑 효과 관련 전역 함수들
      window.addMessageWithTyping = (content, options = {}) =>
        messageManager.addMessageWithTypingEffect(content, options);
      window.addSystemMessageWithTyping = (content, options = {}) =>
        messageManager.addMessageWithTypingEffect(content, {
          ...options,
          type: MESSAGE_TYPES.SYSTEM,
        });
      window.addErrorMessageWithTyping = (content, options = {}) =>
        messageManager.addMessageWithTypingEffect(content, {
          ...options,
          type: MESSAGE_TYPES.ERROR,
        });
      window.addSuccessMessageWithTyping = (content, options = {}) =>
        messageManager.addMessageWithTypingEffect(content, {
          ...options,
          type: MESSAGE_TYPES.SUCCESS,
        });
      window.addWarningMessageWithTyping = (content, options = {}) =>
        messageManager.addMessageWithTypingEffect(content, {
          ...options,
          type: MESSAGE_TYPES.WARNING,
        });
      window.addAnalyzingMessageWithTyping = (content, options = {}) =>
        messageManager.addMessageWithTypingEffect(content, {
          ...options,
          type: MESSAGE_TYPES.ANALYZING,
        });
      window.addProgressMessageWithTyping = (content, options = {}) =>
        messageManager.addMessageWithTypingEffect(content, {
          ...options,
          type: MESSAGE_TYPES.INFO,
        });

      console.log('✅ 타이핑 효과 함수들 등록 완료');

      window.stopTyping = () => messageManager.stopTyping();
      window.setTypingSpeed = (speed) => messageManager.setTypingSpeed(speed);

      window.clearChatMessages = () => messageManager.clearMessages();

      // 인스턴스와 클래스 모두 등록
      window.messageManager = messageManager;
      window.MessageManager = MessageManager;

      console.log('✅ MessageManager 전역 함수 등록 완료 (타이핑 효과 포함)');

      // 등록된 함수들 확인
      console.log('🔍 등록된 타이핑 함수들:', {
        addSuccessMessageWithTyping: typeof window.addSuccessMessageWithTyping,
        addErrorMessageWithTyping: typeof window.addErrorMessageWithTyping,
        addAnalyzingMessageWithTyping: typeof window.addAnalyzingMessageWithTyping,
        addProgressMessageWithTyping: typeof window.addProgressMessageWithTyping,
      });
    } catch (error) {
      console.error('❌ MessageManager 전역 함수 등록 중 오류:', error);
    }
  }
}

// Named exports
export { messageManager, MESSAGE_TYPES, TYPING_SPEEDS };

// Default export (클래스 자체)
export default MessageManager;
