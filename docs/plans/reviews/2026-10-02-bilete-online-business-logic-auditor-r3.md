## Review: business-logic-auditor — runda 3

### Runda 2 pe v3

| id | stare | de ce |
|---|---|---|
| BL-11 | închis | decizia 4 + 4b: termenul intră în 060 ȘI în 320 |
| BL-12 | închis | 4b: `bilete_online_sesiune(trip_date, crm_route_id)` pe cheia `counting_sessions (crm_route_id, assignment_date)` (`021:18`), returul override rămâne pe rândul A (`320:277`) |
| BL-13 | închis (termenul) | `valid` + `urcat`, fără condiție de timp, plus «Neprezentați». Partea cu ziua confirmată lipsește → BL-18 |
| BL-14 | închis | pasul 6: `/plati` → `anuleazaSiReturneaza` |
| BL-15 | închis (oferta) | `pret_numarare`. Rata → BL-19 |
| BL-16 | închis | pasul 1: `Europe/Chisinau`, data corectată, test 24–26.10 |

### Noi

- **BL-17 · medium.** Pe lângă `diff`, starea se recalculează separat: `060:103-111` (`no_cashin`, `ok`, `underpaid`) și `320:300-312` (`no_incasare`, `ok`, `underpaid`). Planul spune doar «termenul intră în funcție». **Eșec:** dacă termenul intră numai în `diff`, rândul are `diff ≈ 0` și stare `underpaid`. Dacă pe rută au plătit doar pasagerii online, rândul apare `no_incasare`. **Corecție:** 4b scrie explicit că `suma_numarare` intră în `incasare_lei` și în toate ramurile CASE din ambele funcții. Testul pe zi verifică și starea, nu doar diferența.

- **BL-18 · medium.** Din corecția BL-13, v3 a pierdut partea despre refund după `incasare_day_confirmations` (`051`). Adminul anulează din `/bilete` fără limita de 2 h (pasul 6). **Eșec:** un bilet `valid` nescanat, al unui pasager care a călătorit și a fost numărat de cameră, e returnat a doua zi. Termenul dispare retroactiv, iar ziua deja confirmată arată lipsă la șofer. **Corecție:** după plecare, refund-ul unui bilet `valid` cere confirmare cu textul «camera l-a numărat?». Pe o zi confirmată, refund-ul dă alertă.

- **BL-19 · medium.** `pret_numarare` e înghețat la vânzare, cu rata ultimei perioade ≤ `trip_date` (`apps/web/src/app/(public)/actions.ts:104-122`, fallback `latest`). Ratele se schimbă săptămânal: 1,13 / 1,16 / 1,19 pe 11, 18 și 25.09 (`tariff_periods`, citit 02.10). Camera folosește rata zilei cursei (`numarare/actions.ts:504-520`). **Eșec:** un bilet cumpărat pe 20.09 pentru 26.09 e valorizat la 1,16, iar camera numără la 1,19. Rezultă o lipsă falsă de −2,6 % pe fiecare pasager online. Când `rate_interurban_short ≠ long` (`dual_interurban_tariff=true`, pragul de 65 km), diferența crește. **Corecție:** `suma_numarare` se calculează în SQL la raport: km-ul segmentului × rata `tariff_periods` a `trip_date`, după aceleași reguli lung/scurt/suburban. `pret_numarare` rămâne doar ca istoric.

- **BL-20 · low.** Maparea returului la sesiune există de două ori: TS în 2b (`sesiuneaNumararii`, ca `assignments.ts:93-118`) și SQL în 4b. Planul nu cere ca SQL-ul să repete trecerile 1 și 2 și nici un test de paritate. **Corecție:** test care compară cele două mapări pe o zi cu `retur_route_id`.

### Deduceri
BL-17: −1.0; BL-18: −1.0; BL-19: −1.0; BL-20: −0.5. Total −3.5.

Scor: 6.5 · Blocante (critical/high): 0
