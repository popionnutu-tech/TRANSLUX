-- 391: Eticheta și Căutarea arătau ALT preț decât magazinul. O singură sursă de acum.
--
-- Găsit căutând altceva. Regula pe care ai decis-o — „costul urcă → prețul urcă pe tot stocul; costul
-- coboară → prețul RĂMÂNE SUS" — e scrisă în `piese_parts.sale_price` și păzită de cricul din migr. 367-368.
-- Numai că nimic din aplicație nu citea coloana aceea.
--
-- Eticheta de tipărit (`partLabelInfo`, lib/piese.ts) și ecranul Căutare (`piese-search.ts`) citeau amândouă
-- vederea `piese_part_sale_price`, care RECALCULA prețul la fiecare citire: `round(cost_mediu × (1+adaos), 0)`.
-- Recalculat înseamnă că scade — exact ce ai spus că nu trebuie să se întâmple („ramine sus").
--
-- Deci erau două prețuri în sistem:
--   Magazin (vânzarea)        → `piese_parts.sale_price`, cu cric, întreg, cu prag (migr. 367-371, 382, 390)
--   Eticheta + Căutare        → recalculat din media costurilor, fără nimic din toate acelea
--
-- Măsurat pe piesele cu stoc în magazin, patru nu se potriveau:
--   #19326 Указатель поворота  — magazin 152, eticheta 151. Cricul ridicase prețul la o recepție mai scumpă;
--                                media l-a trag înapoi în jos. Fix cazul regulii, încălcat.
--   #16532 Помпа OM611         — magazin 1429, eticheta 1430.
--   #426   Амортизатор         — magazin 217, eticheta **0**. Piesa a intrat în magazin prin TRANSFER, iar
--                                subinterogarea vederii se uită doar la `movement_type = 'RECEIPT'`. Cost 0 →
--                                preț 0 → eticheta tipărea „— lei" pentru o piesă care are preț de 217 lei.
--   #21066 Мяч                 — magazin 1, eticheta 0 (pragul din migr. 390 e pe coloană, nu în vedere).
--
-- Reparația: vederea nu mai calculează un preț concurent, îl IA din coloană. Calculul rămâne doar ca
-- REZERVĂ, pentru piesele care n-au fost niciodată puse în vânzare și deci n-au preț memorat — altfel
-- vânzătorul ar fi pierdut răspunsul la „cât ar costa asta?" pentru cele ~10 500 de poziții din afara
-- magazinului. Rezerva trece prin `piese_pret_candidat`, adică prin ACEEAȘI formulă ca restul sistemului,
-- cu prag și cu rotunjire la întreg.
--
-- `avg_cost` NU se atinge. E un număr care se AFIȘEAZĂ (costul de achiziție, doar pentru rolurile care au
-- dreptul să-l vadă), iar a-i schimba înțelesul pe lângă o reparație de preț ar fi o a doua schimbare
-- ascunsă în prima. Rămâne „media recepțiilor", chiar dacă pentru #426 asta e 0.
--
-- LEFT JOIN pe grupe: `group_id` e nullable, iar cu INNER JOIN o piesă fără grupă dispărea din vedere
-- cu totul — nu „fără preț", ci inexistentă pentru Căutare și pentru etichetă.
--
-- `CREATE OR REPLACE VIEW` păstrează drepturile, deci aici nu se re-acordă nimic (verificat după aplicare:
-- `service_role` are SELECT, `anon` nu vede nimic).
CREATE OR REPLACE VIEW piese_part_sale_price AS
SELECT p.id AS part_id,
       COALESCE(p.markup_pct, g.markup_pct) AS markup_pct,
       a.avg_cost,
       COALESCE(p.sale_price, piese_pret_candidat(p.id, a.avg_cost::numeric)) AS sale_price
  FROM piese_parts p
  LEFT JOIN piese_part_groups g ON g.id = p.group_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(avg(m.unit_cost), 0)::double precision AS avg_cost
      FROM piese_stock_movements m
     WHERE m.part_id = p.id AND m.movement_type = 'RECEIPT' AND m.unit_cost > 0
       AND NOT EXISTS (SELECT 1 FROM piese_stock_documents dd
                        WHERE dd.id = m.document_id AND dd.status = 'CANCELLED')
  ) a ON true
 WHERE p.active;

-- După aplicare: 0 piese cu preț 0 în vedere (erau 2), 82 cu preț, și singura nepotrivire rămasă față de
-- coloană e #4791 — piesă cu 10 bucăți în depozitul intern, niciuna în magazin, deci fără preț memorat și
-- cu preț calculat din rezervă. Adică exact pentru ce e rezerva.
