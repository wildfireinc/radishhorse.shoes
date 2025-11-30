import os
from dotenv import load_dotenv

load_dotenv()

# hCaptcha configuration
HCAPTCHA_SECRET_KEY = os.getenv('HCAPTCHA_SECRET_KEY', '')

# Rate limiting
RATE_LIMIT_ROOMS_PER_MINUTE = int(os.getenv('RATE_LIMIT_ROOMS_PER_MINUTE', '5'))

# TURN server configuration (optional)
TURN_SERVER_URL = os.getenv('TURN_SERVER_URL', '')
TURN_USERNAME = os.getenv('TURN_USERNAME', '')
TURN_CREDENTIAL = os.getenv('TURN_CREDENTIAL', '')

# Server configuration
HOST = os.getenv('HOST', '0.0.0.0')
PORT = int(os.getenv('PORT', '5000'))
DEBUG = os.getenv('DEBUG', 'False').lower() == 'true'

# CORS origins
CORS_ORIGINS = os.getenv('CORS_ORIGINS', '*').split(',')

