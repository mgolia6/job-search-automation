module.exports = async function handler(req, res) {
  const start = Date.now();
  let result = {};

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
        max_tokens: 500,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: 'Search for "enterprise account executive" remote jobs posted today on greenhouse.io. Return 2 results as JSON.' }]
      })
    });

    const data = await r.json();
    result = {
      status: r.status,
      ok: r.ok,
      stop_reason: data.stop_reason,
      error: data.error || null,
      content_types: (data.content || []).map(b => b.type),
      text_preview: (data.content || []).filter(b => b.type === 'text').map(b => b.text.slice(0, 300)).join('\n'),
      elapsed_ms: Date.now() - start
    };
  } catch(e) {
    result = { error: e.message, elapsed_ms: Date.now() - start };
  }

  res.status(200).json(result);
};
