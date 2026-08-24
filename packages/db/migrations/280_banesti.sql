-- 280: Bănești se rostește «Банешты» (Ion, 24.08)
--
-- Ultima din cele patru nume lăsate la decizia lui. «Бэнешть» era transliterarea
-- literală a românescului; forma rusă urmează regula -ești → «-ешты», ca la Grimești.
--
-- Alias pentru forma veche NU e nevoie: cheile «банешт» și «бэнешт» diferă printr-o
-- literă, iar la 6 caractere treapta fuzzy pornește cu maxD = 1. Verificat pe endpoint.

update localities set name_ru = 'Банешты' where name_ro = 'Bănești' and name_ru = 'Бэнешть';
