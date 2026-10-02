'use client';

// Numărare → «Bilete aparat» (doar ADMIN): biletele bătute de șoferi din terminalul TIKI.
// Ion, 30.09: șoferii au voie să bată bilete fiindcă încasarea se verifică prin numărare.
// ION-159: «Față de anul trecut» pe ziua cursei Mobilet; Șoferi și Tipuri bilet pe ziua vânzării. Ion, 01.10: «șterge
// cine merge pe rută, șterge orar; în tipul bilet și direcții să apară o coloană — oamenii omiși de TIKI dar fixați în
// numărare»; «șterge import, că am făcut cron automat» (importul zilnic din Mobilet, ION-160).
// ION-167 (Ion, 01.10): «Față de anul trecut» → «Comparație perioade»; graficele pe luni sunt acum pe fiecare rută, în «Rute»
// (Ion, 02.10: «nu am nevoie pe coridor, am nevoie pe fiecare grafic în parte și tipul de clienți pe care se ține»); raport nou «Rute»; «Șoferi» refăcut — toate pe ziua
// cursei, din totalurile zilnice de noapte (migr. 466).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getTikiMeta, getTikiRefacereStare } from './biletAparatActions';
import type { Filters, TikiMeta, TikiRefacereStare } from './bilete/types';
import { presetRange, fmtDate, unreliableOverlap, type Preset } from './bilete/periods';
import { Notice, Pill } from './bilete/ui';
import ComparatieView from './bilete/ComparatieView';
import RuteView from './bilete/RuteView';
import DriversView from './bilete/DriversView';
import PairsView from './bilete/PairsView';

type View = 'pairs' | 'comparatie' | 'rute' | 'drivers';

const VIEWS: { key: View; label: string }[] = [
  { key: 'pairs', label: 'Tipuri bilet & direcții' },
  { key: 'comparatie', label: 'Comparație perioade' },
  { key: 'rute', label: 'Rute' },
  { key: 'drivers', label: 'Șoferi' },
];

/** Vederile cu perioada comună de sus; Comparație, Rute și Șoferi își aleg singure luna. */
const WITH_PERIOD: View[] = ['pairs'];
/** Filtrele pe eticheta TIKI și șofer: doar «Tipuri bilet & direcții» (ziua vânzării). */
const WITH_LABEL_FILTERS: View[] = ['pairs'];

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

const LUNI = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sep.', 'oct.', 'nov.', 'dec.'];
const fmtLuna = (d: string) => `${LUNI[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

export default function BileteAparatTab() {
  const [meta, setMeta] = useState<TikiMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [refacere, setRefacere] = useState<TikiRefacereStare | null>(null);
  const [view, setView] = useState<View>('pairs');
  const [filters, setFilters] = useState<Filters | null>(null);
  const [preset, setPreset] = useState<Preset | null>('ultimele_8s');

  const loadMeta = useCallback(async () => {
    const r = await getTikiMeta();
    if (r.error) { setMetaError(r.error); return; }
    setMetaError(null);
    setMeta(r.data!);
    const anchor = r.data!.date_max;
    if (!anchor) return;
    setFilters(f => f ?? { ...presetRange('ultimele_8s', anchor), route: '', driver: '' });
  }, []);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { getTikiRefacereStare().then(r => { if (r.data) setRefacere(r.data); }); }, []);

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
      {refacere && (refacere.luni_in_asteptare.length > 0 || refacere.zile_numarare > 0) && (
        <Notice tone="info">
          Recalcul în așteptare
          {refacere.luni_in_asteptare.length > 0 && <> pentru {refacere.luni_in_asteptare.map(fmtLuna).join(', ')}</>}
          {refacere.zile_numarare > 0 && <> · Numărarea: {refacere.zile_numarare} zile × rute</>}
          . Se face noaptea (23:00–05:00), până atunci cifrele acestor luni sunt cele vechi.
        </Notice>
      )}

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

      {empty && (
        <Notice tone="info">Nu există încă bilete. Importul automat din Mobilet rulează în fiecare dimineață.</Notice>
      )}

      {view === 'comparatie' && meta?.date_min && meta.date_max && <ComparatieView dateMin={meta.date_min} dateMax={meta.date_max} />}
      {view === 'rute' && meta?.date_min && meta.date_max && <RuteView dateMin={meta.date_min} dateMax={meta.date_max} />}
      {view === 'drivers' && meta?.date_min && meta.date_max && <DriversView dateMin={meta.date_min} dateMax={meta.date_max} />}
      {view === 'pairs' && filters && meta?.date_max && <PairsView filters={filters} />}
    </div>
  );
}
