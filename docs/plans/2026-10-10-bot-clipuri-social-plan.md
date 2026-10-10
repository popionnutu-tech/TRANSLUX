# Botul publică clipurile bloggerilor pe TikTok / Facebook / Instagram

Sursa: doc claude.ai «Plan bot Telegram – postare video și comentarii» (2MSfo943spWNgcxhwNTiux, 09.10). Ion, 10.10:
«hai să realizăm»; «noi boți avem, putem folosi ce îl avem pentru translux și pentru tlx»; «lansează claude gpt
dezbatere pe plan». Etapele 1–4 sunt deja scrise și împinse (TRANSLUX cfb8f10d, TLX d9ff1d8f, migr. 544 aplicată);
botul Translux de pe Railway NU e încă redeployat (rulează 4a6fca54). Dezbaterea judecă planul + codul scris, înainte
de deploy și de primele chei.

## De ce

Bloggerii filmează clipuri pentru 9 conturi (6 TikTok, 2 pagini Facebook, 1 Instagram). Ion vrea ca ei să le pună
într-un topic Telegram, iar botul să scrie textul, să le planifice și să le publice singur, fără aprobare; adminii pot
anula sau muta până la ora publicării. Mai târziu botul răspunde la comentarii cu caracterul asistenților digitali.

## Ce facem

**Ales:** un motor în botul Translux (Railway): topicuri legate de profiluri Upload-Post, lista albă de bloggeri,
calendarul nostru în `social_posts`, publicarea prin Upload-Post la ora planificată, descărcarea clipurilor mari prin
MTProto cu același token. Două supergrupuri: Translux 1–2 la botul Translux; TLX 1–4 la botul TLX (Render), care doar
trimite actualizările la `POST /social/v1/tlx` (cheia `SOCIAL_RELAY_KEY`); motorul răspunde în grupul TLX cu
`TLX_BOT_TOKEN`.

**Respins 1 — server propriu Telegram Bot API (din planul inițial):** cere `logOut` din cloud pentru tot botul; botul
Translux (operatorii, biletele, aplicația de peron) și botul TLX ar trece cu tot traficul pe el.
**Respins 2 — motor separat în fiecare bot:** botul TLX e un Express simplu fără grammY; logica (calendar, AI,
publicare, stări) s-ar scrie de două ori.
**Respins 3 — calendarul în Upload-Post (`scheduled_date`):** anularea ar depinde de un endpoint de ștergere
nedocumentat; cu calendarul nostru, clipul pleacă abia la oră și Anulează/Mută merg până în ultimul minut.

## 🔬 Verificat pe viu

| Presupunere | Cu ce s-a verificat | Fapt | Ce influențează |
|---|---|---|---|
| Upload-Post publică video pe TikTok/FB/IG într-o cerere | docs.upload-post.com/api/upload-video (WebFetch 10.10) | `POST /api/upload` multipart, `platform[]`, `video` fișier sau URL, `facebook_page_id`, `facebook_media_type` REELS/STORIES/VIDEO, `media_type` REELS/STORIES (IG), `privacy_level`, `post_mode`, `first_comment`, `async_upload`, `request_id`; >59 s trece singur pe async | `uploadPost.ts` campuriPublicare |
| Retrimiterea nu dublează | idem | antetul `Idempotency-Key` (sau `X-Request-Id`): „dacă există job cu aceeași cheie, se întoarce jobul existent” | retry în `publicare.ts` |
| Starea publicării | docs /api/upload-status | `GET /api/uploadposts/status?request_id=` → `status` pending/queued/processing/in_progress/completed/failed/not_found, `results[]` cu `platform, success, status, message`, TikTok `fallback_to_inbox`, `post_url` | `interpreteazaStarea` |
| Stories prin API | upload-video | DA pe FB și IG (`STORIES`); TikTok nu | `PLATFORME_STORY` |
| Comentarii prin Upload-Post | docs /api/comments | list `GET /api/uploadposts/comments` (user, platform, post_id/post_url), create `POST …/comments/create` (`message`, `comment_id` obligatoriu la IG); TikTok da, cu contul reconectat (`comments` în capabilities); fără webhook → polling | etapele 5–7 (nescrise) |
| Prețuri / limite | docs /resources/pricing-and-limits | Professional 50 $/lună (33 anual), 25 profiluri; TikTok 15 postări/24 h pe cont, IG 50, FB 25 | planul Professional, max_pe_zi ≤ 10 |
| Botul poate cere supergrupul fără access_hash | core.telegram.org/api/peers | „Zero access hash … must be used by bots when only a min access hash (or no access hash) is available” | `descarcare.ts` InputChannel accessHash 0 |
| GramJS cere actualizări la conectare | node_modules/telegram/client/auth.js:57 (`checkAuthorization` → `updates.GetState`), updates.js:219 | `start()` abonează sesiunea la actualizări | fără `start()`; cererile proprii în `InvokeWithoutUpdates`, dar GramJS trimite singur câteva neîmpachetate (InitConnection/GetConfig, Export/ImportAuthorization pe alt DC, GetState la NETWORK_MIGRATE — runda 2, SBE2-1); tot MTProto stă într-un proces copil (`descarcare-lucru.ts`), omorât cu SIGKILL la limită; abonarea o decide doar proba (pasul 10) |
| `destroy()` nu închide senderele exportate | node_modules/telegram/client/telegramBaseClient.js:56, :158-178; proba revizorului `destroy-exported.cjs` → `exportedSenderDisconnectedByDestroy: false` | o descărcare orfană sau o buclă de reconectare ar rămâne în proces | procesul copil + SIGKILL; verificat pe viu 10.10: copilul răspunde (`API_ID_INVALID` cu token fals), iar la limita de 300 ms e omorât, 0 procese rămase |
| GramJS scrie fișierul fără să aștepte | node_modules/telegram/client/downloads.js:297 (`await writer.write` pe WriteStream = boolean), :314 (`close` neașteptat) | fișierul poate fi incomplet la întoarcere | `iterDownload` + `FileHandle.write` așteptat + mărimea exactă |
| Tabelele noi închise | `pg_class` / `pg_policies` / `has_table_privilege` pe prod (10.10) | social_topics/bloggers/posts: RLS on, 0 politici, anon și authenticated fără SELECT | doar botul (service role) |
| Cine e ADMIN | `select … from users where role='ADMIN'` (10.10) | 1 ADMIN activ, cu telegram_id | butoanele și comenzile |
| Botul Translux vede clipurile din grup | `getMe` + `getWebhookInfo` (10.10) | @TransluxMoldova_bot, `can_read_all_group_messages=false` (privacy mode), webhook gol = polling | botul TREBUIE administrator în supergrup (adminii primesc toate mesajele); pasul 5 |
| Botul TLX primește butoanele | `getWebhookInfo` @tlxmd_bot (10.10) | url tlx-azs.onrender.com/webhook, `allowed_updates=["message"]` | `/set-webhook` după deploy (acum cere și `callback_query`, `my_chat_member`) — pasul 7 |
| Botul TLX vede clipurile | `getMe` @tlxmd_bot | `can_read_all_group_messages=true` | — |
| Discul containerului Railway încape un clip de 800 MB | **neverificat** (fără acces shell la container) | — | rezervă: un singur clip pe disc la un moment dat, șters și la SIGKILL; prima publicare reală (pasul 12) cu un clip mic; eroarea de disc iese ca «Clip nepublicat» la ADMIN, nu publică nimic |
| Adresa releului | `curl https://bot-production-6376.up.railway.app/version` | 200, deploy-bot 4a6fca54 | `SOCIAL_RELAY_URL` |
| TLX are `TELEGRAM_WEBHOOK_SECRET` pus | **neverificat** (fără acces la Render) | — | rezervă: releul nu pornește fără el (fail closed, server.ts) — botul TLX rămâne cum era; Ion îl pune |
| Sesiunea MTProto scurtă nu ia actualizările Bot API ale botului Translux | **neverificat** (fără api_id) | — | protecția = proba numerotată pe bot de unică folosință (pasul 10, același cod ca în producție, pe același DC și pe alt DC) + procesul copil omorât la limită; `InvokeWithoutUpdates` doar pe cererile noastre, GramJS trimite și neîmpachetate (runda 3, SBE3-3). Pică → cheile MTProto nu se pun, descărcarea trece pe un bot separat |

## Pași

(Reordonați în runda 1, BL-1: cheile publicării reale vin ULTIMELE, după proba fără chei și după proba MTProto.)

1. ✅ Migrația 544 (`social_topics`, `social_bloggers`, `social_posts`) — aplicată (dry-run, apoi aplicare).
2. ✅ Migrațiile 545 (destinația + `in_proba` pe postare) și 546 (`neconfirmat`, `trimis_posibil`) — aplicate 10.10 (tabelele goale: 0 postări, 0 topicuri).
3. ✅ Motorul `apps/bot/src/social/` + legarea în `bot.ts` / `index.ts` — cfb8f10d + corecțiile rundei 1 (commit nou).
4. ✅ Releul TLX în `bot-server/src/server.ts` — d9ff1d8f + corecțiile rundei 1 (commit nou).
5. ⏳ Deploy botul Translux pe Railway după 22:00 (`deploy-railway.sh`, fără FORCE). Rezultat: `/version` = commitul nou; logul arată «Social: publicatorul clipurilor».
6. ⏳ Ion: supergrupurile cu Topics, boții administratori cu «Gestionare subiecte» (botul Translux are privacy mode — vede clipurile DOAR ca admin).
7. ⏳ Ion, doar releul și grupurile: Railway `TLX_BOT_TOKEN`, `SOCIAL_RELAY_KEY` (`openssl rand -hex 32`); Render `SOCIAL_RELAY_URL`, același `SOCIAL_RELAY_KEY`, `TELEGRAM_WEBHOOK_SECRET` pus (fără el releul nu pornește).
8. ⏳ `GET /set-webhook` la botul TLX → `getWebhookInfo` arată `message`, `my_chat_member`, `callback_query`.
9. ⏳ Proba fără chei: în fiecare topic `/lega_social`, `/social_pagina` unde profilul are mai multe pagini FB (C3), `/blogger`, un clip scurt, «▶ Acum» → «🧪 Probă». Rândurile de probă rămân probă pentru totdeauna (`in_proba`, migr. 545), deci nu e nevoie de golirea cozii (BL-2).
10. ⏳ Proba MTProto (SBE-2/SBE-3), înainte ca `TELEGRAM_API_ID` să ajungă în Railway: bot de unică folosință + `scripts/social-proba-mtproto.mts`; trece doar dacă toate mesajele scrise în timpul descărcării ajung prin Bot API; se notează MB/s. Pică → nu se pun cheile MTProto; rezerva = bot separat doar pentru descărcare.
11. ⏳ Abia apoi, după 22:00 și chiar înaintea pasului 12: `/social_oprit` în toate topicurile în afară de unul, apoi Railway `UPLOAD_POST_API_KEY`, `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` (runda 2, BL2-6).
12. ⏳ Prima publicare reală: topicul rămas pornit, un clip, «▶ Acum», cu logurile botului urmărite 30 min. Trece → `/social_porneste` în celelalte (runda 3, R3-4). Pică → cheile se scot din Railway pe loc (clipurile reale așteaptă, nu pleacă).
13. Etapele 5–8 din doc (comentarii, raport) — plan separat, după alegerea caracterului.

## Fișiere

- `packages/db/migrations/544_social_video.sql` — tabelele.
- `apps/bot/src/social/comun.ts` — boții, tipurile, ADMIN/blogger, `publicareReala()`.
- `apps/bot/src/social/primire.ts` — comenzile din topic, primirea clipului, butoanele `soc:a|u|n:<id>`.
- `apps/bot/src/social/calendar.ts` — locul liber (Intl, ora Chișinăului).
- `apps/bot/src/social/texte.ts` — textul AI (claude-sonnet-5, JSON strict, rezervă fără AI).
- `apps/bot/src/social/uploadPost.ts` — cererea și starea.
- `apps/bot/src/social/descarcare.ts` — părintele: pornește copilul, SIGKILL la 30 min, sesiunea în memorie; `motivSchimbat`.
- `apps/bot/src/social/descarcare-lucru.ts` — procesul copil: tot MTProto (pachetul `telegram` 2.26.22, fixat).
- `apps/bot/src/social/publicare.ts` — publicatorul și stările.
- `apps/bot/src/social/index.ts` — handlerele grammY, releul `POST /social/v1/tlx`, programarea.
- `apps/bot/src/social/social.test.ts` (funcțiile pure) + `publicare.test.ts` (mașina de stări, bază falsă) — 32 de teste.
- `packages/db/migrations/545_social_posts_destinatie.sql` — destinația și modul probă pe postare.
- `packages/db/migrations/546_social_posts_confirmare_trimitere.sql` — starea `neconfirmat`, `trimis_posibil`.
- `scripts/social-proba-mtproto.mts` — proba MTProto (pasul 10).
- `apps/bot/src/bot.ts`, `apps/bot/src/index.ts`, `apps/bot/package.json`.
- TLX: `bot-server/src/server.ts` — `esteUpdateSocial`, `releuSocial`, `allowed_updates`.

