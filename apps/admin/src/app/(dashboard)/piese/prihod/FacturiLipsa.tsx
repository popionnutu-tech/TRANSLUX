'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ReceiptEditModal from './ReceiptEditModal';
import type { RecepcieFaraFactura } from '@/lib/piese';

type Opt = { id: number; label: string };

const lei = (n: number) => Number(n || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Lista roșie: recepțiile fără factură fiscală.
//
// Stă DEASUPRA tab-urilor, nu într-un tab al ei. Un tab se deschide când îți amintești de el — ori tocmai
// asta e problema: factura vine peste o săptămână, după ce marfa a fost deja pusă pe raft și uitată. Aici
// se vede fără să cauți, de fiecare dată când se face o recepție nouă.
//
// Restrânsă implicit, ca să nu ocupe ecranul lui Eduard în fiecare zi: se vede doar linia cu cifrele.
export default function FacturiLipsa({ randuri, suppliers }: { randuri: RecepcieFaraFactura[]; suppliers: Opt[] }) {
  const [deschis, setDeschis] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const router = useRouter();

  if (!randuri.length) return null;

  const rosii = randuri.filter((r) => !r.numar);
  const galbene = randuri.filter((r) => r.numar);
  const vechime = Math.max(...randuri.map((r) => r.zile));
  const bani = randuri.reduce((s, r) => s + Number(r.suma || 0), 0);

  return (
    <div className="card" style={{
      marginBottom: 16, borderLeft: '4px solid var(--danger, #c0392b)',
      background: 'rgba(192, 57, 43, 0.04)',
    }}>
      <div className="row" style={{ alignItems: 'center', gap: 12, flexWrap: 'wrap', cursor: 'pointer' }}
        onClick={() => setDeschis((v) => !v)}>
        <strong style={{ color: 'var(--danger, #c0392b)' }}>
          {deschis ? '▾' : '▸'} Facturi fiscale lipsă — {randuri.length}
        </strong>
        <span className="muted" style={{ fontSize: 13 }}>
          {rosii.length} fără număr{galbene.length ? ` · ${galbene.length} fără dată` : ''}
          {' · '}marfă de {lei(bani)} lei{vechime > 0 ? ` · cea mai veche de ${vechime} zile` : ''}
        </span>
        <span className="btn btn-outline" style={{ marginLeft: 'auto', padding: '2px 10px', fontSize: 12 }}>
          {deschis ? 'Ascunde' : 'Vezi lista'}
        </span>
      </div>

      {deschis && (
        <>
          <p className="muted" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
            Fără numărul facturii fiscale, recepția nu poate pleca în contabilitate — n-ar avea cum să fie
            regăsită acolo. Fără data facturii pleacă, dar cu ziua intrării în depozit; dacă cele două cad
            în luni diferite, marfa intră la contabil în luna greșită.
          </p>
          <table style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th style={{ width: 70 }}>Nr.</th>
                <th style={{ width: 110 }}>Intrată</th>
                <th>Furnizor</th>
                <th style={{ width: 120 }}>Serie/Nr</th>
                <th>Ce lipsește</th>
                <th className="num" style={{ width: 70 }}>Poziții</th>
                <th className="num" style={{ width: 110 }}>Suma</th>
                <th style={{ width: 130 }}></th>
              </tr>
            </thead>
            <tbody>
              {randuri.map((r) => (
                <tr key={r.id}>
                  <td className="muted">{r.id}</td>
                  <td className="muted">
                    {r.data}
                    {r.zile > 30 && <div style={{ fontSize: 11, color: 'var(--danger, #c0392b)' }}>de {r.zile} zile</div>}
                  </td>
                  <td><strong>{r.furnizor || <span className="muted">— fără furnizor —</span>}</strong></td>
                  <td className="muted">{[r.serie, r.numar].filter(Boolean).join(' ') || '—'}</td>
                  <td style={{ fontSize: 12, color: r.numar ? 'var(--warn, #b45309)' : 'var(--danger, #c0392b)' }}>
                    {!r.numar
                      ? '⛔ numărul facturii — nu se poate trimite în 1C'
                      : '⚠ data facturii — pleacă cu ziua intrării'}
                  </td>
                  <td className="num">{r.pozitii}</td>
                  <td className="num">{lei(r.suma)}</td>
                  <td>
                    <button className="btn btn-primary" style={{ padding: '2px 10px', fontSize: 12, whiteSpace: 'nowrap' }}
                      onClick={() => setEditId(r.id)}>✎ Completează</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {editId != null && (
        <ReceiptEditModal
          docId={editId}
          suppliers={suppliers}
          onClose={() => setEditId(null)}
          // Reîmprospătarea vine de la server: documentul completat trebuie să DISPARĂ din listă, nu doar
          // să se închidă fereastra. Altfel ar rămâne acolo până la următoarea încărcare a paginii și
          // omul ar crede că nu s-a salvat.
          onSaved={() => { setEditId(null); router.refresh(); }}
        />
      )}
    </div>
  );
}
