# ION-123 — runda 2, rezultatul și pozițiile sesiunii (pentru Codex)
Specificația: runda-2.md (Codex r1 C1–C3 acceptate). Măsurarea: r2/analist.md, r2/ziua-ideala-v2.mjs, r2/ziua-ideala-v2.json (+ -fara-ciorna.json), r2/rezumat-v2.mjs, r2/compara-v2.mjs.
Eșantion = B (151 de zile L–V, fără 386PKP / 293QVT). Economie 4.998,7 km măsurat → 5.942 extrapolat (factor B 189/159). Pe cauze: noapte 1.157,4 · acasă între
curse (ocolul) 2.713,1 · drum mai lung în intervalele cu ocol 1.138,3 · drum mai lung fără ocol 229,9 · «mai scurt decât idealul» −239,9 (steag, neplafonat).
Separat: weekend 447,9, Bălți 652,6, 293QVT 29,3. Legături: 305 perechi, 181 pe mediana GPS (mediana 27 de observații / pereche), 124 pe Valhalla × 1,05 (steag).
Probe pe 195 de zile: GPS − ideal = economie + separat (0 abateri); Σ cauze = economie; economie ≤ gol; ideal ≥ obligatorii; 188 de intervale doar-obligatorii cu
contribuție 0 (925FTI 14.09 14:32–15:52 = 0, C1); regula 1 pe aceleași 37 de nopți 789,6 = 789,6; regula 3 2.713,1 = 2.713,1. Două zile sub −5: 763LYY 18.09 (−27,6),
388ASB 15.09 (−8,1) — cauza: km-ii F2 ai intervalelor «parc + între uzine» par umflați (de reparat în categorii, nu aici).
710CWN 109,1/zi (weekend 36,8/săpt. separat; 10,5/zi «lângă uzină» în ideal); 925FTI 90,1/zi. 22 de mașini peste 100 km/săpt.

Pozițiile sesiunii pe întrebările analistului:
1. Dosarul-ciornă `_ciorna/2026-09-07-ion107` NU se folosește la mediana GPS (nu e o săptămână validată; efect 20 km): cifra = varianta fără ciornă 4.978,6 / 5.918.
2. «Drum mai lung în intervalele cu ocol» (1.138,3) se UNEȘTE cu «acasă între curse» (→ 3.718,5 după ciornă-excluse, recalculat): e aceeași mișcare (exemplul lui
   Ion: uzina → acasă → Lazo 63 km față de 16 direct = tot «din cauza casei»); «drum mai lung fără ocol» rămâne cauză separată.
3. Zilele «mai scurt decât idealul» (F2 umflat): steag pe zi, fără plafonare; repararea în categorii.mjs e un tichet separat.
4. Weekendul: separat, arătat (447,9); decizia e a lui Ion (exemplul lui pentru 710CWN include luni dimineața).
Întrebarea pentru Codex: C1–C3 închise? specificația și scriptul corecte? pozițiile 1–4? ce lipsește înainte de implementare; scor; high doar cu scenariu.
