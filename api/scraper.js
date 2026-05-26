// api/scraper.js — web search only, no MCP, no SDK
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const CONFIG = {
  maxAgeDays: 2,
  emailTo: 'mgolia6@gmail.com',
  aeTitleKeywords: ['account executive','account manager','strategic account','enterprise sales','enterprise account']
};

async function claude(userPrompt) {
  const body = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [{ role: 'user', content: userPrompt }]
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${res.status}: ${err.slice(0, 200)}`);
  }
  return res.json();
}

async function runJobScraper() {
  console.log('[scraper] START', new Date().toISOString());

  const queries = [
    'site:boards.greenhouse.io "enterprise account executive" remote',
    'site:jobs.lever.co "enterprise account executive" remote',
    'site:jobs.ashbyhq.com "enterprise account executive" remote',
    'site:boards.greenhouse.io "strategic account executive" remote',
    'site:jobs.lever.co "senior account executive" remote',
  ];

  const allJobs = [];

  for (const query of queries) {
    try {
      console.log('[scraper] searching:', query.slice(0, 60));
      const msg = await claude(
        `Search for: ${query}\n\nFind job postings from the last 2 days only. US remote roles. Return ONLY a JSON array:\n[{"company":"Acme","title":"Enterprise Account Executive","url":"https://...","salary":"$120k-$150k or Not listed","date":"2026-05-25"}]\n\nReturn empty array [] if nothing found. No other text.`
      );

      const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      console.log('[scraper] response snippet:', text.slice(0, 200));

      const match = text.match(/\[[\s\S]*?\]/);
      if (!match) { console.log('[scraper] no JSON array found'); continue; }

      let arr;
      try { arr = JSON.parse(match[0]); } catch(e) { console.log('[scraper] JSON parse fail:', e.message); continue; }

      console.log(`[scraper] parsed ${arr.length} jobs from query`);

      for (const j of arr) {
        if (!j.company || !j.title || !j.url) continue;
        if (!isAERole(j.title)) continue;
        const source = j.url.includes('greenhouse') ? 'Greenhouse' : j.url.includes('lever') ? 'Lever' : j.url.includes('ashby') ? 'Ashby' : 'ATS';
        allJobs.push({
          jobId: `${source.toLowerCase()}-${slugify(j.company + '-' + j.title)}`,
          source, title: j.title, company: j.company,
          location: 'Remote', salary: j.salary || 'Not listed',
          applyUrl: j.url, postedDate: j.date ? new Date(j.date) : new Date()
        });
      }
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error('[scraper] query failed:', err.message);
    }
  }

  console.log(`[scraper] Raw total: ${allJobs.length}`);
  const deduped = globalDedupe(allJobs);
  const newJobs = await filterNewJobs(deduped);
  console.log(`[scraper] ${newJobs.length} new after dedup/filter`);

  if (!newJobs.length) return { jobsFound: 0 };

  await storeJobs(newJobs);
  for (const job of newJobs) await sendAlert(job);
  console.log(`[scraper] Done. ${newJobs.length} alerts sent.`);
  return { jobsFound: newJobs.length };
}

function isAERole(title) {
  if (!title) return false;
  return CONFIG.aeTitleKeywords.some(k => title.toLowerCase().includes(k));
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

function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80); }

function globalDedupe(jobs) {
  const seen = new Set();
  return jobs.filter(j => {
    const k = j.company.toLowerCase() + '|' + j.title.toLowerCase();
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
  const { error } = await supabase.from('jobs').insert(jobs.map(j => ({
    job_id: j.jobId, company: j.company, title: j.title,
    salary: j.salary, location: j.location,
    posted_date: j.postedDate, apply_url: j.applyUrl,
    gut_check: 'MAYBE — No health data', scraped_at: new Date()
  })));
  if (error) console.error('[store]', error.message);
}

async function sendAlert(job) {
  const subject = `[${job.source}] ${job.company}: ${job.title}`;
  const text = `MAYBE — No health data yet\n\nCompany:  ${job.company}\nRole:     ${job.title}\nSource:   ${job.source}\nSalary:   ${job.salary}\nLink:     ${job.applyUrl}\n\n---\nReply BUILD -> paste JD in Claude, get resume + 2 CLs`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Job Alerts <onboarding@resend.dev>', to: [CONFIG.emailTo], subject, text })
  });
  const data = await res.json();
  if (!res.ok) console.error('[email]', JSON.stringify(data));
  else console.log('[email] sent:', job.company, data.id);
}

module.exports = { runJobScraper };
