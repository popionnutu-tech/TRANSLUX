-- 435: registrul consumatorilor de combustibil + totalurile pe perioadă (ION-135)
-- (aplicată în Supabase pe 29.09 ca «434_lde_fuel_consumatori», la 7 minute după 434_lde_drax_plimbat_munca din altă sesiune — de aici 435)
--
-- Ion, 29.09.2026: «introdu toate datele la noi maximal detaliat până la ultima mașină» — «tot ce are descriere
-- unificată sau nr mașină». După ION-134 fiecare litru e fie pe o mașină din flotă (lde_fuel_alimentari +
-- lde_fuel_foaie), fie în lde_fuel_strain. În strain, aceeași destinație e scrisă în mai multe feluri
-- (VINZARI / VINZARE / VINZAREA, CONSUMINTE / CONSUMINTERN, PROTOCOL / PROTOCAL, GENERATOR / CENERATOR,
-- SUSILKA / SUSILCA), iar alături de plăcuțe stau vânzări, benzovoz (motorină mutată, nu consum), utilaje,
-- numere scurte de autobuz din 2010–2013 și nume de oameni/firme. Aici:
--   lde_fuel_cheie(placuta_norm)  — variantele unite într-o cheie;
--   lde_fuel_consumator_corectie  — corecții manuale (unire, denumire, tip) care bat regula;
--   lde_fuel_consumatori(de, pana) — câte o linie pe consumator străin, cu tipul;
--   lde_fuel_flota(de, pana)       — câte o linie pe FIECARE mașină din vehicles (și cele oprite).
-- «Descriere unificată» = cheie cu ≥ 4 alimentări pe tot istoricul; restul pagina le arată ca «izolate».
-- Pagina: /lde/combustibil. Nimic din vânzări/benzovoz nu intră în vehicles, deci consumul flotei rămâne curat.

