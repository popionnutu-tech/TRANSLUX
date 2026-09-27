# ION-112 — runda 2: candidatul ideal-v4.3 cu mutările convenite, și cifrele MĂSURATE de lanț

Runda 1: Claude verificator (≈ 8,5 cu pozițiile lui) / business 6,0 / analist 6,5; Codex: rezultat invalid de două ori (deducere-placeholder),
poziția reală din rezumat: acceptă DIRECȚIA mutărilor (518MHD → R16, buclele 727CWN afară din R27, Putinești legitim pe R32), dar cere
cifre reproduse din lanț, pe aceleași perechi și aceeași metodă, cu grupele D/EZ separate, înainte să accepte cardurile noi.

## ideal-v4.3 (VPS `/root/lde-worker/drax/date/ideal-v4.3/`, cod `.../cod/ideal-v4.3/etalon.mjs`, nesigilat încă)
Schimbarea față de v4.2 (doar pe perechile (mașină, rută) convenite; regula generală pe toată flota a mutat 238 de picioare, multe dubioase —
414ASB Ciuciulea → Cobani, 146BRAZ Trifănești → alte linii —, deci a fost RESTRÂNSĂ):
1. pentru 727CWN pe R27 și 348KAJ pe R18: linia aleasă fără NICIO oprire în satele ei pe partea cu oameni cedează liniei candidate cu ≥ 2 opriri
   sau cu o oprire la capătul ei;
2. decizie de grafic pentru 518MHD (verdict-v3: «518MHD are R16 pe ambele schimburi»): cursele lui etichetate R32 devin R16.
Picioare mutate: 205 din 13.695 — 518MHD R32 → R16 Florești 64, R16 Vărvăreuca 57; 727CWN R27 → R11 Limbenii Noi 24, R13 Hăsnășenii Noi 10,
alte 5; 348KAJ R18 → R32 Trifănești 24, R21 8, R22 7, alte 7.

## Cardurile măsurate de lanț pe v4.3, FĂRĂ deciziile celor 6 linii (copie /tmp/ideal-v4.3-fara-decizii, card-gps.mjs)
| linie | card azi (decizie) | măsurat pe v4.3 | observație |
|---|---|---|---|
| Florești R16 | 35,7 × 1 | 35,7 × 1 (16 zile, C47 100 %) | decizia «poarta sensului» nu mai e necesară; ture/zi 1 — dar 518MHD face 2 perechi/zi (verificator, business) |
| Vărvăreuca R16 | 42,8 × 2 | 42,0 × 3 | primește picioarele 518MHD care opresc la Vărvăreuca: e corect sau sunt tot Florești? |
| Trifănești R32 | 40,2 × 2 (fără 518MHD prin decizie) | 40,2 × 2 (19 zile), fără decizie | 518MHD scos structural |
| Sturzovca R27 | 24,9 × 3 | 23,9 × 3 (15 zile, C47 64 %) | km-ii se aliniază (23,5–24,0); turele rămân 3 — D face 2? |
| Bocancea Schit R36 | 54,5 × 1 | 53,3 × 1 (doar 4 zile în sursă, C47 95 %) | business/analist 53,3–53,4; verificatorul 54,5 |
| Nihoreni R3 | 44,2 × 2 | DIAGNOSTIC: porți divergente (poarta sensului 42,3 / orice poartă 45,8) | verificator: etalon pe grupă D 51,8 / EZ 42,6; business/analist: 44,2 |
| Zarojeni R18 | 28,9 × 2 | DIAGNOSTIC: C47 35 % | Zarojeni deservit doar pe s2 (business, minut cu minut); retururile se termină la Gura Căinarului (analist) |
| card flotă | 5.789 | 5.862 fără cele 6 decizii / 5.870 cu ele | — |

## Întrebările rundei 2 (pe fiecare, poziția DA/NU/alt număr, cu dovadă)
Q1 Florești: 35,7 × 2 (518MHD 2 perechi/zi) — și picioarele la Vărvăreuca: Florești sau Vărvăreuca?
Q2 Trifănești: 40,2 × 2 fără decizie — închidem steagul?
Q3 Sturzovca: 23,9 — × 2 sau × 3?
Q4 Bocancea Schit: 53,3 (sursa septembrie, 4 zile) sau 54,5 (card vechi)? regula §6.3 cere ≥ 3 zile bune în septembrie.
Q5 Nihoreni: un card (44,2 sau media 47,2) sau câte un etalon pe grupă (D 51,8 / EZ 42,6)?
Q6 Zarojeni: 1 tură (doar s2), card pe tur (29,0) sau pe sens; ce se face cu retururile care se termină la Gura Căinarului?
Q7 lista «capăt prin parcare» după v4.3.
Scor după rubrică; high doar cu scenariu + dovadă. Scopul: aceleași poziții la toate părțile.


