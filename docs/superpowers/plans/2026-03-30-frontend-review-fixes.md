# Frontend Review Fixes — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Fix all critical/important issues from frontend review + add phone call buttons to route results.

**Architecture:** Security fixes in middleware + layout + server actions. XSS sanitization in OAuth callbacks. Type sync. UI fixes across components.

**Tech Stack:** Next.js 14, TypeScript, Supabase, jose JWT

---

## Task 1: Auth — Middleware Protection

**Files:**
- Modify: `apps/web/src/middleware.ts`

- [ ] Add JWT verification in middleware for all `/reports`, `/users`, `/drivers`, `/trips`, `/routes`, `/salary`, `/smm-accounts` routes
- [ ] Redirect unauthenticated users to `/login`
- [ ] Allow public routes: `/`, `/ro`, `/ru`, `/login`, `/api/auth/*`, `/api/tiktok/*`, `/api/facebook/*`

---

## Task 2: Auth — Dashboard Layout Guard

**Files:**
- Modify: `apps/web/src/app/(dashboard)/layout.tsx`

- [ ] Import `verifySession` from `@/lib/auth` and `redirect` from `next/navigation`
- [ ] Call `verifySession()` — if null, `redirect('/login')`
- [ ] Make layout `async`

---

## Task 3: Auth — Server Actions Protection

**Files:**
- Modify: `apps/web/src/app/(dashboard)/routes/actions.ts`
- Modify: `apps/web/src/app/(dashboard)/drivers/actions.ts`
- Modify: `apps/web/src/app/(dashboard)/trips/actions.ts`
- Modify: `apps/web/src/app/(dashboard)/users/actions.ts`
- Modify: `apps/web/src/app/(dashboard)/reports/actions.ts`
- Modify: `apps/web/src/app/(dashboard)/salary/actions.ts`
- Modify: `apps/web/src/app/(dashboard)/smm-accounts/actions.ts`

- [ ] Add `verifySession()` check at the top of every mutating server action
- [ ] Throw error if not authenticated

---

## Task 4: Auth — Remove Hardcoded Secret Fallback

**Files:**
- Modify: `apps/web/src/lib/auth.ts`

- [ ] Change line 8: throw error if `AUTH_SECRET` is missing instead of fallback to `'translux-secret-change-me'`

---

## Task 5: XSS — Sanitize OAuth Callbacks

**Files:**
- Modify: `apps/web/src/app/api/tiktok/callback/route.ts`
- Modify: `apps/web/src/app/api/facebook/callback/route.ts`

- [ ] Add `escapeHtml()` helper function
- [ ] Escape all template literals before HTML injection
- [ ] Replace hardcoded redirect URIs with env var or request URL

---

## Task 6: Types — Sync & Cleanup

**Files:**
- Modify: `packages/db/src/types.ts`
- Delete: `apps/web/src/lib/db-types.ts`

- [ ] Add `location_ok: boolean | null` to `Report` interface in shared types
- [ ] Delete duplicated `db-types.ts`
- [ ] Verify no imports reference deleted file

---

## Task 7: React — Fragment Key + Unused Import

**Files:**
- Modify: `apps/web/src/app/(dashboard)/salary/SalaryClient.tsx`

- [ ] Change `<>` to `<React.Fragment key={op.userId}>` at line 293
- [ ] Remove `key` from inner `<tr>`
- [ ] Remove unused `useSearchParams` import

---

## Task 8: Phone Call Feature — Route Results

**Files:**
- Modify: `apps/web/src/components/ui/route-results.tsx`

- [ ] Add clickable phone icon (📞) next to each driver's phone number
- [ ] Use `<a href="tel:+373...">` for telephone network calls
- [ ] Style the phone icon as a clear CTA button
- [ ] Ensure phone numbers display as text (not clickable) separately from the call button

---

## Task 9: Swap Button — Wire Up

**Files:**
- Modify: `apps/web/src/components/home-page.tsx`

- [ ] Add `onClick` handler to swap button that swaps `fromRef` and `toRef` values

---

## Task 10: Duplicated Utils — Extract

**Files:**
- Create: `apps/web/src/lib/date-utils.ts`
- Create: `apps/web/src/lib/format.ts`
- Modify: `apps/web/src/app/(dashboard)/reports/ReportsClient.tsx`
- Modify: `apps/web/src/app/(dashboard)/reports/SmmReportsClient.tsx`
- Modify: `apps/web/src/app/(dashboard)/salary/SalaryClient.tsx`
- Modify: `apps/web/src/app/(dashboard)/reports/page.tsx`

- [ ] Extract `toDateStr`, `getPeriodDates`, `formatDateShort`, `getMondayStr`, `DAY_NAMES` to `date-utils.ts`
- [ ] Extract `formatDriverName` to `format.ts`
- [ ] Replace all duplicates with imports

---

## Task 11: SMM Token Exposure Fix

**Files:**
- Modify: `apps/web/src/app/(dashboard)/smm-accounts/page.tsx`

- [ ] Filter out `access_token` and `refresh_token` before passing to client component

---

## Task 12: Cleanup

**Files:**
- Delete: `apps/web/src/components/ui/dithering-shader.tsx`
- Modify: `apps/web/src/components/home-page.tsx` (remove eslint-disable)

- [ ] Delete unused dithering-shader component
- [ ] Remove `/* eslint-disable @next/next/no-img-element */` (no img tags in file)
- [ ] Fix social media links (keep `#` but add `rel="noopener"`)

---

## Verification

- Run `npx tsc --noEmit` to check TypeScript
- Open http://localhost:3333/ — homepage with "Cauta cursa" button
- Open http://localhost:3333/reports — should redirect to /login if not authenticated
- Test phone call buttons in route results modal
- Test swap button on homepage
