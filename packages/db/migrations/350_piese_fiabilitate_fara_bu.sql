-- 350: Piesele б/у nu intră în raportul de fiabilitate a producătorilor.
--
-- Decizia lui Eduard, 14.09: „Б/у деталь не стоит включать к отчеты производителей."
-- Motivul e evident odată spus: un alternator uzat, scos de pe un autobuz casat, poate ține trei luni —
-- dar asta nu spune nimic despre TRW, ci despre cât mai avea piesa în ea când a fost pusă.
--
-- ATENȚIE la cum se exclude. Raportul măsoară, pentru fiecare mașină și grupă, câți kilometri au trecut
-- între două eliberări consecutive, și atribuie intervalul piesei DE DINAINTE — adică „cât a ținut".
--
-- Deci NU se scot piesele uzate din șir, ci punctele de date în care piesa precedentă era uzată. Dacă
-- le-am fi filtrat din șir, două intervale s-ar fi lipit într-unul singur: o piesă nouă pusă în ianuarie,
-- una uzată în martie și alta nouă în iunie ar fi făcut să pară că piesa din ianuarie a ținut până în
-- iunie. Ar fi umflat tocmai cifra pe care raportul o urmărește.
--
-- Verificat pe date: fără filtru, o piesă uzată apărea cu 1000 km în dreptul producătorului ei; cu filtru
-- nu apare deloc, iar cele 25 de probe ale pieselor noi rămân neatinse.
CREATE OR REPLACE VIEW piese_reliability AS
  WITH seq AS (
    SELECT lag(p.manufacturer) OVER w AS manufacturer,
           -- Starea piesei DE DINAINTE: ea e cea căreia i se atribuie intervalul.
           lag(p.is_used) OVER w AS prev_used,
           m.odometer_km - lag(m.odometer_km) OVER w AS span
      FROM piese_stock_movements m
      JOIN piese_parts p ON p.id = m.part_id
      LEFT JOIN piese_issue_line_net n ON n.line_id = m.line_id
     WHERE m.movement_type = 'ISSUE' AND m.vehicle_id IS NOT NULL AND m.odometer_km IS NOT NULL
       AND COALESCE(n.net, 1::numeric) > 0.0000001
    WINDOW w AS (PARTITION BY m.vehicle_id, p.group_id ORDER BY m.created_at, m.id)
  )
  SELECT manufacturer,
         count(*) AS samples,
         round(avg(span)) AS avg_km
    FROM seq
   WHERE span > 0 AND manufacturer IS NOT NULL
     AND NOT COALESCE(prev_used, false)
   GROUP BY manufacturer
   ORDER BY round(avg(span)) DESC;

REVOKE ALL ON piese_reliability FROM PUBLIC, anon, authenticated;
GRANT SELECT ON piese_reliability TO service_role;
