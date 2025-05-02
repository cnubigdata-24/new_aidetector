from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class AlembicVersion(db.Model):
    __tablename__ = 'alembic_version'

    version_num = db.Column(db.String(32), primary_key=True)

class Employee(db.Model):
    __tablename__ = 'employee'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    emp_no = db.Column(db.String(20), nullable=False, unique=True)
    emp_name = db.Column(db.String(100), nullable=False)
    emp_dept_name = db.Column(db.String(100), nullable=False)
    emp_tel_no = db.Column(db.String(100), nullable=False)
    emp_mail = db.Column(db.String(100), nullable=False)
    created_date = db.Column(db.DateTime, default=db.func.current_timestamp())
    update_date = db.Column(db.DateTime, default=db.func.current_timestamp(), onupdate=db.func.current_timestamp())

class KeyStore(db.Model):
    __tablename__ = 'key_store'

    key_id = db.Column(db.String(50), primary_key=True)
    private_key = db.Column(db.String(100), nullable=False)

class LdapKeystore(db.Model):
    __tablename__ = 'ldap_keystore'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    pub_key = db.Column(db.String(1500), nullable=False)
    priv_key = db.Column(db.String(2000), nullable=False)
    key_timestamp = db.Column(db.BigInteger, default=0)

class Logout(db.Model):
    __tablename__ = 'logout'

    id = db.Column(db.String(50), primary_key=True)  # 아이디
    token = db.Column(db.String(1500), nullable=False)  # 토큰

class TblAlarm(db.Model):
    __tablename__ = 'tbl_alarm'

    alarm_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    alarm_name = db.Column(db.String(100), nullable=False)
    equip_id = db.Column(db.Integer, db.ForeignKey('tbl_equipment.equip_id'), nullable=False)
    alarm_type = db.Column(db.String(100))
    alarm_grade = db.Column(db.String(100))
    is_valid = db.Column(db.String(100))
    alarm_message = db.Column(db.String(100))
    occur_date = db.Column(db.DateTime, nullable=False)
    recover_date = db.Column(db.DateTime)
    delay_minute = db.Column(db.Integer)

    # 관계 설정
    # equipment = db.relationship('TblEquipment', back_populates='alarms')



class TblKuksa(db.Model):
    __tablename__ = 'tbl_kuksa'

    kuksa_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    kuksa_name = db.Column(db.String(100), nullable=False)
    kuksa_type = db.Column(db.String(100))  # DEFAULT NULL이므로 nullable을 False로 설정하지 않음
    operation_depart = db.Column(db.String(100))  # DEFAULT NULL이므로 nullable을 False로 설정하지 않음

    # 관계 설정 (필요할 경우)
    equipments = db.relationship('TblEquipment', back_populates='kuksa')

class TblEquipment(db.Model):
    __tablename__ = 'tbl_equipment'

    equip_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    equip_name = db.Column(db.String(100), nullable=False)
    equip_field = db.Column(db.String(100), nullable=False)
    equip_type = db.Column(db.String(100), nullable=False)
    equip_model = db.Column(db.String(100))  # DEFAULT NULL이므로 nullable을 False로 설정하지 않음
    equip_details = db.Column(db.String(100))  # DEFAULT NULL이므로 nullable을 False로 설정하지 않음
    kuksa_id = db.Column(db.Integer, db.ForeignKey('tbl_kuksa.kuksa_id'), nullable=False)
    operation_depart = db.Column(db.String(100))  # DEFAULT NULL이므로 nullable을 False로 설정하지 않음

    # 관계 설정 (tbl_kuksa와의 관계)
    kuksa = db.relationship('TblKuksa', back_populates='equipments')

class TblAlarmBasisInfo(db.Model):
    __tablename__ = 'tbl_alarm_basis_info'

    sector = db.Column(db.String(20), primary_key=True)
    equip_type = db.Column(db.String(30), primary_key=True)
    alarm_item = db.Column(db.String(50), primary_key=True)
    alarm_type = db.Column(db.String(10), nullable=False)
    network_gubun = db.Column(db.String(20), nullable=False)
    alarm_extract_method = db.Column(db.String(50), nullable=False)
    insert_datetime = db.Column(db.String(20), nullable=False)

