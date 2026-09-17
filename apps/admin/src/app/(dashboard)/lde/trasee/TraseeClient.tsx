'use client';

import { useMemo, useState } from 'react';
import type { TraseuRand, ImpacareZi, PropuneriRezultat } from './actions';

const NUME_UZINE: Record<string, string> = {
  DRAXELMAIER_BALTI: 'Draxelmaier Bălți',
  SEBN_ORHEI: 'SEBN Orhei',
  LEAR_UNGHENI: 'LEAR Ungheni',
  LEAR_FLORESTI: 'LEAR Florești',
  TROX_BRICENI: 'Trox Briceni',
  SEBN_STRASENI: 'SEBN Strășeni',
};

export default function TraseeClient({ trasee, impacare, propuneri }: { trasee: TraseuRand[]; impacare: ImpacareZi[]; propuneri: PropuneriRezultat }) {
  const [uzina, setUzina] = useState<string>('toate');
  const uzine = useMemo(() => [...new Set(trasee.map((t) => t.uzina_id))].sort(), [trasee]);
  const randuri = useMemo(
    () => (uzina === 'toate' ? trasee : trasee.filter((t) => t.uzina_id === uzina)),
    [trasee, uzina],
  );

  const kmGoiLuna = useMemo(() => {
    if (!impacare.length) return null;
    const zile = impacare.length;
    const gol = impacare.reduce((s, z) => s + z.km_gol, 0);
    return Math.round((gol / zile) * 30);
  }, [impacare]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Traseele rutelor de uzină</h1>
        <p className="text-sm text-gray-600 mt-1">
          Traseul ideal al fiecărei curse, dedus din urma GPS reală — nu desenat de mână. Satele sunt
          etichete lipite pe urmă, nu puncte prin care rutăm.
        </p>
      </div>

      {/* ── împăcarea: fără ea, cifrele de aici și cele din km-zilnic n-ar avea cum fi comparate ── */}
      <div className="card p-4">
        <h2 className="font-medium mb-2">Împăcarea kilometrilor</h2>
        <p className="text-xs text-gray-500 mb-3">
          km total (aceeași cifră ca în km-zilnic și în salarii) = utili + goi + neclasificați +
          neatribuiți. <strong>Neatribuiții se calculează scăzând</strong>, tocmai ca linia să poată
          prinde un segment pierdut. Facturarea rămâne pe km total, neatinsă.
        </p>
        {kmGoiLuna !== null && (
          <p className="text-sm mb-3">
            Ritmul km-ilor goi: <strong>{kmGoiLuna.toLocaleString('ro-RO')} km/lună</strong>. Cei mai
            mulți sunt <em>necesari</em> — autobuzul trebuie să ajungă de acasă la primul sat și să se
            întoarcă. Cât din ei se poate muta se vede la propunerea de repartizare.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left border-b">
              <th className="py-1">Zi</th><th className="text-right">km total</th><th className="text-right">utili</th>
              <th className="text-right">goi</th><th className="text-right">neclasificați</th>
              <th className="text-right">neatribuiți</th><th className="text-right">mașini eșuate</th>
            </tr></thead>
            <tbody>
              {impacare.map((z) => (
                <tr key={z.gps_date} className="border-b last:border-0">
                  <td className="py-1">{z.gps_date}</td>
                  <td className="text-right">{z.km_total.toLocaleString('ro-RO')}</td>
                  <td className="text-right">{z.km_plin.toLocaleString('ro-RO')}</td>
                  <td className="text-right font-medium">{z.km_gol.toLocaleString('ro-RO')}</td>
                  <td className="text-right text-gray-500">{z.km_necunoscut.toLocaleString('ro-RO')}</td>
                  <td className={`text-right ${Math.abs(z.km_neatribuiti) > z.km_total * 0.15 ? 'text-amber-700 font-medium' : 'text-gray-500'}`}>
                    {z.km_neatribuiti.toLocaleString('ro-RO')}
                  </td>
                  <td className="text-right">{z.masini_esuate > 0 ? <span className="text-red-700 font-medium">{z.masini_esuate}</span> : '—'}</td>
                </tr>
              ))}
              {!impacare.length && <tr><td colSpan={7} className="py-3 text-gray-500">Încă nu s-au calculat curse.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── propunerile: OPRITE 17.09.2026 după verificarea pe date. ── */}
      <div className="card p-4 border-2 border-amber-400 bg-amber-50">
        <h2 className="font-medium mb-2">⚠ Propunerile de repartizare sunt oprite — nu acționa pe ele</h2>
        <p className="text-sm mb-2">
          Verificarea din 17.09 a găsit că formula de cost <strong>omite tocmai drumul care arde cei
          mai mulți kilometri</strong>: poarta ↔ acasă. Baza unei mașini e la 19,1 km în medie de
          poartă — 38,3 km dus-întors — iar costul calculat pentru toată ziua e 24,7 km. Bucata omisă
          e mai mare decât tot ce se măsoară.
        </p>
        <ul className="text-sm list-disc ml-5 mb-2 space-y-1">
          <li>Două propuneri verificate manual <strong>cresc</strong> kilometrii, nu îi taie: una cu
            16,6 km/zi, alta cu 115 km/zi. Ambele erau schimburi între uzine diferite.</li>
          <li><strong>Jumătate din listă</strong> stătea pe două „case" care nu există: o bază
            calculată ca mediană separată pe latitudine și pe longitudine (iese un punct în câmp,
            unde mașina n-a dormit niciodată) și un garaj din Bălți unde dorm cinci mașini, luat
            drept casa a cinci șoferi.</li>
          <li>Comasarea raporta <strong>de 5,4 ori</strong> mai mult decât economisește — 241 km/zi
            în loc de 44 — iar toate cele șase propuneri erau imposibile pe ceas.</li>
          <li>Pagina citea <strong>1.000 din 3.438</strong> de atribuiri, tăcut: cifra descria un
            grafic vechi de 16 zile.</li>
        </ul>
        <p className="text-xs text-gray-600">
          Măsurarea de mai jos — traseele, satele, km-ii goi, împăcarea — <strong>rămâne validă</strong>:
          ea nu depinde de formula de cost. Propunerile revin după ce costul include segmentul
          poartă ↔ acasă, baza se ia ca punct real de dormit, iar comasarea raportează diferența.
        </p>
      </div>


      {/* ── zonele unde schimbul între șoferi NU e de ajuns ── */}
      {(propuneri.comasari.length > 0 || propuneri.angajari.length > 0) && (
        <div className="card p-4">
          <h2 className="font-medium mb-1">Zone unde schimbul de șoferi nu ajunge</h2>
          <p className="text-xs text-gray-500 mb-3">
            Când două rute pleacă din aceeași zonă dar niciun șofer nu locuiește acolo, mutarea
            oamenilor între rute doar plimbă problema. Aici sunt celelalte două pârghii.
          </p>

          {propuneri.comasari.length > 0 && (
            <>
              <h3 className="text-sm font-medium mt-2 mb-1">Un singur șofer ar putea lua ambele ture</h3>
              <p className="text-xs text-gray-500 mb-2">
                Turele nu se suprapun, deci un om le poate face pe amândouă. Celălalt se eliberează —
                economia scrisă sunt km-ii lui goi, și e reală <strong>doar dacă nu e nevoie în altă
                parte</strong>. Asta o decizi tu, nu calculul.
              </p>
              <table className="w-full text-sm mb-4">
                <thead><tr className="text-left border-b"><th className="py-1">Zona</th><th>Rutele</th><th>Rămâne</th><th>Se eliberează</th><th className="text-right">Economie</th></tr></thead>
                <tbody>
                  {propuneri.comasari.map((c, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1">{c.zona}</td>
                      <td className="text-gray-500">{c.rute.join(' + ')}</td>
                      <td>{c.ramane.nume}</td>
                      <td className="text-gray-500">{c.se_elibereaza.nume}</td>
                      <td className="text-right font-medium">−{c.economie_km_zi} km/zi</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {propuneri.angajari.length > 0 && (
            <>
              <h3 className="text-sm font-medium mt-2 mb-1">Cât s-ar tăia cu un șofer care stă chiar acolo</h3>
              <p className="text-xs text-gray-500 mb-2">
                Plafonul a ce se poate câștiga din grafic. Dacă cifra e mare, <strong>niciun schimb
                între șoferii de acum n-o poate atinge</strong> — pentru că niciunul nu locuiește în
                zonă. Atunci întrebarea nu mai e de grafic, ci de angajare.
              </p>
              <table className="w-full text-sm">
                <thead><tr className="text-left border-b"><th className="py-1">Zona</th><th>Rutele</th><th>Cine le face acum</th><th className="text-right">Acum</th><th className="text-right">Cu om local</th><th className="text-right">Diferența</th></tr></thead>
                <tbody>
                  {propuneri.angajari.map((a, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1">{a.zona}</td>
                      <td className="text-gray-500">{a.rute.join(', ')}</td>
                      <td className="text-gray-500">{a.soferi_acum.join(', ') || '—'}</td>
                      <td className="text-right">{a.km_acum}</td>
                      <td className="text-right">{a.km_daca_local}</td>
                      <td className="text-right font-medium">−{a.economie_km_zi} km/zi</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      <div className="flex gap-2 items-center">
        <label className="text-sm">Uzina:</label>
        <select className="border rounded px-2 py-1 text-sm" value={uzina} onChange={(e) => setUzina(e.target.value)}>
          <option value="toate">toate</option>
          {uzine.map((u) => <option key={u} value={u}>{NUME_UZINE[u] ?? u}</option>)}
        </select>
        <span className="text-sm text-gray-500">{randuri.length} curse</span>
      </div>

      <div className="card p-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left border-b">
            <th className="py-1">Rută</th><th>Schimb</th><th>Sens</th>
            <th>Traseul declarat</th><th>Satele deduse din GPS</th>
            <th className="text-right">km etalon</th><th className="text-right">curse</th>
            <th className="text-right">abatere</th><th className="text-right">km goi</th>
          </tr></thead>
          <tbody>
            {randuri.map((t) => (
              <tr key={`${t.factory_route_id}-${t.shift_number}-${t.slot}-${t.sens}`} className="border-b last:border-0 align-top">
                <td className="py-1 whitespace-nowrap">{NUME_UZINE[t.uzina_id] ?? t.uzina_id} #{t.route_number}</td>
                <td>{t.shift_number}{t.slot > 1 ? ` / slot ${t.slot}` : ''}</td>
                <td>{t.sens}</td>
                <td className="text-gray-500 max-w-xs">{t.stops_in_order ?? '—'}</td>
                <td className="max-w-md">
                  {t.sate.length
                    ? t.sate.map((s) => (
                        <span key={s.nume} className="inline-block mr-2" title={`în ${Math.round(s.pondere * 100)}% din curse`}>
                          {s.nume}<span className="text-gray-400 text-xs"> {Math.round(s.pondere * 100)}%</span>
                        </span>
                      ))
                    : <span className="text-gray-400">—</span>}
                </td>
                <td className="text-right">
                  {t.km_median ?? <span className="text-gray-400" title={t.motiv_lipsa ?? ''}>{t.motiv_lipsa === 'etalon insuficient' ? 'insuficient' : '—'}</span>}
                </td>
                <td className="text-right">{t.observations}</td>
                <td className="text-right">{t.abatere_medie ?? '—'}</td>
                <td className="text-right">{t.km_goi_total ?? '—'}</td>
              </tr>
            ))}
            {!randuri.length && <tr><td colSpan={9} className="py-3 text-gray-500">Niciun etalon încă — agregatorul rulează după worker-ul de noapte.</td></tr>}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        «insuficient» = sub 5 curse observate. Nu se afișează o cifră cu aparență de adevăr; e același
        principiu ca la analitica de camioane, unde km-ul ideal lipsă se scrie ca atare, nu se inventează.
      </p>
    </div>
  );
}
