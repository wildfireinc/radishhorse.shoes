# radishhorse.shoes

Retro neon-themed WebRTC video chat with pure P2P connections and vaporwave aesthetics.

## Features

- Instant camera access on page load
- Shareable room URLs
- Optional password protection
- Roulette button for random room matching
- Pure WebRTC P2P (no media relay)
- Retro neon vaporwave UI
- Zero tracking, zero logs, zero analytics

## Setup

### Backend

1. Install dependencies:
```bash
cd backend
pip install -r requirements.txt
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Configure environment variables:
- `HCAPTCHA_SECRET_KEY` - Your hCaptcha secret key (get from https://www.hcaptcha.com/)
- `RATE_LIMIT_ROOMS_PER_MINUTE` - Rate limit for room creation (default: 5)
- `TURN_SERVER_URL` - Optional TURN server URL
- `TURN_USERNAME` - Optional TURN server username
- `TURN_CREDENTIAL` - Optional TURN server credential
- `HOST` - Server host (default: 0.0.0.0)
- `PORT` - Server port (default: 5000)
- `CORS_ORIGINS` - Comma-separated list of allowed origins (default: *)

4. Run the server:
```bash
python app.py
```

### Frontend

1. Update hCaptcha site key in `frontend/index.html`:
   - Replace `YOUR_HCAPTCHA_SITE_KEY` with your actual site key

2. Update creator handle in HTML files:
   - Replace `@yourhandle` with your actual handle

3. Serve the frontend:
   - The Flask server serves static files from the `frontend` directory
   - Or use any static file server pointing to the `frontend` directory

## Usage

1. Visit the landing page
2. Camera will activate automatically
3. Create a room (with optional password)
4. Share the room URL
5. Use "see what happens" for roulette matching
6. Use "go fuck yourself" for chaotic disconnection

## Architecture

- **Backend**: Flask with Flask-SocketIO for WebRTC signaling
- **Frontend**: Vanilla HTML/CSS/JS with retro neon styling
- **WebRTC**: Pure P2P connections, server only handles signaling
- **Storage**: In-memory room storage (clears on restart)

## Protection

- hCaptcha on room creation
- Rate limiting on room creation endpoints
- No logs, no tracking, no analytics
- Optional TURN server for NAT traversal

## License

Pure chaos.

