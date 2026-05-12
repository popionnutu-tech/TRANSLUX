-- 077: IP-фильтр для офисных ролей
--
-- Создаёт таблицу role_allowed_ips и helper-функцию для проверки IP.
-- Используется в apps/admin для блокировки входа из-вне офиса для
-- ролей OPERATOR_CAMERE, ADMIN_CAMERE, EVALUATOR_INCASARI.
--
-- Поведение: если в таблице нет ни одной активной записи для роли —
-- фильтр НЕ применяется (fail-open). Это значит, после применения миграции
-- ничего не сломается, операторы продолжат работать как раньше, пока
-- администратор не добавит первый IP через UI /users/ip-access.

CREATE TABLE IF NOT EXISTS role_allowed_ips (
  id          BIGSERIAL PRIMARY KEY,
  role        TEXT NOT NULL,
  cidr        INET NOT NULL,
  label       TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT
);

-- Только для ролей, которые мы реально хотим защищать по IP
ALTER TABLE role_allowed_ips
  ADD CONSTRAINT role_allowed_ips_role_check
  CHECK (role IN ('OPERATOR_CAMERE', 'ADMIN_CAMERE', 'EVALUATOR_INCASARI'));

CREATE INDEX IF NOT EXISTS role_allowed_ips_role_active_idx
  ON role_allowed_ips(role) WHERE active = true;

ALTER TABLE role_allowed_ips ENABLE ROW LEVEL SECURITY;
-- Никаких политик для anon — таблица доступна только service_role (админка).

-- Helper-функция: проверить, разрешён ли IP для роли.
-- Возвращает true если:
--   а) есть хотя бы одно активное правило для роли И IP попадает в один из CIDR
--   б) ИЛИ для роли нет активных правил вообще (fail-open)
CREATE OR REPLACE FUNCTION ip_allowed_for_role(p_role TEXT, p_ip INET)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT
    NOT EXISTS (SELECT 1 FROM role_allowed_ips WHERE role = p_role AND active = true)
    OR EXISTS (
      SELECT 1 FROM role_allowed_ips
      WHERE role = p_role AND active = true AND cidr >>= p_ip
    );
$$;

-- Удобная функция: список IP-правил для роли (используется UI-страницей)
CREATE OR REPLACE FUNCTION list_role_ips(p_role TEXT)
RETURNS TABLE(id BIGINT, cidr TEXT, label TEXT, active BOOLEAN, created_at TIMESTAMPTZ)
LANGUAGE SQL
STABLE
AS $$
  SELECT id, cidr::TEXT, label, active, created_at
  FROM role_allowed_ips
  WHERE role = p_role
  ORDER BY created_at DESC;
$$;

-- Seed: IP офиса Translux для всех трёх защищённых ролей.
-- 77.89.228.230 — IP, который владелец указал как офисный.
-- Если этот IP изменится — администратор обновит запись через UI /users/ip-access.
INSERT INTO role_allowed_ips (role, cidr, label, active)
VALUES
  ('OPERATOR_CAMERE',     '77.89.228.230/32', 'Office Chisinau', true),
  ('ADMIN_CAMERE',        '77.89.228.230/32', 'Office Chisinau', true),
  ('EVALUATOR_INCASARI',  '77.89.228.230/32', 'Office Chisinau', true)
ON CONFLICT DO NOTHING;
