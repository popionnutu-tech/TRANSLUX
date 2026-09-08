---
kit: spec
name: peron-app-design
title: Aplicația de peron arată 1:1 ca mockup-ul TRANSLUX
created: 2026-09-08
sessions:
  - id: S01
    title: Tema și componentele după mockup + ecranele Conectare și Ziua (Chișinău și Bălți)
    gates: [typecheck-app]
    approve: []
  - id: S02
    title: Ecranele Cursa (Chișinău și Bălți) și Curățenie după mockup
    gates: [typecheck-app]
    approve: []
  - id: S03
    title: Verificare vizuală pe cod, export JS, raport
    gates: [typecheck-app]
    approve: []
---

# Aplicația de peron arată 1:1 ca mockup-ul TRANSLUX

## De ce

Ion a instalat APK-ul și a văzut că ecranele nu seamănă cu mockup-ul aprobat: «designul
la aplicație nu este cel de pe mockup, el trebuie să fie 1 în 1 ca la TRANSLUX». Tema
actuală (`peron-android/src/theme.ts`) e albastru generic pe alb. Mockup-ul aprobat este în
`docs/design/peron-android/*.dc.html` (șase ecrane, HTML cu stiluri inline, exact
culorile și dimensiunile). Ținta: fiecare ecran al aplicației reproduce artboard-ul
corespunzător, element cu element, cu valorile numerice din HTML, nu «în spirit».

## Decizii fixate înainte de start

- **Sursa de adevăr e HTML-ul din `docs/design/peron-android/`**: `Login.dc.html` →
  `app/login.tsx`; `Main.dc.html` → `app/day.tsx` (Chișinău); `ZiuaBalti.dc.html` →
  `app/day.tsx` (Bălți); `Cursa.dc.html` → `app/trip/[id].tsx` (Chișinău);
  `CursaBalti.dc.html` → `app/trip/[id].tsx` (Bălți); `Curatenie.dc.html` →
  `app/cleaning.tsx`. Se citește fiecare `style="…"` și se transpune în StyleSheet cu
  aceleași numere. Nimic nu se «îmbunătățește» față de mockup; ce nu e în mockup nu se
  adaugă.
- **Tokenii** (din HTML, se pun în `theme.ts` și se folosesc peste tot):
  - fundal ecran `#f4f0ed`; card `#ffffff` cu bordură `1px #e6e2de`, rază 14, padding 16,
    gap 12; text principal `#1f1a1b`; secundar `#666`; discret `#6b6560`; bordură
    neutră `#ddd9d5`;
  - bordo TRANSLUX `#9B1B30` (butoane principale, cursa «următoare», progres, accente),
    bordo închis `#7a1526` (text pe fundal roz `#fbe9ec`);
  - verde selectat: fundal `#e8f3ea`, bordură `#16a34a`, text `#1f6b34`; verde
    «cursă făcută»: fundal `#e8f3ea`, bordură `#b7dcc1`, text `#1f6b34`;
  - galben avertisment: fundal `#fff7e6`, bordură `#f0c674`, text `#8a4500`;
  - roșu: `#b91c1c`, fundal `#fbe9ec`, bordură `#e4a3ad`;
  - cameră/previzualizare: `#2a2426`, text pe ea `#cfc7c9`;
  - raze: card 14, buton 12, opțiune 10, pastilă 999; umbra butonului principal
    `0 4px 12px rgba(155,27,48,0.35)` (pe Android: `elevation: 4` + `shadowColor`).
- **Font: Open Sans** (400, 600, 700, 800) prin `@expo-google-fonts/open-sans` +
  `expo-font`, încărcat în `app/_layout.tsx` (splash până se încarcă). Placa auto în
  «JetBrains Mono» nu se instalează — se folosește `fontFamily: 'monospace'` cu
  `letterSpacing: 1`, ca în mockup.
- **Dimensiuni** (din HTML): titlu ecran 24–26 / 800; etichetă secțiune 13 / 700,
  majuscule, `letterSpacing 1.5`, culoare `#666`; întrebare 17 / 700; buton principal
  înălțime 60–64, text 20–21 / 700–800, alb; opțiune (segment) `minHeight 52`, text 15,
  600 (700 când e selectată), bordură 2; celulă din grilă înălțime 64, 4 coloane, gap 8,
  text 17 / 700 (18 / 800 pe cea următoare); câmpul de pasageri 72 înalt (96 la Bălți),
  cifra 40 / 800 (52 la Bălți), butoanele −/+ late 64 (72 la Bălți), cifra 30 / 700;
  bara de progres 8 înaltă, rază 4; rândul GPS: pin 22 + text 15 / 600 verde;
  săgeata înapoi în zonă de 44×44 cu `marginLeft -8`.
