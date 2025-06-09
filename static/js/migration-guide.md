# StateManager 일원화 마이그레이션 가이드

## 📋 개요

현재 시스템의 전역 `window` 사용을 `StateManager`로 일원화하여 더 나은 상태 관리와 유지보수성을 확보하는 방안입니다.

## 🎯 마이그레이션 목표

- **일관성**: 모든 상태를 StateManager를 통해 관리
- **추적성**: 상태 변경 히스토리 및 디버깅 지원
- **확장성**: 새로운 상태 추가 시 체계적 관리
- **하위 호환성**: 기존 코드 동작 보장

## 🔄 단계별 마이그레이션 계획

### 1단계: 준비 (완료)

- ✅ StateManager에 전역 함수 관리 기능 추가
- ✅ 하위 호환성을 위한 Proxy 설정
- ✅ 자동 마이그레이션 도구 구현
- ✅ CommonUtils, MessageManager StateManager 우선 사용

### 2단계: 핵심 상태 마이그레이션 (진행중)

```javascript
// 이전 방식
window._totalAlarmDataList = data;
window._selectedSector = 'IP';

// 새 방식 (StateManager 우선)
if (window.StateManager) {
  StateManager.setAlarmData(data);
  StateManager.setSelectedSector('IP');
} else {
  // 하위 호환성
  window._totalAlarmDataList = data;
  window._selectedSector = 'IP';
}
```

### 3단계: 함수 호출 마이그레이션

```javascript
// 이전 방식
window.formatDateTime(date);

// 새 방식 (StateManager를 통한 호출)
if (window.StateManager) {
  StateManager.callFunction('formatDateTime', date);
} else {
  window.formatDateTime(date);
}
```

### 4단계: 이벤트 기반 반응형 시스템

```javascript
// StateManager 이벤트 리스너
StateManager.on('totalAlarmDataList', (data) => {
  console.log('알람 데이터 변경:', data.value.length);
  // 자동 UI 업데이트
});
```

## 🛠️ 실행 방법

### 자동 마이그레이션 실행

```javascript
// 브라우저 콘솔에서
StateManagerUtils.migrate();

// 또는 URL 파라미터로
//localhost:5000?migrate=true

// 또는 로컬스토리지 설정
http: localStorage.setItem('stateManagerAutoMigrate', 'true');
```

### 마이그레이션 통계 확인

```javascript
StateManagerUtils.stats();
StateManagerUtils.getFunctionStats();
```

## 📊 현재 마이그레이션 상태

### 완료된 영역

- ✅ **StateManager 핵심 기능**: 상태 관리, 이벤트 시스템
- ✅ **CommonUtils**: StateManager 우선 사용 방식 적용
- ✅ **MessageManager**: StateManager 통합 지원
- ✅ **전역 변수 동기화**: Proxy를 통한 하위 호환성
- ✅ **fault_detector.js**: faultData StateManager 우선 사용

### 남은 작업

- 🔄 **TooltipManager**: window 사용 → StateManager 전환
- 🔄 **table-resizer.js**: 전역 변수 → StateManager 전환
- 🔄 **EquipmentMapComponent**: 추가 최적화
- 🔄 **다른 컴포넌트들**: 점진적 전환

## 🔧 개발자 도구

### StateManager 유틸리티

```javascript
// 전체 상태 조회
StateManager.getStats();

// 함수 호출 통계
StateManager.getGlobalFunctionStats();

// 상태 변경 히스토리
StateManager.history;

// 등록된 함수 목록
StateManager.functions;

// 상태 검증
StateManager.validate();
```

### 디버깅 도구

```javascript
// 전역 함수 호출 추적 활성화
StateManager.enableGlobalFunctionTracking();

// 특정 상태 감시
StateManager.on('totalAlarmDataList', console.log);
```

## ⚠️ 주의사항

### 하위 호환성

- 기존 `window._totalAlarmDataList` 접근은 계속 동작
- StateManager 우선, 실패 시 기존 방식 fallback
- 점진적 전환으로 안정성 확보

### 성능 고려사항

- StateManager는 싱글톤으로 메모리 효율적
- 이벤트 기반으로 불필요한 업데이트 최소화
- 히스토리 크기 제한으로 메모리 관리

### 테스트 권장사항

- 마이그레이션 후 모든 기능 테스트
- 브라우저 콘솔에서 오류 확인
- 성능 모니터링

## 🚀 향후 계획

### 단기 (1-2주)

1. 남은 컴포넌트 마이그레이션 완료
2. 전체 시스템 테스트
3. 성능 최적화

### 중기 (1개월)

1. TypeScript 적용 검토
2. 상태 관리 고도화
3. 개발자 경험 개선

### 장기 (3개월)

1. 마이크로프론트엔드 아키텍처 검토
2. 상태 지속성 개선
3. 테스트 자동화

## 📞 지원

마이그레이션 중 문제가 발생하면:

1. 브라우저 콘솔 오류 확인
2. `StateManagerUtils.validate()` 실행
3. 필요시 `localStorage.removeItem('stateManagerAutoMigrate')` 후 새로고침

---

**결론**: StateManager 일원화는 시스템의 안정성과 유지보수성을 크게 향상시킬 것으로 예상됩니다. 단계적 접근으로 리스크를 최소화하면서 진행하시기 바랍니다.
