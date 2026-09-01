-- ============================================================================
-- Rol nou: OBSERVATOR (01.09.2026)
--
-- Ion: «ещё один уровень пользователя — те, которые видят только календарь и
-- карту». Trei oameni: Ivan Pop, Patricia Rusnac, Mihail Pop.
--
-- Vede banda camioanelor (care ține și harta) și nimic altceva. NICIO scriere:
-- interdicția stă în `poateScrie` (lib/lde/camioane-nav.ts), aplicată pe fiecare
-- acțiune de server prin `cerereScriere`. Middleware-ul îl ține pe /lde/camioane.
--
-- De ce listă albă și nu una neagră: `poateAccesa` rezolvă orice subcale
-- necunoscută la rădăcină, deci un rol nou ar fi căpătat drept de scriere din
-- neatenție. Dreptul de a vedea și cel de a scrie sunt verificate separat.
-- ============================================================================
BEGIN;

ALTER TABLE admin_accounts DROP CONSTRAINT IF EXISTS admin_accounts_role_check;
ALTER TABLE admin_accounts ADD CONSTRAINT admin_accounts_role_check CHECK (
  role = ANY (ARRAY[
    'ADMIN', 'DISPATCHER', 'GRAFIC', 'OPERATOR_CAMERE', 'ADMIN_CAMERE',
    'EVALUATOR_INCASARI', 'CONTABIL', 'DEPOZITAR', 'VINZATOR', 'MANAGER',
    'GESTIONAR', 'UZINE', 'DISPECER', 'OBSERVATOR'
  ]::text[])
);

COMMIT;
