-- ============================================================================
-- MODUL LDE — faza 2: seed data complet din interviuri
-- Surse:
--   /Users/ionpop/Downloads/Sinteza-interviuri-autopark.md
--   /Users/ionpop/Downloads/Interviu-proprietar-ala.md
--   analyst_full.txt (transcript interviu cu analistul)
-- Conține:
--   1. lde_vehicle_types  — 14 tipuri (12 pasageri + 2 camioane)
--   2. lde_uzine          — 5 fabrici
--   3. vehicles (UPSERT)  — toate plate-urile uzine din §2.1-2.5
--   4. lde_factory_routes + _shifts + _vehicles  — 110 curse uzine
--   5. lde_vehicle_norms  — 36 override-uri (§6.2)
--   6. drivers (UPSERT)   — 92 șoferi
--   7. lde_driver_extras  — 92 șoferi cu adresă + categorie salariu
--
-- Idempotent: ON CONFLICT DO NOTHING / DO UPDATE peste tot.
-- Categorii salariu LDE (din §2 Sinteza):
--   1=DAF uzine (8500 lei + 1.5 lei/km peste 6000 km)
--   2=Microbuze uzine (400 lei/zi + 1.2 lei/km peste 7000 km)
--   3=SEBN/LEAR cu pauză (8000-8500 fix)
--   4=Admin Bălți→SEBN (10000-13000 cu suplimente)
--   5=LEAR Florești (6500-8500 fix, fără km)
-- Cat 6 (suburban Trox dublu job) și cat 7 (interurban) NU se calculează aici
-- (vor trăi în modul «numarare» existent — vezi feedback Ion).
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. lde_vehicle_types — 14 tipuri (12 pasageri + 2 camioane)
-- ============================================================================
INSERT INTO lde_vehicle_types (id, display_name, category, norm_l_per_100km, norm_l_per_100km_loaded, passenger_seats, notes) VALUES
  ('SPRINTER_312', 'Sprinter 312', 'microbuz',     10.5, NULL, NULL, 'Norma de bază microbuz; consum scăzut'),
  ('SPRINTER_313', 'Sprinter 313', 'microbuz',     12.5, NULL, NULL, NULL),
  ('SPRINTER_315', 'Sprinter 315', 'microbuz',     12.5, NULL, NULL, NULL),
  ('SPRINTER_316', 'Sprinter 316', 'microbuz',     12.5, NULL, NULL, NULL),
  ('SPRINTER_412', 'Sprinter 412', 'microbuz',     12.8, NULL, NULL, NULL),
  ('SPRINTER_413', 'Sprinter 413', 'microbuz',     12.8, NULL, NULL, NULL),
  ('SPRINTER_515', 'Sprinter 515', 'autobuz_mic',  13.3, NULL, NULL, NULL),
  ('SPRINTER_516', 'Sprinter 516', 'autobuz_mic',  12.5, NULL, NULL, NULL),
  ('SPRINTER_518', 'Sprinter 518', 'autobuz_mic',  14.5, NULL, NULL, NULL),
  ('DAF',          'DAF',          'autobuz_mare', 28.5, NULL, NULL, 'Autobuz mare uzine; salariu cat 1'),
  ('CRAFTER',      'Crafter (VW)', 'microbuz',     13.5, NULL, NULL, NULL),
  ('FORD',         'Ford',         'microbuz',     12.0, NULL, NULL, NULL),
  ('CEREALE',      'Camion cereale','camion_marfa', 38.0, 42.0, NULL, 'Marfă: 38 gol / 42 încărcat'),
  ('CISTERNA',     'Camion cisternă','camion_marfa', 34.0, 38.0, NULL, 'Marfă: 34 gol / 38 încărcat')
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  category = EXCLUDED.category,
  norm_l_per_100km = EXCLUDED.norm_l_per_100km,
  norm_l_per_100km_loaded = EXCLUDED.norm_l_per_100km_loaded,
  notes = EXCLUDED.notes;

-- ============================================================================
-- 2. lde_uzine — 5 fabrici
-- ============================================================================
INSERT INTO lde_uzine (id, display_name, city, shift_pattern, shift1_time, shift2_time, shift3_time, works_saturday, works_sunday, notes) VALUES
  ('DRAXELMAIER_BALTI', 'Draxelmaier-Bălți', 'Bălți',
   'S1_S2_FIXED', '07:00-15:30', '15:30-00:00', NULL,
   true, false,
   '39 curse; schimburi fixe, nu se rotesc; sâmbătă la nevoie'),
  ('LEAR_UNGHENI', 'LEAR-Ungheni', 'Ungheni',
   'WEEKLY_ROTATION', '06:00-14:30', '14:30-23:00', '23:00-06:00',
   true, false,
   '30 curse (14 s1 + 16 s2); rotație săpt dim/seară; s3 la nevoie; unele mașini dedicate s2'),
  ('SEBN_ORHEI', 'SEBN-Orhei', 'Orhei',
   'S1_S2_S3_FIXED', '06:00-14:30', '14:30-23:00', '23:00-06:00',
   true, true,
   '27 curse; 1 șofer toate 3 turele/zi; excepții Peresecina (rotație săpt) + Cobilea (rotație 3 săpt); cu pauze'),
  ('TROX_BRICENI', 'Trox-Briceni', 'Briceni',
   'S1_S2_FIXED', '06:00-14:00', '14:00-22:00', '22:00-06:00',
   true, false,
   '6 curse; schimburi fixe; s3 la nevoie; aceiași 7 șoferi fac și suburban (cat 6, dublu job)'),
  ('LEAR_FLORESTI', 'LEAR Florești', 'Florești',
   'WEEKLY_ROTATION', '06:00-14:30', '14:30-23:00', NULL,
   true, false,
   '8 curse (4 s1 + 4 s2); rotație săpt; mașini SEPARATE de LEAR-Ungheni; fiecare autobuz 1 cursă s1 + 1 cursă s2')
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  city = EXCLUDED.city,
  shift_pattern = EXCLUDED.shift_pattern,
  shift1_time = EXCLUDED.shift1_time,
  shift2_time = EXCLUDED.shift2_time,
  shift3_time = EXCLUDED.shift3_time,
  works_saturday = EXCLUDED.works_saturday,
  works_sunday = EXCLUDED.works_sunday,
  notes = EXCLUDED.notes;

-- ============================================================================
-- 3. vehicles UPSERT — toate plate-urile menționate în curse + în normele §6.2
-- ============================================================================
INSERT INTO vehicles (plate_number, active) VALUES
  -- Draxelmaier-Bălți §2.1
  ('346KAJ', true), ('549RNK', true), ('397VKV', true), ('345KAJ', true),
  ('748IZX', true), ('917FTI', true), ('386PKP', true), ('447ASB', true),
  ('414ASB', true), ('457BRAX', true), ('441ASB', true), ('804MUM', true),
  ('880RNK', true), ('043BRAU', true), ('826GXP', true), ('024XKY', true),
  ('388ASB', true), ('350KAJ', true), ('144BRAZ', true), ('713IZX', true),
  ('348KAJ', true), ('830MUM', true), ('435ASB', true), ('041BRAU', true),
  ('206BZP', true), ('715IZX', true), ('302YEK', true), ('412BRAY', true),
  ('446ASB', true), ('224BZP', true), ('912RNK', true), ('760BXI', true),
  ('351KAJ', true), ('727CWN', true), ('731ARF', true), ('798LYY', true),
  ('146BRAZ', true), ('725CWN', true), ('744ARF', true),
  -- LEAR-Ungheni §2.2
  ('061COY', true), ('217RST', true), ('283BRAT', true), ('537BRAT', true),
  ('807MUM', true), ('458BRAX', true), ('783MUM', true), ('189OMM', true),
  ('032BRAT', true), ('732SHS', true), ('827MUM', true), ('725YOZ', true),
  ('504BRAR', true), ('456BRAX', true), ('738BRAZ', true), ('320BRAT', true),
  -- SEBN-Orhei §2.3
  ('142BRAZ', true), ('812MUM', true), ('319BRAT', true), ('372BRAY', true),
  ('042BRAU', true), ('522BRAT', true), ('503BRAR', true), ('823MUM', true),
  ('602BRAS', true), ('942BRAZ', true), ('284BRAT', true), ('893BRAX', true),
  ('360MLD', true), ('430CMX', true), ('795MUM', true), ('514BRAZ', true),
  ('541NPL', true), ('808MUM', true), ('314BRAZ', true), ('863MXL', true),
  ('739BRAZ', true), ('152BRAZ', true), ('239BZP', true), ('820GXP', true),
  ('552BRAO', true), ('861BRAS', true),
  -- Trox-Briceni §2.4
  ('073BRAO', true), ('480BRAS', true), ('895BRAX', true), ('904BRAN', true),
  ('281BRAT', true), ('246BRAP', true), ('532BRAO', true),
  -- LEAR Florești §2.5
  ('849BRAN', true), ('279BRAT', true), ('603BRAS', true), ('035BRAT', true),
  -- Norme §6.2 care nu apar în §2 (unele sunt în reparație sau interurban/suburban):
  ('210BZP', true), ('145BRAZ', true), ('710CWN', true), ('894BRAX', true),
  ('314BRAT', true), ('998TCP', true), ('239DQO', true), ('396SWL', true),
  ('735LYY', true)
ON CONFLICT (plate_number) DO NOTHING;

-- ============================================================================
-- 4. CURSE UZINE — lde_factory_routes + lde_factory_route_shifts + lde_factory_route_vehicles
-- ============================================================================
-- Helper CTE-uri vor fi inline pentru fiecare cursă pentru claritate.
-- Convenție: pentru cursele cu „X (total)" — pun totalul pe schimbul 1.
--             pentru cursele cu „A / B" — A=s1, B=s2.
--             pentru cursele cu 3 schimburi „A / B / C" — A=s1, B=s2, C=s3.
-- is_primary=true pentru primul autobuz menționat; secundare = false.

