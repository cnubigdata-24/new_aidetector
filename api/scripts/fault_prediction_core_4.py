"""
장애 예측 핵심 모듈: 유사 장애사례를 찾고 장애점 및 조치사항을 추론 (메인 클래스)
"""

import os
import time
import re
import json
import asyncio
import aiohttp
import logging
import chromadb
from chromadb.utils import embedding_functions
from datetime import datetime
from functools import lru_cache
from rapidfuzz import process, fuzz
from typing import Dict, List, Tuple, Any, Optional, Set, Union
import copy

# 유틸리티 모듈 임포트
from .fault_prediction_utils import (
    normalize_text,
    extract_alert_codes_cached,
    clean_alert_message,
    identify_field_from_keywords,
    analyze_equipment_mentions,
    check_specialized_patterns,
)

# 경보 패턴 분석 전용 클래스 임포트
from .fault_prediction_pattern_analyzer import FaultPatternAnalyzer

# 상수 로드
from .fault_prediction_constants import (
    DEFAULT_PROMPT_START_MESSAGE,
    FIELD_KEYWORDS,
    EQUIPMENT_KEYWORDS,
    ALERT_TYPE_KEYWORDS
)

# 상수 정의 - 파일 최상단에 추가
ERROR_DB_ACCESS = "VECTOR_DB_ACCESS_ERROR"

# 분야 매핑 상수 추가
FIELD_MAPPING = {
    "전송": ["전송", "전송 분야"],
    "MW": ["MW", "M/W", "마이크로 웨이브", "마이크로웨이브", "M/W 페이딩", "MW 페이딩"],
    "IP": ["IP", "IP 코어", "IP 액세스"],
    "교환": ["교환", "교환 분야"],
    "무선": ["무선", "무선 분야"],
    "선로": ["선로", "케이블", "선로분야"],
    "전원": ["전원"]
}

# 역방향 매핑 (chroma db의 분야 -> 표준 분야)
DB_FIELD_TO_STANDARD = {}
for standard_field, variants in FIELD_MAPPING.items():
    for variant in variants:
        DB_FIELD_TO_STANDARD[variant] = standard_field

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# 상수 정의
API_BASE_URL = "http://localhost:80/api"
VECTOR_DB_DIR = "./chroma_db"
VECTOR_DB_NEW_DIR = "./chroma_db_new"

EMBEDDING_MODEL = "intfloat/multilingual-e5-base"

HTML_NBSP_3 = "&nbsp&nbsp&nbsp"

# 전역 변수
_guksa_id = ''
_vector_search_cache = {}
_VECTOR_CACHE_SIZE = 50
_VECTOR_CACHE_EXPIRY = 3600  # 1시간
_collection_instance = None

# 벡터DB 초기화 상태 관리용 전역 변수
_vector_db_initialized = False
_vector_db_initializing = False
_vector_db_init_error = None


def reset_vector_db_cache():
    """벡터DB 캐시를 초기화하는 함수"""
    global _collection_instance, _vector_db_initialized, _vector_db_initializing, _vector_db_init_error, _vector_search_cache

    logger.info("벡터DB 캐시 초기화 중...")
    _collection_instance = None
    _vector_db_initialized = False
    _vector_db_initializing = False
    _vector_db_init_error = None
    _vector_search_cache.clear()
    logger.info("벡터DB 캐시 초기화 완료")


# 경보 패턴 분석기 인스턴스
_pattern_analyzer = None


def get_pattern_analyzer():
    """경보 패턴 분석기 인스턴스를 가져오는 함수 (싱글톤 패턴)"""
    global _pattern_analyzer
    if _pattern_analyzer is None:
        _pattern_analyzer = FaultPatternAnalyzer()
    return _pattern_analyzer

# 유틸리티 함수


def set_guksa_id(guksa_id):
    """국사 ID 설정 함수"""
    global _guksa_id
    _guksa_id = guksa_id
    return guksa_id


def get_guksa_id():
    """국사 ID 조회 함수"""
    global _guksa_id
    return _guksa_id


def extract_fields_from_query(query):
    """경보 내역에서 분야를 추출하는 함수"""
    found_fields = set()
    query_lower = query.lower()

    # 각 분야의 키워드들을 확인
    for standard_field, variants in FIELD_MAPPING.items():
        for variant in variants:
            if variant.lower() in query_lower:
                found_fields.add(standard_field)
                break  # 해당 분야에서 하나라도 찾으면 다음 분야로

    # FIELD_KEYWORDS도 활용하여 추가 검색
    for field, keywords in FIELD_KEYWORDS.items():
        if field in FIELD_MAPPING:  # 매핑된 분야만 처리
            for keyword in keywords:
                if keyword.lower() in query_lower:
                    found_fields.add(field)
                    break

    return list(found_fields)


def create_field_filter(detected_fields):
    """감지된 분야들에 대한 chroma db 필터 조건 생성"""
    if not detected_fields:
        return None

    # 각 분야의 모든 변형을 포함하는 필터 조건 생성
    all_field_variants = set()
    for field in detected_fields:
        if field in FIELD_MAPPING:
            all_field_variants.update(FIELD_MAPPING[field])

    # chroma db 필터 조건 생성 (OR 조건)
    if len(all_field_variants) == 1:
        return {"장애분야": {"$eq": list(all_field_variants)[0]}}
    else:
        return {"장애분야": {"$in": list(all_field_variants)}}


def log_field_filtering_info(query, detected_fields, filter_condition):
    """분야 필터링 정보를 로깅"""
    if detected_fields:
        logger.info(f"경보 내역에서 감지된 분야: {', '.join(detected_fields)}")
        logger.info(f"chroma db 필터 조건: {filter_condition}")
    else:
        logger.info("경보 내역에서 특정 분야가 감지되지 않아 전체 사례를 검색합니다.")

# 비동기 외부 API 통신 함수들


async def fetch_external_info_all_async(endpoint: str, method: str = "post", data: dict = None):
    """특정 endpoint에 대해 전체 응답을 반환하는 비동기 함수"""
    try:
        url = f"{API_BASE_URL}/{endpoint}"
        timeout = aiohttp.ClientTimeout(total=2, connect=1)

        async with aiohttp.ClientSession(timeout=timeout) as session:
            if method.lower() == "post":
                async with session.post(url, json=data) as response:
                    if response.status != 200:
                        return {}
                    json_data = await response.json()
            else:
                async with session.get(url) as response:
                    if response.status != 200:
                        return {}
                    json_data = await response.json()

            return json_data.get("response", json_data)

    except (aiohttp.ClientError, KeyError, json.JSONDecodeError, asyncio.TimeoutError) as e:
        logger.warning(f"외부 API 호출 오류: {endpoint} - {str(e)}")
        return {}


