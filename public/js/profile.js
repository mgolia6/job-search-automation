// ── Profile Pane ──────────────────────────────────────────────────────────────

var PROFILE_EDIT_DRAFT = {};
var PROFILE_PHOTO_BASE64 = null;

function renderProfilePane() {
  var pane = document.getElementById('pane-profile');
  if (!pane) return;
  var p = window.USER_PROFILE || {};

  var hardChips = (p.hard_skills || []).map(function(s) {
    return '<span class="prof-chip prof-chip-hard">' + s + '</span>';
  }).join('');
  var softChips = (p.soft_skills || []).map(function(s) {
    return '<span class="prof-chip prof-chip-soft">' + s + '</span>';
  }).join('');
  var kwChips = (p.resume_keywords || []).map(function(s) {
    return '<span class="prof-chip prof-chip-kw">' + s + '</span>';
  }).join('');

  var intentLabels = { exploring: 'Just exploring', active: 'Actively looking', urgent: 'Need a job now' };
  var seniorityLabels = { ic: 'Individual Contributor', manager: 'Manager', director: 'Director', vp: 'VP+' };

  pane.innerHTML = '<div class="prof-wrap">'

    // ── Header card
    + '<div class="prof-card prof-header-card">'
    + '<div class="prof-photo-wrap">'
    + '<div class="prof-photo" id="prof-photo-display">'
    + (p.photo_url
        ? '<img src="' + p.photo_url + '" alt="Profile photo">'
        : '<i class="ti ti-user" style="font-size:32px;color:var(--amber)"></i>')
    + '</div>'
    + '<label class="prof-photo-edit" title="Change photo">'
    + '<i class="ti ti-camera" style="font-size:13px"></i>'
    + '<input type="file" id="prof-photo-input" accept="image/*" style="display:none" onchange="handleProfilePhoto(this)">'
    + '</label>'
    + '</div>'
    + '<div class="prof-header-info">'
    + '<div class="prof-name" contenteditable="true" id="prof-name-edit" onblur="profileFieldChange(\'full_name\', this.textContent)">' + (p.full_name || 'Your name') + '</div>'
    + '<div class="prof-meta">' + (intentLabels[p.job_search_intent] || 'Job seeker') + ' &nbsp;·&nbsp; ' + (seniorityLabels[p.seniority_level] || 'IC') + '</div>'
    + '</div>'
    + '</div>'

    // ── Contact card
    + '<div class="prof-card">'
    + '<div class="prof-section-title"><i class="ti ti-address-book"></i> Contact</div>'
    + '<div class="prof-field-grid">'
    + profField('Email', 'email', p.email || '', 'email', 'you@email.com')
    + profField('Phone', 'phone', p.phone || '', 'tel', '+1 (555) 000-0000')
    + profField('Location', 'location_display', (p.target_locations || []).join(', '), 'text', 'City, State')
    + '</div>'
    + '</div>'

    // ── About card
    + '<div class="prof-card">'
    + '<div class="prof-section-title"><i class="ti ti-pencil"></i> About me</div>'
    + '<div class="prof-field-stack">'
    + profTextarea('Career summary', 'career_summary', p.career_summary || '', 'A 2-3 sentence summary of your background and what you bring to an enterprise sales role...')
    + profTextarea('What I\'m looking for', 'looking_for', p.looking_for || '', 'Describe your ideal next role — company stage, culture, deal complexity, team structure...')
    + profTextarea('Working style', 'working_style', p.working_style || '', 'How you operate — how you run deals, collaborate, and communicate...')
    + '</div>'
    + '</div>'

    // ── Skills card
    + '<div class="prof-card">'
    + '<div class="prof-section-title"><i class="ti ti-sparkles"></i> Skills &amp; keywords</div>'
    + '<div style="display:flex;flex-direction:column;gap:14px">'
    + (hardChips ? '<div><div class="prof-chip-label">Hard skills</div><div class="prof-chips">' + hardChips + '</div></div>' : '')
    + (softChips ? '<div><div class="prof-chip-label">Soft skills</div><div class="prof-chips">' + softChips + '</div></div>' : '')
    + (kwChips   ? '<div><div class="prof-chip-label">Keywords</div><div class="prof-chips">' + kwChips + '</div></div>' : '')
    + (!hardChips && !softChips && !kwChips
        ? '<div style="color:var(--muted);font-size:13px;padding:8px 0">No skills captured yet — upload your resume to populate this automatically.</div>'
        : '')
    + '</div>'
    + '</div>'

    // ── Resume card
    + '<div class="prof-card">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'
    + '<div class="prof-section-title" style="margin:0"><i class="ti ti-file-text"></i> Resume</div>'
    + (p.resume_text
        ? '<span style="font-size:11px;color:var(--green);background:var(--green-light);padding:3px 8px;border-radius:12px"><i class="ti ti-check" style="font-size:11px"></i> Loaded</span>'
        : '<span style="font-size:11px;color:var(--muted)">Not uploaded</span>')
    + '</div>'
    + (p.resume_text
        ? '<div style="font-size:12px;color:var(--muted)">' + (p.resume_text.split(/\s+/).length).toLocaleString() + ' words · Last updated ' + (p.resume_uploaded_at ? new Date(p.resume_uploaded_at).toLocaleDateString() : 'unknown') + '</div>'
        : '')
    + '<div style="margin-top:12px;display:flex;gap:8px">'
    + '<label class="btn btn-secondary" style="cursor:pointer">'
    + '<i class="ti ti-upload" style="font-size:13px"></i> ' + (p.resume_text ? 'Replace resume' : 'Upload resume')
    + '<input type="file" accept=".pdf,.docx" style="display:none" onchange="handleProfileResumeUpload(this)">'
    + '</label>'
    + '</div>'
    + '</div>'

    // ── Save bar
    + '<div class="prof-save-bar">'
    + '<button class="btn btn-primary" id="prof-save-btn" onclick="saveProfile()"><i class="ti ti-device-floppy" style="font-size:13px"></i> Save changes</button>'
    + '<span id="prof-save-status" style="font-size:12px;color:var(--muted)"></span>'
    + '</div>'

    + '</div>';

  // Init edit draft
  PROFILE_EDIT_DRAFT = Object.assign({}, p);
  updateProfileDropdown(p);
}

