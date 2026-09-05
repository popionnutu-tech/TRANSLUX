'use client';

import { useState, useEffect, useId } from 'react';
import { savePart, loadPartLookups, addPartLookup, copyPartFields } from '@/app/(dashboard)/piese/part-actions';
import { searchParts } from '@/app/(dashboard)/piese/search-parts';
import SearchSelect from '@/components/SearchSelect';

export interface PartFormValues {
  id?: number;
  group_id?: number | string;
  name_long?: string;
  name_ro?: string;
  manufacturer?: string;
  model?: string;
  article_code?: string;
  oem_code?: string;
  barcode?: string;      // codul PRINCIPAL — păstrat pentru apelanții care încă trimit unul singur
  barcodes?: string[];   // toate codurile piesei, primul fiind cel principal (migr. 312)
  unit?: string;
  is_for_sale?: boolean;
}

// Formular COMUN de piesă (adăugare + editare). Folosit în Nomenclator (tab „Piese") și inline în Prihod.
// Grupa (categoria) e obligatorie; stocul NU se setează aici — piesa nouă pornește cu stoc 0.
export default function PartForm({
  groups, initial, onSaved, onCancel, onGroupChange, children, disabled,
}: {
  groups: { id: number; label: string }[];
  initial?: PartFormValues;
  onSaved: (p: { id: number; label: string }) => void;
  onCancel?: () => void;
  // Anunţă grupa aleasă, ca apelantul (Prihod) să poată propune o locaţie pe baza ei. Opţional:
  // în Nomenclator formularul e folosit fără locaţie.
  onGroupChange?: (groupId: number) => void;
  // Apelantul poate bloca salvarea cât câmpurile LUI din `children` sunt invalide (ex. locația în Prihod).
  disabled?: boolean;
  // Câmpuri suplimentare ale apelantului (ex. locaţia), randate în acelaşi formular ca să se salveze odată.
  children?: React.ReactNode;
}) {
  // Lista de coduri pornește din `barcodes` (piesă încărcată din bază) sau din `barcode` (apelant vechi).
  // Un rând gol la final ca să existe mereu unde scrie/scana, fără să apeși întâi „+".
  const initialCodes = (initial?.barcodes?.length ? initial.barcodes : (initial?.barcode ? [initial.barcode] : []));
  const [f, setF] = useState<PartFormValues>({
    group_id: initial?.group_id ?? (groups[0]?.id ?? ''),
    name_long: initial?.name_long ?? '',
    name_ro: initial?.name_ro ?? '',
    manufacturer: initial?.manufacturer ?? '',
    model: initial?.model ?? '',
    article_code: initial?.article_code ?? '',
    oem_code: initial?.oem_code ?? '',
    unit: initial?.unit ?? 'buc',
    is_for_sale: initial?.is_for_sale ?? false,
  });
  const [codes, setCodes] = useState<string[]>(initialCodes.length ? initialCodes : ['']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k: keyof PartFormValues, v: unknown) => setF((s) => ({ ...s, [k]: v }));

  // Nomenclatoarele de producători și mărci (migr. 312). Se încarcă o dată, la deschiderea formularului.
  const [manufacturers, setManufacturers] = useState<string[]>([]);
  const [carModels, setCarModels] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    loadPartLookups()
      .then((r) => { if (alive) { setManufacturers(r.manufacturers); setCarModels(r.carModels); } })
      .catch(() => { /* fără sugestii se poate lucra mai departe: câmpurile rămân text liber */ });
    return () => { alive = false; };
  }, []);

  // `useId` fiindcă formularul apare de două ori pe ecranul de Prihod (adăugare + editare) — cu id fix,
  // al doilea `datalist` l-ar suprascrie pe primul și sugestiile ar dispărea dintr-unul din ele.
  const uid = useId();
  const manufId = `manuf-${uid}`;
  const modelId = `model-${uid}`;

  // „E o valoare nouă?" — decide dacă arătăm că se adaugă în catalog. Comparație insensibilă la litere,
  // ca unicitatea din bază: cine scrie „trw" peste „TRW" nu creează o a doua intrare.
  const isNew = (v: string | undefined, list: string[]) => {
    const s = (v ?? '').trim();
    return !!s && !list.some((x) => x.toLowerCase() === s.toLowerCase());
  };
  const newManuf = isNew(f.manufacturer, manufacturers);
  const newModel = isNew(f.model, carModels);

  const setCode = (i: number, v: string) => setCodes((cs) => cs.map((c, j) => (j === i ? v : c)));
  const filledCodes = codes.map((c) => c.trim()).filter(Boolean);

  // Piesa-sursă pentru „copiază de la o piesă existentă" (cerut de Eduard: aceeași piesă, alt producător —
  // denumirea se retasta de la zero și ieșea altfel scrisă de fiecare dată).
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  async function doCopy(o: { id: number; label: string } | null) {
    if (!o) return;
    setCopyBusy(true); setError('');
    try {
      const src = await copyPartFields(o.id);
      if (!src) { setError('Piesa aleasă nu mai există'); return; }
      // Se suprascriu DOAR câmpurile de identitate; producătorul, articulul, OEM și codurile rămân goale —
      // exact prin ele diferă poziția nouă de cea copiată.
      setF((s) => ({
        ...s,
        group_id: (src.group_id as number) ?? s.group_id,
        name_long: (src.name_long as string) ?? '',
        name_ro: (src.name_ro as string) ?? '',
        model: (src.model as string) ?? '',
        unit: (src.unit as string) ?? 'buc',
        is_for_sale: !!src.is_for_sale,
        manufacturer: '', article_code: '', oem_code: '',
      }));
      setCodes(['']);
      onGroupChange?.(Number(src.group_id));
      setCopyOpen(false);
    } catch (e: any) { setError(e?.message || 'Nu am putut copia piesa'); }
    finally { setCopyBusy(false); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      // Valorile noi intră în nomenclator ÎNAINTE de salvare, iar piesa primește ortografia canonică
      // întoarsă de server. Altfel „trw" s-ar fi salvat pe piesă chiar dacă în catalog scrie „TRW".
      let manufacturer = (f.manufacturer ?? '').trim();
      let model = (f.model ?? '').trim();
      if (newManuf) manufacturer = (await addPartLookup('manufacturer', manufacturer)).name;
      if (newModel) model = (await addPartLookup('carModel', model)).name;
      const res = await savePart({ ...f, manufacturer, model, barcodes: filledCodes } as Record<string, unknown>, initial?.id);
      onSaved(res);
    } catch (err: any) { setError(err?.message || 'Eroare la salvare'); }
    finally { setLoading(false); }
  }

  const hint = { fontSize: 11, color: 'var(--muted, #888)', marginTop: 2 } as const;

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
      {/* Copierea are sens doar la o piesă NOUĂ: la editare, câmpurile sunt deja ale piesei curente. */}
      {!initial?.id && (
        <div style={{ flexBasis: '100%', marginBottom: copyOpen ? 4 : 0 }}>
          {!copyOpen ? (
            <button type="button" className="btn" style={{ padding: '3px 8px', fontSize: 12 }}
              onClick={() => setCopyOpen(true)}
              title="Aceeași piesă de la alt producător — copiază denumirea în loc s-o retastezi">
              ⧉ Copiază de la o piesă existentă
            </button>
          ) : (
            <div className="row" style={{ alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <SearchSelect searchFn={searchParts} value={''} onSelect={doCopy}
                  placeholder="— caută piesa de la care copiem denumirea —" />
              </div>
              <button type="button" className="btn" style={{ padding: '3px 8px', fontSize: 12 }}
                onClick={() => setCopyOpen(false)} disabled={copyBusy}>Renunță</button>
              <span className="muted" style={{ fontSize: 11 }}>
                Se copiază denumirea, grupa, unitatea și marca. Producătorul, articulul și codurile rămân goale.
              </span>
            </div>
          )}
        </div>
      )}

      <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
        <label>Grup (categorie) *</label>
        <select value={String(f.group_id ?? '')} onChange={(e) => { set('group_id', e.target.value); onGroupChange?.(Number(e.target.value)); }} required>
          {groups.length === 0 && <option value="">— nicio grupă —</option>}
          {groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
      </div>
      <div className="form-group" style={{ marginBottom: 0, minWidth: 220 }}>
        <label>Denumire *</label>
        <input value={f.name_long ?? ''} onChange={(e) => set('name_long', e.target.value)} required placeholder="ex: Filtru ulei…" />
      </div>
      <div className="form-group" style={{ marginBottom: 0, minWidth: 220 }}>
        <label>Denumire (RO)</label>
        <input value={f.name_ro ?? ''} onChange={(e) => set('name_ro', e.target.value)} placeholder="denumirea în română (opțional)" />
      </div>

      {/* Producător și marcă: se propune ce s-a introdus deja, dar câmpul rămâne liber — o piesă nu poate
          fi blocată fiindcă producătorul ei nu e încă în listă. Ce e nou intră în catalog la salvare. */}
      <div className="form-group" style={{ marginBottom: 0, minWidth: 150 }}>
        <label>Producător</label>
        <input list={manufId} value={f.manufacturer ?? ''} onChange={(e) => set('manufacturer', e.target.value)} placeholder="ex: Mann" />
        <datalist id={manufId}>{manufacturers.map((m) => <option key={m} value={m} />)}</datalist>
        {newManuf && <div style={hint}>+ se adaugă în catalog</div>}
      </div>
      <div className="form-group" style={{ marginBottom: 0, minWidth: 150 }}>
        <label>Marca mașinii</label>
        <input list={modelId} value={f.model ?? ''} onChange={(e) => set('model', e.target.value)} placeholder="ex: DAF SB220" />
        <datalist id={modelId}>{carModels.map((m) => <option key={m} value={m} />)}</datalist>
        {newModel && <div style={hint}>+ se adaugă în catalog</div>}
      </div>

      <div className="form-group" style={{ marginBottom: 0, minWidth: 120 }}>
        <label>Articul</label>
        <input value={f.article_code ?? ''} onChange={(e) => set('article_code', e.target.value)} placeholder="ex: W71280" />
      </div>
      <div className="form-group" style={{ marginBottom: 0, minWidth: 120 }}>
        <label>Cod OEM</label>
        <input value={f.oem_code ?? ''} onChange={(e) => set('oem_code', e.target.value)} />
      </div>

      {/* Mai multe coduri de bare: aceeași piesă vine de la furnizori diferiți, fiecare cu ambalajul lui.
          Primul e cel de pe etichetă; scanarea găsește piesa după oricare dintre ele. */}
      <div className="form-group" style={{ marginBottom: 0, minWidth: 190 }}>
        <label>Coduri de bare</label>
        {codes.map((c, i) => (
          <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <input value={c} onChange={(e) => setCode(i, e.target.value)}
              placeholder={i === 0 ? 'scanează / tastează' : 'alt ambalaj'} />
            {codes.length > 1 && (
              <button type="button" className="btn" style={{ padding: '2px 7px' }} title="Șterge codul"
                onClick={() => setCodes((cs) => cs.filter((_, j) => j !== i))}>×</button>
            )}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" className="btn" style={{ padding: '2px 8px', fontSize: 12 }}
            onClick={() => setCodes((cs) => [...cs, ''])}>+ alt cod</button>
          {filledCodes.length > 1 && <span style={hint}>primul e pe etichetă</span>}
        </div>
      </div>

      <div className="form-group" style={{ marginBottom: 0, minWidth: 80 }}>
        <label>Unitate</label>
        <input value={f.unit ?? ''} onChange={(e) => set('unit', e.target.value)} placeholder="buc" />
      </div>
      <div className="form-group" style={{ marginBottom: 0, minWidth: 120 }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={!!f.is_for_sale} onChange={(e) => set('is_for_sale', e.target.checked)} style={{ width: 'auto' }} />
          De vânzare
        </label>
      </div>
      {children}
      <button type="submit" className="btn btn-primary" disabled={loading || !!disabled}>{loading ? 'Se salvează…' : (initial?.id ? 'Salvează' : 'Adaugă piesa')}</button>
      {onCancel && <button type="button" className="btn btn-outline" onClick={onCancel} disabled={loading}>Anulează</button>}
      {error && <p style={{ color: 'var(--danger)', fontSize: 14, margin: '4px 0 0', flexBasis: '100%' }}>{error}</p>}
    </form>
  );
}
