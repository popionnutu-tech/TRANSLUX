'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Retea } from './toate';

const ScheletToateMap = dynamic(() => import('@/components/ScheletToateMap'), {
  ssr: false,
  loading: () => <div style={{ padding: 16, color: 'var(--text-secondary)' }}>Se încarcă harta…</div>,
});

const nr1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
const mii = (x: number) => Math.round(x).toLocaleString('ro-RO');

const MONO = "var(--font-mono, 'JetBrains Mono', ui-monospace, monospace)";
const ETICHETA: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--text-muted)',
};

export default function ScheletToateClient({ retele }: { retele: Retea[] }) {
  const [ales, setAles] = useState<{ retea: string | null; ruta: string | null }>({ retea: null, ruta: null });
  const [ascunse, setAscunse] = useState<Set<string>>(new Set());

  useEffect(() => {
    const cere = (strange: boolean) => {
      window.dispatchEvent(new CustomEvent('tlx:bara', { detail: { strange } }));
    };
    cere(true);
    return () => cere(false);
  }, []);

  const alegeRetea = (id: string) => setAles((a) => (a.retea === id && !a.ruta ? { retea: null, ruta: null } : { retea: id, ruta: null }));
  const alegeRuta = (retea: string, ruta: string) => setAles((a) => (a.ruta === ruta && a.retea === retea ? { retea, ruta: null } : { retea, ruta }));
  const comuta = (id: string) => {
    setAscunse((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
    if (ales.retea === id) setAles({ retea: null, ruta: null });
  };

  const rute = retele.reduce((s, r) => s + r.rute.length, 0);
  const kmZi = retele.reduce((s, r) => s + r.kmZi, 0);

  const card = (r: Retea) => {
    const activ = ales.retea === r.id;
    const ascunsa = ascunse.has(r.id);
    return (
      <div key={r.id} style={{
        borderBottom: '1px solid var(--border-accent)',
        background: activ ? `color-mix(in srgb, ${r.culoare} 6%, #fff)` : '#fff',
        opacity: ascunsa ? 0.5 : 1,
        position: activ ? 'sticky' : undefined, top: 0, zIndex: activ ? 2 : undefined,
      }}>
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          <button onClick={() => !ascunsa && alegeRetea(r.id)} aria-expanded={activ} style={{
            flex: 1, display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', font: 'inherit', color: 'inherit',
            background: 'transparent', border: 0, borderLeft: `5px solid ${r.culoare}`, padding: '10px 10px 10px 11px',
            cursor: ascunsa ? 'default' : 'pointer',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: r.culoare }}>{r.nume}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 1 }}>{r.sub}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{r.rute.length} <span style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>rute</span></div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{mii(r.kmZi)} km/zi</div>
            </div>
          </button>
          <button onClick={() => comuta(r.id)} title={ascunsa ? 'Arată pe hartă' : 'Ascunde de pe hartă'} aria-pressed={!ascunsa} style={{
            width: 38, border: 0, borderLeft: '1px solid var(--border-accent)', background: 'transparent', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{
              width: 14, height: 14, borderRadius: 4, border: `2px solid ${r.culoare}`,
              background: ascunsa ? 'transparent' : r.culoare,
            }} />
          </button>
        </div>
        {/* Bara de rute: fiecare rută e o felie în nuanța ei, lungă cât km-ii ei — rețeaua dintr-o privire. */}
        <div style={{ display: 'flex', height: 4, margin: '0 10px 8px 16px', borderRadius: 2, overflow: 'hidden', gap: 1 }}>
          {r.rute.filter((x) => x.km).map((x) => <span key={x.id} style={{ flex: x.km ?? 0, background: x.culoare }} />)}
        </div>
      </div>
    );
  };

  const lista = (r: Retea) => (
    <div key={`l-${r.id}`}>
      {r.rute.map((x) => {
        const sel = ales.ruta === x.id;
        return (
          <button key={x.id} onClick={() => alegeRuta(r.id, x.id)} aria-current={sel} style={{
            display: 'flex', alignItems: 'center', gap: 7, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit',
            background: sel ? `color-mix(in srgb, ${r.culoare} 10%, #fff)` : 'transparent',
            border: 0, borderBottom: '1px solid var(--border-accent)', borderLeft: `5px solid ${sel ? r.culoare : 'transparent'}`,
            padding: '5px 11px', cursor: 'pointer',
          }}>
            <span style={{
              fontFamily: MONO, fontSize: 10, fontWeight: 700, color: '#fff', background: x.linie.length > 1 ? x.culoare : '#c5b9bc',
              borderRadius: 4, padding: '2px 4px', minWidth: 27, textAlign: 'center', flexShrink: 0,
            }}>{x.id}</span>
            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: x.linie.length > 1 ? 'var(--text)' : 'var(--text-secondary)' }}>{x.nume}</span>
            <span style={{ fontFamily: MONO, fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>{x.km != null ? nr1(x.km) : '—'}</span>
            <span style={{ fontSize: 9.5, color: 'var(--text-muted)', width: 13 }}>{x.km != null ? 'km' : ''}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div style={{ padding: '12px 16px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <h1 style={{ fontSize: 18, margin: 0 }}>Scheletul rutelor — toate rețelele</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 11.5, margin: '3px 0 0', maxWidth: '92ch', lineHeight: 1.45 }}>
            Toate rutele pe o singură hartă. Fiecare rețea stă sub egida ei: zona conturată și rutele în culoarea ei, poarta cu numele ei.
            Apasă o rețea ca să te duci la ea, o rută ca s-o scoți în față; pătratul din dreapta o ascunde.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 18, marginLeft: 'auto' }}>
          {[
            ['rețele', String(retele.length)],
            ['rute', String(rute)],
            ['km cu oameni', `${mii(kmZi)}/zi`],
          ].map(([e, v]) => (
            <div key={e}>
              <div style={ETICHETA}>{e}</div>
              <div style={{ fontFamily: MONO, fontSize: 14.5, fontWeight: 500, color: 'var(--primary)', marginTop: 1 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'minmax(290px, 340px) 1fr',
        border: '1px solid var(--border-accent)', borderRadius: 12, overflow: 'hidden',
        background: '#fff', height: 'calc(100vh - 160px)', minHeight: 440,
      }}>
        <div style={{ borderRight: '1px solid var(--border-accent)', overflowY: 'auto' }}>
          {retele.map((r) => (
            <div key={r.id}>
              {card(r)}
              {ales.retea === r.id && lista(r)}
            </div>
          ))}
        </div>
        <div style={{ position: 'relative' }}>
          <ScheletToateMap retele={retele} ales={ales} ascunse={ascunse} onRetea={alegeRetea} />
          <div style={{
            position: 'absolute', left: 10, bottom: 22, zIndex: 500, background: 'rgba(255,255,255,.94)',
            border: '1px solid var(--border-accent)', borderRadius: 8, padding: '7px 10px',
            fontSize: 11, color: 'var(--text-secondary)', boxShadow: '0 2px 8px rgba(35,25,27,.08)',
          }}>
            {retele.map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', opacity: ascunse.has(r.id) ? 0.4 : 1 }}>
                <span style={{
                  width: 16, height: 10, borderRadius: 3, flexShrink: 0,
                  border: r.zona ? `1.5px dashed ${r.culoare}` : 'none',
                  background: r.zona ? `color-mix(in srgb, ${r.culoare} 14%, transparent)` : 'transparent',
                  display: 'flex', alignItems: 'center',
                }}>
                  <span style={{ width: '100%', borderTop: `2.5px solid ${r.culoare}` }} />
                </span>
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>{r.nume}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 8, maxWidth: '150ch', lineHeight: 1.5 }}>
        Pe hartă e doar drumul cu oameni al fiecărei rute (turul, unde există), fără drumul gol al șoferului. Km/zi = km cu oameni pe zi, tur plus retur,
        numărați ca în fila fiecărei rețele (la Trox: cele două schimburi; la suburbanul Briceni: un tur și un retur). Zona unei rețele = conturul rutelor ei, lărgit cu 3,5 km; interurbanele n-au zonă — traversează tot nordul.
        Detaliile fiecărei rute (sate, schimburi, abateri) stau în fila rețelei ei.
      </p>
    </div>
  );
}
