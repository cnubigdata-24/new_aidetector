from flask import request, jsonify
from flask import Blueprint, jsonify, request
from db.models import *
from db.models import db, TblAlarmAllLast

# from models import TblAlarmAllLast, db
# from sqlalchemy import desc, select

from .scripts.fault_prediction_core_4 import run_query
from .scripts.llm_loader_2 import initialize_llm, get_llm_pipeline

import subprocess
import json
import time

import hashlib
from flask import current_app
from datetime import datetime

# pip install puresnmp
import puresnmp

# pip install pyzmq
import zmq

import traceback
from flask import has_app_context

api_bp = Blueprint("api", __name__, url_prefix="/api")

MW_SOCKET_SERVER = "tcp://10.58.241.61:5555"
context = zmq.Context()
zmq_socket = context.socket(zmq.REQ)


def connect_zmq():
    try:
        zmq_socket.connect(MW_SOCKET_SERVER)
    except zmq.ZMQError as e:
        print("ZMQ 연결 실패:", str(e))


connect_zmq()


def send_zmq_request(payload):
    try:
        zmq_socket.send_string(payload)
        return zmq_socket.recv_string()
    except zmq.ZMQError:
        print("ZMQ 재연결 시도 중...")
        zmq_socket.disconnect(MW_SOCKET_SERVER)
        time.sleep(1)
        connect_zmq()
        zmq_socket.send_string(payload)
        return zmq_socket.recv_string()


@api_bp.route("/mw_info", methods=["POST"])
def get_mwinfo_snmp():
    guksa_id = request.json.get("guksa_id")
    if guksa_id is None:
        return jsonify({"error": "guksa_id is required"}), 400

    # 디버그 테스트용
    return jsonify({
        "response": {
            "results": [
                {
                    "국사ID": 10,
                    "국사명": "목포국사",
                    "장비ID": 1001,
                    "장비명": "MW장비1",
                    "장비유형": "MW",
                    "snmp수집": "성공",
                    "fading": "fading 발생",
                    "전원상태": "배터리 모드",
                    "수집일시": "2025-04-24 12:11:54"
                }
            ],
            "fading_count": 1,
            "fading_sample": "목포국사, MW장비1(MW) 등",
            "battery_mode_count": 1,
            "battery_sample": "목포국사, MW장비1(MW)"
        }
    })

    # 실제 코드
    # try:
    #     records = db.session.query(TblSnmpInfo).filter(TblSnmpInfo.guksa_id == guksa_id).all()
    #     if not records:
    #         return jsonify({"error": "No data found for guksa_id"}), 404

    #     snmp_data = [{
    #         "equip_id": r.equip_id,
    #         "equip_name": r.equip_name,
    #         "equip_type": r.equip_type,
    #         "snmp_ip": r.snmp_ip,
    #         "community": r.community,
    #         "port": r.port,
    #         "oid1": r.oid1,
    #         "oid2": r.oid2,
    #         "oid3": r.oid3
    #     } for r in records]

    #     payload = json.dumps({"guksa_id": guksa_id, "data": snmp_data})
    #     response = send_zmq_request(payload)

    #     result_list = []
    #     fading_count = 0
    #     battery_mode_count = 0

    #     fading_samples = []
    #     battery_samples = []

    #     guksa_name_cache = {}

    #     for item in json.loads(response):
    #         snmp_id = int(item["id"])
    #         result_code = item["result_code"]
    #         result_msg = item["result_msg"]
    #         get_dt = item["get_datetime"]

    #         snmp_record = db.session.query(TblSnmpInfo).filter(TblSnmpInfo.id == snmp_id).first()
    #         if not snmp_record:
    #             continue

    #         if result_code == "1":
    #             parsed_msg = json.loads(result_msg.replace("'", '"'))
    #             power = parsed_msg.get("power", "")
    #             fading = parsed_msg.get("fading", "")
    #         else:
    #             power = ""
    #             fading = ""

    #         snmp_record.result_code = result_code
    #         snmp_record.result_msg = result_msg
    #         snmp_record.power = power
    #         snmp_record.fading = fading
    #         snmp_record.get_datetime = get_dt

    #         if snmp_record.guksa_id not in guksa_name_cache:
    #             guksa = db.session.query(guksa).filter(guksa.guksa_id == snmp_record.guksa_id).first()
    #             guksa_name_cache[snmp_record.guksa_id] = guksa.guksa_name if guksa else "Unknown"

    #         guksa_name = guksa_name_cache[snmp_record.guksa_id]

    #         # 통계 수치 및 샘플 수집
    #         if fading == "1":
    #             fading_count += 1
    #             if len(fading_samples) < 1:
    #                 fading_samples.append(f"{guksa_name}, {snmp_record.equip_name}({snmp_record.equip_type})")

    #         if power == "1":
    #             battery_mode_count += 1
    #             if len(battery_samples) < 1:
    #                 battery_samples.append(f"{guksa_name}, {snmp_record.equip_name}({snmp_record.equip_type})")

    #         result_list.append({
    #             "국사ID": snmp_record.guksa_id,
    #             "국사명": guksa_name,
    #             "장비ID": snmp_record.equip_id,
    #             "장비명": snmp_record.equip_name,
    #             "장비유형": snmp_record.equip_type,
    #             "snmp수집": "성공" if result_code == "1" else "실패",
    #             "fading": "fading 발생" if fading == "1" else "정상",
    #             "전원상태": "배터리 모드" if power == "1" else "상전",
    #             "수집일시": get_dt
    #         })

    #     db.session.commit()

    #     return jsonify({
    #         "results": result_list,
    #         "fading_count": fading_count,
    #         "fading_sample": fading_samples[0] + " 등" if fading_count > 1 else (fading_samples[0] if fading_samples else ""),
    #         "battery_mode_count": battery_mode_count,
    #         "battery_sample": battery_samples[0] + " 등" if battery_mode_count > 1 else (battery_samples[0] if battery_samples else "")
    #     })

    # except Exception as e:
    #     db.session.rollback()
    #     return jsonify({"error": str(e)}), 500