- **Pictograme:** inline SVG prin `react-native-svg` (aceleași trasee ca în HTML: pin,
  cameră, bifă, X, play, săgeată înapoi, declanșator). Fără emoji în UI.
- **Textele** sunt exact cele din mockup (inclusiv «Informația se stochează și va fi
  penalizată.», «Propus automat din poză. Atinge un verdict ca să-l corectezi.»,
  «Fără șofer, auto sau verificări: la Bălți se numără doar pasagerii.»), cu datele
  reale în locul exemplelor (data zilei, numele operatorului din `/day`, orele curselor,
  numele șoferului, placa).
- **Antetul ecranului zilei**: rând cu «TRANSLUX · CHIȘINĂU» (14 / 600, bordo,
  `letterSpacing 2`) peste data în română («Luni, 8 septembrie», 24 / 800) și numele
  operatorului la dreapta (15 / 600, `#666`). Data se formatează local, fără bibliotecă
  (nume de zile și luni în română într-o constantă).
- **Cursa la Chișinău** e un singur ecran cu scroll, în ordinea din `Cursa.dc.html`:
  antet cu pastila de întârziere, card Pasageri (−/cifră/+ și butonul «Microbuzul a
  fost absent»), card Șofer și auto (nume, placă mono, «Confirm»/«Schimbă»), card Poza
  șoferului (miniatură 104×128 pe `#2a2426`, două verdicte 52 înalte, textul de sub și
  «Refă poza» 44 înalt), card Verificări (etichetă «VERIFICĂRI · TOTUL E BIFAT OK,
  SCHIMBĂ DOAR CE NU E», întrebările în ordinea: Ajută la încărcat?, Auto exterior
  curat?, Reclamă cu cardul galben «Era marcat defect… A fost reparat?», Clima în
  salon cu textul de sub), rândul GPS, butonul «Trimite raportul» 64.
- **Cursa la Bălți** exact `CursaBalti.dc.html`: antet cu «Bălți → Chișinău», card
  Pasageri cu butoanele rapide 5/10/15/20/25, rândul «Absent» / «Microbuzul full»,
  rândul GPS, «Trimite raportul», textul de jos.
- **Ziua**: banner galben cu camera când setul de curățenie al turei lipsește (textul
  «Pozele de la 15:00 lipsesc. Sunt obligatorii înainte de cursa 16:25.» respectiv
  varianta de dimineață «Pozele de dimineață lipsesc. Sunt obligatorii înainte de cursa
  06:55.»), **fără rând GPS** (Ion, 08.09: «nu trebuie rândul GPS» — urmărirea merge în
  fundal fără indicator pe ecran; mockup-ul a fost actualizat), grila 4 coloane, spațiu,
  butonul contur bordo «Poze curățenie» cu cameră (doar Chișinău; la Bălți, textul
  «La Bălți se raportează doar numărul de pasageri. Locația pleacă automat.»).
- **Curățenie**: antet «Curățenie · 15:00» / «Curățenie · dimineață» + «N din 3 zone
  trimise»; un card per zonă în ordinea PERON, PIETONI, VECEU: închisă-curat (bordură
  `#b7dcc1`, cerc verde cu bifă, descrierea în verde), închisă-murdar (bordură
  `#e4a3ad`, cerc roz cu X, «MURDAR», lista cu «·», caseta roz cu textul de penalizare),
  zona activă (bordură bordo 2, umbră, cerc punctat, hint-ul de cadru, previzualizarea
  camerei 200 înaltă, «Fă poza» 64 cu declanșator), zonele viitoare ca cardul activ dar
  fără cameră și fără umbră. Textul de jos «Pozele se păstrează 30 de zile…».
- **Login**: exact `Login.dc.html`: wordmark «TRANSLUX» 34 / 800, `letterSpacing 3`,
  bordo; «Peron Chișinău» devine «Peron» (punctul nu e cunoscut înainte de conectare);
  6 casete de 64 cu bordură bordo pe cele completate și cursor (bară 3×34 bordo) pe
  cea curentă; «Conectează» 60; cardul cu pinul și explicația permisiunilor; textul de
  jos «versiunea 1.0».
