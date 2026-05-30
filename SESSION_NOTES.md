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

### Leads tab KPI fix (next session)
Current KPIs are hardcoded ("300K+ roles available" etc) — meaningless.
Replace with live counts from the jobs table:
- **Scraped** — total jobs in table for this user
- **New** — status = 'new', not yet actioned
- **Added to pipeline** — status = 'added'
- **Dismissed** — status = 'dismissed'
- **Backlogged** — status = 'backlog'
KPIs should query Supabase jobs table live, scoped to user_id.

### Final session fixes (end of May 30 session)
- Leads KPIs: now live counts — New Leads / Added This Week / Avg OTE / Added to Pipeline / Dismissed
- Filter bar: shows active profile filters (titles, base min, OTE min, remote, locations) above KPIs
- "Run Now" renamed to "Generate Leads" with sparkle icon
- triggerScraper: now surfaces actual error message from 500 response in toast
- scraper-v2: title casing fixed (was lowercase, now properly cased for RapidAPI)
- scraper-v2: dropped hardcoded PROFILE_ID, uses x-user-id from cron.js

### SCRAPER STATUS — still not confirmed working
Cron returns 500 but error message now surfaces in toast.
FIRST THING next session: hit Generate Leads, read the toast error, fix from there.
**VERIFY: RAPIDAPI_KEY is set in Vercel env vars** (Settings → Environment Variables)
If missing, that's the whole problem.

### Next session priorities (in order)
1. Confirm scraper works or fix based on toast error
2. Resume dissection view — keyword highlights, strengths/gaps (separate from profile)
3. Leads → ATS flow: one-click send scraped job to ATS engine
4. Profile skills refresh trigger for existing users
5. Photo upload — consider Supabase storage vs base64 dataURL

### Gmail scan from next session
after:2026/05/30 (recruiter OR interview OR application OR rejection OR screening)


---
## SESSION UPDATE — 2026/05/30 (session 2)

### Gmail scan from next session
after:2026/05/30 (recruiter OR interview OR application OR rejection OR screening)

### What was fixed this session
- **Root cause 1 — RLS blocking scraper:** `SUPABASE_KEY` was anon key, so server-side profile query returned 0 rows. Fixed by adding `SUPABASE_SERVICE_KEY` (service role) to Vercel env vars and updating scraper to use it.
- **Root cause 2 — Date objects:** `posted_date` and `scraped_at` were passing raw JS Date objects to Supabase insert → "cannot coerce object to single json packet". Fixed with `.toISOString()`.
- **Root cause 3 — Wrong title filter param:** Was using `title_filter` with pipe/OR syntax that doesn't work on that param. Confirmed via RapidAPI console that `title_filter` takes plain text. Switched to `advanced_title_filter` with single-quote pipe syntax: `'Enterprise Account Executive' | 'Strategic Account Executive'`.
- **Root cause 4 — Hard remote filter:** `remoteOnly: true` was dropping all jobs where `remote_derived === false`. Too aggressive for 24h window. Removed hard filter — remote is now a tag, not a gate.
- **Profile titles updated in Supabase:** `["Enterprise Account Executive", "Strategic Account Executive", "Senior Account Executive"]`
- **RapidAPI quota hit 100%** from test calls this session — resets tomorrow.

### Scraper current state
- `advanced_title_filter` with `'Enterprise Account Executive' | 'Strategic Account Executive' | 'Senior Account Executive'`
- No hard remote filter — jobs tagged remote/not-remote but all pass through
- Service role key in use — RLS bypassed for server-side queries
- **NOT YET CONFIRMED WORKING** — quota exhausted before final test

### Next session priorities (in order)
1. **[IMMEDIATE] Test scraper** — quota resets, hit Generate Leads, confirm `raw > 0`
2. If `raw: 0` still → fall back to plain `title_filter: Account Executive` (confirmed working in RapidAPI console)
3. If `advanced_title_filter` works → keep it, update profile titles via UI
4. Resume dissection view — keyword highlights, strengths/gaps
5. Leads → ATS one-click flow
6. Profile skills refresh trigger for existing users

### Standing rules (do not forget)
- ALWAYS syntax check JS before pushing: `node --check /tmp/file.js`
- ALWAYS fetch live deployed file to verify push landed
- ALWAYS get fresh SHA before PUT to GitHub
- Model string for Claude API calls: `claude-sonnet-4-6`
- RapidAPI quota: 25 req/month, resets monthly — be conservative with test calls


---
## SESSION UPDATE — 2026/05/30 (session 3)

### Gmail scan window for next session
after:2026/05/30

### CRITICAL DEPLOY ISSUE — READ FIRST
Vercel webhook stopped auto-deploying mid-session. Many commits pushed to GitHub never deployed. Last confirmed deployed commit: `6e747ec27d` (margin-top fix). Everything after that is in GitHub but NOT live on Vercel. Force deploy by pushing any commit — Vercel will pick up HEAD which includes all pending changes.

