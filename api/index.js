export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Job Search — Matthew Golia</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;900&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--bg:#0a0d1a;--surface:#0f1221;--card:#16192a;--border:#1e2340;--accent:#4f46e5;--accent-light:#818cf8;--green:#22c55e;--yellow:#f59e0b;--red:#ef4444;--blue:#3b82f6;--purple:#a78bfa;--text:#e2e8f0;--muted:#4a5170;--sub:#6c7aad}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'DM Sans',system-ui,sans-serif;font-size:14px;line-height:1.5;min-height:100vh}
header{background:var(--surface);border-bottom:1px solid var(--border);padding:0 24px;display:flex;align-items:center;justify-content:space-between;height:56px;position:sticky;top:0;z-index:50}
.logo{display:flex;align-items:center;gap:10px;font-weight:900;font-size:16px;letter-spacing:-.3px}
.logo span{color:var(--muted);font-weight:400;font-size:12px;margin-left:4px}
.tabs{background:var(--surface);border-bottom:1px solid var(--border);display:flex;padding:0 24px}
.tab{padding:12px 20px;cursor:pointer;border:none;border-bottom:2px solid transparent;color:var(--muted);font-weight:600;font-size:13px;background:none;font-family:inherit;transition:all .15s}
.tab.active{color:var(--accent-light);border-bottom-color:var(--accent)}
.pane{display:none;padding:24px;max-width:1200px;margin:0 auto}
.pane.active{display:block}
.stats{display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap}
.stat{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:18px 20px;flex:1;min-width:110px}
.stat-num{font-size:32px;font-weight:900;line-height:1;font-family:'DM Mono',monospace}
.stat-label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-top:6px}
.filters{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}
.fbtn{padding:5px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--muted);font-family:inherit;transition:all .15s}
.fbtn.active,.fbtn:hover{background:var(--accent);color:white;border-color:var(--accent)}
.search{width:100%;padding:10px 14px;background:var(--card);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;margin-bottom:16px;outline:none;font-family:inherit}
.search:focus{border-color:var(--accent)}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:9px 12px;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid var(--border);white-space:nowrap}
td{padding:11px 12px;border-bottom:1px solid var(--border);vertical-align:middle}
tr:hover td{background:rgba(79,70,229,.04)}
.company{font-weight:700;font-size:13px}
.sub{font-size:11px;color:var(--muted);margin-top:2px}
.badge{display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap}
.warm{font-size:11px;color:var(--accent-light)}
.salary{font-size:12px;color:var(--green)}
.num{color:var(--muted);font-size:12px}
.edit-btn{background:none;border:1px solid var(--border);border-radius:6px;color:var(--muted);padding:3px 10px;font-size:11px;cursor:pointer;font-family:inherit}
.edit-btn:hover{border-color:var(--accent);color:var(--accent-light)}
.overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:999;align-items:center;justify-content:center;padding:20px}
.overlay.open{display:flex}
.modal{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:28px;width:460px;max-width:100%}
.modal h3{font-size:17px;font-weight:700;margin-bottom:20px}
.modal-meta{font-size:12px;color:var(--sub);margin-bottom:4px}
label{display:block;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;margin-top:14px}
select,textarea{width:100%;background:var(--card);border:1px solid var(--border);border-radius:8px;color:var(--text);padding:9px 12px;font-size:13px;outline:none;font-family:inherit}
select:focus,textarea:focus{border-color:var(--accent)}
textarea{min-height:80px;resize:vertical}
.modal-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:20px}
.btn-cancel{background:none;border:1px solid var(--border);color:var(--muted);border-radius:8px;padding:8px 18px;font-size:13px;cursor:pointer;font-family:inherit}
.btn-save{background:var(--accent);border:none;color:white;border-radius:8px;padding:8px 20px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
.job-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:12px}
.job-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
.job-company{font-weight:800;font-size:15px}
.job-role{font-size:13px;color:var(--sub);margin-top:2px}
.job-meta{display:flex;gap:16px;font-size:12px;color:var(--muted);flex-wrap:wrap}
.job-gut{font-size:12px;margin-top:8px;color:var(--muted)}
.apply-btn{display:inline-block;margin-top:12px;padding:6px 16px;background:var(--accent);color:white;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none}
.empty{text-align:center;padding:64px;color:var(--muted)}
.error-box{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:10px;padding:16px;color:var(--red);font-size:13px;margin-bottom:20px}
@media(max-width:640px){.pane{padding:16px}header{padding:0 16px}.tabs{padding:0 16px;overflow-x:auto}.stats{flex-wrap:wrap}.stat{min-width:calc(50% - 6px)}}
</style>
</head>
<body>

<header>
  <div class="logo">⚡ Job Search <span>Matthew Golia</span></div>
  <span id="hdr-date" style="font-size:11px;color:var(--muted)"></span>
</header>

<div class="tabs">
  <button class="tab active" onclick="switchTab('pipeline',this)">Pipeline</button>
  <button class="tab" onclick="switchTab('scraper',this)">Scraper Feed</button>
