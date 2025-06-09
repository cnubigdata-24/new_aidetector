/**
 * 대시보드 컴포넌트 모듈 (성능 최적화 버전)
 * 파일 위치: src/core/DashboardComponent.js
 
 * 성능 최적화: DOM 캐싱, 메모리 관리, 계산 캐싱
 */

import CommonUtils from '../utils/CommonUtils.js'; // 공통 유틸리티 Function

import { colorManager } from '../utils/ColorManager.js';
import { stateManager as StateManager } from './StateManager.js'; // 싱글톤, Alias

// ================================
// 1. 대시보드 설정 및 상수
// ================================

const DASHBOARD_CONFIG = {
  CARD_MIN_WIDTH: 150,
  CARD_MAX_WIDTH: 150,
  CARD_HEIGHT: 50,
  ANIMATION_DURATION: 300,
  AUTO_REFRESH_INTERVAL: 30000, // 30초
  DRAG_THRESHOLD: 5,
};

const CARD_TEMPLATES = {
  SECTOR: 'sector',
  SUMMARY: 'summary',
  CUSTOM: 'custom',
};

const DEFAULT_SECTORS = ['MW', '선로', '전송', 'IP', '무선', '교환'];

// ================================
// 2. DashboardComponent 클래스
// ================================

class DashboardComponent {
  constructor(containerId = 'dashboard') {
    this.containerId = containerId;
    this.container = null;
    this.cards = new Map();
    this.cardOrder = [];

    // 성능 최적화: DOM 요소 캐싱
    this.headerElements = {
      equipCount: null,
      alarmCount: null,
      recentTime: null,
    };

    // 성능 최적화: 통계 계산 결과 캐싱
    this.statsCache = {
      data: null,
      dataHash: null,
      stats: null,
    };

    // 성능 최적화: 이벤트 리스너 추적
    this.eventListeners = new Map();

    // 성능 최적화: 선택된 카드 추적
    this.selectedCard = null;

    this.dragState = {
      isDragging: false,
      draggedCard: null,
      startX: 0,
      startY: 0,
      offsetX: 0,
      offsetY: 0,
    };
    this.autoRefreshTimer = null;
    this.isInitialized = false;

    this.init();
    console.log('📊 DashboardComponent 초기화 완료');
  }

  /**
   * 초기화
   */
  init() {
    try {
      this.container = document.getElementById(this.containerId);

      if (!this.container) {
        console.warn(`대시보드 컨테이너를 찾을 수 없습니다: ${this.containerId}`);
        return;
      }

      this.setupContainer();
      this.setupStateListeners();
      this.cacheHeaderElements(); // 헤더 요소 캐싱
      this.isInitialized = true;

      console.log('✅ DashboardComponent 초기화 완료');
    } catch (error) {
      console.error('DashboardComponent 초기화 중 오류:', error);
    }
  }

  // ================================
  // 3. 컨테이너 및 이벤트 설정
  // ================================

  /**
   * 컨테이너 기본 설정
   */
  setupContainer() {
    if (!this.container) return;

    // ✅ 추가: 초기 상태 안정화
    this.container.classList.remove('loading', 'empty');

    // 기존 스타일 설정
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'row';
    this.container.style.flexWrap = 'nowrap';
    this.container.style.width = '100%';
    this.container.style.overflowX = 'auto';
    this.container.style.gap = '10px';
    this.container.style.padding = '10px';

    // ✅ 추가: 안정성 보장
    this.container.style.visibility = 'visible';
    this.container.style.opacity = '1';
    this.container.style.minHeight = '38px';
  }

  /**
   * 헤더 요소들 캐싱 (성능 최적화)
   */
  cacheHeaderElements() {
    this.headerElements.equipCount = document.getElementById('realtime-alarm-equip-count');
    this.headerElements.alarmCount = document.getElementById('total-alarm-count');
    this.headerElements.recentTime = document.getElementById('recent-alarm-update-time');
  }

