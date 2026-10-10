'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getGraficReport,
  confirmDay,
  unconfirmDay,
  getCurrentOperatorName,
  type GraficRouteRow,
  type Anomaly,
  type OrphanManual,
  type Confirmation,
} from './incasareActions';
import RoutesTable from './RoutesTable';
import CasierDocumentTab from './CasierDocumentTab';
import RaportRuteTab from './RaportRuteTab';

function todayChisinau(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
}
function yesterdayChisinau(): string {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
}

type SubTab = 'casier' | 'numerar' | 'routes' | 'raport';

interface Props {
  role: string;  // 'ADMIN' | 'EVALUATOR_INCASARI'
}

export default function IncasareTab({ role }: Props) {
  const canEdit = role === 'EVALUATOR_INCASARI';
  const [from, setFrom] = useState<string>(yesterdayChisinau);
  const [to, setTo] = useState<string>(yesterdayChisinau);
  const [subTab, setSubTab] = useState<SubTab>('casier');
  // Câte rânduri are fiecare document de casier — raportate de tabelul montat, pentru badge-uri.
  const [casierCounts, setCasierCounts] = useState({ terminal: 0, manual: 0 });
  // Documentul montat are modificări nesalvate? Schimbarea sub-tab-ului îl demontează.
  const [casierDirty, setCasierDirty] = useState(false);

  const [routes, setRoutes] = useState<GraficRouteRow[]>([]);
  const [orphanInc, setOrphanInc] = useState<Anomaly[]>([]);
  // Numerar introdus manual care n-a nimerit nicio rută — bani care altfel ar dispărea tăcut.
  const [orphanManual, setOrphanManual] = useState<OrphanManual[]>([]);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [operatorName, setOperatorName] = useState<string>('—');

  useEffect(() => {
    getCurrentOperatorName().then(setOperatorName);
  }, []);

  // Identitate stabilă + bail-out la valori egale: altfel actualizarea badge-urilor ar
  // re-crea callback-ul la fiecare randare și ar reporni efectul din tabel la nesfârșit.
  const handleCasierCounts = useCallback((c: { terminal: number; manual: number }) => {
    setCasierCounts(prev =>
      prev.terminal === c.terminal && prev.manual === c.manual ? prev : c);
  }, []);

  const handleCasierDirty = useCallback((dirty: boolean) => {
    setCasierDirty(prev => (prev === dirty ? prev : dirty));
  }, []);

  // Comutarea filei demontează tabelul, iar schimbarea zilei îl reîncarcă: în ambele cazuri
  // rândurile introduse și încă nesalvate dispar fără niciun avertisment, iar documentul
  // Numerar e singura lor evidență.
  function confirmaAbandonul(ce: string): boolean {
    if (!casierDirty) return true;
    return confirm(`Sunt modificări nesalvate în documentul de casier. Sigur ${ce}? Modificările se pierd.`);
  }

  function selectSubTab(next: SubTab) {
    if (next === subTab) return;
    if (!confirmaAbandonul('schimbi fila')) return;
    setCasierDirty(false);
    setSubTab(next);
  }

  // Și capătul din dreapta reîncarcă documentul de casier, deci cere aceeași confirmare:
  // altfel rândurile introduse și nesalvate ar dispărea la o simplă lărgire a intervalului.
  function selectTo(next: string) {
    if (next === to) return;
    if (!confirmaAbandonul('schimbi perioada')) return;
    setCasierDirty(false);
    setTo(next);
  }

  /** Documentul cere trecerea pe ziua de azi ca să poată adăuga: rândul nou intră oricum în
   *  documentul zilei în care e tastat (migr. 507), iar fila se deschide pe ieri — deci fără
   *  asta, ce adaugi n-ar apărea în tabelul la care te uiți. */
  function treciPeZiua(zi: string) {
    setCasierDirty(false);
    setFrom(zi);
    setTo(zi);
  }

  function selectFrom(next: string) {
    if (next === from) return;
    if (!confirmaAbandonul('schimbi perioada')) return;
    setCasierDirty(false);
    setFrom(next);
    if (next > to) setTo(next);
  }

  const isSingleDay = from === to;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await getGraficReport(from, to);
      if (res.error) {
        setError(res.error);
        setRoutes([]); setOrphanInc([]); setOrphanManual([]); setConfirmation(null);
      } else if (res.data) {
        setRoutes(res.data.routes);
        setOrphanInc(res.data.orphan_incasare);
        setOrphanManual(res.data.orphan_manual);
        setConfirmation(res.data.confirmation);
      }
    } finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  async function handleConfirmDay() {
    if (!isSingleDay) return;
    const res = await confirmDay(from, null);
    if (res.error) { setError(res.error); return; }
    await load();
  }
  async function handleUnconfirmDay() {
    if (!isSingleDay) return;
    if (!confirm('Sigur anulezi confirmarea zilei?')) return;
    const res = await unconfirmDay(from);
    if (res.error) { setError(res.error); return; }
    await load();
  }

  // Pentru confirmarea zilei și badge-ul de status: doar orphan-uri din ziua curentă
  const todayOrphanInc = isSingleDay
    ? orphanInc.filter(a => a.ziua === from)
    : [];

  return (
    <div>
      {/* Header + filter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Încasare vs. Numărare</h2>
          <p className="text-muted" style={{ fontSize: 13, margin: '6px 0 0 0' }}>
            Toate rutele din /grafic, cu numărarea și încasarea atașate. Cele neasociate — în vederi separate.
          </p>
        </div>
        {/* «Raport pe rute» își are propria perioadă (implicit luna), ca schimbarea ei să nu
            reîncarce documentul de casier și să nu-i piardă rândurile nesalvate. */}
        <div style={{ display: subTab === 'raport' ? 'none' : 'flex', alignItems: 'center', gap: 8 }}>
          <span className="text-muted" style={{ fontSize: 13 }}>De la</span>
          <input type="date" value={from} onChange={e => selectFrom(e.target.value)} className="form-control" style={{ width: 150 }} />
          <span className="text-muted" style={{ fontSize: 13 }}>până la</span>
          <input type="date" value={to} min={from} onChange={e => selectTo(e.target.value)} className="form-control" style={{ width: 150 }} />
        </div>
      </div>

      {error && subTab !== 'raport' && (
        <div style={{ background: 'var(--danger-dim)', color: 'var(--danger)', padding: '10px 16px', borderRadius: 'var(--radius-xs)', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Bara de status zi — nu pe «Raport pe rute»: acolo perioada e alta, iar «Confirmă ziua»
          ar confirma o zi care nu se vede pe ecran. */}
      {isSingleDay && subTab !== 'raport' && (
        <div className="card" style={{ padding: 12, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {confirmation ? (
              <>
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                  ✓ Confirmat de {confirmation.confirmed_by_name || '—'}
                </span>
                <span className="text-muted" style={{ fontSize: 12 }}>
                  ({new Date(confirmation.confirmed_at).toLocaleString('ro-RO')})
                </span>
                {confirmation.has_new_payments_after && (
                  <span style={{ color: 'var(--warning)', fontSize: 12, fontWeight: 600 }}>
                    ⚠ Au apărut plăți noi după confirmare — re-revizuiește
                  </span>
                )}
              </>
            ) : todayOrphanInc.length > 0 ? (
              <span style={{ color: 'var(--warning)', fontWeight: 600 }}>
                ⚠ {todayOrphanInc.length} încasare nepusă pe această zi
              </span>
            ) : (
              <span className="text-muted">Neconfirmat</span>
            )}
          </div>
          {canEdit && (
            <div style={{ display: 'flex', gap: 8 }}>
              {confirmation ? (
                <button type="button" onClick={handleUnconfirmDay} className="btn btn-sm">Anulează confirmarea</button>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirmDay}
                  className="btn btn-primary btn-sm"
                  disabled={todayOrphanInc.length > 0}
                  title={todayOrphanInc.length > 0 ? `Rezolvă ${todayOrphanInc.length} alerte de încasare pe această zi mai întâi` : ''}
                >
                  Confirmă ziua
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Numerar manual care nu s-a legat de nicio rută: nu intră în totalurile de mai jos,
          deci trebuie spus explicit, altfel banii ar părea pur și simplu inexistenți. */}
      {orphanManual.length > 0 && subTab !== 'raport' && (
        <div style={{
          background: 'var(--warning-dim, #fff3cd)', border: '1px solid #f5c518',
          borderRadius: 'var(--radius-xs)', padding: '10px 14px', marginBottom: 12, fontSize: 13,
        }}>
          <strong>⚠ {orphanManual.length} rând(uri) din «Document casier Numerar» nu s-au legat de nicio rută</strong>
          {' '}({Math.round(orphanManual.reduce((s, o) => s + o.total_lei, 0))} lei) — banii NU sunt în totalurile de mai jos.
          <ul style={{ margin: '6px 0 0 0', paddingLeft: 18 }}>
            {orphanManual.slice(0, 8).map(o => (
              <li key={o.id} style={{ fontSize: 12 }}>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{o.foaie_nr || '(fără nr.)'}</span>
                {' · '}{o.driver_name || '—'}{' · '}{o.route_name || '—'}
                {' · '}<strong>{Math.round(o.total_lei)} lei</strong>
                {' — '}
                {/* Nu «șterge rândul»: pe 10.10 singurul caz viu (foaia 1126627) era complementul
                    plății de la terminal, nu o copie — ștergerea ar fi pierdut bani reali. */}
                {o.reason === 'dublura_terminal'
                  ? `foaia a trecut și prin terminal${o.terminal_pe_foaie_lei != null ? ` (${Math.round(o.terminal_pe_foaie_lei)} lei)` : ''} — compară sumele: poate fi dublură, poate fi rest predat în numerar; nu șterge fără verificare`
                  : o.reason === 'cursa_gresita'
                    ? `rândul e atașat altei curse decât a foii${o.foaie_cursa ? ` (foaia e a cursei ${[o.foaie_cursa.ruta, o.foaie_cursa.sofer].filter(Boolean).join(', ')})` : ''} — reatașează-l`
                    : o.reason === 'cursa_cu_terminal'
                    ? 'cursa a primit deja bani de la terminal — verifică dacă nu e dublură'
                    : o.reason === 'fara_identificare'
                    ? 'rândul n-are nici cursă, nici număr de foaie'
                    : 'cursa nu e în /grafic pentru ziua foii (verifică data foii)'}
              </li>
            ))}
            {orphanManual.length > 8 && (
              <li style={{ fontSize: 12 }}>… și încă {orphanManual.length - 8}</li>
            )}
          </ul>
        </div>
      )}

      {/* Sub-tab switcher */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 4, borderBottom: '1px solid var(--border)', alignItems: 'flex-end' }}>
        <SubTabBtn active={subTab === 'casier'} onClick={() => selectSubTab('casier')}
          label="Document casier" badge={casierCounts.terminal} badgeColor="var(--primary)"
          title="Doar ce se încarcă de pe terminalul Tomberon" />
        <SubTabBtn active={subTab === 'numerar'} onClick={() => selectSubTab('numerar')}
          label="Document casier Numerar" badge={casierCounts.manual} badgeColor="#2a5db0"
          title="Doar foile introduse manual la casă (numerar fără terminal)" />
        <SubTabBtn active={subTab === 'routes'} onClick={() => selectSubTab('routes')}
          label="Pe rute (sumar)" badge={routes.length} badgeColor="var(--text-muted)" />
        <SubTabBtn active={subTab === 'raport'} onClick={() => selectSubTab('raport')}
          label="Raport pe rute"
          title="Încasările fiecărei rute pe o perioadă, după data foii de parcurs, cu export Excel" />
        {subTab !== 'raport' && (
          <span className="text-muted" style={{ fontSize: 11, marginLeft: 'auto', paddingBottom: 8 }}>
            filtru pe perioadă
          </span>
        )}
      </div>

      {/* Content */}
      {subTab === 'raport' && <RaportRuteTab />}

      {loading && subTab !== 'raport' && (
        <p className="text-muted" style={{ textAlign: 'center', padding: 20, fontSize: 13 }}>
          Se încarcă...
        </p>
      )}

      {!loading && subTab === 'routes' && (
        <RoutesTable routes={routes} />
      )}

      {subTab === 'casier' && (
        <CasierDocumentTab
          from={from}
          to={to}
          onTreciPeZiua={treciPeZiua}
          operatorName={operatorName}
          mode="terminal"
          onCounts={handleCasierCounts}
          onDirtyChange={handleCasierDirty}
        />
      )}

      {subTab === 'numerar' && (
        <CasierDocumentTab
          from={from}
          to={to}
          onTreciPeZiua={treciPeZiua}
          operatorName={operatorName}
          mode="numerar"
          onCounts={handleCasierCounts}
          onDirtyChange={handleCasierDirty}
        />
      )}
    </div>
  );
}

function SubTabBtn({
  active, onClick, label, badge, badgeColor, title,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
  badgeColor?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        background: 'transparent',
        border: 'none',
        padding: '8px 14px',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        color: active ? 'var(--text)' : 'var(--text-muted)',
        borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
        marginBottom: -1,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {label}
      {badge !== undefined && <span style={{
        fontSize: 11,
        padding: '1px 7px',
        borderRadius: 10,
        background: badgeColor,
        color: 'white',
        fontWeight: 600,
        minWidth: 18,
        textAlign: 'center',
      }}>{badge}</span>}
    </button>
  );
}
