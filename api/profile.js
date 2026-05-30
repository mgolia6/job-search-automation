// api/profile.js — profile CRUD, auth-gated
const { createClient } = require('@supabase/supabase-js');
const { verifyUser } = require('./auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Use user's JWT for RLS-scoped client
  const token = req.headers.authorization.replace('Bearer ', '');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({ profile: data || null });
  }

  if (req.method === 'POST') {
    const body = req.body || {};

    // Always-present fields
    const payload = {
      user_id:    user.id,
      email:      body.email || user.email,
      updated_at: new Date(),
      onboarding_complete: body.onboarding_complete !== undefined ? body.onboarding_complete : true,
    };

    // Only include optional fields if explicitly provided (not undefined)
    const optionalText = ['full_name','phone','zip_code','remote_preference','seniority_level',
      'job_search_intent','resume_text','career_summary','looking_for','working_style','photo_url'];
    optionalText.forEach(function(k) {
      if (body[k] !== undefined) payload[k] = body[k] || null;
    });

    const optionalNum = ['salary_floor_base','salary_floor_ote'];
    optionalNum.forEach(function(k) {
      if (body[k] !== undefined) payload[k] = body[k] || null;
    });

    const optionalArrays = ['target_titles','target_industries','target_locations',
      'hard_skills','soft_skills','resume_keywords'];
    optionalArrays.forEach(function(k) {
      // Only overwrite if sent AND non-empty, or if explicitly sent as empty
      if (body[k] !== undefined) {
        payload[k] = Array.isArray(body[k]) && body[k].length > 0 ? body[k] : (body[k] || null);
      }
    });

    const { data, error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, profile: data });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
