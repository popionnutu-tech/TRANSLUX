-- ============================================================================
-- MODUL LDE — index pe zi pentru lde_gps_stops.
--
-- Pagina /lde/km-zilnic (traseu «Fără direcție») citește toate opririle unei
-- zile: WHERE date=? ORDER BY vehicle_id, seq. UNIQUE-ul existent
-- (vehicle_id, date, seq) nu are `date` în frunte → parcurgere de index
-- întreagă (~40 ms azi, crește cu tabelul). Compozitul de mai jos face
-- range-scan îngust și satisface și ORDER BY.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_lde_gps_stops_date_veh_seq
  ON lde_gps_stops (date, vehicle_id, seq);
