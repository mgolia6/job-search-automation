import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase  = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const CONFIG = {
  titles: [
    'Enterprise Account Executive',
    'Strategic Account Executive',
    'Senior Account Executive',
    'Strategic Account Manager'
  ],
  minBaseSalary: 100000,
  minOTE:        200000,
  maxAgeDays:    5,
  emailTo:       'mgolia6@gmail.com',

  // Direct Greenhouse slugs — polled every run, no search needed
  greenhouseCompanies: [
    { slug: 'dataiku',    name: 'Dataiku' },
    { slug: 'twilio',     name: 'Twilio' },
    { slug: 'pendo',      name: 'Pendo' },
    { slug: 'hubspot',    name: 'HubSpot' },
    { slug: 'zendesk',    name: 'Zendesk' },
    { slug: 'gong-io',    name: 'Gong' },
    { slug: 'rippling',   name: 'Rippling' },
    { slug: 'qualtrics',  name: 'Qualtrics' },
    { slug: 'atlassian',  name: 'Atlassian' },
    { slug: 'ashby',      name: 'Ashby' },
    { slug: 'pegasystems', name: 'Pegasystems' },
  ],

  // AE title keywords for filtering Greenhouse results
  aeTitleKeywords: [
    'account executive',
    'account manager',
    'strategic account',
    'enterprise sales',
    'enterprise account'
  ]
};

// ── Entry point ───────────────────────────────────────────────────────────────
export async function runJobScraper() {
  console.log('[scraper] START', new Date().toISOString());

  // Run all three sources in parallel
  const [indeedJobs, greenhouseJobs, googleJobs] = await Promise.allSettled([
    searchIndeedJobs(),
    searchGreenhouseJobs(),
    searchGoogleATS()
  ]);

  const all = [
    ...(indeedJobs.status    === 'fulfilled' ? indeedJobs.value    : []),
    ...(greenhouseJobs.status === 'fulfilled' ? greenhouseJobs.value : []),
    ...(googleJobs.status    === 'fulfilled' ? googleJobs.value    : [])
  ];

  console.log(`[scraper] Raw totals — Indeed:${indeedJobs.value?.length||0} GH:${greenhouseJobs.value?.length||0} Google:${googleJobs.value?.length||0}`);

  const deduped  = globalDedupe(all);
  const newJobs  = await filterNewJobs(deduped);
  console.log(`[scraper] ${newJobs.length} new after dedup + DB filter`);

  if (!newJobs.length) {
    console.log('[scraper] Nothing new — done.');
    return { jobsFound: 0 };
  }

  const enriched = await enrichJobs(newJobs);
  await storeJobs(enriched);

  for (const job of enriched) {
    await sendAlert(job);
  }

  console.log(`[scraper] Done. Sent ${enriched.length} alerts.`);
  return { jobsFound: enriched.length };
}

// ── SOURCE 1: Indeed via MCP ──────────────────────────────────────────────────
async function searchIndeedJobs() {
  const results = [];
  for (const title of CONFIG.titles) {
    console.log(`[indeed] Searching: "${title}"`);
    try {
      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `Search Indeed for "${title}" jobs. Requirements: remote, United States, full-time. Return ALL results with: job ID, company, title, location, salary/compensation, posted date, and job URL.`
        }],
        mcp_servers: [{ type: 'url', url: 'https://mcp.indeed.com/claude/mcp', name: 'indeed-mcp' }]
      });
      const jobs = parseIndeedResponse(msg);
      console.log(`[indeed] "${title}" → ${jobs.length} after filters`);
      results.push(...jobs);
    } catch (err) {
      console.error(`[indeed] Failed "${title}":`, err.message);
    }
  }
  return results;
}

