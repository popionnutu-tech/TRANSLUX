# ION-153 — SEO translux.md: metadate, sitemap, redirecturi, pagini de rută

## De ce

Ion (30.09): «analiza la pagina translux… ce SEO pentru apariție în Google… să apărem cel mai
sus, și să le realizez… fă tot singur». Azi translux.md îi spune lui Google aproape nimic:
titlul e «TRANSLUX», descrierea «Sistem de monitorizare transport», nu există robots.txt,
sitemap.xml, canonical sau hreflang, iar singurul text indexabil e sloganul și 12 rânduri
«Chișinău - X  NNN LEI». Căutările reale ale pasagerilor sunt «autobuz Chișinău Briceni orar»,
«расписание автобусов Кишинёв Единец»; pe ele ies autobuse.md, autocare.md, rome2rio,
tutu.ru, rasp.yandex.ru — toți au O PAGINĂ PE DIRECȚIE cu orar și preț. translux.md nu are
nicio pagină care să poată răspunde la o astfel de căutare. În plus, adresele vechi
transportlux.com/ro/search/<de>/<spre>, încă în indexul Google, ajung azi pe 404.

## Ce facem

**Ales:** SEO tehnic complet + pagini de direcție generate din orarul real (datele pe care
site-ul le arată deja la căutare), RO și RU, cu legături interne din pagina principală și
redirect 301 al adreselor vechi spre ele.

**Respins 1 — doar metadate (titlu/descriere/sitemap).** Repară baza, dar pagina principală
rămâne o singură pagină pentru ~46 de căutări diferite de direcție; concurenții cu pagini
pe direcție rămân deasupra. Făcut oricum, ca parte a variantei alese.

**Respins 2 — blog / texte scrise de mână pe fiecare oraș.** Conținut fără date reale, se
învechește, cere întreținere; Google penalizează paginile subțiri generate din șablon fără
informație unică. Paginile noastre au informație unică: orele reale de plecare/sosire,
prețul de azi, numărul de curse.

**Decizii luate singur (Ion: «fă tot singur»):**
- Direcțiile: toate perechile ordonate între localitățile `is_major` în care una e Chișinău
  sau Bălți și există ≥1 plecare — 46 de perechi × 2 limbi = 92 de pagini.
- URL: `/ro/autobuz/<de>-<spre>`, `/ru/avtobus/<de>-<spre>`; slug latin din `name_ro`
  (fără diacritice) — același slug în ambele limbi, ca hreflang-ul să fie o simplă înlocuire.
- `/` rămâne pagina RO canonică (e cea indexată azi); `/ro` primește canonical spre `/`.
- Sloganul H1 rămâne (design); cuvintele-cheie merg în `<title>`, description și în
  paginile de direcție (unde H1 = «Autobuz Chișinău – Briceni: orar și preț»).

## 🔬 Verificat pe viu

