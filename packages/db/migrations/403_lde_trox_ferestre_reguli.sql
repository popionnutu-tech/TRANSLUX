-- 403 — Trox Briceni: ferestrele de ceas din GPS + regulile de livrare SEBN aplicate la Trox și suburbanele Briceni (ION-73).
-- Ion, 25.09.2026: «aplică toate regulile de livrare de la SEBN aici … la Trox și [suburbane]» / «aplică regulile optimizare
-- SEBN la Trox și suburbane». Analiza e săptămânală, din GPS (VPS briceni/cod/saptamanal.sh → lde_analiza_reguli «BRICENI»),
-- nu din lde_route_run: calculul de noapte ia mașinile din lista statică de atribuiri, care la Trox e greșită.
-- De aceea livrare_validata RĂMÂNE false (altfel incarcaLivrare ar citi lde_route_run pe mașinile greșite).
-- Idempotentă: ferestrele se șterg și se pun din nou; textul se rescrie întreg. Fără funcții, fără GRANT.
BEGIN;

DELETE FROM lde_uzina_ferestre_ceas WHERE uzina_id = 'TROX_BRICENI';
INSERT INTO lde_uzina_ferestre_ceas (uzina_id, sens, shift_number, de_la_min, pana_la_min, sursa)
SELECT 'TROX_BRICENI', f.sens, f.sch, f.de, f.pana, 'GPS 16.06–24.09.2026 (ION-70/73)'
FROM (VALUES
  ('tur',   1, 270,  375),   -- sosire 04:30–06:15 (mediana 05:35)
  ('tur',   2, 750,  855),   -- sosire 12:30–14:15 (mediana 13:40)
  ('retur', 1, 830,  930),   -- plecare 13:50–15:30 (mediana 13:47)
  ('retur', 2, 1310, 1410)   -- plecare 21:50–23:30 (mediana 21:40)
) AS f(sens, sch, de, pana);

UPDATE lde_uzine SET reguli_livrare_la = now(), reguli_livrare = $r$REGULILE LIVRĂRII — TROX BRICENI + RUTELE SUBURBANE BRICENI (ION-73, 25.09.2026; regulile SEBN aplicate, Ion: «aplică regulile optimizare SEBN la Trox și suburbane»)

1. SURSE DE ADEVĂR
1.1 Cine lucrează și pe ce rută se vede din urma GPS, nu din liste (SEBN 1.1). Lista Trox din bază (lde_factory_route_vehicles: 073BRAO, 480BRAS, 281BRAT) NU e cine duce rutele: pe GPS T1 = 283YEK, T2 = 904BRAN/895BRAX, T3 = 054MLD/246BRAP/904BRAN/029BRAS, T4 = 319BRAT/285BRAT, T5 = 246BRAP, T6 = 532BRAO.
1.2 Trox și suburbanul au aceleași mașini și aceiași șoferi («dublu job»): ziua mașinii se analizează întreagă.
1.3 Rutele: Trox T1–T6 (denumirile din actul 08/2026); suburban 44–57 din nomenclatorul numărării (Coteala 1, 2, 3 = o rută).
1.4 Scheletul fix: ION-70 (VPS briceni/, artefactul «Scheletul Briceni»). Analiza: săptămânală, VPS briceni/cod/saptamanal.sh, luni 08:00, rândul «BRICENI» din lde_analiza_reguli. Calculul de noapte (lde_route_run) NU e sursa pentru Trox.

2. ORELE
2.1 Trox: schimbul 1 ~06:00–13:45, schimbul 2 ~14:00–21:45 (GPS); luni–vineri, sâmbăta rar, duminica aproape niciodată.
2.2 Predarea se face pe loc: la ~13:40 autobuzul aduce schimbul 2 și pleacă cu schimbul 1 din aceeași oprire la poartă.
2.3 Ziua de lucru ține 03:00 → 03:00 (ora locală).
2.4 Suburbanul merge după orarul din numărare (crm_route_schedules), cu cursele sat → gara Briceni.

