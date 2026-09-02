'use client';

import { useState, useTransition } from 'react';
import { search, searchOne } from './actions';
import { searchParts } from '../search-parts';
import SearchSelect from '@/components/SearchSelect';
import type { SearchResult } from '@/lib/piese-search';

type Category = { id: number; name: string; markup: number };
type Warehouse = { id: number; name: string };

const lei = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei';

export default function CautareClient({ categories, warehouses, boundWarehouseId, showCost }: { categories: Category[]; warehouses: Warehouse[]; boundWarehouseId: number | null; showCost: boolean }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<number | ''>('');
  // Depozit filtrat: contul legat pornește pe depozitul lui; adminul pe „toate" ('').
  const [wh, setWh] = useState<number | ''>(boundWarehouseId ?? '');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [pending, start] = useTransition();
  // Poziția aleasă din sugestii. Calea PRINCIPALĂ: scrii, apar sugestii, alegi una, vezi doar pe aceea.
  const [partId, setPartId] = useState<number | ''>('');
  const [partLabel, setPartLabel] = useState<string>('');
  // Căutarea largă rămâne, dar pliată: e utilă când clientul nu știe denumirea exactă („ceva de la punte").
  const [wideOpen, setWideOpen] = useState(false);

  function pickPart(o: { id: number; label: string } | null) {
    setPartId(o ? o.id : '');
    setPartLabel(o?.label || '');
    if (!o) { setResults(null); setExpanded(null); return; }
    start(async () => {
      const r = await searchOne(o.id, wh === '' ? null : Number(wh));
      // Poziția aleasă se deschide DIRECT pe detalii: omul a spus deja exact ce vrea, nu are ce alege dintr-o listă.
      setResults(r ? [r] : []);
      setExpanded(r ? r.id : null);
    });
  }

  function run() {
    const query = q.trim();
    if (!query && !cat) { setResults(null); return; }
    setPartId(''); setPartLabel(''); // căutarea largă anulează poziția fixată
    setExpanded(null);
    start(async () => {
      const r = await search(query, cat === '' ? null : Number(cat), wh === '' ? null : Number(wh));
      setResults(r);
    });
  }

  return (
    <>
      <div className="card">
        <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-row" style={{ flex: 2, minWidth: 260 }}>
            <label>Piesa</label>
            {/* Scrii → apar sugestii din nomenclator → alegi UNA. Înainte, căutarea era doar text liber: dacă
                nu nimereai un cuvânt destul de rar, primeai tot ce e pe depozit și poziția dorită se pierdea. */}
            <SearchSelect searchFn={searchParts} value={partId} selectedLabel={partLabel}
              onSelect={pickPart} autoFocus
              placeholder="— scrie denumirea, articulul, OEM sau scanează —" />
          </div>
          {warehouses.length > 1 ? (
            <div className="form-row" style={{ flex: 1, minWidth: 160 }}>
              <label>Depozit</label>
              <select value={wh} onChange={(e) => setWh(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">— toate —</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          ) : warehouses.length === 1 ? (
            <div className="form-row" style={{ flex: 1, minWidth: 160 }}>
              <label>Depozit</label>
              <input value={warehouses[0].name} disabled title="Contul tău e legat de acest depozit" />
            </div>
          ) : null}
        </div>

        {/* Căutarea largă: pentru „nu știu cum se cheamă exact". Pliată, ca să nu concureze cu alegerea
            poziției — comportamentul „arată tot ce e pe depozit" era exact reclamația. */}
        <div style={{ marginTop: 8 }}>
          <button type="button" className="btn" style={{ padding: '4px 8px' }}
            onClick={() => setWideOpen((o) => !o)}>
            {wideOpen ? '▾' : '▸'} Nu găsești? Caută larg
          </button>
        </div>
        {wideOpen && (
          <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 8 }}>
            <div className="form-row" style={{ flex: 2, minWidth: 240 }}>
              <label>Denumire / articul / OEM / cod de bare</label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } }}
                placeholder="ex.: amortizator, filtru ulei, штрихкод, articul…"
              />
            </div>
            <div className="form-row" style={{ flex: 1, minWidth: 180 }}>
              <label>Categorie</label>
              <select value={cat} onChange={(e) => setCat(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">— toate —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" onClick={run} disabled={pending}>{pending ? 'Caut…' : 'Caută'}</button>
          </div>
        )}
      </div>

      {results != null && (
        <div className="card">
          {results.length === 0 ? (
            <div className="alert warn" style={{ margin: 0 }}>
              Nu am găsit nimic. Încearcă alt cuvânt, articulul sau scanează codul de bare. Dacă piesa nu există la noi, se comandă de la furnizor.
            </div>
          ) : (
            <>
              <div className="muted" style={{ marginBottom: 12 }}>{results.length} rezultate · apasă pe un rând pentru detalii (stoc pe depozite, locație{showCost ? ', furnizor' : ''})</div>
              <table>
                <thead><tr><th>Denumire</th><th>Grup</th><th>Producător / Model</th><th>Articul / OEM</th><th className="num">Stoc</th><th className="num">Preț vânzare</th></tr></thead>
                <tbody>
                  {results.map((r) => (
                    <ResultRow key={r.id} r={r} showCost={showCost} open={expanded === r.id} onToggle={() => setExpanded(expanded === r.id ? null : r.id)} />
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </>
  );
}

function ResultRow({ r, showCost, open, onToggle }: { r: SearchResult; showCost: boolean; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: 'pointer', background: open ? 'var(--hover, #f6f7f9)' : undefined }}>
        <td><strong>{r.nameLong}</strong>{r.barcode && <><br /><span className="muted" style={{ fontSize: 11, fontFamily: 'monospace' }}>{r.barcode}</span></>}</td>
        <td className="muted">{r.groupName}</td>
        <td>{[r.manufacturer, r.model].filter(Boolean).join(' · ') || '—'}</td>
        <td className="muted" style={{ fontSize: 12 }}>{[r.articleCode, r.oemCode].filter(Boolean).join(' · ') || '—'}</td>
        <td className="num">{r.inStock ? <span className="badge ok">{r.totalQty} {r.unit}</span> : <span className="badge gray">0</span>}</td>
        <td className="num"><strong>{lei(r.salePrice)}</strong></td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} style={{ padding: 0 }}>
            <DetailCard r={r} showCost={showCost} />
          </td>
        </tr>
      )}
    </>
  );
}

function DetailCard({ r, showCost }: { r: SearchResult; showCost: boolean }) {
  return (
    <div style={{ padding: '12px 14px', borderLeft: `4px solid ${r.inStock ? 'var(--ok, #16a34a)' : 'var(--line, #d1d5db)'}`, background: 'var(--card-bg, #fff)' }}>
      <div className="pill-row" style={{ gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        {r.articleCode && <span className="badge gray">артикул: {r.articleCode}</span>}
        {r.oemCode && <span className="badge gray">OEM: {r.oemCode}</span>}
        {r.barcode && <span className="badge gray" style={{ fontFamily: 'monospace' }}>{r.barcode}</span>}
        {showCost && r.avgCost != null && <span className="badge gray">cost achiziție {lei(r.avgCost)}</span>}
      </div>
      {r.inStock ? (
        <div style={{ display: 'grid', gap: 4 }}>
          {r.stock.map((s) => (
            <div key={s.warehouseId} className="row" style={{ justifyContent: 'space-between', fontSize: 14 }}>
              <span>{s.warehouse}{s.location ? <span className="muted"> · raft {s.location}</span> : <span className="muted"> · fără locație</span>}</span>
              <strong>{s.qty} {r.unit}</strong>
            </div>
          ))}
        </div>
      ) : (
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 14 }}>
            <span className="badge gray">nu e în stoc</span>{' '}
            {!showCost
              ? <span className="muted">se poate comanda</span>
              : r.lastSupplier?.name
                ? <>de procurat de la <strong>{r.lastSupplier.name}</strong>{r.lastSupplier.unitCost != null && <> · ultimul preț achiziție {lei(r.lastSupplier.unitCost)}</>}</>
                : <span className="muted">fără furnizor înregistrat (nu a fost recepționată încă)</span>}
          </div>
          <button className="btn" title="Modulul Comenzi furnizori vine curând — deocamdată notează manual" disabled>Comandă (în curând)</button>
        </div>
      )}
    </div>
  );
}
