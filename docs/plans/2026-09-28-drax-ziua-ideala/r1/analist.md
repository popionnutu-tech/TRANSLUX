# ION-123 r1 — uzina-analist: «ziua ideală» Drăxlmaier măsurată pe toată flota, săpt. 14–20.09.2026

Sursă: VPS `/root/lde-worker/drax/date/saptamanal/2026-09-14/` (`economie-zile.json` rulat 2026-09-28 08:13 UTC, `analiza.json` cu
`reguli4` ION-120 rulat 08:14 UTC). 38 de mașini, 195 zile-mașină (189 L–V + 6 sâmbete). Valhalla prin `kmDrum` din
`drax/cod/economie/comun.mjs`, pe COPIA cache-ului (`ECON_D=/tmp/zi-ideal`). Nimic scris în bază, codul VPS neatins.
Fișiere: `ziua-ideala.mjs` (147 variante: grila Q1×Q2×noapte×weekend×Bălți×zile + 3 extra), `ziua-ideala.json`,
`rezumat.mjs`, `rezumat2.mjs`, `detalii.mjs` (citesc JSON-ul local).

## Metoda (ce am măsurat exact)
- Ziua 03:00→03:00 tăiată în intervale (seg-urile cu același t0–t1). Cursa = seg `cuOameni`; muncă = `intreUzine` + `deplasare` +
  `service` (intră în ideal ca atare); gol = `livrare`, `golRuta`, `golTure`, `legatura`, `parc`, `necunoscut`.
- Între două curse: legătura L = drumul de la `pana` cursei precedente la `de` cursei următoare (Q2: Valhalla sau etalonul liniei
  pe tronsonul uzină ↔ capăt, capăt ≤ 2,5 km, uzina = poarta + 1 km sau parcul ≤ 1 km).
- Noaptea: seara zilei d + dimineața zilei d' se compară cu f(E_d, S_d'): capăt = L(E, S); uzină = min pe porți L(E,U)+L(U,S);
  min = min(capăt, uzină). Idealul nopții se împarte pe cele două jumătăți proporțional cu km reali. Weekendul = perechea
  ultima zi → prima zi a săptămânii (circular: vinerea 18.09 cu lunea 14.09) sau orice pauză > 1 zi.
- Cauze (fiecare km într-una): `noapte` / `noapteWeekend` / `noapteBalti`; `acasa` = `livrare` cu `ocol` între curse (= regula 3);
  `laUzina` = parc + tot golul intervalului când L = 0 sau ambele capete la uzină; `drumLung` = restul − L; `golTure`;
  `cursaVsEtalon` = GPS − etalon (doar Q1 etalon). Σ cauze = economie pe fiecare zi (verificat, 0 abateri în toate variantele).

## Cifrele pe variante (flota, săpt. 38, km măsurați, fără extrapolare)
| varianta | zile | ideal | economie | /zi-mașină | probe picate |
|---|---|---|---|---|---|
| propunerea sesiunii: GPS / Valhalla / capăt / weekend inclus / Bălți ca orice / toate | 195 | 42.695 | **10.916** | 56,0 | econ<0: 3 zile |
| Q1 etalon (curse = etalon) | 195 | 43.143 | 10.469 | 53,7 | econ>gol 7, ideal<cuOameni 2, econ<0 7 |
| Q2 etalon (legături = etalon) | 195 | 44.497 | 9.115 | 46,7 | 24 legături > drumul real, drumLung<0 pe 50 zile |
| Q1+Q2 etalon («15–17 × 6» al lui Ion) | 195 | 44.944 | 8.667 | 44,4 | econ>gol 6, econ<0 14 (224BZP −124/zi) |
| noaptea la uzină | 195 | 54.261 | **−650** | −3,3 | econ<0 pe 104 zile |
| noaptea «min» | 195 | 42.695 | 10.916 | 56,0 | identică cu «capăt» (0,0 km diferență) |
| weekend separat | 195 | 42.176 | 10.072 (+845 separat) | 51,7 | — |
| Bălți = noaptea prin uzină | 195 | 43.553 | 10.058 | 51,6 | — |
| Bălți separat | 195 | 42.285 | 9.868 (+1.048 separat) | 50,6 | — |
| fără zilele excluse (30 «jumătate / cursă nedetectată») | 165 | 36.599 | 9.111 | 55,2 | — |
| **propunerea mea**: GPS / Valhalla + toleranță 5 % + 1 km / min / weekend separat / Bălți prin uzină / fără excluse și «de lămurit» | 162 | 37.107 | **7.105** (+336 weekend separat) | 43,9 | econ<0: 2 zile 224BZP (−4,6; −7,2) |

