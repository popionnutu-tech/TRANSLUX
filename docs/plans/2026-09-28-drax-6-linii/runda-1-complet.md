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


## Matricea pozițiilor după partea Claude, runda 1 (verificator 4,5→8,5 cu pozițiile lui · business 6,0 · analist 6,5)
| linie | verificator | business | uzina-analist | acord Claude? |
|---|---|---|---|---|
| Nihoreni R3 | etalon pe grupă D 51,8 / EZ 42,6 (sau media 47,2 × 2) | 44,2 × 2, steag scos (25 zile bune sept. 44,7) | 44,2 × 2, steag scos (bucla D +7–10 km cu opriri în Nihoreni + Rîșcani; 1 tură/grupă, efect 1 km/zi) | NU (verificator vs ceilalți doi) |
| Florești R16 | 35,7, ture 1 → 2, picioarele 518MHD de pe R32/R16* mutate pe R16 | 35,7, cele 107 picioare 518MHD R32 → R16, ture recalculate (probabil × 2) | 35,2; 518MHD de la Florești, drumul Izvoare → Florești = livrare | DA pe mutare + ture ≈ 2; km 35,7 vs 35,2 |
| Zarojeni R18 | 28,9, ture 2 → 1 (D nu oprește la Zarojeni 0/61) | ≈ 27,7 × 1 (deservit doar pe s2; 154/186 picioare fără oprire la Zarojeni) | steag rămâne (retur se termină la Gura Căinarului; card pe sens?) | parțial (1 tură: verif + business) |
| Sturzovca R27 | 24,0 × 2 (D), EZ = bucla 727CWN prin R11/R13 afară | 23,5 × 2, buclele 727CWN → R11/R13/R25 | 23,7 × 3, bucla 727CWN = R11 comasat | DA pe ~23,5–24 și bucla afară; ture 2 vs 3 |
| Trifănești R32 | 40,2, ture de remăsurat fără 518MHD | 40,2 × 2, steag scos | 40,2 confirmat | DA (40,2; ture după mutarea 518MHD) |
| Bocancea Schit R36 | 54,5 (0,9 % de GPS) | 53,3 × 1 (drumul s-a scurtat din sept.: 58,6 → 53,4) | 53,4 (§6.3) sau 54,0; 46,2 cade | parțial (53,3–54,5; 46,2 respins de toți) |
| H4 Zarojeni 348KAJ | picioarele D ies prin filtrul pe grupă | mutare cu dovadă pozitivă de serviciu | rămâne, legat de retur | parțial |
| H4 Heciul Vechi* 412BRAY | diagnostic (linie fără card) | nemăsurat | iese (doar mai, 0 în sept.) | aproape |
| H4 Prajila 763LYY | ture 3 vs 2 de verificat | iese (Putinești e §1.4) | diagnostic; 713IZX în sept. | NU |
| H4 Sturzovca 727CWN | afară prin grupa D | buclele → R11/R13/R25 | R11 comasat | DA (afară din R27) |
Comun tuturor: high pe 518MHD — etichetat R32 cu ~52,8 km «cu oameni» fără oprire în satele R32 (drumul de acasă din Izvoare); trebuie mutat pe R16 și în analiza săptămânală (etichete.mjs), altfel ~35 km/zi de livrare dispar.


---
### verificator-raport.md

# ION-112 runda 1 — cele 6 linii cu steag și lista H4, pe km GPS (sursa ideal-v4.2)

**Starea.** `RUN=/home/verif/verificator/rulari/drax-v13-1790534188` (număr ales de verificator — mesajul nu avea `v<N>`) · sursa `/root/lde-worker/drax/date/ideal-v4.2` (= `ideal-activ`, schelet 629b0c1d…) · drax.mjs 1be43dc0b57b ·
**verdict.json 5f4508ae5970f18109834294a40022c0bd2149ecbb02859810fa97f211f39a2c** · valid_pentru_export true · 4 explicate · INCHIS **ok**.
Regulile: md5 1cfc6c53c3e0c23a3269c7bd834bdeef, 27.406 caractere (verificat); față de 56dfde04 se schimbă §1.4, §4.2 și §6.5.
**Urma brută din trackerul pg: NU** — `diag.sh` citește doar `<RUN>/in/`, iar credențialele trackerului sunt în `.env`, pe care nu am voie să-l citesc. Totul de mai jos vine din deplasările (`curse-ideal.json`: opriri §4.5, apropieri ≤ 1,2 km) și observațiile sursei.
Metoda: km = plin + raza porții; grupa = rotația din §2.3 (săptămâna din 21.09 = faza A: D face s1, EZ face s2; alternanță); «oprire la capăt» = oprire §4.5 pe partea plină a piciorului. Diagnosticul: `diag-steag6.txt`, `diag-steag6b.txt` (scripturile `/root/diag-verif/steag6.mjs`, `steag6b.mjs`).

