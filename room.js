// Room page functionality

let roomId = null;
let isCreator = false;
let chatOnly = false;
let socket = null;
let peerConnection = null;
let localStream = null;
let turnConfig = null;
let mySocketId = null;
let chatMessages = [];

// Initialize room
document.addEventListener('DOMContentLoaded', async () => {
  // Extract roomId from URL
  const path = window.location.pathname;
  roomId = path.split('/').filter(Boolean)[0] || path.substring(1);

  if (!roomId) {
    window.location.href = '/';
    return;
  }

  await window.BACKEND_CONFIG_READY;

  // Check if creator
  const creatorToken = sessionStorage.getItem(`creator_${roomId}`);
  isCreator = !!creatorToken;

  // Get chat-only mode
  const mode = sessionStorage.getItem(`mode_${roomId}`);
  chatOnly = mode === 'chat';

  // Initialize room
  if (isCreator) {
    await joinRoom();
  } else {
    await checkRoomExists();
  }

  setupUI();
});

async function checkRoomExists() {
  try {
    const response = await fetch(`${window.API_BASE}/api/room/${roomId}/exists`);
    if (!response.ok) {
      throw new Error('Room check failed');
    }

    const data = await response.json();
    if (!data.exists) {
      window.location.href = '/';
      return;
    }

    if (data.password_protected) {
      // Show password form
      const passwordForm = document.getElementById('password-form');
      if (passwordForm) passwordForm.classList.remove('hidden');

      const joinBtn = document.getElementById('join-room-btn');
      if (joinBtn) {
        joinBtn.addEventListener('click', async () => {
          const passwordInput = document.getElementById('room-password-input');
          const password = passwordInput?.value || null;
          await joinRoom(password);
        });
      }
    } else {
      await joinRoom();
    }
  } catch (err) {
    console.error('Room check error:', err);
    showStatus('failed to check room', true);
    setTimeout(() => {
      window.location.href = '/';
    }, 2000);
  }
}

async function joinRoom(password = null) {
  try {
    // Hide password form
    const passwordForm = document.getElementById('password-form');
    if (passwordForm) passwordForm.classList.add('hidden');

    showStatus('connecting...');

    // Initialize camera if not chat-only
    if (!chatOnly) {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
      } catch (err) {
        console.error('Camera access denied:', err);
        showStatus('camera access denied - continuing in chat mode', true);
        chatOnly = true;
      }
    }

    // Fetch TURN config
    const turnResponse = await fetch(`${window.API_BASE}/api/turn-config`);
    if (turnResponse.ok) {
      turnConfig = await turnResponse.json();
    }

    // Connect to Socket.IO
    socket = io(window.SOCKET_URL, {
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      mySocketId = socket.id;
      // Join room
      socket.emit('join', {
        room_id: roomId,
        password: password,
        chat_only: chatOnly,
      });
    });

    socket.on('joined', () => {
      showStatus('connected');
      setTimeout(clearStatus, 2000);
      showRoomContent();
      if (!chatOnly && localStream) {
        initializeWebRTC();
      }
    });

    socket.on('user_joined', () => {
      showStatus('someone joined');
      setTimeout(clearStatus, 2000);
      if (!chatOnly && localStream) {
        createOffer();
      }
    });

    socket.on('user_left', () => {
      showStatus('someone left');
      setTimeout(clearStatus, 2000);
      if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
      }
      clearVideoGrid();
    });

    socket.on('offer', async (data) => {
      if (data.room_id === roomId) {
        await handleOffer(data.offer);
      }
    });

    socket.on('answer', async (data) => {
      if (data.room_id === roomId) {
        await handleAnswer(data.answer);
      }
    });

    socket.on('ice-candidate', async (data) => {
      if (data.room_id === roomId && data.candidate) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
        }
      }
    });

    socket.on('chat_message', (data) => {
      if (data.room_id === roomId) {
        addChatMessage(data.message, data.sid === mySocketId);
      }
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
      showStatus(error.message || 'connection error', true);
    });

    socket.on('disconnect', () => {
      showStatus('disconnected', true);
    });

  } catch (err) {
    console.error('Join room error:', err);
    showStatus('failed to join room', true);
  }
}

