'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ConsumData } from './actions';

// Un rând pe șofer × mașină (Clava, interviul normei: «un rând pe șofer: litri, km, l/100, abaterea față de norma mașinii»),
// în stilul paginii de agreare. Dedesubt mașinile: litri ÷ km pe lună și km-ii din zilele fără șofer agreat.

const UZINE = ['Toate', 'Drăxlmaier', 'SEBN', 'LEAR Ungheni', 'LEAR Florești'];
const BORDO = 'var(--primary, #9B1B30)';
const LUNI_RO = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];

const etichetaLuna = (luna: string) => { const [y, m] = luna.split('-').map(Number); return `${LUNI_RO[m - 1]} ${y}`; };
function luniDisponibile(luna: string): string[] {
  const out = new Set<string>([luna]);
  const d = new Date();
  for (let i = 0; i < 6; i++) { out.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); d.setMonth(d.getMonth() - 1); }
  return [...out].sort().reverse();
}
const nr = (x: number | null, z = 0) => (x == null ? '—' : x.toLocaleString('ro-RO', { minimumFractionDigits: z, maximumFractionDigits: z }));
const semn = (x: number | null, z = 0) => (x == null ? '—' : (x > 0 ? '+' : '') + nr(x, z));

const chip = (on: boolean): React.CSSProperties => ({
  padding: '4px 10px', borderRadius: 999, fontSize: 12, minHeight: 28, cursor: 'pointer',
  border: `1px solid ${on ? BORDO : 'rgba(155,27,48,0.15)'}`, background: on ? BORDO : '#fff', color: on ? '#fff' : '#333',
});
const card: React.CSSProperties = { background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 'var(--radius, 24px)', padding: '8px 12px', boxShadow: '0 8px 40px rgba(155,27,48,0.08), 0 1px 3px rgba(0,0,0,0.04)', overflowX: 'auto' };
const th: React.CSSProperties = { padding: '9px 8px', fontSize: 10, fontWeight: 600, color: 'rgba(155,27,48,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(155,27,48,0.08)' };
const td: React.CSSProperties = { padding: '6px 8px', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(155,27,48,0.04)' };
const st = (s: React.CSSProperties): React.CSSProperties => ({ ...s, textAlign: 'left' });
const abStil = (x: number | null): React.CSSProperties => ({ ...td, fontWeight: (x ?? 0) > 0 ? 600 : 400, color: (x ?? 0) > 0 ? '#b91c1c' : '#333' });
const badge = (bg: string, col: string): React.CSSProperties => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: bg, color: col, whiteSpace: 'nowrap' });

