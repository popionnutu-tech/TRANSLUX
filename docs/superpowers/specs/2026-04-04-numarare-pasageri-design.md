# Modul Numărare Pasageri — Design Spec

**Data:** 2026-04-04 | **Status:** Aprobat

## 1. Problema

2-3 operatori vizualizează zilnic video de la ~35 curse și numără pasagerii pe fiecare oprire. Softul actual are 10 ani, UI lent, și nu suportă tarif dublu (scurt/lung). Trebuie construit un modul modern, rapid, integrat în TRANSLUX.

## 2. Cerință cheie: Tarif dublu

- **Pasageri lungi (> 50 km):** calculați pe tronsoane — `km_tronson × nr_pasageri × preț_km_lung`
- **Pasageri scurți (≤ 50 km):** identificați la ieșire — `km_parcurși × preț_km_scurt`
- Toggle "Tarif dublu" controlat de admin camere (rol nou)
- Când toggle-ul e dezactivat, toți pasagerii se calculează cu un singur tarif

## 3. Flux operator

### 3.1 Lista curselor (`/numarare`)

- Pagină unică cu data zilei (selector dată)
- Tabel cu toate cursele din `daily_assignments` pentru data selectată
- Coloane: Oră Tur | Destinația | Oră Retur | Șofer | Mașina | Status | Acțiune
- Statusuri: **Neprocesat** → **🔒 În lucru (Operator X)** → **Tur gata** → **Finalizat**
- Cursele neconfirmate de dispecer (fără daily_assignment) nu apar

### 3.2 Introducere date (accordion inline)

Click "Deschide" → rândul se extinde, afișând Tur (stânga) | Retur (dreapta).

**Tabel pe fiecare direcție:**

| Nr | Stația | Km | Total | Scurți |
|----|--------|----|-------|--------|
| 1 | Briceni | 0 | _ | |
| 2 | Edineț | 28 | _ | |
| ... | ... | ... | ... | ... |

- **Stația** — din `crm_stop_prices` / `stop_prices` + `localities`
- **Km** — din `crm_stop_prices` (km_from_chisinau / km_from_nord)
- **Total** — câmp input: câți oameni sunt acum în microbuz
- **Scurți** — câmp input: câți scurți au ieșit (vizibil doar cu tarif dublu activ)

### 3.3 Navigare rapidă (tastatură)

- Focus automat pe primul câmp Total la deschidere
- **Enter / Tab** → următoarea oprire
- Dacă Total a scăzut și tarif dublu activ → cursor sare automat la Scurți cu întrebarea "Au fost scurți?"
- Operator introduce 0 (nu) → următoarea oprire; sau număr → popup locații
- Opriri fără schimbare pot fi sărite — valoarea se copiază de la oprirea precedentă

### 3.4 Popup Scurți — selecție locații

Când operatorul introduce un număr > 0 în Scurți:

1. Apare popup compact lângă celulă
2. Afișează **doar opririle de pe rută care sunt ≤ 50 km** înainte de oprirea curentă (direcția drumului)
3. Lângă fiecare oprire — câmp pentru număr de pasageri
4. Contor "Rămas de distribuit: X" — se actualizează real-time
5. Când contor = 0 → buton "Confirmă" activ
6. Enter pe Confirmă → popup se închide, cursor la următoarea oprire

### 3.5 Salvare

- **"Salvează Tur"** — buton sub coloana stângă
- **"Salvează Retur"** — buton sub coloana dreaptă
- Salvare independentă: Tur mai întâi, apoi Retur
- După salvare Tur → coloana devine read-only, status "Tur gata", focus pe Retur

### 3.6 Validări

- Ultima oprire trebuie să fie 0 (toți au ieșit)
- Toți scurții trebuie distribuiți pe locații
- Număr negativ → highlight roșu (nu blochează salvarea)
- Suma se actualizează real-time pe măsură ce operatorul introduce date

## 4. Formula de calcul

### 4.1 Pasageri lungi (per direcție)

```
Pentru fiecare tronson [oprire_i → oprire_i+1]:
  km_tronson = km[i+1] - km[i]
  pasageri_lungi = total[i] - scurti_in_transit[i]
  suma_tronson = km_tronson × pasageri_lungi × pret_km_lung
  
Total_lungi = Σ suma_tronson
```

`scurti_in_transit[i]` = scurții care s-au urcat înainte de oprirea i și nu au ieșit încă.

### 4.2 Pasageri scurți

