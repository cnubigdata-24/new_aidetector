from flask import Blueprint, render_template, request
from db.models import *
from external.ai_rag_search import detect_fault

from sqlalchemy import func
from math import ceil
from datetime import datetime
import pymysql
import pandas as pd
import numpy as np

cable_bp = Blueprint("cable", __name__, template_folder="../templates/cable")



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

@cable_bp.route("/cable", methods=["GET"])
def cable():
    print('cable')
    # Pymysql
    # 국사 목록 추가

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
    status = request.args.get('selectSector', None)
    startDate = request.args.get('startDate', None)
    endDate = request.args.get('endDate', None)

    print(status, startDate, endDate)

    with connection.cursor() as cursor:
        sql_alarms = "SELECT * FROM tbl_dr_cable_alarm_info ORDER BY alarm_occur_datetime DESC;"
        cursor.execute(sql_alarms)
        raw_alarms = cursor.fetchall()

    # DataFrame 생성 시 컬럼명을 가져오기
    columns = [col[0] for col in cursor.description]
    alarms_df = pd.DataFrame(raw_alarms, columns=columns)  

    alarms_df['alarm_occur_datetime'] = pd.to_datetime(alarms_df['alarm_occur_datetime'])  # 변환 추가

    if status == '복구완료':
        alarms_df = alarms_df[alarms_df['alarm_recover_datetime'].str.len() >= 3]
        # alarms_df = alarms_df[alarms_df['alarm_recover_datetime'].notna()]
    elif status == '미복구':
        alarms_df = alarms_df[alarms_df['alarm_recover_datetime'].str.len() < 3]
    else:
        pass

    if startDate:
        startDate = datetime.strptime(startDate, '%Y-%m-%d')
    if endDate:
        endDate = datetime.strptime(endDate, '%Y-%m-%d')
        alarms_df = alarms_df[alarms_df['alarm_occur_datetime'] <= endDate]

    alarms = alarms_df.to_dict(orient='records')


    is_selected = 'cable'

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
        'guksas': guksas
    }

    return render_template("cable/cable.html", **context)