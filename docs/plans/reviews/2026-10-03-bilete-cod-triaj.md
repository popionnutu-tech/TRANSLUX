# Revizia de cod a biletelor online (pașii 1, 2, 4) — triaj (03.10.2026)

Ion (02.10, 23:50): «lansează Codex + Claude pentru a face acest serviciu bullet proof și ultrafast», «să lucreze tot
ideal, fără bug-uri». Revizori: Claude senior-backend (fiabilitate), security-auditor, scalability-auditor; Codex
(gpt-6-astra, read-only, `codex-runda-1.json`). Toate observațiile critical/high sunt închise în două commit-uri
(1565b915 + migr. 484; 09995f35 + migr. 485).

| id | sev. | esență | decizie | unde |
|---|---|---|---|---|
| REL-1 / SPD-1 / SEC-2 / X8 | high | comenzile «noua» nu expiră → plafoanele blochează vânzarea; alerta pierdută de excepție | acceptat | migr. 484: plafoane pe ultimele 30 min; alerta din API |
| REL-2 / X6 | high | callback pierdut → nimeni nu emite biletele | acceptat | `sincronizeazaStare` cheamă `bilete_marcheaza_platita`; pagina de întoarcere și GET-ul public sincronizează comanda deschisă |
| SEC-1 / X1 / X2 / REL-4 | high | a doua sesiune maib pe aceeași comandă; legare suprascrisă; plată executată fără alertă | acceptat | `recupereazaSesiunea` (findCheckoutByOrderId) înainte de creare; `scrieSiLeaga` cu `checkout_id IS NULL` și toleranță la duplicat; migr. 484: RPC-ul leagă după `order_id`; alertă `platita_fara_bilet` la refuz cu plată executată |
| X3 | high | reluarea încasa totalul recalculat ≠ totalul comenzii | acceptat | plata din `comanda.total` |
| X4 | high | erorile bazei la comanda orfană → 200 | acceptat | `eroare:` → 500; rândurile legate verificate |
| X5 | high | refund din /plati lasă biletele valide | acceptat | /plati refuză «Returnează» pe plățile comenzilor de bilete până la pasul 6 |
| X7 / REL-11 | high/low | sincronizare/callback pot da starea înapoi | acceptat | condiția în UPDATE (`not status ilike completed`) și în sincronizare |
| X9 / SPD-2 / REL-3 | high/medium | timeout maib 20 s × 2 > maxDuration 30 | acceptat | `TIMEOUT_MS = 8 s` |
| X10 | high | eroare la citirea prețului confundată cu lipsa datelor | acceptat | `PretIndisponibilError` în `@translux/db`; site-ul jurnalizează și păstrează lista goală; API-ul oprește comanda |
| SPD-3 / X14 | medium | citiri secvențiale în creeazaComanda | acceptat | `Promise.all` pe cele patru citiri |
| X11 | medium | 404 fals când baza nu răspunde | acceptat | `BazaIndisponibilaError` → 503 |
| X12 | medium | idempotența verificată înaintea blocării | acceptat | migr. 485 |
| X13 / SEC-6 | medium/low | fără plafon pe biletul public | acceptat | `bilete_plafon` 60/min pe IP |
| SEC-4 | medium | comenzile de test nedeosebite | acceptat | `bilete_comenzi.test` (migr. 484) |
| SEC-5 / REL (ip_hash gol) | low | ip_hash gol = o găleată | acceptat | obligatoriu în modul public |
| SEC-8 | low | cheia API ≥ 32 car., nu 256 biți; `Boolean('false')` | acceptat | ≥ 64 hex; `=== true` |
| X15 | low | index redundant pe `bilete(comanda_id)` | acceptat | migr. 485 |
| SEC-3 | medium | callback-urile valide păstrează date personale 13 luni | respins cu fapt: decizia lui Ion din 02.10 (fără anonimizare); corpurile respinse sunt deja tăiate la 512 B (`callback/route.ts`, MAX_BODY_RESPINS) | — |
| SEC-7 | low | codul secret în URL-uri (maib, jurnale) | respins cu fapt: risc acceptat explicit în plan (SEC-18, v3) | — |
| REL-7 | low | `leagaComandaOrfana` ar fi cod mort | respins cu fapt: ramura e atinsă când `persistaCheckout` eșuează după crearea sesiunii (`comenzi.ts`, `scrieSiLeaga` → `eroare_creare`) și pasagerul deschide totuși linkul primit în răspunsul anterior; X4 a cerut chiar întărirea ei | — |
| SPD-8 | low | `bilete_plafon` nefolosit | închis de X13 (folosit pe biletul public) | — |

## Codex runda 2 (pe 09995f35, `codex-runda-2.json`) — triaj

Închise confirmate de critic: X1, X3, X4, X8, X10, X11, X14, X15. Restul, închise în al treilea commit (migr. 486 + cod):

| id | sev. | esență | decizie | unde |
|---|---|---|---|---|
| Y1 | high | emitere de bilete pe o plată Completed dar Refunded | acceptat | migr. 486: emiterea cere `payment_status=Executed`, `refunded_amount=0`, fără `refund_id`; altfel alertă |
| Y2 | high | eroarea la legare retrograda o comandă deja plătită de callback | acceptat | `comenzi.ts`: stările de eroare se scriu doar cât comanda e deschisă și nelegată; «legată de altă sesiune, platita» = succes |
| X2 (rest) | high | eroare la căutarea sesiunii → creare nouă; revendicare expirată fără recuperare | acceptat | căutarea eșuată → `maib` 503, nu creare; recuperarea rulează și când a existat o revendicare |
| X5 (rest) | high | eroarea citirii comenzii lăsa refund-ul să treacă; comanda orfană neverificată | acceptat | `/plati`: eroare = refuz; verificare și după `order_id` |
| X6 (rest) | high | eroarea emiterii din sincronizare → ok:true | acceptat | eroarea se propagă apelantului |
| X7 (rest) | high | sincronizarea scria necondiționat | acceptat | `not status ilike completed` în UPDATE (și la expirare) |
| X9 (rest) | high | fără buget total | acceptat | `maxDuration = 60` pe ruta comenzii (4 × 8 s + bază încap) |
| X12 (rest) | medium | reluarea trecea prin validările vânzării noi | acceptat | comanda existentă se rezolvă ÎNAINTEA validărilor (`asiguraSesiunea`) |
| X13 (rest) | medium | `bilete_plafon` neatomic; callback-urile respinse fără plafon; curățare parțială | acceptat | migr. 486: advisory lock pe cheie + curățare globală; callback: respingerile jurnalizate cu plafon 30/min pe IP |
| Y3 | medium | fără IP toți într-o găleată | acceptat | fără IP nu se aplică plafonul (Vercel pune mereu x-forwarded-for) |
