'use client';

import { useState } from 'react';
import type { AdminRole } from '@translux/db';
import NumarareClient from './NumarareClient';
import OperatorsTab from './tabs/OperatorsTab';
import SalaryTab from './tabs/SalaryTab';
import TariffsTab from './tabs/TariffsTab';
import IncasareTab from './tabs/IncasareTab';

type Tab = 'numarare' | 'incasare' | 'operatori' | 'salariu' | 'tarife';

const ALL_TABS: { key: Tab; label: string }[] = [
  { key: 'numarare', label: 'Numărare' },
  { key: 'incasare', label: 'Încasare' },
  { key: 'operatori', label: 'Operatori' },
  { key: 'salariu', label: 'Salariu' },
  { key: 'tarife', label: 'Tarife' },
];

export default function NumararePageClient({ role }: { role: AdminRole }) {
  // Vizibilitatea tab-urilor pe rol:
  // - ADMIN              → toate tab-urile
  // - ADMIN_CAMERE       → toate EXCEPT 'incasare' (mutat sub EVALUATOR_INCASARI)
  // - EVALUATOR_INCASARI → DOAR 'incasare'
  // - alți utilizatori   → fără tab-uri (NumarareClient direct)
  const isAdmin = role === 'ADMIN';
  const isAdminCamere = role === 'ADMIN_CAMERE';
  const isEvaluator = role === 'EVALUATOR_INCASARI';

  const visibleTabs: Tab[] = isAdmin
    ? ['numarare', 'incasare', 'operatori', 'salariu', 'tarife']
    : isAdminCamere
    ? ['numarare', 'operatori', 'salariu', 'tarife']
    : isEvaluator
    ? ['incasare']
    : [];

  const tabs = ALL_TABS.filter(t => visibleTabs.includes(t.key));
  const defaultTab: Tab = isEvaluator ? 'incasare' : 'numarare';
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);

  const showTabs = visibleTabs.length > 1;

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
          {tabs.map(tab => (
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

      {activeTab === 'numarare' && visibleTabs.includes('numarare') && <NumarareClient role={role} />}
      {activeTab === 'incasare' && visibleTabs.includes('incasare') && <IncasareTab role={role} />}
      {activeTab === 'operatori' && visibleTabs.includes('operatori') && <OperatorsTab />}
      {activeTab === 'salariu' && visibleTabs.includes('salariu') && <SalaryTab />}
      {activeTab === 'tarife' && visibleTabs.includes('tarife') && <TariffsTab />}
    </div>
  );
}
