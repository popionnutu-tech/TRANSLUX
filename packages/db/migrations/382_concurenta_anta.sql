-- 382_concurenta_anta.sql
-- Concurența pe direcție (ION-12): graficul interraional ANTA al întregii țări, în admin.
--
-- Ion, 20.09.2026: «будет понимание всех моих конкурентов, которые едут по моему маршруту».
-- Sursa: foaia Google «interraional» (lista allCourses) exportată de ANTA — o linie pe oprire:
-- cod rută, firmă, denumire, ora plecării tur/retur, ora sosirii și km la fiecare punct.
-- Se importă întreagă cu apps/admin/scripts/anta-import.mts, care:
--   * pune cursele ANTA cu source='anta' (rândurile firmei noastre din fișier se aruncă — sunt
--     incomplete, lipsesc cursele de seară);
--   * pune cursele noastre cu source='tlx' din crm_routes + crm_stop_fares + v_interurban_v2_route_stops;
--   * dă fiecărei opriri raionul (anta_localities = localitățile Moldovei de pe Wikidata, cu
--     coordonate; numele duble se rezolvă după vecinii de pe cursă — apps/admin/src/lib/anta/district.ts).
-- Pagina admin /concurenta citește DOAR prin service key (RLS pornit, fără politici; funcțiile
-- sunt revocate de la PUBLIC/anon/authenticated — vezi memoria proiectului despre migr. 355/356).

create table if not exists anta_localities (
  id       serial primary key,
  name     text not null,
  district text not null,
  lat      double precision,
  lon      double precision,
  unique (name, district)
);
comment on table anta_localities is 'Localitățile Republicii Moldova cu raionul și coordonatele (Wikidata). Sursă: apps/admin/scripts/anta/localities-md.txt.';

create table if not exists anta_courses (
  id          serial primary key,
  source      text not null check (source in ('anta', 'tlx')),
  code        text not null,
  route_name  text not null,
  operator    text not null,
  dep_tur     text,
  dep_retur   text,
  imported_at timestamptz not null default now()
);
comment on table anta_courses is 'O cursă = (cod rută ANTA, denumire, firmă, ora plecării tur, ora plecării retur). source=anta din foaia ANTA, source=tlx din baza noastră (crm_routes).';
comment on column anta_courses.dep_tur is 'Ora plecării de la primul punct (text «H:MM», ca în fișier).';
comment on column anta_courses.dep_retur is 'Ora plecării de la ultimul punct înapoi.';

create table if not exists anta_course_stops (
  id         serial primary key,
  course_id  integer not null references anta_courses (id) on delete cascade,
  seq        integer not null,
  name       text not null,
  note       text not null default '',
  km_tur     integer not null default 0,
  time_tur   text,
  time_retur text,
  km_retur   integer not null default 0,
  district   text,
  unique (course_id, seq)
);
comment on table anta_course_stops is 'Opririle unei curse, în ordinea km de la primul punct. time_tur/time_retur = ora sosirii pe sensul respectiv (null = necunoscută); la capete = ora plecării.';
comment on column anta_course_stops.district is 'Raionul localității (ex. «Briceni», «Dondușeni», «mun. Chișinău»); null = nedeterminat.';

create index if not exists anta_course_stops_name_idx on anta_course_stops (name);
create index if not exists anta_course_stops_course_idx on anta_course_stops (course_id, seq);
create index if not exists anta_courses_operator_idx on anta_courses (operator);

alter table anta_localities   enable row level security;
alter table anta_courses      enable row level security;
alter table anta_course_stops enable row level security;
revoke all on anta_localities, anta_courses, anta_course_stops from anon, authenticated;
revoke all on sequence anta_localities_id_seq, anta_courses_id_seq, anta_course_stops_id_seq from anon, authenticated;

-- Punctele de staționare cu raionul lor și câte curse trec (lista de alegere din pagină).
-- Întorc jsonb (un singur rând): PostgREST ar tăia o funcție-tabel la 1000 de rânduri, iar punctele sunt ~1050.
create or replace function anta_places()
returns jsonb
language sql stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'district', t.district, 'n', t.n) order by t.name, t.district), '[]'::jsonb)
  from (select s.name, s.district, count(distinct s.course_id) n from anta_course_stops s group by s.name, s.district) t
$$;

-- Firmele și câte curse au.
create or replace function anta_operators()
returns jsonb
language sql stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object('operator', t.operator, 'n', t.n) order by t.operator), '[]'::jsonb)
  from (select c.operator, count(*) n from anta_courses c group by c.operator) t
$$;

-- O cursă cu opririle ei, ca jsonb.
create or replace function anta_course_json(p_course anta_courses)
returns jsonb
language sql stable
as $$
  select jsonb_build_object(
    'id', p_course.id, 'source', p_course.source, 'code', p_course.code,
    'route_name', p_course.route_name, 'operator', p_course.operator,
    'dep_tur', p_course.dep_tur, 'dep_retur', p_course.dep_retur,
    'stops', coalesce((
      select jsonb_agg(jsonb_build_object(
        'seq', s.seq, 'name', s.name, 'note', s.note, 'km_tur', s.km_tur, 'time_tur', s.time_tur,
        'time_retur', s.time_retur, 'km_retur', s.km_retur, 'district', s.district) order by s.seq)
      from anta_course_stops s where s.course_id = p_course.id), '[]'::jsonb)
  )
$$;

-- Cursele care trec prin punctul de plecare (și, dacă e dat, prin destinație), indiferent de capăt.
-- Un raion null pe oprire (nedeterminat) se potrivește cu orice raion cerut.
create or replace function anta_search(p_from text, p_from_district text, p_to text, p_to_district text)
returns jsonb
language sql stable
as $$
  select coalesce(jsonb_agg(anta_course_json(c) order by c.id), '[]'::jsonb)
  from anta_courses c
  where exists (
          select 1 from anta_course_stops s
          where s.course_id = c.id and s.name = p_from
            and (p_from_district is null or s.district is null or s.district = p_from_district))
    and (p_to is null or exists (
          select 1 from anta_course_stops s
          where s.course_id = c.id and s.name = p_to
            and (p_to_district is null or s.district is null or s.district = p_to_district)))
$$;

create or replace function anta_course(p_id integer)
returns jsonb
language sql stable
as $$
  select anta_course_json(c) from anta_courses c where c.id = p_id
$$;

revoke execute on function anta_places() from public, anon, authenticated;
revoke execute on function anta_operators() from public, anon, authenticated;
revoke execute on function anta_course_json(anta_courses) from public, anon, authenticated;
revoke execute on function anta_search(text, text, text, text) from public, anon, authenticated;
revoke execute on function anta_course(integer) from public, anon, authenticated;
