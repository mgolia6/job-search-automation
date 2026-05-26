// api/ping.js — open health check, no auth
const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  let sdkOk = false;
  try {
    const a = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    sdkOk = !!a;
  } catch(e) {}

  res.status(200).json({
    ok: true,
    node: process.version,
    sdkVersion: require('@anthropic-ai/sdk/package.json').version,
    sdkOk,
    env: {
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      RESEND_API_KEY: !!process.env.RESEND_API_KEY,
      CRON_SECRET: !!process.env.CRON_SECRET,
    },
    ts: new Date().toISOString()
  });
};
