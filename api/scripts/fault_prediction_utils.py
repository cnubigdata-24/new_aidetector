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

# 7단계 패턴 분석을 위한 상수들
TRANSMISSION_PATTERNS = {
    "LOS": [
        "LOS", "Loss of Signal", "Loss Of Signal", "LOSS_OF_SIGNAL",
        "LOS-", "LOS_", "신호손실", "광신호 손실", "전기신호 손실",
        "입력신호 없음", "Signal Loss", "NO SIGNAL"
    ],
    "LOF": [
        "LOF", "Loss of Frame", "Loss Of Frame", "LOSS_OF_FRAME",
        "LOF-", "LOF_", "프레임손실", "입력프레임 없음", "Frame Loss",
        "NO FRAME", "FRAME_LOSS"
    ]
}

EXCHANGE_PATTERNS = {
    "A1935": "A1935",
    "A1930": "A1930",
    # 추가 교환 관련 경보 패턴
    "EXCHANGE_ALARMS": [
        "A1935", "A1930", "CGW", "AGW"
    ]
}

IP_PATTERNS = {
    # 심각도 레벨 패턴을 더 포괄적으로 확장
    "SEVERITY": [
        "'M'", "'C'", "Major", "Critical", "Cri", "Maj",
        "C", "M", "'Critical'", "'Major'", "'Cri'", "'Maj'",
        "CRITICAL", "MAJOR", "CRI", "MAJ",
        "Severity: C", "Severity: M", "Severity=C", "Severity=M",
        "Level: Critical", "Level: Major", "Priority: High", "Priority: Critical"
    ],
    "SNMP": "SNMP OperStatus",
    "TARGET_EQUIPMENT": [
        "대용량 OLT", "주중계", "MNP", "신인증 SER", "OLT"
    ],
    # 추가 IP 관련 경보 패턴
    "IP_ALARMS": [
        "LINK DOWN", "LINK FAIL", "PORT DOWN", "INTERFACE DOWN",
        "BGP", "OSPF", "RIP", "VRRP", "HSRP", "STP", "RSTP",
        "VLAN", "QoS", "CPU High", "Memory High", "Disk Full",
        "Temperature High", "Fan Fail", "Power Supply Fail"
    ]
}

WIRELESS_PATTERNS = {
    "NE3S": "Timeout connecting to NE3S",
    "TOP_BTS": [
        "ToP reference missing", "BTS reference clock missing",
        "GPS 동기 실패", "시각 동기 실패", "클럭 동기 실패",
        "Reference Clock Loss", "Clock Sync Fail"
    ]
}

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
        score = sum(1 for keyword in keywords if keyword.lower()
                    in text.lower())
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
    highest_field = max(field_equipment_counts.items(), key=lambda x: x[1])[
        0] if field_equipment_counts else "기타"

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
                mentioned_fields = sum(
                    1 for count in field_equipment_counts.values() if count > 0)
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
            explanations.append(
                f"'{equip}'는 상위 장비이며 {', '.join(lower_equips)}의 상위에 위치합니다.")
            explanations.append(
                f"'{equip}' 장애 시 {', '.join(lower_equips)}에도 영향을 미칠 수 있습니다.")

        # 하위 장비인 경우
        if equip in EQUIPMENT_HIERARCHY["하위장비"]:
            higher_equips = EQUIPMENT_HIERARCHY["하위장비"][equip]
            explanations.append(
                f"'{equip}'는 하위 장비이며 {', '.join(higher_equips)}의 하위에 위치합니다.")
            explanations.append(
                f"'{equip}'가 정상인데 경보가 발생한다면 상위 장비인 {', '.join(higher_equips)} 문제일 수 있습니다.")

    return "\n".join(explanations)

#################
# 7단계 패턴 분석 헬퍼 함수들 #
#################


def count_alert_pattern(query, pattern):
    """특정 경보 패턴의 발생 횟수를 카운트"""
    if isinstance(pattern, list):
        return sum(query.count(p) for p in pattern)
    return query.count(pattern)


def has_field_alerts(field_equipment_counts, *fields):
    """지정된 분야들에서 경보가 있는지 확인"""
    return any(field_equipment_counts.get(field, 0) > 0 for field in fields)


