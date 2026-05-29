# Job Odyssey — Session Notes

## Gmail Scan From Date
after:2026/05/29

## Last Session: May 28-29, 2026

### What Was Done
- Wiped jobs table clean for fresh scraper start
- Fixed cron schedule to Mon/Wed/Fri/Sun at 13:00 UTC (~16 runs/month)
- Built ATS Engine tab end-to-end:
  - Fit Assessment (Claude semantic scoring — overall, hard skills, soft skills, verbatim, experience)
  - RepVue org health (quota attainment, rep satisfaction, culture score, trend, verdict)
  - Keyword Gap Analysis (missing hard, missing soft, matched keywords)
  - AI Recommendation (weighs in on whether to apply based on scores)
  - Gated rewrite — "Generate Tailored Resume" button, side-by-side layout
  - RapidAPI literal ATS check (15/day) — tabbed alongside Fit Assessment
- Master resume seeded to Supabase (resume_master table)
- All Anthropic API calls proxied server-side via /api/ats-scan
- Tab persistence added (localStorage saves active tab across refreshes)
- Sequential execution (score then RepVue) to avoid 30K TPM rate limit

### Known Issues Going Into Next Session
- RapidAPI 503s — their Heroku backend is flaky, needs retry logic or fallback
- Quota Attainment field occasionally returns [object Object] — needs server-side normalization in ats-scan.js
- Rewrite diff highlighting not built — side-by-side shows but no change tracking
- Scraper jobs table is empty — verify cron fired correctly after reset

### Next Session Priorities
1. REFACTOR FIRST — split index.html monolith into separate files:
   - public/css/styles.css
   - public/js/pipeline.js
   - public/js/scraper.js
   - public/js/ats.js
   - public/js/gmail.js
   - public/js/app.js
   - public/index.html (lean shell only)
2. Wire in RapidAPI /api/analyze/generate-optimized-resume to replace Claude rewrite
3. Server-side normalization of RepVue fields in ats-scan.js
4. Add retry logic for RapidAPI 503s
5. Rewrite diff highlighting (changed lines marked green/red)
6. Confirm cron is firing and scraper is populating jobs table

### Architecture Notes
- Supabase project: yaepgxsbjtbdkiidxtmf
- Tables: applications (pipeline), jobs (scraper), resume_master (ATS engine)
- API endpoints: /api/data, /api/resume, /api/ats-scan, /api/cron, /api/company-recon, /api/gmail-scan, /api/job-action
- ATS Engine flow: Paste JD → Analyze (score + RepVue sequential) → Review Report Card → Generate Tailored Resume (on-demand)
- RapidAPI key in Vercel env as RAPIDAPI_KEY (confirmed working for auth)
- Anthropic API key in Vercel env as ANTHROPIC_API_KEY
- Model: claude-sonnet-4-6

### Pipeline State (as of session end)
- Query Supabase applications table for current state — do not reconstruct from docs
- Jobs table: 0 rows (wiped for fresh start, cron should have populated by next session)
