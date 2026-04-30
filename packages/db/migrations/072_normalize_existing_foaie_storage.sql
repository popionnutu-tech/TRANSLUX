-- 072_normalize_existing_foaie_storage.sql
-- Normalizam toate intrarile existente (strip zerourile de la inceput pentru numere).
-- Dupa aceasta migratie, baza contine doar forma canonica, ex. '142961' (nu '0142961').

UPDATE driver_cashin_receipts
SET receipt_nr = norm_foaie(receipt_nr)
WHERE receipt_nr <> norm_foaie(receipt_nr);

UPDATE tomberon_payment_overrides
SET receipt_nr = norm_foaie(receipt_nr)
WHERE receipt_nr <> norm_foaie(receipt_nr);
