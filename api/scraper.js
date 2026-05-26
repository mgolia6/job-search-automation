// api/scraper.js — direct Greenhouse + Lever API, no LLM for search
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const CONFIG = {
  maxAgeDays: 2,
  emailTo: 'mgolia6@gmail.com',
  titleKeywords: ['account executive','strategic account','enterprise account','enterprise sales'],
  // Greenhouse boards to search — public, no auth needed
  greenhouseBoards: [
    'databricks','snowflake','mongodb','hashicorp','confluent','elastic',
    'datadog','gitlab','okta','zendesk','hubspot','intercom','mixpanel',
    'segment','braze','amplitude','miro','notion','figma','linear',
    'retool','dbt','airbyte','highspot','outreach','salesloft','gong',
    'clari','chorus','seismic','showpad','mindtickle','lessonly',
    'workramp','lattice','culture-amp','leapsome','betterworks',
    'rippling','deel','remote','papaya-global','globalization-partners',
    'netsuite','coupa','zip','ironclad','docusign','pandadoc','proposify',
    'zuora','chargebee','maxio','recurly','paddle','stripe','braintree',
    'adyen','checkout','marqeta','unit','column','mercury','ramp','brex',
    'airbase','expensify','bill','tipalti','paylocity','paycom','ceridian',
    'ukg','workday','sap','oracle','salesforce','servicenow','zendesk',
    'freshworks','drift','qualified','chilipiper','calendly','loom',
    'mural','coda','airtable','smartsheet','asana','monday','clickup',
    'jira','atlassian','github','gitlab','sourcegraph','snyk','veracode',
    'crowdstrike','sentinelone','darktrace','cyberark','beyondtrust',
    'sailpoint','saviynt','ping-identity','auth0','duo','yubico'
  ]
};

async function runJobScraper() {
  console.log('[scraper] START', new Date().toISOString());

  const [ghJobs, leverJobs] = await Promise.allSettled([
    searchGreenhouse(),
    searchLever()
  ]);

  const all = [
    ...(ghJobs.status === 'fulfilled' ? ghJobs.value : []),
    ...(leverJobs.status === 'fulfilled' ? leverJobs.value : [])
  ];

  console.log(`[scraper] raw: GH=${ghJobs.status === 'fulfilled' ? ghJobs.value.length : 'ERR'} Lever=${leverJobs.status === 'fulfilled' ? leverJobs.value.length : 'ERR'}`);

  const deduped = globalDedupe(all);
  const newJobs = await filterNewJobs(deduped);
  console.log(`[scraper] ${newJobs.length} new after dedup/filter`);

  if (!newJobs.length) return { jobsFound: 0 };

  // Enrich with gut check (Claude web search for RepVue/Glassdoor)
  const enriched = await enrichJobs(newJobs);
  await storeJobs(enriched);
  for (const job of enriched) await sendAlert(job);

  console.log(`[scraper] done. ${enriched.length} alerts sent.`);
  return { jobsFound: enriched.length };
}

// ── Greenhouse direct API ─────────────────────────────────────────────────────
async function searchGreenhouse() {
  const jobs = [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CONFIG.maxAgeDays);

  // Also search the Greenhouse job board index
  try {
    const res = await fetch(
      'https://boards.greenhouse.io/api/v1/jobs?q=account+executive&remote=true',
      { headers: { 'User-Agent': 'JobBot/1.0' } }
    );
    if (res.ok) {
      const data = await res.json();
      const found = (data.jobs || []).filter(j => isAERole(j.title));
      console.log(`[gh-index] ${found.length} AE roles from index`);
      for (const j of found) {
        const posted = j.updated_at ? new Date(j.updated_at) : null;
        if (posted && posted < cutoff) continue;
        jobs.push(formatGHJob(j, j.company?.name || 'Unknown'));
      }
    }
  } catch(e) { console.error('[gh-index]', e.message); }

  // Also hit individual boards in parallel batches
  const batches = chunk(CONFIG.greenhouseBoards, 8);
  for (const batch of batches) {
    await Promise.all(batch.map(async board => {
      try {
        const res = await fetch(
          `https://boards.greenhouse.io/api/v1/boards/${board}/jobs?content=false`,
          { headers: { 'User-Agent': 'JobBot/1.0' }, signal: AbortSignal.timeout(5000) }
        );
        if (!res.ok) return;
        const data = await res.json();
        const matching = (data.jobs || []).filter(j => isAERole(j.title) && isRemote(j));
        for (const j of matching) {
          const posted = j.updated_at ? new Date(j.updated_at) : null;
          if (posted && posted < cutoff) continue;
          jobs.push(formatGHJob(j, board));
        }
      } catch(e) { /* silent — most boards just 404 */ }
    }));
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`[gh] total: ${jobs.length}`);
  return jobs;
}

