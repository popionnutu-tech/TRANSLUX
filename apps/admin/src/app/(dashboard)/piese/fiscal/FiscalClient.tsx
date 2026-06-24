'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sendToSfs } from './actions';

const lei = (n: number) => Number(n || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei';
interface Inv { id: number; invoice_series: string | null; invoice_number: string | null; created_at: string; efactura_status: string | null; client_name: string | null; net: number }

export default function FiscalClient({ invoices }: { invoices: Inv[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  async function send(id: number) { setBusy(id); try { await sendToSfs(id); router.refresh(); } finally { setBusy(null); } }
  return (
    <div className="card">
      <h2>Facturi de vânzare (e-Factura)</h2>
      {invoices.length === 0 ? <div className="empty">Nicio vânzare încă.</div> : (
        <table>
          <thead><tr><th>Factură</th><th>Client</th><th className="num">Fără TVA</th><th className="num">Cu TVA 20%</th><th>Status SFS</th><th>Acțiuni</th></tr></thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id}>
                <td>{(i.invoice_series || '') + (i.invoice_number || i.id)}</td>
                <td>{i.client_name || 'Persoană fizică'}</td>
                <td className="num">{lei(i.net)}</td>
                <td className="num">{lei(i.net * 1.2)}</td>
                <td>{i.efactura_status === 'SENT' ? <span className="badge ok">trimisă</span> : <span className="badge warn">de trimis</span>}</td>
                <td>
                  <a className="badge info" href={`/api/piese/efactura/${i.id}`}>⬇ XML UBL</a>{' '}
                  {i.efactura_status !== 'SENT' && <button className="badge gray" style={{ border: 'none', cursor: 'pointer' }} disabled={busy === i.id} onClick={() => send(i.id)}>{busy === i.id ? '…' : 'trimite SFS'}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
