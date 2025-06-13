from flask import Blueprint, jsonify, request, render_template, Response
import logging

from db.models import *
from db.models import db, TblAlarmAllLast, TblSubLink, TblGuksa
from sqlalchemy import desc, case, or_, func, asc, select, text

# InferFailurePoint 클래스 import
from .scripts.InferFailurePoint import InferFailurePoint


import numpy as np

import traceback
import sys
import random

import subprocess
import json
import base64
from urllib.parse import unquote
import time

import hashlib

from flask import current_app
from datetime import datetime, timedelta

# pip install puresnmp
import puresnmp

# pip install pyzmq
import zmq

from flask import has_app_context

import queue
import threading


# LLM 초기화
from .scripts.llm_loader_2 import (
    get_llm_pipeline,
    initialize_llm,
)
from .scripts.fault_prediction_core_4 import (
    set_guksa_id,
    run_query,
    get_vector_db_collection,
)
from .scripts.llm_response_generator_3 import (
    analyze_query_type,
    generate_response_with_llm,
)

api_bp = Blueprint("api", __name__, url_prefix="/api")

MW_SOCKET_SERVER = "tcp://192.168.147.78:5555"
context = zmq.Context()
zmq_socket = context.socket(zmq.REQ)


# 장애점 추정 단계별 진행 상황을 저장할 큐
progress_queues = {}

# 장애점 추정 API
# POST 요청으로 노드, 링크, 경보 데이터를 받아 장애점을 분석하고 결과를 JSON으로 반환


@api_bp.route("/infer_failure_point", methods=["POST"])
def infer_failure_point():
    try:
        # 요청 데이터 검증
        if not request.is_json:
            return jsonify({
                'success': False,
                'error': 'Content-Type이 application/json이어야 합니다.'
            }), 400

        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': '요청 데이터가 없습니다.'
            }), 400

        # 스트리밍 요청인지 확인
        is_streaming = data.get('streaming', False)

        if is_streaming:
            # 스트리밍 모드: SSE 엔드포인트로 리다이렉트
            session_id = data.get('session_id', 'default')

            # 분석을 별도 스레드에서 실행
            def run_analysis():
                try:
                    # 진행 상황 큐 생성
                    progress_queue = queue.Queue()
                    progress_queues[session_id] = progress_queue

                    # 진행 상황 콜백 함수
                    def progress_callback(message):
                        progress_queue.put({
                            'type': 'progress',
                            'message': message
                        })

                    # 입력 데이터 추출
                    nodes = data.get('nodes', [])
                    links = data.get('links', [])
                    alarms = data.get('alarms', [])

                    logging.info(
                        f"장애점 분석 요청 (스트리밍): 노드 {len(nodes)}개, 링크 {len(links)}개, 경보 {len(alarms)}건")

                    # InferFailurePoint 인스턴스 생성 및 분석 실행
                    analyzer = InferFailurePoint(
                        progress_callback=progress_callback)
                    result = analyzer.analyze(nodes, links, alarms)

                    # 최종 결과 전송
                    progress_queue.put({
                        'type': 'result',
                        'data': result
                    })

                    # 완료 신호
                    progress_queue.put({
                        'type': 'complete'
                    })

                except Exception as e:
                    logging.error(f"장애점 분석 중 오류: {str(e)}")
                    progress_queue.put({
                        'type': 'error',
                        'message': str(e)
                    })

            # 분석 스레드 시작
            analysis_thread = threading.Thread(target=run_analysis)
            analysis_thread.daemon = True
            analysis_thread.start()

            return jsonify({
                'success': True,
                'session_id': session_id,
                'stream_url': f'/api/infer_failure_point_stream/{session_id}'
            })
        else:
            # 기존 동기 모드
            # 입력 데이터 추출
            nodes = data.get('nodes', [])
            links = data.get('links', [])
            alarms = data.get('alarms', [])

            # 기본 데이터 검증
            if not isinstance(nodes, list) or not isinstance(links, list) or not isinstance(alarms, list):
                return jsonify({
                    'success': False,
                    'error': '입력 데이터 형식이 올바르지 않습니다. (nodes, links, alarms는 배열이어야 함)'
                }), 400

            logging.info(
                f"장애점 분석 요청: 노드 {len(nodes)}개, 링크 {len(links)}개, 경보 {len(alarms)}건")

            # InferFailurePoint 인스턴스 생성 및 분석 실행
            analyzer = InferFailurePoint()
            result = analyzer.analyze(nodes, links, alarms)

            # 분석 결과 로깅
            if result.get('success'):
                failure_count = result.get('summary', {}).get(
                    'total_failure_points', 0)
                logging.info(f"장애점 분석 완료: {failure_count}개 장애점 발견")
            else:
                logging.error(f"장애점 분석 실패: {result.get('error', '알 수 없는 오류')}")

            # 결과 반환
            return jsonify(result), 200

    except Exception as e:
        logging.error(f"장애점 분석 API 오류: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'서버 오류: {str(e)}'
        }), 500

# 장애점 분석 진행 상황 스트리밍 API


