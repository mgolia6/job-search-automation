// ── Onboarding ────────────────────────────────────────────────────────────────
// Step-by-step profile setup. Runs when no profile exists.
// Stub user_id for pre-auth development.

var STUB_USER_ID = '00000000-0000-0000-0000-000000000001';

var CANONICAL_TITLES = [
  { title: 'Enterprise Account Executive',    category: 'sales' },
  { title: 'Strategic Account Executive',     category: 'sales' },
  { title: 'Senior Account Executive',        category: 'sales' },
  { title: 'Mid-Market Account Executive',    category: 'sales' },
  { title: 'Regional Sales Manager',          category: 'sales_management' },
  { title: 'Director of Sales',               category: 'sales_management' },
  { title: 'VP of Sales',                     category: 'sales_leadership' },
  { title: 'Sales Operations Manager',        category: 'sales_ops' },
  { title: 'Revenue Operations Manager',      category: 'sales_ops' },
  { title: 'Account Manager',                 category: 'account_management' },
  { title: 'Customer Success Manager',        category: 'cs' },
  { title: 'Business Development Representative', category: 'sdr' },
  { title: 'Solutions Engineer',              category: 'presales' },
];

var CATEGORY_LABELS = {
  sales: 'Account Executive',
  sales_management: 'Sales Management',
  sales_leadership: 'Sales Leadership',
  sales_ops: 'Sales Operations',
  account_management: 'Account Management',
  cs: 'Customer Success',
  sdr: 'Sales Development',
  presales: 'Pre-Sales',
};

// Profile being built during onboarding
var PROFILE_DRAFT = {
  full_name: '',
  email: '',
  target_titles: [],
  target_locations: [],
  remote_preference: 'any',
  salary_floor_base: null,
  salary_floor_ote: null,
  seniority_level: 'ic',
  resume_text: '',
};

var CURRENT_STEP = 1;
var TOTAL_STEPS = 6;

// ── Entry point ───────────────────────────────────────────────────────────────
function checkOnboarding() {
  fetch('/api/profile?user_id=' + STUB_USER_ID)
    .then(function(r) { return r.json(); })
    .catch(function() { return { profile: null }; })
    .then(function(d) {
      if (!d.profile || !d.profile.onboarding_complete) {
        showOnboarding();
      } else {
        // Profile exists and complete — store it, load main app
        window.USER_PROFILE = d.profile;
        loadData();
      }
    });
}

function showOnboarding() {
  // Hide main app, show onboarding overlay
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

  if (step === 1) html += stepBasicInfo();
  else if (step === 2) html += stepTargetRoles();
  else if (step === 3) html += stepLocation();
  else if (step === 4) html += stepCompensation();
  else if (step === 5) html += stepResume();
  else if (step === 6) html += stepReview();

  html += '</div>';
  document.getElementById('onboarding-content').innerHTML = html;

  // Wire up step-specific interactivity after render
  if (step === 2) wireRoleSearch();
  if (step === 5) wireResumeUpload();
}

// ── Step 1: Basic Info ────────────────────────────────────────────────────────
function stepBasicInfo() {
  return '<div class="ob-header">'
    + '<div class="ob-icon">👋</div>'
    + '<h2 class="ob-title">Let\'s set up your profile</h2>'
    + '<p class="ob-sub">This takes about 3 minutes. Your answers drive everything — the jobs we surface, the resume we tailor, the roles we score.</p>'
    + '</div>'
    + '<div class="ob-body">'
    + '<div class="ob-field">'
    + '<label class="ob-label">Your name</label>'
    + '<input class="ob-input" id="ob-name" type="text" placeholder="First Last" value="' + (PROFILE_DRAFT.full_name || '') + '">'
    + '</div>'
    + '<div class="ob-field">'
    + '<label class="ob-label">Email address</label>'
    + '<input class="ob-input" id="ob-email" type="email" placeholder="you@email.com" value="' + (PROFILE_DRAFT.email || '') + '">'
    + '</div>'
    + '</div>'
    + '<div class="ob-actions">'
    + '<div></div>'
    + '<button class="btn btn-primary" onclick="nextStep1()">Continue →</button>'
    + '</div>';
}

