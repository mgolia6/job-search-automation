// ── Pipeline State ────────────────────────────────────────────────────────────
var statusFilter = 'all';
var searchQ = '';
var currentApp = null;
var expandedRows = {};

// ── Render ────────────────────────────────────────────────────────────────────
function renderPipeline() {
  var total        = APPS.length;
  var active       = APPS.filter(function (a) { return !(a.status || '').includes('Closed'); });
  var interviewing = APPS.filter(function (a) { return a.status === 'Screening' || a.status === 'Interviewing'; });
  var offers       = APPS.filter(function (a) { return a.status === 'Offer'; });

  // Average age of active apps in days
  var avgAge = 0;
  var datedApps = active.filter(function (a) { return a.date_applied; });
  if (datedApps.length) {
    var totalDays = datedApps.reduce(function (sum, a) {
      return sum + Math.floor((Date.now() - new Date(a.date_applied).getTime()) / 86400000);
    }, 0);
    avgAge = Math.round(totalDays / datedApps.length);
  }

  var iconGrid = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>';
  var iconCheck = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
  var iconChat  = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var iconOffer = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
  var iconClock = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

  var html = '<div class="kpi-grid">'
    + kpiCard(iconGrid,  total,            'Total',              '#3b82f6')
    + kpiCard(iconCheck, active.length,    'Active',             '#10b981')
    + kpiCard(iconChat,  interviewing.length, 'Interviewing',    '#8b5cf6')
    + kpiCard(iconOffer, offers.length,    'Offers',             '#f59e0b')
    + kpiCard(iconClock, avgAge,           'Avg Age (days)',     '#64748b')
    + '</div>';

  // Sub-tabs
  html += '<div class="sub-tabs" id="pipeline-sub-tabs">'
    + pipelineTab('all',          'All',             statusFilter === 'all')
    + pipelineTab('active',       'Active',          statusFilter === 'active')
    + pipelineTab('interviewing', 'Interviewing',    statusFilter === 'interviewing')
    + pipelineTab('offers',       'Offers',          statusFilter === 'offers')
    + pipelineTab('closed',       'Closed',          statusFilter === 'closed')
    + '</div>';

  // Search
  html += '<div class="controls">'
    + '<input class="search" type="text" placeholder="Search company, role, contact..." '
    + 'oninput="filterApps(this.value)" value="' + searchQ + '">'
    + '</div>';

  // Table
  html += '<div class="table-wrap"><table>'
    + '<thead><tr><th class="col-num">#</th><th class="col-co">Company</th><th class="col-role hide-mobile">Role</th><th class="col-status">Status</th><th class="col-date hide-mobile">Applied</th><th class="col-sal hide-mobile">Salary</th><th class="col-warm hide-mobile">Contact</th><th class="col-edit"></th></tr></thead>'
    + '<tbody id="app-tbody"></tbody></table></div>';

  document.getElementById('pane-pipeline').innerHTML = html;
  renderRows();
}

function pipelineTab(key, label, isActive) {
  return '<button class="sub-tab' + (isActive ? ' active' : '') + '" onclick="setPipelineFilter(\'' + key + '\')">' + label + '</button>';
}

function setPipelineFilter(f) {
  statusFilter = f;
  document.querySelectorAll('#pipeline-sub-tabs .sub-tab').forEach(function (t) { t.classList.remove('active'); });
  event.target.classList.add('active');
  renderRows();
}

function filterApps(q) { searchQ = q; renderRows(); }