@api_bp.route("/infer_failure_point_stream/<session_id>")
def infer_failure_point_stream(session_id):
    def generate():
        try:
            progress_queue = progress_queues.get(session_id)
            if not progress_queue:
                yield f"data: {json.dumps({'type': 'error', 'message': '세션을 찾을 수 없습니다.'})}\n\n"
                return

            while True:
                try:
                    # 타임아웃 60초로 설정
                    item = progress_queue.get(timeout=60)

                    # JSON 형태로 데이터 전송
                    yield f"data: {json.dumps(item)}\n\n"

                    # 완료 신호면 종료
                    if item.get('type') == 'complete':
                        break

                except queue.Empty:
                    # 타임아웃 발생시 연결 유지를 위한 heartbeat
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
        except Exception as e:
            logging.error(f"스트리밍 중 오류: {str(e)}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        finally:
            # 세션 정리
            if session_id in progress_queues:
                del progress_queues[session_id]

    return Response(generate(),
                    content_type='text/event-stream',
                    headers={
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    })


@api_bp.route("/status")
def status():
    return jsonify({"status": "ok"})


@api_bp.route("/topology/<guksa_name>")
def get_topology(guksa_name):
    # URL 디코딩 처리
    try:
        guksa_name = unquote(guksa_name)
        guksa_name = guksa_name.strip()

        print(f"🔍 get_topology 호출: guksa_name='{guksa_name}'")

        # 1. 국사 조회 - 여러 필드에서 검색
        guksa_obj = None

        # 1-1. guksa 필드로 검색
        guksa_obj = TblGuksa.query.filter_by(guksa=guksa_name).first()
        if guksa_obj:
            print(
                f"✅ guksa 필드에서 발견: {guksa_obj.guksa} (ID: {guksa_obj.guksa_id})")
        else:
            print(f"❌ guksa 필드에서 찾지 못함: {guksa_name}")

            # 1-2. guksa_t 필드로 검색
            guksa_obj = TblGuksa.query.filter_by(guksa_t=guksa_name).first()
            if guksa_obj:
                print(
                    f"✅ guksa_t 필드에서 발견: {guksa_obj.guksa_t} (ID: {guksa_obj.guksa_id})")
            else:
                print(f"❌ guksa_t 필드에서 찾지 못함: {guksa_name}")

                # 1-3. guksa_e 필드로 검색
                guksa_obj = TblGuksa.query.filter_by(
                    guksa_e=guksa_name).first()
                if guksa_obj:
                    print(
                        f"✅ guksa_e 필드에서 발견: {guksa_obj.guksa_e} (ID: {guksa_obj.guksa_id})")
                else:
                    print(f"❌ guksa_e 필드에서 찾지 못함: {guksa_name}")

        # 2. 국사를 찾지 못한 경우 유사한 이름 검색
        if not guksa_obj:
            print(f"🔍 유사한 국사명 검색 시도...")
            similar_guksas = TblGuksa.query.filter(
                or_(
                    TblGuksa.guksa.like(f'%{guksa_name}%'),
                    TblGuksa.guksa_t.like(f'%{guksa_name}%'),
                    TblGuksa.guksa_e.like(f'%{guksa_name}%')
                )
            ).limit(5).all()

            if similar_guksas:
                print(f"📋 유사한 국사들 발견:")
                for sg in similar_guksas:
                    print(
                        f"  - ID:{sg.guksa_id}, guksa:'{sg.guksa}', guksa_t:'{sg.guksa_t}', guksa_e:'{sg.guksa_e}'")

                # 첫 번째 유사한 국사 사용
                guksa_obj = similar_guksas[0]
                print(
                    f"✅ 첫 번째 유사 국사 사용: {guksa_obj.guksa} (ID: {guksa_obj.guksa_id})")
            else:
                print(f"❌ 유사한 국사도 찾을 수 없음")

        # 3. 여전히 국사를 찾지 못한 경우
        if not guksa_obj:
            print(f"❌ 최종적으로 국사를 찾을 수 없음: {guksa_name}")
            return jsonify({
                "guksa_name": guksa_name,
                "guksa_id": None,
                "장비수": 0,
                "equip_list": [],
                "error": f"국사 '{guksa_name}'를 찾을 수 없습니다"
            }), 200

        print(f"✅ 국사 발견: {guksa_obj.guksa} (ID: {guksa_obj.guksa_id})")

        # 4. TblEquipment에서 해당 국사의 장비들을 직접 조회
        equipments = TblEquipment.query.filter_by(
            guksa_id=guksa_obj.guksa_id).all()

        print(f"📊 해당 국사의 장비 수: {len(equipments)}개")

        # 장비가 없는 경우 다른 방법 시도
        if len(equipments) == 0:
            print(f"⚠️ guksa_id로 장비를 찾을 수 없음, TblSubLink 데이터 사용...")

            # TblSubLink에서 guksa_name으로 검색
            from db.models import TblSubLink
            equipment_links = TblSubLink.query.filter(
                or_(
                    TblSubLink.guksa_name == guksa_obj.guksa,
                    TblSubLink.guksa_name == guksa_obj.guksa_t,
                    TblSubLink.guksa_name == guksa_obj.guksa_e,
                    TblSubLink.guksa_name == guksa_name
                )
            ).all()

            print(f"📊 TblSubLink에서 찾은 장비 링크 수: {len(equipment_links)}개")

            if equipment_links:
                print(f"✅ TblSubLink 데이터를 사용하여 응답 생성")

                # TblSubLink 데이터를 직접 응답 형식으로 변환
                equip_list = []
                for link in equipment_links:
                    # 분야 결정 - equip_field가 없으면 장비명에서 추출
                    sector = getattr(link, 'equip_field', None)
                    if not sector or sector.strip() == '':
                        # 장비명에서 분야 추출
                        equip_name = link.equip_name or link.equip_id or ''
                        if 'MSPP' in equip_name.upper():
                            sector = '전송'
                        elif 'SMR' in equip_name.upper():
                            sector = '무선'
                        elif 'CDM' in equip_name.upper() or 'MDM' in equip_name.upper():
                            sector = 'MW'
                        elif 'CTR' in equip_name.upper():
                            sector = '선로'
                        elif 'IP' in equip_name.upper():
                            sector = 'IP'
                        elif 'TEL' in equip_name.upper() or 'SWITCH' in equip_name.upper():
                            sector = '교환'
                        else:
                            sector = '기타'

                    # 장비명 정리
                    display_name = link.equip_name or link.equip_id or f"장비_{link.equip_id}"
                    if len(display_name) > 50:
                        display_name = display_name[:47] + "..."

                    equip_data = {
                        "equip_id": link.equip_id,
                        "equip_name": display_name,
                        "equip_ip": getattr(link, 'equip_ip', ''),
                        "sector": sector,
                        "guksa_id": guksa_obj.guksa_id,
                    }
                    equip_list.append(equip_data)

                # 분야별 그룹핑
                sector_groups = {}
                for equip in equip_list:
                    sector = equip["sector"]
                    if sector not in sector_groups:
                        sector_groups[sector] = []
                    sector_groups[sector].append(equip)

                print(f"📊 분야별 장비 분포:")
                for sector, equipments_in_sector in sector_groups.items():
                    print(f"  - {sector}: {len(equipments_in_sector)}개")

                # 직접 JSON 응답 반환 (TblEquipment 없이)
                return jsonify({
                    "guksa_name": guksa_name,
                    "guksa_id": guksa_obj.guksa_id,
                    "장비수": len(equip_list),
                    "equip_list": equip_list,
                    "sector_groups": sector_groups,
                    "data_source": "TblSubLink"  # 데이터 출처 명시
                }), 200
            else:
                print(f"❌ TblSubLink에서도 장비를 찾을 수 없음")

            # 최종 결과가 없으면 에러 메시지와 함께 빈 응답
            return jsonify({
                "guksa_name": guksa_name,
                "guksa_id": guksa_obj.guksa_id,
                "장비수": 0,
                "equip_list": [],
                "error": f"해당 국사 '{guksa_name}'의 장비 데이터를 찾을 수 없습니다."
            }), 200

        # 5. 응답 데이터 구성
        equip_list = []
        for equip in equipments:
            equip_data = {
                "equip_id": equip.equip_id,
                "equip_name": equip.equip_name,
                "equip_ip": getattr(equip, 'equip_ip', ''),
                "sector": getattr(equip, 'sector', '알 수 없음'),
                "guksa_id": equip.guksa_id,
                "guksa_name": guksa_name,
            }
            equip_list.append(equip_data)

        print(f"✅ 장비 데이터 구성 완료: {len(equip_list)}개")

        # 6. 응답 데이터 반환
        response_data = {
            "guksa_name": guksa_name,
            "guksa_id": guksa_obj.guksa_id,
            "장비수": len(equip_list),
            "equip_list": equip_list
        }

        print(f"📤 최종 응답: 국사={guksa_name}, 장비수={len(equip_list)}개")
        return jsonify(response_data)

    except Exception as e:
        print(f"❌ get_topology 에러: {str(e)}")
        import traceback
        traceback.print_exc()

        return jsonify({
            "guksa_name": guksa_name,
            "guksa_id": None,
            "장비수": 0,
            "equip_list": [],
            "error": f"처리 중 오류 발생: {str(e)}"
        }), 500


@api_bp.route('/alarms/<guksa_name>')
def get_alarms(guksa_name):
    # 해당 국사의 장비들 조회
    # guksa = TblGuksa.query.filter_by(guksa=guksa_name).first()
    # if not guksa:
    #     return jsonify([])

    guksa = TblGuksa.query.filter(TblGuksa.guksa == guksa_name).first()

    # 해당 국사의 장비들에 대한 경보 조회
    alarms = (
        TblAlarmAllLast.query
        .filter(TblAlarmAllLast.guksa_id == str(guksa.guksa_id))
        # occur_datetime을 내림차순으로 정렬
        .order_by(desc(TblAlarmAllLast.occur_datetime))
        .all()
    )
    # alarms = (TblAlarmAllLast.query
    #          .join(Equipment)
    #          .filter(Equipment.guksa_id == guksa.guksa_id)
    #          .all())

    print("================")

    alarm_list = []
    for alarm in alarms:
        alarm_data = {
            'guksa': guksa.guksa,
            'guksa_id': guksa.guksa_id,
            'alarms': {
                'sector': alarm.sector,
                'alarm_grade': alarm.alarm_grade,
                'valid_yn': alarm.valid_yn,
                'equip_name': alarm.equip_name,
                'occur_datetime': alarm.occur_datetime,
                'alarm_message': alarm.alarm_message,
                'fault_reason': alarm.fault_reason,
            }
        }
        alarm_list.append(alarm_data)

    # 반환 시 alarm_list 사용
    data = {
        'alarms': alarm_list
    }
    return jsonify(data)


@api_bp.route("/rag_popup", methods=["POST"])
async def rag_query():
    data = request.get_json()

    query = data.get("query", "")
    mode = data.get("mode", "fixed")  # 기본은 기존 방식 유지
    guksa_id = data.get("guksa_id")

    try:
        if get_llm_pipeline() is None:
            print("LLM 모델이 로드되어 있지 않아 초기화합니다...")
            initialize_llm()

        user_id = f"web_user_{request.remote_addr}_{int(time.time())}"

        print("\n mode: " + mode)
        print("\n query: " + query)

        set_guksa_id(guksa_id)

        # 유형 1: 장애점 찾기 고정 답변
        if mode == "fixed":

            # 비동기 run_query 함수 호출 - await 사용
            json_result = await run_query(mode=mode, query=query, user_id=user_id)

            # 로깅
            logger = logging.getLogger(__name__)
            logger.debug("json_result type: %s", type(json_result))

            # JSON 문자열을 파싱
            try:
                print(json_result, 22)
                # 이미 dictionary 형태인 경우 처리
                if isinstance(json_result, dict):
                    parsed = json_result
                else:
                    parsed = json.loads(json_result)

                opinion = parsed.get("opinion", "")
                if not opinion:
                    opinion = "유사한 장애사례를 찾을 수 없습니다. 더 구체적인 내용을 입력해주세요."
                summary = parsed.get("summary", [])
                details = parsed.get("details", [])
                processing_time = parsed.get("processing_time", 0.0)
                external_factors = parsed.get("external_factors", {})
                # 추가: 새로운 장애점 추론 결과 가져오기
                fault_location_1 = parsed.get("fault_location_1", {})
                fault_location_2 = parsed.get("fault_location_2", {})
            except json.JSONDecodeError as e:
                return jsonify(
                    {
                        "success": False,
                        "result_msg": f"JSON 파싱 실패: {str(e)}",
                    }
                )

            return jsonify(
                {
                    "success": True,
                    "result_msg": "성공",
                    "opinion": opinion,
                    "summary": summary,
                    "details": details,
                    "external_factors": external_factors,
                    "fault_location_1": fault_location_1,  # 추가: 장애점 추론 1 결과
                    "fault_location_2": fault_location_2,  # 추가: 장애점 추론 2 결과
                    "processing_time": processing_time,
                }
            )

        # 유형 2: 자유 대화 (구현 불가: 삭제 예정)
        elif mode == "chat":
            # 사용자 ID를 요청간에 유지하기 위해 세션 사용 또는 IP 기반 일관된 ID 생성
            ip_hash = hashlib.md5(request.remote_addr.encode()).hexdigest()[:8]
            persistent_user_id = f"web_user_{ip_hash}"

            collection, error = get_vector_db_collection()
            if error:
                return jsonify({"success": False, "error": error})

            # 이전 대화 기록에서 컨텍스트 가져오기 (직접 conversation_history 접근)
            # 수정: conversation_history는 더 이상 사용하지 않음
            # 대신 개선된 hybrid_search_async 함수를 사용하는 방식으로 변경
            context = ""

            # 개선된 코드에 맞게 수정 - 하이브리드 검색 사용
            # 비동기 쿼리 실행
            json_result = await run_query(mode="chat", query=query, user_id=persistent_user_id)

            # 결과 파싱
            try:
                if isinstance(json_result, dict):
                    parsed = json_result
                else:
                    parsed = json.loads(json_result)

                response_text = parsed.get("opinion", "")
                if not response_text:
                    response_text = "유사한 장애사례를 찾을 수 없습니다. 더 구체적인 내용을 입력해주세요."
                # 처리 시간 정보 가져오기
                processing_time = parsed.get("processing_time", 0.0)
            except:
                response_text = "응답 처리 중 오류가 발생했습니다."
                processing_time = 0.0

            return jsonify(
                {
                    "success": True,
                    "query": f"{query}",
                    "details": response_text,
                    "processing_time": processing_time
                }
            )

    except Exception as e:

        # 상세 오류 정보 수집
        error_type = type(e).__name__
        error_msg = str(e)
        error_details = traceback.format_exc()

        # 로그 출력
        print("[ RAG 서버 에러 발생 ]", file=sys.stderr)
        print(f"에러 유형: {error_type}", file=sys.stderr)
        print(f"에러 메시지: {error_msg}", file=sys.stderr)
        print(error_details, file=sys.stderr)

        # app 대신 current_app 사용
        return (
            jsonify(
                {
                    "success": False,
                    "result_msg": (
                        error_details
                        if current_app.config.get("DEBUG", False)
                        else "오류 세부 정보는 로그를 확인하세요."
                    ),
                }
            ),
            500,
        )


@api_bp.route("/latest_alarms")
def get_latest_alarms():
    try:
        guksa_id = request.args.get("guksa_id")

        # 테스트 코드
        guksa_id = '958'

        print(f"GET /api/latest_alarms 요청 - guksa_id: {guksa_id}")

        if not guksa_id:
            print("guksa_id가 제공되지 않음, 빈 응답 반환")
            return jsonify({"alarms": ""})

        # 필요한 필드만 선택하여 조회
        query = (
            db.session.query(
                TblAlarmAllLast.sector,
                TblAlarmAllLast.equip_type,
                TblAlarmAllLast.equip_kind,
                TblAlarmAllLast.alarm_syslog_code,
                TblAlarmAllLast.fault_reason,
                TblAlarmAllLast.alarm_message
            )
            .filter(TblAlarmAllLast.guksa_id == str(guksa_id))  # 문자열로 비교
            .order_by(TblAlarmAllLast.occur_datetime.asc())
        )

        print(f"실행할 쿼리: {query}")

        alarms = query.all()
        print(f"조회된 알람 수: {len(alarms)}")

        # 요청된 형식으로 알람 텍스트 구성
        alert_texts = []
        for alarm in alarms:
            if alarm.alarm_message:  # 메시지가 있는 경우만 포함
                alert_text = f"[{alarm.sector} 분야] {alarm.equip_type}, {alarm.equip_kind} 장비에서 {alarm.alarm_syslog_code}, {alarm.fault_reason}, {alarm.alarm_message}의 경보가 발생함"
                alert_texts.append(alert_text)

        # 전체 프롬프트 생성 및 JSON 응답 반환
        prompt = "\n".join(alert_texts)
        print(f"생성된 프롬프트: {prompt[:100]}... (길이: {len(prompt)})")

        return jsonify({"alarms": prompt})

    except Exception as e:
        print(f"latest_alarms API 오류 발생: {str(e)}")
        print(traceback.format_exc())
        return jsonify({"alarms": "", "error": str(e)}), 500


@api_bp.route("/cable_status")
def get_cable_status():
    guksa_id = request.args.get("guksa_id")

    # 1. TblDrCableAlarmInfo 테이블에서 guksa_id가 일치하는 항목만 조회
    query = db.session.query(TblDrCableAlarmInfo)
    if guksa_id:
        query = query.filter(TblDrCableAlarmInfo.guksa_id == guksa_id)

    recent_cables = query.order_by(
        TblDrCableAlarmInfo.insert_datetime.asc()).all()

    # 데이터가 없는 경우 빈 결과 반환
    if not recent_cables:
        return jsonify({
            "cable_status": [],
            "unrecovered_alarm": {
                "count": 0,
                "most_recent": {
                    "guksa_name": None,
                    "cable_name_core": None,
                    "fault_sector": None,
                    "alarm_occur_datetime": None
                }
            }
        })

    print(guksa_id)
    print(recent_cables)
    print(recent_cables[0].to_dict())  # 이제 이 줄은 데이터가 있을 때만 실행됨
    cable_list = [c.to_dict() for c in recent_cables]

    # 2. 미복구 항목만 필터링
    unrecovered = [
        c for c in recent_cables
        if not c.alarm_recover_datetime or str(c.alarm_recover_datetime).strip() == ""
    ]
    unrecovered_count = len(unrecovered)

    # 3. 가장 최근 발생 항목 하나만 추출
    most_recent = None
    if unrecovered:
        most_recent = max(
            unrecovered,
            key=lambda c: c.alarm_occur_datetime or ""
        )

    return jsonify({
        "cable_status": cable_list,
        "unrecovered_alarm": {
            "count": int(unrecovered_count),
            "most_recent": {
                "guksa_name": most_recent.guksa_name if most_recent else None,
                "cable_name_core": most_recent.cable_name_core if most_recent else None,
                "fault_sector": most_recent.fault_sector if most_recent else None,
                "alarm_occur_datetime": most_recent.alarm_occur_datetime if most_recent else None
            }
        }
    })


@api_bp.route("/guksa_name", methods=["GET"])
def get_guksa_name():
    guksa_id = request.args.get("guksa_id", type=int)

    if guksa_id is None:
        return jsonify({"error": "guksa_id 누락"}), 400

    guksa = db.session.query(TblGuksa).filter_by(guksa_id=guksa_id).first()
    print(guksa)
    if guksa is None:
        return jsonify({"error": "국사ID 오류"}), 404

    return jsonify({"guksa_name": guksa.guksa})


@api_bp.route('/get_equiplist', methods=['POST'])
def get_equiplist():

    guksa_id = request.json.get('guksa_id')
    print(f"받은 국사 ID: {guksa_id}, 타입: {type(guksa_id)}")

    if not guksa_id:
        return jsonify({'error': 'guksa_id is required'}), 400

    try:
        # 쿼리 로깅
        print(f"쿼리 실행 전: guksa_id={guksa_id}")

        # 문자열 타입으로 변환하여 검색
        str_guksa_id = str(guksa_id).strip()

        # 먼저 국사 정보 조회
        guksa_info = db.session.query(TblGuksa).filter(
            TblGuksa.guksa_id == str_guksa_id).first()
        guksa_name = guksa_info.guksa if guksa_info else f"국사 {str_guksa_id}"

        print(f"조회된 국사 정보: ID={str_guksa_id}, 이름={guksa_name}")

        # 필요한 필드만 명시적으로 조회
        query = (
            db.session.query(
                TblAlarmAllLast.guksa_id,
                TblAlarmAllLast.guksa_name,
                TblAlarmAllLast.sector,
                TblAlarmAllLast.equip_id,
                TblAlarmAllLast.equip_name,
                TblAlarmAllLast.occur_datetime,
                TblAlarmAllLast.alarm_message
            )
            .filter(TblAlarmAllLast.guksa_id == str_guksa_id)
            .order_by(TblAlarmAllLast.occur_datetime.asc())
        )

        # 쿼리 디버깅
        print(f"실행 쿼리: {query}")

        results = query.all()
        print(f"쿼리 결과 개수: {len(results)}")

        if not results:
            # 해당 국사 ID에 대한 데이터가 없는 경우 국사 정보만 반환
            return jsonify({
                'guksa_id': str_guksa_id,
                'guksa_name': guksa_name,
                'equip_list': []
            })

        # 조회된 결과에서 guksa_name 가져오기 (없으면 이미 조회한 guksa_name 사용)
        result_guksa_name = results[0].guksa_name if results[0].guksa_name else guksa_name

        response_data = {
            'guksa_id': str_guksa_id,
            'guksa_name': result_guksa_name,
            'equip_list': [
                {
                    'sector': result.sector,
                    'equip_id': result.equip_id,
                    'equip_name': result.equip_name,
                    # 타입 체크하여 안전하게 처리
                    'occur_datetime': result.occur_datetime.isoformat() if hasattr(result.occur_datetime, 'isoformat') else result.occur_datetime,
                    'alarm_message': result.alarm_message
                }
                for result in results
            ]
        }

        return jsonify(response_data)

    except Exception as e:
        print(f"Error retrieving equipment list: {e}")
        print(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@api_bp.route('/alarm_dashboard', methods=['POST'])
def alarm_dashboard():
    try:
        # POST 방식으로 받은 JSON 데이터 파싱
        data = request.get_json()

        guksa_id = data.get('guksa_id')
        sectors = data.get('sectors', [])  # 배열로 받음
        equip_name = data.get('equip_name')
        time_filter = data.get('timeFilter')

        print("alarm_dashboard 요청 파라미터:", data)  # 디버깅용

        # 기본 쿼리 객체 생성
        query = TblAlarmAllLast.query

        # 필터 조건 적용
        if guksa_id:
            query = query.filter(TblAlarmAllLast.guksa_id == str(guksa_id))
        if sectors and len(sectors) > 0:
            # 전체(all)가 아닌 경우에만 필터링
            if 'all' not in sectors:
                query = query.filter(TblAlarmAllLast.sector.in_(sectors))
        if equip_name:
            query = query.filter(TblAlarmAllLast.equip_name == equip_name)

        # 시간 필터 적용 (옵션) -------------------------------- 테스트용으로 일단 주석 처리, 나중에 해제
#         if time_filter:
#             minutes = int(time_filter)
#             time_threshold = datetime.now() - timedelta(minutes=minutes)
#             time_threshold_str = time_threshold.strftime("%Y-%m-%d %H:%M:%S")
#             query = query.filter(
#                 TblAlarmAllLast.occur_datetime >= time_threshold_str)

        # 정렬 기준: recover_datetime이 NULL이거나 빈 문자열인 항목 우선, 그 후 최근 발생 순
        query = query.order_by(
            func.coalesce(TblAlarmAllLast.recover_datetime,
                          '').asc(),  # NULL 또는 빈 문자열 우선
            desc(TblAlarmAllLast.occur_datetime)  # 최근 발생순
        )

        print("실행 쿼리:", str(query))  # SQL 쿼리 확인용

        # 데이터 조회 실행
        alarms = query.all()
        print(f"조회된 결과 개수: {len(alarms) if alarms else 0}")

        # 최근 경보 발생 시간 찾기
        recent_update_time = None
        if alarms and len(alarms) > 0:
            # 첫 번째 항목의 발생 시간 사용
            recent_update_time = str(
                alarms[0].occur_datetime) if alarms[0].occur_datetime else None

        # 데이터가 없는 경우
        if not alarms or len(alarms) == 0:
            print("조회된 결과가 없습니다.")
            return jsonify({
                'alarms': [],
                'recent_update_time': None
            })

        # 결과를 딕셔너리 목록으로 변환
        result = []
        for a in alarms:
            # NULL 값 방어적 처리
            recover_datetime_str = str(
                a.recover_datetime) if a.recover_datetime else None

            # 각 필드를 안전하게 처리하여 딕셔너리로 변환
            alarm_data = {
                'guksa_id': a.guksa_id or '',
                'guksa_name': a.guksa_name or '',
                'sector': a.sector or '',
                'equip_id': a.equip_id or '',
                'equip_type': a.equip_type or '',
                'equip_name': a.equip_name or '',
                'alarm_message': a.alarm_message or '',
                'alarm_grade': a.alarm_grade or '',
                'occur_datetime': str(a.occur_datetime) if a.occur_datetime else None,
                'fault_reason': a.fault_reason or '',
                'valid_yn': a.valid_yn or '',
                'insert_datetime': str(a.insert_datetime) if a.insert_datetime else None,
                'recover_datetime': recover_datetime_str
            }
            result.append(alarm_data)

        # 응답 데이터 구성
        response_data = {
            'alarms': result,
            'recent_update_time': recent_update_time
        }

        return jsonify(response_data)

    except Exception as e:
        print("경보 대시보드 데이터 조회 중 오류 발생:", str(e))
        traceback.print_exc()

        # 에러 발생 시 빈 응답 반환
        return jsonify({
            'alarms': [],
            'recent_update_time': None,
            'error': str(e)
        })


@api_bp.route('/check_data', methods=['GET'])
def check_data():
    try:
        # 테이블의 전체 레코드 수 확인
        count_query = db.session.query(
            func.count(TblAlarmAllLast.guksa_id)).scalar()

        # 최근 데이터 10개 가져오기
        recent_data = TblAlarmAllLast.query.order_by(
            desc(TblAlarmAllLast.occur_datetime)
        ).limit(10).all()

        # 결과를 JSON으로 반환
        result = {
            'total_count': count_query,
            'sample_data': [
                {
                    'guksa_id': item.guksa_id,
                    'sector': item.sector,
                    'equip_name': item.equip_name,
                    'occur_datetime': str(item.occur_datetime),
                    'recover_datetime': str(item.recover_datetime) if item.recover_datetime else None,
                    'valid_yn': item.valid_yn
                }
                for item in recent_data
            ]
        }

        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)})


