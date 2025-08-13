"""
### 1. 개선된 벡터DB 생성 모듈 - 장애사례 데이터를 벡터DB로 변환

이 모듈은 JSON 형식의 장애사례 데이터를 읽어 
ChromaDB 벡터 데이터베이스로 최적화하여 저장합니다.
"""

import os
import json
import chromadb
from chromadb.utils import embedding_functions
import uuid
import shutil
import re
import logging
from tqdm import tqdm
import time
from concurrent.futures import ThreadPoolExecutor

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# 상수 정의
VECTOR_DB_DIR = "./chroma_db"
VECTOR_DB_NEW_DIR = "./chroma_db_new"
RAG_DOCUMENT = r"D:\aidetector\static\rag_document\rag_data.json"
EMBEDDING_MODEL = "intfloat/multilingual-e5-base"  # 임베딩 모델 선택
BATCH_SIZE = 20  # 너무 크면 ChromaDB에서 OOM 에러 발생 가능

# 분야별 키워드 맵 - 추론 개선을 위한 추가 데이터
FIELD_KEYWORDS = {
    "IP": [
        "IP 분야", "NMS", "Syslog", "SER", "OLT", "RN", "ONT", "Ntopia",
        "엔토피아", "MX960", "PE", "GS4K", "GS4000", "L2", "L3",
        "Port Down", "포트 다운", "SNMP", "OperStatus", "Ping 무응답",
        "OSPF", "BGP", "PIM", "Neighbor", "CRC", "에러"
    ],
    "전송": [
        "전송 분야", "ROADM", "MSPP", "PTN", "POTN", "OTN", "AIS", "LOS",
        "RDI", "CSF", "MUT_LOS", "OSC-LOS", "STM64_LOS", "AU-AIS", "GFP-FAIL",
        "MEP_LSP_LOC", "LINK-FAIL", "OPT-PWR-LOW", "MS-AIS", "TU-AIS"
    ],
    "교환": [
        "교환 분야", "AGW", "POTS", "SGW", "CGW", "A1930", "A6200", "A6000",
        "A6010", "A6210", "A6220", "A6230", "A6231", "A6300", "UP0 LINK FAIL",
        "UP LINK ALL FAIL", "LACP", "L3 DISCONNECTED", "TDXAGW DISCONNECTED",
        "T1 TIME OUT"
    ],
    "M/W": [
        "M/W", "MW", "마이크로웨이브", "마이크로 웨이브", "MicroWave", "Micro Wave",
        "IP-20N", "페이딩", "Fading", "전파", "CDM-SMR", "LOST CONTACT", "AIS-INSERT",
        "DEMOD SYNC LOSS", "RF INPUT LOS", "TX LO", "RX LO", "Radio loss of frame",
        "Remote communication failure", "Loss of STM-1", "IDU", "도파관", "결빙",
        "아이싱", "icing"
    ],
    "선로": [
        "선로 분야", "선로", "광케이블", "케이블", "한전 케이블", "한전 광케이블",
        "사외공사장", "사외 공사장", "광선로", "광레벨", "광점퍼 코드", "임차광",
        "광케이블 피해", "한전 임차광", "절단", "광케이블 절단", "끊김"
    ],
    "전원": [
        "전원 분야", "발전기", "UPS", "배터리", "축전지", "MOF", "Fuse", "퓨즈 소손",
        "한전 정전", "CTTS", "CT", "PT", "ACB", "VCB", "정전", "상전"
    ],
}


def create_chroma_client():
    """ChromaDB 클라이언트 생성 및 설정"""
    db_dir = VECTOR_DB_DIR
    try:
        if os.path.exists(db_dir):
            logger.info(f"기존 DB 디렉토리 제거: {db_dir}")
            shutil.rmtree(db_dir)
    except Exception as e:
        logger.error(f"주 DB 경로 오류: {e}, 대체 경로 사용")
        db_dir = VECTOR_DB_NEW_DIR

    os.makedirs(db_dir, exist_ok=True)
    logger.info(f"DB 디렉토리: {db_dir}")

    try:
        client = chromadb.PersistentClient(path=db_dir)
        try:
            client.delete_collection("nw_incidents")
        except:
            pass
        return client, db_dir
    except Exception as e:
        logger.error(f"Chroma 클라이언트 오류: {e}")
        return None, None


