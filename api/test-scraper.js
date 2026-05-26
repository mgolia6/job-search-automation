const { runJobScraper } = require('./scraper-jsearch.js');

module.exports = async function handler(req, res) {
  console.log('[test] Running scraper synchronously...');
  
  try {
    const result = await runJobScraper();
    console.log('[test] Complete:', JSON.stringify(result));
    
    return res.status(200).json({
      success: true,
      result,
      message: result.jobsFound > 0 
        ? `Found ${result.jobsFound} new jobs — check your email` 
        : 'No new jobs found (already applied or filtered out)'
    });
  } catch (error) {
    console.error('[test] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
};

module.exports.config = { maxDuration: 300 };
