-- 371: statut nou «uzina nu a lucrat» — ziua liberă nu mai e raportată ca abatere
--
-- Ion, 17.09: «uneori sâmbăta lucrează ei». Măsurat pe toate cele 14 weekenduri cu GPS
-- (13.06–13.09), mașini ajunse la poarta uzinei:
--   * SEBN Orhei — a lucrat 10 sâmbete din 14 (20–25 mașini); n-a lucrat 25.07, 01.08,
--     08.08, 29.08. Duminică: o singură dată din 14 (14.06).
--   * Draxelmaier — lucrează aproape fiecare sâmbătă, dar cu 2–10 mașini din 69 planificate.
--   * TROX — 5 sâmbete din 14. SEBN Strășeni — 7, cu singura ei mașină.
--   * LEAR Ungheni (30 curse/sâmbătă) și LEAR Florești (8) — NICIUN weekend în trei luni.
--
-- Planul materializează însă weekendul întreg de fiecare dată, fiindcă works_saturday /
-- works_sunday sunt steaguri fixe. Rezultatul: 50–75 de «nepotriviri» în fiecare sâmbătă
-- și duminică, care nu sunt abateri ale nimănui — e uzina care n-a lucrat. De la 16.09
-- rezumatul zilnic pleacă la ADMIN, deci fără migrația asta Ion ar primi două alerte false
-- pe săptămână și ar înceta să le citească.
--
-- Un steag fix nu rezolvă: cu «uneori», `works_saturday = false` ar ascunde exact sâmbăta
-- în care uzina chiar lucrează. Verdictul îl dă realitatea, în verify.ts: dacă NICIO mașină
-- din planul uzinei n-a atins poarta în ziua aceea, uzina n-a lucrat, iar rândurile ei
-- primesc statutul ăsta în loc de `nepotrivire` și NU intră în alertă.
--
-- Separarea e fără zonă gri: într-o zi lucrată la Orhei ajung la poartă 20–25 de mașini
-- din plan, într-una nelucrată zero. Nu e un prag ales de noi — e «zero sau nu».

ALTER TABLE lde_atribuiri_zilnice DROP CONSTRAINT lde_atribuiri_zilnice_status_check;

ALTER TABLE lde_atribuiri_zilnice ADD CONSTRAINT lde_atribuiri_zilnice_status_check
  CHECK (status = ANY (ARRAY[
    'planificat', 'modificat_proactiv', 'modificat_reactiv',
    'confirmat_auto', 'confirmat_manual', 'nepotrivire', 'fara_date_gps',
    'uzina_nu_a_lucrat'
  ]));

COMMENT ON COLUMN lde_atribuiri_zilnice.status IS
  'Verdictul rândului. uzina_nu_a_lucrat = niciun vehicul din planul uzinei n-a atins poarta în ziua respectivă (vezi verify.ts): ziua liberă a uzinei, nu abaterea cuiva — nu intră în alerte și nu cere corecție.';
