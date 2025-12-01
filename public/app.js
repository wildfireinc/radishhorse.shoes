// Shared utilities and configuration

// Backend API base URL
const API_BASE = 'https://api.radishhorse.shoes';

// Initialize backend config
window.API_BASE = API_BASE;
window.SOCKET_URL = null;
window.TURNSTILE_SITE_KEY = null;
window.turnstileToken = null;

// Create promise for backend config
window.BACKEND_CONFIG_READY = new Promise((resolve) => {
  // Try to load config from meta tag first
  const metaApiBase = document.querySelector('meta[name="api-base"]');
  const metaSocketUrl = document.querySelector('meta[name="socket-url"]');
  const metaTurnstileKey = document.querySelector('meta[name="turnstile-site-key"]');

  if (metaApiBase?.content && metaSocketUrl?.content && metaTurnstileKey?.content) {
    window.API_BASE = metaApiBase.content;
    window.SOCKET_URL = metaSocketUrl.content;
    window.TURNSTILE_SITE_KEY = metaTurnstileKey.content;
    resolve();
  } else {
    // Fetch from backend
    fetch(`${API_BASE}/api/config`)
      .then(res => res.json())
      .then(config => {
        window.API_BASE = config.apiUrl || API_BASE;
        window.SOCKET_URL = config.socketUrl;
        window.TURNSTILE_SITE_KEY = config.turnstileSiteKey;
        resolve();
      })
      .catch(err => {
        console.error('Failed to load backend config:', err);
        // Use defaults if config fails
        resolve();
      });
  }
});

// Utility functions
function showStatus(message, isError = false) {
  const statusEl = document.getElementById('status-message');
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = `status-message ${isError ? 'error' : ''}`;
  }
}

function clearStatus() {
  const statusEl = document.getElementById('status-message');
  if (statusEl) {
    statusEl.textContent = '';
    statusEl.className = 'status-message';
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showStatus('copied to clipboard!');
    setTimeout(clearStatus, 2000);
  }).catch(err => {
    console.error('Failed to copy:', err);
    showStatus('failed to copy', true);
  });
}

// Chaos button messages and links
const CHAOS_MESSAGES = [
  'respect',
  'well ur a weird fella',
  'knew this button will land',
  'chaos mode activated',
  'you clicked the chaos button',
  'wild times ahead',
  'embrace the chaos',
  'no regrets',
];

const CHAOS_LINKS = [
  'https://www.youtube.com/shorts/random',
  'https://www.youtube.com/shorts/another',
  'https://www.youtube.com/shorts/meme',
];

function showChaosMessage() {
  const message = CHAOS_MESSAGES[Math.floor(Math.random() * CHAOS_MESSAGES.length)];
  const link = CHAOS_LINKS[Math.floor(Math.random() * CHAOS_LINKS.length)];
  const showMessage = Math.random() > 0.3; // 70% chance
  const showLink = Math.random() > 0.3; // 70% chance

  const chaosEl = document.getElementById('chaos-message');
  if (!chaosEl) return;

  const messageText = chaosEl.querySelector('.chaos-message-text');
  const messageLink = chaosEl.querySelector('.chaos-message-link');

  if (showMessage && messageText) {
    messageText.textContent = message;
    messageText.style.display = 'block';
  } else if (messageText) {
    messageText.style.display = 'none';
  }

  if (showLink && messageLink) {
    messageLink.href = link;
    messageLink.textContent = link;
    messageLink.style.display = 'block';
    messageLink.onclick = (e) => {
      e.preventDefault();
      window.open(link, '_blank');
    };
  } else if (messageLink) {
    messageLink.style.display = 'none';
  }

  chaosEl.classList.remove('hidden');

  // Add visual effects
  const button = document.getElementById('chaos-btn');
  if (button) {
    button.classList.add('glitch', 'shake', 'flash');
    setTimeout(() => {
      button.classList.remove('glitch', 'shake', 'flash');
    }, 500);
  }

  setTimeout(() => {
    chaosEl.classList.add('hidden');
  }, 5000);
}

