import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase  = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const SEARCH_CONFIG = {
  titles: [
    "Enterprise Account Executive",
    "Strategic Account Executive",
    "Senior Account Executive",
    "Strategic Account Manager"
  ],
  location:        "remote",
  countryCode:     "US",
  minBaseSalary:   100000,  // $100K base floor
  minOTE:          200000,  // $200K OTE floor
  maxAgeDays:      14,      // only surface roles posted in last 14 days
  emailTo:         "mgolia6@gmail.com"
};

export async function runJobScraper() {
  console.log('Starting job scraper...');
  try {
    const allJobs      = await searchIndeedJobs();
    console.log(`Found ${allJobs.length} total jobs`);

    const newJobs      = await filterNewJobs(allJobs);
    console.log(`${newJobs.length} new jobs after dedup/recency filter`);

    const enrichedJobs = await enrichWithCompanyHealth(newJobs);
    await storeJobs(enrichedJobs);

    for (const job of enrichedJobs) {
      await sendEmailAlert(job);
    }

    console.log(`Scraper complete. Sent ${enrichedJobs.length} alerts.`);
    return { success: true, jobsFound: enrichedJobs.length };
  } catch (error) {
    console.error('Scraper error:', error);
    throw error;
  }
}

// ── Indeed search ─────────────────────────────────────────────────────────────
async function searchIndeedJobs() {
  const allJobs = [];

  for (const title of SEARCH_CONFIG.titles) {
    console.log(`Searching: "${title}"`);
    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `Use the Indeed search_jobs tool to search for "${title}" jobs. location: "${SEARCH_CONFIG.location}", country_code: "${SEARCH_CONFIG.countryCode}", job_type: "fulltime". Return all results.`
        }],
        mcp_servers: [{
          type: 'url',
          url:  'https://mcp.indeed.com/claude/mcp',
          name: 'indeed-mcp'
        }]
      });

      const jobs = parseIndeedResponse(message);
      console.log(`  → ${jobs.length} raw results for "${title}"`);
      allJobs.push(...jobs);
    } catch (e) {
      console.error(`Search failed for "${title}":`, e.message);
    }
  }

  return removeDuplicates(allJobs);
}

// ── Parse Indeed MCP response ─────────────────────────────────────────────────
// Indeed MCP returns structured text blocks like:
//   **Job Title:** Senior Account Executive
//   **Job Id:** JOB_1
//   **Company:** Acme Corp
//   **Location:** Remote
//   **Posted on:** May 22, 2026
//   **Job Type:** Full-time
//   **Compensation:** $208,000 - $312,000 a year
//   **View Job URL:** https://to.indeed.com/...
function parseIndeedResponse(message) {
  const jobs = [];

  // Collect all text content from all blocks
  const fullText = message.content
    .map(b => b.type === 'text' ? b.text : (b.content?.[0]?.text || ''))
    .join('\n');

  // Split into individual job blocks on Job Title field
  const blocks = fullText.split(/(?=\*\*Job Title:\*\*)/);

  for (const block of blocks) {
    if (!block.includes('**Job Title:**')) continue;

    const get = (field) => {
      const match = block.match(new RegExp(`\\*\\*${field}:\\*\\*\\s*(.+)`));
      return match ? match[1].trim() : null;
    };

    const title       = get('Job Title');
    const jobId       = get('Job Id');
    const company     = get('Company');
    const location    = get('Location');
    const postedOn    = get('Posted on');
    const compensation = get('Compensation');
    const url         = get('View Job URL');

    if (!title || !company) continue;

    // Recency filter
    if (!isWithinMaxAge(postedOn)) {
      console.log(`  Skipping (too old: ${postedOn}): ${company} — ${title}`);
      continue;
    }

    // Salary filter
    if (!meetsSalaryRequirements(compensation)) {
      console.log(`  Skipping (salary: ${compensation}): ${company} — ${title}`);
      continue;
    }

    jobs.push({
      jobId:      jobId || generateJobId(company, title),
      title:      title,
      company:    company,
      location:   location || 'Remote',
      salary:     compensation || 'Not listed',
      applyUrl:   url || '',
      postedDate: postedOn ? new Date(postedOn) : new Date()
    });
  }

  return jobs;
}

// ── Recency filter — only roles posted within maxAgeDays ──────────────────────
function isWithinMaxAge(postedOnString) {
  if (!postedOnString) return false;
  try {
    const posted  = new Date(postedOnString);
    const cutoff  = new Date();
    cutoff.setDate(cutoff.getDate() - SEARCH_CONFIG.maxAgeDays);
    return posted >= cutoff;
  } catch {
    return false;
  }
}

// ── Salary filter ─────────────────────────────────────────────────────────────
function meetsSalaryRequirements(salaryString) {
  if (!salaryString || salaryString.toLowerCase() === 'not specified') return false;

  const numbers = salaryString.replace(/[$,]/g, '').match(/\d+(?:\.\d+)?(?:k|K)?/g);
  if (!numbers) return false;

  const amounts = numbers.map(n => {
    const val = parseFloat(n);
    return n.toLowerCase().endsWith('k') ? val * 1000 : (val < 1000 ? val * 1000 : val);
  });

  const maxAmount = Math.max(...amounts);
  const isOTE = /ote|total|on.target/i.test(salaryString);
  return isOTE ? maxAmount >= SEARCH_CONFIG.minOTE : maxAmount >= SEARCH_CONFIG.minBaseSalary;
}

