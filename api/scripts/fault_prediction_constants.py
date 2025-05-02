"""
상수 정의 모듈
"""

# 기본 메시지
DEFAULT_PROMPT_START_MESSAGE = "아래 입력된 장애내역과 경보현황을 기준으로 장애원인인 장애점을 찾아서 분석해줘."
GREETING_MESSAGE = "안녕하세요! 도서국사 NW 장애점 찾기 AI 서비스입니다. 장애 현상이나 경보 내역을 알려주시면 유사한 장애사례를 추출하여 장애점을 추론합니다."
HELP_MESSAGE = """
<AI Detector 장애점 찾기 도움말>
1. 분야별/장비별 장애 증상과 경보/알람 내역을 입력하면 더 정확한 결과를 얻을 수 있습니다.
2. 입력된 내용을 기준으로 유사한 장애사례 상위 3개를 추출하여 장애점을 추론합니다. 
3. 장애점 추론 1은 과거 유사 사례 기반 추론, 장애점 추론 2는 패턴 분석 기반 추론을 제공합니다.
"""

# 분야별 키워드 맵 - 전역 변수
FIELD_KEYWORDS = {
    "IP": [
        "IP 분야", "NMS 경보", "Syslog 경보", "OLT", "SER",
        "ONT", "RN", "L2", "L3", "PE", "Ntopia", "Ping 무응답",
        "F\\d{3}", "IP", "MAC", "chassis", "스위치", "라우터", "중계라우터",
        "PIM Neighbor", "L4", "신인증", "E320", "MER", "MCR", "MX960",
        "GS4K", "GS4000", "C6506", "C6506E", "C6509", "CSR", "CRS", "OSPF",
        "7750", "7750SR", "7950XRS", "P7024", "U9500", "T4000", "T-4000",
        "A7750SR", "T1600", "T6100", "E6100", "M320", "MPC", "PSU", "BCU",
        "FPC", "NST", "프리미엄 PE", "MSG", "MDS", "MDG", "NOG", "PIM",
        "Neighbor", "BGP", "IS IS", "ISIS", "QSAS", "Next hop", "DNS", "DHCP",
        "스태틱", "라우팅", "Static Route", "Ethernet", "이더넷", "TCP", "UDP",
        "ACL", "멀티캐스트", "싱크홀", "DDos", "VPN", "Rate Limit", "i-foms",
        "tacs", "ism", "SEA", "CRC", "SoIP", "프리미엄 중계", "코넷 중계",
        "Kornet", "Premium", "switch fabric", "XPL", "SIP", "MSC", "IPS", "PET",
        "MQChip", "LUCHIP", "GOR", "MDA", "GOA", "Giga Office", "기가 오피스"
    ],
    "전송": [
        "전송 분야", "ROADM", "NG-ROADM", "NG ROADM", "LH-ROADM",
        "LH ROADM", "M-ROADM", "M ROADM", "MSPP", "PTN", "PTS",
        "POTN", "MUT LOS", "OSC LOS", "STM64 LOS", "AU AIS", "GFP FAIL", "MEP LSP LOC",
        "STM", "MS-AIS", "AU-AIS", "TU-AIS", "LINK-FAIL", "OPT-PWR-LOW", "SD",
        "이더넷 유니트", "Link down", "MEP_LSP_RDI"
    ],
    "교환": [
        "교환 분야", "AGW", "CGW", "CGW L3", "BCN",
        "POTS", "PE", "A1930", "A1935", "A6200", "A6000", "A6010", "A6300",
        "A\\d{4}", "교환기", "통화용 L3", "BcN", "AGW Fail", "UP0 LINK FAIL",
        "UP LINK ALL FAIL", "LACP UP0(A) FAIL", "LACP UP1(B) FAIL",
        "L3 DISCONNECTED", "CONN(TDXAGW DISCONNECTED)", "T1 TIME OUT"
    ],
    "MW": [
        "MW", "MW", "마이크로웨이브", "마이크로 웨이브", "MicroWave", "Micro Wave",
        "fading", "페이딩", "전파", "RF", "도파관", "CTR-8540", "IP-20N", "CDM-SMR", "CDM", "SMR",
        "IDU", "안테나", "철탑", "Radio", "CDM", "CTR", "ECLIPSE", "FibeAir", "IPDN", "IP20", "ISR",
        "IP-10G", "IP20C", "IP-20F", "IP20N", "SMR9600", "STR-4500", "XR6000", "iPASOLINK", "MDM", "BAGW",
        "LOST CONTACT", "AIS-INSERT", "DEMOD SYNC LOSS", "Radio loss of frame",
        "Remote communication failure", "Loss of STM-1", "RF INPUT LOS", "TX LO", "RX LO",
        "결빙", "아이싱", "icing"
    ],
    "선로": [
        "선로 분야", "선로", "광케이블", "케이블", "한전 케이블", "한전 광케이블",
        "사외공사장", "사외 공사장", "광선로", "광레벨", "광점퍼 코드", "임차광",
        "광케이블 피해", "한전 임차광", "절단", "광케이블 절단", "끊김", "도서국사",
        "선로 피해", "선로 장애", "광 손실", "광 절체", "광케이블 재접속"
    ],
    "무선": [
        "무선 분야", "무선", "무선망", "기지국", "RU", "DU", "CU", "RRH", "BBU", "MIMO",
        "5G", "4G", "LTE", "안테나", "무선 AP", "무선 중계기", "무선 장비", "셀", "섹터",
        "무선 신호", "5G기지국", "4G기지국", "무선 커버리지", "무선 네트워크", "RSSI",
        "RSRP", "RSRQ", "무선 주파수", "무선 대역폭", "RRC", "무선 간섭", "무선 채널",
        "무선 트래픽", "무선 품질", "무선 성능", "무선 리소스", "무선 전송"
    ],
    "전원": [
        "전원 분야", "발전기", "UPS", "배터리", "축전지", "MOF", "Fuse", "퓨즈 소손",
        "한전 정전", "CTTS", "CT", "PT", "ACB", "VCB", "정전", "상전", "AC",
        "DC", "교류", "직류", "전원 장애", "Battery", "변전소", "발전차", "퓨즈",
        "방전", "변압기", "배터리 모드"
    ],
}

