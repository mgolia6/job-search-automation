// api/ats-scan.js — Anthropic-powered ATS engine proxy + RapidAPI literal scorer
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, jd, resume, company, role } = req.body || {};
  if (!action || !jd) return res.status(400).json({ error: 'action and jd required' });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  // JWT for ats-match-scoring.p.rapidapi.com (stored as env var)
  const ATS_JWT = process.env.ATS_SCORING_JWT ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTc3NzI0MDM2MzY2MCwidXNlciI6ImlkLTE3MTMzODgxMDIwMDAiLCJ0aW1lIjoxNzc3MjQwNDYyNzMzLCJpYXQiOjE3NzcyNDA0NjJ9.mkLU7gZspO3G2nitY_rd4_NtApoh9AO_0BWJ4uYzF1A';
  const ATS_RAPIDAPI_KEY = process.env.RAPIDAPI_KEY ||
    'fc5506e25bmsh683a2461cf98c6fp135b99jsnd8b39b27f377';

  const callClaude = async (system, userMsg, tools) => {
    const body = {
      model: 'claude-sonnet-4-6',
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
    // ── RapidAPI literal ATS score (ats-match-scoring) ────────────────────────
    if (action === 'rapidapi') {
      if (!resume) return res.status(400).json({ error: 'resume required' });

      const r = await fetch('https://ats-match-scoring.p.rapidapi.com/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ATS_JWT}`,
          'Content-Type': 'application/json',
          'x-rapidapi-host': 'ats-match-scoring.p.rapidapi.com',
          'x-rapidapi-key': ATS_RAPIDAPI_KEY
        },
        body: JSON.stringify({
          data: {
            'Resume Data': resume.slice(0, 6000),
            'Job Offer Data': jd.slice(0, 4000),
            'Response Language': 'English'
          }
        })
      });

      if (!r.ok) {
        const err = await r.text();
        throw new Error(`ATS Scoring API ${r.status}: ${err.slice(0, 300)}`);
      }

      const data = await r.json();
      console.log('[ats-match-scoring] raw response keys:', Object.keys(data));

      // Normalize — the API returns various field names; flatten to our standard shape
      const score = data.score ?? data.match_score ?? data.compatibility_score
        ?? data.ats_score ?? data['Match Score'] ?? data['ATS Score'] ?? null;

      const missingKw = data.missing_keywords ?? data['Missing Keywords']
        ?? data.missingKeywords ?? data.keywords_missing ?? [];

      const matchedKw = data.matched_keywords ?? data['Matched Keywords']
        ?? data.matchedKeywords ?? data.keywords_matched ?? [];

      const suggestions = data.suggestions ?? data['Suggestions']
        ?? data.recommendations ?? data['Recommendations'] ?? [];

      return res.status(200).json({
        ok: true,
        result: {
          score: typeof score === 'number' ? Math.round(score) : score,
          missing_keywords: Array.isArray(missingKw) ? missingKw : [],
          matched_keywords: Array.isArray(matchedKw) ? matchedKw : [],
          suggestions: Array.isArray(suggestions) ? suggestions : [],
          raw: data
        }
      });
    }

    if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

    // ── Claude semantic score ─────────────────────────────────────────────────
    if (action === 'score') {
      const jdTrimmed = jd.slice(0, 3000);
      const resumeTrimmed = resume.slice(0, 4000);
      const data = await callClaude(
        'You are an ATS scoring engine. Respond ONLY with a valid JSON object. No markdown, no backticks, no explanation. Just the raw JSON.',
        `Analyze this resume against this job description. Return a JSON object with exactly these keys: overall_score (integer 0-100), hard_skill_score (integer 0-100), soft_skill_score (integer 0-100), verbatim_score (integer 0-100), experience_match (integer 0-100), verdict (string: exactly "strong match" or "moderate match" or "weak match"), missing_hard (array of strings, up to 8 missing hard skills or tools), missing_soft (array of strings, up to 5 missing soft skill phrases), matched_keywords (array of strings, up to 10 keywords present in both), experience_gap (string: one plain sentence on years or seniority match). JOB DESCRIPTION: ${jdTrimmed} RESUME: ${resumeTrimmed}`
      );
      const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('').replace(/```json|```/g,'').trim();
      return res.status(200).json({ ok: true, result: JSON.parse(text) });
    }

    // ── RepVue org health ─────────────────────────────────────────────────────
    if (action === 'repvue') {
      const data = await callClaude(
        'You are a sales org health analyst. Search RepVue for the company. Return ONLY a raw JSON object — no markdown, no bold, no bullet points, no backticks, no explanation outside the JSON. The summary field must be 2 plain sentences of prose, no formatting characters.',
        `Search RepVue for "${company.slice(0,100)}" and return a JSON object with: quota_attainment, rep_satisfaction, culture_score, trend (improving/declining/stable/unknown), verdict (green/yellow/red), summary (2 plain sentences, no markdown), source (repvue or estimated).`,
        [{ type: 'web_search_20250305', name: 'web_search' }]
      );
      const textBlocks = data.content.filter(b => b.type === 'text').map(b => b.text).join('').replace(/```json|```/g,'').trim();
      let result;
      try { result = JSON.parse(textBlocks); }
      catch(e) {
        result = { verdict: 'yellow', summary: textBlocks.replace(/\*\*/g,'').replace(/---/g,'').slice(0,400), source: 'estimated', quota_attainment: 'unknown', rep_satisfaction: 'unknown', culture_score: 'unknown', trend: 'unknown' };
      }
      return res.status(200).json({ ok: true, result });
    }

    // ── Resume rewrite ────────────────────────────────────────────────────────
    if (action === 'rewrite') {
      const data = await callClaude(
        'You are an expert ATS resume optimizer for enterprise SaaS sales roles. Tailor the resume to the job description by adjusting the summary to mirror JD language, rewording existing bullets to surface buried keywords without inventing experience, and swapping generic phrasing for the JD exact terminology where the experience genuinely matches. Never fabricate metrics or experience. Return ONLY the full tailored resume text. No explanation, no markdown, no preamble, no commentary.',
        `Tailor this resume for the ${role} role at ${company}. JOB DESCRIPTION: ${jd.slice(0,3000)} MASTER RESUME: ${resume.slice(0,4000)} Return the full tailored resume text only.`
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
