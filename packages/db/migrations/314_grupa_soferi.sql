-- ============================================================================
-- Grupa șoferilor: reclamațiile din vina lor și lucrurile uitate (02.09.2026)
--
-- Ion: «botul nostru sa il punem in grupa sofer si cum apare plingere care e din
-- vina lor sa apara in grupa soferi reclamatii. Sau daca cineva ceva a pierdut —
-- tot sa apara in grupa».
--
-- Reclamațiile aveau deja dosar (migr. 307) și tip cu vinovat (migr. 310), deci
-- pentru ele nu trebuie nimic nou: mesajul pleacă în grupă în aceeași clipă în
-- care pleacă alerta către administratori, dacă tipul cade pe șofer.
--
-- Lucrurile uitate NU aveau nimic: find_past_trip identifica șoferul, îi dădea
-- numărul clientului și nu scria nicăieri. Ca să ajungă în grupă O SINGURĂ dată
-- pe apel — și ca Ion să aibă în sfârșit istoria lor — le trebuie un rând.
--
-- Numele obiectului nu se scrie NICĂIERI, nici aici: decizia lui Ion din 30.08
-- («numele obiectului nu contează, poate fi orice») s-a născut dintr-un apel în
-- care ASR-ul a stâlcit «ochelari» și modelul a ghicit «geantă», apoi «chiloți».
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS voice_lost_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id text,
  -- Cursa, așa cum a identificat-o serverul.
  trip_date date,
  departure text,
  route text,
  -- Șoferul la care a rămas obiectul. driver_id e legătura tare; numele și
  -- plăcuța rămân text pentru cazul în care omul iese din nomenclator.
  driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL,
  driver_name text,
  plate text,
  identified boolean NOT NULL DEFAULT false,
  -- Mesajul în grupa șoferilor pleacă O SINGURĂ dată, la sfârșitul apelului.
  -- În timpul convorbirii tool-ul e chemat de 1-3 ori și rândul doar se
  -- îmbogățește; un mesaj la fiecare apel al tool-ului ar umple grupa.
  group_notified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE voice_lost_items IS 'Lucrurile uitate în autobuz, cu șoferul identificat de server (Ion, 02.09.2026). Numele obiectului NU se păstrează — decizia lui Ion din 30.08.';
COMMENT ON COLUMN voice_lost_items.group_notified IS 'true = mesajul a plecat în grupa șoferilor. Pus la sfârșitul apelului, din webhook, nu din tool.';

-- O conversație = un obiect uitat. UNIQUE plin, nu parțial: parțialul rupe
-- onConflict în PostgREST (lecția 42P10, migr. 307).
CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_lost_items_conversation
  ON voice_lost_items (conversation_id);
CREATE INDEX IF NOT EXISTS idx_voice_lost_items_created_at
  ON voice_lost_items (created_at DESC);
-- «Câte obiecte au rămas la șoferul X» — raportul care va urma.
CREATE INDEX IF NOT EXISTS idx_voice_lost_items_driver
  ON voice_lost_items (driver_id, created_at DESC);

ALTER TABLE voice_lost_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY voice_lost_items_deny ON voice_lost_items USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