def extract_alert_codes(alert_text):
    """경보 코드 추출 - 패턴 매칭 최적화"""
    if not alert_text:
        return []

    patterns = [
        r"[A-Z0-9]+_[A-Z0-9]+",  # 언더스코어 포함 코드
        r"[A-Z0-9]+-[A-Z0-9-]+",  # 하이픈 포함 코드
        r"[A-Z][0-9]{4}",        # A 다음 4자리 숫자 코드
        r"(?:STM|OC)-\d+",       # STM/OC 관련 코드
        r"UP\d+\s+LINK\s+(?:ALL\s+)?FAIL",  # UP LINK FAIL 패턴
        r"(?:Port|Link)\s+Down",  # Port/Link Down 패턴
    ]

    all_codes = set()
    for pattern in patterns:
        all_codes.update(re.findall(pattern, alert_text, re.IGNORECASE))

    return list(all_codes)[:20]  # 최대 20개 코드만 사용


def identify_alert_fields(alert_text):
    """경보 텍스트에서 관련 분야 식별"""
    if not alert_text:
        return ["기타"]

    field_scores = {}
    for field, keywords in FIELD_KEYWORDS.items():
        matches = sum(1 for kw in keywords if kw.lower() in alert_text.lower())
        if matches > 0:
            field_scores[field] = matches

    # 가장 많이 매칭된 분야들 반환 (최대 3개)
    if field_scores:
        sorted_fields = sorted(field_scores.items(),
                               key=lambda x: x[1], reverse=True)
        return [field for field, _ in sorted_fields[:3]]

    return ["기타"]


def extract_key_phrases(text, max_phrases=5):
    """중요 구문 추출 - 문서 표현력 향상을 위한 키워드/구문 추출"""
    if not text:
        return []

    # 문장 분리
    sentences = re.split(r'[.!?]\s+', text)

    # 중요 구문 후보들
    patterns = [
        # 장애/불량 관련 구문
        r'(?:장애|고장|불량|이상|비정상|절단|단절|피해|문제|오류|error|fail|down|다운|실패|에러|충돌|트러블|Trouble|무응답|감소|저하|정전)(?:가|이|은|는)?\s+([가-힣A-Za-z0-9_\-\s]+)',
        # 장비 위치 관련 구문
        r'([가-힣A-Za-z0-9_\-\s]+)(?:에서|에)\s+(?:장애|고장|불량|이상|비정상|절단|단절|피해|문제|오류|error|fail|down|다운|실패|에러|충돌|트러블|Trouble|무응답|감소|저하|정전)',
        # 특정 알람/경보 관련 구문
        r'([A-Z0-9\-_]+)\s+(?:알람|경보|에러)(?:가|이)?\s+발생',
    ]

    phrases = set()
    for sentence in sentences:
        for pattern in patterns:
            matches = re.findall(pattern, sentence)
            for match in matches:
                if 3 <= len(match) <= 30:  # 적절한 길이의 구문만 추출
                    phrases.add(match.strip())

    # 결과가 적으면 키워드 기반 추출
    if len(phrases) < 2:
        # 기기명, 경보타입 등 중요 키워드 근처 문구 추출
        key_terms = [
            "OLT", "ROADM", "MSPP", "PTN", "M/W", "IDU", "광케이블",
            "Port Down", "LOS", "AIS", "페이딩", "결빙", "배터리"
        ]
        for term in key_terms:
            if term in text:
                idx = text.find(term)
                start = max(0, idx - 15)
                end = min(len(text), idx + 25)
                phrases.add(text[start:end].strip())

    return list(phrases)[:max_phrases]


def create_metadata(fault_case):
    """장애 사례의 메타데이터 생성 - 정규화 추가"""

    # 장애분야 정규화
    raw_field = fault_case.get("장애분야", "")
    normalized_field = normalize_field_for_db(raw_field)

    metadata = {
        "장애번호": fault_case.get("장애번호", ""),
        "장애명": fault_case.get("장애명", ""),
        "장애분야": normalized_field,  # ← 정규화된 분야 저장
        "원본장애분야": raw_field,     # ← 원본 분야도 보존
        "장애점": fault_case.get("장애점", ""),
        "발생일자": fault_case.get("발생일자", ""),
        "국사": fault_case.get("국사", ""),
    }

    # 경보 관련 메타데이터 추가 (기존 코드 유지)
    alert_text = fault_case.get("경보현황", "")
    if alert_text:
        metadata["경보분야"] = ", ".join(
            identify_alert_fields_enhanced(alert_text))
        metadata["경보코드"] = ", ".join(extract_alert_codes(alert_text))
        metadata["경보현황"] = alert_text

    # 장애 관련 기본 필드 추가 (기존 코드 유지)
    for key in ["장애접수내역", "장애분석", "조치내역"]:
        if fault_case.get(key):
            metadata[key] = fault_case[key]

    return metadata