| Presupunere | Cu ce s-a verificat | Fapt | Ce influențează |
|---|---|---|---|
| Nu există robots/sitemap | `curl https://translux.md/robots.txt`, `/sitemap.xml` | 404 amândouă | pasul 2 |
| Titlu/descriere slabe | curl HTML `/` | `<title>TRANSLUX`, description «Sistem de monitorizare transport», fără canonical/hreflang/og | pasul 1 |
| www e duplicat | `curl -I https://www.translux.md/` | 200, 66 KB, același conținut | pasul 3 |
| `/` și `/ro` identice | `src/app/page.tsx` și `src/app/ro/page.tsx` | ambele randează `HomePage locale="ro"` | canonical pas 1 |
| Adrese vechi în Google dau 404 | WebSearch «Translux autobuz … Lipcani» → transportlux.com/ro/search/chisinau/lipcani; `curl -L` | → translux.md/ro/search/chisinau/lipcani **404**; varianta `Lipcani/Chi%C5%9Fin%C4%83u` (ş cu sedilă) tot 404 | pasul 3 |
| Concurenții au pagini pe direcție | WebSearch «autobuz Chișinău Briceni orar», «расписание автобусов Кишинёв Единец» | autobuse.md/ro/bus/briceni/chisinau, autocare.md/ro/bus/briceni/chisinau, bus.tutu.ru/raspisanie/…, rasp.yandex.ru/bus/edinets--kishinev | pasul 4 |
| translux.md e în index | WebSearch «translux.md» | primul rezultat https://translux.md/ cu titlul «TRANSLUX» | nu schimbăm URL-ul `/` |
| Orarul e în DB, citibil de anon | `src/lib/supabase.ts` (anon key; RLS anon pe crm_routes, crm_stop_fares, localities, tariff_periods); SQL | 30 rute `interurban` + 14 `suburban` active; `crm_stop_fares` are `stop_order`, `hour_from_chisinau`, `hour_from_nord` pe fiecare oprire | pasul 4 |
| Sensul și ascunderea | `actions.ts` searchTrips (l. ~480–560) | `goingNorth = from.stop_order > to.stop_order` → ora `hour_from_chisinau`, sare dacă `retur_ascuns`; altfel `hour_from_nord`, sare dacă `tur_ascuns`; `'0:00'`/null = nu oprește; sare dacă tariful sensului nu are pereche km | pasul 4 copiază EXACT aceste filtre |
| Perechile cu plecări | SQL pe crm_stop_fares × localities is_major, hub Chișinău/Bălți | 46 perechi ordonate cu ≥1 rută (Rîșcani 1–2, Otaci 2, Corjeuți 4 … Orhei/Sîngerei 29) | lista paginilor |
| Km pentru preț | SQL `v_interurban_v2_km_pairs` from_stop in (chisinau, balti) | există km pentru toate 24 perechile hub→major (ex. chisinau→briceni 238, balti→singerei 26.1) | prețul pe pagină |
| Zile ale săptămânii | coloane crm_routes | `sunday_nord`/`sunday_chisinau`/`retur_disabled` setate pe 1 rută; searchTrips NU le folosește | pagina nu promite zile; notă «verifică data la căutare» |
| Numele RU | localities is_major | ex. Otaci = «Атаки», Chișinău = «Кишинёв», Bălți = «Бельцы» | H1/title RU din `localities.name_ru` |
| Datele operatorului | `src/components/legal/legal-content.ts:13` | `OPERATOR.name` SRL „Parcul de Autobuze și Taximetre nr. 9 din Briceni”, IDNO | JSON-LD Organization |
| Middleware sare peste .txt | `src/middleware.ts` matcher `.*\\.txt$` exclus | robots.txt nu trece prin middleware | redirect-ul www nu atinge robots.txt; acceptabil (www/robots.txt identic) |
| Build fără env | `.claude/kit/PROFILE.md` «ambele next build trec fără env vars» | Supabase la build ar arunca | sitemap/paginile nu citesc DB la build (try/catch, `generateStaticParams` = []) |
| Next 15.5 | `apps/web/package.json` | `next ^15.5.14` → `app/robots.ts`, `app/sitemap.ts`, `generateMetadata`, `alternates.languages` disponibile | pașii 1–2 |
| Performanța (CWV) | PageSpeed API | **neverificat** — 429 quota | în afara planului; rezervă: Ion rulează pagespeed.web.dev după deploy |
| Search Console / Google Business | nu avem acces | **neverificat** | pas pentru Ion (la final), nu blochează codul |

| Fapte adăugate de revizori (runda 1) | SELECT-uri + curl ale revizorilor | ISR-ul ține cu `unstable_cache` peste fetch no-store (`x-nextjs-prerender: 1` pe `/`, `/ru`); `crm_stop_fares.name_ro` = `localities.name_ro` exact pe cele 13; 46 perechi reproduse; km minim = km din getPopularPrices; ruta 8 are `'00:00'` (oră validă) la Lipcani; o singură ofertă activă: Bălți→Chișinău (sens exact); tariful se schimbă în fiecare vineri; POPULAR_ROUTES conține Larga și Grimăncăuți (`is_major=false`) | pașii 5, 6, 9 |

## Pași

1. **`src/lib/seo.ts`** (nou, pur, fără DB — importabil și din middleware edge):
   `SITE_URL='https://translux.md'`; `MAJOR` = lista statică a celor 13 localități majore
   `{slug, ro, ru}` (ru din `localities.name_ru`: Бельцы, Бричаны, Атаки, Единец, Липканы …);
   `HUB_SLUGS=['chisinau','balti']`; `slugify(name)` (NFD, scoate U+0300–036F — inclusiv sedila
   din ş/ţ —, lowercase, spații→`-`); `homePath(locale)` (`ro`→`/`, `ru`→`/ru`);
   `routePath(locale, fromSlug, toSlug)`; `parsePair(pair)` → `{from,to}` doar dacă ambele sunt în
   `MAJOR` și una e hub, altfel null; `legacySearchTarget(lang, rawFrom, rawTo)` → cale țintă
   (decodare în try/catch, la eroare → `homePath(lang)`); `jsonLd(obj)` =
   `JSON.stringify(obj).replace(/</g,'\\u003c')`.
   Rezultat: `seo.test.ts` — slugify(`Chişinău`/`Chișinău`/`Rîșcani`), parsePair (valid, invers,
   non-hub, gunoi), legacySearchTarget (`Lipcani/Chi%C5%9Fin%C4%83u` → `/ro/autobuz/lipcani-chisinau`,
   `%E0%A4%A` → `/`, `larga` → `/`), jsonLd cu `</script>` în nume.
