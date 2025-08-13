/**
 * 통합 툴팁 관리 모듈 (싱글톤)
 * 파일 위치: src/core/TooltipManager.js
 *
 * 툴팁 로직 통합
 * 다양한 툴팁 타입 지원 (장비, 링크, 국사, 경보 등)
 * 위치 계산 및 표시 로직
 * 애니메이션 및 스타일링
 */

import { formatDateTimeForToolTip, escapeHtml } from '../utils/CommonUtils.js';
import { colorManager as ColorManager } from '../utils/ColorManager.js'; // 싱글톤
import { stateManager as StateManager } from '../core/StateManager.js'; // StateManager 추가
import MessageManager from './MessageManager.js'; // MessageManager 추가
import { failurePointManager } from '../core/FailurePointManager.js';

// ================================
// 1. 툴팁 타입 및 상수 정의
// ================================

const TOOLTIP_TYPES = {
  EQUIPMENT: 'equipment',
  LINK: 'link',
  GUKSA: 'guksa',
  ALARM: 'alarm',
  MAP_NODE: 'map-node',
  CUSTOM: 'custom',
};

// 수정 후 (스타일 관련 상수는 유지하되 map_tooltip.css 에서 관리)
const TOOLTIP_CONFIG = {
  SHOW_DURATION: 100, // JavaScript 애니메이션용
  HIDE_DURATION: 200, // JavaScript 애니메이션용
  AUTO_HIDE_DELAY: 5000, // 자동 숨김 5초로 변경
  MAX_WIDTH: 380, // 위치 계산용
  MAX_HEIGHT: 500, // 툴팁 높이 제한 완화 (280 → 500)
  OFFSET_X: 15, // 위치 계산용
  OFFSET_Y: -10, // 위치 계산용
  Z_INDEX: 9999, // CSS와 동기화 필요시에만 사용

  MAX_ALARMS_DISPLAY: 30, // 경보 최대 표시 개수
  MAX_ALARM_TEXT_LEN: 50, // 경보 길이
};

const TOOLTIP_POSITIONS = {
  AUTO: 'auto',
  TOP: 'top',
  BOTTOM: 'bottom',
  LEFT: 'left',
  RIGHT: 'right',
  TOP_LEFT: 'top-left',
  TOP_RIGHT: 'top-right',
  BOTTOM_LEFT: 'bottom-left',
  BOTTOM_RIGHT: 'bottom-right',
};

// ================================
// 2. TooltipManager 클래스
// ================================

class TooltipManager {
  constructor() {
    this.tooltips = new Map();
    this.activeTooltip = null;
    this.autoHideTimer = null;
    this.isInitialized = false;
    this.showTimer = null; // 즉시 표시를 위한 타이머

    this.init();
    console.log('💬 TooltipManager 초기화 완료');
  }

  // 초기화
  init() {
    this.createTooltipContainer();
    this.setupGlobalEvents();
    this.isInitialized = true;
  }

  // ================================
  // 3. 툴팁 생성 및 관리
  // ================================

  // 툴팁 컨테이너 생성
  createTooltipContainer() {
    if (this.tooltipContainer) {
      return this.tooltipContainer;
    }

    this.tooltipContainer = document.createElement('div');
    this.tooltipContainer.className = 'tooltip-manager-container';

    // 애니메이션 요소와의 상호작용 문제 방지를 위한 스타일 설정
    this.tooltipContainer.style.cssText = `
      position: absolute;
      z-index: ${TOOLTIP_CONFIG.Z_INDEX};
      pointer-events: auto;
      opacity: 0;
      transform: scale(0.9);
      transition: opacity ${TOOLTIP_CONFIG.SHOW_DURATION}ms ease-out, transform ${TOOLTIP_CONFIG.SHOW_DURATION}ms ease-out;
      max-width: ${TOOLTIP_CONFIG.MAX_WIDTH}px;
      overflow: visible;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      will-change: opacity, transform;
    `;

    // 툴팁에 마우스 이벤트 추가
    this.tooltipContainer.addEventListener('mouseenter', () => {
      this.clearAutoHideTimer();
    });

    this.tooltipContainer.addEventListener('mouseleave', () => {
      this.startAutoHideTimer();
    });

    document.body.appendChild(this.tooltipContainer);
    return this.tooltipContainer;
  }