## Riscuri

| Risc | Rezervă |
|---|---|
| Clip nepotrivit public (fără aprobare, decizia lui Ion) | doar lista albă + ADMIN; Anulează până la oră; avans minim 15 min |
| MTProto fură actualizările botului | sesiune deschisă doar la descărcare; prima probă noaptea; oprire prin scoaterea `TELEGRAM_API_ID` |
| Dublă publicare | `Idempotency-Key` = id-ul postării; «trimis» scris cu 3 încercări; luarea atomică pe `stare='planificat'` |
| Upload-Post căzut / scumpit | stare `esuat` + alertă ADMIN; alternativ Ayrshare (doc) |
| Disc plin pe Railway | fișierul se șterge după trimitere și la orice eroare; 2 clipuri pe trecere |
| Releu falsificat | cheie ≥ 16 caractere comparată în timp constant; TLX trimite doar cu secretul webhook-ului |
| TikTok trimite în ciorne (`fallback_to_inbox`) | mesaj în topic «apăsați Postează» |
| Redeploy chiar cât se lucrează un clip (TLX: 200 trimis înainte; Translux: clipul în fundal ~1 min) — runda 2, SBE2-4 | regula din topic: fără mesajul cu ora în 2 minute → clipul se retrimite (dublura e oprită de UNIQUE); deploy-urile botului doar după 22:00 |
| Pachetul `telegram` 2.26.22 e abandonat (SBE-7) | versiune fixată exact; tot MTProto stă în `descarcare-lucru.ts` (~60 de rânduri), deci trecerea pe `teleproto` atinge un singur fișier |

## Verificare

- `npx tsc --noEmit -p apps/bot` curat; `npx vitest run src/social` 45/45 (inclusiv: refuzul de acum nu șterge îndoiala de dinainte, încercarea posibil-plecată întrebată înainte de retrimitere, refuzul 4xx lămurește trimiterea, trimiterea posibilă rămâne marcată, rândul neconfirmat nu se publică și se închide, /social_oprit de două ori rămâne oprit, citire căzută a topicului / listei → înapoi în calendar, confirmare căzută → anulat, repostare incertă = același rând, eșec sigur = rând nou, o singură publicare la două treceri, 3 erori trecătoare → eșuat, deblocarea, proba rămâne probă, autor scos → anulat, clip mutat în timpul trecerii nu pleacă, platformă sărită → alertă).
- `tsc --noEmit` în TLX bot-server curat.
- Pe viu după deploy: `/version`; în topic `/social`; un clip → mesajul de calendar; la oră «🧪 Probă»; cu chei: `social_posts.stare` publicat + link-uri.

## Review: security-auditor

**SEC-1 · critical · −4.0 · `apps/bot/src/social/index.ts:31-35` (apelat la `:46`, în afara oricărui try) + `apps/bot/src/index.ts:69-75`**
Oricine, fără nicio cheie, poate opri procesul botului Translux. `cheieCorecta` compară `p.length` (numărul de caractere al antetului) cu `asteptata.length`, apoi cheamă `timingSafeEqual(Buffer.from(p), Buffer.from(asteptata))`. Un antet `x-social-key` cu un octet non-ASCII (0x80–0xFF) are tot atâtea caractere cât cheia, dar mai mulți octeți în UTF-8. Atunci `timingSafeEqual` aruncă `RangeError ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH`. Excepția iese din callback-ul `async` al `createServer` ca respingere netratată, iar în `apps/bot/src` nu există niciun `process.on('unhandledRejection')` (verificat cu grep). Procesul se oprește cu codul 1.
Am reprodus local, pe Node 22.23 (scriptul din scratchpad `hdr.mjs`): antetul de 32 de caractere a dat 33 de octeți, `RangeError`, `process exit code 1`.
Scenariul: atacatorul nu știe lungimea cheii, așa că trimite `POST /social/v1/tlx` cu lungimile 16…128 (cel mult 113 cereri). Toate primesc 401, până la lungimea corectă, care oprește procesul. Railway îl repornește, atacatorul repetă bucla. Cât timp ține atacul cad împreună operatorii, biletele, API-ul aplicației de peron și heartbeat-ul.
Rămâne de verificat dacă proxy-ul Railway lasă să treacă octeții obs-text. Defectul din cod e sigur, iar corecția e ieftină.
Corecția planului (pas nou înaintea pasului 4, deploy-ul): compararea se face pe octeți, ca în `apps/bot/src/api/livrare.ts:21` (`a.length === b.length && timingSafeEqual(a, b)` pe Buffer) sau pe `sha256(p)` cu `sha256(cheie)`. Verificarea cheii și citirea corpului intră în același try. Un test cu antet non-ASCII intră în `social.test.ts`.

**SEC-2 · medium · −1.0 · `apps/bot/src/social/descarcare.ts:69-73`, `primire.ts:293`**
La ora publicării, singura verificare a clipului e mărimea fișierului. Mai mult, ea se sare cu totul când `file_size` e null (`marimeAsteptata &&`). Nu se verifică cine a scris mesajul (`msg.fromId` față de `autor_telegram_id`), nici dacă mesajul a fost editat (`msg.editDate`), nici identitatea documentului.
Scenariul A: un blogger de pe listă înlocuiește clipul văzut de admin cu altul de aceeași mărime (umplut la octet).
Scenariul B: cineva care are `SOCIAL_RELAY_KEY` trimite o actualizare falsă. Pune `from.id` al unui blogger, `message_id` al oricărui clip din supergrup (chiar al unui om de pe afară) și `file_size` null. Clipul pleacă public.
Corecția planului: `descarcaClip` refuză (cu `ClipSchimbat`) când `editDate` e pus, când autorul MTProto ≠ `autor_telegram_id` sau când mărimea lipsește. Așa, releul încetează să fie singura barieră.

**SEC-3 · medium · −1.0 · `publicare.ts:72-76`, `primire.ts:203-207`, `:221-222`**
Comutatorul de oprire nu oprește coada. `publicaUna` nu verifică la publicare nici `topic.activ`, nici dacă autorul mai e pe lista albă ori mai e admin. Autorizarea se judecă doar la primirea clipului.
Scenariul: contul unui blogger e furat și umple calendarul pe 90 de zile cu clipuri nepotrivite. Adminul dă `/blogger_scoate` și `/social_oprit` și crede că s-a oprit totul. Clipurile deja planificate pleacă la 12:30 și 19:30, iar adminul trebuie să le anuleze pe rând, din butoane.
Corecția planului: la luarea din coadă se reverifică `topic.activ` și `esteBlogger || esteAdmin(autor)`. Dacă verificarea pică, starea devine `anulat` cu motivul scris. Alternativa e ca `/blogger_scoate` și `/social_oprit` să anuleze în masă postările `planificat` ale autorului sau ale topicului.

**SEC-4 · medium · −1.0 · `texte.ts:80-85`, `texte.ts:57-71`, `primire.ts:260`**
Prompt injection și scurgerea notei în textul public.
(a) Când AI-ul cade (lipsește cheia, timeout, JSON stricat), `textRezerva` publică textual caption-ul bloggerului. Caption-ul e o notă pentru AI, de exemplu „reducere până vineri, nu spune de X, sună-mă 069…”, și iese pe 9 conturi publice.
(b) Răspunsul AI nu e filtrat: `parseazaText` validează doar forma, nu link-uri, @mențiuni sau telefoane. Un clip trimis mai departe (forward) dintr-un canal străin aduce caption-ul și miniatura altcuiva. O instrucțiune ascunsă acolo poate pune în textul public un link de phishing sau un @cont străin.
Corecția planului: rezerva nu folosește nota, ci doar numele contului și hashtag-urile. Textul AI se respinge (și se trece pe rezervă) dacă are URL-uri în afară de translux.md/tlx.md, @mențiuni sau numere de telefon. Mesajele trimise mai departe (`forward_origin`) se primesc fără notă.

**SEC-5 · low · −0.5 · `primire.ts:135-155` (față de `:316`)**
Comenzile nu verifică `topic.bot === bot`, deși clipurile o verifică. `/lega_social` face upsert pe `chat_id,thread_id` și rescrie `bot` cu botul care a procesat comanda ultimul. Asta se întâmplă dacă ambii boți sunt în același supergrup, sau la o actualizare falsă prin releu: un topic Translux trece pe `bot='tlx'`, apoi răspunsurile și descărcarea merg cu alt token.
Corecția planului: comanda se refuză când topicul există și `topic.bot !== bot`.

**SEC-6 · low · −0.5 · `primire.ts:156`, `:175`, `:219`, `:297`; `publicare.ts:105`**
Mesajele brute de eroare de la Supabase și Upload-Post ajung în topic, unde le văd toți membrii, inclusiv bloggerii. Ele dezvăluie nume de constrângeri și coloane și răspunsurile API-ului.
Corecția planului: în topic se scrie un mesaj generic, iar detaliul pleacă doar în `sendAdminAlert` și în log.

**SEC-7 · low · −0.3 · TLX `bot-server/src/server.ts:348`, `:359-363`**
Secretul webhook-ului, care acum ține toată încrederea releului, se compară cu `!==`, nu în timp constant. În plus, releul trimite spre Railway clipurile și comenzile din orice supergrup TLX care nu e grup de stație, nu doar din supergrupul clipurilor. Datele altor grupuri pleacă fără nevoie.
Corecția planului: compararea se face cu `timingSafeEqual` pe octeți. Releul trimite doar din chat-ul pus în `SOCIAL_RELAY_CHAT_ID`. La pasul 6 se adaugă că `SOCIAL_RELAY_KEY` se generează cu ≥32 de octeți aleatori (`openssl rand -hex 32`).

Bune, verificate în cod:
- RLS e pornit pe cele 3 tabele, cu `REVOKE ALL FROM anon, authenticated` (`544_social_video.sql:82-85`) și fără funcții noi, deci fără EXECUTE pentru PUBLIC.
- Adminul vine din `users.role='ADMIN' AND active` (`comun.ts:85-89`), iar codurile de legare nu se dau pentru ADMIN (`users/linkCode.test.ts:31`).
- Lista albă e pe topic, iar `/blogger` exclude boții și mesajul de creare a topicului.
- Butoanele `soc:` cer admin și se scriu condiționat pe `stare='planificat'`.
- Releul TLX e închis când secretul webhook-ului lipsește.
- Sesiunea MTProto stă doar în memorie, iar clipul se șterge după trimitere.

Scor: 1.7 · Blocante (critical/high): 1

## Review: business-logic-auditor

Am citit: migr. 544, `apps/bot/src/social/*` (toate 9 fișiere), legarea din `bot.ts:35-89` și `index.ts:44,74,129`, `scheduler.ts:356` (`rulareFaraSuprapunere`), `middleware` rate-limit/auth, releul TLX din d9ff1d8f (`bot-server/src/server.ts:208-245, 318-365`). Ce e corect: luarea atomică pe `eq('stare','planificat')` (publicare.ts:150-152), Anulează/Mută cu aceeași gardă (primire.ts:345-346, 359-360), publicatorul fără suprapunere în proces (deci `deblocheaza` nu prinde o publicare în curs), `Idempotency-Key` = id-ul postării, calendarul cu Intl și ziua luată de pe loc (calendar.ts:75), story doar FB/IG cu respingere când contul n-are niciuna, releul TLX care nu atinge grupurile de stații și lasă restul actualizărilor neschimbate, comenzile sociale fără coliziune cu comenzile existente (`/lega_dt`, `/lega_reclamatii`, camioane trec prin `next()`).