-- ── DRAXELMAIER-BĂLȚI (39 curse) ──
INSERT INTO lde_factory_routes (uzina_id, route_number, stops_in_order, total_passengers, has_shift1, has_shift2, has_shift3, rotation_note) VALUES
  ('DRAXELMAIER_BALTI',  1, 'Dondușeni → Tîrnova → Maramonovca → Mîndîc',                              19,   true, false, false, NULL),
  ('DRAXELMAIER_BALTI',  2, 'Stolniceni → Chiurt → Sofrîncani → Brătușeni',                            20,   true, false, false, NULL),
  ('DRAXELMAIER_BALTI',  3, 'Nicoreni → Rîșcani → Recea',                                              NULL, true, true,  false, NULL),
  ('DRAXELMAIER_BALTI',  4, 'Grinăuți → Singureni → Corlăteni',                                        NULL, true, true,  false, NULL),
  ('DRAXELMAIER_BALTI',  5, 'Aluniș → Recea → Sverdiac → Slobozia Recea',                              18,   true, false, false, NULL),
  ('DRAXELMAIER_BALTI',  6, 'Mihăilenii Vechi → Ochiul Alb',                                           25,   true, false, false, NULL),
  ('DRAXELMAIER_BALTI',  7, 'Ușurei → Răcăria',                                                        18,   true, false, false, NULL),
  ('DRAXELMAIER_BALTI',  8, 'Costești → Petrușeni → Șaptebani',                                        17,   true, false, false, NULL),
  ('DRAXELMAIER_BALTI',  9, 'Cobani → Hîjdieni → Glodeni',                                             NULL, true, true,  false, NULL),
  ('DRAXELMAIER_BALTI', 10, 'Ciuciulea → Clococenii Vechi → Cajba → Dușmani',                          NULL, true, true,  false, NULL),
  ('DRAXELMAIER_BALTI', 11, 'Limbenii Noi → Fundurii Noi → Fundurii Vechi → Sadovoe',                  55,   true, false, false, NULL),
  ('DRAXELMAIER_BALTI', 12, 'Sofia → Pelinia',                                                         NULL, true, true,  false, NULL),
  ('DRAXELMAIER_BALTI', 13, 'Dobruja Veche → Hasnașenii Noi → Dobruja → Lazo',                         NULL, true, true,  false, NULL),
  ('DRAXELMAIER_BALTI', 14, 'Gribova → Dominteni → Cubolta → Petreni → Hasnașenii Mari → Moara de Piatră', 61, true, false, false, NULL),
  ('DRAXELMAIER_BALTI', 15, 'Șuri → Chetrosu → Drochia → Țarigrad → Miciurin',                         45,   true, false, false, NULL),
  ('DRAXELMAIER_BALTI', 16, 'Florești → Vărvăreuca → sat. Mărculești',                                 NULL, true, true,  false, NULL),
  ('DRAXELMAIER_BALTI', 17, 'Prajila → Lunga → Bahrinești → Mărculești',                               NULL, true, true,  false, NULL),
  ('DRAXELMAIER_BALTI', 18, 'Zorojeni → Gura Căinarului → Putinești',                                  26,   true, false, false, NULL),
  ('DRAXELMAIER_BALTI', 19, 'Copăceni → Grigoreuca → Sîngerei → Bilicenii Vechi',                      NULL, true, true,  false, NULL),
  ('DRAXELMAIER_BALTI', 20, 'Nicolaevca → Drăgănești → Săcărovca → Izvoare → Rădoaia → Trifănești → Sîngereii Noi → Mărinești → Mîndreștii Noi', NULL, true, true, false, NULL),
  ('DRAXELMAIER_BALTI', 21, 'Heciul Nou → Grigorești → Biruința → Alexandreni → Elizaveta',            NULL, true, true,  false, 'comasare la nevoie cu cursa 22'),
  ('DRAXELMAIER_BALTI', 22, 'Tiplești → Tipletești → Heciul Vechi → Alexandreni',                      NULL, true, true,  false, 'comasare la nevoie cu cursa 21'),
  ('DRAXELMAIER_BALTI', 23, 'Scumpia → Măgureanca → Călugăr → Gara Fălești → Făleștii Noi → Fălești',  NULL, true, true,  false, NULL),
  ('DRAXELMAIER_BALTI', 24, 'Iscălău → Catranîc → Gara Catranîc',                                      16,   true, false, false, NULL),
  ('DRAXELMAIER_BALTI', 25, 'Hiliuți → Pîrlița',                                                       24,   true, false, false, NULL),
  ('DRAXELMAIER_BALTI', 26, 'Obreja Veche → Obreja Nouă → Ilenuța → Pînzăreni → Egorovca',             32,   true, false, false, NULL),
  ('DRAXELMAIER_BALTI', 27, 'Danu → Iabloana → Sturzovca → Sadovoe',                                   133,  true, false, false, NULL),
  ('DRAXELMAIER_BALTI', 28, 'Bălătina → Cuhnești → Movileni → Moara Domnească → Viișoara',             12,   true, false, false, NULL),
  ('DRAXELMAIER_BALTI', 29, 'Ustea → Limbenii Vechi → Petrunea',                                       22,   true, false, false, NULL),
  ('DRAXELMAIER_BALTI', 30, 'Coșernița → Hîrtop',                                                      12,   true, false, false, NULL),
  ('DRAXELMAIER_BALTI', 31, 'Cotiujenii Mari → Pohoarna',                                              15,   true, false, false, NULL),
  ('DRAXELMAIER_BALTI', 32, 'Căinarii Vechi → Bezeni → Izvoare → Frumușica → Trifănești → Alexandrovca → Ivanovca → Sevirova', 27, true, false, false, NULL),
  ('DRAXELMAIER_BALTI', 33, 'Ciuciueni → Iezăreni Vechi → Nicolaevca',                                 9,    true, false, false, NULL),
  ('DRAXELMAIER_BALTI', 34, 'Taura Veche → Chișcăreni → Slobozia Chișcăreni',                          49,   true, false, false, NULL),
  ('DRAXELMAIER_BALTI', 35, 'Cucioaia → Dumbrăvița → Chișcăreni → Slobozia Chișcăreni',                25,   true, false, false, NULL),
  ('DRAXELMAIER_BALTI', 36, 'Bocancea Schit → Coșcodeni → Bobletici',                                  22,   true, false, false, NULL),
  ('DRAXELMAIER_BALTI', 37, 'Logofteni → Moldovanca',                                                  7,    true, false, false, NULL),
  ('DRAXELMAIER_BALTI', 38, 'Glinjeni → Mărăndeni',                                                    15,   true, false, false, NULL),
  ('DRAXELMAIER_BALTI', 39, 'Popeștii de Jos → Popeștii de Sus → Zgurița',                             11,   true, false, false, NULL)
ON CONFLICT (uzina_id, route_number) DO NOTHING;

-- ── LEAR-UNGHENI (30 curse: 1-14 = s1; 15-30 = s2) ──
-- Notă: la LEAR-U un autobuz face o cursă pe s1 ȘI alta (alte localități) pe s2,
-- deci tratăm fiecare cursă (loc + schimb) ca route separat.
INSERT INTO lde_factory_routes (uzina_id, route_number, stops_in_order, total_passengers, has_shift1, has_shift2, has_shift3, rotation_note) VALUES
  -- Schimb 1 (route_number 1-14)
  ('LEAR_UNGHENI',  1, 'Pînzăreni → Ilenuța → Fălești → Zagarancea',                              18, true, false, false, NULL),
  ('LEAR_UNGHENI',  2, 'Hîncești → Călinești → Chetriș → Năvîrneț',                               19, true, false, false, NULL),
  ('LEAR_UNGHENI',  3, 'Risipeni → Bocșa → Izvoare → Blîndești',                                  19, true, false, false, NULL),
  ('LEAR_UNGHENI',  4, 'Scumpia → Hrubna',                                                        18, true, false, false, NULL),
  ('LEAR_UNGHENI',  5, 'Sculeni → Gherman → Călugăr → Fălești',                                   46, true, false, false, NULL),
  ('LEAR_UNGHENI',  6, 'Horești → Taxobeni → Floreni',                                            20, true, false, false, NULL),
  ('LEAR_UNGHENI',  7, 'Bulhac → Cioropcani → Florești → Stolniceni → Buciumeni',                 47, true, false, false, NULL),
  ('LEAR_UNGHENI',  8, 'Medeleni → Petrești → Semeni',                                            44, true, false, false, NULL),
  ('LEAR_UNGHENI',  9, 'Mănoilești → Vulpești → Rezina',                                          17, true, false, false, NULL),
  ('LEAR_UNGHENI', 10, 'Bălăurești → Zberoaia → Grozești → Frăsinești',                           18, true, false, false, NULL),
  ('LEAR_UNGHENI', 11, 'Măcărești → Costuleni → Valea Mare → Buzduganii de Jos → Dănuțeni',       43, true, false, false, NULL),
  ('LEAR_UNGHENI', 12, 'Sicovăț → Morenii Noi → Morenii Vechi → Ungheni Vento',                   16, true, false, false, NULL),
  ('LEAR_UNGHENI', 13, 'Măcărești → Costuleni → Ungheni',                                         17, true, false, false, NULL),
  ('LEAR_UNGHENI', 14, 'Cîrnești → Brătuleni → Morenii Noi → Buzduganii de Sus',                  20, true, false, false, NULL),
  -- Schimb 2 (route_number 15-30)
  ('LEAR_UNGHENI', 15, 'Negurenii Noi → Zăzulenii Noi → Zăzulenii Vechi → Agronomovca → Pîrlița școală → Pîrlița biserică → LEAR', 19, false, true, false, NULL),
  ('LEAR_UNGHENI', 16, 'Cetireni sat → Fabrica Biochimică → Polevaia → Ungheni Vale → Ungheni → LEAR', 18, false, true, false, NULL),
  ('LEAR_UNGHENI', 17, 'Sineștii Vechi → Sineștii Noi traseu → Boghenii Vechi → Boghenii Noi drum → Mircești → Bumbăta → LEAR', 18, false, true, false, NULL),
  ('LEAR_UNGHENI', 18, 'Coșeni → Țighira → Negurenii Vechi → Zăzulenii Vechi → LEAR',             17, false, true, false, NULL),
  ('LEAR_UNGHENI', 19, 'Chirileni → Bușila → LEAR',                                               47, false, true, false, NULL),
  ('LEAR_UNGHENI', 20, 'Todirești → Grăseni → Pîrlița stadion → LEAR',                            45, false, true, false, NULL),
  ('LEAR_UNGHENI', 21, 'Doltu → Sărata Veche → Șoltoaia → Pîrlița fermă → LEAR',                  16, false, true, false, NULL),
  ('LEAR_UNGHENI', 22, 'Unțești → Cetireni → Florițoaia Veche → Dănuțeni Moldova → Dănuțeni MRAO → LEAR', 46, false, true, false, NULL),
  ('LEAR_UNGHENI', 23, 'Sipoteni → Bahmut → Cornești sat → Cornești oraș → Romanovca → Pîrlița → LEAR', 19, false, true, false, 'autobuz dedicat doar s2'),
  ('LEAR_UNGHENI', 24, 'Grozasca → Grozasca Veche → Florițoaia Nouă → Fabrica Biochimică → Polevaia → Ungheni Vale → LEAR', 16, false, true, false, NULL),
  ('LEAR_UNGHENI', 25, 'Hîrcești → Mînzătești → Sineștii Noi Plopi → Zagarancea → Vasilica → Berești → LEAR', 20, false, true, false, NULL),
  ('LEAR_UNGHENI', 26, 'Rădenii Vechi → Alexeevca → LEAR',                                        46, false, true, false, NULL),
  ('LEAR_UNGHENI', 27, 'Teșcureni → Teșcureni sat vechi → Hristoforovca → LEAR',                  20, false, true, false, NULL),
  ('LEAR_UNGHENI', 28, 'Cornova → Năpădeni → Condrătești → Drujba → LEAR',                        18, false, true, false, 'autobuz dedicat doar s2 (320BRAT)'),
  ('LEAR_UNGHENI', 29, 'Ciolacul Vechi → Ciolacul Nou → Sărata Nouă → Făgădău → LEAR',            20, false, true, false, NULL),
  ('LEAR_UNGHENI', 30, 'Zagarancea → Vasilica → Berești → LEAR',                                  15, false, true, false, NULL)
ON CONFLICT (uzina_id, route_number) DO NOTHING;