  /**
   * 상태 관리자 이벤트 리스너 설정
   */
  setupStateListeners() {
    // 알람 데이터 변경 시 대시보드 업데이트 ==> 경보 대시보드 카드는 별도로 업데이트
    //     StateManager.on('totalAlarmDataList', () => {
    //       this.refreshDashboard();
    //     });

    // 선택된 분야 변경 시 하이라이트 업데이트
    StateManager.on('selectedSector', (data) => {
      this.updateSelectedSectorHighlight(data.value, data.oldValue);
    });

    // 경보 테이블 페이지 변경 시 통계 업데이트
    StateManager.on('currentPage', () => {
      this.updatePageInfo();
    });
  }

  // ================================
  // 4. 대시보드 렌더링
  // ================================

  /**
   * 전체 분야별 경보 대시보드 렌더링
   */
  renderDashboard(alarmData = null) {
    console.log('📊 대시보드 렌더링 시작...');

    try {
      if (!this.container) {
        console.warn('대시보드 컨테이너가 없습니다.');
        return;
      }

      if (!alarmData || !Array.isArray(alarmData)) {
        console.warn('유효하지 않은 알람 데이터:', alarmData);
        alarmData = [];
      }

      // ✅ 수정: 기존 카드들을 제거하지 않고 업데이트만 수행
      this.updateExistingCards(alarmData);

      console.log(`✅ 대시보드 업데이트 완료: ${this.cards.size}개 카드`);
    } catch (error) {
      console.error('❌ 대시보드 렌더링 중 오류:', error);
      this.showErrorCard('대시보드 렌더링 실패');
    }
  }

  /**
   * 분야별 경보 대시보드카들의 내용만 업데이트
   */
  updateExistingCards(alarmData) {
    // 분야별 통계 계산 (캐싱 적용)
    const sectorStats = this.calculateSectorStats(alarmData);

    // 카드가 없으면 최초 생성
    if (this.cards.size === 0) {
      this.createInitialCards(sectorStats);
      return;
    }

    // 분야별 경보 대시보드 카드 내용 업데이트
    DEFAULT_SECTORS.forEach((sector) => {
      const card = this.cards.get(sector);
      const stats = sectorStats[sector] || {
        totalAlarms: 0,
        validAlarms: 0,
        equipmentCount: 0,
        validPercentage: 0,
      };

      if (card) {
        this.updateCardContent(card, sector, stats);
      } else {
        // 카드가 없으면 새로 생성
        const newCard = this.createSectorCard(sector, stats);
        this.addCard(sector, newCard);
      }
    });

    // 선택된 분야 하이라이트는 유지
    const selectedSector = StateManager.get('selectedSector');
    if (selectedSector) {
      this.updateSelectedSectorHighlight(selectedSector);
    }
  }

  /**
   * 개별 카드의 내용만 업데이트 (DOM 재생성 없음) - 성능 최적화
   */
  updateCardContent(card, sector, stats) {
    const equipmentCount = CommonUtils.formatNumber(stats.equipmentCount);
    const totalAlarms = CommonUtils.formatNumber(stats.totalAlarms);

    // 텍스트 부분만 업데이트 (HTML 재생성 방지)
    const textElement = card.querySelector('.sector-text');
    if (textElement) {
      // 기존 dot 요소 유지하고 텍스트만 변경
      let dotElement = textElement.querySelector('.sector-color-dot');
      if (!dotElement) {
        dotElement = document.createElement('span');
        dotElement.className = `sector-color-dot sector-color-${sector}`;
        textElement.insertBefore(dotElement, textElement.firstChild);
      }

      // 텍스트 노드만 업데이트
      const textNodes = textElement.childNodes;
      for (let i = textNodes.length - 1; i >= 0; i--) {
        if (textNodes[i].nodeType === Node.TEXT_NODE) {
          textNodes[i].remove();
        }
      }
      textElement.appendChild(
        document.createTextNode(`${sector}  ${equipmentCount}대 (${totalAlarms}건)`)
      );
    }
  }

