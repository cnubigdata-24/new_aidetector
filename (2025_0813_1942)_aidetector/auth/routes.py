from flask import Blueprint

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/auth/logout')
def logout():
    return '로그아웃 처리됨'