-- ── SEBN-ORHEI (27 curse) ──
INSERT INTO lde_factory_routes (uzina_id, route_number, stops_in_order, total_passengers, has_shift1, has_shift2, has_shift3, rotation_note) VALUES
  ('SEBN_ORHEI',  1, 'Bălășești → SEBN MD',                                  NULL, true, true,  true,  NULL),
  ('SEBN_ORHEI',  2, 'Cișmea → Crihana → SEBN MD',                            NULL, true, true,  true,  NULL),
  ('SEBN_ORHEI',  3, 'Domulgeni → SEBN MD',                                   NULL, true, true,  true,  NULL),
  ('SEBN_ORHEI',  4, 'Florești → Cenușa → SEBN MD',                           NULL, true, true,  true,  NULL),
  ('SEBN_ORHEI',  5, 'Izvoare → SEBN MD',                                     NULL, true, true,  true,  NULL),
  ('SEBN_ORHEI',  6, 'Lopatna → SEBN MD',                                     NULL, true, true,  true,  NULL),
  ('SEBN_ORHEI',  7, 'Lalova → SEBN MD',                                      NULL, true, true,  true,  NULL),
  ('SEBN_ORHEI',  8, 'Lupoaica → SEBN MD (adm)',                              45,   true, false, false, 'curs administrativ 08:00-17:00; autobuz 823MUM face și cursa 11'),
  ('SEBN_ORHEI',  9, 'Mihailovca → SEBN MD',                                  NULL, true, true,  true,  NULL),
  ('SEBN_ORHEI', 10, 'Mîrzești → SEBN MD',                                    NULL, true, true,  true,  NULL),
  ('SEBN_ORHEI', 11, 'Nordic → Nistreana → SEBN MD',                          NULL, true, true,  true,  'autobuz 823MUM face și Lupoaica adm (cursa 8)'),
  ('SEBN_ORHEI', 12, 'Olișcani → SEBN MD',                                    NULL, true, true,  true,  NULL),
  ('SEBN_ORHEI', 13, 'Peresecina → SEBN MD',                                  12,   true, false, false, 'rotație săptămânală 3 schimburi'),
  ('SEBN_ORHEI', 14, 'Pohoarna → SEBN MD',                                    NULL, true, true,  true,  NULL),
  ('SEBN_ORHEI', 15, 'Cobilea → SEBN MD',                                     NULL, true, true,  true,  'rotație 3 săptămâni'),
  ('SEBN_ORHEI', 16, 'Rezina → SEBN MD',                                      NULL, true, true,  true,  NULL),
  ('SEBN_ORHEI', 17, 'Susleni → SEBN MD',                                     NULL, true, true,  true,  NULL),
  ('SEBN_ORHEI', 18, 'Telenești → SEBN MD',                                   NULL, true, true,  true,  NULL),
  ('SEBN_ORHEI', 19, 'Vadul-Leca → SEBN MD',                                  NULL, true, true,  true,  NULL),
  ('SEBN_ORHEI', 20, 'Vorotet → SEBN MD',                                     NULL, true, true,  true,  NULL),
  ('SEBN_ORHEI', 21, 'Clișova → Coropceni → Suhuluceni → SEBN MD (#1)',       NULL, true, true,  true,  'parallel cu cursa 22'),
  ('SEBN_ORHEI', 22, 'Clișova → Coropceni → Suhuluceni → SEBN MD (#2)',       NULL, true, true,  true,  'parallel cu cursa 21'),
  ('SEBN_ORHEI', 23, 'Bălți → SEBN MD (ADM)',                                 10,   true, false, false, 'curs administrativ 08:00-17:00'),
  ('SEBN_ORHEI', 24, 'Chișinău → SEBN MD (adm)',                              17,   true, false, false, 'curs administrativ 08:00-17:00; 239BZP la dus, 893BRAX la retur'),
  ('SEBN_ORHEI', 25, 'Vatici → SEBN MD',                                      NULL, true, true,  true,  '820GXP s1+s2; 552BRAO s3'),
  ('SEBN_ORHEI', 26, 'Vatici → SEBN MD (ADM)',                                16,   true, false, false, 'curs administrativ 08:00-17:00; 552BRAO (face și s3 din cursa 25)'),
  ('SEBN_ORHEI', 27, 'Cășunca → SEBN MD',                                     NULL, true, true,  true,  NULL)
ON CONFLICT (uzina_id, route_number) DO NOTHING;

-- ── TROX-BRICENI (6 curse) ──
INSERT INTO lde_factory_routes (uzina_id, route_number, stops_in_order, total_passengers, has_shift1, has_shift2, has_shift3, rotation_note) VALUES
  ('TROX_BRICENI', 1, 'Bulboaca → Trebisăuți → Briceni',                                                                       NULL, true, true,  false, NULL),
  ('TROX_BRICENI', 2, 'Trestieni → Halahora de Sus → Bălcăuți → Mărcăuți → Groznița → Briceni',                                NULL, true, true,  false, 'rotație săpt 480BRAS / 895BRAX'),
  ('TROX_BRICENI', 3, 'Criva → Drepcăuți → Lipcani → Slobozia Șireuți → Beleavineț → Berlineț → Caracușenii Noi → Briceni',    NULL, true, true,  false, NULL),
  ('TROX_BRICENI', 4, 'Larga → Cotiujeni → Briceni',                                                                           NULL, true, true,  false, NULL),
  ('TROX_BRICENI', 5, 'Coteala → Larga → Medveja → Berlineț → Beleavineț → Briceni',                                           NULL, true, true,  false, NULL),
  ('TROX_BRICENI', 6, 'Tețcani → Bălășinești → Beleavineț → Caracușenii Noi → Briceni',                                        10,   true, false, false, 'rotație săpt (1 schimb/zi)')
ON CONFLICT (uzina_id, route_number) DO NOTHING;

-- ── LEAR FLOREȘTI (8 curse: 1-4 = s1; 5-8 = s2) ──
INSERT INTO lde_factory_routes (uzina_id, route_number, stops_in_order, total_passengers, has_shift1, has_shift2, has_shift3, rotation_note) VALUES
  -- Schimb 1
  ('LEAR_FLORESTI', 1, 'Zaluceni → Vertiujeni → Temeleuți → Cernița → Coșernița → Hîrtop → LEAR Florești',                  19, true, false, false, NULL),
  ('LEAR_FLORESTI', 2, 'Unchitești → Cuhureștii de Sus → Cunicea → Pohoarna → Ghindești → LEAR Florești',                   20, true, false, false, NULL),
  ('LEAR_FLORESTI', 3, 'Tipilova → Radulenii Vechi → Vădeni → Alexeevca → LEAR Florești',                                   14, true, false, false, NULL),
  ('LEAR_FLORESTI', 4, 'Căinarii Vechi → Izvoare → Frumușica → Trifănești → Ivanovca → Gura Căinarului → LEAR Florești',    16, true, false, false, NULL),
  -- Schimb 2
  ('LEAR_FLORESTI', 5, 'Prajila → Lunga → Bahrinești → Mărculești → Florești → LEAR Florești',                              14, false, true, false, NULL),
  ('LEAR_FLORESTI', 6, 'Nicolaevca → Ciutulești → Roșietici → Roșieticii Vechi → Cenușa → Vărvăreuca → LEAR Florești',      17, false, true, false, NULL),
  ('LEAR_FLORESTI', 7, 'Vărăncău → Slobozia Cremene → Ciripcău → LEAR Florești',                                            20, false, true, false, NULL),
  ('LEAR_FLORESTI', 8, 'Soroca → LEAR Florești',                                                                            18, false, true, false, NULL)
ON CONFLICT (uzina_id, route_number) DO NOTHING;

-- ============================================================================
-- 4b. SHIFTS — câți pasageri pe fiecare schimb (per cursă)
-- ============================================================================
WITH r AS (
  SELECT id, uzina_id, route_number FROM lde_factory_routes
)
-- DRAXELMAIER shifts
INSERT INTO lde_factory_route_shifts (route_id, shift_number, passengers_count, notes)
SELECT r.id, s.shift_number, s.passengers_count, s.notes
FROM r, (VALUES
  -- ROUTE_NUMBER, SHIFT, PASSENGERS, NOTES
  ('DRAXELMAIER_BALTI',  1, 1, 19,   NULL::text),
  ('DRAXELMAIER_BALTI',  2, 1, 20,   NULL),
  ('DRAXELMAIER_BALTI',  3, 1, 56,   NULL),
  ('DRAXELMAIER_BALTI',  3, 2, 19,   NULL),
  ('DRAXELMAIER_BALTI',  4, 1, 37,   NULL),
  ('DRAXELMAIER_BALTI',  4, 2, 29,   NULL),
  ('DRAXELMAIER_BALTI',  5, 1, 18,   NULL),
  ('DRAXELMAIER_BALTI',  6, 1, 25,   NULL),
  ('DRAXELMAIER_BALTI',  7, 1, 18,   NULL),
  ('DRAXELMAIER_BALTI',  8, 1, 17,   NULL),
  ('DRAXELMAIER_BALTI',  9, 1, 39,   NULL),
  ('DRAXELMAIER_BALTI',  9, 2, 32,   NULL),
  ('DRAXELMAIER_BALTI', 10, 1, 23,   NULL),
  ('DRAXELMAIER_BALTI', 10, 2, 39,   NULL),
  ('DRAXELMAIER_BALTI', 11, 1, 55,   'total (2 autobuze)'),
  ('DRAXELMAIER_BALTI', 12, 1, 73,   NULL),
  ('DRAXELMAIER_BALTI', 12, 2, 72,   NULL),
  ('DRAXELMAIER_BALTI', 13, 1, 23,   NULL),
  ('DRAXELMAIER_BALTI', 13, 2, 19,   NULL),
  ('DRAXELMAIER_BALTI', 14, 1, 61,   'total (2 autobuze)'),
  ('DRAXELMAIER_BALTI', 15, 1, 45,   NULL),
  ('DRAXELMAIER_BALTI', 16, 1, 24,   NULL),
  ('DRAXELMAIER_BALTI', 16, 2, 19,   NULL),
  ('DRAXELMAIER_BALTI', 17, 1, 31,   NULL),
  ('DRAXELMAIER_BALTI', 17, 2, 50,   NULL),
  ('DRAXELMAIER_BALTI', 18, 1, 26,   NULL),
  ('DRAXELMAIER_BALTI', 19, 1, 68,   NULL),
  ('DRAXELMAIER_BALTI', 19, 2, 50,   NULL),
  ('DRAXELMAIER_BALTI', 20, 1, 36,   NULL),
  ('DRAXELMAIER_BALTI', 20, 2, 38,   NULL),
  ('DRAXELMAIER_BALTI', 21, 1, 79,   NULL),
  ('DRAXELMAIER_BALTI', 21, 2, 67,   NULL),
  ('DRAXELMAIER_BALTI', 22, 1, 33,   NULL),
  ('DRAXELMAIER_BALTI', 22, 2, 12,   NULL),
  ('DRAXELMAIER_BALTI', 23, 1, 41,   NULL),
  ('DRAXELMAIER_BALTI', 23, 2, 36,   NULL),
  ('DRAXELMAIER_BALTI', 24, 1, 16,   NULL),
  ('DRAXELMAIER_BALTI', 25, 1, 24,   NULL),
  ('DRAXELMAIER_BALTI', 26, 1, 32,   'total (2 autobuze)'),
  ('DRAXELMAIER_BALTI', 27, 1, 133,  'total (3 autobuze)'),
  ('DRAXELMAIER_BALTI', 28, 1, 12,   NULL),
  ('DRAXELMAIER_BALTI', 29, 1, 22,   NULL),
  ('DRAXELMAIER_BALTI', 30, 1, 12,   NULL),
  ('DRAXELMAIER_BALTI', 31, 1, 15,   NULL),
  ('DRAXELMAIER_BALTI', 32, 1, 27,   'total (2 autobuze)'),
  ('DRAXELMAIER_BALTI', 33, 1, 9,    NULL),
  ('DRAXELMAIER_BALTI', 34, 1, 49,   NULL),
  ('DRAXELMAIER_BALTI', 35, 1, 25,   NULL),
  ('DRAXELMAIER_BALTI', 36, 1, 22,   NULL),
  ('DRAXELMAIER_BALTI', 37, 1, 7,    NULL),
  ('DRAXELMAIER_BALTI', 38, 1, 15,   NULL),
  ('DRAXELMAIER_BALTI', 39, 1, 11,   NULL)
) AS s(uzina_id, route_number, shift_number, passengers_count, notes)
WHERE r.uzina_id = s.uzina_id AND r.route_number = s.route_number
ON CONFLICT (route_id, shift_number) DO NOTHING;

