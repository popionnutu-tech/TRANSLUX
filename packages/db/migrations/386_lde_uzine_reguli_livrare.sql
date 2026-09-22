-- 386: regulile livrării, marcate pe fiecare uzină
--
-- Ion, 22.09.2026: «fiecare livrare uzina are ai reguli, trebuie sa marcam».
--
-- Pagina /lde/livrare-reguli (ION-27) scrie regula generală, așa cum s-a așezat pe SEBN.
-- Dar ea a fost verificată rută cu rută doar la Orhei și Strășeni (18–19.09). La celelalte
-- patru uzine mecanismul rulează — Draxelmaier are 100 de rute×schimb cu sat de start dedus,
-- Ungheni 32, Trox 14, Florești 6 — dar nimeni n-a confirmat că regula e cea potrivită acolo.
--
-- Deosebirea asta trăia într-o constantă din cod (UZINE_IMPLICITE) și în capul celui care a
-- fost de față. Aici devine dată: un steag pe care se poate citi și scrie, și un text în care
-- Ion dictează ce e special la fiecare uzină.
ALTER TABLE lde_uzine
  ADD COLUMN IF NOT EXISTS livrare_validata boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reguli_livrare text,
  ADD COLUMN IF NOT EXISTS reguli_livrare_la timestamptz;

COMMENT ON COLUMN lde_uzine.livrare_validata IS
  'Regulile livrării au fost verificate cu Ion rută cu rută la uzina asta. Posterul de '
  'livrare pleacă implicit doar pe uzinele cu steagul ăsta. false = mecanismul rulează, '
  'dar nimeni n-a confirmat că regula e cea potrivită aici.';
COMMENT ON COLUMN lde_uzine.reguli_livrare IS
  'Regula livrării la uzina asta, în cuvintele lui Ion: ce e livrare acolo, ce nu, ce e '
  'special față de regula generală de pe /lde/livrare-reguli.';
COMMENT ON COLUMN lde_uzine.reguli_livrare_la IS 'Când a fost marcată ultima dată regula uzinei.';

-- Starea de azi: exact uzinele din UZINE_IMPLICITE (Ion, 19.09, verificate rută cu rută).
UPDATE lde_uzine SET livrare_validata = true WHERE id IN ('SEBN_ORHEI', 'SEBN_STRASENI');
