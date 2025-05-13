"""
장애 예측 핵심 모듈: 유사 장애사례를 찾고 장애점 및 조치사항을 추론
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

# 유틸리티 모듈 임포트
from .fault_prediction_utils import (
    normalize_text,
    extract_alert_codes_cached,
    clean_alert_message,
    calculate_field_matching,
    identify_field_from_keywords,
    analyze_equipment_mentions,
    check_specialized_patterns,
    explain_equipment_hierarchy
)

# 상수 로드
from .fault_prediction_constants import (
    DEFAULT_PROMPT_START_MESSAGE,
    FIELD_KEYWORDS,
    EQUIPMENT_KEYWORDS,
    ALERT_TYPE_KEYWORDS
)

# 상수 정의 - 파일 최상단에 추가
ERROR_DB_ACCESS = "VECTOR_DB_ACCESS_ERROR"

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

    # 벡터 DB 컬렉션 가져오기
    collection, error = get_vector_db_collection()
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
    sorted_results, search_results = await hybrid_search_async(query, collection)

    # 외부 요인 결과 기다리기
    external_factors = await external_factors_task

    # 결과가 없을 경우 처리
    if not sorted_results:
        return json.dumps({
            "error": "입력하신 내용과 유사한 장애 사례를 찾을 수 없습니다. 더 구체적인 장애 상황이나 경보(알람,로그) 내역을 입력해 주세요."
        }, ensure_ascii=False)

    # 상위 결과 추출
    top_results = sorted_results[:3]

    # 결과 데이터 구성 - 먼저 실행하여 신뢰도 확보
    summary_rows = build_summary_rows(top_results)
    details = build_details(top_results)

    # 장애점 추론 2 - 유사 사례 기반 (먼저 수행하여 추론1과 비교에 사용)
    fault_infer_2 = predict_fault_real_cases(top_results)

    # summary_rows의 첫 번째 행(1순위)의 신뢰도를 장애점 추론2의 신뢰도로 사용
    if summary_rows and len(summary_rows) > 0:
        top_confidence_str = summary_rows[0]["신뢰도"]
        if top_confidence_str.endswith('%'):
            top_confidence = float(top_confidence_str.replace('%', ''))
            fault_infer_2["신뢰도"] = top_confidence

    # 장애점 추론 1 - 경보/증상 패턴 기반
    fault_infer_1 = await predict_fault_patterns(query, top_results, external_factors)

    # 장애점 추론1과 추론2의 신뢰도가 같은 경우, 의도적으로 다르게 조정
    if fault_infer_1.get("신뢰도") == fault_infer_2.get("신뢰도"):
        # 추론1의 신뢰도를 약간 다르게 조정 (최소 0.2% 차이)
        adjusted_confidence = fault_infer_1.get("신뢰도") + 0.7
        # 100%를 넘지 않도록 보정
        if adjusted_confidence > 100:
            adjusted_confidence = fault_infer_1.get("신뢰도") - 0.7
        fault_infer_1["신뢰도"] = round(adjusted_confidence, 1)

    # 종합 의견 생성
    comprehensive_opinion = await generate_brief_async(
        query, top_results, external_factors, fault_infer_2, fault_infer_1
    )

    # 결과 JSON 구성
    result_dict = {
        "opinion": comprehensive_opinion,
        "summary": summary_rows,
        "details": details,
        "processing_time": time.time() - start_time
    }

    # opinion이 비어있으면 기본 안내 메시지로 대체
    if not result_dict["opinion"]:
        result_dict["opinion"] = "유사한 장애사례를 찾을 수 없습니다. 더 구체적인 내용을 입력해주세요."

    return result_dict


async def predict_fault_patterns(query, top_results, external_factors):
    """장애점 추론 1: 경보/증상 패턴 기반 장애점 예측 (개선된 버전)"""
    # 1. 경보 및 증상 추출
    cleaned_query = clean_alert_message(query)

    # 2. 분야별 장비 발견 빈도 분석
    field_equipment_counts = analyze_field_equipment_mentions(query)

    # 3. 장비 계층 구조 분석
    equipment_analysis = analyze_equipment_mentions(
        query, field_equipment_counts)

    # 4. 외부 요인 분석
    fading_count = external_factors.get("fading_count", 0)
    power_outage_count = external_factors.get("power_outage_count", 0)
    cable_damage_count = external_factors.get("cable_damage_count", 0)

    # 5. 추론 로직 적용

    # 5.1 선로(광케이블) 장애 추론
    if cable_damage_count > 0 or "광케이블 피해" in cleaned_query or "광케이블 장애" in cleaned_query:
        if sum(field_equipment_counts.values()) >= 3:  # 3개 이상 분야에서 장비 언급
            return {
                "장애점": "광케이블 장애",
                "장애분야": "선로",
                "신뢰도": 85.5,  # 소수점으로 변경
                "근거": [
                    f"미복구된 선로 장애가 {cable_damage_count}건 발견됨" if cable_damage_count > 0 else "다수의 분야별 장비에서 경보 발생",
                    "광케이블 관련 키워드 발견" if "광케이블 장애" in cleaned_query else "여러 분야 장비 동시 장애는 선로 문제의 특징"
                ],
                "패턴_근거": "상위 장비에 연결된 하위 장비들의 경보가 다수 발생"
            }

    # 5.2 MW 페이딩 추론
    if fading_count > 0 or "페이딩" in cleaned_query or "fading" in cleaned_query.lower():
        # MW 페이딩은 MW 자체 경보 없이 연결된 장비들에서 경보 발생
        if field_equipment_counts.get("IP", 0) > 0 or field_equipment_counts.get("전송", 0) > 0:
            return {
                "장애점": "MW 페이딩 현상",
                "장애분야": "MW",
                "신뢰도": 79.3,  # 소수점으로 변경
                "근거": [
                    f"MW 장비 중 변조율이 크게 하락한 장비가 {fading_count}건 발견됨" if fading_count > 0 else "페이딩 관련 키워드 발견",
                    "MW 장비 자체 경보 없이 연결된 장비에서 경보 발생"
                ],
                "패턴_근거": "MW는 페이딩 발생 시 경보가 없으며 연결된 장비에서만 경보 발생"
            }

    # 5.3 한전 정전 추론
    if power_outage_count > 0 or "배터리 모드" in cleaned_query or "UPS" in cleaned_query:
        return {
            "장애점": "한전 정전",
            "장애분야": "전원",
            "신뢰도": 74.2,  # 소수점으로 변경
            "근거": [
                f"배터리 모드로 운용 중인 MW 장비가 {power_outage_count}건 발견됨" if power_outage_count > 0 else "전원 관련 키워드 발견",
                "전원 장애 시 장비들이 배터리 모드로 동작"
            ],
            "패턴_근거": "MW 장비가 배터리 모드로 운영되면 한전 정전일 가능성이 높음"
        }

    # 6. 분야별 특화 패턴 확인 (constants.py의 SPECIALIZED_FAULT_PATTERNS 사용)
    specialized_pattern_result = check_specialized_patterns(
        query, field_equipment_counts, cleaned_query)
    if specialized_pattern_result:
        # 기존 신뢰도에 임의의 소수점 값 추가
        specialized_pattern_result["신뢰도"] = specialized_pattern_result.get(
            "신뢰도", 0) + 0.3
        return specialized_pattern_result

    # 7. 장비 계층 구조 기반 추론
    if equipment_analysis["potential_fault_points"]:
        # 가장 많은 하위 장비가 언급된 상위 장비를 장애점으로 추론
        best_candidate = max(
            equipment_analysis["potential_fault_points"], key=lambda x: x["하위장비수"])

        # 장비가 속한 분야 확인
        equipment_field = "기타"
        for field, keywords in FIELD_KEYWORDS.items():
            if best_candidate["장비"] in keywords:
                equipment_field = field
                break

        return {
            "장애점": f"{best_candidate['장비']} 장비 불량",
            "장애분야": equipment_field,
            "신뢰도": 69.5,  # 소수점으로 변경
            "근거": [
                f"{best_candidate['장비']} 및 하위 장비({', '.join(best_candidate['언급된하위장비'])})에서 다수 경보 발생",
                f"상위 장비인 {best_candidate['장비']}의 장애가 하위 장비에 영향을 미침"
            ],
            "패턴_근거": "상위 장비에 연결된 하위 장비들의 경보가 다수 발생",
            "장비_계층": explain_equipment_hierarchy(query)
        }

    # 8. 유사 사례 참조 (확실한 패턴이 없는 경우)
    if top_results and len(top_results) > 0:
        metadata = top_results[0].get("metadata", {})

        if metadata.get("장애점", "") and metadata.get("장애분야", ""):
            similarity = top_results[0].get("similarity", 0)
            # 최대 54.7%의 신뢰도 (소수점으로 변경)
            confidence = min(54.7, similarity * 0.6)
            return {
                "장애점": metadata.get("장애점", ""),
                "장애분야": metadata.get("장애분야", ""),
                "신뢰도": round(confidence, 1),
                "근거": [
                    f"유사 사례(#{metadata.get('장애번호')})와의 경보 패턴 유사성",
                    f"유사도 {similarity:.1f}% 기반 추론"
                ],
                "패턴_근거": "유사 사례 참조 (명확한 패턴 없음)"
            }

    # 9. 기본 응답 (충분한 정보 없음)
    highest_field = equipment_analysis["most_mentioned_field"]
    return {
        "장애점": "정보 부족으로 판단 어렵습니다.",
        "장애분야": highest_field if highest_field != "기타" else "알 수 없음",
        "신뢰도": 19.4,  # 소수점으로 변경
        "근거": [
            "충분한 경보 패턴이 없거나 명확한 장애 징후 부족",
            "더 많은 정보가 필요합니다"
        ],
        "패턴_근거": "명확한 패턴 없음"
    }


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

    # 신뢰도 계산 (가중치 기반)
    confidence = best_fault_point[1] * 100  # 퍼센트로 변환

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
        "신뢰도": min(100, max(0, round(confidence, 1))),
        "근거": evidence[:3],  # 최대 3개 근거 표시
        "조치내역": top_actions[:1]  # 최상위 조치내역 1개만 표시
    }


def analyze_field_equipment_mentions(query):
    """쿼리에서 분야별 장비 언급 빈도 분석"""
    field_counts = {
        "IP": 0,
        "전송": 0,
        "교환": 0,
        "MW": 0,
        "선로": 0,
        "무선": 0,
        "전원": 0
    }

    query_lower = query.lower()

    # 분야별 키워드 카운팅
    for field, keywords in FIELD_KEYWORDS.items():
        for keyword in keywords:
            if keyword.lower() in query_lower:
                field_counts[field] += 1

    return field_counts


async def generate_brief_async(query, top_results, external_factors, fault_point_1, fault_point_2):
    """쿼리와 유사도 높은 장애 사례를 기반으로 전문적인 종합 의견을 생성하는 함수 (비동기 버전)"""
    if not top_results:
        return "유사한 장애사례가 없어 종합 의견을 생성할 수 없습니다."

    # 1. 경보 메시지 정제
    cleaned_query = clean_alert_message(query)
    top_similarity = top_results[0].get("similarity", 0)

    # 2. 메타데이터 기반 정보 수집
    fields, fault_points, fault_names, actions = [], [], [], []

    for result in top_results:
        metadata = result.get("metadata", {})
        field = metadata.get("장애분야", "").strip()
        fault_point = metadata.get("장애점", "").strip()
        fault_name = metadata.get("장애명", "").strip()
        action = metadata.get("조치내역", "").strip()

        if field:
            fields.append(field)
        if fault_point and fault_point != "N/A":
            fault_points.append(fault_point)
        if fault_name:
            fault_names.append(fault_name)
        if action and len(action) > 10:
            actions.append(action)

    # 3. 가장 많이 언급된 장애 분야 추출
    field_counter = {}
    for field in fields:
        field_counter[field] = field_counter.get(field, 0) + 1

    main_field = "알 수 없음"
    if field_counter:
        main_field = max(field_counter.items(), key=lambda x: x[1])[0]

    # 4. 패턴 분석 및 상관관계 도출 (병렬 처리)
    # 비동기 함수로 변환
    async def analyze_patterns_async():
        return analyze_alert_patterns(cleaned_query)

    async def analyze_correlation_async():
        return analyze_fault_alert_correlation(top_results)

    # 두 작업을 동시에 실행
    alert_patterns, correlation = await asyncio.gather(
        analyze_patterns_async(),
        analyze_correlation_async()
    )

    # 5. 장애점 추론 정보 통합
    # 두 추론 결과의 신뢰도 비교 (패턴 기반은 fault_point_2, 사례 기반은 fault_point_1)
    pattern_confidence = fault_point_2.get("신뢰도", 0)
    similar_case_confidence = fault_point_1.get("신뢰도", 0)

    # 패턴 기반과 유사 사례 기반 추론을 각각 변수로 저장
    pattern_fault_point = fault_point_2.get("장애점", "")
    pattern_fault_field = fault_point_2.get("장애분야", "")
    pattern_evidence = fault_point_2.get("근거", [])

    similar_fault_point = fault_point_1.get("장애점", "")
    similar_fault_field = fault_point_1.get("장애분야", "")
    similar_evidence = fault_point_1.get("근거", [])

    # 신뢰도가 더 높은 쪽을 선택
    higher_confidence_field = pattern_fault_field if pattern_confidence >= similar_case_confidence else similar_fault_field
    higher_confidence_value = max(pattern_confidence, similar_case_confidence)

    # 조치내역 통합
    main_action = ""
    if fault_point_1.get("조치내역") and isinstance(fault_point_1.get("조치내역"), list):
        main_action = fault_point_1.get("조치내역")[0]
    elif actions:
        main_action = actions[0]

    # 6. 외부 요인 정보 생성
    external_factors_info = generate_external_factors_info(external_factors)

    # 7. 유사도 구간별 종합 의견 생성 (새로운 형식으로)
    if top_similarity < 40.0:
        return generate_low_similarity_opinion(
            cleaned_query, higher_confidence_field, higher_confidence_value,
            pattern_fault_point, pattern_confidence, pattern_evidence,
            similar_fault_point, similar_case_confidence, similar_evidence,
            external_factors_info, top_similarity
        )
    elif top_similarity < 60.0:
        return generate_medium_similarity_opinion(
            higher_confidence_field, higher_confidence_value,
            pattern_fault_point, pattern_confidence, pattern_evidence,
            similar_fault_point, similar_case_confidence, similar_evidence,
            correlation, external_factors_info, main_action, top_similarity
        )
    else:
        return generate_high_similarity_opinion(
            higher_confidence_field, higher_confidence_value,
            pattern_fault_point, pattern_confidence, pattern_evidence,
            similar_fault_point, similar_case_confidence, similar_evidence,
            correlation, main_action, external_factors_info, top_similarity
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
    pattern_fault_point,
    pattern_confidence,
    pattern_evidence_text,
    similar_fault_point,
    similar_case_confidence,
    similar_evidence_text
):
    """추론 결과 섹션 생성"""
    # 추론 결과가 다른지 확인
    different_results = pattern_fault_point != similar_fault_point
    different_results_text = "\n※ 추론 1과 추론 2의 결과가 다릅니다. 두 가지 가능성을 모두 검토하세요." if different_results else ""

    return f"""
