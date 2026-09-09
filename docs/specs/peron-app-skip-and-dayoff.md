---
kit: spec
name: peron-app-skip-and-dayoff
title: «N-am fost la cursă» + vinerea zi fără operator
created: 2026-09-09
sessions:
  - id: S01
    title: Bot — tabela de curse sărite (migrația 332, scrisă), POST /app/v1/skip, poarta de curățenie la prima cursă raportată, zi liberă în /day și în digest
    gates: [build-packages, build-bot, test-bot]
    approve: [migration]
  - id: S02
    title: Aplicația — butonul «N-am fost la cursă», cursele sărite în grilă, ecranul de zi liberă
    gates: [typecheck-app]
    approve: []
---

# «N-am fost la cursă» + vinerea zi fără operator

## De ce

Vitalie (09.09, prin Ion): «Aurel dimineața vine mai târziu, 07:30. Foto la 06:55, 07:30
n-o să poată face. Vinerea? Cum fără fotografie». Azi grila e strict secvențială: cursa
06:55 blochează tot ce urmează, iar poarta de curățenie e legată de prima cursă a zilei.
Un operator care vine la 07:30 nu poate raporta nimic. Iar vinerea, când nu e operator
deloc la Chișinău, raportul de seară ar reclama poze și prezență lipsă degeaba.

## Decizii fixate înainte de start

- **Cursă sărită** = «operatorul n-a fost la cursă». Nu e «microbuz absent» (acela rămâne
  `reports.status = 'ABSENT'`). Se ține în tabelă separată, `operator_trip_skips`
  (migrația **332**; 329–331 sunt luate de alte sesiuni): `id, skip_date, point, trip_id,
  user_id, created_at`, unic pe `(skip_date, point, trip_id)`. Nu se scrie nimic în
  `reports`, deci tabla de încărcare, scoring-ul și pivotul rămân neschimbate (cursa
  apare ca neraportată, cum era și azi când lipsea operatorul).
- **Ordinea curselor:** o cursă sărită contează ca «închisă» pentru regula «prima
  neraportată = next». `tripStates` primește și setul de sărite → starea `skipped`
  (nu `done`).
- **Poarta de curățenie de dimineață** se aplică la **prima cursă raportată efectiv**
  în ziua aceea la punct (niciun rând în `reports` pe azi), nu la prima cursă din
  orar. Poarta de zi (16:25) rămâne la ora aceea; dacă 16:25 e sărită, poarta se aplică
  la prima cursă raportată după ea.
- **Sărirea nu cere poze** și nu cere GPS; se poate face oricând pentru cursa `next`
  (și doar pentru ea, ca să nu se sară în bloc fără sens: pentru 06:55 și 07:35 se apasă
  de două ori). Serverul refuză sărirea unei curse deja raportate (409).
- **Zi fără operator:** `config.noOperatorWeekdays = { CHISINAU: [5], BALTI: [] }`
  (5 = vineri, ISO). În ziua respectivă `/day` întoarce `dayOff: true` cu textul
  «Vineri: zi fără operator la Chișinău»; `/report`, `/skip`, `/cleaning-photo` și
  `/driver-photo` întorc 409 `DAY_OFF`; `/presence` acceptă ping-urile dar
  `presenceWindow` e `null` (aplicația nu urmărește). Digestul de seară sare secțiunile
  de curățenie și prezență pentru punctul respectiv și scrie un rând «Chișinău: vineri,
  zi fără operator».
- **Digest:** cursele sărite apar într-un rând per punct: «Chișinău: operatorul n-a fost
  la 06:55, 07:35 (Aurel)».
- **Bălți** primește aceeași funcționalitate de sărire (nu costă nimic în plus).
- Migrația 332 o scrie S01 și se oprește (`HOLD: migration`); dirijorul o aplică prin
  MCP, ca 326/328.

## Nu intră în scop

- Schimbarea botului Telegram (conversația rămâne cum e).
- Penalizări pentru curse sărite (doar apar în digest).

## Riscuri și necunoscute

- Un operator ar putea sări curse ca să nu facă poze. Digestul le listează cu numele;
  decizia e a lui Ion. Nu e HOLD.

## Cum înțelegem că totul a reușit

- [ ] `POST /app/v1/skip { tripId }` pe cursa `next` → 200; `/day` arată cursa `skipped`
      și următoarea `next`; pe o cursă raportată → 409.
- [ ] Prima cursă raportată efectiv (după 2 sărite) cere setul DIMINEATA (409
      `CLEANING_REQUIRED`); după set → 200.
