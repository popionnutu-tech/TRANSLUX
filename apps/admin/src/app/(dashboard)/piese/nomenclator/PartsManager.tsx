'use client';

import { useState } from 'react';
import SearchSelect from '@/components/SearchSelect';
import PartForm, { type PartFormValues } from '@/components/PartForm';
import { searchParts } from '../search-parts';
import { loadPart } from '../part-actions';

// Tab „Piese (catalog)" din Nomenclator. NU afișăm toate cele mii de piese într-un tabel (prea multe);
// în schimb: un formular de adăugare + o căutare care încarcă o piesă existentă pentru editare.
export default function PartsManager({ groups }: { groups: { id: number; label: string }[] }) {
  const [addKey, setAddKey] = useState(0);        // remontează formularul de adăugare ca să se golească
  const [added, setAdded] = useState('');

  const [editId, setEditId] = useState<number | ''>('');
  const [editVals, setEditVals] = useState<PartFormValues | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [saved, setSaved] = useState('');

  async function pickForEdit(id: number | '', label?: string) {
    setSaved('');
    if (!id) { setEditId(''); setEditVals(null); setEditLabel(''); return; }
    setEditId(id); setEditLabel(label || '');
    const row = await loadPart(id);
    setEditVals(row ? {
      id,
      group_id: (row.group_id as number) ?? '',
      name_long: (row.name_long as string) ?? '',
      name_ro: (row.name_ro as string) ?? '',
      manufacturer: (row.manufacturer as string) ?? '',
      model: (row.model as string) ?? '',
      article_code: (row.article_code as string) ?? '',
      oem_code: (row.oem_code as string) ?? '',
      barcode: (row.barcode as string) ?? '',
      unit: (row.unit as string) ?? 'buc',
      is_for_sale: !!row.is_for_sale,
    } : null);
  }

  return (
    <>
      <div className="card">
        <h2>Adaugă piesă nouă</h2>
        <p className="muted" style={{ marginTop: -6 }}>Piesa nouă pornește cu <strong>stoc 0</strong> — stocul intră prin Prihod (recepție) sau Inventar.</p>
        <PartForm
          key={addKey}
          groups={groups}
          onSaved={(p) => { setAdded(p.label); setAddKey((k) => k + 1); }}
        />
        {added && <p style={{ color: 'var(--success, #16a34a)', fontSize: 14, marginBottom: 0 }}>✓ Adăugată: {added}</p>}
      </div>

      <div className="card">
        <h2>Editează o piesă existentă</h2>
        <div style={{ maxWidth: 520, marginBottom: 14 }}>
          <SearchSelect
            searchFn={searchParts}
            value={editId}
            selectedLabel={editLabel}
            onSelect={(o) => pickForEdit(o ? o.id : '', o?.label)}
            placeholder="— caută piesa (denumire, cod, articol) —"
          />
        </div>
        {editVals && (
          <PartForm
            key={`edit-${editId}`}
            groups={groups}
            initial={editVals}
            onSaved={(p) => { setSaved(p.label); pickForEdit(''); }}
            onCancel={() => pickForEdit('')}
          />
        )}
        {saved && <p style={{ color: 'var(--success, #16a34a)', fontSize: 14, marginBottom: 0 }}>✓ Salvată: {saved}</p>}
      </div>
    </>
  );
}
