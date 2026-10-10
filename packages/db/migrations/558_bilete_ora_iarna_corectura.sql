-- 558: N6 (dezbaterea Claude–Codex, 10.10.2026) — corectura departure_at pentru comenzile viitoare calculate de varianta
-- veche în nopțile schimbării orei (25.10.2026: −1 h; 28.03.2027: +1 h). Regula și ferestrele: vezi
-- scripts/bilete-ora-iarna-verificare.sql.
--
-- NU s-a aplicat. La 10.10.2026 22:28 erau 0 rânduri afectate (cea mai târzie plecare viitoare: 17.10), deci migrația
-- e o plasă de siguranță: se aplică DOAR dacă verificarea arată rânduri, DUPĂ livrarea codului nou și după ce
-- `v_livrare` de mai jos e pusă la momentul livrării în prod (comenzile create după ea au deja ora corectă).
-- Aplicare: ~/.claude/scripts/db-migrate.sh translux <fișier> --dry-run, apoi fără --dry-run.
--
-- Garda: fiecare UPDATE atinge rândul doar dacă departure_at e încă valoarea veche citită în aceeași tranzacție.

-- Fără BEGIN/COMMIT aici: db-migrate.sh înfășoară fișierul într-o tranzacție (BEGIN … COMMIT, sau ROLLBACK la --dry-run);
-- un COMMIT în fișier ar face --dry-run să scrie de-adevăratelea.

do $$
declare
  v_livrare constant timestamptz := timestamptz '2026-10-10 22:00:00+03'; -- ÎNLOCUIEȘTE cu momentul livrării în prod
  v_candidati int;
  v_atinse int;
begin
  create temp table n6_corectura on commit drop as
  select c.id,
         c.departure_at as vechi,
         case when c.departure_at < timestamptz '2026-10-25 02:00:00+00'
                then c.departure_at - interval '1 hour'
              else c.departure_at + interval '1 hour'
         end as nou
  from bilete_comenzi c
  where c.departure_at > now()
    and c.created_at < v_livrare
    and (   (c.departure_at >= timestamptz '2026-10-24 22:00:00+00' and c.departure_at < timestamptz '2026-10-25 02:00:00+00')
         or (c.departure_at >= timestamptz '2027-03-27 21:00:00+00' and c.departure_at < timestamptz '2027-03-28 01:00:00+00'));

  select count(*) into v_candidati from n6_corectura;

  update bilete_comenzi c
     set departure_at = k.nou
    from n6_corectura k
   where c.id = k.id
     and c.departure_at = k.vechi;  -- garda pe valoarea veche
  get diagnostics v_atinse = row_count;

  if v_atinse <> v_candidati then
    raise exception 'N6: % candidați, dar % rânduri actualizate — cineva a schimbat departure_at între timp', v_candidati, v_atinse;
  end if;
  raise notice 'N6: departure_at corectat pe % comenzi', v_atinse;
end $$;
