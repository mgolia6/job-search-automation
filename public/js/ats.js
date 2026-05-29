// ── ATS State ─────────────────────────────────────────────────────────────────
var atsState = {
  jd: '',
  company: '',
  role: '',
  masterResume: '',
  tailored: '',
  scoreData: null
};

// ── Controls ──────────────────────────────────────────────────────────────────
function clearATS() {
  document.getElementById('ats-jd').value = '';
  document.getElementById('ats-company').value = '';
  document.getElementById('ats-role').value = '';
  document.getElementById('ats-results').style.display = 'none';
  atsState = { jd: '', company: '', role: '', masterResume: '', tailored: '', scoreData: null };
}

function copyTailored() {
  if (!atsState.tailored) return;
  navigator.clipboard.writeText(atsState.tailored).then(function () {
    showToast('Tailored resume copied to clipboard');
  });
}

function addToApplied() {
  var company = atsState.company;
  var role = atsState.role;
  if (!company || !role) { showToast('Set company and role name first'); return; }
  fetch('/api/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      table: 'applications',
      data: {
        company: company,
        role: role,
        status: 'Applied',
        date_applied: new Date().toISOString().split('T')[0],
        notes: 'Added via ATS Engine'
      }
    })
  }).then(function (r) {
    if (r.ok) {
      showToast('Added to pipeline as Applied');
      switchTab('pipeline', document.querySelector('.tab'));
      loadData();
    } else {
      showToast('Error adding to pipeline');
    }
  });
}

// ── Main Analysis ─────────────────────────────────────────────────────────────
async function runATSAnalysis() {
  var jd      = document.getElementById('ats-jd').value.trim();
  var company = document.getElementById('ats-company').value.trim();
  var role    = document.getElementById('ats-role').value.trim();

  if (!jd)      { showToast('Paste a job description first'); return; }
  if (!company) { showToast('Enter company name'); return; }

  var btn = document.getElementById('ats-run-btn');
  btn.disabled = true;
  btn.textContent = 'Analyzing...';

  atsState.jd = jd;
  atsState.company = company;
  atsState.role = role;

  // Show results section, reset all panels
  document.getElementById('ats-results').style.display = '';
  document.getElementById('ats-scores').innerHTML = '<div style="display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px;padding:8px"><span class="spinner"></span> Scoring resume...</div>';
  document.getElementById('ats-repvue-content').innerHTML = '<div style="display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px"><span class="spinner"></span> Fetching RepVue data...</div>';
  document.getElementById('ats-ai-verdict').innerHTML = '<span style="color:var(--muted)">Calculating...</span>';
  document.getElementById('ats-master-pane').textContent = 'Loading master resume...';
  document.getElementById('ats-tailored-pane').innerHTML = '';
  document.getElementById('ats-gaps').innerHTML = '';
  document.getElementById('ats-rewrite-status').textContent = '';

  try {
    // Load master resume (cached after first fetch)
    if (!atsState.masterResume) {
      var resumeResp = await fetch('/api/resume');
      if (!resumeResp.ok && resumeResp.status !== 304) throw new Error('Resume fetch failed: ' + resumeResp.status);
      var resumeData = await resumeResp.json();
      atsState.masterResume = (resumeData && resumeData[0]) ? resumeData[0].content : '';
    }
    if (!atsState.masterResume) throw new Error('Master resume is empty — check Supabase resume_master table');
    document.getElementById('ats-master-pane').textContent = atsState.masterResume;

    // Sequential: score first, then RepVue (avoids rate limits)
    await runKeywordScore(jd, atsState.masterResume);
    renderAIVerdict();
    await runRepVue(company);
  } catch (e) {
    document.getElementById('ats-scores').innerHTML =
      '<div class="error-box"><strong>Analysis error</strong><br><code style="font-size:11px">' + e.message + '</code></div>';
  }

  btn.disabled = false;
  btn.textContent = '⚡ Analyze';
}

