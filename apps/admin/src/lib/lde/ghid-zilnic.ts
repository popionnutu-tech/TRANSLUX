// ============================================================================
// Ghidul zilnic al operatorului: unde, IERI, mașina a făcut km goi degeaba.
//
// Ion, 18.09.2026: «vreau mai mult focusul pe șoferi și unde putem simțitor economisi
// bani ca șoferii să nu facă extra km; vreau să înțeleg dacă este optimal sau nu
// repartizat șoferul, și care șofer din care sat ar fi mai optimal. NU am nevoie
// propuneri client, sau hartă zonă — am nevoie de ghid care să aducă zilnic aminte la
// operator zona unde economia ar fi semnificativă și noi nu o facem».
//
// De aceea ghidul stă pe MĂSURĂTOARE, nu pe model: fiecare cifră de mai jos e km parcurși
// ieri, citiți din urma GPS. Graficul se repetă de la o zi la alta, deci risipa de ieri e
// și risipa de azi — dar se arată ca fapt, nu ca prognoză.
//
// Trei tipare, fiecare cu instrucțiunea lui. Al patrulea lucru pe care îl face ghidul e
// să TACĂ: sub prag nu se afișează nimic, fiindcă o listă lungă nu se mai citește.
// ============================================================================
import { haversineKm, type Baza } from './trasee';

/** Cursă „de oraș": duce oamenii câțiva km, dar mașina vine de departe. */
export const PRAG_CURSA_SCURTA_KM = 15;
/** De la atâta gol în sus, o cursă scurtă e o risipă, nu o rotunjire. */
export const PRAG_GOL_MARE_KM = 40;
/** Pragul de la care o alertă merită atenția operatorului. */
export const PRAG_SEMNIFICATIV_KM = 25;
/** Peste atât, niciun șofer al uzinei nu e „din zonă". */
export const PRAG_NIMENI_IN_ZONA_KM = 25;

/**
 * Sub atât, casa șoferului E capătul rutei lui — și atunci „s-a dus acasă" înseamnă
 * „s-a repoziționat în zonă ca să ia oamenii", nu „s-a plimbat".
 *
 * Ion, 18.09: «dacă au două rute, înseamnă că trebuie să se întoarcă în zonă ca să ridice
 * oamenii de acolo, nu?». Cele patru cazuri pe care le raportasem greșit ca neglijență
 * locuiesc toate PE ruta lor: Vleju în Dumbrăvița = primul sat al rutelor #25 și #35,
 * Guzun în Zăicani = primul sat al lui #8, Juncu în Sărata Veche = primul sat al lui #26,
 * Neamtu în Căinarii Vechi = sat de pe #14. Pentru ei, drumul acasă costă zero în plus:
 * oricum trebuiau să ajungă acolo ca să înceapă strânsul.
 */
export const PRAG_ACASA_PE_RUTA_KM = 10;

/**
 * Sub atât între casa mașinii și poarta uzinei, mașina E la uzină — și atunci drumul gol
 * până în zonă și înapoi, la fiecare tură, e tiparul acceptat, nu risipă.
 *
 * Ion, 18.09: «sunt situații când mașina se află în locația în care este uzina și pentru
 * noi oricum este mult mai convenabil să facă în toate turele livrare goală tur sau retur».
 * Măsurat pe 17.09: 12 mașini (6 Draxelmaier, 3 Orhei, 2 Ungheni, 1 Florești), 377 km goi
 * din 3.730. Pentru ele nu se propune nici schimb de șofer, nici așteptare: alegerea e
 * făcută dinadins.
 */
export const PRAG_BAZA_LA_UZINA_KM = 10;

export type CursaMasurata = {
  vehicle_id: string | null;
  factory_route_id: string;
  eticheta: string;
  uzina_id: string;
  shift_number: number;
  sens: 'tur' | 'retur';
  km_real: number;
  km_goi: number;
  km_gol_acasa: number;
  /** partea din golul prin casă făcută ÎNTRE atingerile de poartă — plimbarea din pauză */
  km_gol_pauza: number;
  /** opriri de pe drumul „gol", în satele rutelor mașinii. Peste zero: drumul n-a fost gol. */
  opriri_gol_pe_traseu: number | null;
  /** prin câte sate ale rutelor mașinii a trecut drumul „gol" */
  sate_gol_pe_traseu?: number | null;
  km_livrare: number;
  prima_statie: (Baza & { locality?: string | null }) | null;
  driver_id: string | null;
  sofer: string | null;
  sat_sofer: string | null;
  baza: Baza | null;
  /** distanța de la casa mașinii la poarta uzinei; sub PRAG_BAZA_LA_UZINA_KM = mașină la uzină */
  km_baza_poarta?: number | null;
};

