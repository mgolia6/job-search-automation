// api/ats-scan.js — ATS Resume compatibility checker
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { jobId, resumeText, jobDescription } = req.body;

  if (!resumeText || !jobDescription) {
    return res.status(400).json({ error: 'Resume text and job description required' });
  }

  try {
    // Call RapidAPI ATS Analyzer
    const response = await fetch('https://resume-ats-analyzer.p.rapidapi.com/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'resume-ats-analyzer.p.rapidapi.com'
      },
      body: JSON.stringify({
        resume: resumeText,
        job_description: jobDescription
      })
    });

    if (!response.ok) {
      throw new Error(`ATS API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Extract key metrics
    const result = {
      score: data.score || data.match_score || data.compatibility_score || 0,
      missingKeywords: data.missing_keywords || data.keywords_missing || [],
      matchedKeywords: data.matched_keywords || data.keywords_matched || [],
      suggestions: data.suggestions || data.recommendations || [],
      formattingIssues: data.formatting_issues || [],
      analyzed_at: new Date().toISOString()
    };

    // Store result if jobId provided
    if (jobId) {
      await supabase.from('jobs').update({
        ats_score: result.score,
        ats_missing_keywords: result.missingKeywords,
        ats_analyzed_at: result.analyzed_at
      }).eq('job_id', jobId);
    }

    return res.status(200).json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('[ats-scan]', error);
    return res.status(500).json({ error: error.message });
  }
};
