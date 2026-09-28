# ION-120 — verdictul: cele 4 reguli de optimizare Drăxlmaier (28.09.2026)
Ion: «1. Auto la capăt de rută rămâne dacă ruta se termină în aceeași localitate; 2. Auto rămâne la uzină; 3. Rutele împărțite altfel; 4. Nu pleacă acasă
între schimburi. Lansează Claude Codex în dezbatere pentru a optimiza și oferi live.» Dezbaterea: Claude (business-logic-auditor + uzina-analist) + Codex,
3 runde (r1 5,5 fail · r2 2,5 fail · r3 10/10 pass). Deciziile lui Ion (28.09): Bălți în afara regulii 1 («no»); regula 1 după săptămână («depends on weekly» →
prag 100 km/săpt. pe mașină); regula 2 fără plafon («ok»); regula 3 doar dacă totalul flotei scade («if 1 bus is doing more and other less — what is the point?» → ≥ 50 km/săpt.).
Definițiile finale: runda-3.md; textul regulilor: migrația 419 (§8.5, §8.7). Săptămâna 14–20.09 (după ION-119):
| regula | măsurat | extrapolat | pe cine |
|---|---|---|---|
| 1 doarme la capăt | 528 | 628 | 518MHD 194 (șoferul la 15,6 km), 710CWN 149, 346KAJ 116, 713IZX 108 |
| 2 rămâne la uzină | 186 | 222 | 293QVT 160, 146BRAZ 27 |
| 3 rute împărțite altfel | 0 | — | niciun schimb nu scade totalul flotei cu ≥ 50 km/săpt.; locurile pe tip de confirmat |
| 4 nu pleacă acasă | 2.713 | 3.225 | = R1b; așteaptă la capăt 1.221, la uzină 1.492 |
| împreună 1 + 2 + 4 | 3.428 | 4.075 | fiecare km într-o singură regulă (proba 38/38) |
| Bălți (separat) | 474 | 563 | — |
Lanțul de luni: saptamanal.sh → patru-reguli.mjs + scrie-reguli4.mjs (date.reguli4; eșecul nu atinge rândul). Rularea automată rămâne OPRITĂ (ION-112).
Deschis: locurile pe tip (lde_vehicle_types.passenger_seats NULL) — de la Ion; fără ele regula 3 e condiționată.
