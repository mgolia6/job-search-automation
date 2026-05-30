// ── Opportunities State ───────────────────────────────────────────────────────
var SCRAPER_FILTER = 'all';
var expandedJD = {};
var SCRAPER_SORT = 'ote';
var expandedRecon = {};

// ── Render ────────────────────────────────────────────────────────────────────
function renderScraper() {
  renderFilterSummary();
  var el = document.getElementById('scraper-content');
  if (!el) return;

  var activeJobs   = JOBS.filter(function (j) { return j.status !== 'dismissed'; });
  var newJobs      = activeJobs.filter(function (j) { return j.status === 'new' || !j.status; });
  var backlogJobs  = activeJobs.filter(function (j) { return j.status === 'backlog'; });
  var dismissedJobs = JOBS.filter(function (j) { return j.status === 'dismissed'; });

  var weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  var newThisWeek = activeJobs.filter(function (j) {
    return j.scraped_at && new Date(j.scraped_at) > weekAgo;
  }).length;

  var jobsWithOTE = activeJobs.filter(function (j) { return j.estimated_ote; });
  var avgOTE = jobsWithOTE.length > 0
    ? Math.round(jobsWithOTE.reduce(function (sum, j) { return sum + j.estimated_ote; }, 0) / jobsWithOTE.length)
    : 0;
  var highValueCount = activeJobs.filter(function (j) { return j.estimated_ote >= 300000; }).length;

  // KPIs
  var iconInfo   = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
  var iconWave   = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>';
  var iconDollar = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>';
  var iconHigh   = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>';
  var iconX      = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>';

  var addedJobs = JOBS.filter(function(j) { return j.status === 'added'; });

  var kpiEl = document.getElementById('scraper-kpis');
  if (kpiEl) {
    kpiEl.innerHTML =
      kpiCard(iconInfo,   activeJobs.length,   'New Leads',            '#3b82f6') +
      kpiCard(iconWave,   newThisWeek,         'Added This Week',      '#10b981') +
      kpiCard(iconDollar, avgOTE > 0 ? '$' + Math.round(avgOTE / 1000) + 'K' : '—', 'Avg Est OTE', '#f59e0b') +
      kpiCard(iconHigh,   addedJobs.length,    'Added to Pipeline',    '#8b5cf6') +
      kpiCard(iconX,      dismissedJobs.length,'Dismissed',            '#64748b');
  }

  if (!JOBS.length) {
    el.innerHTML = '<div style="text-align:center;padding:48px;color:var(--muted)">No leads yet — hit Generate Leads to find matching roles.</div>';
    return;
  }

  // Tier buckets
  var tier1       = activeJobs.filter(function (j) { return j.estimated_ote >= 300000; });
  var tier2       = activeJobs.filter(function (j) { return j.estimated_ote >= 250000 && j.estimated_ote < 300000; });
  var tier3       = activeJobs.filter(function (j) { return j.estimated_ote >= 200000 && j.estimated_ote < 250000; });
  var tierUnknown = activeJobs.filter(function (j) { return !j.estimated_ote; });

  var filtered = activeJobs;
  if (SCRAPER_FILTER === '300k')    filtered = tier1;
  else if (SCRAPER_FILTER === '250k')  filtered = tier2;
  else if (SCRAPER_FILTER === '200k')  filtered = tier3;
  else if (SCRAPER_FILTER === 'unknown') filtered = tierUnknown;
  else if (SCRAPER_FILTER === 'backlog') filtered = backlogJobs;
  else if (SCRAPER_FILTER === 'dismissed') filtered = dismissedJobs;

  // Sort
  filtered.sort(function (a, b) {
    if (SCRAPER_SORT === 'ote') return (b.estimated_ote || 0) - (a.estimated_ote || 0);
    return new Date(b.scraped_at || 0) - new Date(a.scraped_at || 0);
  });

  // Sub-tabs
  var html = '<div class="sub-tabs" id="opp-sub-tabs">'
    + oppTab('all',       'Active (' + activeJobs.length + ')',     SCRAPER_FILTER === 'all')
    + oppTab('300k',      '$300K+ (' + tier1.length + ')',         SCRAPER_FILTER === '300k')
    + oppTab('250k',      '$250K–$300K (' + tier2.length + ')',    SCRAPER_FILTER === '250k')
    + oppTab('200k',      '$200K–$250K (' + tier3.length + ')',    SCRAPER_FILTER === '200k')
    + oppTab('unknown',   'Unknown (' + tierUnknown.length + ')',  SCRAPER_FILTER === 'unknown')
    + '<div class="tab-divider"></div>'
    + oppTab('backlog',   'Backlog (' + backlogJobs.length + ')',  SCRAPER_FILTER === 'backlog')
    + oppTab('dismissed', 'Dismissed',                             SCRAPER_FILTER === 'dismissed')
    + '</div>';

  // Sort controls
  html += '<div class="scraper-controls">'
    + '<button class="filter-btn' + (SCRAPER_SORT === 'ote'  ? ' active' : '') + '" onclick="setScraperSort(\'ote\')">Sort: OTE</button>'
    + '<button class="filter-btn' + (SCRAPER_SORT === 'date' ? ' active' : '') + '" onclick="setScraperSort(\'date\')">Sort: Date</button>'
    + '</div>';

  // Cards
  if (!filtered.length) {
    html += '<div style="text-align:center;padding:48px;color:var(--muted)">No jobs in this tier.</div>';
  } else {
    html += '<div class="job-cards">' + filtered.map(renderJobCard).join('') + '</div>';
  }

  el.innerHTML = html;
}

