"""
장애 예측 유틸리티 모듈
"""

import re
from functools import lru_cache
from rapidfuzz import process, fuzz

# 상수 로드
from api.scripts.fault_prediction_constants import (
    FIELD_KEYWORDS,
    ALERT_PATTERNS,
    EQUIPMENT_HIERARCHY,
    SPECIALIZED_FAULT_PATTERNS
)

# 전역 변수
_field_cache = {}

# 사전 컴파일된 정규식 패턴들
ALERT_CODE_PATTERNS = [
    re.compile(r"[A-Z0-9]+_[A-Z0-9]+"), 
    re.compile(r"[A-Z0-9]+-[A-Z0-9-]+"), 
    re.compile(r"[A-Z][0-9]{4}"),
    re.compile(r"(?:Port|Link)\s+Down", re.IGNORECASE),
    re.compile(r"(?:STM|OC)-\d+", re.IGNORECASE),
    re.compile(r"UP\d+\s+LINK\s+(?:ALL\s+)?FAIL", re.IGNORECASE)
]

##############
# 문자열 처리 #
##############
# 텍스트 정규화
def normalize_text(text):
    
    if not text:
        return ""
        
    # 소문자 변환
    text = text.lower()
    # 정규식은 한 번에 처리
    text = re.sub(r"[^\w\s가-힣]", " ", text, flags=re.UNICODE)
    text = re.sub(r"\s+", " ", text)
    return text.strip()

# 경보 코드 추출 (캐시 확장 및 최적화)
@lru_cache(maxsize=2048)
def extract_alert_codes_cached(alert_text: str) -> tuple:
    if not alert_text:
        return tuple()
        
    all_codes = set()
    
    # 사전 컴파일된 패턴 사용
    for pattern in ALERT_CODE_PATTERNS:
        all_codes.update(pattern.findall(alert_text))

    return tuple(all_codes)[:20]  # 상위 20개만 반환

    
# 경보 메시지에서 중요 경보 패턴을 추출하고 중복을 제거 (최적화)
def clean_alert_message(message):
    if not message:
        return "경보 없음"
        
    # 모든 알람 패턴 사전 컴파일 (ALERT_PATTERNS 상수에서 가져옴)
    alerts = []
    
    # ALERT_PATTERNS에서 키 값을 무시하고 모든 패턴 모음
    all_patterns = []
    for patterns_group in ALERT_PATTERNS.values():
        all_patterns.extend(patterns_group)
        
    # 패턴 검색 최적화
    for pattern in all_patterns:
        matches = re.findall(pattern, message)
        if isinstance(matches, list):
            alerts.extend([m for m in matches if m and isinstance(m, str)])

    # 중복 제거
    unique_alerts = set(alerts)

    # 결과가 없는 경우 백업 패턴 사용
    if not unique_alerts:
        backup_patterns = [
            r"\(([^()]+(?:\([^()]*\)[^()]*)*)\)",
            r"([A-Z]{2,}(?:[_-][A-Z0-9]+)+)",
            r"([A-Z]{2,}\s+[A-Za-z0-9]+\s+[A-Za-z0-9]+(?:\s+[A-Za-z0-9]+)?)",
        ]

        for pattern in backup_patterns:
            backup_matches = re.findall(pattern, message)
            for match in backup_matches:
                if (
                    match
                    and isinstance(match, str)
                    and not any(match.startswith(prefix) for prefix in 
                               ["IP 분야", "전송 분야", "M/W 분야", "교환 분야"])
                ):
                    unique_alerts.add(match)

    return ", ".join(unique_alerts) if unique_alerts else "경보 없음"

# 분야별 키워드 매칭 점수 계산
def calculate_field_matching(query, doc_text):
    query_fields = set()
    doc_fields = set()
    
    # 쿼리와 문서에서 발견된 분야 수집
    for field, keywords in FIELD_KEYWORDS.items():
        if any(kw.lower() in query for kw in keywords):
            query_fields.add(field)
        if any(kw.lower() in doc_text for kw in keywords):
            doc_fields.add(field)
    
    # 공통 분야 비율 계산
    common_fields = query_fields & doc_fields
    matching_score = len(common_fields) * 100 / max(1, len(query_fields))
    
    return matching_score

