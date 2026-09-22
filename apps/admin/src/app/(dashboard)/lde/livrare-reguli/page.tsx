// Legea livrării (подача) pe rutele de uzină — Ion, 22.09.2026: «salvează în lde legea de
// analiza livrări la sebn, ca putem ulterior să ne întoarcem la ea» · «salvează în sistem».
//
// Pagina e STATICĂ intenționat: e regula, nu un raport. Cifrele din ea sunt cele măsurate
// pe 01–20.09.2026 și sunt datate, ca să se vadă când au fost adevărate. Rapoartele vii
// stau în altă parte (posterul de livrare, /lde/trasee).
//
// Cine schimbă ceva în livrare: cazurile din secțiunea «Cazurile care au format regula»
// sunt probele. O regulă nouă trebuie să le dea aceleași verdicte, altfel repară un caz
// și strică altul — așa s-a întâmplat de două ori în 19–22.09.

export const dynamic = 'force-dynamic';

import { getReguliUzine } from './actions';
import ReguliUzineClient from './ReguliUzineClient';

const CARD = 'card p-4 space-y-3';
const H2 = 'text-lg font-semibold';
const MIC = 'text-gray-500 text-sm';

function Unde({ children }: { children: React.ReactNode }) {
  return <span className="text-gray-400 text-xs font-mono ml-2">{children}</span>;
}

