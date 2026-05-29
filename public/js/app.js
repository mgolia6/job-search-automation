// ── Shared State ──────────────────────────────────────────────────────────────
var CRON_SECRET = 'cron_secret_matthew';
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

function spinnerHTML() {
  return '<span class="spinner"></span>';
}

// ── Data ──────────────────────────────────────────────────────────────────────
function loadData() {
  return fetch('/api/data')
    .then(function (r) { return r.json(); })
    .then(function (d) {
      APPS = Array.isArray(d.applications) ? d.applications : [];
      JOBS = Array.isArray(d.jobs) ? d.jobs : [];
      renderPipeline();
      renderScraper();
    })
    .catch(function (e) {
      document.getElementById('pane-pipeline').innerHTML =
        '<div class="error-box">⚠ Could not load data: ' + e.message + '</div>';
    });
}

function dbPatch(table, id, body) {
  return fetch('/api/data', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: id, ...body })
  }).then(function (r) { return r.json(); });
}

// ── Tab Switching ─────────────────────────────────────────────────────────────
function switchTab(tab, btn) {
  ['pipeline', 'scraper', 'gmail', 'ats'].forEach(function (t) {
    document.getElementById('pane-' + t).style.display = t === tab ? '' : 'none';
  });
  document.querySelectorAll('.tab').forEach(function (b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  try { localStorage.setItem('activeTab', tab); } catch (e) {}
}

function restoreTab() {
  var saved = '';
  try { saved = localStorage.getItem('activeTab') || ''; } catch (e) {}
  if (!saved) return;
  var btn = Array.from(document.querySelectorAll('.tab')).find(function (b) {
    return b.getAttribute('onclick') && b.getAttribute('onclick').includes("'" + saved + "'");
  });
  if (btn) switchTab(saved, btn);
}

// ── Scraper Trigger ───────────────────────────────────────────────────────────
function triggerScraper(btn) {
  btn.disabled = true;
  var orig = btn.innerHTML;
  btn.innerHTML = spinnerHTML() + ' Running...';

  fetch('/api/cron', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + CRON_SECRET }
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      btn.disabled = false;
      btn.innerHTML = orig;
      showToast('⚡ Scraper running — check Opportunities in ~1 min');
      if (data.success) {
        fetch('/api/data').then(function (r) { return r.json(); }).then(function (d) {
          JOBS = Array.isArray(d.jobs) ? d.jobs : [];
          renderScraper();
        });
      }
    })
    .catch(function (err) {
      btn.disabled = false;
      btn.innerHTML = orig;
      showToast('⚠ ' + err.message);
    });
}

// ── Init ──────────────────────────────────────────────────────────────────────
// Check for profile first — onboarding.js will call loadData() after completion
checkOnboarding();
restoreTab();
