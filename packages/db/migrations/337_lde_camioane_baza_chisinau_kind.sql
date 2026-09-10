-- 337_lde_camioane_baza_chisinau_kind.sql
-- Bazele din Chișinău (Bacioi, Meșterul Manole) sunt BAZE, nu stații de descărcare
-- (Ion, 10.09.2026, ANT344 venit din Constanța și parcat la Bacioi: «dacă auto a
-- venit de la România și nu a apărut încă descărcat în TLX și stă la bază — starea
-- este încărcat»). Cu kind='descarcare_diesel' automatul îl punea «la descărcare»
-- după 15 min; cu kind='baza' îl pune «plin, așteaptă descărcarea» — la bază
-- cisterna e plină până apare bonul TLX, care închide cursa și de acolo.
-- Doar cisternele: zernovozul nu intră în automat (D6).

update lde_dispatch_points
   set kind = 'baza'
 where kind = 'descarcare_diesel'
   and name in ('Bază Chișinău — stație Bacioi', 'Bază Chișinău — stație Meșterul Manole');
