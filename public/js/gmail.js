// ── Gmail Scan ────────────────────────────────────────────────────────────────
function runGmailScan(btn) {
  btn.disabled = true;
  btn.innerHTML = '' + spinnerHTML() + ' Scanning...';
  var resultsEl = document.getElementById('scan-results');
  resultsEl.style.display = 'none';
  resultsEl.innerHTML = '';

  fetch('/api/gmail-scan', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + CRON_SECRET,
      'Content-Type': 'application/json'
    }
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      btn.disabled = false;
      btn.innerHTML = 'Scan Inbox';
      resultsEl.style.display = 'block';

      if (!data || !data.updates || !data.updates.length) {
        resultsEl.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:16px 0">No new recruiter activity since last scan.</div>';
        return;
      }

      resultsEl.innerHTML = data.updates.map(function (u) {
        var dotColor = u.type === 'rejection' ? '#dc2626'
          : u.type === 'interview' ? '#059669' : '#7c3aed';
        return '<div class="scan-result-item">'
          + '<div class="scan-dot" style="background:' + dotColor + '"></div>'
          + '<div>'
          + '<div class="scan-result-company">' + (u.company || '') + ' — ' + (u.subject || '') + '</div>'
          + '<div class="scan-result-detail">' + (u.summary || '') + '</div>'
          + '</div></div>';
      }).join('');
    })
    .catch(function (err) {
      btn.disabled = false;
      btn.innerHTML = 'Scan Inbox';
      document.getElementById('scan-results').style.display = 'block';
      document.getElementById('scan-results').innerHTML = '<div class="error-box">Scan failed: ' + err.message + '</div>';
    });
}
