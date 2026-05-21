# Job Search Automation Pipeline

Automated job scraper that finds Enterprise AE roles, checks company health signals, and emails you smart alerts every 30 minutes.

## Architecture

- **Vercel**: Hosts cron job (runs every 30 min)
- **Supabase**: Database for jobs, company health data, application log
- **Claude API**: Powers Indeed search, company health checks, and email generation
- **Gmail MCP**: Sends email alerts

## Setup

### 1. Get Supabase API Keys

1. Go to https://supabase.com/dashboard/project/yaepgxsbjtbdkiidxtmf/settings/api
2. Copy your **anon/public** key
3. Save it for the next step

### 2. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd job-search-automation
vercel --prod
```

### 3. Set Environment Variables in Vercel

Go to your Vercel project settings → Environment Variables and add:

- `ANTHROPIC_API_KEY`: Your Anthropic API key
- `SUPABASE_URL`: https://yaepgxsbjtbdkiidxtmf.supabase.co
- `SUPABASE_KEY`: Your Supabase anon key from step 1
- `CRON_SECRET`: Generate a random string (e.g., `openssl rand -base64 32`)

### 4. Verify Cron is Running

1. Go to Vercel dashboard → Your project → Cron Jobs
2. You should see `/api/cron` running every 30 minutes
3. Check logs to see job results

## How It Works

Every 30 minutes:

1. Searches Indeed for "Enterprise Account Executive", "Strategic Account Executive", "Senior Account Executive", "Strategic Account Manager"
2. Filters for remote, $180K+ base or $200K+ OTE
3. Cross-checks against your application log (no duplicates)
4. Pulls RepVue quota attainment + Glassdoor ratings
5. Generates gut-check verdict (APPLY/MAYBE/PASS)
6. Emails you each match with company health signals

## Email Response Workflow

When you receive an email alert:

- Reply "BUILD" → Triggers resume + cover letter generation
- Reply "PASS" → Logs the job and skips it

## Database Schema

**jobs**: Scraped job listings
**company_health**: RepVue + Glassdoor data (cached for 7 days)
**applications**: Your application log (syncs with Google Drive)
**email_alerts**: Tracks which jobs have been emailed

## Local Development

```bash
npm install
ANTHROPIC_API_KEY=xxx SUPABASE_URL=xxx SUPABASE_KEY=xxx node src/scraper.js
```

## Monitoring

- Vercel dashboard shows cron execution logs
- Supabase dashboard shows all scraped jobs
- Email inbox shows new matches

## Phase 2: Dashboard (Coming Soon)

Web UI to:
- View all scraped jobs with filters
- Triage with buttons: "Apply with Master" / "Custom Build" / "Pass"
- Track application status
- See company health trends
# Deployment trigger
