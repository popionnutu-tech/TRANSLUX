# ION-111 — runda 2: ideal-v4.2 (filtrul de «tranzit» pe opriri, în schelet)

Runda 1: Claude 5,0 (verificator 5,0 / business 6,0 / analist 5,0), Codex 7,0 fail (C1 high: `sl` lipsește în curse-ideal.json și
cârpirea reface opririle fără el → regula săptămânală nu se poate copia ca atare). Consens: V1 NU, V2 NU, V3 diagnostic, V5 DA.

## Răspunsul la C1 (Codex) — regula echivalentă FĂRĂ durată
`curse.mjs:133-145` și `carpire.mjs:48-56` păstrează o oprire doar cu viteza minimă < 8 km/h și ≥ 20 s lent (S_LENT) — exact pragul de jos
al regulii săptămânale; lipsește doar plafonul de sus (15 min), înlocuit cu excluderea opririlor de la începutul/sfârșitul cursei (≤ 0,5 km
de c.a / c.b — casa, parcarea). Cârpirea folosește aceeași definiție, deci regula supraviețuiește lanțului. Nicio propagare de `sl` nu e
necesară. În `ideal-v4.2/etalon.mjs` (în locul liniei 104 din v4.1):
  cursa mașinii din afara graficului (fără dus-întors, gol > plin) NU se respinge dacă are ≥ 2 opriri în satele rutei (în afara capetelor
  cursei) SAU o oprire la ≤ 2,5 km de capătul liniei.

## ideal-v4.2 (VPS `/root/lde-worker/drax/date/ideal-v4.2/`, cod `.../cod/ideal-v4.2/`; reproductibil 24/24; GATA, schelet sha 629b0c1d…)
| linie | v4.1 | v4.2 |
|---|---|---|
| R13 Hăsnășenii Noi | fără ideal (C31) | 9,5 km × 1 → 19 km/zi (etalon 9,6, s1/s2 9,6/9,6) |
| R14 Dominteni | 34,0 × 3 → 204 km/zi | 29,9 × 1 → 59,8 km/zi (act: 1 tură; verificator H4 «Dominteni 3 ture cu serviciul R13 al lui 710CWN») |
| R22 Țiplești | 21,4 × 1 → 42,8 | 21,9 × 2 → 87,6 (act: 2 ture; returul s2 al lui 804MUM, recunoscut după opriri) |
| R13 Lazo | 65,6 | 64,8 |
| R33 Iezărenii Vechi | 69,4 | 68,2 |
| celelalte 44 | — | identice |
| flota (card) | 5.872 | 5.789 km/zi (−83) |
R18 Putinești și R27 Iabloana: tot fără ideal (C31), cum a hotărât runda 1.

## Ce se cere
(A) v4.2 e corect pe toate liniile (verificatorul pe km GPS; Dominteni/Țiplești — schimbarea e reală, nu o mutare greșită)?
(B) săptămâna 14.09 pe v4.2 (simulare pe copie, instantaneu nou din v4.2, aceleași date): 744ARF intră în măsurare? ce se schimbă pe flotă?
(C) textul §1.4 (R13 n-are curse) + regula tranzitului — migrație. Scor după rubrică.


## Răspunsurile părții Claude (runda 2) — verificator 7,25 (v11, 0 high) · business 8,0 (0 high) → Claude = 7,25
Registrul: sesiunea a adăugat semnăturile pe v4.2 (sha 629b0c1d) pentru cele 4 blocante (Putinești cu motivul nou); intrarea C31 R13 Hasnasenii Noi moare la comutare; v12 după.


---
### r2/verificator-raport.md

# Verificarea 11 — DRAXELMAIER_BALTI — 27.09.2026 (ideal-v4.2, ION-111 runda 2)