2. **`src/lib/timetable.ts`** (nou, pur): `buildScheduledTrips({routes, fromStops, toStops, kmPairs,
   rateLong, rateSub})` → `{routeId, goingNorth, time, arrival, segmentMinutes, price, destination_ro,
   destination_ru}[]`, extras din bucla `searchTrips` (actions.ts l. ~437–593) FĂRĂ partea de
   șofer: sens după `stop_order`, tariful sensului, `priceMap` din km în AMBELE sensuri (primul
   rând câștigă), `retur_ascuns`/`tur_ascuns`, oră exclusă doar la null sau exact `'0:00'`
   (`'00:00'` rămâne validă), sosire; `segmentMinutes = (sosire − plecare + 1440) % 1440`, null
   fără sosire. **`searchTrips` e refactorizat să o folosească** și aplică deasupra doar
   șoferul/placa/ofertele/«isAwaitingDriver» exact ca acum (comportament neschimbat, câmpul
   `duration` rămâne cel de azi).
   Rezultat: `timetable.test.ts` pe fixture cu rutele 2 (retur_ascuns), 8 (`'00:00'`, peste
   miezul nopții), 13 (tur_ascuns), 16, plus tarif fără pereche km și oră `'0:00'`; test-web verde
   (17 teste existente + noi).
3. **Metadate principale** — `layout.tsx`: `metadataBase: new URL(SITE_URL)`, template
   `%s | TRANSLUX`, description implicit, openGraph (siteName, `/og.png` 1200×630), twitter card.
   `page.tsx` (/), `ro/page.tsx`, `ru/page.tsx`: `title.absolute` cu brandul în față, ≤65 car.
   (RO: «TRANSLUX — autobuze Chișinău – Bălți – nordul Moldovei», RU: «TRANSLUX — автобусы
   Кишинёв – Бельцы – север Молдовы»), description cu orașele și «orar, prețuri, șoferul și
   telefonul cursei»; `alternates.canonical` (`/` pentru `/` și `/ro`; `/ru`),
   `alternates.languages {ro:'/', ru:'/ru', 'x-default':'/'}`; JSON-LD `Organization`
   (name TRANSLUX, legalName din `OPERATOR`, url, logo, telephone `+37360401010`, sameAs FB/TikTok)
   + `WebSite`, prin `jsonLd()`. Conținutul RU învelit în `<div lang="ru">` (layout-ul rădăcină
   rămâne unic, ca ISR-ul să nu devină dinamic).
4. **`public/og.png`** 1200×630 generat o dată cu `sharp` (există în node_modules) din
   `translux-logo-red.png` pe fundal alb; script în scratchpad, nu în repo.
5. **`app/robots.ts`**: allow `/`, disallow `/api/`; `sitemap`. Fără `/verificare` în robots.
   **`(public)/verificare/layout.tsx`**: `metadata.robots = {index:false, follow:false}`.
6. **`src/lib/route-pages.ts`** (server): `getRoutePairs()` și `getRouteTimetable(fromSlug, toSlug)` (slug-uri validate de `parsePair`; `name_ro` canonic din `MAJOR`)
   în `unstable_cache` 1 h. Citesc cu `select()` explicit doar crm_routes, crm_stop_fares
   (`.in('name_ro', MAJOR)`), `v_interurban_v2_km_pairs` (chei `normalizeStop`), tariff_periods,
   offers — NU daily_assignments/șoferi/vehicule, NU search_log. **La orice `error` Supabase
   aruncă** (nu întoarce `[]`): nimic nu intră în cache, ISR-ul servește pagina veche.
   Oferta: potrivire exactă pe sens `from==fromRo && to==toRo` (fără majuscule),
   preț `resolveOfferPriceForDate(offer, rateLong_azi)`; «de la» = min(preț ofertă | preț cursă).
   Preț 0/rate null → prețul nu se afișează.
