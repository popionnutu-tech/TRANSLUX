# Validare obligatorie grafic — Design

**Data:** 2026-04-30
**Componenta afectată:** `apps/web/src/app/(dashboard)/grafic/`

## Problema

În graficul zilnic, dispecerul poate lăsa rute "neprocesate" — fără foaie de parcurs și fără bifa "Anulată". Asta înseamnă că la sfârșitul zilei nu e clar dacă ruta s-a efectuat sau nu. În prezent, statusul "neprocesat" este doar avertizare vizuală (galben), dar nu blochează nimic.

## Cerința

Fiecare rută din grafic trebuie să fie într-una din două stări corecte:

- **Anulată** (bifa "Anulată" pusă), **SAU**
- **Efectuată complet:** Șofer + Auto + Foaie de parcurs — toate trei completate

Orice rută care nu îndeplinește una dintre aceste condiții este "neprocesată" și trebuie să blocheze munca dispecerului până când e completată.

## Soluția

### 1. Validare inline (vizuală, pe fiecare rând)

Rândurile neprocesate se schimbă din galben → **roșu** (background `var(--danger-dim)`, border-left `var(--danger)`).

Sub câmpul lipsă apare un mesaj scurt roșu:

| Stare | Mesaj |
|-------|-------|
| Lipsește doar Auto | `Lipsește auto` |
| Lipsește doar Foaie de parcurs | `Lipsește foaie de parcurs` |
| Lipsește doar Șofer | `Lipsește șofer` |
| Lipsesc două sau mai multe câmpuri | `Bifează 'Anulată' sau completează șofer + auto + foaie` |

În bara de sumar din partea de sus, contorul "X neprocesate" devine roșu (în loc de galben).

### 2. Blocarea schimbării datei

Când utilizatorul (DISPATCHER sau ADMIN) încearcă să schimbe data graficului prin `<input type="date">`, sistemul verifică dacă există rute neprocesate pentru ziua curentă. Dacă da:

- Apare un modal cu titlul **"Nu poți schimba ziua"**
- Mesajul: `"Mai sunt N rute neprocesate pentru DD.MM.YYYY. Completează foaie de parcurs sau bifează 'Anulată' pentru fiecare."`
- Un singur buton: `OK`
- Data **nu se schimbă** — rămâne ziua curentă

Aceeași blocare se aplică și butonului **"Copiază de ieri"** (pentru că ar însemna să lucrezi peste graficul curent fără să-l finalizezi).

### 3. Roluri afectate

| Rol | Validare vizuală | Blocare schimbare zi |
|-----|------------------|----------------------|
| DISPATCHER | Da | Da |
| ADMIN | Da | Da |
| GRAFIC | — (read-only, nu vede coloanele) | — |

## Schimbări tehnice

### `UnifiedGraficList.tsx`

- Funcția curentă `neprocesate = rows.filter(r => !r.cancelled && !r.foaie_parcurs_nr)` trebuie înlocuită cu o funcție care verifică toate trei câmpurile:
  ```
  isInvalid(row) = !row.cancelled && !(row.driver_id && row.vehicle_id && row.foaie_parcurs_nr)
  ```
- Pentru fiecare rând invalid: calcularea mesajului de eroare specific (lipsește auto / foaie / șofer / multiple)
- Stilizare: schimbare background row pe roșu pentru rânduri invalide
- Adăugare element error message într-un rând separat (`<tr>` colspan-uit dedesubtul rândului invalid) cu mesajul de eroare în roșu — ca să nu strice alinierea coloanelor
- Counter în header devine `var(--danger)` în loc de `var(--warning)`

### `GraficClient.tsx`

- Înainte de `setDate(e.target.value)` din `<input type="date">`, verifică dacă există rute invalide în ziua curentă
- Adaugă state pentru numărul de rute invalide (calculat la nivel de `GraficClient` sau ridicat din `UnifiedGraficList` printr-un callback)
- Dacă există invalide, afișează un modal cu mesajul; nu apela `setDate`
- Aceeași logică pentru butonul "Copiază de ieri"

### Sursa adevărului pentru `vehicle_id`

`vehicle_id` este deja încărcat în `UnifiedRow` din `getGraficData` / `getGraficSuburban`. Nu sunt necesare modificări la query-ul SQL sau la actions.

## Ce NU este în scopul acestei spec

- Trimiterea automată a graficului către șoferi (rămâne manuală, prin descărcarea PNG)
- Validarea pe backend (server actions) — validarea este UX-only; vom permite în continuare salvarea oricărei combinații pentru a permite completarea pas cu pas
- Schimbarea numelui "Anulată" — rămâne așa cum este
- Blocarea navigării către alte pagini din aplicație (utilizatorul poate părăsi pagina graficului fără probleme)
