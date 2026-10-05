'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getCasierDocument,
  saveCasierCorrections,
  getActiveDriversForPicker,
  getActiveVehiclesForPicker,
  getActiveRoutesForPicker,
  type CasierRow,
  type CasierCorrectionInput,
  type CasierManualInput,
  type GraficFoaieCandidate,
  type DriverOption,
  type VehicleOption,
  type RouteOption,
} from './incasareActions';
import GraficFoiPicker from './GraficFoiPicker';
import { normFoaie } from '@/lib/norm-foaie';

// Cheia DB a comentariului (corectabil), folosită și de corrected_fields, și de payload.
const COMMENT_DB_KEY = 'comment';

// Nomenclatoarele nu se schimbă în timpul unei sesiuni de lucru, dar comutarea între cele
// două documente demontează tabelul — fără cache, fiecare click pe filă ar cere din nou
// șoferii, mașinile și rutele. La eroare cache-ul se golește, ca reîncercarea să meargă.
type NomenclatorCache = {
  routes?: Promise<RouteOption[]>;
  drivers?: Promise<DriverOption[]>;
  vehicles?: Promise<VehicleOption[]>;
};
const nomenclatorCache: NomenclatorCache = {};

function loadRoutesOnce(): Promise<RouteOption[]> {
  nomenclatorCache.routes ??= getActiveRoutesForPicker()
    .catch(e => { nomenclatorCache.routes = undefined; throw e; });
  return nomenclatorCache.routes;
}
function loadDriversOnce(): Promise<DriverOption[]> {
  nomenclatorCache.drivers ??= getActiveDriversForPicker()
    .catch(e => { nomenclatorCache.drivers = undefined; throw e; });
  return nomenclatorCache.drivers;
}
function loadVehiclesOnce(): Promise<VehicleOption[]> {
  nomenclatorCache.vehicles ??= getActiveVehiclesForPicker()
    .catch(e => { nomenclatorCache.vehicles = undefined; throw e; });
  return nomenclatorCache.vehicles;
}

/**
 * Documentul de casier are două variante, pe aceleași coloane dar pe surse diferite
 * (migr. 313) — despărțite ca să nu se amestece la introducere:
 *   'terminal' → DOAR plățile venite de pe terminalul Tomberon. Se pot doar CORECTA.
 *   'numerar'  → DOAR foile introduse manual la casă, cu numerarul lor. Se adaugă/șterg.
 */
export type CasierMode = 'terminal' | 'numerar';

interface Props {
  ziua: string;            // ziua selectată (din shapă-le părinte)
  operatorName: string;     // numele utilizatorului logat (pentru antet)
  mode: CasierMode;
  /** Raportează în sus câte rânduri are fiecare document (pentru badge-urile sub-tab-urilor). */
  onCounts?: (counts: { terminal: number; manual: number }) => void;
  /** Raportează în sus dacă sunt modificări nesalvate — părintele blochează schimbarea sub-tab-ului. */
  onDirtyChange?: (dirty: boolean) => void;
}

// Fiecare rând în starea locală (cu modificări)
type EditableRow = {
  row_key: string;
  // Read-only / sursă tomberon
  N: number;
  Ora: string;
  CrmRouteId: number | null;   // pentru route_type din nomenclator (afişare «oră + nume scurt» la interurban)
  DriverId: string | null;     // id-ul șoferului (pre-completat din /grafic la rândurile manuale)
  AssignmentId: string | null; // cursa din /grafic din care a venit rândul (doar la inserare)
  // Editabile (text)
  Ruta: string;
  Sofer: string;
  Masina: string;
  NumarFoaie: string;
  DataFoaie: string;
  PusLa: string;             // timestamptz ISO, read-only — ora plății (sau, fallback, introducerea foii)
  PusLaReal: boolean;        // true = ora vine de la casă; false = fallback (se afișează «—», ora în tooltip)
  // Sume — Tomberon, dar corectabile (cash-ul NU la rândurile de terminal)
  Incasare: number;          // suma_numerar (cash); read-only la terminal, editabil la rândurile manuale
  Ligotnici: number;         // ligotniki0_suma (lei)
  LigotniciGara: number;     // ligotniki_vokzal_suma
  Diagrame: number;          // diagrama
  Combustibil: number;       // dt_suma
  CheltuieliSupl: number;    // dop_rashodi
  Comentariu: string;
  // Stare / persistență
  IsManual: boolean;         // rând adăugat manual (foaie fizică fără tomberon)
  ManualId: string | null;   // id-ul din casier_manual_rows (null = nesalvat încă)
  NormNr: string | null;     // cheia corecției pentru rândurile tomberon
  Corrected: Set<string>;    // cheile DB corectate (pentru colorare per-celulă + salvare)
  __pristine: boolean;
  __hasGrafic: boolean;
};

function rowFromCasier(c: CasierRow): EditableRow {
  return {
    row_key: c.row_key,
    N: 0,                    // se atribuie în renumber(), separat pe fiecare document
    Ora: c.time_nord || '',
    CrmRouteId: c.crm_route_id,
    DriverId: c.driver_id,
    // Proveniența se scrie o singură dată, la inserare; aici o citim doar ca să știm
    // ce curse sunt deja în document și după o reîncărcare.
    AssignmentId: c.assignment_id,
    Ruta: c.route_name || '',
    Sofer: c.driver_name || '',
    Masina: c.vehicle_plate || '',
    NumarFoaie: c.foaie_nr || '',
    DataFoaie: c.data_foaie || '',  // /grafic ziua, NULL dacă foaia nu e în /grafic
    PusLa: c.pus_la || '',
    PusLaReal: !!c.pus_la_real,
    Incasare: Number(c.incasare_numerar) || 0,
    Ligotnici: Number(c.ligotniki0_suma) || 0,
    LigotniciGara: Number(c.ligotniki_vokzal_suma) || 0,
    Diagrame: Number(c.diagrama) || 0,
    Combustibil: Number(c.dt_suma) || 0,
    CheltuieliSupl: Number(c.dop_rashodi) || 0,
    Comentariu: c.comment || '',
    IsManual: c.is_manual,
    ManualId: c.manual_id,
    NormNr: c.norm_nr,
    // Evidențierea corecțiilor persistă: se re-hidratează din corrected_fields întors de DB.
    Corrected: new Set(c.corrected_fields || []),
    __pristine: true,
    __hasGrafic: c.has_grafic_match,
  };
}

