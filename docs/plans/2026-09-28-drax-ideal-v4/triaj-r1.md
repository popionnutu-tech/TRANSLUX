# ideal-v4 — triajul rundei 1 (27.09.2026)

Scoruri: business 1,5 · uzina-analist 3,0 · schelet-verificator 6,0 (v7) → **Claude 1,5**; **Codex 5,5** (scrisese 6,5; Σ deduceri 4,5), fail, 1 high.
Între runde Ion a cerut «fă schimbarea»: migrația 412 (§4.1 capătul din GPS, §4.7 fără Balatina/Năvîrneț) — închide business H1.

## Verdict pe subiecte (regula: ce susțin ambele părți sau ce hotărăsc datele; altfel v3.1 + steag)
| subiect | Claude | Codex | decizie |
|---|---|---|---|
| R37 → Năvîrneț | DA (136/144 opriri, 59,7–61,5 km GPS, 925FTI + 351KAJ) | DA | **aplicat** |
| R28 → Balatina | DA (ramură cu întoarcere 8/9, 3 mașini, 73–75,5 km GPS); verificator: opriri tur 28–43 % | DA, fără a pretinde pragul de 50 % pe opriri | **aplicat** (dovada = ramura cu întoarcere + km GPS) |
| a1 regula P1 automată | NU în forma P1 | NU ca promovare automată | capetele din GPS se trec explicit în `capete-gps.json`, cu dovezi; P1/P2 rămân cercetare |
| a2 R2, R21, R22, R18 | NU / R18 steag | steag | nemutate; R18 steag (casa 348KAJ) |
| a3 R32 | drumul de acasă | steag | nemutat, steag |
| a4 «Rediul de Jos*» | comasare | DA comasării, NU km inventați | **v4.1**: cursa care atinge doar startul din act rămâne pe R37\|Musteata, scurtă, `exclusEtalon` |
| b 6 linii cu steag | nimic nu decide (verif: Zarojeni, Sturzovca — datele păstrează cardul; Bocancea 54,0) | steag pe toate, inclusiv Bocancea (C2) | carduri v3.1 păstrate, steagurile rămân |
| c1 R1a în «Ce faci» | steag (Ion) | steag, după separarea curselor probabile | nu se schimbă §12.1; întâi cursele nedetectate |
| c2 casa ≤ 3 km = lângă uzină | business DA / analist steag | steag (schimbare de regulă) | steag |
| d1 formula 1,3 | NU pe 1,3 / DA pe principiu | NU formulei, DA cercetării pe picior | cercetare: întâi cursele nedetectate (744ARF R13, 804MUM s2) |
| verificator H1 cache | DA | DA (și filtrarea consumatorului) | **v4.1**: cache-ul R28/R37/Rediul* scos (25 de intrări), redesenat |
| business H2 analiza săptămânală | DA | DA, condiție de activare | **făcut**: `economie/etichete.mjs` + `saptamanal.sh` citesc `capete-gps.json` din instantaneu |
| verificator H4 capăt prin parcare | steag | C1 high: NU filtrului automat | doar listă de diagnostic, fără excludere (C1 acceptat) |
| C2 Bocancea | — | medium | acceptat: steag păstrat, card neschimbat |
| C3 numărul migrației Bălți | — | low | acceptat: următoarea liberă e 413, gard pe 25.072 / 62eace0d |
