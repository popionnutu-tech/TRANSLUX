## Review: scalability-auditor — runda 2

SC-1…SC-7 sunt închise. v2 aduce o problemă serioasă nouă (plafonul global ca pârghie de blocare) și câteva goluri mici.

### Observațiile vechi

| Id | Stare | Dovadă |
|---|---|---|
| SC-1 | închis | Plafoane în bază (4a, F24; precedent `packages/db/migrations/334_search_rate_limit.sql:17`); respingerea CAPTCHA are fapt. Goluri noi: SC-8, SC-9. |
| SC-2 | închis | Portocaliu «neconfirmat», reîmprospătare la `online`/`visibilitychange`/60 s, `generat_la`, fără CloudStorage (pasul 8). |
| SC-3 | închis cu rezervă | Index parțial (rând 123), `LIMIT 25`, buget 20 s, contor 5b. Rezerva: SC-10. |
| SC-4 | închis | Route Handler HTML, buget din cifra măsurată (pasul S), `initData` din hash. |
| SC-5 | închis | Polling 15 s cu plafon 3 min, notificare în `after()`/cron. |
| SC-6 | închis | `idempotency_key` UNIQUE + `ON CONFLICT … RETURNING` (4a). |
| SC-7 | închis | Precedent `439_analytics_vizitatori_unici.sql:43` (`cron.schedule`); la zeci de rânduri/zi loturile nu sunt necesare. |

### Observații noi

**SC-8 · high · Plafonul global de 200 comenzi `noua` blochează vânzarea.**
O comandă `noua` se închide doar la cron (> 30 min, `*/10`, 25 pe tick, 5a). Un script cu ip-uri rotite sare peste limita de 5/10 min pe ip și umple cele 200 de locuri în câteva minute. Golirea ia 8 ticks (~80 min) plus cele 30 min de așteptare: vânzare blocată ~110 min, iar atacatorul reia. Honeypotul nu oprește un apel direct la API.
Corecție: plafon global ~50; comenzile vechi fără `checkout_id` se închid primele; plafon și pe `user_agent`; alertă la admin când se atinge plafonul.

**SC-9 · medium · `ip_hash` nedefinit pe traseul site → admin.**
Pe site `ip_hash` vine din `x-forwarded-for` (`apps/web/src/app/(public)/actions.ts:275-281`). Dacă admin hașează IP-ul cererii server-la-server, toți pasagerii au aceeași adresă, iar limita de 5/10 min oprește tot site-ul după 5 comenzi.
Corecție: site-ul trimite `ip_hash` cu sarea din 334, admin nu recalculează. Test: 6 comenzi de la un hash, a 7-a de la altul trece.

**SC-10 · medium · `LIMIT 25` fără ordine.**
5a nu spune după ce se ordonează. Un `eroare_creare` nerezolvabil (60 min) poate reveni la fiecare tick și ține în loc comenzi plătite.
Corecție: `verificat_la`, `ORDER BY verificat_la NULLS FIRST, created_at`; după N încercări, `expirata` + alertă.

**SC-11 · medium · Plafoanele din bază nu au tabelă și indexuri complete.**
Plafonul de 120/min pe șofer (pasul 8) nu are unde să se numere (`bilete_comenzi` nu servește), iar «≤ 3 `noua` pe telefon» nu are index `(phone) WHERE status='noua'`. Corecție: tabelă mică de contoare, sau renunți la plafonul pe șofer, fiindcă `initData` e semnat. Reîmprospătarea la 60 s × 66 șoferi (~1 cerere/s) nu e o problemă; limitează doar rafala la `visibilitychange` (minimum 10 s între cereri).

**SC-12 · low · Route Handler fără antete de cache.** HTML-ul e identic pentru toți: `Cache-Control: public, s-maxage=300, stale-while-revalidate=86400` și `?v=` pentru versiune scot cold start-ul din calea deschiderii. Verifică intrarea în `public-paths.ts`.

**SC-13 · low · `get_incasare_report` cu termenul online.** Costul e neglijabil (câteva rânduri/cursă, filtrate pe `trip_date`). Corectitudine: ultima definiție e `060_anomaly_grafic_history.sql`, iar «`valid` până la plecare» schimbă retroactiv suma zilelor vechi. Pentru zile trecute se numără doar `urcat`.

### Deduceri
- SC-8: −2.0
- SC-9: −1.0
- SC-10: −1.0
- SC-11: −1.0
- SC-12: −0.5
- SC-13: −0.5

Total −6.0, deci 10.0 − 6.0 = 4.0.

Scor: 4.0 · Blocante (critical/high): 1
