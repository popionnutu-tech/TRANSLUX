# Aplicația de peron ↔ mockup-ul TRANSLUX — verificarea element cu element (S03)

Data: 2026-09-08. Sursa de adevăr: `docs/design/peron-android/*.dc.html` (șase artboard-uri).
Aplicația: `peron-android/app/*.tsx`, `peron-android/src/components.tsx`, `src/theme.ts`, `src/icons.tsx`.

Cum s-a verificat: fiecare `style="…"` din HTML a fost citit și comparat cu StyleSheet-ul
componentei care îl redă (numerele de mai jos sunt cele din cod, nu din memorie). Culorile
din coloana «aplicație» sunt tokenii din `theme.ts`, cu valoarea hex între paranteze.
`weight(n)` = `fontFamily: OpenSans_<n>` (pe Android fontul custom nu ascultă de `fontWeight`).
`line-height` procentual din HTML e transpus în pixeli rotunjiți (15 × 1.4 = 21; 14 × 1.4 ≈ 20;
16 × 1.45 ≈ 23; 15 × 1.45 ≈ 22; 15 × 1.2 = 18).

Legendă: ✓ identic · ≈ echivalent pe Android (explicat în secțiunea «Ce nu s-a putut reproduce
exact») · ◇ decizie pentru o stare pe care mockup-ul n-o are.

## Tokenii (`theme.ts`)

| Mockup | `theme.ts` | |
|---|---|---|
| fundal `#f4f0ed` | `colors.bg` | ✓ |
| card `#ffffff`, bordură `#e6e2de` | `colors.card`, `colors.cardBorder` | ✓ |
| text `#1f1a1b` / `#333` / `#666` / `#6b6560` | `text` / `textSoft` / `muted` / `faint` | ✓ |
| bordură neutră `#ddd9d5` | `colors.border` | ✓ |
| bordo `#9B1B30`, închis `#7a1526`, roz `#fbe9ec` | `primary`, `primaryDark`, `pinkBg` | ✓ |
| selectat `#e8f3ea` / `#16a34a` / `#1f6b34` | `selectedBg` / `selectedBorder` / `selectedText` | ✓ |
| cursă făcută `#e8f3ea` / `#b7dcc1` / `#1f6b34` | `doneBg` / `doneBorder` / `doneText` | ✓ |
| galben `#fff7e6` / `#f0c674` / `#8a4500`, cameră `#d97706` | `warningBg` / `warningBorder` / `warningText` / `warningIcon` | ✓ |
| roșu `#b91c1c` / `#fbe9ec` / `#e4a3ad` | `danger` / `dangerBg` / `dangerBorder` | ✓ |
| cameră `#2a2426`, text `#cfc7c9` | `camera` / `cameraText` | ✓ |
| raze 14 / 12 / 10 / 999, progres 4 | `radius.card/button/option/pill/progress` | ✓ |
| umbre `0 4px 12px .35`, `0 4px 10px .35`, `0 4px 14px .15` | `shadowPrimary` (elevation 4), `shadowNext` (4), `shadowCard` (3) | ≈ |
| Open Sans 400/600/700/800 | `useFonts` în `app/_layout.tsx`, splash până se încarcă | ✓ |
| «JetBrains Mono», letterSpacing 1 | `font.mono = 'monospace'`, `letterSpacing: 1` | ≈ |

Culorile vechi (`#1d4ed8`, `#f3f4f6`, `#d1d5db`, `#e5e7eb`) nu mai apar nicăieri în `app/` și `src/`
(grep gol). În `app/` nu există nicio culoare hex în cod — singurele apariții sunt în comentarii și
sunt valori din `theme.ts`.

## 1. `Login.dc.html` → `app/login.tsx`