def check_transmission_los_lof_patterns(query):
    """전송 분야 LOS/LOF 패턴 확인 (개선된 버전)"""
    query_upper = query.upper()
    query_lower = query.lower()

    patterns_found = {}

    # LOS 패턴 확인 (대소문자 구분 없이)
    for pattern in TRANSMISSION_PATTERNS["LOS"]:
        if pattern.upper() in query_upper or pattern.lower() in query_lower:
            patterns_found["LOS"] = {
                "pattern": pattern,
                "type": "신호손실",
                "description": "광신호/전기적 신호 손실로 입력 신호 없음",
                "fault_probability": "99% 확률로 대항국 장비나 선로 단선 추정"
            }
            break

    # LOF 패턴 확인 (대소문자 구분 없이)
    for pattern in TRANSMISSION_PATTERNS["LOF"]:
        if pattern.upper() in query_upper or pattern.lower() in query_lower:
            patterns_found["LOF"] = {
                "pattern": pattern,
                "type": "프레임손실",
                "description": "광신호/전기적 신호 손실로 입력 프레임 없음",
                "fault_probability": "99% 확률로 대항국 장비 불량"
            }
            break

    # TRANSMISSION_ALARMS가 제거되었으므로 이 부분을 주석 처리
    # transmission_alarm_count = 0
    # found_alarms = []
    # for pattern in TRANSMISSION_PATTERNS.get("TRANSMISSION_ALARMS", []):
    #     if pattern.upper() in query_upper:
    #         transmission_alarm_count += query_upper.count(pattern.upper())
    #         if pattern not in found_alarms:
    #             found_alarms.append(pattern)

    # if transmission_alarm_count > 0:
    #     patterns_found["TRANSMISSION_ALARMS"] = {
    #         "count": transmission_alarm_count,
    #         "alarms": found_alarms[:5],  # 상위 5개만 표시
    #         "type": "전송계층경보"
    #     }

    return patterns_found


def check_exchange_a_patterns(query):
    """교환 분야 A1935/A1930 패턴 확인 (개선된 버전)"""
    patterns_found = {}

    # A1935 패턴 확인
    a1935_count = query.count(EXCHANGE_PATTERNS["A1935"])
    if a1935_count > 0:
        patterns_found["A1935"] = {
            "count": a1935_count,
            "is_valid": a1935_count >= 100,  # 100개 이상이 유효
            "description": "CGW 또는 CGW 연동장비 장애 패턴",
            "threshold": "100개 이상 발생 시 유효한 경보"
        }

    # A1930 패턴 확인
    a1930_count = query.count(EXCHANGE_PATTERNS["A1930"])
    if a1930_count > 0:
        patterns_found["A1930"] = {
            "count": a1930_count,
            "is_single": a1930_count == 1,
            "is_multiple": a1930_count >= 10,
            "single_description": "AGW 단독고장으로 공통부 장애점 가능",
            "multiple_description": "다량 발생 시 IP/전송 분야 시스템 장애 또는 상위 장비 장애"
        }

    # 추가 교환 경보 패턴 확인
    exchange_alarm_count = 0
    found_alarms = []
    for pattern in EXCHANGE_PATTERNS["EXCHANGE_ALARMS"]:
        if pattern in query:
            exchange_alarm_count += query.count(pattern)
            if pattern not in found_alarms:
                found_alarms.append(pattern)

    if exchange_alarm_count > 0:
        patterns_found["EXCHANGE_ALARMS"] = {
            "count": exchange_alarm_count,
            "alarms": found_alarms[:5],
            "type": "교환시스템경보"
        }

    return patterns_found


