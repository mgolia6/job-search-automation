const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const CONFIG = {
  titleKeywords: ['account executive', 'strategic account', 'enterprise account', 'enterprise sales'],
  minSalary: 150000
};

module.exports = async function handler(req, res) {
  console.log('[cron] Triggered', new Date().toISOString());

  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Respond immediately so browser doesn't time out
  res.status(200).json({ success: true, status: 'running', message: 'Scraper started', timestamp: new Date().toISOString() });

  // Run scraper asynchronously in background
  (async () => {
    try {
      const startTime = new Date();
      console.log('[cron] Starting scraper...');
      
      const allJobs = [];
      
      // Try Active Jobs DB (more reliable than LinkedIn)
      console.log('[cron] Scraping Active Jobs DB...');
      const activeJobs = await scrapeActiveJobs();
      console.log(`[cron] Active Jobs DB: ${activeJobs.length} jobs`);
      allJobs.push(...activeJobs);
      
      // Try LinkedIn
      console.log('[cron] Scraping LinkedIn...');
      const linkedinJobs = await scrapeLinkedIn();
      console.log(`[cron] LinkedIn: ${linkedinJobs.length} jobs`);
      allJobs.push(...linkedinJobs);
      
      // Dedupe and filter
      const deduped = globalDedupe(allJobs);
      console.log(`[cron] After dedupe: ${deduped.length} jobs`);
      
      const newJobs = await filterNewJobs(deduped);
      console.log(`[cron] New jobs: ${newJobs.length}`);
      
      // Store
      let storedCount = 0;
      if (newJobs.length > 0) {
        await storeJobs(newJobs);
        storedCount = newJobs.length;
        console.log(`[cron] Stored ${newJobs.length} jobs`);
      }
      
      const duration = Date.now() - startTime.getTime();
      console.log(`[cron] Complete in ${duration}ms: found=${allJobs.length}, deduped=${deduped.length}, new=${newJobs.length}, stored=${storedCount}`);
    } catch (err) {
      console.error('[cron] Error:', err.message, err.stack);
    }
  })();
};

async function scrapeActiveJobs() {
  const jobs = [];
  
  for (const keyword of CONFIG.titleKeywords) {
    try {
      const url = new URL('https://active-jobs-db.p.rapidapi.com/active-ats-1h');
      url.searchParams.append('offset', '0');
      url.searchParams.append('title_filter', `"${keyword}"`);
      url.searchParams.append('location_filter', '"United States"');
      url.searchParams.append('description_type', 'text');
      
      console.log(`[active-jobs] Fetching "${keyword}"...`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-rapidapi-host': 'active-jobs-db.p.rapidapi.com',
          'x-rapidapi-key': process.env.RAPIDAPI_KEY
        }
      });
      
      console.log(`[active-jobs] Status: ${response.status}`);
      
      if (!response.ok) {
        const text = await response.text();
        console.log(`[active-jobs] Error response: ${text.slice(0, 200)}`);
        continue;
      }
      
      const data = await response.json();
      const jobs_list = data.data || data.jobs || data || [];
      console.log(`[active-jobs] Got ${jobs_list.length} raw results`);
      
      const normalized = jobs_list
        .map(j => normalizeActiveJob(j))
        .filter(Boolean);
      
      console.log(`[active-jobs] "${keyword}": ${normalized.length} normalized`);
      jobs.push(...normalized);
    } catch (err) {
      console.error(`[active-jobs] Error "${keyword}":`, err.message);
    }
  }
  
  console.log(`[active-jobs] Total: ${jobs.length}`);
  return jobs;
}