| Element din HTML | Stil în HTML | Aplicație | |
|---|---|---|---|
| ecranul | padding 96 24 40, gap 40, fundal `#f4f0ed` | `Screen padding={{top:96, side:24, bottom:40}} gap={40}` | ✓ |
| blocul wordmark | column, gap 6, align flex-start | `styles.brand` gap 6, alignItems flex-start | ✓ |
| «TRANSLUX» | 34 / 800, letterSpacing 3, `#9B1B30`, line-height 1 | `wordmark` 34, weight(800), letterSpacing 3, primary, lineHeight 34 | ✓ |
| «Peron Chișinău» | 18 / 600, `#666` | `brandSub` 18, weight(600), muted; textul e «Peron» (punctul nu e cunoscut înainte de conectare — decizie din spec) | ✓ |
| secțiunea codului | column, gap 14 | `section` gap 14 | ✓ |
| «Cod de conectare» | 20 / 700, `#1f1a1b` | `sectionTitle` 20, weight(700), text | ✓ |
| «Șase cifre, de la administrator…» | 16, `#666`, line-height 1.45 | `sectionText` 16, weight(400), muted, lineHeight 23 | ✓ |
| grila de 6 casete | 6 coloane egale, gap 8 | `boxes` row gap 8, fiecare `box` `flex: 1` | ✓ |
| caseta completată | 64, alb, bordură 2 `#9B1B30`, rază 10 | `box` height 64, card, borderWidth 2, radius.option; borderColor primary când are cifră sau cursor | ✓ |
| cifra | 30 / 700, `#1f1a1b` | `digit` 30, weight(700), text | ✓ |
| cursorul | 3 × 34, `#9B1B30`, rază 2 | `cursor` width 3, height 34, primary, borderRadius 2 | ✓ |
| caseta goală | bordură 2 `#ddd9d5` | borderColor `colors.border` | ✓ |
| «Conectează» | 60, `#9B1B30`, rază 12, 20 / 700, alb, fără umbră | `PrimaryButton size="md"`: height 60, radius.button, 20, weight(700), primaryText, `shadow` = false la md | ✓ |
| cardul permisiunilor | row, gap 12, align flex-start, alb, bordură 1 `#e6e2de`, rază 12, padding 14 16 | `permissions` idem: gap 12, flex-start, card, borderWidth 1, cardBorder, radius.button, paddingVertical 14 / Horizontal 16 | ✓ |
| pinul | 24, `#9B1B30`, stroke 2 | `<PinIcon size={24} color={colors.primary} strokeWidth={2} />` | ✓ |
| textul permisiunilor | 15, `#333`, line-height 1.45 | `permissionsText` 15, weight(400), textSoft, lineHeight 22 | ✓ |
| spațiul elastic | flex-grow 1 | `<Spacer />` | ✓ |
| «Telefon: Vitalie · versiunea 1.0» | 14, `#6b6560`, centrat | `Footnote` 14, faint, center; datele reale: `Constants.deviceName`, `expoConfig.version` | ✓ |
| eroarea de conectare (fără mockup) | — | `Card tone="danger"` + `Body color={colors.danger}` | ◇ |

TextInput-ul real e invizibil (`hiddenInput`, opacity 0) și întins peste casete; casetele doar desenează.

## 2. `Main.dc.html` (Chișinău) și `ZiuaBalti.dc.html` (Bălți) → `app/day.tsx`

