# Job Odyssey — Session Notes

## Gmail Scan From Date
after:2026/05/29

---

## Last Session: 2026-05-29

### What Was Done
- Refactor confirmed complete — app split into modular JS files (app.js, opportunities.js, ats.js etc)
- **Scraper fixes shipped:**
  - `filterSeen` now blocks by `job_id` only — company-name blocklist removed (was permanently blocking legit new postings from companies already in pipeline)
  - Added verbose `filterLog` to scraper response — shows how many jobs hit each filter stage (no more black box)
- **Company recon fixed:**
  - RepVue: replaced bot-blocked HTML scrape with Claude AI lookup — cached 1 week in `company_recon` table
  - Glassdoor: replaced broken RapidAPI subscription call with Glassdoor deep search link — always works
  - Added `repvue_summary` and `repvue_verdict` columns to `company_recon` Supabase table
- **ATS scoring fixed:**
  - Swapped dead `resume-ats-analyzer` endpoint for `ats-match-scoring.p.rapidapi.com`
  - Auth: JWT Bearer token (not standard RapidAPI key)
  - Root bug found: API returns `{ time, code, data: "<JSON string>" }` — `data` field is a string that must be double-parsed
  - Frontend updated to render full response: score + match breakdown sub-scores, strengths, weaknesses, missing keywords, gaps, improvement suggestions, ATS-optimized rewrites, overall feedback
- **cron.yml:** Already correct — Mon/Wed/Fri/Sun 13:00 UTC (~16 runs/month). No change needed.

### ATS API Details (ats-match-scoring.p.rapidapi.com)
- **Request:** `POST /` with body `{"data": {"Resume Data": "...", "Job Offer Data": "...", "Response Language": "English"}}`
- **Response:** `{ time, code, data: "<JSON string>" }` — must JSON.parse `data` field
- **Payload fields:** `ats_score`, `match_breakdown` (skills_match, experience_match, keyword_match, education_match), `strengths[]`, `weaknesses[]`, `missing_keywords[]`, `gaps[]`, `improvement_suggestions[]`, `ats_optimized_rewrites[]` (original+optimized), `overall_feedback`
- **Known issue:** Score can be inflated (87% with 6 missing keywords). Plan to flag when score >= 85 and missing_keywords >= 4.

### Known Issues / Still Broken
- Scraper yield still low — only 1 job (Docusign) came back on last run. filterLog will now show raw count so we can diagnose further next session. Likely the Active Jobs DB API returning small result sets on some queries.
- ATS inflated score warning — not yet implemented

---

## Next Session Plan (PRIORITY ORDER)

### 1. Resume Management System
- New Supabase table: `resume_versions` (id, label, version_number, content_text, uploaded_at, is_active)
- Upload UI: docx only for now (PDF later)
- Parse docx on upload → extract text → store in `resume_versions`
- Version selector — pick which version feeds ATS analyzer
- `resume_master` in current Supabase is probably okay but migrating to `resume_versions` as baseline
- Active version always used by ATS engine (not hardcoded master)

### 2. Unified Keyword Grid
- Single grid, four quadrants: ✓ Matched Hard / ✗ Missing Hard / ✓ Matched Soft / ✗ Missing Soft
- Both Claude + RapidAPI feed into it — merged, deduplicated
- Replaces current separate display of matched/missing from each scorer
- Inflated score warning banner: score >= 85 AND missing_keywords >= 4

### 3. Human-in-the-Loop Rewrite Flow
- Single "Generate Tailored Resume" button appears after BOTH scores complete
- Claude input: JD + active resume version + merged missing keywords + gaps (RapidAPI rewrites as signal, not output)
- Claude returns structured diff: array of `{ section, original, suggested, reason, keyword_added }`
- UI renders diff as cards — one card per bullet that changes
  - Original bullet: red background
  - Suggested bullet: green background  
  - One-line reason shown
  - Approve / Decline toggle per card
- "Build Resume" button — approved changes only → assembles final version
- Saves to `resume_versions` with label "Tailored — [Company] [Date]"
- Re-score button on saved version — reruns both ATS checks against approved version

### 4. Scraper Yield Investigation
- Check filterLog output after next cron run
- If raw count is still < 5, test alternate title filters or broader query
- Consider adding second query pass with `'enterprise account executive' | 'named account'`

---

## Architecture Reference

### Supabase Project: yaepgxsbjtbdkiidxtmf
**Tables:** applications, company_health, company_recon, email_alerts, jobs, resume_master
**New table needed next session:** resume_versions

### API Files (api/)
- `scraper-v2.js` — Active Jobs DB scraper (fixed)
- `company-recon.js` — RepVue AI + Glassdoor deep link (fixed)
- `ats-scan.js` — ATS scoring: claude semantic (score/repvue/rewrite actions) + RapidAPI literal (rapidapi action)
- `cron.js` — wrapper that calls scraper-v2
- `data.js` — Supabase read/write for dashboard
- `job-action.js` — pipeline state changes
- `gmail-scan.js` — Gmail recruiter scan

### Frontend Files (public/js/)
- `app.js` — core app, tab routing, state
- `opportunities.js` — job cards, pipeline view
- `ats.js` — ATS analyzer UI

### Env Vars (Vercel)
- `SUPABASE_URL`, `SUPABASE_KEY`
- `ANTHROPIC_API_KEY`
- `RAPIDAPI_KEY` — Active Jobs DB
- `CRON_SECRET`
- `RESEND_API_KEY`
- `ATS_SCORING_JWT` — ats-match-scoring.p.rapidapi.com JWT Bearer token

### Live App
https://job-search-automation-pink.vercel.app

### Repo
https://github.com/mgolia6/job-search-automation

### Cron Schedule
Mon/Wed/Fri/Sun 13:00 UTC (~9am ET) — ~16 runs/month
