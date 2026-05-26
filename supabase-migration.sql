-- Migration: Add triage columns to jobs table
-- Run this in Supabase SQL Editor

-- Add base_salary column (integer, nullable)
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS base_salary INTEGER;

-- Add estimated_ote column (integer, nullable)
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS estimated_ote INTEGER;

-- Add status column (text, default 'new')
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new';

-- Add index on status for faster filtering
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

-- Add index on estimated_ote for sorting
CREATE INDEX IF NOT EXISTS idx_jobs_estimated_ote ON jobs(estimated_ote DESC);

-- Add updated_at column if it doesn't exist
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

COMMENT ON COLUMN jobs.base_salary IS 'Base salary from JSearch API';
COMMENT ON COLUMN jobs.estimated_ote IS 'Estimated OTE (base_salary * 2)';
COMMENT ON COLUMN jobs.status IS 'Triage status: new, backlog, dismissed';
