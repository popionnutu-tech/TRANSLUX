-- 489_bilete_email.sql — ION-201 (03.10.2026): biletul trimis pe e-mail după plată.
-- Ion: «da, trebuie să se trimită și pe email». Adresa e opțională în formular (ION-197); aici doar starea trimiterii.
-- Revendicarea e atomică (o singură trimitere în paralel), cel mult 3 încercări; după a 3-a — alertă `email_esuat`.

ALTER TABLE bilete_comenzi
  ADD COLUMN IF NOT EXISTS email_trimis_la  timestamptz,
  ADD COLUMN IF NOT EXISTS email_incercari  int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_eroare     text;

-- Cele de trimis: plătite, cu e-mail, netrimise, sub plafonul de încercări. Indexul rămâne mic (doar restanțele).
CREATE INDEX IF NOT EXISTS bilete_comenzi_email_restante_idx
  ON bilete_comenzi (paid_at)
  WHERE status = 'platita' AND email IS NOT NULL AND email_trimis_la IS NULL AND email_incercari < 3;

ALTER TABLE bilete_alerte DROP CONSTRAINT IF EXISTS bilete_alerte_tip_check;
ALTER TABLE bilete_alerte ADD CONSTRAINT bilete_alerte_tip_check CHECK (tip IN (
  'platita_fara_bilet', 'suma_nepotrivita', 'refund_necunoscut', 'refund_respins', 'cursa_fara_sofer',
  'urcat_pe_anulat', 'creare_esuata', 'plafon_atins', 'refund_pe_zi_confirmata', 'email_esuat'));

-- Revendică trimiterea: întoarce comanda dacă e de trimis ACUM (și marchează încercarea), altfel nimic.
-- `email_trimis_la` se pune la revendicare; la eșec aplicația îl readuce la NULL (bilete_email_elibereaza).
CREATE OR REPLACE FUNCTION public.bilete_email_revendica(p_id uuid) RETURNS SETOF bilete_comenzi
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
  UPDATE bilete_comenzi
     SET email_trimis_la = now(), email_incercari = email_incercari + 1, updated_at = now()
   WHERE id = p_id AND status = 'platita' AND email IS NOT NULL
     AND email_trimis_la IS NULL AND email_incercari < 3
  RETURNING *;
$$;

-- Eliberează după un eșec: trimiterea se poate relua (dacă mai sunt încercări); întoarce încercările făcute.
CREATE OR REPLACE FUNCTION public.bilete_email_elibereaza(p_id uuid, p_eroare text) RETURNS int
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '5s' AS $$
  UPDATE bilete_comenzi
     SET email_trimis_la = NULL, email_eroare = left(p_eroare, 500), updated_at = now()
   WHERE id = p_id
  RETURNING email_incercari;
$$;

REVOKE EXECUTE ON FUNCTION public.bilete_email_revendica(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bilete_email_elibereaza(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bilete_email_revendica(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.bilete_email_elibereaza(uuid, text) TO service_role;

-- Probă: comandă plătită cu e-mail → revendicată o dată; a doua oară nimic; eliberată → revendicabilă; după 3 → nimic;
-- comanda neplătită sau fără e-mail → nimic.
DO $$
DECLARE c bilete_comenzi; n int;
BEGIN
  c := bilete_creeaza_comanda(jsonb_build_object('idempotency_key', '00000000-0000-4000-8000-000000000489', 'trip_date', '2026-10-14',
        'crm_route_id', (SELECT id FROM crm_routes WHERE active ORDER BY id LIMIT 1), 'going_north', false, 'from_stop_order', 10,
        'to_stop_order', 340, 'from_name', 'Probă', 'to_name', 'Probă', 'departure_at', '2026-10-14T05:45:00+03:00', 'seats', 1,
        'price_per_seat', 283, 'total', 283, 'passenger_name', 'Probă 489', 'phone', '37360000005', 'email', 'proba489@example.com',
        'ip_hash', 'proba489', 'test', true));
  SELECT count(*) INTO n FROM bilete_email_revendica(c.id);
  IF n <> 0 THEN RAISE EXCEPTION '489: comanda neplătită a fost revendicată'; END IF;
  UPDATE bilete_comenzi SET status = 'platita', paid_at = now() WHERE id = c.id;
  SELECT count(*) INTO n FROM bilete_email_revendica(c.id);
  IF n <> 1 THEN RAISE EXCEPTION '489: prima revendicare a eșuat'; END IF;
  SELECT count(*) INTO n FROM bilete_email_revendica(c.id);
  IF n <> 0 THEN RAISE EXCEPTION '489: a doua revendicare a trecut'; END IF;
  SELECT bilete_email_elibereaza(c.id, 'probă') INTO n;
  IF n <> 1 THEN RAISE EXCEPTION '489: eliberarea nu a întors 1 încercare (%)', n; END IF;
  PERFORM bilete_email_revendica(c.id); PERFORM bilete_email_elibereaza(c.id, 'probă');
  PERFORM bilete_email_revendica(c.id); PERFORM bilete_email_elibereaza(c.id, 'probă');
  SELECT count(*) INTO n FROM bilete_email_revendica(c.id);
  IF n <> 0 THEN RAISE EXCEPTION '489: a 4-a încercare a trecut'; END IF;
  UPDATE bilete_comenzi SET email = NULL, email_incercari = 0 WHERE id = c.id;
  SELECT count(*) INTO n FROM bilete_email_revendica(c.id);
  IF n <> 0 THEN RAISE EXCEPTION '489: comanda fără e-mail a fost revendicată'; END IF;
  INSERT INTO bilete_alerte (comanda_id, tip, detalii) VALUES (c.id, 'email_esuat', 'probă');
  DELETE FROM bilete_comenzi WHERE id = c.id;
END $$;
