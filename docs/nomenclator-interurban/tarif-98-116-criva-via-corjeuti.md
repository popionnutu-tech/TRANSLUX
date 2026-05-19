# Tarif 98/116 — Criva via Corjeuți

**Status:** ✅ Finalizat

## Parametri generali

| Parametru | Valoare |
|---|---|
| Nume | **Criva via Corjeuți** |
| Tarif tur | **98** |
| Tarif retur | **116** |
| Direcția tur | Criva Vama → Chișinău (prin Corjeuți și Briceni) |
| Direcția retur | Chișinău → Criva Vama (prin Briceni și Corjeuți) |
| Km total | **298.5** (Criva → Chișinău = 295) |
| Număr opriri | 45 |
| Număr rute | 2 |

## Distincția față de tariful 106/105 (Criva Direct)

Acest tarif folosește **alt drum** între Lipcani și Briceni:
- **Criva Direct (106/105):** Lipcani → Hlina → Beleavinți → Caracușenii Noi → Briceni (4 opriri intermediare)
- **Criva via Corjeuți (98/116):** Lipcani → Șărăuți → Slobozia Șărăuți → Pererita → Tețcani → Corjeuți → Caracușenii Vechi → Tabani → Briceni (8 opriri intermediare)

După Briceni, **același drum** ca în 106/105 — aceleași segmente km.

## Surse autorizație (etalon km)

1. **S.R.L. PARCUL DE AUTOBUZE ȘI TA** — Criva ↔ Chișinău GA Nord, plecare 2:40 / 13:55 — total 294 km (Criva → Chișinău)

Etalon adoptat: **295 km** Criva → Chișinău (autorizația arată 294, dar folosim 295 pentru a păstra aceleași segmente km după Briceni ca în tariful 106).

## Opriri (45 total)

| # | Oprire | Km de la Criva Vama | Sursă |
|---|---|---|---|
| 1 | **Criva Vama** | 0 | start |
| 2 | **Criva** | 3.5 | etalon |
| 3 | Drepcăuți | 7.5 | etalon (+4) |
| 4 | **Lipcani** | 13.5 | etalon (+10) |
| 5 | **Șărăuți** | 17.5 | etalon (+14) |
| 6 | Slobozia Șărăuți | 19.3 | calculat |
| 7 | **Pererita** | 24.5 | etalon (+21) |
| 8 | **Tețcani** | 30.5 | etalon (+27) |
| 9 | **Corjeuți** | 40.5 | etalon (+37) |
| 10 | **Caracușenii Vechi** | 48.5 | etalon (+45) |
| 11 | **Tabani** | 53.5 | etalon (+50) |
| 12 | **Briceni** | 60.5 | etalon (+57) |
| 13 | Colicăuți | 63.6 | calculat |
| 14 | Intersecția Tabani | 64.7 | calculat |
| 15 | Intersecția Trestieni | 70.1 | calculat |
| 16 | **Halahora de Sus** | 73.5 | etalon (+70) |
| 17 | Hlinaia | 82.7 | calculat |
| 18 | **Edineț** | 94.5 | etalon (+91) |
| 19 | Cupcini | 101.1 | calculat |
| 20 | Brătușeni | 105.2 | calculat |
| 21 | Brătușenii Noi | 114.1 | calculat |
| 22 | Mihailenii Noi | 118.9 | calculat |
| 23 | Petrom Rîșcani | 127.5 | calculat |
| 24 | Intersecția Rîșcani | 127.5 | calculat |
| 25 | Recea | 135.2 | calculat |
| 26 | Intersecția Pelenia | 146.2 | calculat |
| 27 | Corlăteni | 151.1 | calculat |
| 28 | **Bălți** | 164.5 | etalon (+161) |
| 29 | Bilicenii Noi | 174.2 | calculat |
| 30 | Bilicenii Vechi | 179.1 | calculat |
| 31 | Sîngerei | 190.7 | calculat |
| 32 | Grigorăuca | 194.6 | calculat |
| 33 | **Copăceni** | 196.5 | etalon (+193) |
| 34 | Prepelița | 205.1 | calculat |
| 35 | Bănești | 209.5 | calculat |
| 36 | Ratuș | 218.1 | calculat |
| 37 | **Intersecția Soroca** | 223.5 | etalon (+220) |
| 38 | Zăhăreuca | 228.5 | calculat |
| 39 | Ciocîlteni | 243.5 | calculat |
| 40 | Orhei | 250.5 | calculat |
| 41 | Peresecina | 269.5 | calculat |
| 42 | Pașcani | 279.9 | calculat |
| 43 | Măgdăcești | 282.8 | calculat |
| 44 | Stăuceni | 289.2 | calculat |
| 45 | **Chișinău** | 298.5 | etalon (+295) |

**Notă:** 16 puncte etalon (bold) provin direct din autorizația oficială + Criva Vama (start).

## Rute pe acest tarif (2)

| crm_route_id | Nume | Plecare Nord | Plecare Chișinău | Observații |
|---|---|---|---|---|
| 17 | Criva (Tețcani) - Chișinău | 02:40 → 8:20 | 13:55 → 19:00 | **autorizație PARCUL (etalon)** |
| 26 | Corjeuți (Briceni) - Chișinău | 08:00 → 17:15 | 17:20 → 21:30 | pleacă fizic din Corjeuți |

## Rute mutate la alt tarif

| crm_route_id | Nume | Mutat la | Motiv |
|---|---|---|---|
| 6 | Corjeuți - Chișinău (6:17) | **115/114** (Corjeuti/Edinet) | Merge prin Trinca → Tîrnova → Gordineștii Noi → Edineț (ocolește Briceni) |

## Reguli pentru afișare în numerar

Toate cele 2 rute apar în numerar cu **lista completă de 45 opriri**, începând de la Criva Vama (km 0), indiferent unde pleacă fizic autobuzul.

Exemplu pentru ruta 26 (Corjeuți - Chișinău, 08:00):
- În numerar: pasagerul vede toate 45 opriri de la Criva Vama
- Pasagerul cumpără bilet de la Corjeuți până la Bălți → sistem calculează km între opririle alese (Corjeuți 40.5 → Bălți 164.5 = 124 km)