# 장비 정보 가져오기
@api_bp.route('/equipment/<n>')
def get_equipment_details(n):
    """
    지정된 국사/장비 이름에 대한 상세 정보를 반환합니다.
    - 장비 목록
    - 경보 정보
    - 연결된 링크 정보
    """
    try:
        # 1. 해당 이름의 국사 찾기
        guksa = TblGuksa.query.filter(TblGuksa.guksa.like(f'%{n}%')).first()

        if not guksa:
            # 국사를 찾을 수 없는 경우, 장비 이름으로 검색
            equipment = TblEquipment.query.filter(
                TblEquipment.equip_name.like(f'%{n}%')).first()
            if equipment:
                guksa = TblGuksa.query.filter_by(
                    guksa_id=equipment.guksa_id).first()

            if not guksa:
                return jsonify({"error": "해당 국사 또는 장비를 찾을 수 없습니다"}), 404

        # 2. 해당 국사의 장비 목록 가져오기
        equipments = TblEquipment.query.filter_by(
            guksa_id=guksa.guksa_id).all()
        equipment_list = []

        for eq in equipments:
            eq_data = {
                "equip_id": eq.equip_id,
                "equip_name": eq.equip_name,
                "equip_type": eq.equip_type,
                "equip_model": eq.equip_model,
                "sector": eq.sector,
                "ip_address": getattr(eq, 'ip_address', None),
            }
            equipment_list.append(eq_data)

        # 3. 관련 알람 정보 가져오기 (최근 20개)
        alarms = (
            TblAlarmAllLast.query
            .filter(TblAlarmAllLast.guksa_id == str(guksa.guksa_id))
            .order_by(TblAlarmAllLast.occur_datetime.desc())
            .limit(20)
            .all()
        )

        alarm_list = []
        for alarm in alarms:
            alarm_data = {
                "sector": alarm.sector,
                "alarm_grade": alarm.alarm_grade,
                "valid_yn": alarm.valid_yn,
                "equip_name": alarm.equip_name,
                "occur_datetime": str(alarm.occur_datetime) if alarm.occur_datetime else None,
                "recover_datetime": str(alarm.recover_datetime) if hasattr(alarm, 'recover_datetime') and alarm.recover_datetime else None,
                "alarm_message": alarm.alarm_message,
                "fault_reason": alarm.fault_reason,
            }
            alarm_list.append(alarm_data)

        # 4. 연결된 링크 정보 가져오기
        links = db.session.query(TblLink).filter(
            (TblLink.local_guksa_name == guksa.guksa_t) |
            (TblLink.remote_guksa_name == guksa.guksa_t)
        ).all()

        link_list = []
        for link in links:
            link_data = {
                "link_id": link.id,
                "local_guksa": link.local_guksa_name,
                "remote_guksa": link.remote_guksa_name,
                "link_type": link.link_type,
                "updown_type": link.updown_type,
                "link_name": link.link_name if hasattr(link, 'link_name') else None
            }
            link_list.append(link_data)

        # 5. 응답 데이터 구성
        response_data = {
            "guksa_id": guksa.guksa_id,
            "guksa_name": guksa.guksa,
            "operation_depart": guksa.operation_depart if hasattr(guksa, 'operation_depart') else None,
            "equipments": equipment_list,
            "alarms": alarm_list,
            "links": link_list
        }

        return jsonify(response_data)

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# 전체 네트워크 맵 데이터
@api_bp.route('/network_map')
def get_network_map():
    """
    전체 네트워크 맵을 구성하기 위한 노드와 링크 데이터를 제공합니다.
    선택적으로 특정 국사 ID 또는 장비 ID에 대한 필터링을 지원합니다.
    """
    try:
        # 요청 파라미터
        guksa_id = request.args.get('guksa_id')
        equip_id = request.args.get('equip_id')
        sector = request.args.get('sector')

        # 1. 기본 쿼리 - 모든 국사 정보 가져오기
        guksa_query = db.session.query(TblGuksa)

        # 필터링 적용
        if guksa_id:
            guksa_query = guksa_query.filter(TblGuksa.guksa_id == guksa_id)

        # 국사 정보 조회
        guksas = guksa_query.all()

        if not guksas:
            return jsonify({"error": "해당 조건의 국사가 없습니다."}), 404

        # 2. 노드 데이터 구성
        nodes = []
        guksa_ids = []

        for guksa in guksas:
            guksa_ids.append(guksa.guksa_id)

            # 해당 국사의 장비 분야 확인 (대표 색상 결정)
            equipments = TblEquipment.query.filter_by(
                guksa_id=guksa.guksa_id).all()

            # 분야별 장비 수 카운트
            sector_counts = {}
            for eq in equipments:
                if eq.sector:
                    sector_counts[eq.sector] = sector_counts.get(
                        eq.sector, 0) + 1

            # 가장 많은 장비가 있는 분야 선택
            main_sector = max(sector_counts.items(), key=lambda x: x[1])[
                0] if sector_counts else 'default'

            # 국사 노드 데이터 구성
            node = {
                "id": guksa.guksa_id,
                "label": guksa.guksa,
                "type": "guksa",
                "field": main_sector,
                "equipment_count": len(equipments)
            }
            nodes.append(node)

            # 특정 국사의 장비만 노드로 추가 (옵션)
            if equip_id or guksa_id:
                equip_query = TblEquipment.query.filter_by(
                    guksa_id=guksa.guksa_id)

                if equip_id:
                    equip_query = equip_query.filter(
                        TblEquipment.id == equip_id)

                if sector:
                    equip_query = equip_query.filter(
                        TblEquipment.sector == sector)

                equip_nodes = equip_query.all()

                for eq in equip_nodes:
                    equip_node = {
                        "id": f"e{eq.id}",  # 장비 ID가 국사 ID와 겹치지 않도록 접두어 추가
                        "label": eq.equip_name,
                        "type": "equipment",
                        "field": eq.sector,
                        "parent": guksa.guksa_id,
                        "equip_model": eq.equip_model
                    }
                    nodes.append(equip_node)

        # 3. 링크 데이터 구성
        links_query = db.session.query(TblLink)

        if guksa_id:
            # 특정 국사와 연결된 링크만 가져오기
            guksa_obj = TblGuksa.query.filter_by(guksa_id=guksa_id).first()
            if guksa_obj:
                links_query = links_query.filter(
                    (TblLink.local_guksa_name == guksa_obj.guksa_t) |
                    (TblLink.remote_guksa_name == guksa_obj.guksa_t)
                )

        links_data = links_query.all()

        # 링크 데이터 변환
        edges = []

        for link in links_data:
            # 로컬 국사 ID 찾기
            local_guksa = TblGuksa.query.filter_by(
                guksa_t=link.local_guksa_name).first()
            remote_guksa = TblGuksa.query.filter_by(
                guksa=link.remote_guksa_name).first()

            if local_guksa and remote_guksa:
                edge = {
                    "id": link.id,
                    "from": local_guksa.guksa_id,
                    "to": remote_guksa.guksa_id,
                    "type": link.link_type,
                    "updown": link.updown_type,
                    "link_name": link.link_name if hasattr(link, 'link_name') else None
                }
                edges.append(edge)

        # 4. 전체 네트워크 맵 데이터 반환
        response_data = {
            "nodes": nodes,
            "edges": edges,
            "filtered": {
                "guksa_id": guksa_id,
                "equip_id": equip_id,
                "sector": sector
            }
        }

        return jsonify(response_data)

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# 분야(sector)에 따른 장비 목록
@api_bp.route('/equipment_by_sector', methods=['POST'])
def equipment_by_sector():
    """
    분야(sector)에 따른 장비 목록을 가져오는 API
    요청 파라미터:
    - sector: 분야 (IP, 선로, 무선, 교환, 전송, MW)
    - guksa_id: (선택적) 특정 국사 ID
    """
    try:
        data = request.get_json()
        sector = data.get('sector')
        guksa_id = data.get('guksa_id')

        print(f"분야별 장비 요청: 분야={sector}, 국사ID={guksa_id}")

        if not sector:
            return jsonify({"error": "분야(sector)는 필수 파라미터입니다."}), 400

        # 기본 쿼리 생성 - 고유한 장비 정보만 추출
        query = (
            db.session.query(
                TblAlarmAllLast.equip_id,
                TblAlarmAllLast.equip_name
            )
            .filter(TblAlarmAllLast.sector == sector)
            .distinct()
        )

        # 국사 ID가 제공된 경우 추가 필터링
        if guksa_id:
            query = query.filter(TblAlarmAllLast.guksa_id == str(guksa_id))

        # 장비 이름으로 정렬
        query = query.order_by(TblAlarmAllLast.equip_name)

        # 쿼리 실행 및 결과 가져오기
        results = query.all()

        # 결과 변환
        equipment_list = []
        for result in results:
            # result.equip_name이 None이거나 빈 문자열인 경우 result.equip_id 사용
            equip_name = result.equip_name if result.equip_name else result.equip_id

            equipment_list.append({
                "equip_id": result.equip_id,
                "equip_name": equip_name
            })

