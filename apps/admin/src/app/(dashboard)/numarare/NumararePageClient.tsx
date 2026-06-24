'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import type { AdminRole } from '@translux/db';
import { isIpProtectedRole } from '@/lib/ip-access-roles';
import NumarareClient from './NumarareClient';
import OperatorsTab from './tabs/OperatorsTab';
import SalaryTab from './tabs/SalaryTab';
import TariffsTab from './tabs/TariffsTab';
import IncasareTab from './tabs/IncasareTab';

type Tab = 'numarare' | 'incasare' | 'operatori' | 'salariu' | 'tarife';

const ALL_TABS: { key: Tab; label: string }[] = [
  { key: 'numarare', label: 'GO' },
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
    : ['numarare'];  // OPERATOR_CAMERE și alte roluri văd doar Numărare (fără tab-uri)

  const tabs = ALL_TABS.filter(t => visibleTabs.includes(t.key));
  const defaultTab: Tab = isEvaluator ? 'incasare' : 'numarare';

  const searchParams = useSearchParams();
  const router = useRouter();
  const urlTab = searchParams.get('tab') as Tab | null;
  const [activeTab, setActiveTab] = useState<Tab>(
    urlTab && visibleTabs.includes(urlTab) ? urlTab : defaultTab
  );

  // Sincronizare când se navighează din sidebar (/numarare?tab=...)
  useEffect(() => {
    const t = searchParams.get('tab') as Tab | null;
    if (t && visibleTabs.includes(t)) setActiveTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function selectTab(key: Tab) {
    setActiveTab(key);
    const url = `/numarare?tab=${key}`;
    // Rolurile IP-protejate re-rulează checkRoleIpAccess (RPC) la fiecare RSC-refetch;
    // pentru ele actualizăm doar bara de adresă, fără refetch.
    if (isIpProtectedRole(role)) {
      window.history.replaceState(null, '', url);
    } else {
      router.replace(url, { scroll: false });
    }
  }

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
              onClick={() => selectTab(tab.key)}
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
