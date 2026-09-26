-- 404 — Drăxlmaier Bălți: ferestrele de ceas din GPS + textul de bază al regulilor de livrare (faza 1, umbrela ION-86).
-- Ion, 26.09.2026: agentul învață sistemul pentru Drăxlmaier după uzinele care lucrează; regulile de economie le propune
-- agentul din date și le confirmă Ion. De aceea textul are DOAR §1–§4, §6 și §9 (formula); §5, §7, §8 și §10–§12 sunt
-- MARCAJE fixe (titlu + rând) pe care migrațiile următoare le înlocuiesc prin replace gardat.
-- Ferestrele = FER din drax/cod/ideal/etalon.mjs:26 (VPS), confirmate pe moduri lunare de ore.mjs («FER rămâne»):
-- aceleași pe poarta EST și pe poarta VEST (tabelul n-are coloană de poartă).
-- Textul se scrie DOAR dacă e încă NULL (corecturile lui Ion de pe /lde/livrare-reguli nu se calcă); altfel migrația
-- pică zgomotos și nu se înregistrează. livrare_validata rămâne false (altfel uzineValidate() din livrare-poster.ts
-- bagă Drăxlmaier în posterul vechi). Fără funcții, fără GRANT.
BEGIN;

DO $$
DECLARE n int;
BEGIN
  DELETE FROM lde_uzina_ferestre_ceas WHERE uzina_id = 'DRAXELMAIER_BALTI';
  INSERT INTO lde_uzina_ferestre_ceas (uzina_id, sens, shift_number, de_la_min, pana_la_min, sursa)
  SELECT 'DRAXELMAIER_BALTI', f.sens, f.sch, f.de, f.pana, 'GPS 04.05–17.07 + 01.09–25.09.2026, ambele porți'
  FROM (VALUES
    ('tur',   1,  210,  420),   -- sosire 03:30–07:00 (mediana EST 06:13 / VEST 06:12; modul 06:00)
    ('tur',   2,  810,  960),   -- sosire 13:30–16:00 (mediana 14:41 / 14:43; modul 14:30)
    ('retur', 1,  900, 1065),   -- plecare 15:00–17:45 (mediana 15:54 / 15:40; modul 15:45)
    ('retur', 2, 1380,  105)    -- plecare 23:00–01:45, trece de miezul nopții (mediana 00:18 / 00:09; modul 00:15)
  ) AS f(sens, sch, de, pana);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 4 THEN RAISE EXCEPTION '404: trebuiau 4 ferestre DRAXELMAIER_BALTI, au intrat %', n; END IF;

  UPDATE lde_uzine SET reguli_livrare_la = now(), livrare_validata = false, reguli_livrare = $r$REGULILE LIVRĂRII — DRĂXLMAIER BĂLȚI (faza 1, 26.09.2026, umbrela ION-86: faptele uzinei măsurate pe GPS; categoriile de km, locul nopții și regulile de economie se scriu după măsurare și după «da»-ul lui Ion)

