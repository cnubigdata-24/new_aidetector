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
def toMasking(targetStr, pattern):

    if(pattern == "1"):
        # 이름 / 외국인이름
        result = nameMasking(targetStr)
        return result
    elif(pattern == "2"):
        # 전화(핸드폰/일반전화)
        result = telNoMasking(targetStr)
        return result
    elif(pattern == "3"):
        # 이메일
        result = emailMasking(targetStr)
        return result
    elif(pattern == "4"):
        # IP
        result = ipMasking(targetStr)
        return result
    elif(pattern == "5"): 
        # 패스워드
        result =  masking(targetStr, "*", 0, len(targetStr))
        return result
    else:
        return targetStr

"""
성명 마스킹
@param targetStr
@return 성명 마스킹 된 값
"""
def nameMasking(targetStr):
    if(len(targetStr) == 0):
        return "ERROR"

    if(len(targetStr) == 1):
        # 이름 : 한글(1글자) : 뒤 1글자 숨김(예:홍 -> *)
        return masking(targetStr, "*", 0, len(targetStr))
    elif(len(targetStr) == 2 or len(targetStr) == 3):
        # 이름 : 한글(2글자) : 뒤 1글자 숨김(예:홍*), 이름 : 한글(3글자) : 뒤 1글자 숨김(예:홍길*)
        return masking(targetStr, "*", len(targetStr) - 1, len(targetStr))
    elif(len(targetStr) == 4):
        # 이름 : 한글(4글자) : 뒤 2글자 숨김(예:홍길**)
        return masking(targetStr, "*", len(targetStr) - 2, len(targetStr))
    else:
        # 외국인이름 : 한글(3글자외) 외국인 : 글자수 기준 뒤1/3, 반올림(예: HongGil****)
        return masking(targetStr, "*", round(float(len(targetStr)) / float(3) * float(2)), len(targetStr))


