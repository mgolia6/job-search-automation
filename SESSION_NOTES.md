# SESSION NOTES — Job Odyssey
# This file is the FIRST thing Claude reads every session.
# GitHub is the single source of truth. Supabase is live data. Never reconstruct from docs.

## 📅 SESSION TRACKING
- **Last session date:** 2026/05/29
- **Gmail scan from:** `after:2026/05/29`

## 🔗 CRITICAL LINKS
- **Live app:** https://job-search-automation-pink.vercel.app
- **GitHub repo:** https://github.com/mgolia6/job-search-automation
- **Supabase project:** yaepgxsbjtbdkiidxtmf
- **GitHub tokens:** stored in userMemories and project instructions
  - Repo-only token: `ghp_dDY5...` (use for non-workflow files)
  - Repo + workflow token: in project instructions (use for cron.yml — expires ~Aug 2026)
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
| `public/index.html` | Lean shell — 213 lines (refactored May 29) |
| `public/css/styles.css` | All styles — 800 lines, deduplicated |
| `public/js/app.js` | Init, shared state, loadData, switchTab, toast, scraper trigger |
| `public/js/pipeline.js` | Pipeline render, rows, expandable, modal |
| `public/js/opportunities.js` | Job cards, recon, dismiss modal, job actions |
| `public/js/gmail.js` | Gmail scan tab |
| `public/js/ats.js` | Full ATS engine |
| `api/scraper-v2.js` | ✅ ACTIVE scraper — Active Jobs DB, single call, correct field mapping |
| `api/cron.js` | ✅ Updated — calls scraper-v2.js |
| `api/job-action.js` | Pipeline actions (add, dismiss, backlog) |
| `api/data.js` | Data API for dashboard |
| `api/gmail-scan.js` | Gmail scan endpoint |
| `.github/workflows/cron.yml` | ⚠️ STILL PENDING — needs schedule update + repo+workflow token |

## ⚙️ SCRAPER STATE (updated May 29, 2026)
- **V2 (Active Jobs DB):** ✅ deployed and wired into cron.js — fired overnight May 28-29
- **Last scraped:** 2026-05-29 00:58:59 UTC
- **Jobs in DB:** 1 new (39 total — need to verify counts with null status)
- **Rate limit:** 25 requests/month — cron.yml still fires 4x daily (too many)
- **cron.yml PENDING:** needs update to `0 13 * * 1,3,5,0` (Mon/Wed/Fri/Sun 9am ET)
  - Requires repo+workflow token — read from project instructions next session

## 📊 APPLICATION PIPELINE (live in Supabase — 46 apps as of May 29, 2026)

**Status taxonomy (em dashes throughout):**
- `Applied` — active, waiting (11)
- `Screening` / `Interviewing` — in process
- `Closed — Rejected` — reached interviews, human said no (2)
- `Closed — Role Filled` — went to someone else (1)
- `Closed — Auto-Reject` — ATS screen (24)
- `Closed — Position Closed` — posting pulled (3)
- `Closed — No Response` — went silent
- `Closed — Pass` — Matthew withdrew (5)

**Active (Applied):**
#23 Microsoft Sr AE | #28 Smartsheet Strategic AE | #29 Asana Enterprise AE | #34 Rippling Enterprise AE | #36 Ema Enterprise AE | #38 Qualtrics RTH | #39 Dataiku Strategic AE East | #40 Dataiku Enterprise AE | #42 Onboard Strategic AE | #44 Onboard Strategic AE (warm) | #45 Qualtrics G&S

**Warm paths (priority order):**
1. Dataiku — Amanda Walt driving referral (highest priority)
2. Qualtrics — Saurabh Vaish (#38 RTH + #45 G&S active)
3. Onboard — Chris Wisniewski warm, CRO (Chris Kiene) outreach pending

## 🏗 WHAT'S BUILT & WORKING
- Refactored frontend — index.html split into CSS + 5 JS modules (May 29)
- 4-tab dashboard: Pipeline | Opportunities | Gmail Scan | ATS Engine
- Pipeline: KPIs, filter sub-tabs, expandable rows (notes + apply_url), edit modal
- Opportunities: salary tier sub-tabs, job cards, recon toggle, dismiss modal
- ATS Engine: JD paste → keyword score → RepVue → tailored resume (on-demand)
- V2 scraper deployed and firing

## 🚧 NEXT SESSION — START HERE (prioritized)
1. **[IMMEDIATE]** Read repo+workflow token from project instructions → push cron.yml schedule fix (`0 13 * * 1,3,5,0`)
2. **[IMMEDIATE]** Verify live app loads correctly after refactor — open https://job-search-automation-pink.vercel.app and check all 4 tabs
3. **[HIGH]** Wire RapidAPI `/api/analyze/generate-optimized-resume` to replace Claude rewrite in ats.js
4. **[HIGH]** Server-side normalization of RepVue fields in ats-scan.js (quota attainment returns [object Object] sometimes)
5. **[MEDIUM]** Diff highlighting in tailored resume pane (changed lines marked green/red)
6. **[MEDIUM]** Glassdoor check fix — button exists but API not working
7. **[MEDIUM]** Batch email verify — one email per scraper run, check it fires

## 🔧 TECHNICAL NOTES
- Frontend is now modular — edit individual JS files, not the monolith
- Script load order in index.html: app.js → pipeline.js → opportunities.js → gmail.js → ats.js
  (app.js must be first — it defines APPS, JOBS, shared utils)
- Bug fixed: `addToApplied()` was calling `loadPipeline()` (undefined) → now calls `loadData()`
- Bug fixed: `atsKpiCard()` was using `.kpi-value` class → now uses `.kpi-num` (matches CSS)
- Bug fixed: `.card` class was undefined → now defined in styles.css
- Duplicate `.filter-btn` definitions merged into one
- Duplicate spinner class merged into one `.spinner`
- Applications table: `app_number`, `company`, `role`, `status`, `date_applied`, `salary_range`, `warm_contact`, `notes`, `apply_url`
- Jobs table: `job_id`, `company`, `title`, `source`, `salary`, `base_salary`, `estimated_ote`, `status` (new|backlog|dismissed), `location`, `posted_date`, `apply_url`, `scraped_at`, `gut_check`

## 💡 MATTHEW'S PREFERENCES
- Tabs not filter buttons, expandable not walls of text
- Dashboard is primary workspace — email is notification only
- Direct, no fluff, fast execution
- AE identity is singular on LinkedIn/cold apps — ops openness only via warm intro
- Challenge don't validate — flag risks before executing
- Token expires ~Aug 26, 2026 — remind Matthew to regenerate around Aug 16
