-- 219: "task board" — зеркалирование задач исполнителя в Telegram-группу.
-- Привязка: группа (chat_id) → чьи задачи постить. Сейчас включаем Vlad (DIGITAL).
create table if not exists public.task_board_bindings (
  chat_id     bigint primary key,                              -- Telegram group chat_id (отрицательный)
  assignee_id uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- Какая задача уже выложена в какую группу (анти-дубль + история; message_id для будущих правок).
create table if not exists public.task_board_posts (
  obligation_id uuid   not null references public.obligations(id) on delete cascade,
  chat_id       bigint not null,
  message_id    bigint,
  posted_at     timestamptz not null default now(),
  primary key (obligation_id, chat_id)
);
create index if not exists idx_task_board_posts_chat on public.task_board_posts (chat_id);

-- Доступ только через service_role (как остальные таблицы бота). RLS on без политик = deny-all.
alter table public.task_board_bindings enable row level security;
alter table public.task_board_posts enable row level security;

comment on table public.task_board_bindings is 'Telegram-группа → чьи задачи зеркалить (доска задач). Vlad = DIGITAL.';
comment on table public.task_board_posts is 'Анти-дубль: какая obligation уже выложена в какую группу (+ message_id).';
