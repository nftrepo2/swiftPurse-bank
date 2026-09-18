// digital-grownt / SwiftPurse frontend auth + push helpers
function pageLoginPath() {
  const path = window.location.pathname || '';
  return path.includes('/user/') || path.includes('/admin/') ? '../login.html' : './login.html';
}

async function isLoggedIn() {
  try {
    const response = await api.get('/auth/me');
    const payload = response && response.data ? response.data : null;
    if (!payload) {
      localStorage.removeItem('user');
      return false;
    }
    const user = payload.user || payload;
    localStorage.setItem('user', JSON.stringify(user));
    return true;
  } catch (_) {
    localStorage.removeItem('user');
    return false;
  }
}

function getCurrentUser() {
  try { return JSON.parse(localStorage.getItem('user')); } catch (_) { return null; }
}

async function logout() {
  try { await api.get('/auth/logout'); } catch (_) {}
  try {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('baUid');
  } catch (_) {}
  window.location.href = pageLoginPath();
}

async function requireAuthPage() {
  const ok = await isLoggedIn();
  if (!ok) {
    window.location.href = pageLoginPath();
    return false;
  }
  return true;
}

async function requireAdmin() {
  try {
    const response = await api.get('/auth/me');
    localStorage.setItem('user', JSON.stringify(response.data));
    if (!response.data || String(response.data.role || '').toUpperCase() !== 'ADMIN') {
      window.location.href = '../index.html';
      return false;
    }
    return true;
  } catch (_) {
    localStorage.removeItem('user');
    window.location.href = '../login.html';
    return false;
  }
}

function isProtectedFrontendPath() {
  const path = window.location.pathname || '';
  return path.includes('/user/') || path.includes('/admin/');
}

async function protectCurrentFrontendPage() {
  const path = window.location.pathname || '';
  if (!isProtectedFrontendPath()) return true;

  document.documentElement.style.visibility = 'hidden';
  const allowed = path.includes('/admin/') ? await requireAdmin() : await requireAuthPage();
  if (allowed) document.documentElement.style.visibility = 'visible';
  return allowed;
}

function pushSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window && window.isSecureContext;
}

function requestPushPermission() {
  if (!pushSupported() || Notification.permission === 'denied') return Promise.resolve(Notification.permission);
  if (Notification.permission === 'default') return Notification.requestPermission();
  return Promise.resolve(Notification.permission);
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
}

async function getOrCreatePushSubscription() {
  if (!pushSupported() || Notification.permission !== 'granted') return null;
  const configResponse = await api.get('/auth/push-config');
  if (!configResponse.data?.enabled || !configResponse.data.publicKey) return null;

  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  try { await registration.update(); } catch (_) {}

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(configResponse.data.publicKey)
    });
  }
  return subscription;
}

async function subscribePush() {
  const subscription = await getOrCreatePushSubscription();
  if (!subscription) return false;
  await api.post('/auth/push-subscribe', { subscription: subscription.toJSON() });
  localStorage.removeItem('pendingPushSubscription');
  return true;
}

async function setupPublicPush(options) {
  try {
    if (!pushSupported()) return false;
    const permission = options && options.permission ? options.permission : Notification.permission;
    if (permission !== 'granted') return false;
    const subscription = await getOrCreatePushSubscription();
    if (!subscription) return false;
    const payload = { subscription: subscription.toJSON() };
    localStorage.setItem('pendingPushSubscription', JSON.stringify(payload.subscription));
    try {
      await api.post('/auth/push-subscribe', payload);
      localStorage.removeItem('pendingPushSubscription');
    } catch (error) {
      if (error.response?.status !== 401 && error.status !== 401) throw error;
    }
    return true;
  } catch (error) {
    console.warn('Public push setup failed:', error.message);
    return false;
  }
}

async function setupPushIfNeeded(options) {
  try {
    const permission = options && options.permission ? options.permission : (Notification.permission || 'default');
    if (permission !== 'granted') return false;
    return await subscribePush();
  } catch (error) {
    console.warn('Push setup failed:', error.message);
    return false;
  }
}