function oppTab(key, label, isActive) {
  return '<button class="sub-tab' + (isActive ? ' active' : '') + '" onclick="setScraperFilter(\'' + key + '\')">' + label + '</button>';
}

function setScraperFilter(f) {
  SCRAPER_FILTER = f;
  document.querySelectorAll('#opp-sub-tabs .sub-tab').forEach(function (t) { t.classList.remove('active'); });
  event.target.classList.add('active');
  renderScraper();
}

function setScraperSort(s) { SCRAPER_SORT = s; renderScraper(); }

// ── Job Card ──────────────────────────────────────────────────────────────────
function getTierBadge(ote) {
  if (!ote) return '<span class="tier-badge tier-unknown">Unknown OTE</span>';
  if (ote >= 300000) return '<span class="tier-badge tier-high">$300K+ OTE</span>';
  if (ote >= 250000) return '<span class="tier-badge tier-med">$250K–$300K OTE</span>';
  if (ote >= 200000) return '<span class="tier-badge tier-low">$200K–$250K OTE</span>';
  return '<span class="tier-badge tier-unknown">Unknown OTE</span>';
}

function renderJobCard(j) {
  var jobId      = j.job_id;
  var isExpanded = expandedRecon[jobId];
  var isBacklog  = j.status === 'backlog';
  var isDismissed = j.status === 'dismissed';
  var date       = j.scraped_at ? new Date(j.scraped_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
  var baseSalary = j.base_salary ? '$' + Math.round(j.base_salary / 1000) + 'K' : 'Not listed';
  var ote        = j.estimated_ote ? '$' + Math.round(j.estimated_ote / 1000) + 'K' : 'Unknown';
  var tierBadge  = getTierBadge(j.estimated_ote);
  var statusBadge = isBacklog
    ? '<span class="status-badge status-backlog">Backlogged</span>'
    : isDismissed ? '<span class="status-badge status-dismissed">Dismissed</span>' : '';

  var jobJson = JSON.stringify(j).replace(/'/g, "\\'");

  var card = '<div class="job-card-new' + (isBacklog ? ' backlogged' : '') + (isDismissed ? ' dismissed' : '') + '">'
    + '<div class="job-card-header">'
    + '<div class="job-card-co">' + (j.company || '') + ' ' + tierBadge + ' ' + statusBadge + '</div>'
    + '<div class="job-card-title">' + (j.title || '') + '</div>'
    + '<div class="job-card-source">Source: ' + (j.source || 'Unknown') + '</div>'
    + '</div>';

  if (j.justification) {
    card += '<div class="job-justification"><strong>Reason:</strong> ' + j.justification + '</div>';
  }

  card += '<div class="job-card-meta">'
    + '<div class="meta-row"><span class="meta-label">Base:</span> <span class="meta-value">' + baseSalary + '</span></div>'
    + '<div class="meta-row"><span class="meta-label">Est OTE:</span> <span class="meta-value ote">' + ote + '</span></div>'
    + '<div class="meta-row"><span class="meta-label">Location:</span> <span class="meta-value">' + (j.location || 'Remote') + '</span></div>'
    + '<div class="meta-row"><span class="meta-label">Posted:</span> <span class="meta-value">' + date + '</span></div>'
    + '</div>'
    + '<div class="recon-toggle" onclick="toggleRecon(\'' + jobId + '\')">'
    + (isExpanded ? '▼' : '▶') + ' Company Recon'
    + '</div>'
    + (isExpanded ? renderReconSection(j) : '');

  // JD section — lazy fetch full description, collapsed by default
  var jdId = 'jd-' + jobId;
  var jdExpanded = expandedJD[jobId] || false;
  card += '<div class="recon-toggle" onclick="toggleJD(\'' + jobId + '\')">'    + (jdExpanded ? '▼' : '▶') + ' Job Description'    + (j.full_description ? '' : ' <span style="color:#94a3b8;font-size:0.8em;">(fetching...)</span>')    + '</div>';  if (jdExpanded) {    if (j.full_description) {      card += '<div class="recon-section" id="' + jdId + '" style="white-space:pre-wrap;font-size:0.85em;color:#cbd5e1;max-height:400px;overflow-y:auto;">'        + j.full_description.slice(0, 5000)        + '</div>';    } else {      card += '<div class="recon-section" id="' + jdId + '"><div class="recon-loading">Loading job description...</div></div>';    }  }

  if (!isDismissed) {
    card += '<div class="job-card-actions">'
      + '<button class="action-btn action-pipeline" onclick="jobAction(event, \'' + jobId + '\', \'add_to_pipeline\', ' + jobJson + ')">Add to Pipeline</button>'
      + (!isBacklog ? '<button class="action-btn action-backlog" onclick="promptJobAction(event, \'' + jobId + '\', \'backlog\')">Backlog</button>' : '')
      + '<button class="action-btn action-dismiss" onclick="promptJobAction(event, \'' + jobId + '\', \'dismiss\')">Not a Fit</button>'
      + '<button class="action-btn action-ats" onclick="scoreWithATS(event, \'' + jobId + '\')">'
        + (j.ats_score ? '✓ ' + j.ats_score + '%' : 'Score → ATS')
        + '</button>'
      + (j.apply_url ? '<a href="' + j.apply_url + '" target="_blank" class="action-btn action-apply">Apply →</a>' : '')
      + '</div>';
  } else {
    card += '<div class="job-card-actions">'
      + '<a href="' + (j.apply_url || '#') + '" target="_blank" class="action-btn action-apply">View Posting →</a>'
      + '</div>';
  }

  return card + '</div>';
}

// ── Recon ─────────────────────────────────────────────────────────────────────
function renderReconSection(j) {
  var careersUrl = 'https://' + (j.company || '').toLowerCase().replace(/\s+/g, '') + '.com/careers';
  var reconId = 'recon-' + j.job_id;

  if (!j.recon_data) {
    setTimeout(function () { fetchReconData(j.job_id, j.company); }, 100);
    return '<div class="recon-section" id="' + reconId + '">'
      + '<div class="recon-loading">Loading company data...</div>'
      + '<button class="recon-btn" onclick="fetchGlassdoor(\'' + j.job_id + '\', \'' + j.company + '\')">Check Glassdoor</button>'
      + '</div>';
  }

  var repvue    = j.recon_data.repvue || {};
  var glassdoor = j.recon_data.glassdoor || {};

  var verdictColor = { green: '#22c55e', yellow: '#f59e0b', red: '#ef4444' }[repvue.verdict] || '#94a3b8';
  var verdictDot = '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + verdictColor + ';margin-right:6px;"></span>';

  return '<div class="recon-section" id="' + reconId + '">'
    + '<div class="recon-row">' + verdictDot + '<strong>' + (repvue.verdict || 'unknown').toUpperCase() + '</strong> — '
    + (repvue.quotaAttainment ? repvue.quotaAttainment + '% quota attainment' : repvue.rating ? repvue.rating + '/5 rating' : 'limited data')
    + ' <a href="' + repvue.url + '" target="_blank" class="recon-link">RepVue →</a>'
    + '</div>'
    + (repvue.summary ? '<div class="recon-row" style="color:#94a3b8;font-size:0.85em;line-height:1.4;">' + repvue.summary + '</div>' : '')
    + '<div class="recon-row">'
    + '<a href="' + glassdoor.url + '" target="_blank" class="recon-link">Glassdoor →</a>'
    + ' &nbsp; <a href="' + careersUrl + '" target="_blank" class="recon-link">Careers →</a>'
    + '</div>'
    + (j.ats_score ? '<div class="recon-row" style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1);">'      + '<strong>ATS Score:</strong> <span style="color:' + (j.ats_score >= 70 ? '#22c55e' : j.ats_score >= 50 ? '#f59e0b' : '#ef4444') + ';font-weight:700;">' + j.ats_score + '%</span>'      + (j.ats_jd_source === 'snippet' ? ' <span style="color:#94a3b8;font-size:0.8em;">(scored on snippet — open JD for full accuracy)</span>' : ' <span style="color:#94a3b8;font-size:0.8em;">(full JD)</span>')      + (j.ats_missing_keywords && j.ats_missing_keywords.length ? '<div style="color:#94a3b8;font-size:0.82em;margin-top:4px;">Missing: ' + j.ats_missing_keywords.slice(0,6).join(', ') + '</div>' : '')      + '</div>' : '')    + '</div>';
}

function toggleRecon(jobId) {
  expandedRecon[jobId] = !expandedRecon[jobId];
  renderScraper();
}

function toggleJD(jobId) {
  expandedJD[jobId] = !expandedJD[jobId];
  var job = JOBS.find(function(j) { return j.job_id === jobId; });
  renderScraper();
  // Lazy fetch full JD if not yet stored
  if (expandedJD[jobId] && job && !job.full_description && job.apply_url) {
    fetchAndStoreJD(job);
  }
}

function fetchAndStoreJD(job) {
  fetch('/api/ats-scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + window.SESSION_TOKEN },
    body: JSON.stringify({ action: 'fetch_jd', jd: '', url: job.apply_url })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (!data.ok || !data.text || data.text.length < 100) {
      job.full_description = job.description || 'Could not fetch job description.';
    } else {
      job.full_description = data.text;
    }
    // Store to Supabase
    fetch(window.SUPABASE_URL + '/rest/v1/jobs?job_id=eq.' + encodeURIComponent(job.job_id), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': window.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + window.SESSION_TOKEN,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ full_description: job.full_description })
    });
    renderScraper();
  })
  .catch(function() {
    job.full_description = job.description || 'Could not fetch job description.';
    renderScraper();
  });
}

