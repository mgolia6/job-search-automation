// api/scraper-v2.js — Multi-source job scraper using premium RapidAPI endpoints
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const CONFIG = {
  maxAgeDays: 2,
  emailTo: 'mgolia6@gmail.com',
  titleKeywords: ['account executive', 'strategic account', 'enterprise account', 'enterprise sales'],
  minSalary: 150000, // $150K base
  sources: {
    linkedin: {
      enabled: true,
      host: 'linkedin-job-search-real-time1.p.rapidapi.com',
      quota: 50 // calls per run
    },
    activeJobs: {
      enabled: true,
      host: 'active-jobs-db.p.rapidapi.com',
      quota: 30
    },
    workday: {
      enabled: false, // Enable when targeting specific companies
      host: 'workday-jobs-api.p.rapidapi.com',
      quota: 20
    }
  }
};

module.exports = async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('[scraper-v2] Starting multi-source job scrape...');
    
    const allJobs = [];
    
    // Source 1: LinkedIn Jobs (highest quality)
    if (CONFIG.sources.linkedin.enabled) {
      const linkedinJobs = await scrapeLinkedIn();
      allJobs.push(...linkedinJobs);
      console.log(`[linkedin] Found ${linkedinJobs.length} jobs`);
    }
    
    // Source 2: Active Jobs DB (clean aggregation)
    if (CONFIG.sources.activeJobs.enabled) {
      const activeJobs = await scrapeActiveJobs();
      allJobs.push(...activeJobs);
      console.log(`[active-jobs] Found ${activeJobs.length} jobs`);
    }
    
    // Deduplicate
    const dedupedJobs = globalDedupe(allJobs);
    console.log(`[dedupe] ${allJobs.length} → ${dedupedJobs.length} jobs`);
    
    // Filter out jobs we already have
    const newJobs = await filterNewJobs(dedupedJobs);
    console.log(`[filter] ${newJobs.length} new jobs`);
    
    // Store in database
    if (newJobs.length > 0) {
      await storeJobs(newJobs);
      console.log(`[store] Saved ${newJobs.length} jobs`);
    }
    
    return res.status(200).json({
      success: true,
      found: allJobs.length,
      deduped: dedupedJobs.length,
      new: newJobs.length,
      sources: {
        linkedin: CONFIG.sources.linkedin.enabled,
        activeJobs: CONFIG.sources.activeJobs.enabled
      }
    });
    
  } catch (error) {
    console.error('[scraper-v2]', error);
    return res.status(500).json({ error: error.message });
  }
};

async function scrapeLinkedIn() {
  const jobs = [];
  
  for (const keyword of CONFIG.titleKeywords) {
    try {
      const url = new URL('https://linkedin-job-search-real-time1.p.rapidapi.com/search-jobs');
      url.searchParams.append('keywords', keyword);
      url.searchParams.append('location', 'United States');
      url.searchParams.append('datePosted', 'past24Hours');
      url.searchParams.append('sort', 'mostRecent');
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'linkedin-job-search-real-time1.p.rapidapi.com'
        }
      });
      
      if (!response.ok) continue;
      
      const data = await response.json();
      const normalized = (data.data || data.jobs || [])
        .map(j => normalizeLinkedInJob(j))
        .filter(Boolean);
      
      jobs.push(...normalized);
    } catch (err) {
      console.error(`[linkedin] Error with keyword "${keyword}":`, err.message);
    }
  }
  
  return jobs;
}

async function scrapeActiveJobs() {
  const jobs = [];
  
  for (const keyword of CONFIG.titleKeywords) {
    try {
      const url = new URL('https://active-jobs-db.p.rapidapi.com/active-ats-jobs');
      url.searchParams.append('title', keyword);
      url.searchParams.append('location', 'remote');
      url.searchParams.append('date_posted', '1'); // Last 24 hours
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'active-jobs-db.p.rapidapi.com'
        }
      });
      
      if (!response.ok) continue;
      
      const data = await response.json();
      const normalized = (data.data || data.jobs || [])
        .map(j => normalizeActiveJob(j))
        .filter(Boolean);
      
      jobs.push(...normalized);
    } catch (err) {
      console.error(`[active-jobs] Error with keyword "${keyword}":`, err.message);
    }
  }
  
  return jobs;
}

function normalizeLinkedInJob(j) {
  const company = j.company || j.company_name || j.companyName;
  const title = j.title || j.job_title || j.position;
  const url = j.job_url || j.url || j.link;
  
  if (!company || !title) return null;
  if (!isAERole(title)) return null;
  
  // Parse salary
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
    applyUrl: url || '',
    postedDate: j.posted_date ? new Date(j.posted_date) : new Date(),
    description: (j.description || '').slice(0, 500)
  };
}

function normalizeActiveJob(j) {
  const company = j.company || j.company_name;
  const title = j.title || j.job_title;
  const url = j.job_url || j.url;
  
  if (!company || !title) return null;
  if (!isAERole(title)) return null;
  
  // Parse salary
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
    applyUrl: url || '',
    postedDate: j.date_posted ? new Date(j.date_posted) : new Date(),
    description: (j.description || '').slice(0, 500)
  };
}

function isAERole(title) {
  if (!title) return false;
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
  if (error) console.error('[store]', error.message);
}
