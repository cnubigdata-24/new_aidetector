# import os
# from dotenv import load_dotenv
# load_dotenv()

# class Config:
#     SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', 'mysql+pymysql://AIDetector1:AIDetector1@10.217.166.215:40223/ad1')
#     SQLALCHEMY_TRACK_MODIFICATIONS = False
#     SECRET_KEY = os.getenv('SECRET_KEY', 'your-secret-key')


import os
class Config:
    # SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', 'sqlite:///ad1.db')
    SQLALCHEMY_DATABASE_URI = 'mysql+pymysql://root:akfldk@localhost:3306/ad1'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = os.getenv('SECRET_KEY', 'devkey')
