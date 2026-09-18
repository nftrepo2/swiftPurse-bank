// SwiftPurse frontend API configuration (axios-like + helpers)
(function (global) {
  // Production backend (separate Render service). Override with window.API_BASE if needed.
  var DEFAULT_BACKEND = 'https://swiftpurse-backend.onrender.com';

  function resolveApiBase() {
    if (typeof window === 'undefined') return DEFAULT_BACKEND;

    if (window.API_BASE && String(window.API_BASE).trim()) {
      return String(window.API_BASE).trim().replace(/\/$/, '');
    }

    var meta = typeof document !== 'undefined'
      ? document.querySelector('meta[name="api-base"]')
      : null;
    if (meta && meta.content && String(meta.content).trim()) {
      return String(meta.content).trim().replace(/\/$/, '');
    }

    try {
      var stored = localStorage.getItem('API_BASE');
      if (stored && String(stored).trim()) {
        return String(stored).trim().replace(/\/$/, '');
      }
    } catch (e) {}

    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      // Prefer local API when developing; fall back to hosted backend
      return 'http://127.0.0.1:3000';
    }

    // Separate frontend/backend on Render: always use backend URL
    return DEFAULT_BACKEND;
  }

  var API_BASE = resolveApiBase();

  function getToken() {
    try {
      return localStorage.getItem('baUid') || localStorage.getItem('token') || '';
    } catch (e) {
      return '';
    }
  }

  function setToken(token) {
    try {
      if (token) {
        localStorage.setItem('baUid', token);
        localStorage.setItem('token', token);
      } else {
        localStorage.removeItem('baUid');
        localStorage.removeItem('token');
      }
    } catch (e) {}
  }

  function clearAuth() {
    try {
      ['baUid', 'token', 'user', 'tempbaUid', 'sbaUid', 'pendingPushSubscription'].forEach(function (k) {
        localStorage.removeItem(k);
      });
    } catch (e) {}
  }

  function getUser() {
    try {
      var u = localStorage.getItem('user');
      return u ? JSON.parse(u) : null;
    } catch (e) {
      return null;
    }
  }

  function setUser(user) {
    try {
      if (user) localStorage.setItem('user', JSON.stringify(user));
      else localStorage.removeItem('user');
    } catch (e) {}
  }

  async function request(method, path, body, options) {
    options = options || {};
    if (!API_BASE) {
      var cfgErr = new Error('API_BASE is not configured');
      cfgErr.status = 0;
      cfgErr.data = { message: cfgErr.message };
      throw cfgErr;
    }

    var headers = Object.assign({ Accept: 'application/json' }, options.headers || {});
    var token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    var isForm = (typeof FormData !== 'undefined') && body instanceof FormData;
    if (body != null && !isForm) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }

    var url = API_BASE + (path.charAt(0) === '/' ? path : '/' + path);

    var res;
    try {
      res = await fetch(url, {
        method: method,
        headers: headers,
        credentials: 'include',
        body: body == null ? undefined : (isForm ? body : JSON.stringify(body)),
      });
    } catch (networkErr) {
      var err = new Error('Network error – cannot reach API at ' + API_BASE);
      err.status = 0;
      err.data = { message: err.message };
      throw err;
    }

    var text = await res.text();
    var data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      data = { raw: text, message: 'Invalid JSON from server (check API_BASE / CORS)' };
    }

    if (!res.ok) {
      var err2 = new Error((data && (data.message || data.error)) || res.statusText || 'Request failed');
      err2.status = res.status;
      err2.response = { status: res.status, data: data };
      err2.data = data;
      throw err2;
    }

    if (data == null) data = {};
    return { data: data, status: res.status };
  }

  var api = {
    get: function (path, options) { return request('GET', path, null, options); },
    post: function (path, body, options) { return request('POST', path, body, options); },
    put: function (path, body, options) { return request('PUT', path, body, options); },
    patch: function (path, body, options) { return request('PATCH', path, body, options); },
    delete: function (path, options) { return request('DELETE', path, null, options); },
  };

  // Returns body directly; never null so callers can safely use data.token / data.user
  async function apiLegacy(path, options) {
    options = options || {};
    var method = (options.method || 'GET').toUpperCase();
    var body = options.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) {}
    }
    var result = await request(method, path, body, options);
    return result.data != null ? result.data : {};
  }

  global.api = api;
  global.SwiftPurse = {
    API_BASE: API_BASE,
    api: apiLegacy,
    getToken: getToken,
    setToken: setToken,
    clearAuth: clearAuth,
    getUser: getUser,
    setUser: setUser
  };

  if (typeof console !== 'undefined' && console.info) {
    console.info('[SwiftPurse] API_BASE =', API_BASE);
  }
})(typeof window !== 'undefined' ? window : globalThis);
