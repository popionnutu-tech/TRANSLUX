## Review: senior-backend-engineer

Runda 1 · zona: arhitectura și ordinea pașilor.

**ARH-1 · critical (−3.0) · legarea prin `message:contact` nu cere ca contactul să fie al expeditorului.**
Dovadă: telefonul șoferului e public pe translux.md (`apps/web/src/app/(public)/actions.ts:457`, `phone: driver?.phone`); botul primește orice mesaj privat (`apps/bot/src/bot.ts:381`); planul (pasul 7a) potrivește doar `phone_number` cu `drivers.phone`.
Scenariu: oricine ia de pe site numărul șoferului X, îi trimite botului cartea de contact a lui X (atașament → contact). Botul îi leagă `telegram_id`-ul de X, iar omul vede numele și telefoanele pasagerilor și poate marca «urcat».
Corecție: legarea se face doar când `contact.user_id === ctx.from.id`; altfel se refuză și se scrie în `drivers_telegram_incercari`. Test pentru contactul străin.

**ARH-2 · high (−2.0) · ordinea de lansare: butonul ajunge în prod înaintea API-ului, a mini app-ului și a uneltelor admin.**
Dovadă: steagul `crm_routes.bilete_online` apare abia la pasul 10. central-hub se livrează la fiecare push pe main (CLAUDE.md), iar pasul 3 vine înaintea pasului 4. Pasul 8 se bazează pe identitatea din 7, dar handlerul botului e la 9. Riscul F8 cere testul «înaintea pasului 8», deși 9 vine după 8. `/bilete` (11), cu refundul manual pe care îl cere tabelul de riscuri, vine după lansare (10).
Scenariu: după push-ul pasului 3, pasagerii apasă «Cumpără bilet» pe toate cele 30 de rute și primesc 404/500. Odată puse cheile de prod (pasul 0), biletele se plătesc înainte ca șoferul să le poată verifica.
Corecție: steagul (global `app_config.bilete_online_activ` + per rută) intră în migrația pasului 1, iar `sale_open` îl cere. Ordinea: 0 → 1 → 2 → 4 → 5 → 6 → 3 (ascuns) → spike F8 + `requestContact` → 7 (cu handlerul botului) → 8 → 9 → 11 → 10.

**ARH-3 · high (−2.0) · «≤ 60 KB JS» e de neatins într-o rută Next sub layout-ul rădăcină.**
Dovadă: `apps/admin/src/app/layout.tsx:2-36` încarcă 2 fonturi Google și `globals.css` pe orice rută. Runtime-ul App Router (React + Next) depășește singur bugetul, iar mini app-urile de azi au 150 KB (F11).
Scenariu: pasul 8 se blochează sau criteriul cade în tăcere.
Corecție: `mini-app/bilete` devine un Route Handler care întoarce HTML static + JS vanilla inline (fără React), cu SDK-ul în `<head>`. Bugetul se măsoară pe răspunsul HTML.

**ARH-4 · medium (−1.0) · prețul are deja o a treia copie.**
Dovadă: `apps/admin/src/lib/trips-search.ts:105-151,410` (580 de linii, `pickRate` duplicat) e folosit de asistent (`site-assistant/cards.ts:8`). Rata pe dată (`resolveTariffRates`, `actions.ts:100`) și oferta (`:433`) nu sunt în `timetable.ts`.
Corecție: în `packages/db` merge un `calculeazaPret(db, {data, ruta, de, spre})` cu clientul injectat, care face rata + oferta + `buildScheduledTrips`. Îl folosesc `actions.ts`, `trips-search.ts` și API-ul comenzii. Testul compară încărcarea, nu doar funcția pură.

**ARH-5 · medium (−1.0) · `/start bilete` lovește tokenul de invitație.**
Dovadă: `apps/bot/src/handlers/start.ts:13-17`. Orice payload trece prin `validateInviteToken` și primește «Link de invitație invalid».
Corecție: payload-ul `bilete` se rutează înaintea invitației; test.

**ARH-6 · medium (−1.0) · extragerea `verifyInitData` fără plasă.**
Dovadă: `zadachnik/auth.ts:28-54` n-are niciun test. Ocolul `__dev__` (`:61-70`) întoarce un ADMIN. Consumatori: 7 rute zadachnik + `atribuiri/auth.ts:1`.
Corecție: în `lib/telegram/init-data.ts` merge doar funcția pură `verifyInitData(initData, token, nowSec) → {telegramId, startParam} | null`. Testele acoperă ambele variante de `signature`, expirarea și `user` lipsă. `authFromInitData` și ocolul dev rămân în zadachnik; auth-ul șoferului nu are ocol.

**ARH-7 · medium (−1.0) · normalizarea greșită a telefonului.**
Dovadă: `packages/db/src/driver-phone.ts:12` (`normalizeDriverPhone`, forma canonică 373XXXXXXXX, folosită de admin și bot) există deja. `apps/web/src/lib/phone.ts` e doar pentru afișare. Migr. 254/256 verifică doar că telefonul nu e gol, deci rândurile vechi au formate amestecate.
Corecție: `lib/phone.ts` nu se mută. Ambele părți trec prin `normalizeDriverPhone` (cu `PhoneError` prins), iar coincidența multiplă merge la admin.

**ARH-8 · low (−0.5) · eroarea RPC din callback.**
Dovadă: `api/pay/maib/callback/route.ts:113-116` întoarce 500 la erori de citire.
Corecție: dacă `bilete_marcheaza_platita` dă eroare, callback-ul întoarce 500 (maib reîncearcă, funcția e idempotentă). Notificarea șoferului rămâne în afara căii critice.

**ARH-9 · low (−0.5) · presupunere de verificat despre `requestContact`.**
Corecție: spike-ul F8 verifică dacă `contactRequested` aduce un `response` semnat; dacă da, legarea în API-ul admin, fără `deploy-bot`.

**ARH-10 · low (−0.5) · lipsesc din «Fișiere»:** `apps/admin/src/lib/trips-search.ts`, `apps/web/src/lib/route-pages.ts` (importă timetable la `:5`), `apps/web/src/lib/timetable.test.ts` (se mută), `packages/db/src/index.ts`, `apps/admin/src/lib/zadachnik/auth.ts`, `apps/bot/src/handlers/start.ts` (rutarea payload-ului) și crontab-ul VPS pentru `bilete-expirare`.

Fără deducere: API-ul admin + cheie comună (F5/F6) e corect; `@translux/db` se construiește înaintea web/admin (`vercel.json`, `apps/admin/vercel.json:6`).

### Deduceri
| Id | Severitate | Greutate |
|---|---|---|
| ARH-1 | critical | −3.0 |
| ARH-2 | high | −2.0 |
| ARH-3 | high | −2.0 |
| ARH-4 | medium | −1.0 |
| ARH-5 | medium | −1.0 |
| ARH-6 | medium | −1.0 |
| ARH-7 | medium | −1.0 |
| ARH-8 | low | −0.5 |
| ARH-9 | low | −0.5 |
| ARH-10 | low | −0.5 |
| Total | | −12.5 → 10 − 12.5 = −2.5, plafonat la 0.0 |

Scor: 0.0 · Blocante (critical/high): 3
