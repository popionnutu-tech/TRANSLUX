'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { AtribuiriAdminData, Alerta } from './actions';

export default function AtribuiriZilniceClient(
  { data, ghid }: { data: AtribuiriAdminData; ghid: { zi: string; alerte: Alerta[] } },
) {
  const totalGhid = Math.round(ghid.alerte.reduce((t, a) => t + a.economie_km_zi, 0));
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onDateChange(value: string) {
    if (!value) return;
    startTransition(() => router.push(`/lde/atribuiri-zilnice?date=${value}`));
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Ghid zilnic</h1>
        <p className="text-sm text-muted-foreground">
          Unde s-au ars ieri km goi degeaba, măsurat din GPS, și cum stă graficul fiecărei direcții.
        </p>
      </div>

      {/* ── ghidul zilnic: unde s-au ars km goi degeaba ──
          Ion, 18.09: «am nevoie de ghid care să aducă zilnic aminte la operator zona unde
          economia ar fi semnificativă și noi nu o facem». Cifrele sunt km PARCURȘI ieri,
          din urma GPS — nu o prognoză. Graficul se repetă, deci risipa de ieri e și a zilei
          de azi, dacă nimeni n-o atinge. */}
      {ghid.alerte.length > 0 && (
        <Card style={{ marginBottom: '1rem', borderColor: '#f59e0b', borderWidth: 2 }}>
          <CardHeader>
            <CardTitle>De verificat în graficul zilei de {ghid.zi} — până la {totalGhid} km</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground" style={{ marginBottom: '0.75rem' }}>
              Fiecare rând e o cursă măsurată din GPS. Cifra e ce s-ar putea tăia <em>dacă</em>
              drumul a fost într-adevăr gol — GPS-ul vede mașina, nu oamenii din ea, iar urcarea
              dintr-un sat ține 30 de secunde și nu se vede întotdeauna. Unde scrie «verifică»,
              întreabă omul înainte să schimbi ceva. Nicio propunere nu taie curse și nu scoate
              sate: uzina plătește serviciul, deci km-ii tăiați rămân la noi.
            </p>
            <table className="w-full text-sm">
              <thead><tr className="text-left border-b">
                <th className="py-1">Cât</th><th>Ruta</th><th>Șoferul de acum</th><th>Ce e de făcut</th>
              </tr></thead>
              <tbody>
                {ghid.alerte.map((a, i) => (
                  <tr key={i} className="border-b last:border-0 align-top">
                    <td className="py-1 font-medium whitespace-nowrap">
                      {a.economie_km_zi > 0 ? `−${a.economie_km_zi} km` : '—'}
                    </td>
                    <td className="whitespace-nowrap">{a.ruta} <span className="text-muted-foreground">s{a.shift_number}</span></td>
                    <td className="whitespace-nowrap">
                      {a.sofer ?? <span className="text-amber-700">netrecut în grafic</span>}
                      {a.sat_sofer && <span className="text-muted-foreground"> ({a.sat_sofer})</span>}
                    </td>
                    <td>
                      {a.instructiune}
                      <div className="text-xs text-muted-foreground">{a.detaliu}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}


      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Status pe zi</CardTitle>
          <input
            type="date" value={data.date} disabled={isPending}
            onChange={(e) => onDateChange(e.target.value)}
            style={{ padding: '0.4rem 0.6rem', borderRadius: 6, border: '1px solid var(--border, #ddd)' }}
          />
        </CardHeader>
        <CardContent>
          <div style={{ overflowX: 'auto' }}>
            <table className="pivot-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Direcția</th>
                  <th style={{ textAlign: 'right' }}>Curse</th>
                  <th style={{ textAlign: 'right' }}>Fără mașină</th>
                  <th style={{ textAlign: 'right' }}>Modificate</th>
                  <th style={{ textAlign: 'right' }}>Confirmate</th>
                  <th style={{ textAlign: 'right' }}>Nepotriviri</th>
                  <th style={{ textAlign: 'right' }}>Fără GPS</th>
                  <th style={{ textAlign: 'right' }}>Zi liberă</th>
                </tr>
              </thead>
              <tbody>
                {data.matrix.map((r) => (
                  <tr key={r.direction}>
                    <td>{r.label}</td>
                    <td style={{ textAlign: 'right' }}>{r.total}</td>
                    <td style={{ textAlign: 'right', color: r.fara_masina ? 'var(--warning, #c07a12)' : undefined }}>{r.fara_masina || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{r.modificate || '—'}</td>
                    <td style={{ textAlign: 'right', color: r.confirmate ? 'var(--success, #1a8a4a)' : undefined }}>{r.confirmate || '—'}</td>
                    <td style={{ textAlign: 'right', color: r.nepotriviri ? 'var(--danger, #ef4444)' : undefined }}>{r.nepotriviri || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{r.fara_gps || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{r.libere || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
