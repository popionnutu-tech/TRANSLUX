# ION-123 — runda 2: triajul Codex r1 + specificația unică

Codex r1 (r1/codex-runda-1.json): fail, C1 high, C2 high, C3 medium — TOATE ACCEPTATE.

## Hotărârile deschise din r1 (sesiunea, cu motivul)
- Q2 legăturile goale: km REALI — mediana GPS a drumurilor directe (fără oprire ≥ 20 min, fără casă) ale ORICĂREI mașini a flotei pe aceeași pereche de puncte
  (capăt / poartă, ≤ 1,5 km), în fereastra săptămânii și a celor 4 dinainte (dacă sunt dosare), cu cel puțin 3 observații; altfel Valhalla × 1,05, cu steag
  «drum estimat». Etalonul liniei NU se folosește pentru legături: e drumul prin sate cu oameni, nu drumul gol (analist r1). Motiv: regula lui Ion «km reali
  din GPS, nu geometria» (26.09); Valhalla doar unde nu există drum real observat.
- Q3 Bălți: nopțile cu locul nopții în Bălți (§7.4) = SEPARAT, în afara totalului (Ion 28.09: «no» la «doarme la capăt» pentru Bălți). Weekendul (noaptea care
  atinge sâmbăta sau duminica) = SEPARAT (întrebarea deschisă pentru Ion, cu cifra lui).
- Q5 «gol între tur și retur» (706) și «lângă uzină / prin oraș» (844): NU sunt economie, intră în IDEAL la km reali. Motiv: Ion a scos «rămâne la uzină»
  («scoate regula 2 în general») — golul tur → retur e exact teritoriul ei; iar formula lui Ion «16 × 8 = 128 − 239 km − km prin oraș» scade km-ii prin oraș
  din economie.

## Contractul (C1, C2, C3)
- Deplasările OBLIGATORII ale zilei, în ordine de timp: cursele cu oameni (inclusiv prânzul și turele promovate), cursele între uzine (§5.11), service, deplasarea
  (§5.6), golul tur → retur și bucățile «lângă uzină» (Q5). Ele intră în ideal la km GPS reali, CA ATARE. Legăturile ideale se pun NUMAI între sfârșitul unei
  deplasări obligatorii și începutul următoarei, dacă locurile diferă (> 1,5 km); o deplasare obligatorie care duce deja mașina acolo nu mai primește legătură (C1:
  925FTI 14.09 14:32–15:52 → 7,1 km muncă, legătură 0).
- Eșantionul (C2) = EXACT eșantionul regulii B / al celor 3 reguli: zilele luni–vineri din economie.json fără «exclus» (§8.6: cursă nedetectată, jumătate
  nedetectată) și fără «de lămurit» (§11.8); sâmbăta și duminica NU intră. Noaptea: o jumătate (seara z / dimineața z+1) intră doar dacă ziua ei e în eșantion;
  noaptea vineri → luni, sâmbătă, duminică = weekend (separat). Mașinile cu steag «posibil cursă» (386PKP — cursa de prânz nedetectată; 293QVT — 63–77 km/zi gol
  tur → retur) sunt pe listă separată, NU în total, până la lămurire. Extrapolarea: același factor și același numitor ca B (zile-mașină L–V / zile măsurate).
- Ecuațiile (C3), pe fiecare zi din eșantion:
    GPS_zi = Σ bucăți (km parcurși; golul impus e parte a bucății, nu km în plus) — NU totalul din analiză;
    IDEAL_zi = Σ obligatorii (GPS) + Σ legături ideale + noaptea ideală (jumătățile din eșantion);
    ECONOMIE_zi = GPS_zi − IDEAL_zi = noapte + acasă între curse + drum mai lung decât legătura ideală (+ rest);
    fiecare cauză ≥ 0 pe bucată; reziduul negativ NU se plafonează: se arată ca «drum mai scurt decât idealul» (steag), iar ziua cu ECONOMIE < −5 km = steag.
  Identități: «noapte» (capătul ultimei = capătul primei) = regula 1 pe aceleași nopți; «acasă între curse» ≥ regula 3 (ocolul) și diferența = drumul mai lung
  decât legătura ideală pe aceleași bucăți, arătată separat.
- Probe pe toată flota: economie ≤ gol eligibil; Σ cauze = economie; ideal ≥ Σ obligatorii; munca (între uzine, service, deplasare) contribuie 0 la economie
  (proba pe 925FTI 14.09 14:32–15:52); cazul 763LYY (parc pozitiv compensat de drum negativ) vizibil ca două cauze, nu ca 0.