def normalize_field_for_db(field):
    """DB 저장용 장애분야 정규화"""
    if not field:
        return "기타"

    field_lower = field.lower()
    if "m/w" in field_lower or "mw" in field_lower or "마이크로" in field_lower:
        return "M/W"
    elif "ip" in field_lower:
        return "IP"
    elif "전송" in field_lower:
        return "전송"
    elif "교환" in field_lower:
        return "교환"
    elif "선로" in field_lower or "케이블" in field_lower:
        return "선로"
    elif "전원" in field_lower:
        return "전원"
    elif "무선" in field_lower:
        return "무선"
    else:
        return field


def identify_alert_fields_enhanced(alert_text):
    """경보 텍스트에서 관련 분야 식별 - 개선된 버전"""
    if not alert_text:
        return ["기타"]

    text_lower = alert_text.lower()
    field_scores = {}

    # 1. 명시적 분야 표기 우선 확인 ([IP 분야], [MW 분야] 등)
    import re
    explicit_patterns = {
        "IP": [r'\[ip\s*분야\]', r'ip\s*분야'],
        "M/W": [r'\[mw?\s*분야\]', r'\[m/w\s*분야\]', r'mw?\s*분야', r'm/w\s*분야'],
        "전송": [r'\[전송\s*분야\]', r'전송\s*분야'],
        "교환": [r'\[교환\s*분야\]', r'교환\s*분야'],
        "무선": [r'\[무선\s*분야\]', r'무선\s*분야'],
        "선로": [r'\[선로\s*분야\]', r'선로\s*분야'],
        "전원": [r'\[전원\s*분야\]', r'전원\s*분야']
    }

    for field, patterns in explicit_patterns.items():
        for pattern in patterns:
            if re.search(pattern, text_lower):
                field_scores[field] = field_scores.get(field, 0) + 20  # 높은 점수

    # 2. 기존 FIELD_KEYWORDS 기반 검색
    for field, keywords in FIELD_KEYWORDS.items():
        for keyword in keywords:
            if keyword.lower() in text_lower:
                field_scores[field] = field_scores.get(field, 0) + 1

    # 점수가 있는 분야들 반환
    if field_scores:
        sorted_fields = sorted(field_scores.items(),
                               key=lambda x: x[1], reverse=True)
        return [field for field, _ in sorted_fields[:3]]

    return ["기타"]


def create_documents(fault_case):
    """검색을 위한 문서 생성 - 경보현황 우선순위 강화"""

    # 경보현황을 더 상세하게 분리하여 정확한 매칭 향상
    alert_section = fault_case.get('경보현황', '')

    # 경보현황을 앞쪽에 배치하고 가중치 강화
    unified_doc = f"""경보`현황: {alert_section}
        장애번호: {fault_case.get('장애번호', '')}
        장애명: {fault_case.get('장애명', '')}
        장애분야: {fault_case.get('장애분야', '')}
        장애점: {fault_case.get('장애점', '')}
        발생일자: {fault_case.get('발생일자', '')}
        국사: {fault_case.get('국사', '')}

        장애접수내역: {fault_case.get('장애접수내역', '')}

        장애분석: {fault_case.get('장애분석', '')}

        조치내역: {fault_case.get('`조치내역', '')}"""

    return [{"text": unified_doc, "type": "unified"}]


def create_embedding_chunks(fault_cases):
    """효율적인 임베딩을 위한 청크 생성 - 단순화"""
    all_chunks = []

    for case in fault_cases:
        metadata = create_metadata(case)
        documents = create_documents(case)

        # 단일 문서만 생성 (중복 제거)
        doc = documents[0]
        doc_id = f"{case['장애번호']}_unified"
        all_chunks.append({
            "id": doc_id,
            "text": doc["text"],
            "metadata": metadata
        })

    return all_chunks


