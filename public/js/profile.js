// ── Profile Pane ──────────────────────────────────────────────────────────────
var PROFILE_EDIT_DRAFT = {};
var PROFILE_DIRTY = false;

function renderProfilePane() {
  var pane = document.getElementById('pane-profile');
  if (!pane) return;

  // If profile not loaded yet, fetch it first
  if (!window.USER_PROFILE || !window.USER_PROFILE.email) {
    pane.innerHTML = '<div style="display:flex;align-items:center;gap:10px;padding:40px;color:var(--muted)">' + spinnerHTML(16) + ' Loading profile...</div>';
    fetch('/api/profile', { headers: getAuthHeaders() })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.profile) {
          window.USER_PROFILE = d.profile;
          updateProfileDropdown(d.profile);
        }
        renderProfilePane();
      })
      .catch(function() {
        pane.innerHTML = '<div style="padding:40px;color:var(--muted)">Could not load profile.</div>';
      });
    return;
  }

  var p = window.USER_PROFILE;
  PROFILE_EDIT_DRAFT = JSON.parse(JSON.stringify(p));
  PROFILE_DIRTY = false;
  pane.innerHTML = buildProfileHTML(p);
  updateProfileDropdown(p);
}

function buildProfileHTML(p) {
  var intentLabels    = { exploring: 'Just exploring', active: 'Actively looking', urgent: 'Need a job now' };
  var seniorityLabels = { ic: 'Individual Contributor', manager: 'Manager', director: 'Director', vp: 'VP+' };

  var hardChips = (p.hard_skills || []).map(function(s) {
    return '<span class="prof-chip prof-chip-hard">' + esc(s) + '</span>';
  }).join('');
  var softChips = (p.soft_skills || []).map(function(s) {
    return '<span class="prof-chip prof-chip-soft">' + esc(s) + '</span>';
  }).join('');
  var kwChips = (p.resume_keywords || []).map(function(s) {
    return '<span class="prof-chip prof-chip-kw">' + esc(s) + '</span>';
  }).join('');

  var noSkills = !hardChips && !softChips && !kwChips;
  var resumeWords = p.resume_text ? p.resume_text.split(/\s+/).length : 0;

  return '<div class="prof-wrap">'

    // ── Header card
    + '<div class="prof-card prof-header-card">'
    + '<div class="prof-photo-wrap">'
    + '<div class="prof-photo" id="prof-photo-display">'
    + (p.photo_url ? '<img src="' + esc(p.photo_url) + '" alt="Profile">' : '<i class="ti ti-user" style="font-size:32px;color:var(--amber)"></i>')
    + '</div>'
    + '<label class="prof-photo-edit" title="Change photo"><i class="ti ti-camera" style="font-size:13px"></i>'
    + '<input type="file" id="prof-photo-input" accept="image/*" style="display:none" onchange="handleProfilePhoto(this)"></label>'
    + '</div>'
    + '<div class="prof-header-info">'
    + '<div class="prof-name" contenteditable="true" id="prof-name-edit" oninput="markDirty(\'full_name\', this.textContent.trim())">' + esc(p.full_name || 'Your name') + '</div>'
    + '<div class="prof-meta">' + (intentLabels[p.job_search_intent] || 'Job seeker') + ' &nbsp;·&nbsp; ' + (seniorityLabels[p.seniority_level] || 'IC') + '</div>'
    + '</div>'
    + '</div>'

    // ── Contact card
    + '<div class="prof-card">'
    + '<div class="prof-section-title"><i class="ti ti-address-book"></i> Contact</div>'
    + '<div class="prof-field-grid">'
    + profField('Email', 'email', p.email || '', 'email', 'you@email.com')
    + profFieldPhone('Phone', 'phone', p.phone || '')
    + profFieldZip('Zip code', 'zip_code', p.zip_code || '')
    + '</div>'
    + '</div>'

    // ── About card
    + '<div class="prof-card">'
    + '<div class="prof-section-title"><i class="ti ti-pencil"></i> About me</div>'
    + '<div class="prof-field-stack">'
    + profTextarea('Career summary', 'career_summary', p.career_summary || '', 'A 2-3 sentence summary of your background and what you bring...')
    + profTextarea('What I\'m looking for', 'looking_for', p.looking_for || '', 'Ideal next role — company stage, culture, deal complexity...')
    + profTextarea('Working style', 'working_style', p.working_style || '', 'How you operate — how you run deals, collaborate, communicate...')
    + '</div>'
    + '</div>'

    // ── Skills card
    + '<div class="prof-card">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">'
    + '<div class="prof-section-title" style="margin:0"><i class="ti ti-sparkles"></i> Skills &amp; keywords</div>'
    + (noSkills ? '' : '<span style="font-size:11px;color:var(--muted)">Re-upload resume to refresh</span>')
    + '</div>'
    + (noSkills
        ? '<div style="color:var(--muted);font-size:13px">No skills captured yet — upload your resume to populate this automatically.</div>'
        : '<div style="display:flex;flex-direction:column;gap:14px">'
          + (hardChips ? '<div><div class="prof-chip-label">Hard skills</div><div class="prof-chips">' + hardChips + '</div></div>' : '')
          + (softChips ? '<div><div class="prof-chip-label">Soft skills</div><div class="prof-chips">' + softChips + '</div></div>' : '')
          + (kwChips   ? '<div><div class="prof-chip-label">Keywords</div><div class="prof-chips">' + kwChips + '</div></div>' : '')
          + '</div>')
    + '</div>'

    // ── Resume card
    + '<div class="prof-card">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
    + '<div class="prof-section-title" style="margin:0"><i class="ti ti-file-text"></i> Resume</div>'
    + (p.resume_text
        ? '<span class="prof-badge-ok"><i class="ti ti-check"></i> ' + resumeWords.toLocaleString() + ' words</span>'
        : '<span style="font-size:11px;color:var(--muted)">Not uploaded</span>')
    + '</div>'
    + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
    + '<label class="btn btn-secondary" style="cursor:pointer">'
    + '<i class="ti ti-upload" style="font-size:13px"></i> '
    + (p.resume_text ? 'Replace resume' : 'Upload resume')
    + '<input type="file" accept=".pdf,.docx" style="display:none" onchange="handleProfileResumeUpload(this)">'
    + '</label>'
    + '<div id="prof-resume-status" style="font-size:12px;color:var(--muted)"></div>'
    + '</div>'
    + '</div>'

    // ── Save bar
    + '<div class="prof-save-bar">'
    + '<button class="btn btn-primary" id="prof-save-btn" onclick="saveProfile()">'
    + '<i class="ti ti-device-floppy" style="font-size:13px"></i> Save changes</button>'
    + '<span id="prof-save-status" style="font-size:12px;color:var(--muted)"></span>'
    + '</div>'

    + '</div>';
}

