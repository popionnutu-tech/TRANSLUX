-- 038_route_cancellations.sql
-- Marcare rute neefectuate pe o zi (dispecer bifeaza "cursa nu s-a efectuat").

CREATE TABLE IF NOT EXISTS public.route_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_route_id integer NOT NULL REFERENCES crm_routes(id) ON DELETE CASCADE,
  ziua date NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES admin_accounts(id),
  UNIQUE (crm_route_id, ziua)
);

CREATE INDEX IF NOT EXISTS idx_route_cancel_ziua ON route_cancellations(ziua);
