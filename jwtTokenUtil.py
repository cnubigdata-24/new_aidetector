import time
import jwt
import json
from masking import *

secret_key = "appdu"

"""
Token 생성 from authentication
@param userInfo
@return
"""
def generateToken(userInfo):
    # headers
    additional_headers = {
        "alg": "HS256",
        "typ": "JWT"
    }

    # payload
    now = int(time.time())    # secs
    exp = now + 3600          # 60 min
    sub = userInfo["username"]

    # 토큰 민감정보 제거
    updateUserInfo(userInfo)

    # 토큰 마스킹
    maskingUserInfo(userInfo)

    jwt_payload = {
        "sub": sub,
        "userInfo": userInfo,
        'iss': userInfo["username"],
        'iat': now,
        'exp': exp
    }
    encoded_jwt = jwt.encode(jwt_payload, secret_key, headers=additional_headers, algorithm="HS256")

    return encoded_jwt


"""
decode 반환
@param token
@return
"""
def decodeToken(token):
    # Decoding
    try:
        decoded_jwt_payload = jwt.decode(token, secret_key, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        # Signature has expired
        decoded_jwt_payload = "expired"
    except jwt.DecodeError:
        decoded_jwt_payload = "error"
    except Exception as e:
        #print("[] Exception: " + str(e) )
        decoded_jwt_payload = "error"
    return decoded_jwt_payload


"""
token으로 Claim 반환
@param token
@return
"""
def getClaimFromToken(token, find_item):
    # Decoding
    decoded_jwt_payload = decodeToken(token)
    if (decoded_jwt_payload == "error"):
        return "error"
    
    elif (decoded_jwt_payload == "expired"):
        return "expired"

    finded_item = decoded_jwt_payload[find_item]
    return finded_item


"""
token으로 사용자명칭 얻기
@param token
@return
"""
def getUsernameFromToken(token):
    return getClaimFromToken(token, 'sub')

"""
token 만료여부
@param token
@return
"""
def isTokenExpired(token):
    exp = getClaimFromToken(token, "exp")
    
    # error
    if (exp == "expired" or exp == "error"):		
        return True
        
    now = int(time.time())     # secs
    return (now > exp)


"""
Token validate
@param username
@return
"""
def validateToken(token):
    decoded_jwt_payload = decodeToken(token)
    if (decoded_jwt_payload == "error"):
        print("unverified : error")
        return False
    elif (decoded_jwt_payload == "expired"):
        print("unverified : expired")
        return False
    else:
        print("verified")

    return True


"""
로그아웃된 토큰인지 체크
@param token
@return
"""
def isSignoutToken(token, app):
    # 로그아웃 토큰
    try:
        sql = '''
            SELECT COUNT(*)
            FROM logout
            WHERE token = %s
            '''
        
        get_exists = app.database.execute(sql, (token)).fetchone()
        cnt = get_exists[0]
        
        if cnt > 0 :
            print("invalid token : already sign out")
            return True
            
        else:
            print("valid token : not sign out")
            return False
    
    except Exception as e:
        print("error")
        return False
        
    # 로그아웃 X 토큰
    else:
        print("valid token : not sign out")
        return False
        
        
"""
모든 api의 헤더 토큰 체크
@param request
@return
"""
def isAuthorized(hdr, app):
    # bearer 토큰
    token_header = hdr['Authorization']
    if (token_header != None and token_header.startswith("Bearer ") == True):
        token = token_header.split(" ")[1]
        
    # 토큰 유효성 체크
    if (validateToken(token) == False or isSignoutToken(token, app) == True):
        return False
        
    return True

"""
userinfo 민감정보 제거
"""
def updateUserInfo(userInfo):
    userInfo.pop('authorities', None)
    userInfo.pop('accountNonExpired', None)
    userInfo.pop('accountNonLocked', None)
    userInfo.pop('credentialsNonExpired', None)
    userInfo.pop('enabled', None)
    userInfo.pop('companyCd', None)
    userInfo.pop('agencyCd', None)
    userInfo.pop('deptCd', None)
    userInfo.pop('positionCd', None)
    userInfo.pop('positionNm', None)
    userInfo.pop('statusCd', None)
    userInfo.pop('twoFactorEnable', None)

"""
userinfo masking 처리
"""
def maskingUserInfo(userInfo):
    userInfo["username"] = toMasking(userInfo["username"],"1")
    userInfo["name"] = toMasking(userInfo["name"],"1")
    userInfo["companyNm"] = toMasking(userInfo["companyNm"],"1")
    userInfo["agencyNm"] = toMasking(userInfo["agencyNm"],"1")
    userInfo["deptNm"] = toMasking(userInfo["deptNm"],"1")
    userInfo["telNo"] = toMasking(userInfo["telNo"],"2")
    userInfo["email"] = toMasking(userInfo["email"],"3")

class AuthError(Exception):
    def __init__(self, value):
        self.value = value
    def __str__(self):
        return self.value
        