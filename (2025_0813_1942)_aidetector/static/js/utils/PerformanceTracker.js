/**
 * 성능 추적 유틸리티
 */
class PerformanceTracker {
  constructor() {
    this.measurements = new Map();
    this.isEnabled = true;
  }

  // 측정 시작
  start(label) {
    if (!this.isEnabled) return;

    this.measurements.set(label, {
      startTime: performance.now(),
      startMemory: performance.memory ? performance.memory.usedJSHeapSize : 0,
    });

    console.log(`🚀 [PERF] ${label} - 시작`);
  }

  // 측정 종료
  end(label) {
    if (!this.isEnabled) return;

    const measurement = this.measurements.get(label);
    if (!measurement) {
      console.warn(`⚠️ [PERF] ${label} - 시작 측정이 없습니다`);
      return;
    }

    const endTime = performance.now();
    const duration = endTime - measurement.startTime;
    const endMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;
    const memoryDelta = endMemory - measurement.startMemory;

    // 블로킹 임계값 (16ms = 60fps)
    const isBlocking = duration > 16;
    const icon = isBlocking ? '🔴' : '🟢';

    console.log(
      `${icon} [PERF] ${label} - 완료: ${duration.toFixed(2)}ms${
        memoryDelta > 0 ? ` (+${(memoryDelta / 1024 / 1024).toFixed(2)}MB)` : ''
      }`
    );

    if (isBlocking) {
      console.warn(`⚠️ [PERF] ${label} - UI 블로킹 발생! (${duration.toFixed(2)}ms > 16ms)`);
    }

    this.measurements.delete(label);
    return { duration, memoryDelta, isBlocking };
  }

  // 함수 실행 시간 측정
  measure(label, fn) {
    this.start(label);
    const result = fn();
    this.end(label);
    return result;
  }

  // 비동기 함수 실행 시간 측정
  async measureAsync(label, fn) {
    this.start(label);
    const result = await fn();
    this.end(label);
    return result;
  }

  // 모든 측정 결과 출력
  report() {
    console.log('📊 [PERF] 성능 측정 리포트:', this.measurements);
  }

  // 성능 측정 활성화/비활성화
  toggle(enabled = !this.isEnabled) {
    this.isEnabled = enabled;
    console.log(`📊 [PERF] 성능 측정 ${enabled ? '활성화' : '비활성화'}`);
  }
}

// 전역 인스턴스 생성
export const performanceTracker = new PerformanceTracker();
