-- Самообучающийся контур голосового агента (мандат Иона 23.08).
-- voice_asr_aliases: выученные пары «услышано → каноническое RO-название»;
-- резолвер читает active=true, learner добавляет, человек может деактивировать.
create table if not exists voice_asr_aliases (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  heard text not null unique,
  canonical_ro text not null,
  source text not null default 'learner', -- 'learner' | 'manual'
  evidence jsonb not null default '{}'::jsonb, -- conversation_id, реплики
  active boolean not null default true
);

-- voice_agent_canon: эталоны конфига агента, которые меняются со временем
-- (сейчас: asr_keywords). Контролёр лечит агента ПО ЭТОЙ таблице.
create table if not exists voice_agent_canon (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into voice_agent_canon (key, value) values ('asr_keywords', '[
  "TRANSLUX",
  "Chișinău","Кишинёв","Bălți","Бельцы","Orhei","Орхей","Sîngerei","Сынжерея",
  "Rîșcani","Рышканы","Briceni","Бричаны","Lipcani","Липканы","Edineț","Единцы",
  "Cupcini","Калининск","Ocnița","Окница","Otaci","Отачь","Criva","Крива",
  "Peresecina","Пересечина","Corjeuți","Коржеуць","Măgdăcești","Магдачешты",
  "Brătușeni","Братушаны","Larga","Ларга","Grimăncăuți","Гримэнкэуць",
  "Caracușenii Vechi","Старые Каракушаны","Tîrnova","Тырнова","Tabani","Табаны",
  "Vălcineț","Вэлчинец","Cotiujeni","Котюжаны","Tețcani","Тецканы","Drepcăuți"
]'::jsonb)
on conflict (key) do nothing;