| Element din HTML | Stil în HTML | Aplicație | |
|---|---|---|---|
| ecranul | padding 56 16 20, gap 14 | `Screen` implicit: `sizes.screenTop/Side/Bottom` = 56 / 16 / 20, gap 14 (`paddingTop = max(56, inset+8)`) | ✓ |
| antetul | row, align flex-end, space-between | `DayHeader` → `dayHeader` row, alignItems flex-end, space-between | ✓ |
| coloana din stânga | gap 2 | `{ gap: 2 }` | ✓ |
| «TRANSLUX · CHIȘINĂU» / «TRANSLUX · BĂLȚI» | 14 / 600, `#9B1B30`, letterSpacing 2 | `kicker` 14, weight(600), primary, letterSpacing 2; textul după `day.point` | ✓ |
| «Luni, 8 septembrie» | 24 / 800, `#1f1a1b` | `dayTitle` 24, weight(800), text; `formatDayRo(day.date)` | ✓ |
| «Vitalie» / «Andrei» | 15 / 600, `#666` | `dayRight` 15, weight(600), muted; `day.user.name` (atingerea = deconectare) | ✓ |
| blocul de progres | column, gap 6 | `ProgressBar` → `{ gap: 6 }` | ✓ |
| «Completate 17 din 29» / «Urmează 15:15» | row space-between, 15 / 600, `#333`; dreapta `#9B1B30` | `progressRow` space-between; `progressText` 15, weight(600), textSoft; dreapta `color: colors.primary` | ✓ |
| bara | 8, `#e6e2de`, rază 4, overflow hidden | `progressTrack` height 8, cardBorder, radius.progress 4, overflow hidden | ✓ |
| umplerea | 8, width 59 % / 69 %, `#9B1B30`, rază 4 | `progressFill` height 8, primary, radius 4, `width: round(done/total·100)%` | ✓ |
| banner-ul (doar Chișinău) | row, gap 12, align center, `#fff7e6`, bordură 2 `#f0c674`, rază 12, padding 12 14 | `Banner` → `banner` idem: warningBg, borderWidth 2, warningBorder, radius.button, paddingVertical 12 / Horizontal 14 | ✓ |
| camera din banner | 26, `#d97706`, stroke 2.2 | `<CameraIcon size={26} color={colors.warningIcon} />` (strokeWidth implicit 2.2) | ✓ |
| «Pozele de la 15:00 lipsesc.» + rest | 15, `#1f1a1b`, line-height 1.4, începutul 700 | `Body bold=…` → `body` 15, weight(400), text, lineHeight 21; fragmentul bold weight(700) | ✓ |
| grila | 4 coloane, gap 8 | `Grid` → `grid` row wrap gap 8; lățimea celulei = (lățime − 3·8) / 4, măsurată | ✓ |
| celula `.done` | 64, `#e8f3ea`, bordură 2 `#b7dcc1`, rază 10, gap 4, 17 / 700, `#1f6b34` | `cell` height 64, radius.option, borderWidth 2 + `cellDone` doneBg / doneBorder gap 4; `cellDoneText` 17, weight(700), doneText | ✓ |
| celula `.lock` | alb, bordură 2 `#e6e2de`, 17 / 600, `#6b6560` | `cellLocked` card / cardBorder gap 4; `cellLockedText` 17, weight(600), faint | ✓ |
| celula «următoare» | `#9B1B30` fundal + bordură, gap 6, 18 / 800 alb, play 16 alb, umbră `0 4px 10px .35` | `cellNext` primary / primary gap 6; `cellNextText` 18, weight(800), primaryText; `<PlayIcon />` 16; `shadowNext` | ✓ / ≈ umbra |
| spațiul elastic | flex-grow 1 | `<Spacer />` | ✓ |
| «Poze curățenie» (Chișinău) | 60, alb, bordură 2 `#9B1B30`, rază 12, gap 10, 19 / 700 `#9B1B30`, cameră 24 stroke 2.2 | `OutlineButton` tone primary: height 60, card, borderWidth 2, primary, radius.button, gap 10, 19, weight(700), primary; `<CameraIcon size={24} color={colors.primary} />` | ✓ |
| «La Bălți se raportează doar numărul de pasageri. Locația pleacă automat.» (Bălți) | 14, `#6b6560`, centrat, line-height 1.4 | `Footnote` 14, faint, center, lineHeight 20 | ✓ |
| rândul GPS | **nu există** (Ion, 08.09) | nu există; `syncPresenceTracking` rulează în `load` fără indicator | ✓ |
| cardul de eroare / cardul de permisiune lipsă / «Nu există curse active» (fără mockup) | — | `Card tone="danger"` + «Reîncarcă» (`OutlineButton` neutral 48); `Card tone="warning"` cu `Question`, `Body`, «Deschide setările» (`PrimaryButton md`), «Cere permisiunea din nou»; `Footnote` | ◇ |

Reîncărcarea se face prin pull-to-refresh (`RefreshControl` în culoarea bordo); butoanele
«Reîncarcă» / «Deconectează» din vechiul ecran nu sunt în mockup și au fost scoase (S01).

## 3. `Cursa.dc.html` (Chișinău) → `app/trip/[id].tsx`