| id | severitate | greutate | fișier:linie | scenariu | corecție propusă pentru plan |
|---|---|---|---|---|---|
| BL-1 | high | −2.0 | comun.ts:97-99 (`publicareReala()` citit la ora publicării); calendar.ts:60-79 + migr. 544 `ore DEFAULT '{12:30,19:30}'`, `decalaj_min` ≤ 100 | **Ordinea pașilor 6 → 8 e greșită și proba de noapte nu se poate face cum e scrisă.** Pasul 6 pune cheile (`UPLOAD_POST_API_KEY`, `TELEGRAM_API_ID/HASH`) înainte de pasul 8, care cere întâi proba «fără chei». Ion urmează numerotarea → clipul de test din pasul 8 nu mai e probă, pleacă public pe cont. În plus, rezerva MTProto spune «prima publicare reală noaptea (după 22:00)», dar calendarul dă cel mai târziu 19:30 + 100 min = 21:10; o publicare pusă după 22:00 pleacă abia mâine la 12:30+decalaj, adică exact la vârful traficului operatorilor — contrar rezervei. | Rescrie pașii: 6a Railway doar `TLX_BOT_TOKEN`, `SOCIAL_RELAY_KEY` + Render; 7 set-webhook; 8a proba fără chei (cu «▶ Acum», ca să nu aștepți 12:30); 8b SQL de golire a cozii (vezi BL-2); 8c abia apoi `UPLOAD_POST_API_KEY` + `TELEGRAM_API_*`; 8d prima publicare reală pe un singur topic cu butonul «▶ Acum» (primire.ts:355) după 22:00, cu logurile botului urmărite 30 min. |
| BL-2 | high | −2.0 | publicare.ts:77-83 (proba decisă la publicare, nu la primire); primire.ts:81 (confirmarea spune «🧪 În probă»); primire.ts:282-283 (max 1/zi împinge clipurile în zilele următoare) | **Clipurile puse în coadă în probă pleacă public după ce apar cheile.** Ion/adminul trimite 3 clipuri de test în topic; cu `max_pe_zi=1` primul ia mâine 12:30, celelalte poimâine și răspoimâine, toate `planificat`. Se pun cheile → publicatorul le ia pe rând și le publică real pe TikTok/FB/IG, deși confirmarea lor spunea «în probă». Nimeni nu le mai anulează, pentru că mesajul le-a etichetat drept test. | În plan, pas obligatoriu înainte de chei: `select count(*) from social_posts where stare='planificat'` și `update … set stare='anulat' where stare='planificat'` prin `db-migrate.sh translux --exec` (sau Anulează din butoane), cu numărul scris în raport. Alternativ (cod): coloana `mod` fixată la primire (`proba`/`real`) și publicatorul trece în `proba` orice rând primit în probă. |
| BL-3 | medium | −1.5 | index.ts:129 (`bot.start` = polling, actualizări procesate una câte una); social/index.ts:23-27 (`await trateazaMesajSocial`); primire.ts:286-290 (miniatura 15 s + AI `TEXTE_TIMEOUT_MS=30_000`, `maxRetries: 1`, texte.ts:10, :99) | Un clip în topicul Translux ține middleware-ul botului până la ~75 s (miniatură + AI cu o reîncercare). Bloggerul trimite 4 clipuri odată → botul Translux nu răspunde nimănui câteva minute: operatorii, `/bilete`, butoanele de sub bilete (callback-urile mai vechi de ~15 s dau «query is too old»). Releul TLX nu are problema (răspunde 200 și lucrează după). | Plan: primirea clipului în botul Translux se face ca în releu — middleware-ul confirmă (`true`) și lansează `primesteClip` fără `await` (coada `peRand` păstrează ordinea); de adăugat la «Verificare»: un clip trimis + un `/start` în privat imediat după, răspunsul în < 3 s. |
| BL-4 | medium | −1.0 | publicare.ts:102-106 (a 3-a eroare trecătoare → `esuat`), :132-136 (`negasit` > 2 h, `in_lucru` > 6 h → `esuat`); primire.ts:276-281 (`esuat` permite repostarea, rândul vechi se șterge); uploadPost.ts:61 (cheia = id-ul postării noi) | `publica()` cade pe `AbortSignal.timeout(20 min)` după ce Upload-Post a primit deja fișierul de 800 MB (sau `seteazaSigur` nu scrie «trimis»), de 3 ori → `esuat` + «❌ Clipul nu s-a publicat», deși clipul e live. Sau statusul rămâne `in_lucru` > 6 h și apoi se termină. Adminul repostează clipul → rând nou, id nou, `Idempotency-Key` nou → **a doua publicare pe același cont**; rândul vechi (cu `upload_request_id`) e șters, deci urma se pierde. | Plan: (1) eșecul de după ce cererea a plecat (sau cu `upload_request_id`) se scrie distinct (`eroare` cu prefix «posibil publicat») și mesajul spune «verificați contul înainte de repostare»; (2) repostarea nu șterge rândul `esuat` care are `upload_request_id`, ci refuză până la confirmarea adminului; (3) `verificaTrimise` continuă să verifice rândurile `esuat` din ultimele 24 h și le ridică la `publicat` dacă Upload-Post spune `completed`. |
| BL-5 | medium | −1.0 | social.test.ts:8-151 (19 teste: calendar, câmpuri Upload-Post, texte, primire) | Mașina de stări (`trecerePublicare`, `deblocheaza`, reîncercarea +15 min, `incercari` ≥ 3, `verificaTrimise`, proba vs real, cursa Anulează ↔ luare) nu are niciun test, deși planul își sprijină rezervele «Dublă publicare» și «repornirea nu pierde nimic» exact pe ea. | La «Verificare»: teste cu Supabase falsificat în memorie pentru: luare dublă (2 treceri) → o singură publicare; eroare trecătoare ×3 → `esuat`; `se_publica` vechi de 46 min → `planificat`; Anulează după luare → «Prea târziu»; proba → `proba` fără apel la Upload-Post. |
| BL-6 | low | −0.5 | publicare.ts:107-110 (reîncercarea întoarce în `planificat` cu butoanele încă active și ora veche în mesaj); primire.ts:344-347 | După o eroare trecătoare care s-a produs DUPĂ ce Upload-Post a primit clipul (timeout de răspuns), rândul e iar `planificat`; adminul apasă «Anulează» → `anulat`, dar clipul e deja la Upload-Post și se publică; în topic scrie «Anulat. Clipul nu se publică». Mesajul de confirmare arată și ora veche, nu cea +15 min. | Plan: la reîncercare se editează mesajul de confirmare (ora nouă + «reîncercare n/3») și, dacă eroarea a venit după trimiterea fișierului, butonul Anulează dispare. |

Note fără deducere: lipsa aprobării înainte de publicare și un singur ADMIN în `users` pentru ambele grupuri sunt decizii ale lui Ion. `BLOCAT_DUPA_MS = 45 min` < 30 min descărcare + 20 min trimitere nu strică nimic într-un singur proces (publicatorul nu se suprapune), dar ar conta la două replici Railway — de păstrat o singură replică. `rateLimitMiddleware` (30/min) stă înaintea motorului: un blogger care trimite > 30 de mesaje pe minut primește «Prea multe mesaje» în topic și clipul se pierde fără rând — rar, de știut.

Scor: 2.0 · Blocante (critical/high): 2

## Review: senior-backend-engineer

**SBE-1 · high · −2.0 · defect de logică**
`apps/bot/src/social/descarcare.ts:75-77`, `apps/bot/src/social/publicare.ts:90`; dovada în GramJS: `node_modules/telegram/client/downloads.js:297` (`await writer.write(chunk)` — `fs.WriteStream.write` întoarce boolean, nu promisiune, deci nu se așteaptă nimic), `:311` (întoarce calea), `:314`/`:253` (`writer.close()` fără await).
Scenariu: `downloadMedia` se întoarce cât ultimele bucăți (512 KB fiecare la fișierele mari) încă stau în coada WriteStream-ului. `stat(cale)` vede o mărime mai mică, iar verificarea prinde doar `size === 0`. `openAsBlob` reține mărimea și data modificării de la creare; după ce fișierul mai crește, citirea Blob-ului în `fetch` aruncă (documentația Node: „any modifications will cause reading the Blob data to fail”). Urmarea e una din două: eroare „trecătoare”, apoi 3 reîncercări cu aceeași cursă și `esuat`, sau un MP4 trunchiat trimis la Upload-Post (atomul `moov` stă des la final, deci clip stricat). Cât de des se întâmplă depinde de cât de repede scrie discul Railway. Același loc (`:297`) nu are nici backpressure: dacă discul e mai lent decât rețeaua, clipul se adună în RAM.
Corecție în plan: (1) `outputFile` = un scriitor propriu `{ write: (b) => fh.write(b), close }` peste `fs/promises` FileHandle (GramJS îl folosește așa cum e dat, `downloads.js:247-248`; `await writer.write` capătă sens și apare backpressure). Fișierul se închide abia după ce `downloadMedia` s-a terminat, și închiderea se așteaptă. (2) După descărcare, `stat.size === Number(doc.size)`, altfel eroare. (3) Un test cu un scriitor fals lent.

**SBE-2 · high · −2.0 · presupunere neverificată despre un sistem extern care poartă sursa de date**
`apps/bot/src/social/descarcare.ts:63` (`c.start({ botAuthToken })`) → `node_modules/telegram/client/auth.js:45-46,57` (`start` cheamă explicit `updates.GetState`, adică abonarea sesiunii la actualizări); `node_modules/telegram/client/TelegramClient.js:1090-1104` (bucla de actualizări pornește la fiecare `connect`); `apps/bot/src/index.ts:129` (botul Translux pe long polling).
Scenariu: dacă Telegram dă actualizările unui bot sesiunii MTProto deschise (sau le împarte între sesiuni), mesajele operatorilor, biletele și butoanele care sosesc în cele până la 30 de minute de descărcare nu mai ajung la `getUpdates` și se pierd definitiv. Rezerva din plan („logurile botului urmărite”) **nu poate prinde pierderea**: o actualizare care n-a ajuns nu lasă nicio linie în log. Asta face din proba de noapte pe prod un test fără observabil.
Corecție în plan: (1) În „Verificat pe viu”, înainte de deploy, o probă pe un bot de unică folosință de la BotFather. grammY face polling și numără `update_id`; în același timp rulează exact `descarcaClip` pe un clip de ~300 MB, iar în timpul sesiunii se trimit N mesaje numerotate. Criteriul: toate N ajung, fără goluri în `update_id`. Aceeași probă acoperă calea de timeout (`destroy` în mijlocul descărcării), cu atenție la `unhandledRejection` (procesul botului n-are `process.on('unhandledRejection')`, iar Node 22 cade la una scăpată). (2) În cod, să nu se mai folosească `start()`: `connect()` + `auth.ImportBotAuthorization` direct, iar `channels.GetMessages` împachetat în `Api.InvokeWithoutUpdates` (există în GramJS 2.26.22, verificat prin import; cererile de fișiere sunt implicit fără actualizări, după schema TL). (3) Rezerva rămâne botul separat doar pentru descărcare, numai că se ia pe baza probei, nu a logurilor.

**SBE-3 · medium · −1.5 · sarcină fără estimare (timpi și viteze)**
`apps/bot/src/social/uploadPost.ts:59-64`, `descarcare.ts:18`, `publicare.ts:15`.
Mai multe valori neverificate. Viteza de descărcare din Telegram (un singur flux secvențial `iterDownload`, adesea dintr-un DC străin): 30 de minute pentru 800 MB cer ≥ 0,45 MB/s. Viteza de trimitere Railway → Upload-Post: 20 de minute cer ≥ 0,67 MB/s. Apoi, în fetch-ul din Node 22 (undici încorporat), `headersTimeout` implicit e 300 s după ce corpul s-a trimis. Dacă Upload-Post validează sau copiază 800 MB înainte să răspundă, cade cu `UND_ERR_HEADERS_TIMEOUT` sub `AbortSignal` și se reîncarcă tot fișierul (idempotența oprește dublura, dar se pierd încă 15 minute plus o încercare).
Corecție: în probă se măsoară MB/s la descărcare și la trimitere și timpul de la sfârșitul corpului până la antetele răspunsului. Limitele (`DESCARCARE_MAX_MS`, timeout-ul de upload, `BLOCAT_DUPA_MS ≥` suma lor plus o marjă) se scriu în funcție de mărime și de faptul măsurat. Dacă timpul până la antete depășește 300 s, fetch-ul primește un `undici.Agent` cu `headersTimeout` explicit.

**SBE-4 · medium · −1.0 · gol de acoperire (blocarea botului Translux)**
`apps/bot/src/social/index.ts:20-28`, `primire.ts:273-300`, `texte.ts:10,99`, `apps/bot/src/index.ts:129`.
`bot.start()` din grammY procesează actualizările secvențial, iar handlerul așteaptă tot `primesteClip`: miniatura (până la 15 s), textul AI (30 s × `maxRetries: 1`) și scrierile în bază. Un clip poate opri toate celelalte actualizări ale botului Translux (operatori, bilete, butoane) până la ~75 s, iar `answerCallbackQuery` de la alte butoane expiră.
Corecție: handlerul răspunde imediat și pune lucrul în coada `peRand` fără await (erorile sunt prinse și anunțate în topic), sau planul spune explicit că întârzierea e acceptată.

