# Instrucțiuni Admin Camere — TRANSLUX

## 1. Autentificare

1. Deschide browserul și accesează: **https://translux-web.vercel.app/login**
2. Introdu:
   - **Email:** `operator2026@translux.md`
   - **Parola:** `operator2026`
3. Apasă **INTRARE**

> Dacă ai primit alt email/parolă de la administrator — folosește-le pe acelea.

---

## 2. Pagina Numărare — Lista curselor

După autentificare vei vedea pagina **Numărare** cu lista tuturor curselor pe ziua curentă.

### Coloanele tabelului:

| Coloană | Ce arată |
|---------|----------|
| **Tur** | Ora plecării de la Nord |
| **Destinația** | Direcția cursei |
| **Retur** | Ora plecării retur |
| **Șofer** | Dropdown — selectează șoferul |
| **Mașina** | Dropdown — selectează vehiculul |
| **Status** | Starea cursei (vezi mai jos) |
| **Sumă** | Suma totală calculată (lei) |

### Statusuri:

| Status | Culoare | Ce înseamnă |
|--------|---------|-------------|
| **Neprocesat** | Gri | Cursa nu a fost procesată încă |
| **Nou** | Gri | Cursă nouă, fără activitate |
| **Tur gata** | Albastru | Direcția Tur a fost salvată, Retur în așteptare |
| **Finalizat** | Verde | Cursa completă (Tur + Retur salvate) |
| **🔒 email** | Portocaliu | Cursă blocată de alt operator |

### Selectarea datei:
- Folosește câmpul de dată din partea de sus pentru a naviga pe altă zi
- Implicit se arată ziua curentă

### Atribuirea șoferului și vehiculului:
- Selectează **Șofer** și **Mașina** din dropdown-uri **ÎNAINTE** de a deschide cursa
- Aceste câmpuri se salvează automat

---

## 3. Procesarea unei curse — Pas cu pas

### 3.1. Deschide cursa

1. Selectează **Șofer** și **Mașina** pe rândul cursei dorite
2. Apasă butonul **Deschide**
3. Se va deschide formularul de numărare cu două coloane: **Tur** (stânga) și **Retur** (dreapta)

### 3.2. Completarea direcției TUR

Vizionează videoclipul de la cameră și completează datele pentru fiecare stație:

#### Coloanele formularului:

| Coloană | Ce completezi |
|---------|---------------|
| **Nr** | Numărul stației (automat) |
| **Stația** | Numele stației (automat) |
| **Km** | Distanța de la start (automat) |
| **Total** | Câți pasageri sunt în salon ACUM |
| **Cob.** | Câți au coborât la această stație |
| **±** | Diferența față de stația precedentă (automat) |
| **Scurți** | Câți din cei coborâți erau „scurți" (doar cu tarif dublu) |

#### Cum introduci datele — navigare cu tastatura:

**Prima stație (de plecare):**
- Introdu **Total** (câți pasageri au urcat)
- Apasă **Enter** → cursorul sare la Total-ul stației următoare (copiază valoarea)

**Stațiile intermediare:**
- Introdu **Total** (câți pasageri sunt acum în salon)
- Apasă **Enter** → cursorul sare la câmpul **Cob.** (Coborâți)
- Introdu **Cob.** (câți au coborât; dacă nimeni — lasă gol sau scrie 0)
- Apasă **Enter**:
  - Dacă Cob. = 0 → cursorul sare la Total-ul stației următoare
  - Dacă Cob. > 0 și tariful dublu e activ → cursorul sare la **Scurți**
- Introdu **Scurți** (câți din coborâți erau pasageri scurți)
- Apasă **Enter** → se deschide popup-ul de distribuție
- În popup: distribuie scurții pe stațiile de unde s-au urcat → apasă **Confirmă**
- Cursorul sare la Total-ul stației următoare

**Ultima stație (destinația finală):**
- Total = 0 (toți au coborât)
- Cob. se completează automat

**Tasta Space:**
- Pe câmpul Total: sare la stația următoare dar lasă câmpul GOL (pentru introducere manuală)

#### Exemplu practic:

Ruta: Lipcani → Edineț → Bălți

| Stația | Total | Cob. | ± | Scurți |
|--------|-------|------|---|--------|
| Lipcani | 10 | — | +10 | — |
| Edineț | 10 | 3 | 0 | 2 |
| Bălți | 0 | 10 | -10 | — |

**Interpretare:** La Edineț au coborât 3 și au urcat 3 (10-10+3=3 urcați). Din cei 3 coborâți, 2 erau scurți (au urcat la Lipcani, au mers doar până la Edineț).

