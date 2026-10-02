## Review: security-auditor — runda 2

### Runda 1 pe v2

| id | stare | dovadă |
|---|---|---|
| SEC-1 | închis (varianta prin bot) | `contact.user_id` îl pune Telegram după număr; forward-ul păstrează id-ul proprietarului. Varianta B → SEC-16 |
| SEC-2 | **parțial** → SEC-15 | |
| SEC-3 | închis | 6: o revendicare, doar 4xx revine |
| SEC-4 | închis | `public-paths.ts:7-31` n-are `/api/bilete/`; `/api/bilete-sofer/` cu `/` final nu prinde altceva |
| SEC-5 | **parțial** → SEC-13 | |
| SEC-6 | închis, cu SEC-18 | |
| SEC-7 | închis pe stare, deschis pe proprietar → SEC-14 | |
| SEC-8…SEC-11 | închise | 8, 5c, 1, 7a, 4a |

### Observații noi

**SEC-15 · high · plata fără `maib_checkouts` rămâne fără bilet, fără alertă.** La `eroare_creare` nu există rând în `maib_checkouts`; callback-ul răspunde 200 «necunoscut» (`api/pay/maib/callback/route.ts:117-121`), deci maib nu mai reîncearcă. `bilete_marcheaza_platita(p_checkout_id)` citește `maib_checkouts` → 0. Căutarea `GET /v2/checkouts?orderId=` nu există în client (`lib/maib/client.ts:217-262`) și nici în F12. *Scenariu:* timeout la creare, pasagerul plătește, cron-ul pune `expirata` după 60 min, nimeni nu află. *Corecție:* pe ramura «necunoscut» cu `orderId` = comandă `noua`/`eroare_creare` și `amount = total` se face INSERT în `maib_checkouts` din corpul semnat, se scrie `checkout_id`, apoi RPC-ul. `eroare_creare` nu trece niciodată tăcut în `expirata`, ci în alertă. Listarea după `orderId` se verifică în sandbox (F12).

**SEC-13 · high · plafonul pe `ip_hash` numără IP-ul serverului web.** Comanda vine server-la-server (web → admin), iar admin citește IP-ul din antetele propriei cereri (`asistent-site/route.ts:36`, `ip-access.ts:24`). *Scenariu:* toți cumpărătorii au același `ip_hash`, iar al 6-lea din 10 min, din toată țara, e refuzat. *Corecție:* `ip_hash` se calculează în web (`actions.ts:275-281`), se trimite în corp (de încredere doar datorită cheii); test.

**SEC-12 · medium · un callback duplicat strică o comandă anulată.** Regula din pasul 1 «`anulata`/`returnata` + Completed → `platita_fara_bilet`» prinde și reluarea callback-ului aceleiași plăți (ruta reaplică la fiecare livrare, `route.ts:144-160`). Starea `anulata` se pierde, iar 5a nu mai împacă refund-ul. Cu `platita_fara_bilet` nu există nici ieșire: `anuleazaSiReturneaza` cere `platita`. *Corecție:* condiția devine `paid_at IS NULL AND status IN (expirata, eroare_creare)`; pentru `platita_fara_bilet` se adaugă refund-ul din 6.

**SEC-14 · medium · `/urcat` și `/telefon/<cod>` verifică doar starea, nu proprietarul.** *Corecție:* `<cod>` = `cod_qr` (niciodată codul comenzii, care permite anularea). Ambele rute cer ca biletul să fie pe o cursă a șoferului în `trip_date` (2b); altfel răspund 403 + jurnal.

**SEC-16 · medium · varianta «requestContact direct în API» n-are criterii.** *Corecție:* doar `response` semnat (HMAC ca initData), cu `contact.user_id === initData.user.id` și `auth_date` proaspăt; `responseUnsafe` e interzis.

**SEC-17 · low · `ip_hash` are sarea = cheia anon** (`actions.ts:279`, `visitor.ts:9`), deci se poate inversa în IP lângă nume și telefon. 5c nu-l anonimizează, iar ștergerea `maib_callbacks` la 90 de zile pierde dovada semnată a plății pentru chargeback. *Corecție:* `ip_hash` se golește la 90 de zile; `maib_callbacks` se anonimizează, nu se șterge.

**SEC-18 · low · rândul 115 («`cod` NU pleacă la maib») e contrazis de `successUrl` (168).** *Corecție:* textul se corectează (maib e procesatorul, riscul e acceptat).

Fără deducere: `orderId = id` (uuid aleator, nu e acreditare); honeypot-ul; `idempotency_key` (cere `crypto.randomUUID`, 409 la conținut diferit); pasul S (fără jurnalizarea `initData`).

### Deduceri
SEC-15 −2.0; SEC-13 −2.0; SEC-12, SEC-14, SEC-16 −1.0 fiecare; SEC-17, SEC-18 −0.5 fiecare. Total −8.0.

Scor: 2.0 · Blocante (critical/high): 2
