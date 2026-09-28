# ION-120 r3: uzina-analist, cele 4 reguli după runda-3.md (Ion 1–5, Codex r2 C5–C8)

**Surse.** Rândul săptămânii 14–20.09 de după ION-119, pe VPS în `/root/lde-worker/drax/date/saptamanal/2026-09-14/`. Fișierele au aceleași md5 ca în r2:
- `economie-zile.json` b89bd379;
- `economie.json` 3988213e;
- `analiza.json`.

Scheletul e `ideal-activ → ideal-v4.3`. Textul regulilor e `lde_uzine` DRAXELMAIER_BALTI, `reguli_livrare_la` 2026-09-27 18:22:08 UTC, md5 15baca36. §12.2 spune: «100 km pe săptămână pe mașină … extrapolat pe zilele mașinii (km pe zi măsurați × zilele ei luni–vineri cu curse …), doar la mașinile cu cel puțin 3 zile măsurate».

Valhalla s-a folosit prin `kmDrum`, pe o copie a cache-ului (`ECON_D=/tmp/ion120r3/d`), cu 0 răspunsuri null. Nimic nu s-a scris în bază și codul de pe VPS n-a fost atins.

Fișierele rundei:
- scriptul: `r3/patru-reguli-v3.mjs` (md5 41520702), rulează în 28 s;
- rularea: `r3/ruleaza.sh`;
- rezultatul: `r3/patru-reguli-v3-2026-09-14.json` (md5 9e83e9b7) și rezumatul `r3/out.txt`.

Extrapolarea pe flotă se face × 189/159 = 1,1887.

## Pe flotă (km pe săptămână, fiecare regulă separat)

| regula | măsurat (eșantion) | extrapolat | ce s-a schimbat față de r2 |
|---|---|---|---|
| R-1 **propus** (4 mașini ≥ 100 km/săpt. §12.2, 15 nopți) | **528,0** | **628** | Ion 2: pragul pe mașină |
| R-1 măsurat, toate mașinile (37 de nopți) | 789,6 | 939 | la fel ca în r2; 7 mașini sub prag, cu 261,6 km |
| R-2 (fără plafon) | **186,4** | **222** | Ion 3: în r2 era 0 după plafon |
| R-4 | **2.713,1** | **3.225** | neschimbat (= R1b din economie.json) |
| **R-1 propus + R-2 + R-4** | **3.427,5** | **4.075** | pe toate mașinile R-1 ar fi 3.689,1 / 4.386 |
| R-3 candidați condiționați | **0** | — | C5 + C6: în r2 erau 2 schimburi, +138,6 |
| Bălți, separat §7.4 (C8) | 473,5 | ≈ 563 | pe toate zilele 591,7, doar diagnostic |

**Proba.**
- Pe mașină, 38 din 38 trec condiția R-1 (măsurat) + R-2 + R-4 ≤ livrare + golTure + golRuta + legătură.
- Pe bucăți, 248 de bucăți au fiecare un singur proprietar: R-1 propus 29, R-2 5, R-4 214, R-3 0. Scriptul se oprește la dublă numărare, și nu s-a oprit.
- Marginile candidaților R-3 intră în aceeași verificare. Suprapunerea R-3 cu R-1 sub prag e 0.

## R-1

**Propunerile pe mașină** (km pe săptămână după §12.2; la șofer e distanța de la locul nopții la X, iar naveta nu se numără, §5.10):

| mașina | X | nopți | eșantion | zile măsurate / L–V | pe săpt. §12.2 | șoferul |
|---|---|---|---|---|---|---|
| 518MHD | Florești | 4 | 155,2 | 4 / 5 | **194,0** | 15,6 km |
| 710CWN | Lazo | 4 | 148,8 | 5 / 5 | **148,8** | 6,3 km |
| 346KAJ | Dondușeni | 3 | 115,7 | 5 / 5 | **115,7** | 4,9–5,0 km |
| 713IZX | Prajila | 4 | 108,3 | 5 / 5 | **108,3** | 8,3 km |

**Sub prag, fără propunere:**
- 402VKV Cobani: 98,3 (șoferul la 9,5 km);
- 041BRAU: 59,5;
- 763LYY: 38,4 (19,2 km);
- 146BRAZ: 37,7;
- 715IZX: 37,2;
- 446ASB: 22,0;
- 386PKP are 0 zile măsurate, sub pragul de 3 din §12.2. Pe toate zilele ar avea 328,3 km, cu șoferul la 26,7 km.

**Bălți** rămâne separat, pe eșantion:

| mașina | X | nopți | eșantion | toate zilele |
|---|---|---|---|---|
| 144BRAZ | Glinjeni | 3 | 117,1 | 175,9 |
| 435ASB | Tăura Veche | 3 | 187,3 | 222,5 |
| 804MUM | Țiplești | 4 | 169,1 | 193,3 |

Stările celor 157 de nopți nu s-au schimbat față de r2: 48 eligibile, 26 deja la X, 75 cu turul din altă localitate și celelalte. Tot ca în r2 rămân separat weekendul (1 noapte, 9,4 km) și cele 65 de jumătăți nemăsurabile (990 km).

## R-2 (Ion 3: toți km-ii din afara zonei între tur și retur, fără plafon)