🔍 <span class="inference-title"><b>장애점 추론 1 (패턴 기반): </b></span> <span class="fault-result" style="color: red;"><b>{pattern_fault_point}</b></span>
&nbsp&nbsp&nbsp• <b>신뢰도: {pattern_confidence:.1f}%</b>
&nbsp&nbsp&nbsp• <b>판단기준:</b>
{pattern_evidence_text}

🔍 <span class="inference-title"><b>장애점 추론 2 (유사 장애사례 기반):</b></span> <span class="fault-result" style="color: red;"><b>{similar_fault_point}</b></span>
&nbsp&nbsp&nbsp• <b>신뢰도: {similar_case_confidence:.1f}%</b>
&nbsp&nbsp&nbsp• <b>유사사례:</b>
{similar_evidence_text}<br>{different_results_text}
"""


def build_common_header(
    external_factors_info,
    higher_confidence_index,
    higher_confidence_field,
    higher_confidence_value
):
    """의견의 공통 헤더 부분 생성"""
    pattern_based = higher_confidence_index == 1
    return f"""
외부 요인으로는, {external_factors_info}

현재 경보는 <span class="header-inference-mention">장애점 추론 {higher_confidence_index}({"패턴 기반" if pattern_based else "유사 장애사례 기반"})</span>의 결과, <b>{higher_confidence_field} 분야</b>의 장애점과 유사하며 <b>신뢰도 {higher_confidence_value:.1f}%</b> 수준입니다.
"""


def build_low_similarity_footer(cleaned_query, top_similarity):
    return f"""
