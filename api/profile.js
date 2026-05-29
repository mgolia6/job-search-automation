module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const base = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_KEY;
  const headers = {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  // ── GET: check if profile exists ─────────────────────────────────────────
  if (req.method === 'GET') {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'user_id required' });

    const r = await fetch(
      base + '/rest/v1/profiles?user_id=eq.' + userId + '&limit=1',
      { headers }
    );
    const rows = await r.json();

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(200).json({ profile: null });
    }
    return res.status(200).json({ profile: rows[0] });
  }

  // ── POST: create or update profile ───────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body || {};
    const {
      user_id,
      full_name,
      email,
      target_titles,
      target_industries,
      target_locations,
      remote_preference,
      salary_floor_base,
      salary_floor_ote,
      seniority_level,
      resume_text,
      onboarding_complete
    } = body;

    if (!user_id) return res.status(400).json({ error: 'user_id required' });

    // Check if profile already exists
    const checkR = await fetch(
      base + '/rest/v1/profiles?user_id=eq.' + user_id + '&limit=1',
      { headers }
    );
    const existing = await checkR.json();
    const exists = Array.isArray(existing) && existing.length > 0;

    const payload = {
      user_id,
      full_name:           full_name || null,
      email:               email || null,
      target_titles:       Array.isArray(target_titles) ? target_titles : [],
      target_industries:   Array.isArray(target_industries) ? target_industries : [],
      target_locations:    Array.isArray(target_locations) ? target_locations : [],
      remote_preference:   remote_preference || 'any',
      salary_floor_base:   salary_floor_base || null,
      salary_floor_ote:    salary_floor_ote || null,
      seniority_level:     seniority_level || 'ic',
      resume_text:         resume_text || null,
      resume_uploaded_at:  resume_text ? new Date().toISOString() : null,
      onboarding_complete: onboarding_complete === true,
      updated_at:          new Date().toISOString()
    };

    let r;
    if (exists) {
      // PATCH existing
      r = await fetch(
        base + '/rest/v1/profiles?user_id=eq.' + user_id,
        { method: 'PATCH', headers, body: JSON.stringify(payload) }
      );
    } else {
      // POST new
      r = await fetch(
        base + '/rest/v1/profiles',
        { method: 'POST', headers, body: JSON.stringify(payload) }
      );
    }

    if (!r.ok) {
      const err = await r.text();
      return res.status(500).json({ success: false, error: err });
    }

    const saved = await r.json();
    return res.status(200).json({ success: true, profile: Array.isArray(saved) ? saved[0] : saved });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

module.exports.config = { maxDuration: 15 };