class TblExchangeAlarmInfo(db.Model):
    __tablename__ = 'tbl_exchange_alarm_info'

    confirm_yn = db.Column(db.String(5), nullable=False, default='')
    important_yn = db.Column(db.String(3), nullable=False, default='')
    alarm_grade = db.Column(db.String(10), nullable=False, default='')
    alarm_code = db.Column(db.String(20), nullable=False, default='')
    alarm_position = db.Column(db.String(50), nullable=False, default='')
    alarm_appendix_info = db.Column(db.String(300), nullable=False, default='')
    occur_datetime = db.Column(db.String(30), nullable=False, default='')
    recover_datetime = db.Column(db.String(30), nullable=False, default='')
    leased_line_no = db.Column(db.String(20), nullable=False, default='')
    bonbu_name = db.Column(db.String(30), nullable=False, default='')
    jijum_jisa_name = db.Column(db.String(30), nullable=False, default='')
    equip_type = db.Column(db.String(20), nullable=False, default='')
    equip_kind = db.Column(db.String(30), nullable=False, default='')
    equip_id = db.Column(db.String(20), nullable=False, default='')
    equip_name = db.Column(db.String(50), nullable=False, default='')
    local_guksa_name = db.Column(db.String(30), nullable=False, default='')
    opposite_guksa_name = db.Column(db.String(30), nullable=False, default='')
    fault_reason = db.Column(db.String(100), nullable=False, default='')
    fault_type = db.Column(db.String(10), nullable=False, default='')
    recover_person = db.Column(db.String(30), nullable=False, default='')
    confirm_person = db.Column(db.String(30), nullable=False, default='')
    search_person = db.Column(db.String(30), nullable=False, default='')
    repair_person = db.Column(db.String(30), nullable=False, default='')
    action_code_m = db.Column(db.String(300), nullable=False, default='')
    action_code_s = db.Column(db.String(300), nullable=False, default='')
    make_datetime = db.Column(db.String(30), nullable=False, default='')
    fault_action_contents = db.Column(db.String(300), nullable=False, default='')
    insert_datetime = db.Column(db.String(20), nullable=False, default='')
    
    # Choose a suitable primary key
    __table_args__ = (db.PrimaryKeyConstraint('equip_id', 'occur_datetime'),)

class TblExchangeAlarmInfoLast(db.Model):
    __tablename__ = 'tbl_exchange_alarm_info_last'

    confirm_yn = db.Column(db.String(5), nullable=False, default='')
    important_yn = db.Column(db.String(3), nullable=False, default='')
    alarm_grade = db.Column(db.String(10), nullable=False, default='')
    alarm_code = db.Column(db.String(20), nullable=False, default='')
    alarm_position = db.Column(db.String(50), nullable=False, default='')
    alarm_appendix_info = db.Column(db.String(300), nullable=False, default='')
    occur_datetime = db.Column(db.String(30), nullable=False, default='')
    recover_datetime = db.Column(db.String(30), nullable=False, default='')
    leased_line_no = db.Column(db.String(20), nullable=False, default='')
    bonbu_name = db.Column(db.String(30), nullable=False, default='')
    jijum_jisa_name = db.Column(db.String(30), nullable=False, default='')
    equip_type = db.Column(db.String(20), nullable=False, default='')
    equip_kind = db.Column(db.String(30), nullable=False, default='')
    equip_id = db.Column(db.String(20), nullable=False, default='')
    equip_name = db.Column(db.String(50), nullable=False, default='')
    local_guksa_name = db.Column(db.String(30), nullable=False, default='')
    opposite_guksa_name = db.Column(db.String(30), nullable=False, default='')
    fault_reason = db.Column(db.String(100), nullable=False, default='')
    fault_type = db.Column(db.String(10), nullable=False, default='')
    recover_person = db.Column(db.String(30), nullable=False, default='')
    confirm_person = db.Column(db.String(30), nullable=False, default='')
    search_person = db.Column(db.String(30), nullable=False, default='')
    repair_person = db.Column(db.String(30), nullable=False, default='')
    action_code_m = db.Column(db.String(300), nullable=False, default='')
    action_code_s = db.Column(db.String(300), nullable=False, default='')
    make_datetime = db.Column(db.String(30), nullable=False, default='')
    fault_action_contents = db.Column(db.String(300), nullable=False, default='')
    insert_datetime = db.Column(db.String(20), nullable=False, default='')

    # Choose a suitable primary key
    __table_args__ = (db.PrimaryKeyConstraint('equip_id'),)