#             print("equip_id: ",  result.equip_id)
#             print("equip_name: ", result.equip_name)

        print(f"조회된 장비 수: {len(equipment_list)}")
        return jsonify(equipment_list)

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@api_bp.route('/get_equipment_data', methods=['POST'])
def get_equipment_data():
    """
    장비 데이터 조회 API
    JavaScript에서 호출하는 엔드포인트
    """
    try:
        # POST 방식으로 받은 JSON 데이터 파싱
        data = request.get_json()

        sector = data.get('sector', 'all')

        print("get_equipment_data 요청 파라미터:", data)  # 디버깅용

        # 기본 쿼리 객체 생성 - TblEquipment 테이블에서 장비 정보 조회
        query = TblEquipment.query

        # 섹터 필터 적용
        if sector and sector != 'all':
            query = query.filter(TblEquipment.sector == sector)

        # 데이터 조회 실행
        equipments = query.all()
        print(f"조회된 장비 개수: {len(equipments) if equipments else 0}")

        # 데이터가 없는 경우
        if not equipments or len(equipments) == 0:
            print("조회된 장비가 없습니다.")
            return jsonify({
                'equipments': []
            })

        # 결과를 딕셔너리 목록으로 변환
        result = []
        for equip in equipments:
            # 국사 정보 조회
            guksa = TblGuksa.query.filter_by(guksa_id=equip.guksa_id).first()
            guksa_name = guksa.guksa if guksa else ''

            equipment_data = {
                'id': equip.id or '',  # JavaScript에서 필요한 id 필드 추가
                'equip_id': equip.equip_id or '',
                # equip_name이 없으면 equip_id 사용
                'equip_name': equip.equip_name or equip.equip_id or '',
                'equip_type': equip.equip_type or '',
                'sector': equip.sector or '',
                'equip_field': equip.sector or '',  # JavaScript에서 사용하는 equip_field 추가
                'guksa_id': equip.guksa_id or '',
                'equip_model': equip.equip_model or '',
                'guksa_name': guksa_name
            }
            result.append(equipment_data)

        # 응답 데이터 구성
        response_data = {
            'equipments': result
        }

        return jsonify(response_data)

    except Exception as e:
        print("장비 데이터 조회 중 오류 발생:", str(e))
        traceback.print_exc()

        # 에러 발생 시 빈 응답 반환
        return jsonify({
            'equipments': [],
            'error': str(e)
        })


