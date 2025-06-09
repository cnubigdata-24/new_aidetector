"""
장애점 추정 클래스
"""

import logging
from typing import List, Dict, Any
from collections import defaultdict


class InferFailurePoint:
    def __init__(self):
        self.nodes = []
        self.links = []
        self.alarms = []
        self.failure_points = []
        self.logger = logging.getLogger(__name__)

    def analyze(self, nodes: List[Dict], links: List[Dict], alarms: List[Dict]) -> Dict[str, Any]:
        """
        장애점 분석 메인 함수
        """
        try:
            self.logger.info("=" * 60)
            self.logger.info("장애점 분석 시작")
            self.logger.info("=" * 60)

            # 데이터 초기화
            self.nodes = nodes or []
            self.links = links or []
            self.alarms = alarms or []
            self.failure_points = []

            # 입력 데이터 로깅
            self.logger.info(f"📊 입력 데이터 현황:")
            self.logger.info(f"  - 노드 수: {len(self.nodes)}개")
            self.logger.info(f"  - 링크 수: {len(self.links)}개")
            self.logger.info(f"  - 경보 수: {len(self.alarms)}개")

            # 노드별 세부 정보 로깅
            if self.nodes:
                self.logger.info(f"🔍 노드 상세 정보:")
                for i, node in enumerate(self.nodes):
                    node_name = node.get('name', node.get('id', 'Unknown'))
                    node_field = node.get('field', 'Unknown')
                    node_level = node.get('level', 0)
                    alarm_count = len(node.get('alarms', []))
                    self.logger.info(
                        f"  [{i+1}] {node_name} (분야: {node_field}, 레벨: {node_level}, 경보: {alarm_count}개)")

            # 링크별 세부 정보 로깅
            if self.links:
                self.logger.info(f"🔗 링크 상세 정보:")
                for i, link in enumerate(self.links):
                    link_name = link.get(
                        'link_name', link.get('id', 'Unknown'))
                    alarm_count = len(link.get('alarms', []))
                    self.logger.info(
                        f"  [{i+1}] {link_name} (경보: {alarm_count}개)")

            # 데이터 검증
            if not self._validate_input_data():
                self.logger.warning("❌ 입력 데이터 검증 실패")
                return self._create_empty_result("입력 데이터가 부족합니다.")

            self.logger.info("✅ 입력 데이터 검증 완료")
            self.logger.info("-" * 60)

            # 단계별 장애점 분석
            self.logger.info("🔍 단계별 장애점 분석 시작")

            self._analyze_link_failures()      # 1. 링크 장애점
            self.logger.info(
                f"1단계 완료 - 현재 발견된 장애점: {len(self.failure_points)}개")

            self._analyze_upper_node_failures()  # 2. 상위 노드 장애점
            self.logger.info(
                f"2단계 완료 - 현재 발견된 장애점: {len(self.failure_points)}개")

            self._analyze_exchange_failures()   # 3. 교환 노드 장애점
            self.logger.info(
                f"3단계 완료 - 현재 발견된 장애점: {len(self.failure_points)}개")

            self._analyze_transmission_failures()  # 4. 전송 노드 장애점
            self.logger.info(
                f"4단계 완료 - 현재 발견된 장애점: {len(self.failure_points)}개")

            # 결과 생성
            result = self._create_analysis_result()

            self.logger.info("-" * 60)
            self.logger.info(f"🎯 장애점 분석 최종 완료:")
            self.logger.info(f"  - 총 발견된 장애점: {len(self.failure_points)}개")

            # 발견된 장애점 상세 정보
            for i, fp in enumerate(self.failure_points):
                self.logger.info(
                    f"  [{i+1}] {fp['name']} - {fp['failure_type']} (신뢰도: {fp['confidence']*100:.0f}%)")

            self.logger.info("=" * 60)
            return result

        except Exception as e:
            self.logger.error(f"❌ 장애점 분석 중 오류: {str(e)}")
            return self._create_error_result(str(e))

    def _validate_input_data(self) -> bool:
        """입력 데이터 검증"""
        if not self.nodes:
            self.logger.warning("노드 데이터가 없습니다.")
            return False

        # 수정: 노드와 링크 내부의 경보도 확인
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

        self.logger.info(f"📊 전체 경보 현황: 총 {total_alarms_count}건")
        self.logger.info(f"  - 전역 경보: {len(self.alarms)}건")
        self.logger.info(
            f"  - 노드 내부 경보: {sum(len(node.get('alarms', [])) for node in self.nodes)}건")
        self.logger.info(
            f"  - 링크 내부 경보: {sum(len(link.get('alarms', [])) for link in self.links)}건")

        if total_alarms_count == 0:
            self.logger.warning("전체 시스템에 경보가 없습니다.")
            return False

        return True

    def _analyze_link_failures(self):
        """1. 링크 장애점 분석: 링크에 경보가 있는 경우"""
        self.logger.info("🔗 [1단계] 링크 장애점 분석 시작")

        link_failure_count = 0

        for i, link in enumerate(self.links):
            link_name = link.get('link_name', f"링크 {link.get('id')}")
            self.logger.info(
                f"  🔍 [{i+1}/{len(self.links)}] 링크 분석: {link_name}")

            link_alarms = self._get_link_alarms(link)
            self.logger.info(f"    - 링크 경보 수: {len(link_alarms)}개")

            if link_alarms:
                self.failure_points.append({
                    'type': 'link',
                    'id': link.get('id'),
                    'name': link_name,
                    'failure_type': '링크 장애',
                    'inference_detail': '선로 피해 발생',
                    'alarms': link_alarms,
                    'confidence': 0.9
                })

                link_failure_count += 1
                self.logger.info(
                    f"    ✅ 링크 장애점 발견: {link_name} (경보: {len(link_alarms)}개)")

                # 경보 상세 정보
                for j, alarm in enumerate(link_alarms[:3]):  # 최대 3개까지만 표시
                    alarm_msg = alarm.get('alarm_message', 'Unknown')
                    self.logger.info(f"      - 경보{j+1}: {alarm_msg}")
                if len(link_alarms) > 3:
                    self.logger.info(f"      - ... 외 {len(link_alarms)-3}개 경보")
            else:
                self.logger.info(f"    - 경보 없음: 정상")

        self.logger.info(
            f"🔗 [1단계] 링크 장애점 분석 완료 - 발견된 링크 장애점: {link_failure_count}개")

    def _analyze_upper_node_failures(self):
        """2. 상위 노드 장애점 분석"""
        self.logger.info("> [2단계] 상위 노드 장애점 분석 시작")

        # 노드별 경보 정보 매핑
        node_alarm_map = self._create_node_alarm_map()
        self.logger.info(f"  📊 노드별 경보 매핑 완료: {len(node_alarm_map)}개 노드에 경보 존재")

        # 계층별 노드 그룹화
        level_nodes = self._group_nodes_by_level()
        self.logger.info(f"  📊 계층별 노드 그룹화 완료:")
        for level, nodes in level_nodes.items():
            self.logger.info(f"    - 레벨 {level}: {len(nodes)}개 노드")

        upper_failure_count = 0

        # 하위 레벨부터 상위로 분석
        sorted_levels = sorted(level_nodes.keys(), reverse=True)
        self.logger.info(f"  🔍 레벨별 분석 순서: {sorted_levels}")

        for level in sorted_levels:
            self.logger.info(f"  🏗️ 레벨 {level} 분석 중...")

            for i, node in enumerate(level_nodes[level]):
                node_name = node.get('name', node['id'])
                self.logger.info(
                    f"    🔍 [{i+1}/{len(level_nodes[level])}] 노드 분석: {node_name}")

                if self._is_upper_node_failure(node, node_alarm_map, level_nodes):
                    node_alarms = node_alarm_map.get(node['id'], [])

                    self.failure_points.append({
                        'type': 'node',
                        'id': node['id'],
                        'name': node_name,
                        'failure_type': '상위 노드 장애',
                        'inference_detail': '상위 노드 장애점 추정',
                        'alarms': node_alarms,
                        'confidence': 0.8
                    })

                    upper_failure_count += 1
                    self.logger.info(
                        f"      ✅ 상위 노드 장애점 발견: {node_name} (경보: {len(node_alarms)}개)")

                    # 경보 상세 정보
                    for j, alarm in enumerate(node_alarms[:2]):  # 최대 2개까지만 표시
                        alarm_msg = alarm.get('alarm_message', 'Unknown')
                        self.logger.info(f"        - 경보{j+1}: {alarm_msg}")
                    if len(node_alarms) > 2:
                        self.logger.info(
                            f"        - ... 외 {len(node_alarms)-2}개 경보")
                else:
                    self.logger.info(f"      - 상위 노드 장애 조건 불만족")

        self.logger.info(
            f"> [2단계] 상위 노드 장애점 분석 완료 - 발견된 상위 노드 장애점: {upper_failure_count}개")

    def _analyze_exchange_failures(self):
        """3. 교환 노드 장애점 분석"""
        self.logger.info("🔄 [3단계] 교환 노드 장애점 분석 시작")

        exchange_nodes = [node for node in self.nodes if node.get(
            'field', '').upper() == '교환']
        self.logger.info(f"  📊 교환 노드 수: {len(exchange_nodes)}개")

        if not exchange_nodes:
            self.logger.info("  ℹ️ 교환 노드가 없어서 3단계 분석을 건너뜁니다.")
            return

        exchange_failure_count = 0

        for i, node in enumerate(exchange_nodes):
            node_name = node.get('name', node['id'])
            self.logger.info(
                f"  🔍 [{i+1}/{len(exchange_nodes)}] 교환 노드 분석: {node_name}")

            node_alarms = self._get_node_alarms(node['id'])
            self.logger.info(f"    - 교환 노드 경보 수: {len(node_alarms)}개")

            # 3-1: A1395 경보 체크 (100개 이상)
            a1395_alarms = [alarm for alarm in node_alarms
                            if 'A1395' in alarm.get('alarm_message', '')]

            self.logger.info(f"    - A1395 경보 수: {len(a1395_alarms)}개")

            if len(a1395_alarms) >= 100:
                self.failure_points.append({
                    'type': 'node',
                    'id': node['id'],
                    'name': node_name,
                    'failure_type': '교환 A1395 장애',
                    'inference_detail': 'CGW 및 CGW 연동장비 체크 필요',
                    'alarms': a1395_alarms,
                    'confidence': 0.9
                })

                exchange_failure_count += 1
                self.logger.info(
                    f"    ✅ A1395 대량 장애점 발견: {node_name} (A1395: {len(a1395_alarms)}개)")
                continue

            # 3-2, 3-3: A1930 경보 체크
            a1930_alarms = [alarm for alarm in node_alarms
                            if 'A1930' in alarm.get('alarm_message', '')]

            self.logger.info(f"    - A1930 경보 수: {len(a1930_alarms)}개")

            if a1930_alarms:
                self.logger.info(f"    🔍 A1930 경보 분석 진행: {node_name}")
                before_count = len(self.failure_points)
                self._analyze_a1930_failures(node, a1930_alarms)
                after_count = len(self.failure_points)

                if after_count > before_count:
                    exchange_failure_count += (after_count - before_count)
                    self.logger.info(
                        f"    ✅ A1930 관련 장애점 발견: {after_count - before_count}개")
            else:
                self.logger.info(f"    - A1930 경보 없음: 정상")

        self.logger.info(
            f"🔄 [3단계] 교환 노드 장애점 분석 완료 - 발견된 교환 장애점: {exchange_failure_count}개")

    def _analyze_a1930_failures(self, exchange_node, a1930_alarms):
        """A1930 경보 분석"""
        other_field_alarms = self._get_other_field_alarms(['IP', '전송'])

        if len(a1930_alarms) <= 10 and not other_field_alarms:
            # 3-2: 다른 분야 경보 없고 A1930 10개 이하
            self.failure_points.append({
                'type': 'node',
                'id': exchange_node['id'],
                'name': exchange_node.get('name', exchange_node['id']),
                'failure_type': '교환 A1930 단독장애',
                'inference_detail': 'AGW 단독고장으로 공통부 확인 필요',
                'alarms': a1930_alarms,
                'confidence': 0.8
            })
        elif len(a1930_alarms) >= 11 and other_field_alarms:
            # 3-3: IP/전송 경보 있고 A1930 11개 이상
            upper_exchange_nodes = self._find_upper_exchange_nodes(
                exchange_node)

            for upper_node in upper_exchange_nodes:
                upper_alarms = self._get_node_alarms(upper_node['id'])
                if upper_alarms:
                    self.failure_points.append({
                        'type': 'node',
                        'id': upper_node['id'],
                        'name': upper_node.get('name', upper_node['id']),
                        'failure_type': '교환 A1930 상위장애',
                        'inference_detail': 'AGW 단독고장으로 공통부 확인 필요',
                        'alarms': upper_alarms,
                        'confidence': 0.7
                    })

    def _analyze_transmission_failures(self):
        """4. 전송 노드 장애점 분석"""
        self.logger.info("📡 [4단계] 전송 노드 장애점 분석 시작")

        transmission_nodes = [node for node in self.nodes
                              if node.get('field', '').upper() == '전송']

        self.logger.info(f"  📊 전송 노드 수: {len(transmission_nodes)}개")

        if not transmission_nodes:
            self.logger.info("  ℹ️ 전송 노드가 없어서 4단계 분석을 건너뜁니다.")
            return

        transmission_failure_count = 0

        for i, node in enumerate(transmission_nodes):
            node_name = node.get('name', node['id'])
            self.logger.info(
                f"  🔍 [{i+1}/{len(transmission_nodes)}] 전송 노드 분석: {node_name}")

            node_alarms = self._get_node_alarms(node['id'])
            self.logger.info(f"    - 전송 노드 경보 수: {len(node_alarms)}개")

            # 4-1: LOS 경보 체크
            los_alarms = [alarm for alarm in node_alarms
                          if 'LOS' in alarm.get('alarm_message', '').upper()]

            self.logger.info(f"    - LOS 경보 수: {len(los_alarms)}개")

            if los_alarms:
                self.failure_points.append({
                    'type': 'node',
                    'id': node['id'],
                    'name': node_name,
                    'failure_type': '전송 LOS 장애',
                    'inference_detail': '대항국 장비 장애 또는 광선로 단선',
                    'alarms': los_alarms,
                    'confidence': 0.9
                })

                transmission_failure_count += 1
                self.logger.info(
                    f"    ✅ LOS 장애점 발견: {node_name} (LOS: {len(los_alarms)}개)")

                # LOS 경보 상세 정보
                for j, alarm in enumerate(los_alarms[:2]):
                    alarm_msg = alarm.get('alarm_message', 'Unknown')
                    self.logger.info(f"      - LOS경보{j+1}: {alarm_msg}")
                if len(los_alarms) > 2:
                    self.logger.info(
                        f"      - ... 외 {len(los_alarms)-2}개 LOS 경보")
                continue

            # 4-2: LOF 경보 체크
            lof_alarms = [alarm for alarm in node_alarms
                          if 'LOF' in alarm.get('alarm_message', '').upper()]

            self.logger.info(f"    - LOF 경보 수: {len(lof_alarms)}개")

            if lof_alarms:
                self.failure_points.append({
                    'type': 'node',
                    'id': node['id'],
                    'name': node_name,
                    'failure_type': '전송 LOF 장애',
                    'inference_detail': '대항국 장비 불량',
                    'alarms': lof_alarms,
                    'confidence': 0.8
                })

                transmission_failure_count += 1
                self.logger.info(
                    f"    ✅ LOF 장애점 발견: {node_name} (LOF: {len(lof_alarms)}개)")

                # LOF 경보 상세 정보
                for j, alarm in enumerate(lof_alarms[:2]):
                    alarm_msg = alarm.get('alarm_message', 'Unknown')
                    self.logger.info(f"      - LOF경보{j+1}: {alarm_msg}")
                if len(lof_alarms) > 2:
                    self.logger.info(
                        f"      - ... 외 {len(lof_alarms)-2}개 LOF 경보")
            else:
                self.logger.info(f"    - LOS/LOF 경보 없음: 정상")

        self.logger.info(
            f"📡 [4단계] 전송 노드 장애점 분석 완료 - 발견된 전송 장애점: {transmission_failure_count}개")

    # 헬퍼 메서드들

    def _get_link_alarms(self, link) -> List[Dict]:
        """링크 관련 경보 조회"""
        # 전달받은 링크의 경보 정보 활용
        link_alarms = link.get('alarms', [])

        # 수정: 모든 경보 포함
        filtered_alarms = []
        for alarm in link_alarms:
            if alarm:
                filtered_alarms.append(alarm)

        return filtered_alarms

    def _create_node_alarm_map(self) -> Dict[str, List[Dict]]:
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
        # 노드별 경보 매핑을 생성하여 활용
        node_alarm_map = self._create_node_alarm_map()
        return node_alarm_map.get(node_id, [])

    def _get_other_field_alarms(self, fields) -> List[Dict]:
        """다른 분야 경보 조회"""
        other_alarms = []

        for alarm in self.alarms:
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
        # 통계 계산
        summary = self._calculate_summary()

        return {
            'success': True,
            'failure_points': self.failure_points,
            'summary': summary,
            'total_analyzed_nodes': len(self.nodes),
            'total_analyzed_links': len(self.links),
            'total_analyzed_alarms': len(self.alarms)
        }

    def _calculate_summary(self) -> Dict[str, int]:
        """요약 통계 계산"""
        summary = {
            'total_failure_points': len(self.failure_points),
            'node_failures': 0,
            'link_failures': 0,
            'upper_node_failures': 0,
            'exchange_failures': 0,
            'transmission_failures': 0
        }

        for fp in self.failure_points:
            if fp['type'] == 'node':
                summary['node_failures'] += 1
            elif fp['type'] == 'link':
                summary['link_failures'] += 1

            failure_type = fp['failure_type']
            if '상위 노드' in failure_type:
                summary['upper_node_failures'] += 1
            elif '교환' in failure_type:
                summary['exchange_failures'] += 1
            elif '전송' in failure_type:
                summary['transmission_failures'] += 1

        return summary

    def _create_empty_result(self, message: str) -> Dict[str, Any]:
        """빈 결과 생성"""
        return {
            'success': True,
            'failure_points': [],
            'summary': {
                'total_failure_points': 0,
                'node_failures': 0,
                'link_failures': 0,
                'upper_node_failures': 0,
                'exchange_failures': 0,
                'transmission_failures': 0
            },
            'message': message,
            'total_analyzed_nodes': len(self.nodes),
            'total_analyzed_links': len(self.links),
            'total_analyzed_alarms': len(self.alarms)
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
                'upper_node_failures': 0,
                'exchange_failures': 0,
                'transmission_failures': 0
            }
        }
