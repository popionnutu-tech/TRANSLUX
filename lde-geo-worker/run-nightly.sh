#!/bin/bash
# LDE worker nopți — GPS (ziua de ieri) + import Benzol + preț motorină din TLX.
# Cron: 0 3 * * *. Logă în nightly.log. Idempotent (re-rularea nu dublează).
# NOTĂ: la 06:30 rulează pe același VPS și verificarea atribuirilor (crontab):
#   30 6 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://central-hub-md.vercel.app/api/cron/lde-verifica-atribuiri >> /root/lde-worker/verify-atribuiri.log 2>&1
# Și la 06:45, judecata deciziilor dispecerului de camioane (alertă la ADMIN dacă
# două camioane au fost trimise încrucișat). DUPĂ trip-worker, ca opririle GPS de
# ieri să fie deja scrise:
#   45 6 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://central-hub-md.vercel.app/api/cron/lde-decizii-camioane >> /root/lde-worker/decizii-camioane.log 2>&1
# Și la fiecare 5 minute, stările automate ale curselor (GPS → «la descărcare»,
# recepție TLX → «încheiată»), cu flock ca două rulări să nu se calce:
#   */5 * * * * cd /root/lde-worker && flock -n /tmp/trip-live.lock node --env-file=.env trip-live-worker.mjs --write >> /root/lde-worker/trip-live.log 2>&1
# Și pe 25 ale lunii la 08:00, posterele de combustibil (grupa P9, tabul DT) pentru luna trecută (ION-138):
#   0 8 25 * * . /root/lde-worker/cron-secret.env && curl -fsS --max-time 120 -H "Authorization: Bearer $CRON_SECRET" https://central-hub-md.vercel.app/api/cron/lde-combustibil-poster >> /root/lde-worker/combustibil-poster.log 2>&1
# Și la 08:00, neconformitățile de ieri în grupa Mejgorod (ION-246) — plecat din Briceni/Edineț/Bălți
# înainte de grafic, nu a trecut prin Sîngerei; citește route_stop_passes scrise mai jos de stop-times.mjs:
#   0 8 * * * . /root/lde-worker/cron-secret.env && curl -fsS --max-time 60 -H "Authorization: Bearer $CRON_SECRET" https://central-hub-md.vercel.app/api/cron/mejgorod-neconformitati >> /root/lde-worker/mejgorod-neconformitati.log 2>&1
# Și la fiecare 5 minute, paznicul botului (ION-253; până la 06.10 era în GitHub Actions, care anula des rularea):
#   */5 * * * * /root/lde-worker/bot-watchdog.sh   (script separat: în crontab «%» e rând nou și rupea comanda inline)
cd /root/lde-worker || exit 1
Y=$(TZ=Europe/Chisinau date -d yesterday +%F)
echo "===== $(TZ=Europe/Chisinau date '+%F %T') | ziua $Y =====" >> nightly.log
# Atribuirile zilei de ieri ÎNAINTE de gps-worker (ION-233): cursele de uzină se scriu după
# lde_atribuiri_zilnice, iar ziua se materializează din șablon doar când cineva deschide pagina
# de atribuiri sau la verificarea de la 06:30 — după gps-worker. 28.09–04.10 nimeni n-a deschis-o
# și s-a scris «curse: 0» în fiecare noapte. dry=1: doar materializarea, fără verdict scris și fără push.
. /root/lde-worker/cron-secret.env
materializeaza() {
  curl -fsS --max-time 90 -H "Authorization: Bearer $CRON_SECRET" \
    "https://central-hub-md.vercel.app/api/cron/lde-verifica-atribuiri?date=$Y&dry=1" > /dev/null
}
if materializeaza || { sleep 60; materializeaza; }; then
  echo "atribuiri $Y: materializate" >> nightly.log
else
  echo "! atribuiri $Y: materializarea a picat — cursele de uzină pot lipsi" >> nightly.log
fi
node --env-file=.env gps-worker.mjs "$Y" --write >> nightly.log 2>&1
node --env-file=.env fuel-worker.mjs --write >> nightly.log 2>&1
# Litrii de pe foile de parcurs LDE (baza raznareadca, ION-132):
# litrii scriși de operator pe foile pz_* → lde_fuel_foaie (litri_a = benzol, deja importat mai sus).
node --env-file=.env lde-alim-worker.mjs --write >> nightly.log 2>&1
# alimentările parcului cu QR la stațiile TLX (Reovis) → evidența motorinei (migr. 539–541)
node --env-file=.env tlx-qr-worker.mjs --write >> nightly.log 2>&1
# Unde a dormit fiecare mașină de uzină (din harta mașinii, GPS) → lde_noapte_zi, pentru agrearea lunară a șoferilor (ION-174).
node --env-file=.env noapte-worker.mjs --write >> nightly.log 2>&1
# Tot ce aruncă cele două de mai sus — plăcuțe/nume care nu sunt în vehicles → lde_fuel_strain (ION-134).
# DUPĂ ele. O mașină adăugată în flotă: rulează o dată toate trei cu --all, ca istoricul ei să treacă la ea.
node --env-file=.env fuel-strain-worker.mjs --write >> nightly.log 2>&1
# Km pe mașină × zi din LDE (raznareadca.km_m2m) — norma faptică pe /lde/combustibil unde GPS-ul nostru n-are km (ION-135).
node --env-file=.env km-m2m-worker.mjs --write >> nightly.log 2>&1
node --env-file=.env price-worker.mjs 7 >> nightly.log 2>&1
# Tipul camionului din recepțiile TLX: cine a descărcat carburant în ultimele
# 60 de zile e cisternă (Ion, 08.09). Înainte de trip-live/trip-worker, ca
# potrivirea cu recepțiile să vadă flota completă. Rulează din live/, lângă
# camion-auto.mjs și trip-auto.mjs pe care le importă — în /root/lde-worker nu
# există, iar pasul a picat MODULE_NOT_FOUND în fiecare noapte 18–23.09 (ION-35).
(cd live && node --env-file=/root/lde-worker/.env truck-profile-sync.mjs --write) >> nightly.log 2>&1
node --env-file=.env wialon-worker.mjs "$Y" --write >> nightly.log 2>&1
# Metricile curselor de camioane — DUPĂ wialon-worker: are nevoie de aceleași
# track-uri, iar km-ii se calculează cu același nucleu (km-core), nu cu altul.
node --env-file=.env trip-worker.mjs "$Y" --write >> nightly.log 2>&1
# Etalonul traseelor: DUPĂ gps-worker, fiindcă citește cursele scrise de el. Nu atinge
# trackerul furnizorului — citește doar Supabase, deci poate fi pas separat.
node --env-file=.env etalon-aggregate.mjs --write >> nightly.log 2>&1
# Ora reală la care autobuzele de pasageri au trecut ieri prin fiecare oprire (ION-39,
# route_stop_passes): citește trackerul, deci are nevoie doar de urma de ieri.
node --env-file=.env stop-times.mjs --from "$Y" --to "$Y" --write >> nightly.log 2>&1
echo "----- gata -----" >> nightly.log
