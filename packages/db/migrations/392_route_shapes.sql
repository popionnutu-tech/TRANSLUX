-- 392: linia pe drum a fiecărei rute interurbane (ION-43)
--
-- Ion, 23.09.2026, pe fereastra «Acum» de pe translux.md: «pune totuși linia de traseu
-- pe care merge mașina, fină să fie, și desenează busul cu ora care merge pe liniuță».
--
-- Opririle din crm_stop_fares au doar nume, fără coordonate. Scriptul route-shapes.mjs de
-- pe VPS le găsește în localitățile OSM (places-index), trece prin ele cu Valhalla (costing
-- bus) și scrie aici, o dată, linia rutei și opririle cu coordonate. Se reface la mână
-- când se schimbă opririle unei rute. Nu e istorie GPS: e drumul după opriri.

CREATE TABLE IF NOT EXISTS route_shapes (
  crm_route_id  integer PRIMARY KEY,
  -- [{stop_order, name, lat, lon}] — doar opririle găsite în OSM, în ordinea stop_order.
  stops         jsonb NOT NULL,
  -- [[lat, lon], ...] simplificat (Douglas–Peucker 30 m), în ordinea stop_order crescătoare.
  shape         jsonb NOT NULL,
  -- Numele opririlor negăsite, ca să se vadă ce lipsește din linie.
  missing       text[] NOT NULL DEFAULT '{}',
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE route_shapes IS
  'Linia pe drum a rutelor interurbane, din opririle crm_stop_fares găsite în OSM + Valhalla '
  '(route-shapes.mjs pe VPS). Citită de /api/asistent-site/acum pentru harta «Acum» (ION-43).';

ALTER TABLE route_shapes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON route_shapes FROM anon, authenticated;
