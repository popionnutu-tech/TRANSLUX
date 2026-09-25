'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Punct, UrmaRuta } from '@/components/ScheletMap';

const ScheletMap = dynamic(() => import('@/components/ScheletMap'), {
  ssr: false,
  loading: () => <div style={{ padding: 16, color: 'var(--text-secondary)' }}>Se încarcă harta…</div>,
});

// Scheletul rutelor suburbane Briceni + Trox (ION-70). Aceleași mașini și aceiași șoferi fac și Trox, și
// suburbanul, deci stau pe o singură hartă. Ion, 25.09.2026: «trebuie să fie scheletul curat tur și retur» —
// pe hartă doar drumul de bază al rutei; variantele șoferilor stau în tabel. Coteala 1, 2, 3 și LMV au un drum
// comun («uneste 3 cotele in una»). Trox: aceleași 6 rute în ambele schimburi, câte un tur și un retur fiecare.
type Oprire = { n: string; c: Punct; km: number; interpolat: boolean };
type Varianta = { sate: string[]; km: number; curse: number };
type Verificare = { id: string; curse: number; inTol: number; capete: { de: string; schelet: number; gps: number; curse: number }[] };
type Sens = { ora: string | null; km: number | null; curse: number | null; oraMin?: string; oraMax?: string;
  capete?: { n: string; pct: number }[]; masini?: { n: string; pct: number }[] };
type Schimb = { tur: Sens; retur: Sens };
type Ruta = {
  id: string; tip: 'sub' | 'trox'; nume: string; km: number; capat: string | null;
  stops: Oprire[]; shape: Punct[]; variante: Varianta[]; satePlus: string[]; verificare: Verificare[];
  schimburi: Record<'S1' | 'S2' | 'seara', Schimb> | null;
};
export type ScheletBriceni = { fixat: string; perioada: string; gara: Punct; poarta: Punct; rute: Ruta[] };