## (A) Linie cu linie
| linie | ce e pe urmă (sept, dacă nu se spune altfel) | poziția mea | km/zi față de v3.1 |
|---|---|---|---|
| **R3 Nihoreni** 44,2 × 2 | Două drumuri reale, legate de grupă, stabile pe toată fereastra: **D = 51,8** (tur 52,6 pe EST, retur 50,5; 186OMM prin Recea, sat din act; oprire la Nihoreni 29/32; toată fereastra 51,7, n140) · **EZ = 42,6** (tur 42,8 pe VEST, retur 42,6; 345KAJ / 457BRAX; oprire 25/37; toată fereastra 42,6, n139). Câte o pereche pe zi pe fiecare grupă (actul: EZ 1 + D 1). «Poarta sensului» (tur VEST) prinde doar EZ → 42,3; 44,2 e un compromis fără suport | **altă soluție: etalon pe GRUPĂ** — D 51,8 × 1 + EZ 42,6 × 1 (sau, fără schimbare de schemă, un singur km = media grupelor 47,2 × 2). Nici 42,3, nici 44,2 | 176,8 → **188,8 (+12,0)** |
| **R16 Florești** 35,7 × 1 | În mai–iul: 144BRAZ + 518MHD, 35,7–35,8, oprire la Florești 45/51. **În sept: 518MHD face zilnic 4 picioare (s1 + s2, tur + retur; 15 din 19 zile), dar lanțul le pune pe R32 Trifănești (48), R32 Căinarii Vechi (9) și R16 Vărvăreuca (9)**, tăiate la Trifănești din parcarea de la Izvoare (53,3 km). Pe partea plină opresc doar la Florești / Mărășești (34 + 5 din 47); **de la Florești la poartă: 36,5–36,7 km** | **card v3.1 păstrat (35,7)**; **52,9 respins** — cei ~17 km Izvoare → Florești sunt drumul de acasă, care doar trece prin sat (§4.2 nou); **ture/zi 1 → 2** (actul: EZ 1 + D 1) după reatribuirea picioarelor lui 518MHD pe Florești | 71,4 → **142,8 (+71,4)**; Trifănești / Căinarii Vechi / Vărvăreuca pierd picioarele (cardurile lor nu le folosesc) |
| **R18 Zarojeni** 28,9 × 2 | Actul: **doar EZ**. EZ (348KAJ din Gura Căinarului): tur 31,6 / retur 28,1 → **29,0** (sept); oprire la Zarojeni 2/16, la Gura Căinarului majoritar. **D (348KAJ): 0/61 opriri la Zarojeni pe toată fereastra**; sept 30,2 prin Țiplești / Heciul Vechi (R22), mai–iul 47–53 prin Sevirova / Alexandrovca (R32) = serviciul altor rute (H4). 30,7 = etalonul GPS al zilelor D | **card v3.1 păstrat (28,9 = EZ 29,0, 0,3 %)**; **ture/zi 2 → 1** (doar EZ); picioarele D în lista de diagnostic H4, nu pe Zarojeni | 115,6 → **57,8 (−57,8)** |
| **R27 Sturzovca** 24,9 × 3 | Actul: **doar D**. D: **23,9** (tur 24,0 / retur 23,8), oprire la Sturzovca 67/74, **2 perechi/zi** (727CWN în săptămânile D, 397VKV, 441ASB, 804MUM). EZ: 727CWN, 44,8, **0/32 opriri la Sturzovca**, bucla prin Limbenii Noi / Fundurii Noi (R11) și Hăsnășenii Noi (R13) | **de acord cu ținta: 24,0 × 2** (grupa D, sept, mediana ambelor sensuri 23,9–24,0); §6.6 («s1 24,7 / s2 46,9») trebuie rescris — e grupă/mașină, nu schimb | 149,4 → **96,0 (−53,4)** |
| **R32 Trifănești** 40,2 × 2 | 146BRAZ: **D** tur 35,9 / retur 41,2, prin Sevirova / Alexandrovca / Ivanovca (act R32), 0 opriri la Putinești · **EZ** tur 40,1 / retur 41,8, **Putinești 32/37 picioare** (nu 32/32), 1 prin Sevirova. §1.4 nou pune Putinești în km-ii R32 → legitim. 518MHD (47 de picioare pe eticheta R32) e serviciul Florești | **card v3.1 păstrat (40,2 ≈ media D ~38,5 / EZ ~41)**; ture/zi se remăsoară **fără 518MHD** (azi perechile D includ 518MHD) | 160,8 → de remăsurat (probabil neschimbat) |
| **R36 Bocancea Schit** 54,5 × 1 | 224BZP, sept: **53,9** (tur 54,0 / retur 53,7; 43,9–58,7); oprire la capăt 17/34. **Toate retururile (s1 ziua și s2 noaptea) și toate tururile trec pe la Bilicenii Vechi la 0,65 km — e drumul, nu un ocol** (o singură oprire, 07.09). Mai–iul 58,9 (alt drum; sursa sept e corectă). Nicio mediană nu stă lângă 46,2 (un singur picior de 43,9) | **card v3.1 păstrat (54,5; GPS 54,0, 0,9 %)**; 46,2 nu are suport pe GPS | 0 |
Efectul net al pozițiilor mele: **+12,0 + 71,4 − 57,8 − 53,4 = −27,8 km/zi** (card 5.789 → ~5.761), fără Trifănești (de remăsurat).

## (B) Lista H4 pe v4.2
| rând | poziția mea |
|---|---|
| Zarojeni 52 % (348KAJ) | Rezolvat de filtrul «grupa din act»: sunt exact picioarele D (0/61 opriri la Zarojeni). Ies de pe Zarojeni; rămân în lista de diagnostic (sate R22/R32), fără reatribuire automată |
| Heciul Vechi* 47 % (412BRAY) | Linie `*` fără ideal (§4.6), nu intră în card. Doar diagnostic (sate R19/R33/R34 — Bilicenii Vechi) |
| Prajila 26 % (763LYY) | Rămâne pe Prajila: §1.4 nou spune că Putinești e deservit în mai–iul de R17 Prajila (763LYY). Întrebare deschisă: ture/zi 3 vs act 2 (713IZX, 763LYY, 487NPL) — C44 pe 763LYY înainte de orice schimbare |
| Sturzovca 14 % (727CWN) | Rezolvat de filtrul pe grupa D (picioarele EZ ale lui 727CWN) |

## Ce trebuie ca propunerea să fie verificabilă
1. **Grupa pe fiecare observație** (lanț și verificator), calculată prin alternanța de la ancora 21.09 (§2.3), nu prin paritate.
2. **G1 / C47 / C28 pe grupă** în `drax.mjs` (propunere de script, sesiunea aprobă): etalon pe grupă cu ≥ 3 zile, C47 pe poarta grupei, ture/zi pe grupă. Pentru Nihoreni, `schelet-ideal.json` are nevoie de km pe grupă, iar F2 (`economie/categorii.mjs:37-40`, azi pe schimb) trebuie să mapeze grupa pe schimb pe săptămână; altfel se folosește media 47,2.
3. **Filtrul «grupa din act» cu dovadă:** un picior al grupei care nu e în act iese de pe linie doar dacă are 0 opriri §4.5 la capăt (Zarojeni D 0/61, Sturzovca EZ 0/32); altfel rămâne și primește steag.
4. **Reatribuirea Florești:** piciorul care atinge capătul altei linii doar din parcare (518MHD la Izvoare) și oprește pe partea plină numai în satele altei linii (Florești) trece la acea linie, tăiat la satul unde se urcă (§4.2 nou, «drumul de acasă nu face capătul»). Acceptare: Florești→poartă 36,5 ± 5 % pe 518MHD, ture/zi 2.
5. **Registrul:** G1 Zarojeni și G1 Sturzovca devin moarte după schimbare (etalonul GPS pe grupă = cardul) → se șterg la re-semnare.

