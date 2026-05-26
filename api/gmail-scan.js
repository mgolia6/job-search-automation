// api/gmail-scan.js
// Scans Gmail for recruiter activity since the last 7 days
// Returns structured updates for the dashboard

const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('[gmail-scan] Starting scan');

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Search Gmail for emails in the last 7 days matching any of these queries:
1. "interview" OR "screening" OR "next steps" OR "application" in subject
2. From recruiters or HR contacts
3. Any application status updates, rejections, or positive responses

For each relevant email thread found, return a JSON array of objects with this exact shape:
{
  "company": "Company name",
  "subject": "Email subject line",
  "type": "interview|rejection|screening|offer|other",
  "summary": "One sentence describing what happened",
  "date": "ISO date string"
}

Return ONLY the JSON array, nothing else. If nothing found, return [].`
      }],
      mcp_servers: [{
        type: 'url',
        url: 'https://gmailmcp.googleapis.com/mcp/v1',
        name: 'gmail-mcp'
      }]
    });

    const text = msg.content.find(b => b.type === 'text')?.text || '[]';
    const match = text.match(/\[[\s\S]*\]/);
    let updates = [];
    try {
      updates = match ? JSON.parse(match[0]) : [];
    } catch (e) {
      console.error('[gmail-scan] Parse error:', e.message);
      updates = [];
    }

    console.log(`[gmail-scan] Found ${updates.length} updates`);
    return res.status(200).json({ success: true, updates, scannedAt: new Date().toISOString() });

  } catch (err) {
    console.error('[gmail-scan] Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

module.exports.config = { maxDuration: 60 };
