'use client';

import { useState, useRef, useCallback, memo } from 'react';
import { loadJurnal } from './actions';
import type { AuditFeedRow } from '@/lib/audit';

// Traduceri pentru codurile din jurnal. Fallback pe codul brut, NU pe un text vag: o acțiune nouă apărută
// în cod trebuie să se vadă ca „APPEND_ISSUE", nu ca „Altceva" — altfel ecranul ar ascunde tăcut tocmai
// ce s-a adăugat ultima dată.
const ENTITY: Record<string, string> = {
  receipt: 'Prihod', issue: 'Rashod', transfer: 'Mutare', sale: 'Vânzare',
  inventory: 'Inventariere', recost: 'Revizuire cost', document: 'Document fiscal',
  admin_account: 'Cont', piese_lookup: 'Nomenclator',
  part: 'Piesă', part_group: 'Grupă', warehouse: 'Depozit',
  supplier: 'Furnizor', client: 'Client', mechanic: 'Lăcătuș', reason: 'Motiv defecțiune',
};
const ACTION: Record<string, string> = {
  CREATE: 'creat', CREATE_ISSUE: 'creat', APPEND_ISSUE: 'poziții adăugate',
  EDIT: 'corectat', EDIT_HEADER: 'antet modificat', EDIT_LINES: 'poziții corectate',
  RECEIVE: 'primită', CANCEL: 'anulată', CANCEL_TRANSFER: 'anulată',
  CONFIRM_TRANSFER: 'confirmată pe mașină', RETURN_ISSUE: 'retur de la lăcătuș',
  INVENTORY: 'inventariere', RECOST: 'cost revizuit', EFACTURA: 'trimisă la SFS',
  MARKUP: 'adaos schimbat', FOR_SALE: 'scoasă la vânzare',
  RENAME: 'redenumit', MERGE: 'comasat', MERGE_IN: 'comasat în',
  ACTIVATE: 'activat', DEACTIVATE: 'dezactivat',
  ROLE: 'rol schimbat', WAREHOUSE: 'depozit schimbat',
  EDIT_WINDOW: 'fereastră de corecție', INVOICE_VISIBILITY: 'vizibilitate facturi',
  ISSUE_SHORT_DENIED: 'eliberare peste stoc — REFUZATĂ',
};

// Câmpurile din starea dinainte/de după, în română. Cheile necunoscute se afișează ca atare.
const FIELD: Record<string, string> = {
  pozitii: 'poziții', pozitii_adaugate: 'poziții adăugate', pozitii_restituite: 'poziții restituite',
  peste_stoc: 'peste stoc', lipsuri: 'lipsuri', depozit: 'depozit', valoare: 'valoare',
  supplier_id: 'furnizor', series: 'serie', number: 'număr', comment: 'comentariu',
  rol: 'rol', edit_window_days: 'zile de corecție', sees_all_invoices: 'vede toate facturile',
};

// Formatorul se construiește O DATĂ, nu la fiecare rând: `toLocaleString` cu obiect de opțiuni
// renormalizează opțiunile la fiecare apel, iar la câteva sute de rânduri devine partea cea mai scumpă
// a randării.
const FMT = new Intl.DateTimeFormat('ro-RO', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  timeZone: 'Europe/Chisinau',
});

const zi = (s: string) => { const [a, l, z] = s.split('-'); return `${z}.${l}.${a}`; };

const val = (v: unknown) =>
  v === null || v === undefined || v === '' ? '—'
    : v === true ? 'da' : v === false ? 'nu'
      : typeof v === 'object' ? JSON.stringify(v) : String(v);

type Actor = { id: string; label: string };
type Kind = { entity: string | null; action: string };
type Filtre = { from: string; to: string; adminId: string; entity: string; action: string; q: string };

const GOL: Filtre = { from: '', to: '', adminId: '', entity: '', action: '', q: '' };

