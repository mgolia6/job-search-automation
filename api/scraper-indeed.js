// api/scraper-indeed.js — Job scraper using Indeed MCP (replaces JSearch aggregator)
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const CONFIG = {
  maxAgeDays: 2,
  emailTo: 'mgolia6@gmail.com',
  titleKeywords: ['account executive', 'strategic account', 'enterprise account', 'enterprise sales'],
  minSalary: 150000 // $150K base = ~$300K OTE
};

module.exports = async function handler(req, res) {
  // Verify cron secret
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('[scraper-indeed] Starting job scrape...');
    
    // NOTE: This endpoint expects Indeed MCP tools to be available via direct function calls
    // For now, return a placeholder — actual implementation will require MCP tool integration
    
    return res.status(200).json({
      success: true,
      message: 'Indeed scraper requires MCP tool integration',
      note: 'This needs to be refactored to use Indeed MCP search_jobs tool'
    });
    
  } catch (error) {
    console.error('[scraper-indeed]', error);
    return res.status(500).json({ error: error.message });
  }
};

// Helper functions (to be implemented with Indeed MCP)
function isAERole(title) {
  if (!title) return false;
  return CONFIG.titleKeywords.some(k => title.toLowerCase().includes(k));
}

function slugify(s) { 
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80); 
}
