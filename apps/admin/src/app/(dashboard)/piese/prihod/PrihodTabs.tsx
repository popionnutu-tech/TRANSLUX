'use client';

import { useState } from 'react';
import PrihodClient from './PrihodClient';
import PrihodDocsClient, { type ReceiptDoc } from './PrihodDocsClient';

type Opt = { id: number; label: string };

// Pagina Prihod cu 2 tab-uri: „Recepție nouă" (formularul de creare) și „Documente" (jurnalul recepțiilor).
export default function PrihodTabs({ warehouses, suppliers, groups, initialDocs }: {
  warehouses: Opt[]; suppliers: Opt[]; groups: Opt[]; initialDocs: ReceiptDoc[];
}) {
  const [tab, setTab] = useState<'new' | 'docs'>('new');
  return (
    <>
      <div className="pill-row" style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        <button className={`btn${tab === 'new' ? ' btn-primary' : ''}`} style={{ padding: '8px 16px' }} onClick={() => setTab('new')}>Recepție nouă</button>
        <button className={`btn${tab === 'docs' ? ' btn-primary' : ''}`} style={{ padding: '8px 16px' }} onClick={() => setTab('docs')}>Documente</button>
      </div>
      {tab === 'new'
        ? <PrihodClient warehouses={warehouses} suppliers={suppliers} groups={groups} />
        : <PrihodDocsClient warehouses={warehouses} initialDocs={initialDocs} />}
    </>
  );
}
