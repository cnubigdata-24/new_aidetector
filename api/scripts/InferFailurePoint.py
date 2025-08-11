"""
장애점 추정 클래스
"""

import logging
from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict
import json
import requests
import os
import re


class InferFailurePoint:
    # 임계값 상수
    A1935_ALARM_THRESHOLD = 100
    A1930_LOW_THRESHOLD = 10
    A1930_HIGH_THRESHOLD = 11
    MAX_ALARM_DISPLAY = 3
    MAX_LOGGED_ALARMS = 2
    RSL_FADING_THRESHOLD = -55  # RSL 페이딩 최소 임계값
    VOLT_THRESHOLD = 49  # 전압 최소 임계값

    # 신뢰도 상수
    CONFIDENCE_VERY_HIGH = 0.95
    CONFIDENCE_HIGH = 0.9
    CONFIDENCE_MEDIUM_HIGH = 0.85
    CONFIDENCE_MEDIUM = 0.8
    CONFIDENCE_MEDIUM_LOW = 0.7

    # HTML 관련 상수
    HR_LINE_HTML = '<hr style="border: none; border-top: 1px solid #f2bbb5; margin: 10px 0;">\n'
    HTML_NBSP = "&nbsp;"
    HTML_BR = "<br>"

    # 분야별 상수
    SECTOR_CABLE = "선로"
    SECTOR_MW = "MW"
    SECTOR_EXCHANGE = "교환"
    SECTOR_TRANSMISSION = "전송"
    SECTOR_IP = "IP"
    SECTOR_WIRELESS = "무선"

    # 무선 분야 DU 장비 경보 상수
    WIRELESS_ALARM_THRESHOLD = 10  # 무선 DU 다량 경보 갯수
    WIRELESS_TIME_WINDOW_MINUTES = 10  # 최근 10분 내 경보 10개 이상 체크

    def __init__(self, progress_callback=None):
        self.nodes = []
        self.links = []
        self.alarmDataWithoutCable = []  # 선로 제외 모든 분야 경보
        self.cableAlarms = []  # 선로 분야 경보
        self.failure_points = []
        self.logger = logging.getLogger(__name__)
        self.progress_callback = progress_callback
        self.isMwRealTimeCheck = False  # MW 실시간 SNMP 점검 모드

    def send_progress(self, message):
        """진행 상황을 콜백으로 전달"""
        if self.progress_callback:
            self.progress_callback(message)

    def update_step_progress(self, base_message: str, new_text: str) -> str:
        """기존 메시지에 진행 상황 텍스트를 추가하여 업데이트 (전송하지 않고 문자열만 반환)"""
        updated_message = base_message + new_text
        self.logger.info(f"Progress Update: {new_text.strip()}")
        return updated_message

    # 장애점 찾기 Main 함수
    def analyze(self, nodes: List[Dict], links: List[Dict], alarmDataWithoutCable: List[Dict], cableAlarms: List[Dict] = None, isMwRealTimeCheck: bool = False) -> Dict[str, Any]:
        try:
            self._log_analysis_start()
            self._initialize_data(
                nodes, links, alarmDataWithoutCable, cableAlarms, isMwRealTimeCheck)

            if not self._validate_input_data():
                return self._create_empty_result("분석할 경보 데이터가 부족합니다.")

            self._execute_analysis_steps()
            result = self._create_analysis_result()
            self._log_analysis_completion()

            return result

        except Exception as e:
            self.logger.error(f"❌ 장애점 분석 중 오류: {str(e)}")
            self.send_progress(f"❌ 장애점 분석 중 오류가 발생했습니다: {str(e)}")
            return self._create_error_result(str(e))

    def _log_analysis_start(self):
        """분석 시작 로깅"""
        self.logger.info("=" * 60)
        self.logger.info("✔️ 장애점 분석 Main 시작...")
        self.logger.info("=" * 60)

    def _initialize_data(self, nodes: List[Dict], links: List[Dict], alarmDataWithoutCable: List[Dict], cableAlarms: List[Dict] = None, isMwRealTimeCheck: bool = False):
        """데이터 초기화"""
        self.nodes = nodes or []
        self.links = links or []
        self.alarmDataWithoutCable = alarmDataWithoutCable or []  # 선로 이외의 모든 분야 경보 데이터
        self.cableAlarms = cableAlarms or []  # 선로 분야 경보 데이터
        self.isMwRealTimeCheck = isMwRealTimeCheck  # MW 실시간 SNMP 점검 모드

        previous_failure_count = len(self.failure_points) if hasattr(
            self, 'failure_points') else 0
        self.failure_points = []

        self.logger.info(
            f"🔄 장애점 리스트 초기화: 이전 {previous_failure_count}개 → 현재 {len(self.failure_points)}개")
        self._send_initial_progress()
        self._log_input_data()

    def _send_initial_progress(self):
        """초기 진행 상황 전송"""
        # 현재 맵에 표시된 노드와 링크의 경보 수 계산 (StateManager에서 enriched된 데이터 사용)
        current_map_alarms = self._get_current_map_alarm_count()

        message = (f"📌 NW 장애점 분석을 시작합니다. (1~7단계) {self.HTML_BR}{self.HTML_BR} "
                   f"• AI 분석 입력 데이터: 장비 {len(self.nodes)}대, 링크 {len(self.links)}구간, 현재 경보수 {current_map_alarms}건")
        self.send_progress(message)

    def _get_current_map_alarm_count(self):
        """현재 맵에 표시된 경보 수 반환 (StateManager enriched 데이터 활용)"""
        total_alarms = 0

        # 노드들의 경보 수 계산
        for node in self.nodes:
            # StateManager에서 enriched된 alarmMessages 사용
            if 'alarmMessages' in node and node['alarmMessages']:
                total_alarms += len(node['alarmMessages'])
            # fallback: alarms 필드 사용
            elif 'alarms' in node and node['alarms']:
                total_alarms += len(node['alarms'])

        # 링크들의 경보 수 계산
        for link in self.links:
            # StateManager에서 enriched된 alarmMessages 사용
            if 'alarmMessages' in link and link['alarmMessages']:
                total_alarms += len(link['alarmMessages'])
            # fallback: alarms 필드 사용
            elif 'alarms' in link and link['alarms']:
                total_alarms += len(link['alarms'])

        return total_alarms

    def _log_input_data(self):
        """입력 데이터 로깅 (최적화된 버전 - 캐시 활용)"""
        # 프론트엔드에서 미리 준비한 캐시 정보 확인
        try:
            # 캐시된 로깅 정보가 있는지 확인 (향후 StateManager 연동 시 사용)
            cached_info = self._get_cached_logging_info()

            if cached_info and self._is_cache_valid(cached_info):
                self._log_from_cache(cached_info)
                return
        except Exception as cache_error:
            self.logger.debug(f"캐시 로깅 실패, 기본 방식으로 처리: {cache_error}")

        # 기본 통계 정보만 빠르게 로깅
        self.logger.info(f"✔️ 입력 데이터 현황:")
        self.logger.info(f"• 장비 수: {len(self.nodes)}대")
        self.logger.info(f"• 링크 수: {len(self.links)}구간")
        self.logger.info(f"• 선로 제외 경보 수: {len(self.alarmDataWithoutCable)}건")
        self.logger.info(f"• 선로 경보 수: {len(self.cableAlarms)}건")

        # 상세 로깅은 필요한 경우에만 (환경 변수나 디버그 모드일 때)
        debug_mode = os.environ.get(
            'DEBUG_DETAIL_LOGGING', 'false').lower() == 'true'

        if debug_mode:
            self._log_node_details()
            self._log_link_details()
        else:
            # 간소화된 로깅: 요약 정보만
            self._log_summary_details()

    def _get_cached_logging_info(self):
        """캐시된 로깅 정보 조회 (향후 확장 가능)"""
        # 현재는 None 반환, 향후 StateManager나 다른 캐시 시스템과 연동 가능
        return None

    def _is_cache_valid(self, cached_info):
        """캐시 유효성 검사"""
        if not cached_info:
            return False

        # 캐시된 정보와 현재 데이터 수가 일치하는지 확인
        expected_nodes = cached_info.get(
            'summary', {}).get('equipment_count', 0)
        return len(self.nodes) == expected_nodes

    def _log_from_cache(self, cached_info):
        """캐시된 정보를 사용한 로깅"""
        summary = cached_info.get('summary', {})

        self.logger.info(f"✔️ 입력 데이터 현황 (캐시 사용):")
        self.logger.info(f"• 장비 수: {summary.get('equipment_count', 0)}대")
        self.logger.info(f"• 링크 수: {len(self.links)}구간")
        self.logger.info(f"• 선로 제외 경보 수: {len(self.alarmDataWithoutCable)}건")
        self.logger.info(f"• 선로 경보 수: {len(self.cableAlarms)}건")

        # 캐시된 분야별 요약 사용
        field_summary = summary.get('field_summary', {})
        if field_summary:
            self.logger.info(f"✔️ 장비 분야별 요약 (캐시):")
            for field, info in field_summary.items():
                self.logger.info(f"• {field}: {info.get('count', 0)}대")

            alarm_summary = summary.get('alarm_summary', {})
            total_alarms = alarm_summary.get('total', 0)
            self.logger.info(f"• 총 노드 경보: {total_alarms}개")

        # 링크 요약
        if self.links:
            total_link_alarms = sum(len(link.get('alarms', []))
                                    for link in self.links)
            self.logger.info(
                f"✔️ 링크 요약: {len(self.links)}개 구간, 총 {total_link_alarms}개 경보")

    def _log_summary_details(self):
        """요약된 상세 정보 로깅 (성능 최적화)"""
        if self.nodes:
            # 분야별 노드 수 요약
            field_counts = {}
            total_alarms = 0
            for node in self.nodes:
                field = node.get('field', 'Unknown')
                field_counts[field] = field_counts.get(field, 0) + 1
                total_alarms += len(node.get('alarms', []))

            self.logger.info(f"✔️ 장비 분야별 요약:")
            for field, count in field_counts.items():
                self.logger.info(f"• {field}: {count}대")
            self.logger.info(f"• 총 노드 경보: {total_alarms}개")

        if self.links:
            # 링크 요약 정보
            total_link_alarms = sum(len(link.get('alarms', []))
                                    for link in self.links)
            self.logger.info(
                f"✔️ 링크 요약: {len(self.links)}개 구간, 총 {total_link_alarms}개 경보")

    def _log_node_details(self):
        """노드 상세 정보 로깅"""
        if self.nodes:
            self.logger.info(f"✔️ 장비 상세 정보:")
            for i, node in enumerate(self.nodes):
                node_name = node.get('name', node.get('id', 'Unknown'))
                node_field = node.get('field', 'Unknown')
                node_level = node.get('level', 0)
                alarm_count = len(node.get('alarms', []))
                self.logger.info(
                    f"• 📌 [{i+1}] {node_name} (분야: {node_field}, Level: {node_level}, 경보: {alarm_count}개)")

    def _log_link_details(self):
        """링크 상세 정보 로깅"""
        if self.links:
            self.logger.info(f"✔️ 링크 상세 정보:")
            for i, link in enumerate(self.links):
                link_name = link.get('link_name', link.get('id', 'Unknown'))
                alarm_count = len(link.get('alarms', []))
                self.logger.info(f"• [{i+1}] {link_name} (경보: {alarm_count}개)")

    def _execute_analysis_steps(self):
        """7단계 장애점 분석 실행"""
        self.logger.info("📌 단계별 장애점 분석 시작")

        analysis_steps = [
            (self.analyze_link_failures, "링크 선로 장애점"),
            (self.analyze_mw_equipment_status, "MW 장비 상태 점검"),
            (self.analyze_upper_node_failures, "상위 장비 장애점"),
            (self.analyze_exchange_failures, "교환 장비 장애점"),
            (self.analyze_transmission_failures, "전송 장비 장애점"),
            (self.analyze_IP_failures, "IP 장비 장애점 (TO DO)"),
            (self.analyze_wireless_failures, "무선 장비 장애점")
        ]

        for i, (step_func, step_name) in enumerate(analysis_steps, 1):
            step_func()
            self._log_step_completion(i, step_name)

    def _log_step_completion(self, step_num: int, step_name: str):
        """단계 완료 로깅"""
        self.logger.info(
            f"• [{step_num}단계 완료] 현재 발견된 장애점: {len(self.failure_points)}개")
        if self.failure_points:
            for i, fp in enumerate(self.failure_points):
                self.logger.info(
                    f"  - [{i+1}] {fp.get('name', 'Unknown')} ({fp.get('failure_type', 'Unknown')})")
        self.logger.info("-------------------------------")

    def _log_analysis_completion(self):
        """분석 완료 로깅"""
        self.logger.info("-" * 60)
        self.logger.info(f"✔️ 장애점 분석 최종 완료:")
        self.logger.info(f"• ❌ 총 발견된 장애점: {len(self.failure_points)}개")

        for i, fp in enumerate(self.failure_points):
            confidence_pct = fp['confidence'] * 100
            self.logger.info(
                f"  [{i+1}] {fp['name']} - {fp['failure_type']} (신뢰도: {confidence_pct:.0f}%)")

        self.logger.info("=" * 60)

    # 장애점 생성 헬퍼 메서드
    def _create_failure_point(self, failure_type: str, node_id: str, name: str, sector: str,
                              failure_desc: str, inference_detail: str, alarms: List[Dict],
                              confidence: float, **extra_data) -> Dict[str, Any]:
        """장애점 생성 헬퍼 메서드"""
        failure_point = {
            'type': failure_type,
            'id': node_id,
            'name': name,
            'sector': sector,
            'failure_type': failure_desc,
            'inference_detail': inference_detail,
            'alarms': alarms,
            'confidence': confidence
        }
        failure_point.update(extra_data)
        self.failure_points.append(failure_point)
        return failure_point

    # 메시지 빌딩 헬퍼 메서드들
    def _build_step_message(self, step_num: str, title: str, subtitle: str = "") -> str:
        """단계별 메시지 빌딩"""
        message = f"🚩 [{step_num}단계] {title}"
        if subtitle:
            message += f" ({subtitle})"
        message += f"{self.HTML_BR}\n{self.HR_LINE_HTML}"
        return message

    def _add_step_result(self, message: str, details: List[str], count: int) -> str:
        """단계 결과 추가"""
        full_message = message + "\n".join(details)
        full_message += f"\n{self.HTML_BR}{self.HTML_BR}• 장애점 발견: {count}개"
        return full_message

    # 입력 데이터 검증
    def validate_input_data(self) -> bool:
        return self._validate_input_data()

    def _validate_input_data(self) -> bool:
        if not self.nodes:
            self.logger.warning("노드 데이터가 없습니다.")
            return False

        total_alarms_count = self._count_total_alarms()
        self._log_alarm_summary(total_alarms_count)

        if total_alarms_count == 0:
            self.logger.warning("노드와 링크에 경보가 없습니다.")
            return False

        return True

    def _count_total_alarms(self) -> int:
        """전체 경보 수 계산"""
        total_count = 0

        # 노드 내부 경보
        for node in self.nodes:
            node_alarms = node.get('alarms', [])
            total_count += len([alarm for alarm in node_alarms if alarm])

        # 링크 내부 경보
        for link in self.links:
            link_alarms = link.get('alarms', [])
            total_count += len([alarm for alarm in link_alarms if alarm])

        return total_count

    def _log_alarm_summary(self, total_count: int):
        """경보 요약 로깅"""
        node_alarm_count = sum(len(node.get('alarms', []))
                               for node in self.nodes)
        link_alarm_count = sum(len(link.get('alarms', []))
                               for link in self.links)

        self.logger.info(f"✔️ 전체 경보 현황: 총 {total_count}건")
        self.logger.info(
            f"• 📌 전역 경보 (선로제외): {len(self.alarmDataWithoutCable)}건")
        self.logger.info(f"• 노드 내부 경보: {node_alarm_count}건")
        self.logger.info(f"• 링크 내부 경보: {link_alarm_count}건")

    # 1. 선로 장애점 분석
    def analyze_link_failures(self):
        self.logger.info("-------------------------------")
        self.logger.info("[1단계] 선로 분야 장애점 분석 시작")

        step_message = self._build_step_message(
            "1", "선로 분야 장애점 분석", "Dr. Cable 조회")
        step_message += f"{self.HTML_BR}• 전체 선로 현황: {len(self.links)}개 구간\n"
        step_message += f"{self.HTML_BR}{self.HTML_NBSP} → 광케이블 선로 경보를 확인합니다."

        # ⚡ 성능 최적화: 선로 경보를 케이블명별로 미리 인덱싱
        cable_alarm_index = self._build_cable_alarm_index()

        link_failure_count = 0
        link_details = []

        # 🚀 빠른 링크 분석 (인덱스 기반)
        for i, link in enumerate(self.links):
            link_name = link.get('link_name', f"선로 {link.get('id')}")
            self.logger.info(f"🔍 [{i+1}/{len(self.links)}] 선로 분석: {link_name}")

            # 인덱스를 사용한 빠른 경보 조회
            link_alarms = self._get_link_alarms_optimized(
                link, cable_alarm_index)
            self.logger.info(f"• ❌ 선로 경보 수: {len(link_alarms)}개")

            # 장애 유형별 처리
            failure_descriptions = []
            combined_alarms = link_alarms.copy()

            # 일반 선로 피해 체크 (Dr. Cable)
            if link_alarms:
                failure_descriptions.append("선로 피해")

            # 한전광 장애 체크 (한전광 구간 전송장비 LOS 경보 확인)
            kepco_failure_result = self._check_kepco_cable_failure(link)

            if kepco_failure_result['has_failure']:
                failure_descriptions.append("한전광 장애")
                combined_alarms.extend(kepco_failure_result['alarms'])

            if failure_descriptions:
                # 장애 설명 생성
                failure_desc = " + ".join(failure_descriptions)
                inference_detail = self._build_kepco_inference_detail(
                    kepco_failure_result, len(link_alarms) > 0)

                self._create_failure_point(
                    failure_type='link',
                    node_id=link.get('id'),
                    name=link_name,
                    sector=self.SECTOR_CABLE,
                    failure_desc=failure_desc,
                    inference_detail=inference_detail,
                    alarms=combined_alarms,
                    confidence=self.CONFIDENCE_HIGH
                )

                link_failure_count += 1

                # 세부 정보 구성
                alarm_counts = []
                if len(link_alarms) > 0:
                    alarm_counts.append(f"KT 선로 경보 {len(link_alarms)}개")
                if kepco_failure_result['has_failure']:
                    kepco_alarm_count = len(kepco_failure_result['alarms'])
                    alarm_counts.append(f"한전광 구간 LOS 경보 {kepco_alarm_count}개")

                alarm_detail = " + ".join(
                    alarm_counts) if alarm_counts else "경보 없음"

                link_details.append(
                    f"{self.HTML_BR}{self.HTML_NBSP} - {link_name}: {alarm_detail} - {failure_desc}")
                self.logger.info(
                    f"✔️ 선로 장애점 발견: {link_name} ({alarm_detail})")

                # 상세 로깅은 디버그 모드에서만
                debug_mode = os.environ.get(
                    'DEBUG_DETAIL_LOGGING', 'false').lower() == 'true'
                if debug_mode:
                    if link_alarms:
                        self._log_alarm_details(link_alarms)
                    if kepco_failure_result['has_failure']:
                        self._log_alarm_details(kepco_failure_result['alarms'])
            else:
                link_details.append(
                    f"{self.HTML_BR}{self.HTML_NBSP} - [정상] {link_name}")
                self.logger.info(f"• 경보 없음: 정상")

        step_message += f"\n{self.HTML_BR}{self.HTML_BR}• 선로 피해 점검 결과:\n" + \
            "\n".join(link_details)
        step_message = self._add_step_result(
            step_message, [], link_failure_count)
        self.send_progress(step_message)

        self.logger.info(
            f"[1단계] 선로 분야 장애점 분석 완료 => 발견된 선로 장애점: {link_failure_count}개")

    def _check_kepco_cable_failure(self, link: Dict) -> Dict[str, Any]:
        """한전광 장애 체크"""
        link_type = link.get('link_type', '')

        # 한전광이 아닌 경우 스킵
        if link_type != "한전광":
            return {'has_failure': False, 'alarms': []}

        self.logger.info(
            f"• 한전광 선로 감지: {link.get('link_name', '')} - 한전광 장애 분석 시작")

        equip_id = link.get('equip_id', '')
        link_equip_id = link.get('link_equip_id', '')
        cable_aroot = link.get('cable_aroot', '')
        cable_broot = link.get('cable_broot', '')

        if not all([equip_id, link_equip_id, cable_aroot, cable_broot]):
            self.logger.info("• 한전광 분석 실패: 필수 정보 부족")
            return {'has_failure': False, 'alarms': []}

        # 각 장비의 경보 조회
        equip_alarms = self._get_node_alarms(equip_id)
        link_equip_alarms = self._get_node_alarms(link_equip_id)

        self.logger.info(f"• 장비 {equip_id} 경보 수: {len(equip_alarms)}개")
        self.logger.info(
            f"• 장비 {link_equip_id} 경보 수: {len(link_equip_alarms)}개")

        # 한전광 장애 조건 체크
        kepco_failure_alarms = []

        # 조건 1: equip_id 장비에서 cable_aroot 포함된 LOS 경보
        equip_kepco_alarms = self._check_kepco_los_alarms(
            equip_alarms, cable_aroot, f"장비 {equip_id}")

        # 조건 2: link_equip_id 장비에서 cable_broot 포함된 LOS 경보
        link_equip_kepco_alarms = self._check_kepco_los_alarms(
            link_equip_alarms, cable_broot, f"장비 {link_equip_id}")

        # 양쪽 모두 한전광 LOS 경보가 있어야 한전광 장애로 판단
        if equip_kepco_alarms and link_equip_kepco_alarms:
            kepco_failure_alarms.extend(equip_kepco_alarms)
            kepco_failure_alarms.extend(link_equip_kepco_alarms)

            self.logger.info(
                f"✔️ 한전광 장애 감지: 자국/대국 장비 모두 LOS 경보 발생 (총 {len(kepco_failure_alarms)}개)")
            return {'has_failure': True, 'alarms': kepco_failure_alarms}
        else:
            if not equip_kepco_alarms:
                self.logger.info(
                    f"• 장비 {equip_id}: cable_aroot({cable_aroot}) 관련 LOS 경보 없음")
            if not link_equip_kepco_alarms:
                self.logger.info(
                    f"• 장비 {link_equip_id}: cable_broot({cable_broot}) 관련 LOS 경보 없음")

            return {'has_failure': False, 'alarms': []}

    def _check_kepco_los_alarms(self, node_alarms: List[Dict], cable_root: str, equip_id: str) -> List[Dict]:
        """특정 장비의 한전광 LOS 경보 체크"""
        kepco_los_alarms = []

        for alarm in node_alarms:
            alarm_message = alarm.get('alarm_message', '').upper()
            alarm_full_info = alarm.get('alarm_full_info', '').upper()

            # LOS 경보 체크 (대소문자 무관)
            has_los = any(los_term in alarm_message for los_term in [
                          'LOS', 'LOSS OF SIGNAL'])
            if not has_los:
                has_los = any(los_term in alarm_full_info for los_term in [
                              'LOS', 'LOSS OF SIGNAL'])

            # cable_root 포함 체크 (대소문자 무관)
            has_cable_root = cable_root.upper(
            ) in alarm_message or cable_root.upper() in alarm_full_info

            if has_los and has_cable_root:
                kepco_los_alarms.append(alarm)
                self.logger.info(
                    f"• {equip_id}: 한전광 구간 LOS 경보 확인 - {alarm_message[:50]}...")

        return kepco_los_alarms

    def _build_kepco_inference_detail(self, kepco_result: Dict, has_cable_alarm: bool) -> str:
        """한전광 장애 추론 상세 내용 생성"""
        details = []

        if has_cable_alarm:
            details.append("선로 피해 발생")

        if kepco_result['has_failure']:
            details.append("한전광 자국/대국 장비 모두 LOS 경보 발생으로 한전광 장애 의심")

        return " + ".join(details) if details else "선로 피해 발생"

    def _build_cable_alarm_index(self) -> Dict[str, List[Dict]]:
        """
        선로 경보를 케이블명별로 인덱싱하여 빠른 조회 가능
        시간 복잡도: O(m) - 한번만 실행
        """
        self.logger.info(f"🚀 선로 경보 인덱스 생성 중... (총 {len(self.cableAlarms)}개)")

        cable_index = {}
        processed_count = 0

        for alarm in self.cableAlarms:
            cable_alarm_string = alarm.get('equip_name') or ''
            if not cable_alarm_string:
                continue

            # 빠른 케이블명 파싱
            cable_names = self._parse_cable_names_fast(cable_alarm_string)

            for cable_name in cable_names:
                if cable_name not in cable_index:
                    cable_index[cable_name] = []

                # 경보에 케이블 정보 추가
                alarm_with_info = alarm.copy()
                alarm_with_info['matched_cable'] = cable_name
                alarm_with_info['display_message'] = cable_name
                alarm_with_info['sector'] = self.SECTOR_CABLE

                cable_index[cable_name].append(alarm_with_info)
                processed_count += 1

        self.logger.info(
            f"✅ 선로 경보 인덱스 완료: {len(cable_index)}개 케이블, {processed_count}개 매칭")
        return cable_index

    def _parse_cable_names_fast(self, cable_alarm_string: str) -> List[str]:
        """케이블명 빠른 파싱 (최적화된 버전)"""
        cable_names = []
        current_item = ""
        paren_depth = 0

        for char in cable_alarm_string:
            if char == '(':
                paren_depth += 1
            elif char == ')':
                paren_depth -= 1
            elif char == ',' and paren_depth == 0:
                if current_item.strip():
                    clean_name = current_item.strip().strip('\'"')
                    if clean_name:
                        cable_names.append(clean_name)
                current_item = ""
                continue
            current_item += char

        # 마지막 항목 처리
        if current_item.strip():
            clean_name = current_item.strip().strip('\'"')
            if clean_name:
                cable_names.append(clean_name)

        return cable_names

    def _get_link_alarms_optimized(self, link: Dict, cable_alarm_index: Dict[str, List[Dict]]) -> List[Dict]:
        """
        최적화된 링크 경보 조회 (인덱스 기반)
        시간 복잡도: O(k) - k는 링크의 케이블 수 (보통 1-2개)
        """
        # 링크 케이블명 추출
        link_cable_names = self._extract_link_cable_names(link)

        if not link_cable_names:
            return []

        # 인덱스를 사용한 빠른 조회
        matched_alarms = []
        for cable_name in link_cable_names:
            if cable_name in cable_alarm_index:
                matched_alarms.extend(cable_alarm_index[cable_name])

        # 중복 제거 (같은 경보가 여러 케이블명에 매칭될 수 있음)
        unique_alarms = []
        seen_alarm_ids = set()

        for alarm in matched_alarms:
            # 경보 고유 식별자 생성 (원본 경보 기준)
            alarm_id = f"{alarm.get('id', '')}-{alarm.get('occur_time', '')}-{alarm.get('alarm_message', '')}"
            if alarm_id not in seen_alarm_ids:
                seen_alarm_ids.add(alarm_id)
                unique_alarms.append(alarm)

        debug_mode = os.environ.get(
            'DEBUG_DETAIL_LOGGING', 'false').lower() == 'true'
        if debug_mode:
            link_name = link.get('link_name', 'unknown')
            self.logger.info(
                f"🔍 [DEBUG] {link_name}: {link_cable_names} → {len(unique_alarms)}개 경보 매칭")

        return unique_alarms

    def _extract_link_cable_names(self, link: Dict) -> List[str]:
        """링크에서 케이블명 추출"""
        cable_names = []

        # cable_aroot, cable_broot에서 케이블명 추출
        for root_key in ['cable_aroot', 'cable_broot']:
            root_value = link.get(root_key, '') or ''
            if root_value:
                # "|"로 분리된 케이블명 처리
                for segment in root_value.split('|'):
                    clean_name = segment.strip().strip('\'"')
                    if clean_name and clean_name not in cable_names:
                        cable_names.append(clean_name)

        return cable_names

    def _log_alarm_details(self, alarms: List[Dict]):
        """경보 상세 정보 로깅"""
        for j, alarm in enumerate(alarms[:self.MAX_LOGGED_ALARMS]):
            alarm_msg = alarm.get('alarm_message', 'Unknown')
            self.logger.info(f"• 경보{j+1}: {alarm_msg}")
        if len(alarms) > self.MAX_LOGGED_ALARMS:
            self.logger.info(
                f"... 외 {len(alarms) - self.MAX_LOGGED_ALARMS}개 경보")

    # 2. MW 장비 상태 점검
    def analyze_mw_equipment_status(self):
        self.logger.info("[2단계] MW 장비 상태 점검 시작")

        # 디버깅: isMwRealTimeCheck 값 확인
        self.logger.info(
            f"🔍 [디버깅] isMwRealTimeCheck 값: {self.isMwRealTimeCheck} (타입: {type(self.isMwRealTimeCheck)})")

        mw_nodes = [node for node in self.nodes if node.get(
            'field', '').upper() == 'MW']

        step_message = self._build_step_message(
            "2", "도서 MW 장애점 분석", "SNMP 페이딩/한전정전")
        step_message += f"{self.HTML_BR}• 점검 대상 MW 장비: {len(mw_nodes)}대"

        # MW 실시간 SNMP 점검 모드 확인
        if self.isMwRealTimeCheck:
            step_message += f"{self.HTML_BR}• 분석 모드: M/W 실시간 SNMP 점검"
            self.logger.info("🔍 [디버깅] 실시간 SNMP 점검 모드로 진행합니다.")
        else:
            step_message += f"{self.HTML_BR}• 분석 모드: M/W RMOS 경보 점검"
            self.logger.info("🔍 [디버깅] RMOS 경보 점검 모드로 진행합니다.")

        # 첫 단계 메시지 전송 제거 - 근본 원인 해결!
        # self.send_progress(step_message)  <- 이 줄 제거

        mw_failure_count = 0

        if not mw_nodes:
            step_message = self.update_step_progress(
                step_message, f"{self.HTML_BR}{self.HTML_NBSP} → MW 장비가 없어 2단계 분석을 패스합니다.")
            # 완료 메시지 추가
            final_summary = f"\n{self.HTML_BR}{self.HTML_BR}• 장애점 발견: 0개"
            step_message = self.update_step_progress(
                step_message, final_summary)

            # MW 장비가 없는 경우에만 여기서 전송
            self.send_progress(step_message)
            self.logger.info("• MW 장비가 없습니다. 2단계 분석을 건너뜁니다.")
        else:
            try:
                # MW 실시간 SNMP 점검 모드에 따른 분기
                if self.isMwRealTimeCheck:
                    self.logger.info(
                        "🔍 [디버깅] _execute_mw_realtime_snmp_analysis 호출")
                    mw_failure_count = self._execute_mw_realtime_snmp_analysis(
                        mw_nodes, step_message)
                else:
                    self.logger.info("🔍 [디버깅] _execute_mw_rmos_analysis 호출")
                    mw_failure_count = self._execute_mw_rmos_analysis(
                        mw_nodes, step_message)
            except Exception as e:
                step_message = self.update_step_progress(
                    step_message, f"{self.HTML_BR}• 오류 발생: {str(e)}")
                # 완료 메시지 추가
                final_summary = f"\n{self.HTML_BR}{self.HTML_BR}• 장애점 발견: 0개"
                step_message = self.update_step_progress(
                    step_message, final_summary)

                # 오류 발생 시에만 여기서 전송
                self.send_progress(step_message)
                self.logger.error(f"• ❌ MW 장비 상태 점검 중 오류: {str(e)}")

            self.logger.info(
                f"[2단계] MW 장비 상태 점검 완료 => 발견된 MW 장애점: {mw_failure_count}개")

    def _execute_mw_realtime_snmp_analysis(self, mw_nodes: List[Dict], base_message: str) -> int:
        """MW 분석 실행 (최종 메시지 한 번만 전송)"""
        current_message = base_message

        # ① DB 조회 단계
        current_message = self.update_step_progress(current_message,
                                                    f"{self.HTML_BR}{self.HTML_BR}① 먼저, MW 장비 SNMP 정보를 DB에서 조회합니다.")

        mw_equipment_data, failed_equipments, success_equipments = self._get_mw_snmp_db(
            mw_nodes)

        db_result_text = self._add_db_query_results_text(
            success_equipments, failed_equipments)
        current_message = self.update_step_progress(
            current_message, db_result_text)

        if not mw_equipment_data:
            current_message = self.update_step_progress(current_message,
                                                        f"{self.HTML_BR}{self.HTML_NBSP} → DB에서 MW 장비 SNMP 데이터를 찾을 수 없어 분석을 중단합니다.")
            final_summary = f"\n{self.HTML_BR}{self.HTML_BR}• 장애점 발견: 0개"
            current_message = self.update_step_progress(
                current_message, final_summary)

            # 최종 메시지 한 번만 전송
            self.send_progress(current_message)
            self.logger.warning("- ⚠️ DB에서 MW 장비 SNMP 데이터를 찾을 수 없습니다.")
            return 0

        # ② API 호출 단계
        current_message = self.update_step_progress(current_message,
                                                    f"{self.HTML_BR}{self.HTML_BR}② 다음, 실시간 MW 장비 상태 확인 API를 호출합니다.")

        guksa_id = mw_nodes[0].get('guksa_id') if mw_nodes else None
        mw_status_data = self._call_mw_snmp_api(guksa_id, mw_equipment_data)

        if not mw_status_data:
            current_message = self.update_step_progress(current_message,
                                                        f"{self.HTML_BR}{self.HTML_NBSP} → MW SNMP 상태 정보를 가져올 수 없습니다.")
            final_summary = f"\n{self.HTML_BR}{self.HTML_BR}• 장애점 발견: 0개"
            current_message = self.update_step_progress(
                current_message, final_summary)

            # 최종 메시지 한 번만 전송
            self.send_progress(current_message)
            self.logger.warning("• ⚠️ MW SNMP 상태 정보를 가져올 수 없습니다.")
            return 0

        current_message = self.update_step_progress(current_message,
                                                    f"{self.HTML_BR}{self.HTML_NBSP} → MW SNMP 상태 정보 수신 성공: {len(mw_status_data)}건")

        # ③ 분석 단계
        current_message = self.update_step_progress(current_message,
                                                    f"{self.HTML_BR}{self.HTML_BR}③ 다음, MW 파라미터별 분석을 진행합니다.")

        mw_failure_count, mw_details = self._analyze_mw_status_data(
            mw_status_data, mw_nodes, mw_equipment_data)

        analysis_result_text = "".join(mw_details)
        current_message = self.update_step_progress(
            current_message, analysis_result_text)

        final_summary_text = self._add_step_result_text([], mw_failure_count)
        current_message = self.update_step_progress(
            current_message, final_summary_text)

        # 최종 완성된 메시지 한 번만 전송
        self.send_progress(current_message)

        self.logger.info(
            f"[2단계] MW 장비 상태 점검 완료 => 발견된 MW 장애점: {mw_failure_count}개")

        return mw_failure_count

    def _add_db_query_results_text(self, success_equipments: List[Dict], failed_equipments: List[str]) -> str:
        """DB 조회 결과 메시지 텍스트 생성"""
        message = ""
        message += f"{self.HTML_BR}{self.HTML_NBSP} - 조회 성공: {len(success_equipments)}개"
        if success_equipments:
            success_names = [equip['equip_name']
                             for equip in success_equipments]
            message += f"{self.HTML_BR}{self.HTML_NBSP}{self.HTML_NBSP} . {', '.join(success_names)}"

        message += f"{self.HTML_BR}{self.HTML_NBSP} - 조회 실패: {len(failed_equipments)}개"
        if failed_equipments:
            failed_names = self._extract_failed_equipment_names(
                failed_equipments)
            if failed_names:
                message += f" {self.HTML_BR}{self.HTML_NBSP}{self.HTML_NBSP} . {', '.join(failed_names)}"

        return message

    def _add_step_result_text(self, details: List[str], count: int) -> str:
        """단계 결과 텍스트 생성"""
        message = "".join(details)
        message += f"\n{self.HTML_BR}{self.HTML_BR}• 장애점 발견: {count}개"
        return message

    def _extract_failed_equipment_names(self, failed_equipments: List[str]) -> List[str]:
        """실패한 장비명 추출"""
        import re
        failed_names = []
        for failed in failed_equipments:
            match = re.search(r"MW 장비 '([^']+)'", failed)
            if match:
                failed_names.append(match.group(1))
        return failed_names

    # 2-1. DB에서 MW 노드들의 SNMP 접속 정보 수집
    def _get_mw_snmp_db(self, mw_nodes) -> Tuple[List[Dict], List[str], List[Dict]]:
        try:
            from db.models import TblSnmpInfo
            from flask import current_app

            self._check_flask_context()

            mw_equipment_data = []
            failed_equipments = []
            success_equipments = []

            for node in mw_nodes:
                self._log_node_debug_info(node)

                equip_id = node.get('id')
                equip_name = node.get('name')
                if not equip_id:
                    error_msg = f"MW 장비 '{equip_name or 'Unknown'}': equip_id 정보 없음"
                    self.logger.warning(f"• ⚠️ {error_msg}")
                    failed_equipments.append(
                        f"{self.HTML_BR}{self.HTML_NBSP} - {error_msg}")
                    continue

                self.logger.info(
                    f"• 🔍 MW 장비 tbl_snmp_info 검색 조건: equip_id='{equip_id}', equip_name='{equip_name}'")

                snmp_info = TblSnmpInfo.query.filter_by(
                    equip_name=str(equip_id)).first()

                if snmp_info:
                    # 디버깅: MW 장비와 TblSnmpInfo 비교 정보 출력
                    self.logger.info(f"• 🔍 [디버깅] MW 장비 정보 비교:")
                    self.logger.info(f"  - MW Node equip_id: '{equip_id}'")
                    self.logger.info(f"  - MW Node equip_name: '{equip_name}'")
                    self.logger.info(f"  - TblSnmpInfo id: {snmp_info.id}")
                    self.logger.info(
                        f"  - TblSnmpInfo equip_id: '{getattr(snmp_info, 'equip_id', 'N/A')}'")
                    self.logger.info(
                        f"  - TblSnmpInfo equip_name: '{getattr(snmp_info, 'equip_name', 'N/A')}'")

                    self._log_snmp_info_success(snmp_info)
                    equipment_info = self._create_equipment_info(snmp_info)
                    mw_equipment_data.append(equipment_info)
                    success_equipments.append(equipment_info)
                else:
                    error_msg = f"MW 장비 '{equip_name or 'Unknown'}' (equip_id: '{equip_id}'): TblSnmpInfo에서 매칭되는 SNMP 정보 없음"
                    self.logger.warning(f"• ⚠️ {error_msg}")
                    self.logger.info(f"• 🔍 [디버깅] 매칭 실패 정보:")
                    self.logger.info(f"  - 검색한 equip_id: '{equip_id}'")
                    self.logger.info(f"  - MW Node equip_name: '{equip_name}'")
                    failed_equipments.append(
                        f"{self.HTML_BR}{self.HTML_NBSP} - {error_msg}")

            self.logger.info(
                f"• ✅ MW 장비 SNMP 정보 수집 완료: 성공 {len(mw_equipment_data)}개, 실패 {len(failed_equipments)}개")
            return mw_equipment_data, failed_equipments, success_equipments

        except Exception as e:
            self.logger.error(f"• ❌ MW 장비 정보 수집 실패: {e}")
            return [], [], []

    def _check_flask_context(self):
        """Flask 컨텍스트 확인"""
        from flask import current_app
        try:
            current_app._get_current_object()
            self.logger.info("• ✅ Flask 애플리케이션 컨텍스트 확인됨")
        except RuntimeError as e:
            self.logger.error(f"• ❌ Flask 컨텍스트 없음: {e}")
            raise

    def _log_node_debug_info(self, node: Dict):
        """노드 디버그 정보 로깅"""
        self.logger.info(f"• 🔍 MW 노드 정보 디버깅:")
        self.logger.info(f"  - node ID: {node.get('id')}")
        self.logger.info(f"  - node name: {node.get('name')}")
        self.logger.info(f"  - field: {node.get('field')}")
        self.logger.info(f"  - level: {node.get('level')}")

    def _log_snmp_info_success(self, snmp_info):
        """SNMP 정보 성공 로깅"""
        self.logger.info(f"• ✅ TblSnmpInfo 매칭 성공:")
        self.logger.info(f"  - SNMP ID: {snmp_info.id}")
        self.logger.info(f"  - SNMP IP: {snmp_info.snmp_ip}")
        self.logger.info(f"  - Community: {snmp_info.community}")
        self.logger.info(f"  - Equip Type: {snmp_info.equip_type}")
        self.logger.info(f"  - Equip Name: {snmp_info.equip_name}")

    def _create_equipment_info(self, snmp_info) -> Dict[str, Any]:
        """장비 정보 생성"""
        equipment_info = {
            'id': snmp_info.id,
            'snmp_ip': snmp_info.snmp_ip,
            'community': snmp_info.community,
            'equip_type': snmp_info.equip_type,
            'equip_name': snmp_info.equip_name
        }

        self.logger.info(
            f"• ✅ MW 장비 정보 수집 성공: {snmp_info.equip_name} (ID: {snmp_info.id}, IP: {snmp_info.snmp_ip})")
        return equipment_info

    # 2-2. MW 상태 확인 API 호출
    def _call_mw_snmp_api(self, guksa_id, mw_equipment_data) -> List[Dict]:
        try:
            payload = {
                "guksa_id": guksa_id,
                "data": mw_equipment_data
            }

            self._log_api_request(payload, mw_equipment_data, guksa_id)

            response = requests.post(
                'http://localhost:5000/api/check_mw_status',
                json=payload,
                timeout=30
            )

            return self._handle_api_response(response)

        except Exception as e:
            self.logger.error(f"• ❌ MW 상태 확인 API 호출 실패: {str(e)}")
            return []

    def _log_api_request(self, payload: Dict, mw_equipment_data: List[Dict], guksa_id):
        """API 요청 로깅"""
        self.logger.info(
            f"• MW 상태 확인 API 호출: {len(mw_equipment_data)}개 장비, guksa_id={guksa_id}")
        self.logger.info("=" * 80)
        self.logger.info("📤 MW API 요청 JSON (상세) - 전체 장비:")
        self.logger.info("=" * 80)
        self.logger.info(json.dumps(payload, indent=2, ensure_ascii=False))
        self.logger.info("=" * 80)

    def _handle_api_response(self, response) -> List[Dict]:
        """API 응답 처리"""
        if response.status_code == 200:
            result = response.json()
            self.logger.info(f"• ✅ MW 상태 데이터 수신 완료")
            self.logger.info("=" * 80)
            self.logger.info("📥 MW API 응답 JSON (상세) - 전체 장비:")
            self.logger.info("=" * 80)
            self.logger.info(json.dumps(result, indent=2, ensure_ascii=False))
            self.logger.info("=" * 80)
            return result
        elif response.status_code == 404:
            self.logger.warning(f"• ⚠️ MW 상태 API: 요청된 장비 ID에 대한 데이터 없음 (404)")
            return []
        else:
            self.logger.error(f"• ❌ MW 상태 API 호출 실패: {response.status_code}")
            self.logger.error(f"• 응답 내용: {response.text}")
            return []

    # MW 파라미터 체크 메서드들 개선
    def _parse_parameter_value(self, param_data: Dict, key: str, default: Any = 0) -> Optional[float]:
        """파라미터 값을 안전하게 파싱"""
        try:
            value = param_data.get(key, default)
            return float(value) if value != 'error' else None
        except (ValueError, TypeError):
            return None

    # 2-2-1. 페이딩(Fading) 판단 =>
    def check_fading_parameters(self, slot_data, slot_name) -> List[str]:
        issues = []

        # 파라미터 값 추출
        rsl_value = self._parse_parameter_value(
            slot_data.get('RSL', {}), 'value', 0)
        snr_value = self._parse_parameter_value(
            slot_data.get('SNR', {}), 'value', 0)

        # 디버깅 로그
        self.logger.info(
            f"[DEBUG] {slot_name} 페이딩 분석: RSL={rsl_value}, SNR={snr_value}")

        # 페이딩 판단 조건: RSL이 -55 이하 and SNR이 0보다 크고 30 이하인 경우
        rsl_fading = rsl_value is not None and rsl_value <= self.RSL_FADING_THRESHOLD
        snr_fading = snr_value is not None and snr_value > 0 and snr_value <= 30

        # 두 조건을 모두 만족할 때만 페이딩으로 판단
        if rsl_fading and snr_fading:
            issues.append(
                f"전파 페이딩 추정: RSL 저하({rsl_value}dBm), SNR 저하({snr_value}dB)")

            self.logger.info(
                f"• 📌 페이딩 판단: RSL={rsl_value}, SNR={snr_value}")

        return issues

    # 2-2-4. 링크 오류
    def check_link_disconnection(self, slot_data, slot_name) -> List[str]:
        issues = []

        # 파라미터 값 추출
        rsl_value = self._parse_parameter_value(
            slot_data.get('RSL', {}), 'value', 0)
        snr_value = self._parse_parameter_value(
            slot_data.get('SNR', {}), 'value', 0)

        # UAS 파라미터 체크
        uas_value = 0
        if 'ERR' in slot_data:
            err_data = slot_data['ERR']
            uas_raw = err_data.get('UAS', 0)
            if uas_raw != 'error' and uas_raw != '0':
                try:
                    uas_value = int(uas_raw)
                except (ValueError, TypeError):
                    pass

        # 디버깅 로그
        self.logger.info(
            f"[DEBUG] {slot_name} 링크단절/HW장애 분석: RSL={rsl_value}, SNR={snr_value}, UAS={uas_value}")

        # 링크단절/HW장애 판단 조건: RSL -50이하이고, SNR이 0이고, UAS가 1보다 큰 경우
        rsl_disconnected = rsl_value is not None and rsl_value <= -50
        snr_zero = snr_value is not None and snr_value == 0
        uas_high = uas_value > 1

        if rsl_disconnected and snr_zero and uas_high:
            issues.append(
                f"링크단절/HW장애: RSL 저하({rsl_value}dBm), SNR 없음({snr_value}dB), UAS 높음({uas_value})")
            self.logger.info(
                f"• 📌 링크단절/HW장애: RSL={rsl_value}, SNR={snr_value}, UAS={uas_value}")

        return issues

    # 2-2-5. ERR 파라미터 체크 => UAS 1 이상인 경우 Error로 판단
    def check_error_parameters(self, slot_data, slot_name) -> List[str]:
        """ERR 파라미터 체크 - UAS가 1개 이상이면 서비스 장애로 판단"""
        issues = []

        if 'ERR' in slot_data:
            err_data = slot_data['ERR']

            # UAS 체크 (서비스 장애 판단)
            uas_value = err_data.get('UAS', 0)
            if uas_value != 'error' and uas_value != '0':
                try:
                    uas_int = int(uas_value)
                    if uas_int >= 1:
                        issues.append(
                            f"서비스 장애: UAS={uas_value} (1초 이상 서비스 불가)")
                        self.logger.info(f"• 📌 서비스 장애 (UAS): {uas_value}")
                except (ValueError, TypeError):
                    if uas_value == 'error':
                        issues.append("UAS 측정 오류")

        return issues

    # 2-2-6. 전압 파라미터 체크
    def check_voltage_parameters(self, data) -> str:
        """VOLT 파라미터 체크"""
        if 'VOLT' in data:
            volt_data = data['VOLT']
            value = self._parse_parameter_value(volt_data, 'value', 0)
            threshold = self.VOLT_THRESHOLD

            # 디버깅 로그
            self._log_voltage_debug(volt_data)

            # 임계값 체크
            violation = self._check_threshold_violation(value, threshold, "전압")
            if violation:
                return f"전압 임계값 미달: 한전 정전 의심 {value}V < {threshold}V"
            elif volt_data.get('value') == 'error':
                return "전압 측정 오류"

        return ""

    def _check_threshold_violation(self, value: float, threshold: float, param_name: str) -> Optional[str]:
        """임계값 위반 체크"""
        if value is not None and threshold is not None and value < threshold:
            return f"{param_name} 임계값 미달: {value} < {threshold}"
        return None

    def _log_voltage_debug(self, volt_data: Dict):
        """전압 디버그 로깅"""
        value = volt_data.get('value', 0)
        min_val = volt_data.get('min', 0)
        max_val = volt_data.get('max', 0)

        if min_val != 'error' and max_val != 'error':
            try:
                diff = float(max_val) - float(min_val)
                self.logger.info(
                    f"[DEBUG] VOLT: value={value}, min={min_val}, max={max_val}, diff={diff}")
            except (ValueError, TypeError):
                self.logger.info(
                    f"[DEBUG] VOLT: value={value}, min={min_val}, max={max_val}")
        else:
            self.logger.info(
                f"[DEBUG] VOLT: value={value}, min={min_val}, max={max_val}")

    # 2-3. MW 상태 데이터 분석 (요청/응답 ID 매칭 개선)
    def _analyze_mw_status_data(self, mw_status_data, mw_nodes, mw_equipment_data) -> Tuple[int, List[str]]:
        failure_count = 0
        details = []

        self._log_id_comparison(mw_equipment_data, mw_status_data)

        for requested_equip in mw_equipment_data:
            requested_id = requested_equip['id']
            requested_name = requested_equip['equip_name']

            self.logger.info(
                f"• 🔍 장비별 분석 시작: {requested_name} (ID: {requested_id})")

            matched_response = self._find_matched_response(
                mw_status_data, requested_id)
            if not matched_response:
                details.extend([
                    f"{self.HTML_BR}{self.HTML_NBSP} - 장비: {requested_name} (SNMP ID: {requested_id})",
                    f"{self.HTML_BR}{self.HTML_NBSP}{self.HTML_NBSP} → SNMP 응답 없음 (API 호출 실패)"
                ])
                continue

            equipment_failures = self._analyze_equipment_parameters(
                matched_response, requested_name, requested_id)
            equipment_status = self._create_equipment_status_summary(
                equipment_failures)

            details.extend([
                f"{self.HTML_BR}▶ [장비] {requested_name} (SNMP ID: {requested_id}) {self.HTML_BR}{self.HTML_NBSP}→ {', '.join(equipment_status)}",
                f"{self.HTML_BR}{self.HTML_BR}--- Interface(슬롯별) 상세 내역 ---{self.HTML_BR}"
            ])
            details.extend(equipment_failures['slot_details'])
            details.append(f"{self.HTML_BR}")

            if self._has_equipment_failure(equipment_failures):
                self._create_mw_failure_point(
                    requested_equip, equipment_failures)
                failure_count += 1

        return failure_count, details

    def _log_id_comparison(self, mw_equipment_data: List[Dict], mw_status_data: List[Dict]):
        """요청/응답 ID 비교 로깅"""
        requested_ids = [equip['id'] for equip in mw_equipment_data]
        received_ids = [equipment_data.get('id')
                        for equipment_data in mw_status_data]

        self.logger.info("• 🔍 요청 vs 응답 ID 비교:")
        self.logger.info(f"  - 요청한 SNMP ID 목록: {requested_ids}")
        self.logger.info(f"  - 응답받은 SNMP ID 목록: {received_ids}")

        missing_ids = set(requested_ids) - set(received_ids)
        extra_ids = set(received_ids) - set(requested_ids)

        if missing_ids:
            self.logger.warning(f"  - 응답에서 누락된 ID: {list(missing_ids)}")
        if extra_ids:
            self.logger.warning(f"  - 요청에 없는 추가 ID: {list(extra_ids)}")

    def _find_matched_response(self, mw_status_data: List[Dict], requested_id: int) -> Optional[Dict]:
        """매칭되는 응답 찾기"""
        for response_data in mw_status_data:
            if response_data.get('id') == requested_id:
                self.logger.info(
                    f"• ✅ ID 매칭 성공: SNMP ID {requested_id} → 응답 데이터 존재")
                return response_data
        self.logger.warning(f"• ⚠️ MW 장비 SNMP ID {requested_id} SNMP 응답 없음")
        return None

    def _analyze_equipment_parameters(self, matched_response: Dict, requested_name: str, requested_id: int) -> Dict:
        """장비 파라미터 분석"""
        equipment_failures = {
            'fading_issues': [],
            'link_disconnect_issues': [],
            'error_issues': [],
            'voltage_issues': [],
            'slot_details': []
        }

        data = matched_response.get('data', {})
        interfaces = data.get('interfaces', {})
        equip_type = matched_response.get('equip_type', '').lower()

        # 인터페이스 분석
        for slot_name, slot_data in interfaces.items():
            self.logger.info(f"• 슬롯 분석: {slot_name}")
            self._analyze_slot_parameters(
                slot_name, slot_data, equipment_failures, equip_type)

        # 전압 분석
        self._analyze_voltage_parameters(data, equipment_failures, equip_type)

        return equipment_failures

    # 2-3. MW 슬롯별 파라미터 분석
    def _analyze_slot_parameters(self, slot_name: str, slot_data: Dict, equipment_failures: Dict, equip_type: str):
        """슬롯 파라미터 분석"""

        # 1. 페이딩 분석
        fading_issues = self.check_fading_parameters(slot_data, slot_name)
        if fading_issues:
            equipment_failures['fading_issues'].extend(
                [f"{slot_name}: {issue}" for issue in fading_issues])
            equipment_failures['slot_details'].append(
                f"{self.HTML_BR}> {slot_name}: 전파 페이딩 추정 ({', '.join(fading_issues)})")
            self.logger.info(f"• 📌 전파 페이딩 추정 발견: {', '.join(fading_issues)}")

        # 2. 링크단절/HW장애 분석
        link_disconnect_issues = self.check_link_disconnection(
            slot_data, slot_name)
        if link_disconnect_issues:
            equipment_failures['link_disconnect_issues'].extend(
                [f"{slot_name}: {issue}" for issue in link_disconnect_issues])
            equipment_failures['slot_details'].append(
                f"{self.HTML_BR}> {slot_name}: 링크단절/HW장애 ({', '.join(link_disconnect_issues)})")
            self.logger.info(
                f"• 📌 링크단절/HW장애 발견: {', '.join(link_disconnect_issues)}")

        # 3. ERR 파라미터 분석 (UAS 중심)
        err_issues = self.check_error_parameters(slot_data, slot_name)
        err_details = self.get_error_parameter_details(slot_data, slot_name)

        if err_issues:
            equipment_failures['error_issues'].extend(
                [f"{slot_name}: {issue}" for issue in err_issues])
            equipment_failures['slot_details'].append(
                f"{self.HTML_BR}> {slot_name}: 서비스 장애 ({', '.join(err_issues)})")
            self.logger.info(f"• 📌 서비스 장애 발견: {', '.join(err_issues)}")

        # 모든 항목이 정상일 때만
        if not (fading_issues or link_disconnect_issues or err_issues):
            fading_details = self.get_fading_parameter_details(
                slot_data, slot_name, equip_type)
            equipment_failures['slot_details'].append(
                f"{self.HTML_BR}> {slot_name}: 모든 Parameter 정상 ({fading_details}, {err_details})")

    def _analyze_voltage_parameters(self, data: Dict, equipment_failures: Dict, equip_type: str):
        """전압 파라미터 분석"""
        volt_issues = self.check_voltage_parameters(data)
        volt_details = self.get_voltage_parameter_details(data, equip_type)

        if volt_issues:
            equipment_failures['voltage_issues'].append(volt_issues)
            equipment_failures['slot_details'].append(
                f"{self.HTML_BR}> 인입 전압: 저전압으로 한전 정전 추정 ({volt_issues})")
            self.logger.info(f"• 📌 MW 저전압으로 배터리 모드: {volt_issues}")
        else:
            equipment_failures['slot_details'].append(
                f"{self.HTML_BR}> 인입 전압: 정상 ({volt_details})")

    def _create_equipment_status_summary(self, equipment_failures: Dict) -> List[str]:
        """장비 상태 요약 생성"""
        status = []
        status.append(
            "페이딩 추정" if equipment_failures['fading_issues'] else "페이딩 양호")
        status.append(
            "링크단절/HW장애" if equipment_failures['link_disconnect_issues'] else "링크 양호")
        status.append(
            "서비스 장애 발생" if equipment_failures['error_issues'] else "서비스 양호")
        status.append(
            "한전 정전 추정" if equipment_failures['voltage_issues'] else "전원 양호")
        return status

    def _has_equipment_failure(self, equipment_failures: Dict) -> bool:
        """장비 장애 여부 확인"""
        return bool(equipment_failures['fading_issues'] or
                    equipment_failures['link_disconnect_issues'] or
                    equipment_failures['error_issues'] or
                    equipment_failures['voltage_issues'])

    def _create_mw_failure_point(self, requested_equip: Dict, equipment_failures: Dict):
        """MW 장애점 생성"""
        failure_types = []
        inference_details = []

        if equipment_failures['fading_issues']:
            failure_types.append('MW 전파 페이딩 추정')
            inference_details.extend(equipment_failures['fading_issues'])

        if equipment_failures['link_disconnect_issues']:
            failure_types.append('MW 링크단절/HW장애')
            inference_details.extend(
                equipment_failures['link_disconnect_issues'])

        if equipment_failures['error_issues']:
            failure_types.append('MW 서비스 장애')
            inference_details.extend(equipment_failures['error_issues'])

        if equipment_failures['voltage_issues']:
            failure_types.append('MW 저전압으로 한전 정전 추정')
            inference_details.extend(equipment_failures['voltage_issues'])

        self._create_failure_point(
            failure_type='node',
            node_id=requested_equip.get('equip_name', requested_equip['id']),
            name=f"MW 장비 {requested_equip['equip_name']}",
            sector=self.SECTOR_MW,
            failure_desc=', '.join(failure_types),
            inference_detail=f'{self.HTML_BR}'.join(inference_details),
            alarms=[],
            confidence=self.CONFIDENCE_MEDIUM_HIGH,
            mw_fading_failure=bool(equipment_failures['fading_issues']),
            mw_link_disconnect_failure=bool(
                equipment_failures['link_disconnect_issues']),
            mw_voltage_failure=bool(equipment_failures['voltage_issues']),
            mw_error_failure=bool(equipment_failures['error_issues']),
            equipment_type='MW'
        )

        requested_name = requested_equip['equip_name']
        requested_id = requested_equip['id']
        self.logger.info(
            f"• 📌 MW 장비 통합 장애점 생성: {requested_name} (SNMP ID: {requested_id}) - {', '.join(failure_types)}")

    def get_fading_parameter_details(self, slot_data, slot_name, equip_type: str = '') -> str:
        """페이딩 파라미터 상세 정보 (정상 상태용)"""
        # equip_type=CTR 장비인 경우: threshod 값이 error로 나오기 때문에, 이 값은 체크하지 않고 패스하도록 추가 처리 필요

        details = []
        parameters = ['RSL', 'TSL', 'SNR', 'XPI']

        for param in parameters:
            if param in slot_data:
                param_data = slot_data[param]
                value = self._parse_parameter_value(param_data, 'value', 0)
                threshold = self._parse_parameter_value(
                    param_data, 'threshold', 0)

                if param_data.get('value') == 'error':
                    details.append(f"{param}: 측정 오류")
                elif value is not None and threshold is not None:
                    status = "이상" if value >= threshold else "미달"
                    details.append(
                        f"{param}: {value} (기준 {threshold} {status})")
                elif value is not None and param_data.get('threshold') == 'error' and equip_type == 'ctr':
                    # CTR 장비의 경우 threshold가 error이므로 기준 비교 없이 값만 표시
                    details.append(f"{param}: {value}")
                else:
                    details.append(
                        f"{param}: {param_data.get('value', 'N/A')}")

        return ', '.join(details) if details else "파라미터 정보 없음"

    def get_error_parameter_details(self, slot_data, slot_name) -> str:
        """ERR 파라미터 상세 정보 (항목별 기준 적용)"""
        details = []

        if 'ERR' in slot_data:
            err_data = slot_data['ERR']

            for err_type, err_value in err_data.items():
                if err_value == 'error':
                    details.append(f"{err_type}: 측정 오류")
                    continue

                try:
                    value = int(err_value)

                    if err_type == 'BER':
                        if value == 0:
                            status = "정상"
                        elif value <= 20:
                            status = "경미한 오류"
                        else:
                            status = "장애"

                    elif err_type == 'ES':
                        status = "정상" if value == 0 else (
                            "경고" if value < 10 else "장애")

                    elif err_type == 'SES':
                        status = "정상" if value == 0 else (
                            "경고" if value < 5 else "장애")

                    elif err_type == 'UAS':
                        status = "정상" if value == 0 else "장애"

                    elif err_type == 'BBE':
                        status = "정상" if value == 0 else (
                            "경고" if value < 100 else "장애")

                    else:
                        status = "확인 필요"

                    details.append(f"{err_type}: {value} ({status})")

                except (ValueError, TypeError):
                    details.append(f"{err_type}: {err_value} (변환 실패)")

        return ', '.join(details) if details else "ERR 파라미터 정보 없음"

    def get_voltage_parameter_details(self, data, equip_type: str = '') -> str:
        """전압 파라미터 상세 정보 (정상 상태용)"""
        # 기준범위 초과여부는 threshold 값으로 비교하지 않고 하드코딩된 상수값 49V로 비교하기 때문에 수정 필요
        # equip_type=CTR 장비인 경우: threshod 값이 error로 나오기 때문에, 이 값은 체크하지 않고 패스하도록 추가 처리 필요

        if 'VOLT' in data:
            volt_data = data['VOLT']
            value = self._parse_parameter_value(volt_data, 'value', 0)
            threshold = self._parse_parameter_value(volt_data, 'threshold', 0)

            if volt_data.get('value') == 'error':
                return "전압 측정 오류"
            elif value is not None and threshold is not None:
                status = "이상" if value >= threshold else "미달"
                return f"현재 {value}V로 기준범위 {threshold}V {status}"
            elif value is not None and volt_data.get('threshold') == 'error' and equip_type == 'ctr':
                # CTR 장비의 경우 threshold가 error이므로 기준 비교 없이 값만 표시
                return f"전압: {value}V"
            else:
                return f"전압: {volt_data.get('value', 'N/A')}"

        return "전압 정보 없음"

    # 3. 상위 장비 장애점 분석
    def analyze_upper_node_failures(self):
        self.logger.info("[3단계] 상위 장비 장애점 분석 시작")

        node_alarm_map = self._create_node_alarm_map()
        level_nodes = self._group_nodes_by_level()

        step_message = self._build_step_message(
            "3", "상위 장비 장애점 분석", "계위별 경보 Tree 탐색")
        step_message += f"{self.HTML_BR}• 전체 장비: {len(self.nodes)}대, 경보발생 장비: {len(node_alarm_map)}대\n"
        step_message += f"{self.HTML_BR}{self.HTML_NBSP} - 하위 장비 모두 경보인 경우 상위 장비 장애 의심 탐색\n"

        level_info = [f"{self.HTML_BR}{self.HTML_NBSP} - Level {level}: {len(nodes)}대"
                      for level, nodes in level_nodes.items()]
        step_message += f"{self.HTML_BR}{self.HTML_BR}• 계위별 장비 현황 (Level 0: 현재 선택된 장비)\n" + "\n".join(
            level_info) + "\n"

        self._log_upper_analysis_info(node_alarm_map, level_nodes)

        upper_failure_count, analysis_details = self._analyze_by_levels(
            level_nodes, node_alarm_map)

        step_message += "\n".join(analysis_details)
        step_message = self._add_step_result(
            step_message, [], upper_failure_count)
        self.send_progress(step_message)

        self.logger.info(
            f"[3단계] 상위 장비 장애점 분석 완료 => 발견된 상위 노드 장애점: {upper_failure_count}개")

    def _log_upper_analysis_info(self, node_alarm_map: Dict, level_nodes: Dict):
        """상위 분석 정보 로깅"""
        self.logger.info(f"• 장비별 경보 매핑 완료: {len(node_alarm_map)}대 장비에 경보 존재")
        self.logger.info(f"• Level 장비 그룹화 완료:")
        for level, nodes in level_nodes.items():
            self.logger.info(f"    - Level #{level}: {len(nodes)}대 장비")

    def _analyze_by_levels(self, level_nodes: Dict, node_alarm_map: Dict) -> Tuple[int, List[str]]:
        """레벨별 분석 실행"""
        upper_failure_count = 0
        analysis_details = []

        sorted_levels = sorted(level_nodes.keys(), reverse=True)
        analysis_details.append(
            f"{self.HTML_BR}{self.HTML_BR}• Level 분석 순서: {sorted_levels}\n")

        self.logger.info(f"• 🔍 Level 분석 순서: {sorted_levels}")

        for level in sorted_levels:
            self.logger.info(f"• Level {level} 분석 중...")
            level_details = []
            level_failure_count = 0

            for i, node in enumerate(level_nodes[level]):
                node_name = node.get('name', node['id'])
                sector = node.get('field', '장비')

                self.logger.info(
                    f"• 🔍 [{i+1}/{len(level_nodes[level])}] 분야: {sector}, 장비 분석: {node_name}")

                if self._is_upper_node_failure(node, node_alarm_map, level_nodes):
                    node_alarms = node_alarm_map.get(node['id'], [])

                    self._create_failure_point(
                        failure_type='node',
                        node_id=node['id'],
                        name=node_name,
                        sector=sector,
                        failure_desc='상위 장비 장애 (경보 Tree 탐색)',
                        inference_detail='상위 장비 장애로 인한 하위 장비들의 연쇄적 경보',
                        alarms=node_alarms,
                        confidence=self.CONFIDENCE_MEDIUM
                    )

                    level_failure_count += 1
                    level_details.append(
                        f"{self.HTML_BR}{self.HTML_NBSP}{self.HTML_NBSP} .{node_name}: 상위 장비 장애 (경보 {len(node_alarms)}건)")
                    self.logger.info(
                        f"• 상위 장비 장애점 발견: {node_name} (경보: {len(node_alarms)}건)")
                    self._log_alarm_details(node_alarms)
                else:
                    level_details.append(
                        f"{self.HTML_BR}{self.HTML_NBSP}{self.HTML_NBSP} . [장애 불일치] {node_name}")
                    self.logger.info(f"• 장애 불일치")

            if level_details:
                analysis_details.append(
                    f"{self.HTML_BR}{self.HTML_NBSP} - Level #{level} 분석 결과:")
                analysis_details.extend(level_details)

            upper_failure_count += level_failure_count

        return upper_failure_count, analysis_details

    # 4. 교환 노드 장애점 분석
    def analyze_exchange_failures(self):
        self.logger.info("[4단계] 교환 장비 장애점 분석 시작")

        exchange_nodes = [node for node in self.nodes if node.get(
            'field', '').upper() == '교환']

        step_message = self._build_step_message(
            "4", "교환 장애점 분석", "A1935, A1930 경보 패턴")
        step_message += f"{self.HTML_BR}• 교환 장비 수: {len(exchange_nodes)}대\n"

        if not exchange_nodes:
            step_message += f"{self.HTML_BR}{self.HTML_NBSP} → 교환 장비가 없어 4단계 분석을 패스합니다."
            self.send_progress(step_message)
            self.logger.info("• 교환 장비가 없어서 4단계 분석을 건너뜁니다.")
            return

        step_message += f"{self.HTML_BR}{self.HTML_BR}• 장비별 점검 결과:\n"

        exchange_failure_count, exchange_details = self._analyze_exchange_nodes(
            exchange_nodes)

        step_message += "\n".join(exchange_details)
        step_message = self._add_step_result(
            step_message, [], exchange_failure_count)
        self.send_progress(step_message)

        self.logger.info(
            f"[4단계] 교환 장비 장애점 분석 완료 => 발견된 교환 장애점: {exchange_failure_count}개")

    def _analyze_exchange_nodes(self, exchange_nodes: List[Dict]) -> Tuple[int, List[str]]:
        """교환 노드들 분석"""
        exchange_failure_count = 0
        exchange_details = []

        self.logger.info(f"• 교환 장비 수: {len(exchange_nodes)}대")

        for i, node in enumerate(exchange_nodes):
            node_name = node.get('name', node['id'])
            self.logger.info(
                f"• 🔍 [{i+1}/{len(exchange_nodes)}] 교환 장비 분석: {node_name}")

            node_alarms = self._get_node_alarms(node['id'])
            self.logger.info(f"• 교환 경보 수: {len(node_alarms)}건")

            # A1935 경보 체크
            a1935_alarms = [
                alarm for alarm in node_alarms if 'A1935' in alarm.get('alarm_message', '')]
            self.logger.info(f"• A1935 경보 수: {len(a1935_alarms)}건")

            # A1935 경보 100개 이상인 경우 => CGW 및 CGW 연동장비 체크 필요
            if len(a1935_alarms) >= self.A1935_ALARM_THRESHOLD:
                self._create_failure_point(
                    failure_type='node',
                    node_id=node['id'],
                    name=node_name,
                    sector=self.SECTOR_EXCHANGE,
                    failure_desc='A1935 다량 경보(100개 이상)',
                    inference_detail='CGW 및 CGW 연동장비 체크 필요',
                    alarms=a1935_alarms,
                    confidence=self.CONFIDENCE_HIGH
                )

                exchange_failure_count += 1
                exchange_details.append(
                    f"{self.HTML_BR}• {node_name}: A1935 다량 경보 ({len(a1935_alarms)}건) - CGW 및 CGW 연동장비 체크 필요")
                self.logger.info(
                    f"• A1935 다량 경보 발생: {node_name} (A1935: {len(a1935_alarms)}건)")
                continue

            # A1930 경보 분석
            a1930_result = self._analyze_a1930_alarms(
                node, node_alarms, exchange_details)
            if a1930_result['has_failure']:
                exchange_failure_count += a1930_result['failure_count']

        return exchange_failure_count, exchange_details

    def _analyze_a1930_alarms(self, node: Dict, node_alarms: List[Dict], exchange_details: List[str]) -> Dict[str, Any]:
        """A1930 경보 분석"""
        node_name = node.get('name', node['id'])
        a1930_alarms = [
            alarm for alarm in node_alarms if 'A1930' in alarm.get('alarm_message', '')]

        self.logger.info(f"• A1930 경보 수: {len(a1930_alarms)}건")

        if a1930_alarms:
            self.logger.info(f"• 🔍 A1930 경보 분석 진행: {node_name}")

            before_count = len(self.failure_points)
            a1930_result = self._analyze_a1930_failures_detailed(
                node, a1930_alarms)
            after_count = len(self.failure_points)

            failure_count = after_count - before_count
            if failure_count > 0:
                exchange_details.append(
                    f"{self.HTML_BR}{self.HTML_NBSP} - {node_name}: A1930 관련 경보 ({len(a1930_alarms)}건) - {a1930_result}")
                self.logger.info(f"• A1930 관련 경보 발견: {failure_count}개")
                return {'has_failure': True, 'failure_count': failure_count}
            else:
                exchange_details.append(
                    f"{self.HTML_BR}{self.HTML_NBSP} - [장애 불일치] {node_name}: A1930 경보 ({len(a1930_alarms)}건)")
        else:
            exchange_details.append(
                f"{self.HTML_BR}{self.HTML_NBSP} - [정상] {node_name} → 관련 경보 없음")
            self.logger.info(f"• A1930/1935 경보 없음: 정상")

        return {'has_failure': False, 'failure_count': 0}

    # 4-2. 교환 노드 A1930 경보 분석 (세부)
    def _analyze_a1930_failures_detailed(self, exchange_node, a1930_alarms):
        other_sector_alarms = self._get_other_sector_alarms(['IP', '전송'])

        if len(a1930_alarms) <= self.A1930_LOW_THRESHOLD and not other_sector_alarms:
            # Case 1: 다른 분야 경보 없고 + A1930 10개 이하인 경우
            self._create_failure_point(
                failure_type='node',
                node_id=exchange_node['id'],
                name=exchange_node.get('name', exchange_node['id']),
                sector=self.SECTOR_EXCHANGE,
                failure_desc='교환 A1930 단독 장애',
                inference_detail='AGW 단독고장으로 공통부 장애 확인 필요',
                alarms=a1930_alarms,
                confidence=self.CONFIDENCE_MEDIUM
            )
            return "AGW 단독고장 체크"
        elif len(a1930_alarms) >= self.A1930_HIGH_THRESHOLD and other_sector_alarms:

            # Case 2: IP/전송 경보 존재 + A1930 11개 이상인 경우
            upper_exchange_nodes = self._find_upper_exchange_nodes(
                exchange_node)

            for upper_node in upper_exchange_nodes:
                upper_alarms = self._get_node_alarms(upper_node['id'])
                if upper_alarms:
                    self._create_failure_point(
                        failure_type='node',
                        node_id=upper_node['id'],
                        name=upper_node.get('name', upper_node['id']),
                        sector=self.SECTOR_EXCHANGE,
                        failure_desc='교환 상위 장비 장애',
                        inference_detail='교환 상위장비 시스템 장애 확인 필요',
                        alarms=upper_alarms,
                        confidence=self.CONFIDENCE_MEDIUM_LOW
                    )
            return "교환 상위장비 장애 체크"
        else:
            return "장애 불일치"

    # 5. 전송 노드 장애점 분석
    def analyze_transmission_failures(self):
        self.logger.info("[5단계] 전송 장애점 분석 시작")

        transmission_nodes = [node for node in self.nodes if node.get(
            'field', '').upper() == '전송']

        step_message = self._build_step_message(
            "5", "전송 장애점 분석", "LOS, LOF 경보 패턴")
        step_message += f"{self.HTML_BR}• 전송 장비 수: {len(transmission_nodes)}대\n"

        if not transmission_nodes:
            step_message += f"{self.HTML_BR}{self.HTML_NBSP} → 전송 장비가 없어 5단계 분석을 패스합니다."
            self.send_progress(step_message)
            self.logger.info("• 전송 장비가 없어서 5단계 분석을 건너뜁니다.")
            return

        step_message += f"{self.HTML_BR}{self.HTML_BR}• 전송 장비 점검 결과:\n"

        transmission_failure_count, transmission_details = self._analyze_transmission_nodes(
            transmission_nodes)

        step_message += "\n".join(transmission_details)
        step_message = self._add_step_result(
            step_message, [], transmission_failure_count)
        self.send_progress(step_message)

        self.logger.info(
            f"[5단계] 전송 장비 장애점 분석 완료 => 발견된 전송 장애점: {transmission_failure_count}대")

    def _analyze_transmission_nodes(self, transmission_nodes: List[Dict]) -> Tuple[int, List[str]]:
        """전송 노드들 분석"""
        transmission_failure_count = 0
        transmission_details = []

        self.logger.info(f"• 전송 장비 수: {len(transmission_nodes)}대")

        for i, node in enumerate(transmission_nodes):
            node_name = node.get('name', node['id'])
            self.logger.info(
                f"• 🔍 [{i+1}/{len(transmission_nodes)}] 전송 장비 분석: {node_name}")

            node_alarms = self._get_node_alarms(node['id'])
            self.logger.info(f"• 전송 장비 경보 수: {len(node_alarms)}개")

            # LOS 경보 체크
            los_result = self._check_los_alarms(
                node, node_alarms, transmission_details)

            if los_result['has_failure']:
                transmission_failure_count += 1
                continue

            # LOF 경보 체크
            lof_result = self._check_lof_alarms(
                node, node_alarms, transmission_details)

            if lof_result['has_failure']:
                transmission_failure_count += 1
            elif not los_result['has_alarms'] and not lof_result['has_alarms']:
                transmission_details.append(
                    f"{self.HTML_BR}{self.HTML_NBSP}{self.HTML_NBSP} - [정상] {node_name} → 관련 경보 없음")
                self.logger.info(
                    f"{self.HTML_NBSP}{self.HTML_NBSP} - [정상] LOS/LOF 경보 없음")

        return transmission_failure_count, transmission_details

    def _check_los_alarms(self, node: Dict, node_alarms: List[Dict], transmission_details: List[str]) -> Dict[str, bool]:
        """LOS 경보 체크 => 대항국 장애 or 선로 장애 의심"""
        node_name = node.get('name', node['id'])
        los_alarms = [alarm for alarm in node_alarms if 'LOS' in alarm.get(
            'alarm_message', '').upper() or 'LOSS OF SIGNAL' in alarm.get('alarm_message', '').upper()]

        self.logger.info(f"• LOS 경보 수: {len(los_alarms)}건")

        if los_alarms:
            self._create_failure_point(
                failure_type='node',
                node_id=node['id'],
                name=node_name,
                sector=self.SECTOR_TRANSMISSION,
                failure_desc='전송 LOS 장애',
                inference_detail='광신호 손실로 선로 장애 또는 대항국 장애',
                alarms=los_alarms,
                confidence=self.CONFIDENCE_MEDIUM_HIGH
            )

            transmission_details.append(
                f"{self.HTML_BR}{self.HTML_NBSP}{self.HTML_NBSP} - {node_name}: LOS 장애 ({len(los_alarms)}대) - 광신호 손실, 선로 장애 또는 대항국 장애")
            self.logger.info(
                f"{self.HTML_NBSP}{self.HTML_NBSP} - LOS 장애점 발견: {node_name} (LOS: {len(los_alarms)}대)")
            self._log_transmission_alarm_details(los_alarms, "LOS")

            return {'has_failure': True, 'has_alarms': True}

        return {'has_failure': False, 'has_alarms': False}

    def _check_lof_alarms(self, node: Dict, node_alarms: List[Dict], transmission_details: List[str]) -> Dict[str, bool]:
        """LOF 경보 체크 => 대항국 장애 의심"""
        node_name = node.get('name', node['id'])
        lof_alarms = [alarm for alarm in node_alarms if 'LOF' in alarm.get(
            'alarm_message', '').upper()]

        self.logger.info(
            f"{self.HTML_NBSP}{self.HTML_NBSP} - LOF 경보 수: {len(lof_alarms)}건")

        if lof_alarms:
            self._create_failure_point(
                failure_type='node',
                node_id=node['id'],
                name=node_name,
                sector=self.SECTOR_TRANSMISSION,
                failure_desc='전송 LOF 장애',
                inference_detail='대항국 장비 불량',
                alarms=lof_alarms,
                confidence=self.CONFIDENCE_MEDIUM
            )

            transmission_details.append(
                f"{self.HTML_BR}{self.HTML_NBSP}{self.HTML_NBSP} - {node_name}: LOF 장애 ({len(lof_alarms)}대) - 대항국 장비 불량")
            self.logger.info(
                f"{self.HTML_NBSP}{self.HTML_NBSP} - LOF 장애점 발견: {node_name} (LOF: {len(lof_alarms)}대)")
            self._log_transmission_alarm_details(lof_alarms, "LOF")

            return {'has_failure': True, 'has_alarms': True}

        return {'has_failure': False, 'has_alarms': False}

    def _log_transmission_alarm_details(self, alarms: List[Dict], alarm_type: str):
        """전송 경보 상세 정보 로깅"""
        for j, alarm in enumerate(alarms[:self.MAX_LOGGED_ALARMS]):
            alarm_msg = alarm.get('alarm_message', 'Unknown')
            self.logger.info(
                f"{self.HTML_NBSP}{self.HTML_NBSP} - {alarm_type} 경보{j+1}: {alarm_msg}")

        if len(alarms) > self.MAX_LOGGED_ALARMS:
            self.logger.info(
                f"... 외 {len(alarms) - self.MAX_LOGGED_ALARMS}개 {alarm_type} 경보")

    # 6. IP 분야 장애점 분석
    def analyze_IP_failures(self):
        self.logger.info("[6단계] IP 분야 장애점 분석 시작")

        ip_nodes = [node for node in self.nodes if node.get(
            'field', '').upper() == 'IP']

        step_message = self._build_step_message(
            "6", "IP 장애점 분석", "Critical, Major, OperStatus")
        step_message += f"{self.HTML_BR}• IP 장비 수: {len(ip_nodes)}대\n"

        if not ip_nodes:
            step_message += f"{self.HTML_BR}{self.HTML_NBSP} → IP 장비가 없어 6단계 분석을 패스합니다."
            self.send_progress(step_message)
            self.logger.info("• IP 장비가 없어서 6단계 분석을 건너뜁니다.")
            return

        step_message += f"{self.HTML_BR}{self.HTML_BR}• IP 장비 점검 결과:\n"

        ip_failure_count, ip_details = self._analyze_ip_nodes(ip_nodes)

        step_message += "\n".join(ip_details)
        step_message = self._add_step_result(
            step_message, [], ip_failure_count)
        self.send_progress(step_message)

        self.logger.info(
            f"[6단계] IP 분야 장애점 분석 완료 => 발견된 IP 장애점: {ip_failure_count}개")

    def _analyze_ip_nodes(self, ip_nodes: List[Dict]) -> Tuple[int, List[str]]:
        """IP 노드들 분석"""
        ip_failure_count = 0
        ip_details = []

        self.logger.info(f"• IP 장비 수: {len(ip_nodes)}대")

        for i, node in enumerate(ip_nodes):
            node_name = node.get('name', node['id'])
            node_id = node.get('id')
            self.logger.info(
                f"• 🔍 [{i+1}/{len(ip_nodes)}] IP 장비 분석: {node_name}")

            # IP 장비 관련 경보 조회 (alarmDataWithoutCable에서)
            ip_alarms = self._get_ip_node_alarms(node_id, node_name)
            self.logger.info(f"• IP 장비 경보 수: {len(ip_alarms)}개")

            # Major/Critical 경보 체크
            major_critical_result = self._check_ip_major_critical_alarms(
                node, ip_alarms, ip_details)

            if major_critical_result['has_failure']:
                ip_failure_count += 1
                continue

            # SNMP OperStatus 경보 체크 (특정 장비 종류만)
            snmp_status_result = self._check_ip_snmp_status_alarms(
                node, ip_alarms, ip_details)

            if snmp_status_result['has_failure']:
                ip_failure_count += 1
            elif not major_critical_result['has_alarms'] and not snmp_status_result['has_alarms']:
                ip_details.append(
                    f"{self.HTML_BR}{self.HTML_NBSP} - [정상] {node_name} → 관련 경보 없음")
                self.logger.info(f"• 관련 경보 없음: 정상")

        return ip_failure_count, ip_details

    def _get_ip_node_alarms(self, node_id: str, node_name: str) -> List[Dict]:
        """IP 노드의 경보 조회 (전역 경보 데이터에서)"""
        ip_alarms = []

        # alarmDataWithoutCable에서 해당 IP 장비의 경보 찾기
        for alarm in self.alarmDataWithoutCable:
            alarm_equip_name = alarm.get('equip_name', '')
            alarm_sector = alarm.get('sector', '').upper()

            # IP 분야이고 장비명이 일치하는 경보
            if alarm_sector == 'IP' and alarm_equip_name == node_name:
                ip_alarms.append(alarm)

        self.logger.info(f"• IP 장비 '{node_name}' 관련 경보: {len(ip_alarms)}건")
        return ip_alarms

    def _check_ip_major_critical_alarms(self, node: Dict, ip_alarms: List[Dict], ip_details: List[str]) -> Dict[str, bool]:
        """IP Critical/Major 경보 체크"""
        node_name = node.get('name', node['id'])
        major_critical_alarms = [
            alarm for alarm in ip_alarms
            if alarm.get('alarm_grade', '').upper() in ['M', 'C']
        ]

        self.logger.info(
            f"• Critical + Major 경보 수: {len(major_critical_alarms)}건")

        if major_critical_alarms:
            # Major/Critical 경보별 분류
            critical_alarms = [alarm for alarm in major_critical_alarms
                               if alarm.get('alarm_grade', '').upper() == 'C']
            major_alarms = [alarm for alarm in major_critical_alarms
                            if alarm.get('alarm_grade', '').upper() == 'M']

            grade_info = []
            if critical_alarms:
                grade_info.append(f"Critical {len(critical_alarms)}건")
            if major_alarms:
                grade_info.append(f"Major {len(major_alarms)}건")

            self._create_failure_point(
                failure_type='node',
                node_id=node['id'],
                name=node_name,
                sector=self.SECTOR_IP,
                failure_desc='IP 장비 Critical/Major 경보',
                inference_detail=f'IP 장비에서 심각한 수준의 경보 발생: {", ".join(grade_info)}',
                alarms=major_critical_alarms,
                confidence=self.CONFIDENCE_HIGH
            )

            ip_details.append(
                f"{self.HTML_BR}{self.HTML_NBSP} - {node_name}: Critical/Major 경보 ({len(major_critical_alarms)}건) - {', '.join(grade_info)}")
            self.logger.info(
                f"• IP Critical/Major 장애점 발견: {node_name} ({', '.join(grade_info)})")

            return {'has_failure': True, 'has_alarms': True}

        return {'has_failure': False, 'has_alarms': len(major_critical_alarms) > 0}

    def _check_ip_snmp_status_alarms(self, node: Dict, ip_alarms: List[Dict], ip_details: List[str]) -> Dict[str, bool]:
        """IP SNMP OperStatus 경보 체크 (특정 장비 종류만)"""
        node_name = node.get('name', node['id'])

        # 특정 장비 종류 체크
        target_equip_kinds = ['대용량 OLT', '주중계', 'MNP', 'SER']
        node_equip_kind = ''
        matching_equip_kinds = []

        # IP 경보에서 equip_kind 확인
        for alarm in ip_alarms:
            equip_kind = alarm.get('equip_kind', '')
            if equip_kind:
                node_equip_kind = equip_kind
                # 타겟 장비 종류와 매칭되는지 확인
                for target_kind in target_equip_kinds:
                    if target_kind in equip_kind:
                        matching_equip_kinds.append(target_kind)

        self.logger.info(f"• 장비 종류 (equip_kind): '{node_equip_kind}'")
        self.logger.info(f"• 매칭된 대상 장비 종류: {matching_equip_kinds}")

        # 대상 장비 종류가 아니면 체크 안함
        if not matching_equip_kinds:
            self.logger.info(f"• 대상 장비 종류가 아니므로 SNMP OperStatus 체크 제외")
            return {'has_failure': False, 'has_alarms': False}

        # SNMP OperStatus 경보 찾기
        snmp_status_alarms = [
            alarm for alarm in ip_alarms
            if 'SNMP OperStatus' in alarm.get('alarm_message', '')
        ]

        self.logger.info(f"• SNMP OperStatus 경보 수: {len(snmp_status_alarms)}건")

        if snmp_status_alarms:
            # 최근 10분 내 해당 장비의 경보 10개 이상 체크
            recent_alarms = self._get_recent_alarms(
                ip_alarms, self.WIRELESS_TIME_WINDOW_MINUTES)

            self.logger.info(f"• 최근 10분 내 총 경보: {len(recent_alarms)}건")

            if len(recent_alarms) >= self.WIRELESS_ALARM_THRESHOLD:
                # 선로 장애로 판단
                self._create_failure_point(
                    failure_type='node',
                    node_id=node['id'],
                    name=node_name,
                    sector=self.SECTOR_IP,
                    failure_desc='IP 장비 SNMP OperStatus 경보 - 선로 장애',
                    inference_detail=f'{", ".join(matching_equip_kinds)} 장비에서 SNMP OperStatus 경보 + 최근 10분 내 다량 경보({len(recent_alarms)}건) 발생으로 선로 장애 의심',
                    alarms=snmp_status_alarms,
                    confidence=self.CONFIDENCE_MEDIUM_HIGH
                )

                ip_details.append(
                    f"{self.HTML_BR}{self.HTML_NBSP} - {node_name}: SNMP OperStatus 경보 ({len(snmp_status_alarms)}건) - 선로 장애 의심 ({', '.join(matching_equip_kinds)} 장비)")
                self.logger.info(
                    f"• IP SNMP OperStatus 선로 장애점 발견: {node_name} ({', '.join(matching_equip_kinds)})")

                return {'has_failure': True, 'has_alarms': True}
            else:
                ip_details.append(
                    f"{self.HTML_BR}{self.HTML_NBSP} - [장애 불일치] {node_name}: SNMP OperStatus 경보는 발생했으나, 최근 10분 내 경보 {len(recent_alarms)}건으로 다량 경보 10건 미달")
                self.logger.info(
                    f"• SNMP OperStatus 경보 있으나 최근 경보 수 부족: {len(recent_alarms)}개")

        return {'has_failure': False, 'has_alarms': len(snmp_status_alarms) > 0}

    # 7. 무선 분야 장애점 분석
    def analyze_wireless_failures(self):
        self.logger.info("[7단계] 무선 분야 장애점 분석 시작")

        wireless_nodes = [node for node in self.nodes if node.get(
            'field', '').upper() == '무선']

        step_message = self._build_step_message(
            "7", "무선 장애점 분석", "NE3S, ToP, BTS 경보 패턴")
        step_message += f"{self.HTML_BR}• 무선 DU 장비 수: {len(wireless_nodes)}대\n"

        if not wireless_nodes:
            step_message += f"{self.HTML_BR}{self.HTML_NBSP} → 무선 장비가 없어 7단계 분석을 패스합니다."
            self.send_progress(step_message)
            self.logger.info("• 무선 장비가 없어서 7단계 분석을 건너뜁니다.")
            return

        step_message += f"{self.HTML_BR}{self.HTML_BR}• 무선 장비 점검 결과:\n"

        wireless_failure_count, wireless_details = self._analyze_wireless_nodes(
            wireless_nodes)

        step_message += "\n".join(wireless_details)
        step_message = self._add_step_result(
            step_message, [], wireless_failure_count)
        self.send_progress(step_message)

        self.logger.info(
            f"[7단계] 무선 장비 장애점 분석 완료 => 발견된 무선 장애점: {wireless_failure_count}개")

    def _analyze_wireless_nodes(self, wireless_nodes: List[Dict]) -> Tuple[int, List[str]]:
        """무선 노드들 분석"""
        wireless_failure_count = 0
        wireless_details = []

        self.logger.info(f"• 무선 장비 수: {len(wireless_nodes)}대")

        for i, node in enumerate(wireless_nodes):
            node_name = node.get('name', node['id'])
            self.logger.info(
                f"• 🔍 [{i+1}/{len(wireless_nodes)}] 무선 장비 분석: {node_name}")

            node_alarms = self._get_node_alarms(node['id'])
            self.logger.info(f"• 무선 장비 경보 수: {len(node_alarms)}개")

            # NE3S 경보 체크
            ne3s_result = self._check_ne3s_alarms(
                node, node_alarms, wireless_details)
            if ne3s_result['has_failure']:
                wireless_failure_count += 1
                continue

            # ToP/BTS 경보 체크
            top_bts_result = self._check_top_bts_alarms(
                node, node_alarms, wireless_details)
            if top_bts_result['has_failure']:
                wireless_failure_count += 1
            elif not ne3s_result['has_alarms'] and not top_bts_result['has_alarms']:
                wireless_details.append(
                    f"{self.HTML_BR}{self.HTML_NBSP} - [정상] {node_name} → 관련 경보 없음")
                self.logger.info(
                    f"{self.HTML_NBSP}{self.HTML_NBSP} - [정상] NE3S/ToP/BTS 경보 없음")

        return wireless_failure_count, wireless_details

    def _check_ne3s_alarms(self, node: Dict, node_alarms: List[Dict], wireless_details: List[str]) -> Dict[str, bool]:
        """NE3S 경보 체크"""
        node_name = node.get('name', node['id'])
        ne3s_alarms = [alarm for alarm in node_alarms if 'Timeout connecting to NE3' in alarm.get(
            'alarm_message', '')]

        self.logger.info(f"• NE3S 경보 수: {len(ne3s_alarms)}건")

        if ne3s_alarms:
            # 최근 10분 내 경보 10개 이상 체크
            recent_alarms = self._get_recent_alarms(
                node_alarms, self.WIRELESS_TIME_WINDOW_MINUTES)

            if len(recent_alarms) >= self.WIRELESS_ALARM_THRESHOLD:
                # 직접 연결된 IP 또는 전송 분야 장비 경보 확인
                connected_ip_transmission_alarms = self._get_connected_ip_transmission_alarms(
                    node)

                if connected_ip_transmission_alarms:
                    # 광케이블 장애 또는 상위망(무선 백본) 장애
                    self._create_failure_point(
                        failure_type='node',
                        node_id=node['id'],
                        name=node_name,
                        sector=self.SECTOR_WIRELESS,
                        failure_desc='무선 NE3S 연결장애 - 광케이블/상위망 장애',
                        inference_detail='Timeout connecting to NE3S 경보 + IP/전송 장비 경보로 광케이블 장애 또는 상위망(무선 백본) 장애 의심',
                        alarms=ne3s_alarms,
                        confidence=self.CONFIDENCE_HIGH
                    )

                    wireless_details.append(
                        f"{self.HTML_BR}{self.HTML_NBSP}{self.HTML_NBSP} - {node_name}: NE3S 연결 Timeout 경보 ({len(ne3s_alarms)}건) - 광케이블 장애 또는 상위망(무선 백본) 장애 의심")
                    self.logger.info(
                        f"{self.HTML_NBSP}{self.HTML_NBSP} - NE3S 연결 Timeout 경보 => 광케이블 장애 또는 상위망(무선 백본) 장애 의심: {node_name}")
                else:
                    # 무선 DU 집선스위치 장애 또는 한전 정전
                    self._create_failure_point(
                        failure_type='node',
                        node_id=node['id'],
                        name=node_name,
                        sector=self.SECTOR_WIRELESS,
                        failure_desc='무선 NE3S Timeout 경보 => DU 집선스위치 또는 한전 정전',
                        inference_detail='무선 NE3S Timeout 경보 + IP/전송 장비는 경보 없음 => 무선 DU 집선스위치 장애 또는 한전 정전 의심',
                        alarms=ne3s_alarms,
                        confidence=self.CONFIDENCE_MEDIUM_HIGH
                    )

                    wireless_details.append(
                        f"{self.HTML_BR}{self.HTML_NBSP}{self.HTML_NBSP} - {node_name}: NE3S 연결 Timeout 경보 ({len(ne3s_alarms)}건) - 무선 DU 집선스위치 장애 또는 한전 정전 의심")
                    self.logger.info(
                        f"{self.HTML_NBSP}{self.HTML_NBSP} - NE3S 연결 Timeout 경보 => DU 집선스위치 또는 한전 정전: {node_name}")

                return {'has_failure': True, 'has_alarms': True}
            else:
                wireless_details.append(
                    f"{self.HTML_BR}{self.HTML_NBSP}{self.HTML_NBSP} - [장애 불일치] {node_name}: NE3S 경보는 발생했으나, 최근 10분 내 경보 {len(recent_alarms)}건으로 다량 경보 10건 미달")
                self.logger.info(
                    f"• NE3S 경보 있으나 최근 경보 수 부족: {len(recent_alarms)}개")

        return {'has_failure': False, 'has_alarms': len(ne3s_alarms) > 0}

    def _check_top_bts_alarms(self, node: Dict, node_alarms: List[Dict], wireless_details: List[str]) -> Dict[str, bool]:
        """ToP/BTS 경보 체크"""
        node_name = node.get('name', node['id'])
        top_bts_alarms = [alarm for alarm in node_alarms
                          if 'ToP reference missing' in alarm.get('alarm_message', '') or
                          'BTS reference clock missing' in alarm.get('alarm_message', '')]

        self.logger.info(f"• ToP/BTS 경보 수: {len(top_bts_alarms)}건")

        if top_bts_alarms:
            # 최근 10분 내 경보 10개 이상 체크
            recent_alarms = self._get_recent_alarms(
                node_alarms, self.WIRELESS_TIME_WINDOW_MINUTES)

            if len(recent_alarms) >= self.WIRELESS_ALARM_THRESHOLD:
                # 직접 연결된 IP 또는 전송 분야 장비 경보 확인
                connected_ip_transmission_alarms = self._get_connected_ip_transmission_alarms(
                    node)

                if connected_ip_transmission_alarms:
                    # 광케이블 장애 또는 상위망(무선 백본) 장애
                    self._create_failure_point(
                        failure_type='node',
                        node_id=node['id'],
                        name=node_name,
                        sector=self.SECTOR_WIRELESS,
                        failure_desc='무선 ToP/BTS 클럭 경보 - 광케이블/상위망 장애',
                        inference_detail='ToP/BTS 클럭 경보 + IP/전송 장비 경보 동시 발생 => 광케이블 장애 또는 상위망(무선 백본) 장애 의심',
                        alarms=top_bts_alarms,
                        confidence=self.CONFIDENCE_HIGH
                    )

                    wireless_details.append(
                        f"{self.HTML_BR}{self.HTML_NBSP}{self.HTML_NBSP} - {node_name}: ToP/BTS 클럭 경보 ({len(top_bts_alarms)}건) - 광케이블 장애 또는 상위망(무선 백본) 장애 의심")
                    self.logger.info(
                        f"{self.HTML_NBSP}{self.HTML_NBSP} - ToP/BTS 클럭 경보 (광케이블/상위망): {node_name}")
                else:
                    # ToP(클럭공급장치) 장애
                    self._create_failure_point(
                        failure_type='node',
                        node_id=node['id'],
                        name=node_name,
                        sector=self.SECTOR_WIRELESS,
                        failure_desc='무선 ToP/BTS 클럭 경보 - ToP 장애',
                        inference_detail='ToP/BTS 클럭 Missing 경보 + IP/전송 장비는 경보 없음 => ToP(클럭공급장치) 장애 의심',
                        alarms=top_bts_alarms,
                        confidence=self.CONFIDENCE_MEDIUM_HIGH
                    )

                    wireless_details.append(
                        f"{self.HTML_BR}{self.HTML_NBSP}{self.HTML_NBSP} - {node_name}: ToP/BTS 클럭장애 ({len(top_bts_alarms)}건) - ToP(클럭공급장치) 장애")
                    self.logger.info(
                        f"{self.HTML_NBSP}{self.HTML_NBSP} - ToP/BTS 클럭장애 (ToP 장애): {node_name}")

                return {'has_failure': True, 'has_alarms': True}
            else:
                wireless_details.append(
                    f"{self.HTML_BR}{self.HTML_NBSP}{self.HTML_NBSP} - [조건 불일치] {node_name}: ToP/BTS 경보가 발생했으나, 최근 10분 내 경보 {len(recent_alarms)}건으로 다량 경보 10건 미달")
                self.logger.info(
                    f"• ToP/BTS 경보 있으나 최근 경보 수 부족: {len(recent_alarms)}개")

        return {'has_failure': False, 'has_alarms': len(top_bts_alarms) > 0}

    def _get_recent_alarms(self, alarms: List[Dict], time_window_minutes: int) -> List[Dict]:
        """최근 지정된 시간 내 경보 조회"""
        from datetime import datetime, timedelta

        current_time = datetime.now()
        time_threshold = current_time - timedelta(minutes=time_window_minutes)

        recent_alarms = []
        for alarm in alarms:
            alarm_time_str = alarm.get('alarm_time', '')
            if alarm_time_str:
                try:
                    # 경보 시간 파싱 (형식에 따라 조정 필요)
                    alarm_time = datetime.strptime(
                        alarm_time_str, '%Y-%m-%d %H:%M:%S')
                    if alarm_time >= time_threshold:
                        recent_alarms.append(alarm)

                except ValueError:
                    # 시간 파싱 실패 시 모든 경보를 최근 경보로 간주
                    recent_alarms.append(alarm)
            else:
                # 시간 정보가 없는 경우 모든 경보를 최근 경보로 간주
                recent_alarms.append(alarm)

        self.logger.info(
            f"• 최근 {time_window_minutes}분 내 경보: {len(recent_alarms)}건 / 전체 {len(alarms)}건")
        return recent_alarms

    def _get_connected_ip_transmission_alarms(self, wireless_node: Dict) -> List[Dict]:
        """무선 장비와 직접 연결된 IP 또는 전송 분야 장비의 경보 조회"""
        connected_alarms = []
        wireless_node_id = wireless_node.get('id')
        wireless_node_name = wireless_node.get('name', wireless_node_id)

        self.logger.info(
            f"• 🔍 무선 장비 '{wireless_node_name}' (ID: {wireless_node_id})와 직접 연결된 IP/전송 장비 경보 조회 시작")

        # 무선 장비와 직접 연결된 장비 ID들 찾기
        connected_node_ids = set()

        for link in self.links:
            source_id = link.get('source')
            target_id = link.get('target')

            # 무선 장비가 source인 경우
            if source_id == wireless_node_id:
                connected_node_ids.add(target_id)
                self.logger.info(
                    f"• 🔗 링크 발견: {wireless_node_name} → {target_id}")
            # 무선 장비가 target인 경우
            elif target_id == wireless_node_id:
                connected_node_ids.add(source_id)
                self.logger.info(
                    f"• 🔗 링크 발견: {source_id} → {wireless_node_name}")

        self.logger.info(
            f"• 📋 무선 장비와 직접 연결된 노드 ID 목록: {list(connected_node_ids)}")

        # 연결된 노드들 중 IP, 전송 분야 장비의 경보 수집
        ip_transmission_connected_count = 0
        for node in self.nodes:
            node_id = node.get('id')
            node_field = node.get('field', '').upper()
            node_name = node.get('name', node_id)

            # 직접 연결된 노드이고 IP 또는 전송 분야인 경우
            if node_id in connected_node_ids and node_field in ['IP', '전송']:
                ip_transmission_connected_count += 1
                node_alarms = self._get_node_alarms(node_id)

                if node_alarms:
                    connected_alarms.extend(node_alarms)
                    self.logger.info(
                        f"• ✅ 직접 연결된 {node_field} 장비 '{node_name}' 경보: {len(node_alarms)}건")
                else:
                    self.logger.info(
                        f"• ⭕ 직접 연결된 {node_field} 장비 '{node_name}' 경보: 0건 (정상)")

        self.logger.info(
            f"• 📊 직접 연결된 IP/전송 장비: {ip_transmission_connected_count}대")
        self.logger.info(f"• 📊 직접 연결된 IP/전송 장비 총 경보: {len(connected_alarms)}건")

        return connected_alarms

    # 헬퍼 메서드들
    def _create_node_alarm_map(self) -> Dict[str, List[Dict]]:
        """노드별 경보 매핑"""
        node_alarm_map = defaultdict(list)

        for node in self.nodes:
            node_id = node.get('id')
            node_alarms = node.get('alarms', [])

            if node_id and node_alarms:
                all_alarms = [alarm for alarm in node_alarms if alarm]
                node_alarm_map[node_id] = all_alarms

        return dict(node_alarm_map)

    def _group_nodes_by_level(self) -> Dict[int, List[Dict]]:
        """레벨별 노드 그룹화"""
        level_nodes = defaultdict(list)

        for node in self.nodes:
            level = node.get('level', 0)
            level_nodes[level].append(node)

        return dict(level_nodes)

    def _is_upper_node_failure(self, node, node_alarm_map, level_nodes) -> bool:
        """상위 노드 장애 여부 판단"""
        node_id = node['id']

        # 해당 노드에 경보가 있어야 함
        if node_id not in node_alarm_map:
            return False

        # 하위 노드들 모두 경보 확인
        lower_nodes = self._find_lower_nodes(node, level_nodes)
        if not lower_nodes:
            return False

        # 하위 노드가 최소 2개 이상이어야 함
        if len(lower_nodes) < 2:
            return False

        # 모든 하위 노드에 경보가 있는지 확인
        for lower_node in lower_nodes:
            if lower_node['id'] not in node_alarm_map:
                return False

        # 상위 노드에 경보가 없는지 확인
        upper_nodes = self._find_upper_nodes(node, level_nodes)
        for upper_node in upper_nodes:
            if upper_node['id'] in node_alarm_map:
                return False

        return True

    def _find_lower_nodes(self, node, level_nodes) -> List[Dict]:
        """하위 노드 찾기"""
        current_level = node.get('level', 0)
        lower_nodes = []

        for level in range(current_level + 1, max(level_nodes.keys()) + 1):
            lower_nodes.extend(level_nodes.get(level, []))

        return lower_nodes

    def _find_upper_nodes(self, node, level_nodes) -> List[Dict]:
        """상위 노드 찾기"""
        current_level = node.get('level', 0)
        upper_nodes = []

        for level in range(0, current_level):
            upper_nodes.extend(level_nodes.get(level, []))

        return upper_nodes

    def _get_node_alarms(self, node_id) -> List[Dict]:
        """노드 경보 조회"""
        node_alarm_map = self._create_node_alarm_map()
        return node_alarm_map.get(node_id, [])

    def _get_other_sector_alarms(self, fields) -> List[Dict]:
        """다른 분야 경보 조회"""
        other_alarms = []

        for alarm in self.alarmDataWithoutCable:
            alarm_sector = alarm.get('sector', '').upper()
            if alarm_sector in [field.upper() for field in fields]:
                other_alarms.append(alarm)

        return other_alarms

    def _find_upper_exchange_nodes(self, exchange_node) -> List[Dict]:
        """상위 교환 노드 찾기"""
        current_level = exchange_node.get('level', 0)
        upper_exchange_nodes = []

        for node in self.nodes:
            if (node.get('field', '').upper() == '교환' and
                    node.get('level', 0) < current_level):
                upper_exchange_nodes.append(node)

        return upper_exchange_nodes

    def _create_analysis_result(self) -> Dict[str, Any]:
        """분석 결과 생성"""
        summary = self._calculate_summary()

        return {
            'success': True,
            'failure_points': self.failure_points,
            'summary': summary,
            'total_analyzed_nodes': len(self.nodes),
            'total_analyzed_links': len(self.links),
            'total_analyzed_alarms': len(self.alarmDataWithoutCable) + len(self.cableAlarms)
        }

    def _calculate_summary(self) -> Dict[str, int]:
        """요약 통계 계산"""
        summary = {
            'total_failure_points': len(self.failure_points),
            'node_failures': 0,
            'link_failures': 0,
            'mw_equipment_failures': 0,
            'mw_fading_failures': 0,
            'mw_voltage_failures': 0,
            'upper_node_failures': 0,
            'exchange_failures': 0,
            'transmission_failures': 0,
            'ip_failures': 0,
            'wireless_failures': 0
        }

        for fp in self.failure_points:
            self._update_summary_by_failure_point(fp, summary)

        return summary

    def _update_summary_by_failure_point(self, fp: Dict, summary: Dict):
        """장애점별 요약 통계 업데이트"""
        # 디버깅: 각 장애점의 type 확인
        self.logger.info(
            f"🔍 [디버깅] Summary 계산 - 장애점: {fp.get('name', 'Unknown')}, type: '{fp.get('type', 'None')}', sector: '{fp.get('sector', 'None')}'")

        if fp['type'] == 'node':
            summary['node_failures'] += 1
        elif fp['type'] == 'link':
            summary['link_failures'] += 1
        elif fp['type'] == 'MW':
            summary['mw_equipment_failures'] += 1
            self.logger.info(
                f"🔍 [디버깅] MW 장애점 카운트 증가: {summary['mw_equipment_failures']}")
            self._update_mw_summary(fp, summary)

        # 장애 타입별 분류
        failure_type = fp['failure_type']
        sector = fp.get('sector', '')

        if '상위 노드' in failure_type or '상위 장비' in failure_type:
            summary['upper_node_failures'] += 1
        elif '교환' in failure_type:
            summary['exchange_failures'] += 1
        elif '전송' in failure_type:
            summary['transmission_failures'] += 1
        elif 'IP' in failure_type:
            summary['ip_failures'] += 1
        elif '무선' in failure_type and sector == '무선':  # 무선 분야이면서 failure_type에 무선이 포함된 경우만
            summary['wireless_failures'] += 1

    def _update_mw_summary(self, fp: Dict, summary: Dict):
        """MW 관련 요약 통계 업데이트"""
        failure_type = fp['failure_type']
        inference_detail = fp.get('inference_detail', '')

        # 페이딩 관련 장애 카운트
        if '전파 페이딩' in failure_type or 'MW 전송 Error' in failure_type:
            fading_count = len([detail for detail in inference_detail.split(f'{self.HTML_BR}')
                                if any(param in detail for param in ['RSL', 'TSL', 'SNR', 'XPI'])])
            summary['mw_fading_failures'] += max(1, fading_count)

        # 전압 관련 장애 카운트
        if '배터리 모드' in failure_type or '전압' in failure_type:
            summary['mw_voltage_failures'] += 1

    def _create_empty_result(self, message: str) -> Dict[str, Any]:
        """빈 결과 생성"""
        return {
            'success': True,
            'failure_points': [],
            'summary': {
                'total_failure_points': 0,
                'node_failures': 0,
                'link_failures': 0,
                'mw_equipment_failures': 0,
                'mw_fading_failures': 0,
                'mw_voltage_failures': 0,
                'upper_node_failures': 0,
                'exchange_failures': 0,
                'transmission_failures': 0,
                'ip_failures': 0,
                'wireless_failures': 0
            },
            'message': message,
            'total_analyzed_nodes': len(self.nodes),
            'total_analyzed_links': len(self.links),
            'total_analyzed_alarms': len(self.alarmDataWithoutCable) + len(self.cableAlarms)
        }

    def _create_error_result(self, error_message: str) -> Dict[str, Any]:
        """오류 결과 생성"""
        return {
            'success': False,
            'error': error_message,
            'failure_points': [],
            'summary': {
                'total_failure_points': 0,
                'node_failures': 0,
                'link_failures': 0,
                'mw_equipment_failures': 0,
                'mw_fading_failures': 0,
                'mw_voltage_failures': 0,
                'upper_node_failures': 0,
                'exchange_failures': 0,
                'transmission_failures': 0,
                'ip_failures': 0,
                'wireless_failures': 0
            }
        }

    def _execute_mw_rmos_analysis(self, mw_nodes: List[Dict], base_message: str) -> int:
        """MW RMOS 경보 분석 (현재 경보 데이터 기반)"""
        current_message = base_message

        # ① 경보 데이터 조회 단계
        current_message = self.update_step_progress(current_message,
                                                    f"{self.HTML_BR}{self.HTML_BR}① 먼저, MW 장비의 현재 경보 데이터를 조회합니다.")

        mw_alarm_data = self._get_mw_alarm_data(mw_nodes)

        alarm_result_text = self._add_alarm_query_results_text(mw_alarm_data)
        current_message = self.update_step_progress(
            current_message, alarm_result_text)

        if not mw_alarm_data:
            current_message = self.update_step_progress(current_message,
                                                        f"{self.HTML_BR}{self.HTML_NBSP} → MW 장비에 현재 경보가 없어 정상 상태로 판단합니다.")
            final_summary = f"\n{self.HTML_BR}{self.HTML_BR}• 장애점 발견: 0개"
            current_message = self.update_step_progress(
                current_message, final_summary)

            # 최종 메시지 한 번만 전송
            self.send_progress(current_message)
            self.logger.info("- ✅ MW 장비에 현재 경보가 없어 정상 상태입니다.")
            return 0

        # ② 경보 기반 분석 단계
        current_message = self.update_step_progress(current_message,
                                                    f"{self.HTML_BR}{self.HTML_BR}② 다음, MW 장비 경보 데이터를 분석합니다.")

        mw_failure_count, mw_details = self._analyze_mw_alarm_data(
            mw_alarm_data, mw_nodes)

        analysis_result_text = "".join(mw_details)
        current_message = self.update_step_progress(
            current_message, analysis_result_text)

        final_summary_text = self._add_step_result_text([], mw_failure_count)
        current_message = self.update_step_progress(
            current_message, final_summary_text)

        # 최종 완성된 메시지 한 번만 전송
        self.send_progress(current_message)

        self.logger.info(
            f"[2단계] MW RMOS 경보 분석 완료 => 발견된 MW 장애점: {mw_failure_count}개")

        return mw_failure_count

    def _get_mw_alarm_data(self, mw_nodes: List[Dict]) -> List[Dict]:
        """MW 장비의 현재 경보 데이터 조회"""
        mw_alarm_data = []

        # 디버깅: MW 노드 구조 확인
        self.logger.info(f"🔍 [디버깅] MW 노드 수: {len(mw_nodes)}")
        for i, node in enumerate(mw_nodes):
            self.logger.info(f"🔍 [디버깅] MW 노드 [{i+1}] 구조: {node}")

        # MW 장비들의 equip_id 목록 생성
        mw_equip_ids = [node.get('equip_id')
                        for node in mw_nodes if node.get('equip_id')]

        # 디버깅: equip_id 목록 확인
        self.logger.info(f"🔍 [디버깅] MW equip_id 목록: {mw_equip_ids}")

        # MW 노드에 직접 포함된 경보 데이터 사용 (equip_id 방식은 사용하지 않음)
        self.logger.info("🔍 [디버깅] MW 노드에서 직접 경보 데이터 추출 시작")

        # MW 노드에서 직접 경보 데이터 추출
        for node in mw_nodes:
            node_id = node.get('id', '')
            node_name = node.get('name', '')
            node_alarms = node.get('alarms', [])
            has_alarm = node.get('hasAlarm', False)
            valid_alarm_count = node.get('validAlarmCount', 0)

            self.logger.info(
                f"🔍 [디버깅] 노드 {node_name}: hasAlarm={has_alarm}, validAlarmCount={valid_alarm_count}, 경보수={len(node_alarms)}")

            # 유효한 경보만 필터링
            for alarm in node_alarms:
                if not alarm:
                    continue

                message = alarm.get('alarm_message', '')
                # UAS 패턴인 경우 valid_yn 체크 없이 무조건 포함
                is_uas_pattern = 'UAS(' in message.upper()
                is_valid = alarm.get('valid_yn', 'N').upper() == 'Y'

                if is_uas_pattern or is_valid:
                    # 노드 정보를 경보 데이터에 보완
                    enhanced_alarm = alarm.copy()

                    # 필요한 필드들 보완
                    if 'equip_id' not in enhanced_alarm:
                        enhanced_alarm['equip_id'] = node_id
                    if 'equip_name' not in enhanced_alarm:
                        enhanced_alarm['equip_name'] = node_name
                    if 'sector' not in enhanced_alarm:
                        enhanced_alarm['sector'] = 'MW'

                    mw_alarm_data.append(enhanced_alarm)

                    if is_uas_pattern:
                        self.logger.info(
                            f"🔍 [디버깅] UAS 패턴 경보 무조건 포함: {message} (valid_yn: {alarm.get('valid_yn', 'N')})")
                    else:
                        self.logger.info(
                            f"🔍 [디버깅] 유효한 경보 추가: {message} (등급: {alarm.get('alarm_grade', '')})")
                else:
                    self.logger.info(
                        f"🔍 [디버깅] 무효한 경보 제외: {message} (valid_yn: {alarm.get('valid_yn', 'N')})")

        if not mw_equip_ids:
            self.logger.info("🔍 [디버깅] equip_id 방식 대신 노드 직접 경보 추출 완료")

        self.logger.info(f"MW 장비 경보 데이터 조회 완료: {len(mw_alarm_data)}건")
        return mw_alarm_data

    def _add_alarm_query_results_text(self, alarm_data: List[Dict]) -> str:
        """경보 조회 결과 메시지 텍스트 생성"""
        message = f"{self.HTML_BR}{self.HTML_NBSP} - 조회된 MW 경보: {len(alarm_data)}건"

        if alarm_data:
            # 경보 등급별 분류
            alarm_grades = {}
            for alarm in alarm_data:
                grade = alarm.get('alarm_grade', '정보')
                alarm_grades[grade] = alarm_grades.get(grade, 0) + 1

            grade_text = ", ".join(
                [f"{grade} {count}건" for grade, count in alarm_grades.items()])
            message += f"{self.HTML_BR}{self.HTML_NBSP}{self.HTML_NBSP} . {grade_text}"

        return message

    def _analyze_mw_alarm_data(self, alarm_data: List[Dict], mw_nodes: List[Dict]) -> Tuple[int, List[str]]:
        """MW 경보 데이터 분석"""
        mw_failure_count = 0
        analysis_details = []

        # 장비별로 경보 그룹화
        equipment_alarms = {}
        for alarm in alarm_data:
            equip_id = alarm.get('equip_id')
            if equip_id not in equipment_alarms:
                equipment_alarms[equip_id] = []
            equipment_alarms[equip_id].append(alarm)

        # 각 장비별로 경보 분석
        for equip_id, alarms in equipment_alarms.items():
            # 해당 장비 정보 찾기 (id 필드 사용)
            equipment_node = next(
                (node for node in mw_nodes if node.get('id') == equip_id), None)
            if not equipment_node:
                # equip_id로도 한 번 더 시도
                equipment_node = next(
                    (node for node in mw_nodes if node.get('equip_id') == equip_id), None)

            if not equipment_node:
                self.logger.warning(f"🔍 [디버깅] 장비 정보를 찾을 수 없음: {equip_id}")
                continue

            equip_name = equipment_node.get('name', f'장비ID_{equip_id}')

            # 주요 경보 분석
            failure_analysis = self._analyze_equipment_alarms(
                alarms, equip_name)

            if failure_analysis['is_failure']:
                mw_failure_count += 1
                # 장애점으로 추가 (필요한 필드 모두 포함)
                failure_point = {
                    'type': 'MW',
                    'id': equip_id,
                    'name': equip_name,
                    'sector': 'MW',
                    'failure_type': failure_analysis['reason'],
                    'inference_detail': f"MW RMOS 경보 기반 분석: {failure_analysis['reason']}",
                    'alarms': alarms,
                    'confidence': failure_analysis['confidence'],
                    'alarm_count': len(alarms)
                }
                self.failure_points.append(failure_point)

                # 디버깅: 저장된 장애점 구조 확인
                self.logger.info(f"🔍 [디버깅] MW 장애점 저장: {failure_point}")

                analysis_details.append(
                    f"{self.HTML_BR}{self.HTML_NBSP} ❌ {equip_name}: {failure_analysis['reason']}"
                )
                analysis_details.append(
                    f"{self.HTML_BR}{self.HTML_NBSP}{self.HTML_NBSP} • 경보 수: {len(alarms)}건, 신뢰도: {failure_analysis['confidence']*100:.0f}%"
                )

        return mw_failure_count, analysis_details

    def _analyze_equipment_alarms(self, alarms: List[Dict], equip_name: str) -> Dict:
        """개별 장비의 경보 분석 (RMOS 경보 메시지 패턴 기준)"""
        # 기본 분석 결과
        analysis_result = {
            'is_failure': False,
            'reason': '',
            'confidence': 0.0
        }

        if not alarms:
            return analysis_result

        # 경보 메시지 수집
        alarm_messages = []
        for alarm in alarms:
            message = alarm.get('alarm_message', '')
            if message:
                alarm_messages.append(message)

        # 디버깅: 경보 메시지 확인
        self.logger.info(f"🔍 [디버깅] 장비 {equip_name} 경보 메시지: {alarm_messages}")

        # MW 링크 오류 패턴 정의 (대소문자 무관)
        mw_failure_patterns = [
            # 1. Transmit path has been lost
            ('송신 경로 손실', ['transmit path has been lost']),
            # 2. Receive path has been lost
            ('수신 경로 손실', ['receive path has been lost']),
            # 3. Loss of ~~ Frame on Radio Interface
            ('무선 프레임 손실', ['loss of', 'frame on radio interface']),
            # 4. Radio loss of frame
            ('무선 프레임 손실', ['radio loss of frame']),
            # 5. Remote communication failure
            ('원격 통신 장애', ['remote communication failure']),
            # 6. Loss of Carrier
            ('캐리어 손실', ['loss of carrier']),
            # 7. interface ~~ are down
            ('인터페이스 다운', ['interface', 'down'])
        ]

        detected_failures = []

        # 각 경보 메시지에 대해 패턴 검사
        for message in alarm_messages:
            message_upper = message.upper()

            # MW 링크 오류 패턴 검사
            for pattern_name, keywords in mw_failure_patterns:
                # 모든 키워드가 포함되어야 함
                if all(keyword.upper() in message_upper for keyword in keywords):
                    detected_failures.append({
                        'type': pattern_name,
                        'message': message,
                        'confidence': self.CONFIDENCE_HIGH
                    })
                    self.logger.info(
                        f"🔍 [디버깅] MW 링크 오류 패턴 감지: {pattern_name} - {message}")
                    break

            # UAS 패턴 검사 (괄호 내 숫자가 0보다 큰 경우)
            uas_pattern = r'UAS\((\d+)\)'
            uas_match = re.search(uas_pattern, message_upper)
            if uas_match:
                uas_value = int(uas_match.group(1))
                if uas_value > 0:  # 0보다 크면 장애로 판정
                    detected_failures.append({
                        'type': f'사용자 서비스 끊김 (UAS:{uas_value})',
                        'message': message,
                        'confidence': self.CONFIDENCE_MEDIUM_HIGH
                    })
                    self.logger.info(
                        f"🔍 [디버깅] UAS 패턴 감지: UAS({uas_value}) > 0 - {message}")
                else:
                    self.logger.info(
                        f"🔍 [디버깅] UAS 패턴 무시: UAS({uas_value}) = 0 - {message}")

        # 장애 판정
        if detected_failures:
            analysis_result['is_failure'] = True

            # 가장 높은 신뢰도의 장애 선택
            primary_failure = max(
                detected_failures, key=lambda x: x['confidence'])
            analysis_result['reason'] = primary_failure['type']
            analysis_result['confidence'] = primary_failure['confidence']

            # 여러 장애가 감지된 경우 추가 정보 포함
            if len(detected_failures) > 1:
                failure_types = [f['type'] for f in detected_failures]
                analysis_result['reason'] = f"복합 장애: {', '.join(failure_types[:2])}" + (
                    f" 외 {len(failure_types)-2}개" if len(failure_types) > 2 else "")
                # 복합 장애의 경우 신뢰도 향상
                analysis_result['confidence'] = min(
                    self.CONFIDENCE_VERY_HIGH, primary_failure['confidence'] + 0.05)

            self.logger.info(
                f"🔍 [디버깅] 장비 {equip_name} 장애 감지: {analysis_result['reason']} (신뢰도: {analysis_result['confidence']*100:.0f}%)")
        else:
            self.logger.info(f"🔍 [디버깅] 장비 {equip_name} 정상: MW 링크 오류 패턴 미감지")

        self.logger.info(f"장비 {equip_name} 분석 결과: {analysis_result}")
        return analysis_result