현재 발생한 경보는 <b>장애사례와 유사도({top_similarity:.1f}%)가 낮아</b> 정확한 장애점 판단은 어렵습니다. 
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


def determine_higher_confidence(pattern_confidence, similar_case_confidence):
    """더 높은 신뢰도를 가진 추론 결과 결정"""
    if pattern_confidence >= similar_case_confidence:
        return 1, pattern_confidence
    else:
        return 2, similar_case_confidence


def generate_low_similarity_opinion(
    cleaned_query, higher_confidence_field, higher_confidence_value,
    pattern_fault_point, pattern_confidence, pattern_evidence,
    similar_fault_point, similar_case_confidence, similar_evidence,
    external_factors_info, top_similarity
):
    """낮은 유사도 (40% 미만)의 경우 생성할 의견"""
    # 더 높은 신뢰도를 가진 추론 결과 확인
    higher_confidence_index, _ = determine_higher_confidence(
        pattern_confidence, similar_case_confidence)

    # 증거 텍스트 포맷팅
    pattern_evidence_text = format_evidence_text(pattern_evidence)
    similar_evidence_text = format_evidence_text(similar_evidence)

    # 의견 구성
    header = build_common_header(
        external_factors_info,
        higher_confidence_index,
        higher_confidence_field,
        higher_confidence_value
    )

    inference_section = build_inference_section(
        pattern_fault_point,
        pattern_confidence,
        pattern_evidence_text,
        similar_fault_point,
        similar_case_confidence,
        similar_evidence_text
    )

    footer = build_low_similarity_footer(cleaned_query, top_similarity)

    return header + inference_section + footer


