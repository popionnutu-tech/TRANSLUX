-- 543_bilete_doar_soferi_legati.sql — Ion, 09.10.2026: «vânzarea online să fie doar la șoferii legați».
-- O cursă se vinde online doar dacă șoferul ei din graficul zilei e legat de Telegram (drivers.telegram_id): numai el
-- vede pasagerii online în aplicație și le scanează biletele.
--  * public_drivers_view primește coloana bilete_online (da/nu), ca site-ul să ascundă butonul «Cumpără» pe cursele cu
--    șofer nelegat — fără să expună telegram_id-ul.
--  * bilete_alerte.tip += 'sofer_nelegat': comanda plătită a cărei cursă a primit între timp un șofer nelegat (împăcarea).
CREATE OR REPLACE VIEW public.public_drivers_view AS
  SELECT id, full_name, phone, (telegram_id IS NOT NULL AND active AND NOT is_test) AS bilete_online
    FROM drivers;

ALTER TABLE bilete_alerte DROP CONSTRAINT IF EXISTS bilete_alerte_tip_check;
ALTER TABLE bilete_alerte ADD CONSTRAINT bilete_alerte_tip_check CHECK (tip IN (
  'platita_fara_bilet', 'suma_nepotrivita', 'refund_necunoscut', 'refund_respins', 'cursa_fara_sofer', 'urcat_pe_anulat',
  'creare_esuata', 'plafon_atins', 'refund_pe_zi_confirmata', 'email_esuat', 'fara_loc', 'loc_schimbat', 'retur_cerere',
  'sofer_nelegat'));
