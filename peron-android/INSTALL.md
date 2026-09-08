# TRANSLUX Peron — instalarea aplicației Android

Aplicația operatorului de peron (Chișinău și Bălți): cursele zilei pe un singur ecran,
poza șoferului, pozele de curățenie cu camera, GPS luat singur. API-ul ei trăiește în
botul Telegram (`apps/bot`, Railway), sub `/app/v1/`. Pașii de mai jos se fac o singură
dată, de Ion; operatorii primesc doar APK-ul și un cod de 6 cifre.

## 1. `ANTHROPIC_API_KEY` pe serviciul `bot` din Railway

Pozele de curățenie și poza șoferului sunt judecate de Claude din bot. Fără cheie,
verificarea întoarce `EROARE`: poza se salvează, operatorul nu e blocat, dar nimeni nu
primește verdict.

1. Railway → proiectul TRANSLUX → serviciul **bot** → **Variables** → **New Variable**.
2. Numele `ANTHROPIC_API_KEY`, valoarea cheia din consola Anthropic (console.anthropic.com → API keys).
3. Railway repornește serviciul singur. Repornirea taie conversațiile operatorilor din bot
   care sunt în curs — fă pasul seara, după 22:00, ca la deploy.

Verificare: după repornire, o poză de curățenie din bot sau din aplicație primește
`CURAT` / `MURDAR`, nu «⚠️ Verificarea automată nu a mers».

## 2. Domeniul public al botului și `EXPO_PUBLIC_API_URL`

Serviciul `bot` are domeniu public: **https://bot-production-6376.up.railway.app**.
API-ul răspunde acolo (`GET /app/v1/day` fără token → 401, semn că ruta există).

Dacă domeniul se schimbă vreodată: Railway → serviciul bot → **Settings → Networking →
Generate Domain**, apoi noul URL se pune în două locuri:

- `peron-android/eas.json` → `build.preview.env.EXPO_PUBLIC_API_URL` (și `production`) —
  valoarea intră în APK la build; poate fi suprascrisă și cu o variabilă de mediu EAS
  (`eas env:create --name EXPO_PUBLIC_API_URL --value https://…` sau din expo.dev →
  proiect → Environment variables), care are prioritate peste `eas.json`.
- `peron-android/.env` (local, necommis) cu `EXPO_PUBLIC_API_URL=https://…` pentru
  `npx expo start` / `npx expo run:android`. Model: `peron-android/.env.example`.

URL-ul se scrie fără `/` la sfârșit; aplicația adaugă singură `/app/v1/`.

## 3. Build-ul APK-ului cu EAS și instalarea pe telefon

Cere cont Expo (expo.dev, gratuit). Se rulează din `peron-android/`:

```bash
cd peron-android
npm install
npm i -g eas-cli
eas login
eas build -p android --profile preview
```

- La prima rulare EAS întreabă dacă să creeze proiectul pe expo.dev și să genereze
  keystore-ul Android — răspunde **da** la ambele (keystore-ul rămâne la Expo; fără el
  nu se pot instala versiuni noi peste cea veche).
- Profilul `preview` din `eas.json` face **APK** (`buildType: "apk"`, `distribution:
  "internal"`), nu AAB pentru Play Store. Profilul `production` e identic deocamdată.
- Build-ul durează 10–20 min în cloud. La final EAS afișează un link și un cod QR spre
  APK; același link e pe expo.dev → proiect → Builds.

Instalarea pe telefonul operatorului:

1. Deschide linkul de build pe telefon (sau scanează QR-ul) și descarcă APK-ul.
2. Android întreabă de **surse necunoscute**: Setări → Aplicații → Acces special →
   Instalare aplicații necunoscute → browserul folosit → **Permite**. Apoi deschide
   APK-ul din Descărcări → Instalează.
3. **Dezactivează optimizarea bateriei** pentru «TRANSLUX Peron», altfel telefonul
   omoară urmărirea GPS din fundal și seara apar perioade «fără semnal»:
   - Android standard / Samsung: Setări → Aplicații → TRANSLUX Peron → Baterie →
     **Fără restricții** (sau «Neoptimizată»).
   - Xiaomi / Redmi (MIUI): Setări → Aplicații → Gestionare aplicații → TRANSLUX Peron →
     Economisire baterie → **Fără restricții**; și Autostart → **Pornit**.
   - Huawei: Setări → Baterie → Lansare aplicații → TRANSLUX Peron → **Gestionare
     manuală**, cu toate trei bifele pornite.
