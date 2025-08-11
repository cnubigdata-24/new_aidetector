/**
 * 파일 위치: src/core/ModuleLoader.js
 */

export class ModuleLoader {
  constructor() {
    this.loadedModules = new Map();
    this.dependencies = new Map();
    this.loadPromises = new Map();
    this.isInitialized = false;
  }

  // 모듈 의존성 정의
  defineDependencies() {
    this.dependencies.set('CommonUtils', []);
    this.dependencies.set('ColorManager', ['CommonUtils']);
    this.dependencies.set('MessageManager', ['CommonUtils']);
    this.dependencies.set('StateManager', ['CommonUtils']);
    this.dependencies.set('TooltipManager', ['CommonUtils', 'ColorManager']);
    this.dependencies.set('DashboardComponent', ['CommonUtils', 'ColorManager', 'StateManager']);
    this.dependencies.set('EquipmentMapComponent', [
      'CommonUtils',
      'ColorManager',
      'TooltipManager',
      'StateManager',
    ]);
    this.dependencies.set('GuksaMapComponent', [
      'CommonUtils',
      'ColorManager',
      'TooltipManager',
      'StateManager',
    ]);
    this.dependencies.set('FaultDashboardApp', ['*']); // 모든 모듈 의존
  }

  // 단일 모듈 로드
  async loadModule(moduleName) {
    // 이미 로드된 경우 캐시된 모듈 반환
    if (this.loadedModules.has(moduleName)) {
      return this.loadedModules.get(moduleName);
    }

    // 로딩 중인 경우 Promise 반환
    if (this.loadPromises.has(moduleName)) {
      return this.loadPromises.get(moduleName);
    }

    console.log(`📦 모듈 로딩 시작: ${moduleName}`);

    // 의존성 먼저 로드
    const deps = this.dependencies.get(moduleName) || [];
    if (deps.includes('*')) {
      // 모든 모듈 의존성인 경우 (FaultDashboardApp)
      await this.loadAllModules();
    } else {
      for (const dep of deps) {
        await this.loadModule(dep);
      }
    }

    // 모듈 로드 Promise 생성
    const loadPromise = this.importModule(moduleName);
    this.loadPromises.set(moduleName, loadPromise);

    try {
      const module = await loadPromise;
      this.loadedModules.set(moduleName, module);
      console.log(`✅ 모듈 로딩 완료: ${moduleName}`);
      return module;
    } catch (error) {
      console.error(`❌ 모듈 로딩 실패: ${moduleName}`, error);
      this.loadPromises.delete(moduleName);
      throw error;
    }
  }

  // 실제 모듈 import 수행 - 단순화된 경로
  async importModule(moduleName) {
    const modulePaths = {
      CommonUtils: '/static/js/core/CommonUtils.js',
      ColorManager: '/static/js/core/ColorManager.js',
      MessageManager: '/static/js/core/MessageManager.js',
      StateManager: '/static/js/core/StateManager.js',
      TooltipManager: '/static/js/core/TooltipManager.js',
      DashboardComponent: '/static/js/core/DashboardComponent.js',
      EquipmentMapComponent: '/static/js/core/EquipmentMapComponent.js',
      GuksaMapComponent: '/static/js/core/GuksaMapComponent.js',
      FaultDashboardApp: '/static/js/core/FaultDashboardApp.js',
    };

    const modulePath = modulePaths[moduleName];
    if (!modulePath) {
      console.warn(`⚠️ 모듈 경로 없음: ${moduleName}`);
      return null;
    }

    try {
      const module = await import(modulePath);
      return module;
    } catch (error) {
      console.warn(`⚠️ 모듈 로드 실패: ${moduleName}`, error.message);
      return null;
    }
  }

  /**
   * 모든 모듈 로드 (의존성 순서대로)
   */
  async loadAllModules() {
    const loadOrder = [
      'CommonUtils',
      'ColorManager',
      'MessageManager',
      'StateManager',
      'TooltipManager',
      'DashboardComponent',
      'EquipmentMapComponent',
      'GuksaMapComponent',
    ];

    console.log('🚀 모든 모듈 로딩 시작...');

    for (const moduleName of loadOrder) {
      try {
        await this.loadModule(moduleName);
      } catch (error) {
        console.warn(`⚠️ ${moduleName} 로딩 실패, 건너뜀:`, error.message);
      }
    }

    console.log('✅ 모든 모듈 로딩 완료');
    return this.loadedModules;
  }

  // 로드된 모듈 가져오기
  getModule(moduleName) {
    return this.loadedModules.get(moduleName);
  }

  // 모든 로드된 모듈 가져오기
  getAllModules() {
    return Object.fromEntries(this.loadedModules);
  }

  // 모듈 시스템 초기화
  async initialize() {
    if (this.isInitialized) {
      console.log('✅ 모듈 시스템이 이미 초기화되었습니다.');
      return;
    }

    console.log('🔧 모듈 시스템 초기화 시작...');

    // 의존성 정의
    this.defineDependencies();

    // 기본 모듈들 로드
    await this.loadAllModules();

    // 기존 시스템과의 호환성 설정
    this.setupLegacyCompatibility();

    this.isInitialized = true;
    console.log('✅ 모듈 시스템 초기화 완료');

    return this.getAllModules();
  }

  // 기존 시스템과의 호환성 보장
  setupLegacyCompatibility() {
    // 전역 네임스페이스 생성
    if (typeof window !== 'undefined') {
      window.FaultDashboard = window.FaultDashboard || {};
      window.FaultDashboard.modules = this.getAllModules();
      window.FaultDashboard.moduleLoader = this;

      console.log('🔗 기존 시스템과의 호환성 설정 완료');
    }
  }

  // 핫 리로드 지원 (개발용)
  async reloadModule(moduleName) {
    console.log(`🔄 모듈 리로드: ${moduleName}`);

    // 캐시 삭제
    this.loadedModules.delete(moduleName);
    this.loadPromises.delete(moduleName);

    // 재로드
    return await this.loadModule(moduleName);
  }

  // 모듈 상태 진단
  getDiagnostics() {
    const diagnostics = {
      isInitialized: this.isInitialized,
      loadedModulesCount: this.loadedModules.size,
      loadedModules: Array.from(this.loadedModules.keys()),
      pendingLoads: Array.from(this.loadPromises.keys()),
      dependencies: Object.fromEntries(this.dependencies),
    };

    console.table(diagnostics.loadedModules);
    return diagnostics;
  }
}

// 싱글톤 인스턴스 생성 및 export
export const moduleLoader = new ModuleLoader();

// 전역 접근을 위한 window 등록
if (typeof window !== 'undefined') {
  window.moduleLoader = moduleLoader;
}

/**
 * 사용 예시:
 *
 * // 기본 사용법
 * import { moduleLoader } from './src/core/ModuleLoader.js';
 * await moduleLoader.initialize();
 *
 * // 특정 모듈만 로드
 * const colorManager = await moduleLoader.loadModule('ColorManager');
 *
 * // 로드된 모듈 사용
 * const modules = moduleLoader.getAllModules();
 *
 * // 진단 정보
 * moduleLoader.getDiagnostics();
 */
