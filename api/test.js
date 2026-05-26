// redeploy trigger 20260526T014449
export default async function handler(req, res) {
  const vars = {
    ANTHROPIC_API_KEY:  !!process.env.ANTHROPIC_API_KEY,
    SUPABASE_URL:       !!process.env.SUPABASE_URL,
    SUPABASE_KEY:       !!process.env.SUPABASE_KEY,
    CRON_SECRET:        !!process.env.CRON_SECRET,
    RESEND_API_KEY:     !!process.env.RESEND_API_KEY,
  };
  res.status(200).json({ env: vars, node: process.version });
}
