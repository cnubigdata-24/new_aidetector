/**
 * 색상 관리 통합 모듈
 * 파일 위치: src/managers/ColorManager.js

 * 1. 분산된 색상 로직 통합
 * 2. 일관된 색상 관리 시스템 
 */
// 🚩 🔴 🟡 🟢 🔵 🔘 🔥 ⚠️ 🚨 🔔 ☑️ ✅ ✔️ ⚡ 🔥 💡 ✨ 🎯 📊 ⛔ ❌ ⏱️ 🧭 🗺️ 🔄 ⏳ 📌 🗂️ 🔍 💬 🗨️ ▶️ ⏹️
// ================================
// 1. 기본 색상 정의
// ================================

const FIELD_COLORS = {
  MW: '#ff8c00', // 주황색
  IP: '#2ca02c', // 녹색
  교환: '#279fd6', // 하늘색
  전송: '#9467bd', // 보라색
  선로: '#8c564b', // 갈색
  무선: '#51f13c', // 라임색
  기타: '#999999', // 회색
};

const UI_COLORS = {
  ERROR: '#ff4444',
  SUCCESS: '#28a745',
  WARNING: '#ffc107',
  INFO: '#17a2b8',

  // 링크 색상
  LINK_DEFAULT: '#FF8C42',
  LINK_HOVER: '#FF3333',
  LINK_MW_MW: 'black',

  // 노드 테두리
  NODE_BORDER_DEFAULT: '#fff',
  NODE_BORDER_CENTRAL: '#000000',

  // 국사 색상
  GUKSA_FILL: '#0056b3',
  GUKSA_BORDER: '#003366',
};

const SECTOR_COLORS_WITH_BORDER = {
  MW: { FILL: '#ffaa00', BORDER: '#e67700' },
  선로: { FILL: '#ff8833', BORDER: '#cc5500' },
  전송: { FILL: '#ff66cc', BORDER: '#cc0099' },
  IP: { FILL: '#ff3333', BORDER: '#cc0000' },
  무선: { FILL: '#ffcc66', BORDER: '#cc9933' },
  교환: { FILL: '#cc0000', BORDER: '#990000' },
};

// ================================
// 2. ColorManager 클래스
// ================================

class ColorManager {
  constructor() {
    this.fieldColors = FIELD_COLORS;
    this.uiColors = UI_COLORS;
    this.sectorColors = SECTOR_COLORS_WITH_BORDER;
    this.defaultColor = '#999999';

    console.log('🎨 ColorManager 초기화 완료');
  }

  // ================================
  // 3. 장비 관련 색상 메서드
  // ================================

  /**
   * 장비 노드 색상 (기존 getNodeColor 로직 통합)
   */
  getEquipmentNodeColor(equipField) {
    // 1. 직접 매칭
    if (this.fieldColors[equipField]) {
      return this.fieldColors[equipField];
    }

    // 2. 부분 매칭 (기존 추론 로직)
    if (equipField && typeof equipField === 'string') {
      for (const [key, color] of Object.entries(this.fieldColors)) {
        if (equipField.includes(key)) {
          return color;
        }
      }

      // 3. 장비 타입 기반 추론 (기존 로직 유지)
      const equipType = equipField.toUpperCase();
      if (equipType.includes('IP') || equipType.includes('OLT') || equipType.includes('DSLAM')) {
        return this.fieldColors.IP;
      } else if (
        equipType.includes('MSPP') ||
        equipType.includes('SDH') ||
        equipType.includes('WDM')
      ) {
        return this.fieldColors.전송;
      } else if (equipType.includes('MW') || equipType.includes('MICROWAVE')) {
        return this.fieldColors.MW;
      } else if (
        equipType.includes('SWITCH') ||
        equipType.includes('L3') ||
        equipType.includes('L2')
      ) {
        return this.fieldColors.교환;
      } else if (equipType.includes('CABLE') || equipType.includes('FIBER')) {
        return this.fieldColors.선로;
      } else if (
        equipType.includes('BTS') ||
        equipType.includes('RBS') ||
        equipType.includes('RADIO')
      ) {
        return this.fieldColors.무선;
      }
    }

    return this.defaultColor;
  }

