from flask import Blueprint, render_template, request
from db.models import *
from external.ai_rag_search import detect_fault

from sqlalchemy import func
from math import ceil
from datetime import datetime
import pymysql
import pandas as pd
import numpy as np

from flask import send_from_directory, current_app
import os


main_bp = Blueprint("main", __name__, template_folder="../templates/main")


# 데이터베이스 연결 설정
def get_db_connection():
    connection = pymysql.connect(
        host='10.217.166.215',  # DB 서버 주소
        user='AIDetector1',         # DB 사용자 이름
        password='AIDetector1',     # DB 비밀번호
        database='ad1',
        port=40223  # 사용할 데이터베이스 이름
    )
    return connection


@main_bp.route("/", methods=["GET", "POST"])
def index():

    url = 'index'
    result = None
    if request.method == "POST":
        result = detect_fault()

    # Pymysql
    # alarms 가져오기
    # connection = get_db_connection()  # 데이터베이스 연결 생성

    # with connection.cursor() as cursor:
    #     sql_alarms = "SELECT * FROM tbl_alarm;"
    #     cursor.execute(sql_alarms)
    #     raw_alarms = cursor.fetchall()  # 모든 경고 가져오기

    #     # 동적으로 열 이름을 가져와서 딕셔너리 리스트로 변환
    #     alarm_columns = [column[0] for column in cursor.description]
    #     alarms = [dict(zip(alarm_columns, alarm)) for alarm in raw_alarms]

        # # 각 알람에 장비 정보를 추가
        # for alarm in alarms:
        #     equip_id = int(alarm['equip_id'])  # equip_id는 각 alarm에서 가져옵니다.
        #     with connection.cursor() as cursor:
        #         sql_equip = "SELECT * FROM tbl_equipment WHERE id = %s;"
        #         cursor.execute(sql_equip, (equip_id,))
        #         equipment = cursor.fetchone()  # 해당 장비 가져오기

        #         # 장비 정보를 딕셔너리 형태로 변환
        #         if equipment:
        #             equip_columns = [column[0] for column in cursor.description]
        #             alarm['equip'] = dict(zip(equip_columns, equipment))  # alarm에 equip 속성 추가

    # # guksas 가져오기
    # with connection.cursor() as cursor:
    #     sql_guksas = '''SELECT *
    #         FROM tbl_guksa AS k
    #         WHERE k.guksa_id = (
    #             SELECT MIN(k2.guksa_id)
    #             FROM tbl_guksa AS k2
    #             WHERE k2.guksa = k.guksa
    #         )
    #         ORDER BY k.guksa_id;'''
    #     cursor.execute(sql_guksas)

    #     raw_guksas = cursor.fetchall()  # 모든 국사 가져오기
    #     columns = [column[0] for column in cursor.description]
    #     guksas = [dict(zip(columns, guksa)) for guksa in raw_guksas]

    # connection.close()  # 연결 닫기

    # # render_template으로 데이터 전송
    # return render_template("main/index.html", guksas=guksas)

    # ===========================================
    # ORM
    # alarms = TblAlarm.query.all()

    # for alarm in alarms:
    #     alarm.equip = Equipment.query.get(int(alarm.equip_id))

    guksas = (
        TblGuksa.query
        .with_entities(TblGuksa, func.min(TblGuksa.guksa_id).label('min_id'))
        .group_by(TblGuksa.guksa)  # guksa 컬럼으로 그룹화
        .all()
    )

    return render_template("main/index.html", guksas=guksas, url=url)


@main_bp.route('/fault-detector')
def fault_detector():
    return render_template('main/fault_detector.html')


@main_bp.route('/fault-dashboard')
def fault_dashboard():
    return render_template('main/fault_dashboard.html')


@main_bp.route('/favicon.ico')
def favicon():
    return send_from_directory(
        os.path.join(current_app.root_path, 'static'),
        'favicon.ico',
        mimetype='image/vnd.microsoft.icon'
    )