async def fetch_external_info_async(endpoint: str, key: str, method: str = "post", data: dict = None):
    """비동기 외부 API 호출 - 특정 키 값만 반환"""
    try:
        url = f"{API_BASE_URL}/{endpoint}"
        timeout = aiohttp.ClientTimeout(total=2, connect=1)

        async with aiohttp.ClientSession(timeout=timeout) as session:
            if method.lower() == "post":
                async with session.post(url, json=data) as response:
                    if response.status != 200:
                        return 0
                    json_data = await response.json()
            else:
                async with session.get(url) as response:
                    if response.status != 200:
                        return 0
                    json_data = await response.json()

            return json_data["response"].get(key, 0) if "response" in json_data else json_data.get(key, 0)

    except (aiohttp.ClientError, KeyError, json.JSONDecodeError, asyncio.TimeoutError) as e:
        logger.warning(f"외부 API 키 조회 오류: {endpoint}/{key} - {str(e)}")
        return 0


async def fetch_external_factors_async(guksa_id=None):
    """외부 요인 정보를 가져오는 비동기 함수 - MW 페이딩, 전원 상태, 케이블 상태"""
    gid = guksa_id or get_guksa_id()

    # 모든 API 호출을 동시에 실행
    tasks = [
        fetch_external_info_all_async("mw_info", "post", {"guksa_id": gid}),
        fetch_external_info_async(
            "cable_status", "unrecovered_alarm", "get", {"guksa_id": gid})
    ]

    results = await asyncio.gather(*tasks)
    mw_info, cable_damage_count = results

    fading_count = mw_info.get("fading_count", 0)
    power_outage_count = mw_info.get("battery_mode_count", 0)

    return {
        "fading_count": fading_count,
        "power_outage_count": power_outage_count,
        "cable_damage_count": cable_damage_count
    }

# 메인 쿼리 함수


async def run_query(mode, query, user_id="default_user"):
    """사용자 쿼리를 처리하여 유사 장애사례를 검색하고 종합 의견을 생성하는 메인 함수 (비동기 버전)"""
    start_time = time.time()
    step_times = {}  # 단계별 처리시간 추적

    # 벡터 DB 컬렉션 가져오기
    collection_start = time.time()
    collection, error = get_vector_db_collection()
    step_times['collection_load'] = time.time() - collection_start

    if error:
        # 오류 타입으로 비교
        error_msg = error["message"] if isinstance(error, dict) else str(error)
        error_type = error.get("type") if isinstance(error, dict) else None

        # 벡터DB 접근 오류인 경우
        if error_type == ERROR_DB_ACCESS:
            opinion_msg = f"❌ 오류: {error_msg}"
        else:
            opinion_msg = f"❌ 오류: 시스템 오류가 발생했습니다: {error_msg}"

        return {
            "opinion": opinion_msg,
            "summary": [],
            "details": [],
            "processing_time": 0,
            "error": error_msg
        }

    # 프롬프트 시작 메시지 추가
    if not query.startswith(DEFAULT_PROMPT_START_MESSAGE):
        query = DEFAULT_PROMPT_START_MESSAGE + query

    # 병렬로 벡터 검색 및 외부 요인 가져오기
    external_factors_task = fetch_external_factors_async(get_guksa_id())

    # 하이브리드 검색 수행 (벡터 + 키워드 + 패턴)
    search_start = time.time()
    sorted_results, search_results = await hybrid_search_async(query, collection)
    step_times['hybrid_search'] = time.time() - search_start

    # 외부 요인 결과 기다리기
    external_start = time.time()
    external_factors = await external_factors_task
    step_times['external_factors'] = time.time() - external_start

    # 결과가 없을 경우 처리
    if not sorted_results:
        return json.dumps({
            "error": "입력하신 내용과 유사한 장애 사례를 찾을 수 없습니다. 더 구체적인 장애 상황이나 경보(알람,로그) 내역을 입력해 주세요."
        }, ensure_ascii=False)

    # 상위 결과 추출
    top_results = sorted_results[:3]

    # 결과 데이터 구성 - 먼저 실행하여 신뢰도 확보
    processing_start = time.time()
    summary_rows = build_summary_rows(top_results)
    details = build_details(top_results)

    # 장애점 추론 2 - 유사 사례 기반 (먼저 수행하여 추론1과 비교에 사용)
    fault_infer_2 = predict_fault_real_cases(top_results)

    # 장애점 추론 1 - 경보/증상 패턴 기반 (패턴 분석기 사용)
    pattern_analyzer = get_pattern_analyzer()
    fault_infer_1 = await pattern_analyzer.predict_fault_patterns(query, top_results, external_factors, fault_infer_2)
    step_times['inference'] = time.time() - processing_start

    # 종합 의견 생성
    opinion_start = time.time()
    comprehensive_opinion = await generate_brief_async(
        query, top_results, external_factors, fault_infer_1, fault_infer_2
    )
    step_times['opinion_generation'] = time.time() - opinion_start

    total_time = time.time() - start_time

    # 성능 로깅 (5초 이상일 때만)
    if total_time > 5.0:
        logger.warning(f"⚠️ 느린 쿼리 감지 (총 {total_time:.1f}초): " +
                       f"컬렉션로드: {step_times['collection_load']:.1f}s, " +
                       f"검색: {step_times['hybrid_search']:.1f}s, " +
                       f"추론: {step_times['inference']:.1f}s, " +
                       f"의견생성: {step_times['opinion_generation']:.1f}s")

    # 결과 JSON 구성
    result_dict = {
        "opinion": comprehensive_opinion,
        "summary": summary_rows,
        "details": details,
        "processing_time": total_time,
        "step_times": step_times  # 개발/디버깅용
    }

    # opinion이 비어있으면 기본 안내 메시지로 대체
    if not result_dict["opinion"]:
        result_dict["opinion"] = "유사한 장애사례를 찾을 수 없습니다. 더 구체적인 내용을 입력해주세요."

    return result_dict