class TblAlarmAllLast(db.Model):
    __tablename__ = 'tbl_alarm_all_last'

    kuksa_id = db.Column(db.String(20), nullable=False, default='', primary_key=True)
    sector = db.Column(db.String(30), nullable=False, default='', primary_key=True)
    occur_datetime = db.Column(db.String(20), nullable=False, default='', primary_key=True)
    alarm_grade = db.Column(db.String(10), nullable=False, default='')
    alarm_syslog_code = db.Column(db.String(50), nullable=False, default='')
    equip_type = db.Column(db.String(30), nullable=False, default='')
    equip_kind = db.Column(db.String(30), nullable=False, default='')
    equip_id = db.Column(db.String(30), nullable=False, default='', primary_key=True)
    equip_name = db.Column(db.String(100), nullable=False, default='')
    fault_reason = db.Column(db.String(100), nullable=False, default='')
    valid_yn = db.Column(db.String(1), nullable=False, default='')
    alarm_message = db.Column(db.Text, nullable=False, default='')
    insert_datetime = db.Column(db.String(20), nullable=False, default='')

    # 복합 기본 키 설정
    __table_args__ = (
        db.PrimaryKeyConstraint('guksa_id', 'sector', 'alarm_syslog_code', 'equip_id'),
    )

class TblExchangeFacilityAlarmMappingInfo(db.Model):
    __tablename__ = 'tbl_exchange_facility_alarm_mapping_info'

    guksa_name = db.Column(db.String(30), nullable=False, default='')
    bungi_guksa_name = db.Column(db.String(30), nullable=False, default='')
    installed_position_cell = db.Column(db.String(300), nullable=False, default='')
    sisul_basis_code = db.Column(db.String(20), nullable=False, default='')
    equip_model_name = db.Column(db.String(20), nullable=False, default='')
    equip_alias = db.Column(db.String(50), nullable=False, default='')
    ip_address = db.Column(db.String(30), nullable=False, default='')
    dong_name = db.Column(db.String(100), nullable=False, default='')
    house_number_type = db.Column(db.String(30), nullable=False, default='')
    house_number_1 = db.Column(db.String(10), nullable=False, default='')
    house_number_2 = db.Column(db.String(5), nullable=False, default='')
    building_name = db.Column(db.String(300), nullable=False, default='')
    equip_import_date = db.Column(db.String(20), nullable=False, default='')
    pots_equip_name = db.Column(db.String(20), nullable=False, default='')
    alarm_position_1 = db.Column(db.String(100), nullable=False, default='')
    alarm_position_2 = db.Column(db.String(100), nullable=False, default='')
    mgid_card = db.Column(db.String(30), nullable=False, default='')
    mg_name = db.Column(db.String(30), nullable=False, default='')
    insert_datetime = db.Column(db.String(20), nullable=False, default='')

    # Choose a suitable primary key
    __table_args__ = (db.PrimaryKeyConstraint('pots_equip_name', 'mgid_card', 'mg_name'),)

class TblInternetAlarmHistoryInfo(db.Model):
    __tablename__ = 'tbl_internet_alarm_history_info'

    occur_datetime = db.Column(db.String(30), nullable=False, default='')
    alarm_status = db.Column(db.String(10), nullable=False, default='')
    alarm_grade = db.Column(db.String(5), nullable=False, default='')
    guksa_name = db.Column(db.String(100), nullable=False, default='')
    recognize_power_fail_info = db.Column(db.String(100), nullable=False, default='')
    recognize_power_fail_gubun = db.Column(db.String(50), nullable=False, default='')
    equip_name = db.Column(db.String(100), nullable=False, default='')
    business_place_name = db.Column(db.String(300), nullable=False, default='')
    equip_ip = db.Column(db.String(100), nullable=False, default='')
    interface_ip = db.Column(db.String(100), nullable=False, default='')
    interface_grade = db.Column(db.String(10), nullable=False, default='')
    facility_category = db.Column(db.String(30), nullable=False, default='')
    facility_gubun = db.Column(db.String(30), nullable=False, default='')
    alarm_reason = db.Column(db.String(100), nullable=False, default='')
    inet_tie = db.Column(db.String(100), nullable=False, default='')
    first_rn = db.Column(db.String(50), nullable=False, default='')
    customer_rn = db.Column(db.String(50), nullable=False, default='')
    interface_name = db.Column(db.String(100), nullable=False, default='')
    accept_line_name = db.Column(db.String(300), nullable=False, default='')
    customer_count = db.Column(db.Integer, default=0)
    tv_customer_count = db.Column(db.Integer, default=0)
    soip_customer_count = db.Column(db.Integer, default=0)
    equip_model_name = db.Column(db.String(50), nullable=False, default='')
    recognize_datetime_person = db.Column(db.String(100), nullable=False, default='')
    recover_datetime = db.Column(db.String(30), nullable=False, default='')
    fault_reason_large = db.Column(db.String(300), nullable=False, default='')
    fault_reason_middle = db.Column(db.String(300), nullable=False, default='')
    action_item_large = db.Column(db.String(300), nullable=False, default='')
    action_item_middle = db.Column(db.String(300), nullable=False, default='')
    situation_propaganda = db.Column(db.String(100), nullable=False, default='')
    equip_address = db.Column(db.String(300), nullable=False, default='')
    lacp_info = db.Column(db.String(200), nullable=False, default='')
    fault_continue_seconds = db.Column(db.Integer, default=0)
    leased_line_no = db.Column(db.String(100), nullable=False, default='')
    fiber_cable_primary_line_no = db.Column(db.String(100), nullable=False, default='')
    fiber_cable_reserved_line_no = db.Column(db.String(100), nullable=False, default='')
    business_place_type = db.Column(db.String(30), nullable=False, default='')
    action_content = db.Column(db.Text, nullable=False)
    opposite_equip_name = db.Column(db.String(100), nullable=False, default='')
    opposite_equip_ip = db.Column(db.String(100), nullable=False, default='')
    opposite_interface_name = db.Column(db.String(100), nullable=False, default='')
    opposite_interface_ip = db.Column(db.String(100), nullable=False, default='')
    opposite_guksa_name = db.Column(db.String(30), nullable=False, default='')
    physical_speed = db.Column(db.BigInteger, default=0)
    syslog_rule_name = db.Column(db.String(100), nullable=False, default='')
    insert_datetime = db.Column(db.String(30), nullable=False, default='')

    __table_args__ = (db.PrimaryKeyConstraint('occur_datetime', 'equip_ip', 'interface_ip', 'first_rn'),)

