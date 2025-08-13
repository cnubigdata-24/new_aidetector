import time
from flask import request

"""
사용자 접속IP 취득
@author 91279337
@since  2022/09/28
@param
@return clientIp
"""
def getClientIp():
    ip = ''
    if request.environ.get('HTTP_X_FORWARDED_FOR') is None:
        ip = request.environ.get('HTTP_X_REAL_IP', request.remote_addr)
    else:
        ip = request.environ['HTTP_X_FORWARDED_FOR']

    return ip

def getCurrentTimeMills():
    return round(time.time() * 1000)