## High-uri (cu scenariu) și scorul propunerii (A: card v3.1 pe toate 6, Sturzovca 24,0 × 2)
- **H1 — Florești sub-numărat:** păstrând 35,7 × 1, 518MHD rămâne pe eticheta Trifănești. *Scenariu:* Florești are 71,4 km/zi în loc de 142,8, iar în F2 drumul gol Izvoare → Florești (~17 km pe picior, 4 picioare/zi) stă pe o cursă «cu oameni» a lui R32, deci nu apare la livrare (~68 km/zi pierduți din R1a pentru 518MHD). Varianta «52,9» ar pune același drum gol direct în card.
- **H2 — Nihoreni pe un singur km:** și 42,3, și 44,2 ascund varianta D prin Recea (+9,2 km pe picior). *Scenariu:* −12 până la −19 km/zi cu oameni; în F2, culoarul (drumul desenat al EZ) nu acoperă Recea → km-ii D prin Recea ies la livrare.
- **H3 — Zarojeni cu 2 ture:** păstrând 28,9 × 2, 57,8 km/zi ale serviciului R22/R32 al lui 348KAJ rămân pe Zarojeni (0/61 opriri la capăt), iar G1 rămâne blocant «explicat» pe termen nedefinit.
- Medium: ture/zi Prajila 3 vs act 2 nelămurit; verificatorul nu poate controla azi nimic pe grupă.
**Scorul propunerii A (10 − Σ; high −2 / −1,5 / −1, medium −0,5):** H1 −2 · H2 −1,5 · H3 −1 · Prajila −0,5 · lipsa controlului pe grupă −0,5 = **4,5 / 10**. Cu pozițiile de mai sus și cu punctele 1–5: ~8,5.


---
### r1-business.md

# ION-112 runda 1: partea Claude (logica de business). Cele 6 linii cu steag și lista «capăt prin parcare»

Autor: business-logic-auditor, 27.09.2026. Doar citire.
- **Regulile:** `reguli-drax-1cfc6c53.txt` (md5 1cfc6c53, după migrația 415).
- **Datele:** VPS `drax/date/ideal-v4.2` (`obs-ideal.json`, `schelet-ideal.json`, `decizii-v3.json`, `nomenclator.json`).
- **Urma minut cu minut:** trackerul pg, ca în `minut744.mjs`.
- **Scripturile:** `scratchpad/p112/e1…e6.mjs` (`e5` = trackerul, rulat din `/root/lde-worker` și șters după rulare).

**Metoda nouă pe care o folosesc peste tot: «plinul la oprirea din capăt».**
- Plinul se măsoară de la prima oprire (§4.5, pe `opr` ≤ 0,8 km de `capatC`) din capăt până la poartă la tur, și de la poartă până la
  ultima oprire din capăt la retur.
- Zi bună = tur și retur cu oprire în capăt, aceeași mașină, zi și schimb, la ≤ 18 %.
- Mediana e pe septembrie dacă are ≥ 3 zile bune (§6.2, §6.3).
- Tăietura de azi pe «atingerea» capătului (≤ 1,2 km) umflă plinul acolo unde drumul de acasă trece a doua oară pe lângă capăt.

---

## Pe linii

| linie | card azi | măsurat (oprire în capăt) | poziția mea |
|---|---|---|---|
| **R3 Nihoreni** | 44,2 × 2 | 25 de zile bune în sept., **44,7** (s1 44,7 / s2 44,8) | **cardul 44,2 × 2 rămâne, steagul se scoate** |
| **R16 Florești** | 35,7 × 1 | 13 zile bune (144BRAZ, mai–iul.) **35,2**; 518MHD sept.: de la oprirea din Florești 35,3–36,7 | **35,7 rămâne; cele 107 picioare ale lui 518MHD trec pe R16; turele se recalculează (probabil 2)** |
| **R18 Zarojeni** | 28,9 × 2 | turul s2 cu oprire în Zarojeni 26,8–28,5 (median 27,7); returul s2 cu oprire în Zarojeni (tracker) | **card nou ≈ 27,7–28,9 × 1; picioarele cu opriri în satele R22/R21/R32 trec pe acele linii** |
| **R27 Sturzovca** | 24,9 × 3 | 29 de zile bune în sept., **23,0** (lanț 23,5), s1 = s2, **2 ture** | **card nou 23,5 × 2 (fără etalon pe schimb); buclele lui 727CWN trec pe R11/R13/R25** |
| **R32 Trifănești** | 40,2 × 2 | 146BRAZ oprește rar chiar în Trifănești (16 retururi s1); urcă în Sevirova, Alexandrovca, Izvoare (sate R32) și în Putinești | **cardul 40,2 × 2 rămâne, steagul se scoate** (motivul, Putinești, e acum regulă: §1.4, migr. 415) |
| **R36 Bocancea Schit** | 54,5 × 1 | 5 zile bune în sept., **53,2**; lanțul pe aceleași perechi 52,9; `etalonGPS` 53,3 | **card nou 53,3 × 1, steagul se scoate** |

### R3 Nihoreni
- **Dovada:** în septembrie urcă la Nihoreni 345KAJ, 457BRAX și 186OMM.
- **Plinul de la oprirea din Nihoreni până la poartă, pe mașini:**
  - 345KAJ: 39,9 (VEST) / 41,6 (EST);
  - 457BRAX: 40,8–42,6;
  - 186OMM: **45,1 / 44,7, tot la poarta EST**, deci un drum mai lung cu ~3,5 km, nu altă poartă. Ipoteza porții e respinsă.
- **Tăietura pe atingere e greșită la 186OMM.** Atinge Nihoreni la 36,5 km, dar oprește acolo la 43,5 km (după Rîșcani), deci plinul
  iese 52. Pe aceleași perechi, lanțul dă 47,1, iar tăietura la oprire dă 44,7.
