import requests, json
from urllib.parse import urlparse
from jwtTokenUtil import *
from RSACipher import *
from flask import g
from commonUtil import *

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
    mediatorUrl = "http://mediator.dev.appdu.kt.co.kr"    # 개발  URL

# RSA values
key_change_time_interval = 3600
is_processing = False

# LDAP 로그인 시도
def signinwithotp(req, app):
    '''
    {
        "username": "string",
        "password": "string"
    }
    '''
    # get private key from db
    sql = '''
        SELECT priv_key
        from ldap_keystore
    '''

    private_key = app.database.execute(sql).fetchone()[0]

    url = mediatorUrl + "/apis/signin"
    headers = {'Content-Type': 'application/json', 'pod_namespace' : os.environ.get('POD_NAMESPACE', 'local') }
    
    username = req['username'] # LDAP 사용자 이름
    if len(username) <= 1:
        ret = {"returnCode": "NG"}
        ret.update({"message": "username is not valid."})
        ret.update({"data": ""})
        return ret, 400
        
    enc_password = req['password']
    password = rsa_decrypt(private_key, enc_password)
    req['password'] = password
    req['accessIp'] = getClientIp()

    str_json_data = json.dumps(req) # json(str)
    
    try:
        # LDAP API 호출
        res = requests.post(urlparse(url).geturl(), headers=headers, data=str_json_data)
        json_data = json.loads(res.text) # dict

        if res.status_code in [200, 201]:
            ret = {"returnCode": "OK"}
            ret.update({"message": "OTP 발송 (3분 안에 OTP 인증을 시도하세요)"})
            status = 200
            # otp 발송
        
        elif res.status_code == 404:
            ret = {"returnCode": "NG"}
            ret.update({"message": "Page Not Found"})
            status = 404
        
        else:
            ret = {"returnCode": "NG"}
            ret.update({"message": json_data['message']})
            status = 400

        return ret, status

    except Exception as e:
        ret = {'returnCode': 'NG', 'message': str(e)}
        return ret, 500

    return ""


# OTP 확인 후 토큰 발행
def verifywithotp(req):
    '''
    {
        "authorization": Token eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI4ODg4ODg4OCIsImlzcyI6Ijg4ODg4ODg4IiwiaWF0IjoxNjE4ODIxNzU0LCJhdXRob3JpdGllcyI6WyJVU0VSIl0sImV4cCI6MTYxODkwODE1NH0.wVuAEIG9y13246b2N4mEgpxxrwFKD92052sbIdhPZSI
    }
    '''

    url = mediatorUrl + "/apis/verify"
    headers = {'Content-Type': 'application/json', 'pod_namespace' : os.environ.get('POD_NAMESPACE', 'local') }
    
    username = req['username'] # LDAP 사용자 이름
    if len(username) <= 1:
        ret = {"returnCode": "NG"}
        ret.update({"message": "username is not valid."})
        ret.update({"data": ""})
        return ret, 400

    req['accessIp'] = getClientIp()

    str_json_data = json.dumps(req) # json(str)

    try:
        # LDAP API 호출
        res = requests.post(urlparse(url).geturl(), headers=headers, data=str_json_data)
        json_data = json.loads(res.text)

        if res.status_code in [200, 201]:           
            
            # token 발행
            '''
            authorities = json_data['data']['authorities']
            auth_list = []
            for auth in authorities:
                auth_list.append(auth["authority"])
            '''
            token = generateToken(json_data['data'])
            print("token:", token)
            
            ret = {"returnCode": "OK"}
            ret.update({"message": "OTP 확인완료"})             
            ret.update({"data": token})
            status = 200
        
        elif res.status_code == 404:
            ret = {"returnCode": "NG"}
            ret.update({"message": "Page Not Found"})
            status = 404
        
        else:
            ret = {"returnCode": "NG"}
            ret.update({"message": json_data['message']})
            status = 400

        return ret, status

    except Exception as e:
        ret = {'returnCode': 'NG', 'message': str(e)}
        return ret, 500

    return ""

def projectSignin(req, app):

    
    # get private key from db
    sql = '''
        SELECT priv_key
        from ldap_keystore
    '''

    private_key = app.database.execute(sql).fetchone()[0]

    url = mediatorUrl + "/apis/projectSignin"
    headers = {'Content-Type': 'application/json', 'pod_namespace' : os.environ.get('POD_NAMESPACE', 'local') }

    username = req['username'] # LDAP 사용자 이름
    if len(username) <= 1:
        ret = {"returnCode": "NG"}
        ret.update({"message": "username is not valid."})
        ret.update({"data": ""})
        return ret, 400
        
    enc_password = req['password']
    password = rsa_decrypt(private_key, enc_password)
    req['password'] = password
    req['accessIp'] = getClientIp()

    str_json_data = json.dumps(req)

    try:
        res = requests.post(urlparse(url).geturl(), headers=headers, data=str_json_data)
        json_data = json.loads(res.text) # dict

        if json_data['returnCode'] == 'OK' and json_data['data'] is not None :
            token = generateToken(json_data['data'])
            print("token:", token)

            if (isTokenExpired(token) == True):
                ret = {"returnCode": "NG"}
                ret.update({"message": "Token is Expired"})
                ret.update({"data": ""})
                return ret, 401

            ret = {"returnCode": "OK"}
            ret.update({"message": json_data['message']})
            ret.update({"data": token})
            ret.update({"flag": "true"})
            status = 200

        else:
            ret = {"returnCode": "NG"}
            ret.update({"message": json_data['message']})
            status = 400

        return ret, status

    except Exception as e:
        ret = {'returnCode': 'NG', 'message': str(e)}
        return ret, 500

    return "" 

