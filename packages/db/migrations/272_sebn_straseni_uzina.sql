-- 272_sebn_straseni_uzina.sql
-- Corectează 271: SEBN MD2 Strășeni devine uzină proprie, subdiviziune a SEBN Orhei.
--
-- DE CE. Migrația 271 a pus Strășeni în lde_uzine.gps_localities la SEBN_ORHEI, ca
-- verificarea GPS să accepte sosirea la filială. Dar lista e per UZINĂ, nu per cursă
-- (verify.ts: acceptedOf e keyed pe uzina_id, comparat pe rândul.direction). Efectul
-- real: toate cele 28 de curse SEBN acceptau Strășeni ca sosire validă.
-- Măsurat pe prod: 4 rânduri «nepotrivire» din 13–14.08 (mașina 552BRAO, cursele 25 și
-- 26 — ambele merg la Orhei) aveau opriri în Strășeni și NICIUNA în Orhei/Bucuria. Cu
-- lista lărgită ar fi devenit «confirmat_auto» — verdict IREVERSIBIL: confirmat_auto nu
-- intră în statusurile re-judecate nici la reverify=1 (verify.ts).
--
-- Uzină separată = city propriu, deci controlul rămâne ascuțit pe ambele platforme.
-- Legătura cu Orhei se păstrează explicit prin parent_uzina_id (cerința Ion: «SEBN
-- Strășeni ca subdiviziune la Orhei SEBN»).

-- 1) legătura filială → uzină-mamă
-- Fără index pe FK, intenționat (aceeași decizie ca la changed_by_admin în 251):
-- tabela-copil e chiar lde_uzine, 6 rânduri într-o singură pagină. Măsurat: verificarea
-- RI la ON DELETE SET NULL face seq scan de 1 buffer / 0,025 ms. Un index n-ar fi ales
-- niciodată de planificator, dar ar costa la fiecare scriere. Regula migrației 207
-- vizează FK-uri cu tabelă-copil care crește cu zeci de mii de rânduri pe an.
ALTER TABLE lde_uzine
  ADD COLUMN IF NOT EXISTS parent_uzina_id text REFERENCES lde_uzine(id) ON DELETE SET NULL;

COMMENT ON COLUMN lde_uzine.parent_uzina_id IS
  'Uzina-mamă când înregistrarea e o subdiviziune (filială) a altei fabrici; NULL = fabrică de sine stătătoare';

-- 2) revenirea listei GPS a Orheiului (anulează pasul 1 din migrația 271)
UPDATE lde_uzine SET gps_localities = ARRAY['Bucuria'] WHERE id = 'SEBN_ORHEI';

-- 3) filiala. Program identic cu Orhei (confirmat Ion 24.08); cursa are doar
--    schimburile 1 și 2, de aceea shift3_time rămâne NULL.
INSERT INTO lde_uzine
  (id, display_name, city, shift_pattern, shift1_time, shift2_time, shift3_time,
   works_saturday, works_sunday, has_weekly_template, parent_uzina_id, notes)
VALUES
  ('SEBN_STRASENI', 'SEBN Strășeni (MD2)', 'Strășeni', 'S1_S2_FIXED',
   '06:00-14:30', '14:30-23:00', NULL,
   true, true, true, 'SEBN_ORHEI', 'Filiala a doua SEBN (MD2). Subdiviziune a SEBN Orhei.')
ON CONFLICT (id) DO NOTHING;

-- 4) cursa trece la filială. Devine cursa 1 a uzinei noi (numărul 28 venea din
--    numerotarea Orheiului). Zero rânduri materializate în lde_atribuiri_zilnice la
--    momentul mutării — verificat pe prod, deci nu rămâne istoric cu direction greșit.
--
-- CAPCANĂ la orice mutare viitoare de cursă între uzine: route_key (generat, migr. 253)
-- NU conține uzina — e 'uzina:<factory_route_id>:<schimb>[:slot]'. Rândurile deja
-- materializate păstrează pentru totdeauna vechiul `direction`: cheia nu se schimbă,
-- deci ON CONFLICT le sare, iar bucla de resincronizare din ensureDaysMaterialized
-- filtrează pe crm_route_id IS NOT NULL, adică atinge doar rândurile CRM, nu pe cele
-- de uzină. Înainte de o mutare: SELECT count(*) FROM lde_atribuiri_zilnice WHERE
-- factory_route_id = '<ruta>'; dacă nu e zero, adaugă explicit UPDATE ... SET direction.
UPDATE lde_factory_routes
   SET uzina_id = 'SEBN_STRASENI', route_number = 1,
       rotation_note = 'filiala 2 SEBN (MD2), la Strășeni'
 WHERE uzina_id = 'SEBN_ORHEI' AND route_number = 28;
