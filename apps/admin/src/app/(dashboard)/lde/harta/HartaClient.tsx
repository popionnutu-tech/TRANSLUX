'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { povesteZi } from '@/lib/lde/drax-ziua';
import {
  CULOARE, LINIE, NUME_TIP, eticZi, masiniSaptamana, type LinieSchelet, type Punct, type RandListaHarta, type TipInterval, type ZiHarta,
} from '@/lib/lde/drax-harta';

const HartaMasinaMap = dynamic(() => import('@/components/HartaMasinaMap'), {
  ssr: false,
  loading: () => <div style={{ padding: 16, color: 'var(--text-secondary)' }}>Se încarcă harta…</div>,
});

const MONO = "var(--font-mono, 'JetBrains Mono', ui-monospace, monospace)";
const ETICHETA: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' };
const n0 = (x: number | null | undefined) => (x == null ? '—' : Math.round(x).toLocaleString('ro-RO'));
const n1 = (x: number | null | undefined) => (x == null ? '—' : (Math.round(x * 10) / 10).toLocaleString('ro-RO'));
const TIP_MISCARE: Record<string, TipInterval> = { cuOameni: 'cursa', intreUzine: 'munca', service: 'munca', deplasare: 'munca' };

type Masina = ReturnType<typeof masiniSaptamana>[number];

