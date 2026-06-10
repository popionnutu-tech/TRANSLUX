-- Fereastră de corectare 10 min pentru operator (spec 2026-06-10).
-- completed_at = momentul PRIMEI finalizări a sesiunii de numărare.
-- Se setează o singură dată (nu se resetează la re-salvări în fereastră).
-- NULL la sesiunile finalizate înainte de această migrație => fereastră expirată.
ALTER TABLE counting_sessions ADD COLUMN IF NOT EXISTS completed_at timestamptz;
