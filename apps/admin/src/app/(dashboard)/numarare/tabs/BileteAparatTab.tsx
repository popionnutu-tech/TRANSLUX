'use client';

// Numărare → «Bilete aparat» (doar ADMIN): biletele bătute de șoferi din terminalul TIKI.
// Ion, 30.09: șoferii au voie să bată bilete fiindcă încasarea se verifică prin numărare; pagina arată
// vânzările din aparat pe șoferi, curse, tipuri de bilet și luni, cu datele importate din CSV.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getTikiMeta } from './biletAparatActions';
import type { Filters, TikiMeta } from './bilete/types';
import { presetRange, fmtDate, unreliableOverlap, type Preset } from './bilete/periods';
import { Notice, Pill } from './bilete/ui';
import OverviewView from './bilete/OverviewView';
import DriversView from './bilete/DriversView';
import RoutesView from './bilete/RoutesView';
import PairsView from './bilete/PairsView';
import MonthlyView from './bilete/MonthlyView';
import ImportPanel from './bilete/ImportPanel';

type View = 'overview' | 'drivers' | 'routes' | 'pairs' | 'monthly' | 'import';

const VIEWS: { key: View; label: string }[] = [
  { key: 'overview', label: 'Prezentare generală' },
  { key: 'drivers', label: 'Șoferi' },
  { key: 'routes', label: 'Curse' },
  { key: 'pairs', label: 'Tipuri bilet & direcții' },
  { key: 'monthly', label: 'Comparație lunară' },
  { key: 'import', label: 'Import' },
];

const PRESETS: { key: Preset; label: string }[] = [
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
  const [view, setView] = useState<View>('overview');
  const [filters, setFilters] = useState<Filters | null>(null);
  const [preset, setPreset] = useState<Preset | null>('luna_curenta');

  const loadMeta = useCallback(async () => {
    const r = await getTikiMeta();
    if (r.error) { setMetaError(r.error); return; }
    setMetaError(null);
    setMeta(r.data!);
    const anchor = r.data!.date_max;
    if (!anchor) { setView('import'); return; }
    setFilters(f => f ?? { ...presetRange('luna_curenta', anchor), route: '', driver: '' });
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

      {view !== 'import' && view !== 'monthly' && filters && meta?.date_max && (
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
        </div>
      )}

      {view !== 'import' && view !== 'monthly' && unreliable && (
        <Notice>⚠ Perioada aleasă atinge {fmtDate(unreliable.from)} – {fmtDate(unreliable.to)}. {unreliable.reason} Cifrele pe zile și cursele din acest interval nu sunt corecte; totalul pe perioadă rămâne corect.</Notice>
      )}

      {empty && view !== 'import' && (
        <Notice tone="info">Nu există încă bilete importate. Deschide «Import» și încarcă exporturile din aparat.</Notice>
      )}

      {view === 'overview' && filters && meta?.date_max && <OverviewView filters={filters} dateMax={meta.date_max} />}
      {view === 'drivers' && filters && meta?.date_max && (
        <DriversView filters={filters} onPickDriver={d => { setFilters({ ...filters, driver: d }); setView('overview'); }} />
      )}
      {view === 'routes' && filters && meta?.date_max && (
        <RoutesView filters={filters} onPickRoute={r => { setFilters({ ...filters, route: r }); setView('overview'); }} />
      )}
      {view === 'pairs' && filters && meta?.date_max && <PairsView filters={filters} />}
      {view === 'monthly' && meta?.date_max && <MonthlyView meta={meta} />}
      {view === 'import' && <ImportPanel onImported={loadMeta} />}
    </div>
  );
}
