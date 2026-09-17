-- 369: câte opriri are fiecare cursă — al doilea martor pentru „plin sau gol"
--
-- Ion, 17.09.2026: «returul poate fi gol, asta tu vezi că mașina când merge acasă la șofer
-- nu are opriri, ori opririle sunt haotice (poate a luat pe cineva pe drum sau la magazin
-- s-a oprit) — în sens se verifică foarte ușor returul sau turul gol».
--
-- Până acum plin/gol se decidea DOAR pe ceas, față de granița schimbului. Ceasul e bun, dar
-- are un punct orb măsurat: 22% din atingerile de poartă cad la peste 45 de minute de
-- graniță, iar acolo unde nu se poate decide nimic, km-ii se duceau în „necunoscut" și nu
-- se adunau nicăieri. Opririle sunt un martor INDEPENDENT: un autobuz care ia oameni din
-- sate oprește în ele, unul care merge acasă la șofer nu oprește deloc.
--
-- Coloanele nu decid nimic singure — se scriu ca să se poată MĂSURA cât de des cei doi
-- martori spun același lucru, înainte ca vreunul să-l poată corecta pe celălalt.
ALTER TABLE lde_route_run
  ADD COLUMN IF NOT EXISTS opriri_plin int,
  ADD COLUMN IF NOT EXISTS opriri_gol  int;

COMMENT ON COLUMN lde_route_run.opriri_plin IS
  'Opriri stabile (≥90 s, fără baza șoferului) pe segmentul cu pasageri. O cursă declarată '
  'plină fără nicio oprire e un semn că verdictul de ceas e greșit.';
COMMENT ON COLUMN lde_route_run.opriri_gol IS
  'Opriri stabile pe segmentul gol pereche. Multe opriri pe un drum „gol" înseamnă invers: '
  'mașina chiar a dus oameni, iar km-ii ei sunt trecuți greșit la goi.';
