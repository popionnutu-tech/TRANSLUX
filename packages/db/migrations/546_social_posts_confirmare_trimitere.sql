-- 546_social_posts_confirmare_trimitere.sql — dezbaterea Claude + Codex pe planul clipurilor (Ion, 10.10.2026:
-- «lansează claude gpt dezbatere pe plan»), runda 2:
--  * C8 (Codex): postarea intră «neconfirmat» și devine «planificat» (publicabilă) DOAR după ce mesajul cu butoanele
--    Anulează/Mută a ajuns în topic și id-ul lui e salvat. O repornire între cele două lasă un rând nepublicabil.
--  * C7 (Codex): `trimis_posibil` = fișierul a plecat spre Upload-Post fără confirmare. Se scrie ÎNAINTEA apelului extern,
--    nu se șterge la reîncercări sau repostări; doar un rezultat explicit de la Upload-Post îl lămurește. Cât e true,
--    repostarea folosește același rând (aceeași cheie de idempotență), deci un clip care plecase nu iese de două ori.
-- Tabelele sunt goale (0 postări, 10.10).
ALTER TABLE social_posts DROP CONSTRAINT IF EXISTS social_posts_stare_check;
ALTER TABLE social_posts ADD CONSTRAINT social_posts_stare_check CHECK (stare IN (
  'neconfirmat', 'planificat', 'se_publica', 'trimis', 'publicat', 'esuat', 'anulat', 'proba'));
ALTER TABLE social_posts ALTER COLUMN stare SET DEFAULT 'neconfirmat';
ALTER TABLE social_posts ADD COLUMN trimis_posibil BOOLEAN NOT NULL DEFAULT false;
