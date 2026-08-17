'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSaptamana, getPickers, getTitularId, salveazaMulti, confirmaManualAdmin, addDublaAdmin, stergeDublaAdmin, type AtribuireView } from './actions';

// Grila săptămânală de uzine (mockup v2, 12.08.2026): o uzină pe ecran (tab-uri),
// rânduri = rută×schimb, coloane = L–D; popup cu căutare instant, zile multi-select,
// «și în șablon». Invariantul mașină⇒șofer e dublat pe server (core.atribuieMulti).

const ZI_LABEL = ['L', 'Ma', 'Mi', 'J', 'V', 'S', 'D'];
const CELL: Record<string, { bg: string; fg: string }> = {
  planificat:         { bg: '#f4f4f5', fg: '#3f3f46' },
  modificat_proactiv: { bg: '#ffedd5', fg: '#9a3412' },
  modificat_reactiv:  { bg: '#ffedd5', fg: '#9a3412' },
  confirmat_auto:     { bg: '#dcfce7', fg: '#166534' },
  confirmat_manual:   { bg: '#dcfce7', fg: '#166534' },
  nepotrivire:        { bg: '#fee2e2', fg: '#b91c1c' },
  fara_date_gps:      { bg: '#fafafa', fg: '#8a7f86' },
};
const shortName = (full: string | null) => {
  if (!full) return '';
  const p = full.trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[1][0]}.` : p[0];
};
const ddmm = (ymd: string) => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}`;

type Week = { today: string; dates: string[]; rows: AtribuireView[] };
type Pickers = { vehicles: { id: string; plate: string; inDirection: boolean }[]; soferi: { id: string; name: string; inDirection: boolean }[] };

