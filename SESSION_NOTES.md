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
  - Repo-only token: `ghp_dDY5...` (old, still works for non-workflow files)
  - Repo + workflow token: in project instructions (new, use this going forward — expires ~Aug 2026)
- **Vercel project ID:** prj_eXJT6KOWJpytqAfNGXE3nyYCbqUZ

## ⚠️ CRITICAL: SESSION STARTUP — DO THIS EVERY TIME IN ORDER

### Step 1 — Read SESSION_NOTES.md via GitHub API (NOT raw URL)
```
GET https://api.github.com/repos/mgolia6/job-search-automation/contents/SESSION_NOTES.md
Authorization: token [repo+workflow token — stored in Claude project instructions]
```
Decode base64 `content` field. **Do NOT use raw.githubusercontent.com** — it caches aggressively and will serve stale content. The API endpoint always returns the current blob.

### Step 2 — Query Supabase for live state
- `applications` table: current pipeline
- `jobs` table: count by status, last `scraped_at`

### Step 3 — Check Vercel last deployment status

### Step 4 — Scan Gmail
Use the `Gmail scan from` date above: `after:2026/05/29 (recruiter OR interview OR application OR rejection OR screening)`

### Step 5 — Report in 5 lines or less, ask for direction before touching anything

## 🗂 FILE MAP
| File | Purpose |
|---|---|
| `public/index.html` | Entire frontend shell — tabs, modals, auth screen div, script load order |
| `public/js/auth.js` | ✅ NEW — Supabase Auth session management, login/signup UI, getAuthHeaders() |
| `public/js/onboarding.js` | Profile setup flow — uses real session user (STUB_USER_ID removed) |
| `public/js/app.js` | Shared state, data fetch, tab switching — all fetches now auth-gated |
| `public/js/pipeline.js` | Pipeline tab render |
| `public/js/opportunities.js` | Leads tab render |
| `public/js/gmail.js` | Gmail scan tab |
| `public/js/ats.js` | ATS engine tab |
| `api/auth.js` | ✅ NEW — verifyUser(req) helper used by all protected routes |
| `api/scraper-v2.js` | ✅ ACTIVE — profile-driven filters, dedup via job_id + applications table |
| `api/cron.js` | ✅ Calls scraper-v2.js — schedule updated to Mon/Wed/Fri/Sun 13:00 UTC (~16/month) ✅ DONE |
| `api/job-action.js` | ✅ Auth-gated — dismiss/backlog/add_to_pipeline, scoped by user_id |
| `api/data.js` | ✅ Auth-gated — returns applications + jobs scoped to user |
| `api/profile.js` | ✅ Auth-gated — GET/POST profile, uses JWT not query param |
| `api/gmail-scan.js` | Gmail scan endpoint |
| `api/ats-scan.js` | ATS scoring endpoint |

## ⚙️ SCRAPER STATE
- **V2 (Active Jobs DB):** ✅ deployed, profile-driven, cron wired
- **Profile-driven filters:** pulls target_titles, salary_floor_base, remote_preference from profiles table at runtime
- **Dedup:** job_id only — also checks applications.job_id to prevent resurface of applied roles
- **Rate limit:** 25 req/month on Active Jobs DB (RapidAPI) — cron fires 16x/month (Mon/Wed/Fri/Sun)
- **Jobs table:** 1 row (Docusign, dismissed) — 38 rows were wiped, clean slate is fine
- **cron.yml schedule:** ✅ updated to `0 13 * * 1,3,5,0` (Mon/Wed/Fri/Sun 13:00 UTC) — DONE
- **Scraper NOT yet live-tested** — still pending first manual trigger post-auth

