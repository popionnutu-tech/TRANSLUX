#!/usr/bin/env bash
# Drăxlmaier — analiza săptămânală (F3, ION-86 pasul 4), v5, livrat de «execută» (ION-94) 26.09.2026. Cu --write, scrie-analiza.mjs face upsert în lde_analiza_reguli.
#   bash saptamanal.sh [--write] [YYYY-MM-DD]     # opțiunile în orice ordine; fără dată = săptămâna lui «ieri» (luni → duminică)
# Pașii: urme (±1 zi pentru nopți) → vizite → etichete → categorii (§5) → alternative (§8) → control + probe (§10) → timpul liber
# (§11, modulul comun extins, cu prioritatea F2) → scrie-analiza.mjs (rândul DRAXELMAIER; doar cu --write).
# Lanțul F2 (drax/cod/economie/) cu parametri, datele în ECON_D (niciodată peste datele F2): drax/cod/economie/comun.mjs
# citește `D = process.env.ECON_D || …`; alternative.mjs are câmpurile aditive nelamuritLista / curseDePranz (probele a, b din 26.09).
# Fiecare pas scrie întreg în $ECON_D/<pas>.log; în ieșire doar `tail -n 3` după ce pasul s-a încheiat (fără `| head` sub pipefail).
set -euo pipefail
WRITE=""; ZI=""
for a in "$@"; do
  case "$a" in
    --write) WRITE="--write" ;;
    [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ZI="$a" ;;
    *) echo "argument necunoscut: $a (folosire: saptamanal.sh [--write] [YYYY-MM-DD])" >&2; exit 2 ;;
  esac
done
# DRAX_ACUM (doar pentru teste): «acum» ca «YYYY-MM-DD HH:MM»; implicit ceasul VPS-ului (Europe/Chisinau)
ACUM="${DRAX_ACUM:-$(date '+%F %T')}"
[ -n "$ZI" ] || ZI="$(date -d "$(date -d "$ACUM" +%F) -1 day" +%F)"
date -d "$ZI" +%F >/dev/null 2>&1 || { echo "dată nevalidă: $ZI" >&2; exit 2; }
LUNI="$(date -d "$ZI -$(( ($(date -d "$ZI" +%u) + 6) % 7 )) days" +%F)"
DUM="$(date -d "$LUNI +6 days" +%F)"
# triaj r2 (S-N3): --write DOAR pe o săptămână încheiată — ziua de lucru a duminicii se închide luni la 03:00
if [ -n "$WRITE" ] && [ "$(date -d "$ACUM" +%s)" -lt "$(date -d "$(date -d "$DUM +1 day" +%F) 03:00" +%s)" ]; then
  echo "săptămâna $LUNI → $DUM nu e încheiată (se închide $(date -d "$DUM +1 day" +%F) 03:00); --write refuzat" >&2; exit 2
fi
if [ -n "${DRAX_ARGS_ONLY:-}" ]; then echo "LUNI=$LUNI DUM=$DUM WRITE=${WRITE:-nu}"; exit 0; fi
AICI="${DRAX_AICI:-/root/lde-worker/drax/cod/saptamanal}"
E=/root/lde-worker/.env
BAZA="${DRAX_BAZA:-/root/lde-worker/drax/date/saptamanal}"
# R3-5 backend: o rulare de PROBĂ (fără --write) pe o săptămână încă neîncheiată lucrează în BAZA/_ciorna/<luni>, golit la fiecare probă,
# ca să nu înghețe instantaneul (alimentări, norme) cu care va rula luni --write
CIORNA=""
if [ -z "$WRITE" ] && [ "$(date -d "$ACUM" +%s)" -lt "$(date -d "$(date -d "$DUM +1 day" +%F) 03:00" +%s)" ] && [ -z "${ECON_D:-}" ]; then
  export ECON_D="$BAZA/_ciorna/$LUNI"; CIORNA=1
