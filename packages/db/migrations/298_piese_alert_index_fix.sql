-- 298: Indexul pentru alerta „schimbat prea des" avea forma greșită.
--
-- Am creat în migr. 295 `(vehicle_id, part_id, created_at DESC)`, presupunând că interogarea filtrează pe
-- piesă. Nu filtrează: `piese_issue_alert` (migr. 200) caută după MAȘINĂ și după GRUPUL piesei
-- (`JOIN piese_parts p ON p.id = m.part_id ... AND p.group_id = v_grp`), apoi ia cel mai recent rând.
--
-- Cu `part_id` nelegat la mijlocul cheii, doar `vehicle_id` rămâne prefix de egalitate, iar intrările NU
-- sunt în ordinea lui `created_at` — deci planificatorul tot citea întregul istoric de eliberări al mașinii
-- și îl sorta. Adică exact costul pe care indexul trebuia să-l elimine, iar acum se plătește o dată per
-- rând de pe ecran.
--
-- Forma corectă pune `created_at DESC, id DESC` imediat după `vehicle_id`: scanare în ordine, verificarea
-- grupului pe cheia primară a piesei, oprire la primul rând potrivit.

DROP INDEX IF EXISTS idx_pmov_vehicle_part_issue;

CREATE INDEX IF NOT EXISTS idx_pmov_vehicle_issue_recent
  ON piese_stock_movements (vehicle_id, created_at DESC, id DESC)
  WHERE movement_type = 'ISSUE';
