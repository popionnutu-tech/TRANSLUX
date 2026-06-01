-- 088_normalize_stop_name_diacritics.sql
-- Problemă: numele de stații/localități aveau diacritice INCONSECVENTE — unele cu cedilă
-- veche (ţ = U+0163 / ş = U+015F), altele cu virgulă jos corectă (ț = U+021B / ș = U+0219).
-- Căutarea de pe site potrivește localities.name_ro cu crm_stop_fares.name_ro prin ILIKE
-- (sensibil la diacritice). Astfel, o localitate scrisă cu cedilă nu se potrivea cu stația
-- scrisă cu virgulă (și invers) → unele opriri apăreau în listă dar nu dădeau rezultate,
-- iar altele nu apăreau deloc pe site.
--
-- Stare înainte: crm_stop_fares = 62 rânduri cedilă / 502 virgulă; localities = 10 / 26.
-- Ex: „Măgdăcești" exista ca Măgdăceşti (cedilă, 26 rute) ȘI Măgdăcești (virgulă, 4 rute).
--
-- Fix: normalizăm TOATE numele la virgulă jos (ortografia română corectă, deja majoritară)
-- în ambele tabele. Pur cosmetic pentru bot/rapoarte; repară potrivirea pe site pentru
-- toate rutele/oprirele.  ţ→ț, ş→ș (+ majuscule Ţ→Ț, Ş→Ș)
--
-- Notă: lista de opriri de pe site vine din tabela `localities` (pickerul from/to),
-- NU din is_visible al crm_stop_fares (is_visible e folosit doar de admin Grafic).

BEGIN;

UPDATE crm_stop_fares
   SET name_ro = translate(name_ro, 'ţşŢŞ', 'țșȚȘ')
 WHERE name_ro ~ '[ţşŢŞ]';

UPDATE localities
   SET name_ro = translate(name_ro, 'ţşŢŞ', 'țșȚȘ')
 WHERE name_ro ~ '[ţşŢŞ]';

COMMIT;