- Logica ecranelor nu se schimbă: aceleași apeluri API, aceleași stări, aceleași
  teste (`npm test` în aplicație rămâne verde). Se schimbă doar prezentarea.

## Nu intră în scop

- Funcționalitate nouă, ecrane noi, schimbări de API.
- Pictogramă și splash pentru aplicație (rămân cele implicite).
- Mod întunecat, iOS.

## Riscuri și necunoscute

- **`@expo-google-fonts/open-sans` și `react-native-svg`** trebuie instalate în
  `peron-android/` (nu în root). Versiunea de `react-native-svg` compatibilă cu Expo 52
  se ia cu `npx expo install react-native-svg`. Dacă `expo install` nu merge offline,
  se pune versiunea recomandată de Expo 52 (`15.8.x`) în `package.json`.
- **Umbrele** pe Android sunt `elevation`; nuanța bordo nu se poate reproduce exact —
  se folosește `elevation: 4` + `shadowColor: '#9B1B30'`. Nu e HOLD.
- **Lățimea telefonului** diferă de cei 390 px ai mockup-ului; layout-ul e fluid
  (flex, procente), dimensiunile fixe rămân cele din mockup.
- Dacă un element din mockup nu are corespondent în starea aplicației (ex. perioadele
  de lipsă din rândul GPS), se afișează ce există (fereastra turei) — notat în raport.

## Cum înțelegem că totul a reușit

- [ ] `theme.ts` conține exact tokenii de mai sus și nicio culoare veche (`#1d4ed8`,
      `#f3f4f6`, `#d1d5db`) nu mai apare în `peron-android/src` sau `app`.
- [ ] Fontul Open Sans e încărcat în `_layout.tsx` și folosit implicit de `Body`,
      `Title`, butoane.
- [ ] Fiecare din cele 6 artboard-uri are ecranul corespunzător cu aceeași ordine de
      elemente, aceleași texte, aceleași culori și dimensiuni (verificat în S03 printr-un
      tabel element ↔ StyleSheet).
- [ ] `cd peron-android && npx tsc --noEmit` și `npm test` verzi; `npx expo export
      --platform android` verde.
- [ ] `bash peron-android/build-apk.sh` produce un APK nou (rulat de dirijor după S03).

---

## S01 — Tema și componentele după mockup + ecranele Conectare și Ziua

**Scop:** tema, fontul și componentele reproduc mockup-ul, iar ecranele de conectare și
ziua (Chișinău și Bălți) arată ca `Login.dc.html`, `Main.dc.html`, `ZiuaBalti.dc.html`.

**Pași:**
1. Citește cele trei fișiere HTML integral; notează fiecare `style` și text.
2. `peron-android/package.json`: adaugă `@expo-google-fonts/open-sans`, `expo-font`,
   `react-native-svg` (`npx expo install …`); `npm install`.
3. `src/theme.ts`: rescrie cu tokenii din «Decizii» (`colors`, `radius`, `font`
   cu numele familiilor `OpenSans_400Regular` … `OpenSans_800ExtraBold`, `sizes`).
4. `src/icons.tsx`: componente SVG `PinIcon`, `CameraIcon`, `CheckIcon`, `XIcon`,
   `PlayIcon`, `BackIcon`, `ShutterIcon`, `PersonIcon`, cu `size` și `color`, traseele
   copiate din HTML.
5. `src/components.tsx`: `Screen` (fundal `#f4f0ed`, padding 56/16/20), `Header`
   (variantele: zi și ecran cu săgeată înapoi), `Card`, `Label` (eticheta de secțiune),
   `Question`, `PrimaryButton` (60/64, bordo, umbră), `OutlineButton` (bordură bordo 2,
   text bordo), `Option` + `OptionRow` (segment; selectat = verde), `GridCell`
   (`done` / `next` / `locked` cu valorile din mockup), `ProgressBar`, `Banner`
   (galben cu cameră), `GpsRow` (verde «În zona de lucru · GPS activ» + text mic; stări
   «În afara zonei» roșu, «GPS oprit» gri), `Footnote` (14 / `#6b6560`, centrat).
   Păstrează API-ul funcțional al componentelor existente (`OptionGroup`, `BigButton`,
   `YES_NO`) ca aliasuri, ca ecranele S02 să compileze până sunt rescrise.
