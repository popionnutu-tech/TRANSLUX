-- 358_scutire_barbierit_sofer.sql
-- Scutirea medicală de bărbierit, pe șofer.
--
-- Ion, 15.09: «Panteliciuc are alergie dacă se rade la zero, scoatem pe el din
-- verificare barba».
--
-- Verdictul «bărbierit» al modelului intră, la șoferi, în groomed_ok
-- (driverPhoto.ts: groomed_ok = bărbierit ȘI aspect îngrijit), iar groomed_ok e
-- exact ce costă 20 de lei pe zi în penalitățile de aspect. Deci fără scutire,
-- omul ar fi plătit lunar pentru o boală.
--
-- Scutirea stă pe ȘOFER, nu într-o listă în cod: mâine mai are cineva o adeverință
-- și se rezolvă cu un UPDATE, fără deploy. `beard_exempt_note` ține motivul —
-- peste un an nimeni nu-și mai amintește de ce e bifat, iar o bifă fără motiv se
-- șterge din greșeală.
--
-- Ce NU face scutirea: modelul judecă mai departe barba și scrie ce vede în
-- descriere. Se schimbă doar ce se ține împotriva șoferului.

alter table drivers add column if not exists beard_exempt boolean not null default false;
alter table drivers add column if not exists beard_exempt_note text;

comment on column drivers.beard_exempt is
  'Șoferul e scutit de verdictul «bărbierit» din poza de la peron (motiv medical). '
  'Verdictul modelului rămâne în descriere, dar nu mai intră în groomed_ok și nu mai costă penalitate.';
comment on column drivers.beard_exempt_note is
  'De ce e scutit — cine a hotărât și când. Fără el, bifa devine de neînțeles peste câteva luni.';

update drivers
set beard_exempt = true,
    beard_exempt_note = 'Alergie: nu se poate rade la zero (Ion, 15.09.2026)'
where full_name ilike 'Panteleiciuc%' and active;