-- LEAR-UNGHENI shifts (s1: routes 1-14 → shift 1; s2: routes 15-30 → shift 2)
WITH r AS (
  SELECT id, uzina_id, route_number FROM lde_factory_routes
)
INSERT INTO lde_factory_route_shifts (route_id, shift_number, passengers_count, notes)
SELECT r.id, s.shift_number, s.passengers_count, s.notes
FROM r, (VALUES
  ('LEAR_UNGHENI',  1, 1, 18, NULL::text),
  ('LEAR_UNGHENI',  2, 1, 19, NULL),
  ('LEAR_UNGHENI',  3, 1, 19, NULL),
  ('LEAR_UNGHENI',  4, 1, 18, NULL),
  ('LEAR_UNGHENI',  5, 1, 46, NULL),
  ('LEAR_UNGHENI',  6, 1, 20, NULL),
  ('LEAR_UNGHENI',  7, 1, 47, NULL),
  ('LEAR_UNGHENI',  8, 1, 44, NULL),
  ('LEAR_UNGHENI',  9, 1, 17, NULL),
  ('LEAR_UNGHENI', 10, 1, 18, NULL),
  ('LEAR_UNGHENI', 11, 1, 43, NULL),
  ('LEAR_UNGHENI', 12, 1, 16, NULL),
  ('LEAR_UNGHENI', 13, 1, 17, NULL),
  ('LEAR_UNGHENI', 14, 1, 20, NULL),
  ('LEAR_UNGHENI', 15, 2, 19, NULL),
  ('LEAR_UNGHENI', 16, 2, 18, NULL),
  ('LEAR_UNGHENI', 17, 2, 18, NULL),
  ('LEAR_UNGHENI', 18, 2, 17, NULL),
  ('LEAR_UNGHENI', 19, 2, 47, NULL),
  ('LEAR_UNGHENI', 20, 2, 45, NULL),
  ('LEAR_UNGHENI', 21, 2, 16, NULL),
  ('LEAR_UNGHENI', 22, 2, 46, NULL),
  ('LEAR_UNGHENI', 23, 2, 19, NULL),
  ('LEAR_UNGHENI', 24, 2, 16, NULL),
  ('LEAR_UNGHENI', 25, 2, 20, NULL),
  ('LEAR_UNGHENI', 26, 2, 46, NULL),
  ('LEAR_UNGHENI', 27, 2, 20, NULL),
  ('LEAR_UNGHENI', 28, 2, 18, NULL),
  ('LEAR_UNGHENI', 29, 2, 20, NULL),
  ('LEAR_UNGHENI', 30, 2, 15, NULL)
) AS s(uzina_id, route_number, shift_number, passengers_count, notes)
WHERE r.uzina_id = s.uzina_id AND r.route_number = s.route_number
ON CONFLICT (route_id, shift_number) DO NOTHING;

-- SEBN-ORHEI shifts (3 shifts pe cursă, cu excepții adm + 13 + 15)
WITH r AS (
  SELECT id, uzina_id, route_number FROM lde_factory_routes
)
INSERT INTO lde_factory_route_shifts (route_id, shift_number, passengers_count, notes)
SELECT r.id, s.shift_number, s.passengers_count, s.notes
FROM r, (VALUES
  ('SEBN_ORHEI',  1, 1, 10, NULL::text), ('SEBN_ORHEI',  1, 2, 15, NULL), ('SEBN_ORHEI',  1, 3, 17, NULL),
  ('SEBN_ORHEI',  2, 1, 28, NULL),       ('SEBN_ORHEI',  2, 2, 34, NULL), ('SEBN_ORHEI',  2, 3, 25, NULL),
  ('SEBN_ORHEI',  3, 1, 8,  NULL),       ('SEBN_ORHEI',  3, 2, 17, NULL), ('SEBN_ORHEI',  3, 3, 19, NULL),
  ('SEBN_ORHEI',  4, 1, 12, NULL),       ('SEBN_ORHEI',  4, 2, 10, NULL), ('SEBN_ORHEI',  4, 3, 21, NULL),
  ('SEBN_ORHEI',  5, 1, 11, NULL),       ('SEBN_ORHEI',  5, 2, 23, NULL), ('SEBN_ORHEI',  5, 3, 18, NULL),
  ('SEBN_ORHEI',  6, 1, 16, NULL),       ('SEBN_ORHEI',  6, 2, 19, NULL), ('SEBN_ORHEI',  6, 3, 18, NULL),
  ('SEBN_ORHEI',  7, 1, 8,  NULL),       ('SEBN_ORHEI',  7, 2, 25, NULL), ('SEBN_ORHEI',  7, 3, 20, NULL),
  ('SEBN_ORHEI',  8, 1, 45, 'cursa adm 08:00-17:00'),
  ('SEBN_ORHEI',  9, 1, 16, NULL),       ('SEBN_ORHEI',  9, 2, 21, NULL), ('SEBN_ORHEI',  9, 3, 18, NULL),
  ('SEBN_ORHEI', 10, 1, 12, NULL),       ('SEBN_ORHEI', 10, 2, 14, NULL), ('SEBN_ORHEI', 10, 3, 17, NULL),
  ('SEBN_ORHEI', 11, 1, 46, NULL),       ('SEBN_ORHEI', 11, 2, 55, NULL), ('SEBN_ORHEI', 11, 3, 57, NULL),
  ('SEBN_ORHEI', 12, 1, 10, NULL),       ('SEBN_ORHEI', 12, 2, 9,  NULL), ('SEBN_ORHEI', 12, 3, 8,  NULL),
  ('SEBN_ORHEI', 13, 1, 12, 'rotație săpt 3 schimburi (analist nu a dat split pe schimburi — stocat ca total s1)'),
  ('SEBN_ORHEI', 14, 1, 13, NULL),       ('SEBN_ORHEI', 14, 2, 22, NULL), ('SEBN_ORHEI', 14, 3, 22, NULL),
  ('SEBN_ORHEI', 15, 1, 5,  NULL),       ('SEBN_ORHEI', 15, 2, 10, NULL), ('SEBN_ORHEI', 15, 3, 12, NULL),
  ('SEBN_ORHEI', 16, 1, 22, NULL),       ('SEBN_ORHEI', 16, 2, 23, NULL), ('SEBN_ORHEI', 16, 3, 30, NULL),
  ('SEBN_ORHEI', 17, 1, 9,  NULL),       ('SEBN_ORHEI', 17, 2, 17, NULL), ('SEBN_ORHEI', 17, 3, 11, NULL),
  ('SEBN_ORHEI', 18, 1, 19, NULL),       ('SEBN_ORHEI', 18, 2, 38, NULL), ('SEBN_ORHEI', 18, 3, 24, NULL),
  ('SEBN_ORHEI', 19, 1, 21, NULL),       ('SEBN_ORHEI', 19, 2, 30, NULL), ('SEBN_ORHEI', 19, 3, 30, NULL),
  ('SEBN_ORHEI', 20, 1, 14, NULL),       ('SEBN_ORHEI', 20, 2, 16, NULL), ('SEBN_ORHEI', 20, 3, 12, NULL),
  ('SEBN_ORHEI', 21, 1, 10, NULL),       ('SEBN_ORHEI', 21, 2, 10, NULL), ('SEBN_ORHEI', 21, 3, 14, NULL),
  ('SEBN_ORHEI', 22, 1, 13, NULL),       ('SEBN_ORHEI', 22, 2, 19, NULL), ('SEBN_ORHEI', 22, 3, 11, NULL),
  ('SEBN_ORHEI', 23, 1, 10, 'cursa adm 08:00-17:00'),
  ('SEBN_ORHEI', 24, 1, 17, 'cursa adm 08:00-17:00'),
  ('SEBN_ORHEI', 25, 1, 31, NULL),       ('SEBN_ORHEI', 25, 2, 24, NULL), ('SEBN_ORHEI', 25, 3, 15, NULL),
  ('SEBN_ORHEI', 26, 1, 16, 'cursa adm 08:00-17:00'),
  ('SEBN_ORHEI', 27, 1, 7,  NULL),       ('SEBN_ORHEI', 27, 2, 16, NULL), ('SEBN_ORHEI', 27, 3, 16, NULL)
) AS s(uzina_id, route_number, shift_number, passengers_count, notes)
WHERE r.uzina_id = s.uzina_id AND r.route_number = s.route_number
ON CONFLICT (route_id, shift_number) DO NOTHING;

-- TROX-BRICENI shifts (6 curse, majoritar 2 schimburi)
WITH r AS (
  SELECT id, uzina_id, route_number FROM lde_factory_routes
)
INSERT INTO lde_factory_route_shifts (route_id, shift_number, passengers_count, notes)
SELECT r.id, s.shift_number, s.passengers_count, s.notes
FROM r, (VALUES
  ('TROX_BRICENI', 1, 1, 16, NULL::text), ('TROX_BRICENI', 1, 2, 18, NULL),
  ('TROX_BRICENI', 2, 1, 15, NULL),       ('TROX_BRICENI', 2, 2, 9,  NULL),
  ('TROX_BRICENI', 3, 1, 10, NULL),       ('TROX_BRICENI', 3, 2, 20, NULL),
  ('TROX_BRICENI', 4, 1, 14, NULL),       ('TROX_BRICENI', 4, 2, 19, NULL),
  ('TROX_BRICENI', 5, 1, 16, NULL),       ('TROX_BRICENI', 5, 2, 18, NULL),
  ('TROX_BRICENI', 6, 1, 10, 'rotație săpt dim/seară (1 schimb/zi)')
) AS s(uzina_id, route_number, shift_number, passengers_count, notes)
WHERE r.uzina_id = s.uzina_id AND r.route_number = s.route_number
ON CONFLICT (route_id, shift_number) DO NOTHING;

-- LEAR-FLOREȘTI shifts (8 curse: 1-4 s1, 5-8 s2)
WITH r AS (
  SELECT id, uzina_id, route_number FROM lde_factory_routes
)
INSERT INTO lde_factory_route_shifts (route_id, shift_number, passengers_count, notes)
SELECT r.id, s.shift_number, s.passengers_count, s.notes
FROM r, (VALUES
  ('LEAR_FLORESTI', 1, 1, 19, NULL::text),
  ('LEAR_FLORESTI', 2, 1, 20, NULL),
  ('LEAR_FLORESTI', 3, 1, 14, NULL),
  ('LEAR_FLORESTI', 4, 1, 16, NULL),
  ('LEAR_FLORESTI', 5, 2, 14, NULL),
  ('LEAR_FLORESTI', 6, 2, 17, NULL),
  ('LEAR_FLORESTI', 7, 2, 20, NULL),
  ('LEAR_FLORESTI', 8, 2, 18, NULL)
) AS s(uzina_id, route_number, shift_number, passengers_count, notes)
WHERE r.uzina_id = s.uzina_id AND r.route_number = s.route_number
ON CONFLICT (route_id, shift_number) DO NOTHING;

-- ============================================================================
-- 4c. VEHICLES per shift — atribuire concretă autobuz pe cursă+schimb
-- ============================================================================
-- Convenție: primul autobuz menționat = is_primary=true; restul (aux/comasare) = false.
-- Schema garantează UN SINGUR primary pe route_shift_id prin uq_lde_factory_route_vehicles_primary.