6. `app/_layout.tsx`: încarcă fonturile (`useFonts`), ține splash-ul până se încarcă.
7. `app/login.tsx` după `Login.dc.html`; `app/day.tsx` după `Main.dc.html` /
   `ZiuaBalti.dc.html` (antet, progres, banner condiționat, grilă, buton; fără rând GPS).
   Data în română din `src/format.ts` (`formatDayRo(date)` → «Luni, 8 septembrie»),
   cu test în `npm test`.

**Fișiere:** `peron-android/package.json`, `package-lock.json`, `src/theme.ts`,
`src/icons.tsx`, `src/components.tsx`, `src/format.ts` (+ test), `app/_layout.tsx`,
`app/login.tsx`, `app/day.tsx`.

**Gata când:** typecheck-app verde; `npm test` verde; `grep -rn "#1d4ed8\|#f3f4f6"
peron-android/src peron-android/app` gol; `grep -c "OpenSans" peron-android/app/_layout.tsx`
≥ 1; `npx expo export --platform android` verde.

**Gate-uri:** typecheck-app.

**Nu atinge:** `app/trip/`, `app/cleaning.tsx` (doar să compileze), `apps/*`.

---

## S02 — Ecranele Cursa (Chișinău și Bălți) și Curățenie după mockup

**Depinde de:** S01 — tema, pictogramele, componentele.

**Scop:** `app/trip/[id].tsx` reproduce `Cursa.dc.html` la Chișinău și `CursaBalti.dc.html`
la Bălți; `app/cleaning.tsx` reproduce `Curatenie.dc.html`.

**Pași:**
1. Citește cele trei HTML-uri integral.
2. `app/trip/[id].tsx`: rescrie prezentarea cu componentele din S01, în ordinea și cu
   textele din «Decizii»; logica (`buildReport`, camera, GPS, apelurile API) rămâne.
   Pastila «întârziere N min» apare doar când `late > 10`. Verdictele pozei șoferului:
   verde «Uniformă: da» / roșu «Uniformă: nu» (fundal `#fbe9ec`, bordură `#e4a3ad`,
   text `#b91c1c`, X în loc de bifă), la fel «Aspect îngrijit». Cardul galben de
   reparare doar când există sarcină deschisă pe auto și s-a ales «Totul OK».
3. Varianta Bălți în același fișier, după `day.point`.
4. `app/cleaning.tsx`: cardurile per zonă conform stărilor din «Decizii»; camera
   (`src/camera.tsx`) se deschide pe tot ecranul la «Fă poza»; previzualizarea din card
   arată ultima poză făcută pentru zona activă sau placeholder-ul cu camera.
5. Elimină stilurile vechi rămase în aceste fișiere; nicio culoare în afara `theme.ts`.

**Fișiere:** `peron-android/app/trip/[id].tsx`, `app/cleaning.tsx`, `src/camera.tsx`
(doar aspectul ecranului camerei: buton declanșator 72 alb cu inel, «Refă» / «Trimite»),
eventual `src/components.tsx` (componente lipsă).

**Gata când:** typecheck-app verde; `npm test` verde; `grep -rn "#[0-9a-fA-F]\{6\}"
peron-android/app` întoarce doar valori identice cu cele din `theme.ts` (sau nimic);
`npx expo export --platform android` verde.

**Gate-uri:** typecheck-app.

**Nu atinge:** `src/api.ts`, `src/buildReport.ts`, `src/cleaning.ts`, `src/presence.ts`,
`apps/*`.

---

## S03 — Verificare vizuală pe cod, export JS, raport

**Depinde de:** S01, S02.

**Scop:** dovada, element cu element, că fiecare ecran urmează artboard-ul, plus un
export JS verde pentru build.

**Pași:**
1. Pentru fiecare artboard, fă un tabel: element din HTML (cu stilul lui) → componenta
   / StyleSheet din aplicație (cu valorile). Orice diferență numerică se corectează
   aici.
2. `grep` pentru culori vechi și pentru emoji în `app/` și `src/` (niciun emoji în UI).
3. `npx tsc --noEmit`, `npm test`, `npx expo export --platform android`.
4. Scrie `docs/specs/peron-app-design.verificare.md` cu tabelele și ce n-a putut fi
   reprodus exact (umbra, fontul mono) și de ce.

**Fișiere:** `docs/specs/peron-app-design.verificare.md`; corecții mici în `app/`, `src/`.

**Gata când:** raportul există cu 6 tabele; gate-ul verde; `git status` curat (în afara
fișierelor altor sesiuni).

**Gate-uri:** typecheck-app.

**Nu atinge:** nimic în afara corecțiilor vizuale.
