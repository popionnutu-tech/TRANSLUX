# ION-140 — posterul săptămânal «unde să stea mașina» (Drăxlmaier) în grupa livrări

Ion, 29.09.2026: «la Dra dă poster în grup, cu punctul optimal de dislocație, tot ce e mai jos de 100 km autobuze și 150 km rutiere să nu
nimerească, dă asta în grupa livrări, include în postare săptămânal 8:00 și în rând cu fiecare — loc optimal șofer».

- Posterul: apps/admin/src/lib/lde/drax-parcare-image.ts (șablonul poster-sablon), din date.parcare (ION-136). Rând: mașina (tip), unde stă acum,
  locul optim pentru șofer (1–2 locuri), km de tăiat pe săptămână. Pe poster: autobuze (≥ 40 locuri — DAF) ≥ 100 km, rutiere ≥ 150 km.
- Albumul de luni (livrari-luni.ts, ION-139): posterul Drăxlmaier intră după LEAR Florești; marcaj app_config drax_parcare_poster_last.
- VPS: lanțul Drăxlmaier rulează separat luni la 06:30 (lde-geo-worker/drax-luni.sh, cron `30 6 * * 1`), ≈ 15 min, ca rândul să fie
  gata la 08:00; blocul din lear-saptamanal.sh a fost scos; drax/OPRIT șters (Ion a cerut postarea săptămânală).
- parcare-valid.mjs (ION-136): plafonul «nu peste ideal» e max(0, ideal) — 351KAJ 21.09 are idealul −53,1 și parcarea 0 (nu e depășire).
- Săptămâna 21–27.09 calculată acum: parcarea 5.243,5 km/săpt. (ideal 5.445,3); pe poster 15 mașini, −4.065 km/săpt.