## 🔐 AUTH STATE (as of May 29, 2026)
- **Supabase Auth:** enabled, using built-in email/password + magic link
- **Anon key (correct):** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhZXBneHNianRiZGtpaWR4dG1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNzI4MjksImV4cCI6MjA5NDk0ODgyOX0.UXNAz76lwghgFuC9QLsuVEPq6Njoq1nwLLkEsOQXl0U`
- **Session flow:** initAuth() → check localStorage → verify token → onAuthenticated() → checkOnboarding() → loadData()
- **All API routes gated:** profile, data, job-action — all require Bearer JWT, return 401 if missing
- **RLS policies:** jobs_own, applications_own, resume_master_own all enforce auth.uid() = user_id
- **profiles RLS:** fixed — was open (qual: true), now enforces auth.uid() = user_id
- **STUB_USER_ID removed** from onboarding.js — replaced with window.SESSION_USER.id
- **Script load order:** auth.js → onboarding.js → app.js (critical — auth.js must be first)
- **⚠️ NOT YET TESTED** — Matthew to test on next session
- **⚠️ Check Supabase Auth settings:** disable email confirmation for testing, re-enable before real users

## 🚧 KNOWN ISSUES / NEXT SESSION START HERE
1. **[IMMEDIATE] Test auth flow** — create account, confirm login works, confirm onboarding runs for new user
2. **[IMMEDIATE] Test scraper** — hit /api/cron after auth works, check Vercel logs, verify jobs land in Supabase
3. **[HIGH] Remaining API routes to auth-gate:** ats-scan.js, gmail-scan.js, resume.js, company-recon.js, cron.js — none of these verify user yet
4. **[HIGH] Header hardcodes "Matthew Golia"** — should pull from session user profile name once auth confirmed working
5. **[HIGH] Pipeline expandable rows** — click row to show notes inline
6. **[HIGH] apply_url link** — show posting link in pipeline if URL exists
7. **[MEDIUM] Glassdoor health check** — button exists but API not working
8. **[MEDIUM] Opportunities/Leads expandable recon** — RepVue/gut check collapsed per card
9. **[MEDIUM] Batch email verify** — one email per run, confirm it works
10. **[LATER] Per-user scraper trigger** — currently scraper uses hardcoded PROFILE_ID, needs to accept user_id param for true multi-user

## 📊 APPLICATION PIPELINE (live in Supabase — 46 apps, user_id NULL on legacy rows)
**RLS note:** Legacy rows have user_id = NULL — policy allows `auth.uid() = user_id OR user_id IS NULL` so they're visible to all authenticated users for now. Will need migration strategy before multi-user goes live.

**Status taxonomy:**
- `Applied` — active, waiting (11)
- `Closed — Rejected` (2: #5 Mastercard, #16 Salesforce)
- `Closed — Role Filled` (1: #18 Twilio)
- `Closed — Auto-Reject` (24)
- `Closed — Position Closed` (3)
- `Closed — Pass` (5)

**Active (Applied):**
#23 Microsoft Sr AE | #28 Smartsheet Strategic AE | #29 Asana Enterprise AE | #34 Rippling Enterprise AE | #36 Ema Enterprise AE | #38 Qualtrics RTH | #39 Dataiku Strategic AE East | #40 Dataiku Enterprise AE | #42 Onboard Strategic AE | #44 Onboard Strategic AE (warm) | #45 Qualtrics G&S

**Warm paths (priority order):**
1. Dataiku — Amanda Walt driving referral (highest priority)
2. Qualtrics — Saurabh Vaish (#38 RTH + #45 G&S active)
3. Onboard — Chris Wisniewski warm, CRO (Chris Kiene) outreach pending

## 🏗 WHAT'S BUILT & WORKING
- Supabase Auth — login/signup UI, session management, JWT flow
- 3-tab dashboard: Pipeline | Leads | Gmail Scan
- Pipeline: filter tabs, KPIs, table with edit modal
- Leads (renamed from Opportunities): scraper feed, dismiss/backlog/add-to-pipeline
- Gmail scan tab
- ATS Engine — paste JD, score fit, keyword gap, tailored resume generation
- Onboarding flow — multi-step profile setup, resume upload
- V2 scraper — profile-driven, deployed, not yet live-tested
- Applications schema: added job_id, apply_url, ats_score, ats_missing_keywords columns
- Nav: removed duplicate scraper button from header

## 🔧 TECHNICAL NOTES
- **SESSION_NOTES must be read via GitHub API** — raw.githubusercontent.com caches aggressively and serves stale content. Always use: `GET https://api.github.com/repos/mgolia6/job-search-automation/contents/SESSION_NOTES.md` with auth header, then base64-decode the `content` field.
- **Auth pattern:** Frontend gets JWT via Supabase REST auth endpoints directly (no JS SDK) → stores in localStorage → passes as Bearer token on all API calls → server verifies via supabase.auth.getUser(token)
- **Multi-user architecture decision:** Building for multi-user from the start — no single-user shortcuts
- **Legacy data:** 46 applications have user_id = NULL — visible to all auth'd users via RLS OR clause, needs cleanup before launch
- **Applications schema:** app_number, company, role, status, date_applied, salary_range, resume_version, cl_version, source, warm_contact, recruiter, notes, job_id (new), apply_url (new), ats_score (new), ats_missing_keywords (new), user_id
- **Jobs schema:** job_id, company, title, source, salary, base_salary, estimated_ote, status, location, posted_date, apply_url, scraped_at, gut_check, user_id, ats_score, ats_missing_keywords, ats_analyzed_at, justification
- **Supabase anon key updated** — old key in auth.js was wrong, corrected to current key from get_publishable_keys
- **RLS advisory:** company_health, email_alerts, company_recon, canonical_titles have RLS disabled — low risk, non-core tables, flag before launch
- **Vercel ERROR state on old deployments** = normal when multiple commits push in rapid succession, last one wins
- index.html is ~11K chars — use Python/bash for edits, not str_replace tool
- Token expires ~Aug 26, 2026 — remind Matthew to regenerate around Aug 16

