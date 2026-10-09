# Deschiderea vânzării online: Briceni/Edineț ↔ Chișinău, din 12.10, returnarea după grilă

## De ce
Ion (09.10.2026): «deschide vânzarea pe Briceni și Edineț spre Chișinău și din Chișinău spre Edineț și Briceni, cu regula
returnare normală, începând de 12.10». La întrebări: vânzarea **pornește pe 12.10** (până atunci butonul nu apare);
**doar perechile cu Chișinău** (Briceni/Edineț → Chișinău și Chișinău → Briceni/Edineț); restul biletelor — la șofer.
«Returnare normală» = grila 24/12/6/4 h, fără garanția de lansare de 100 %.

## Ce facem
**Ales:** două chei noi în `app_config`, citite de panou (sursa de adevăr) și publicate site-ului, plus date:
1. `bilete_online_de_la = 2026-10-12` — vânzarea publică e deschisă doar dacă `bilete_online_activ = true` ȘI azi
   (Chișinău) ≥ data asta; panoul calculează `activ` și îl dă site-ului (`configPublica`), deci site-ul nu se schimbă
   pentru dată. `bilete_online_activ = true` se pune ACUM; până pe 12.10 rămâne efectiv închis.
2. `bilete_destinatii_vanzare = ["Chișinău"]` — perechea trebuie să aibă un capăt în `bilete_localitati_vanzare`
   (Briceni, Edineț) și celălalt în destinații (Chișinău). Lipsă/goală = regula veche (urcare SAU coborâre).
   Aceeași funcție pură în `@translux/db` (`cursaInLocalitatileVanzarii`) pentru panou și site.
3. Rutele: `bilete_online_tur = bilete_online_retur = true` pe cele 27 de rute active care opresc la Briceni sau Edineț
   (toate în afară de 5 Șirăuți și 13 Lipcani (Rîșcani)).
4. Garanția oprită: `bilete_garantie_100_pana = ''`; din condițiile de vânzare (RO/RU) și din e-mailul biletului se
   scoate paragraful garanției (rămâne grila). `TERMS_UPDATED` → 9 octombrie 2026.

**Respinse:** (1) cron care pune `bilete_online_activ=true` pe 12.10 — încă o piesă care poate să nu ruleze; data în
config e verificată la fiecare cerere. (2) doar steagurile pe rute fără regula perechilor — ar vinde și Edineț → Bălți,
Ocnița → Briceni, contra deciziei lui Ion.

## 🔬 Verificat pe viu
| Presupunere | Cu ce s-a verificat | Fapt | Ce influențează |
|---|---|---|---|
| Config azi | SELECT app_config | activ=false, localități ["Briceni","Edineț"], închidere tur 120 / retur 120 min, garanție 2026-12-31, anulare 240 | pașii 1–4 |
| Regula localităților | packages/db/src/bilete-localitati.ts:77 | urcare SAU coborâre în listă | extinsă cu destinațiile |
| Cine o folosește | git grep | comenzi.ts:206 (panou, refuz), web bilete-reguli.ts:66 (buton), public.ts:161 (config publică) | trei locuri, aceeași funcție |
| Numele opririlor | SELECT crm_stop_fares | exact «Briceni» (21), «Edineț» (28), «Chișinău» (30); compararea e fără diacritice | regula prinde toate |
| Cache-ul config-ului | web bilete-api.ts:11,18 (memorie 60 s) + public/config/route.ts:14 (s-maxage 60, swr 300) | deschiderea pe 12.10 se vede pe site în cel mult ~6 min; verificările după scrieri se fac cu `?t=<moment>` (ocolește CDN-ul) | acceptat, nimic de schimbat |
| Rutele | SELECT crm_routes ⨝ crm_stop_fares | 29 active; toate au Chișinău; 27 au Briceni sau Edineț (nu 5, 13); toate steagurile false | pasul 3 |
| Garanția în texte | git grep | legal-terms.ts:143 (+RU), email-mesaj.ts:45,56 | pasul 4 |
| Șoferii pe aceste rute legați de Telegram | SELECT daily_assignments 08–09.10 ⨝ drivers | 28 din 45; 17 nelegați | ei nu văd pasagerii și nu pot scana — sarcina lui Ion |

## Pași
1. `packages/db/src/bilete-localitati.ts`: `destinatiiDinValoare`/`parseazaDestinatii` (lipsă/[] = fără restricție,
   stricat = nicio pereche); `cursaInLocalitatileVanzarii(regula, urcare, coborare, destinatii?)` — cu destinații:
   `(L∋urcare ∧ D∋coborare) ∨ (L∋coborare ∧ D∋urcare)`. Teste: Briceni→Chișinău da, Chișinău→Edinet da, Edineț→Bălți nu,
   Ocnița→Briceni nu, fără destinații = regula veche, destinații stricate = nimic.