export default function GraficUzineClient({ uzine, initialUzina, initial }: {
  uzine: { id: string; label: string }[];
  initialUzina: string | null;
  initial: Week | null;
}) {
  const [uzina, setUzina] = useState(initialUzina);
  const [week, setWeek] = useState<Week | null>(initial);
  const [pickers, setPickers] = useState<Pickers | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // popup: celula clicată + starea formularului
  const [popup, setPopup] = useState<AtribuireView | null>(null);
  const [selVehicle, setSelVehicle] = useState<string | null>(null);
  const [selDriver, setSelDriver] = useState<string | null>(null);
  const [selDates, setSelDates] = useState<string[]>([]);
  const [inSablon, setInSablon] = useState(false);
  const [qVeh, setQVeh] = useState('');
  const [qSof, setQSof] = useState('');
  const vehicleReqRef = useRef<string | null>(null); // ultima mașină cerută la getTitularId — anulează răspunsurile vechi
  const pickersCache = useRef<Map<string, Pickers>>(new Map()); // cache per uzină — revizitarea unui tab nu mai refetch-uiește

  const load = useCallback(async (uz: string) => {
    setErr(null);
    try { setWeek(await getSaptamana(uz)); } catch { setErr('Eroare la încărcare — reîncearcă.'); }
  }, []);

  useEffect(() => {
    if (!uzina) return;
    const cached = pickersCache.current.get(uzina);
    if (cached) { setPickers(cached); return; }
    setPickers(null);
    getPickers(uzina).then((p) => { pickersCache.current.set(uzina, p); setPickers(p); }).catch(() => setPickers({ vehicles: [], soferi: [] }));
  }, [uzina]);

  // grila: rânduri distincte (route_key) × coloane (dates), grupate pe schimb (cerere Ion)
  const grid = useMemo(() => {
    type Row = { key: string; label: string; frId: string; shift: number; slot: number };
    if (!week) return { groups: [] as { shift: number; rows: Row[] }[], cell: new Map<string, AtribuireView>() };
    const keys = new Map<string, Row>();
    const cell = new Map<string, AtribuireView>();
    for (const r of week.rows) {
      if (!keys.has(r.route_key)) keys.set(r.route_key, { key: r.route_key, label: r.route_label, frId: r.factory_route_id!, shift: r.shift_number!, slot: r.slot });
      cell.set(`${r.route_key}|${r.date}`, r);
    }
    const byShift = new Map<number, Row[]>();
    for (const row of keys.values()) {
      if (!byShift.has(row.shift)) byShift.set(row.shift, []);
      byShift.get(row.shift)!.push(row);
    }
    const routeNum = (label: string) => {
      const m = /^R(\d+)/.exec(label);
      return m ? parseInt(m[1], 10) : null;
    };
    const groups = [...byShift.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([shift, rows]) => ({
        shift,
        rows: rows.sort((a, b) => {
          const na = routeNum(a.label);
          const nb = routeNum(b.label);
          if (na != null && nb != null) return na - nb || a.slot - b.slot; // dublura imediat sub cursa ei
          return a.label.localeCompare(b.label);
        }),
      }));
    return { groups, cell };
  }, [week]);

  function openPopup(r: AtribuireView) {
    setPopup(r);
    setErr(null);
    setDelPending(null);
    setSelVehicle(r.vehicle_id);
    setSelDriver(r.driver_id);
    setSelDates([r.date]);
    setInSablon(false);
    setQVeh(''); setQSof('');
    vehicleReqRef.current = r.vehicle_id;
  }

  async function pickVehicle(vid: string | null) {
    if (vid === selVehicle) return; // click pe mașina deja selectată = no-op, nu suprascrie șoferul ales
    vehicleReqRef.current = vid;
    setSelVehicle(vid);
    if (vid == null) { setSelDriver(null); setInSablon(false); return; } // golește mașina — «și în șablon» nu mai are sens, nu rămâne bifat din greșeală
    // titularul se completează automat (spec: mașina merge mereu cu șofer)
    const tit = await getTitularId(vid, popup!.shift_number!).catch(() => null);
    if (vehicleReqRef.current !== vid) return; // altă mașină aleasă între timp — ignorăm răspunsul vechi
    setSelDriver(tit);
  }

  async function save() {
    if (!popup || busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await salveazaMulti({
        factoryRouteId: popup.factory_route_id!, shiftNumber: popup.shift_number!, slot: popup.slot,
        dates: selDates, vehicleId: selVehicle, driverId: selDriver,
        // defense in depth: șablonul se scrie doar cât timp popup-ul chiar are o mașină selectată
        siInSablon: selVehicle != null ? inSablon : false,
      });
      if ('error' in res) { setErr(res.error); setBusy(false); return; }
      if (uzina) await load(uzina);
      if (res.updated > 0) setPopup(null);
      if (res.skipped > 0) setErr(`${res.skipped} zile sărite — fără șofer rezolvabil`);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Eroare la salvare'); }
    setBusy(false);
  }

  // «+» adaugă o cursă dublă pe rută×schimb; «−» o șterge de azi înainte (dublă apăsare = confirmare)
  const [delPending, setDelPending] = useState<string | null>(null);
  async function plusDubla(frId: string, shift: number) {
    if (busy) return;
    setBusy(true); setErr(null);
    const res = await addDublaAdmin(frId, shift).catch(() => ({ error: 'Eroare de rețea' }));
    if ('error' in res) setErr(res.error);
    else if (uzina) await load(uzina);
    setBusy(false);
  }
  async function minusDubla(k: { key: string; frId: string; shift: number; slot: number }) {
    if (busy) return;
    if (delPending !== k.key) { setDelPending(k.key); return; } // prima apăsare = «Șterge?»
    setDelPending(null);
    setBusy(true); setErr(null);
    const res = await stergeDublaAdmin(k.frId, k.shift, k.slot).catch(() => ({ error: 'Eroare de rețea' }));
    if ('error' in res) setErr(res.error);
    else if (uzina) await load(uzina);
    setBusy(false);
  }

  async function confirmaManual() {
    if (!popup || busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await confirmaManualAdmin(popup.id);
      if ('error' in res) { setErr(res.error); setBusy(false); return; }
      setPopup(null);
      if (uzina) await load(uzina);
    } catch { setErr('Eroare la confirmare'); }
    setBusy(false);
  }

  // chips-uri DOAR când se caută (max 8) — lista completă stă în dropdown,
  // ca popup-ul să încapă într-un ecran de telefon (feedback Ion, 13.08)
  const vehList = useMemo(() => {
    if (!pickers) return [];
    const n = qVeh.trim().toUpperCase().replace(/\s+/g, '');
    return n ? pickers.vehicles.filter((v) => v.plate.includes(n)).slice(0, 8) : [];
  }, [pickers, qVeh]);
  const sofList = useMemo(() => {
    if (!pickers) return [];
    const n = qSof.trim().toLowerCase();
    return n ? pickers.soferi.filter((s) => s.name.toLowerCase().includes(n)).slice(0, 8) : [];
  }, [pickers, qSof]);
  const plateOf = (id: string | null) => (id ? pickers?.vehicles.find((v) => v.id === id)?.plate ?? '…' : null);
  const nameOf = (id: string | null) => (id ? pickers?.soferi.find((s) => s.id === id)?.name ?? '…' : null);

  const canSave = selDates.length > 0 && (selVehicle == null || selDriver != null);
  const interval = week ? `Luni ${ddmm(week.dates[0])} – Duminică ${ddmm(week.dates[6])}` : '';

  return (
    <div style={{ padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Grafic uzine</h1>
        <div style={{ fontSize: 14, color: '#52525b', fontWeight: 600 }}>{interval}</div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {uzine.map((u) => (
          <button key={u.id}
            onClick={() => { setUzina(u.id); setWeek(null); load(u.id); }}
            style={{
              padding: '9px 16px', borderRadius: 11, fontSize: 14, fontWeight: u.id === uzina ? 700 : 600,
              cursor: 'pointer', border: 'none',
              background: u.id === uzina ? '#18181b' : '#f4f4f5', color: u.id === uzina ? '#fff' : '#3f3f46',
            }}>{u.label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: '#52525b', marginBottom: 12 }}>
        <span>▢ planificat</span><span style={{ color: '#9a3412' }}>▢ modificat</span>
        <span style={{ color: '#166534' }}>▢ confirmat GPS</span><span style={{ color: '#b91c1c' }}>▢ nepotrivire</span>
        <span style={{ color: '#a16207' }}>▢ fără mașină</span>
      </div>

      {err && <div style={{ color: '#b91c1c', marginBottom: 10 }}>{err}</div>}
      {!week && !err && <div style={{ color: '#8a7f86', padding: 20 }}>Se încarcă…</div>}

      {week && (
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 3, tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ fontSize: 12, color: '#71717a' }}>
              <td style={{ width: 200 }} />
              {week.dates.map((d, i) => (
                <td key={d} style={{ textAlign: 'center', fontWeight: d === week.today ? 800 : 400, color: d === week.today ? '#2563eb' : undefined }}>
                  {ZI_LABEL[i]} {ddmm(d)}{d === week.today ? ' · azi' : ''}
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.groups.map((g) => (
              <Fragment key={`shift-${g.shift}`}>
                <tr>
                  <td colSpan={8} style={{ fontSize: 11, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: 0.4, paddingTop: 10 }}>
                    Schimbul {g.shift}
                  </td>
                </tr>
                {g.rows.map((k) => (
                  <tr key={k.key} style={{ fontSize: 12 }}>
                    <td style={{ fontWeight: 600, fontSize: 13, color: '#3f3f46', whiteSpace: 'nowrap' }} title={k.label}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: k.slot > 1 ? '#7c3aed' : undefined }}>{k.label}</span>
                        {k.slot === 1 ? (
                          <button onClick={() => plusDubla(k.frId, k.shift)} disabled={busy}
                            title="Adaugă cursă dublă (al doilea microbuz)"
                            style={{ border: '1px solid #e4e4e7', background: '#f4f4f5', color: '#2563eb', borderRadius: 6, width: 20, height: 20, lineHeight: '16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', flexShrink: 0, padding: 0 }}>+</button>
                        ) : (
                          <button onClick={() => minusDubla(k)} disabled={busy}
                            title="Șterge dublura (de azi înainte; istoricul rămâne)"
                            style={{
                              border: '1px solid #e4e4e7', borderRadius: 6, height: 20, fontSize: delPending === k.key ? 11 : 14,
                              fontWeight: 700, cursor: 'pointer', flexShrink: 0, padding: delPending === k.key ? '0 6px' : 0,
                              width: delPending === k.key ? undefined : 20, lineHeight: '16px',
                              background: delPending === k.key ? '#b91c1c' : '#f4f4f5', color: delPending === k.key ? '#fff' : '#b91c1c',
                            }}>{delPending === k.key ? 'Șterge?' : '−'}</button>
                        )}
                      </span>
                    </td>
                    {week.dates.map((d) => {
                      const r = grid.cell.get(`${k.key}|${d}`);
                      if (!r) return <td key={d} style={{ background: '#fafafa', borderRadius: 7, textAlign: 'center', color: '#d4d4d8', fontSize: 11, padding: '6px 4px' }}>nu lucrează</td>;
                      const c = r.vehicle_id ? (CELL[r.status] ?? CELL.planificat) : { bg: '#fef3c7', fg: '#a16207' };
                      const isToday = d === week.today;
                      return (
                        <td key={d}
                          onClick={() => openPopup(r)}
                          title={r.verification_note ?? undefined}
                          style={{
                            background: c.bg, color: c.fg, borderRadius: 7, textAlign: 'center', padding: '6px 4px',
                            cursor: 'pointer', border: isToday ? '2px solid #2563eb' : '2px solid transparent',
                          }}>
                          <b style={{ fontFamily: 'ui-monospace, monospace' }}>{r.plate ?? '—'}</b>
                          <div style={{ opacity: 0.78, fontSize: 11 }}>{r.driver_name ? shortName(r.driver_name) : (r.vehicle_id ? '' : 'alege')}</div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}

      {popup && (
        <div onClick={() => setPopup(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 16, padding: 20, width: 400, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,.35)' }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{popup.route_label}</div>
            <div style={{ fontSize: 12, color: '#71717a', marginBottom: 12 }}>{ZI_LABEL[week!.dates.indexOf(popup.date)]} {ddmm(popup.date)}</div>

            {popup.status === 'nepotrivire' && (
              <div style={{ background: '#fee2e2', borderRadius: 9, padding: '9px 11px', fontSize: 12, color: '#b91c1c', marginBottom: 12 }}>
                <b>Nepotrivire</b>{popup.verification_note ? ` · ${popup.verification_note}` : ''}
                <button onClick={confirmaManual} disabled={busy}
                  style={{ display: 'block', marginTop: 8, padding: '8px 12px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  ✓ Confirmă manual
                </button>
              </div>
            )}

            <div style={{ fontSize: 11, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Mașina</div>
            <input placeholder="Scrie numărul (ex: 97)…" value={qVeh} onChange={(e) => setQVeh(e.target.value)} autoFocus
              style={{ width: '100%', padding: '8px 12px', borderRadius: 10, fontSize: 14, border: '1px solid #e4e4e7', boxSizing: 'border-box', marginBottom: 6 }} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              {selVehicle && (
                <button onClick={() => pickVehicle(null)}
                  style={{ padding: '7px 12px', borderRadius: 9, fontSize: 13, cursor: 'pointer', border: '1px solid #e4e4e7', background: '#f4f4f5', color: '#b91c1c' }}>✕ golește</button>
              )}
              {!qVeh.trim() && selVehicle && (
                <span style={{ padding: '7px 12px', borderRadius: 9, fontSize: 13, fontWeight: 700, fontFamily: 'ui-monospace, monospace', background: '#2563eb', color: '#fff' }}>
                  {plateOf(selVehicle)}{selVehicle === popup.template_vehicle_id ? ' · șablon' : ''}
                </span>
              )}
              {!qVeh.trim() && popup.template_vehicle_id && popup.template_vehicle_id !== selVehicle && (
                <button onClick={() => pickVehicle(popup.template_vehicle_id)}
                  style={{ padding: '7px 12px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'ui-monospace, monospace', border: '1px dashed #a1a1aa', background: '#f4f4f5', color: '#3f3f46' }}>
                  {plateOf(popup.template_vehicle_id)} · șablon</button>
              )}
              {vehList.map((v) => {
                const isCur = v.id === selVehicle;
                const isTpl = v.id === popup.template_vehicle_id;
                return (
                  <button key={v.id} onClick={() => { pickVehicle(v.id); setQVeh(''); }}
                    style={{
                      padding: '7px 12px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      fontFamily: 'ui-monospace, monospace',
                      border: isTpl && !isCur ? '1px dashed #a1a1aa' : '1px solid transparent',
                      background: isCur ? '#2563eb' : '#f4f4f5', color: isCur ? '#fff' : v.inDirection ? '#3f3f46' : '#a1a1aa',
                    }}>{v.plate}{isTpl ? ' · șablon' : ''}</button>
                );
              })}
            </div>
            <select value={selVehicle ?? ''} onChange={(e) => pickVehicle(e.target.value || null)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 10, fontSize: 14, border: '1px solid #e4e4e7', background: '#fff', marginBottom: 4 }}>
              <option value="">— sau alege mașina din listă —</option>
              {selVehicle && !pickers?.vehicles.some((v) => v.id === selVehicle) && (
                <option value={selVehicle}>{(selVehicle === popup.vehicle_id ? popup.plate : null) ?? '…'} (inactivă)</option>
              )}
              {(pickers?.vehicles ?? []).map((v) => (
                <option key={v.id} value={v.id}>{v.plate}{v.id === popup.template_vehicle_id ? ' ★ șablon' : ''}</option>
              ))}
            </select>
            <div style={{ fontSize: 11, color: '#a1a1aa', marginBottom: 12 }}>Șoferul titular se completează automat la alegerea mașinii.</div>

            <div style={{ fontSize: 11, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
              Șoferul {selVehicle && <span style={{ color: '#b91c1c' }}>· obligatoriu</span>}
            </div>
            <input placeholder="Scrie numele…" value={qSof} onChange={(e) => setQSof(e.target.value)} disabled={!selVehicle}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 10, fontSize: 14, border: '1px solid #e4e4e7', boxSizing: 'border-box', marginBottom: 6, opacity: selVehicle ? 1 : 0.5 }} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6, opacity: selVehicle ? 1 : 0.5 }}>
              {!qSof.trim() && selDriver && (
                <span style={{ padding: '7px 12px', borderRadius: 9, fontSize: 13, fontWeight: 600, background: '#2563eb', color: '#fff' }}>{nameOf(selDriver)}</span>
              )}
              {sofList.map((s) => {
                const isCur = s.id === selDriver;
                return (
                  <button key={s.id} onClick={() => { if (selVehicle) { setSelDriver(s.id); setQSof(''); } }} disabled={!selVehicle}
                    style={{
                      padding: '7px 12px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
                      background: isCur ? '#2563eb' : '#f4f4f5', color: isCur ? '#fff' : s.inDirection ? '#3f3f46' : '#a1a1aa',
                    }}>{s.name}</button>
                );
              })}
            </div>
            <select value={selDriver ?? ''} disabled={!selVehicle} onChange={(e) => setSelDriver(e.target.value || null)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 10, fontSize: 14, border: '1px solid #e4e4e7', background: '#fff', marginBottom: 14, opacity: selVehicle ? 1 : 0.5 }}>
              <option value="">— sau alege șoferul din listă —</option>
              {selDriver && !pickers?.soferi.some((s) => s.id === selDriver) && (
                <option value={selDriver}>{(selDriver === popup.driver_id ? popup.driver_name : null) ?? '…'} (inactiv)</option>
              )}
              {(pickers?.soferi ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            <div style={{ fontSize: 11, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Se aplică pe zilele</div>
            <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
              {week!.dates.map((d, i) => {
                const exists = !!grid.cell.get(`${popup.route_key}|${d}`);
                const on = selDates.includes(d);
                return (
                  <button key={d} disabled={!exists}
                    onClick={() => setSelDates((s) => (on ? s.filter((x) => x !== d) : [...s, d]))}
                    style={{
                      width: 42, padding: '8px 0', borderRadius: 9, fontSize: 13, cursor: exists ? 'pointer' : 'default', border: 'none',
                      background: on ? '#2563eb' : exists ? '#f4f4f5' : '#fafafa',
                      color: on ? '#fff' : exists ? (d < week!.today ? '#a1a1aa' : '#3f3f46') : '#d4d4d8',
                      fontWeight: on ? 700 : 400,
                    }}>{ZI_LABEL[i]}</button>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: '#a1a1aa', marginBottom: 12 }}>Zilele trecute se bifează doar pentru corecții.</div>

            {popup.slot === 1 && ( // dublurile n-au șablon — checkbox-ul ar fi mereu fără efect
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: selVehicle ? '#3f3f46' : '#a1a1aa', marginBottom: 16 }}>
                <input type="checkbox" checked={inSablon} disabled={!selVehicle} onChange={(e) => setInSablon(e.target.checked)} />
                Salvează și în șablon (permanent, doar mașina)
              </label>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={save} disabled={!canSave || busy}
                style={{
                  flex: 1, padding: '11px 0', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none',
                  cursor: canSave && !busy ? 'pointer' : 'default',
                  background: canSave && !busy ? '#2563eb' : '#cbd5e1', color: '#fff',
                }}>{busy ? 'Se salvează…' : `Salvează · ${selDates.length} ${selDates.length === 1 ? 'zi' : 'zile'}`}</button>
              <button onClick={() => setPopup(null)}
                style={{ padding: '11px 16px', borderRadius: 10, fontSize: 14, border: 'none', background: '#f4f4f5', color: '#3f3f46', cursor: 'pointer' }}>Anulează</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
