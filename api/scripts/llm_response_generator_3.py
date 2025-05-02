"""
### 3. LLM 응답 생성 모듈 - LLM을 사용하여 질문에 답변 생성
"""

import time
from typing import List, Dict, Any

# LLM 파이프라인 가져오기
from api.scripts.llm_loader_2 import get_llm_pipeline

def generate_response_with_llm(query: str, retrieved_results: list, user_query_type: str = "general", max_tokens: int = 256):
    import textwrap

    start_time = time.time()
    pipe = get_llm_pipeline()

    # 문맥 정리
    context_blocks = []
    for i, result in enumerate(retrieved_results[:3]):
        meta = result["metadata"]
        block = textwrap.dedent(f"""\
        [사례 {i+1}]
        - 장애번호: {meta.get('장애번호', '알 수 없음')}
        - 장애명: {meta.get('장애명', '알 수 없음')}
        - 장애분야: {meta.get('장애분야', '알 수 없음')}
        - 장애점: {meta.get('장애점', '알 수 없음')}
        - 경보현황: {meta.get('경보현황', '')[:150]}...
        - 장애분석: {meta.get('장애분석', '없음')}
        - 조치내역: {meta.get('조치내역', '기록 없음')}
        """)
        context_blocks.append(block)

    case_summary = "\n".join(context_blocks)

    # 질문 유형에 따른 지시문
    type_instruction = {
        "cause": "해당 장애의 근본 원인을 설명하세요. 유사 사례에서 어떤 원인들이 있었는지도 함께 기술하세요.",
        "solution": "유사 장애에서 사용된 조치 방법과 해결 절차를 기술하세요.",
        "location": "해당 장애가 어떤 장비 또는 위치에서 발생하는지 판단하고 근거를 제시하세요.",
        "general": "유사 사례를 바탕으로 전체적인 상황을 분석하고 설명하세요."
    }

    # 최종 프롬프트 구성
    final_prompt = textwrap.dedent(f"""\
    당신은 통신 네트워크 장애 분석 전문가입니다.

    아래는 과거 장애 사례입니다:
    {case_summary}

    사용자 질문:
    {query}

    지시사항:
    {type_instruction.get(user_query_type, type_instruction['general'])}

    전문가로서 문장을 반복하지 말고, 정확하고 간결하게 응답하세요.
    """)

    # 모델 호출
    result = pipe(final_prompt, max_new_tokens=max_tokens, do_sample=False, temperature=0.3)

    # 결과 추출
    generated_text = result[0]["generated_text"]

    # "답변:" 이후의 내용만 잘라냄
    if "답변:" in generated_text:
        answer = generated_text.split("답변:")[-1].strip()
    else:
        # fallback: 프롬프트를 제거
        answer = generated_text.replace(final_prompt, "").strip()

    print(f"LLM 응답 생성 완료 (소요시간: {time.time() - start_time:.2f}초)")
    return answer

# 질문 유형 분석 함수
def analyze_query_type(query: str) -> str:
    """
    질문 유형을 분석하는 함수
    
    Args:
        query: 사용자 질문
        
    Returns:
        str: 질문 유형 (cause, solution, location, general)
    """
    if any(keyword in query for keyword in ["원인", "이유", "왜"]):
        return "cause"
    elif any(keyword in query for keyword in ["조치", "해결", "어떻게", "방법"]):
        return "solution"
    elif any(keyword in query for keyword in ["장애점", "어디", "위치"]):
        return "location"
    return "general"

# 챗봇 대화 함수
def chat_with_telecom_assistant(query: str, user_id: str = "default_user"):
    """통신장비 장애 지원 챗봇 대화 인터페이스 - LLM 통합 버전"""
    start_time = time.time()

    # 간단한 명령어 처리
    if query.lower() in ["안녕", "hi", "hello"]:
        return "안녕하세요! 통신장비 장애 지원 시스템입니다. 장애 현상이나 경보를 알려주시면 유사한 장애점을 찾아드립니다."

    if query.lower() in ["도움말", "help"]:
        return """
        <통신장비 장애 지원 시스템 도움말>
        1. 장애 현상이나 경보 코드를 입력하면 유사한 장애점을 추론해 드립니다.
        2. 경보 코드(예: MUT_LOS, STM64_LOS)가 포함된 질문이 더 정확한 결과를 얻을 수 있습니다.
        3. '대화 기록 삭제'를 입력하면 이전 대화 내용을 초기화합니다.
        """

    # 벡터DB 컬렉션 접근 및 쿼리 실행 함수 (이 모듈에서는 구현 생략)
    # sorted_results = execute_query(collection, query)
    
    # 질문 유형 분석
    query_type = analyze_query_type(query)
    
    # 여기서는 예시 응답만 반환
    return f"질문 '{query}'에 대한 응답을 생성합니다. (질문 유형: {query_type})\n실제 구현시에는 벡터DB에서 관련 문서를 검색하고 LLM으로 답변을 생성합니다."

if __name__ == "__main__":
    print("LLM 응답 생성 모듈 로딩 완료")
    test_query = "광케이블 장애가 발생했을 때 해결 방법은?"
    print(f"테스트 질문: {test_query}")
    print(f"질문 유형: {analyze_query_type(test_query)}")
    print("실제 응답 생성은 전체 시스템 연동 시 수행됩니다.")