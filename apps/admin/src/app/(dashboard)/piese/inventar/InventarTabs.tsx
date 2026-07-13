'use client';

import { useState } from 'react';
import InventarClient from './InventarClient';
import InventarInitialClient from './InventarInitialClient';
import RecostClient from './RecostClient';

interface Opt { id: number; label: string }

// Moduri pe pagina de Inventariere:
//  • „numărare" (InventarClient) — corectează stocul existent, disponibil tuturor rolurilor de inventar.
//  • „inițial" (InventarInitialClient) — pornirea unui depozit gol.
//  • „revizuire cost" (RecostClient) — corectează costul mediu păstrând cantitatea.
// Ultimele două DOAR pentru rolurile care scriu (canInitial = PART_WRITE_ROLES, decis pe server).
// Vânzătorul nu le vede → randăm direct numărarea.
export default function InventarTabs({ warehouses, groups, canInitial, initialLayout }: {
  warehouses: Opt[]; groups: Opt[]; canInitial: boolean; initialLayout: any;
}) {
  const [tab, setTab] = useState<'count' | 'initial' | 'recost'>('count');
  if (!canInitial) return <InventarClient warehouses={warehouses} />;
  return (
    <>
      <div className="pill-row" style={{ marginBottom: 14 }}>
        <button className={`btn${tab === 'count' ? ' btn-primary' : ''}`} onClick={() => setTab('count')} style={{ padding: '7px 14px' }}>Numărare (corectare stoc)</button>
        <button className={`btn${tab === 'initial' ? ' btn-primary' : ''}`} onClick={() => setTab('initial')} style={{ padding: '7px 14px' }}>Inventar inițial (de la zero)</button>
        <button className={`btn${tab === 'recost' ? ' btn-primary' : ''}`} onClick={() => setTab('recost')} style={{ padding: '7px 14px' }}>Revizuire cost</button>
      </div>
      {tab === 'count'
        ? <InventarClient warehouses={warehouses} />
        : tab === 'initial'
        ? <InventarInitialClient warehouses={warehouses} groups={groups} initialLayout={initialLayout} />
        : <RecostClient warehouses={warehouses} />}
    </>
  );
}