-- DRAXELMAIER vehicles
WITH s AS (
  SELECT rs.id AS shift_id, r.uzina_id, r.route_number, rs.shift_number
  FROM lde_factory_route_shifts rs
  JOIN lde_factory_routes r ON r.id = rs.route_id
)
INSERT INTO lde_factory_route_vehicles (route_shift_id, vehicle_id, is_primary, rotation_note)
SELECT s.shift_id, v.id, x.is_primary, x.rotation_note
FROM s, vehicles v, (VALUES
  -- ('DRAXELMAIER_BALTI', route_number, shift, plate, primary, rotation_note)
  ('DRAXELMAIER_BALTI',  1, 1, '346KAJ', true,  NULL::text),
  ('DRAXELMAIER_BALTI',  2, 1, '549RNK', true,  NULL),
  ('DRAXELMAIER_BALTI',  3, 1, '397VKV', true,  NULL),
  ('DRAXELMAIER_BALTI',  3, 2, '345KAJ', true,  NULL),
  ('DRAXELMAIER_BALTI',  4, 1, '748IZX', true,  NULL),
  ('DRAXELMAIER_BALTI',  4, 2, '748IZX', true,  NULL),
  ('DRAXELMAIER_BALTI',  5, 1, '917FTI', true,  NULL),
  ('DRAXELMAIER_BALTI',  6, 1, '917FTI', true,  'același autobuz face și cursa 5 s1'),
  ('DRAXELMAIER_BALTI',  7, 1, '386PKP', true,  NULL),
  ('DRAXELMAIER_BALTI',  8, 1, '345KAJ', true,  NULL),
  ('DRAXELMAIER_BALTI',  9, 1, '447ASB', true,  NULL),
  ('DRAXELMAIER_BALTI',  9, 2, '397VKV', true,  NULL),
  ('DRAXELMAIER_BALTI', 10, 1, '414ASB', true,  NULL),
  ('DRAXELMAIER_BALTI', 10, 2, '414ASB', true,  NULL),
  ('DRAXELMAIER_BALTI', 11, 1, '457BRAX', true, NULL),
  ('DRAXELMAIER_BALTI', 11, 1, '441ASB', false, 'autobuz secundar pe aceeași cursă'),
  ('DRAXELMAIER_BALTI', 12, 1, '804MUM', true,  NULL),
  ('DRAXELMAIER_BALTI', 12, 1, '880RNK', false, 'autobuz secundar'),
  ('DRAXELMAIER_BALTI', 12, 2, '804MUM', true,  NULL),
  ('DRAXELMAIER_BALTI', 12, 2, '880RNK', false, 'autobuz secundar'),
  ('DRAXELMAIER_BALTI', 13, 1, '043BRAU', true, NULL),
  ('DRAXELMAIER_BALTI', 13, 2, '043BRAU', true, NULL),
  ('DRAXELMAIER_BALTI', 14, 1, '826GXP', true,  NULL),
  ('DRAXELMAIER_BALTI', 14, 1, '024XKY', false, 'autobuz secundar'),
  ('DRAXELMAIER_BALTI', 15, 1, '388ASB', true,  NULL),
  ('DRAXELMAIER_BALTI', 16, 1, '350KAJ', true,  NULL),
  ('DRAXELMAIER_BALTI', 16, 1, '144BRAZ', false,'autobuz secundar'),
  ('DRAXELMAIER_BALTI', 16, 2, '350KAJ', true,  NULL),
  ('DRAXELMAIER_BALTI', 16, 2, '144BRAZ', false,'autobuz secundar'),
  ('DRAXELMAIER_BALTI', 17, 1, '713IZX', true,  NULL),
  ('DRAXELMAIER_BALTI', 17, 2, '713IZX', true,  NULL),
  ('DRAXELMAIER_BALTI', 18, 1, '348KAJ', true,  NULL),
  ('DRAXELMAIER_BALTI', 19, 1, '830MUM', true,  NULL),
  ('DRAXELMAIER_BALTI', 19, 1, '435ASB', false, 'autobuz secundar'),
  ('DRAXELMAIER_BALTI', 19, 2, '830MUM', true,  NULL),
  ('DRAXELMAIER_BALTI', 19, 2, '435ASB', false, 'autobuz secundar'),
  ('DRAXELMAIER_BALTI', 20, 1, '041BRAU', true, NULL),
  ('DRAXELMAIER_BALTI', 20, 1, '206BZP', false, 'autobuz secundar'),
  ('DRAXELMAIER_BALTI', 20, 2, '041BRAU', true, NULL),
  ('DRAXELMAIER_BALTI', 20, 2, '206BZP', false, 'autobuz secundar'),
  ('DRAXELMAIER_BALTI', 21, 1, '715IZX', true,  'comasare la nevoie cu cursa 22'),
  ('DRAXELMAIER_BALTI', 21, 2, '715IZX', true,  'comasare la nevoie cu cursa 22'),
  ('DRAXELMAIER_BALTI', 22, 1, '302YEK', true,  NULL),
  ('DRAXELMAIER_BALTI', 22, 1, '412BRAY', false,'autobuz secundar s1'),
  ('DRAXELMAIER_BALTI', 22, 2, '826GXP', true,  'același autobuz face și cursa 14 s1'),
  ('DRAXELMAIER_BALTI', 23, 1, '446ASB', true,  NULL),
  ('DRAXELMAIER_BALTI', 23, 2, '446ASB', true,  NULL),
  ('DRAXELMAIER_BALTI', 24, 1, '224BZP', true,  NULL),
  ('DRAXELMAIER_BALTI', 25, 1, '912RNK', true,  NULL),
  ('DRAXELMAIER_BALTI', 26, 1, '760BXI', true,  NULL),
  ('DRAXELMAIER_BALTI', 26, 1, '351KAJ', false, 'autobuz secundar'),
  ('DRAXELMAIER_BALTI', 27, 1, '441ASB', true,  NULL),
  ('DRAXELMAIER_BALTI', 27, 1, '804MUM', false, 'autobuz secundar'),
  ('DRAXELMAIER_BALTI', 27, 1, '727CWN', false, 'autobuz secundar'),
  ('DRAXELMAIER_BALTI', 28, 1, '760BXI', true,  'același autobuz face și cursa 26'),
  ('DRAXELMAIER_BALTI', 29, 1, '457BRAX', true, 'același autobuz face și cursa 11'),
  ('DRAXELMAIER_BALTI', 30, 1, '731ARF', true,  NULL),
  ('DRAXELMAIER_BALTI', 31, 1, '798LYY', true,  NULL),
  ('DRAXELMAIER_BALTI', 32, 1, '302YEK', true,  'același autobuz face și cursa 22 s1'),
  ('DRAXELMAIER_BALTI', 32, 1, '146BRAZ', false,'autobuz secundar'),
  ('DRAXELMAIER_BALTI', 33, 1, '725CWN', true,  NULL),
  ('DRAXELMAIER_BALTI', 34, 1, '435ASB', true,  'același autobuz face și cursa 19'),
  ('DRAXELMAIER_BALTI', 35, 1, '912RNK', true,  'același autobuz face și cursa 25'),
  ('DRAXELMAIER_BALTI', 36, 1, '224BZP', true,  'același autobuz face și cursa 24'),
  ('DRAXELMAIER_BALTI', 37, 1, '351KAJ', true,  'același autobuz face și cursa 26'),
  ('DRAXELMAIER_BALTI', 38, 1, '744ARF', true,  NULL),
  ('DRAXELMAIER_BALTI', 39, 1, '024XKY', true,  'același autobuz face și cursa 14')
) AS x(uzina_id, route_number, shift_number, plate, is_primary, rotation_note)
WHERE s.uzina_id = x.uzina_id AND s.route_number = x.route_number AND s.shift_number = x.shift_number
  AND v.plate_number = x.plate
ON CONFLICT (route_shift_id, vehicle_id) DO NOTHING;

-- LEAR-UNGHENI vehicles
WITH s AS (
  SELECT rs.id AS shift_id, r.uzina_id, r.route_number, rs.shift_number
  FROM lde_factory_route_shifts rs
  JOIN lde_factory_routes r ON r.id = rs.route_id
)
INSERT INTO lde_factory_route_vehicles (route_shift_id, vehicle_id, is_primary, rotation_note)
SELECT s.shift_id, v.id, x.is_primary, x.rotation_note
FROM s, vehicles v, (VALUES
  -- Schimb 1 (route 1-14)
  ('LEAR_UNGHENI',  1, 1, '061COY', true, NULL::text),
  ('LEAR_UNGHENI',  2, 1, '217RST', true, NULL),
  ('LEAR_UNGHENI',  3, 1, '283BRAT', true, NULL),
  ('LEAR_UNGHENI',  4, 1, '537BRAT', true, NULL),
  ('LEAR_UNGHENI',  5, 1, '807MUM', true, NULL),
  ('LEAR_UNGHENI',  6, 1, '458BRAX', true, NULL),
  ('LEAR_UNGHENI',  7, 1, '783MUM', true, NULL),
  ('LEAR_UNGHENI',  8, 1, '189OMM', true, NULL),
  ('LEAR_UNGHENI',  9, 1, '032BRAT', true, NULL),
  ('LEAR_UNGHENI', 10, 1, '732SHS', true, NULL),
  ('LEAR_UNGHENI', 11, 1, '827MUM', true, NULL),
  ('LEAR_UNGHENI', 12, 1, '725YOZ', true, NULL),
  ('LEAR_UNGHENI', 13, 1, '504BRAR', true, NULL),
  ('LEAR_UNGHENI', 14, 1, '456BRAX', true, NULL),
  -- Schimb 2 (route 15-30)
  ('LEAR_UNGHENI', 15, 2, '537BRAT', true, NULL),
  ('LEAR_UNGHENI', 16, 2, '725YOZ', true, NULL),
  ('LEAR_UNGHENI', 17, 2, '032BRAT', true, NULL),
  ('LEAR_UNGHENI', 18, 2, '283BRAT', true, NULL),
  ('LEAR_UNGHENI', 19, 2, '807MUM', true, NULL),
  ('LEAR_UNGHENI', 20, 2, '783MUM', true, NULL),
  ('LEAR_UNGHENI', 21, 2, '061COY', true, NULL),
  ('LEAR_UNGHENI', 22, 2, '827MUM', true, NULL),
  ('LEAR_UNGHENI', 23, 2, '738BRAZ', true, 'autobuz dedicat doar s2'),
  ('LEAR_UNGHENI', 24, 2, '732SHS', true, NULL),
  ('LEAR_UNGHENI', 25, 2, '504BRAR', true, NULL),
  ('LEAR_UNGHENI', 26, 2, '189OMM', true, NULL),
  ('LEAR_UNGHENI', 27, 2, '456BRAX', true, NULL),
  ('LEAR_UNGHENI', 28, 2, '320BRAT', true, 'autobuz dedicat doar s2'),
  ('LEAR_UNGHENI', 29, 2, '217RST', true, NULL),
  ('LEAR_UNGHENI', 30, 2, '458BRAX', true, NULL)
) AS x(uzina_id, route_number, shift_number, plate, is_primary, rotation_note)
WHERE s.uzina_id = x.uzina_id AND s.route_number = x.route_number AND s.shift_number = x.shift_number
  AND v.plate_number = x.plate
ON CONFLICT (route_shift_id, vehicle_id) DO NOTHING;