# 텍스트에서 키워드 기반으로 분야 식별 (캐싱 적용)
def identify_field_from_keywords(text, field_map=None):
    if not text:
        return "기타"
        
    # 캐시 확인
    cache_key = hash(text)
    if cache_key in _field_cache:
        return _field_cache[cache_key]
        
    if field_map is None:
        field_map = FIELD_KEYWORDS
    
    # 각 분야별 매칭 키워드 수 계산
    field_scores = {}
    for field, keywords in field_map.items():
        # 정규식 대신 단순 문자열 포함 여부 확인 (더 빠름)
        score = sum(1 for keyword in keywords if keyword.lower() in text.lower())
        if score > 0:
            field_scores[field] = score

    # 가장 많이 매칭된 분야 반환
    result = "기타"
    if field_scores:
        result = max(field_scores.items(), key=lambda x: x[1])[0]
        
    # 결과 캐싱
    _field_cache[cache_key] = result
    return result


#################
# 장비 관련 함수 #
#################

# 상위 장비와 하위 장비의 관계를 확인
def is_higher_equipment(higher_equip, lower_equip):
    if higher_equip in EQUIPMENT_HIERARCHY["상위장비"]:
        return lower_equip in EQUIPMENT_HIERARCHY["상위장비"][higher_equip]
    return False

# 특정 장비의 상위 장비 목록을 반환하는 함수
def get_higher_equipment(equipment):
    higher_equipments = []
    if equipment in EQUIPMENT_HIERARCHY["하위장비"]:
        return EQUIPMENT_HIERARCHY["하위장비"][equipment]
    
    # 직접 순회하며 확인
    for higher, lowers in EQUIPMENT_HIERARCHY["상위장비"].items():
        if equipment in lowers:
            higher_equipments.append(higher)
            
    return higher_equipments

# 특정 장비의 하위 장비 목록을 반환하는 함수
def get_lower_equipment(equipment):
    if equipment in EQUIPMENT_HIERARCHY["상위장비"]:
        return EQUIPMENT_HIERARCHY["상위장비"][equipment]
    return []

# 쿼리 언급 장비들을 분석하여 상위-하위 관계를 파악
def analyze_equipment_mentions(query, field_equipment_counts):
    """
    Args:
        query (str): 사용자 쿼리
        field_equipment_counts (dict): 분야별 장비 언급 횟수
        
    Returns:
        dict: 장비 분석 결과
            {
                "mentioned_equipment": dict,  # 언급된 모든 장비와 그 횟수
                "potential_fault_points": list,  # 잠재적 장애점 후보 목록
                "hierarchy_matches": list,  # 감지된 상위-하위 장비 관계
                "most_mentioned_field": str,  # 가장 많이 언급된 분야
            }
    """
    
    # 쿼리 전처리
    query_lower = query.lower()
    
    # 언급된 장비 추출
    mentioned_equipment = {}
    for field, keywords in FIELD_KEYWORDS.items():
        for keyword in keywords:
            # 일반 키워드가 아닌 실제 장비명인지 확인 (간단한 휴리스틱)
            if (len(keyword) >= 2 and not keyword.endswith(' 분야') and 
                not keyword in ['불량', '장애', '다운', '경보']):
                if keyword.lower() in query_lower:
                    if keyword in mentioned_equipment:
                        mentioned_equipment[keyword] += 1
                    else:
                        mentioned_equipment[keyword] = 1
    
    # 잠재적 장애점 후보 분석
    potential_fault_points = []
    hierarchy_matches = []
    
    # 각 상위 장비에 대해 하위 장비 관계 확인
    for higher_equip, lower_equips in EQUIPMENT_HIERARCHY["상위장비"].items():
        if higher_equip.lower() in query_lower:
            # 하위 장비 언급 확인
            mentioned_lower_equips = []
            for lower_equip in lower_equips:
                if lower_equip.lower() in query_lower:
                    mentioned_lower_equips.append(lower_equip)
                    
                    # 계층 관계 기록
                    hierarchy_matches.append({
                        "상위장비": higher_equip,
                        "하위장비": lower_equip
                    })
            
            # 하위 장비가 일정 수 이상 언급되면 장애점 후보로 등록
            if len(mentioned_lower_equips) >= 1:
                potential_fault_points.append({
                    "장비": higher_equip,
                    "하위장비수": len(mentioned_lower_equips),
                    "언급된하위장비": mentioned_lower_equips
                })
    
    # 가장 많이 언급된 분야 확인
    most_mentioned_field = "기타"
    max_count = 0
    for field, count in field_equipment_counts.items():
        if count > max_count:
            max_count = count
            most_mentioned_field = field
    
    return {
        "mentioned_equipment": mentioned_equipment,
        "potential_fault_points": potential_fault_points,
        "hierarchy_matches": hierarchy_matches,
        "most_mentioned_field": most_mentioned_field
    }