## Starea după partea Claude, runda 2 (verificator 6,25 pe v4.3 inițial · business 7,0 · analist 5,5; H1 comun — 518MHD pe Vărvăreuca — REPARAT deja)
v4.3 corectat de sesiune după runda 2 Claude: 518MHD → R16 Florești construit direct (0 opriri la Vărvăreuca din ~80, 66/72 la Florești);
scoase deciziile R16 Florești și R32 Trifănești (518MHD e mutat structural). Lanțul v4.3 măsoară: **Florești 36,5 × 2** (34 de zile, C47 92 %),
**Vărvăreuca 42,8 × 2** (35 de zile, C47 93 %), **Trifănești 40,2 × 2** (19 zile). Card flotă 5.864 km/zi.
| linie | verificator | business | analist | stare Claude |
|---|---|---|---|---|
| Florești R16 | 35,7 × 2, tot 518MHD | 35,7 × 2 | 35,7 × 2 (retrage 35,2) | ACORD × 2; km: 35,7 (urma, de la prima oprire) vs 36,5 (lanț, etalon GPS cu raza porții) |
| Vărvăreuca R16 | 42,8 × 2 | — | 42,0 × 2 | ACORD × 2 (lanțul: 42,8) |
| Trifănești R32 | 40,2 × 2 | 40,2 × 2 | 40,2 × 2 | ACORD, steag închis |
| Sturzovca R27 | 23,9 × 2 | 23,9 × 2 | 23,9 × 2 | ACORD |
| Zarojeni R18 | 28,9 × 1 (EZ) | 28,3–29,0 × 1 (tur) | ≈ 27,7 × 1 (EZ) | ACORD × 1; km 27,7–29,0 |
| Bocancea R36 | 54,5 (sau 54,0; 14 perechi sept.) | 53,3 (§6.3) | 53,3 | 2 : 1 |
| Nihoreni R3 | media 47,2 × 2 (D 51,8 / EZ 42,6) | 44,2 × 2 | 44,2 × 2 (D 45,2 de la oprire; 51,8 = tăietura la prima atingere) | 2 : 1 |
| Prajila R17 (nou) | 3 ture vs 2 act — de verificat | pe listă, ture de remăsurat | 41,3 × 2 (713IZX zilnic) | direcție × 2 |
| H4 348KAJ Zarojeni | iese prin filtrul pe grupă | diagnostic cu motiv corectat | iese (retururile opresc la Zarojeni) | aproape |
| H4 412BRAY Heciul Vechi* | diagnostic | iese | iese | 2 : 1 iese |
| H4 763LYY Prajila | ture 3 vs 2 | rămâne | iese (oprește la Lunga 46–62) | NU |
| H4 727CWN Sturzovca | afară | iese | iese | ACORD iese |
Probleme de metodă ridicate: (M-b business) turele din card ≠ turele măsurate (Sturzovca 3 vs 2, Zarojeni 2 vs 1 — vin din deciziile «card vechi»);
(M-c business / M2 analist) returul tăiat la PRIMA apropiere de capăt, nu la ultima vizită / prima oprire — umflă sau taie liniile cu buclă în sat.


---
### verificator-raport.md

# ION-112 runda 2 — pozițiile pe Q1–Q7 (candidatul ideal-v4.3)

**Starea.** ideal-v4.3 e **nesigilat** (fără GATA) → `ruleaza.sh:19` îl refuză. Nu am folosit cardurile din `/tmp/ideal-v4.3-fara-decizii/` (VPS `/tmp` nu e sursă permisă). **Cerere: GATA pe ideal-v4.3**, apoi v15 pe candidat, pentru cardurile, C47, ture/zi și H4.
Până atunci am răspuns pe urma brută (deplasările `curse-ideal.json` sunt aceleași în toate candidatele), pe o rulare nouă pe activul v4.2: `RUN=/home/verif/verificator/rulari/drax-v14-1790535562`, **verdict.json b415e41cd1105d60c731c615a7d0f92f85760883564b426f5a18ce36f03be416**, INCHIS **ok**; diagnosticul în `diag-r2.txt` (scriptul `/root/diag-verif/r2-112.mjs`) + runda 1 (`../verif-112-r1/diag-steag6*.txt`).
Regulile: md5 1cfc6c53c3e0c23a3269c7bd834bdeef. Km = plin + raza porții; grupa = rotația §2.3 de la ancora 21.09.

