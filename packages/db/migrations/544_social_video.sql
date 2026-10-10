-- 544_social_video.sql — Ion, 10.10.2026: «hai să realizăm» planul «Plan bot Telegram – postare video și comentarii»
-- (doc claude.ai 2MSfo943spWNgcxhwNTiux, 09.10) + «noi boți avem, putem folosi ce îl avem pentru translux și pentru tlx».
-- Bloggerii postează clipuri în topicurile a două supergrupuri (botul Translux: Translux 1–2; botul TLX: TLX 1–4);
-- botul Translux le planifică și le publică prin Upload-Post, fără aprobare.
--  * social_topics   — un topic = un profil Upload-Post (setul de conturi TikTok/Facebook/Instagram al lui).
--  * social_bloggers — lista albă a topicului: doar ei (și adminii) pot posta clipuri care pleacă public.
--  * social_posts    — calendarul: fiecare clip, ora planificată, starea, rezultatul publicării.
-- Doar botul (service role) citește și scrie: RLS pornit, fără politici, drepturile anon/authenticated retrase.

CREATE TABLE social_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot TEXT NOT NULL CHECK (bot IN ('translux', 'tlx')),
  chat_id BIGINT NOT NULL,
  thread_id INTEGER NOT NULL,
  nume TEXT NOT NULL,
  upload_post_user TEXT NOT NULL,
  platforme TEXT[] NOT NULL DEFAULT '{tiktok}'
    CHECK (platforme <@ ARRAY['tiktok', 'facebook', 'instagram']::TEXT[] AND cardinality(platforme) > 0),
  facebook_page_id TEXT,
  -- Cine e contul, pentru textele scrise de AI (tonul, publicul). Gol → descrierea implicită a brandului.
  descriere TEXT,
  hashtags TEXT[] NOT NULL DEFAULT '{}',
  -- Orele de publicare (ora Chișinăului) și decalajul topicului față de celelalte, ca TikTok să nu vadă
  -- același clip pe 6 conturi în același minut.
  ore TEXT[] NOT NULL DEFAULT '{12:30,19:30}',
  decalaj_min INTEGER NOT NULL DEFAULT 0 CHECK (decalaj_min BETWEEN 0 AND 180),
  max_pe_zi INTEGER NOT NULL DEFAULT 1 CHECK (max_pe_zi BETWEEN 1 AND 10),
  primul_comentariu TEXT,
  activ BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chat_id, thread_id)
);

CREATE TABLE social_bloggers (
  topic_id UUID NOT NULL REFERENCES social_topics(id) ON DELETE CASCADE,
  telegram_id BIGINT NOT NULL,
  nume TEXT,
  adaugat_de BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (topic_id, telegram_id)
);

CREATE TABLE social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES social_topics(id) ON DELETE CASCADE,
  tip TEXT NOT NULL CHECK (tip IN ('video', 'story')),
  -- Unde stă clipul în Telegram: se descarcă abia la ora publicării, direct din mesaj.
  chat_id BIGINT NOT NULL,
  thread_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  file_unique_id TEXT NOT NULL,
  file_size BIGINT,
  durata_s INTEGER,
  mime TEXT,
  autor_telegram_id BIGINT NOT NULL,
  autor_nume TEXT,
  nota_autor TEXT,
  text_final TEXT NOT NULL,
  text_ai BOOLEAN NOT NULL DEFAULT true,
  planificat_la TIMESTAMPTZ NOT NULL,
  -- planificat → se_publica (luat de publicator) → trimis (Upload-Post l-a primit) → publicat | esuat;
  -- anulat de admin; proba = ora a venit, dar publicarea reală nu e pornită (lipsesc cheile).
  stare TEXT NOT NULL DEFAULT 'planificat'
    CHECK (stare IN ('planificat', 'se_publica', 'trimis', 'publicat', 'esuat', 'anulat', 'proba')),
  incercari INTEGER NOT NULL DEFAULT 0,
  luat_la TIMESTAMPTZ,
  upload_request_id TEXT,
  rezultate JSONB,
  eroare TEXT,
  mesaj_confirmare_id INTEGER,
  anulat_de BIGINT,
  publicat_la TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (topic_id, file_unique_id, tip)
);

CREATE INDEX idx_social_posts_stare ON social_posts (stare, planificat_la);
CREATE INDEX idx_social_posts_topic ON social_posts (topic_id, planificat_la DESC);

ALTER TABLE social_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_bloggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON social_topics, social_bloggers, social_posts FROM anon, authenticated;
