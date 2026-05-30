// ── Opportunities State ───────────────────────────────────────────────────────
var SCRAPER_FILTER = 'all';
var expandedJD = {};
var SCRAPER_SORT = 'ote';
var expandedRecon = {};
var FIT_RESULTS = {}; // jobId → { score, gaps, matched, verdict, jdText, jdSource }

// ── Compass Overlay Spinner ───────────────────────────────────────────────────
function showCompassSpinner(msg) {
  if (document.getElementById('compass-overlay')) return;
  var overlay = document.createElement('div');
  overlay.id = 'compass-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,15,28,0.82);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;backdrop-filter:blur(2px);';
  overlay.innerHTML = '<svg width="72" height="72" viewBox="0 0 72 72" style="animation:compassSpin 1.1s linear infinite;">'
    + '<circle cx="36" cy="36" r="32" fill="none" stroke="rgba(245,158,11,0.18)" stroke-width="2"/>'
    + '<circle cx="36" cy="36" r="32" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="50 150" stroke-linecap="round"/>'
    + '<polygon points="36,8 39,34 36,38 33,34" fill="#f59e0b"/>'
    + '<polygon points="36,64 33,38 36,34 39,38" fill="rgba(245,158,11,0.35)"/>'
    + '<polygon points="8,36 34,33 38,36 34,39" fill="rgba(245,158,11,0.35)"/>'
    + '<polygon points="64,36 38,39 34,36 38,33" fill="rgba(245,158,11,0.35)"/>'
    + '<circle cx="36" cy="36" r="3" fill="#f59e0b"/>'
    + '</svg>'
    + '<div style="color:#94a3b8;font-size:0.9em;margin-top:16px;letter-spacing:0.04em;">' + (msg || 'Analyzing fit...') + '</div>';
  if (!document.getElementById('compass-spin-style')) {
    var style = document.createElement('style');
    style.id = 'compass-spin-style';
    style.textContent = '@keyframes compassSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  }
  document.body.appendChild(overlay);
}

function hideCompassSpinner() {
  var overlay = document.getElementById('compass-overlay');
  if (overlay) overlay.remove();
}

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
    + oppTab('dismissed', 'Dismissed (' + dismissedJobs.length + ')', SCRAPER_FILTER === 'dismissed')
    + '</div>';

  // ATS History panel trigger
  html += '<div style="display:flex;justify-content:flex-end;margin-bottom:8px;">'
    + '<button onclick="openATSPanel()" style="'
    + 'background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);'
    + 'color:#f59e0b;padding:6px 14px;border-radius:6px;font-size:0.82em;cursor:pointer;">'
    + '📋 ATS History</button>'
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
  var jdBadge = j.jd_source === 'greenhouse' || j.jd_source === 'lever' || j.jd_source === 'ashby'
    ? ' <span style="color:#22c55e;font-size:0.75em;">● ' + j.jd_source + '</span>'
    : j.full_description ? ' <span style="color:#94a3b8;font-size:0.75em;">● adzuna snippet</span>'
    : ' <span style="color:#64748b;font-size:0.75em;">● no JD</span>';
  card += '<div class="recon-toggle" onclick="toggleJD(\'' + jobId + '\')">'
    + (jdExpanded ? '▼' : '▶') + ' Job Description' + jdBadge
    + '</div>';  if (jdExpanded) {    if (j.full_description) {      card += '<div class="recon-section" id="' + jdId + '" style="white-space:pre-wrap;font-size:0.85em;color:#cbd5e1;max-height:400px;overflow-y:auto;">'        + j.full_description.slice(0, 5000)        + '</div>';    } else if (j.description) {
      card += '<div class="recon-section" id="' + jdId + '" style="white-space:pre-wrap;font-size:0.85em;color:#cbd5e1;max-height:400px;overflow-y:auto;">'
        + '<div style="color:#f59e0b;font-size:0.78em;margin-bottom:8px;">⚠ Adzuna snippet only — full JD not available</div>'
        + j.description
        + '</div>';
    } else {
      card += '<div class="recon-section" id="' + jdId + '"><div style="color:#94a3b8;padding:16px;">No job description available.</div></div>';
    }  }

  if (!isDismissed) {
    card += '<div class="job-card-actions" style="margin-top:12px;">'
      + '<button class="action-btn action-pipeline" onclick="jobAction(event, \'' + jobId + '\', \'add_to_pipeline\', ' + jobJson + ')">Add to Pipeline</button>'
      + (!isBacklog ? '<button class="action-btn action-backlog" onclick="promptJobAction(event, \'' + jobId + '\', \'backlog\')">Backlog</button>' : '')
      + '<button class="action-btn action-dismiss" onclick="promptJobAction(event, \'' + jobId + '\', \'dismiss\')">Not a Fit</button>'
      + '<span style="position:relative;display:inline-flex;align-items:center;gap:4px;">'
      + '<button class="action-btn action-ats" onclick="runFitCheck(event, \'' + jobId + '\')">'
        + (j.fit_result ? '✓ ' + j.fit_result.score + '% Fit' : 'AI Fit Check')
        + '</button>'
      + '<span class="fit-info-icon" title="" onclick="toggleFitTooltip(event, \'' + jobId + '\')" style="cursor:pointer;color:#64748b;font-size:0.82em;user-select:none;" aria-label="What is AI Fit Check?">ⓘ</span>'
      + '<span id="fit-tip-' + jobId + '" style="display:none;position:absolute;bottom:calc(100% + 6px);left:0;width:240px;background:#1e293b;border:1px solid rgba(245,158,11,0.25);border-radius:8px;padding:10px 12px;font-size:0.78em;color:#cbd5e1;line-height:1.5;z-index:500;box-shadow:0 4px 16px rgba(0,0,0,0.4);">AI Fit Check gives a quick signal on role alignment based on your profile. It is not a keyword ATS scan — use <strong style=\"color:#f59e0b;\">Analyze &amp; Tailor</strong> for full keyword analysis and resume tailoring.</span>'
      + '</span>'
      + (j.apply_url ? '<a href="' + j.apply_url + '" target="_blank" class="action-btn action-apply">Apply →</a>' : '')
      + '</div>';
  } else {
    card += '<div class="job-card-actions" style="margin-top:12px;">'
      + '<a href="' + (j.apply_url || '#') + '" target="_blank" class="action-btn action-apply">View Posting →</a>'
      + '</div>';
  }

  // Inline fit result (expands below action buttons)
  var fitRes = FIT_RESULTS[j.job_id];
  if (fitRes) {
    var fitColor = fitRes.score >= 70 ? '#22c55e' : fitRes.score >= 50 ? '#f59e0b' : '#ef4444';
    var verdictLabel = fitRes.verdict ? (' <span style="color:#94a3b8;font-size:0.82em;">— ' + fitRes.verdict + '</span>') : '';
    card += '<div style="margin-top:12px;padding:14px 16px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid rgba(255,255,255,0.07);">'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">'
      + '<span style="font-size:1.4em;font-weight:700;color:' + fitColor + ';">' + fitRes.score + '%</span>'
      + '<span style="font-size:0.82em;font-weight:600;color:' + fitColor + ';">AI Fit Score</span>'
      + verdictLabel
      + (fitRes.jdSource === 'snippet' ? '<span style="font-size:0.75em;color:#f59e0b;margin-left:auto;">⚠ snippet JD</span>' : '<span style="font-size:0.75em;color:#64748b;margin-left:auto;">✓ full JD</span>')
      + '</div>'
      + (fitRes.experienceGap ? '<div style="font-size:0.82em;color:#94a3b8;margin-bottom:8px;line-height:1.4;">' + fitRes.experienceGap + '</div>' : '')
      + (fitRes.gaps && fitRes.gaps.length ? '<div style="margin-bottom:8px;">'
          + '<div style="font-size:0.75em;font-weight:600;color:#f59e0b;margin-bottom:4px;letter-spacing:0.04em;">GAPS TO ADDRESS</div>'
          + fitRes.gaps.slice(0, 6).map(function(g) {
              return '<span style="display:inline-block;background:rgba(239,68,68,0.12);color:#fca5a5;padding:2px 8px;border-radius:4px;font-size:0.78em;margin:2px;">' + g + '</span>';
            }).join('')
          + '</div>' : '')
      + (fitRes.matched && fitRes.matched.length ? '<div style="margin-bottom:10px;">'
          + '<div style="font-size:0.75em;font-weight:600;color:#22c55e;margin-bottom:4px;letter-spacing:0.04em;">MATCHED</div>'
          + fitRes.matched.slice(0, 6).map(function(m) {
              return '<span style="display:inline-block;background:rgba(34,197,94,0.1);color:#86efac;padding:2px 8px;border-radius:4px;font-size:0.78em;margin:2px;">' + m + '</span>';
            }).join('')
          + '</div>' : '')
      + '<button onclick="sendToATSEngine(\'' + j.job_id + '\')" style="'
          + 'background:linear-gradient(135deg,#f59e0b,#d97706);color:#0a0f1e;border:none;border-radius:6px;'
          + 'padding:8px 16px;font-size:0.82em;font-weight:700;cursor:pointer;letter-spacing:0.02em;width:100%;">'
          + '✦ Analyze &amp; Tailor Resume →'
          + '</button>'
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
  // Only fetch if no full_description AND no fallback description — don't bother otherwise
  if (expandedJD[jobId] && job && !job.full_description && !job.description && job.apply_url) {
    fetchAndStoreJD(job);
  }
}

function fetchAndStoreJD(job) {
  console.log('[JD fetch] url:', job.apply_url, 'token:', !!window.SESSION_TOKEN);
  fetch('/api/ats-scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + window.SESSION_TOKEN },
    body: JSON.stringify({ action: 'fetch_jd', jd: '', url: job.apply_url })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    console.log('[JD fetch] result:', data.ok, 'length:', data.text && data.text.length);
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



// ── Fit Check tooltip toggle ─────────────────────────────────────────────────
function toggleFitTooltip(e, jobId) {
  e.stopPropagation();
  var tip = document.getElementById('fit-tip-' + jobId);
  if (!tip) return;
  tip.style.display = tip.style.display === 'none' ? 'block' : 'none';
  // Close on outside click
  if (tip.style.display === 'block') {
    setTimeout(function() {
      document.addEventListener('click', function closeTip() {
        tip.style.display = 'none';
        document.removeEventListener('click', closeTip);
      });
    }, 10);
  }
}

// ── Fit Check — runs AI match, shows inline result, stores to ats_runs ────────
function runFitCheck(e, jobId) {
  e.stopPropagation();
  var job = JOBS.find(function(j) { return j.job_id === jobId; });
  if (!job) return;

  var resume = window.USER_PROFILE && window.USER_PROFILE.resume_text;
  if (!resume) { showToast('Upload your resume in Profile first.'); return; }

  showCompassSpinner('Checking fit...');

  var applyUrl = job.apply_url || '';
  var jdPromise;

  // Use stored full JD if available, else fetch it, else fall back to snippet
  if (job.full_description && job.full_description.length > 100) {
    jdPromise = Promise.resolve({ ok: true, text: job.full_description, source: 'full' });
  } else if (applyUrl) {
    jdPromise = fetch('/api/ats-scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + window.SESSION_TOKEN },
      body: JSON.stringify({ action: 'fetch_jd', jd: '', url: applyUrl })
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
      if (res.ok && res.text && res.text.length > 100) {
        return { ok: true, text: res.text, source: 'full' };
      }
      return { ok: true, text: job.description || '', source: 'snippet' };
    })
    .catch(function() { return { ok: true, text: job.description || '', source: 'snippet' }; });
  } else {
    jdPromise = Promise.resolve({ ok: true, text: job.description || '', source: 'snippet' });
  }

  jdPromise.then(function(jdRes) {
    var jdText = jdRes.text || '';
    var jdSource = jdRes.source || 'snippet';

    if (!jdText || jdText.length < 20) {
      hideCompassSpinner();
      showToast('No job description available for this role.');
      return;
    }

    return fetch('/api/ats-scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + window.SESSION_TOKEN },
      body: JSON.stringify({ action: 'score', jd: jdText, resume: resume, company: job.company, role: job.title })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      hideCompassSpinner();
      if (!data.ok || !data.result) throw new Error(data.error || 'Fit check failed');

      var result = data.result;
      var score = result.overall_score || result.score || 0;
      var gaps = result.missing_hard || result.missing_keywords || [];
      var matched = result.matched_keywords || [];
      var verdict = result.verdict || '';

      // Store in local state for inline render
      FIT_RESULTS[job.job_id] = {
        score: score, gaps: gaps, matched: matched,
        verdict: verdict, jdText: jdText, jdSource: jdSource,
        experienceGap: result.experience_gap || ''
      };

      // Also store to jobs row and ats_runs
      fetch(window.SUPABASE_URL + '/rest/v1/jobs?job_id=eq.' + encodeURIComponent(job.job_id), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': window.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + window.SESSION_TOKEN,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          ats_score: score,
          ats_missing_keywords: gaps,
          ats_analyzed_at: new Date().toISOString(),
          ats_jd_source: jdSource
        })
      });

      if (window.SESSION_USER && window.SESSION_USER.id) {
        fetch(window.SUPABASE_URL + '/rest/v1/ats_runs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': window.SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + window.SESSION_TOKEN,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            user_id: window.SESSION_USER.id,
            job_id: job.job_id,
            company: job.company,
            role: job.title,
            score: score,
            jd_source: jdSource,
            missing_keywords: gaps,
            result: result
          })
        })
        .then(function(r) {
          if (!r.ok) r.text().then(function(t) { console.error('[ats_runs insert]', r.status, t); });
        })
        .catch(function(err) { console.error('[ats_runs insert]', err); });
      } else {
        console.warn('[ats_runs] SESSION_USER not set — run not saved');
      }

      renderScraper();
    });
  })
  .catch(function(err) {
    hideCompassSpinner();
    console.error('[runFitCheck]', err);
    showToast('Fit check failed: ' + err.message);
  });
}