def isProjectSigninCheck(req, app):

    # get private key from db
    sql = '''
        SELECT priv_key
        from ldap_keystore
    '''

    private_key = app.database.execute(sql).fetchone()[0]

    url = mediatorUrl + "/apis/isProjectSigninCheck"
    headers = {'Content-Type': 'application/json', 'pod_namespace' : os.environ.get('POD_NAMESPACE', 'local') }

    username = req['username']

    if len(username) <= 1:
        ret = {"returnCode": "NG"}
        ret.update({"message": "username is not valid."})
        ret.update({"data": ""})
        return ret, 400

    enc_password = req['password']
    password = rsa_decrypt(private_key, enc_password)
    req['password'] = password
    req['accessIp'] = getClientIp()

    str_json_data = json.dumps(req)

    try:
        res = requests.post(urlparse(url).geturl(), headers=headers, data=str_json_data)
        json_data = json.loads(res.text)
            
        if res.status_code in [200, 201]:
            ret = {"returnCode": "OK"}
            ret.update({"message": ""})
            ret.update({"data": json_data['data']})
            status = 200

        else:
            ret = {"returnCode": "NG"}
            ret.update({"message": json_data['message']})
            ret.update({"data": ""})
            status = 400

        return ret, status

    except Exception as e:
        ret = {'returnCode': 'NG', 'message': str(e)}
        return ret, 500

    return ""


# 로그아웃할 때 Logout에 토큰 추가
def dosignout(hdr, app):
    try:
        # 토큰 -> logout 테이블에 추가
        token = hdr['Authorization'].split(" ")[1]
        
        username = getUsernameFromToken(token)
        print("username:", username)
        if (username == "expired"):
            response = app.response_class(
                response = json.dumps({'returnCode': 'OK', 'message': 'logout is success.', 'data': ''}),
                status = 200,
                mimetype = 'application/json'
            )
            return response
        
        sql = '''
            INSERT INTO logout
            (id, token)
            VALUES
            (%s, %s)
            ON DUPLICATE KEY 
            UPDATE token = %s;
            '''
        app.database.execute(sql, (username, token, token))
        response = app.response_class(
            response = json.dumps({'returnCode': 'OK', 'message': 'logout is success.', 'data': ''}),
            status = 200,
            mimetype = 'application/json'
        )
        return response
    except Exception as e:
        response = app.response_class(
            response = json.dumps({'returnCode': 'NG', 'message': str(e)}),
            status = 200,
            mimetype = 'application/json'
        )
        return response
    return ""

def initRSA(app):
    global is_processing

    # db data check
    check_sql = '''
        SELECT COUNT(*)
        from ldap_keystore    
    '''
    key_sql = '''
        SELECT *
        from ldap_keystore
    '''

    get_exists = app.database.execute(check_sql).fetchone()
    cnt = get_exists[0]

    if cnt > 0:
        public_key = app.database.execute(key_sql).fetchone()[1]
        private_key = app.database.execute(key_sql).fetchone()[2]
        key_change_time = app.database.execute(key_sql).fetchone()[3]

    else:
        key_change_time = None
        public_key = None
        private_key = None

    if (key_change_time):
        current_time = getCurrentTimeMills()
        if ((current_time - key_change_time) / 1000 >= key_change_time_interval):
            if (is_processing):
                time.sleep(0.75)
                    
            else: 
                is_processing = True
                public_key, private_key = generate_key()
                key_change_time = getCurrentTimeMills()
                is_processing = False
    else:
        # 최초 접속
        if (is_processing):
            time.sleep(0.75)
                    
        else: 
            is_processing = True
            public_key, private_key = generate_key()
            key_change_time = getCurrentTimeMills()
            is_processing = False

    # db insert / update
    if cnt > 0:
        res_sql = '''
            UPDATE ldap_keystore SET
            pub_key = %s,
            priv_key = %s,
            key_timestamp = %s;
        '''
    else:
        res_sql = '''
            INSERT INTO ldap_keystore
            (pub_key, priv_key, key_timestamp)
            VALUES
            (%s, %s, %s)
        '''
    app.database.execute(res_sql, (public_key, private_key, key_change_time))

        
    res = app.response_class(
        response = json.dumps({'returnCode': 'OK', 'message': '', 'data': public_key}),
        status = 200,
        mimetype = 'application/json'
    )

    return res