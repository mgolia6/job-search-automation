// ── Onboarding ────────────────────────────────────────────────────────────────
// New flow: Intent → Resume Upload → Confirm Inferred → Fill Gaps → Done
// Resume is optional — users without one get a nudge in the app instead.

var PROFILE_DRAFT = {
  full_name: '',
  job_search_intent: '',
  target_titles: [],
  target_locations: [],
  remote_preference: 'any',
  salary_floor_base: null,
  salary_floor_ote: null,
  seniority_level: 'ic',
  resume_text: '',
  hard_skills: [],
  soft_skills: [],
  resume_keywords: [],
};

var PARSED_RESUME = null;   // Claude's structured parse result
var CURRENT_STEP = 1;
var TOTAL_STEPS = 4;
var RESUME_SKIPPED = false;

// ── Entry point ───────────────────────────────────────────────────────────────

function checkOnboarding() {
  fetch('/api/profile', { headers: getAuthHeaders() })
    .then(function(r) { return r.json(); })
    .catch(function() { return { profile: null }; })
    .then(function(d) {
      if (!d.profile || !d.profile.onboarding_complete) {
        // Pre-fill email from auth session
        if (window.SESSION_USER && window.SESSION_USER.email) {
          PROFILE_DRAFT.email = window.SESSION_USER.email;
        }
        showOnboarding();
      } else {
        window.USER_PROFILE = d.profile;
        loadData();
      }
    });
}

function showOnboarding() {
  document.querySelector('main').style.display = 'none';
  document.getElementById('onboarding-overlay').style.display = 'flex';
  renderStep(1);
}

function exitOnboarding() {
  document.getElementById('onboarding-overlay').style.display = 'none';
  document.querySelector('main').style.display = '';
  loadData();
}

// ── Step renderer ─────────────────────────────────────────────────────────────

function renderStep(step) {
  CURRENT_STEP = step;
  var pct = Math.round((step / TOTAL_STEPS) * 100);

  var html = '<div class="ob-card">'
    + '<div class="ob-progress-bar"><div class="ob-progress-fill" style="width:' + pct + '%"></div></div>'
    + '<div class="ob-step-label">Step ' + step + ' of ' + TOTAL_STEPS + '</div>';

  if (step === 1) html += stepIntent();
  else if (step === 2) html += stepResume();
  else if (step === 3) html += stepConfirm();
  else if (step === 4) html += stepGaps();

  html += '</div>';
  document.getElementById('onboarding-content').innerHTML = html;

  if (step === 2) wireResumeUpload();
}

// ── Step 1: Name + Intent ─────────────────────────────────────────────────────

function stepIntent() {
  var intents = [
    { value: 'exploring', emoji: '🔭', label: 'Just exploring', sub: 'Keeping an eye out, not urgent' },
    { value: 'active',    emoji: '🎯', label: 'Actively looking', sub: 'Searching regularly, open to the right thing' },
    { value: 'urgent',    emoji: '⚡', label: 'Need a job now', sub: 'Urgency is real, volume matters' },
  ];

  var cards = intents.map(function(i) {
    var active = PROFILE_DRAFT.job_search_intent === i.value ? ' ob-intent-active' : '';
    return '<div class="ob-intent-card' + active + '" onclick="selectIntent(\'' + i.value + '\')">'
      + '<div class="ob-intent-emoji">' + i.emoji + '</div>'
      + '<div class="ob-intent-label">' + i.label + '</div>'
      + '<div class="ob-intent-sub">' + i.sub + '</div>'
      + '</div>';
  }).join('');

  return '<div class="ob-header">'
    + '<div class="ob-icon">👋</div>'
    + '<h2 class="ob-title">Welcome to Job Odyssey</h2>'
    + '<p class="ob-sub">Let\'s get you set up. Takes about 2 minutes.</p>'
    + '</div>'
    + '<div class="ob-body">'
    + '<div class="ob-field-row">'
    + '<div class="ob-field">'
    + '<label class="ob-label">First name</label>'
    + '<input class="ob-input" id="ob-firstname" type="text" placeholder="First" value="' + (PROFILE_DRAFT.full_name.split(' ')[0] || '') + '">'
    + '</div>'
    + '<div class="ob-field">'
    + '<label class="ob-label">Last name</label>'
    + '<input class="ob-input" id="ob-lastname" type="text" placeholder="Last" value="' + (PROFILE_DRAFT.full_name.split(' ').slice(1).join(' ') || '') + '">'
    + '</div>'
    + '</div>'
    + '<div class="ob-field">'
    + '<label class="ob-label">Where are you in your search?</label>'
    + '<div class="ob-intent-grid">' + cards + '</div>'
    + '</div>'
    + '</div>'
    + '<div class="ob-actions">'
    + '<div></div>'
    + '<button class="btn btn-primary" onclick="nextStep1()">Continue →</button>'
    + '</div>';
}

