# JOB SEARCH AUTOMATION — STATUS & ACTION ITEMS

**Last Updated:** May 23, 2026
**Status:** 95% complete — ONE action item blocking full automation

---

## 🚨 SCRAPER IS NOT RUNNING — ACTION REQUIRED

**Problem:** Vercel firewall is blocking GitHub Actions from hitting the scraper endpoint.
**Result:** No job emails are being generated. The cron runs every 30 min but gets blocked.

**Fix (2 minutes on laptop):**
1. Go to: https://vercel.com/matthews-projects-fc20f25d/job-search-automation/settings/security
2. Find **"Firewall"** or **"Attack Challenge Mode"**
3. **Disable it** OR add GitHub Actions IP ranges to allowlist

**This has been the blocker since May 21. Not yet resolved as of May 23.**

---

## ✅ WHAT IS BUILT AND DEPLOYED

- **GitHub Repo:** https://github.com/mgolia6/job-search-automation — Live ✅
- **Supabase DB:** https://yaepgxsbjtbdkiidxtmf.supabase.co — Live ✅
- **Vercel Function:** https://job-search-automation-matthews-projects-fc20f25d.vercel.app — Deployed ✅ (but firewall-blocked)
- **GitHub Actions Cron:** Every 30 minutes — Running ✅ (but blocked by firewall)

---

## 📋 WHAT IT DOES (Once Firewall Fixed)

Every 30 minutes:
1. Searches Indeed for Enterprise/Strategic AE roles
2. Filters: Remote, $180K+ base OR $200K+ OTE
3. Skips companies already applied to
4. Pulls RepVue + Glassdoor data
5. Emails with gut-check verdict: APPLY / MAYBE / PASS

**When you get an email:**
- Reply **"BUILD"** → Come to Claude, paste JD, get resume + 2 cover letters
- Reply **"PASS"** → Job gets logged and skipped

---

## 💰 COST

- Anthropic API: ~$5–10/month
- Everything else: Free

---

## ✅ ACTION ITEMS

**Matthew (BLOCKING):**
- [ ] **Disable Vercel firewall** — scraper cannot run until this is done

**Claude (every session):**
- Read APPLICATION_LOG.md from GitHub (verify row count — should be 39 as of 5/23)
- Read PROJECT_INSTRUCTIONS.md and STATUS.md
- Scan Gmail for recruiter activity since last session
- Verify scraper is running (check for job alert emails)
