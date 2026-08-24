-- 281: formele vechi rămân RECUNOSCUTE, chiar dacă nu se mai rostesc
--
-- Migrațiile 275-280 au corectat 34 de nume. Am verificat apoi, pe endpoint-ul de
-- producție, ce se întâmplă cu forma VECHE a fiecăruia: 9 din 34 nu se mai
-- potriveau deloc. Adică, corectând pronunția, tăiam tăcut clienții care spun pe
-- vechi — «Калининск» e cazul evident, orașul a purtat numele ăsta din 1961 până în 1990.
--
-- Restul de 25 trec singure prin treapta fuzzy (o literă diferență la nume lungi).
-- Regula rămâne: nu schimbi un nume fără să verifici ce se întâmplă cu cel vechi.

insert into voice_asr_aliases (heard, canonical_ro, source, evidence, active)
values
  ('Калининск',        'Cupcini',          'human', '{"why": "nume sovietic 1961-1990; pasagerii in varsta il folosesc"}'::jsonb, true),
  ('Хэдэрэуць',        'Hădărăuți',        'human', '{"why": "transliterarea romaneasca, forma noastra de pana la migr. 275"}'::jsonb, true),
  ('Хлина',            'Hlina',            'human', '{"why": "transliterarea romaneasca, forma noastra de pana la migr. 275"}'::jsonb, true),
  ('Хлиная',           'Hlinaia',          'human', '{"why": "transliterarea romaneasca, forma noastra de pana la migr. 275"}'::jsonb, true),
  ('Мерешеука',        'Mereșeuca',        'human', '{"why": "transliterarea romaneasca, forma noastra de pana la migr. 275"}'::jsonb, true),
  ('Биличений Ной',    'Bilicenii Noi',    'human', '{"why": "forma noastra de pana la migr. 275"}'::jsonb, true),
  ('Биличений Векь',   'Bilicenii Vechi',  'human', '{"why": "forma noastra de pana la migr. 275"}'::jsonb, true),
  ('Новые Дуруиторы',  'Duruitoarea Nouă', 'human', '{"why": "forma noastra de pana la migr. 275"}'::jsonb, true),
  ('Михэйлений Ной',   'Mihailenii Noi',   'human', '{"why": "forma noastra de pana la migr. 275"}'::jsonb, true)
on conflict do nothing;
