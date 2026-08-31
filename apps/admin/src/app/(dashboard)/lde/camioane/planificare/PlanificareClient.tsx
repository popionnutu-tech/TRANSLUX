'use client';

import { Fragment, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { zileleCursei } from '@/lib/lde/camioane';
import {
  anuleazaCursa, salveazaCursa, seteazaStareZi, seteazaTipCamion, stergeStareZi,
  type Camion, type Cursa, type PunctScurt, type Rezultat, type SoferScurt, type StareZi,
} from './actions';
import { adaugaPunct } from '../puncte/actions';

type Props = {
  from: string;
  zile: string[];
  camioane: Camion[];
  curse: Cursa[];
  stari: StareZi[];
  puncte: PunctScurt[];
  soferi: SoferScurt[];
};

const CULORI_MARFA: Record<string, string> = {
  diesel: '#2563eb',
  biodiesel: '#16a34a',
};
const culoare = (cargo: string | null) => {
  const k = (cargo ?? '').toLowerCase();
  for (const [nume, c] of Object.entries(CULORI_MARFA)) if (k.includes(nume)) return c;
  return '#6b7280';
};

const ziScurta = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('ro-MD', { day: '2-digit', month: '2-digit', weekday: 'short' });

const oraLocala = (iso: string) =>
  new Date(iso).toLocaleString('ro-MD', { timeZone: 'Europe/Chisinau', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** ISO local (fără fus) pentru <input type="datetime-local">. */
function pentruInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const formGol = {
  id: undefined as string | undefined,
  vehicleId: '',
  driverId: '',
  cargo: '',
  client: '',
  loadPointId: '',
  loadPlannedAt: '',
  unloadPointId: '',
  unloadPlannedAt: '',
  notes: '',
};

export default function PlanificareClient({ from, zile, camioane, curse, stari, puncte, soferi }: Props) {
  const router = useRouter();
  const [inCurs, pornesteTranzitia] = useTransition();
  const [mesaj, setMesaj] = useState('');
  const [eroare, setEroare] = useState('');
  const [form, setForm] = useState<typeof formGol | null>(null);
  const [punctNou, setPunctNou] = useState<{ pentru: 'load' | 'unload'; name: string; country: string; lat: string; lng: string } | null>(null);

  function ruleaza(actiune: () => Promise<Rezultat>, dupaSucces: () => void) {
    setMesaj(''); setEroare('');
    pornesteTranzitia(async () => {
      const r = await actiune();
      if ('error' in r) { setEroare(r.error); return; }
      setMesaj(r.mesaj); dupaSucces(); router.refresh();
    });
  }

  const grupe = useMemo(() => {
    const g: { titlu: string; camioane: Camion[] }[] = [
      { titlu: 'Cisterne', camioane: camioane.filter((c) => c.fleetType === 'cisterna') },
      { titlu: 'Zernovoz', camioane: camioane.filter((c) => c.fleetType === 'zernovoz') },
      { titlu: 'Fără tip setat', camioane: camioane.filter((c) => !c.fleetType) },
    ];
    return g.filter((x) => x.camioane.length > 0);
  }, [camioane]);

  const curseDupaCamion = useMemo(() => {
    const m = new Map<string, { cursa: Cursa; zile: Set<string> }[]>();
    for (const c of curse) {
      const lista = m.get(c.vehicleId) ?? [];
      lista.push({ cursa: c, zile: new Set(zileleCursei(c.loadPlannedAt, c.unloadPlannedAt)) });
      m.set(c.vehicleId, lista);
    }
    return m;
  }, [curse]);

  const stariDupaCheie = useMemo(() => {
    const m = new Map<string, StareZi>();
    for (const s of stari) m.set(`${s.vehicleId}|${s.date}`, s);
    return m;
  }, [stari]);

  function deschideCursaNoua(vehicleId: string, zi: string) {
    const camion = camioane.find((c) => c.id === vehicleId);
    setForm({
      ...formGol,
      vehicleId,
      driverId: camion?.driverId ?? '',
      loadPlannedAt: `${zi}T08:00`,
      unloadPlannedAt: `${zi}T18:00`,
    });
    setMesaj(''); setEroare('');
  }

  function deschideEditare(c: Cursa) {
    setForm({
      id: c.id,
      vehicleId: c.vehicleId,
      driverId: c.driverId ?? '',
      cargo: c.cargo ?? '',
      client: c.client ?? '',
      loadPointId: c.loadPointId ?? '',
      loadPlannedAt: pentruInput(c.loadPlannedAt),
      unloadPointId: c.unloadPointId ?? '',
      unloadPlannedAt: pentruInput(c.unloadPlannedAt),
      notes: c.notes ?? '',
    });
    setMesaj(''); setEroare('');
  }

  function salveaza() {
    if (!form) return;
    ruleaza(
      () => salveazaCursa({
        id: form.id,
        vehicleId: form.vehicleId,
        driverId: form.driverId || null,
        cargo: form.cargo || null,
        client: form.client || null,
        loadPointId: form.loadPointId,
        loadPlannedAt: new Date(form.loadPlannedAt).toISOString(),
        unloadPointId: form.unloadPointId,
        unloadPlannedAt: new Date(form.unloadPlannedAt).toISOString(),
        notes: form.notes || null,
      }),
      () => setForm(null),
    );
  }

  function salveazaPunctNou() {
    if (!punctNou || !form) return;
    const lat = punctNou.lat.trim() ? Number(punctNou.lat.replace(',', '.')) : null;
    const lng = punctNou.lng.trim() ? Number(punctNou.lng.replace(',', '.')) : null;
    if ((lat !== null && !Number.isFinite(lat)) || (lng !== null && !Number.isFinite(lng))) {
      setEroare('Coordonatele trebuie să fie numere'); return;
    }
    ruleaza(
      () => adaugaPunct({ name: punctNou.name, country: punctNou.country || null, lat, lng, radius_m: 500 }),
      () => setPunctNou(null),
    );
  }

  const numeCamion = (id: string) => camioane.find((c) => c.id === id)?.plate ?? '—';

  return (
    <div className="page">
      <div className="page-header">
        <h1>Planificare camioane</h1>
        <p className="text-muted">
          Cursa se întinde peste toate zilele ei. Click pe o celulă goală → cursă nouă;
          click pe bară → editare. Reparația și odihna se pun din meniul celulei.
        </p>
      </div>

      <div className="filter-bar">
        <label>De la</label>
        <input
          type="date"
          value={from}
          onChange={(e) => router.push(`/lde/camioane/planificare?from=${e.target.value}`)}
        />
        <span className="text-muted">{zile.length} zile</span>
      </div>

      {mesaj && <div className="card" style={{ borderLeft: '3px solid var(--success)' }}>{mesaj}</div>}
      {eroare && <div className="card" style={{ borderLeft: '3px solid var(--danger)' }}>{eroare}</div>}

      {form && (
        <div className="card">
          <h3>{form.id ? `Cursa camionului ${numeCamion(form.vehicleId)}` : `Cursă nouă — ${numeCamion(form.vehicleId)}`}</h3>
          <div className="grid-3">
            <div className="form-group">
              <label>Camion</label>
              <select value={form.vehicleId} onChange={(e) => {
                const cam = camioane.find((c) => c.id === e.target.value);
                setForm({ ...form, vehicleId: e.target.value, driverId: cam?.driverId ?? '' });
              }}>
                {camioane.map((c) => <option key={c.id} value={c.id}>{c.plate}{c.driverName ? ` · ${c.driverName}` : ' · fără șofer'}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Șofer</label>
              <select value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })}>
                <option value="">— fără șofer —</option>
                {soferi.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Marfă</label>
              <input list="marfa-optiuni" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} placeholder="diesel / biodiesel / …" />
              <datalist id="marfa-optiuni"><option value="diesel" /><option value="biodiesel" /></datalist>
            </div>
            <div className="form-group">
              <label>Client</label>
              <input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} placeholder="ex. stațiile TLX" />
            </div>

            <div className="form-group">
              <label>Punct încărcare</label>
              <select
                value={form.loadPointId}
                onChange={(e) => {
                  if (e.target.value === '__nou__') { setPunctNou({ pentru: 'load', name: '', country: '', lat: '', lng: '' }); return; }
                  setForm({ ...form, loadPointId: e.target.value });
                }}
              >
                <option value="">— alege —</option>
                {puncte.map((p) => <option key={p.id} value={p.id}>{p.name}{p.hasCoords ? '' : ' (fără coordonate)'}</option>)}
                <option value="__nou__">+ Punct nou…</option>
              </select>
            </div>
            <div className="form-group">
              <label>Încărcare la</label>
              <input type="datetime-local" value={form.loadPlannedAt} onChange={(e) => setForm({ ...form, loadPlannedAt: e.target.value })} />
            </div>

            <div className="form-group">
              <label>Punct descărcare</label>
              <select
                value={form.unloadPointId}
                onChange={(e) => {
                  if (e.target.value === '__nou__') { setPunctNou({ pentru: 'unload', name: '', country: '', lat: '', lng: '' }); return; }
                  setForm({ ...form, unloadPointId: e.target.value });
                }}
              >
                <option value="">— alege —</option>
                {puncte.map((p) => <option key={p.id} value={p.id}>{p.name}{p.hasCoords ? '' : ' (fără coordonate)'}</option>)}
                <option value="__nou__">+ Punct nou…</option>
              </select>
            </div>
            <div className="form-group">
              <label>Descărcare la</label>
              <input type="datetime-local" value={form.unloadPlannedAt} onChange={(e) => setForm({ ...form, unloadPlannedAt: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Note</label>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>

          {punctNou && (
            <div className="card" style={{ borderLeft: '3px solid var(--warning)' }}>
              <h4>Punct nou ({punctNou.pentru === 'load' ? 'încărcare' : 'descărcare'})</h4>
              <div className="grid-4">
                <div className="form-group"><label>Denumire</label>
                  <input value={punctNou.name} onChange={(e) => setPunctNou({ ...punctNou, name: e.target.value })} /></div>
                <div className="form-group"><label>Țara</label>
                  <input value={punctNou.country} onChange={(e) => setPunctNou({ ...punctNou, country: e.target.value })} /></div>
                <div className="form-group"><label>Lat (opțional)</label>
                  <input value={punctNou.lat} onChange={(e) => setPunctNou({ ...punctNou, lat: e.target.value })} /></div>
                <div className="form-group"><label>Lng (opțional)</label>
                  <input value={punctNou.lng} onChange={(e) => setPunctNou({ ...punctNou, lng: e.target.value })} /></div>
              </div>
              <div className="flex gap-2">
                <button className="btn-primary" onClick={salveazaPunctNou} disabled={inCurs}>Adaugă punctul</button>
                <button className="btn-outline" onClick={() => setPunctNou(null)} disabled={inCurs}>Renunță</button>
              </div>
              <p className="text-muted">După adăugare, alege-l din listă (pagina se reîmprospătează).</p>
            </div>
          )}

          <div className="flex gap-2">
            <button className="btn-primary" onClick={salveaza} disabled={inCurs}>Salvează cursa</button>
            <button className="btn-outline" onClick={() => setForm(null)} disabled={inCurs}>Închide</button>
            {form.id && (
              <button
                className="btn-danger"
                disabled={inCurs}
                onClick={() => {
                  const motiv = window.prompt('Motivul anulării?');
                  if (motiv) ruleaza(() => anuleazaCursa(form.id as string, motiv), () => setForm(null));
                }}
              >
                Anulează cursa
              </button>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <div className="pivot-wrap">
          <table className="pivot-table pivot-compact">
            <thead>
              <tr>
                <th style={{ minWidth: 150 }}>Camion</th>
                {zile.map((z) => <th key={z} style={{ minWidth: 92 }}>{ziScurta(z)}</th>)}
              </tr>
            </thead>
            <tbody>
              {grupe.map((g) => (
                <Fragment key={g.titlu}>
                  <tr className="pivot-group-row">
                    <td colSpan={zile.length + 1}>{g.titlu} ({g.camioane.length})</td>
                  </tr>
                  {g.camioane.map((cam) => (
                    <tr key={cam.id}>
                      <td>
                        <strong>{cam.plate}</strong>
                        <div className="text-muted" style={{ fontSize: 12 }}>{cam.driverName ?? 'fără șofer'}</div>
                        <select
                          value={cam.fleetType ?? ''}
                          disabled={inCurs}
                          style={{ fontSize: 11, padding: '1px 2px', marginTop: 2 }}
                          onChange={(e) => {
                            const v = e.target.value as 'cisterna' | 'zernovoz' | '';
                            if (!v) return;
                            ruleaza(() => seteazaTipCamion(cam.id, v), () => {});
                          }}
                        >
                          <option value="">tip?</option>
                          <option value="cisterna">cisternă</option>
                          <option value="zernovoz">zernovoz</option>
                        </select>
                      </td>
                      {zile.map((z) => {
                        const stare = stariDupaCheie.get(`${cam.id}|${z}`);
                        const curseZi = (curseDupaCamion.get(cam.id) ?? []).filter((x) => x.zile.has(z));
                        if (stare) {
                          return (
                            <td key={z} className="pivot-cell" style={{ background: 'repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6 6px,#e5e7eb 6px,#e5e7eb 12px)', cursor: 'pointer' }}
                              title={stare.reason ?? ''}
                              onClick={() => ruleaza(() => stergeStareZi(cam.id, z), () => {})}>
                              <span className="badge">{stare.state === 'reparatie' ? 'reparație' : 'odihnă'}</span>
                            </td>
                          );
                        }
                        if (curseZi.length > 0) {
                          // Cursele lipite cap la cap sunt permise, deci într-o zi pot fi mai
                          // multe: le desenăm pe toate, altfel a doua ar fi invizibilă în grilă.
                          return (
                            <td key={z} className="pivot-cell" style={{ padding: 2 }}>
                              {curseZi.map(({ cursa: c }) => (
                                <div
                                  key={c.id}
                                  onClick={() => deschideEditare(c)}
                                  title={`${c.cargo ?? ''} ${c.client ?? ''}`.trim()}
                                  style={{
                                    background: culoare(c.cargo), color: '#fff', borderRadius: 4,
                                    padding: '4px 6px', fontSize: 11, lineHeight: 1.25, cursor: 'pointer',
                                    marginBottom: curseZi.length > 1 ? 2 : 0,
                                    opacity: c.loadPointName && c.unloadPointName ? 1 : 0.75,
                                  }}
                                >
                                  <div>{c.loadPointName ?? '?'} → {c.unloadPointName ?? '?'}</div>
                                  <div style={{ opacity: 0.85 }}>{c.cargo ?? '—'}</div>
                                </div>
                              ))}
                            </td>
                          );
                        }
                        return (
                          <td key={z} className="pivot-cell" style={{ cursor: 'pointer' }}>
                            <div className="flex gap-2" style={{ justifyContent: 'center' }}>
                              <button className="btn-outline" style={{ padding: '2px 6px', fontSize: 11 }}
                                onClick={() => deschideCursaNoua(cam.id, z)}>+</button>
                              <button className="btn-outline" style={{ padding: '2px 6px', fontSize: 11 }} title="La reparație"
                                onClick={() => {
                                  const motiv = window.prompt('Motivul reparației (opțional)') ?? '';
                                  ruleaza(() => seteazaStareZi({ vehicleId: cam.id, date: z, state: 'reparatie', reason: motiv || null, expectedEnd: null }), () => {});
                                }}>R</button>
                              <button className="btn-outline" style={{ padding: '2px 6px', fontSize: 11 }} title="Odihnă șofer"
                                onClick={() => ruleaza(() => seteazaStareZi({ vehicleId: cam.id, date: z, state: 'odihna', reason: null, expectedEnd: null }), () => {})}>O</button>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
              {grupe.length === 0 && (
                <tr><td colSpan={zile.length + 1} className="pivot-empty">Niciun camion activ în flotă.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Cursele din fereastră ({curse.length})</h3>
        <div className="pivot-wrap">
          <table className="pivot-table">
            <thead><tr><th>Camion</th><th>Traseu</th><th>Marfă</th><th>Încărcare</th><th>Descărcare</th><th>Stare</th></tr></thead>
            <tbody>
              {curse.map((c) => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => deschideEditare(c)}>
                  <td>{numeCamion(c.vehicleId)}</td>
                  <td>{c.loadPointName ?? '?'} → {c.unloadPointName ?? '?'}</td>
                  <td>{c.cargo ?? '—'}</td>
                  <td>{oraLocala(c.loadPlannedAt)}</td>
                  <td>{oraLocala(c.unloadPlannedAt)}</td>
                  <td><span className="badge">{c.status}</span></td>
                </tr>
              ))}
              {curse.length === 0 && <tr><td colSpan={6} className="pivot-empty">Nicio cursă planificată în această fereastră.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