| Q | poziția mea | dovada pe km GPS | ce rămâne de verificat pe v4.3 sigilat |
|---|---|---|---|
| **Q1** Florești × 2; 518MHD pe Florești sau pe Vărvăreuca | **Toate picioarele lui 518MHD pe Florești, niciunul pe Vărvăreuca. Florești 35,7 × 2; Vărvăreuca rămâne 42,8 × 2 (nu 42,0 × 3)** | 518MHD sept: 72 de picioare, **oprire §4.5 la Vărvăreuca 0/72**, la Florești 66/72; trece ≤ 1,2 km de Vărvăreuca pe 36, dar **după** Florești (Vărvăreuca → poartă 34,3 km, Florești → poartă 36,5) — Vărvăreuca nu e «mai departe» pe drumul lui, deci §4.2 («cel mai depărtat start atins») nu se aplică, iar §4.2 nou («drumul care doar trece prin sat nu face capătul») o exclude. 518MHD face 4 picioare/zi (2 perechi) în 15 din 19 zile. Vărvăreuca fără 518MHD: 350KAJ (77), **42,8 km, 2 perechi/zi**, oprire la Vărvăreuca 59/81 | Florești: ture/zi 2 și 35,7 ± 5 % pe picioarele 518MHD; Vărvăreuca: 42,8 × 2 fără 518MHD |
| **Q2** Trifănești fără decizie | **De acord: 40,2 × 2**, fără decizia «scoate 518MHD» (518MHD pleacă prin reatribuire) | 146BRAZ: D tur 35,9 / retur 41,2 prin Sevirova; EZ tur 40,1 / retur 41,8 prin Putinești (32/37; §1.4 pune Putinești aici) → media ~40 | 19 zile, C47, ture/zi pe 146BRAZ singur |
| **Q3** Sturzovca × 2 sau × 3 | **× 2, pe 23,9** | Grupa D (act: doar D) în sept: **perechi (schimb, mașină)/zi mediana 2** [0,1,2,1,1,2,2,2,2,1,2,2,2,2,1,0,2,2,2,2,1]; grupa EZ = bucla 727CWN, 0/32 opriri la Sturzovca. × 3 numără încă o pereche care nu oprește la capăt | perechile/zi pe v4.3 după mutarea celor 34 de picioare 727CWN (R11 24, R13 10) — dacă ies 3, C44 pe a treia |
| **Q4** Bocancea 53,3 vs 54,5 (§6.3) | **54,5 păstrat** (sau 54,0 dacă se re-măsoară); **53,3 nu** | §6.3: sursa = sept (≥ 3 zile bune). Pe GPS: sept **14 perechi bune** (≤ 18 %), etalon **54,0**; toate picioarele 53,9 (n34). 53,3 vine din 4 zile (filtrul satelor regulate). 54,5 vs 53,3 = 2,2 %, 54,5 vs 54,0 = 0,9 % — sub pragul G1 de 5 %, deci corecția nu e cerută | nimic (C47 95 %) |
| **Q5** Nihoreni: un card sau pe grupă | **Un card = media grupelor, 47,2 × 2**, acum; pe grupă când verificatorul și F2 pot controla grupa | D 51,8 (186OMM prin Recea, oprire 29/32; toată fereastra 51,7, n140) · EZ 42,6 (oprire 25/37; toată fereastra 42,6, n139); câte 1 pereche/zi pe grupă. 42,3 = doar EZ (poarta sensului); 44,2 / 45,8 = amestec fără sens fizic. Diferența față de 44,2 × 2: **+12 km/zi** cu oameni | nimic nou pe v4.3 (neatins) |
| **Q6** Zarojeni: 1 tură, card pe sens, retururile la Gura Căinarului | **1 tură (doar EZ, ca în act). Un singur card, 28,9 (sept EZ 29,0); fără card pe sens**, pentru că asimetria e sub prag | EZ: **turul pornește de la Gura Căinarului** (54/55 mai–iul, 8/8 sept) și trece prin Zarojeni (oprire 24/55, sept 6/8); **returul se termină la Gura Căinarului** (56/56, 8/8) și nu oprește la Zarojeni (2/56, 0/8). Tur / retur: mai–iul 27,4 / 22,6 (17,5 %), sept 31,6 / 28,1 (11 %) — sub 18 % (C18/C33) și §6.1/§6.7 (tur = retur pe mediană) permit un singur km. Un card pe sens cere schimbarea §6.1. **Notă:** Gura Căinarului e la ~3,7 km de Zarojeni, peste 2,5 km, deci returul atinge capătul doar prin trecere (§4.2 ≤ 1,2 km) — de spus în registru | C47 al Zarojeni pe v4.3 după mutarea picioarelor D (R32 24, R21 8, R22 7); ture/zi = 1 |
| **Q7** lista H4 după v4.3 | Probabil ies Zarojeni și Sturzovca; rămân Heciul Vechi* (fără card) și Prajila (§1.4 legitimează Putinești; 3 ture vs act 2) | din mutările raportate (348KAJ 39, 727CWN 34) | **doar pe v4.3 sigilat** (`capete-f.mjs`) |

## High-uri (cu scenariu) și scorul candidatului v4.3 așa cum e descris
- **H1 — 518MHD împărțit Florești 64 / Vărvăreuca 57.** *Scenariu:* Vărvăreuca primește o a treia tură (42,0 × 3) din picioarele unei mașini care nu oprește niciodată la Vărvăreuca și trece pe acolo după Florești; km-ul liniei scade la 42,0, iar card-ul crește cu ~+41 km/zi fictivi; Florești rămâne × 1 (−35,7 km/zi față de realitate). În F2, 57 de picioare ale lui 518MHD sunt judecate pe culoarul Vărvăreuca.
- **Medium:** Sturzovca × 3 față de 2 perechi/zi D; candidatul nesigilat, deci neverificabil; Nihoreni tot nehotărât (−12 km/zi cu oameni cât timp rămâne 44,2).
- **Low:** Zarojeni — returul atinge capătul doar prin trecere (Gura Căinarului la ~3,7 km), de scris în registru.
**Scorul (10 − Σ; high −2, medium −0,5, low −0,25):** H1 −2 · Sturzovca × 3 −0,5 · nesigilat −0,5 · Nihoreni −0,5 · Zarojeni −0,25 = **6,25 / 10**. Cu Q1 corectat (tot 518MHD pe Florești, × 2; Vărvăreuca 42,8 × 2), Sturzovca × 2 și GATA: ~8,5; cu Nihoreni 47,2: ~9.