function parseIndeedResponse(message) {
  const jobs = [];
  const text = message.content
    .map(b => b.type === 'text' ? b.text : (b.content?.[0]?.text || ''))
    .join('\n');

  const blocks = text.split(/(?=\*?\*?Job(?:\s+Title)?:?\*?\*?\s)/i).filter(Boolean);
  for (const block of blocks) {
    const get = (patterns) => {
      for (const p of patterns) { const m = block.match(p); if (m) return m[1].trim(); }
      return null;
    };
    const title   = get([/\*\*Job Title:\*\*\s*(.+)/i, /Job Title:\s*(.+)/i]);
    const company = get([/\*\*Company:\*\*\s*(.+)/i, /Company:\s*(.+)/i]);
    if (!title || !company) continue;

    const salary  = get([/\*\*Compensation:\*\*\s*(.+)/i, /\*\*Salary:\*\*\s*(.+)/i, /Compensation:\s*(.+)/i, /Salary:\s*(.+)/i]);
    const posted  = get([/\*\*Posted(?:\s+on)?:\*\*\s*(.+)/i, /Posted(?:\s+on)?:\s*(.+)/i]);
    const url     = get([/\*\*(?:View Job |Apply )?URL:\*\*\s*(https?:\/\/\S+)/i, /(https?:\/\/[^\s]+indeed\.com[^\s]*)/i]);
    const location = get([/\*\*Location:\*\*\s*(.+)/i, /Location:\s*(.+)/i]);
    const jobId   = get([/\*\*Job Id:\*\*\s*(.+)/i, /Job ID:\s*(.+)/i]);

    if (!withinMaxAge(posted)) continue;
    if (salary && !meetsSalary(salary)) continue;

    jobs.push({
      jobId:     `indeed-${jobId || slugify(company + '-' + title)}`,
      source:    'Indeed',
      title, company,
      location:  location || 'Remote',
      salary:    salary || 'Not listed',
      applyUrl:  url || '',
      postedDate: posted ? new Date(posted) : new Date()
    });
  }
  return jobs;
}

// ── SOURCE 2: Greenhouse direct API ──────────────────────────────────────────
async function searchGreenhouseJobs() {
  const results = [];
  const UA = 'Mozilla/5.0 (compatible; JobSearchBot/1.0)';

  for (const co of CONFIG.greenhouseCompanies) {
    try {
      const url = `https://boards.greenhouse.io/api/v1/boards/${co.slug}/jobs?content=true`;
      const res  = await fetch(url, { headers: { 'User-Agent': UA } });

      if (!res.ok) {
        console.log(`[greenhouse] ${co.name}: HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();
      const jobs = (data.jobs || []).filter(j => isAERole(j.title));
      console.log(`[greenhouse] ${co.name}: ${jobs.length} AE roles`);

      for (const j of jobs) {
        const location = j.location?.name || 'Remote';
        if (!isRemoteFriendly(location)) continue;

        results.push({
          jobId:     `gh-${j.id}`,
          source:    'Greenhouse',
          title:     j.title,
          company:   co.name,
          location,
          salary:    extractGHSalary(j.content || ''),
          applyUrl:  j.absolute_url || `https://boards.greenhouse.io/${co.slug}/jobs/${j.id}`,
          postedDate: j.updated_at ? new Date(j.updated_at) : new Date()
        });
      }
    } catch (err) {
      console.error(`[greenhouse] ${co.name}:`, err.message);
    }
  }
  return results;
}

function isAERole(title) {
  if (!title) return false;
  const t = title.toLowerCase();
  return CONFIG.aeTitleKeywords.some(k => t.includes(k));
}

function isRemoteFriendly(location) {
  const l = (location || '').toLowerCase();
  return l.includes('remote') || l.includes('united states') || l.includes('us') || l === '';
}

function extractGHSalary(content) {
  // Greenhouse embeds salary in HTML content — try to extract
  const match = content.match(/\$[\d,]+(?:\s*[-–]\s*\$[\d,]+)?(?:\s*(?:per year|annually|\/yr|OTE))?/i);
  return match ? match[0] : 'Not listed';
}

