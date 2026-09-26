'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Punct, UrmaRuta } from '@/components/ScheletMap';

const ScheletMap = dynamic(() => import('@/components/ScheletMap'), {
  ssr: false,
  loading: () => <div style={{ padding: 16, color: 'var(--text-secondary)' }}>Se încarcă harta…</div>,
});

// Scheletul ideal Drăxlmaier Bălți (ION-71 → idealul v2, ION-94 F3). Unitatea e rută × linie (linia = satul de start), tur = retur,
// ture/zi măsurate din GPS. Ion, 26.09.2026: «nu folosim geometria, folosim km reali din GPS» — km-ul liniei e etalonul GPS completat
// (mediana pe zilele-pereche bune, verificat de ION-95); unde verificarea n-a permis corecția, linia păstrează cardul vechi și poartă
// steagul «diagnostic cerut» cu motivul. Drumul desenat e doar pentru hartă (abaterea față de km > 5 % e marcată).
type Schimb = { zile: number | null; km: { tur?: number; retur?: number } | null; oraTur: number | null; oraRetur: number | null;
  poartaTur: string | null; poartaRetur: string | null; masini: string[] };
type Linie = {
  nr: string; capat: string | null; capatC: Punct | null; km: number | null; tureZi: number | null; kmZi: number | null;
  kmSursa: string | null; etalonGPS: number | null; c47: number | null; diagnostic: string | null; diagnosticMotiv: string | null;
  faraIdeal: boolean; informativ: boolean; hartaAbatere: number | null; grupa: Record<string, number> | null; locuri: number | null;
  schimburi: Record<string, Schimb>; tur: { plin: Punct[] }; retur: { plin: Punct[] }; sate: { n: string; c: Punct }[];
};
type Ruta = { id: string; nr: number; nume: string; linii: Linie[] };
export type ScheletDrax = { fixat: string; perioada: string; sha256?: string; porti: { c: Punct; n: string }[]; parc: Punct; rute: Ruta[] };