---
### r2-business.md

# ION-112 runda 2: partea Claude (logica de business)

Autor: business-logic-auditor, 27.09.2026. Doar citire.
- **Date:** VPS `drax/date/ideal-v4.3` (`obs-ideal.json`, `schelet-ideal.json`) și copia `/tmp/ideal-v4.3-fara-decizii`.
- **Urma minut cu minut:** trackerul pg, cu scripturi rulate din `/root/lde-worker` și șterse după rulare.
- **Scripturile:** `scratchpad/p112/f1…f4.mjs`.
- **Oprirea** = sub 8 km/h, cel puțin 20 s, pe tracker. **Atingerea** = la cel mult 1,2 km (§4.2, §4.5).

---

## Q1 Florești: **DA, 35,7 × 2; TOATE picioarele lui 518MHD sunt Florești, niciunul nu e Vărvăreuca**
- **Urma, 14–16.09:** picioarele lui 518MHD etichetate «Vărvăreuca» trec la **0,84–0,87 km** de Vărvăreuca, adică o ating după §4.2, dar
  au **0 opriri** acolo. Opresc de **1–3 ori în Florești** (0,07–0,10 km), iar plinul lor e 34,7–37,0, cât Florești.
- **Pe fereastră:** din 121 de picioare ale lui 518MHD pe R16, doar 6 opresc în Vărvăreuca, toate în mai–iulie, **0 în septembrie**.
  Restul opresc în Florești (plin 33,1–35,3).
- **Perechile pe zi în septembrie:** 518MHD face s1 și s2 în fiecare zi (19 zile). Tura etichetată «Vărvăreuca» e tura celuilalt schimb:
  01.09 s1 = V, s2 = F; 07.09 s1 = F, s2 = V.
- **Efectul:**
  - Florești 35,7 × 1 → **× 2** (+71,4 km pe zi);
  - Vărvăreuca **42,0 × 3 → se remăsoară fără 518MHD**. Linia e a lui 350KAJ (218 picioare); în v4.2 avea 42,8 × 2.
  - Cartea «× 3» de pe Vărvăreuca numără tura lui 518MHD din Florești.
- **Regula de scris în §4.2** (pe o rută cu mai multe linii): capătul cursei = cel mai depărtat start al rutei **cu oprire (§4.5)**, dacă
  există unul; altfel cel atins. Același principiu ca în migrația 415 («drumul care doar trece prin sat nu face capătul»).

## Q2 Trifănești: **DA, 40,2 × 2, steagul se închide**
- Fără decizie, lanțul dă 40,2, iar turele măsurate sunt 2: 146BRAZ pe s1 și s2.
- Putinești e în linie prin §1.4 (migrația 415).

## Q3 Sturzovca: **23,9 × 2** (nu × 3)
- **Urma pe zile** (picioare cu oprire în Sturzovca, tur și retur): Sturzovca e grupa D, deci **un singur schimb pe zi**, cu **două
  autobuze**:
  - 14–18.09: 727CWN și 441ASB, pe s2;
  - 21–25.09: 727CWN și 804MUM, pe s1.
- **Perechi complete pe zi:** pe toată fereastra, mediana **2** (48 de zile cu 2, 24 cu 1, **0 cu 3**); în septembrie, mediana 2.
- **Lanțul însuși dă 2** (`tureZiE.sept = 2` în v4.3 și în copia fără decizii), dar câmpul `tureZi` rămâne 3 (M-b).
- §2.4 «Sturzovca … ambele schimburi, cu două mașini» se corectează în «schimbul grupei D, cu două mașini».

## Q4 Bocancea Schit: **53,3 × 1**. Mă aliniez cu analistul, **nu** cu verificatorul
- §6.3 cere septembrie când are ≥ 3 zile bune: lanțul are 4, iar metoda la oprire are 5 (53,2). Drumul s-a scurtat din septembrie
  (58,6 → 53,4).
- 54,5 e cardul vechi. Păstrarea lui contrazice §6.3.

## Q5 Nihoreni: **un card, 44,2 × 2**. Mă aliniez cu analistul, **nu** cu etalonul pe grupă al verificatorului
- Bucla D (+7–10 km, cu opriri în Nihoreni și în Rîșcani) e reală. Pe km pe zi, însă, două carduri pe grupă dau 177,8 față de 176,8,
  adică 1 km pe zi.
- §6.6 ține etalonul pe **schimb**, nu pe grupă. Un etalon pe grupă ar fi o regulă nouă, fără efect.
- Media 47,2 cade: vine din tăietura pe atingere la 186OMM (atingere la 36,5 km, oprire la 43,5 km, runda 1).

