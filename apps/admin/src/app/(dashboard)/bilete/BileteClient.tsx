'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { BileteAlerta } from '@translux/db';
import { detaliuComanda, emiteBiletele, returneazaComanda, rezolvaAlerta, verificaRefundComanda, type ComandaRand, type Detaliu, type Filtre } from './actions';

interface Props {
  comenzi: ComandaRand[];
  alerte: BileteAlerta[];
  nouaVechi: number;
  filtre: Filtre;
}

const RED = '#9B1B30';
const FONT = 'var(--font-opensans), Open Sans, sans-serif';
const btn = (fill = false): React.CSSProperties => ({
  padding: '5px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
  border: fill ? 'none' : `1px solid ${RED}`, background: fill ? RED : '#fff', color: fill ? '#fff' : RED,
});
const inp: React.CSSProperties = { padding: '6px 10px', borderRadius: 10, border: '1px solid #ddd', fontSize: 13, fontFamily: FONT };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, textTransform: 'uppercase', letterSpacing: .4, color: '#777', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid #f1f1f1', verticalAlign: 'top' };

function dataRo(iso: string | null, ora = true): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ro-MD', { timeZone: 'Europe/Chisinau', day: '2-digit', month: '2-digit', ...(ora ? { hour: '2-digit', minute: '2-digit' } : {}) });
}

const CULORI: Record<string, string> = {
  noua: '#555', platita: '#1b7f3b', expirata: '#999', eroare_creare: RED, anulata: '#8a6d00', returnata: '#8a6d00', platita_fara_bilet: RED,
  valid: '#1b7f3b', urcat: '#1b5e7f', anulat: '#8a6d00', returnat: '#8a6d00',
};
function Stare({ s }: { s: string | null }) {
  if (!s) return <span style={{ color: '#999' }}>—</span>;
  return <span style={{ color: CULORI[s] ?? '#555', fontWeight: 600 }}>{s.replace(/_/g, ' ')}</span>;
}

const STARI = ['noua', 'platita', 'expirata', 'eroare_creare', 'anulata', 'returnata', 'platita_fara_bilet'];

