-- 505_bilete_telegram_mesaj.sql — ION-251 (05.10.2026): biletul în chatul botului = UN mesaj (imaginea + textul +
-- «Returnează»), fixat sus pe comanda cu cea mai apropiată plecare, și harta autobuzului trimisă o dată, cu o oră
-- înainte de plecare. Ion: «biletul foto cu qr codul și returnează să fie tot un mesaj»; «biletul actual care e cel mai
-- apropiat întotdeauna trebuie să fie pin»; «ok» la mesajul cu harta.
--   * telegram_mesaj_id        — mesajul cu biletul trimis de bot în chatul contului legat (prima imagine);
--   * telegram_mesaj_fixat_id  — mesajul acestei comenzi fixat ACUM în chat (NULL = comanda nu e fixată); botul repinează
--                                doar când ținta se schimbă, nu la fiecare tick;
--   * telegram_harta_trimisa_la — harta autobuzului a plecat (o singură dată pe comandă; se scrie după trimitere).
-- Fără funcții noi (nimic de revocat); tabela rămâne doar a service_role (483).

ALTER TABLE bilete_comenzi
  ADD COLUMN IF NOT EXISTS telegram_mesaj_id bigint,
  ADD COLUMN IF NOT EXISTS telegram_mesaj_fixat_id bigint,
  ADD COLUMN IF NOT EXISTS telegram_harta_trimisa_la timestamptz;

COMMENT ON COLUMN bilete_comenzi.telegram_mesaj_id IS 'ION-251: mesajul cu biletul (prima imagine) trimis de bot contului legat.';
COMMENT ON COLUMN bilete_comenzi.telegram_mesaj_fixat_id IS 'ION-251: mesajul acestei comenzi fixat acum în chat; NULL = nefixată.';
COMMENT ON COLUMN bilete_comenzi.telegram_harta_trimisa_la IS 'ION-251: harta autobuzului trimisă (o dată pe comandă), cu o oră înainte de plecare.';

-- Tickul botului (la 5/15 min) citește comenzile legate pe fereastra plecării și pe cele fixate.
CREATE INDEX IF NOT EXISTS bilete_comenzi_telegram_plecare_idx
  ON bilete_comenzi (departure_at) WHERE telegram_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bilete_comenzi_telegram_fixat_idx
  ON bilete_comenzi (telegram_id) WHERE telegram_mesaj_fixat_id IS NOT NULL;

-- Probe la aplicare (excepție → migrația nu se aplică).
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'bilete_comenzi'
     AND ((column_name IN ('telegram_mesaj_id', 'telegram_mesaj_fixat_id') AND data_type = 'bigint')
       OR (column_name = 'telegram_harta_trimisa_la' AND data_type = 'timestamp with time zone'));
  IF n <> 3 THEN RAISE EXCEPTION '505: coloanele noi lipsesc sau au alt tip (%)', n; END IF;
  IF has_table_privilege('anon', 'bilete_comenzi', 'SELECT') OR has_table_privilege('authenticated', 'bilete_comenzi', 'SELECT') THEN
    RAISE EXCEPTION '505: bilete_comenzi e vizibilă pentru anon/authenticated';
  END IF;
  IF NOT has_table_privilege('service_role', 'bilete_comenzi', 'UPDATE') THEN
    RAISE EXCEPTION '505: service_role (botul) nu poate scrie bilete_comenzi';
  END IF;
END $$;