- **§6.2** (mediana zilelor bune) dă 44,7, adică **44,2 ± 1,1 %**.
- **Dezacordul vechi e închis.** Diferența 41 / 45 e o variantă de drum a mașinii 186OMM (Nihoreni stop → gate 45 km), cu aceleași sate
  și opriri, nu un alt serviciu. Nu există o separare pe schimb: s1 44,7, s2 44,8.
- **Ce ar trebui să accepte Codex:** cardul 44,2 fără steag, pe dovada «oprire în capăt, 25 de zile bune, s1 = s2».

### R16 Florești (împreună cu R32)
- **518MHD doarme în Izvoare.** Turul pornește din Izvoare (oprire la 0 km, acasă) → Florești (21–22 km) → poartă. Returul: Florești →
  Izvoare, acasă.
- **Opririle în Florești:** tur s1 30 din 30, retur s1 24 din 27, retur s2 36 din 44.
- **Graficul pune 518MHD pe R16 pe ambele schimburi, zilnic.** Cele 107 picioare R32 ale lui 518MHD (70 cu opriri în satele R16, 37 în
  R20) sunt deci **R16, cu Izvoare ↔ Florești = drumul de acasă** (§4.1 ultima frază, §4.2).
- **Km-ii:** de la oprirea din Florești, 35,3–36,7, egal cu cardul.
- **Ce se schimbă:**
  - `decizii` și etichetele: 518MHD → R16|Florești;
  - în analiza săptămânală, ~17 km pe picior trec de la «cu oameni» la livrare (e constatarea L2 din runda 1 a ION-110, încă deschisă);
  - turele R16 se recalculează: 518MHD pe s1 și s2 zilnic, deci probabil **× 2** (cardul are × 1).

### R18 Zarojeni: urma minut cu minut (tracker, 348KAJ, 17–25.09)
- **Casa lui 348KAJ e în Gura Căinarului**, la 1,39 km de centrul Zarojeniului.
- **Săptămâna 21.09** (faza A: EZ pe s2; Zarojeni e doar EZ în act):
  - **turul s2** 13:28–13:37 oprește în Zarojeni (29–51 de puncte în 1,2 km) → Gura Căinarului → poartă, plin 26,8–28,5;
  - **returul s2** 00:31–00:37 oprește în Zarojeni, în fiecare noapte 22–24.09;
  - turul s1 și returul s1 ale aceleiași săptămâni **nu se apropie de Zarojeni** (minimum 1,32 km) și opresc în Țiplești, Țipletești,
    Heciul Vechi, Alexăndreni și Biruința, **satele R22**.
- **Săptămâna 14.09:** 17.09 turul s1 oprește în Zarojeni; 18–19.09 opresc în Moara de Piatră / Cubolta, Heciul Nou / Grigorești (R21),
  Alexandrovca / Sevirova (R32).
- **Pe fereastră:** din 186 de picioare R18, doar 32 opresc în Zarojeni. 87 n-au nicio oprire în vreun sat de rută; 26 opresc în satele
  R32, 21 în R21, 9 în R22.
- **Concluzia:**
  - Zarojeni are **un** serviciu pe zi (grupa EZ);
  - restul picioarelor sunt alte linii, pornite de acasă, lângă capăt (§4.2: «drumul de acasă nu face capătul»);
  - cardul **× 2 e greșit (H-a)**, iar km-ii ≈ 27,7 (tur, oprire în capăt) față de 28,9 (−4 %).
- **Metoda:** în `obs`, returul își pierde oprirea din Zarojeni (extracția a unit-o; lanțul dă un plin de 22 în loc de ~27). Cardul se ia
  din tururile cu oprire în capăt, plus retururile verificate pe tracker. Altfel se cere o re-extracție a opririlor pentru 348KAJ.

### R27 Sturzovca
- **Oprirea în Sturzovca:**
  - 727CWN: 73 de tururi / retururi pe s1 și 64 pe s2, plin 21,4–23,7;
  - 441ASB, 397VKV și 804MUM: la fel.
- **Pe zilele bune din septembrie (29): 23,0 la oprire, 23,5 în lanț, s1 23,3 = s2 23,7.**
- **Cele 46,9 km «s2» din §6.6 sunt buclele lui 727CWN fără oprire în Sturzovca.** Opririle lor sunt în satele R11 (29), R13 (11) și R25
  (8): exemplu, 03.09 tur s2 cu 85 km prin Ustia, Limbenii Vechi, Petrunea, Fundurii Vechi.
- **Ce ar trebui să accepte Codex:**
  - card **23,5 × 2** (lanțul pe picioarele cu oprire în capăt) sau 23,0 (oprire); diferența e sub 2,5 %, iar eu propun 23,5, fiindcă e
    metoda de acum restrânsă la serviciul dovedit;
  - buclele trec pe R11 / R13 / R25 după opriri (§4.2), nu se exclud. Ținta comună din v3 era «24,0 × 2».
- **Ture:** mediana perechilor bune pe zi = 2.

### R32 Trifănești
- **Turul lui 146BRAZ pornește din Scăieni (acasă, dincolo de capăt):**
  - s1: Sevirova (8 km) → Putinești (26 km) → poartă, plin 39,4;
  - s2: Alexandrovca, Sevirova → poartă, plin 35,3 (fără ocolul prin Putinești).
- **Returul:** Alexăndreni / Putinești sau Sevirova / Alexandrovca → Scăieni, plin 40–40,7.
- **Motivul steagului** («146BRAZ face și R18 în aceeași cursă») e acum textul §1.4 (migr. 415): Putinești n-are autobuz propriu, iar
  km-ii lui sunt în R32. Cardul 40,2 (mediana, cu ocolul prin Putinești pe o parte din picioare) e consecvent cu §1.4.
- **Poziția:** 40,2 × 2 fără steag. Codex ar trebui să accepte pe baza textului 415.

### R36 Bocancea Schit
- **În septembrie drumul s-a scurtat:**
  - mai–iulie: plin median 58,6 (96 de picioare);
  - septembrie: 53,4 (36), doar 1 din 36 prin Bilicenii Vechi.
