-- 442: ION-144 — verificarea zilnică a traseului cisternelor față de scheletul ideal (ION-69/121).
-- Ion, 29.09: «bot care va verifica dacă auto merge pe traseu sau nu, zilnic verifică ziua de ieri».
-- Un rând pe fiecare drum încheiat (cu marfă, gol sau biodiesel), scris de VPS (camioane/cod/verifica-zi.mjs, service_role),
-- ORICUM, și pentru drumurile în regulă; panoul (/api/cron/camioane-traseu) trimite în grupa camioanelor doar abaterile.
CREATE TABLE IF NOT EXISTS lde_truck_route_checks (
  id          bigserial PRIMARY KEY,
  cheie       text NOT NULL UNIQUE,              -- placa | tip | începutul (ISO): rularea repetată rescrie același rând
  zi          date NOT NULL,                     -- ziua raportului = ziua (ora Moldovei) în care drumul s-a încheiat
  placa       text NOT NULL,
  vehicle_id  uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  tip         text NOT NULL CHECK (tip IN ('incarcata', 'goala', 'biodiesel')),
  de          text,
  pana        text,
  inceput     timestamptz NOT NULL,
  sfarsit     timestamptz NOT NULL,
  vama        text,                              -- vămile trecute, în ordine («Giurgiulești», «Otaci → Albița»)
  vama_ideala text,
  a2          boolean NOT NULL DEFAULT false,    -- urma a trecut pe lângă Fetești/Slobozia
  terminal    text,                              -- 'Vinița' | 'Zviahel' | NULL
  zel         boolean NOT NULL DEFAULT false,
  km_gps      numeric(8,1),
  km_ideal    numeric(8,1),
  km_plus     numeric(8,1),
  lei_plus    numeric(10,0),
  abateri     jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{cod, text, km}]
  ok          boolean NOT NULL,
  calculat_la timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lde_truck_route_checks_zi ON lde_truck_route_checks (zi);

COMMENT ON TABLE lde_truck_route_checks IS
  'ION-144: verificarea zilnică a traseului cisternelor față de scheletul ideal; scrie VPS-ul, citește /api/cron/camioane-traseu. Doar service_role.';

ALTER TABLE lde_truck_route_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE lde_truck_route_checks FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE lde_truck_route_checks_id_seq FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE lde_truck_route_checks TO service_role;
GRANT USAGE, SELECT ON SEQUENCE lde_truck_route_checks_id_seq TO service_role;
