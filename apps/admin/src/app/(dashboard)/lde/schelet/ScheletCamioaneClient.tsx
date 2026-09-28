'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Punct, UrmaRuta } from '@/components/ScheletMap';

const ScheletMap = dynamic(() => import('@/components/ScheletMap'), {
  ssr: false,
  loading: () => <div style={{ padding: 16, color: 'var(--text-secondary)' }}>Se încarcă harta…</div>,
});

// Scheletul ideal al cisternelor (ION-69 → ION-121). Ion, 25–28.09.2026: km minimi pentru cisterna ADR de 40 t, fără bac,
// o singură trecere de graniță, vămile MD↔RO doar Giurgiulești și Albița (Costești și Ungheni scoase). Motorina trece
// obligatoriu prin baza petrolieră Chișinău (Meșterul Manole) sau Briceni, direct la stație doar rar — ambele regimuri,
// fiecare prin Giurgiulești și prin Albița; Albița e «de bază» când e cu ≤ 20 km mai lungă. Biodieselul: fără ZEL pleacă
// direct Berdichev → Vinița → Otaci, prin ZEL trece întâi pe la terminalul de export de lângă Zviahel. Fișierul îl scrie
// ~/dev/camioane-schelet/export-lde.mjs din datele ION-69; scheletul e fix, se schimbă doar prin commit.
type Varianta = { id: string; nume: string; regim?: 'baza' | 'direct'; vama?: string; km: number; ore: number; drum?: string[]; linie: Punct[] };
type Motorina = {
  id: string; origine: string; destinatie: string; regiune: string; baza: string; curse: number; deBaza: string; deBazaDirect: string;
  real: { n: number; min: number; p25: number; med: number } | null; variante: Varianta[];
};
type Biodiesel = {
  id: string; nume: string; terminal: boolean; zel: boolean; vami: string;
  real: { n: number; min: number; max: number } | null; variante: Varianta[];
};
export type ScheletCamioane = {
  fixat: string; perioada: string; profil: string; puncte: { n: string; c: Punct }[]; motorina: Motorina[]; biodiesel: Biodiesel[];
};

