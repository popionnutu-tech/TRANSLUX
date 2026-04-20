# Glosar de metrici — Analitică TRANSLUX

Acest document explică fiecare metrică folosită în pagina **Analitică**. Include formule SQL, exemple și interpretări.

## Termeni de bază

### Session (Cursă)
O cursă completă (tur + retur) a unui autobuz pe o rută într-o zi. Tabela: `counting_sessions`.

### Total passengers (Pas.×opriri)
Suma numărului de pasageri prezenți pe autobuz la fiecare oprire. **NU** reprezintă pasageri unici.

```sql
SUM(counting_entries.total_passengers)  -- peste toate opririle, ambele direcții
```

**De ce 1023?** Dacă 40 de pasageri călătoresc prin 25 de opriri, fiecare dintre ei e numărat de 25 de ori → 1000 «pasageri×opriri». Indicator util pentru **cât de plin e autobuzul de-a lungul traseului**, dar nu e număr de pasageri unici.

---

## Metrici noi (migrația 037)

### Pasageri unici (unique_passengers)
Numărul real de persoane distincte care au călătorit într-o cursă.

**Formulă:**
```
unique = pasageri_inițial_oprirea_1
       + Σ(max(0, pasageri[i] − (pasageri[i-1] − coborâți[i])))  // urcări la opririle următoare
       + Σ(counting_short_passengers.passenger_count)            // pasageri scurți
```

Se calculează pentru ambele direcții (tur + retur) și se adună.

**Notă:** Dacă `alighted` nu e completat consistent, algoritmul folosește doar creșterile pozitive ale `total_passengers` → supraestimare posibilă.

### Passenger-km (passenger_km)
Suma pe tronsoane a (pasageri × km_tronson). Măsoară cât de mult «muncă de transport» a făcut autobuzul.

```sql
passenger_km = Σ_tronsoane( (km[i+1] − km[i]) × total_passengers[i] )
```

### Route length km (route_length_km)
Lungimea totală a rutei (tur + retur), derivată din `counting_entries.km_from_start`.

Notă: `crm_stop_prices.km_from_chisinau` nu reprezintă km absoluți ci trepte tarifare, deci nu se folosește pentru distanțe reale.

### Load factor (load_factor_pct)
**Cea mai importantă metrică de încărcare.** Arată cât din capacitatea autobuzului a fost folosită pe parcurs.

```
load_factor = passenger_km / (route_length_km × 20 locuri) × 100
```

**Exemple (autobuz 20 locuri, traseu 300 km tur):**
- 20 pasageri × 300 km = 6000 pas×km → load_factor = 100% (plin tot drumul)
- 40 pasageri călătorind în medie 150 km fiecare = 6000 pas×km → tot 100%
- 10 pasageri × 300 km = 3000 pas×km → load_factor = 50%

**Zone:**
- **≥ 65%** — autobuz plin (verde)
- **40–65%** — încărcare medie (galben)
- **< 40%** — semi-gol (roșu)

### Revenue per km (revenue_per_km)
```
revenue_per_km = total_lei / route_length_km
```

Arată eficiența financiară a rutei: câți lei aduce fiecare km parcurs.

---

## Metrici de evaluare a rutelor

### Matricea 2×2

Fiecare rută e clasificată pe două axe:
- **Venit total** (vertical axa X) — compară cu **mediana tuturor rutelor**
- **Încărcare medie** (vertical axa Y) — comparat cu 50%

| | Venit mare | Venit mic |
|---|---|---|
| **Încărcare mare** | ⭐ **Stele** — ideal, nu modifica | 💎 **Mici eficiente** — mici dar pline |
| **Încărcare mică** | ⚠️ **De optimizat** — bani buni, dar gol | ❌ **De închis** — candidat la anulare |

### Clasificare în cod
```typescript
highRev = total_revenue >= medianRevenue
highLoad = avg_load_factor_pct >= 50
```

---

## Metrici de evaluare a șoferilor

Două metrici principale, fără scor compozit — admin-ul decide.

### % față de normă (pct_vs_route_norm)
Cât mai mulți pasageri aduce acest șofer vs media altor șoferi pe **aceleași rute** în **aceleași condiții** (zi, sezon, vreme).

**Formulă (ponderată după sample_count al baseline-ului):**
```
actual_weighted = Σ( actual_passengers × sample_count )
baseline_weighted = Σ( baseline_passengers × sample_count )
pct_vs_norm = (actual_weighted / baseline_weighted × 100) − 100
```

**Zone:**
- **≥ +10%** — foarte bun (verde închis)
- **0 până +10%** — ok (verde deschis)
- **−10 până 0%** — sub medie (galben)
- **< −10%** — problematic (roșu)

### Venit/km
Câți lei aduce șoferul pentru fiecare km condus.

```
avg_revenue_per_km = AVG(revenue_per_km) peste toate cursele sale
```

**Interpretare:**
- Ridicat = contabilizează corect toți pasagerii (inclusiv scurți)
- Scăzut = fie rute slabe, fie pierderi (scurți neregistrați)
- Compară cu mediana flotei pentru zonă verde/roșu

### Prag de fiabilitate
Doar șoferii cu **≥ 5 curse** în perioadă apar în evaluare. Mai puțin = neputincios statistic.

---

## Delta vs perioadă anterioară

Pe pagina Overview, fiecare KPI are săgeată ▲/▼. Se compară perioada curentă cu perioada anterioară de aceeași lungime (30 zile → compară cu cele 30 zile precedente).

```
delta_pct = (valoare_curentă − valoare_anterioară) / valoare_anterioară × 100
```

---

## Capacitatea autobuzului

Stocată în `app_config.bus_seat_capacity` (default = **20** locuri). Folosită în formula `load_factor`.

**În viitor:** adaugă coloana `vehicles.seat_capacity` pentru a suporta autobuze de dimensiuni diferite.

---

## Ce NU se măsoară (conștient)

1. **Integritate / honestitate șofer** (dacă înregistrează corect scurții, aplicarea tarifelor) — temă separată, va fi făcută după analitica de bază.
2. **Traseul individual al pasagerilor lungi** — nu se înregistrează de unde urcă și unde coboară fiecare pasager lung.
3. **Segmentare pasageri** (studenți, pensionari, etc.) — nu există categorizare.

---

## View-uri folosite

- **`v_session_full`** (migr. 033) — o sesiune per rând cu câmpuri de bază.
- **`v_session_metrics`** (migr. 037) — extensie cu metricile noi: `unique_passengers`, `passenger_km`, `route_length_km`, `revenue_per_km`, `load_factor_pct`.

## Funcții SQL

- `compute_unique_passengers(session_id)` — migr. 037
- `compute_passenger_km(session_id)` — migr. 037
- `get_route_length_km(crm_route_id)` — migr. 037
- `compute_route_baselines()` — migr. 033 (apelat prin butonul «Recalculare etalon»)