**SBE-5 · medium · −1.0 · gol de acoperire (releul pierde în tăcere)**
TLX `bot-server/src/server.ts:235-246` și `:359-363`; Translux `apps/bot/src/social/index.ts:62-63`.
Scenariu: botul Translux se redeployează sau repornește (deploy-bot, rollover-ul cu 409), iar un blogger TLX trimite chiar atunci un clip sau apasă Anulează. Releul primește conexiune refuzată sau 5xx: TLX deja a dat 200 lui Telegram, iar eroarea ajunge doar în `console.error`. La Translux, 200 pleacă înainte de procesare, deci o repornire în timpul procesării pierde și ea actualizarea. Bloggerul nu primește nimic, iar o anulare cerută de admin nu se aplică și clipul pleacă.
Corecție: în TLX, o reîncercare după ~5 s, iar dacă și aceea cade, un răspuns în topic de la `@tlxmd_bot` («motorul clipurilor e indisponibil, retrimiteți peste un minut»). Pentru butonul `soc:`, `answerCallbackQuery` cu același text.

**SBE-6 · medium · −1.0 · gol de acoperire (teste)**
`apps/bot/src/social/social.test.ts:1-151`: cele 19 teste acoperă doar funcțiile pure (calendar, `campuriPublicare`, `interpreteazaStarea`, texte, comenzi). Mașina de stări nu are niciun test: `publicaUna` (eroare definitivă vs trecătoare, `incercari ≥ 3`, `ClipSchimbat`, eșecul `seteazaSigur` după un upload reușit), `verificaTrimise` (`negasit` < 2 h, `in_lucru` > 6 h, publicat parțial), `deblocheaza`, preluarea atomică, releul (`cheieCorecta`, 401/413/400) și `esteUpdateSocial` din TLX. Motivul: `db()`, `apiBot()`, `fetch` și `process.env` sunt dependențe ascunse la nivel de modul (`publicare.ts:2-6`, `:91`).
Corecție: dependențele (repo `social_posts`, client Upload-Post, descărcător, API) intră ca parametri în `trecerePublicare` / `publicaUna`, iar testele pe tranziții se scriu cu fake-uri, plus teste pentru releu și pentru `esteUpdateSocial`.

**SBE-7 · low · −0.5 · descriere incompletă (dependența)**
`package-lock.json:10086`: `telegram@2.26.22` e marcat **deprecated / archived** („Development continues in teleproto”). Planul dă versiunea, dar nu spune asta. O schimbare de layer sau de DC la Telegram nu mai primește remediere. Corecție: în plan, versiunea fixată exact (fără `^`), riscul notat și `teleproto` ca drum de rezervă. Dockerfile-ul (`node:22-slim`, `npm ci`) e compatibil: dependențele sunt JS pur, iar `bufferutil` / `utf-8-validate` sunt opționale cu prebuild. Importurile ESM cu nume din pachetul CJS merg pe Node 22.23 (verificat prin import: `TelegramClient`, `Api`, `helpers`, `StringSession`, `Api.InvokeWithoutUpdates`).

**SBE-8 · low · −0.5 · descriere incompletă (disc)**
`descarcare.ts:46,74`: limita de disc efemer și de RAM a containerului Railway nu apare în „Verificat pe viu”. După un crash în timpul descărcării, `/tmp/social/<id>.mp4` rămâne acolo până la înlocuirea containerului dacă postarea ajunge `esuat` (la reîncercare se suprascrie). Corecție: la pornirea publicatorului se golește `/tmp/social`, iar limitele Railway trec în tabel.

Note fără deducere: `Idempotency-Key` = id-ul postării e corect și la repostarea după `esuat` (rând nou, uuid nou: `primire.ts:281`). Fetch cu `FormData` + `openAsBlob` trimite în flux, fără să încarce fișierul în memorie. Scurgerea senderelor din alt DC la `destroy()` (`telegramBaseClient.js:160`, `Object.values` pe un `Map`) se rezolvă singură prin temporizatorul de 30 s (`:296-305`).

Scor: 0.5 · Blocante (critical/high): 2

## Triaj revizori Claude - runda 1

| id | severitate | esență | decizie | motiv / unde |
|---|---|---|---|---|
| SEC-1 | critical | antet non-ASCII → `timingSafeEqual` aruncă → procesul cade | acceptat | `social/index.ts` `cheieCorecta` pe octeți + tot releul sub try; test «non-ASCII nu aruncă» |
| SEC-2 | medium | la publicare se verifică doar mărimea | acceptat | `descarcare.ts` `motivSchimbat`: autor, editare, mărime obligatorie; primire refuză clipul fără `file_size`; test |
| SEC-3 | medium | oprirea topicului / scoaterea bloggerului nu oprește coada | acceptat (Codex nu e de acord cu premisa; costul e mic, siguranța mai mare) | `publicare.ts` `motivOprire` la luare → `anulat`; test |
| SEC-4 | medium | rezerva publică nota; textul AI nefiltrat | acceptat | `texte.ts` rezerva = nume + hashtag-uri; `textCurat` respinge link străin / @cont / telefon; forward → fără notă; teste |
| SEC-5 | low | comanda poate muta topicul la alt bot | acceptat | `primire.ts` refuz când `topic.bot !== bot` |
| SEC-6 | low | erori brute în topic | acceptat | mesaje generice în topic, detaliul în log / la ADMIN |
| SEC-7 | low | secretul TLX comparat cu `!==`; releu din orice supergrup | acceptat parțial | `timingSafeEqual` pe octeți — acceptat. `SOCIAL_RELAY_CHAT_ID` — respins: releul trimite doar clipuri, comenzile sociale și butoanele `soc:` (TLX `esteUpdateSocial`), niciodată din grupuri de stații; motorul ignoră chaturile nelegate (`primire.ts` `topicDupaLoc` → false), iar un id fix ar cere ca id-ul grupului să fie știut înainte de prima `/lega_social` |
| BL-1 | high | pașii 6/8 inversați; ora de noapte imposibilă în calendar | acceptat | Pași reordonați (7–12); prima publicare reală cu «▶ Acum» după 22:00 |
| BL-2 | high | clipurile din probă pleacă public după chei | acceptat | migr. 545 `in_proba` fixat la primire; publicatorul nu publică niciodată un rând de probă; test |
| BL-3 | medium | un clip blochează botul ~75 s (polling secvențial) | acceptat | `primire.ts` clipul se lucrează în fundal (`void primesteClip`) |
| BL-4 | medium | eșec incert → repostare cu cheie nouă → dublură | acceptat | repostarea REFOLOSEȘTE rândul (același id = aceeași cheie); mesaj «posibil plecat» + alertă ADMIN |
| BL-5 | medium | mașina de stări netestată | acceptat | `publicare.test.ts`, 10 teste |
| BL-6 | low | după reîncercare butoanele mint | acceptat | butoanele dispar când fișierul pleacă spre Upload-Post; reîncercarea anunță «anularea nu mai e sigură» |
| SBE-1 | high | GramJS nu așteaptă scrierea fișierului | acceptat | `descarcare.ts` `iterDownload` + `FileHandle.write` așteptat + mărimea exactă la final |
| SBE-2 | high | MTProto poate lua actualizări; logurile n-o pot dovedi | acceptat | fără `start()` (fără GetState): `connect` + `ImportBotAuthorization` și `GetMessages` în `InvokeWithoutUpdates`; pasul 10 = proba numerotată pe bot de unică folosință înaintea cheilor |
| SBE-3 | medium | timpi nemăsurați | acceptat | proba măsoară MB/s; `BLOCAT_DUPA_MS` 45 → 60 min (> 30 + 20) |
| SBE-4 | medium | = BL-3 | acceptat | idem BL-3 |
| SBE-5 | medium | releul pierde actualizări în tăcere | acceptat | TLX: încă o încercare peste 5 s, apoi mesaj în topic / pe buton «motorul e indisponibil» |
| SBE-6 | medium | = BL-5 | acceptat | idem BL-5 |
| SBE-7 | low | `telegram` 2.26.22 abandonat | acceptat | versiune fixată exact (fără `^`); rezervă `teleproto` notată |
| SBE-8 | low | `/tmp/social` după cădere | acceptat | golit la pornirea publicatorului |

## Critic extern - runda 1

Codex: 0.0 · fail · 4 high (C1, C2, C4, C5).

| id | severitate | esență | decizie | motiv / unde |
|---|---|---|---|---|
| C1 | high | clipul mutat cât publicatorul lucra la altul pleacă azi | acceptat | luarea atomică cere și `planificat_la <= acum`; test «C1» |
| C2 | high | relegarea topicului mută clipurile confirmate | acceptat | migr. 545: profil, platforme, pagina FB pe postare; publicatorul le ia de acolo; test |
| C3 | low | pagina Facebook nu se poate configura | acceptat | comanda `/social_pagina <id>`; pasul 9 |
| C4 | high | citirea căzută a topicului = «topic șters» → eșuat | acceptat | `topicDupaId`/`esteAdmin`/`esteBlogger` aruncă la eroare; publicatorul pune postarea înapoi în calendar |
| C5 | high | confirmarea nu ajunge → clip fără butoane de anulare | acceptat | fără mesajul de confirmare postarea devine `anulat` |
| C6 | medium | platformele sărite nu se raportează | acceptat | `textRezultat` le arată, `complet()` → alertă «publicat incomplet»; test |
| (dezacord) | — | SBE: UUID nou păstrează idempotența | acceptat punctul lui Codex | repostarea refolosește rândul (BL-4) |

## Review: security-auditor - runda 2

Verificat pe codul necomis din worktree (`git diff`), pe migr. 545 și pe diff-ul TLX `bot-server/src/server.ts`. `npx vitest run src/social` dă 32/32.

**Constatările din runda 1**
- **SEC-1 · închis.** `social/index.ts:43-48`: `cheieCorecta` compară lungimile pe Buffer UTF-8, deci `timingSafeEqual` nu mai poate arunca. `handleSocialRelay` (`:55-65`) pune tot releul sub try/catch, iar citirea și parsarea corpului au propriul try (`:73-84`). Testul `social.test.ts:159-166` acoperă antetul `'é'+31×'a'`: nu aruncă și întoarce false. O cheie configurată sub 16 octeți respinge tot.
- **SEC-2 · închis.** `descarcare.ts:43-50`, `:94-99`: `motivSchimbat` refuză când lipsește mărimea de la primire, lipsește documentul, mesajul e editat (`editDate`), autorul MTProto ≠ `autor_telegram_id` sau mărimea diferă. Toate dau `ClipSchimbat`, care e definitiv (`publicare.ts:151`). La primire, un clip fără `file_size` nu intră (`primire.ts:283`). Scenariul B din runda 1 (releu falsificat cu `message_id` străin) se oprește acum la autorul real al mesajului.
- **SEC-3 · închis.** `publicare.ts:93-98`, `:126-132`: la luare se verifică `topic.activ` și `esteBlogger || esteAdmin`. Dacă verificarea pică, postarea devine `anulat` cu motivul scris și butoanele se scot. O citire căzută aruncă (`comun.ts` diff); excepția o prinde `rulareFaraSuprapunere` (`scheduler.ts:365`), iar `deblocheaza` readuce rândul după 60 min. Nu se publică pe o citire eșuată. Testul e `publicare.test.ts:153`.
- **SEC-4 · închis.** `texte.ts:103-106`: rezerva conține doar numele contului și hashtag-urile. `texte.ts:64-72` + `:84`: `textCurat` respinge link-urile străine (am verificat și `translux.md.evil.com`, `https://translux.md@evil.com`, `t.me/...`, toate respinse), @mențiunile și numerele cu 9+ cifre. Un forward intră fără notă (`primire.ts:279`). Testele sunt la `social.test.ts:121-134`. Ce rămâne e N1.
- **SEC-5 · închis.** `primire.ts:135-139`: comanda se refuză când `topic.bot !== bot`, înainte de upsert-ul din `lega_social`.
- **SEC-6 · închis.** `primire.ts:160`, `:180`, `:235`, `:328` și `publicare.ts:156-161`: în topic ajung doar mesaje generice. Detaliul merge în log și la `sendAdminAlert`. Textul lui `ClipSchimbat` e scris de noi și trece prin escapeHtml. `textRezultat` nu include `message` de la Upload-Post.
- **SEC-7 · închis (partea acceptată).** TLX `server.ts:388-391`: comparare pe octeți, cu `a.length !== b.length || !crypto.timingSafeEqual(a, b)`, deci fără excepție. Releul rămâne oprit fără `TELEGRAM_WEBHOOK_SECRET` (`:402`). Partea respinsă (`SOCIAL_RELAY_CHAT_ID`) nu o redeschid, pentru că n-am dovadă nouă. Pasul 7 cere `openssl rand -hex 32`.

**Constatări noi**

