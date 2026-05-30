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

// ── Freshness — based on posted_date ─────────────────────────────────────────
// Fresh: < 3 days | Aging: 3–7 days | Stale: 7+ days
function getFreshness(job) {
  var posted = job.posted_date || job.scraped_at;
  if (!posted) return { tier: 'unknown', label: 'Unknown', icon: '○', color: '#64748b', days: null };
  var days = (Date.now() - new Date(posted).getTime()) / (1000 * 60 * 60 * 24);
  if (days < 3)  return { tier: 'fresh',  label: 'Fresh',  icon: '◆', color: '#22c55e', days: Math.floor(days) };
  if (days < 7)  return { tier: 'aging',  label: 'Aging',  icon: '▲', color: '#f59e0b', days: Math.floor(days) };
                 return { tier: 'stale',  label: 'Stale',  icon: '▼', color: '#94a3b8', days: Math.floor(days) };
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderScraper() {
  renderFilterSummary();
  var el = document.getElementById('scraper-content');
  if (!el) return;

  var unactioned    = JOBS.filter(function (j) { return j.status === 'new' || !j.status; });
  var dismissedJobs = JOBS.filter(function (j) { return j.status === 'dismissed'; });
  var addedJobs     = JOBS.filter(function (j) { return j.status === 'added'; });

  // Freshness buckets (by posted_date)
  var freshJobs  = unactioned.filter(function(j) { return getFreshness(j).tier === 'fresh'; });
  var agingJobs  = unactioned.filter(function(j) { return getFreshness(j).tier === 'aging'; });
  var staleJobs  = unactioned.filter(function(j) { return getFreshness(j).tier === 'stale' || getFreshness(j).tier === 'unknown'; });

  // OTE tier buckets
  var tier1       = unactioned.filter(function (j) { return j.estimated_ote >= 300000; });
  var tier2       = unactioned.filter(function (j) { return j.estimated_ote >= 250000 && j.estimated_ote < 300000; });
  var tier3       = unactioned.filter(function (j) { return j.estimated_ote >= 200000 && j.estimated_ote < 250000; });
  var tierUnknown = unactioned.filter(function (j) { return !j.estimated_ote; });

  // KPIs
  var iconFresh = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
  var iconAging = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
  var iconStale = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>';
  var iconPipe  = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
  var iconX     = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  // Strong match = auto-scored >= 75%
  var strongMatches = unactioned.filter(function(j) { return j.ats_score !== null && j.ats_score >= 75; });

  var iconStrong = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';

  var kpiEl = document.getElementById('scraper-kpis');
  if (kpiEl) {
    kpiEl.innerHTML =
      kpiCard(iconFresh,  freshJobs.length,    'Fresh',          '#22c55e') +
      kpiCard(iconAging,  agingJobs.length,    'Aging',          '#f59e0b') +
      kpiCard(iconStale,  staleJobs.length,    'Stale',          '#94a3b8') +
      kpiCard(iconStrong, strongMatches.length,'Strong Match',   '#f59e0b') +
      kpiCard(iconPipe,   addedJobs.length,    'In Pipeline',    '#8b5cf6') +
      kpiCard(iconX,      dismissedJobs.length,'Dismissed',      '#64748b');
  }

  if (!JOBS.length) {
    el.innerHTML = '<div style="text-align:center;padding:48px;color:var(--muted)">No leads yet — hit Generate Leads to find matching roles.</div>';
    return;
  }

  // Filter
  var filtered;
  if      (SCRAPER_FILTER === '300k')      filtered = tier1;
  else if (SCRAPER_FILTER === '250k')      filtered = tier2;
  else if (SCRAPER_FILTER === '200k')      filtered = tier3;
  else if (SCRAPER_FILTER === 'unknown')   filtered = tierUnknown;
  else if (SCRAPER_FILTER === 'dismissed') filtered = dismissedJobs;
  else                                     filtered = unactioned;

  // Sort
  filtered.sort(function (a, b) {
    if (SCRAPER_SORT === 'ote')     return (b.estimated_ote || 0) - (a.estimated_ote || 0);
    if (SCRAPER_SORT === 'date')    return new Date(b.posted_date || b.scraped_at || 0) - new Date(a.posted_date || a.scraped_at || 0);
    if (SCRAPER_SORT === 'company') return (a.company || '').localeCompare(b.company || '');
    return (b.estimated_ote || 0) - (a.estimated_ote || 0);
  });

  // Sub-tabs
  var html = '<div class="sub-tabs" id="opp-sub-tabs">'
    + oppTab('all',       'All (' + unactioned.length + ')',          SCRAPER_FILTER === 'all')
    + oppTab('300k',      '$300K+ (' + tier1.length + ')',           SCRAPER_FILTER === '300k')
    + oppTab('250k',      '$250K–$300K (' + tier2.length + ')', SCRAPER_FILTER === '250k')
    + oppTab('200k',      '$200K–$250K (' + tier3.length + ')', SCRAPER_FILTER === '200k')
    + oppTab('unknown',   'Unlisted (' + tierUnknown.length + ')',   SCRAPER_FILTER === 'unknown')
    + '<div class="tab-divider"></div>'
    + oppTab('dismissed', 'Dismissed (' + dismissedJobs.length + ')', SCRAPER_FILTER === 'dismissed')
    + '</div>';

  // Sort controls
  html += '<div class="scraper-controls">'
    + '<button class="filter-btn' + (SCRAPER_SORT === 'ote'     ? ' active' : '') + '" onclick="setScraperSort(&quot;ote&quot;)">OTE</button>'
    + '<button class="filter-btn' + (SCRAPER_SORT === 'date'    ? ' active' : '') + '" onclick="setScraperSort(&quot;date&quot;)">Date Posted</button>'
    + '<button class="filter-btn' + (SCRAPER_SORT === 'company' ? ' active' : '') + '" onclick="setScraperSort(&quot;company&quot;)">Company</button>'
    + '</div>';

  // Split filtered into actionable (fresh+aging) and stale
  var actionable    = filtered.filter(function(j) { var f = getFreshness(j); return f.tier === 'fresh' || f.tier === 'aging'; });
  var staleFiltered = filtered.filter(function(j) { var f = getFreshness(j); return f.tier === 'stale' || f.tier === 'unknown'; });

  // Don't split dismissed view by freshness — show all flat
  if (SCRAPER_FILTER === 'dismissed') {
    html += filtered.length
      ? '<div class="job-cards">' + filtered.map(renderJobCard).join('') + '</div>'
      : '<div style="text-align:center;padding:48px;color:var(--muted)">No dismissed leads.</div>';
  } else if (!filtered.length) {
    html += '<div style="text-align:center;padding:48px;color:var(--muted)">No leads in this category.</div>';
  } else {
    if (actionable.length) {
      html += '<div class="job-cards">' + actionable.map(renderJobCard).join('') + '</div>';
    } else {
      html += '<div style="text-align:center;padding:24px;color:var(--muted);font-size:0.9em;">No fresh or aging leads — check Stale below.</div>';
    }
    if (staleFiltered.length) {
      html += '<details style="margin-top:16px;">'
        + '<summary style="cursor:pointer;padding:10px 14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:8px;color:#94a3b8;font-size:0.85em;list-style:none;display:flex;align-items:center;gap:8px;">'
        + '<span style="color:#64748b;font-size:0.8em;">&#9660;</span> Stale (' + staleFiltered.length + ') &mdash; posted 7+ days ago'
        + '</summary>'
        + '<div class="job-cards" style="margin-top:8px;opacity:0.75;">' + staleFiltered.map(renderJobCard).join('') + '</div>'
        + '</details>';
    }
  }

  el.innerHTML = html;
}

function oppTab(key, label, isActive) {
  return '<button class="sub-tab' + (isActive ? ' active' : '') + '" onclick="setScraperFilter(&quot;' + key + '&quot;)">' + label + '</button>';
}

function setScraperFilter(f) {
  SCRAPER_FILTER = f;
  document.querySelectorAll('#opp-sub-tabs .sub-tab').forEach(function (t) { t.classList.remove('active'); });
  event.target.classList.add('active');
  renderScraper();
}

// ── Job Card ──────────────────────────────────────────────────────────────────

function getTierBadge(ote) {
  if (!ote) return '<span class="tier-badge tier-unknown">OTE unlisted</span>';
  var k = Math.round(ote / 1000);
  return '<span class="tier-badge tier-ote">$' + k + 'K OTE</span>';
}

function renderJobCard(j) {
  var jobId       = j.job_id;
  var isExpanded  = expandedRecon[jobId];
  var isDismissed = j.status === 'dismissed';
  var fresh       = getFreshness(j);
  var ote         = j.estimated_ote ? '$' + Math.round(j.estimated_ote / 1000) + 'K OTE' : null;

  // Fit score — prefer live session result, fall back to stored auto-score
  var fitRes = FIT_RESULTS[j.job_id];
  if (!fitRes && j.ats_score !== null && j.ats_score !== undefined) {
    fitRes = {
      score: j.ats_score,
      gaps: j.ats_missing_keywords || [],
      matched: [],
      verdict: j.ats_score >= 75 ? 'strong match' : j.ats_score >= 50 ? 'moderate match' : 'weak match',
      jdSource: j.ats_jd_source || 'auto',
      experienceGap: '',
      isAutoScore: true
    };
  }
  var fitColor  = fitRes ? (fitRes.score >= 75 ? '#22c55e' : fitRes.score >= 50 ? '#f59e0b' : '#ef4444') : null;

  // ── Collapsed row — always visible, tap to expand ─────────────────────────
  var card = '<div class="job-card-new' + (isDismissed ? ' dismissed' : '') + '" style="padding:0;overflow:hidden;">';

  // Collapsed header — single tap target
  card += '<div onclick="toggleCardExpand(\'' + jobId + '\')" style="'
    + 'display:flex;align-items:center;gap:8px;padding:12px 14px;cursor:pointer;'
    + (isExpanded ? 'border-bottom:1px solid rgba(255,255,255,0.07);' : '')
    + '">'
    // Company + role
    + '<div style="flex:1;min-width:0;">'
    + '<div style="font-weight:700;font-size:0.95em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (j.company || '') + '</div>'
    + '<div style="font-size:0.78em;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;">' + (j.title || '') + '</div>'
    + '</div>'
    // Right side: OTE + freshness + score + chevron
    + '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;">'
    + (ote ? '<span style="font-size:0.8em;font-weight:700;color:#f59e0b;">' + ote + '</span>' : '<span style="font-size:0.78em;color:#64748b;">OTE unlisted</span>')
    + '<div style="display:flex;align-items:center;gap:6px;">'
    + '<span style="font-size:0.72em;font-weight:600;color:' + fresh.color + ';">' + fresh.icon + ' ' + fresh.label + (fresh.days !== null ? ' (' + fresh.days + 'd)' : '') + '</span>'
    + (fitRes ? '<span style="font-size:0.78em;font-weight:700;color:' + fitColor + ';">' + fitRes.score + '%</span>' : '')
    + '</div>'
    + '</div>'
    + '<span style="color:#64748b;font-size:10px;margin-left:4px;transition:transform 0.2s;' + (isExpanded ? 'transform:rotate(180deg);' : '') + '">▼</span>'
    + '</div>';

  // ── Expanded body — only rendered when open ───────────────────────────────
  if (isExpanded) {
    var postedDate = j.posted_date
      ? new Date(j.posted_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : (j.scraped_at ? new Date(j.scraped_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—');
    var baseSalary = j.base_salary ? '$' + Math.round(j.base_salary / 1000) + 'K' : 'Not listed';
    var oteDisplay = j.estimated_ote ? '$' + Math.round(j.estimated_ote / 1000) + 'K' : 'Unknown';

    card += '<div style="padding:12px 14px;">';

    // Justification if dismissed
    if (j.justification) {
      card += '<div style="font-size:0.82em;color:#94a3b8;margin-bottom:10px;padding:8px 10px;background:rgba(255,255,255,0.03);border-radius:6px;"><strong>Reason:</strong> ' + j.justification + '</div>';
    }

    // Meta rows
    card += '<div class="job-card-meta" style="margin-bottom:12px;">'
      + '<div class="meta-row"><span class="meta-label">Base:</span> <span class="meta-value">' + baseSalary + '</span></div>'
      + '<div class="meta-row"><span class="meta-label">Est OTE:</span> <span class="meta-value ote">' + oteDisplay + '</span></div>'
      + '<div class="meta-row"><span class="meta-label">Location:</span> <span class="meta-value">' + (j.location || 'Remote') + '</span></div>'
      + '<div class="meta-row"><span class="meta-label">Posted:</span> <span class="meta-value">' + postedDate + '</span></div>'
      + '</div>';

    // Fit detail (expanded)
    if (fitRes) {
      var sourceLabel = fitRes.isAutoScore ? 'auto-scored'
        : fitRes.jdSource === 'snippet' ? '&#9888; snippet' : '&#10003; full JD';
      card += '<div style="margin-bottom:12px;padding:10px 12px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid rgba(255,255,255,0.07);">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'
        + '<span style="font-size:1.1em;font-weight:700;color:' + fitColor + ';">' + fitRes.score + '%</span>'
        + '<span style="font-size:0.78em;font-weight:600;color:' + fitColor + ';">AI Fit</span>'
        + (fitRes.verdict ? '<span style="font-size:0.76em;color:#94a3b8;">— ' + fitRes.verdict + '</span>' : '')
        + '<span style="font-size:0.7em;color:#64748b;margin-left:auto;">' + sourceLabel + '</span>'
        + '</div>'
        + (fitRes.experienceGap ? '<div style="font-size:0.8em;color:#94a3b8;margin-bottom:8px;line-height:1.4;">' + fitRes.experienceGap + '</div>' : '')
        + (fitRes.gaps && fitRes.gaps.length ? '<div style="margin-bottom:6px;"><div style="font-size:0.7em;font-weight:600;color:#f59e0b;margin-bottom:3px;letter-spacing:0.04em;">GAPS</div>'
            + fitRes.gaps.slice(0, 6).map(function(g) {
                return '<span style="display:inline-block;background:rgba(239,68,68,0.12);color:#fca5a5;padding:2px 7px;border-radius:4px;font-size:0.75em;margin:2px;">' + g + '</span>';
              }).join('') + '</div>' : '')
        + (fitRes.matched && fitRes.matched.length ? '<div><div style="font-size:0.7em;font-weight:600;color:#22c55e;margin-bottom:3px;letter-spacing:0.04em;">MATCHED</div>'
            + fitRes.matched.slice(0, 6).map(function(m) {
                return '<span style="display:inline-block;background:rgba(34,197,94,0.1);color:#86efac;padding:2px 7px;border-radius:4px;font-size:0.75em;margin:2px;">' + m + '</span>';
              }).join('') + '</div>' : '')
        + '</div>';
    }

    // Recon section — auto-fires on expand
    var reconId = 'recon-' + jobId;
    card += '<div style="margin-bottom:8px;">';
    if (j.recon_data) {
      card += renderReconSection(j);
    } else {
      card += '<div id="' + reconId + '" style="font-size:0.82em;color:#94a3b8;padding:8px 0;">'
        + '<span style="color:#64748b;">Loading company data…</span></div>';
      // Auto-fire recon after render
      setTimeout(function() { fetchReconData(jobId, j.company); }, 50);
    }
    card += '</div>';

    // JD section
    var jdExpanded = expandedJD[jobId] || false;
    var jdBadge = (j.jd_source === 'greenhouse' || j.jd_source === 'lever' || j.jd_source === 'ashby')
      ? ' <span style="color:#22c55e;font-size:0.75em;">● ' + j.jd_source + '</span>'
      : j.full_description ? ' <span style="color:#94a3b8;font-size:0.75em;">● adzuna snippet</span>'
      : ' <span style="color:#64748b;font-size:0.75em;">● no JD</span>';
    card += '<div class="recon-toggle" onclick="toggleJD(\'' + jobId + '\')" style="margin-bottom:' + (jdExpanded ? '0' : '8px') + ';">'
      + (jdExpanded ? '▼' : '▶') + ' Job Description' + jdBadge + '</div>';
    if (jdExpanded) {
      var jdId = 'jd-' + jobId;
      if (j.full_description) {
        card += '<div class="recon-section" id="' + jdId + '" style="white-space:pre-wrap;font-size:0.82em;color:#cbd5e1;max-height:300px;overflow-y:auto;margin-bottom:8px;">'
          + j.full_description.slice(0, 5000) + '</div>';
      } else if (j.description) {
        card += '<div class="recon-section" id="' + jdId + '" style="white-space:pre-wrap;font-size:0.82em;color:#cbd5e1;max-height:300px;overflow-y:auto;margin-bottom:8px;">'
          + '<div style="color:#f59e0b;font-size:0.78em;margin-bottom:6px;">⚠ Adzuna snippet only</div>'
          + j.description + '</div>';
      } else {
        card += '<div class="recon-section" id="' + jdId + '" style="margin-bottom:8px;"><div style="color:#94a3b8;padding:12px;">No job description available.</div></div>';
      }
      if (!j.full_description && !j.description && j.apply_url) fetchAndStoreJD(j);
    }

    // Action buttons
    if (!isDismissed) {
      card += '<div class="job-card-actions" style="margin-top:4px;">'
        + '<button class="action-btn action-pipeline" onclick="jobAction(event, \'' + jobId + '\', \'add_to_pipeline\')">Add to Pipeline</button>'
        + '<button class="action-btn action-dismiss" onclick="promptJobAction(event, \'' + jobId + '\', \'dismiss\')">Not a Fit</button>'
        + '<span style="position:relative;display:inline-flex;align-items:center;gap:4px;">'
        + '<button class="action-btn action-ats" onclick="runFitCheck(event, \'' + jobId + '\')">'
        + (fitRes && !fitRes.isAutoScore ? '✓ ' + fitRes.score + '% — Re-run' : fitRes ? '◆ ' + fitRes.score + '% — Re-run' : 'AI Fit Check')
        + '</button>'
        + '<span class="fit-info-icon" onclick="toggleFitTooltip(event, \'' + jobId + '\')" style="cursor:pointer;color:#64748b;font-size:0.82em;user-select:none;">ⓘ</span>'
        + '<span id="fit-tip-' + jobId + '" style="display:none;position:absolute;bottom:calc(100% + 6px);left:0;width:230px;background:#1e293b;border:1px solid rgba(245,158,11,0.25);border-radius:8px;padding:10px 12px;font-size:0.77em;color:#cbd5e1;line-height:1.5;z-index:500;box-shadow:0 4px 16px rgba(0,0,0,0.4);">AI Fit Check scores alignment with your profile. For full keyword analysis use <strong style=\"color:#f59e0b;\">Analyze &amp; Tailor</strong>.</span>'
        + '</span>'
        + (j.apply_url ? '<a href="' + j.apply_url + '" target="_blank" class="action-btn action-apply">Apply →</a>' : '')
        + '</div>';
      // Analyze & Tailor if scored
      if (fitRes) {
        card += '<button onclick="sendToATSEngine(\'' + j.job_id + '\')" style="'
          + 'background:linear-gradient(135deg,#f59e0b,#d97706);color:#0a0f1e;border:none;border-radius:6px;'
          + 'padding:8px 16px;font-size:0.82em;font-weight:700;cursor:pointer;width:100%;margin-top:8px;">'
          + '✶ Analyze &amp; Tailor Resume →</button>';
      }
    } else {
      card += '<div class="job-card-actions" style="margin-top:4px;">'
        + '<a href="' + (j.apply_url || '#') + '" target="_blank" class="action-btn action-apply">View Posting →</a>'
        + '</div>';
    }

    card += '</div>'; // end expanded body
  }

  return card + '</div>';
}


// ── Card expand/collapse (replaces per-section toggles) ──────────────────────
function toggleCardExpand(jobId) {
  expandedRecon[jobId] = !expandedRecon[jobId];
  // Clear JD expanded state when collapsing
  if (!expandedRecon[jobId]) delete expandedJD[jobId];
  renderScraper();
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

function toggleRecon(jobId) { toggleCardExpand(jobId); }

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

  // Always look up from JOBS array — never rely on inline jobData (breaks with special chars)
  var resolvedJobData = jobData || JOBS.find(function(j) { return j.job_id === jobId; }) || {};

  fetch('/api/job-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + window.SESSION_TOKEN },
    body: JSON.stringify({ action: action, jobId: jobId, jobData: resolvedJobData, justification: justification })
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



// ── Fit detail expand/collapse ────────────────────────────────────────────────
function toggleFitDetail(jobId) {
  var detail = document.getElementById('fit-detail-' + jobId);
  var chevron = document.getElementById('fit-chevron-' + jobId);
  if (!detail) return;
  var isOpen = detail.style.display !== 'none';
  detail.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
}

// ── Leads sticky filter toggle ────────────────────────────────────────────────
function toggleLeadsFilter() {
  var body = document.getElementById('leads-filter-body');
  var chevron = document.getElementById('leads-filter-chevron');
  if (!body) return;
  var isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
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

  // Sync atsState — pass scoreData from fit check so ATS tab skips re-score
  if (window.atsState !== undefined) {
    var existingResume = window.atsState.masterResume || '';
    window.atsState = {
      jd: jdText,
      scoredJD: fitRes ? jdText : '',
      company: job.company || '',
      role: job.title || '',
      masterResume: existingResume,
      tailored: '',
      scoreData: fitRes ? {
        overall_score: fitRes.score,
        hard_skill_score: null,
        soft_skill_score: null,
        verbatim_score: null,
        missing_hard: fitRes.gaps || [],
        matched_keywords: fitRes.matched || [],
        verdict: fitRes.verdict,
        experience_gap: fitRes.experienceGap || ''
      } : null
    };
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





// ── Filter info tooltip ───────────────────────────────────────────────────────
function toggleFilterInfo(e) {
  e.stopPropagation();
  var tip = document.getElementById('filter-info-tip');
  if (!tip) return;
  tip.style.display = tip.style.display === 'none' ? 'block' : 'none';
  if (tip.style.display === 'block') {
    setTimeout(function() {
      document.addEventListener('click', function closeIt() {
        tip.style.display = 'none';
        document.removeEventListener('click', closeIt);
      });
    }, 10);
  }
}




