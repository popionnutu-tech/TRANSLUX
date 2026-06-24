-- Приглашения из Mini App («Echipa») создаёт админ, авторизованный через Telegram (users.id),
-- у которого нет строки в admin_accounts. created_by ссылается на admin_accounts(id) и был NOT NULL,
-- из-за чего такой insert падал по FK. Делаем created_by nullable — это аудит-поле,
-- веб-форма приглашений (admin_accounts-сессия) по-прежнему пишет валидный id.
alter table public.invite_tokens alter column created_by drop not null;
