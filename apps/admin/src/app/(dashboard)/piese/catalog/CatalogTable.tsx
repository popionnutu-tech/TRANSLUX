'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PartForm, { type PartFormValues } from '@/components/PartForm';
import PartLocationEditor from '@/components/PartLocationEditor';
import LabelModal, { type LabelData } from './LabelModal';
import { partLabelData } from '../part-actions';

type Opt = { id: number; label: string };

// Tabelul catalogului. Dacă rolul poate edita (canEdit), rândurile sunt clicabile → modal cu formularul
// de editare a piesei + editorul de locație. Altfel e doar de citit (VINZATOR/MANAGER).
export default function CatalogTable({ rows, groups, warehouses, canEdit }: {
  rows: any[]; groups: Opt[]; warehouses: Opt[]; canEdit: boolean;
}) {
  const router = useRouter();
  const [edit, setEdit] = useState<any | null>(null);
  const [adding, setAdding] = useState(false); // modal „piesă nouă în catalog"
  const [label, setLabel] = useState<LabelData | null>(null); // eticheta de tipărit
  const [labelBusy, setLabelBusy] = useState<number | null>(null);

  async function openLabel(id: number) {
    setLabelBusy(id);
    try { const d = await partLabelData(id); if (d) setLabel(d as LabelData); }
    catch { alert('Nu am putut încărca eticheta. Reîncearcă.'); }
    finally { setLabelBusy(null); }
  }

  const initial: PartFormValues | null = edit && {
    id: edit.id,
    group_id: edit.group_id,
    name_long: edit.name_long ?? '',
    name_ro: edit.name_ro ?? '',
    manufacturer: edit.manufacturer ?? '',
    model: edit.model ?? '',
    article_code: edit.article_code ?? '',
    oem_code: edit.oem_code ?? '',
    barcode: edit.barcode ?? '',
    unit: edit.unit ?? 'buc',
    is_for_sale: !!edit.is_for_sale,
  };

  return (
    <>
      {canEdit && (
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Adaugă piesă nouă</button>
        </div>
      )}
      <table>
        <thead>
          <tr><th>Denumire</th><th>Grup</th><th>Producător</th><th>Model</th><th>Articul</th><th>Cod de bare</th><th>Unit.</th><th>Vânzare</th><th>Etichetă</th></tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr
              key={p.id}
              onClick={canEdit ? () => setEdit(p) : undefined}
              style={canEdit ? { cursor: 'pointer' } : undefined}
              title={canEdit ? 'Apasă pentru a edita piesa și locația' : undefined}
            >
              <td><strong>{p.name_ro || p.name_long || '—'}</strong></td>
              <td className="muted">{p.group_name}</td>
              <td>{p.manufacturer || '—'}</td>
              <td className="muted">{p.model || '—'}</td>
              <td className="muted">{p.article_code || '—'}</td>
              <td className="muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>{p.barcode || '—'}</td>
              <td>{p.unit}</td>
              <td>{p.is_for_sale ? <span className="badge ok">da</span> : <span className="badge gray">parc</span>}</td>
              <td onClick={(e) => e.stopPropagation()}>
                <button className="btn btn-outline" style={{ padding: '2px 8px', whiteSpace: 'nowrap' }} disabled={labelBusy === p.id} onClick={() => openLabel(p.id)} title="Tipărește eticheta piesei">{labelBusy === p.id ? '…' : '🏷 Etichetă'}</button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={9} className="muted">Nicio piesă găsită. Schimbă căutarea sau categoria.</td></tr>
          )}
        </tbody>
      </table>

      {edit && initial && (
        <div onClick={() => setEdit(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', zIndex: 1000, overflowY: 'auto' }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 960, width: '100%', margin: 0 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ marginTop: 0 }}>Editează piesa</h2>
              <button className="btn btn-outline" onClick={() => setEdit(null)}>Închide</button>
            </div>
            <PartForm
              groups={groups}
              initial={initial}
              onSaved={() => { setEdit(null); router.refresh(); }}
              onCancel={() => setEdit(null)}
            />
            <PartLocationEditor partId={edit.id} warehouses={warehouses} />
          </div>
        </div>
      )}

      {adding && (
        <div onClick={() => setAdding(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', zIndex: 1000, overflowY: 'auto' }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 960, width: '100%', margin: 0 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ marginTop: 0 }}>Piesă nouă în catalog</h2>
              <button className="btn btn-outline" onClick={() => setAdding(false)}>Închide</button>
            </div>
            <p className="muted" style={{ marginTop: -6 }}>Piesa nouă pornește cu <strong>stoc 0</strong> — stocul intră prin Prihod (recepție) sau Inventar. Locația o pui apoi apăsând pe piesă în listă.</p>
            <PartForm
              groups={groups}
              onSaved={() => { setAdding(false); router.refresh(); }}
              onCancel={() => setAdding(false)}
            />
          </div>
        </div>
      )}

      {label && <LabelModal data={label} onClose={() => setLabel(null)} />}
    </>
  );
}
