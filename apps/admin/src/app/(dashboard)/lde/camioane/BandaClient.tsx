'use client';

// Banda de timp — singurul ecran al dispecerului de camioane.
// Ion, 01.09: «у этих трёх должна остаться только одна банда», kanbanul și grila
// s-au contopit aici. Regulile lui, toate verificate în cod:
//  · camionul fără șofer nu are rând (dar cursa lui nu se ascunde niciodată);
//  · «+» deschide o PERIOADĂ: cursă, reparație sau odihnă — nu bifează o zi;
//  · pe bară se vede ce duce și între ce puncte;
//  · unde e camionul acum, după GPS, stă în bandă;
//  · harta e jos, sub bandă.

import { Fragment, memo, useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  anuleazaCursa, mutaCursa, salveazaCursa, schimbaStareaCursei, seteazaStarePerioada,
  seteazaTipCamion, stergeStarePerioada, stergeStareZi,
  type Camion, type Cursa, type PunctScurt, type Rezultat, type SoferScurt, type StareZi,
} from './planificare/actions';
import {
  aIntarziat, camioaneInBanda, esteInCursa, grupeazaPeTip, mutaPastrandDurata,
  poateFiMutata, progresCursa, segmentInFereastra, undeEste, asazaInBenzi,
} from '@/lib/lde/banda';
import { camioaneMaiAproape, urmatoareaStare } from '@/lib/lde/camioane';
import { chisinauDayOf, chisinauInstantIso, chisinauTimeOf, chisinauTodayIso } from '@/lib/chisinau-time';
import type { PinCamion } from '@/components/FleetMap';

// Leaflet atinge `window` la import — harta se încarcă doar în browser.
const FleetMap = dynamic(() => import('@/components/FleetMap'), {
  ssr: false,
  loading: () => <div className="text-muted" style={{ padding: 16 }}>Se încarcă harta…</div>,
});

type Props = {
  from: string;
  zile: string[];
  camioane: Camion[];
  curse: Cursa[];
  stari: StareZi[];
  puncte: PunctScurt[];
  soferi: SoferScurt[];
  taiat: boolean;
};

type Pozitie = { plate: string; lat: number; lng: number; at: string; speed?: number };

const CULOARE: Record<string, string> = {
  diesel: 'linear-gradient(135deg,#3271f0,#1c48c9)',
  biodiesel: 'linear-gradient(135deg,#12a6b6,#0a7f92)',
  cereale: 'linear-gradient(135deg,#d9a441,#b07c14)',
  alta: 'linear-gradient(135deg,#6b7280,#4b5563)',
};

type FelForm = 'cursa' | 'reparatie' | 'odihna';

const formGol = {
  fel: 'cursa' as FelForm,
  id: undefined as string | undefined,
  vehicleId: '',
  driverId: '',
  cargo: 'diesel',
  client: '',
  loadPointId: '',
  loadDate: '',
  loadTime: '07:00',
  unloadPointId: '',
  unloadDate: '',
  unloadTime: '14:00',
  notes: '',
  motiv: '',
};

/** Aceeași normalizare ca pe server, ca joinul pe plăcuță să țină. */
const placaCurata = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, '');

