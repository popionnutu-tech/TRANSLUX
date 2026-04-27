# Evaluator Încasări — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construiește un panou de revizie zilnică pentru rolul nou `EVALUATOR_INCASARI` care permite corecturi manuale (asignare la șofer / ignorare ca eroare) pentru plățile Tomberon ce nu pot fi mapate automat, plus confirmare semnătură pe zi.

**Architecture:** Strat de override-uri peste datele brute Tomberon (tabel `tomberon_payment_overrides`), separat de /grafic-ul dispecerului. Funcția `get_incasare_report` aplică prioritar override-urile și, în absența lor, matching-ul global existent. Confirmarea zilei e doar audit (`incasare_day_confirmations`), nu blochează editarea.

**Tech Stack:** PostgreSQL/Supabase (migrații + RPC plpgsql), Next.js 14 server actions, React 18 client component cu state management local.

**Spec:** `docs/superpowers/specs/2026-04-27-evaluator-incasari-design.md`

---

## File Structure

**Create:**
- `packages/db/migrations/049_evaluator_incasari_role.sql` — adaugă rolul în CHECK constraint
- `packages/db/migrations/050_tomberon_payment_overrides.sql` — tabela override-uri
- `packages/db/migrations/051_incasare_day_confirmations.sql` — tabela confirmări
- `packages/db/migrations/052_get_incasare_report_v2.sql` — RPC nou cu override-uri + categorii + breakdown + confirmation
- `apps/web/src/app/(dashboard)/numarare/tabs/AnomalyCard.tsx` — card individual de alertă
- `apps/web/src/app/(dashboard)/numarare/tabs/AssignDriverModal.tsx` — modal picker șofer
- `apps/web/src/app/(dashboard)/numarare/tabs/IgnoreModal.tsx` — modal cu textarea pentru notă

**Modify:**
- `packages/db/src/types.ts` — adaugă `EVALUATOR_INCASARI` în `AdminRole`
- `apps/web/src/app/(dashboard)/numarare/tabs/incasareActions.ts` — tipuri noi + 5 server actions noi + roluri actualizate
- `apps/web/src/app/(dashboard)/numarare/tabs/IncasareTab.tsx` — restructurat complet
- `apps/web/src/app/(dashboard)/numarare/NumararePageClient.tsx` — `EVALUATOR_INCASARI` vede doar tab Încasare
- `apps/web/src/middleware.ts` — `EVALUATOR_INCASARI` poate accesa `/numarare`
- `apps/web/src/components/Sidebar.tsx` — `EVALUATOR_INCASARI` vede doar `/numarare`
- `apps/web/src/app/(dashboard)/users/UsersClient.tsx` — etichetă în Romanian pentru rolul nou

---

## Task 1: Migrația 049 — Rol nou EVALUATOR_INCASARI

**Files:**
- Create: `packages/db/migrations/049_evaluator_incasari_role.sql`
- Modify: `packages/db/src/types.ts:37`

- [ ] **Step 1: Scrie migrația SQL**

```sql
-- 049_evaluator_incasari_role.sql
-- Adaugă rolul EVALUATOR_INCASARI pentru utilizatorul care revizuiește
-- plățile zilnice de la Tomberon (asignare manuală + confirmare zi).

DO $$
BEGIN
  ALTER TABLE admin_accounts DROP CONSTRAINT IF EXISTS admin_accounts_role_check;
  ALTER TABLE admin_accounts ADD CONSTRAINT admin_accounts_role_check
    CHECK (role IN ('ADMIN', 'DISPATCHER', 'GRAFIC', 'OPERATOR_CAMERE', 'ADMIN_CAMERE', 'EVALUATOR_INCASARI'));
END$$;

COMMENT ON CONSTRAINT admin_accounts_role_check ON admin_accounts IS
  'Roluri admin: ADMIN, DISPATCHER, GRAFIC, OPERATOR_CAMERE (operator camere video), ADMIN_CAMERE (admin numărare), EVALUATOR_INCASARI (revizie zilnică plăți Tomberon).';
```

- [ ] **Step 2: Actualizează tipul TypeScript**

Modifică `packages/db/src/types.ts` linia 37:

```typescript
export type AdminRole = 'ADMIN' | 'DISPATCHER' | 'GRAFIC' | 'OPERATOR_CAMERE' | 'ADMIN_CAMERE' | 'EVALUATOR_INCASARI';
```

- [ ] **Step 3: Aplică migrația via MCP Supabase**

Apelează `mcp__supabase__apply_migration` cu `project_id="zqkzqpfdymddsywxjxow"`, `name="049_evaluator_incasari_role"` și conținutul SQL de mai sus.

Verifică:
```sql
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'admin_accounts_role_check';
```
Expected: include `EVALUATOR_INCASARI` în lista IN.

- [ ] **Step 4: Commit**

```bash
git add packages/db/migrations/049_evaluator_incasari_role.sql packages/db/src/types.ts
git commit -m "feat(roles): add EVALUATOR_INCASARI role for Tomberon payment review [deploy-fix]"
```

---

## Task 2: Migrația 050 — Tabela tomberon_payment_overrides

**Files:**
- Create: `packages/db/migrations/050_tomberon_payment_overrides.sql`

- [ ] **Step 1: Scrie migrația**

```sql
-- 050_tomberon_payment_overrides.sql
-- Override-uri manuale făcute de evaluator peste matching-ul automat
-- foaie ↔ șofer din funcția get_incasare_report.
--
-- Granularitate: (receipt_nr, ziua) — același nivel ca agregarea raportului.
-- O singură decizie per (foaie, zi). Nu modifică datele brute Tomberon
-- și nici /grafic-ul dispecerului.

CREATE TYPE public.tomberon_override_action AS ENUM ('ASSIGN', 'IGNORE');

CREATE TABLE IF NOT EXISTS public.tomberon_payment_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_nr text NOT NULL CHECK (receipt_nr <> ''),
  ziua date NOT NULL,
  action tomberon_override_action NOT NULL,
  driver_id uuid REFERENCES drivers(id) ON DELETE RESTRICT,
  note text,
  created_by uuid NOT NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES admin_accounts(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (receipt_nr, ziua),
  CONSTRAINT chk_assign_has_driver CHECK (
    (action = 'ASSIGN' AND driver_id IS NOT NULL) OR
    (action = 'IGNORE' AND driver_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_tomberon_overrides_ziua ON public.tomberon_payment_overrides(ziua);
CREATE INDEX IF NOT EXISTS idx_tomberon_overrides_driver ON public.tomberon_payment_overrides(driver_id) WHERE driver_id IS NOT NULL;

COMMENT ON TABLE public.tomberon_payment_overrides IS
  'Corecturi manuale pentru plățile Tomberon care nu pot fi mapate automat (foaie lipsă, duplicat, format atipic). Făcute de rolul EVALUATOR_INCASARI.';
COMMENT ON COLUMN public.tomberon_payment_overrides.action IS
  'ASSIGN = atribuie plata șoferului din driver_id; IGNORE = exclude plata din raport (eroare casa, voucher test etc.)';
```

- [ ] **Step 2: Aplică migrația via MCP**

`apply_migration` cu name `050_tomberon_payment_overrides`.

