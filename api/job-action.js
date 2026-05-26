const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, jobId, jobData } = req.body;

  try {
    if (action === 'backlog') {
      // Mark job as backlogged
      const { error } = await supabase
        .from('jobs')
        .update({ status: 'backlog', updated_at: new Date() })
        .eq('job_id', jobId);
      
      if (error) throw error;
      return res.status(200).json({ success: true, message: 'Job moved to backlog' });
    }

    if (action === 'dismiss') {
      // Mark job as dismissed
      const { error } = await supabase
        .from('jobs')
        .update({ status: 'dismissed', updated_at: new Date() })
        .eq('job_id', jobId);
      
      if (error) throw error;
      return res.status(200).json({ success: true, message: 'Job dismissed' });
    }

    if (action === 'add_to_pipeline') {
      // Add to applications table
      const { error: insertError } = await supabase.from('applications').insert({
        company: jobData.company,
        role: jobData.title,
        status: 'Researching',
        date_applied: null,
        source: 'Scraper',
        notes: `Base: ${jobData.salary} | Est OTE: $${Math.round(jobData.estimated_ote / 1000)}K\n${jobData.apply_url}`,
        created_at: new Date()
      });

      if (insertError) throw insertError;

      // Mark job as dismissed (remove from scraper feed)
      const { error: updateError } = await supabase
        .from('jobs')
        .update({ status: 'dismissed', updated_at: new Date() })
        .eq('job_id', jobId);

      if (updateError) throw updateError;

      return res.status(200).json({ success: true, message: 'Added to pipeline' });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    console.error('[job-action]', error);
    return res.status(500).json({ error: error.message });
  }
};