function nextStep1() {
  var name = document.getElementById('ob-name').value.trim();
  var email = document.getElementById('ob-email').value.trim();
  if (!name) { showToast('Enter your name to continue'); return; }
  if (!email || !email.includes('@')) { showToast('Enter a valid email'); return; }
  PROFILE_DRAFT.full_name = name;
  PROFILE_DRAFT.email = email;
  renderStep(2);
}

// ── Step 2: Target Roles ──────────────────────────────────────────────────────
function stepTargetRoles() {
  var selected = PROFILE_DRAFT.target_titles;
  var chips = selected.map(function(t) {
    return '<span class="ob-chip">' + t + ' <button class="ob-chip-remove" onclick="removeTitle(\'' + t.replace(/'/g, "\\'") + '\')">×</button></span>';
  }).join('');

  return '<div class="ob-header">'
    + '<div class="ob-icon">🎯</div>'
    + '<h2 class="ob-title">What roles are you targeting?</h2>'
    + '<p class="ob-sub">Type a role and select from the suggestions. Add as many as apply — these drive the scraper.</p>'
    + '</div>'
    + '<div class="ob-body">'
    + '<div class="ob-field">'
    + '<label class="ob-label">Search roles</label>'
    + '<div class="ob-search-wrap">'
    + '<input class="ob-input" id="ob-role-input" type="text" placeholder="e.g. enterprise sales, account executive..." autocomplete="off">'
    + '<div class="ob-suggestions" id="ob-suggestions"></div>'
    + '</div>'
    + '</div>'
    + '<div class="ob-chips" id="ob-selected-chips">' + chips + '</div>'
    + '<div class="ob-hint">Common picks: Enterprise Account Executive · Strategic Account Executive · Sales Operations Manager</div>'
    + '</div>'
    + '<div class="ob-actions">'
    + '<button class="btn btn-ghost" onclick="renderStep(1)">← Back</button>'
    + '<button class="btn btn-primary" onclick="nextStep2()">Continue →</button>'
    + '</div>';
}

function wireRoleSearch() {
  var input = document.getElementById('ob-role-input');
  if (!input) return;
  input.addEventListener('input', function() {
    var q = input.value.toLowerCase().trim();
    var suggestions = document.getElementById('ob-suggestions');
    if (!q) { suggestions.innerHTML = ''; suggestions.style.display = 'none'; return; }

    var matches = CANONICAL_TITLES.filter(function(ct) {
      if (PROFILE_DRAFT.target_titles.indexOf(ct.title) > -1) return false;
      return ct.title.toLowerCase().includes(q);
    });

    if (!matches.length) { suggestions.innerHTML = ''; suggestions.style.display = 'none'; return; }

    suggestions.style.display = 'block';
    suggestions.innerHTML = matches.map(function(ct) {
      var cat = CATEGORY_LABELS[ct.category] || ct.category;
      return '<div class="ob-suggestion" onclick="selectTitle(\'' + ct.title.replace(/'/g, "\\'") + '\')">'
        + '<span class="ob-sug-title">' + ct.title + '</span>'
        + '<span class="ob-sug-cat">' + cat + '</span>'
        + '</div>';
    }).join('');
  });

  // Close suggestions on outside click
  document.addEventListener('click', function(e) {
    var wrap = document.getElementById('ob-suggestions');
    if (wrap && !wrap.contains(e.target) && e.target.id !== 'ob-role-input') {
      wrap.style.display = 'none';
    }
  });
}

function selectTitle(title) {
  if (PROFILE_DRAFT.target_titles.indexOf(title) === -1) {
    PROFILE_DRAFT.target_titles.push(title);
  }
  document.getElementById('ob-role-input').value = '';
  document.getElementById('ob-suggestions').style.display = 'none';

  // Re-render chips inline
  var chipsEl = document.getElementById('ob-selected-chips');
  chipsEl.innerHTML = PROFILE_DRAFT.target_titles.map(function(t) {
    return '<span class="ob-chip">' + t + ' <button class="ob-chip-remove" onclick="removeTitle(\'' + t.replace(/'/g, "\\'") + '\')">×</button></span>';
  }).join('');
}

function removeTitle(title) {
  PROFILE_DRAFT.target_titles = PROFILE_DRAFT.target_titles.filter(function(t) { return t !== title; });
  var chipsEl = document.getElementById('ob-selected-chips');
  if (chipsEl) {
    chipsEl.innerHTML = PROFILE_DRAFT.target_titles.map(function(t) {
      return '<span class="ob-chip">' + t + ' <button class="ob-chip-remove" onclick="removeTitle(\'' + t.replace(/'/g, "\\'") + '\')">×</button></span>';
    }).join('');
  }
}

function nextStep2() {
  if (!PROFILE_DRAFT.target_titles.length) { showToast('Add at least one target role'); return; }
  renderStep(3);
}

// ── Step 3: Location ──────────────────────────────────────────────────────────
function stepLocation() {
  return '<div class="ob-header">'
    + '<div class="ob-icon">📍</div>'
    + '<h2 class="ob-title">Where do you want to work?</h2>'
    + '<p class="ob-sub">Enter cities, states, or regions. Set your remote preference below.</p>'
    + '</div>'
    + '<div class="ob-body">'
    + '<div class="ob-field">'
    + '<label class="ob-label">Target locations <span class="ob-optional">(optional — leave blank for national)</span></label>'
    + '<input class="ob-input" id="ob-locations" type="text" placeholder="e.g. New York, Boston, Connecticut" value="' + PROFILE_DRAFT.target_locations.join(', ') + '">'
    + '</div>'
    + '<div class="ob-field">'
    + '<label class="ob-label">Remote preference</label>'
    + '<div class="ob-toggle-group" id="ob-remote-group">'
    + ['remote','hybrid','onsite','any'].map(function(v) {
        var labels = { remote: '🌐 Remote', hybrid: '🏢 Hybrid', onsite: '🏛 On-site', any: '⚡ Any' };
        var active = PROFILE_DRAFT.remote_preference === v ? ' ob-toggle-active' : '';
        return '<button class="ob-toggle' + active + '" onclick="setRemote(\'' + v + '\')">' + labels[v] + '</button>';
      }).join('')
    + '</div>'
    + '</div>'
    + '</div>'
    + '<div class="ob-actions">'
    + '<button class="btn btn-ghost" onclick="renderStep(2)">← Back</button>'
    + '<button class="btn btn-primary" onclick="nextStep3()">Continue →</button>'
    + '</div>';
}

function setRemote(val) {
  PROFILE_DRAFT.remote_preference = val;
  document.querySelectorAll('.ob-toggle').forEach(function(btn) {
    btn.classList.remove('ob-toggle-active');
  });
  event.target.classList.add('ob-toggle-active');
}

function nextStep3() {
  var locs = document.getElementById('ob-locations').value.trim();
  PROFILE_DRAFT.target_locations = locs ? locs.split(',').map(function(l) { return l.trim(); }).filter(Boolean) : [];
  renderStep(4);
}

// ── Step 4: Compensation ──────────────────────────────────────────────────────
function stepCompensation() {
  return '<div class="ob-header">'
    + '<div class="ob-icon">💰</div>'
    + '<h2 class="ob-title">What\'s your compensation floor?</h2>'
    + '<p class="ob-sub">We use this to filter out roles below your target. OTE = base + variable at full quota.</p>'
    + '</div>'
    + '<div class="ob-body">'
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
    + '<label class="ob-label">Seniority level</label>'
    + '<div class="ob-toggle-group">'
    + [['ic','Individual Contributor'],['manager','Manager'],['director','Director'],['vp','VP+']].map(function(pair) {
        var active = PROFILE_DRAFT.seniority_level === pair[0] ? ' ob-toggle-active' : '';
        return '<button class="ob-toggle' + active + '" onclick="setSeniority(\'' + pair[0] + '\')">' + pair[1] + '</button>';
      }).join('')
    + '</div>'
    + '</div>'
    + '</div>'
    + '<div class="ob-actions">'
    + '<button class="btn btn-ghost" onclick="renderStep(3)">← Back</button>'
    + '<button class="btn btn-primary" onclick="nextStep4()">Continue →</button>'
    + '</div>';
}

function setSeniority(val) {
  PROFILE_DRAFT.seniority_level = val;
  document.querySelectorAll('.ob-toggle').forEach(function(btn) { btn.classList.remove('ob-toggle-active'); });
  event.target.classList.add('ob-toggle-active');
}

function nextStep4() {
  var base = parseInt(document.getElementById('ob-base').value);
  var ote = parseInt(document.getElementById('ob-ote').value);
  if (!base || base < 1) { showToast('Enter a base salary minimum'); return; }
  PROFILE_DRAFT.salary_floor_base = base;
  PROFILE_DRAFT.salary_floor_ote = ote || null;
  renderStep(5);
}

// ── Step 5: Resume ────────────────────────────────────────────────────────────
function stepResume() {
  return '<div class="ob-header">'
    + '<div class="ob-icon">📄</div>'
    + '<h2 class="ob-title">Add your resume</h2>'
    + '<p class="ob-sub">Paste the text from your resume below, or upload a PDF. This is stored in your profile and used for all scoring and tailoring.</p>'
    + '</div>'
    + '<div class="ob-body">'
    + '<div class="ob-resume-tabs">'
    + '<button class="ob-res-tab ob-res-tab-active" id="tab-paste" onclick="switchResumeTab(\'paste\')">Paste text</button>'
    + '<button class="ob-res-tab" id="tab-upload" onclick="switchResumeTab(\'upload\')">Upload PDF</button>'
    + '</div>'
    + '<div id="resume-paste-pane">'
    + '<textarea class="ob-textarea" id="ob-resume-text" placeholder="Paste your resume text here...">' + (PROFILE_DRAFT.resume_text || '') + '</textarea>'
    + '</div>'
    + '<div id="resume-upload-pane" style="display:none">'
    + '<div class="ob-drop-zone" id="ob-drop-zone">'
    + '<div class="ob-drop-icon">📎</div>'
    + '<div class="ob-drop-label">Drop PDF here or <label for="ob-file-input" class="ob-file-link">browse</label></div>'
    + '<div class="ob-drop-sub">PDF only — text will be extracted and stored</div>'
    + '<input type="file" id="ob-file-input" accept=".pdf" style="display:none">'
    + '</div>'
    + '<div id="ob-upload-status"></div>'
    + '</div>'
    + '</div>'
    + '<div class="ob-actions">'
    + '<button class="btn btn-ghost" onclick="renderStep(4)">← Back</button>'
    + '<button class="btn btn-primary" onclick="nextStep5()">Continue →</button>'
    + '</div>';
}

function switchResumeTab(tab) {
  document.getElementById('resume-paste-pane').style.display = tab === 'paste' ? '' : 'none';
  document.getElementById('resume-upload-pane').style.display = tab === 'upload' ? '' : 'none';
  document.getElementById('tab-paste').className = 'ob-res-tab' + (tab === 'paste' ? ' ob-res-tab-active' : '');
  document.getElementById('tab-upload').className = 'ob-res-tab' + (tab === 'upload' ? ' ob-res-tab-active' : '');
}

function wireResumeUpload() {
  setTimeout(function() {
    var fileInput = document.getElementById('ob-file-input');
    var dropZone = document.getElementById('ob-drop-zone');
    if (!fileInput || !dropZone) return;

    fileInput.addEventListener('change', function() {
      if (fileInput.files[0]) handlePDFUpload(fileInput.files[0]);
    });
    dropZone.addEventListener('dragover', function(e) { e.preventDefault(); dropZone.classList.add('ob-drop-over'); });
    dropZone.addEventListener('dragleave', function() { dropZone.classList.remove('ob-drop-over'); });
    dropZone.addEventListener('drop', function(e) {
      e.preventDefault();
      dropZone.classList.remove('ob-drop-over');
      var file = e.dataTransfer.files[0];
      if (file && file.type === 'application/pdf') handlePDFUpload(file);
      else showToast('PDF files only');
    });
  }, 100);
}

function handlePDFUpload(file) {
  var status = document.getElementById('ob-upload-status');
  status.innerHTML = '<div class="ob-upload-msg">⏳ Reading ' + file.name + '...</div>';

  var reader = new FileReader();
  reader.onload = function(e) {
    // Send to API for text extraction
    fetch('/api/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'extract', pdf_base64: e.target.result.split(',')[1], filename: file.name })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.text) {
        PROFILE_DRAFT.resume_text = d.text;
        status.innerHTML = '<div class="ob-upload-success">✅ ' + file.name + ' — ' + d.text.split(' ').length + ' words extracted</div>';
      } else {
        status.innerHTML = '<div class="ob-upload-error">⚠ Extraction failed — try paste instead</div>';
      }
    })
    .catch(function() {
      status.innerHTML = '<div class="ob-upload-error">⚠ Upload failed — try paste instead</div>';
    });
  };
  reader.readAsDataURL(file);
}

function nextStep5() {
  var pasted = document.getElementById('ob-resume-text');
  if (pasted && pasted.value.trim()) PROFILE_DRAFT.resume_text = pasted.value.trim();
  if (!PROFILE_DRAFT.resume_text) { showToast('Add your resume to continue'); return; }
  renderStep(6);
}

// ── Step 6: Review & Confirm ──────────────────────────────────────────────────
function stepReview() {
  var remoteLabels = { remote: '🌐 Remote', hybrid: '🏢 Hybrid', onsite: '🏛 On-site', any: '⚡ Any' };
  var seniorityLabels = { ic: 'Individual Contributor', manager: 'Manager', director: 'Director', vp: 'VP+' };

  return '<div class="ob-header">'
    + '<div class="ob-icon">✅</div>'
    + '<h2 class="ob-title">Looks good?</h2>'
    + '<p class="ob-sub">Review your profile. You can always update these in Settings.</p>'
    + '</div>'
    + '<div class="ob-body">'
    + '<div class="ob-review-grid">'
    + reviewRow('Name', PROFILE_DRAFT.full_name)
    + reviewRow('Email', PROFILE_DRAFT.email)
    + reviewRow('Target Roles', PROFILE_DRAFT.target_titles.join(', '))
    + reviewRow('Locations', PROFILE_DRAFT.target_locations.length ? PROFILE_DRAFT.target_locations.join(', ') : 'National')
    + reviewRow('Remote', remoteLabels[PROFILE_DRAFT.remote_preference])
    + reviewRow('Base Floor', '$' + (PROFILE_DRAFT.salary_floor_base || 0).toLocaleString())
    + (PROFILE_DRAFT.salary_floor_ote ? reviewRow('OTE Floor', '$' + PROFILE_DRAFT.salary_floor_ote.toLocaleString()) : '')
    + reviewRow('Seniority', seniorityLabels[PROFILE_DRAFT.seniority_level])
    + reviewRow('Resume', PROFILE_DRAFT.resume_text.split(' ').length + ' words loaded')
    + '</div>'
    + '</div>'
    + '<div class="ob-actions">'
    + '<button class="btn btn-ghost" onclick="renderStep(5)">← Back</button>'
    + '<button class="btn btn-primary" id="ob-finish-btn" onclick="finishOnboarding()">Launch Job Odyssey 🚀</button>'
    + '</div>';
}

function reviewRow(label, value) {
  return '<div class="ob-review-row">'
    + '<div class="ob-review-label">' + label + '</div>'
    + '<div class="ob-review-value">' + value + '</div>'
    + '</div>';
}

// ── Save Profile ──────────────────────────────────────────────────────────────
function finishOnboarding() {
  var btn = document.getElementById('ob-finish-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving...';

  var payload = Object.assign({}, PROFILE_DRAFT, {
    user_id: STUB_USER_ID,
    onboarding_complete: true
  });

  fetch('/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(function(r) {
    if (!r.ok) {
      return r.text().then(function(t) { throw new Error(r.status + ': ' + t); });
    }
    return r.json();
  })
  .then(function(d) {
    if (d.success) {
      showToast('Profile saved — welcome to Job Odyssey!');
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
