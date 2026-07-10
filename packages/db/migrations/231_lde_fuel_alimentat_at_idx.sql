-- Raportul «Km & motorină» (km-zilnic pe perioadă) filtrează alimentările doar pe alimentat_at,
-- pe toată flota — indexurile existente au vehicle_id/driver_id în frunte și nu ajută → seq scan.
CREATE INDEX IF NOT EXISTS idx_lde_fuel_alimentari_at ON lde_fuel_alimentari (alimentat_at);
CREATE INDEX IF NOT EXISTS idx_lde_fuel_alimentari_cash_at ON lde_fuel_alimentari_cash (alimentat_at);