</div>

<div id="pane-pipeline" class="pane active"><div class="empty">Loading...</div></div>
<div id="pane-scraper"  class="pane"><div class="empty">Loading...</div></div>

<div class="overlay" id="modal">
  <div class="modal">
    <div class="modal-meta" id="modal-meta"></div>
    <h3 id="modal-title"></h3>
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
    <textarea id="modal-notes" rows="4"></textarea>
    <div class="modal-actions">
      <button class="btn-cancel" onclick="closeModal()">Cancel</button>
      <button class="btn-save"   onclick="saveEdit()">Save</button>
    </div>
  </div>
</div>

<script>
var SUPA_URL  = "https://yaepgxsbjtbdkiidxtmf.supabase.co";
var SUPA_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhZXBneHNianRiZGtpaWR4dG1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNzI4MjksImV4cCI6MjA5NDk0ODgyOX0.UXNAz76lwghgFuC9QLsuVEPq6Njoq1nwLLkEsOQXl0U";
var APPS = [], JOBS = [], statusFilter = 'all', searchQuery = '';

document.getElementById('hdr-date').textContent =
  new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});

var STATUS_COLORS = {
  'Applied':       {color:'#3b82f6', bg:'rgba(59,130,246,.12)'},
  'Screening':     {color:'#f59e0b', bg:'rgba(245,158,11,.12)'},
  'Interviewing':  {color:'#a78bfa', bg:'rgba(167,139,250,.12)'},
  'Offer':         {color:'#22c55e', bg:'rgba(34,197,94,.12)'},
  'Closed — No':   {color:'#ef4444', bg:'rgba(239,68,68,.10)'},
  'Closed — Pass': {color:'#64748b', bg:'rgba(100,116,139,.12)'}
};

function badge(status) {
  var cfg = STATUS_COLORS[status] || STATUS_COLORS['Applied'];
  return '<span class="badge" style="color:'+cfg.color+';background:'+cfg.bg+'">'+(status||'—')+'</span>';
}

function dbFetch(table, params) {
  return fetch(SUPA_URL+'/rest/v1/'+table+(params||''), {
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer '+SUPA_KEY }
  }).then(function(r){ return r.json(); });
}

