#!/usr/bin/env bash
# Construiește APK-ul TRANSLUX Peron local (fără EAS). Rezultat: dist/translux-peron.apk
set -euo pipefail
cd "$(dirname "$0")"
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-https://bot-production-6376.up.railway.app}"
[ -d node_modules ] || npm install
# android/ e ignorat de git și se regenerează mereu din app.json — altfel un folder vechi
# rămâne fără permisiunile/pluginurile adăugate între timp (S02: lipseau RECEIVE_BOOT_COMPLETED
# și REQUEST_IGNORE_BATTERY_OPTIMIZATIONS și APK-ul s-ar fi construit fără ele).
CI=1 npx expo prebuild --platform android --no-install --clean
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
# doar arm64 (toate telefoanele Android moderne): APK-ul scade de la ~90 MB la ~35 MB
sed -i '' 's/^reactNativeArchitectures=.*/reactNativeArchitectures=arm64-v8a/' android/gradle.properties
( cd android && ./gradlew assembleRelease --no-daemon -q )
mkdir -p dist
cp android/app/build/outputs/apk/release/app-release.apk dist/translux-peron.apk
echo "APK: $(pwd)/dist/translux-peron.apk"
# Copie directă pe MacBook (Tailscale + Remote Login), în ~/Downloads — fără iCloud (Ion, 09.09).
MACBOOK="${MACBOOK_SSH:-ionpop@100.82.41.116}"
if ssh -o BatchMode=yes -o ConnectTimeout=5 -i ~/.ssh/id_ed25519 "$MACBOOK" true 2>/dev/null; then
  scp -q -i ~/.ssh/id_ed25519 dist/translux-peron.apk "$MACBOOK:Downloads/translux-peron.apk" && echo "Copiat pe MacBook: ~/Downloads/translux-peron.apk"
else
  echo "MacBook indisponibil (Remote Login sau Tailscale oprit) — APK-ul rămâne doar local"
fi
