# Auto-Deploy Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatic deploy of both Vercel (web) and Railway (bot) after every git commit, with auto-fix on failure.

**Architecture:** PostToolUse hook detects successful `git commit` → prints instruction to stdout → Claude sees it and launches two background agents (Vercel + Railway) after a single `git push`. Anti-loop protection via `[deploy-fix]` tag in commit messages.

**Tech Stack:** Bash hooks, Claude Code hooks system (PostToolUse), Agent tool with `vercel-deploy-monitor` and `general-purpose` subagent types.

---

### Task 1: Create PostToolUse Hook Script

**Files:**
- Create: `.claude/hooks/post-commit-deploy.sh`

- [ ] **Step 1: Create the hook script**

```bash
#!/bin/bash
# ==============================================================================
# POST-COMMIT DEPLOY HOOK — detects git commit and signals Claude to deploy
# ==============================================================================

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"' 2>/dev/null)

# Only process Bash tool calls
if [ "$TOOL_NAME" != "Bash" ]; then
  exit 0
fi

COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null)
STDOUT=$(echo "$INPUT" | jq -r '.tool_output.stdout // ""' 2>/dev/null)

# Check: was this a git commit command?
if ! echo "$COMMAND" | grep -qE 'git\s+commit'; then
  exit 0
fi

# Check: did the commit succeed? (output contains branch + hash pattern like "[main abc1234]")
COMMIT_MATCH=$(echo "$STDOUT" | grep -oE '\[[a-zA-Z0-9/_-]+ [a-f0-9]{7,}\]' | head -1)
if [ -z "$COMMIT_MATCH" ]; then
  exit 0
fi

COMMIT_HASH=$(echo "$COMMIT_MATCH" | grep -oE '[a-f0-9]{7,}')

# Anti-loop: skip if commit message contains [deploy-fix]
if echo "$STDOUT" | grep -q '\[deploy-fix\]'; then
  exit 0
fi

# Deduplication: check if deploy already pending for this hash
PENDING_FILE="/Users/ionpop/Desktop/TRANSLUX/.claude/deploy-pending"
if [ -f "$PENDING_FILE" ]; then
  EXISTING_HASH=$(head -1 "$PENDING_FILE" 2>/dev/null)
  if [ "$EXISTING_HASH" = "$COMMIT_HASH" ]; then
    exit 0
  fi
fi

# Write pending flag
echo "$COMMIT_HASH" > "$PENDING_FILE"
echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" >> "$PENDING_FILE"

# Signal Claude — this stdout is visible to Claude as hook feedback
echo ""
echo "============================================================"
echo "[AUTO-DEPLOY] Commit $COMMIT_HASH detected."
echo "ACTION REQUIRED: Deploy both services now."
echo ""
echo "Steps to execute:"
echo "1. git push origin main"
echo "2. Launch vercel-deploy-monitor agent in background"
echo "3. Launch general-purpose agent for Railway deploy in background"
echo "4. Remove .claude/deploy-pending after launching agents"
echo "============================================================"

exit 0
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x .claude/hooks/post-commit-deploy.sh`

- [ ] **Step 3: Verify the script parses correctly**

Run: `bash -n .claude/hooks/post-commit-deploy.sh`
Expected: no output (no syntax errors)

- [ ] **Step 4: Commit**

```bash
git add .claude/hooks/post-commit-deploy.sh
git commit -m "feat: add post-commit auto-deploy hook script"
```

---

### Task 2: Create Deploy Helper Scripts

**Files:**
- Create: `.claude/scripts/deploy-vercel.sh`
- Create: `.claude/scripts/deploy-railway.sh`

- [ ] **Step 1: Create scripts directory**

Run: `mkdir -p .claude/scripts`

- [ ] **Step 2: Create Vercel deploy script**

```bash
#!/bin/bash
# ==============================================================================
# DEPLOY VERCEL — runs vercel --prod and returns result
# ==============================================================================

cd /Users/ionpop/Desktop/TRANSLUX

echo "[Vercel Deploy] Starting..."
OUTPUT=$(npx vercel --prod 2>&1)
EXIT_CODE=$?

echo "$OUTPUT"

# Log result
LOG_FILE="/Users/ionpop/Desktop/TRANSLUX/.claude/deploy-log.txt"
TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null)

if [ $EXIT_CODE -eq 0 ]; then
  echo "[$TIMESTAMP] Commit: $COMMIT_HASH | Vercel: SUCCESS" >> "$LOG_FILE"
else
  echo "[$TIMESTAMP] Commit: $COMMIT_HASH | Vercel: FAILED (exit $EXIT_CODE)" >> "$LOG_FILE"
fi

# Rotate log if > 1MB
if [ -f "$LOG_FILE" ]; then
  FILE_SIZE=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat --format=%s "$LOG_FILE" 2>/dev/null)
  if [ "$FILE_SIZE" -gt 1048576 ] 2>/dev/null; then
    mv "$LOG_FILE" "$LOG_FILE.$(date '+%Y%m%d%H%M%S').bak"
  fi
fi

exit $EXIT_CODE
```

- [ ] **Step 3: Create Railway deploy script**