```
Pentru fiecare pasager scurt:
  km = km[oprire_iesire] - km[oprire_urcare]
  suma = km × pret_km_scurt
  
Total_scurti = Σ suma per pasager scurt
```

### 4.3 Total cursă

```
Total = Total_lungi_tur + Total_scurti_tur + Total_lungi_retur + Total_scurti_retur
```

## 5. Rezultate afișate

Sub fiecare coloană:
- Pasageri lungi: suma ___ lei
- Pasageri scurți: suma ___ lei  
- Total Tur/Retur: ___ lei

Între coloane (după salvarea ambelor):
- **Total cursă: ___ lei**

## 6. Locking

- Operator deschide cursă → se blochează în DB (operator_id + timestamp)
- Alți operatori văd "🔒 Operator: Ana" — buton "Deschide" inactiv
- Deblocare automată: închidere accordion / ieșire de pe pagină / inactivitate 15 min
- Admin camere poate debloca forțat

## 7. Roluri

| Acțiune | Operator | Admin camere |
|---------|----------|-------------|
| Vedea lista curselor | ✅ | ✅ |
| Introduce date | ✅ | ✅ |
| Salva Tur / Retur | ✅ | ✅ |
| Edita după salvare | ❌ | ✅ |
| Toggle Tarif dublu | ❌ | ✅ |
| Debloca alt operator | ❌ | ✅ |
| Vedea sume | ✅ | ✅ |

Rol nou `admin_camere` în `admin_accounts.role`.

## 8. Schema DB (tabele noi)

### `counting_sessions`
```sql
id UUID PK DEFAULT gen_random_uuid()
assignment_date DATE NOT NULL
crm_route_id INT NOT NULL REFERENCES crm_routes(id)
operator_id UUID NOT NULL REFERENCES admin_accounts(id)
locked_by UUID REFERENCES admin_accounts(id)
locked_at TIMESTAMPTZ
status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'tur_done', 'completed'))
double_tariff BOOLEAN DEFAULT false
tur_total_lei INT
retur_total_lei INT
created_at TIMESTAMPTZ DEFAULT now()
UNIQUE(crm_route_id, assignment_date)
```

### `counting_entries`
```sql
id UUID PK DEFAULT gen_random_uuid()
session_id UUID NOT NULL REFERENCES counting_sessions(id) ON DELETE CASCADE
direction VARCHAR(5) NOT NULL CHECK (direction IN ('tur', 'retur'))
stop_order INT NOT NULL
stop_name_ro VARCHAR(100) NOT NULL
km_from_start INT NOT NULL
total_passengers INT NOT NULL DEFAULT 0
created_at TIMESTAMPTZ DEFAULT now()
UNIQUE(session_id, direction, stop_order)
```

### `counting_short_passengers`
```sql
id UUID PK DEFAULT gen_random_uuid()
entry_id UUID NOT NULL REFERENCES counting_entries(id) ON DELETE CASCADE
boarded_stop_order INT NOT NULL
boarded_stop_name_ro VARCHAR(100) NOT NULL
km_distance INT NOT NULL
passenger_count INT NOT NULL DEFAULT 1
amount_lei INT
created_at TIMESTAMPTZ DEFAULT now()
```

### `admin_accounts` — modificare
```sql
ALTER TABLE admin_accounts ADD COLUMN role VARCHAR(20) DEFAULT 'admin'
  CHECK (role IN ('admin', 'operator', 'admin_camere'));
```

## 9. Surse de date existente

- **Rute:** `crm_routes` (id, dest_from_ro, dest_to_ro, time_chisinau, time_nord, tariff_id_tur, tariff_id_retur)
- **Opriri + km:** `crm_stop_prices` (crm_route_id, name_ro, km_from_chisinau, km_from_nord)
- **Șoferi + mașini:** `daily_assignments` JOIN `drivers` JOIN `vehicles`
- **Prețuri km:** `app_config` (rate_per_km) — se vor adăuga chei `rate_per_km_long` și `rate_per_km_short`
- **Localități:** `localities` (pentru referință, dar opririle se iau din crm_stop_prices)

## 10. Stack tehnic

- Frontend: Next.js 14 App Router, client component cu useState/useEffect
- Backend: Server actions (pattern existent în proiect)
- DB: Supabase PostgreSQL (tabele noi + migrare)
- Auth: verificare sesiune existentă + verificare rol
- Pattern: identic cu `/assignments`, `/drivers`, `/vehicles`