"""
전화번호 마스킹
@param targetStr
@return 전화번호 마스킹 된 값
"""
def telNoMasking(targetStr):
    if(len(targetStr) == 0 or len(targetStr) < 8 or len(targetStr) > 17):
        return "ERROR"

    # "+82" 여부 체크
    b82 = False
    b82Dash = False
    b82Space = False
    if(targetStr.find("+82") > -1):
        b82 = True
        if(targetStr.find("+82-") > -1):
            b82Dash = True
            targetStr = targetStr.replace("+82-", "")
        elif(targetStr.find("+82 ") > -1):
            b82Space = True
            targetStr = targetStr.replace("+82 ", "")
        else:
            targetStr = targetStr.replace("+82", "")

    # "-" 여부 체크
    bDash = False
    # " " 여부 체크
    bSpace = False
    telno1 = ""
    telno2 = ""
    telno3 = ""
    sTelNoLength = len(targetStr)

    if(targetStr.find("-") > -1):
        if(targetStr.replace("-", "").isnumeric() == False):
            return "ERROR"

        bDash = True
        arrTel = targetStr.split("-")
        if(len(arrTel) == 2):
            if(len(arrTel[0]) > 0):
                telno1 = ""
                telno2 = arrTel[0]
                telno3 = arrTel[1]
            else:
                return "ERROR"
        elif(len(arrTel) == 3):
            if(len(arrTel[0]) == 0 or len(arrTel[1]) == 0 or len(arrTel[2]) == 0):
                return "ERROR"

            telno1 = arrTel[0]
            telno2 = arrTel[1]
            telno3 = arrTel[2]
        else:
            return "ERROR"
    elif(targetStr.find(" ") > -1):
        if(targetStr.replace(" ", "").isnumeric() == False):
            return "ERROR"

        bSpace = True
        arrTel = targetStr.split(" ")
        if(len(arrTel) == 2):
            if(len(arrTel[0]) > 0):
                telno1 = ""
                telno2 = arrTel[0]
                telno3 = arrTel[1]
            else:
                return "ERROR"
        elif(len(arrTel) == 3):
            if(len(arrTel[0]) == 0 or len(arrTel[1]) == 0 or len(arrTel[2]) == 0):
                return "ERROR"

            telno1 = arrTel[0]
            telno2 = arrTel[1]
            telno3 = arrTel[2]
        else:
            return "ERROR"

    else:
        if(targetStr.isnumeric() == False):
            return "ERROR"

        if(targetStr[0:2] == "02"):
            # 3자리 국번
            if(sTelNoLength <= 9):
                telno1 = targetStr[0:2]
                telno2 = targetStr[2:5]
                telno3 = targetStr[5:sTelNoLength]
            # 4자리 국번
            elif(sTelNoLength >= 10):
                telno1 = targetStr[0:2]
                telno2 = targetStr[2:6]
                telno3 = targetStr[6:sTelNoLength]
        else:
            # 지역번호 없음
            if(sTelNoLength == 8 or sTelNoLength == 9):
                telno1 = ""
                telno2 = targetStr[0:4]
                telno3 = targetStr[4:sTelNoLength]
            # 3자리 국번
            elif(sTelNoLength == 10):
                telno1 = targetStr[0:3]
                telno2 = targetStr[3:6]
                telno3 = targetStr[6:sTelNoLength]
            # 전화, 핸드폰
            elif(sTelNoLength == 11):
                telno1 = targetStr[0:3]
                telno2 = targetStr[3:7]
                telno3 = targetStr[7:sTelNoLength]
            # 인터넷전화 등 그외
            elif(sTelNoLength >= 12):
                telno1 = targetStr[0:4]
                telno2 = targetStr[4:8]
                telno3 = targetStr[8:sTelNoLength]

    rtnVal = ""

    # "-"가 있을 경우
    if(bDash == True):
        telno2MaskLen = 0
        if(len(telno2) == 1):
            telno2MaskLen = 0
        elif(len(telno2) == 2):
            telno2MaskLen = 1
        else:
            telno2MaskLen = len(telno2) - 2

        if(len(telno1) == 0):
            rtnVal = masking(telno2, "*", telno2MaskLen, len(telno2)) + "-" + masking(telno3, "*", 0, 1)
        else:
            rtnVal = telno1 + "-" + masking(telno2, "*", telno2MaskLen, len(telno2)) + "-" + masking(telno3, "*", 0, 1)
    # " "가 있을 경우
    elif(bSpace == True):
        telno2MaskLen = 0
        if(len(telno2) == 1):
            telno2MaskLen = 0
        elif(len(telno2) == 2):
            telno2MaskLen = 1
        else:
            telno2MaskLen = len(telno2) - 2

        if(len(telno1) == 0):
            rtnVal = masking(telno2, "*", telno2MaskLen, len(telno2)) + " " + masking(telno3, "*", 0, 1)
        else:
            rtnVal = telno1 + " " + masking(telno2, "*", telno2MaskLen, len(telno2)) + " " + masking(telno3, "*", 0, 1)
    else:
        rtnVal = telno1 + masking(telno2, "*", len(telno2) - 2, len(telno2)) + masking(telno3, "*", 0, 1)

    # "+82"가 있을 경우
    if(b82 == True):
        if(b82Dash == True):
            rtnVal = "+82-" + rtnVal
        elif(b82Space == True):
            rtnVal = "+82 " + rtnVal
        else:
            rtnVal = "+82" + rtnVal

    return rtnVal


