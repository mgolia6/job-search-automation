// api/scraper.js — Claude web search, robust parsing
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const CONFIG = {
  maxAgeDays: 2,
  emailTo: 'mgolia6@gmail.com',
  titleKeywords: ['account executive','strategic account','enterprise account','enterprise sales']
};

const SEARCHES = [
  'Enterprise Account Executive remote job posted this week',
  'Strategic Account Executive SaaS remote job posted this week',
  'Senior Account Executive B2B remote job posted this week',
  'Strategic Account Manager enterprise remote job posted this week',
];

async function claude(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0,150)}`);
  return res.json();
}

function extractJobs(msg, defaultSource) {
  const jobs = [];
  const blocks = msg.content || [];
  const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n');

  // Strip markdown fences
  const clean = text.replace(/```[\w]*\n?/g, '').trim();

  // Try JSON array
  const arrMatch = clean.match(/\[\s*\{[\s\S]*?\}\s*\]/);
  if (arrMatch) {
    try {
      const arr = JSON.parse(arrMatch[0]);
      if (Array.isArray(arr)) {
        for (const j of arr) {
          const job = normalizeJob(j, defaultSource);
          if (job) jobs.push(job);
        }
        if (jobs.length) return jobs;
      }
    } catch(e) {}
  }

  // Try JSON object with array inside
  const objMatch = clean.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      const obj = JSON.parse(objMatch[0]);
      const arr = obj.results || obj.jobs || obj.listings || obj.data || [];
      for (const j of arr) {
        const job = normalizeJob(j, defaultSource);
        if (job) jobs.push(job);
      }
      if (jobs.length) return jobs;
    } catch(e) {}
  }

  // Fallback: parse plain text lines looking for company/title/url patterns
  const lines = clean.split('\n').filter(l => l.trim());
  let current = {};
  for (const line of lines) {
    const l = line.trim();
    // URL line
    if (l.match(/https?:\/\/\S+/)) {
      const url = l.match(/https?:\/\/\S+/)[0].replace(/[,.)]+$/, '');
      if (current.title && current.company) {
        current.url = url;
        const job = normalizeJob(current, defaultSource);
        if (job) jobs.push(job);
        current = {};
      }
      continue;
    }
    // Bold or numbered line — likely company/title
    const titleMatch = l.match(/^\*?\*?(\d+\.\s*)?([^:*]+?)\s*[-–]\s*(.+?)\*?\*?$/);
    if (titleMatch) {
      current = { company: titleMatch[2].trim(), title: titleMatch[3].trim() };
      continue;
    }
    // Key: value pairs
    const kvMatch = l.match(/^\*?\*?(company|title|role|url|link|salary|date)\*?\*?\s*:?\s*(.+)/i);
    if (kvMatch) {
      const key = kvMatch[1].toLowerCase();
      const val = kvMatch[2].trim().replace(/\*+/g, '');
      if (key === 'company') current.company = val;
      else if (key === 'title' || key === 'role') current.title = val;
      else if (key === 'url' || key === 'link') current.url = val;
      else if (key === 'salary') current.salary = val;
      else if (key === 'date') current.date = val;
    }
  }
  // Flush last
  if (current.title && current.company && current.url) {
    const job = normalizeJob(current, defaultSource);
    if (job) jobs.push(job);
  }

  return jobs;
}

function normalizeJob(j, defaultSource) {
  const company = j.company || j.employer || j.employer_name;
  const title = j.title || j.job_title || j.position;
  const url = j.url || j.link || j.apply_url || j.job_apply_link;
  if (!company || !title) return null;
  if (!isAERole(title)) return null;
  const src = defaultSource || (url?.includes('greenhouse') ? 'Greenhouse' : url?.includes('lever') ? 'Lever' : url?.includes('ashby') ? 'Ashby' : 'Web');
  return {
    jobId: `web-${slugify(company + '-' + title)}`,
    source: src,
    title: title.replace(/^[#*\s\d.]+/, '').trim(),
    company: company.replace(/^[#*\s]+/, '').trim(),
    location: j.location || j.job_city || 'Remote',
    salary: j.salary || j.compensation || 'Not listed',
    applyUrl: url || '',
    postedDate: j.date || j.posted_date ? new Date(j.date || j.posted_date) : new Date()
  };
}

function isAERole(t) {
  if (!t) return false;
  return CONFIG.titleKeywords.some(k => t.toLowerCase().includes(k));
}

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
    gut_check: 'MAYBE — No health data', scraped_at: new Date()
  })));
  if (error) console.error('[store]', error.message);
}

async function sendAlert(job) {
  const subject = `[${job.source}] ${job.company}: ${job.title}`;
  const text = `MAYBE — Review and apply\n\nCompany:  ${job.company}\nRole:     ${job.title}\nSource:   ${job.source}\nSalary:   ${job.salary}\nLocation: ${job.location}\nLink:     ${job.applyUrl}\n\n---\nPaste JD in Claude → resume + 2 CLs`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Job Alerts <onboarding@resend.dev>', to: [CONFIG.emailTo], subject, text })
  });
  const data = await res.json();
  if (!res.ok) console.error('[email]', JSON.stringify(data));
  else console.log('[email] sent:', job.company);
}

async function runJobScraper() {
  console.log('[scraper] START', new Date().toISOString());
  const allJobs = [];

  for (const search of SEARCHES) {
    try {
      console.log('[scraper]', search);
      const msg = await claude(
        `Find real job postings for: ${search}\n\nOnly include:\n- Posted in the last 2 days\n- US remote roles\n- Real job listings with apply links\n\nFor each job found, list it in this format:\nCompany: [name]\nTitle: [exact job title]\nURL: [direct apply link]\nSalary: [if listed, otherwise "Not listed"]\nDate: [posted date]\n\nList as many real jobs as you find. If none found, say "No results".`
      );

      const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      console.log('[scraper] preview:', text.slice(0, 200).replace(/\n/g, ' '));

      const jobs = extractJobs(msg);
      console.log(`[scraper] extracted: ${jobs.length}`);
      allJobs.push(...jobs);
      await new Promise(r => setTimeout(r, 1500));
    } catch(e) {
      console.error('[scraper] error:', e.message);
    }
  }

  console.log(`[scraper] total raw: ${allJobs.length}`);
  const deduped = globalDedupe(allJobs);
  const newJobs = await filterNewJobs(deduped);
  console.log(`[scraper] ${newJobs.length} new`);

  if (!newJobs.length) return { jobsFound: 0 };

  await storeJobs(newJobs);
  for (const job of newJobs) await sendAlert(job);
  return { jobsFound: newJobs.length };
}

module.exports = { runJobScraper };