function profField(label, key, val, type, placeholder) {
  return '<div class="prof-field">'
    + '<label class="prof-label">' + label + '</label>'
    + '<input class="prof-input" type="' + type + '" value="' + (val || '').replace(/"/g, '&quot;') + '" placeholder="' + placeholder + '" onchange="profileFieldChange(\'' + key + '\', this.value)">'
    + '</div>';
}

function profTextarea(label, key, val, placeholder) {
  return '<div class="prof-field">'
    + '<label class="prof-label">' + label + '</label>'
    + '<textarea class="prof-input prof-textarea" placeholder="' + placeholder + '" rows="3" onchange="profileFieldChange(\'' + key + '\', this.value)">' + (val || '') + '</textarea>'
    + '</div>';
}

function profileFieldChange(key, val) {
  PROFILE_EDIT_DRAFT[key] = val;
}

function handleProfilePhoto(input) {
  var file = input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    PROFILE_PHOTO_BASE64 = e.target.result;
    var display = document.getElementById('prof-photo-display');
    if (display) display.innerHTML = '<img src="' + e.target.result + '" alt="Profile photo" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
    PROFILE_EDIT_DRAFT.photo_data = e.target.result;
  };
  reader.readAsDataURL(file);
}

function handleProfileResumeUpload(input) {
  var file = input.files[0];
  if (!file) return;
  var btn = document.getElementById('prof-save-btn');
  var status = document.getElementById('prof-save-status');
  if (status) status.textContent = 'Reading resume...';

  var reader = new FileReader();
  reader.onload = function(e) {
    var base64 = e.target.result.split(',')[1];
    var isPDF = file.name.toLowerCase().endsWith('.pdf');
    var body = { action: 'extract', filename: file.name };
    if (isPDF) body.pdf_base64 = base64;
    else body.docx_base64 = base64;

    var headers = { 'Authorization': 'Bearer ' + window.SESSION_TOKEN, 'Content-Type': 'application/json' };
    fetch('/api/resume', { method: 'POST', headers: headers, body: JSON.stringify(body) })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d.text) {
          PROFILE_EDIT_DRAFT.resume_text = d.text;
          if (d.parsed) {
            if (d.parsed.hard_skills)     PROFILE_EDIT_DRAFT.hard_skills     = d.parsed.hard_skills;
            if (d.parsed.soft_skills)     PROFILE_EDIT_DRAFT.soft_skills     = d.parsed.soft_skills;
            if (d.parsed.resume_keywords) PROFILE_EDIT_DRAFT.resume_keywords = d.parsed.resume_keywords;
          }
          if (status) status.textContent = 'Resume ready — save to apply';
        } else {
          if (status) status.textContent = 'Extraction failed — try paste';
        }
      })
      .catch(function() { if (status) status.textContent = 'Upload failed'; });
  };
  reader.readAsDataURL(file);
}

function saveProfile() {
  var btn = document.getElementById('prof-save-btn');
  var status = document.getElementById('prof-save-status');
  btn.disabled = true;
  btn.innerHTML = spinnerHTML(13) + ' Saving...';

  var payload = Object.assign({}, PROFILE_EDIT_DRAFT, {
    user_id: window.SESSION_USER ? window.SESSION_USER.id : null,
    onboarding_complete: true,
    updated_at: new Date()
  });

  var headers = { 'Authorization': 'Bearer ' + window.SESSION_TOKEN, 'Content-Type': 'application/json' };
  fetch('/api/profile', { method: 'POST', headers: headers, body: JSON.stringify(payload) })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-device-floppy" style="font-size:13px"></i> Save changes';
      if (d.success || d.profile) {
        window.USER_PROFILE = Object.assign(window.USER_PROFILE || {}, payload);
        updateProfileDropdown(window.USER_PROFILE);
        if (status) status.textContent = 'Saved ' + new Date().toLocaleTimeString();
        showToast('Profile saved');
      } else {
        if (status) status.textContent = 'Save failed';
        showToast('Save failed: ' + (d.error || 'unknown error'));
      }
    })
    .catch(function(err) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-device-floppy" style="font-size:13px"></i> Save changes';
      if (status) status.textContent = 'Error';
      showToast('Error: ' + err.message);
    });
}