**N1 · low · −0.3 · `texte.ts:65`**
Lista de TLD-uri din `textCurat` e închisă: `com|net|org|ru|md|ro|io|me|ly|link|xyz|top|info|site|online|shop|app`. Domeniile pe `.co`, `.ua`, `.cc`, `.to`, `.gg`, `.tk`, `.de`, `.eu` trec dacă sunt scrise fără `http(s)://`/`www.`. Scenariul: o instrucțiune ascunsă în miniatura unui clip forward îl face pe AI să scrie `promo-translux.co/bilet`. Facebook face linkul clicabil pe Reels. Impactul e mic, pentru că sursa (miniatura) e slabă, iar autorul e pe lista albă.
Corecția: respinge orice `[\w-]+\.[a-z]{2,24}\b` care nu e translux.md/tlx.md (există fals pozitiv, de exemplu „ș.a.”, dar atunci textul trece pe rezervă, ceea ce e acceptabil). Alternativ, adaugă TLD-urile de mai sus.

**N2 · low · −0.3 · TLX `bot-server/src/server.ts:215` (`SOCIAL_COMENZI`) față de TRANSLUX `primire.ts:40`**
Regex-ul TLX nu conține `social_pagina`, așa că `/social_pagina` scris în topicurile TLX nu se trimite prin releu. Pentru TLX, C3 nu funcționează, iar un profil TLX cu mai multe pagini FB rămâne fără pagină fixată. Ca securitate, efectul e că Upload-Post alege singur pagina: un clip TLX poate ieși pe altă pagină Facebook decât cea dorită. Pasul 9 n-ar descoperi asta, pentru că acolo comanda pur și simplu nu răspunde.
Corecția: se adaugă `social_pagina` în `SOCIAL_COMENZI` (TLX) și un test care compară cele două liste.

**N3 · low · −0.2 · `primire.ts:220`, `:238`**
După SEC-3, mesajele de confirmare spun ceva fals: „cele planificate rămân, se anulează din butoane” și „Clipurile lui deja planificate rămân”. De fapt, la ora lor postările se anulează singure. Ca securitate, efectul e invers: un admin care vrea doar o pauză și repornește topicul înainte de oră publică totuși clipurile. Cine nu repornește crede că trebuie să anuleze de mână. Nu e un defect de acces, dar textul induce în eroare exact controlul de oprire.
Corecția: textul devine „clipurile planificate nu pleacă cât topicul e oprit / cât autorul nu e pe listă”.

Fără alte defecte introduse. Pe scurt:
- Retry-ul releului TLX (`server.ts:245-265`) nu repetă la 401/400/413.
- `anuntaReleuCazut` folosește doar `BOT_TOKEN`-ul TLX și id-uri din actualizarea deja autentificată.
- Reutilizarea rândului (BL-4) rescrie autorul, `message_id` și mărimea, deci verificarea SEC-2 rămâne legată de clipul nou.
- Migr. 545 adaugă doar coloane: niciun drept nou, nicio funcție.

Scor: 9.2 · Blocante (critical/high): 0

## Review: business-logic-auditor - runda 2

Am citit în arborele `bot-video-social` (diff necomis): `publicare.ts` (tot), `primire.ts` (tot), `comun.ts`, `uploadPost.ts:20-71`, `index.ts:20-99`, migr. 544 (UNIQUE `topic_id,file_unique_id,tip`, CHECK pe `stare`) și 545; am rulat `npx vitest run src/social` → 32/32 (10 în `publicare.test.ts`, 22 în `social.test.ts`).

**Observațiile mele din runda 1**

| id | stare | dovadă |
|---|---|---|
| BL-1 | închis | Pași 7–12: cheile publicării (pasul 11) vin după proba fără chei (9) și proba MTProto (10); prima publicare reală cu «▶ Acum» după 22:00 (12), deci nu mai depinde de orele calendarului. |
| BL-2 | închis | migr. 545:12 `in_proba NOT NULL`; fixat la primire `primire.ts:317`; publicatorul îl verifică primul, înaintea cheilor `publicare.ts:113-119`; test `publicare.test.ts:144`. Clipul de probă postat din nou după chei refolosește rândul cu `in_proba` recalculat (`primire.ts:297`, `:317`, `:323-324`). |
| BL-3 | închis | `primire.ts:356-359` `void primesteClip(...)`, cu ordinea păstrată de `peRand` (`:294`). Releul TLX nu e afectat. |
| BL-4 | închis, cu un efect nou (BL2-1) | Repostarea refolosește rândul (`primire.ts:321-325`), deci id-ul e același, iar `Idempotency-Key` și `request_id` = id-ul postării (`uploadPost.ts:32`, `:61`). Un clip «posibil plecat» postat din nou primește jobul existent de la Upload-Post și nu se publică a doua oară. Mesajul spune «posibil să fi plecat», cu alertă (`publicare.ts:157-161`). |
| BL-5 | închis | `publicare.test.ts` are 10 teste pentru mașina de stări: o singură publicare, 3 erori trecătoare, eroare definitivă, ClipSchimbat, proba, SEC-3, deblocarea, C1, C6. Lipsesc trei căi noi (BL2-5). |
| BL-6 | închis | Butoanele se scot înainte de trimiterea fișierului (`publicare.ts:142-143`). La reîncercarea de după trimitere vine mesajul «Anularea nu mai e sigură» (`:166-169`). Pentru eșecul de la descărcare butoanele rămân, și e corect, pentru că atunci nimic n-a plecat. |

**Corecturile pentru Codex**

| id | stare | dovadă |
|---|---|---|
| C1 | închis | luarea are `.eq('stare','planificat').lte('planificat_la', acum)` (`publicare.ts:216`); test `:174`. |
| C2 | închis | migr. 545:8-11; scris la primire `primire.ts:316`; folosit la publicare `publicare.ts:144-146`, `:190`, `:198`. (`primul_comentariu` se ia încă de pe topic, dar nu ține de destinație, așa că e acceptabil.) |
| C4 | **parțial** | `topicDupaId` aruncă, iar publicatorul pune postarea înapoi în calendar (`publicare.ts:102-109`). `esteBlogger`/`esteAdmin` aruncă și ele (`comun.ts:95`, `:101`), dar `motivOprire` e chemat în afara `try` (`publicare.ts:126`) → BL2-2. |
| C5 | închis | `primire.ts:331-336`: fără confirmare postarea devine `anulat`. Nu există test (BL2-5). |
| C6 | închis | `textRezultat(rez, cerute)` și `complet()` (`publicare.ts:61-79`); alerta «publicat incomplet» (`:192-194`); teste `:188`, `:207`. |

**Mașina de stări după corecturi:** proba e corectă. Refolosirea rândului nu poate lovi UNIQUE, pentru că se face `update` pe id și doar din `esuat/anulat/proba`, care sunt stări finale pe care publicatorul nu le mai atinge. Luarea cu `planificat_la<=acum` e corectă. Confirmarea căzută duce la `anulat`; `urmatorulLoc` lasă un avans de minimum 15 min, deci publicatorul n-are cum să ia rândul înainte. `seteazaSigur` care aruncă după `publica()` reușit trimite postarea la reîncercare cu aceeași cheie, iar Upload-Post întoarce jobul existent. Problemele de mai jos sunt cele noi.

| id | severitate | greutate | fișier:linie | scenariu | corecție |
|---|---|---|---|---|---|
| BL2-1 | medium | −1.0 | `uploadPost.ts:32`, `:61` (cheia = `p.id`); `primire.ts:297`, `:321-325` (repostarea refolosește id-ul); `publicare.ts:195-199` | Corectura BL-4 închide și drumul invers. Exemplu: tokenul TikTok expiră, Upload-Post raportează `failed`, iar `verificaTrimise` pune `esuat`. Adminul reconectează contul și bloggerul postează din nou același fișier (forward sau același `file_unique_id`). Rândul se refolosește cu aceeași `Idempotency-Key` și același `request_id`. Upload-Post întoarce jobul vechi, eșuat («se întoarce jobul existent», Verificat pe viu, rândul 2), și clipul ajunge iar în `esuat`. Așa rămâne mereu, cu altă alertă la fiecare repostare. Iese numai cu un fișier încărcat din nou (alt `file_unique_id`). Nu e dublură și nu e risc public, deci nu blochează. | Cheia se schimbă doar când rezultatul anterior e sigur nelivrat: coloană `cheie_upload` (sau `generatie`). Repostarea o păstrează dacă rândul are `upload_request_id` și eșecul e incert (`posibil plecat`, `negasit`, `in_lucru` > 6 h). O schimbă (`${id}:${n+1}`) dacă Upload-Post a raportat `failed`, dacă eșecul a venit înainte de trimitere sau dacă rândul e `anulat`/`proba` fără `upload_request_id`. Mesajul din topic spune care din cele două cazuri e. Test pentru ambele ramuri. |
| BL2-2 | medium | −1.0 | `publicare.ts:126` (`motivOprire` în afara `try`) → `comun.ts:95`, `:101` (aruncă); `publicare.ts:210-218` | O citire căzută din `social_bloggers` sau din `users` la ora publicării aruncă din `publicaUna`, apoi din `trecerePublicare`. Rândul rămâne `se_publica` 60 min, până la `deblocheaza`. Între timp butoanele răspund «Prea târziu: clipul e în publicare», deși nu pleacă nimic. Al doilea clip din treapta de 2 nu mai e luat în această trecere. E exact cazul C4, pe care triajul îl dă drept rezolvat. | `motivOprire` intră sub același `try/catch` ca `topicDupaId` (`publicare.ts:102-109`): `planificat` + 15 min, fără mesaj. Test: `esteBlogger` aruncă → `planificat`, nu `se_publica`. |
| BL2-3 | low | −0.5 | `publicare.ts:215` (`incercari+1` la fiecare luare), `:107` (C4), `:122` (cheile scoase), `:152`, `:86` | Luările întoarse fără nicio încercare tot cresc `incercari`. Cu cheile scoase 3 ore (oprirea de urgență), postarea ajunge la `incercari`=4. După ce cheile se pun la loc, prima eroare trecătoare (rețea Telegram) o trece direct în `esuat`, fără cele două reîncercări promise. Același lucru pentru `deblocheaza` (`:86`). | Pe cele două căi de întoarcere se scrie `incercari: p.incercari - 1`, sau numărarea se mută în `publicaUna`, chiar înainte de `descarcaClip`. Test: cheile lipsesc două treceri, urmate de o eroare trecătoare → `planificat`, nu `esuat`. |
| BL2-4 | low | −0.5 | `primire.ts:220` («cele planificate rămân, se anulează din butoane»), `:238` (la fel la `/blogger_scoate`) față de `publicare.ts:93-97`, `:126-131` | După SEC-3 textele mint: oprirea topicului sau scoaterea bloggerului anulează singură, la oră, toate clipurile planificate. Adminul care oprește topicul pentru o săptămână, crezând că coada îl așteaptă, o găsește `anulat`, iar fiecare clip trebuie postat din nou. | Textele de la `:220` și `:238` spun ce se întâmplă de fapt: «clipurile planificate se anulează la ora lor dacă topicul e încă oprit / autorul nu mai e pe listă». Alternativ, Ion alege ca la oprire clipurile să fie amânate (`planificat` + 1 zi) în loc de `anulat`. |
| BL2-5 | medium | −1.0 | `publicare.test.ts:100-207` (testele existente); căile noi `primire.ts:321-325`, `:331-336`, `publicare.ts:102-109` | Trei corecturi din runda 1 n-au niciun test: refolosirea rândului la repostare (același id, `incercari`/`upload_request_id`/`rezultate` resetate, `in_proba` recalculat), confirmarea căzută → `anulat` (C5) și citirea căzută a topicului → `planificat` (C4). BL-4 și C5 sunt chiar apărarea împotriva dublurii și a clipului fără butoane. | La «Verificare»: teste pe baza falsă pentru cele trei căi, plus testul de la BL2-2. |
| BL2-6 | low | −0.5 | Pașii 11–12 (doar textul planului) | După pasul 11 toate topicurile legate la pasul 9 sunt reale, nu doar «un singur topic». Dacă pasul 12 pică sau se amână, clipurile postate între timp în alte topicuri se publică la 12:30 a doua zi, cu prima descărcare MTProto în plin trafic al operatorilor. | Pasul 11 primește un sub-pas: `/social_oprit` în celelalte topicuri până trece pasul 12, apoi repornirea lor. Sau pasul 11 se face în aceeași seară, imediat înaintea pasului 12, iar dacă 12 pică, cheile se scot. |

Notă fără deducere: textul «Reîncercare ${p.incercari}/3» (`publicare.ts:167`) arată «1/3» după prima încercare căzută, deși mai rămân două. Asta e cosmetică.

Scor: 5.5 · Blocante (critical/high): 0

## Review: senior-backend-engineer - runda 2

Am verificat pe sursa `node_modules/telegram` (2.26.22, rădăcina worktree-ului) și am rulat un script local pe `destroy()`. Răspunsurile la întrebările rundei:

- **`connect()` abonează conexiunea?** Trimite `InvokeWithLayer(InitConnection(help.GetConfig))` fără `InvokeWithoutUpdates` (`client/TelegramClient.js:1097-1102`). Pornește și `_updateLoop`, cu ping la 9 s și `updates.GetState` după 30 min fără cereri (`client/updates.js:18`, `:217-219`). În timpul descărcării `GetState` nu pleacă, pentru că fiecare bucată actualizează `_lastRequest` (`client/users.js:47`). Mai rămân însă alte cereri neîmpachetate, care nu sunt cereri de fișiere. Toate sunt la SBE2-1.
- **`iterDownload` cu `dcId` pe alt DC.** GramJS exportă singur autorizarea. `getSender(dcId)` trece ÎNTOTDEAUNA prin `_borrowExportedSender`, și pe același DC (`telegramBaseClient.js:328-332`, `downloads.js:84`). `_connectSender` cheamă `getDC` → `help.GetConfig`, pentru că `connect()` nu salvează `_config` (`TelegramClient.js:1175-1176`). Pe alt DC mai cheamă `auth.ExportAuthorization` pe conexiunea principală și `InitConnection(auth.ImportAuthorization)` pe cea nouă (`telegramBaseClient.js:229-241`). Merge și pentru boți, dar niciuna din aceste cereri nu trece prin `InvokeWithoutUpdates`.
- **`ImportBotAuthorization` cu `flags: 0`** e corect. În schemă `flags:int` e un întreg simplu, fără câmpuri condiționate (`tl/apiTl.js:1423`), iar `signInBot` din GramJS trimite aceeași cerere (`client/auth.js:353-357`). Rezultatul lui `InvokeWithoutUpdates {X}` se citește generic (`tl/api.js:429`), deci tipul răspunsului e corect.
- **`sesiune.save()` după import** e corect. `StringSession.save()` scrie DC-ul, adresa, portul și cheia (`sessions/StringSession.js:91-103`).
- **Sesiunea e pe alt DC.** La primul import, sesiunea goală pornește pe DC 4 (`telegramBaseClient.js:148-149`, `TelegramClient.js:1064`). Un bot de pe alt DC primește `USER_MIGRATE_X`. `invoke` cheamă `_switchDC` (cheie nouă pe DC-ul botului) și repetă aceeași cerere împachetată (`users.js:76-90`, `TelegramClient.js:1114-1127`). Abia după asta se face `save()`, deci sesiunea reținută e cea bună. Cu o sesiune refolosită, `FILE_MIGRATE` e tratat în iterator (`downloads.js:120-123`). `NETWORK_MIGRATE`/`PHONE_MIGRATE` pe o sesiune autorizată cheamă întâi `isUserAuthorized()` → `updates.GetState` neîmpachetat, apoi aruncă (`users.js:80-84`, `auth.js:55-57`). E rar și intră la SBE2-1. Cheia revocată (`AUTH_KEY_*`) șterge sesiunea (`descarcare.ts:77`): corect.

### Observațiile rundei 1

| id | stare | dovadă |
|---|---|---|
| SBE-1 | **închis** | `descarcare.ts:102-112`: `iterDownload` + `await f.write`, `close` așteptat, apoi `stat.size === doc.size`. Testul cu scriitor lent lipsește, dar verificarea mărimii prinde orice scriere scurtă. Nu deduc. |
| SBE-2 | **închis parțial** → SBE2-1 | `start()` a dispărut, iar `ImportBotAuthorization` și `GetMessages` trec prin `InvokeWithoutUpdates` (`:87`, `:90`). Proba numerotată există. Mai rămân însă cereri neîmpachetate făcute chiar de GramJS, iar proba nu le acoperă pe toate (SBE2-1, SBE2-3). |
| SBE-3 | **închis** | Upload-ul pleacă cu `async_upload=true` (`uploadPost.ts:31`): răspunsul vine după primirea corpului, deci `headersTimeout` de 300 s nu mai e o problemă. `BLOCAT_DUPA_MS` = 60 min > 30 + 20 (`publicare.ts:23`). Proba măsoară MB/s la descărcare. |
| SBE-4 | **închis** | `primire.ts:358` `void primesteClip(...).catch`, iar `peRand` ține ordinea pe topic. |
| SBE-5 | **închis parțial** → SBE2-4 | TLX: o reîncercare peste 5 s, apoi mesaj în topic sau pe buton (`bot-server/src/server.ts:244-288`). Translux: 200 pleacă tot înainte de procesare (`index.ts`, `res.end` înainte de `trateaza…`), iar acum procesarea clipului rulează în fundal până la ~75 s. |
| SBE-6 | **închis** | `publicare.test.ts` (fake-uri prin `vi.mock`), `cheieCorecta` + `motivSchimbat` în `social.test.ts:162-173`. DI explicit nu s-a făcut, dar testele acoperă tranzițiile. Nu deduc. |
| SBE-7 | **deschis (low)** | Versiunea e fixată exact (`apps/bot/package.json:21`). Faptul că pachetul e abandonat și rezerva `teleproto` apar doar în triaj, nu în «Riscuri». Pachetul se declară singur «gramJS version 2.26.21» în log (cosmetic). |
| SBE-8 | **închis** | `golesteTemporar()` la pornire (`index.ts:99`). Limitele de disc Railway trec la SBE2-2. |

### Observații noi

| id | severitate | greutate | fișier:linie | scenariu | corecție |
|---|---|---|---|---|---|
| SBE2-1 | high | −2.0 | `descarcare.ts:13-16` (comentariul) și rândul «Verificat pe viu» spun că logarea și cererile merg prin `InvokeWithoutUpdates`. Rămân neîmpachetate: `TelegramClient.js:1097-1102` (InitConnection/GetConfig la fiecare `connect`), `:1175-1176` + `telegramBaseClient.js:218` (GetConfig după autorizare, la FIECARE descărcare, pentru că `descarcare.ts:105` dă `dcId`), `telegramBaseClient.js:229-241` (Export/ImportAuthorization când clipul e pe alt DC), `TelegramClient.js:1043-1046` (`getMe` la orice reconectare automată, `MTProtoSender.js:835`), `users.js:80-84` (GetState la NETWORK_MIGRATE) | Proba se face pe un bot nou și cu un clip urcat de Ion. Dacă fișierul e pe același DC cu botul, ramura Export/ImportAuthorization nu rulează, iar o reconectare nu apare deloc într-o probă scurtă. Proba trece. În producție bloggerii urcă de pe alte DC-uri și rețeaua Railway se rupe din când în când. Exact cererile care nu s-au probat abonează sesiunea botului Translux. Dacă Telegram dă atunci actualizările acelei sesiuni, operatorii și biletele se pierd în tăcere, adică riscul pe care proba trebuia să-l închidă. | (1) Proba afișează `c.session.dcId` după import și `doc.dcId` și trece doar dacă a rulat ambele cazuri: același DC și alt DC. Cel mai simplu e un clip urcat de unul din bloggerii reali, deci cu aceeași distribuție de DC ca în producție. Proba mai include o reconectare forțată (rețeaua tăiată ~20 s în timpul descărcării). (2) Când `doc.dcId === c.session.dcId`, `dcId` nu se mai dă: `iterDownload` merge pe senderul principal, doar cu `upload.getFile`, fără GetConfig și fără sender nou (`telegramBaseClient.js:328-332`). (3) Comentariul și rândul din «Verificat pe viu» se corectează și listează exact cererile neîmpachetate care rămân. |
| SBE2-2 | high | −2.0 | `descarcare.ts:69-82` (`Promise.race` + `destroy`), `:75` (fișierul șters cât e încă deschis); `telegramBaseClient.js:56`, `:158-178` (`disconnect` face `Object.values` pe un **Map** → senderele exportate nu se închid, iar Map-ul se golește), `downloads.js:101` (fiecare bucată cere iar `getSender`), `telegramBaseClient.js:216-262` (`_connectSender`: `while(true)` cu 1 s pauză, fără verificarea lui `_destroyed`). Verificat local: `destroy()` → `exportedSenderDisconnectedByDestroy: false` | Clipul de 800 MB merge încet și cele 30 de minute expiră. `destroy()` nu oprește munca. **Același DC:** bucata următoare ridică un sender exportat nou și descărcarea merge în fundal până la capăt. Scrie în inode-ul deja șters, așa că discul se ocupă până la `close`. Peste 15 min reîncercarea pornește a doua descărcare în paralel cu cea orfană, deci și mai încet, și poate expira iar. Ajung până la 3 descărcări simultane și ~2,4 GB pe disc. **Alt DC:** `ExportAuthorization` pe senderul principal, deconectat, aruncă «Cannot send requests while disconnected» → `while(true)` reconectează și scrie `console.error` la fiecare secundă, **pentru totdeauna**, în procesul botului Translux. Limita de 30 min, adusă tocmai pentru rețeaua lentă, nu limitează nimic. | Descărcarea rulează într-un **proces copil** (`child_process.fork` al unui script `descarca-proces`, cu rezultatul prin IPC). La limită părintele îi dă `SIGKILL`: prizele, buclele GramJS și descriptorii mor odată cu el, iar MTProto nu mai împarte procesul cu operatorii. Proba (pasul 10) rulează exact procesul copil. Dacă nu se vrea proces copil: un flag `oprit` verificat în `for await`, `FileHandle` închis din afară la timeout, senderele din `_exportedSenderPromises` închise explicit înainte de `destroy` (API privat, cu comentariu) și un test cu un iterator fals care continuă după timeout (nicio scriere după respingere). În «Verificat pe viu»: limita de disc efemer a containerului Railway (SBE-8). |
| SBE2-3 | medium | −1.0 | `scripts/social-proba-mtproto.mts:43` (un singur apel), `:49-55` (verdict de mână, `exit(0)` mereu), `descarcare.ts:22` (limita e constantă) | Proba nu atinge: (a) al doilea clip din același proces, cu sesiunea refolosită (`descarcare.ts:86`, fără import), adică exact ce face producția de la al doilea clip; (b) calea de timeout (SBE2-2); (c) cazul cu alt DC (SBE2-1). Verdictul se citește de om, iar dacă `descarcaClip` aruncă, lista «primite» nici nu se mai afișează. Un rezultat parțial poate fi luat drept trecut. | Proba: două descărcări la rând (a doua pe sesiunea reținută), una cu limita injectată mică (`DESCARCARE_MAX_MS` ca parametru), apoi verificarea că după limită nu mai există trafic sau fișier. Afișează DC-urile. Numerele primite se parsează, golurile se afișează ca listă, iar `exit(1)` la goluri sau la eroare. Lista se afișează în `finally`. |
| SBE2-4 | low | −0.5 | `apps/bot/src/social/index.ts` (`res.end('{"ok":true}')` înainte de `trateazaMesajSocial`), `primire.ts:358` (fundal ~75 s) | Railway face redeploy sau rollover chiar cât un clip TLX sau Translux e în lucru în fundal: 200 a plecat deja (releu) sau offset-ul de polling a fost confirmat. Clipul nu intră în calendar și bloggerul nu primește nimic. Pierderea nu e publică și nu duce la dublură. | Plan: regula în instrucțiunile fixate în topic: «fără mesajul cu ora în 2 minute → retrimiteți clipul» (dublura e oprită de UNIQUE `topic_id, file_unique_id, tip`). Sau deploy-ul botului se face doar seara, cum e deja regula, iar riscul se trece în «Riscuri». |
| SBE-7 (rest) | low | −0.5 | `docs/plans/…-plan.md` «Riscuri» | — (descriere incompletă) | Un rând în «Riscuri»: `telegram` abandonat → rezerva `teleproto`. |

Note fără deducere. Execuția e secvențială: `trecerePublicare` așteaptă fiecare `publicaUna` (`publicare.ts:209-217`), deci în proces nu apar două descărcări simultane cu aceeași sesiune, în afara orfanelor de la SBE2-2. `FileHandle.write` poate scrie parțial în teorie, dar verificarea exactă a mărimii prinde asta.

Scor: 4.0 · Blocante (critical/high): 2

## Triaj revizori Claude - runda 2

Scoruri runda 2: security-auditor 9.2 (0 blocante) · business-logic-auditor 5.5 (0) · senior-backend-engineer 4.0 (2). Minimul Claude = 4.0.