@api_bp.route("/status")
def status():
    return jsonify({"status": "ok"})


@api_bp.route("/topology/<guksa_name>")
def get_topology(guksa_name):
    # 해당 국사 정보 조회
    guksa_obj = TblGuksa.query.filter_by(guksa=guksa_name).first()
    if not guksa_obj:
        return jsonify({"error": "guksa not found"}), 404

    # 해당 국사의 장비 목록 조회
    # print(guksa_obj)
    # equipments = TblEquipment.query.filter_by(guksa_name=guksa_obj.guksa_t).all()
    # center_equips = [
    #     f"{eq.sector}-{eq.equipment_name} ({eq.equipment_model})" for eq in equipments
    # ]

    # # 장비 현황 데이터
    # equipment_list = [
    #     {
    #         "equip_field": eq.sector,
    #         "equip_type": eq.equipment_type,
    #         "equip_model": eq.equipment_model,
    #         "equip_name": eq.equipment_name,
    #         # "equip_details": eq.equip_details,
    #     }
    #     for eq in equipments
    # ]
    # print(guksa_obj.guksa_t)

    # 토폴로지 데이터 조회
    # 특정 guksa_name으로 필터링하여 LEFT JOIN 쿼리 작성

    # TblGuksa에서 guksa_t 값들을 가져옵니다.
    guksa_values = db.session.query(TblGuksa.guksa_t).filter(
        TblGuksa.guksa == guksa_name).all()
    guksa_values = [guksa[0]
                    for guksa in guksa_values]  # 튜플 형태로 가져오므로 첫 번째 요소만 추출
    print(guksa_values)
    # TblLink에서 local_guksa_name이 guksa_values에 포함되는 것만 가져옵니다.
    links = db.session.query(TblLink).filter(
        TblLink.local_guksa_name.in_(guksa_values)).all()

    upper_links = []
    lower_links = []
    print(links)
    for link in links:
        # 연결된 국사의 장비 목록 조회
        remote_guksa = TblGuksa.query.filter_by(
            guksa=link.remote_guksa_name).first()
        remote_equipments = []
        if remote_guksa:
            remote_equips = TblEquipment.query.filter_by(
                guksa_id=remote_guksa.guksa_id
            ).all()
            remote_equipments = [
                f"{eq.equip_field}-{eq.equipment_name} ({eq.equip_model})"
                for eq in remote_equips
            ]

        link_data = {
            "remote_guksa_name": link.remote_guksa_name + '(' + link.remote_guksa_name + ')',
            "link_type": link.link_type,
            "remote_equipments": remote_equipments,
        }

        if link.updown_type == "상위국":
            upper_links.append(link_data)
        else:
            lower_links.append(link_data)

    # 국사 정보
    guksa_info = {
        "guksa_id": guksa_obj.guksa_id,
        "guksa_name": guksa_obj.guksa,
        # "guksa_type": guksa_obj.guksa_type,
        # "operation_depart": guksa_obj.operation_depart,
    }

    # # 경보 정보 조회 (최근 100개)
    # alarms = (
    #     TblAlarmAllLast.query.join(TblEquipment)
    #     .filter(TblEquipment.guksa_name == guksa_obj.guksa_t)
    #     .order_by(TblAlarmAllLast.occur_datetime.desc())  # 경보발생일시 기준 정렬
    #     .limit(100)
    #     .all()
    # )

    # alarm_list = []
    # for alarm in alarms:
    #     alarm_data = {
    #         "alarm_name": alarm.alarm_name,
    #         "alarm_message": alarm.alarm_message,
    #         "alarm_grade": alarm.alarm_grade,
    #         "alarm_type": alarm.alarm_type,
    #         "is_valid": alarm.is_valid,
    #         "alarm_date": alarm.occur_datetime,  # 경보발생일시 추가
    #         "recover_date": alarm.recover_date,  # 회복일시 추가
    #         "delay_minute": alarm.delay_minute,  # 지연시간 추가
    #         "equip": {
    #             "equip_field": alarm.equipment.equip_field,
    #             "equip_name": alarm.equipment.equipment_name,
    #         },
    #     }
    #     alarm_list.append(alarm_data)

    topology_data = {
        "center": guksa_name,
        # "center_equipments": center_equips,
        "upper": upper_links,
        "lower": lower_links,
        "guksa_info": guksa_info,
        # "equipments": equipment_list,  # 장비 현황 데이터 추가
        # "alarms": alarm_list,
    }

    return jsonify(topology_data)


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
        # LLM 초기화
        from .scripts.llm_loader_2 import (
            get_llm_pipeline,
            initialize_llm,
        )
        # 수정된 import 문 - execute_query 제거하고 필요한 함수만 import
        from .scripts.fault_prediction_core_4 import (
            set_guksa_id,
            run_query,  # 비동기 버전 함수 가져오기
            get_vector_db_collection,
            # execute_query 제거 - 개선된 코드에서는 사용하지 않음
        )
        from .scripts.llm_response_generator_3 import (
            analyze_query_type,
            generate_response_with_llm,
        )

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
            import logging
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
            except:
                response_text = "응답 처리 중 오류가 발생했습니다."

            return jsonify(
                {
                    "success": True,
                    "query": f"{query}",
                    "details": response_text,
                }
            )

    except Exception as e:
        import traceback
        import sys

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


