# JOB SEARCH AUTOMATION — STATUS & ACTION ITEMS

**Last Updated:** May 22, 2026, 7:15am ET  
**Status:** LIVE — Scraper running, config fixed

---

## ✅ WHAT'S DEPLOYED

### **GitHub Repo**
- **URL:** https://github.com/mgolia6/job-search-automation
- **Status:** Live, latest commits pushed 5/22

### **Supabase Database**
- **Project:** `job-search-pipeline`
- **URL:** https://yaepgxsbjtbdkiidxtmf.supabase.co
- **Status:** Live, schema deployed

### **Vercel Deployment**
- **URL:** https://job-search-automation-matthews-projects-fc20f25d.vercel.app
- **Status:** Live, auto-deploys on GitHub push
- **Environment Variables:** All set ✅

### **GitHub Actions**
- **Workflow:** `.github/workflows/cron.yml`
- **Schedule:** Every 30 minutes
- **Status:** Running successfully ✅

---

## 🔧 FIXED THIS SESSION (5/22/2026)

**Search Config Updated:**
- `minBaseSalary`: Lowered from $180K → $100K
- Reason: Most Enterprise AE JDs show OTE ranges, not base. Base ranges vary wildly. 
- Real filter: `minOTE: 200000` (unchanged)

**Why no emails before:**
Scraper was running successfully but filtering out nearly every job because of the $180K base floor. Example: Qualtrics #38 has $109.5K–$207.5K base — scraper would have skipped it.

**Firewall Status:**
Attack Challenge Mode is **NOT active** on Vercel. Not the issue.

---

## 📋 WHAT IT DOES

Every 30 minutes:
1. Searches Indeed for Enterprise/Strategic AE roles
2. Filters: Remote, $100K+ base AND $200K+ OTE
3. Skips companies Matthew already applied to
4. Pulls RepVue + Glassdoor data
5. Emails Matthew with gut-check verdict (APPLY/MAYBE/PASS)

---

## 🎯 WHEN YOU GET AN EMAIL

Reply **"BUILD"** → Come to Claude, paste JD, get resume + 2 cover letters  
Reply **"PASS"** → Job gets logged and skipped

---

## 💰 COST

- Anthropic API: ~$5–10/month
- Everything else: Free

---

## ✅ NEXT STEPS

**Matthew:**
- [ ] Wait 30 min, check Gmail for first scraper email
- [ ] If no email after 1 hour, ping Claude to debug

**Next Claude Session:**
- Read `PROJECT_INSTRUCTIONS.md` from repo
- Read `APPLICATION_LOG.md` from repo (now has Cyara #39 + Mastercard #40 rejections)
- Scan Gmail for recruiter updates
- Verify scraper is sending emails
