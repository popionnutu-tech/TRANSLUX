#!/usr/bin/env bash
# ION-149 — harta autobuzelor interurbane (mejgorod) + locul de noapte P1/P2, săptămâna trecută (luni–duminică) → lde_harta_zi 'MEJGOROD'
# + controlul flotei în lde_analiza_reguli 'MEJGOROD_HARTA'. Ion, 01.10.2026: «adaugă toate direcțiile» (raspunsuri.md, întrebarea 11:
# lanțul de parcare are rularea lui de luni și își ia singur cursele; nu atinge lear-saptamanal.sh și nici lanțul mejgorod/ ION-55).
# Cron luni 10:30 (după turele de dimineață ale zilei de luni, care închid nopțile de duminică).
#   lant.sh [AAAA-LL-ZZ luni]          fără argument = săptămâna trecută;  MEJGOROD_HARTA_WRITE=0 → fără scriere în bază
# Pașii: mej/ = copiile lanțului ION-55 (nomenclator, curse, parcare + optim2 = regula din 25.09, doar informativ) în date/, apoi harta.mjs.
# Orice pas picat = nu se scrie nimic (ce era publicat rămâne); codul de ieșire ≠ 0.
set -uo pipefail
AICI=/root/lde-worker/mejgorod-parcare; ENV=/root/lde-worker/.env
cd "$AICI" || exit 1
LUNI=${1:-$(date -d "-$(( $(date +%u) + 6 )) days" +%F)}
[ "$(date -d "$LUNI" +%u)" = 1 ] || { echo "$LUNI nu e luni"; exit 2; }
DE=$(date -d "$LUNI -1 day" +%F); PANA=$(date -d "$LUNI +7 days" +%F)
W=(--write); [ "${MEJGOROD_HARTA_WRITE:-1}" = 0 ] && W=()
echo "=== $(date '+%F %T') harta mejgorod, săptămâna $LUNI (curse $DE → $PANA)"
mkdir -p date
install -m 644 /root/lde-worker/mejgorod/date/ideal.json date/ideal.json || exit 1   # scheletul fix ION-55, doar citit
export SUFIX="-$LUNI"
cd mej || exit 1
timeout 600 node --env-file="$ENV" nomenclator.mjs "$DE" "$PANA" | tail -1 || { echo "nomenclator a picat" >&2; exit 1; }
timeout 1200 node --env-file="$ENV" curse.mjs | tail -1 || { echo "curse a picat" >&2; exit 1; }
# regula din 25.09 (informativ, răspunsul 1): dacă pică, harta merge fără cifra ei
timeout 900 node --env-file="$ENV" parcare.mjs | tail -1 && timeout 300 node optim2.mjs | tail -1 || { echo "regula din 25.09 a picat — harta fără cifra ei" >&2; rm -f "../date/optim2-$LUNI.json"; }
cd "$AICI" || exit 1
timeout 1800 node --env-file="$ENV" harta.mjs --sapt="$LUNI" ${W[@]+"${W[@]}"} || { echo "harta a picat — nimic schimbat în bază" >&2; exit 1; }
# fișierele săptămânilor mai vechi de 8 săptămâni (curse ≈ 5 MB / săptămână)
find date -maxdepth 1 -name '*-20[0-9][0-9]-*.json' -mtime +56 -delete
echo "=== $(date '+%F %T') gata"