## Q6 Zarojeni: **1 tură; cardul pe tur (§6.1: tur = retur), 28,3–29,0**. Retururile **nu** se termină la Gura Căinarului
Urma pe tracker, toate picioarele lui 348KAJ pe R18 din v4.3:

| picior | câte | ating Zarojeni (≤ 1,2 km) | opresc în Zarojeni | plin în lanț |
|---|---|---|---|---|
| tur s2, mai–iul. | 34 | 22 | 17 | 25,8 |
| tur s2, sept. | 5 | 5 | 5 | **28,3** |
| retur s2, mai–iul. | 29 | **26** | 12 | 22,0 |
| retur s2, sept. | 4 | **4** | 3 | 22,0 |
| tur s1, mai–iul. / sept. | 26 / 3 | 8 / 1 | 8 / 1 | 25,8 / 33,4 |
| retur s1, mai–iul. / sept. | 37 / 4 | 20 / 0 | 10 / 0 | 22,2 / 39,2 |

- **Returul s2 ajunge în Zarojeni în 90 % din nopți** (22–24.09: opriri la 00:31–00:37, după Gura Căinarului). Constatarea analistului
  («retururile se termină la Gura Căinarului») **nu se confirmă**.
- **Plinul de 22 km al returului e o eroare de tăietură (M-c).** Lanțul taie returul la **prima** apropiere de Zarojeni (~22 km, înainte
  de Gura Căinarului, care e la 24,4), nu la vizita din Zarojeni care urmează.
- Din cauza acestei erori nu se poate face nicio zi bună după §6.2 (22 față de 28 = 22 %), iar linia iese «DIAGNOSTIC, C47 35 %».
- **Poziția:**
  - 1 tură (serviciul real e schimbul 2; pe s1 e deservită rar);
  - card = mediana tururilor cu oprire în Zarojeni din septembrie, **28,3** (sau 29,0 dacă lanțul măsoară aceleași tururi);
  - reparația tăieturii returului în lanț.
- **Aliniere:** cu verificatorul pe 1 tură; cu analistul **nu** pe retururi.

## Q7 Lista «capăt prin parcare» după v4.3 (opririle pe `opr`, în afara capătului)

| rând | după v4.3 | poziția |
|---|---|---|
| **Zarojeni 348KAJ** | 110 din 142 de picioare fără oprire în capăt în `opr` (77 %), dar pe tracker tururile și retururile s2 ating / opresc în 65–100 % | **rămâne diagnostic, cu motivul corectat:** extracția pierde opririle scurte (ca la 744ARF, ION-112 r0); fără excludere |
| **Heciul Vechi\* 412BRAY** | 130 de picioare, **0 în septembrie**; linia «\*» nu intră în cardul flotei (Σ fără \* = 5.789) | **iese din listă** (cu analistul) |
| **Prajila 763LYY** | **92 % fără oprire în Prajila** (sept. 29 din 30); opririle sunt în satele R32 (30), R18 / Putinești (22) și R16 (11); linia din septembrie e a lui **713IZX** (233 de picioare) | **îmi schimb poziția din runda 1: rămâne pe listă** (cu analistul). Doar picioarele cu Putinești sunt legitime pe R17 (§1.4); **× 3 se remăsoară** pe picioarele cu oprire în Prajila. |
| **Sturzovca 727CWN** | 17 %, **5 în septembrie**, fără ≥ 2 opriri în altă rută | **iese din listă** (buclele au ieșit în v4.3) |
| **Vărvăreuca 518MHD** (rând nou) | 83 de picioare, 0 opriri în Vărvăreuca în septembrie | **mutare pe Florești** (Q1) |

## Constatări cu deducere

**M-a (medium, −1): Vărvăreuca 42,0 × 3 în v4.3 numără serviciul Florești al lui 518MHD.**
- Dovada: trackerul (trecere la 0,84–0,87 km, 0 opriri) și 0 opriri în septembrie.
- Florești × 1 plus Vărvăreuca × 3 împart o singură mașină între două linii.
- Documentul pune întrebarea, dar cardul măsurat din tabel e deja greșit.

**M-b (medium, −1): `tureZi` nu urmează turele măsurate.** În copia fără decizii:
- Sturzovca: `tureZi` 3, dar `tureZiE.sept` = 2;
- Zarojeni: `tureZi` 2 (card vechi reținut), dar `tureZiE` = 1.

Cardul flotei păstrează ture pe care lanțul însuși nu le mai măsoară.

**M-c (medium, −1): tăietura returului la prima apropiere de capăt.** Returul lui 348KAJ e tăiat la ~22 km, deși oprirea din Zarojeni vine
după Gura Căinarului (~27–28 km). Asta face R18 nemăsurabil după §6.2 și a dus la concluzia greșită «retururile se termină la Gura
Căinarului».

## Scor

10 − (1 + 1 + 1) = **7,0 / 10**. **Niciun high.**

**Acordul propus pe cele 6 linii:**

