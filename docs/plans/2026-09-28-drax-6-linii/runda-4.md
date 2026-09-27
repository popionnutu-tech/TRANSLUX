# ION-112 — runda 4 (Codex r3 C2: reconcilierea Zarojeni pe ambele faze și pe toate mașinile)

Codex r3: 9,0 pass, 0 high; acord pe Nihoreni 44,2 × 2, Prajila 41,3 × 2, Bocancea 53,3 × 1, Sturzovca 23,9 × 2, Florești / Vărvăreuca /
Trifănești; H4: ies 348KAJ, 412BRAY, 727CWN; 763LYY → «atribuire greșită» (cu excepția 05.09). Singurul punct: C2 medium (Zarojeni km).

## Exportul cerut (export-r4-zarojeni.mjs, abatere-zarojeni.mjs în acest dosar; urma brută, noduri × 1,852, §4.5)
Toate picioarele din septembrie, ORICE etichetă (inclusiv 763LYY sub «R17 Prajila»), cu oprire validă la capătul Zarojeni:
| mașina | zi | sens | schimb | faza | grupa | eticheta | poarta | km oprire → poartă | + rază 0,6 |
|---|---|---|---|---|---|---|---|---|---|
| 763LYY | 07.09 | tur | s2 | A | EZ | R17 Prajila | EST | 27,8 | 28,4 |
| 763LYY | 08.09 | tur | s2 | A | EZ | R17 Prajila | EST | 27,8 | 28,4 |
| 763LYY | 10.09 | tur | s2 | A | EZ | R17 Prajila | EST | 27,9 | 28,5 |
| 763LYY | 11.09 | tur | s2 | A | EZ | R17 Prajila | EST | 28,1 | 28,7 |
| 348KAJ | 21, 22, 23, 25.09 | tur | s2 | A | EZ | R18 Zarojeni | EST | 27,8 / 27,7 / 27,6 / 27,7 | 28,2–28,4 |
| 348KAJ | 24.09 | tur | s2 | A | EZ | R18 Zarojeni | EST | 39,7 (trece pe la Alexăndreni) | 40,3 |
| 763LYY | 15.09 | tur | s1 | B | EZ | R17 Prajila | EST | 32,8 | 33,4 |
| 348KAJ | 17.09 | tur | s1 | B | EZ | R18 Zarojeni | EST | 33,9 | 34,5 |
| 763LYY | 18.09 | tur | s1 | B | EZ | R17 Prajila | EST | 34,9 | 35,5 |
| 763LYY | 07.09 | retur | s2 | A | EZ | R17 Prajila | EST | 21,5 | 22,1 |
Retur cu oprire la capăt: 1 din septembrie (07.09). Toate tururile intră pe EST.

## De unde vin cei +6 km ai fazei B (turul de dimineață, s1)
Comparat cu urma de seară (348KAJ 21–22.09), turul de dimineață are o abatere dus-întors de 3,0–4,3 km la 5–6 km de poarta EST, cu 1–5 opriri,
la 47,788 / 28,007 = **Elizaveta, municipiul Bălți** (OSM): 348KAJ 17.09 06:07–06:13 4,3 km; 763LYY 15.09 06:12–06:20 4,1 km; 763LYY 18.09 06:11–06:15 3,0 km.
Elizaveta nu e sat al rutei R18 în act; e oraș (Bălți), care după §4.1 / §5.1 nu face capăt și nu intră în linie. Fără abatere, faza B dă
28,7 / 29,6 / 31,9 km (mediana 29,6). 763LYY 15/18.09 mai are 12,3 km dimineața devreme (05:02–05:28, lângă 47,86 / 28,2), ÎNAINTEA opririi
în Zarojeni, deci în afara km-ilor oprire → poartă.

## Reconcilierea
- Populația eligibilă (12 tururi EZ cu oprire la capăt, ambele faze, 348KAJ + 763LYY), fără ocolul prin Elizaveta: mediana 27,85 + rază 0,6 = **28,45**.
- Echilibrat pe faze (fazele alternează săptămânal, deci au pondere egală; datele au 9 A / 3 B pentru că trackerul lui 348KAJ are puncte doar din 17.09): A 27,8, B 29,6 → media 28,7 + 0,6 = **29,3**.
- Plinul EZ septembrie (business r3): tur 28,5 / retur 28,2 + rază → 28,9.
- **28,9 e între 28,45 și 29,3 (−1,5 % / +1,4 %)**, sub toleranța de 5 %. Lanțul fără decizie dă 29,5 (+2 %) cu steag C47 35 %: etalonul pe pereche e stricat de returul care se termină la Gura Căinarului (0/8 opriri la capăt în septembrie), nu de linie.
- Propunere: 28,9 × 1 rămâne, decizia card-vechi (km sigilat, ture măsurate), motivul decizie actualizat cu reconcilierea de mai sus; în registrul verificatorului (E1, pe SHA-ul nou, după GATA) — explicația Zarojeni: ocolul de dimineață prin Elizaveta (oraș, în afara liniei) și returul la Gura Căinarului. Poziția părții Claude (runda 3) rămâne 28,9 × 1 la toți trei; datele noi o întăresc.

## Întrebarea pentru Codex, runda 4
C2 închis? Dacă nu: ce valoare și din ce regulă, cu fapt.
