-- 095_normalize_time_zero_pad.sql
-- Normalizează orele stocate ca text: ora de o singură cifră primește zero în față
-- ("6:17" → "06:17", "03:00 - 7:10" → "03:00 - 07:10"). Pur cosmetic (aceeași oră),
-- ca să apară corect peste tot (grafic, site public, bot), nu doar prin parseTimeLabel.
--
-- Atinge: crm_routes.time_nord / time_chisinau (interval "H:MM - HH:MM", ambele ore),
--         crm_stop_fares.hour_from_nord / hour_from_chisinau (valoare unică "H:MM").
-- trips.departure_time NU se atinge (0 valori cu o cifră; oricum e TIME-like).
--
-- Regex: padează doar ora de o cifră la început de string sau după spațiu (deci "10:20"
-- rămâne neatins, iar minutele de 2 cifre nu sunt afectate). Idempotent.

BEGIN;

UPDATE crm_routes
SET time_nord = regexp_replace(
      regexp_replace(time_nord, '^([0-9]):([0-9]{2})', '0\1:\2'),
      ' ([0-9]):([0-9]{2})', ' 0\1:\2', 'g')
WHERE time_nord ~ '(^| )[0-9]:[0-9]{2}';

UPDATE crm_routes
SET time_chisinau = regexp_replace(
      regexp_replace(time_chisinau, '^([0-9]):([0-9]{2})', '0\1:\2'),
      ' ([0-9]):([0-9]{2})', ' 0\1:\2', 'g')
WHERE time_chisinau ~ '(^| )[0-9]:[0-9]{2}';

-- Exclude '0:00' (placeholder „oră necunoscută"): codul public/voce/trips verifică
-- exact `hour_from_* !== '0:00'`, deci nu-l transformăm în '00:00'.
UPDATE crm_stop_fares
SET hour_from_nord = regexp_replace(hour_from_nord, '^([0-9]):([0-9]{2})', '0\1:\2')
WHERE hour_from_nord ~ '^[0-9]:[0-9]{2}' AND hour_from_nord <> '0:00';

UPDATE crm_stop_fares
SET hour_from_chisinau = regexp_replace(hour_from_chisinau, '^([0-9]):([0-9]{2})', '0\1:\2')
WHERE hour_from_chisinau ~ '^[0-9]:[0-9]{2}' AND hour_from_chisinau <> '0:00';

COMMIT;
