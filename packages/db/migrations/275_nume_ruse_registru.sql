-- 275: numele rusești ale localităților, aliniate la registrul oficial
--
-- Ion, 24.08.2026: «Единцы, это не так, Единец правильно». Verificat pe listele
-- raionale (Edineț, Briceni, Ocnița, Rîșcani, Sîngerei, Orhei, Dondușeni), care
-- urmează Legea 764/2001: 32 din 90 de nume erau greșite. Două cauze de sistem:
--   1) nume sovietice anulate după 1991 (Единцы→Единец, Калининск→Купчинь,
--      Сынжерея→Сынжерей);
--   2) terminația -ți scrisă «-уць» în loc de rusescul «-уцы» (7 sate), la fel -ești.
--
-- name_ru NU e doar pentru voce: din el vorbește agentul, tot pe el caută localitatea
-- rostită de client, și din el se hrănește versiunea rusă a site-ului. Un nume greșit
-- strica simultan pronunția ȘI potrivirea.
--
-- Fiecare UPDATE cere și valoarea veche: rularea repetată nu face nimic, iar o
-- corectură manuală făcută între timp nu e călcată.

update localities set name_ru = 'Единец'                where name_ro = 'Edineț'                and name_ru = 'Единцы';
update localities set name_ru = 'Купчинь'               where name_ro = 'Cupcini'               and name_ru = 'Калининск';
update localities set name_ru = 'Сынжерей'              where name_ro = 'Sîngerei'              and name_ru = 'Сынжерея';
update localities set name_ru = 'Коржеуцы'              where name_ro = 'Corjeuți'              and name_ru = 'Коржеуць';
update localities set name_ru = 'Гриманкауцы'           where name_ro = 'Grimăncăuți'           and name_ru = 'Гримэнкэуць';
update localities set name_ru = 'Белявинцы'             where name_ro = 'Beleavinți'            and name_ru = 'Белявинць';
update localities set name_ru = 'Дрепкауцы'             where name_ro = 'Drepcăuți'             and name_ru = 'Дрепкэуць';
update localities set name_ru = 'Требисоуцы'            where name_ro = 'Trebisăuți'            and name_ru = 'Требисэуць';
update localities set name_ru = 'Корестоуцы'            where name_ro = 'Corestăuți'            and name_ru = 'Корестэуць';
update localities set name_ru = 'Ходороуцы'             where name_ro = 'Hădărăuți'             and name_ru = 'Хэдэрэуць';
update localities set name_ru = 'Ленкауцы'              where name_ro = 'Lencăuți'              and name_ru = 'Ленкэуць';
update localities set name_ru = 'Ганкауцы'              where name_ro = 'Hancăuți'              and name_ru = 'Ханкауцы';
update localities set name_ru = 'Глинка'                where name_ro = 'Hlina'                 and name_ru = 'Хлина';
update localities set name_ru = 'Глиное'                where name_ro = 'Hlinaia'               and name_ru = 'Хлиная';
update localities set name_ru = 'Тырново'               where name_ro = 'Tîrnova'               and name_ru = 'Тырнова';
update localities set name_ru = 'Волчинец'              where name_ro = 'Vălcineț'              and name_ru = 'Вэлчинец';
update localities set name_ru = 'Гримешты'              where name_ro = 'Grimești'              and name_ru = 'Гримешть';
update localities set name_ru = 'Котюжены'              where name_ro = 'Cotiujeni'             and name_ru = 'Котюжаны';
update localities set name_ru = 'Мерешовка'             where name_ro = 'Mereșeuca'             and name_ru = 'Мерешеука';
update localities set name_ru = 'Бырново'               where name_ro = 'Bîrnova'               and name_ru = 'Бырнова';
update localities set name_ru = 'Корпачь'               where name_ro = 'Corpaci'               and name_ru = 'Корпач';
update localities set name_ru = 'Пересечино'            where name_ro = 'Peresecina'            and name_ru = 'Пересечина';
update localities set name_ru = 'Копачены'              where name_ro = 'Copăceni'              and name_ru = 'Копэчень';
update localities set name_ru = 'Новые Биличены'        where name_ro = 'Bilicenii Noi'         and name_ru = 'Биличений Ной';
update localities set name_ru = 'Старые Биличены'       where name_ro = 'Bilicenii Vechi'       and name_ru = 'Биличений Векь';
update localities set name_ru = 'Григоровка'            where name_ro = 'Grigorăuca'            and name_ru = 'Григорьевка';
update localities set name_ru = 'Новая Дуруитоаря'      where name_ro = 'Duruitoarea Nouă'      and name_ru = 'Новые Дуруиторы';
update localities set name_ru = 'Новые Михайлены'       where name_ro = 'Mihailenii Noi'        and name_ru = 'Михэйлений Ной';
update localities set name_ru = 'Варатик'               where name_ro = 'Văratic'               and name_ru = 'Вэратик';
update localities set name_ru = 'Заиканы'               where name_ro = 'Zaicani'               and name_ru = 'Зэикань';
update localities set name_ru = 'Пересечение Трестияны' where name_ro = 'Intersecția Trestieni' and name_ru = 'Пересечение Трестиень';
-- Numele vine din registru, dar aici se repară și un caracter TAB lipit în față,
-- din cauza căruia potrivirea pe egalitate exactă rata întotdeauna satul.
update localities set name_ru = 'Слобозия-Ширеуцы'      where name_ro = 'Slobozia Șirăuți'      and btrim(name_ru) = 'Слободка Ширеуцы';

-- Spații parazite oriunde altundeva (aceeași clasă de defect, tăcută).
update localities set name_ru = btrim(name_ru) where name_ru <> btrim(name_ru);
update localities set name_ro = btrim(name_ro) where name_ro <> btrim(name_ro);

-- Dicționarul ASR al agentului: aceleași forme vechi erau «suflate» recunoscătorului,
-- adică îl învățam cuvinte pe care nimeni nu le rostește. Controlerul (la fiecare
-- 30 min) duce lista asta în configul agentului — deci corectura nu așteaptă deploy.
-- Otaci/Отачь rămâne neatins: Ion decide dacă pasagerii spun «Атаки».
update voice_agent_canon
set value = '["TRANSLUX",
  "Chișinău","Кишинёв","Bălți","Бельцы","Orhei","Орхей","Sîngerei","Сынжерей",
  "Rîșcani","Рышканы","Briceni","Бричаны","Lipcani","Липканы","Edineț","Единец",
  "Cupcini","Купчинь","Ocnița","Окница","Otaci","Отачь","Criva","Крива",
  "Peresecina","Пересечино","Corjeuți","Коржеуцы","Măgdăcești","Магдачешты",
  "Brătușeni","Братушаны","Larga","Ларга","Grimăncăuți","Гриманкауцы",
  "Caracușenii Vechi","Старые Каракушаны","Tîrnova","Тырново","Tabani","Табаны",
  "Vălcineț","Волчинец","Cotiujeni","Котюжены","Tețcani","Тецканы","Drepcăuți"]'::jsonb,
    updated_at = now()
where key = 'asr_keywords';
