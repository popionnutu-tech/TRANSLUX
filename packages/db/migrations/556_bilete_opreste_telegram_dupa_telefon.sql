-- 556: legarea automată la Telegram după telefon (555) se OPREȘTE (revizia Claude, runda 1 a dezbaterii din 10.10, C1).
-- Trigger-ul lua contul celei mai noi comenzi cu același telefon, fără să ceară ca telefonul să fie dovedit: cineva care
-- face din mini app o comandă (chiar neplătită) cu numărul altuia ar fi primit în chat biletele (QR-ul) acelui om. Se
-- reia doar cu dovada telefonului (contactul trimis din Telegram), după dezbatere. Funcția rămâne, trigger-ul se scoate.
DROP TRIGGER IF EXISTS bilete_comenzi_telegram_dupa_telefon ON public.bilete_comenzi;
