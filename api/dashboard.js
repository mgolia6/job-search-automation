export const config = { maxDuration: 60 };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function query(table, params = '') {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  return r.json();
}

async function patch(table, id, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(body)
  });
  return r.json();
}

export default async function handler(req, res) {
  // ── API endpoints ────────────────────────────────────────────────────────
  if (req.method === 'PATCH' && req.url.startsWith('/api/dashboard?update=app')) {
    const { id, status, notes } = req.body || {};
    const result = await patch('applications', id, { status, notes, updated_at: new Date() });
    return res.status(200).json(result);
  }

  if (req.method === 'PATCH' && req.url.startsWith('/api/dashboard?update=job')) {
    const { id, status } = req.body || {};
    const result = await patch('jobs', id, { gut_check: status });
    return res.status(200).json(result);
  }

  // ── Load data ────────────────────────────────────────────────────────────
  const [applications, jobs, alerts] = await Promise.all([
    query('applications', '?order=app_number.asc.nullslast'),
    query('jobs',         '?order=scraped_at.desc&limit=50'),
    query('email_alerts', '?order=sent_at.desc&limit=20')
  ]);

  const appJson  = JSON.stringify(applications  || []);
  const jobsJson = JSON.stringify(jobs          || []);

  // ── Status counts ─────────────────────────────────────────────────────────
  const apps = applications || [];
  const counts = {
    total:       apps.length,
    active:      apps.filter(a => a.status === 'Applied').length,
    interviewing:apps.filter(a => ['Screening','Interviewing'].includes(a.status)).length,
    closed:      apps.filter(a => (a.status||'').startsWith('Closed')).length,
    offers:      apps.filter(a => a.status === 'Offer').length,
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Job Search — Matthew Golia</title>
<style>
  :root {
    --bg:      #0f1117;
    --surface: #1a1d27;
    --border:  #2a2d3a;
    --accent:  #6c63ff;
    --green:   #22c55e;
    --yellow:  #eab308;
    --red:     #ef4444;
    --blue:    #3b82f6;
    --text:    #e2e8f0;
    --muted:   #64748b;
    --card:    #1e2130;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; line-height: 1.5; }

  header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; }
  header h1 { font-size: 18px; font-weight: 700; letter-spacing: -0.3px; }
  header span { color: var(--muted); font-size: 12px; }

  .tabs { display: flex; gap: 2px; background: var(--surface); border-bottom: 1px solid var(--border); padding: 0 24px; }
  .tab { padding: 12px 20px; cursor: pointer; border-bottom: 2px solid transparent; color: var(--muted); font-weight: 500; font-size: 13px; transition: all .15s; }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  .tab:hover:not(.active) { color: var(--text); }

  .pane { display: none; padding: 24px; }
  .pane.active { display: block; }

  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .stat { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
  .stat-num { font-size: 28px; font-weight: 800; line-height: 1; }
  .stat-label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .5px; margin-top: 4px; }
  .stat.green .stat-num { color: var(--green); }
  .stat.yellow .stat-num { color: var(--yellow); }
  .stat.red .stat-num { color: var(--red); }
  .stat.blue .stat-num { color: var(--blue); }

  .filters { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
  .filter-btn { padding: 6px 14px; border-radius: 20px; border: 1px solid var(--border); background: var(--surface); color: var(--muted); cursor: pointer; font-size: 12px; font-weight: 500; transition: all .15s; }
  .filter-btn.active, .filter-btn:hover { background: var(--accent); color: white; border-color: var(--accent); }

  .search-bar { width: 100%; padding: 10px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-size: 14px; margin-bottom: 16px; outline: none; }
  .search-bar:focus { border-color: var(--accent); }

  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 10px 12px; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .5px; border-bottom: 1px solid var(--border); white-space: nowrap; }
  td { padding: 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
  tr:hover td { background: rgba(108,99,255,.04); }

  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .badge.applied   { background: rgba(59,130,246,.15);  color: var(--blue);   }
  .badge.screening { background: rgba(234,179,8,.15);   color: var(--yellow); }
  .badge.interview { background: rgba(108,99,255,.15);  color: var(--accent); }
  .badge.offer     { background: rgba(34,197,94,.15);   color: var(--green);  }
  .badge.closed-no { background: rgba(239,68,68,.12);   color: var(--red);    }
  .badge.closed-pass { background: rgba(100,116,139,.15); color: var(--muted); }

  .gut-apply  { color: var(--green);  font-weight: 700; }
  .gut-maybe  { color: var(--yellow); font-weight: 700; }
  .gut-pass   { color: var(--red);    font-weight: 700; }

  .warm { color: var(--accent); font-size: 11px; }
  .company-name { font-weight: 600; }
  .role-name { color: var(--muted); font-size: 12px; margin-top: 2px; }
  .date { color: var(--muted); font-size: 12px; }
  .salary { font-size: 12px; color: var(--green); }

  .edit-btn { background: none; border: 1px solid var(--border); border-radius: 6px; color: var(--muted); padding: 3px 8px; font-size: 11px; cursor: pointer; }
  .edit-btn:hover { border-color: var(--accent); color: var(--accent); }

  .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.7); z-index: 200; align-items: center; justify-content: center; }
  .modal-overlay.open { display: flex; }
  .modal { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 24px; width: 480px; max-width: 95vw; max-height: 90vh; overflow-y: auto; }
  .modal h3 { font-size: 16px; margin-bottom: 16px; }
  .modal label { display: block; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 4px; margin-top: 12px; }
  .modal select, .modal textarea { width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text); padding: 8px 10px; font-size: 13px; outline: none; }
  .modal select:focus, .modal textarea:focus { border-color: var(--accent); }
  .modal textarea { min-height: 80px; resize: vertical; }
  .modal-actions { display: flex; gap: 8px; margin-top: 20px; justify-content: flex-end; }
  .btn-primary { background: var(--accent); color: white; border: none; border-radius: 6px; padding: 8px 18px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-cancel  { background: none; border: 1px solid var(--border); color: var(--muted); border-radius: 6px; padding: 8px 18px; font-size: 13px; cursor: pointer; }
  .btn-primary:hover { opacity: .9; }

  .job-card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 16px; margin-bottom: 12px; }
  .job-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
  .job-card-company { font-weight: 700; font-size: 15px; }
  .job-card-role { color: var(--muted); font-size: 13px; margin-top: 2px; }
  .job-card-meta { display: flex; gap: 16px; font-size: 12px; color: var(--muted); margin-top: 8px; }
  .job-card-salary { color: var(--green); font-weight: 600; }
  .apply-link { display: inline-block; margin-top: 10px; padding: 6px 14px; background: var(--accent); color: white; border-radius: 6px; font-size: 12px; font-weight: 600; text-decoration: none; }
  .apply-link:hover { opacity: .85; }

  .empty { color: var(--muted); text-align: center; padding: 48px; font-size: 14px; }

  @media (max-width: 600px) {
    .pane { padding: 16px; }
    header { padding: 12px 16px; }
    .tabs { padding: 0 16px; overflow-x: auto; }
    td, th { padding: 8px; }
    .stats { grid-template-columns: repeat(2, 1fr); }
  }
