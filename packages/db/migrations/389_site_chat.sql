-- 389: conversațiile asistentului de pe translux.md (ION-37)
--
-- Ion, 23.09.2026: «ca clientul să poată deschide și să se adreseze la asistent AI cu
-- întrebări, baza de date și cum lucrează să se lege cu PBX». Asistentul de pe site
-- cheamă aceleași tool-uri ca agentul de pe 060401010, deci reclamațiile și lucrurile
-- uitate ajung în voice_complaints / voice_lost_items, cu conversation_id `conv_site_…`.
-- Ce lipsea e locul conversației înseși: la telefon ea stă la ElevenLabs și în
-- voice_calls, pe site nu stă nicăieri.
--
-- Tabelul ține și istoria pe care o citește modelul la tura următoare. Istoria NU vine
-- din browser: un client care și-ar scrie singur «rezultatul tool-ului» ar putea face
-- modelul să creadă că a găsit o cursă sau un număr de șofer care nu există.
--
-- `ip_hash` — aceeași formă ca search_log (migr. 282): limita pe sursă se numără din el.

CREATE TABLE IF NOT EXISTS site_chat_conversations (
  id          text PRIMARY KEY CHECK (id ~ '^conv_site_[0-9a-f-]{36}$'),
  locale      text NOT NULL DEFAULT 'ro' CHECK (locale IN ('ro', 'ru')),
  ip_hash     text,
  -- Mesajele în forma Anthropic (text + tool_use + tool_result), exact cum le vede modelul.
  messages    jsonb NOT NULL DEFAULT '[]'::jsonb,
  turns       integer NOT NULL DEFAULT 0,
  -- Tool-urile chemate, în ordine — ca să se vadă dintr-o privire ce a făcut omul pe site.
  tools_used  text[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_chat_conversations_ip_updated
  ON site_chat_conversations (ip_hash, updated_at DESC);
CREATE INDEX IF NOT EXISTS site_chat_conversations_created
  ON site_chat_conversations (created_at DESC);

COMMENT ON TABLE site_chat_conversations IS
  'Conversațiile asistentului de pe translux.md (ION-37). Reclamațiile și lucrurile uitate '
  'din ele stau în voice_complaints / voice_lost_items cu același id (conv_site_…).';

-- Doar serverul (service role) citește și scrie: conversațiile au nume și numere de telefon.
ALTER TABLE site_chat_conversations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON site_chat_conversations FROM anon, authenticated;
