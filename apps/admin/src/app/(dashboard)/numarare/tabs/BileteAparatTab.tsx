'use client';

// Numărare → «Bilete aparat» (doar ADMIN): biletele bătute de șoferi din terminalul TIKI.
// Ion, 30.09: șoferii au voie să bată bilete fiindcă încasarea se verifică prin numărare.
// ION-159: «Orar» (ce curse tai / adaug / mut), «Față de anul trecut» și «Cine merge pe rută» (TIKI + Numărare),
// toate pe ziua cursei Mobilet; Șoferi și Tipuri bilet rămân pe ziua vânzării.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getTikiMeta } from './biletAparatActions';
import type { Filters, TikiMeta } from './bilete/types';
import { presetRange, fmtDate, unreliableOverlap, type Preset } from './bilete/periods';
import { Notice, Pill } from './bilete/ui';
import OrarView from './bilete/OrarView';
import TendintaView from './bilete/TendintaView';
import ClientiView from './bilete/ClientiView';
import DriversView from './bilete/DriversView';
import PairsView from './bilete/PairsView';
import ImportPanel from './bilete/ImportPanel';

type View = 'orar' | 'tendinta' | 'clienti' | 'drivers' | 'pairs' | 'import';

const VIEWS: { key: View; label: string }[] = [
  { key: 'orar', label: 'Orar' },
  { key: 'tendinta', label: 'Față de anul trecut' },
  { key: 'clienti', label: 'Cine merge pe rută' },
  { key: 'drivers', label: 'Șoferi' },
  { key: 'pairs', label: 'Tipuri bilet & direcții' },
  { key: 'import', label: 'Import' },
];

/** Vederile cu perioadă (de la – până la); «Față de anul trecut» ia toată istoria pe luni. */
const WITH_PERIOD: View[] = ['orar', 'clienti', 'drivers', 'pairs'];
/** Filtrele pe eticheta TIKI și șofer au sens doar pe vederile vechi (ziua vânzării). */
const WITH_LABEL_FILTERS: View[] = ['drivers', 'pairs'];

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'ultimele_8s', label: '8 săptămâni' },
  { key: 'luna_curenta', label: 'Luna ultimă' },
  { key: 'luna_trecuta', label: 'Luna dinainte' },
  { key: 'ultimele_30', label: '30 zile' },
  { key: 'ultimele_90', label: '90 zile' },
  { key: 'anul_curent', label: 'Anul' },
];

const inputStyle: React.CSSProperties = {
  padding: '6px 8px', border: '1px solid rgba(0,0,0,0.15)', borderRadius: 6, fontSize: 13, background: '#fff',
  width: 'auto', flex: '0 0 auto',
};

export default function BileteAparatTab() {
  const [meta, setMeta] = useState<TikiMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [view, setView] = useState<View>('orar');
  const [filters, setFilters] = useState<Filters | null>(null);
  const [preset, setPreset] = useState<Preset | null>('ultimele_8s');
  const [clientiRoute, setClientiRoute] = useState<number | null>(null);

  const loadMeta = useCallback(async () => {
    const r = await getTikiMeta();
    if (r.error) { setMetaError(r.error); return; }
    setMetaError(null);
    setMeta(r.data!);
    const anchor = r.data!.date_max;
    if (!anchor) { setView('import'); return; }
    setFilters(f => f ?? { ...presetRange('ultimele_8s', anchor), route: '', driver: '' });
  }, []);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  const applyPreset = (p: Preset) => {
    if (!meta?.date_max || !filters) return;
    setPreset(p);
    setFilters({ ...filters, ...presetRange(p, meta.date_max) });
  };

  const unreliable = useMemo(() => (filters ? unreliableOverlap(filters) : null), [filters]);
  const empty = meta && !meta.date_max;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, color: '#9B1B30' }}>Bilete aparat</h2>
          <div style={{ fontSize: 13, color: '#777' }}>
            Biletele bătute de șoferi din terminal (TIKI).
            {meta?.date_max && <> Date importate: {fmtDate(meta.date_min!)} – {fmtDate(meta.date_max)} · {new Intl.NumberFormat('ro-RO').format(meta.tickets)} bilete.</>}
          </div>
        </div>
      </div>

      {metaError && <Notice tone="danger">Nu s-au putut încărca datele: {metaError}</Notice>}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {VIEWS.map(v => (
          <Pill key={v.key} active={view === v.key} onClick={() => setView(v.key)}>{v.label}</Pill>
        ))}
      </div>

      {WITH_PERIOD.includes(view) && filters && meta?.date_max && (
        <div className="card" style={{ padding: '10px 12px', marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {PRESETS.map(p => (
              <button key={p.key} onClick={() => applyPreset(p.key)} className="btn"
                style={{ padding: '4px 10px', fontSize: 12, ...(preset === p.key ? { background: 'var(--primary-dim)' } : {}) }}>
                {p.label}
              </button>
            ))}
          </div>
          <input type="date" value={filters.from} min={meta.date_min ?? undefined} max={filters.to} style={inputStyle}
            onChange={e => { if (e.target.value) { setPreset(null); setFilters({ ...filters, from: e.target.value }); } }} />
          <span style={{ color: '#999' }}>→</span>
          <input type="date" value={filters.to} min={filters.from} max={meta.date_max} style={inputStyle}
            onChange={e => { if (e.target.value) { setPreset(null); setFilters({ ...filters, to: e.target.value }); } }} />
          {WITH_LABEL_FILTERS.includes(view) && <>
          <select value={filters.route} onChange={e => setFilters({ ...filters, route: e.target.value })} style={{ ...inputStyle, maxWidth: 230 }}>
            <option value="">Toate cursele</option>
            {meta.routes.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
          </select>
          <select value={filters.driver} onChange={e => setFilters({ ...filters, driver: e.target.value })} style={{ ...inputStyle, maxWidth: 230 }}>
            <option value="">Toți șoferii</option>
            {meta.drivers.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
          </select>
          {(filters.route || filters.driver) && (
            <button className="btn" style={{ padding: '4px 10px', fontSize: 12 }}
              onClick={() => setFilters({ ...filters, route: '', driver: '' })}>× Filtre</button>
          )}
          </>}
        </div>
      )}

      {WITH_LABEL_FILTERS.includes(view) && unreliable && (
        <Notice>⚠ Perioada aleasă atinge {fmtDate(unreliable.from)} – {fmtDate(unreliable.to)}. {unreliable.reason} Cifrele pe zile și cursele din acest interval nu sunt corecte; totalul pe perioadă rămâne corect.</Notice>
      )}

      {empty && view !== 'import' && (
        <Notice tone="info">Nu există încă bilete importate. Deschide «Import» și încarcă exporturile din aparat.</Notice>
      )}

      {view === 'orar' && filters && meta?.date_max && (
        <OrarView filters={filters} onOpenRoute={id => { setClientiRoute(id); setView('clienti'); }} />
      )}
      {view === 'tendinta' && meta?.date_max && <TendintaView dateMax={meta.date_max} />}
      {view === 'clienti' && filters && meta?.date_max && (
        <ClientiView filters={filters} routeId={clientiRoute} onRouteChange={setClientiRoute} />
      )}
      {view === 'drivers' && filters && meta?.date_max && (
        <DriversView filters={filters} onPickDriver={d => setFilters({ ...filters, driver: d })} />
      )}
      {view === 'pairs' && filters && meta?.date_max && <PairsView filters={filters} />}
      {view === 'import' && <ImportPanel onImported={loadMeta} />}
    </div>
  );
}
