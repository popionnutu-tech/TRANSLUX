-- 259: constrângere pe obligations.reclama_problem (migr. 258).
--
-- De ce: coloana e acum cheia de dedup a sarcinilor de reclamă. O valoare necunoscută nu ar
-- arunca nicio eroare — codul doar o sare la calculul acoperirii, deci s-ar crea un dublu, tăcut.
-- Coloana geamănă din `reports` (migr. 118) are deja exact același CHECK; aliniem convenția.
-- NULL rămâne permis: îl au toate sarcinile care nu vin din reclamă.

alter table obligations drop constraint if exists obligations_reclama_problem_check;
alter table obligations add constraint obligations_reclama_problem_check
  check (reclama_problem is null or reclama_problem in ('bus', 'panou_ruta', 'ambele'));