// ── Field builders ─────────────────────────────────────────────────────────────
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatPhone(val) {
  // Format raw digits to (xxx) xxx-xxxx
  var d = String(val || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  if (d.length === 10) return '(' + d.slice(0,3) + ') ' + d.slice(3,6) + '-' + d.slice(6);
  return val; // return as-is if not 10 digits
}

function profField(label, key, val, type, placeholder) {
  return '<div class="prof-field">'
    + '<label class="prof-label">' + label + '</label>'
    + '<input class="prof-input" type="' + type + '" value="' + esc(val) + '" placeholder="' + placeholder + '"'
    + ' oninput="markDirty(\'' + key + '\', this.value)">'
    + '</div>';
}

function profFieldZip(label, key, val) {
  return '<div class="prof-field">'
    + '<label class="prof-label">' + label + ' <span class="ob-optional">— for local job filtering</span></label>'
    + '<input class="prof-input" type="text" inputmode="numeric" pattern="[0-9]{5}" maxlength="5"'
    + ' value="' + esc(val) + '" placeholder="06000"'
    + ' oninput="markDirty(\'zip_code\', this.value)">'
    + '</div>';
}

function profTextarea(label, key, val, placeholder) {
  return '<div class="prof-field">'
    + '<label class="prof-label">' + label + '</label>'
    + '<textarea class="prof-input prof-textarea" placeholder="' + placeholder + '" rows="3"'
    + ' oninput="markDirty(\'' + key + '\', this.value)">' + esc(val) + '</textarea>'
    + '</div>';
}

function markDirty(key, val) {
  PROFILE_EDIT_DRAFT[key] = val;
  PROFILE_DIRTY = true;
}

// ── Photo upload ───────────────────────────────────────────────────────────────
function handleProfilePhoto(input) {
  var file = input.files[0];
  if (!file) return;
  if (file.size > 500000) { showToast('Photo too large — keep it under 500KB'); return; }
  var reader = new FileReader();
  reader.onload = function(e) {
    var dataUrl = e.target.result;
    var display = document.getElementById('prof-photo-display');
    if (display) display.innerHTML = '<img src="' + dataUrl + '" alt="Profile" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
    // Store data URL directly as photo_url
    PROFILE_EDIT_DRAFT.photo_url = dataUrl;
    PROFILE_DIRTY = true;
    // Auto-save photo immediately
    saveProfile(function() { showToast('Photo saved'); });
  };
  reader.readAsDataURL(file);
}

// ── Resume upload from profile ─────────────────────────────────────────────────
function handleProfileResumeUpload(input) {
  var file = input.files[0];
  if (!file) return;
  var status = document.getElementById('prof-resume-status');

  // Confirm if resume already exists
  if (window.USER_PROFILE && window.USER_PROFILE.resume_text) {
    if (!confirm('You already have a resume on file. Replace it? Your skills and keywords will be updated automatically.')) {
      input.value = '';
      return;
    }
  }

  if (status) status.innerHTML = spinnerHTML(13) + ' Reading...';

  var reader = new FileReader();
  reader.onload = function(e) {
    var base64 = e.target.result.split(',')[1];
    var isPDF  = file.name.toLowerCase().endsWith('.pdf');
    var body   = { action: 'extract', filename: file.name };
    if (isPDF) body.pdf_base64  = base64;
    else       body.docx_base64 = base64;

    var headers = { 'Authorization': 'Bearer ' + window.SESSION_TOKEN, 'Content-Type': 'application/json' };
    fetch('/api/resume', { method: 'POST', headers: headers, body: JSON.stringify(body) })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (!d.text || d.text.length < 50) {
          if (status) status.textContent = 'Extraction failed — try paste';
          return;
        }
        // Update draft with new resume data
        PROFILE_EDIT_DRAFT.resume_text     = d.text;
        PROFILE_EDIT_DRAFT.hard_skills     = (d.parsed && d.parsed.hard_skills)     || PROFILE_EDIT_DRAFT.hard_skills     || [];
        PROFILE_EDIT_DRAFT.soft_skills     = (d.parsed && d.parsed.soft_skills)     || PROFILE_EDIT_DRAFT.soft_skills     || [];
        PROFILE_EDIT_DRAFT.resume_keywords = (d.parsed && d.parsed.resume_keywords) || PROFILE_EDIT_DRAFT.resume_keywords || [];
        if (d.parsed && d.parsed.career_summary && !PROFILE_EDIT_DRAFT.career_summary) {
          PROFILE_EDIT_DRAFT.career_summary = d.parsed.career_summary;
        }
        if (d.parsed && d.parsed.looking_for && !PROFILE_EDIT_DRAFT.looking_for) {
          PROFILE_EDIT_DRAFT.looking_for = d.parsed.looking_for;
        }
        PROFILE_DIRTY = true;

        // Save immediately then re-render
        saveProfile(function() {
          if (status) status.textContent = '';
          // Re-render profile pane with fresh data
          renderProfilePane();
          showToast('Resume updated — skills and keywords refreshed');
        });
      })
      .catch(function() {
        if (status) status.textContent = 'Upload failed';
      });
  };
  reader.readAsDataURL(file);
}

