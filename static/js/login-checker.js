(function($) {
  "use strict"; // Start of use strict

  let token = getToken();
  $(document).ready(function() {
    // console.log(`ready!!`);

    getToken();
    toggleLoginPage();

    function toggleLoginPage() {
        // console.log(`toggleLoginPage called!`);
      if (getToken()) {
        const { name } = JSON.parse(getUserInfo());
        console.log("login user name -->", name);
          $("#login-menu").hide();
          $("#user-menu").show();
          document.getElementById("login-user-name").textContent = name;
      } else {
          $("#login-menu").show();
          $("#user-menu").hide();
      }
    }
  });

  $("#btn-logout").on('click', function() {
    $.ajax({
      url: "/signout",
      beforeSend: function (xhr) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      },
      method: "POST",
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
      error: function (xhr) {
        console.log(`error!!!`);
        //error: function (xhr,status,error) {
        //alert("error xhr:" + xhr + ",status:" + status + ",error:"+error)
      },
      complete: function (xhr) {
          console.log(`complete!!!`);
      },
    });
  });

  function getToken() {
    // console.log(`getToken called`);
    return window.localStorage.getItem("token") || "";
  }

  function getUserInfo() {
    return window.localStorage.getItem("me") || {};
  }

})(jQuery); // End of use strict
