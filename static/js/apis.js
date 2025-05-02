$(function () {
    // token 확인
    let token = getToken();

    function getToken() {
        // console.log(`getToken called`);
        return window.localStorage.getItem("token") || "";
    }

    /*
     * SMS 전송
     */
    $("#send-sms").on('click', function(){
        let namespace = "";
        // DEV, PRD (try)
        // 로컬 환경 (catch)
        try {
            namespace = process.env.POD_NAMESPACE;
        } catch {
            namespace = "appdu-demo6";
        }

        const message = $("#sendSmsModal #message").val();
        const telNo = $("#sendSmsModal #telNo").val();
        const subject = $("#sendSmsModal #subject").val();
        const username = $("#sendSmsModal #username").val();
        const password = $("#sendSmsModal #password").val();
        
        let enc_basic_token = "";
        // username과 password 정의 => enc_basic_token 생성
        if (typeof username !== "undefined" && typeof password !== "undefined" ) {
            // 사번, 비밀번호를 받아서 base64로 인코딩
            enc_basic_token = btoa(username + ":" + password);
        } else {}
        
        // 정의되지 않은 변수는 typeof === "undefined"로 검증
        if (typeof namespace === "undefined" || typeof subject === "undefined" || typeof message === "undefined" || typeof telNo === "undefined" || enc_basic_token === "") {
            alert('정의되지 않은 값들이 있습니다.');
        } else if (!message || !telNo || !subject || !username || !password) {
            alert('입력되지 않은 값들이 있습니다.');
        } else {

            const input_params = {
                namespace,
                subject,
                message,
                telNo,
                enc_basic_token
            }

            $.ajax({
                url: "/apis/sendSms",
                method: "POST",
                contentType:"application/json",
                data: JSON.stringify(input_params),
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                },    
                success: function(data) {
                    if (data.returnCode === "NG") {
                        alert(data.message);
                    } else {
                        console.log(data);
                        alert(`SMS 전송을 완료했습니다.`);
                        // hide modal
                        $("#sendSmsModal").modal('toggle');
                    }
                },
                error: function(xhr, error, code) {
                    console.log(`error!!!`);
                    if (code === "Unauthorized" || xhr.status === 401) {
                        alert(`로그인을 먼저 수행하시기 바랍니다.`);
                        // index 페이지로 이동
                        window.location.replace("login");
                        return;
                    }
                },
            })
        }
    });


    /*
     * MMS 전송
     */
    $("#send-mms").on('click', function(){
        let namespace = "";
        // DEV, PRD (try)
        // 로컬 환경 (catch)
        try {
            namespace = process.env.POD_NAMESPACE;
        } catch {
            namespace = "appdu-demo6";
        }

        const message = $("#sendMmsModal #message").val();
        const telNo = $("#sendMmsModal #telNo").val();
        const subject = $("#sendMmsModal #subject").val();
        const username = $("#sendMmsModal #username").val();
        const password = $("#sendMmsModal #password").val();

        let enc_basic_token = "";
        // username과 password 정의 => enc_basic_token 생성
        if (typeof username !== "undefined" && typeof password !== "undefined" ) {
            // 사번, 비밀번호를 받아서 base64로 인코딩
            enc_basic_token = btoa(username + ":" + password); 
        } else {}
            
        // 정의되지 않은 변수는 typeof === "undefined"로 검증
        if (typeof namespace === "undefined" || typeof subject === "undefined" || typeof message === "undefined" || typeof telNo === "undefined" || enc_basic_token === "") {
            alert('정의되지 않은 값들이 있습니다.');
        } else if (!message || !telNo || !subject || !username || !password) {
            alert('입력되지 않은 값들이 있습니다.');
        } else {

            const input_params = {
                namespace,
                subject,
                message,
                telNo,
                enc_basic_token
            }

            $.ajax({
                url: "/apis/sendMms",
                method: "POST",
                contentType:"application/json",
                data: JSON.stringify(input_params),
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                },
                success: function(data) {
                    if (data.returnCode === "NG") {
                        alert(data.message);
                    } else {
                        alert(`MMS 전송을 완료했습니다.`);
                        // hide modal
                        $("#sendMmsModal").modal('toggle');
                    }
                },
                error: function(xhr, error, code) {
                    console.log(`error!!!`);
                    if (code === "Unauthorized" || xhr.status === 401) {
                        alert(`로그인을 먼저 수행하시기 바랍니다.`);
                        // index 페이지로 이동
                        window.location.replace("login");
                        return;
                    }
                },
            })
        }
    });


    /*
     * Email 전송
     */
    $("#send-email").on('click', function(){
        let namespace = "";
        // DEV, PRD (try)
        // 로컬 환경 (catch)
        try {
            namespace = process.env.POD_NAMESPACE;
        } catch {
            namespace = "appdu-demo6";
        }

        const contents = $("#sendEmailModal #contents").val();
        let toEmails = $("#sendEmailModal #toEmails").val();

        toEmails = toEmails.split(",").map(function(item) {
            return item.trim();
        })

        const subject = $("#sendEmailModal #subject").val();
        const username = $("#sendEmailModal #username").val();
        const password = $("#sendEmailModal #password").val();

        let enc_basic_token = "";
        // username과 password 정의 => enc_basic_token 생성
        if (typeof username !== "undefined" && typeof password !== "undefined" ) {
            // 사번, 비밀번호를 받아서 base64로 인코딩
            enc_basic_token = btoa(username + ":" + password); 
        } else {}
        
        
        // 정의되지 않은 변수는 typeof === "undefined"로 검증
        if (typeof namespace === "undefined" || typeof subject === "undefined" || typeof contents === "undefined" || typeof toEmails === "undefined" || enc_basic_token === "") {
            alert('필수 입력 값이 누락되었습니다!');
        } else if (!contents || !toEmails || !subject || !username || !password) {
            alert('입력되지 않은 값들이 있습니다.');
        } else {

            const input_params = {
                namespace,
                subject,
                contents,
                toEmails,
                enc_basic_token
            }

            $.ajax({
                url: "/apis/sendEmail",
                method: "POST",
                contentType:"application/json",
                data: JSON.stringify(input_params),
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                },
                success: function(data) {
                    if (data.returnCode === "NG") {
                        alert(data.message);
                    } else {
                        alert(`Email 전송을 완료했습니다.`);
                        // hide modal
                        $("#sendEmailModal").modal('toggle');
                    }
                },
                error: function(xhr, error, code) {
                    console.log(`error!!!`);
                    if (code === "Unauthorized" || xhr.status === 401) {
                        alert(`로그인을 먼저 수행하시기 바랍니다.`);
                        // index 페이지로 이동
                        window.location.replace("login");
                        return;
                    }
                },
            })
        }
    });
})