const culoarea = (i: number) => `hsl(${Math.round((i * 137.508 + 200) % 360)} 62% 40%)`;
const nr1 = (x: number | null | undefined) => x == null ? '—' : (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
const sat = (n: string) => n.replace(' (capăt)', '');
const NUME_SCHIMB = { S1: 'Schimbul 1', S2: 'Schimbul 2', seara: 'Seara (în afara schimburilor)' } as const;

const MONO = "var(--font-mono, 'JetBrains Mono', ui-monospace, monospace)";
const ETICHETA: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--text-muted)',
};
const NUM: React.CSSProperties = { fontFamily: MONO, textAlign: 'right', padding: '2px 0 2px 6px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

export default function ScheletBriceniClient({ schelet }: { schelet: ScheletBriceni }) {
  const [ales, setAles] = useState<string | null>(null);

  useEffect(() => {
    const cere = (strange: boolean) => {
      window.dispatchEvent(new CustomEvent('tlx:bara', { detail: { strange } }));
    };
    cere(true);
    return () => cere(false);
  }, []);

  const indice = useMemo(() => new Map(schelet.rute.map((r, i) => [r.id, i])), [schelet.rute]);
  const cul = (r: Ruta) => culoarea(indice.get(r.id) ?? 0);
  const urme: UrmaRuta[] = useMemo(() => schelet.rute.map((r) => ({
    id: r.id, culoare: culoarea(indice.get(r.id) ?? 0), capat: r.capat ?? undefined, plin: [r.shape],
    sate: r.stops.filter((s) => !s.interpolat).map((s) => ({ n: sat(s.n), c: s.c })),
  })), [schelet.rute, indice]);
  const porti = [{ c: schelet.gara, n: 'Gara Briceni' }, { c: schelet.poarta, n: 'Poarta Trox' }];
  const ruta = ales ? schelet.rute.find((r) => r.id === ales) ?? null : null;
  const sub = schelet.rute.filter((r) => r.tip === 'sub'), trox = schelet.rute.filter((r) => r.tip === 'trox');
  const curse = schelet.rute.reduce((s, r) => s + r.verificare.reduce((a, v) => a + v.curse, 0), 0);
  const inTol = schelet.rute.reduce((s, r) => s + r.verificare.reduce((a, v) => a + v.curse * v.inTol, 0), 0) / Math.max(1, curse);

  const insigna = (r: Ruta, mare = false) => (
    <span style={{
      fontFamily: MONO, fontSize: mare ? 11 : 10, fontWeight: 700, color: '#fff', background: cul(r),
      borderRadius: 4, padding: mare ? '3px 6px' : '2px 4px', minWidth: mare ? 30 : 27, textAlign: 'center', flexShrink: 0,
    }}>{r.id === '46+52+53+54' ? '46…54' : r.id}</span>
  );

  const rand = (r: Ruta) => {
    const activ = r.id === ales;
    const s = r.schimburi;
    return (
      <button
        key={r.id}
        onClick={() => setAles(activ ? null : r.id)}
        aria-current={activ}
        style={{
          display: 'block', width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit',
          background: activ ? 'var(--primary-dim)' : 'transparent',
          border: 0, borderBottom: '1px solid var(--border-accent)',
          borderLeft: `3px solid ${activ ? 'var(--primary)' : 'transparent'}`,
          padding: '6px 11px', cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {insigna(r)}
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.capat} – {r.tip === 'trox' ? 'Trox' : 'Briceni'}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 13.5, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{nr1(r.km)}</span>
          <span style={{ fontSize: 9.5, color: 'var(--text-muted)', width: 13 }}>km</span>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 1, paddingLeft: 34, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {s ? `S1 ${s.S1.tur.ora ?? '—'} / ${s.S1.retur.ora ?? '—'} · S2 ${s.S2.tur.ora ?? '—'} / ${s.S2.retur.ora ?? '—'}` : r.nume}
          {r.variante.length > 0 && ` · ${r.variante.length} ${r.variante.length === 1 ? 'variantă' : 'variante'}`}
        </div>
      </button>
    );
  };

  const grup = (titlu: string, rute: Ruta[]) => (
    <>
      <div style={{ ...ETICHETA, padding: '6px 11px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-accent)', position: 'sticky', top: 0, zIndex: 1 }}>
        {titlu} · {rute.length} rute · km pe un sens
      </div>
      {rute.map(rand)}
    </>
  );

  const sensRand = (k: 'S1' | 'S2' | 'seara', sens: 'tur' | 'retur', x: Sens) => (
    <tr key={k + sens} style={{ borderTop: '1px solid var(--border-accent)' }}>
      <td style={{ padding: '2px 0', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{sens}</td>
      <td style={NUM}>{x.ora ?? '—'}</td>
      <td style={{ ...NUM, color: 'var(--text-secondary)' }}>{x.oraMin && x.oraMax ? `${x.oraMin}–${x.oraMax}` : ''}</td>
      <td style={NUM}>{nr1(x.km)}</td>
      <td style={{ ...NUM, color: 'var(--text-secondary)' }}>{x.curse ?? 0}</td>
      <td style={{ padding: '2px 0 2px 6px', fontSize: 10.5, color: 'var(--text-secondary)' }}>
        {(x.masini ?? []).slice(0, 3).map((m) => `${m.n} ${Math.round(m.pct * 100)}%`).join(', ')}
      </td>
    </tr>
  );

  return (
    <div style={{ padding: '12px 16px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <h1 style={{ fontSize: 18, margin: 0 }}>Scheletul rutelor — Trox și suburbanele Briceni</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 11.5, margin: '3px 0 0', maxWidth: '96ch', lineHeight: 1.45 }}>
            Un drum pe rută, tur = retur, din urma GPS {schelet.perioada.replace(' → ', ' – ')}. Suburbanul pornește de la capăt și se termină la gară;
            Trox — de la capăt la poarta uzinei, în fiecare schimb câte un tur și un retur. Variantele șoferilor nu se desenează: stau în tabel.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 18, marginLeft: 'auto' }}>
          {[
            ['suburbane', String(sub.length)],
            ['Trox', String(trox.length)],
            ['curse verificate', curse.toLocaleString('ro-RO')],
            ['în ±10% km', `${Math.round(inTol)}%`],
            ['fixat', schelet.fixat],
          ].map(([e, v]) => (
            <div key={e}>
              <div style={ETICHETA}>{e}</div>
              <div style={{ fontFamily: MONO, fontSize: 14.5, fontWeight: 500, color: 'var(--primary)', marginTop: 1 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: ruta ? 'minmax(300px, 340px) 1fr minmax(380px, 460px)' : 'minmax(300px, 340px) 1fr',
        transition: 'grid-template-columns 0.18s ease',
        border: '1px solid var(--border-accent)', borderRadius: 12, overflow: 'hidden',
        background: '#fff', height: 'calc(100vh - 160px)', minHeight: 440,
      }}>
        <div style={{ borderRight: '1px solid var(--border-accent)', overflowY: 'auto' }}>
          {grup('Trox', trox)}
          {grup('Suburbane', sub)}
        </div>

        <div style={{ position: 'relative' }}>
          <ScheletMap urme={urme} ales={ales} porti={porti} />
          <div style={{
            position: 'absolute', left: 10, bottom: 22, zIndex: 500, background: '#fff',
            border: '1px solid var(--border-accent)', borderRadius: 6, padding: '6px 9px',
            fontSize: 10.5, color: 'var(--text-secondary)',
          }}>
            Culoarea = ruta · o linie = tur și retur
          </div>
        </div>

        {ruta && (
          <div style={{ borderLeft: '1px solid var(--border-accent)', overflowY: 'auto', padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
              {insigna(ruta, true)}
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{ruta.nume}</span>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.45 }}>
              Schelet <b style={{ color: 'var(--text)' }}>{ruta.capat} – {ruta.tip === 'trox' ? 'poarta Trox' : 'gara Briceni'}, {nr1(ruta.km)} km</b> pe un sens.
              {ruta.satePlus.length > 0 && <> Trece și prin: {ruta.satePlus.join(', ')}.</>}
            </p>

            {ruta.schimburi && (
              <>
                <div style={{ ...ETICHETA, marginBottom: 4 }}>schimburi · ora mediană la capăt (tur) / la poartă (retur)</div>
                {(['S1', 'S2', 'seara'] as const).filter((k) => ruta.schimburi![k].tur.curse || ruta.schimburi![k].retur.curse).map((k) => (
                  <table key={k} style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, marginBottom: 8 }}>
                    <thead>
                      <tr>
                        {[NUME_SCHIMB[k], 'ora', 'interval', 'km', 'curse', 'mașini'].map((h, i) => (
                          <th key={h} style={{ ...ETICHETA, textAlign: i === 0 || i === 5 ? 'left' : 'right', padding: '0 0 3px 6px' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>{sensRand(k, 'tur', ruta.schimburi![k].tur)}{sensRand(k, 'retur', ruta.schimburi![k].retur)}</tbody>
                  </table>
                ))}
              </>
            )}

            <div style={{ ...ETICHETA, margin: '4px 0 4px' }}>opririle · km de la capăt</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, marginBottom: 12 }}>
              <tbody>
                {ruta.stops.map((s, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border-accent)' }}>
                    <td style={{ padding: '2px 0', color: s.interpolat ? 'var(--text-secondary)' : 'var(--text)' }}>
                      {sat(s.n)}{s.interpolat && <span style={{ fontSize: 8.5, color: 'var(--text-muted)', marginLeft: 3 }}>pe linie</span>}
                    </td>
                    <td style={NUM}>{nr1(s.km)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {ruta.variante.length > 0 && (
              <>
                <div style={{ ...ETICHETA, marginBottom: 4 }}>variantele șoferilor (altfel decât scheletul cu peste 10%)</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, marginBottom: 12 }}>
                  <tbody>
                    {ruta.variante.map((v, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--border-accent)' }}>
                        <td style={{ padding: '2px 0' }}>{v.sate.join(' – ')}</td>
                        <td style={NUM}>{nr1(v.km)}</td>
                        <td style={{ ...NUM, color: 'var(--text-secondary)' }}>{v.curse} curse</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {ruta.verificare.map((v) => (
              <div key={v.id} style={{ marginBottom: 10 }}>
                <div style={{ ...ETICHETA, marginBottom: 4 }}>verificare pe GPS {ruta.verificare.length > 1 ? v.id : ''} · {v.curse} curse, {v.inTol}% în ±10%</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                  <thead>
                    <tr>
                      {['de la', 'schelet', 'GPS', 'curse'].map((h, i) => (
                        <th key={h} style={{ ...ETICHETA, textAlign: i === 0 ? 'left' : 'right', padding: '0 0 3px 6px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {v.capete.map((c, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--border-accent)' }}>
                        <td style={{ padding: '2px 0' }}>{c.de.replace(/→/g, ' – ')}</td>
                        <td style={NUM}>{nr1(c.schelet)}</td>
                        <td style={NUM}>{nr1(c.gps)}</td>
                        <td style={{ ...NUM, color: 'var(--text-secondary)' }}>{c.curse}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>

      <p style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 8, maxWidth: '150ch', lineHeight: 1.5 }}>
        Rutele suburbane din nomenclatorul numărării (44–57), Trox din actul de primire-predare. Scheletul pornește din locul unde mașina se întoarce la capăt
        și urmează drumul pe care merg majoritatea curselor; km-ul fiecărei curse reale se compară cu scheletul de la capătul unde a pornit (±10%, minim 1 km).
        Coteala 1, 2, 3 și LMV (46, 52, 53, 54) au un drum comun. Trox are aceleași rute în ambele schimburi; între ture mașina se întoarce goală la capăt —
        golul impus de ture, nu livrare (regulile de livrare: /lde/reguli?uz=briceni).
      </p>
    </div>
  );
}
