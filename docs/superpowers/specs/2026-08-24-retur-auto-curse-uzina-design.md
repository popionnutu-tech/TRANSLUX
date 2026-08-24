# Retur cu altă mașină pe cursele de uzină

**Data:** 2026-08-24
**Cerere (Ion):** fiecare tură are tur și retur. Când se strică rutiera/autobuzul pe
rută, Alexei trebuie să poată pune ALT auto pe retur. Să fie ușor de făcut din meniul lui.

## Problema

La cursele de uzină un rând din `lde_atribuiri_zilnice` = **toată tura**: o singură
mașină (`vehicle_id`) și un singur șofer (`driver_id`) pentru tur ȘI retur.

Când mașina se strică la jumătatea zilei, realitatea are două mașini pe aceeași tură.
Azi Alexei are două variante, ambele greșite:

- **schimbă mașina rândului** — pierde informația că turul l-a făcut cealaltă mașină;
  verificarea GPS de a doua zi caută mașina nouă la ora turului și dă `nepotrivire`;
- **adaugă cursă dublă** (`+`, slot 2) — dar dublura înseamnă «două microbuze în
  paralel pe același drum», nu «altă mașină la întoarcere». Statistica iese dublă.

Pentru interurban/suburban problema e rezolvată din migrația 014: `daily_assignments`
are `vehicle_id` (tur) + `vehicle_id_retur` (retur), folosite azi în `get_grafic_report`
și în încă zece rapoarte. La uzine acest mecanism lipsește.

## Decizii (confirmate cu Ion, 24.08)

| Întrebare | Decizie |
|---|---|
| Șoferul pe retur | **Se poate schimba și el.** Se completează automat cu titularul mașinii noi, dar Alexei îl poate înlocui |
| Unde stă în meniu | **În popup-ul existent**, sub blocul șoferului — un buton `↩ Altă mașină pe retur` care desfășoară blocul |
| Cum arată în grilă | Al doilea număr apare **doar când returul e completat** — sub primul, mai mic |
| Rândurile din grilă | **Nu se dublează.** Un rând rămâne o tură |
| Șablonul săptămânal | Returul **NU** intră în șablon — defecțiunea e un eveniment de zi, nu o regulă de săptămână |

### De ce nu se dublează rândurile

Varianta «fiecare tură = două rânduri (tur + retur)» arată tot, fără clicuri. Costul
e prea mare: SEBN Orhei are 28 curse × 3 schimburi = 84 de rânduri, ar deveni 168.
Alexei citește grila de pe telefon. Defecțiunea e rară — nu poate plăti fiecare zi
normală pentru ea.

## Ce se construiește

### 1. Baza de date — migrația 274

```sql
ALTER TABLE lde_atribuiri_zilnice
  ADD COLUMN IF NOT EXISTS vehicle_id_retur uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS driver_id_retur  uuid REFERENCES drivers(id)  ON DELETE SET NULL;

ALTER TABLE lde_atribuiri_zilnice
  ADD CONSTRAINT lde_atribuiri_retur_sofer_fara_masina
  CHECK (driver_id_retur IS NULL OR vehicle_id_retur IS NOT NULL);
```

**`NULL` = returul îl face aceeași mașină ca turul.** Rândurile existente (10 229 azi)
rămân valide neatinse; migrația nu rescrie tabelul, deci fără `ANALYZE`.

CHECK-ul apără invariantul care în panou există deja pentru tur: «mașina merge mereu
cu șofer», deci un șofer fără mașină n-are sens.

Fără indexuri noi: coloanele se citesc întotdeauna în feliile deja acoperite de
`uq_lde_atribuiri_date_key (date, route_key)` și `idx_lde_atribuiri_date_dir (date, direction)`.

### 2. Popup-ul din `/lde/grafic-uzine`

Sub blocul șoferului, un singur rând închis:

```
↩ Altă mașină pe retur
```

La apăsare se desfășoară exact aceleași controale ca la tur:

- căutare mașină (chips + dropdown, ca la tur);
- șoferul se completează automat cu titularul mașinii alese — `getTitularId(vehicleId, shift)`,
  aceeași funcție ca la tur — și rămâne editabil;
- `Elimină returul` — scoate ambele câmpuri (mașina și șoferul), pentru o înlocuire pusă din greșeală.

Blocul e desfășurat din start când rândul are deja retur, ca Alexei să-l vadă fără să caute.

**Zilele.** Returul se aplică pe aceleași zile bifate ca turul. De obicei e o singură
zi. Nu se introduce o a doua listă de zile — ar dubla complexitatea popup-ului pentru
un caz care aproape întotdeauna are o singură zi.