- [ ] **Step 3: Verifică schema**

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'tomberon_payment_overrides'
ORDER BY ordinal_position;
```

Expected: 10 coloane în ordine: id, receipt_nr, ziua, action, driver_id, note, created_by, created_at, updated_by, updated_at.

- [ ] **Step 4: Commit**

```bash
git add packages/db/migrations/050_tomberon_payment_overrides.sql
git commit -m "feat(incasare): add tomberon_payment_overrides table [deploy-fix]"
```

---

## Task 3: Migrația 051 — Tabela incasare_day_confirmations

**Files:**
- Create: `packages/db/migrations/051_incasare_day_confirmations.sql`

- [ ] **Step 1: Scrie migrația**

```sql
-- 051_incasare_day_confirmations.sql
-- Semnătura zilnică a evaluatorului: "Am verificat ziua X la data Y".
-- E doar audit trail — nu blochează editarea ulterioară.

CREATE TABLE IF NOT EXISTS public.incasare_day_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ziua date NOT NULL UNIQUE,
  confirmed_by uuid NOT NULL REFERENCES admin_accounts(id),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  note text
);

CREATE INDEX IF NOT EXISTS idx_incasare_confirmations_ziua ON public.incasare_day_confirmations(ziua);

COMMENT ON TABLE public.incasare_day_confirmations IS
  'Semnătura evaluatorului că o zi a fost verificată. Audit trail, nu blochează editarea.';
```

- [ ] **Step 2: Aplică migrația via MCP**

`apply_migration` cu name `051_incasare_day_confirmations`.

- [ ] **Step 3: Verifică**

```sql
\d incasare_day_confirmations
```
Expected: 5 coloane, UNIQUE pe ziua.

- [ ] **Step 4: Commit**

```bash
git add packages/db/migrations/051_incasare_day_confirmations.sql
git commit -m "feat(incasare): add incasare_day_confirmations table [deploy-fix]"
```

---

## Task 4: Migrația 052 — Funcția get_incasare_report v2

**Files:**
- Create: `packages/db/migrations/052_get_incasare_report_v2.sql`

- [ ] **Step 1: Scrie funcția nouă cu override-uri + categorii + breakdown + confirmare**

```sql
-- 052_get_incasare_report_v2.sql
-- Versiunea 2: aplică override-uri evaluator, categorisește anomaliile (A/B/C),
-- include breakdown complet pe tipuri (numerar/card/lgotnici/dop_rashodi/comment/fiscal_nr),
-- returnează statusul de confirmare al zilei.
--
-- Ordine logică:
-- 1. Pentru fiecare (receipt_nr, ziua) din Tomberon, verifică override:
--    - ASSIGN → atribuie șoferului din override
--    - IGNORE → exclude complet
--    - Lipsă → matching automat (LATERAL pe driver_cashin_receipts)
-- 2. Anomaliile sunt plățile FĂRĂ override și care nu se potrivesc niciunui driver:
--    A) NO_FOAIE: receipt_nr cu format valid (7 cifre) dar absent din driver_cashin_receipts
--    B) DUPLICATE_FOAIE: receipt_nr apare la >=2 înregistrări în driver_cashin_receipts
--    C) INVALID_FORMAT: receipt_nr nu respectă pattern-ul ^[0-9]{7}$

