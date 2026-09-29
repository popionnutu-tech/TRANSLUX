'use client';

import { Fragment, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Fuel, Truck, Users, ShoppingCart } from 'lucide-react';
import {
  getAlimentariMasina, getAlimentariConsumator,
  type CombustibilData, type Alimentare, type ConsumatorRow, type FlotaRow,
} from './actions';

const nf = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 1 });

const DIR_LABELS: Record<string, string> = {
  interurban: 'Interurban',
  suburban: 'Suburban',
  camioane: 'Camioane',
  DRAXELMAIER_BALTI: 'Drăxlmaier Bălți',
  SEBN_ORHEI: 'SEBN Orhei',
  SEBN_STRASENI: 'SEBN Strășeni',
  LEAR_UNGHENI: 'LEAR Ungheni',
  LEAR_FLORESTI: 'LEAR Florești',
};

const TIP_LABELS: Record<string, string> = {
  masina_foaie: 'Mașină cu foi de parcurs (nu e în flotă)',
  masina_statie: 'Mașină doar la stație (străină / veche)',
  numar_scurt: 'Număr scurt de autobuz (2010–2015)',
  vanzare: 'Vânzări',
  benzovoz: 'Benzovoz (motorină mutată, nu consum)',
  consum_intern: 'Consum intern',
  protocol: 'Protocol',
  utilaj: 'Utilaje (combină, generator, uscător…)',
  nedefinit: 'Nume nedefinite (oameni, firme)',
};
const TIP_ORDER = Object.keys(TIP_LABELS);

const inputStyle: React.CSSProperties = {
  padding: '0.4rem 0.6rem',
  borderRadius: 'var(--radius-xs, 6px)',
  border: '1px solid var(--border, #ddd)',
};

function fmtZi(zi: string | null): string {
  if (!zi) return '—';
  const [y, m, d] = zi.split('-');
  return `${d}.${m}.${y}`;
}

// Abaterea faptic − normă, în %: roșu peste +5 %, verde sub −5 %
function Abatere({ consum, norma }: { consum: number | null; norma: number | null }) {
  if (consum == null || norma == null || norma <= 0) return <span className="text-muted-foreground">—</span>;
  const p = ((consum - norma) / norma) * 100;
  const color = p > 5 ? 'var(--danger, #ef4444)' : p < -5 ? 'var(--success, #16a34a)' : undefined;
  return <span style={{ color }}>{p > 0 ? '+' : ''}{nf.format(p)} %</span>;
}

function DetaliuTabel({ rows }: { rows: Alimentare[] | 'loading' }) {
  if (rows === 'loading') return <p className="text-sm text-muted-foreground" style={{ padding: '0.5rem 0' }}>Se încarcă…</p>;
  if (!rows.length) return <p className="text-sm text-muted-foreground" style={{ padding: '0.5rem 0' }}>Nicio alimentare în perioadă.</p>;
  return (
    <div style={{ maxHeight: '22rem', overflowY: 'auto', margin: '0.25rem 0 0.75rem' }}>
      <table className="pivot-table" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Ziua</th>
            <th style={{ textAlign: 'left' }}>Ora</th>
            <th style={{ textAlign: 'right' }}>Litri</th>
            <th style={{ textAlign: 'left' }}>Sursa</th>
            <th style={{ textAlign: 'left' }}>Șofer / observații</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a, i) => (
            <tr key={i}>
              <td>{fmtZi(a.zi)}</td>
              <td>{a.ora ?? '—'}</td>
              <td style={{ textAlign: 'right' }}>{nf1.format(a.litri)}</td>
              <td>{a.sursa}</td>
              <td className="text-sm text-muted-foreground">{a.detaliu ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length >= 3000 && <p className="text-sm text-muted-foreground">Primele 3000 — îngustează perioada.</p>}
    </div>
  );
}