function renderRows() {
  var q = searchQ.toLowerCase();
  var filtered = APPS.filter(function (a) {
    var matchSearch = !q || [a.company, a.role, a.warm_contact, a.recruiter, a.notes]
      .some(function (f) { return (f || '').toLowerCase().indexOf(q) > -1; });

    var matchFilter;
    if (statusFilter === 'all')          matchFilter = true;
    else if (statusFilter === 'active')  matchFilter = !(a.status || '').includes('Closed');
    else if (statusFilter === 'interviewing') matchFilter = a.status === 'Screening' || a.status === 'Interviewing';
    else if (statusFilter === 'offers')  matchFilter = a.status === 'Offer';
    else if (statusFilter === 'closed')  matchFilter = (a.status || '').includes('Closed');
    else matchFilter = (a.status || '') === statusFilter;

    return matchSearch && matchFilter;
  });

  var tbody = document.getElementById('app-tbody');
  if (!tbody) return;

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">No matches.</td></tr>';
    return;
  }

  var html = '';
  filtered.forEach(function (a) {
    var rowId = 'row-' + a.app_number;
    var isExpanded = expandedRows[rowId];
    var date = a.date_applied
      ? new Date(a.date_applied).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
    var warm = (a.warm_contact && a.warm_contact !== 'None')
      ? '<span class="warm-cell">⚡ ' + a.warm_contact + '</span>' : '';
    var escaped = JSON.stringify(a).replace(/'/g, "\\'");

    html += '<tr class="app-row' + (isExpanded ? ' expanded' : '') + '" onclick="toggleRow(\'' + rowId + '\')" style="cursor:pointer">'
      + '<td class="num-cell">' + (a.app_number || '—') + '</td>'
      + '<td class="col-co"><div class="co-name">' + (a.company || '') + '</div><div class="co-sub-mobile">' + (a.role || '') + (a.salary_range ? ' · ' + a.salary_range : '') + '</div></td>'
      + '<td class="role-cell hide-mobile">' + (a.role || '') + '</td>'
      + '<td>' + badge(a.status) + '</td>'
      + '<td class="date-cell hide-mobile">' + date + '</td>'
      + '<td class="salary-cell hide-mobile">' + (a.salary_range || '—') + '</td>'
      + '<td class="hide-mobile">' + warm + '</td>'
      + '<td onclick="event.stopPropagation()"><button class="edit-btn" onclick=\'openModal(' + escaped + ')\'>Edit</button></td>'
      + '</tr>';

    if (isExpanded) {
      html += '<tr class="notes-row"><td colspan="8"><div class="notes-content">';
      html += '<div class="notes-mobile-role">' + (a.role || '') + '</div>';
      if (a.apply_url) {
        html += '<div class="notes-section"><a href="' + a.apply_url + '" target="_blank" class="job-link-btn">View Posting →</a></div>';
      }
      if (a.notes) {
        html += '<div class="notes-section"><span class="notes-label">' + (a.source === 'Scraper' ? 'Source info' : 'Notes') + ':</span> ' + a.notes + '</div>';
      }
      if (a.warm_contact && a.warm_contact !== 'None') {
        html += '<div class="notes-section"><span class="notes-label">Warm contact:</span> ⚡ ' + a.warm_contact + '</div>';
      }
      if (a.recruiter) {
        html += '<div class="notes-section"><span class="notes-label">Recruiter:</span> ' + a.recruiter + '</div>';
      }
      html += '</div></td></tr>';
    }
  });

  tbody.innerHTML = html;
}

function toggleRow(rowId) {
  expandedRows[rowId] = !expandedRows[rowId];
  renderRows();
}

// ── Edit Modal ────────────────────────────────────────────────────────────────
function openModal(a) {
  currentApp = a;
  document.getElementById('modal-title').textContent = a.company + ' — ' + a.role;
  document.getElementById('modal-status').value = a.status || 'Applied';
  document.getElementById('modal-notes').value = a.notes || '';
  document.getElementById('modal').classList.add('open');
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
  currentApp = null;
}

function saveModal() {
  if (!currentApp) return;
  var status = document.getElementById('modal-status').value;
  var notes  = document.getElementById('modal-notes').value;
  dbPatch('applications', currentApp.id, { status: status, notes: notes, updated_at: new Date() })
    .then(function () {
      var idx = APPS.findIndex(function (a) { return a.id === currentApp.id; });
      if (idx > -1) { APPS[idx].status = status; APPS[idx].notes = notes; }
      closeModal();
      renderPipeline();
      showToast('✓ Saved');
    })
    .catch(function (e) { showToast('⚠ Save failed: ' + e.message); });
}