CREATE OR REPLACE FUNCTION public.get_incasare_report(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'tomberon'
AS $function$
DECLARE
  v_rows         jsonb;
  v_anomalies    jsonb;
  v_confirmation jsonb;
BEGIN
  WITH numarare AS (
    SELECT cs.driver_id,
           SUM(COALESCE(cs.tur_total_lei,0) + COALESCE(cs.retur_total_lei,0))::numeric AS suma
    FROM counting_sessions cs
    WHERE cs.assignment_date BETWEEN p_from AND p_to
      AND cs.driver_id IS NOT NULL
    GROUP BY cs.driver_id
  ),
  -- Agregăm tomberon per (receipt_nr, ziua)
  incasare_raw AS (
    SELECT t.sofer_id AS receipt_nr,
           t.ziua,
           SUM(COALESCE(t.suma_numerar,0))::numeric AS total,
           SUM(COALESCE(t.suma_incash,0))::numeric  AS numerar,
           COUNT(*)::int                            AS plati,
           SUM(COALESCE(t.lgotniki_count,0))::int   AS lgotniki,
           SUM(COALESCE(t.lgotniki_suma,0))::numeric AS lgotniki_suma,
           SUM(COALESCE(t.dop_rashodi,0))::numeric  AS rashodi,
           string_agg(DISTINCT NULLIF(t.comment,''), ' | ') AS comment,
           string_agg(DISTINCT NULLIF(t.fiscal_receipt_nr,''), ', ') AS fiscal_nr
    FROM tomberon.transactions t
    WHERE t.ziua BETWEEN p_from AND p_to
    GROUP BY t.sofer_id, t.ziua
  ),
  -- Atașează override-ul (dacă există)
  incasare_with_override AS (
    SELECT ir.*,
           ovr.action AS ovr_action,
           ovr.driver_id AS ovr_driver_id
    FROM incasare_raw ir
    LEFT JOIN tomberon_payment_overrides ovr
      ON ovr.receipt_nr = ir.receipt_nr AND ovr.ziua = ir.ziua
  ),
  -- Mapăm la șofer:
  --   override ASSIGN → driver din override
  --   override IGNORE → exclus (nu apare în mapped)
  --   fără override → LATERAL JOIN cu cea mai recentă intrare /grafic
  incasare_mapped AS (
    SELECT
      COALESCE(iwo.ovr_driver_id, auto_match.driver_id) AS driver_id,
      iwo.total, iwo.numerar, iwo.plati, iwo.lgotniki, iwo.rashodi
    FROM incasare_with_override iwo
    LEFT JOIN LATERAL (
      SELECT r.driver_id
      FROM driver_cashin_receipts r
      WHERE r.receipt_nr = iwo.receipt_nr
        AND r.ziua <= iwo.ziua
      ORDER BY r.ziua DESC, r.created_at DESC
      LIMIT 1
    ) auto_match ON iwo.ovr_action IS NULL OR iwo.ovr_action <> 'ASSIGN'
    WHERE iwo.ovr_action IS DISTINCT FROM 'IGNORE'  -- exclude IGNORE
      AND COALESCE(iwo.ovr_driver_id, auto_match.driver_id) IS NOT NULL
  ),
  incasare_aggregated AS (
    SELECT driver_id,
           SUM(total)    AS total,
           SUM(numerar)  AS numerar,
           SUM(plati)    AS plati,
           SUM(lgotniki) AS lgotniki,
           SUM(rashodi)  AS rashodi
    FROM incasare_mapped
    GROUP BY driver_id
  ),
  all_drivers AS (
    SELECT driver_id FROM numarare
    UNION
    SELECT driver_id FROM incasare_aggregated
  ),
  merged AS (
    SELECT ad.driver_id,
           d.full_name,
           COALESCE(n.suma, 0)         AS numarare_lei,
           COALESCE(im.total, 0)       AS incasare_lei,
           COALESCE(im.numerar, 0)     AS incasare_numerar,
           COALESCE(im.total, 0) - COALESCE(im.numerar, 0) AS incasare_card,
           COALESCE(im.plati, 0)       AS plati,
           COALESCE(im.lgotniki, 0)    AS lgotniki_count,
           COALESCE(im.rashodi, 0)     AS dop_rashodi,
           (COALESCE(im.total,0) - COALESCE(n.suma,0)) AS diff,
           CASE
             WHEN COALESCE(n.suma,0) > 0 AND COALESCE(im.total,0) = 0 THEN 'no_cashin'
             WHEN COALESCE(n.suma,0) = 0 AND COALESCE(im.total,0) > 0 THEN 'no_numarare'
             WHEN COALESCE(n.suma,0) > 0 AND ABS(COALESCE(im.total,0) - COALESCE(n.suma,0)) / COALESCE(n.suma,0) <= 0.05 THEN 'ok'
             WHEN COALESCE(im.total,0) < COALESCE(n.suma,0) THEN 'underpaid'
             ELSE 'overpaid'
           END AS status
    FROM all_drivers ad
    LEFT JOIN drivers              d  ON d.id = ad.driver_id
    LEFT JOIN numarare             n  ON n.driver_id = ad.driver_id
    LEFT JOIN incasare_aggregated im ON im.driver_id = ad.driver_id
  )
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'driver_id',        m.driver_id,
        'driver_name',      m.full_name,
        'cashin_sofer_id',  NULL,
        'numarare_lei',     ROUND(m.numarare_lei::numeric, 2),
        'incasare_lei',     ROUND(m.incasare_lei::numeric, 2),
        'incasare_numerar', ROUND(m.incasare_numerar::numeric, 2),
        'incasare_card',    ROUND(m.incasare_card::numeric, 2),
        'plati',            m.plati,
        'lgotniki_count',   m.lgotniki_count,
        'dop_rashodi',      ROUND(m.dop_rashodi::numeric, 2),
        'diff',             ROUND(m.diff::numeric, 2),
        'status',           m.status
      )
      ORDER BY
        CASE m.status
          WHEN 'underpaid' THEN 0
          WHEN 'no_cashin' THEN 1
          WHEN 'overpaid'  THEN 2
          WHEN 'no_numarare' THEN 3
          ELSE 4
        END,
        m.numarare_lei DESC
    ), '[]'::jsonb)
  INTO v_rows
  FROM merged m;

  -- Anomalii: doar plățile FĂRĂ override care nu pot fi mapate automat
  WITH ir AS (
    SELECT t.sofer_id AS receipt_nr,
           t.ziua,
           SUM(COALESCE(t.suma_numerar,0))::numeric AS suma,
           SUM(COALESCE(t.suma_incash,0))::numeric  AS incash,
           COUNT(*)::int AS plati,
           SUM(COALESCE(t.lgotniki_count,0))::int AS lgotniki_count,
           SUM(COALESCE(t.lgotniki_suma,0))::numeric AS lgotniki_suma,
           SUM(COALESCE(t.dop_rashodi,0))::numeric AS dop_rashodi,
           string_agg(DISTINCT NULLIF(t.comment,''), ' | ') AS comment,
           string_agg(DISTINCT NULLIF(t.fiscal_receipt_nr,''), ', ') AS fiscal_nr
    FROM tomberon.transactions t
    WHERE t.ziua BETWEEN p_from AND p_to
    GROUP BY t.sofer_id, t.ziua
  ),
  matches AS (
    SELECT ir.*,
           (SELECT COUNT(*) FROM driver_cashin_receipts r WHERE r.receipt_nr = ir.receipt_nr) AS grafic_count,
           CASE WHEN ir.receipt_nr ~ '^[0-9]{7}$' THEN true ELSE false END AS valid_format,
           EXISTS(SELECT 1 FROM tomberon_payment_overrides ovr WHERE ovr.receipt_nr = ir.receipt_nr AND ovr.ziua = ir.ziua) AS has_override
    FROM ir
  )
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'receipt_nr',     m.receipt_nr,
        'ziua',           m.ziua,
        'category',       CASE
                            WHEN NOT m.valid_format THEN 'INVALID_FORMAT'
                            WHEN m.grafic_count >= 2 THEN 'DUPLICATE_FOAIE'
                            ELSE 'NO_FOAIE'
                          END,
        'plati',          m.plati,
        'incasare_lei',   ROUND(m.suma::numeric, 2),
        'breakdown',      jsonb_build_object(
                            'numerar',        ROUND(m.suma::numeric, 2),
                            'card',           ROUND((COALESCE(m.incash,0) - m.suma)::numeric, 2),
                            'lgotnici_count', m.lgotniki_count,
                            'lgotnici_suma',  ROUND(m.lgotniki_suma::numeric, 2),
                            'dop_rashodi',    ROUND(m.dop_rashodi::numeric, 2),
                            'comment',        m.comment,
                            'fiscal_nr',      m.fiscal_nr
                          ),
        'duplicate_candidates', CASE WHEN m.grafic_count >= 2 THEN
          (SELECT jsonb_agg(jsonb_build_object('driver_id', r.driver_id, 'driver_name', d.full_name, 'ziua', r.ziua))
           FROM driver_cashin_receipts r LEFT JOIN drivers d ON d.id = r.driver_id
           WHERE r.receipt_nr = m.receipt_nr ORDER BY r.ziua DESC LIMIT 5)
        ELSE NULL END
      )
      ORDER BY m.suma DESC
    ), '[]'::jsonb)
  INTO v_anomalies
  FROM matches m
  WHERE NOT m.has_override
    AND (
      NOT m.valid_format                                -- C
      OR m.grafic_count = 0                             -- A
      OR m.grafic_count >= 2                            -- B
    );

  -- Confirmare zi (doar pentru ziua p_from = p_to; altfel null)
  IF p_from = p_to THEN
    SELECT jsonb_build_object(
      'confirmed_by_id',   c.confirmed_by,
      'confirmed_by_name', a.name,
      'confirmed_at',      c.confirmed_at,
      'note',              c.note,
      'has_new_payments_after', EXISTS(
        SELECT 1 FROM tomberon.transactions t
        WHERE t.ziua = p_from AND t.synced_at > c.confirmed_at
      )
    )
    INTO v_confirmation
    FROM incasare_day_confirmations c
    LEFT JOIN admin_accounts a ON a.id = c.confirmed_by
    WHERE c.ziua = p_from;
  END IF;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'anomalies', v_anomalies,
    'confirmation', COALESCE(v_confirmation, 'null'::jsonb)
  );
END;
$function$;
```

- [ ] **Step 2: Aplică migrația via MCP**

`apply_migration` cu name `052_get_incasare_report_v2`.

- [ ] **Step 3: Verifică funcția**

```sql
SELECT jsonb_pretty(get_incasare_report('2026-04-26', '2026-04-26'));
```

Expected:
- `rows` = 24 șoferi (cum era înainte)
- `anomalies` = 3 elemente (`0945257` cat=NO_FOAIE; `00142955` și `00142956` cat=INVALID_FORMAT)
- Fiecare anomalie are `breakdown` cu numerar/card/lgotnici/etc.
- `confirmation` = null

- [ ] **Step 4: Commit**

```bash
git add packages/db/migrations/052_get_incasare_report_v2.sql
git commit -m "feat(incasare): get_incasare_report v2 - overrides, categories, breakdown [deploy-fix]"
```

---

## Task 5: Server actions noi în incasareActions.ts

**Files:**
- Modify: `apps/web/src/app/(dashboard)/numarare/tabs/incasareActions.ts`

- [ ] **Step 1: Înlocuiește conținutul fișierului**

```typescript
'use server';