# 장비 계층 관계 정의
EQUIPMENT_HIERARCHY = {
    "상위장비": {
        "OLT": ["ONT", "RN"],
        "L3": ["L2", "스위치"],
        "Ntopia": ["OLT", "L3"],
        "ROADM": ["MSPP", "PTN"],
        "MSPP": ["PTN"],
        "한전 광케이블": ["OLT", "ROADM", "MSPP", "PTN", "AGW", "MW"]
    },
    "하위장비": {
        "ONT": ["OLT"],
        "RN": ["OLT"],
        "L2": ["L3", "Ntopia"],
        "OLT": ["Ntopia"],
        "MSPP": ["ROADM"],
        "PTN": ["ROADM", "MSPP"]
    }
}

# 분야별 특화 장애 패턴 정의
SPECIALIZED_FAULT_PATTERNS = {
    "IP": [
        {
            "조건": {
                "키워드": ["OLT"],
                "하위장비": [["ONT", "RN"]],  # 하위 장비 중 하나 이상 필요
                "필수_키워드_수": 2  # IP 분야 키워드가 최소 2개 이상 필요
            },
            "결과": {
                "장애점": "OLT 장비 불량",
                "장애분야": "IP",
                "신뢰도": 70,
                "근거": [
                    "OLT 및 하위 장비(ONT/RN)에서 다수 경보 발생",
                    "상위 장비인 OLT의 장애가 하위 장비에 영향을 미침"
                ],
                "패턴_근거": "상위 장비에 연결된 하위 장비들의 경보가 다수 발생"
            }
        },
        {
            "조건": {
                "키워드": ["Ntopia", "엔토피아"],  # 둘 중 하나 필요
                "필수_키워드_수": 2
            },
            "결과": {
                "장애점": "Ntopia 스위치 불량",
                "장애분야": "IP",
                "신뢰도": 65,
                "근거": [
                    "Ntopia 스위치 및 연결된 장비에서 다수 경보 발생",
                    "중앙 스위치 장애 시 다수의 하위 장비에 영향"
                ],
                "패턴_근거": "상위 장비에 연결된 하위 장비들의 경보가 다수 발생"
            }
        },
        {
            "조건": {
                "키워드": ["L3"],
                "하위장비": [["L2", "스위치"]],
                "필수_키워드_수": 2
            },
            "결과": {
                "장애점": "L3 라우터 불량",
                "장애분야": "IP",
                "신뢰도": 68,
                "근거": [
                    "L3 라우터 및 하위 장비(L2/스위치)에서 다수 경보 발생",
                    "상위 장비인 L3 라우터의 장애가 하위 장비에 영향"
                ],
                "패턴_근거": "상위 장비에 연결된 하위 장비들의 경보가 다수 발생"
            }
        }
    ],
    "전송": [
        {
            "조건": {
                "키워드": ["ROADM"],
                "하위장비": [["MSPP", "PTN"]],
                "필수_키워드_수": 2
            },
            "결과": {
                "장애점": "ROADM 장비 불량",
                "장애분야": "전송",
                "신뢰도": 70,
                "근거": [
                    "ROADM 및 하위 장비(MSPP/PTN)에서 다수 경보 발생",
                    "전송 네트워크의 상위 장비인 ROADM의 장애가 하위 장비에 영향"
                ],
                "패턴_근거": "상위 장비에 연결된 하위 장비들의 경보가 다수 발생"
            }
        },
        {
            "조건": {
                "키워드": ["MSPP"],
                "하위장비": [["PTN"]],
                "필수_키워드_수": 2
            },
            "결과": {
                "장애점": "MSPP 장비 불량",
                "장애분야": "전송",
                "신뢰도": 65,
                "근거": [
                    "MSPP 및 하위 장비(PTN)에서 다수 경보 발생",
                    "MSPP 장비 장애 시 PTN에 영향을 미침"
                ],
                "패턴_근거": "상위 장비에 연결된 하위 장비들의 경보가 다수 발생"
            }
        }
    ],
    "MW": [
        {
            "조건": {
                "키워드": ["도파관", "결빙", "아이싱", "icing"],
                "필수_키워드_수": 1
            },
            "결과": {
                "장애점": "MW 도파관 결빙",
                "장애분야": "MW",
                "신뢰도": 75,
                "근거": [
                    "MW 도파관 관련 키워드 발견",
                    "MW 장비에서 통신 불량 경보 발생"
                ],
                "패턴_근거": "MW 도파관 결빙은 전형적인 장애 패턴"
            }
        },
        {
            "조건": {
                "키워드": ["IDU", "불량", "MW 장비"],
                "필수_키워드_수": 2
            },
            "결과": {
                "장애점": "MW IDU 장비 불량",
                "장애분야": "MW",
                "신뢰도": 72,
                "근거": [
                    "MW IDU 관련 키워드 발견",
                    "MW 장비 자체 경보 발생"
                ],
                "패턴_근거": "MW IDU 장비 불량은 전형적인 패턴"
            }
        }
    ],
    "교환": [
        {
            "조건": {
                "키워드": ["AGW", "Fail"],
                "필수_키워드_수": 2
            },
            "결과": {
                "장애점": "AGW 장비 불량",
                "장애분야": "교환",
                "신뢰도": 70,
                "근거": [
                    "AGW Fail 경보 발생",
                    "교환 분야 AGW 장비에서 다수 경보 발생"
                ],
                "패턴_근거": "교환기 AGW 불량은 전형적인 장애 패턴"
            }
        }
    ],
    "선로": [
        {
            "조건": {
                "키워드": ["선로", "광케이블", "한전 광케이블", "임차광"],
                "필수_키워드_수": 1,
                "분야_개수": 3  # 최소 3개 이상의 분야에서 장비 언급
            },
            "결과": {
                "장애점": "한전 광케이블 장애",
                "장애분야": "선로",
                "신뢰도": 85,
                "근거": [
                    "여러 분야(IP, 전송, 교환 등)에서 다수 경보 발생",
                    "광케이블 관련 키워드 발견"
                ],
                "패턴_근거": "여러 분야에서 동시 다발적 경보는 선로 장애의 특징"
            }
        }
    ],
    "전원": [
        {
            "조건": {
                "키워드": ["정전", "배터리 모드", "UPS", "한전"],
                "필수_키워드_수": 1
            },
            "결과": {
                "장애점": "한전 정전",
                "장애분야": "전원",
                "신뢰도": 75,
                "근거": [
                    "전원 관련 키워드 발견",
                    "장비들이 배터리 모드로 동작 중"
                ],
                "패턴_근거": "한전 정전으로 인한 장비 배터리 모드 전환"
            }
        }
    ],
    "무선": [
        {
            "조건": {
                "키워드": ["기지국", "5G", "4G", "LTE", "셀", "무선", "무선망"],
                "필수_키워드_수": 2
            },
            "결과": {
                "장애점": "무선 기지국 장애",
                "장애분야": "무선",
                "신뢰도": 75,
                "근거": [
                    "무선 기지국 관련 키워드 다수 발견",
                    "무선 네트워크 경보 발생"
                ],
                "패턴_근거": "무선 기지국 장애는 전형적인 무선 분야 패턴"
            }
        },
        {
            "조건": {
                "키워드": ["RU", "DU", "CU", "안테나", "RRH", "BBU"],
                "필수_키워드_수": 1
            },
            "결과": {
                "장애점": "무선 장비 불량",
                "장애분야": "무선",
                "신뢰도": 70,
                "근거": [
                    "무선 장비 관련 키워드 발견",
                    "무선 장비에서 경보 발생"
                ],
                "패턴_근거": "무선 장비 불량은 전형적인 무선 분야 패턴"
            }
        }
    ]
}