| Element din HTML | Stil în HTML | Aplicație | |
|---|---|---|---|
| ecranul | padding 56 16 **24**, gap 14 | `Screen padding={SCREEN_PADDING}` = `{ bottom: 24 }` | ✓ |
| antetul | row, align center, gap 12 | `Header` → `header` row, center, gap 12 | ✓ |
| săgeata înapoi | 44 × 44, marginLeft −8, arrow 28 `#9B1B30` stroke 2.4 | `backHit` 44 × 44, marginLeft −8; `<BackIcon />` 28, primary, 2.4 | ✓ |
| «Cursa 15:15» | 26 / 800, `#1f1a1b` | `headerTitle` weight(800), text, `fontSize: titleSize` = 26 (implicit) | ✓ |
| spațiul + pastila «întârziere 12 min» | flex-grow 1; 13 / 700 `#8a4500`, `#fff7e6`, bordură 1 `#f0c674`, rază 999, padding 4 10 | `right` = `<Pill>` (cu `{flexGrow:1}` înainte); `pill` warningBg, borderWidth 1, warningBorder, radius.pill, paddingVertical 4 / Horizontal 10; `pillText` 13, weight(700), warningText; apare doar la `late > LATE_THRESHOLD_MIN` | ✓ |
| `.card` | alb, bordură 1 `#e6e2de`, rază 14, padding 16, gap 12 | `Card` → `card` card, borderWidth 1, cardBorder, radius.card, padding 16, gap 12 | ✓ |
| `.label` | 13 / 700, letterSpacing 1.5, uppercase, `#666` | `Label` → `label` 13, weight(700), letterSpacing 1.5, textTransform uppercase, muted | ✓ |
| rândul contorului | row, gap 10, align stretch | `counter` row gap 10 alignItems stretch | ✓ |
| «−» / «+» | width 64, alb, bordură 2 `#ddd9d5`, rază 12, 30 / 700 `#333` | `counterButton` width 64, card, borderWidth 2, border, radius.button; `counterButtonText` 30, weight(700), textSoft | ✓ |
| cifra pasagerilor | flex-grow 1, 72, alb, bordură 2 `#9B1B30`, rază 12, 40 / 800 `#1f1a1b` | `counterField` (TextInput) flexGrow 1, height 72, card, borderWidth 2, primary, radius.button, textAlign center, 40, weight(800), text, padding 0 | ✓ |
| «Microbuzul a fost absent» | 48, bordură 2 `#ddd9d5`, rază 10, 15 / 600 `#666` | `OutlineButton tone="neutral" height={48} color={colors.muted}`: borderWidth 2, border, radius.option, 15, weight(600) | ✓ |
| — starea «absent» (fără mockup) | — | `selected selectedTone="danger"`: dangerBg / dangerBorder, text danger 700; a doua atingere revine la OK; contorul se stinge (`dimmed` 0.45) | ◇ |
| — «Microbuzul full» (fără mockup la Chișinău) | — | al doilea buton în același rând, doar când `day.allowFull` | ◇ |
| «Șofer și auto · din repartizare» | `.label` | `Label`; când s-a apăsat «Schimbă» sau nu există repartizare: «Șofer și auto» | ✓ / ◇ |
| numele + placa | column, gap 4; 20 / 700 `#1f1a1b`; 17 / 600 `#666`, mono, letterSpacing 1 | `{ gap: 4 }`; `driverName` 20, weight(700), text; `plate` 17, `font.mono`, fontWeight 600, muted, letterSpacing 1 | ✓ / ≈ fontul |
| `.seg` «Confirm» / «Schimbă» | row gap 8; `.sel` / `.opt` | `OptionRow` (gap 8) cu două `Option`; `selected={!changing}` / `selected={changing}` | ✓ |
| `.opt` | flex-grow 1, minHeight 52, alb, bordură 2 `#ddd9d5`, rază 10, padding 6 8, 15 / 600 `#333`, line-height 1.2 | `option` flexGrow 1, flexBasis 0, minHeight 52, card, borderWidth 2, border, radius.option, paddingVertical 6 / Horizontal 8; `optionText` 15, lineHeight 18, weight(600), textSoft | ✓ |
| `.sel` | `#e8f3ea`, bordură `#16a34a`, 15 / 700 `#1f6b34` | selectedBg / selectedBorder, weight(700), selectedText | ✓ |
| — «Alege șoferul» / «Alege auto» + lista (fără mockup) | — | două `OutlineButton` neutral 48 (gap 8); `PickerModal` = `Screen` + `Header` + listă de `Option` (gap 8), «Adaugă auto» într-un `Card` cu TextInput mono 60 | ◇ |
| «Poza șoferului · verdict automat» | `.label` | `Label` | ✓ |
| rândul pozei | row, gap 14, align stretch | `photoRow` row gap 14 alignItems stretch | ✓ |
| miniatura | 104 × 128, `#2a2426`, rază 12; siluetă 40 alb stroke 1.8 | `thumb` 104 × 128, camera, radius.button, overflow hidden; `<PersonIcon />` 40, primaryText, 1.8; cu poză: `Image` 104 × 128 | ✓ |
| coloana verdictelor | column, gap 8, flex-grow 1, justify center | `photoSide` flexGrow 1, flexBasis 0, gap 8, justifyContent center | ✓ |
| verdictul verde «Uniformă: da» | row, gap 10, minHeight 52, `#e8f3ea`, bordură 2 `#16a34a`, rază 10, padding 6 12; bifă 20 `#16a34a` stroke 2.6; 15 / 700 `#1f6b34` | `VerdictRow` → `verdict` row gap 10 minHeight 52 borderWidth 2 radius.option paddingVertical 6 / Horizontal 12 + `verdictYes` selectedBg / selectedBorder; `<CheckIcon />` 20, 2.6; `verdictText` 15, weight(700), selectedText | ✓ |
| — verdictul «nu» / «necunoscut» (fără mockup) | — | `verdictNo` dangerBg / dangerBorder + `<XIcon />` + text danger; `verdictUnknown` card / border, text textSoft (la verdict EROARE) | ◇ |
| rândul de sub | row, gap 10, align center | `photoFooter` row gap 10 alignItems center | ✓ |
| «Propus automat din poză. Atinge un verdict ca să-l corectezi.» | 14, `#6b6560`, line-height 1.4, flex-grow 1 | `photoNote` 14, weight(400), faint, lineHeight 20, flexGrow 1 | ✓ |
| «Refă poza» | 44, padding 0 14, bordură 2 `#ddd9d5`, rază 10, 15 / 600 `#333` | `OutlineButton tone="neutral" height={44}`: `outline` paddingHorizontal 14, borderWidth 2, border, radius.option, 15, weight(600), textSoft | ✓ |
| — «Fă poza» / «Trimite din nou poza» / «Se analizează poza…» (fără mockup) | — | `PrimaryButton size="md" shadow={false}` cu `CameraIcon` alb; același buton fără icon când serverul n-a răspuns; `ActivityIndicator` + text 14 / 600 muted | ◇ |
| «Verificări · totul e bifat OK, schimbă doar ce nu e» | `.label` (uppercase) | `Label` | ✓ |
| `.q` «Ajută la încărcat?», «Auto exterior curat?», «Reclamă», «Clima în salon» | 17 / 700, `#1f1a1b` | `Question` → `question` 17, weight(700), text | ✓ |
| `.seg` Da / Nu | row gap 8 | `OptionRow` + `Option` | ✓ |
| Reclamă: două rânduri | column gap 8, fiecare `.seg` | `{ gap: 8 }` cu două `OptionRow` (Totul OK / Doar autobuz; Doar panou rută / Ambele) | ✓ |
| caseta galbenă | column, gap 10, `#fff7e6`, bordură 2 `#f0c674`, rază 12, padding 12 14 | `Card tone="warning"` → `cardWarning` warningBg, borderWidth 2, warningBorder, radius.button, paddingVertical 12 / Horizontal 14, gap 10; apare când `reclama === 'ok'` și există sarcină deschisă | ✓ |
| «Era marcat defect: … A fost reparat?» | 15, `#1f1a1b`, line-height 1.4, începutul 700 | `Body bold="Era marcat defect:"` 15, lineHeight 21; descrierea reală a sarcinii | ✓ |
| «Da, reparat» / «Nu, încă defect» | `.seg` cu două `.opt` | `OptionRow` + `Option` | ✓ |
| Clima: «Funcționează» / «Stricat» / «Nu are» | `.seg` cu trei | `OptionRow` + trei `Option` | ✓ |
| «Vara întreabă de aerul condiționat…» | 14, `#6b6560`, line-height 1.4 (stânga) | `Footnote align="left"` 14, faint, lineHeight 20 | ✓ |
| rândul GPS | row, gap 10, align center, padding 4 6; pin 22 `#16a34a` stroke 2.2; 15 / 600 `#1f6b34` | `GpsRow` → `gps` row gap 10 center paddingVertical 4 / Horizontal 6; `<PinIcon />` 22, selectedBorder, 2.2; `gpsText` 15, weight(600), doneText | ✓ |
| — GPS «în afara zonei» / «se caută» / «fără locație» (fără mockup) | — | pin + text în `danger` («la N m de stație · în afara zonei stației», «fără locație · raportul pleacă fără GPS») sau `faint` («se caută locația…») | ◇ |
| «Trimite raportul» | 64, `#9B1B30`, rază 12, 21 / 800 alb, umbră `0 4px 12px .35` | `PrimaryButton` (size lg implicit): height 64, primary, radius.button, 21, weight(800), primaryText, `shadowPrimary` | ✓ / ≈ umbra |
| — motivul de blocare / eroarea de trimitere (fără mockup) | — | `Footnote` sub buton (butonul e la 0.45 cât e blocat); `Card tone="danger"` cu `Body` roșu și, la CLEANING_REQUIRED, «Poze curățenie» (`PrimaryButton md`) | ◇ |

