// api/scraper-adzuna.js — Adzuna Job Search API (free tier, 250 req/day)
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);

const BLOCKED_ORGS = ['staffing', 'recruiting', 'talent', 'search group', 'jobgether', 'foresight works'];

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
      .select('user_id, target_titles, salary_floor_base, remote_preference, email')
      .eq('user_id', userId)
      .eq('onboarding_complete', true)
      .single();

    if (profileErr || !profile) throw new Error('Failed to load profile: ' + (profileErr?.message || 'not found'));

    const minBase = profile.salary_floor_base || 125000;
    const emailTo = profile.email || 'mgolia6@gmail.com';

    const rawTitles = profile.target_titles?.length
      ? profile.target_titles
      : ['Enterprise Account Executive', 'Strategic Account Executive'];

    console.log(`[scraper-adzuna] profile loaded — minBase: $${minBase}, titles: ${rawTitles.join(', ')}`);

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

    const newJobs = await filterSeen(deduped, userId);
    console.log(`[scraper-adzuna] after filterSeen: ${newJobs.length}`);

    if (newJobs.length > 0) {
      await storeJobs(newJobs, userId);
      console.log('[scraper-adzuna] stored', newJobs.length, 'jobs');
    }

    return res.status(200).json({
      success: true,
      raw: allRaw.length,
      normalized: normalized.length,
      deduped: deduped.length,
      new: newJobs.length,
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
  url.searchParams.append('what_phrase', titleQuery); // exact phrase match
  url.searchParams.append('results_per_page', '50');
  url.searchParams.append('salary_min', minBase);
  url.searchParams.append('full_time', '1');
  url.searchParams.append('sort_by', 'date');
  url.searchParams.append('max_days_old', '3'); // last 3 days
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

  // Title relevance check — must be an AE-type role
  const titleLower = title.toLowerCase();
  const aeMatch = ['account executive', 'strategic account', 'account manager'].some(k => titleLower.includes(k));
  if (!aeMatch) return null;

  const location = j.location?.display_name || 'United States';
  const baseSalary = j.salary_max ? Math.floor(j.salary_max) : j.salary_min ? Math.floor(j.salary_min) : null;
  const salaryDisplay = baseSalary
    ? `$${Math.round((j.salary_min || baseSalary) / 1000)}K–$${Math.round(baseSalary / 1000)}K`
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
    estimatedOTE: baseSalary ? Math.round(baseSalary * 2) : null,
    applyUrl: url,
    postedDate: j.created ? new Date(j.created).toISOString() : new Date().toISOString(),
    description: (j.description || '').slice(0, 500)
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
    scraped_at: new Date().toISOString(),
    user_id: userId
  })));
  if (error) throw new Error('[store] insert failed: ' + error.message);
}


