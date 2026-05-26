-- Add source column to jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'Unknown';

-- Add index for filtering by source
CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);
