# ION-133 — runda 5: răspunsul la Codex runda 4 (7.0, fail: C2 high; C3 medium)

Cod: vps/ziua-ideala-candidat.mjs (ultimele patch11.mjs, patch12.mjs). Ieșiri: vps/audit8-si-probe-c2.txt.

## C2 (high) — obligatoriul delimitat pe muchii, intersectat cu mijlocul — ACCEPTAT, reparat
`muchiiObligatorii(Q)` marchează muchiile urmei cu regulile producătorului (categorii.mjs:158–179 drumuriIntrePorti; :359–371 parcul; :436):
- mișcarea toată în zona de 3 km și ≤ 11 km → toate muchiile;
- altfel perechile poartă A → B ≠ A (poarta cu raza + 0,3 km; «la poartă» = ≥ 1 min sub 8 km/h sau capătul mișcării; ≤ 40 min; toate punctele
  ia..ib în zonă) → muchiile ia+1..ib;
- parcul: bucățile dintre capetele mișcării și staționările ≥ 5 min la parc, cu toate punctele în zonă;
- muchiile > 5 km nu se numără (ca la producător).
`mijlocUzina` = km muchiilor obligatorii cu indicele în mijloc (i+1..j) — intersecția efectivă; aceeași funcție la aplicare și validare.
Probe sintetice (vps/proba-c2.mjs, în audit8-si-probe-c2.txt): P1 VEST → EST (staționări), ieșire din zonă, revenire în zonă fără poartă,
spre capătul rural → obligatoriu doar muchiile VEST→EST (0,86 km, ca producătorul: de la ultimul punct din raza A la primul din raza B),
nimic după EST — ok; P2 mișcare toată în zonă ≤ 11 km → toate — ok; P3 trecere în mers pe lângă porți → nimic — ok.

## C3 (medium) — validare pe date nefolosite și pe intervalele auditate — ACCEPTAT
- După C2 exact, validarea încrucișată (CAL dintr-o jumătate pe cealaltă, eroare absolută mediană): global 2,2 / 2,9 față de 2,3 fără; GPS 0,9 / 2,1
  față de 1,5; Valhalla 2,9 / 2,1 față de 2,8 → calibrarea nu reduce eroarea nicăieri → SCOASĂ (calPentru = 0). Validarea rămâne în rezultat.
- Cele 8 intervale urmărite pe traseu de auditorul Claude (runda 1), cu metoda curentă (audit8-si-probe-c2.txt):
  206BZP 15.09 06:08 rest 11,7 → muncă 11,7 (plimbat real, porți); 710CWN 14.09 06:09 rest 13,5 → muncă 12,6, păstrat 0,9 (plimbat real);
  186OMM 15.09 06:29 rest 21,6 → muncă 21,6 (Bălți + dus-întors Nihoreni ↔ Rîșcani la capăt — muncă după Ion); 446ASB 14.09 17:05 rest 16,4 → muncă 16,4
  (2 h prin Bălți); 912RNK 18.09 16:28 rest 13,0 → muncă 12,2 (faza B 12,3 = buclele VEST/EST, reale), păstrat 0,8; faza A 3,4 (auditorul: drum real
  spre casă) — dar ocolul pe acasă 57,8 e păstrat întreg, iar restul de 13,0 e acoperit de faza B; 146BRAZ 14.09 rest 16,1 / 9,6 → muncă 16,1 / 8,5
  (casa la 3,6 km de capăt: faza se oprește la casă); 713IZX 17.09 rest 18,8 → 18,8; 715IZX 14.09 rest 4,2 / 11,8 → 4,2 / 11,8.

## Simularea 14.09
Flota 5.313,5 → 4.269,0 km măsurat (extrapolat 6.316 → 5.074); muncă 1.044,5; noapte 1.619,5 (=); ocol 2.690,5 (=); acasaDrumLung 208,0;
drumLung 6,6; mai scurt −255,6 (=); bilanț = economie; urme insuficiente 0; peste prag 23 → 19. 518MHD 457,4 → 373,8 (17.09: 108,8 → 79,1);
446ASB 221,3 → 109,8; 146BRAZ 199,9 → 112,7; 186OMM 106,9 → 37,1; 710CWN 582,5 → 535,1; 925FTI 455 → 443,3.