# 경보 패턴 사전 정의 (확장)
ALERT_PATTERNS = {
    "전송": [
        r"ROADM\s*\([^)]+\)",  # ROADM 관련 경보
        r"MSPP\s*\([^)]+\)",  # MSPP 관련 경보
        r"PTN\s*\([^)]+\)",  # PTN 관련 경보
        r"MUT_LOS|OSC-LOS|STM\d+_LOS|AIS\/LOS",  # 각종 LOS 경보
        r"MS-AIS|AU-AIS|TU-AIS|GFP-FAIL",  # 각종 AIS/FAIL 경보
        r"LINK-FAIL|OPT-PWR-LOW",  # LINK 및 전력 관련 경보
        r"MEP_LSP_LOC|MEP_LSP_RDI",  # MEP 관련 경보
        r"SNMP_ERR|ETHER_LINK_DOWN|PPP Fail",  # SNMP 및 링크 관련 경보
        r"SD\([^)]+\)",  # SD 경보
    ],
    "IP": [
        r"SNMP\s+OperStatus(?:\([^)]+\))?",  # SNMP OperStatus 경보
        r"Ping\s+무응답|SNMP Agent\s+무응답",  # Ping/Agent 무응답
        r"Port\s+Down|포트\s*다운",  # 포트 다운 경보
        r"PIM\s+Neighbor\s+Down",  # PIM Neighbor Down
        r"CRC\s+(?:오류|에러)",  # CRC 오류/에러
        r"FTTH\s+[^,]+",  # FTTH 관련 경보
        r"OLT\s*\([^)]+\)",  # OLT 관련 경보
        r"L[23]\s*\([^)]+\)",  # L2/L3 관련 경보
        r"F\d{3}",  # F로 시작하는 숫자 코드
        r"XLG\d+",  # XLG 코드
    ],
    "MW": [
        r"MW",  # MW 일반 언급
        r"LOST\s+CONTACT|AIS-INSERT",  # LOST CONTACT, AIS-INSERT
        r"DEMOD\s+SYNC\s+LOSS",  # DEMOD SYNC LOSS
        r"Radio\s+loss\s+of\s+frame|Radio\s+excessive\s+BER",  # Radio 관련 경보
        r"Remote\s+communication\s+failure",  # Remote communication failure
        r"RF\s+INPUT\s+LOS|TX\s+LO|RX\s+LO",  # RF, TX, RX 관련 경보
        r"Loss\s+of\s+STM-\d+/OC-\d+",  # STM/OC 관련 손실
        r"CDM-SMR",  # CDM-SMR 장비
        r"IP-20N",  # IP-20N 장비
    ],
    "교환": [
        r"A\d{4}(?:\s*\([^)]+\))?|\(AGW Fail\)",  # A로 시작하는 교환 경보 (A1930 등)
        r"UP\d+\s+LINK\s+FAIL|UP\d+\s+LINK\s+FAIL\s+ALARM",  # UP LINK FAIL 경보
        r"UP\s+LINK\s+ALL\s+FAIL|UP\s+LINK\s+ALL\s+FAIL\s+ALARM",  # UP LINK ALL FAIL 경보
        # LACP 관련 경보
        r"LACP\s+UP\d+\([AB]\)\s+FAIL|LACP\s+UP\d+\([AB]\)\s+FAIL\s+ALARM",
        r"L3\s+DISCONNECTED|L3\s+DISCONNECTED\s+ALARM",  # L3 DISCONNECTED
        # TDXAGW DISCONNECTED
        r"TDXAGW\s+DISCONNECTED|CONN\(TDXAGW\s+DISCONNECTED\)",
        r"T1\s+TIME\s+OUT|T1\s+TIME\s+OUT\s+ALARM",  # T1 TIME OUT
    ],
    "선로": [
        r"광케이블\s+(?:피해|절단|장애)",  # 광케이블 관련 경보
        r"한전\s+(?:광케이블|임차광)",  # 한전 광케이블 관련
        r"선로\s+(?:피해|장애)",  # 선로 관련 경보
        r"도서국사(?:\s+구간)?\s+(?:한전\s+)?광케이블",  # 도서국사 광케이블
    ],
    "전원": [
        r"(?:한전|AC|DC)\s+정전",  # 정전 관련 경보
        r"배터리\s+모드",  # 배터리 모드
        r"UPS\s+(?:장애|불량)",  # UPS 관련 경보
        r"발전기\s+(?:장애|불량)",  # 발전기 관련 경보
        r"축전지\s+(?:방전|장애)",  # 축전지 관련 경보
    ]
}