  // 툴팁 표시
  show(type, data, event, options = {}) {
    const {
      position = TOOLTIP_POSITIONS.AUTO,
      customTemplate = null,
      autoHide = true,
      className = '',
      immediate = true, // 즉시 표시 옵션 추가
    } = options;

    // 기존 타이머 정리
    if (this.showTimer) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }

    // 기존 툴팁 숨기기
    this.hideAll();

    const showTooltip = () => {
      // 툴팁 내용 생성
      const content = customTemplate || this.generateContent(type, data);
      if (!content) {
        console.warn('툴팁 내용을 생성할 수 없습니다:', type, data);
        return null;
      }

      // 툴팁 요소 설정
      this.tooltipContainer.innerHTML = content;
      this.tooltipContainer.className = `tooltip-manager-container ${className}`;

      // 위치 계산 및 설정
      this.setPosition(event, position);

      // 툴팁 표시 (즉시)
      requestAnimationFrame(() => {
        this.tooltipContainer.classList.add('showing');
      });

      // 활성 툴팁 설정
      this.activeTooltip = {
        type,
        data,
        element: this.tooltipContainer,
        timestamp: new Date(),
      };

      // 자동 숨김 설정
      if (autoHide && TOOLTIP_CONFIG.AUTO_HIDE_DELAY > 0) {
        this.startAutoHideTimer();
      }

      return this.activeTooltip;
    };

