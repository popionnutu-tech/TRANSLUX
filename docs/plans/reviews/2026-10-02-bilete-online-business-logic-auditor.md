## Review: business-logic-auditor

### Observații

- **BL-1 · high.** Încasarea online nu e trecută în raportul de încasări. `get_incasare_report`: `diff = cash + diagrama + ligotniki0 + rashodi − numarare.suma`, iar `numarare.suma` vine din `counting_sessions.tur/retur_total_lei` (`packages/db/migrations/060_anomaly_grafic_history.sql:20-27, 95-99`). **Scenariul de eșec:** 3 pasageri online × 150 lei sunt numărați pe cameră, șoferul nu predă banii lor, iar în /numarare → Încasare apare cu −450 lei. Planul nu pomenește nici Numărarea, nici tiki_tickets/ION-167. **Corecție:** un pas nou: `bilete_online_pe_sofer(driver, ziua)` (bilete `urcat`/`valid` pe cursa șoferului) se adaugă ca termen pozitiv în `diff`. Regula pentru șofer se scrie explicit: nu emite bon la terminal pentru biletul online. Planul spune dacă vânzările online intră în «Bilete aparat» (ION-167).

- **BL-2 · high.** Un refund cu rezultat ambiguu redeschide biletul. Pasul 6 spune: «maib refuză → status înapoi `platita`». Riscurile spun opusul: «rămâne `anulata`». În `/plati`, la excepție se șterge revendicarea (`apps/admin/src/app/(dashboard)/plati/actions.ts:214-216`). **Scenariul de eșec:** POST refund dă timeout, deși maib l-a creat. Comanda revine `platita`, biletele rămân `valid`, iar pasagerul își primește banii și urcă în autobuz. **Corecție:** la timeout sau la un 5xx, comanda rămâne `anulata` cu `refund_status='Pending'`, iar cron-ul pasului 5 o împacă prin `getPayment.refundedAmount`. Comanda revine `platita` doar la un refuz 4xx sigur. Biletele trec în `anulat` în ACELAȘI UPDATE de revendicare, înaintea apelului la maib.

- **BL-3 · high.** Lista offline a șoferului e veche după o anulare. Pasul 8 scanează din cache, iar anularea e permisă până la T−2h. **Scenariul de eșec:** șoferul deschide aplicația la 07:00, pasagerul anulează la 09:00 pentru cursa de 14:00 și primește refund. La 14:00 șoferul e fără rețea și vede verde. **Corecție:** cache-ul are `generat_la`, afișat pe ecran, și se reîmprospătează obligatoriu în fereastra T−2h…T. `POST /urcat` pe un bilet `anulat`/`returnat` nu-l trece în `urcat`: răspunde cu un conflict care ajunge în jurnal (`bilete_scanari`) și în alerta pentru admin.

- **BL-4 · high.** Șoferul de retur e luat greșit. Pasul 8 ia «retur `driver_id_retur`», dar retur-ul real se rezolvă prin `retur_route_id` (override IN/OUT), în `apps/web/src/lib/assignments.ts:93-118`. **Scenariul de eșec:** în ziua cu override, pasagerii cursei R Chișinău→nord ajung la șoferul propriu al lui R, care nu face cursa. Notificarea din pasul 7 pleacă la el, iar șoferul real vede lista goală. **Corecție:** `buildTur/ReturAssignmentMap` se mută în `packages/db` și se folosesc ACELEAȘI funcții în web, la validarea comenzii, în `/bilete-sofer/azi` și la notificare.

- **BL-5 · medium.** Mutarea prețului e incompletă. Prețul real mai depinde de `resolveTariffRates` (`actions.ts:100-129`), de oferta din `offers` potrivită după numele localităților (`:395-400, 433-438`) și de km-ii căutați prin `normalizeStop(nume)`, nu prin `stop_order` (`:361-362, 385-394`). **Corecție:** pasul 2 mută funcția întreagă `pretSegment(fromRo, toRo, date, routeId, goingNorth)`, iar comanda salvează numele căutate, nu doar `stop_order`.

- **BL-6 · medium.** Ziua graficului diferă între web și admin. `resolveAssignmentDate` ia graficul zilei anterioare pentru D+1…D+7 (`actions.ts:231-265`), deci web-ul arată un șofer «atribuit» care nu există pe `trip_date`. Admin respinge comanda (pasul 4) după completarea formularului. **Corecție:** `sale_open` cere ca `assignmentDate === date`.

- **BL-7 · medium.** Împăcarea ocolește verificările callback-ului. Callback-ul refuză o sumă care nu se potrivește (`callback/route.ts:123-132`), dar cron-ul pasului 5 marchează plătit orice `Completed`. În plus, un `Executed` pe o comandă `expirata`/`anulata` dă 0 rânduri și trece în tăcere, deși banii sunt luați. Dacă RPC-ul eșuează, nu e definit codul HTTP. **Corecție:** cron-ul compară `amount` cu `total`. Un rezultat de 0 pe un checkout Completed cu comanda ≠ `platita` → alertă + refund. O eroare RPC → 500, ca banca să reîncerce.

- **BL-8 · low.** Revendicarea anti-dublu nu stă în client, cum spune planul, ci într-o server action cu `requireRole('ADMIN')` (`plati/actions.ts:180-198`; `lib/maib/client.ts:252` nu scrie în bază). **Corecție:** planul prevede extragerea ei într-un `lib/maib/refund.ts` comun.

- **BL-9 · low.** `departure_at` greșește după miezul nopții. Ora vine din `hour_from_*` + `trip_date`, iar o oprire după 00:00 pe o cursă de seară (`timetable.ts:132-133`) primește data greșită, deci și termenul de 2 h e greșit. **Corecție:** data se calculează din ora de pornire a rutei + `segmentMinutes`.

- **BL-10 · low.** Cursa anulată de companie nu are acoperire. Lipsește verificarea «bilete plătite pe o cursă fără șofer la T−3h» → alertă / refund admin. **Corecție:** se adaugă în cron-ul pasului 5.

### Deduceri
BL-1..BL-4: −2.0 fiecare (−8.0); BL-5, BL-6, BL-7: −1.0 fiecare (−3.0); BL-8, BL-9, BL-10: −0.5 fiecare (−1.5). Total −12.5 → scor plafonat la 0.0.

Scor: 0.0 · Blocante (critical/high): 4