**Starea.** `RUN=/home/verif/verificator/rulari/drax-v11-1790526793` · sursa `/root/lde-worker/drax/date/ideal-v4.2` (GATA al producătorului, schelet-ideal 629b0c1d723e…) · drax.mjs 1be43dc0b57b · ruleaza.sh a26fad56be25 · node v20.20.2 · Europe/Chisinau.
Regulile: md5 56dfde040fe3c376618fb75d4507501d, 26.373 caractere, `reguli_livrare_la` 2026-09-27T15:59:07.883497+00:00 (verificat). Față de 62eace0d se schimbă doar §5.3, §7.4, §8.6 și §12.1 — niciunul nu intră în schelet.
**verdict.json sha256 9b0fd4cc476978200fccfe80a7b9ad1033db34eb426c6b9142dbbeaeaba02693** · probe: R1 **ok** · registru **PICATĂ** (registrul e pe bfa070f0 — X2) · INCHIS: **ok**.
Unități: 51 linii din act, 49 cu ideal (+R13 Hasnasenii Noi), 49 mașini, 13.695 observații cu rută (+161), 13.476 deplasări cu rută, 27.644 brute (identice).

## (1) Verdictul
**valid_pentru_export: false** — 4 blocante, toate vechi și toate neexplicate doar pentru că registrul e pe alt sha: C31 R18 Putinești, C31 R27 Iabloana, G1 R18 Zarojeni (28,9 / 30,7), G1 R27 Sturzovca (24,9 / 46,5). **Niciun blocant nou.**
**C31 R13 Hasnasenii Noi a dispărut** (linia are ideal) → intrarea din registru e moartă (X1). Card 5.872 → 5.789 km/zi (GPS completat 6.000 → 5.918).
| linie | card km × ture | km/zi | zile bune GPS | C47 |
|---|---|---|---|---|
| R13 Hasnasenii Noi (nouă) | 9,5 × 1 | 19,0 | 12 | 20/20 (100 %) |
| R14 Dominteni | 34,0 × 3 → **29,9 × 1** | 204 → 59,8 | 54 → 17 | 77/114 (68 %) → 38/39 (97 %) |
| R22 Țiplești | 21,4 × 1 → **21,9 × 2** | 42,8 → 87,6 | 7 → 28 | 20/24 (83 %) → 49/54 (91 %) |
| R13 Lazo | 16,4 → 16,2 × 2 | 65,6 → 64,8 | 22 → 116 | 51/51 → 252/259 (97 %) |
| R33 Iezărenii Vechi | 34,7 → 34,1 × 1 | 69,4 → 68,2 | 13 → 18 | 96 % → 97 % |
Celelalte linii au cardul neschimbat; +161 de observații noi distribuite pe flotă, fără nicio scădere de C47. Constatări noi: G1 «orice poartă» pe R3 Nihoreni (poarta sensului 42,3 / orice poartă 45,8, 8,3 % — steagul E1 există) și D2 izolat câte o zi pe Sturzovca și Căinarii Vechi. Dispărute: C42 pe Dominteni, Țiplești și Sturzovca, C35(e) pe Dominteni.

