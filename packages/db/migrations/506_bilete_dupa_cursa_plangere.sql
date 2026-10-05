-- 506_bilete_dupa_cursa_plangere.sql — ION-252 (05.10.2026): după sosire biletul trece în «Istoric», pinul se scoate și
-- botul trimite O DATĂ mesajul «Mulțumim că ai călătorit cu TRANSLUX» cu 👍 / 👎; 👎 (sau textul liber pe care AI-ul îl
-- înțelege ca plângere) → plângerea clientului ajunge în voice_complaints și în grupa reclamațiilor, ca la telefon
-- (ION-247). Ion: «1. ok», «2. super»; «călătorul poate să lase plângere în Telegram bot».
--
-- bilete_comenzi:
--   * telegram_final_trimis_la — mesajul de după cursă a plecat (o dată pe comandă; se scrie după trimiterea reușită);
--   * feedback_client          — ce a apăsat clientul: «bine» (👍) sau «plangere» (👎);
--   * feedback_la              — când a apăsat.
-- voice_complaints (migr. 307…324 — fără coloană de sursă, fără CHECK de lărgit):
--   * telegram_id       — contul Telegram care a scris plângerea (plafonul 3/zi/cont se numără din el);
--   * bilet_comanda_id  — comanda din care vine plângerea (doar a acestui cont), de unde se iau cursa și șoferul;
--   * foto_file_id      — poza trimisă de client (file_id-ul botului; același bot trimite poza în grupă);
--   * sursa             — GENERATĂ din conversation_id: «telegram» (tg_…), «site» (conv_site_…, migr. 389), altfel
--                         «voce». Generată, nu scrisă de cod: rutele vechi (vocea, chatul site-ului) nu se schimbă și nu
--                         pot scrie o sursă greșită.
-- Fără funcții noi (nimic de revocat); ambele tabele rămân doar ale service_role (RLS deny-all, migr. 307 / 483).

ALTER TABLE bilete_comenzi
  ADD COLUMN IF NOT EXISTS telegram_final_trimis_la timestamptz,
  ADD COLUMN IF NOT EXISTS feedback_client text,
  ADD COLUMN IF NOT EXISTS feedback_la timestamptz;

DO $$ BEGIN
  ALTER TABLE bilete_comenzi ADD CONSTRAINT bilete_comenzi_feedback_client_check
    CHECK (feedback_client IS NULL OR feedback_client IN ('bine', 'plangere'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN bilete_comenzi.telegram_final_trimis_la IS 'ION-252: mesajul de după cursă (👍/👎) trimis contului legat; o dată pe comandă.';
COMMENT ON COLUMN bilete_comenzi.feedback_client IS 'ION-252: răspunsul clientului la mesajul de după cursă: bine (👍) sau plangere (👎).';
COMMENT ON COLUMN bilete_comenzi.feedback_la IS 'ION-252: când a răspuns clientul la mesajul de după cursă.';

ALTER TABLE voice_complaints
  ADD COLUMN IF NOT EXISTS telegram_id bigint,
  ADD COLUMN IF NOT EXISTS bilet_comanda_id uuid REFERENCES bilete_comenzi(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS foto_file_id text,
  ADD COLUMN IF NOT EXISTS sursa text GENERATED ALWAYS AS (
    CASE
      WHEN conversation_id LIKE 'tg\_%' THEN 'telegram'
      WHEN conversation_id LIKE 'conv\_site\_%' THEN 'site'
      ELSE 'voce'
    END
  ) STORED;

COMMENT ON COLUMN voice_complaints.telegram_id IS 'ION-252: contul Telegram care a scris plângerea în bot (plafon 3/zi/cont).';
COMMENT ON COLUMN voice_complaints.bilet_comanda_id IS 'ION-252: comanda de bilet online din care vine plângerea (legată de același cont).';
COMMENT ON COLUMN voice_complaints.foto_file_id IS 'ION-252: poza trimisă de client în bot (file_id Telegram al botului TRANSLUX).';
COMMENT ON COLUMN voice_complaints.sursa IS 'ION-252: de unde a venit reclamația, din conversation_id: telegram (tg_…), site (conv_site_…), voce.';

-- Plafonul plângerilor din bot: rândurile contului din ziua curentă.
CREATE INDEX IF NOT EXISTS idx_voice_complaints_telegram
  ON voice_complaints (telegram_id, created_at DESC) WHERE telegram_id IS NOT NULL;

-- Probe la aplicare (excepție → migrația nu se aplică).
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'bilete_comenzi'
     AND ((column_name IN ('telegram_final_trimis_la', 'feedback_la') AND data_type = 'timestamp with time zone')
       OR (column_name = 'feedback_client' AND data_type = 'text'));
  IF n <> 3 THEN RAISE EXCEPTION '506: coloanele noi din bilete_comenzi lipsesc sau au alt tip (%)', n; END IF;

  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'voice_complaints'
     AND ((column_name = 'telegram_id' AND data_type = 'bigint')
       OR (column_name = 'bilet_comanda_id' AND data_type = 'uuid')
       OR (column_name = 'foto_file_id' AND data_type = 'text')
       OR (column_name = 'sursa' AND data_type = 'text' AND is_generated = 'ALWAYS'));
  IF n <> 4 THEN RAISE EXCEPTION '506: coloanele noi din voice_complaints lipsesc sau au alt tip (%)', n; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bilete_comenzi_feedback_client_check'
                  AND conrelid = 'public.bilete_comenzi'::regclass) THEN
    RAISE EXCEPTION '506: CHECK-ul pe feedback_client lipsește';
  END IF;

  -- Sursa generată: rândurile vechi ale chatului de pe site sunt «site», restul «voce»; niciun «telegram» încă.
  IF EXISTS (SELECT 1 FROM voice_complaints WHERE conversation_id LIKE 'conv\_site\_%' AND sursa <> 'site') THEN
    RAISE EXCEPTION '506: sursa reclamațiilor de pe site nu iese «site»';
  END IF;
  IF EXISTS (SELECT 1 FROM voice_complaints WHERE sursa = 'telegram') THEN
    RAISE EXCEPTION '506: există deja reclamații «telegram» înainte de ION-252';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.voice_complaints'::regclass) THEN
    RAISE EXCEPTION '506: RLS e oprit pe voice_complaints';
  END IF;
  IF has_table_privilege('anon', 'bilete_comenzi', 'SELECT') OR has_table_privilege('authenticated', 'bilete_comenzi', 'SELECT') THEN
    RAISE EXCEPTION '506: bilete_comenzi e vizibilă pentru anon/authenticated';
  END IF;
  IF NOT has_table_privilege('service_role', 'bilete_comenzi', 'UPDATE')
     OR NOT has_table_privilege('service_role', 'voice_complaints', 'INSERT') THEN
    RAISE EXCEPTION '506: service_role (botul / panoul) nu poate scrie';
  END IF;
END $$;