// ── Keyword Score ─────────────────────────────────────────────────────────────
async function runKeywordScore(jd, resume) {
  var resp = await fetch('/api/ats-scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'score', jd: jd, resume: resume })
  });
  var data = await resp.json();
  if (!data.ok) throw new Error('Score failed: ' + (data.error || 'unknown'));
  var score = data.result;
  atsState.scoreData = score;

  // Score cards
  document.getElementById('ats-scores').innerHTML =
    atsKpiCard(score.overall_score + '%',   'Overall Match',  scoreColor(score.overall_score)) +
    atsKpiCard(score.hard_skill_score + '%', 'Hard Skills',   scoreColor(score.hard_skill_score)) +
    atsKpiCard(score.soft_skill_score + '%', 'Soft Skills',   scoreColor(score.soft_skill_score)) +
    atsKpiCard(score.verbatim_score + '%',   'Verbatim Match', null) +
    atsKpiCard(score.experience_match + '%', 'Experience Fit', null);

  // Keyword gaps
  var missingHard = (score.missing_hard || []).map(function (t) {
    return '<span class="ats-gap-tag missing-hard">✗ ' + t + '</span>';
  }).join('') || '<span style="font-size:11px;color:var(--green)">No hard gaps ✓</span>';

  var missingSoft = (score.missing_soft || []).map(function (t) {
    return '<span class="ats-gap-tag missing-soft">⚠ ' + t + '</span>';
  }).join('') || '<span style="font-size:11px;color:var(--green)">No soft gaps ✓</span>';

  var matched = (score.matched_keywords || []).map(function (t) {
    return '<span class="ats-gap-tag matched">✓ ' + t + '</span>';
  }).join('');

  var gapsHtml =
    '<div class="ats-gap-col"><div class="ats-gap-col-header" style="color:var(--red)">Missing Hard Skills</div>' + missingHard + '</div>' +
    '<div class="ats-gap-col"><div class="ats-gap-col-header" style="color:var(--yellow)">Missing Soft Skills</div>' + missingSoft + '</div>' +
    '<div class="ats-gap-col"><div class="ats-gap-col-header" style="color:var(--green)">Matched Keywords</div>' + matched + '</div>';

  document.getElementById('ats-gaps').innerHTML = gapsHtml;

  if (score.experience_gap) {
    document.getElementById('ats-gaps').innerHTML +=
      '<div style="grid-column:1/-1;font-size:11px;color:var(--sub);border-top:1px solid var(--border);padding-top:10px;margin-top:4px">'
      + '<strong>Experience note:</strong> ' + score.experience_gap + '</div>';
  }
}

function scoreColor(n) {
  return n >= 70 ? 'green' : n >= 50 ? 'yellow' : 'red';
}

function atsKpiCard(value, label, color) {
  var bg = color === 'green' ? 'var(--green-light)' : color === 'yellow' ? 'var(--yellow-light)' : color === 'red' ? 'var(--red-light)' : 'var(--surface)';
  var fg = color === 'green' ? 'var(--green)' : color === 'yellow' ? 'var(--yellow)' : color === 'red' ? 'var(--red)' : 'var(--text)';
  return '<div class="kpi-card" style="background:' + bg + '">'
    + '<div class="kpi-content">'
    + '<div class="kpi-num" style="color:' + fg + '">' + value + '</div>'
    + '<div class="kpi-label">' + label + '</div>'
    + '</div></div>';
}

