// api/scraper-v2.js — Active Jobs DB (RapidAPI), profile-driven
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const BLOCKED_ORGS    = ['staffing', 'recruiting', 'talent', 'search group', 'jobgether', 'foresight works'];
const BLOCKED_SOURCES = ['jobgether'];

module.exports = async function handler(req, res) {
  // Auth: accept CRON_SECRET (scheduled) or x-user-id header set by cron.js after JWT verification
  const auth = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const userId = req.headers['x-user-id'];
  const isCronSecret = auth === process.env.CRON_SECRET;

  if (!isCronSecret && !userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('[scraper-v2] START', new Date().toISOString());

    // Pull user profile — use x-user-id if set, otherwise fall back to first onboarded user
    const profileQuery = supabase
      .from('profiles')
      .select('user_id, target_titles, salary_floor_base, salary_floor_ote, remote_preference, target_locations, email')
      .eq('onboarding_complete', true);

    if (userId) profileQuery.eq('user_id', userId);

    const { data: profile, error: profileErr } = await profileQuery.single();

    if (profileErr || !profile) throw new Error('Failed to load profile: ' + (profileErr?.message || 'not found'));

    const minBase   = profile.salary_floor_base || 125000;
    const emailTo   = profile.email || 'mgolia6@gmail.com';
    const remoteOnly = profile.remote_preference === 'remote';

    // Build title filter from profile — OR join with pipe
    const titles = (profile.target_titles || ['Enterprise Account Executive', 'Strategic Account Executive'])
      .map(t => `'${t.toLowerCase()}'`)
      .join(' | ');

    console.log(`[scraper-v2] profile loaded — minBase: $${minBase}, remote: ${remoteOnly}, titles: ${titles}`);

    const raw = await fetchJobs(titles);
    console.log(`[scraper-v2] raw results: ${raw.length}`);

    const normalized = raw.map(j => normalizeJob(j, minBase, remoteOnly)).filter(Boolean);
    console.log(`[scraper-v2] after normalize+filter: ${normalized.length}`);

    const deduped = dedupe(normalized);
    console.log(`[scraper-v2] after in-batch dedupe: ${deduped.length}`);

    const newJobs = await filterSeen(deduped);
    console.log(`[scraper-v2] after filterSeen (job_id only): ${newJobs.length}`);

    if (newJobs.length > 0) {
      await storeJobs(newJobs);
      await sendSummaryEmail(newJobs, emailTo);
    }

    return res.status(200).json({
      success: true,
      raw: raw.length,
      normalized: normalized.length,
      deduped: deduped.length,
      new: newJobs.length,
      config: { minBase, remoteOnly, titles }
    });

  } catch (err) {
    console.error('[scraper-v2] ERROR:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

async function fetchJobs(titleFilter) {
  const url = new URL('https://active-jobs-db.p.rapidapi.com/active-ats-24h');
  url.searchParams.append('title_filter', titleFilter);
  url.searchParams.append('location_filter', '"United States"');
  url.searchParams.append('description_type', 'text');

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-rapidapi-host': 'active-jobs-db.p.rapidapi.com',
      'x-rapidapi-key': process.env.RAPIDAPI_KEY
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Active Jobs DB ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : (data.data || data.jobs || []);
}

function normalizeJob(j, minBase, remoteOnly) {
  const company = (j.organization || '').trim();
  const title   = (j.title || '').trim();
  const url     = j.url || '';
  const source  = j.source || 'unknown';

  if (!company || !title) return null;

  const companyLower = company.toLowerCase();
  if (BLOCKED_ORGS.some(b => companyLower.includes(b))) return null;
  if (BLOCKED_SOURCES.includes(source.toLowerCase())) return null;

  const countries = j.countries_derived || [];
  if (countries.length > 0 && !countries.includes('United States')) return null;

  // Remote filter — only applied if user wants remote only
  if (remoteOnly && j.remote_derived === false) return null;

  // Title match against AE keywords (broad catch — titles come from profile but API filter isn't exact)
  const titleLower = title.toLowerCase();
  const aeMatch = ['account executive', 'strategic account', 'account manager'].some(k => titleLower.includes(k));
  if (!aeMatch) return null;

  // Salary parsing
  let baseSalary = null;
  let salaryDisplay = 'Not listed';

  if (j.salary_raw?.value) {
    const val = j.salary_raw.value;
    const max = val.maxValue || val.minValue;
    const min = val.minValue || val.maxValue;
    if (max && val.unitText === 'YEAR') {
      baseSalary = max;
      salaryDisplay = `$${Math.round(min / 1000)}K–$${Math.round(max / 1000)}K`;
    }
  }

  if (!baseSalary && j.description_text) {
    const matches = j.description_text.match(/\$([\d,]+)(?:,000)?(?:\s*[-–]\s*\$([\d,]+)(?:,000)?)?/g);
    if (matches) {
      for (const m of matches) {
        const nums = m.replace(/[\$,]/g, '').split(/[-–]/).map(Number);
        const max = Math.max(...nums);
        if (max >= 50000 && max <= 1000000) {
          baseSalary = max < 10000 ? max * 1000 : max;
          salaryDisplay = m.trim();
          break;
        }
      }
    }
  }

  // Only filter on salary if we found one — don't exclude unknowns
  if (baseSalary && baseSalary < minBase) return null;

  const location = (j.locations_derived?.[0]) || (j.locations_alt_raw?.[0]) || 'United States';
  const remote   = j.remote_derived === true;

  return {
    jobId:        `activejobs-${j.id}`,
    source,
    title,
    company,
    location,
    remote,
    salary:       salaryDisplay,
    baseSalary,
    estimatedOTE: baseSalary ? Math.round(baseSalary * 2) : null,
    applyUrl:     url,
    postedDate:   j.date_posted ? new Date(j.date_posted) : new Date(),
    description:  (j.description_text || '').slice(0, 500)
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

async function filterSeen(jobs) {
  // job_id only — never filter by company name (blocks legit new postings)
  // Also check applications table so applied jobs don't resurface as leads
  const [{ data: seenJobs }, { data: appliedJobs }] = await Promise.all([
    supabase.from('jobs').select('job_id'),
    supabase.from('applications').select('job_id').not('job_id', 'is', null)
  ]);

  const seenIds = new Set([
    ...(seenJobs  || []).map(j => j.job_id),
    ...(appliedJobs || []).map(a => a.job_id)
  ]);

  return jobs.filter(j => !seenIds.has(j.jobId));
}

async function storeJobs(jobs) {
  const { error } = await supabase.from('jobs').insert(jobs.map(j => ({
    job_id:        j.jobId,
    company:       j.company,
    title:         j.title,
    source:        j.source,
    salary:        j.salary,
    base_salary:   j.baseSalary,
    estimated_ote: j.estimatedOTE,
    location:      j.location,
    posted_date:   j.postedDate,
    apply_url:     j.applyUrl,
    status:        'new',
    gut_check:     'MAYBE — review needed',
    scraped_at:    new Date()
  })));
  if (error) console.error('[store] error:', error.message);
}

async function sendSummaryEmail(jobs, emailTo) {
  const rows = jobs.map(j =>
    `${j.company} | ${j.title} | ${j.salary} | ${j.location}${j.remote ? ' (Remote)' : ''}\n${j.applyUrl}`
  ).join('\n\n');

  const subject = `[Job Odyssey] ${jobs.length} new lead${jobs.length > 1 ? 's' : ''} — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  const text = `${jobs.length} new enterprise AE lead${jobs.length > 1 ? 's' : ''} found:\n\n${rows}\n\n---\nReview in dashboard: https://job-search-automation-pink.vercel.app`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Job Odyssey <onboarding@resend.dev>',
      to: [emailTo],
      subject,
      text
    })
  });

  const data = await res.json();
  if (!res.ok) console.error('[email] error:', JSON.stringify(data));
  else console.log(`[email] sent — ${jobs.length} leads`);
}