-- SEBN-ORHEI vehicles (1 șofer = 1 autobuz pentru toate 3 turele)
WITH s AS (
  SELECT rs.id AS shift_id, r.uzina_id, r.route_number, rs.shift_number
  FROM lde_factory_route_shifts rs
  JOIN lde_factory_routes r ON r.id = rs.route_id
)
INSERT INTO lde_factory_route_vehicles (route_shift_id, vehicle_id, is_primary, rotation_note)
SELECT s.shift_id, v.id, x.is_primary, x.rotation_note
FROM s, vehicles v, (VALUES
  ('SEBN_ORHEI',  1, 1, '142BRAZ', true, NULL::text), ('SEBN_ORHEI',  1, 2, '142BRAZ', true, NULL), ('SEBN_ORHEI',  1, 3, '142BRAZ', true, NULL),
  ('SEBN_ORHEI',  2, 1, '812MUM',  true, NULL),       ('SEBN_ORHEI',  2, 2, '812MUM',  true, NULL), ('SEBN_ORHEI',  2, 3, '812MUM',  true, NULL),
  ('SEBN_ORHEI',  3, 1, '319BRAT', true, NULL),       ('SEBN_ORHEI',  3, 2, '319BRAT', true, NULL), ('SEBN_ORHEI',  3, 3, '319BRAT', true, NULL),
  ('SEBN_ORHEI',  4, 1, '372BRAY', true, NULL),       ('SEBN_ORHEI',  4, 2, '372BRAY', true, NULL), ('SEBN_ORHEI',  4, 3, '372BRAY', true, NULL),
  ('SEBN_ORHEI',  5, 1, '042BRAU', true, NULL),       ('SEBN_ORHEI',  5, 2, '042BRAU', true, NULL), ('SEBN_ORHEI',  5, 3, '042BRAU', true, NULL),
  ('SEBN_ORHEI',  6, 1, '522BRAT', true, NULL),       ('SEBN_ORHEI',  6, 2, '522BRAT', true, NULL), ('SEBN_ORHEI',  6, 3, '522BRAT', true, NULL),
  ('SEBN_ORHEI',  7, 1, '503BRAR', true, NULL),       ('SEBN_ORHEI',  7, 2, '503BRAR', true, NULL), ('SEBN_ORHEI',  7, 3, '503BRAR', true, NULL),
  ('SEBN_ORHEI',  8, 1, '823MUM',  true, 'autobuz face și cursa 11'),
  ('SEBN_ORHEI',  9, 1, '602BRAS', true, NULL),       ('SEBN_ORHEI',  9, 2, '602BRAS', true, NULL), ('SEBN_ORHEI',  9, 3, '602BRAS', true, NULL),
  ('SEBN_ORHEI', 10, 1, '942BRAZ', true, NULL),       ('SEBN_ORHEI', 10, 2, '942BRAZ', true, NULL), ('SEBN_ORHEI', 10, 3, '942BRAZ', true, NULL),
  ('SEBN_ORHEI', 11, 1, '823MUM',  true, 'autobuz face și Lupoaica adm cursa 8'),
  ('SEBN_ORHEI', 11, 2, '823MUM',  true, 'autobuz face și Lupoaica adm cursa 8'),
  ('SEBN_ORHEI', 11, 3, '823MUM',  true, 'autobuz face și Lupoaica adm cursa 8'),
  ('SEBN_ORHEI', 12, 1, '284BRAT', true, NULL),       ('SEBN_ORHEI', 12, 2, '284BRAT', true, NULL), ('SEBN_ORHEI', 12, 3, '284BRAT', true, NULL),
  ('SEBN_ORHEI', 13, 1, '893BRAX', true, 'rotație săpt'),
  ('SEBN_ORHEI', 14, 1, '360MLD',  true, NULL),       ('SEBN_ORHEI', 14, 2, '360MLD',  true, NULL), ('SEBN_ORHEI', 14, 3, '360MLD',  true, NULL),
  ('SEBN_ORHEI', 15, 1, '430CMX',  true, 'rotație 3 săpt'), ('SEBN_ORHEI', 15, 2, '430CMX',  true, 'rotație 3 săpt'), ('SEBN_ORHEI', 15, 3, '430CMX',  true, 'rotație 3 săpt'),
  ('SEBN_ORHEI', 16, 1, '795MUM',  true, NULL),       ('SEBN_ORHEI', 16, 2, '795MUM',  true, NULL), ('SEBN_ORHEI', 16, 3, '795MUM',  true, NULL),
  ('SEBN_ORHEI', 17, 1, '514BRAZ', true, NULL),       ('SEBN_ORHEI', 17, 2, '514BRAZ', true, NULL), ('SEBN_ORHEI', 17, 3, '514BRAZ', true, NULL),
  ('SEBN_ORHEI', 18, 1, '541NPL',  true, NULL),       ('SEBN_ORHEI', 18, 2, '541NPL',  true, NULL), ('SEBN_ORHEI', 18, 3, '541NPL',  true, NULL),
  ('SEBN_ORHEI', 19, 1, '808MUM',  true, NULL),       ('SEBN_ORHEI', 19, 2, '808MUM',  true, NULL), ('SEBN_ORHEI', 19, 3, '808MUM',  true, NULL),
  ('SEBN_ORHEI', 20, 1, '314BRAZ', true, NULL),       ('SEBN_ORHEI', 20, 2, '314BRAZ', true, NULL), ('SEBN_ORHEI', 20, 3, '314BRAZ', true, NULL),
  ('SEBN_ORHEI', 21, 1, '863MXL',  true, 'parallel cu cursa 22'), ('SEBN_ORHEI', 21, 2, '863MXL',  true, 'parallel cu cursa 22'), ('SEBN_ORHEI', 21, 3, '863MXL',  true, 'parallel cu cursa 22'),
  ('SEBN_ORHEI', 22, 1, '739BRAZ', true, 'parallel cu cursa 21'), ('SEBN_ORHEI', 22, 2, '739BRAZ', true, 'parallel cu cursa 21'), ('SEBN_ORHEI', 22, 3, '739BRAZ', true, 'parallel cu cursa 21'),
  ('SEBN_ORHEI', 23, 1, '152BRAZ', true, 'cursa adm'),
  ('SEBN_ORHEI', 24, 1, '239BZP',  true, 'la dus'),
  ('SEBN_ORHEI', 24, 1, '893BRAX', false,'la retur (face și cursa 13)'),
  ('SEBN_ORHEI', 25, 1, '820GXP',  true, NULL),
  ('SEBN_ORHEI', 25, 2, '820GXP',  true, NULL),
  ('SEBN_ORHEI', 25, 3, '552BRAO', true, NULL),
  ('SEBN_ORHEI', 26, 1, '552BRAO', true, 'face și s3 din cursa 25'),
  ('SEBN_ORHEI', 27, 1, '861BRAS', true, NULL),       ('SEBN_ORHEI', 27, 2, '861BRAS', true, NULL), ('SEBN_ORHEI', 27, 3, '861BRAS', true, NULL)
) AS x(uzina_id, route_number, shift_number, plate, is_primary, rotation_note)
WHERE s.uzina_id = x.uzina_id AND s.route_number = x.route_number AND s.shift_number = x.shift_number
  AND v.plate_number = x.plate
ON CONFLICT (route_shift_id, vehicle_id) DO NOTHING;

-- TROX-BRICENI vehicles
WITH s AS (
  SELECT rs.id AS shift_id, r.uzina_id, r.route_number, rs.shift_number
  FROM lde_factory_route_shifts rs
  JOIN lde_factory_routes r ON r.id = rs.route_id
)
INSERT INTO lde_factory_route_vehicles (route_shift_id, vehicle_id, is_primary, rotation_note)
SELECT s.shift_id, v.id, x.is_primary, x.rotation_note
FROM s, vehicles v, (VALUES
  ('TROX_BRICENI', 1, 1, '073BRAO', true, NULL::text),
  ('TROX_BRICENI', 1, 2, '073BRAO', true, NULL),
  ('TROX_BRICENI', 2, 1, '480BRAS', true, 'rotație săpt cu 895BRAX'),
  ('TROX_BRICENI', 2, 1, '895BRAX', false,'rotație săpt cu 480BRAS'),
  ('TROX_BRICENI', 2, 2, '480BRAS', true, 'rotație săpt cu 895BRAX'),
  ('TROX_BRICENI', 2, 2, '895BRAX', false,'rotație săpt cu 480BRAS'),
  ('TROX_BRICENI', 3, 1, '904BRAN', true, NULL),
  ('TROX_BRICENI', 3, 2, '904BRAN', true, NULL),
  ('TROX_BRICENI', 4, 1, '281BRAT', true, NULL),
  ('TROX_BRICENI', 4, 2, '281BRAT', true, NULL),
  ('TROX_BRICENI', 5, 1, '246BRAP', true, NULL),
  ('TROX_BRICENI', 5, 2, '246BRAP', true, NULL),
  ('TROX_BRICENI', 6, 1, '532BRAO', true, 'rotație săpt dim/seară')
) AS x(uzina_id, route_number, shift_number, plate, is_primary, rotation_note)
WHERE s.uzina_id = x.uzina_id AND s.route_number = x.route_number AND s.shift_number = x.shift_number
  AND v.plate_number = x.plate
ON CONFLICT (route_shift_id, vehicle_id) DO NOTHING;

-- LEAR-FLOREȘTI vehicles (fiecare autobuz face 1 cursă s1 + 1 cursă s2)
WITH s AS (
  SELECT rs.id AS shift_id, r.uzina_id, r.route_number, rs.shift_number
  FROM lde_factory_route_shifts rs
  JOIN lde_factory_routes r ON r.id = rs.route_id
)
INSERT INTO lde_factory_route_vehicles (route_shift_id, vehicle_id, is_primary, rotation_note)
SELECT s.shift_id, v.id, x.is_primary, x.rotation_note
FROM s, vehicles v, (VALUES
  ('LEAR_FLORESTI', 1, 1, '849BRAN', true, NULL::text),
  ('LEAR_FLORESTI', 2, 1, '279BRAT', true, NULL),
  ('LEAR_FLORESTI', 3, 1, '603BRAS', true, NULL),
  ('LEAR_FLORESTI', 4, 1, '035BRAT', true, NULL),
  ('LEAR_FLORESTI', 5, 2, '035BRAT', true, 'face și cursa 4 s1'),
  ('LEAR_FLORESTI', 6, 2, '849BRAN', true, 'face și cursa 1 s1'),
  ('LEAR_FLORESTI', 7, 2, '603BRAS', true, 'face și cursa 3 s1'),
  ('LEAR_FLORESTI', 8, 2, '279BRAT', true, 'face și cursa 2 s1')
) AS x(uzina_id, route_number, shift_number, plate, is_primary, rotation_note)
WHERE s.uzina_id = x.uzina_id AND s.route_number = x.route_number AND s.shift_number = x.shift_number
  AND v.plate_number = x.plate
ON CONFLICT (route_shift_id, vehicle_id) DO NOTHING;

-- ============================================================================
-- 5. lde_vehicle_norms — 36 override-uri din §6.2
-- ============================================================================
-- Toate cele 36 cazuri (inclusiv cele cu перерасход=0 — pentru transparență).
-- override_reason: 'verificare_norma' pentru cele cu перерасход=0 (consum confirmat);
--                  'actualizare_norma' pentru cele cu перерасход > 0 (consum mai mare);
--                  'reparatie_tehnica' pentru 145BRAZ (în reparație).