| linie | card |
|---|---|
| Florești | 35,7 × 2 (+ Vărvăreuca remăsurat fără 518MHD) |
| Trifănești | 40,2 × 2 |
| Sturzovca | 23,9 × 2 |
| Bocancea Schit | 53,3 × 1 |
| Nihoreni | 44,2 × 2 |
| Zarojeni | 28,3–29,0 × 1 |

**Ce trebuie în lanț:**
- capătul cursei pe o rută cu mai multe linii = cel mai depărtat start **cu oprire** (§4.2);
- `tureZi` = turele măsurate;
- tăietura returului la ultima vizită în capăt.

**Ce trebuie în reguli:**
- §2.4 (Sturzovca);
- §4.2;
- §6.5 (turele);
- §6.6 (scos exemplul Sturzovca s2 46,9).


---
### r2-analist.md

# ION-112, runda 2 — uzina-analist («cercetează»): Q1, Q5, Q6, Q7 (+ pe scurt Q2–Q4)

Autor: uzina-analist, 27.09.2026. Nu am scris în bază și n-am schimbat nimic pe VPS.

Dovada nouă a rundei e **urma minut cu minut din tracker** (pg, tabela `track`, `w_date` citit ca UTC și trecut în Europe/Chisinau).
Scriptul `scratchpad/p112/leg.mjs` face asta:
- pe fiecare zi L–V și pe fiecare fereastră §3.2, ia vizita la poartă (la tur prima sosire în fereastră, la retur ultima plecare);
- caută opririle (v < 8 km/h, ≥ 20 s) în satele date, pe o rază R;
- măsoară km-ii pe urmă: la tur de la PRIMA oprire în sat până la poartă, la retur de la poartă până la ULTIMA oprire.

Ieșirile sunt tot în `scratchpad/p112/`:
- `leg-518.txt` (518MHD, 01–25.09);
- `leg-348.txt` (348KAJ, 17–25.09; înainte de 17.09 dispozitivul 2321 n-are puncte în tracker);
- `leg-nih.txt` (186OMM, 345KAJ, 457BRAX, 01–25.09);
- `cine-r17.txt` (cine oprește în satele R17 pe `curse-ideal` v4.3, plus rândurile din card v4.3 pentru R17 și R16).

## Q1 — Florești / Vărvăreuca (518MHD)

**518MHD NU oprește niciodată în Vărvăreuca.** În 01–25.09 a avut ~80 de curse la poartă și 0 opriri la ≤ 0,7 km de Vărvăreuca
(`leg-518.txt`). Oprește în Florești (≤ 0,9 km) aproape pe toate cele patru picioare, în fiecare zi:

| picior | ora la poartă | opriri | km pe urmă |
|---|---|---|---|
| tur s1 | 05:59–06:25 | Florești 05:27–05:38 | de la prima oprire la poartă **35,5–37,0** (mediană ~35,8) |
| tur s2 | 14:28–14:37 | Florești 13:52–14:06; uneori Mărculești înainte (așteaptă acolo 1,5 h, de la 12:09) | 35,2–40,8 |
| retur s1 | 15:52–15:59 | Florești 16:17–16:37, apoi acasă la Izvoare | — |
| retur s2 | 00:18–00:24 | Florești 00:39–00:54 | de la poartă la ultima oprire în Florești **32,0–34,6** |

Concluzii:
- **Ambele linii R16 NU sunt deservite de aceeași mașină.** 518MHD face R16 \| Florești, 2 perechi pe zi. R16 \| Vărvăreuca e a lui 350KAJ.
- Cele 57 de picioare 518MHD pe care v4.3 le-a mutat pe «R16 \| Vărvăreuca» ating Vărvăreuca doar în trecere (drumul Florești → Vărvăreuca
  → Mărculești → poartă) și sunt Florești.
- **Poziția: Florești 35,7 × 2** (lanțul dă 35,7, C47 100 %; mediana urmei la tur ~35,8, la retur ~33,5). Îmi retrag cifra 35,2 din
  runda 1 și mă aliniez cu verificatorul și cu business-ul. **Vărvăreuca 42,0 × 2** (350KAJ), nu × 3.
- Efectul pe card: Florești +71,4 km/zi, Vărvăreuca −84,0 km/zi, net −12,6.

## Q5 — Nihoreni: aceeași linie, două drumuri în sat

Km-ii pe urmă de la oprirea din Nihoreni la poartă, și înapoi (`leg-nih.txt`):

| mașină | picioare | km (min–max) | mediană |
|---|---|---|---|
| 186OMM (grupa D în sept.) | 31 | 44,7–47,6 | **45,2** (foarte stabil) |
| 345KAJ (EZ) | 16 | 39,9–42,3 (două abateri: 45,9 și 36,6) | **41,5** |
| 457BRAX | 16 | 40,9–47,0 | **43,2** |

- Diferența reală D ↔ EZ e **~3,7 km**, nu 10. Varianta D 51,8 (verificatorul) și cei 52 de km din runda 1 vin din tăierea la PRIMA
  atingere a Nihoreniului, înainte de bucla prin sat. Business-ul a spus-o deja: «186OMM atinge Nihoreni la 36,5 km, dar oprește acolo la 43,5».