// Numerotarea e per document: fiecare tabel începe de la 1, indiferent câte rânduri
// are celălalt (`rows` ține ambele surse, ca să putem detecta dublurile).
function renumber(rows: EditableRow[]): EditableRow[] {
  let t = 0;
  let m = 0;
  return rows.map(r => ({ ...r, N: r.IsManual ? ++m : ++t }));
}

// Ordinea implicită: cronologic după „Ora plății" (pus_la). Din mig. 239, pus_la = ora reală
// a plății la casă; la înregistrările vechi — momentul introducerii foii în /grafic.
// Foile fără pus_la rămân la sfârșit.
function orderRows(data: CasierRow[]): EditableRow[] {
  const pusLaTs = (r: CasierRow) => {
    const t = r.pus_la ? new Date(r.pus_la).getTime() : NaN;
    return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
  };
  const ordered = [...data].sort(
    (a, b) => (pusLaTs(a) - pusLaTs(b)) || (a.foaie_nr || '').localeCompare(b.foaie_nr || ''),
  );
  return renumber(ordered.map(rowFromCasier));
}

function docNumberFromDate(date: string): string {
  const digits = date.replace(/\D/g, '');
  return digits.slice(-6).padStart(6, '0');
}

// Ora plății la casă (la foile vechi: ora introducerii foii), mereu în ora Chișinăului (nu a browserului).
const pusLaFormatter = new Intl.DateTimeFormat('ro-RO', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
  timeZone: 'Europe/Chisinau',
});

function formatPusLa(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return pusLaFormatter.format(d).replace(',', '');
}

// Sumă read-only: gol dacă 0, altfel numărul cu max 2 zecimale.
function fmtSum(n: number): string {
  return n ? String(Math.round(n * 100) / 100) : '';
}

// Totalul se rotunjește ca celulele (2 zecimale), altfel un document de numerar cu bani
// mărunți nu s-ar aduna cu ce se vede pe ecran.
function fmtTotal(n: number): string {
  return String(Math.round(n * 100) / 100);
}

// Prima oră de plecare din nord — time_nord poate fi interval «HH:MM - HH:MM».
function nordDeparture(timeNord: string): string {
  return timeNord.split(' - ')[0]?.trim() || '';
}

// Nume scurt de rută: fără prefixul «Chișinău - » (doar interurbanele îl au).
function shortRouteName(name: string): string {
  return name.replace(/^Chișinău\s*[-–]\s*/i, '').trim();
}

// ─── Sortare pe cap de tabel ───
// 'N' = ordinea de încărcare (cronologic, după „Ora plății"). Celelalte: alfabetic/cronologic.
type SortKey = 'N' | 'Ruta' | 'Sofer' | 'DataFoaie' | 'PusLa';
type SortDir = 'asc' | 'desc';

function isEmptyFor(r: EditableRow, key: SortKey): boolean {
  if (key === 'N') return false;
  if (key === 'PusLa') return !r.PusLa || Number.isNaN(new Date(r.PusLa).getTime());
  return !r[key];
}

function compareCore(a: EditableRow, b: EditableRow, key: SortKey): number {
  if (key === 'N') return a.N - b.N;
  if (key === 'PusLa') return new Date(a.PusLa).getTime() - new Date(b.PusLa).getTime();
  // DataFoaie e ISO (YYYY-MM-DD) → comparația de șir e deja cronologică.
  return key === 'DataFoaie'
    ? a.DataFoaie.localeCompare(b.DataFoaie)
    : a[key].localeCompare(b[key], 'ro');
}

function sortRows(rows: EditableRow[], key: SortKey, dir: SortDir): EditableRow[] {
  return [...rows].sort((a, b) => {
    // Rândurile fără valoare (foaie fără /grafic) rămân la sfârșit în ambele direcții.
    const ea = isEmptyFor(a, key);
    const eb = isEmptyFor(b, key);
    if (ea && eb) return a.N - b.N;
    if (ea) return 1;
    if (eb) return -1;
    const c = compareCore(a, b, key);
    if (c !== 0) return dir === 'asc' ? c : -c;
    return a.N - b.N;  // egalitate → păstrează ordinea inițială
  });
}

