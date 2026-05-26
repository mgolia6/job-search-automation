// api/scraper.js — JSearch (RapidAPI) for job discovery
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const CONFIG = {
  maxAgeDays: 2,
  emailTo: 'mgolia6@gmail.com',
  titleKeywords: ['account executive','strategic account','enterprise account','enterprise sales'],
  searches: [
    'Enterprise Account Executive remote',
    'Strategic Account Executive remote',
    'Senior Account Executive SaaS remote',
    'Strategic Account Manager B2B remote',
  ]
};

async function jsearch(query) {
  const params = new URLSearchParams({
    query,
    num_pages: '1',
    country: 'us',
    date_posted: 'today'
  });
  const url = `https://jsearch.p.rapidapi.com/search-v2?${params}`;

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'x-rapidapi-host': 'jsearch.p.rapidapi.com',
      'x-rapidapi-key': process.env.RAPIDAPI_KEY
    },
    signal: AbortSignal.timeout(10000)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`JSearch ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.data || [];
}

async function runJobScraper() {
  console.log('[scraper] START', new Date().toISOString());
  const allJobs = [];

  for (const query of CONFIG.searches) {
    try {
      console.log('[scraper] searching:', query);
      const results = await jsearch(query);
      console.log(`[scraper] "${query}": ${results.length} results`);

      for (const j of results) {
        if (!isAERole(j.job_title)) continue;

        const source = j.job_apply_link?.includes('greenhouse') ? 'Greenhouse'
          : j.job_apply_link?.includes('lever') ? 'Lever'
          : j.job_apply_link?.includes('ashby') ? 'Ashby'
          : j.job_publisher || 'JSearch';

        const salary = formatSalary(j);

        allJobs.push({
          jobId: `jsearch-${j.job_id}`,
          source,
          title: j.job_title,
          company: j.employer_name,
          location: j.job_city ? `${j.job_city}, ${j.job_state}` : 'Remote',
          salary,
          applyUrl: j.job_apply_link || j.job_google_link,
          postedDate: j.job_posted_at_datetime_utc ? new Date(j.job_posted_at_datetime_utc) : new Date()
        });
      }
      await new Promise(r => setTimeout(r, 500));
    } catch(e) {
      console.error(`[scraper] "${query}":`, e.message);
    }
  }

  console.log(`[scraper] raw total: ${allJobs.length}`);
  const deduped = globalDedupe(allJobs);
  const newJobs = await filterNewJobs(deduped);
  console.log(`[scraper] ${newJobs.length} new after filter`);

  if (!newJobs.length) return { jobsFound: 0 };

  const enriched = await enrichJobs(newJobs);
  await storeJobs(enriched);
  for (const job of enriched) await sendAlert(job);

  console.log(`[scraper] done. ${enriched.length} alerts sent.`);
  return { jobsFound: enriched.length };
}

function formatSalary(j) {
  if (j.job_min_salary && j.job_max_salary) {
    const fmt = n => n >= 1000 ? `$${Math.round(n/1000)}k` : `$${n}`;
    return `${fmt(j.job_min_salary)}–${fmt(j.job_max_salary)} ${j.job_salary_period || ''}`.trim();
  }
  return 'Not listed';
}

function isAERole(title) {
  if (!title) return false;
  return CONFIG.titleKeywords.some(k => title.toLowerCase().includes(k));
}

function globalDedupe(jobs) {
  const seen = new Set();
  return jobs.filter(j => {
    const k = `${j.company.toLowerCase()}|${j.title.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

async function filterNewJobs(jobs) {
  const { data: seen } = await supabase.from('jobs').select('job_id');
  const { data: applied } = await supabase.from('applications').select('company');
  const seenIds = new Set((seen || []).map(j => j.job_id));
  const appliedCos = new Set((applied || []).map(a => a.company.toLowerCase()));
  return jobs.filter(j => !seenIds.has(j.jobId) && !appliedCos.has(j.company.toLowerCase()));
}

async function enrichJobs(jobs) {
  const enriched = [];
  for (const job of jobs) {
    try {
      const health = await fetchHealth(job.company);
      enriched.push({ ...job, health, gut: gutCheck(health) });
    } catch(e) {
      enriched.push({ ...job, health: {}, gut: 'MAYBE — No health data' });
    }
  }
  return enriched;
}

async function fetchHealth(company) {
  const { data: cached } = await supabase
    .from('company_health').select('*').eq('company', company).single();
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  if (cached && new Date(cached.last_updated) > weekAgo) return cached;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: `Look up ${company} sales team on RepVue and Glassdoor. Return ONLY JSON: {"repvueScore":null,"quotaAttainment":null,"glassdoorRating":null,"redFlags":null}` }]
    })
  });

  if (!res.ok) return {};
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  const match = text.match(/\{[\s\S]*?\}/);
  let health = {};
  try { if (match) health = JSON.parse(match[0]); } catch(e) {}
  await supabase.from('company_health').upsert({ company, ...health, last_updated: new Date() });
  return health;
}

function gutCheck(h) {
  const flags = [];
  if (h.quotaAttainment != null && h.quotaAttainment < 40) flags.push(`quota ${h.quotaAttainment}%`);
  if (h.glassdoorRating != null && h.glassdoorRating < 3.5) flags.push(`Glassdoor ${h.glassdoorRating}/5`);
  if (h.redFlags) flags.push(h.redFlags);
  const sig = [
    h.repvueScore != null ? `RepVue ${h.repvueScore}` : null,
    h.quotaAttainment != null ? `${h.quotaAttainment}% attainment` : null,
    h.glassdoorRating != null ? `GD ${h.glassdoorRating}/5` : null
  ].filter(Boolean).join(' · ') || 'No data';
  if (flags.length >= 2) return `PASS — ${flags.join(', ')}. ${sig}`;
  if (flags.length === 1) return `MAYBE — ${flags[0]}. ${sig}`;
  return `APPLY — Clean. ${sig}`;
}

async function storeJobs(jobs) {
  if (!jobs.length) return;
  const { error } = await supabase.from('jobs').insert(jobs.map(j => ({
    job_id: j.jobId, company: j.company, title: j.title,
    salary: j.salary, location: j.location,
    posted_date: j.postedDate, apply_url: j.applyUrl,
    gut_check: j.gut || 'MAYBE — No health data',
    scraped_at: new Date()
  })));
  if (error) console.error('[store]', error.message);
}

async function sendAlert(job) {
  const h = job.health || {};
  const subject = `[${job.source}] ${job.company}: ${job.title}`;
  const text = [
    job.gut || 'MAYBE',
    '',
    `Company:  ${job.company}`,
    `Role:     ${job.title}`,
    `Source:   ${job.source}`,
    `Salary:   ${job.salary}`,
    `Location: ${job.location}`,
    `Link:     ${job.applyUrl}`,
    '',
    'SIGNALS:',
    `  RepVue:           ${h.repvueScore ?? 'N/A'}`,
    `  Quota attainment: ${h.quotaAttainment ?? 'N/A'}%`,
    `  Glassdoor:        ${h.glassdoorRating ?? 'N/A'}/5`,
    `  Red flags:        ${h.redFlags || 'None'}`,
    '',
    '---',
    'Paste JD in Claude → resume + 2 CLs'
  ].join('\n');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Job Alerts <onboarding@resend.dev>', to: [CONFIG.emailTo], subject, text })
  });
  const data = await res.json();
  if (!res.ok) console.error('[email]', JSON.stringify(data));
  else console.log('[email] sent:', job.company);
}

module.exports = { runJobScraper };
