-- 555: biletul plătit pe site ajunge singur în Telegram dacă numărul a mai fost legat de Telegram (Ion, 10.10.2026: «odată
-- ce sunt logat în Telegram, oricare bilet cumpărat pe site apare la mine în Telegram automat, fără să pun „Salvează în
-- Telegram”»).
--
-- «Logat» = numărul are deja o comandă legată de un cont Telegram (bilete_comenzi.telegram_id): pusă de bot când omul a
-- deschis biletul cu «Salvează în Telegram» (/start bilet_<cod>, deci a avut linkul secret) sau la cumpărarea din mini app.
-- La trecerea în «platita», comanda fără cont primește contul celei mai noi comenzi legate de același telefon (aceeași
-- natură test/real). Livrarea o face botul cum o face deja pentru mini app (esteDeLivrat: plătită + telegram_id + nelivrată;
-- panoul îl anunță după plată, jobul de 1 min e plasa). Reactivarea după un refund refuzat nu leagă nimic.

CREATE OR REPLACE FUNCTION public.bilete_leaga_telegram_dupa_telefon() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'platita' AND OLD.status IN ('noua', 'eroare_creare', 'expirata', 'platita_fara_bilet')
     AND NEW.telegram_id IS NULL AND NEW.phone IS NOT NULL THEN
    SELECT c.telegram_id INTO NEW.telegram_id
      FROM bilete_comenzi c
     WHERE c.phone = NEW.phone AND c.telegram_id IS NOT NULL AND c.id <> NEW.id AND c.test = NEW.test
     ORDER BY c.created_at DESC
     LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.bilete_leaga_telegram_dupa_telefon() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS bilete_comenzi_telegram_dupa_telefon ON public.bilete_comenzi;
CREATE TRIGGER bilete_comenzi_telegram_dupa_telefon
  BEFORE UPDATE OF status ON public.bilete_comenzi
  FOR EACH ROW EXECUTE FUNCTION public.bilete_leaga_telegram_dupa_telefon();

COMMENT ON FUNCTION public.bilete_leaga_telegram_dupa_telefon() IS
  '555: la plată, comanda fără cont Telegram primește contul celei mai noi comenzi legate de același telefon (Ion, 10.10.2026).';