@api_bp.route('/get_guksa_data', methods=['POST'])
def get_guksa_data():
    """
    국사 데이터 조회 API
    JavaScript에서 호출하는 엔드포인트
    """
    try:
        # POST 방식으로 받은 JSON 데이터 파싱
        data = request.get_json()

        print("get_guksa_data 요청 파라미터:", data)  # 디버깅용

        # 국사 데이터 조회
        guksas = TblGuksa.query.all()
        print(f"조회된 국사 개수: {len(guksas) if guksas else 0}")

        # 데이터가 없는 경우
        if not guksas or len(guksas) == 0:
            print("조회된 국사가 없습니다.")
            return jsonify({
                'guksas': []
            })

        # 결과를 딕셔너리 목록으로 변환
        result = []
        for guksa in guksas:
            # 국사명 결정 로직
            if guksa.is_mokuk == 1 or guksa.is_mokuk == "1":
                guksa_name = guksa.guksa or ''
            else:
                # guksa_t 값이 있으면 사용, 없으면 guksa_e 사용, 둘 다 없으면 guksa 사용
                if hasattr(guksa, 'guksa_t') and guksa.guksa_t:
                    guksa_name = guksa.guksa_t
                elif hasattr(guksa, 'guksa_e') and guksa.guksa_e:
                    guksa_name = guksa.guksa_e
                else:
                    guksa_name = guksa.guksa or ''

            guksa_data = {
                'id': guksa.guksa_id or '',  # JavaScript에서 필요한 id 필드 추가
                'guksa_id': guksa.guksa_id or '',
                'guksa': guksa.guksa or '',  # 원본 guksa 필드도 유지
                'guksa_t': guksa.guksa_t or '',
                'guksa_e': guksa.guksa_e or '',

                'is_mokuk': guksa.is_mokuk or 0
            }
            result.append(guksa_data)

        # 응답 데이터 구성
        response_data = {
            'guksas': result
        }

        return jsonify(response_data)

    except Exception as e:
        print("국사 데이터 조회 중 오류 발생:", str(e))
        traceback.print_exc()

        # 에러 발생 시 빈 응답 반환
        return jsonify({
            'guksas': [],
            'error': str(e)
        })


