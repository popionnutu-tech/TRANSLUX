## Review: senior-backend-engineer — runda 3

Pe v3 și în cod.

| id | stare | dovadă |
|---|---|---|
| ARH-11 | închis | 4c `config` + 3 «lipsă = închis»; 4a re-validează. V5 respinsă acceptabil. |
| ARH-12 | închis | 2a pur/IO; `packages/db` are deja vitest (`packages/db/package.json:11`, `*-calc.test.ts`). |
| ARH-13 | închis în fond; mecanismul lipsește → ARH-17 | |
| ARH-14 | închis pentru 5a↔7, 5b, 6; dependență inversă nouă → ARH-18 | |
| ARH-15 | închis | 0.2 |
| ARH-16 | închis | 1 `bilete_api_apeluri` |

### Observații noi

**ARH-17 · low (−0.5) · «compilat la build» nu spune cum.**
Se poate. esbuild e doar tranzitiv (`node_modules/esbuild` 0.27.7); build-ul e `next build` (`apps/admin/package.json:7`, chemat din `apps/admin/vercel.json:6`).
Corecție: esbuild ca devDependency; `"build": "node scripts/build-mini-app.mjs && next build"` (+ `predev`) → IIFE minificat `public/mini-app/bilete.js?v=${VERCEL_GIT_COMMIT_SHA}` (`<hash>` ar cere manifest); fișierul în `.gitignore`.

**ARH-18 · high (−2.0) · pasul 4 se verifică prin pasul 11a, care vine după el.**
Dovadă: 4 «Rezultat» cere «Comandă de test» din `/bilete (11a)`, dar ordinea e 4→6→11a. 4d schimbă callback-ul tuturor plăților maib (`callback/route.ts:120`, `:147-152`). Central-hub se deployează la fiecare push (`CLAUDE.md:13-16`).
Scenariu: 4d ajunge în prod (500 la eroare RPC, inserare din corp) netestat; un defect lovește și plățile ION-188; 6 schimbă `/plati` la fel.
Corecție: «Comandă de test» se mută în pasul 4, ca script sau acțiune ADMIN care cheamă serviciul `lib/bilete/comenzi.ts`. Integrarea 4+6 devine condiție de push.

**ARH-19 · medium (−1.0) · testul cu steagurile închise contrazice 4a.**
4a validează steagurile, deci, cu `bilete_online_activ=false`, comanda de test e refuzată. Ocolul nu e definit. Un parametru de ocol pe ruta publică ar fi o gaură.
Corecție: serviciul se apelează ca `creeazaComanda(input, { mod: 'public' | 'test_admin' })`. Ruta publică pune mereu `public`. Doar acțiunea cu sesiune ADMIN poate pune `test_admin`.

**ARH-20 · low (−0.5) · `config`: cheie sau public, și cache dublu.**
`s-maxage=60` (4c) pe o rută cu cheie (decizia 1) + 60 s în proces (3); `apps/web/vercel.json` n-are `regions`, admin e `dub1`.
Corecție: public fără cheie sau `no-store` + cache doar în web; regiunea web în «Verificat».

### Deduceri
| Id | Severitate | Greutate |
|---|---|---|
| ARH-17 | low | −0.5 |
| ARH-18 | high | −2.0 |
| ARH-19 | medium | −1.0 |
| ARH-20 | low | −0.5 |
| Total | | −4.0 |

Scor: 6.0 · Blocante (critical/high): 1
