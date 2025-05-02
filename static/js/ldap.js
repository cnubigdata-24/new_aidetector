(function ($) {
    "use strict"; // Start of use strict
    let token = getToken();
    let pubkey = initRSA();

    $(document).ready(function () {
        console.log(`ready!!`);
        $("#btn-send-otp").hide();
    });

    /**
     * LDAP 로그인 수행
     */
    $("#btn-send-otp").on('click', function () {
        const username = $("#username").val();
        var plainpw = $("#password").val();
        
        var crypt = new JSEncrypt();
        crypt.setKey(pubkey);

        var password = crypt.encrypt(plainpw);
        $.ajax({
            url: "/isProjectSigninCheck",
            method: "POST",
            contentType: "application/json",
            data: JSON.stringify({ password, username }),
            success: function (xhr) {
              const { returnCode, data } = xhr;
       
              if (data == "true") {
                console.log("data true !!!");
                projectSignin();
              } else {
                console.log("data false !!!");
                signin();
              }
            },
            error: function (xhr, status, error) {
                if (xhr == 'undefined' || xhr == undefined) {
                  alert('서버 이슈가 발생했습니다.');
                } else {
                  alert(xhr.responseJSON.message);
                }
            },
            complete: function (xhr) {
              console.log(`complete!!!`);
            },
          });
    });
    
    function projectSignin() {
        var username = $("#username").val();
        var plainpw = $("#password").val();
         
        var crypt = new JSEncrypt();
        crypt.setKey(pubkey);
         
        var password = crypt.encrypt(plainpw);
        console.log("projectSignin !!!");
         
        $.ajax({
            url: "/projectSignin",
            method: "POST",
            contentType: "application/json",
            data: JSON.stringify({ password, username }),
            success: function (xhr) {
                const { data } = xhr;
                console.log("token -->", data);
         
                const { userInfo } = parseJwt(data);
                console.log("userInfo -->", userInfo);
                if (!data) {
                  console.error(`로그인 시스템의 응답이 없습니다.`);
                  return;
                }
         
                // localStorage에 token 저장
                window.localStorage.setItem("token", data);
                window.localStorage.setItem("me", JSON.stringify(userInfo));
         
                // index 페이지로 이동
                window.location.replace("/");
            },
            error: function (xhr, status, error) {
                if (xhr == 'undefined' || xhr == undefined) {
                  alert('서버 이슈가 발생했습니다.');
                } else {
                  alert(xhr.responseJSON.message);
                }
            },
            complete: function (xhr) {
                console.log(`complete!!!`);
            },
        });
    }
          // OTP 성공 이력 미존재시 로그인 수행
    function signin() {
        // PKCS1
        console.log("signin !!!");
        var username = $("#username").val();
        var plainpw = $("#password").val();
         
        var crypt = new JSEncrypt();
        crypt.setKey(pubkey);
         
        var password = crypt.encrypt(plainpw);
    
        $.ajax({
            url: "/signin",
            method: "POST",
            contentType: "application/json",
            data: JSON.stringify({ username, password }),
            success: function (xhr) {
                const { returnCode, data } = xhr;
                console.log("signin result -->", returnCode, data);

                if (returnCode === "OK") {
                    // Login 버튼 show
                    $("#btn-do-login").show();
                    $("#otp-code-div").show();

                    // OTP 코드 전송 alert 팝업
                    $("#otp-code-sent").show();
                }
            },
            error: function (xhr, status, error) {
                if (xhr == 'undefined' || xhr == undefined) {
                  alert('서버 이슈가 발생했습니다.');
                } else {
                  alert(xhr.responseJSON.message);
                }
            },
            complete: function (xhr) {
                console.log(`complete!!!`);
            },
        });
    }

    /**
     * OTP 번호 인증
     */
    $("#btn-do-login").on('click', function () {
        const otpCode = $("#otp-code-input").val();
        const username = $("#username").val();

        $.ajax({
            url: "/verify",
            method: "POST",
            contentType: "application/json",
            data: JSON.stringify({ otpCode, username }),
            success: function (xhr) {
                const { returnCode, data } = xhr;
                if (!data) {
                    console.error(`로그인 시스템의 응답이 없습니다.`);
                    return;
                }
                if (returnCode === "NG") {
                    // otp code
                    $("#otp-code-div").show();
                } 
                else {
                    console.log("token -->", data);
                    const { userInfo } = parseJwt(data);
                    console.log("userInfo -->", userInfo);
                    
                    // localStorage에 token 저장
                    window.localStorage.setItem("token", data);
                    window.localStorage.setItem("me", JSON.stringify(userInfo));
                    
                    // index 페이지로 이동
                    window.location.replace("/");
                }
            },
            error: function (xhr, status, error) {
                if (xhr == 'undefined' || xhr == undefined) {
                  alert('서버 이슈가 발생했습니다.');
                } else {
                  alert(xhr.responseJSON.message);
                }
            },
            complete: function (xhr) {
                console.log(`complete!!!`);
            },
        });
    });

    
    /**
     * Logout 수행
     */
    $("#btn-logout").on('click', function() {
        $.ajax({
            url: "/signout",
            method: "POST",
            beforeSend: function (xhr) {
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            },
            contentType: "application/json",
            data: {},
            success: function (xhr) {
                const { returnCode, data } = xhr;
                console.log("signout result -->", returnCode, data);
                if (returnCode == "OK") {
                    window.localStorage.removeItem("token");
                    window.localStorage.removeItem("me");
                    window.location.replace("/");
                }
            },
            error: function (xhr, status, error) {
                if (xhr == 'undefined' || xhr == undefined) {
                  alert('서버 이슈가 발생했습니다.');
                } else {
                  alert(xhr.responseJSON.message);
                }
            },
            complete: function (xhr) {
                console.log(`complete!!!`);
            },
        });
    });

    // jwt decode
    function parseJwt(token) {
        var base64Url = token.split('.')[1];
        var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        var jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
    
        return JSON.parse(jsonPayload);
    };
    
    function getToken() {
        //console.log(`getToken called`);
        return window.localStorage.getItem("token") || "";
    }
    
    function initRSA() {
        // public key value 가져오기
        $.ajax({
            url: "/initRSA",
            method: "POST",
            contentType: "application/json",
            data: "",
            success: function (xhr) {
                const { returnCode, data } = xhr;
                console.log("rsa succeeded --> ", data);

                pubkey = data;
                setTimeout(function() {
                    $("#btn-send-otp").show();
                }, 750)
            },
            error: function (xhr, status, error) {
                if (xhr == 'undefined' || xhr == undefined) {
                  alert('서버 이슈가 발생했습니다.');
                } else {
                  alert(xhr.responseJSON.message);
                }
            },
            complete: function (xhr) {
                console.log(`complete!!!`);
            },
        });

    }
    
})(jQuery);
