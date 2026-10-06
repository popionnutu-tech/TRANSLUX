-- 382: La vânzare, prețul e număr întreg.
--
-- Regula Marianei (06.10): «la procurare putem avea cu virgulă, dar la vânzare doar cifre întregi».
--
-- Se aplică în BAZĂ, nu doar în ecran. Ecranul se poate ocoli, iar un preț cu bani pe un bon fiscal e
-- fix genul de lucru care produce o nepotrivire de un ban între raportul nostru de zi și banda fiscală —
-- iar nepotrivirea aceea trebuie apoi explicată cuiva.
--
-- Rotunjirea se face ÎNAINTE de orice calcul, nu la afișare: altfel totalul s-ar socoti pe prețul cu
-- zecimale, iar pe bon ar apărea alt număr decât suma pozițiilor. Clientul adună cu ochiul.
--
-- Costul rămâne cu zecimale: el vine din facturile furnizorilor și n-are de ce să fie rotund.
--
-- Corpul funcției e cel din migr. 381, cu `v_price := round(…, 0)` și o gardă `piese_cost_ok` pe preț.
-- Plus aducerea la regulă a prețurilor memorate rămase cu bani:
UPDATE piese_parts SET sale_price = round(sale_price, 0)
 WHERE sale_price IS NOT NULL AND sale_price <> round(sale_price, 0);