def predict_fault_real_cases(top_results):
    """장애점 추론 2: 유사 사례 기반 장애점 예측"""
    if not top_results:
        return {"장애점": "알 수 없음", "신뢰도": 0, "근거": "유사 사례가 없습니다."}

    # 가중치 설정 (유사도가 높을수록 가중치도 높게)
    weights = []
    for i, result in enumerate(top_results):
        similarity = result.get("similarity", 0)
        # 유사도에 따른 가중치 설정 (로그 스케일로 차이 줄이기)
        weight = similarity * (1.0 - (i * 0.1))  # 순위에 따라 가중치 감소
        weights.append(weight)

    # 정규화
    total_weight = sum(weights)
    if total_weight > 0:
        weights = [w / total_weight for w in weights]

    # 장애점 및 장애분야 추출 및 점수 계산
    fault_points = {}
    fault_fields = {}

    for i, result in enumerate(top_results):
        metadata = result.get("metadata", {})

        # 장애점 가중치 계산
        fault_point = metadata.get("장애점", "알 수 없음")
        if fault_point and fault_point != "N/A":
            if fault_point in fault_points:
                fault_points[fault_point] += weights[i]
            else:
                fault_points[fault_point] = weights[i]

        # 장애분야 가중치 계산
        fault_field = metadata.get("장애분야", "기타")
        if fault_field:
            if fault_field in fault_fields:
                fault_fields[fault_field] += weights[i]
            else:
                fault_fields[fault_field] = weights[i]

    # 최고 점수의 장애점 및 장애분야 선택
    best_fault_point = max(fault_points.items(
    ), key=lambda x: x[1]) if fault_points else ("알 수 없음", 0)
    best_fault_field = max(fault_fields.items(),
                           key=lambda x: x[1]) if fault_fields else ("기타", 0)

    # 신뢰도 계산 (가중치 기반 -> 유사도 기반으로 수정)
    top_similarity = top_results[0]['similarity'] if top_results else 0
    confidence = min(100, max(10, round(top_similarity * 0.9, 1)))

    # 근거 생성
    evidence = []
    for result in top_results:
        metadata = result.get("metadata", {})
        if metadata.get("장애점") == best_fault_point[0]:
            # 근거가 되는 사례 정보 추가
            evidence.append(
                f"장애번호 #{metadata.get('장애번호')}: {metadata.get('장애명')} (유사도: {result.get('similarity'):.1f}%)")

    # 조치내역 추출 (최상위 유사 사례에서)
    top_actions = []
    for result in top_results:
        metadata = result.get("metadata", {})
        if metadata.get("장애점") == best_fault_point[0] and metadata.get("조치내역"):
            action = metadata.get("조치내역").strip()
            if action:
                top_actions.append(action)

    return {
        "장애점": best_fault_point[0],
        "장애분야": best_fault_field[0],
        "신뢰도": confidence,
        "근거": evidence[:3],  # 최대 3개 근거 표시
        "조치내역": top_actions[:1]  # 최상위 조치내역 1개만 표시
    }


async def generate_brief_async(query, top_results, external_factors, fault_point_1, fault_point_2):
    """쿼리와 유사도 높은 장애 사례를 기반으로 전문적인 종합 의견을 생성하는 함수 (비동기 버전)"""
    if not top_results:
        return "유사한 장애사례가 없어 종합 의견을 생성할 수 없습니다."

    # 1. 경보 메시지 정제 및 기본 정보 추출
    cleaned_query = clean_alert_message(query)
    top_similarity = top_results[0].get("similarity", 0)

    # 2. 승자/패자 결정 (신뢰도 비교, 동점 시 패턴 기반 우선)
    if fault_point_1.get("신뢰도", 0) >= fault_point_2.get("신뢰도", 0):
        winner = fault_point_1
        loser = fault_point_2
        winner_index = 1
    else:
        winner = fault_point_2
        loser = fault_point_1
        winner_index = 2

    # 3. 종합 의견 생성에 필요한 정보 추출
    # 조치내역은 항상 '유사사례 기반' 추론 결과를 우선적으로 참고
    main_action = fault_point_2.get("조치내역", [])
    if main_action and isinstance(main_action, list):
        main_action = main_action[0]
    else:
        # 유사사례에 조치내역이 없으면, top_results에서 찾기
        for result in top_results:
            metadata = result.get("metadata", {})
            action = metadata.get("조치내역", "").strip()
            if action and len(action) > 10:
                main_action = action
                break
        else:
            main_action = ""

    # 상관관계 및 외부 요인 분석 (동기 호출로 수정)
    correlation = analyze_fault_alert_correlation(top_results)
    external_factors_info = generate_external_factors_info(external_factors)

    # 4. 유사도 구간에 따라 최종 의견 조합
    return generate_similarity_opinion(
        winner, loser, winner_index, external_factors_info, top_similarity,
        cleaned_query=cleaned_query, correlation=correlation, main_action=main_action
    )

"""
경보 유사도에 따른 장애 분석 의견을 생성하는 함수
"""


def format_evidence_text(evidence_list):
    """증거 목록을 포맷팅 """
    if not evidence_list or len(evidence_list) == 0:
        return ""

    return "\n".join([f"&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- {evidence}" for evidence in evidence_list])


def build_inference_section(
    pattern_based_result,
    similar_case_result
):
    """추론 결과 섹션 생성"""
    # 각 결과에서 필요한 정보 추출
    pattern_fault_point = pattern_based_result.get("장애점", "N/A")
    pattern_confidence = pattern_based_result.get("신뢰도", 0)
    pattern_evidence = pattern_based_result.get("근거", [])
    pattern_evidence_text = format_evidence_text(pattern_evidence)

    similar_fault_point = similar_case_result.get("장애점", "N/A")
    similar_case_confidence = similar_case_result.get("신뢰도", 0)
    similar_evidence = similar_case_result.get("근거", [])
    similar_evidence_text = format_evidence_text(similar_evidence)

    # 추론 결과가 다른지 확인
    different_results = pattern_fault_point != similar_fault_point
    different_results_text = "\n※ 추론 1과 추론 2의 결과가 다릅니다. 두 가지 가능성을 모두 검토하세요." if different_results else ""

    return f"""
🔍 <span class="inference-title"><b>장애점 추론 1 (경보 패턴 기반): </b></span> <span class="fault-result" style="color: red;"><b>{pattern_fault_point}</b></span>
&nbsp&nbsp&nbsp• <b>신뢰도: {pattern_confidence:.1f}%</b>
&nbsp&nbsp&nbsp• <b>판단기준:</b>
{pattern_evidence_text}

🔍 <span class="inference-title"><b>장애점 추론 2 (유사 장애사례 기반):</b></span> <span class="fault-result" style="color: red;"><b>{similar_fault_point}</b></span>
&nbsp&nbsp&nbsp• <b>신뢰도: {similar_case_confidence:.1f}%</b>
&nbsp&nbsp&nbsp• <b>유사사례:</b>
{similar_evidence_text}<br>{different_results_text}
"""