Textul `missionDoneText` din alerta «Raport trimis» (după ultima cursă a zilei) avea emoji
(✦, 🌙); S03 le-a scos — mockup-ul n-are emoji în UI.

## 4. `CursaBalti.dc.html` (Bălți) → `app/trip/[id].tsx`

| Element din HTML | Stil în HTML | Aplicație | |
|---|---|---|---|
| ecranul | padding 56 16 24, gap 14 | `Screen padding={SCREEN_PADDING}` | ✓ |
| antetul: săgeată + coloană | row center gap 12; 26 / 800; subtitlu 14 / 600 `#666` | `Header title="Cursa 15:20" subtitle={trip.route_name}`; `headerSubtitle` 14, weight(600), muted | ✓ |
| «−» / «+» | width **72**, 34 / 700 `#333` | `counterButtonBalti` width 72; `counterButtonTextBalti` 34 | ✓ |
| cifra pasagerilor | **96**, 52 / 800 | `counterFieldBalti` height 96, fontSize 52 | ✓ |
| butoanele rapide 5 / 10 / 15 / 20 / 25 | 5 coloane egale, gap 8; 52, bordură 2 `#ddd9d5`, rază 10, 18 / 700 `#333` | `quickRow` row gap 8; `quick` flexGrow 1, flexBasis 0, height 52, card, borderWidth 2, border, radius.option; `quickText` 18, weight(700), textSoft; `QUICK_PASSENGERS` | ✓ |
| — butonul rapid ales (fără mockup) | — | `quickSelected` selectedBg / selectedBorder, text selectedText | ◇ |
| rândul «Absent» / «Microbuzul full» | row gap 10; fiecare flex-grow 1, 56, bordură 2 `#ddd9d5`, alb, rază 12, 16 / 700 `#333` | `statusRow` row gap 10; `OutlineButton tone="neutral" height={56} fontSize={16} fontWeight={700} borderRadius={radius.button}` cu `styles.grow`; «Microbuzul full» doar când `day.allowFull` | ✓ / ◇ |
| — starea aleasă (fără mockup) | — | «Absent» → roșu (`selectedTone="danger"`), «Microbuzul full» → verde | ◇ |
| rândul GPS | ca la Chișinău | `GpsRow` | ✓ |
| «Trimite raportul» | 64, 21 / 800, umbră | `PrimaryButton` lg | ✓ / ≈ umbra |
| spațiul + «Fără șofer, auto sau verificări: la Bălți se numără doar pasagerii. Două atingeri per cursă.» | flex-grow 1; 14, `#6b6560`, centrat, line-height 1.4 | `<Spacer />` + `Footnote` 14, faint, center, lineHeight 20 | ✓ |
| cardurile Șofer / Poza / Verificări | absente | `needsQuality(ctx, form)` = false la Bălți → nu se randează | ✓ |

