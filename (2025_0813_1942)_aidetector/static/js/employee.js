$(function () {

    // 사원정보 데이터 (샘플 데이터)
    let serverData = [];
    let token = getToken();

    function getToken() {
        return window.localStorage.getItem("token") || "";
    }


    /**
     * 사원 조회
     */
    let employeeTable = $("#employee-table").DataTable({
        select: true,
        columns: [
            { data: "empNo" },
            { data: "empName" },
            { data: "empDeptName" },
            { data: "empTelNo" },
            { data: "empMail" }
        ],
        ajax: {
            url: "/employee/getEmployees",
            type: "POST",
            beforeSend: function (xhr) {
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            },
            dataType: "json",
            data: {},
            dataSrc: function (xhr) {
                const { data } = xhr;
                serverData = data;
                // console.log(serverData);
                return serverData;
            },
            error: function (xhr, error, code) {

                if (code === "Unauthorized" || xhr.status === 401) {
                    alert(`로그인을 먼저 수행하시기 바랍니다.`);
                    // 로그인 페이지로 이동
                    window.location.replace("login");
                    return;
                }
                
                if (xhr.responseJSON.message.match(/ECONNREFUSED/)) {
                    alert(`데이터 베이스 커넥션 확인이 필요합니다.`);
                    return;
                }
            }
        },
    });

    
    /**
     * 사원 수정
     */
    $('#btn-edit-employee').on('click', function() {
        const idx = employeeTable.row('.selected').index();

        if (idx === undefined) {
            alert(`선택을 먼저 하시기 바랍니다.`);
            return;
        }

        $("#editEmployeeModal #empNo").val(serverData[idx].empNo);
        $("#editEmployeeModal #empName").val(serverData[idx].empName);
        $("#editEmployeeModal #empDeptName").val(serverData[idx].empDeptName);
        $("#editEmployeeModal #empTelNo").val(serverData[idx].empTelNo);
        $("#editEmployeeModal #empMail").val(serverData[idx].empMail);

        // 수정 모달 팝업
        $('#editEmployeeModal').modal('toggle');
    });

    $("#edit-employee").on('click', function() {
        const empNo = $("#editEmployeeModal #empNo").val();
        const empName = $("#editEmployeeModal #empName").val();
        const empDeptName = $("#editEmployeeModal #empDeptName").val();
        const empTelNo = $("#editEmployeeModal #empTelNo").val();
        const empMail = $("#editEmployeeModal #empMail").val();

        if (!empNo || !empName || !empDeptName || !empTelNo || !empMail) {
            alert('필수값 누락!');
        }

        $.ajax({
            url: "/employee/updateEmployeeInfo",
            method: "POST",
            beforeSend: function (xhr) {
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            },
            contentType:"application/json",
            data: JSON.stringify({ empNo, empName, empDeptName, empTelNo, empMail }),
            success: function(xhr) {
                // hide modal
                $("#editEmployeeModal").modal('toggle');

                // 사원정보 테이블 리로드 (datatable reload)
                employeeTable.ajax.reload();
            },
            error:function(xhr) {
                console.log(`error!!!`);
                if (code === "Unauthorized" || xhr.status === 401) {
                    alert(`로그인을 먼저 수행하시기 바랍니다.`);
                    // 로그인 페이지로 이동
                    window.location.replace("login");
                    return;
                }
            },
            complete:function(xhr) {
                console.log(`complete!!!`);
            }
        })
    });
    
    
    /**
     * 사원 삭제
     */
    $('#employee-table tbody').on('click', 'tr', function () {
        if ( $(this).hasClass('selected') ) {
            $(this).removeClass('selected');
        } else {
            employeeTable.$('tr.selected').removeClass('selected');
            $(this).addClass('selected');
        }
    });

    $('#btn-delete-employee').on('click', function() {
        const idx = employeeTable.row('.selected').index();
        if (idx === undefined) {
            alert(`선택을 먼저 하시기 바랍니다.`)
            return
        }
        const empNo = serverData[idx].empNo;
        const confirmed = confirm("삭제하시겠습니까?");

        if (!confirmed) {
            return;
        }

        $.ajax({
            url:'/employee/deleteEmployee',
            async:true,
            type:'POST',
            contentType:"application/json",
            data: JSON.stringify({ empNo }),
            // xml, json, script, html
            dataType:'json',
            // 서버 요청 전 호출 되는 함수 return false; 일 경우 요청 중단
            beforeSend: function (xhr) {
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            },
            success:function(xhr) {
                console.log(`success!!!`);

                // 사원정보 테이블 리로드 (datatable reload)
                employeeTable.ajax.reload();
            },
            error:function(xhr) {
                console.log(`error!!!`);
                if (code === "Unauthorized" || xhr.status === 401) {
                    alert(`로그인을 먼저 수행하시기 바랍니다.`);
                    // 로그인 페이지로 이동
                    window.location.replace("login");
                    return;
                }
            },
            complete:function(xhr) {
                console.log(`complete!!!`);
            }
        });
    });


    /**
     * 사원 추가
     */
    $("#add-employee").on('click', function(){
        const empNo = $("#addEmployeeModal #empNo").val();
        const empName = $("#addEmployeeModal #empName").val();
        const empDeptName = $("#addEmployeeModal #empDeptName").val();
        const empTelNo = $("#addEmployeeModal #empTelNo").val();
        const empMail = $("#addEmployeeModal #empMail").val();

        if (!empNo || !empName || !empDeptName || !empTelNo || !empMail) {
            alert('필수값 누락!');
        }

        const input_params = {
            empNo,
            empName,
            empDeptName,
            empTelNo,
            empMail
        }

        $.ajax({
            url: "/employee/addNewEmployee",
            method: "POST",
            beforeSend: function (xhr) {
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            },
            contentType:"application/json",
            data: JSON.stringify(input_params),
            success: function(data) {
                // hide modal
                $("#addEmployeeModal").modal('toggle');

                // 초기화
                $("#addEmployeeModal #empNo").val('');
                $("#addEmployeeModal #empName").val('');
                $("#addEmployeeModal #empDeptName").val('');
                $("#addEmployeeModal #empTelNo").val('');
                $("#addEmployeeModal #empMail").val('');

                // 사원정보 테이블 리로드 (datatable reload)
                employeeTable.ajax.reload();
            },
            error:function(xhr) {
                console.log(`error!!!`);
                if (code === "Unauthorized" || xhr.status === 401) {
                    alert(`로그인을 먼저 수행하시기 바랍니다.`);
                    // 로그인 페이지로 이동
                    window.location.replace("login");
                    return;
                }
            }
        })
    });
});
