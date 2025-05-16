from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class TblGuksa(db.Model):
    __tablename__ = 'tbl_guksa'

    guksa_t = db.Column(db.String(100), nullable=False)
    guksa_e = db.Column(db.String(100), nullable=False)
    guksa = db.Column(db.String(100), nullable=False)
    guksa_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    is_mokuk = db.Column(db.Integer)


class TblAlarmAllLast(db.Model):
    __tablename__ = 'tbl_alarm_all_last'

    guksa_id = db.Column(db.String(20), nullable=False, primary_key=True)
    sector = db.Column(db.String(30), nullable=False, primary_key=True)
    occur_datetime = db.Column(db.String(20), nullable=False)
    recover_datetime = db.Column(db.String(20), nullable=False)
    alarm_grade = db.Column(db.String(10), nullable=False)
    alarm_syslog_code = db.Column(
        db.String(50), nullable=False, primary_key=True)
    equip_type = db.Column(db.String(30), nullable=False)
    equip_kind = db.Column(db.String(300), nullable=False)
    equip_id = db.Column(db.String(30), nullable=False, primary_key=True)
    equip_name = db.Column(db.String(100), nullable=False)
    fault_reason = db.Column(db.String(100), nullable=False)
    valid_yn = db.Column(db.String(1), nullable=False)
    alarm_message = db.Column(db.Text, nullable=False)
    insert_datetime = db.Column(db.String(20), nullable=False)
    guksa_name = db.Column(db.String(20), nullable=False)


class TblDrCableAlarmInfo(db.Model):
    __tablename__ = 'tbl_dr_cable_alarm_info'

    guksa_id = db.Column(db.String(10), nullable=False)
    selection = db.Column(db.String(10), nullable=False)
    situation_propaganda = db.Column(db.String(10), nullable=False)
    work_yn = db.Column(db.String(10), nullable=False)
    merge_yn = db.Column(db.String(10), nullable=False)
    tt_no = db.Column(db.String(30), nullable=False, primary_key=True)
    bonbu_name = db.Column(db.String(30), nullable=False)
    center_name = db.Column(db.String(30), nullable=False)
    buseo_name = db.Column(db.String(30), nullable=False)
    op_team_name_1 = db.Column(db.String(30), nullable=False)
    op_team_name_2 = db.Column(db.String(30), nullable=False)
    guksa_name = db.Column(db.String(30), nullable=False)
    tt_occur_datetime = db.Column(db.String(20), nullable=False)
    alarm_occur_datetime = db.Column(db.String(20), nullable=False)
    alarm_recover_datetime = db.Column(db.String(20), nullable=False)
    continue_time = db.Column(db.String(20), nullable=False)
    effected_facility = db.Column(db.String(300), nullable=False)
    customer_count = db.Column(db.String(10), nullable=False)
    voc_count = db.Column(db.String(10), nullable=False)
    cable_name_core = db.Column(db.String(300), nullable=False)
    fault_sector = db.Column(db.String(300), nullable=False)
    sector_analysis = db.Column(db.String(300), nullable=False)
    status = db.Column(db.String(20), nullable=False)
    fault_grade = db.Column(db.String(10), nullable=False)
    insert_datetime = db.Column(db.String(20), nullable=False)

    def get_guksa_object(self):
        try:
            numeric_id = int(self.guksa_id.replace("K", ""))
            return TblGuksa.query.filter_by(guksa_id=numeric_id).first()
        except Exception:
            return None

    def to_dict(self):
        return {
            "guksa_id": self.guksa_id,
            "selection": self.selection,
            "situation_propaganda": self.situation_propaganda,
            "work_yn": self.work_yn,
            "merge_yn": self.merge_yn,
            "tt_no": self.tt_no,
            "bonbu_name": self.bonbu_name,
            "center_name": self.center_name,
            "buseo_name": self.buseo_name,
            "op_team_name_1": self.op_team_name_1,
            "op_team_name_2": self.op_team_name_2,
            "guksa_name": self.guksa_name,
            "tt_occur_datetime": self.tt_occur_datetime,
            "alarm_occur_datetime": self.alarm_occur_datetime,
            "alarm_recover_datetime": self.alarm_recover_datetime,
            "continue_time": self.continue_time,
            "effected_facility": self.effected_facility,
            "customer_count": self.customer_count,
            "voc_count": self.voc_count,
            "cable_name_core": self.cable_name_core,
            "fault_sector": self.fault_sector,
            "sector_analysis": self.sector_analysis,
            "status": self.status,
            "fault_grade": self.fault_grade,
            "insert_datetime": self.insert_datetime,
        }


