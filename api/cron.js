const scraperAdzuna = require('./scraper-adzuna.js');

module.exports = async function handler(req, res) {
  console.log('[cron] Triggered', new Date().toISOString());

  // Accept either a valid Supabase user token or the server-side cron secret
  const auth = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const isCronSecret = auth === process.env.CRON_SECRET;
  let userId = null;
  if (!isCronSecret) {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);
    const { data, error } = await supabase.auth.getUser(auth);
    if (error || !data?.user) return res.status(401).json({ error: 'Unauthorized' });
    userId = data.user.id;
  }

  if (userId) req.headers['x-user-id'] = userId;
  return scraperAdzuna(req, res);
};

module.exports.config = { maxDuration: 300 };
