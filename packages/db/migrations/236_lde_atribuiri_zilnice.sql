-- ============================================================================
-- MODUL LDE — atribuiri zilnice vehicul→cursă (Mini App manageri).
--
-- Cerere Ion 13.07.2026: 2 manageri (fiecare cu direcțiile lui, configurabile)
-- introduc/corectează zilnic în Telegram Mini App ce mașină merge pe ce cursă.
-- Graficul la uzine e săptămânal (șablon; Trox exclus — doar zilnic); pe
-- parcurs managerul face schimbări proactive, iar a doua zi verificarea GPS
-- (worker nocturn 03:00 → lde_gps_stops) auto-confirmă ziua sau trimite push
-- pentru nepotriviri (corectare retroactivă sau confirmare manuală).
--
-- NU refolosim lde_daily_route_execution/lde_deviation_events (mig. 206) —
-- grain greșit (day×vehicle×shift, semantici km), mașină de statusuri proprie.
-- ============================================================================

-- Rol nou Telegram pentru managerii de direcții. NUME DIFERIT de admin_accounts
-- 'MANAGER' (= «Manager piese», alt sistem de conturi) — evităm coliziunea.
-- ATENȚIE: valoarea nouă NU se folosește nicăieri în această migrație
-- (restricția Postgres: enum-value adăugat nu poate fi referit în aceeași tranzacție).
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'MANAGER_LDE';

-- ── direcțiile fiecărui manager ─────────────────────────────────────────────
-- direction ∈ {'interurban','suburban', lde_uzine.id} (convenția migrației 217).
-- FK pe direction imposibil (mix de vocabular) — validare în aplicație.
CREATE TABLE IF NOT EXISTS lde_manager_directions (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction text NOT NULL,
  PRIMARY KEY (user_id, direction)
);
COMMENT ON TABLE lde_manager_directions IS 'Direcțiile (uzine + interurban/suburban) gestionate de fiecare manager (users.role=MANAGER_LDE). Editat din dashboard-ul web (ADMIN).';

-- ── șablonul săptămânal (doar curse de uzină) ───────────────────────────────
CREATE TABLE IF NOT EXISTS lde_weekly_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_route_id uuid NOT NULL REFERENCES lde_factory_routes(id) ON DELETE CASCADE,
  shift_number int NOT NULL CHECK (shift_number IN (1, 2, 3)),
  weekday int NOT NULL CHECK (weekday BETWEEN 1 AND 7),  -- ISO: 1=Luni … 7=Duminică
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (factory_route_id, shift_number, weekday)
);
COMMENT ON TABLE lde_weekly_template IS 'Șablonul săptămânal mașină per cursă×schimb×zi (doar uzine cu has_weekly_template). Materializat lazy în lde_atribuiri_zilnice; editările pe zile deja materializate NU se ating.';

-- ── atribuirea zilnică (snapshot + workflow de confirmare) ──────────────────
CREATE TABLE IF NOT EXISTS lde_atribuiri_zilnice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  direction text NOT NULL,                 -- lde_uzine.id | 'interurban' | 'suburban'
  route_kind text NOT NULL CHECK (route_kind IN ('uzina', 'interurban', 'suburban')),
  factory_route_id uuid REFERENCES lde_factory_routes(id) ON DELETE CASCADE,
  shift_number int CHECK (shift_number IN (1, 2, 3)),
  crm_route_id int REFERENCES crm_routes(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,   -- NULL = «de completat»
  status text NOT NULL DEFAULT 'planificat' CHECK (status IN
    ('planificat', 'modificat_proactiv', 'modificat_reactiv',
     'confirmat_auto', 'confirmat_manual', 'nepotrivire', 'fara_date_gps')),
  changed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  changed_at timestamptz,
  confirmed_at timestamptz,
  verification_note text,                  -- ex.: 'GPS: Bălți 06:41' / 'fără date GPS'
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (route_kind = 'uzina' AND factory_route_id IS NOT NULL AND shift_number IS NOT NULL AND crm_route_id IS NULL)
    OR (route_kind <> 'uzina' AND crm_route_id IS NOT NULL AND factory_route_id IS NULL AND shift_number IS NULL)
  )
);
COMMENT ON TABLE lde_atribuiri_zilnice IS 'Sursa de adevăr «în ziua D mașina V pe cursa R». Pentru interurban/suburban: write-through în daily_assignments DOAR ca UPDATE al rândurilor existente (niciodată INSERT — cron-ul 20:00 face SKIP dacă ziua are rânduri); tur→vehicle_id, retur→vehicle_id_retur, cu auto_copied=false la editare manuală.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_lde_atribuiri_uzina
  ON lde_atribuiri_zilnice (date, factory_route_id, shift_number) WHERE route_kind = 'uzina';
CREATE UNIQUE INDEX IF NOT EXISTS uq_lde_atribuiri_crm
  ON lde_atribuiri_zilnice (date, crm_route_id) WHERE route_kind <> 'uzina';
CREATE INDEX IF NOT EXISTS idx_lde_atribuiri_date_dir ON lde_atribuiri_zilnice (date, direction);

-- ── excepția Trox: fără șablon săptămânal (doar atribuire zilnică) ──────────
ALTER TABLE lde_uzine ADD COLUMN IF NOT EXISTS has_weekly_template boolean NOT NULL DEFAULT true;
UPDATE lde_uzine SET has_weekly_template = false WHERE id = 'TROX_BRICENI';

-- ── seed șablon din planul static existent (mașina primary per cursă×schimb) ─
-- Doar uzine cu șablon; sâmbăta/duminica doar unde uzina lucrează.
INSERT INTO lde_weekly_template (factory_route_id, shift_number, weekday, vehicle_id)
SELECT r.id, s.shift_number, wd.wd, v.vehicle_id
FROM lde_factory_route_vehicles v
JOIN lde_factory_route_shifts s ON s.id = v.route_shift_id
JOIN lde_factory_routes r ON r.id = s.route_id
JOIN lde_uzine u ON u.id = r.uzina_id AND u.has_weekly_template AND u.active
CROSS JOIN generate_series(1, 7) AS wd(wd)
WHERE v.is_primary
  AND (wd.wd <= 5 OR (wd.wd = 6 AND u.works_saturday) OR (wd.wd = 7 AND u.works_sunday))
ON CONFLICT (factory_route_id, shift_number, weekday) DO NOTHING;

-- ── RLS deny-all (acces doar service-role, ca 203/206/220) ──────────────────
ALTER TABLE lde_manager_directions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_weekly_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE lde_atribuiri_zilnice ENABLE ROW LEVEL SECURITY;
