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
    const payload = {
      user_id:            user.id,
      full_name:          body.full_name || null,
      email:              body.email || user.email,
      target_titles:      body.target_titles || [],
      target_industries:  body.target_industries || [],
      target_locations:   body.target_locations || [],
      remote_preference:  body.remote_preference || 'any',
      salary_floor_base:  body.salary_floor_base || null,
      salary_floor_ote:   body.salary_floor_ote || null,
      seniority_level:    body.seniority_level || 'ic',
      resume_text:        body.resume_text || null,
      hard_skills:        body.hard_skills || [],
      soft_skills:        body.soft_skills || [],
      resume_keywords:    body.resume_keywords || [],
      job_search_intent:  body.job_search_intent || null,
      phone:              body.phone || null,
      career_summary:     body.career_summary || null,
      looking_for:        body.looking_for || null,
      working_style:      body.working_style || null,
      photo_url:          body.photo_url || null,
      onboarding_complete: body.onboarding_complete || false,
      updated_at:         new Date()
    };

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
