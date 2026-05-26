module.exports = async function handler(req, res) {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) return res.status(200).json({ error: 'RAPIDAPI_KEY not set' });

  try {
    const url = 'https://jsearch.p.rapidapi.com/search-v2?query=Enterprise+Account+Executive+remote&num_pages=1&country=us&date_posted=today';
    const r = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'x-rapidapi-host': 'jsearch.p.rapidapi.com',
        'x-rapidapi-key': key
      },
      signal: AbortSignal.timeout(10000)
    });

    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { return res.status(200).json({ status: r.status, raw: text.slice(0,300) }); }

    return res.status(200).json({
      status: r.status,
      ok: r.ok,
      resultCount: data.data?.length ?? 'N/A',
      error: data.message || data.error || null,
      sample: (data.data || []).slice(0, 3).map(j => ({
        title: j.job_title,
        company: j.employer_name,
        posted: j.job_posted_at_datetime_utc
      }))
    });
  } catch(e) {
    return res.status(200).json({ error: e.message });
  }
};
