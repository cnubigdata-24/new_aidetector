"""
장애점 추정 클래스
"""

import logging
from typing import List, Dict, Any
from collections import defaultdict

import json
import requests

HR_LINE_HTML = '<hr style="border: none; border-top: 1px solid #f2bbb5; margin: 10px 0;">\n'


class InferFailurePoint:
    def __init__(self, progress_callback=None):
        self.nodes = []
        self.links = []
        self.alarms = []
        self.failure_points = []
        self.logger = logging.getLogger(__name__)
        self.progress_callback = progress_callback

    def _send_progress(self, message):
        """진행 상황을 콜백으로 전달"""
        if self.progress_callback:
            self.progress_callback(message)

    # 장애점 찾기 Main 함수
    def analyze(self, nodes: List[Dict], links: List[Dict], alarms: List[Dict]) -> Dict[str, Any]:
        try:
            self.logger.info("=" * 60)
            self.logger.info("✔️ 장애점 분석 Main 시작...")
            self.logger.info("=" * 60)

            # 데이터 초기화
            self.nodes = nodes or []
            self.links = links or []
            self.alarms = alarms or []
            self.failure_points = []

            # 진행 상황 전송
            self._send_progress(
                f"📌 NW 장애점 분석을 시작합니다. (1~5단계) <br><br> • AI 분석 입력 데이터: 장비 {len(self.nodes)}대, 링크 {len(self.links)}구간, 경보 {len(self.alarms)}건")

            # 입력 데이터 로깅
            self.logger.info(f"✔️ 입력 데이터 현황:")
            self.logger.info(f"• 장비 수: {len(self.nodes)}대")
            self.logger.info(f"• 링크 수: {len(self.links)}구간")
            self.logger.info(f"• 경보 수: {len(self.alarms)}건")

            # 노드별 세부 정보 로깅
            if self.nodes:
                self.logger.info(f"✔️ 장비 상세 정보:")
                for i, node in enumerate(self.nodes):
                    node_name = node.get('name', node.get('id', 'Unknown'))
                    node_field = node.get('field', 'Unknown')
                    node_level = node.get('level', 0)
                    alarm_count = len(node.get('alarms', []))
                    self.logger.info(
                        f"• 📌 [{i+1}] {node_name} (분야: {node_field}, Level: {node_level}, 경보: {alarm_count}개)")

            # 링크별 세부 정보 로깅
            if self.links:
                self.logger.info(f"✔️ 링크 상세 정보:")
                for i, link in enumerate(self.links):
                    link_name = link.get(
                        'link_name', link.get('id', 'Unknown'))
                    alarm_count = len(link.get('alarms', []))
                    self.logger.info(
                        f"• [{i+1}] {link_name} (경보: {alarm_count}개)")

            # 데이터 검증
            if not self._validate_input_data():
                self.logger.warning("❌ 입력 데이터 검증 실패")
                return self.create_empty_result("입력 데이터가 부족합니다.")

            self.logger.info("✔️ 입력 데이터 검증 완료")
            self.logger.info("-" * 60)

            # 단계별 장애점 분석
            self.logger.info("📌 단계별 장애점 분석 시작")

            self._analyze_link_failures()      # 1. 링크 선로 장애점
            self.logger.info(
                f"• 분석 완료 - 현재 발견된 장애점: {len(self.failure_points)}개")
            self.logger.info("-------------------------------")

            self._analyze_mw_equipment_status()  # 2. MW 장애 (페이딩, 배터리 모드, 오류)
            self.logger.info(
                f"• 분석 완료 - 현재 발견된 장애점: {len(self.failure_points)}개")
            self.logger.info("-------------------------------")

            self.analyze_upper_node_failures()  # 3. 상위 장비 장애점
            self.logger.info(
                f"• 분석 완료 - 현재 발견된 장애점: {len(self.failure_points)}개")
            self.logger.info("-------------------------------")

            self.analyze_exchange_failures()   # 4. 교환 장비 장애점
            self.logger.info(
                f"• 분석 완료 - 현재 발견된 장애점: {len(self.failure_points)}개")
            self.logger.info("-------------------------------")

            self.analyze_transmission_failures()  # 5. 전송 장비 장애점
            self.logger.info(
                f"• 분석 완료 - 현재 발견된 장애점: {len(self.failure_points)}개")
            self.logger.info("-------------------------------")

            # 결과 생성
            result = self.create_analysis_result()

            self.logger.info("-" * 60)
            self.logger.info(f"✔️ 장애점 분석 최종 완료:")
            self.logger.info(f"• ❌ 총 발견된 장애점: {len(self.failure_points)}개")

            # 발견된 장애점 상세 정보
            for i, fp in enumerate(self.failure_points):
                self.logger.info(
                    f"  [{i+1}] {fp['name']} - {fp['failure_type']} (신뢰도: {fp['confidence']*100:.0f}%)")

            self.logger.info("=" * 60)

            return result

        except Exception as e:
            self.logger.error(f"❌ 장애점 분석 중 오류: {str(e)}")
            self._send_progress(f"❌ 장애점 분석 중 오류가 발생했습니다: {str(e)}")
            return self.create_error_result(str(e))

    # 입력 데이터 검증
    def _validate_input_data(self) -> bool:
        if not self.nodes:
            self.logger.warning("노드 데이터가 없습니다.")
            return False

        # 노드와 링크 전체 경보 수
        total_alarms_count = 0

        # 전체 경보 배열 확인
        # if self.alarms:
        #    total_alarms_count += len([alarm for alarm in self.alarms if alarm])

        # 노드 내부 경보 확인
        for node in self.nodes:
            node_alarms = node.get('alarms', [])
            node_alarm_count = len([alarm for alarm in node_alarms if alarm])
            total_alarms_count += node_alarm_count

        # 링크 내부 경보 확인
        for link in self.links:
            link_alarms = link.get('alarms', [])
            link_alarm_count = len([alarm for alarm in link_alarms if alarm])
            total_alarms_count += link_alarm_count

        self.logger.info(f"✔️ 전체 경보 현황: 총 {total_alarms_count}건")
        self.logger.info(f"• 📌 전역 경보: {len(self.alarms)}건")
        self.logger.info(
            f"• 노드 내부 경보: {sum(len(node.get('alarms', [])) for node in self.nodes)}건")
        self.logger.info(
            f"• 링크 내부 경보: {sum(len(link.get('alarms', [])) for link in self.links)}건")

        if total_alarms_count == 0:
            self.logger.warning("전체 시스템에 경보가 없습니다.")
            return False

        return True

    # 1. 선로 장애점 분석: 선로에 경보가 있는 경우 (Dr. Cable 경보는 선로 피해 장애임)
    def _analyze_link_failures(self):
        self.logger.info("-------------------------------")
        self.logger.info("[1단계] 선로 분야 장애점 분석 시작")

        # 단계별 메시지 구성
        step_message = "🚩 [1단계] 선로 분야 장애점 분석 (Dr. Cable 조회)<br>\n"
        step_message += HR_LINE_HTML

        step_message += f"<br>• 전체 선로 현황: {len(self.links)}개 구간\n"
        step_message += "<br>&nbsp; → 광케이블 선로 경보를 확인합니다."

        link_failure_count = 0
        link_details = []

        for i, link in enumerate(self.links):
            link_name = link.get('link_name', f"선로 {link.get('id')}")
            self.logger.info(
                f"🔍 [{i+1}/{len(self.links)}] 선로 분석: {link_name}")

            link_alarms = self.get_link_alarms(link)
            self.logger.info(f"• ❌ 선로 경보 수: {len(link_alarms)}개")

            if link_alarms:
                self.failure_points.append({
                    'type': 'link',
                    'id': link.get('id'),
                    'name': link_name,
                    'sector': '선로',

                    'failure_type': '선로 장애',
                    'inference_detail': '선로 피해 발생',
                    'alarms': link_alarms,
                    'confidence': 0.9
                })

                link_failure_count += 1
                link_details.append(
                    f"<br>&nbsp; - {link_name}: 경보 {len(link_alarms)}개 발견 - 선로 피해 의심")
                self.logger.info(
                    f"✔️ 선로 장애점 발견: {link_name} (경보: {len(link_alarms)}개)")

                # 경보 상세 정보
                for j, alarm in enumerate(link_alarms[:3]):  # 최대 3개까지만 표시
                    alarm_msg = alarm.get('alarm_message', 'Unknown')
                    self.logger.info(f"• 경보{j+1}: {alarm_msg}")
                if len(link_alarms) > 3:
                    self.logger.info(f"... 외 {len(link_alarms)-3}개 경보")
            else:
                link_details.append(f"<br>&nbsp; - [정상] {link_name}")
                self.logger.info(f"• 경보 없음: 정상")

        # 단계 완료 메시지
        step_message += f"\n<br><br>• 선로 피해 점검 결과:\n" + \
            "\n".join(link_details)
        step_message += f"\n<br><br>• 장애점 발견: {link_failure_count}개"

        self._send_progress(step_message)

        self.logger.info(
            f"[1단계] 선로 분야 장애점 분석 완료 <br>• 📌 발견된 선로 장애점: {link_failure_count}개")
        self.logger.info("-------------------------------")

    # 2. MW 장비 상태 점검
    def _analyze_mw_equipment_status(self):
        self.logger.info("[2단계] MW 장비 상태 점검 시작")

        # MW 노드 필터링
        mw_nodes = [node for node in self.nodes if node.get(
            'field', '').upper() == 'MW']

        # 단계별 메시지 구성
        step_message = "🚩 [2단계] 도서 MW 장애점 분석 (SNMP 페이딩/한전정전)<br>\n"
        step_message += HR_LINE_HTML
        step_message += f"<br>• 점검 대상 MW 장비: {len(mw_nodes)}대\n"

        if not mw_nodes:
            step_message += "<br>&nbsp; → MW 장비가 없어 2단계 분석을 패스합니다."
            self._send_progress(step_message)
            self.logger.info("• MW 장비가 없습니다. 2단계 분석을 건너뜁니다.")
            return

        try:
            # MW 노드 DB 정보 수집
            step_message += "<br>• MW 장비 SNMP 정보 수집을 시작합니다.\n"
            mw_equipment_data = self.get_mw_equipment_info(mw_nodes)

            if not mw_equipment_data:
                step_message += "<br>&nbsp; → MW 장비 SNMP 정보를 찾을 수 없습니다."
                self._send_progress(step_message)
                self.logger.warning("→ ⚠️ MW 장비 SNMP 정보를 찾을 수 없습니다.")
                return

            step_message += f"<br>• SNMP 정보 수집 완료: {len(mw_equipment_data)}개\n"
            step_message += "<br>• MW 장비 상태 확인 API 호출 중...\n"

            # guksa_id 추출 (노드 중 첫 번째의 guksa_id 사용, 없으면 None)
            guksa_id = None
            if mw_nodes:
                guksa_id = mw_nodes[0].get('guksa_id')

            # MW 장비 접속 상태 확인 API 호출
            mw_status_data = self.call_mw_status_api(
                guksa_id, mw_equipment_data)

            if not mw_status_data:
                step_message += "<br>&nbsp; → MW SNMP 상태 정보를 가져올 수 없습니다."
                self._send_progress(step_message)
                self.logger.warning("• ⚠️ MW SNMP 상태 정보를 가져올 수 없습니다.")
                return

            step_message += f"<br>&nbsp; → MW SNMP 상태 정보를 수신했습니다. ({len(mw_status_data)}개)\n"
            step_message += "<br>• MW 파라미터별 상세 분석을 진행합니다.\n"

            # MW 장애점 분석
            mw_failure_count, mw_details = self._analyze_mw_status_data_detailed(
                mw_status_data)

            step_message += "<br>• MW 파라미터별 점검 결과:\n" + "\n".join(mw_details)
            step_message += f"\n<br><br>• 장애점 발견: {mw_failure_count}개"

            self._send_progress(step_message)

            self.logger.info(
                f"[2단계] MW 장비 상태 점검 완료 <br> • 📌 발견된 MW 장애점: {mw_failure_count}개")
            self.logger.info("-------------------------------")

        except Exception as e:
            step_message += f"<br>• 오류 발생: {str(e)}"
            self._send_progress(step_message)
            self.logger.error(f"• ❌ MW 장비 상태 점검 중 오류: {str(e)}")

    # 2-3. MW 상태 데이터 분석 (상세 버전)
    def _analyze_mw_status_data_detailed(self, mw_status_data) -> tuple:
        failure_count = 0
        details = []

        for equipment_data in mw_status_data:
            equip_id = equipment_data.get('id')
            equip_type = equipment_data.get('equip_type')
            data = equipment_data.get('data', {})

            details.append(f"<br>• {equip_id} ({equip_type}):")
            self.logger.info(
                f"• 🔍 MW 장비 분석: ID={equip_id}, Type={equip_type}")

            # 인터페이스 분석
            interfaces = data.get('interfaces', {})

            for slot_name, slot_data in interfaces.items():
                self.logger.info(f"• 슬롯 분석: {slot_name}")

                # RSL, TSL, SNR, XPI 분석
                fading_issues = self.check_fading_parameters(
                    slot_data, slot_name)
                if fading_issues:
                    self.failure_points.append({
                        'type': 'mw_equipment',
                        'id': equip_id,
                        'name': f"MW 장비 {equip_id} ({slot_name})",
                        'sector': 'MW',

                        'failure_type': 'MW 전파 페이딩 의심',
                        'inference_detail': f'{slot_name}: {", ".join(fading_issues)}',
                        'alarms': [],
                        'confidence': 0.8
                    })
                    failure_count += 1
                    details.append(
                        f"<br>&nbsp; - {slot_name}: 전파 페이딩 의심 ({', '.join(fading_issues)})")
                    self.logger.info(
                        f"• 📌 전파 페이딩 의심 발견: {', '.join(fading_issues)}")
                else:
                    details.append(f"<br>  - {slot_name}: RSL/TSL/SNR/XPI 정상")

                # ERR 분석
                err_issues = self.check_error_parameters(slot_data, slot_name)
                if err_issues:
                    self.failure_points.append({
                        'type': 'mw_equipment',
                        'id': equip_id,
                        'name': f"MW 장비 {equip_id} ({slot_name})",
                        'sector': 'MW',

                        'failure_type': 'MW 전파수신 오류: 페이딩 또는 대국 장비 장애 의심',
                        'inference_detail': f'{slot_name}: 오류 발생 - {", ".join(err_issues)}',
                        'alarms': [],
                        'confidence': 0.9
                    })
                    failure_count += 1
                    details.append(
                        f"<br>>&nbsp;  - {slot_name}: 전파수신 오류 ({', '.join(err_issues)})")
                    self.logger.info(
                        f"• 📌 MW 전파수신 오류 발견: {', '.join(err_issues)}")
                else:
                    details.append(f"<br>  - {slot_name}: ERR 파라미터 정상")

            # VOLT 분석
            volt_issues = self.check_voltage_parameters(data)
            if volt_issues:
                self.failure_points.append({
                    'type': 'mw_equipment',
                    'id': equip_id,
                    'name': f"MW 장비 {equip_id}",
                    'sector': 'MW',

                    'failure_type': 'MW 장비 배터리 모드로 한전 정전 의심',
                    'inference_detail': f'MW 장비 전압 이상: {volt_issues}',
                    'alarms': [],
                    'confidence': 0.85
                })
                failure_count += 1
                details.append(f"<br>  - 전압: 배터리 모드 의심 ({volt_issues})")
                self.logger.info(f"• 📌 MW 장비 전압 이상 발견: {volt_issues}")
            else:
                details.append(f"<br>  - 전압: 정상")

        return failure_count, details

    # 2-1. MW 노드들의 SNMP 정보 수집
    def get_mw_equipment_info(self, mw_nodes) -> List[Dict]:
        try:
            from db.models import TblSnmpInfo

            mw_equipment_data = []

            for node in mw_nodes:
                equip_id = node.get('equip_id') or node.get('id')
                if not equip_id:
                    continue

                # tblSnmpInfo에서 정보 조회
                snmp_info = TblSnmpInfo.query.filter_by(
                    equip_id=equip_id).first()

                if snmp_info:
                    mw_equipment_data.append({
                        'id': snmp_info.equip_id,
                        'snmp_ip': snmp_info.snmp_ip,
                        'community': snmp_info.community,
                        'equip_type': snmp_info.equip_type,
                        'equip_name': snmp_info.equip_name
                    })
                    self.logger.info(
                        f"• MW 장비 정보 수집: {snmp_info.equip_name} ({snmp_info.snmp_ip})")
                else:
                    self.logger.warning(
                        f"• ⚠️ TblSnmpInfo DB에 SNMP 정보 없음: equip_id={equip_id}")

            self.logger.info(
                f"• MW 장비 SNMP 정보 수집 완료: {len(mw_equipment_data)}개")
            return mw_equipment_data

        except Exception as e:
            self.logger.error(f"• ❌ MW 장비 정보 수집 실패: {str(e)}")
            return []

    # 2-2. MW 상태 확인 API 호출
    def call_mw_status_api(self, guksa_id, mw_equipment_data) -> List[Dict]:
        try:
            # 요청 페이로드 생성
            payload = {
                "guksa_id": guksa_id,
                "data": mw_equipment_data
            }

            self.logger.info(
                f"• MW 상태 확인 API 호출: {len(mw_equipment_data)}개 장비, guksa_id={guksa_id}")

            # API 호출
            response = requests.post(
                'http://localhost:5000/api/check_mw_status',
                json=payload,
                timeout=30
            )

            if response.status_code == 200:
                result = response.json()
                self.logger.info(f"• MW 상태 데이터 수신 완료")
                return result
            else:
                self.logger.error(
                    f"• ❌ MW 상태 API 호출 실패: {response.status_code}")
                return []

        except Exception as e:
            self.logger.error(f"• ❌ MW 상태 확인 API 호출 실패: {str(e)}")
            return []

    def check_fading_parameters(self, slot_data, slot_name) -> List[str]:
        """RSL, TSL, SNR, XPI 파라미터 체크"""
        issues = []
        parameters = ['RSL', 'TSL', 'SNR', 'XPI']

        for param in parameters:
            if param in slot_data:
                param_data = slot_data[param]
                try:
                    value = float(param_data.get('value', 0))
                    min_val = float(param_data.get('min', 0)) if param_data.get(
                        'min') != 'error' else None
                    max_val = float(param_data.get('max', 0)) if param_data.get(
                        'max') != 'error' else None
                    threshold = float(param_data.get('threshold', 0))

                    # min/max 차이값 디버깅 출력
                    if min_val is not None and max_val is not None:
                        diff = max_val - min_val
                        self.logger.info(
                            f"[DEBUG] {slot_name} {param}: value={value}, min={min_val}, max={max_val}, diff={diff}")
                    else:
                        self.logger.info(
                            f"[DEBUG] {slot_name} {param}: value={value}, min={min_val}, max={max_val}")

                    # 임계값 체크만 유지
                    if param in ['RSL', 'TSL'] and value < threshold:
                        issues.append(
                            f"{param} 임계값 미달 ({value} < {threshold})")
                    elif param in ['SNR', 'XPI'] and value < threshold:
                        issues.append(
                            f"{param} 임계값 미달 ({value} < {threshold})")

                except (ValueError, TypeError):
                    if param_data.get('value') == 'error' or param_data.get('min') == 'error':
                        issues.append(f"{param} 측정 오류")

        return issues

    def check_error_parameters(self, slot_data, slot_name) -> List[str]:
        """ERR 파라미터 체크"""
        issues = []

        if 'ERR' in slot_data:
            err_data = slot_data['ERR']
            for err_type, err_value in err_data.items():
                if err_value != 'error' and err_value != '0':
                    try:
                        if int(err_value) > 0:
                            issues.append(f"{err_type}={err_value}")
                    except (ValueError, TypeError):
                        if err_value == 'error':
                            issues.append(f"{err_type} 측정 오류")

        return issues

    def check_voltage_parameters(self, data) -> str:
        """VOLT 파라미터 체크"""
        if 'VOLT' in data:
            volt_data = data['VOLT']
            try:
                value = float(volt_data.get('value', 0))
                min_val = float(volt_data.get('min', 0)) if volt_data.get(
                    'min') != 'error' else None
                max_val = float(volt_data.get('max', 0)) if volt_data.get(
                    'max') != 'error' else None
                threshold = float(volt_data.get('threshold', 0))

                # min/max 차이값 디버깅 출력
                if min_val is not None and max_val is not None:
                    diff = max_val - min_val
                    self.logger.info(
                        f"[DEBUG] VOLT: value={value}, min={min_val}, max={max_val}, diff={diff}")
                else:
                    self.logger.info(
                        f"[DEBUG] VOLT: value={value}, min={min_val}, max={max_val}")

                # 임계값 체크만 유지
                if value < threshold:
                    return f"전압 임계값 미달 ({value}V < {threshold}V)"

            except (ValueError, TypeError):
                if volt_data.get('value') == 'error':
                    return "전압 측정 오류"

        return ""

    # 3. 상위 장비 장애점 분석
    def analyze_upper_node_failures(self):
        self.logger.info("[3단계] 상위 장비 장애점 분석 시작")

        # 노드별 경보 정보 매핑
        node_alarm_map = self.create_node_alarm_map()

        # 계층별 장비 그룹화
        level_nodes = self.group_nodes_by_level()

        # 단계별 메시지 구성
        step_message = "🚩 [3단계] 상위 장비 장애점 분석 (계위별 경보 Tree 탐색)<br>\n"
        step_message += HR_LINE_HTML
        step_message += f"<br>• 전체 장비: {len(self.nodes)}대, 경보발생 장비: {len(node_alarm_map)}대\n"

        level_info = []
        for level, nodes in level_nodes.items():
            level_info.append(f"<br>&nbsp; - Level {level}: {len(nodes)}대")
        step_message += "<br><br>• 계위별 장비 현황 (Level 0: 현재 선택된 장비)\n" + \
            "\n".join(level_info) + "\n"

        self.logger.info(f"• 장비별 경보 매핑 완료: {len(node_alarm_map)}대 장비에 경보 존재")
        self.logger.info(f"• Level 장비 그룹화 완료:")
        for level, nodes in level_nodes.items():
            self.logger.info(f"    - Level #{level}: {len(nodes)}대 장비")

        upper_failure_count = 0
        analysis_details = []

        # 하위 레벨부터 상위로 분석
        sorted_levels = sorted(level_nodes.keys(), reverse=True)
        step_message += f"<br><br>• Level 분석 순서: {sorted_levels}\n"

        self.logger.info(f"• 🔍 Level 분석 순서: {sorted_levels}")

        for level in sorted_levels:
            self.logger.info(f"• Level {level} 분석 중...")
            level_details = []

            for i, node in enumerate(level_nodes[level]):
                node_name = node.get('name', node['id'])
                sector = node.get('field', '장비')  # IP, 전송, 교환, 무선, MW

                self.logger.info(
                    f"• 🔍 [{i+1}/{len(level_nodes[level])}] 분야: {sector}, 장비 분석: {node_name}")

                self.logger.info(f">>>>>>>>>>>>>>>>>>> 노드 전체: {node}")

                if self.is_upper_node_failure(node, node_alarm_map, level_nodes):
                    node_alarms = node_alarm_map.get(node['id'], [])

                    self.failure_points.append({
                        'type': 'node',
                        'id': node['id'],
                        'name': node_name,
                        'sector': sector,

                        'failure_type': '상위 장비 장애 (경보 Tree 탐색)',
                        'inference_detail': '상위 장비 장애로 인한 하위 장비들의 연쇄 장애',
                        'alarms': node_alarms,
                        'confidence': 0.8
                    })

                    upper_failure_count += 1
                    level_details.append(
                        f"<br>&nbsp;&nbsp; .{node_name}: 상위 장비 장애 (경보 {len(node_alarms)}건)")
                    self.logger.info(
                        f"• 상위 장비 장애점 발견: {node_name} (경보: {len(node_alarms)}건)")

                    # 경보 상세 정보
                    for j, alarm in enumerate(node_alarms[:2]):  # 최대 2개까지만 표시
                        alarm_msg = alarm.get('alarm_message', 'Unknown')
                        self.logger.info(f"• 경보{j+1}: {alarm_msg}")
                    if len(node_alarms) > 2:
                        self.logger.info(
                            f"... 외 {len(node_alarms)-2}개 경보")
                else:
                    level_details.append(
                        f"<br>&nbsp;&nbsp; . [장애조건 불일치] {node_name}")
                    self.logger.info(f"• 장애조건 불일치")

            if level_details:
                analysis_details.append(f"<br>&nbsp; - Level #{level} 분석 결과:")
                analysis_details.extend(level_details)

        step_message += "\n".join(analysis_details)
        step_message += f"\n<br><br>• 장애점 발견: {upper_failure_count}개"

        self._send_progress(step_message)

        self.logger.info(
            f"[3단계] 상위 장비 장애점 분석 완료 <br>• 발견된 상위 노드 장애점: {upper_failure_count}개")
        self.logger.info("-------------------------------")

    # 4. 교환 노드 장애점 분석
    def analyze_exchange_failures(self):
        self.logger.info("[4단계] 교환 장비 장애점 분석 시작")

        exchange_nodes = [node for node in self.nodes if node.get(
            'field', '').upper() == '교환']

        # 단계별 메시지 구성
        step_message = "🚩 [4단계] 교환 장애점 분석 (A1395, A1930 경보 패턴)<br>\n"
        step_message += HR_LINE_HTML
        step_message += f"<br>• 교환 장비 수: {len(exchange_nodes)}대\n"

        if not exchange_nodes:
            step_message += "<br>&nbsp; → 교환 장비가 없어 4단계 분석을 패스합니다."
            self._send_progress(step_message)
            self.logger.info("• 교환 장비가 없어서 4단계 분석을 건너뜁니다.")
            return

        step_message += "<br><br>• 장비별 점검 결과:\n"

        self.logger.info(f"• 교환 노드 수: {len(exchange_nodes)}개")
        exchange_failure_count = 0
        exchange_details = []

        for i, node in enumerate(exchange_nodes):
            node_name = node.get('name', node['id'])
            self.logger.info(
                f"• 🔍 [{i+1}/{len(exchange_nodes)}] 교환 노드 분석: {node_name}")

            node_alarms = self.get_node_alarms(node['id'])
            self.logger.info(f"• 교환 노드 경보 수: {len(node_alarms)}개")

            # 4-1: A1395 경보 체크 (100개 이상)
            a1395_alarms = [alarm for alarm in node_alarms
                            if 'A1395' in alarm.get('alarm_message', '')]

            self.logger.info(f"• A1395 경보 수: {len(a1395_alarms)}개")

            if len(a1395_alarms) >= 100:
                self.failure_points.append({
                    'type': 'node',
                    'id': node['id'],
                    'name': node_name,
                    'sector': '교환',

                    'failure_type': '교환 A1395 대량 장애',
                    'inference_detail': '국사 정전 또는 교환기 메인보드 장애',
                    'alarms': a1395_alarms,
                    'confidence': 0.9
                })

                exchange_failure_count += 1
                exchange_details.append(
                    f"<br>• {node_name}: A1395 대량 장애 ({len(a1395_alarms)}개) - 국사 정전 또는 메인보드 장애")
                self.logger.info(
                    f"• A1395 대량 장애점 발견: {node_name} (A1395: {len(a1395_alarms)}개)")
                continue

            # 4-2: A1930 경보 분석
            a1930_alarms = [alarm for alarm in node_alarms
                            if 'A1930' in alarm.get('alarm_message', '')]

            self.logger.info(f"• A1930 경보 수: {len(a1930_alarms)}개")

            if a1930_alarms:
                self.logger.info(f"• 🔍 A1930 경보 분석 진행: {node_name}")
                before_count = len(self.failure_points)
                a1930_result = self.analyze_a1930_failures_detailed(
                    node, a1930_alarms)
                after_count = len(self.failure_points)

                if after_count > before_count:
                    exchange_failure_count += (after_count - before_count)
                    exchange_details.append(
                        f"<br>&nbsp; -  {node_name}: A1930 관련 장애 ({len(a1930_alarms)}개) - {a1930_result}")
                    self.logger.info(
                        f"• A1930 관련 장애점 발견: {after_count - before_count}개")
                else:
                    exchange_details.append(
                        f"<br>&nbsp; - [장애조건 불일치] {node_name}: A1930 경보 있음 ({len(a1930_alarms)}개)")
            else:
                exchange_details.append(
                    f"<br>&nbsp; - [정상] {node_name} (관련 경보 없음)")
                self.logger.info(f"• A1930/1935 경보 없음: 정상")

        step_message += "\n".join(exchange_details)
        step_message += f"\n<br><br>• 장애점 발견: {exchange_failure_count}개"

        self._send_progress(step_message)

        self.logger.info(
            f"[4단계] 교환 장비 장애점 분석 완료 <br>• 발견된 교환 장애점: {exchange_failure_count}개")
        self.logger.info("-------------------------------")

    # 4-2. 교환 노드 장애점 분석 (상세 버전)
    def analyze_a1930_failures_detailed(self, exchange_node, a1930_alarms):
        # 타 분야 경보 내역 확인
        other_sector_alarms = self.get_other_sector_alarms(['IP', '전송'])

        if len(a1930_alarms) <= 10 and not other_sector_alarms:
            # Case 1: 다른 분야 경보 없고 A1930 10개 이하인 경우
            self.failure_points.append({
                'type': 'node',
                'id': exchange_node['id'],
                'name': exchange_node.get('name', exchange_node['id']),
                'sector': '교환',

                'failure_type': '교환 A1930 단독 장애',
                'inference_detail': 'AGW 단독고장으로 공통부 확인 필요',
                'alarms': a1930_alarms,
                'confidence': 0.8
            })
            return "AGW 단독고장"
        elif len(a1930_alarms) >= 11 and other_sector_alarms:
            # Case 2: IP/전송 경보 있고 A1930 11개 이상인 경우
            upper_exchange_nodes = self.find_upper_exchange_nodes(
                exchange_node)

            for upper_node in upper_exchange_nodes:
                upper_alarms = self.get_node_alarms(upper_node['id'])
                if upper_alarms:
                    self.failure_points.append({
                        'type': 'node',
                        'id': upper_node['id'],
                        'name': upper_node.get('name', upper_node['id']),
                        'sector': '교환',


                        'failure_type': '교환 A1930 상위장애',
                        'inference_detail': 'AGW 단독고장으로 공통부 확인 필요',
                        'alarms': upper_alarms,
                        'confidence': 0.7
                    })
            return "상위 교환 노드 장애"
        else:
            return "장애조건 불일치"

    # 5. 전송 노드 장애점 분석
    def analyze_transmission_failures(self):
        self.logger.info("[5단계] 전송 장애점 분석 시작")

        transmission_nodes = [node for node in self.nodes
                              if node.get('field', '').upper() == '전송']

        # 단계별 메시지 구성
        step_message = "🚩 [5단계] 전송 장애점 분석 (LOS, LOF 경보 패턴)<br>\n"
        step_message += HR_LINE_HTML
        step_message += f"<br>• 전송 장비 수: {len(transmission_nodes)}대\n"

        if not transmission_nodes:
            step_message += "<br>&nbsp; → 전송 장비가 없어 5단계 분석을 패스합니다."
            self._send_progress(step_message)
            self.logger.info("• 전송 장비가 없어서 5단계 분석을 건너뜁니다.")
            return

        step_message += "<br><br>• 전송 장비 점검 결과:\n"

        self.logger.info(f"• 전송 장비 수: {len(transmission_nodes)}대")
        transmission_failure_count = 0
        transmission_details = []

        for i, node in enumerate(transmission_nodes):
            node_name = node.get('name', node['id'])
            self.logger.info(
                f"• 🔍 [{i+1}/{len(transmission_nodes)}] 전송 장비 분석: {node_name}")

            node_alarms = self.get_node_alarms(node['id'])
            self.logger.info(f"• 전송 장비 경보 수: {len(node_alarms)}개")

            # 5-1: LOS 경보 체크
            los_alarms = [alarm for alarm in node_alarms
                          if 'LOS' in alarm.get('alarm_message', '').upper()]

            self.logger.info(f"• LOS 경보 수: {len(los_alarms)}건")

            if los_alarms:
                self.failure_points.append({
                    'type': 'node',
                    'id': node['id'],
                    'name': node_name,
                    'sector': '전송',


                    'failure_type': '전송 LOS 장애',
                    'inference_detail': '광신호 없음으로 선로 절단 또는 대향국 장애',
                    'alarms': los_alarms,
                    'confidence': 0.85
                })

                transmission_failure_count += 1
                transmission_details.append(
                    f"<br>&nbsp;&nbsp; - {node_name}: LOS 장애 ({len(los_alarms)}대) - 광신호 없음, 선로 절단 또는 대향국 장애")
                self.logger.info(
                    f"&nbsp;&nbsp; - LOS 장애점 발견: {node_name} (LOS: {len(los_alarms)}대)")

                # LOS 경보 상세 정보
                for j, alarm in enumerate(los_alarms[:2]):
                    alarm_msg = alarm.get('alarm_message', 'Unknown')
                    self.logger.info(
                        f"&nbsp;&nbsp; - LOS 경보{j+1}: {alarm_msg}")
                if len(los_alarms) > 2:
                    self.logger.info(
                        f"... 외 {len(los_alarms)-2}개 LOS 경보")
                continue

            # 5-2: LOF 경보 체크
            lof_alarms = [alarm for alarm in node_alarms
                          if 'LOF' in alarm.get('alarm_message', '').upper()]

            self.logger.info(f"&nbsp;&nbsp; - LOF 경보 수: {len(lof_alarms)}건")

            if lof_alarms:
                self.failure_points.append({
                    'type': 'node',
                    'id': node['id'],
                    'name': node_name,
                    'sector': '전송',

                    'failure_type': '전송 LOF 장애',
                    'inference_detail': '대항국 장비 불량',
                    'alarms': lof_alarms,
                    'confidence': 0.8
                })

                transmission_failure_count += 1
                transmission_details.append(
                    f"<br>&nbsp;&nbsp; - {node_name}: LOF 장애 ({len(lof_alarms)}대) - 대향국 장비 불량")
                self.logger.info(
                    f"&nbsp;&nbsp; - LOF 장애점 발견: {node_name} (LOF: {len(lof_alarms)}대)")

                # LOF 경보 상세 정보
                for j, alarm in enumerate(lof_alarms[:2]):
                    alarm_msg = alarm.get('alarm_message', 'Unknown')
                    self.logger.info(
                        f"&nbsp;&nbsp; - LOF 경보{j+1}: {alarm_msg}")
                if len(lof_alarms) > 2:
                    self.logger.info(
                        f"... 외 {len(lof_alarms)-2}개 LOF 경보")
            else:
                transmission_details.append(
                    f"<br>&nbsp;&nbsp; - [정상] {node_name} (관련 경보 없음)")
                self.logger.info(f"&nbsp;&nbsp; - [정상] LOS/LOF 경보 없음")

        step_message += "\n".join(transmission_details)
        step_message += f"\n<br><br>• 장애점 발견: {transmission_failure_count}개"

        self._send_progress(step_message)

        self.logger.info(
            f"[5단계] 전송 장비 장애점 분석 완료 <br>• 발견된 전송 장애점: {transmission_failure_count}대")
        self.logger.info("-------------------------------")

    # 헬퍼 메서드들
    def get_link_alarms(self, link) -> List[Dict]:
        """링크 관련 경보 조회"""
        # 전달받은 링크의 경보 정보 활용
        link_alarms = link.get('alarms', [])

        # 수정: 모든 경보 포함
        filtered_alarms = []
        for alarm in link_alarms:
            if alarm:
                filtered_alarms.append(alarm)

        return filtered_alarms

    def create_node_alarm_map(self) -> Dict[str, List[Dict]]:
        """노드별 경보 매핑"""
        node_alarm_map = defaultdict(list)

        # 전달받은 노드의 경보 정보 활용
        for node in self.nodes:
            node_id = node.get('id')
            node_alarms = node.get('alarms', [])

            if node_id and node_alarms:
                # 수정: 모든 경보 포함
                all_alarms = [alarm for alarm in node_alarms if alarm]
                node_alarm_map[node_id] = all_alarms

        return dict(node_alarm_map)

    def group_nodes_by_level(self) -> Dict[int, List[Dict]]:
        """레벨별 노드 그룹화"""
        level_nodes = defaultdict(list)

        for node in self.nodes:
            level = node.get('level', 0)
            level_nodes[level].append(node)

        return dict(level_nodes)

    def is_upper_node_failure(self, node, node_alarm_map, level_nodes) -> bool:
        """상위 노드 장애 여부 판단"""
        node_id = node['id']

        # 해당 노드에 경보가 있어야 함
        if node_id not in node_alarm_map:
            return False

        # 하위 노드들 모두 경보 확인
        lower_nodes = self.find_lower_nodes(node, level_nodes)
        if not lower_nodes:
            return False

        # 모든 하위 노드에 경보가 있는지 확인
        for lower_node in lower_nodes:
            if lower_node['id'] not in node_alarm_map:
                return False

        # 상위 노드에 경보가 없는지 확인
        upper_nodes = self.find_upper_nodes(node, level_nodes)
        for upper_node in upper_nodes:
            if upper_node['id'] in node_alarm_map:
                return False

        return True

    def find_lower_nodes(self, node, level_nodes) -> List[Dict]:
        """하위 노드 찾기"""
        current_level = node.get('level', 0)
        lower_nodes = []

        for level in range(current_level + 1, max(level_nodes.keys()) + 1):
            lower_nodes.extend(level_nodes.get(level, []))

        return lower_nodes

    def find_upper_nodes(self, node, level_nodes) -> List[Dict]:
        """상위 노드 찾기"""
        current_level = node.get('level', 0)
        upper_nodes = []

        for level in range(0, current_level):
            upper_nodes.extend(level_nodes.get(level, []))

        return upper_nodes

    def get_node_alarms(self, node_id) -> List[Dict]:
        """노드 경보 조회"""
        # 노드별 경보 매핑을 생성하여 활용
        node_alarm_map = self.create_node_alarm_map()
        return node_alarm_map.get(node_id, [])

    def get_other_sector_alarms(self, fields) -> List[Dict]:
        """다른 분야 경보 조회"""
        other_alarms = []

        for alarm in self.alarms:
            alarm_sector = alarm.get('sector', '').upper()
            if alarm_sector in [field.upper() for field in fields]:
                other_alarms.append(alarm)

        return other_alarms

    def find_upper_exchange_nodes(self, exchange_node) -> List[Dict]:
        """상위 교환 노드 찾기"""
        current_level = exchange_node.get('level', 0)
        upper_exchange_nodes = []

        for node in self.nodes:
            if (node.get('field', '').upper() == '교환' and
                    node.get('level', 0) < current_level):
                upper_exchange_nodes.append(node)

        return upper_exchange_nodes

    def create_analysis_result(self) -> Dict[str, Any]:
        """분석 결과 생성"""
        # 통계 계산
        summary = self.calculate_summary()

        return {
            'success': True,
            'failure_points': self.failure_points,
            'summary': summary,
            'total_analyzed_nodes': len(self.nodes),
            'total_analyzed_links': len(self.links),
            'total_analyzed_alarms': len(self.alarms)
        }

    def calculate_summary(self) -> Dict[str, int]:
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
            'transmission_failures': 0
        }

        for fp in self.failure_points:
            if fp['type'] == 'node':
                summary['node_failures'] += 1
            elif fp['type'] == 'link':
                summary['link_failures'] += 1
            elif fp['type'] == 'mw_equipment':
                summary['mw_equipment_failures'] += 1

                # MW 장애 세부 분류
                failure_type = fp['failure_type']
                if '전파 페이딩' in failure_type or '전파수신 오류' in failure_type:
                    summary['mw_fading_failures'] += 1
                elif '배터리 모드' in failure_type or '전압' in failure_type:
                    summary['mw_voltage_failures'] += 1

            # 장애 타입별 분류
            failure_type = fp['failure_type']
            if '상위 노드' in failure_type:
                summary['upper_node_failures'] += 1
            elif '교환' in failure_type:
                summary['exchange_failures'] += 1
            elif '전송' in failure_type:
                summary['transmission_failures'] += 1

        return summary

    def create_empty_result(self, message: str) -> Dict[str, Any]:
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
                'transmission_failures': 0
            },
            'message': message,
            'total_analyzed_nodes': len(self.nodes),
            'total_analyzed_links': len(self.links),
            'total_analyzed_alarms': len(self.alarms)
        }

    def create_error_result(self, error_message: str) -> Dict[str, Any]:
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
                'transmission_failures': 0
            }
        }