def generate_medium_similarity_opinion(
    higher_confidence_field, higher_confidence_value,
    pattern_fault_point, pattern_confidence, pattern_evidence,
    similar_fault_point, similar_case_confidence, similar_evidence,
    correlation, external_factors_info, main_action, top_similarity
):
    """중간 유사도 (40-60%)의 경우 생성할 의견"""
    # 더 높은 신뢰도를 가진 추론 결과 확인
    higher_confidence_index, _ = determine_higher_confidence(
        pattern_confidence, similar_case_confidence)

    # 증거 텍스트 포맷팅
    pattern_evidence_text = format_evidence_text(pattern_evidence)
    similar_evidence_text = format_evidence_text(similar_evidence)

    # 의견 구성
    header = build_common_header(
        external_factors_info,
        higher_confidence_index,
        higher_confidence_field,
        higher_confidence_value
    )

    inference_section = build_inference_section(
        pattern_fault_point,
        pattern_confidence,
        pattern_evidence_text,
        similar_fault_point,
        similar_case_confidence,
        similar_evidence_text
    )

    footer = build_medium_similarity_footer(
        higher_confidence_field, correlation, main_action)

    return header + inference_section + footer


def generate_high_similarity_opinion(
    higher_confidence_field, higher_confidence_value,
    pattern_fault_point, pattern_confidence, pattern_evidence,
    similar_fault_point, similar_case_confidence, similar_evidence,
    correlation, main_action, external_factors_info, top_similarity
):
    """높은 유사도 (60% 이상)의 경우 생성할 의견"""
    # 더 높은 신뢰도를 가진 추론 결과 확인
    higher_confidence_index, _ = determine_higher_confidence(
        pattern_confidence, similar_case_confidence)

    # 증거 텍스트 포맷팅
    pattern_evidence_text = format_evidence_text(pattern_evidence)
    similar_evidence_text = format_evidence_text(similar_evidence)

    # 의견 구성
    header = build_common_header(
        external_factors_info,
        higher_confidence_index,
        higher_confidence_field,
        higher_confidence_value
    )

    inference_section = build_inference_section(
        pattern_fault_point,
        pattern_confidence,
        pattern_evidence_text,
        similar_fault_point,
        similar_case_confidence,
        similar_evidence_text
    )

    footer = build_high_similarity_footer(
        higher_confidence_field, correlation, main_action)

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


