// ── Shared State ──────────────────────────────────────────────────────────────

// ── Compass Spinner ───────────────────────────────────────────────────────────
// Returns inline SVG compass rose — use spinnerHTML() instead of spinnerHTML()
function spinnerHTML(size) {
  size = size || 18;
  var h = size, c = size / 2, p1 = size * 0.47, p2 = size * 0.14, p3 = size * 0.08;
  return '<svg class="spinner-svg" width="' + h + '" height="' + h + '" viewBox="0 0 ' + h + ' ' + h + '" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
    + '<polygon points="' + c + ',' + (c - p1) + ' ' + (c + p2) + ',' + (c - p3) + ' ' + c + ',' + (c + p3*0.6) + ' ' + (c - p2) + ',' + (c - p3) + '" fill="var(--accent)"/>'
    + '<polygon points="' + c + ',' + (c + p1) + ' ' + (c + p2) + ',' + (c + p3) + ' ' + c + ',' + (c - p3*0.6) + ' ' + (c - p2) + ',' + (c + p3) + '" fill="var(--sub)"/>'
    + '<polygon points="' + (c - p1) + ',' + c + ' ' + (c - p3) + ',' + (c + p2) + ' ' + (c + p3*0.6) + ',' + c + ' ' + (c - p3) + ',' + (c - p2) + '" fill="var(--sub)"/>'
    + '<polygon points="' + (c + p1) + ',' + c + ' ' + (c + p3) + ',' + (c + p2) + ' ' + (c - p3*0.6) + ',' + c + ' ' + (c + p3) + ',' + (c - p2) + '" fill="var(--sub)"/>'
    + '<circle cx="' + c + '" cy="' + c + '" r="' + (size * 0.07) + '" fill="var(--accent)"/>'
    + '</svg>';
}

var APPS = [];
var JOBS = [];

var STATUS_CFG = {
  'Applied':                  { color: '#2563eb', bg: '#dbeafe' },
  'Screening':                { color: '#7c3aed', bg: '#ede9fe' },
  'Interviewing':             { color: '#059669', bg: '#d1fae5' },
  'Offer':                    { color: '#d97706', bg: '#fef3c7' },
  'Closed — Rejected':        { color: '#dc2626', bg: '#fee2e2' },
  'Closed — Role Filled':     { color: '#dc2626', bg: '#fee2e2' },
  'Closed — Auto-Reject':     { color: '#6b7280', bg: '#f3f4f6' },
  'Closed — Position Closed': { color: '#6b7280', bg: '#f3f4f6' },
  'Closed — Pass':            { color: '#6b7280', bg: '#f3f4f6' },
  'Closed — No Response':     { color: '#6b7280', bg: '#f3f4f6' },
};

// ── Shared Utilities ───────────────────────────────────────────────────────────
function badge(status) {
  var cfg = STATUS_CFG[status];
  if (!cfg && status && status.toLowerCase().includes('closed')) {
    cfg = { color: '#dc2626', bg: '#fee2e2' };
  }
  if (!cfg) cfg = STATUS_CFG['Applied'];
  return '<span class="badge" style="color:' + cfg.color + ';background:' + cfg.bg + '">' + (status || '—') + '</span>';
}

function kpiCard(icon, num, label, color) {
  var bgColor = color + '15';
  return '<div class="kpi-card">'
    + '<div class="kpi-icon" style="background:' + bgColor + ';color:' + color + '">' + icon + '</div>'
    + '<div class="kpi-content">'
    + '<div class="kpi-num" style="color:' + color + '">' + num + '</div>'
    + '<div class="kpi-label">' + label + '</div>'
    + '</div></div>';
}

function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function () { t.classList.remove('show'); }, 3000);
}


// ── Data ──────────────────────────────────────────────────────────────────────
function loadData() {
  return fetch('/api/data', { headers: getAuthHeaders() })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      APPS = Array.isArray(d.applications) ? d.applications : [];
      JOBS = Array.isArray(d.jobs) ? d.jobs : [];
      renderPipeline();
      renderScraper();
      restoreTab();
    })
    .catch(function (e) {
      document.getElementById('pane-pipeline').innerHTML =
        '<div class="error-box">⚠ Could not load data: ' + e.message + '</div>';
    });
}

function dbPatch(table, id, body) {
  return fetch('/api/data', {
    method: 'PATCH',
    headers: Object.assign({}, getAuthHeaders(), { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id: id, ...body })
  }).then(function (r) { return r.json(); });
}

