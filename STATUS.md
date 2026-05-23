# JOB SEARCH AUTOMATION — STATUS

**Last Updated:** May 23, 2026
**Session:** Full-day work session

---

## 🔴 DASHBOARD — INCOMPLETE (NEXT SESSION)

The job search dashboard UI was attempted repeatedly via Vercel and Supabase Edge Functions but did not load successfully. **Next session: convert repo to Next.js** — one command, Vercel knows exactly what to do, no more config fights.

**What exists:**
- Supabase `applications` table seeded with all 46 rows
- Supabase `jobs`, `company_health`, `email_alerts` tables live
- `api/data.js` endpoint exists in repo (returns JSON from Supabase)
- Supabase Edge Function `dashboard` deployed (v2) but not rendering correctly

**Next session plan:**
1. `npx create-next-app` scaffold in repo
2. Move dashboard to `pages/index.jsx`
3. Move API to `pages/api/data.js`
4. Push — Vercel auto-detects Next.js, deploys clean

---

## ✅ SCRAPER — FIXED AND RUNNING

Three bugs killed today:

1. **`api/cron.js`** was a health-check stub — never called `runJobScraper()`. Fixed.
2. **Parser** was regex-matching wrong format. Indeed MCP returns structured text fields (`**Job Title:**`, `**Company:**`, etc.) — parser rewritten to match actual format.
3. **Salary filter** math was inverted — would have passed nearly anything. Fixed.
4. **Recency filter** set to **2 days** (was 14 — too old to be useful).

Scraper runs every 30 min via GitHub Actions cron → hits `/api/cron` on Vercel → calls Indeed MCP → filters → emails mgolia6@gmail.com.

**Watch for:** First scraper email should arrive within 30 min of next GitHub Actions cycle. If nothing after 2 hours, check Vercel function logs.

---

## ✅ APPLICATION LOG — FULLY RECONCILED

**46 rows total** as of May 23, 2026.

**Added this session (were missing from log):**
- #17 Salesforce Non-Profit AE (3/16)
- #20 Pendo Account Director (4/8) — rejected 4/10
- #21 Samsara Regional Sales Director NE (4/8) — rejected 4/10
- #24 Kong Enterprise AE NE (3/31) — rejected 4/13
- #33 Gong Enterprise AE East (4/3) — rejected 5/13
- #34 Rippling Enterprise AE East Coast (4/3) — no response
- #35 Mastercard Director AM Travel (4/3) — rejected 5/22
- #42 Onboard Strategic AE first application (5/14)
- #46 Cyara Senior Enterprise AE — rejected 5/21

**Statuses updated from Gmail:**
- GitHub #19 → Closed — No (rejected 5/12)
- Qualtrics TMT #37 → Closed — No (rejected 5/7)
- Twilio #18, #27, #31, #32 → all Closed — No (rejected 4/28, Alexa Lowe)
- Atlassian #30 → Closed — No (rejected 4/30)
- Zendesk #41 → Closed — No (rejected 5/20)

**Sync warning in place:** File header now includes row count checkpoint (46) and Drive backup file ID so no future session can truncate it without tripping a flag.

---

## ✅ SUPABASE — SEEDED

All 46 applications loaded into `applications` table.
`gut_check` column added to `jobs` table.
`app_number` column added to `applications` table.

---

## 📋 NEXT SESSION PRIORITIES

1. **Dashboard** — convert to Next.js, deploy clean
2. **Scraper** — verify first email came through; tune if needed
3. **Warm contacts** — Arthur Poje (Atlassian) re-engagement still queued
4. **Salesforce K-12 (#26)** — Dave Capasso outreach before it goes stale
5. **Dataiku / Amanda Walt** — cover letters still pending

---

## 💰 COST

- Anthropic API: ~$5–10/month
- Everything else: Free
