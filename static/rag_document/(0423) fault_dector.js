<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <title>AI Detector A-RAG</title>
    <link rel="stylesheet" href="/static/css/fault_detector.css" />
    <link
      href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR&display=swap"
      rel="stylesheet"
    />
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  </head>

  <body>
    <div class="header">
      <span class="header-title">NW 장애점 분석/탐지</span>&nbsp; (Advanced RAG)
      <div class="timestamp" id="timestamp"></div>
    </div>

    <div class="container">
      <div class="sidebar" id="summary-list">
        <!-- 질문 요약 항목이 여기에 동적으로 추가됨 -->
      </div>

      <div class="drag-handle" id="drag-handle">
        <div class="toggle-btn" id="toggle-btn"></div>
      </div>

      <div class="main">
        <div class="content-area">
          <div id="response-box"></div>
        </div>

        <div class="input-container">
          <div class="input-top">
            <div style="flex-shrink: 0">
              [ A-RAG Prompt ] 현재 선택된 국사명:
              <span id="kuksa_name">{{ kuksa_id or '없음' }}</span>
            </div>

            <div style="display: flex; align-items: center; gap: 10px">
              <label
                ><input type="radio" name="queryMode" value="fixed" checked /> 장애점 추론</label
              >
              <label><input type="radio" name="queryMode" value="chat" /> 대화 모드</label>

              <button class="button-getalarm" onclick="UIController.getRealTimeAlarmList()">
                실시간 경보 수집
              </button>
              <button class="button-getcable" onclick="UIController.getDrCableInfo()">
                선로 장애 확인
              </button>
              <button class="button-getmwinfo" onclick="UIController.getMWInfoFromSNMP()">
                전원/페이딩 확인
              </button>
              <button class="button-initchat" onclick="UIController.clearConversation()">
                대화 초기화
              </button>
            </div>
          </div>

          <div>
            <textarea
              id="prompt-input"
              placeholder="장애점을 찾을 수 있도록 현재 장애 증상과 분야별 경보를 입력해 주세요 !!!
    1. [장애점 조회] 장애 증상이나 경보 정보를 입력하면 유사한 과거 사례를 조회해 드립니다.
    2. [상세 검색] 구체적인 경보 코드나 증상을 입력할수록 더 정확한 결과를 얻을 수 있습니다.
    3. [필터 검색] '전송 분야', 'IP 분야', '교환 분야'와 같은 특정 분야를 포함하여 검색할 수 있습니다."
            >
            </textarea>

            <button class="send-button" onclick="UIController.handlePrompt()">↑</button>
          </div>
        </div>
      </div>
    </div>

    <script>
      //  * 전역 변수 및 상태 관리
      const AppState = {
        requestTime: null,
        responseCount: 0,
        kuksa_id: new URLSearchParams(window.location.search).get('kuksa_id'),
        isDragging: false,
        isSidebarVisible: true,

        init() {
          console.log('쿼리스트링으로 받은 kuksa_id:', this.kuksa_id);
        },
      };

      const Utils = {
        fetchAPI(url, method = 'GET', data = null) {
          const options = {
            method,
            headers: { 'Content-Type': 'application/json' },
          };

          if (data) {
            options.body = JSON.stringify(data);
          }

          return fetch(url, options).then((res) => {
            if (!res.ok) {
              throw new Error(`서버 오류: ${res.status}`);
            }
            return res.json();
          });
        },

        formatDateTime(dt) {
          return dt.toISOString().slice(0, 19).replace('T', ' ');
        },

        calculateDuration(startTime, endTime) {
          const durationSec = Math.floor((endTime - startTime) / 1000);
          const durationMin = Math.floor(durationSec / 60);
          const remainSec = durationSec % 60;

          return { durationMin, remainSec };
        },

        getCurrentTime() {
          const date = new Date();
          const pad = (n) => (n < 10 ? '0' + n : n);
          return (
            date.getFullYear() +
            '-' +
            pad(date.getMonth() + 1) +
            '-' +
            pad(date.getDate()) +
            ' ' +
            pad(date.getHours()) +
            ':' +
            pad(date.getMinutes()) +
            ':' +
            pad(date.getSeconds())
          );
        },

        toggleButtonsDuringFetch(disabled) {
          const getAlarmBtn = document.querySelector('.button-getalarm');
          const getCableBtn = document.querySelector('.button-getcable');
          const getMWInfoBtn = document.querySelector('.button-getmwinfo');

          const sendBtn = document.querySelector('.send-button');

          [getAlarmBtn, getCableBtn, getMWInfoBtn, sendBtn].forEach((btn) => {
            btn.disabled = disabled;
            if (disabled) {
              btn.classList.add('disabled');
            } else {
              btn.classList.remove('disabled');
            }
          });
        },
      };

      const DOMRenderer = {
        updateTimestamp(requestTime, responseTime) {
          const timestamp = document.getElementById('timestamp');
          if (!timestamp) return;

          const { durationMin, remainSec } = Utils.calculateDuration(requestTime, responseTime);
          timestamp.innerHTML = `요청: ${Utils.formatDateTime(
            requestTime
          )} → 응답: ${Utils.formatDateTime(
            responseTime
          )} (소요시간: ${durationMin}분 ${remainSec}초)`;
        },

        addUserMessage(input, responseId) {
          const responseBox = document.getElementById('response-box');
          const userMsg = document.createElement('div');

          userMsg.className = 'user-msg';
          userMsg.textContent = input;
          userMsg.id = `response-${responseId}`;
          responseBox.appendChild(userMsg);

          return userMsg;
        },

        addLoadingMessage(mode) {
          const responseBox = document.getElementById('response-box');
          const botLoading = document.createElement('div');
          botLoading.className = 'bot-msg loading';

          if (mode === 'chat') {
            botLoading.innerHTML =
              '?? <b>답변 생성 중...</b> <br><br> 요청한 질문에 대해 답변을 생성합니다.';
          } else {
            botLoading.innerHTML =
              '?? <b>장애점 추론 중...</b> <br><br> 발생한 장애증상과 경보 패턴을 분석하여 유사 장애발생 사례를 기준으로 장애점을 추론합니다.';
          }

          responseBox.appendChild(botLoading);
          responseBox.scrollTop = responseBox.scrollHeight;

          return botLoading;
        },

        addSummaryItem(input, responseId) {
          const summaryList = document.getElementById('summary-list');
          const summaryItem = document.createElement('div');

          summaryItem.className = 'summary-entry';
          summaryItem.textContent =
            [...input].slice(0, 20).join('') + (input.length > 20 ? '...' : '');
          summaryItem.dataset.timestamp = new Date().toLocaleTimeString();

          summaryItem.onclick = () => {
            const targetEl = document.getElementById(`response-${responseId}`);
            if (targetEl) {
              window.scrollTo(0, window.scrollY - 5);
              setTimeout(() => {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 50);
            }
          };

          summaryList.appendChild(summaryItem);
          return summaryItem;
        },

        addBotMessage(htmlContent) {
          const responseBox = document.getElementById('response-box');
          const botMsg = document.createElement('div');

          botMsg.className = 'bot-msg';
          botMsg.innerHTML = htmlContent;

          responseBox.appendChild(botMsg);
          responseBox.scrollTop = responseBox.scrollHeight;

          return botMsg;
        },

        addErrorMessage(error) {
          const responseBox = document.getElementById('response-box');
          const errorMsg = document.createElement('div');

          errorMsg.className = 'bot-msg error';
          errorMsg.innerHTML = `? <b>오류 발생</b> <br>${error}`;

          responseBox.appendChild(errorMsg);
          responseBox.scrollTop = responseBox.scrollHeight;

          return errorMsg;
        },

        updatePlaceholder() {
          const mode = document.querySelector('input[name="queryMode"]:checked').value;
          const promptInput = document.getElementById('prompt-input');

          if (mode === 'fixed') {
            promptInput.placeholder =
              'NW 장애발생 시 장애점을 찾을 수 있도록 분야별 세부 경보내역을 입력해 주세요 !!!\n\n[장애점 추론] 경보내역/장애증상 입력 시 유사 장애사례를 기준으로 장애점을 추론 \n[유사 장애사례 추출] 입력된 경보현황과 유사도가 높은 사례 3건 (전체 내용 입력)';
          } else {
            promptInput.placeholder =
              '장애에 대해 자유롭게 질문하세요:\n- 이 장애의 원인은 무엇인가요?\n- 어떤 조치가 필요한가요?\n 유사한 장애 사례가 있었나요?';
          }
        },
      };

      const HTMLGenerator = {
        // 파싱된 JSON 데이터 저장 변수
        parsedData: null,

        createChatModeResponse(input, response) {
          try {
            return `
        <details open>
          <summary><b>?? 응답 펼치기/접기</b></summary>
          <div><b>[질문]</b> <br>${input}</div> <br>
          <div><b>[응답]</b> <br>${response.replace(/\n/g, '<br>')}</div>
        </details>
      `;
          } catch (e) {
            console.error('채팅 응답 생성 오류:', e);
            return `<div class="error-message">응답 처리 중 오류가 발생했습니다: ${e.message}</div>`;
          }
        },

        createOpinionSection() {
          if (!this.parsedData || !this.parsedData.opinion) {
            return '<div class="empty-opinion">종합 의견을 생성할 수 없습니다.</div>';
          }

          const opinion = this.parsedData.opinion;
          const cleanedOpinion = opinion.replace(/=+/g, '');

          return `
      <div class="opinion-section">
        ${cleanedOpinion.replace(/\n/g, '<br>')}
      </div>
    `;
        },

        createSummarySection() {
          if (
            !this.parsedData ||
            !this.parsedData.summary ||
            !Array.isArray(this.parsedData.summary) ||
            this.parsedData.summary.length === 0
          ) {
            return '<div>요약 데이터가 없습니다.</div>';
          }

          const rows = this.parsedData.summary;
          let tableHTML = '<table class="summary-table">';

          // 테이블 헤더
          tableHTML += '<tr>';
          tableHTML += '<th style="width:45px;">순위</th>';
          tableHTML += '<th style="width:60px;">유사도</th>';
          tableHTML += '<th style="width:85px;">분야</th>';
          tableHTML += '<th style="width:380px;">장애점</th>';
          tableHTML += '<th>장애사례</th>';
          tableHTML += '</tr>';

          // 테이블 내용
          for (const row of rows) {
            tableHTML += '<tr>';
            tableHTML += `<td>${row['순위'] || '불명'}</td>`;
            tableHTML += `<td>${row['유사도'] || row[' 유사도'] || '불명'}</td>`;
            tableHTML += `<td>${row['분야'] || '불명'}</td>`;
            tableHTML += `<td>${row['장애점'] || '불명'}</td>`;
            tableHTML += `<td>${row['장애사례'] || '불명'}</td>`;
            tableHTML += '</tr>';
          }

          tableHTML += '</table>';
          return tableHTML;
        },

        createDetailsSection() {
          if (
            !this.parsedData ||
            !this.parsedData.details ||
            !Array.isArray(this.parsedData.details) ||
            this.parsedData.details.length === 0
          ) {
            return '<div>세부 내역이 없습니다.</div>';
          }

          const details = this.parsedData.details;
          let detailsHTML = '<div class="details-container">';

          // 각 세부 내역 항목을 기존 클래스로 스타일링
          for (const item of details) {
            detailsHTML += `
        <div class="detail-item">
          <div class="detail-header">
            [장애점 추론 #${item['순위']}] (${item['분야']}) ${item['장애점']} (유사도: ${item['유사도']})
          </div>
          <table class="detail-table">
      `;

            // 주요 정보 항목
            const infoFields = [
              { key: '발생일자', value: item['발생일자'] || '정보 없음' },
              { key: '장애사례', value: item['장애사례'] || '정보 없음' },
              { key: '분야', value: item['분야'] || '정보 없음' },
            ];

            // 필수 정보 테이블 행 추가
            for (const field of infoFields) {
              detailsHTML += `
          <tr>
            <th>${field.key}</th>
            <td>${field.value}</td>
          </tr>
        `;
            }

            // 선택적 정보 항목들 (있는 경우만 표시)
            const optionalFields = [
              { key: '장애분석', value: item['장애분석'] },
              { key: '경보현황', value: item['경보현황'] },
              { key: '조치내역', value: item['조치내역'] },
            ];

            // 선택적 정보 테이블 행 추가
            for (const field of optionalFields) {
              if (field.value) {
                detailsHTML += `
            <tr>
              <th>${field.key}</th>
              <td>${field.value}</td>
            </tr>
          `;
              }
            }

            detailsHTML += `</table></div>`;
          }

          detailsHTML += '</div>';
          return detailsHTML;
        },

        //  API 응답 전체 처리 래퍼
        createAllSection(json_string) {
          try {
            // 전달된 데이터가 객체인지 확인
            if (!json_string || typeof json_string !== 'object') {
              throw new Error('유효한 API 응답 데이터가 아닙니다.');
            }

            // 필수 필드 확인
            if (!json_string.opinion || !json_string.summary || !json_string.details) {
              throw new Error('API 응답에 필요한 필드가 누락되었습니다.');
            }

            // 파싱된 데이터 저장
            this.parsedData = json_string;

            // 각 섹션 HTML 생성
            const opinionSection = this.createOpinionSection();
            const summaryTable = this.createSummarySection();
            const detailsSection = this.createDetailsSection();

            const processingTime = json_string.processing_time || '';

            return `
        <div class="result-section">
          <p class="section-title">? <b>종합 의견</b></p>${opinionSection}          
          <p class="section-title">? <b>장애점 추론 요약</b></p>${summaryTable}          
          <p class="section-title">? <b>장애점 추론 세부내역</b></p>${detailsSection}
          
          <div style="margin-top: 10px; font-size: 0.9em; color: #666;">
            ※ Vector DB Query 시간: ${
              typeof processingTime === 'number' ? processingTime.toFixed(2) : processingTime
            }초
          </div>
        </div>
      `;
          } catch (e) {
            console.error('장애점 추론 응답 생성 오류:', e);
            return `
        <div class="error-message">
          <p>데이터 처리 중 오류가 발생했습니다:</p>
          <p>${e.message}</p>
          <p>상세 정보: ${JSON.stringify(json_string).substring(0, 100)}...</p>
        </div>
      `;
          }
        },

        generateCableStatusTable(dataList) {
          if (!dataList || dataList.length === 0) {
            return '<div>선로 경보 내역이 없습니다.</div>';
          }

          let table = `
    <div class="cable-section">
      <table class="summary-table" style="width: max-content;">
        <tr style="height: 10px; font-size: 14px;">
          <th>장애번호</th>
          <th>국사명</th>
          <th>케이블명</th>
          <th>등급</th>
          <th>상태</th>
          <th>피해원인</th>
          <th>발생일시</th>
          <th>복구일시</th>
          <th>VOC 건수</th>
          <th>영향고객수</th>
        </tr>
    `;

          for (const item of dataList) {
            table += `
        <tr style="height: 10px; font-size: 14px;">
          <td>${item.tt_no}</td>
          <td>${item.guksa_name}</td>
          <td>${item.cable_name_core}</td>
          <td>${item.fault_grade}</td>
          <td>${item.status}</td>
          <td>${item.sector_analysis}</td>
          <td>${item.alarm_occur_datetime}</td>
          <td>${item.alarm_recover_datetime}</td>
          <td>${item.voc_count}</td>
          <td>${item.customer_count}</td>
        </tr>
      `;
          }

          table += '</table></div>';
          return table;
        },
      };

      // API 호출 모듈
      const APIService = {
        // 실시간 경보 조회
        getRealTimeAlarmList() {
          Utils.toggleButtonsDuringFetch(true);

          return Utils.fetchAPI('/api/latest_alarms')
            .then((data) => {
              if (data.alarms) {
                document.getElementById('prompt-input').value =
                  '경보수집 내역입니다.\n\n' + data.alarms;
              }
              return data;
            })
            .catch((err) => {
              console.error('? 경보 데이터 로딩 실패:', err);
            })
            .finally(() => {
              Utils.toggleButtonsDuringFetch(false);
            });
        },

        // 광케이블 선로 장애정보 수집
        getDrCableInfo() {
          Utils.toggleButtonsDuringFetch(true);

          return Utils.fetchAPI('/api/cable_status')
            .then((data) => {
              if (!data.cable_status || !Array.isArray(data.cable_status)) {
                throw new Error('유효한 선로 경보 데이터가 없습니다.');
              }

              return data;
            })
            .catch((err) => {
              console.error('? 선로 경보 데이터 로딩 실패:', err);
              throw err;
            })
            .finally(() => {
              Utils.toggleButtonsDuringFetch(false);
            });
        },

        // MW 정보 수집 (전원정보 + 변조방식)
        getMWInfoFromSNMP() {
          Utils.toggleButtonsDuringFetch(true);

          const kuksaId = AppState.kuksa_id;

          if (!kuksaId) {
            alert('장애점을 분석할 대상 kuksa_id가 없습니다.');
            return Promise.reject(new Error('kuksa_id가 없습니다'));
          }

          return Utils.fetchAPI('/api/mw_info', 'POST', { kuksa_id: kuksaId })
            .then((response) => {
              if (!response || !response.response) {
                alert('ZMQ Socket 서버로부터 정상적인 응답을 받지 못했습니다.');
                throw new Error('ZMQ 응답 없음');
              }

              console.log('M/W 장비 SNMP 정보 수신 성공:', response);
              return response;
            })
            .catch((err) => {
              console.error('M/W 장비 SNMP 정보 수집 실패:', err);
              alert('M/W SNMP 정보 수집 중 오류가 발생했습니다.\n관리자에게 문의하세요.');
              throw err;
            })
            .finally(() => {
              Utils.toggleButtonsDuringFetch(false);
            });
        },

        // 모든 데이터 한 번에 수집
        collectAllData() {
          return Promise.all([
            this.getRealTimeAlarmList(),
            this.getDrCableInfo(),
            this.getMWInfoFromSNMP(),
          ]);
        },

        // 국사명 가져오기
        getKuksaName() {
          if (!AppState.kuksa_id) {
            document.getElementById('kuksa_name').innerText = '없음';
            return Promise.resolve();
          }

          return Utils.fetchAPI(`/api/kuksa_name?kuksa_id=${AppState.kuksa_id}`)
            .then((data) => {
              if (data.kuksa_name) {
                document.getElementById('kuksa_name').innerText = data.kuksa_name;
              } else {
                document.getElementById('kuksa_name').innerText = '알 수 없음';
              }
            })
            .catch((err) => {
              console.error('국사명 조회 실패:', err);
              document.getElementById('kuksa_name').innerText = '조회 실패';
            });
        },
      };

      // 로컬 스토리지 관리 모듈
      const StorageService = {
        keys: {
          conversation: 'nw-rag-conversation',
          summary: 'nw-rag-summary',
          count: 'nw-rag-count',
        },

        // 대화 내용 저장
        saveConversation() {
          const responseBox = document.getElementById('response-box');
          const summaryList = document.getElementById('summary-list');

          localStorage.setItem(this.keys.conversation, responseBox.innerHTML);
          localStorage.setItem(this.keys.summary, summaryList.innerHTML);
          localStorage.setItem(this.keys.count, AppState.responseCount.toString());
        },

        // 대화 내용 불러오기
        loadConversation() {
          const savedConversation = localStorage.getItem(this.keys.conversation);
          const savedSummary = localStorage.getItem(this.keys.summary);
          const savedCount = localStorage.getItem(this.keys.count);

          if (savedConversation) {
            document.getElementById('response-box').innerHTML = savedConversation;
          }

          if (savedSummary) {
            document.getElementById('summary-list').innerHTML = savedSummary;
          }

          if (savedCount) {
            AppState.responseCount = parseInt(savedCount);
          }
        },

        // 대화 내용 초기화
        clearConversation() {
          if (confirm('모든 대화 내용을 초기화하시겠습니까?')) {
            document.getElementById('response-box').innerHTML = '';
            document.getElementById('summary-list').innerHTML = '';
            document.getElementById('prompt-input').value = '';
            AppState.responseCount = 0;

            // 서버에 대화 초기화 요청
            Utils.fetchAPI('/api/clear_conversation', 'POST', { clear: true }).catch((err) =>
              console.error('대화 초기화 오류:', err)
            );

            // 타임스탬프 초기화
            if (document.getElementById('timestamp')) {
              document.getElementById('timestamp').textContent = '';
            }

            // 로컬 스토리지 초기화
            Object.values(this.keys).forEach((key) => localStorage.removeItem(key));
          }
        },
      };

      // UI 컨트롤러 모듈 - 사용자 액션 처리 함수
      const UIController = {
        // 프롬프트 입력 처리
        handlePrompt() {
          const input = document.getElementById('prompt-input').value.trim();
          if (!input) {
            alert('검색어를 입력해 주세요.');
            return;
          }

          const mode = document.querySelector('input[name="queryMode"]:checked').value;
          Utils.toggleButtonsDuringFetch(true);

          const requestTimeObj = new Date();
          const thisResponseId = ++AppState.responseCount;

          // 사용자 메시지 및 로딩 표시 추가
          const userMsg = DOMRenderer.addUserMessage(input, thisResponseId);
          const botLoading = DOMRenderer.addLoadingMessage(mode);
          const summaryItem = DOMRenderer.addSummaryItem(input, thisResponseId);

          // API 호출
          Utils.fetchAPI('/api/rag_popup', 'POST', { query: input, mode })
            .then((data) => {
              botLoading.remove();
              const responseTimeObj = new Date();

              DOMRenderer.updateTimestamp(requestTimeObj, responseTimeObj);

              let htmlContent;

              if (data.success === false) {
                htmlContent = `<div class="error-message">? 오류 발생: ${
                  data.error || '알 수 없는 오류'
                }</div>`;
              } else {
                if (mode === 'chat') {
                  htmlContent = HTMLGenerator.createChatModeResponse(input, data.details);
                } else {
                  htmlContent = HTMLGenerator.createAllSection(data);
                }
              }

              DOMRenderer.addBotMessage(htmlContent);
              summaryItem.classList.add('completed');
            })
            .catch((err) => {
              botLoading.remove();
              const responseTimeObj = new Date();

              DOMRenderer.updateTimestamp(requestTimeObj, responseTimeObj);
              DOMRenderer.addErrorMessage(err);
              summaryItem.classList.add('error');
            })
            .finally(() => {
              Utils.toggleButtonsDuringFetch(false);
              document.getElementById('prompt-input').value = '';
              DOMRenderer.updatePlaceholder();
            });
        },

        // 실시간 경보 목록 가져오기
        getRealTimeAlarmList() {
          APIService.getRealTimeAlarmList();
        },

        // Dr. Cable에서 광케이블 선로 피해정보 수집
        getDrCableInfo() {
          Utils.toggleButtonsDuringFetch(true);

          APIService.getDrCableInfo()
            .then((data) => {
              if (!data.cable_status || !Array.isArray(data.cable_status)) {
                throw new Error('유효한 선로 경보 데이터가 없습니다.');
              }

              // 1) 사용자 입력 메시지
              const input = '가장 최근에 발생한 선로장애 내역을 확인해줘...';
              const thisResponseId = ++AppState.responseCount;
              const userMsg = DOMRenderer.addUserMessage(input, thisResponseId);
              const summaryItem = DOMRenderer.addSummaryItem(input, thisResponseId);

              const botLoading = document.createElement('div');
              botLoading.className = 'bot-msg loading';
              botLoading.innerHTML = '?? <b>선로장애 정보 조회 중...</b>';
              document.getElementById('response-box').appendChild(botLoading);

              const unrecovered = data.unrecovered_alarm || { count: 0 };
              let warningMsg = '';

              if (unrecovered.count === 0) {
                warningMsg = `<b>'현재'</b> 해당 지역에 <b>미복구된 선로 장애는 없는 것으로 파악이 됩니다.</b><br>
                  아래 선로 장애 내역을 참고해 주시고, <b>'다른 분야의 경보 내역'</b>을 추가로 확인하시기 바랍니다.`;
              } else {
                const recent = unrecovered.most_recent || {};
                warningMsg = `${recent.alarm_occur_datetime || ''}, <b>
                  ${recent.guksa_name || '알 수 없음'}</b>의 <b>선로장애</b>(${
                  recent.cable_name_core || '알 수 없음'
                }, ${recent.fault_sector || '알 수 없음'}) 
                   등 <b>
                    ${unrecovered.count}건</b>의 <b>미복구 장애</b>가 조회됩니다. 
                  <br>현재 장애가 아래 선로장애 영향인지 확인이 필요합니다.`;
              }

              // 기존 메시지 제거 + 새 메시지 추가
              botLoading.remove();
              DOMRenderer.addBotMessage(`<div class="bot-warning">${warningMsg}</div>`);

              const tableHtml = HTMLGenerator.generateCableStatusTable(data.cable_status);
              DOMRenderer.addBotMessage(tableHtml);

              summaryItem.classList.add('completed');
            })
            .catch((err) => {
              console.error('? 선로장애 데이터 확인 실패:', err);
              DOMRenderer.addErrorMessage(
                `선로장애 데이터를 가져오지 못했습니다.<br>${err.message}`
              );
            })
            .finally(() => {
              Utils.toggleButtonsDuringFetch(false);
            });
        },

        // MW SNMP 정보 수집 → DOM에 결과 출력 포함
        getMWInfoFromSNMP() {
          Utils.toggleButtonsDuringFetch(true);

          const input = '현재 도서 M/W 장비의 전원과 페이딩 상태를 확인해줘...';
          const thisResponseId = ++AppState.responseCount;

          const userMsg = DOMRenderer.addUserMessage(input, thisResponseId);
          const summaryItem = DOMRenderer.addSummaryItem(input, thisResponseId);

          const botLoading = document.createElement('div');
          botLoading.className = 'bot-msg loading';
          botLoading.innerHTML = '?? <b>M/W 장비의 전원과 페이딩 정보 분석 중...</b>';
          document.getElementById('response-box').appendChild(botLoading);

          APIService.getMWInfoFromSNMP()
            .then((data) => {
              let resultHTML = '';

              if (data.정전_상태_장비?.length) {
                resultHTML += '<div><b>? 정전 상태 장비</b><ul>';
                data.정전_상태_장비.forEach((item) => {
                  resultHTML += `<li>${item.장비명} (${item['SNMP IP']}) → 전원 상태: ${item.oid1}</li>`;
                });
                resultHTML += '</ul></div>';
              }

              if (data.변조_방식_불일치_장비?.length) {
                resultHTML += '<div><b>?? 변조방식 불일치 장비</b><ul>';
                data.변조_방식_불일치_장비.forEach((item) => {
                  resultHTML += `<li>${item.장비명} (${item['SNMP IP']}) → oid2: ${item.oid2}, oid3: ${item.oid3}</li>`;
                });
                resultHTML += '</ul></div>';
              }

              if (!resultHTML) {
                resultHTML = '<div>?? 현재 전원 및 변조방식 이상 징후는 발견되지 않았습니다.</div>';
              }

              botLoading.remove();
              DOMRenderer.addBotMessage(resultHTML);
              summaryItem.classList.add('completed');
            })
            .catch((err) => {
              console.error('MW SNMP 수집 오류:', err);
              botLoading.remove();
              DOMRenderer.addErrorMessage(err.message);
              summaryItem.classList.add('error');
            })
            .finally(() => {
              Utils.toggleButtonsDuringFetch(false);
            });
        },

        // 대화 내용 초기화
        clearConversation() {
          StorageService.clearConversation();
        },

        // 사이드바 토글 - 펼치기/접기
        toggleSidebar() {
          const sidebar = document.getElementById('summary-list');
          AppState.isSidebarVisible = !AppState.isSidebarVisible;

          if (!AppState.isSidebarVisible) {
            sidebar.style.width = '0';
            sidebar.style.padding = '0';
          } else {
            sidebar.style.width = '250px';
            sidebar.style.padding = '10px';
          }
        },
      };

      // 초기화 및 이벤트 리스너 설정
      function initApp() {
        // 앱 상태 초기화
        AppState.init();

        // 로컬 스토리지에서 대화 이력 로드
        StorageService.loadConversation();

        // 플레이스홀더 업데이트
        DOMRenderer.updatePlaceholder();

        // 라디오 버튼 변경 이벤트 리스너
        document.querySelectorAll('input[name="queryMode"]').forEach((radio) => {
          radio.addEventListener('change', DOMRenderer.updatePlaceholder);
        });

        // 초기 데이터 로드
        APIService.getRealTimeAlarmList();

        // 국사명 가져오기
        APIService.getKuksaName();

        // 버튼 이벤트 리스너
        window.getDrCableInfo = UIController.getDrCableInfo;
        window.getMWInfoFromSNMP = UIController.getMWInfoFromSNMP;

        // 자동 저장 타이머 설정
        setInterval(() => StorageService.saveConversation(), 60000);

        // 사이드바 드래그 설정
        setupSidebarDrag();
      }

      // 사이드바 드래그 기능 설정
      function setupSidebarDrag() {
        const sidebar = document.getElementById('summary-list');
        const dragHandle = document.getElementById('drag-handle');
        const toggleBtn = document.getElementById('toggle-btn');

        // 드래그 이벤트 리스너 설정
        dragHandle.addEventListener('mousedown', (e) => {
          AppState.isDragging = true;
          document.body.style.cursor = 'col-resize';
        });

        document.addEventListener('mousemove', (e) => {
          if (!AppState.isDragging) return;
          const newWidth = e.clientX;

          if (newWidth >= 10) {
            sidebar.style.width = `${newWidth}px`;
          }
        });

        document.addEventListener('mouseup', () => {
          AppState.isDragging = false;
          document.body.style.cursor = 'default';
        });

        // 토글 버튼 클릭 이벤트
        toggleBtn.addEventListener('click', UIController.toggleSidebar);
      }

      // 페이지 로드 시 앱 초기화
      document.addEventListener('DOMContentLoaded', initApp);
    </script>
  </body>
</html>
