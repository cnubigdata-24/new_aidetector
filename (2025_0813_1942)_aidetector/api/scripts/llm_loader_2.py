"""
LLM 모델 로딩 모듈 - 초기 1회만 로드되고 파이프라인을 전역 재사용
"""

import torch
import time
from transformers import AutoTokenizer, AutoModelForCausalLM, pipeline
from functools import lru_cache

# ✅ 글로벌 파이프라인 변수 (직접 사용은 금지, 내부에서만 관리)
_global_llm_pipe = None

# LLM 초기화 상태 관리용 전역 변수
_llm_initialized = False
_llm_initializing = False
_llm_init_error = None


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


def get_llm_initialization_status():
    """LLM 초기화 상태를 반환하는 함수"""
    global _llm_initialized, _llm_initializing, _llm_init_error

    return {
        'initialized': _llm_initialized,
        'initializing': _llm_initializing,
        'error': _llm_init_error
    }


def initialize_llm_background(model_name="EleutherAI/polyglot-ko-1.3b"):
    """
    백그라운드에서 LLM 파이프라인을 초기화하는 함수 (스레드 안전)
    """
    global _llm_initialized, _llm_initializing, _llm_init_error, _global_llm_pipe

    if _llm_initialized or _llm_initializing:
        return True

    _llm_initializing = True
    _llm_init_error = None

    try:
        print("🚀 [LLM] 백그라운드 모델 로딩 시작...")
        start = time.time()

        if _global_llm_pipe is not None:
            print("✅ [LLM] 기존 모델 파이프라인 재사용")
            _llm_initialized = True
            return True

        tokenizer = AutoTokenizer.from_pretrained(model_name)
        model = AutoModelForCausalLM.from_pretrained(
            model_name,
            torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
            device_map="auto" if torch.cuda.is_available() else None,
        )

        pipe = pipeline(
            "text-generation", model=model, tokenizer=tokenizer
        )

        _global_llm_pipe = pipe
        _llm_initialized = True

        elapsed = time.time() - start
        print(f"✅ [LLM] 백그라운드 모델 로딩 완료! (소요 시간: {elapsed:.2f}초)")
        return True

    except Exception as e:
        print(f"❌ [LLM] 백그라운드 초기화 중 오류 발생: {str(e)}")
        _llm_init_error = str(e)
        return False
    finally:
        _llm_initializing = False


def initialize_llm(model_name="EleutherAI/polyglot-ko-1.3b"):
    """
    애플리케이션 시작 시 LLM 파이프라인을 초기화하는 함수 (기존 호환성 유지)
    """
    global _llm_initialized

    # 이미 초기화되었으면 즉시 성공 반환
    if _llm_initialized:
        print("✅ [LLM] 이미 초기화됨 - 즉시 사용 가능")
        return True

    # 아직 초기화되지 않았으면 동기적으로 초기화
    return initialize_llm_background(model_name)


@lru_cache(maxsize=1)
def get_llm_pipeline():
    """
    외부에서 사용하는 LLM 파이프라인 제공 함수 (자동 초기화 포함)

    Returns:
        transformers.pipeline: LLM 텍스트 생성용 파이프라인
    """
    global _llm_initialized, _global_llm_pipe

    # 초기화가 완료되지 않았으면 자동 초기화
    if not _llm_initialized:
        initialize_llm_background()

    return _global_llm_pipe


# 독립 실행 시 테스트용
if __name__ == "__main__":
    initialize_llm()
    print("✅ LLM 모듈 테스트 완료")