## (2) Dominteni și Țiplești — schimbarea e reală pe GPS
Atribuirea observațiilor, cheie cu cheie, v4.1 (v10) ↔ v4.2 (v11) — `mutari-raw.txt`:
- **Dominteni → Lazo: 207 observații, toate ale lui 710CWN** (sept 76); 183/207 opresc §4.5 în satele R13 (Lazo 118, Hăsnășenii Noi 108, Dobrogea Veche 79). Pe Dominteni rămâne 826GXP (35 de observații în sept) cu **1 pereche (schimb, mașină)/zi** = actul (1). Pe Lazo, 710CWN face **2 perechi/zi** în sept. E exact clasa H4 din runda precedentă (Dominteni 45 %), acum rezolvată.
- **Țiplești: +56 observații noi** (034BRAT 18, 402VKV 17, 804MUM 11, 397VKV 8), **56/56 cu oprire în satele R22** (Heciul Vechi 55, Alexăndreni 53, Țiplești 48), plus **10 mutate de la R18 Putinești** (397VKV 6, 804MUM 4), 10/10 cu opriri la Heciul Vechi și Alexăndreni — cursele pe care runda precedentă le-a arătat drept serviciu R22 fără oprire la Putinești. Perechi/zi în sept: mediana 2 = actul (2).
- **R18 Putinești** rămâne cu 7 observații, **toate cu oprire la Putinești** (≈ 19 km; 763LYY 4, 146BRAZ, 731ARF), fără nicio pereche → C31 corect, iar acum e curat.
- **R13 Hasnasenii Noi:** km-ul e solid (tururi și retururi 9,4–9,6 km; C47 20/20). Perechile vin însă din două surse diferite:
  - săptămânile s2 — tur s2 (naveta de la poartă de la 13:40) + retur s2 la 00:19 cu oprire la Hăsnășenii Noi: **pereche reală**;
  - săptămânile s1 — tur s1 la 05:15 de la 14 km dincolo de capăt, **fără nicio oprire §4.5 pe partea plină** (7 în sept: 01, 02, 04, 14–17.09) + retur s1 15:53: **jumătate din zilele bune stau pe un tur fără dovadă de urcare** — drumul de acasă care doar trece prin sat (§4.1: «nu fac capăt» / §5.2 livrare).
- Alte mutări mici: Prajila → Heciul Nou 4 (763LYY, 4/4 cu opriri R21); 9 noi pe Dominteni (034BRAT 7, cu opriri la Cubolta, Dominteni, Petreni).

## (3) H4 «capăt prin parcare» pe v4.2 (listă de diagnostic, fără excludere)
Zarojeni 15/29 (52 %, 348KAJ) · Heciul Vechi* 61/130 (47 %, 412BRAY) · Prajila 28/106 (26 %, 763LYY → Gura Căinarului, Zarojeni) · Sturzovca 15/106 (14 %, 727CWN → sate R11). **Au ieșit din listă Dominteni (45 %) și Țiplești (13 %).** 59 de linii < 10 %. Zarojeni ↔ Țiplești (348KAJ, sate R22) și Prajila ↔ R18 rămân de lămurit.

## (4) Ce trebuie la registru (sesiunea)
1. Re-semnarea celor 4 blocante pe `629b0c1d723eae95c4e7ad427ef680df009d76b7e0ecf5a78a65ca012b3d8745`; C31 R18 Putinești cu motivul nou: «7 observații cu oprire la Putinești (≈ 19 km), nicio pereche; cursele 397VKV/804MUM sunt ale R22 Țiplești (v4.2)».
2. Ștergerea C31 R13 Hasnasenii Noi de pe bfa070f0 (moartă); intrarea de pe sha-ul activ se șterge la comutare.
3. Intrările bfa070f0 se păstrează doar dacă v4.1 devine activ înainte de v4.2; altfel se scot la comutarea pe v4.2.
4. Rularea v12 pe aceeași sursă: proba-registru «ok», `valid_pentru_export` true.

## High-uri și scorul
Nicio high nouă. **Medium cu scenariu — R13 Hasnasenii Noi, turul de dimineață s1 fără urcare:** 744ARF vine de acasă la 05:15, trece prin Hăsnășenii Noi fără oprire și ajunge la poartă în fereastra turului s1. *Scenariu:* F2 îl socotește «cu oameni» (9,5 km), nu livrare (R1a), în săptămânile s1: aproximativ −9,5 km/zi livrare la 744ARF, iar ture/zi = 1 se sprijină pe 7 zile din 12 fără dovadă. Garda propusă: tur fără oprire §4.5 la capăt sau pe partea plină = livrare, nu tur.
**Scorul (10 − Σ; medium −0,5 · low −0,25):** HN tur fără urcare −0,5 · registru nere-semnat −0,5 · H4 rămas (Zarojeni, Prajila, Sturzovca, listă) −0,5 · Nihoreni «orice poartă» 8,3 % −0,25 · Lazo: sursa lanțului «toate» (C32: bune sept 2) față de 116 zile bune GPS −0,25 · rămase din runda precedentă (cheia cache-ului, prag §4.1, capete-gps.json în afara intrărilor) −0,75 = −2,75 → **7,25 / 10**. După v12 (registru re-semnat): 7,75; cu garda pe HN: ~8,25.