function selectIntent(val) {
  PROFILE_DRAFT.job_search_intent = val;
  document.querySelectorAll('.ob-intent-card').forEach(function(el) {
    el.classList.remove('ob-intent-active');
  });
  event.currentTarget.classList.add('ob-intent-active');
}

function nextStep1() {
  var first = (document.getElementById('ob-firstname').value || '').trim();
  var last  = (document.getElementById('ob-lastname').value || '').trim();
  if (!first) { showToast('Enter your first name'); return; }
  if (!PROFILE_DRAFT.job_search_intent) { showToast('Select where you are in your search'); return; }
  PROFILE_DRAFT.full_name = (first + ' ' + last).trim();
  renderStep(2);
}

// ── Step 2: Resume Upload ─────────────────────────────────────────────────────

function stepResume() {
  return '<div class="ob-header">'
    + '<div class="ob-icon">📄</div>'
    + '<h2 class="ob-title">Add your resume</h2>'
    + '<p class="ob-sub">We\'ll read it and pre-fill your profile — no manual entry. PDF, Word, or paste.</p>'
    + '</div>'
    + '<div class="ob-body">'
    + '<div class="ob-resume-tabs">'
    + '<button class="ob-res-tab ob-res-tab-active" id="tab-upload" onclick="switchResumeTab(\'upload\')">Upload file</button>'
    + '<button class="ob-res-tab" id="tab-paste" onclick="switchResumeTab(\'paste\')">Paste text</button>'
    + '</div>'
    + '<div id="resume-upload-pane">'
    + '<div class="ob-drop-zone" id="ob-drop-zone">'
    + '<div class="ob-drop-icon">📎</div>'
    + '<div class="ob-drop-label">Drop file here or <label for="ob-file-input" class="ob-file-link">browse</label></div>'
    + '<div class="ob-drop-sub">PDF or Word (.docx) supported</div>'
    + '<input type="file" id="ob-file-input" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style="display:none">'
    + '</div>'
    + '<div id="ob-upload-status"></div>'
    + '</div>'
    + '<div id="resume-paste-pane" style="display:none">'
    + '<textarea class="ob-textarea" id="ob-resume-text" placeholder="Paste your resume text here...">' + (PROFILE_DRAFT.resume_text || '') + '</textarea>'
    + '</div>'
    + '</div>'
    + '<div class="ob-actions">'
    + '<button class="btn btn-ghost" onclick="renderStep(1)">← Back</button>'
    + '<div style="display:flex;gap:10px">'
    + '<button class="btn btn-ghost" onclick="skipResume()" style="color:var(--muted);font-size:12px">Skip for now</button>'
    + '<button class="btn btn-primary" id="ob-resume-next" onclick="nextStep2()">Continue →</button>'
    + '</div>'
    + '</div>';
}

function switchResumeTab(tab) {
  document.getElementById('resume-upload-pane').style.display = tab === 'upload' ? '' : 'none';
  document.getElementById('resume-paste-pane').style.display  = tab === 'paste'  ? '' : 'none';
  document.getElementById('tab-upload').className = 'ob-res-tab' + (tab === 'upload' ? ' ob-res-tab-active' : '');
  document.getElementById('tab-paste').className  = 'ob-res-tab' + (tab === 'paste'  ? ' ob-res-tab-active' : '');
}

