class WebRTCManager {
    constructor(roomId) {
        this.roomId = roomId;
        this.socket = null;
        this.localStream = null;
        this.peerConnection = null;
        this.turnConfig = null;
        this.onStatusChange = null;
        this.init();
    }

    async init() {
        await this.getTurnConfig();
        await this.initLocalStream();
        this.initSocket();
    }

    async getTurnConfig() {
        try {
            const res = await fetch(`${window.API_BASE || ''}/api/turn-config`);
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
        if (this.localStream) return;
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            const localVideo = document.getElementById('localVideo');
            if (localVideo && (window.location.pathname === '/' || window.location.pathname === '')) {
                localVideo.srcObject = this.localStream;
                localVideo.play().catch(() => {});
            }
        } catch (err) {
            this.updateStatus('error: camera access denied');
        }
    }

    initSocket() {
        const socketUrl = window.SOCKET_URL || window.API_BASE || '';
        this.socket = socketUrl ? io(socketUrl) : io();

        this.socket.on('connect', () => {});
        this.socket.on('joined', () => {
            this.updateStatus('waiting for peer...');
            this.waitForPeer();
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
        // Try both chat containers (creator and guest)
        const chatMessages = document.getElementById('chatMessages') || document.getElementById('guestChatMessages');
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
        if (!this.socket?.connected) {
            this.updateStatus('connecting...');
            return Promise.resolve();
        }

        if (password) {
            try {
                const res = await fetch(`${window.API_BASE || ''}/api/room/${this.roomId}/password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'verify', password })
                });
                
                if (!res.ok) {
                    window.location.href = '/';
                    return Promise.reject('Room not found');
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

    waitForPeer() {
        setTimeout(() => {
            if (!this.peerConnection) {
                this.updateStatus('waiting for peer...');
            }
        }, 1000);
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
                    
                    const label = document.createElement('div');
                    label.className = 'video-label';
                    label.textContent = 'them';
                    
                    wrapper.appendChild(video);
                    wrapper.appendChild(label);
                    videoGrid.appendChild(wrapper);
                    
                    video.play().catch(() => {});
                }
                this.updateStatus('connected');
            };

            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.socket.emit('ice-candidate', { room_id: this.roomId, candidate: event.candidate });
                }
            };

            this.peerConnection.onconnectionstatechange = () => {
                const state = this.peerConnection.connectionState;
                switch (state) {
                    case 'connected':
                        this.updateStatus('connected');
                        setTimeout(() => {
                            const video = document.getElementById('videoGrid')?.querySelector('video');
                            if (video?.srcObject) video.play().catch(() => {});
                        }, 500);
                        break;
                    case 'disconnected':
                        this.updateStatus('disconnected');
                        break;
                    case 'failed':
                        this.updateStatus('connection failed');
                        break;
                }
            };

            this.updateStatus('peer connection created');
        } catch (err) {
            this.updateStatus('error: failed to create connection');
        }
    }

    async createOffer() {
        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            this.socket.emit('offer', { room_id: this.roomId, offer });
            this.updateStatus('offer sent');
        } catch (err) {
            this.updateStatus('error: failed to create offer');
        }
    }

    async handleOffer(offer) {
        try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            this.socket.emit('answer', { room_id: this.roomId, answer });
            this.updateStatus('answer sent');
        } catch (err) {
            this.updateStatus('error: failed to handle offer');
        }
    }

    async handleAnswer(answer) {
        try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            this.updateStatus('answer received');
        } catch (err) {
            this.updateStatus('error: failed to handle answer');
        }
    }

    async handleIceCandidate(candidate) {
        try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {}
    }

    updateStatus(status) {
        if (this.onStatusChange) this.onStatusChange(status);
    }

    cleanup() {
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        const videoGrid = document.getElementById('videoGrid');
        if (videoGrid) {
            const wrapper = videoGrid.querySelector('.remote-video-wrapper');
            if (wrapper) {
                const video = wrapper.querySelector('video');
                if (video?.srcObject) {
                    video.srcObject.getTracks().forEach(track => track.stop());
                }
                wrapper.remove();
            }
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.emit('leave', { room_id: this.roomId });
            this.socket.disconnect();
        }
        
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }
        
        this.cleanup();
    }
}