class TblAlarmAll(db.Model):
    __tablename__ = 'tbl_alarm_all'

    guksa_id = db.Column(db.String(20), primary_key=True, nullable=False)
    sector = db.Column(db.String(30), primary_key=True, nullable=False)
    occur_datetime = db.Column(db.String(20), primary_key=True, nullable=False)
    recover_datetime = db.Column(db.String(20), nullable=False)
    alarm_grade = db.Column(db.String(10), nullable=False)
    alarm_syslog_code = db.Column(
        db.String(50), primary_key=True, nullable=False)
    equip_type = db.Column(db.String(30), nullable=False)
    equip_kind = db.Column(db.String(300), nullable=False)
    equip_id = db.Column(db.String(30), primary_key=True, nullable=False)
    equip_name = db.Column(db.String(100), nullable=False)
    fault_reason = db.Column(db.String(100), nullable=False)
    valid_yn = db.Column(db.String(1), nullable=False)
    alarm_message = db.Column(db.Text, nullable=False)
    insert_datetime = db.Column(db.String(20), nullable=False)
    guksa_name = db.Column(db.String(20), nullable=False)


class TblEquipment(db.Model):
    __tablename__ = 'tbl_equipment'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    guksa_id = db.Column(db.Integer, default='')
    sector = db.Column(db.String(10), nullable=False, default='')
    equip_type = db.Column(db.String(50), primary_key=True,
                           nullable=False, default='')
    equip_model = db.Column(db.String(30), nullable=False, default='')
    equip_name = db.Column(db.String(100), nullable=False, default='')
    equip_id = db.Column(db.String(100), nullable=False, default='')


class TblSubLink(db.Model):
    __tablename__ = 'tbl_sub_link'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    equip_id = db.Column(db.String(100), nullable=False)
    equip_type = db.Column(db.String(50), nullable=False)
    equip_name = db.Column(db.String(100), nullable=False)
    equip_field = db.Column(db.String(50), nullable=False)
    guksa_name = db.Column(db.String(50), nullable=False)
    up_down = db.Column(db.String(10), nullable=False)
    link_equip_id = db.Column(db.String(100), nullable=False)

    link_equip_type = db.Column(db.String(50), nullable=False)
    link_equip_name = db.Column(db.String(100), nullable=False)
    link_equip_field = db.Column(db.String(50), nullable=False)
    link_guksa_name = db.Column(db.String(50), nullable=False)
    link_name = db.Column(db.String(200), nullable=False)
    cable_aroot = db.Column(db.String(700), nullable=False)
    cable_broot = db.Column(db.String(700), nullable=False)


class TblLink(db.Model):
    __tablename__ = 'tbl_link'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    link_name = db.Column(db.String(100))
    local_guksa_name = db.Column(db.String(30))
    remote_guksa_name = db.Column(db.String(30))
    local_equip_id = db.Column(db.String(300))
    remote_equip_id = db.Column(db.String(100), nullable=False)
    updown_type = db.Column(db.String(100), nullable=False)
    link_type = db.Column(db.String(100), nullable=False)


class TblSnmpInfo(db.Model):
    __tablename__ = 'tbl_snmp_info'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    guksa_id = db.Column(db.Integer, db.ForeignKey(
        'tbl_guksa.guksa_id'), nullable=False)

    equip_id = db.Column(db.Integer, db.ForeignKey(
        'tbl_equipment.id'), nullable=False)

    equip_name = db.Column(db.String(100))
    equip_type = db.Column(db.String(100))
    snmp_ip = db.Column(db.String(50))
    community = db.Column(db.String(50))
    port = db.Column(db.Integer)
    oid1 = db.Column(db.String(50))
    oid2 = db.Column(db.String(50))
    oid3 = db.Column(db.String(50))
    result_code = db.Column(db.String(10))
    result_msg = db.Column(db.String(500))
    power = db.Column(db.String(10))
    fading = db.Column(db.String(10))
    get_datetime = db.Column(db.String(50))

    guksa = db.relationship('TblGuksa', backref='snmp_info', lazy=True)

    equipment = db.relationship('TblEquipment', backref='snmp_info', lazy=True)