def check_ip_severity_patterns(query):
    """IP 분야 심각도 패턴 확인 (개선된 버전)"""
    patterns_found = {}

    # 심각도 레벨 확인 (더 포괄적인 패턴 매칭)
    severity_found = []
    critical_indicators = ["Critical", "C",
                           "Cri", "치명적", "심각", "CRITICAL", "CRI"]
    major_indicators = ["Major", "M", "Maj", "중요", "주요", "MAJOR", "MAJ"]

    for severity in IP_PATTERNS["SEVERITY"]:
        if severity in query:
            # 심각도 레벨 분류 (confidence_boost 값을 절반 수준으로 낮춤)
            if any(indicator in severity for indicator in critical_indicators):
                severity_level = "Critical"
                confidence_boost = 1.1  # Critical은 더 높은 신뢰도
            elif any(indicator in severity for indicator in major_indicators):
                severity_level = "Major"
                confidence_boost = 1.05  # Major는 중간 신뢰도
            else:
                severity_level = "Unknown"
                confidence_boost = 1.0

            severity_found.append({
                "pattern": severity,
                "level": severity_level,
                "confidence_boost": confidence_boost
            })

    if severity_found:
        # 가장 높은 심각도 선택
        best_severity = max(
            severity_found, key=lambda x: x["confidence_boost"])
        patterns_found["severity"] = best_severity

    # SNMP OperStatus 확인
    if IP_PATTERNS["SNMP"] in query:
        patterns_found["snmp"] = {
            "found": True,
            "description": "SNMP 운영 상태 경보 - 연결된 선로 장애 가능"
        }

        # 대상 장비 확인 (대소문자 구분 없이)
        mentioned_equipment = []
        query_upper = query.upper()
        for equipment in IP_PATTERNS["TARGET_EQUIPMENT"]:
            if equipment.upper() in query_upper:
                mentioned_equipment.append(equipment)

        if mentioned_equipment:
            patterns_found["target_equipment"] = {
                "equipment": mentioned_equipment,
                "description": "연결된 선로가 장애점일 가능성 높음"
            }

    # 추가 IP 경보 패턴 확인
    ip_alarm_count = 0
    found_alarms = []
    query_upper = query.upper()
    for pattern in IP_PATTERNS["IP_ALARMS"]:
        if pattern.upper() in query_upper:
            ip_alarm_count += query_upper.count(pattern.upper())
            if pattern not in found_alarms:
                found_alarms.append(pattern)

    if ip_alarm_count > 0:
        patterns_found["IP_ALARMS"] = {
            "count": ip_alarm_count,
            "alarms": found_alarms[:5],
            "type": "IP시스템경보"
        }

    return patterns_found


def check_wireless_ne3s_top_patterns(query):
    """무선 분야 NE3S/ToP 패턴 확인 (개선된 버전)"""
    patterns_found = {}

    # NE3S Timeout 패턴 확인
    if WIRELESS_PATTERNS["NE3S"] in query:
        patterns_found["ne3s_timeout"] = {
            "found": True,
            "description": "NE3S 연결 시간초과 - 무선 DU 집선스위치 또는 상위망 장애",
            "analysis_needed": "IP/전송 분야 경보 여부 확인 필요"
        }

    # ToP/BTS reference 패턴 확인 (대소문자 구분 없이)
    query_lower = query.lower()
    for pattern in WIRELESS_PATTERNS["TOP_BTS"]:
        if pattern.lower() in query_lower:
            patterns_found["top_bts_reference"] = {
                "pattern": pattern,
                "description": "ToP/BTS 기준 클럭 누락 - 클럭 동기 문제",
                "analysis_needed": "IP/전송 분야 경보 여부 확인 필요"
            }
            break

    # WIRELESS_ALARMS가 제거되었으므로 이 부분을 주석 처리
    # wireless_alarm_count = 0
    # found_alarms = []
    # query_upper = query.upper()
    # for pattern in WIRELESS_PATTERNS.get("WIRELESS_ALARMS", []):
    #     if pattern.upper() in query_upper:
    #         wireless_alarm_count += query_upper.count(pattern.upper())
    #         if pattern not in found_alarms:
    #             found_alarms.append(pattern)

    # if wireless_alarm_count > 0:
    #     patterns_found["WIRELESS_ALARMS"] = {
    #         "count": wireless_alarm_count,
    #         "alarms": found_alarms[:5],
    #         "type": "무선시스템경보"
    #     }

    return patterns_found


def detect_advanced_ip_severity_patterns(query):
    """고급 IP 심각도 패턴 검출"""
    advanced_patterns = {
        "syslog_severity": re.compile(r'severity[:\s]*([CM]|Critical|Major|Cri|Maj)', re.IGNORECASE),
        "log_level": re.compile(r'level[:\s]*([CM]|Critical|Major|Cri|Maj)', re.IGNORECASE),
        "priority": re.compile(r'priority[:\s]*(high|critical|major)', re.IGNORECASE),
        "alarm_grade": re.compile(r'(경보등급|알람등급)[:\s]*(심각|중요|치명)', re.IGNORECASE)
    }

    detected_patterns = {}
    for pattern_name, regex in advanced_patterns.items():
        match = regex.search(query)
        if match:
            detected_patterns[pattern_name] = match.group(1)

    return detected_patterns


def detect_advanced_transmission_patterns(query):
    """고급 전송 패턴 검출"""
    advanced_patterns = {
        "sdh_alarm": re.compile(r'(AU-AIS|TU-AIS|HP-AIS|LP-AIS|MS-AIS|RS-AIS)', re.IGNORECASE),
        "sonet_alarm": re.compile(r'(LOP|AIS|RDI|REI|TIM)', re.IGNORECASE),
        "interface_alarm": re.compile(r'(STM-\d+|OC-\d+|E[13]|T[13])', re.IGNORECASE)
    }

    detected_patterns = {}
    for pattern_name, regex in advanced_patterns.items():
        matches = regex.findall(query)
        if matches:
            detected_patterns[pattern_name] = matches

    return detected_patterns


