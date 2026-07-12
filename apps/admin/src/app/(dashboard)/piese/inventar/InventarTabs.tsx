'use client';

import { useState } from 'react';
import InventarClient from './InventarClient';
import InventarInitialClient from './InventarInitialClient';

interface Opt { id: number; label: string }

// Două moduri pe pagina de Inventariere:
//  • „numărare" (InventarClient) — corectează stocul existent, disponibil tuturor rolurilor de inventar.
//  • „inițial" (InventarInitialClient) — pornirea unui depozit gol; DOAR rolurile care scriu locații
//    (canInitial = PART_WRITE_ROLES, decis pe server). Vânzătorul nu vede tab-ul → randăm direct numărarea.
export default function InventarTabs({ warehouses, groups, canInitial, initialLayout }: {
  warehouses: Opt[]; groups: Opt[]; canInitial: boolean; initialLayout: any;
}) {
  const [tab, setTab] = useState<'count' | 'initial'>('count');
  if (!canInitial) return <InventarClient warehouses={warehouses} />;
  return (
    <>
      <div className="pill-row" style={{ marginBottom: 14 }}>
        <button className={`btn${tab === 'count' ? ' btn-primary' : ''}`} onClick={() => setTab('count')} style={{ padding: '7px 14px' }}>Numărare (corectare stoc)</button>
        <button className={`btn${tab === 'initial' ? ' btn-primary' : ''}`} onClick={() => setTab('initial')} style={{ padding: '7px 14px' }}>Inventar inițial (de la zero)</button>
      </div>
      {tab === 'count'
        ? <InventarClient warehouses={warehouses} />
        : <InventarInitialClient warehouses={warehouses} groups={groups} initialLayout={initialLayout} />}
    </>
  );
}
