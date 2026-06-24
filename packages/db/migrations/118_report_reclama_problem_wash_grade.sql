-- Шаг 10 (реклама): когда реклама не ОК, фиксируем КАКАЯ именно проблемная —
--   'bus' (реклама на кузове), 'panou_ruta' (панель маршрута), 'ambele' (обе).
-- Шаг 11 (новый): оценка работы мойки интерьера 1..3
--   (1 = только подмёл, 2 = подмёл+вымыл пол, 3 = пылесос+пол+пыль везде).
-- Обе колонки nullable и дополняют существующие reclama_ok / auto_curat (не заменяют).
alter table public.reports
  add column if not exists reclama_problem text
    check (reclama_problem in ('bus', 'panou_ruta', 'ambele')),
  add column if not exists wash_grade smallint
    check (wash_grade between 1 and 3);
