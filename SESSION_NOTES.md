# SESSION NOTES — Job Odyssey
# This file is the FIRST thing Claude reads every session.
# GitHub is the single source of truth. Supabase is live data. Never reconstruct from docs.

## 📅 SESSION TRACKING
- **Last session date:** 2026/05/28
- **Gmail scan from:** `after:2026/05/28`

## 🔗 CRITICAL LINKS
- **Live app:** https://job-search-automation-pink.vercel.app
- **GitHub repo:** https://github.com/mgolia6/job-search-automation
- **Supabase project:** yaepgxsbjtbdkiidxtmf
- **GitHub tokens:** stored in userMemories and project instructions
  - Repo-only token: `ghp_dDY5...` (old, still works for non-workflow files)
  - Repo + workflow token: in project instructions (new, use this going forward — expires ~Aug 2026)
- **Vercel project ID:** prj_eXJT6KOWJpytqAfNGXE3nyYCbqUZ

## 📋 SESSION STARTUP — DO THIS EVERY TIME
1. Read SESSION_NOTES.md from GitHub (you're doing it now)
2. From SESSION_NOTES.md, get the `Gmail scan from` date and use it for step 3
3. Scan Gmail: `after:[date from SESSION_NOTES] (recruiter OR interview OR application OR rejection OR screening)`
4. Query Supabase `applications` table for live pipeline — do NOT use APPLICATION_LOG.md
5. Check `jobs` table: last `scraped_at`, counts by status
6. Report findings, confirm before making changes

## 🗂 FILE MAP
| File | Purpose |
|---|---|
| `public/index.html` | Entire frontend — 1968 lines |
| `api/scraper-v2.js` | ✅ ACTIVE scraper — Active Jobs DB, single call, correct field mapping |
| `api/scraper-jsearch.js` | Old V1 scraper — deprecated, do not use |
| `api/cron.js` | ✅ Updated — now calls scraper-v2.js |
| `api/job-action.js` | Pipeline actions (add, dismiss, backlog) |
| `api/data.js` | Data API for dashboard |
| `api/gmail-scan.js` | Gmail scan endpoint |
| `.github/workflows/cron.yml` | ⚠️ NEEDS UPDATE — still on old schedule, requires repo+workflow token to edit |

## ⚙️ SCRAPER STATE (updated May 28, 2026)
- **V2 (Active Jobs DB):** ✅ deployed and wired into cron.js — NOT YET TESTED live
- **API:** `active-ats-24h` endpoint, single call
- **Title filter:** `'enterprise account executive' | 'strategic account executive'`
- **Location filter:** `"United States"` (no remote filter — too many false negatives)
- **Rate limit:** 25 requests/month — currently cron fires 4x daily (too many)
- **cron.yml PENDING:** needs update to Mon/Wed/Fri/Sun 13:00 UTC (~16/month)
  - Requires repo+workflow token — read from project instructions next session and push immediately
- **Jobs in DB:** 39 total (11 new, 28 dismissed) as of May 28

## 📊 APPLICATION PIPELINE (live in Supabase — 46 apps as of May 28, 2026)

**Status taxonomy (standardized May 28, 2026 — em dashes throughout):**
- `Applied` — active, waiting (11)
- `Screening` / `Interviewing` — in process
- `Closed — Rejected` — reached interviews, human said no (2: #5 Mastercard, #16 Salesforce)
- `Closed — Role Filled` — human confirmation, went to someone else (1: #18 Twilio)
- `Closed — Auto-Reject` — ATS screen, never reached human (24)
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
- Pipeline: filter tabs, KPIs, table with edit modal
- Status badges: red = Rejected/Role Filled, gray = Auto-Reject/Position Closed/Pass, blue = Applied
- Opportunities: salary tier tabs, job cards with dismiss/backlog/add-to-pipeline
- Gmail scan tab working
- V2 scraper deployed, cron.js updated — awaiting first live test

## 🚧 NEXT SESSION — START HERE (prioritized)
1. **[IMMEDIATE] Read repo+workflow token from project instructions → store to userMemories**
2. **[IMMEDIATE] Push cron.yml** — change schedule to `0 13 * * 1,3,5,0` (Mon/Wed/Fri/Sun 9am ET)
3. **[IMMEDIATE] Trigger manual scraper test** — hit /api/cron, check Vercel logs, verify jobs land in Supabase
4. **[HIGH] Pipeline: expandable rows** — click row to show notes inline
5. **[HIGH] Pipeline: apply_url link** — add posting link if URL exists in applications table
6. **[MEDIUM] Glassdoor health check** — button exists in UI but API not working, needs fix
7. **[MEDIUM] ATS resume screener** — new workflow: paste JD → score against master resume
8. **[MEDIUM] Opportunities: expandable recon** — RepVue/gut check collapsed per card
9. **[MEDIUM] Batch email** — already built in v2 (one email per run), verify it works

## 🔧 TECHNICAL NOTES
- index.html is 1968 lines — use Python/bash for edits, not str_replace tool (path issues)
- Applications table: `app_number`, `company`, `role`, `status`, `date_applied`, `salary_range`, `warm_contact`, `notes`, `apply_url`
- Jobs table: `job_id`, `company`, `title`, `source`, `salary`, `base_salary`, `estimated_ote`, `status` (new|backlog|dismissed), `location`, `posted_date`, `apply_url`, `scraped_at`, `gut_check`
- V2 scraper filters: blocks staffing agencies by org name, blocks Jobgether by source, US country filter, $150K base floor
- Salary extraction: uses `salary_raw.value` first, falls back to description text regex
- Already-applied filter: re-enabled in V2 (checks both `jobs` table IDs and `applications` company names)
- Email: one summary email per run (not per job) — subject includes count and date

## 💡 MATTHEW'S PREFERENCES
- Tabs not filter buttons, expandable not walls of text
- Dashboard is primary workspace — email is notification only
- Direct, no fluff, fast execution
- AE identity is singular on LinkedIn/cold apps — ops openness only via warm intro
- Challenge don't validate — flag risks before executing
- Token expires ~Aug 26, 2026 — remind Matthew to regenerate around Aug 16
