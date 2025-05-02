from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class TblGuksa(db.Model):
    __tablename__ = 'tbl_guksa'

    guksa_t = db.Column(db.String(100), nullable=False)
    guksa_e = db.Column(db.String(100), nullable=False)
    guksa = db.Column(db.String(100), nullable=False)
    guksa_id = db.Column(db.Integer, primary_key=True, autoincrement=True)

class TblAlarmAllLast(db.Model):
    __tablename__ = 'tbl_alarm_all_last'

    guksa_id = db.Column(db.String(20), nullable=False, default='', primary_key=True)
    sector = db.Column(db.String(30), nullable=False, default='', primary_key=True)
    guksa_name = db.Column(db.String(20), nullable=False, default='')

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

class TblDrCableAlarmInfo(db.Model):
    __tablename__ = 'tbl_dr_cable_alarm_info'

    guksa_id = db.Column(db.String(3), nullable=False, default='')
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


    def get_guksa_object(self):
        try:
            numeric_id = int(self.guksa_id.replace("K", ""))
            return Guksa.query.filter_by(guksa_id=numeric_id).first()
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

    guksa_id = db.Column(db.String(20), primary_key=True, nullable=False, default='')
    sector = db.Column(db.String(30), primary_key=True, nullable=False, default='')
    occur_datetime = db.Column(db.String(20), primary_key=True, nullable=False, default='')
    alarm_grade = db.Column(db.String(10), nullable=False, default='')
    alarm_syslog_code = db.Column(db.String(50), primary_key=True, nullable=False, default='')
    equip_type = db.Column(db.String(30), nullable=False, default='')
    equip_kind = db.Column(db.String(30), nullable=False, default='')
    equip_id = db.Column(db.String(30), primary_key=True, nullable=False, default='')
    equip_name = db.Column(db.String(100), nullable=False, default='')
    fault_reason = db.Column(db.String(100), nullable=False, default='')
    valid_yn = db.Column(db.String(1), nullable=False, default='')
    alarm_message = db.Column(db.Text, nullable=False, default='')
    insert_datetime = db.Column(db.String(20), nullable=False, default='')

class TblEquipment(db.Model):
    __tablename__ = 'tbl_equipment'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    guksa = db.Column(db.String(20), default='')
    island_name = db.Column(db.String(30), default='')
    guksa_name = db.Column(db.String(20), default='')
    sector = db.Column(db.String(10), nullable=False, default='')
    equipment_type = db.Column(db.String(50), primary_key=True, nullable=False, default='')
    equipment_model = db.Column(db.String(30), nullable=False, default='')
    equipment_name = db.Column(db.String(30), nullable=False, default='')


class TblSubLink(db.Model):
    __tablename__ = 'tbl_sub_link'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    sub_link_name = db.Column(db.String(100), default='')
    local_guksa_name = db.Column(db.String(30), default='')
    local_equip_id = db.Column(db.String(300), default='')
    remote_equip_id = db.Column(db.String(100), nullable=False, default='')
 

class TblLink(db.Model):
    __tablename__ = 'tbl_link'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    link_name = db.Column(db.String(100), default='')
    local_guksa_name = db.Column(db.String(30),  default='')
    remote_guksa_name = db.Column(db.String(30), default='')
    local_equip_id = db.Column(db.String(300), default='')
    remote_equip_id = db.Column(db.String(100), nullable=False, default='')
    updown_type = db.Column(db.String(100), nullable=False, default='')
    link_type = db.Column(db.String(100), nullable=False, default='')



class TblSnmpInfo(db.Model):
    __tablename__ = 'tbl_snmp_info'  # 테이블 이름 설정

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    guksa_id = db.Column(db.Integer, db.ForeignKey('tbl_guksa.guksa_id'), nullable=False)  # 외래 키
    equip_id = db.Column(db.Integer, db.ForeignKey('tbl_equipment.id'), nullable=False)  # 외래 키
    equip_name = db.Column(db.String(100), default='')
    equip_type = db.Column(db.String(100), default='')
    snmp_ip = db.Column(db.String(50), default='')
    community = db.Column(db.String(50), default='')
    port = db.Column(db.Integer, default=None)  # NULL 허용
    oid1 = db.Column(db.String(50), default='')
    oid2 = db.Column(db.String(50), default='')
    oid3 = db.Column(db.String(50), default='')
    result_code = db.Column(db.String(10), default='')
    result_msg = db.Column(db.String(500), default='')
    power = db.Column(db.String(10), default='')
    fading = db.Column(db.String(10), default='')
    get_datetime = db.Column(db.String(50), default='')

    # 관계 설정
    guksa = db.relationship('TblGuksa', backref='snmp_info', lazy=True)
    equipment = db.relationship('TblEquipment', backref='snmp_info', lazy=True)



