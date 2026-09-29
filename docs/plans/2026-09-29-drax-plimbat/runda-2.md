# ION-133 — runda 2: metoda după revizorul Claude (6/10)

Decizia lui Ion (29.09): «tot ce este plimbat prin Bălți și Florești în mare parte este lucrul». Economia rămâne nopțile departe de capăt și
ocolul pe acasă. Cod: vps/ziua-ideala-candidat.mjs (patch.mjs + patch2–5), activ: vps/ziua-ideala-activ.mjs.

## Triajul rundei 1 (business-logic-auditor, 6/10)
- HIGH «măsura se saturează, 1,3 × dreapta sub ocolul real (mediana 1,44); pe control (rest ±2) plimbat brut 2,9 mediana» — ACCEPTAT.
  Proba a arătat cauza reală: legătura ideală e mediana drumurilor GPS observate, care conțin deja manevrele obișnuite din raze, deci orice
  plimbat măsurat separat se numără de două ori. Metoda s-a răsturnat: nu se mai scade plimbatul, se PĂSTREAZĂ ca economie ce e în plus pe
  drumul din mijloc.
- MEDIUM «drumul spre/de la casă din rază devine muncă (58,9 km)» — ACCEPTAT, rezolvat de metoda nouă: ocolul pe acasă (5.2) e păstrat întreg;
  se împarte doar restul de după ocol.
- MEDIUM «doar reziduurile pozitive; zilele < −5 cresc 3 → 4» — PARȚIAL: restul negativ («drum mai scurt») nu e plimbat, rămâne cum era.
  Zilele < −5: activ 5 (041BRAU −32,1, 388ASB −9,5, 414ASB −24,1, 727CWN −9,2, 763LYY −21,8), candidat 6 (+186OMM −5,3; 041BRAU −34,8, 727CWN −10,2).
- LOW km obligatorii scăzuți din tot intervalul — nu mai e cazul (metoda nouă nu scade km obligatorii din plimbat).
- LOW jumătățile de noapte nu se ating — explicit: nopțile (R1a) rămân economie întreagă, cum a cerut Ion.
- LOW raza măsurată de la primul punct — păstrat (efect mic, 903/1.006 km erau plimbat adevărat în Bălți).

## Metoda (runda 2)
Pe fiecare gol între curse (nu plin, nu lângă uzină, neobl > 0), cu L = legătura ideală, ocol = ocolul pe acasă, rest0 = neobl − L − ocol:
1. Urma GPS [t0, t1]. Faza A = de la început, punctele la ≤ 5 km de primul punct și nu acasă; faza B la fel de la sfârșit. Dacă fazele se
   ating (golul întreg într-o rază) → tot rest0 e muncă.
2. mijloc = km GPS între ieșirea din faza A și intrarea în faza B; ieșiri = drumul pe șosea (Valhalla) de la capete la marginile fazelor.
3. păstrat (economie) = min(rest0, max(0, mijloc − max(0, L − ieșiri) − ocol − CAL)); muncă (plimbat) = rest0 − păstrat, doar dacă rest0 > 0.
4. CAL = mediana pe săptămână a (mijloc − (L − ieșiri) − ocol) pe golurile de control (|rest0| ≤ 2, eșantion), plafonată la ≤ 0, doar cu ≥ 20
   goluri; 14.09: CAL = −1,7 pe 64 de goluri.
5. Muncă → intră în ideal (legătura), bilanțul gps − ideal = Σ cauze se păstrează. Nopțile nu se ating.

## Simularea 14.09
- Flota: economie 5.313,5 → 4.406,8 km măsurat (extrapolat 6.316 → 5.238); muncă (plimbat) 906,8; noapte 1.619,5 (=); ocol pe acasă 2.690,5 (=);
  acasaDrumLung 1.060,8 → 320,3; drumLung 198,3 → 32,1; mai scurt −255,6 (=); bilanț = economie. Peste prag 23 → 19.
- Control (|rest0| ≤ 2, 67 goluri): muncă aplicată mediana 0, max 2. Goluri cu rest0 > 2 (153): păstrat mediana 0,8, muncă mediana 4,1.
- Mașini: 446ASB 221,3 → 117,4; 146BRAZ 199,9 → 117,6; 518MHD 457,4 → 387,1; 206BZP 106 → 37,8; 186OMM 106,9 → 43,3; 713IZX 290,9 → 228,8;
  710CWN 582,5 → 537,2; 925FTI 455 → 444,6.
- 518MHD 17.09: 108,8 → 82,4 (nopți 43,5 + ocol pe acasă 27,2 + păstrat pe drum 11,7); ziua 06:04–14:00 (fără casă, porți + așteptări lângă
  Florești): muncă 24,2 din 25,9.

## Întrebări pentru Codex
1. E corectă răsturnarea (păstrăm în economie doar surplusul de pe drumul din mijloc) față de legătura GPS care include manevrele?
2. CAL: mediana pe goluri de control, plafonată la ≤ 0 — suficient de robustă? Alternativă: CAL pe pereche de locuri.
3. Ce cazuri scapă: mașina care face un drum lung ÎN rază (ex. o altă localitate la 4 km de capăt, dus-întors) devine muncă — acceptabil după Ion?
