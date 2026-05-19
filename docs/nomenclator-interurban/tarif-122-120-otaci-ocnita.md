# Tarif 122/120 — Otaci/Ocnița

**Status:** ✅ Finalizat

## Parametri generali

| Parametru | Valoare |
|---|---|
| Nume | **Otaci/Ocnița** |
| Tarif tur | **122** |
| Tarif retur | **120** |
| Direcția tur | Nord (Otaci/Ocnița/Briceni) → Chișinău |
| Direcția retur | Chișinău → Nord (Otaci/Ocnița) |
| Master km total | **266** (Otaci → Chișinău) |
| Master opriri | 42 |
| Entry path extra (Briceni→Ocnița) | 6 opriri |
| Număr rute | 3 |

## Particularitate — 3 puncte de pornire

Acest tarif are **trei puncte de plecare diferite**:
1. **Otaci** (cel mai îndepărtat, 266 km) — folosit doar de ruta 21
2. **Ocnița** (240 km) — folosit de ruta 3
3. **Briceni** (287 km via Trebisăuți/Corestăuți/Hădărăuți/S. Ocnița → Ocnița) — folosit doar de ruta 29

Toate rutele se unesc la **Ocnița**, apoi merg pe drumul comun până la Chișinău.

## Surse autorizație (etalon km)

1. **S.A. PARCUL DE AUTOBUSE ȘI TAXI** — Chișinău GA Nord ↔ Otaci GA, plecare 14:50 / 6:10 — total **266 km** (Otaci → Chișinău)
2. **S.C. "TUR-CRIALNORD" S.R.L.** — Chișinău GA Nord ↔ Ocnița GA, plecare 15:20 / 5:00 — total **240 km** (Ocnița → Chișinău)

## Master-list opriri (Otaci → Chișinău, 42 total)

| # | Oprire | Km de la Otaci | Sursă |
|---|---|---|---|
| 1 | **Otaci** | 0 | start (auth 1) |
| 2 | Valcinet | 4 | auth 1 |
| 3 | Mereseuca | 9 | auth 1 |
| 4 | Lencauti | 12 | auth 1 |
| 5 | Frunza | 16 | auth 1 |
| 6 | Birnova | 21 | auth 1 |
| 7 | **Ocnița** | 26 | auth 1+2 |
| 8 | Dîngeni | 37.5 | ruta 3 |
| 9 | Mihălășeni | 39.8 | ruta 3 |
| 10 | **Grinăuți-Raia** | 44 | auth 2 |
| 11 | **Bîrlădeni** | 46 | auth 1+2 |
| 12 | **Paladea** | 48 | auth 2 |
| 13 | **Ruseni** | 53 | auth 1+2 |
| 14 | Slobotca | 55.7 | ruta 3 |
| 15 | **Edineț** | 63 | auth 1 |
| 16 | **Cupcini** | 69 | auth 1 |
| 17 | Brătușeni | 73.1 | segm. 106 |
| 18 | Brătușenii Noi | 82.0 | segm. 106 |
| 19 | Mihailenii Noi | 86.8 | segm. 106 |
| 20 | Petrom Rîșcani | 95.4 | segm. 106 |
| 21 | Intersecția Rîșcani | 95.4 | segm. 106 |
| 22 | Recea | 103.1 | segm. 106 |
| 23 | Intersecția Pelenia | 114.1 | segm. 106 |
| 24 | Corlăteni | 119.0 | segm. 106 |
| 25 | **Bălți** | 133 | auth 1+2 |
| 26 | Bilicenii Noi | 142.7 | segm. 106 |
| 27 | Bilicenii Vechi | 147.6 | segm. 106 |
| 28 | Sîngerei | 159.2 | segm. 106 |
| 29 | Grigorăuca | 163.1 | segm. 106 |
| 30 | Copăceni | 165.0 | segm. 106 |
| 31 | Prepelița | 173.6 | segm. 106 |
| 32 | Bănești | 178.0 | segm. 106 |
| 33 | Ratuș | 186.6 | segm. 106 |
| 34 | **Intersecția Soroca** | 192 | auth 1 |
| 35 | Zăhăreuca | 197.0 | segm. 106 |
| 36 | Ciocîlteni | 211.7 | segm. 106 |
| 37 | **Orhei** | 218 | auth 1 |
| 38 | Peresecina | 237.4 | segm. 106 |
| 39 | Pașcani | 247.7 | segm. 106 |
| 40 | Măgdăcești | 250.5 | segm. 106 |
| 41 | Stăuceni | 256.8 | segm. 106 |
| 42 | **Chișinău** | 266 | auth 1 |

**Notă:** 13 puncte etalon (bold) provin din autorizații.

## Entry path extra — Briceni → Ocnița (doar pentru ruta 29)

| # | Oprire | Km de la Briceni |
|---|---|---|
| 1 | **Briceni** | 0 |
| 2 | Trebisăuți | 18 |
| 3 | Corestăuți | 24.7 |
| 4 | Hădărăuți | 32 |
| 5 | S. Ocnița | 40 |
| 6 | **Ocnița** (joncțiune) | 47 |

Apoi continuă pe master-list de la Ocnița (km 26 din Otaci) până la Chișinău.

**Total ruta 29 Briceni → Chișinău: 287 km**

## Rute pe acest tarif (3)

| crm_route_id | Nume | Punct start (numerar) | Lungime | Observații |
|---|---|---|---|---|
| 3 | Chișinău - Ocnița | **Ocnița** | 240 km | folosește subset master de la oprirea 7 |
| 21 | Chișinău - Otaci | **Otaci** | 266 km | folosește master complet, **autorizație PARCUL** |
| 29 | Ocnița - Chișinău | **Briceni** | 287 km | folosește entry path + master de la Ocnița; "scoate steluta" — opriri Briceni→S.Ocnița activate |

## Modificări față de starea anterioară

- **Ruta 29:** scos prefixul `*/` de la opriri Briceni, Trebisăuți, Corestăuți, Hădărăuți, S. Ocnița (devin opriri active)
- Adăugat **Frunza, Birnova, Lencauti, Mereseuca, Valcinet** ca opriri etalon (din auth 1)
- Adăugat **Grinăuți-Raia, Paladea** ca opriri etalon (din auth 2)
- Recalculat km pentru toate opririle
- **3 puncte de start diferite** pe același tarif — caz unic

## Reguli pentru afișare în numerar

- **Ruta 21 (Otaci):** afișează lista completă de 42 opriri din Otaci
- **Ruta 3 (Ocnița):** afișează de la Ocnița (oprirea 7) — 36 opriri
- **Ruta 29 (Briceni):** afișează entry path Briceni→Ocnița (6 opriri) + master de la Ocnița — total 41 opriri