const Rand = memo(function Rand({ r, open, onToggle }: {
  r: AuditFeedRow; open: boolean; onToggle: (id: number) => void;
}) {
  const chei = Array.from(new Set([...Object.keys(r.before || {}), ...Object.keys(r.after || {})]));
  const peste = (r.after as any)?.peste_stoc === true || r.action === 'ISSUE_SHORT_DENIED';
  return (
    <tr onClick={() => chei.length && onToggle(r.id)}
      tabIndex={chei.length ? 0 : undefined}
      aria-expanded={chei.length ? open : undefined}
      onKeyDown={(e) => { if (chei.length && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onToggle(r.id); } }}
      style={{ cursor: chei.length ? 'pointer' : 'default', background: open ? 'var(--hover, #f6f7f9)' : undefined }}>
      <td>{FMT.format(new Date(r.at))}</td>
      <td>{r.who || <span className="muted">— necunoscut</span>}</td>
      <td>
        {ENTITY[r.entity || ''] || r.entity || '—'}
        {r.entityId != null && <span className="muted"> #{r.entityId}</span>}
        {/* Schimbările de conturi și de nomenclator nu au id numeric — subiectul lor stă separat. Fără el,
            un rând „rol schimbat" n-ar fi spus AL CUI cont, adică exact ce trebuie urmărit. */}
        {(r.subjectLabel || r.subjectId) &&
          <div className="muted" style={{ fontSize: 11 }}>{r.subjectLabel || r.subjectId}</div>}
        <div style={{ fontSize: 11, marginTop: 2 }}>
          <span className={`badge ${peste ? 'warn' : 'gray'}`}>{ACTION[r.action] || r.action}</span>
        </div>
      </td>
      <td>
        {r.notes || (chei.length ? <span className="muted">{chei.map((k) => FIELD[k] || k).join(', ')}</span> : <span className="muted">—</span>)}
        {open && chei.length > 0 && (
          <table style={{ marginTop: 6 }}>
            <thead><tr><th>Câmp</th><th>Înainte</th><th>După</th></tr></thead>
            <tbody>
              {chei.map((k) => (
                <tr key={k}>
                  <td>{FIELD[k] || k}</td>
                  <td className="muted">{val((r.before as any)?.[k])}</td>
                  <td><strong>{val((r.after as any)?.[k])}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </td>
    </tr>
  );
});

export default function JurnalClient({ implicitDe, zileImplicit, initialRows, initialHasMore, actors, kinds }: {
  implicitDe: string; zileImplicit: number;
  initialRows: AuditFeedRow[]; initialHasMore: boolean; actors: Actor[]; kinds: Kind[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  // Ce e în casete (se schimbă la fiecare tastă) vs. ce s-a APLICAT la ultima căutare. „Încă 50" trebuie să
  // continue lista afișată, nu să lipească peste ea prima pagină a unui filtru pe care omul l-a schimbat
  // dar nu l-a aplicat — două seturi de rezultate amestecate, fără niciun semn.
  // Pornim de la ultimele zile, dar starea „aplicată" e aceeași cu ce vede omul în casete — altfel rândul
  // de deasupra listei ar minți despre ce e afișat.
  const START: Filtre = { ...GOL, from: implicitDe };
  const [f, setF] = useState<Filtre>(START);
  const aplicate = useRef<Filtre>(START);
  const [afisat, setAfisat] = useState<Filtre>(START);

  // Numărul cererii: un răspuns întârziat de la o filtrare veche n-are voie să suprascrie rezultatul curent.
  const seq = useRef(0);

  const entities = Array.from(new Set(kinds.map((k) => k.entity).filter(Boolean) as string[])).sort();
  const actions = Array.from(new Set(kinds.map((k) => k.action))).sort();

  const toggle = useCallback((id: number) => setOpen((cur) => (cur === id ? null : id)), []);

  async function cauta(nou: Filtre) {
    const my = ++seq.current;
    setBusy(true); setErr(null);
    try {
      const r = await loadJurnal(nou);
      if (my !== seq.current) return;
      // DUPĂ ce cererea a reușit, nu înainte: pe eroare, lista rămâne cea veche, iar dacă marcasem deja
      // filtrul nou ca „aplicat", „Încă 50" ar fi lipit pagina a doua a altei căutări peste ea — exact
      // amestecul pe care fixarea filtrelor trebuia să-l împiedice.
      aplicate.current = nou;
      setAfisat(nou);
      setRows(r.rows); setHasMore(r.hasMore); setOpen(null);
    } catch (e: any) {
      if (my === seq.current) setErr(e.message);
    } finally {
      if (my === seq.current) setBusy(false);
    }
  }

  async function inca() {
    const ultim = rows[rows.length - 1];
    if (!ultim) return;
    const my = ++seq.current;
    setBusy(true); setErr(null);
    try {
      // Cursor pe ultimul rând AFIȘAT, cu filtrele APLICATE — nu cu cele din casete.
      const r = await loadJurnal({ ...aplicate.current, afterAt: ultim.at, afterId: ultim.id });
      if (my !== seq.current) return;
      setRows((prev) => [...prev, ...r.rows]);
      setHasMore(r.hasMore);
    } catch (e: any) {
      if (my === seq.current) setErr(e.message);
    } finally {
      if (my === seq.current) setBusy(false);
    }
  }

  // „Filtrat" înseamnă altceva decât starea de pornire, nu „are vreun filtru": la deschidere data e deja
  // completată, iar un buton de golire afișat din prima ar fi sugerat că cineva a filtrat înaintea ta.
  const filtrat = JSON.stringify(f) !== JSON.stringify(START);
  const totIstoricul = !afisat.from && !afisat.to;
  const set = (k: keyof Filtre) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <div className="card">
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-row"><label>De la</label><input type="date" value={f.from} onChange={set('from')} /></div>
        <div className="form-row"><label>Până la</label><input type="date" value={f.to} onChange={set('to')} /></div>
        <div className="form-row"><label>Cine</label>
          <select value={f.adminId} onChange={set('adminId')}>
            <option value="">— oricine —</option>
            {actors.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </div>
        <div className="form-row"><label>Ce</label>
          <select value={f.entity} onChange={set('entity')}>
            <option value="">— tot —</option>
            {entities.map((x) => <option key={x} value={x}>{ENTITY[x] || x}</option>)}
          </select>
        </div>
        <div className="form-row"><label>Acțiune</label>
          <select value={f.action} onChange={set('action')}>
            <option value="">— toate —</option>
            {actions.map((x) => <option key={x} value={x}>{ACTION[x] || x}</option>)}
          </select>
        </div>
        <div className="form-row" style={{ minWidth: 220 }}><label>Caută în detalii</label>
          <input value={f.q} onChange={set('q')} placeholder="denumire, cifră, «peste_stoc»"
            onKeyDown={(e) => { if (e.key === 'Enter') cauta(f); }} />
        </div>
        <button className="btn btn-primary" onClick={() => cauta(f)} disabled={busy}>{busy ? 'Caut…' : 'Filtrează'}</button>
        {filtrat && <button className="btn btn-outline" onClick={() => { setF(START); cauta(START); }} disabled={busy}>✕ Înapoi la ultimele {zileImplicit} de zile</button>}
      </div>

      {err && <div className="alert error" style={{ marginTop: 10 }}>{err}</div>}

      {/* Rândul ăsta e obligatoriu, nu decorativ: ecranul pornește cu o perioadă completată, iar dacă n-ar
          spune-o, absența unei urme vechi ar semăna leit cu inexistența ei. */}
      <div className="muted" style={{ fontSize: 12, marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>
          Se afișează:{' '}
          <strong>
            {totIstoricul ? 'tot istoricul'
              : afisat.from && afisat.to ? `${zi(afisat.from)} – ${zi(afisat.to)}`
                : afisat.from ? `din ${zi(afisat.from)} până azi`
                  : `până la ${zi(afisat.to)}`}
          </strong>
        </span>
        {!totIstoricul && (
          <button className="btn" style={{ padding: '2px 10px', fontSize: 12 }} disabled={busy}
            onClick={() => { const n = { ...f, from: '', to: '' }; setF(n); cauta(n); }}>
            Vezi tot istoricul
          </button>
        )}
      </div>

      <table style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th style={{ width: 140 }}>Când</th>
            <th style={{ width: 130 }}>Cine</th>
            <th style={{ width: 170 }}>Ce</th>
            <th>Detalii</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && !busy && (
            <tr><td colSpan={4}><div className="empty">Nicio urmă pentru filtrele astea.</div></td></tr>
          )}
          {rows.map((r) => <Rand key={r.id} r={r} open={open === r.id} onToggle={toggle} />)}
        </tbody>
      </table>

      {hasMore && (
        <button className="btn" style={{ marginTop: 10 }} onClick={inca} disabled={busy}>
          {busy ? 'Încarc…' : 'Încă 50'}
        </button>
      )}

      <p className="muted" style={{ fontSize: 11, marginTop: 12 }}>
        <strong>Autor „necunoscut" nu înseamnă „vechi".</strong> Câteva operațiuni sunt încă scrise direct
        de motorul bazei, care nu primește contul omului: <em>recepția, mutările trimise, primite și
        anulate, și inventarierea</em>. Apar fără autor și azi, nu doar în trecut — se repară pe rând.
        Au autor: eliberările de piese, vânzarea din magazin, marcarea la SFS, revizuirea costului,
        catalogul, nomenclatoarele și schimbările de permisiuni. Corectarea unei recepții lasă <em>două</em>
        rânduri — unul cu autor („poziții corectate" sau „antet modificat") și unul tehnic, fără autor.
      </p>
    </div>
  );
}
