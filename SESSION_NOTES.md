# SESSION NOTES — Job Odyssey
# This file is the FIRST thing Claude reads every session.
# GitHub is the single source of truth. Never use Google Drive or APPLICATION_LOG.md for current state — Supabase is live data.

## 📅 SESSION TRACKING
- **Last session date:** 2026/05/28
- **Gmail scan from:** `after:2026/05/28`

## 🔗 CRITICAL LINKS
- **Live app:** https://job-search-automation-pink.vercel.app
- **GitHub repo:** https://github.com/mgolia6/job-search-automation
- **Supabase project:** yaepgxsbjtbdkiidxtmf
- **GitHub token:** stored in userMemories
- **Vercel project ID:** prj_eXJT6KOWJpytqAfNGXE3nyYCbqUZ

## 📋 SESSION STARTUP — DO THIS EVERY TIME
1. Read SESSION_NOTES.md from GitHub (you're doing it now)
2. Query Supabase `applications` table for live pipeline — do NOT use APPLICATION_LOG.md
3. Scan Gmail: `after:2026/05/[last_session_date] (recruiter OR interview OR application OR rejection OR screening)`
4. Check `jobs` table for scraper health: last `scraped_at`, counts by status
5. Report findings, confirm before making changes

## 🗂 FILE MAP
| File | Purpose |
|---|---|
| `public/index.html` | Entire frontend — 1968 lines |
| `api/scraper-jsearch.js` | V1 scraper (JSearch/RapidAPI) — currently wired to cron |
| `api/scraper-v2.js` | V2 scraper (LinkedIn + Active Jobs DB) — built, NOT yet wired |
| `api/cron.js` | Cron handler — currently imports scraper-jsearch.js |
| `api/job-action.js` | Pipeline actions (add, dismiss, backlog) |
| `api/data.js` | Data API for dashboard |
| `api/gmail-scan.js` | Gmail scan endpoint |
| `.github/workflows/cron.yml` | Fires at 11:00, 17:00, 23:00, 03:00 UTC |

## ⚙️ SCRAPER STATE (updated May 28, 2026)
- **V1 (JSearch):** wired to cron, working — last ran May 28 1:13pm
- **V2 (LinkedIn + Active Jobs DB):** built, NOT yet tested or wired in
- **GitHub Actions URL:** `matthews-projects-fc20f25d.vercel.app` — may need updating to `job-search-automation-pink.vercel.app`
- **Jobs in DB:** 39 total (11 new, 28 dismissed) as of May 28

## 📊 APPLICATION PIPELINE (live in Supabase — 46 apps as of May 28, 2026)

**Status taxonomy (standardized May 28, 2026):**
- `Applied` — active, waiting (11)
- `Screening` / `Interviewing` — in process
- `Closed — Rejected` — reached interviews, human said no (2: #5 Mastercard, #16 Salesforce)
- `Closed — Role Filled` — human confirmation, went to someone else (1: #18 Twilio)
- `Closed — Auto-Reject` — ATS/resume screen, never reached human (24)
- `Closed — Position Closed` — posting pulled or expired (3: #13 Indeed, #22 Microsoft, #26 Salesforce K-12)
- `Closed — No Response` — went silent
- `Closed — Pass` — Matthew withdrew (5)

**Active (Applied):**
#23 Microsoft Sr AE | #28 Smartsheet Strategic AE | #29 Asana Enterprise AE | #34 Rippling Enterprise AE | #36 Ema Enterprise AE | #38 Qualtrics RTH | #39 Dataiku Strategic AE East | #40 Dataiku Enterprise AE | #42 Onboard Strategic AE | #44 Onboard Strategic AE (warm) | #45 Qualtrics G&S

**Warm paths (priority order):**
1. Dataiku — Amanda Walt driving referral (highest priority)
2. Qualtrics — Saurabh Vaish (#38 RTH + #45 G&S active)
3. Onboard — Chris Wisniewski warm, CRO (Chris Kiene) outreach pending

## 🏗 WHAT'S BUILT & WORKING
- 3-tab dashboard: Pipeline | Opportunities | Gmail Scan
- Pipeline: filter tabs, KPIs, table with edit modal, standardized status badges
- Opportunities: salary tier tabs, job cards with dismiss/backlog/add-to-pipeline
- Gmail Scan: inbox scan for recruiter activity
- V1 scraper on cron, storing to Supabase `jobs` table

## 🚧 NEXT UP (prioritized)
1. **[HIGH] Test V2 scraper** — run scraper-v2.js endpoints manually, verify LinkedIn + Active Jobs DB return data, then wire into cron.js
2. **[HIGH] Verify cron URL** — confirm GitHub Actions is hitting the right Vercel deployment
3. **[HIGH] Pipeline: expandable rows** — click row to show notes inline
4. **[HIGH] Pipeline: apply_url link** — add posting link column if URL exists
5. **[MEDIUM] Opportunities: expandable recon** — RepVue/gut check collapsed per card
6. **[MEDIUM] Batch email** — one summary email per scraper run, not one per job

## 🔧 TECHNICAL NOTES
- index.html is 1968 lines — use Python/bash for string replacement, not the str_replace tool (path param issues)
- Applications table cols: `app_number`, `company`, `role`, `status`, `date_applied`, `salary_range`, `warm_contact`, `notes`, `apply_url`
- Jobs table cols: `job_id`, `company`, `title`, `source`, `salary`, `base_salary`, `estimated_ote`, `status` (new|backlog|dismissed), `location`, `posted_date`, `apply_url`, `scraped_at`, `gut_check`
- Badge colors: red = Rejected/Role Filled, gray = Auto-Reject/Position Closed/Pass/No Response, blue = Applied, purple = Screening, green = Interviewing

## 💡 MATTHEW'S PREFERENCES
- Tabs not filter buttons, expandable not walls of text
- Dashboard is primary workspace — email is notification only
- Direct, no fluff, fast execution
- AE identity is singular on LinkedIn/cold apps — ops openness only via warm intro
- Challenge don't validate — flag risks before executing
