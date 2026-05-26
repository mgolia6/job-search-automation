module.exports = async function handler(req, res) {
  const hasRapidAPI = !!process.env.RAPIDAPI_KEY;
  const hasSupabase = !!process.env.SUPABASE_URL && !!process.env.SUPABASE_KEY;
  const hasResend = !!process.env.RESEND_API_KEY;
  const hasCron = !!process.env.CRON_SECRET;

  return res.status(200).json({
    env_check: {
      RAPIDAPI_KEY: hasRapidAPI ? '✓ Set' : '✗ Missing',
      SUPABASE: hasSupabase ? '✓ Set' : '✗ Missing',
      RESEND_API_KEY: hasResend ? '✓ Set' : '✗ Missing',
      CRON_SECRET: hasCron ? '✓ Set' : '✗ Missing'
    },
    rapidapi_key_preview: process.env.RAPIDAPI_KEY ? process.env.RAPIDAPI_KEY.slice(0, 10) + '...' : 'not set'
  });
};