Desfacerea propunerii mele (7.105): noapte 1.308 · Bălți (ocolul peste uzină) 76 · acasă între curse 2.793 · la uzină 844 ·
drum mai lung decât direct 1.377 · gol între ture 706. Toleranța GPS scoate 568 km din «drum mai lung» (în bază 649 din 2.258).
Cele 3 reguli (`reguli4.flota`): R1 propus 528 (toate mașinile 790) + R4 ocol 2.713 = 3.241 propus / 3.689 măsurat; Bălți 474 separat.
Deci ziua ideală ≈ 2,2 × cele 3 reguli; km noi față de ele: la uzină 844, drum mai lung 1.377, gol între ture 706, nopțile cu
seara în A și dimineața în B (A ≠ B) și mașinile sub prag (+518…780); acasă ≈ R4 (2.793 față de 2.713).
26 de mașini din 35 măsurate trec de 100 km/săpt. (la cele 3 reguli: 11 peste prag în `indicatii`).

## Exemplele din document
- **710CWN** (R13 Lazo, 5 zile L–V): propunerea sesiunii 133,7/zi (141,8 · 138,0 · 131,0 · 130,4 · 127,2) — confirmă «≈ 132»
  și intervalul lui Ion 130–140. Etalon/etalon 125,6; noaptea la uzină («16 × 8») 103,8, etalon + uzină 93,2. Cauze pe
  săptămână: acasă 348,6 (= R4 exact), noapte 148,8 (= R1 exact) + weekend 36,8, drum mai lung 91,2, la uzină 43,1.
- **925FTI** (R26 + R37): 94,8/zi pe L–V (84,9 · 97,0 · 102,0 · 98,9 · 91,4), nu 104; plus sâmbăta 19.09 cu 111,8 km gol
  între tur 13:30 și retur 00:16 (R23 Scumpia, acasă și înapoi). Diferența față de 104 stă în legături: dimineața reală 06:20–13:25 = ocol 28,9 + legătură 48,9 + între porți 3,7,
  iar legătura directă e deja aproape de Valhalla («5,2 km peste cel mai scurt»); noaptea reală 47,2 (25,3 + 21,9). Cu noaptea la uzină 925FTI iese −177 km la noapte (ideal > real): mașina doarme deja pe linie.

## Contraexemple (formula dă ceva ciudat)
1. **Cursă de prânz — 386PKP**: nicio bucată `pranz` în săptămână, cursa de prânz nu e detectată; toate 5 zile «jumătate
   probabil nedetectată». Cu toate zilele: 477 km/săpt. «economie», 420 dintre ele «noapte» — km cu oameni luați ca gol.
2. **Zi de lămurit — 024XKY**: drumurile la Drochia (Autogara) 99–195 km (`deLamurit`, posibilă cursă a firmei) ies «noapte»
   389 km/săpt.; doar 16.09 era exclusă ca «jumătate». Trebuie scoase și zilele `deLamurit` (le-am scos în propunerea mea).
3. **Legătură imposibilă / zi exclusă — 414ASB 15.09**: turul lipsește (golImpus 66,5 km virtual în `total` 155,3, drum real 88,7);
   idealul nopții Ciuciulea → uzină depășește dimineața reală → economie −24,9. Pe 7 zile `total` din analiză ≠ Σ seg (golImpus).