4. La primul login aplicația cere locația: alege **«Cât timp folosesc aplicația»**, apoi
   pe al doilea ecran **«Permite tot timpul»**. Fără «tot timpul» ecranul zilei arată
   instrucțiunea de setări și nu deschide nicio cursă.
5. Camera se cere la prima poză — **Permite**.

Aplicația nu are încă icon propriu (fișierele `assets/*.png` din template nu intră în
git din cauza regulii `*.png` din `.gitignore`-ul root); folosește iconul implicit
Android. Dacă vrei icon: pune `assets/icon.png` (1024×1024) și `assets/adaptive-icon.png`,
adaugă în `app.json` `"icon": "./assets/icon.png"` și scoate-le din ignore cu
`!peron-android/assets/*.png`.

Versiune nouă: `eas build -p android --profile preview` din nou, operatorii instalează
APK-ul peste cel vechi (același keystore → datele și token-ul rămân).

## 4. Codul de conectare din admin

1. central-hub → **Utilizatori** → la un utilizator cu rolul **CONTROLLER** și punctul
   **CHISINAU** sau **BALTI** apasă **«📱 Cod aplicație»**.
2. Apare un cod de 6 cifre, valabil **24 h**, folosit **o singură dată**. Îl dai
   operatorului (telefon, Telegram, pe hârtie).
3. Operatorul îl scrie în aplicație la «Conectează». Aplicația primește un token care
   nu expiră și îl ține în stocarea securizată a telefonului. Codul apare în
   `peron_app_link_codes`; sesiunea în `peron_app_sessions`.

Alt telefon sau reinstalare cu ștergerea datelor = cod nou. Codul nu se poate refolosi.

Revocarea unei sesiuni (telefon pierdut, operator plecat), în SQL pe Supabase:

```sql
update peron_app_sessions set revoked_at = now() where user_id = '<id-ul utilizatorului>';
```

La următoarea cerere aplicația primește 401 și se întoarce la ecranul de cod.

## 5. Ce vede operatorul în prima zi

1. **Codul** — ecranul cu 6 cifre → «Conectează» → explicația despre GPS → cele două
   permisiuni de locație.
2. **Ziua** — antet «⚔ DD.MM.YYYY — Chișinău · Completate 0/N», rândul «📍 În zona de
   lucru · GPS activ», grila curselor (✅ raportată, ▶ următoarea, 🔒 blocată) și, la
   Chișinău, «📷 Poze curățenie». GPS-ul din fundal pornește singur cu 30 min înainte
   de prima cursă și se oprește la 30 min după ultima; notificarea permanentă
   «TRANSLUX Peron urmărește locația în timpul turei» e normală.
3. **Curățenia de dimineață** — atingerea pe prima cursă (06:55) deschide direct pozele
   de curățenie, cu banda «Înainte de cursa 06:55 trebuie pozele de curățenie». Trei
   poze, doar cu camera (galeria nu există): peron, zona pietoni «GARA», veceu. Fiecare
   primește verdictul pe loc: verde CURAT, roșu MURDAR cu problemele și «⚠️ Informația
   se stochează și va fi penalizată», «poza nu pare din zona…» → se reface. La 3/3:
   «✔ Pozele de curățenie sunt complete» → Înapoi → cursa se deschide.
4. **Cursa** — un singur ecran: pasageri (sau «Absent»), șoferul și auto din
   repartizare cu «✅ OK / ✏️ Schimbă», «📷 Fă poza șoferului» → modelul propune
   «Uniformă» și «Aspect îngrijit» (atingere = corectează), verificările cu OK bifat
   implicit, locația luată singură («📍 42 m de stație»), «Trimite» → rezumatul →
   înapoi pe grilă cu cursa bifată. Bălți: doar cifra, «Absent», «Microbuzul full».
5. **La 15:00** — «📷 Poze curățenie» din ecranul zilei, setul ZIUA. Cursa **16:25** nu
   se deschide până când setul nu e complet (banda «Înainte de cursa 16:25…»).
6. **Seara** — digestul adminilor de la 20:30 primește secțiunea «Prezență în zona de
   lucru» cu perioadele de lipsă / fără semnal per operator.

Fără internet: aplicația arată «Fără internet» și păstrează ce a completat operatorul;
se apasă din nou «Trimite» când revine semnalul. Doar ping-urile GPS au coadă offline.
