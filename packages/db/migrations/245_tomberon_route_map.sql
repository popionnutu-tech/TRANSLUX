-- 245_tomberon_route_map.sql
-- Mapare crm_routes.id -> WayID din DB-ul terminalului tomberon (special_db.waybills).
-- Nomenclatorul lor `ways` e GOL — numele rutelor trăiesc doar în aplicația
-- operatorului — dar WayID-ul din waybills corelează 96-100% cu cursele noastre
-- (verificat pe 21 zile / 1033 foi comune). Bootstrap: tomberon-sync.mjs --map
-- (WayID dominant per cursă, prag 80% și minim 3 apariții); restul manual.
-- Mai multe curse pot împărți același WayID (rutele rurale) -> fără UNIQUE pe way_id.
-- Acces doar service-role (RLS deny-all).

CREATE TABLE IF NOT EXISTS public.tomberon_route_map (
  crm_route_id integer PRIMARY KEY REFERENCES crm_routes(id) ON DELETE CASCADE,
  way_id integer NOT NULL,
  matched_by text NOT NULL DEFAULT 'waybill',   -- 'waybill' (bootstrap) / 'manual'
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tomberon_route_map ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.tomberon_route_map IS
  'Mapare crm_routes.id -> WayID folosit în special_db.waybills la terminalul cash-in. Populat de tomberon-sync.mjs --map.';