class TBL_EFFECTED_LINE_INFO(db.Model):
    __tablename__ = 'TBL_EFFECTED_LINE_INFO'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    mgm_guksa_name = db.Column(db.String(30), nullable=False, default='', index=True)  # COLLATE 'utf8_bin'
    guksa_gubun = db.Column(db.String(20), nullable=False, default='', index=True)  # COLLATE 'utf8_bin'
    guksa_name = db.Column(db.String(30), nullable=False, default='', primary_key=True)  # COLLATE 'utf8_bin'
    facility_count = db.Column(db.Integer, nullable=False, default=0)
    customer_count = db.Column(db.Integer, nullable=False, default=0)
    service_count = db.Column(db.Integer, nullable=False, default=0)
    facility_count_sum = db.Column(db.Integer, nullable=False, default=0)
    ip_access_customer_network_count = db.Column(db.Integer, nullable=False, default=0)
    ip_access_count = db.Column(db.Integer, nullable=False, default=0)
    ip_access_metro_customer_network_count = db.Column(db.Integer, nullable=False, default=0)
    ip_core_kornet_count = db.Column(db.Integer, nullable=False, default=0)
    ip_core_metro_ethernet_count = db.Column(db.Integer, nullable=False, default=0)
    ip_core_premium_count = db.Column(db.Integer, nullable=False, default=0)
    ip_core_vpn_count = db.Column(db.Integer, nullable=False, default=0)
    transmit_customer_count = db.Column(db.Integer, nullable=False, default=0)
    transmit_local_count = db.Column(db.Integer, nullable=False, default=0)
    transmit_outside_count = db.Column(db.Integer, nullable=False, default=0)
    exchange_network_count = db.Column(db.Integer, nullable=False, default=0)
    exchange_network_bcn_count = db.Column(db.Integer, nullable=False, default=0)
    wireless_network_count = db.Column(db.Integer, nullable=False, default=0)
    etc_count = db.Column(db.Integer, nullable=False, default=0)
    customer_count_sum = db.Column(db.Integer, nullable=False, default=0)
    customer_type_private_count = db.Column(db.Integer, nullable=False, default=0)
    customer_type_provider_count = db.Column(db.Integer, nullable=False, default=0)
    customer_type_group_count = db.Column(db.Integer, nullable=False, default=0)
    customer_type_gov_office_count = db.Column(db.Integer, nullable=False, default=0)
    customer_type_kt_count = db.Column(db.Integer, nullable=False, default=0)
    customer_type_etc_count = db.Column(db.Integer, nullable=False, default=0)
    mgm_type_am_count = db.Column(db.Integer, nullable=False, default=0)
    mgm_type_core_count = db.Column(db.Integer, nullable=False, default=0)
    mgm_type_small_provider_count = db.Column(db.Integer, nullable=False, default=0)
    service_count_sum = db.Column(db.Integer, nullable=False, default=0)
    line_small_sum = db.Column(db.Integer, nullable=False, default=0)
    line_leased_line_count = db.Column(db.Integer, nullable=False, default=0)
    line_internet_count = db.Column(db.Integer, nullable=False, default=0)
    line_general_phone_count = db.Column(db.Integer, nullable=False, default=0)
    service_small_sum = db.Column(db.Integer, nullable=False, default=0)
    service_kornet_count = db.Column(db.Integer, nullable=False, default=0)
    service_vpn_count = db.Column(db.Integer, nullable=False, default=0)
    service_video_secure_count = db.Column(db.Integer, nullable=False, default=0)
    service_gov_info_comm_network_count = db.Column(db.Integer, nullable=False, default=0)
    service_tv_count = db.Column(db.Integer, nullable=False, default=0)
    service_internet_phone_count = db.Column(db.Integer, nullable=False, default=0)
    insert_datetime = db.Column(db.String(20), nullable=False, default='', index=True)  # COLLATE 'utf8_bin'