function dbPatch(table, id, body) {
  return fetch(SUPA_URL+'/rest/v1/'+table+'?id=eq.'+id, {
    method: 'PATCH',
    headers: { apikey: SUPA_KEY, Authorization: 'Bearer '+SUPA_KEY,
               'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body)
  }).then(function(r){ return r.json(); });
}

Promise.all([
  dbFetch('applications','?order=app_number.asc.nullslast&limit=100'),
  dbFetch('jobs','?order=scraped_at.desc&limit=50')
]).then(function(results) {
  APPS = results[0] || [];
  JOBS = results[1] || [];
  renderPipeline();
  renderScraper();
}).catch(function(e) {
  document.getElementById('pane-pipeline').innerHTML =
    '<div class="error-box">Could not connect to Supabase: '+e.message+'</div>';
});

function renderPipeline() {
  var total  = APPS.length;
  var active = APPS.filter(function(a){ return a.status==='Applied'; }).length;
  var live   = APPS.filter(function(a){ return a.status==='Screening'||a.status==='Interviewing'; }).length;
  var closed = APPS.filter(function(a){ return (a.status||'').indexOf('Closed')>-1; }).length;

  var html = '<div class="stats">'
    +'<div class="stat"><div class="stat-num" style="color:#3b82f6">'+total+'</div><div class="stat-label">Total Applied</div></div>'
    +'<div class="stat"><div class="stat-num" style="color:#f59e0b">'+active+'</div><div class="stat-label">Awaiting Reply</div></div>'
    +'<div class="stat"><div class="stat-num" style="color:#a78bfa">'+live+'</div><div class="stat-label">In Process</div></div>'
    +'<div class="stat"><div class="stat-num" style="color:#ef4444">'+closed+'</div><div class="stat-label">Closed</div></div>'
    +'</div>'
    +'<div class="filters">'
    +['all','Applied','Screening','Interviewing','Offer','Closed','warm'].map(function(f){
      return '<button class="fbtn'+(f==='all'?' active':'')+'" onclick="setFilter(''+f+'',this)">'
        +(f==='warm'?'⚡ Warm':f==='all'?'All':f)+'</button>';
    }).join('')
    +'</div>'
    +'<input class="search" type="text" placeholder="Search company, role, contact..." oninput="filterApps(this.value)">'
    +'<div style="overflow-x:auto"><table>'
    +'<thead><tr><th>#</th><th>Company</th><th>Role</th><th>Status</th><th>Date</th><th>Salary</th><th>Contact</th><th></th></tr></thead>'
    +'<tbody id="app-tbody"></tbody></table></div>';

  document.getElementById('pane-pipeline').innerHTML = html;
  renderRows();
}

function renderRows() {
  var q = searchQuery.toLowerCase();
  var filtered = APPS.filter(function(a) {
    var ms = !q || [a.company,a.role,a.warm_contact,a.recruiter,a.notes]
      .some(function(f){ return (f||'').toLowerCase().indexOf(q)>-1; });
    var mf = statusFilter==='all' ? true
      : statusFilter==='warm' ? (!!a.warm_contact && a.warm_contact!=='None')
      : statusFilter==='Closed' ? (a.status||'').indexOf('Closed')>-1
      : (a.status||'')===statusFilter;
    return ms && mf;
  });

  var tbody = document.getElementById('app-tbody');
  if (!tbody) return;
  if (!filtered.length) { tbody.innerHTML='<tr><td colspan="8" class="empty">No matches.</td></tr>'; return; }

  tbody.innerHTML = filtered.map(function(a) {
    var warm = (a.warm_contact && a.warm_contact!=='None') ? '<div class="warm">⚡ '+a.warm_contact+'</div>' : '';
    var date = a.date_applied
      ? new Date(a.date_applied).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '—';
    var safeA = encodeURIComponent(JSON.stringify(a));
    return '<tr>'
      +'<td class="num">#'+(a.app_number||'?')+'</td>'
      +'<td><div class="company">'+a.company+'</div><div class="sub">'+(a.role_type||'')+'</div></td>'
      +'<td style="max-width:200px;font-size:13px">'+a.role+'</td>'
      +'<td>'+badge(a.status)+'</td>'
      +'<td class="num">'+date+'</td>'
      +'<td class="salary">'+(a.salary_range||'—')+'</td>'
      +'<td>'+warm+'</td>'
      +'<td><button class="edit-btn" onclick="openModal(decodeURIComponent(''+safeA+''))">Edit</button></td>'
      +'</tr>';
  }).join('');
}

function renderScraper() {
  var el = document.getElementById('pane-scraper');
  if (!JOBS.length) {
    el.innerHTML = '<div class="empty"><div style="font-size:32px;margin-bottom:12px">🔍</div>'
      +'<div style="font-weight:700;margin-bottom:8px">No scraper results yet</div>'
      +'<div style="font-size:13px">Runs every 30 min — roles posted in last 2 days only</div></div>';
    return;
  }
  el.innerHTML = JOBS.map(function(j) {
    var gut = j.gut_check||'';
    var gc  = gut.indexOf('APPLY')>-1?'#22c55e':gut.indexOf('MAYBE')>-1?'#f59e0b':'#ef4444';
    var posted = j.posted_date
      ? new Date(j.posted_date).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '—';
    return '<div class="job-card">'
      +'<div class="job-header"><div>'
      +'<div class="job-company">'+j.company+'</div>'
      +'<div class="job-role">'+j.title+'</div>'
      +'</div>'
      +(gut?'<span style="font-weight:800;font-size:12px;color:'+gc+'">'+gut.split('—')[0].trim()+'</span>':'')
      +'</div>'
      +'<div class="job-meta">'
      +'<span style="color:#22c55e;font-weight:600">'+(j.salary||'Salary N/A')+'</span>'
      +'<span>'+(j.location||'Remote')+'</span>'
      +'<span>'+posted+'</span>'
      +'</div>'
      +(gut?'<div class="job-gut">'+gut+'</div>':'')
      +(j.apply_url?'<a class="apply-btn" href="'+j.apply_url+'" target="_blank">Apply →</a>':'')
      +'</div>';
  }).join('');
}

function switchTab(t, btn) {
  document.querySelectorAll('.tab').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
  document.querySelectorAll('.pane').forEach(function(p){ p.classList.remove('active'); });
  document.getElementById('pane-'+t).classList.add('active');
}

function setFilter(f, btn) {
  statusFilter = f;
  document.querySelectorAll('.fbtn').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
  renderRows();
}

function filterApps(q) { searchQuery = q; renderRows(); }

function openModal(encoded) {
  var a = JSON.parse(encoded);
  document.getElementById('modal-id').value    = a.id;
  document.getElementById('modal-meta').textContent = '#'+(a.app_number||'?')+' · '+(a.role_type||'');
  document.getElementById('modal-title').textContent = a.company+' — '+a.role;
  document.getElementById('modal-status').value = a.status||'Applied';
  document.getElementById('modal-notes').value  = a.notes||'';
  document.getElementById('modal').classList.add('open');
}

function closeModal() { document.getElementById('modal').classList.remove('open'); }

document.getElementById('modal').addEventListener('click', function(e) {
  if (e.target === e.currentTarget) closeModal();
});

function saveEdit() {
  var id     = document.getElementById('modal-id').value;
  var status = document.getElementById('modal-status').value;
  var notes  = document.getElementById('modal-notes').value;
  dbPatch('applications', id, { status: status, notes: notes, updated_at: new Date() })
    .then(function() {
      for (var i=0; i<APPS.length; i++) {
        if (APPS[i].id===id) { APPS[i].status=status; APPS[i].notes=notes; break; }
      }
      closeModal();
      renderRows();
    });
}
</script>
</body>
</html>`);
}