def build_low_similarity_footer(cleaned_query, top_similarity):
    return f"""현재 발생한 경보는 <b>장애사례와 유사도({top_similarity:.1f}%)가 낮아</b> 정확한 장애점 판단은 어렵습니다. 
추가적인 경보 내역이나 장애 증상 데이터가 필요합니다.
입력된 경보 내역({cleaned_query})으로 추정된 결과로는 명확한 패턴을 찾기 어렵습니다.
관련 분야별(MW, IP, 전송, 교환, 무선, 전원) 장비들에서 발생한 경보(로그) 내역과 장애 증상을 추가로 입력해 주시기 바랍니다.
"""


def build_medium_similarity_footer(higher_confidence_field, correlation, main_action):
    """중간 유사도 케이스를 위한 푸터 생성"""
    action_text = f"\n해당 유형의 장애는 일반적으로 <b>{main_action}</b>으로 복구되었습니다." if main_action else ""

    return f"""
{correlation}

이 상황에서는 MW/IP/전송/교환/무선/선로/전원에서도 추가 경보가 발생할 수 있습니다.
유사 장애사례를 참고하여, <b>{higher_confidence_field} 관련 장비를 우선적으로 점검</b>해보시기 바랍니다.{action_text}
"""


def build_high_similarity_footer(higher_confidence_field, correlation, main_action):
    """높은 유사도 케이스를 위한 푸터 생성"""
    action_text = main_action[:200] + "..." if main_action and len(
        main_action) > 200 else main_action if main_action else "기록된 조치내역 없음"

    return f"""
{correlation}

이러한 상황에서는 MW/IP/전송/교환/무선/선로/전원에서도 추가 경보가 발생할 수 있습니다.
해당 유사 장애사례를 참고하여, <b>{higher_confidence_field} 관련 장비를 우선적으로 점검</b>해보시기 바랍니다.

<br> 유사 사례의 조치내역을 참고하면, <b>{action_text}</b>으로 복구되었습니다.
"""


def generate_similarity_opinion(
    winner, loser, winner_index, external_factors_info, top_similarity,
    cleaned_query=None, correlation=None, main_action=None
):
    """유사도에 따른 의견 생성 통합 함수

    Args:
        winner: 더 높은 신뢰도를 가진 결과
        loser: 낮은 신뢰도를 가진 결과  

        winner_index: winner의 인덱스 (1 또는 2)
        external_factors_info: 외부 요인 정보
        top_similarity: 최고 유사도 값
        cleaned_query: 정제된 쿼리 (낮은 유사도용)
        correlation: 상관관계 정보 (중간/높은 유사도용)
        main_action: 주요 조치내역 (중간/높은 유사도용)
    """
    # 추론 1, 2의 순서를 고정하여 화면에 표시
    pattern_based_result = winner if winner_index == 1 else loser
    similar_case_result = loser if winner_index == 1 else winner

    # 공통 헤더와 추론 섹션
    # 헤더에서는 더 높은 신뢰도를 가진 추론을 언급하되, 해당 추론의 실제 신뢰도와 분야를 사용

    if winner_index == 1:
        # 추론1(패턴기반)이 더 높음
        header_inference_num = 1
        header_type = "패턴 기반"
        header_confidence = pattern_based_result.get("신뢰도", 0)
        header_field = pattern_based_result.get("장애분야", "알 수 없음")
    else:
        # 추론2(유사사례)가 더 높음
        header_inference_num = 2
        header_type = "유사사례 기반"
        header_confidence = similar_case_result.get("신뢰도", 0)
        header_field = similar_case_result.get("장애분야", "알 수 없음")

    # 수정된 헤더 생성
    header = f"""현재 발생한 경보와 유사한 장애사례 RAG 조회 결과입니다.
<span class="header-inference-mention">'장애점 추론 {header_inference_num} ({header_type})</span>의 결과, <b>{header_field} 분야</b>의 장애점과 유사하며 <b>신뢰도 {header_confidence:.1f}%</b> 수준입니다.
"""

    inference_section = build_inference_section(
        pattern_based_result, similar_case_result
    )

    # 유사도에 따른 footer 생성
    if top_similarity < 40:
        # 낮은 유사도 (40% 미만)
        footer = build_low_similarity_footer(cleaned_query, top_similarity)
    elif top_similarity < 60:
        # 중간 유사도 (40-60%)
        footer = build_medium_similarity_footer(
            header_field, correlation, main_action)
    else:
        # 높은 유사도 (60% 이상)
        footer = build_high_similarity_footer(
            header_field, correlation, main_action)

    return header + inference_section + footer


def generate_external_factors_info(external_factors):
    """외부 요인 정보를 문자열로 생성"""
    fading_count = external_factors.get("fading_count", 0)
    power_outage_count = external_factors.get("power_outage_count", 0)
    cable_damage_count = external_factors.get("cable_damage_count", 0)

    # 모든 외부 요인이 0이면 통합 메시지
    if fading_count == 0 and power_outage_count == 0 and cable_damage_count == 0:
        return """MW 전파 <b>페이딩 영향은 없으며, 한전 정전 영향도 없고, 선로 장애도 없는</b> 것으로 확인됩니다.
다른 분야별/장비별 경보현황을 추가로 확인/분석할 필요가 있습니다."""

    # 각 요인별 메시지 생성
    external_factors_info = []

    if fading_count > 0:
        external_factors_info.append(
            f"- MW 장비 중 변조율이 크게 하락한 장비가({fading_count}건) 있기 때문에 <b>전파 페이딩</b>이 문제일 수 있습니다.")

    if power_outage_count > 0:
        external_factors_info.append(
            f"- 일부 MW 장비가({power_outage_count}건) 배터리 모드로 운용되고 있어 <b>한전 정전</b>이 문제일 수 있습니다.")

    if cable_damage_count > 0:
        external_factors_info.append(
            f"- 미복구된 <b>선로 장애</b>가 {cable_damage_count}건이 있어 선로가 문제일 수 있습니다.")

    return "\n".join(external_factors_info)


def analyze_alert_patterns(cleaned_query):
    """경보 패턴을 분석하여 주요 특징을 추출"""
    # 경보 패턴의 일반적 특성 분석
    alert_keywords = []

    # 주요 장비 키워드 확인 - 단순 포함 여부 확인으로 최적화
    cleaned_query_lower = cleaned_query.lower()
    for keyword in EQUIPMENT_KEYWORDS:
        if keyword.lower() in cleaned_query_lower:
            alert_keywords.append(keyword)
            break

    # 주요 경보 유형 키워드 확인
    for keyword in ALERT_TYPE_KEYWORDS:
        if keyword.lower() in cleaned_query_lower:
            alert_keywords.append(keyword)
            break

    # 키워드 조합으로 일반화된 경보 패턴 설명 생성
    if alert_keywords:
        return f"현재 경보는 {', '.join(alert_keywords)} 관련 특성을 보이고 있습니다."
    else:
        return "현재 경보 패턴에서 특정 장비나 장애 유형의 명확한 특성을 파악하기 어렵습니다."