import { getSupabase } from '@/lib/supabase';
import { verifySession } from '@/lib/auth';

// ─── Tipuri ───

export type IncasareStatus = 'ok' | 'underpaid' | 'overpaid' | 'no_cashin' | 'no_numarare';
export type AnomalyCategory = 'NO_FOAIE' | 'DUPLICATE_FOAIE' | 'INVALID_FORMAT';
export type OverrideAction = 'ASSIGN' | 'IGNORE';

export interface IncasareRow {
  driver_id: string | null;
  driver_name: string | null;
  cashin_sofer_id: string | null;
  numarare_lei: number;
  incasare_lei: number;
  incasare_numerar: number;
  incasare_card: number;
  plati: number;
  lgotniki_count: number;
  dop_rashodi: number;
  diff: number;
  status: IncasareStatus;
}

export interface AnomalyBreakdown {
  numerar: number;
  card: number;
  lgotnici_count: number;
  lgotnici_suma: number;
  dop_rashodi: number;
  comment: string | null;
  fiscal_nr: string | null;
}

export interface DuplicateCandidate {
  driver_id: string;
  driver_name: string | null;
  ziua: string;
}

export interface Anomaly {
  receipt_nr: string;
  ziua: string;
  category: AnomalyCategory;
  plati: number;
  incasare_lei: number;
  breakdown: AnomalyBreakdown;
  duplicate_candidates: DuplicateCandidate[] | null;
}

export interface Confirmation {
  confirmed_by_id: string;
  confirmed_by_name: string | null;
  confirmed_at: string;
  note: string | null;
  has_new_payments_after: boolean;
}

export interface IncasareReportResult {
  rows: IncasareRow[];
  anomalies: Anomaly[];
  confirmation: Confirmation | null;
}

const VIEWER_ROLES = ['ADMIN', 'EVALUATOR_INCASARI'] as const;
const EDITOR_ROLES = ['EVALUATOR_INCASARI'] as const;

function isViewer(role: string): boolean {
  return (VIEWER_ROLES as readonly string[]).includes(role);
}

function isEditor(role: string): boolean {
  return (EDITOR_ROLES as readonly string[]).includes(role);
}

// ─── Loader principal ───

export async function getIncasareReport(
  fromDate: string,
  toDate: string,
): Promise<{ data?: IncasareReportResult; error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };
  if (!isViewer(session.role)) return { error: 'Acces interzis' };

  const sb = getSupabase();
  const { data, error } = await sb.rpc('get_incasare_report', {
    p_from: fromDate,
    p_to: toDate || fromDate,
  });

  if (error) return { error: error.message };

  const payload = data as IncasareReportResult | null;
  return {
    data: {
      rows: payload?.rows || [],
      anomalies: payload?.anomalies || [],
      confirmation: payload?.confirmation || null,
    },
  };
}

// ─── Acțiuni evaluator ───

export async function assignOverride(
  receiptNr: string,
  ziua: string,
  driverId: string,
  note: string | null,
): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };
  if (!isEditor(session.role)) return { error: 'Doar evaluatorul poate face corecturi' };
  if (!receiptNr || !ziua || !driverId) return { error: 'Date lipsă' };

  const sb = getSupabase();
  const { error } = await sb.from('tomberon_payment_overrides').upsert(
    {
      receipt_nr: receiptNr,
      ziua,
      action: 'ASSIGN',
      driver_id: driverId,
      note: note?.trim() || null,
      created_by: session.id,
      updated_by: session.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'receipt_nr,ziua' },
  );
  if (error) return { error: error.message };
  return {};
}

export async function ignoreOverride(
  receiptNr: string,
  ziua: string,
  note: string,
): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };
  if (!isEditor(session.role)) return { error: 'Doar evaluatorul poate face corecturi' };
  if (!receiptNr || !ziua) return { error: 'Date lipsă' };
  if (!note?.trim()) return { error: 'Nota e obligatorie pentru a marca ca eroare' };

  const sb = getSupabase();
  const { error } = await sb.from('tomberon_payment_overrides').upsert(
    {
      receipt_nr: receiptNr,
      ziua,
      action: 'IGNORE',
      driver_id: null,
      note: note.trim(),
      created_by: session.id,
      updated_by: session.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'receipt_nr,ziua' },
  );
  if (error) return { error: error.message };
  return {};
}

export async function deleteOverride(
  receiptNr: string,
  ziua: string,
): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };
  if (!isEditor(session.role)) return { error: 'Doar evaluatorul poate șterge corecturi' };

  const sb = getSupabase();
  const { error } = await sb
    .from('tomberon_payment_overrides')
    .delete()
    .match({ receipt_nr: receiptNr, ziua });
  if (error) return { error: error.message };
  return {};
}

export async function confirmDay(
  ziua: string,
  note: string | null,
): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };
  if (!isEditor(session.role)) return { error: 'Doar evaluatorul poate confirma ziua' };
  if (!ziua) return { error: 'Data lipsă' };

  // Verifică că nu mai sunt anomalii
  const sb = getSupabase();
  const { data, error: rpcErr } = await sb.rpc('get_incasare_report', {
    p_from: ziua,
    p_to: ziua,
  });
  if (rpcErr) return { error: rpcErr.message };
  const anomalies = (data as IncasareReportResult)?.anomalies || [];
  if (anomalies.length > 0) {
    return { error: `Mai sunt ${anomalies.length} alerte nerezolvate. Rezolvă-le toate înainte de confirmare.` };
  }

  const { error } = await sb.from('incasare_day_confirmations').upsert(
    {
      ziua,
      confirmed_by: session.id,
      confirmed_at: new Date().toISOString(),
      note: note?.trim() || null,
    },
    { onConflict: 'ziua' },
  );
  if (error) return { error: error.message };
  return {};
}

export async function unconfirmDay(ziua: string): Promise<{ error?: string }> {
  const session = await verifySession();
  if (!session) return { error: 'Neautorizat' };
  if (!isEditor(session.role)) return { error: 'Doar evaluatorul poate anula confirmarea' };

  const sb = getSupabase();
  const { error } = await sb
    .from('incasare_day_confirmations')
    .delete()
    .eq('ziua', ziua);
  if (error) return { error: error.message };
  return {};
}

// ─── Loader pentru lista de șoferi (pentru picker) ───

export interface DriverOption {
  id: string;
  full_name: string;
}

export async function getActiveDriversForPicker(): Promise<DriverOption[]> {
  const session = await verifySession();
  if (!session || !isEditor(session.role)) return [];

  const sb = getSupabase();
  const { data } = await sb
    .from('drivers')
    .select('id, full_name')
    .eq('active', true)
    .order('full_name');
  return (data || []) as DriverOption[];
}
```

- [ ] **Step 2: Verifică tipul și sintaxa**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "incasareActions" || echo "OK"`
Expected: `OK` (fără erori)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/numarare/tabs/incasareActions.ts
git commit -m "feat(incasare): server actions for evaluator (assign/ignore/delete/confirm) [deploy-fix]"
```

---

## Task 6: Componente — AnomalyCard, AssignDriverModal, IgnoreModal

**Files:**
- Create: `apps/web/src/app/(dashboard)/numarare/tabs/AnomalyCard.tsx`
- Create: `apps/web/src/app/(dashboard)/numarare/tabs/AssignDriverModal.tsx`
- Create: `apps/web/src/app/(dashboard)/numarare/tabs/IgnoreModal.tsx`

- [ ] **Step 1: Scrie AssignDriverModal.tsx**

```tsx
'use client';

