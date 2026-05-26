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
  emailTo:       'mgolia6@gmail.com'
};

// ── Entry point ───────────────────────────────────────────────────────────────
export async function runJobScraper() {
  console.log('[scraper] START', new Date().toISOString());

  const allJobs     = await searchIndeedJobs();
  console.log(`[scraper] ${allJobs.length} raw jobs found`);

  const newJobs     = await filterNewJobs(allJobs);
  console.log(`[scraper] ${newJobs.length} new after dedup`);

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

// ── Indeed search via MCP ─────────────────────────────────────────────────────
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
          content: `Search Indeed for "${title}" jobs. Requirements: remote OR hybrid, United States, full-time. Return ALL results you find with complete details including job ID, company, title, location, salary/compensation, posted date, and job URL. List each job clearly.`
        }],
        mcp_servers: [{
          type: 'url',
          url:  'https://mcp.indeed.com/claude/mcp',
          name: 'indeed-mcp'
        }]
      });

      const jobs = parseResponse(msg, title);
      console.log(`[indeed] "${title}" → ${jobs.length} results`);
      results.push(...jobs);
    } catch (err) {
      console.error(`[indeed] Failed for "${title}":`, err.message);
    }
  }

  return dedupe(results);
}

// ── Parse Indeed MCP response ─────────────────────────────────────────────────
function parseResponse(message, searchTitle) {
  const jobs = [];

  // Gather all text from response blocks
  const text = message.content
    .map(b => {
      if (b.type === 'text') return b.text;
      if (b.type === 'mcp_tool_result') return b.content?.[0]?.text || '';
      return '';
    })
    .join('\n');

  // Try to parse structured job blocks
  // Indeed MCP returns blocks starting with Job Title or **Job Title:**
  const blocks = text.split(/(?=\*?\*?Job(?:\s+Title)?:?\*?\*?\s)/i).filter(Boolean);

  for (const block of blocks) {
    const get = (patterns) => {
      for (const pat of patterns) {
        const m = block.match(pat);
        if (m) return m[1].trim();
      }
      return null;
    };

    const title = get([
      /\*\*Job Title:\*\*\s*(.+)/i,
      /Job Title:\s*(.+)/i,
      /^#+\s*(.+)/m
    ]);

    const company = get([
      /\*\*Company:\*\*\s*(.+)/i,
      /Company:\s*(.+)/i,
      /Employer:\s*(.+)/i
    ]);

    if (!title || !company) continue;

    const jobId = get([
      /\*\*Job Id:\*\*\s*(.+)/i,
      /Job ID:\s*(.+)/i,
      /ID:\s*(.+)/i
    ]);

    const salary = get([
      /\*\*Compensation:\*\*\s*(.+)/i,
      /\*\*Salary:\*\*\s*(.+)/i,
      /Compensation:\s*(.+)/i,
      /Salary:\s*(.+)/i,
      /Pay:\s*(.+)/i
    ]);

    const location = get([
      /\*\*Location:\*\*\s*(.+)/i,
      /Location:\s*(.+)/i
    ]);

    const posted = get([
      /\*\*Posted(?:\s+on)?:\*\*\s*(.+)/i,
      /Posted(?:\s+on)?:\s*(.+)/i,
      /Date Posted:\s*(.+)/i
    ]);

    const url = get([
      /\*\*(?:View Job |Apply |Job )?URL:\*\*\s*(https?:\/\/\S+)/i,
      /(?:View Job|Apply|URL):\s*(https?:\/\/\S+)/i,
      /(https?:\/\/[^\s]+indeed\.com[^\s]*)/i
    ]);

    // Recency filter
    if (!withinMaxAge(posted)) {
      console.log(`[filter] Too old (${posted}): ${company} — ${title}`);
      continue;
    }

    // Salary filter
    if (salary && !meetsSalary(salary)) {
      console.log(`[filter] Salary too low (${salary}): ${company} — ${title}`);
      continue;
    }

    jobs.push({
      jobId:      jobId || slugify(company + '-' + title),
      title,
      company,
      location:   location || 'Remote',
      salary:     salary || 'Not listed',
      applyUrl:   url || '',
      postedDate: posted ? new Date(posted) : new Date()
    });
  }

  return jobs;
}