### 3.3. Salvare Tur

- După completarea tuturor stațiilor, verifică datele
- Apasă butonul **Salvează Tur**
- Coloana Tur devine read-only și arată **Salvat ✅**

### 3.4. Completarea direcției RETUR

- Coloana Retur devine activă
- Procedura este identică cu Tur-ul
- Vizionează videoclipul retur și completează datele

### 3.5. Salvare Retur

- Apasă **Salvează Retur**
- Cursa devine **Finalizat**
- Suma totală se calculează automat

### 3.6. Întoarcere la lista curselor

- Apasă **Înapoi** pentru a reveni la lista de curse
- Continuă cu următoarea cursă

---

## 4. Tarif dublu (Scurți / Lungi)

Când bifezi **„Tarif dublu (scurți / lungi)"** în formular:

- Apare coloana **Scurți** în tabel
- Veniturile se calculează separat:
  - **Pasageri lungi** — tarif pe km pentru distanțe > prag (implicit 65 km)
  - **Pasageri scurți** — tarif diferit pe km pentru distanțe ≤ prag
- Rezultatul arată separat: `Pasageri lungi: XXX lei` + `Pasageri scurți: YYY lei`

Dacă nu bifezi — se aplică un singur tarif pentru toți pasagerii.

---

## 5. Tab-ul Operatori

Accesibil din tab-ul **Operatori** din pagina Numărare.

### Crearea unui operator nou:
1. Apasă **Adaugă operator**
2. Completează:
   - **Nume** — numele complet
   - **Email** — adresa de email (va fi login-ul)
   - **Parola** — implicit `operator2026`, poți schimba
3. Apasă **Creează**
4. Noul operator va avea rolul **Operator** și va fi activ imediat

### Gestionarea operatorilor:
- **Dezactivează** — operatorul nu mai poate accesa sistemul
- **Activează** — restabilește accesul
- Nu poți dezactiva propriul cont

---

## 6. Tab-ul Tarife

Accesibil din tab-ul **Tarife** din pagina Numărare.

### Tarife curente:
- **Interurban lung** — tarif pe km pentru distanțe mari (implicit 0.94 lei/km)
- **Interurban scurt** — tarif pe km pentru distanțe mici (implicit 1.06 lei/km)
- **Suburban** — tarif suburban (implicit 1.20 lei/km)

### Setări:
- **Tarif dublu interurban** — activează/dezactivează separarea tarifelor
- **Prag scurt distanță (km)** — distanța maximă pentru tarif scurt (implicit 65 km)

### Istoric tarife ANTA:
- Tabel cu tarifele istorice pe perioade

---

## 7. Tab-ul Salariu

Accesibil din tab-ul **Salariu** din pagina Numărare.

### Ce arată:
- Tabel cu fiecare operator și cursele procesate pe luna selectată
- Coloane: **Operator**, **Curse interurbane**, **Curse suburbane**, **Total curse**, **Salariu**
- Click pe un operator → se extinde cu detalii pe fiecare zi

### Prețul pe cursă:
- Configurează **Preț interurban** și **Preț suburban** (lei/cursă) în partea de jos
- Apasă **Salvează** pentru a aplica

### Navigare:
- Săgețile ← → pentru a comuta între luni

---

## 8. Reguli importante

1. **Nu deschide o cursă deja blocată** de alt operator (vei vedea 🔒 și email-ul)
2. **Salvează Tur-ul ÎNAINTE** de a trece la Retur
3. **Selectează șoferul și vehiculul** înainte de a deschide cursa
4. **Verifică datele** înainte de salvare — după salvare nu mai poți modifica
5. **Coborâți (Cob.)** trebuie completat pe fiecare stație unde au coborât pasageri — chiar dacă totalul nu s-a schimbat!
6. **Scurții** se distribuie pe stațiile de unde s-au urcat în popup-ul de distribuție
7. **Deconectare** — apasă butonul din stânga jos când termini lucrul

---

## 9. Rezolvarea problemelor

| Problemă | Soluție |
|----------|---------|
| Nu pot deschide cursa | Verifică dacă e blocată de altcineva (🔒) |
| Nu văd coloana Scurți | Bifează „Tarif dublu" deasupra tabelului |
| Am greșit datele la Tur | Dacă nu ai salvat încă — corectează direct. Dacă ai salvat — contactează administratorul |
| Pagina nu se încarcă | Reîncarcă pagina (F5) sau verifică conexiunea la internet |
| Am uitat parola | Contactează administratorul pentru resetare |
