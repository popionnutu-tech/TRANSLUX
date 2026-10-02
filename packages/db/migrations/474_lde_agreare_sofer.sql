-- ION-174 — Agrearea lunară a șoferilor pe mașinile de uzină (pagina /lde/agreare, pentru Clava)
--
-- Ion, 02.10.2026: «lunar Clava, în baza la locații, să poată agrea șoferii (în afară de mejgorod și
-- prigorod), sau dacă mai mulți șoferi au lucrat la uzină pe mașină, să adauge mai mulți șoferi» +
-- «trebuie să fie exact zilele sau perioada» + «de LDE trebuie să ne refuzăm». Deci numai datele noastre:
-- unde a dormit mașina în fiecare noapte (GPS, harta mașinii) și satul șoferului (lde_driver_extras);
-- unde nu se potrivesc sau mașina a dormit în mai multe sate, Clava agreează lunar, cu perioada fiecăruia.
--
-- 1) lde_noapte_zi — localitatea în care a început ziua mașina (= unde a dormit), din lde_harta_zi
--    (date->'iv'->0->>'de'), pe uzinele din harta mașinii. Scrie lde-geo-worker/noapte-worker.mjs, noaptea.
-- 2) lde_agreare_sofer — agrearea lunară: mașină × șofer × perioadă, confirmată de cine și când.
-- 3) rolul CONTABIL_LDE în admin_accounts (Clava vede doar /lde/agreare).
-- 4) o funcție de citire agregată (PostgREST taie la 1000 de rânduri): nopțile lunii pe mașină și zi.

CREATE TABLE IF NOT EXISTS lde_noapte_zi (
  plate        text NOT NULL,
  zi           date NOT NULL,
  uzina        text NOT NULL,                 -- cheia din lde_harta_zi (DRAXELMAIER, SEBN, LEAR_UNGHENI, LEAR_FLORESTI, BRICENI)
  loc          text NOT NULL,                 -- localitatea unde a început ziua = unde a dormit
  imported_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plate, zi)
);
COMMENT ON TABLE lde_noapte_zi IS
  'Unde a dormit mașina (localitatea din care a pornit ziua), din lde_harta_zi.date->iv->0->>de (ION-174). Import: lde-geo-worker/noapte-worker.mjs.';
ALTER TABLE lde_noapte_zi ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON lde_noapte_zi FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS lde_agreare_sofer (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  luna          date NOT NULL,                -- prima zi a lunii
  vehicle_id    uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  driver_id     uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  de            date NOT NULL,
  pana          date NOT NULL,
  sursa         text NOT NULL DEFAULT 'manual' CHECK (sursa IN ('noapte', 'atribuire', 'manual')),
  note          text,
  confirmat_la  timestamptz,
  confirmat_de  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (luna, vehicle_id, driver_id),
  CHECK (date_trunc('month', luna) = luna),
  CHECK (de <= pana),
  CHECK (de >= luna AND pana < luna + INTERVAL '1 month')
);
CREATE INDEX IF NOT EXISTS idx_lde_agreare_sofer_luna ON lde_agreare_sofer (luna, vehicle_id);
COMMENT ON TABLE lde_agreare_sofer IS
  'Agrearea lunară a șoferilor pe mașinile de uzină: cine a lucrat pe mașină și în ce perioadă a lunii (ION-174, pagina /lde/agreare). '
  'Nu rescrie lde_active_assignments.';
ALTER TABLE lde_agreare_sofer ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON lde_agreare_sofer FROM anon, authenticated;

-- Rolul CONTABIL_LDE (Clava): doar pagina de agreare. Lista e oglinda AdminRole din packages/db/src/types.ts.
ALTER TABLE admin_accounts DROP CONSTRAINT IF EXISTS admin_accounts_role_check;
ALTER TABLE admin_accounts ADD CONSTRAINT admin_accounts_role_check CHECK (role = ANY (ARRAY[
  'ADMIN', 'DISPATCHER', 'GRAFIC', 'OPERATOR_CAMERE', 'ADMIN_CAMERE', 'EVALUATOR_INCASARI', 'CONTABIL', 'DEPOZITAR',
  'VINZATOR', 'MANAGER', 'GESTIONAR', 'UZINE', 'DISPECER', 'OBSERVATOR', 'CONTABIL_LDE'
]::text[]));

-- Nopțile lunii: fiecare mașină × localitate cu zilele (numărul zilei în lună) în care a dormit acolo
CREATE OR REPLACE FUNCTION lde_agreare_nopti(p_luna date)
RETURNS TABLE (plate text, loc text, zile int[])
LANGUAGE sql STABLE AS $$
  SELECT n.plate, n.loc,
         array_agg(DISTINCT EXTRACT(DAY FROM n.zi)::int ORDER BY EXTRACT(DAY FROM n.zi)::int)
  FROM lde_noapte_zi n
  WHERE n.zi >= date_trunc('month', p_luna)::date
    AND n.zi <  (date_trunc('month', p_luna) + INTERVAL '1 month')::date
  GROUP BY n.plate, n.loc
$$;
REVOKE EXECUTE ON FUNCTION lde_agreare_nopti(date) FROM PUBLIC, anon, authenticated;