// ── SOURCE 3: Google ATS sweeper ──────────────────────────────────────────────
async function searchGoogleATS() {
  const queries = [
    `site:boards.greenhouse.io "enterprise account executive" remote`,
    `site:jobs.lever.co "enterprise account executive" remote`,
    `site:jobs.ashbyhq.com "enterprise account executive" remote`,
    `site:boards.greenhouse.io "strategic account executive" remote`,
    `site:jobs.lever.co "strategic account manager" remote`
  ];

  const results = [];

  for (const query of queries) {
    console.log(`[google] Searching: ${query.slice(0, 60)}...`);
    try {
      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        messages: [{
          role: 'user',
          content: `Search Google for this exact query: ${query}

For each result found, extract:
- Company name
- Job title  
- URL (the full ATS URL)
- Any salary info visible in the snippet
- Date posted if visible

List each job on its own line in this format:
COMPANY | TITLE | URL | SALARY | DATE

Only include results that are actual job postings (not articles or blog posts). Focus on US remote roles.`
        }],
        tools: [{ type: 'web_search_20250305', name: 'web_search' }]
      });

      const jobs = parseGoogleResults(msg, query);
      console.log(`[google] "${query.slice(0,40)}..." → ${jobs.length} jobs`);
      results.push(...jobs);

      // Small delay between searches to avoid rate limiting
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error(`[google] Failed:`, err.message);
    }
  }

  return results;
}

function parseGoogleResults(message, query) {
  const jobs = [];
  const text = message.content.filter(b => b.type === 'text').map(b => b.text).join('\n');

  const lines = text.split('\n');
  for (const line of lines) {
    // Try pipe-delimited format we asked for
    const parts = line.split('|').map(p => p.trim());
    if (parts.length >= 3) {
      const [company, title, url, salary, date] = parts;
      if (!company || !title || !url || !url.startsWith('http')) continue;
      if (!isAERole(title)) continue;

      // Determine source from URL
      const source = url.includes('greenhouse') ? 'Greenhouse'
                   : url.includes('lever.co') ? 'Lever'
                   : url.includes('ashbyhq') ? 'Ashby'
                   : 'ATS';

      jobs.push({
        jobId:      `google-${slugify(company + '-' + title)}`,
        source,
        title:      title.replace(/^[#*\s]+/, ''),
        company:    company.replace(/^[#*\s]+/, ''),
        location:   'Remote',
        salary:     salary || 'Not listed',
        applyUrl:   url,
        postedDate: date ? new Date(date) : new Date()
      });
    }
  }
  return jobs;
}

// ── Shared utilities ──────────────────────────────────────────────────────────
function globalDedupe(jobs) {
  // Dedupe by jobId first, then by company+title combo
  const byId    = new Map();
  const byCombo = new Set();

  return jobs.filter(j => {
    if (byId.has(j.jobId)) return false;
    byId.set(j.jobId, true);

    const combo = `${j.company.toLowerCase()}|${j.title.toLowerCase()}`;
    if (byCombo.has(combo)) return false;
    byCombo.add(combo);
    return true;
  });
}

function withinMaxAge(dateStr) {
  if (!dateStr) return true;
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) return true;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CONFIG.maxAgeDays);
    return d >= cutoff;
  } catch { return true; }
}

function meetsSalary(salaryStr) {
  if (!salaryStr || salaryStr === 'Not listed') return true;
  const nums = salaryStr.replace(/[$,]/g, '').match(/\d+(?:\.\d+)?[kK]?/g);
  if (!nums) return true;
  const amounts = nums.map(n => {
    const v = parseFloat(n);
    return /[kK]$/.test(n) ? v * 1000 : (v < 2000 ? v * 1000 : v);
  });
  const max = Math.max(...amounts);
  const isOTE = /ote|on.?target|total/i.test(salaryStr);
  return isOTE ? max >= CONFIG.minOTE : max >= CONFIG.minBaseSalary;
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 100);
}

// ── Dedup against DB ──────────────────────────────────────────────────────────
async function filterNewJobs(jobs) {
  const { data: seenJobs }    = await supabase.from('jobs').select('job_id');
  const { data: appliedApps } = await supabase.from('applications').select('company');

  const seenIds    = new Set((seenJobs    || []).map(j => j.job_id));
  const appliedCos = new Set((appliedApps || []).map(a => a.company.toLowerCase()));

  return jobs.filter(j => !seenIds.has(j.jobId) && !appliedCos.has(j.company.toLowerCase()));
}

// ── Company health ────────────────────────────────────────────────────────────
async function enrichJobs(jobs) {
  const enriched = [];
  for (const job of jobs) {
    try {
      const { data: cached } = await supabase
        .from('company_health').select('*').eq('company', job.company).single();

      let health = {};
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);

      if (cached && new Date(cached.last_updated) > weekAgo) {
        health = cached;
      } else {
        health = await fetchHealth(job.company);
        await supabase.from('company_health').upsert({
          company: job.company, ...health, last_updated: new Date()
        });
      }

      enriched.push({ ...job, health, gut: gutCheck(job, health) });
    } catch (err) {
      console.error(`[health] ${job.company}:`, err.message);
      enriched.push({ ...job, health: {}, gut: 'MAYBE — No health data available' });
    }
  }
  return enriched;
}

