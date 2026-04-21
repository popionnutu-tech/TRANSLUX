'use client';

import { useState } from 'react';
import type { AdminRole } from '@translux/db';
import NumarareClient from './NumarareClient';
import OperatorsTab from './tabs/OperatorsTab';
import SalaryTab from './tabs/SalaryTab';
import TariffsTab from './tabs/TariffsTab';
import IncasareTab from './tabs/IncasareTab';

type Tab = 'numarare' | 'incasare' | 'operatori' | 'salariu' | 'tarife';

const ADMIN_TABS: { key: Tab; label: string }[] = [
  { key: 'numarare', label: 'Numărare' },
  { key: 'incasare', label: 'Încasare' },
  { key: 'operatori', label: 'Operatori' },
  { key: 'salariu', label: 'Salariu' },
  { key: 'tarife', label: 'Tarife' },
];

export default function NumararePageClient({ role }: { role: AdminRole }) {
  const [activeTab, setActiveTab] = useState<Tab>('numarare');

  const showTabs = role === 'ADMIN_CAMERE' || role === 'ADMIN';

  return (
    <div className="page">
      {showTabs && (
        <div style={{
          display: 'flex',
          gap: 4,
          marginBottom: 20,
          borderBottom: '1px solid rgba(155,27,48,0.1)',
          paddingBottom: 0,
        }}>
          {ADMIN_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '10px 20px',
                border: 'none',
                borderBottom: activeTab === tab.key ? '3px solid #9B1B30' : '3px solid transparent',
                background: activeTab === tab.key ? 'rgba(155,27,48,0.06)' : 'transparent',
                color: activeTab === tab.key ? '#9B1B30' : '#999',
                fontWeight: activeTab === tab.key ? 600 : 500,
                fontSize: 14,
                cursor: 'pointer',
                fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
                fontStyle: 'italic',
                transition: 'all 0.2s ease',
                borderRadius: '8px 8px 0 0',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {activeTab === 'numarare' && <NumarareClient role={role} />}
      {activeTab === 'incasare' && <IncasareTab />}
      {activeTab === 'operatori' && <OperatorsTab />}
      {activeTab === 'salariu' && <SalaryTab />}
      {activeTab === 'tarife' && <TariffsTab />}
    </div>
  );
}