INSERT INTO lde_vehicle_norms (vehicle_id, vehicle_type_id, measured_consumption_l_per_100km, in_repair, override_reason, override_notes)
SELECT v.id, x.type_id, x.measured, x.in_repair, x.reason, x.notes
FROM vehicles v, (VALUES
  ('281BRAT', 'SPRINTER_312', 11.3, false, 'actualizare_norma',  'consum +0.8 vs normă tip'),
  ('319BRAT', 'SPRINTER_312', 12.2, false, 'actualizare_norma',  'consum +1.7 vs normă tip'),
  ('522BRAT', 'SPRINTER_312', 12.0, false, 'actualizare_norma',  'consum +1.5 vs normă tip'),
  ('602BRAS', 'SPRINTER_312', 12.0, false, 'actualizare_norma',  'consum +1.5 vs normă tip'),
  ('210BZP',  'SPRINTER_313', 12.5, false, 'verificare_norma',   'consum confirmat = normă'),
  ('798LYY',  'SPRINTER_315', 13.0, false, 'actualizare_norma',  'consum +0.5 vs normă tip'),
  ('217RST',  'SPRINTER_315', 12.5, false, 'verificare_norma',   'consum confirmat = normă'),
  ('863MXL',  'SPRINTER_315', 12.5, false, 'verificare_norma',   'consum confirmat = normă'),
  ('142BRAZ', 'SPRINTER_315', 13.5, false, 'actualizare_norma',  'consum +1.0 vs normă tip'),
  ('145BRAZ', 'SPRINTER_315', 13.5, true,  'reparatie_tehnica',  'consum +1.0; mașină în reparație'),
  ('710CWN',  'SPRINTER_316', 13.0, false, 'actualizare_norma',  'consum +0.5 vs normă tip'),
  ('725CWN',  'SPRINTER_316', 13.0, false, 'actualizare_norma',  'consum +0.5 vs normă tip'),
  ('727CWN',  'SPRINTER_316', 13.0, false, 'actualizare_norma',  'consum +0.5 vs normă tip'),
  ('711CWN',  'SPRINTER_316', 12.5, false, 'verificare_norma',   'consum confirmat = normă'),
  ('894BRAX', 'SPRINTER_412', 13.0, false, 'actualizare_norma',  'consum +0.2 vs normă tip'),
  ('283BRAT', 'SPRINTER_412', 12.8, false, 'verificare_norma',   'consum confirmat = normă'),
  ('893BRAX', 'SPRINTER_412', 13.0, false, 'actualizare_norma',  'consum +0.2 vs normă tip'),
  ('314BRAT', 'SPRINTER_412', 13.0, false, 'actualizare_norma',  'consum +0.2 vs normă tip'),
  ('284BRAT', 'SPRINTER_412', 13.0, false, 'actualizare_norma',  'consum +0.2 vs normă tip'),
  ('942BRAZ', 'SPRINTER_413', 13.0, false, 'actualizare_norma',  'consum +0.2 vs normă tip'),
  ('760BXI',  'SPRINTER_515', 14.5, false, 'actualizare_norma',  'consum +1.2 vs normă tip'),
  ('998TCP',  'SPRINTER_515', 13.3, false, 'verificare_norma',   'consum confirmat = normă'),
  ('239DQO',  'SPRINTER_516', 13.3, false, 'actualizare_norma',  'consum +0.8 vs normă tip'),
  ('396SWL',  'SPRINTER_516', 12.5, false, 'verificare_norma',   'consum confirmat = normă'),
  ('735LYY',  'SPRINTER_516', 12.5, false, 'verificare_norma',   'consum confirmat = normă'),
  ('503BRAR', 'SPRINTER_518', 15.2, false, 'actualizare_norma',  'consum +0.7 vs normă tip'),
  ('457BRAX', 'SPRINTER_518', 15.0, false, 'actualizare_norma',  'consum +0.5 vs normă tip'),
  ('549RNK',  'CRAFTER',      13.5, false, 'verificare_norma',   'consum confirmat = normă'),
  ('823MUM',  'DAF',          30.0, false, 'actualizare_norma',  'consum +1.5 vs normă tip (DAF SEBN)'),
  ('388ASB',  'DAF',          28.5, false, 'verificare_norma',   'consum confirmat = normă (DAF Drax)'),
  ('414ASB',  'DAF',          28.5, false, 'verificare_norma',   'consum confirmat = normă (DAF Drax)'),
  ('446ASB',  'DAF',          29.5, false, 'actualizare_norma',  'consum +1.0 vs normă tip (DAF Drax)'),
  ('447ASB',  'DAF',          29.5, false, 'actualizare_norma',  'consum +1.0 vs normă tip (DAF Drax)'),
  ('795MUM',  'DAF',          28.5, false, 'verificare_norma',   'consum confirmat = normă (DAF SEBN)'),
  ('715IZX',  'DAF',          29.5, false, 'actualizare_norma',  'consum +1.0 vs normă tip (DAF Drax)'),
  ('880RNK',  'DAF',          29.5, false, 'actualizare_norma',  'consum +1.0 vs normă tip (DAF Drax)')
) AS x(plate, type_id, measured, in_repair, reason, notes)
WHERE v.plate_number = x.plate
ON CONFLICT (vehicle_id) DO UPDATE SET
  vehicle_type_id = EXCLUDED.vehicle_type_id,
  measured_consumption_l_per_100km = EXCLUDED.measured_consumption_l_per_100km,
  in_repair = EXCLUDED.in_repair,
  override_reason = EXCLUDED.override_reason,
  override_notes = EXCLUDED.override_notes,
  updated_at = now();

-- ============================================================================
-- 6. drivers (UPSERT) — 92 șoferi din §5.1-5.5
-- Idempotent prin NOT EXISTS pe full_name (drivers.full_name nu e UNIQUE).
-- ============================================================================

-- Draxelmaier (40)
INSERT INTO drivers (full_name, active)
SELECT name, true FROM (VALUES
  ('Anita Vladimir'), ('Băbără Igor'), ('Balanici Gheorghe'), ('Bazareu Fiodor'),
  ('Bilici Ion'), ('Boghiu Grigore'), ('Bordian Marin'), ('Ciobanu Nicolae'),
  ('Crigan Veceslav'), ('Cucieru Sergei'), ('Cucoș Mihail'), ('Cupcia Grigorii'),
  ('Cutuniuc Victor'), ('Dervitchi Petru'), ('Dimitriu Nicolae'), ('Dolinta Constantin'),
  ('Dolinta Ion'), ('Dutca Boris'), ('Focșa Valentin'), ('Guzun Ivan'),
  ('Gvozdetchii Anatolie'), ('Iațco Mihail'), ('Jalbă Gheorghe'), ('Juncu Serafim'),
  ('Lungan Egor'), ('Matco Vasile'), ('Nasii Boris'), ('Neamtu Oleg'),
  ('Pascari Ion'), ('Perciun Nicolae'), ('Popovici Oleg'), ('Semenco Vasili'),
  ('Sîrbu Grigore'), ('Sotnikov Anatoli'), ('Șportac Tudor'), ('Stăvilă Igor'),
  ('Vilidniuc Tudor'), ('Vlas Igor'), ('Vleju Igor'), ('Vrabie Vasile'),
  -- LEAR-Ungheni (15)
  ('Andrieș Iurii'), ('Cernei Vasile'), ('Diminețu Victor'), ('Dîrvari Ion'),
  ('Frunză Iurie'), ('Glavan Ivan'), ('Grăchilă Mihail'), ('Gurghiș Petru'),
  ('Mihailovici Ștefan'), ('Păscari Ghenadie'), ('Reșetnic Iurii'), ('Rotaraș Vladimir'),
  ('Scutari Vasile'), ('Sînger Valeriu'), ('Ușurel Oleg'),
  -- SEBN-Orhei (26)
  ('Apostol Vitalie'), ('Arici Ion'), ('Caraiman Andrei'), ('Cociorvă Boris'),
  ('Cojocaru Feodor'), ('Copaci Mihail'), ('Covalschi Igor'), ('Cozma Alexandru'),
  ('Erhan Oleg'), ('Ermurachi Serghei'), ('Frumusache Nicolae'), ('Gondiu Grigore'),
  ('Ionescu Ștefan'), ('Lopatenco Ion'), ('Magalu Grigore'), ('Maliovanii Mihail'),
  ('Mărgineanu Ion'), ('Morcanu Valeriu'), ('Pangalos Simion'), ('Pătrașcu Trifan'),
  ('Saca Tudor'), ('Saharnean Andrei'), ('Șaptefrați Dionis'), ('Scurtu Nicolae'),
  ('Sochircă Vasile'), ('Vieru Ghenadie'),
  -- Trox-Briceni (7)
  ('Costaș Vitalie'), ('Crestianov Alexei'), ('Ganciar Roman'), ('Gusevatîi Anatolii'),
  ('Lavric Valeriu'), ('Tabarcea Viorel'), ('Tverdohleb Ivan'),
  -- LEAR Florești (4)
  ('Cojocaru Ion'), ('Gheorghiță Efim'), ('Rotaru Grigore'), ('Tesliuc Boris')
) AS n(name)
WHERE NOT EXISTS (SELECT 1 FROM drivers d WHERE d.full_name = n.name);

-- ============================================================================
-- 7. lde_driver_extras — 92 șoferi cu uzina + adresă + categorie LDE
-- ============================================================================
-- Categorii salariu LDE per uzina (din §2 Sinteza + decizia Ion):
--   Draxelmaier: 1=DAF (10 plate DAF), 2=microbuze (restul)
--   LEAR-Ungheni: 2 (microbuze)
--   SEBN-Orhei: 3 (8000-8500 fix; Scurtu Nicolae din Bălți → cat 4 administrativ)
--   Trox-Briceni: NULL (dublu job — salariu suburban va fi calculat în modul numarare cat 6)
--   LEAR-Florești: 5
-- Lista DAF-Draxelmaier (10 plate): 388ASB, 414ASB, 446ASB, 447ASB, 715IZX, 880RNK, 804MUM, 826GXP, 830MUM, 435ASB.
-- ATENȚIE: în interviu nu există o mapare șofer → mașină explicită pentru Draxelmaier-Bălți,
-- deci nu putem deduce algoritmic care 10 din cei 40 șoferi conduc DAF.
-- Soluție: toți cei 40 Draxelmaier primesc cat=2 (microbuze) by default; cei 10 conducători
-- DAF vor fi setați la cat=1 prin UI după ce admin atribuie șoferii la plate-uri DAF.
-- (alternativ: dacă ulterior se cunoaște lista, se rulează UPDATE cu nume concrete).

