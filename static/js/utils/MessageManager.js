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

export class MessageManager {
  constructor(containerId = 'chat-messages-area') {
    this.containerId = containerId;
    this.container = null;
    this.messages = [];
    this.messageId = 0;
    this.maxMessages = MESSAGE_CONFIG.MAX_MESSAGES;
    this.fallbackMode = false;

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
    if (!MessageManager._instance) {
      MessageManager._instance = new MessageManager();
    }
    return MessageManager._instance;
  }

  // 정적 메서드들 - 네임스페이스 호출용
  static addMessage(content, options = {}) {
    return MessageManager.getInstance().addMessage(content, options);
  }

  static addSystemMessage(content, options = {}) {
    return MessageManager.getInstance().addSystemMessage(content, options);
  }

  static addErrorMessage(content, options = {}) {
    return MessageManager.getInstance().addErrorMessage(content, options);
  }

  static addSuccessMessage(content, options = {}) {
    return MessageManager.getInstance().addSuccessMessage(content, options);
  }

  static addWarningMessage(content, options = {}) {
    return MessageManager.getInstance().addWarningMessage(content, options);
  }

  static addInfoMessage(content, options = {}) {
    return MessageManager.getInstance().addInfoMessage(content, options);
  }

  static addAnalysisMessage(content, isAlarmRelated = false, options = {}) {
    return MessageManager.getInstance().addAnalysisMessage(content, isAlarmRelated, options);
  }

  static addAnalyzingMessage(content, options = {}) {
    return MessageManager.getInstance().addAnalyzingMessage(content, options);
  }

  static clearMessages() {
    return MessageManager.getInstance().clearMessages();
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
}

// ================================
// Export 설정
// ================================

// 싱글톤 인스턴스 생성
const messageManager = new MessageManager();

// 하위 호환성을 위한 전역 함수 등록
export function registerMessageGlobalFunctions() {
  if (typeof window !== 'undefined') {
    try {
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

      window.clearChatMessages = () => messageManager.clearMessages();

      // 인스턴스와 클래스 모두 등록
      window.messageManager = messageManager;
      window.MessageManager = MessageManager;

      console.log('✅ MessageManager 전역 함수 등록 완료');
    } catch (error) {
      console.error('MessageManager 전역 함수 등록 중 오류:', error);
    }
  }
}

// Named exports
export { messageManager, MESSAGE_TYPES };

// Default export (클래스 자체)
export default MessageManager;
