import requests, json
from jwtTokenUtil import *
from maskingUtil import *

"""
마스킹
@author 91279337
@since  2022/06/24
@param targetStr : 마스킹 대상 문자
@param pattern
        "1" : 이름 / 외국인이름 : 한글(세글자) : 뒤 1글자 숨김(예:홍길*) / 한글(세글자외)/외국인 : 글자수 기준 뒤1/3, 반올림(예: HongGil****)
        "2" : 전화(핸드폰/일반전화) : 국번 뒤2글자 번호앞 1글자 숨김(예: 010-12**-*678)
        "3" : Email : 뒤 3글자  숨김(예:hongkild***@kt.com)
        "4" : IP : 첫째, 셋째 3자리씩 숨김(***.123.***.123)
        "5" : 패스워드 : 모두 숨김(예: ********)
@return
"""
def runMasking(hdr, req, app):
    try:
        if (isAuthorized(hdr, app) == False):
            raise AuthError("token is unauthorized.")

        if 'targetStr' not in req:
            raise Exception('[targetStr] key does not exist in your parameters.')
        if 'pattern' not in req:
            raise Exception('[pattern] key does not exist in your parameters.')

        targetStr = req['targetStr']
        pattern = req['pattern']

        if(pattern == "1"):
            # 이름 / 외국인이름
            result = toMasking(targetStr, pattern)
            if(result == "ERROR"):
                ret = {"returnCode": "NG"}
                ret.update({"message": "마스킹 처리 되지 않음."})
                ret.update({"data": targetStr})
                return ret
            else:
                ret = {"returnCode": "OK"}
                ret.update({"message": "이름 / 외국인이름 마스킹 완료."})
                ret.update({"data": result})
                return ret
        elif(pattern == "2"):
            # 전화(핸드폰/일반전화)
            result = toMasking(targetStr, pattern)
            if(result == "ERROR"):
                ret = {"returnCode": "NG"}
                ret.update({"message": "마스킹 처리 되지 않음."})
                ret.update({"data": targetStr})
                return ret
            else:
                ret = {"returnCode": "OK"}
                ret.update({"message": "전화(핸드폰/일반전화) 마스킹 완료."})
                ret.update({"data": result})
                return ret
        elif(pattern == "3"):
            # 이메일
            result = toMasking(targetStr, pattern)
            if(result == "ERROR"):
                ret = {"returnCode": "NG"}
                ret.update({"message": "마스킹 처리 되지 않음."})
                ret.update({"data": targetStr})
                return ret
            else:
                ret = {"returnCode": "OK"}
                ret.update({"message": "이메일 마스킹 완료."})
                ret.update({"data": result})
                return ret
        elif(pattern == "4"):
            # IP
            result = toMasking(targetStr, pattern)
            if(result == "ERROR"):
                ret = {"returnCode": "NG"}
                ret.update({"message": "마스킹 처리 되지 않음."})
                ret.update({"data": targetStr})
                return ret
            else:
                ret = {"returnCode": "OK"}
                ret.update({"message": "IP 마스킹 완료."})
                ret.update({"data": result})
                return ret
        elif(pattern == "5"): 
            # 패스워드
            result = toMasking(targetStr, pattern)
            if(result == "ERROR"):
                ret = {"returnCode": "NG"}
                ret.update({"message": "마스킹 처리 되지 않음."})
                ret.update({"data": targetStr})
                return ret
            else:
                ret = {"returnCode": "OK"}
                ret.update({"message": "패스워드 마스킹 완료."})
                ret.update({"data": result})
                return ret
        else:
            ret = {"returnCode": "NG"}
            ret.update({"message": "마스킹 처리 되지 않음."})
            ret.update({"data": targetStr})
            return ret
    except Exception as e:
        # 잘못된 토큰 (로그아웃/만료)
        ret = {"returnCode": "NG"}
        ret.update({"message": str(e)})
        return ret
