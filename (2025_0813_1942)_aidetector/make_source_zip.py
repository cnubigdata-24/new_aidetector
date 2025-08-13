#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import zipfile
from datetime import datetime
import sys
import fnmatch

def load_exclude_list():
    """
    exclude_list.txt 파일에서 제외할 파일/폴더 목록을 읽어옵니다.
    """
    exclude_file = "exclude_list.txt"
    exclude_list = set()
    
    if not os.path.exists(exclude_file):
        print(f"제외 목록 파일({exclude_file})이 없습니다. 기본 제외 규칙만 적용됩니다.")
        return exclude_list
    
    try:
        with open(exclude_file, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                
                # 빈 줄이나 주석(#으로 시작) 건너뛰기
                if not line or line.startswith('#'):
                    continue
                
                exclude_list.add(line)
                
        print(f"제외 목록 파일({exclude_file})에서 {len(exclude_list)}개 항목을 로드했습니다.")
        if exclude_list:
            print("제외 목록:")
            for item in sorted(exclude_list):
                print(f"  - {item}")
            print()
        
    except Exception as e:
        print(f"제외 목록 파일 읽기 오류: {e}")
        print("기본 제외 규칙만 적용됩니다.")
    
    return exclude_list

def create_zip_archive():
    """
    현재 디렉토리의 파일들을 압축합니다.
    - 기존 압축파일 (.zip, .rar, .7z, .tar, .gz) 제외
    - 점(.)으로 시작하는 디렉토리/파일 제외
    """
    
    # 제외 목록 로드
    exclude_list = load_exclude_list()
    
    # 현재 시간을 기반으로 파일명 생성
    current_time = datetime.now()
    timestamp = current_time.strftime("%Y%m%d-%H%M")
    zip_filename = f"({timestamp})ai_detector.zip"
    
    # 압축파일 확장자 목록
    archive_extensions = {'.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz'}
    
    # 현재 디렉토리 경로
    current_dir = os.getcwd()
    
    print(f"압축 파일 생성 중: {zip_filename}")
    print(f"작업 디렉토리: {current_dir}")
    print("-" * 50)
    
    try:
        with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
            file_count = 0
            
            # 현재 디렉토리의 모든 항목 검사
            for item in os.listdir(current_dir):
                item_path = os.path.join(current_dir, item)
                
                # 제외 조건 확인
                if should_exclude(item, item_path, zip_filename, archive_extensions, exclude_list):
                    print(f"제외: {item}")
                    continue
                
                # 파일인 경우
                if os.path.isfile(item_path):
                    zipf.write(item_path, item)
                    print(f"추가: {item}")
                    file_count += 1
                
                # 디렉토리인 경우 (재귀적으로 추가)
                elif os.path.isdir(item_path):
                    for root, dirs, files in os.walk(item_path):
                        # 점으로 시작하는 디렉토리 제외
                        dirs[:] = [d for d in dirs if not d.startswith('.')]
                        
                        # exclude_list에 있는 디렉토리도 제외
                        dirs[:] = [d for d in dirs if not any(fnmatch.fnmatch(d, pattern) for pattern in exclude_list)]
                        
                        for file in files:
                            if file.startswith('.'):
                                continue
                            
                            # exclude_list에 있는 파일도 제외
                            if any(fnmatch.fnmatch(file, pattern) for pattern in exclude_list):
                                continue
                                
                            file_path = os.path.join(root, file)
                            # zip 파일 내에서의 상대 경로
                            arcname = os.path.relpath(file_path, current_dir)
                            
                            # 상대 경로로도 제외 목록 확인
                            if any(fnmatch.fnmatch(arcname, pattern) for pattern in exclude_list):
                                continue
                            
                            zipf.write(file_path, arcname)
                            print(f"추가: {arcname}")
                            file_count += 1
            
            print("-" * 50)
            print(f"압축 완료!")
            print(f"총 {file_count}개 파일이 {zip_filename}에 압축되었습니다.")
            print(f"압축 파일 크기: {os.path.getsize(zip_filename):,} bytes")
            
    except Exception as e:
        print(f"오류 발생: {e}")
        return False
    
    return True

def should_exclude(item, item_path, zip_filename, archive_extensions, exclude_list):
    """
    파일/디렉토리가 제외되어야 하는지 확인합니다.
    """
    # 점으로 시작하는 파일/디렉토리 제외
    if item.startswith('.'):
        return True
    
    # 생성될 zip 파일 자체 제외
    if item == zip_filename:
        return True
    
    # excloud.txt에 지정된 항목들 제외 (와일드카드 패턴 지원)
    for exclude_pattern in exclude_list:
        if fnmatch.fnmatch(item, exclude_pattern):
            return True
        # 전체 경로로도 매칭 시도 (상대 경로)
        rel_path = os.path.relpath(item_path, os.getcwd())
        if fnmatch.fnmatch(rel_path, exclude_pattern):
            return True
    
    # 파일인 경우 압축파일 확장자 확인
    if os.path.isfile(item_path):
        _, ext = os.path.splitext(item.lower())
        if ext in archive_extensions:
            return True
    
    return False

if __name__ == "__main__":
    print("=" * 60)
    print("파일 압축 도구")
    print("=" * 60)
    
    try:
        success = create_zip_archive()
        if success:
            print("\n압축이 성공적으로 완료되었습니다!")
        else:
            print("\n압축 중 오류가 발생했습니다.")
            sys.exit(1)
            
    except KeyboardInterrupt:
        print("\n\n사용자에 의해 중단되었습니다.")
        sys.exit(1)
    except Exception as e:
        print(f"\n예상치 못한 오류가 발생했습니다: {e}")
        sys.exit(1)
    
    input("\n계속하려면 Enter 키를 누르세요...")