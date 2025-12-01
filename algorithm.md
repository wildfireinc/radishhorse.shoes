# Radishhorse.shoes Algorithm

## Frontend Flow

### Landing Page (`index.html`)
1. **Turnstile Gate**: Cloudflare Turnstile verification required before access
   - Token stored in `window.turnstileToken`
   - On success: hide gate, show main content, init camera
   - On expired: clear token

2. **Config Loading**: Fetch backend config from `/api/config` (or meta tag)
   - Sets `window.API_BASE`, `window.SOCKET_URL`, `window.TURNSTILE_SITE_KEY`
   - Promise stored in `window.BACKEND_CONFIG_READY`
   - All API calls wait for this promise

3. **Main Page UI**:
   - Logo (clickable, links to `/`)
   - Local video preview (flipped horizontally, auto-starts unless chat-only)
   - "meet a stranger" button (roulette)
   - "go fuck yourself" button (chaos)
   - Password input (optional, for room creation)
   - "create room" button
   - "chat only" toggle (checkbox, hides camera when enabled)
   - Creator credit link (@thewildfireway Instagram)

4. **Create Room Flow**:
   - Wait for `BACKEND_CONFIG_READY`
   - Check Turnstile token exists
   - POST `/api/create-room` with: `password` (null if empty), `turnstile_token`, `chat_only`
   - Store `creator_{roomId}` token and `mode_{roomId}` in sessionStorage
   - Redirect to `/{roomId}`

5. **Meet Stranger (Roulette)**:
   - Wait for `BACKEND_CONFIG_READY`
   - Check Turnstile token exists
   - Button shows timer: "wait... [Xs]"
   - GET `/api/roulette?chat_only={bool}`
   - Store `mode_{roomId}` in sessionStorage
   - Redirect to `/{roomId}` on success

6. **Chaos Button**:
   - Random messages: "respect", "well ur a weird fella", "knew this button will land", etc.
   - Random meme links (YouTube shorts)
   - Shows message + link, or just message, or just link (randomized)
   - Links open in new tabs
   - Visual effects: glitch, shake, flash animations

### Room Page (`room.html`)
**Unified page for creator and guest:**

1. **Initialization**:
   - Extract roomId from URL path `/{roomId}`
   - Wait for `BACKEND_CONFIG_READY`
   - Check if creator token exists: `sessionStorage.getItem('creator_{roomId}')`

2. **Creator Flow** (has token):
   - Join room immediately (no password check)
   - Show: room link + copy button + chat

3. **Guest Flow** (no token):
   - GET `/api/room/{id}/exists`
   - If not exists → redirect to `/`
   - If password protected → show password input + join button
   - If no password → join immediately
   - After join → show: room link + copy button + chat

4. **Room UI** (after joining):
   - Logo (small, clickable to `/`)
   - Video grid (remote peers only, hidden if chat-only mode)
   - Room URL input (readonly) + copy button
   - Chat messages container (scrollable, max 50 messages)
   - Chat input (max 200 chars) + send button
   - Status message display
   - Creator credit link

5. **WebRTC Connection**:
   - Initialize Socket.IO connection to `SOCKET_URL`
   - Fetch TURN config from `/api/turn-config`
   - Create RTCPeerConnection with TURN/STUN servers
   - Exchange offer/answer/ICE candidates via WebSocket
   - Add remote video streams to grid
   - Handle peer disconnection

6. **Chat**:
   - Send via WebSocket: `chat_message` event with `room_id` and `message`
   - Receive broadcasts, display in chat container
   - Own messages vs others (styling difference)
   - Auto-scroll to bottom

## Backend API

### REST Endpoints
- `GET /api/config` → `{ apiUrl, socketUrl, turnstileSiteKey }`
- `POST /api/create-room` → `{ room_id, creator_token? }`
  - Body: `{ password?, turnstile_token, chat_only }`
- `GET /api/room/{id}/exists` → `{ exists, password_protected }`
- `GET /api/roulette?chat_only={bool}` → `{ room_id }`
- `GET /api/turn-config` → `{ urls[], username?, credential? }`

### WebSocket Events (Socket.IO)
- `join` → `{ room_id, password?, chat_only? }`
- `offer` → `{ offer, room_id }`
- `answer` → `{ answer, room_id }`
- `ice-candidate` → `{ candidate, room_id }`
- `chat_message` → `{ room_id, message, sid }`
- `joined` → confirmation
- `user_joined` → peer connected
- `user_left` → peer disconnected
- `error` → error message

## State Management

### sessionStorage
- `creator_{roomId}` → creator token (for room creator identification)
- `mode_{roomId}` → "chat" or "camera" (chat-only mode flag)

### window globals
- `API_BASE` → backend API URL
- `SOCKET_URL` → WebSocket server URL
- `TURNSTILE_SITE_KEY` → Cloudflare Turnstile site key
- `turnstileToken` → current Turnstile verification token
- `BACKEND_CONFIG_READY` → Promise that resolves when config loaded

### WebRTC State
- `localStream` → user's camera/mic stream
- `peerConnection` → RTCPeerConnection instance
- `socket` → Socket.IO connection
- `turnConfig` → TURN/STUN server configuration

## Technical Details

### WebRTC Flow
1. Create RTCPeerConnection with TURN/STUN config
2. Add local stream tracks
3. Create offer → send via WebSocket
4. Receive answer → set remote description
5. Exchange ICE candidates
6. Add remote stream to video element

### Error Handling
- Invalid/expired rooms → redirect to `/`
- Socket connection errors → show status, retry
- Camera permission denied → show error, continue (chat-only)
- Network errors → show user-friendly messages

### Styling
- Retro neon vaporwave aesthetic
- Black background (#000)
- Neon cyan (#00ffff), magenta (#ff00ff), pink (#ff00aa)
- Glowing text effects, animations
- Responsive design (mobile-friendly)
- Local video flipped horizontally (mirror effect)
- Buttons: same size, no transform on active/press
- Inputs: same padding as buttons, consistent sizing

### Dependencies
- Socket.IO client (CDN)
- Cloudflare Turnstile (CDN)
- Vanilla JavaScript (no frameworks)
- Pure CSS (no preprocessors)
