# Radishhorse.shoes Algorithm

## Flow

### 1. Landing Page (`index.html`)

**Turnstile Gate:**
- User completes Cloudflare Turnstile
- `onTurnstileSuccess(token)` fires
- Gate hidden, main content shown
- Token stored in `window.turnstileToken`

**Camera Initialization:**
- `initCamera()` called after Turnstile success
- `getUserMedia({ video: true, audio: true })` requests access
- Stream attached to `#localVideo` element

**Room Creation:**
- User enters optional password
- Clicks "create room" button
- POST `/api/create-room` with `{ turnstile_token, password }`
- Backend returns `{ room_id }`
- Room link displayed: `/room/{room_id}`
- No redirect, stays on landing page

**Meet a Stranger (Roulette):**
- GET `/api/roulette`
- Backend returns random active room `{ room_id }`
- Redirect to `/room/{room_id}`

**Go Fuck Yourself:**
- Random message + visual effects
- Opens random meme link in new tab

### 2. Room Page (`room.html`)

**Room Validation:**
- GET `/api/room/{id}/exists`
- If room doesn't exist → redirect to `/`
- If password protected → show password input

**WebRTC Connection:**
- Socket.IO connects to backend
- `join_room` event with room_id + password
- Backend signals peer connections
- P2P video/audio via WebRTC

**Chat:**
- `chat_message` event broadcasts to all peers
- Messages displayed in chat container

**Remote Videos:**
- Only remote peers shown (no local video)
- Videos added to grid as peers join

## Backend API

**Endpoints:**
- `GET /api/config` - Returns API URLs, Turnstile key
- `POST /api/create-room` - Creates room, returns `{ room_id }`
- `GET /api/room/{id}/exists` - Checks room exists, returns `{ password_protected }`
- `GET /api/roulette` - Returns random active room

**WebSocket Events:**
- `join_room` - Join room with password
- `offer` - WebRTC offer
- `answer` - WebRTC answer
- `ice_candidate` - ICE candidate exchange
- `chat_message` - Broadcast chat message

## WebRTC Signaling

1. Peer A creates offer → sends `offer` event
2. Backend forwards to Peer B
3. Peer B creates answer → sends `answer` event
4. Backend forwards to Peer A
5. ICE candidates exchanged via `ice_candidate` events
6. P2P connection established

## State Management

**Global Variables:**
- `turnstileToken` - Cloudflare Turnstile token
- `localStream` - Local camera/mic stream
- `window.API_BASE` - Backend API URL
- `window.SOCKET_URL` - WebSocket URL

**Room State:**
- Stored in backend (in-memory)
- Cleared on server restart
- Password optional, stored per room

