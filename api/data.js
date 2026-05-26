module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const base = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_KEY;
  const headers = {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json'
  };

  if (req.method === 'PATCH') {
    const { id, status, notes } = req.body || {};
    const r = await fetch(base + '/rest/v1/applications?id=eq.' + id, {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify({ status, notes, updated_at: new Date() })
    });
    return res.status(200).json(await r.json());
  }

  const [apps, jobs] = await Promise.all([
    fetch(base + '/rest/v1/applications?order=app_number.asc.nullslast&limit=200', { headers }).then(r => r.json()),
    fetch(base + '/rest/v1/jobs?status=neq.dismissed&order=estimated_ote.desc.nullslast,scraped_at.desc&limit=100', { headers }).then(r => r.json())
  ]);

  return res.status(200).json({
    applications: Array.isArray(apps) ? apps : [],
    jobs: Array.isArray(jobs) ? jobs : []
  });
};

module.exports.config = { maxDuration: 30 };
