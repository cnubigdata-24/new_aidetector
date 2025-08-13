/**
 * SectorLoadingManager - 분야 변경 시 로딩 상태 관리
 * 경보 테이블과 사이드바 장비 목록의 로딩 상태를 통합 관리
 */

import { MessageManager } from './MessageManager.js';

class SectorLoadingManager {
  constructor() {
    this.isLoading = false;
    this.loadingElements = new Map();
    this.loadingTimeouts = new Map();
  }

  // 분야 변경 로딩 시작
  startSectorChangeLoading(source = 'unknown') {
    if (this.isLoading) {
      console.log(`⚠️ 이미 로딩 중입니다. 중복 호출 무시 (${source})`);
      return; // 중복 호출 방지
    }

    this.isLoading = true;
    console.log(`🔄 분야 변경 로딩 시작 (${source})`);

    // 1. 경보 테이블 로딩 상태
    this.showAlarmTableLoading();

    // 2. 사이드바 장비 목록 로딩 상태
    this.showSidebarLoading();

    // 3. 안전장치: 최대 10초 후 자동 완료 (무한 로딩 방지)
    this.setAutoFinishTimeout();
  }

  // 분야 변경 로딩 완료
  finishSectorChangeLoading() {
    if (!this.isLoading) {
      return;
    }

    this.isLoading = false;
    console.log('✅ 분야 변경 로딩 완료');

    // 타임아웃 정리
    this.clearAutoFinishTimeout();

    // 사이드바 select 요소 활성화
    const equipSelect = document.getElementById('searchEquipName');
    if (equipSelect) {
      equipSelect.disabled = false;
    }
  }

  // 경보 테이블 로딩 상태 표시
  showAlarmTableLoading() {
    const tbody = document.getElementById('alarmTableBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr class="loading-row">
          <td colspan="8" class="loading-cell">
            <div class="loading-spinner"></div>
            <span class="loading-text">경보 데이터를 확인 중입니다...</span>
          </td>
        </tr>
      `;
    }
  }

  // 사이드바 장비 목록 로딩 상태 표시
  showSidebarLoading() {
    const equipSelect = document.getElementById('searchEquipName');
    if (equipSelect) {
      equipSelect.innerHTML = `
        <option value="" disabled selected>
          ⏳ 경보 장비를 확인 중입니다.
        </option>
      `;
      equipSelect.disabled = true;
    }
  }

  // 에러 상태 표시
  showError(error, source = 'unknown') {
    this.isLoading = false;
    console.error(`❌ 분야 변경 오류 (${source}):`, error);

    // 타임아웃 정리
    this.clearAutoFinishTimeout();

    // 로딩 상태 해제
    const equipSelect = document.getElementById('searchEquipName');
    if (equipSelect) {
      equipSelect.disabled = false;
      equipSelect.innerHTML = '<option value="">❌ 오류 발생</option>';
    }

    const tbody = document.getElementById('alarmTableBody');
    if (tbody) {
      tbody.innerHTML = `
        <tr class="error-row">
          <td colspan="8" class="error-cell">
            ⚠️ 데이터 로딩 중 오류가 발생했습니다: ${error.message}
          </td>
        </tr>
      `;
    }

    MessageManager.addErrorMessage(`❌ 데이터 처리 중 오류: ${error.message}`);
  }

  // 강제 로딩 완료 (수동 호출용)
  forceFinish(reason = 'manual') {
    if (this.isLoading) {
      console.log(`🔧 강제 로딩 완료 (${reason})`);
      this.finishSectorChangeLoading();
    }
  }

  // 자동 완료 타임아웃 설정 (무한 로딩 방지)
  setAutoFinishTimeout() {
    this.clearAutoFinishTimeout();

    const timeoutId = setTimeout(() => {
      if (this.isLoading) {
        console.warn('⚠️ 로딩 타임아웃 - 자동 완료 처리');
        this.finishSectorChangeLoading();
        MessageManager.addWarningMessage('데이터 로딩이 예상보다 오래 걸려 자동 완료되었습니다.');
      }
    }, 10000); // 10초 타임아웃

    this.loadingTimeouts.set('autoFinish', timeoutId);
  }

  // 자동 완료 타임아웃 해제
  clearAutoFinishTimeout() {
    const timeoutId = this.loadingTimeouts.get('autoFinish');
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.loadingTimeouts.delete('autoFinish');
    }
  }

  // 현재 로딩 상태 확인
  getLoadingState() {
    return {
      isLoading: this.isLoading,
      loadingElementsCount: this.loadingElements.size,
      activeTimeouts: this.loadingTimeouts.size,
    };
  }

  // 정리 (메모리 누수 방지)
  destroy() {
    // 모든 타임아웃 정리
    this.loadingTimeouts.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    this.loadingTimeouts.clear();
    this.loadingElements.clear();
    this.isLoading = false;

    console.log('🗑️ SectorLoadingManager 정리 완료');
  }
}

// 싱글톤 인스턴스 생성 및 export
export const sectorLoadingManager = new SectorLoadingManager();

// 클래스도 export (테스트나 커스텀 인스턴스용)
export { SectorLoadingManager };