def analyze_fault_alert_correlation(top_results):
    """장애와 경보의 상관관계를 일반화된 방식으로 분석"""
    if not top_results:
        return "관련 장애 사례가 부족하여 상관관계 분석이 어렵습니다."

    # 상위 결과들의 장애분야 및 장애점 확인
    fields = set()
    fault_points = set()

    for result in top_results:
        metadata = result.get("metadata", {})
        field = metadata.get("장애분야", "")
        fault_point = metadata.get("장애점", "")

        if field:
            fields.add(field)
        if fault_point:
            fault_points.add(fault_point)

    # 장애분야별 특성 분석 (데이터 기반)
    correlation_texts = []

    # 장애분야 기반 일반적 패턴 설명
    if fields:
        field_text = f"조회된 유사 장애사례 분석 결과, {'/'.join(fields)} 분야에서 주로 발생하는 패턴입니다."
        correlation_texts.append(field_text)

    # 장애점 기반 일반적 패턴 설명
    fault_points_list = list(fault_points)
    if fault_points_list and len(fault_points_list) <= 3:
        points_text = f"<br>주요 장애점으로는 {', '.join(fault_points_list[:3])} 등이 확인됩니다."
        correlation_texts.append(points_text)

    # 경보 연쇄 효과에 대한 일반적 설명
    general_pattern = "<br>이러한 유형의 장애는 일반적으로 연결된 다른 장비에서도 연쇄적인 경보가 발생하는 특징이 있습니다."
    correlation_texts.append(general_pattern)

    return " ".join(correlation_texts)

# fault_prediction_core_4.py의 hybrid_search_async 함수


async def hybrid_search_async(query, collection, top_k=5):
    """벡터 유사도와 키워드/패턴 매칭을 결합한 하이브리드 검색 구현"""

    # 1. 경보 내역에서 분야 추출
    detected_fields = extract_fields_from_query(query)
    field_filter = create_field_filter(detected_fields)
    log_field_filtering_info(query, detected_fields, field_filter)

    # 캐시 확인 (기존 코드 유지)
    cache_key = hash(query + str(field_filter))
    current_time = time.time()
    if cache_key in _vector_search_cache:
        cached_item = _vector_search_cache[cache_key]
        if current_time - cached_item['timestamp'] < _VECTOR_CACHE_EXPIRY:
            return copy.deepcopy(cached_item['results']), copy.deepcopy(cached_item['search_results'])

    # 🔧 성능 최적화: 검색 결과 수 줄이기 (속도 향상)
    search_params = {
        "query_texts": [query],
        "n_results": min(top_k * 5, 30),  # 100 → 30으로 줄여서 속도 향상
        "include": ["documents", "metadatas", "distances"]
    }

    if field_filter:
        search_params["where"] = field_filter

    # 🔍 디버깅: 벡터 검색 파라미터 로깅
    logger.info(
        f"🔍 벡터 검색 실행: n_results={search_params['n_results']}, 필터={bool(field_filter)}")

    search_results = collection.query(**search_params)

    if not search_results.get("documents") or not search_results["documents"][0]:
        logger.warning(f"검색 결과 없음. 필터 조건: {field_filter}")
        return [], search_results

    # 데이터 구성 (기존 코드 유지)
    seen_fault_numbers = set()
    docs = search_results["documents"][0]
    metas = search_results["metadatas"][0]
    distances = search_results["distances"][0]

    # 🔍 간소화된 벡터 검색 결과 로깅 (성능 향상)
    logger.info(f"=== 벡터 검색 상위 {min(5, len(metas))}개 결과 ===")
    for i in range(min(5, len(metas))):
        fault_point = metas[i].get("장애점", "N/A")
        fault_number = metas[i].get("장애번호", "N/A")
        vector_distance = distances[i]
        logger.info(
            f"{i+1:2d}. #{fault_number} {fault_point[:30]}... (벡터거리: {vector_distance:.3f})")

    documents_info = []
    for doc, meta, distance in zip(docs, metas, distances):
        fault_number = meta.get("장애번호")
        if not fault_number or fault_number in seen_fault_numbers:
            continue
        seen_fault_numbers.add(fault_number)
        documents_info.append({
            "alerts": meta.get("경보현황", ""),
            "analysis": meta.get("장애분석", ""),
            "reception": meta.get("장애접수내역", ""),
            "metadata": meta,
            "document": doc,
            "distance": distance,
        })

    logger.info(f"벡터 검색 후보: {len(docs)}개 → 중복 제거 후: {len(documents_info)}개")

    # 하이브리드 유사도 계산
    similarity_scores = await calculate_hybrid_similarities(query, documents_info)

    hybrid_results = []
    for i, sim_score in enumerate(similarity_scores):
        hybrid_results.append({
            "document": documents_info[i]["document"],
            "metadata": documents_info[i]["metadata"],
            "vector_distance": documents_info[i]["distance"],
            "similarity": sim_score,
            "hybrid_score": sim_score
        })

    # 결과 정렬
    sorted_results = sorted(
        hybrid_results, key=lambda x: x["hybrid_score"], reverse=True)

    # 🔍 디버깅: 하이브리드 검색 최종 결과 로깅
    logger.info("=== 하이브리드 검색 최종 결과 상위 10개 ===")
    for i, result in enumerate(sorted_results[:10]):
        meta = result["metadata"]
        fault_point = meta.get("장애점", "N/A")
        fault_number = meta.get("장애번호", "N/A")
        hybrid_score = result["hybrid_score"]
        vector_distance = result["vector_distance"]
        logger.info(
            f"{i+1:2d}. #{fault_number} {fault_point[:30]}... (하이브리드: {hybrid_score:.1f}, 벡터: {vector_distance:.3f})")

    final_results = sorted_results[:top_k]

    # 캐싱 (기존 코드 유지)
    _vector_search_cache[cache_key] = {
        'results': final_results,
        'search_results': search_results,
        'timestamp': current_time
    }

    if len(_vector_search_cache) > _VECTOR_CACHE_SIZE:
        oldest_keys = sorted(_vector_search_cache.keys(),
                             key=lambda k: _vector_search_cache[k]['timestamp'])[:5]
        for key in oldest_keys:
            del _vector_search_cache[key]

    return final_results, search_results