## 🏢 PRODUCT VISION
- **Multi-user SaaS** — not a personal tool, building for scale from day one
- **Target user:** job seeker with a resume and no target company list — needs discovery, not monitoring
- **Discovery layer:** Active Jobs DB (RapidAPI) — 25 req/month free tier, each call returns up to 250 jobs. 16 cron fires/month = tight but workable. Paid tier when revenue warrants.
- **Cron = post-launch feature** — will surface as "coming soon" at launch, manual scrape trigger is the v1
- **Public ATS APIs** (Greenhouse, Lever, Ashby) = future monitoring layer for target companies, not MVP
- **API limits (current):** Active Jobs DB 25 req/month | Resend 3k/month 100/day | Gmail API 1B units/day | Anthropic no free tier, tier-based spend limits

## 💡 MATTHEW'S PREFERENCES
- Tabs not filter buttons, expandable not walls of text
- Dashboard is primary workspace — email is notification only
- Direct, no fluff, fast execution
- AE identity is singular on LinkedIn/cold apps — ops openness only via warm intro
- Challenge don't validate — flag risks before executing
- Token expires ~Aug 26, 2026 — remind Matthew to regenerate around Aug 16

## 🎨 BRAND COPY — SCRATCH PAD
- **Current tagline (placeholder):** "Your search. Charted."
- **Candidate tagline:** "Let the search for your next career be epic in all the right ways"
- **Logo direction:** B1 — compass rose (4-point star, N point accented, dashed orbit ring)
- **Spinner:** Compass rose oscillation (needle-seeking animation)
- Logo also doubles as loading spinner — brand coherence intentional

---
## SESSION UPDATE — 2026/05/30

### What was built this session
- Full design system overhaul: dark navy header, amber accent, light body, compass rose logo
- Single slim topbar: compass mark left, tabs centered, avatar right
- Gmail tab removed from nav (hidden, not deleted)
- Profile pane: photo, contact (phone formatted, zip code), about me (career summary, looking for, working style), skills/keywords chips, resume section
- Resume upload in profile: confirms before replacing, re-parses, auto-saves, re-renders skills
- Auth screen redesigned: compass mark, "Your search. Charted." tagline, forgot password flow
- Onboarding redesigned: intent cards, resume upload with 3-check status, inferred career summary + looking_for editable on step 3, skip path
- ATS resume source fixed: pulls from profile resume_text not resume_master table

### Critical bugs fixed this session
- **Wrong Claude model string** (`claude-sonnet-4-20250514` → `claude-sonnet-4-6`) — was silently failing every resume parse, skills never populated. THIS IS THE ROOT CAUSE of the skills issue.
- Recursive `spinnerHTML()` stub was crashing all JS
- Unescaped apostrophe in onboarding.js was killing JS parse
- `profFieldPhone` missing from profile.js — `ReferenceError` on profile open
- `openProfile()` function defined locally but never pushed to GitHub
- Dropdown event bubbling: click opened then immediately closed dropdown
- Profile dropdown was outside header — positioned off-screen
- `restoreTab()` firing before auth/data loaded — blank page on hard refresh
- Double tab bar: old tabs div in `<main>` never removed
- Cron hitting 401 — still needs fix (see known issues)

### Current state
- Profile pane: WORKING — skills, keywords, about me all populate from resume
- Auth: WORKING — login, signup, forgot password
- Onboarding: WORKING — 4 steps, resume upload, Claude inference
- Pipeline: WORKING
- Leads/scraper: UI works, scraper cron hitting 401 (manual trigger broken)
- ATS Engine: WORKING — uses profile resume_text

### Known issues / next priorities
1. **[BLOCKING] Cron 401** — scraper manual trigger fails with 401. cron.js auth fix didn't work
2. **[HIGH] Resume dissection view** — "My resume" should show keyword highlights, strengths/gaps analysis, not just upload. Separate from profile settings.
3. **[HIGH] Profile skills not showing** until resume replaced — existing users need a "refresh skills" trigger
4. **[HIGH] Photo upload** — stores as base64 dataURL in photo_url. Works but large. Consider Supabase storage for real users.
5. **[MEDIUM] Pipeline data not loading** — need to verify 46 legacy apps show correctly with new auth
6. **[MEDIUM] Leads tab** — scraper needs cron fix before useful
7. **[LOW] Logo** — compass mark direction chosen (B1), still needs refinement
8. **[LOW] Tagline** — "Your search. Charted." is placeholder. Candidate: "Let the search for your next career be epic in all the right ways"

### Standing rules (critical)
- **ALWAYS syntax check every JS file before pushing**: `node --check /tmp/file.js`
- **ALWAYS fetch live deployed file to verify push landed**: `Vercel:web_fetch_vercel_url`
- **ALWAYS check browser console error FIRST before guessing**
- **ALWAYS get fresh SHA before PUT to GitHub**
- **Model string for Claude API calls**: `claude-sonnet-4-6`
