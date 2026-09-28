# ION-123 r3 — uzina-analist: «ziua ideală» Drăxlmaier după runda-3.md (Codex r2: C4, C5)

Sursă: VPS `/root/lde-worker/drax/date/saptamanal/2026-09-14/` (`economie-zile.json`, `economie.json`, `analiza.json` cu `reguli4`),
urma GPS brută `economie-urme/` DOAR a săptămânii (fără `_ciorna/`; alt dosar validat în cele 4 săptămâni dinainte nu există).
Valhalla prin `kmDrum` din `comun.mjs` pe COPIA cache-ului (`ECON_D=/tmp/ion123r3`). Nimic scris în bază, codul VPS neatins.
Fișiere: `ziua-ideala-v3.mjs` (din `r2/ziua-ideala-v2.mjs`), `run.sh`, `ziua-ideala-v3.json`, `stdout-v3.json`, `rezumat-v3.mjs`
(comparația cu `r2/ziua-ideala-v2-fara-ciorna.json`), `proba-alias-880.sh` + `cmp-alias.mjs` (proba aliasului 880RNK).

## Ce s-a schimbat față de r2
- **C4.** `ALIAS_M` se citește din `categorii.mjs:32` (identic în `alternative.mjs:20`, `control.mjs:21`, `etichete.mjs:22`; scriptul
  se oprește dacă diferă de `{0357544371228442→880RNK, 350KAJ#2284→350KAJ}`). Urma se citește după dispozitiv, se grupează pe
  MAȘINĂ (pe zi, dispozitivul cu cele mai multe puncte, ca `puncte()` din categorii.mjs; 0 dubluri în săptămână), apoi cursele cu
  oameni și casa se caută după mașină. Probă nouă: fiecare observație folosită e confruntată cu cursele mașinii ei → **0 suprapuneri
  din 23.193 observații**.
- **C5.** Cauzele: `noapte`, `acasa` = ocol + drumul mai lung în intervalele cu ocol (doar rest ≥ 0), `drumLung` (fără ocol),
  `drumMaiScurt` (toate reziduurile < 0). Componentele lui `acasa` sunt raportate separat (`componenteAcasa`), fără a fi adunate din nou.
  Probă nouă pe fiecare zi: `acasa = acasaOcol + acasaDrumLung` (0 abateri) și `Σ cauze = GPS − ideal − separat` (0 abateri).

## Probele aliasurilor
| dispozitiv | în săpt. 14.09 | curse găsite după dispozitiv (v2) / după mașină (v3) | casa v2 / v3 | puncte care scăpau în v2: în curse / la casă |
|---|---|---|---|---|
| 350KAJ#2284 → 350KAJ | da (6.251 puncte) | 0 / 20 | nu / da | 3.620 / 310 |
| 0357544371228442 → 880RNK | NU (săptămâna are dosarul `880RNK`; dispozitivul există doar în `date/economie-urme/`, 29 zile, «dublura 880RNK») | proba: dosarul lui 880RNK redenumit după dispozitiv în /tmp → 0 / 20 | nu / da | 7.083 / 677 |

Proba 880RNK: flota și rândul 880RNK **identice** cu rularea principală, 0 observații în curse. Efectul real (350KAJ): 17 perechi
Bălți ↔ Ciuciulea-Glodeni (47,78 / 27,94 ↔ 47,88 / 28,31) își schimbă legătura — în r2 cursele cu oameni ale lui 350KAJ intrau ca
«drum direct» (39,9 km, n 42 → 33,7 km, n 5; 3 perechi trec pe Valhalla). 350KAJ: 2,4 → 11,3 km/zi.

## Cifrele (flota, săpt. 14–20.09, 151 zile L–V, fără ciornă)
| | v2 fără ciornă | **v3** |
|---|---|---|
| GPS / ideal | 42.386,8 / 36.325,2 | 42.386,8 / 36.245,3 (obligatorii 25.011,2) |
| **economie măsurată → extrapolat (× 1,1887)** | 4.978,6 → 5.918 | **5.058,5 → 6.013** |
| noapte | 1.162,5 | 1.162,5 |
| acasă între curse (unită) | — | **3.881,6** = ocol 2.713,1 + drum mai lung cu ocol 1.168,5 |
| drum mai lung fără ocol | 226,6 | 249,1 |
| drum mai scurt decât idealul (steag) | −245,7 | −234,7 |
| Σ cauze | 4.978,6 (5 cauze, fără unire) | 1.162,5 + 3.881,6 + 249,1 − 234,7 = **5.058,5** = GPS − ideal − separat |
| separat: weekend | 449,7 (−19,1) | 449,7 (+ −19,1 mai scurt) |
| separat: Bălți | 652,4 | 652,4 |
| separat: 293QVT (5 zile) | | 29,3 (386PKP 0 zile) |

Legături: 305 perechi, 167 pe mediana GPS (mediana 14 observații / pereche), 138 Valhalla × 1,05 (steag).

## Mașinile cerute
- **710CWN** 109,1/zi, 545,7/săpt.: noapte 148,8 (= R1), acasă 396,9 (ocol 348,6 = regula 3 + 48,3); weekend separat 36,8.
- **925FTI** 90,1/zi, 450,3/săpt.: noapte 98,7, acasă 362,2 (ocol 350,5 + 11,7), mai scurt −10,6; weekend 4,8.
  Proba C1 14.09 14:32–15:52: între uzine VEST → EST 7,1 km, neobligatorii 0, legătura 0, **economie 0**.
- **880RNK** 10,2/zi, 50,8/săpt. (neschimbat; alias inactiv în săptămână): noapte 6,4, acasă 35,6, drum lung 8,8.
- **350KAJ** 11,3/zi, 56,7/săpt. (v2: 2,4 / 12,1): noapte 7,4, acasă 30,3, drum lung 19,2, mai scurt −0,2.

## Probele (toată flota)
bilanț GPS − ideal = eligibil + separat: 0 / 195 zile · Σ cauze = economie (după unire): 0 abateri · acasă = componente: 0 ·
economie ≤ gol: 0 · ideal ≥ obligatorii: 0 · cauză pozitivă < 0: 0 · intervale doar-obligatorii cu contribuție ≠ 0: 0 din 188 ·
observații în curse: 0 · **R1**: 37 nopți, 789,6 = 789,6, 0 abateri · **R3**: ocolul 2.713,1 = regula 3 2.713,1 (0,0) ·
zile < −5: 2 — 763LYY 18.09 (−27,5) și 388ASB 15.09 (−10,8; r2 −8,1), ambele «parc + între uzine» cu km F2 umflați (steag,
repararea în categorii.mjs = tichet separat, poziția 3 din r2).

## Peste 100 km/săpt. (§12.2) — 22 (aceleași ca în r2)
710CWN 545,7 · 518MHD 544,4 · 925FTI 450,3 · 912RNK 325,7 · 446ASB 316,7 · 457BRAX 308,2 · 345KAJ 307,5 · 713IZX 264,9 ·
302YEK 223,4 · 725CWN 194,5 · 146BRAZ 190,5 · 830MUM 182,3 · 447ASB 180,2 · 388ASB 177,5 · 804MUM 155,3 · 744ARF 139,0 ·
346KAJ 133,6 · 760BXI 112,6 · 402VKV 107,4 · 041BRAU 104,5 · 186OMM 103,2 · 206BZP 102,9. Σ §12.2 fără lista separată 5.639,0.
350KAJ (56,7) și 880RNK (50,8) rămân sub prag.
