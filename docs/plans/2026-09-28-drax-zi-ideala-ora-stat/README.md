# ION-128 — ziua ideală: ora punctelor de staționare în drumul direct

Ion, 28.09, pe ziua lui 446ASB (14.09, Călugăr → Scumpia, R23): «analizează».

## Ce s-a găsit
- Urma GPS (`economie-urme/<mașină>/<zi>.json`) are două feluri de puncte: `{t, lat, lon, v}` și staționarea `{stat:1, t0, t1, lat, lon}`.
- `ziua-ideala.mjs` (ION-123) sorta punctele după `t`; staționarea n-are `t`, deci comparația dădea NaN și ordinea se amesteca.
  Observațiile «drum direct» ieșeau înapoi în timp (durată −170 min) și mai scurte decât șoseaua.
- 446ASB: legătura Scumpia ↔ uzină 37–42 km (toate 3 observațiile stricate) față de 46–49 km pe Valhalla;
  economia lui 338 km/săpt. în loc de 221. Pe flotă: 122 din 177 perechi GPS aveau cel puțin o observație fără oră.

## Reparația
- Staționarea intră cu ora t0 (și t1); observația se primește doar dacă merge înainte în timp.
- Controlul după: 0 observații cu durată ≤ 0; 15 perechi rămân sub 90 % din Valhalla, toate cu 8–36 observații valide (km reali GPS).

## Cifrele săptămânii 14–20.09
| | înainte | după |
|---|---|---|
| ziua ideală, măsurat | 5.423,8 | 5.313,5 |
| extrapolat | 6.447 | 6.316 |
| 446ASB km/săpt. | 337,6 | 221,3 |
| 388ASB | 179,7 | 186,1 |
| peste prag | 23 | 23 |

Migrația 430 (§8.8: regula orei + cifrele).
