# SESSION NOTES — Job Odyssey
# This file is the FIRST thing Claude reads every session.
# GitHub is the single source of truth. Supabase is live data. Never reconstruct from docs.
# 🔒 DO NOT read past chat history to fill in context gaps — update this file instead.

## 📅 SESSION TRACKING
- **Last session date:** 2026/05/29
- **Gmail scan from:** `after:2026/05/29`

## 🔗 CRITICAL LINKS
- **Live app:** https://job-search-automation-pink.vercel.app
- **GitHub repo:** https://github.com/mgolia6/job-search-automation
- **Supabase project:** yaepgxsbjtbdkiidxtmf
- **GitHub tokens:**
  - Repo-only: `ghp_dDY5...` (old, still works for non-workflow files)
  - Repo + workflow: in project instructions (use this going forward — expires ~Aug 2026)
- **Vercel project ID:** prj_eXJT6KOWJpytqAfNGXE3nyYCbqUZ

## 📋 SESSION STARTUP — DO THIS EVERY TIME
1. Read SESSION_NOTES.md from GitHub (you're doing it now)
2. Get `Gmail scan from` date and use it for step 3
3. Scan Gmail: `after:[date] (recruiter OR interview OR application OR rejection OR screening)`
4. Query Supabase `applications` table for live pipeline — do NOT use APPLICATION_LOG.md
5. Check `jobs` table: last `scraped_at`, counts by status
6. Report findings, confirm before making changes

## 🗂 FILE MAP
| File | Purpose |
|---|---|
| `public/index.html` | App shell — lean, ~220 lines |
| `public/js/app.js` | Shared state, utilities, tab routing, init |
| `public/js/onboarding.js` | 6-step onboarding flow — NEW |
| `public/js/pipeline.js` | Pipeline tab |
| `public/js/opportunities.js` | Opportunities/scraper tab |
| `public/js/gmail.js` | Gmail scan tab |
| `public/js/ats.js` | ATS engine tab |
| `public/css/styles.css` | All styles including onboarding |
| `api/profile.js` | GET + POST profile endpoint — NEW |
| `api/scraper-v2.js` | Active Jobs DB scraper |
| `api/cron.js` | Calls scraper-v2 |
| `api/data.js` | Supabase read/write for dashboard |
| `api/job-action.js` | Pipeline state changes |
| `api/gmail-scan.js` | Gmail scan endpoint |
| `api/ats-scan.js` | ATS scoring |
| `api/company-recon.js` | RepVue AI + Glassdoor |
| `api/resume.js` | Resume extract/store |

## 🏗 PRODUCT PIVOT (decided May 29, 2026)
**This is no longer Matt's personal job search tool — it's a generalized job seeker app.**

Vision: Career coaches (starting with Erin Lewber) use and endorse it. Beta testers come from her client base.

Core workflow:
1. User onboards → diagnostic questions → resume upload → profile saved
2. Scraper filters pulled from profile (not hardcoded)
3. Job card in Opportunities → one-click "Add to Pipeline + Analyze"
4. ATS analyzer pre-loads JD → outputs tailored resume + cover letter + recruiter message
5. User applies with the output — no friction

## ⚙️ SCHEMA STATE (as of May 29, 2026)
**New tables:**
- `profiles` — user profile, drives scraper filters and all personalization
- `canonical_titles` — 13 job titles with keyword aliases for typeahead

**Modified tables** (all have `user_id uuid` column added):
- `applications`, `jobs`, `resume_master`

**RLS:** enabled on all user-scoped tables. Currently `FOR ALL USING (true)` on profiles — open for pre-auth dev. Will tighten when auth is wired.

**FK constraints:** dropped on user_id columns (pre-auth, stub uuid in use)

**Stub user_id:** `00000000-0000-0000-0000-000000000001` — used until Supabase Auth is wired

## 📊 APPLICATION PIPELINE (live in Supabase)
Query applications table — do not reconstruct here.

**Active warm paths (priority order):**
1. Dataiku — Amanda Walt (#39 Strategic AE East, #40 Enterprise AE)
2. Qualtrics — Saurabh Vaish (#38 RTH, #45 G&S)
3. Onboard — Chris Wisniewski (#44 warm), CRO (Chris Kiene) outreach pending

## ✅ ONBOARDING FLOW (working as of May 29)
6 steps: Name/email → Target roles (typeahead) → Location + remote pref → Comp floor → Resume paste/upload → Review + confirm

- Saves to `profiles` table on finish
- On complete → lands on Pipeline tab
- Known issue: role typeahead category labels — "account_management" fixed to show "Account Manager"
- Stub user_id used for pre-auth testing
- `checkOnboarding()` fires on every load — skips to app if `onboarding_complete = true`

## ⚙️ SCRAPER STATE
- **Jobs table:** 1 job (dismissed) — effectively empty. Scraper yield is broken.
- **Root cause:** NOT yet diagnosed. filterLog was added but no clean test run yet.
- **NEXT SESSION MUST:** trigger manual scraper run → check Vercel logs → read filterLog output → fix yield
- **cron.yml:** still needs update to Mon/Wed/Fri/Sun 13:00 UTC — requires repo+workflow token
- **Rate limit:** 25 req/month on Active Jobs DB — burning on 4x/day cron until fixed

## 🚧 NEXT SESSION — START HERE (prioritized)
1. **[IMMEDIATE] Fix scraper yield** — trigger /api/cron manually, pull Vercel logs, read filterLog, diagnose
2. **[HIGH] Wire scraper filters to profile** — replace hardcoded title/salary filters with profile.target_titles + profile.salary_floor_base
3. **[HIGH] Opportunities → one-click analyze** — "Add to Pipeline + Analyze" button pre-loads JD into ATS engine
4. **[HIGH] Supabase Auth** — magic link email flow, replace stub user_id with real auth
5. **[MEDIUM] Update cron.yml schedule** — Mon/Wed/Fri/Sun 13:00 UTC (needs repo+workflow token)
6. **[MEDIUM] Settings page** — view/edit profile post-onboarding
7. **[MEDIUM] Onboarding: LinkedIn PDF upload** — add as third resume input option

## 🔧 TECHNICAL NOTES
- index.html edits: use Python/bash, not str_replace tool (path issues)
- All API endpoints use raw fetch to Supabase REST (no SDK) — match this pattern
- Supabase env vars: `SUPABASE_URL`, `SUPABASE_KEY` (check if anon or service role — matters for RLS)
- Token expires ~Aug 26, 2026 — remind Matthew to regenerate around Aug 16

## 💡 MATTHEW'S PREFERENCES
- Tabs not filter buttons, expandable not walls of text
- Dashboard is primary workspace — email is notification only
- Direct, no fluff, fast execution
- Challenge don't validate — flag risks before executing
