'use client';

import { useState, useEffect, useMemo, memo } from 'react';
import { code128BarsSvg, cleanCode128 } from '@/lib/code128';

export type SheetLabel = {
  partId: number; name: string; manufacturer: string; articleCode: string;
  barcode: string; unit: string; qty: number; price: number | null; markupPct: number | null;
};

// Foaia de etichete a unei recepții (migr. 318). Cerut de Eduard odată cu adaosul: „Печать этикеток?"
//
// De ce o FOAIE și nu modalul de o etichetă din Catalog: acolo se tipărește o piesă, cu un dialog de print
// pentru fiecare. La o recepție de 20 de poziții asta înseamnă 20 de căutări și 20 de dialoguri. Marfa se
// pune pe raft o singură dată — etichetele trebuie să iasă tot o dată.
//
// Câte bucăți din fiecare: implicit una per poziție (eticheta de raft). Cine lipește pe fiecare bucată
// poate cere cantitatea recepționată — de aceea numărul e editabil per rând, nu presupus.
// Plafon pe TOATĂ foaia. Fiecare etichetă e o pagină separată la tipărire și ~50 de dreptunghiuri SVG în
// pagină; câteva mii ar bloca previzualizarea de tipar a browserului. În baza reală cea mai mare cantitate
// pe o linie de recepție e 150, deci plafonul se poate atinge dintr-un singur clic.
const MAX_SHEET = 200;
const MAX_PER_PART = 99;

// „Câte una pe bucată" are sens doar pentru unități NUMĂRABILE. Pentru litri sau kilograme, eticheta e a
// raftului, nu a fiecărei unități — altfel un butoi de 150 de litri ar cere 150 de etichete.
const COUNTABLE = new Set(['buc', 'bucata', 'bucată', 'set', 'pereche', 'perechi']);
const isCountable = (unit: string) => COUNTABLE.has((unit || '').trim().toLowerCase());