function withinMaxAge(dateStr) {
  if (!dateStr) return true; // don't filter if no date
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) return true; // can't parse, let it through
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CONFIG.maxAgeDays);
    return d >= cutoff;
  } catch {
    return true;
  }
}

function meetsSalary(salaryStr) {
  if (!salaryStr || salaryStr === 'Not listed') return true; // let through if no data
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

function dedupe(jobs) {
  const seen = new Set();
  return jobs.filter(j => {
    if (seen.has(j.jobId)) return false;
    seen.add(j.jobId);
    return true;
  });
}

// ── Dedup against DB ──────────────────────────────────────────────────────────
async function filterNewJobs(jobs) {
  const { data: seenJobs }    = await supabase.from('jobs').select('job_id');
  const { data: appliedApps } = await supabase.from('applications').select('company');

  const seenIds      = new Set((seenJobs    || []).map(j => j.job_id));
  const appliedCos   = new Set((appliedApps || []).map(a => a.company.toLowerCase()));

  return jobs.filter(j => {
    if (seenIds.has(j.jobId)) return false;
    if (appliedCos.has(j.company.toLowerCase())) return false;
    return true;
  });
}

// ── Company health ────────────────────────────────────────────────────────────
async function enrichJobs(jobs) {
  const enriched = [];
  for (const job of jobs) {
    try {
      const { data: cached } = await supabase
        .from('company_health')
        .select('*')
        .eq('company', job.company)
        .single();

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
      content: `Look up "${company}" on RepVue and Glassdoor. Return ONLY a JSON object, no other text:
{"repvueScore":null,"quotaAttainment":null,"glassdoorRating":null,"glassdoorRecommend":null,"redFlags":null}
Fill in what you find. repvueScore is 0-100, quotaAttainment is %, glassdoorRating is out of 5, glassdoorRecommend is % who recommend. redFlags is a short string or null.`
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
  if (h.redFlags)
    flags.push(h.redFlags);

  const signals = [];
  if (h.repvueScore != null)      signals.push(`RepVue ${h.repvueScore}/100`);
  if (h.quotaAttainment != null)  signals.push(`${h.quotaAttainment}% quota attainment`);
  if (h.glassdoorRating != null)  signals.push(`Glassdoor ${h.glassdoorRating}/5`);

  const signalStr = signals.length ? signals.join(' · ') : 'No data found';

  if (flags.length >= 2) return `PASS — ${flags.join(', ')}. Signals: ${signalStr}`;
  if (flags.length === 1) return `MAYBE — ${flags[0]}. Signals: ${signalStr}`;
  return `APPLY — Clean signals. ${signalStr}`;
}

// ── Store jobs ────────────────────────────────────────────────────────────────
async function storeJobs(jobs) {
  if (!jobs.length) return;
  const rows = jobs.map(j => ({
    job_id:      j.jobId,
    company:     j.company,
    title:       j.title,
    salary:      j.salary,
    location:    j.location,
    posted_date: j.postedDate,
    apply_url:   j.applyUrl,
    gut_check:   j.gut,
    scraped_at:  new Date()
  }));
  const { error } = await supabase.from('jobs').insert(rows);
  if (error) console.error('[store] Error:', error.message);
}

// ── Email via Resend ──────────────────────────────────────────────────────────
async function sendAlert(job) {
  const h = job.health || {};
  const subject = `NEW ROLE — ${job.company}: ${job.title}`;

  const text = `
${job.gut}

Company:  ${job.company}
Role:     ${job.title}
Salary:   ${job.salary}
Location: ${job.location}
Posted:   ${job.postedDate ? new Date(job.postedDate).toLocaleDateString() : 'Unknown'}
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
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({
        from:    'Job Alerts <onboarding@resend.dev>',
        to:      [CONFIG.emailTo],
        subject,
        text
      })
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('[email] Resend error:', data);
    } else {
      console.log(`[email] Sent: ${job.company} — ${job.title} (id: ${data.id})`);
      await supabase.from('email_alerts').insert({
        job_id:   job.jobId,
        email_to: CONFIG.emailTo,
        sent_at:  new Date()
      });
    }
  } catch (err) {
    console.error('[email] Fetch error:', err.message);
  }
}
