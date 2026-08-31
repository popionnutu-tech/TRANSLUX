'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type { KanbanColumn } from '@/lib/lde/camioane';
import { avanseazaCursa, type CartonasCamion, type Rezultat } from './dispecerat-actions';
import type { PinCamion } from '@/components/FleetMap';
import { normalizeazaPlaca } from '@/lib/lde/parc';

// Leaflet atinge `window` la import — doar pe client.
const FleetMap = dynamic(() => import('@/components/FleetMap'), {
  ssr: false,
  loading: () => <div className="card text-muted">Se încarcă harta…</div>,
});

const COLOANE: { cheie: KanbanColumn; titlu: string; culoare: string }[] = [
  { cheie: 'in_cursa', titlu: 'În cursă', culoare: '#2563eb' },
  { cheie: 'liber', titlu: 'Liber', culoare: '#16a34a' },
  { cheie: 'reparatie', titlu: 'Reparație', culoare: '#dc2626' },
  { cheie: 'odihna', titlu: 'Odihnă', culoare: '#a855f7' },
  { cheie: 'fara_sofer', titlu: 'Fără șofer, dar merge', culoare: '#f59e0b' },
];

const ora = (iso: string) =>
  new Date(iso).toLocaleString('ro-MD', { timeZone: 'Europe/Chisinau', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const ETICHETE_STARE: Record<string, string> = {
  planificata: 'planificată',
  spre_incarcare: 'în drum spre încărcare',
  la_incarcare: 'la încărcare',
  spre_descarcare: 'în drum spre descărcare',
  la_descarcare: 'la descărcare',
  incheiata: 'încheiată',
};

type Pozitie = { plate: string; lat: number; lng: number; speed: number; at: string };

export default function DispeceratClient({ cartonase, azi }: { cartonase: CartonasCamion[]; azi: string }) {
  const router = useRouter();
  const [inCurs, pornesteTranzitia] = useTransition();
  const [mesaj, setMesaj] = useState('');
  const [eroare, setEroare] = useState('');
  const [pozitii, setPozitii] = useState<Pozitie[]>([]);
  const [gpsMesaj, setGpsMesaj] = useState('');
  const primaIncarcare = useRef(true);

  const incarcaPozitii = useCallback(async () => {
    try {
      const r = await fetch('/api/lde/camioane/pozitii', { cache: 'no-store' });
      const j = await r.json();
      setPozitii(j.positions ?? []);
      setGpsMesaj(r.ok ? '' : (j.error ?? 'GPS indisponibil'));
    } catch {
      setGpsMesaj('GPS indisponibil');
    }
  }, []);

  useEffect(() => {
    if (primaIncarcare.current) { primaIncarcare.current = false; void incarcaPozitii(); }
    // Refresh doar cât fila e vizibilă: fără polling de fundal (decizia din spec).
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void incarcaPozitii();
    }, 60_000);
    return () => clearInterval(t);
  }, [incarcaPozitii]);

  function ruleaza(actiune: () => Promise<Rezultat>) {
    setMesaj(''); setEroare('');
    pornesteTranzitia(async () => {
      const r = await actiune();
      if ('error' in r) { setEroare(r.error); return; }
      setMesaj(r.mesaj); router.refresh();
    });
  }

  const peColoane = useMemo(() => {
    const m = new Map<KanbanColumn, CartonasCamion[]>();
    for (const c of COLOANE) m.set(c.cheie, []);
    for (const k of cartonase) m.get(k.coloana)?.push(k);
    return m;
  }, [cartonase]);

  const pins = useMemo<PinCamion[]>(() => {
    const dupaPlaca = new Map(cartonase.map((c) => [normalizeazaPlaca(c.plate), c]));
    const culori = new Map(COLOANE.map((c) => [c.cheie, c.culoare]));
    return pozitii.flatMap((p) => {
      const cheie = normalizeazaPlaca(p.plate);
      const c = dupaPlaca.get(cheie);
      if (!c) return [];
      return [{
        plate: c.plate,
        lat: p.lat, lng: p.lng, speed: p.speed, at: p.at,
        culoare: culori.get(c.coloana) ?? '#6b7280',
        eticheta: c.cursa ? `${c.cursa.de ?? '?'} → ${c.cursa.la ?? '?'}` : COLOANE.find((x) => x.cheie === c.coloana)?.titlu ?? '',
      }];
    });
  }, [pozitii, cartonase]);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Dispecerat camioane</h1>
        <p className="text-muted">
          Starea de azi ({azi}). Stările cursei se mută manual, pas cu pas.
          Pozițiile de pe hartă se reîmprospătează la un minut cât ține fila deschisă.
        </p>
      </div>

      {mesaj && <div className="card" style={{ borderLeft: '3px solid var(--success)' }}>{mesaj}</div>}
      {eroare && <div className="card" style={{ borderLeft: '3px solid var(--danger)' }}>{eroare}</div>}
      {gpsMesaj && <div className="card" style={{ borderLeft: '3px solid var(--warning)' }}>Harta: {gpsMesaj}</div>}

      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLOANE.length}, minmax(190px, 1fr))`, gap: 10, overflowX: 'auto' }}>
          {COLOANE.map((col) => {
            const lista = peColoane.get(col.cheie) ?? [];
            return (
              <div key={col.cheie}>
                <div style={{ borderTop: `3px solid ${col.culoare}`, paddingTop: 6, marginBottom: 8 }}>
                  <strong>{col.titlu}</strong> <span className="text-muted">({lista.length})</span>
                </div>
                {lista.map((k) => (
                  <div key={k.vehicleId} className="card" style={{ padding: 10, marginBottom: 8 }}>
                    <div className="flex justify-between items-center">
                      <strong>{k.plate}</strong>
                      <span className="badge">{k.fleetType === 'cisterna' ? 'cisternă' : k.fleetType === 'zernovoz' ? 'zernovoz' : 'tip?'}</span>
                    </div>
                    <div className="text-muted" style={{ fontSize: 12 }}>{k.driverName ?? 'fără șofer'}</div>

                    {k.cursa && (
                      <div style={{ marginTop: 6, fontSize: 12 }}>
                        <div>{k.cursa.de ?? '?'} → {k.cursa.la ?? '?'}</div>
                        <div className="text-muted">{k.cursa.cargo ?? '—'}{k.cursa.client ? ` · ${k.cursa.client}` : ''}</div>
                        <div className="text-muted">desc. {ora(k.cursa.unloadPlannedAt)}</div>
                        <div style={{ marginTop: 4 }} className="flex gap-2">
                          <span className="badge">{ETICHETE_STARE[k.cursa.status] ?? k.cursa.status}</span>
                          {k.cursa.intarziata && (
                            <span className="badge" style={{ background: '#fee2e2', color: '#991b1b' }}>
                              întârziată
                            </span>
                          )}
                          {k.stareMotiv !== null && <span className="badge badge-absent">stare de zi pusă</span>}
                        </div>
                        {k.cursa.urmatoareaStare && (
                          <button
                            className="btn-outline"
                            style={{ marginTop: 6, fontSize: 11, padding: '3px 8px' }}
                            disabled={inCurs}
                            onClick={() => ruleaza(() => avanseazaCursa(k.cursa!.id, k.cursa!.urmatoareaStare as string))}
                          >
                            → {ETICHETE_STARE[k.cursa.urmatoareaStare] ?? k.cursa.urmatoareaStare}
                          </button>
                        )}
                      </div>
                    )}

                    {k.coloana === 'fara_sofer' && (
                      <div style={{ marginTop: 6, fontSize: 12 }}>
                        A mers {Math.round(k.kmIeri)} km ieri fără șofer atribuit — cere atribuirea în Parc.
                      </div>
                    )}

                    {!k.cursa && k.urmatoarea && (
                      <div className="text-muted" style={{ marginTop: 6, fontSize: 12 }}>
                        Următoarea: {k.urmatoarea.de ?? '?'} → {k.urmatoarea.la ?? '?'}, {ora(k.urmatoarea.loadPlannedAt)}
                      </div>
                    )}
                    {k.stareMotiv && <div className="text-muted" style={{ marginTop: 6, fontSize: 12 }}>{k.stareMotiv}</div>}
                  </div>
                ))}
                {lista.length === 0 && <div className="text-muted" style={{ fontSize: 12 }}>—</div>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h3>Harta flotei ({pins.length} camioane cu poziție)</h3>
        <FleetMap pins={pins} />
      </div>
    </div>
  );
}
