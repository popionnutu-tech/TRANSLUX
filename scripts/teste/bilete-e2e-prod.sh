#!/bin/bash
# Rulare: BILETE_API_KEY=... bash scripts/teste/bilete-e2e-prod.sh   (cheia din Vercel, central-hub; nu se tipărește)
# Baza: bash ~/.claude/scripts/db-migrate.sh translux packages/db/teste/bilete-stres-10000.sql --dry-run  (ROLLBACK)
# Regulile: cd apps/admin && npx vitest run src/lib/bilete/stres-10000.test.ts
# Stratul 3 al testului de stres: intrările publice ale lanțului pe PRODUCȚIE, fără plăți și fără a deschide vânzarea.
# Fiecare verificare: ce trimitem → ce trebuie să răspundă. Cheile se citesc din fișiere și nu se tipăresc.
H=https://central-hub-md.vercel.app; S1=translux; SITE="https://$S1.md"
KEY="${BILETE_API_KEY:?pune BILETE_API_KEY în mediu}"
ok=0; rau=0
check() { # nume, așteptat, primit
  if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✓ %-62s %s\n' "$1" "$3"; else rau=$((rau+1)); printf '  ✗ %-62s așteptat %s, primit %s\n' "$1" "$2" "$3"; fi
}
code() { curl -s -o /dev/null -w '%{http_code}' -m 30 "$@"; }
UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

echo "Site și pagini"
check "prima pagină /ro" 200 "$(code -A "$UA" "$SITE/ro")"
check "condițiile de vânzare /ro/conditii-vanzare" 200 "$(code -A "$UA" "$SITE/ro/conditii-vanzare")"
check "logoul maib în subsol" 200 "$(code -A "$UA" "$SITE/plati/maib.png")"
check "biletul cu cod inexistent (pagina «nu a fost găsit»)" 200 "$(code -A "$UA" "$SITE/ro/bilet/00000000000000000000000000000000")"

echo "Configurația și API-ul comenzii"
check "config vânzare (public)" 200 "$(code "$H/api/bilete/public/config")"
check "comanda fără cheie → refuz" 401 "$(code -X POST -H 'Content-Type: application/json' -d '{}' "$H/api/bilete/comanda")"
check "comanda cu cheie greșită → refuz" 401 "$(code -X POST -H 'Content-Type: application/json' -H 'Authorization: Bearer 00' -d '{}' "$H/api/bilete/comanda")"
R=$(curl -s -m 60 -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $KEY" -d '{"tripDate":"2026-12-01","crmRouteId":1,"goingNorth":false,"fromRo":"Briceni","toRo":"Chișinău","seats":1,"passengerName":"Stres Test","phone":"069000000","idempotencyKey":"11111111-1111-4111-8111-111111111111","lang":"ro"}' -w ' HTTP%{http_code}' "$H/api/bilete/comanda")
check "comanda cu cheie, corp bun → refuz controlat (nu 500)" "da" "$(echo "$R" | grep -q -E 'HTTP(400|409|429|503)' && echo da || echo "nu: $R")"
check "comanda cu corp stricat → 400" 400 "$(code -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer $KEY" -d 'nu-e-json' "$H/api/bilete/comanda")"

echo "Plata (callback maib) și webhook-uri"
check "callback maib fără semnătură → 401" 401 "$(code -X POST -H 'Content-Type: application/json' -d '{"result":{}}' "$H/api/pay/maib/callback")"
check "callback maib cu semnătură falsă → 401" 401 "$(code -X POST -H 'Content-Type: application/json' -H 'X-Signature: sha256=AAAA' -H "X-Signature-Timestamp: $(date +%s)000" -d '{"result":{}}' "$H/api/pay/maib/callback")"
check "webhook Resend fără semnătură → 401" 401 "$(code -X POST -H 'Content-Type: application/json' -d '{}' "$H/api/resend/webhook")"

echo "Biletul public și scanarea"
check "biletul public, cod inexistent → 404" 404 "$(code "$H/api/bilete/public/00000000000000000000000000000000")"
check "biletul public, cod nevalid → 404" 404 "$(code "$H/api/bilete/public/abc")"
check "scanarea fără Telegram → refuz (401)" 401 "$(code -X POST -H 'Content-Type: application/json' -d '{"cheie":"2026-10-07|1|false","scanari":[]}' "$H/api/bilete-sofer/scan")"
check "scanarea cu initData falsă → refuz (401)" 401 "$(code -X POST -H 'Content-Type: application/json' -H 'X-Telegram-Init-Data: user=%7B%22id%22%3A1%7D&hash=00' -d '{"cheie":"2026-10-07|1|false","scanari":[]}' "$H/api/bilete-sofer/scan")"
check "cursele șoferului fără Telegram → refuz (401)" 401 "$(code "$H/api/bilete-sofer/azi")"

echo "Împăcarea (cron)"
check "împăcarea fără secret → 401" 401 "$(code "$H/api/cron/bilete-impacare")"

echo "REZULTAT: $ok trecute, $rau abateri"