function fetchReconData(jobId, company) {
  fetch('/api/company-recon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ company: company })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.success) {
        var job = JOBS.find(function (j) { return j.job_id === jobId; });
        if (job) {
          job.recon_data = { repvue: data.repvue, glassdoor: data.glassdoor };
          renderScraper();
        }
      }
    })
    .catch(function (err) {
      var el = document.getElementById('recon-' + jobId);
      if (el) el.innerHTML = '<div class="recon-error">Failed to load company data</div>';
    });
}

function fetchGlassdoor(jobId, company) {
  var job = JOBS.find(function (j) { return j.job_id === jobId; });
  if (!job) return;
  var reconEl = document.getElementById('recon-' + jobId);
  if (!reconEl) return;
  var glassdoorRow = reconEl.querySelector('div:nth-child(3)');
  if (glassdoorRow) glassdoorRow.innerHTML = '<strong>Glassdoor:</strong> <em style="color:var(--muted)">Checking...</em>';

  fetch('/api/company-recon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ company: company })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.success && data.glassdoor) {
        if (!job.recon_data) job.recon_data = {};
        job.recon_data.glassdoor = data.glassdoor;
        if (glassdoorRow) {
          glassdoorRow.innerHTML = data.glassdoor.available
            ? '<strong>Glassdoor:</strong> ' + data.glassdoor.rating + '/5 <a href="' + data.glassdoor.url + '" target="_blank" class="recon-link">→</a>'
            : '<strong>Glassdoor:</strong> <span style="color:var(--muted)">Not found</span>';
        }
      }
    })
    .catch(function () {
      if (glassdoorRow) glassdoorRow.innerHTML = '<strong>Glassdoor:</strong> <span style="color:var(--red)">Error</span>';
    });
}

