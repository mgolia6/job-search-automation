// api/scraper.js — JSearch API integration
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const CONFIG = {
  maxAgeDays: 2,
  emailTo: 'mgolia6@gmail.com',
  titleKeywords: ['account executive', 'strategic account', 'enterprise account', 'enterprise sales'],
  minSalary: 150000, // $150K base = ~$300K OTE
  // Preferred sources - filter out aggregators
  blockedSources: [
    'remote rocketship',
    'the ladders', 
    'talent.com',
    'media bistro',
    'ziprecruiter',
    'monster',
    'simplyhired',
    'jooble',
    'adzuna'
  ]
};

const SEARCHES = [
  'Enterprise Account Executive',
  'Strategic Account Executive',
  'Senior Account Executive',
  'Strategic Account Manager'
];

async function searchJSearch(query) {
  const url = new URL('https://jsearch.p.rapidapi.com/search');
  url.searchParams.append('query', `${query} remote USA`);
  url.searchParams.append('page', '1');
  url.searchParams.append('num_pages', '1');
  url.searchParams.append('date_posted', 'today'); // Today only (closest to 48 hours available)

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
      'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`JSearch API ${res.status}: ${text.slice(0, 150)}`);
  }

  return res.json();
}

function normalizeJob(j) {
  const company = j.employer_name;
  const title = j.job_title;
  const url = j.job_apply_link;
  const source = j.job_publisher || 'Unknown';
  
  if (!company || !title) return null;
  if (!isAERole(title)) return null;
  
  // Filter out blocked sources (aggregators)
  if (CONFIG.blockedSources.some(blocked => source.toLowerCase().includes(blocked))) {
    return null;
  }
  
  // Parse salary from job data
  let salary = 'Not listed';
  let estimatedSalary = null;
  
  if (j.job_salary_period === 'YEAR' && j.job_max_salary) {
    estimatedSalary = j.job_max_salary;
    salary = `$${Math.round(j.job_min_salary / 1000)}K–$${Math.round(j.job_max_salary / 1000)}K`;
  } else if (j.job_salary_currency === 'USD' && j.job_salary) {
    salary = j.job_salary;
  }
  
  // Filter by salary floor if we have an estimate
  if (estimatedSalary && estimatedSalary < CONFIG.minSalary) {
    return null;
  }
  
  // Filter by recency - must be within 48 hours
  const postedDate = j.job_posted_at_datetime_utc ? new Date(j.job_posted_at_datetime_utc * 1000) : null;
  if (postedDate) {
    const hoursAgo = (Date.now() - postedDate.getTime()) / (1000 * 60 * 60);
    if (hoursAgo > 48) {
      return null;
    }
  }

  return {
    jobId: j.job_id || `jsearch-${slugify(company + '-' + title)}`,
    source: source,
    title: title.trim(),
    company: company.trim(),
    location: j.job_city && j.job_state ? `${j.job_city}, ${j.job_state}` : j.job_country || 'Remote',
    salary,
    baseSalary: estimatedSalary,
    estimatedOTE: estimatedSalary ? estimatedSalary * 2 : null,
    applyUrl: url || j.job_google_link || '',
    postedDate: postedDate || new Date(),
    description: j.job_description?.slice(0, 500) || ''
  };
}

function isAERole(t) {
  if (!t) return false;
  return CONFIG.titleKeywords.some(k => t.toLowerCase().includes(k));
}

function slugify(s) { 
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80); 
}

function globalDedupe(jobs) {
  const seen = new Set();
  return jobs.filter(j => {
    const k = `${j.company.toLowerCase()}|${j.title.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function filterNewJobs(jobs) {
  const { data: seen } = await supabase.from('jobs').select('job_id');
  // Temporarily disabled: const { data: applied } = await supabase.from('applications').select('company');
  const seenIds = new Set((seen || []).map(j => j.job_id));
  // Temporarily disabled: const appliedCos = new Set((applied || []).map(a => a.company.toLowerCase()));
  return jobs.filter(j => !seenIds.has(j.jobId)); // && !appliedCos.has(j.company.toLowerCase()));
}

async function storeJobs(jobs) {
  if (!jobs.length) return;
  const { error } = await supabase.from('jobs').insert(jobs.map(j => ({
    job_id: j.jobId,
    company: j.company,
    title: j.title,
    source: j.source,
    salary: j.salary,
    base_salary: j.baseSalary,
    estimated_ote: j.estimatedOTE,
    location: j.location,
    posted_date: j.postedDate,
    apply_url: j.applyUrl,
    status: 'new',
    gut_check: 'MAYBE — No health data',
    scraped_at: new Date()
  })));
  if (error) console.error('[store]', error.message);
}

async function sendAlert(job) {
  const subject = `[${job.source}] ${job.company}: ${job.title}`;
  const text = `MAYBE — Review and apply

Company:  ${job.company}
Role:     ${job.title}
Source:   ${job.source}
Salary:   ${job.salary}
Location: ${job.location}
Link:     ${job.applyUrl}

---
Paste JD in Claude → resume + 2 CLs`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Job Alerts <onboarding@resend.dev>',
      to: [CONFIG.emailTo],
      subject,
      text
    })
  });

  const data = await res.json();
  if (!res.ok) console.error('[email]', JSON.stringify(data));
  else console.log('[email] sent:', job.company);
}

async function runJobScraper() {
  console.log('[scraper] START', new Date().toISOString());
  const allJobs = [];
  const diagnostics = {
    searches: [],
    filters: { title: [], salary: [] }
  };

  for (const search of SEARCHES) {
    try {
      console.log('[scraper] searching:', search);
      const result = await searchJSearch(search);
      
      if (!result.data || !Array.isArray(result.data)) {
        const msg = `no data returned for: ${search}`;
        console.log('[scraper]', msg);
        console.log('[scraper] response:', JSON.stringify(result).slice(0, 500));
        diagnostics.searches.push({ query: search, count: 0, error: msg });
        continue;
      }

      console.log(`[scraper] raw results for "${search}": ${result.data.length}`);
      diagnostics.searches.push({ query: search, count: result.data.length });
      
      for (const rawJob of result.data) {
        const job = normalizeJob(rawJob);
        if (job) {
          allJobs.push(job);
        } else {
          // Log why it was filtered
          const title = rawJob.job_title || 'Unknown';
          const salary = rawJob.job_max_salary;
          if (!isAERole(title)) {
            console.log(`[scraper] filtered (title): ${title}`);
            diagnostics.filters.title.push(title);
          } else if (salary && salary < CONFIG.minSalary) {
            console.log(`[scraper] filtered (salary $${salary}): ${rawJob.employer_name} - ${title}`);
            diagnostics.filters.salary.push({ company: rawJob.employer_name, title, salary });
          }
        }
      }

      // Rate limit: wait between searches
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.error('[scraper] error:', e.message);
      diagnostics.searches.push({ query: search, count: 0, error: e.message });
    }
  }

  console.log(`[scraper] total extracted: ${allJobs.length}`);
  const deduped = globalDedupe(allJobs);
  console.log(`[scraper] after dedupe: ${deduped.length}`);
  
  const newJobs = await filterNewJobs(deduped);
  console.log(`[scraper] new jobs to store: ${newJobs.length}`);

  if (!newJobs.length) return { jobsFound: 0, diagnostics };

  await storeJobs(newJobs);
  for (const job of newJobs) {
    await sendAlert(job);
  }
  
  return { jobsFound: newJobs.length, diagnostics };
}

module.exports = { runJobScraper };