| id | severitate | esență | decizie | motiv / unde |
|---|---|---|---|---|
| N1 | low | filtrul de link-uri cu listă fixă de terminații | acceptat | `texte.ts` orice domeniu `x.yy` în afară de translux.md/tlx.md; test `promo-translux.co` |
| N2 | low | TLX nu trimite `/social_pagina` | acceptat | TLX `SOCIAL_COMENZI` + `social_pagina` |
| N3 / BL2-4 | low | mesajele oprire / scoatere mint după SEC-3 | acceptat | `primire.ts` textele spun că planificatele nu mai pleacă |
| BL2-1 | medium | repostarea după eșec sigur întoarce jobul vechi | acceptat | `rezultate.incert` marcat la trimitere neconfirmată / negăsit / blocat 6 h; repostare: incert → același rând, altfel rând nou (cheie nouă); test |
| BL2-2 | medium | citirea căzută a listei ține rândul o oră | acceptat | `motivOprire` sub try → `planificat` peste 15 min; test |
| BL2-3 | low | contorul crește și la amânări | acceptat | încercarea se numără doar înaintea descărcării; test (`incercari: 0` după amânare) |
| BL2-5 | medium | lipsesc teste C4, C5, repostare | acceptat | `publicare.test.ts`: 6 teste noi (38 în total) |
| BL2-6 | low | după pasul 11 toate topicurile devin reale | acceptat | pașii 11–12: celelalte topicuri oprite până trece prima publicare reală; pică → cheile se scot |
| SBE2-1 | high | comentariul și planul exagerau `InvokeWithoutUpdates`; proba nu acoperă alt DC | acceptat | text corectat (Verificat pe viu, `descarcare-lucru.ts`); proba cere un clip de pe alt DC și pică altfel. (Ideea «pe același DC fără `dcId`» n-avea efect — corectată în runda 3, SBE3-1.) |
| SBE2-2 | high | limita de 30 min nu oprește descărcarea; senderele exportate rămân | acceptat | MTProto în proces copil (`descarcare-lucru.ts`), SIGKILL la limită; verificat pe viu (0 procese rămase) |
| SBE2-3 | medium | proba slabă (o descărcare, verdict de mână, exit 0) | acceptat | `scripts/social-proba-mtproto.mts`: logare nouă + sesiune refolosită + timeout, golurile calculate, exit 1 la pică |
| SBE2-4 | low | redeploy în timpul unui clip îl pierde | acceptat | rând în Riscuri + deploy doar după 22:00 |
| SBE-7 (rest) | low | rândul de risc lipsă | acceptat | rând în Riscuri |

## Critic extern - runda 2

Codex: 1.0 (inconsistent: Σ 11.5 → −1.5) · fail · 4 high (C7, C8, C10, C11). Toate acceptate.

| id | severitate | esență | decizie | motiv / unde |
|---|---|---|---|---|
| C7 | high | incertitudinea trimiterii se pierde între încercări / repostări | acceptat | migr. 546 `trimis_posibil`: scris ÎNAINTEA apelului Upload-Post (`seteazaSigur`), neatins la reîncercări, deblocare și repostare; doar eșecul raportat explicit de Upload-Post îl pune false; repostarea refolosește rândul cât e true; 2 teste |
| C8 | high | confirmarea nu e condiție durabilă de publicare | acceptat | migr. 546 stare `neconfirmat` (implicită): rândul devine `planificat` doar prin UPDATE condiționat după ce mesajul cu butoane a ajuns; altfel nepublicabil, închis `anulat` după 10 min (`deblocheaza`, pe `updated_at`); salvarea căzută → mesajul din topic spune «NU a intrat»; `neconfirmat` se poate retrimite; test |
| C9 | medium | proba nu prinde pierderea ultimelor mesaje | acceptat | proba cere la final N numărat de om și compară exact 1…N; fiecare fază (clip 1, clip 2, timeout 20 s) trebuie să fi primit cel puțin un număr |
| C10 | high | releul retrimis inversează `/social_oprit` | acceptat | comenzi explicite `/social_oprit` + `/social_porneste` (idempotente) + deduplicarea `update_id` la releu (`dejaVazuta`); TLX trimite și `social_porneste`; test |
| C11 | high | `/blogger_scoate` confirmă și când ștergerea cade | acceptat | eroarea DELETE → «❌ NU a fost scos»; confirmarea doar la succes |

## Review: business-logic-auditor - runda 3

Am citit în arborele `bot-video-social` (diff necomis) `publicare.ts`, `primire.ts`, `index.ts`, `uploadPost.ts`, `comun.ts:47-75` și migr. 546. Am citit și releul TLX (`TLX PROJECT/.claude/worktrees/bot-releu-clipuri/bot-server/src/server.ts:214`, `:244-264`). Am rulat `npx vitest run src/social`: 42/42.

**Observațiile vechi**

| id | stare | dovadă |
|---|---|---|
| BL2-1 | închis (rămâne ceva la R3-1) | `primire.ts:338-342`: rândul se refolosește doar când `trimis_posibil` e true. Altfel rândul vechi se șterge și cel nou primește alt id, deci altă cheie (`uploadPost.ts:32`, `:61`). Test: `publicare.test.ts:274`. |
| BL2-2 | închis | `publicare.ts:132-140`: `motivOprire` e sub `try`, iar eroarea duce înapoi la `planificat` peste 15 min. Test: `:233`. |
| BL2-3 | închis | `publicare.ts:154-156`: încercarea se numără abia înaintea descărcării. Amânările (`:113`, `:128`, `:138`) nu consumă încercări. Test: `:233`. |
| BL2-4 | închis | Textele de la `primire.ts:222` și `:248` spun acum că clipurile se anulează la ora lor. |
| BL2-5 | închis | Testele C4 (`:223`), BL2-2 (`:233`), C5 (`:257`) și repostarea pe ambele ramuri (`:274`). |
| BL2-6 | închis (rămâne ceva la R3-4) | Pașii 11–12 opresc celelalte topicuri, iar dacă pasul 12 pică, cheile se scot. |
| C7 | închis (rămâne ceva la R3-1 și R3-2) | `publicare.ts:161`: marcajul se scrie ÎNAINTEA lui `publica()`, iar `deblocheaza` și reîncercările nu-l ating. Numai `failed` de la Upload-Post îl șterge (`:219`). Refolosirea rândului nu atinge coloana (`rand` n-o conține, `primire.ts:321-332`). Testele: `:298`, `:310`. |
| C8 | închis (rămâne ceva la R3-3) | Rândul intră `neconfirmat` (`primire.ts:330`). Trece în `planificat` doar printr-un UPDATE condiționat de `.eq('stare','neconfirmat')` (`:356-358`). Publicatorul ia numai `planificat` (`publicare.ts:230`, `:238`). Curățenia după 10 min pe `updated_at` (`:86-88`) e corectă: `rand.updated_at` = acum, și la refolosire. `neconfirmat` nu e în `STARI_OCUPATE` (`primire.ts:20`) și se poate posta din nou (`:308`). Test: `:318`. |
| C10 | închis | `dejaVazuta` (`index.ts:72-79`) rulează după 200 și înaintea lucrului (`:101`), iar releul TLX trimite tot `update`-ul, cu `update_id`. `/social_oprit` și `/social_porneste` sunt idempotente (`primire.ts:220-226`). TLX le trimite pe amândouă (`server.ts:214`). Test: `:330`. |
| C11 | închis | `primire.ts:242-248`: când DELETE dă eroare, mesajul e «❌ NU a fost scos». Confirmarea vine numai la succes. |

**Observații noi**

| id | severitate | greutate | fișier:linie | scenariu | corecție |
|---|---|---|---|---|---|
| R3-2 | medium | −1.0 | `publicare.ts:172-181` (mesajul și alerta folosesc variabila locală `trimitereInceputa`, nu `p.trimis_posibil`); `:201` (fără `upload_request_id` nu se verifică niciodată); `uploadPost.ts:32` (`request_id` = `p.id`, deci starea se poate cere și fără răspuns) | Încercarea 1 trimite fișierul și primește 504 de la proxy, deși corpul ajunsese (`async_upload`). Rândul trece în `planificat` cu `trimis_posibil` true. Încercarea 3 cade la descărcare (rețea Telegram), sau vine `ClipSchimbat`. Rândul devine `esuat`, iar în topic scrie «publicarea n-a reușit». Alerta adminului nu mai spune «fișierul a plecat». Testul `:298` confirmă starea finală `esuat` + `trimis_posibil` true. Între timp jobul din încercarea 1 poate fi public pe TikTok, dar nimeni nu-l mai verifică. Clipul rămâne `esuat` în bază și în `/social`, iar bloggerul crede că trebuie să-l posteze din nou. Dublură nu iese, pentru că refolosirea rândului păstrează cheia. Greșite sunt starea și mesajul. | (1) Mesajul și alerta folosesc `p.trimis_posibil \|\| trimitereInceputa`. (2) Înainte de o nouă descărcare, când `p.trimis_posibil` e deja true, se cere `stareaPublicarii(cheie, p.id)`. Dacă vine `gata` sau `in_lucru`, rândul trece în `trimis` cu `upload_request_id = p.id`, fără descărcare și fără retrimitere. Dacă vine `negasit` sau `failed`, încercarea continuă. Același pas în ramura finală `esuat`: rândul trece în `trimis` cu `upload_request_id = p.id`, iar `verificaTrimise` lămurește starea (`negasit` > 2 h → `esuat`). Test pe scenariul de la `:298`. |
| R3-1 | low | −0.5 | `publicare.ts:171-181` (eroarea definitivă 4xx venită după trimitere lasă `trimis_posibil` true și scrie «e posibil să fi plecat»); `uploadPost.ts:69` | Un 4xx explicit (≠429) e un refuz raportat de Upload-Post, adică exact cazul în care C7 spune că marcajul se șterge. Exemplu: `facebook_page_id` greșit → 400 → `esuat`, cu `trimis_posibil` true. Adminul îndreaptă `/social_pagina`, iar bloggerul postează clipul din nou. Rândul se refolosește cu aceeași cheie și cu alt corp. Dacă Upload-Post ține răspunsul sub cheie, cum fac de obicei API-urile cu idempotență, repostarea primește iar 400, sau o eroare de «cheie refolosită cu alți parametri». E bucla de la BL2-1, pe ramura definitivă. În topic scrie oricum, fals, «posibil să fi plecat». | În `catch`, când `err instanceof EroareUploadPost && err.definitiva` (răspuns 4xx primit), se scrie `trimis_posibil: false`, iar mesajul din topic folosește ramura «publicarea n-a reușit». Test. |
| R3-3 | low | −0.5 | `primire.ts:356-363` | UPDATE-ul `neconfirmat → planificat` se face în bază, dar răspunsul se pierde (eroare de rețea supabase-js după commit). `eConf` e setat, mesajul se schimbă în «❌ NU a intrat în calendar», iar `editMessageText` scoate butoanele. Rândul e totuși `planificat` și pleacă la ora lui fără butoane de anulare, deși topicul spune că nu intră. Bloggerul postează din nou și primește «deja în calendar» (`:308-309`). Mesajele se contrazic, iar adminul nu are cum anula. E rar. | Pe ramura `eConf` se face compensarea condiționată `update({stare:'anulat', eroare:'confirmarea nu s-a salvat'}).eq('id',id).in('stare',['neconfirmat','planificat'])`, cu cel mult 3 încercări. Sau rândul se citește din nou și mesajul se editează numai dacă e încă `neconfirmat`. |
| R3-4 | low | −0.5 | Pasul 12 al planului («Trece → `/social_oprit` din nou în celelalte (le pornește)») față de `primire.ts:220-226` | După C10, `/social_oprit` nu mai e comutator. Comanda din pasul 12 lasă topicurile oprite, iar clipurile bloggerilor sunt refuzate cu «⏸ Topicul e oprit» (`primire.ts:278`) până observă cineva. Nu se publică nimic din greșeală. Doar oprirea nu e cea voită. | Pasul 12: «Trece → `/social_porneste` în celelalte». |

Notă fără deducere: un rând refolosit (`trimis_posibil`) primește text, platforme și pagină noi, dar Upload-Post întoarce jobul vechi, cu corpul vechi. `textRezultat(…, p.platforme)` poate arăta «n-a raportat nimic» pentru o platformă adăugată între timp și pornește alerta «incomplet». Mesajul e adevărat, deci rămâne așa.

Scor: 7.5 · Blocante (critical/high): 0

## Review: senior-backend-engineer - runda 3

Am verificat pe sursa `node_modules/telegram` (2.26.22) din rădăcina worktree-ului. Am compilat botul cu `tsc -p apps/bot/tsconfig.json` într-un director din scratchpad: zero erori, iar `social/descarcare-lucru.js` apare lângă `descarcare.js`. Am rulat și un test IPC separat: 50 de fork-uri, copilul face `send` și apoi `exit` după 100 ms, iar părintele e ocupat 400 ms. Rezultat: `exit` a venit înaintea lui `message` în 0 din 50 de cazuri.

**Răspunsurile la întrebări**

