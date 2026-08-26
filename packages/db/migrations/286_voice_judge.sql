-- 286_voice_judge.sql
-- Судья бизнес-логики + экзамены (план cheeky-foraging-yao, Ion «fa tot» 26.08).

-- Дедуп «звонок уже судился»: judged_at ставится ТОЛЬКО звонкам с полученным
-- вердиктом (или отсеянным префильтром) — упавшие волны пересуживаются.
alter table voice_calls add column if not exists judged_at timestamptz;
create index if not exists idx_voice_calls_unjudged
  on voice_calls (created_at desc) where judged_at is null;

-- Один судейский урок на (звонок, правило) навсегда — повторные прогоны и
-- перекрытия окон не плодят дубли; 23505 глотает insertLesson.
create unique index if not exists idx_voice_lessons_judge_dedupe
  on voice_lessons (conversation_id, (payload->>'rule'))
  where kind = 'prompt_lesson' and payload->>'source' = 'judge';

-- Реестр экзаменов: одна строка на тест ElevenLabs. НЕ в voice_agent_canon:
-- канон — эталон конфига агента, а не kv-склад (ревью 26.08); строка-на-тест
-- снимает и гонку read-modify-write jsonb-массива.
-- fail_streak: алерт только после 2 провалов подряд — LLM-грейдеры флапают.
create table if not exists voice_agent_tests (
  test_id text primary key,
  name text not null,
  source text not null check (source in ('seed', 'lesson')),
  lesson_id bigint,
  fail_streak int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table voice_agent_tests enable row level security;
do $$ begin create policy voice_agent_tests_deny on voice_agent_tests using (false) with check (false);
exception when duplicate_object then null; end $$;