class TblInternetAlarmHistoryInfoLast(db.Model):
    __tablename__ = 'tbl_internet_alarm_history_info_last'

    occur_datetime = db.Column(db.String(30), nullable=False, default='')
    alarm_status = db.Column(db.String(10), nullable=False, default='')
    alarm_grade = db.Column(db.String(5), nullable=False, default='')
    guksa_name = db.Column(db.String(100), nullable=False, default='')
    recognize_power_fail_info = db.Column(db.String(100), nullable=False, default='')
    recognize_power_fail_gubun = db.Column(db.String(50), nullable=False, default='')
    equip_name = db.Column(db.String(100), nullable=False, default='')
    business_place_name = db.Column(db.String(300), nullable=False, default='')
    equip_ip = db.Column(db.String(100), nullable=False, default='')
    interface_ip = db.Column(db.String(100), nullable=False, default='')
    interface_grade = db.Column(db.String(10), nullable=False, default='')
    facility_category = db.Column(db.String(30), nullable=False, default='')
    facility_gubun = db.Column(db.String(30), nullable=False, default='')
    alarm_reason = db.Column(db.String(100), nullable=False, default='')
    inet_tie = db.Column(db.String(100), nullable=False, default='')
    first_rn = db.Column(db.String(50), nullable=False, default='')
    customer_rn = db.Column(db.String(50), nullable=False, default='')
    interface_name = db.Column(db.String(100), nullable=False, default='')
    accept_line_name = db.Column(db.String(300), nullable=False, default='')
    customer_count = db.Column(db.Integer, default=0)
    tv_customer_count = db.Column(db.Integer, default=0)
    soip_customer_count = db.Column(db.Integer, default=0)
    equip_model_name = db.Column(db.String(50), nullable=False, default='')
    recognize_datetime_person = db.Column(db.String(100), nullable=False, default='')
    recover_datetime = db.Column(db.String(30), nullable=False, default='')
    fault_reason_large = db.Column(db.String(300), nullable=False, default='')
    fault_reason_middle = db.Column(db.String(300), nullable=False, default='')
    action_item_large = db.Column(db.String(300), nullable=False, default='')
    action_item_middle = db.Column(db.String(300), nullable=False, default='')
    situation_propaganda = db.Column(db.String(100), nullable=False, default='')
    equip_address = db.Column(db.String(300), nullable=False, default='')
    lacp_info = db.Column(db.String(200), nullable=False, default='')
    fault_continue_seconds = db.Column(db.Integer, default=0)
    leased_line_no = db.Column(db.String(100), nullable=False, default='')
    fiber_cable_primary_line_no = db.Column(db.String(100), nullable=False, default='')
    fiber_cable_reserved_line_no = db.Column(db.String(100), nullable=False, default='')
    business_place_type = db.Column(db.String(30), nullable=False, default='')
    action_content = db.Column(db.Text, nullable=False)
    opposite_equip_name = db.Column(db.String(100), nullable=False, default='')
    opposite_equip_ip = db.Column(db.String(100), nullable=False, default='')
    opposite_interface_name = db.Column(db.String(100), nullable=False, default='')
    opposite_interface_ip = db.Column(db.String(100), nullable=False, default='')
    opposite_guksa_name = db.Column(db.String(30), nullable=False, default='')
    physical_speed = db.Column(db.BigInteger, default=0)
    syslog_rule_name = db.Column(db.String(100), nullable=False, default='')
    insert_datetime = db.Column(db.String(30), nullable=False, default='')

    __table_args__ = (db.PrimaryKeyConstraint('equip_ip','interface_ip','first_rn'),)