- Pe urmă, oprirea D e mai adâncă în sat și cu o trecere în plus prin orașul Rîșcani. Satele sunt aceleași, capătul e același, iar fiecare
  grupă are un autobuz. Deci e **aceeași linie, cu două drumuri în sat**, nu două servicii.
- Un etalon pe grupă ar da 2 × 45,2 + 2 × 41,5 = 173,4 km/zi, față de 2 × 2 × 44,2 = 176,8 (−3,4). Mediana pe urmă a tuturor picioarelor
  e ~44.
- **Poziția: un card, 44,2 × 2** (sau 43,4, media grupelor; diferența e sub 2 %). Aliniat cu business-ul. **Nu** cu verificatorul pe 51,8:
  cifra lui ține de metoda tăieturii, nu de serviciu.
- Precedente:
  - LEAR Ungheni §6.2: «MEDIANA zilelor rămase, tur și retur la un loc»;
  - Florești §4.4: buclele de urcare sunt «muncă a rutei»;
  - Drăxlmaier §6.6: etalonul pe schimb doar «unde schimburile merg pe drumuri diferite»; aici diferența e de 8 %, iar grupele se rotesc.

## Q6 — Zarojeni (348KAJ), s1 față de s2

**Mă corectez față de runda 1.** Afirmația «retururile nu opresc la Zarojeni (2 din 96)» venea din `opr` extras, care unește opririle
(business-ul a arătat același lucru). Pe urmă, 17–25.09 (`leg-348.txt`):

**Săptămâna 21.09 (faza A: grupa EZ pe s2; Zarojeni e doar EZ în act):**
- tur s2: oprire în **Zarojeni 13:36–13:44** (99–417 s) → Gura Căinarului (opriri de 4–14 min; acolo e și casa mașinii) → poarta
  14:30–14:46. Km de la oprirea din Zarojeni: **27,7 / 27,8 / 28,0** (21, 23, 25.09). Pe 22.09 prima oprire e în Gura Căinarului
  (13:31), apoi Zarojeni 13:38.
- retur s2: poarta 00:15–00:19 → trece încet prin **Zarojeni la 00:32–00:37 pe 22, 23 și 24.09** (3 din 5 nopți) → acasă, în Gura
  Căinarului, la 00:38–00:44. Km de la poartă până acasă: 25,2–26,6, deci până la Zarojeni ~23,7–25.
- tur s1 și retur s1: **Țiplești, Țipletești, Heciul Vechi (R22), uneori Putinești**, fără Zarojeni. Km: tur 20,8–24,4; retur până acasă
  28,6–29,6. Sunt serviciul R22, nu R18.

**Săptămâna 14.09 (faza B: EZ pe s1):** pe 17.09 turul s1 pornește din Zarojeni (oprire de 6 min), 34,2 km. Turul s2 din 18–19.09
pornește din Gura Căinarului, cu 42–51 km pe alte sate. Rețin o limită: dispozitivul are puncte în tracker doar din 17.09, deci faza B
e văzută doar pe 3 zile.

**Poziția: 1 tură pe zi, cea a grupei EZ, care urmează rotația; card ≈ 27,7 × 1.**
- Tur 27,7–28,0; retur ~24–25. Diferența de ~12 % încape în cele 18 % ale §6.2, deci un singur card.
- Aliniat cu business-ul (27,7 × 1) și cu verificatorul pe o tură.
- Retururile care se opresc acasă, la Gura Căinarului, după Zarojeni: km-ii de la Zarojeni până acasă (~1,5 km) sunt livrare, nu linie.
- Picioarele D ale lui 348KAJ trec pe R22 / R21 / R32, cum a făcut v4.3.

## Q7 — lista «capăt atins prin parcare» după v4.3

| rând | pe GPS | poziția |
|---|---|---|
| 348KAJ Zarojeni | după mutările v4.3 rămân picioarele EZ, care opresc în Zarojeni (Q6) | **iese din listă** |
| 412BRAY Heciul Vechi\* | doar în mai, 0 picioare în sept. | **iese** |
| 727CWN Sturzovca | buclele au trecut pe R11 / R13 (v4.3) | **iese** |
| **763LYY Prajila** | vezi mai jos | **iese din listă, dar cu corecție de ture** |

**763LYY pe R17 Prajila** (`cine-r17.txt`):
- Oprește la **Lunga** pe toate picioarele (46–62), la Băhrinești și Mărculești uneori, la Prajila rar (1–7 din 32–52).
- În mai–iulie oprește în plus în satele R18: Putinești și Gura Căinarului, pe 24–27 de picioare.
- Deci face R17 cu oameni (Lunga, Băhrinești, Mărculești sunt sate R17), dar pornește de la Lunga, la ~2,9 km de Prajila. Nu e parcare,
  e serviciu (business: «se scoate»).

