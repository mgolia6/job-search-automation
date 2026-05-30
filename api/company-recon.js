// api/company-recon.js — Company health data via AI (RepVue) + deep link (Glassdoor)
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CACHE_HOURS = 168; // 1 week

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { company } = req.body;
  if (!company) {
    return res.status(400).json({ error: 'Company name required' });
  }

  try {
    // Check cache first
    const { data: cached } = await supabase
      .from('company_recon')
      .select('*')
      .eq('company', company)
      .single();

    if (cached && cached.last_fetched) {
      const hoursSinceFetch = (Date.now() - new Date(cached.last_fetched).getTime()) / (1000 * 60 * 60);
      if (hoursSinceFetch < CACHE_HOURS) {
        return res.status(200).json({
          success: true,
          company,
          cached: true,
          repvue: {
            available: !!cached.repvue_quota_attainment,
            quotaAttainment: cached.repvue_quota_attainment,
            rating: cached.repvue_rating,
            summary: cached.repvue_summary,
            verdict: cached.repvue_verdict,
            url: cached.repvue_url
          },
          glassdoor: {
            available: true,
            rating: cached.glassdoor_rating,
            url: buildGlassdoorUrl(company)
          }
        });
      }
    }

    // Fetch fresh RepVue data via Claude AI
    const repvueData = await fetchRepVueViaAI(company);

    // Build Glassdoor deep link — no API needed
    const glassdoorData = {
      available: true,
      rating: null,
      url: buildGlassdoorUrl(company)
    };

    // Store in cache
    await supabase.from('company_recon').upsert({
      company,
      repvue_quota_attainment: repvueData.quotaAttainment,
      repvue_rating: repvueData.rating,
      repvue_summary: repvueData.summary,
      repvue_verdict: repvueData.verdict,
      repvue_url: repvueData.url,
      glassdoor_rating: null,
      glassdoor_url: glassdoorData.url,
      last_fetched: new Date()
    }, { onConflict: 'company' });

    return res.status(200).json({
      success: true,
      company,
      cached: false,
      repvue: repvueData,
      glassdoor: glassdoorData
    });

  } catch (error) {
    console.error('[company-recon]', error);
    return res.status(500).json({ error: error.message });
  }
};

function buildGlassdoorUrl(company) {
  // Deep link to Glassdoor search — always works, no API needed
  const q = encodeURIComponent(company);
  return `https://www.glassdoor.com/Search/results.htm?keyword=${q}`;
}

async function fetchRepVueViaAI(company) {
  const repvueUrl = `https://www.repvue.com/companies/${company.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  try {
    const msg = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `You are a sales org intelligence tool. Based on your training data, provide a RepVue-style assessment for: ${company}

Return ONLY valid JSON, no markdown, no explanation:
{
  "quotaAttainment": <number 0-100 or null if unknown>,
  "rating": <number 1-5 or null>,
  "verdict": "green" | "yellow" | "red",
  "summary": "<2-3 sentence assessment of sales org health, quota attainment, rep satisfaction, and culture>",
  "confidence": "high" | "medium" | "low"
}

Verdict logic: green = strong sales org (>60% attainment, good culture), yellow = mixed signals or limited data, red = known issues (low attainment, poor culture, layoffs, toxic).
If you have very limited data on this company, set confidence: "low" and verdict: "yellow".`
      }]
    });

    const text = msg.content[0]?.text?.trim() || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return {
      available: true,
      quotaAttainment: parsed.quotaAttainment || null,
      rating: parsed.rating || null,
      verdict: parsed.verdict || 'yellow',
      summary: parsed.summary || 'No data available',
      confidence: parsed.confidence || 'low',
      url: repvueUrl,
      source: 'ai-estimated'
    };
  } catch (err) {
    console.error('[repvue-ai]', err.message);
    return {
      available: false,
      verdict: 'yellow',
      summary: 'Could not retrieve data',
      url: repvueUrl,
      source: 'error'
    };
  }
}