1. SURSE DE ADEVĂR
1.1 Cine lucrează la Drăxlmaier se decide din urma GPS, nu din liste (Ion, 24.09: «ne uităm dacă auto a lucrat sau nu»): mașina intră în săptămână dacă a STAT (≥ 2 min) la poarta EST sau la poarta VEST în ≥ 4 zile de lucru ale săptămânii. Sub prag → «de verificat», nu dispare. Săptămânile ISO 36–38 (31.08–20.09.2026): 39, 41, 38 de mașini pe săptămână (săptămâna 35 e în august și nu se ia).
1.2 Listele (lde_factory_routes, graficul intern, actul) spun doar CE face o mașină care a lucrat, niciodată DACĂ aparține uzinei. Mașina se poate schimba pe linie (ca la SEBN 1.1): scheletul e al LINIEI, nu al mașinii.
1.3 Nomenclatorul = actul Drăxlmaier KW24 (cererea 08–13.06.2026): 39 de rute, 51 de linii. Unitatea este RUTĂ × LINIE: o rută are 1–3 linii cu «Starting point» diferit (R27 Danu: Sturzovca, Iabloana, Danu). Din act se iau rutele, liniile, satele, grupa (I - EZ / II - D) și capacitatea (50 / 27 / 20 de locuri). Km-ii din act NU se folosesc (Ion, 24.09, la Florești): pe un sens, drumul real e mai scurt la aproape toate liniile — mediana etalon GPS / (km act ÷ 2) = 0,81 (ION-45).
1.4 Scheletul fix = scheletul ideal ION-71 (VPS drax/date/schelet-ideal.json; GPS 04.05–17.07 + 01.09–25.09.2026, fără august și fără ultimele două săptămâni din iulie): 48 din 51 de linii. Liniile Hasnasenii Noi (R13), Putinești (R18) și Iabloana (R27) n-au nicio cursă care să pornească din startul lor în GPS; satele rămân în act (4.4), liniile rămân fără etalon până apar curse.
1.5 Plăcuța mașinii = CarName din tracker (RegNo doar dacă CarName nu e plăcuță). Un autobuz cu două dispozitive se numără o dată (cursele coincid ≥ 80 %).
1.6 Km-ii zilei se iau din urma GPS brută (ziua 03:00 → 03:00, salt > 5 km aruncat), nu din lista de curse. Drumurile propuse se măsoară pe șosea (Valhalla), fără estimări pe linie dreaptă.
1.7 Calculul de noapte (lde_route_run) NU e sursa pentru Drăxlmaier: livrare_validata rămâne false: posterul vechi de livrare nu se aplică la Drăxlmaier; analiza săptămânală din GPS (faza 3) e sursa.

2. ORELE UZINEI
2.1 Schimbul 1: 07:00–15:30. Schimbul 2: 15:30–00:00. Schimbul 3 nu e în programul uzinei; dacă apare în GPS, se măsoară în faza 2 și se întreabă Ion.
2.2 Orele reale la poartă (GPS, mediane poarta EST / poarta VEST): tur s1 sosire 06:13 / 06:12 · tur s2 sosire 14:41 / 14:43 · retur s1 plecare 15:54 / 15:40 · retur s2 plecare 00:18 / 00:09. Modurile (pe sferturi de oră) sunt aceleași în mai, iunie, iulie și septembrie: 06:00, 14:30, 15:45, 00:15.
2.3 Grupele din act: «I - EZ» și «II - D» sunt grupele de oameni ale autobuzului (E+Z, respectiv D), nu programul și nu drumul (Ion, 25.09). Rotația merge pe săptămâni ISO (luni–duminică): grupa D face schimbul 1 în săptămânile IMPARE și schimbul 2 în cele pare; grupa E+Z invers; liniile cu ambele grupe (EZ+D) merg pe ambele schimburi, zilnic. Pe GPS (ION-71), în săptămânile impare schimbul 1 are 33 de linii (D + ambele grupe) și schimbul 2 are 25 (EZ + ambele); în săptămânile pare 26 și 32 (Trifănești rămâne pe schimbul 1). Cifrele urmează GPS-ul, nu actul (2.4).
2.4 Abateri de la act, măsurate pe GPS (ION-71), de lămurit cu Ion: Sturzovca (D în act, dar merge pe ambele schimburi, cu două mașini), Dominteni (EZ, dar ambele), Trifănești (D, doar schimbul 1), Florești și Țiplești (EZ+D, dar se rotesc ca D), Bilicenii Vechi (EZ+D, se rotește ca EZ); neclare Cobani, Copăceni, Nicolaevca.
2.5 Săptămâna: luni–vineri lucrează toată flota (în medie 39,5 mașini pe zi, 04.05–17.07 + 01.09–25.09); sâmbăta PARȚIAL (12, 11 și 8 mașini în sâmbetele săptămânilor 36–38); duminica aproape deloc (1, 0, 0). «Lucrează sâmbăta» înseamnă unele linii, nu toată flota.
2.6 Ziua de lucru ține 03:00 → 03:00, ora locală (LEAR 2.4). Returul schimbului 2 (plecare ~00:15) ține de ziua de lucru de ieri.
2.7 Ora GPS: trackerul scrie UTC fără fus (track.w_date); se citește ca UTC și se trece în ora Moldovei prin fusul Europe/Chisinau (ora de vară și de iarnă), ca în lde-geo-worker/ora-locala.mjs. Nu se adună un număr fix de ore.

