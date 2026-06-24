'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Truck, Factory, Route, Users, ClipboardList, Fuel, AlertTriangle, Gauge } from 'lucide-react';
import type { LdeOverview } from './actions';

type Item = {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
};

const nf = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 1 });

export default function LdeOverviewClient({ data }: { data: LdeOverview }) {
  const items: Item[] = [
    { label: 'Tipuri mașini', value: data.vehicle_types_count, icon: Truck },
    { label: 'Uzine', value: data.uzine_count, icon: Factory },
    { label: 'Curse uzine', value: data.factory_routes_count, icon: Route },
    { label: 'Șoferi LDE', value: data.driver_extras_count, icon: Users },
    { label: 'Atribuiri active', value: data.active_assignments_count, icon: ClipboardList },
  ];

  const noOperationalData = data.combustibil_litri_30d === 0 && data.km_total_30d === 0;

  return (
    <div className="page">
      <div className="page-header">
        <h1>LDE</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {items.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="page-header" style={{ marginTop: '1.5rem' }}>
        <h2 className="text-lg font-semibold">Operațional (30 zile)</h2>
      </div>

      {noOperationalData && (
        <div className="badge badge-absent" style={{ display: 'block', padding: '0.75rem 1rem', marginBottom: '1rem' }}>
          Date operaționale vor apărea după conectarea GPS + Benzol.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Combustibil</CardTitle>
            <Fuel className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{nf1.format(data.combustibil_litri_30d)} L</div>
            <div className="text-sm text-muted-foreground">{nf.format(data.combustibil_lei_30d)} lei</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Alerte deschise</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 text-base font-semibold">
              <span title="Verde">🟢 {data.alerte_deschise.verde}</span>
              <span title="Galben">🟡 {data.alerte_deschise.galben}</span>
              <span title="Roșu">🔴 {data.alerte_deschise.rosu}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Km flotă</CardTitle>
            <Gauge className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{nf.format(data.km_total_30d)}</div>
            <div className="text-sm text-muted-foreground">km</div>
          </CardContent>
        </Card>
      </div>

      <div className="page-header" style={{ marginTop: '1.5rem' }}>
        <h2 className="text-lg font-semibold">Top перерасход (depășire normă)</h2>
      </div>

      {data.top_pererashod.length === 0 ? (
        <div className="badge badge-ok" style={{ display: 'inline-block', padding: '0.5rem 0.75rem' }}>
          Fără alerte roșii
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Mașină</th>
              <th>Перерасход (+L/100km)</th>
              <th>Consum efectiv</th>
            </tr>
          </thead>
          <tbody>
            {data.top_pererashod.map((r) => (
              <tr key={r.vehicle_id}>
                <td>{r.plate_number}</td>
                <td>🔴 +{nf1.format(r.pererashod_l_per_100km)}</td>
                <td className="text-muted">{nf1.format(r.actual_consumption_l_per_100km)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