"""
Email 마스킹
@param targetStr
@return Email 마스킹 된 값
"""
def emailMasking(targetStr):
        if(len(targetStr) == 0):
            return "ERROR"

        # 이메일
        if( targetStr.find("@") != -1 and targetStr.find(".") != -1 ):

            tmpEmail = targetStr.split("@")
            if(len(tmpEmail) != 2 or len(tmpEmail[0]) == 0):
                return "ERROR"

            tmpEmailLeft = ""
            # 이메일 왼쪽부분이 1글자 : 뒤 1글자 숨김(예:a@kt.com -> *@kt.com)
            if(len(tmpEmail[0]) == 1):
                tmpEmailLeft = masking(tmpEmail[0], "*", 0, len(tmpEmail[0]))
            # 이메일 왼쪽부분이 2글자 : 뒤 1글자 숨김(예:ab@kt.com -> a*@kt.com), 이메일 왼쪽부분이 3글자 : 뒤 1글자 숨김(예:abc@kt.com -> ab*@kt.com)
            elif(len(tmpEmail[0]) == 2 or len(tmpEmail[0]) == 3):
                tmpEmailLeft = masking(tmpEmail[0], "*", len(tmpEmail[0]) - 1, len(tmpEmail[0]))
            # 이메일 왼쪽부분이 4글자 : 뒤 2글자 숨김(예:abcd@kt.com -> ab**@kt.com)
            elif(len(tmpEmail[0]) == 4):
                tmpEmailLeft = masking(tmpEmail[0], "*", len(tmpEmail[0]) - 2, len(tmpEmail[0]))
            # 이메일 왼쪽부분이 5글자 이상: 뒤 3글자 숨김(예:abcde@kt.com -> ab***@kt.com)
            else:
                tmpEmailLeft = masking(tmpEmail[0], "*", len(tmpEmail[0]) - 3, len(tmpEmail[0]))

            return tmpEmailLeft + "@" + tmpEmail[1]

        else:
            return "ERROR"


"""
IP 마스킹
@param targetStr
@return IP 마스킹 된 값
"""
def ipMasking(targetStr):
    rtnVal = ""
    if(len(targetStr) == 0 or len(targetStr) < 7 or len(targetStr) > 15):
        return "ERROR"

    # "." 으로 ip가 구분되었을 경우
    if (targetStr.find(".") > -1):
        if(targetStr.replace(".", "").isnumeric() == False):
            return "ERROR"

        arrIP = targetStr.split(".")

        if(len(arrIP) != 4):
            return "ERROR"
        # IPV4의 경우
        elif (len(arrIP) == 4):
            for str in arrIP:
                # "0~255" 이외의 숫자이면 ERROR
                if(int(str) > 255):
                    return "ERROR"

            ipgroup0 = ""
            ipgroup2 = ""
            # 3자리씩 끊어서 IP그룹을 만든다.(첫째 3자리씩 마스킹, 셋째 3자리씩 마스킹)
            ipgroup0 =  masking(arrIP[0], "*", 0, len(arrIP[0]))
            ipgroup2 =  masking(arrIP[2], "*", 0, len(arrIP[2]))
            rtnVal = ipgroup0 + "." + arrIP[1] + "." + ipgroup2 + "." + arrIP[3]

    else:
        if(len(targetStr) < 10 or len(targetStr) > 12 or targetStr.isnumeric() == False):
            return "ERROR"

        # 3자리씩 끊어서 IP그룹을 만든다.
        ipgroup0 = targetStr[0:3]
        ipgroup1 = targetStr[3:6]
        ipgroup2 = targetStr[6:9]
        ipgroup3 = targetStr[9:]
        # "0~255" 이외의 숫자이면 ERROR
        if(int(ipgroup0) > 255 or int(ipgroup1) > 255
                or int(ipgroup2) > 255 or int(ipgroup3) > 255):
            return "ERROR"

        # 첫째 3자리씩 마스킹, 셋째 3자리씩 마스킹
        ipgroup0 =  masking(ipgroup0, "*", 0, len(ipgroup0))
        ipgroup2 =  masking(ipgroup2, "*", 0, len(ipgroup2))

        rtnVal = ipgroup0 + ipgroup1 + ipgroup2 + ipgroup3

    return rtnVal


"""
마스킹 처리
@param targetStr : 마스킹 대상
@param overlay : 치환 문자
@param start : 시작위치
@param end : 끝위치
@return 마스킹 처리된 값
"""
def masking(targetStr, overlay, start, end):
    if(start > end):
        repeat = 0
    else:
        repeat = end - start

    return targetStr[0:start] + overlay*repeat + targetStr[end:len(targetStr)]
