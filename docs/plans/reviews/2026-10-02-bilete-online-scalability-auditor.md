## Review: scalability-auditor

Scara reală e mică (zeci de comenzi/zi, 66 de șoferi): ce rupe planul nu e volumul, ci abuzul pe endpointul public, offline-ul și bugetele nemăsurate.

### Observații

**SC-1 · high (−2.0) · Plafoanele din pasul 4 și 8 nu funcționează pe serverless.**
Planul cere «30/min pe cheie, 5/10 min pe ip_hash» și «120/min pe șofer». Tiparul citat (F6) are contorul în memoria instanței: `apps/admin/src/app/api/extern/camioane-banda/route.ts:48-56` (`let apeluri`). Pe Vercel fiecare instanță are contorul ei, deci plafonul real e N×. Site-ul folosește deja varianta corectă, în bază: RPC `cautari_recente` (migr. 334, `apps/web/src/app/(public)/actions.ts:296-312`).
Scenariu: un scraper cheamă direct server action-ul `cumparaBilet` (e public) cu ip-uri rotite. Fiecare apel face un INSERT în `bilete_comenzi` și o sesiune maib (+token, +`getCheckout` la cron). Zeci de mii de comenzi `noua` umflă NANO-ul (incidentul 01.10) și epuizează cota maib.
Corecție: limita pe ip_hash și pe cheie se numără în bază (RPC pe `bilete_comenzi.ip_hash` + `created_at`, index), nu în memorie. Adăugați un plafon global de comenzi `noua` deschise (de ex. 200) și un CAPTCHA/honeypot pe formular. Același RPC pentru limita pe șofer.

**SC-2 · high (−2.0) · Offline: biletul vândut după descărcarea listei apare «necunoscut» (roșu).**
Pasul 8 descarcă lista la deschidere. Vânzarea rămâne deschisă până la 30 min înainte de plecare (pasul 3), deci o listă luată la 06:00 nu conține biletul cumpărat la 07:40. Scenariu: pasagerul plătit e refuzat la urcare, în sat, fără semnal. În sens invers, un bilet anulat și returnat după descărcare rămâne verde offline.
Corecție: (a) offline, un cod necunoscut devine portocaliu «neconfirmat, nu e în lista de la HH:MM», acceptat la decizia șoferului, pus în coada de verificare; (b) lista se reîmprospătează la fiecare `online`, la `visibilitychange` și la ~60 s cât ecranul e deschis; (c) ecranul arată vârsta listei; (d) serverul păstrează primul `urcat_at` (`UPDATE … WHERE status='valid'`) și primește ora scanării de la client; (e) verificați limitele CloudStorage din docs (valoarea e limitată la câteva mii de caractere, nu încape lista; F10 nu le verifică). Pe localStorage din webview-ul iOS nu contați ca sursă unică.

**SC-3 · medium (−1.5) · Cron-ul de expirare (pasul 5) nu are lot, index și plafon de timp.**
`getCheckout` e secvențial per comandă, iar funcția are `maxDuration` ≈ 15–30 s (cf. `callback/route.ts:18`, `anunt-bilete-online/route.ts:9`); fiecare apel maib are timeout propriu (`lib/maib/client.ts:156,189`). Dacă SC-1 lasă un rest de sute de comenzi `noua`, tick-ul expiră la mijloc și restul nu mai ajunge niciodată. Pasul 1 indexează doar (`trip_date`, `crm_route_id`, `going_north`) și `checkout_id`, deci `WHERE status='noua' AND created_at<…` e seq scan.
Corecție: index parțial `(created_at) WHERE status='noua'`; `LIMIT 25` pe tick, cu paralelism 5 și buget de timp 20 s; un contor «comenzi `noua` mai vechi de 40 min» vizibil în `/bilete` și în digestul de seară (acum nu există nicio alertă dacă cron-ul VPS tace).

**SC-4 · medium (−1.5) · Bugetul «≤ 60 KB JS, Lighthouse ≥ 90» e nemăsurat pe baza reală.**
Singura cifră (F11) e 150 KB pentru paginile existente, care sunt React client components în Next (`mini-app/zadachnik/layout.tsx:1,8`). Planul nu a măsurat un ecran gol Next+React în repo; probabil rămâne puțin loc pentru cod. Scenariu: testul `size-limit` din CI pică la pasul 8, iar bugetul fie se ridică în tăcere, fie blochează lansarea de după 12.10.
Corecție: ca primă sub-sarcină a pasului 8, măsurați o pagină goală și scrieți bugetul pe cifra reală; dacă nu intră, pagina devine HTML + script inline (fără framework). Hash-ul `tgWebAppData` din URL oferă `initData` fără să aștepte SDK-ul, deci fără polling la 50 ms (`zadachnik/ui.ts:55-64`). Încărcarea sincronă din `<head>` blochează desenarea dacă telegram.org e lent; folosiți `ready()` după primul desen, nu înainte.

**SC-5 · medium (−1.0) · Pagina biletului și callback-ul: polling și lucrări în calea răspunsului.**
Pagina `noua` se reîncarcă la 5 s, adică 2 salturi (web → admin → bază), `no-store`, fără plafon: ~300 cereri per comandă în 25 min. Corecție: 5→15 s cu plafon la 3 min, apoi buton «Verifică»; la `noua` serverul poate face un `getCheckout` direct, ca să nu aștepte callback-ul. Notificarea șoferului din pasul 4/7 nu rulează în callback (`maxDuration 15`, `callback/route.ts:18`): după ce răspunde 200 (`after()`), sau din cron. Un Telegram lent altfel face banca să reîncerce.

**SC-6 · low (−0.5) · Comanda nu e idempotentă la dublu-click.** Formularul trimite un `idempotency_key` (uuid generat în browser), `UNIQUE` pe `bilete_comenzi`; altfel două sesiuni maib pentru o singură intenție.

**SC-7 · low (−0.5) · Retenția de 90 de zile nu are pas.** Riscul din tabel o promite, dar nu există job. Folosiți `pg_cron` (precedent: migr. 439), în lot, noaptea, nu într-un singur DELETE.

### Ce e rezonabil
Volumul tabelelor (zeci de rânduri/zi, ~100k/an) e neglijabil pentru NANO; cron-ul VPS evită cele 2 cron-uri Hobby; callback-ul cu jurnal limitat e corect. Lecția incidentului 01.10 (lock lung pe cozi) nu atinge tabelele noi, dar RPC-ul `bilete_marcheaza_platita` trebuie să aibă `statement_timeout` scurt.

### Deduceri
- SC-1: −2.0
- SC-2: −2.0
- SC-3: −1.5
- SC-4: −1.5
- SC-5: −1.0
- SC-6: −0.5
- SC-7: −0.5

Total −9.0, deci 10.0 − 9.0 = 1.0.

Scor: 1.0 · Blocante (critical/high): 2