export default function BileteClient({ comenzi, alerte, nouaVechi, filtre }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mesaj, setMesaj] = useState<{ ok: boolean; text: string } | null>(null);
  const [deschis, setDeschis] = useState<string | null>(null);
  const [detaliu, setDetaliu] = useState<Record<string, Detaliu>>({});
  const [motiv, setMotiv] = useState<Record<string, string>>({});
  const [f, setF] = useState({ zi: filtre.zi ?? '', ruta: filtre.ruta ? String(filtre.ruta) : '', stare: filtre.stare ?? '', test: filtre.test ?? 'toate' });

  function aplicaFiltre(e: React.FormEvent) {
    e.preventDefault();
    const p = new URLSearchParams();
    if (f.zi) p.set('zi', f.zi); if (f.ruta) p.set('ruta', f.ruta); if (f.stare) p.set('stare', f.stare); if (f.test !== 'toate') p.set('test', f.test);
    router.push(`/bilete${p.toString() ? `?${p}` : ''}`);
  }

  function ruleaza(fn: () => Promise<{ ok: boolean; eroare?: string; mesaj?: string }>, id?: string) {
    startTransition(async () => {
      const r = await fn();
      setMesaj(r.ok ? { ok: true, text: r.mesaj ?? 'Gata' } : { ok: false, text: r.eroare ?? 'eroare' });
      if (id) setDetaliu((d) => { const n = { ...d }; delete n[id]; return n; });
      router.refresh();
    });
  }

  function toggle(id: string) {
    if (deschis === id) { setDeschis(null); return; }
    setDeschis(id);
    if (!detaliu[id]) startTransition(async () => { const d = await detaliuComanda(id); setDetaliu((x) => ({ ...x, [id]: d })); });
  }

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: RED, fontStyle: 'italic' }}>Bilete online</h1>
        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
          {comenzi.length} comenzi afișate · {nouaVechi > 0 ? <span style={{ color: RED }}>{nouaVechi} comenzi «noua» mai vechi de 40 min</span> : 'fără comenzi blocate'}
        </div>
      </div>

      {mesaj && (
        <div style={{ padding: '10px 14px', borderRadius: 12, marginBottom: 16, fontSize: 13, background: mesaj.ok ? '#e8f5ec' : '#fdecef', color: mesaj.ok ? '#1b5e30' : RED }}>{mesaj.text}</div>
      )}

      {alerte.length > 0 && (
        <div style={{ padding: 14, background: '#fff8e6', borderRadius: 16, marginBottom: 20, border: '1px solid #f0dca0' }}>
          <b style={{ fontSize: 13 }}>Alerte deschise ({alerte.length})</b>
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            {alerte.map((a) => (
              <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12 }}>
                <span style={{ color: '#999', minWidth: 90 }}>{dataRo(a.moment)}</span>
                <b style={{ minWidth: 150 }}>{a.tip.replace(/_/g, ' ')}</b>
                <span style={{ flex: 1, color: '#555' }}>{a.detalii ?? ''}{a.comanda_id ? <> · <button type="button" onClick={() => toggle(a.comanda_id!)} style={{ ...btn(), padding: '2px 8px', fontSize: 11 }}>comanda</button></> : null}</span>
                <button type="button" disabled={pending} onClick={() => ruleaza(() => rezolvaAlerta(a.id))} style={btn()}>Rezolvat</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={aplicaFiltre} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: 12, background: '#fff', borderRadius: 16, marginBottom: 16, boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
        <input value={f.zi} onChange={(e) => setF({ ...f, zi: e.target.value })} placeholder="ziua cursei (YYYY-MM-DD)" style={{ ...inp, width: 190 }} />
        <input value={f.ruta} onChange={(e) => setF({ ...f, ruta: e.target.value })} placeholder="id rută" style={{ ...inp, width: 80 }} />
        <select value={f.stare} onChange={(e) => setF({ ...f, stare: e.target.value })} style={inp}>
          <option value="">toate stările</option>
          {STARI.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={f.test} onChange={(e) => setF({ ...f, test: e.target.value as 'da' | 'nu' | 'toate' })} style={inp}>
          <option value="toate">test + reale</option><option value="nu">doar reale</option><option value="da">doar test</option>
        </select>
        <button type="submit" style={btn(true)}>Filtrează</button>
        <span style={{ fontSize: 11, color: '#888' }}>implicit: ultimele 7 zile + viitoare</span>
      </form>

      <div style={{ background: '#fff', borderRadius: 16, overflow: 'auto', boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
          <thead><tr>
            <th style={th}>Creat</th><th style={th}>Cursa</th><th style={th}>Pasager</th><th style={th}>Locuri · sumă</th>
            <th style={th}>Comanda</th><th style={th}>Plata</th><th style={th}>Refund</th><th style={th}>Bilete</th><th style={th}></th>
          </tr></thead>
          <tbody>
            {comenzi.length === 0 && <tr><td style={td} colSpan={9}>Nicio comandă pentru filtrele alese.</td></tr>}
            {comenzi.map((c) => {
              const d = detaliu[c.id];
              const esteDeschis = deschis === c.id;
              return [
                <tr key={c.id} style={c.test ? { background: '#fafafa' } : undefined}>
                  <td style={td}>{dataRo(c.created_at)}{c.test && <div style={{ fontSize: 10, color: '#999' }}>TEST</div>}</td>
                  <td style={td}><b>{c.trip_date}</b> {dataRo(c.departure_at).slice(-5)}<div style={{ fontSize: 12, color: '#666' }}>{c.ruta_nume ?? `ruta ${c.crm_route_id}`}</div><div style={{ fontSize: 12 }}>{c.from_name} → {c.to_name}</div></td>
                  <td style={td}>{c.passenger_name}<div style={{ fontSize: 12, color: '#666' }}>+{c.phone}</div></td>
                  <td style={td}>{c.seats} × {Number(c.price_per_seat).toFixed(0)} = <b>{Number(c.total).toFixed(2)}</b></td>
                  <td style={td}><Stare s={c.status} />{c.cancel_source && <div style={{ fontSize: 11, color: '#999' }}>anulat de {c.cancel_source}</div>}</td>
                  <td style={td}><Stare s={c.payment_status} /></td>
                  <td style={td}><Stare s={c.refund_status} />{Number(c.refunded_amount) > 0 && <div style={{ fontSize: 11, color: '#8a6d00' }}>returnat {Number(c.refunded_amount).toFixed(2)}</div>}</td>
                  <td style={td}>{c.nr_bilete > 0 ? `${c.nr_urcate}/${c.nr_bilete} urcate` : '—'}</td>
                  <td style={td}><button type="button" onClick={() => toggle(c.id)} style={btn()}>{esteDeschis ? 'Închide' : 'Detalii'}</button></td>
                </tr>,
                esteDeschis && (
                  <tr key={`${c.id}-d`}>
                    <td style={{ ...td, background: '#fbfbfb' }} colSpan={9}>
                      {!d ? <span style={{ fontSize: 12, color: '#999' }}>se încarcă…</span> : (
                        <div style={{ display: 'grid', gap: 10 }}>
                          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12 }}>
                            {d.bilete.map((b) => <span key={b.id}><code>{b.cod_qr}</code> · <Stare s={b.status} />{b.urcat_at ? ` · ${dataRo(b.urcat_at)}` : ''}</span>)}
                            {d.bilete.length === 0 && <span style={{ color: '#999' }}>fără bilete</span>}
                          </div>
                          {d.scanari.length > 0 && <div style={{ fontSize: 12, color: '#555' }}>Scanări: {d.scanari.map((s) => `${dataRo(s.moment_server)} ${s.rezultat}`).join(' · ')}</div>}
                          {d.alerte.length > 0 && <div style={{ fontSize: 12, color: '#8a6d00' }}>Alerte: {d.alerte.map((a) => `${a.tip}${a.rezolvat_la ? ' (rezolvată)' : ''}`).join(' · ')}</div>}
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            {(c.status === 'platita' || c.status === 'platita_fara_bilet') && (
                              <>
                                <input placeholder="motivul returnării" value={motiv[c.id] ?? ''} onChange={(e) => setMotiv((m) => ({ ...m, [c.id]: e.target.value }))} style={{ ...inp, width: 260 }} />
                                <button type="button" disabled={pending || !(motiv[c.id] ?? '').trim()} style={btn(true)} onClick={() => { if (confirm(`Anulezi comanda și ceri băncii returnarea a ${Number(c.total).toFixed(2)} MDL?`)) ruleaza(() => returneazaComanda(c.id, motiv[c.id] ?? ''), c.id); }}>Returnează</button>
                              </>
                            )}
                            {c.status === 'platita_fara_bilet' && <button type="button" disabled={pending} style={btn()} onClick={() => { if (confirm('Emiți biletele pentru această plată sosită târziu?')) ruleaza(() => emiteBiletele(c.id), c.id); }}>Emite biletele</button>}
                            {c.status === 'anulata' && <button type="button" disabled={pending} style={btn()} onClick={() => ruleaza(() => verificaRefundComanda(c.id), c.id)}>Verifică refund-ul</button>}
                            <span style={{ fontSize: 11, color: '#999' }}>cod pagină: {c.cod}</span>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
