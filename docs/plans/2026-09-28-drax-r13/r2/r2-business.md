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
