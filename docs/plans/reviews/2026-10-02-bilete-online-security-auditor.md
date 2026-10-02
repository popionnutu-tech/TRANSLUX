## Review: security-auditor

**SEC-1 · critical (−3.0) · legarea șoferului se poate fura cu un contact străin.**
Pasul 7a potrivește `message.contact.phone_number` cu `drivers.phone`, dar nu cere ca contactul să fie al expeditorului. În Telegram oricine poate trimite botului cartea de contact a altcuiva. Telefoanele șoferilor sunt publice pe site (`apps/web/src/app/(public)/actions.ts:407,457`, `public_drivers_view`).
*Scenariu:* un concurent ia de pe translux.md telefonul șoferului cursei Ungheni–Chișinău, creează un contact cu acel număr și îl trimite botului. Botul scrie `drivers.telegram_id` = contul atacatorului. Atacatorul vede apoi numele și telefoanele pasagerilor și marchează biletele «urcat».
*Corecție:* legarea se acceptă doar dacă `contact.user_id === ctx.from.id`, chatul e privat și mesajul nu e forward. Telefonul care se potrivește cu mai mulți șoferi se refuză și ajunge la admin (7b).

**SEC-2 · high (−2.0) · bani încasați fără bilet.**
`bilete_marcheaza_platita` lucrează doar pe `status='noua'`. Pasul 4 trece comanda în `expirata` dacă «maib pică». Un timeout după ce sesiunea s-a creat totuși la maib lasă comanda fără `checkout_id`, iar callback-ul ajunge la «checkoutId necunoscut» → 200 și nimic altceva (`api/pay/maib/callback/route.ts:117-121`). La fel, un `Executed` întârziat pe o comandă deja `expirata` nu face nimic.
*Scenariu:* pasagerul plătește, nu primește bilet, iar nimeni nu e anunțat.
*Corecție:* `orderId` = id-ul comenzii. Callback-ul cu checkoutId necunoscut caută comanda după `orderId`, iar cel cu `Executed` pe o comandă `expirata` sau `anulata` pune starea `platita_fara_bilet`, apoi fie emite biletele, fie face refund automat, plus alertă la admin. Starea unei erori ambigue la crearea sesiunii e `eroare_creare`, nu `expirata`, și se împacă prin cron.

**SEC-3 · high (−2.0) · refund-ul ambiguu repune biletul valid; două revendicări separate.**
Pasul 6 face «maib refuză → înapoi `platita`». Clientul tratează însă orice excepție la fel, inclusiv timeout-ul de după ce refund-ul a fost creat (`(dashboard)/plati/actions.ts:213-218` eliberează revendicarea la orice eroare). Revendicarea anti-dublu e în acțiunea cu `requireRole` (`actions.ts:180,190-198`), nu în `lib/maib`.
*Scenariu:* răspunsul maib la refund expiră, comanda revine `platita` cu biletele valide, iar refund-ul e de fapt `Accepted`: pasagerul călătorește și își primește și banii. Pe altă cale, admin «Returnează» din /bilete și pasagerul «Anulează» în paralel: două căi cu revendicări diferite (`bilete_comenzi.status` față de `maib_checkouts.refund_status`).
*Corecție:* o singură funcție în lib care revendică pe `maib_checkouts.refund_status IS NULL` și e folosită de ambele căi. Doar un refuz explicit 4xx revine la `platita`. Timeout-ul și 5xx lasă `anulata` + `refund_status='Necunoscut'`, iar cron-ul îl împacă prin `getPayment`.

**SEC-4 · medium (−1.0) · prefixul public `/api/bilete/` acoperă tot subarborele** (`lib/public-paths.ts:54`, `startsWith`). Orice rută de admin pusă acolo (refund, export) ar fi fără sesiune. *Corecție:* acțiunile de admin rămân server actions din `(dashboard)/bilete`. În `public-paths.test.ts` se adaugă un test care listează rutele publice permise sub `/api/bilete*`.

**SEC-5 · medium (−1.0) · plafoanele sunt în memorie** (`extern/camioane-banda/route.ts:58-67`): se resetează la fiecare instanță Vercel, deci limita «5/10 min pe ip_hash» nu ține. Server action-ul `cumparaBilet` e public, iar fiecare comandă creează o sesiune la maib. *Corecție:* plafon în bază (numărare pe `bilete_comenzi.ip_hash` + `created_at`, ca migr. 334) și maximum N comenzi `noua` pe telefon.

**SEC-6 · medium (−1.0) · secretul paginii biletului se scurge.** Calea `/ro/bilet/<cod>` ajunge în `page_views.path` (`apps/web/src/app/api/analytics/track/route.ts:55-62`). `orderId = cod` e trimis la maib. *Corecție:* `orderId` separat, `/bilet/` exclus din tracking, `Referrer-Policy: no-referrer` pe pagina biletului.

**SEC-7 · medium (−1.0) · stările urcat/anulat se bat.** Coada offline poate trimite «urcat» după anulare. «Altă cursă» e permisă la scanare. *Corecție:* `/urcat` acceptă doar `valid` și jurnalizează restul. Anularea se refuză dacă vreun bilet e `urcat`. Marcarea pe altă cursă se scrie doar în `bilete_scanari`, cu cursa reală.

**SEC-8 · medium (−1.0) · datele personale ale pasagerilor ajung în `localStorage` și Telegram `CloudStorage`, fără ștergere.** `CloudStorage` e un terț nedeclarat în politica Legii 195. *Corecție:* doar `localStorage`, cheia zilei curente, iar zilele vechi se șterg la deschidere. Telefonul pasagerului se arată doar la cerere. `CloudStorage` se scoate.

**SEC-9 · low (−0.5)** · `bilete_marcheaza_platita`: `SET search_path = public`, `GRANT EXECUTE` doar pentru service_role. Funcția verifică ea însăși `maib_checkouts.status='Completed'` și `amount = bilete_comenzi.total`.

**SEC-10 · low (−0.5)** · Extragerea `init-data.ts`: comparația `!==` (`zadachnik/auth.ts:43`) se înlocuiește cu `timingSafeEqual`. Ocolirea `ALLOW_DEV_AUTH` (`auth.ts:61`) nu se aplică șoferilor. La dezactivarea șoferului se face și dezlegarea.

**SEC-11 · low (−0.5)** · `BILETE_API_KEY` de ≥256 biți, separată de `CAMIOANE_API_KEY`, fără `NEXT_PUBLIC_`. `lib/bilete-api.ts` primește `import 'server-only'`.

### Deduceri
| Id | Greutate |
|---|---|
| SEC-1 | −3.0 |
| SEC-2 | −2.0 |
| SEC-3 | −2.0 |
| SEC-4…SEC-8 | 5 × −1.0 |
| SEC-9…SEC-11 | 3 × −0.5 |
| **Total** | **−13.5 → plafonat la 0.0** |

Scor: 0.0 · Blocante (critical/high): 3