// ── Send job to ATS Engine tab (pre-populate + run) ───────────────────────────
function sendToATSEngine(jobId) {
  var job = JOBS.find(function(j) { return j.job_id === jobId; });
  if (!job) return;

  var fitRes = FIT_RESULTS[jobId];
  var jdText = (fitRes && fitRes.jdText) || job.full_description || job.description || '';

  if (!jdText) { showToast('No job description available — open the JD first.'); return; }

  // Switch to ATS tab
  var atsTab = document.querySelector('.tab[onclick*="ats"]');
  if (atsTab) switchTab('ats', atsTab);

  // Pre-populate ATS fields
  var jdEl      = document.getElementById('ats-jd');
  var companyEl = document.getElementById('ats-company');
  var roleEl    = document.getElementById('ats-role');

  if (jdEl)      jdEl.value = jdText;
  if (companyEl) companyEl.value = job.company || '';
  if (roleEl)    roleEl.value = job.title || '';

  // Sync atsState
  if (window.atsState !== undefined) {
    window.atsState = { jd: jdText, company: job.company || '', role: job.title || '', masterResume: '', tailored: '', scoreData: null };
  }

  // Small delay so tab renders before running
  setTimeout(function() {
    if (typeof runATSAnalysis === 'function') runATSAnalysis();
    else showToast('ATS Engine loaded — click Analyze to run.');
  }, 150);
}