  /**
   * 최초 카드들 생성 (최초 로딩 시에만 사용)
   */
  createInitialCards(sectorStats) {
    DEFAULT_SECTORS.forEach((sector, index) => {
      const stats = sectorStats[sector] || {
        totalAlarms: 0,
        validAlarms: 0,
        equipmentCount: 0,
        validPercentage: 0,
      };

      const card = this.createSectorCard(sector, stats, index);
      this.addCard(sector, card);
    });

    // 초기 렌더링 시 IP 분야가 선택되도록 설정
    setTimeout(() => {
      const selectedSector = StateManager.get('selectedSector', 'IP');
      this.updateSelectedSectorHighlight(selectedSector);
    }, 100);
  }

  /**
   * 분야별 통계 계산 (캐싱 적용) - 성능 최적화
   */
  calculateSectorStats(alarmData) {
    // 데이터 해시 생성 (간단한 해시)
    const dataHash = alarmData.length + '_' + (alarmData[0]?.occur_datetime || '');

    // 캐시된 결과가 있고 데이터가 동일하면 재사용
    if (this.statsCache.dataHash === dataHash && this.statsCache.stats) {
      return this.statsCache.stats;
    }

    // 새로 계산
    const stats = CommonUtils.calculateSectorEquipmentStats(alarmData);

    // 캐시 업데이트
    this.statsCache = {
      data: alarmData,
      dataHash: dataHash,
      stats: stats,
    };

    return stats;
  }

  // ================================
  // 5. 카드 생성 메서드들
  // ================================

  /**
   * 분야별 카드 생성
   */
  createSectorCard(sector, stats, index = 0) {
    const cardId = `card-${sector}`;

    const card = document.createElement('div');
    card.className = 'dashboard-sector-simple';
    card.id = cardId;
    card.setAttribute('data-sector', sector);
    card.setAttribute('data-index', index);

    // CSS 클래스만 사용하여 색상 원 생성
    const equipmentCount = CommonUtils.formatNumber(stats.equipmentCount);
    const totalAlarms = CommonUtils.formatNumber(stats.totalAlarms);

    card.innerHTML = `
    <span class="sector-text">
      <span class="sector-color-dot sector-color-${sector}"></span>
      ${sector}  ${equipmentCount}대 (${totalAlarms}건)
    </span>
  `;

    // 이벤트 리스너 등록 및 추적 (메모리 누수 방지)
    const clickHandler = (e) => {
      e.stopPropagation();
      this.handleSectorCardClick(sector);
    };

    card.addEventListener('click', clickHandler);
    this.eventListeners.set(cardId, { element: card, event: 'click', handler: clickHandler });

    return card;
  }

  // ================================
  // 6. 카드 관리 메서드들
  // ================================

  /**
   * 카드 추가
   */
  addCard(id, cardElement) {
    if (!this.container || !cardElement) return;

    this.cards.set(id, cardElement);
    this.cardOrder.push(id);
    this.container.appendChild(cardElement);

    // 간단한 페이드인 애니메이션
    requestAnimationFrame(() => {
      cardElement.style.opacity = '0';

      setTimeout(() => {
        cardElement.style.transition = 'opacity 0.3s ease';
        cardElement.style.opacity = '1';
      }, 50);
    });
  }

  /**
   * 카드 제거
   */
  removeCard(id) {
    const card = this.cards.get(id);
    if (card) {
      // 이벤트 리스너 제거
      const listener = this.eventListeners.get(id);
      if (listener) {
        listener.element.removeEventListener(listener.event, listener.handler);
        this.eventListeners.delete(id);
      }

      card.style.transition = `all ${DASHBOARD_CONFIG.ANIMATION_DURATION}ms ease`;
      card.style.opacity = '0';
      card.style.transform = 'translateY(-20px)';

      setTimeout(() => {
        if (card.parentNode) {
          card.parentNode.removeChild(card);
        }
        this.cards.delete(id);
        this.cardOrder = this.cardOrder.filter((cardId) => cardId !== id);
      }, DASHBOARD_CONFIG.ANIMATION_DURATION);
    }
  }