@api_bp.route('/guksa_list', methods=['GET'])
def get_guksa_list():
    try:
        guksas = TblGuksa.query.all()
        guksa_list = []

        for guksa in guksas:
            is_mokuk = getattr(guksa, 'is_mokuk', 0)

            if is_mokuk == 1:
                guksa_name = getattr(guksa, 'guksa', None)
                if not guksa_name:
                    continue
                guksa_type = "모국"
            else:
                # 자국 처리: 이름이 하나라도 없으면 생략
                if hasattr(guksa, 'guksa_t') and guksa.guksa_t:
                    guksa_name = guksa.guksa_t
                elif hasattr(guksa, 'guksa_e') and guksa.guksa_e:
                    guksa_name = guksa.guksa_e
                else:
                    continue
                guksa_type = "자국"

            guksa_list.append({
                "guksa_id": guksa.guksa_id,
                "guksa_name": guksa_name,
                "guksa_type": guksa_type,
                "is_mokuk": is_mokuk
            })

        # ✅ 자국만 존재하더라도 가나다순 정렬되도록 통합 정렬
        guksa_list.sort(key=lambda x: (
            0 if x["is_mokuk"] == 1 else 1, x["guksa_name"]))

        # 불필요한 내부 필드 제거
        for g in guksa_list:
            g.pop("is_mokuk", None)

        return jsonify(guksa_list)

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@api_bp.route('/get_alarm_data', methods=['POST'])
def get_alarm_data():
    """
    알람 데이터 조회 API
    JavaScript에서 호출하는 엔드포인트
    """
    try:
        # POST 방식으로 받은 JSON 데이터 파싱
        data = request.get_json()

        time_filter = data.get('time_filter')
        max_count = data.get('max_count', 10000)

        print("get_alarm_data 요청 파라미터:", data)  # 디버깅용

        # 기본 쿼리 객체 생성
        query = TblAlarmAllLast.query

#         # 시간 필터 적용 (옵션) ############## TO DO: 추후 사용 예정
#         if time_filter:
#             try:
#                 minutes = int(time_filter)
#                 time_threshold = datetime.now() - timedelta(minutes=minutes)
#                 time_threshold_str = time_threshold.strftime(
#                     "%Y-%m-%d %H:%M:%S")
#                 query = query.filter(
#                     TblAlarmAllLast.occur_datetime >= time_threshold_str)
#             except (ValueError, TypeError):
#                 print(f"잘못된 time_filter 값: {time_filter}")

        # 정렬 기준: recover_datetime이 NULL이거나 빈 문자열인 항목 우선, 그 후 최근 발생 순
        query = query.order_by(
            func.coalesce(TblAlarmAllLast.recover_datetime,
                          '').asc(),  # NULL 또는 빈 문자열 우선
            desc(TblAlarmAllLast.occur_datetime)  # 최근 발생순
        )

        # 최대 개수 제한
        if max_count:
            query = query.limit(max_count)

        print("실행 쿼리:", str(query))  # SQL 쿼리 확인용

        # 데이터 조회 실행
        alarms = query.all()
        print(f"조회된 결과 개수: {len(alarms) if alarms else 0}")

        # 데이터가 없는 경우
        if not alarms or len(alarms) == 0:
            print("조회된 결과가 없습니다.")
            return jsonify({
                'alarms': []
            })

        # 결과를 딕셔너리 목록으로 변환
        result = []
        for a in alarms:
            # NULL 값 방어적 처리
            recover_datetime_str = str(
                a.recover_datetime) if a.recover_datetime else None

            # 각 필드를 안전하게 처리하여 딕셔너리로 변환
            alarm_data = {
                'guksa_id': a.guksa_id or '',
                'guksa_name': a.guksa_name or '',
                'sector': a.sector or '',
                'equip_id': a.equip_id or '',
                'equip_type': a.equip_type or '',
                'equip_name': a.equip_name or '',
                'alarm_message': a.alarm_message or '',
                'alarm_grade': a.alarm_grade or '',
                'occur_datetime': str(a.occur_datetime) if a.occur_datetime else None,
                'fault_reason': a.fault_reason or '',
                'valid_yn': a.valid_yn or '',
                'insert_datetime': str(a.insert_datetime) if a.insert_datetime else None,
                'recover_datetime': recover_datetime_str
            }
            result.append(alarm_data)

        # 응답 데이터 구성
        response_data = {
            'alarms': result
        }

        return jsonify(response_data)

    except Exception as e:
        print("알람 데이터 조회 중 오류 발생:", str(e))
        traceback.print_exc()

        # 에러 발생 시 빈 응답 반환
        return jsonify({
            'alarms': [],
            'error': str(e)
        })

# 메인 라우트 함수


