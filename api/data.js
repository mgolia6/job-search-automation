// api/data.js — pipeline + jobs data, auth-gated
const { verifyUser } = require('./auth');
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const token = req.headers.authorization.replace('Bearer ', '');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  if (req.method === 'PATCH') {
    const { id, status, notes } = req.body || {};
    const { data, error } = await supabase
      .from('applications')
      .update({ status, notes, updated_at: new Date() })
      .eq('id', id)
      .eq('user_id', user.id)
      .select();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  const [appsRes, jobsRes] = await Promise.all([
    supabase
      .from('applications')
      .select('*')
      .eq('user_id', user.id)
      .order('app_number', { ascending: true, nullsFirst: false }),
    supabase
      .from('jobs')
      .select('*')
      .eq('user_id', user.id)
      .order('estimated_ote', { ascending: false, nullsFirst: false })
      .limit(100)
  ]);

  return res.status(200).json({
    applications: appsRes.data || [],
    jobs: jobsRes.data || []
  });
};

module.exports.config = { maxDuration: 30 };

