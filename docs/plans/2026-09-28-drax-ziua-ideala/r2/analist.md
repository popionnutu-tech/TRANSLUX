# ION-123 r2 — uzina-analist: «ziua ideală» Drăxlmaier după runda-2.md (Q2, Q3, Q5, C1–C3)

Sursă: VPS `/root/lde-worker/drax/date/saptamanal/2026-09-14/` (`economie-zile.json`, `economie.json`, `analiza.json` cu
`reguli4` ION-120), urma GPS brută `economie-urme/` a săptămânii + a dosarului `_ciorna/2026-09-07-ion107` (singurul din cele 4
săptămâni dinainte; alt dosar nu există). Valhalla prin `kmDrum` din `comun.mjs`, pe COPIA cache-ului (`ECON_D=/tmp/ion123r2`).
Nimic scris în bază, codul VPS neatins. Fișiere: `ziua-ideala-v2.mjs` (scriptul), `run.sh` (rulare), `ziua-ideala-v2.json`
(varianta principală), `ziua-ideala-v2-fara-ciorna.json` (observații doar din săptămână), `rezumat-v2.mjs`, `compara-v2.mjs`.

## Cum am aplicat runda-2.md
- **C1 — deplasările obligatorii ordonate.** Obligatorii: cursele cu oameni; între uzine (§5.11) ancorate pe porțile din
  `porti` / motiv («EST → VEST, VEST → EST» = din EST, la VEST... ultima); service; deplasare; golTure (intervalul tur → retur
  întreg); «lângă uzină» = parcul oriunde + golul fără ocol al intervalului cu ambele capete la uzină (poarta + 1 km / parc ≤ 1 km).
  Toate la km GPS ca atare. Legătura ideală: capătul cursei → poarta de plecare a cursei între uzine, poarta de sosire →
  începutul cursei următoare (fără între uzine: direct; cu parc fără între uzine: prin poarta/parcul cel mai ieftin). Sub 1,5 km =
  0. **Intervalul fără km neobligatorii nu primește legătură** (188 de intervale; 1 singur avea ancore nepotrivite).
- **C2 — eșantionul.** Aceeași funcție ca `patru-reguli.mjs:41-46` (L–V din economie.json, fără `exclus` §8.6, fără
  `deLamurit` pe «livrare»): 156 zile, din care 151 în total și 5 ale 293QVT pe lista separată (386PKP are 0 zile în eșantion).
  Afară: 30 §8.6, 3 de lămurit (024XKY), 6 sâmbete. Nopțile: jumătatea intră doar cu ziua ei; weekend = noaptea care atinge
  sâmbăta/duminica + vineri → luni (în fereastră: perechea circulară vinerea 18 ↔ lunea 14, steag), Bălți = locul nopții ≤ 3 km de
  uzină/parc (§7.4), pauză > 1 zi — toate SEPARAT. Nopți: 130 normale, 44 weekend, 21 Bălți, 0 pauze. Factorul B = 189 / 159 = 1,1887.
- **C3 — ecuațiile.** `GPS_zi = Σ s.km` (fără golImpus; 7 zile au `total` ≠ Σ bucăți din cauza golului impus). `IDEAL_zi =
  obligatorii + legături + noaptea ideală`. `GPS − IDEAL = economie eligibilă + weekend + Bălți + pauză` — verificat pe toate
  195 de zile (0 abateri). Cauze pe bucată: noapte, acasă (ocolul), drum mai lung în intervalele cu ocol, drum mai lung fără ocol
  (toate ≥ 0), drum mai scurt decât idealul (≤ 0, nescăzut din nimic, steag).
- **Q2 — legăturile.** Urma GPS tăiată în drumuri directe: fără oprire ≥ 20 min (250 m / tăcerea trackerului ≥ 20 min), fără
  punctele din cursele cu oameni, fără punctele la ≤ 0,4 km de casa mașinii. Observația a → b: cel mai apropiat punct de a
  (≤ 1,5 km) → primul punct cel mai apropiat de b (≤ 1,5 km), km pe urmă + cele două capete în linie dreaptă; ambele sensuri, orice
  mașină; mediana cu ≥ 3 observații, altfel Valhalla × 1,05 cu steag.

## Cifrele (flota, săpt. 14–20.09, varianta principală)
| | km |
|---|---|
| GPS (151 zile) | 42.386,8 |
| ideal | 36.305,9 (obligatorii 25.011,2) |
| **economie măsurată** | **4.998,7** → **extrapolat 5.942** (× 1,1887) |
| noapte | 1.157,4 |
| acasă între curse (ocolul) | 2.713,1 |
| drum mai lung, în intervalele cu ocol | 1.138,3 |
| drum mai lung, fără ocol | 229,9 |
| drum mai scurt decât idealul (steag, 57 intervale + 21 jumătăți) | −239,9 |
| separat: weekend | 447,9 (+ −18,3 mai scurt) |
| separat: Bălți | 652,6 (toate nopțile în Bălți; `reguli4.balti` = 473,5 doar pe nopțile eligibile R1) |
| separat: 293QVT (5 zile; 386PKP 0 zile) | 29,3 |

Fără dosarul-ciornă (observații doar din săptămână): 4.978,6 / 5.918; perechi GPS 170 în loc de 181. Diferența e mică.
Față de r1 (7.105 propunerea mea, 10.916 baza): au ieșit golul tur → retur (706) și «lângă uzină» (844) în ideal, weekendul și
Bălți în afara totalului, între uzine nu mai are legătură dublă, legăturile pe GPS (mediana GPS / Valhalla pe perechile GPS:
p10 87 %, mediană 100 %, p90 118 %).