Sunt 26 de bucăți golTure, toate în eșantion. Au 589,0 km de gol, din care **186,4** în afara zonei. Niciuna nu are o oprire ≥ 20 min.

| mașina | km/săpt. | ce face |
|---|---|---|
| 293QVT | **159,8** | R31 Cotiujenii Mari, 14–17.09 (4 × 40 km), între 14:45 și 00:20 |
| 146BRAZ | 26,6 | R32 Trifănești, 17.09, 06:18–15:53 |

## R-4

Neschimbat: 214 bucăți și 2.713,1 km, din care 1.221,2 la capăt și 1.491,9 la uzină.

## R-3 (C5, C6, C7 și criteriul lui Ion)

**Cum s-a calculat.**
- **Costul de azi** e rezidualul GPS al marginilor (livrare fără ocol, **fără golul impus**) după R-1 propus.
- **Costul după schimb** e Valhalla (casa noii mașini → capete), numai pe marginile rămase.
- Fiecare jumătate de noapte are o stare comună, care rămâne aceeași după schimb:
  - R-1 acoperită: cost 0 pentru orice mașină;
  - deja la X, Bălți, weekend, R-1 sub prag, neeligibilă: se plătesc, Bălți nu e gratuit.

**Ce intră.**
- 17 din 38 de mașini au zile în afara eșantionului (§8.6 sau de lămurit): 024XKY, 041BRAU, 144BRAZ, 224BZP, 345KAJ, 386PKP, 414ASB, 435ASB, 441ASB, 518MHD, 549RNK, 725CWN, 727CWN, 763LYY, 804MUM, 830MUM, 912RNK. Ele sunt doar diagnostic, iar asta scoate 493 din 703 perechi.
- Rămân 21 de mașini și 210 perechi. Capacitatea observată respinge 12, iar 198 se calculează. Toate ar fi oricum «capacitate de confirmat», pentru că `passenger_seats` e NULL.

**Rezidualul GPS.**

| | km |
|---|---|
| flota, total | 5.617,5 |
| cele 21 de mașini eligibile, GPS | 2.145,7 |
| aceleași, Valhalla pe programul propriu | 2.061,5 |
| diferența de reper | +84,3 (4 %) |

În r2 diferența de reper era 16 %, pentru că includea golul impus.

**Rezultatul: 0 perechi cu totalul flotei −50 km/săpt., deci 0 candidați.** Cele mai bune:

| schimbul | net GPS | câștigul fiecăreia | net Valhalla (diagnostic) |
|---|---|---|---|
| 186OMM ↔ 744ARF | **+43,7** | +96,2 / −52,4 | +2,2 |
| 402VKV ↔ 457BRAX | +2,4 | | |
| 710CWN ↔ 826GXP | +0,5 | | |

La 186OMM ↔ 744ARF aproape tot câștigul vine din diferența de reper.

**Cele două schimburi din r2 cad:**
- 386PKP ↔ 549RNK: ambele mașini au zile excluse (C6);
- 446ASB ↔ 925FTI: dă −58,4 pe GPS și −71,8 pe Valhalla. Nopțile «deja la X» nu mai sunt gratuite, iar noaptea 446ASB e sub prag.

**Diagnosticul pe mașinile excluse.** 14 perechi trec de 50. Le conduce 024XKY (+330 față de 710CWN), dar Valhalla–Valhalla dă doar +23 și 4 din cele 5 zile sunt excluse. E rezidualul umflat al zilei suspecte, nu o economie.

## Întrebări pentru Ion (cu cifrele)
1. **402VKV (Cobani) are 98,3 km/săpt. la R-1**, cu 5 zile măsurate din 5 și șoferul la 9,5 km. E sub prag cu 1,7 km. Pragul se aplică strict, sau se judecă pe mai multe săptămâni (mediana pe 4)?
2. **518MHD la Florești are 194 km/săpt., dar șoferul stă la 15,6 km de X.** Celelalte trei propuneri au șoferul la 5–8 km. Se propune așa, cu distanța scrisă lângă (naveta nu se numără, §5.10)?
3. **R-2, pragul pe mașină:** 293QVT are 159,8 km/săpt. (R31, pleacă de la uzină între tur și retur, fără oprire), iar 146BRAZ are 26,6. §12.2 (100 km/mașină) se aplică și la R-2? Dacă da, se propune doar 293QVT.
4. **R-3 iese 0 pe 14.09.** Cel mai bun schimb e 186OMM ↔ 744ARF, cu +43,7 pe GPS și +2,2 pe Valhalla. 17 mașini sunt excluse de §8.6, adică 493 din 703 perechi. R-3 rămâne în lanțul de luni ca măsurare săptămânală care de obicei spune «niciun schimb», sau se măsoară doar pe 4 săptămâni, pe mașinile cu toate zilele măsurate? Locurile pe tip sunt încă de la Ion.

## Scorul de claritate: 10 − Σ = 8,5
- −0,5: 402VKV e la 1,7 km sub prag, iar decizia depinde de citirea pragului (o săptămână sau mai multe).
- −0,5: R-3 depinde de 17 mașini excluse, iar capacitatea nu e confirmată.
- −0,5: cele 65 de jumătăți de weekend (990 km) rămân nemăsurabile într-o fereastră de o săptămână, ca în r2.
