from flask import Blueprint, render_template, request
from db.models import *
from external.ai_rag_search import detect_fault


from sqlalchemy import func
from math import ceil
from datetime import datetime
import pymysql
import pandas as pd
import numpy as np

import zmq
import json

zmqtest_bp = Blueprint("zmqtest", __name__, template_folder="../templates/zmqtest")



@zmqtest_bp.route("/zmqtest", methods=["GET", "POST"])
def index():

    print("=========================================")
    print("zmq Page on")

    context = zmq.Context()
    socket = context.socket(zmq.REQ)
    socket.connect("tcp://10.58.241.61:5555")

    # ⏱️ 5초(5000ms) 타임아웃 설정
    socket.setsockopt(zmq.RCVTIMEO, 5000)

    req = {
        "target_ip": "10.48.0.70",
        "community": "public",
        "oid": "1.3.6.1.4.1.2281.10.3.1.6"
    }

    try:
        socket.send_string(json.dumps(req))
        res = socket.recv_string()
        print("📡 응답:", res)
    except zmq.Again:
        print("❌ 응답 없음! 타임아웃 발생") 
    

    return render_template("zmqtest/index.html")

