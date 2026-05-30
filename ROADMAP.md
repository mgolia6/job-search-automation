# Job Odyssey — Beta Launch Roadmap
### Target: June 13, 2026 | Beta Users: Erin Lewber + clients

---

## Guiding Principle
Every feature that isn't in the critical path to a stranger getting value on day one gets cut or deferred. We finish what's broken before we touch anything new.

---

## Week 1 — Foundation (June 1–7)
*Nothing new gets built until the core loop is airtight.*

### Day 1–2: Data Integrity & Auth
- [x] Backfill all 46 NULL user_id rows to Matthew's user_id
- [x] Remove "OR user_id IS NULL" RLS exception from applications policy
- [x] Delete orphan ghost profile (2 profiles exist, 1 user)
- [x] Verify end-to-end: login → correct data only → no bleed between accounts

### Day 3–4: Core Loop Verification
- [ ] Scraper — confirm Adzuna insert works, jobs land with correct user_id
- [ ] Add to Pipeline — verify job-action sets status=added, source=Scraper, correct user_id
- [ ] AI Fit Check — fix ats_runs insert (SESSION_USER.id issue), confirm rows log
- [ ] Analyze & Tailor handoff — confirm JD pre-populates in ATS tab, no redundant re-score

### Day 5–7: Onboarding Overhaul
- [ ] Single required step: resume upload
- [ ] Claude infers titles, salary floor, summary — user confirms or edits with one tap
- [ ] Branch after resume: "Are you already tracking applications?"
  - Yes → lightweight manual add (company, role, status, date — 5 fields max)
  - No → go straight to Leads
- [ ] Cut anything in onboarding that isn't load-bearing
- [ ] Mobile pass on onboarding flow

---

## Week 2 — Polish & Multi-User (June 8–13)

### Day 8–9: Multi-User Hardening ⚠️ Highest Stakes
- [ ] New user signup → onboarding → profile → scraper fires with their filters
- [ ] Confirm all data correctly scoped to user_id (jobs, applications, profiles, ats_runs)
- [ ] Test with a second account end-to-end — Matthew plays the client
- [ ] Fix any data bleed or scoping failures before Erin gets the link

### Day 10–11: Leads Tab Usability
- [ ] Sort controls: OTE desc, Date posted, Company A-Z
- [ ] Score badge visible on card if already scored (no redundant re-run)
- [ ] Empty state: "No leads yet — hit Generate Leads to pull new roles"
- [ ] Mobile pass on Leads tab

### Day 12: Pipeline Usability
- [ ] Manual Add Application modal (5 fields: company, role, status, date applied, source)
- [ ] Expanded row shows resume/CL version if filled
- [ ] Mobile pass on Pipeline tab

### Day 13: Pre-Launch
- [ ] Full end-to-end run as a net-new user (clean account, fresh resume, zero prior data)
- [ ] Fix anything that breaks
- [ ] Write Erin's client onboarding email — what to expect, how to give feedback

---

## Deferred — Do Not Touch Until Post-Beta
- Resume dissection view
- Gmail tab
- Photo upload / Supabase storage
- ATS history panel (self-populates once ats_runs insert is fixed)
- Glassdoor health check
- Cron automation (manual Generate Leads is fine for beta)
- Pipeline sort controls
- RepVue integration cleanup

---

## Critical Risk Note
Erin's clients' job search data is sensitive. If two users ever see each other's applications — even once — that's a reputation problem for Erin, not just a bug. Multi-user hardening (Day 8–9) is the highest-stakes work in this plan. Erin tests solo first; clients get the link only after Day 9 passes clean.

---

## Status Key
- [ ] Not started
- [~] In progress
- [x] Done
- [!] Blocked

---
*Roadmap locked: May 30, 2026. Adjust as we go — update status inline.*