// ── RepVue ────────────────────────────────────────────────────────────────────
async function runRepVue(company) {
  var resp = await fetch('/api/ats-scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'repvue', jd: 'n/a', company: company })
  });
  var data = await resp.json();
  var rv = data.result || {};

  // Normalize — model sometimes returns partial/nested JSON
  var flatField = function (v) {
    if (!v) return '—';
    if (typeof v === 'string' || typeof v === 'number') return String(v);
    if (typeof v === 'object') {
      return v.value || v.score || v.percentage || v.attainment || v.rate || v.text
        || (Object.values(v)[0] ? String(Object.values(v)[0]) : '—');
    }
    return '—';
  };

  rv.verdict          = (typeof rv.verdict === 'string' ? rv.verdict : 'yellow') || 'yellow';
  rv.quota_attainment = flatField(rv.quota_attainment);
  rv.rep_satisfaction = flatField(rv.rep_satisfaction);
  rv.culture_score    = flatField(rv.culture_score);
  rv.trend            = (typeof rv.trend === 'string' ? rv.trend : 'unknown') || 'unknown';
  rv.summary          = (rv.summary || data.error || 'No data available').replace(/\*\*/g, '').replace(/---/g, '').trim();
  rv.source           = rv.source || 'estimated';

  var verdictColor = rv.verdict === 'green' ? 'var(--green)' : rv.verdict === 'yellow' ? 'var(--yellow)' : 'var(--red)';
  var verdictBg    = rv.verdict === 'green' ? 'var(--green-light)' : rv.verdict === 'yellow' ? 'var(--yellow-light)' : 'var(--red-light)';
  var verdictLabel = rv.verdict === 'green' ? 'GO' : rv.verdict === 'yellow' ? 'CAUTION' : 'PASS';

  document.getElementById('ats-repvue-content').innerHTML =
    '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:12px">'
    + repvueStat('Quota Attainment', rv.quota_attainment)
    + repvueStat('Rep Satisfaction', rv.rep_satisfaction)
    + repvueStat('Culture Score', rv.culture_score)
    + repvueStat('Trend', rv.trend)
    + '<div class="ats-verdict-badge" style="background:' + verdictBg + ';color:' + verdictColor + '">' + verdictLabel + '</div>'
    + '</div>'
    + '<div style="font-size:12px;color:var(--sub);line-height:1.6;border-top:1px solid var(--border);padding-top:10px">' + rv.summary + '</div>'
    + (rv.source === 'estimated' ? '<div style="font-size:11px;color:var(--muted);margin-top:6px">⚠ Estimated — RepVue page not found directly</div>' : '');
}

function repvueStat(label, value) {
  return '<div class="ats-repvue-stat">'
    + '<div class="ats-repvue-stat-label">' + label + '</div>'
    + '<div class="ats-repvue-stat-val">' + (value || '—') + '</div>'
    + '</div>';
}

// ── AI Verdict ────────────────────────────────────────────────────────────────
function renderAIVerdict() {
  var s = atsState.scoreData;
  if (!s) return;
  var overall  = s.overall_score || 0;
  var hardGaps = (s.missing_hard || []).length;
  var verdict, color, icon;

  if (overall >= 75 && hardGaps <= 2) {
    verdict = 'Strong fit. Keyword alignment and experience match support applying. Lead with deal complexity and multi-stakeholder orchestration early in the screen.';
    color = 'var(--green)'; icon = '✓';
  } else if (overall >= 55) {
    verdict = 'Moderate fit.' + (hardGaps > 3
      ? ' ' + hardGaps + ' hard skill gaps — check whether the tailored resume closes them before applying.'
      : ' Review missing keywords below before submitting.');
    color = 'var(--yellow)'; icon = '⚠';
  } else {
    verdict = 'Weak fit. ' + hardGaps + ' hard skill gaps and an overall score of ' + overall + '% — consider whether this role is the right target.';
    color = 'var(--red)'; icon = '✗';
  }

  document.getElementById('ats-ai-verdict').innerHTML =
    '<div style="display:flex;gap:10px;align-items:flex-start">'
    + '<div style="font-size:16px;color:' + color + ';flex-shrink:0">' + icon + '</div>'
    + '<div style="font-size:12px;color:var(--sub);line-height:1.6">' + verdict + '</div>'
    + '</div>';
}

// ── Generate Tailored Resume ──────────────────────────────────────────────────
async function generateRewrite(btn) {
  if (!atsState.jd || !atsState.masterResume) { showToast('Run analysis first'); return; }
  btn.disabled = true;
  btn.textContent = 'Generating...';
  document.getElementById('ats-rewrite-section').style.display = '';
  document.getElementById('ats-master-pane').textContent = atsState.masterResume;
  document.getElementById('ats-tailored-pane').innerHTML = '<div style="display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px;padding:8px"><span class="spinner"></span> Generating tailored resume...</div>';
  document.getElementById('ats-rewrite-status').textContent = '';

  try {
    var resp = await fetch('/api/ats-scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rewrite', jd: atsState.jd, resume: atsState.masterResume, company: atsState.company, role: atsState.role })
    });
    var data = await resp.json();
    if (!data.ok) throw new Error('Rewrite failed: ' + data.error);
    atsState.tailored = data.result;
    document.getElementById('ats-tailored-pane').textContent = data.result;
    document.getElementById('ats-rewrite-status').textContent = '✓ Ready';
    document.getElementById('ats-apply-btn').style.display = '';
    btn.textContent = 'Regenerate';
  } catch (e) {
    document.getElementById('ats-tailored-pane').innerHTML = '<div class="error-box">' + e.message + '</div>';
    btn.textContent = 'Generate Tailored Resume';
  }
  btn.disabled = false;
}