2. Panou `comenzi.ts`: `citesteConfigBilete` citește `bilete_online_de_la` și `bilete_destinatii_vanzare`;
   `activ = steag ∧ (de_la lipsă ∨ chisinauTodayIso() ≥ de_la)` (ziua Chișinăului, test la 23:30 UTC pe 11.10; de_la stricat
   → închis); `verificaLocalitateaVanzarii` cu destinații și
   mesajul construit din localități + destinații (L2), ca `localitatiDeAfisat`. `public.ts configPublica` publică
   `destinatii`.
3. Site `bilete-reguli.ts`: `parseazaConfig` citește `destinatii`; `vanzareDeschisaPeSite` îl trece mai departe. Teste.
4. Texte: legal-terms.ts (RO/RU) fără paragraful garanției; email-mesaj.ts `retur` = grila; testele e-mailului;
   probă (L1, C1): pagina de probă permite și «Poimâine»; testul 15 cumpără B pentru POIMÂINE (> 24 h → 10 lei integral
   după grilă, peste minimul de 10), testul 16 așteaptă «10 lei»; `dataProbaPermisa` azi..azi+2 + butonul în ProbaClient.
5. Date, în DOUĂ execuții (H1): întâi verific că producția are codul nou (`/api/bilete/public/config` are câmpul
   `destinatii`, `/api/version` = commitul); apoi `bilete_online_de_la='2026-10-12'`, `bilete_destinatii_vanzare='["Chișinău"]'`,
   `bilete_online_lansat='2026-10-12'` (M1: oprește anunțul de dimineață «după 12 octombrie» din grupa șoferilor),
   `bilete_garantie_100_pana=''`, steagurile pe cele 27 de rute; verific iar `activ:false`; abia apoi, separat,
   `bilete_online_activ='true'` și încă o verificare `activ:false` (data de start încă neatinsă).
6. Livrare: push (central-hub) → deploy translux-web → date.

## Fișiere
- `packages/db/src/bilete-localitati.ts` (+ test), `apps/admin/src/lib/bilete/{comenzi.ts,public.ts}`,
  `apps/web/src/lib/bilete-reguli.ts` (+ test), `apps/web/src/components/legal/legal-terms.ts`,
  `apps/admin/src/lib/bilete/{email-mesaj.ts,email-mesaj.test.ts}`

## Riscuri
- **Site vechi + panou nou** într-o fereastră de deploy: butonul pe o pereche ne-Chișinău → panoul refuză cu mesaj
  clar. Datele se pun după ambele deploy-uri.
- **Data de start**: azi < 12.10 → `activ=false` în configPublica și în panou; verificare: `/api/bilete/public/config`.
- **17 șoferi nelegați** de Telegram pe aceste rute: pasagerul are bilet, șoferul nu-l vede în aplicație. Rezervă:
  lista nominală pentru Ion; șoferul vede totuși QR-ul și numele pe ecranul clientului.
- **Închiderea vânzării 120 min înainte** (tur și retur) rămâne cum e în config (nu s-a cerut schimbarea).

## Verificare
- unit: perechile (db), config + buton (web), e-mail; tsc + vitest admin/web/db; pre-push.
- prod după date: `/api/bilete/public/config` → `activ:false`, `destinatii:["Chișinău"]`, 27 de rute; o comandă
  publică pe Briceni→Chișinău → refuz «nu e deschisă» azi; pe 12.10 — butonul apare pe Briceni→Chișinău și nu pe
  Edineț→Bălți.

## Review: business-logic-auditor (runda 1)
Scor 6.2 · Blocante 1 — H1 datele puse înainte ca producția să aibă codul nou ar deschide vânzarea azi; M1 anunțul de
dimineață (`bilete_online_lansat`); L1 testul 16 al probei; L2 mesajul de refuz scris de mână; nota pe fus orar.
Confirmat: o singură intrare publică de comandă (api/bilete/comanda), site și mini app trec prin `sale_open` → `cfg.activ`;
numele opririlor exacte; garanția se oprește din cheia goală. **Triaj:** toate acceptate → pașii 2, 4, 5.
Deschise critical/high: 0.

## Critic extern - runda 1
Codex: scor 8.0 · **pass** · 0 critical/high.

| id | severitate | esență | decizie | motiv |
|---|---|---|---|---|
| C1 | medium | biletul de probă de 10 lei pentru mâine (< 24 h) cade sub minimul de 10 lei după grilă → dispecer | acceptat | retur-bot-reguli.ts:34-37 → proba permite «Poimâine», testul B pe > 24 h (pasul 4) |
| C2 | low | config-ul are cache în memorie 60 s + CDN 60/300 s | acceptat | întârziere ≤ ~6 min la deschidere; verificări cu `?t=` (Verificat pe viu) |

## Gate
Deschise critical/high: Claude 0 (H1 acceptat și corectat), Codex 0 (pass). Scoruri: Claude 6.2, Codex 8.0. O rundă.