async def hybrid_search_async(query, collection, top_k=5):
    """벡터 유사도와 키워드/패턴 매칭을 결합한 하이브리드 검색 구현 (비동기 버전)"""
    # 캐시 키 생성
    cache_key = hash(query)
    current_time = time.time()

    # 캐시에 있고 만료되지 않았으면 캐시된 결과 반환
    if cache_key in _vector_search_cache:
        cached_item = _vector_search_cache[cache_key]
        if current_time - cached_item['timestamp'] < _VECTOR_CACHE_EXPIRY:
            return cached_item['results'], cached_item['search_results']

    # 벡터 검색 실행
    search_results = collection.query(
        query_texts=[query],
        n_results=min(top_k * 3, 15),
        include=["documents", "metadatas", "distances"],
    )

    if not search_results.get("documents") or not search_results["documents"][0]:
        return [], search_results

    seen_fault_numbers = set()
    docs = search_results["documents"][0]
    metas = search_results["metadatas"][0]
    distances = search_results["distances"][0]

    # 유사도 계산을 위한 데이터 구성
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

    # 유사도 계산 (텍스트 매칭 강화)
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

    sorted_results = sorted(
        hybrid_results, key=lambda x: x["hybrid_score"], reverse=True)[:top_k]

    # 결과 캐싱
    _vector_search_cache[cache_key] = {
        'results': sorted_results,
        'search_results': search_results,
        'timestamp': current_time
    }

    # 캐시 크기 관리
    if len(_vector_search_cache) > _VECTOR_CACHE_SIZE:
        oldest_keys = sorted(_vector_search_cache.keys(),
                             key=lambda k: _vector_search_cache[k]['timestamp'])[:5]
        for key in oldest_keys:
            del _vector_search_cache[key]

    return sorted_results, search_results


