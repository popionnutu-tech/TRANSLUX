'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sendToSfs } from './actions';

const lei = (n: number) => Number(n || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei';
interface Inv { id: number; invoice_series: string | null; invoice_number: string | null; created_at: string; efactura_status: string | null; client_name: string | null; net: number }

export default function FiscalClient({ invoices, truncated = false, pending = false }: { invoices: Inv[]; truncated?: boolean; pending?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState('');
  async function send(id: number) {
    setBusy(id); setErr('');
    // Fără catch, o respingere de server (ex. factură care nu e a ta) ar trece nevăzută: butonul doar s-ar reseta.
    try { await sendToSfs(id); router.refresh(); }
    catch (e: any) { setErr(e?.message || 'Nu am putut marca factura'); }
    finally { setBusy(null); }
  }
  return (
    <div className="card">
      <h2>Facturi de vânzare (e-Factura)</h2>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '8px 0 14px' }}>
        <a className={pending ? 'badge gray' : 'badge info'} href="/piese/fiscal">Toate</a>
        {/* „De trimis" ocolește plafonul de 500 — altfel o factură veche nesincronizată ar deveni inaccesibilă. */}
        <a className={pending ? 'badge info' : 'badge gray'} href="/piese/fiscal?pending=1">Doar de trimis</a>
      </div>
      {err && <div className="alert danger">{err}</div>}
      {truncated && (
        <div className="alert info">
          Lista e prea lungă și a fost tăiată — se afișează cele mai recente {invoices.length} de facturi.
          Pentru cele nesincronizate mai vechi, folosește „Doar de trimis".
        </div>
      )}
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
