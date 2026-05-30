module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'mcp-client-2025-04-04'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Search Gmail for emails in the last 7 days about job applications — interview requests, rejections, screening calls, application status updates. For each relevant email found, output one line:\nCOMPANY | SUBJECT | TYPE | SUMMARY\n\nTYPE must be one of: interview, rejection, screening, offer, other\nOnly real recruiter/HR emails. Return empty if nothing found.`
        }],
        mcp_servers: [{
          type: 'url',
          url: 'https://gmailmcp.googleapis.com/mcp/v1',
          name: 'gmail-mcp'
        }]
      })
    });

    const data = await response.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');

    const updates = [];
    for (const line of text.split('\n')) {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length < 4) continue;
      const [company, subject, type, summary] = parts;
      if (!company || !subject) continue;
      updates.push({ company, subject, type: type.toLowerCase(), summary });
    }

    return res.status(200).json({ success: true, updates, scannedAt: new Date().toISOString() });

  } catch (err) {
    console.error('[gmail-scan]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

module.exports.config = { maxDuration: 60 };

