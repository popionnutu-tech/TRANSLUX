## Review: senior-backend-engineer — runda 2

Zona: arhitectura și ordinea pașilor, verificate pe planul v2 și în cod.

### Observațiile din runda 1

| id | stare | unde |
|---|---|---|
| ARH-1 | închis | 7b: `contact.user_id === from.id`, chat privat, fără forward |
| ARH-2 | închis (steaguri în 1, ordinea nouă); două dependențe inverse noi la ARH-14 | |
| ARH-3 | închis (Route Handler); testabilitatea JS-ului la ARH-13 | |
| ARH-4 | închis în text; testul la ARH-12 | 2a |
| ARH-5 … ARH-10 | închise | 7b, 7a, F21, 4d, S, tabelul «Fișiere» |

### Observații noi

**ARH-11 · high (−2.0) · site-ul nu poate citi steagul global.**
Dovadă: anon nu are nicio politică pe `app_config`. SQL pe viu (02.10): `relrowsecurity = true`, 0 politici pentru anon sau public. `apps/web/src/lib/supabase.ts:20-25` folosește doar cheia anon.
Scenariu: pasul 3 calculează `sale_open` din `app_config.bilete_online_activ` și `BILETE_INCHIDERE_MIN`, dar anon citește 0 rânduri. Butonul nu apare nici după pasul 10, sau, mai rău, «lipsă = implicit» deschide vânzarea.
Corecție: configurația ajunge în web printr-un `GET /api/bilete/public/config` (cache 60 s) sau printr-un RPC `SECURITY DEFINER` cu `GRANT anon` și `REVOKE … FROM PUBLIC`. Lipsa răspunsului = închis. 4a re-verifică oricum.

**ARH-12 · medium (−1.0) · testul de preț «pe încărcarea reală» nu prinde nimic.**
Dovadă: `packages/db/package.json:6-7` (ambele aplicații rezolvă pachetul din `dist`). Aliasul din `apps/web/tsconfig.json:19-21` trimite la `db-types.ts`, un fișier care nu există. `apps/web/vitest.config.ts` n-are alias. Gate-ul `GG_TEST_CMD` verifică doar migrațiile.
Ce se întâmplă: «web = admin» compară aceeași funcție cu ea însăși. Cu bază reală, testul cere rețea și secrete.
Corecție: `calculeazaPret` se împarte în `incarcaDatePret(db, …)` (IO) și `pretDin(date, …)` (funcție pură). Înaintea mutării, un test de caracterizare înregistrează ieșirea actuală a `searchTrips` pe fixturi JSON extrase din SQL. Rezultatul pasului 2 spune explicit că `vitest` rulează de mână.

**ARH-13 · medium (−1.0) · logica critică a mini app-ului ar sta într-un șir de caractere.**
Dovadă: pasul 8 cere «JS inline» în `route.ts`. Clasificarea verde/portocaliu/roșu și coada `pending_urcari` n-ar avea typecheck și nici teste, doar «modul avion» de mână.
Corecție: funcțiile pure (`clasificaScan`, `imbinaCoada`) stau într-un modul testat cu vitest. Modulul se servește static (`public/mini-app/bilete.js?v=<sha>`, cache imutabil) sau e citit la build (`readFileSync` + `outputFileTracingIncludes`). Planul alege una dintre variante.

**ARH-14 · medium (−1.0) · dependențe inverse.**
- 5a «trimite notificările restante», dar notificarea abia se definește în 7d.
- 5b și 6 trimit la `/bilete`, care apare abia în pasul 11.
- Rezultatul pasului 4 cere «`/plati`-like intern», un instrument nedefinit.

Corecție: notificarea se mută în 7d, iar cron-ul se extinde acolo. Până la 11, contorul apare doar în digest. Integrarea pasului 4 se face cu `curl` + `checkoutUrl`.

**ARH-15 · low (−0.5) · «grupul de test» pentru S nu există.**
Nu apare nici în cod, nici în `app_config`. Corecție: pasul 0 îi cere lui Ion grupul, cu botul adăugat. Pagina spike, care ajunge în prod sub `/mini-app/`, afișează doar `initData`-ul celui care o deschide.

**ARH-16 · low (−0.5) · plafonul «120/min pe șofer în bază» n-are tabel în pasul 1.**
Corecție: se renunță la el (HMAC-ul + reîmprospătarea la 60 s ajung) sau tabelul se definește în pasul 1.

Fără deducere:
- Clientul injectat: ambii clienți sunt `SupabaseClient` netipizați. Anon vede aceleași rânduri: `offers active = true` (`015_enable_rls.sql:58`), iar interogarea filtrează explicit (`actions.ts:391-394`).
- CSP-ul permite JS inline și telegram.org (`next.config.js:25`). `frame-ancestors 'none'` blochează doar Telegram Web, nu telefonul.
- `/mini-app/` e deja public (`public-paths.ts:22`). Prefixele noi sunt înguste și au test.

### Deduceri
| Id | Severitate | Greutate |
|---|---|---|
| ARH-11 | high | −2.0 |
| ARH-12 | medium | −1.0 |
| ARH-13 | medium | −1.0 |
| ARH-14 | medium | −1.0 |
| ARH-15 | low | −0.5 |
| ARH-16 | low | −0.5 |
| Total | | −6.0 |

Scor: 4.0 · Blocante (critical/high): 1