class TblInternetSyslogInfo(db.Model):
    __tablename__ = 'tbl_internet_syslog_info'

    occur_datetime = db.Column(db.String(20), nullable=False, default='')
    first_collect_datetime = db.Column(db.String(20), nullable=False, default='')
    center_name = db.Column(db.String(30), nullable=False, default='')
    op_team_name = db.Column(db.String(30), nullable=False, default='')
    guksa_name = db.Column(db.String(30), nullable=False, default='')
    equip_model_name = db.Column(db.String(30), nullable=False, default='')
    equip_name = db.Column(db.String(300), nullable=False, default='')
    alarm_status = db.Column(db.String(10), nullable=False, default='')
    alarm_grade = db.Column(db.String(3), nullable=False, default='')
    syslog_level = db.Column(db.String(3), nullable=False, default='')
    facility_gubun = db.Column(db.String(30), nullable=False, default='')
    primary_ip = db.Column(db.String(20), nullable=False, default='')
    bonbu_name = db.Column(db.String(30), nullable=False, default='')
    recognize_datetime = db.Column(db.String(20), nullable=False, default='')
    duplicate_occur_count = db.Column(db.String(10), nullable=False, default='')
    upper_equip_name = db.Column(db.String(300), nullable=False, default='')
    upper_primary_ip = db.Column(db.String(20), nullable=False, default='')
    upper_interface_ip = db.Column(db.String(20), nullable=False, default='')
    log_message = db.Column(db.Text, nullable=False)
    standard_message = db.Column(db.String(100), nullable=False, default='')
    rule_type = db.Column(db.String(100), nullable=False, default='')
    alarm_basis_datetime = db.Column(db.String(20), nullable=False, default='')
    alarm_basis_count = db.Column(db.String(10), nullable=False, default='')
    recover_datetime = db.Column(db.String(20), nullable=False, default='')
    syslog_rule_name = db.Column(db.String(100), nullable=False, default='')
    fault_reason_large = db.Column(db.String(100), nullable=False, default='')
    fault_reason_middle = db.Column(db.String(100), nullable=False, default='')
    action_contents_large = db.Column(db.String(300), nullable=False, default='')
    action_contents_middle = db.Column(db.String(300), nullable=False, default='')
    action_contents = db.Column(db.String(300), nullable=False, default='')
    moss_situation_propaganda_status = db.Column(db.String(30), nullable=False, default='')
    management_port_ip = db.Column(db.String(10), nullable=False, default='')
    interface_name = db.Column(db.String(30), nullable=False, default='')
    interface_description = db.Column(db.String(300), nullable=False, default='')
    work_info = db.Column(db.String(100), nullable=False, default='')
    work_gubun = db.Column(db.String(10), nullable=False, default='')
    customer_count = db.Column(db.String(10), nullable=False, default='')
    tv_customer_count = db.Column(db.String(10), nullable=False, default='')
    insert_datetime = db.Column(db.String(20), nullable=False, default='')

    __table_args__ = (db.PrimaryKeyConstraint('occur_datetime', 'primary_ip', 'interface_name'),)

