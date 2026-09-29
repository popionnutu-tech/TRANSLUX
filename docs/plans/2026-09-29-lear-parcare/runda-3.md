# ION-143 — runda 3 (după revizia Claude r2: 7/10)

Bază: runda-1.md (cererea lui Ion, reguli), runda-2.md (metoda v2 și triajul r1). Cod: vps/lear-parcare.mjs (v3), vps/lear-parcare-valid.mjs.
Rularea: vps/rulare-21.09-r3.txt (cu diferența pe fiecare gol față de r2: «nou», «scos», «dif»).

## Triaj r2 (auditor Claude)
1. HIGH excursia la Bălți (189OMM 23.09, 129 km) — ACCEPTAT: oprirea ≥ 2 min la ≤ 4 km de depozitul Bălți scoate golul (service), iar
   cursa «fără poartă» cu oprire acolo nu mai e muncă. 189OMM 23.09 05:27–12:51 scos (vezi «scos» în rulare).
2. MEDIUM intersecțiile ca opriri — ACCEPTAT: pre-pas pe toată flota uzinei — încetinirea scurtă (< 8 km/h, ≤ 90 s) în aceeași celulă ~150 m la
   ≥ 5 mașini și în ≥ 4 ore diferite = infrastructură; punctele lente de acolo nu fac «oprire». Tur / retur fără trecere pe la capăt cer ≥ 2 opriri
   (cu trecere pe la capăt: ≥ 1 oprire sau fereastra lui). «Rute neverificate» se socotește doar pe tururi și retururi.
   Schimburile măsurate (§8.3) numără și cursele «în plus» care sosesc / pleacă în fereastră (145BRAZ își face ruta ca poartă → Șicovăț →
   poartă, fără tur separat).
3. LOW–MEDIUM controlul §10 — ACCEPTAT: mașina cu opriri rămase într-un drum de parcare iese fără propunere («controlul §10: …»), restul
   uzinei se scrie. Pe 21.09: nicio mașină nu pică.
4. LOW «deja» — ACCEPTAT: preferința «deja» doar dacă mașina stă acolo în ≥ 2 zile.
5. LOW propunerea mai rea pe unele goluri — ACCEPTAT: fiecare drum merge prin locul cel mai ieftin din cele alese SAU «rămâne cum e» (km de
   acum), care e mai puțin; pe hartă și în date loc 0 = «rămâne cum e». Validarea: niciun drum propus peste real.
6. §4.2 Florești — ACCEPTAT: migrația regulilor (după verdict) actualizează §4.2 cu Cunicea (ION-63) și adaugă la ambele uzine secțiunea
   «Parcarea propusă».
Condiția din răspunsul 4 (date.parcare pierdut dacă lear-analiza --write rulează singur): lanțul de luni cheamă parcarea imediat după analiză, în
același script (lear-saptamanal.sh); rularea de mână a analizei se face cu `--dump` + `lear-parcare/lant.sh` (scris în regulă și în memoria
proiectului). Paznicul de luni nu se schimbă acum.

## Rezultat 21–27.09 (r3)
LEAR Ungheni **−3.612 km/săpt.** (r2 3.471): 827MUM 663 (Petrești) · 809MUM 580 (poarta, deja) · 145BRAZ 360 (Ungheni) · 189OMM 347 (poarta) ·
217RST 291 · 807MUM 276 · 061COY 264 · 537BRAT 253 · 456BRAX 186 · 183BZP 161 · 732SHS 97 · 032BRAT 73 · 504BRAR 62; fără: 320BRAT (§8.3).
LEAR Florești **−828 km/săpt.**: 894BRAX 259 · 849BRAN 217 · 035BRAT 172 · 279BRAT 113 · 603BRAS 68; fără: 713IZX (§8.3).
Validarea trece (scrie-lear-parcare fără --write); harta: 71 + 30 zile, 0 abateri de km. A doua rulare = aceeași cifră (cache Valhalla).

## Întrebări
1. Celula de infrastructură (≥ 5 mașini, ≥ 4 ore) — suficientă?
2. «Rămâne cum e» pe drum (loc 0) — corect ca instrucțiune («seara ca acum»), sau umflă alegerea locului?
3. Mai e ceva care împiedică publicarea pe pagini (fără poster)?