import { useState, useEffect } from 'react';
import type { DriverOption, DuplicateCandidate } from './incasareActions';
import { getActiveDriversForPicker } from './incasareActions';

interface Props {
  open: boolean;
  receiptNr: string;
  ziua: string;
  candidates?: DuplicateCandidate[] | null;  // pentru tip B
  onConfirm: (driverId: string, note: string | null) => Promise<void>;
  onClose: () => void;
}

export default function AssignDriverModal({ open, receiptNr, ziua, candidates, onConfirm, onClose }: Props) {
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open && drivers.length === 0) {
      getActiveDriversForPicker().then(setDrivers);
    }
  }, [open, drivers.length]);

  const filtered = drivers.filter(d =>
    d.full_name.toLowerCase().includes(filter.toLowerCase())
  );

  if (!open) return null;

  async function handleConfirm() {
    if (!selectedId) { setErr('Alege un șofer'); return; }
    setBusy(true);
    setErr('');
    try {
      await onConfirm(selectedId, note.trim() || null);
      setSelectedId('');
      setNote('');
      setFilter('');
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div className="card" style={{ background: 'var(--bg)', padding: 20, minWidth: 480, maxWidth: 600, maxHeight: '85vh', overflow: 'auto' }}>
        <h3 style={{ margin: '0 0 12px 0' }}>Asignează la șofer</h3>
        <p className="text-muted" style={{ fontSize: 13, margin: '0 0 12px 0' }}>
          Foaia <strong style={{ fontFamily: 'var(--font-mono)' }}>{receiptNr}</strong> · ziua <strong>{ziua}</strong>
        </p>

        {candidates && candidates.length > 0 && (
          <div style={{
            background: 'var(--warning-dim)', padding: 12, borderRadius: 6, marginBottom: 12,
            border: '1px solid var(--warning)',
          }}>
            <p style={{ fontSize: 12, fontWeight: 600, margin: '0 0 8px 0' }}>
              ⚠ Foaia apare deja la {candidates.length} șoferi în /grafic. Alege rapid:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {candidates.map(c => (
                <button
                  key={c.driver_id}
                  type="button"
                  onClick={() => setSelectedId(c.driver_id)}
                  className="btn btn-sm"
                  style={{
                    textAlign: 'left',
                    background: selectedId === c.driver_id ? 'var(--success-dim)' : 'transparent',
                    border: '1px solid ' + (selectedId === c.driver_id ? 'var(--success)' : 'var(--border)'),
                  }}
                >
                  {c.driver_name || '—'} <span className="text-muted" style={{ fontSize: 11 }}>({c.ziua})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <input
          type="text"
          placeholder="Caută șofer..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="form-control"
          style={{ width: '100%', marginBottom: 8 }}
        />

        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          size={8}
          className="form-control"
          style={{ width: '100%', marginBottom: 12 }}
        >
          {filtered.map(d => (
            <option key={d.id} value={d.id}>{d.full_name}</option>
          ))}
        </select>

        <textarea
          placeholder="Notă (opțional) — ex: 'recunoscut după sumă și rută'"
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={2}
          className="form-control"
          style={{ width: '100%', marginBottom: 12, resize: 'vertical' }}
        />

        {err && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} className="btn" disabled={busy}>Anulează</button>
          <button type="button" onClick={handleConfirm} className="btn btn-primary" disabled={busy || !selectedId}>
            {busy ? 'Se salvează...' : 'Salvează'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Scrie IgnoreModal.tsx**

```tsx
'use client';

import { useState } from 'react';

interface Props {
  open: boolean;
  receiptNr: string;
  ziua: string;
  onConfirm: (note: string) => Promise<void>;
  onClose: () => void;
}

export default function IgnoreModal({ open, receiptNr, ziua, onConfirm, onClose }: Props) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!open) return null;

  async function handleConfirm() {
    if (!note.trim()) { setErr('Nota e obligatorie'); return; }
    setBusy(true);
    setErr('');
    try {
      await onConfirm(note.trim());
      setNote('');
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div className="card" style={{ background: 'var(--bg)', padding: 20, minWidth: 420, maxWidth: 520 }}>
        <h3 style={{ margin: '0 0 12px 0' }}>Marchează ca eroare casă</h3>
        <p className="text-muted" style={{ fontSize: 13, margin: '0 0 12px 0' }}>
          Foaia <strong style={{ fontFamily: 'var(--font-mono)' }}>{receiptNr}</strong> · ziua <strong>{ziua}</strong> va fi <strong>exclusă</strong> din raport.
        </p>
        <textarea
          placeholder="Motiv (obligatoriu) — ex: 'voucher test', 'eroare casa pe X.YZ'"
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={3}
          className="form-control"
          style={{ width: '100%', marginBottom: 12, resize: 'vertical' }}
          autoFocus
        />
        {err && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} className="btn" disabled={busy}>Anulează</button>
          <button type="button" onClick={handleConfirm} className="btn btn-danger" disabled={busy}>
            {busy ? 'Se salvează...' : 'Marchează ignorat'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Scrie AnomalyCard.tsx**

```tsx
'use client';

import type { Anomaly } from './incasareActions';

interface Props {
  anomaly: Anomaly;
  canEdit: boolean;
  onAssignClick: () => void;
  onIgnoreClick: () => void;
}

const CATEGORY_META: Record<Anomaly['category'], { label: string; color: string; bg: string }> = {
  NO_FOAIE: { label: 'Foaie absentă în /grafic', color: 'var(--danger)', bg: 'var(--danger-dim)' },
  DUPLICATE_FOAIE: { label: 'Foaie duplicată', color: 'var(--warning)', bg: 'var(--warning-dim)' },
  INVALID_FORMAT: { label: 'Format atipic', color: '#9b27b0', bg: 'rgba(155,39,176,0.1)' },
};

export default function AnomalyCard({ anomaly, canEdit, onAssignClick, onIgnoreClick }: Props) {
  const meta = CATEGORY_META[anomaly.category];
  const b = anomaly.breakdown;

  return (
    <div className="card" style={{
      padding: 14,
      borderLeft: `4px solid ${meta.color}`,
      background: meta.bg,
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700 }}>{anomaly.receipt_nr}</span>
            <span style={{ color: meta.color, fontSize: 12, fontWeight: 600 }}>{meta.label}</span>
            <span className="text-muted" style={{ fontSize: 12 }}>· {anomaly.ziua}</span>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 6, fontSize: 12, marginTop: 6,
          }}>
            <div><span className="text-muted">Numerar:</span> <strong>{Math.round(b.numerar)} lei</strong></div>
            <div><span className="text-muted">Card:</span> <strong>{Math.round(b.card)} lei</strong></div>
            <div><span className="text-muted">Lgotnici:</span> <strong>{b.lgotnici_count} ({Math.round(b.lgotnici_suma)} lei)</strong></div>
            <div><span className="text-muted">Dop. rashodi:</span> <strong>{Math.round(b.dop_rashodi)} lei</strong></div>
            {b.fiscal_nr && <div><span className="text-muted">Fiscal:</span> <span style={{ fontFamily: 'var(--font-mono)' }}>{b.fiscal_nr}</span></div>}
            {b.comment && <div><span className="text-muted">Comentariu:</span> {b.comment}</div>}
          </div>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160 }}>
            <button type="button" onClick={onAssignClick} className="btn btn-primary btn-sm">
              Asignează la șofer
            </button>
            <button type="button" onClick={onIgnoreClick} className="btn btn-sm" style={{ background: 'var(--danger)', color: 'white' }}>
              Marchează ignorat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verifică tipuri**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep -E "AnomalyCard|AssignDriverModal|IgnoreModal" || echo "OK"`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/numarare/tabs/AnomalyCard.tsx apps/web/src/app/\(dashboard\)/numarare/tabs/AssignDriverModal.tsx apps/web/src/app/\(dashboard\)/numarare/tabs/IgnoreModal.tsx
git commit -m "feat(incasare): anomaly card + assign/ignore modals [deploy-fix]"
```

---

## Task 7: Restructurare IncasareTab.tsx

**Files:**
- Modify: `apps/web/src/app/(dashboard)/numarare/tabs/IncasareTab.tsx` (rewrite complet)

- [ ] **Step 1: Înlocuiește conținutul cu varianta nouă**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getIncasareReport,
  assignOverride,
  ignoreOverride,
  confirmDay,
  unconfirmDay,
  type IncasareRow,
  type IncasareStatus,
  type Anomaly,
  type Confirmation,
} from './incasareActions';
import AnomalyCard from './AnomalyCard';
import AssignDriverModal from './AssignDriverModal';
import IgnoreModal from './IgnoreModal';

function todayChisinau(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
}
function yesterdayChisinau(): string {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
}

const STATUS_META: Record<IncasareStatus, { label: string; color: string; icon: string }> = {
  ok:          { label: 'OK',             color: 'var(--success)', icon: '✓' },
  underpaid:   { label: 'Datorează',      color: 'var(--danger)',  icon: '⚠' },
  overpaid:    { label: 'Plătit în plus', color: 'var(--warning)', icon: 'ℹ' },
  no_cashin:   { label: 'Fără încasare',  color: 'var(--danger)',  icon: '✗' },
  no_numarare: { label: 'Fără numărare',  color: 'var(--warning)', icon: '?' },
};

interface Props {
  role: string;  // 'ADMIN' | 'EVALUATOR_INCASARI'
}

export default function IncasareTab({ role }: Props) {
  const canEdit = role === 'EVALUATOR_INCASARI';
  const [from, setFrom] = useState<string>(yesterdayChisinau);
  const [to, setTo] = useState<string>(yesterdayChisinau);
  const [rows, setRows] = useState<IncasareRow[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [assignTarget, setAssignTarget] = useState<Anomaly | null>(null);
  const [ignoreTarget, setIgnoreTarget] = useState<Anomaly | null>(null);

  const isSingleDay = from === to;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await getIncasareReport(from, to);
      if (res.error) {
        setError(res.error);
        setRows([]); setAnomalies([]); setConfirmation(null);
      } else if (res.data) {
        setRows(res.data.rows);
        setAnomalies(res.data.anomalies);
        setConfirmation(res.data.confirmation);
      }
    } finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const totalNumarare = rows.reduce((s, r) => s + r.numarare_lei, 0);
  const totalIncasare = rows.reduce((s, r) => s + r.incasare_lei, 0);
  const totalNumerar  = rows.reduce((s, r) => s + (r.incasare_numerar || 0), 0);
  const totalCard     = rows.reduce((s, r) => s + (r.incasare_card || 0), 0);
  const totalDiff     = totalIncasare - totalNumarare;

  async function handleAssign(driverId: string, note: string | null) {
    if (!assignTarget) return;
    const res = await assignOverride(assignTarget.receipt_nr, assignTarget.ziua, driverId, note);
    if (res.error) throw new Error(res.error);
    await load();
  }
  async function handleIgnore(note: string) {
    if (!ignoreTarget) return;
    const res = await ignoreOverride(ignoreTarget.receipt_nr, ignoreTarget.ziua, note);
    if (res.error) throw new Error(res.error);
    await load();
  }
  async function handleConfirmDay() {
    if (!isSingleDay) return;
    const res = await confirmDay(from, null);
    if (res.error) { setError(res.error); return; }
    await load();
  }
  async function handleUnconfirmDay() {
    if (!isSingleDay) return;
    if (!confirm('Sigur anulezi confirmarea zilei?')) return;
    const res = await unconfirmDay(from);
    if (res.error) { setError(res.error); return; }
    await load();
  }

  return (
    <div>
      {/* Header + filter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Încasare vs. Numărare</h2>
          <p className="text-muted" style={{ fontSize: 13, margin: '6px 0 0 0' }}>
            Suma calculată la numărare vs. suma efectiv depusă la casa automată.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="text-muted" style={{ fontSize: 13 }}>De la</span>
          <input type="date" value={from} onChange={e => { const v = e.target.value; setFrom(v); if (v > to) setTo(v); }} className="form-control" style={{ width: 150 }} />
          <span className="text-muted" style={{ fontSize: 13 }}>până la</span>
          <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className="form-control" style={{ width: 150 }} />
        </div>
      </div>

      {error && (
        <div style={{ background: 'var(--danger-dim)', color: 'var(--danger)', padding: '10px 16px', borderRadius: 'var(--radius-xs)', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Bara de status zi (doar pentru o singură zi selectată) */}
      {isSingleDay && (
        <div className="card" style={{ padding: 12, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {confirmation ? (
              <>
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                  ✓ Confirmat de {confirmation.confirmed_by_name || '—'}
                </span>
                <span className="text-muted" style={{ fontSize: 12 }}>
                  ({new Date(confirmation.confirmed_at).toLocaleString('ro-RO')})
                </span>
                {confirmation.has_new_payments_after && (
                  <span style={{ color: 'var(--warning)', fontSize: 12, fontWeight: 600 }}>
                    ⚠ Au apărut plăți noi după confirmare — re-revizuiește
                  </span>
                )}
              </>
            ) : anomalies.length > 0 ? (
              <span style={{ color: 'var(--warning)', fontWeight: 600 }}>
                ⚠ {anomalies.length} alerte nerezolvate
              </span>
            ) : (
              <span className="text-muted">Neconfirmat</span>
            )}
          </div>
          {canEdit && (
            <div style={{ display: 'flex', gap: 8 }}>
              {confirmation ? (
                <button type="button" onClick={handleUnconfirmDay} className="btn btn-sm">Anulează confirmarea</button>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirmDay}
                  className="btn btn-primary btn-sm"
                  disabled={anomalies.length > 0}
                  title={anomalies.length > 0 ? `Rezolvă ${anomalies.length} alerte mai întâi` : ''}
                >
                  Confirmă ziua
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Anomalii */}
      {anomalies.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, margin: '0 0 8px 0', color: 'var(--warning)' }}>
            ⚠ {anomalies.length} {anomalies.length === 1 ? 'alertă' : 'alerte'} de revizuit
          </h3>
          {anomalies.map(a => (
            <AnomalyCard
              key={`${a.receipt_nr}-${a.ziua}`}
              anomaly={a}
              canEdit={canEdit}
              onAssignClick={() => setAssignTarget(a)}
              onIgnoreClick={() => setIgnoreTarget(a)}
            />
          ))}
        </div>
      )}

      {/* Totals */}
      <div className="card" style={{ display: 'flex', gap: 24, padding: 14, marginBottom: 12, flexWrap: 'wrap' }}>
        <div><span className="text-muted">Numărare:</span> <strong>{Math.round(totalNumarare)} lei</strong></div>
        <div><span className="text-muted">Încasare total:</span> <strong>{Math.round(totalIncasare)} lei</strong></div>
        <div><span className="text-muted">  cash:</span> <strong>{Math.round(totalNumerar)} lei</strong></div>
        <div><span className="text-muted">  card:</span> <strong>{Math.round(totalCard)} lei</strong></div>
        <div>
          <span className="text-muted">Δ:</span>{' '}
          <strong style={{ color: totalDiff < 0 ? 'var(--danger)' : totalDiff > 0 ? 'var(--warning)' : 'var(--success)' }}>
            {totalDiff >= 0 ? '+' : ''}{Math.round(totalDiff)} lei
          </strong>
        </div>
        <div className="text-muted" style={{ fontSize: 12 }}>Șoferi: {rows.length}</div>
      </div>

      {/* Tabelul de șoferi */}
      <div className="card">
        {loading ? (
          <p className="text-muted" style={{ textAlign: 'center', padding: 20 }}>Se încarcă...</p>
        ) : rows.length === 0 ? (
          <p className="text-muted" style={{ textAlign: 'center', padding: 20 }}>Nu există date pentru perioada selectată.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Șofer</th>
                <th style={{ textAlign: 'right' }}>Numărare</th>
                <th style={{ textAlign: 'right' }}>Încasare</th>
                <th style={{ textAlign: 'right' }}>Cash</th>
                <th style={{ textAlign: 'right' }}>Card</th>
                <th style={{ textAlign: 'right' }}>Δ</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const meta = STATUS_META[r.status];
                return (
                  <tr key={r.driver_id || r.driver_name}>
                    <td style={{ fontWeight: 600 }}>{r.driver_name || '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {r.numarare_lei ? `${Math.round(r.numarare_lei)} lei` : <span className="text-muted">—</span>}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {r.incasare_lei ? `${Math.round(r.incasare_lei)} lei` : <span className="text-muted">—</span>}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {r.incasare_numerar ? `${Math.round(r.incasare_numerar)} lei` : <span className="text-muted">—</span>}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      {r.incasare_card ? `${Math.round(r.incasare_card)} lei` : '—'}
                    </td>
                    <td style={{
                      textAlign: 'right', fontFamily: 'var(--font-mono)',
                      color: r.diff < 0 ? 'var(--danger)' : r.diff > 0 ? 'var(--warning)' : 'var(--text-muted)',
                      fontWeight: 600,
                    }}>
                      {r.status === 'no_cashin' || r.status === 'no_numarare'
                        ? <span className="text-muted">—</span>
                        : `${r.diff >= 0 ? '+' : ''}${Math.round(r.diff)} lei`}
                    </td>
                    <td style={{ color: meta.color, fontWeight: 600, fontSize: 13 }}>
                      {meta.icon} {meta.label}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modaluri */}
      {assignTarget && (
        <AssignDriverModal
          open={true}
          receiptNr={assignTarget.receipt_nr}
          ziua={assignTarget.ziua}
          candidates={assignTarget.duplicate_candidates}
          onConfirm={handleAssign}
          onClose={() => setAssignTarget(null)}
        />
      )}
      {ignoreTarget && (
        <IgnoreModal
          open={true}
          receiptNr={ignoreTarget.receipt_nr}
          ziua={ignoreTarget.ziua}
          onConfirm={handleIgnore}
          onClose={() => setIgnoreTarget(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verifică tipuri**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep "IncasareTab" || echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/numarare/tabs/IncasareTab.tsx
git commit -m "feat(incasare): UI restructure with anomaly cards, day confirmation, role-aware actions [deploy-fix]"
```

---

## Task 8: Wiring — middleware, sidebar, users, page client

**Files:**
- Modify: `apps/web/src/middleware.ts:9, 67-77`
- Modify: `apps/web/src/components/Sidebar.tsx:164` (zone NavItem)
- Modify: `apps/web/src/app/(dashboard)/users/UsersClient.tsx:18-24` (ROLE_LABELS)
- Modify: `apps/web/src/app/(dashboard)/numarare/tabs/OperatorsTab.tsx:18` (label)
- Modify: `apps/web/src/app/(dashboard)/numarare/NumararePageClient.tsx`

- [ ] **Step 1: middleware.ts — adaugă rolul**

În `apps/web/src/middleware.ts`, adaugă o constantă nouă lângă `ADMIN_CAMERE_ALLOWED`:

```typescript
const EVALUATOR_INCASARI_ALLOWED = ['/numarare'];
```

În blocul de `if (role === 'ADMIN_CAMERE')` adaugă mai jos:

```typescript
if (role === 'EVALUATOR_INCASARI') {
  const allowed = EVALUATOR_INCASARI_ALLOWED.some(r => pathname === r || pathname.startsWith(r + '/'));
  if (!allowed) {
    return NextResponse.redirect(new URL('/numarare', request.url));
  }
}
```

- [ ] **Step 2: Sidebar.tsx — restricționează la /numarare**

Modifică linia 164:

```typescript
: role === 'OPERATOR_CAMERE' || role === 'ADMIN_CAMERE' || role === 'EVALUATOR_INCASARI' ? nav.filter(n => n.href === '/numarare')
```

- [ ] **Step 3: UsersClient.tsx — label nou**

În `ROLE_LABELS`:

```typescript
const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrator',
  DISPATCHER: 'Dispecer',
  GRAFIC: 'Grafic',
  OPERATOR_CAMERE: 'Operator camere',
  ADMIN_CAMERE: 'Admin camere',
  EVALUATOR_INCASARI: 'Evaluator încasări',
};
```

- [ ] **Step 4: OperatorsTab.tsx — același label**

```typescript
ADMIN_CAMERE: 'Admin camere',
EVALUATOR_INCASARI: 'Evaluator încasări',
```

- [ ] **Step 5: NumararePageClient.tsx — tab vizibilitate per rol**

Înlocuiește conținutul:

```tsx
'use client';

import { useState } from 'react';
import type { AdminRole } from '@translux/db';
import NumarareClient from './NumarareClient';
import OperatorsTab from './tabs/OperatorsTab';
import SalaryTab from './tabs/SalaryTab';
import TariffsTab from './tabs/TariffsTab';
import IncasareTab from './tabs/IncasareTab';

type Tab = 'numarare' | 'incasare' | 'operatori' | 'salariu' | 'tarife';

const ADMIN_TABS: { key: Tab; label: string }[] = [
  { key: 'numarare', label: 'Numărare' },
  { key: 'incasare', label: 'Încasare' },
  { key: 'operatori', label: 'Operatori' },
  { key: 'salariu', label: 'Salariu' },
  { key: 'tarife', label: 'Tarife' },
];

export default function NumararePageClient({ role }: { role: AdminRole }) {
  const isAdmin = role === 'ADMIN';
  const isAdminCamere = role === 'ADMIN_CAMERE';
  const isEvaluator = role === 'EVALUATOR_INCASARI';

  // ADMIN vede toate tab-urile.
  // ADMIN_CAMERE vede toate tab-urile EXCEPT 'incasare'.
  // EVALUATOR_INCASARI vede DOAR tab 'incasare'.
  // Operatorii camere văd direct interfața de numarare (fără tab-uri).
  const visibleTabs: Tab[] = isAdmin
    ? ['numarare', 'incasare', 'operatori', 'salariu', 'tarife']
    : isAdminCamere
    ? ['numarare', 'operatori', 'salariu', 'tarife']
    : isEvaluator
    ? ['incasare']
    : [];

  const tabs = ADMIN_TABS.filter(t => visibleTabs.includes(t.key));
  const defaultTab: Tab = isEvaluator ? 'incasare' : 'numarare';
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);

  const showTabs = visibleTabs.length > 1;

  return (
    <div className="page">
      {showTabs && (
        <div style={{
          display: 'flex',
          gap: 4,
          marginBottom: 20,
          borderBottom: '1px solid rgba(155,27,48,0.1)',
          paddingBottom: 0,
        }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '10px 20px',
                border: 'none',
                borderBottom: activeTab === tab.key ? '3px solid #9B1B30' : '3px solid transparent',
                background: activeTab === tab.key ? 'rgba(155,27,48,0.06)' : 'transparent',
                color: activeTab === tab.key ? '#9B1B30' : '#999',
                fontWeight: activeTab === tab.key ? 600 : 500,
                fontSize: 14,
                cursor: 'pointer',
                fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
                fontStyle: 'italic',
                transition: 'all 0.2s ease',
                borderRadius: '8px 8px 0 0',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {activeTab === 'numarare' && visibleTabs.includes('numarare') && <NumarareClient role={role} />}
      {activeTab === 'incasare' && visibleTabs.includes('incasare') && <IncasareTab role={role} />}
      {activeTab === 'operatori' && visibleTabs.includes('operatori') && <OperatorsTab />}
      {activeTab === 'salariu' && visibleTabs.includes('salariu') && <SalaryTab />}
      {activeTab === 'tarife' && visibleTabs.includes('tarife') && <TariffsTab />}
    </div>
  );
}
```

- [ ] **Step 6: Verifică tipuri**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`
Expected: fără erori sau erori care nu țin de fișierele modificate.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/middleware.ts apps/web/src/components/Sidebar.tsx apps/web/src/app/\(dashboard\)/users/UsersClient.tsx apps/web/src/app/\(dashboard\)/numarare/tabs/OperatorsTab.tsx apps/web/src/app/\(dashboard\)/numarare/NumararePageClient.tsx
git commit -m "feat(roles): wire EVALUATOR_INCASARI in middleware, sidebar, users page, tab visibility"
```

(Fără `[deploy-fix]` — declanșează auto-deploy pentru a aplica UI-ul nou.)

---

## Task 9: Test end-to-end + verificare în prod

**Files:** N/A (testare manuală)

- [ ] **Step 1: Așteaptă deploy-ul Vercel**

Hook-ul auto-deploy se declanșează după commit-ul de la Task 8 (fără `[deploy-fix]`). Lansezi `vercel-deploy-monitor` agent în background pentru a monitoriza.

- [ ] **Step 2: Creează cont evaluator de test**

În admin panel `/users`, creezi invite cu rol `EVALUATOR_INCASARI`. Acceptă invite-ul cu un cont nou (sau reutilizezi un cont existent dacă ai).

- [ ] **Step 3: Verificare manuală — log in cu evaluator**

- Logare cu contul evaluator → ar trebui să fie redirectat la `/numarare`
- Tab-uri vizibile: doar **Încasare** (nu și Numărare/Operatori/Salariu/Tarife)
- Selectează ziua **2026-04-26**
- Verifică:
  - Bara de status: „Neconfirmat" + buton „Confirmă ziua" dezactivat (cu tooltip)
  - 3 alerte vizibile: `0945257` (NO_FOAIE), `00142955` (INVALID_FORMAT), `00142956` (INVALID_FORMAT)
  - Fiecare alertă are breakdown complet (numerar/card/lgotnici/etc.) și butoane „Asignează" + „Marchează ignorat"

- [ ] **Step 4: Test asignare**

- Click „Asignează" pe `0945257` → modal se deschide
- Caută un șofer (de ex. „Topa") → selectează → notă „test asignare manuală" → Salvează
- Modal se închide, alerta `0945257` dispare, tabelul de șoferi reflectă suma adăugată la șoferul ales

- [ ] **Step 5: Test ignoră**

- Click „Marchează ignorat" pe `00142955` → modal se deschide
- Notă „test eroare casa" → click Marchează ignorat
- Alerta dispare, suma nu mai apare nicăieri în raport

- [ ] **Step 6: Test confirmare zi**

- După ce `00142956` e și el rezolvat (asignează sau ignoră) → buton „Confirmă ziua" devine activ
- Click → bara devine verde „✓ Confirmat de [Nume] la [data ora]"
- Apare buton „Anulează confirmarea"
- Click „Anulează" → revine la stare neconfirmată

- [ ] **Step 7: Test read-only ADMIN**

- Logare cu cont ADMIN → tab Încasare vizibil cu toate datele
- Alertele apar fără butoane „Asignează"/„Marchează ignorat"
- Bara de status fără butoane „Confirmă ziua"

- [ ] **Step 8: Test ADMIN_CAMERE — fără acces**

- Logare cu cont ADMIN_CAMERE → tab Încasare **nu** apare în lista de tab-uri

- [ ] **Step 9: Cleanup test data**

Dacă vrei datele test rezolvate, șterge override-urile de test din DB:

```sql
DELETE FROM tomberon_payment_overrides
WHERE note IN ('test asignare manuală', 'test eroare casa');
DELETE FROM incasare_day_confirmations WHERE ziua = '2026-04-26';
```

Sau lasă-le ca demonstrație.

- [ ] **Step 10: Notează observațiile**

Dacă apar bug-uri/UX issues, notează-le în comentarii la commit-ul final sau deschide issue-uri pentru iterarea V2.

---

## Self-Review

**Spec coverage:**
- [x] Migrația 048 (deja aplicată) + 049-052 acoperă toate tabelele/funcțiile cerute
- [x] Server actions: assignOverride, ignoreOverride, deleteOverride, confirmDay, unconfirmDay (Task 5)
- [x] UI: status bar, anomaly cards, modals, role-aware actions (Tasks 6-7)
- [x] Roluri: EVALUATOR_INCASARI peste tot, ADMIN_CAMERE scos din Incasare (Tasks 1, 8)
- [x] Re-confirmare la date noi: `has_new_payments_after` în RPC (Task 4)

**Placeholder scan:** OK — niciun TBD/TODO/incomplete.

**Type consistency:** Tipurile `IncasareReportResult`, `Anomaly`, `Confirmation` sunt definite în Task 5 și consumate consecvent în Tasks 6-7. RPC return shape în Task 4 corespunde.

**Out of scope (per spec):** Notificări, bulk import, statistici per evaluator, recalcul retroactiv numărare. Confirmate ca scoase.