const CULOARE: Record<string, string> = {
  'baza-giu': '#1F6F8B', 'baza-alb': '#7B3FA8', 'dir-giu': '#6FB3C8', 'dir-alb': '#C29BE3',
  ideal1: '#1F6F8B', ideal2: '#D97A00', magistrala: '#7B3FA8',
};
const REG_CULOARE: Record<string, string> = { 'Chișinău': '#2F6F68', Centru: '#3C5795', Nord: '#B06A1F', Ungheni: '#8E2A3A' };
const BIO = '#6B7A12';
const nr = (x: number | null | undefined, z = 0) => x == null ? '—' : x.toLocaleString('ro-RO', { minimumFractionDigits: z, maximumFractionDigits: z });
const MONO = "var(--font-mono, 'JetBrains Mono', ui-monospace, monospace)";
const ETICHETA: React.CSSProperties = { fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' };
const NUM: React.CSSProperties = { fontFamily: MONO, textAlign: 'right', padding: '3px 0 3px 6px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

type Rand = { cheie: string; tip: 'm' | 'b'; titlu: string; sub: string; km: number; culoare: string; variante: Varianta[]; deBaza: string };

export default function ScheletCamioaneClient({ schelet }: { schelet: ScheletCamioane }) {
  const [ales, setAles] = useState<string | null>(null);
  useEffect(() => {
    const cere = (strange: boolean) => { window.dispatchEvent(new CustomEvent('tlx:bara', { detail: { strange } })); };
    cere(true);
    return () => cere(false);
  }, []);

  const randuri: Rand[] = useMemo(() => [
    ...schelet.motorina.map((r) => {
      const b = r.variante.find((v) => v.id === r.deBaza) ?? r.variante[0];
      return { cheie: `m|${r.id}`, tip: 'm' as const, titlu: `${r.origine} → ${r.destinatie}`, sub: `${r.regiune} · prin baza ${r.baza} · ${b.vama}`,
        km: b.km, culoare: REG_CULOARE[r.regiune] ?? '#555', variante: r.variante, deBaza: r.deBaza };
    }),
    ...schelet.biodiesel.map((r) => ({ cheie: `b|${r.id}`, tip: 'b' as const, titlu: `${r.id} · ${r.nume}`, sub: r.vami,
      km: r.variante[0].km, culoare: BIO, variante: r.variante, deBaza: 'ideal1' })),
  ], [schelet]);

  const sel = ales ? randuri.find((r) => r.cheie === ales) ?? null : null;
  // fără alegere: idealul de bază al fiecărui traseu; cu alegere: toate variantele lui, fiecare în culoarea ei
  const urme: UrmaRuta[] = useMemo(() => sel
    ? sel.variante.map((v) => ({ id: v.id, culoare: CULOARE[v.id] ?? '#555', plin: [v.linie], sate: [] }))
    : randuri.map((r) => ({ id: r.cheie, culoare: r.culoare, plin: [(r.variante.find((v) => v.id === r.deBaza) ?? r.variante[0]).linie], sate: [] })),
  [sel, randuri]);

  const selM = sel?.tip === 'm' ? schelet.motorina.find((r) => `m|${r.id}` === sel.cheie) ?? null : null;
  const selB = sel?.tip === 'b' ? schelet.biodiesel.find((r) => `b|${r.id}` === sel.cheie) ?? null : null;
  const minKm = sel ? Math.min(...sel.variante.filter((v) => v.id !== 'magistrala').map((v) => v.km)) : 0;

  const lista = (tip: 'm' | 'b', titlu: string) => (
    <>
      <div style={{ ...ETICHETA, padding: '6px 11px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-accent)', position: 'sticky', top: 0, zIndex: 1 }}>
        {titlu}
      </div>
      {randuri.filter((r) => r.tip === tip).map((r) => {
        const activ = r.cheie === ales;
        return (
          <button key={r.cheie} onClick={() => setAles(activ ? null : r.cheie)} aria-current={activ} style={{
            display: 'block', width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', background: activ ? 'var(--primary-dim)' : 'transparent',
            border: 0, borderBottom: '1px solid var(--border-accent)', borderLeft: `3px solid ${activ ? 'var(--primary)' : r.culoare}`, padding: '6px 11px', cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.titlu}</span>
              <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{nr(r.km)}</span>
              <span style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>km</span>
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sub}</div>
          </button>
        );
      })}
    </>
  );

  return (
    <div style={{ padding: '12px 16px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <h1 style={{ fontSize: 18, margin: 0 }}>Scheletul ideal — camioane (cisterne)</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 11.5, margin: '3px 0 0', maxWidth: '100ch', lineHeight: 1.45 }}>
            Km minimi pentru {schelet.profil}. <b style={{ color: 'var(--text)' }}>Motorina</b> trece prin baza petrolieră Chișinău (Meșterul Manole) sau Briceni
            (regula de acum); direct la stație doar rar — ambele, prin Giurgiulești și prin Albița. <b style={{ color: 'var(--text)' }}>Biodieselul</b> fără ZEL
            pleacă direct Berdichev → Vinița → Otaci; prin ZEL Ungheni trece întâi pe la terminalul de export (Zviahel). Date: {schelet.perioada}.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 18, marginLeft: 'auto' }}>
          {[['motorină', String(schelet.motorina.length)], ['biodiesel', String(schelet.biodiesel.length)], ['fixat', schelet.fixat]].map(([e, v]) => (
            <div key={e}>
              <div style={ETICHETA}>{e}</div>
              <div style={{ fontFamily: MONO, fontSize: 14.5, fontWeight: 500, color: 'var(--primary)', marginTop: 1 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: sel ? 'minmax(300px, 360px) 1fr minmax(360px, 440px)' : 'minmax(300px, 360px) 1fr',
        border: '1px solid var(--border-accent)', borderRadius: 12, overflow: 'hidden', background: '#fff', height: 'calc(100vh - 160px)', minHeight: 440,
      }}>
        <div style={{ borderRight: '1px solid var(--border-accent)', overflowY: 'auto' }}>
          {lista('m', `Motorină · ${schelet.motorina.length} trasee · km prin bază`)}
          {lista('b', `Biodiesel · ${schelet.biodiesel.length} trasee · km ideal 1`)}
        </div>

        <div style={{ position: 'relative' }}>
          <ScheletMap urme={urme} ales={null} porti={schelet.puncte} />
          <div style={{ position: 'absolute', left: 10, bottom: 22, zIndex: 500, background: '#fff', border: '1px solid var(--border-accent)',
            borderRadius: 6, padding: '6px 9px', fontSize: 10.5, color: 'var(--text-secondary)', maxWidth: 360, lineHeight: 1.5 }}>
            {sel ? sel.variante.map((v) => (
              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 18, height: 0, borderTop: `3px solid ${CULOARE[v.id] ?? '#555'}` }} />{v.nume}
              </div>
            )) : <>Culoarea = regiunea (motorină) · verde-oliv = biodiesel · se vede idealul de bază; alege un traseu pentru toate variantele.</>}
          </div>
        </div>

        {sel && (
          <div style={{ borderLeft: '1px solid var(--border-accent)', overflowY: 'auto', padding: '12px 14px' }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>{sel.titlu}</div>
            {selM && (
              <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.45 }}>
                Regiunea {selM.regiune} · baza petrolieră aleasă: <b style={{ color: 'var(--text)' }}>{selM.baza}</b> (totalul cel mai mic) ·
                {' '}{selM.curse} curse bune într-un an{selM.real ? `, de obicei ${nr(selM.real.p25)}–${nr(selM.real.med)} km (cea mai scurtă ${nr(selM.real.min)})` : ''}.
              </p>
            )}
            {selB && (
              <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.45 }}>
                Vămi: <b style={{ color: 'var(--text)' }}>{selB.terminal ? 'terminal de export (Zviahel) → ' : 'direct, fără terminal → '}{selB.vami}</b>.
                {selB.real ? ` Real azi: ${selB.real.n} curse, ${nr(selB.real.min)}–${nr(selB.real.max)} km (GPS brut).` : ' Fără curse reale pe traseul acesta.'}
              </p>
            )}
            <div style={{ ...ETICHETA, marginBottom: 4 }}>idealuri · km pe un sens · ore de mers fără vamă</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, marginBottom: 12 }}>
              <tbody>
                {sel.variante.map((v) => {
                  const baza = v.id === sel.deBaza || (selM && v.id === selM.deBazaDirect);
                  return (
                    <tr key={v.id} style={{ borderTop: '1px solid var(--border-accent)' }}>
                      <td style={{ padding: '3px 0' }}>
                        <span style={{ display: 'inline-block', width: 14, height: 0, borderTop: `3px solid ${CULOARE[v.id] ?? '#555'}`, verticalAlign: 'middle', marginRight: 6 }} />
                        {v.nume}{baza ? <b style={{ color: 'var(--primary)' }}> · de bază</b> : ''}
                      </td>
                      <td style={{ ...NUM, fontWeight: v.km === minKm ? 700 : 400 }}>{nr(v.km)}</td>
                      <td style={{ ...NUM, color: 'var(--text-secondary)' }}>{nr(v.ore, 1)} h</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {selB && selB.variante.map((v) => v.drum?.length ? (
              <div key={v.id} style={{ marginBottom: 8 }}>
                <div style={{ ...ETICHETA, marginBottom: 2 }}>{v.nume}</div>
                <p style={{ fontSize: 11, margin: 0, lineHeight: 1.45 }}>{v.drum.join(' → ')}</p>
              </div>
            ) : null)}
          </div>
        )}
      </div>

      <p style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 8, maxWidth: '150ch', lineHeight: 1.5 }}>
        Vămile Costești–Stânca și Ungheni/Sculeni sunt scoase (Ion, 28.09). Spre Constanța se merge pe jos (Brăila → Măcin), nu pe A2 (+40…60 km).
        La vamă, măsurat pe curse: motorina Giurgiulești ~5 h, Albița ~2 h; biodieselul Albița ~37 h, ZEL Ungheni ~5 zile.
      </p>
    </div>
  );
}
