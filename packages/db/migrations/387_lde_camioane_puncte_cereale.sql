-- 387_lde_camioane_puncte_cereale.sql
-- ION-35 (Ion, 23.09.2026: «la camioane modulul nu lucrează corect, nu identifică
-- toate camioanele» → «rezolvă singur»). Automatul de stări vedea doar cisternele
-- (D6); zernovozurile — KYK692, KYK784, QDQ357, QDQ364, QDQ395, QDQ419, IIC230, cu
-- 1.000–3.000 km pe săptămână — n-aveau nicio cursă, fiindcă nu exista niciun punct
-- al lor. Punctele de mai jos vin din opririle lor de ≥ 45 min pe 60 de zile
-- (lde_gps_stops, grupate la 0,01°): convoiul pleacă de la Bază Briceni, trece vama
-- la Albița, stă ore sau zile în portul de la Brăila ori la Constanța, apoi se întoarce.
--
--  · Port Brăila: 31 de opriri a 7 camioane, mediana 653 min — descărcarea.
--  · Constanța nord (44,145–44,170 / 28,637–28,648) și sud (44,08–44,10 / 28,64–28,65):
--    terminalele de cereale, la 3–5 km de «Port Constanța — încărcare diesel», fără
--    suprapunere de rază.
--  · Albița–Leușeni: 54 de opriri a 8 camioane — vamă, nu schimbă nimic, dar numește locul.
-- Portul Giurgiulești (45,49 / 28,22) NU e pus: convoiul stă acolo și apoi trece
-- granița spre Brăila, deci nu se știe dacă e descărcare sau parcare.

alter table lde_dispatch_points drop constraint if exists lde_dispatch_points_kind_check;
alter table lde_dispatch_points add constraint lde_dispatch_points_kind_check
  check (kind in ('incarcare_biodiesel','descarcare_biodiesel','incarcare_diesel','descarcare_diesel',
                  'descarcare_cereale','baza','tranzit_acte','vama','parcare'));
comment on column lde_dispatch_points.kind is
  'Tipul punctului pentru automatul de stări: incarcare_*/descarcare_* pe marfă (descarcare_cereale = portul unde descarcă zernovozul, ION-35), baza (Briceni/Bălți — descarcă doar diesel, prag lung; zernovozul pleacă și se întoarce aici), tranzit_acte/vama/parcare (nu schimbă starea). NULL = automatul nu decide nimic la acest punct.';

insert into lde_dispatch_points (name, country, lat, lng, radius_m, active, kind, created_by)
select v.name, v.country, v.lat, v.lng, v.radius_m, true, v.kind, 'auto:ion-35'
from (values
  ('Port Brăila — descărcare cereale',          'România', 45.289, 27.990, 1000, 'descarcare_cereale'),
  ('Port Constanța nord — descărcare cereale',  'România', 44.157, 28.644, 1500, 'descarcare_cereale'),
  ('Port Constanța sud — descărcare cereale',   'România', 44.090, 28.650, 1500, 'descarcare_cereale'),
  ('Vama Albița–Leușeni',                        'Moldova', 46.786, 28.140, 1500, 'vama')
) as v(name, country, lat, lng, radius_m, kind)
where not exists (select 1 from lde_dispatch_points p where p.name = v.name);