- **§6.3** (septembrie, ≥ 3 zile bune): 5 zile bune, 53,2 la oprire, 52,9 în lanț, iar `etalonGPS` al cardului e 53,3.
- **Condiția Codex C2** («aceleași perechi») e îndeplinită: toate cele trei cifre sunt pe perechile 224BZP din septembrie.
- **Poziția:** card **53,3 × 1**, fără steag (−2,4 km pe zi).

## Lista «capăt atins prin parcare»

| rând | poziția mea | dovada |
|---|---|---|
| **Zarojeni, 348KAJ, 52 %** | **reatribuire cu dovadă pozitivă**, nu excludere | Casa e la 1,39 km. Picioarele pornite de acasă opresc în satele R22 (s1, 21–25.09, zilnic), R21 și R32. §4.2 (după 415) spune deja că drumul de acasă nu face capătul, iar cursa e a liniei cu ≥ 2 opriri în satele ei. |
| **Heciul Vechi\*, 412BRAY, 47 %** | **steag, nemăsurat de mine în runda 1** | de făcut în runda 2, cu aceeași metodă (tracker + opriri) |
| **Prajila, 763LYY, 26 %** | **se scoate din listă** | Opririle sunt în Putinești (R18). §1.4 (415) spune că Putinești e deservit în mai–iulie de R17 Prajila (763LYY): e serviciul liniei, nu parcare. |
| **Sturzovca, 727CWN, 14 %** | **reatribuire la R11 / R13 / R25 după opriri** | vezi R27; asta închide și §6.6 |

## Ce se schimbă

**În lanț** (`decizii-v3.json` → `v4`, `card-gps.mjs`, `etalon.mjs`):
1. Metoda «oprire în capăt» ca metodă în decizii:
   - R3 (control; cardul rămâne 44,2);
   - R18 (card);
   - R27 (populația = picioarele cu oprire în capăt; km pe lanț);
   - R36 (card = `etalonGPS` 53,3).
2. Reatribuiri după opriri (§4.2):
   - 518MHD → R16;
   - picioarele R22 / R21 / R32 ale lui 348KAJ;
   - buclele lui 727CWN → R11 / R13 / R25.
   Obligatoriu **și în `economie/etichete.mjs`**, altfel analiza săptămânală rămâne în urmă (ION-110 M-a, ION-111 L-b).
3. Turele recalculate: R18 → 1, R27 → 2, R16 → probabil 2.
4. Control pe toată flota, cu verificatorul: R22, R21, R32, R11, R13, R25 nu se mișcă peste 5 % după ce primesc picioarele.

**În reguli** (migrație, gard pe 1cfc6c53):
- §6.6: exemplul «R27 Sturzovca: s1 24,7 km, s2 46,9 km» e greșit și se scoate.
- §6.5: cifrele de ture (Sturzovca 3 → 2, Zarojeni 2 → 1, R16).
- §2.4: «Sturzovca … ambele schimburi, cu două mașini».
- §6.2: fraza despre tăietura la oprirea din capăt, dacă se adoptă ca metodă.

## Constatări cu deducere

**H-a (high, −2): R18 Zarojeni × 2 numără alte linii.**
- Dovada: trackerul, 21–25.09. Zarojeni e deservit doar pe s2 (tur 13:3x, retur 00:3x, cu opriri în Zarojeni). Tururile și retururile s1
  ale lui 348KAJ nu trec la mai puțin de 1,32 km și opresc în satele R22.
- Pe fereastră, 154 din 186 de picioare R18 n-au nicio oprire în Zarojeni.
- Scenariul: cardul R18 ține 2 × 28,9 × 2 = 115,6 km pe zi, în loc de ~57. R22 pierde picioarele lui 348KAJ. Analiza săptămânală pune
  serviciul R22 pe R18, iar pagina și indicațiile arată linia greșită.

**M-b (medium, −1): §6.6 afirmă un etalon pe schimb (s2 46,9) construit din buclele lui 727CWN prin alte rute.** Pe picioarele cu oprire
în Sturzovca, s1 = s2 (23,3 / 23,7).

**M-c (medium, −1): 518MHD stă pe R32 cu 52,8 km «cu oameni».** Drumul Izvoare ↔ Florești (~21 km) e drumul lui de acasă; problema e
deschisă din ION-110 (L2) și umflă «cu oameni» în analiza săptămânală.

## Scor

10 − (2 + 1 + 1) = **6,0 / 10**

Pe 3 linii, cardul se păstrează fără steag: R3 44,2, R32 40,2 și R16 35,7, acesta din urmă cu reatribuirea lui 518MHD. Pe 3 linii am
card nou cu metoda exactă: R18 ≈ 27,7 × 1, R27 23,5 × 2 și R36 53,3 × 1.

**Rămân pentru runda 2:**
- Heciul Vechi\* (412BRAY);
- turele R16 după reatribuire;
- controlul pe toată flota al liniilor care primesc picioare.


---
### r1-analist.md

# ION-112, runda 1 — uzina-analist («cercetează»): cele 6 linii cu steag și lista «capăt prin parcare»

Autor: uzina-analist, 27.09.2026. Nu am scris în bază și n-am schimbat nimic pe VPS.

Surse:
- VPS `/root/lde-worker/drax/date/ideal-v4.2/`: `curse-ideal.json` (mișcările brute cu `apr` și `opr` ≥ 20 s), `obs-ideal.json`,
  `nomenclator.json`, `card-gps-raport.txt`;
- fereastra 04.05–17.07 + 01.09–25.09;
- regulile: text 1cfc6c53 (`scratchpad/p112/reguli-drax-1cfc6c53.txt`) și `lde_uzine.reguli_livrare` LEAR / Florești / SEBN / Trox.

Nu am coborât la urma minut cu minut din pg (`minut744.mjs`). Opririle ≥ 20 s din `curse-ideal.json` au ajuns pentru concluziile de mai jos.
Unde o concluzie ar cere proba pe minut, o spun.

Scripturile sunt în `scratchpad/p112/`, cu ieșirile lor:
- `cine.mjs <rute>`: pe fiecare rută, cine OPREȘTE în satele ei, pe ce fereastră, sub ce etichetă, prin ce alte rute. Ieșire `cine-out.txt`.
- `drum.mjs <mașină> <rută> <n> <lună>`: drumul real, sat cu sat, cu km și opriri. Ieșiri `drum1.txt` și `drum2.txt`.
- `med.mjs`: mediana km-ilor cu oameni pe linie × mașină, septembrie și toată fereastra. Ieșire `med-out.txt`, cu rândurile din card.

