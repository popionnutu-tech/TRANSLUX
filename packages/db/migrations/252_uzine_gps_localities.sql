-- 252_uzine_gps_localities.sql
-- Verificarea GPS a atribuirilor de uzină compară opririle cu ORAȘUL uzinei, dar fabrica
-- se poate înregistra în altă localitate (SEBN Orhei → satul Bucuria: 661 opriri vs 17
-- în Orhei pe 10–12.08). Listă de localități SUPLIMENTARE acceptate per uzină, pe lângă
-- city (orașul se verifică întotdeauna — o greșeală în listă nu strică verificarea de bază).

ALTER TABLE lde_uzine
  ADD COLUMN IF NOT EXISTS gps_localities text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN lde_uzine.gps_localities IS
  'Localități GPS suplimentare acceptate la verificarea atribuirilor (pe lângă city)';

UPDATE lde_uzine SET gps_localities = '{Bucuria}' WHERE id = 'SEBN_ORHEI';