4. **Etalonul peste GPS — 146BRAZ 16.09 / 18.09** (Q1 etalon): economie 148,7 > gol 135,7, ideal 251,8 < cu oameni 254,2 —
   cursa reală Trifănești e mai lungă decât etalonul și diferența devine «economie». Cu Q2 etalon 224BZP −124 km/zi.
5. **Gol între ture care poate fi cursă — 293QVT**: 63–77 km/zi între tur s2 și retur s2 (fără oprire ≥ 20 min, «nelămurit» în F2,
   întrebarea deschisă «293QVT 15:56»); iese 325 km/săpt. față de 0 la cele 3 reguli.
6. **Cauza greșită, suma bună — 763LYY 18.09**: 224 min la parc pe drumul uzină → Coșernița: «la uzină» +16,3 și «drum mai lung» −18,1.

## Propunerea pe 1–7
1. **GPS real** pentru curse; diferența GPS − etalon (−448 km/săpt. pe flotă, 252 curse de pe linii «*» fără etalon) = steag
   separat «cursa ≠ etalon», niciodată economie (altfel pică probele 7 și ideal ≥ cu oameni).
2. **Valhalla direct + toleranță 5 % + 1 km** (se adaugă la ideal). Etalonul liniei pe legături NU: e drumul prin sate, nu drumul
   gol (24 legături > drumul real, 50 zile cu «drum mai lung» negativ). ÎNTREBARE pentru Ion: regula «km reali, nu geometrie»
   (26.09) se aplică și legăturilor goale? Alternativa fără geometrie: mediana GPS a drumurilor directe observate pe aceeași pereche.
3. Noaptea: «min» = «capăt» (triunghiul; uzina dominată: −650, 104 zile negative) — o singură variantă, capătul ultimei sau al
   primei curse. **Weekendul separat** (336 km în propunerea mea; perechea circulară vineri → luni e o presupunere). **Bălți =
   noaptea prin uzină** (76 km ocol), diferența până la capăt (≈ 860) ca rând «dacă ar dormi la capăt», în afara totalului, cum a
   hotărât Ion. Naveta șoferului nu se numără (LEAR §5.5), dar se arată ca la R1 (`soferKm`).
4. Între uzine în ideal ca muncă (§5.11; 1.834 km/săpt.); deplasare/service în ideal ca atare (145 km). Afară din economie, listate:
   zilele cu cursă/jumătate nedetectată (30, §8.6), zilele `deLamurit` (3), mașina cu cursă de prânz nedetectată (386PKP) și
   golul între ture fără oprire (293QVT) ca steag «posibil cursă».
5. Cauzele de mai sus sunt disjuncte prin construcție; regula 1 → «noapte», regula 3 → «acasă între curse» (710CWN le reproduce
   exact: 148,8 / 348,6); «rute împărțite altfel» rămâne separată (schimbă cursele, nu legăturile).
6. Cifra principală: km/săpt. pe mașină (măsurat) + pe flotă extrapolat ca la B (factor zile L–V / eșantion, azi 1,19 → ≈ 8.450);
   /zi doar ca a doua cifră. Pragul 100 km/săpt. rămâne (26 mașini îl trec).
7. Probele pe toată flota: economie ≤ gol (0 abateri în variantele GPS), Σ cauze = economie (0), ideal ≥ cu oameni (0 cu GPS);
   de adăugat: economie < −5 km pe zi = steag (224BZP, Valhalla > GPS), și bilanțul pe Σ seg, nu pe `total` (golImpus pe 7 zile).

## Scor: 10 − Σ = 6,5
−1 cursa de prânz nu se poate măsura până nu e detectată (386PKP); −1 «drum mai lung» (1.377) amestecă ocoluri nedetectate și
poate muncă (146BRAZ R32, 725CWN R19 → R33 +34 km), nevalidat pe hartă; −0,5 weekendul circular pe o singură săptămână;
−0,5 Valhalla contra regulii «km reali» (întrebare deschisă); −0,5 293QVT golTure posibil cursă.
