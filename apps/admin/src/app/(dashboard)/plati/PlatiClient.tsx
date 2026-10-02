'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { anuleaza, comandaDeTest, creeazaPlataTest, returneaza, sincronizeaza, verificaRefund } from './actions';
import type { PlataRow, StareMaib } from './actions';
import type { ComandaPublica } from '@/lib/bilete/public';

interface Props {
  rows: PlataRow[];
  stare: StareMaib;
  banner: { ok: boolean; text: string } | null;
  /** Comanda de test de bilete la întoarcerea de la maib (/plati?bilet=<cod>), ION-193. */
  bilet?: ComandaPublica | null;
  plataNereusita?: boolean;
}

function maine(): string {
  const d = new Date(Date.now() + 86_400_000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
}

const RED = '#9B1B30';
const FONT = 'var(--font-opensans), Open Sans, sans-serif';

const btn = (fill = false): React.CSSProperties => ({
  padding: '6px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
  border: fill ? 'none' : `1px solid ${RED}`, background: fill ? RED : '#fff', color: fill ? '#fff' : RED,
});
const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 10, border: '1px solid #ddd', fontSize: 13, fontFamily: FONT };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, textTransform: 'uppercase', letterSpacing: .4, color: '#777', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid #f1f1f1', verticalAlign: 'top' };

function egal(a: string | null | undefined, b: string): boolean {
  return (a ?? '').toLowerCase() === b.toLowerCase();
}

function dataRo(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ro-MD', { timeZone: 'Europe/Chisinau', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function Stare({ s }: { s: string | null }) {
  if (!s) return <span style={{ color: '#999' }}>—</span>;
  const l = s.toLowerCase();
  const culoare = l === 'completed' || l === 'executed' || l === 'accepted' ? '#1b7f3b'
    : l === 'failed' || l === 'rejected' || l === 'expired' || l === 'cancelled' || l === 'abandoned' ? RED
    : l === 'refunded' || l === 'partiallyrefunded' ? '#8a6d00' : '#555';
  return <span style={{ color: culoare, fontWeight: 600 }}>{s}</span>;
}

