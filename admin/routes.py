from flask import Blueprint

admin_bp = Blueprint('admin', __name__)

@admin_bp.route('/')
def admin_home():
    return '관리자 페이지'