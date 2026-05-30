# SESSION_NOTES.md
_Source of truth for Job Odyssey session context. Never reconstruct from chat._

## Last Session
**Date:** May 30, 2026 (Session 6)
**Duration:** Full build session

## What We Did

### Day 1–2 Complete
- Backfilled 46 NULL user_id rows to Matthew's real user_id
- Deleted orphan ghost profile (00000000-0000-0000-0000-000000000001)
- Tightened RLS on applications (removed OR user_id IS NULL)
- Fixed ats_runs RLS policy (with_check was null — all inserts were blocked)

### Day 3–4 Core Loop (partial)
- Scraper verified working (38 jobs landed earlier in day, purged twice for clean scored runs)
- ats_runs insert fixed — will verify logging next session
- Analyze & Tailor handoff — not explicitly verified yet

### Major Feature Work
1. **Freshness tiers** — Fresh (< 3d) / Aging (3–7d) / Stale (7d+) based on posted_date
2. **Killed backlog** — removed from buttons, sub-tabs, job-action.js
3. **New KPI bar** — Fresh / Aging / Stale / Strong Match / In Pipeline / Dismissed (6 KPIs, 2×3)
4. **Auto-score on scrape** — Claude fit check runs on every new job at ingest, stores to ats_score + ats_missing_keywords on jobs row. 75% = strong match threshold.
5. **Collapsed cards** — default collapsed (company + role + OTE + freshness + score). Tap to expand full detail. Actions only in expanded state.
6. **Auto-recon on expand** — company recon fires automatically when card is expanded (lazy, cached)
7. **Compass overlay on Generate Leads** — full spinner while scrape + scoring runs. Toast shows "X new leads, Y strong matches"
8. **Sticky leads header** — Generate Leads button + filter bar stick to top (top:52px on desktop, needs mobile audit)
9. **Collapsible filter bar** — compact "Active filters" row always visible. Chevron expands filter values. ⓘ expands how-it-works. Mutually exclusive.
10. **Sort controls** — OTE / Date Posted / Company
11. **Stale leads collapse** — 7d+ jobs in collapsible section at bottom, 75% opacity

## Current State
- Jobs table: 2 actioned rows remain (added/dismissed). New rows purged twice — ready for clean auto-scored run.
- Auth: 1 user, 1 profile, all applications correctly scoped to real user_id
- RLS: applications and ats_runs both clean
- Scraper: Adzuna + Greenhouse/Lever/Ashby enrichment + Claude auto-scoring wired
- ANTHROPIC_API_KEY must be set as Vercel env var for auto-scoring to fire

## Known Issues / Next Session
- **Mobile vs desktop parity** — next session starts with simultaneous mobile + desktop testing. Header spacing (avatar margin) may still be tight on some devices.
- **Sticky header top offset** — desktop header is 52px. Mobile header is 2-row (logo + tabs) so ~96px total. Sticky `top:52px` may still be wrong on mobile — audit first thing next session.
- **ats_runs logging** — fixed the policy but not verified end-to-end in prod
- **Analyze & Tailor handoff** — not explicitly verified (JD pre-populates ATS tab)
- **Auto-recon caching** — recon fires on expand but result storage to jobs row not confirmed wired end-to-end
- **Day 3–4 not fully checked off** — pending verification of ats_runs insert and Analyze & Tailor

## Gotchas
- GitHub workflow scope token: [stored in project instructions] (expires ~Aug 2026)
- jobs table purge preserves status != 'new' rows (added/dismissed stay)
- Strong match threshold: 75% (locked)
- Auto-score uses claude-sonnet-4-6, max_tokens:400, AbortSignal.timeout(20000)
- Filter bar: scraper-filter-summary populates inside leads-filter-body (chevron panel)
- Mobile header is 2-row — tabs wrap below logo row, total height ~96px not 52px

## ROADMAP Status
- [x] Day 1–2: Data integrity & auth
- [~] Day 3–4: Core loop verification (scraper ✓, auto-score ✓, ats_runs policy ✓ — logging unverified)
- [ ] Day 5–7: Onboarding overhaul
