// Landing page functionality

let localStream = null;
let turnstileWidgetId = null;

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
  await window.BACKEND_CONFIG_READY;

  // Wait for Turnstile script to load
  if (window.turnstile && window.TURNSTILE_SITE_KEY) {
    turnstileWidgetId = window.turnstile.render('#turnstile-widget', {
      sitekey: window.TURNSTILE_SITE_KEY,
      callback: onTurnstileSuccess,
      'error-callback': onTurnstileError,
      'expired-callback': onTurnstileExpired,
    });
  } else {
    // Wait a bit for Turnstile script to load
    const checkTurnstile = setInterval(() => {
      if (window.turnstile && window.TURNSTILE_SITE_KEY) {
        clearInterval(checkTurnstile);
        turnstileWidgetId = window.turnstile.render('#turnstile-widget', {
          sitekey: window.TURNSTILE_SITE_KEY,
          callback: onTurnstileSuccess,
          'error-callback': onTurnstileError,
          'expired-callback': onTurnstileExpired,
        });
      } else if (!window.TURNSTILE_SITE_KEY) {
        // If no Turnstile key after waiting, show main content
        clearInterval(checkTurnstile);
        showMainContent();
        initCamera();
      }
    }, 100);

    // Timeout after 5 seconds
    setTimeout(() => {
      clearInterval(checkTurnstile);
      if (!turnstileWidgetId && !document.getElementById('main-content').classList.contains('visible')) {
        showMainContent();
        initCamera();
      }
    }, 5000);
  }

  // Setup button handlers
  setupButtons();
});

function onTurnstileSuccess(token) {
  window.turnstileToken = token;
  showMainContent();
  initCamera();
}

function onTurnstileError() {
  showStatus('turnstile verification failed', true);
}

function onTurnstileExpired() {
  window.turnstileToken = null;
  if (turnstileWidgetId) {
    window.turnstile.reset(turnstileWidgetId);
  }
}

function showMainContent() {
  const gate = document.getElementById('turnstile-gate');
  const main = document.getElementById('main-content');
  if (gate) gate.classList.add('hidden');
  if (main) main.classList.add('visible');
}

async function initCamera() {
  const chatOnly = document.getElementById('chat-only-checkbox')?.checked;
  if (chatOnly) {
    const videoPreview = document.getElementById('video-preview');
    if (videoPreview) videoPreview.classList.add('hidden');
    return;
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    const videoPreview = document.getElementById('video-preview');
    if (videoPreview) {
      videoPreview.srcObject = localStream;
      videoPreview.classList.remove('hidden');
    }
  } catch (err) {
    console.error('Camera access denied:', err);
    showStatus('camera access denied - continuing in chat mode', true);
    const videoPreview = document.getElementById('video-preview');
    if (videoPreview) videoPreview.classList.add('hidden');
  }
}

function setupButtons() {
  // Chat only toggle
  const chatOnlyCheckbox = document.getElementById('chat-only-checkbox');
  if (chatOnlyCheckbox) {
    chatOnlyCheckbox.addEventListener('change', () => {
      if (chatOnlyCheckbox.checked) {
        // Stop camera
        if (localStream) {
          localStream.getTracks().forEach(track => track.stop());
          localStream = null;
        }
        const videoPreview = document.getElementById('video-preview');
        if (videoPreview) videoPreview.classList.add('hidden');
      } else {
        initCamera();
      }
    });
  }

  // Create room button
  const createRoomBtn = document.getElementById('create-room-btn');
  if (createRoomBtn) {
    createRoomBtn.addEventListener('click', handleCreateRoom);
  }

  // Meet stranger button
  const meetStrangerBtn = document.getElementById('meet-stranger-btn');
  if (meetStrangerBtn) {
    meetStrangerBtn.addEventListener('click', handleMeetStranger);
  }

  // Chaos button
  const chaosBtn = document.getElementById('chaos-btn');
  if (chaosBtn) {
    chaosBtn.addEventListener('click', showChaosMessage);
  }
}

async function handleCreateRoom() {
  await window.BACKEND_CONFIG_READY;

  if (!window.turnstileToken) {
    showStatus('please complete verification', true);
    return;
  }

  const passwordInput = document.getElementById('password-input');
  const password = passwordInput?.value.trim() || null;
  const chatOnly = document.getElementById('chat-only-checkbox')?.checked || false;

  const createRoomBtn = document.getElementById('create-room-btn');
  if (createRoomBtn) createRoomBtn.disabled = true;

  try {
    const response = await fetch(`${window.API_BASE}/api/create-room`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        password: password,
        turnstile_token: window.turnstileToken,
        chat_only: chatOnly,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to create room');
    }

    const data = await response.json();
    const roomId = data.room_id;

    // Store creator token and mode
    if (data.creator_token) {
      sessionStorage.setItem(`creator_${roomId}`, data.creator_token);
    }
    sessionStorage.setItem(`mode_${roomId}`, chatOnly ? 'chat' : 'camera');

    // Stop local stream before redirect
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }

    // Redirect to room
    window.location.href = `/${roomId}`;
  } catch (err) {
    console.error('Create room error:', err);
    showStatus('failed to create room', true);
    if (createRoomBtn) createRoomBtn.disabled = false;
  }
}

async function handleMeetStranger() {
  await window.BACKEND_CONFIG_READY;

  if (!window.turnstileToken) {
    showStatus('please complete verification', true);
    return;
  }

  const meetStrangerBtn = document.getElementById('meet-stranger-btn');
  if (!meetStrangerBtn) return;

  const chatOnly = document.getElementById('chat-only-checkbox')?.checked || false;
  let waitTime = 0;
  const maxWaitTime = 30; // seconds

  // Show timer
  const timerInterval = setInterval(() => {
    waitTime++;
    meetStrangerBtn.textContent = `wait... [${waitTime}s]`;
    meetStrangerBtn.disabled = true;
  }, 1000);

  try {
    const response = await fetch(`${window.API_BASE}/api/roulette?chat_only=${chatOnly}`, {
      method: 'GET',
    });

    clearInterval(timerInterval);
    meetStrangerBtn.disabled = false;
    meetStrangerBtn.textContent = 'meet a stranger';

    if (!response.ok) {
      throw new Error('Failed to find stranger');
    }

    const data = await response.json();
    const roomId = data.room_id;

    // Store mode
    sessionStorage.setItem(`mode_${roomId}`, chatOnly ? 'chat' : 'camera');

    // Stop local stream before redirect
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }

    // Redirect to room
    window.location.href = `/${roomId}`;
  } catch (err) {
    console.error('Meet stranger error:', err);
    clearInterval(timerInterval);
    meetStrangerBtn.disabled = false;
    meetStrangerBtn.textContent = 'meet a stranger';
    showStatus('failed to find stranger', true);
  }
}