@api_bp.route("/clear_conversation", methods=["POST"])
def clear_conversation():
    """사용자 대화 이력을 초기화하는 엔드포인트"""
    try:
        from .scripts.fault_prediction_core_4 import conversation_history

        # 요청에서 IP 주소 추출
        ip_address = request.remote_addr

        # IP 주소로 시작하는 모든 사용자 ID 찾기
        user_ids_to_clear = [
            uid
            for uid in conversation_history.keys()
            if uid.startswith(f"web_user_{ip_address}")
        ]

        # 해당 사용자 ID의 대화 기록 삭제
        for user_id in user_ids_to_clear:
            if user_id in conversation_history:
                del conversation_history[user_id]

        return jsonify({"success": True, "message": "대화 기록이 초기화되었습니다."})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@api_bp.route("/latest_alarms")
def get_latest_alarms():
    guksa_id = request.args.get("guksa_id")

    if not guksa_id:
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

    alarms = query.all()

    # 요청된 형식으로 알람 텍스트 구성
    alert_texts = []
    for alarm in alarms:
        if alarm.alarm_message:  # 메시지가 있는 경우만 포함
            alert_text = f"[{alarm.sector} 분야] {alarm.equip_type}, {alarm.equip_kind} 장비에서 {alarm.alarm_syslog_code}, {alarm.fault_reason}, {alarm.alarm_message}의 경보가 발생함"
            alert_texts.append(alert_text)

    # 전체 프롬프트 생성 및 JSON 응답 반환
    prompt = "\n".join(alert_texts)

    return jsonify({"alarms": prompt})

