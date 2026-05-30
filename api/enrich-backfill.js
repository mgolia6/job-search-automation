// api/enrich-backfill.js — one-time backfill of full_description for existing jobs
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY);

module.exports = async function handler(req, res) {
  const auth = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const { data: { user }, error: authErr } = await createClient(
    process.env.SUPABASE_URL, process.env.SUPABASE_KEY
  ).auth.getUser(auth);
  if (authErr || !user) return res.status(401).json({ error: 'Unauthorized' });

  // Fetch jobs with no full_description
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('job_id, company, title, description')
    .eq('user_id', user.id)
    .is('full_description', null)
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });
  if (!jobs.length) return res.status(200).json({ success: true, message: 'Nothing to backfill' });

  console.log(`[backfill] enriching ${jobs.length} jobs`);

  let hits = 0;
  let misses = 0;

  for (const job of jobs) {
    const result = await tryEnrich(job);
    if (result.fullDescription) {
      await supabase.from('jobs')
        .update({ full_description: result.fullDescription, jd_source: result.jdSource })
        .eq('job_id', job.job_id);
      hits++;
    } else {
      // Store Adzuna description as fallback so we don't retry
      await supabase.from('jobs')
        .update({ full_description: job.description || '', jd_source: 'adzuna' })
        .eq('job_id', job.job_id);
      misses++;
    }
  }

  return res.status(200).json({ success: true, total: jobs.length, hits, misses });
};

async function tryEnrich(job) {
  const slug = job.company
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // Greenhouse
  try {
    const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`, {
      signal: AbortSignal.timeout(5000)
    });
    if (r.ok) {
      const data = await r.json();
      const match = (data.jobs || []).find(j => {
        const t = (j.title || '').toLowerCase();
        const jt = job.title.toLowerCase();
        return t.includes(jt.split(' ').slice(0,2).join(' ')) || jt.includes(t.split(' ').slice(0,2).join(' '));
      });
      if (match && match.content) {
        const text = match.content.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
        if (text.length > 200) return { fullDescription: text, jdSource: 'greenhouse' };
      }
    }
  } catch(e) { console.log(`[backfill] GH miss ${job.company}: ${e.message}`); }

  // Lever
  try {
    const r = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`, {
      signal: AbortSignal.timeout(5000)
    });
    if (r.ok) {
      const data = await r.json();
      const postings = Array.isArray(data) ? data : [];
      const match = postings.find(p => {
        const t = (p.text || '').toLowerCase();
        const jt = job.title.toLowerCase();
        return t.includes(jt.split(' ').slice(0,2).join(' ')) || jt.includes(t.split(' ').slice(0,2).join(' '));
      });
      if (match) {
        const text = (match.descriptionBody || match.description || '')
          .replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
        if (text.length > 200) return { fullDescription: text, jdSource: 'lever' };
      }
    }
  } catch(e) { console.log(`[backfill] LV miss ${job.company}: ${e.message}`); }

  // Ashby
  try {
    const r = await fetch(`https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operationName: 'ApiJobBoardWithTeams',
        variables: { organizationHostedJobsPageName: slug },
        query: '{ jobBoard { jobPostings { title descriptionHtml } } }'
      }),
      signal: AbortSignal.timeout(5000)
    });
    if (r.ok) {
      const data = await r.json();
      const postings = (data?.data?.jobBoard?.jobPostings) || [];
      const match = postings.find(p => {
        const t = (p.title || '').toLowerCase();
        return t.includes(job.title.toLowerCase().split(' ').slice(0,2).join(' '));
      });
      if (match?.descriptionHtml) {
        const text = match.descriptionHtml.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
        if (text.length > 200) return { fullDescription: text, jdSource: 'ashby' };
      }
    }
  } catch(e) { console.log(`[backfill] AS miss ${job.company}: ${e.message}`); }

  return { fullDescription: null, jdSource: null };
}