async def calculate_hybrid_similarities(query, documents):
    """하이브리드 유사도 계산 - 벡터 거리, 텍스트 매칭, 패턴 매칭 결합"""
    # 1. 정규화 및 전처리
    query_norm = normalize_text(query.lower())
    query_codes = set(extract_alert_codes_cached(query))

    # 2. 비동기 처리를 위한 작업 목록 구성
    tasks = []
    for doc in documents:
        tasks.append(
            compute_document_similarity(
                query_norm,
                doc,
                query_codes
            )
        )

    # 3. 모든 유사도 계산 작업 병렬 실행
    similarity_scores = await asyncio.gather(*tasks)

    # 4. 경보 수 및 분야 다양성 보정 적용
    adjusted_scores = []
    for score, doc in zip(similarity_scores, documents):
        alert_count = doc.get("alerts", "").count("<")  # 경보의 수
        field_count = len(set(extract_fields_from_query(
            doc.get("alerts", ""))))  # 관련 분야의 수

        # 경보 수가 많을수록 유사도를 높임 (3개 이상의 경보가 일치하면 유사도 증가)
        if alert_count >= 3:
            score += 15  # 경보 수가 많을수록 유사도 증가
        if field_count >= 2:
            score += 10  # 분야 수가 많을수록 유사도 증가

        # 경보 수가 적고, 분야가 적으면 점수를 낮추는 방식
        if alert_count <= 1:
            score *= 0.7  # 경보가 하나만 일치하면 점수를 약간 낮춤
        if field_count <= 1:
            score *= 0.8  # 분야가 하나만 일치하면 점수를 조금 더 낮춤

        adjusted_scores.append(score)

    return adjusted_scores


async def compute_document_similarity(query_norm, doc, query_codes):
    """단일 문서의 유사도 계산 - 동적 구문 추출 및 비율 우선 반영"""

    # 1. 문서 텍스트 준비 - 디버깅 추가
    alerts_text = doc.get("alerts", "")
    analysis_text = doc.get("analysis", "")
    reception_text = doc.get("reception", "")

    # 간소화된 디버깅 로그 (성능 향상)
    if logger.isEnabledFor(logging.DEBUG):
        logger.debug(f"=== 문서 구성 요소 ===")
        logger.debug(
            f"alerts({len(alerts_text)}), analysis({len(analysis_text)}), reception({len(reception_text)})")

    doc_full_text = (alerts_text + " " + analysis_text +
                     " " + reception_text).lower()

    # 2. 동적으로 의미있는 구문들 추출 (하드코딩 없음)
    query_phrases = extract_dynamic_phrases(query_norm.lower())

    # 3. 매칭 분석 및 비율 계산
    matching_result = analyze_phrase_matching(query_phrases, doc_full_text)

    # 중요한 매칭 결과만 로깅
    if matching_result["match_count"] > 0:
        logger.info(
            f"매칭 성공: {matching_result['match_count']}개, 비율: {matching_result['match_ratio']:.1%}")

    # 4. 비율 우선 + 매칭 개수 기반 점수 계산
    if matching_result["match_count"] > 0:
        score = calculate_ratio_based_score(
            matching_result, len(query_phrases))
        return score

    # 5. 매칭이 없는 경우 - 매우 낮은 기본 점수
    else:
        score = calculate_basic_similarity(query_norm, doc, query_codes)
        return score


def extract_dynamic_phrases(text):
    """동적으로 의미있는 구문 추출 - 경보명 우선 추출 방식"""
    if not text:
        return []

    phrases = []
    text_lower = text.lower()

    # 디버깅 로그
    logger.info(f"입력 텍스트: {text}")

    # 1. 명확한 경보명 라인 직접 추출 (최고 우선순위)
    alert_lines = extract_alert_lines(text)
    phrases.extend(alert_lines)
    logger.info(f"추출된 경보 라인들: {alert_lines}")

    # 2. 기술적 용어와 에러 메시지 추출
    technical_terms = extract_technical_terms(text)
    phrases.extend(technical_terms)
    logger.info(f"추출된 기술 용어들: {technical_terms}")

    # 3. 보완적 구문 추출 (기존 방식의 개선된 버전)
    words = text.split()
    for start in range(len(words)):
        for length in range(2, min(len(words) - start + 1, 6)):  # 최대 6단어로 제한
            phrase = " ".join(words[start:start + length])

            # 최소 길이 및 의미성 확인
            if len(phrase) >= 5 and is_meaningful_phrase_strict(phrase):
                phrases.append(phrase)

    # 4. 중복 제거 (경보명 우선 보존)
    result = remove_overlaps_preserve_alerts(phrases)

    logger.info(f"최종 추출된 구문들: {result}")
    return result[:30]  # 최대 30개


def extract_alert_lines(text):
    """명확한 경보 라인들을 직접 추출"""
    alert_lines = []
    lines = text.split('\n')

    for line in lines:
        line = line.strip()
        # "-"로 시작하는 경보 라인
        if line.startswith('-'):
            alert_text = line[1:].strip()
            if len(alert_text) >= 3:  # 최소 3글자 이상
                alert_lines.append(alert_text)

        # 다른 경보 패턴들도 추가 추출
        elif any(pattern in line.lower() for pattern in [
            'fail', 'loss', 'error', 'alarm', 'down', 'timeout',
            '무응답', '장애', '경보', '알람', '불량'
        ]):
            # 의미있는 경보 문장인지 확인
            if 10 <= len(line) <= 100:  # 적절한 길이
                alert_lines.append(line)

    return alert_lines


def extract_technical_terms(text):
    """기술적 용어와 에러 메시지 추출"""
    import re

    technical_patterns = [
        r'[A-Z][A-Z0-9-]{2,}\s+[A-Za-z][A-Za-z0-9\s]{3,}',  # "STM-1 Frame" 패턴
        r'[A-Za-z]+\s+path\s+[A-Za-z]+',  # "Transmit path has" 패턴
        r'SNMP\s+[A-Za-z]+\s+[가-힣]+',  # "SNMP Agent 무응답" 패턴
        r'[A-Z]{2,}[0-9]*[-/][A-Z0-9]+',  # "STM-1/OC-3" 패턴
    ]

    terms = []
    for pattern in technical_patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        terms.extend(matches)

    return [term.strip() for term in terms if len(term.strip()) >= 5]


def is_meaningful_phrase_strict(phrase):
    """엄격한 의미성 판단"""
    words = phrase.split()

    # 기술적 키워드 포함 확인
    tech_keywords = [
        'snmp', 'agent', 'loss', 'frame', 'interface', 'path', 'transmit', 'receive',
        'link', 'fail', 'down', 'timeout', 'error', 'alarm',
        '무응답', '장애', '경보', '알람', '불량', '손실'
    ]

    has_tech_keyword = any(
        keyword in phrase.lower() for keyword in tech_keywords
    )

    # 의미있는 구문 조건
    return (
        has_tech_keyword and
        len(words) >= 2 and
        len(phrase) >= 8 and
        not all(word.lower() in ['그리고', '그런데', '하지만', '그래서'] for word in words)
    )