3. TUR ȘI RETUR
3.1 TUR = cursa care ADUCE oameni la poartă; schimbul se dă după ora SOSIRII. RETUR = cursa care DUCE oameni de la poartă; schimbul se dă după ora PLECĂRII.
3.2 Ferestre de ceas (lde_uzina_ferestre_ceas): tur s1 sosire 03:30–07:00 · tur s2 sosire 13:30–16:00 · retur s1 plecare 15:00–17:45 · retur s2 plecare 23:00–01:45. Sunt ferestrele cu care s-a tăiat scheletul ideal; se suprapun 15:00–16:00 între sosirile schimbului 2 și plecările schimbului 1 — sensul (sosire sau plecare) decide, nu ora.
3.3 Poarta EST (47.78513 / 27.94307, rază 0,6 km) și poarta VEST (47.77408 / 27.91593, rază 0,5 km) sunt ACEEAȘI uzină, la 2,4 km una de alta, cu aceleași ferestre. O mașină atinge ambele porți în aceeași zi în 82–86 % din zilele de lucru (săptămânile 36–38; 82 % pe toată fereastra ION-71): una nu e «altă uzină» pentru cealaltă, iar atingerea oricăreia e atingerea uzinei.
3.4 Zona comună VEST / parc: Parcul Bălți (47.770 / 27.9235) e la 0,70 km de poarta VEST și la 2,25 km de poarta EST; cercurile porții VEST și ale parcului se suprapun. Precedența: atingerea unei porți într-o fereastră de tur sau de retur BATE parcul — cursa e a uzinei, nu reparație și nu service. Ce înseamnă parcul în rest (așteptare lângă uzină sau service) se hotărăște după măsurarea din faza 2.
3.5 Cursele în afara ferestrelor: 27–28 % din cursele cu rută, în fiecare lună (constant din mai în septembrie). Nu primesc schimb la tăierea scheletului; ce sunt ele (picioare goale sau curse cu oameni în afara programului) se măsoară în faza 2, pe opriri.

4. RUTA ȘI CAPĂTUL
4.1 Linia = de la capăt până la poartă. Capătul = «Starting point»-ul liniei din act (startul e capătul), același sat la tur și la retur.
4.2 Capătul e atins dacă urma trece la ≤ 1,2 km de el sau dacă cursa ÎNCEPE ori SE TERMINĂ la ≤ 2,5 km de el (trackerul dă prima poziție la câteva minute după plecare). Pe o rută cu mai multe linii, capătul cursei = cel mai depărtat start al rutei atins.
4.3 Nume la fel (omonime): capătul e localitatea cu numele din act cea mai apropiată de al doilea sat al rutei (R20 Nicolaevca de lângă Drăgănești, nu cea de la Cotiujeni).
4.4 Un sat din act nu e sat de trecere, oricât de aproape de poartă ar fi (LEAR 4.6).
4.5 Oprirea în sat = viteza sub 8 km/h în raza de 0,8 km și ≥ 20 s sub 15 km/h. Drumul «trece prin sat» la ≤ 1,5 km de centrul lui.
4.6 Mașina care nu atinge niciun start din act primește capătul = cel mai depărtat sat atins al rutei, marcat «*» — de verificat, nu etalon.
4.7 Sate din act fără nicio oprire pe rută în GPS: Mîndîc (R1), Sofrîncani (R2), Recea (R7), Obreja Nouă (R26), Balatina (R28), Năvîrneț (R37). Rămân în act; nu schimbă capătul.

