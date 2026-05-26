const { runJobScraper } = require('./scraper-jsearch.js');

module.exports = async function handler(req, res) {
  console.log('[cron] Triggered', new Date().toISOString());

  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Respond immediately so browser doesn't time out
  res.status(200).json({ success: true, status: 'running', message: 'Scraper started — check logs in 3-5 mins', timestamp: new Date().toISOString() });

  // Choose scraper based on env var (default to v2)
  const scraperVersion = process.env.SCRAPER_VERSION || 'v2';
  
  try {
    if (scraperVersion === 'v2') {
      // Call scraper-v2 directly as a function
      const scraperV2 = require('./scraper-v2.js');
      const mockReq = { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } };
      const mockRes = {
        status: () => ({ json: (data) => console.log('[scraper-v2] Result:', data) })
      };
      await scraperV2(mockReq, mockRes);
    } else {
      // Fallback to old scraper
      const { runJobScraper } = require('./scraper-jsearch.js');
      const result = await runJobScraper();
      console.log('[cron] Complete:', JSON.stringify(result));
    }
  } catch(err) {
    console.error('[cron] Error:', err.message);
  }
};

module.exports.config = { maxDuration: 300 };