fi
export ECON_D="${ECON_D:-$BAZA/$LUNI}"
if [ -n "${DRAX_DOSAR_ONLY:-}" ]; then echo "ECON_D=$ECON_D"; exit 0; fi
[ -n "$CIORNA" ] && case "$ECON_D" in "$BAZA"/_ciorna/20*) rm -rf "$ECON_D" ;; esac
mkdir -p "$ECON_D"
# Instantaneul săptămânii (F3 r3–r4, Codex C3 / R3-1): referințele (scheletul ideal și nomenclatorul) se COPIAZĂ o singură dată într-un
# depozit adresat pe conținut, BAZA/_ref/<nume>-<md5>.json (nimic nu scrie vreodată acolo; aceeași versiune = un singur fișier), iar
# dosarul săptămânii le leagă SIMBOLIC de acolo la prima rulare și nu le mai schimbă. Niciodată legătură tare spre fișierul global:
# lanțul ideal îl rescrie pe loc. Sursa: DRAX_REF_SRC (implicit idealul activ, drax/date/ideal-activ → ideal-v2 după verdictul ION-95).
REF_SRC="${DRAX_REF_SRC:-$(readlink -f /root/lde-worker/drax/date/ideal-activ 2>/dev/null || echo /root/lde-worker/drax/date)}"
mkdir -p "$BAZA/_ref"
for f in curse-ideal dubluri-ideal nomenclator obs-ideal schelet-ideal; do
  [ -e "$ECON_D/$f.json" ] && continue                 # săptămâna are deja instantaneul ei: nu se atinge
  src="$REF_SRC/$f.json"; [ -f "$src" ] || src="/root/lde-worker/drax/date/$f.json"   # nomenclatorul stă doar în drax/date
  h="$(md5sum "$src" | cut -c1-32)"; ref="$BAZA/_ref/$f-$h.json"
  [ -f "$ref" ] || { cp "$src" "$ref.tmp" && [ "$(md5sum "$ref.tmp" | cut -c1-32)" = "$h" ] && mv "$ref.tmp" "$ref"; }
  ln -s "$ref" "$ECON_D/$f.json"
done
# normele / prețul le îngheață alternative.mjs (economie-norme-<duminica>.json); porțile / ferestrele / alimentările, urmele §11 și
# asocierea mașină → dispozitiv liber.mjs (instantaneu-liber.json, urme-liber.json.gz); casa e în economie.json
export F2_DE="$LUNI" F2_SAPT=1 F2_PANA="$DUM"
T0=$(date +%s)
pas() {  # nume, comanda… — ieșirea întreagă în $ECON_D/<nume>.log, în log doar ultimele 3 rânduri
  local n="$1"; shift
  "$@" > "$ECON_D/$n.log" 2>&1 || { echo "  $n: a picat (cod $?), vezi $ECON_D/$n.log" >&2; tail -n 5 "$ECON_D/$n.log" >&2; return 1; }
  tail -n 3 "$ECON_D/$n.log" | sed "s/^/  $n │ /"; echo "  $n $(( $(date +%s) - T0 )) s"
}
echo "Drăxlmaier săptămâna $LUNI → $DUM · $(date '+%F %T') · ECON_D=$ECON_D · ${WRITE:-fără scriere}"
exec 9>/tmp/drax-sapt.lock
flock -w 30 9 || { echo "lock-ul Drăxlmaier e ocupat (/tmp/drax-sapt.lock)" >&2; exit 1; }
cd "$AICI/../economie"
N="node --max-old-space-size=1500"
# urmele F2 se extrag din tracker DOAR la prima rulare a săptămânii (Codex C3): o rerulare lucrează din instantaneu, fără tracker;
# DRAX_REEXTRAGE=1 forțează extragerea (după ce retenția a șters economie-urme, rerularea are nevoie de ea)
if [ -s "$ECON_D/economie-curse.json" ] && [ -d "$ECON_D/economie-urme" ] && [ -z "${DRAX_REEXTRAGE:-}" ]; then echo "  urme: din instantaneu (fără tracker)"
else pas urme nice -n 10 $N --env-file=$E urme.mjs; fi
pas vizite $N vizite.mjs
pas etichete $N etichete.mjs
pas categorii $N categorii.mjs
pas alternative $N --env-file=$E alternative.mjs
pas control $N control.mjs
pas probe $N probe.mjs
cd "$AICI"
pas liber nice -n 10 $N --env-file=$E liber.mjs --saptamina "$LUNI" --dir "$ECON_D" --zona 1 --out "$ECON_D/liber.json"
pas scrie node --env-file=$E scrie-analiza.mjs "$ECON_D" $WRITE
# păstrarea (verdictul 7 + Codex #7): urmele brute 8 săptămâni, doar în dosare cu nume de dată sub BAZA verificată; JSON-urile și
# instantaneele rămân. Nimic nu se șterge până la încheierea validării F4 (BAZA/.pastreaza-pana = YYYY-MM-DD; lipsă = nu se șterge).
PASTREAZA="$(cat "$BAZA/.pastreaza-pana" 2>/dev/null || echo 9999-12-31)"
if [ "$BAZA" = "/root/lde-worker/drax/date/saptamanal" ] && [ -d "$BAZA" ] && [ "$(date -d "$ACUM" +%F)" \> "$PASTREAZA" ]; then
  find "$BAZA" -mindepth 2 -maxdepth 2 -type d -name economie-urme -path "$BAZA/20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]/economie-urme" -mtime +56 -exec rm -rf {} + || true
fi
echo "gata $(date '+%F %T') · $(( $(date +%s) - T0 )) s"