def calculate_confidence_with_field_priority(base_confidence, field, pattern_type):
    """분야와 패턴 타입에 따른 신뢰도 조정"""
    # 분야별 기본 가중치 (절반 수준으로 낮춤)
    field_weights = {
        "선로": 1.05,   # 선로 장애는 영향 범위가 크므로 높은 가중치
        "MW": 1.03,    # MW 페이딩도 다른 분야에 영향
        "전송": 1.04,   # 전송 분야는 명확한 패턴이 있음
        "교환": 1.03,   # 교환 분야도 명확한 패턴
        "IP": 1.035,    # IP 분야 심각도 레벨이 중요
        "무선": 1.04,   # 무선 분야는 상황에 따라 다름
        "전원": 1.01    # 전원 문제는 보조적
    }

    # 패턴 타입별 가중치 (절반 수준으로 낮춤)
    pattern_weights = {
        "1단계": 1.05,  # 선로 경보는 최고 우선순위
        "2단계": 1.04,  # MW 경보
        "3단계": 1.03,  # 상위장비 경보
        "4단계": 1.04,  # 전송 분야 특정 패턴
        "5단계": 1.035,  # 교환 분야 특정 패턴
        "6단계": 1.035,  # IP 분야 특정 패턴
        "7단계": 1.04  # 무선 분야 특정 패턴
    }

    # 가중치 적용
    field_weight = field_weights.get(field, 1.0)

    # 패턴 타입에서 단계 추출
    step = pattern_type.split(
        "단계")[0] + "단계" if "단계" in pattern_type else pattern_type
    pattern_weight = pattern_weights.get(step, 1.0)

    # 최종 신뢰도 계산 (최대 95% 제한)
    final_confidence = min(95.0, base_confidence *
                           field_weight * pattern_weight)

    return round(final_confidence, 1)


def validate_pattern_conditions(query, field_equipment_counts, required_fields=None, min_field_count=None):
    """패턴 조건 검증"""
    # 필수 분야 확인
    if required_fields:
        if not has_field_alerts(field_equipment_counts, *required_fields):
            return False

    # 최소 분야 개수 확인
    if min_field_count:
        active_fields = sum(
            1 for count in field_equipment_counts.values() if count > 0)
        if active_fields < min_field_count:
            return False

    return True


def enhanced_pattern_analysis(query, field_equipment_counts):
    """통합된 고급 패턴 분석"""
    analysis_result = {
        "transmission": check_transmission_los_lof_patterns(query),
        "exchange": check_exchange_a_patterns(query),
        "ip": check_ip_severity_patterns(query),
        "wireless": check_wireless_ne3s_top_patterns(query),
        "advanced_ip": detect_advanced_ip_severity_patterns(query),
        "advanced_transmission": detect_advanced_transmission_patterns(query)
    }

    # 패턴 우선순위 결정
    priority_score = 0
    critical_patterns = []

    # 전송 분야 LOS/LOF 패턴 (최고 우선순위) - 절반 수준으로 낮춤
    if "LOS" in analysis_result["transmission"] or "LOF" in analysis_result["transmission"]:
        priority_score += 25
        critical_patterns.append("전송계층 신호/프레임 손실")

    # IP 심각도 패턴 (높은 우선순위) - 절반 수준으로 낮춤
    if "severity" in analysis_result["ip"]:
        severity_info = analysis_result["ip"]["severity"]
        if severity_info["level"] == "Critical":
            priority_score += 20
            critical_patterns.append("IP Critical 심각도")
        elif severity_info["level"] == "Major":
            priority_score += 15
            critical_patterns.append("IP Major 심각도")

    # 교환 분야 A 패턴 - 절반 수준으로 낮춤
    if "A1935" in analysis_result["exchange"] and analysis_result["exchange"]["A1935"]["is_valid"]:
        priority_score += 17
        critical_patterns.append("교환 A1935 다량 발생")

    if "A1930" in analysis_result["exchange"]:
        a1930_info = analysis_result["exchange"]["A1930"]
        if a1930_info["is_single"]:
            priority_score += 12
            critical_patterns.append("교환 A1930 단독 발생")
        elif a1930_info["is_multiple"]:
            priority_score += 10
            critical_patterns.append("교환 A1930 다량 발생")

    analysis_result["priority_score"] = priority_score
    analysis_result["critical_patterns"] = critical_patterns

    return analysis_result
