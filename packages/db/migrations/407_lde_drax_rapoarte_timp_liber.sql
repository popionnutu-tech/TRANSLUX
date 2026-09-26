-- 407_lde_drax_rapoarte_timp_liber.sql — Drăxlmaier §10, §11, §12 (F3). Generat de gen-407.mjs din text/s10–s12.txt.
-- Gardul de intrare = textul de după 406 recitit din bază (16340 / 77c30eee9a1dfc82f0c3547fb1365d3f); la ieșire lungimea ȘI md5-ul din simulare.
BEGIN;
DO $$
DECLARE n int; t text;
BEGIN
  UPDATE lde_uzine
     SET reguli_livrare = replace(replace(replace(reguli_livrare, $m10$10. RAPOARTE ȘI CONTROL
10.1 [SE SCRIE ÎN FAZA 3]$m10$, $t10$10. RAPOARTE ȘI CONTROL (analiza săptămânală, luni 08:00)
10.1 Luni, VPS-ul (drax/cod/saptamanal/saptamanal.sh, chemat din lear-saptamanal.sh) analizează săptămâna încheiată, luni → duminică, cu o zi în plus de fiecare parte pentru nopți, și scrie rândul DRAXELMAIER în lde_analiza_reguli; o săptămână neîncheiată nu se scrie, iar fiecare săptămână își păstrează instantaneul (urmele GPS, porți, ferestre, scheletul ideal și nomenclatorul folosite, norme, casa), ca o rerulare să dea același rezultat. Pagina: /lde/reguli?uz=drax — mașină cu mașină, zi cu zi, bucată cu bucată: categoriile de km (§5), regula B (§8), «așteaptă deja lângă uzină», nelămuritul, cursele de prânz, timpul liber și brambura (§11), lista «de lămurit».
10.2 Flota săptămânii = mașinile cu vizită ≥ 2 min la poarta EST sau VEST în ≥ 4 zile luni–vineri (§1.1); un rând pe mașină, iar timpul liber se socotește pe aceleași mașini. Zi atipică = mai puțin de jumătate din mediana mașinilor la lucru în zilele luni–vineri ale săptămânii: iese din sumele §8, cu steag (timpul liber de la §11 se socotește și în ea). Săptămână atipică = flota ei sub jumătate din flota săptămânii precedente: steag pe pagină.
10.3 Cifra săptămânii se măsoară pe zilele luni–vineri fără cursă probabil nedetectată (§8.6) și se extrapolează pe toate zilele-mașină luni–vineri, scris «extrapolare». Mașina fără nicio zi măsurată = «nemăsurat». Regula B e «cost de azi», nu economie garantată (§8.1). Lei doar pe mașinile cu normă (§9), cu prețul și normele de la duminica săptămânii, scrise separat «măsurat» și «extrapolat».
10.4 Control automat pe TOATĂ flota, în fiecare săptămână, înainte de scriere: bilanțul zilei (§5.9); probele P1–P7 ale categoriilor (doarme în afara rutei → livrare; două linii → legătură; o pereche și acasă la prânz → gol între ture; două linii și acasă între ele → livrare = doar ocolul; km din zona uzinei nu intră în R3; cursa opusă în afara ferestrei; excursia din intervalul perechii → deplasare); probele independente P8–P9 (km pe șosea); P10 «un km, un singur loc» (§11.2), pe sume și pas cu pas; dacă P10 pică, rândul săptămânii NU se scrie (paznicul anunță lipsa); cursele peste 140 km, cursele din afara ferestrelor, dispozitivul dublu, jumătățile de pereche, atingerile porții 22:00–06:00 în afara ferestrelor. O probă picată se scrie ca steag pe pagină. Clasa LEAR «casa ca stație de rută» NU se verifică: 35 din 44 de mașini au casa pe linie (§7.3).
10.5 Posterul (/api/cron/drax-optimizari?poster=1) arată «cât costă azi drumul casă ↔ rută» și, separat, ce se poate tăia cu o dispoziție (R1b + R3); doar km, fără lei, fără casă, fără ore, fără nume de oameni; rutele apar cu denumirea lor (ca Briceni, Ion 26.09). Fără comutator ruta doar întoarce imaginea; posterul pleacă după «da»-ul lui Ion.
10.6 Dacă luni rândul săptămânii lipsește, ADMIN-ul primește de la paznicul de luni (lde-luni-paznic) ce lipsește și cum se reface de mână.$t10$), $m11$11. TIMP LIBER ȘI BRAMBURA
11.1 [SE SCRIE ÎN FAZA 3]$m11$, $t11$11. TIMP LIBER ȘI BRAMBURA (modulul comun lear-timp-liber.mjs, ca LEAR §11 și SEBN §11; aici doar ce diferă la Drăxlmaier)
11.1 Munca e un LANȚ (LEAR 11.1): ancora = atingerea porții EST SAU VEST — aceeași uzină, aceleași ferestre (§3) — cu sosirea într-o fereastră de tur sau plecarea într-o fereastră de retur, într-o zi lucrătoare (§2). Cursa care atinge poarta în orele schimbului e muncă, niciodată brambura (LEAR 11.2).
11.2 UN KM, UN SINGUR LOC: categoriile din §5 au prioritate. Niciun km din liber, brambura, neclar, navetă, reparație sau altă uzină nu e și într-o categorie §5: ele se caută DOAR în km-ii pe care §5 i-a pus la deplasare sau necunoscut și în zilele fără curse și fără poartă. Nelămuritul din intervalul perechii (§8.3) rămâne o listă separată: nici economie, nici §11. Km-ii cu oameni, livrarea, golul pe rută, golul între ture, parcul, service-ul și legătura sunt «explicați de §5» și nu intră în §11. Proba P10 (§10.4) verifică asta pe toată flota, pas cu pas (P10c) și pe sume.
11.3 BRAMBURA = km pe un drum pe care mașina n-a mers în nicio altă zi a săptămânii, ≥ 5 km pe cursă (SEBN 11.3), numai în km-ii rămași după 11.2. Drumul de la locul nopții până la prima cursă și de la ultima cursă înapoi (livrarea, §5.2) nu e niciodată brambura, oricât de nou ar fi — ca la Briceni (Ion, 26.09: «seara spre casă nu e brambura»): la Drăxlmaier liniile și capetele se schimbă de la o zi la alta.
11.4 PARCUL BĂLȚI e la 0,70 km de poarta VEST și e loc de așteptare lângă uzină (§5.5), nu reparație: o cursă de muncă — ancoră sau în lanț — care oprește la parc rămâne muncă, iar pauza la ≤ 1 km de parc nu rupe lanțul. REPARAȚIE (service) = doar oprirea la parc într-o zi în care mașina n-a avut nicio ancoră sau o staționare la parc de peste 24 h; oprirea la parc în afara lanțului într-o zi de lucru e «neclar».
11.5 ZONA NECLARĂ a parcului = 1 km (la LEAR 3 km): cuprinde parcul și poarta VEST, nu poarta EST și nu cartierele Bălțiului; cu 3 km ieșirile mașinilor cu casa în Bălți s-ar pierde în «neclar».
11.6 NU există schimb 3 la Drăxlmaier (§2): o atingere a porții 22:00–06:00 în afara ferestrelor nu e ancoră. Sosirea la poartă seara (22:10–23:00) pentru returul s2 de după miezul nopții rămâne muncă prin așteptarea la poartă.
11.7 ALTĂ UZINĂ, NAVETĂ, TIMP LIBER, NECLAR: ca LEAR 11.5–11.8. Porțile EST și VEST sunt ale Drăxlmaier: niciuna nu e «altă uzină». O cursă de muncă Drăxlmaier care trece pe la poarta altei uzine rămâne muncă (11.2); «altă uzină» rămâne doar ce cade în afara categoriilor §5. Casa e cea a săptămânii (aceeași ca pentru livrare, §7); mașina fără casă cunoscută nu primește alarmă.
11.8 DE LĂMURIT: drumurile regulate în afara uzinei a căror natură nu se poate hotărî din GPS stau pe o listă, «de lămurit — posibilă cursă a firmei» (azi: la 024XKY drumurile de luni–joi spre Drochia, pe care §5 le-a pus la livrare, și zilele de vineri–duminică fără poartă, la Chișinău și Drochia; la 388ASB ziua de 23.09, la Chișinău). Până la răspuns, doar km-ii acestor intervale ies din regula B (cardul arată «din care N km de lămurit») și din alarma §11; se văd pe pagină, cu eticheta. Restul mașinii rămâne în regula B, în indicații și în alarmă.
11.9 Liber și brambura se numără SEPARAT, fiecare cu steag la 50 km pe săptămână pe mașină (LEAR 11.9); km pe ziua de lucru 03:00 → 03:00, punct cu punct (LEAR 11.10).
11.10 Mesajul către ADMIN (Telegram) cu mașinile peste prag NU pleacă automat până la «da»-ul lui Ion (hotărât prin dezbaterea Claude + Codex, 26.09.2026): luni, ruta rulează doar în probă (dry); rândul și pagina există.$t11$), $m12$12. INDICAȚII SĂPTĂMÂNALE PENTRU DISPECER
12.1 [SE SCRIE ÎN FAZA 3]$m12$, $t12$12. INDICAȚII SĂPTĂMÂNALE PENTRU DISPECER
12.1 Regulile LEAR 1–3 nu se aplică la Drăxlmaier (§8.4, §8.5). Indicațiile urmează partea din regula B care se poate face cu o dispoziție: R1b, ocolul pe acasă între curse («între curse mașina așteaptă la capăt sau la uzină, nu acasă»), plus R3 (așteaptă lângă uzină între tur și retur). R1a, marginile zilei, e cost de azi (se taie doar cu alt șofer din satul de start) și nu intră în indicații; se vede pe pagină.
12.2 SEMNIFICATIV = 100 km pe săptămână pe mașină (pragul lui Ion de la LEAR 12.2), pe R1b + R3 extrapolat pe zilele mașinii (km pe zi măsurați × zilele ei luni–vineri cu curse, fără zilele atipice), doar la mașinile cu cel puțin 3 zile măsurate în săptămână.
12.3 Forma e cea de la SEBN (12.6): primele 3 mașini peste prag, cu R1b și R3 pe săptămână și întrebările «între curse, unde așteaptă mașina — la capăt sau la uzină, nu acasă?» (R1b) și «între tur și retur, așteaptă lângă uzină?» (R3); restul mașinilor peste prag stau pe pagină. Timpul liber și brambura NU intră în mesajul pentru dispecer.
12.4 Posterul și indicațiile se scriu în fiecare săptămână, dar pleacă doar după «da»-ul lui Ion, fiecare cu comutatorul lui (?poster=1, ?indicatii=1); o săptămână nu se trimite de două ori (app_config: drax_optimizari_poster_last, indicatii_alexei_last_drax).$t12$),
         reguli_livrare_la = now()
   WHERE id = 'DRAXELMAIER_BALTI'
     AND length(reguli_livrare) = 16340
     AND md5(reguli_livrare) = '77c30eee9a1dfc82f0c3547fb1365d3f'
     AND position($g10$10. RAPOARTE ȘI CONTROL
10.1 [SE SCRIE ÎN FAZA 3]$g10$ in reguli_livrare) > 0
     AND position($g11$11. TIMP LIBER ȘI BRAMBURA
11.1 [SE SCRIE ÎN FAZA 3]$g11$ in reguli_livrare) > 0
     AND position($g12$12. INDICAȚII SĂPTĂMÂNALE PENTRU DISPECER
12.1 [SE SCRIE ÎN FAZA 3]$g12$ in reguli_livrare) > 0;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '407: textul din bază nu e cel de după 406 (16340 / md5), rânduri: %', n; END IF;
  SELECT reguli_livrare INTO t FROM lde_uzine WHERE id = 'DRAXELMAIER_BALTI';
  IF length(t) <> 24000 OR md5(t) <> 'f4e5f5293505d6cd53f18fef0cc935b5'
     OR position(E'\n10.6 ' in t) = 0 OR position(E'\n11.10 ' in t) = 0 OR position(E'\n12.4 ' in t) = 0
     OR position('[SE SCRIE ÎN FAZA' in t) > 0 OR position('[SE MĂSOARĂ ÎN FAZA' in t) > 0 OR position('$' in t) > 0
  THEN RAISE EXCEPTION '407: textul după înlocuire nu e cel așteptat (lungime %, md5 %)', length(t), md5(t); END IF;
END $$;
COMMIT;
