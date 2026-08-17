# Parc uzine — adăugarea de mașini, șoferi și legături pentru rolul UZINE

**Data:** 2026-08-17
**Cerere:** Alexei (rol UZINE) să poată adăuga numere noi de mașini și șoferi noi,
să-i atribuie la uzine și să lege mașinile cu șoferii.

## Problema

Tot ce cere Alexei EXISTĂ deja, dar e închis pe `requireRole('ADMIN')`:
`/lde/soferi`, `/lde/vehicule`, `/lde/atribuiri`, `/vehicles`, `/drivers`.
Rolul UZINE trece prin middleware doar pe `/lde/grafic-uzine` (`UZINE_ALLOWED`).

Azi, ca să intre o mașină nouă în parc, Alexei trebuie să ceară unui ADMIN.

## Decizii (confirmate cu Ion)

| Întrebare | Decizie |
|---|---|
| Ce parc vede | **Tot parcul LDE** (`is_lde = true`) — nu doar uzinele lui, dar NU suburban/interurban |
| Unde stă | **Pagină nouă** `/lde/parc`, cu mașini + șoferi + legături pe un singur ecran |
| Ce poate face | **Doar adăugare și legare.** Fără ștergere, fără dezactivare, fără editare |

## Capcana principală: uzina se scrie în DOUĂ locuri

Atribuirea unui șofer la o uzină trăiește dublu în baza de date:

- `drivers.directions` (text[]) — după el pickerul din grafic ridică «ai lui» sus
  (`soferiForPicker`, `inDirection`);
- `lde_driver_extras.uzina_id` (PK `driver_id`, FK spre `lde_uzine`) — după el se
  fac salariile și listele din `/lde/soferi`.

**Măsurat în prod (2026-08-17):** din 110 șoferi LDE activi, 93 au `extras.uzina_id`,
84 au `directions` nevid, coincid 83. Adică ~10 șoferi au atribuirea într-un singur
loc — în grafic nu apar unde le e locul.

**Decizie:** formularul scrie AMBELE într-o singură acțiune. Altfel Alexei atribuie
un șofer la uzină și nu-l găsește în propriul grafic.

La mașini e mai simplu: doar `vehicles.directions` (valorile reale în prod:
`DRAXELMAIER_BALTI` 40, `camioane` 39, `SEBN_ORHEI` 27, `LEAR_UNGHENI` 16,
`LEAR_FLORESTI` 4).

## Ce se construiește

### Pagină `/lde/parc` (ADMIN + UZINE)

Un ecran, trei blocuri:

1. **Mașini** — listă parc LDE + formular «adaugă mașină»: număr + uzină + tip
2. **Șoferi** — listă + formular «adaugă șofer»: nume + telefon + uzină
3. **Legături** — legăturile active + formular «leagă mașina cu șoferul»: mașină + șofer + schimb

Plus un bloc de atenționare **«mașini fără normă»** (azi 11 din 128): mașina nouă
intră fără normă de consum, deci fără calcul DT până când un ADMIN îi pune norma.

### Scrieri

| Acțiune | Tabele |
|---|---|
| Mașină nouă | `vehicles` (`is_lde = true`, `directions = [uzina]`, `active = true`) |
| Șofer nou | `drivers` (`is_lde = true`, `directions = [uzina]`) + upsert `lde_driver_extras` (`driver_id`, `uzina_id`) |
| Legătură | `lde_active_assignments` (`driver_id`, `vehicle_id`, `shift_number`, `valid_from = azi`, `valid_to = null`) |

`lde_driver_extras.parking_location` are default `'HOME'`, deci upsert-ul cu doar
`driver_id` + `uzina_id` trece.

### Validări

- **Număr mașină:** normalizare (majuscule, fără spații/liniuțe), refuz dacă e gol
  sau dacă există deja o mașină cu același număr — mesaj clar, nu eroare de bază.
- **Telefon șofer:** `normalizeDriverPhone()` din `@translux/db` (funcția sesiunii
  vecine, migr. 254/256, deja în prod). Pentru LDE (`is_lde = true`) triggerul NU
  cere telefon, dar câmpul există: azi 109 șoferi LDE sunt fără număr și nu au de unde
  fi completați. Gol = permis; completat greșit = refuzat cu mesajul din `PhoneError`.
- **Șofer omonim:** avertisment dacă există deja un șofer activ cu același nume.
- **Legătură:** unicitatea e deja în bază — `uq_lde_active_assignments_one_per_driver`
  (un șofer = o legătură activă) și `uq_lde_active_assignments_one_per_vehicle_shift`
  (`vehicle_id`, `COALESCE(shift_number,0)`). Eroarea 23505 se traduce în română,
  ca în `createAssignment`.

### Autorizare

- `middleware.ts`: `/lde/parc` intră în `UZINE_ALLOWED`.
- Fiecare server action re-verifică sesiunea și rolul pe cont propriu
  (`ADMIN` sau `UZINE`), ca în `grafic-uzine/actions.ts` — middleware-ul nu e
  singura barieră.
- `Sidebar.tsx`: intrare nouă vizibilă pentru ADMIN și UZINE.

## Limite acceptate

- **Alexei nu-și poate corecta greșelile.** Un număr scris greșit se repară doar de
  un ADMIN. Mitigare: confirmarea numărului normalizat înainte de salvare.
- **Mașina nouă rămâne fără normă de consum** până i-o pune un ADMIN. Mitigare:
  blocul «mașini fără normă» pe aceeași pagină.
- Nu se ating paginile ADMIN existente (`/lde/soferi`, `/lde/vehicule`,
  `/lde/atribuiri`) — rămân cu toate coloanele lor (norme, categorii de salariu, parcări).

## Testare

Logică pură în `apps/admin/src/lib/lde/parc.ts`, testată cu vitest:

- normalizarea numărului de înmatriculare (spații, liniuțe, minuscule, gol);
- construirea perechii «directions + extras» pentru atribuirea la uzină;
- traducerea erorii 23505 în mesajul potrivit (șofer ocupat vs mașină+schimb ocupat).

Fără migrație nouă — toate tabelele există. (Numerele 254 și 256 sunt ale sesiunii
vecine; 255 rămâne liber, dar nu ne trebuie.)
