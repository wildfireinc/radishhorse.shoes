class WebRTCManager {
    constructor(roomId, chatOnly = false) {
        this.roomId = roomId;
        this.chatOnly = chatOnly;
        this.socket = null;
        this.localStream = null;
        this.peerConnection = null;
        this.turnConfig = null;
        this.onStatusChange = null;
        this.init();
    }

    async init() {
        this.initSocket();
        await this.getTurnConfig();
        await this.initLocalStream();
        if (!this.socket) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    async getTurnConfig() {
        if (!window.API_BASE) return;
        try {
            const res = await fetch(`${window.API_BASE}/api/turn-config`);
            const data = await res.json();
            this.turnConfig = data.urls?.length > 0 ? {
                iceServers: [
                    { urls: data.urls, username: data.username, credential: data.credential },
                    { urls: ['stun:stun.l.google.com:19302'] }
                ]
            } : {
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            };
        } catch (err) {
            this.turnConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
        }
    }

    async initLocalStream() {
        if (this.chatOnly) return;
        if (this.localStream) return;
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } catch (err) {
            this.updateStatus('error: camera access denied');
        }
    }

    initSocket() {
        if (!window.SOCKET_URL && !window.API_BASE) {
            this.updateStatus('error: socket URL not configured');
            return;
        }
        const socketUrl = window.SOCKET_URL || window.API_BASE;
        const options = {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 10000,
            forceNew: true,
            path: '/socket.io/',
            autoConnect: true
        };
        
        try {
            this.socket = io(socketUrl, options);
        } catch (err) {
            this.updateStatus('error: failed to initialize socket');
            return;
        }
        
        if (!this.socket) {
            this.updateStatus('error: failed to initialize socket');
            return;
        }

        this.socket.on('connect', () => {
            this.updateStatus('connected');
        });
        
        this.socket.on('connect_error', (err) => {
            this.updateStatus('error: cannot connect to ' + socketUrl);
        });
        
        this.socket.on('disconnect', (reason) => {
            if (reason === 'io server disconnect') {
                this.updateStatus('disconnected by server');
            } else {
                this.updateStatus('disconnected');
            }
        });
        
        this.socket.on('joined', () => {
            this.updateStatus('waiting for peer...');
        });
        
        this.socket.on('error', (data) => {
            const msg = data.message || '';
            if (msg.includes('not found') || msg.includes('Room not found') || msg.includes('Invalid')) {
                window.location.href = '/';
            } else {
                this.updateStatus('error: ' + msg);
            }
        });
        
        this.socket.on('user_joined', async () => {
            if (!this.peerConnection) {
                await this.createPeerConnection();
                await this.createOffer();
            }
        });
        
        this.socket.on('offer', async (data) => {
            if (!this.peerConnection) await this.createPeerConnection();
            await this.handleOffer(data.offer);
        });
        
        this.socket.on('answer', async (data) => {
            await this.handleAnswer(data.answer);
        });
        
        this.socket.on('ice-candidate', async (data) => {
            await this.handleIceCandidate(data.candidate);
        });
        
        this.socket.on('user_left', () => {
            this.updateStatus('peer disconnected');
            this.cleanup();
        });
        
        this.socket.on('chat_message', (data) => {
            this.handleChatMessage(data.message, data.sid !== this.socket.id);
        });
    }

    sendChatMessage(message) {
        if (this.socket?.connected && message.trim()) {
            this.socket.emit('chat_message', { room_id: this.roomId, message: message.trim() });
            this.handleChatMessage(message.trim(), false);
        }
    }

    handleChatMessage(message, isFromOther) {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;

        const div = document.createElement('div');
        div.className = 'chat-message' + (isFromOther ? '' : ' own');
        div.textContent = message;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        while (chatMessages.children.length > 50) {
            chatMessages.removeChild(chatMessages.firstChild);
        }
    }

    async joinRoom(password = '') {
        if (!this.socket) {
            this.updateStatus('error: socket not initialized');
            return Promise.reject('Socket not initialized');
        }
        
        if (!this.socket.connected) {
            this.updateStatus('connecting...');
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject('Connection timeout'), 10000);
                this.socket.once('connect', () => {
                    clearTimeout(timeout);
                    resolve();
                });
                this.socket.once('connect_error', (err) => {
                    clearTimeout(timeout);
                    reject('Connection failed');
                });
            });
        }

        if (password) {
            try {
                const res = await fetch(`${window.API_BASE}/api/room/${this.roomId}/password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                });
                
                if (!res.ok) {
                    this.updateStatus('error: password verification failed');
                    return Promise.reject('Password verification failed');
                }
                
                const data = await res.json();
                if (!data.valid) {
                    this.updateStatus('error: invalid password');
                    return Promise.reject('Invalid password');
                }
            } catch (err) {
                this.updateStatus('error: password verification failed');
                return Promise.reject(err);
            }
        }

        this.socket.emit('join', { room_id: this.roomId, password });
        return Promise.resolve();
    }

    async createPeerConnection() {
        try {
            this.peerConnection = new RTCPeerConnection(this.turnConfig);

            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    this.peerConnection.addTrack(track, this.localStream);
                });
            }

            this.peerConnection.ontrack = (event) => {
                const stream = event.streams[0];
                const videoGrid = document.getElementById('videoGrid');
                if (videoGrid) {
                    const existing = videoGrid.querySelector('.remote-video-wrapper');
                    if (existing) existing.remove();
                    
                    const wrapper = document.createElement('div');
                    wrapper.className = 'video-wrapper remote-video-wrapper';
                    
                    const video = document.createElement('video');
                    video.autoplay = true;
                    video.playsInline = true;
                    video.srcObject = stream;
                    video.play().catch(() => {});
                    
                    wrapper.appendChild(video);
                    videoGrid.appendChild(wrapper);
                }
            };

            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate && this.socket?.connected) {
                    this.socket.emit('ice-candidate', { candidate: event.candidate, room_id: this.roomId });
                }
            };

            this.peerConnection.onconnectionstatechange = () => {
                if (this.peerConnection.connectionState === 'connected') {
                    this.updateStatus('connected');
                } else if (this.peerConnection.connectionState === 'failed') {
                    this.updateStatus('connection failed');
                }
            };
        } catch (err) {
            this.updateStatus('error: failed to create peer connection');
        }
    }

    async createOffer() {
        if (!this.peerConnection) return;
        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            if (this.socket?.connected) {
                this.socket.emit('offer', { offer, room_id: this.roomId });
            }
        } catch (err) {
            this.updateStatus('error: failed to create offer');
        }
    }

    async handleOffer(offer) {
        if (!this.peerConnection) return;
        try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            if (this.socket?.connected) {
                this.socket.emit('answer', { answer, room_id: this.roomId });
            }
        } catch (err) {
            this.updateStatus('error: failed to handle offer');
        }
    }

    async handleAnswer(answer) {
        if (!this.peerConnection) return;
        try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
            this.updateStatus('error: failed to handle answer');
        }
    }

    async handleIceCandidate(candidate) {
        if (!this.peerConnection) return;
        try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            this.updateStatus('error: failed to add ICE candidate');
        }
    }

    updateStatus(msg) {
        if (this.onStatusChange) this.onStatusChange(msg);
    }

    cleanup() {
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        const videoGrid = document.getElementById('videoGrid');
        if (videoGrid) {
            const wrapper = videoGrid.querySelector('.remote-video-wrapper');
            if (wrapper) wrapper.remove();
        }
    }
}