class TblInternetSyslogInfoLast(db.Model):
    __tablename__ = 'tbl_internet_syslog_info_last'

    occur_datetime = db.Column(db.String(20), nullable=False, default='')
    first_collect_datetime = db.Column(db.String(20), nullable=False, default='')
    center_name = db.Column(db.String(30), nullable=False, default='')
    op_team_name = db.Column(db.String(30), nullable=False, default='')
    guksa_name = db.Column(db.String(30), nullable=False, default='')
    equip_model_name = db.Column(db.String(30), nullable=False, default='')
    equip_name = db.Column(db.String(300), nullable=False, default='')
    alarm_status = db.Column(db.String(10), nullable=False, default='')
    alarm_grade = db.Column(db.String(3), nullable=False, default='')
    syslog_level = db.Column(db.String(3), nullable=False, default='')
    facility_gubun = db.Column(db.String(30), nullable=False, default='')
    primary_ip = db.Column(db.String(20), nullable=False, default='')
    bonbu_name = db.Column(db.String(30), nullable=False, default='')
    recognize_datetime = db.Column(db.String(20), nullable=False, default='')
    duplicate_occur_count = db.Column(db.String(10), nullable=False, default='')
    upper_equip_name = db.Column(db.String(300), nullable=False, default='')
    upper_primary_ip = db.Column(db.String(20), nullable=False, default='')
    upper_interface_ip = db.Column(db.String(20), nullable=False, default='')
    log_message = db.Column(db.Text, nullable=False)
    standard_message = db.Column(db.String(100), nullable=False, default='')
    rule_type = db.Column(db.String(100), nullable=False, default='')
    alarm_basis_datetime = db.Column(db.String(20), nullable=False, default='')
    alarm_basis_count = db.Column(db.String(10), nullable=False, default='')
    recover_datetime = db.Column(db.String(20), nullable=False, default='')
    syslog_rule_name = db.Column(db.String(100), nullable=False, default='')
    fault_reason_large = db.Column(db.String(100), nullable=False, default='')
    fault_reason_middle = db.Column(db.String(100), nullable=False, default='')
    action_contents_large = db.Column(db.String(300), nullable=False, default='')
    action_contents_middle = db.Column(db.String(300), nullable=False, default='')
    action_contents = db.Column(db.String(300), nullable=False, default='')
    moss_situation_propaganda_status = db.Column(db.String(30), nullable=False, default='')
    management_port_ip = db.Column(db.String(10), nullable=False, default='')
    interface_name = db.Column(db.String(30), nullable=False, default='')
    interface_description = db.Column(db.String(300), nullable=False, default='')
    work_info = db.Column(db.String(100), nullable=False, default='')
    work_gubun = db.Column(db.String(10), nullable=False, default='')
    customer_count = db.Column(db.String(10), nullable=False, default='')
    tv_customer_count = db.Column(db.String(10), nullable=False, default='')
    insert_datetime = db.Column(db.String(20), nullable=False, default='')

    __table_args__ = (db.PrimaryKeyConstraint('primary_ip', 'interface_name'),)

class TblInternetSyslogRuleInfo(db.Model):
    __tablename__ = 'tbl_internet_syslog_rule_info'

    service_network = db.Column(db.String(30), nullable=False, default='')
    duplicate_process_condition = db.Column(db.String(20), nullable=False, default='')
    alarm_tab = db.Column(db.String(10), nullable=False, default='')
    manufacturer = db.Column(db.String(30), nullable=False, default='')
    equip_model_name = db.Column(db.String(50), nullable=False, default='')
    rule_name = db.Column(db.String(50), nullable=False, default='')
    alarm_grade = db.Column(db.String(10), nullable=False, default='')
    alarm_setting = db.Column(db.String(10), nullable=False, default='')
    syslog_level = db.Column(db.String(30), nullable=False, default='')
    rule_type = db.Column(db.String(50), nullable=False, default='')
    occur_string_1 = db.Column(db.String(50), nullable=False, default='')
    occur_string_2 = db.Column(db.String(50), nullable=False, default='')
    occur_string_3 = db.Column(db.String(50), nullable=False, default='')
    occur_string_sequence_adapt = db.Column(db.String(5), nullable=False, default='')
    occur_string_connect_condition = db.Column(db.String(10), nullable=False, default='')
    occur_exclude_string_1 = db.Column(db.String(100), nullable=False, default='')
    occur_exclude_string_2 = db.Column(db.String(100), nullable=False, default='')
    occur_exclude_string_3 = db.Column(db.String(100), nullable=False, default='')
    occur_exclude_string_sequence_adapt = db.Column(db.String(5), nullable=False, default='')
    occur_exclude_string_connect_condition = db.Column(db.String(10), nullable=False, default='')
    recover_string_1 = db.Column(db.String(100), nullable=False, default='')
    recover_string_2 = db.Column(db.String(100), nullable=False, default='')
    recover_string_3 = db.Column(db.String(100), nullable=False, default='')
    recover_string_sequence_adapt = db.Column(db.String(5), nullable=False, default='')
    recover_string_connect_condition = db.Column(db.String(5), nullable=False, default='')
    recover_exclude_string_1 = db.Column(db.String(100), nullable=False, default='')
    recover_exclude_string_2 = db.Column(db.String(100), nullable=False, default='')
    recover_exclude_string_3 = db.Column(db.String(100), nullable=False, default='')
    recover_exclude_string_4 = db.Column(db.String(100), nullable=False, default='')
    recover_exclude_string_5 = db.Column(db.String(100), nullable=False, default='')
    recover_exclude_string_sequence_adapt = db.Column(db.String(5), nullable=False, default='')
    recover_exclude_string_connect_condition = db.Column(db.String(10), nullable=False, default='')
    log_explain = db.Column(db.Text, nullable=False)
    action_item = db.Column(db.Text, nullable=False)
    original_message = db.Column(db.Text, nullable=False)
    use_yn = db.Column(db.String(10), nullable=False, default='')
    moss_auto_propaganda = db.Column(db.String(10), nullable=False, default='')
    standard_message = db.Column(db.String(50), nullable=False, default='')
    additional_setting = db.Column(db.String(100), nullable=False, default='')
    setting_time_minute = db.Column(db.String(20), nullable=False, default='')
    setting_count = db.Column(db.String(20), nullable=False, default='')
    background_color = db.Column(db.String(20), nullable=False, default='')
    sound = db.Column(db.String(10), nullable=False, default='')
    sound_setting_yn = db.Column(db.String(10), nullable=False, default='')
    insert_datetime = db.Column(db.String(20), nullable=False, default='')

    __table_args__ = (db.PrimaryKeyConstraint('service_network', 'manufacturer', 'equip_model_name', 
                                               'rule_name', 'occur_string_1', 'occur_string_2', 'occur_string_3'),)