@api_bp.route('/alarm_dashboard_equip', methods=['POST'])
def alarm_dashboard_equip():
    """POST 방식으로 받은 JSON 데이터 파싱"""
    print(f"🚀🚀🚀🚀🚀 [NEW VERSION] alarm_dashboard_equip API 호출!!!")
    print(f"🚀🚀🚀🚀🚀 [NEW VERSION] 요청 메소드: {request.method}")
    print(f"🚀🚀🚀🚀🚀 [NEW VERSION] Content-Type: {request.content_type}")

    try:
        data = request.get_json()
        print(f"🚀🚀🚀🚀🚀 [NEW VERSION] 받은 JSON 데이터: {data}")

        if not data:
            return jsonify({"error": "JSON 데이터가 필요합니다"}), 400

        equip_id = data.get('equip_id')
        guksa_name = data.get('guksa_name')

        print(
            f"🚀🚀🚀🚀🚀 [NEW VERSION] 요청 파라미터: equip_id={equip_id}, guksa_name={guksa_name}")

        if not equip_id:
            return jsonify({"error": "equip_id가 필요합니다"}), 400

        # 1. 국사명이 없으면 알람 데이터에서 추출
        if not guksa_name:
            print(f"[DEBUG] 국사명이 없어서 알람 데이터에서 추출 시도")
            alarm = TblAlarmAllLast.query.filter_by(equip_id=equip_id).first()
            if alarm:
                guksa_name = alarm.guksa_name
                print(f"[DEBUG] 알람에서 국사명 추출: {guksa_name}")
            else:
                print(f"[DEBUG] 알람 데이터에서 국사명을 찾을 수 없음")
                return jsonify({"error": "국사명을 찾을 수 없습니다"}), 400

        # 2. 국사별 링크 맵 로딩
        link_map = load_links_by_guksa(guksa_name)

        # 3. 연결된 장비 탐색
        connected_links = find_all_connected_equip(equip_id, link_map)

        print(f"[DEBUG] 연결된 링크 수: {len(connected_links)}")

        # 4. 연결된 장비가 없는 경우 중앙 노드만 반환
        if not connected_links:
            print(f"[DEBUG] 연결된 장비가 없음. 중앙 노드만 반환")

            # 알람 데이터에서 중앙 노드 정보 조회
            alarm = TblAlarmAllLast.query.filter_by(equip_id=equip_id).first()
            if not alarm:
                return jsonify({"error": "알람 데이터를 찾을 수 없습니다"}), 404

            single_equipment = {
                equip_id: {
                    "id": 1,
                    "equip_id": equip_id,
                    "equip_type": alarm.equip_type or "UNKNOWN",
                    "equip_name": alarm.equip_name or equip_id,
                    "equip_field": alarm.sector or "UNKNOWN",
                    "guksa_name": guksa_name or "UNKNOWN",
                    "up_down": "center"  # 중앙 노드 표시
                }
            }

            return jsonify({
                "equipment": single_equipment,
                "links": [],
                "message": "연결된 장비가 없습니다. 중앙 노드만 표시됩니다."
            })

        # 5. 연결된 장비들의 정보 수집
        equipment_dict = {}
        link_list = []

        # 중앙 노드 추가
        alarm = TblAlarmAllLast.query.filter_by(equip_id=equip_id).first()
        if alarm:
            equipment_dict[equip_id] = {
                "id": 1,
                "equip_id": equip_id,
                "equip_type": alarm.equip_type or "UNKNOWN",
                "equip_name": alarm.equip_name or equip_id,
                "equip_field": alarm.sector or "UNKNOWN",
                "guksa_name": guksa_name or "UNKNOWN",
                "up_down": "center"  # 중앙 노드
            }

        # 연결된 장비들 추가
        equipment_ids = set()
        for link_key, link_info in connected_links.items():
            source_id = link_info['source']
            target_id = link_info['target']
            up_down = link_info['up_down']

            equipment_ids.add(source_id)
            equipment_ids.add(target_id)

            print(
                f"[DEBUG] 링크에서 장비 추가: {source_id} -> {target_id} (up_down: {up_down})")

            # 링크 정보 추가
            link_list.append(link_key)

        print(f"[DEBUG] 연결 링크에서 추출된 장비 ID 목록: {list(equipment_ids)}")

        # 장비 정보 조회 및 추가
        for eq_id in equipment_ids:
            if eq_id not in equipment_dict:
                print(f"[DEBUG] 장비 정보 조회 중: {eq_id}")
                # TblSubLink에서 장비 정보 조회
                link_info = TblSubLink.query.filter(
                    or_(TblSubLink.equip_id == eq_id,
                        TblSubLink.link_equip_id == eq_id)
                ).first()

                if link_info:
                    # 해당 장비가 source인지 target인지 확인하여 정보 설정
                    if link_info.equip_id == eq_id:
                        equipment_dict[eq_id] = {
                            "id": len(equipment_dict) + 1,
                            "equip_id": eq_id,
                            "equip_type": link_info.equip_type or "UNKNOWN",
                            "equip_name": link_info.equip_name or eq_id,
                            "equip_field": link_info.equip_field or "UNKNOWN",
                            "guksa_name": link_info.guksa_name or "UNKNOWN",
                            "up_down": link_info.up_down or "unknown"
                        }
                        print(
                            f"[DEBUG] 장비 정보 추가 (source): {eq_id} -> {equipment_dict[eq_id]}")
                    else:
                        equipment_dict[eq_id] = {
                            "id": len(equipment_dict) + 1,
                            "equip_id": eq_id,
                            "equip_type": link_info.link_equip_type or "UNKNOWN",
                            "equip_name": link_info.link_equip_name or eq_id,
                            "equip_field": link_info.link_equip_field or "UNKNOWN",
                            "guksa_name": link_info.link_guksa_name or "UNKNOWN",
                            "up_down": "down" if link_info.up_down == "up" else "up"  # 반대 관계
                        }
                        print(
                            f"[DEBUG] 장비 정보 추가 (target): {eq_id} -> {equipment_dict[eq_id]}")
                else:
                    print(f"[DEBUG] 장비 정보를 찾을 수 없음: {eq_id}")

        print(f"[DEBUG] 최종 장비 목록:")
        for eq_id, eq_info in equipment_dict.items():
            print(
                f"[DEBUG]   {eq_id}: {eq_info['equip_name']} (up_down: {eq_info.get('up_down', 'unknown')})")

        return jsonify({
            "equipment": equipment_dict,
            "links": link_list
        })

    except Exception as e:
        print(f"[ERROR] alarm_dashboard_equip 오류: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"서버 오류: {str(e)}"}), 500


# 분야 필터링 적용 함수
def apply_sector_filter(equipment_dict, links, sectors):
    sector_filter = None
    if sectors and sectors != 'all':
        if isinstance(sectors, list) and 'all' not in sectors:
            sector_filter = sectors
        elif isinstance(sectors, str) and sectors != 'all':
            sector_filter = [sectors]

    # 분야 필터링 적용 (선택적)
    if sector_filter:
        print(f"분야 필터링 적용: {sector_filter}")
        # 필터링된 장비 ID 목록
        filtered_equip_ids = {
            equip_id for equip_id, equip in equipment_dict.items()
            if equip['equip_field'] in sector_filter
        }

        # 필터링된 장비만 포함하는 링크 필터링
        filtered_links = []
        for link in links:
            if link['source'] in filtered_equip_ids or link['target'] in filtered_equip_ids:
                filtered_links.append(link)

        # 필터링된 링크에 포함된 모든 장비 ID 수집
        all_connected_ids = set()
        for link in filtered_links:
            all_connected_ids.add(link['source'])
            all_connected_ids.add(link['target'])

        # 필터링된 장비 목록
        filtered_equipment = [
            equip for equip_id, equip in equipment_dict.items()
            if equip_id in all_connected_ids
        ]

        return filtered_equipment, filtered_links
    else:
        # 필터링 없이 모든 장비 사용
        return list(equipment_dict.values()), links


# 국사 정보 조회 함수: 국사 정보 조회
def get_guksa_info(guksa_id):
    if not guksa_id:
        return None, "def get_guksa_info >> guksa_id가 없습니다."

    str_guksa_id = str(guksa_id).strip()

    try:
        guksa_info = db.session.query(TblGuksa).filter(
            TblGuksa.guksa_id == str_guksa_id).first()
        if guksa_info:
            # is_mokuk이 1 또는 "1"인 경우 guksa_info.guksa 사용
            if guksa_info.is_mokuk == 1 or guksa_info.is_mokuk == "1":
                return guksa_info, guksa_info.guksa
            else:
                # guksa_t 값이 있으면 사용, 없으면 guksa_e 사용
                if hasattr(guksa_info, 'guksa_t') and guksa_info.guksa_t:
                    return guksa_info, guksa_info.guksa_t
                elif hasattr(guksa_info, 'guksa_e') and guksa_info.guksa_e:
                    return guksa_info, guksa_info.guksa_e
                else:
                    # 둘 다 없는 경우 기본값으로 guksa 사용
                    return guksa_info, guksa_info.guksa
        else:
            return None, f"국사 {str_guksa_id}"
    except Exception as e:
        print(f"국사 정보 조회 중 오류 발생: {str(e)}")
        return None, f"국사 {str_guksa_id}"


# TblSubLink에서 국사명으로 전체 링크 정보 메모리 로딩
def load_links_by_guksa(guksa_name):
    """국사별 링크 정보를 로드 (중복 제거)"""
    print(f"[DEBUG] load_links_by_guksa 호출: guksa_name={guksa_name}")

    try:
        # TblSubLink에서 해당 국사의 모든 링크 조회
        links = TblSubLink.query.filter(
            or_(
                TblSubLink.guksa_name == guksa_name,
                TblSubLink.link_guksa_name == guksa_name
            )
        ).all()

        print(f"[DEBUG] TblSubLink에서 조회된 링크 수: {len(links)}")

        # 중복 제거를 위한 세트
        processed_pairs = set()
        link_map = {}

        for link in links:
            # 중복 링크 방지를 위한 유니크 키 생성 (장비 ID 정렬 + 링크명)
            equip_pair = tuple(sorted([link.equip_id, link.link_equip_id]))
            pair_key = f"{equip_pair[0]}:::{equip_pair[1]}:::{link.link_name}"

            # 이미 처리된 링크 쌍인지 확인
            if pair_key in processed_pairs:
                print(
                    f"[DEBUG] 중복 링크 제거: {link.equip_id} <-> {link.link_equip_id} ({link.link_name})")
                continue

            # 처리된 링크 쌍으로 표시
            processed_pairs.add(pair_key)

            print(
                f"[DEBUG] 링크 처리: {link.equip_id} -> {link.link_equip_id}, up_down: {link.up_down}")

            # 양방향 링크 생성 (중복 제거 후)
            if link.equip_id not in link_map:
                link_map[link.equip_id] = []
            if link.link_equip_id not in link_map:
                link_map[link.link_equip_id] = []

            # 원본 방향
            link_map[link.equip_id].append({
                'target_equip_id': link.link_equip_id,
                'up_down': link.up_down,
                'link_name': link.link_name
            })
            print(
                f"[DEBUG] 원본 방향 추가: {link.equip_id} -> {link.link_equip_id} (up_down: {link.up_down})")

            # 역방향 (up_down 반대로)
            reverse_up_down = 'down' if link.up_down == 'up' else 'up'
            link_map[link.link_equip_id].append({
                'target_equip_id': link.equip_id,
                'up_down': reverse_up_down,
                'link_name': link.link_name
            })
            print(
                f"[DEBUG] 역방향 추가: {link.link_equip_id} -> {link.equip_id} (up_down: {reverse_up_down})")

        print(f"[DEBUG] 중복 제거 후 링크 쌍 수: {len(processed_pairs)}")
        print(f"[DEBUG] 생성된 link_map 키 수: {len(link_map)}")

        for equip_id, connections in link_map.items():
            print(f"[DEBUG] {equip_id}: {len(connections)}개 연결")
            for conn in connections:
                print(
                    f"[DEBUG]   -> {conn['target_equip_id']} (up_down: {conn['up_down']})")

        return link_map

    except Exception as e:
        print(f"[ERROR] load_links_by_guksa 오류: {str(e)}")
        return {}


# 모든 상/하위 장비 찾기: 장비 ID로 연결된 모든 장비들을 재귀적으로 찾기
# (load_links_by_guksa에서 link_map에 중복 이미 제거됨)
def find_all_connected_equip(equip_id, link_map):
    try:
        print(
            f"[DEBUG] find_all_connected_equip 호출: equip_id={equip_id} (중앙노드)")

        result = {}
        visited = set()  # 중복 방문 방지

        # 재귀적으로 연결된 장비들 탐색
        def traverse_connections(current_equip_id, depth=0, parent_equip_id=None):
            # 무한 루프 방지 (최대 50까지 링크 정보 탐색)
            if current_equip_id in visited or depth > 50:
                return

            visited.add(current_equip_id)

            if current_equip_id in link_map:
                connections = link_map[current_equip_id]
                print(
                    f"[DEBUG] {current_equip_id}의 연결 수: {len(connections)} (깊이: {depth})")

                for connection in connections:
                    target_equip_id = connection['target_equip_id']
                    up_down = connection['up_down']
                    link_name = connection['link_name']

                    # 부모 노드로의 역방향 연결은 건너뛰기 (무한 루프 방지)
                    if target_equip_id == parent_equip_id:
                        print(
                            f"[DEBUG] 부모 노드로의 역방향 연결 건너뛰기: {current_equip_id} -> {target_equip_id}")
                        continue

                    print(
                        f"[DEBUG] 연결 처리: {current_equip_id} -> {target_equip_id}, up_down: {up_down}, link: {link_name}")

                    # 중앙 노드를 기준으로 한 up_down 결정
                    if depth == 0:
                        # 중앙 노드에서 직접 연결된 경우
                        final_up_down = up_down
                    else:
                        # 재귀적으로 찾은 경우 (depth > 0)
                        # 중앙 노드로부터의 방향성을 유지
                        final_up_down = up_down

                    # 링크 키 생성 (source:::target:::link_name:::up_down 형식)
                    link_key = f"{current_equip_id}:::{target_equip_id}:::{link_name}:::{final_up_down}"

                    # 이미 같은 링크가 있는지 확인 (다른 방향으로)
                    reverse_key = f"{target_equip_id}:::{current_equip_id}:::{link_name}:::"
                    reverse_found = False
                    for existing_key in result.keys():
                        if existing_key.startswith(reverse_key):
                            print(f"[DEBUG] 역방향 링크 이미 존재, 건너뛰기: {link_key}")
                            reverse_found = True
                            break

                    if not reverse_found:
                        result[link_key] = {
                            'source': current_equip_id,
                            'target': target_equip_id,
                            'link_name': link_name,
                            'up_down': final_up_down
                        }

                    # 재귀적으로 하위 노드들 탐색 (현재 노드를 부모로 전달)
                    traverse_connections(
                        target_equip_id, depth + 1, current_equip_id)

        # 시작 장비부터 재귀 탐색 시작
        traverse_connections(equip_id)

        print(
            f"[DEBUG] find_all_connected_equip 결과: {len(result)}개 연결된 링크 (방문한 노드: {len(visited)}개)")

        # 결과 확인을 위한 로그
        if len(result) > 0:
            print(f"[DEBUG] 최종 링크 목록:")
            for key, value in result.items():
                print(f"  - {key}")

        return result

    except Exception as e:
        print(f"[ERROR] find_all_connected_equip 오류: {str(e)}")
        import traceback
        traceback.print_exc()
        return {}


# 장비 경보 정보 조회
def get_equip_info_from_alarm_all_last(equip_id):
    try:
        # 데이터베이스에서 장비 정보 조회
        alarm_all_last = TblAlarmAllLast.query.filter_by(
            equip_id=equip_id).first()

        if alarm_all_last:
            return {
                'equip_id': alarm_all_last.equip_id,
                'equip_name': alarm_all_last.equip_name,
                'equip_type': alarm_all_last.sector,
                'guksa_id': alarm_all_last.guksa_id,
                'ip_address': getattr(alarm_all_last, 'ip_address', None)
            }

        return None

    except Exception as e:
        print(f"장비 정보 조회 오류: {str(e)}")
        return None


def get_current_time():
    now = datetime.now()
    return now.strftime("%Y-%m-%d %H:%M:%S")


# MW 장비 상태 확인 API: 소켓 서버를 통해 MW 장비의 SNMP 상태를 확인
@api_bp.route("/check_mw_status", methods=["POST"])
def check_mw_status():
    try:
        # 요청 데이터 검증
        if not request.is_json:
            return jsonify({
                'success': False,
                'error': 'Content-Type이 application/json이어야 합니다.'
            }), 400

        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': '요청 데이터가 없습니다.'
            }), 400

        guksa_id = data.get('guksa_id')
        equipment_list = data.get('data', [])

        if not equipment_list:
            return jsonify({
                'success': False,
                'error': 'MW 장비 데이터가 없습니다.'
            }), 400

        logging.info(
            f"MW 상태 확인 요청: 국사={guksa_id}, 장비 수={len(equipment_list)}개")

        # 소켓 서버로 요청
        payload = {
            "guksa_id": guksa_id,
            "data": equipment_list
        }

        try:
            # ZMQ 소켓 연결 및 요청
            context = zmq.Context()
            socket = context.socket(zmq.REQ)
            socket.connect(MW_SOCKET_SERVER)
            socket.setsockopt(zmq.RCVTIMEO, 60000)  # 60초 타임아웃

            # 요청 전송
            logging.debug(
                f"요청 JSON: {json.dumps(payload, ensure_ascii=False)}")
            socket.send_string(json.dumps(payload))
            logging.info(f"소켓 서버로 MW 상태 요청 전송: {len(equipment_list)}개 장비")

            # 응답 수신
            response_str = socket.recv_string()
            logging.debug(f"응답 JSON: {response_str}")
            socket.close()
            context.term()

            # JSON 파싱
            response_data = json.loads(response_str)
            logging.info(f"소켓 서버로부터 MW 상태 응답 수신 완료")

            return jsonify(response_data), 200

        except zmq.error.Again:
            logging.error("소켓 서버 응답 타임아웃")
            return jsonify({
                'success': False,
                'error': '소켓 서버 응답 타임아웃'
            }), 408

        except Exception as socket_error:
            logging.error(f"소켓 통신 오류: {str(socket_error)}")
            return jsonify({
                'success': False,
                'error': f'소켓 서버 통신 실패: {str(socket_error)}'
            }), 500

    except Exception as e:
        error_message = f"MW 상태 확인 중 오류 발생: {str(e)}"
        logging.error(error_message)
        logging.error(traceback.format_exc())

        return jsonify({
            'success': False,
            'error': error_message
        }), 500