const culoarea = (i: number) => `hsl(${Math.round((i * 137.508 + 200) % 360)} 62% 40%)`;
const nr1 = (x: number | null | undefined) => x == null ? '—' : (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
const ora = (h: number | null) => h == null ? '—' : `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`;
const MONO = "var(--font-mono, 'JetBrains Mono', ui-monospace, monospace)";
const ETICHETA: React.CSSProperties = { fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' };
const NUM: React.CSSProperties = { fontFamily: MONO, textAlign: 'right', padding: '2px 0 2px 6px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
const ROSU = '#9B1B30';
const cheie = (r: Ruta, l: Linie) => `${r.id}|${l.nr}`;

export default function ScheletDraxClient({ schelet }: { schelet: ScheletDrax }) {
  const [ales, setAles] = useState<string | null>(null);
  useEffect(() => {
    const cere = (strange: boolean) => { window.dispatchEvent(new CustomEvent('tlx:bara', { detail: { strange } })); };
    cere(true);
    return () => cere(false);
  }, []);

  const linii = useMemo(() => schelet.rute.flatMap((r) => r.linii.filter((l) => l.km != null && !l.informativ).map((l) => ({ r, l }))), [schelet.rute]);
  const indice = useMemo(() => new Map(linii.map((x, i) => [cheie(x.r, x.l), i])), [linii]);
  const urme: UrmaRuta[] = useMemo(() => linii.filter((x) => x.l.tur.plin.length > 1).map((x) => ({
    id: cheie(x.r, x.l), culoare: culoarea(indice.get(cheie(x.r, x.l)) ?? 0), capat: x.l.capat ?? x.l.nr, plin: [x.l.tur.plin], sate: x.l.sate,
  })), [linii, indice]);
  const porti = [...schelet.porti, { c: schelet.parc, n: 'Parcul Bălți' }];
  const sel = ales ? linii.find((x) => cheie(x.r, x.l) === ales) ?? null : null;
  const kmZi = linii.reduce((s, x) => s + (x.l.kmZi ?? 0), 0);
  const diag = linii.filter((x) => x.l.diagnostic);
  const faraIdeal = schelet.rute.flatMap((r) => r.linii.filter((l) => l.faraIdeal).map((l) => `${r.id} ${l.nr}`));

  const insigna = (r: Ruta, i: number, mare = false) => (
    <span style={{ fontFamily: MONO, fontSize: mare ? 11 : 10, fontWeight: 700, color: '#fff', background: culoarea(i),
      borderRadius: 4, padding: mare ? '3px 6px' : '2px 4px', minWidth: mare ? 30 : 27, textAlign: 'center', flexShrink: 0 }}>{r.id}</span>
  );

  return (
    <div style={{ padding: '12px 16px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <h1 style={{ fontSize: 18, margin: 0 }}>Scheletul rutelor — Drăxlmaier Bălți</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 11.5, margin: '3px 0 0', maxWidth: '96ch', lineHeight: 1.45 }}>
            Un drum pe linie (rută × satul de start), tur = retur, din urma GPS {schelet.perioada}; ture pe zi măsurate. Km = etalonul GPS
            completat (mediana pe zilele bune, verificat); liniile cu <b style={{ color: ROSU }}>diagnostic cerut</b> păstrează km-ul vechi până la lămurire.
            Două porți (EST și VEST) — aceeași uzină; parcul Bălți e lângă poarta VEST.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 18, marginLeft: 'auto' }}>
          {[['rute', String(schelet.rute.length)], ['linii cu ideal', String(linii.length)], ['km pe zi', Math.round(kmZi).toLocaleString('ro-RO')],
            ['diagnostic cerut', String(diag.length)], ['fixat', schelet.fixat]].map(([e, v]) => (
            <div key={e}>
              <div style={ETICHETA}>{e}</div>
              <div style={{ fontFamily: MONO, fontSize: 14.5, fontWeight: 500, color: e === 'diagnostic cerut' ? ROSU : 'var(--primary)', marginTop: 1 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: sel ? 'minmax(300px, 360px) 1fr minmax(360px, 440px)' : 'minmax(300px, 360px) 1fr',
        border: '1px solid var(--border-accent)', borderRadius: 12, overflow: 'hidden', background: '#fff', height: 'calc(100vh - 160px)', minHeight: 440,
      }}>
        <div style={{ borderRight: '1px solid var(--border-accent)', overflowY: 'auto' }}>
          <div style={{ ...ETICHETA, padding: '6px 11px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-accent)', position: 'sticky', top: 0, zIndex: 1 }}>
            {linii.length} linii · km pe un sens · ture pe zi
          </div>
          {linii.map(({ r, l }) => {
            const k = cheie(r, l), activ = k === ales, i = indice.get(k) ?? 0;
            return (
              <button key={k} onClick={() => setAles(activ ? null : k)} aria-current={activ} style={{
                display: 'block', width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', background: activ ? 'var(--primary-dim)' : 'transparent',
                border: 0, borderBottom: '1px solid var(--border-accent)', borderLeft: `3px solid ${activ ? 'var(--primary)' : 'transparent'}`, padding: '6px 11px', cursor: 'pointer',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  {insigna(r, i)}
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nr}</span>
                  <span style={{ fontFamily: MONO, fontSize: 13.5, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{nr1(l.km)}</span>
                  <span style={{ fontSize: 9.5, color: 'var(--text-muted)', width: 13 }}>km</span>
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 1, paddingLeft: 34, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {l.tureZi ?? '—'} {l.tureZi === 1 ? 'tură' : 'ture'}/zi · {nr1(l.kmZi)} km/zi
                  {l.diagnostic && <b style={{ color: ROSU }}> · {l.diagnostic}</b>}
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ position: 'relative' }}>
          <ScheletMap urme={urme} ales={ales} porti={porti} />
          <div style={{ position: 'absolute', left: 10, bottom: 22, zIndex: 500, background: '#fff', border: '1px solid var(--border-accent)',
            borderRadius: 6, padding: '6px 9px', fontSize: 10.5, color: 'var(--text-secondary)' }}>
            Culoarea = linia · o linie = tur și retur
          </div>
        </div>

        {sel && (
          <div style={{ borderLeft: '1px solid var(--border-accent)', overflowY: 'auto', padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
              {insigna(sel.r, indice.get(cheie(sel.r, sel.l)) ?? 0, true)}
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{sel.r.nume} · linia {sel.l.nr}</span>
            </div>
            {sel.l.diagnostic && (
              <p style={{ fontSize: 11.5, color: ROSU, margin: '0 0 8px', lineHeight: 1.45 }}>
                <b>Diagnostic cerut:</b> {sel.l.diagnosticMotiv}. Km-ul rămâne cel vechi până la lămurire
                {sel.l.etalonGPS != null ? ` (etalonul GPS ar fi ${nr1(sel.l.etalonGPS)} km)` : ''}.
              </p>
            )}
            <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.45 }}>
              Schelet <b style={{ color: 'var(--text)' }}>{sel.l.capat ?? sel.l.nr} – poarta, {nr1(sel.l.km)} km</b> pe un sens ({sel.l.kmSursa ?? '—'}
              {sel.l.c47 != null ? `; ${sel.l.c47} % din curse în ±10 %` : ''}) · {sel.l.tureZi ?? '—'} ture/zi · {nr1(sel.l.kmZi)} km/zi
              {sel.l.locuri ? ` · ${sel.l.locuri} locuri` : ''}
              {sel.l.hartaAbatere != null && Math.abs(sel.l.hartaAbatere) > 5 ? ` · drumul desenat se abate cu ${nr1(sel.l.hartaAbatere)} % (doar harta)` : ''}.
            </p>
            <div style={{ ...ETICHETA, marginBottom: 4 }}>schimburi · ora mediană (tur la poartă / retur de la poartă)</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, marginBottom: 12 }}>
              <thead><tr>{['schimb', 'tur', 'retur', 'km tur/retur', 'porți', 'mașini'].map((h, i) => (
                <th key={h} style={{ ...ETICHETA, textAlign: i === 0 || i === 5 ? 'left' : 'right', padding: '0 0 3px 6px' }}>{h}</th>))}</tr></thead>
              <tbody>
                {Object.entries(sel.l.schimburi).map(([s, x]) => (
                  <tr key={s} style={{ borderTop: '1px solid var(--border-accent)' }}>
                    <td style={{ padding: '2px 0' }}>{s}</td>
                    <td style={NUM}>{ora(x.oraTur)}</td>
                    <td style={NUM}>{ora(x.oraRetur)}</td>
                    <td style={NUM}>{nr1(x.km?.tur)} / {nr1(x.km?.retur)}</td>
                    <td style={{ ...NUM, color: 'var(--text-secondary)' }}>{x.poartaTur ?? '—'}/{x.poartaRetur ?? '—'}</td>
                    <td style={{ padding: '2px 0 2px 6px', fontSize: 10.5, color: 'var(--text-secondary)' }}>{x.masini.slice(0, 4).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ ...ETICHETA, marginBottom: 4 }}>satele pe drum</div>
            <p style={{ fontSize: 11.5, margin: 0 }}>{sel.l.sate.map((s) => s.n).join(' – ') || '—'}</p>
          </div>
        )}
      </div>

      <p style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 8, maxWidth: '150ch', lineHeight: 1.5 }}>
        Diagnostic cerut: {diag.map((x) => `${x.r.id} ${x.l.nr} (${x.l.diagnosticMotiv})`).join(' · ') || '—'}.
        {faraIdeal.length > 0 && <> Linii din act fără ideal (fără destule curse în GPS): {faraIdeal.join(', ')}.</>}
        {' '}Regulile de livrare: /lde/reguli?uz=drax.
      </p>
    </div>
  );
}
