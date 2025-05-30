from flask import Blueprint, jsonify, request
import logging

from db.models import *
from db.models import db, TblAlarmAllLast, TblSubLink, TblGuksa
from sqlalchemy import desc, case, or_, func, asc, select


import numpy as np

import traceback
import sys
import random

import subprocess
import json
import time

import hashlib

from flask import current_app
from datetime import datetime, timedelta

# pip install puresnmp
import puresnmp

# pip install pyzmq
import zmq

from flask import has_app_context


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
    # 장비 필드 정보를 추출하기 위한 쿼리
    equipments = TblEquipment.query.filter_by(
        guksa_id=guksa_obj.guksa_id).all()
    center_equips = [
        f"{eq.equip_type}-{eq.equip_name} ({eq.equip_model})" for eq in equipments
    ]

    # 해당 국사의 대표 분야 정보 확인 (가장 많은 장비가 속한 분야)
    sector_counts = {}
    for eq in equipments:
        if eq.equip_type:
            sector_counts[eq.equip_type] = sector_counts.get(
                eq.equip_type, 0) + 1

    # 가장 장비가 많은 분야 찾기, 없으면 기본값
    center_sector = max(sector_counts.items(), key=lambda x: x[1])[
        0] if sector_counts else 'default'

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
        remote_sector = 'default'

        if remote_guksa:
            remote_equips = TblEquipment.query.filter_by(
                guksa_id=remote_guksa.guksa_id
            ).all()
            remote_equipments = [
                f"{eq.equip_type}-{eq.equi_name} ({eq.equip_model})"
                for eq in remote_equips
            ]

            # 원격 국사의 대표 분야 정보 확인
            remote_sector_counts = {}
            for eq in remote_equips:
                if eq.equip_type:
                    remote_sector_counts[eq.equip_type] = remote_sector_counts.get(
                        eq.equip_type, 0) + 1

            # 가장 장비가 많은 분야 찾기
            if remote_sector_counts:
                remote_sector = max(
                    remote_sector_counts.items(), key=lambda x: x[1])[0]

        link_data = {
            "remote_guksa_name": link.remote_guksa_name,
            "remote_id": remote_guksa.guksa_id if remote_guksa else 'N/A',
            "link_type": link.link_type,
            "remote_equipments": remote_equipments,
            "field": remote_sector,
            "type": link.updown_type,
            "link_name": link.link_name if hasattr(link, 'link_name') else None,
            "link_id": str(link.id) if hasattr(link, 'id') else None
        }

        if link.updown_type == "상위국":
            upper_links.append(link_data)
        else:
            lower_links.append(link_data)

    # 국사 정보
    guksa_info = {
        "guksa_id": guksa_obj.guksa_id,
        "guksa_name": guksa_obj.guksa,
        "sector": center_sector,
    }

    topology_data = {
        "center": guksa_name,
        "center_equipments": center_equips,
        "upper": upper_links,
        "lower": lower_links,
        "guksa_info": guksa_info,
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


@api_bp.route("/clear_conversation", methods=["POST"])
def clear_conversation():
    """사용자 대화 이력을 초기화하는 엔드포인트"""
    try:
        # conversation_history 관련 코드 제거, 성공 응답만 반환
        return jsonify({"success": True, "message": "대화 기록이 초기화되었습니다."})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


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
                TblEquipment.equipment_name.like(f'%{n}%')).first()
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
                "equip_id": eq.id,
                "equip_name": eq.equipment_name,
                "equip_type": eq.equipment_type,
                "equip_model": eq.equip_model,
                "equip_field": eq.equip_field,
                "ip_address": eq.ip_address if hasattr(eq, 'ip_address') else None,
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
                if eq.equip_field:
                    sector_counts[eq.equip_field] = sector_counts.get(
                        eq.equip_field, 0) + 1

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
                        TblEquipment.equip_field == sector)

                equip_nodes = equip_query.all()

                for eq in equip_nodes:
                    equip_node = {
                        "id": f"e{eq.id}",  # 장비 ID가 국사 ID와 겹치지 않도록 접두어 추가
                        "label": eq.equipment_name,
                        "type": "equipment",
                        "field": eq.equip_field,
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


# 메인 라우트 함수


@api_bp.route('/alarm_dashboard_equip', methods=['POST'])
def alarm_dashboard_equip():
    # POST 방식으로 받은 JSON 데이터 파싱
    data = request.get_json()

    guksa_id = data.get('guksa_id')
    sectors = data.get('sectors', [])  # 배열로 받음
    equip_name = data.get('equip_name')
    equip_id = data.get('equip_id', '')  # 장비 ID 추가

    print("장비 네트워크 맵 요청 파라미터:", data)  # 디버깅용
    print(f"수신한 장비 ID: {equip_id}")  # 장비 ID 디버깅 출력

    try:
        # 국사 정보 조회
        guksa_info, guksa_name = get_guksa_info(guksa_id)
        str_guksa_id = str(guksa_id).strip() if guksa_id else ""
        str_equip_id = str(equip_id).strip() if equip_id else ""

        # 장비 ID로 국사 ID 조회 (없는 경우)
        if str_equip_id and not str_guksa_id:
            alarm_info = TblAlarmAllLast.query.filter_by(
                equip_id=str_equip_id).first()
            if alarm_info:
                str_guksa_id = alarm_info.guksa_id
                guksa_info, guksa_name = get_guksa_info(str_guksa_id)
                print(f"장비 ID {str_equip_id}에서 조회한 국사 ID: {str_guksa_id}")

        # 장비 네트워크 정보 조회
        equipment_dict = {}
        processed_links = set()

        # 특정 장비 기준으로 연결 정보 조회
        if str_equip_id:
            # 장비 ID에 해당하는 국사 이름으로 링크맵 먼저 로드
            if guksa_name:
                link_map = load_links_by_guksa(guksa_name)
                equipment_dict, processed_links = find_all_connected_equip(
                    str_equip_id, link_map)
            else:
                # 국사 정보가 없는 경우 처리
                print(f"[ERROR] 장비 ID {str_equip_id}에 대한 국사 정보를 찾을 수 없습니다.")
                # 기본 빈 값 설정
                equipment_dict = {}
                processed_links = set()
        # 국사 기준으로 장비 조회
        elif str_guksa_id and guksa_info:
            try:
                # 국사 기준 링크 전체 캐싱
                link_map = load_links_by_guksa(guksa_name)

                # 장비 연결 그래프 탐색
                visited = set()
                equipment_dict = {}
                processed_links = set()

                for node_id in link_map.keys():
                    sub_dict, sub_links = find_all_connected_equip(
                        node_id, link_map, visited)
                    equipment_dict.update(sub_dict)
                    processed_links.update(sub_links)

                print(
                    f"[INFO] 탐색 완료 - 장비 {len(equipment_dict)}개, 링크 {len(processed_links)}개")

            except Exception as e:
                print(f"[ERROR] 국사 기준 장비 탐색 실패: {str(e)}")

        # 링크 정보 변환
        links = []
        for link_key in processed_links:
            # 안전한 파싱: link_name이 없는 경우 처리
            parts = link_key.split(':::')
            if len(parts) >= 3:
                source, target, link_name = parts[0], parts[1], parts[2]
            elif len(parts) == 2:
                source, target = parts[0], parts[1]
                link_name = f"링크-{source}-{target}"  # 기본 링크명 생성
            else:
                continue  # 잘못된 형식은 건너뛰기

            links.append({
                "source": source,
                "target": target,
                "link_name": link_name
            })

        # 분야 필터링 적용
        equipment_list, links = apply_sector_filter(
            equipment_dict, links, sectors)

        # 응답 구성
        response_data = {
            "guksa_id": str_guksa_id,
            "guksa_name": guksa_name,
            "equipment_list": equipment_list,
            "links": links,
            "equip_id": str_equip_id
        }

        return jsonify(response_data)

    except Exception as e:
        print("장비 네트워크 맵 데이터 생성 중 오류 발생:", str(e))
        traceback.print_exc()  # 상세 에러 출력

        _, guksa_name = get_guksa_info(guksa_id)
        response_data = None

        return jsonify(response_data)


# MW-MW 구간 페이딩 체크 API
@api_bp.route('/check_mw_fading', methods=['POST'])
def check_mw_fading():
    """
    Request Body:
    {
        "source_equip_id": "MW001",
        "target_equip_id": "MW002",
        "check_type": "fading_analysis"
    }

    Response:
    {
        "result_code": "1111",
        "is_fading": "fading|normal",
        "result_msg": "분석 결과 메시지"
    }
    """
    try:
        # POST 방식으로 받은 JSON 데이터 파싱
        data = request.get_json()

        source_equip_id = data.get('source_equip_id')
        target_equip_id = data.get('target_equip_id')
        check_type = data.get('check_type', 'fading_analysis')

        print(f"MW 페이딩 체크 요청: {source_equip_id} <-> {target_equip_id}")

        # 입력 파라미터 유효성 검사
        if not source_equip_id or not target_equip_id:
            return jsonify({
                'result_code': '9999',
                'is_fading': 'N/A',
                'result_msg': '필수 파라미터가 누락되었습니다. (source_equip_id, target_equip_id)'
            }), 400

        # MW 페이딩 분석 수행
        fading_result = analyze_mw_fading(source_equip_id, target_equip_id)

        return jsonify(fading_result)

    except Exception as e:
        print(f"MW 페이딩 체크 API 오류: {str(e)}")
        traceback.print_exc()

        return jsonify({
            'result_code': '0000',
            'is_fading': 'N/A',
            'result_msg': f'SNMP 데이터 수집 실패: {str(e)}'
        }), 500

# MW 장비 한전 정전 체크 API


@api_bp.route('/check_mw_power', methods=['POST'])
def check_mw_power():
    """
    Request Body:
    {
        "equip_id": "MW001",
        "guksa_name": "도초국사",
        "check_type": "power_analysis"
    }

    Response:
    {
        "result_code": "1111",
        "battery_mode": "battery|main_power",
        "result_msg": "분석 결과 메시지"
    }
    """
    try:
        # POST 방식으로 받은 JSON 데이터 파싱
        data = request.get_json()

        equip_id = data.get('equip_id')
        guksa_name = data.get('guksa_name')
        check_type = data.get('check_type', 'power_analysis')

        print(f"MW 정전 체크 요청: {equip_id} ({guksa_name})")

        # 입력 파라미터 유효성 검사
        if not equip_id:
            return jsonify({
                'result_code': '9999',
                'battery_mode': 'N/A',
                'result_msg': '필수 파라미터가 누락되었습니다. (equip_id)'
            }), 400

        # MW 정전 분석 수행
        power_result = analyze_mw_power_status(equip_id, guksa_name)

        return jsonify(power_result)

    except Exception as e:
        print(f"MW 정전 체크 API 오류: {str(e)}")
        traceback.print_exc()

        return jsonify({
            'result_code': '0000',
            'battery_mode': 'N/A',
            'result_msg': f'SNMP 데이터 수집 실패: {str(e)}'
        }), 500


# MW-MW 링크 페이딩 분석 함수
def analyze_mw_fading(source_equip_id, target_equip_id):
    """
    Args:
        source_equip_id (str): 소스 장비 ID
        target_equip_id (str): 타겟 장비 ID

    Returns:
        dict: 페이딩 분석 결과
    """
    try:
        print(f"페이딩 분석 시작: {source_equip_id} -> {target_equip_id}")

        # 1. 장비 정보 조회
        source_equip = get_equipment_info(source_equip_id)
        target_equip = get_equipment_info(target_equip_id)

        if not source_equip or not target_equip:
            return {
                'result_code': '9998',
                'is_fading': 'N/A',
                'result_msg': '장비 정보를 찾을 수 없습니다.'
            }

        # 2. SNMP 데이터 수집 (SNR, BER 값)
        source_snmp_data = collect_mw_snmp_data(source_equip_id)
        target_snmp_data = collect_mw_snmp_data(target_equip_id)

        if not source_snmp_data or not target_snmp_data:
            return {
                'result_code': '0000',
                'is_fading': 'N/A',
                'result_msg': 'SNMP 데이터 수집 실패'
            }

        # 3. 페이딩 분석 로직
        fading_analysis = perform_fading_analysis(
            source_snmp_data, target_snmp_data)

        # 4. 분석 결과 반환
        if fading_analysis['is_fading']:
            return {
                'result_code': '1111',
                'is_fading': 'fading',
                'result_msg': f"SNR: {fading_analysis['snr_status']}, BER: {fading_analysis['ber_status']} - 페이딩 의심됨",
                'analysis_data': {
                    'source_snr': fading_analysis.get('source_snr'),
                    'target_snr': fading_analysis.get('target_snr'),
                    'source_ber': fading_analysis.get('source_ber'),
                    'target_ber': fading_analysis.get('target_ber'),
                    'snr_variance': fading_analysis.get('snr_variance'),
                    'ber_variance': fading_analysis.get('ber_variance')
                }
            }
        else:
            return {
                'result_code': '1111',
                'is_fading': 'normal',
                'result_msg': f"SNR: {fading_analysis['snr_status']}, BER: {fading_analysis['ber_status']} - 정상 범위",
                'analysis_data': {
                    'source_snr': fading_analysis.get('source_snr'),
                    'target_snr': fading_analysis.get('target_snr'),
                    'source_ber': fading_analysis.get('source_ber'),
                    'target_ber': fading_analysis.get('target_ber')
                }
            }

    except Exception as e:
        print(f"페이딩 분석 오류: {str(e)}")
        return {
            'result_code': '0000',
            'is_fading': 'N/A',
            'result_msg': f'페이딩 분석 중 오류 발생: {str(e)}'
        }

# MW 장비 전원 상태 분석 함수


def analyze_mw_power_status(equip_id, guksa_name=None):
    """
    Args:
        equip_id (str): 장비 ID
        guksa_name (str): 국사명 (옵션)

    Returns:
        dict: 전원 상태 분석 결과
    """
    try:
        print(f"전원 상태 분석 시작: {equip_id}")

        # 1. 장비 정보 조회
        equip_info = get_equipment_info(equip_id)

        if not equip_info:
            return {
                'result_code': '9998',
                'battery_mode': 'N/A',
                'result_msg': '장비 정보를 찾을 수 없습니다.'
            }

        # 2. SNMP를 통한 전압 데이터 수집
        power_data = collect_mw_power_data(equip_id)

        if not power_data:
            return {
                'result_code': '0000',
                'battery_mode': 'N/A',
                'result_msg': 'SNMP 데이터 수집 실패'
            }

        # 3. 전원 상태 분석 로직
        power_analysis = perform_power_analysis(power_data)

        # 4. 분석 결과 반환
        if power_analysis['is_battery_mode']:
            return {
                'result_code': '1111',
                'battery_mode': 'battery',
                'result_msg': f"인입 전압이 {power_analysis['input_voltage']}mV로 기준치 {power_analysis['threshold_voltage']}mV보다 낮아 배터리로 운용 중 - 한전 정전 추정",
                'power_data': {
                    'input_voltage': power_analysis['input_voltage'],
                    'threshold_voltage': power_analysis['threshold_voltage'],
                    'battery_voltage': power_analysis.get('battery_voltage'),
                    'power_status': power_analysis.get('power_status')
                }
            }
        else:
            return {
                'result_code': '1111',
                'battery_mode': 'main_power',
                'result_msg': f"인입 전압이 {power_analysis['input_voltage']}mV로 기준치 {power_analysis['threshold_voltage']}mV와 비교시 정상 수준 - 한전 정전 아님",
                'power_data': {
                    'input_voltage': power_analysis['input_voltage'],
                    'threshold_voltage': power_analysis['threshold_voltage'],
                    'power_status': power_analysis.get('power_status')
                }
            }

    except Exception as e:
        print(f"전원 상태 분석 오류: {str(e)}")
        return {
            'result_code': '0000',
            'battery_mode': 'N/A',
            'result_msg': f'전원 상태 분석 중 오류 발생: {str(e)}'
        }

# 장비 경보 정보 조회


def get_equipment_info(equip_id):
    try:
        # 데이터베이스에서 장비 정보 조회
        equip_info = TblAlarmAllLast.query.filter_by(equip_id=equip_id).first()

        if equip_info:
            return {
                'equip_id': equip_info.equip_id,
                'equip_name': equip_info.equip_name,
                'equip_type': equip_info.equip_type,
                'guksa_id': equip_info.guksa_id,
                'ip_address': getattr(equip_info, 'ip_address', None)
            }

        return None

    except Exception as e:
        print(f"장비 정보 조회 오류: {str(e)}")
        return None

# MW 장비의 SNMP 데이터 수집 (SNR, BER)


def collect_mw_snmp_data(equip_id):
    """
    Args:
        equip_id (str): 장비 ID

    Returns:
        dict: SNMP 데이터 또는 None
    """
    try:
        # 실제 구현에서는 SNMP 라이브러리를 사용하여 데이터 수집
        # 예시: pysnmp 또는 easysnmp 사용

        # 장비 정보 조회
        equip_info = get_equipment_info(equip_id)
        if not equip_info or not equip_info.get('ip_address'):
            print(f"장비 {equip_id}의 IP 주소를 찾을 수 없습니다.")
            return None

        ip_address = equip_info['ip_address']

        # SNMP OID 정의 (실제 장비에 맞게 수정 필요)
        snr_oid = '1.3.6.1.4.1.12345.1.1.1'  # SNR OID
        ber_oid = '1.3.6.1.4.1.12345.1.1.2'  # BER OID

        # 모의 데이터 (실제 구현에서는 SNMP 수집 코드로 대체)

        # 최근 5분간의 데이터를 시뮬레이션
        snr_values = []
        ber_values = []

        for i in range(5):  # 5개 샘플
            # 정상적인 경우와 페이딩이 있는 경우를 구분하여 시뮬레이션
            if random.random() < 0.3:  # 30% 확률로 페이딩 시뮬레이션
                snr_val = random.uniform(15, 25)  # 낮은 SNR
                ber_val = random.uniform(1e-4, 1e-3)  # 높은 BER
            else:
                snr_val = random.uniform(25, 35)  # 정상 SNR
                ber_val = random.uniform(1e-6, 1e-5)  # 정상 BER

            snr_values.append(snr_val)
            ber_values.append(ber_val)

        return {
            'equip_id': equip_id,
            'ip_address': ip_address,
            'timestamp': time.time(),
            'snr_values': snr_values,
            'ber_values': ber_values,
            'sample_count': len(snr_values)
        }

    except Exception as e:
        print(f"SNMP 데이터 수집 오류 ({equip_id}): {str(e)}")
        return None

# MW 장비의 전원 데이터 수집


def collect_mw_power_data(equip_id):
    """
    Args:
        equip_id (str): 장비 ID

    Returns:
        dict: 전원 데이터 또는 None
    """
    try:
        # 장비 정보 조회
        equip_info = get_equipment_info(equip_id)
        if not equip_info or not equip_info.get('ip_address'):
            print(f"장비 {equip_id}의 IP 주소를 찾을 수 없습니다.")
            return None

        ip_address = equip_info['ip_address']

        # SNMP OID 정의 (실제 장비에 맞게 수정 필요)
        input_voltage_oid = '1.3.6.1.4.1.12345.2.1.1'  # 인입전압 OID
        battery_voltage_oid = '1.3.6.1.4.1.12345.2.1.2'  # 배터리전압 OID
        power_status_oid = '1.3.6.1.4.1.12345.2.1.3'  # 전원상태 OID

        # 모의 데이터 (실제 구현에서는 SNMP 수집 코드로 대체)

        # 정전 상황을 시뮬레이션
        if random.random() < 0.2:  # 20% 확률로 정전 시뮬레이션
            input_voltage = random.uniform(180, 200)  # 낮은 전압 (정전)
            battery_voltage = random.uniform(22, 24)  # 배터리 전압
            power_status = 'battery'
        else:
            input_voltage = random.uniform(220, 240)  # 정상 전압
            battery_voltage = random.uniform(26, 28)  # 충전된 배터리
            power_status = 'main'

        return {
            'equip_id': equip_id,
            'ip_address': ip_address,
            'timestamp': time.time(),
            'input_voltage': input_voltage,
            'battery_voltage': battery_voltage,
            'power_status': power_status
        }

    except Exception as e:
        print(f"전원 데이터 수집 오류 ({equip_id}): {str(e)}")
        return None

# MW-MW 링크 페이딩 분석


def perform_fading_analysis(source_data, target_data):
    """
    Args:
        source_data (dict): 소스 장비 SNMP 데이터
        target_data (dict): 타겟 장비 SNMP 데이터

    Returns:
        dict: 분석 결과
    """
    try:
        # SNR과 BER 데이터 추출
        source_snr = source_data.get('snr_values', [])
        source_ber = source_data.get('ber_values', [])
        target_snr = target_data.get('snr_values', [])
        target_ber = target_data.get('ber_values', [])

        # 평균값 계산
        avg_source_snr = np.mean(source_snr) if source_snr else 0
        avg_target_snr = np.mean(target_snr) if target_snr else 0
        avg_source_ber = np.mean(source_ber) if source_ber else 0
        avg_target_ber = np.mean(target_ber) if target_ber else 0

        # 분산 계산 (변동성 확인)
        snr_variance = np.var(
            source_snr + target_snr) if (source_snr and target_snr) else 0
        ber_variance = np.var(
            source_ber + target_ber) if (source_ber and target_ber) else 0

        # 페이딩 판단 기준
        SNR_THRESHOLD = 25.0  # dB
        BER_THRESHOLD = 1e-4
        SNR_VARIANCE_THRESHOLD = 10.0  # 변동성 기준
        BER_VARIANCE_THRESHOLD = 1e-6

        # 페이딩 판단 로직
        low_snr = (avg_source_snr < SNR_THRESHOLD) or (
            avg_target_snr < SNR_THRESHOLD)
        high_ber = (avg_source_ber > BER_THRESHOLD) or (
            avg_target_ber > BER_THRESHOLD)
        high_variance = (snr_variance > SNR_VARIANCE_THRESHOLD) or (
            ber_variance > BER_VARIANCE_THRESHOLD)

        is_fading = low_snr and (high_ber or high_variance)

        # 상태 메시지 생성
        snr_status = f"평균 {(avg_source_snr + avg_target_snr) / 2:.1f}dB"
        ber_status = f"평균 {(avg_source_ber + avg_target_ber) / 2:.2e}"

        if snr_variance > SNR_VARIANCE_THRESHOLD:
            snr_status += " (변동 큼)"
        if ber_variance > BER_VARIANCE_THRESHOLD:
            ber_status += " (변동 큼)"

        return {
            'is_fading': is_fading,
            'source_snr': avg_source_snr,
            'target_snr': avg_target_snr,
            'source_ber': avg_source_ber,
            'target_ber': avg_target_ber,
            'snr_variance': snr_variance,
            'ber_variance': ber_variance,
            'snr_status': snr_status,
            'ber_status': ber_status
        }

    except Exception as e:
        print(f"페이딩 분석 오류: {str(e)}")
        return {
            'is_fading': False,
            'snr_status': '분석 실패',
            'ber_status': '분석 실패'
        }

# MW 장비 전원 상태 분석


def perform_power_analysis(power_data):
    try:
        input_voltage = power_data.get('input_voltage', 0)
        battery_voltage = power_data.get('battery_voltage', 0)
        power_status = power_data.get('power_status', 'unknown')

        # 전압 기준값 (실제 장비 사양에 맞게 조정 필요)
        NORMAL_VOLTAGE_MIN = 210  # 210V
        NORMAL_VOLTAGE_MAX = 250  # 250V
        BATTERY_MODE_THRESHOLD = 200  # 200V 이하면 배터리 모드로 판단

        # 정전 판단 로직
        is_battery_mode = (input_voltage < BATTERY_MODE_THRESHOLD) or (
            power_status == 'battery')

        return {
            'is_battery_mode': is_battery_mode,
            'input_voltage': input_voltage,
            'threshold_voltage': BATTERY_MODE_THRESHOLD,
            'battery_voltage': battery_voltage,
            'power_status': power_status,
            'voltage_range': f"{NORMAL_VOLTAGE_MIN}V ~ {NORMAL_VOLTAGE_MAX}V"
        }

    except Exception as e:
        print(f"전원 분석 오류: {str(e)}")
        return {
            'is_battery_mode': False,
            'input_voltage': 0,
            'threshold_voltage': 200
        }


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


# 1. 국사 기반 링크 전체 메모리 로딩
def load_links_by_guksa(guksa_name):
    links = db.session.query(TblSubLink).filter(
        TblSubLink.guksa_name == guksa_name
    ).all()

    link_map = {}

    for link in links:
        id1 = str(link.equip_id).strip()
        id2 = str(link.link_equip_id).strip()

        # 양방향 그래프 구성
        link_map.setdefault(id1, []).append(link)
        link_map.setdefault(id2, []).append(link)

    return link_map


# 2. 인메모리 DFS 기반 장비 연결 탐색
def find_all_connected_equip(equip_id, link_map, visited=None, depth=0, max_depth=5):
    if visited is None:
        visited = set()

    equip_id = str(equip_id)
    if equip_id in visited or depth >= max_depth:
        return {}, set()

    visited.add(equip_id)

    equipment_dict = {}
    processed_links = set()
    neighbors = link_map.get(equip_id, [])

    for link in neighbors:
        id1 = str(link.equip_id)
        id2 = str(link.link_equip_id)

        # 링크 이름 추가
        link_name = link.link_name

        # 장비 정보 등록 (소스)
        if id1 not in equipment_dict:
            equipment_dict[id1] = {
                "id": link.id,
                "equip_id": id1,
                "equip_type": link.equip_type,
                "equip_name": link.equip_name,
                "equip_field": link.equip_field,
                "guksa_name": link.guksa_name,
                "up_down": link.up_down
            }

        # 장비 정보 등록 (타겟)
        if id2 not in equipment_dict:
            equipment_dict[id2] = {
                "id": link.id + 10000,
                "equip_id": id2,
                "equip_type": link.link_equip_type,
                "equip_name": link.link_equip_name,
                "equip_field": link.link_equip_field,
                "guksa_name": link.link_guksa_name,
                "up_down": "unknown"
            }

        # 링크 중복 없이 저장 (link_name 포함)
        key1 = f"{id1}:::{id2}:::{link_name}"
        key2 = f"{id2}:::{id1}:::{link_name}"
        if key1 not in processed_links and key2 not in processed_links:
            processed_links.add(key1)

            # 다음 노드 DFS 재귀
            next_id = id2 if equip_id == id1 else id1
            sub_dict, sub_links = find_all_connected_equip(
                next_id, link_map, visited, depth + 1, max_depth)
            equipment_dict.update(sub_dict)
            processed_links.update(sub_links)

    return equipment_dict, processed_links


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
