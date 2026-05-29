# PROJECT INSTRUCTIONS — Job Odyssey App Build

## Single Source of Truth
SESSION_NOTES.md is the only file that matters for project state.
Read it first, every session, before doing anything else.
https://raw.githubusercontent.com/mgolia6/job-search-automation/main/SESSION_NOTES.md

## Session Startup Protocol (minimum viable, in order)
1. Read SESSION_NOTES.md from GitHub
2. Query Supabase for table list — confirm schema hasn't drifted
3. Check last Vercel deployment — confirm it succeeded
4. Report build state in 5 lines or less, ask for direction

## Session Close Protocol (mandatory)
Before ending every session, update SESSION_NOTES.md with:
- What was built or changed
- Current state of anything in progress
- Next session priorities in order
- Any technical gotchas discovered

If SESSION_NOTES.md is not updated, context will be lost next session.

## Ground Rules
- SESSION_NOTES.md is the single source of truth — never reconstruct state from past chats
- Supabase is live data — always query it, never guess schema
- All code lives in GitHub — read files before editing them
- Use Python/bash for all file edits — str_replace tool has path issues
- Challenge don't validate — flag risks before executing
- No fluff, move fast once direction is confirmed
- End every session with SESSION_NOTES.md updated

## Deprecated Files — Ignore These
- STATUS.md
- APPLICATION_LOG.md
- Any file not referenced in SESSION_NOTES.md

## Key Links
- Live app: https://job-search-automation-pink.vercel.app
- Repo: https://github.com/mgolia6/job-search-automation
- Supabase project: yaepgxsbjtbdkiidxtmf
- Vercel project: prj_eXJT6KOWJpytqAfNGXE3nyYCbqUZ
- GitHub tokens: stored in userMemories
