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
from db.models import db
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
from auth.routes import auth_bp
from admin.routes import admin_bp
from api.routes import api_bp
from main.routes import main_bp
from alarm.routes import alarm_bp
from cable.routes import cable_bp
from zmqtest.routes import zmqtest_bp

app.register_blueprint(auth_bp)
app.register_blueprint(admin_bp, url_prefix='/admin')
app.register_blueprint(api_bp, url_prefix='/api')
app.register_blueprint(main_bp)
app.register_blueprint(alarm_bp)
app.register_blueprint(cable_bp)
app.register_blueprint(zmqtest_bp)


from api.scripts.llm_loader_2 import initialize_llm
# 서버 시작 시 LLM 모델 초기화 (1회만 수행)
print("LLM 모델 초기화 중...")
initialize_llm()
print("LLM 모델 초기화 완료")


# AppDu health_check 함수 절대 지우지 말것 
# health_check
@app.route('/health_check', methods = ['GET'])
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