    // 즉시 표시 또는 약간의 지연 후 표시
    if (immediate) {
      return showTooltip();
    } else {
      this.showTimer = setTimeout(showTooltip, 100);
      return null;
    }
  }

  // 툴팁 숨기기
  hide() {
    if (this.showTimer) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }

    if (this.tooltipContainer) {
      this.tooltipContainer.classList.remove('showing');
      this.tooltipContainer.classList.add('hiding');

      // 애니메이션 완료 후 실제 숨김
      setTimeout(() => {
        if (this.tooltipContainer) {
          this.tooltipContainer.style.opacity = '0';
          this.tooltipContainer.classList.remove('hiding');
        }
      }, TOOLTIP_CONFIG.HIDE_DURATION);
    }

    this.clearAutoHideTimer();

    this.activeTooltip = null;
  }

  // 모든 툴팁 숨기기
  hideAll() {
    this.hide();
  }

  // ================================
  // 4. 위치 계산 및 설정
  // ================================

  // 툴팁 위치 설정
  setPosition(event, position = TOOLTIP_POSITIONS.AUTO) {
    if (!this.tooltipContainer || !event) return;

    const mouseX = event.pageX || event.clientX + window.scrollX;
    const mouseY = event.pageY || event.clientY + window.scrollY;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    // 툴팁 크기 측정
    this.tooltipContainer.style.visibility = 'hidden';
    this.tooltipContainer.style.opacity = '1';
    this.tooltipContainer.style.transform = 'scale(1)';

    const rect = this.tooltipContainer.getBoundingClientRect();

    this.tooltipContainer.style.visibility = 'visible';
    this.tooltipContainer.style.opacity = '0';
    this.tooltipContainer.style.transform = 'scale(0.9)';

    const tooltipWidth = Math.min(rect.width, TOOLTIP_CONFIG.MAX_WIDTH);
    const tooltipHeight = Math.min(rect.height, TOOLTIP_CONFIG.MAX_HEIGHT);

    let finalX, finalY;

    if (position === TOOLTIP_POSITIONS.AUTO) {
      // 개선된 자동 위치 계산
      const spaceRight = viewportWidth - (mouseX - scrollX);
      const spaceLeft = mouseX - scrollX;
      const spaceBelow = viewportHeight - (mouseY - scrollY);
      const spaceAbove = mouseY - scrollY;

      // X 위치 결정
      if (spaceRight >= tooltipWidth + TOOLTIP_CONFIG.OFFSET_X + 20) {
        finalX = mouseX + TOOLTIP_CONFIG.OFFSET_X;
      } else if (spaceLeft >= tooltipWidth + Math.abs(TOOLTIP_CONFIG.OFFSET_X) + 20) {
        finalX = mouseX - tooltipWidth - Math.abs(TOOLTIP_CONFIG.OFFSET_X);
      } else {
        finalX = Math.max(
          scrollX + 10,
          Math.min(mouseX, scrollX + viewportWidth - tooltipWidth - 10)
        );
      }

      // Y 위치 결정
      if (spaceBelow >= tooltipHeight + Math.abs(TOOLTIP_CONFIG.OFFSET_Y) + 20) {
        finalY = mouseY + Math.abs(TOOLTIP_CONFIG.OFFSET_Y);
      } else if (spaceAbove >= tooltipHeight + Math.abs(TOOLTIP_CONFIG.OFFSET_Y) + 20) {
        finalY = mouseY - tooltipHeight - Math.abs(TOOLTIP_CONFIG.OFFSET_Y);
      } else {
        finalY = Math.max(
          scrollY + 10,
          Math.min(mouseY, scrollY + viewportHeight - tooltipHeight - 10)
        );
      }
    } else {
      // 수동 위치 설정
      const positions = this.calculateManualPosition(
        mouseX,
        mouseY,
        tooltipWidth,
        tooltipHeight,
        position
      );
      finalX = positions.x;
      finalY = positions.y;
    }

    // 화면 경계 확인 및 조정
    finalX = Math.max(scrollX + 5, Math.min(finalX, scrollX + viewportWidth - tooltipWidth - 5));
    finalY = Math.max(scrollY + 5, Math.min(finalY, scrollY + viewportHeight - tooltipHeight - 5));

    // 위치 적용
    this.tooltipContainer.style.left = finalX + 'px';
    this.tooltipContainer.style.top = finalY + 'px';
  }

  /**
   * 수동 위치 계산
   */
  calculateManualPosition(mouseX, mouseY, tooltipWidth, tooltipHeight, position) {
    const offset = 15;

    switch (position) {
      case TOOLTIP_POSITIONS.TOP:
        return { x: mouseX - tooltipWidth / 2, y: mouseY - tooltipHeight - offset };
      case TOOLTIP_POSITIONS.BOTTOM:
        return { x: mouseX - tooltipWidth / 2, y: mouseY + offset };
      case TOOLTIP_POSITIONS.LEFT:
        return { x: mouseX - tooltipWidth - offset, y: mouseY - tooltipHeight / 2 };
      case TOOLTIP_POSITIONS.RIGHT:
        return { x: mouseX + offset, y: mouseY - tooltipHeight / 2 };
      case TOOLTIP_POSITIONS.TOP_LEFT:
        return { x: mouseX - tooltipWidth - offset, y: mouseY - tooltipHeight - offset };
      case TOOLTIP_POSITIONS.TOP_RIGHT:
        return { x: mouseX + offset, y: mouseY - tooltipHeight - offset };
      case TOOLTIP_POSITIONS.BOTTOM_LEFT:
        return { x: mouseX - tooltipWidth - offset, y: mouseY + offset };
      case TOOLTIP_POSITIONS.BOTTOM_RIGHT:
        return { x: mouseX + offset, y: mouseY + offset };
      default:
        return { x: mouseX + TOOLTIP_CONFIG.OFFSET_X, y: mouseY + TOOLTIP_CONFIG.OFFSET_Y };
    }
  }

  // ================================
  // 5. 콘텐츠 생성 메서드들
  // ================================

  // 툴팁 내용 생성 (타입별 분기)
  generateContent(type, data) {
    switch (type) {
      case TOOLTIP_TYPES.EQUIPMENT:
        return this.generateEquipmentTooltip(data);
      case TOOLTIP_TYPES.LINK:
        return this.generateLinkTooltip(data);
      case TOOLTIP_TYPES.GUKSA:
        return this.generateGuksaTooltip(data);
      case TOOLTIP_TYPES.ALARM:
        return this.generateAlarmTooltip(data);
      case TOOLTIP_TYPES.MAP_NODE:
        return this.generateMapNodeTooltip(data);
      default:
        return this.generateCustomTooltip(data);
    }
  }

  // 장비 툴팁 생성
  generateEquipmentTooltip(data) {
    const {
      equip_id = '',
      equip_name = '',
      equip_type = '',
      equip_field = '',
      guksa_name = '',
    } = data;

    // 🔴 StateManager에서 해당 장비의 경보 조회 (단일 데이터 소스)
    const totalAlarmData = StateManager.get('totalAlarmDataList', []);
    const finalAlarms = totalAlarmData.filter((alarm) => alarm && alarm.equip_id === equip_id);
    const finalAlarmCount = finalAlarms.length;

    // 🔴 유효/무효 경보 분석하여 색상 결정
    let alarmCountColor = '#7f8c8d'; // 기본 회색 (0건)

    if (finalAlarmCount > 0) {
      const validAlarms = finalAlarms.filter((alarm) => alarm.valid_yn === 'Y').length;
      const invalidAlarms = finalAlarmCount - validAlarms;

      if (validAlarms > 0 && invalidAlarms === 0) {
        alarmCountColor = '#e74c3c'; // 모두 유효 - 빨간색
      } else if (validAlarms === 0 && invalidAlarms > 0) {
        alarmCountColor = '#95a5a6'; // 모두 무효 - 회색
      } else if (validAlarms > 0 && invalidAlarms > 0) {
        alarmCountColor = '#f39c12'; // 유효+무효 혼합 - 주황색
      }
    }

    const fieldColor = this.getFieldColor(equip_field);

    // 🔴 경보 내역 HTML 생성
    const alarmHtml = this.generateAlarmListHtml(equip_id, finalAlarms);

    return `
      <div class="tooltip-content equipment-tooltip">
        <div class="tooltip-header">
          <div class="tooltip-title">⚙️ ${escapeHtml(equip_name)}</div>
          <div class="tooltip-field-badge" style="background-color: ${fieldColor}; color: white;">
            ${escapeHtml(equip_field)}
          </div>
        </div>
        <div class="tooltip-body">
          <div class="tooltip-info-row">
            <span class="tooltip-label">• 유형:</span>
            <span class="tooltip-value">${escapeHtml(equip_type)}</span>
          </div>
          <div class="tooltip-info-row">
            <span class="tooltip-label">• 국사:</span>
            <span class="tooltip-value">${escapeHtml(guksa_name)}</span>
          </div>
          <div class="tooltip-info-row">
            <span class="tooltip-label">• 장비 ID:</span>
            <span class="tooltip-value">${escapeHtml(equip_id)}</span>
          </div>

          ${alarmHtml}
        </div>
      </div>
    `;
  }

  // 링크 툴팁 생성 (TblSubLink 정보 포함)
  generateLinkTooltip(data) {
    const {
      link_name = '',
      link_field = '선로', // TblSubLink 기반 분야 정보
      link_type = '광케이블', // TblSubLink 기반 유형 정보
      section = '', // 구간 정보 (상위 하위 노드 이름)
      cable_aroot = '', // 케리어 A루트
      cable_broot = '', // 케리어 B루트
      sourceId = '',
      targetId = '',
      sourceField = '',
      targetField = '',
      sourceNode = null,
      targetNode = null,
      alarms = [],
      // 기존 호환성을 위한 필드들
      linkId = '',
      // 새로 추가된 필드들
      preFilteredAlarms = false, // 이미 필터링된 경보 데이터 사용 여부
      alarmCount = 0,
      hasAlarm = false,
    } = data;

    // MW-MW 구간 판별
    const isMWLink = link_field === 'MW' || (sourceField === 'MW' && targetField === 'MW');
    const displayField = link_field || (isMWLink ? 'MW' : '선로');
    const displayType = link_type || (isMWLink ? 'MW' : '광케이블');

    let sourceInfo = sourceId;
    let targetInfo = targetId;

    if (sourceNode) {
      sourceInfo = `${sourceNode.equip_name || sourceNode.name || sourceId}`;
      if (sourceNode.guksa_name) {
        sourceInfo += ` (${sourceNode.guksa_name})`;
      }
    }

    if (targetNode) {
      targetInfo = `${targetNode.equip_name || targetNode.name || targetId}`;
      if (targetNode.guksa_name) {
        targetInfo += ` (${targetNode.guksa_name})`;
      }
    }

    const fieldColor = this.getFieldColor(displayField);

    let linkAlarms = [];

    // MW 링크는 경보 내역 추출을 건너뛰고
    // 선로 링크만 경보 데이터를 추출
    if (!isMWLink) {
      if (preFilteredAlarms) {
        // 이미 필터링된 경보 데이터 사용 (선로 링크)
        linkAlarms = alarms || [];

        console.log(`✅ 사전 필터링된 경보 데이터 사용: ${linkAlarms.length}개`);
      } else {
        // 1. 선로 링크의 경보 정보 조회 (StateManager 사용)
        const totalAlarmData = StateManager.get('totalAlarmDataList', []);

        linkAlarms = totalAlarmData.filter((alarm) => {
          if (!alarm || !alarm.equip_name) return false;
          return alarm.equip_name === link_name;
        });

        console.log(`🔍 실시간 경보 조회 결과 (선로 링크): ${linkAlarms.length}개`);
      }

      // 🔴 2. 장애점 찾기에서 발견된 선로 링크 장애 정보 추가
      const failurePointAlarms = this.getFailurePointAlarms(link_name, linkId);

      console.log(`🔍 "${link_name}" 링크 장애점 경보 조회 결과:`, {
        linkName: link_name,
        linkId: linkId,
        failurePointAlarms: failurePointAlarms.length,
        existingAlarms: linkAlarms.length,
      });

      if (failurePointAlarms.length > 0) {
        // 기존 경보와 중복 제거하면서 장애점 경보 추가
        const existingAlarmIds = new Set(
          linkAlarms.map((alarm) => `${alarm.occur_datetime}_${alarm.alarm_message}`)
        );

        const newFailureAlarms = failurePointAlarms.filter(
          (alarm) => !existingAlarmIds.has(`${alarm.occur_datetime}_${alarm.alarm_message}`)
        );

        linkAlarms = [...linkAlarms, ...newFailureAlarms];
        console.log(`🔥 장애점 찾기에서 추가된 선로 링크 경보: ${newFailureAlarms.length}개`);
      }
    }

    // 🔴 링크 경보 유효/무효 분석하여 색상 결정
    let linkAlarmCountColor = '#7f8c8d'; // 기본 회색 (0건)

    if (linkAlarms.length > 0) {
      const validAlarms = linkAlarms.filter((alarm) => alarm.valid_yn === 'Y').length;
      const invalidAlarms = linkAlarms.length - validAlarms;

      if (validAlarms > 0 && invalidAlarms === 0) {
        linkAlarmCountColor = '#e74c3c'; // 모두 유효 - 빨간색
      } else if (validAlarms === 0 && invalidAlarms > 0) {
        linkAlarmCountColor = '#95a5a6'; // 모두 무효 - 회색
      } else if (validAlarms > 0 && invalidAlarms > 0) {
        linkAlarmCountColor = '#f39c12'; // 유효+무효 혼합 - 주황색
      }
    }

    // 🔴 링크 경보 내역 HTML 생성 (0건도 포함)
    const alarmHtml = this.generateAlarmListHtml(link_name, linkAlarms);

    return `
      <div class="tooltip-content link-tooltip">
        <div class="tooltip-header">
          <div class="tooltip-title">🔗 ${escapeHtml(link_name || '링크')}</div>
          <div class="tooltip-type-badge" style="background: ${fieldColor}; color: white};">
            ${displayField} - ${displayType}
          </div>
        </div>

        <div class="tooltip-body">
          ${
            section
              ? `
          <div class="tooltip-info-row">
            <span class="tooltip-label">• 구간:</span>
            <span class="tooltip-value" style="font-weight: 500;">${escapeHtml(section)}</span>
          </div>`
              : `
          <div class="tooltip-info-row">
            <span class="tooltip-label">• 시작:</span>
            <span class="tooltip-value">${escapeHtml(sourceInfo)}</span>
          </div>
          
          <div class="tooltip-info-row">
            <span class="tooltip-label">• 종료:</span>
            <span class="tooltip-value">${escapeHtml(targetInfo)}</span>
          </div>`
          }

          ${
            linkId
              ? `
          <div class="tooltip-info-row">
            <span class="tooltip-label">• 링크 ID:</span>
            <span class="tooltip-value">${escapeHtml(linkId)}</span>
          </div>`
              : ''
          }
          
          ${
            cable_aroot
              ? `
          <div class="tooltip-info-row">
            <span class="tooltip-label">• A루트:</span>
            <span class="tooltip-value" style="font-size: 12px;">${escapeHtml(cable_aroot)}</span>
          </div>`
              : ''
          }
          ${
            cable_broot
              ? `
          <div class="tooltip-info-row">
            <span class="tooltip-label">• B루트:</span>
            <span class="tooltip-value" style="font-size: 12px;">${escapeHtml(cable_broot)}</span>
          </div>`
              : ''
          }          
          
          ${!isMWLink ? alarmHtml : ''}
        </div>
      </div>
    `;
  }

  // 국사 툴팁 생성
  generateGuksaTooltip(data) {
    const {
      guksa_id = '',
      guksa_name = '',
      equipmentCount = 0,
      alarmCount = 0,
      sectors = [],
    } = data;

    const sectorInfo =
      sectors.length > 0
        ? sectors
            .map(
              (s) => `<span style="color: ${this.getFieldColor(s)}; font-weight: 500;">${s}</span>`
            )
            .join(', ')
        : '정보 없음';

    return `
      <div class="tooltip-content guksa-tooltip">
        <div class="tooltip-header">
          <div class="tooltip-title">🏢 ${escapeHtml(guksa_name)}</div>
        </div>
        <div class="tooltip-body">
          <div class="tooltip-info-row">
            <span class="tooltip-label">국사 ID:</span>
            <span class="tooltip-value">${escapeHtml(guksa_id)}</span>
          </div>
          <div class="tooltip-info-row">
            <span class="tooltip-label">장비 수:</span>
            <span class="tooltip-value">${equipmentCount}대</span>
          </div>
          <div class="tooltip-info-row">
            <span class="tooltip-label">경보 수:</span>
            <span class="tooltip-value" style="color: ${
              alarmCount > 0 ? '#e74c3c' : '#27ae60'
            }; font-weight: 500;">${alarmCount}개</span>
          </div>
          <div class="tooltip-info-row">
            <span class="tooltip-label">분야:</span>
            <span class="tooltip-value">${sectorInfo}</span>
          </div>
        </div>
      </div>
    `;
  }

  // 경보 툴팁 생성
  generateAlarmTooltip(data) {
    const {
      alarm_message = '',
      occur_datetime = '',
      valid_yn = '',
      equip_name = '',
      equip_id = '',
      sector = '',
    } = data;

    // 선로 경보는 직접적인 장애점이므로 항상 유효로 표시
    const isValidAlarm = sector === '선로' || valid_yn === 'Y';
    const validityClass = isValidAlarm ? 'valid-alarm' : 'invalid-alarm';
    const validityText = isValidAlarm ? '유효' : '무효';
    const fieldColor = this.getFieldColor(sector);

    return `
      <div class="tooltip-content alarm-tooltip ${validityClass}">
        <div class="tooltip-header">
          <div class="tooltip-title">⚠️ 경보 정보</div>
          <div class="tooltip-validity ${validityClass}">${validityText}</div>
        </div>
        <div class="tooltip-body">
          <div class="tooltip-info-row">
            <span class="tooltip-label">• 메시지:</span>
            <span class="tooltip-value">${escapeHtml(alarm_message)}</span>
          </div>
          <div class="tooltip-info-row">
            <span class="tooltip-label">• 발생시간:</span>
            <span class="tooltip-value">${formatDateTimeForToolTip(occur_datetime)}</span>
          </div>
          <div class="tooltip-info-row">
            <span class="tooltip-label">• 장비:</span>
            <span class="tooltip-value">${escapeHtml(equip_name)} (${escapeHtml(equip_id)})</span>
          </div>
          <div class="tooltip-info-row">
            <span class="tooltip-label">• 분야:</span>
            <span class="tooltip-value" style="color: ${fieldColor}; font-weight: 500;">${sector}</span>
          </div>
        </div>
      </div>
    `;
  }

  // 맵 노드 툴팁 생성 (기존 시스템 호환)
  generateMapNodeTooltip(data) {
    if (data.type === 'guksa') {
      return this.generateGuksaTooltip(data);
    } else {
      return this.generateEquipmentTooltip(data);
    }
  }

  // 커스텀 툴팁 생성
  generateCustomTooltip(data) {
    const { title = '', content = '', html = '' } = data;

    if (html) {
      return html;
    }

    return `
      <div class="tooltip-content custom-tooltip">
        ${
          title
            ? `
        <div class="tooltip-header">
          <div class="tooltip-title">${escapeHtml(title)}</div>
        </div>`
            : ''
        }
        <div class="tooltip-body">
          ${escapeHtml(content)}
        </div>
      </div>
    `;
  }

  // ================================
  // 6. 유틸리티 메서드들
  // ================================

  // 분야 색상 가져오기
  getFieldColor(field) {
    if (typeof ColorManager !== 'undefined' && ColorManager.getEquipmentNodeColor) {
      return ColorManager.getEquipmentNodeColor(field);
    }

    // 대체 색상 매핑
    const colors = {
      MW: ColorManager.getFieldColor('MW'),
      선로: ColorManager.getFieldColor('선로'),
      전송: ColorManager.getFieldColor('전송'),
      IP: ColorManager.getFieldColor('IP'),
      무선: ColorManager.getFieldColor('무선'),
      교환: ColorManager.getFieldColor('교환'),
    };
    return colors[field] || '#95a5a6';
  }

  // 장애점 찾기에서 발견된 링크 장애 경보 가져오기
  getFailurePointAlarms(linkName, linkId) {
    try {
      // FailurePointManager에서 현재 장애점 정보 조회
      if (
        typeof failurePointManager !== 'undefined' &&
        failurePointManager.getCurrentFailurePoints
      ) {
        const currentFailurePoints = failurePointManager.getCurrentFailurePoints();

        // 해당 링크의 장애점 찾기
        const linkFailurePoint = currentFailurePoints.find((fp) => {
          return (
            fp.type === 'link' && (fp.id === linkId || fp.id === linkName || fp.name === linkName)
          );
        });

        if (linkFailurePoint && linkFailurePoint.alarms) {
          console.log(`🔥 장애점 찾기에서 "${linkName}" 링크 장애 발견:`, {
            failurePoint: linkFailurePoint.name,
            alarmCount: linkFailurePoint.alarms.length,
          });

          // 장애점 경보 데이터를 표준 경보 형식으로 변환
          return linkFailurePoint.alarms.map((alarm) => ({
            ...alarm,
            equip_name: linkName,
            sector: '선로',
            valid_yn: 'Y', // 장애점 찾기에서 발견된 경보는 항상 유효로 처리
            is_failure_point: true, // 장애점 경보 표시용 플래그
          }));
        }
      }

      return [];
    } catch (error) {
      console.error('장애점 경보 조회 중 오류:', error);
      return [];
    }
  }

  // 경보 목록 HTML 생성
  generateAlarmListHtml(equipId, alarms = []) {
    // MessageManager의 통합된 경보 목록 HTML 생성 함수 사용 (툴팁용)
    return MessageManager.generateTooltipAlarmListHTML(alarms, {
      title: `📋 최근 경보 내역 (${alarms.length}개)`,
      maxDisplay: TOOLTIP_CONFIG.MAX_ALARMS_DISPLAY,
    });
  }

  // 전역 이벤트 설정
  setupGlobalEvents() {
    // 문서 클릭 시 툴팁 숨기기 (툴팁 자체 클릭은 제외)
    document.addEventListener('click', (event) => {
      if (!this.tooltipContainer?.contains(event.target)) {
        this.hide();
      }
    });

    // ESC 키로 툴팁 숨기기
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.hide();
      }
    });

    // 스크롤 시 툴팁 숨기기
    document.addEventListener('scroll', () => {
      this.hide();
    });

    // 윈도우 리사이즈 시 툴팁 숨기기
    window.addEventListener('resize', () => {
      this.hide();
    });

    // 전역 mouseleave 이벤트는 비활성화 (각 컴포넌트에서 직접 관리)
    // document.addEventListener('mouseleave', ...) 제거
  }

  // ================================
  // 7. 편의 메서드들 (기존 코드 호환성)
  // ================================

  // 장비 툴팁 표시 (즉시 표시)
  showEquipmentTooltip(event, equipmentData, options = {}) {
    return this.show(TOOLTIP_TYPES.EQUIPMENT, equipmentData, event, {
      immediate: true,
      ...options,
    });
  }

  // 링크 툴팁 표시 (즉시 표시)
  showLinkTooltip(event, linkData, options = {}) {
    return this.show(TOOLTIP_TYPES.LINK, linkData, event, {
      immediate: true,
      ...options,
    });
  }

  // 국사 툴팁 표시
  showGuksaTooltip(event, guksaData, options = {}) {
    return this.show(TOOLTIP_TYPES.GUKSA, guksaData, event, {
      immediate: true,
      ...options,
    });
  }

  // 경보 툴팁 표시
  showAlarmTooltip(event, alarmData, options = {}) {
    return this.show(TOOLTIP_TYPES.ALARM, alarmData, event, {
      immediate: true,
      ...options,
    });
  }

  // 자동 숨김 타이머 시작
  startAutoHideTimer() {
    this.clearAutoHideTimer();
    if (TOOLTIP_CONFIG.AUTO_HIDE_DELAY > 0) {
      this.autoHideTimer = setTimeout(() => {
        this.hide();
      }, TOOLTIP_CONFIG.AUTO_HIDE_DELAY);
    }
  }

  // 자동 숨김 타이머 정리
  clearAutoHideTimer() {
    if (this.autoHideTimer) {
      clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }
  }
}

// ================================
// 8. 전역 인스턴스 및 호환성
// ================================

// 싱글톤 인스턴스 생성
export const tooltipManager = new TooltipManager();

// 전역 등록 제거 - 모듈 import 방식으로 사용

// 기본 내보내기
export default TooltipManager;