7. **Pagina de direcție** `app/ro/autobuz/[pair]/page.tsx`, `app/ru/avtobus/[pair]/page.tsx`
   (componentă server comună `components/route-page.tsx`):
   - Ordinea: `parsePair(pair)` (listă statică) → null ⇒ `notFound()` ÎNAINTE de orice DB; apoi
     `getRouteTimetable(from.slug, to.slug)` (și în `generateMetadata`); 0 plecări (citire reușită) ⇒ `notFound()`.
   - `revalidate = 3600`, `generateStaticParams` → `[]`.
   - `generateMetadata`: title «Autobuz Chișinău – Briceni: orar și preț» (RU «Автобус Кишинёв –
     Бричаны: расписание и цена») — FĂRĂ sumă în titlu; description cu nr. curse, prima/ultima
     plecare, durata segmentului, «de la N lei»; canonical + hreflang ro/ru/x-default.
   - Conținut: H1, paragraf din date, tabel plecare/sosire/durată segment/«cursa spre», link
     «Retur», alte direcții din același hub, buton «Vezi cursele pe o dată (cu șoferul)» →
     `homePath?dela=<slug>&spre=<slug>`, telefon, notă «orarul se poate schimba de sărbători;
     cursa pe data aleasă o vezi la căutare». Wrapper `lang` pe locale.
   - JSON-LD BreadcrumbList prin `jsonLd()`.
8. **`app/sitemap.ts`**: `/`, `/ru`, legal ro/ru, paginile de direcție ro+ru cu
   `alternates.languages`; `revalidate = 3600`; try/catch DOAR în jurul `getRoutePairs` (fallback
   pe paginile fixe, pentru build fără env).
9. **Middleware** (subțire, logica în `seo.ts`):
   (a) host `www.translux.md` → **308** pe `https://translux.md` + același path/query (308 păstrează
   POST-ul server action-urilor); comentariu: nu se pune redirect apex→www în Vercel.
   (b) `transportlux.com`/www: dacă path-ul e `/(ro|ru)/search/x/y` → direct ținta finală
   (un singur hop), altfel ca acum.
   (c) `/(ro|ru)/search/<de>/<spre>` pe translux.md → 301 pe `legacySearchTarget`.
10. **Pagina principală**: rândurile «Destinații populare» sunt link DOAR dacă perechea e în
    `getRoutePairs()` (setul de căi, trimis ca prop; Larga/Grimăncăuți rămân text); bloc nou
    «Toate rutele TRANSLUX» (h2 + linkuri hub→major din `getRoutePairs`, prop minimal
    `{href,label}`); numele RU din POPULAR_ROUTES aliniate la `localities.name_ru`; logo și
    comutatorul RO duc la `homePath` (`/`); `?dela=&spre=` citit din `window.location.search` într-un
    `useEffect` → preselectează select-urile (slug → `name_ro` prin `MAJOR`), **fără** a porni
    căutarea (`runSearch` rămâne doar pe clic).
11. **Gate-uri**: build-packages, typecheck-web, test-web, build-web; smoke local cu `next start` +
    `.env`; commit, push `HEAD:main`, deploy translux-web cu scriptul proiectului; verificare pe prod.

## Fișiere

| Cale | Ce |
|---|---|
| `apps/web/src/lib/seo.ts` (+`seo.test.ts`) | nou: constante, MAJOR, slugify, parsePair, legacySearchTarget, jsonLd |
| `apps/web/src/lib/timetable.ts` (+`timetable.test.ts`) | nou: nucleul pur al orarului |
| `apps/web/src/app/(public)/actions.ts` | searchTrips folosește timetable.ts; POPULAR_ROUTES nume RU |
| `apps/web/src/lib/route-pages.ts` | nou: perechi + orar (read-only, anon, throw la eroare) |
| `apps/web/src/components/route-page.tsx` | nou |
| `apps/web/src/app/ro/autobuz/[pair]/page.tsx`, `app/ru/avtobus/[pair]/page.tsx` | noi |
| `apps/web/src/app/robots.ts`, `app/sitemap.ts` | noi |
| `apps/web/src/app/layout.tsx`, `page.tsx`, `ro/page.tsx`, `ru/page.tsx` | metadate, JSON-LD, prop rute |
| `apps/web/src/app/(public)/verificare/layout.tsx` | nou: noindex |
| `apps/web/src/middleware.ts` | www→apex 308, /search vechi, un hop de pe transportlux |
| `apps/web/src/components/home-page.tsx` | linkuri, «Toate rutele», ?dela&spre, lang |
| `apps/web/public/og.png` | nou |

