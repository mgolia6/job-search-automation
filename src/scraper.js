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
  location:       "remote",
  countryCode:    "US",
  minBaseSalary:  100000,   // $100K base floor
  minOTE:         200000,   // $200K OTE floor
  emailTo:        "mgolia6@gmail.com"
};

export async function runJobScraper() {
  console.log('Starting job scraper...');
  try {
    const allJobs     = await searchIndeedJobs();
    console.log(`Found ${allJobs.length} total jobs`);

    const newJobs     = await filterNewJobs(allJobs);
    console.log(`${newJobs.length} new jobs after filtering`);

    const enrichedJobs = await enrichWithCompanyHealth(newJobs);
    await storeJobs(enrichedJobs);

    for (const job of enrichedJobs) {
      await sendEmailAlert(job);
    }

    console.log(`Scraper complete. Sent ${enrichedJobs.length} email alerts.`);
    return { success: true, jobsFound: enrichedJobs.length };
  } catch (error) {
    console.error('Scraper error:', error);
    throw error;
  }
}

// ── Indeed search ────────────────────────────────────────────────────────────
async function searchIndeedJobs() {
  const allJobs = [];

  for (const title of SEARCH_CONFIG.titles) {
    console.log(`Searching Indeed for: ${title}`);
    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `Use the Indeed search_jobs tool to search for "${title}" jobs with location "remote" and country "US". Return the raw results.`
        }],
        mcp_servers: [{
          type: 'url',
          url:  'https://mcp.indeed.com/claude/mcp',
          name: 'indeed-mcp'
        }]
      });

      const jobs = parseJobsFromResponse(message, title);
      console.log(`  → ${jobs.length} jobs parsed for "${title}"`);
      allJobs.push(...jobs);
    } catch (e) {
      console.error(`Search failed for "${title}":`, e.message);
    }
  }

  return removeDuplicates(allJobs);
}

// ── Parse Indeed MCP response ────────────────────────────────────────────────
// Indeed MCP returns structured tool-result blocks — iterate all of them.
function parseJobsFromResponse(message, searchTitle) {
  const jobs = [];

  for (const block of message.content) {
    // Handle both mcp_tool_result and plain text blocks
    let rawText = '';
    if (block.type === 'mcp_tool_result') {
      rawText = block.content?.[0]?.text || '';
    } else if (block.type === 'text') {
      rawText = block.text || '';
    }
    if (!rawText) continue;

    // Try JSON parse first (Indeed MCP often returns structured JSON)
    try {
      const parsed = JSON.parse(rawText);
      const results = parsed.results || parsed.jobs || parsed.data || [];
      for (const r of results) {
        const salary = r.salary || r.salaryRange || r.compensation || '';
        if (!meetsSalaryRequirements(salary)) continue;
        jobs.push({
          jobId:      generateJobId(r.company || r.employer, r.title || r.jobTitle),
          title:      (r.title || r.jobTitle || searchTitle).trim(),
          company:    (r.company || r.employer || '').trim(),
          location:   (r.location || 'Remote').trim(),
          salary:     salary.trim(),
          applyUrl:   r.url || r.applyUrl || r.link || '',
          postedDate: new Date()
        });
      }
      continue;
    } catch (_) { /* not JSON, fall through to markdown parse */ }

    // Markdown fallback — flexible pattern, doesn't require exact field order
    const titlePattern  = /\*\*([^\*]+)\*\*/g;
    const companyPat    = /(?:Company|Employer):\s*\**([^\n\*]+)/i;
    const salaryPat     = /(?:Salary|Pay|Compensation):\s*\**([^\n\*]+)/i;
    const locationPat   = /(?:Location):\s*\**([^\n\*]+)/i;
    const urlPat        = /\[(?:Apply|View)[^\]]*\]\(([^)]+)\)/i;

    // Split on double-newline to get individual job blocks
    const chunks = rawText.split(/\n{2,}/);
    for (const chunk of chunks) {
      const companyMatch  = chunk.match(companyPat);
      const salaryMatch   = chunk.match(salaryPat);
      const locationMatch = chunk.match(locationPat);
      const urlMatch      = chunk.match(urlPat);
      const titleMatch    = chunk.match(titlePattern);

      if (!companyMatch) continue;

      const salary = salaryMatch?.[1]?.trim() || '';
      if (!meetsSalaryRequirements(salary)) continue;

      jobs.push({
        jobId:      generateJobId(companyMatch[1], titleMatch?.[0] || searchTitle),
        title:      (titleMatch?.[0]?.replace(/\*/g,'') || searchTitle).trim(),
        company:    companyMatch[1].trim(),
        location:   locationMatch?.[1]?.trim() || 'Remote',
        salary:     salary,
        applyUrl:   urlMatch?.[1]?.trim() || '',
        postedDate: new Date()
      });
    }
  }

  return jobs;
}

