'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { povesteZi } from '@/lib/lde/drax-ziua';
import {
  CULOARE, FEL_STATIONARE, LINIE, UZINE_HARTA, eticZi, masiniCamioane, masiniSaptamana, numeTip, randuriBriceni, randuriCamioane, randuriDinIntervale, randuriMejgorod, randuriPlan, oraLocala,
  textRute, tipuriLegenda, type LinieSchelet, type Punct, type RandListaHarta, type RandZi, type UzHarta, type ZiHarta,
} from '@/lib/lde/drax-harta';
import type { ControlCamion, ControlMejgorod } from './actions';
import { culoareLoc, textDrum } from '@/lib/lde/drax-parcare';

const HartaMasinaMap = dynamic(() => import('@/components/HartaMasinaMap'), {
  ssr: false,
  loading: () => <div style={{ padding: 16, color: 'var(--text-secondary)' }}>Se încarcă harta…</div>,
});

const MONO = "var(--font-mono, 'JetBrains Mono', ui-monospace, monospace)";
const ETICHETA: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' };
const n0 = (x: number | null | undefined) => (x == null ? '—' : Math.round(x).toLocaleString('ro-RO'));
const n1 = (x: number | null | undefined) => (x == null ? '—' : (Math.round(x * 10) / 10).toLocaleString('ro-RO'));
const TIP_MISCARE: Record<string, RandZi['tip']> = { cuOameni: 'cursa', intreUzine: 'munca', service: 'munca', deplasare: 'munca' };

type Masina = ReturnType<typeof masiniSaptamana>[number] & Partial<Pick<ReturnType<typeof masiniCamioane>[number], 'kmPlus' | 'nrAbateri' | 'plin'>>;

