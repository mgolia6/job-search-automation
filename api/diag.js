module.exports = async function handler(req, res) {
  const results = {};

  // Test Greenhouse index
  try {
    const r = await fetch('https://boards.greenhouse.io/api/v1/jobs?q=account+executive&remote=true', {
      headers: { 'User-Agent': 'JobBot/1.0' },
      signal: AbortSignal.timeout(8000)
    });
    const data = await r.json();
    results.greenhouse_index = {
      status: r.status,
      total: data.jobs?.length || 0,
      sample: (data.jobs || []).slice(0, 2).map(j => ({ title: j.title, company: j.company?.name }))
    };
  } catch(e) { results.greenhouse_index = { error: e.message }; }

  // Test single Greenhouse board (Databricks)
  try {
    const r = await fetch('https://boards.greenhouse.io/api/v1/boards/databricks/jobs', {
      headers: { 'User-Agent': 'JobBot/1.0' },
      signal: AbortSignal.timeout(8000)
    });
    const data = await r.json();
    const ae = (data.jobs || []).filter(j => j.title?.toLowerCase().includes('account'));
    results.greenhouse_databricks = {
      status: r.status,
      total_jobs: data.jobs?.length || 0,
      ae_roles: ae.length,
      sample: ae.slice(0, 2).map(j => ({ title: j.title, location: j.location?.name }))
    };
  } catch(e) { results.greenhouse_databricks = { error: e.message }; }

  // Test Lever
  try {
    const r = await fetch('https://api.lever.co/v0/postings?mode=json&limit=5', {
      headers: { 'User-Agent': 'JobBot/1.0' },
      signal: AbortSignal.timeout(8000)
    });
    const data = await r.json();
    results.lever = {
      status: r.status,
      is_array: Array.isArray(data),
      count: Array.isArray(data) ? data.length : 'N/A',
      sample: Array.isArray(data) ? data.slice(0,2).map(j => j.text) : data
    };
  } catch(e) { results.lever = { error: e.message }; }

  res.status(200).json(results);
};
