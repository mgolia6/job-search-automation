const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  let supabaseOk = false;
  let anthropicOk = false;
  let anthropicError = null;

  // Test Supabase
  try {
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    const { error } = await db.from('applications').select('id').limit(1);
    supabaseOk = !error;
  } catch(e) { supabaseOk = false; }

  // Test Anthropic via raw fetch
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      })
    });
    anthropicOk = r.ok;
    if (!r.ok) anthropicError = await r.text();
  } catch(e) { anthropicError = e.message; }

  res.status(200).json({
    ok: supabaseOk && anthropicOk,
    node: process.version,
    supabaseOk,
    anthropicOk,
    anthropicError,
    ts: new Date().toISOString()
  });
};