**Commits NOT yet confirmed deployed (in order):**
1. `e94566a3fa` — JD collapsed view, lazy fetch, score reuse cached JD
2. `583e4938fd` — Date objects to ISO strings in job-action
3. `ca7845773a` — include dismissed jobs in data fetch
4. `d54c1720a1` — auth header in jobAction fetch
5. `abf3c747fb` — Score → ATS button on lead cards
6. `1ac67c4f36` — fetch_jd action in ats-scan.js
7. `a988f3d676` — recon card verdict dot, summary, links
8. `a975aa5b9a` — @anthropic-ai/sdk in package.json
9. `adf1342fba` — dismissed tab count, JD debug logging
10. `e7a3edb58a` — job-action: service role key, status=added, RLS with_check
11. `c2fd90b683` — Adzuna OTE fix (salary_max=OTE not base)
12. `8128abc133` — ATS history side panel
13. `0cdd513c45` — Job Odyssey wordmark in header
14. `4d99b51093` — enrich-backfill.js endpoint
15. `a80da43508` — Greenhouse/Lever/Ashby enrichment + remove truncation
16. `ed1b734a5c` — JD toggle source badge, description fallback
17. `9b44adbfc8` — description in insert, Lever lists parsing
18. `81c3520b3b` — max_days_old 1 (24 hours)
19. `0e97d6f023` — force deploy trigger

### What was built this session
- **Adzuna scraper** — fully working, returns 38-58 jobs per run, 24h window
- **Service role key** — added SUPABASE_SERVICE_KEY to Vercel, all server-side ops use it
- **OTE fix** — Adzuna salary_max is OTE not base, stopped doubling
- **Greenhouse/Lever/Ashby enrichment** — runs at scrape time, ~15-20% hit rate
- **JD toggle** — collapsed view on cards with source badge (greenhouse/lever/adzuna)
- **ATS History panel** — side panel with run log, score breakdown, missing keywords
- **Score → ATS button** — on lead cards, fetches JD, scores, stores to ats_runs
- **enrich-backfill endpoint** — POST /api/enrich-backfill to retroactively enrich existing jobs
- **ats_runs table** — created in Supabase with RLS
- **jd_source + full_description columns** — added to jobs table
- **Job Odyssey wordmark** — in header next to compass logo
- **Dismissed tab count** — shows number
- **Auth header** — added to jobAction fetch (was causing Unauthorized on dismiss/pipeline)
- **status=added** — pipeline action now sets added not dismissed
- **RLS with_check** — fixed on applications table

### Known issues going into next session
1. **Deploy not confirmed** — most fixes above may not be live. Verify by checking KPI bar shows wordmark and dismissed count
2. **Add to Pipeline broken** — auth fix pushed but may not be deployed
3. **ATS history not logging** — SESSION_USER not set on window; ats_runs insert has no user_id
4. **Greenhouse JD has raw HTML** — stripHTML not running correctly on stored rows; SQL cleanup needed
5. **Lever JD short** — lists array parsing added but not confirmed working
6. **No Adzuna snippets** — description field not in insert (fixed in commit 9b44adbfc8 but may not be deployed)
7. **ATS History button buried** — needs better placement
8. **window.SESSION_USER** — not confirmed set anywhere; ats_runs insert will fail without it

### Next session priorities (in order)
1. Confirm deploy is live — check for Job Odyssey wordmark in header
2. If not live — debug Vercel webhook or manually redeploy from dashboard
3. Fix SESSION_USER — find where user object is set, expose on window
4. Test Add to Pipeline end to end
5. Test ATS scoring → confirm ats_runs row created
6. Greenhouse HTML cleanup — SQL update on existing rows
7. Clear jobs table and rescrape to get clean data with all fixes
8. Plan multi-tenant architecture for beta testers (shared scrape pool)

### Architecture notes
- Scraper: Adzuna (active) → cron.js → scraper-adzuna.js
- Dormant: scraper-v2.js (Active Jobs DB / RapidAPI) — still in repo, not wired
- ATS enrichment: Greenhouse > Lever > Ashby > fallback to Adzuna snippet
- All server-side DB ops use SUPABASE_SERVICE_KEY
- Frontend DB writes use SUPABASE_ANON_KEY + SESSION_TOKEN via REST API
- window.SESSION_TOKEN — set somewhere in app.js/auth.js (verify)
- window.SUPABASE_URL + window.SUPABASE_ANON_KEY — needed for frontend REST calls

### Adzuna quota
- Free tier: 250 req/day
- Current usage: ~3 calls per scrape (one per title)
- Multi-tenant risk: 20 testers × 3 calls = 60 calls per manual scrape round
- Plan: shared scrape pool before beta launch

---
## SESSION UPDATE — 2026/05/30 (session 4)

### Gmail scan window for next session
after:2026/05/30

### What was built this session

**UX / Leads tab:**
- AI Fit Check rename (was Score → ATS) + info tooltip explaining it is not a keyword scan
- Compass overlay spinner replaces jostling inline spinner
- Inline fit result on card: score badge, gap chips, matched chips, Analyze and Tailor button
- sendToATSEngine() passes scoreData so ATS tab skips redundant re-score on handoff
- ATS history moved from Leads tab to ATS tab (History button next to Analyze)
- 15/day label removed from ATS Check button
- Filter info tooltip on Leads filter bar explains each filter, links to Profile