---
### r2/r2-business.md

# ION-111 runda 2: partea Claude (logica de business). ideal-v4.2

Autor: business-logic-auditor, 27.09.2026. Doar citire, fără `--write`.
- **Simularea:** `/tmp/p111d-sim/2026-09-14`, instantaneu nou din `ideal-v4.2` (schelet md5 `540d4571…`), rulat cu codul de producție
  `drax/cod/saptamanal`.
- **Comparația:** cu rândul actual `date/saptamanal/2026-09-14`, pe v4.1: B 8.986,2, măsurat pe 147 din 189 de zile.
- **Regulile:** 26.373 de caractere, md5 `56dfde04…`.
- **Scripturile:** `scratchpad/p111/d1…d6`.

---

## (1) Săptămâna 14.09 pe v4.2

**Flota** (rândul întreg):

| | v4.1 | v4.2 |
|---|---|---|
| carduri B | 8.986 | **9.912** (+926) |
| măsurat | 147 / 189 zile | 156 / 189 zile |
| R1b | 3.684 | 4.398 |
| peste pragul de indicații | 19 | 21 |
| top 3 | 925FTI, 912RNK, 457BRAX | **710CWN 462,3**, 925FTI, 912RNK |

P10 38/38, bilanț 195/195. Categoriile se schimbă doar la 4 mașini: 710CWN, 804MUM, 388ASB, 293QVT.

**Pe mașini:**

| mașina | zile măsurate | R1a | R1b | B | ce s-a schimbat |
|---|---|---|---|---|---|
| **744ARF** | 0 → **5** | 0 → 204,8 | 0 → 182,2 | 0 → 387,0 | Etichetele sunt identice cu v4.1 (turul s1 05:04–06:04 și returul s1 15:54 erau deja R13 în rândul actual). Ieșea din măsurare doar pentru «linie fără etalon». Acum R13 are 9,5 km: plinul e 8,9 km, iar acasă ↔ Hăsnășenii Noi (14,7 km dimineața) e livrare, ca în §7.4. **Intră corect.** |
| **710CWN** | 5 → 5 | 0 → 185,6 | 105,8 → **462,3** | 105,8 → **647,9** | 21 de picioare R14\|Dominteni → **R13\|Lazo**. Pe categorii: cu oameni −366, livrare +542, gol pe rută −175. |
| **804MUM** | 1 → **4** | 48,3 → 193,3 | 44,0 → 162,7 | 92,3 → 356,0 | 3 picioare R18\|Putinești → R22\|Țiplești s1. E exact contaminarea R18 din runda 1 (drumurile Țiplești fără oprire în Putinești), acum reparată. |
| 388ASB | 4 → 5 | 106,3 → 133,3 | 176,2 → 232,7 | 282,5 → 366,0 | 1 retur s2 R15 Suri → R12 Sofia. Singura oprire e în Sofia (30,9 km); Șuri e doar pe drum, spre casă. Corect după §4.1 («drumul de acasă nu face capăt»). |

**Verdict pe 710CWN: schimbarea e reală, nu o mutare greșită.**
- Dovada GPS: în ferestre, turul pornește de acasă, din Petreni (oprire la 0,2 km), și are opriri **doar** în Lazo (18,3 km), Hăsnășenii
  Noi și Dobrogea Veche. Returul s2 coboară în Dobrogea Veche, Hăsnășenii Noi și Lazo, apoi merge acasă în Petreni (33,2 km). În
  Petreni, Moara de Piatră și Hăsnășenii Mari nu urcă nimeni.
