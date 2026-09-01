-- ============================================================================
-- Reclamații la agentul vocal — vinovatul identificat (01.09.2026)
--
-- Ion: «in cazul reclamatiilor noi trebuie clar sa identificam cine este
-- vinovatul, daca nu identificam soferul - nu e clar responsabilitatea».
--
-- Apelul 01.09 (+380960426128, Bălți–Criva, 01:30, «Mihai», 250 lei în loc de
-- 68) a intrat ca simplu text în voice_callback_requests.reason: fără cursă,
-- fără mașină, fără șofer. Nimeni nu putea cerceta nimic.
--
-- De ce tabelă separată de voice_callback_requests:
--   o cerere de apel înapoi și o reclamație sunt două lucruri diferite —
--   prima e o coadă de sunat (Ion 24.08: nimeni nu sună înapoi), a doua e un
--   dosar cu responsabil. Amestecate într-un singur rând, ambele își pierd
--   sensul: `reason` nu poate fi în același timp motiv de apel și acuzație.
--
-- Identificarea o face SERVERUL (register-complaint refoloseste căutarea din
-- find-past-trip), nu modelul: numele șoferului scris de LLM nu e probă.
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS voice_complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id text,
  caller_phone text,
  complaint text,
  -- Cursa reclamată, așa cum a identificat-o serverul.
  trip_date date,
  departure text,
  route text,
  -- Vinovatul. driver_id e legătura tare; numele și plăcuța rămân scrise ca
  -- text pentru cazul în care șoferul e șters din nomenclator mai târziu.
  driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL,
  driver_name text,
  plate text,
  -- false = clientul n-a putut da destule detalii. Rândul se păstrează pentru
  -- statistică, dar clientului i se spune pe loc că fără mașină sau șofer
  -- reclamația nu se poate cerceta (decizia lui Ion, 01.09).
  identified boolean NOT NULL DEFAULT false,
  -- Alerta în Telegram pleacă O SINGURĂ dată, când cazul ajunge la capăt:
  -- vinovatul găsit, sau clientul a spus că nu mai știe nimic. Apelurile
  -- intermediare ale tool-ului doar îmbogățesc rândul, în tăcere.
  alerted boolean NOT NULL DEFAULT false,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE voice_complaints IS 'Reclamațiile primite de agentul vocal, cu vinovatul identificat de server (cursă + șofer + mașină). Separată de voice_callback_requests: acolo e coada de apeluri, aici e dosarul cu responsabil.';
COMMENT ON COLUMN voice_complaints.identified IS 'true = un singur șofer a corespuns detaliilor date de client. false = reclamație fără responsabil, nu se poate cerceta.';

-- O conversație = O reclamație (același tipar ca migr. 273): agentul o
-- înregistrează la primul semn și o îmbogățește la fiecare detaliu nou.
-- UNIQUE plin, nu parțial — parțialul rupe onConflict în PostgREST (lecția 42P10).
CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_complaints_conversation
  ON voice_complaints (conversation_id);
CREATE INDEX IF NOT EXISTS idx_voice_complaints_created_at
  ON voice_complaints (created_at DESC);
-- Raportul «câte reclamații are șoferul X» — scopul întregii migrații.
CREATE INDEX IF NOT EXISTS idx_voice_complaints_driver
  ON voice_complaints (driver_id, created_at DESC);

ALTER TABLE voice_complaints ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY voice_complaints_deny ON voice_complaints USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