## 5. `Curatenie.dc.html` → `app/cleaning.tsx`

| Element din HTML | Stil în HTML | Aplicație | |
|---|---|---|---|
| ecranul | padding 56 16 24, gap 14 | `Screen padding={{ bottom: 24 }}` | ✓ |
| antetul | săgeată 44 / 28 / 2.4; «Curățenie · 15:00» 24 / 800; «2 din 3 zone trimise» 14 / 600 `#666` | `Header titleSize={24}`; `SLOT_TITLE[slot]` («Curățenie · 15:00» / «Curățenie · dimineață»); subtitlul `${sent} din 3 zone trimise` (+ « · înainte de cursa HH:MM» când vine `gate` — ◇) | ✓ / ◇ |
| cardul zonei curate | row, gap 12, align center, alb, bordură 2 `#b7dcc1`, rază 14, padding 14 16 | `cleanCard` row gap 12 center, card, borderWidth 2, doneBorder, radius.card, paddingVertical 14 / Horizontal 16 | ✓ |
| cercul verde cu bifă | 40, rază 20, `#e8f3ea`; bifă 22 `#16a34a` stroke 2.6 | `circle` 40 / 20 + `backgroundColor: colors.doneBg`; `<CheckIcon size={22} />` (2.6) | ✓ |
| «Peron» | 18 / 700, `#1f1a1b` | `zoneTitle` 18, weight(700), text (`ZONE_TITLE`) | ✓ |
| «Curat · pavaj măturat…» | 14 / 600, `#1f6b34` | `cleanDetail` 14, weight(600), doneText; «Curat · <descrierea serverului>» | ✓ |
| — zona închisă înainte de sesiune (fără mockup) | — | același card verde cu «Trimisă» în `muted` (aplicația n-are verdictul din `/day`); la EROARE «Trimisă · verificarea automată nu a mers, o vede administratorul» | ◇ |
| cardul zonei murdare | column, gap 12, alb, bordură 2 `#e4a3ad`, rază 14, padding 14 16 | `dirtyCard` gap 12, card, borderWidth 2, dangerBorder, radius.card, paddingVertical 14 / Horizontal 16 | ✓ |
| rândul cerc + titlu | row gap 12 center | `zoneRow` | ✓ |
| cercul roz cu X | 40 / 20, `#fbe9ec`; X 22 `#b91c1c` stroke 2.6 | `circle` + `backgroundColor: colors.dangerBg`; `<XIcon size={22} />` | ✓ |
| «Zona pietoni» / «MURDAR» | 18 / 700; 14 / 700 `#b91c1c` | `zoneTitle`; `dirtyLabel` 14, weight(700), danger | ✓ |
| lista problemelor | column, gap 6, paddingLeft 52, 15 `#333`, line-height 1.4, «· …» | `problems` gap 6 paddingLeft 52; `problem` 15, weight(400), textSoft, lineHeight 21; `· ${p}` din `res.problems` | ✓ |
| caseta de penalizare | marginLeft 52, `#fbe9ec`, rază 10, padding 10 12, 14 / 700 `#7a1526`, line-height 1.4 | `penalty` marginLeft 52, pinkBg, radius.option, paddingVertical 10 / Horizontal 12; `penaltyText` 14, weight(700), primaryDark, lineHeight 20; «Informația se stochează și va fi penalizată.» | ✓ |
| cardul zonei active | column, gap 14, alb, bordură 2 `#9B1B30`, rază 14, padding 16, umbră `0 4px 14px .15` | `activeCard` gap 14, card, borderWidth 2, primary, radius.card, padding 16 + `shadowCard` | ✓ / ≈ umbra |
| cercul punctat | 40 / 20, alb, bordură 2 dashed `#9B1B30` | `dashedCircle` 40 / 20, card, borderWidth 2, borderStyle dashed, primary | ✓ |
| «Zona veceu» | 20 / 800, `#1f1a1b` | `activeTitle` 20, weight(800), text | ✓ |
| hint-ul | 15, `#666`, line-height 1.45 | `hint` 15, weight(400), muted, lineHeight 22; `ZONE_HINT[zone]` + «Poza se face doar cu camera aplicației.» | ✓ |
| previzualizarea | 200, `#2a2426`, rază 12, column, gap 8; cameră 44 alb stroke 1.8; «imaginea camerei» 13 `#cfc7c9` | `preview` height 200, camera, radius.button, center, gap 8, overflow hidden; `<CameraIcon size={44} color={colors.primaryText} strokeWidth={1.8} />`; `previewText` 13, weight(400), cameraText; cu poză: `Image` cover 200 | ✓ |
| «Fă poza» | 64, `#9B1B30`, rază 12, gap 10, 21 / 800 alb, **fără umbră**; declanșator 24 alb stroke 2.2 | `PrimaryButton shadow={false} icon={<ShutterIcon />}`: 64, radius.button, gap 10, 21, weight(800); `ShutterIcon` 24, primaryText, 2.2 | ✓ |
| — «Se verifică poza…» / «Trimite din nou» + «Refă poza» / poza respinsă (fără mockup) | — | `PrimaryButton` dezactivat; `PrimaryButton` + `OutlineButton` neutral 48; `Body color={colors.danger}` în card | ◇ |
| zona viitoare | ca cea activă, fără cameră și fără umbră | `FutureZone` = `activeCard` fără `shadowCard`, doar rândul cerc + titlu și hint-ul | ✓ |
| — cardul «Pozele de curățenie sunt complete.» la 3 / 3 (fără mockup) | — | `Card tone="success"` + «Înapoi la ziua de azi» (`PrimaryButton md`) | ◇ |
| spațiul + «Pozele se păstrează 30 de zile. Verdictul intră în raportul de seară al administratorului.» | flex-grow 1; 14 `#6b6560` centrat line-height 1.4 | `<Spacer />` + `Footnote` | ✓ |