- E serviciul liniei R13 Lazo (Lazo – Hăsnășenii Noi – Dobrogea Veche). Drumul Petreni ↔ Lazo, ~19 km, e drumul de acasă.

**Consecința pentru dispecer** (a se vedea M-a):
- 710CWN trece de pe locul «sub prag» pe **locul 1 în indicații**: «între curse așteaptă la capăt (Lazo) sau la uzină, nu acasă, în
  Petreni».
- Între curse, mașina merge acasă, 18 km dincolo de Lazo, de 2–3 ori pe zi.

## (2) Dominteni 3 → 1 tură și Țiplești 1 → 2: **DA, corecte după regulile lui Ion**

- **§6.5** spune că turele se măsoară (mediana perechilor pe schimb și mașină pe zi), nu se iau din act.
- **R14 Dominteni:**
  - v4.1: 710CWN 67 de zile (65/62) și 826GXP 65 (33/32), deci 3 ture;
  - v4.2: 710CWN rămâne cu 20 de zile, 826GXP singur pe zilele obișnuite, deci **1 tură = actul** (R14 1 tură).
- **R13 Lazo** rămâne la 2 ture, dar în septembrie acum le face 710CWN (64 de zile, 58/56). 043BRAU are 15 zile, toate înainte de
  septembrie.
- **Pe card:** în v4.1, serviciul Lazo era numărat de două ori: pe Lazo prin 043BRAU (mai–iulie) și pe Dominteni prin 710CWN. Minusul
  de 144 km/zi pe Dominteni scoate această dublare, iar cele −83 km/zi pe flotă sunt corecte.
- **R22 Țiplești:** 826GXP, 402VKV, 034BRAT, 397VKV, 804MUM, cu 10–15 zile fiecare. După ce drumurile Țiplești ale lui 397VKV și 804MUM
  nu mai stau pe R18, rezultă 2 ture = actul.
- **Rămâne pentru Ion (nu blochează):** 826GXP apare și pe Dominteni (65 de zile), și pe Țiplești (57 de zile). Probabil un autobuz pe
  două linii prin rotație, dar de confirmat.

## (3) Textul de schimbat prin migrație (gard pe 26.373 / 56dfde04)

1. **§1.4:**
   - «Liniile Hasnasenii Noi (R13), Putinești (R18) și Iabloana (R27) n-au nicio cursă…» devine: R13 Hăsnășenii Noi are etalon din
     ION-111 (9,5 km, 1 tură, 744ARF); R18 și R27 rămân fără etalon.
   - «48 din 51» devine «49 din 51».
2. **§4.2:** fraza «cursa ÎNCEPE ori SE TERMINĂ la ≤ 2,5 km de el» contrazice acum rezultatul.
   - 710CWN pornește din Petreni, la ≤ 2,5 km de satul-start Dominteni, și totuși e pe Lazo.
   - De adăugat: «Pornirea sau sosirea ACASĂ, fără opriri, nu face capătul cursei; capătul e satul cu urcări/coborâri (§4.5)», în linie
     cu ultima frază din §4.1.
3. **Regula tranzitului, frază nouă în §4.2 sau §4.6:** «Cursa unei mașini din afara graficului nu se respinge pentru că drumul gol e mai
   lung decât cel plin, dacă are cel puțin 2 opriri (§4.5) în satele rutei sau una la ≤ 2,5 km de capătul liniei; opririle de la ≤ 0,5 km
   de începutul sau sfârșitul cursei (casa, parcarea) nu se numără» (Ion, 27.09: «dacă au opriri și rutele sunt în schelet»).