function formatGHJob(j, board) {
  const company = j.company?.name || titleCase(board.replace(/-/g, ' '));
  return {
    jobId: `gh-${j.id}`,
    source: 'Greenhouse',
    title: j.title,
    company,
    location: j.location?.name || 'Remote',
    salary: 'Not listed',
    applyUrl: j.absolute_url || `https://boards.greenhouse.io/${board}/jobs/${j.id}`,
    postedDate: j.updated_at ? new Date(j.updated_at) : new Date()
  };
}

// ── Lever direct API ──────────────────────────────────────────────────────────
async function searchLever() {
  const jobs = [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CONFIG.maxAgeDays);

  try {
    // Lever has a public posting search
    const terms = ['enterprise+account+executive','strategic+account+executive','senior+account+executive'];
    for (const term of terms) {
      try {
        const res = await fetch(
          `https://api.lever.co/v0/postings?mode=json&commitment=Full-time&team=Sales&limit=100`,
          { headers: { 'User-Agent': 'JobBot/1.0' }, signal: AbortSignal.timeout(8000) }
        );
        if (!res.ok) continue;
        const data = await res.json();
        const matching = (Array.isArray(data) ? data : [])
          .filter(j => isAERole(j.text) && isRemoteLever(j));
        for (const j of matching) {
          const posted = j.createdAt ? new Date(j.createdAt) : null;
          if (posted && posted < cutoff) continue;
          jobs.push({
            jobId: `lever-${j.id}`,
            source: 'Lever',
            title: j.text,
            company: j.company || extractCompanyFromLever(j),
            location: j.categories?.location || 'Remote',
            salary: j.salaryRange ? `$${j.salaryRange.min}-$${j.salaryRange.max}` : 'Not listed',
            applyUrl: j.hostedUrl || j.applyUrl,
            postedDate: posted || new Date()
          });
        }
        break; // one call covers all
      } catch(e) { console.error('[lever]', e.message); }
    }
  } catch(e) { console.error('[lever-outer]', e.message); }

  console.log(`[lever] total: ${jobs.length}`);
  return jobs;
}

function extractCompanyFromLever(j) {
  if (j.hostedUrl) {
    const m = j.hostedUrl.match(/jobs\.lever\.co\/([^/]+)/);
    if (m) return titleCase(m[1].replace(/-/g, ' '));
  }
  return 'Unknown';
}

// ── Enrichment (Claude gut check) ────────────────────────────────────────────
async function enrichJobs(jobs) {
  // Batch gut checks — only for unique companies
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
  // Check cache first
  const { data: cached } = await supabase
    .from('company_health').select('*').eq('company', company).single();
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  if (cached && new Date(cached.last_updated) > weekAgo) return cached;

  // Ask Claude to look up RepVue + Glassdoor
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
      messages: [{ role: 'user', content: `Look up ${company} sales org on RepVue and Glassdoor. Return ONLY JSON, no other text: {"repvueScore":null,"quotaAttainment":null,"glassdoorRating":null,"redFlags":null}` }]
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

// ── Utilities ─────────────────────────────────────────────────────────────────
function isAERole(title) {
  if (!title) return false;
  return CONFIG.titleKeywords.some(k => title.toLowerCase().includes(k));
}

function isRemote(j) {
  const loc = (j.location?.name || '').toLowerCase();
  return loc.includes('remote') || loc.includes('united states') || loc === '';
}

function isRemoteLever(j) {
  const loc = (j.categories?.location || '').toLowerCase();
  return loc.includes('remote') || loc === '' || loc.includes('united states');
}

function titleCase(s) { return s.replace(/\b\w/g, c => c.toUpperCase()); }
function chunk(arr, n) { const r = []; for (let i = 0; i < arr.length; i += n) r.push(arr.slice(i, i+n)); return r; }
function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80); }

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
    'Paste JD in Claude → get resume + 2 CLs'
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
