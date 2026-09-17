-- 361: Orele opririlor de autobuz, mutate cu 3 ore înainte — la ora când s-au întâmplat.
--
-- Trackerul autobuzelor ține `track.w_date` ca `timestamp without time zone` și pune UTC în el.
-- node-postgres citește ora „goală" ca oră LOCALĂ, iar VPS-ul e pe Europe/Chisinau, așa că
-- `gps-worker.mjs` scria fiecare oprire cu 3 ore mai devreme decât s-a întâmplat. Reparat în cod
-- (commit f97bd6d, `pg.types.setTypeParser(1114, …)`); migrația asta îndreaptă ce s-a scris până atunci.
--
-- Verificat pe viu, 17.09.2026:
--   · ultimul punct din tracker avea valoarea brută 08:55:17, când UTC real era 08:55:18;
--   · la Draxelmaier (schimburi 07:00/15:30/00:00) sosirile la poartă se strângeau la 03–04, 11–12, 19–21;
--     la Orhei (06:00/14:30/23:00) la 02, 10–11, 19 — peste tot exact minus 3;
--   · după reparație, mașina 414ASB pe 16.09 a ieșit 03:40 / 13:25 / 15:01 / 17:24 / 01:37, cu km
--     și `dwell_min` NESCHIMBATE față de importul vechi.
--
-- Se mută DOAR `arrival_at` și `departure_at`. Km-ii și `dwell_min` sunt diferențe, deci nu simt o
-- deplasare uniformă; `date` vine din linia de comandă a worker-ului, nu din timestamp; fereastra zilei
-- se taie server-side, pe `w_date` brut. Salariile NU se ating.
--
-- CAMIOANELE NU SE ATING. `lde_gps_stops` are doi scriitori: `gps-worker.mjs` (autobuze, din tracker) și
-- `wialon-worker.mjs` (camioane, din Wialon). Wialon dă epoch, deci orele camioanelor au fost corecte
-- dintotdeauna. Singura excepție — cele 44 de rânduri ale lui QDQ395 din 09–15.09, singurul camion care
-- are ȘI device pe tracker: recuperarea GPS din 17.09 a rulat doar `gps-worker`, care le-a rescris peste
-- cele bune. Acelea NU se repară aici, ci prin re-rularea lui `wialon-worker.mjs` pe zilele 09–15.09 —
-- sursa lor de adevăr e Wialon, nu o aritmetică pe ce a rămas în tabelă.
--
-- Rândurile atinse: 125.919 (154 de autobuze, 10.06–16.09.2026). Rândurile camioanelor: 7.124, neatinse.
--
-- Nu e idempotentă prin natura ei (o a doua aplicare ar adăuga încă 3 ore). Se bazează pe evidența
-- migrațiilor aplicate. De aceea marchează explicit ce a făcut, în `lde_audit_log`, și refuză să meargă
-- a doua oară dacă găsește marcajul.

DO $$
DECLARE
  v_camioane uuid[];
  v_atinse   bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM lde_audit_log WHERE action = 'migr_361_ore_gps_utc') THEN
    RAISE NOTICE 'migrația 361 a rulat deja — nu mai mut orele încă o dată';
    RETURN;
  END IF;

  -- Flota Wialon, după numărul de înmatriculare normalizat (așa o potrivește și wialon-worker.mjs).
  SELECT array_agg(v.id) INTO v_camioane
  FROM vehicles v
  WHERE upper(regexp_replace(v.plate_number, '[^A-Za-z0-9]', '', 'g')) IN (
    'ANT316','ANT341','ANT344','ANT347','BNQ069','BNQ076','BNQ085','BNQ088','BNQ091','DKE248',
    'GHT577','HMK127','HMK135','HMK139','HMK145','IIC230','IIC263','KWX620','KWX632','KYK692',
    'KYK742','KYK784','LJN076','LJN080','LML973','MOW214','MOW218','MWC069','QDQ348','QDQ357',
    'QDQ364','QDQ375','QDQ395','QDQ396','QDQ419','QDQ714','RWN169','RWN193','YJX724');

  IF coalesce(array_length(v_camioane, 1), 0) <> 39 THEN
    RAISE EXCEPTION 'așteptam 39 de camioane Wialon, am găsit %; nu ating nimic până nu se lămurește',
      coalesce(array_length(v_camioane, 1), 0);
  END IF;

  -- 414ASB pe 16.09 a fost reimportat deja cu worker-ul reparat (proba care a arătat 03:40/13:25/
  -- 15:01/17:24/01:37). Are deja orele bune — a doua deplasare l-ar strica.
  UPDATE lde_gps_stops s
     SET arrival_at   = arrival_at   + interval '3 hours',
         departure_at = departure_at + interval '3 hours'
   WHERE NOT (s.vehicle_id = ANY (v_camioane))
     AND NOT (s.date = DATE '2026-09-16'
              AND s.vehicle_id = (SELECT id FROM vehicles
                                   WHERE upper(regexp_replace(plate_number,'[^A-Za-z0-9]','','g')) = '414ASB'));

  GET DIAGNOSTICS v_atinse = ROW_COUNT;

  INSERT INTO lde_audit_log (action, entity, after_data, notes)
  VALUES ('migr_361_ore_gps_utc', 'lde_gps_stops',
          jsonb_build_object(
            'randuri_mutate', v_atinse,
            'deplasare', '+3 hours',
            'motiv', 'track.w_date e UTC, citit ca oră locală pe VPS (Europe/Chisinau)',
            'camioane_excluse', array_length(v_camioane, 1),
            'ramane_de_reimportat', 'QDQ395 09-15.09 prin wialon-worker.mjs'),
          'Marcaj de unicitate: migrația refuză să ruleze a doua oară dacă găsește rândul ăsta.');

  RAISE NOTICE 'mutate % rânduri de autobuz cu +3 ore', v_atinse;
END $$;