export default function ConsumClient({ data }: { data: ConsumData }) {
  const router = useRouter();
  const [uz, setUz] = useState('Toate');
  const [doarAbateri, setDoarAbateri] = useState(false);
  const luna = data.luna.slice(5);

  const soferi = data.soferi.filter((s) => (uz === 'Toate' || s.uzina === uz) && (!doarAbateri || s.peste));
  const masini = data.masini.filter((m) => uz === 'Toate' || m.uzina === uz);
  const peste = data.soferi.filter((s) => s.peste).length;
  const ddmm = (d: string) => (d ? `${d.slice(8)}.${d.slice(5, 7)}` : '');
  const verificat = data.soferi.filter((s) => s.de_verificat).length;
  const neagreate = new Set(data.soferi.filter((s) => !s.agreat).map((s) => s.m)).size;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 32px 48px', display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 400, color: BORDO }}>Consum pe șofer</h1>
          <Link href={`/lde/agreare?luna=${data.luna}`} style={{ color: BORDO, fontSize: 13 }}>← agrearea lunii</Link>
        </div>
        <select value={data.luna} onChange={(e) => router.push(`/lde/agreare/consum?luna=${e.target.value}`)} aria-label="Luna"
          style={{ padding: '6px 10px', border: '1px solid rgba(155,27,48,0.15)', borderRadius: 8, background: '#fff', fontSize: 13, minHeight: 34 }}>
          {luniDisponibile(data.luna).map((l) => <option key={l} value={l}>{etichetaLuna(l)}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {UZINE.map((u) => <button key={u} type="button" onClick={() => setUz(u)} style={chip(uz === u)}>{u}</button>)}
        </div>
        <button type="button" onClick={() => setDoarAbateri(!doarAbateri)} style={chip(doarAbateri)}>Doar peste normă {peste}</button>
      </div>
      {neagreate > 0 && (
        <p style={{ margin: 0, fontSize: 12, color: '#b45309' }}>
          {neagreate} mașini n-au agrearea salvată: perioada șoferului e propunerea paginii (atribuirea / nopțile din GPS). Cifrele se schimbă după ce o confirmi pe pagina de agreare.
        </p>
      )}

      <div style={card}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={st(th)}>Șoferul</th><th style={st(th)}>Mașina</th><th style={st(th)}>Perioada</th>
              <th style={th}>Km GPS</th><th style={th}>Litri</th><th style={th}>l/100</th>
              <th style={th} title="Norma tipului mașinii">Norma tip</th><th style={th}>± l față de tip</th>
              <th style={th} title="Consumul mașinii în cele 3 luni închise de dinainte">Media 3 luni</th><th style={th}>± l față de 3 luni</th><th style={st(th)}></th>
            </tr>
          </thead>
          <tbody>
            {soferi.map((s) => {
              return (
                <tr key={s.driver_id + s.m} style={{ background: s.de_verificat ? 'rgba(217,119,6,0.05)' : 'transparent' }}>
                  <td style={st({ ...td, fontWeight: 600 })}>{s.nume}</td>
                  <td style={st(td)}>{s.m} <span style={{ color: '#666' }}>· {s.uzina}</span></td>
                  <td style={st({ ...td, color: s.agreat ? '#333' : '#b45309' })} title={s.agreat ? 'Agreat' : 'Propunere, neagreat încă'}>{s.de}–{s.pana}.{luna}{s.agreat ? '' : ' *'}</td>
                  <td style={td}>{nr(s.km)}</td>
                  <td style={td}>{nr(s.litri)}</td>
                  <td style={td}>{nr(s.consum, 1)}</td>
                  <td style={{ ...td, color: '#666' }}>{nr(s.norma_tip, 1)}</td>
                  <td style={abStil(s.abatere_tip)}>{semn(s.abatere_tip)}</td>
                  <td style={{ ...td, color: '#666' }}>{nr(s.medie3, 1)}</td>
                  <td style={abStil(s.abatere_3l)}>{semn(s.abatere_3l)}</td>
                  <td style={st(td)}>
                    {s.de_verificat && <span style={badge('rgba(217,119,6,0.12)', '#b45309')} title="Mai mulți șoferi pe mașină și peste un reper: împărțirea după km nu spune cine a consumat">de verificat · {s.soferi_pe_masina} șoferi</span>}
                    {s.consum == null && <span style={badge('rgba(0,0,0,0.05)', '#666')} title="Mașina are sub 300 km sau sub 2 alimentări în lună">puține date</span>}
                  </td>
                </tr>
              );
            })}
            {!soferi.length && <tr><td colSpan={11} style={st({ ...td, color: '#666', padding: 12 })}>Niciun șofer pe filtrul ales.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2 style={{ margin: '10px 0 0', fontSize: 18, fontWeight: 400, color: BORDO }}>Mașinile: litri total ÷ km total</h2>
      <div style={card}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={st(th)}>Mașina</th><th style={st(th)}>Uzina</th><th style={th}>Alimentări</th><th style={th}>Litri</th>
              <th style={th}>Km</th><th style={th}>l/100</th><th style={th}>Norma tip</th><th style={th}>Media 3 luni</th><th style={th}>Km fără șofer</th>
            </tr>
          </thead>
          <tbody>
            {masini.map((m) => (
              <tr key={m.vehicle_id}>
                <td style={st({ ...td, fontWeight: 600 })}>{m.m}</td>
                <td style={st({ ...td, color: '#666' })}>{m.uzina}{m.tip ? ` · ${m.tip}` : ' · fără tip'}</td>
                <td style={td}>{m.alimentari}</td>
                <td style={td}>{nr(m.litri)}</td>
                <td style={td}>{nr(m.km)}</td>
                <td style={{ ...td, color: m.consum != null && ((m.norma_tip != null && m.consum > m.norma_tip) || (m.medie3 != null && m.consum > m.medie3)) ? '#b91c1c' : '#333' }}>{m.sub_prag ? 'puține date' : nr(m.consum, 1)}</td>
                <td style={{ ...td, color: m.consum != null && m.norma_tip != null && m.consum > m.norma_tip ? '#b91c1c' : '#666' }}>{nr(m.norma_tip, 1)}</td>
                <td style={{ ...td, color: m.consum != null && m.medie3 != null && m.consum > m.medie3 ? '#b91c1c' : '#666' }} title={m.km3 ? `din ${nr(m.km3)} km` : 'fără km în cele 3 luni'}>{nr(m.medie3, 1)}</td>
                <td style={{ ...td, color: m.km_fara_sofer > 0 ? '#b45309' : '#666' }}>{m.km_fara_sofer > 0 ? nr(m.km_fara_sofer) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ margin: 0, fontSize: 12, color: '#666' }}>
        {etichetaLuna(data.luna)}{Number(data.pana.slice(8)) < new Date(Number(data.luna.slice(0, 4)), Number(luna), 0).getDate() ? ` până la ${data.pana.slice(8)}.${luna}` : ''}: consumul mașinii = toți litrii lunii ÷ toți km-ii; partea șoferului = km-ii lui din GPS pe zilele agreate × consumul mașinii.
        Verificarea se face pe două repere: norma tipului mașinii și media mașinii în cele 3 luni închise de dinainte{data.trei_de ? ` (${ddmm(data.trei_de)}–${ddmm(data.trei_pana)})` : ''}; roșu = peste reper.
        «De verificat» = doi sau mai mulți șoferi pe mașină și peste un reper: împărțirea după km nu arată cine a consumat, se verifică de mână.
        {verificat > 0 ? ` Luna aceasta: ${verificat} rânduri de verificat.` : ''} Reținerea o decide șeful.
      </p>
    </div>
  );
}