## Pe scurt, linie cu linie

| linie | cine deservește de fapt (opriri ≥ 20 s) | km cu oameni pe GPS (sept., mediana tur + retur) | card azi | poziția mea |
|---|---|---|---|---|
| R3 Nihoreni | EZ = 345KAJ; D = 186OMM (sept.) și 397VKV (mai–iul.) + 457BRAX | linia 44,1; 345KAJ 39,9 / 41,5; 186OMM 47,9 / 48,5; 397VKV 51,2 (toată fereastra) | 44,2 × 2 | **44,2 rămâne, steagul se închide** (vezi 1) |
| R16 Florești | 518MHD (sept.), 144BRAZ (mai–iul.): pornesc din orașul Florești | 35,2 (sept. 6 picioare; toată fereastra 35,2 din 53) | 35,7 × 1 | **35,2**; cei 52,9 km sunt drumul de acasă (**H1**) |
| R18 Zarojeni | 348KAJ: Gura Căinarului pe toate picioarele; Zarojeni doar pe o parte din tururi | 29,5 (sept.); toată fereastra 26,9 (tur 27,0 / retur 22,2) | 28,9 × 2 | **steag rămâne** — retururile nu opresc la Zarojeni (**M1**) |
| R27 Sturzovca | 727CWN, 804MUM, 397VKV, 441ASB (sept.), 034BRAT și 402VKV (mai–iul.) | 23,7 (sept., 107 picioare); toate mașinile între 23,2 și 26,0 | 24,9 × 3 | **23,7 × 3** (−7,2 km/zi) |
| R32 Trifănești | 146BRAZ (fără 518MHD) | 146BRAZ 39,4 / 40,6 | 40,2 × 2 | **40,2 rămâne**; eticheta 518MHD trebuie scoasă (**H1**) |
| R36 Bocancea Schit | 224BZP singur | 53,4 (tur 53,4 / retur 53,1, sept.; 23 de picioare) | 54,5 × 1 | **53,4** (§6.3, septembrie); 46,2 cădea greșit |

Efect pe card, pe km/zi:
- R16: −1,0 (1 tură/zi);
- R27: −7,2;
- R36: −2,2;
- R3, R18 și R32: 0.

Total ≈ **−10,4 km/zi**.

---

## 1. R3 Nihoreni

Drumul (`drum1.txt`, `drum2.txt`):
- **EZ (345KAJ, doarme la Pîrjota)**: Rîșcani (oprire) → Nihoreni (oprire, 33 km în linie dreaptă de poartă) → Rîșcani (oprire) → Recea
  (oprire) → Corlăteni → poarta VEST.
  - Nihoreni e o ramură din Rîșcani, dus-întors pe 4,3 km.
  - Km cu oameni: 41,1 / 39,9 la tur, 41,5 la retur (01–02.09).
- **D (186OMM în sept., 397VKV în iunie)**: aceleași sate, dar în Nihoreni trece prin DOUĂ puncte, la 2,5 km unul de altul
  (Nihoreni@45,3 → Nihoreni@47,8), cu opriri în amândouă. Apoi face 3 km prin orașul Rîșcani, cu opriri.
  - Km cu oameni: 52,1–52,3 (186OMM, 01–03.09), 51,0–51,5 (397VKV).
  - Mediana pe septembrie a lui 186OMM: 47,9 / 48,5.

Diferența EZ ↔ D (~7–10 km) e reală și cu oameni: bucla de urcare din Nihoreni și din orașul Rîșcani. Nu apare niciun sat în plus.
Precedentul e LEAR Florești §4.4: «Puncte de încărcare regulate care NU sunt în act … bucla adaugă ~12 km pe sens … Sunt muncă a rutei».

**Pentru card nu contează.**
- Linia are 2 ture pe zi: una a grupei EZ, una a grupei D.
- Două carduri pe grupă ar da 2 × 40,7 + 2 × 48,2 = 177,8 km/zi.
- Cardul unic dă 2 × 2 × 44,2 = 176,8 km/zi.
- Diferența e de 1,0 km/zi, sub pragul unei decizii.

Mediana liniei pe septembrie, 44,1, e deja cardul, 44,2.

**Poziția: 44,2 × 2 rămâne, steagul se închide.** Nota rămâne pe pagină: «D face bucla de urcare din Nihoreni și Rîșcani, +7–10 km».
Nu e nevoie de un etalon pe grupă, care ar schimba §6.6 fără efect pe card.

## 2. R16 Florești

- Linia pornește din orașul Florești.
- **518MHD** (sept.) doarme la Izvoare, sat R32 / R20. Tur s1, 01.09 la 04:56: Izvoare (oprire la km 0, adică acasă) → Frumușica →
  Alexandrovca → Trifănești → Sevirova → Ivanovca → Mărculești → **Florești (oprire)** → Vărvăreuca → Mărculești → Mărășești → poartă.
  Pe drumul prin satele R32 **nu oprește nicăieri**.
- La fel pe 03.09 și pe 02.09, cu turul s1 etichetat R16 \| Varvareuca: opriri doar la Izvoare (km 0) și la Florești.
- Turul s2 pornește de la Mărculești: Florești (oprire) → poartă, **35,2 km**.
- 144BRAZ, în mai–iulie, pe același drum: 34,9–35,6.
- Mediana liniei: 35,2, în septembrie și pe toată fereastra, 53 de picioare.

**Poziția: card 35,2 × 1.** Cei 52,9 km din verdict-v3 sunt drumul de acasă (Izvoare → Florești, ~17,5 km, fără oprire): livrare, nu
serviciu. Asta răspunde la întrebarea lui Ion din 27.09 («de lămurit dacă ocolul prin R32 e cu oameni»): nu e.

## 3. R18 Zarojeni (+ rândul «capăt prin parcare» 348KAJ, 52 %)

348KAJ, pe toată fereastra (`cine-out.txt`):

| picior | câte | oprește la Gura Căinarului | oprește la Zarojeni |
|---|---|---|---|
| tur s1 | 31 | 35 | 9 |
| tur s2 | 37 | 51 | 21 |
| retur s1 | 50 | 52 | **1** |
| retur s2 | 46 | 46 | **1** |

