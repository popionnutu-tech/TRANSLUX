-- 061_route_retur_pairing.sql
-- Permite ca o rută A să folosească slot-ul de retur al unei alte rute B.
-- Convenția:
--   * crm_routes.retur_uses_route_id IS NULL  → rută A folosește slot-ul propriu de retur
--   * crm_routes.retur_uses_route_id = B.id   → rută A face turul propriu, apoi ia
--                                                slot-ul de retur al rutei B (time_chisinau,
--                                                stops cu hour_from_chisinau de la ruta B)
--   * crm_routes.retur_disabled = true        → rută A nu are retur (slot-ul propriu i-a
--                                                fost luat de altă rută; tur-ul rămâne
--                                                neperechiat până când operatorul îi atribuie
--                                                un slot de retur liber)

ALTER TABLE public.crm_routes
  ADD COLUMN IF NOT EXISTS retur_uses_route_id integer
    REFERENCES public.crm_routes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retur_disabled boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_crm_routes_retur_uses
  ON public.crm_routes(retur_uses_route_id);

-- Câmpurile pentru sesiunea de verificare: operatorul poate propune un swap
-- de slot retur (sau marcarea „fără retur"). NULL = nicio modificare propusă
-- pe această dimensiune.
ALTER TABLE public.route_check_submissions
  ADD COLUMN IF NOT EXISTS proposed_retur_uses_route_id integer
    REFERENCES public.crm_routes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proposed_retur_disabled boolean,
  ADD COLUMN IF NOT EXISTS retur_change_proposed boolean NOT NULL DEFAULT false;