export default function LabelSheet({ labels, onClose }: { labels: SheetLabel[]; onClose: () => void }) {
  // Escape închide, ca la orice altă fereastră a modulului.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);
  const [counts, setCounts] = useState<Record<number, number>>(
    () => Object.fromEntries(labels.map((l) => [l.partId, 1])),
  );
  const setCount = (id: number, v: number) =>
    setCounts((c) => ({ ...c, [id]: Math.max(0, Math.min(MAX_PER_PART, Math.floor(v) || 0)) }));

  // Barele se calculează O DATĂ PER PIESĂ, nu per copie: toate exemplarele aceleiași piese au același cod.
  // Fără asta, 500 de etichete din 10 poziții însemnau 500 de generări în loc de 10, refăcute la fiecare
  // tastă apăsată în orice câmp de cantitate.
  const barsByPart = useMemo(
    () => new Map(labels.map((l) => [l.partId, code128BarsSvg(cleanCode128(l.barcode), 60)])),
    [labels],
  );

  // Lista desfășurată: fiecare etichetă de tipărit devine un element.
  const sheet = labels.flatMap((l) => Array.from({ length: counts[l.partId] ?? 0 }, () => l));
  const total = sheet.length;
  const overCap = total > MAX_SHEET;

  return (
    <div className="label-overlay"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', zIndex: 1100, overflowY: 'auto' }}>
      {/* La tipărire rămâne DOAR foaia. `page-break-inside: avoid` ca o etichetă să nu fie tăiată în două
          de marginea paginii — la 58×40 mm asta ar strica exact codul de bare. */}
      {/* `position: fixed` pe FOAIE, nu `absolute` — și overlay-ul își pierde poziționarea și marginile.
          Cu `absolute`, blocul-container ar fi fost padding-box-ul overlay-ului (`fixed`, `padding: 5vh 16px`),
          deci `left:0; top:0` ar fi căzut la 16px dreapta și 5vh mai jos față de colțul hârtiei — pe o pagină
          de 58×40 mm, suficient ca să taie codul de bare. `LabelModal` din Catalog folosește tot `fixed`,
          din același motiv. */}
      <style>{`
        @media print {
          @page { size: 58mm 40mm; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body * { visibility: hidden !important; }
          .label-overlay { position: static !important; padding: 0 !important; background: none !important;
                           display: block !important; overflow: visible !important; }
          .label-overlay > .card { margin: 0 !important; padding: 0 !important; border: none !important;
                                   box-shadow: none !important; max-width: none !important; }
          .piese-sheet, .piese-sheet * { visibility: visible !important; }
          .piese-sheet { position: static !important; display: block !important; gap: 0 !important; }
          .piese-sheet .piese-label { border: none !important; page-break-after: always;
                                      break-after: page; page-break-inside: avoid; break-inside: avoid;
                                      margin: 0 !important; width: 58mm !important; height: 40mm !important; }
          .piese-sheet .piese-label:last-child { page-break-after: auto; break-after: auto; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="card" style={{ margin: 0, maxWidth: 1000, width: '100%' }}>
        <div className="row no-print" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>
            Etichete de raft <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· mărime reală 58×40 mm</span>
          </h2>
          <button className="btn btn-outline" style={{ padding: '2px 10px' }} onClick={onClose}>Închide</button>
        </div>

        {labels.length === 0 ? (
          <div className="empty no-print">
            Nicio piesă „de vânzare" în această recepție. Eticheta cu preț are sens doar pentru marfa de
            magazin — bifează „De vânzare" pe piesă dacă trebuie să ajungă pe raft.
          </div>
        ) : (
          <>
            <table className="no-print" style={{ marginBottom: 12 }}>
              <thead><tr><th>Piesă</th><th className="num">Recepționat</th><th className="num">Adaos</th><th className="num">Preț raft</th><th style={{ width: 110 }}>Etichete</th></tr></thead>
              <tbody>
                {labels.map((l) => (
                  <tr key={l.partId}>
                    <td>{l.name}{l.articleCode && <span className="muted"> · {l.articleCode}</span>}</td>
                    <td className="num">{l.qty} {l.unit}</td>
                    <td className="num">{l.markupPct == null ? '—' : `${l.markupPct}%`}</td>
                    {/* `0` nu e preț: view-ul întoarce 0 (nu NULL) pentru o piesă fără recepții cu cost,
                        iar o etichetă de raft cu „0 lei" pe ea ar ajunge în mâna clientului. */}
                    <td className="num"><strong>{!l.price ? '—' : `${l.price.toLocaleString('ro-RO')} lei`}</strong></td>
                    <td>
                      <input type="number" min={0} max={99} value={counts[l.partId] ?? 0}
                        onChange={(e) => setCount(l.partId, Number(e.target.value))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="row no-print" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span className="muted" style={{ fontSize: 12 }}>
                {total} {total === 1 ? 'etichetă' : 'etichete'} de tipărit
                {' · '}
                <button type="button" className="btn" style={{ padding: '2px 8px', fontSize: 12 }}
                  onClick={() => setCounts(Object.fromEntries(labels.map((l) => [
                    l.partId,
                    // Același plafon ca la introducerea manuală: butonul nu are voie să ocolească limita
                    // pe care omul o respectă. Iar la unități nenumărabile rămâne o singură etichetă.
                    isCountable(l.unit) ? Math.max(1, Math.min(MAX_PER_PART, Math.ceil(l.qty))) : 1,
                  ])))}>
                  câte una pe bucată
                </button>
              </span>
              <button className="btn btn-primary" disabled={total === 0 || overCap} onClick={() => window.print()}>
                🖨 Tipărește {total > 0 ? `(${total})` : ''}
              </button>
            </div>

            {overCap && (
              <div className="alert warn no-print">
                {total} de etichete e prea mult pentru o singură tipărire (maxim {MAX_SHEET}) — previzualizarea
                s-ar bloca. Micșorează numerele sau tipărește în două rânduri.
              </div>
            )}

            {/* Foaia nu se randează deloc peste plafon: altfel pagina ar încărca mii de coduri de bare
                doar ca să afișeze un avertisment că nu pot fi tipărite. */}
            {!overCap && (
              <div className="piese-sheet" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {sheet.map((l, i) => <Label key={`${l.partId}-${i}`} l={l} bars={barsByPart.get(l.partId) || ''} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Aceeași formă ca eticheta din Catalog (58×40 mm, cod Code128 scanabil + numărul dedesubt ca rezervă
// manuală). Diferența e doar că aici apar multe deodată.
const Label = memo(function Label({ l, bars }: { l: SheetLabel; bars: string }) {
  const codeText = cleanCode128(l.barcode);
  const sub = [l.manufacturer, l.articleCode && `Art: ${l.articleCode}`].filter(Boolean).join(' · ');
  return (
    <div className="piese-label" style={{ width: '58mm', height: '40mm', padding: '2mm', boxSizing: 'border-box', background: '#fff', color: '#000', fontFamily: 'Arial, sans-serif', display: 'flex', flexDirection: 'column', gap: '0.8mm', border: '1px solid #cbd5e1' }}>
      <div style={{ fontWeight: 700, fontSize: '8.5pt', lineHeight: 1.08, maxHeight: '8.5mm', overflow: 'hidden' }}>{l.name || '—'}</div>
      <div style={{ fontSize: '6.5pt', color: '#333', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub || ' '}</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', marginTop: '0.4mm' }}>
        <span style={{ fontSize: '12.5pt', fontWeight: 800 }}>
          {!l.price ? '— lei' : `${l.price.toLocaleString('ro-RO')} lei`}
        </span>
      </div>
      {bars ? (
        <>
          <div style={{ height: '9mm', width: '100%', marginTop: 'auto' }} dangerouslySetInnerHTML={{ __html: bars }} />
          <div style={{ fontFamily: 'monospace', fontSize: '7pt', textAlign: 'center', letterSpacing: '0.5px', lineHeight: 1 }}>{codeText}</div>
        </>
      ) : (
        <div style={{ fontSize: '7pt', color: '#888', marginTop: 'auto', textAlign: 'center', paddingBottom: '2mm' }}>fără cod de bare</div>
      )}
    </div>
  );
});
