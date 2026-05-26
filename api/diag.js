module.exports = async function handler(req, res) {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) return res.status(200).json({ error: 'RAPIDAPI_KEY not set' });

  try {
    const url = 'https://jsearch.p.rapidapi.com/search?query=Enterprise+Account+Executive+remote&page=1&num_pages=1&date_posted=today&remote_jobs_only=true&country=us';
    const r = await fetch(url, {
      headers: {
        'x-rapidapi-host': 'jsearch.p.rapidapi.com',
        'x-rapidapi-key': key
      },
      signal: AbortSignal.timeout(10000)
    });

    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { data = { raw: text.slice(0, 300) }; }

    return res.status(200).json({
      status: r.status,
      ok: r.ok,
      keyPrefix: key.slice(0, 8) + '...',
      resultCount: data.data?.length ?? 'N/A',
      status_field: data.status,
      error: data.message || data.error || null,
      sample: (data.data || []).slice(0, 2).map(j => ({
        title: j.job_title,
        company: j.employer_name,
        posted: j.job_posted_at_datetime_utc
      }))
    });
  } catch(e) {
    return res.status(200).json({ error: e.message });
  }
};
