# TRANSLUX — Project Instructions

## Auto-Deploy After Git Commit

When you see `[AUTO-DEPLOY]` in hook output after a `git commit`, you MUST automatically:

1. **Push:** `git push origin main` (never `--force`)
2. **Deploy Vercel (background):** Launch `vercel-deploy-monitor` agent with prompt:
   > "Run `bash .claude/scripts/deploy-vercel.sh` in /Users/ionpop/Desktop/TRANSLUX. If it fails, analyze the error, fix TypeScript or build issues, commit the fix with `[deploy-fix]` in the message, and redeploy. Max 4 attempts. Report final status."

   The script deploys **translux-web only**. `central-hub` is deployed by Vercel's own
   GitHub integration on every push to `main` — do not deploy it from the CLI as well.
   Two builds of the same commit exhausted the free 100-deploys-per-day account limit
   on 24.08. To verify a change reached `central-hub`, check its deployments in Vercel
   or curl the endpoint — do not re-run the script.
3. **Deploy Railway (background):** Launch `general-purpose` agent with prompt:
   > "Run `bash .claude/scripts/deploy-railway.sh` in /Users/ionpop/Desktop/TRANSLUX. If it fails, analyze the Docker build or runtime error, fix the issue, commit the fix with `[deploy-fix]` in the message, and redeploy. Max 4 attempts. Report final status."
4. **Cleanup:** `rm -f .claude/deploy-pending`

Both agents run in background (`run_in_background: true`) — do not wait for them. Continue your current work.

If `git push` fails — tell the user, do not launch deploy agents.

### Anti-Loop Rule

Commits with `[deploy-fix]` in the message do NOT trigger auto-deploy. The hook skips them automatically.