class TblEffectedLineInfo(db.Model):
    __tablename__ = 'tbl_effected_line_info'

    mgm_guksa_name = db.Column(
        db.String(30), nullable=False, primary_key=True, index=True)
    guksa_gubun = db.Column(db.String(20), nullable=False, index=True)
    guksa_name = db.Column(db.String(30), nullable=False, primary_key=True)
    facility_count = db.Column(db.Integer, nullable=False)
    customer_count = db.Column(db.Integer, nullable=False)
    service_count = db.Column(db.Integer, nullable=False)
    facility_count_sum = db.Column(db.Integer, nullable=False)
    ip_access_customer_network_count = db.Column(db.Integer, nullable=False)
    ip_access_count = db.Column(db.Integer, nullable=False)
    ip_access_metro_customer_network_count = db.Column(
        db.Integer, nullable=False)
    ip_core_kornet_count = db.Column(db.Integer, nullable=False)
    ip_core_metro_ethernet_count = db.Column(db.Integer, nullable=False)
    ip_core_premium_count = db.Column(db.Integer, nullable=False)
    ip_core_vpn_count = db.Column(db.Integer, nullable=False)
    transmit_customer_count = db.Column(db.Integer, nullable=False)
    transmit_local_count = db.Column(db.Integer, nullable=False)
    transmit_outside_count = db.Column(db.Integer, nullable=False)
    exchange_network_count = db.Column(db.Integer, nullable=False)
    exchange_network_bcn_count = db.Column(db.Integer, nullable=False)
    wireless_network_count = db.Column(db.Integer, nullable=False)
    etc_count = db.Column(db.Integer, nullable=False)
    customer_count_sum = db.Column(db.Integer, nullable=False)
    customer_type_private_count = db.Column(db.Integer, nullable=False)
    customer_type_provider_count = db.Column(db.Integer, nullable=False)
    customer_type_group_count = db.Column(db.Integer, nullable=False)
    customer_type_gov_office_count = db.Column(db.Integer, nullable=False)
    customer_type_kt_count = db.Column(db.Integer, nullable=False)
    customer_type_etc_count = db.Column(db.Integer, nullable=False)
    mgm_type_am_count = db.Column(db.Integer, nullable=False)
    mgm_type_core_count = db.Column(db.Integer, nullable=False)
    mgm_type_small_provider_count = db.Column(db.Integer, nullable=False)
    service_count_sum = db.Column(db.Integer, nullable=False)
    line_small_sum = db.Column(db.Integer, nullable=False)
    line_internet_count = db.Column(db.Integer, nullable=False)
    line_leased_line_count = db.Column(db.Integer, nullable=False)
    line_general_phone_count = db.Column(db.Integer, nullable=False)
    service_small_sum = db.Column(db.Integer, nullable=False)
    service_kornet_count = db.Column(db.Integer, nullable=False)
    service_vpn_count = db.Column(db.Integer, nullable=False)
    service_video_secure_count = db.Column(db.Integer, nullable=False)
    service_gov_info_comm_network_count = db.Column(db.Integer, nullable=False)
    service_tv_count = db.Column(db.Integer, nullable=False)
    service_internet_phone_count = db.Column(db.Integer, nullable=False)
    insert_datetime = db.Column(
        db.String(20), nullable=False, primary_key=True, index=True)