# @main_bp.route("/cable", methods=["GET", "POST"])
# def cable():

    # # Pymysql
    # # 국사 목록 추가
    # connection = get_db_connection()
    # with connection.cursor() as cursor:
    #     sql_guksas = '''SELECT *
    #         FROM tbl_guksa AS k
    #         WHERE k.guksa_id = (
    #             SELECT MIN(k2.guksa_id)
    #             FROM tbl_guksa AS k2
    #             WHERE k2.guksa = k.guksa
    #         )
    #         ORDER BY k.guksa_id;'''
    #     cursor.execute(sql_guksas)
    #     raw_guksas = cursor.fetchall()  # 국사 목록 가져오기

    #     columns = [column[0] for column in cursor.description]
    #     guksas = [dict(zip(columns, guksa)) for guksa in raw_guksas]

    # page_number = request.args.get('page', 1, type=int)
    # status = request.args.get('selectSector', None)
    # startDate = request.args.get('startDate', None)
    # endDate = request.args.get('endDate', None)

    # print(status, startDate, endDate)

    # with connection.cursor() as cursor:
    #     sql_alarms = "SELECT * FROM tbl_dr_cable_alarm_info ORDER BY alarm_occur_datetime DESC;"
    #     cursor.execute(sql_alarms)
    #     raw_alarms = cursor.fetchall()

    # # DataFrame 생성 시 컬럼명을 가져오기
    # columns = [col[0] for col in cursor.description]
    # alarms_df = pd.DataFrame(raw_alarms, columns=columns)

    # alarms_df['alarm_occur_datetime'] = pd.to_datetime(alarms_df['alarm_occur_datetime'])  # 변환 추가

    # if status == '복구완료':
    #     alarms_df = alarms_df[alarms_df['alarm_recover_datetime'].str.len() >= 3]
    #     # alarms_df = alarms_df[alarms_df['alarm_recover_datetime'].notna()]
    # elif status == '미복구':
    #     alarms_df = alarms_df[alarms_df['alarm_recover_datetime'].str.len() < 3]
    # else:
    #     pass

    # if startDate:
    #     startDate = datetime.strptime(startDate, '%Y-%m-%d')
    # if endDate:
    #     endDate = datetime.strptime(endDate, '%Y-%m-%d')
    #     alarms_df = alarms_df[alarms_df['alarm_occur_datetime'] <= endDate]

    # alarms = alarms_df.to_dict(orient='records')

    # is_selected = 'cable'

    # # 페이지 설정
    # page_size = 10  # 페이지당 보이는 항목 수

    # # 데이터 슬라이싱
    # start = (page_number - 1) * page_size
    # end = start + page_size
    # page_alarms = alarms[start:end]

    # total_pages = ceil(len(alarms) / page_size)

    # current_page = page_number
    # display_count = 5  # 표시할 최대 페이지 버튼 수

    # if total_pages <= display_count:
    #     page_range = range(1, total_pages + 1)
    # else:
    #     start_page = max(current_page - display_count // 2, 1)
    #     end_page = min(start_page + display_count - 1, total_pages)

    #     if end_page - start_page < display_count - 1:
    #         start_page = max(end_page - display_count + 1, 1)

    #     page_range = range(start_page, end_page + 1)

    #     if start_page > 2:
    #         page_range = [1, '...'] + list(page_range)
    #     if end_page < total_pages - 1:
    #         page_range = list(page_range) + ['...'] + [total_pages]

    # context = {
    #     'is_selected': is_selected,
    #     'alarms': page_alarms,
    #     'page_range': page_range,
    #     'current_page': current_page,
    #     'total_pages': total_pages,
    #     'guksas': guksas
    # }

    # return render_template("main/cable.html", **context)

# @main_bp.route("/alarm", methods=["GET"])
# def alarm():

#     # Pymysql
#     # 국사 목록 추가
#     connection = get_db_connection()
#     with connection.cursor() as cursor:
#         sql_guksas = '''SELECT *
#             FROM tbl_guksa AS k
#             WHERE k.guksa_id = (
#                 SELECT MIN(k2.guksa_id)
#                 FROM tbl_guksa AS k2
#                 WHERE k2.guksa = k.guksa
#             )
#             ORDER BY k.guksa_id;'''
#         cursor.execute(sql_guksas)
#         raw_guksas = cursor.fetchall()  # 국사 목록 가져오기

#         columns = [column[0] for column in cursor.description]
#         guksas = [dict(zip(columns, guksa)) for guksa in raw_guksas]

#     page_number = request.args.get('page', 1, type=int)
#     selectSector = request.args.get('selectSector', None)
#     startDate = request.args.get('startDate', None)
#     endDate = request.args.get('endDate', None)


#     # 알람 데이터 가져오기
#     with connection.cursor() as cursor:
#         sql_alarms = "SELECT * FROM tbl_alarm_all_last ORDER BY occur_datetime DESC;"
#         cursor.execute(sql_alarms)
#         raw_alarms = cursor.fetchall()

#     # DataFrame 생성 시 컬럼명을 가져오기
#     columns = [col[0] for col in cursor.description]
#     alarms_df = pd.DataFrame(raw_alarms, columns=columns)


