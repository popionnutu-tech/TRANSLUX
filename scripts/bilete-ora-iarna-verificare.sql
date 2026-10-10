-- N6 (dezbaterea Claude–Codex, 10.10.2026): comenzile viitoare cu ora plecării calculată de varianta veche în noaptea
-- schimbării orei. DOAR CITIRE (SELECT). Rulează: execute_sql (MCP) sau psql.
--
-- Varianta veche (packages/db/src/bilete-reguli.ts, până la 10.10) punea offset-ul ZILEI, sondat la prânz:
--  * 25.10.2026 → +02:00 pentru toate orele; 00:00–03:59 sunt însă încă ora de vară (+03:00, până la 04:00 EEST =
--    01:00 UTC). Ora 03:00–03:59 se repetă — politica nouă ia PRIMA apariție (EEST). Deci tot ce varianta veche a scris
--    în [2026-10-24 22:00Z, 2026-10-25 02:00Z) e cu o oră prea TÂRZIU → corect = departure_at − 1 h.
--  * 28.03.2027 → +03:00 pentru toate orele; 00:00–02:59 sunt încă iarnă (+02:00), 03:00–03:59 nu există (se mută
--    cu golul: 03:30 → 04:30 EEST). Tot ce varianta veche a scris în [2027-03-27 21:00Z, 2027-03-28 01:00Z) e cu o
--    oră prea DEVREME → corect = departure_at + 1 h.
-- Atenție: o comandă creată DUPĂ livrarea codului nou poate cădea în aceeași fereastră cu ora corectă (ex. 01:05 EEST
-- = 22:05Z); de aceea se uită și la created_at față de momentul livrării (coloana creata_inainte_de_livrare).
-- Postgres alege pentru ora dublă A DOUA apariție ('2026-10-25 03:30 Europe/Chisinau' = 01:30Z), deci nu se
-- recalculează cu AT TIME ZONE, ci cu ±1 h pe fereastră.

with livrare as (
  select timestamptz '2026-10-10 22:00:00+03' as la -- ÎNLOCUIEȘTE cu momentul livrării în prod (/api/version) înainte de corectură
), candidati as (
  select c.id, c.status, c.trip_date, c.from_name, c.to_name, c.created_at,
         c.departure_at as departure_at_actual,
         case when c.departure_at >= timestamptz '2026-10-24 22:00:00+00' and c.departure_at < timestamptz '2026-10-25 02:00:00+00'
                then c.departure_at - interval '1 hour'
              when c.departure_at >= timestamptz '2027-03-27 21:00:00+00' and c.departure_at < timestamptz '2027-03-28 01:00:00+00'
                then c.departure_at + interval '1 hour'
         end as departure_at_corect
  from bilete_comenzi c
  where c.departure_at > now()
    and (   (c.departure_at >= timestamptz '2026-10-24 22:00:00+00' and c.departure_at < timestamptz '2026-10-25 02:00:00+00')
         or (c.departure_at >= timestamptz '2027-03-27 21:00:00+00' and c.departure_at < timestamptz '2027-03-28 01:00:00+00'))
)
select k.id, k.status, k.trip_date, k.from_name, k.to_name,
       k.departure_at_actual,
       to_char(k.departure_at_actual at time zone 'Europe/Chisinau', 'YYYY-MM-DD HH24:MI') as ora_locala_actuala,
       k.departure_at_corect,
       to_char(k.departure_at_corect at time zone 'Europe/Chisinau', 'YYYY-MM-DD HH24:MI') as ora_locala_corecta,
       k.created_at,
       k.created_at < l.la as creata_inainte_de_livrare
from candidati k cross join livrare l
order by k.departure_at_actual, k.id;
