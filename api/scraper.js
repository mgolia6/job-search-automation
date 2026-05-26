const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

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
  maxAgeDays:    2,
  emailTo:       'mgolia6@gmail.com',
  aeTitleKeywords: ['account executive','account manager','strategic account','enterprise sales','enterprise account']
};

async function runJobScraper() {
  console.log('[scraper] START', new Date().toISOString());

  const [indeedResult, greenhouseResult, googleResult] = await Promise.allSettled([
    searchIndeedJobs(),
    searchGreenhouseJobs(),
    searchGoogleATS()
  ]);

  const indeedJobs     = indeedResult.status     === 'fulfilled' ? indeedResult.value     : [];
  const greenhouseJobs = greenhouseResult.status  === 'fulfilled' ? greenhouseResult.value : [];
  const googleJobs     = googleResult.status      === 'fulfilled' ? googleResult.value     : [];

  console.log(`[scraper] Raw — Indeed:${indeedJobs.length} GH:${greenhouseJobs.length} Google:${googleJobs.length}`);

  const all      = globalDedupe([...indeedJobs, ...greenhouseJobs, ...googleJobs]);
  const newJobs  = await filterNewJobs(all);
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

// ── SOURCE 1: Indeed ──────────────────────────────────────────────────────────
async function searchIndeedJobs() {
  const results = [];
  for (const title of CONFIG.titles) {
    console.log(`[indeed] "${title}"`);
    try {
      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: `Search Indeed for "${title}" jobs. Remote, United States, full-time. Return ALL results with: job ID, company, title, location, salary, posted date, URL.` }],
        mcp_servers: [{ type: 'url', url: 'https://mcp.indeed.com/claude/mcp', name: 'indeed-mcp' }]
      });
      results.push(...parseIndeedResponse(msg));
    } catch (err) { console.error(`[indeed] "${title}":`, err.message); }
  }
  return results;
}

function parseIndeedResponse(message) {
  const jobs = [];
  const text = message.content.map(b => b.type === 'text' ? b.text : (b.content?.[0]?.text || '')).join('\n');
  const blocks = text.split(/(?=\*?\*?Job(?:\s+Title)?:?\*?\*?\s)/i).filter(Boolean);

  for (const block of blocks) {
    const get = (patterns) => { for (const p of patterns) { const m = block.match(p); if (m) return m[1].trim(); } return null; };
    const title   = get([/\*\*Job Title:\*\*\s*(.+)/i, /Job Title:\s*(.+)/i]);
    const company = get([/\*\*Company:\*\*\s*(.+)/i, /Company:\s*(.+)/i]);
    if (!title || !company) continue;
    const salary   = get([/\*\*Compensation:\*\*\s*(.+)/i, /\*\*Salary:\*\*\s*(.+)/i, /Compensation:\s*(.+)/i]);
    const posted   = get([/\*\*Posted(?:\s+on)?:\*\*\s*(.+)/i, /Posted(?:\s+on)?:\s*(.+)/i]);
    const url      = get([/\*\*(?:View Job )?URL:\*\*\s*(https?:\/\/\S+)/i, /(https?:\/\/[^\s]+indeed\.com[^\s]*)/i]);
    const location = get([/\*\*Location:\*\*\s*(.+)/i, /Location:\s*(.+)/i]);
    const jobId    = get([/\*\*Job Id:\*\*\s*(.+)/i, /Job ID:\s*(.+)/i]);
    if (!withinMaxAge(posted)) continue;
    if (salary && !meetsSalary(salary)) continue;
    jobs.push({ jobId: `indeed-${jobId || slugify(company+'-'+title)}`, source: 'Indeed', title, company, location: location||'Remote', salary: salary||'Not listed', applyUrl: url||'', postedDate: posted ? new Date(posted) : new Date() });
  }
  return jobs;
}

