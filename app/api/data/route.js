export async function GET(request) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  
  if (!base || !key) {
    return Response.json({ error: 'Missing Supabase credentials' }, { status: 500 });
  }

  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json'
  };

  try {
    const [apps, jobs] = await Promise.all([
      fetch(`${base}/rest/v1/applications?order=app_number.asc.nullslast&limit=200`, { headers }).then(r => r.json()),
      fetch(`${base}/rest/v1/jobs?order=scraped_at.desc&limit=100`, { headers }).then(r => r.json())
    ]);

    return Response.json({
      applications: Array.isArray(apps) ? apps : [],
      jobs: Array.isArray(jobs) ? jobs : []
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  
  if (!base || !key) {
    return Response.json({ error: 'Missing Supabase credentials' }, { status: 500 });
  }

  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  try {
    const { id, status, notes } = await request.json();
    
    const response = await fetch(`${base}/rest/v1/applications?id=eq.${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status, notes, updated_at: new Date().toISOString() })
    });

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