export default function HartaClient({ uz, saptamani, sapt, masini, masina, z, zi, zileMasina, linii, porti, control = [], controlMej = [] }: {
  uz: UzHarta; saptamani: string[]; sapt: string; masini: Masina[]; masina: string; z: string; zi: ZiHarta | null;
  zileMasina: RandListaHarta[]; linii: LinieSchelet[]; porti: { c: Punct; n: string }[]; control?: ControlCamion[]; controlMej?: ControlMejgorod[];
}) {
  const router = useRouter();
  const [ales, setAles] = useState<string | null>(null);
  useEffect(() => { setAles(null); }, [masina, z]);
  useEffect(() => {
    const cere = (strange: boolean) => { window.dispatchEvent(new CustomEvent('tlx:bara', { detail: { strange } })); };
    cere(true);
    return () => cere(false);
  }, []);

  const U = UZINE_HARTA[uz], pre = uz === 'drax' ? '/lde/harta?' : `/lde/harta?uz=${uz}&`;
  const cam = uz === 'camioane';   // ION-150: cisternele — drumul față de schelet, P1/P2 doar informativ
  const sebn = uz === 'sebn';      // ION-147: SEBN — bucla la predarea turei separat, poarta nu e loc de parcare, fără parcare = cu motivul
  const bri = uz === 'briceni';    // ION-148: Briceni, Trox + suburban — ziua tăiată ca raportul BRICENI, «gol forțat» separat de livrare
  const mej = uz === 'mejgorod';   // ION-149: rutele interurbane — locul de noapte P1/P2, timpul liber de la prânz separat
  const href = (m: string, zz?: string) => `${pre}sapt=${sapt}&m=${m}${zz ? `&z=${zz}` : ''}`;
  // Drăxlmaier: povestea zilei (drax-ziua.ts); LEAR (ION-143): rândurile din intervalele hărții
  const miscari: RandZi[] = useMemo(() => (zi?.zi
    ? povesteZi(zi.zi, zi.casa?.n ?? null).map((x) => ({ ora: x.ora, tip: TIP_MISCARE[x.tip] ?? 'gol', text: x.text.startsWith(x.ora) ? x.text.slice(x.ora.length).trim() : x.text, tare: x.kmPeAcasa >= 0.5 }))
    : zi ? (cam ? randuriCamioane(zi.iv) : bri ? randuriBriceni(zi.iv) : mej ? randuriMejgorod(zi.iv) : randuriDinIntervale(zi.iv)) : []), [zi, cam, bri, mej]);
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
          <h1 style={{ fontSize: 18, margin: 0 }}>Harta mașinii — {U.nume}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 11.5, margin: '3px 0 0', maxWidth: '96ch', lineHeight: 1.45 }}>
            {cam ? <>Urma GPS a zilei (00:00–24:00) peste linia ideală din schelet a drumurilor zilei (galben pal): vama, drumul prin România și Moldova,
              abaterile din verificarea zilnică. Locurile de stat P1/P2 sunt doar informative, fără km de tăiat (Ion, 30.09).</> : bri ? <>
            Urma GPS a zilei (03:00–03:00) peste rutele mașinii din schelet (galben pal), tăiată ca în raportul BRICENI: roșu = livrarea (golul de tăiat),
            portocaliu = gol forțat (gol pe rută, gol între ture, legătură — nu e economie). P1/P2 = parcarea propusă între curse și noaptea.</> : mej ? <>
              Urma GPS a zilei (00:00–24:00) peste rutele autobuzului din schelet (galben pal). P1/P2 = locul propus pentru noapte, între ultima cursă
              și prima de a doua zi; pauzele de la prânz apar doar pe hartă, iar ocolul de la prânz e «timp liber», separat (Ion, 01.10).</> : <>
            Urma GPS a zilei peste {U.lear ? 'rutele' : 'linia'} mașinii din schelet (galben pal).</>}{' '} Culoarea spune ce face mașina, aceleași intervale ca în
            «Ziua făcută, drum cu drum». Apasă pe un rând din dreapta sau pe urmă ca să vezi doar acel drum.
          </p>
        </div>
        <nav aria-label="Uzina" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(Object.keys(UZINE_HARTA) as UzHarta[]).map((k) => (
            <Link key={k} href={k === 'drax' ? '/lde/harta' : `/lde/harta?uz=${k}`} aria-current={k === uz ? 'page' : undefined} style={{
              fontSize: 12, padding: '4px 10px', borderRadius: 6, textDecoration: 'none', border: '1px solid var(--border-accent)',
              background: k === uz ? 'var(--primary)' : 'transparent', color: k === uz ? '#fff' : 'var(--text)',
            }}>{UZINE_HARTA[k].nume}</Link>
          ))}
        </nav>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Săptămâna{' '}
          <select value={sapt} onChange={(e) => router.push(`${pre}sapt=${e.target.value}`)} style={{ fontSize: 12, fontStyle: 'normal', width: 'auto' }}>
            {saptamani.map((s) => <option key={s} value={s}>{eticZi(s)}.{s.slice(0, 4)}</option>)}
          </select>
        </label>
      </div>

      <div className="harta-grid">
        {/* stânga: mașinile, cele cu mai mulți km de tăiat întâi */}
        <div className="harta-col stanga" style={{ borderRight: '1px solid var(--border-accent)' }}>
          <div style={{ ...ETICHETA, padding: '6px 11px', background: '#fff', borderBottom: '1px solid var(--border-accent)', position: 'sticky', top: 0, zIndex: 2 }}>
            {cam ? `${masini.length} cisterne · km în săpt. · peste ideal` : `${masini.length} mașini · km de tăiat pe săpt.`}
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
                  {cam ? <>
                    <span style={{ fontFamily: MONO, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{n0(x.total)}</span>
                    <span style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>km</span>
                  </> : <>
                    <span style={{ fontFamily: MONO, fontSize: 13, fontVariantNumeric: 'tabular-nums', color: x.economie >= 100 ? '#9B1B30' : 'var(--text)' }}>{x.necalculat ? 'necalculat' : n0(x.economie)}</span>
                    <span style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>km</span>
                  </>}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {cam
                    ? <>{x.kmPlus ? <b style={{ color: '#9B1B30' }}>+{n0(x.kmPlus)} km peste ideal</b> : 'fără km peste ideal'} · {x.zile.length} zile</>
                    : <>{textRute(uz, x.linii)} · {x.zile.length} zile</>}
                </div>
              </Link>
            );
          })}
          {(cam || sebn || bri) && control.some((c) => !c.pe || c.motiv) ? (
            <div style={{ padding: '8px 11px', fontSize: 10.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              <div style={{ ...ETICHETA, marginBottom: 3 }}>{sebn ? `Fără parcare propusă (${control.length} din ${masini.length})` : bri ? `Fără parcare propusă (${control.filter((c) => !c.pe).length} fără hartă)` : `Restul flotei (${control.filter((c) => !c.pe).length} fără hartă)`}</div>
              {control.filter((c) => !c.pe || c.motiv).map((c) => (
                <div key={`${c.m}-${c.pe}`} style={{ marginBottom: 2 }}><b style={{ fontFamily: MONO }}>{c.m}</b> {c.motiv}</div>
              ))}
            </div>
          ) : null}
          {mej && controlMej.some((c) => !c.propunere) ? (
            <div style={{ padding: '8px 11px', fontSize: 10.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              <div style={{ ...ETICHETA, marginBottom: 3 }}>Fără loc propus ({controlMej.filter((c) => !c.propunere).length} din {controlMej.length})</div>
              {controlMej.filter((c) => !c.propunere).map((c) => (
                <div key={c.m} style={{ marginBottom: 2 }}><b style={{ fontFamily: MONO }}>{c.m}</b> {c.motiv}</div>
              ))}
            </div>
          ) : null}
        </div>

        {/* mijloc: harta */}
        <div className="harta-harta">
          {zi ? <HartaMasinaMap zi={zi} linii={linii} porti={porti} ales={ales} onAlege={setAles} informativ={cam} />
            : <p style={{ padding: 16 }}>Nu există hartă pentru {masina} în {z}.</p>}
          <div style={{ position: 'absolute', left: 10, bottom: 22, zIndex: 500, background: '#fff', border: '1px solid var(--border-accent)',
            borderRadius: 6, padding: '6px 9px', fontSize: 10.5, color: 'var(--text-secondary)', display: 'grid', gap: 3 }}>
            {tipuriLegenda(uz).map((t) => (
              <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="26" height="6" aria-hidden><line x1="1" y1="3" x2="25" y2="3" stroke={CULOARE[t]} strokeWidth="3" strokeDasharray={LINIE[t]} /></svg>{numeTip(uz, t)}
              </span>
            ))}
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><svg width="26" height="8" aria-hidden><line x1="1" y1="4" x2="25" y2="4" stroke="#C9B458" strokeOpacity="0.5" strokeWidth="7" /></svg>schelet</span>
            {cam
              ? <span><b style={{ background: culoareLoc(1), color: '#fff', borderRadius: 4, padding: '0 4px' }}>P1</b> <b style={{ background: culoareLoc(2), color: '#fff', borderRadius: 4, padding: '0 4px' }}>P2</b> unde stă (informativ) · <b style={{ color: '#B3261E' }}>◎</b> odihnă departe de drumul ideal</span>
              : <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><svg width="26" height="6" aria-hidden><line x1="2" y1="3" x2="25" y2="3" stroke={culoareLoc(1)} strokeWidth="3.5" strokeDasharray="1 6" strokeLinecap="round" /></svg>drum propus · <b style={{ background: culoareLoc(1), color: '#fff', borderRadius: 4, padding: '0 4px' }}>P1</b> <b style={{ background: culoareLoc(2), color: '#fff', borderRadius: 4, padding: '0 4px' }}>P2</b> parcare</span>}
            <span>● oprire ≥ 5 min · <b style={{ color: '#2E7D32' }}>○</b> acasă · <b style={{ color: '#5B3A8C' }}>○</b> noaptea{cam ? ' · ■ puncte (încărcare, stații, vămi)' : ''}</span>
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
          {cam ? (
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
              săptămâna: {n0(m?.total)} km, din care cu marfă {n0(m?.plin)} km; peste ideal (verificarea zilnică) {m?.kmPlus ? <b style={{ color: '#9B1B30' }}>{n0(m.kmPlus)} km</b> : '0 km'}
              {m?.nrAbateri ? ` în ${m.nrAbateri} drumuri` : ''}
            </div>
          ) : mej ? (
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
              săptămâna: {n0(m?.total)} km, de tăiat cu locul de noapte propus {n0(m?.economie)} km pe săptămână
            </div>
          ) : (
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
            săptămâna: {n0(m?.total)} km, de tăiat {sumar?.sursaEconomie === 'parcare' ? 'cu parcarea propusă' : 'față de ziua ideală (calcul vechi)'} {m?.necalculat ? `necalculat (${sumar?.motivAfara ?? 'scoasă din calcul'})` : `${n0(m?.economie)} km`} pe săptămână
            {m && Math.abs(m.economie - m.zileMasurate) > 0.5 && <> (în zilele măsurate {n0(m.zileMasurate)} km, adus la 5 zile ca în raport)</>}
          </div>
          )}

          {cam && zi?.parcare?.locuri.length ? (
            <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-accent)', background: '#F6F4EE' }}>
              <div style={ETICHETA}>Unde stă în săptămână — informativ</div>
              <div style={{ display: 'grid', gap: 3, marginTop: 4, fontSize: 12.5 }}>
                {zi.parcare.locuri.map((l) => (
                  <span key={l.nr} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <b style={{ background: culoareLoc(l.nr), color: '#fff', borderRadius: 5, padding: '1px 6px', fontFamily: MONO, fontSize: 11 }}>P{l.nr}</b>
                    <span>{l.n}{l.ore != null ? `, ${l.ore} h` : ''} — <span style={{ color: l.fel === 'abatere' ? '#9B1B30' : 'var(--text-secondary)' }}>{FEL_STATIONARE[l.fel] ?? l.fel}</span></span>
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.4 }}>
                Fără km de tăiat (Ion, 30.09). Staționările de peste 24 h rămân; odihna la Galați, Ovidiu / Agigea, Giurgiu, Novi Iskăr e bună;
                odihna la peste 5 km de drumul ideal e abatere (ex. Albina).
              </div>
            </div>
          ) : !cam && zi?.parcare?.locuri.length ? (
            <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-accent)', background: '#FFF7F0' }}>
              <div style={ETICHETA}>{mej ? 'Locul de noapte propus' : 'Parcare propusă'}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4, fontSize: 13 }}>
                {zi.parcare.locuri.map((l) => (
                  <span key={l.nr} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <b style={{ background: culoareLoc(l.nr), color: '#fff', borderRadius: 5, padding: '2px 6px', fontFamily: MONO, fontSize: 11.5 }}>P{l.nr}</b>{l.n}
                    {sebn && l.nota ? <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>({l.nota})</span> : null}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.4 }}>
                {mej
                  ? 'Noaptea, între ultima cursă și prima de a doua zi, autobuzul stă la locul arătat (punctat pe hartă: seara spre loc, dimineața de la loc); unde scrie «rămâne cum e», face ca acum. Ocolul pe acasă se socotește; capătul rutei e ales când costă cel mult 20 km/săpt. mai mult decât satul cel mai ieftin; nopțile la Briceni sunt «parcare existentă» (Ion, 01.10).'
                  : sebn
                  ? 'Pe drumurile de mai jos mașina stă la locul arătat (punctat pe hartă); unde scrie «rămâne cum e», face ca acum. Poarta SEBN nu e loc de parcare (§2.3). Bucla la predarea turei (portocaliu) nu e drum de parcare și nu intră în km de tăiat. Drumul șoferului spre casă nu e socotit.'
                  : bri
                  ? 'Pe drumurile de mai jos (golurile de 1–20 h dintre curse) mașina stă la locul arătat (punctat pe hartă); unde scrie «rămâne cum e», face ca acum. Golul Trox dintre ture nu iese sub lungimea rutei (Ion, 01.10). Drumul șoferului spre casă nu e socotit.'
                  : U.lear
                  ? 'Pe drumurile de mai jos mașina stă la locul arătat (punctat pe hartă); unde scrie «rămâne cum e», face ca acum. «La uzină» = așteaptă la poarta LEAR (regula 1). Drumul șoferului spre casă nu e socotit.'
                  : 'Între schimburi și noaptea mașina stă aici; drumurile propuse sunt punctate pe hartă. Drumul șoferului spre casă nu e socotit.'}
                {zi.parcare.idealSapt != null ? ` Maximul teoretic (așteaptă la fiecare capăt): ${n0(zi.parcare.idealSapt)} km/săpt.` : ''}
              </div>
              {(U.lear || bri || mej) && zi.parcare.legi.length ? (
                <div style={{ marginTop: 6, display: 'grid', gap: 2, fontSize: 11.5 }}>
                  {zi.parcare.legi.map((l, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '84px minmax(0, 1fr) auto', columnGap: 6 }}>
                      <span style={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>{l.ora}</span>
                      <span>{l.aN ?? '—'} → <b style={{ color: l.loc ? culoareLoc(l.loc) : 'var(--text-secondary)' }}>{textDrum({ loc: l.loc, acum: l.acum ?? null }, zi.parcare!.locuri)}</b> → {l.bN ?? '—'}</span>
                      <span style={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{n0(l.real)} → {n0(l.km)} km</span>
                      {l.explicatie ? <span style={{ gridColumn: '2 / 4', color: 'var(--text-secondary)', fontSize: 11 }}>{l.explicatie}</span> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : sebn && sumar?.motivAfara ? (
            <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-accent)', background: '#F6F4EE' }}>
              <div style={ETICHETA}>Fără parcare propusă</div>
              <div style={{ fontSize: 12, marginTop: 3, lineHeight: 1.4 }}>{sumar.motivAfara}</div>
            </div>
          ) : bri && zi?.parcare?.motivFara ? (
            <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-accent)', background: '#F6F4EE', fontSize: 12, lineHeight: 1.45 }}>
              <div style={ETICHETA}>Fără parcare propusă</div>
              {zi.parcare.motivFara}
            </div>
          ) : null}
          {sebn && sumar?.ruteGps ? (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>Rutele {sumar.linii.join(', ')} sunt luate din GPS: ruta mașinii din schelet nu mai e trecută (§1.1).</div>
          ) : null}

          {zi?.plan?.curse?.length ? (
            // ION-268 «schelet întâi»: planul zilei din schelet (lista rută-pe-mașină + rotația), ce a confirmat GPS-ul, cursele în plus
            <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-accent)', fontSize: 11.5, lineHeight: 1.45 }}>
              <div style={ETICHETA}>Planul zilei (din schelet){sumar?.plan ? ` — ${sumar.plan.facute} din ${sumar.plan.planificate} făcute` : ''}</div>
              {zi.plan.faraPoarta ? <div style={{ color: 'var(--text-secondary)' }}>Mașina n-a atins poarta în ziua asta.</div> : null}
              {randuriPlan(zi.plan.curse).map((r) => (
                <div key={r.cheie} style={{ color: r.statut === 'lipsa' ? '#9B1B30' : r.statut === 'facuta' ? 'var(--text)' : '#8A5A00' }}>{r.text}</div>
              ))}
              {([[false, 'Cursă în plus, de confirmat'], [true, 'Posibil cursă schimbul 3, de confirmat']] as const).map(([s3, titlu]) => {
                const L = zi.plan!.plus.filter((x) => !!x.s3 === s3);
                return L.length ? (
                  <div key={titlu} style={{ color: 'var(--text-secondary)', marginTop: 3 }}>
                    {titlu}: {L.map((x) => `${x.ruta} ${oraLocala(zi.t00, Math.round((x.t0 - zi.t00) / 1000))}, ${n1(x.km)} km, ${x.urcari} urcări`).join('; ')}
                  </div>
                ) : null;
              })}
            </div>
          ) : null}

          {mej && zi?.mejgorod ? (
            <div style={{ marginTop: 8, display: 'grid', gap: 6, fontSize: 11.5, lineHeight: 1.45 }}>
              {zi.mejgorod.motivFara ? (
                <div style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-accent)', background: '#F6F4EE' }}>
                  <div style={ETICHETA}>Fără loc propus</div>
                  <div>{zi.mejgorod.motivFara}</div>
                </div>
              ) : null}
              <div style={{ color: 'var(--text-secondary)' }}>
                <b style={{ color: CULOARE.liber }}>Timp liber la prânz</b> (separat, nu e parcare): {zi.mejgorod.liberSapt ? `${n1(zi.mejgorod.liberSapt)} km în săptămână` : 'niciun ocol'}
                {zi.mejgorod.liber.length ? ` — ${zi.mejgorod.liber.map((l) => `${eticZi(l.z)} ${l.ora} ${l.de}, ${n1(l.km)} km (până la ${n0(l.departe)} km)`).join('; ')}` : ''}
              </div>
              <div style={{ color: 'var(--text-secondary)' }}>
                <b>După regula din 25.09</b> (doar seara la capăt; informativ): {n1(zi.mejgorod.regula2509.sapt)} km în săptămână
                {zi.mejgorod.regula2509.zile ? ` (${zi.mejgorod.regula2509.zile} zile cu tur și retur, ${zi.mejgorod.regula2509.laCapat} seara la capăt, ${zi.mejgorod.regula2509.cazB} «caz B» puse zero)` : ''}.
              </div>
            </div>
          ) : null}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, margin: '10px 0' }}>
            {zileMasina.map((r) => {
              const activ = r.z === z;
              return (
                <Link key={r.z} href={href(masina, r.z)} aria-current={activ ? 'page' : undefined} title={r.sumar.economie == null ? `nu intră în calcul${r.sumar.motivAfara ? `: ${r.sumar.motivAfara}` : ''}` : undefined} style={{
                  textDecoration: 'none', fontSize: 11.5, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-accent)',
                  background: activ ? 'var(--primary)' : 'transparent', color: activ ? '#fff' : 'var(--text)', lineHeight: 1.25, textAlign: 'center',
                }}>
                  <div style={{ fontWeight: 600 }}>{eticZi(r.z)}</div>
                  <div style={{ fontFamily: MONO, fontSize: 10.5, opacity: 0.85 }}>{cam ? `${n0(r.sumar.total)}${r.sumar.kmPlus ? ` +${n0(r.sumar.kmPlus)}` : ''}` : r.sumar.economie == null ? '—' : `−${n0(r.sumar.economie)}`}</div>
                </Link>
              );
            })}
          </div>

          {sumar && (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sebn || bri ? 5 : 4}, minmax(0, 1fr))`, gap: 8, padding: '8px 0', borderTop: '1px solid var(--border-accent)', borderBottom: '1px solid var(--border-accent)' }}>
              {(cam
                ? [['în zi', sumar.total], ['cu marfă', sumar.plin ?? sumar.cuOameni], ['gol', sumar.gol], ['peste ideal', sumar.kmPlus ?? 0]]
                : bri
                ? [['în zi', sumar.total], ['cu oameni', sumar.cuOameni], ['livrare', sumar.gol], ['gol forțat', sumar.fortat ?? 0], [sumar.economie == null ? 'fără parcare' : 'de tăiat', sumar.economie]]
                : [['în zi', sumar.total], ['cu oameni', sumar.cuOameni], ['goi', sumar.gol], ...(sebn ? [['buclă predare', sumar.bucla ?? 0]] : []), [sumar.economie == null ? 'nu intră în calcul' : 'de tăiat', sumar.economie]]).map(([e, v]) => (
                <div key={e as string}>
                  <div style={ETICHETA}>{e}</div>
                  <div style={{ fontFamily: MONO, fontSize: 14, color: e === 'de tăiat' || (e === 'peste ideal' && Number(v) > 0) ? '#9B1B30' : 'var(--text)' }}>{n1(v as number | null)}</div>
                </div>
              ))}
            </div>
          )}

          {cam && zi?.drumuri?.length ? (
            <>
              <div style={{ ...ETICHETA, margin: '10px 0 4px' }}>Drumurile față de schelet</div>
              <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                {zi.drumuri.map((d) => (
                  <div key={d.inceput + d.tip} style={{ lineHeight: 1.4 }}>
                    <b style={{ color: d.tip === 'plin' ? CULOARE.plin : CULOARE.gol }}>{d.tip === 'plin' ? `cu ${d.marfa ?? 'marfă'}` : 'gol'}</b> {d.de ?? '—'} → {d.pana ?? '—'}
                    <span style={{ fontFamily: MONO, color: 'var(--text-secondary)' }}> · {n0(d.km)} km{d.ideal != null ? ` / ideal ${n0(d.ideal)}` : ''}</span>
                    {d.plus != null && d.plus > 0 ? <b style={{ color: '#9B1B30' }}> +{n0(d.plus)}</b> : null}
                    {d.vama ? <span style={{ color: 'var(--text-secondary)' }}> · vama {d.vama}</span> : null}
                    <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>
                      {eticZi(d.inceput.slice(0, 10))} → {eticZi(d.sfarsit.slice(0, 10))}
                      {d.nota ? ` · ${d.nota}` : ''}
                      {d.verif ? ` · verificat ${eticZi(d.verif.zi)}: ${d.verif.ok ? 'în regulă' : `abatere +${n0(d.verif.kmPlus)} km`}` : d.tip === 'plin' || d.ideal != null ? ' · fără verificare zilnică (ION-144 rulează din 29.09)' : ''}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
          {cam && zi?.verif?.some((v) => !v.ok) ? (
            <>
              <div style={{ ...ETICHETA, margin: '10px 0 4px' }}>Abaterile din verificarea zilnică (ION-144)</div>
              {zi.verif.filter((v) => !v.ok).map((v) => (
                <div key={v.cheie} style={{ fontSize: 11.5, lineHeight: 1.45, marginBottom: 6 }}>
                  <b>{v.de ?? '—'} → {v.pana ?? '—'}</b> <span style={{ fontFamily: MONO }}>{n0(v.km_gps)} km{v.km_ideal != null ? ` / ${n0(v.km_ideal)}` : ''}</span>
                  {v.km_plus > 0 ? <b style={{ color: '#9B1B30' }}> +{n0(v.km_plus)}</b> : null} <span style={{ color: 'var(--text-secondary)' }}>(zi {eticZi(v.zi)})</span>
                  <ul style={{ margin: '2px 0 0', paddingLeft: 16 }}>
                    {v.abateri.filter((a) => a.cod !== 'traseu').map((a, i) => <li key={i}>{a.text}{a.km ? ` (${a.km > 0 ? '+' : ''}${n0(a.km)} km)` : ''}</li>)}
                    {v.abateri.filter((a) => a.cod === 'traseu').map((a, i) => <li key={`t${i}`} style={{ color: 'var(--text-secondary)' }}>ideal: {a.ideal}<br />real: {a.real}</li>)}
                  </ul>
                </div>
              ))}
            </>
          ) : null}

          <div style={{ ...ETICHETA, margin: '10px 0 4px' }}>Ziua făcută, drum cu drum</div>
          {/* Rânduri, nu <button>: regula globală «.dashboard button» (globals.css) centrează, face cursiv și ține textul pe un rând.
              Ion, 29.09: «nu se citește normal». Trei coloane: semnul culorii, ora, ce a făcut mașina. */}
          <div role="list">
            {miscari.map((x, i) => {
              const tip = x.tip, activ = ales === x.ora, rest = x.text;
              const alege = () => setAles(activ ? null : x.ora);
              return (
                <div key={i} role="listitem" tabIndex={0} onClick={alege} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alege(); } }}
                  aria-current={activ ? 'true' : undefined}
                  style={{
                    display: 'grid', gridTemplateColumns: '18px 84px minmax(0, 1fr)', columnGap: 6, alignItems: 'start', cursor: 'pointer',
                    padding: '5px 6px', borderRadius: 6, background: activ ? 'var(--primary-dim)' : 'transparent',
                    fontSize: 12.5, lineHeight: 1.45, textAlign: 'left', whiteSpace: 'normal', fontStyle: 'normal',
                    color: tip === 'gol' ? '#8A2A1F' : 'var(--text)', fontWeight: x.tare ? 600 : 400,
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