// ── SOURCE 2: Greenhouse broad search ─────────────────────────────────────────
// Searches the Greenhouse job board index rather than a fixed company list
async function searchGreenhouseJobs() {
  const results = [];
  const searchTerms = [
    'enterprise account executive',
    'strategic account executive',
    'senior account executive',
    'strategic account manager'
  ];

  for (const term of searchTerms) {
    try {
      console.log(`[gh] searching: "${term}"`);
      // Greenhouse has a public search endpoint
      const url = `https://boards.greenhouse.io/api/v1/jobs?q=${encodeURIComponent(term)}&remote=true`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobBot/1.0)' }
      });
      if (!res.ok) {
        console.log(`[gh] search "${term}": ${res.status} — falling back to web search`);
        // Fallback: use Claude web search to find Greenhouse postings
        const ghResults = await searchGreenhouseFallback(term);
        results.push(...ghResults);
        continue;
      }
      const data = await res.json();
      const jobs = (data.jobs || []).filter(j => isAERole(j.title));
      console.log(`[gh] "${term}": ${jobs.length} AE roles`);
      for (const j of jobs) {
        const location = j.location?.name || 'Remote';
        if (!isRemoteFriendly(location)) continue;
        const company = j.company?.name || j.board?.name || 'Unknown';
        const postedDate = j.updated_at ? new Date(j.updated_at) : new Date();
        if (!withinMaxAge(postedDate.toISOString())) continue;
        results.push({
          jobId: `gh-${j.id}`,
          source: 'Greenhouse',
          title: j.title,
          company,
          location,
          salary: extractSalary(j.content || ''),
          applyUrl: j.absolute_url || `https://boards.greenhouse.io/jobs/${j.id}`,
          postedDate
        });
      }
      await new Promise(r => setTimeout(r, 800));
    } catch (err) {
      console.error(`[gh] "${term}":`, err.message);
      // Try fallback
      try {
        const ghResults = await searchGreenhouseFallback(term);
        results.push(...ghResults);
      } catch (e2) { console.error(`[gh fallback] "${term}":`, e2.message); }
    }
  }
  return results;
}

async function searchGreenhouseFallback(term) {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    messages: [{ role: 'user', content: `Search for "${term}" jobs posted on boards.greenhouse.io in the last 2 days. US remote only. For each job found output exactly one line:\nCOMPANY | TITLE | URL | SALARY | POSTED_DATE\n\nOnly real job postings. Skip anything not on greenhouse.io.` }],
    tools: [{ type: 'web_search_20250305', name: 'web_search' }]
  });
  return parseGoogleResults(msg, 'Greenhouse');
}

// ── SOURCE 3: Broad ATS web search ────────────────────────────────────────────
async function searchGoogleATS() {
  const queries = [
    `site:boards.greenhouse.io "enterprise account executive" remote`,
    `site:jobs.lever.co "enterprise account executive" remote`,
    `site:jobs.ashbyhq.com "enterprise account executive" remote`,
    `site:boards.greenhouse.io "strategic account executive" remote`,
    `site:jobs.lever.co "strategic account manager" remote`,
    `site:jobs.lever.co "senior account executive" remote`,
    `site:jobs.ashbyhq.com "strategic account manager" remote`
  ];
  const results = [];
  for (const query of queries) {
    console.log(`[google] ${query.slice(0,60)}...`);
    try {
      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        messages: [{ role: 'user', content: `Search Google for: ${query}\n\nOnly include jobs posted in the last 2 days. For each job posting found, output one line per job:\nCOMPANY | TITLE | URL | SALARY | DATE\n\nOnly real job postings, US remote roles. Skip articles or blog posts.` }],
        tools: [{ type: 'web_search_20250305', name: 'web_search' }]
      });
      results.push(...parseGoogleResults(msg));
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) { console.error(`[google]:`, err.message); }
  }
  return results;
}

