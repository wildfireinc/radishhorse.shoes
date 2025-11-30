class WebRTCManager {
    constructor(roomId) {
        this.roomId = roomId;
        this.socket = null;
        this.localStream = null;
        this.remoteStream = null;
        this.peerConnection = null;
        this.turnConfig = null;
        this.onStatusChange = null;
        this.isInitiator = false;
        
        this.init();
    }

    async init() {
        await this.getTurnConfig();
        await this.initLocalStream();
        this.initSocket();
    }

    async getTurnConfig() {
        try {
            const response = await fetch(`${window.API_BASE || ''}/api/turn-config`);
            const data = await response.json();
            this.turnConfig = data.urls.length > 0 ? {
                iceServers: [
                    {
                        urls: data.urls,
                        username: data.username,
                        credential: data.credential
                    },
                    {
                        urls: ['stun:stun.l.google.com:19302']
                    }
                ]
            } : {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' }
                ]
            };
        } catch (err) {
            console.error('Error getting TURN config:', err);
            this.turnConfig = {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' }
                ]
            };
        }
    }

    async initLocalStream() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            
            // Only set local video on index page, not room page
            const localVideo = document.getElementById('localVideo');
            if (localVideo && window.location.pathname === '/') {
                localVideo.srcObject = this.localStream;
            }
        } catch (err) {
            console.error('Error accessing media devices:', err);
            this.updateStatus('error: camera access denied');
        }
    }

    initSocket() {
        const socketUrl = window.SOCKET_URL || window.API_BASE || '';
        this.socket = socketUrl ? io(socketUrl) : io();
        
        this.socket.on('connect', () => {
            console.log('Socket connected');
        });

        this.socket.on('connected', () => {
            console.log('Server connected');
        });

        this.socket.on('joined', (data) => {
            console.log('Joined room:', data.room_id);
            this.updateStatus('waiting for peer...');
            this.waitForPeer();
        });

        this.socket.on('error', (data) => {
            console.error('Socket error:', data.message);
            this.updateStatus('error: ' + data.message);
        });

        this.socket.on('user_joined', async (data) => {
            console.log('User joined:', data.sid);
            if (!this.peerConnection) {
                this.isInitiator = true;
                await this.createPeerConnection();
                await this.createOffer();
            }
        });

        this.socket.on('offer', async (data) => {
            console.log('Received offer');
            if (!this.peerConnection) {
                await this.createPeerConnection();
            }
            await this.handleOffer(data.offer);
        });

        this.socket.on('answer', async (data) => {
            console.log('Received answer');
            await this.handleAnswer(data.answer);
        });

        this.socket.on('ice-candidate', async (data) => {
            console.log('Received ICE candidate');
            await this.handleIceCandidate(data.candidate);
        });

        this.socket.on('user_left', (data) => {
            console.log('User left:', data.sid);
            this.updateStatus('peer disconnected');
            this.cleanup();
        });

        this.socket.on('disconnect', () => {
            console.log('Socket disconnected');
            this.updateStatus('disconnected');
        });
    }

    async joinRoom(password = '') {
        if (!this.socket || !this.socket.connected) {
            this.updateStatus('connecting...');
            return;
        }

        // Verify password if needed
        if (password) {
            try {
                const response = await fetch(`${window.API_BASE || ''}/api/room/${this.roomId}/password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'verify',
                        password: password
                    })
                });
                const data = await response.json();
                if (!data.valid) {
                    this.updateStatus('error: invalid password');
                    return;
                }
            } catch (err) {
                console.error('Error verifying password:', err);
                this.updateStatus('error: password verification failed');
                return;
            }
        }

        this.socket.emit('join', {
            room_id: this.roomId,
            password: password
        });
    }

    waitForPeer() {
        // Check if there are other users in the room
        setTimeout(() => {
            if (!this.peerConnection) {
                // No peer yet, we'll wait for them to join
                this.updateStatus('waiting for peer...');
            }
        }, 1000);
    }

    async createPeerConnection() {
        try {
            this.peerConnection = new RTCPeerConnection(this.turnConfig);

            // Add local stream tracks
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    this.peerConnection.addTrack(track, this.localStream);
                });
            }

            // Handle remote stream
            this.peerConnection.ontrack = (event) => {
                console.log('Received remote stream', event);
                this.remoteStream = event.streams[0];
                
                // Create video element dynamically
                const videoGrid = document.getElementById('videoGrid');
                if (videoGrid) {
                    // Remove existing remote videos
                    const existingRemote = videoGrid.querySelector('.remote-video-wrapper');
                    if (existingRemote) {
                        existingRemote.remove();
                    }
                    
                    // Create new video wrapper
                    const videoWrapper = document.createElement('div');
                    videoWrapper.className = 'video-wrapper remote-video-wrapper';
                    
                    const video = document.createElement('video');
                    video.id = 'remoteVideo';
                    video.autoplay = true;
                    video.playsInline = true;
                    video.muted = false;
                    video.srcObject = this.remoteStream;
                    
                    const label = document.createElement('div');
                    label.className = 'video-label';
                    label.textContent = 'them';
                    
                    videoWrapper.appendChild(video);
                    videoWrapper.appendChild(label);
                    videoGrid.appendChild(videoWrapper);
                    
                    video.play().catch(err => {
                        console.error('Error playing remote video:', err);
                    });
                    console.log('Remote video stream set');
                } else {
                    console.error('Video grid element not found');
                }
                this.updateStatus('connected');
            };

            // Handle ICE candidates
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.socket.emit('ice-candidate', {
                        room_id: this.roomId,
                        candidate: event.candidate
                    });
                }
            };

            // Handle connection state changes
            this.peerConnection.onconnectionstatechange = () => {
                const state = this.peerConnection.connectionState;
                console.log('Connection state:', state);
                
                switch (state) {
                    case 'connected':
                        this.updateStatus('connected');
                        // Ensure remote video is playing
                        setTimeout(() => {
                            const remoteVideo = document.getElementById('remoteVideo');
                            if (remoteVideo && remoteVideo.srcObject) {
                                remoteVideo.play().catch(err => {
                                    console.error('Error playing remote video on connect:', err);
                                });
                            }
                        }, 500);
                        break;
                    case 'disconnected':
                        this.updateStatus('disconnected');
                        break;
                    case 'failed':
                        this.updateStatus('connection failed');
                        break;
                    case 'closed':
                        this.updateStatus('connection closed');
                        break;
                }
            };
            
            // Handle ICE connection state
            this.peerConnection.oniceconnectionstatechange = () => {
                console.log('ICE connection state:', this.peerConnection.iceConnectionState);
            };

            this.updateStatus('peer connection created');
        } catch (err) {
            console.error('Error creating peer connection:', err);
            this.updateStatus('error: failed to create connection');
        }
    }

    async createOffer() {
        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            
            this.socket.emit('offer', {
                room_id: this.roomId,
                offer: offer
            });
            
            this.updateStatus('offer sent');
        } catch (err) {
            console.error('Error creating offer:', err);
            this.updateStatus('error: failed to create offer');
        }
    }

    async handleOffer(offer) {
        try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            
            this.socket.emit('answer', {
                room_id: this.roomId,
                answer: answer
            });
            
            this.updateStatus('answer sent');
        } catch (err) {
            console.error('Error handling offer:', err);
            this.updateStatus('error: failed to handle offer');
        }
    }

    async handleAnswer(answer) {
        try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            this.updateStatus('answer received');
        } catch (err) {
            console.error('Error handling answer:', err);
            this.updateStatus('error: failed to handle answer');
        }
    }

    async handleIceCandidate(candidate) {
        try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            console.error('Error handling ICE candidate:', err);
        }
    }

    updateStatus(status) {
        if (this.onStatusChange) {
            this.onStatusChange(status);
        }
    }

    cleanup() {
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        // Remove remote video wrapper
        const videoGrid = document.getElementById('videoGrid');
        if (videoGrid) {
            const remoteWrapper = videoGrid.querySelector('.remote-video-wrapper');
            if (remoteWrapper) {
                const video = remoteWrapper.querySelector('video');
                if (video && video.srcObject) {
                    video.srcObject.getTracks().forEach(track => track.stop());
                }
                remoteWrapper.remove();
            }
        }
        
        this.remoteStream = null;
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