**Legăturile:** 305 perechi distincte — 181 pe mediana GPS (mediana 27 observații / pereche), 124 Valhalla × 1,05. Apeluri: 282
zero (≤ 1,5 km), 291 GPS, 176 Valhalla. În eșantion: intervalele între curse 151 GPS / 100 Valhalla / 5 mixte; nopțile normale
52 GPS / 49 Valhalla. Valhalla rămâne mai ales unde mașinile trec pe acasă (drumul direct nu e observat), ex. uzina → Lazo (710CWN).

## 710CWN și 925FTI
- **710CWN** (R13 Lazo): 109,1 km/zi (106,2 · 109,0 · 115,9 · 119,7 · 94,8), 545,7 km/săpt.: noapte 148,8 (= R1 exact),
  acasă 348,6 (= regula 3 exact), drum mai lung în intervalele cu ocol 48,3; separat weekend 36,8 (luni dimineața 19,1, vineri
  seara 17,7). Idealul zilei 112–129 (curse 64–80 + între uzine / lângă uzină 14:34–15:54 16,3 + legături uzina → Lazo 14,8 ×
  2 Valhalla). Față de «130–140» al lui Ion: lipsesc weekendul (≈ 7/zi) și cei 10,5 km «lângă uzină» 14:34–15:54 (Q5: în ideal).
- **925FTI** (R26 + R37): 90,1 km/zi (79,6 · 91,6 · 101,8 · 91,3 · 86,0), 450,3 km/săpt.: acasă 350,5 (= R4), noapte 98,7 (nicio
  noapte R1: seara la Năvîrneț, dimineața la Ilenuța; legătura nopții 24,3 Valhalla), drum mai lung 11,7, mai scurt −10,6.
  **Proba C1: 14.09 14:32–15:52** = între uzine VEST → EST 7,1 km, neobligatorii 0, legătura 0, contribuție **0** (r1: −4).

## Probele (toată flota)
- bilanț GPS − IDEAL = eligibil + separat: 0 abateri / 195 zile; Σ cauze = economie: da (1.157,4 + 2.713,1 + 1.138,3 + 229,9 −
  239,9 = 4.998,8); economie ≤ gol eligibil: 0 abateri; ideal ≥ obligatorii: 0; cauză pozitivă negativă: 0; munca (intervale doar
  cu obligatorii) ≠ 0: **0** din 188.
- zile cu economie < −5: **2** — 763LYY 18.09 (−27,6) și 388ASB 15.09 (−8,1), ambele din intervale «parc + legătură + între uzine».
- **763LYY 18.09 06:20–13:23**: 72,7 km = parc 16,3 + între uzine 10,5 (obligatorii, în ideal) + legătură 45,9; legătura ideală
  VEST → Coșernița 69,3 (Valhalla; GPS < 3 observații directe) → «drum mai scurt» −23,4, vizibil separat, nu compensat de parc.
  Cauza: F2 a împărțit km intervalului prea mult pe parc / între uzine (45,9 km e sub linia dreaptă VEST → Coșernița).
- **Identitatea R1** (37 nopți din `reguli4.masini[].R1.detaliu`, toate mașinile): livrarea de margine 789,6 = R1 789,6, ideal
  noapte 0, «noapte» 789,6 — exact. Restul de 367,8 «noapte» vine din nopțile pe care R1 nu le ia (seara ≠ dimineața, capăt ≠ loc).
- **Identitatea R3**: «acasă» 2.713,1 = regula 3 2.713,1 (0,0). Intervalele cu ocol: economie 3.718,5 = ocol 2.713,1 + drum mai
  lung pe aceleași bucăți 1.005,4 (net, cu cele negative). Pe 43 de intervale din 214 economia < ocol (drum mai scurt, 0,1–17 km).

## Mașinile peste 100 km/săpt. (§12.2: km/zi măsurat × zilele L–V, ≥ 3 zile) — 22
710CWN 545,7 · 518MHD 497,9 · 925FTI 450,3 · 912RNK 325,7 · 345KAJ 321,0 · 446ASB 316,9 · 457BRAX 308,2 · 713IZX 264,9 ·
302YEK 223,9 · 725CWN 197,0 · 388ASB 190,6 · 146BRAZ 190,4 · 830MUM 185,8 · 447ASB 176,2 · 804MUM 155,4 · 346KAJ 133,6 ·
744ARF 131,6 · 186OMM 113,4 · 760BXI 112,6 · 206BZP 109,9 · 402VKV 107,4 · 041BRAU 104,5. (Σ §12.2 fără lista separată 5.578,6.)

## Întrebări / steaguri pentru dezbatere
1. Dosarul `_ciorna/2026-09-07-ion107` e ciornă (ION-107): intră la observațiile GPS? (efect: 20 km măsurați.)
2. «Drum mai lung în intervalele cu ocol» 1.138 km: e partea directă a drumului prin casă peste legătura ideală — rămâne cauză
   separată de «acasă» sau se lipește de ea (atunci «acasă între curse» 3.718,5)?
3. Intervalele «parc + legătură + între uzine» dau «drum mai scurt» (763LYY, 725CWN, 912RNK, 760BXI): km-ii de parc / între uzine
   din F2 par supraevaluați; până la corectarea lor, cele 2 zile < −5 rămân steag.
4. Weekendul e măsurat pe perechea circulară vineri 18 ↔ luni 14 (fereastra are o singură săptămână).