```bash
#!/bin/bash
# ==============================================================================
# DEPLOY RAILWAY — runs railway up and returns result
# ==============================================================================

cd /Users/ionpop/Desktop/TRANSLUX

echo "[Railway Deploy] Starting..."
OUTPUT=$(railway up --detach 2>&1)
EXIT_CODE=$?

echo "$OUTPUT"

# Log result
LOG_FILE="/Users/ionpop/Desktop/TRANSLUX/.claude/deploy-log.txt"
TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null)

if [ $EXIT_CODE -eq 0 ]; then
  echo "[$TIMESTAMP] Commit: $COMMIT_HASH | Railway: SUCCESS" >> "$LOG_FILE"
else
  echo "[$TIMESTAMP] Commit: $COMMIT_HASH | Railway: FAILED (exit $EXIT_CODE)" >> "$LOG_FILE"
fi

# Rotate log if > 1MB
if [ -f "$LOG_FILE" ]; then
  FILE_SIZE=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat --format=%s "$LOG_FILE" 2>/dev/null)
  if [ "$FILE_SIZE" -gt 1048576 ] 2>/dev/null; then
    mv "$LOG_FILE" "$LOG_FILE.$(date '+%Y%m%d%H%M%S').bak"
  fi
fi

exit $EXIT_CODE
```

- [ ] **Step 4: Make both executable**

Run: `chmod +x .claude/scripts/deploy-vercel.sh .claude/scripts/deploy-railway.sh`

- [ ] **Step 5: Verify both parse correctly**

Run: `bash -n .claude/scripts/deploy-vercel.sh && bash -n .claude/scripts/deploy-railway.sh && echo "OK"`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add .claude/scripts/deploy-vercel.sh .claude/scripts/deploy-railway.sh
git commit -m "feat: add Vercel and Railway deploy helper scripts"
```

---

### Task 3: Register PostToolUse Hook in Settings

**Files:**
- Modify: `.claude/settings.local.json`

- [ ] **Step 1: Read current settings.local.json**

Read `.claude/settings.local.json` to get the current content.

- [ ] **Step 2: Add PostToolUse section**

Add a `PostToolUse` entry to the `hooks` object, after the existing `PreToolUse` array. The new section:

```json
{
  "hooks": {
    "PreToolUse": [
      ... (existing, do not modify)
    ],
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "bash .claude/hooks/post-commit-deploy.sh" }
        ]
      }
    ]
  }
}
```

Only add the `PostToolUse` key — do not modify any existing `PreToolUse` hooks.

- [ ] **Step 3: Validate JSON**

Run: `cat .claude/settings.local.json | python3 -c "import sys,json; json.load(sys.stdin); print('Valid JSON')"`
Expected: `Valid JSON`

- [ ] **Step 4: Commit**

```bash
git add .claude/settings.local.json
git commit -m "feat: register post-commit deploy hook in settings"
```

---

### Task 4: Add Auto-Deploy Instructions to CLAUDE.md

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: Create CLAUDE.md with auto-deploy instructions**

```markdown
# TRANSLUX — Project Instructions

## Auto-Deploy After Git Commit

When you see `[AUTO-DEPLOY]` in hook output after a `git commit`, you MUST automatically:

1. **Push:** `git push origin main` (never `--force`)
2. **Deploy Vercel (background):** Launch `vercel-deploy-monitor` agent with prompt:
   > "Run `bash .claude/scripts/deploy-vercel.sh` in /Users/ionpop/Desktop/TRANSLUX. If it fails, analyze the error, fix TypeScript or build issues, commit the fix with `[deploy-fix]` in the message, and redeploy. Max 4 attempts. Report final status."
3. **Deploy Railway (background):** Launch `general-purpose` agent with prompt:
   > "Run `bash .claude/scripts/deploy-railway.sh` in /Users/ionpop/Desktop/TRANSLUX. If it fails, analyze the Docker build or runtime error, fix the issue, commit the fix with `[deploy-fix]` in the message, and redeploy. Max 4 attempts. Report final status."
4. **Cleanup:** `rm -f .claude/deploy-pending`

Both agents run in background (`run_in_background: true`) — do not wait for them. Continue your current work.

If `git push` fails — tell the user, do not launch deploy agents.

### Anti-Loop Rule

Commits with `[deploy-fix]` in the message do NOT trigger auto-deploy. The hook skips them automatically.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "feat: add CLAUDE.md with auto-deploy instructions"
```

---

### Task 5: End-to-End Smoke Test

**Files:** None (manual verification)

- [ ] **Step 1: Make a trivial change to test the hook**

Edit any file with a trivial comment change. For example, add a blank line at the end of `README.md`.

- [ ] **Step 2: Stage and commit**

```bash
git add README.md
git commit -m "test: verify auto-deploy hook triggers"
```

- [ ] **Step 3: Verify hook output**

Expected: After the commit, you should see the `[AUTO-DEPLOY]` message in the tool output:
```
============================================================
[AUTO-DEPLOY] Commit <hash> detected.
ACTION REQUIRED: Deploy both services now.
...
============================================================
```

- [ ] **Step 4: Follow the auto-deploy instructions**

Execute the steps from CLAUDE.md:
1. `git push origin main`
2. Launch Vercel agent in background
3. Launch Railway agent in background
4. `rm -f .claude/deploy-pending`

- [ ] **Step 5: Verify both deploys succeed**

Wait for background agent notifications. Both should report SUCCESS.

- [ ] **Step 6: Verify deploy log**

Run: `cat .claude/deploy-log.txt`
Expected: Two entries — one for Vercel SUCCESS, one for Railway SUCCESS.

- [ ] **Step 7: Verify anti-loop protection**

Make a test commit with `[deploy-fix]` in the message:
```bash
git commit --allow-empty -m "test: [deploy-fix] this should not trigger deploy"
```
Expected: No `[AUTO-DEPLOY]` message appears.

- [ ] **Step 8: Clean up test commits**

```bash
git reset --soft HEAD~2
git commit -m "feat: auto-deploy agent setup

Adds PostToolUse hook, deploy scripts, and CLAUDE.md instructions
for automatic deployment of both Vercel and Railway after every
git commit."
```
