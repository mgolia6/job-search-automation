// api/job-action.js — lead triage actions, auth-gated
const { createClient } = require('@supabase/supabase-js');
const { verifyUser } = require('./auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const token = req.headers.authorization.replace('Bearer ', '');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { action, jobId, jobData, justification } = req.body;

  try {
    if (action === 'backlog') {
      const { error } = await supabase
        .from('jobs')
        .update({ status: 'backlog', justification: justification || null, updated_at: new Date().toISOString() })
        .eq('job_id', jobId)
        .eq('user_id', user.id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    if (action === 'dismiss') {
      const { error } = await supabase
        .from('jobs')
        .update({ status: 'dismissed', justification: justification || null, updated_at: new Date().toISOString() })
        .eq('job_id', jobId)
        .eq('user_id', user.id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    if (action === 'add_to_pipeline') {
      // Write job_id and apply_url into applications now that schema supports it
      const { error: insertError } = await supabase.from('applications').insert({
        user_id:    user.id,
        company:    jobData.company,
        role:       jobData.title,
        status:     'Researching',
        source:     'Scraper',
        job_id:     jobId,
        apply_url:  jobData.apply_url,
        notes:      `Base: ${jobData.salary} | Est OTE: $${Math.round((jobData.estimated_ote || 0) / 1000)}K`,
        created_at: new Date().toISOString()
      });
      if (insertError) throw insertError;

      // Remove from leads feed
      const { error: updateError } = await supabase
        .from('jobs')
        .update({ status: 'dismissed', updated_at: new Date().toISOString() })
        .eq('job_id', jobId)
        .eq('user_id', user.id);
      if (updateError) throw updateError;

      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
    console.error('[job-action]', err);
    return res.status(500).json({ error: err.message });
  }
};