export default function HartaClient({ saptamani, sapt, masini, masina, z, zi, zileMasina, linii, porti }: {
  saptamani: string[]; sapt: string; masini: Masina[]; masina: string; z: string; zi: ZiHarta | null;
  zileMasina: RandListaHarta[]; linii: LinieSchelet[]; porti: { c: Punct; n: string }[];
}) {
  const router = useRouter();
  const [ales, setAles] = useState<string | null>(null);
  useEffect(() => { setAles(null); }, [masina, z]);
  useEffect(() => {
    const cere = (strange: boolean) => { window.dispatchEvent(new CustomEvent('tlx:bara', { detail: { strange } })); };
    cere(true);
    return () => cere(false);
  }, []);

  const href = (m: string, zz?: string) => `/lde/harta?sapt=${sapt}&m=${m}${zz ? `&z=${zz}` : ''}`;
  const miscari = useMemo(() => (zi?.zi ? povesteZi(zi.zi, zi.casa?.n ?? null) : []), [zi]);
  const sumar = zileMasina.find((r) => r.z === z)?.sumar;
  const m = masini.find((x) => x.m === masina);

  return (
    <div style={{ padding: '12px 16px 14px' }}>
      <style>{`
        .harta-grid { display: grid; grid-template-columns: minmax(210px, 250px) minmax(0, 1fr) minmax(320px, 400px);
          border: 1px solid var(--border-accent); border-radius: 12px; overflow: hidden; background: #fff; height: calc(100vh - 150px); min-height: 480px; }
        .harta-col { overflow-y: auto; min-height: 0; }
        .harta-harta { position: relative; min-height: 0; }
        @media (max-width: 1100px) {
          .harta-grid { grid-template-columns: 1fr; height: auto; }
          .harta-col.stanga { max-height: 220px; border-right: 0 !important; border-bottom: 1px solid var(--border-accent); }
          .harta-harta { height: 62vh; }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ flex: '1 1 420px' }}>
          <h1 style={{ fontSize: 18, margin: 0 }}>Harta mașinii — Drăxlmaier Bălți</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 11.5, margin: '3px 0 0', maxWidth: '96ch', lineHeight: 1.45 }}>
            Urma GPS a zilei peste linia mașinii din schelet (galben pal). Culoarea spune ce face mașina, aceleași intervale ca în
            «Ziua făcută, drum cu drum». Apasă pe un rând din dreapta sau pe urmă ca să vezi doar acel drum.
          </p>
        </div>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Săptămâna{' '}
          <select value={sapt} onChange={(e) => router.push(`/lde/harta?sapt=${e.target.value}`)} style={{ fontSize: 12, fontStyle: 'normal', width: 'auto' }}>
            {saptamani.map((s) => <option key={s} value={s}>{eticZi(s)}.{s.slice(0, 4)}</option>)}
          </select>
        </label>
      </div>

      <div className="harta-grid">
        {/* stânga: mașinile, cele cu mai mulți km de tăiat întâi */}
        <div className="harta-col stanga" style={{ borderRight: '1px solid var(--border-accent)' }}>
          <div style={{ ...ETICHETA, padding: '6px 11px', background: '#fff', borderBottom: '1px solid var(--border-accent)', position: 'sticky', top: 0, zIndex: 2 }}>
            {masini.length} mașini · km de tăiat pe săpt.
          </div>
          {masini.map((x) => {
            const activ = x.m === masina;
            return (
              <Link key={x.m} href={href(x.m)} aria-current={activ ? 'page' : undefined} style={{
                display: 'block', textDecoration: 'none', color: 'inherit', padding: '6px 11px',
                background: activ ? 'var(--primary-dim)' : 'transparent', borderBottom: '1px solid var(--border-accent)',
                borderLeft: `3px solid ${activ ? 'var(--primary)' : 'transparent'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <b style={{ fontFamily: MONO, fontSize: 13, flex: 1 }}>{x.m}</b>
                  <span style={{ fontFamily: MONO, fontSize: 13, fontVariantNumeric: 'tabular-nums', color: x.economie >= 100 ? '#9B1B30' : 'var(--text)' }}>{n0(x.economie)}</span>
                  <span style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>km</span>
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {x.linii.map((l) => l.replace('|', ' · ')).join(', ') || 'fără linie'} · {x.zile.length} zile
                </div>
              </Link>
            );
          })}
        </div>

        {/* mijloc: harta */}
        <div className="harta-harta">
          {zi ? <HartaMasinaMap zi={zi} linii={linii} porti={porti} ales={ales} onAlege={setAles} />
            : <p style={{ padding: 16 }}>Nu există hartă pentru {masina} în {z}.</p>}
          <div style={{ position: 'absolute', left: 10, bottom: 22, zIndex: 500, background: '#fff', border: '1px solid var(--border-accent)',
            borderRadius: 6, padding: '6px 9px', fontSize: 10.5, color: 'var(--text-secondary)', display: 'grid', gap: 3 }}>
            {(Object.keys(CULOARE) as TipInterval[]).map((t) => (
              <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="26" height="6" aria-hidden><line x1="1" y1="3" x2="25" y2="3" stroke={CULOARE[t]} strokeWidth="3" strokeDasharray={LINIE[t]} /></svg>{NUME_TIP[t]}
              </span>
            ))}
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><svg width="26" height="8" aria-hidden><line x1="1" y1="4" x2="25" y2="4" stroke="#C9B458" strokeOpacity="0.5" strokeWidth="7" /></svg>schelet</span>
            <span>● oprire ≥ 5 min · <b style={{ color: '#2E7D32' }}>○</b> acasă · <b style={{ color: '#5B3A8C' }}>○</b> noaptea</span>
          </div>
          {ales && (
            <button onClick={() => setAles(null)} style={{ position: 'absolute', right: 10, top: 10, zIndex: 500, fontSize: 12, padding: '4px 10px',
              background: '#fff', border: '1px solid var(--border-accent)', borderRadius: 6, cursor: 'pointer' }}>Toată ziua</button>
          )}
        </div>

        {/* dreapta: zilele și ziua drum cu drum */}
        <div className="harta-col" style={{ borderLeft: '1px solid var(--border-accent)', padding: '10px 12px', overflowX: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <b style={{ fontFamily: MONO, fontSize: 16 }}>{masina}</b>
            {zi?.casa && <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>acasă: {zi.casa.n}</span>}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
            săptămâna: {n0(m?.total)} km, de tăiat față de ziua ideală {n0(m?.economie)} km pe săptămână
            {m && Math.abs(m.economie - m.zileMasurate) > 0.5 && <> (în zilele măsurate {n0(m.zileMasurate)} km, adus la 5 zile ca în raport)</>}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, margin: '10px 0' }}>
            {zileMasina.map((r) => {
              const activ = r.z === z;
              return (
                <Link key={r.z} href={href(masina, r.z)} aria-current={activ ? 'page' : undefined} title={r.sumar.economie == null ? `nu intră în calcul${r.sumar.motivAfara ? `: ${r.sumar.motivAfara}` : ''}` : undefined} style={{
                  textDecoration: 'none', fontSize: 11.5, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-accent)',
                  background: activ ? 'var(--primary)' : 'transparent', color: activ ? '#fff' : 'var(--text)', lineHeight: 1.25, textAlign: 'center',
                }}>
                  <div style={{ fontWeight: 600 }}>{eticZi(r.z)}</div>
                  <div style={{ fontFamily: MONO, fontSize: 10.5, opacity: 0.85 }}>{r.sumar.economie == null ? '—' : `−${n0(r.sumar.economie)}`}</div>
                </Link>
              );
            })}
          </div>

          {sumar && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, padding: '8px 0', borderTop: '1px solid var(--border-accent)', borderBottom: '1px solid var(--border-accent)' }}>
              {[['în zi', sumar.total], ['cu oameni', sumar.cuOameni], ['goi', sumar.gol], [sumar.economie == null ? 'nu intră în calcul' : 'de tăiat', sumar.economie]].map(([e, v]) => (
                <div key={e as string}>
                  <div style={ETICHETA}>{e}</div>
                  <div style={{ fontFamily: MONO, fontSize: 14, color: e === 'de tăiat' ? '#9B1B30' : 'var(--text)' }}>{n1(v as number | null)}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ ...ETICHETA, margin: '10px 0 4px' }}>Ziua făcută, drum cu drum</div>
          {/* Rânduri, nu <button>: regula globală «.dashboard button» (globals.css) centrează, face cursiv și ține textul pe un rând.
              Ion, 29.09: «nu se citește normal». Trei coloane: semnul culorii, ora, ce a făcut mașina. */}
          <div role="list">
            {miscari.map((x, i) => {
              const tip = TIP_MISCARE[x.tip] ?? 'gol', activ = ales === x.ora;
              const rest = x.text.startsWith(x.ora) ? x.text.slice(x.ora.length).trim() : x.text;
              const alege = () => setAles(activ ? null : x.ora);
              return (
                <div key={i} role="listitem" tabIndex={0} onClick={alege} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alege(); } }}
                  aria-current={activ ? 'true' : undefined}
                  style={{
                    display: 'grid', gridTemplateColumns: '18px 84px minmax(0, 1fr)', columnGap: 6, alignItems: 'start', cursor: 'pointer',
                    padding: '5px 6px', borderRadius: 6, background: activ ? 'var(--primary-dim)' : 'transparent',
                    fontSize: 12.5, lineHeight: 1.45, textAlign: 'left', whiteSpace: 'normal', fontStyle: 'normal',
                    color: tip === 'gol' ? '#8A2A1F' : 'var(--text)', fontWeight: x.kmPeAcasa >= 0.5 ? 600 : 400,
                  }}>
                  <svg width="18" height="10" style={{ marginTop: 5 }} aria-hidden>
                    <line x1="1" y1="5" x2="17" y2="5" stroke={CULOARE[tip]} strokeWidth="3.5" strokeDasharray={LINIE[tip]} />
                  </svg>
                  <span style={{ fontFamily: MONO, fontSize: 11.5, fontVariantNumeric: 'tabular-nums', fontWeight: 500, paddingTop: 1 }}>{x.ora}</span>
                  <span>{rest}</span>
                </div>
              );
            })}
          </div>
          {zi?.stai.length ? (
            <>
              <div style={{ ...ETICHETA, margin: '12px 0 4px' }}>Opriri de peste 5 minute</div>
              <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                {zi.stai.filter((s) => s[3] - s[2] >= 15 * 60).map((s) => `${s[4]} ${Math.round((s[3] - s[2]) / 60)} min`).join(' · ') || 'niciuna peste 15 minute'}
              </p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
