-- ============================================================================
-- Grafic interurban → grupa Telegram «Mejgorod» (Ion, 07.09.2026)
--
-- «Să apară un tick box la sfârșit de introducere grafic la interurbane; după
-- ce a introdus toată informația, să apară graficul (imaginea) cu toate cursele
-- în grupa Telegram Mejgorod, ca fiecare șofer să știe mâine pe ce cursă va fi.»
--
-- Tabela ține minte CÂND și CINE a trimis graficul pe o zi. Fără ea, bifa
-- s-ar pierde la reîncărcarea paginii, iar al doilea dispecer ar retrimite
-- același grafic — două imagini în grupă pe aceeași zi sunt exact confuzia
-- pe care bifa trebuia s-o scoată. O zi = un rând; retrimiterea (după o
-- corectare) suprascrie rândul, ca bifa să arate ultima trimitere.
--
-- Id-ul grupei stă în app_config sub cheia GRAFIC_GROUP_CONFIG_KEY
-- (@translux/db), scrisă de bot cu /lega_grafic — același tipar ca
-- /lega_reclamatii. Cheie separată de grupa reclamațiilor: nu e sigur că e
-- același chat, iar o imagine postată în grupa greșită nu se mai retrage.
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS grafic_group_posts (
  ziua date PRIMARY KEY,
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by uuid REFERENCES admin_accounts(id) ON DELETE SET NULL,
  -- Câte curse (cu șofer) erau pe imagine: dispecerul vede dintr-o privire
  -- dacă graficul a plecat întreg sau înainte de ultimele programări.
  rows_count integer NOT NULL DEFAULT 0,
  -- message_id din Telegram — pentru o eventuală ștergere/înlocuire ulterioară.
  telegram_message_id bigint,
  -- De câte ori a plecat graficul pe ziua asta (1 = prima dată).
  send_count integer NOT NULL DEFAULT 1
);
COMMENT ON TABLE grafic_group_posts IS 'Graficul interurban trimis in grupa Telegram Mejgorod (Ion, 07.09.2026). O zi = un rand; retrimiterea suprascrie.';
COMMENT ON COLUMN grafic_group_posts.rows_count IS 'Cate curse cu sofer erau pe imagine la trimitere.';
COMMENT ON COLUMN grafic_group_posts.send_count IS 'De cate ori a plecat graficul pe ziua asta (retrimiteri dupa corectari).';

ALTER TABLE grafic_group_posts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY grafic_group_posts_deny ON grafic_group_posts USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