// ── Job Actions ───────────────────────────────────────────────────────────────
function promptJobAction(event, jobId, action) {
  if (action === 'dismiss') {
    showDismissModal(event, jobId);
  } else if (action === 'backlog') {
    var justification = prompt('Why backlog this role?');
    if (justification === null) return;
    if (!justification.trim()) { alert('Please provide a justification.'); return; }
    jobAction(event, jobId, action, null, justification);
  }
}

function showDismissModal(triggerEvent, jobId) {
  var modal = document.createElement('div');
  modal.className = 'dismiss-modal-overlay';
  modal.innerHTML = '<div class="dismiss-modal">'
    + '<h3>Why is this not a fit?</h3>'
    + '<select id="dismiss-reason" class="dismiss-select">'
    + '<option value="">Select a reason...</option>'
    + '<option>Location not aligned</option>'
    + '<option>Salary not aligned</option>'
    + '<option>Company size not aligned</option>'
    + '<option>Industry not aligned</option>'
    + '<option>Role too junior</option>'
    + '<option>Role too senior</option>'
    + '<option>Wrong sales motion (SMB/MM/ENT)</option>'
    + '<option>Product/service not interesting</option>'
    + '<option>Company health concerns</option>'
    + '<option>Other</option>'
    + '</select>'
    + '<textarea id="dismiss-notes" class="dismiss-notes" placeholder="Additional notes (optional)..."></textarea>'
    + '<div class="dismiss-actions">'
    + '<button class="dismiss-cancel" onclick="closeDismissModal()">Cancel</button>'
    + '<button class="dismiss-submit" onclick="submitDismiss(\'' + jobId + '\', event)">Dismiss</button>'
    + '</div>'
    + '</div>';
  document.body.appendChild(modal);
  modal.triggerEvent = triggerEvent;
}