**Bug fixes:**
- runKeywordScore missing Authorization header caused every score call to 400 (root cause of Analysis error)
- Add to Pipeline: jobJson passed raw via onclick attribute blew up on special chars in JD. Fixed to resolve from JOBS array by jobId only
- OTE labels now show actual dollar amount (36K OTE) not misleading tier categories
- ats_runs insert: silent catch removed, errors now logged to console; history fetch scoped by user_id

**Mobile layout:**
- Header: 2-row on mobile (logo + avatar top row, tabs full-width second row)
- Tabs: icon-only below 400px
- KPI cards: tighter padding, no label wrapping
- Generate Leads button stacks full-width below title on mobile
- Sub-tabs: horizontal scroll, no wrap

**Crossword logo:**
- JOB vertical / ODYSSEY horizontal / O = compass rose pivot
- Variant A shipped: amber J+B, white DYSSEY, solid amber ring on O
- Avatar moved next to logo (left of header, not far right)

**Pipeline table:**
- # column replaced with Source badge (purple=Scraper, amber=Manual, green=Referral, blue=LinkedIn)
- Source badge hidden on mobile, shown in expanded row
- app_number DB sequence created: applications_app_number_seq
- Expanded row: View Posting button (not raw URL), role at top on mobile, contact + recruiter + source surfaced
- Mobile: Role, Applied, Salary, Contact columns hidden; shown as sub-line in company cell

**Edit modal rebuilt — all fields now editable:**
- Status + Date Applied (side by side)
- Resume Version + CL Version (side by side, naming convention placeholders)
- Recruiter + Warm Contact (side by side)
- Salary Range (full width)
- Notes (full width)
- Meta strip (read-only): Date Added + AI Fit score
- saveModal patches all 8 fields; local APPS array updated via Object.assign
- Expanded row shows meta strip (Added / Applied / Fit) + resume and CL version if filled

### Next priorities (in order)
1. Check browser console after running AI Fit Check - is ats_runs insert logging an error? Fix it.
2. Verify Analyze and Tailor handoff: JD pre-populates in ATS tab, score not re-run
3. Sort controls on Leads (OTE desc, Base desc, Date posted, Company A-Z) - confirm options then build
4. Mark Applied action - one-tap to set date_applied + status from pipeline row without opening modal
5. ATS history panel - once insert works, verify panel populates correctly
6. Pipeline source badge - confirm Scraper-added rows have source field set by job-action.js

### Architecture reminders
- FIT_RESULTS[jobId] = in-memory fit check cache (session only, not persisted)
- ats_runs = persistent log; insert requires SESSION_USER.id set on window
- atsState.scoredJD === jd check gates redundant re-score in ATS tab
- Modal saves: date_applied, resume_version, cl_version, recruiter, warm_contact, salary_range, notes, status
- applications_app_number_seq sequence created in Supabase this session

### Standing rules
- ALWAYS syntax check before pushing: node --check /tmp/file.js
- ALWAYS get fresh SHA before PUT to GitHub
- Model string for Claude API calls: claude-sonnet-4-6
- RapidAPI quota: 25 req/month, be conservative with test calls
- GitHub token expires ~Aug 26, 2026 - remind Matthew to regenerate around Aug 16


---
## SESSION UPDATE — 2026/05/30 (session 5 — planning)

### Gmail scan window for next session
after:2026/05/30

### What happened this session
- No code written — deliberate planning session
- Assessed true state of the build (honest, not optimistic)
- Locked beta launch target: June 13, 2026
- Identified beta users: Erin Lewber + her job seeker clients
- Created and committed ROADMAP.md to GitHub root

### Key decisions locked
- NULL user_id backfill → assign all 46 legacy rows to Matthew's user_id, remove RLS OR exception
- Onboarding redesign → resume upload only required step; Claude infers everything else; branch for existing applications
- Manual Add Application → simple modal (5 fields), replaces template upload idea
- Multi-user hardening is highest-stakes work — Erin tests solo before clients get the link
- All deferred items explicitly off the table until post-beta

### Next session: START HERE (Day 1–2 of roadmap)
1. Find Matthew's user_id in Supabase auth.users
2. UPDATE applications SET user_id = '[matthew_uid]' WHERE user_id IS NULL
3. Fix RLS policy — remove OR user_id IS NULL clause
4. Find and delete orphan ghost profile
5. Verify: login → only Matthew's data visible

### ROADMAP.md
- Live at: https://github.com/mgolia6/job-search-automation/blob/main/ROADMAP.md
- Update checkboxes inline as items complete — single source of truth for beta progress
- Do NOT reconstruct from session notes — read ROADMAP.md directly

### Standing rules (do not forget)
- ALWAYS syntax check before pushing: node --check /tmp/file.js
- ALWAYS get fresh SHA before PUT to GitHub
- Model string for Claude API calls: claude-sonnet-4-6
- GitHub token expires ~Aug 26, 2026 — remind Matthew around Aug 16
