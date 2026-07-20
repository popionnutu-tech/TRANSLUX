-- 242: Furnizori piese — 2 numere de telefon suplimentare (pe lângă câmpul „contact" existent).
-- Cerut la punerea în funcțiune (nomenclator → Furnizori). Aditiv, sigur și pentru codul vechi de pe main
-- (coloane noi nullable; scrierile vechi care nu le trimit rămân NULL). Aplicat pe prod prin Supabase MCP.
ALTER TABLE piese_suppliers ADD COLUMN IF NOT EXISTS phone2 text;
ALTER TABLE piese_suppliers ADD COLUMN IF NOT EXISTS phone3 text;