  /**
   * 대시보드 초기화
   */
  clearDashboard() {
    // ✅ 수정: 일반적인 업데이트에서는 카드를 제거하지 않음
    // 에러 상황이나 완전 초기화가 필요한 경우에만 사용
    console.log('🧹 대시보드 완전 초기화 (에러 복구용)');

    if (!this.container) return;

    // 이벤트 리스너 정리
    this.eventListeners.forEach(({ element, event, handler }) => {
      if (element && element.removeEventListener) {
        element.removeEventListener(event, handler);
      }
    });
    this.eventListeners.clear();

    this.cards.clear();
    this.cardOrder = [];
    this.selectedCard = null;
    this.container.innerHTML = '';
  }

  /**
   * 분야별 경보 대시보드 카드 표시
   */
  showErrorCard(message) {
    this.clearDashboard();
    const errorCard = this.createErrorCard(message);
    this.addCard('error', errorCard);
  }

  // ================================
  // 7. 이벤트 핸들러들
  // ================================

  /**
   * 분야 대시보드 카드 클릭 처리
   */
  handleSectorCardClick(sector) {
    console.log(`📊 DashboardComponent: 분야 카드 클릭. StateManager 상태 변경 요청: ${sector}`);

    try {
      // 상태 업데이트는 StateManager가 담당.
      // FaultDashboardApp은 StateManager의 변경을 감지하고 반응.
      StateManager.setSelectedSector(sector, { source: 'dashboard-click' });
    } catch (error) {
      console.error('분야 카드 클릭 처리 중 오류:', error);
    }
  }

  /**
   * 선택된 분야 Sector 하이라이트 (성능 최적화)
   */
  updateSelectedSectorHighlight(selectedSector, previousSector = null) {
    // 이전 선택된 카드 비활성화
    if (this.selectedCard) {
      this.selectedCard.classList.remove('selected');
    }

    // 현재 선택된 카드 활성화
    const currentCard = this.cards.get(selectedSector);
    if (currentCard) {
      currentCard.classList.add('selected');
      this.selectedCard = currentCard;
    }
  }

  /**
   * 페이지 정보 업데이트
   */
  updatePageInfo() {
    // 현재 페이지 정보를 요약 카드에 반영할 수 있음
    const summaryCard = this.cards.get('summary');
    if (summaryCard) {
      const currentPage = StateManager.get('currentPage', 1);
      const badge = summaryCard.querySelector('.card-badge');
      if (badge) {
        badge.textContent = `페이지 ${currentPage}`;
      }
    }
  }

  // ================================
  // 8. 자동 새로고침 및 업데이트
  // ================================

  /**
   * 대시보드 새로고침
   */
  refreshDashboard() {
    console.log('🔄 대시보드 새로고침...');

    try {
      // StateManager에 전체 경보 데이터 가져오기
      let alarmData = StateManager.get('totalAlarmDataList');

      // StateManager에 데이터가 없으면 빈 배열로 초기화
      if (!alarmData || !Array.isArray(alarmData)) {
        console.warn('StateManager에 totalAlarmDataList가 없습니다. 빈 배열로 초기화합니다.');
        alarmData = [];
        // StateManager에 빈 배열 설정하여 일관성 유지
        StateManager.set('totalAlarmDataList', alarmData);
      }

      console.log(`🔄 새로고침 데이터: ${alarmData.length}개 항목`);

      // 1. 분야별 경보 현황 대시보드 업데이트
      this.renderDashboard(alarmData);

      // 2.맨 위 상단 헤더 경보요약 정보도 업데이트
      this.updateHeaderInfo(alarmData);
    } catch (error) {
      console.error('대시보드 새로고침 중 오류:', error);
    }
  }