CREATE OR REPLACE FUNCTION lde_fuel_cheie(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p ~ '^VINZ'          THEN 'VANZARI'
    WHEN p ~ '^CONSUMIN'      THEN 'CONSUM INTERN'
    WHEN p ~ '^PROTO'         THEN 'PROTOCOL'
    WHEN p ~ '^[CG]ENERATOR'  THEN 'GENERATOR'
    WHEN p ~ '^SUSIL'         THEN 'USCATOR'
    ELSE p
  END
$$;

CREATE TABLE IF NOT EXISTS lde_fuel_consumator_corectie (
  placuta_norm  text PRIMARY KEY,              -- cum vine din lde_fuel_strain.placuta_norm
  cheie         text,                          -- unește cu altă cheie (NULL = regula)
  denumire      text,                          -- nume afișat (NULL = cea mai frecventă scriere)
  tip           text CHECK (tip IN ('masina_foaie','masina_statie','numar_scurt','vanzare','benzovoz',
                                    'consum_intern','protocol','utilaj','nedefinit')),
  nota          text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE lde_fuel_consumator_corectie IS
  'Corecții manuale pentru registrul consumatorilor de combustibil (ION-135): unire de variante, denumire, tip.';
ALTER TABLE lde_fuel_consumator_corectie ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON lde_fuel_consumator_corectie FROM anon, authenticated;

-- Câte o linie pe consumator străin. randuri/litri = în perioada [de, pana]; *_total = tot istoricul.
CREATE OR REPLACE FUNCTION lde_fuel_consumatori(de date, pana date)
RETURNS TABLE (cheie text, denumire text, tip text, variante text[], surse text[],
               randuri bigint, litri numeric, randuri_total bigint, litri_total numeric, prima date, ultima date)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH s AS (
    SELECT s.*, COALESCE(c.cheie, lde_fuel_cheie(s.placuta_norm)) AS k
    FROM lde_fuel_strain s LEFT JOIN lde_fuel_consumator_corectie c ON c.placuta_norm = s.placuta_norm
  ), g AS (
    SELECT k,
      mode() WITHIN GROUP (ORDER BY placuta) AS den,
      array_agg(DISTINCT placuta_norm) AS var,
      array_agg(DISTINCT sursa) AS sur,
      count(*) FILTER (WHERE zi BETWEEN de AND pana) AS n,
      COALESCE(sum(litri) FILTER (WHERE zi BETWEEN de AND pana), 0) AS l,
      count(*) AS n_tot, sum(litri) AS l_tot, min(zi) AS mn, max(zi) AS mx,
      bool_or(sursa = 'foaie') AS pe_foaie, bool_and(categorie = 'masina') AS e_masina
    FROM s GROUP BY k
  )
  SELECT g.k,
    COALESCE(ct.denumire, g.den),
    COALESCE(ct.tip, CASE
      WHEN g.k = 'VANZARI'         THEN 'vanzare'
      WHEN g.k ~ '^BENZOVOZ'       THEN 'benzovoz'
      WHEN g.k = 'CONSUM INTERN'   THEN 'consum_intern'
      WHEN g.k = 'PROTOCOL'        THEN 'protocol'
      WHEN g.k IN ('GENERATOR','USCATOR','COMBINA','K700','T150','EXAVATOR','EXCAVATOR','TRACTOR','BULDOZER','MTZ') THEN 'utilaj'
      WHEN g.k ~ '^[0-9]{2,4}$'    THEN 'numar_scurt'
      WHEN g.e_masina AND g.pe_foaie THEN 'masina_foaie'
      WHEN g.e_masina              THEN 'masina_statie'
      ELSE 'nedefinit' END),
    g.var, g.sur, g.n, g.l, g.n_tot, g.l_tot, g.mn, g.mx
  FROM g
  LEFT JOIN LATERAL (SELECT c.denumire, c.tip FROM lde_fuel_consumator_corectie c
                     WHERE c.placuta_norm = ANY (g.var) AND (c.denumire IS NOT NULL OR c.tip IS NOT NULL)
                     ORDER BY c.updated_at DESC LIMIT 1) ct ON true
$$;

-- Câte o linie pe FIECARE mașină din vehicles (și cele oprite), cu benzol și foaie în perioada [de, pana].
CREATE OR REPLACE FUNCTION lde_fuel_flota(de date, pana date)
RETURNS TABLE (vehicle_id uuid, plate_number text, active boolean, is_lde boolean, directions text[],
               benzol_n bigint, benzol_l numeric, foaie_n bigint, foaie_l numeric, ultima date)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH b AS (
    SELECT a.vehicle_id, count(*) n, sum(a.litri) l, max((a.alimentat_at AT TIME ZONE 'Europe/Chisinau')::date) mx
    FROM lde_fuel_alimentari a
    WHERE a.alimentat_at >= (de::timestamp AT TIME ZONE 'Europe/Chisinau')
      AND a.alimentat_at <  ((pana + 1)::timestamp AT TIME ZONE 'Europe/Chisinau')
    GROUP BY a.vehicle_id
  ), f AS (
    SELECT f.vehicle_id, count(*) n, sum(f.litri) l, max(f.zi) mx
    FROM lde_fuel_foaie f WHERE f.zi BETWEEN de AND pana GROUP BY f.vehicle_id
  )
  SELECT v.id, v.plate_number, v.active, v.is_lde, v.directions,
    COALESCE(b.n, 0), COALESCE(b.l, 0), COALESCE(f.n, 0), COALESCE(f.l, 0), GREATEST(b.mx, f.mx)
  FROM vehicles v LEFT JOIN b ON b.vehicle_id = v.id LEFT JOIN f ON f.vehicle_id = v.id
$$;

-- Funcțiile noi sunt executabile de PUBLIC implicit (vezi migr. 355/356) — doar serverul panoului le cheamă.
REVOKE EXECUTE ON FUNCTION lde_fuel_cheie(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION lde_fuel_consumatori(date, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION lde_fuel_flota(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lde_fuel_cheie(text) TO service_role;
GRANT EXECUTE ON FUNCTION lde_fuel_consumatori(date, date) TO service_role;
GRANT EXECUTE ON FUNCTION lde_fuel_flota(date, date) TO service_role;
