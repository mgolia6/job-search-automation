import { runJobScraper } from '../src/scraper.js';

export const config = {
  maxDuration: 300, // 5 minutes
};

export default async function handler(req, res) {
  // Verify this is from Vercel Cron
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const result = await runJobScraper();
    
    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result
    });
  } catch (error) {
    console.error('Cron job failed:', error);
    
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
// Force deploy
