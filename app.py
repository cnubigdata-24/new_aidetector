from werkzeug.serving import is_running_from_reloader
import time
import threading
from api.scripts.fault_prediction_core_4 import initialize_vector_db_background
from api.scripts.llm_loader_2 import initialize_llm_background
from zmqtest.routes import zmqtest_bp
from cable.routes import cable_bp
from alarm.routes import alarm_bp
from main.routes import main_bp
from api.routes import api_bp
from admin.routes import admin_bp
from auth.routes import auth_bp
from db.models import db
import os
import json

from flask import Flask, request
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate

from config import Config
# db 임포트 위치 변경
# from db.models import db

# elsastic APM agent 셋팅
from elasticapm.contrib.flask import ElasticAPM

app = Flask(__name__)
app.config.from_object(Config)
cors = CORS(app, resources={r"/*": {"origins": "*"}})

# SQLAlchemy 초기화 위치 변경
db.init_app(app)  # 명시적으로 앱 등록


def getConfig():
    flag = ""
    try:
        f = open('/etc/config/env.properties', 'r')
        devprdflag = f.read()
        flag = devprdflag.split('=')[1]
    except FileNotFoundError:
        print("File does not exist")
    finally:
        if flag != "":
            f.close()
        return flag


# [url 설정]
if getConfig() == 'prd':
    mediatorUrl = "http://mediator.appdu.kt.co.kr"  # 상용 URL
else:
    app.debug = True
    mediatorUrl = "http://mediator.dev.appdu.kt.co.kr"    # 개발  URL

# [url 설정]
if getConfig() in ['prd', 'dev']:
    app.config['ELASTIC_APM'] = {
        "SERVICE_NAME": os.environ.get('POD_NAMESPACE', 'local') + "__" + os.environ.get('PROJECT_NAME', 'project'),
        "SECRET_TOKEN": "e77061bb3aaedae5ae8dd0ca193eb662513aedde",
        "SERVER_URL": "http://apm-server-apm-server.appdu-monitoring:8200",
        "ENVIRONMENT": "production",
        "TRANSACTIONS_IGNORE_PATTERNS": ['/health_check']
    }


if 'ELASTIC_APM' in app.config:
    apm = ElasticAPM(app)

Migrate(app, db)

# 블루프린트 임포트 위치 변경

app.register_blueprint(auth_bp)
app.register_blueprint(admin_bp, url_prefix='/admin')
app.register_blueprint(api_bp, url_prefix='/api')
app.register_blueprint(main_bp)
app.register_blueprint(alarm_bp)
app.register_blueprint(cable_bp)
app.register_blueprint(zmqtest_bp)


# Flask 디버그 모드에서 중복 실행 방지

if not is_running_from_reloader():
    print("🚀 웹 서버 시작 준비 중...")
    print("🔄 AI 모델들은 백그라운드에서 초기화됩니다...")

    # 백그라운드에서 LLM과 벡터DB를 함께 초기화

    def initialize_ai_models_async():
        """백그라운드에서 AI 모델들을 초기화하는 함수"""
        # 서버가 완전히 시작될 때까지 잠시 대기
        time.sleep(1)

        print("🚀 [백그라운드] LLM 모델 초기화 시작...")
        llm_success = initialize_llm_background()

        print("🚀 [백그라운드] 벡터DB 초기화 시작...")
        vectordb_success = initialize_vector_db_background()

        # 초기화 완료 상태 출력
        if llm_success and vectordb_success:
            print("🎉 [백그라운드] 모든 AI 모델 초기화 완료! 서비스 사용 가능")
        elif llm_success:
            print("✅ [백그라운드] LLM 모델 초기화 완료")
            print("❌ [백그라운드] 벡터DB 초기화 실패 - RAG 기능 제한")
        elif vectordb_success:
            print("✅ [백그라운드] 벡터DB 초기화 완료")
            print("❌ [백그라운드] LLM 모델 초기화 실패 - 텍스트 생성 기능 제한")
        else:
            print("❌ [백그라운드] AI 모델 초기화 실패 - 일부 기능 제한")

    # 백그라운드 스레드로 AI 모델들 초기화 실행
    ai_models_thread = threading.Thread(target=initialize_ai_models_async)
    ai_models_thread.daemon = True  # 메인 스레드 종료 시 함께 종료
    ai_models_thread.start()

    print("✅ 웹 서버 시작 중... (AI 모델은 백그라운드에서 로딩됩니다)")


# AppDu health_check 함수 절대 지우지 말것
# health_check
@app.route('/health_check', methods=['GET'])
def health_check():
    if request.method == 'GET':
        return json.dumps({'returnCode': 'OK'})
    else:
        return json.dumps({'returnCode': 'NG', 'message': 'Method ' + request.method + ' not allowed.'}), 405


if __name__ == '__main__':
    with app.app_context():
        # 앱 컨텍스트 내에서 모델 초기화
        db.create_all()
    app.run(host='0.0.0.0')
