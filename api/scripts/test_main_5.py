#### 5. 테스트

"""
테스트 메인 모듈 - 통합 테스트 실행

이 모듈은 벡터DB 검색, 장애점 추론, 대화형 응답 기능을
통합적으로 테스트합니다.
"""

import time
from fault_prediction_core_4 import run_query, run_chat_query, GREETING_MESSAGE

# 통합 테스트 코드 - 실제 테스트 실행을 위한 함수
def run_integrated_test():
    """
    통합 테스트를 실행하는 함수
    
    코드 수정 후 즉시 검증을 위한 테스트 함수입니다.
    """
    # 테스트 시작 전 초기화 확인
    print("장애점 추론 시스템 테스트 시작")
    print(f"\n{'-'*50}\n")
    
    # 1. 장애점 찾기 - 단일 쿼리 테스트
    print("1. 장애점 찾기 - 단일 쿼리 테스트")
    print(f"{'-'*30}")
    
    test_queries = [
        "인터넷 끊김 현상이 발생하고 ROADM MUT_LOS 경보가 발생했습니다",
        "OLT Ping 무응답과 Port Down 경보가 감지되었습니다",
        "MSPP STM64_LOS와 AU-AIS 경보가 함께 발생했습니다"
    ]
    
    for i, query in enumerate(test_queries, 1):
        print(f"\n테스트 쿼리 {i}: {query}")
        print(f"{'-'*30}")
        
        # 단일 쿼리 실행
        result = run_query(query, f"test_user_{i}")
        
        # 결과 출력
        print(result)
        
        print("\n처리 완료\n")
    
    print(f"\n{'-'*50}\n")
    
    # 2. 대화형 테스트
    print("2. 대화형 테스트 - 자연스러운 대화 응답")
    print(f"{'-'*30}")
    
    # 테스트 시나리오
    chat_scenarios = [
        # 시나리오 1: 장애 원인 파악
        [
            "OLT 장비에서 경보가 발생했어요",
            "이 장애의 원인은 무엇인가요?",
            "어떻게 해결할 수 있나요?"
        ],
        
        # 시나리오 2: 특정 경보에 대한 조치
        [
            "ROADM MUT_LOS 경보가 발생했습니다",
            "이런 경우 장애점은 어디일까요?",
            "장애를 해결하기 위한 조치방법을 알려주세요"
        ]
    ]
    
    # 각 시나리오별 대화 테스트
    for scenario_idx, scenario in enumerate(chat_scenarios, 1):
        print(f"\n대화 시나리오 {scenario_idx}")
        print(f"{'-'*30}")
        
        # 고유한 사용자 ID 생성
        chat_user_id = f"chat_test_user_{scenario_idx}"
        
        # 시나리오의 각 턴마다 대화 실행
        for turn_idx, query in enumerate(scenario, 1):
            print(f"\n[사용자 턴 {turn_idx}]: {query}")
            
            # 대화형 쿼리 실행
            chat_result = run_chat_query(query, chat_user_id)
            
            # 전체 결과 출력
            print("\n[시스템 응답]:")
            print(chat_result)
        
        print("\n대화 시나리오 완료\n")
    
    print("\n모든 테스트가 완료되었습니다.")

# 이 모듈이 직접 실행될 때 테스트 실행
if __name__ == "__main__":
    run_integrated_test()