def batch_save_to_db(collection, chunks, batch_size=BATCH_SIZE):
    """배치 처리를 통한 DB 저장 최적화"""
    total_chunks = len(chunks)
    total_batches = (total_chunks + batch_size - 1) // batch_size

    for i in tqdm(range(0, total_chunks, batch_size), desc="벡터DB 저장", total=total_batches):
        batch = chunks[i:i+batch_size]

        batch_ids = [item["id"] for item in batch]
        batch_docs = [item["text"] for item in batch]
        batch_metadatas = [item["metadata"] for item in batch]

        try:
            collection.add(
                ids=batch_ids,
                documents=batch_docs,
                metadatas=batch_metadatas,
            )
            logger.info(f"✅ {len(batch_ids)}건 저장 완료")
        except Exception as e:
            logger.error(f"🔥 배치 저장 오류: {e}")
            time.sleep(1)  # 오류 발생 시 잠시 대기
            try:
                # 단건 저장 시도
                for j in range(len(batch_ids)):
                    try:
                        collection.add(
                            ids=[batch_ids[j]],
                            documents=[batch_docs[j]],
                            metadatas=[batch_metadatas[j]],
                        )
                    except Exception as e2:
                        logger.error(f"🔥 단건 저장 오류: {e2}")
            except:
                logger.error("단건 저장도 실패")
                pass


def preprocess_cases_parallel(fault_cases, max_workers=4):
    """병렬 처리를 통한 사례 전처리 최적화"""
    all_chunks = []

    def process_case(case):
        metadata = create_metadata(case)
        documents = create_documents(case)
        case_chunks = []

        for doc in documents:
            doc_id = f"{case['장애번호']}_{doc['type']}_{uuid.uuid4()}"
            case_chunks.append({
                "id": doc_id,
                "text": doc["text"],
                "metadata": {**metadata, "doc_type": doc["type"]}
            })

        return case_chunks

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        chunk_lists = list(executor.map(process_case, fault_cases))

    for chunk_list in chunk_lists:
        all_chunks.extend(chunk_list)

    return all_chunks


def optimize_collection(collection):
    """벡터 컬렉션 최적화 - 인덱스 설정"""
    try:
        collection.create_index(
            index_type="hnsw",  # 대용량 데이터에 적합한 인덱스
            params={"space_type": "cosine", "ef_construction": 200}
        )
        logger.info("✅ 컬렉션 인덱스 최적화 완료")
    except Exception as e:
        logger.warning(f"인덱스 최적화 중 오류 (무시 가능): {e}")


def main():
    """메인 실행 함수"""
    start_time = time.time()

    # 1. JSON 파일 로드
    json_path = RAG_DOCUMENT
    if not os.path.exists(json_path):
        logger.error(f"JSON 파일을 찾을 수 없습니다: {json_path}")
        return

    # 2. ChromaDB 클라이언트 생성
    client, db_dir = create_chroma_client()
    if not client:
        return

    # 3. 임베딩 함수 설정
    ef = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name=EMBEDDING_MODEL
    )

    # 4. 컬렉션 생성
    try:
        collection = client.create_collection(
            name="nw_incidents",
            embedding_function=ef,
            metadata={"description": "통신장비 장애사례 데이터"},
        )
    except:
        collection = client.get_collection(
            name="nw_incidents", embedding_function=ef)

    # 5. 데이터 로드
    try:
        with open(json_path, "r", encoding="utf-8-sig") as f:
            fault_cases = json.load(f)
            logger.info(f"장애사례 {len(fault_cases)}건 로드 완료")
    except Exception as e:
        logger.error(f"JSON 로드 오류: {e}")
        return

    # 6. 병렬 처리로 청크 생성
    all_chunks = preprocess_cases_parallel(fault_cases)
    logger.info(f"총 {len(all_chunks)}개 청크 생성 완료")

    # 7. 배치 처리로 DB 저장
    batch_save_to_db(collection, all_chunks, BATCH_SIZE)

    # 8. 컬렉션 최적화
    optimize_collection(collection)

    end_time = time.time()
    total_time = end_time - start_time
    logger.info(f"총 {len(all_chunks)}건 문서가 저장되었습니다. DB 위치: {db_dir}")
    logger.info(f"처리 시간: {total_time:.2f}초")


if __name__ == "__main__":
    main()
