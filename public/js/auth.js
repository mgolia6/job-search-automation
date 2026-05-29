// public/js/auth.js — Supabase Auth, session management, login/signup UI

var SUPABASE_URL  = 'https://yaepgxsbjtbdkiidxtmf.supabase.co';
var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhZXBneHNianRiZGtpaWR4dG1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNzI4MjksImV4cCI6MjA5NDk0ODgyOX0.UXNAz76lwghgFuC9QLsuVEPq6Njoq1nwLLkEsOQXl0U';

// Session token — all API calls use this
window.SESSION_TOKEN = null;
window.SESSION_USER  = null;

function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + window.SESSION_TOKEN
  };
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function initAuth() {
  // Check for existing session via Supabase REST
  const stored = localStorage.getItem('sb_session');
  if (stored) {
    try {
      const session = JSON.parse(stored);
      // Verify it's not expired
      if (session.expires_at && session.expires_at * 1000 > Date.now()) {
        window.SESSION_TOKEN = session.access_token;
        window.SESSION_USER  = session.user;
        await onAuthenticated();
        return;
      }
      // Try refresh
      if (session.refresh_token) {
        const refreshed = await refreshSession(session.refresh_token);
        if (refreshed) {
          await onAuthenticated();
          return;
        }
      }
    } catch(e) {}
    localStorage.removeItem('sb_session');
  }
  showAuthScreen();
}

async function refreshSession(refreshToken) {
  try {
    const r = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    if (!r.ok) return false;
    const data = await r.json();
    if (data.access_token) {
      saveSession(data);
      return true;
    }
    return false;
  } catch(e) { return false; }
}

function saveSession(data) {
  window.SESSION_TOKEN = data.access_token;
  window.SESSION_USER  = data.user;
  localStorage.setItem('sb_session', JSON.stringify({
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_at:    data.expires_at || (Math.floor(Date.now()/1000) + 3600),
    user:          data.user
  }));
}

async function onAuthenticated() {
  hideAuthScreen();
  // Delegate to onboarding flow — it checks profile and routes appropriately
  checkOnboarding();
}

function signOut() {
  localStorage.removeItem('sb_session');
  window.SESSION_TOKEN = null;
  window.SESSION_USER  = null;
  showAuthScreen();
  // Reset UI
  document.querySelector('main').style.display = 'none';
}

// ── Auth Screen ───────────────────────────────────────────────────────────────
function showAuthScreen() {
  document.querySelector('main').style.display = 'none';
  document.getElementById('onboarding-overlay').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
  renderAuthForm('login');
}

function hideAuthScreen() {
  document.getElementById('auth-screen').style.display = 'none';
  document.querySelector('main').style.display = '';
}

function renderAuthForm(mode) {
  var isLogin = mode === 'login';
  document.getElementById('auth-screen').innerHTML =
    '<div class="auth-card">' +
      '<div class="auth-logo">⚡ Job Odyssey</div>' +
      '<div class="auth-tagline">Your search. Charted.</div>' +
      '<div class="auth-tabs">' +
        '<button class="auth-tab ' + (isLogin ? 'active' : '') + '" onclick="renderAuthForm(\'login\')">Sign In</button>' +
        '<button class="auth-tab ' + (!isLogin ? 'active' : '') + '" onclick="renderAuthForm(\'signup\')">Create Account</button>' +
      '</div>' +
      '<div id="auth-error" class="auth-error" style="display:none"></div>' +
      (isLogin ? '' :
        '<input id="auth-name" class="auth-input" type="text" placeholder="Full name" />'
      ) +
      '<input id="auth-email" class="auth-input" type="email" placeholder="Email address" />' +
      '<input id="auth-password" class="auth-input" type="password" placeholder="' + (isLogin ? 'Password' : 'Create a password (min 8 chars)') + '" />' +
      '<button class="btn btn-primary auth-btn" onclick="' + (isLogin ? 'doLogin' : 'doSignup') + '(this)">' +
        (isLogin ? 'Sign In' : 'Create Account') +
      '</button>' +
      (isLogin ?
        '<div class="auth-link" onclick="doForgotPassword()">Forgot password?</div>' : ''
      ) +
    '</div>';
}

function showAuthError(msg) {
  var el = document.getElementById('auth-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

async function doLogin(btn) {
  var email    = document.getElementById('auth-email').value.trim();
  var password = document.getElementById('auth-password').value;
  if (!email || !password) return showAuthError('Email and password required');

  btn.disabled = true;
  btn.textContent = 'Signing in…';

  try {
    const r = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON },
      body: JSON.stringify({ email, password })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error_description || data.msg || 'Login failed');
    saveSession(data);
    await onAuthenticated();
  } catch(e) {
    showAuthError(e.message);
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

async function doSignup(btn) {
  var name     = (document.getElementById('auth-name')?.value || '').trim();
  var email    = document.getElementById('auth-email').value.trim();
  var password = document.getElementById('auth-password').value;
  if (!email || !password) return showAuthError('Email and password required');
  if (password.length < 8) return showAuthError('Password must be at least 8 characters');

  btn.disabled = true;
  btn.textContent = 'Creating account…';

  try {
    const r = await fetch(SUPABASE_URL + '/auth/v1/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON },
      body: JSON.stringify({ email, password, data: { full_name: name } })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error_description || data.msg || 'Signup failed');

    if (data.access_token) {
      // Auto-confirmed
      saveSession(data);
      await onAuthenticated();
    } else {
      // Email confirmation required
      document.getElementById('auth-screen').innerHTML =
        '<div class="auth-card">' +
          '<div class="auth-logo">✉️ Check your email</div>' +
          '<div class="auth-tagline">We sent a confirmation link to <strong>' + email + '</strong>. Click it to activate your account, then come back to sign in.</div>' +
          '<button class="btn btn-primary auth-btn" onclick="renderAuthForm(\'login\')">Back to Sign In</button>' +
        '</div>';
    }
  } catch(e) {
    showAuthError(e.message);
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
}

async function doForgotPassword() {
  var email = document.getElementById('auth-email').value.trim();
  if (!email) return showAuthError('Enter your email address first');

  try {
    const r = await fetch(SUPABASE_URL + '/auth/v1/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON },
      body: JSON.stringify({ email })
    });
    if (!r.ok) throw new Error('Failed to send reset email');
    document.getElementById('auth-screen').innerHTML =
      '<div class="auth-card">' +
        '<div class="auth-logo">✉️ Check your email</div>' +
        '<div class="auth-tagline">We sent a password reset link to <strong>' + email + '</strong>.</div>' +
        '<button class="btn btn-primary auth-btn" onclick="renderAuthForm(\'login\')">Back to Sign In</button>' +
      '</div>';
  } catch(e) {
    showAuthError(e.message);
  }
}
