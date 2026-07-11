export const dynamic = 'force-dynamic';

import { getUsers, getInvites, getAdminAccounts } from './actions';
import { listWarehouses } from '@/lib/piese';
import UsersClient from './UsersClient';

export default async function UsersPage() {
  const [users, invites, admins, warehouses] = await Promise.all([
    getUsers(),
    getInvites(),
    getAdminAccounts(),
    listWarehouses(), // Etapa 2: pentru dropdown-ul „Depozit" din conturile administrative
  ]);
  return (
    <UsersClient
      initialUsers={users}
      initialInvites={invites}
      initialAdmins={admins}
      initialWarehouses={(warehouses as any[]).map((w) => ({ id: Number(w.id), name: w.name as string }))}
    />
  );
}
