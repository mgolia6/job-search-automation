import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const SEARCH_CONFIG = {
  titles: [
    "Enterprise Account Executive",
    "Strategic Account Executive",
    "Senior Account Executive",
    "Strategic Account Manager"
  ],
  location: "remote",
  countryCode: "US",
  minBaseSalary: 100000,
  minOTE: 200000,
  emailTo: "mgolia6@gmail.com"
};

export async function runJobScraper() {
  console.log('Starting job scraper...');
  
  try {
    // Step 1: Search Indeed for jobs
    const allJobs = await searchIndeedJobs();
    console.log(`Found ${allJobs.length} total jobs`);
    
    // Step 2: Filter out duplicates and already-applied
    const newJobs = await filterNewJobs(allJobs);
    console.log(`${newJobs.length} new jobs after filtering`);
    
    // Step 3: Enrich with company health data
    const enrichedJobs = await enrichWithCompanyHealth(newJobs);
    
    // Step 4: Store in Supabase
    await storeJobs(enrichedJobs);
    
    // Step 5: Send email alerts
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

async function searchIndeedJobs() {
  const allJobs = [];
  
  for (const title of SEARCH_CONFIG.titles) {
    console.log(`Searching for: ${title}`);
    
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Use the Indeed search_jobs tool to find "${title}" jobs. Location: ${SEARCH_CONFIG.location}, Country: ${SEARCH_CONFIG.countryCode}. Return ONLY the job results, no commentary.`
      }],
      mcp_servers: [{
        type: 'url',
        url: 'https://mcp.indeed.com/claude/mcp',
        name: 'indeed-mcp'
      }]
    });
    
    // Extract jobs from Claude's response
    const jobs = parseJobsFromResponse(message);
    allJobs.push(...jobs);
  }
  
  return removeDuplicates(allJobs);
}

function parseJobsFromResponse(message) {
  const jobs = [];
  
  for (const block of message.content) {
    if (block.type === 'mcp_tool_result') {
      try {
        const resultText = block.content?.[0]?.text || '';
        // Indeed MCP returns markdown - parse it
        const jobMatches = resultText.matchAll(/\*\*(.+?)\*\*.+?\*\*Company:\*\* (.+?)\n.+?\*\*Location:\*\* (.+?)\n.+?\*\*Salary:\*\* (.+?)\n.+?\[Apply\]\((.+?)\)/gs);
        
        for (const match of jobMatches) {
          const [, title, company, location, salary, applyUrl] = match;
          
          // Filter by salary
          if (meetsSalaryRequirements(salary)) {
            jobs.push({
              jobId: generateJobId(company, title),
              title: title.trim(),
              company: company.trim(),
              location: location.trim(),
              salary: salary.trim(),
              applyUrl: applyUrl.trim(),
              postedDate: new Date()
            });
          }
        }
      } catch (e) {
        console.error('Parse error:', e);
      }
    }
  }
  
  return jobs;
}

function meetsSalaryRequirements(salaryString) {
  if (!salaryString || salaryString === 'Not specified') return false;
  
  // Extract numbers from salary string
  const numbers = salaryString.match(/\d{1,3}(?:,\d{3})*(?:\.\d+)?/g);
  if (!numbers) return false;
  
  const amounts = numbers.map(n => parseFloat(n.replace(/,/g, '')));
  const maxAmount = Math.max(...amounts);
  
  // Check if meets OTE or base salary requirements
  if (salaryString.toLowerCase().includes('ote') || salaryString.toLowerCase().includes('total')) {
    return maxAmount >= SEARCH_CONFIG.minOTE / 1000; // Handles $200K vs $200
  } else {
    return maxAmount >= SEARCH_CONFIG.minBaseSalary / 1000;
  }
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

async function filterNewJobs(jobs) {
  // Check against Supabase jobs table
  const { data: existingJobs } = await supabase
    .from('jobs')
    .select('job_id');
  
  const existingIds = new Set(existingJobs?.map(j => j.job_id) || []);
  
  // Check against applications table
  const { data: appliedJobs } = await supabase
    .from('applications')
    .select('company, role');
  
  const appliedCompanies = new Set(
    appliedJobs?.map(a => `${a.company.toLowerCase()}-${a.role.toLowerCase()}`) || []
  );
  
  return jobs.filter(job => {
    if (existingIds.has(job.jobId)) return false;
    
    const appKey = `${job.company.toLowerCase()}-${job.title.toLowerCase()}`;
    if (appliedCompanies.has(appKey)) return false;
    
    return true;
  });
}

async function enrichWithCompanyHealth(jobs) {
  const enriched = [];
  
  for (const job of jobs) {
    try {
      // Check if we have recent health data
      const { data: cachedHealth } = await supabase
        .from('company_health')
        .select('*')
        .eq('company', job.company)
        .single();
      
      let healthData;
      
      if (cachedHealth && isRecent(cachedHealth.last_updated)) {
        // Use cached data if less than 7 days old
        healthData = cachedHealth;
      } else {
        // Fetch fresh data
        healthData = await fetchCompanyHealth(job.company);
        
        // Update cache
        await supabase
          .from('company_health')
          .upsert({
            company: job.company,
            ...healthData,
            last_updated: new Date()
          });
      }
      
      enriched.push({
        ...job,
        health: healthData,
        gutCheck: generateGutCheck(job, healthData)
      });
      
    } catch (e) {
      console.error(`Health check failed for ${job.company}:`, e);
      enriched.push({
        ...job,
        health: {},
        gutCheck: 'APPLY - No health data available, review manually'
      });
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
      content: `Search for ${company} on RepVue and Glassdoor. Return ONLY a JSON object with these exact fields: {"repvueScore": number or null, "quotaAttainment": number or null, "glassdoorRating": number or null, "glassdoorRecommend": number or null, "redFlags": "string or null"}. No other text.`
    }],
    tools: [{
      type: 'web_search_20250305',
      name: 'web_search'
    }]
  });
  
  // Extract JSON from response
  const textContent = message.content.find(b => b.type === 'text')?.text || '{}';
  const jsonMatch = textContent.match(/\{[\s\S]*\}/);
  
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('JSON parse error:', e);
    }
  }
  
  return {};
}

function generateGutCheck(job, health) {
  const issues = [];
  
  if (health.quotaAttainment && health.quotaAttainment < 40) {
    issues.push(`LOW quota attainment (${health.quotaAttainment}%)`);
  }
  
  if (health.glassdoorRating && health.glassdoorRating < 3.5) {
    issues.push(`LOW Glassdoor (${health.glassdoorRating}/5)`);
  }
  
  if (health.redFlags) {
    issues.push(health.redFlags);
  }
  
  if (issues.length >= 3) {
    return `PASS - Multiple red flags: ${issues.join(', ')}`;
  } else if (issues.length > 0) {
    return `MAYBE - Concerns: ${issues.join(', ')}. Review before applying.`;
  } else {
    return `APPLY - Strong signals, worth pursuing`;
  }
}

async function storeJobs(jobs) {
  const jobRecords = jobs.map(j => ({
    job_id: j.jobId,
    company: j.company,
    title: j.title,
    salary: j.salary,
    location: j.location,
    posted_date: j.postedDate,
    apply_url: j.applyUrl,
    description: j.description || null
  }));
  
  const { error } = await supabase
    .from('jobs')
    .insert(jobRecords);
  
  if (error) {
    console.error('Error storing jobs:', error);
    throw error;
  }
}

async function sendEmailAlert(job) {
  const emailBody = `
NEW ROLE — ${job.company} ${job.title}

${job.company}
${job.title}
Salary: ${job.salary || 'Not specified'}
Posted: ${new Date(job.postedDate).toLocaleDateString()}
Link: ${job.applyUrl}

QUICK SIGNALS:
• RepVue: ${job.health.repvueScore || 'N/A'} | Quota Attainment: ${job.health.quotaAttainment || 'N/A'}%
• Glassdoor: ${job.health.glassdoorRating || 'N/A'}/5 | ${job.health.glassdoorRecommend || 'N/A'}% would recommend
• Red Flags: ${job.health.redFlags || 'None detected'}

GUT CHECK:
${job.gutCheck}

---
Reply "BUILD" to this email to generate resume + cover letters
Reply "PASS" to log and skip
  `.trim();

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Use Gmail to create a draft email to ${SEARCH_CONFIG.emailTo} with subject "NEW ROLE — ${job.company} ${job.title}" and this body:

${emailBody}

Then send it immediately.`
      }],
      mcp_servers: [{
        type: 'url',
        url: 'https://gmailmcp.googleapis.com/mcp/v1',
        name: 'gmail-mcp'
      }]
    });
    
    // Log that email was sent
    await supabase
      .from('email_alerts')
      .insert({
        job_id: job.jobId,
        email_to: SEARCH_CONFIG.emailTo
      });
    
    console.log(`Email sent for ${job.company} - ${job.title}`);
    
  } catch (e) {
    console.error('Email send error:', e);
  }
}