# 분석 질문 판단을 위한 키워드
ANALYSIS_KEYWORDS = [
    "왜", "이유", "원인", "무엇이", "영향", "분석", "조치", "근본",
    "다른 경우", "차이점", "가능성", "추론", "예측", "추정", "판단",
    "어떻게", "방법", "해결", "설명", "의견", "관계", "의미"
]

FAULT_LOCATION_KEYWORDS = [
    "장애점", "어디", "위치", "어느", "찾아줘", "찾기",
    "알려줘", "조회", "검색", "원인", "장애원인"
]

# 경보 패턴 분석을 위한 키워드 상수
EQUIPMENT_KEYWORDS = [
    "MW", "MW", "OLT", "ROADM", "MSPP", "PTN", "GBIC", "Radio",
    "셀프", "유니트", "보드", "OJC", "광점퍼 코드", "광케이블",
    "마이크로 웨이브", "케이블", "광레벨", "선로", "한전광", "AGW",
    "POTN", "SER", "L2", "L3", "스위치", "POTS", "CGW", "DU",
    "GS4K", "GS4000", "ONT", "RN", "Ntopia", "엔토피아", "MX960",
    "CDM-SMR", "IP-20N", "A1930", "A6200", "A6000", "A6010",
    "A6210", "A6220", "A6230", "A6231", "A6300", "IDU", "도파관"
]

