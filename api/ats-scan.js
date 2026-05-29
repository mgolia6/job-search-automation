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
  const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

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
    // ── RapidAPI literal ATS score (15/day — use sparingly) ──────────────────
    if (action === 'rapidapi') {
      if (!RAPIDAPI_KEY) return res.status(500).json({ error: 'RAPIDAPI_KEY not set' });
      if (!resume) return res.status(400).json({ error: 'resume required' });

      const r = await fetch('https://resume-ats-analyzer.p.rapidapi.com/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'resume-ats-analyzer.p.rapidapi.com'
        },
        body: JSON.stringify({ resume, job_description: jd })
      });

      if (!r.ok) {
        const err = await r.text();
        throw new Error(`RapidAPI ATS ${r.status}: ${err}`);
      }

      const data = await r.json();
      // Normalize response — field names vary by version
      const result = {
        score: data.score ?? data.match_score ?? data.compatibility_score ?? data.ats_score ?? null,
        missing_keywords: data.missing_keywords ?? data.keywords_missing ?? data.missingKeywords ?? [],
        matched_keywords: data.matched_keywords ?? data.keywords_matched ?? data.matchedKeywords ?? [],
        suggestions: data.suggestions ?? data.recommendations ?? [],
        formatting_issues: data.formatting_issues ?? data.formattingIssues ?? [],
        raw: data
      };
      return res.status(200).json({ ok: true, result });
    }

    if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

    // ── Claude semantic score ─────────────────────────────────────────────────
    if (action === 'score') {
      const data = await callClaude(
        'You are an ATS scoring engine. Respond ONLY with a valid JSON object. No markdown, no backticks, no explanation. Just the raw JSON.',
        `Analyze this resume against this job description. Return a JSON object with exactly these keys: overall_score (integer 0-100), hard_skill_score (integer 0-100), soft_skill_score (integer 0-100), verbatim_score (integer 0-100), experience_match (integer 0-100), verdict (string: exactly "strong match" or "moderate match" or "weak match"), missing_hard (array of strings, up to 8 missing hard skills or tools), missing_soft (array of strings, up to 5 missing soft skill phrases), matched_keywords (array of strings, up to 10 keywords present in both), experience_gap (string: one plain sentence on years or seniority match). JOB DESCRIPTION: ${jd} RESUME: ${resume}`
      );
      const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('').replace(/```json|```/g,'').trim();
      return res.status(200).json({ ok: true, result: JSON.parse(text) });
    }

    // ── RepVue org health ─────────────────────────────────────────────────────
    if (action === 'repvue') {
      const data = await callClaude(
        'You are a sales org health analyst. Search RepVue for the company. Return ONLY a raw JSON object — no markdown, no bold, no bullet points, no backticks, no explanation outside the JSON. The summary field must be 2 plain sentences of prose, no formatting characters.',
        `Search RepVue for "${company}" sales org data. Return a JSON object with exactly these keys: quota_attainment (string, the percentage or "unknown"), rep_satisfaction (string, score like "7.6/10" or "unknown"), culture_score (string, score like "8.0/10" or "unknown"), trend (string: exactly "improving" or "declining" or "stable" or "unknown"), verdict (string: exactly "green" or "yellow" or "red"), summary (string: exactly 2 plain prose sentences summarizing org health for a sales candidate — no markdown, no asterisks, no bullet points), source (string: "repvue" if data found, "estimated" if not).`,
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
