-- 388: locul de trai al șoferului, ținut pe mașină
--
-- Ion, 23.09.2026: «bagă în nomenclator la mașină locul de trai» și «dacă el se schimbă —
-- apare alt șofer — schimb locul de trai».
--
-- Până acum satul unde doarme mașina exista doar ca observație: `lde_gps_stops.is_base`
-- spune unde a stat noaptea, zi de zi. E bun ca măsurătoare, dar nu ține loc de nomenclator
-- din trei motive:
--
--   1. Nu se poate corecta. Când mașina doarme o săptămână la service sau la alt șofer,
--      observația se mută și nimeni n-are unde scrie care e situația adevărată.
--   2. Nu spune de când. La schimbarea șoferului, km-ii de dinainte și de după se socotesc
--      din case diferite; fără o dată, nu se poate tăia corect nici măcar retroactiv.
--   3. Nu spune cine. «Doarme la Todirești» nu ajută dispecerul dacă nu știe care șofer.
--
-- Observația din GPS rămâne unde e și se arată ALĂTURI de valoarea declarată, în
-- nomenclatorul de mașini: când cele două se despart, asta e semnul că s-a schimbat omul.
-- Nimic nu se suprascrie automat — schimbarea o face omul, fiindcă doar el știe dacă e
-- vorba de un șofer nou sau de o noapte la reparație.

ALTER TABLE lde_vehicle_norms
  ADD COLUMN IF NOT EXISTS home_locality text,
  ADD COLUMN IF NOT EXISTS home_driver   text,
  ADD COLUMN IF NOT EXISTS home_since    date,
  ADD COLUMN IF NOT EXISTS home_note     text;

COMMENT ON COLUMN lde_vehicle_norms.home_locality IS
  'Satul unde locuiește șoferul mașinii — declarat, nu dedus. Drumul de acasă până la '
  'capătul rutei se socotește gol de aici. Observația din GPS stă în lde_gps_stops.is_base '
  'și se arată alături, ca diferența să se vadă când se schimbă omul.';
COMMENT ON COLUMN lde_vehicle_norms.home_driver IS
  'Șoferul de care ține locul de trai. Fără el, «doarme la Todirești» nu spune dispecerului cine.';
COMMENT ON COLUMN lde_vehicle_norms.home_since IS
  'De când e valabil. La schimbarea șoferului, km-ii de dinainte și de după se socotesc din '
  'case diferite; fără dată nu se poate tăia corect retroactiv.';
COMMENT ON COLUMN lde_vehicle_norms.home_note IS 'Notă liberă: reparație, înlocuire temporară, ce a spus omul.';

-- Funcțiile noi nu-s aici, dar tabelul primește coloane: drepturile rămân cele ale tabelei.
-- (Vezi nota din 355/356 — implicitul pentru anon e închis pe tabele.)