export default function BandaClient({ zile, camioane, curse, stari, puncte, soferi, taiat }: Props) {
  const router = useRouter();
  const [inCurs, pornesteTranzitia] = useTransition();
  const [mesaj, setMesaj] = useState('');
  const [eroare, setEroare] = useState('');
  const [form, setForm] = useState<typeof formGol | null>(null);
  const [filtru, setFiltru] = useState<'toate' | 'in_cursa' | 'liber' | 'stare'>('toate');
  const [pozitii, setPozitii] = useState<Pozitie[]>([]);
  const [gpsRupt, setGpsRupt] = useState(false);
  const [detaliu, setDetaliu] = useState<Cursa | null>(null);
  const [tras, setTras] = useState<string | null>(null);
  const [motivAnulare, setMotivAnulare] = useState('');

  useEffect(() => {
    let viu = true;
    async function ia() {
      if (document.visibilityState !== 'visible') return;
      try {
        const r = await fetch('/api/lde/camioane/pozitii', { cache: 'no-store' });
        const j = await r.json();
        if (!viu) return;
        if (!r.ok) { setGpsRupt(true); return; }
        setGpsRupt(false);
        setPozitii(Array.isArray(j.positions) ? j.positions : []);
      } catch { if (viu) setGpsRupt(true); }
    }
    ia();
    const t = setInterval(ia, 60_000);
    return () => { viu = false; clearInterval(t); };
  }, []);

  const pozitieDupaPlaca = useMemo(() => {
    const m = new Map<string, Pozitie>();
    for (const p of pozitii) m.set(placaCurata(p.plate), p);
    return m;
  }, [pozitii]);

  const curseVii = useMemo(() => curse.filter((c) => c.status !== 'anulata'), [curse]);

  // Camionul fără șofer iese din bandă, DAR cursa lui nu dispare niciodată:
  // constrângerea din bază o vede în continuare, iar dispecerul ar primi
  // «camionul are deja o cursă» pentru o bară invizibilă.
  const randuri = useMemo(
    () => camioaneInBanda(camioane, curseVii.map((c) => ({ vehicleId: c.vehicleId }))),
    [camioane, curseVii],
  );

  const numarStari = useMemo(() => {
    // «În cursă» se citește din STARE, nu din ceas: o cursă planificată nu
    // înseamnă camion plecat, iar una întârziată nu înseamnă camion liber.
    const cuCursa = new Set(curseVii.filter((c) => esteInCursa(c.status)).map((c) => c.vehicleId));
    const cuStare = new Set(stari.map((s) => s.vehicleId));
    // Categoriile se exclud: cursa bate starea, altfel suma depășea totalul.
    return {
      toate: randuri.length,
      in_cursa: randuri.filter((c) => cuCursa.has(c.id)).length,
      liber: randuri.filter((c) => !cuCursa.has(c.id) && !cuStare.has(c.id)).length,
      stare: randuri.filter((c) => !cuCursa.has(c.id) && cuStare.has(c.id)).length,
      faraSofer: camioane.length - randuri.length,
      cuCursa,
      cuStare,
    };
  }, [randuri, curseVii, stari, camioane.length]);

  const vizibile = useMemo(() => {
    if (filtru === 'toate') return randuri;
    if (filtru === 'in_cursa') return randuri.filter((c) => numarStari.cuCursa.has(c.id));
    if (filtru === 'stare') return randuri.filter((c) => !numarStari.cuCursa.has(c.id) && numarStari.cuStare.has(c.id));
    return randuri.filter((c) => !numarStari.cuCursa.has(c.id) && !numarStari.cuStare.has(c.id));
  }, [filtru, randuri, numarStari]);

  const grupe = useMemo(() => grupeazaPeTip(vizibile), [vizibile]);

  const curseDupaCamion = useMemo(() => {
    const m = new Map<string, Cursa[]>();
    for (const c of curseVii) {
      const l = m.get(c.vehicleId);
      if (l) l.push(c); else m.set(c.vehicleId, [c]);
    }
    return m;
  }, [curseVii]);

  const stariDupaCheie = useMemo(() => {
    const m = new Map<string, StareZi>();
    for (const s of stari) m.set(`${s.vehicleId}|${s.date}`, s);
    return m;
  }, [stari]);

  // Lista pentru `undeEste` se construiește o dată, nu la fiecare rând al benzii.
  const puncteScurte = useMemo(
    () => puncte.map((p) => ({ name: p.name, lat: p.lat, lng: p.lng })),
    [puncte],
  );

  const pins: PinCamion[] = useMemo(() => {
    const alFlotei = new Map(randuri.map((c) => [placaCurata(c.plate), c]));
    return pozitii
      .filter((p) => alFlotei.has(placaCurata(p.plate)))
      .map((p) => {
        const cam = alFlotei.get(placaCurata(p.plate))!;
        const inCursa = numarStari.cuCursa.has(cam.id);
        const inStare = numarStari.cuStare.has(cam.id);
        return {
          plate: cam.plate,
          lat: p.lat,
          lng: p.lng,
          speed: p.speed ?? 0,
          at: p.at,
          culoare: inCursa ? '#1c48c9' : inStare ? '#c9700a' : '#15803d',
          eticheta: `${cam.plate} · ${cam.driverName ?? 'fără titular'} · ${inCursa ? 'în cursă' : inStare ? 'reparație / odihnă' : 'liber'}`,
        };
      });
  }, [pozitii, randuri, numarStari]);

  // Handlerele sunt memoizate ca să nu rupă `React.memo(Grup)`: fără ele, fiecare
  // literă tastată în formular re-randa toate cele ~3600 de celule ale benzii
  // (review performanță, 01.09).
  const ruleaza = useCallback((actiune: () => Promise<Rezultat>, dupaSucces?: () => void) => {
    setMesaj(''); setEroare('');
    pornesteTranzitia(async () => {
      const r = await actiune();
      if ('error' in r) { setEroare(r.error); return; }
      setMesaj(r.mesaj);
      dupaSucces?.();
      router.refresh();
    });
  }, [router]);

  const lasaBara = useCallback((cursaId: string, vehicleIdNou: string, ziNoua: string) => {
    const c = curseVii.find((x) => x.id === cursaId);
    if (!c) return;
    const nou = mutaPastrandDurata(c.loadPlannedAt, c.unloadPlannedAt, ziNoua);
    if (!nou) { setEroare('Datele cursei nu pot fi citite'); return; }
    if (nou.load === c.loadPlannedAt && vehicleIdNou === c.vehicleId) return;
    ruleaza(() => mutaCursa({
      id: cursaId, vehicleId: vehicleIdNou, loadPlannedAt: nou.load, unloadPlannedAt: nou.unload,
    }));
  }, [curseVii, ruleaza]);

  const deschideFormular = useCallback((vehicleId: string, ziStart: string) => {
    const idx = zile.indexOf(ziStart);
    const sfarsit = zile[Math.min(zile.length - 1, idx + 2)] ?? ziStart;
    const cam = camioane.find((c) => c.id === vehicleId);
    setForm({
      ...formGol,
      vehicleId,
      driverId: cam?.driverId ?? '',
      loadDate: ziStart,
      unloadDate: sfarsit,
      // Punctele NU se preumplu: o pereche pusă din oficiu trece de verificare
      // fără ca dispecerul să fi ales ceva (audit business, 01.09).
    });
    setDetaliu(null);
    setEroare('');
  }, [zile, camioane]);

  function editeaza(c: Cursa) {
    setForm({
      ...formGol,
      fel: 'cursa',
      id: c.id,
      vehicleId: c.vehicleId,
      driverId: c.driverId ?? '',
      cargo: c.cargo ?? 'diesel',
      client: c.client ?? '',
      loadPointId: c.loadPointId ?? '',
      // Ziua ȘI ora se citesc amândouă în ora Chișinăului. Ziua din `slice(0,10)`
      // e ziua UTC: o încărcare la 00:30 local sărea o zi înapoi la resalvare.
      loadDate: chisinauDayOf(c.loadPlannedAt),
      loadTime: chisinauTimeOf(c.loadPlannedAt),
      unloadPointId: c.unloadPointId ?? '',
      unloadDate: chisinauDayOf(c.unloadPlannedAt),
      unloadTime: chisinauTimeOf(c.unloadPlannedAt),
      notes: c.notes ?? '',
    });
    setDetaliu(null);
  }

  function salveaza() {
    if (!form) return;
    if (!form.loadDate || !form.unloadDate) { setEroare('Pune perioada: de la ce dată până la ce dată'); return; }
    if (form.unloadDate < form.loadDate) { setEroare('Ultima zi nu poate fi înaintea primei'); return; }

    if (form.fel !== 'cursa') {
      ruleaza(
        () => seteazaStarePerioada({
          vehicleId: form.vehicleId, de: form.loadDate, pana: form.unloadDate,
          state: form.fel === 'reparatie' ? 'reparatie' : 'odihna',
          reason: form.motiv || null,
        }),
        () => setForm(null),
      );
      return;
    }

    if (!form.loadPointId || !form.unloadPointId) { setEroare('Alege punctul de încărcare și cel de descărcare'); return; }
    ruleaza(
      () => salveazaCursa({
        id: form.id || undefined,
        vehicleId: form.vehicleId,
        driverId: form.driverId || null,
        cargo: form.cargo || null,
        client: form.client || null,
        loadPointId: form.loadPointId,
        // Ora e a Chișinăului, nu a browserului: un dispecer din altă țară ar fi
        // salvat cursa cu ore deplasate.
        loadPlannedAt: chisinauInstantIso(form.loadDate, form.loadTime),
        unloadPointId: form.unloadPointId,
        unloadPlannedAt: chisinauInstantIso(form.unloadDate, form.unloadTime),
        notes: form.notes || null,
      }),
      () => setForm(null),
    );
  }

  /**
   * Avertismentul PREVENTIV: există un camion liber mai aproape de punctul de
   * încărcare decât cel ales. Ion a cerut și judecata de a doua zi, dar n-a cerut
   * scoaterea celui de dinainte — mai bine îl oprim înainte să plece decât să-i
   * raportăm dimineața (audit business, 01.09).
   */
  const maiAproape = useMemo(() => {
    if (!form || form.fel !== 'cursa' || !form.loadPointId) return [];
    const punct = puncte.find((p) => p.id === form.loadPointId);
    if (!punct || punct.lat === null || punct.lng === null) return [];
    const pozitia = (vehicleId: string) => {
      const cam = camioane.find((c) => c.id === vehicleId);
      const p = cam ? pozitieDupaPlaca.get(placaCurata(cam.plate)) : undefined;
      return p ? { lat: p.lat, lng: p.lng } : null;
    };
    const alesPoz = pozitia(form.vehicleId);
    if (!alesPoz) return [];

    // Doar camioanele care chiar pot lua cursa: în bandă, libere în ziua aceea,
    // de același tip. Un camion în reparație «mai aproape» n-ar fi un sfat.
    const ocupate = new Set([
      ...curseVii
        .filter((c) => segmentInFereastra(c.loadPlannedAt, c.unloadPlannedAt, [form.loadDate]) !== null)
        .map((c) => c.vehicleId),
      ...stari.filter((s) => s.date === form.loadDate).map((s) => s.vehicleId),
    ]);
    const tipAles = camioane.find((c) => c.id === form.vehicleId)?.fleetType ?? null;

    const candidate = randuri
      .filter((c) => c.id !== form.vehicleId && !ocupate.has(c.id))
      .filter((c) => !tipAles || !c.fleetType || c.fleetType === tipAles)
      .map((c) => {
        const p = pozitia(c.id);
        return p ? { vehicleId: c.id, plate: c.plate, lat: p.lat, lng: p.lng } : null;
      })
      .filter((x): x is { vehicleId: string; plate: string; lat: number; lng: number } => x !== null);

    return camioaneMaiAproape(
      { lat: punct.lat, lng: punct.lng },
      { vehicleId: form.vehicleId, ...alesPoz },
      candidate,
    );
  }, [form, puncte, camioane, pozitieDupaPlaca, curseVii, stari, randuri]);

  const numePunct = useCallback((id: string | null) => puncte.find((p) => p.id === id)?.name ?? '—', [puncte]);
  const azi = chisinauTodayIso();
  const ziScurta = (z: string) => {
    const d = new Date(`${z}T12:00:00Z`);
    return {
      zi: z.slice(8),
      dow: d.toLocaleDateString('ro-MD', { weekday: 'short' }),
      weekend: [0, 6].includes(d.getUTCDay()),
    };
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Banda flotei</h1>
        <p className="text-muted">
          Rândul e camionul, coloanele sunt zilele. Trage bara pe altă zi sau pe alt camion ca s-o
          muți — durata rămâne. Apeși «+» pe o zi liberă și pui, pe o perioadă, o cursă, o reparație
          sau odihnă. Camionul fără șofer nu apare aici: el nu lucrează.
        </p>
      </div>

      {mesaj && <div className="card" style={{ borderLeft: '3px solid var(--success)' }}>{mesaj}</div>}
      {eroare && <div className="card" style={{ borderLeft: '3px solid var(--danger)' }}>{eroare}</div>}
      {taiat && (
        <div className="card" style={{ borderLeft: '3px solid var(--danger)' }}>
          Fereastra e prea largă: s-a atins plafonul de 1000 de curse și ultimele zile lipsesc din
          bandă. Micșorează perioada.
        </div>
      )}
      {gpsRupt && (
        <div className="card" style={{ borderLeft: '3px solid var(--warning)' }}>
          GPS indisponibil — banda funcționează, dar nu se vede unde sunt camioanele.
        </div>
      )}

      <div className="card">
        <div className="flex gap-2" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          {([
            ['toate', 'toate', numarStari.toate],
            ['in_cursa', 'în cursă', numarStari.in_cursa],
            ['liber', 'libere', numarStari.liber],
            ['stare', 'reparație / odihnă', numarStari.stare],
          ] as const).map(([cheie, eticheta, n]) => (
            <button
              key={cheie}
              className={filtru === cheie ? 'btn-primary' : 'btn-outline'}
              onClick={() => setFiltru(cheie)}
            >
              {n} {eticheta}
            </button>
          ))}
          {numarStari.faraSofer > 0 && (
            <span className="text-muted" style={{ fontSize: 12 }}>
              + {numarStari.faraSofer} fără șofer, în afara benzii — le dai un șofer în fila Flotă
            </span>
          )}
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="pivot-table" style={{ minWidth: 260 + zile.length * 110 }}>
          <thead>
            <tr>
              <th style={{ minWidth: 250 }}>Camion</th>
              {zile.map((z) => {
                const s = ziScurta(z);
                return (
                  <th
                    key={z}
                    style={{
                      minWidth: 104, textAlign: 'center',
                      background: z === azi ? 'var(--primary)' : s.weekend ? 'var(--bg-muted)' : undefined,
                      color: z === azi ? '#fff' : undefined,
                    }}
                  >
                    <div style={{ fontSize: 10, opacity: .8 }}>{s.dow}</div>
                    <div>{s.zi}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {grupe.map((g) => (
              <Grup
                key={g.cheie}
                nume={g.nume}
                nrColoane={zile.length + 1}
                camioane={g.camioane}
                zile={zile}
                azi={azi}
                curseDupaCamion={curseDupaCamion}
                stariDupaCheie={stariDupaCheie}
                puncte={puncteScurte}
                pozitieDupaPlaca={pozitieDupaPlaca}
                inCurs={inCurs}
                tras={tras}
                setTras={setTras}
                lasaBara={lasaBara}
                deschideFormular={deschideFormular}
                setDetaliu={setDetaliu}
                numePunct={numePunct}
                ruleaza={ruleaza}
              />
            ))}
            {grupe.length === 0 && (
              <tr>
                <td colSpan={zile.length + 1} className="pivot-empty">
                  Niciun camion în bandă. Dacă lista e goală de tot, niciun camion n-are șofer —
                  atribuie-i unul în fila Flotă.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detaliu && (
        <div className="card">
          <h3>{numePunct(detaliu.loadPointId)} → {numePunct(detaliu.unloadPointId)}</h3>
          <div className="grid-3">
            <div><span className="text-muted">Marfă:</span> {detaliu.cargo ?? '—'}</div>
            <div><span className="text-muted">Client:</span> {detaliu.client ?? '—'}</div>
            <div><span className="text-muted">Stare:</span> {detaliu.status}</div>
            <div>
              <span className="text-muted">Încărcare:</span>{' '}
              {new Date(detaliu.loadPlannedAt).toLocaleString('ro-MD', { timeZone: 'Europe/Chisinau' })}
            </div>
            <div>
              <span className="text-muted">Descărcare:</span>{' '}
              {new Date(detaliu.unloadPlannedAt).toLocaleString('ro-MD', { timeZone: 'Europe/Chisinau' })}
            </div>
            <div><span className="text-muted">Notă:</span> {detaliu.notes ?? '—'}</div>
          </div>
          {!poateFiMutata(detaliu.status) && (
            <p className="text-muted" style={{ marginTop: 8 }}>
              Cursa a pornit, deci nu se mai mută pe altă zi sau pe alt camion: din fereastra ei se
              calculează kilometrii și punctualitatea. Dacă s-a schimbat planul, anuleaz-o cu motiv
              și pune alta.
            </p>
          )}
          <div className="flex gap-2" style={{ marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn-outline" disabled={inCurs} onClick={() => editeaza(detaliu)}>Editează</button>
            {urmatoareaStare(detaliu.status) && (
              <button
                className="btn-primary"
                disabled={inCurs}
                onClick={() => ruleaza(
                  () => schimbaStareaCursei(detaliu.id, urmatoareaStare(detaliu.status) as string),
                  () => setDetaliu(null),
                )}
              >
                Treci în «{urmatoareaStare(detaliu.status)}»
              </button>
            )}
          </div>
          <div className="flex gap-2" style={{ marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              value={motivAnulare}
              onChange={(e) => setMotivAnulare(e.target.value)}
              placeholder="Motivul anulării"
              style={{ minWidth: 220 }}
            />
            <button
              className="btn-danger"
              disabled={inCurs || !motivAnulare.trim()}
              onClick={() => ruleaza(
                () => anuleazaCursa(detaliu.id, motivAnulare),
                () => { setDetaliu(null); setMotivAnulare(''); },
              )}
            >
              Anulează cursa
            </button>
            <button className="btn-outline" disabled={inCurs} onClick={() => setDetaliu(null)}>Închide</button>
          </div>
        </div>
      )}

      {form && (
        <div className="card">
          <h3>{form.id ? 'Editează cursa' : 'Ce pui pe camion'}</h3>
          {!form.id && (
            <div className="flex gap-2" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
              {([['cursa', 'Cursă'], ['reparatie', 'Reparație'], ['odihna', 'Odihnă']] as const).map(([k, e]) => (
                <button
                  key={k}
                  className={form.fel === k ? 'btn-primary' : 'btn-outline'}
                  onClick={() => setForm({ ...form, fel: k })}
                  disabled={inCurs}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
          <p className="text-muted">
            {form.fel === 'cursa'
              ? 'Cursa se dă pe perioadă: de la ziua încărcării până la ziua descărcării. Pe bandă apare o singură bară peste toate zilele.'
              : 'Perioada se marchează dintr-o dată: toate zilele din interval primesc starea, nu trebuie bifată fiecare.'}
          </p>

          <div className="grid-3">
            <div className="form-group">
              <label>Camion</label>
              <select value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}>
                {randuri.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.plate}{c.fleetType ? ` · ${c.fleetType}` : ''}{c.driverName ? ` · ${c.driverName}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>De la data</label>
              <input type="date" value={form.loadDate} onChange={(e) => setForm({ ...form, loadDate: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Până la data</label>
              <input type="date" value={form.unloadDate} onChange={(e) => setForm({ ...form, unloadDate: e.target.value })} />
            </div>

            {form.fel === 'cursa' ? (
              <>
                <div className="form-group">
                  <label>Șofer</label>
                  <select value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })}>
                    <option value="">— fără șofer pe cursă —</option>
                    {soferi.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Marfă</label>
                  <select value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })}>
                    <option value="diesel">diesel</option>
                    <option value="biodiesel">biodiesel</option>
                    <option value="cereale">cereale</option>
                    <option value="alta">alta</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Client</label>
                  <input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} placeholder="ex. stații TLX" />
                </div>
                <div className="form-group">
                  <label>De unde</label>
                  <select value={form.loadPointId} onChange={(e) => setForm({ ...form, loadPointId: e.target.value })}>
                    <option value="">— alege —</option>
                    {puncte.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Ora încărcării</label>
                  <input type="time" value={form.loadTime} onChange={(e) => setForm({ ...form, loadTime: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Încotro</label>
                  <select value={form.unloadPointId} onChange={(e) => setForm({ ...form, unloadPointId: e.target.value })}>
                    <option value="">— alege —</option>
                    {puncte.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Ora descărcării</label>
                  <input type="time" value={form.unloadTime} onChange={(e) => setForm({ ...form, unloadTime: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Notă</label>
                  <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </>
            ) : (
              <div className="form-group">
                <label>Motiv</label>
                <input
                  value={form.motiv}
                  onChange={(e) => setForm({ ...form, motiv: e.target.value })}
                  placeholder={form.fel === 'reparatie' ? 'ex. cutie de viteze' : 'ex. concediu'}
                />
              </div>
            )}
          </div>

          {maiAproape.length > 0 && (
            <div className="card" style={{ borderLeft: '3px solid var(--warning)', marginTop: 12 }}>
              <strong>Există un camion liber mai aproape de încărcare</strong>
              <ul style={{ margin: '6px 0 0 18px' }}>
                {maiAproape.map((c) => (
                  <li key={c.vehicleId}>
                    <button
                      className="btn-outline"
                      style={{ padding: '1px 8px', fontSize: 12, marginRight: 8 }}
                      disabled={inCurs}
                      onClick={() => setForm({ ...form, vehicleId: c.vehicleId })}
                    >
                      pune {c.plate}
                    </button>
                    {c.km} km până la punct, cu {c.economieKm} km mai puțin
                  </li>
                ))}
              </ul>
              <p className="text-muted" style={{ marginTop: 6, fontSize: 12 }}>
                Distanța e în linie dreaptă, după ultima poziție GPS. Dacă ai un motiv —
                șoferul, întoarcerea, marfa — ignoră sfatul și salvează.
              </p>
            </div>
          )}

          <div className="flex gap-2" style={{ marginTop: 12 }}>
            <button className="btn-primary" onClick={salveaza} disabled={inCurs}>
              {form.id ? 'Salvează' : form.fel === 'cursa' ? 'Pune cursa în bandă' : 'Marchează perioada'}
            </button>
            <button className="btn-outline" onClick={() => setForm(null)} disabled={inCurs}>Renunță</button>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Harta flotei</h3>
        <p className="text-muted">
          Doar camioanele din bandă, cu poziția din ultimele 24 de ore. Albastru = în cursă,
          verde = liber, portocaliu = reparație sau odihnă.
        </p>
        {pins.length > 0
          ? <FleetMap pins={pins} />
          : <div className="text-muted">Nicio poziție recentă de arătat.</div>}
      </div>

      <div className="card">
        <div className="flex gap-2 text-muted" style={{ fontSize: 12, flexWrap: 'wrap' }}>
          {Object.entries(CULOARE).map(([k, v]) => (
            <span key={k}>
              <i style={{ display: 'inline-block', width: 20, height: 8, borderRadius: 3, background: v, marginRight: 6 }} />
              {k}
            </span>
          ))}
          <span>· dunga albă de pe bară = cât a trecut din intervalul PLANIFICAT, nu măsurătoare GPS</span>
        </div>
      </div>
    </div>
  );
}

/** Un grup de camioane (cisterne / zernovoz / fără tip) cu rândurile lui. */
const Grup = memo(function Grup(props: {
  nume: string;
  nrColoane: number;
  camioane: Camion[];
  zile: string[];
  azi: string;
  curseDupaCamion: Map<string, Cursa[]>;
  stariDupaCheie: Map<string, StareZi>;
  puncte: { name: string; lat: number | null; lng: number | null }[];
  pozitieDupaPlaca: Map<string, Pozitie>;
  inCurs: boolean;
  tras: string | null;
  setTras: (v: string | null) => void;
  lasaBara: (cursaId: string, vehicleId: string, zi: string) => void;
  deschideFormular: (vehicleId: string, zi: string) => void;
  setDetaliu: (c: Cursa | null) => void;
  numePunct: (id: string | null) => string;
  ruleaza: (a: () => Promise<Rezultat>, d?: () => void) => void;
}) {
  const {
    nume, nrColoane, camioane, zile, azi, curseDupaCamion, stariDupaCheie, puncte,
    pozitieDupaPlaca, inCurs, tras, setTras, lasaBara, deschideFormular, setDetaliu, numePunct, ruleaza,
  } = props;
  const acum = Date.now();

  return (
    <>
      <tr>
        <td colSpan={nrColoane} style={{ background: 'var(--bg-muted)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>
          <strong>{nume}</strong> <span className="text-muted">· {camioane.length}</span>
        </td>
      </tr>
      {camioane.map((cam) => {
        const curseCam = curseDupaCamion.get(cam.id) ?? [];
        const poz = pozitieDupaPlaca.get(placaCurata(cam.plate));

        const segmente = curseCam
          .map((c) => ({ c, seg: segmentInFereastra(c.loadPlannedAt, c.unloadPlannedAt, zile) }))
          .filter((x): x is { c: Cursa; seg: NonNullable<typeof x.seg> } => x.seg !== null);

        // Barele se așază pe benzi care nu se ating. Rândul zilelor rămâne
        // separat, deci starea de zi și butonul «+» sunt mereu accesibile —
        // înainte dispăreau sub bară și reparația nu se mai putea scoate.
        const benzi = asazaInBenzi(segmente);
        const inaltimeRand = 1 + benzi.length;

        return (
          <Fragment key={cam.id}>
            <tr>
              <td rowSpan={inaltimeRand} style={{ verticalAlign: 'top' }}>
                <strong>{cam.plate}</strong>
                <div className="text-muted" style={{ fontSize: 11 }}>
                  {cam.driverName ?? 'șofer doar pe cursă'}
                </div>
                <div className="text-muted" style={{ fontSize: 10.5 }}>
                  {poz ? `acum: ${undeEste(poz, puncte)}` : 'fără poziție GPS recentă'}
                </div>
                <select
                  value={cam.fleetType ?? ''}
                  disabled={inCurs}
                  style={{ fontSize: 11, padding: '1px 2px', marginTop: 2 }}
                  onChange={(e) => {
                    const v = e.target.value as 'cisterna' | 'zernovoz' | '';
                    if (!v) return;
                    ruleaza(() => seteazaTipCamion(cam.id, v));
                  }}
                >
                  <option value="">tip?</option>
                  <option value="cisterna">cisternă</option>
                  <option value="zernovoz">zernovoz</option>
                </select>
              </td>
              {zile.map((z) => {
                const stare = stariDupaCheie.get(`${cam.id}|${z}`);
                return (
                  <td
                    key={z}
                    onDragOver={(e) => { if (tras) e.preventDefault(); }}
                    onDrop={() => { if (tras) { lasaBara(tras, cam.id, z); setTras(null); } }}
                    style={{
                      textAlign: 'center', padding: 3,
                      background: stare
                        ? 'repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6 6px,#e5e7eb 6px,#e5e7eb 12px)'
                        : z === azi ? 'var(--bg-muted)' : undefined,
                    }}
                  >
                    {stare ? (
                      <button
                        className="badge"
                        disabled={inCurs}
                        title={`${stare.reason ?? ''} — click ca s-o scoți`}
                        style={{ border: 0, cursor: 'pointer' }}
                        onClick={() => {
                          // Marcată pe perioadă, se scoate tot pe perioadă: altfel
                          // 92 de zile s-ar scoate cu 92 de clicuri. Începutul se
                          // caută înapoi — un click în MIJLOC ar fi lăsat primele
                          // zile pe loc (review arhitectură, 01.09).
                          const pana = stare.expectedEnd;
                          let de = z;
                          if (pana) {
                            for (let k = zile.indexOf(z) - 1; k >= 0; k--) {
                              const ant = stariDupaCheie.get(`${cam.id}|${zile[k]}`);
                              if (!ant || ant.expectedEnd !== pana || ant.state !== stare.state) break;
                              de = zile[k];
                            }
                          }
                          if (pana && (pana > z || de < z) && window.confirm(
                            `Scoți toată perioada ${de} → ${pana}? Anulează = doar ziua ${z}.`,
                          )) {
                            ruleaza(() => stergeStarePerioada(cam.id, de, pana));
                            return;
                          }
                          ruleaza(() => stergeStareZi(cam.id, z));
                        }}
                      >
                        {stare.state === 'reparatie' ? 'reparație' : 'odihnă'}
                      </button>
                    ) : (
                      <button
                        className="btn-outline"
                        disabled={inCurs}
                        title={`Cursă, reparație sau odihnă pentru ${cam.plate} din ${z}`}
                        style={{ padding: '2px 9px', fontSize: 12, opacity: .55 }}
                        onClick={() => deschideFormular(cam.id, z)}
                      >
                        +
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>

            {benzi.map((banda, idxBanda) => {
              const celule: React.ReactNode[] = [];
              let i = 0;
              while (i < zile.length) {
                const aici = banda.find((x) => x.seg.start === i);
                if (aici) {
                  const { c, seg } = aici;
                  const marfa = (c.cargo ?? 'alta').toLowerCase();
                  const prog = progresCursa(c.loadPlannedAt, c.unloadPlannedAt, acum);
                  const intarziat = aIntarziat(c.unloadPlannedAt, c.status, acum);
                  const mutabila = poateFiMutata(c.status);
                  celule.push(
                    <td key={`c-${i}`} colSpan={seg.span} style={{ padding: '0 3px 3px', verticalAlign: 'top' }}>
                      <div
                        draggable={mutabila && !inCurs}
                        onDragStart={() => setTras(c.id)}
                        onDragEnd={() => setTras(null)}
                        onClick={() => setDetaliu(c)}
                        title={mutabila ? 'Trage ca s-o muți · click pentru detalii' : 'Cursa a pornit — nu se mai mută'}
                        style={{
                          position: 'relative', borderRadius: 8, padding: '5px 9px', color: '#fff',
                          cursor: mutabila ? 'grab' : 'pointer',
                          background: Object.hasOwn(CULOARE, marfa) ? CULOARE[marfa] : CULOARE.alta, overflow: 'hidden',
                          borderLeft: seg.taiatStanga ? '3px dashed rgba(255,255,255,.75)' : undefined,
                          borderRight: seg.taiatDreapta ? '3px dashed rgba(255,255,255,.75)' : undefined,
                          opacity: tras === c.id ? .4 : 1,
                        }}
                      >
                        <div style={{ fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {numePunct(c.loadPointId)} → {numePunct(c.unloadPointId)}
                        </div>
                        <div style={{ fontSize: 10.5, opacity: .9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {c.cargo ?? 'fără marfă'} · {c.status}{intarziat ? ' · ÎNTÂRZIAT' : ''}
                        </div>
                        {prog > 0 && prog < 1 && (
                          <span style={{
                            position: 'absolute', left: 0, bottom: 0, height: 3,
                            width: `${Math.round(prog * 100)}%`, background: 'rgba(255,255,255,.9)',
                          }} />
                        )}
                      </div>
                    </td>,
                  );
                  i += seg.span;
                  continue;
                }
                // Golul dintre bare primește și el drop: altfel tragerea peste un
                // rând de bare nu făcea nimic, tăcut.
                const zGol = zile[i];
                celule.push(
                  <td
                    key={`g-${i}`}
                    style={{ padding: 0 }}
                    onDragOver={(e) => { if (tras) e.preventDefault(); }}
                    onDrop={() => { if (tras) { lasaBara(tras, cam.id, zGol); setTras(null); } }}
                  />,
                );
                i += 1;
              }
              return <tr key={`b-${idxBanda}`}>{celule}</tr>;
            })}
          </Fragment>
        );
      })}
    </>
  );
});