function wireResumeUpload() {
  setTimeout(function() {
    var fileInput = document.getElementById('ob-file-input');
    var dropZone  = document.getElementById('ob-drop-zone');
    if (!fileInput || !dropZone) return;

    fileInput.addEventListener('change', function() {
      if (fileInput.files[0]) handleFileUpload(fileInput.files[0]);
    });
    dropZone.addEventListener('dragover', function(e) {
      e.preventDefault();
      dropZone.classList.add('ob-drop-over');
    });
    dropZone.addEventListener('dragleave', function() {
      dropZone.classList.remove('ob-drop-over');
    });
    dropZone.addEventListener('drop', function(e) {
      e.preventDefault();
      dropZone.classList.remove('ob-drop-over');
      var file = e.dataTransfer.files[0];
      if (file) handleFileUpload(file);
      else showToast('Drop a PDF or Word file');
    });
  }, 100);
}

function handleFileUpload(file) {
  var status = document.getElementById('ob-upload-status');
  var isPDF  = file.type === 'application/pdf' || file.name.endsWith('.pdf');
  var isDOCX = file.name.endsWith('.docx') || file.type.includes('wordprocessingml');

  if (!isPDF && !isDOCX) {
    showToast('PDF or .docx only — or use paste');
    return;
  }

  status.innerHTML = '<div class="ob-upload-msg">⏳ Reading ' + file.name + '...</div>';
  document.getElementById('ob-resume-next').disabled = true;

  var reader = new FileReader();
  reader.onload = function(e) {
    var base64 = e.target.result.split(',')[1];
    var body = {
      action: 'extract',
      filename: file.name
    };
    if (isPDF)  body.pdf_base64  = base64;
    if (isDOCX) body.docx_base64 = base64;

    fetch('/api/resume', {
      method: 'POST',
      headers: Object.assign({}, getAuthHeaders(), { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body)
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      document.getElementById('ob-resume-next').disabled = false;
      if (d.text && d.text.length > 50) {
        PROFILE_DRAFT.resume_text = d.text;
        PARSED_RESUME = d.parsed || null;
        var words = d.word_count || d.text.split(/\s+/).length;
        status.innerHTML = '<div class="ob-upload-success">✅ ' + file.name + ' — ' + words + ' words extracted'
          + (d.parsed ? ' · Profile inferred ✨' : '')
          + '</div>';
      } else {
        status.innerHTML = '<div class="ob-upload-error">⚠ Couldn\'t extract text — try the paste tab</div>';
      }
    })
    .catch(function() {
      document.getElementById('ob-resume-next').disabled = false;
      status.innerHTML = '<div class="ob-upload-error">⚠ Upload failed — try paste instead</div>';
    });
  };
  reader.readAsDataURL(file);
}

function skipResume() {
  RESUME_SKIPPED = true;
  PROFILE_DRAFT.resume_text = '';
  PARSED_RESUME = null;
  // Jump straight to gaps — no inference step
  renderStep(4);
}

function nextStep2() {
  // Check paste tab
  var pasteEl = document.getElementById('ob-resume-text');
  if (pasteEl && pasteEl.value.trim()) {
    var text = pasteEl.value.trim();
    if (text.length < 50) { showToast('Resume text seems too short'); return; }
    PROFILE_DRAFT.resume_text = text;

    // If no parsed result yet (paste path), call extract with plain_text
    if (!PARSED_RESUME) {
      var btn = document.getElementById('ob-resume-next');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Analyzing...';

      fetch('/api/resume', {
        method: 'POST',
        headers: Object.assign({}, getAuthHeaders(), { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'extract', plain_text: text })
      })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        PARSED_RESUME = d.parsed || null;
        btn.disabled = false;
        btn.innerHTML = 'Continue →';
        renderStep(3);
      })
      .catch(function() {
        btn.disabled = false;
        btn.innerHTML = 'Continue →';
        renderStep(3); // proceed even without parse
      });
      return;
    }
  }

  if (!PROFILE_DRAFT.resume_text) {
    showToast('Upload or paste your resume, or skip');
    return;
  }

  renderStep(3);
}

// ── Step 3: Confirm Inferred ──────────────────────────────────────────────────