function closeDismissModal() {
  var modal = document.querySelector('.dismiss-modal-overlay');
  if (modal) modal.remove();
}

function submitDismiss(jobId, submitEvent) {
  var reason = document.getElementById('dismiss-reason').value;
  var notes  = document.getElementById('dismiss-notes').value.trim();
  if (!reason) { alert('Please select a reason'); return; }
  var justification = notes ? reason + ': ' + notes : reason;
  var modal = document.querySelector('.dismiss-modal-overlay');
  var triggerEvent = modal ? modal.triggerEvent : submitEvent;
  closeDismissModal();
  jobAction(triggerEvent, jobId, 'dismiss', null, justification);
}

function jobAction(event, jobId, action, jobData, justification) {
  event.target.disabled = true;
  event.target.innerHTML = '' + spinnerHTML() + '';

  fetch('/api/job-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + window.SESSION_TOKEN },
    body: JSON.stringify({ action: action, jobId: jobId, jobData: jobData, justification: justification })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.success) {
        showToast(data.message);
        loadData();
      } else {
        showToast('Error: ' + (data.error || 'Unknown error'));
        event.target.disabled = false;
        event.target.innerHTML = event.target.textContent;
      }
    })
    .catch(function (err) {
      showToast('Failed: ' + err.message);
      event.target.disabled = false;
    });
}