3. TUR ȘI RETUR
3.1 TUR = aduce oameni la poartă (schimbul după ora SOSIRII); RETUR = duce oameni de la poartă (schimbul după ora PLECĂRII).
3.2 Ferestre Trox: tur S1 04:30–06:15 · tur S2 12:30–14:15 · retur S1 13:50–15:30 · retur S2 21:50–23:30 (lde_uzina_ferestre_ceas).
3.3 Returul cere ≥15 min la poartă; sub 15 min e «predare» și returul se ia de la poartă până la capătul rutei turului din acea zi.
3.4 Poarta Trox 48.34648 / 27.08318 (0,4 km); gara Briceni 48.357826 / 27.092106 (0,5 km), la 1,4 km una de alta — nu se amestecă.

4. RUTA ȘI CAPĂTUL
4.1 Ruta = de la capăt până la poartă (Trox) sau până la gară (suburban). Capătul = satul cel mai depărtat în care mașina a oprit sau s-a întors; o simplă trecere nu face capăt.
4.2 Drumurile reale diferite de nomenclator (53 din Medveja prin Larga, T2 prin Trestieni sau Mărcăuți) au scheletul lor (ION-70).

5. CATEGORII DE KM (tabela de precedență, un interval = o singură categorie)
5.1 CU OAMENI: cursele Trox pe rută, returul după predare, cursele suburbane din orar, cursele neprogramate sat → gară.
5.2 GOL PE RUTĂ: întoarcerea goală gară → sat între două curse din orar ale aceleiași rute. E a rutei, nu se optimizează.
5.3 LIVRARE = drumul mașinii de acasă (locul nopții) până la prima cursă, pe acasă între ture (≥20 min acasă) și de la ultima cursă înapoi acasă. Ion, 25.09: «întoarcere goală după finalizarea rutei = drum spre casă, dacă merge spre casă, dar trebuie de verificat să nu fie rută».
5.4 Verificarea «să nu fie rută»: un drum gol cu urcări (opriri 30 s – 5 min) în ≥2 sate ale rutei mașinii, care pleacă de la gară sau ajunge la gară ori poartă, e CURSĂ ÎN AFARA ORARULUI (cu oameni), nu livrare. Un drum care pornește de la poartă în afara ferestrelor de retur e gol.
5.5 LEGĂTURĂ = drumul dintre cele două joburi (poartă ↔ gară, capăt Trox ↔ sat suburban). E în bilanț, dar NU e economie: e impus de joburi.
5.6 SERVICE = drumul la Parcul Bălți. DEPLASARE = ieșire la peste 15 km de Briceni, de satele rutelor mașinii și de casă.
5.7 Zilele cu cursă interurbană (Chișinău ↔ nord) nu intră: țin de raportul rutelor interurbane.

6. BRAMBURA (SEBN §11.3)
6.1 În livrare, legătură și deplasare: km pe un drum (celule ~500 m) pe care mașina n-a mai mers în nicio altă zi a săptămânii; doar ≥5 km pe bucată. Se scade din categoria bucății. Steag la 50 km pe săptămână pe mașină.

7. UNDE DOARME MAȘINA
7.1 Locul nopții = cea mai lungă staționare între 20:00 și 05:00, noapte de noapte, din GPS. Livrarea de dimineață pornește de la locul nopții de dinainte, cea de seară merge spre locul nopții de după.

8. REGULA DE ECONOMIE
R1. Livrarea: șofer din satul de start sau mașina așteaptă la capăt între ture, nu acasă. Singura economie numărată; gol pe rută și legătură nu sunt economie.

9. COSTUL KM
lei/km = norma mașinii (l/100 km, lde_vehicle_norms/lde_vehicle_types) × prețul ANRE al zilei + reparație (1,50 la autobuz mare, 1,00 restul) + salariu 1,00. Economie = livrare netă × lei/km.

10. RAPOARTE
10.1 Săptămânal: /lde/reguli?uz=briceni — mașină cu mașină și rută cu rută, fiecare zi bucată cu bucată.
10.2 Posterul /api/cron/briceni-optimizari întoarce imaginea; în grupa livrărilor pleacă DOAR cu ?send=1, după «da»-ul lui Ion. Pe poster: doar km și lei, fără casă, fără locuri și ore, fără nume.$r$
WHERE id = 'TROX_BRICENI';

COMMIT;
