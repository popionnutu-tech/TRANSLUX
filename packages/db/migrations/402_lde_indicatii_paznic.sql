-- 402: §12.7 — dacă luni nu pleacă ceva, Ion află în bot (ION-62)
--
-- Ion, 25.09.2026: «trimitem luni; dacă nu se trimit, îmi dai mie în bot Ion Pop; pragul 100 km/săptămână ok».
-- Paznicul: apps/admin/src/lib/lde/luni-paznic.ts, /api/cron/lde-luni-paznic (chemat de lear-saptamanal.sh la
-- sfârșit și de copy-assignments luni seara). Idempotent: se adaugă doar dacă 12.7 lipsește.

UPDATE lde_uzine SET reguli_livrare_la = now(), reguli_livrare = reguli_livrare || $s127$
12.7 Pragul de 100 km pe săptămână e confirmat de Ion (25.09). Dacă luni nu pleacă ceva — raportul nescris, posterul sau indicațiile refuzate — ADMIN-ul (Ion) primește în bot, pe loc din rută și încă o dată luni seara de la paznic (lde-luni-paznic), ce anume lipsește și cum se retrimite de mână.$s127$
WHERE id IN ('LEAR_UNGHENI', 'LEAR_FLORESTI', 'SEBN_ORHEI', 'SEBN_STRASENI')
  AND reguli_livrare IS NOT NULL AND position('12. INDICAȚII' IN reguli_livrare) > 0 AND position('12.7 ' IN reguli_livrare) = 0;