async function scrapeLinkedIn() {
  const jobs = [];
  
  for (const keyword of CONFIG.titleKeywords) {
    try {
      const url = new URL('https://linkedin-job-search-real-time1.p.rapidapi.com/search-jobs');
      url.searchParams.append('keywords', keyword);
      url.searchParams.append('location', 'United States');
      url.searchParams.append('datePosted', 'past24Hours');
      url.searchParams.append('sort', 'mostRecent');
      
      console.log(`[linkedin] Fetching "${keyword}"...`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'linkedin-job-search-real-time1.p.rapidapi.com'
        }
      });
      
      console.log(`[linkedin] Status: ${response.status}`);
      
      if (!response.ok) {
        const text = await response.text();
        console.log(`[linkedin] Error response: ${text.slice(0, 200)}`);
        continue;
      }
      
      const data = await response.json();
      const jobs_list = data.data || data.jobs || [];
      console.log(`[linkedin] Got ${jobs_list.length} raw results`);
      
      const normalized = jobs_list
        .map(j => normalizeLinkedInJob(j))
        .filter(Boolean);
      
      console.log(`[linkedin] "${keyword}": ${normalized.length} normalized`);
      jobs.push(...normalized);
    } catch (err) {
      console.error(`[linkedin] Error "${keyword}":`, err.message);
    }
  }
  
  console.log(`[linkedin] Total: ${jobs.length}`);
  return jobs;
}

function normalizeLinkedInJob(j) {
  const company = j.company || j.company_name || j.companyName;
  const title = j.title || j.job_title;
  if (!company || !title || !isAERole(title)) return null;
  
  let salary = 'Not listed';
  let estimatedSalary = null;
  
  if (j.salary_max || j.max_salary) {
    estimatedSalary = parseInt(j.salary_max || j.max_salary);
    const min = parseInt(j.salary_min || j.min_salary || estimatedSalary * 0.8);
    salary = `$${Math.round(min / 1000)}K–$${Math.round(estimatedSalary / 1000)}K`;
  }
  
  if (estimatedSalary && estimatedSalary < CONFIG.minSalary) return null;
  
  return {
    jobId: j.job_id || `linkedin-${slugify(company + '-' + title)}`,
    source: 'LinkedIn',
    title: title.trim(),
    company: company.trim(),
    location: j.location || 'Remote',
    salary,
    baseSalary: estimatedSalary,
    estimatedOTE: estimatedSalary ? estimatedSalary * 2 : null,
    applyUrl: j.job_url || j.url || j.link || '',
    postedDate: j.posted_date ? new Date(j.posted_date) : new Date(),
    description: (j.description || '').slice(0, 500)
  };
}

function normalizeActiveJob(j) {
  const company = j.company || j.company_name;
  const title = j.title || j.job_title;
  if (!company || !title || !isAERole(title)) return null;
  
  let salary = 'Not listed';
  let estimatedSalary = null;
  
  if (j.salary) {
    const match = j.salary.match(/\$?([\d,]+)k?[-–]?\$?([\d,]+)?k?/i);
    if (match) {
      const max = parseInt(match[2] || match[1]);
      estimatedSalary = max * 1000;
      salary = j.salary;
    }
  }
  
  if (estimatedSalary && estimatedSalary < CONFIG.minSalary) return null;
  
  return {
    jobId: j.job_id || `active-${slugify(company + '-' + title)}`,
    source: j.source || 'Active Jobs DB',
    title: title.trim(),
    company: company.trim(),
    location: j.location || 'Remote',
    salary,
    baseSalary: estimatedSalary,
    estimatedOTE: estimatedSalary ? estimatedSalary * 2 : null,
    applyUrl: j.job_url || j.url || '',
    postedDate: j.date_posted ? new Date(j.date_posted) : new Date(),
    description: (j.description || '').slice(0, 500)
  };
}

function isAERole(title) {
  return CONFIG.titleKeywords.some(k => title.toLowerCase().includes(k));
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80);
}

function globalDedupe(jobs) {
  const seen = new Set();
  return jobs.filter(j => {
    const key = `${j.company.toLowerCase()}|${j.title.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function filterNewJobs(jobs) {
  const { data: seen } = await supabase.from('jobs').select('job_id');
  const seenIds = new Set((seen || []).map(j => j.job_id));
  return jobs.filter(j => !seenIds.has(j.jobId));
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
  if (error) console.error('[store] Error:', error.message);
}

module.exports.config = { maxDuration: 300 };