Fără migrații. Fără schimbări în `apps/admin`, bot, packages.

## Riscuri

- **Refactorul searchTrips schimbă căutarea** — acoperit de `timetable.test.ts` pe fixture real
  + smoke: căutarea Chișinău→Briceni pe mâine înainte/după pe `next start` local (aceleași ore, prețuri).
  Rezervă: revert commit.
- **Buclă www** — middleware redirecționează doar host == `www.translux.md` spre constantă; www dă
  azi 200 (fără redirect Vercel). Verificare: `curl -sIL` pe ambele gazde, lanț ≤1.
- **Cădere Supabase** — funcțiile aruncă, nu memorează `[]`; ISR servește vechiul HTML.
- **Pagini subțiri** — fiecare are ore/preț/număr propriu; perechile fără plecări → 404.
- **Build fără env** — `generateStaticParams` `[]`, sitemap cu fallback.
- **Bot-uri pe `[pair]` aleator** — respinse de `parsePair` înainte de DB/cache.
- **Cota Vercel** — un push, un deploy translux-web.
- **Preț în snippet învechit** — suma nu e în titlu, doar în description (se actualizează la recrawl).

## Verificare

- Gate-uri PROFILE: build-packages, typecheck-web, test-web, build-web.
- Local `next start` (env din `apps/web/.env`), apoi pe prod după deploy:
  - `robots.txt` 200 cu `Sitemap:`; `sitemap.xml` 200, conține `/ro/autobuz/chisinau-briceni` și `/ru/avtobus/chisinau-briceni`.
  - `curl -sI https://www.translux.md/ru` → 308 `location: https://translux.md/ru`; `curl -sIL` lanț ≤1.
  - `/ro/search/chisinau/lipcani` → 301 → `/ro/autobuz/chisinau-lipcani` 200; `Lipcani/Chi%C5%9Fin%C4%83u` → `/ro/autobuz/lipcani-chisinau`; `/ro/search/%E0%A4%A/x` → 301 `/` (nu 500).
  - HTML `/`: `<title>` nou, canonical `https://translux.md`, hreflang ro/ru/x-default, `ld+json`.
  - `/ro/autobuz/chisinau-briceni`: H1, tabel ≥1 rând, «de la» = prețul din «Destinații populare».
  - `/ro/autobuz/balti-chisinau` arată oferta; `/ro/autobuz/chisinau-balti` nu.
  - Fiecare href din «Destinații populare» și «Toate rutele» → 200.
  - `/ro/autobuz/chisinau-xyz` → 404; `/verificare/login` are `noindex`.
  - Căutarea de pe `/` (Chișinău→Briceni, mâine) întoarce aceleași curse ca înainte de refactor.
- Pentru Ion după deploy: Google Search Console (verificare domeniu + trimite sitemap);
  Google Business Profile TRANSLUX cu site și telefon.

## Review: security-auditor (runda 1)

Scor: 7.7 · Blocante (critical/high): 0. Observații: 1 medium JSON-LD fără escaparea `<`;
2 low `decodeURIComponent` → 500; 3 low disallow+noindex se anulează; 4 low `[pair]` validat
înainte de DB/cache; 5 low buclă www / redirect din Vercel. Toate acceptate → pașii 1, 5, 7, 9.

## Review: senior-backend-engineer (runda 1)

Scor: 1.0 · Blocante (critical/high): 2. HIGH 1: eroarea DB memorată ca `[]` → 404 pe 92 pagini
o oră → acceptat (pas 6: throw). HIGH 2: Larga/Grimăncăuți din «Destinații populare» → 404 →
acceptat (pas 10: link doar dacă perechea există). MEDIUM: logică copiată + durata întregii rute →
acceptat (pas 2: extragere `timetable.ts`, durata segmentului). MEDIUM: decode → 500 → acceptat.
LOW: useSearchParams → `window.location` în useEffect; `lang` → wrapper `<div lang>`;
disallow+noindex; www 301 prinde POST → 308; linkuri spre `/ro` → `homePath`; titlu lung/nume RU
inconsecvente → `title.absolute`, nume din DB. Toate acceptate.

## Review: business-logic-auditor (runda 1)