// ── Save ───────────────────────────────────────────────────────────────────────
function saveProfile(cb) {
  var btn    = document.getElementById('prof-save-btn');
  var status = document.getElementById('prof-save-status');
  if (btn) { btn.disabled = true; btn.innerHTML = spinnerHTML(13) + ' Saving...'; }

  // Build payload — omit empty arrays so API doesn't wipe existing skill data
  var payload = { onboarding_complete: true };
  Object.keys(PROFILE_EDIT_DRAFT).forEach(function(k) {
    var v = PROFILE_EDIT_DRAFT[k];
    // Skip empty arrays — don't overwrite existing DB data with nothing
    if (Array.isArray(v) && v.length === 0) return;
    payload[k] = v;
  });
  payload.user_id = window.SESSION_USER ? window.SESSION_USER.id : null;

  var headers = { 'Authorization': 'Bearer ' + window.SESSION_TOKEN, 'Content-Type': 'application/json' };
  fetch('/api/profile', { method: 'POST', headers: headers, body: JSON.stringify(payload) })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-device-floppy" style="font-size:13px"></i> Save changes'; }
      if (d.success || d.profile) {
        // Merge saved data back into USER_PROFILE
        window.USER_PROFILE = Object.assign(window.USER_PROFILE || {}, payload);
        if (d.profile) window.USER_PROFILE = d.profile;
        PROFILE_DIRTY = false;
        updateProfileDropdown(window.USER_PROFILE);
        if (status) status.textContent = 'Saved ' + new Date().toLocaleTimeString();
        showToast('Profile saved');
        if (typeof cb === 'function') cb();
      } else {
        if (status) status.textContent = 'Save failed';
        showToast('Save failed: ' + (d.error || 'unknown'));
      }
    })
    .catch(function(err) {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-device-floppy" style="font-size:13px"></i> Save changes'; }
      if (status) status.textContent = 'Error';
      showToast('Error: ' + err.message);
    });
}
