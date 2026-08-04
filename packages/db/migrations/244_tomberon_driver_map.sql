-- 244_tomberon_driver_map.sql
-- Mapare drivers.id (uuid) -> special_db.drivers.DriverID (int) din DB-ul
-- terminalului tomberon (MS SQL). ID-urile există deja la terminal (377 șoferi);
-- maparea se bootstrapează automat din coincidența numerelor de foaie
-- (driver_cashin_receipts.receipt_nr = waybills.Waybill pe aceeași zi) —
-- tomberon-sync.mjs --map. Nepotrivirile rămase se completează manual.
-- Acces doar service-role (RLS deny-all, ca restul tabelelor LDE).

CREATE TABLE IF NOT EXISTS public.tomberon_driver_map (
  driver_id uuid PRIMARY KEY REFERENCES drivers(id) ON DELETE CASCADE,
  terminal_id integer NOT NULL UNIQUE,
  matched_by text NOT NULL DEFAULT 'waybill',   -- 'waybill' (bootstrap) / 'manual'
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tomberon_driver_map ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.tomberon_driver_map IS
  'Mapare drivers.id (uuid) -> special_db.drivers.DriverID (int) din DB-ul terminalului cash-in. Populat de tomberon-sync.mjs --map (bootstrap pe numere de foaie comune).';