**Turele Prajila** (verificatorul: «3 față de 2 de verificat»):
- Linia o face 713IZX, cu oprire la Prajila pe practic toate picioarele: tur s1 57, tur s2 59, retur s1 57, retur s2 60; în sept. câte 13.
- 487NPL o face în 6 zile din septembrie, pe câte un picior din fiecare fel. 13 + 6 = 19 zile lucrătoare, deci îl **înlocuiește** pe
  713IZX, nu vine în plus.
- 763LYY e pe R17 în septembrie doar în 7–8 zile din 19; în rest e pe R30 Coșernița (7–9 picioare).
- Cu §6.3 (sursa septembrie), turele ies **2 pe zi**. Card v4.3: 41,3 × 3 = 247,8 km/zi; cu 2 ture: 165,2 (−82,6).
- De confirmat cu `card-gps.mjs` pe septembrie (M1). Picioarele 763LYY de la Lunga nu intră în km-ii Prajila: pornesc cu ~4 km mai aproape.

## Pe scurt, Q2–Q4
- **Q2 Trifănești: 40,2 × 2, steagul se închide.** Aliniat cu toți.
- **Q3 Sturzovca: 23,9, × 2.**
  - Îmi retrag «× 3» din runda 1. După ce buclele 727CWN au ieșit, mașinile în plus pe același schimb în septembrie sunt sub jumătate din zile:
    804MUM 5 zile, 397VKV 8, 441ASB 5–9 picioare.
  - Aliniat cu verificatorul și business-ul (× 2), cu condiția ca `card-gps.mjs` pe septembrie să dea 2.
- **Q4 Bocancea Schit: 53,3.** Regula §6.3 cere ≥ 3 zile bune în septembrie; sunt 4, deci sursa e septembrie. Aliniat cu business-ul. Cei 54,5
  ai verificatorului sunt cardul vechi (+2 %).

## Matricea mea după runda 2

| Q | poziția | aliniat cu |
|---|---|---|
| Q1 Florești | 35,7 × 2; picioarele 518MHD de pe «Vărvăreuca» sunt Florești; Vărvăreuca × 2 | verificator + business (pe Florești × 2); mutarea pe Vărvăreuca din v4.3 e nouă și greșită (**H1**) |
| Q2 | 40,2 × 2 | toți |
| Q3 | 23,9 × 2 | verificator + business |
| Q4 | 53,3 × 1 | business (verificatorul: 54,5) |
| Q5 | 44,2 × 2 (un card) | business; NU verificatorul (51,8 = tăietură la atingere) |
| Q6 | 1 tură, ≈ 27,7 | business; verificatorul pe o tură |
| Q7 | lista se golește; turele Prajila 3 → 2 (sept.) | business pe listă; verificatorul pe «de verificat» turele |

## Observații (rubrica comună)

**H1 — high, −2,0 (defect de logică în candidat): v4.3 mută 57 de picioare 518MHD pe R16 \| Vărvăreuca.**
- Pe urmă, 518MHD nu oprește niciodată în Vărvăreuca: 0 din ~80 de curse, 01–25.09.
- Scenariu, cu v4.3 sigilat așa:
  - cardul Vărvăreuca iese × 3 (252 km/zi) în loc de × 2 (168), deci +84 km/zi;
  - Florești rămâne × 1 (71,4) în loc de × 2 (142,8), deci −71,4;
  - analiza săptămânală (etichetele din `obs`) pune jumătate din cursele lui 518MHD pe o linie pe care n-o deservește.
- Dovada: `leg-518.txt` (opriri «Floresti …» pe fiecare picior, nicio «Varvareuca») și `runda-2.md` («R16 Vărvăreuca 57»).
- Corecția: decizia de grafic «518MHD → R16» se ia pe **R16 \| Florești** (capătul din act e Florești, iar el oprește acolo). Test: 0 picioare
  518MHD pe Vărvăreuca în `obs` v4.3, iar Florești măsurat × 2.

**M1 — medium, −1,0 (date de reprodus): turele Prajila × 3 vin din toată fereastra.** În septembrie, 487NPL îl înlocuiește pe 713IZX, iar
763LYY e pe R17 în 7–8 zile din 19. Corecția: `card-gps.mjs` pe sursa septembrie pentru ture (§6.3 pe km, §6.5 pe ture, aceeași sursă).

**M2 — medium, −1,0 (metodă): tăietura la PRIMA atingere a capătului umflă liniile cu buclă în sat.** Nihoreni D: 51,8 față de 45,2 pe oprire.
Același efect poate apărea la orice linie al cărei capăt are o buclă de urcare (Bocancea: ramurile). Corecția: pentru card, verificatorul să
măsoare de la PRIMA OPRIRE în capăt (la tur) sau până la ULTIMA (la retur), ca în `leg.mjs`, și să arate diferența pe toate cele 48 de linii.

**L1 — low, −0,5:** proba Zarojeni pe tracker acoperă doar 17–25.09 (dispozitivul 2321 n-are puncte înainte). Faza B are doar 3 zile.

**Scor: 10 − 2,0 − 1,0 − 1,0 − 0,5 = 5,5. Blocante (high): 1 (H1).**
