// api/scraper-v2.js — Active Jobs DB (RapidAPI) single-call scraper
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const CONFIG = {
  emailTo: 'mgolia6@gmail.com',
  minBaseSalary: 150000, // $150K base ~ $300K OTE
  // Orgs to skip — staffing agencies and job board wrappers
  blockedOrgs: ['staffing', 'recruiting', 'talent', 'search group', 'jobgether', 'foresight works'],
  // ATS sources to skip — pure aggregators
  blockedSources: ['jobgether']
};

module.exports = async function handler(req, res) {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('[scraper-v2] START', new Date().toISOString());

    const raw = await fetchJobs();
    console.log(`[scraper-v2] raw results from API: ${raw.length}`);

    const normalized = raw.map(normalizeJob).filter(Boolean);
    console.log(`[scraper-v2] after normalize+filter: ${normalized.length}`);

    // Log what got filtered out for debugging
    const filterLog = {
      noCompanyOrTitle: raw.filter(j => !j.organization || !j.title).length,
      blockedOrg: raw.filter(j => {
        const c = (j.organization || '').toLowerCase();
        return CONFIG.blockedOrgs.some(b => c.includes(b));
      }).length,
      nonUS: raw.filter(j => {
        const countries = j.countries_derived || [];
        return countries.length > 0 && !countries.includes('United States');
      }).length,
      titleNoMatch: raw.filter(j => {
        const t = (j.title || '').toLowerCase();
        return !['account executive', 'strategic account'].some(k => t.includes(k));
      }).length,
      salaryTooLow: raw.filter(j => {
        if (!j.salary_raw?.value) return false;
        const val = j.salary_raw.value;
        const max = val.maxValue || val.minValue;
        return max && val.unitText === 'YEAR' && max < CONFIG.minBaseSalary;
      }).length,
    };
    console.log('[scraper-v2] filter breakdown:', JSON.stringify(filterLog));

    const deduped = dedupe(normalized);
    console.log(`[scraper-v2] after dedupe: ${deduped.length}`);

    // FIX: only filter by job_id (exact posting seen before)
    // Company-name filter removed — blocks legit new postings from companies already applied to
    const newJobs = await filterSeen(deduped);
    console.log(`[scraper-v2] after filterSeen (id-only): ${newJobs.length}`);

    if (newJobs.length > 0) {
      await storeJobs(newJobs);
      await sendSummaryEmail(newJobs);
    }

    return res.status(200).json({
      success: true,
      raw: raw.length,
      filterLog,
      normalized: normalized.length,
      deduped: deduped.length,
      new: newJobs.length
    });

  } catch (err) {
    console.error('[scraper-v2] ERROR:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

async function fetchJobs() {
  const url = new URL('https://active-jobs-db.p.rapidapi.com/active-ats-24h');
  url.searchParams.append('title_filter', "'enterprise account executive' | 'strategic account executive'");
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

function normalizeJob(j) {
  const company = (j.organization || '').trim();
  const title   = (j.title || '').trim();
  const url     = j.url || '';
  const source  = j.source || 'unknown';

  // Must have company and title
  if (!company || !title) return null;

  // Block staffing agencies and aggregator wrappers
  const companyLower = company.toLowerCase();
  if (CONFIG.blockedOrgs.some(b => companyLower.includes(b))) {
    console.log(`[filter] blocked org: ${company}`);
    return null;
  }
  if (CONFIG.blockedSources.includes(source.toLowerCase())) {
    console.log(`[filter] blocked source: ${source}`);
    return null;
  }

  // Must be in United States
  const countries = j.countries_derived || [];
  if (countries.length > 0 && !countries.includes('United States')) {
    console.log(`[filter] non-US: ${company} — ${countries.join(', ')}`);
    return null;
  }

  // Title must match AE keywords
  const titleLower = title.toLowerCase();
  const aeMatch = ['account executive', 'strategic account'].some(k => titleLower.includes(k));
  if (!aeMatch) return null;

  // Parse salary — try salary_raw first, then description text
  let baseSalary = null;
  let salaryDisplay = 'Not listed';

  if (j.salary_raw && j.salary_raw.value) {
    const val = j.salary_raw.value;
    const max = val.maxValue || val.minValue;
    const min = val.minValue || val.maxValue;
    if (max && j.salary_raw.value.unitText === 'YEAR') {
      baseSalary = max;
      salaryDisplay = `$${Math.round(min / 1000)}K–$${Math.round(max / 1000)}K`;
    }
  }

  // Fall back to description text parsing
  if (!baseSalary && j.description_text) {
    const desc = j.description_text;
    const matches = desc.match(/\$([\d,]+)(?:,000)?(?:\s*[-–]\s*\$([\d,]+)(?:,000)?)?/g);
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

  // Apply salary floor — only filter if we actually found a salary
  if (baseSalary && baseSalary < CONFIG.minBaseSalary) {
    console.log(`[filter] salary too low ($${baseSalary}): ${company} — ${title}`);
    return null;
  }

  // Location
  const location = (j.locations_derived && j.locations_derived[0])
    ? j.locations_derived[0]
    : (j.locations_alt_raw && j.locations_alt_raw[0])
    ? j.locations_alt_raw[0]
    : 'United States';

  const remote = j.remote_derived === true;

  return {
    jobId:        `activejobs-${j.id}`,
    source:       source,
    title:        title,
    company:      company,
    location:     location,
    remote:       remote,
    salary:       salaryDisplay,
    baseSalary:   baseSalary,
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
  // FIX: only filter by exact job_id — do NOT filter by company name
  // Rationale: company-name filter permanently blocks all new postings from companies
  // already in the pipeline (e.g. Microsoft, Salesforce post new roles constantly)
  const { data: existing } = await supabase.from('jobs').select('job_id');
  const seenIds = new Set((existing || []).map(j => j.job_id));
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

async function sendSummaryEmail(jobs) {
  const rows = jobs.map(j =>
    `${j.company} | ${j.title} | ${j.salary} | ${j.location}${j.remote ? ' (Remote)' : ''}\n${j.applyUrl}`
  ).join('\n\n');

  const subject = `[Job Odyssey] ${jobs.length} new role${jobs.length > 1 ? 's' : ''} — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  const text = `${jobs.length} new enterprise AE role${jobs.length > 1 ? 's' : ''} found:\n\n${rows}\n\n---\nReview in dashboard: https://job-search-automation-pink.vercel.app`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Job Odyssey <onboarding@resend.dev>',
      to: [CONFIG.emailTo],
      subject,
      text
    })
  });

  const data = await res.json();
  if (!res.ok) console.error('[email] error:', JSON.stringify(data));
  else console.log(`[email] sent — ${jobs.length} jobs`);
}
