// api/scraper.js — no external SDK, pure fetch
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const CONFIG = {
  titles: [
    'Enterprise Account Executive',
    'Strategic Account Executive',
    'Senior Account Executive',
    'Strategic Account Manager'
  ],
  minBaseSalary: 100000,
  minOTE:        200000,
  maxAgeDays:    2,
  emailTo:       'mgolia6@gmail.com',
  aeTitleKeywords: ['account executive','account manager','strategic account','enterprise sales','enterprise account']
};

// Raw Anthropic API call — no SDK
async function claude(messages, tools, mcpServers) {
  const body = {
    model: 'claude-sonnet-4-5-20251001',
    max_tokens: 4000,
    messages
  };
  if (tools) body.tools = tools;
  if (mcpServers) body.mcp_servers = mcpServers;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'mcp-client-2025-04-04'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${err.slice(0,200)}`);
  }
  return res.json();
}

async function runJobScraper() {
  console.log('[scraper] START', new Date().toISOString());

  const [indeedResult, googleResult] = await Promise.allSettled([
    searchIndeedJobs(),
    searchGoogleATS()
  ]);

  const indeedJobs = indeedResult.status === 'fulfilled' ? indeedResult.value : [];
  const googleJobs = googleResult.status === 'fulfilled' ? googleResult.value : [];

  console.log(`[scraper] Raw — Indeed:${indeedJobs.length} Google:${googleJobs.length}`);

  const all     = globalDedupe([...indeedJobs, ...googleJobs]);
  const newJobs = await filterNewJobs(all);
  console.log(`[scraper] ${newJobs.length} new after dedup`);

  if (!newJobs.length) {
    console.log('[scraper] Nothing new.');
    return { jobsFound: 0 };
  }

  const enriched = await enrichJobs(newJobs);
  await storeJobs(enriched);
  for (const job of enriched) await sendAlert(job);

  console.log(`[scraper] Done. ${enriched.length} alerts sent.`);
  return { jobsFound: enriched.length };
}

async function searchIndeedJobs() {
  const results = [];
  for (const title of CONFIG.titles) {
    console.log(`[indeed] "${title}"`);
    try {
      const msg = await claude(
        [{ role: 'user', content: `Search Indeed for "${title}" remote jobs in United States posted in the last 2 days. Return each job on one line:\nCOMPANY | TITLE | URL | SALARY | DATE\n\nOnly real postings. Skip anything not matching.` }],
        null,
        [{ type: 'url', url: 'https://mcp.indeed.com/claude/mcp', name: 'indeed-mcp' }]
      );
      results.push(...parseLineResults(msg, 'Indeed'));
    } catch (err) { console.error(`[indeed] "${title}":`, err.message); }
  }
  return results;
}

async function searchGoogleATS() {
  const queries = [
    `site:boards.greenhouse.io "enterprise account executive" remote`,
    `site:jobs.lever.co "enterprise account executive" remote`,
    `site:jobs.ashbyhq.com "enterprise account executive" remote`,
    `site:boards.greenhouse.io "strategic account executive" remote`,
    `site:jobs.lever.co "senior account executive" remote`,
    `site:jobs.ashbyhq.com "strategic account manager" remote`
  ];
  const results = [];
  for (const query of queries) {
    try {
      const msg = await claude(
        [{ role: 'user', content: `Search: ${query}\n\nOnly jobs posted in the last 2 days. US remote only. One line per job:\nCOMPANY | TITLE | URL | SALARY | DATE\n\nOnly real job postings. Skip articles.` }],
        [{ type: 'web_search_20250305', name: 'web_search' }]
      );
      results.push(...parseLineResults(msg));
      await new Promise(r => setTimeout(r, 800));
    } catch (err) { console.error(`[google]:`, err.message); }
  }
  return results;
}

function parseLineResults(message, defaultSource) {
  const jobs = [];
  const blocks = message.content || [];
  const text = blocks
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n');

  for (const line of text.split('\n')) {
    const parts = line.split('|').map(p => p.trim());
    if (parts.length < 3) continue;
    const [company, title, url, salary, date] = parts;
    if (!company || !title || !url || !url.startsWith('http')) continue;
    if (!isAERole(title)) continue;
    const source = defaultSource || (
      url.includes('greenhouse') ? 'Greenhouse' :
      url.includes('lever.co')   ? 'Lever'      :
      url.includes('ashby')      ? 'Ashby'      : 'ATS'
    );
    if (date && !withinMaxAge(date)) continue;
    jobs.push({
      jobId:      `${source.toLowerCase()}-${slugify(company + '-' + title)}`,
      source,
      title:      title.replace(/^[#*\s]+/, ''),
      company:    company.replace(/^[#*\s]+/, ''),
      location:   'Remote',
      salary:     salary || 'Not listed',
      applyUrl:   url,
      postedDate: date ? new Date(date) : new Date()
    });
  }
  return jobs;
}

function isAERole(title) {
  if (!title) return false;
  const t = title.toLowerCase();
  return CONFIG.aeTitleKeywords.some(k => t.includes(k));
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

function meetsSalary(s) {
  if (!s || s === 'Not listed') return true;
  const nums = s.replace(/[$,]/g, '').match(/\d+(?:\.\d+)?[kK]?/g);
  if (!nums) return true;
  const amounts = nums.map(n => {
    const v = parseFloat(n);
    return /[kK]$/.test(n) ? v * 1000 : (v < 2000 ? v * 1000 : v);
  });
  const max = Math.max(...amounts);
  return /ote|on.?target|total/i.test(s) ? max >= CONFIG.minOTE : max >= CONFIG.minBaseSalary;
}

function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 100); }

function globalDedupe(jobs) {
  const byId = new Map(), byCombo = new Set();
  return jobs.filter(j => {
    if (byId.has(j.jobId)) return false;
    byId.set(j.jobId, true);
    const combo = `${j.company.toLowerCase()}|${j.title.toLowerCase()}`;
    if (byCombo.has(combo)) return false;
    byCombo.add(combo);
    return true;
  });
}

async function filterNewJobs(jobs) {
  const { data: seen }    = await supabase.from('jobs').select('job_id');
  const { data: applied } = await supabase.from('applications').select('company');
  const seenIds    = new Set((seen    || []).map(j => j.job_id));
  const appliedCos = new Set((applied || []).map(a => a.company.toLowerCase()));
  return jobs.filter(j =>
    !seenIds.has(j.jobId) &&
    !appliedCos.has(j.company.toLowerCase())
  );
}

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
      enriched.push({ ...job, health, gut: gutCheck(health) });
    } catch (err) {
      console.error(`[health] ${job.company}:`, err.message);
      enriched.push({ ...job, health: {}, gut: 'MAYBE — No health data' });
    }
  }
  return enriched;
}

async function fetchHealth(company) {
  const msg = await claude([{
    role: 'user',
    content: `Look up "${company}" on RepVue and Glassdoor. Return ONLY valid JSON with no other text:\n{"repvueScore":null,"quotaAttainment":null,"glassdoorRating":null,"glassdoorRecommend":null,"redFlags":null}`
  }], [{ type: 'web_search_20250305', name: 'web_search' }]);

  const text = (msg.content.find(b => b.type === 'text')?.text) || '{}';
  const match = text.match(/\{[\s\S]*?\}/);
  try { return match ? JSON.parse(match[0]) : {}; } catch { return {}; }
}

function gutCheck(h) {
  const flags = [];
  if (h.quotaAttainment != null && h.quotaAttainment < 40) flags.push(`quota ${h.quotaAttainment}%`);
  if (h.glassdoorRating != null && h.glassdoorRating < 3.5) flags.push(`Glassdoor ${h.glassdoorRating}/5`);
  if (h.redFlags) flags.push(h.redFlags);
  const sig = [
    h.repvueScore      != null ? `RepVue ${h.repvueScore}`          : null,
    h.quotaAttainment  != null ? `${h.quotaAttainment}% attainment` : null,
    h.glassdoorRating  != null ? `GD ${h.glassdoorRating}/5`        : null
  ].filter(Boolean).join(' · ') || 'No data';
  if (flags.length >= 2) return `PASS — ${flags.join(', ')}. ${sig}`;
  if (flags.length === 1) return `MAYBE — ${flags[0]}. ${sig}`;
  return `APPLY — Clean. ${sig}`;
}

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

async function sendAlert(job) {
  const h = job.health || {};
  const subject = `[${job.source}] NEW ROLE — ${job.company}: ${job.title}`;
  const text = [
    job.gut,
    '',
    `Company:  ${job.company}`,
    `Role:     ${job.title}`,
    `Source:   ${job.source}`,
    `Salary:   ${job.salary}`,
    `Location: ${job.location}`,
    `Link:     ${job.applyUrl || 'N/A'}`,
    '',
    'SIGNALS:',
    `  RepVue:           ${h.repvueScore ?? 'N/A'}`,
    `  Quota attainment: ${h.quotaAttainment ?? 'N/A'}%`,
    `  Glassdoor:        ${h.glassdoorRating ?? 'N/A'}/5`,
    `  % Recommend:      ${h.glassdoorRecommend ?? 'N/A'}%`,
    `  Red flags:        ${h.redFlags || 'None'}`,
    '',
    '---',
    'Reply BUILD -> paste JD in Claude, get resume + 2 CLs',
    'Reply PASS  -> log and skip'
  ].join('\n');

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Job Alerts <onboarding@resend.dev>',
        to:   [CONFIG.emailTo],
        subject,
        text
      })
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[email] Error:', JSON.stringify(data));
    } else {
      console.log(`[email] Sent: ${job.company} id:${data.id}`);
      await supabase.from('email_alerts').insert({
        job_id:   job.jobId,
        email_to: CONFIG.emailTo,
        sent_at:  new Date()
      });
    }
  } catch (err) { console.error('[email]', err.message); }
}

module.exports = { runJobScraper };
