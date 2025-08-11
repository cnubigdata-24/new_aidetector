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
      <span class="header-title">NW ����� �м�/Ž��</span>&nbsp; (Advanced RAG)
      <div class="timestamp" id="timestamp"></div>
    </div>

    <div class="container">
      <div class="sidebar" id="summary-list">
        <!-- ���� ��� �׸��� ���⿡ �������� �߰��� -->
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
              [ A-RAG Prompt ] ���� ���õ� �����:
              <span id="kuksa_name">{{ kuksa_id or '����' }}</span>
            </div>

            <div style="display: flex; align-items: center; gap: 10px">
              <label
                ><input type="radio" name="queryMode" value="fixed" checked /> ����� �߷�</label
              >
              <label><input type="radio" name="queryMode" value="chat" /> ��ȭ ���</label>

              <button class="button-getalarm" onclick="UIController.getRealTimeAlarmList()">
                �ǽð� �溸 ����
              </button>
              <button class="button-getcable" onclick="UIController.getDrCableInfo()">
                ���� ��� Ȯ��
              </button>
              <button class="button-getmwinfo" onclick="UIController.getMWInfoFromSNMP()">
                ����/���̵� Ȯ��
              </button>
              <button class="button-initchat" onclick="UIController.clearConversation()">
                ��ȭ �ʱ�ȭ
              </button>
            </div>
          </div>

          <div>
            <textarea
              id="prompt-input"
              placeholder="������� ã�� �� �ֵ��� ���� ��� ����� �оߺ� �溸�� �Է��� �ּ��� !!!
    1. [����� ��ȸ] ��� �����̳� �溸 ������ �Է��ϸ� ������ ���� ��ʸ� ��ȸ�� �帳�ϴ�.
    2. [�� �˻�] ��ü���� �溸 �ڵ峪 ������ �Է��Ҽ��� �� ��Ȯ�� ����� ���� �� �ֽ��ϴ�.
    3. [���� �˻�] '���� �о�', 'IP �о�', '��ȯ �о�'�� ���� Ư�� �о߸� �����Ͽ� �˻��� �� �ֽ��ϴ�."
            >
            </textarea>

            <button class="send-button" onclick="UIController.handlePrompt()">��</button>
          </div>
        </div>
      </div>
    </div>

    <script>
      //  * ���� ���� �� ���� ����
      const AppState = {
        requestTime: null,
        responseCount: 0,
        kuksa_id: new URLSearchParams(window.location.search).get('kuksa_id'),
        isDragging: false,
        isSidebarVisible: true,

        init() {
          console.log('������Ʈ������ ���� kuksa_id:', this.kuksa_id);
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
              throw new Error(`���� ����: ${res.status}`);
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
          timestamp.innerHTML = `��û: ${Utils.formatDateTime(
            requestTime
          )} �� ����: ${Utils.formatDateTime(
            responseTime
          )} (�ҿ�ð�: ${durationMin}�� ${remainSec}��)`;
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
              '?? <b>�亯 ���� ��...</b> <br><br> ��û�� ������ ���� �亯�� �����մϴ�.';
          } else {
            botLoading.innerHTML =
              '?? <b>����� �߷� ��...</b> <br><br> �߻��� �������� �溸 ������ �м��Ͽ� ���� ��ֹ߻� ��ʸ� �������� ������� �߷��մϴ�.';
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
          errorMsg.innerHTML = `? <b>���� �߻�</b> <br>${error}`;

          responseBox.appendChild(errorMsg);
          responseBox.scrollTop = responseBox.scrollHeight;

          return errorMsg;
        },

        updatePlaceholder() {
          const mode = document.querySelector('input[name="queryMode"]:checked').value;
          const promptInput = document.getElementById('prompt-input');

          if (mode === 'fixed') {
            promptInput.placeholder =
              'NW ��ֹ߻� �� ������� ã�� �� �ֵ��� �оߺ� ���� �溸������ �Է��� �ּ��� !!!\n\n[����� �߷�] �溸����/������� �Է� �� ���� ��ֻ�ʸ� �������� ������� �߷� \n[���� ��ֻ�� ����] �Էµ� �溸��Ȳ�� ���絵�� ���� ��� 3�� (��ü ���� �Է�)';
          } else {
            promptInput.placeholder =
              '��ֿ� ���� �����Ӱ� �����ϼ���:\n- �� ����� ������ �����ΰ���?\n- � ��ġ�� �ʿ��Ѱ���?\n ������ ��� ��ʰ� �־�����?';
          }
        },
      };

      const HTMLGenerator = {
        // �Ľ̵� JSON ������ ���� ����
        parsedData: null,

        createChatModeResponse(input, response) {
          try {
            return `
        <details open>
          <summary><b>?? ���� ��ġ��/����</b></summary>
          <div><b>[����]</b> <br>${input}</div> <br>
          <div><b>[����]</b> <br>${response.replace(/\n/g, '<br>')}</div>
        </details>
      `;
          } catch (e) {
            console.error('ä�� ���� ���� ����:', e);
            return `<div class="error-message">���� ó�� �� ������ �߻��߽��ϴ�: ${e.message}</div>`;
          }
        },

        createOpinionSection() {
          if (!this.parsedData || !this.parsedData.opinion) {
            return '<div class="empty-opinion">���� �ǰ��� ������ �� �����ϴ�.</div>';
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
            return '<div>��� �����Ͱ� �����ϴ�.</div>';
          }

          const rows = this.parsedData.summary;
          let tableHTML = '<table class="summary-table">';

          // ���̺� ���
          tableHTML += '<tr>';
          tableHTML += '<th style="width:45px;">����</th>';
          tableHTML += '<th style="width:60px;">���絵</th>';
          tableHTML += '<th style="width:85px;">�о�</th>';
          tableHTML += '<th style="width:380px;">�����</th>';
          tableHTML += '<th>��ֻ��</th>';
          tableHTML += '</tr>';

          // ���̺� ����
          for (const row of rows) {
            tableHTML += '<tr>';
            tableHTML += `<td>${row['����'] || '�Ҹ�'}</td>`;
            tableHTML += `<td>${row['���絵'] || row[' ���絵'] || '�Ҹ�'}</td>`;
            tableHTML += `<td>${row['�о�'] || '�Ҹ�'}</td>`;
            tableHTML += `<td>${row['�����'] || '�Ҹ�'}</td>`;
            tableHTML += `<td>${row['��ֻ��'] || '�Ҹ�'}</td>`;
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
            return '<div>���� ������ �����ϴ�.</div>';
          }

          const details = this.parsedData.details;
          let detailsHTML = '<div class="details-container">';

          // �� ���� ���� �׸��� ���� Ŭ������ ��Ÿ�ϸ�
          for (const item of details) {
            detailsHTML += `
        <div class="detail-item">
          <div class="detail-header">
            [����� �߷� #${item['����']}] (${item['�о�']}) ${item['�����']} (���絵: ${item['���絵']})
          </div>
          <table class="detail-table">
      `;

            // �ֿ� ���� �׸�
            const infoFields = [
              { key: '�߻�����', value: item['�߻�����'] || '���� ����' },
              { key: '��ֻ��', value: item['��ֻ��'] || '���� ����' },
              { key: '�о�', value: item['�о�'] || '���� ����' },
            ];

            // �ʼ� ���� ���̺� �� �߰�
            for (const field of infoFields) {
              detailsHTML += `
          <tr>
            <th>${field.key}</th>
            <td>${field.value}</td>
          </tr>
        `;
            }

            // ������ ���� �׸�� (�ִ� ��츸 ǥ��)
            const optionalFields = [
              { key: '��ֺм�', value: item['��ֺм�'] },
              { key: '�溸��Ȳ', value: item['�溸��Ȳ'] },
              { key: '��ġ����', value: item['��ġ����'] },
            ];

            // ������ ���� ���̺� �� �߰�
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

        //  API ���� ��ü ó�� ����
        createAllSection(json_string) {
          try {
            // ���޵� �����Ͱ� ��ü���� Ȯ��
            if (!json_string || typeof json_string !== 'object') {
              throw new Error('��ȿ�� API ���� �����Ͱ� �ƴմϴ�.');
            }

            // �ʼ� �ʵ� Ȯ��
            if (!json_string.opinion || !json_string.summary || !json_string.details) {
              throw new Error('API ���信 �ʿ��� �ʵ尡 �����Ǿ����ϴ�.');
            }

            // �Ľ̵� ������ ����
            this.parsedData = json_string;

            // �� ���� HTML ����
            const opinionSection = this.createOpinionSection();
            const summaryTable = this.createSummarySection();
            const detailsSection = this.createDetailsSection();

            const processingTime = json_string.processing_time || '';

            return `
        <div class="result-section">
          <p class="section-title">? <b>���� �ǰ�</b></p>${opinionSection}          
          <p class="section-title">? <b>����� �߷� ���</b></p>${summaryTable}          
          <p class="section-title">? <b>����� �߷� ���γ���</b></p>${detailsSection}
          
          <div style="margin-top: 10px; font-size: 0.9em; color: #666;">
            �� Vector DB Query �ð�: ${
              typeof processingTime === 'number' ? processingTime.toFixed(2) : processingTime
            }��
          </div>
        </div>
      `;
          } catch (e) {
            console.error('����� �߷� ���� ���� ����:', e);
            return `
        <div class="error-message">
          <p>������ ó�� �� ������ �߻��߽��ϴ�:</p>
          <p>${e.message}</p>
          <p>�� ����: ${JSON.stringify(json_string).substring(0, 100)}...</p>
        </div>
      `;
          }
        },

        generateCableStatusTable(dataList) {
          if (!dataList || dataList.length === 0) {
            return '<div>���� �溸 ������ �����ϴ�.</div>';
          }

          let table = `
    <div class="cable-section">
      <table class="summary-table" style="width: max-content;">
        <tr style="height: 10px; font-size: 14px;">
          <th>��ֹ�ȣ</th>
          <th>�����</th>
          <th>���̺���</th>
          <th>���</th>
          <th>����</th>
          <th>���ؿ���</th>
          <th>�߻��Ͻ�</th>
          <th>�����Ͻ�</th>
          <th>VOC �Ǽ�</th>
          <th>���������</th>
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

      // API ȣ�� ���
      const APIService = {
        // �ǽð� �溸 ��ȸ
        getRealTimeAlarmList() {
          Utils.toggleButtonsDuringFetch(true);

          return Utils.fetchAPI('/api/latest_alarms')
            .then((data) => {
              if (data.alarms) {
                document.getElementById('prompt-input').value =
                  '�溸���� �����Դϴ�.\n\n' + data.alarms;
              }
              return data;
            })
            .catch((err) => {
              console.error('? �溸 ������ �ε� ����:', err);
            })
            .finally(() => {
              Utils.toggleButtonsDuringFetch(false);
            });
        },

        // �����̺� ���� ������� ����
        getDrCableInfo() {
          Utils.toggleButtonsDuringFetch(true);

          return Utils.fetchAPI('/api/cable_status')
            .then((data) => {
              if (!data.cable_status || !Array.isArray(data.cable_status)) {
                throw new Error('��ȿ�� ���� �溸 �����Ͱ� �����ϴ�.');
              }

              return data;
            })
            .catch((err) => {
              console.error('? ���� �溸 ������ �ε� ����:', err);
              throw err;
            })
            .finally(() => {
              Utils.toggleButtonsDuringFetch(false);
            });
        },

        // MW ���� ���� (�������� + �������)
        getMWInfoFromSNMP() {
          Utils.toggleButtonsDuringFetch(true);

          const kuksaId = AppState.kuksa_id;

          if (!kuksaId) {
            alert('������� �м��� ��� kuksa_id�� �����ϴ�.');
            return Promise.reject(new Error('kuksa_id�� �����ϴ�'));
          }

          return Utils.fetchAPI('/api/mw_info', 'POST', { kuksa_id: kuksaId })
            .then((response) => {
              if (!response || !response.response) {
                alert('ZMQ Socket �����κ��� �������� ������ ���� ���߽��ϴ�.');
                throw new Error('ZMQ ���� ����');
              }

              console.log('M/W ��� SNMP ���� ���� ����:', response);
              return response;
            })
            .catch((err) => {
              console.error('M/W ��� SNMP ���� ���� ����:', err);
              alert('M/W SNMP ���� ���� �� ������ �߻��߽��ϴ�.\n�����ڿ��� �����ϼ���.');
              throw err;
            })
            .finally(() => {
              Utils.toggleButtonsDuringFetch(false);
            });
        },

        // ��� ������ �� ���� ����
        collectAllData() {
          return Promise.all([
            this.getRealTimeAlarmList(),
            this.getDrCableInfo(),
            this.getMWInfoFromSNMP(),
          ]);
        },

        // ����� ��������
        getKuksaName() {
          if (!AppState.kuksa_id) {
            document.getElementById('kuksa_name').innerText = '����';
            return Promise.resolve();
          }

          return Utils.fetchAPI(`/api/kuksa_name?kuksa_id=${AppState.kuksa_id}`)
            .then((data) => {
              if (data.kuksa_name) {
                document.getElementById('kuksa_name').innerText = data.kuksa_name;
              } else {
                document.getElementById('kuksa_name').innerText = '�� �� ����';
              }
            })
            .catch((err) => {
              console.error('����� ��ȸ ����:', err);
              document.getElementById('kuksa_name').innerText = '��ȸ ����';
            });
        },
      };

      // ���� ���丮�� ���� ���
      const StorageService = {
        keys: {
          conversation: 'nw-rag-conversation',
          summary: 'nw-rag-summary',
          count: 'nw-rag-count',
        },

        // ��ȭ ���� ����
        saveConversation() {
          const responseBox = document.getElementById('response-box');
          const summaryList = document.getElementById('summary-list');

          localStorage.setItem(this.keys.conversation, responseBox.innerHTML);
          localStorage.setItem(this.keys.summary, summaryList.innerHTML);
          localStorage.setItem(this.keys.count, AppState.responseCount.toString());
        },

        // ��ȭ ���� �ҷ�����
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

        // ��ȭ ���� �ʱ�ȭ
        clearConversation() {
          if (confirm('��� ��ȭ ������ �ʱ�ȭ�Ͻðڽ��ϱ�?')) {
            document.getElementById('response-box').innerHTML = '';
            document.getElementById('summary-list').innerHTML = '';
            document.getElementById('prompt-input').value = '';
            AppState.responseCount = 0;

            // ������ ��ȭ �ʱ�ȭ ��û
            Utils.fetchAPI('/api/clear_conversation', 'POST', { clear: true }).catch((err) =>
              console.error('��ȭ �ʱ�ȭ ����:', err)
            );

            // Ÿ�ӽ����� �ʱ�ȭ
            if (document.getElementById('timestamp')) {
              document.getElementById('timestamp').textContent = '';
            }

            // ���� ���丮�� �ʱ�ȭ
            Object.values(this.keys).forEach((key) => localStorage.removeItem(key));
          }
        },
      };

      // UI ��Ʈ�ѷ� ��� - ����� �׼� ó�� �Լ�
      const UIController = {
        // ������Ʈ �Է� ó��
        handlePrompt() {
          const input = document.getElementById('prompt-input').value.trim();
          if (!input) {
            alert('�˻�� �Է��� �ּ���.');
            return;
          }

          const mode = document.querySelector('input[name="queryMode"]:checked').value;
          Utils.toggleButtonsDuringFetch(true);

          const requestTimeObj = new Date();
          const thisResponseId = ++AppState.responseCount;

          // ����� �޽��� �� �ε� ǥ�� �߰�
          const userMsg = DOMRenderer.addUserMessage(input, thisResponseId);
          const botLoading = DOMRenderer.addLoadingMessage(mode);
          const summaryItem = DOMRenderer.addSummaryItem(input, thisResponseId);

          // API ȣ��
          Utils.fetchAPI('/api/rag_popup', 'POST', { query: input, mode })
            .then((data) => {
              botLoading.remove();
              const responseTimeObj = new Date();

              DOMRenderer.updateTimestamp(requestTimeObj, responseTimeObj);

              let htmlContent;

              if (data.success === false) {
                htmlContent = `<div class="error-message">? ���� �߻�: ${
                  data.error || '�� �� ���� ����'
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

        // �ǽð� �溸 ��� ��������
        getRealTimeAlarmList() {
          APIService.getRealTimeAlarmList();
        },

        // Dr. Cable���� �����̺� ���� �������� ����
        getDrCableInfo() {
          Utils.toggleButtonsDuringFetch(true);

          APIService.getDrCableInfo()
            .then((data) => {
              if (!data.cable_status || !Array.isArray(data.cable_status)) {
                throw new Error('��ȿ�� ���� �溸 �����Ͱ� �����ϴ�.');
              }

              // 1) ����� �Է� �޽���
              const input = '���� �ֱٿ� �߻��� ������� ������ Ȯ������...';
              const thisResponseId = ++AppState.responseCount;
              const userMsg = DOMRenderer.addUserMessage(input, thisResponseId);
              const summaryItem = DOMRenderer.addSummaryItem(input, thisResponseId);

              const botLoading = document.createElement('div');
              botLoading.className = 'bot-msg loading';
              botLoading.innerHTML = '?? <b>������� ���� ��ȸ ��...</b>';
              document.getElementById('response-box').appendChild(botLoading);

              const unrecovered = data.unrecovered_alarm || { count: 0 };
              let warningMsg = '';

              if (unrecovered.count === 0) {
                warningMsg = `<b>'����'</b> �ش� ������ <b>�̺����� ���� ��ִ� ���� ������ �ľ��� �˴ϴ�.</b><br>
                  �Ʒ� ���� ��� ������ ������ �ֽð�, <b>'�ٸ� �о��� �溸 ����'</b>�� �߰��� Ȯ���Ͻñ� �ٶ��ϴ�.`;
              } else {
                const recent = unrecovered.most_recent || {};
                warningMsg = `${recent.alarm_occur_datetime || ''}, <b>
                  ${recent.guksa_name || '�� �� ����'}</b>�� <b>�������</b>(${
                  recent.cable_name_core || '�� �� ����'
                }, ${recent.fault_sector || '�� �� ����'}) 
                   �� <b>
                    ${unrecovered.count}��</b>�� <b>�̺��� ���</b>�� ��ȸ�˴ϴ�. 
                  <br>���� ��ְ� �Ʒ� ������� �������� Ȯ���� �ʿ��մϴ�.`;
              }

              // ���� �޽��� ���� + �� �޽��� �߰�
              botLoading.remove();
              DOMRenderer.addBotMessage(`<div class="bot-warning">${warningMsg}</div>`);

              const tableHtml = HTMLGenerator.generateCableStatusTable(data.cable_status);
              DOMRenderer.addBotMessage(tableHtml);

              summaryItem.classList.add('completed');
            })
            .catch((err) => {
              console.error('? ������� ������ Ȯ�� ����:', err);
              DOMRenderer.addErrorMessage(
                `������� �����͸� �������� ���߽��ϴ�.<br>${err.message}`
              );
            })
            .finally(() => {
              Utils.toggleButtonsDuringFetch(false);
            });
        },

        // MW SNMP ���� ���� �� DOM�� ��� ��� ����
        getMWInfoFromSNMP() {
          Utils.toggleButtonsDuringFetch(true);

          const input = '���� ���� M/W ����� ������ ���̵� ���¸� Ȯ������...';
          const thisResponseId = ++AppState.responseCount;

          const userMsg = DOMRenderer.addUserMessage(input, thisResponseId);
          const summaryItem = DOMRenderer.addSummaryItem(input, thisResponseId);

          const botLoading = document.createElement('div');
          botLoading.className = 'bot-msg loading';
          botLoading.innerHTML = '?? <b>M/W ����� ������ ���̵� ���� �м� ��...</b>';
          document.getElementById('response-box').appendChild(botLoading);

          APIService.getMWInfoFromSNMP()
            .then((data) => {
              let resultHTML = '';

              if (data.����_����_���?.length) {
                resultHTML += '<div><b>? ���� ���� ���</b><ul>';
                data.����_����_���.forEach((item) => {
                  resultHTML += `<li>${item.����} (${item['SNMP IP']}) �� ���� ����: ${item.oid1}</li>`;
                });
                resultHTML += '</ul></div>';
              }

              if (data.����_���_����ġ_���?.length) {
                resultHTML += '<div><b>?? ������� ����ġ ���</b><ul>';
                data.����_���_����ġ_���.forEach((item) => {
                  resultHTML += `<li>${item.����} (${item['SNMP IP']}) �� oid2: ${item.oid2}, oid3: ${item.oid3}</li>`;
                });
                resultHTML += '</ul></div>';
              }

              if (!resultHTML) {
                resultHTML = '<div>?? ���� ���� �� ������� �̻� ¡�Ĵ� �߰ߵ��� �ʾҽ��ϴ�.</div>';
              }

              botLoading.remove();
              DOMRenderer.addBotMessage(resultHTML);
              summaryItem.classList.add('completed');
            })
            .catch((err) => {
              console.error('MW SNMP ���� ����:', err);
              botLoading.remove();
              DOMRenderer.addErrorMessage(err.message);
              summaryItem.classList.add('error');
            })
            .finally(() => {
              Utils.toggleButtonsDuringFetch(false);
            });
        },

        // ��ȭ ���� �ʱ�ȭ
        clearConversation() {
          StorageService.clearConversation();
        },

        // ���̵�� ��� - ��ġ��/����
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

      // �ʱ�ȭ �� �̺�Ʈ ������ ����
      function initApp() {
        // �� ���� �ʱ�ȭ
        AppState.init();

        // ���� ���丮������ ��ȭ �̷� �ε�
        StorageService.loadConversation();

        // �÷��̽�Ȧ�� ������Ʈ
        DOMRenderer.updatePlaceholder();

        // ���� ��ư ���� �̺�Ʈ ������
        document.querySelectorAll('input[name="queryMode"]').forEach((radio) => {
          radio.addEventListener('change', DOMRenderer.updatePlaceholder);
        });

        // �ʱ� ������ �ε�
        APIService.getRealTimeAlarmList();

        // ����� ��������
        APIService.getKuksaName();

        // ��ư �̺�Ʈ ������
        window.getDrCableInfo = UIController.getDrCableInfo;
        window.getMWInfoFromSNMP = UIController.getMWInfoFromSNMP;

        // �ڵ� ���� Ÿ�̸� ����
        setInterval(() => StorageService.saveConversation(), 60000);

        // ���̵�� �巡�� ����
        setupSidebarDrag();
      }

      // ���̵�� �巡�� ��� ����
      function setupSidebarDrag() {
        const sidebar = document.getElementById('summary-list');
        const dragHandle = document.getElementById('drag-handle');
        const toggleBtn = document.getElementById('toggle-btn');

        // �巡�� �̺�Ʈ ������ ����
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

        // ��� ��ư Ŭ�� �̺�Ʈ
        toggleBtn.addEventListener('click', UIController.toggleSidebar);
      }

      // ������ �ε� �� �� �ʱ�ȭ
      document.addEventListener('DOMContentLoaded', initApp);
    </script>
  </body>
</html>