  /**
   * 헤더 정보 업데이트 (성능 최적화: DOM 캐싱 적용)
   */
  updateHeaderInfo(alarmData) {
    console.log('🔄 상단 헤더 정보 업데이트 시작 updateHeaderInfo ...');
    try {
      // 헤더 요소가 캐싱되지 않았으면 캐싱
      if (!this.headerElements.equipCount) {
        this.cacheHeaderElements();
      }

      const equipCount = new Set(alarmData.map((alarm) => alarm.equip_name)).size;
      const totalAlarms = alarmData.length;

      // 최근 경보 시간
      const recentAlarm = alarmData
        .filter((alarm) => alarm.occur_datetime)
        .sort((a, b) => new Date(b.occur_datetime) - new Date(a.occur_datetime))[0];

      // 캐싱된 DOM 요소 사용
      if (this.headerElements.equipCount) {
        this.headerElements.equipCount.textContent = `${CommonUtils.formatNumber(equipCount)} 대`;
      } else {
        console.warn('equipCountEl 요소를 찾을 수 없습니다.');
      }

      if (this.headerElements.alarmCount) {
        this.headerElements.alarmCount.textContent = `${CommonUtils.formatNumber(totalAlarms)} 건`;
      } else {
        console.warn('alarmCountEl 요소를 찾을 수 없습니다.');
      }

      if (this.headerElements.recentTime && recentAlarm) {
        const recentTime = CommonUtils.formatDateTime(recentAlarm.occur_datetime);
        this.headerElements.recentTime.textContent = `${recentTime}`;
      } else {
        console.warn('recentTimeEl 요소를 찾을 수 없습니다.');
      }
    } catch (error) {
      console.error('헤더 정보 업데이트 중 오류:', error);
    }
  }

  // ================================
  // 9. APP 전역 상태 관리 및 진단
  // ================================

  /**
   * 현재 상태 가져오기
   */
  getState() {
    return {
      isInitialized: this.isInitialized,
      cardCount: this.cards.size,
      cardOrder: [...this.cardOrder],
      isDragging: this.dragState.isDragging,
      autoRefreshActive: !!this.autoRefreshTimer,
      containerExists: !!this.container,
      cachedElementsCount: Object.values(this.headerElements).filter((el) => el).length,
      eventListenersCount: this.eventListeners.size,
      statsCacheActive: !!this.statsCache.stats,
    };
  }

  /**
   * 통계 정보
   */
  getStats() {
    const alarmData = StateManager.get('totalAlarmDataList', []);
    const sectorStats = this.calculateSectorStats(alarmData);

    return {
      ...this.getState(),
      sectorStats,
      totalAlarms: alarmData.length,
      validAlarms: alarmData.filter((alarm) => alarm.valid_yn === 'Y').length,
      uniqueEquipment: new Set(alarmData.map((alarm) => alarm.equip_name)).size,
    };
  }

  /**
   * 진단 정보
   */
  diagnose() {
    const diagnosis = {
      ...this.getState(),
      containerElement: this.container,
      cards: Array.from(this.cards.keys()),
      eventListeners: {
        mouseEvents: true,
        touchEvents: true,
        resizeEvent: true,
        stateEvents: true,
      },
    };

    console.table(diagnosis);
    return diagnosis;
  }

  /**
   * 컴포넌트 정리 (메모리 누수 방지)
   */
  destroy() {
    // 이벤트 리스너 정리
    this.eventListeners.forEach(({ element, event, handler }) => {
      if (element && element.removeEventListener) {
        element.removeEventListener(event, handler);
      }
    });
    this.eventListeners.clear();

    // 자동 새로고침 타이머 정리
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }

    // 캐시 정리
    this.statsCache = { data: null, dataHash: null, stats: null };
    this.headerElements = { equipCount: null, alarmCount: null, recentTime: null };

    // 선택된 카드 참조 정리
    this.selectedCard = null;

    // 대시보드 정리
    this.clearDashboard();

    console.log('🗑️ DashboardComponent 정리 완료');
  }
}

// ================================
// 10. 전역 인스턴스 및 호환성
// ================================

/**
 * 싱글톤 인스턴스 생성
 */
export const dashboardComponent = new DashboardComponent();