function stepConfirm() {
  // If we have parsed data, pre-populate PROFILE_DRAFT
  if (PARSED_RESUME) {
    if (PARSED_RESUME.target_titles && PARSED_RESUME.target_titles.length) {
      PROFILE_DRAFT.target_titles = PARSED_RESUME.target_titles;
    }
    if (PARSED_RESUME.hard_skills)    PROFILE_DRAFT.hard_skills    = PARSED_RESUME.hard_skills;
    if (PARSED_RESUME.soft_skills)    PROFILE_DRAFT.soft_skills    = PARSED_RESUME.soft_skills;
    if (PARSED_RESUME.resume_keywords) PROFILE_DRAFT.resume_keywords = PARSED_RESUME.resume_keywords;
    if (PARSED_RESUME.inferred_seniority) PROFILE_DRAFT.seniority_level = PARSED_RESUME.inferred_seniority;
  }

  var summary = PARSED_RESUME
    ? '<div class="ob-inferred-summary">' + (PARSED_RESUME.summary || '') + '</div>'
    : '';

  var titleChips = PROFILE_DRAFT.target_titles.map(function(t) {
    return '<span class="ob-chip">' + t + ' <button class="ob-chip-remove" onclick="removeConfirmTitle(\'' + t.replace(/'/g,"\'") + '\')">×</button></span>';
  }).join('');

  var hardChips = PROFILE_DRAFT.hard_skills.slice(0, 15).map(function(s) {
    return '<span class="ob-skill-chip ob-chip-hard">' + s + '</span>';
  }).join('');

  var softChips = PROFILE_DRAFT.soft_skills.slice(0, 8).map(function(s) {
    return '<span class="ob-skill-chip ob-chip-soft">' + s + '</span>';
  }).join('');

  var seniorityOpts = [
    ['ic','Individual Contributor'],['manager','Manager'],['director','Director'],['vp','VP+']
  ].map(function(pair) {
    var active = PROFILE_DRAFT.seniority_level === pair[0] ? ' ob-toggle-active' : '';
    return '<button class="ob-toggle' + active + '" onclick="setConfirmSeniority(\'' + pair[0] + '\')">' + pair[1] + '</button>';
  }).join('');

  return '<div class="ob-header">'
    + '<div class="ob-icon">✨</div>'
    + '<h2 class="ob-title">Here\'s what we found</h2>'
    + '<p class="ob-sub">We read your resume. Confirm or adjust — this drives everything.</p>'
    + '</div>'
    + '<div class="ob-body">'
    + summary
    + '<div class="ob-field">'
    + '<label class="ob-label">Target roles <span class="ob-optional">— edit as needed</span></label>'
    + '<div class="ob-chips" id="ob-confirm-chips">' + titleChips + '</div>'
    + '<input class="ob-input" id="ob-add-title" type="text" placeholder="Add a role title..." style="margin-top:8px">'
    + '<button class="btn btn-ghost" onclick="addConfirmTitle()" style="margin-top:6px;font-size:12px">+ Add</button>'
    + '</div>'
    + '<div class="ob-field">'
    + '<label class="ob-label">Seniority</label>'
    + '<div class="ob-toggle-group" id="ob-confirm-seniority">' + seniorityOpts + '</div>'
    + '</div>'
    + (hardChips ? '<div class="ob-field">'
      + '<label class="ob-label">Hard skills we found</label>'
      + '<div class="ob-skill-chips">' + hardChips + '</div>'
      + '</div>' : '')
    + (softChips ? '<div class="ob-field">'
      + '<label class="ob-label">Soft skills we found</label>'
      + '<div class="ob-skill-chips">' + softChips + '</div>'
      + '</div>' : '')
    + '</div>'
    + '<div class="ob-actions">'
    + '<button class="btn btn-ghost" onclick="renderStep(2)">← Back</button>'
    + '<button class="btn btn-primary" onclick="nextStep3()">Continue →</button>'
    + '</div>';
}

function removeConfirmTitle(title) {
  PROFILE_DRAFT.target_titles = PROFILE_DRAFT.target_titles.filter(function(t) { return t !== title; });
  var chips = document.getElementById('ob-confirm-chips');
  if (chips) chips.innerHTML = PROFILE_DRAFT.target_titles.map(function(t) {
    return '<span class="ob-chip">' + t + ' <button class="ob-chip-remove" onclick="removeConfirmTitle(\'' + t.replace(/'/g,"\'") + '\')">×</button></span>';
  }).join('');
}

function addConfirmTitle() {
  var input = document.getElementById('ob-add-title');
  var val = (input.value || '').trim();
  if (!val) return;
  if (PROFILE_DRAFT.target_titles.indexOf(val) === -1) {
    PROFILE_DRAFT.target_titles.push(val);
  }
  input.value = '';
  var chips = document.getElementById('ob-confirm-chips');
  if (chips) chips.innerHTML = PROFILE_DRAFT.target_titles.map(function(t) {
    return '<span class="ob-chip">' + t + ' <button class="ob-chip-remove" onclick="removeConfirmTitle(\'' + t.replace(/'/g,"\'") + '\')">×</button></span>';
  }).join('');
}

function setConfirmSeniority(val) {
  PROFILE_DRAFT.seniority_level = val;
  document.querySelectorAll('#ob-confirm-seniority .ob-toggle').forEach(function(btn) {
    btn.classList.remove('ob-toggle-active');
  });
  event.target.classList.add('ob-toggle-active');
}

function nextStep3() {
  if (!PROFILE_DRAFT.target_titles.length) { showToast('Add at least one target role'); return; }
  renderStep(4);
}

// ── Step 4: Fill Gaps + Review ────────────────────────────────────────────────

function stepGaps() {
  var remoteOpts = [
    ['remote','🌐 Remote'],['hybrid','🏢 Hybrid'],['onsite','🏛 On-site'],['any','⚡ Any']
  ].map(function(pair) {
    var active = PROFILE_DRAFT.remote_preference === pair[0] ? ' ob-toggle-active' : '';
    return '<button class="ob-toggle' + active + '" onclick="setGapRemote(\'' + pair[0] + '\')">' + pair[1] + '</button>';
  }).join('');

  // If skipped resume, also show role picker
  var roleSection = '';
  if (RESUME_SKIPPED) {
    roleSection = '<div class="ob-field">'
      + '<label class="ob-label">What roles are you targeting?</label>'
      + '<input class="ob-input" id="ob-gap-titles" type="text" placeholder="e.g. Enterprise Account Executive, Strategic AE">'
      + '<div class="ob-hint" style="margin-top:4px">Separate multiple roles with commas</div>'
      + '</div>';
  }

  return '<div class="ob-header">'
    + '<div class="ob-icon">💰</div>'
    + '<h2 class="ob-title">' + (RESUME_SKIPPED ? 'A few quick questions' : 'Almost done') + '</h2>'
    + '<p class="ob-sub">Last few things — then you\'re in.</p>'
    + '</div>'
    + '<div class="ob-body">'
    + roleSection
    + '<div class="ob-field-row">'
    + '<div class="ob-field">'
    + '<label class="ob-label">Base salary minimum</label>'
    + '<div class="ob-input-prefix-wrap"><span class="ob-prefix">$</span>'
    + '<input class="ob-input ob-input-prefix" id="ob-base" type="number" placeholder="150,000" value="' + (PROFILE_DRAFT.salary_floor_base || '') + '" min="0" step="5000">'
    + '</div></div>'
    + '<div class="ob-field">'
    + '<label class="ob-label">OTE minimum <span class="ob-optional">(optional)</span></label>'
    + '<div class="ob-input-prefix-wrap"><span class="ob-prefix">$</span>'
    + '<input class="ob-input ob-input-prefix" id="ob-ote" type="number" placeholder="250,000" value="' + (PROFILE_DRAFT.salary_floor_ote || '') + '" min="0" step="10000">'
    + '</div></div>'
    + '</div>'
    + '<div class="ob-field">'
    + '<label class="ob-label">Remote preference</label>'
    + '<div class="ob-toggle-group" id="ob-remote-group">' + remoteOpts + '</div>'
    + '</div>'
    + '<div class="ob-field">'
    + '<label class="ob-label">Target locations <span class="ob-optional">(optional — blank = national)</span></label>'
    + '<input class="ob-input" id="ob-locations" type="text" placeholder="e.g. New York, Boston, Connecticut" value="' + PROFILE_DRAFT.target_locations.join(', ') + '">'
    + '</div>'
    + '</div>'
    + '<div class="ob-actions">'
    + '<button class="btn btn-ghost" onclick="renderStep(' + (RESUME_SKIPPED ? 1 : 3) + ')">← Back</button>'
    + '<button class="btn btn-primary" id="ob-finish-btn" onclick="finishOnboarding()">Launch Job Odyssey 🚀</button>'
    + '</div>';
}

function setGapRemote(val) {
  PROFILE_DRAFT.remote_preference = val;
  document.querySelectorAll('#ob-remote-group .ob-toggle').forEach(function(btn) {
    btn.classList.remove('ob-toggle-active');
  });
  event.target.classList.add('ob-toggle-active');
}

// ── Save Profile ──────────────────────────────────────────────────────────────

function finishOnboarding() {
  var btn = document.getElementById('ob-finish-btn');

  // Collect gap fields
  var base = parseInt(document.getElementById('ob-base').value);
  var ote  = parseInt(document.getElementById('ob-ote').value);
  if (!base || base < 1) { showToast('Enter a base salary minimum'); return; }
  PROFILE_DRAFT.salary_floor_base = base;
  PROFILE_DRAFT.salary_floor_ote  = ote || null;

  var locs = (document.getElementById('ob-locations').value || '').trim();
  PROFILE_DRAFT.target_locations = locs
    ? locs.split(',').map(function(l) { return l.trim(); }).filter(Boolean)
    : [];

  // If resume was skipped, collect manually entered titles
  var gapTitles = document.getElementById('ob-gap-titles');
  if (gapTitles && gapTitles.value.trim()) {
    PROFILE_DRAFT.target_titles = gapTitles.value.split(',').map(function(t) { return t.trim(); }).filter(Boolean);
  }

  if (!PROFILE_DRAFT.target_titles.length) { showToast('Add at least one target role'); return; }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving...';

  var payload = {
    user_id:             window.SESSION_USER ? window.SESSION_USER.id : null,
    full_name:           PROFILE_DRAFT.full_name,
    email:               PROFILE_DRAFT.email || (window.SESSION_USER && window.SESSION_USER.email),
    job_search_intent:   PROFILE_DRAFT.job_search_intent,
    target_titles:       PROFILE_DRAFT.target_titles,
    target_locations:    PROFILE_DRAFT.target_locations,
    remote_preference:   PROFILE_DRAFT.remote_preference,
    salary_floor_base:   PROFILE_DRAFT.salary_floor_base,
    salary_floor_ote:    PROFILE_DRAFT.salary_floor_ote,
    seniority_level:     PROFILE_DRAFT.seniority_level,
    resume_text:         PROFILE_DRAFT.resume_text || null,
    hard_skills:         PROFILE_DRAFT.hard_skills,
    soft_skills:         PROFILE_DRAFT.soft_skills,
    resume_keywords:     PROFILE_DRAFT.resume_keywords,
    onboarding_complete: true
  };

  fetch('/api/profile', {
    method: 'POST',
    headers: Object.assign({}, getAuthHeaders(), { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  })
  .then(function(r) {
    if (!r.ok) return r.text().then(function(t) { throw new Error(r.status + ': ' + t); });
    return r.json();
  })
  .then(function(d) {
    if (d.success) {
      window.USER_PROFILE = payload;
      showToast('Welcome to Job Odyssey, ' + PROFILE_DRAFT.full_name.split(' ')[0] + '!');
      setTimeout(function() {
        exitOnboarding();
        switchTab('pipeline', document.querySelector('.tab'));
      }, 800);
    } else {
      btn.disabled = false;
      btn.innerHTML = 'Launch Job Odyssey 🚀';
      showToast('⚠ Save failed: ' + (d.error || JSON.stringify(d)));
    }
  })
  .catch(function(err) {
    btn.disabled = false;
    btn.innerHTML = 'Launch Job Odyssey 🚀';
    showToast('⚠ ' + err.message);
  });
}
