'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { salveazaRegulaUzinei, type RegulaUzinei } from './actions';

/**
 * «Fiecare livrare uzina are ai reguli, trebuie sa marcam» (Ion, 22.09.2026).
 * Cifrele sunt numărate din bază la fiecare deschidere; textul și steagul se marchează aici.
 */
export default function ReguliUzineClient({ uzine }: { uzine: RegulaUzinei[] }) {
  const router = useRouter();
  const [deschis, setDeschis] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [validata, setValidata] = useState(false);
  const [salvez, setSalvez] = useState(false);
  const [eroare, setEroare] = useState<string | null>(null);

  const incepe = (u: RegulaUzinei) => {
    setDeschis(u.id); setText(u.reguli ?? ''); setValidata(u.validata); setEroare(null);
  };
  const salveaza = async (id: string) => {
    setSalvez(true); setEroare(null);
    try {
      await salveazaRegulaUzinei(id, text, validata);
      setDeschis(null);
      router.refresh();
    } catch (e) {
      setEroare(e instanceof Error ? e.message : 'eroare necunoscută');
    } finally {
      setSalvez(false);
    }
  };
  const data = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-1">Uzina</th>
              <th className="py-1">Rute</th>
              <th className="py-1">Porți</th>
              <th className="py-1">Granițe învățate</th>
              <th className="py-1">Start real</th>
              <th className="py-1">Tăiere pe oprire</th>
              <th className="py-1">Regula</th>
            </tr>
          </thead>
          <tbody>
            {uzine.map((u) => (
              <tr key={u.id} className="border-b align-top">
                <td className="py-2">
                  <div className="font-medium">{u.nume}</div>
                  <div className="text-gray-400 text-xs">{u.oras}</div>
                  <div className={u.validata ? 'text-xs text-green-700' : 'text-xs text-amber-700'}>
                    {u.validata ? 'validată rută cu rută' : 'neverificată'}
                  </div>
                </td>
                <td className="py-2">{u.rute}</td>
                <td className="py-2">{u.porti}</td>
                <td className="py-2">{u.granite_invatate}/{u.granite_total}</td>
                <td className="py-2">{u.start_real}</td>
                <td className="py-2">{u.pe_oprire}</td>
                <td className="py-2 w-1/2">
                  {deschis === u.id ? (
                    <div className="space-y-2">
                      <textarea
                        className="border rounded px-2 py-1 text-sm w-full"
                        rows={4}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Ce e livrare la uzina asta, ce nu, ce e special față de regula generală."
                      />
                      <label className="flex gap-2 items-center text-xs">
                        <input type="checkbox" checked={validata} onChange={(e) => setValidata(e.target.checked)} />
                        verificată rută cu rută (intră implicit în posterul de livrare)
                      </label>
                      <div className="flex gap-2 items-center">
                        <button className="btn btn-primary" disabled={salvez} onClick={() => salveaza(u.id)}>
                          {salvez ? 'Se salvează…' : 'Salvează'}
                        </button>
                        <button className="btn btn-outline" disabled={salvez} onClick={() => setDeschis(null)}>Anulează</button>
                      </div>
                      {eroare && <p className="text-red-700 text-xs">{eroare}</p>}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {u.reguli
                        ? <p className="whitespace-pre-wrap">{u.reguli}</p>
                        : <p className="text-gray-400">nemarcată — se aplică regula generală de mai jos</p>}
                      <div className="flex gap-2 items-center">
                        <button className="text-red-700 text-xs underline" onClick={() => incepe(u)}>
                          {u.reguli ? 'Schimbă' : 'Marchează'}
                        </button>
                        {u.marcata_la && <span className="text-gray-400 text-xs">marcată {data(u.marcata_la)}</span>}
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-gray-500 text-sm">
        «Neverificată» nu înseamnă că nu se numără: mecanismul rulează pe toate uzinele, dar regula
        n-a fost confirmată acolo rută cu rută. Posterul de livrare pleacă implicit doar pe uzinele
        validate; celelalte se pot cere oricând cu <code>?uzine=</code>.
      </p>
    </div>
  );
}
