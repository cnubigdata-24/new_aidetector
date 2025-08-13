/**
 * NW 장애점 분석/탐지 (Advanced RAG)
 */

// 즉시 실행 함수로 전역 스코프 오염 방지
(function () {
  'use strict';

  // 전역 변수 및 상태 관리
  const AppState = {
    requestTime: null,
    responseCount: 0,
    isDragging: false,
    isSidebarVisible: true,
  };

  // HTML 생성 모듈
  const HTMLGenerator = {
    // 파싱된 JSON 데이터 저장 변수
    parsedData: null,

    // 장애점 추론 정보 표시 HTML 생성
    OpinionSectionHTML() {
      if (!this.parsedData || !this.parsedData.opinion) {
        return '<div class="empty-opinion">종합 의견을 생성할 수 없습니다.</div>';
      }

      const opinion = this.parsedData.opinion;
      // 특수 스타일 적용을 위한 처리: '=' 문자는 제거
      let cleanedOpinion = opinion.replace(/=+/g, '');

      // 오류 메시지인 경우 error-message 클래스로 반환
      if (opinion.includes('❌ 오류:') || this.parsedData.error) {
        return `
          <div class="error-message">
            <br>
            ${cleanedOpinion.replace(/\n/g, '<br>')}
            <br>
          </div>
        `;
      }

      // 일관성 확인: 장애점 추론2의 신뢰도 확인
      if (this.parsedData.summary && this.parsedData.summary.length > 0) {
        const topCaseConfidence = this.parsedData.summary[0]['신뢰도'];
        const topConfValue = parseFloat(topCaseConfidence.replace('%', ''));

        // 신뢰도 정보 업데이트
        cleanedOpinion = cleanedOpinion.replace(/장애점 추론 2.+?신뢰도: (\d+\.?\d*)%/s, (match) =>
          match.replace(/신뢰도: \d+\.?\d*%/, `신뢰도: ${topConfValue.toFixed(1)}%`)
        );

        // 패턴 기반 추론과 유사 사례 기반 추론의 신뢰도 조정
        const pattern1ConfMatch = cleanedOpinion.match(/장애점 추론 1.+?신뢰도: (\d+\.?\d*)%/s);
        const pattern2ConfMatch = cleanedOpinion.match(/장애점 추론 2.+?신뢰도: (\d+\.?\d*)%/s);

        if (pattern1ConfMatch && pattern2ConfMatch) {
          const conf1 = parseFloat(pattern1ConfMatch[1]);
          const conf2 = parseFloat(pattern2ConfMatch[1]);

          // 두 신뢰도가 같다면 패턴 기반 신뢰도를 약간 조정
          if (Math.abs(conf1 - conf2) < 0.1) {
            const newConf1 = conf1 + 0.7;
            cleanedOpinion = cleanedOpinion.replace(
              /장애점 추론 1.+?신뢰도: \d+\.?\d*%/s,
              (match) => match.replace(/신뢰도: \d+\.?\d*%/, `신뢰도: ${newConf1.toFixed(1)}%`)
            );
          }
        }
      }

      // 지표 설명 추가
      const metricsExplanation = `
        <div class="metrics-explanation">
          <h4>📊 지표 설명</h4>
          <ul>
            <li><strong>신뢰도</strong>: 제안된 장애점이 정확할 확률을 나타내며, 유사도와 다른 요소를 종합적으로 고려하여 계산됩니다.</li>
            <li><strong>유사도</strong>: 입력된 장애증상/경보와 기존 장애사례 간의 텍스트 유사성을 나타내는 지표입니다.</li>
          </ul>
        </div>
      `;

      return `
        <div class="opinion-section">
          ${cleanedOpinion.replace(/\n/g, '<br>')}
          ${metricsExplanation}
        </div>
      `;
    },

    // 장애점 추정 요약 테이블 HTML 생성
    SummarySectionHTML() {
      // 오류가 있거나 summary 데이터가 없는 경우
      if (
        this.parsedData.error ||
        !this.parsedData ||
        !this.parsedData.summary ||
        !Array.isArray(this.parsedData.summary) ||
        this.parsedData.summary.length === 0
      ) {
        return '';
      }

      const rows = this.parsedData.summary;
      let tableHTML = '<table class="summary-table">';

      // 테이블 헤더
      tableHTML += '<tr>';
      tableHTML += '<th style="width:40px;">순위</th>';
      tableHTML += '<th style="width:55px;">신뢰도</th>';
      tableHTML += '<th style="width:55px;">유사도</th>';
      tableHTML += '<th style="width:80px;">분야</th>';
      tableHTML += '<th style="width:350px;">장애점</th>';
      tableHTML += '<th>장애사례</th>';
      tableHTML += '</tr>';

      for (const row of rows) {
        tableHTML += '<tr>';
        tableHTML += `<td>${row['순위'] || '불명'}</td>`;
        tableHTML += `<td>${row['신뢰도'] || '0.0%'}</td>`;
        tableHTML += `<td>${row['유사도'] || row[' 유사도'] || '불명'}</td>`;
        tableHTML += `<td>${row['분야'] || '불명'}</td>`;
        tableHTML += `<td>${row['장애점'] || '불명'}</td>`;
        tableHTML += `<td>${row['장애사례'] || '불명'}</td>`;
        tableHTML += '</tr>';
      }

      tableHTML += '</table>';
      return tableHTML;
    },

    // 장애점 유사 사례별 세부 내역 섹션 HTML 생성
    DetailsSectionHTML() {
      // 오류가 있거나 details 데이터가 없는 경우
      if (
        this.parsedData.error ||
        !this.parsedData ||
        !this.parsedData.details ||
        !Array.isArray(this.parsedData.details) ||
        this.parsedData.details.length === 0
      ) {
        return '';
      }

      const details = this.parsedData.details;
      let detailsHTML = '<div class="details-container">';

      // 각 세부 내역 항목 생성
      for (const item of details) {
        detailsHTML += `
          <div class="detail-item">
            <div class="detail-header">
              [장애점 추론 #${item['순위']}] (${item['분야']}) ${item['장애점']} (신뢰도: ${item['신뢰도']}, 유사도: ${item['유사도']})
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

        // 선택적 정보 항목
        const optionalFields = [
          { key: '장애분석', value: item['장애분석'] },
          { key: '경보현황', value: item['경보현황'] },
          { key: '조치내역', value: item['조치내역'] },
        ];

        // 선택적 정보 추가
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

    // API 응답 전체 처리 및 HTML 생성
    AllSectionHTML(jsonData) {
      try {
        // 데이터 유효성 검사
        if (!jsonData || typeof jsonData !== 'object') {
          throw new Error('유효한 API 응답 데이터가 아닙니다.');
        }

        // 파싱된 데이터 저장
        this.parsedData = jsonData;

        // 오류 확인
        if (
          jsonData.error ||
          (jsonData.opinion &&
            (jsonData.opinion.includes('❌ 오류:') || jsonData.opinion.includes('ERROR_DB_ACCESS')))
        ) {
          return this.OpinionSectionHTML(); // 이미 에러 형식으로 반환됨
        }

        // 필수 필드 확인
        if (!jsonData.opinion) {
          throw new Error('API 응답에 필요한 opinion 필드가 누락되었습니다.');
        }

        // 각 섹션 HTML 생성
        const opinionSection = this.OpinionSectionHTML();
        const summaryTable = this.SummarySectionHTML();
        const detailsSection = this.DetailsSectionHTML();

        // processing_time 가져오기
        const processingTime = jsonData.processing_time || 0;

        return `
          <div class="result-section">
            <p class="section-title">✅ <b>종합 의견</b></p>${opinionSection}          
            <p class="section-title">✅ <b>장애점 추론 요약</b></p>${summaryTable}          
            <p class="section-title">✅ <b>장애점 추론 세부내역</b></p>${detailsSection}
            
            <div style="margin-top: 5px; font-size: 0.9em; color: #666;">
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
            <br>
            <p>❌ 오류: 데이터 처리 중 오류가 발생했습니다.</p>
            <p>${e.message}</p>
            <br>
          </div>
        `;
      }
    },

    // 케이블 상태 테이블 HTML 생성
    CableStatusHTML(dataList) {
      if (!dataList || dataList.length === 0) {
        // 데이터가 없는 경우 빈 표시
      }

      let table = `
        <div class="cable-section">
          <table class="summary-table" style="width: max-content; margin-righ:10px; margin-bottom:5px;">
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
            <td>${item.tt_no || '-'}</td>
            <td>${item.guksa_name || '-'}</td>
            <td>${item.cable_name_core || '-'}</td>
            <td>${item.fault_grade || '-'}</td>
            <td>${item.status || '-'}</td>
            <td>${item.sector_analysis || '-'}</td>
            <td>${item.alarm_occur_datetime || '-'}</td>
            <td>${item.alarm_recover_datetime || '-'}</td>
            <td>${item.voc_count || '0'}</td>
            <td>${item.customer_count || '0'}</td>
          </tr>
        `;
      }

      table += '</table></div>';
      return table;
    },

    // MW SNMP 정보 HTML 생성
    MWSnmpInfoHTML(data) {
      try {
        if (!data || !Array.isArray(data.results)) {
          throw new Error('유효한 MW 수집 결과 데이터가 아닙니다.');
        }

        const fadingCount = data.fading_count || 0;
        const batteryCount = data.battery_mode_count || 0;
        const fadingSample = data.fading_sample || '';
        const batterySample = data.battery_sample || '';
        const results = data.results;

        // 경고 메시지와 테이블을 개별 div로 분리
        let alertHtml = '';
        let tableHtml = '';

        // 1. 경고 메시지 생성 - 전파 페이딩 정보만 포함하도록 수정
        if (fadingCount > 0 || batteryCount > 0) {
          const parts = [];
          let alarm_string = '';

          // 페이딩 정보 (존재하는 경우)
          if (fadingCount > 0) {
            alarm_string += 'MW 전파 페이딩 영향 🔴';
            parts.push(
              `<b>변조율이 크게 하락한 MW 장비</b> (${fadingSample}, 총 ${fadingCount}건)가 존재합니다.
          <br>⚠️ 전파 페이딩에 의한 영향일 수 있으니 확인하시기 바랍니다.`
            );
          } else {
            alarm_string += 'MW 전파 페이딩 영향 🟢';
            parts.push(
              `<b>전파 페이딩 영향이 있는 MW 장비</b>가 없습니다.
          <br>모든 MW 장비의 전파 상태가 정상입니다.`
            );
          }

          // 배터리 모드 정보 (존재하는 경우)
          if (batteryCount > 0) {
            alarm_string += ' / 한전 정전 영향 🔴';
            parts.push(
              `<b>MW 장비 중 배터리 모드로 운용 중인 장비</b> (${batterySample}, 총 ${batteryCount}건)가 존재합니다.
          <br>⚠️ 한전 정전의 가능성이 있으니 확인하시기 바랍니다.`
            );
          } else {
            alarm_string += ' / 한전 정전 영향 🟢';
            parts.push(
              `<b>모든 MW 장비가 상전</b>으로 운용 중이며 배터리를 사용중인 장비는 없기 때문에
          <br>한전 정전 상황은 아닌 것으로 판단됩니다.`
            );
          }

          alertHtml = `<div class="bot-warning">${alarm_string} <br><br> ${parts.join(
            '<br><br>'
          )}</div>`;
        } else {
          // 모두 정상인 경우에도 전파 페이딩 정보만 포함
          alertHtml = `
        <div class="bot-warning">
          MW 전파 페이딩 영향 🟢 / 한전 정전 🟢 <br><br>
          MW 장비 변조율의 변화가 크지 않아<b>전파 페이딩의 영향은 없는 것</b>으로 보입니다.
          <br>모든 MW 장비의 전파 상태가 정상입니다.
          <br><br>
          <b>모든 MW 장비가 상전</b>으로 운용 중이며 배터리를 사용 중인 장비는 없기 때문에
          <br>한전 정전 상황은 아닌 것으로 판단됩니다.
        </div>
      `;
        }

        // 2. 테이블 HTML 생성
        tableHtml = `
      <div class="mw-section">
        <div class="mw-result-table" style="margin-top: 5px;margin-bottom: 5px; margin-right: 5px">
          <table class="summary-table">
            <tr style="font-size: 14px;">
              <th>국사ID</th>
              <th>국사명</th>
              <th>장비ID</th>
              <th>장비명</th>
              <th>장비유형</th>
              <th>SNMP 수집</th>
              <th>Fading 여부</th>
              <th>전원상태</th>
              <th>수집일시</th>
            </tr>`;

        for (const item of results) {
          tableHtml += `
        <tr style="font-size: 14px;">
          <td>${item['국사ID'] || '-'}</td>
          <td>${item['국사명'] || '-'}</td>
          <td>${item['장비ID'] || '-'}</td>
          <td>${item['장비명'] || '-'}</td>
          <td>${item['장비유형'] || '-'}</td>
          <td>${item['snmp수집'] || '-'}</td>
          <td>${item['fading'] || '-'}</td>
          <td>${item['전원상태'] || '-'}</td>
          <td>${item['수집일시'] || '-'}</td>
        </tr>`;
        }

        tableHtml += `
        </table>
      </div>
    </div>`;

        // 3. 메시지와 테이블을 분리해서 반환(객체로 반환)
        return { alertHtml, tableHtml };
      } catch (e) {
        console.error('MW 요약 응답 생성 오류:', e);
        return {
          alertHtml: `<div class="error-message">⚠ MW 요약 응답 생성 중 오류 발생: ${e.message}</div>`,
          tableHtml: '',
        };
      }
    },
  };

  // API 호출 모듈
  const APIService = {
    // 광케이블 선로 장애정보 수집
    getDrCableInfo() {
      return Utils.fetchAPI(`/api/cable_status?guksa_id=${AppState.guksa_id}`)
        .then((data) => {
          if (!data.cable_status || !Array.isArray(data.cable_status)) {
            throw new Error('유효한 선로 경보 데이터가 없습니다.');
          }
          return data;
        })
        .catch((err) => {
          console.error('❌ 선로 경보 데이터 로딩 실패:', err);
          throw err;
        });
    },

    // MW 정보 수집 (전원정보 + 변조방식)
    getMWStatus() {
      const guksaId = AppState.guksa_id;

      if (!guksaId) {
        throw new Error('guksa_id가 없습니다');
      }

      return Utils.fetchAPI('/api/mw_info', 'POST', { guksa_id: guksaId })
        .then((response) => {
          if (!response || !response.response) {
            throw new Error('ZMQ Socket 서버로부터 정상적인 응답을 받지 못했습니다.');
          }
          console.log('M/W 장비 SNMP 정보 수신 성공');
          return response.response || response;
        })
        .catch((err) => {
          console.error('M/W 장비 SNMP 정보 수집 실패:', err);
          throw err;
        });
    },
  };

  // UI 컨트롤러 모듈 - 사용자 액션 처리 함수
  const UIController = {
    // 프롬프트 입력 처리
    handlePrompt() {
      const promptInput = DOMUtils.getElement('prompt-input');
      const input = promptInput.value.trim();

      if (!input) {
        DOMRenderer.addErrorMessage('검색어를 입력해 주세요.');
        return;
      }

      // chat 모드 사용 안 할 예정임.
      const mode = 'fixed'; //DOMUtils.querySelector('input[name="queryMode"]:checked').value;
      Utils.toggleButtonsDuringFetch(true);

      const requestTimeObj = new Date();
      const thisResponseId = ++AppState.responseCount;

      // 사용자 메시지 및 로딩 표시 추가
      const userMsg = DOMRenderer.addUserMessage(input, thisResponseId);
      const botLoading = DOMRenderer.addLoadingMessage(mode);
      const summaryItem = DOMRenderer.addSummaryItem(input, thisResponseId);

      // API 호출
      Utils.fetchAPI('/api/rag_popup', 'POST', { query: input, mode, guksa_id: AppState.guksa_id })
        .then((data) => {
          botLoading.remove();
          const responseTimeObj = new Date();

          DOMRenderer.updateTimestamp(requestTimeObj, responseTimeObj);

          let htmlContent;
          if (data.success === false) {
            htmlContent = `<div class="error-message">❌ 오류 발생: ${
              data.error || '알 수 없는 오류'
            }</div>`;
          } else {
            htmlContent = HTMLGenerator.AllSectionHTML(data);
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
          promptInput.value = '';
          DOMRenderer.updatePlaceholder();
        });
    },

    // Dr. Cable에서 광케이블 선로 피해정보 수집
    getDrCableInfo() {
      // 표준화된 사용자 요청 처리 함수 사용
      const input = '가장 최근에 발생한 선로장애 내역을 확인해줘...';

      Utils.handleUserRequest(input, (responseId, botLoading, summaryItem) => {
        botLoading.innerHTML = '🔄 <b>선로장애 정보 조회 중...</b>';

        return APIService.getDrCableInfo()
          .then((data) => {
            if (botLoading && botLoading.parentNode) {
              botLoading.remove();
            }

            const unrecovered = data.unrecovered_alarm || { count: 0 };
            let warningMsg = '';

            if (unrecovered.count === 0) {
              warningMsg = `선로 장애 영향 🟢 <br><br> <b>'현재'</b> 해당 지역에 <b>미복구된 선로 장애는 없는 것으로 파악이 됩니다.</b><br>
                  아래 선로 장애 내역을 참고해 주시고, <b>'다른 분야의 경보 내역'</b>을 추가로 확인하시기 바랍니다.`;
            } else {
              const recent = unrecovered.most_recent || {};
              warningMsg = `선로 장애 영향 🔴 <br><br> ${recent.alarm_occur_datetime || ''}, <b>
                  ${recent.guksa_name || '알 수 없음'}</b>의 <b>선로장애</b>(${
                recent.cable_name_core || '알 수 없음'
              }, ${recent.fault_sector || '알 수 없음'}) 
                등 <b>
                  ${unrecovered.count}건</b>의 <b>미복구 장애</b>가 조회됩니다. 
                <br>⚠️ 현재 장애가 아래 선로장애 영향인지 확인이 필요합니다.
                <br><br> ※ 선로장애 발생일시, 국사, 케이블명 등을 확인바랍니다.`;
            }

            DOMRenderer.addBotMessage(
              `<div class="bot-warning">${warningMsg}</div>`,
              'bot-msg msg-info'
            );

            const tableHtml = HTMLGenerator.CableStatusHTML(data.cable_status);
            DOMRenderer.addBotMessage(tableHtml);

            summaryItem.classList.add('completed');
            return data;
          })
          .catch((error) => {
            if (botLoading && botLoading.parentNode) {
              botLoading.remove(); // 오류 발생 시에도 로딩 메시지 제거
            }
            DOMRenderer.addErrorMessage(error);
            summaryItem.classList.add('error');
            throw error; // 오류를 상위로 전파
          });
      });
    },

    // MW SNMP 정보 수집
    getMWInfoFromSNMP() {
      const input = '현재 도서 M/W 장비의 전원과 페이딩 상태를 확인해줘...';

      Utils.handleUserRequest(input, (responseId, botLoading, summaryItem) => {
        botLoading.innerHTML = '🔄 <b>M/W 장비의 전원과 페이딩 정보 분석 중...</b>';

        return APIService.getMWStatus()
          .then((data) => {
            if (botLoading && botLoading.parentNode) {
              botLoading.remove();
            }

            // HTML 생성 - 객체로 반환됨
            const { alertHtml, tableHtml } = HTMLGenerator.MWSnmpInfoHTML(data);

            // 개별 div로 분리해서 출력
            DOMRenderer.addBotMessage(alertHtml, 'bot-msg msg-info'); // 경고 메시지 먼저 출력
            DOMRenderer.addBotMessage(tableHtml); // 그 다음 테이블 출력

            summaryItem.classList.add('completed');
            return data;
          })
          .catch((error) => {
            if (botLoading && botLoading.parentNode) {
              botLoading.remove(); // 오류 발생 시에도 로딩 메시지 제거
            }
            DOMRenderer.addErrorMessage(error);
            summaryItem.classList.add('error');
            throw error; // 오류를 상위로 전파
          });
      });
    },

    // 대화 내용 초기화
    clearConversation() {
      if (confirm('모든 대화 내용을 초기화하시겠습니까?')) {
        DOMUtils.getElement('response-box').innerHTML = '';
        DOMUtils.getElement('summary-list').innerHTML = '';
        // DOMUtils.getElement('prompt-input').value = ''; // 프롬프트는 유지
        AppState.responseCount = 0;

        // 타임스탬프 초기화
        const timestamp = DOMUtils.getElement('timestamp');
        if (timestamp) {
          timestamp.textContent = '';
        }

        // 로컬 스토리지 초기화
        StorageService.removeConversation();
      }
    },

    // 사이드바 토글 - 펼치기/접기
    toggleSidebar() {
      const sidebar = DOMUtils.getElement('summary-list');
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

  // 로컬 스토리지 관리 모듈
  const StorageService = {
    // 대화 내용 저장
    saveConversation() {
      const responseBox = DOMUtils.getElement('response-box');
      const summaryList = DOMUtils.getElement('summary-list');

      localStorage.setItem('nw-rag-conversation', responseBox.innerHTML);
      localStorage.setItem('nw-rag-summary', summaryList.innerHTML);
      localStorage.setItem('nw-rag-count', AppState.responseCount.toString());
    },

    // 대화 내용 불러오기
    loadConversation() {
      const savedConversation = localStorage.getItem('nw-rag-conversation');
      const savedSummary = localStorage.getItem('nw-rag-summary');
      const savedCount = localStorage.getItem('nw-rag-count');

      if (savedConversation) {
        DOMUtils.getElement('response-box').innerHTML = savedConversation;
      }

      if (savedSummary) {
        DOMUtils.getElement('summary-list').innerHTML = savedSummary;
      }

      if (savedCount) {
        AppState.responseCount = parseInt(savedCount);
      }
    },

    // 로컬 스토리지 초기화
    removeConversation() {
      localStorage.removeItem('nw-rag-conversation');
      localStorage.removeItem('nw-rag-summary');
      localStorage.removeItem('nw-rag-count');
    },
  };

  // DOM 렌더링 모듈
  const DOMRenderer = {
    // 타임스탬프 업데이트
    updateTimestamp(requestTime, responseTime) {
      const timestamp = DOMUtils.getElement('timestamp');
      if (!timestamp) return;

      const { durationMin, remainSec } = Utils.calculateDuration(requestTime, responseTime);
      timestamp.innerHTML = `요청: ${Utils.formatDateTime(
        requestTime
      )} → 응답: ${Utils.formatDateTime(responseTime)} (소요시간: ${durationMin}분 ${remainSec}초)`;
    },

    // 사용자 메시지 추가
    addUserMessage(input, responseId) {
      const responseBox = DOMUtils.getElement('response-box');

      const userMsg = DOMUtils.createElement('div', {
        className: 'user-msg',
        id: `response-${responseId}`,
        textContent: input,
      });

      DOMUtils.appendElement(responseBox, userMsg);
      return userMsg;
    },

    // 로딩 메시지 추가
    addLoadingMessage(mode) {
      const responseBox = DOMUtils.getElement('response-box');
      let content = '';

      if (mode === 'chat') {
        content = '🔄 <b>답변 생성 중...</b> <br><br> 요청한 질문에 대해 답변을 생성합니다.';
      } else if (mode === 'loading') {
        content = '🔄 <b>데이터 로딩 중...</b>';
      } else {
        content =
          '🔄 <b>장애점 추론 중...</b> <br><br> 발생한 장애증상과 경보 패턴을 분석하여 유사 장애발생 사례를 기준으로 장애점을 추론합니다.';
      }

      const botLoading = DOMUtils.createElement(
        'div',
        {
          className: 'bot-msg loading',
        },
        content
      );

      DOMUtils.appendElement(responseBox, botLoading);
      responseBox.scrollTop = responseBox.scrollHeight;

      return botLoading;
    },

    // 요약 항목 추가
    addSummaryItem(input, responseId) {
      const summaryList = DOMUtils.getElement('summary-list');

      const summaryItem = DOMUtils.createElement('div', {
        className: 'summary-entry',
        textContent: [...input].slice(0, 20).join('') + (input.length > 20 ? '...' : ''),
        dataset: { timestamp: new Date().toLocaleTimeString() },
        onclick: () => {
          const targetEl = DOMUtils.getElement(`response-${responseId}`);
          if (targetEl) {
            window.scrollTo(0, window.scrollY - 5);
            setTimeout(() => {
              targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 50);
          }
        },
      });

      DOMUtils.appendElement(summaryList, summaryItem);
      return summaryItem;
    },

    // 봇 메시지 추가
    addBotMessage(htmlContent, className = 'bot-msg') {
      const responseBox = DOMUtils.getElement('response-box');

      const botMsg = DOMUtils.createElement(
        'div',
        {
          className: className,
        },
        htmlContent
      );

      DOMUtils.appendElement(responseBox, botMsg);
      responseBox.scrollTop = responseBox.scrollHeight;

      return botMsg;
    },

    // 에러 메시지 추가
    addErrorMessage(error) {
      const errorMessage = typeof error === 'string' ? error : error.message || '알 수 없는 오류';

      return this.addBotMessage(`<div class="error-message">❌ 오류: ${errorMessage}</div>`);
    },

    // 쿼리 모드에 따른 placeholder 업데이트
    updatePlaceholder() {
      //       const mode = DOMUtils.querySelector('input[name="queryMode"]:checked').value;
      const promptInput = DOMUtils.getElement('prompt-input');

      //       if (mode === 'fixed') {
      promptInput.placeholder =
        'NW 장애발생 시 장애점을 찾을 수 있도록 분야별 세부 경보내역을 입력해 주세요!\n\n[장애점 추론] 외부 환경(정전/페이딩/선로장애) + 경보내역 + 장애증상과 유사한 장애사례를 기준으로 추론 \n[유사 장애사례 추출] 입력된 경보내역 등을 바탕으로 유사도가 높은 사례 3건 추출';
    },
  };

  // DOM 조작 관련 유틸리티 함수
  const DOMUtils = {
    // 요소 ID로 DOM 요소 가져오기
    getElement(id) {
      return document.getElementById(id);
    },

    // CSS 선택자로 DOM 요소 가져오기
    querySelector(selector) {
      return document.querySelector(selector);
    },

    // CSS 선택자로 여러 DOM 요소 가져오기
    querySelectorAll(selector) {
      return document.querySelectorAll(selector);
    },

    // 새 DOM 요소 생성
    createElement(tag, props = {}, content) {
      const element = document.createElement(tag);

      // 속성 설정
      Object.entries(props).forEach(([key, value]) => {
        if (key === 'className') {
          element.className = value;
        } else if (key === 'dataset') {
          Object.entries(value).forEach(([dataKey, dataValue]) => {
            element.dataset[dataKey] = dataValue;
          });
        } else if (key === 'style') {
          Object.entries(value).forEach(([styleKey, styleValue]) => {
            element.style[styleKey] = styleValue;
          });
        } else if (key.startsWith('on') && typeof value === 'function') {
          // 이벤트 리스너
          const eventName = key.substring(2).toLowerCase();
          element.addEventListener(eventName, value);
        } else {
          element[key] = value;
        }
      });

      // 내용 설정
      if (content) {
        if (typeof content === 'string') {
          element.innerHTML = content;
        } else {
          element.appendChild(content);
        }
      }

      return element;
    },

    // 부모 요소에 자식 요소 추가하기
    appendElement(parent, child) {
      parent.appendChild(child);
      return child;
    },
  };

  // 유틸리티 함수 모듈
  const Utils = {
    // API 호출 함수
    fetchAPI(url, method = 'GET', data = null) {
      const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
      };

      if (data) {
        options.body = JSON.stringify(data);
      }

      console.log(`API 요청: ${method} ${url}`, data ? `데이터: ${JSON.stringify(data)}` : '');

      return fetch(url, options)
        .then((res) => {
          console.log(`API 응답 상태: ${res.status} ${res.statusText}`);

          // 응답이 ok가 아닌 경우 (HTTP 에러 코드)
          if (!res.ok) {
            return res
              .json()
              .then((errorData) => {
                // 서버에서 에러 메시지를 보낸 경우 활용
                const errorMsg = errorData.error || `서버 오류: ${res.status} ${res.statusText}`;
                console.error(`API 오류: ${errorMsg}`);
                throw new Error(errorMsg);
              })
              .catch((jsonErr) => {
                // JSON 파싱 오류인 경우 원래 오류 메시지 사용
                console.error(`API 응답 파싱 오류: ${jsonErr}`);
                throw new Error(`서버 오류: ${res.status} ${res.statusText}`);
              });
          }

          return res.json();
        })
        .then((data) => {
          console.log(`API 응답 데이터:`, data);
          return data;
        })
        .catch((err) => {
          // fetch 자체의 네트워크 오류 (CORS, 네트워크 끊김 등)
          console.error(`API 호출 중 오류 발생: ${err.message}`);
          throw err;
        });
    },

    // 날짜/시간 포맷팅
    formatDateTime(dt) {
      return dt.toISOString().slice(0, 19).replace('T', ' ');
    },

    // 소요 시간 계산
    calculateDuration(startTime, endTime) {
      const durationSec = Math.floor((endTime - startTime) / 1000);
      const durationMin = Math.floor(durationSec / 60);
      const remainSec = durationSec % 60;
      return { durationMin, remainSec };
    },

    // 현재 시간 문자열 반환
    getCurrentTime() {
      const date = new Date();
      const pad = (n) => (n < 10 ? '0' + n : n);
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
        date.getHours()
      )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    },

    // 데이터 로딩 중 버튼 비활성화/활성화
    toggleButtonsDuringFetch(disabled) {
      const buttons = [DOMUtils.getElement('getAlarmBtn'), DOMUtils.getElement('sendBtn')];

      buttons.forEach((btn) => {
        if (!btn) return;

        btn.disabled = disabled;
        if (disabled) {
          btn.classList.add('disabled');
        } else {
          btn.classList.remove('disabled');
        }
      });
    },

    // 표준화된 사용자 요청 처리 함수
    handleUserRequest(input, processFunction) {
      Utils.toggleButtonsDuringFetch(true);

      const thisResponseId = ++AppState.responseCount;
      const userMsg = DOMRenderer.addUserMessage(input, thisResponseId);
      const summaryItem = DOMRenderer.addSummaryItem(input, thisResponseId);
      const botLoading = DOMRenderer.addLoadingMessage('loading');

      return processFunction(thisResponseId, botLoading, summaryItem)
        .catch((error) => {
          if (botLoading && botLoading.parentNode) {
            botLoading.remove(); // 아직 로딩 메시지가 있으면 제거
          }
          DOMRenderer.addErrorMessage(error);
          summaryItem.classList.add('error');
          console.error('요청 처리 오류:', error);
        })
        .finally(() => {
          Utils.toggleButtonsDuringFetch(false);
        });
    },
  };

  // 사이드바 드래그 기능 설정
  function setupSidebarDrag() {
    const sidebar = DOMUtils.getElement('summary-list');
    const dragHandle = DOMUtils.getElement('drag-handle');
    const toggleBtn = DOMUtils.getElement('toggle-btn');

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

  // Prompt 경보 데이터 초기화
  function initializeWithAlarmData() {
    console.log('🎯 initializeWithAlarmData 함수 시작');
    console.log('🌐 window.faultData:', window.faultData);

    const faultData = window.faultData;

    if (!faultData) {
      console.error('❌ window.faultData가 없습니다!');
      return;
    }

    if (!faultData.alarms || faultData.alarms.length === 0) {
      console.warn('⚠️ faultData.alarms가 없거나 빈 배열입니다:', faultData.alarms);
      // 경보가 없는 경우 간단한 텍스트만 설정
      const promptInput = DOMUtils.getElement('prompt-input');
      promptInput.value = '현재 경보가 없는 상태입니다. 네트워크 상태를 분석해 주세요.';
      console.log('✅ 경보 없는 상태로 프롬프트 초기화 완료');
      return;
    }

    const promptInput = DOMUtils.getElement('prompt-input');
    const alarms = faultData.alarms;

    console.log('📊 데이터 확인:');
    console.log('  - alarms 개수:', alarms.length);
    console.log('  - 첫 번째 경보:', alarms[0]);

    // 분야별로 경보 그룹화
    const alarmsBySector = {};
    alarms.forEach((alarm) => {
      const sector = alarm.sector || '기타';
      if (!alarmsBySector[sector]) {
        alarmsBySector[sector] = [];
      }
      alarmsBySector[sector].push(alarm);
    });

    console.log('🏷️ 분야별 경보 그룹화:', alarmsBySector);

    // 경보 텍스트 생성 (간소화)
    let alarmText = '';

    // Prompt에 전달할 순수 분야별 경보 추가
    Object.entries(alarmsBySector).forEach(([sector, sectorAlarms]) => {
      alarmText += `[${sector} 경보]\n`;
      sectorAlarms.forEach((alarm) => {
        alarmText += `- ${alarm.alarm_message}\n`;
      });
      alarmText += '\n';
    });

    alarmText += '위 경보들을 종합하여 네트워크 장애점을 분석해 주세요.';

    promptInput.value = alarmText;
    console.log('✅ 프롬프트 초기화 완료, 텍스트 길이:', alarmText.length);
  }

  // 초기화 및 이벤트 리스너 설정
  function initApp() {
    console.log('🚀 fault_detector.js initApp 시작');

    // 전달받은 데이터로 초기화
    if (window.faultData && window.faultData.alarms && window.faultData.alarms.length > 0) {
      console.log('📊 경보 데이터가 있어서 initializeWithAlarmData 호출');
      initializeWithAlarmData();
    } else if (window.faultData) {
      console.log('📊 경보 데이터는 없지만 faultData가 있어서 initializeWithAlarmData 호출');
      initializeWithAlarmData();
    } else {
      console.warn('⚠️ window.faultData가 없습니다!');
    }

    // 로컬 스토리지에서 대화 이력 로드
    StorageService.loadConversation();

    // 플레이스홀더 업데이트
    DOMRenderer.updatePlaceholder();

    // 버튼 이벤트 리스너 설정
    DOMUtils.getElement('getCableBtn').addEventListener('click', UIController.getDrCableInfo);
    DOMUtils.getElement('getMWInfoBtn').addEventListener('click', UIController.getMWInfoFromSNMP);
    DOMUtils.getElement('clearChatBtn').addEventListener('click', UIController.clearConversation);
    DOMUtils.getElement('sendBtn').addEventListener('click', UIController.handlePrompt);

    // 엔터 키 이벤트 처리
    DOMUtils.getElement('prompt-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        UIController.handlePrompt();
      }
    });

    // 자동 저장 타이머 설정
    setInterval(() => StorageService.saveConversation(), 60000);

    // 사이드바 드래그 설정
    setupSidebarDrag();

    console.log('✅ fault_detector.js 초기화 완료');
  }

  // 페이지 로드 시 앱 초기화
  document.addEventListener('DOMContentLoaded', initApp);
})();