export default function CombustibilClient({ data }: { data: CombustibilData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cauta, setCauta] = useState('');
  const [faraLitri, setFaraLitri] = useState(false);
  const [deschis, setDeschis] = useState<Record<string, Alimentare[] | 'loading'>>({});

  function navigate(from: string, to: string) {
    startTransition(() => router.push(`/lde/combustibil?from=${from}&to=${to}`));
  }

  function toggle(key: string, load: () => Promise<Alimentare[]>) {
    if (deschis[key]) {
      setDeschis((p) => { const n = { ...p }; delete n[key]; return n; });
      return;
    }
    setDeschis((p) => ({ ...p, [key]: 'loading' }));
    load()
      .then((rows) => setDeschis((p) => ({ ...p, [key]: rows })))
      .catch(() => setDeschis((p) => { const n = { ...p }; delete n[key]; return n; }));
  }

  const q = cauta.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const potriveste = (s: string) => !q || s.toUpperCase().replace(/[^A-Z0-9]/g, '').includes(q);

  const flotaVizibila = useMemo(
    () => data.flota.filter((r) => (faraLitri || r.total_l > 0) && potriveste(r.plate_number)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.flota, faraLitri, q],
  );

  // Ion, 29.09: «împărțirea să fie pe direcții, nu toate împreună» — un tabel pe direcție, cu norma faptică
  const peDirectii = useMemo(() => {
    type Dir = { litri: number; masini: number; km: number; litriCuKm: number; normaKm: number; kmCuNorma: number; c3Km: number; km3: number; rows: FlotaRow[] };
    const m = new Map<string, Dir>();
    for (const r of data.flota) {
      if (r.total_l <= 0 && r.km <= 0) continue;
      const e = m.get(r.directie) ?? { litri: 0, masini: 0, km: 0, litriCuKm: 0, normaKm: 0, kmCuNorma: 0, c3Km: 0, km3: 0, rows: [] };
      e.litri += r.total_l; e.masini++; e.km += r.km; e.litriCuKm += r.litri_cu_km;
      if (r.norma_teoretica != null && r.km > 0) { e.normaKm += r.norma_teoretica * r.km; e.kmCuNorma += r.km; }
      if (r.consum3 != null && r.km > 0) { e.c3Km += r.consum3 * r.km; e.km3 += r.km; }
      m.set(r.directie, e);
    }
    for (const r of flotaVizibila) m.get(r.directie)?.rows.push(r);
    return [...m.entries()].sort((a, b) => b[1].litri - a[1].litri).map(([d, e]) => ({
      directie: d, ...e,
      consum: e.km >= 100 ? (e.litriCuKm / e.km) * 100 : null,
      norma: e.kmCuNorma > 0 ? e.normaKm / e.kmCuNorma : null,
      consum3: e.km3 > 0 ? e.c3Km / e.km3 : null,
    }));
  }, [data.flota, flotaVizibila]);

  const consumatoriPeTip = useMemo(() => {
    const m = new Map<string, ConsumatorRow[]>();
    for (const c of data.consumatori) {
      if (!faraLitri && c.litri <= 0) continue;
      if (!potriveste(c.cheie) && !potriveste(c.denumire) && !c.variante.some(potriveste)) continue;
      const a = m.get(c.tip) ?? [];
      a.push(c);
      m.set(c.tip, a);
    }
    return TIP_ORDER.filter((t) => m.has(t)).map((t) => [t, m.get(t)!] as const);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.consumatori, faraLitri, q]);

  const flotaBenzol = data.flota.reduce((s, r) => s + r.benzol_l, 0);
  const flotaFoaie = data.flota.reduce((s, r) => s + r.foaie_l, 0);
  const flotaCuLitri = data.flota.filter((r) => r.total_l > 0).length;
  const litriTip = (tipuri: string[]) =>
    data.consumatori.filter((c) => tipuri.includes(c.tip)).reduce((s, c) => s + c.litri, 0);
  const vanzari = litriTip(['vanzare']);
  const benzovoz = litriTip(['benzovoz']);
  const straini = data.consumatori.reduce((s, c) => s + c.litri, 0) + data.izolate.litri - vanzari - benzovoz;

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1>Combustibil — toate alimentările</h1>
          <p className="text-sm text-muted-foreground">
            Fiecare mașină din flotă (și cele oprite) și tot ce s-a alimentat în afara flotei, {fmtZi(data.from)} → {fmtZi(data.to)}.
            Surse: stațiile benzol (cu oră) și foile de parcurs LDE (pe zi). Click pe un rând — fiecare alimentare.
          </p>
        </div>
        <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input type="date" value={data.from} disabled={isPending} style={inputStyle}
            onChange={(e) => e.target.value && navigate(e.target.value, data.to)} />
          <span className="text-sm text-muted-foreground">→</span>
          <input type="date" value={data.to} disabled={isPending} style={inputStyle}
            onChange={(e) => e.target.value && navigate(data.from, e.target.value)} />
          <input type="search" placeholder="Caută plăcuța sau numele" value={cauta} style={inputStyle}
            onChange={(e) => setCauta(e.target.value)} />
          <label className="text-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <input type="checkbox" checked={faraLitri} onChange={(e) => setFaraLitri(e.target.checked)} />
            și fără litri în perioadă
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4" style={{ marginBottom: '1rem' }}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Flota</CardTitle>
            <Fuel className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{nf.format(flotaBenzol + flotaFoaie)} L</div>
            <div className="text-sm text-muted-foreground">benzol {nf.format(flotaBenzol)} · foi {nf.format(flotaFoaie)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Mașini cu alimentări</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{flotaCuLitri}</div>
            <div className="text-sm text-muted-foreground">din {data.flota.length} în flotă</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">În afara flotei</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{nf.format(straini)} L</div>
            <div className="text-sm text-muted-foreground">fără vânzări și benzovoz</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Vânzări · benzovoz</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{nf.format(vanzari)} L</div>
            <div className="text-sm text-muted-foreground">benzovoz {nf.format(benzovoz)} L</div>
          </CardContent>
        </Card>
      </div>

      <Card style={{ marginBottom: '1rem' }}>
        <CardHeader><CardTitle>Flota pe direcții — norma faptică</CardTitle></CardHeader>
        <CardContent>
          <table className="pivot-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Direcția</th>
                <th style={{ textAlign: 'right' }}>Mașini</th>
                <th style={{ textAlign: 'right' }}>Litri</th>
                <th style={{ textAlign: 'right' }}>Km</th>
                <th style={{ textAlign: 'right' }}>l/100 km faptic</th>
                <th style={{ textAlign: 'right' }}>Faptic 3 luni</th>
                <th style={{ textAlign: 'right' }}>Normă teoretică</th>
                <th style={{ textAlign: 'right' }}>Abatere</th>
              </tr>
            </thead>
            <tbody>
              {peDirectii.map((d) => (
                <tr key={d.directie}>
                  <td>{DIR_LABELS[d.directie] ?? d.directie}</td>
                  <td style={{ textAlign: 'right' }}>{d.masini}</td>
                  <td style={{ textAlign: 'right' }}>{nf.format(d.litri)}</td>
                  <td style={{ textAlign: 'right' }}>{nf.format(d.km)}</td>
                  <td style={{ textAlign: 'right' }}><strong>{d.consum != null ? nf1.format(d.consum) : '—'}</strong></td>
                  <td style={{ textAlign: 'right' }}>{d.consum3 != null ? nf1.format(d.consum3) : '—'}</td>
                  <td style={{ textAlign: 'right' }}>{d.norma != null ? nf1.format(d.norma) : '—'}</td>
                  <td style={{ textAlign: 'right' }}><Abatere consum={d.consum} norma={d.norma} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm text-muted-foreground" style={{ marginTop: '0.5rem' }}>
            Km: GPS-ul nostru pe zi; unde lipsește (înainte de 10.06.2026), km din LDE. Norma faptică se ia din prima zi cu km
            a fiecărei mașini — camioanele au km doar din iunie. «3 luni» = ultimele 3 luni calendaristice până la sfârșitul perioadei. Norma teoretică = a tipului mașinii; abaterea = perioada față de ea.
          </p>
        </CardContent>
      </Card>

      {peDirectii.filter((d) => d.rows.length > 0).map((d) => (
        <Card key={d.directie} style={{ marginBottom: '1rem' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>{DIR_LABELS[d.directie] ?? d.directie}</CardTitle>
            <span className="text-sm text-muted-foreground">
              {d.rows.length} mașini · {nf.format(d.litri)} L · {nf.format(d.km)} km
              {d.consum != null && <> · <strong>{nf1.format(d.consum)} l/100 km</strong></>}
              {d.consum3 != null && <> · 3 luni {nf1.format(d.consum3)}</>}
              {d.norma != null && <> · teoretică {nf1.format(d.norma)}</>}
            </span>
          </CardHeader>
          <CardContent>
            <div style={{ overflowX: 'auto' }}>
              <table className="pivot-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Mașina</th>
                    <th style={{ textAlign: 'right' }}>Benzol L</th>
                    <th style={{ textAlign: 'right' }}>Alim.</th>
                    <th style={{ textAlign: 'right' }}>Foi L</th>
                    <th style={{ textAlign: 'right' }}>Total L</th>
                    <th style={{ textAlign: 'right' }}>Km</th>
                    <th style={{ textAlign: 'right' }}>l/100 km</th>
                    <th style={{ textAlign: 'right' }}>3 luni</th>
                    <th style={{ textAlign: 'right' }}>Teoretică</th>
                    <th style={{ textAlign: 'right' }}>Abatere</th>
                    <th style={{ textAlign: 'left' }}>Prima → ultima</th>
                  </tr>
                </thead>
                <tbody>
                  {d.rows.map((r) => {
                    const key = `v:${r.vehicle_id}`;
                    return (
                      <Fragment key={key}>
                        <tr style={{ cursor: 'pointer' }}
                          onClick={() => toggle(key, () => getAlimentariMasina(r.vehicle_id, data.from, data.to))}>
                          <td>
                            <strong>{r.plate_number}</strong>
                            {!r.active && <span className="text-sm text-muted-foreground"> · oprită</span>}
                          </td>
                          <td style={{ textAlign: 'right' }}>{nf.format(r.benzol_l)}</td>
                          <td style={{ textAlign: 'right' }}>{r.benzol_n}</td>
                          <td style={{ textAlign: 'right' }}>{nf.format(r.foaie_l)}</td>
                          <td style={{ textAlign: 'right' }}><strong>{nf.format(r.total_l)}</strong></td>
                          <td style={{ textAlign: 'right' }}
                            title={`GPS-ul nostru ${r.km_zile_gps} zile, LDE ${r.km_zile_lde} zile`}>{nf.format(r.km)}</td>
                          <td style={{ textAlign: 'right' }}><strong>{r.consum != null ? nf1.format(r.consum) : '—'}</strong></td>
                          <td style={{ textAlign: 'right' }}>{r.consum3 != null ? nf1.format(r.consum3) : '—'}</td>
                          <td style={{ textAlign: 'right' }}>{r.norma_teoretica != null ? nf1.format(r.norma_teoretica) : '—'}</td>
                          <td style={{ textAlign: 'right' }}><Abatere consum={r.consum} norma={r.norma_teoretica} /></td>
                          <td>{fmtZi(r.prima)} → {fmtZi(r.ultima)}</td>
                        </tr>
                        {deschis[key] && (
                          <tr><td colSpan={11}><DetaliuTabel rows={deschis[key]} /></td></tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}

      {consumatoriPeTip.map(([tip, rows]) => (
        <Card key={tip} style={{ marginBottom: '1rem' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>{TIP_LABELS[tip] ?? tip}</CardTitle>
            <span className="text-sm text-muted-foreground">
              {rows.length} · {nf.format(rows.reduce((s, c) => s + c.litri, 0))} L în perioadă
            </span>
          </CardHeader>
          <CardContent>
            <div style={{ overflowX: 'auto' }}>
              <table className="pivot-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Plăcuța / denumirea</th>
                    <th style={{ textAlign: 'right' }}>Alim.</th>
                    <th style={{ textAlign: 'right' }}>Litri</th>
                    <th style={{ textAlign: 'left' }}>Prima → ultima (în perioadă)</th>
                    <th style={{ textAlign: 'left' }}>Surse</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const key = `c:${c.cheie}`;
                    return (
                      <Fragment key={key}>
                        <tr style={{ cursor: 'pointer' }}
                          onClick={() => toggle(key, () => getAlimentariConsumator(c.variante, c.denumire, data.from, data.to))}>
                          <td>
                            <strong>{c.denumire}</strong>
                            {c.variante.length > 1 && (
                              <span className="text-sm text-muted-foreground"> · scris și {c.variante.filter((v) => v !== c.denumire).slice(0, 4).join(', ')}</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>{c.randuri}</td>
                          <td style={{ textAlign: 'right' }}><strong>{nf.format(c.litri)}</strong></td>
                          <td>{fmtZi(c.prima_p)} → {fmtZi(c.ultima_p)}</td>
                          <td className="text-sm text-muted-foreground">{c.surse.join(', ')}</td>
                        </tr>
                        {deschis[key] && (
                          <tr><td colSpan={5}><DetaliuTabel rows={deschis[key]} /></td></tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}

      <p className="text-sm text-muted-foreground" style={{ marginBottom: '2rem' }}>
        Izolate (scrise mai puțin de 4 ori în tot istoricul — greșeli de tastare, o singură alimentare):
        {' '}{data.izolate.chei} scrieri, {data.izolate.randuri} alimentări, {nf.format(data.izolate.litri)} L în perioadă.
      </p>
    </div>
  );
}
