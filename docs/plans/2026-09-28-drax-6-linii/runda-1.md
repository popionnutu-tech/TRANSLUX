# Drăxlmaier — dezbaterea Claude + Codex PÂNĂ LA ACORD: cele 6 linii cu steag și lista «capăt atins prin parcare» (ION-112, runda 1)

Ion, 27.09: «lansează Claude Codex pe o perioadă foarte lungă până nu agreează pe aceste 6 linii … și [pe lista capăt prin parcare]».
Nu există limita de 3 runde: se continuă până când AMBELE părți au aceeași poziție pe FIECARE linie și 0 high deschise.
Rularea automată Drăxlmaier e oprită (întrerupătorul /root/lde-worker/drax/OPRIT) până la cererea lui Ion.

## Unde sunt datele
- Scheletul activ: ideal-v4.2 (VPS `/root/lde-worker/drax/date/ideal-v4.2/`, cod `.../cod/ideal-v4.2/`, schelet sha 629b0c1d; `decizii-v3.json`
  cu metodele cardurilor; `card-gps.mjs`); obs `obs-ideal.json`, curse brute `curse-ideal.json` (apr, opr ≥ 20 s); fereastra 04.05–17.07 + 01.09–25.09.
- Urma brută minut cu minut: baza trackerului (pg, `TRACKER_*` în /root/lde-worker/.env; tabela `track`: x = latitudine NMEA, y = longitudine,
  w_date UTC fără fus — interogare cu text 'YYYY-MM-DD HH:MM:SS'), exemplu gata: `minut744.mjs` în acest dosar.
- Regulile: text curent 27.406 caractere, md5 1cfc6c53 (după migr. 415), `lde_uzine.reguli_livrare` id DRAXELMAIER_BALTI; §6 etalonul.
- Istoria: `docs/plans/2026-09-27-drax-ideal-v3/verdict-v3.md` (de ce au rămas cu steag), verificatorul (agentul schelet-verificator).

## Liniile cu steag «diagnostic cerut» (cardul din v3.1 păstrat)
| linie | card azi | dezacordul vechi (verdict-v3) | ce se știe din ION-110/111 |
|---|---|---|---|
| Nihoreni (R3) | 44,2 × 2 | Claude 42,3 un card / Codex 44,2; D face +12 km încărcați fără sate în plus; EZ instabilă 41,4 / 44,3 | G1 «orice poartă» 8,3 %; semnal Rîșcani (oraș §5.1) |
| Florești (R16) | 35,7 × 1 | drumul real al 518MHD e 52,9 km prin satele R32; Ion: «nu cunosc» | 518MHD doarme în Izvoare (satele R32 = drumul de acasă?) |
| Zarojeni (R18) | 28,9 × 2 | Claude 30,0 / Codex 28,9; D/EZ 53,3 / 25,6 — servicii diferite | verificatorul: picioarele care opresc la Zarojeni dau 28,9 = cardul; 30,7 = serviciul R22 al lui 348KAJ; H4 52 % 348KAJ |
| Sturzovca (R27) | 24,9 × 3 | ținta 24,0 × 2 serviciul direct; bucla 727CWN (93 km/tură) fără regulă de atribuire | verificatorul: 46,5 vine doar din 727CWN prin satele R11; H4 14 % |
| Trifănești (R32) | 40,2 × 2 (146BRAZ) | 518MHD e R16 după grafic; 146BRAZ face și R18 în aceeași cursă | 146BRAZ oprește la Putinești (R18) pe 32/32 curse în septembrie |
| Bocancea Schit (R36) | 54,5 × 1 | Claude 46,2 / Codex 54,5; drumul lung = 8/9 retururi de noapte prin Bilicenii Vechi | verificatorul: 54,0 fără steag (0,9 %); Codex C2 (ION-110): steagul rămâne până la comparația pe aceleași perechi |

## Lista «capăt atins prin parcare» (diagnostic, fără excludere automată — Codex C1 ION-110)
| linie | picioare | mașina | ce servește de fapt |
|---|---|---|---|
| Zarojeni | 52 % | 348KAJ | satele R22 / R21 |
| Heciul Vechi* | 47 % | 412BRAY | — |
| Prajila | 26 % | 763LYY | satele R18 (Putinești — vezi migr. 415) |
| Sturzovca | 14 % | 727CWN | satele R11 |
(Dominteni 45 % și Țiplești 13 % au ieșit din listă în v4.2.)

## Ce se cere fiecărei părți, pe FIECARE linie
Poziția (card nou cu metoda, card v3.1 păstrat, sau altă soluție — ex. linie nouă din GPS, reatribuire cu dovadă pozitivă de serviciu,
etalon pe schimb §6.6), dovada pe urma brută (opriri §4.5, cine urcă unde, zilele bune), ce se schimbă în lanț (`decizii`, `etalon.mjs`,
`card-gps.mjs`) și în reguli; ce trebuie ca cealaltă parte să fie de acord. Scor după rubrica comună; high doar cu scenariu + dovadă.
Scopul rundelor: aceeași poziție la ambele părți pe fiecare dintre cele 6 linii și pe fiecare rând al listei.

## Verificat deja (ION-112, minut cu minut): 744ARF dimineața pe schimbul 1
22 de dimineți (mai, iunie, iulie, septembrie): pleacă din Dacia ~05:15, stă 12–21 min în Hăsnășenii Noi cu 5–8 opriri la 0 km/h, la
poartă ~06:04 — tur real cu oameni (opririle erau unite de extracție). Steagul Codex C3 (ION-111) se închide.