// ── Tab Switching ─────────────────────────────────────────────────────────────
function switchTab(tab, btn) {
  ['pipeline', 'scraper', 'gmail', 'ats', 'profile'].forEach(function (t) {
    var el = document.getElementById('pane-' + t);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
  document.querySelectorAll('.tab').forEach(function (b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  if (tab === 'profile' && typeof renderProfilePane === 'function') renderProfilePane();
  try { localStorage.setItem('activeTab', tab); } catch (e) {}
}

function restoreTab() {
  var saved = '';
  try { saved = localStorage.getItem('activeTab') || ''; } catch (e) {}
  if (!saved) saved = 'pipeline';
  // Profile needs USER_PROFILE loaded — redirect to pipeline on hard refresh
  // User can re-open profile via avatar after data loads
  if (saved === 'profile') saved = 'pipeline';
  var btn = Array.from(document.querySelectorAll('.tab')).find(function (b) {
    return b.getAttribute('onclick') && b.getAttribute('onclick').includes("'" + saved + "'");
  });
  if (btn) switchTab(saved, btn);
  else switchTab('pipeline', document.querySelector('.tab'));
}

// ── Scraper Trigger ───────────────────────────────────────────────────────────
function triggerScraper(btn) {
  btn.disabled = true;
  var orig = btn.innerHTML;
  btn.innerHTML = spinnerHTML() + ' Running...';

  fetch('/api/cron', {
    method: 'POST',
    headers: getAuthHeaders()
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      btn.disabled = false;
      btn.innerHTML = orig;
      showToast('Scraper running — check Leads in ~1 min');
      fetch('/api/data', { headers: getAuthHeaders() }).then(function (r) { return r.json(); }).then(function (d) {
        JOBS = Array.isArray(d.jobs) ? d.jobs : [];
        renderScraper();
      });
    })
    .catch(function (err) {
      btn.disabled = false;
      btn.innerHTML = orig;
      showToast('Scraper error: ' + err.message);
    });
}

// ── Init ──────────────────────────────────────────────────────────────────────
// initAuth in auth.js bootstraps session → onboarding → loadData
initAuth();


// ── Open profile ──────────────────────────────────────────────────────────────
function openProfile() {
  var dd = document.getElementById('profile-dropdown');
  if (dd) dd.classList.remove('open');
  ['pipeline','scraper','gmail','ats','profile'].forEach(function(t) {
    var el = document.getElementById('pane-' + t);
    if (el) el.style.display = t === 'profile' ? '' : 'none';
  });
  document.querySelectorAll('.tab').forEach(function(b) { b.classList.remove('active'); });
  try { localStorage.setItem('activeTab', 'profile'); } catch(e) {}
  if (typeof renderProfilePane === 'function') renderProfilePane();
}

// ── Profile dropdown ──────────────────────────────────────────────────────────
function toggleProfileDropdown(e) {
  if (e) e.stopPropagation();
  var dd = document.getElementById('profile-dropdown');
  if (!dd) return;
  dd.classList.toggle('open');
}

// Close dropdown on outside click
document.addEventListener('click', function(e) {
  var dd = document.getElementById('profile-dropdown');
  if (!dd || !dd.classList.contains('open')) return;
  var btn = document.getElementById('profile-avatar-btn');
  if (btn && btn.contains(e.target)) return; // handled by toggle
  if (!dd.contains(e.target)) {
    dd.classList.remove('open');
  }
});

// Populate dropdown header from profile
function updateProfileDropdown(profile) {
  if (!profile) return;
  var name = document.getElementById('pd-name');
  var sub  = document.getElementById('pd-sub');
  if (name) name.textContent = profile.full_name || '—';
  if (sub) {
    var intent = { exploring: 'Just exploring', active: 'Actively looking', urgent: 'Need a job now' };
    sub.textContent = (profile.seniority_level === 'ic' ? 'Individual Contributor' : profile.seniority_level || '') 
      + (profile.job_search_intent ? ' · ' + (intent[profile.job_search_intent] || '') : '');
  }
  if (profile.photo_url) {
    var avatarBtn = document.getElementById('profile-avatar-btn');
    if (avatarBtn) avatarBtn.innerHTML = '<img src="' + profile.photo_url + '" alt="profile">';
    var pdAvatar = document.getElementById('pd-avatar');
    if (pdAvatar) pdAvatar.innerHTML = '<img src="' + profile.photo_url + '" alt="profile">';
  }
}

