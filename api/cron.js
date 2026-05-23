import { runJobScraper } from '../src/scraper.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  console.log('=== CRON TRIGGERED ===', new Date().toISOString());

  // Auth check
  const authHeader  = req.headers.authorization;
  const expected    = `Bearer ${process.env.CRON_SECRET}`;

  if (authHeader !== expected) {
    console.log('AUTH FAILED');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('AUTH OK — running scraper');

  try {
    const result = await runJobScraper();
    return res.status(200).json({
      success:   true,
      timestamp: new Date().toISOString(),
      ...result
    });
  } catch (error) {
    console.error('Scraper failed:', error);
    return res.status(500).json({
      success:   false,
      error:     error.message,
      timestamp: new Date().toISOString()
    });
  }
}
