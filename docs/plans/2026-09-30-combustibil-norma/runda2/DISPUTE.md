# Runda 2 — punctele de dezacord și protocolul comun

## Protocol comun de backtest (obligatoriu pentru ambele părți în runda 2)
- Țintă = litri în fereastra lunii ca în producție (prima zi cu km → ultima zi cu ≥ 20 km), km = GPS corectat (regula parcării 444), m2m doar unde GPS lipsește.
- Test 1: calibrare 10.06–31.08.2026 → predicție 01–27.09.2026. Test 2: calibrare 10.06–31.07 → predicție august.
- Eșantion: ≥ 3.000 km în calibrare, ≥ 1.000 km în lună testată, ≥ 95 % km din GPS în lună testată. Raportează N vehicule.
- Metrici: WAPE, bias, eroare procentuală mediană, P90 al erorii abs — pe total, fără camioane, camioane.
- Fiecare metodă folosește DOAR date anterioare lunii testate.

## Dezacorduri de rezolvat pe date
1. **Metoda normei.** Claude: N = (km·r_mașină + 5.000·r_tip)/(km + 5.000), r = Σl/Σkm pe 3 luni închise (mediana erorii 4,1 % vs 4,8 % plin la plin). Codex: plin estimat la plin estimat, zilnic, ≥ 3 intervale și ≥ 3.000 km, fallback norma veche (WAPE 6,76 % vs 7,10 % SQL). Rulați AMBELE (și combinația lor, ex. plin la plin + shrinkage spre tip) pe protocolul comun.
2. **Granița intervalului.** Claude: cu ora din benzol, biasul interurban scade de la −2 % la 0,3 % și alarmele «plin fără drum» de la 316 la 29. Codex: decalarea ferestrei km cu ±1 zi înrăutățește (11,36/6,98/7,79 %). Nu e același test — clarificați: împărțirea km-ilor zilei la ora alimentării (benzol are oră, foaia nu).
3. **P90 pe înregistrări vs pe totalul zilei** (Codex: SQL testează înregistrările individuale). Și «înregistrări cumulate peste rezervor» la Sprintere interurbane (Claude: până la 289 l/sesiune în 2025) care păcălesc detectarea plinului.
4. **Norma din producție include luna judecată** (Codex) — lookahead. Confirmați și cuantificați.
5. **Camioane:** eroarea 21–26 % oricare metodă. Ce se poate totuși (3 luni cumulate, bilanț de rezervor virtual, Wialon)? Claude: 9.920 l «nu încap în rezervor» (rezervor virtual, normă 45 l/100); Codex: regula «foaie > max benzol» nu măsoară rezervorul. Verificați rezervorul virtual al lui Claude.
6. **Mașini fără km:** Claude 5 camioane; Codex 8 (+ MWC069, 405LLA, 239DQO). Care e lista corectă și de ce?
7. **Km:** Codex: km_total ≠ km_check + km_patched în 70,5 % din rânduri; ambii: m2m e SUB GPS cu 1–4 %, nu 8 % peste. Ce înseamnă pentru normă?
8. **Supraconsum/deteriorare:** Claude: 603BRAS/S004, 279BRAT+034BRAT/S217, 783MUM, 10 mașini cu 5.660 l peste mediana tipului. Codex: persistență >20 % în 2 luni (783MUM, HMK135, LJN080, 603BRAS, 279BRAT, 710CWN) + 2025→2026 m2m (602BRAS +42 %, 863MXL +34 %). Uniți lista, eliminați ce e explicat de km greșiți.
9. **Pragul de abatere:** Claude: max(10 %, 2 plinuri tipice) / tabel pe km; Codex: ±15 % supraveghere, >20 % investigație; camioanele fără imputare automată. Convergeți.
