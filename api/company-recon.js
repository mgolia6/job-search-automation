// api/company-recon.js — Fetch RepVue and Glassdoor data for company health checks
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const CACHE_HOURS = 168; // 1 week

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { company } = req.body;
  if (!company) {
    return res.status(400).json({ error: 'Company name required' });
  }

  try {
    // Check cache first
    const { data: cached } = await supabase
      .from('company_recon')
      .select('*')
      .eq('company', company)
      .single();

    // Return cached if fresh (within CACHE_HOURS)
    if (cached && cached.last_fetched) {
      const hoursSinceFetch = (Date.now() - new Date(cached.last_fetched).getTime()) / (1000 * 60 * 60);
      if (hoursSinceFetch < CACHE_HOURS) {
        return res.status(200).json({
          success: true,
          company,
          cached: true,
          repvue: {
            available: !!cached.repvue_quota_attainment,
            quotaAttainment: cached.repvue_quota_attainment,
            rating: cached.repvue_rating,
            url: cached.repvue_url
          },
          glassdoor: {
            available: !!cached.glassdoor_rating,
            rating: cached.glassdoor_rating,
            url: cached.glassdoor_url
          }
        });
      }
    }

    // Fetch fresh data
    const [repvueData, glassdoorData] = await Promise.all([
      fetchRepVue(company),
      fetchGlassdoor(company)
    ]);

    // Store in cache
    await supabase.from('company_recon').upsert({
      company,
      repvue_quota_attainment: repvueData.quotaAttainment,
      repvue_rating: repvueData.rating,
      repvue_url: repvueData.url,
      glassdoor_rating: glassdoorData.rating,
      glassdoor_url: glassdoorData.url,
      last_fetched: new Date()
    }, { onConflict: 'company' });

    return res.status(200).json({
      success: true,
      company,
      cached: false,
      repvue: repvueData,
      glassdoor: glassdoorData
    });
  } catch (error) {
    console.error('[company-recon]', error);
    return res.status(500).json({ error: error.message });
  }
};

async function fetchRepVue(company) {
  try {
    const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const url = `https://www.repvue.com/companies/${slug}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      return { available: false, url };
    }

    const html = await response.text();
    
    // Extract quota attainment % - look for patterns like "75% quota attainment"
    const quotaMatch = html.match(/(\d+)%\s+(?:of reps )?(?:hit|hitting|achieve|achieving)?\s*quota/i);
    const quotaAttainment = quotaMatch ? parseInt(quotaMatch[1]) : null;
    
    // Extract overall rating - look for patterns like "4.2/5" or "4.2 out of 5"
    const ratingMatch = html.match(/(\d+\.?\d*)\s*(?:\/|out of)\s*5/i);
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

    return {
      available: true,
      url,
      quotaAttainment,
      rating,
      scraped: new Date().toISOString()
    };
  } catch (error) {
    console.error('[repvue]', error.message);
    return { available: false, error: error.message };
  }
}

async function fetchGlassdoor(company) {
  try {
    const url = new URL('https://glassdoor-real-time.p.rapidapi.com/search');
    url.searchParams.append('query', company);
    url.searchParams.append('type', 'company');
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'glassdoor-real-time.p.rapidapi.com'
      }
    });

    if (!response.ok) {
      return { available: false };
    }

    const data = await response.json();
    
    // Extract first matching company
    const companyData = data.data?.[0] || data.companies?.[0] || data[0];
    if (!companyData) {
      return { available: false };
    }
    
    const rating = parseFloat(companyData.rating || companyData.overall_rating || companyData.overallRating);
    const companyUrl = companyData.url || companyData.link || `https://www.glassdoor.com/Search/results.htm?keyword=${encodeURIComponent(company)}`;

    return {
      available: rating !== null && !isNaN(rating),
      rating: rating || null,
      url: companyUrl,
      scraped: new Date().toISOString()
    };
  } catch (error) {
    console.error('[glassdoor]', error.message);
    return { available: false, error: error.message };
  }
}