#     if selectSector:
#         alarms_df = alarms_df[alarms_df['sector'] == selectSector]

#     if startDate:
#         startDate = datetime.strptime(startDate, '%Y-%m-%d')
#         alarms_df = alarms_df[alarms_df['occur_datetime'] >= startDate]

#     if endDate:
#         endDate = datetime.strptime(endDate, '%Y-%m-%d')
#         alarms_df = alarms_df[alarms_df['occur_datetime'] <= endDate]

#     alarms = alarms_df.to_dict(orient='records')

#     connection.close()  # 연결 닫기

#     is_selected = "alarm"

#     # 페이지 설정
#     page_size = 10  # 페이지당 보이는 항목 수

#     # 데이터 슬라이싱
#     start = (page_number - 1) * page_size
#     end = start + page_size
#     page_alarms = alarms[start:end]

#     total_pages = ceil(len(alarms) / page_size)

#     current_page = page_number
#     display_count = 5  # 표시할 최대 페이지 버튼 수

#     if total_pages <= display_count:
#         page_range = range(1, total_pages + 1)
#     else:
#         start_page = max(current_page - display_count // 2, 1)
#         end_page = min(start_page + display_count - 1, total_pages)

#         if end_page - start_page < display_count - 1:
#             start_page = max(end_page - display_count + 1, 1)

#         page_range = range(start_page, end_page + 1)

#         if start_page > 2:
#             page_range = [1, '...'] + list(page_range)
#         if end_page < total_pages - 1:
#             page_range = list(page_range) + ['...'] + [total_pages]

#     context = {
#         'is_selected': is_selected,
#         'alarms': page_alarms,
#         'page_range': page_range,
#         'current_page': current_page,
#         'total_pages': total_pages,
#         'guksas': guksas
#     }

#     return render_template("main/alarm.html", **context)


#     # ==============================
#     # ORM
#     # guksas = TblKuksa.query.order_by(TblKuksa.guksa_id).all()  # 국사 목록 추가

#     # page_number = request.args.get('page', 1, type=int)
#     # selectSector = request.args.get('selectSector', None)
#     # startDate = request.args.get('startDate', None)
#     # endDate = request.args.get('endDate', None)

#     # print(page_number, selectSector, startDate, endDate)

#     # # 쿼리 기본 설정
#     # query = TblAlarmAllLast.query

#     # if selectSector:
#     #     query = query.filter(TblAlarmAllLast.sector == selectSector)

#     # if startDate:
#     #     query = query.filter(TblAlarmAllLast.occur_datetime >= datetime.strptime(startDate, '%Y-%m-%d'))
#     # if endDate:
#     #     query = query.filter(TblAlarmAllLast.occur_datetime <= datetime.strptime(endDate, '%Y-%m-%d'))

#     # alarms = query.order_by(TblAlarmAllLast.occur_datetime.desc()).all()

#     # is_selected = "alarm"

#     # # 페이지 설정
#     # page_size = 10  # 페이지당 보이는 항목 수

#     # print(page_number)
#     # # 데이터 슬라이싱
#     # start = (page_number - 1) * page_size
#     # end = start + page_size
#     # page_alarms = alarms[start:end]


#     # # 총 페이지 수
#     # total_pages = ceil(len(alarms) / page_size)

#     # # 현재 페이지 정보
#     # current_page = page_number
#     # display_count = 5  # 표시할 최대 페이지 버튼 수

#     # # 페이지 범위 설정
#     # if total_pages <= display_count:
#     #     page_range = range(1, total_pages + 1)
#     # else:
#     #     start_page = max(current_page - display_count // 2, 1)
#     #     end_page = min(start_page + display_count - 1, total_pages)

#     #     if end_page - start_page < display_count - 1:
#     #         start_page = max(end_page - display_count + 1, 1)

#     #     page_range = range(start_page, end_page + 1)

#     #     if start_page > 2:
#     #         page_range = [1, '...'] + list(page_range)
#     #     if end_page < total_pages - 1:
#     #         page_range = list(page_range) + ['...'] + [total_pages]


#     # # 알람과 관련된 모든 변수를 딕셔너리로 묶음
#     # context = {
#     #     'is_selected': is_selected,
#     #     'alarms': page_alarms,
#     #     'page_range': page_range,
#     #     'current_page': current_page,
#     #     'total_pages': total_pages,
#     #     'guksas' : guksas
#     # }

#     # print(context)
#     # # render_template 호출 시 딕셔너리 전달
#     # return render_template("main/alarm.html", **context)