export default function PlatiClient({ rows, stare, banner, bilet, plataNereusita }: Props) {
  const [tInput, setTInput] = useState({ tripDate: maine(), crmRouteId: '2', goingNorth: false, fromRo: 'Briceni', toRo: 'Chișinău', seats: '1', passengerName: 'Test Bilet', phone: '+373 60 000 000', lang: 'ro' as 'ro' | 'ru' });
  const [tDeschis, setTDeschis] = useState(false);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [suma, setSuma] = useState('1.50');
  const [descriere, setDescriere] = useState('Plată de test TRANSLUX');
  const [limba, setLimba] = useState<'ro' | 'ru' | 'en'>('ro');
  const [mesaj, setMesaj] = useState<{ ok: boolean; text: string } | null>(banner);
  const [motiv, setMotiv] = useState<Record<string, string>>({});

  function ruleaza(f: () => Promise<{ ok: boolean; eroare?: string; mesaj?: string }>) {
    startTransition(async () => {
      const r = await f();
      setMesaj(r.ok ? { ok: true, text: r.mesaj ?? 'Gata' } : { ok: false, text: r.eroare ?? 'eroare' });
      router.refresh();
    });
  }

  function comandaTest(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await comandaDeTest({
        ...tInput, crmRouteId: Number(tInput.crmRouteId), seats: Number(tInput.seats),
      });
      if (r.ok && r.checkoutUrl) { window.location.assign(r.checkoutUrl); return; }
      setMesaj({ ok: false, text: r.ok ? 'fără adresă de plată' : r.eroare });
    });
  }

  async function plateste(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(suma.replace(',', '.'));
    startTransition(async () => {
      const r = await creeazaPlataTest(n, descriere, limba);
      if (r.ok && r.checkoutUrl) { window.location.assign(r.checkoutUrl); return; }
      setMesaj({ ok: false, text: r.ok ? 'fără adresă de plată' : r.eroare });
    });
  }

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: RED, fontStyle: 'italic' }}>Plăți online — maib Checkout</h1>
        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
          Mediu: <b>{stare.mediu}</b> · chei: {stare.configurat ? 'configurate' : <span style={{ color: RED }}>LIPSESC (MAIB_CLIENT_ID / MAIB_CLIENT_SECRET / MAIB_SIGNATURE_KEY)</span>}
          {' '}· callback: <code style={{ fontSize: 11 }}>{stare.callbackUrl}</code>
        </div>
      </div>

      {mesaj && (
        <div style={{ padding: '10px 14px', borderRadius: 12, marginBottom: 16, fontSize: 13, background: mesaj.ok ? '#e8f5ec' : '#fdecef', color: mesaj.ok ? '#1b5e30' : RED }}>
          {mesaj.text}
        </div>
      )}

      <form onSubmit={plateste} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: 14, background: '#fff', borderRadius: 16, marginBottom: 20, boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
        <b style={{ fontSize: 13 }}>Plată de test</b>
        <input value={suma} onChange={e => setSuma(e.target.value)} style={{ ...inp, width: 90 }} inputMode="decimal" aria-label="Suma, MDL" />
        <span style={{ fontSize: 12, color: '#777' }}>MDL (peste 1,00)</span>
        <input value={descriere} onChange={e => setDescriere(e.target.value)} style={{ ...inp, width: 280 }} maxLength={125} aria-label="Descriere" />
        <select value={limba} onChange={e => setLimba(e.target.value as 'ro' | 'ru' | 'en')} style={inp} aria-label="Limba paginii de plată">
          <option value="ro">ro</option><option value="ru">ru</option><option value="en">en</option>
        </select>
        <button type="submit" disabled={pending || !stare.configurat} style={btn(true)}>{pending ? '…' : 'Plătește la maib'}</button>
        <span style={{ fontSize: 11, color: '#888' }}>sandbox: card 5102 1800 6010 1124 · 06/28 · 760 · Test Test</span>
      </form>

      {bilet && (
        <div style={{ padding: 14, background: '#fff', borderRadius: 16, marginBottom: 20, boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 14 }}>Comandă de test de bilete</b>
            <Stare s={bilet.status} />
            {plataNereusita && <span style={{ color: RED, fontSize: 12 }}>plata nu s-a încheiat</span>}
            <span style={{ fontSize: 12, color: '#666' }}>{bilet.from_name} → {bilet.to_name} · {bilet.trip_date} · {bilet.ruta?.nume_ro ?? ''} · {bilet.seats} loc. × {bilet.price_per_seat} = <b>{bilet.total} MDL</b> · {bilet.passenger_name}</span>
            <code style={{ fontSize: 11, color: '#999' }}>{bilet.cod}</code>
          </div>
          {bilet.status === 'noua' && <div style={{ fontSize: 12, color: '#8a6d00', marginTop: 6 }}>Încă fără plată confirmată — callback-ul poate întârzia câteva secunde; reîncarcă pagina.</div>}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10 }}>
            {bilet.bilete.map(b => (
              <div key={b.cod_qr} style={{ textAlign: 'center', fontSize: 11 }}>
                <div style={{ width: 140, height: 140 }} dangerouslySetInnerHTML={{ __html: b.qr_svg }} />
                <div style={{ fontFamily: 'monospace', letterSpacing: 1 }}>{b.cod_qr}</div>
                <div>bilet {b.nr} · <Stare s={b.status} /></div>
              </div>
            ))}
            {bilet.bilete.length === 0 && <span style={{ fontSize: 12, color: '#999' }}>niciun bilet emis încă</span>}
          </div>
        </div>
      )}

      <div style={{ padding: 14, background: '#fff', borderRadius: 16, marginBottom: 20, boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
        <button type="button" onClick={() => setTDeschis(v => !v)} style={{ ...btn(), marginBottom: tDeschis ? 10 : 0 }}>
          {tDeschis ? 'Ascunde' : 'Comandă de test (bilete online)'}
        </button>
        {tDeschis && (
          <form onSubmit={comandaTest} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={tInput.tripDate} onChange={e => setTInput({ ...tInput, tripDate: e.target.value })} style={{ ...inp, width: 120 }} aria-label="Data cursei" />
            <input value={tInput.crmRouteId} onChange={e => setTInput({ ...tInput, crmRouteId: e.target.value })} style={{ ...inp, width: 60 }} aria-label="Id rută" title="crm_routes.id" />
            <select value={tInput.goingNorth ? 'retur' : 'tur'} onChange={e => setTInput({ ...tInput, goingNorth: e.target.value === 'retur' })} style={inp} aria-label="Direcția">
              <option value="tur">din nord (tur)</option><option value="retur">din Chișinău (retur)</option>
            </select>
            <input value={tInput.fromRo} onChange={e => setTInput({ ...tInput, fromRo: e.target.value })} style={{ ...inp, width: 120 }} aria-label="De la" />
            <input value={tInput.toRo} onChange={e => setTInput({ ...tInput, toRo: e.target.value })} style={{ ...inp, width: 120 }} aria-label="Până la" />
            <input value={tInput.seats} onChange={e => setTInput({ ...tInput, seats: e.target.value })} style={{ ...inp, width: 50 }} inputMode="numeric" aria-label="Locuri" />
            <input value={tInput.passengerName} onChange={e => setTInput({ ...tInput, passengerName: e.target.value })} style={{ ...inp, width: 140 }} aria-label="Nume" />
            <input value={tInput.phone} onChange={e => setTInput({ ...tInput, phone: e.target.value })} style={{ ...inp, width: 150 }} aria-label="Telefon" />
            <button type="submit" disabled={pending || !stare.configurat} style={btn(true)}>{pending ? '…' : 'Comandă și plătește'}</button>
            <span style={{ fontSize: 11, color: '#888' }}>ocolește steagurile (mod test_admin); prețul e cel de pe site</span>
          </form>
        )}
      </div>

      <div style={{ background: '#fff', borderRadius: 16, overflow: 'auto', boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
          <thead><tr>
            <th style={th}>Creat</th><th style={th}>Comandă</th><th style={th}>Sumă</th><th style={th}>Sesiune</th>
            <th style={th}>Plată</th><th style={th}>Refund</th><th style={th}>Callback</th><th style={th}>Acțiuni</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td style={td} colSpan={8}>Nicio sesiune încă.</td></tr>}
            {rows.map(r => {
              const platita = r.payment_id && egal(r.payment_status, 'Executed') && !r.refund_id && !r.refund_status;
              const deschisa = !egal(r.status, 'Completed') && !egal(r.status, 'Cancelled') && !egal(r.status, 'Expired') && !egal(r.status, 'Failed');
              return (
                <tr key={r.checkout_id}>
                  <td style={td}>{dataRo(r.created_at)}<div style={{ fontSize: 11, color: '#999' }}>{r.created_by ?? ''}</div></td>
                  <td style={td}><b>{r.order_id}</b><div style={{ fontSize: 11, color: '#999', fontFamily: 'monospace' }}>{r.checkout_id}</div>{r.description && <div style={{ fontSize: 12, color: '#666' }}>{r.description}</div>}</td>
                  <td style={td}>{Number(r.amount).toFixed(2)} {r.currency}{Number(r.refunded_amount) > 0 && <div style={{ fontSize: 11, color: '#8a6d00' }}>returnat {Number(r.refunded_amount).toFixed(2)}</div>}</td>
                  <td style={td}><Stare s={r.status} />{r.mediu === 'prod' && <div style={{ fontSize: 11, color: RED }}>PROD</div>}</td>
                  <td style={td}><Stare s={r.payment_status} />{r.payment_id && <div style={{ fontSize: 11, color: '#999', fontFamily: 'monospace' }}>{r.payment_id}</div>}</td>
                  <td style={td}><Stare s={r.refund_status} />{r.refund_id && <div style={{ fontSize: 11, color: '#999', fontFamily: 'monospace' }}>{r.refund_id}</div>}{r.refund_reason && <div style={{ fontSize: 12, color: '#666' }}>{r.refund_reason}</div>}</td>
                  <td style={td}>
                    {r.callback_at ? (
                      <details><summary style={{ cursor: 'pointer', fontSize: 12 }}>{dataRo(r.callback_at)}</summary>
                        <pre style={{ fontSize: 10, maxWidth: 420, whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: '#f7f7f7', padding: 8, borderRadius: 8 }}>{JSON.stringify(r.callback, null, 1)}</pre>
                      </details>
                    ) : <span style={{ color: '#999' }}>neprimit</span>}
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button disabled={pending} style={btn()} onClick={() => ruleaza(() => sincronizeaza(r.checkout_id))}>Actualizează</button>
                        {deschisa && r.checkout_url && <a href={r.checkout_url} style={{ ...btn(), textDecoration: 'none', display: 'inline-block' }}>Deschide plata</a>}
                        {deschisa && <button disabled={pending} style={btn()} onClick={() => { if (confirm('Anulezi sesiunea la maib?')) ruleaza(() => anuleaza(r.checkout_id)); }}>Anulează</button>}
                        {r.refund_id && !egal(r.refund_status, 'Accepted') && <button disabled={pending} style={btn()} onClick={() => ruleaza(() => verificaRefund(r.checkout_id))}>Verifică refund-ul</button>}
                      </div>
                      {platita && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input placeholder="motivul refund-ului" value={motiv[r.checkout_id] ?? ''} onChange={e => setMotiv(m => ({ ...m, [r.checkout_id]: e.target.value }))} style={{ ...inp, flex: 1, padding: '5px 8px', fontSize: 12 }} />
                          <button disabled={pending || !(motiv[r.checkout_id] ?? '').trim()} style={btn(true)} onClick={() => { if (confirm(`Returnezi integral ${Number(r.amount).toFixed(2)} ${r.currency}?`)) ruleaza(() => returneaza(r.checkout_id, motiv[r.checkout_id] ?? '')); }}>Returnează</button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
