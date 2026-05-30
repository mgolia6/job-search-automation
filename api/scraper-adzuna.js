// api/scraper-adzuna.js — Adzuna Job Search API (free tier, 250 req/day)
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);

const BLOCKED_ORGS = ['staffing', 'recruiting', 'talent', 'search group', 'jobgether', 'foresight works'];
const STRONG_MATCH_THRESHOLD = 75;

module.exports = async function handler(req, res) {
  const auth = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const userId = req.headers['x-user-id'];
  const isCronSecret = auth === process.env.CRON_SECRET;

  if (!isCronSecret && !userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('[scraper-adzuna] START', new Date().toISOString());

    if (!userId) throw new Error('No user_id provided');

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('user_id, target_titles, salary_floor_base, remote_preference, email, resume_text')
      .eq('user_id', userId)
      .eq('onboarding_complete', true)
      .single();

    if (profileErr || !profile) throw new Error('Failed to load profile: ' + (profileErr?.message || 'not found'));

    const minBase = profile.salary_floor_base || 125000;
    const resumeText = profile.resume_text || null;

    const rawTitles = profile.target_titles?.length
      ? profile.target_titles
      : ['Enterprise Account Executive', 'Strategic Account Executive'];

    console.log(`[scraper-adzuna] profile loaded — minBase: $${minBase}, titles: ${rawTitles.join(', ')}, hasResume: ${!!resumeText}`);

    // Fetch for each title separately (Adzuna does keyword match, not OR)
    const allRaw = [];
    for (const title of rawTitles) {
      const results = await fetchJobs(title, minBase);
      allRaw.push(...results);
    }
    console.log(`[scraper-adzuna] raw results: ${allRaw.length}`);

    const normalized = allRaw.map(normalizeJob).filter(Boolean);
    console.log(`[scraper-adzuna] after normalize: ${normalized.length}`);

    const deduped = dedupe(normalized);
    console.log(`[scraper-adzuna] after dedupe: ${deduped.length}`);

    console.log('[scraper-adzuna] enriching with Greenhouse/Lever/Ashby...');
    const enriched = await enrichWithATS(deduped);
    const ghHits = enriched.filter(j => j.jdSource !== 'adzuna').length;
    console.log(`[scraper-adzuna] ATS enrichment: ${ghHits}/${enriched.length} hits`);

    const newJobs = await filterSeen(enriched, userId);
    console.log(`[scraper-adzuna] after filterSeen: ${newJobs.length}`);

    // Auto-score against resume if available — parallel, best-effort
    let scored = newJobs;
    let strongMatches = 0;
    if (resumeText && newJobs.length > 0) {
      console.log(`[scraper-adzuna] auto-scoring ${newJobs.length} jobs...`);
      scored = await autoScore(newJobs, resumeText);
      strongMatches = scored.filter(j => (j.atsScore || 0) >= STRONG_MATCH_THRESHOLD).length;
      console.log(`[scraper-adzuna] scored — strong matches: ${strongMatches}/${scored.length}`);
    }

    if (scored.length > 0) {
      await storeJobs(scored, userId);
      console.log('[scraper-adzuna] stored', scored.length, 'jobs');
    }

    return res.status(200).json({
      success: true,
      raw: allRaw.length,
      normalized: normalized.length,
      deduped: deduped.length,
      new: scored.length,
      scored: resumeText ? scored.length : 0,
      strongMatches,
      source: 'adzuna'
    });

  } catch (err) {
    console.error('[scraper-adzuna] ERROR:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

async function fetchJobs(titleQuery, minBase) {
  const APP_ID = process.env.ADZUNA_APP_ID;
  const APP_KEY = process.env.ADZUNA_APP_KEY;

  if (!APP_ID || !APP_KEY) throw new Error('ADZUNA_APP_ID or ADZUNA_APP_KEY not set');

  const url = new URL('https://api.adzuna.com/v1/api/jobs/us/search/1');
  url.searchParams.append('app_id', APP_ID);
  url.searchParams.append('app_key', APP_KEY);
  url.searchParams.append('what_phrase', titleQuery);
  url.searchParams.append('results_per_page', '50');
  url.searchParams.append('salary_min', minBase);
  url.searchParams.append('full_time', '1');
  url.searchParams.append('sort_by', 'date');
  url.searchParams.append('max_days_old', '1');
  url.searchParams.append('content-type', 'application/json');

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Adzuna ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.results || [];
}

function normalizeJob(j) {
  const company = (j.company?.display_name || '').trim();
  const title = (j.title || '').trim();
  const url = j.redirect_url || '';

  if (!company || !title) return null;

  const companyLower = company.toLowerCase();
  if (BLOCKED_ORGS.some(b => companyLower.includes(b))) return null;

  const titleLower = title.toLowerCase();
  const aeMatch = ['account executive', 'strategic account', 'account manager'].some(k => titleLower.includes(k));
  if (!aeMatch) return null;

  const location = j.location?.display_name || 'United States';
  const estimatedOTE = j.salary_max ? Math.floor(j.salary_max) : null;
  const baseSalary   = j.salary_min ? Math.floor(j.salary_min) : (estimatedOTE ? Math.floor(estimatedOTE * 0.5) : null);
  const salaryDisplay = estimatedOTE
    ? `$${Math.round((j.salary_min || 0) / 1000)}K–$${Math.round(estimatedOTE / 1000)}K OTE`
    : 'Not listed';

  return {
    jobId: `adzuna-${j.id}`,
    source: 'adzuna',
    title,
    company,
    location,
    remote: titleLower.includes('remote') || location.toLowerCase().includes('remote'),
    salary: salaryDisplay,
    baseSalary,
    estimatedOTE,
    applyUrl: url,
    postedDate: j.created ? new Date(j.created).toISOString() : new Date().toISOString(),
    description: (j.description || '').trim()
  };
}

function dedupe(jobs) {
  const seen = new Set();
  return jobs.filter(j => {
    const key = `${j.company.toLowerCase()}|${j.title.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function filterSeen(jobs, userId) {
  const [{ data: seenJobs }, { data: appliedJobs }] = await Promise.all([
    supabase.from('jobs').select('job_id').eq('user_id', userId),
    supabase.from('applications').select('job_id').not('job_id', 'is', null)
  ]);

  const seenIds = new Set([
    ...(seenJobs || []).map(j => j.job_id),
    ...(appliedJobs || []).map(a => a.job_id)
  ]);

  return jobs.filter(j => !seenIds.has(j.jobId));
}

// ── Auto-score — Claude semantic fit check against resume ─────────────────────
async function autoScore(jobs, resumeText) {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    console.warn('[auto-score] ANTHROPIC_API_KEY not set — skipping');
    return jobs;
  }

  // Score in parallel, best-effort — failures don't block storage
  const results = await Promise.allSettled(jobs.map(async (job) => {
    const jd = job.fullDescription || job.description || '';
    if (!jd || jd.length < 50) {
      return { ...job, atsScore: null, atsMissingKeywords: [], atsJdSource: 'none' };
    }

    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 400,
          system: 'You are an ATS scoring engine. Respond ONLY with a valid JSON object. No markdown, no backticks, no explanation.',
          messages: [{
            role: 'user',
            content: `Score this resume against this job description. Return JSON with exactly: overall_score (integer 0-100), verdict (string: "strong match" or "moderate match" or "weak match"), missing_hard (array of up to 6 strings). JOB: ${jd.slice(0, 2500)} RESUME: ${resumeText.slice(0, 3000)}`
          }]
        }),
        signal: AbortSignal.timeout(20000)
      });

      if (!r.ok) throw new Error(`Anthropic ${r.status}`);
      const data = await r.json();
      const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(text);

      return {
        ...job,
        atsScore: typeof parsed.overall_score === 'number' ? Math.round(parsed.overall_score) : null,
        atsMissingKeywords: Array.isArray(parsed.missing_hard) ? parsed.missing_hard : [],
        atsJdSource: job.jdSource || 'adzuna'
      };
    } catch (err) {
      console.log(`[auto-score] miss: ${job.company} — ${err.message}`);
      return { ...job, atsScore: null, atsMissingKeywords: [], atsJdSource: job.jdSource || 'adzuna' };
    }
  }));

  return results.map((r, i) => r.status === 'fulfilled' ? r.value : { ...jobs[i], atsScore: null, atsMissingKeywords: [] });
}

// ── ATS Enrichment — fetch full JD from Greenhouse/Lever/Ashby ────────────────
async function enrichWithATS(jobs) {
  return Promise.all(jobs.map(async (job) => {
    try {
      const slug = job.company
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      // Try Greenhouse first
      const ghUrl = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;
      const ghRes = await fetch(ghUrl, { signal: AbortSignal.timeout(4000) });
      if (ghRes.ok) {
        const ghData = await ghRes.json();
        const match = (ghData.jobs || []).find(j => {
          const title = (j.title || '').toLowerCase();
          const jobTitle = job.title.toLowerCase();
          return title.includes(jobTitle.split(' ').slice(0,2).join(' ')) ||
                 jobTitle.includes(title.split(' ').slice(0,2).join(' '));
        });
        if (match && match.content) {
          const fullJD = match.content
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();
          console.log(`[enrich] Greenhouse hit: ${job.company}`);
          return { ...job, fullDescription: fullJD, jdSource: 'greenhouse' };
        }
      }

      // Try Lever
      const lvUrl = `https://api.lever.co/v0/postings/${slug}?mode=json`;
      const lvRes = await fetch(lvUrl, { signal: AbortSignal.timeout(4000) });
      if (lvRes.ok) {
        const lvData = await lvRes.json();
        const postings = Array.isArray(lvData) ? lvData : [];
        const match = postings.find(p => {
          const title = (p.text || '').toLowerCase();
          const jobTitle = job.title.toLowerCase();
          return title.includes(jobTitle.split(' ').slice(0,2).join(' ')) ||
                 jobTitle.includes(title.split(' ').slice(0,2).join(' '));
        });
        if (match) {
          const listText = (match.lists || [])
            .map(l => (l.content || []).map(c => c.text || '').join(' '))
            .join(' ');
          const combined = [match.descriptionBody, listText, match.description]
            .filter(Boolean).join(' ');
          const fullJD = combined.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
          if (fullJD.length > 100) {
            console.log(`[enrich] Lever hit: ${job.company}`);
            return { ...job, fullDescription: fullJD, jdSource: 'lever' };
          }
        }
      }

      // Try Ashby
      const ashbyUrl = `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`;
      const ashbyRes = await fetch(ashbyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationName: 'ApiJobBoardWithTeams', variables: { organizationHostedJobsPageName: slug }, query: '{ jobBoard { jobPostings { title descriptionHtml } } }' }),
        signal: AbortSignal.timeout(4000)
      });
      if (ashbyRes.ok) {
        const ashbyData = await ashbyRes.json();
        const postings = ashbyData?.data?.jobBoard?.jobPostings || [];
        const match = postings.find(p => {
          const title = (p.title || '').toLowerCase();
          const jobTitle = job.title.toLowerCase();
          return title.includes(jobTitle.split(' ').slice(0,2).join(' '));
        });
        if (match && match.descriptionHtml) {
          const fullJD = match.descriptionHtml.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
          if (fullJD.length > 100) {
            console.log(`[enrich] Ashby hit: ${job.company}`);
            return { ...job, fullDescription: fullJD, jdSource: 'ashby' };
          }
        }
      }
    } catch (err) {
      console.log(`[enrich] miss: ${job.company} — ${err.message}`);
    }

    return { ...job, fullDescription: null, jdSource: 'adzuna' };
  }));
}

async function storeJobs(jobs, userId) {
  const { error } = await supabase.from('jobs').insert(jobs.map(j => ({
    job_id: j.jobId,
    company: j.company,
    title: j.title,
    source: j.source,
    salary: j.salary,
    base_salary: j.baseSalary,
    estimated_ote: j.estimatedOTE,
    location: j.location,
    posted_date: j.postedDate,
    apply_url: j.applyUrl,
    status: 'new',
    gut_check: 'MAYBE — review needed',
    description: j.description || null,
    full_description: j.fullDescription || null,
    jd_source: j.jdSource || 'adzuna',
    scraped_at: new Date().toISOString(),
    user_id: userId,
    ats_score: j.atsScore !== undefined ? j.atsScore : null,
    ats_missing_keywords: j.atsMissingKeywords || [],
    ats_analyzed_at: j.atsScore !== null && j.atsScore !== undefined ? new Date().toISOString() : null,
    ats_jd_source: j.atsJdSource || null
  })));
  if (error) throw new Error('[store] insert failed: ' + error.message);
}

module.exports.config = { maxDuration: 300 };