- Retururile de la 00:18 se termină la Gura Căinarului: km cu oameni 22,0 (retur s2), 22,2 pe toată fereastra, față de 27,0 la tur.
- Turul coboară din Zarojeni doar pe o parte din zile. Restul drumului până la Zarojeni e parcare sau drum spre casă, de unde vine cei
  52 % «capăt prin parcare».
- Returul s1 trece prin satele R21 / R22: Biruința → Alexăndreni → Heciul Vechi → Țiplești → Gura Căinarului. Aici se unesc serviciile
  R22 și R18, în aceeași cursă, cum a spus Ion pe 27.09: «ruta lungă e divizată în câteva mașini». De aici și varianta de 30,0 / 30,7 km.
- Putinești, satul R18, e deservit de 146BRAZ (R32, septembrie), 763LYY (R17, mai) și 412BRAY (R22 \*, mai). Migrația 415 a tratat deja
  cazul.
- «D/EZ 53,3 / 25,6» din verdict-v3: varianta de 53 km sunt picioarele 348KAJ prin satele R32 (Sevirova, Alexandrovca, Ivanovca;
  tur s2 plin 52,0, retur s2 55,0), aproape toate în mai–iulie (în septembrie 1–2).

**Poziția: steagul rămâne**, cu o întrebare pe date noi (M1):
- Cu tur = retur (§6.1), cardul de 28,9 pune și pe retur tronsonul Gura Căinarului → Zarojeni, pe care retururile nu-l fac cu oameni
  (1 din 96).
- Pe km reali, returul are ~22 km, iar turul 27–29.
- Precedente pentru tur ≠ retur: SEBN §4.6 «tur ≠ retur e real, drumuri diferite — nu e greșeală»; Florești §6.1 (A5, tur 28,7 /
  retur 24,4, sub 18 %).
- Aici diferența e de 18–23 %, peste pragul §6.2.
- Pentru ca ambele părți să fie de acord trebuie: (a) proba minut cu minut pe 5 retururi s2 din septembrie, dacă mașina oprește la
  Zarojeni sub 20 s; (b) decizia dacă §6.1 permite un card pe sens când returul se oprește în mod regulat înainte de capăt.

## 4. R27 Sturzovca (+ rândul 727CWN, 14 %)

- Șase mașini fac legătura directă Sturzovca → poartă, cu opriri la Sturzovca și Sadovoe:
  - 727CWN: 23,8 / 23,4 (sept.);
  - 804MUM: 23,3 / 23,2;
  - 397VKV: 23,3 / 23,2;
  - 441ASB: 26,0 / 25,9;
  - 034BRAT și 402VKV (mai–iul.): 23,1 / 23,0.
- Mediana liniei pe septembrie: **23,7** (107 picioare).
- Varianta de 46,5 km din verdict-v3 vine din bucla 727CWN prin Sadovoe și satele R11. Pe `obs` sunt puține picioare («bucla» 3,
  «retur s1 R25 \| Hiliuti» 5), iar ele nu intră în km-ii cu oameni ai liniei.

**Poziția: card 23,7 × 3** (turele pe zi rămân cele măsurate în v4.2), adică 142,2 km/zi față de 149,4.
- Rândul 727CWN rămâne diagnostic: bucla prin Sadovoe (sat și R11, și R27) e serviciu R11 comasat, cum spune LEAR §4.7 («Rută fără
  mașină proprie ≠ rută nefăcută»). Nu se pune pe cardul R27.

## 5. R32 Trifănești

- **146BRAZ** doarme la Scăieni, lângă Izvoare. Oprește la Izvoare, Alexandrovca, Sevirova, Trifănești și Frumușica. Are două drumuri:
  - direct, Sevirova → Ivanovca → Mărășești: tur s2 35,3; retur s2 40,6;
  - returul s1 pe la Biruința → Alexăndreni (oprire) → Țipletești → **Putinești (oprire)** → Gura Căinarului → Sevirova → Trifănești:
    39,5 km.
- Deci și aici ruta lungă e împărțită: 146BRAZ face în aceeași cursă Putinești (R18) și Alexăndreni (R21 / R22).
- Mediana pe septembrie: 39,4 la tur, 40,6 la retur, adică **card 40,2 × 2 confirmat**.
- Satul Trifănești e deservit și de 041BRAU (R20 Nicolaevca, oprire la Trifănești în 45–47 din 45–47 de picioare) și de 302YEK
  (R32 \| Căinarii Vechi, tot drumul R32).

**Poziția: 40,2 × 2 rămâne, steagul se închide.** Cu o condiție: 518MHD iese din eticheta R32 (H1). Azi, `obs` are 48 de picioare 518MHD
«R32 \| Trifanesti» în septembrie (mediana 52,7). Ele umflă mediana liniei la 41,2 pe septembrie și la 51,7 pe toată fereastra.

## 6. R36 Bocancea Schit

- **224BZP** doarme la Catranîc. În ambele sensuri merge pe același drum: poartă → Bilicenii Vechi → Nicolaevca → Flămînzeni → Coșcodeni →
  **Bobletici** (ramură, oprire; la 36,5 km în linie dreaptă, cel mai departe) → înapoi la Coșcodeni → Flămînzeni → **Bocancea-Schit**
  (ramură, oprire) → Flămînzeni → Glinjeni → Catranîc (acasă).
- Turul de la 12:28 e oglinda lui. Opriri la Bobletici în 31–35 de picioare din 35 (toată fereastra).
- Km cu oameni în septembrie: tur 51,6 / 53,5 / 53,5 și retur 53,8 / 54,5 / 53,1. Mediana: **53,4** (23 de picioare).
- Varianta de 46,2 km (Claude, v3) scoate ramura Bobletici, deși acolo se urcă. Nu e drumul real.
- «8 din 9 retururi de noapte prin Bilicenii Vechi»: în septembrie, și turul trece prin Bilicenii Vechi, deci tur = retur.

**Poziția: card 53,4 × 1** (§6.3: septembrie are ≥ 3 zile bune). Cardul v3.1, 54,5 (+2 %), și cel al verificatorului, 54,0, stau în
±2 %. Accept și 54,0 dacă cealaltă parte cere metoda verificatorului. Steagul se închide.