async function fetchHealth(company) {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `Look up "${company}" on RepVue and Glassdoor. Return ONLY valid JSON, no other text:
{"repvueScore":null,"quotaAttainment":null,"glassdoorRating":null,"glassdoorRecommend":null,"redFlags":null}
Fill in what you find. repvueScore 0-100, quotaAttainment %, glassdoorRating out of 5, glassdoorRecommend % who recommend. redFlags is a short string or null.`
    }],
    tools: [{ type: 'web_search_20250305', name: 'web_search' }]
  });

  const textBlock = msg.content.find(b => b.type === 'text');
  const raw = textBlock?.text || '{}';
  const match = raw.match(/\{[\s\S]*?\}/);
  try { return match ? JSON.parse(match[0]) : {}; } catch { return {}; }
}

function gutCheck(job, h) {
  const flags = [];
  if (h.quotaAttainment != null && h.quotaAttainment < 40)
    flags.push(`quota attainment only ${h.quotaAttainment}%`);
  if (h.glassdoorRating != null && h.glassdoorRating < 3.5)
    flags.push(`Glassdoor ${h.glassdoorRating}/5`);
  if (h.redFlags) flags.push(h.redFlags);

  const signals = [];
  if (h.repvueScore != null)      signals.push(`RepVue ${h.repvueScore}/100`);
  if (h.quotaAttainment != null)  signals.push(`${h.quotaAttainment}% quota attainment`);
  if (h.glassdoorRating != null)  signals.push(`Glassdoor ${h.glassdoorRating}/5`);
  const signalStr = signals.length ? signals.join(' · ') : 'No data found';

  if (flags.length >= 2) return `PASS — ${flags.join(', ')}. ${signalStr}`;
  if (flags.length === 1) return `MAYBE — ${flags[0]}. ${signalStr}`;
  return `APPLY — Clean signals. ${signalStr}`;
}

// ── Store ─────────────────────────────────────────────────────────────────────
async function storeJobs(jobs) {
  if (!jobs.length) return;
  const { error } = await supabase.from('jobs').insert(jobs.map(j => ({
    job_id:      j.jobId,
    company:     j.company,
    title:       j.title,
    salary:      j.salary,
    location:    j.location,
    posted_date: j.postedDate,
    apply_url:   j.applyUrl,
    gut_check:   j.gut,
    scraped_at:  new Date()
  })));
  if (error) console.error('[store]', error.message);
}

// ── Email via Resend ──────────────────────────────────────────────────────────
async function sendAlert(job) {
  const h = job.health || {};
  const subject = `[${job.source}] NEW ROLE — ${job.company}: ${job.title}`;

  const text = `
${job.gut}

Company:  ${job.company}
Role:     ${job.title}
Source:   ${job.source}
Salary:   ${job.salary}
Location: ${job.location}
Link:     ${job.applyUrl || 'Not available'}

SIGNALS:
  RepVue score:     ${h.repvueScore       ?? 'N/A'}
  Quota attainment: ${h.quotaAttainment   ?? 'N/A'}%
  Glassdoor:        ${h.glassdoorRating   ?? 'N/A'}/5
  % Recommend:      ${h.glassdoorRecommend ?? 'N/A'}%
  Red flags:        ${h.redFlags          || 'None detected'}

---
Reply BUILD → come to Claude, paste JD, get resume + 2 CLs
Reply PASS  → log and skip
  `.trim();

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Job Alerts <onboarding@resend.dev>', to: [CONFIG.emailTo], subject, text })
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[email] Resend error:', JSON.stringify(data));
    } else {
      console.log(`[email] Sent: ${job.company} (${job.source}) id:${data.id}`);
      await supabase.from('email_alerts').insert({ job_id: job.jobId, email_to: CONFIG.emailTo, sent_at: new Date() });
    }
  } catch (err) {
    console.error('[email]', err.message);
  }
}
