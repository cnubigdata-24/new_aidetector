"""
LLM 모델 로딩 모듈 - 초기 1회만 로드되고 파이프라인을 전역 재사용
"""

import torch
import time
from transformers import AutoTokenizer, AutoModelForCausalLM, pipeline
from functools import lru_cache

# ✅ 글로벌 파이프라인 변수 (직접 사용은 금지, 내부에서만 관리)
_global_llm_pipe = None


def _load_llm_pipeline(model_name="EleutherAI/polyglot-ko-1.3b"):
    """
    내부용: LLM 파이프라인을 로딩하는 함수. 전역 변수에 저장.

    Args:
        model_name (str): 사용할 모델명

    Returns:
        transformers.pipeline: 텍스트 생성용 파이프라인
    """
    global _global_llm_pipe

    if _global_llm_pipe is not None:
        print("✅ [LLM] 기존 모델 파이프라인 재사용")
        return _global_llm_pipe

    print("🚀 [LLM] 모델 로딩 중...")

    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
        device_map="auto" if torch.cuda.is_available() else None,
    )

    pipe = pipeline(
        "text-generation", model=model, tokenizer=tokenizer  # ✅ device 제거
    )

    _global_llm_pipe = pipe
    print("✅ [LLM] 모델 로딩 완료!")

    return pipe


def initialize_llm(model_name="EleutherAI/polyglot-ko-1.3b"):
    """
    애플리케이션 시작 시 LLM 파이프라인을 초기화하는 함수 (명시적 초기화)
    """
    start = time.time()
    _load_llm_pipeline(model_name)
    print(f"✅ [LLM] 초기화 완료 (소요 시간: {time.time() - start:.2f}초)")


@lru_cache(maxsize=1)
def get_llm_pipeline():
    """
    외부에서 사용하는 LLM 파이프라인 제공 함수 (자동 초기화 포함)

    Returns:
        transformers.pipeline: LLM 텍스트 생성용 파이프라인
    """
    return _load_llm_pipeline()


# 독립 실행 시 테스트용
if __name__ == "__main__":
    initialize_llm()
    print("✅ LLM 모듈 테스트 완료")