function addNotificationButton() {
  if (!pushSupported() || !document.body || document.getElementById('enable-browser-notifications')) return;
  if (Notification.permission === 'granted' || Notification.permission === 'denied') return;

  const button = document.createElement('button');
  button.id = 'enable-browser-notifications';
  button.type = 'button';
  button.setAttribute('aria-label', 'Enable browser notifications');
  button.innerHTML = '<span aria-hidden="true">🔔</span><span>Enable notifications</span>';
  button.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:9999;display:flex;align-items:center;gap:8px;padding:12px 16px;border:1px solid rgba(0,212,154,.45);border-radius:999px;background:#111;color:#fff;font:600 13px system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.35);cursor:pointer;';
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.style.opacity = '0.65';
    const permission = await requestPushPermission();
    let enabled = false;
    if (permission === 'granted') {
      enabled = isProtectedFrontendPath() ? await setupPushIfNeeded({ permission }) : await setupPublicPush({ permission });
    }
    if (enabled || permission === 'denied') {
      button.remove();
      return;
    }
    button.disabled = false;
    button.style.opacity = '1';
  });
  document.body.appendChild(button);
}

async function initializePushForCurrentPage() {
  if (!pushSupported()) return;
  if (Notification.permission === 'granted' && isProtectedFrontendPath()) {
    await setupPushIfNeeded({ permission: 'granted' });
    return;
  }
  if (Notification.permission === 'default') addNotificationButton();
}

/** Call from login flow so the browser prompts for notifications */
async function promptNotificationsOnLogin() {
  try {
    if (!pushSupported()) return false;
    const permission = await requestPushPermission();
    if (permission === 'granted') {
      return await setupPushIfNeeded({ permission: 'granted' });
    }
    return false;
  } catch (error) {
    console.warn('Login push prompt failed:', error.message);
    return false;
  }
}

function bindLogoutControls() {
  document.addEventListener('submit', async (event) => {
    const form = event.target.closest('form[data-auth-logout], form[action*="/logout"], form[action="logout"]');
    if (!form) return;
    event.preventDefault();
    await logout();
  });
  document.addEventListener('click', async (event) => {
    const control = event.target.closest('[data-auth-logout], a[href*="/logout"]');
    if (!control) return;
    event.preventDefault();
    await logout();
  });
}


/** Fill common header/sidebar dynamic bits on user pages */
async function loadNavChrome() {
  try {
    if (typeof api === 'undefined') return null;
    var meRes = await api.get('/auth/me');
    var user = (meRes && meRes.data) || {};
    // If nested
    if (user.user) user = user.user;
    var name = user.name || [user.first_name, user.last_name].filter(Boolean).join(' ') || 'User';
    document.querySelectorAll('.userDisplayName').forEach(function (el) { el.textContent = name; });
    document.querySelectorAll('.userTier').forEach(function (el) {
      el.textContent = user.account_tier || user.account_status || 'Tier 1';
    });
    if (user.image) {
      document.querySelectorAll('#headerAvatar, #menuAvatar, img[alt="User"]').forEach(function (img) {
        img.src = user.image;
      });
    }
    // notification badge
    try {
      var nRes = await api.get('/user/dashboard/notifications');
      var nData = (nRes && nRes.data) || {};
      var count = nData.unreadCount || 0;
      document.querySelectorAll('#notifBadge, .notifBadge').forEach(function (badge) {
        if (count > 0) {
          badge.textContent = count;
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      });
    } catch (e) {}
    return user;
  } catch (e) {
    return null;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  bindLogoutControls();
  const allowed = await protectCurrentFrontendPage();
  if (!allowed) return;
  await loadNavChrome();
  await initializePushForCurrentPage();
});


// Expose helpers for page scripts
window.SwiftPurseAuth = {
  isLoggedIn,
  getCurrentUser,
  logout,
  requireAuthPage,
  requireAdmin,
  promptNotificationsOnLogin,
  requestPushPermission,
  setupPushIfNeeded,
  setupPublicPush,
  initializePushForCurrentPage,
  loadNavChrome,
};
