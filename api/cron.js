const { runJobScraper } = require('./scraper.js');

module.exports = async function handler(req, res) {
  console.log('[cron] Triggered', new Date().toISOString());

  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Respond immediately so browser doesn't time out
  res.status(200).json({ success: true, status: 'running', message: 'Scraper started — check email in 3-5 mins', timestamp: new Date().toISOString() });

  // Run scraper after response is sent
  try {
    const result = await runJobScraper();
    console.log('[cron] Complete:', JSON.stringify(result));
  } catch(err) {
    console.error('[cron] Error:', err.message);
  }
};

module.exports.config = { maxDuration: 300 };
