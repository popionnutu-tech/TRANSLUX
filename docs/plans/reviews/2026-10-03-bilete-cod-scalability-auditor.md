# Revizie cod bilete online: viteză și robustețe (scalability-auditor, 03.10.2026)

Metodă: citire statică; ms-urile sunt estimări (Supabase NANO ~15–40 ms/drum, maib 0,3–1,5 s), nemăsurate.

## SPD-1 (high) Comenzile «noua» nu expiră niciodată
`483_bilete_online.sql:176-181` plafonează pe `status='noua'` (3/telefon, 50 global). În cod, `'expirata'` apare doar la refuz maib (`comenzi.ts:229`); nu există job de expirare (grep în apps/ și packages/db/src: zero). Efect: 50 coșuri abandonate = vânzarea oprită pentru toți (`PLAFON_GLOBAL`); 3 plăți abandonate = telefonul blocat definitiv. Corecție minimă: un cron care trece `noua`/`eroare_creare` mai vechi de 30 min în `expirata` (un UPDATE pe `bilete_comenzi_deschise_idx`), sau, în `bilete_creeaza_comanda`, numărătoarea cu `AND created_at > now() - interval '30 minutes'` (fără job nou). Plata sosită târziu e deja tratată (`platita_fara_bilet`).

## SPD-2 (medium) maxDuration 30 s contra maib 20 s × 2
`client.ts:19,160,195`: token 20 s + checkout 20 s, plus reîncercarea la 401 (`:171`) = până la 80 s teoretic. Peste 30 s Vercel taie funcția fără ca `catch`-ul de la `comenzi.ts:226` să ruleze: comanda rămâne «noua» cu `creare_in_curs_la` setat 2 min («in_lucru» la reluare). Corecție: timeout 8 s la `createCheckout` și la token (creare sesiune ~1 s în mod normal); în buget total ≤ 20 s. Rămâne recuperabil prin callbackul orfan, deci medium.

## SPD-3 (medium) Verificările independente se fac în serie
`comenzi.ts:144-153`: config → `directiaDeschisa` → `gasesteCursa` (2 runde, `pret.ts:133,153`; +1 la căderea de tarif `:72`) → `areSofer` (1 rundă): 5–6 runde seriale ≈ 100–200 ms, apoi RPC, revendicare, maib, 2 scrieri. Corecție: `Promise.all([citesteConfigBilete(), directiaDeschisa(), gasesteCursa(), areSofer()])`, apoi aceleași verificări în aceeași ordine a erorilor (semantica neschimbată; comanda respinsă costă 3 interogări în plus, neglijabil). Câștig: −3 runde, ≈ −80…120 ms din ~1,5–2 s totale.

## SPD-4 (low) `incarcaCurse`: 2 runde, a 3-a rară
`pret.ts:133-176`. Km, oferta și tarifele nu depind de opriri: mută-le în runda 1 (cu opririle); în runda 2 rămâne doar `routes`. Câștig real doar pe căderea de tarif (`:72`, +1 rundă ≈ 25 ms, rar) și eliminarea rundei seriale din runda 2. Pe căutări fără rezultat se fac 5 interogări în plus (13.000/săp.): nu e urgent. `crm_stop_fares.name_ro ILIKE` nu are index trigram (nu am găsit; `101_idx…visible` e altceva), dar tabela e mică (câteva mii de rânduri): ignorabil acum.

## SPD-5 (low) Callbackul: jurnalul înaintea update-ului, în serie
`callback/route.ts:109-158`: SELECT → INSERT jurnal (`:152`) → UPDATE → RPC = 4 runde ≈ 80–150 ms, sub orice timeout al băncii; nimic greu în cale (nicio notificare Telegram/QR). Corecție opțională: `Promise.all([jurnal(...), update])`. Când se adaugă notificările (pasul 5), ele merg în `after()`, nu în calea răspunsului.

## SPD-6 (low) `biletPublic`
`public.ts:40` `select('*')` aduce `ip_hash`, `telegram_id`, `email`, nefolosite: înlocuiește cu coloanele din `ComandaPublica` + `id, crm_route_id, going_north`. Două runde seriale (comandă, apoi bilete+rută): un singur SELECT cu embed `bilete(...)`, `crm_routes(...)` = −1 rundă. QR SVG: ≤4 × ~1–3 ms CPU, fără cache.

## SPD-7 (low) Cache config
`config/route.ts:14`: `s-maxage=60, swr=300` corect pentru trafic; dar steagul de oprire poate rămâne vizibil până la ~6 min. Acceptabil, deoarece `creeazaComanda` reverifică (`comenzi.ts:146`).

## SPD-8 (low) Indexuri și blocaje
Toate WHERE-urile din cod acoperite: `idempotency_key` UNIQUE; `ip_hash,created_at` (`:62`); `phone WHERE noua` (`:63`); `noua` global prin indexul parțial `:61` (≤50 rânduri); `cod` UNIQUE; `checkout_id` (`:60`); `order_id` UNIQUE (482); `daily_assignments` după dată (`010:17`). Lock-ul consultativ (`:172`) ține ≈ 3 count-uri + INSERT ≈ 3–8 ms: la zeci de comenzi/min nu se simte; global, deci ocolește orice paralelism al abuzatorilor, dar plafonul IP/telefon îi taie înainte de INSERT. `bilete_plafon` (DELETE la fiecare apel, `:155`) nu e apelată nicăieri în TS: cod mort acum; când va fi folosită, DELETE-ul pe `bilete_api_apeluri_idx` e ieftin, dar tabela nu se curăță dacă cheia nu mai e apelată (rânduri orfane, neglijabil).

Blocante (critical/high): 1
