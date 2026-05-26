module.exports = async function handler(req, res) {
  res.status(200).json({
    ok: true,
    node: process.version,
    ts: new Date().toISOString(),
    env: {
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      RESEND_API_KEY: !!process.env.RESEND_API_KEY,
    }
  });
};
