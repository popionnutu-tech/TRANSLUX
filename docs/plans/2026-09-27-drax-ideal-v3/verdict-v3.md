# ION-97 ideal-v3 — verdictul dezbaterii Claude + Codex pe cele 7 linii (27.09.2026)

Părți: business-logic-auditor (Claude, `dezbatere-claude.md`, cu probe noi din graficul `daily_assignments`), Codex gpt-6-astra (`codex-debate.md`).
Regula: se aplică ce susțin amândouă sau ce hotărăsc datele (graficul confirmat); unde pozițiile diferă și cifrele nu decid, cardul
vechi rămâne cu steag «diagnostic cerut» (regula dezbaterii din 27.09). Km reali GPS; metoda comună = mediana pe zile-pereche bune.

| linie | v2 | VERDICT v3 | ture/zi | km/zi | steag | motiv |
|---|---:|---:|---:|---:|---|---|
| Catranic | 30,0 | **29,3** | 1 | 58,6 | **scos** | unanim: < 3 perechi bune în sept. (tracker 2302 rupt) → regula de rezervă pe toată fereastra, 41 de zile; orice poartă 29,5 |
| Mihăilenii Vechi | 55,7 | **54,8** | 1 | 109,6 | rămâne | unanim pe 54,8 (10 perechi; 58 = cursa comasată 12.09); steagul rămâne: din 14.09 linia o face 345KAJ, ale cărui picioare stau greșit pe R3\|Recea* (reatribuirea = corecție de lanț ulterioară) |
| Trifănești | 42,3 × 2 | **40,2** (doar 146BRAZ) | **2** | 160,8 | rămâne | graficul: 518MHD are R16 pe ambele schimburi zilnic 01–22.09 și nicio zi pe R32 → cursele lui NU sunt ale Trifăneștilor; cele «4 ture» ar număra 518MHD de două ori (și pe R16). Card = mediana pe perechile 146BRAZ. Steag: 146BRAZ face și R18 în aceeași cursă (Gura Căinarului, Putinești) |
| R16 Florești | 35,7 × 2 | **neschimbat** | 2 | 71,4 | **pus** | drumul real al lui 518MHD e 52,9 km prin satele R32; NU se creează linie nouă (mecanismul unei linii derivate nu există în etalon — risc 3 Codex); de lămurit dacă ocolul prin R32 e cu oameni |
| Zarojeni | 28,9 | **28,9** | 2 | 115,6 | rămâne | dezacord (Claude 30,0 / Codex 28,9): D/EZ dau 53,3 / 25,6 pe aceeași fereastră — mediana comună ascunde servicii diferite; 9 perechi în sept., rezerva nu se aplică |
| Bocancea Schit | 54,5 | **54,5** | 1 | 109,0 | rămâne | dezacord (Claude 46,2 / Codex 54,5): drumul lung = 8 din 9 retururi de noapte, prin Bilicenii Vechi (sat al R19 — posibilă comasare), dar 0 perechi pe drumul scurt; excesul nedovedit |
| Sturzovca | 24,9 × 3 | **24,9 × 3** | 3 | 149,4 | rămâne | acord pe ținta 24,0 × 2 pentru serviciul direct, dar bucla 727CWN (93 km/tură) nu are încă o regulă de atribuire reconciliată cu R11; scoaterea ei ar ascunde km reali |
| Nihoreni | 44,2 | **44,2** | 2 | 176,8 | rămâne | dezacord (Claude 42,3 un card / Codex 44,2): D face +12 km încărcați fără sate în plus; drumul de 38,6 = tăiere greșită (186OMM, dus-întors) — se scoate din întrebări; EZ instabilă 41,4 / 44,3 |

Efect pe flotă față de v2: Catranic −1,4 · Mihăileni −1,8 · Trifănești −8,4 = **−11,6 km/zi** (≈ 5.754 km/zi).

## Mecanism (ambele părți de acord)
1. `decizii-v3.json`: doar METODE (sursa, selecția perechilor, mașinile incluse/excluse cu motiv și proveniență), niciun km scris; fiecare decizie cu valoarea așteptată, rularea pică dacă rezultatul diferă cu > 0,1 km. Aplicat de `card-gps.mjs`; verificatorul citește același fișier sigilat.
2. Verificatorul se aliniază: (a) dedup ±3 min doar pe aceeași mașină și pe același dispozitiv (`etalon-gps.mjs:68`); (b) regula de rezervă pe toată fereastra doar la < 3 perechi bune GPS după filtre, cu gardă de similaritate a drumului; (c) ziua de lucru = `timp.mjs` importat (03:00 ceas local), versiunea tzdata în proveniență; (d) citește `decizii-v3.json`. Versiunea scriptului crește; registrul se re-semnează.
3. Trifănești: excluderea curselor 518MHD din populația liniei prin decizie (motiv: graficul R16), nu prin redenumire.
4. Scos din întrebări: drumul de 38,6 km la Nihoreni (artefact de tăiere). De reținut pentru corecțiile următoare: reatribuirea 345KAJ Mihăileni, tăierea dus-întors la 186OMM, `alege.mjs` fără filtrul de urme rupte, generatorul pe dată calendaristică vs zi operațională (C47).