function generateJobId(company, title) {
  return `${company}-${title}`.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 100);
}

function removeDuplicates(jobs) {
  const seen = new Map();
  return jobs.filter(job => {
    if (seen.has(job.jobId)) return false;
    seen.set(job.jobId, true);
    return true;
  });
}

// ── Dedup against Supabase ────────────────────────────────────────────────────
async function filterNewJobs(jobs) {
  const { data: seenJobs }   = await supabase.from('jobs').select('job_id');
  const { data: appliedJobs } = await supabase.from('applications').select('company');

  const seenIds          = new Set(seenJobs?.map(j => j.job_id) || []);
  const appliedCompanies = new Set(appliedJobs?.map(a => a.company.toLowerCase()) || []);

  return jobs.filter(job => {
    if (seenIds.has(job.jobId)) return false;
    if (appliedCompanies.has(job.company.toLowerCase())) return false;
    return true;
  });
}

// ── Company health ────────────────────────────────────────────────────────────
async function enrichWithCompanyHealth(jobs) {
  const enriched = [];
  for (const job of jobs) {
    try {
      const { data: cached } = await supabase
        .from('company_health').select('*').eq('company', job.company).single();

      let health;
      if (cached && isRecent(cached.last_updated)) {
        health = cached;
      } else {
        health = await fetchCompanyHealth(job.company);
        await supabase.from('company_health').upsert({
          company: job.company, ...health, last_updated: new Date()
        });
      }

      enriched.push({ ...job, health, gutCheck: generateGutCheck(job, health) });
    } catch (e) {
      console.error(`Health check failed for ${job.company}:`, e.message);
      enriched.push({ ...job, health: {}, gutCheck: 'MAYBE — No health data, review manually' });
    }
  }
  return enriched;
}

function isRecent(timestamp) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return new Date(timestamp) > sevenDaysAgo;
}

async function fetchCompanyHealth(company) {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `Search RepVue and Glassdoor for "${company}". Return ONLY valid JSON, no other text: {"repvueScore": number|null, "quotaAttainment": number|null, "glassdoorRating": number|null, "glassdoorRecommend": number|null, "redFlags": "string"|null}`
    }],
    tools: [{ type: 'web_search_20250305', name: 'web_search' }]
  });

  const text  = message.content.find(b => b.type === 'text')?.text || '{}';
  const match = text.match(/\{[\s\S]*?\}/);
  try { return match ? JSON.parse(match[0]) : {}; } catch { return {}; }
}

function generateGutCheck(job, health) {
  const issues = [];
  if (health.quotaAttainment != null && health.quotaAttainment < 40)  issues.push(`Low quota attainment (${health.quotaAttainment}%)`);
  if (health.glassdoorRating != null && health.glassdoorRating  < 3.5) issues.push(`Low Glassdoor (${health.glassdoorRating}/5)`);
  if (health.redFlags) issues.push(health.redFlags);

  if (issues.length >= 3) return `PASS — Multiple red flags: ${issues.join(', ')}`;
  if (issues.length > 0)  return `MAYBE — Concerns: ${issues.join(', ')}`;
  return `APPLY — Strong signals`;
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
    apply_url:   j.applyUrl
  })));
  if (error) { console.error('Store error:', error); throw error; }
}

// ── Email ─────────────────────────────────────────────────────────────────────
async function sendEmailAlert(job) {
  const body = `
NEW ROLE — ${job.company}: ${job.title}

Salary:   ${job.salary}
Posted:   ${job.postedDate ? new Date(job.postedDate).toLocaleDateString() : 'Unknown'}
Location: ${job.location}
Link:     ${job.applyUrl}

QUICK SIGNALS:
• RepVue score:      ${job.health.repvueScore       ?? 'N/A'}
• Quota attainment:  ${job.health.quotaAttainment   ?? 'N/A'}%
• Glassdoor:         ${job.health.glassdoorRating   ?? 'N/A'}/5
• % recommend:       ${job.health.glassdoorRecommend ?? 'N/A'}%
• Red flags:         ${job.health.redFlags          || 'None detected'}

GUT CHECK: ${job.gutCheck}

---
Reply BUILD → paste JD in Claude, get resume + 2 cover letters
Reply PASS  → log and skip
  `.trim();

  try {
    await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Send an email to ${SEARCH_CONFIG.emailTo} with subject "NEW ROLE — ${job.company}: ${job.title}" and this body:\n\n${body}`
      }],
      mcp_servers: [{
        type: 'url',
        url:  'https://gmailmcp.googleapis.com/mcp/v1',
        name: 'gmail-mcp'
      }]
    });

    await supabase.from('email_alerts').insert({ job_id: job.jobId, email_to: SEARCH_CONFIG.emailTo });
    console.log(`Email sent: ${job.company} — ${job.title}`);
  } catch (e) {
    console.error('Email error:', e.message);
  }
}