// ── ATS History Side Panel ─────────────────────────────────────────────────
var ATS_PANEL_OPEN = false;
var ATS_RUNS = [];
var ATS_SELECTED_RUN = null;

function openATSPanel() {
  ATS_PANEL_OPEN = true;
  renderATSPanel();
  loadATSRuns();
}

function closeATSPanel() {
  ATS_PANEL_OPEN = false;
  var panel = document.getElementById('ats-history-panel');
  if (panel) panel.remove();
  var overlay = document.getElementById('ats-panel-overlay');
  if (overlay) overlay.remove();
}

function loadATSRuns() {
  var uid = window.SESSION_USER && window.SESSION_USER.id;
  fetch(window.SUPABASE_URL + '/rest/v1/ats_runs?user_id=eq.' + (uid || 'none') + '&order=created_at.desc&limit=30', {
    headers: {
      'apikey': window.SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + window.SESSION_TOKEN
    }
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    ATS_RUNS = Array.isArray(data) ? data : [];
    renderATSPanel();
  })
  .catch(function() {
    ATS_RUNS = [];
    renderATSPanel();
  });
}

function renderATSPanel() {
  var existing = document.getElementById('ats-history-panel');
  if (!ATS_PANEL_OPEN) { if (existing) existing.remove(); return; }

  var scoreColor = function(s) {
    return s >= 70 ? '#22c55e' : s >= 50 ? '#f59e0b' : '#ef4444';
  };

  var listHTML = ATS_RUNS.length === 0
    ? '<div style="color:#94a3b8;padding:24px;text-align:center;">No fit checks yet.<br>Click <strong>AI Fit Check</strong> on any lead.</div>'
    : ATS_RUNS.map(function(run) {
        var isSelected = ATS_SELECTED_RUN && ATS_SELECTED_RUN.id === run.id;
        return '<div onclick="selectATSRun(\'' + run.id + '\')" style="'
          + 'padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.06);cursor:pointer;'
          + 'background:' + (isSelected ? 'rgba(245,158,11,0.08)' : 'transparent') + ';'
          + 'transition:background 0.15s;">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;">'
          + '<span style="font-weight:600;font-size:0.9em;">' + (run.company || 'Unknown') + '</span>'
          + '<span style="font-weight:700;color:' + scoreColor(run.score) + ';">' + (run.score || '?') + '%</span>'
          + '</div>'
          + '<div style="color:#94a3b8;font-size:0.8em;margin-top:2px;">' + (run.role || '') + '</div>'
          + '<div style="color:#64748b;font-size:0.75em;margin-top:2px;">'
          + (run.jd_source === 'snippet' ? '⚠ snippet' : '✓ full JD') + ' · '
          + new Date(run.created_at).toLocaleDateString('en-US', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})
          + '</div>'
          + '</div>';
      }).join('');

  var detailHTML = '';
  if (ATS_SELECTED_RUN) {
    var r = ATS_SELECTED_RUN;
    var res = r.result || {};
    detailHTML = '<div style="border-top:2px solid rgba(245,158,11,0.3);padding:16px;">'
      + '<div style="font-weight:700;font-size:1em;margin-bottom:12px;">' + r.company + ' — ' + r.role + '</div>'

      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">'
      + scoreBox('Overall', r.score)
      + scoreBox('Hard Skills', res.hard_skill_score)
      + scoreBox('Soft Skills', res.soft_skill_score)
      + scoreBox('Experience', res.experience_match)
      + '</div>'

      + (res.verdict ? '<div style="margin-bottom:10px;padding:8px 12px;border-radius:6px;background:rgba(255,255,255,0.04);font-size:0.85em;">'
          + '<strong>Verdict:</strong> ' + res.verdict + '</div>' : '')

      + (res.experience_gap ? '<div style="margin-bottom:10px;color:#94a3b8;font-size:0.82em;line-height:1.5;">'
          + res.experience_gap + '</div>' : '')

      + (r.missing_keywords && r.missing_keywords.length ? '<div style="margin-bottom:10px;">'
          + '<div style="font-size:0.8em;font-weight:600;color:#f59e0b;margin-bottom:6px;">MISSING KEYWORDS</div>'
          + r.missing_keywords.map(function(k) {
              return '<span style="display:inline-block;background:rgba(239,68,68,0.15);color:#fca5a5;padding:2px 8px;border-radius:4px;font-size:0.78em;margin:2px;">' + k + '</span>';
            }).join('')
          + '</div>' : '')

      + (res.matched_keywords && res.matched_keywords.length ? '<div style="margin-bottom:10px;">'
          + '<div style="font-size:0.8em;font-weight:600;color:#22c55e;margin-bottom:6px;">MATCHED</div>'
          + res.matched_keywords.map(function(k) {
              return '<span style="display:inline-block;background:rgba(34,197,94,0.12);color:#86efac;padding:2px 8px;border-radius:4px;font-size:0.78em;margin:2px;">' + k + '</span>';
            }).join('')
          + '</div>' : '')

      + '<div style="font-size:0.75em;color:#64748b;margin-top:8px;">'
      + (r.jd_source === 'snippet' ? '⚠ Scored on snippet — open the JD for full accuracy' : '✓ Scored on full job description')
      + '</div>'
      + '</div>';
  }

  var panelHTML = '<div id="ats-history-panel" style="'
    + 'position:fixed;top:0;right:0;width:380px;height:100vh;'
    + 'background:#0f172a;border-left:1px solid rgba(255,255,255,0.08);'
    + 'z-index:1000;display:flex;flex-direction:column;box-shadow:-8px 0 32px rgba(0,0,0,0.4);'
    + 'overflow:hidden;">'

    // Header
    + '<div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">'
    + '<div style="font-weight:700;font-size:1em;">Fit Check History</div>'
    + '<button onclick="closeATSPanel()" style="background:none;border:none;color:#94a3b8;font-size:1.2em;cursor:pointer;padding:4px;">✕</button>'
    + '</div>'

    // List
    + '<div style="flex:1;overflow-y:auto;">' + listHTML + '</div>'

    // Detail
    + detailHTML
    + '</div>';

  if (existing) {
    existing.outerHTML = panelHTML;
  } else {
    document.body.insertAdjacentHTML('beforeend', panelHTML);
  }
}

function scoreBox(label, val) {
  var color = val >= 70 ? '#22c55e' : val >= 50 ? '#f59e0b' : val ? '#ef4444' : '#64748b';
  return '<div style="background:rgba(255,255,255,0.04);border-radius:6px;padding:8px;text-align:center;">'
    + '<div style="font-size:0.75em;color:#94a3b8;">' + label + '</div>'
    + '<div style="font-size:1.3em;font-weight:700;color:' + color + ';">' + (val || '—') + (val ? '%' : '') + '</div>'
    + '</div>';
}

function selectATSRun(id) {
  ATS_SELECTED_RUN = ATS_RUNS.find(function(r) { return r.id === id; }) || null;
  renderATSPanel();
}