5. CATEGORII DE KM
5.1 [SE SCRIE ÎN FAZA 2, DUPĂ MĂSURARE]

6. ETALONUL (SCHELETUL)
6.1 Scheletul e al LINIEI (rută × linie), indiferent de tură și de mașină: un drum pe linie — turul zilei alese, returul = oglinda lui (tur = retur); pe schimb unde se aplică 6.6.
6.2 Km-ii liniei = MEDIANA pe urmă a zilelor bune, nu media. Zi bună = urma ajunge la capăt în ambele sensuri, turul și returul ies la ≤ 18 % unul de altul și trec prin satele «regulate» ale liniei (cele atinse în ≥ 50 % din curse, pe sens).
6.3 Sursa = septembrie, dacă are ≥ 3 zile bune; altfel toată fereastra (tot cu ≥ 3). 45 din 48 de linii au etalonul din septembrie; R13 Lazo, R39 Popeștii de Jos și R16 Florești — din mai–iulie.
6.4 Ziua desenată = în ±5 % de etalon, cu cele mai multe opriri în satele din act; la toate cele 48 de linii km-ul etalonului = drumul desenat ±5 %.
6.5 Turele pe zi ale liniei se MĂSOARĂ, nu se iau din act: mediana perechilor tur–retur (schimb, mașină) pe zi, doar pe mașinile cu ≥ 3 zile cu ambele sensuri; dispozitivele duble (±3 min) se numără o dată. Rezultat: 29 de linii × 1, 16 × 2, 3 × 3 (Dominteni, Prajila, Sturzovca). Km pe zi ai liniei = 2 × km × ture pe zi; pe toată uzina 5.843 km/zi cu oameni.
6.6 Unde schimbul 1 și schimbul 2 merg pe drumuri diferite ale aceleiași linii, etalonul se ține PE SCHIMB (R27 Sturzovca: s1 24,7 km, s2 46,9 km).
6.7 Tur = retur se verifică pe mediană, nu zi cu zi (LEAR 6.4).

7. UNDE DOARME MAȘINA
7.1 [SE SCRIE ÎN FAZA 2, DUPĂ MĂSURARE]

8. REGULILE DE ECONOMIE
8.1 [SE MĂSOARĂ ÎN FAZA 2 ȘI SE CONFIRMĂ DE ION]

9. COSTUL KM
9.1 lei/km = norma mașinii (l/100 km: norma tipului din lde_vehicle_types, altfel consumul măsurat din lde_vehicle_norms) × prețul ANRE al zilei (lde_diesel_price) / 100 + reparație (1,50 la autobuz mare, 1,00 restul) + salariu 1,00 — aceeași formulă ca la SEBN și Briceni (§9).
9.2 Mașina fără normă în bază nu primește lei: apare cu km și cu «normă lipsă», pe listă.
9.3 Ce km se înmulțesc cu lei/km se scrie la §8, după «da»-ul lui Ion.

10. RAPOARTE ȘI CONTROL
10.1 [SE SCRIE ÎN FAZA 3]

11. TIMP LIBER ȘI BRAMBURA
11.1 [SE SCRIE ÎN FAZA 3]

12. INDICAȚII SĂPTĂMÂNALE PENTRU DISPECER
12.1 [SE SCRIE ÎN FAZA 3]$r$
  WHERE id = 'DRAXELMAIER_BALTI' AND reguli_livrare IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '404: reguli_livrare DRAXELMAIER_BALTI nu e NULL (sau uzina lipsește): % rânduri, nimic nu se scrie', n; END IF;
END
$$;

COMMIT;