def remove_overlaps_preserve_alerts(phrases):
    """경보성 판단 없이 유사 구문을 제거하여 중복을 최소화"""
    if not phrases:
        return []

    filtered_phrases = []
    for phrase in phrases:
        is_overlapping = False
        for existing in filtered_phrases:
            if calculate_phrase_overlap(phrase, existing) > 0.8:
                is_overlapping = True
                break
        if not is_overlapping:
            filtered_phrases.append(phrase)

    return filtered_phrases


def calculate_phrase_overlap(phrase1, phrase2):
    """두 구문 간 겹침 비율 계산"""
    words1 = set(phrase1.split())
    words2 = set(phrase2.split())

    if not words1 or not words2:
        return 0

    intersection = len(words1 & words2)
    union = len(words1 | words2)

    return intersection / union if union > 0 else 0


def analyze_phrase_matching(query_phrases, doc_text):
    """구문 매칭 분석 - 유사 구문 중복을 방지하고, 정확성 높은 매칭만 유지"""
    if not query_phrases:
        return {"match_count": 0, "match_ratio": 0, "matched_phrases": []}

    matched_phrases = []
    doc_text_norm = normalize_text(doc_text.lower())
    seen_matches = set()

    for phrase in query_phrases:
        phrase_norm = normalize_text(phrase.lower())

        # ✅ 10자 이상 정확 구문만 허용 + 중복 방지
        if len(phrase_norm) >= 10 and phrase_norm in doc_text_norm:
            if phrase_norm not in seen_matches:
                matched_phrases.append(phrase)
                seen_matches.add(phrase_norm)

    match_count = len(matched_phrases)
    total_query = len(query_phrases)
    match_ratio = match_count / total_query if total_query > 0 else 0

    return {
        "match_count": match_count,
        "match_ratio": match_ratio,
        "matched_phrases": matched_phrases
    }


def calculate_ratio_based_score(matching_result, total_query_phrases, embedding_similarity=0.0):
    """경보 수, 분야 수 중심 점수 계산 + 단일 경보/분야 점수 하향"""
    from .fault_prediction_constants import FIELD_KEYWORDS

    matched_phrases = matching_result.get("matched_phrases", [])
    query_phrase_count = total_query_phrases or 1

    # 고유 구문 필터
    unique_phrases = set(
        normalize_text(p.lower()) for p in matched_phrases if len(p.strip()) >= 10
    )
    match_count = len(unique_phrases)
    match_ratio = match_count / query_phrase_count

    # 분야 수
    matched_fields = set()
    for phrase in matched_phrases:
        phrase_lower = phrase.lower()
        for field, keywords in FIELD_KEYWORDS.items():
            for keyword in keywords:
                if keyword.lower() in phrase_lower:
                    matched_fields.add(field)
                    break
    field_count = len(matched_fields)

    # 1. 경보 수 기반 점수
    if match_count == 1:
        base_score = 10  # 하향 고정
    else:
        base_score = match_count * 20

    # 2. 분야 보너스 (1개 분야는 더 낮게)
    if field_count >= 4:
        field_bonus = 20
    elif field_count == 3:
        field_bonus = 10
    elif field_count == 2:
        field_bonus = 7
    elif field_count == 1:
        field_bonus = 1.5  # 기존 4 → 2
    else:
        field_bonus = 0

    # 3. 비율 점수 (축소)
    ratio_score = min(3, match_ratio * 3)

    # 4. 임베딩 점수 (축소)
    embedding_bonus = min(2, max(0, embedding_similarity * 3))

    # 최종 합산
    total_score = base_score + field_bonus + ratio_score + embedding_bonus
    total_score = min(100, max(10, round(total_score, 1)))

    logger.info(
        f"[유사도계산] match_count={match_count}, field_count={field_count}, match_ratio={match_ratio:.2f}, embed_sim={embedding_similarity:.2f} → 총점={total_score:.1f}")

    return total_score


def calculate_basic_similarity(query_norm, doc, query_codes):
    """매칭이 없는 경우의 기본 유사도 - 상향"""
    # 기본 텍스트 유사도 가중치 상향
    alert_text = normalize_text(doc.get("alerts", "").lower())
    alert_similarity = fuzz.token_set_ratio(query_norm, alert_text) / 100

    # 경보 코드 매칭 가중치 상향
    doc_codes = set(extract_alert_codes_cached(doc.get("alerts", "")))
    code_match_ratio = len(query_codes & doc_codes) / \
        len(query_codes) if query_codes else 0

    # 분야 일치 보너스 추가
    field_match_bonus = 0
    query_lower = query_norm.lower()
    doc_lower = alert_text.lower()

    # 분야 키워드 일치 시 보너스
    field_keywords = ['ip', 'mw', 'm/w', '전송', '교환', '무선', '선로', '전원']
    for keyword in field_keywords:
        if keyword in query_lower and keyword in doc_lower:
            field_match_bonus += 8  # 분야당 8점 보너스

    # 가중치 상향 + 기본 점수 추가
    base_score = 15  # 기본 15점
    similarity_score = alert_similarity * 35  # 유사도 가중치 상향
    code_score = code_match_ratio * 20  # 코드 매칭 가중치 상향

    total_score = base_score + similarity_score + code_score + field_match_bonus

    return max(10, min(55, total_score))  # 최소 10점, 최대 55점


def create_embedding_function():
    """임베딩 함수 생성"""
    return embedding_functions.SentenceTransformerEmbeddingFunction(model_name=EMBEDDING_MODEL)