4. **§6.5:**
   - «29 de linii × 1, 16 × 2, 3 × 3 (Dominteni, Prajila, Sturzovca)» se recalculează pe v4.2: Dominteni iese din × 3, Țiplești intră
     la × 2, R13 Hăsnășenii Noi × 1.
   - «5.843 km/zi» devine 5.789. Cifra din text era oricum veche: v4.1 avea 5.872.
5. **§6.3:** «R13 Lazo … din mai–iulie» trebuie verificat. Lazo are acum zile din septembrie prin 710CWN (`tureZiE.sept = 2`); sursa
   etalonului 16,2 se citește din card.
6. **§8.4 / §8.6:** cifrele «744ARF 4 din 19», «804MUM 2 din 10» sunt vechi. 744ARF are acum 5 din 5 pe 14.09.

## Constatări cu deducere

**M-a (medium, −1): documentul nu spune efectul asupra dispecerului, iar textul §4.2 contrazice alegerea.**
- Pe 14.09, 710CWN devine nr. 1 în indicații (R1b 105,8 → 462,3; B ×6), dintr-o schimbare de linie.
- În schelet, alegerea R13 Lazo vine din scor (acoperirea R13 = 1,0), nu dintr-o regulă pe urcări. Aici dă rezultatul corect, dar
  §4.2 («începe la ≤ 2,5 km = capăt atins») o contrazice.
- Scenariul: v4.2 activat, rândul 21.09 scris luni. Pagina și indicațiile (după «da»-ul lui Ion) îi cer dispecerului o schimbare pentru
  710CWN, dar regulile nu explică de ce mașina nu mai e pe Dominteni.
- Corectura:
  - migrația pe §4.2 de la punctul (3);
  - rândul «710CWN: Lazo, nu Dominteni; acasă în Petreni, 18 km dincolo de capăt» în raportul pentru Ion, înainte de `?indicatii=1`.

**L-b (low, −0,5): două reguli de tranzit, una în schelet și alta în săptămânal.**
- Ce diferă:

  | | `ideal-v4.2/etalon.mjs:104-111` | `economie/etichete.mjs:67-73` |
  |---|---|---|
  | durata opririi | nu cere (`sl` lipsește) | 20 ≤ `sl` ≤ 900 s |
  | opririle de la ≤ 0,5 km de capetele cursei | se scot | nu se scot |
  | oprirea la capătul liniei | orice durată | `sl` ≥ 60 s |

- Pe 14.09, cu regula săptămânală singură (`ETICHETE_F2=1`), 3 picioare noi ies altfel decât în `obs-ideal` v4.2: 710CWN (1, Dominteni),
  388ASB (1, Suri), 024XKY (1, Suri). Celelalte 51 sunt diferențele cunoscute din ION-107.
- Din săptămâna 28.09 (în afara ferestrei idealului), etichetele vin din regula săptămânală.
- Corectura: aceeași definiție în ambele locuri, sau cel puțin excluderea capetelor cursei în `etichete.mjs`.

**L-c (low, −0,5): §4.2, «cel mai depărtat start atins», e încălcat la 024XKY pe 16.09.**
- Returul fără schimb 06:16–08:49 are opriri în Pelinia (27,8 km) și în Șuri (55,5 km). v4.2 îl pune pe R12 Pelinia.
- E în afara ferestrei, deci fără efect pe km azi. Arată însă că alegerea după scor nu respectă întotdeauna §4.2.

## Scor

10 − (1 + 0,5 + 0,5) = **8,0 / 10**

**v4.2 e corect pe business:**
- 744ARF intră în măsurare cu R1a și R1b plauzibile;
- 804MUM e reparat;
- Dominteni 1 și Țiplești 2 = actul;
- −83 km/zi scot o dublare reală.

**Condiții de activare:**
- migrația pe §1.4, §4.2 și §6.5;
- rândul despre 710CWN în raportul pentru Ion, înaintea indicațiilor.

L-b se poate face în aceeași livrare.