## 6. Camera (`src/camera.tsx`) — fără artboard

Nu există mockup pentru ecranul camerei; s-a folosit paleta previzualizării din Curățenie:
fundal `colors.camera` (`#2a2426`), titlu 17 / 700 alb, hint 14 `cameraText`, declanșator 72 alb
cu inel de 3 și disc de 58, «Renunță» 16 / 600 alb la stânga; în previzualizare «Refă»
(`OutlineButton` neutral 64 / 19 / 700, rază 12) și «Trimite» (`PrimaryButton` lg). Decizie, nu abatere.

## Grep-uri

| Verificare | Rezultat |
|---|---|
| culori vechi `#1d4ed8`, `#f3f4f6`, `#d1d5db`, `#e5e7eb` în `app/` + `src/` | nimic |
| hex în cod în `app/` | nimic (doar în comentarii, valori din `theme.ts`) |
| emoji în `app/` | nimic |
| emoji în `src/` | `missionDoneText` (în alerta de după ultimul raport) — **corectat în S03**. Rămân doar în `locationLabel` (📍) și `MURDAR_WARNING` (⚠️), care nu sunt folosite de niciun ecran (rămășițe ale vechiului UI; `locationLabel` are teste) — nu ajung pe ecran, lăsate neatinse. |
| `fontWeight` literal | doar pe textele `monospace` (placa, câmpul de adăugare auto), unde fontul de sistem îl ascultă; restul textelor trec prin `weight()` |

