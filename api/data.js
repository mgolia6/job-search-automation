export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
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
    fetch(base + '/rest/v1/applications?order=app_number.asc.nullslast&limit=100', { headers }).then(r => r.json()),
    fetch(base + '/rest/v1/jobs?order=scraped_at.desc&limit=50', { headers }).then(r => r.json())
  ]);

  res.status(200).json({ applications: apps || [], jobs: jobs || [] });
}