def get_vector_db_collection(retry_count=0):
    """벡터DB 컬렉션을 가져오는 함수 (싱글톤 패턴 적용, 오류 시 재시도 지원)"""
    global _collection_instance

    if _collection_instance is not None:
        # 기존 인스턴스가 있으면 정상 작동하는지 테스트
        try:
            _collection_instance.count()  # 간단한 테스트
            return _collection_instance, None
        except Exception as e:
            logger.warning(f"기존 컬렉션 인스턴스 오류 감지: {e}. 재초기화합니다.")
            _collection_instance = None

    # 시도할 경로들을 순서대로 정의
    paths_to_try = [VECTOR_DB_DIR, VECTOR_DB_NEW_DIR]

    for db_path in paths_to_try:
        if not os.path.exists(db_path):
            logger.info(f"벡터DB 경로가 존재하지 않음: {db_path}")
            continue

        try:
            logger.info(f"벡터DB 접근 시도: {db_path}")

            # 벡터DB 클라이언트 생성
            client = chromadb.PersistentClient(path=db_path)

            # 사용 가능한 컬렉션 목록 확인
            collections = client.list_collections()
            collection_names = [col.name for col in collections]
            logger.info(f"벡터DB 경로 {db_path}에서 발견된 컬렉션: {collection_names}")

            # nw_incidents 컬렉션이 있는지 확인
            if "nw_incidents" not in collection_names:
                logger.info(f"컬렉션 'nw_incidents'가 {db_path}에 없음. 다음 경로 시도...")
                continue

            # 임베딩 함수 설정
            ef = create_embedding_function()

            # 컬렉션 가져오기
            _collection_instance = client.get_collection(
                name="nw_incidents", embedding_function=ef)

            # 컬렉션 동작 테스트
            data_count = _collection_instance.count()
            logger.info(f"벡터DB 컬렉션 성공적으로 로드됨: {db_path}, 데이터 수: {data_count}")

            # 인덱스 최적화 시도 (지원되는 경우)
            try:
                _collection_instance.create_index(
                    index_type="hnsw",  # 대용량 데이터에 적합한 인덱스
                    params={"space_type": "cosine", "ef_construction": 200}
                )
            except (AttributeError, NotImplementedError):
                pass  # 지원되지 않는 경우 무시

            return _collection_instance, None

        except Exception as e:
            logger.warning(f"벡터DB 경로 {db_path}에서 오류 발생: {str(e)}")
            continue

    # 모든 경로에서 실패한 경우 - 한 번만 재시도
    if retry_count == 0:
        logger.info("첫 번째 시도 실패. 캐시 초기화 후 재시도...")
        reset_vector_db_cache()
        return get_vector_db_collection(retry_count=1)

    # 재시도도 실패한 경우
    error_msg = f"모든 벡터DB 경로에서 'nw_incidents' 컬렉션을 찾을 수 없습니다.\n확인된 경로: {', '.join(paths_to_try)}\n\n디버깅을 위해 'python debug_chroma.py'를 실행해보세요."
    return None, {"type": ERROR_DB_ACCESS, "message": error_msg}


def build_summary_rows(top_results):
    """결과 요약 행 구성"""
    return [build_result_row(r, i) for i, r in enumerate(top_results, 1)]


def build_details(top_results):
    """상세 결과 구성"""
    details = []
    for i, r in enumerate(top_results, 1):
        m = r["metadata"]
        field = m.get("장애분야") or identify_field_from_keywords(
            m.get("경보현황", ""))

        # 신뢰도 계산 - 유사도에 기반하여 계산 (일관성 유지)
        confidence = min(100, max(10, round(r['similarity'] * 0.9, 1)))

        details.append({
            "순위": str(i),
            "신뢰도": f"{confidence:.1f}%",
            "유사도": f"{r['similarity']:.1f}%",
            "분야": field,
            "장애점": m.get("장애점", "N/A"),
            "발생일자": m.get("발생일자", "N/A"),
            "장애사례": f"[장애번호 #{m.get('장애번호', 'N/A')}] {m.get('장애명', 'N/A')}",
            "장애분석": m.get("장애분석", ""),
            "경보현황": m.get("경보현황", ""),
            "조치내역": m.get("조치내역", "")
        })
    return details


def build_result_row(result, i):
    """결과 행 구성 헬퍼 함수"""
    metadata = result["metadata"]
    field = metadata.get("장애분야") or identify_field_from_keywords(
        metadata.get("경보현황", ""))

    # 신뢰도 계산 - 유사도에 기반하여 계산 (일관성 유지)
    confidence = min(100, max(10, round(result['similarity'] * 0.9, 1)))

    return {
        "순위": str(i),
        "신뢰도": f"{confidence:.1f}%",
        "유사도": f"{result['similarity']:.1f}%",
        "분야": field,
        "장애점": metadata.get("장애점", "N/A"),
        "장애사례": metadata.get("장애명", "N/A"),
    }


# 코루틴을 동기 함수로 변환하는 헬퍼 함수
def run_coroutine_sync(coroutine_func, *args, **kwargs):
    """코루틴 함수를 동기 함수로 실행하는 헬퍼"""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    return loop.run_until_complete(coroutine_func(*args, **kwargs))


def get_vector_db_initialization_status():
    """벡터DB 초기화 상태를 반환하는 함수"""
    global _vector_db_initialized, _vector_db_initializing, _vector_db_init_error

    return {
        'initialized': _vector_db_initialized,
        'initializing': _vector_db_initializing,
        'error': _vector_db_init_error
    }


def initialize_vector_db_background():
    """백그라운드에서 벡터DB를 초기화하는 함수 (스레드 안전)"""
    global _vector_db_initialized, _vector_db_initializing, _vector_db_init_error

    if _vector_db_initialized or _vector_db_initializing:
        return True

    _vector_db_initializing = True
    _vector_db_init_error = None

    try:
        logger.info("🚀 백그라운드 벡터DB 파이프라인 초기화 시작...")

        collection, error = get_vector_db_collection()
        if error:
            logger.error(f"벡터DB 초기화 실패: {error}")
            _vector_db_init_error = str(error)
            return False

        # 임베딩 함수도 미리 로드
        _ = create_embedding_function()

        _vector_db_initialized = True
        logger.info("✅ 백그라운드 벡터DB 파이프라인 초기화 완료!")
        return True

    except Exception as e:
        logger.error(f"벡터DB 초기화 중 오류 발생: {str(e)}")
        _vector_db_init_error = str(e)
        return False
    finally:
        _vector_db_initializing = False


def initialize_vector_db():
    """웹 페이지 로딩 시 벡터DB를 미리 초기화하는 함수 (기존 호환성 유지)"""
    global _vector_db_initialized

    # 이미 초기화되었으면 즉시 성공 반환
    if _vector_db_initialized:
        logger.info("✅ 벡터DB 이미 초기화됨 - 즉시 사용 가능")
        return True

    # 아직 초기화되지 않았으면 동기적으로 초기화
    return initialize_vector_db_background()

# 메인 API 진입점


def query(mode, query_text, user_id="default_user"):
    """동기 API를 위한 래퍼 함수"""
    return run_coroutine_sync(run_query, mode, query_text, user_id)


# API를 위한 직접 실행 지점
if __name__ == "__main__":
    print("장애 분석 모듈이 로드되었습니다.")
    # 모듈 로드 시점에 벡터DB 초기화
    initialize_vector_db()
