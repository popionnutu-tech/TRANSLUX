# Revizie de cod — bilete online, pasul 4 (security-auditor, 03.10.2026)

Bilet fără plată: nu am găsit o cale. Callback-ul cere HMAC (`timingSafeEqual`, fereastră 5 min), prețul se recalculează pe server, `bilete_marcheaza_platita` verifică singură Completed + suma. Codul paginii are 128 biți, `cod_qr` 100 biți uniformi (256 % 32 = 0). `test_admin` vine doar din acțiunea cu `requireRole('ADMIN')`; ruta fixează `mod: 'public'`.

**SEC-1 — High — plătit fără bilet, fără alertă.** `callback/route.ts:183-189,124-126`; `comenzi.ts:241-243`; `483:205-206`.
(a) După un `eroare_creare`, reîncercarea cu aceeași cheie creează a doua sesiune maib cu același orderId. Plata pe prima sesiune ajunge la ramura orfană → «are deja checkout» → doar jurnal, 200, iar banca nu mai reîncearcă. Comentariul promite «alertă, nu tăcere».
(b) Ramura `lErr`: rândul există în `maib_checkouts`, dar `checkout_id` nu e legat → `marcheaza_platita` întoarce 0 → 200, în tăcere.
(c) Legarea finală din `creeazaComanda` nu are `.is('checkout_id', null)` și suprascrie legarea orfană.
Corecție: în ramura orfană, la orice refuz cu plata Executed, `INSERT bilete_alerte` (tip `platita_fara_bilet`). În `marcheaza_platita`, căderea pe `c.id = m.order_id` când nu se găsește după `checkout_id`. Adaugă `.is('checkout_id', null)` la `comenzi.ts:243`.

**SEC-2 — Medium (blocant la deschiderea steagului) — plafonul global e un DoS permanent.** `483:178-181`.
Nicio funcție nu expiră comenzile `noua`. Câteva IP-uri și telefoane +373 inventate fac 50 de comenzi → vânzarea se închide pentru toți, pe termen nelimitat,, fiecare cu o sesiune maib reală. Alerta `plafon_atins` e anulată de `RAISE` din aceeași tranzacție.
Corecție: expirarea `noua` după TTL-ul sesiunii maib, înainte de activare. Alerta se scrie din API, la `PLAFON_GLOBAL`.

**SEC-3 — Medium — date personale în `maib_callbacks.body`.** `callback/route.ts:61-68,152`.
Callback-urile valide păstrează corpul brut până la 16 KB, cu `senderIban`, `senderName`, `payerEmail`, `payerPhone`, `payerIp`. `maib_checkouts` le scoate, jurnalul nu; păstrare nedefinită. Cele respinse se scriu fără autentificare și fără plafon (512 B + antete) → oricine umple tabela pe instanța NANO.
Corecție: în jurnal, `JSON.stringify(faraDatePersonale(body))` + sha256 al corpului brut. Pentru cele respinse, `bilete_plafon('cb:'+ip, 60, 30)` înainte de insert.

**SEC-4 — Medium — biletele de test nu se deosebesc de cele reale.** `plati/actions.ts:28-35`; `483:20-56`.
`mod` nu se scrie în rând. Biletele de test vor intra în digestul șoferului și în `counting_sessions.online_lei` (4b). Corecție: coloana `test boolean NOT NULL DEFAULT false` (sau `created_by`), apoi excluderea ei în 4b și în digest.

**SEC-5 — Low — plafoane ocolite sau întoarse contra clienților.** `comanda/route.ts:55`; `483:174-177`.
Un `ip_hash` gol pune toți clienții într-o singură găleată (5 comenzi la 10 min). Telefonul nu e verificat: 3 comenzi `noua` pe numărul unei victime o blochează. Plafonul de telefon nu numără `eroare_creare`. Corecție: 400 la `ipHash` gol în modul `public`; numără `status IN ('noua','eroare_creare')`.

**SEC-6 — Low — GET-urile publice nu au plafon.** `public/[cod]/route.ts`; `public/config/route.ts:13`.
Enumerarea e imposibilă la 128 biți, dar fiecare 404 costă o interogare. Cache-ul `s-maxage` al config se ocolește cu `?x=n`. Corecție: `bilete_plafon` pe IP la `[cod]`; config ignoră query-ul (`revalidate = 60`).

**SEC-7 — Low — secretul `cod` circulă în URL-uri.** `comenzi.ts:223-224`; `actions.ts:33`.
Codul apare în `successUrl` (maib), în `/plati?bilet=` (jurnalele Vercel) și în istoric. Pagina din pasul 3: `no-referrer`, `noindex`, fără resurse terțe.

**SEC-8 — Low — cheia API și adresa callback-ului.** `comanda/route.ts:17,28-34`.
Pragul e de 32 de caractere, nu 256 biți cum spune comentariul: cere ≥ 64 hex. Fără `MAIB_PUBLIC_BASE_URL`, `callbackUrl` se ia din antetul Host. În producție, refuză dacă variabila lipsește.

**SEC-9 — Low — întăriri în SQL și în callback.** `483:152,166,202`; `callback/route.ts:188`.
`search_path TO 'public'` fără `pg_temp` (doar service_role execută, risc mic): folosește `''` și nume calificate. La `altul`, `maybeSingle` dă eroare la ≥ 2 rânduri, eroarea e ignorată și legarea continuă: folosește `.limit(1)` și verifică `error`.

Blocante (critical/high): 1