-- Draxelmaier (cat=2 default; admin va promova 10 la cat=1 DAF prin UI)
INSERT INTO lde_driver_extras (driver_id, uzina_id, home_address, lde_salary_category, notes)
SELECT d.id, x.uzina, x.addr, x.cat, x.notes
FROM drivers d, (VALUES
  ('Anita Vladimir',     'DRAXELMAIER_BALTI', 'Ciuciulea/Glodeni',         2, NULL::text),
  ('Băbără Igor',        'DRAXELMAIER_BALTI', 'Șuri/Drochia',              2, NULL),
  ('Balanici Gheorghe',  'DRAXELMAIER_BALTI', 'Glodeni',                   2, NULL),
  ('Bazareu Fiodor',     'DRAXELMAIER_BALTI', 'Drăgănești/Sîngerei',       2, NULL),
  ('Bilici Ion',         'DRAXELMAIER_BALTI', 'Hîjdieni/Glodeni',          2, NULL),
  ('Boghiu Grigore',     'DRAXELMAIER_BALTI', 'Ciuciulea/Glodeni',         2, NULL),
  ('Bordian Marin',      'DRAXELMAIER_BALTI', 'Șuri/Drochia',              2, NULL),
  ('Ciobanu Nicolae',    'DRAXELMAIER_BALTI', 'Catranîc/Fălești',          2, NULL),
  ('Crigan Veceslav',    'DRAXELMAIER_BALTI', 'Sîngerei',                  2, NULL),
  ('Cucieru Sergei',     'DRAXELMAIER_BALTI', 'Gura Căinarului/Florești',  2, NULL),
  ('Cucoș Mihail',       'DRAXELMAIER_BALTI', 'Sîngerei',                  2, NULL),
  ('Cupcia Grigorii',    'DRAXELMAIER_BALTI', 'Bălți',                     2, NULL),
  ('Cutuniuc Victor',    'DRAXELMAIER_BALTI', 'Sturzovca/Glodeni',         2, NULL),
  ('Dervitchi Petru',    'DRAXELMAIER_BALTI', 'Cotiujenii Mari',           2, NULL),
  ('Dimitriu Nicolae',   'DRAXELMAIER_BALTI', 'Rădoaia/Sîngerei',          2, NULL),
  ('Dolinta Constantin', 'DRAXELMAIER_BALTI', 'Chiurt/Edineț',             2, NULL),
  ('Dolinta Ion',        'DRAXELMAIER_BALTI', 'Pelenia/Drochia',           2, NULL),
  ('Dutca Boris',        'DRAXELMAIER_BALTI', 'Bălți',                     2, NULL),
  ('Focșa Valentin',     'DRAXELMAIER_BALTI', 'Dominteni/Drochia',         2, NULL),
  ('Guzun Ivan',         'DRAXELMAIER_BALTI', 'Zaicani/Rîșcani',           2, NULL),
  ('Gvozdetchii Anatolie','DRAXELMAIER_BALTI','Florești',                  2, NULL),
  ('Iațco Mihail',       'DRAXELMAIER_BALTI', 'Sturzovca/Glodeni',         2, NULL),
  ('Jalbă Gheorghe',     'DRAXELMAIER_BALTI', 'Hîjdieni/Glodeni',          2, NULL),
  ('Juncu Serafim',      'DRAXELMAIER_BALTI', 'Sărata-Veche/Fălești',      2, NULL),
  ('Lungan Egor',        'DRAXELMAIER_BALTI', 'Florești',                  2, NULL),
  ('Matco Vasile',       'DRAXELMAIER_BALTI', 'Petreni/Drochia',           2, NULL),
  ('Nasii Boris',        'DRAXELMAIER_BALTI', 'Sîngerei',                  2, NULL),
  ('Neamtu Oleg',        'DRAXELMAIER_BALTI', 'Căinarii Vechi',            2, NULL),
  ('Pascari Ion',        'DRAXELMAIER_BALTI', 'Heciul-Vechi/Sîngerei',     2, NULL),
  ('Perciun Nicolae',    'DRAXELMAIER_BALTI', 'Sevirova/Florești',         2, NULL),
  ('Popovici Oleg',      'DRAXELMAIER_BALTI', 'Țaul/Dondușeni',            2, NULL),
  ('Semenco Vasili',     'DRAXELMAIER_BALTI', 'Edineț',                    2, NULL),
  ('Sîrbu Grigore',      'DRAXELMAIER_BALTI', 'Fălești',                   2, NULL),
  ('Sotnikov Anatoli',   'DRAXELMAIER_BALTI', 'Bălți',                     2, NULL),
  ('Șportac Tudor',      'DRAXELMAIER_BALTI', 'Izvoare/Florești',          2, NULL),
  ('Stăvilă Igor',       'DRAXELMAIER_BALTI', 'Izvoare/Florești',          2, NULL),
  ('Vilidniuc Tudor',    'DRAXELMAIER_BALTI', 'Biruința',                  2, NULL),
  ('Vlas Igor',          'DRAXELMAIER_BALTI', 'Alexandrovca/Florești',     2, NULL),
  ('Vleju Igor',         'DRAXELMAIER_BALTI', 'Dumbrăvița/Sîngerei',       2, NULL),
  ('Vrabie Vasile',      'DRAXELMAIER_BALTI', 'Mihăileni/Rîșcani',         2, NULL),
  -- LEAR-Ungheni (15) — cat 2 (microbuze)
  ('Andrieș Iurii',      'LEAR_UNGHENI', 'Fălești',                        2, NULL),
  ('Cernei Vasile',      'LEAR_UNGHENI', 'Fălești',                        2, NULL),
  ('Diminețu Victor',    'LEAR_UNGHENI', 'Todirești/Ungheni',              2, NULL),
  ('Dîrvari Ion',        'LEAR_UNGHENI', 'Todirești/Ungheni',              2, NULL),
  ('Frunză Iurie',       'LEAR_UNGHENI', 'Fălești',                        2, NULL),
  ('Glavan Ivan',        'LEAR_UNGHENI', 'Sărata Veche/Fălești',           2, NULL),
  ('Grăchilă Mihail',    'LEAR_UNGHENI', 'Făleștii Noi',                   2, NULL),
  ('Gurghiș Petru',      'LEAR_UNGHENI', 'Mircești/Ungheni',               2, NULL),
  ('Mihailovici Ștefan', 'LEAR_UNGHENI', 'Gărești/Fălești',                2, NULL),
  ('Păscari Ghenadie',   'LEAR_UNGHENI', 'Călinești/Fălești',              2, NULL),
  ('Reșetnic Iurii',     'LEAR_UNGHENI', 'Ungheni',                        2, NULL),
  ('Rotaraș Vladimir',   'LEAR_UNGHENI', 'Todirești/Ungheni',              2, NULL),
  ('Scutari Vasile',     'LEAR_UNGHENI', 'Unțești/Ungheni',                2, NULL),
  ('Sînger Valeriu',     'LEAR_UNGHENI', 'Sărata Nouă/Fălești',            2, NULL),
  ('Ușurel Oleg',        'LEAR_UNGHENI', 'Ungheni',                        2, NULL),
  -- SEBN-Orhei (26) — cat 3 (8000-8500 fix); Scurtu Nicolae (Bălți) → cat 4 administrativ
  ('Apostol Vitalie',    'SEBN_ORHEI', 'Cazanești/Telenești',              3, NULL),
  ('Arici Ion',          'SEBN_ORHEI', 'Prodaneștii Vechi/Florești',       3, NULL),
  ('Caraiman Andrei',    'SEBN_ORHEI', 'Ciocîlteni/Orhei',                 3, NULL),
  ('Cociorvă Boris',     'SEBN_ORHEI', 'Cucuruzeni/Orhei',                 3, NULL),
  ('Cojocaru Feodor',    'SEBN_ORHEI', 'Pohoarna/Șoldănești',              3, NULL),
  ('Copaci Mihail',      'SEBN_ORHEI', 'Ciulucani/Telenești',              3, NULL),
  ('Covalschi Igor',     'SEBN_ORHEI', 'Lalova/Rezina',                    3, NULL),
  ('Cozma Alexandru',    'SEBN_ORHEI', 'Pohoarna/Șoldănești',              3, NULL),
  ('Erhan Oleg',         'SEBN_ORHEI', 'Camencea/Orhei',                   3, NULL),
  ('Ermurachi Serghei',  'SEBN_ORHEI', 'Susleni',                          3, NULL),
  ('Frumusache Nicolae', 'SEBN_ORHEI', 'Cotiujenii Mari/Șoldănești',       3, NULL),
  ('Gondiu Grigore',     'SEBN_ORHEI', 'Jora de Jos/Orhei',                3, NULL),
  ('Ionescu Ștefan',     'SEBN_ORHEI', 'Ciocîlteni/Orhei',                 3, NULL),
  ('Lopatenco Ion',      'SEBN_ORHEI', 'Sîngerei',                         3, NULL),
  ('Magalu Grigore',     'SEBN_ORHEI', 'Cucuruzenii de Jos',               3, NULL),
  ('Maliovanii Mihail',  'SEBN_ORHEI', 'Mihailovca/Sîngerei',              3, NULL),
  ('Mărgineanu Ion',     'SEBN_ORHEI', NULL,                               3, 'Adresă lipsă'),
  ('Morcanu Valeriu',    'SEBN_ORHEI', NULL,                               3, 'Adresă lipsă'),
  ('Pangalos Simion',    'SEBN_ORHEI', 'Susleni/Orhei',                    3, NULL),
  ('Pătrașcu Trifan',    'SEBN_ORHEI', 'Mîrzești/Orhei',                   3, NULL),
  ('Saca Tudor',         'SEBN_ORHEI', 'Rezina',                           3, NULL),
  ('Saharnean Andrei',   'SEBN_ORHEI', 'Pohrebeni/Orhei',                  3, NULL),
  ('Șaptefrați Dionis',  'SEBN_ORHEI', 'Olișcani/Șoldănești',              3, NULL),
  ('Scurtu Nicolae',     'SEBN_ORHEI', 'Bălți',                            4, 'Administrativ Bălți → SEBN (cat 4)'),
  ('Sochircă Vasile',    'SEBN_ORHEI', 'Florești',                         3, NULL),
  ('Vieru Ghenadie',     'SEBN_ORHEI', 'Cobilea/Șoldănești',               3, NULL),
  -- Trox-Briceni (7) — cat NULL (dublu job: salariu suburban va fi în modul numarare cat 6)
  ('Costaș Vitalie',     'TROX_BRICENI', 'Bălcăuți/Briceni',               NULL, 'Dublu job: uzina Trox + suburban (salariu cat 6 în modul numarare)'),
  ('Crestianov Alexei',  'TROX_BRICENI', 'Slobodca Șireuți/Briceni',       NULL, 'Dublu job: uzina Trox + suburban (salariu cat 6 în modul numarare)'),
  ('Ganciar Roman',      'TROX_BRICENI', 'Berlineț/Briceni',               NULL, 'Dublu job: uzina Trox + suburban (salariu cat 6 în modul numarare)'),
  ('Gusevatîi Anatolii', 'TROX_BRICENI', 'Bălășinești/Briceni',            NULL, 'Dublu job: uzina Trox + suburban (salariu cat 6 în modul numarare)'),
  ('Lavric Valeriu',     'TROX_BRICENI', 'Colicăuți/Briceni',              NULL, 'Dublu job: uzina Trox + suburban (salariu cat 6 în modul numarare)'),
  ('Tabarcea Viorel',    'TROX_BRICENI', 'Larga/Briceni',                  NULL, 'Dublu job: uzina Trox + suburban (salariu cat 6 în modul numarare)'),
  ('Tverdohleb Ivan',    'TROX_BRICENI', 'Trebisăuți/Briceni',             NULL, 'Dublu job: uzina Trox + suburban (salariu cat 6 în modul numarare)'),
  -- LEAR-Florești (4) — cat 5
  ('Cojocaru Ion',       'LEAR_FLORESTI', 'Cășunca',                       5, NULL),
  ('Gheorghiță Efim',    'LEAR_FLORESTI', 'Ghindești/Florești',            5, NULL),
  ('Rotaru Grigore',     'LEAR_FLORESTI', 'Bulboci/Soroca',                5, NULL),
  ('Tesliuc Boris',      'LEAR_FLORESTI', 'Florești',                      5, NULL)
) AS x(name, uzina, addr, cat, notes)
WHERE d.full_name = x.name
ON CONFLICT (driver_id) DO UPDATE SET
  uzina_id = EXCLUDED.uzina_id,
  home_address = EXCLUDED.home_address,
  lde_salary_category = EXCLUDED.lde_salary_category,
  notes = EXCLUDED.notes,
  updated_at = now();

-- ============================================================================
-- 8. lde_active_assignments — INTENȚIONAT GOL în seed.
-- ============================================================================
-- Atribuirea concretă șofer ↔ mașină ↔ cursă ↔ schimb se face de admin prin UI
-- după ce LDE Faza 3 (UI tabel atribuiri) va fi livrată.
-- Avem deja maparea autobuz ↔ cursă în lde_factory_route_vehicles. Lipsa este maparea
-- șofer ↔ autobuz (interviul nu a furnizat asta explicit pentru Draxelmaier-Bălți).

COMMIT;