# @api_bp.route("/latest_alarms")
# def get_latest_alarms():
#     guksa_id = request.args.get("guksa_id")

#     query = (
#         db.session.query(TblAlarmAllLast.alarm_message, TblEquipment.equipment_name)
#         .join(TblEquipment, TblAlarmAllLast.equip_id == TblEquipment.id)
#     )

#     if guksa_id:
#         query = query.filter(TblAlarmAllLast.guksa_id == str(guksa_id))

#     alarms = (
#         query
#         .order_by(TblAlarmAllLast.occur_datetime.desc())
#         .limit(10)
#         .all()
#     )

#     alert_texts = [
#         f"{equipment_name} 장비에서 경보 발생: {alarm_message}"
#         for alarm_message, equipment_name in alarms
#         if alarm_message
#     ]

#     return jsonify({"alarms": "\n".join(alert_texts)})


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


@api_bp.route("/snmp_info", methods=["POST"])
def get_snmp_info_by_guksa():
    data = request.get_json()
    guksa_id = data.get("guksa_id")

    if not guksa_id:
        return jsonify({"message": "guksa_id 필요합니다."}), 400

    mw_equip_list = TblSnmpInfo.query.filter_by(guksa_id=guksa_id).all()

    if not mw_equip_list:
        return jsonify({"message": "해당 guksa_id 대한 장비 정보가 없습니다."}), 404

    power_down_devices = []  # oid1 == "3" → 정전 상태 (배터리 모드)
    modulation_mismatch = []  # oid2 != oid3 → 변조 방식 불일치 (=> 페이딩 추정)

    for mw_equip in mw_equip_list:
        oids = list(
            filter(None, [mw_equip.oid1, mw_equip.oid2, mw_equip.oid3]))
        snmp_start_time = get_current_time()

        snmp_result = get_multiple_snmp_values(
            ip=mw_equip.snmp_ip,
            community=mw_equip.community,
            oids=oids,
            port=mw_equip.port or 161,
        )

        val_oid1 = str(snmp_result.get(mw_equip.oid1)
                       ) if mw_equip.oid1 else None
        val_oid2 = str(snmp_result.get(mw_equip.oid2)
                       ) if mw_equip.oid2 else None
        val_oid3 = str(snmp_result.get(mw_equip.oid3)
                       ) if mw_equip.oid3 else None

        base_info = {
            "수집일시": snmp_start_time,
            "장비명": mw_equip.equip_name,
            "장비ID": mw_equip.equip_id,
            "장비유형": mw_equip.equip_type,
            "SNMP IP": mw_equip.snmp_ip,
            "포트": mw_equip.port,
            "oid1": val_oid1,
            "oid2": val_oid2,
            "oid3": val_oid3,
        }

        # 필터 1: oid1 == "3" (정전 상태 => 배터리 모드)
        if val_oid1 == "3":
            power_down_devices.append(base_info)

        # 필터 2: oid2 != oid3 (변조 방식 불일치 => 페이딩 추정)
        if val_oid2 is not None and val_oid3 is not None and val_oid2 != val_oid3:
            modulation_mismatch.append(base_info)

    result = {
        "정전_상태_장비": power_down_devices,
        "변조_방식_불일치_장비": modulation_mismatch,
    }

    return jsonify(result)


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
            # 해당 국사 ID에 대한 데이터가 없는 경우 빈 리스트 반환
            return jsonify({
                'guksa_id': str_guksa_id,
                'guksa_name': '알 수 없음',
                'equip_list': []
            })

        response_data = {
            'guksa_id': results[0].guksa_id,
            'guksa_name': results[0].guksa_name,
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
        import traceback
        print(f"Error retrieving equipment list: {e}")
        print(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@api_bp.route('/alarm_dashboard', methods=['POST'])
def alarm_dashboard():
    # POST 방식으로 받은 JSON 데이터 파싱
    data = request.get_json()

    guksa_id = data.get('guksa_id')
    sectors = data.get('sectors', [])  # 배열로 받음
    equip_name = data.get('equip_name')
    time_filter = data.get('timeFilter')

    print("요청 파라미터:", data)  # 디버깅용

    # 기본 쿼리 생성
    query = TblAlarmAllLast.query

    # 필터 적용 (주석 해제하고 수정)
    if guksa_id:
        query = query.filter(TblAlarmAllLast.guksa_id == str(guksa_id))
    if sectors and len(sectors) > 0:
        # 전체(all)가 아닌 경우에만 필터링
        if 'all' not in sectors:
            query = query.filter(TblAlarmAllLast.sector.in_(sectors))
    if equip_name:
        query = query.filter(TblAlarmAllLast.equip_name == equip_name)

    # 시간 필터 적용 (옵션)
    if time_filter:
        from datetime import datetime, timedelta
        minutes = int(time_filter)
        time_threshold = datetime.now() - timedelta(minutes=minutes)
        # datetime 형식이 문자열인 경우 처리하는 조건 추가
        # query = query.filter(TblAlarmAllLast.occur_datetime >= time_threshold.strftime("%Y-%m-%d %H:%M:%S"))

    try:
        print("실행 쿼리:", str(query))  # SQL 쿼리 확인용

        # 데이터가 없는 경우를 위한 처리 (중요)
        alarms = query.all()

        if not alarms or len(alarms) == 0:
            # 빈 데이터 세트 반환 - 빈 배열을 반환하도록 수정
            return jsonify([])

        print(f"조회된 결과 개수: {len(alarms)}")  # 결과 개수 확인용

        # 결과 필드명도 모델 필드명과 일치하게 설정
        result = [{
            'guksa_id': a.guksa_id,
            'sector': a.sector,
            'equip_type': a.equip_type,
            'equip_name': a.equip_name,
            'alarm_message': a.alarm_message,
            'alarm_grade': a.alarm_grade,
            'occur_datetime': str(a.occur_datetime) if a.occur_datetime else None,
            'fault_reason': a.fault_reason,
            'valid_yn': a.valid_yn,
            'insert_datetime': str(a.insert_datetime) if a.insert_datetime else None
        } for a in alarms]

        # 디버깅 출력을 위해 첫 번째 결과만 출력
        if result:
            print("첫 번째 결과:", result[0])

        return jsonify(result)
    except Exception as e:
        print("오류 발생:", str(e))  # 오류 메시지 출력
        import traceback
        traceback.print_exc()  # 상세 에러 출력 추가

        # 에러 발생 시 빈 배열 반환하도록 변경
        return jsonify([])


# puresnmp를 사용한 여러 OID 값을 가져오는 함수
def get_multiple_snmp_values(ip, community, oids, port=161):
    result = {}
    try:
        for oid in oids:
            try:
                # puresnmp의 get 함수로 각 OID 값을 가져옴
                value = puresnmp.get(ip, community, oid, port=port, timeout=2)

                # 반환된 값 처리 (바이트 또는 특수 타입일 수 있음)
                if isinstance(value, bytes):
                    result[oid] = value.decode("utf-8", errors="replace")
                else:
                    result[oid] = str(value)
            except Exception as e:
                result[oid] = f"Error: {str(e)}"
    except Exception as e:
        # 전체 처리 중 오류 발생
        for oid in oids:
            if oid not in result:
                result[oid] = f"Exception: {str(e)}"

    return result


def get_current_time():
    now = datetime.now()
    return now.strftime("%Y-%m-%d %H:%M:%S")