// ── Filter summary ────────────────────────────────────────────────────────────
function renderFilterSummary() {
  var el = document.getElementById('scraper-filter-summary');
  if (!el) return;
  var p = window.USER_PROFILE;
  if (!p) { el.textContent = 'No profile set — complete onboarding to configure filters'; return; }

  var parts = [];

  // Titles
  var titles = p.target_titles && p.target_titles.length
    ? p.target_titles.join(', ')
    : null;
  if (titles) parts.push('<strong>Titles:</strong> ' + titles);

  // Salary
  if (p.salary_floor_base) {
    parts.push('<strong>Base min:</strong> $' + Number(p.salary_floor_base).toLocaleString());
  }
  if (p.salary_floor_ote) {
    parts.push('<strong>OTE min:</strong> $' + Number(p.salary_floor_ote).toLocaleString());
  }

  // Remote
  var remoteLabels = { remote: 'Remote only', hybrid: 'Hybrid', onsite: 'On-site', any: 'Any location' };
  if (p.remote_preference) parts.push('<strong>Work:</strong> ' + (remoteLabels[p.remote_preference] || p.remote_preference));

  // Locations
  if (p.target_locations && p.target_locations.length) {
    parts.push('<strong>Locations:</strong> ' + p.target_locations.join(', '));
  }

  el.innerHTML = parts.length
    ? parts.join(' &nbsp;·&nbsp; ')
    : 'No filters set — <a href="#" onclick="openProfile();return false;" style="color:var(--amber)">update your profile</a> to configure';
}



// ── ATS Score helper (shared by scoreWithATS and cached path) ─────────────
function doScoreWithJD(jdResult, job, resume, btn, forcedSource) {
  var jdText, jdSource;
  if (jdResult.ok && jdResult.text && jdResult.text.length > 100) {
    jdText = jdResult.text;
    jdSource = forcedSource || 'full';
  } else {
    jdText = job.description || '';
    jdSource = 'snippet';
  }

  if (!jdText || jdText.length < 20) {
    btn.textContent = 'No JD available';
    btn.disabled = false;
    return Promise.resolve();
  }

  btn.textContent = 'Scoring...';

  return fetch('/api/ats-scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + window.SESSION_TOKEN },
    body: JSON.stringify({ action: 'score', jd: jdText, resume: resume, company: job.company, role: job.title })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (!data.ok || !data.result) throw new Error(data.error || 'Score failed');
    var score = data.result.overall_score || data.result.score;
    var missing = data.result.missing_hard || data.result.missing_keywords || [];

    return fetch(window.SUPABASE_URL + '/rest/v1/jobs?job_id=eq.' + encodeURIComponent(job.job_id), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': window.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + window.SESSION_TOKEN,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        ats_score: score,
        ats_missing_keywords: missing,
        ats_analyzed_at: new Date().toISOString(),
        ats_jd_source: jdSource
      })
    })
    .then(function() {
      job.ats_score = score;
      job.ats_missing_keywords = missing;
      job.ats_jd_source = jdSource;
      renderScraper();
    });
  });
}


// ── ATS Scoring from Lead Card ─────────────────────────────────────────────
function scoreWithATS(e, jobId) {
  e.stopPropagation();
  var job = JOBS.find(function(j) { return j.job_id === jobId; });
  if (!job) return;

  var resume = window.USER_PROFILE && window.USER_PROFILE.resume_text;
  if (!resume) { alert('Upload your resume in Profile first.'); return; }

  var btn = e.target;
  btn.textContent = 'Fetching JD...';
  btn.disabled = true;

  var applyUrl = job.apply_url || '';

  // If we already have the full JD stored, use it directly
  if (job.full_description && job.full_description.length > 100) {
    btn.textContent = 'Scoring...';
    // Skip fetch_jd, go straight to scoring
    Promise.resolve({ ok: true, text: job.full_description })
      .then(function(jdResult) {
        return doScoreWithJD(jdResult, job, resume, btn, 'full');
      });
    return;
  }

  // Step 1: try to fetch full JD from ATS URL
  fetch('/api/ats-scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + window.SESSION_TOKEN },
    body: JSON.stringify({ action: 'fetch_jd', jd: '', url: applyUrl })
  })
  .then(function(r) { return r.json(); })
  .then(function(jdResult) {
    return doScoreWithJD(jdResult, job, resume, btn, null);
  })
  .catch(function(err) {
    console.error('[scoreWithATS]', err);
    btn.textContent = 'Score failed';
    btn.disabled = false;
  });
}


