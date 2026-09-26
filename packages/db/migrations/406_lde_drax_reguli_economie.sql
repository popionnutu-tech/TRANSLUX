-- 406_lde_drax_reguli_economie.sql — Drăxlmaier §5, §7, §8, fraza §9.3 și fraza din antet
-- (F2, hotărâte prin dezbaterea Claude + Codex, la cererea lui Ion, 26.09.2026). Simulată prin SELECT: report-406-sim.txt.
BEGIN;
DO $$
DECLARE n int; t text;
BEGIN
  UPDATE lde_uzine
     SET reguli_livrare = replace(replace(replace(replace(replace(reguli_livrare,
           $m5$5. CATEGORII DE KM
5.1 [SE SCRIE ÎN FAZA 2, DUPĂ MĂSURARE]$m5$, $t5$5. CATEGORII DE KM (tabela de precedență; un interval al zilei = o singură categorie)
5.1 CU OAMENI: turul (de la capătul liniei la poartă, sosire într-o fereastră de tur) și returul (de la poartă la capăt, plecare într-o fereastră de retur), §3.2. PERECHEA = turul și returul aceleiași linii, aceluiași schimb, la aceeași mașină, în aceeași zi. Cursele din afara ferestrelor sunt presupuse goale: plecările de la poartă 06–08 și sosirile 22–24 (în total 28 % din cursele cu rută). Un TUR din afara ferestrelor cu urcări (opriri de 30 s – 5 min) în cel puțin 2 sate ale liniei e cu oameni, cu schimbul ferestrei celei mai apropiate și cu steag (regula Briceni 5.4); nu se promovează turul care pornește de la capăt la ≤ 5 min după ce un retur al aceleiași mașini a ajuns acolo, nici cel sosit în fereastra returului s2. Opririle din orașe nu sunt sate: orașele și municipiile (OSM «city / town») cu numele satului liniei, la ≤ 3 km — pe liniile Drăxlmaier Dondușeni, Cupcini, Rîșcani, Costești, Glodeni, Drochia, Florești, Mărculești, Biruința, Sîngerei, Fălești, Ghindești — și orice loc la ≤ 3 km de porți (Bălți: Dacia, Autogara, Slobozia). În 31.08–25.09: 2 tururi promovate (024XKY, sosiri la 11:15). Un drum care pleacă de la poartă în afara ferestrelor de retur rămâne gol. Cursele regulate la prânz (retururi plecate 12–14, tururi sosite la 11, ≈ 8 pe zi lucrătoare, 14 mașini) nu au fereastră în §3.2: nu sunt nici gol între ture, nici economie; ora lor se măsoară în faza de control ca posibilă fereastră de prânz.
5.2 LIVRARE: drumul de la locul nopții până la prima cursă și de la ultima cursă înapoi la locul nopții (marginile zilei), minus golul impus de la 5.3 (a). Pe acasă (staționare ≥ 20 min la ≤ 0,5 km de locul nopții, când acesta nu e parcul sau poarta) între două curse care nu sunt perechea aceluiași schimb, livrare e DOAR ocolul: km peste drumul direct pe șosea dintre sfârșitul unei curse și începutul următoarei (drumul direct × 1,05, toleranța GPS); drumul direct rămâne în categoria lui (5.3 b sau 5.7) — ca la Briceni (26.09).
5.3 GOL PE RUTĂ (al uzinei, nu economie): (a) din livrarea de dimineață sau de seară care atinge poarta, partea de pe culoarul liniei (≤ 1 km de schelet), cel mult lungimea liniei dimineața și tot atât seara; după o noapte la Parcul Bălți, drumul parc ↔ capăt până la lungimea liniei; (b) golul dintre două curse ale ACEEAȘI linii care nu sunt turul și returul aceleiași perechi (ex. după turul s1 înapoi la capăt pentru turul s2).
5.4 GOL ÎNTRE TURE: tot intervalul dintre turul și returul aceleiași perechi, fără altă cursă cu rută între ele (cu sau fără fereastră; intervalul cu o cursă de prânz se taie la ea: bucățile dintre curse ale aceleiași linii sunt gol pe rută, 5.3 b, cele spre sau dinspre altă linie sunt legătură, 5.7, iar cursa de prânz e gol pe rută pe linia ei), oriunde ar merge mașina, cu excepția excursiei de la 5.6. Km-ii lui din zona uzinei (≤ 3 km de porți sau de parc) = mașina așteaptă deja lângă uzină.
5.5 PARC: drumurile din zona uzinei (≤ 3 km de porți sau de parc) spre și de la o staționare de cel puțin 5 minute la ≤ 0,5 km de Parcul Bălți, în afara razei porții. Parcul e loc de așteptare lângă uzină, nu reparație: nu e economie. Atingerea porții într-o fereastră bate parcul (§3.4). SERVICE: oprirea la parc într-o zi fără curse cu oameni sau staționarea la parc peste 24 de ore.
5.6 DEPLASARE: ieșire la peste 15 km de porți, de satele liniilor mașinii din ziua aceea și de locul nopții; în intervalul perechii, doar partea care iese.
5.7 LEGĂTURĂ: golul dintre curse ale unor linii DIFERITE (drumul direct, dacă a trecut pe acasă). Impus de joburi, nu e economie.
5.8 NECUNOSCUT: restul.
5.9 Σ categoriilor = km-ul zilei din urma brută (03:00 → 03:00) ± 3 % (31.08–25.09: 770 din 770 de zile).
5.10 NAVETA ȘOFERULUI nu se numără deloc (LEAR 5.5).$t5$),
           $m7$7. UNDE DOARME MAȘINA
7.1 [SE SCRIE ÎN FAZA 2, DUPĂ MĂSURARE]$m7$, $t7$7. UNDE DOARME MAȘINA
7.1 Casa = locul unde mașina stă cel mai mult (staționări ≥ 2 h adunate) în zilele de lucru luni–vineri, din urma GPS, fără porți și fără parc (LEAR 7.1). Locul nopții (pentru livrare) = cea mai lungă staționare din 00:30–05:30, noapte de noapte.
7.2 Măsurat 31.08–25.09 (44 de mașini): casa la 0–3 km de poartă 7 (Bălți), 3–10 km 1, 10–20 km 7, 20–40 km 23, peste 40 km 6; 42 de mașini stau cel puțin 70 % din ore în același loc.
7.3 35 din 44 de mașini au casa la ≤ 1 km de un sat al liniilor lor: șoferul e din satul rutei. Oprirea acasă în cursa cu oameni nu e eroare.
7.4 Noaptea la Parcul Bălți (14 nopți din 749, 10 mașini) = doarme lângă uzină: drumul parc ↔ capăt e golul impus (5.3 a), nu livrare.$t7$),
           $m8$8. REGULILE DE ECONOMIE
8.1 [SE MĂSOARĂ ÎN FAZA 2 ȘI SE CONFIRMĂ DE ION]$m8$, $t8$8. REGULILE DE ECONOMIE (hotărâte prin dezbaterea Claude + Codex pe cifre, la cererea lui Ion, 26.09.2026)
8.1 Regula Drăxlmaier este B = R1a + R1b + R3 (8.2, 8.3), adunate: taie km diferiți (marginile zilei, ocolul pe acasă, intervalul dintre tur și retur). A (8.4) se calculează doar ca referință. Cifrele sunt cost de azi, bază de analiză, nu economie garantată. Lei = km reținuți la R1a, R1b, R3 × lei/km (§9.1), doar pe mașinile cu normă. Km pe șosea (Valhalla). Se măsoară doar pe zilele fără cursă probabil nedetectată; cifra pe flotă e extrapolare pe zile-mașină.
8.2 R1 — LIVRAREA (ca SEBN și Briceni): R1a marginile zilei — șofer din satul de start sau mașina doarme la capăt; cost de azi, nu economie garantată: 29 km pe zi-mașină, ≈ 1.100 km pe zi lucrătoare pe flotă (extrapolare). R1b ocolul pe acasă între curse — nu pleacă acasă, așteaptă la capăt sau la uzină: 27 km pe zi-mașină, ≈ 1.020 km pe zi lucrătoare pe flotă (extrapolare).
8.3 R3 — AȘTEAPTĂ LÂNGĂ UZINĂ ÎNTRE TUR ȘI RETUR (Ion, 26.09: «dacă ruta e semnificativ de lungă SAU mașina face doar o rută»): în zilele cu o singură pereche completă SAU pe liniile peste 30 km, economia = km-ii intervalului dintre tur și retur din AFARA zonei uzinei (> 3 km de porți și de parc), fără excursii, cel mult drumul pe șosea dus-întors până la cea mai lungă oprire de cel puțin 20 de minute din afara zonei (× 1,05); intervalul fără o astfel de oprire are R3 = 0. Km-ii din zonă nu sunt economie (mașina e deja lângă uzină); km-ii din afara zonei peste plafon sau fără oprire sunt «nelămurit» și se arată separat, nu se numără de două ori: ≈ 0,3 km pe zi-mașină, ≈ 10 km pe zi lucrătoare pe flotă (extrapolare); nelămurit ≈ 40 km pe zi lucrătoare.
8.4 A — «Doarme lângă uzină, 4 drumuri pe rută» (LEAR R1) NU se aplică la Drăxlmaier: mașinile dorm în satele liniilor, iar regula ar adăuga 28 km pe zi-mașină (≈ 1.060 km pe zi lucrătoare pe flotă, extrapolare). A ar tăia mai mult decât B doar la 3 mașini măsurate în puține zile (744ARF 4 din 19, 804MUM 2 din 10, 297LVY 2 din 3), de remăsurat.
8.5 Realocarea rutelor între mașini (LEAR R2) NU se propune: câștigul net (≈ 550 km pe zilele măsurate ale ferestrei 31.08–25.09) vine din ≈ 3.200 km câștigați de unele mașini și ≈ 2.700 pierduți de alte 9, pe o atribuire care se schimbă cu rotația săptămânală. Se remăsoară după două luni de rulare.
8.6 Zilele cu o cursă fără pereche nicăieri (probabil nedetectată, 21 % din zilele-mașină L–V) nu intră în regulile de economie; se numără separat. Ele sunt concentrate pe mașinile cu curse la prânz (5.1): 386PKP nu are nicio zi măsurată, 744ARF 4 din 19, 804MUM 2 din 10. Zilele cu curse de prânz rămân în regulile de economie doar dacă perechea e completă; cursa de prânz nu e nici economie, nici nelămurit.$t8$),
           $m9$9.3 Ce km se înmulțesc cu lei/km se scrie la §8, după «da»-ul lui Ion.$m9$, $t9$9.3 Ce km se înmulțesc cu lei/km e scris la §8 (hotărât prin dezbaterea Claude + Codex, 26.09.2026).$t9$),
           $ma$categoriile de km, locul nopții și regulile de economie se scriu după măsurare și după «da»-ul lui Ion)$ma$, $ta$categoriile de km, locul nopții și regulile de economie se scriu după măsurare și se hotărăsc prin dezbaterea Claude + Codex, la cererea lui Ion, 26.09.2026)$ta$),
         reguli_livrare_la = now()
   WHERE id = 'DRAXELMAIER_BALTI'
     AND md5(reguli_livrare) = '0a122257c503d842f6efbf324803cdc1'   -- textul de azi (9.106), needitat de Ion
     AND position($m5$5. CATEGORII DE KM
5.1 [SE SCRIE ÎN FAZA 2, DUPĂ MĂSURARE]$m5$ in reguli_livrare) > 0
     AND position($m7$7. UNDE DOARME MAȘINA
7.1 [SE SCRIE ÎN FAZA 2, DUPĂ MĂSURARE]$m7$ in reguli_livrare) > 0
     AND position($m8$8. REGULILE DE ECONOMIE
8.1 [SE MĂSOARĂ ÎN FAZA 2 ȘI SE CONFIRMĂ DE ION]$m8$ in reguli_livrare) > 0
     AND position($m9$9.3 Ce km se înmulțesc cu lei/km se scrie la §8, după «da»-ul lui Ion.$m9$ in reguli_livrare) > 0
     AND position($ma$categoriile de km, locul nopții și regulile de economie se scriu după măsurare și după «da»-ul lui Ion)$ma$ in reguli_livrare) > 0;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '406: textul din bază nu e cel așteptat (md5 + 5 fragmente), rânduri: %', n; END IF;
  SELECT reguli_livrare INTO t FROM lde_uzine WHERE id = 'DRAXELMAIER_BALTI';
  IF length(t) <> 16340 OR md5(t) <> '77c30eee9a1dfc82f0c3547fb1365d3f'
     OR position(E'\n5.10 ' in t) = 0 OR position(E'\n7.4 ' in t) = 0 OR position(E'\n8.6 ' in t) = 0
     OR position('după «da»-ul lui Ion' in t) > 0
     OR (length(t) - length(replace(t, '[SE SCRIE ÎN FAZA 3]', ''))) / length('[SE SCRIE ÎN FAZA 3]') <> 3
     OR position('$' in t) > 0
  THEN RAISE EXCEPTION '406: textul după înlocuire nu e cel așteptat (lungime %, md5 %)', length(t), md5(t); END IF;
END $$;
COMMIT;
