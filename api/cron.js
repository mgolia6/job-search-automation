const { runJobScraper } = require("./scraper.js");

module.exports = async function handler(req, res) {
  console.log("[cron] Triggered", new Date().toISOString());

  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    console.log("[cron] Auth failed");
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await runJobScraper();
    return res.status(200).json({ success: true, ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("[cron] Error:", err.message, err.stack);
    return res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
};

module.exports.config = { maxDuration: 300 };