// ── RapidAPI Literal ATS Check ────────────────────────────────────────────────
async function runRapidAPICheck(btn) {
  if (!atsState.jd)           { showToast('Run the main analysis first'); return; }
  if (!atsState.masterResume) { showToast('No resume loaded yet'); return; }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="display:inline-block;margin-right:6px"></span>Checking...';
  document.getElementById('ats-rapidapi-content').innerHTML =
    '<div style="display:flex;align-items:center;gap:10px;padding:16px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">'
    + '<span class="spinner"></span>'
    + '<div style="font-size:12px;color:var(--muted)">Running literal keyword match...</div>'
    + '</div>';

  try {
    var resp = await fetch('/api/ats-scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rapidapi', jd: atsState.jd, resume: atsState.masterResume })
    });
    var data = await resp.json();
    if (!data.ok) throw new Error(data.error || 'RapidAPI check failed');
    var r = data.result;

    var scoreColor = r.score >= 70 ? 'var(--green)' : r.score >= 50 ? 'var(--yellow)' : 'var(--red)';
    var scoreBg    = r.score >= 70 ? 'var(--green-light)' : r.score >= 50 ? 'var(--yellow-light)' : 'var(--red-light)';

    var html = '<div style="display:flex;align-items:center;gap:16px;margin-bottom:12px">';
    if (r.score !== null) {
      html += '<div style="background:' + scoreBg + ';color:' + scoreColor + ';border-radius:8px;padding:10px 20px;font-size:24px;font-weight:700">' + r.score + '%</div>'
        + '<div style="font-size:12px;color:var(--sub)">Literal keyword match<br><span style="color:var(--muted);font-size:11px">Simulates Workday / Greenhouse / Lever parsers</span></div>';
    } else {
      html += '<div style="font-size:12px;color:var(--muted)">Score not returned by API</div>';
    }
    html += '</div>';

    if (r.missing_keywords && r.missing_keywords.length) {
      html += '<div style="margin-bottom:10px"><div style="font-size:11px;font-weight:600;color:var(--red);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Missing Keywords (' + r.missing_keywords.length + ')</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:4px">' + r.missing_keywords.map(function (k) { return '<span class="ats-gap-tag missing-hard">✗ ' + k + '</span>'; }).join('') + '</div></div>';
    }

    if (r.matched_keywords && r.matched_keywords.length) {
      html += '<div style="margin-bottom:10px"><div style="font-size:11px;font-weight:600;color:var(--green);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Matched Keywords (' + r.matched_keywords.length + ')</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:4px">' + r.matched_keywords.map(function (k) { return '<span class="ats-gap-tag matched">✓ ' + k + '</span>'; }).join('') + '</div></div>';
    }

    if (r.suggestions && r.suggestions.length) {
      html += '<div><div style="font-size:11px;font-weight:600;color:var(--sub);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Suggestions</div>';
      html += r.suggestions.map(function (s) { return '<div style="font-size:11px;color:var(--sub);padding:3px 0;border-bottom:1px solid var(--border)">→ ' + s + '</div>'; }).join('') + '</div>';
    }

    document.getElementById('ats-rapidapi-content').innerHTML = html;
  } catch (e) {
    document.getElementById('ats-rapidapi-content').innerHTML = '<div class="error-box">' + e.message + '</div>';
  }

  btn.disabled = false;
  btn.innerHTML = '↺ Re-run ATS Check <span style="font-size:10px;opacity:.6">(15/day)</span>';
}

// ── Score Tab Switcher ────────────────────────────────────────────────────────
function switchScoreTab(tab, btn) {
  document.getElementById('ats-score-tab-fit').style.display = tab === 'fit' ? '' : 'none';
  document.getElementById('ats-score-tab-ats').style.display = tab === 'ats' ? '' : 'none';
  document.querySelectorAll('.ats-score-tab').forEach(function (b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
}