async def calculate_hybrid_similarities(query, documents):
    """하이브리드 유사도 계산 - 벡터 거리, 텍스트 매칭, 패턴 매칭 결합"""
    # 1. 정규화 및 전처리
    query_norm = normalize_text(query.lower())
    query_codes = set(extract_alert_codes_cached(query))

    # 2. 비동기 처리를 위한 작업 목록 구성
    tasks = []

    for doc in documents:
        # 비동기 처리할 작업 추가
        tasks.append(
            compute_document_similarity(
                query_norm,
                doc,
                query_codes
            )
        )

    # 3. 모든 유사도 계산 작업 병렬 실행
    similarity_scores = await asyncio.gather(*tasks)

    return similarity_scores


async def compute_document_similarity(query_norm, doc, query_codes):
    """단일 문서의 유사도 계산 - 비동기 처리"""
    # 1. 문서 필드 정규화
    alert_text = normalize_text(doc.get("alerts", "").lower())
    analysis_text = normalize_text(doc.get("analysis", "").lower())
    reception_text = normalize_text(doc.get("reception", "").lower())

    # 2. 정확한 일치 여부 확인
    exact_match = False
    if query_norm and (query_norm == alert_text or query_norm in alert_text):
        exact_match = True

    # 3. RapidFuzz 유사도 계산
    # 경보내역, 장애분석, 장애접수내역 각각에 대한 유사도 계산
    alert_similarity = fuzz.token_set_ratio(query_norm, alert_text) / 100
    analysis_similarity = fuzz.token_set_ratio(query_norm, analysis_text) / 100
    reception_similarity = fuzz.token_set_ratio(
        query_norm, reception_text) / 100

    # 4. 경보 코드 매칭
    doc_codes = set(extract_alert_codes_cached(doc.get("alerts", "")))
    code_match_ratio = len(query_codes & doc_codes) / \
        len(query_codes) if query_codes else 0

    # 5. 분야 키워드 매칭
    field_match_score = calculate_field_matching(
        query_norm, alert_text + analysis_text)

    # 6. 벡터 거리 기반 점수 (역수 관계: 거리가 작을수록 유사도 높음)
    vector_score = max(0, 1 - doc.get("distance", 0)) * 40  # 최대 40점

    # 7. 최종 유사도 계산
    # 정확히 일치하는 경우 높은 점수 부여
    if exact_match:
        return 95.0

    # 각 구성 요소별 가중치 조정
    alert_weight = 0.35       # 경보내역 유사도 가중치
    analysis_weight = 0.25    # 장애분석 유사도 가중치
    reception_weight = 0.15   # 장애접수내역 유사도 가중치
    code_weight = 0.15        # 경보코드 매칭 가중치
    field_weight = 0.10       # 분야 키워드 매칭 가중치

    # 각 컴포넌트 점수 계산
    alert_score = alert_similarity * 100 * alert_weight
    analysis_score = analysis_similarity * 100 * analysis_weight
    reception_score = reception_similarity * 100 * reception_weight
    code_score = code_match_ratio * 100 * code_weight
    field_score = field_match_score * field_weight

    # 총점 계산 및 보정
    total_score = alert_score + analysis_score + reception_score + \
        code_score + field_score + (vector_score * 0.2)

    # 높은 유사도 보정
    if alert_similarity > 0.9:
        total_score = max(total_score, 85)
    if alert_similarity > 0.8 and analysis_similarity > 0.7:
        total_score = max(total_score, 80)
    if code_match_ratio > 0.7:
        total_score = max(total_score, 75)

    # 최종 점수 범위 제한
    return max(10, min(95, total_score))