</style>
</head>
<body>

<header>
  <h1>⚡ Job Search</h1>
  <span id="last-updated">Matthew Golia · ${new Date().toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'})}</span>
</header>

<div class="tabs">
  <div class="tab active" onclick="switchTab('pipeline')">Pipeline</div>
  <div class="tab" onclick="switchTab('scraper')">Scraper Feed</div>
</div>

<div id="pane-pipeline" class="pane active">
  <div class="stats">
    <div class="stat blue"><div class="stat-num">${counts.total}</div><div class="stat-label">Total Applied</div></div>
    <div class="stat yellow"><div class="stat-num">${counts.active}</div><div class="stat-label">Active</div></div>
    <div class="stat green"><div class="stat-num">${counts.interviewing}</div><div class="stat-label">Interviewing</div></div>
    <div class="stat red"><div class="stat-num">${counts.closed}</div><div class="stat-label">Closed</div></div>
  </div>

  <input class="search-bar" type="text" placeholder="Search company, role, contact..." oninput="filterApps(this.value)" id="app-search">

  <div class="filters" id="status-filters">
    <button class="filter-btn active" onclick="setStatusFilter('all',this)">All</button>
    <button class="filter-btn" onclick="setStatusFilter('Applied',this)">Applied</button>
    <button class="filter-btn" onclick="setStatusFilter('Screening',this)">Screening</button>
    <button class="filter-btn" onclick="setStatusFilter('Interviewing',this)">Interviewing</button>
    <button class="filter-btn" onclick="setStatusFilter('Offer',this)">Offer</button>
    <button class="filter-btn" onclick="setStatusFilter('Closed',this)">Closed</button>
    <button class="filter-btn" onclick="setStatusFilter('warm',this)">Warm Only</button>
  </div>

  <div style="overflow-x:auto;">
  <table id="app-table">
    <thead><tr>
      <th>#</th><th>Company</th><th>Role</th><th>Status</th><th>Date</th><th>Salary</th><th>Warm Contact</th><th></th>
    </tr></thead>
    <tbody id="app-tbody"></tbody>
  </table>
  </div>
</div>

<div id="pane-scraper" class="pane">
  <div id="scraper-feed"></div>
</div>

<!-- Edit modal -->
<div class="modal-overlay" id="edit-modal">
  <div class="modal">
    <h3 id="modal-title">Update Application</h3>
    <input type="hidden" id="modal-id">
    <label>Status</label>
    <select id="modal-status">
      <option>Applied</option>
      <option>Screening</option>
      <option>Interviewing</option>
      <option>Offer</option>
      <option>Closed — No</option>
      <option>Closed — Pass</option>
    </select>
    <label>Notes</label>
    <textarea id="modal-notes"></textarea>
    <div class="modal-actions">
      <button class="btn-cancel" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="saveEdit()">Save</button>
    </div>
  </div>
</div>

<script>
const APPS = ${appJson};
const JOBS = ${jobsJson};

let statusFilter = 'all';
let searchQuery  = '';

function badgeClass(status) {
  if (!status) return 'applied';
  const s = status.toLowerCase();
  if (s === 'applied')      return 'applied';
  if (s === 'screening')    return 'screening';
  if (s === 'interviewing') return 'interview';
  if (s === 'offer')        return 'offer';
  if (s.includes('no'))     return 'closed-no';
  if (s.includes('pass'))   return 'closed-pass';
  return 'applied';
}

function renderApps() {
  const tbody = document.getElementById('app-tbody');
  const q = searchQuery.toLowerCase();

  const filtered = APPS.filter(a => {
    const matchSearch = !q ||
      (a.company||'').toLowerCase().includes(q) ||
      (a.role||'').toLowerCase().includes(q) ||
      (a.warm_contact||'').toLowerCase().includes(q) ||
      (a.recruiter||'').toLowerCase().includes(q) ||
      (a.notes||'').toLowerCase().includes(q);

    const matchStatus = statusFilter === 'all' ? true :
      statusFilter === 'warm' ? !!a.warm_contact && a.warm_contact !== 'None' :
      statusFilter === 'Closed' ? (a.status||'').startsWith('Closed') :
      (a.status||'') === statusFilter;

    return matchSearch && matchStatus;
  });

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">No applications match.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(a => {
    const warm = a.warm_contact && a.warm_contact !== 'None'
      ? '<div class="warm">⚡ ' + a.warm_contact + '</div>' : '';
    const date = a.date_applied
      ? new Date(a.date_applied).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '—';
    return \`<tr>
      <td class="date">#\${a.app_number||'—'}</td>
      <td><div class="company-name">\${a.company}</div><div class="role-name">\${a.role_type||''}</div></td>
      <td style="max-width:220px"><div>\${a.role}</div></td>
      <td><span class="badge \${badgeClass(a.status)}">\${a.status||'—'}</span></td>
      <td class="date">\${date}</td>
      <td class="salary">\${a.salary_range||'—'}</td>
      <td>\${warm}</td>
      <td><button class="edit-btn" onclick='openModal(\${JSON.stringify(a)})'>Edit</button></td>
    </tr>\`;
  }).join('');
}

function renderScraper() {
  const feed = document.getElementById('scraper-feed');
  if (!JOBS.length) {
    feed.innerHTML = '<div class="empty">No scraper results yet. Scraper runs every 30 minutes.</div>';
    return;
  }
  feed.innerHTML = JOBS.map(j => {
    const gut = j.gut_check || '';
    const gutClass = gut.startsWith('APPLY') ? 'gut-apply' : gut.startsWith('MAYBE') ? 'gut-maybe' : 'gut-pass';
    const posted = j.posted_date ? new Date(j.posted_date).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '—';
    return \`<div class="job-card">
      <div class="job-card-header">
        <div>
          <div class="job-card-company">\${j.company}</div>
          <div class="job-card-role">\${j.title}</div>
        </div>
        <span class="\${gutClass}">\${gut.split('—')[0]||gut}</span>
      </div>
      <div class="job-card-meta">
        <span class="job-card-salary">\${j.salary||'Salary N/A'}</span>
        <span>📍 \${j.location||'Remote'}</span>
        <span>📅 \${posted}</span>
      </div>
      \${gut ? '<div style="margin-top:8px;font-size:12px;color:var(--muted)">' + gut + '</div>' : ''}
      \${j.apply_url ? '<a class="apply-link" href="' + j.apply_url + '" target="_blank">Apply →</a>' : ''}
    </div>\`;
  }).join('');
}

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach((t,i) => t.classList.toggle('active', ['pipeline','scraper'][i] === tab));
  document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
  document.getElementById('pane-' + tab).classList.add('active');
}

function setStatusFilter(f, btn) {
  statusFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderApps();
}

function filterApps(q) { searchQuery = q; renderApps(); }

let editingApp = null;
function openModal(app) {
  editingApp = app;
  document.getElementById('modal-id').value    = app.id;
  document.getElementById('modal-title').textContent = app.company + ' — ' + app.role;
  document.getElementById('modal-status').value = app.status || 'Applied';
  document.getElementById('modal-notes').value  = app.notes  || '';
  document.getElementById('edit-modal').classList.add('open');
}
function closeModal() { document.getElementById('edit-modal').classList.remove('open'); }

async function saveEdit() {
  const id     = document.getElementById('modal-id').value;
  const status = document.getElementById('modal-status').value;
  const notes  = document.getElementById('modal-notes').value;

  await fetch('/api/dashboard?update=app', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status, notes })
  });

  // Update local data
  const idx = APPS.findIndex(a => a.id === id);
  if (idx > -1) { APPS[idx].status = status; APPS[idx].notes = notes; }
  closeModal();
  renderApps();
}

// Close modal on overlay click
document.getElementById('edit-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

renderApps();
renderScraper();
</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
}
