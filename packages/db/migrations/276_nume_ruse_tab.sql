-- 276: continuarea lui 275 — TAB-ul din fața numelui
--
-- btrim() fără al doilea argument taie DOAR spații, nu și TAB. Numele lui
-- Slobozia Șirăuți începea cu TAB, deci și UPDATE-ul din 275 (care compara pe
-- btrim) și verificarea «spații parazite» au trecut pe lângă el — verificarea
-- a raportat 0 și părea curată.

update localities
set name_ru = 'Слобозия-Ширеуцы'
where name_ro = 'Slobozia Șirăuți'
  and btrim(name_ru, E' \t\r\n') = 'Слободка Ширеуцы';

update localities set name_ru = btrim(name_ru, E' \t\r\n') where name_ru <> btrim(name_ru, E' \t\r\n');
update localities set name_ro = btrim(name_ro, E' \t\r\n') where name_ro <> btrim(name_ro, E' \t\r\n');
