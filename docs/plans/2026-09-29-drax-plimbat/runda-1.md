# ION-133 — plimbatul pe loc la capetele golului dintre curse e muncă (runda 1)

## Decizia lui Ion (nu se dezbate)
Ion, 29.09.2026, pe 518MHD (casa Izvoare, R16 Florești): «tot ce este plimbat prin Bălți și Florești în mare parte este lucrul».
Economia zilei ideale (§8.8, ION-123) rămâne: nopțile departe de capăt (R1a) și ocolul pe acasă între curse (5.2, ION-115).
Ce se dezbate: CUM se măsoară «plimbatul pe loc», ca să nu scoatem din economie drumul real și nici să lăsăm plimbatul în ea.

## Metoda propusă (vps/ziua-ideala-candidat.mjs, diff = vps/patch-ion133.mjs)
Pe fiecare interval «între curse» (nu plin, nu lângă uzină, neobl > 0):
1. Urma GPS a mașinii în [t0, t1] (punctele + staționările cu t0/t1, ION-128).
2. Capătul A = primul punct; faza A = punctele consecutive de la început cât timp sunt la ≤ 5 km de A și nu acasă (≤ 0,4 km de casă).
   Capătul B = ultimul punct; faza B la fel, de la sfârșit înapoi.
3. plimbat = max(0, km(faza A) − 1,3 × dreapta(A, ieșirea din rază)) + la fel pentru B. Dacă fazele se suprapun (tot golul într-o rază):
   plimbat = km(tot) − 1,3 × dreapta(A, B).
4. plimb = min(max(0, neobl − legătura − ocol), max(0, plimbat − km obligatorii ai intervalului (între uzine, parc))).
5. Legătura ideală += plimb (intră în ideal, bilanțul gps − ideal = Σ cauze se păstrează); economia intervalului scade cu plimb;
   ocolul pe acasă nu se atinge. Nopțile (jumătățile) nu se ating.

## Simularea pe 14.09 (fără scriere)
- Flota (151 zile măsurate): economie 5.313,5 → 4.307,1 km; plimbat 1.006,5; cauze: noapte 1.619,5 (=), acasă 3.751,3 → 2.931,2
  (ocol 2.690,5 =, acasaDrumLung 1.060,8 → 240,7), drumLung 198,3 → 12,0, mai scurt −255,6 (=); bilanțul = economia.
- Peste prag (100 km/săpt.): 23 → 19.
- Cele mai mari scăderi pe săpt. (măsurat): 446ASB 221,3 → 110,1; 146BRAZ 199,9 → 118,2; 206BZP 106 → 34,6; 186OMM 106,9 → 36,3;
  518MHD 457,4 → 387,4; 713IZX 290,9 → 228,3; 715IZX 106,2 → 50,9; 710CWN 582,5 → 534,6.
- 518MHD 17.09: 108,8 → 82,5. Ziua: 06:04–14:00 gol 57,6 (legătura 31,7; nu acasă; porți+autogară 11 km, apoi așteptări lângă Florești) →
  plimbat 23,3 (12,1 la Bălți + 11,1 la Florești), rămân 2,6; 16:24–00:19 gol 71,2 (legătura 31,8, ocol pe acasă 27,2) → plimbat 3,1, rămân 36,4.
- 446ASB 17.09: 45,8 → 20,9 (rămân doar nopțile); seara 2 h prin Bălți (19,2 km la capătul B) — muncă.
- 925FTI 17.09: 91,3 neschimbat (restul după ocol e ≤ 0).

## Întrebări pentru critici
1. Raza 5 km și factorul 1,3: prind plimbatul fără să scoată drumul de ieșire din Bălți / Florești? Alternative: raza după oraș (Bălți 6 km,
   capătul 3 km), factor din Valhalla pe dreapta de ieșire.
2. Casa în raza de 5 km a capătului (ex. 446ASB: Călugăr la 10 km — în afara; alții la ≤ 5 km): vizita acasă întrerupe faza — suficient?
3. Plafonul min(rest după ocol): corect să nu atingă ocolul pe acasă? (Ion: casa rămâne economie.)
4. Staționările (un punct la t0 și unul la t1 pe același loc) nu adaugă km — confirmat?
5. Ce altceva ar trebui să nu fie «plimbat»: drum spre un alt sat al rutei (nu capătul), alimentare, service (deja categorie proprie)?