- [ ] Vineri (`vi.setSystemTime` pe o vineri): `/day.dayOff = true`, `/report` → 409
      `DAY_OFF`; digestul are rândul de zi liberă și nu are secțiuni de curățenie/prezență
      pentru Chișinău.
- [ ] Aplicația: buton «N-am fost la cursă» pe cursa `next` (cu confirmare), celula
      sărită gri cu «—», ecran «Vineri: zi fără operator» fără grilă.
- [ ] Gate-uri verzi; e2e ≥ 8 teste noi.

---

## S01 — Bot

**Pași:**
1. `packages/db/migrations/332_operator_trip_skips.sql` (antet în stilul 326):
   tabela din «Decizii», index unic, RLS on. `packages/db/src/types.ts`: `OperatorTripSkip`.
   **Nu se aplică.**
2. `apps/bot/src/config.ts`: `noOperatorWeekdays`.
3. `services/db.ts`: `getSkippedTripIds(date, point)`, `createTripSkip(...)` (23505 → 409
   `ALREADY_SKIPPED`), `getSkipsForDate(date)` pentru digest.
4. `api/dayState.ts`: `tripStates(trips, reportedIds, skippedIds)` → `'done' | 'skipped' |
   'next' | 'locked'`; `nextTripId` sare peste `done` și `skipped`.
5. `api/day.ts`: `dayOff` + text, `skipped` în stări, `presenceWindow: null` la zi liberă.
6. `api/skip.ts` + ruta `POST skip`: validări (cursa e `next`, nu e raportată, nu e zi
   liberă), insert, răspuns `{ ok: true, next: <id|null> }`.
7. `api/reportRules.ts`: `cleaningGateSlot` primește `reportedIds` și `skippedIds`;
   DIMINEATA când `reportedIds.size === 0`; ZIUA când cursa e `cleaningGateTripTime`
   **sau** e prima raportată după ea (dacă 16:25 a fost sărită). `DAY_OFF` pe toate
   rutele de scriere.
8. `services/dailyDigest.ts`: rândul de zi liberă, rândul cu cursele sărite, sărirea
   secțiunilor de curățenie/prezență la zi liberă.
9. Teste: `dayState.test.ts` (skipped), `e2e.chisinau.test.ts` (scenariul Aurel:
   sare 06:55 și 07:35, raport 08:15 → CLEANING_REQUIRED → set → 200), `e2e.digest.test.ts`
   (vineri, curse sărite).

**Fișiere:** cele de mai sus.

**Gata când:** build-packages, build-bot, test-bot verzi; `HOLD: migration` la final cu
calea fișierului 332.

**Gate-uri:** build-packages, build-bot, test-bot.

**Nu atinge:** `conversations/*`, `peron-android/`, migrațiile existente.

---

## S02 — Aplicația

**Depinde de:** S01 — `/skip`, `state: 'skipped'`, `dayOff`.

**Pași:**
1. `src/types.ts`: `TripState` cu `skipped`, `DayResponse.dayOff`, `dayOffText`,
   `presenceWindow: ... | null`; `src/api.ts`: `postSkip(tripId)`.
2. `app/day.tsx`: la `dayOff` → ecran simplu cu textul serverului, fără grilă, fără
   urmărire GPS (`syncPresenceTracking` oprește dacă rulează); celula `skipped`: fundal
   `#f4f0ed`, bordură `#e6e2de`, text `#6b6560` cu «—» după oră; sub grilă, pentru cursa
   `next`, butonul contur «N-am fost la cursă» (52, `#6b6560`) cu confirmare
   (`Alert`: «Marchezi cursa HH:MM ca nefăcută de tine? Nu se cere cifră, nici poze.»)
   → `postSkip` → reîncarcă `/day`.
3. `app/trip/[id].tsx`: același buton în antetul cursei `next`, fără ciornă.
4. `src/cleaning.ts` / poarta locală: DIMINEATA când nu există nicio cursă `done`;
   ZIUA la `cleaningGateTripTime` sau la prima `next` după ea când aceea e `skipped`.
5. Fixture-urile `day.*.json` primesc `dayOff: false`, `dayOffText: null` (contractul).

**Fișiere:** `src/types.ts`, `src/api.ts`, `app/day.tsx`, `app/trip/[id].tsx`,
`src/cleaning.ts` (+ test), `src/__fixtures__/*.json`.

**Gata când:** typecheck-app, `npm test` verzi; `grep -c "N-am fost la cursă"
peron-android/app/day.tsx` ≥ 1.

**Gate-uri:** typecheck-app.

**Nu atinge:** `apps/*`, ecranele de curățenie și login.
