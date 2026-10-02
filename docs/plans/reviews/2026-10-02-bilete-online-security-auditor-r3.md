## Review: security-auditor — runda 3

### SEC-12…SEC-18 pe v3

| id | stare | fapt |
|---|---|---|
| SEC-12 | închis | pasul 1: `anulata`/`returnata`/`platita` + Completed → 0; test SQL pe `anulata`. Ieșirea din `platita_fara_bilet` → SEC-20 |
| SEC-13 | închis | 3/4a: `ip_hash` calculat pe web |
| SEC-14 | închis | 8: `/urcat` și `/telefon/<cod_qr>` cer cursa șoferului azi |
| SEC-15 | închis parțial → SEC-19 | 4d inserează din corpul semnat, dar condițiile sunt incomplete |
| SEC-16 | închis | 7b varianta B: `response` semnat, `user_id` egal, `auth_date`, fără `responseUnsafe` |
| SEC-17 | închis parțial → SEC-21 | sare separată, `ip_hash` golit la 90 de zile; corpul păstrat 13 luni conține date personale |
| SEC-18 | închis | 3: risc acceptat explicit |

### Observații noi

**SEC-19 · medium · 4d: condițiile inserării din callback sunt incomplete.** `maib_checkouts.order_id` e `UNIQUE` (`482_maib_plati.sql:10`), iar ruta derivă starea din `paymentStatus` (`route.ts:134,142`). v3 nu cere: (a) `paymentStatus=Executed`, `currency=MDL`; (b) `bilete_comenzi.checkout_id IS NULL` și niciun rând cu același `order_id`; (c) scrierea `checkout_id` pe comandă în aceeași tranzacție. *Scenariu:* reluarea cu același `idempotency_key` după `eroare_creare` cheamă din nou `createCheckout`. Așa apar două sesiuni pentru o singură comandă, iar pasagerul le plătește pe amândouă. A doua sesiune nu are loc în `maib_checkouts` din cauza UNIQUE: INSERT-ul cade, ruta răspunde 500 și maib reîncearcă la nesfârșit. `/plati` nu o poate returna. *Corecție:* condițiile (a)–(c) se trec în 4d. 4a: o sesiune pe comandă (la conflict, `checkoutUrl` salvat). Altfel: alertă și 200.

**SEC-20 · medium · «Emite biletele» și «Returnează» pe `platita_fara_bilet` nu sunt definite atomic.** `anuleazaSiReturneaza` revendică doar `platita → anulata` (pasul 6), deci nu atinge `platita_fara_bilet`. Cele două butoane nu se exclud între ele. *Scenariu:* doi admini (sau un dublu-clic) apasă ambele butoane: rezultă un refund acceptat ȘI bilete `valid`. *Corecție:* ambele acțiuni pornesc dintr-un UPDATE de revendicare `WHERE status='platita_fara_bilet'`. «Emite» verifică din nou Completed, suma, `refund_status IS NULL` și dacă plecarea e încă în viitor.

**SEC-21 · low · dovada păstrată 13 luni conține date personale.** Ruta scrie corpul valid întreg (`route.ts:66`), cu `senderName`, `payerEmail`, `payerPhone`, `payerIp`, `senderIban` (:37), plus `x-forwarded-for` (:49). Așa se ocolește anonimizarea de la 90 de zile. `clientFingerprint` cade pe cheia anon fără sare (`actions.ts:279`). *Corecție:* termenul de 13 luni se declară în politica Legii 195 (întrebarea 7), iar `headers` se golesc la 90 de zile. `BILETE_IP_SALT` lipsă înseamnă comandă refuzată (fail-closed), fără fallback. `ip_hash` null intră într-un plafon comun, nu ocolește plafonul.

### Deduceri
SEC-19 −1.0; SEC-20 −1.0; SEC-21 −0.5. Total −2.5.

Scor: 7.5 · Blocante (critical/high): 0