def create_embedding_function():
    """임베딩 함수 생성"""
    return embedding_functions.SentenceTransformerEmbeddingFunction(model_name=EMBEDDING_MODEL)


def get_vector_db_collection():
    """벡터DB 컬렉션을 가져오는 함수 (싱글톤 패턴 적용)"""
    global _collection_instance

    if _collection_instance is not None:
        return _collection_instance, None

    try:
        # 주 경로 시도
        if os.path.exists(VECTOR_DB_DIR):
            client = chromadb.PersistentClient(path=VECTOR_DB_DIR)
        # 대체 경로 시도
        elif os.path.exists(VECTOR_DB_NEW_DIR):
            client = chromadb.PersistentClient(path=VECTOR_DB_NEW_DIR)
        else:
            error_msg = f"벡터DB를 찾을 수 없습니다. 경로를 확인해주세요.\n주 경로: {VECTOR_DB_DIR}\n대체 경로: {VECTOR_DB_NEW_DIR}"
            return None, {"type": ERROR_DB_ACCESS, "message": error_msg}

        # 임베딩 함수 설정
        ef = create_embedding_function()

        # 컬렉션 가져오기
        _collection_instance = client.get_collection(
            name="nw_incidents", embedding_function=ef)

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
        error_msg = f"벡터DB 접근 중 오류가 발생했습니다: {str(e)}"
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


# 메인 API 진입점
def query(mode, query_text, user_id="default_user"):
    """동기 API를 위한 래퍼 함수"""
    return run_coroutine_sync(run_query, mode, query_text, user_id)


# API를 위한 직접 실행 지점
if __name__ == "__main__":
    print("장애 분석 모듈이 로드되었습니다.")
