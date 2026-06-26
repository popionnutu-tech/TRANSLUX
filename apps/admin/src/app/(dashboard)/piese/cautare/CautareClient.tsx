'use client';

import { useState, useTransition } from 'react';
import { search } from './actions';
import type { SearchResult } from '@/lib/piese-search';

type Category = { id: number; name: string; markup: number };

const lei = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei';

export default function CautareClient({ categories, showCost }: { categories: Category[]; showCost: boolean }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<number | ''>('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [pending, start] = useTransition();

  function run() {
    const query = q.trim();
    if (!query && !cat) { setResults(null); return; }
    start(async () => {
      const r = await search(query, cat === '' ? null : Number(cat));
      setResults(r);
    });
  }

  return (
    <>
      <div className="card">
        <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-row" style={{ flex: 2, minWidth: 240 }}>
            <label>Denumire / articul / OEM / cod de bare (sau scanează)</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } }}
              placeholder="ex.: amortizator, filtru ulei, штрихкод, articul…"
              autoFocus
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
      </div>

      {results != null && (
        <div className="card">
          {results.length === 0 ? (
            <div className="alert warn" style={{ margin: 0 }}>
              Nu am găsit nimic. Încearcă alt cuvânt, articulul sau scanează codul de bare. Dacă piesa nu există la noi, se comandă de la furnizor.
            </div>
          ) : (
            <>
              <div className="muted" style={{ marginBottom: 12 }}>{results.length} rezultate</div>
              <div style={{ display: 'grid', gap: 12 }}>
                {results.map((r) => <ResultCard key={r.id} r={r} showCost={showCost} />)}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

function ResultCard({ r }: { r: SearchResult }) {
  const title = [r.manufacturer, r.model].filter(Boolean).join(' · ');
  return (
    <div className="card" style={{ margin: 0, borderLeft: `4px solid ${r.inStock ? 'var(--ok, #16a34a)' : 'var(--line, #d1d5db)'}` }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, color: 'var(--muted, #6b7280)' }}>{r.groupName}</div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{r.nameLong}</div>
          {title && <div className="muted" style={{ fontSize: 13 }}>{title}</div>}
          <div className="pill-row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {r.articleCode && <span className="badge gray">артикул: {r.articleCode}</span>}
            {r.oemCode && <span className="badge gray">OEM: {r.oemCode}</span>}
            {r.barcode && <span className="badge gray" style={{ fontFamily: 'monospace' }}>{r.barcode}</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <div style={{ fontSize: 12, color: 'var(--muted, #6b7280)' }}>Preț vânzare</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{lei(r.salePrice)}</div>
          {r.avgCost != null && <div className="muted" style={{ fontSize: 12 }}>cost achiziție {lei(r.avgCost)}</div>}
        </div>
      </div>

      <div style={{ marginTop: 10, borderTop: '1px solid var(--pline, #eee)', paddingTop: 10 }}>
        {r.inStock ? (
          <div>
            <span className="badge ok">în stoc: {r.totalQty} {r.unit}</span>
            <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
              {r.stock.map((s) => (
                <div key={s.warehouseId} className="row" style={{ justifyContent: 'space-between', fontSize: 14 }}>
                  <span>{s.warehouse}{s.location ? <span className="muted"> · raft {s.location}</span> : <span className="muted"> · fără locație</span>}</span>
                  <strong>{s.qty} {r.unit}</strong>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 14 }}>
              <span className="badge gray">nu e în stoc</span>{' '}
              {r.lastSupplier?.name
                ? <>de procurat de la <strong>{r.lastSupplier.name}</strong>{r.lastSupplier.unitCost != null && <> · ultimul preț achiziție {lei(r.lastSupplier.unitCost)}</>}</>
                : <span className="muted">fără furnizor înregistrat (nu a fost recepționată încă)</span>}
            </div>
            <button className="btn" title="Modulul Comenzi furnizori vine curând — deocamdată notează manual" disabled>Comandă (în curând)</button>
          </div>
        )}
      </div>
    </div>
  );
}