# AI RAG 장애분석 팝업 API 엔드포인트 추가


@api_bp.route("/fault-detector", methods=["POST"])
def fault_detector_api():
    """AI RAG 장애분석을 위한 API 엔드포인트"""
    try:
        # POST 데이터 받기
        data = request.get_json()
        if not data:
            return jsonify({'error': '요청 데이터가 없습니다.'}), 400

        # 기본 노드와 경보 데이터 추출
        base_node = data.get('baseNode', {})
        alarms = data.get('alarms', [])

        # fault_data 구성
        fault_data = {
            'baseNode': base_node,
            'alarms': alarms,
            'alarm_count': len(alarms)
        }

        logging.info(
            f"AI RAG 장애분석 요청: 기준장비={base_node.get('equip_name', 'Unknown')}, 경보={len(alarms)}건")

        # HTML 템플릿 렌더링하여 반환
        return render_template('main/fault_detector.html',
                               equip_id=base_node.get('equip_id', '-'),
                               equip_name=base_node.get('equip_name', '-'),
                               sector=base_node.get('sector', ''),
                               guksa_name=base_node.get('guksa_name', '-'),
                               alarm_count=len(alarms),
                               fault_data=fault_data)

    except Exception as e:
        logging.error(f"AI RAG 장애분석 API 오류: {str(e)}")
        return jsonify({'error': f'서버 오류: {str(e)}'}), 500
