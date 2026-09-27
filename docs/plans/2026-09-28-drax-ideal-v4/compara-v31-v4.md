# Drăxlmaier: ideal-v3.1 («al meu», Ion) față de ideal-v4.1 (verdictul dezbaterii) — 27.09.2026

Dezbaterea Claude + Codex: runda 1 (Claude 1,5 / Codex 5,5), runda 2 (Claude 3,5 — doar pe subiectul Bălți; pe schelet business 7,0 și
verificator 7,5 / Codex 5,0 — ambele high tot pe Bălți). Pe SCHELET: 0 high deschise la ambele părți din runda 2; verificatorul v9:
valid pentru export, 0 blocante neexplicate. Activ din 27.09 18:3x: `drax/date/ideal-activ → ideal-v4.1` (schelet sha bfa070f0…).

## Ce era greșit în v3.1
1. **Capătul liniei luat doar din act** («Starting point», §4.1 vechi), nu de unde cursa reală începe turul și termină returul.
   Două linii aveau capătul greșit; km-ii cu oameni de dincolo de capăt ieșeau «goi» și umflau drumul «spre casă».
2. **§4.7 spunea că Balatina și Năvîrneț n-au opriri** — fals pe urmă: 925FTI și 351KAJ așteaptă 4–9 min la Năvîrneț înainte de tur
   (136 din 144 de curse opresc acolo); la Balatina ramura cu oprire și întoarcere pe 8/9 tururi.
3. Analiza săptămânală (etichetele) copia aceeași regulă, deci greșeala ajungea pe pagina /lde/reguli (925FTI «Musteața → acasă, 42 km»).

## Ce s-a schimbat (doar ce susțin ambele părți sau ce hotărăsc datele)
| linie | v3.1 | v4.1 | dovada |
|---|---|---|---|
| R37 Musteața | capăt Musteața · 43,5 km · drum 44,5 | capăt **Năvîrneț** · 60,2 km · drum 61,9 · s1 61,0/61,7 · s2 61,9/63,9 | 136/144 opriri la Năvîrneț, GPS sept. 59,7–61,5 km, 2 mașini, ambele sensuri; C47 100 % |
| R28 Cuhnești | capăt Cuhnești · 65,5 km · drum 65,5 | capăt **Balatina** · 75,0 km · drum 75,0 · s1 77,9/79,8 · s2 74,9/74,3 | 140/140 curse prin Balatina, ramura cu întoarcere, 3 mașini, GPS sept. 73,0–75,5 km; C47 91 % |
| celelalte 46 de linii cu ideal | — | identice | nicio altă linie nu trece criteriul (R32, R2, R21, R22, R18, R19: drumul de acasă sau orașe din §5.1) |
| flota, card | 5.819 km/zi | 5.872 km/zi | +53 km/zi = exact cele două linii |

Regula nouă (migrația 412, Ion: «fă schimbarea»): §4.1 excepția «capătul din GPS», §4.7 fără Balatina și Năvîrneț.
Săptămâna 14.09 rescrisă pe v4.1: 925FTI seara = retur cu oameni până la Năvîrneț 60,8 km, apoi acasă gol 25,3 km (era «Musteața → acasă, gol, 42 km»).

## Ce rămâne neschimbat, cu steag (fără acord sau fără date care să decidă)
Nihoreni, Florești, Zarojeni, Sturzovca, Trifănești, Bocancea Schit — cardurile v3.1. Listă de diagnostic (fără excludere):
capăt atins doar prin parcare — Zarojeni 52 % (348KAJ), Heciul Vechi* 47 % (412BRAY), Dominteni 45 % (710CWN), Prajila 27 % (763LYY),
Sturzovca 15 % (727CWN), Țiplești 13 % (146BRAZ).

## Mai departe (ION-109)
Mașinile care dorm în Bălți: criteriul «cursă probabil nedetectată» în trei condiții + ziua întreagă scoasă (§8.6, migrația 413) + bloc
separat de «Ce faci», doar km; întrebarea «casa ≤ 3 km = lângă uzină» rămâne pentru Ion, cu cifrele recalculate.