- **Dockerfile.** `dist` conține `descarcare-lucru.js`, pentru că `include: src/**/*` exclude doar testele. `new URL('./descarcare-lucru.js', import.meta.url)` se rezolvă la `dist/social/`, deci în producție `execArgv` e `[]` și tsx nu e necesar (e doar în devDeps). `fork` folosește `process.execPath` (`/usr/local/bin/node`). `USER node` nu încurcă: `/tmp` se poate scrie. Node e PID 1 și își culege singur copiii prin libuv, deci nu rămân zombi.
- **IPC.** Mesajele sunt mici: cererea are token, sesiune (~350 caractere) și câmpuri numerice. Răspunsul conține doar `number` și `string`, fără BigInt (`Number(doc.size)`, `doc.dcId` e `int`), deci serializarea JSON implicită e corectă. Tokenul trece prin IPC, nu prin argv: corect. Ordinea `message` → `exit`: părintele omoară copilul chiar la `message` (`descarcare.ts` `termina`), iar garda `gata` face ca un `exit` venit mai târziu să nu conteze. Cazul invers nu l-am putut reproduce (vezi SBE3-2).
- **`sesiune.dcId`** există: `MemorySession.get dcId()` (`sessions/Memory.js:28-29`), pe care `StringSession` îl moștenește și îl citește din șir (`StringSession.js:33`). După `USER_MIGRATE`, `_switchDC` cheamă `session.setDC(newDc, …)` (`TelegramClient.js:1117`), deci valoarea e DC-ul real al botului. Detecția în sine e corectă. Problema e că nu produce efectul promis (SBE3-1).
- **Ieșirea copilului.** Cele 100 ms dinainte de `process.exit` ajung din plin pentru un mesaj sub 1 KB. Testul meu și verificarea lui Ion (`API_ID_INVALID`) confirmă asta. Cât timp așteaptă `setTimeout`, GramJS nu poate întârzia ieșirea: `process.exit` nu așteaptă prizele.
- **Proba** e acum corectă ca poartă. Are logare nouă, sesiune refolosită (același Map `sesiuni` în procesul probei), timeout cu SIGKILL urmat de 17 s de ascultare, N introdus de om, acoperire pe fiecare fază, alt DC obligatoriu și `exit 1` când pică. Reconectarea forțată din recomandarea mea din runda 2 nu mai e necesară. Motivul: proba trece deja prin cereri neîmpachetate (InitConnection/GetConfig la `connect`, GetConfig în `_connectSender`, Export/ImportAuthorization pe alt DC). Dacă Bot API primește tot în timp ce sesiunea face cereri neîmpachetate, atunci și `getMe` de la reconectare aparține aceleiași clase de cereri. Proba închide deci clasa, nu fiecare cerere în parte.

### Observațiile rundei 2

| id | stare | dovadă |
|---|---|---|
| SBE2-1 | **închis** (cu SBE3-1) | Comentariul `descarcare-lucru.ts:7-15` și rândul din «Verificat pe viu» listează acum cererile neîmpachetate. Proba cere un clip de pe alt DC (`altDc`, exit 1 altfel). Corecția mea (2) din runda 2, «pe același DC fără `dcId`», a fost însă greșită și nu are efect: vezi SBE3-1. Poarta nu e afectată, pentru că proba rulează exact codul din producție. |
| SBE2-2 | **închis** | `descarcare.ts` `descarcaInCopil`: `fork`, `SIGKILL` la `limitaMs`, garda `gata`, `exit` și `error` tratate. Botul nu mai încarcă `telegram`: `grep "from 'telegram"` găsește importul doar în `descarcare-lucru.ts`. Verificat pe viu de Ion: 0 procese rămase. Fișierul parțial se șterge în `descarcaClip` după răspuns. |
| SBE2-3 | **închis** | `scripts/social-proba-mtproto.mts`: două clipuri, sesiunea refolosită, faza de timeout de 3 s, `lipsa(nr, N)` cu N de la om, `fazeGoale`, `altDc`, `process.exit(trece ? 0 : 1)` în `finally`. |
| SBE2-4 | **închis** | Rândul din «Riscuri» (`plan:101`) și pașii 5/11 spun «după 22:00». |
| SBE-7 (rest) | **închis** | `plan:102`. |
| SBE-8 (rest) | **deschis (low)** | Limitele de disc efemer și RAM ale containerului Railway tot nu apar în «Verificat pe viu». Riscul a scăzut mult: există un singur fișier la un moment dat, iar la SIGKILL fișierul se șterge. Vezi SBE3-3. |

### Observații noi

| id | severitate | greutate | fișier:linie | scenariu | corecție |
|---|---|---|---|---|---|
| SBE3-1 | medium | −1.0 | `apps/bot/src/social/descarcare-lucru.ts:51-53` (`peAltDc` și comentariul «pe același DC nu se cere sender exportat»); `node_modules/telegram/client/downloads.js:84` și `:100` (`this._sender = await this.client.getSender(this._sender.dcId)`); `client/TelegramClient.js:1064` (senderul principal se creează cu `dcId: this.session.dcId \|\| 4`, deci niciodată 0); `client/telegramBaseClient.js:328-332`, `:216-218` | Pe același DC, `_init` ia într-adevăr senderul principal. Dar chiar prima bucată (`_request`, `:100`) cere `getSender(dcId-ul senderului principal)`, iar acesta nu e 0. Cererea trece deci prin `_borrowExportedSender`: conexiune nouă, `_connectSender` → `getDC` → `help.GetConfig` neîmpachetat pe senderul principal, la fiecare descărcare. Comportamentul e identic cu cel de dinainte de «corecție», deci ramura `peAltDc` e logică moartă, iar comentariul și triajul SBE2-1 («pe același DC fără `dcId`») promit o atenuare care nu există. Nu se pierde nimic funcțional: proba rulează același cod. Un cititor viitor (sau trecerea pe `teleproto`) va crede însă că pe același DC pleacă doar `upload.GetFile`. Recomandarea greșită a fost a mea, în runda 2. | Se scoate condiția și se dă mereu `dcId: doc.dcId`, ceea ce e echivalent și explicit. Comentariul devine: «la fiecare descărcare GramJS deschide o conexiune exportată și cere `help.GetConfig` neîmpachetat; pe alt DC mai cere `auth.ExportAuthorization` / `ImportAuthorization`». Rândul SBE2-1 din triaj se corectează. Proba rămâne cum e: cerința `altDc` acoperă în continuare ramura Export/Import. |
| SBE3-2 | low | −0.5 | `apps/bot/src/social/descarcare-lucru.ts:61-67` (`.finally(() => setTimeout(() => process.exit(0), 100))`); `descarcare.ts` handlerul `exit` din `descarcaInCopil` | Ieșirea copilului depinde de un timp fix, nu de livrarea mesajului. Dacă vreodată `exit` ajunge la părinte înaintea lui `message` (n-am reprodus asta în 0/50, dar Node nu garantează ordinea între priza IPC și SIGCHLD), un clip descărcat corect apare ca «procesul descărcării s-a oprit (cod 0)». Urmează o reîncercare peste 15 min și o sesiune nouă neînregistrată. Pierderea nu e publică și nu produce dublură. | În copil: `process.send(r, () => process.exit(0))`, iar la eroarea de trimitere `process.exit(1)`. Plus `process.on('disconnect', () => process.exit(1))`, ca un copil rămas fără părinte (local, în dezvoltare) să nu mai descarce 30 de minute. În părinte: dacă `exit` vine cu cod 0 și fără mesaj, se poate aștepta `close` în loc de `exit`. |
| SBE3-3 | low | −0.5 | plan «Verificat pe viu», rândul 22 («codul nu mai cheamă GetState (InvokeWithoutUpdates)»), plus limita de disc (SBE-8) | Rândul 22 încă sugerează că `InvokeWithoutUpdates` e protecția. Protecția reală e proba plus procesul copil, iar GetState mai pleacă la NETWORK_MIGRATE și după 30 min fără cereri (`updates.js:217-219`). Limita de disc a containerului nu e măsurată: un clip de 800 MB plus imaginea pot depăși discul efemer, și asta s-ar vedea abia la prima publicare reală. | Rândul 22 se reformulează: «protecția = proba (pasul 10) + procesul copil; cereri neîmpachetate rămân». Pentru disc: `df -h /tmp` în containerul Railway (`railway ssh` sau un log la pornire), cu valoarea trecută în tabel. |

Notă fără deducere: în probă, faza de timeout nu verifică explicit că nu mai rămâne niciun proces copil după SIGKILL. Ion a verificat asta separat (300 ms, 0 procese), iar codul ucide copilul înainte de `da(r)`.

Scor: 8.0 · Blocante (critical/high): 0

## Triaj revizori Claude - runda 3

Scoruri runda 3: business-logic-auditor 7.5 (0 blocante) · senior-backend-engineer 8.0 (0). security-auditor nu a mai fost relansat (runda 2: 9.2, 0 blocante; zona lui atinsă în runda 3 doar de C10/C11, ambele închideri de drepturi). Minimul Claude = 7.5.

| id | severitate | esență | decizie | motiv / unde |
|---|---|---|---|---|
| R3-1 | low | refuzul 4xx lasă `trimis_posibil` și mesajul «posibil plecat» | acceptat | `publicare.ts`: 4xx primit → `trimis_posibil=false`, mesajul «n-a reușit»; test |
| R3-2 | medium | incertitudinea din încercarea de dinainte nu ajunge în mesaj; clipul posibil-plecat nu e întrebat | acceptat | înainte de o nouă descărcare, cu `trimis_posibil`, se întreabă Upload-Post (`request_id` = id-ul postării): gata / în lucru → `trimis`, fără retrimitere; mesajul și alerta folosesc `trimis_posibil`; 2 teste |
| R3-3 | low | UPDATE-ul confirmării trecut, dar răspunsul pierdut → publicabil fără butoane | acceptat | compensare condiționată `anulat` pe `neconfirmat`/`planificat`, 3 încercări |
| R3-4 | low | pasul 12 folosea `/social_oprit` ca pornire | acceptat | pasul 12: `/social_porneste` |
| SBE3-1 | medium | ramura «același DC fără dcId» e moartă, comentariul promite ce nu e | acceptat | `dcId` dat mereu; comentariul spune că GramJS deschide o conexiune exportată cu GetConfig la fiecare descărcare |
| SBE3-2 | low | copilul iese după un timp fix | acceptat | `process.send(r, cb → exit)`, plus `disconnect → exit(1)`; reverificat pe viu: răspuns normal + SIGKILL la limită, 0 procese rămase |
| SBE3-3 | low | rândul MTProto din tabel încă sugera că `InvokeWithoutUpdates` e protecția; discul nemăsurat | acceptat | rândul reformulat; rândul discului Railway «neverificat» cu rezervă |

Teste: `npx vitest run src/social` 44/44; `tsc --noEmit` curat (bot și TLX bot-server).

## Critic extern - runda 3 (ultima)

Codex: 5.0 (inconsistent: Σ 6.5 → 3.5) · fail · 2 high (C12, C13). Toate acceptate și corectate DUPĂ runda 3 — Codex nu le-a
mai văzut (a patra rundă e interzisă de procedură).

| id | severitate | esență | decizie | motiv / unde |
|---|---|---|---|---|
| C12 | high | refuzul 4xx de acum ștergea îndoiala unei trimiteri de dinainte | acceptat | `publicare.ts`: refuzul lămurește doar încercarea curentă; `trimis_posibil` venit de dinainte rămâne; test «C12» (stare 401 + POST 401 → eșuat, marcaj păstrat, mesaj «posibil plecat») |
| C13 | high | după compensări eșuate, mesajul fals «NU a intrat» | acceptat | `primire.ts`: «NU a intrat» doar dacă anularea s-a confirmat în bază; altfel butoanele rămân, mesaj «nu pot confirma» + alertă ADMIN. Fără test automat (baza falsă nu simulează commit cu răspuns pierdut) |
| C14 | medium | proba putea trece fără timeout real și fără același DC | acceptat | proba cere un clip pe DC-ul botului ȘI unul pe alt DC, iar faza de timeout trece doar pe eroarea «depășit» |

## Rezultatul dezbaterii

| Partea | Runda 1 | Runda 2 | Runda 3 | critical/high deschise acum |
|---|---|---|---|---|
| Claude — minimul revizorilor | 0.5 | 4.0 | 7.5 | 0 |
| Codex — critic extern | 0.0 | 1.0 | 5.0 | 0 deschise (C12, C13 corectate după runda 3, neverificate de Codex) |

Gate: după regula «deschis = nici acceptat, nici respins cu fapt», nu mai e nimic deschis. Rezerva onestă: ultimele două
high ale lui Codex au fost închise fără o a patra privire a lui; decizia de deploy e a lui Ion.
Teste la final: `npx vitest run src/social` 45/45; `tsc --noEmit` curat (bot și TLX bot-server).
