module.exports = async function handler(req, res) {
  try {
    const { runJobScraper } = require('../src/scraper.js');
    const result = await runJobScraper();
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return res.status(200).json({
      success: false,
      error: err.message,
      stack: err.stack ? err.stack.split('
').slice(0,5) : []
    });
  }
};
module.exports.config = { maxDuration: 300 };