function parseGoogleResults(message, defaultSource) {
  const jobs = [];
  const text = message.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  for (const line of text.split('\n')) {
    const parts = line.split('|').map(p => p.trim());
    if (parts.length < 3) continue;
    const [company, title, url, salary, date] = parts;
    if (!company || !title || !url || !url.startsWith('http')) continue;
    if (!isAERole(title)) continue;
    const source = defaultSource || (url.includes('greenhouse') ? 'Greenhouse' : url.includes('lever.co') ? 'Lever' : url.includes('ashby') ? 'Ashby' : 'ATS');
    if (date && !withinMaxAge(date)) continue;
    jobs.push({ jobId: `google-${slugify(company+'-'+title)}`, source, title: title.replace(/^[#*\s]+/,''), company: company.replace(/^[#*\s]+/,''), location: 'Remote', salary: salary||'Not listed', applyUrl: url, postedDate: date ? new Date(date) : new Date() });
  }
  return jobs;
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function isAERole(title) {
  if (!title) return false;
  const t = title.toLowerCase();
  return CONFIG.aeTitleKeywords.some(k => t.includes(k));
}

function isRemoteFriendly(loc) {
  const l = (loc||'').toLowerCase();
  return l.includes('remote') || l.includes('united states') || l === '';
}

function extractSalary(content) {
  const m = content.match(/\$[\d,]+(?:\s*[-]\s*\$[\d,]+)?/);
  return m ? m[0] : 'Not listed';
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
  const nums = s.replace(/[$,]/g,'').match(/\d+(?:\.\d+)?[kK]?/g);
  if (!nums) return true;
  const amounts = nums.map(n => { const v = parseFloat(n); return /[kK]$/.test(n) ? v*1000 : (v < 2000 ? v*1000 : v); });
  const max = Math.max(...amounts);
  return /ote|on.?target|total/i.test(s) ? max >= CONFIG.minOTE : max >= CONFIG.minBaseSalary;
}

function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,100); }

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
  const seenIds    = new Set((seen||[]).map(j => j.job_id));
  const appliedCos = new Set((applied||[]).map(a => a.company.toLowerCase()));
  return jobs.filter(j => !seenIds.has(j.jobId) && !appliedCos.has(j.company.toLowerCase()));
}

async function enrichJobs(jobs) {
  const enriched = [];
  for (const job of jobs) {
    try {
      const { data: cached } = await supabase.from('company_health').select('*').eq('company', job.company).single();
      let health = {};
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate()-7);
      if (cached && new Date(cached.last_updated) > weekAgo) {
        health = cached;
      } else {
        health = await fetchHealth(job.company);
        await supabase.from('company_health').upsert({ company: job.company, ...health, last_updated: new Date() });
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
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{ role: 'user', content: `Look up "${company}" on RepVue and Glassdoor. Return ONLY valid JSON:\n{"repvueScore":null,"quotaAttainment":null,"glassdoorRating":null,"glassdoorRecommend":null,"redFlags":null}` }],
    tools: [{ type: 'web_search_20250305', name: 'web_search' }]
  });
  const text = (msg.content.find(b => b.type === 'text')?.text)||'{}';
  const match = text.match(/\{[\s\S]*?\}/);
  try { return match ? JSON.parse(match[0]) : {}; } catch { return {}; }
}

function gutCheck(h) {
  const flags = [];
  if (h.quotaAttainment != null && h.quotaAttainment < 40) flags.push(`quota ${h.quotaAttainment}%`);
  if (h.glassdoorRating != null && h.glassdoorRating < 3.5) flags.push(`Glassdoor ${h.glassdoorRating}/5`);
  if (h.redFlags) flags.push(h.redFlags);
  const sig = [h.repvueScore != null ? `RepVue ${h.repvueScore}` : null, h.quotaAttainment != null ? `${h.quotaAttainment}% attainment` : null, h.glassdoorRating != null ? `GD ${h.glassdoorRating}/5` : null].filter(Boolean).join(' · ') || 'No data';
  if (flags.length >= 2) return `PASS — ${flags.join(', ')}. ${sig}`;
  if (flags.length === 1) return `MAYBE — ${flags[0]}. ${sig}`;
  return `APPLY — Clean. ${sig}`;
}

async function storeJobs(jobs) {
  if (!jobs.length) return;
  const { error } = await supabase.from('jobs').insert(jobs.map(j => ({
    job_id: j.jobId, company: j.company, title: j.title, salary: j.salary,
    location: j.location, posted_date: j.postedDate, apply_url: j.applyUrl,
    gut_check: j.gut, scraped_at: new Date()
  })));
  if (error) console.error('[store]', error.message);
}

async function sendAlert(job) {
  const h = job.health || {};
  const subject = `[${job.source}] NEW ROLE — ${job.company}: ${job.title}`;
  const text = `${job.gut}\n\nCompany:  ${job.company}\nRole:     ${job.title}\nSource:   ${job.source}\nSalary:   ${job.salary}\nLocation: ${job.location}\nLink:     ${job.applyUrl||'N/A'}\n\nSIGNALS:\n  RepVue:           ${h.repvueScore??'N/A'}\n  Quota attainment: ${h.quotaAttainment??'N/A'}%\n  Glassdoor:        ${h.glassdoorRating??'N/A'}/5\n  % Recommend:      ${h.glassdoorRecommend??'N/A'}%\n  Red flags:        ${h.redFlags||'None'}\n\n---\nReply BUILD -> paste JD in Claude, get resume + 2 CLs\nReply PASS  -> log and skip`.trim();

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Job Alerts <onboarding@resend.dev>', to: [CONFIG.emailTo], subject, text })
    });
    const data = await res.json();
    if (!res.ok) { console.error('[email] Error:', JSON.stringify(data)); }
    else {
      console.log(`[email] Sent: ${job.company} id:${data.id}`);
      await supabase.from('email_alerts').insert({ job_id: job.jobId, email_to: CONFIG.emailTo, sent_at: new Date() });
    }
  } catch (err) { console.error('[email]', err.message); }
}

module.exports = { runJobScraper };
