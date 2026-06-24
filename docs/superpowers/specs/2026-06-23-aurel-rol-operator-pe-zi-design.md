# Rol de operator pe zi (Aurel: zona taxi / peron) — design

Data: 2026-06-23
Status: aprobat (direcție + stocare A)

## Problema

`users.operator_kind` este fix per utilizator (`MAIN` = peron, `TAXI_ZONE` = zona taxi).
Botul rutează fluxul după acest câmp, iar operatorii de peron primesc pasul „confirmă zona
taxi" doar dacă există un operator TAXI_ZONE activ (`hasActiveTaxiOperator()`).

Aurel (azi `TAXI_ZONE` fix) trebuie să poată lucra **în roluri diferite în zile diferite**:
o zi zona taxi, altă zi peron Chișinău. Operatori Chișinău azi: Iurie + Vitalie (`MAIN`),
Aurel (`TAXI_ZONE`).

## Decizii (din interviu)

1. **Cine alege:** Aurel singur, în bot (tap, fără comenzi).
2. **Zilele de peron:** zona taxi NU se acoperă; pasul „confirmă zona taxi" dispare pentru toți.
3. **Default (nu a ales):** rămâne rolul lui obișnuit = `TAXI_ZONE` (comportament ca azi).
4. **Stocare:** variantă A — tabel mic cu istoric.

## Cum funcționează (UX)

- La prima interacțiune din zi, botul îl întreabă o dată:
  „Azi lucrezi: 🚕 Zona taxi / 🚉 Peron Chișinău". Tap → se reține pe ziua aceea.
- Buton „Schimbă rolul" dacă a greșit. A doua zi întreabă din nou.
- Zi „Zona taxi": flux ca azi (Aurel = taxi; peronul vede pasul confirmare taxi).
- Zi „Peron": Aurel face raport normal de peron (ca Iurie/Vitalie); pasul „confirmă zona
  taxi" dispare pentru toți (zona taxi necoperită).

## Model de date (A)

Tabel nou:

```
operator_day_role (
  user_id   uuid  references users(id),
  work_date date,                         -- ziua Chișinău
  role      text  check (role in ('MAIN','TAXI_ZONE')),
  set_at    timestamptz default now(),
  primary key (user_id, work_date)
)
```
RLS deny-all (acces doar prin service_role, ca restul tabelelor botului).

**Rol efectiv azi** pentru un user = `operator_day_role` de azi DACĂ există, altfel
`users.operator_kind` (primarul). `operator_kind` rămâne neschimbat (rolul de bază/fallback).

## Schimbări în cod

- **Bot — alegere rol (nou):** la `/start` / prima interacțiune, dacă userul e „comutabil"
  (deocamdată: doar Aurel — `operator_kind` setat și e CHISINAU CONTROLLER) și nu are rol pe
  azi, întreabă rolul. Scrie în `operator_day_role`. Buton „Schimbă rolul" în meniu.
- **Bot — rutare (`bot.ts`, `start.ts`, `cancel.ts`):** înlocuiește citirea directă
  `ctx.dbUser.operator_kind === 'TAXI_ZONE'` cu **rolul efectiv azi** (helper
  `effectiveRoleToday(user)`).
- **Gate (`hasActiveTaxiOperator` → `isTaxiZoneCoveredToday`):** „există un user activ al cărui
  rol efectiv azi = TAXI_ZONE". Înlocuiește verificarea statică pe coloană.
- Fără atingerea fluxurilor de raport în sine (taxiZoneReport / report rămân la fel, doar gate-ul
  și rutarea se schimbă).

## Edge cases

- Aurel nu deschide botul → fără rând în `operator_day_role` → rol efectiv = `TAXI_ZONE`
  (fallback) → comportament ca azi. Fail-safe.
- Peron operator raportează dimineața înainte ca Aurel să aleagă: gate = pe rol efectiv; dacă
  Aurel încă nu a ales, fallback = TAXI_ZONE → pasul taxi apare (ca azi). Când Aurel alege peron,
  gate se stinge pentru rapoartele ulterioare. Acceptabil.
- Schimbarea rolului la mijlocul zilei: upsert pe `(user_id, work_date)` → ia ultima alegere.

## Scope

DOAR Aurel comută acum. Mecanismul (tabel + rol efectiv) e general, dar promptul de alegere
apare doar pentru operatori comutabili — fără a deranja Iurie/Vitalie.

## Testare / verificare

- Aurel alege „Peron" → `bot.ts` îl duce pe fluxul de peron; `isTaxiZoneCoveredToday()` = false
  → Iurie/Vitalie NU văd pasul taxi.
- Aurel alege „Zona taxi" → flux taxi; peronul vede pasul taxi (ca azi).
- Aurel nu alege → fallback TAXI_ZONE (ca azi).
- Migrarea aplicată, RLS deny-all verificat.
