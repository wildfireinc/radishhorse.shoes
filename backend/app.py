import os
import time
import random
import logging
import requests
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from config import (
    HCAPTCHA_SECRET_KEY, RATE_LIMIT_ROOMS_PER_MINUTE,
    TURN_SERVER_URL, TURN_USERNAME, TURN_CREDENTIAL,
    CORS_ORIGINS
)

# Disable Flask logging
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

app = Flask(__name__, static_folder='../frontend', static_url_path='')
app.config['SECRET_KEY'] = os.urandom(24)

# CORS
CORS(app, origins=CORS_ORIGINS)

# SocketIO
socketio = SocketIO(app, cors_allowed_origins=CORS_ORIGINS, logger=False, engineio_logger=False)

# Rate limiter
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"]
)

# In-memory room storage
rooms = {}  # {room_id: {'password': str or None, 'users': set, 'created_at': timestamp}}

def generate_room_id():
    """Generate a short random room ID"""
    return ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=8))

def verify_hcaptcha(token):
    """Verify hCaptcha token"""
    if not HCAPTCHA_SECRET_KEY:
        return True  # Skip verification if no secret key configured
    
    try:
        response = requests.post(
            'https://hcaptcha.com/siteverify',
            data={
                'secret': HCAPTCHA_SECRET_KEY,
                'response': token
            },
            timeout=5
        )
        result = response.json()
        return result.get('success', False)
    except:
        return False

@app.route('/')
def index():
    """Serve landing page"""
    return send_from_directory('../frontend', 'index.html')

@app.route('/room/<room_id>')
def room(room_id):
    """Serve room page"""
    return send_from_directory('../frontend', 'room.html')

@app.route('/<path:filename>')
def serve_static(filename):
    """Serve static files (CSS, JS, etc.)"""
    return send_from_directory('../frontend', filename)

@app.route('/api/create-room', methods=['POST'])
@limiter.limit(f"{RATE_LIMIT_ROOMS_PER_MINUTE} per minute")
def create_room():
    """Create a new room with optional password"""
    data = request.get_json() or {}
    
    # Verify CAPTCHA
    captcha_token = data.get('captcha_token')
    if not verify_hcaptcha(captcha_token):
        return jsonify({'error': 'CAPTCHA verification failed'}), 400
    
    # Generate room ID
    room_id = generate_room_id()
    while room_id in rooms:
        room_id = generate_room_id()
    
    # Create room
    password = data.get('password', '').strip() or None
    rooms[room_id] = {
        'password': password,
        'users': set(),
        'created_at': time.time()
    }
    
    return jsonify({
        'room_id': room_id,
        'password_protected': password is not None
    })

@app.route('/api/room/<room_id>/exists', methods=['GET'])
def room_exists(room_id):
    """Check if room exists"""
    exists = room_id in rooms
    return jsonify({
        'exists': exists,
        'password_protected': exists and rooms[room_id]['password'] is not None
    })

@app.route('/api/room/<room_id>/password', methods=['POST'])
def verify_password(room_id):
    """Verify or set password for room"""
    if room_id not in rooms:
        return jsonify({'error': 'Room not found'}), 404
    
    data = request.get_json() or {}
    action = data.get('action')  # 'verify' or 'set'
    password = data.get('password', '').strip()
    
    if action == 'verify':
        room_password = rooms[room_id]['password']
        if room_password is None:
            return jsonify({'valid': True})
        return jsonify({'valid': password == room_password})
    
    elif action == 'set':
        rooms[room_id]['password'] = password or None
        return jsonify({'success': True, 'password_protected': password is not None})
    
    return jsonify({'error': 'Invalid action'}), 400

@app.route('/api/roulette', methods=['GET'])
def roulette():
    """Get a random active room"""
    active_rooms = [rid for rid, room_data in rooms.items() if len(room_data['users']) > 0]
    
    if not active_rooms:
        return jsonify({'error': 'No active rooms available'}), 404
    
    random_room = random.choice(active_rooms)
    return jsonify({'room_id': random_room})

@app.route('/api/turn-config', methods=['GET'])
def turn_config():
    """Get TURN server configuration if available"""
    if TURN_SERVER_URL:
        return jsonify({
            'urls': [TURN_SERVER_URL],
            'username': TURN_USERNAME,
            'credential': TURN_CREDENTIAL
        })
    return jsonify({'urls': []})

@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    emit('connected', {'status': 'ok'})

@socketio.on('join')
def handle_join(data):
    """Handle client joining a room"""
    room_id = data.get('room_id')
    if not room_id or room_id not in rooms:
        emit('error', {'message': 'Room not found'})
        return
    
    # Check password if required
    room_password = rooms[room_id]['password']
    if room_password:
        provided_password = data.get('password', '')
        if provided_password != room_password:
            emit('error', {'message': 'Invalid password'})
            return
    
    join_room(room_id)
    rooms[room_id]['users'].add(request.sid)
    emit('joined', {'room_id': room_id})
    
    # Notify others in room
    emit('user_joined', {'sid': request.sid}, room=room_id, include_self=False)

@socketio.on('leave')
def handle_leave(data):
    """Handle client leaving a room"""
    room_id = data.get('room_id')
    if room_id and room_id in rooms:
        leave_room(room_id)
        rooms[room_id]['users'].discard(request.sid)
        emit('user_left', {'sid': request.sid}, room=room_id, include_self=False)

@socketio.on('offer')
def handle_offer(data):
    """Handle WebRTC offer"""
    room_id = data.get('room_id')
    if room_id and room_id in rooms:
        emit('offer', {
            'offer': data.get('offer'),
            'sid': request.sid
        }, room=room_id, include_self=False)

@socketio.on('answer')
def handle_answer(data):
    """Handle WebRTC answer"""
    room_id = data.get('room_id')
    if room_id and room_id in rooms:
        emit('answer', {
            'answer': data.get('answer'),
            'sid': request.sid
        }, room=room_id, include_self=False)

@socketio.on('ice-candidate')
def handle_ice_candidate(data):
    """Handle ICE candidate"""
    room_id = data.get('room_id')
    if room_id and room_id in rooms:
        emit('ice-candidate', {
            'candidate': data.get('candidate'),
            'sid': request.sid
        }, room=room_id, include_self=False)

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnect"""
    # Remove from all rooms
    for room_id, room_data in rooms.items():
        if request.sid in room_data['users']:
            room_data['users'].discard(request.sid)
            emit('user_left', {'sid': request.sid}, room=room_id, include_self=False)

if __name__ == '__main__':
    from config import HOST, PORT, DEBUG
    socketio.run(app, host=HOST, port=PORT, debug=DEBUG, log_output=False)