## 7. Rândurile «capăt atins prin parcare»

| rând | ce arată GPS-ul | poziția |
|---|---|---|
| 348KAJ Zarojeni 52 % | Gura Căinarului pe toate picioarele; Zarojeni doar la tur (30 din 68), aproape niciodată la retur (2 din 96) | rămâne în listă, legat de M1 |
| 412BRAY Heciul Vechi\* 47 % | doar în mai (0 picioare în sept.); oprește la Putinești (R18) și Heciul Vechi (R22), 20 km cu oameni, etichetat R22 \| Țipletești\* | **iese din listă**: mașina nu mai e pe linie în fereastra de etalon a septembriei; nu afectează niciun card |
| 763LYY Prajila 26 % | în mai oprește la Putinești (16–23 de picioare), Gura Căinarului și Zarojeni sub R17; în sept. puține picioare (1–8), linia e dusă de 713IZX / 487NPL (Mărculești, Florești) | rămâne diagnostic; în runda 2 aduc drumul 713IZX pe Prajila |
| 727CWN Sturzovca 14 % | bucla prin Sadovoe / R11 | rămâne diagnostic; cardul R27 se ia pe serviciul direct (4) |

## 8. Precedentele de la celelalte uzine (servicii împărțite, bucle)

- **LEAR Ungheni §4.7**: «Comasare: A4 se face împreună cu A3, A7 împreună cu A6. Rută fără mașină proprie ≠ rută nefăcută.» Se aplică la
  R18 (Putinești în R32 / R17 / R22), la bucla 727CWN (R11 în R27) și la returul s1 al lui 348KAJ (R22 în R18).
- **LEAR Florești §4.4**: puncte de încărcare regulate care nu-s în act sunt «muncă a rutei, nu brambura»; bucla Soroca Nouă adaugă
  ~12 km pe sens. Se aplică la bucla D din Nihoreni și la ramura Bobletici.
- **LEAR Florești §4.2**: capătul fixat pe GPS acolo unde actul e vechi (A2). Nu se aplică aici: capetele din act sunt atinse.
- **SEBN §4.6**: «Rute buclă prin Orhei: tur ≠ retur e real, drumuri diferite — nu e greșeală». Se aplică la M1 (Zarojeni).
- **SEBN §4.2**: «startul real poate doar să lungească ruta». Varianta Florești de 52,9 km NU e un start real: acolo nu urcă nimeni.
- **Briceni §4.1**: «Capătul = satul cel mai depărtat în care mașina a oprit … o simplă trecere nu face capăt». Susține închiderea
  lui 52,9 (Florești) și M1 (Zarojeni fără oprire la retur).
- **LEAR Ungheni §6.5**: potrivire mare + raport ~1,9 = rută numărată dus-întors. La Bocancea, raportul ramurii Bobletici e real,
  cu oprire.

---

## Observații (rubrica comună)

**H1 — high, −2,0 (defect de logică, date): 518MHD e etichetat «R32 \| Trifanesti» pe drumul de acasă.**
- În `obs-ideal.json` (v4.2), 518MHD are 48 de picioare R32 în septembrie (tur 17, retur 31; km cu oameni 52,7). Pe urmă, drumul
  Izvoare → Florești nu are nicio oprire în satele R32: în 01–03.09 opririle sunt doar la Izvoare km 0 (acasă) și la Florești.
- Decizia v3 l-a scos din populația cardului R32. Eticheta a rămas însă, iar analiza săptămânală ia ruta și linia din `obs-ideal.json`
  (ION-107, `drax/cod/economie/etichete.mjs`).
- Scenariu: în săptămâna analizată, fiecare picior al lui 518MHD are ~17,5 km de drum spre / de la casă (Izvoare ↔ Florești) socotiți
  «cu oameni pe R32» în loc de livrare. La 2 picioare pe zi, ~35 km/zi lipsesc din R1a-ul mașinii și din pagina «Dorm / livrarea».
- Tot aici, mediana R32 pe toată fereastra iese 51,7 în loc de 40,2 dacă un pas din lanț uită să-l excludă pe 518MHD.
- Dovada: `drum2.txt` (518MHD R32 01–03.09: opriri «Izvoare@0.0 | Florești@21.6»), `med-out.txt` (518MHD R32 sept.: 52,7 / 52,7, 48 de
  picioare), `card-gps-raport.txt` (R32: «cursele lui 518MHD scoase din populație»).
- Corecția: în `etalon.mjs` / `decizii`, picioarele 518MHD fără oprire în satele R32 se etichetează R16 \| Floresti de la Florești, iar
  partea Izvoare → Florești e livrare. Test: 0 picioare 518MHD pe R32 în `obs`.

**M1 — medium, −1,0: R18 Zarojeni — retururile nu opresc la Zarojeni (2 din 96).**
- Cardul simetric de 28,9 pune pe retur ~5–7 km fără oameni.
- Nu e high: cardul e de referință, nu intră în R1a / R1b / R3.
- Corecția: proba minut cu minut pe 5 retururi s2 din septembrie, apoi decizia pe §6.1 (card pe sens) sau capătul returului =
  Gura Căinarului.

**L1 — low, −0,5:** la R36, regula §6.3 dă 53,4 (septembrie). Cardul 54,5 vine din v3.1, iar documentul nu spune de ce se păstrează
peste §6.3.

**Scor: 10 − 2,0 − 1,0 − 0,5 = 6,5. Blocante (high): 1 (H1).**

## Ce trebuie ca cealaltă parte să fie de acord
1. R3: acceptă că împărțirea pe grupă schimbă cardul cu 1 km/zi și închide steagul pe 44,2.
2. R16: acceptă proba «fără oprire în satele R32» (sau cere proba minut cu minut pe 3 dimineți 518MHD; o fac în runda 2).
3. R27: 23,7 pe serviciul direct al celor 6 mașini, bucla 727CWN ca R11 comasat.
4. R32: 40,2 plus H1 (eticheta 518MHD).
5. R36: 53,4 (§6.3) sau 54,0 (verificatorul), oricare din ele; 46,2 cade.
6. R18: rămâne cu steag până la proba minut cu minut a retururilor și la decizia pe §6.1.
