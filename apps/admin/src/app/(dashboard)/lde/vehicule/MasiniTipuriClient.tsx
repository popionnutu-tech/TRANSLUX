'use client';

import { useState } from 'react';
import type { LdeVehicleType } from '@translux/db';
import VehiculeClient from './VehiculeClient';
import TipuriMasiniClient from '../tipuri-masini/TipuriMasiniClient';
import type { LdeVehicleNormRow } from './actions';

// Pagină unificată: «Mașini (tip & normă)» + «Tipuri mașini» într-un singur ecran cu taburi.
export default function MasiniTipuriClient({
  initialVehicule,
  types,
}: {
  initialVehicule: LdeVehicleNormRow[];
  types: LdeVehicleType[];
}) {
  const [tab, setTab] = useState<'masini' | 'tipuri'>('masini');

  return (
    <>
      <div className="flex gap-2" style={{ padding: '16px 24px 0' }}>
        <button
          className={`btn ${tab === 'masini' ? 'btn-primary' : ''}`}
          onClick={() => setTab('masini')}
        >
          Mașini ({initialVehicule.length})
        </button>
        <button
          className={`btn ${tab === 'tipuri' ? 'btn-primary' : ''}`}
          onClick={() => setTab('tipuri')}
        >
          Tipuri de mașini ({types.length})
        </button>
      </div>

      {tab === 'masini' ? (
        <VehiculeClient initialVehicule={initialVehicule} types={types} />
      ) : (
        <TipuriMasiniClient initialTypes={types} />
      )}
    </>
  );
}