## Gate-uri (rulate în S03, după corecție)

- `npx tsc --noEmit` — verde.
- `npm test` — 28 / 28.
- `npx expo export --platform android` — verde (bundle în `peron-android/dist/`, ignorat de git).

## Ce nu s-a putut reproduce exact și de ce

1. **Umbrele.** CSS `box-shadow: 0 4px 12px rgba(155,27,48,0.35)` nu are echivalent pe Android în
   React Native 0.76: `shadow*` se aplică doar pe iOS, Android folosește `elevation`, care desenează o
   umbră neagră translucidă cu forma și raza aproximate de sistem. S-a pus `elevation: 4` pentru
   butonul principal și celula «următoare» (`shadowPrimary`, `shadowNext`), `elevation: 3` pentru
   cardul activ de curățenie (umbra mai slabă, 0.15), plus valorile `shadowColor / Opacity / Radius /
   Offset` exacte pentru iOS. Nuanța bordo a umbrei nu se vede pe Android. Spec-ul o marchează
   explicit «nu e HOLD».
2. **Fontul mono al plăcii.** Mockup-ul cere «JetBrains Mono, Menlo, Consolas, monospace». Nu se
   instalează un font în plus (decizie din spec): se folosește `fontFamily: 'monospace'` (pe Android
   = Droid Sans Mono / Roboto Mono) cu `letterSpacing: 1`, `fontSize 17`, `fontWeight 600`.
3. **Fontul.** Open Sans 400 / 600 / 700 / 800 se încarcă din `@expo-google-fonts/open-sans`; pe
   Android greutatea se alege prin familie (`weight(n)`), nu prin `fontWeight`, de aceea toate
   stilurile de text folosesc `...weight(n)`.
4. **`line-height` procentual.** RN cere pixeli; s-au rotunjit (21 / 20 / 22 / 23 / 18). Diferența e
   sub 0.5 px.
5. **Lățimea.** Mockup-ul e la 390 px; layout-ul e fluid (flex, procente), dimensiunile fixe (64,
   72, 96, 104 × 128, 200, 44 etc.) sunt cele din HTML. Grila își calculează lățimea celulei din
   lățimea măsurată a rândului, ca `repeat(4, minmax(0, 1fr))`.
6. **Datele.** Textele ilustrative («Luni, 8 septembrie», «Vitalie», «12», «Ion Moldovan», «LYY 735»,
   «la 42 m de stație», «2 din 3 zone trimise», descrierile zonelor) sunt înlocuite cu datele reale
   din `/day`, din formular și din răspunsurile serverului. «Peron Chișinău» de pe Login e «Peron».
7. **Stările fără mockup** (marcate ◇ în tabele) sunt desenate cu aceleași componente și tokeni —
   nu introduc culori, dimensiuni sau fonturi noi.