function showRoomContent() {
  const roomContent = document.getElementById('room-content');
  if (roomContent) roomContent.classList.remove('hidden');

  // Set room URL
  const roomUrlInput = document.getElementById('room-url-input');
  if (roomUrlInput) {
    roomUrlInput.value = `${window.location.origin}/${roomId}`;
  }

  // Hide video grid if chat-only
  if (chatOnly) {
    const videoGrid = document.getElementById('video-grid');
    if (videoGrid) videoGrid.classList.add('hidden');
  }
}

function setupUI() {
  // Copy URL button
  const copyUrlBtn = document.getElementById('copy-url-btn');
  if (copyUrlBtn) {
    copyUrlBtn.addEventListener('click', () => {
      const roomUrlInput = document.getElementById('room-url-input');
      if (roomUrlInput) {
        copyToClipboard(roomUrlInput.value);
      }
    });
  }

  // Chat input
  const chatInput = document.getElementById('chat-input');
  const chatSendBtn = document.getElementById('chat-send-btn');

  if (chatInput && chatSendBtn) {
    const sendMessage = () => {
      const message = chatInput.value.trim();
      if (message && socket) {
        socket.emit('chat_message', {
          room_id: roomId,
          message: message,
        });
        chatInput.value = '';
      }
    };

    chatSendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    });
  }
}

function initializeWebRTC() {
  if (!localStream) return;

  // Create RTCPeerConnection
  const config = {
    iceServers: turnConfig?.urls ? turnConfig.urls.map(url => ({
      urls: url,
      username: turnConfig.username,
      credential: turnConfig.credential,
    })) : [
      { urls: 'stun:stun.l.google.com:19302' },
    ],
  };

  peerConnection = new RTCPeerConnection(config);

  // Add local stream tracks
  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  // Handle ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate && socket) {
      socket.emit('ice-candidate', {
        candidate: event.candidate,
        room_id: roomId,
      });
    }
  };

  // Handle remote stream
  peerConnection.ontrack = (event) => {
    const remoteStream = event.streams[0];
    addRemoteVideo(remoteStream);
  };

  peerConnection.onconnectionstatechange = () => {
    console.log('Connection state:', peerConnection.connectionState);
    if (peerConnection.connectionState === 'failed') {
      showStatus('connection failed', true);
    }
  };
}

async function createOffer() {
  if (!peerConnection || !socket) return;

  try {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.emit('offer', {
      offer: offer,
      room_id: roomId,
    });
  } catch (err) {
    console.error('Error creating offer:', err);
  }
}

async function handleOffer(offer) {
  if (!peerConnection) {
    initializeWebRTC();
  }

  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit('answer', {
      answer: answer,
      room_id: roomId,
    });
  } catch (err) {
    console.error('Error handling offer:', err);
  }
}

async function handleAnswer(answer) {
  if (!peerConnection) return;

  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  } catch (err) {
    console.error('Error handling answer:', err);
  }
}

function addRemoteVideo(stream) {
  const videoGrid = document.getElementById('video-grid');
  if (!videoGrid) return;

  // Remove existing videos
  clearVideoGrid();

  const video = document.createElement('video');
  video.className = 'remote-video';
  video.srcObject = stream;
  video.autoplay = true;
  video.playsInline = true;

  video.onloadedmetadata = () => {
    video.play();
  };

  videoGrid.appendChild(video);
}

function clearVideoGrid() {
  const videoGrid = document.getElementById('video-grid');
  if (videoGrid) {
    videoGrid.innerHTML = '';
  }
}

function addChatMessage(message, isOwn = false) {
  const chatMessages = document.getElementById('chat-messages');
  if (!chatMessages) return;

  // Limit to 50 messages
  if (chatMessages.children.length >= 50) {
    chatMessages.removeChild(chatMessages.firstChild);
  }

  const messageEl = document.createElement('div');
  messageEl.className = `chat-message ${isOwn ? 'own' : 'other'}`;

  const authorEl = document.createElement('div');
  authorEl.className = 'chat-message-author';
  authorEl.textContent = isOwn ? 'you' : 'stranger';

  const textEl = document.createElement('div');
  textEl.textContent = message;

  messageEl.appendChild(authorEl);
  messageEl.appendChild(textEl);
  chatMessages.appendChild(messageEl);

  // Auto-scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  if (peerConnection) {
    peerConnection.close();
  }
  if (socket) {
    socket.disconnect();
  }
});