// ── Salary filter — FIX: compare raw numbers, not divided-by-1000 ────────────
function meetsSalaryRequirements(salaryString) {
  if (!salaryString || salaryString.toLowerCase() === 'not specified') return false;

  // Strip currency symbols and extract all numeric values
  const numbers = salaryString.replace(/[$,]/g, '').match(/\d+(?:\.\d+)?(?:k|K)?/g);
  if (!numbers) return false;

  const amounts = numbers.map(n => {
    const val = parseFloat(n);
    // Handle shorthand: "150K" → 150000, "150" → 150000 if plausible salary range
    return (n.toLowerCase().endsWith('k')) ? val * 1000 : (val < 1000 ? val * 1000 : val);
  });

  const maxAmount = Math.max(...amounts);

  const isOTE = /ote|total|on.target/i.test(salaryString);
  return isOTE ? maxAmount >= SEARCH_CONFIG.minOTE : maxAmount >= SEARCH_CONFIG.minBaseSalary;
}

function generateJobId(company, title) {
  return `${company || 'unknown'}-${title || 'unknown'}`
    .toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 100);
}

function removeDuplicates(jobs) {
  const seen = new Map();
  return jobs.filter(job => {
    if (seen.has(job.jobId)) return false;
    seen.set(job.jobId, true);
    return true;
  });
}

// ── Dedup against Supabase ───────────────────────────────────────────────────
async function filterNewJobs(jobs) {
  const { data: existingJobs }  = await supabase.from('jobs').select('job_id');
  const { data: appliedJobs }   = await supabase.from('applications').select('company');

  const existingIds      = new Set(existingJobs?.map(j => j.job_id) || []);
  const appliedCompanies = new Set(appliedJobs?.map(a => a.company.toLowerCase()) || []);

  return jobs.filter(job => {
    if (existingIds.has(job.jobId)) return false;
    if (appliedCompanies.has(job.company.toLowerCase())) return false;
    return true;
  });
}

// ── Company health enrichment ────────────────────────────────────────────────
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
      enriched.push({ ...job, health: {}, gutCheck: 'MAYBE - No health data, review manually' });
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
      content: `Search RepVue and Glassdoor for "${company}". Return ONLY valid JSON with these fields, no other text: {"repvueScore": number|null, "quotaAttainment": number|null, "glassdoorRating": number|null, "glassdoorRecommend": number|null, "redFlags": "string"|null}`
    }],
    tools: [{ type: 'web_search_20250305', name: 'web_search' }]
  });

  const text = message.content.find(b => b.type === 'text')?.text || '{}';
  const match = text.match(/\{[\s\S]*?\}/);
  try { return match ? JSON.parse(match[0]) : {}; } catch { return {}; }
}

function generateGutCheck(job, health) {
  const issues = [];
  if (health.quotaAttainment  != null && health.quotaAttainment  < 40)  issues.push(`Low quota attainment (${health.quotaAttainment}%)`);
  if (health.glassdoorRating  != null && health.glassdoorRating  < 3.5) issues.push(`Low Glassdoor (${health.glassdoorRating}/5)`);
  if (health.redFlags) issues.push(health.redFlags);

  if (issues.length >= 3) return `PASS — Multiple red flags: ${issues.join(', ')}`;
  if (issues.length > 0)  return `MAYBE — Concerns: ${issues.join(', ')}. Review before applying.`;
  return `APPLY — Strong signals, worth pursuing`;
}

// ── Store jobs ───────────────────────────────────────────────────────────────
async function storeJobs(jobs) {
  if (!jobs.length) return;
  const records = jobs.map(j => ({
    job_id:      j.jobId,
    company:     j.company,
    title:       j.title,
    salary:      j.salary,
    location:    j.location,
    posted_date: j.postedDate,
    apply_url:   j.applyUrl,
    description: j.description || null
  }));

  const { error } = await supabase.from('jobs').insert(records);
  if (error) { console.error('Store error:', error); throw error; }
}

// ── Send email via Gmail MCP ─────────────────────────────────────────────────
async function sendEmailAlert(job) {
  const body = `
NEW ROLE — ${job.company}: ${job.title}

Salary:   ${job.salary || 'Not listed'}
Location: ${job.location}
Link:     ${job.applyUrl}

QUICK SIGNALS:
• RepVue score:       ${job.health.repvueScore       ?? 'N/A'}
• Quota attainment:   ${job.health.quotaAttainment   ?? 'N/A'}%
• Glassdoor rating:   ${job.health.glassdoorRating   ?? 'N/A'}/5
• % would recommend:  ${job.health.glassdoorRecommend ?? 'N/A'}%
• Red flags:          ${job.health.redFlags          || 'None detected'}

GUT CHECK: ${job.gutCheck}

---
Reply BUILD → come to Claude and paste the JD
Reply PASS  → log and skip
  `.trim();

  try {
    await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Send an email to ${SEARCH_CONFIG.emailTo} with subject "NEW ROLE — ${job.company}: ${job.title}" and this exact body:\n\n${body}`
      }],
      mcp_servers: [{
        type: 'url',
        url:  'https://gmailmcp.googleapis.com/mcp/v1',
        name: 'gmail-mcp'
      }]
    });

    await supabase.from('email_alerts').insert({
      job_id:   job.jobId,
      email_to: SEARCH_CONFIG.emailTo
    });

    console.log(`Email sent: ${job.company} — ${job.title}`);
  } catch (e) {
    console.error('Email error:', e.message);
  }
}
