# Camioane: idealurile finale (ION-69, 27.09.2026)

Ce se folosește: km minimi pentru o cisternă ADR de 40 t (10 t pe axă, 4,0 × 2,55 × 16,5 m), fără bac (bacurile se exclud cu poligoane, pentru că `shortest` ignoră `use_ferry:0`), o singură trecere de graniță, doar prin vămi trecute de flotă măcar o dată.

Deciziile lui Ion (25–27.09):
- **Motorina** trece obligatoriu prin baza petrolieră Chișinău (Meșterul Manole) sau Briceni. Direct la stație doar rar, dar și atunci se calculează idealul.
- **Idealuri pe două vămi,** prin Giurgiulești și prin Albița, și în regimul prin bază, și direct.
- **Albița de bază** dacă e mai lungă cu cel mult 20 km (`baza-albita.mjs`, PRAG_KM).
- **Biodieselul (Ion, 28.09):** fără ZEL (B1, B2, B4, B5, B6) cisterna pleacă direct Berdichev → Vinița → Otaci, fără terminalul de export (ca ruta Google, −~280 km); prin ZEL Ungheni (B3, B7, B8) trece întâi pe la terminalul de lângă Zviahel. Chișinău = Meșterul Manole. Ruse = zona industrială de la pod (43.877, 26.020). Ruse prin ZEL (B8) e cerut explicit.
- **Biodieselul:** idealul trecut prin 3 runde de dezbatere Claude + Codex (`2026-09-27-biodiesel-ideal-dezbatere.md`).

Sursa datelor (pe Mac mini, în afara repo-ului, ca scheletele uzinelor):
- `~/dev/camioane-schelet/date/schelet-camioane-diesel-r2.json` — motorina, cu `prinBazaVariante`, `variante`, `idealDirect`, `prinBaza`;
- `~/dev/camioane-schelet/date/marshruty-bio-r2.json` — biodieselul B1–B8, cu matricea de vămi și alternativa pe magistrale;
- urmele GPS brute: VPS `/root/lde-worker/camioane/date/urme/` (Wialon 2025-09-01 → 2026-09-24).

Lanțul de scripturi: `segmenteaza → propune → potriveste → coridoare → ideal → diesel-ideal → baza-albita → prin-baza → ideal-baza → baza-variante → marshruty2 → raport`.
Valhalla: `~/dev/valhalla-eu` (colima, 127.0.0.1:8003; în `valhalla.json`, `breakage_distance` trebuie să fie în `meili.customizable`).

## Motorină (Port Constanța / Petromidia → stație)

| Încărcare | Stația | Baza | prin bază · Giurgiulești | prin bază · Albița | direct · Giurgiulești | direct · Albița | direct de bază | curse/an |
|---|---|---|---|---|---|---|---|---|
| Port Constanța | Bază Bălți | Chișinău | 566 | 594 | 588 | 523 | Albița | 3 |
| Port Constanța | Bază Briceni | Briceni | 680 | 610 | 680 | 610 | Albița | 15 |
| Port Constanța | Bacioi | Chișinău | 441 | 469 | 420 | 456 | Giurgiulești | 56 |
| Port Constanța | Meșterul Manole | Chișinău | 430 | 459 | 430 | 459 | Giurgiulești | 16 |
| Port Constanța | TLX Bălți | Chișinău | 567 | 595 | 582 | 518 | Albița | 7 |
| Port Constanța | TLX Orhei | Chișinău | 479 | 508 | 476 | 487 | Albița | 2 |
| Port Constanța | TLX Peresecina | Chișinău | 454 | 482 | 451 | 467 | Albița | 9 |
| Port Constanța | TLX Petricani | Chișinău | 435 | 464 | 432 | 458 | Giurgiulești | 2 |
| Port Constanța | TLX Sîngerei | Chișinău | 535 | 564 | 533 | 513 | Albița | 11 |
| Port Constanța | TLX Ungheni | Chișinău | 537 | 566 | 546 | 448 | Albița | 3 |
| Petromidia | Bază Briceni | Briceni | 653 | 588 | 653 | 588 | Albița | 2 |
| Petromidia | Bacioi | Chișinău | 419 | 447 | 399 | 434 | Giurgiulești | 21 |
| Petromidia | Meșterul Manole | Chișinău | 409 | 437 | 409 | 437 | Giurgiulești | 12 |
| Petromidia | TLX Bălți | Chișinău | 545 | 573 | 556 | 496 | Albița | 3 |
| Petromidia | TLX Orhei | Chișinău | 457 | 486 | 454 | 465 | Albița | 3 |
| Petromidia | TLX Peresecina | Chișinău | 432 | 460 | 429 | 445 | Albița | 4 |
| Petromidia | TLX Petricani | Chișinău | 413 | 442 | 410 | 436 | Giurgiulești | 2 |
| Petromidia | TLX Sîngerei | Chișinău | 514 | 542 | 511 | 491 | Albița | 7 |
| Petromidia | TLX Ungheni | Chișinău | 515 | 544 | 520 | 426 | Albița | 6 |

## Biodiesel (Berdichev → terminal de export Zviahel → Otaci/Mămăliga → …)

| Cod | Traseu | Vămi (ideal) | Ideal km | Pe magistrale km | Km minim absolut |
|---|---|---|---|---|---|
| B1 | Бердичев → Констанца | Otaci → Albița | 831 | 966 | 831 |
| B2 | Бердичев → София | Otaci → Albița → Giurgiu | 1.182 | 1.240 | 1.165 (Otaci → Costești → Giurgiu) |
| B3 | Бердичев → София через ZEL Унгены | Otaci → ZEL → Albița → Giurgiu | 1.465 | 1.584 | 1.465 |
| B4 | Бердичев → Русе | Otaci → Albița | 859 | 911 | 843 (Otaci → Costești) |
| B5 | Бердичев → нефтебаза Бричень | Otaci | 252 | 283 | 252 |
| B6 | Бердичев → нефтебаза Кишинёв (Маноле) | Otaci | 400 | 431 | 400 |
| B7 | Бердичев → Констанца через ZEL Унгены | Otaci → ZEL → Albița | 1.114 | 1.280 | 1.114 |
| B8 | Бердичев → Русе через ZEL Унгены | Otaci → ZEL → Albița | 1.142 | 1.255 | 1.142 |
