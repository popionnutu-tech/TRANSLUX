-- 545_social_posts_destinatie.sql — dezbaterea Claude + Codex pe planul clipurilor (Ion, 10.10.2026: «lansează claude gpt
-- dezbatere pe plan»), runda 1:
--  * C2 (Codex): relegarea topicului (/lega_social alt profil) nu mai mută clipurile deja confirmate — postarea ține
--    destinația văzută la primire: profilul Upload-Post, platformele, pagina Facebook.
--  * BL-2: un clip primit «în probă» rămâne probă și după ce apar cheile (nu pleacă public pe nepusă masă).
-- Tabelele sunt goale la aplicare (0 postări, 0 topicuri, 10.10), deci coloanele NOT NULL nu cer completare.
ALTER TABLE social_posts
  ADD COLUMN upload_post_user TEXT NOT NULL,
  ADD COLUMN platforme TEXT[] NOT NULL
    CHECK (platforme <@ ARRAY['tiktok', 'facebook', 'instagram']::TEXT[] AND cardinality(platforme) > 0),
  ADD COLUMN facebook_page_id TEXT,
  ADD COLUMN in_proba BOOLEAN NOT NULL;
