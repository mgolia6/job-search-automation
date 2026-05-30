const { createClient } = require('@supabase/supabase-js');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function verifyUser(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return null;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

// Extract raw text from PDF base64 using pdf-parse
async function extractPDF(base64) {
  const pdfParse = require('pdf-parse');
  const buf = Buffer.from(base64, 'base64');
  const result = await pdfParse(buf);
  return result.text || '';
}

// Extract raw text from DOCX base64 using mammoth
async function extractDOCX(base64) {
  const mammoth = require('mammoth');
  const buf = Buffer.from(base64, 'base64');
  const result = await mammoth.extractRawText({ buffer: buf });
  return result.value || '';
}

// Send raw text to Claude, get back structured profile JSON
async function parseWithClaude(resumeText) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `Parse this resume and return ONLY a JSON object with no preamble, no markdown, no backticks. Return exactly this structure:

{
  "inferred_title": "most recent or primary job title",
  "inferred_seniority": "ic | manager | director | vp",
  "years_experience": <integer>,
  "target_titles": ["array of 2-4 likely target role titles based on background"],
  "hard_skills": ["tools, platforms, software, methodologies — max 20"],
  "soft_skills": ["leadership traits, communication styles, strategic abilities — max 10"],
  "resume_keywords": ["high-frequency and high-signal keywords from the resume — max 30"],
  "summary": "2 sentence plain-english summary of this person's background and key strengths",
  "career_summary": "3-4 sentence professional summary written in first person, suitable for a profile or cover letter opener. Focus on experience level, core expertise, and what makes them effective.",
  "looking_for": "2-3 sentences in first person describing what this person is likely seeking next — role type, company stage, deal complexity, team environment — inferred from their background and trajectory."
}

Resume text:
${resumeText.slice(0, 8000)}`
      }]
    })
  });

  const data = await response.json();
  const text = data.content?.[0]?.text || '{}';
  try {
    return JSON.parse(text);
  } catch (e) {
    // Try stripping any accidental markdown
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // ── GET: fetch stored resume text ─────────────────────────────────────────
  if (req.method === 'GET') {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    const { data, error } = await supabase
      .from('profiles')
      .select('resume_text, resume_uploaded_at')
      .eq('user_id', user.id)
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ resume_text: data?.resume_text || null, uploaded_at: data?.resume_uploaded_at });
  }

  // ── POST: extract + parse resume ──────────────────────────────────────────
  if (req.method === 'POST') {
    const { action, pdf_base64, docx_base64, plain_text, filename } = req.body || {};

    if (action !== 'extract') return res.status(400).json({ error: 'Unknown action' });

    let rawText = '';

    try {
      if (plain_text) {
        rawText = plain_text.trim();
      } else if (pdf_base64) {
        rawText = await extractPDF(pdf_base64);
      } else if (docx_base64) {
        rawText = await extractDOCX(docx_base64);
      } else {
        return res.status(400).json({ error: 'No resume content provided' });
      }
    } catch (e) {
      return res.status(422).json({ error: 'Could not extract text from file: ' + e.message });
    }

    if (!rawText || rawText.trim().length < 50) {
      return res.status(422).json({ error: 'Resume text too short — try pasting instead' });
    }

    // Parse with Claude
    let parsed = {};
    try {
      parsed = await parseWithClaude(rawText);
    } catch (e) {
      console.error('[resume] Claude parse failed:', e.message);
      return res.status(200).json({
        text: rawText,
        parsed: null,
        parse_error: e.message
      });
    }

    return res.status(200).json({
      text: rawText,
      parsed,
      word_count: rawText.split(/\s+/).length
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

module.exports.config = { maxDuration: 30 };
