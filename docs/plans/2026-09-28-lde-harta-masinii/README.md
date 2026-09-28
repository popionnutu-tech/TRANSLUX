# ION-130 — harta fiecărei mașini Drăxlmaier, pe schelet

Ion, 28.09.2026 (după analiza lui 446ASB): «ar fi bine să putem fiecare mașină s-o vizualizăm pe schelet, să fie o pagină separată
în LDE, în care drumurile se arată detaliat la fiecare mașină pe hartă, dacă ții minte cum primele artefacte».

- Modelul: artefactul «Traseele Dräxlmaier» (22.09) — lista mașinilor, harta, ziua pe curse; Leaflet + OSM.
- Datele: `harta-zi.mjs` (pas nou în `saptamanal.sh`, după ziua ideală) scrie în `lde_harta_zi` (migr. 431), pe mașină și zi:
  urma GPS simplificată la 15 m, tăiată pe intervalele «Ziua făcută, drum cu drum» (seg din economie-zile.json), opririle ≥ 5 min cu
  numele locului, casa, locurile nopții, ziua din raport și economia față de ziua ideală. Staționările intră cu ora t0/t1 (ION-128).
- Săptămâna 14.09: 195 de zile, 3,8 MB; 190/195 zile au km-ii urmei în ±5 % din totalul zilei (224BZP: urma cu 7–21 % mai mult, tracker zgomotos).
  La 5 zile cu «jumătăți» (024XKY, 414ASB) golul de rută nu e tăiat pe intervale nici în raport; urma îl acoperă.
- Pagina: /lde/harta?sapt=&m=&z= (ADMIN; urma și casa șoferului doar prin serverul panoului). Link «pe hartă» la fiecare zi din raport.