class TblMicrowaveAlarmInfo(db.Model):
    __tablename__ = 'tbl_microwave_alarm_info'

    op_team_name = db.Column(db.String(30), nullable=False)
    gukso_name = db.Column(db.String(30), nullable=False)
    opposite_gukso_name = db.Column(db.String(30), nullable=False)
    equip_type = db.Column(db.String(30), nullable=False)
    equip_type_detail = db.Column(db.String(50), nullable=False)
    line = db.Column(db.String(3), nullable=False)
    path = db.Column(db.String(30), nullable=False)
    neid = db.Column(db.String(50), nullable=False)
    alarm_grade = db.Column(db.String(5), nullable=False)
    alarm_status = db.Column(db.String(10), nullable=False)
    occur_datetime = db.Column(db.String(20), nullable=False)
    disappear_datetime = db.Column(db.String(20), nullable=False)
    continue_time = db.Column(db.String(20), nullable=False)
    occur_position = db.Column(db.String(50), nullable=False)
    alarm_contents = db.Column(db.String(300), nullable=False)
    work_info = db.Column(db.String(30), nullable=False)
    alarm_history_no = db.Column(db.String(20), nullable=False)
    etc = db.Column(db.String(50), nullable=False)
    ne_occur_datetime = db.Column(db.String(20), nullable=False)
    ne_disappear_datetime = db.Column(db.String(20), nullable=False)
    insert_datetime = db.Column(db.String(20), nullable=False)

    __table_args__ = (db.PrimaryKeyConstraint('occur_datetime', 'neid'),)

class TblMicrowaveAlarmInfoLast(db.Model):
    __tablename__ = 'tbl_microwave_alarm_info_last'

    op_team_name = db.Column(db.String(30), nullable=False)
    gukso_name = db.Column(db.String(30), nullable=False)
    opposite_gukso_name = db.Column(db.String(30), nullable=False)
    equip_type = db.Column(db.String(30), nullable=False)
    equip_type_detail = db.Column(db.String(50), nullable=False)
    line = db.Column(db.String(3), nullable=False)
    path = db.Column(db.String(30), nullable=False)
    neid = db.Column(db.String(50), nullable=False)
    alarm_grade = db.Column(db.String(5), nullable=False)
    alarm_status = db.Column(db.String(10), nullable=False)
    occur_datetime = db.Column(db.String(20), nullable=False)
    disappear_datetime = db.Column(db.String(20), nullable=False)
    continue_time = db.Column(db.String(20), nullable=False)
    occur_position = db.Column(db.String(50), nullable=False)
    alarm_contents = db.Column(db.String(300), nullable=False)
    work_info = db.Column(db.String(30), nullable=False)
    alarm_history_no = db.Column(db.String(20), nullable=False)
    etc = db.Column(db.String(50), nullable=False)
    ne_occur_datetime = db.Column(db.String(20), nullable=False)
    ne_disappear_datetime = db.Column(db.String(20), nullable=False)
    insert_datetime = db.Column(db.String(20), nullable=False)

    __table_args__ = (db.PrimaryKeyConstraint('neid'),)