const laUzina = (c: CursaMasurata) =>
  c.km_baza_poarta != null && c.km_baza_poarta <= PRAG_BAZA_LA_UZINA_KM;

export type Alerta = {
  fel: 'neglijenta_asteptare' | 'cursa_scurta' | 'drum_acasa_evitabil' | 'livrare_mare' | 'nimeni_in_zona';
  uzina_id: string;
  ruta: string;
  shift_number: number;
  sofer: string | null;
  sat_sofer: string | null;
  /** km goi care s-ar tăia dacă se face ce scrie în `instructiune` */
  economie_km_zi: number;
  instructiune: string;
  /** cifrele pe care stă alerta, ca omul să poată verifica singur */
  detaliu: string;
};

const r1 = (x: number) => +x.toFixed(1);

export function ghidZilnic(curse: CursaMasurata[], prag = PRAG_SEMNIFICATIV_KM): Alerta[] {
  const out: Alerta[] = [];
  const cuBaza = curse.filter((c) => c.baza && c.prima_statie);
  // o cursă își dă km-ii goi O SINGURĂ DATĂ, chiar dacă se potrivește la două tipare
  const cheia = (c: CursaMasurata) => `${c.factory_route_id}|${c.shift_number}|${c.sens}`;
  const consumate = new Set<string>();

  // ── 1. O SINGURĂ TURĂ ÎN ZI ȘI S-A DUS ACASĂ = neglijență ──
  // Ion, 18.09: «dacă auto nu are alte ture decât una pe zi și se întoarce înapoi acasă în
  // sat — neglijență, trebuie să aștepte». E o REGULĂ, nu o sugestie: cu o singură tură,
  // mașina lasă oamenii la poartă dimineața și îi ia tot de la poartă seara. Orice drum
  // făcut între cele două se termină unde a început, deci nu duce pe nimeni nicăieri.
  // Măsurat pe 15-17.09: 68 de mașini-zile cu o tură, 1.023 km/zi duși acasă degeaba,
  // 48 de cazuri peste prag. La trei ture (Orhei) — 29 km/zi pe toată uzina.
  const peMasina = new Map<string, CursaMasurata[]>();
  for (const c of curse) {
    if (!c.vehicle_id) continue;
    if (!peMasina.has(c.vehicle_id)) peMasina.set(c.vehicle_id, []);
    peMasina.get(c.vehicle_id)!.push(c);
  }
  for (const lista of peMasina.values()) {
    const ture = new Set(lista.map((c) => c.shift_number)).size;
    if (ture !== 1) continue;
    // Dacă pe drumul „gol" sunt opriri în satele rutelor mașinii, drumul N-A FOST GOL:
    // mașina se întorcea în zonă ca să strângă oamenii celeilalte rute. Ion, 18.09: «dacă
    // au două rute, înseamnă că trebuie să se întoarcă în zonă ca să ridice oamenii de
    // acolo, nu?» — avea dreptate, iar măsurătoarea i-a dat dreptate pe toate cele patru
    // cazuri pe care le raportasem drept neglijență (3, 3, 1 și 1 opriri pe drumul „gol").
    // Acuzația costă încrederea în tot ghidul, deci pragul e ZERO opriri, nu „puține".
    if (lista.some((c) => (c.opriri_gol_pe_traseu ?? 0) > 0)) continue;
    // Și, mai important decât opririle: dacă omul stă PE ruta lui, drumul acasă e chiar
    // repoziționarea în zonă. Nu are ce economisi stând la poartă — ar trebui oricum să
    // se întoarcă acolo ca să înceapă strânsul.
    const peRuta = lista.some((c) => c.baza && c.prima_statie
      && haversineKm(c.baza, c.prima_statie) <= PRAG_ACASA_PE_RUTA_KM);
    if (peRuta) continue;
    // mașina bazată la uzină: drumul gol e tiparul ales dinadins (Ion, 18.09)
    if (lista.some(laUzina)) continue;
    // Se numără DOAR plimbarea din pauză, nu naveta. 293QVT pe 17.09 stă acasă peste
    // noapte, pleacă 70 km la lucru și se întoarce 73 km — n-are ce aștepta, mașina
    // trebuie să ajungă de acasă la lucru. Aceea e altă problemă (șofer prea departe),
    // cu altă instrucțiune, și apare la «livrare mare».
    const km = r1(lista.reduce((t, c) => t + c.km_gol_pauza, 0));
    if (km < prag) continue;
    const c = lista[0];
    for (const x of lista) consumate.add(cheia(x));
    out.push({
      fel: 'neglijenta_asteptare', uzina_id: c.uzina_id, ruta: c.eticheta,
      shift_number: c.shift_number, sofer: c.sofer, sat_sofer: c.sat_sofer,
      economie_km_zi: km,
      // NU acuză — ÎNTREABĂ. Pe 18.09 am raportat patru șoferi ca neglijenți; operaționalul
      // a răspuns că fac câte două ture, și au avut dreptate: drumurile „goale" treceau
      // prin 11-20 de sate ale rutelor lor. Din GPS nu se poate ști sigur dacă au urcat
      // oameni — opririle de urcare țin 30-40 de secunde, iar punctele vin la 30. Omul de
      // la grafic știe. Deci ghidul pune întrebarea și îi dă cifrele pe care să răspundă.
      instructiune: `Verifică: mașina a stat acasă între două atingeri de poartă, iar drumul`
        + ` dus-întors a fost ${km} km. Dacă n-a strâns pe nimeni pe drum, ei se pot tăia`
        + ` (să aștepte pe loc). Dacă a strâns — spune-mi, ca să nu-i mai cer asta.`,
      detaliu: `${km} km până acasă și înapoi`
        + (c.sat_sofer ? ` · ${c.sat_sofer}` : '')
        + ` · pe drum: ${lista.reduce((t, x) => t + (x.sate_gol_pe_traseu ?? 0), 0)} sate ale rutei,`
        + ` ${lista.reduce((t, x) => t + (x.opriri_gol_pe_traseu ?? 0), 0)} opriri văzute`,
    });
  }

  // ── 1b. la două sau mai multe ture, drumul acasă se cere doar dacă mașina s-a întors
  // TOT la poarta de unde a plecat. Cu mai multe ture, drumul poate fi chiar deplasarea
  // spre zona schimbului următor — acela s-ar fi făcut oricum, indiferent cine conduce.
  const peSchimb = new Map<string, CursaMasurata[]>();
  for (const c of curse) {
    const k = `${c.factory_route_id}|${c.shift_number}`;
    if (!peSchimb.has(k)) peSchimb.set(k, []);
    peSchimb.get(k)!.push(c);
  }
  for (const lista of peSchimb.values()) {
    const tur = lista.find((c) => c.sens === 'tur');
    const retur = lista.find((c) => c.sens === 'retur');
    if (!tur || !retur) continue;
    if (!(tur.km_gol_pauza > 0 && retur.km_gol_pauza > 0)) continue;
    if ((tur.opriri_gol_pe_traseu ?? 0) > 0 || (retur.opriri_gol_pe_traseu ?? 0) > 0) continue;
    // aceleași garduri ca la neglijență: cine stă pe rută se repoziționează, cine stă la
    // uzină face golul dinadins — niciunul nu e de întrebat
    if (laUzina(tur) || laUzina(retur)) continue;
    if ([tur, retur].some((c) => c.baza && c.prima_statie
      && haversineKm(c.baza, c.prima_statie) <= PRAG_ACASA_PE_RUTA_KM)) continue;
    if (consumate.has(cheia(tur)) || consumate.has(cheia(retur))) continue;
    const km = r1(tur.km_gol_pauza + retur.km_gol_pauza);
    if (km < prag) continue;
    out.push({
      fel: 'drum_acasa_evitabil', uzina_id: tur.uzina_id, ruta: tur.eticheta,
      shift_number: tur.shift_number, sofer: tur.sofer, sat_sofer: tur.sat_sofer,
      economie_km_zi: km,
      instructiune: 'Mașina a plecat de la poartă acasă și s-a întors tot la poartă.'
        + ' Dacă șoferul așteaptă pe loc, km-ii aceștia nu se fac deloc.',
      detaliu: `${r1(tur.km_gol_pauza)} km dus + ${r1(retur.km_gol_pauza)} km întors`,
    });
    consumate.add(cheia(tur)); consumate.add(cheia(retur));
  }

  // ── 2. cursa scurtă făcută de un șofer de departe ──
  // Cazul cel mai limpede din câte am măsurat: Draxelmaier #1 pe 17.09 — 4 km cu pasageri,
  // 100 km goi, toți pe drumul spre casa șoferului. Mașina a mers 100 km ca să ducă
  // oamenii 4. Pe 15-17.09: 20 de curse de felul ăsta, 4,4 km plini și 79 km goi în medie.
  for (const c of curse) {
    if (c.km_real >= PRAG_CURSA_SCURTA_KM || c.km_goi <= PRAG_GOL_MARE_KM) continue;
    // km-ii ei sunt deja numărați la «drumul acasă» — aceeași bucată de drum, altă
    // instrucțiune. Dacă ar apărea de două ori, totalul de sus ar fi o economie inventată.
    if (consumate.has(cheia(c))) continue;
    if (laUzina(c)) continue;
    out.push({
      fel: 'cursa_scurta', uzina_id: c.uzina_id, ruta: c.eticheta, shift_number: c.shift_number,
      sofer: c.sofer, sat_sofer: c.sat_sofer, economie_km_zi: r1(c.km_goi),
      instructiune: `Ruta se face lângă uzină (${r1(c.km_real)} km cu oameni), dar mașina vine de departe.`
        + ` Dă-o unui șofer care stă în zona uzinei.`,
      detaliu: `${r1(c.km_real)} km plini · ${r1(c.km_goi)} km goi`
        + (c.sat_sofer ? ` · șoferul stă la ${c.sat_sofer}` : ''),
    });
  }

  // ── 3. livrarea mare, când alt șofer al uzinei stă mai aproape ──
  // Aici e „care șofer din care sat ar fi mai optimal": se compară numai cu șoferii care
  // lucrează la ACEEAȘI uzină în ACELAȘI schimb — un schimb între ei se poate face mâine,
  // fără să se atingă nimic altceva.
  for (const c of cuBaza) {
    if (c.km_livrare < prag) continue;
    if (laUzina(c)) continue;   // stă la uzină: livrarea goală e acceptată, nu se schimbă omul
    const altii = cuBaza.filter((x) => x.uzina_id === c.uzina_id && x.shift_number === c.shift_number
      && x.driver_id && x.driver_id !== c.driver_id);
    if (!altii.length) continue;
    const acum = haversineKm(c.baza!, c.prima_statie!);
    let bun = null as null | CursaMasurata, bunKm = acum;
    for (const x of altii) {
      const d = haversineKm(x.baza!, c.prima_statie!);
      if (d < bunKm) { bunKm = d; bun = x; }
    }
    const castig = r1((acum - bunKm) * 2);   // dus-întors, o dată pe zi
    if (!bun || castig < prag) {
      if (acum >= PRAG_NIMENI_IN_ZONA_KM && !bun)
        out.push({
          fel: 'nimeni_in_zona', uzina_id: c.uzina_id, ruta: c.eticheta,
          shift_number: c.shift_number, sofer: c.sofer, sat_sofer: c.sat_sofer,
          economie_km_zi: 0,
          instructiune: 'Niciun șofer al uzinei nu stă mai aproape. Aici nu ajută graficul —'
            + ' ar ajuta un om din zonă.',
          detaliu: `cel mai apropiat capăt al rutei e la ${r1(acum)} km de casa lui`,
        });
      continue;
    }
    out.push({
      fel: 'livrare_mare', uzina_id: c.uzina_id, ruta: c.eticheta, shift_number: c.shift_number,
      sofer: c.sofer, sat_sofer: c.sat_sofer, economie_km_zi: castig,
      instructiune: `Dă ruta lui ${bun.sofer ?? '?'}`
        + (bun.sat_sofer ? ` (stă la ${bun.sat_sofer})` : '')
        + ', iar ruta lui dă-o omului de acum — lucrează în același schimb, la aceeași uzină.',
      detaliu: `acum ${r1(acum)} km până la prima stație, cu el ${r1(bunKm)} km`,
    });
  }

  // cele mai scumpe primele; o listă lungă nu se citește, deci contează ordinea
  return out.sort((a, b) => b.economie_km_zi - a.economie_km_zi);
}