# 분야별 특화 패턴에 맞는지 확인
def check_specialized_patterns(query, field_equipment_counts, cleaned_query):   
    from api.scripts.fault_prediction_constants import SPECIALIZED_FAULT_PATTERNS
    
    # 가장 많이 언급된 분야 확인
    highest_field = max(field_equipment_counts.items(), key=lambda x: x[1])[0] if field_equipment_counts else "기타"
    
    # 해당 분야에 특화 패턴이 있는지 확인
    if highest_field in SPECIALIZED_FAULT_PATTERNS:
        patterns = SPECIALIZED_FAULT_PATTERNS[highest_field]
        
        # 각 패턴 확인
        for pattern in patterns:
            conditions = pattern["조건"]
            
            # 키워드 조건 확인
            keyword_match = False
            for keyword in conditions["키워드"]:
                if keyword in cleaned_query or keyword in query:
                    keyword_match = True
                    break
                    
            if not keyword_match:
                continue
                
            # 필수 키워드 수 조건 확인
            if "필수_키워드_수" in conditions:
                if field_equipment_counts.get(highest_field, 0) < conditions["필수_키워드_수"]:
                    continue
            
            # 분야 개수 조건 확인 (있는 경우)
            if "분야_개수" in conditions:
                mentioned_fields = sum(1 for count in field_equipment_counts.values() if count > 0)
                if mentioned_fields < conditions["분야_개수"]:
                    continue
            
            # 하위장비 조건 확인 (있는 경우)
            if "하위장비" in conditions:
                has_lower_equipment = False
                
                for lower_equip_group in conditions["하위장비"]:
                    # OR 조건으로 하위장비 그룹 중 하나라도 언급되면 됨
                    for lower_equip in lower_equip_group:
                        if lower_equip in cleaned_query or lower_equip in query:
                            has_lower_equipment = True
                            break
                    
                    if has_lower_equipment:
                        break
                        
                if not has_lower_equipment:
                    continue
            
            # 모든 조건 충족 - 패턴 매칭 성공
            return pattern["결과"]
    
    # 매칭되는 패턴이 없음
    return None

# 쿼리에 언급된 장비 계층 구조를 설명
def explain_equipment_hierarchy(query):   
    # 쿼리에서 언급된 장비 추출
    mentioned_equipment = []
    for higher_equip in EQUIPMENT_HIERARCHY["상위장비"].keys():
        if higher_equip.lower() in query.lower():
            mentioned_equipment.append(higher_equip)
    
    for lower_equip in EQUIPMENT_HIERARCHY["하위장비"].keys():
        if lower_equip.lower() in query.lower():
            mentioned_equipment.append(lower_equip)
    
    if not mentioned_equipment:
        return "쿼리에서 명확한 장비 언급을 찾을 수 없습니다."
    
    # 장비 계층 구조 설명 생성
    explanations = []
    
    for equip in mentioned_equipment:
        # 상위 장비인 경우
        if equip in EQUIPMENT_HIERARCHY["상위장비"]:
            lower_equips = EQUIPMENT_HIERARCHY["상위장비"][equip]
            explanations.append(f"'{equip}'는 상위 장비이며 {', '.join(lower_equips)}의 상위에 위치합니다.")
            explanations.append(f"'{equip}' 장애 시 {', '.join(lower_equips)}에도 영향을 미칠 수 있습니다.")
        
        # 하위 장비인 경우
        if equip in EQUIPMENT_HIERARCHY["하위장비"]:
            higher_equips = EQUIPMENT_HIERARCHY["하위장비"][equip]
            explanations.append(f"'{equip}'는 하위 장비이며 {', '.join(higher_equips)}의 하위에 위치합니다.")
            explanations.append(f"'{equip}'가 정상인데 경보가 발생한다면 상위 장비인 {', '.join(higher_equips)} 문제일 수 있습니다.")
    
    return "\n".join(explanations)