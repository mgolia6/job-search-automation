const scraperV2 = require('./scraper-v2.js');

module.exports = async function handler(req, res) {
  console.log('[cron] Triggered', new Date().toISOString());

  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return scraperV2(req, res);
};

module.exports.config = { maxDuration: 300 };
