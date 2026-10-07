#!/usr/bin/env bash
# ION-148 — harta mașinii + parcarea P1/P2 Briceni (Trox + suburban) pe săptămâna trecută → lde_harta_zi 'BRICENI'
# + controlul flotei în lde_analiza_reguli 'BRICENI_HARTA'. Cron luni 09:30 (ora Moldovei), după analiza BRICENI de la 08:00
# (lear-saptamanal.sh → briceni/cod/saptamanal.sh, care aduce zilele din tracker în briceni/date/zile).
# Nu atinge lanțul de luni: nomenclatorul, cursele și livrarea săptămânii se refac cu SUFIX propriu (-parcare), nu peste -sapt;
# rândul «BRICENI» din lde_analiza_reguli nu se scrie. Același lock ca lanțul de luni (/tmp/briceni-sapt.lock), în așteptare.
#   bash lant.sh [AAAA-LL-ZZ luni]      fără argument: săptămâna trecută;  BRICENI_HARTA_WRITE=0 → fără scriere în bază
set -uo pipefail
AICI=/root/lde-worker/briceni-parcare; COD=/root/lde-worker/briceni/cod; ENV=/root/lde-worker/.env
SAPT=${1:-$(date -d "-$(( $(date +%u) + 6 )) days" +%F)}
[ "$(date -d "$SAPT" +%u)" = 1 ] || { echo "$SAPT nu e luni"; exit 2; }
DUM=$(date -d "$SAPT +6 days" +%F)
W=(--write); [ "${BRICENI_HARTA_WRITE:-1}" = 0 ] && W=()
echo "=== $(date '+%F %T') harta Briceni, săptămâna $SAPT → $DUM"
exec 9>/tmp/briceni-sapt.lock
flock -w 900 9 || { echo "lock-ul lanțului Briceni e ocupat de 15 min — nimic schimbat"; exit 1; }
cd "$COD" || exit 1
export SUFIX=-parcare
timeout 600 node --env-file="$ENV" nomenclator.mjs "$SAPT" "$DUM" | tail -1 || { echo "nomenclator a picat"; exit 1; }
timeout 600 node curse.mjs | head -1 || { echo "curse a picat"; exit 1; }
timeout 300 node plan-si.mjs | tail -1 || { echo "plan-si a picat"; exit 1; }   # ION-268 schelet întâi
# ION-268 K.9: controlul picat → harta nu se scrie (ce era publicat rămâne)
node /root/lde-worker/lear-parcare/control.mjs briceni ../date/curse-sub${SUFIX}.json --out ../date/control${SUFIX}.json || { echo "CONTROL PICAT (K.9) — harta Briceni nu se scrie"; exit 3; }
timeout 600 node --env-file="$ENV" livrare.mjs | head -1 || { echo "livrare a picat"; exit 1; }
cd "$AICI" || exit 1
timeout 900 node --env-file="$ENV" harta.mjs --sapt="$SAPT" --sufix=-parcare ${W[@]+"${W[@]}"} || { echo "harta a picat — nimic scris"; exit 1; }
echo "gata $(date '+%F %T')"