export default async function LivrareReguliPage() {
  const uzine = await getReguliUzine();
  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Livrarea (подача) — regula</h1>
        <p className={MIC}>
          Cum se socotesc km-ii goi ai șoferului pe rutele de uzină: ce intră, unde se taie, ce praguri
          există și de ce. Scrisă 22.09.2026, după ION-16, 18, 19, 20 și 24. Cifrele sunt măsurate pe
          01–20.09.2026.
        </p>
      </div>

      <section className={CARD}>
        <h2 className={H2}>Regulile pe uzină</h2>
        <p className={MIC}>
          Ion, 22.09: «fiecare livrare uzina are ai reguli, trebuie sa marcam». Regula de mai jos e cea
          generală, așa cum s-a așezat pe SEBN. Ce e altfel la o uzină se marchează aici — iar cifrele
          din tabel se numără din bază la fiecare deschidere, nu se scriu de mână.
        </p>
        <ReguliUzineClient uzine={uzine} />
      </section>

      <section className={CARD}>
        <h2 className={H2}>1. Ce este livrarea</h2>
        <p>
          <b>Livrarea = km-ii pe care mașina îi face în afara rutei ca să ajungă la ea și să se întoarcă:
          de acasă la satul de start și înapoi.</b> Ion, 18.09: «ruta începe la primul sat din denumire
          și se termină la uzină; tot ce e în afara ei e livrare».
        </p>
        <p className={MIC}>
          NU sunt livrare: <b>brambura</b> (excesul zilelor ieșite din comun), <b>drumurile la service</b>,
          și <b>golul de pe rută</b> — întoarcerile goale între sat și poartă impuse de turele uzinei,
          care nu se pot optimiza.
        </p>
        <p className={MIC}>
          Sensul cifrei: cu un șofer care locuiește în satul de start, drumul ăsta nu mai există. De aceea
          se numără în lei și se arată pe șofer.
        </p>
      </section>

      <section className={CARD}>
        <h2 className={H2}>2. Unde se măsoară</h2>
        <ul className="list-disc ml-5 space-y-1">
          <li>pe fiecare cursă: <code>lde_route_run.km_livrare</code><Unde>etalon-write.mjs</Unde></li>
          <li>pe zi-mașină: <code>lde_route_day_contrib</code> (plin / gol / necunoscut / livrare)</li>
          <li>naveta făcută cu ALTĂ mașină: <code>lde_naveta_sofer</code><Unde>migr. 384</Unde></li>
        </ul>
        <p className={MIC}>
          Totul vine din urma GPS a mașinii, cursă cu cursă. Graficul scris de mână nu decide niciodată
          singur: Ion, 18.09 — «GPS-ul e faptic, cum a mers; graficul de mână nu».
        </p>
      </section>

      <section className={CARD}>
        <h2 className={H2}>3. Unde se taie livrarea — în ordinea de precedență</h2>
        <ol className="list-decimal ml-5 space-y-2">
          <li>
            <b>Satul din denumirea rutei.</b> Turul începe la prima intrare în raza satului (2 km),
            returul se termină la ultima ieșire. Cine locuiește în satul ăla iese cu livrare zero.
            <Unde>imparteLaSat</Unde>
          </li>
          <li>
            <b>Satul de start REAL</b>, dedus din opririle care se repetă: satul în care autobuzul
            oprește în ≥60% din tururi, pe fiecare schimb, cel mai devreme pe traseu. Bate satul din
            denumire când e mai departe de poartă — startul real poate doar să lungească ruta, nu s-o
            scurteze. Ion, 19.09: «dacă asta se întâmplă sistematic, zilnic — e rută; scrii sub
            denumirea rutei primul sat de unde urcă».
            <Unde>migr. 380 · lde_route_etalon.sat_start_real</Unde>
          </li>
          <li>
            <b>Prima urcare reală a cursei</b>, când ruta oprește sistematic dincolo de satul de start
            (≥60% din tururi au cel puțin o oprire mai departe de poartă decât startul). Nu poți fi gol
            după ce ai luat primul om. Ion, 21.09: «nu are cum la 812MUM așa să fie, de la Cucuruzeni la
            Crihana e 4 km».
            <Unde>migr. 385 · lde_route_etalon.taie_pe_oprire</Unde>
          </li>
          <li>
            <b>Tăietura la oprire</b>, ca rezervă, când satul din denumire nu e o localitate pe hartă
            (14% din rute) sau drumul îl ocolește.
            <Unde>taieLivrarea · capeteReale</Unde>
          </li>
        </ol>
        <p className={MIC}>
          Când drumul intră și în satul din nume, și în cel dedus, câștigă cel mai depărtat de poartă.
          Când o mașină are mai multe rute la aceeași uzină, se ia tăietura care lasă cea mai puțină livrare.
        </p>
      </section>

      <section className={CARD}>
        <h2 className={H2}>4. Ce se numără ca oprire de urcare</h2>
        <p>
          O oprire de <b>cel puțin 40 de secunde într-un sat</b>, sau de <b>cel puțin 2 minute oriunde</b>.
          Oamenii urcă într-un minut; 90 de secunde e pragul opririi în tabelul de opriri, nu al stației,
          de aceea urcările se citesc din urma brută, nu din <code>lde_gps_stops</code>.
        </p>
        <ul className="list-disc ml-5 space-y-1">
          <li>«într-un sat» = la cel mult <b>800 m</b> de centrul localității. Nu 2 km: la 2 km aproape
            orice punct din Moldova e «într-un sat» și regula n-ar mai despărți nimic. Nu 500 m, cât era
            până pe 21.09: centrul OSM e lângă biserică, iar stația stă la marginea șoselei — Cucuruzenii
            de Sus ieșea la 546–606 m și 20 de urcări rămâneau fără nume.</li>
          <li>nu se numără opririle la <b>≤250 m de parcarea mașinii</b> (parcarea nu e stație) și nici
            cele la <b>≤1 km de poarta uzinei</b>. Până pe 21.09 raza parcării era 500 m și înghițea
            chiar urcările șoferului din satul lui.</li>
        </ul>
        <p className={MIC}>Praguri în <code>etalon-write.mjs</code>: <code>RAZA_OPRIRE_SAT_KM</code>, <code>RAZA_PARCARE_KM</code>.</p>
      </section>

      <section className={CARD}>
        <h2 className={H2}>5. Brambura și service</h2>
        <p>
          <b>Brambura</b> = km-ii din afara rutei ai unei zile, peste ce face aceeași mașină într-o zi
          obișnuită: mediana zilelor ei din ultimele 60 + 15 km. Ion, 19.09: «ceva ieșit din comun, unic».
          Nu se desparte geometric de navetă — se citește ca exces. <b>Naveta = livrare − brambura.</b>
          <Unde>etalon-aggregate.mjs · km_brambura</Unde>
        </p>
        <p>
          <b>Service</b> = drumurile la parcul de reparații; sunt ale mașinii, nu ale șoferului, și ies
          din livrare.<Unde>migr. 381 · lde_locuri_cunoscute</Unde>
        </p>
        <p className={MIC}>
          Atenție la ordine: worker-ul scrie <code>km_brambura = 0</code> la fiecare zi refăcută, iar
          agregatorul îl umple după. Între un backfill și agregator, livrarea iese umflată.
        </p>
      </section>

      <section className={CARD}>
        <h2 className={H2}>6. Naveta făcută cu altă mașină</h2>
        <p>
          Ion, 21.09: «include in analitica si asta livrare». Când omul e dus la autobuz cu altă mașină,
          km-ii ăia sunt tot livrare. O zi-mașină intră dacă, în ziua aia:
        </p>
        <ul className="list-disc ml-5 space-y-1">
          <li>mașina <b>n-are nicio cursă proprie</b> (dacă are, km-ii ei sunt deja numărați);</li>
          <li>stă de <b>cel puțin două ori, câte ≥20 min</b>, la ≤300 m de locul unde staționează
            (≥45 min) un autobuz CU cursă;</li>
          <li>locul e la <b>peste 2 km de orice poartă</b>;</li>
          <li><b>baza ei</b> — locul cu cele mai multe minute din zi — e la <b>peste 5 km</b> de locul ăla.
            Condiția asta taie curtea comună, unde mai multe autobuze parchează împreună.</li>
        </ul>
        <p className={MIC}>
          Km-ii numărați sunt doar drumurile care leagă baza de punctul rutei; un ocol care nu se termină
          acolo nu intră. Prag de tipar: 3 zile.<Unde>naveta-sofer.mjs · migr. 384</Unde>
        </p>
      </section>

      <section className={CARD}>
        <h2 className={H2}>7. Cât costă un km</h2>
        <p className="font-mono text-sm bg-gray-50 p-3 rounded">
          lei/km = norma mașinii (l/100 km) × prețul ANRE al zilei + reparație + salariu
        </p>
        <ul className="list-disc ml-5 space-y-1">
          <li><b>reparație</b>: 1,50 lei/km la DAF (autobuz mare), 1,00 lei/km la restul;</li>
          <li><b>salariu</b>: 1,00 lei/km, la toate;</li>
          <li><b>norma</b> din <code>lde_vehicle_types</code>; mașina fără tip știut ia 12,5 l;</li>
          <li><b>prețul</b> din <code>lde_diesel_price</code>, al ZILEI în care s-au făcut km-ii; pe rând
            se arată media ponderată cu livrarea fiecărei zile.</li>
        </ul>
        <p className={MIC}>
          Ion, 21.09: «norma litri * pret anre + 1 leu/km reparatia la 20 locuri si 1.5 lei la daf + 1 leu
          salariu la sofer». La 35,89 lei/l: DAF 12,73 · Sprinter 312 5,77 · Sprinter 412 6,59 ·
          Sprinter 518 7,20.<Unde>ION-19 · naveta-image.ts</Unde>
        </p>
      </section>

      <section className={CARD}>
        <h2 className={H2}>8. Posterul din grupă</h2>
        <ul className="list-disc ml-5 space-y-1">
          <li>o linie pe <b>MAȘINĂ</b>, nu pe rută — omul face naveta o dată pe zi, nu o dată pe rută
            (ION-16);</li>
          <li>intră doar mașinile cu <b>peste 50 km/zi</b> de livrare și cel puțin 3 zile cu curse;</li>
          <li>se trimite <b>în fiecare luni</b>, pe cele 7 zile dinainte, pentru <b>SEBN Orhei + Strășeni</b>
            (ION-24; până pe 22.09 era la două săptămâni);</li>
          <li>sub tabel: km-ii neagreați (brambura) ai perioadei, cu unde a fost mașina și când.</li>
        </ul>
        <p className={MIC}>
          Grupa se ia din <code>app_config.livrare_poster_chat_id</code>; fără cheie nu pleacă nimic.
          Trimitere de mână: <code>/api/cron/livrare-poster?from=&amp;to=&amp;uzine=&amp;force=1</code>.
        </p>
      </section>

      <section className={CARD}>
        <h2 className={H2}>9. Cazurile care au format regula</h2>
        <p className={MIC}>
          Probele. O regulă nouă trebuie să le dea aceleași verdicte — altfel repară un caz și strică altul.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-1">Cazul</th>
                <th className="py-1">Ce se întâmplă pe teren</th>
                <th className="py-1">Verdictul corect</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b align-top">
                <td className="py-2 whitespace-nowrap">812MUM · Cociorvă<br /><span className={MIC}>ruta 2 «Cișmea»</span></td>
                <td className="py-2">Locuiește în Cucuruzeni și ia oameni din satul lui și din cele vecine
                  (Crihana, Cucuruzenii de Sus, Inculeț). Pe 38 de drumuri casă→poartă din 01–18.09,
                  toate 38 au cel puțin o oprire de urcare.</td>
                <td className="py-2"><b>20 km/zi livrare</b> (era 112). Ruta începe în buclă, nu la Cișmea.</td>
              </tr>
              <tr className="border-b align-top">
                <td className="py-2 whitespace-nowrap">552BRAO · Popescu<br /><span className={MIC}>Strășeni 1 «Vatici»</span></td>
                <td className="py-2">Stă în Chiperceni, ruta începe la Vatici, iar pe drumul dintre ele
                  NU urcă nimeni. Satele dincolo de start apar în ~28% din tururi.</td>
                <td className="py-2"><b>147 km/zi livrare</b> — drumurile chiar sunt ale șoferului.
                  Tăietura pe opriri i-ar da 77 în loc de 240: greșit.</td>
              </tr>
              <tr className="border-b align-top">
                <td className="py-2 whitespace-nowrap">073BRAO · Magalu<br /><span className={MIC}>ruta 25 «Vatici»</span></td>
                <td className="py-2">Autobuzul (820GXP) doarme la Vatici, deci are livrare 0. Omul e dus
                  acolo cu un Sprinter, de trei ori pe zi, care așteaptă lângă autobuz cât ține schimbul.</td>
                <td className="py-2"><b>208 km/zi</b> pe mașina de navetă. Fără regula din migr. 384 nu
                  se vedea nicăieri.</td>
              </tr>
              <tr className="border-b align-top">
                <td className="py-2 whitespace-nowrap">Curtea de la Fălești</td>
                <td className="py-2">Mai multe autobuze (827MUM, 807MUM, 783MUM…) parchează în aceeași
                  curte; unul stă lângă altul ore în șir.</td>
                <td className="py-2"><b>NU e navetă.</b> Se taie prin condiția «baza ei la peste 5 km de
                  punctul rutei».</td>
              </tr>
              <tr className="align-top">
                <td className="py-2 whitespace-nowrap">145BRAZ · Todirești</td>
                <td className="py-2">Doarme chiar la capătul rutei lui 456BRAX și face Todirești ↔ Ungheni;
                  3.233 km în septembrie, zero curse proprii.</td>
                <td className="py-2"><b>NU intră ca navetă</b> (baza = punctul rutei). De verificat separat
                  dacă duce șoferi sau oameni.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className={CARD}>
        <h2 className={H2}>10. Cifrele pe septembrie 2026 (01–20.09, SEBN Orhei)</h2>
        <ul className="list-disc ml-5 space-y-1">
          <li>livrare pe toată zona, întinsă pe o lună: <b>15.682 km ≈ 112.884 lei</b> (22 de zile
            lucrătoare + 4 sâmbete, la 35,89 lei/l);</li>
          <li>din care motorină: <b>2.240 l</b>; restul, reparație și salariu;</li>
          <li>cea mai mare linie: naveta lui Magalu, <b>23.682 lei/lună</b>, o mașină fără niciun pasager;</li>
          <li>o zi lucrătoare obișnuită: ~800 km de livrare, ~6.000 lei.</li>
        </ul>
        <p className={MIC}>
          Pentru comparație, înainte de reparațiile din 21–22.09 aceeași zonă ieșea 18.073 km și
          140.652 lei — diferența erau km de rută trecuți greșit la navetă.
        </p>
      </section>

      <section className={CARD}>
        <h2 className={H2}>11. Cum se recalculează</h2>
        <p className={MIC}>Pe VPS, în <code>/root/lde-worker</code>. Ordinea contează.</p>
        <ol className="list-decimal ml-5 space-y-1 font-mono text-xs">
          <li>node --env-file=.env gps-worker.mjs &lt;zile&gt; --write --no-learn</li>
          <li>node --env-file=.env etalon-aggregate.mjs --doar=start --write</li>
          <li>node --env-file=.env gps-worker.mjs &lt;zile&gt; --write --no-learn <span className="font-sans">(a doua oară: acum se mută tăietura)</span></li>
          <li>node --env-file=.env etalon-aggregate.mjs --doar=brambura --write</li>
          <li>node --env-file=.env etalon-aggregate.mjs --doar=naveta --write</li>
        </ol>
        <p className={MIC}>
          <code>--no-learn</code> e obligatoriu la re-rulări: fără el tronsoanele învățate se numără de
          două ori și se mișcă km-ii viitori, deci salariile. Fereastra regulii de 60% e de 60 de zile —
          dacă rescrii doar o lună, procentele ies diluate și regula nu se mută.
        </p>
      </section>

      <section className={CARD}>
        <h2 className={H2}>12. Ce rămâne deschis</h2>
        <ul className="list-disc ml-5 space-y-1">
          <li><b>Ruta 26 «Vatici → SEBN MD (ADM)»</b> a lui Popescu iese «ruta neatinsă» pe toate cursele,
            deși GPS-ul îl arată de 19 ori la poarta Orheiului în 20 de zile. Km-ii lui de Orhei nu se
            numără nicăieri.</li>
          <li><b>073BRAO în grafic</b> e trecut pe TROX Briceni ruta 1, la 200 km de unde umblă de fapt.</li>
          <li><b>145BRAZ</b> (Todirești ↔ Ungheni): de verificat pe urma brută dacă duce șoferi sau oameni.
            Dacă are opriri de urcare în sate, e rută neînregistrată, nu navetă.</li>
          <li>Startul real se alege <b>pe schimb</b>. La ruta 2, schimburile 1 și 3 n-au avut niciun sat
            peste 60% și au fost salvate de regula opririi. Dacă apar cazuri unde nici asta nu ajunge,
            întrebarea următoare e dacă startul trebuie luat pe rută, nu pe schimb.</li>
        </ul>
      </section>
    </div>
  );
}
