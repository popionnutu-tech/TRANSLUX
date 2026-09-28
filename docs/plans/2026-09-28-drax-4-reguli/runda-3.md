# ION-120 — runda 3: deciziile lui Ion + triajul Codex r2

## Deciziile lui Ion (28.09.2026, în chat)
1. «Nopțile în Bălți intră în R-1?» — «no»: rămân separat (§7.4), în afara totalului R-1 și în afara lui R-3 (nu se fac «gratuite» acolo).
2. «R-1 cu șoferul la ≥ 15 km de capăt?» — «depends on weekly»: R-1 se PROPUNE mașinii doar dacă R-1-ul ei pe săptămână ≥ 100 km (pragul §12.2); distanța
   șoferului (locul nopții → X) se arată lângă propunere; naveta nu se numără (§5.10).
3. «R-2: plafonul §8.3?» — Ion, după explicație («293QVT și 146BRAZ pleacă de la uzină între tur și retur, 186 km/săpt., fără oprire lungă; le numărăm la R-2?»):
   «ok» → R-2 = TOȚI km-ii din afara zonei între tur și retur, FĂRĂ plafonul §8.3 (fără «nelămurit» la R-2). Decizie a lui Ion, nu a datelor.
4. «R-3 cu pierderi?» — «We compare the end result of changing, if 1 bus is doing more and other less — what is the point?»: se compară TOTALUL flotei înainte
   și după; schimbul se propune doar dacă totalul scade cu ≥ 50 km/săpt.; unde una câștigă cât pierde cealaltă — nu.
5. Capacitatea (C7): lde_vehicle_types.passenger_seats există, dar e NULL la toate tipurile — cerut lui Ion (locurile pe tip). Până atunci R-3 = candidați
   CONDIȚIONAȚI («capacitate de confirmat»), în afara economiei validate.

## Triajul Codex r2 (r1/codex-runda-2.json sau codex-runda-2.json): 2,5 fail — C5, C6, C7 high, C8 low
- C5 ACCEPTAT: R-3 = economie față de costul REAL de azi: rezidualul GPS al marginilor după R-1/R-2/R-4 (km reali ai livrării neacoperite de R-1, fără golul impus);
  Valhalla doar pentru drumurile PROPUSE (casa lui B → capetele liniilor lui A). Comparația Valhalla–Valhalla rămâne diagnostic separat.
- C6 ACCEPTAT: scenariul comun după R-1/R-2/R-4 — fiecare noapte are starea: R-1 (acoperită), deja la X, Bălți (exclusă, NU se face gratuită), weekend,
  neeligibilă; costurile rămase se recalculează după schimb pe aceleași stări. Programele (mașinile) cu zile excluse §8.6 nu intră în propuneri (doar diagnostic).
- C7 ACCEPTAT: capacitatea observată ≠ confirmată → candidați condiționați până la locurile pe tip (punctul 5).
- C8 ACCEPTAT: Bălți pe eșantion 473,5 (≈ 563 extrapolat), 591,7 pe toate zilele doar diagnostic.

## De re-măsurat (r3/, același script corectat): R-1 cu Bălți afară și pragul pe mașină; R-2 fără plafon; R-4; R-3 după C5/C6/C7 + regula lui Ion (total flotă −50).
