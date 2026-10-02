## Review: business-logic-auditor — runda 2

### Runda 1

| id | stare | de ce |
|---|---|---|
| BL-1 | parțial | termenul există, dar e construit greșit → BL-11/12/13 |
| BL-2 | închis | 6: revine doar la 4xx; bilete `anulat` în aceeași tranzacție |
| BL-3 | închis | 8: T−2h…T; `/urcat` doar pe `valid` |
| BL-4 | închis | 2b |
| BL-5 | închis | 2a; `from_name`/`to_name` |
| BL-6 | închis | 3, 4a |
| BL-7 | închis | 1 (suma în funcție), 5a |
| BL-8 | închis | dar a adus BL-14 |
| BL-9 | închis | ora de pornire; fusul orar → BL-16 |
| BL-10 | închis | 5a |

### Noi

- **BL-11 · high.** 4b corectează doar `get_incasare_report`. `get_grafic_report` are aceeași formulă (`320_grafic_report_numerar_manual.sql:298, 311-312`). **Eșec:** în raportul pe rută, cursa cu 3 bilete online apare `underpaid` −450, iar Încasare arată `ok`. **Corecție:** 4b schimbă ambele funcții, cu test pe aceeași zi.

- **BL-12 · high.** Numărarea pune tur și retur pe `cs.driver_id` al sesiunii rută-zi (`060:20-27`). Raportul pe rută pune returul override pe rândul A (`320:245, 277`). Planul atribuie biletele online prin 2b: retur → `driver_id_retur` sau ruta B (`assignments.ts:99-104`). **Eșec:** când returul e făcut de alt șofer sau prin override, A iese `underpaid` și B `overpaid`. **Corecție:** termenul se agregă pe cheia sesiunii de numărare (ruta rândului din grafic, cu returul mapat invers prin `retur_route_id`, plus `trip_date`) → `cs.driver_id`. Ziua se ia din `trip_date`, nu din `departure_at::date`.

- **BL-13 · high.** «`urcat` (și `valid` până la plecare)»: raportul se face după cursă, deci un bilet nescanat iese din termen. **Eșec:** șoferul nu scanează (grabă, scanare portocalie, coada netrimisă). Camera numără pasagerul (`060:96-99`), iar șoferul apare cu lipsă, ca în BL-1. **Corecție:** termenul = `valid` + `urcat` nereturnate, plus o coloană «neprezentați online». Un refund după `incasare_day_confirmations` dă alertă și nu rescrie ziua confirmată.

- **BL-14 · high.** `/plati` listează toate `maib_checkouts` (`plati/actions.ts:61`), iar «Returnează» (`:179-218`) atinge doar `maib_checkouts`. **Eșec:** adminul returnează o plată de bilete din `/plati`. Biletele rămân `valid`: verde la șofer, pasagerul urcă, Încasarea creditează suma. 5a nu prinde cazul, pentru că filtrează doar comenzile `anulata`. **Corecție:** `/plati` refuză checkout-urile legate de `bilete_comenzi` și trimite la `/bilete`, sau `lib/maib/refund.ts` anulează și biletele.

- **BL-15 · medium.** Camera socotește km × rată (`numarare/calculation.ts:57-66`), fără ofertă. Prețul online include oferta (`apps/web/src/app/(public)/actions.ts:45-56`), deci fiecare reducere lasă o lipsă falsă. **Corecție:** prețul de tarif se salvează separat și intră în termen, sau reducerea are o coloană proprie.

- **BL-16 · low.** `departure_at` e `timestamptz` calculat dintr-o oră locală; ora de iarnă începe pe 25.10.2026. **Corecție:** calculul se face în `Europe/Chisinau`, cu test pe 24–26.10. `segmentMinutes(time, arrival)` măsoară segmentul urcare→coborâre (`timetable.ts:74-77`), deci se apelează cu (ora de pornire, ora opririi de urcare).

### Deduceri
BL-11..14: −2.0 × 4 = −8.0; BL-15: −1.0; BL-16: −0.5. Total −9.5.

Scor: 0.5 · Blocante (critical/high): 4