Scor: 7.0 · Blocante (critical/high): 2. HIGH 1: linkuri 404 Larga/Grimăncăuți → acceptat (pas 10).
HIGH 2: filtre copiate vor diverge → acceptat (pas 2, nucleu comun + test pe rutele 2, 8, 13, 16).
MEDIUM: `'00:00'` și miezul nopții → acceptat (pas 2). MEDIUM: oferta pe sens exact → acceptat
(pas 6). LOW: suma în titlu se învechește → acceptat (pas 7). LOW: nume RU → acceptat.
LOW: middleware static → 404 dacă direcția rămâne fără curse → acceptat parțial: pagina 404 are
link spre `/`; lista statică rămâne (edge fără DB) — risc rezidual mic.

**Partea Claude după corecții:** toate cele 4 HIGH acceptate și corectate în plan; 0 deschise.

## Critic extern - runda 1

Codex: 6.0 (raportat 7.0, recalculat) · fail · 1 high.

| id | severitate | esență | decizie | motiv |
|---|---|---|---|---|
| C1 | high | build fără env / fără DB pe paginile principale; `getRoutePairs` adaugă încă o dependență care aruncă | **Acceptat** | Corecție la pasul 10: paginile `/`, `/ro`, `/ru` cheamă `getRoutePairs().catch(() => [])` — eroarea nu intră în cache-ul de date (catch-ul e în afara `unstable_cache`), pagina se randează fără blocul de linkuri (nicio legătură ruptă, nimic 404) și se reface la următoarea revalidare. Citirile existente (`getCachedLocalities`, `getCachedPopularPrices`) rămân cum sunt azi — comportament preexistent, în afara obiectului. Fapt: build-ul real (gate build-web și Vercel translux-web) rulează cu env (`apps/web/.env`, env-ul proiectului Vercel); Verificare: `next build` local verde. |
| C2 | medium | nucleul extras e testat, compoziția searchTrips (azi/mâine/+7, șofer, ofertă) nu | **Acceptat** | Pas nou 2b: test diferențial pe date reale — script în scratchpad care importă `actions.ts` de la `origin/main` (copie temporară) și cel nou, cu clientul Supabase comun în care `search_log.insert` e înlocuit cu no-op (nu murdărim analiza), și compară JSON-ul `searchTrips` câmp cu câmp (price, originalPrice, duration, isAwaitingDriver, driver, time, arrivalTime) pe: Chișinău↔Briceni, Chișinău↔Lipcani, Bălți↔Chișinău (oferta), Chișinău↔Orhei, Criva→Bălți; date: azi, mâine, +3, +9. Criteriu: identic. Copia temporară se șterge. |

## Critic extern - runda 2

Codex: 6.0 (raportat 6.5, recalculat) · fail · 1 high. C1, C2 rămân închise (C2: test diferențial rulat — 32 căutări, 567 curse, 0 diferențe).

| id | severitate | esență | decizie | motiv |
|---|---|---|---|---|
| C3 | high | contractul `getRouteTimetable(fromRo,toRo)` din plan ≠ implementarea (slug) | **Acceptat** | Planul se aliniază la cod: `getRouteTimetable(from.slug, to.slug)` peste tot (pagină + `generateMetadata`, `components/route-page.tsx` `load()`/`routeMetadata()` cheamă deja cu slug-urile din `parsePair`); numele canonic `name_ro` se ia din `MAJOR` în `computeTimetable`. Verificare: pagina `/ro/autobuz/chisinau-briceni` 200 cu tabel pe `next start`. |
| C4 | medium | `getRoutePairs` = 92 cereri km | **Acceptat** | `loadHubKmPairs()`: 2 cereri (`from_stop ∈ hub, to_stop ∈ majore` + `from_stop ∈ non-hub, to_stop ∈ hub`, fără suprapunere); 238 rânduri azi (SQL), sub plafonul 1000. Total `getRoutePairs` = 4 cereri, o dată pe oră. |

## Critic extern - runda 3

Codex: 10.0 · **pass** · 0 critical/high. Nicio observație nouă. Notă: verdictul validează planul; middleware-ul era încă în lucru în momentul citirii (implementat ulterior, pas 9).

## Gate

| Partea | Scor | critical/high deschise |
|---|---|---|
| Claude — minimul revizorilor (runda 1, înainte de corecții) | 1.0 | 0 (4 acceptate și corectate) |
| Codex — critic extern | 6.0 → 6.0 → 10.0 | 0 |