**Șablonul.** Checkbox-ul «Salvează și în șablon» rămâne strict despre tur. Același
raționament ca la dubluri, unde checkbox-ul e ascuns pentru `slot > 1`.

### 3. Grila

Celula cu retur completat afișează două numere:

```
820GXP
↩ 552BRAO
```

Al doilea rând: font mai mic, culoare estompată. Celulele fără retur rămân identice
cu ce e azi — zero pixeli în plus în zilele normale.

### 4. Verificarea GPS — `apps/admin/src/lib/atribuiri/verify.ts`

Azi verificarea ia `r.vehicle_id` și caută mașina în orașul uzinei (`city` + `gps_localities`).
Un rând = o mașină.

Se schimbă în: rândul se verifică pe lista `[vehicle_id, vehicle_id_retur]` fără valorile
nule.

- toate mașinile găsite → `confirmat_auto`;
- vreuna lipsă → `nepotrivire`, cu nota care spune **care** mașină n-a fost confirmată;
- fără date GPS pentru vreuna → `fara_date_gps`, ca azi (fără alarmă).

Fără această parte, fiecare înlocuire de retur ar cădea automat în `nepotrivire` și ar
genera push inutil managerilor.

Rândul se citește deja cu `select('id, direction, vehicle_id, status, verification_note')`
— se adaugă `vehicle_id_retur` la acel select, fără interogare nouă.

### 5. Reparație colaterală — `apps/admin/src/lib/atribuiri/core.ts:101`

Citirea `lde_factory_route_shifts` din `ensureDaysMaterialized()` nu are `.limit()`.
Azi 174 de rânduri din pragul tăcut de 1000 al PostgREST. Aceeași capcană a lovit deja
`lde_weekly_template` (a trecut de 1000, reparată cu paginare explicită pe 12.08.2026 —
comentariul stă în acest fișier, liniile 112–115). La depășire, cursele **dispar din
grilă fără eroare**.

Se pune santinela care există deja pe `lde_curse_duble` în același fișier (linia 158):

```ts
.limit(500);
if (allShifts.length === 500) throw new Error('materializare: lde_factory_route_shifts a depășit 500 — paginați citirea');
```

Intră aici pentru că oricum modificăm fișierul; nu e refactorizare fără legătură.

## Ce NU se atinge

| Zonă | De ce |
|---|---|
| `km-zilnic` și calculul kilometrilor | Sursa lor e GPS-ul, nu atribuirile |
| Write-through în `daily_assignments` | Există doar pentru interurban/suburban; uzinele nu scriu acolo |
| Dublurile (`slot`) | Rămân «două microbuze în paralel». Fiecare slot își are propriul retur, independent |
| `route_key` și indexul unic | Returul e coloană pe rând, nu rând nou — cheia rămâne neschimbată |
| Mini App-ul managerilor (`/mini-app/atribuiri`) | Faza 1 e panoul lui Alexei. Dacă managerii au nevoie, se adaugă separat |

## Testare

- **Migrația:** rândurile vechi rămân cu `vehicle_id_retur IS NULL`; CHECK-ul respinge
  `driver_id_retur` fără mașină.
- **Salvare:** retur pus pe o zi → rândul are ambele mașini; `Elimină returul` → ambele
  câmpuri revin la NULL.
- **Șablon:** salvare cu retur + «și în șablon» bifat → în `lde_weekly_template` intră
  DOAR mașina de tur.
- **Verificare GPS** (testul care contează, pe `verificaZi`):
  - ambele mașini în orașul uzinei → `confirmat_auto`;
  - mașina de tur da, cea de retur nu → `nepotrivire`, nota numește mașina de retur;
  - `vehicle_id_retur` NULL → comportament identic cu cel de azi (test de neregresie).
- **Grilă:** celulă fără retur — pixel-identică cu azi.

## Riscuri

**Alexei folosește returul acolo unde trebuia dublură.** Ambele înseamnă «a doua mașină».
Diferența: dublura merge în paralel pe același drum, returul merge la întoarcere.
Atenuare: textul butonului spune explicit «pe retur», iar `+` rămâne unde e, lângă
numele cursei, cu tooltip-ul lui.

**Ora la care s-a stricat mașina nu se înregistrează.** Verificarea GPS compară doar
localitatea, nu ora, deci nu e nevoie acum. Dacă apare cerința «de la ce oră», se adaugă
o coloană separată — nu schimbă modelul.
