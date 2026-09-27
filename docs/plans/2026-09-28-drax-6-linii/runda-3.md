# ION-112 — runda 3: exportul unificat cerut de Codex (urma brută, viteza în noduri × 1,852)

Runda 2: Claude (verificator 6,25 / business 7,0 / analist 5,5), Codex 8,5 pass (0 high; C1 medium: probele «la oprire» din scratchpad
comparau viteza în noduri cu pragul de 8 km/h fără conversie). Codex a acceptat: Florești 36,5 × 2, Vărvăreuca 42,8 × 2, Trifănești 40,2 × 2,
Sturzovca 23,9 × 2, Bocancea Schit 53,3 × 1 (cu majoritatea), 727CWN iese din H4, 412BRAY iese dacă absența se confirmă; provizoriu:
Zarojeni × 1 (km 28,9 până la export), Nihoreni 44,2 × 2 (până la aceleași picioare D/EZ recalculate), Prajila 41,3 × 2 (până la tabelul zilnic);
H4 348KAJ și 763LYY rămân diagnostic până la clasificarea pe picioare.

## Exportul (export-r3.mjs + export-r3.json în acest dosar; picioarele obs-ideal v4.3, urma din trackerul pg, § 4.5: < 8 km/h REAL, ≥ 20 s, ≤ 0,8 km de capătul liniei; km de la prima oprire la poartă la tur, de la poartă la ultima oprire la retur; grupa după §2.3 cu ancora 21.09 = faza A)
Nihoreni R3 — septembrie: D tur 45,1 (5 picioare cu oprire din 20), D retur 44,8 (2/21), EZ tur 41,6 (2/18), EZ retur — (0/19); toată fereastra: D tur 45,4 (21/73), D retur 44,8 (7/76), EZ tur 42,1 (29/70), EZ retur 43,7 (4/72). Perechi/zi în septembrie: 2 (o pereche EZ — 345KAJ, apoi 457BRAX — și una D — 186OMM), 1 în 4 zile.
Zarojeni R18 — septembrie: EZ tur 27,8 (6/7 cu oprire), EZ retur fără oprire detectată la ≤ 0,8 km de capăt (0/8; toată fereastra 5/61, 32,7); D: 1+1 picioare, fără oprire. Perechi/zi: 1 (348KAJ) în fiecare zi 17–25.09 (trackerul lui 348KAJ are puncte doar din 17.09).
Prajila R17 — septembrie: D tur 41,6 (19/21), D retur 41,5 (4/20), EZ tur 40,1 (17/34), EZ retur 40,3 (6/31); perechi/zi: 713IZX 2 zilnic din 04.09, 487NPL 2 în 01–03.09 și 10.09, 763LYY a treia pereche în 11 zile din 19 (mediana 2; 3 perechi în 10 zile).
Notă de metodă: la retur, oprirea în capăt se prinde rar (descărcare scurtă sau în alt punct al satului decât coordonata capătului) — de aceea km-ii de la oprire se sprijină pe tur.

## Întrebările rundei 3 (poziția finală pe fiecare, cu dovadă; scopul: aceeași poziție la toate părțile)
Q5 Nihoreni: 44,2 × 2 (D 45 / EZ 42 de la oprire, un card) — acord?
Q6 Zarojeni: 1 tură; card 27,8–28,9 — care și de ce (tur de la oprire 27,8; etalonul lanțului 28,9 cu raza porții)?
Q4 Bocancea Schit: 53,3 (§6.3, septembrie) — verificatorul acceptă?
Prajila: × 2 (mediana; a treia pereche a lui 763LYY e o cursă suplimentară, nu a doua mașină a liniei) sau × 3?
H4: 348KAJ și 763LYY — rămân diagnostic sau ies, pe exportul de mai sus?
