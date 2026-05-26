// api/scraper.js — web search, prompt reframed
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const CONFIG = {
  maxAgeDays: 2,
  emailTo: 'mgolia6@gmail.com',
  aeTitleKeywords: ['account executive','account manager','strategic account','enterprise sales','enterprise account']
};

const SEARCHES = [
  'Enterprise Account Executive remote job openings posted this week on Greenhouse or Lever',
  'Strategic Account Executive remote B2B SaaS job openings posted this week',
  'Senior Account Executive remote enterprise sales job openings posted this week on Greenhouse or Ashby',
  'Strategic Account Manager remote SaaS job openings posted this week',
  'Enterprise Account Executive remote fintech or HR tech job posted this week',
];

async function claude(userPrompt) {
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
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${res.status}: ${err.slice(0, 200)}`);
  }
  return res.json();
}

async function runJobScraper() {
  console.log('[scraper] START', new Date().toISOString());
  const allJobs = [];

  for (const search of SEARCHES) {
    try {
      console.log('[scraper] searching:', search.slice(0, 60));
      const msg = await claude(
        `Find real job postings for: ${search}\n\nRequirements:\n- Posted within the last 2 days\n- US remote or fully remote\n- Real job listings only, not articles or blog posts\n\nReturn ONLY a JSON array with no other text before or after:\n[{"company":"Acme Corp","title":"Enterprise Account Executive","url":"https://boards.greenhouse.io/acme/jobs/123","salary":"$120k-$200k OTE or Not listed","date":"2026-05-25"}]\n\nReturn [] if nothing found.`
      );

      const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      console.log('[scraper] preview:', text.slice(0, 150).replace(/\n/g, ' '));

      const match = text.match(/\[[\s\S]*\]/);
      if (!match) { console.log('[scraper] no JSON found'); continue; }

      let arr;
      try { arr = JSON.parse(match[0]); } catch(e) { console.log('[scraper] parse fail:', e.message); continue; }
      console.log(`[scraper] got ${arr.length} jobs`);

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
      await new Promise(r => setTimeout(r, 1200));
    } catch (err) {
      console.error('[scraper] error:', err.message);
    }
  }

  console.log(`[scraper] total raw: ${allJobs.length}`);
  const deduped = globalDedupe(allJobs);
  const newJobs = await filterNewJobs(deduped);
  console.log(`[scraper] ${newJobs.length} new after filter`);

  if (!newJobs.length) return { jobsFound: 0 };

  await storeJobs(newJobs);
  for (const job of newJobs) await sendAlert(job);
  return { jobsFound: newJobs.length };
}

function isAERole(t) {
  if (!t) return false;
  return CONFIG.aeTitleKeywords.some(k => t.toLowerCase().includes(k));
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
  const text = `New role found\n\nCompany:  ${job.company}\nRole:     ${job.title}\nSource:   ${job.source}\nSalary:   ${job.salary}\nLink:     ${job.applyUrl}\n\n---\nReply BUILD -> paste JD in Claude, get resume + 2 CLs`;

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
