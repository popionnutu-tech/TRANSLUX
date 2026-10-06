-- 523: corecțiile de casier salvate înainte de 520 trec pe cheia nouă (foaie#plată).
--
-- Migr. 520 a făcut cheia rândului (și a corecției) per PLATĂ: casier_grup_nr() = numărul foii
-- + '#' + id-ul plății. Dar n-a mutat corecțiile existente, care erau pe cheia veche (numărul
-- foii, fără plată). După aplicarea ei, pe 06.10 seara, cele 8 corecții din 01–05.10 nu se mai
-- potriveau cu niciun rând — documentul și raportul arătau iar sumele brute de la terminal.
--
-- Fiecare dintre cele 8 are exact O plată în ziua ei (verificat pe 06.10), deci mutarea e
-- fără ambiguitate. O corecție veche cu mai multe plăți pe foaie NU se mută: ar trebui
-- hotărât pe care plată cade, iar asta e decizia casierului, nu a unei migrații.
UPDATE public.casier_amount_corrections c
SET norm_nr = public.casier_grup_nr(t.sofer_id, t.id::text)
FROM tomberon.transactions t
WHERE c.norm_nr NOT LIKE '%#%'
  AND t.ziua = c.ziua
  AND public.casier_afis_nr(t.sofer_id) = c.norm_nr
  AND (
    SELECT count(*) FROM tomberon.transactions t2
    WHERE t2.ziua = c.ziua AND public.casier_afis_nr(t2.sofer_id) = c.norm_nr
  ) = 1;