class TblEffectedLineInfoLast(db.Model):
    __tablename__ = 'tbl_effected_line_info_last'

    mgm_guksa_name = db.Column(
        db.String(30), nullable=False, primary_key=True, index=True)
    guksa_gubun = db.Column(db.String(20), nullable=False, index=True)
    guksa_name = db.Column(db.String(30), nullable=False, primary_key=True)
    facility_count = db.Column(db.Integer, nullable=False)
    customer_count = db.Column(db.Integer, nullable=False)
    service_count = db.Column(db.Integer, nullable=False)
    facility_count_sum = db.Column(db.Integer, nullable=False)
    ip_access_customer_network_count = db.Column(db.Integer, nullable=False)
    ip_access_count = db.Column(db.Integer, nullable=False)
    ip_access_metro_customer_network_count = db.Column(
        db.Integer, nullable=False)
    ip_core_kornet_count = db.Column(db.Integer, nullable=False)
    ip_core_metro_ethernet_count = db.Column(db.Integer, nullable=False)
    ip_core_premium_count = db.Column(db.Integer, nullable=False)
    ip_core_vpn_count = db.Column(db.Integer, nullable=False)
    transmit_customer_count = db.Column(db.Integer, nullable=False)
    transmit_local_count = db.Column(db.Integer, nullable=False)
    transmit_outside_count = db.Column(db.Integer, nullable=False)
    exchange_network_count = db.Column(db.Integer, nullable=False)
    exchange_network_bcn_count = db.Column(db.Integer, nullable=False)
    wireless_network_count = db.Column(db.Integer, nullable=False)
    etc_count = db.Column(db.Integer, nullable=False)
    customer_count_sum = db.Column(db.Integer, nullable=False)
    customer_type_private_count = db.Column(db.Integer, nullable=False)
    customer_type_provider_count = db.Column(db.Integer, nullable=False)
    customer_type_group_count = db.Column(db.Integer, nullable=False)
    customer_type_gov_office_count = db.Column(db.Integer, nullable=False)
    customer_type_kt_count = db.Column(db.Integer, nullable=False)
    customer_type_etc_count = db.Column(db.Integer, nullable=False)
    mgm_type_am_count = db.Column(db.Integer, nullable=False)
    mgm_type_core_count = db.Column(db.Integer, nullable=False)
    mgm_type_small_provider_count = db.Column(db.Integer, nullable=False)
    service_count_sum = db.Column(db.Integer, nullable=False)
    line_small_sum = db.Column(db.Integer, nullable=False)
    line_leased_line_count = db.Column(db.Integer, nullable=False)
    line_internet_count = db.Column(db.Integer, nullable=False)
    line_general_phone_count = db.Column(db.Integer, nullable=False)
    service_small_sum = db.Column(db.Integer, nullable=False)
    service_kornet_count = db.Column(db.Integer, nullable=False)
    service_vpn_count = db.Column(db.Integer, nullable=False)
    service_video_secure_count = db.Column(db.Integer, nullable=False)
    service_gov_info_comm_network_count = db.Column(db.Integer, nullable=False)
    service_tv_count = db.Column(db.Integer, nullable=False)
    service_internet_phone_count = db.Column(db.Integer, nullable=False)
    insert_datetime = db.Column(db.String(20), nullable=False, index=True)


class TblAlarmBasisInfo(db.Model):
    __tablename__ = 'tbl_alarm_basis_info'

    sector = db.Column(db.String(20), primary_key=True, nullable=False)
    equip_type = db.Column(db.String(30), primary_key=True, nullable=False)
    alarm_item = db.Column(db.String(50), primary_key=True, nullable=False)
    alarm_type = db.Column(db.String(10), nullable=False)
    network_gubun = db.Column(db.String(20), nullable=False)
    alarm_extract_method = db.Column(db.String(50), nullable=False)
    insert_datetime = db.Column(db.String(20), nullable=False)


class TblMossLast(db.Model):
    __tablename__ = 'tbl_moss_last'

    merge_yn = db.Column(db.String(10), nullable=False)
    seq = db.Column(db.Integer, primary_key=True, nullable=False)
    gubun = db.Column(db.String(10), nullable=False)
    status = db.Column(db.String(30), nullable=False)
    occur_datetime = db.Column(db.String(20), nullable=False)
    sector = db.Column(db.Text, nullable=False)
    area = db.Column(db.String(300), nullable=False)
    title = db.Column(db.String(300), nullable=False)
    new_comment_count = db.Column(db.Integer, nullable=False)
    going_out_count = db.Column(db.Integer, nullable=False)
    going_out_person = db.Column(db.String(100), nullable=False)
    arrive_count = db.Column(db.Integer, nullable=False)
    drafter = db.Column(db.String(30), nullable=False)
    tt_no = db.Column(db.String(20), nullable=False)
    tt_seq_no = db.Column(db.String(20), nullable=False)
    inet_tie = db.Column(db.String(30), nullable=False)
    fault_occur_datetime = db.Column(db.String(20), nullable=False)
    equip_position_info = db.Column(db.String(300), nullable=False)
    equip_address = db.Column(db.String(300), nullable=False)
    start_ip = db.Column(db.String(20), nullable=False)
    original_message_subnet_mask = db.Column(db.Text, nullable=False)
    mac_id = db.Column(db.String(50), nullable=False)
    business_place_name = db.Column(db.String(300), nullable=False)
    fault_equip_name = db.Column(db.String(300), nullable=False)
    situation_propaganda_gubun = db.Column(db.String(30), nullable=False)
    situation_propaganda_reason = db.Column(db.String(300), nullable=False)
    insert_datetime = db.Column(db.String(20), nullable=False)
