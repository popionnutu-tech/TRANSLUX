# Verificarea 1 (ION-95) — verdictul dezbaterii Claude + Codex pe cele 8 întrebări și 11 corecții (27.09.2026)

Părți: business-logic-auditor (Claude, `verif-run-dezbatere-claude.md`), Codex gpt-6-astra (`codex-debate-r0.md`). Regula lui Ion: km reali GPS.
Unde pozițiile diferă, se ia cea mai conservatoare susținută pe cifre (nicio schimbare de km fără metoda comună a etalonului pe zile-pereche).

## Ce se scrie în ideal-v2 ÎNAINTEA verificării 2 (numai mecanisme; 0 km schimbați manual)
1. **Generatorul de card legat în lanț** (`card-gps.mjs` din F3x) după ultima operație care rescrie scheletul și înainte de control/pagină; excepțiile explicite: < 3 perechi bune, C47 < 60 %, divergență de variante/porți → cardul vechi + steag «diagnostic cerut».
2. **Filtrul de curse rupte**, o singură funcție pentru etalon, C47 și generator, cu limite compatibile cu `plin` (marginea razei porții, nu centrul porții).
3. **Constatarea C22** («ziua aleasă nu e zi bună GPS») în verificator; harta NU se realiniază mecanic (la R27 ar pune 46,5 km lângă cardul 24,9) — după rezolvarea variantei.
4. **Mediana pe orice poartă la G1** ca diagnostic separat de selecția perechilor; raportate separat.
5. **Proveniența rulării**: sursa `ideal-v2` explicită, manifest, versiunile scripturilor; registrul C31 re-validat pe SHA-ul v2 (altfel C31 revin ca blocante).
6. **Actul, observația GPS și servirea încrucișată rămân separate**; «neclar» NU devine «ambele» (Q7: 0 km).
7. **Eligibilitatea exportului** (riscul 1 Codex): G1 pe v2 e circular; exportul e valid doar dacă fiecare linie cu C47 < 60 % sau variante nerezolvate poartă steagul «diagnostic cerut» în `schelet-drax.json` (vizibil în LDE) sau o explicație în registru; `valid_pentru_export` verifică asta.

## Valorile rămân (până la recalculul comun)
| Linie | Card | km/zi | Motiv |
|---|---:|---:|---|
| Usurei | 37,4 | 74,8 | deja în v2 (−5,2 față de vechi) |
| Bocancea Schit | 54,5 | 109,0 | 50,0 = 29 picioare, nu 7 perechi; perechile dau 46,2; C47 filtrat ≈ 45 % |
| Zarojeni | 28,9 | 115,6 | C47 41 %; 30,7 = selecția veche |
| Catranic | 30,0 | 60,0 | 2 < 3 perechi bune după filtru |
| Sturzovca | 24,9 | 149,4 (3 ture) | 24,2/26,5/46,5 = trei selecții; frecvența 3 vs 1 de verificat |
| Trifănești | 42,3 | 169,2 (2 ture) | două variante (146BRAZ ≈ 40,7, 518MHD ≈ 53,3) neseparate |
| Nihoreni | 44,2 | 176,8 (2 ture) | variantele EZ/D neseparate |

## Ce așteaptă F4 / tichetul de corecții ION-71
- 518MHD ca variantă/linie separată (scenariu 2 ture: 213,2 km/zi; netul flotei nemăsurat), Nihoreni EZ/D (+16,8 dacă o tură D), Sturzovca frecvența (−99,6 doar dacă 3 → 1 dovedit), Zarojeni fereastra recentă (0…+7,2), Bocancea asimetria pe sens/schimb (−9,0…−11,8 nesusținute), Catranic regula de rezervă (−2,2), dublurile reconciliate pe identitatea dispozitivului (880RNK 40,31 vs 45,89), salturile între porți și coliziunea `m|t0`, ora: inventar semantic complet (generatorul are UTC+3 la linia 22; `economie/comun.mjs:47` e ziua operațională 03:00, nu UTC+3) înainte de 25.10, prânzul.