ALERT_TYPE_KEYWORDS = [
    "다운", "불량", "장애", "결빙", "아이싱", "레벨 저하", "통신 불량",
    "절체", "선로 피해", "사외 공사장 피해", "광케이블 피해", "정전",
    "광케이블 절단", "끊김", "페이딩", "Fading", "LOS", "AIS", "RDI",
    "CSF", "Port Down", "포트 다운", "Ping 무응답", "CRC 에러", "링크 다운",
    "SNMP 무응답", "셀프 불량", "유니트 불량", "UP LINK FAIL", "L3 DISCONNECTED",
    "배터리 모드", "한전 정전", "수신 레벨 저하", "도파관 불량"
]

# 장애 증상 키워드
SYMPTOM_KEYWORDS = [
    "인터넷 끊김", "인터넷 서비스 불가", "통화 불량", "서비스 장애", "먹통", "고장",
    "속도 저하", "수시 장애", "CRC 에러", "인터넷 속도 저하", "불량", "문제", "오류", "에러",
    "접속 지연", "순단 현상", "순단", "절단", "피해", "단절", "통신 불량", "품질 저하"
]

# 장애점 키워드와 관련 조치
FAULT_POINT_ACTIONS = {
    "한전 광케이블": [
        "한전 임차광 재접속",
        "광케이블 복구",
        "선로 절체"
    ],
    "도파관": [
        "도파관 결빙 해소",
        "도파관 교체",
        "도파관 점검"
    ],
    "MW IDU": [
        "MW IDU 교체",
        "IDU 리셋",
        "펌웨어 업데이트"
    ],
    "한전 정전": [
        "한전 복전 대기",
        "발전차 가동",
        "UPS 백업 전환"
    ],
    "OLT": [
        "OLT 리셋",
        "OLT 포트 교체",
        "OLT 카드 교체"
    ],
    "ROADM": [
        "ROADM 리셋",
        "ROADM 포트 교체",
        "광레벨 점검"
    ]
}
