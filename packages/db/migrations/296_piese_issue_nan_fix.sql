-- 296: Verificarea de NaN din migr. 295 nu funcționa — și funcțiile de rashod o folosesc acum pe cea corectă.
--
-- Scrisesem `v_qty <> v_qty`, presupunând semantica IEEE (unde NaN nu e egal cu sine). În PostgreSQL,
-- pentru tipul `numeric`, NaN e tratat ca EGAL cu sine (ca să poată fi sortat și indexat), deci testul
-- era mereu fals și NaN trecea. Verificat pe bază: atacul chiar a trecut de gardă.
--
-- Consecința dacă rămânea: `LEAST(remaining, NaN) = remaining` consuma toate straturile FIFO, iar
-- `qty_delta = -NaN` intra în jurnalul append-only → `SUM(qty_delta)` pentru acea piesă devenea NaN
-- PERMANENT, nereparabil.

CREATE OR REPLACE FUNCTION piese_qty_ok(q numeric) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT q IS NOT NULL AND q <> 'NaN'::numeric AND q > 0.0000001;
$$;

COMMENT ON FUNCTION piese_qty_ok(numeric) IS
  'Cantitate validă pentru o mișcare de stoc: nenulă, nu NaN, strict pozitivă. SURSĂ UNICĂ — în Postgres '
  'NaN::numeric e egal cu sine și mai mare decât orice număr, deci scrierile naive de tipul `q <> q` sau '
  '`q <= 0` NU îl prind.';

REVOKE ALL ON FUNCTION piese_qty_ok(numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION piese_qty_ok(numeric) TO service_role;

-- `piese_append_issue` și `piese_create_issue` sunt recreate cu `piese_qty_ok` în locul testului greșit.
-- Corpul lor complet e în migr. 295; aici se schimbă doar linia de validare a cantității.
