# Radishhorse.shoes Algorithm

## Frontend Flow

### Landing Page (`index.html`)
1. Turnstile gate → verify → show main content
2. Main page shows:
   - Logo (clickable to home)
   - Local video preview (user's camera)
   - "meet a stranger" button (roulette - finds random room)
   - "go fuck yourself" button (chaos button)
   - Password input field (optional)
   - "create room" button → redirects to `/{roomId}`
   - "chat only" toggle (hides camera if enabled)
3. Camera auto-starts on page load (unless chat only)
4. Create room → stores creator token → redirects to `/{roomId}`
5. Meet stranger → redirects to random `/{roomId}`

### Room Page (`room.html`)
**One unified page for creator and guest:**

- **Creator** (has token in sessionStorage):
  - Immediately sees: link + copy + chat
  - Joins room automatically

- **Guest**:
  - If password protected → show password field
  - After joining → show link + copy + chat
  - If no password → join immediately, show link + copy + chat

**Both see same UI after joining:**
- Video grid (remote peers)
- Room link + copy button
- Chat input + messages
- Controls (roulette, chaos)

## Backend API

- `POST /api/create-room` → `{ room_id, creator_token? }`
- `GET /api/room/{id}/exists` → `{ exists, password_protected }`
- `GET /api/roulette` → `{ room_id }`
- WebSocket: `join`, `offer`, `answer`, `ice-candidate`, `chat_message`

## State

- Creator token stored in `sessionStorage` as `creator_{roomId}`
- WebRTC handles P2P video/audio
- Chat messages broadcast via WebSocket
