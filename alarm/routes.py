from flask import Blueprint, render_template, request
from db.models import *
from external.ai_rag_search import detect_fault

from sqlalchemy import func
from math import ceil
from datetime import datetime
import pymysql
import pandas as pd
import numpy as np

alarm_bp = Blueprint("alarm", __name__, template_folder="../templates/alarm")



# 데이터베이스 연결 설정
def get_db_connection():
    connection = pymysql.connect(
        host='10.217.166.215',  # DB 서버 주소
        user='AIDetector1',         # DB 사용자 이름
        password='AIDetector1',     # DB 비밀번호
        database='ad1',
        port=40223 # 사용할 데이터베이스 이름
    )
    return connection

@alarm_bp.route("/alarm", methods=["GET"])
def alarm():
    print('alarm')
    # Pymysql
    # 국사 목록 추가
    connection = get_db_connection()
    with connection.cursor() as cursor:
        sql_guksas = '''SELECT *
            FROM tbl_guksa AS k
            WHERE k.guksa_id = (
                SELECT MIN(k2.guksa_id)
                FROM tbl_guksa AS k2
                WHERE k2.guksa = k.guksa
            )
            ORDER BY k.guksa_id;'''
        cursor.execute(sql_guksas)
        raw_guksas = cursor.fetchall()  # 국사 목록 가져오기
        
        columns = [column[0] for column in cursor.description]
        guksas = [dict(zip(columns, guksa)) for guksa in raw_guksas]
    
    page_number = request.args.get('page', 1, type=int)
    selectSector = request.args.get('selectSector', None)
    startDate = request.args.get('startDate', None)
    endDate = request.args.get('endDate', None)


    # 알람 데이터 가져오기
    # with connection.cursor() as cursor:
    #     sql_alarms = "SELECT * FROM tbl_alarm_all ORDER BY occur_datetime DESC;"
    #     cursor.execute(sql_alarms)
    #     raw_alarms = cursor.fetchall()

    # # DataFrame 생성 시 컬럼명을 가져오기
    # columns = [col[0] for col in cursor.description]
    # alarms_df = pd.DataFrame(raw_alarms, columns=columns)  


    # if selectSector:
    #     alarms_df = alarms_df[alarms_df['sector'] == selectSector]

    # if startDate:
    #     startDate = datetime.strptime(startDate, '%Y-%m-%d')
    #     alarms_df = alarms_df[alarms_df['occur_datetime'] >= startDate]

    # if endDate:
    #     endDate = datetime.strptime(endDate, '%Y-%m-%d')
    #     alarms_df = alarms_df[alarms_df['occur_datetime'] <= endDate]

    # alarms = alarms_df.to_dict(orient='records')

    # 쿼리 기본 설정
    query = TblAlarmAll.query

    if selectSector:
        query = query.filter(TblAlarmAll.sector == selectSector).limit(999) 

    if startDate:
        query = query.filter(TblAlarmAll.occur_datetime >= datetime.strptime(startDate, '%Y-%m-%d')).limit(999)
    if endDate:
        query = query.filter(TblAlarmAll.occur_datetime <= datetime.strptime(endDate, '%Y-%m-%d')).limit(999)

    alarms = query.order_by(TblAlarmAll.occur_datetime.desc()).limit(999).all()
        

    is_selected = "alarm"

    # 페이지 설정
    page_size = 10  # 페이지당 보이는 항목 수

    # 데이터 슬라이싱
    start = (page_number - 1) * page_size
    end = start + page_size
    page_alarms = alarms[start:end]

    total_pages = ceil(len(alarms) / page_size)

    current_page = page_number
    display_count = 5  # 표시할 최대 페이지 버튼 수

    if total_pages <= display_count:
        page_range = range(1, total_pages + 1)
    else:
        start_page = max(current_page - display_count // 2, 1)
        end_page = min(start_page + display_count - 1, total_pages)

        if end_page - start_page < display_count - 1:
            start_page = max(end_page - display_count + 1, 1)

        page_range = range(start_page, end_page + 1)

        if start_page > 2:
            page_range = [1, '...'] + list(page_range)
        if end_page < total_pages - 1:
            page_range = list(page_range) + ['...'] + [total_pages]

    context = {
        'is_selected': is_selected,
        'alarms': page_alarms,
        'page_range': page_range,
        'current_page': current_page,
        'total_pages': total_pages,
        # 'guksas': guksas
    }

    return render_template("alarm/alarm.html", **context)


    # ==============================
    # ORM
    # guksas = (
    #     TblGuksa.query
    #     .with_entities(TblGuksa, func.min(TblGuksa.guksa_id).label('min_id'))  
    #     .group_by(TblGuksa.guksa)  # guksa 컬럼으로 그룹화
    #     .all()
    # )

    # page_number = request.args.get('page', 1, type=int)
    # selectSector = request.args.get('selectSector', None)
    # startDate = request.args.get('startDate', None)
    # endDate = request.args.get('endDate', None)

    # print(page_number, selectSector, startDate, endDate)

    # # 쿼리 기본 설정
    # query = TblAlarmAllLast.query

    # if selectSector:
    #     query = query.filter(TblAlarmAllLast.sector == selectSector)

    # if startDate:
    #     query = query.filter(TblAlarmAllLast.occur_datetime >= datetime.strptime(startDate, '%Y-%m-%d'))
    # if endDate:
    #     query = query.filter(TblAlarmAllLast.occur_datetime <= datetime.strptime(endDate, '%Y-%m-%d'))

    # alarms = query.order_by(TblAlarmAllLast.occur_datetime.desc()).all()
        
    # is_selected = "alarm"

    # # 페이지 설정
    # page_size = 10  # 페이지당 보이는 항목 수

    # print(page_number)
    # # 데이터 슬라이싱
    # start = (page_number - 1) * page_size
    # end = start + page_size
    # page_alarms = alarms[start:end]


    # # 총 페이지 수
    # total_pages = ceil(len(alarms) / page_size)

    # # 현재 페이지 정보
    # current_page = page_number
    # display_count = 5  # 표시할 최대 페이지 버튼 수

    # # 페이지 범위 설정
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


        
    # # 알람과 관련된 모든 변수를 딕셔너리로 묶음
    # context = {
    #     'is_selected': is_selected,
    #     'alarms': page_alarms,
    #     'page_range': page_range,
    #     'current_page': current_page,
    #     'total_pages': total_pages,
    #     'guksas' : guksas
    # }

    # print(context)
    # # render_template 호출 시 딕셔너리 전달
    # return render_template("alarm/alarm.html", **context)