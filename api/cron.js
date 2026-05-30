const scraperV2 = require('./scraper-v2.js');

module.exports = async function handler(req, res) {
  console.log('[cron] Triggered', new Date().toISOString());

  // Accept either a valid Supabase user token or the server-side cron secret
  const auth = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const isCronSecret = auth === process.env.CRON_SECRET;
  if (!isCronSecret) {
    // Verify as Supabase user token
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    const { data, error } = await supabase.auth.getUser(auth);
    if (error || !data?.user) return res.status(401).json({ error: 'Unauthorized' });
  }

  return scraperV2(req, res);
};

module.exports.config = { maxDuration: 300 };
