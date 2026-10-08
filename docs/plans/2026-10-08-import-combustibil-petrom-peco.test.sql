DO $$
DECLARE
  va uuid := (SELECT id FROM vehicles WHERE plate_number='446ASB');
  vb uuid := (SELECT id FROM vehicles WHERE plate_number='388ASB');
  dr uuid := (SELECT id FROM drivers WHERE active LIMIT 1);
  z date := '2027-01-12'; i1 uuid; i2 uuid; t numeric; a numeric; st text;
  FUNCTION_DUMMY int;
BEGIN
  -- foi LDE fictive: A are 60 l pz_u + 40 l pz_cd în z; 100 l pz_u în z+3; 50 l pz_i în z+6 (fără tranzacție)
  INSERT INTO lde_fuel_foaie (vehicle_id, zi, litri, foaie, external_id, sofer) VALUES
    (va, z, 60, 'pz_u', 'test:f1', 'SOFER TEST'), (va, z, 40, 'pz_cd', 'test:f2', 'SOFER TEST'),
    (va, z+3, 100, 'pz_u', 'test:f3', 'SOFER TEST'), (va, z+6, 50, 'pz_i', 'test:f4', 'SOFER TEST'),
    (va, z+9, 70, 'pz_u', 'test:f5', 'ALT SOFER');
  -- portofel Intelect pe mașina A; portofel pe șofer cu numele din LDE
  INSERT INTO lde_fuel_portofel (sursa, cod, nume_fisier, tip, vehicle_id) VALUES ('intelect', 'T001', 'test', 'masina', va);
  INSERT INTO lde_fuel_portofel (sursa, cod, nume_fisier, tip, driver_id, nume_lde) VALUES ('intelect', 'T002', 'test', 'sofer', dr, 'Alt Șofer');
  -- import 1: 60 l în z (sparte 40+20), 60 l în z+3 la 23:50 din ziua z+2 (±1), 70 l portofel șofer în z+9
  PERFORM lde_fuel_import_aplica(jsonb_build_object('sursa','intelect','fisier_nume','t1','sha256','test-sha-1','de',z,'pana',z+9,'incarcat_de','test',
    'portofele','[]'::jsonb,
    'randuri', jsonb_build_array(
      jsonb_build_object('external_id','intelect:T001:a:1','cod','T001','alimentat_at',(z||' 08:00')::timestamp AT TIME ZONE 'Europe/Chisinau','zi_local',z,'litri',40,'statie','x','produs','Motorina EURO','este_dt',true),
      jsonb_build_object('external_id','intelect:T001:b:1','cod','T001','alimentat_at',(z||' 08:03')::timestamp AT TIME ZONE 'Europe/Chisinau','zi_local',z,'litri',20,'statie','x','produs','Motorina EURO','este_dt',true),
      jsonb_build_object('external_id','intelect:T001:c:1','cod','T001','alimentat_at',((z+2)||' 23:50')::timestamp AT TIME ZONE 'Europe/Chisinau','zi_local',z+2,'litri',60,'statie','x','produs','Motorina EURO','este_dt',true),
      jsonb_build_object('external_id','intelect:T002:d:1','cod','T002','alimentat_at',((z+9)||' 10:00')::timestamp AT TIME ZONE 'Europe/Chisinau','zi_local',z+9,'litri',70,'statie','x','produs','Motorina EURO','este_dt',true))));
  SELECT id INTO i1 FROM lde_fuel_import WHERE sha256='test-sha-1';

  -- 1) ziua z: foi 60 pz_u (acoperit de 60 Intelect) + 40 pz_cd (Petrom, neacoperit) + import 60 = 100
  SELECT coalesce(sum(litri),0) INTO t FROM lde_fuel_foaie_ef WHERE vehicle_id=va AND zi=z;
  SELECT coalesce(sum(litri),0) INTO a FROM lde_fuel_alimentari WHERE vehicle_id=va AND source='intelect' AND (alimentat_at AT TIME ZONE 'Europe/Chisinau')::date=z;
  IF t + a <> 100 THEN RAISE EXCEPTION 'T1: ziua z = % (foi % + import %), aștept 100', t+a, t, a; END IF;
  RAISE NOTICE 'ok 1: plin spart + altă sursă = 100 l';
  -- 2) z+3: foaie 100, import 60 (din z+2, ±1) → rest 40 pe foaie
  SELECT coalesce(sum(litri),0) INTO t FROM lde_fuel_foaie_ef WHERE vehicle_id=va AND zi=z+3;
  IF t <> 40 THEN RAISE EXCEPTION 'T2: rest foaie z+3 = %, aștept 40', t; END IF;
  RAISE NOTICE 'ok 2: acoperire parțială ±1 zi, rest 40';
  -- 3) z+6: pz_i fără tranzacție rămâne întreagă
  SELECT coalesce(sum(litri),0) INTO t FROM lde_fuel_foaie_ef WHERE vehicle_id=va AND zi=z+6;
  IF t <> 50 THEN RAISE EXCEPTION 'T3: pz_i = %, aștept 50', t; END IF;
  RAISE NOTICE 'ok 3: foaia fără fișier rămâne';
  -- 4) portofel pe șofer → foaia LDE a zilei (ALT SOFER pe A în z+9)
  SELECT stare INTO st FROM lde_fuel_import_rand WHERE external_id='intelect:T002:d:1';
  IF st <> 'legat' THEN RAISE EXCEPTION 'T4: stare %', st; END IF;
  RAISE NOTICE 'ok 4: șofer → foaia LDE';
  -- 5) foaia mutată pe B → re-legarea trece pe B
  UPDATE lde_fuel_foaie SET vehicle_id=vb WHERE external_id='test:f5';
  PERFORM lde_fuel_releaga(z, z+9); PERFORM lde_fuel_import_sincronizeaza(z, z+9);
  IF (SELECT vehicle_id FROM lde_fuel_alimentari WHERE source='intelect' AND external_id='intelect:T002:d:1') <> vb THEN RAISE EXCEPTION 'T5: nu a trecut pe B'; END IF;
  RAISE NOTICE 'ok 5: foaia mutată → legarea pe B';
  -- 6) agreat pe 2 mașini → de_legat
  INSERT INTO lde_agreare_sofer (luna, vehicle_id, driver_id, de, pana, sursa) VALUES (date_trunc('month', z)::date, va, dr, z, z+10, 'manual'), (date_trunc('month', z)::date, vb, dr, z, z+10, 'manual');
  PERFORM lde_fuel_rand_leaga('intelect:T002:d:1');
  SELECT stare INTO st FROM lde_fuel_import_rand WHERE external_id='intelect:T002:d:1';
  IF st <> 'de_legat' THEN RAISE EXCEPTION 'T6: stare %, aștept de_legat', st; END IF;
  RAISE NOTICE 'ok 6: agreat pe 2 mașini → de_legat';
  -- 7) import 2 suprapus (aceeași tranzacție a), anularea lui 1 → a rămâne activă
  PERFORM lde_fuel_import_aplica(jsonb_build_object('sursa','intelect','fisier_nume','t2','sha256','test-sha-2','de',z,'pana',z,'incarcat_de','test','portofele','[]'::jsonb,
    'randuri', jsonb_build_array(jsonb_build_object('external_id','intelect:T001:a:1','cod','T001','alimentat_at',(z||' 08:00')::timestamp AT TIME ZONE 'Europe/Chisinau','zi_local',z,'litri',40,'statie','x','produs','Motorina EURO','este_dt',true))));
  -- «E dublură» pe z+3 (restul 40 → 0)
  INSERT INTO lde_fuel_foaie_decizie (vehicle_id, zi, sursa, decis_de) VALUES (va, z+3, 'intelect', 'test');
  SELECT coalesce(sum(litri),0) INTO t FROM lde_fuel_foaie_ef WHERE vehicle_id=va AND zi=z+3;
  IF t <> 0 THEN RAISE EXCEPTION 'T7a: dublura nu scade, %', t; END IF;
  PERFORM lde_fuel_import_anuleaza(i1, 'test');
  IF NOT EXISTS (SELECT 1 FROM lde_fuel_alimentari WHERE source='intelect' AND external_id='intelect:T001:a:1') THEN RAISE EXCEPTION 'T7: tranzacția din 2 importuri a ieșit'; END IF;
  IF EXISTS (SELECT 1 FROM lde_fuel_alimentari WHERE source='intelect' AND external_id='intelect:T001:c:1') THEN RAISE EXCEPTION 'T7: tranzacția doar din importul anulat a rămas'; END IF;
  RAISE NOTICE 'ok 7: suprapunere + anulare corectă';
  -- 8) după anularea importului 1, ziua z+3 nu mai are import → «E dublură» inactivă, foaia revine la 100
  SELECT coalesce(sum(litri),0) INTO t FROM lde_fuel_foaie_ef WHERE vehicle_id=va AND zi=z+3;
  IF t <> 100 THEN RAISE EXCEPTION 'T8: foaia z+3 = %, aștept 100', t; END IF;
  RAISE NOTICE 'ok 8: dublura inactivă după anulare, foaia revine';
  -- 9) același fișier de două ori → refuz
  BEGIN
    PERFORM lde_fuel_import_aplica(jsonb_build_object('sursa','intelect','fisier_nume','t2','sha256','test-sha-2','de',z,'pana',z,'incarcat_de','test','portofele','[]'::jsonb,'randuri','[]'::jsonb));
    RAISE EXCEPTION 'T9: al doilea import a trecut';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'ok 9: fișier deja încărcat → refuz'; END;
  RAISE EXCEPTION 'ROLLBACK intenționat — toate testele au trecut';
END $$;