class TblTransmitDrCableAlarmInfo(db.Model):
    __tablename__ = 'tbl_transmit_dr_cable_alarm_info'

    kuksa_id = db.Column(db.String(3), nullable=False, default='')
    selection = db.Column(db.String(1), nullable=False, default='')
    situation_propaganda = db.Column(db.String(10), nullable=False, default='')
    work_yn = db.Column(db.String(10), nullable=False, default='')
    merge_yn = db.Column(db.String(10), nullable=False, default='')
    tt_no = db.Column(db.String(30), nullable=False, default='')
    bonbu_name = db.Column(db.String(30), nullable=False, default='')
    center_name = db.Column(db.String(30), nullable=False, default='')
    buseo_name = db.Column(db.String(30), nullable=False, default='')
    op_team_name_1 = db.Column(db.String(30), nullable=False, default='')
    op_team_name_2 = db.Column(db.String(30), nullable=False, default='')
    guksa_name = db.Column(db.String(30), nullable=False, default='')
    tt_occur_datetime = db.Column(db.String(20), nullable=False, default='')
    alarm_occur_datetime = db.Column(db.String(20), nullable=False, default='')
    alarm_recover_datetime = db.Column(db.String(20), nullable=False, default='')
    continue_time = db.Column(db.String(20), nullable=False, default='')
    effected_facility = db.Column(db.String(300), nullable=False, default='')
    customer_count = db.Column(db.String(10), nullable=False, default='')
    voc_count = db.Column(db.String(10), nullable=False, default='')
    cable_name_core = db.Column(db.String(300), nullable=False, default='')
    fault_sector = db.Column(db.String(300), nullable=False, default='')
    sector_analysis = db.Column(db.String(300), nullable=False, default='')
    status = db.Column(db.String(20), nullable=False, default='')
    fault_grade = db.Column(db.String(10), nullable=False, default='')
    insert_datetime = db.Column(db.String(20), nullable=False, default='')

    __table_args__ = (db.PrimaryKeyConstraint('tt_no'),)

class TblTransmitGuksaInfo(db.Model):
    __tablename__ = 'tbl_transmit_guksa_info'

    center_name = db.Column(db.String(30), nullable=False, default='')
    op_team_name = db.Column(db.String(30), nullable=False, default='')
    guksa_name = db.Column(db.String(30), nullable=False, default='')
    installed_position = db.Column(db.String(30), nullable=False, default='')
    moja_gubun = db.Column(db.String(20), nullable=False, default='')
    area_name = db.Column(db.String(20), nullable=False, default='')
    jibun_address = db.Column(db.String(300), nullable=False, default='')
    road_name_address = db.Column(db.String(300), nullable=False, default='')
    insert_datetime = db.Column(db.String(20), nullable=False, default='')

    __table_args__ = (db.PrimaryKeyConstraint('center_name', 'installed_position'),)

class TblTransmitTnmsAlarmInfo(db.Model):
    __tablename__ = 'tbl_transmit_tnms_alarm_info'

    core_risk = db.Column(db.String(3), nullable=False, default='')
    selection = db.Column(db.String(3), nullable=False, default='')
    seq_no = db.Column(db.String(10), nullable=False, default='')
    process_status = db.Column(db.String(20), nullable=False, default='')
    situation_propaganda = db.Column(db.String(20), nullable=False, default='')
    fault_no = db.Column(db.String(20), nullable=False, default='')
    occur_time = db.Column(db.String(10), nullable=False, default='')
    update_time = db.Column(db.String(10), nullable=False, default='')
    area = db.Column(db.String(30), nullable=False, default='')
    occur_guksa_name = db.Column(db.String(30), nullable=False, default='')
    relate_guksa_name = db.Column(db.String(30), nullable=False, default='')
    system_name = db.Column(db.String(200), nullable=False, default='')
    equip_kind = db.Column(db.String(50), nullable=False, default='')
    accumulate = db.Column(db.String(10), nullable=False, default='')
    current = db.Column(db.String(10), nullable=False, default='')
    effect = db.Column(db.String(10), nullable=False, default='')
    work_info = db.Column(db.String(3), nullable=False, default='')
    line_fault_assume = db.Column(db.String(30), nullable=False, default='')
    fiber_cable_name = db.Column(db.String(30), nullable=False, default='')
    line = db.Column(db.String(20), nullable=False, default='')
    occur_count = db.Column(db.String(10), nullable=False, default='')
    fault_period = db.Column(db.String(10), nullable=False, default='')
    alarm_count = db.Column(db.String(10), nullable=False, default='')
    accumulate_fault_place = db.Column(db.String(300), nullable=False, default='')
    current_fault_place = db.Column(db.String(300), nullable=False, default='')
    use_place = db.Column(db.String(50), nullable=False, default='')
    top_hierachy = db.Column(db.String(30), nullable=False, default='')
    rca_ticket_no = db.Column(db.String(30), nullable=False, default='')
    ai_rca_analyze_result = db.Column(db.String(100), nullable=False, default='')
    ai_ticket_determine_result = db.Column(db.String(30), nullable=False, default='')
    op_person_review_result = db.Column(db.String(50), nullable=False, default='')
    detail_analyze_result = db.Column(db.String(50), nullable=False, default='')
    insert_datetime = db.Column(db.String(20), nullable=False, default='')

    __table_args__ = (db.PrimaryKeyConstraint('fault_no'),)
