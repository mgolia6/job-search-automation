module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const base = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_KEY;
  const headers = {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json'
  };

  const r = await fetch(base + '/rest/v1/resume_master?version=eq.master&order=updated_at.desc&limit=1', { headers });
  const data = await r.json();
  return res.status(200).json(Array.isArray(data) ? data : []);
};

module.exports.config = { maxDuration: 15 };
