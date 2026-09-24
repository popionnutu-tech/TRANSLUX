// Regula de livrare LEAR, afișată pe pagina «Uzine» (ION-50; comasată în ION-54, 24.09.2026).
// Cifrele economiei sunt raport și stau pe /lde/reguli; aici e doar regula, citită din bază.

import Link from 'next/link';
import { getReguliLear } from './actions';

type Sectiune = { titlu: string; randuri: string[] };

// Textul are titluri «N. TITLU» și rânduri «N.M …» / «R1. …»; restul (antet, note) iese în afara secțiunilor.
function imparte(text: string): { antet: string[]; sectiuni: Sectiune[]; note: string[] } {
  const antet: string[] = []; const sectiuni: Sectiune[] = []; const note: string[] = [];
  for (const linie of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const titlu = linie.match(/^(\d+)\.\s+(.+)$/);
    if (titlu && titlu[2] === titlu[2].toUpperCase()) { sectiuni.push({ titlu: linie, randuri: [] }); continue; }
    if (/^[A-ZĂÂÎȘȚ]{2,}( [A-ZĂÂÎȘȚ]{2,})*\s*[(:]/.test(linie) && sectiuni.length) { note.push(linie); continue; }
    if (sectiuni.length) sectiuni[sectiuni.length - 1].randuri.push(linie); else antet.push(linie);
  }
  return { antet, sectiuni, note };
}

export default async function RegulaLear() {
  const r = await getReguliLear();
  const marcata = r.marcata_la
    ? new Date(r.marcata_la).toLocaleString('ro-RO', { timeZone: 'Europe/Chisinau', dateStyle: 'medium', timeStyle: 'short' })
    : null;
  if (!r.text) {
    return (
      <div className="page">
        <h2 className="text-xl font-semibold">Regula de livrare · LEAR Ungheni</h2>
        <p className="text-gray-500 text-sm">Nu e scrisă nicio regulă pentru LEAR Ungheni. Se marchează pe{' '}
          <Link href="/lde/livrare-reguli" className="underline">Livrare — regula</Link>.</p>
      </div>
    );
  }
  const { antet, sectiuni, note } = imparte(r.text);
  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Regula de livrare · LEAR Ungheni</h2>
        {antet.map((l) => <p key={l} className="text-gray-500 text-sm">{l}</p>)}
        <p className="text-gray-500 text-sm">
          {r.validata ? 'Validată' : 'Nevalidată'}{marcata ? ` · marcată ${marcata}` : ''} · se editează pe{' '}
          <Link href="/lde/livrare-reguli" className="underline">Livrare — regula</Link> · cifrele economiei:{' '}
          <Link href="/lde/reguli" className="underline">Raport livrări LEAR</Link>
        </p>
      </div>
      {sectiuni.map((s) => (
        <section key={s.titlu} className="card p-4 space-y-2">
          <h2 className="text-lg font-semibold">{s.titlu}</h2>
          <ul className="space-y-1 text-sm">
            {s.randuri.map((l) => <li key={l} className="whitespace-pre-wrap">{l}</li>)}
          </ul>
        </section>
      ))}
      {note.map((l) => (
        <p key={l} className="card p-4 text-sm whitespace-pre-wrap border-l-4 border-amber-400">{l}</p>
      ))}
    </div>
  );
}
