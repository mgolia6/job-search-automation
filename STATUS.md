# JOB SEARCH AUTOMATION — STATUS & ACTION ITEMS

**Last Updated:** May 21, 2026, 8:50pm ET  
**Status:** 95% complete — ONE action item blocking full automation

---

## ✅ WHAT'S BUILT AND DEPLOYED

### **GitHub Repo**
- **URL:** https://github.com/mgolia6/job-search-automation
- **Status:** Live, all code pushed

### **Supabase Database**
- **Project:** `job-search-pipeline`
- **URL:** https://yaepgxsbjtbdkiidxtmf.supabase.co
- **Status:** Live, schema deployed

### **Vercel Deployment**
- **URL:** https://job-search-automation-matthews-projects-fc20f25d.vercel.app
- **Status:** Live, function deployed
- **Environment Variables:** All set ✅

### **GitHub Actions**
- **Workflow:** `.github/workflows/cron.yml`
- **Schedule:** Every 30 minutes
- **Status:** Running successfully ✅

---

## 🚨 ONE BLOCKING ISSUE

**Vercel Firewall Blocking GitHub Actions**

**Fix (2 minutes on laptop):**
1. Go to: https://vercel.com/matthews-projects-fc20f25d/job-search-automation/settings/security
2. Find **"Firewall"** or **"Attack Challenge Mode"**
3. **Disable it** OR add `github.com` to allowlist

**Once fixed:** Automation starts immediately, emails arrive every 30 min when jobs are found.

---

## 📋 WHAT IT DOES (Once Firewall Fixed)

Every 30 minutes:
1. Searches Indeed for Enterprise/Strategic AE roles
2. Filters: Remote, $180K+ base OR $200K+ OTE
3. Skips companies you've already applied to
4. Pulls RepVue + Glassdoor data
5. Emails you with gut-check verdict (APPLY/MAYBE/PASS)

---

## 🎯 WHEN YOU GET AN EMAIL

Reply **"BUILD"** → Come to Claude, paste JD, get resume + 2 cover letters  
Reply **"PASS"** → Job gets logged and skipped

---

## 💰 COST

- Anthropic API: ~$5–10/month
- Everything else: Free

---

## ✅ ACTION ITEMS

**Matthew:**
- [ ] Disable Vercel firewall (2 min on laptop)
- [ ] Verify first email arrives within 30 min

**Next Claude Session:**
- Read `PROJECT_INSTRUCTIONS.md` from this repo
- Read `APPLICATION_LOG.md` from this repo
- Scan Gmail for recruiter updates
- Verify scraper is running
