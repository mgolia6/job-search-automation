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
- **Vercel project:** prj_eXJT6KOWJpytqAfNGXE3nyYCbqUZ
- **GitHub tokens:**
  - Repo-only: `ghp_dDY5...` (works for non-workflow files)
  - Repo + workflow: in project instructions (use this going forward — expires ~Aug 2026)

## 📋 SESSION STARTUP — DO THIS EVERY TIME
1. Read SESSION_NOTES.md from GitHub (you're doing it now)
2. Query Supabase for table list — confirm schema hasn't drifted
3. Check last Vercel deployment status
4. Report build state in 5 lines or less, ask for direction before touching anything

## 🗂 FILE MAP
| File | Purpose |
|---|---|
| `public/index.html` | App shell |
| `public/js/app.js` | Shared state, utilities, tab routing, init |
| `public/js/onboarding.js` | 6-step onboarding flow |
| `public/js/pipeline.js` | Pipeline tab |
| `public/js/opportunities.js` | Opportunities/scraper tab |
| `public/js/gmail.js` | Gmail scan tab |
| `public/js/ats.js` | ATS engine tab |
| `public/css/styles.css` | All styles including onboarding |
| `api/profile.js` | GET + POST profile endpoint |
| `api/scraper-v2.js` | Active Jobs DB scraper |
| `api/cron.js` | Calls scraper-v2 |
| `api/data.js` | Supabase read/write for dashboard |
| `api/job-action.js` | Pipeline state changes |
| `api/gmail-scan.js` | Gmail scan endpoint |
| `api/ats-scan.js` | ATS scoring |
| `api/company-recon.js` | RepVue AI + Glassdoor |
| `api/resume.js` | Resume extract/store |

## 🏗 PRODUCT DIRECTION
Generalized job seeker app — not Matt's personal tool.
Target distribution: career coaches (starting with Erin Lewber) who endorse it and supply beta testers.

Core workflow:
1. User onboards → diagnostic questions → resume upload → profile saved
2. Scraper filters pulled from user profile (not hardcoded)
3. Job card → one-click "Add to Pipeline + Analyze" → ATS pre-loads JD
4. Output: tailored resume + cover letter + recruiter message
5. User applies — no friction

## ⚙️ SCHEMA STATE
**Tables:** applications, jobs, resume_master, company_recon, company_health, email_alerts, profiles, canonical_titles

**profiles:** user_id (stub: 00000000-0000-0000-0000-000000000001), full_name, email, target_titles[], target_industries[], target_locations[], remote_preference, salary_floor_base, salary_floor_ote, seniority_level, resume_text, onboarding_complete

**canonical_titles:** 13 job titles with keyword aliases for typeahead

**RLS:** enabled on all user-scoped tables. profiles policy is FOR ALL USING (true) — open for pre-auth dev
**FK constraints:** dropped on user_id columns — stub uuid in use until auth is wired
**user_id added to:** applications, jobs, resume_master

## ✅ ONBOARDING FLOW (working)
6 steps: Name/email → Target roles (typeahead against canonical_titles) → Location + remote pref → Comp floor → Resume paste/upload → Review + confirm

- Saves to profiles table via /api/profile POST
- On complete → lands on Pipeline tab
- checkOnboarding() fires on every load — skips to app if onboarding_complete = true
- Stub user_id used for pre-auth testing
- Known minor issue: role typeahead category labels (account_management fixed, others may need review)

## ⚙️ SCRAPER STATE
- **cron.yml:** ✅ DONE — schedule updated to Mon/Wed/Fri/Sun 13:00 UTC, workflow token confirmed working
- **Jobs table:** low yield — scraper running but returning near-zero results
- **Next action:** fix scraper yield — trigger /api/cron manually, pull Vercel logs, read filterLog output

## 📁 DEPRECATED FILES — IGNORE
- STATUS.md — tombstoned, redirects to SESSION_NOTES.md
- APPLICATION_LOG.md — ignore
- PROJECT_INSTRUCTIONS.md — rebuilt as lean startup/close protocol doc, not a state file

## 🚧 NEXT SESSION — START HERE (prioritized)
1. **[IMMEDIATE] Fix scraper yield** — trigger /api/cron manually, pull Vercel logs, read filterLog, diagnose and fix
2. **[HIGH] Wire scraper filters to profile** — replace hardcoded title/salary filters with profile values
3. **[HIGH] One-click analyze** — Opportunities card → pre-loads JD into ATS engine
4. **[HIGH] Supabase Auth** — magic link email, replace stub user_id with real auth
5. **[MEDIUM] Settings page** — view/edit profile post-onboarding
6. **[MEDIUM] Greenhouse + Ashby APIs** — additional job sourcing

## 🔧 TECHNICAL NOTES
- index.html edits: use Python/bash, not str_replace tool
- All API endpoints use raw fetch to Supabase REST — no SDK, match this pattern
- Token expires ~Aug 26, 2026 — remind Matthew to regenerate around Aug 16
