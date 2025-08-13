"""
경보 패턴 분석 전용 모듈: 경보 패턴을 기반으로 장애점을 추론하는 전문 클래스
"""

import logging
import re
from typing import Dict, List, Optional, Any

# 유틸리티 모듈 임포트
from .fault_prediction_utils import (
    clean_alert_message,
    analyze_equipment_mentions,
    check_specialized_patterns,
    check_transmission_los_lof_patterns,
    detect_advanced_transmission_patterns,
    check_ip_severity_patterns,
    detect_advanced_ip_severity_patterns
)

# 상수 로드
from .fault_prediction_constants import FIELD_KEYWORDS

# 로깅 설정
logger = logging.getLogger(__name__)

class FaultPatternAnalyzer:
    """경보 패턴을 분석하여 장애점을 추론하는 전문 클래스"""
    
    def __init__(self):
        """패턴 분석기 초기화"""
        # 분야 매핑 정보
        self.field_mapping = {
            "전송": ["전송", "전송 분야"],
            "MW": ["MW", "M/W", "마이크로 웨이브", "마이크로웨이브", "M/W 페이딩", "MW 페이딩"],
            "IP": ["IP", "IP 코어", "IP 액세스"],
            "교환": ["교환", "교환 분야"],
            "무선": ["무선", "무선 분야"],
            "선로": ["선로", "케이블", "선로분야"],
            "전원": ["전원"]
        }
        
        # 경보 패턴들
        self.alert_patterns = [
            "<",  # 일반적인 경보 구분자
            "FAIL", "LOSS", "ERROR", "ALARM", "DOWN", "TIMEOUT",
            "AIS", "LOS", "LOF", "SD", "SF", "TIM", "DEG",
            "Critical", "Major", "Minor", "Warning",
            "A1935", "A1930", "NE3S", "SNMP",
            "무응답", "장애", "경보", "알람", "불량"
        ]
    
    async def predict_fault_patterns(self, query: str, top_results: List, 
                                   external_factors: Dict, fault_infer_2_result: Dict) -> Dict:
        """장애점 추론 1: 경보/증상 패턴 기반 장애점 예측 (메인 함수)"""
        # 1. 경보 및 증상 추출
        cleaned_query = clean_alert_message(query)
        query_lower = query.lower()
        
        # 2. 경보 수 계산 (신뢰도 제한용)
        alert_count = self.count_actual_alerts(query)
        logger.info(f"감지된 경보 수: {alert_count}개")
        
        # 3. 분야 우선 식별 및 제약
        detected_fields = self.extract_fields_from_query(query)
        logger.info(f"감지된 분야: {detected_fields}")
        
        # 4. 분야별 장비 발견 빈도 분석
        field_equipment_counts = self.analyze_field_equipment_mentions(query)
        
        # 5. 장비 계층 구조 분석
        equipment_analysis = analyze_equipment_mentions(query, field_equipment_counts)
        
        # 6. 외부 요인 분석
        fading_count = external_factors.get("fading_count", 0)
        power_outage_count = external_factors.get("power_outage_count", 0)
        cable_damage_count = external_factors.get("cable_damage_count", 0)
        
        # 7. 분야가 명확히 식별된 경우 해당 분야 내에서만 추론
        if len(detected_fields) == 1:
            single_field = detected_fields[0]
            logger.info(f"단일 분야 감지됨: {single_field} - 해당 분야 내에서만 추론")
            
            # 단일 분야별 전용 추론
            field_specific_result = self.analyze_single_field_patterns(
                single_field, query, cleaned_query, field_equipment_counts,
                external_factors, alert_count
            )
            if field_specific_result:
                return field_specific_result
        
        # 8. 기존 7단계 패턴 기반 추론 적용 (신뢰도 제한 적용)
        
        # 1단계: 선로(광케이블) 장애 추론
        if cable_damage_count > 0 or any(keyword in cleaned_query for keyword in ["광케이블 피해", "광케이블 장애", "선로 장애"]):
            if sum(field_equipment_counts.values()) >= 3:  # 다수 분야 장비 경보
                confidence = self.calculate_confidence_with_alert_limit(35.0, alert_count)
                return self.create_fault_result("광케이블 장애", "선로", confidence, [
                    f"미복구된 선로 장애가 {cable_damage_count}건 발견됨" if cable_damage_count > 0 else "선로 관련 키워드 발견",
                    "여러 분야 장비 동시 장애는 선로 문제의 특징"
                ], "1단계: 선로 경보 패턴")
        
        # 2단계: MW 페이딩 추론
        if fading_count > 0 or any(keyword in query_lower for keyword in ["페이딩", "fading"]):
            if field_equipment_counts.get("IP", 0) > 0 or field_equipment_counts.get("전송", 0) > 0:
                confidence = self.calculate_confidence_with_alert_limit(32.0, alert_count)
                return self.create_fault_result("MW 페이딩 현상", "MW", confidence, [
                    f"MW 장비 중 변조율이 크게 하락한 장비가 {fading_count}건 발견됨" if fading_count > 0 else "페이딩 관련 키워드 발견",
                    "MW 장비 자체 경보 없이 연결된 장비에서 경보 발생"
                ], "2단계: MW 경보 패턴")
        
        # 3단계: 상위장비 경보 추론
        hierarchy_result = self.analyze_equipment_hierarchy_pattern(equipment_analysis, alert_count)
        if hierarchy_result:
            return hierarchy_result
        
        # 4단계: 전송 분야 LOS/LOF 경보 패턴 분석
        transmission_result = self.analyze_transmission_patterns(
            query, cleaned_query, field_equipment_counts, alert_count)
        if transmission_result:
            return transmission_result
        
        # 5단계: 교환 분야 A1935/A1930 경보 패턴 분석
        exchange_result = self.analyze_exchange_patterns(
            query, cleaned_query, field_equipment_counts, alert_count)
        if exchange_result:
            return exchange_result
        
        # 6단계: IP 분야 Critical/Major/SNMP 경보 패턴 분석
        ip_result = self.analyze_ip_patterns(
            query, cleaned_query, field_equipment_counts, alert_count)
        if ip_result:
            return ip_result
        
        # 7단계: 무선 분야 NE3S/ToP/BTS 경보 패턴 분석
        wireless_result = self.analyze_wireless_patterns(
            query, cleaned_query, field_equipment_counts, alert_count)
        if wireless_result:
            return wireless_result
        
        # 한전 정전 추론
        if power_outage_count > 0 or any(keyword in cleaned_query for keyword in ["배터리 모드", "UPS"]):
            confidence = self.calculate_confidence_with_alert_limit(28.0, alert_count)
            return self.create_fault_result("한전 정전", "전원", confidence, [
                f"배터리 모드로 운용 중인 MW 장비가 {power_outage_count}건 발견됨" if power_outage_count > 0 else "전원 관련 키워드 발견",
                "전원 장애 시 장비들이 배터리 모드로 동작"
            ], "전원 장애 패턴")
        
        # 분야별 특화 패턴 확인
        specialized_pattern_result = check_specialized_patterns(
            query, field_equipment_counts, cleaned_query)
        if specialized_pattern_result:
            original_confidence = specialized_pattern_result.get("신뢰도", 0)
            new_confidence = self.calculate_confidence_with_alert_limit(original_confidence, alert_count)
            specialized_pattern_result["신뢰도"] = new_confidence
            return specialized_pattern_result
        
        # 패턴 기반 분석 (유사 사례 참조)
        if top_results and len(top_results) > 0:
            pattern_confidence = self.calculate_pattern_based_confidence(
                query, top_results, field_equipment_counts, alert_count)
            metadata = top_results[0].get("metadata", {})
            
            return self.create_fault_result(
                metadata.get("장애점", "알 수 없음"),
                metadata.get("장애분야", "알 수 없음"),
                pattern_confidence,
                [
                    f"유사 사례(#{metadata.get('장애번호')})와의 경보 패턴 유사성",
                    f"패턴 매칭 점수 {pattern_confidence:.1f}% 기반 추론"
                ],
                "경보 패턴 분석 기반 추론"
            )
        
        # 기본 응답 (충분한 정보 없음)
        highest_field = equipment_analysis.get("most_mentioned_field", "기타")
        confidence = self.calculate_confidence_with_alert_limit(12.0, alert_count)
        return self.create_fault_result(
            "정보 부족으로 판단 어렵습니다.",
            highest_field if highest_field != "기타" else "알 수 없음",
            confidence,
            [
                "충분한 경보 패턴이 없거나 명확한 장애 징후 부족",
                "더 많은 정보가 필요합니다"
            ],
            "명확한 패턴 없음"
        )
    
    def extract_fields_from_query(self, query: str) -> List[str]:
        """경보 내역에서 분야를 추출하는 함수"""
        found_fields = set()
        query_lower = query.lower()
        
        # 각 분야의 키워드들을 확인
        for standard_field, variants in self.field_mapping.items():
            for variant in variants:
                if variant.lower() in query_lower:
                    found_fields.add(standard_field)
                    break  # 해당 분야에서 하나라도 찾으면 다음 분야로
        
        # FIELD_KEYWORDS도 활용하여 추가 검색
        for field, keywords in FIELD_KEYWORDS.items():
            if field in self.field_mapping:  # 매핑된 분야만 처리
                for keyword in keywords:
                    if keyword.lower() in query_lower:
                        found_fields.add(field)
                        break
        
        return list(found_fields)
    
    def count_actual_alerts(self, query: str) -> int:
        """실제 경보 수를 계산하는 함수"""
        query_upper = query.upper()
        total_alerts = 0
        
        for pattern in self.alert_patterns:
            if pattern == "<":
                # "<" 패턴은 경보 라인의 시작을 의미
                total_alerts += query.count("<")
            else:
                # 다른 패턴들은 단어 경계를 고려하여 카운트
                pattern_count = len(re.findall(r'\b' + re.escape(pattern) + r'\b', query_upper))
                total_alerts += pattern_count
        
        # 최소 1개는 보장 (쿼리가 있으면)
        return max(1, min(total_alerts, 20))  # 최대 20개로 제한
    
    def calculate_confidence_with_alert_limit(self, base_confidence: float, alert_count: int) -> float:
        """경보 수에 따른 신뢰도 제한 적용"""
        if alert_count <= 1:
            # 1개 경보: 최대 20%
            return min(20.0, base_confidence * 0.6)
        elif alert_count <= 2:
            # 2개 경보: 최대 30%
            return min(30.0, base_confidence * 0.75)
        elif alert_count <= 3:
            # 3개 경보: 최대 40%
            return min(40.0, base_confidence * 0.85)
        elif alert_count <= 5:
            # 4-5개 경보: 최대 60%
            return min(60.0, base_confidence * 0.95)
        else:
            # 6개 이상: 원래 신뢰도 유지
            return base_confidence
    
    def analyze_field_equipment_mentions(self, query: str) -> Dict[str, int]:
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
    
    def create_fault_result(self, fault_point: str, fault_field: str, confidence: float, 
                          evidence: List[str], pattern_basis: str) -> Dict:
        """장애점 추론 결과 생성 헬퍼 함수"""
        return {
            "장애점": fault_point,
            "장애분야": fault_field,
            "신뢰도": confidence,
            "근거": evidence,
            "패턴_근거": pattern_basis
        }
    
    def analyze_single_field_patterns(self, field: str, query: str, cleaned_query: str, 
                                    field_equipment_counts: Dict, external_factors: Dict, 
                                    alert_count: int) -> Optional[Dict]:
        """단일 분야가 명확히 식별된 경우의 전용 추론"""
        logger.info(f"단일 분야 전용 추론 시작: {field}")
        
        if field == "전송":
            return self.analyze_transmission_single_field(query, cleaned_query, alert_count)
        elif field == "교환":
            return self.analyze_exchange_single_field(query, cleaned_query, alert_count)
        elif field == "IP":
            return self.analyze_ip_single_field(query, cleaned_query, alert_count)
        elif field == "무선":
            return self.analyze_wireless_single_field(query, cleaned_query, alert_count)
        elif field == "MW":
            return self.analyze_mw_single_field(query, cleaned_query, external_factors, alert_count)
        elif field == "선로":
            return self.analyze_cable_single_field(query, cleaned_query, external_factors, alert_count)
        elif field == "전원":
            return self.analyze_power_single_field(query, cleaned_query, external_factors, alert_count)
        
        return None
    
    def analyze_transmission_single_field(self, query: str, cleaned_query: str, alert_count: int) -> Dict:
        """전송 분야 단독 분석"""
        query_upper = query.upper()
        
        # ODU_AIS 패턴 확인
        if "ODU_AIS" in query_upper or "ODU AIS" in query_upper:
            confidence = self.calculate_confidence_with_alert_limit(35.0, alert_count)
            return self.create_fault_result(
                "대항국 전송장비 또는 상위구간 신호 장애",
                "전송",
                confidence,
                [
                    "ODU_AIS 경보는 상위구간에서 발생한 신호 장애의 하향 전파",
                    "대항국 전송장비 문제 또는 상위 경로의 신호 손실 가능성"
                ],
                "전송 분야: ODU_AIS 패턴"
            )
        
        # LOS 패턴 확인
        if any(pattern in query_upper for pattern in ["LOS", "LOSS OF SIGNAL"]):
            confidence = self.calculate_confidence_with_alert_limit(33.0, alert_count)
            return self.create_fault_result(
                "대항국 장비 또는 전송 경로 장애",
                "전송",
                confidence,
                [
                    "LOS(Loss of Signal) 경보 발견",
                    "대항국 전송장비 문제 또는 전송 경로 단절 가능성"
                ],
                "전송 분야: LOS 패턴"
            )
        
        # LOF 패턴 확인
        if any(pattern in query_upper for pattern in ["LOF", "LOSS OF FRAME"]):
            confidence = self.calculate_confidence_with_alert_limit(32.0, alert_count)
            return self.create_fault_result(
                "대항국 전송장비 동기 문제",
                "전송",
                confidence,
                [
                    "LOF(Loss of Frame) 경보 발견",
                    "대항국 전송장비의 프레임 동기 문제 가능성"
                ],
                "전송 분야: LOF 패턴"
            )
        
        # AIS 계열 패턴 확인
        ais_patterns = ["AU-AIS", "TU-AIS", "VC-AIS", "MS-AIS", "HP-AIS", "LP-AIS"]
        for pattern in ais_patterns:
            if pattern in query_upper:
                confidence = self.calculate_confidence_with_alert_limit(30.0, alert_count)
                return self.create_fault_result(
                    "상위구간 신호 장애 (AIS 전파)",
                    "전송",
                    confidence,
                    [
                        f"{pattern} 경보 발견",
                        "상위구간에서 발생한 장애가 AIS 신호로 하향 전파됨"
                    ],
                    f"전송 분야: {pattern} 패턴"
                )
        
        # 일반적인 전송 장애 패턴
        confidence = self.calculate_confidence_with_alert_limit(25.0, alert_count)
        return self.create_fault_result(
            "전송 시스템 일반 장애",
            "전송",
            confidence,
            [
                "전송 분야로 식별되었으나 구체적인 패턴 불명확",
                "전송장비 또는 전송 경로 관련 문제 가능성"
            ],
            "전송 분야: 일반 패턴"
        )
    
    def analyze_exchange_single_field(self, query: str, cleaned_query: str, alert_count: int) -> Dict:
        """교환 분야 단독 분석"""
        # A1935 경보 분석
        a1935_count = query.count("A1935")
        if a1935_count >= 100:
            confidence = self.calculate_confidence_with_alert_limit(35.0, alert_count)
            return self.create_fault_result(
                "CGW 또는 CGW 연동장비 장애",
                "교환",
                confidence,
                [
                    f"A1935 경보가 {a1935_count}개 발생 (대량 발생)",
                    "CGW 또는 CGW 연동장비 장애점 가능"
                ],
                "교환 분야: A1935 대량 경보 패턴"
            )
        elif a1935_count > 0:
            confidence = self.calculate_confidence_with_alert_limit(28.0, alert_count)
            return self.create_fault_result(
                "CGW 관련 장애 (소량)",
                "교환",
                confidence,
                [
                    f"A1935 경보가 {a1935_count}개 발생",
                    "CGW 관련 소규모 문제 가능성"
                ],
                "교환 분야: A1935 소량 경보 패턴"
            )
        
        # A1930 경보 분석
        a1930_count = query.count("A1930")
        if a1930_count == 1:
            confidence = self.calculate_confidence_with_alert_limit(30.0, alert_count)
            return self.create_fault_result(
                "AGW 단독고장 (공통부 장애)",
                "교환",
                confidence,
                [
                    "A1930 경보 1개 발생",
                    "AGW 단독고장으로 공통부 장애점 가능"
                ],
                "교환 분야: A1930 단독 경보 패턴"
            )
        elif a1930_count >= 10:
            confidence = self.calculate_confidence_with_alert_limit(32.0, alert_count)
            return self.create_fault_result(
                "AGW 대량 장애",
                "교환",
                confidence,
                [
                    f"A1930 경보 {a1930_count}개 다량 발생",
                    "AGW 시스템 전반적 문제 가능성"
                ],
                "교환 분야: A1930 다량 경보 패턴"
            )
        
        # 일반적인 교환 장애 패턴
        confidence = self.calculate_confidence_with_alert_limit(24.0, alert_count)
        return self.create_fault_result(
            "교환 시스템 일반 장애",
            "교환",
            confidence,
            [
                "교환 분야로 식별되었으나 구체적인 패턴 불명확",
                "교환시스템 관련 문제 가능성"
            ],
            "교환 분야: 일반 패턴"
        )
    
    def analyze_ip_single_field(self, query: str, cleaned_query: str, alert_count: int) -> Dict:
        """IP 분야 단독 분석"""
        query_upper = query.upper()
        
        # Critical/Major 심각도 패턴
        if "CRITICAL" in query_upper:
            confidence = self.calculate_confidence_with_alert_limit(38.0, alert_count)
            return self.create_fault_result(
                "IP 장비 Critical 레벨 장애",
                "IP",
                confidence,
                [
                    "Critical 레벨 경보 발견",
                    "IP 장비의 심각한 문제로 즉시 조치 필요"
                ],
                "IP 분야: Critical 경보 패턴"
            )
        elif "MAJOR" in query_upper:
            confidence = self.calculate_confidence_with_alert_limit(35.0, alert_count)
            return self.create_fault_result(
                "IP 장비 Major 레벨 장애",
                "IP",
                confidence,
                [
                    "Major 레벨 경보 발견",
                    "IP 장비의 주요 문제로 조치 필요"
                ],
                "IP 분야: Major 경보 패턴"
            )
        
        # SNMP 관련 패턴
        if "SNMP" in query_upper:
            if "무응답" in query or "TIMEOUT" in query_upper:
                confidence = self.calculate_confidence_with_alert_limit(32.0, alert_count)
                return self.create_fault_result(
                    "IP 장비 SNMP 에이전트 장애",
                    "IP",
                    confidence,
                    [
                        "SNMP 에이전트 무응답 경보 발견",
                        "IP 장비의 SNMP 서비스 또는 시스템 문제"
                    ],
                    "IP 분야: SNMP 무응답 패턴"
                )
            else:
                confidence = self.calculate_confidence_with_alert_limit(28.0, alert_count)
                return self.create_fault_result(
                    "IP 장비 SNMP 관련 장애",
                    "IP",
                    confidence,
                    [
                        "SNMP 관련 경보 발견",
                        "IP 장비의 모니터링 또는 관리 시스템 문제"
                    ],
                    "IP 분야: SNMP 일반 패턴"
                )
        
        # Interface/Link 관련 패턴
        if any(pattern in query_upper for pattern in ["INTERFACE", "LINK", "PORT"]):
            confidence = self.calculate_confidence_with_alert_limit(30.0, alert_count)
            return self.create_fault_result(
                "IP 장비 인터페이스 장애",
                "IP",
                confidence,
                [
                    "인터페이스/링크 관련 경보 발견",
                    "IP 장비의 네트워크 인터페이스 문제"
                ],
                "IP 분야: 인터페이스 경보 패턴"
            )
        
        # 일반적인 IP 장애 패턴
        confidence = self.calculate_confidence_with_alert_limit(25.0, alert_count)
        return self.create_fault_result(
            "IP 시스템 일반 장애",
            "IP",
            confidence,
            [
                "IP 분야로 식별되었으나 구체적인 패턴 불명확",
                "IP 네트워크 장비 관련 문제 가능성"
            ],
            "IP 분야: 일반 패턴"
        )
    
    def analyze_wireless_single_field(self, query: str, cleaned_query: str, alert_count: int) -> Dict:
        """무선 분야 단독 분석"""
        query_upper = query.upper()
        
        # NE3S 관련 패턴
        if "NE3S" in query_upper:
            if "TIMEOUT" in query_upper:
                confidence = self.calculate_confidence_with_alert_limit(32.0, alert_count)
                return self.create_fault_result(
                    "무선 DU 집선스위치 또는 백본 장애",
                    "무선",
                    confidence,
                    [
                        "NE3S Timeout 경보 발견",
                        "무선 DU 집선스위치 장애 또는 백본 연결 문제"
                    ],
                    "무선 분야: NE3S Timeout 패턴"
                )
            else:
                confidence = self.calculate_confidence_with_alert_limit(28.0, alert_count)
                return self.create_fault_result(
                    "무선 NE3S 시스템 장애",
                    "무선",
                    confidence,
                    [
                        "NE3S 관련 경보 발견",
                        "무선 NE3S 시스템 문제 가능성"
                    ],
                    "무선 분야: NE3S 일반 패턴"
                )
        
        # ToP/BTS Clock 관련 패턴
        if any(pattern in query_upper for pattern in ["TOP", "BTS", "CLOCK", "REFERENCE"]):
            confidence = self.calculate_confidence_with_alert_limit(30.0, alert_count)
            return self.create_fault_result(
                "무선 클럭 공급 장애 (ToP)",
                "무선",
                confidence,
                [
                    "ToP/BTS 클럭 관련 경보 발견",
                    "무선 클럭 공급장치(ToP) 문제 가능성"
                ],
                "무선 분야: ToP/BTS 클럭 패턴"
            )
        
        # 일반적인 무선 장애 패턴
        confidence = self.calculate_confidence_with_alert_limit(24.0, alert_count)
        return self.create_fault_result(
            "무선 시스템 일반 장애",
            "무선",
            confidence,
            [
                "무선 분야로 식별되었으나 구체적인 패턴 불명확",
                "무선 네트워크 장비 관련 문제 가능성"
            ],
            "무선 분야: 일반 패턴"
        )
    
    def analyze_mw_single_field(self, query: str, cleaned_query: str, external_factors: Dict, alert_count: int) -> Dict:
        """MW 분야 단독 분석"""
        fading_count = external_factors.get("fading_count", 0)
        
        if fading_count > 0:
            confidence = self.calculate_confidence_with_alert_limit(35.0, alert_count)
            return self.create_fault_result(
                "MW 페이딩 현상",
                "MW",
                confidence,
                [
                    f"MW 장비 중 변조율이 크게 하락한 장비가 {fading_count}건 발견됨",
                    "전파 페이딩으로 인한 MW 신호 품질 저하"
                ],
                "MW 분야: 페이딩 패턴"
            )
        
        # 페이딩 키워드 확인
        if any(keyword in query.lower() for keyword in ["페이딩", "fading"]):
            confidence = self.calculate_confidence_with_alert_limit(32.0, alert_count)
            return self.create_fault_result(
                "MW 페이딩 징후",
                "MW",
                confidence,
                [
                    "페이딩 관련 키워드 발견",
                    "MW 전파 페이딩 현상 가능성"
                ],
                "MW 분야: 페이딩 키워드 패턴"
            )
        
        # 일반적인 MW 장애 패턴
        confidence = self.calculate_confidence_with_alert_limit(25.0, alert_count)
        return self.create_fault_result(
            "MW 시스템 일반 장애",
            "MW",
            confidence,
            [
                "MW 분야로 식별되었으나 구체적인 패턴 불명확",
                "MW 장비 또는 전파 환경 문제 가능성"
            ],
            "MW 분야: 일반 패턴"
        )
    
    def analyze_cable_single_field(self, query: str, cleaned_query: str, external_factors: Dict, alert_count: int) -> Dict:
        """선로 분야 단독 분석"""
        cable_damage_count = external_factors.get("cable_damage_count", 0)
        
        if cable_damage_count > 0:
            confidence = self.calculate_confidence_with_alert_limit(38.0, alert_count)
            return self.create_fault_result(
                "광케이블 선로 장애",
                "선로",
                confidence,
                [
                    f"미복구된 선로 장애가 {cable_damage_count}건 발견됨",
                    "광케이블 물리적 손상 또는 절단 가능성"
                ],
                "선로 분야: 케이블 손상 패턴"
            )
        
        # 선로 관련 키워드 확인
        if any(keyword in cleaned_query for keyword in ["광케이블", "케이블", "선로"]):
            confidence = self.calculate_confidence_with_alert_limit(30.0, alert_count)
            return self.create_fault_result(
                "선로 관련 장애",
                "선로",
                confidence,
                [
                    "선로/케이블 관련 키워드 발견",
                    "광케이블 선로 문제 가능성"
                ],
                "선로 분야: 선로 키워드 패턴"
            )
        
        # 일반적인 선로 장애 패턴
        confidence = self.calculate_confidence_with_alert_limit(26.0, alert_count)
        return self.create_fault_result(
            "선로 시스템 일반 장애",
            "선로",
            confidence,
            [
                "선로 분야로 식별되었으나 구체적인 패턴 불명확",
                "광케이블 선로 관련 문제 가능성"
            ],
            "선로 분야: 일반 패턴"
        )
    
    def analyze_power_single_field(self, query: str, cleaned_query: str, external_factors: Dict, alert_count: int) -> Dict:
        """전원 분야 단독 분석"""
        power_outage_count = external_factors.get("power_outage_count", 0)
        
        if power_outage_count > 0:
            confidence = self.calculate_confidence_with_alert_limit(35.0, alert_count)
            return self.create_fault_result(
                "한전 정전",
                "전원",
                confidence,
                [
                    f"배터리 모드로 운용 중인 MW 장비가 {power_outage_count}건 발견됨",
                    "한전 정전으로 인한 배터리 모드 운용"
                ],
                "전원 분야: 정전 패턴"
            )
        
        # 전원 관련 키워드 확인
        if any(keyword in cleaned_query for keyword in ["배터리", "UPS", "정전", "전원"]):
            confidence = self.calculate_confidence_with_alert_limit(28.0, alert_count)
            return self.create_fault_result(
                "전원 관련 장애",
                "전원",
                confidence,
                [
                    "전원 관련 키워드 발견",
                    "전원 공급 시스템 문제 가능성"
                ],
                "전원 분야: 전원 키워드 패턴"
            )
        
        # 일반적인 전원 장애 패턴
        confidence = self.calculate_confidence_with_alert_limit(24.0, alert_count)
        return self.create_fault_result(
            "전원 시스템 일반 장애",
            "전원",
            confidence,
            [
                "전원 분야로 식별되었으나 구체적인 패턴 불명확",
                "전원 공급 시스템 관련 문제 가능성"
            ],
            "전원 분야: 일반 패턴"
        )
    
    def analyze_equipment_hierarchy_pattern(self, equipment_analysis: Dict, alert_count: int) -> Optional[Dict]:
        """3단계: 상위장비 경보 패턴 분석"""
        if equipment_analysis.get("potential_fault_points"):
            best_candidate = max(
                equipment_analysis["potential_fault_points"], key=lambda x: x["하위장비수"])
            
            # 장비가 속한 분야 확인
            equipment_field = "기타"
            for field, keywords in FIELD_KEYWORDS.items():
                if best_candidate["장비"] in keywords:
                    equipment_field = field
                    break
            
            confidence = self.calculate_confidence_with_alert_limit(30.0, alert_count)
            return self.create_fault_result(
                f"{best_candidate['장비']} 장비 불량",
                equipment_field,
                confidence,
                [
                    f"{best_candidate['장비']} 및 하위 장비({', '.join(best_candidate['언급된하위장비'])})에서 다수 경보 발생",
                    f"상위 장비인 {best_candidate['장비']}의 장애가 하위 장비에 영향을 미침"
                ],
                "3단계: 상위장비 경보 패턴"
            )
        return None
    
    def analyze_transmission_patterns(self, query: str, cleaned_query: str, 
                                    field_equipment_counts: Dict, alert_count: int) -> Optional[Dict]:
        """4단계: 전송 분야 LOS/LOF 경보 패턴 분석"""
        if field_equipment_counts.get("전송", 0) == 0:
            return None
        
        transmission_patterns = check_transmission_los_lof_patterns(query)
        advanced_patterns = detect_advanced_transmission_patterns(query)
        
        # LOS 경보 패턴 분석
        if "LOS" in transmission_patterns:
            los_info = transmission_patterns["LOS"]
            confidence = self.calculate_confidence_with_alert_limit(32.0, alert_count)
            return self.create_fault_result(
                "대항국 장비 또는 선로 문제 가능성",
                "전송",
                confidence,
                [
                    f"LOS 패턴 발견: {los_info['pattern']}",
                    los_info["description"],
                    los_info["fault_probability"]
                ],
                "4단계: 전송 분야 LOS 경보 패턴"
            )
        
        # LOF 경보 패턴 분석
        if "LOF" in transmission_patterns:
            lof_info = transmission_patterns["LOF"]
            confidence = self.calculate_confidence_with_alert_limit(31.0, alert_count)
            return self.create_fault_result(
                "대항국 장비 불량",
                "전송",
                confidence,
                [
                    f"LOF 패턴 발견: {lof_info['pattern']}",
                    lof_info["description"],
                    lof_info["fault_probability"]
                ],
                "4단계: 전송 분야 LOF 경보 패턴"
            )
        
        # 고급 패턴 분석 (SDH/SONET 전용)
        if advanced_patterns:
            if "sdh_alarm" in advanced_patterns:
                confidence = self.calculate_confidence_with_alert_limit(30.0, alert_count)
                return self.create_fault_result(
                    "SDH 계층 신호 장애",
                    "전송",
                    confidence,
                    [
                        f"SDH 경보 패턴: {', '.join(advanced_patterns['sdh_alarm'])}",
                        "SDH 계층의 AIS(Alarm Indication Signal) 발생",
                        "상위 계층 또는 대항국 장비 문제 가능성"
                    ],
                    "4단계: 전송 분야 SDH 경보 패턴"
                )
            
            if "sonet_alarm" in advanced_patterns:
                confidence = self.calculate_confidence_with_alert_limit(29.0, alert_count)
                return self.create_fault_result(
                    "SONET 계층 신호 장애",
                    "전송",
                    confidence,
                    [
                        f"SONET 경보 패턴: {', '.join(advanced_patterns['sonet_alarm'])}",
                        "SONET 계층의 신호 품질 저하 또는 손실",
                        "대항국 장비 또는 전송 경로 문제 가능성"
                    ],
                    "4단계: 전송 분야 SONET 경보 패턴"
                )
        
        return None
    
    def analyze_exchange_patterns(self, query: str, cleaned_query: str, 
                                field_equipment_counts: Dict, alert_count: int) -> Optional[Dict]:
        """5단계: 교환 분야 A1935/A1930 경보 패턴 분석"""
        if field_equipment_counts.get("교환", 0) == 0:
            return None
        
        # A1935 경보 개수 확인 (100개 이상)
        a1935_count = query.count("A1935")
        if a1935_count >= 100:
            confidence = self.calculate_confidence_with_alert_limit(33.0, alert_count)
            return self.create_fault_result(
                "CGW 또는 CGW 연동장비 장애",
                "교환",
                confidence,
                [
                    f"A1935 경보가 {a1935_count}개 발생 (100개 이상은 유효한 경보)",
                    "CGW 또는 CGW 연동장비 장애점 가능"
                ],
                "5단계: 교환 분야 A1935 경보 패턴"
            )
        
        # A1930 경보 패턴 분석
        a1930_count = query.count("A1930")
        if a1930_count == 1:
            # IP, 전송 분야 경보 확인
            if field_equipment_counts.get("IP", 0) == 0 and field_equipment_counts.get("전송", 0) == 0:
                confidence = self.calculate_confidence_with_alert_limit(31.0, alert_count)
                return self.create_fault_result(
                    "AGW 단독고장 (공통부 장애)",
                    "교환",
                    confidence,
                    [
                        "A1930 경보 1개 발생",
                        "IP/전송 분야 경보 없음 → AGW 단독고장으로 공통부 장애점 가능"
                    ],
                    "5단계: 교환 분야 A1930 단독 경보 패턴"
                )
        elif a1930_count >= 10:
            # 다른 분야 경보도 있는 경우
            if field_equipment_counts.get("IP", 0) > 0 or field_equipment_counts.get("전송", 0) > 0:
                confidence = self.calculate_confidence_with_alert_limit(30.0, alert_count)
                return self.create_fault_result(
                    "IP/전송 분야 시스템 장애 또는 상위 장비 장애",
                    "교환",
                    confidence,
                    [
                        f"A1930 경보 {a1930_count}개 다량 발생",
                        "IP/전송 분야에서도 경보 발생 → 해당 분야 시스템 장애 또는 연결된 상위 장비 장애점 가능"
                    ],
                    "5단계: 교환 분야 A1930 다량 경보 패턴"
                )
        
        return None
    
    def analyze_ip_patterns(self, query: str, cleaned_query: str, 
                          field_equipment_counts: Dict, alert_count: int) -> Optional[Dict]:
        """6단계: IP 분야 Critical/Major/SNMP 경보 패턴 분석"""
        if field_equipment_counts.get("IP", 0) == 0:
            return None
        
        ip_patterns = check_ip_severity_patterns(query)
        advanced_patterns = detect_advanced_ip_severity_patterns(query)
        
        # 심각도 레벨 패턴 분석
        if "severity" in ip_patterns:
            severity_info = ip_patterns["severity"]
            base_confidence = 32.0 if severity_info["level"] == "Critical" else 30.0
            confidence_boost = severity_info["confidence_boost"]
            boosted_confidence = base_confidence * confidence_boost
            final_confidence = self.calculate_confidence_with_alert_limit(boosted_confidence, alert_count)
            
            return self.create_fault_result(
                "해당 IP 장비 장애",
                "IP",
                final_confidence,
                [
                    f"심각도 패턴 발견: {severity_info['pattern']} ({severity_info['level']})",
                    f"IP 장비에서 {severity_info['level']} 레벨 경보 발생",
                    "해당 장비가 장애점일 가능성이 매우 높음"
                ],
                "6단계: IP 분야 Critical/Major 경보 패턴"
            )
        
        # SNMP OperStatus 경보 패턴
        if "snmp" in ip_patterns:
            snmp_info = ip_patterns["snmp"]
            
            # 대상 장비 확인
            if "target_equipment" in ip_patterns:
                equipment_info = ip_patterns["target_equipment"]
                confidence = self.calculate_confidence_with_alert_limit(31.0, alert_count)
                return self.create_fault_result(
                    "연결된 선로 장애",
                    "IP",
                    confidence,
                    [
                        snmp_info["description"],
                        f"대상 장비: {', '.join(equipment_info['equipment'])}",
                        equipment_info["description"]
                    ],
                    "6단계: IP 분야 SNMP OperStatus 경보 패턴"
                )
            else:
                confidence = self.calculate_confidence_with_alert_limit(28.0, alert_count)
                return self.create_fault_result(
                    "IP 장비 인터페이스 장애",
                    "IP",
                    confidence,
                    [
                        snmp_info["description"],
                        "SNMP 운영 상태 경보로 인터페이스 문제 가능성"
                    ],
                    "6단계: IP 분야 SNMP 경보 패턴"
                )
        
        # 추가 IP 경보 패턴 분석
        if "IP_ALARMS" in ip_patterns:
            alarm_info = ip_patterns["IP_ALARMS"]
            confidence = self.calculate_confidence_with_alert_limit(29.0, alert_count)
            return self.create_fault_result(
                "IP 시스템 종합 장애",
                "IP",
                confidence,
                [
                    f"IP 시스템 경보 {alarm_info['count']}개 발견",
                    f"발견된 경보: {', '.join(alarm_info['alarms'])}",
                    "네트워크 인터페이스, 프로토콜 또는 시스템 리소스 문제"
                ],
                "6단계: IP 분야 시스템 경보 패턴"
            )
        
        # 고급 패턴 분석 (정규식 기반)
        if advanced_patterns:
            for pattern_type, pattern_value in advanced_patterns.items():
                if pattern_type == "syslog_severity":
                    confidence = self.calculate_confidence_with_alert_limit(32.0, alert_count)
                    return self.create_fault_result(
                        "Syslog 심각도 기반 장애",
                        "IP",
                        confidence,
                        [
                            f"Syslog 심각도 패턴: {pattern_value}",
                            "시스템 로그에서 심각도 레벨이 확인됨",
                            "해당 IP 장비의 중대한 문제 발생"
                        ],
                        "6단계: IP 분야 Syslog 심각도 패턴"
                    )
                elif pattern_type == "alarm_grade":
                    confidence = self.calculate_confidence_with_alert_limit(31.0, alert_count)
                    return self.create_fault_result(
                        "경보등급 기반 장애",
                        "IP",
                        confidence,
                        [
                            f"경보등급 패턴: {pattern_value}",
                            "장비에서 정의된 경보등급에 따른 심각한 문제",
                            "즉시 조치가 필요한 장애 상황"
                        ],
                        "6단계: IP 분야 경보등급 패턴"
                    )
        
        return None
    
    def analyze_wireless_patterns(self, query: str, cleaned_query: str, 
                                field_equipment_counts: Dict, alert_count: int) -> Optional[Dict]:
        """7단계: 무선 분야 NE3S/ToP/BTS 경보 패턴 분석"""
        if field_equipment_counts.get("무선", 0) == 0:
            return None
        
        # NE3S Timeout 경보 패턴
        if "Timeout connecting to NE3S" in query:
            # IP/전송 분야 경보 확인
            if field_equipment_counts.get("IP", 0) > 0 or field_equipment_counts.get("전송", 0) > 0:
                confidence = self.calculate_confidence_with_alert_limit(31.0, alert_count)
                return self.create_fault_result(
                    "광케이블 선로 장애 또는 상위망(무선 백본) 장애",
                    "무선",
                    confidence,
                    [
                        "NE3S Timeout 경보 발견",
                        "IP/전송 분야에서도 경보 발생 → 광케이블 선로 장애 또는 상위망 장애 가능"
                    ],
                    "7단계: 무선 분야 NE3S 경보 패턴 (선로장애)"
                )
            else:
                confidence = self.calculate_confidence_with_alert_limit(29.0, alert_count)
                return self.create_fault_result(
                    "무선 DU 집선스위치 장애 또는 한전 정전",
                    "무선",
                    confidence,
                    [
                        "NE3S Timeout 경보 발견",
                        "IP/전송 분야 경보 없음 → 무선 DU 집선스위치 장애 또는 한전 정전 문제 가능"
                    ],
                    "7단계: 무선 분야 NE3S 경보 패턴 (집선스위치장애)"
                )
        
        # ToP/BTS reference 경보 패턴
        if "ToP reference missing" in query or "BTS reference clock missing" in query:
            # IP/전송 분야 경보 확인
            if field_equipment_counts.get("IP", 0) > 0 or field_equipment_counts.get("전송", 0) > 0:
                confidence = self.calculate_confidence_with_alert_limit(30.0, alert_count)
                return self.create_fault_result(
                    "광케이블 장애 또는 상위망(무선 백본) 장애",
                    "무선",
                    confidence,
                    [
                        "ToP/BTS reference clock missing 경보 발견",
                        "IP/전송 분야에서도 경보 발생 → 광케이블 장애 또는 상위망 장애 가능"
                    ],
                    "7단계: 무선 분야 ToP/BTS 경보 패턴 (선로장애)"
                )
            else:
                confidence = self.calculate_confidence_with_alert_limit(28.0, alert_count)
                return self.create_fault_result(
                    "ToP(클럭공급장치) 장애",
                    "무선",
                    confidence,
                    [
                        "ToP/BTS reference clock missing 경보 발견",
                        "IP/전송 분야 경보 없음 → ToP(클럭공급장치) 장애 가능"
                    ],
                    "7단계: 무선 분야 ToP/BTS 경보 패턴 (ToP장애)"
                )
        
        return None
    
    def calculate_pattern_based_confidence(self, query: str, top_results: List, 
                                         field_equipment_counts: Dict, alert_count: int) -> float:
        """패턴 기반 신뢰도 계산 - 경보 특성 분석"""
        if not top_results:
            return self.calculate_confidence_with_alert_limit(15.0, alert_count)
        
        base_similarity = top_results[0].get("similarity", 0)
        
        # 패턴 매칭 점수 계산 요소들
        pattern_score = base_similarity
        
        # 1. 다중 분야 장비 언급 보너스 (패턴의 복잡성)
        mentioned_fields = len([count for count in field_equipment_counts.values() if count > 0])
        if mentioned_fields >= 3:
            pattern_score += 5  # 복잡한 패턴 보너스
        elif mentioned_fields >= 2:
            pattern_score += 2
        
        # 2. 경보 밀도 보너스 (단위 텍스트당 경보 수)
        alert_density = alert_count / max(1, len(query.replace(' ', '')) / 100)  # 100글자당 경보 수
        if alert_density > 2:
            pattern_score += 3
        elif alert_density > 1:
            pattern_score += 1
        
        # 3. 특정 패턴 키워드 존재 시 보너스
        pattern_keywords = ['LINK-FAIL', 'AU-AIS', 'TU-AIS', 'SD', 'INTF']
        keyword_matches = sum(1 for keyword in pattern_keywords if keyword in query)
        pattern_score += min(keyword_matches * 0.5, 3)  # 최대 3점 보너스
        
        # 4. 상한/하한 제한
        pattern_score = max(10.0, min(80.0, pattern_score))
        
        # 5. 경보 수에 따른 최종 신뢰도 제한 적용
        final_confidence = self.calculate_confidence_with_alert_limit(pattern_score, alert_count)
        
        return round(final_confidence, 1)