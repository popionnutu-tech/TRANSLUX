# Cum se economisesc kilometri — logica, pentru critică

**Un singur subiect: KILOMETRII.** Nu bani, nu personal, nu contracte. Întrebarea e dacă
raționamentul prin care spunem „aici se pot tăia km" e corect și complet.

Scris 17.09.2026. Ion: «mergem analiza logică strict în direcția cum pot economisi km și
logică aplicată, nu mergem în altă direcție».

---

## Ce se măsoară

Autobuzul doarme acasă la șofer. Deci în fiecare zi face drumuri **fără niciun pasager**:

1. **acasă → prima stație** (dimineața, ca să ia oamenii)
2. **ultima stație → acasă** (după ce i-a lăsat)
3. **între ture**, dacă face mai multe: se întoarce acasă și pleacă din nou
   — măsurat: în **576 din 723 de zile cu 2 ture (79,7%)** mașina are o oprire la sub 2 km
   de baza ei între schimburi

Măsurat pe 16 zile, 97 de autobuze analizate (flota GPS întreagă face 40.488 km/zi pe 170
de mașini):

| | km | cotă din cei analizați |
|---|---|---|
| Cu pasageri | 88.028 | 29,7% |
| **Goi** | **62.929** | **21,3%** |
| Neclasificați | 144.955 | **49,0%** |
| Total analizat | 295.912 | |

## Cele trei pârghii propuse

**1. Schimb între doi șoferi.** Dacă A stă lângă ruta lui B și invers, fac schimb.
Câștig calculat azi: **−112 km/zi** pe 52 de șoferi = 2,15 km/om/zi.

**2. Comasare.** Două rute din aceeași zonă (stațiile la sub 10 km), cu ture care nu se
suprapun, făcute de doi oameni. Unul le ia pe amândouă. Km-ii economisiți = drumurile
goale ale celuilalt — **dar numai dacă mașina lui chiar nu mai iese**.

**3. Angajare locală.** Câți km s-ar tăia dacă ar exista un șofer care stă în zonă.
E un plafon, nu o economie: arată cât NU se poate obține mutând oamenii de acum.

## Regulile de măsurare

| Regulă | Cifra care o susține |
|---|---|
| Unde stă șoferul = unde doarme autobuzul | 84% coincidență cu adresele scrise |
| Ruta începe la prima OPRIRE STABILĂ care nu e baza | înainte, 66% din „prime stații" erau la <1 km de bază |
| Stația e cea care SE REPETĂ, nu mediana | repetare medie 67%; sub 50% ruta iese din calcul |
| Plin/gol se decide pe CEAS, nu pe traseu | 041BRAU: același drum, 07:09 gol / 16:59 plin |
| Ziua e sumă de dus-întorsuri, nu lanț | 79,7% din zilele cu 2 ture trec pe acasă |

## Slăbiciunea cunoscută, deja semnalată

**Distanțele sunt în linie dreaptă**, nu pe drum. Factorul real e 1,25–1,40, adică o
eroare de **10–16 km pe om pe zi** — de cinci-șapte ori mai mare decât câștigul de 2,15
km/om/zi pe care îl propune pârghia 1. Deci unele perechi propuse pot fi **înrăutățiri**.
Avem urmele GPS reale și tronsoanele măsurate (`lde_route_legs`, `lde_route_legs_coord`);
nu ne trebuie motor de rutare, doar să le folosim în loc de linia dreaptă.

## Regulile puse de Ion, 17.09 — după runda 1 de critică

Astea nu sunt concluzii ale analizei, sunt cadrul în care are voie să lucreze.

### 1. Km-ul gol NU e dușmanul. Alternativa lui e adesea mai scumpă.

Ion: «des e ok să ducem auto în gol, în special dacă nu avem în acea zonă încă o rută în
alt schimb».

Când mașina n-are altceva de făcut în zona aia, drumul gol **ESTE serviciul** — nu o
risipă. Sistemul nu are voie să-l raporteze ca pierdere fără să arate alternativa.

### 2. Plafonul: 100 km/zi ≈ un om în plus.

Ion: «ca economie 100 km îți este mai puțin decât adăugarea încă un auto și încă un
salariu».

Verificat în cifre: 100 km/zi × 6,11 lei = **611 lei/zi ≈ 15.900 lei/lună**. Un șofer
categoria 2 costă 400 lei/zi × 26 = 10.400 lei + contribuții (~29%) ≈ **13.400 lei/lună**,
plus mașina. **Instinctul lui Ion se verifică: pragul e chiar pe acolo.**

**Regulă fermă: nicio propunere care cere o mașină în plus sau un om în plus nu are voie
să fie afișată dacă economisește sub ~100 km/zi.** Asta schimbă complet pârghia 3: o
angajare locală merită doar dacă taie mai mult decât costă omul — nu „oricât".

### 3. Întrebarea corectă e cu trei variante, nu cu două.

Ion: «aici se merită de văzut dacă se merită sau livrare din Bălți sau statul și așteptat
la fabrică».

Pentru fiecare pauză între ture, comparația e:
- **merge acasă** (măsurat: 24,3 km în medie),
- **așteaptă la uzină** (71,5 km — pentru că tot trebuie să ajungă la următoarea primă
  stație; câștigă doar în 9 din 87 de cazuri),
- **se repoziționează la altă bază**, de exemplu Bălți — variantă **nemăsurată încă**,
  și singura care ar putea bate primele două pe rutele lungi.

A treia variantă nu e în model deloc. Trebuie adăugată înainte să se propună ceva.

### 4. Deplasarea între uzine e planificată de client, nu o eroare.

Ion: «schimburile nu pot fi interzise, ele sunt planificate de client; dacă vorbim de
Draxelmaier, el are 2 uzine». Confirmat în date: SEBN are Orhei (părinte) și Strășeni
(copil, `parent_uzina_id`); Draxelmaier are două porți la ZEL.

Deci propunerea de a **interzice** perechile între uzine se retrage. Ele trebuie
**modelate corect** — adică prin reparația segmentului poartă ↔ acasă, nu ocolite.

## Întrebările pentru critică

1. **Definiția km-ilor goi e completă?** Ce alte drumuri fără pasageri face flota și nu le
   numărăm? (alimentare, service, deplasări între uzine, așteptări la poartă cu motorul
   pornit, curse anulate)
2. **Cei 49% neclasificați** — ce sunt? Dacă s-ar împărți ca partea cunoscută, km-ii goi
   ar fi ~42%, adică dublu. Cum se lămuresc?
3. **Cele trei pârghii sunt singurele?** Ce alte căi de a tăia km există, pur ca logică:
   reordonarea satelor într-o rută, două rute care se suprapun parțial, mașina care
   așteaptă 6 ore la uzină în loc să meargă acasă, alegerea MAȘINII (nu a șoferului)?
4. **Unde propune logica o „economie" care nu e o reducere reală de kilometri parcurși?**
5. Ce regulă de măsurare de mai sus e greșită sau prea slabă?