export default function CasierDocumentTab({ ziua, operatorName, mode, onCounts, onDirtyChange }: Props) {
  const isNumerar = mode === 'numerar';
  const [docDate, setDocDate] = useState<string>(ziua);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  // Mod „Corectare": câmpurile devin editabile doar când e activ.
  const [editMode, setEditMode] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Id-uri de rânduri manuale SALVATE pe care le-a șters, de trimis la server la Save.
  const deletedManualIds = useRef<Set<string>>(new Set());
  // norm_nr-urile ale căror corecții au fost revocate (revin la valoarea brută din tomberon).
  const revokedCorrections = useRef<Set<string>>(new Set());

  // Sortare + filtru — afectează DOAR afișarea, niciodată datele din `rows`.
  const [sortKey, setSortKey] = useState<SortKey>('N');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [dateFilter, setDateFilter] = useState<string>('');  // '' = toate zilele

  // Contor pentru rândurile adăugate manual: Date.now() singur poate colida la două
  // apăsări în aceeași milisecundă, iar row_key trebuie să fie unic (e ținta editării).
  const manualSeq = useRef(0);

  // Nomenclatoare (încărcate o singură dată) — doar documentul Numerar are ce edita cu ele.
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [routes, setRoutes] = useState<RouteOption[]>([]);

  useEffect(() => {
    const ignore = () => {};
    // Rutele trebuie în ambele documente (route_type, pentru afișarea «oră + nume scurt»).
    loadRoutesOnce().then(setRoutes, ignore);
    // Șoferii și mașinile se folosesc doar la editarea rândurilor manuale: în «Document
    // casier» nu există niciun rând editabil, deci n-are rost să le cerem.
    if (!isNumerar) return;
    loadDriversOnce().then(setDrivers, ignore);
    loadVehiclesOnce().then(setVehicles, ignore);
  }, [isNumerar]);

  // Sincronizare data părinte → data document. Părintele întreabă el înainte de a schimba
  // data când sunt modificări nesalvate (vezi IncasareTab), deci aici doar urmăm.
  useEffect(() => {
    setDocDate(ziua);
  }, [ziua]);

  // Schimbarea datei reîncarcă documentul și aruncă starea locală — aceeași gardă ca la
  // «Anulează», altfel rândurile bifate din picker dispar fără un cuvânt.
  function requestDocDate(next: string) {
    if (next === docDate) return;
    if (hasUnsaved && !confirm('Sunt modificări nesalvate. Schimbi ziua? Modificările se pierd.')) return;
    setDocDate(next);
  }

  // Încarcă rândurile din Tomberon pentru ziua aleasă
  useEffect(() => {
    if (!docDate) return;
    setLoading(true);
    getCasierDocument(docDate)
      .then(data => {
        setRows(orderRows(data));
        setHasUnsaved(false);
        setEditMode(false);
        setDateFilter('');  // altă zi → filtrul vechi ar putea ascunde tot
        deletedManualIds.current.clear();
        revokedCorrections.current.clear();
      })
      .finally(() => setLoading(false));
  }, [docDate]);

  // Rândurile documentului curent. `rows` ține ambele surse — cealaltă sursă e folosită
  // doar la detectarea dublurilor, niciodată afișată aici.
  const modeRows = useMemo(
    () => rows.filter(r => (isNumerar ? r.IsManual : !r.IsManual)),
    [rows, isNumerar],
  );

  // Badge-urile sub-tab-urilor: câte rânduri are fiecare document.
  useEffect(() => {
    if (!onCounts || loading) return;
    onCounts({
      terminal: rows.filter(r => !r.IsManual).length,
      manual: rows.filter(r => r.IsManual).length,
    });
  }, [rows, loading, onCounts]);

  // Părintele trebuie să știe că sunt modificări nesalvate: schimbarea sub-tab-ului
  // demontează tabelul, iar rândurile introduse s-ar pierde fără avertisment.
  useEffect(() => {
    onDirtyChange?.(hasUnsaved);
    return () => onDirtyChange?.(false);
  }, [hasUnsaved, onDirtyChange]);

  // Foile venite de la terminal, normalizate — o foaie introdusă și manual e o dublură.
  const terminalFoi = useMemo(
    () => new Set(rows.filter(r => !r.IsManual && r.NumarFoaie).map(r => normFoaie(r.NumarFoaie))),
    [rows],
  );
  function isDuplicate(r: EditableRow): boolean {
    return isNumerar && !!r.NumarFoaie.trim() && terminalFoi.has(normFoaie(r.NumarFoaie));
  }
  const duplicateCount = useMemo(
    () => modeRows.filter(isDuplicate).length,
    [modeRows, terminalFoi, isNumerar],
  );

  // Foile deja prezente în documentul Numerar (salvate sau nu) — picker-ul le blochează.
  const foiInDocument = useMemo(
    () => new Set(rows.filter(r => r.IsManual && r.NumarFoaie).map(r => normFoaie(r.NumarFoaie))),
    [rows],
  );
  // Cursele alese din picker și încă nesalvate: DB-ul nu le știe, dar nici ele nu se repetă.
  // Acoperă și cursele fără număr de foaie, care n-au ce potrivi în `foiInDocument`.
  const assignmentsInDocument = useMemo(
    () => new Set(rows.filter(r => r.AssignmentId).map(r => r.AssignmentId as string)),
    [rows],
  );

  // Zilele distincte prezente în DataFoaie, pentru filtrul din capul coloanei.
  const dateOptions = useMemo(
    () => Array.from(new Set(modeRows.map(r => r.DataFoaie).filter(Boolean))).sort(),
    [modeRows],
  );

  // Dacă ziua filtrată dispare (rânduri editate/șterse), filtrul ar goli tabelul fără motiv vizibil.
  useEffect(() => {
    if (dateFilter && !dateOptions.includes(dateFilter)) setDateFilter('');
  }, [dateFilter, dateOptions]);

  // Ce se vede pe ecran: filtrat, apoi sortat. `rows` rămâne sursa de adevăr.
  const displayRows = useMemo(() => {
    const filtered = dateFilter ? modeRows.filter(r => r.DataFoaie === dateFilter) : modeRows;
    return sortRows(filtered, sortKey, sortDir);
  }, [modeRows, dateFilter, sortKey, sortDir]);

  // route_type per rută (din nomenclator) — pentru afișarea «oră + nume scurt» la interurban.
  const routeTypeById = useMemo(
    () => new Map(routes.map(rt => [rt.id, rt.route_type])),
    [routes],
  );

  // Nomenclatoarele au ~175 de intrări; fiecare rând manual are trei select-uri. Construite
  // în corpul rândului, s-ar re-crea la fiecare tastă, pe fiecare rând. Construite o dată,
  // aceleași elemente se reutilizează în toate rândurile.
  const routeOptions = useMemo(() => routes.map(rt => {
    const departure = rt.time_nord?.split('-')[0].trim();
    return (
      <option key={rt.id} value={rt.display_name}>
        {departure ? `${departure} · ${rt.display_name}` : rt.display_name}
      </option>
    );
  }), [routes]);
  const driverOptions = useMemo(
    () => drivers.map(d => <option key={d.id} value={d.full_name}>{d.full_name}</option>),
    [drivers],
  );
  const vehicleOptions = useMemo(
    () => vehicles.map(v => <option key={v.id} value={v.plate_number}>{v.plate_number}</option>),
    [vehicles],
  );

  // DOAR interurban: «06:55 Lipcani» (ora pornirii din nord + nume scurt). Restul: numele întreg.
  function rutaDisplay(r: EditableRow): string {
    if (!r.Ruta) return '';
    const isInterurban = r.CrmRouteId != null && routeTypeById.get(r.CrmRouteId) === 'interurban';
    if (!isInterurban) return r.Ruta;
    const ora = nordDeparture(r.Ora);
    const scurt = shortRouteName(r.Ruta);
    return ora ? `${ora} ${scurt}` : scurt;
  }

  const isFiltered = dateFilter !== '';

  // Totalul documentului curent, pe ce e AFIȘAT (cu filtru pus, urmărește ce se vede).
  const totals = useMemo(() => {
    const sum = (k: keyof EditableRow) =>
      displayRows.reduce((s, r) => s + (typeof r[k] === 'number' ? (r[k] as number) : 0), 0);
    return {
      Incasare: sum('Incasare'),
      Ligotnici: sum('Ligotnici'),
      LigotniciGara: sum('LigotniciGara'),
      Diagrame: sum('Diagrame'),
      Combustibil: sum('Combustibil'),
      CheltuieliSupl: sum('CheltuieliSupl'),
    };
  }, [displayRows]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  // Editarea țintește rândul după `row_key`, NU după poziție: cu tabelul sortat sau
  // filtrat, indexul afișat nu mai corespunde cu indexul din `rows`.
  function updateCell<K extends keyof EditableRow>(rowKey: string, key: K, value: EditableRow[K]) {
    setRows(prev => prev.map(r =>
      r.row_key === rowKey ? { ...r, [key]: value, __pristine: false } : r,
    ));
    setHasUnsaved(true);
  }

  // Editarea unui câmp CORECTABIL (sumă/comentariu). Pe rândurile tomberon marchează câmpul
  // ca fiind corectat DOAR dacă valoarea chiar se schimbă (altfel nu persistăm un override egal
  // cu brutul). Pe rândurile manuale doar setează valoarea (toate câmpurile lor se salvează).
  function updateCorrectable<K extends keyof EditableRow>(
    rowKey: string, uiKey: K, dbKey: string, value: EditableRow[K],
  ) {
    // Mutarea ref-ului se face ÎN AFARA updater-ului (updater-ele setState trebuie să fie pure).
    const target = rows.find(r => r.row_key === rowKey);
    const changed = !!target && !target.IsManual && value !== target[uiKey];
    if (changed && target?.NormNr) {
      // Dacă exista o revocare în așteptare pe acest rând, o anulăm — s-a corectat din nou.
      revokedCorrections.current.delete(target.NormNr);
    }
    setRows(prev => prev.map(r => {
      if (r.row_key !== rowKey) return r;
      const Corrected = (!r.IsManual && value !== r[uiKey])
        ? new Set(r.Corrected).add(dbKey)
        : r.Corrected;
      return { ...r, [uiKey]: value, Corrected, __pristine: false };
    }));
    setHasUnsaved(true);
  }

  // Revocă TOATE corecțiile unui rând tomberon: se marchează pentru ștergere pe server, iar la
  // reîncărcare rândul revine la valorile brute din tomberon.
  function revokeCorrections(rowKey: string) {
    const target = rows.find(r => r.row_key === rowKey);
    if (!target || target.IsManual || !target.NormNr) return;
    revokedCorrections.current.add(target.NormNr);
    setRows(prev => prev.map(r =>
      r.row_key === rowKey ? { ...r, Corrected: new Set<string>(), __pristine: false } : r,
    ));
    setHasUnsaved(true);
  }

  // Șablonul unui rând manual gol — de aici pornesc și „+ Adaugă rând", și picker-ul.
  function emptyManualRow(): EditableRow {
    return {
      // Cheia se calculează în afara updater-ului: updater-ele setState trebuie să fie pure
      // (React le poate invoca de două ori în StrictMode).
      row_key: `manual-${Date.now()}-${++manualSeq.current}`,
      N: 0,
      Ora: '',
      CrmRouteId: null,
      DriverId: null,
      AssignmentId: null,
      Ruta: '',
      Sofer: '',
      Masina: '',
      NumarFoaie: '',
      DataFoaie: docDate,
      PusLa: '',
      PusLaReal: false,
      Incasare: 0,
      Ligotnici: 0,
      LigotniciGara: 0,
      Diagrame: 0,
      Combustibil: 0,
      CheltuieliSupl: 0,
      Comentariu: '',
      IsManual: true,
      ManualId: null,      // nesalvat încă
      NormNr: null,
      Corrected: new Set(),
      __pristine: false,
      __hasGrafic: false,
    };
  }

  function addRow() {
    // Rândul nou primește DataFoaie = docDate; cu filtrul pe altă zi ar fi invizibil.
    setDateFilter('');
    setRows(prev => renumber([...prev, emptyManualRow()]));
    setHasUnsaved(true);
  }

  // Rânduri pre-completate din /grafic: rută, șofer, mașină, nr. foaie și data foii vin
  // gata din cursa planificată — casierul completează doar sumele.
  function addRowsFromGrafic(picked: GraficFoaieCandidate[]) {
    if (!picked.length) return;
    setDateFilter('');
    setRows(prev => renumber([
      ...prev,
      ...picked.map(c => ({
        ...emptyManualRow(),
        Ora: c.time_nord || '',
        CrmRouteId: c.crm_route_id,
        DriverId: c.driver_id,
        AssignmentId: c.assignment_id,
        Ruta: c.route_name || '',
        Sofer: c.driver_name || '',
        Masina: c.vehicle_plate || '',
        NumarFoaie: c.foaie_nr || '',
        DataFoaie: c.data_foaie || docDate,
      })),
    ]));
    setHasUnsaved(true);
  }

  function deleteRow(rowKey: string) {
    setRows(prev => {
      const target = prev.find(r => r.row_key === rowKey);
      // Dacă rândul manual era deja salvat, reține id-ul pentru ștergerea pe server.
      if (target?.IsManual && target.ManualId) deletedManualIds.current.add(target.ManualId);
      return renumber(prev.filter(r => r.row_key !== rowKey));
    });
    setHasUnsaved(true);
  }

  function reload() {
    setLoading(true);
    getCasierDocument(docDate).then(data => {
      setRows(orderRows(data));
      setHasUnsaved(false);
      setDateFilter('');
      deletedManualIds.current.clear();
      revokedCorrections.current.clear();
    }).finally(() => setLoading(false));
  }

  function handleClose() {
    if (hasUnsaved && !confirm('Sunt modificări nesalvate. Sigur închizi?')) return;
    setEditMode(false);
    reload();
  }

  async function handleSave() {
    // Fiecare document salvează DOAR ce îi aparține: «Document casier» corecții peste
    // foile din tomberon, «Numerar» rândurile manuale. Așa nu se ating unul pe altul.
    const corrections: CasierCorrectionInput[] = isNumerar ? [] : rows
      .filter(r => !r.IsManual && r.NormNr && r.Corrected.size > 0)
      .map(r => ({
        norm_nr: r.NormNr as string,
        diagrama: r.Corrected.has('diagrama') ? r.Diagrame : null,
        ligotniki0_suma: r.Corrected.has('ligotniki0_suma') ? r.Ligotnici : null,
        ligotniki_vokzal_suma: r.Corrected.has('ligotniki_vokzal_suma') ? r.LigotniciGara : null,
        dt_suma: r.Corrected.has('dt_suma') ? r.Combustibil : null,
        dop_rashodi: r.Corrected.has('dop_rashodi') ? r.CheltuieliSupl : null,
        comment: r.Corrected.has(COMMENT_DB_KEY) ? r.Comentariu : null,
      }));

    // Rânduri manuale: doar cele atinse (sau încă neinserate). Id-urile șofer/rută se iau
    // din nomenclator după nume; dacă rândul a venit pre-completat din /grafic și numele
    // n-a fost schimbat, cad înapoi pe id-urile primite de acolo.
    const manualUpserts: CasierManualInput[] = !isNumerar ? [] : rows
      .filter(r => r.IsManual && (!r.__pristine || !r.ManualId))
      .map(r => ({
        id: r.ManualId,
        // norm_foaie() din DB nu face trim, deci ' 142961' ar trece pe lângă verificarea
        // de dublură. Trim și aici, și pe server.
        foaie_nr: r.NumarFoaie.trim() || null,
        data_foaie: r.DataFoaie || null,
        // Id-ul e ținut la zi de select-uri și vine autoritar din /grafic; potrivirea pe nume
        // e doar plasa de siguranță pentru rândurile vechi, fără id. Invers ar atribui banii
        // altui om la doi șoferi omonimi.
        driver_id: r.DriverId ?? drivers.find(d => d.full_name === r.Sofer)?.id ?? null,
        driver_name: r.Sofer || null,
        crm_route_id: r.CrmRouteId ?? routes.find(rt => rt.display_name === r.Ruta)?.id ?? null,
        route_name: r.Ruta || null,
        vehicle_plate: r.Masina || null,
        assignment_id: r.AssignmentId,
        incasare_numerar: r.Incasare,
        diagrama: r.Diagrame,
        ligotniki0_suma: r.Ligotnici,
        ligotniki_vokzal_suma: r.LigotniciGara,
        dt_suma: r.Combustibil,
        dop_rashodi: r.CheltuieliSupl,
        comment: r.Comentariu || null,
      }));

    // Corecțiile revocate: trimit o intrare cu toate câmpurile null → server-ul o șterge.
    // (Sar peste cele care au primit între timp o corecție nouă, deja incluse mai sus.)
    if (!isNumerar) {
      const alreadySent = new Set(corrections.map(c => c.norm_nr));
      for (const norm_nr of revokedCorrections.current) {
        if (alreadySent.has(norm_nr)) continue;
        corrections.push({
          norm_nr,
          diagrama: null, ligotniki0_suma: null, ligotniki_vokzal_suma: null,
          dt_suma: null, dop_rashodi: null, comment: null,
        });
      }
    }

    const manualDeletes = isNumerar ? [...deletedManualIds.current] : [];

    if (!corrections.length && !manualUpserts.length && !manualDeletes.length) {
      setHasUnsaved(false);
      return;
    }

    setSaving(true);
    const res = await saveCasierCorrections(docDate, { corrections, manualUpserts, manualDeletes });
    setSaving(false);

    if (res.data) {
      // Resincronizează cu adevărul din DB (id-uri/corrected_fields reale) chiar și pe eroare:
      // rândurile manuale deja inserate primesc ManualId → nu se dublează la reîncercare.
      setRows(orderRows(res.data));
      deletedManualIds.current.clear();
      revokedCorrections.current.clear();
      setHasUnsaved(false);  // starea locală = starea DB → nimic „nesalvat"
      if (res.error) {
        alert('Salvarea a întâmpinat o eroare: ' + res.error +
          '\nAm reîncărcat starea din baza de date — verifică și reintrodu ce lipsește.');
      }
      return;
    }

    // Reîncărcarea n-a reușit (rețea): păstrăm editările locale ca să nu se piardă munca.
    // Scrierile s-ar putea să fi mers deja — de aceea rugăm reîncărcarea paginii, nu un simplu retry.
    if (res.error) {
      alert('Conexiune întreruptă la salvare: ' + res.error +
        '\nReîncarcă pagina (Cmd+R) și verifică ce s-a salvat înainte de a reintroduce.');
      return;
    }
    setHasUnsaved(false);
  }

  // Stilurile de bază
  const fontFamily = '"Segoe UI", Tahoma, Arial, sans-serif';
  const cellStyle: React.CSSProperties = {
    border: '1px solid #ccc',
    padding: '0 4px',      // rânduri puțin mai joase (mai multe încap pe ecran)
    fontSize: 11,
    lineHeight: 1.35,
    fontFamily,
    background: '#fff',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };
  const headerCellStyle: React.CSSProperties = {
    ...cellStyle,
    background: '#e8e8e8',
    fontWeight: 600,
    textAlign: 'center',
  };
  // Header pe care se poate da click: coloana activă e evidențiată, săgeata arată direcția.
  const sortableTh = (width: string, key: SortKey): React.CSSProperties => ({
    ...headerCellStyle,
    width,
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'normal',
    overflow: 'visible',
    background: sortKey === key ? '#d6e4f0' : '#e8e8e8',
  });
  const sortArrow = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');
  const numCellStyle: React.CSSProperties = {
    ...cellStyle, textAlign: 'right', fontFamily: 'var(--font-mono)',
  };
  const editInputStyle: React.CSSProperties = {
    width: '100%', border: 'none', outline: 'none', background: 'transparent',
    fontSize: 11, fontFamily, padding: 0,
  };
  const editNumStyle: React.CSSProperties = {
    ...editInputStyle, textAlign: 'right', fontFamily: 'var(--font-mono)',
  };

  // Culoarea de accent a documentului: bordo = terminal, albastru = numerar (ca rândurile manuale).
  const accent = isNumerar ? '#2a5db0' : '#9B1B30';

  return (
    <div style={{ fontFamily }}>
      <style>{`
        .casier-date-input::-webkit-calendar-picker-indicator {
          display: none;
          -webkit-appearance: none;
        }
        .casier-date-input { appearance: none; -webkit-appearance: none; }
      `}</style>
      {/* Antet */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto auto',
        gap: 16,
        alignItems: 'center',
        marginBottom: 12,
        padding: '10px 14px',
        background: isNumerar ? '#eef4ff' : '#f5f5f5',
        border: '1px solid #ddd',
        borderLeft: `4px solid ${accent}`,
        borderRadius: 4,
      }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
          {isNumerar ? 'Document de casier NUMERAR №' : 'Document de casier №'}{' '}
          <span style={{ fontFamily: 'var(--font-mono)', color: accent }}>
            {docNumberFromDate(docDate)}
          </span>
        </h3>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          Data:
          <input
            type="date"
            value={docDate}
            onChange={e => requestDocDate(e.target.value)}
            style={{ fontSize: 12, fontFamily }}
          />
        </label>
        <span style={{ fontSize: 12 }}>
          Operator: <strong>{operatorName}</strong>
        </span>
        <span style={{ fontSize: 11, color: hasUnsaved ? '#f57c00' : '#888' }}>
          {hasUnsaved ? '● modificat' : (isNumerar ? '○ salvat' : '○ sincronizat cu Tomberon')}
        </span>
      </div>

      {/* Tabel */}
      <div style={{
        border: '1px solid #ccc',
      }}>
        <table style={{
          borderCollapse: 'collapse',
          fontSize: 11,
          fontFamily,
          width: '100%',
          tableLayout: 'fixed',
        }}>
          <thead>
            <tr>
              <th style={sortableTh('2%', 'N')} onClick={() => toggleSort('N')}
                title="Click: revino la ordinea inițială (cronologic, după Ora plății)">
                N{sortArrow('N')}
              </th>
              <th style={sortableTh('9%', 'PusLa')} onClick={() => toggleSort('PusLa')}
                title={isNumerar
                  ? 'Momentul în care rândul a fost introdus la casă (ora Chișinăului).'
                  : 'Ora reală a plății la casa automată (ultima plată a foii, ora Chișinăului). La foile vechi, fără oră de la casă, se arată «—» — ora introducerii foii în sistem e în tooltip-ul celulei.'}>
                {isNumerar ? 'Introdus la' : 'Ora plății'}{sortArrow('PusLa')}
              </th>
              <th style={sortableTh('13%', 'Ruta')} onClick={() => toggleSort('Ruta')}
                title="Click: sortează alfabetic după rută">
                Ruta{sortArrow('Ruta')}
              </th>
              <th style={sortableTh('10%', 'Sofer')} onClick={() => toggleSort('Sofer')}
                title="Click: sortează alfabetic după șofer">
                Șoferi{sortArrow('Sofer')}
              </th>
              <th style={{ ...headerCellStyle, width: '6%' }}>Mașina</th>
              <th style={{ ...headerCellStyle, width: '7%' }}>NumărFoaie</th>
              <th style={sortableTh('10%', 'DataFoaie')} onClick={() => toggleSort('DataFoaie')}
                title="Click: sortează cronologic după data foii">
                <div>DataFoaie{sortArrow('DataFoaie')}</div>
                <select
                  value={dateFilter}
                  onClick={e => e.stopPropagation()}
                  onChange={e => { e.stopPropagation(); setDateFilter(e.target.value); }}
                  title="Arată doar o anumită zi"
                  style={{
                    width: '100%', fontSize: 10, fontFamily, marginTop: 2,
                    border: '1px solid #bbb', borderRadius: 2, padding: '0 1px',
                    background: isFiltered ? '#fff3cd' : '#fff',
                    fontWeight: isFiltered ? 600 : 400,
                  }}
                >
                  <option value="">toate zilele</option>
                  {dateOptions.map(d => (
                    <option key={d} value={d}>{d.split('-').reverse().join('.')}</option>
                  ))}
                </select>
              </th>
              <th style={{ ...headerCellStyle, width: '6%' }}>Încasare</th>
              <th style={{ ...headerCellStyle, width: '5%' }}>Ligotnici</th>
              <th style={{ ...headerCellStyle, width: '5%' }}>Lig. gară</th>
              <th style={{ ...headerCellStyle, width: '6%' }}>Diagrame</th>
              <th style={{ ...headerCellStyle, width: '6%' }}>Combust.</th>
              <th style={{ ...headerCellStyle, width: '5%' }}>Ch. supl.</th>
              <th style={{ ...headerCellStyle, width: '8%' }}>Comentariu</th>
              <th style={{ ...headerCellStyle, width: '2%' }}></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={15} style={{ ...cellStyle, textAlign: 'center', padding: 20, color: '#888' }}>
                  {isNumerar ? 'Se încarcă…' : 'Se încarcă din Tomberon...'}
                </td>
              </tr>
            )}
            {!loading && displayRows.map(r => {
              const dup = isDuplicate(r);
              // Fără cursă din /grafic ȘI fără număr de foaie, rândul n-are cum să ajungă pe o
              // rută — banii ar rămâne doar în documentul de casier. Se vede înainte de salvare.
              const neidentificat = isNumerar && !r.AssignmentId && !r.NumarFoaie.trim();
              // Albastru = rând manual (foaie fizică). Roșu = tomberon fără /grafic. Alb = normal.
              const rowBg = r.IsManual ? '#e6f0ff' : (!r.__hasGrafic ? '#fdecea' : '#fff');
              const cs = (overrides: React.CSSProperties = {}): React.CSSProperties => ({
                ...cellStyle, background: rowBg, ...overrides,
              });
              const ns = (overrides: React.CSSProperties = {}): React.CSSProperties => ({
                ...numCellStyle, background: rowBg, ...overrides,
              });
              // Celulă corectată: galben + accent, peste orice fundal de rând. Persistă din corrected_fields.
              const corr = (dbKey: string, base: React.CSSProperties): React.CSSProperties =>
                r.Corrected.has(dbKey)
                  ? { ...base, background: '#fffbe6', fontWeight: 600, borderLeft: '2px solid #f5c518' }
                  : base;
              const pusLaText = formatPusLa(r.PusLa);
              // Rută/șofer/mașină/nr/dată se editează DOAR pe rândurile manuale (foile tomberon
              // vin din /grafic; sumele lor se corectează, restul nu se schimbă de aici).
              const canEditRowFields = editMode && r.IsManual;
              // Celulă de sumă: input în mod Corectare, altfel text; marchează corecția.
              const sumCell = (dbKey: string, uiKey: 'Ligotnici' | 'LigotniciGara' | 'Diagrame' | 'Combustibil' | 'CheltuieliSupl', step?: number) => (
                <td style={corr(dbKey, ns())}>
                  {editMode ? (
                    <input type="number" min={0} step={step} style={editNumStyle} value={r[uiKey] || ''}
                      onChange={e => updateCorrectable(r.row_key, uiKey, dbKey, Number(e.target.value) || 0)} />
                  ) : fmtSum(r[uiKey])}
                </td>
              );
              return (
                <tr key={r.row_key}>
                  <td style={cs({ textAlign: 'center', color: '#888' })}>{r.N}</td>
                  <td style={cs({ textAlign: 'center', color: (r.PusLaReal || r.IsManual) ? '#555' : '#bbb' })}
                    title={r.PusLaReal && pusLaText
                      ? `Plătită la casă la ${pusLaText} (ora Chișinăului)`
                      : r.IsManual
                        ? (pusLaText ? `Introdus la casă la ${pusLaText} (ora Chișinăului)` : 'Rând nou, încă nesalvat')
                        : pusLaText
                          ? `Ora plății va apărea automat când casa trimite ora. Foaia a fost introdusă în /grafic la ${pusLaText} (ora Chișinăului).`
                          : 'Foaia nu are corespondent în /grafic'}>
                    {r.PusLaReal ? pusLaText : (r.IsManual ? (pusLaText || '—') : '—')}
                  </td>
                  <td style={cs()}>
                    {canEditRowFields ? (
                      <select
                        value={r.Ruta}
                        onChange={e => {
                          const picked = routes.find(rt => rt.display_name === e.target.value);
                          const value = e.target.value;
                          setRows(prev => prev.map(row => row.row_key === r.row_key
                            ? {
                                ...row,
                                Ruta: value,
                                CrmRouteId: picked?.id ?? null,
                                Ora: !row.Ora && picked?.time_nord ? picked.time_nord : row.Ora,
                                __pristine: false,
                              }
                            : row));
                          setHasUnsaved(true);
                        }}
                        style={editInputStyle}
                      >
                        <option value="">— alege rută —</option>
                        {r.Ruta && !routes.some(rt => rt.display_name === r.Ruta) && (
                          <option value={r.Ruta}>{r.Ruta} (custom)</option>
                        )}
                        {routeOptions}
                      </select>
                    ) : (
                      <span title={r.Ruta || undefined}>{rutaDisplay(r) || '—'}</span>
                    )}
                  </td>
                  <td style={cs()}>
                    {canEditRowFields ? (
                      <select
                        value={r.Sofer}
                        onChange={e => {
                          const value = e.target.value;
                          const picked = drivers.find(d => d.full_name === value);
                          setRows(prev => prev.map(row => row.row_key === r.row_key
                            ? { ...row, Sofer: value, DriverId: picked?.id ?? null, __pristine: false }
                            : row));
                          setHasUnsaved(true);
                        }}
                        style={editInputStyle}
                      >
                        <option value="">— alege șofer —</option>
                        {r.Sofer && !drivers.some(d => d.full_name === r.Sofer) && (
                          <option value={r.Sofer}>{r.Sofer}</option>
                        )}
                        {driverOptions}
                      </select>
                    ) : (r.Sofer || '—')}
                  </td>
                  <td style={cs({ fontFamily: 'var(--font-mono)' })}>
                    {canEditRowFields ? (
                      <select
                        value={r.Masina}
                        onChange={e => updateCell(r.row_key, 'Masina', e.target.value)}
                        style={{ ...editInputStyle, fontFamily: 'var(--font-mono)' }}
                      >
                        <option value="">—</option>
                        {r.Masina && !vehicles.some(v => v.plate_number === r.Masina) && (
                          <option value={r.Masina}>{r.Masina} (custom)</option>
                        )}
                        {vehicleOptions}
                      </select>
                    ) : (r.Masina || '—')}
                  </td>
                  <td style={cs({
                    fontFamily: 'var(--font-mono)',
                    ...(dup ? { background: '#ffe0e0', color: '#c00', fontWeight: 600 }
                      : neidentificat ? { background: '#fff3cd' } : null),
                  })}
                    title={dup
                      ? 'Atenție: foaia asta a venit deja de pe terminal, în «Document casier». Verifică să nu o numeri de două ori.'
                      : neidentificat
                        ? 'Scrie numărul foii (sau alege cursa cu «+ Din /grafic»), altfel banii nu ajung pe nicio rută.'
                        : ''}>
                    {canEditRowFields ? (
                      <input maxLength={18}
                        style={{ ...editInputStyle, fontFamily: 'var(--font-mono)', color: 'inherit', fontWeight: 'inherit' }}
                        value={r.NumarFoaie}
                        onChange={e => updateCell(r.row_key, 'NumarFoaie', e.target.value)} />
                    ) : (dup ? `⚠ ${r.NumarFoaie}` : (r.NumarFoaie || (neidentificat ? '⚠ fără nr.' : '—')))}
                  </td>
                  <td style={cs({
                    color: r.DataFoaie && r.DataFoaie !== docDate ? '#f57c00' : 'inherit',
                    fontWeight: r.DataFoaie && r.DataFoaie !== docDate ? 600 : 400,
                  })}
                    title={r.DataFoaie && r.DataFoaie !== docDate
                      ? `Foaia e pe ${r.DataFoaie}, plata pe ${docDate}` : ''}>
                    {canEditRowFields ? (
                      <input
                        type="date"
                        className="casier-date-input"
                        style={{ ...editInputStyle, color: 'inherit', fontWeight: 'inherit' }}
                        value={r.DataFoaie}
                        onChange={e => updateCell(r.row_key, 'DataFoaie', e.target.value)}
                      />
                    ) : (r.DataFoaie ? r.DataFoaie.split('-').reverse().join('.') : '—')}
                  </td>
                  {/* Cash: brut și necorectabil la terminal; introdus de mână în documentul Numerar. */}
                  <td style={ns()}>
                    {canEditRowFields ? (
                      <input type="number" min={0} step={0.01} style={editNumStyle} value={r.Incasare || ''}
                        onChange={e => updateCell(r.row_key, 'Incasare', Number(e.target.value) || 0)} />
                    ) : (r.IsManual ? fmtSum(r.Incasare) : Math.round(r.Incasare))}
                  </td>
                  {sumCell('ligotniki0_suma', 'Ligotnici')}
                  {sumCell('ligotniki_vokzal_suma', 'LigotniciGara')}
                  {sumCell('diagrama', 'Diagrame', 0.01)}
                  {sumCell('dt_suma', 'Combustibil', 0.01)}
                  {sumCell('dop_rashodi', 'CheltuieliSupl', 0.01)}
                  <td style={corr(COMMENT_DB_KEY, cs())}>
                    {editMode ? (
                      <input style={editInputStyle} value={r.Comentariu}
                        onChange={e => updateCorrectable(r.row_key, 'Comentariu', COMMENT_DB_KEY, e.target.value)} />
                    ) : r.Comentariu}
                  </td>
                  <td style={cs({ textAlign: 'center' })}>
                    {editMode && r.IsManual && (
                      <button type="button" onClick={() => deleteRow(r.row_key)} title="Șterge rândul"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c00', fontSize: 14 }}>×</button>
                    )}
                    {editMode && !r.IsManual && r.Corrected.size > 0 && (
                      <button type="button" onClick={() => revokeCorrections(r.row_key)}
                        title="Anulează corecțiile (revine la valorile din tomberon)"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c07a00', fontSize: 13 }}>↺</button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!loading && displayRows.length === 0 && (
              <tr>
                <td colSpan={15} style={{ ...cellStyle, textAlign: 'center', padding: 20, color: '#888' }}>
                  {isFiltered
                    ? 'Niciun rând pentru ziua aleasă în filtru. Alege „toate zilele" în capul coloanei DataFoaie.'
                    : isNumerar
                      ? 'Niciun rând introdus manual pentru această zi. Apasă „✎ Corectare" și apoi „+ Din /grafic".'
                      : 'Nicio plată în Tomberon pentru această zi.'}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            {(() => {
              const numTd = (v: number | string) => (
                <td style={{ ...headerCellStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{v}</td>
              );
              const label = isNumerar
                ? (isFiltered ? 'Total numerar (ziua filtrată)' : 'Total numerar')
                : (isFiltered ? 'Total tomberon (ziua filtrată)' : 'Total tomberon');
              return (
                <tr>
                  <td colSpan={7} style={{
                    ...headerCellStyle, textAlign: 'right',
                    background: isNumerar ? '#e6f0ff' : '#e8e8e8',
                  }}>
                    {label}
                  </td>
                  {numTd(fmtTotal(totals.Incasare))}
                  {numTd(fmtTotal(totals.Ligotnici))}
                  {numTd(fmtTotal(totals.LigotniciGara))}
                  {numTd(fmtTotal(totals.Diagrame))}
                  {numTd(fmtTotal(totals.Combustibil))}
                  {numTd(fmtTotal(totals.CheltuieliSupl))}
                  <td colSpan={2} style={{
                    ...headerCellStyle,
                    background: isNumerar ? '#e6f0ff' : '#e8e8e8',
                  }}></td>
                </tr>
              );
            })()}
          </tfoot>
        </table>
      </div>

      {/* Subsol: butoane */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 12, padding: '8px 0',
        gap: 8,
      }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {isNumerar && editMode && (
            <>
              <button type="button" onClick={() => setPickerOpen(true)} className="btn btn-sm btn-primary" style={{ fontFamily }}
                title="Alege din /grafic cursele pentru care nu s-a întors foaia">
                + Din /grafic
              </button>
              <button type="button" onClick={addRow} className="btn btn-sm" style={{ fontFamily }}
                title="Rând gol, pentru o foaie care nu e deloc în /grafic">
                + Adaugă rând
              </button>
            </>
          )}
          <span style={{ fontSize: 11, color: '#888' }}>
            {isNumerar
              ? <>{modeRows.length} rânduri introduse manual</>
              : <>{modeRows.length} plăți din Tomberon</>}
            {isFiltered && (
              <> · <span style={{ color: '#f57c00', fontWeight: 600 }}>{displayRows.length} afișate (filtru pe {dateFilter.split('-').reverse().join('.')})</span></>
            )}
            {!isNumerar && modeRows.some(r => !r.__hasGrafic) && (
              <> · <span style={{ color: '#c00' }}>{modeRows.filter(r => !r.__hasGrafic).length} fără /grafic</span></>
            )}
            {isNumerar && duplicateCount > 0 && (
              <> · <span style={{ color: '#c00', fontWeight: 600 }}>⚠ {duplicateCount} foi venite deja de pe terminal</span></>
            )}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!editMode ? (
            <button type="button" onClick={() => setEditMode(true)} className="btn btn-primary" style={{ fontFamily }}>
              ✎ Corectare
            </button>
          ) : (
            <>
              <button type="button" onClick={handleClose} className="btn" style={{ fontFamily }}>Anulează</button>
              <button type="button" onClick={handleSave} className="btn btn-primary" style={{ fontFamily }}
                disabled={!hasUnsaved || saving}
                title={saving ? 'Se salvează…' : (!hasUnsaved ? 'Nimic de salvat' : 'Salvează')}>
                {saving ? 'Se salvează…' : 'OK (salvează)'}
              </button>
            </>
          )}
        </div>
      </div>

      {pickerOpen && (
        <GraficFoiPicker
          ziua={docDate}
          foiInDocument={foiInDocument}
          assignmentsInDocument={assignmentsInDocument}
          onClose={() => setPickerOpen(false)}
          onAdd={addRowsFromGrafic}
        />
      )}

      <p className="text-muted" style={{ fontSize: 11, marginTop: 8, fontFamily }}>
        {isNumerar ? (
          <>
            ⓘ Aici intră DOAR foile introduse manual la casă — banii primiți fără terminalul Tomberon.
            Apasă <b>✎ Corectare</b>, apoi <b>+ Din /grafic</b> ca să alegi cursele pentru care nu s-a
            întors foaia (rută, șofer, mașină, nr. foaie și data foii vin gata completate) — sau
            caută direct după numărul foii. <b>+ Adaugă rând</b> e pentru foile care nu-s deloc în /grafic.
            Un număr de foaie marcat cu <span style={{ background: '#ffe0e0', color: '#c00', padding: '0 4px', fontWeight: 600 }}>⚠ roșu</span>{' '}
            a venit între timp și de pe terminal — verifică să nu fie numărat de două ori.
          </>
        ) : (
          <>
            ⓘ Aici intră DOAR ce se încarcă de pe terminalul Tomberon; șofer/rută/mașină se trag din /grafic.
            Apasă <b>✎ Corectare</b> ca să modifici sumele unei foi. Foile primite manual la casă se
            introduc în documentul <b>Numerar</b>.
            Celulele <span style={{ background: '#fffbe6', borderLeft: '2px solid #f5c518', padding: '0 4px', fontWeight: 600 }}>galbene</span> = corectate manual;
            rândurile <span style={{ background: '#fdecea', padding: '0 4px' }}>roșii</span> = tomberon fără /grafic.
          </>
        )}
        {' '}Click pe <b>Ruta</b>, <b>Șoferi</b>, <b>DataFoaie</b> sortează (al doilea click inversează);
        click pe <b>N</b> revine la ordinea inițială.
      </p>
    </div>
  );
}
