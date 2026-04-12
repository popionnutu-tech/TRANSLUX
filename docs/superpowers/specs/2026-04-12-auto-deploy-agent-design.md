# Auto-Deploy Agent — Design Spec

**Data:** 2026-04-12
**Scop:** Agent automat care face deploy dupa fiecare git commit, pentru toate proiectele (Vercel + Railway).

## Problema

Deploul se face manual — dupa fiecare modificare trebuie sa ceri explicit "zadeploi". Pierzi timp si uneori uiti.

## Solutia

Hook PostToolUse in Claude Code care detecteaza `git commit` reusit si triggereaza deploy automat al ambelor servicii (Vercel web + Railway bot) prin agenti paraleli in background. Daca deploy-ul esueaza, agentul incearca sa fixeze eroarea si sa redeploieze (pana la 4 incercari).

## Arhitectura

```
git commit (Claude via Bash)
    |
    v
PostToolUse Hook (post-commit-deploy.sh)
    | verifica: este git commit? reusit?
    |
    v
Creaza .claude/deploy-pending (hash + timestamp)
Output: "[AUTO-DEPLOY] Commit abc123 — deploy pending"
    |
    v
Claude citeste semnalul de la hook
    |
    |-- git push origin main
    |
    |--------+---------+
    v        v         |
  Agent:   Agent:      |
  Vercel   Railway     |
  (bg)     (bg)        |
    |        |         |
    v        v         |
  deploy   deploy      |
  fix x4   fix x4      |
    |        |         |
    +--------+---------+
             |
             v
    .claude/deploy-log.txt
```

## Componente

### 1. PostToolUse Hook — `.claude/hooks/post-commit-deploy.sh`

**Trigger:** `PostToolUse` pe matcher `Bash`

**Logica:**
1. Verifica ca comanda executata contine `git commit` (nu `git add`, `git status`, etc.)
2. Verifica ca output-ul contine semn de commit reusit (hash, branch name)
3. Daca da — creaza fisier flag `.claude/deploy-pending` cu:
   - Hash-ul commit-ului
   - Timestamp
4. Scrie pe stdout: `[AUTO-DEPLOY] Commit <hash> — deploy pending`
5. Exit code 0 (nu blocheaza Claude)

**Deduplicare:**
- Daca `.claude/deploy-pending` exista deja cu acelasi hash — skip
- Daca exista cu alt hash — suprascrie (deploy-ul anterior se anuleaza)

### 2. Settings Update — `.claude/settings.local.json`

Adauga in sectiunea `hooks.PostToolUse`:
```json
{
  "matcher": "Bash",
  "hooks": [
    "bash .claude/hooks/post-commit-deploy.sh"
  ]
}
```

### 3. Deploy Scripts

#### `.claude/scripts/deploy-vercel.sh`
- Ruleaza `npx vercel --prod`
- Returneaza exit code + output pentru agent

#### `.claude/scripts/deploy-railway.sh`
- Ruleaza `railway up`
- Returneaza exit code + output pentru agent

### 4. Agentii de Deploy

**Agent Vercel (background):**
- Tip: `vercel-deploy-monitor` (existent)
- Ruleaza deploy-vercel.sh
- La eroare: analizeaza, fixeaza TypeScript/build errors, comiteaza fix, re-deploy
- Max 4 incercari
- Rezultat → notificare + deploy-log.txt

**Agent Railway (background):**
- Tip: `general-purpose` (custom prompt)
- Ruleaza deploy-railway.sh
- La eroare: analizeaza Docker build / runtime errors, fixeaza, re-deploy
- Max 4 incercari
- Rezultat → notificare + deploy-log.txt

### 5. Git Push

- Se face o singura data, inainte de lansarea agentilor
- `git push origin main` (fara --force)
- Daca push esueaza — notifica userul, nu lanseaza agentii

### 6. Logging — `.claude/deploy-log.txt`

Format per entry:
```
[2026-04-12T10:30:00] Commit: abc1234
  Vercel: SUCCESS (attempt 1)
  Railway: SUCCESS (attempt 1)
```

Rotatia logului la 1MB (ca audit-logger existent).

### 7. Error Handling

- Fiecare agent: max 4 incercari (deploy → eroare → fix → deploy)
- Daca toate 4 esueaza: notificare cu descrierea problemei
- Fix-urile agentilor genereaza commit-uri noi (care la randul lor vor triggera deploy — trebuie evitat loop-ul)

### 8. Anti-Loop Protection

Commit-urile de fix generate de agentii de deploy **nu trebuie** sa triggereze un nou deploy. Solutia:
- Agentii de deploy includ `[deploy-fix]` in mesajul commit-ului
- Hook-ul `post-commit-deploy.sh` verifica: daca mesajul commit-ului contine `[deploy-fix]` — skip, nu creaza flag

## Fisiere de creat/modificat

| Fisier | Actiune |
|--------|---------|
| `.claude/hooks/post-commit-deploy.sh` | Creare |
| `.claude/settings.local.json` | Modificare (adauga PostToolUse hook) |
| `.claude/scripts/deploy-vercel.sh` | Creare |
| `.claude/scripts/deploy-railway.sh` | Creare |

## Decizii cheie

1. **Intotdeauna ambele servicii** — nu se face detect inteligent pe ce s-a schimbat, se deploieaza mereu ambele
2. **Background agents** — nu blocheaza lucrul curent
3. **Auto-fix** — agentii incearca sa fixeze erori de build automat
4. **Anti-loop** — commit-urile de fix nu triggereaza re-deploy
5. **Un singur push** — inainte de agenti, nu in fiecare agent separat
