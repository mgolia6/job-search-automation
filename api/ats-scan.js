// api/ats-scan.js — Anthropic-powered ATS engine proxy
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, jd, resume, company, role } = req.body || {};
  if (!action || !jd) return res.status(400).json({ error: 'action and jd required' });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  const callClaude = async (system, userMsg, tools) => {
    const body = {
      model: 'claude-sonnet-4-5-20251001',
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: userMsg }]
    };
    if (tools) body.tools = tools;
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        ...(tools ? { 'anthropic-beta': 'web-search-2025-03-05' } : {})
      },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(`Anthropic API ${r.status}: ${err}`);
    }
    return r.json();
  };

  try {
    if (action === 'score') {
      const data = await callClaude(
        'You are an ATS scoring engine. Respond ONLY with a valid JSON object, no markdown, no explanation.',
        `Analyze this resume against this job description. Return a JSON object with: overall_score (0-100 integer), hard_skill_score (0-100), soft_skill_score (0-100), verbatim_score (0-100), experience_match (0-100), verdict (exactly one of: strong match, moderate match, weak match), missing_hard (array of up to 8 missing hard skills or tools), missing_soft (array of up to 5 missing soft skill phrases), matched_keywords (array of up to 10 keywords present in both), experience_gap (one sentence on years or seniority match or gap). JOB DESCRIPTION: ${jd} RESUME: ${resume}`
      );
      const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('').replace(/```json|```/g,'').trim();
      return res.status(200).json({ ok: true, result: JSON.parse(text) });
    }

    if (action === 'repvue') {
      const data = await callClaude(
        'You are a sales org health analyst. Search RepVue for the company. Return ONLY a valid JSON object with: quota_attainment (string, percent or unknown), rep_satisfaction (string, score out of 10 or unknown), culture_score (string, score out of 10 or unknown), trend (one of: improving, declining, stable, unknown), verdict (one of: green, yellow, red), summary (2 sentence plain English summary of org health for a sales candidate), source (one of: repvue, estimated). No markdown.',
        `Look up ${company} on RepVue. What is their quota attainment rate, rep satisfaction, and overall sales org health?`,
        [{ type: 'web_search_20250305', name: 'web_search' }]
      );
      const textBlocks = data.content.filter(b => b.type === 'text').map(b => b.text).join('').replace(/```json|```/g,'').trim();
      let result;
      try { result = JSON.parse(textBlocks); }
      catch(e) { result = { verdict: 'yellow', summary: textBlocks, source: 'estimated', quota_attainment: 'unknown', rep_satisfaction: 'unknown', culture_score: 'unknown', trend: 'unknown' }; }
      return res.status(200).json({ ok: true, result });
    }

    if (action === 'rewrite') {
      const data = await callClaude(
        'You are an expert ATS resume optimizer for enterprise SaaS sales roles. Tailor the resume to the job description by adjusting the summary to mirror JD language, rewording existing bullets to surface buried keywords without inventing experience, and swapping generic phrasing for the JD exact terminology where the experience genuinely matches. Never fabricate metrics or experience. Return ONLY the full tailored resume text, no explanation, no markdown, no preamble.',
        `Tailor this resume for the ${role} role at ${company}. JOB DESCRIPTION: ${jd} MASTER RESUME: ${resume} Return the full tailored resume text only.`
      );
      const tailored = data.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
      return res.status(200).json({ ok: true, result: tailored });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    console.error('[ats-scan]', err.message);
    return res.status(500).json({ error: err.message });
  }
};

module.exports.config = { maxDuration: 60 };