  getDarkColor(hex, factor = 0.6) {
    // HEX 색상의 밝기를 조정하는 함수
    if (!hex || typeof hex !== 'string') return '#999999';

    // # 제거
    const cleanHex = hex.replace('#', '');

    // RGB 값 추출
    const num = parseInt(cleanHex, 16);
    if (isNaN(num)) return hex;

    const R = Math.max(0, Math.min(255, Math.floor((num >> 16) * factor)));
    const G = Math.max(0, Math.min(255, Math.floor(((num >> 8) & 0x00ff) * factor)));
    const B = Math.max(0, Math.min(255, Math.floor((num & 0x0000ff) * factor)));

    return '#' + ((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1);
  }

  /**
   * 대시보드 분야 색상 (기존 getSectorColor 로직)
   */
  getDashboardSectorColor(sector) {
    return this.fieldColors[sector] || this.defaultColor;
  }

  // ================================
  // 4. 맵 관련 색상 메서드
  // ================================

  /**
   * 링크 색상 결정
   */
  getLinkColor(sourceField, targetField, isHover = false) {
    // MW-MW 링크는 검은색
    if (sourceField === 'MW' && targetField === 'MW') {
      return this.uiColors.LINK_MW_MW;
    }

    // 일반 링크
    return isHover ? this.uiColors.LINK_HOVER : this.uiColors.LINK_DEFAULT;
  }

  /**
   * 국사 맵용 색상 (fault_d3_map.js용)
   */
  getGuksaMapColor(type, sector = null) {
    if (type === 'guksa') {
      return {
        fill: this.uiColors.GUKSA_FILL,
        border: this.uiColors.GUKSA_BORDER,
      };
    } else if (type === 'equipment' && sector) {
      const sectorColor = this.sectorColors[sector];
      return sectorColor
        ? {
            fill: sectorColor.FILL,
            border: sectorColor.BORDER,
          }
        : {
            fill: this.defaultColor,
            border: this.defaultColor,
          };
    }

    return {
      fill: this.defaultColor,
      border: this.defaultColor,
    };
  }

  /**
   * 노드 테두리 색상
   */
  getNodeBorderColor(isSelected = false, isCentral = false) {
    if (isCentral) {
      return this.uiColors.NODE_BORDER_CENTRAL;
    }
    return this.uiColors.NODE_BORDER_DEFAULT;
  }

  // ================================
  // 5. 호환성 메서드들
  // ================================

  /**
   * 모든 분야 색상 반환 (기존 FIELD_COLORS 대체)
   */
  getAllFieldColors() {
    return { ...this.fieldColors };
  }

  /**
   * 분야별 색상과 테두리 색상 모두 반환
   */
  getSectorWithBorder(sector) {
    return (
      this.sectorColors[sector] || {
        FILL: this.defaultColor,
        BORDER: this.defaultColor,
      }
    );
  }

  /**
   * UI 색상 가져오기
   */
  getUIColor(type) {
    return this.uiColors[type] || this.defaultColor;
  }

  // ================================
  // 6. 색상 변환 유틸리티
  // ================================

  /**
   * HEX to RGB 변환
   */
  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  }

  /**
   * RGB to HEX 변환
   */
  rgbToHex(r, g, b) {
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /**
   * 색상 밝기 조절
   */
  adjustBrightness(hex, factor) {
    const rgb = this.hexToRgb(hex);
    if (!rgb) return hex;

    const r = Math.min(255, Math.max(0, Math.round(rgb.r * factor)));
    const g = Math.min(255, Math.max(0, Math.round(rgb.g * factor)));
    const b = Math.min(255, Math.max(0, Math.round(rgb.b * factor)));

    return this.rgbToHex(r, g, b);
  }

  // ================================
  // 7. 동적 색상 생성
  // ================================

  /**
   * 랜덤 색상 생성 (파스텔 톤)
   */
  generatePastelColor() {
    const hue = Math.floor(Math.random() * 360);
    const saturation = 50 + Math.random() * 30; // 50-80%
    const lightness = 70 + Math.random() * 20; // 70-90%

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }

  /**
   * 대비 색상 생성
   */
  getContrastColor(backgroundColor) {
    const rgb = this.hexToRgb(backgroundColor);
    if (!rgb) return '#000000';

    // 밝기 계산
    const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;

    return brightness > 128 ? '#000000' : '#ffffff';
  }

  // ================================
  // 8. 진단 및 디버깅
  // ================================

  /**
   * 색상 팔레트 정보 반환
   */
  getColorPalette() {
    return {
      fieldColors: this.fieldColors,
      uiColors: this.uiColors,
      sectorColors: this.sectorColors,
      defaultColor: this.defaultColor,
    };
  }

  /**
   * 색상 사용 통계
   */
  getColorStats() {
    return {
      totalFieldColors: Object.keys(this.fieldColors).length,
      totalUIColors: Object.keys(this.uiColors).length,
      totalSectorColors: Object.keys(this.sectorColors).length,
      availableFields: Object.keys(this.fieldColors),
      availableSectors: Object.keys(this.sectorColors),
    };
  }
}

// ================================
// 9. 전역 인스턴스 및 호환성
// ================================

/**
 * 싱글톤 인스턴스 생성
 */
export const colorManager = new ColorManager();
