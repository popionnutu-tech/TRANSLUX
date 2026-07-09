export const dynamic = 'force-dynamic';

import { requirePieseNomenclator } from '@/lib/piese-access';
import { listWarehouses, listGroups, listSuppliers, listMechanics, listReasons } from '@/lib/piese';
import { listClients } from '@/lib/piese-ops';
import NomenclatorClient from './NomenclatorClient';

// Ce secțiuni poate edita fiecare rol. Secțiunile generice (warehouses..reasons) sunt oglinda HANDLERS
// din actions.ts. Excepție: 'parts' (catalogul de piese) NU trece prin createNomenclator/HANDLERS — are
// formular și view proprii (PartForm + savePart în part-actions.ts, gardat cu aceleași roluri:
// ADMIN/DEPOZITAR/GESTIONAR). Dacă schimbi rolurile pentru piese, actualizează AICI + în part-actions.ts.
const SECTIONS_BY_ROLE: Record<string, string[]> = {
  ADMIN: ['warehouses', 'groups', 'suppliers', 'clients', 'mechanics', 'reasons', 'parts'],
  DEPOZITAR: ['suppliers', 'parts'],
  VINZATOR: ['clients', 'mechanics', 'reasons'],
  GESTIONAR: ['suppliers', 'clients', 'mechanics', 'reasons', 'parts'],
};

export default async function NomenclatorPage() {
  const session = await requirePieseNomenclator();
  const sections = SECTIONS_BY_ROLE[session.role] || [];
  const [warehouses, groups, suppliers, clients, mechanics, reasons] = await Promise.all([
    listWarehouses(), listGroups(), listSuppliers(), listClients(), listMechanics(), listReasons(),
  ]);
  return (
    <>
      <div className="page-header">
        <h1>Nomenclatoare</h1>
        <p>Datele de bază ale depozitului. Fiecare rol vede doar ce poate gestiona; modificările apar imediat în dropdown-urile din prihod/rashod/vânzare.</p>
      </div>
      <NomenclatorClient
        sections={sections}
        data={{ warehouses, groups, suppliers, clients, mechanics, reasons } as Record<string, any[]>}
      />
    </>
  );
}
