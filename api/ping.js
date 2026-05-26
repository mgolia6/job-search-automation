const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  let sdkVersion = 'unknown';
  let sdkOk = false;
  try {
    sdkVersion = require('@anthropic-ai/sdk/package.json').version;
    new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    sdkOk = true;
  } catch(e) {
    sdkVersion = 'ERROR: ' + e.message.slice(0, 100);
  }

  res.status(200).json({
    ok: sdkOk,
    node: process.version,
    sdkVersion,
    sdkOk,
    env: {
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      RESEND_API_KEY: !!process.env.RESEND_API_KEY,
    },
    ts: new Date().toISOString()
  });
};
