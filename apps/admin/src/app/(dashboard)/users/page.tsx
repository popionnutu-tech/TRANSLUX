export const dynamic = 'force-dynamic';

import { getUsers, getInvites, getAdminAccounts, getAccountPasswords } from './actions';
import UsersClient from './UsersClient';

export default async function UsersPage() {
  const [users, invites, admins, passwords] = await Promise.all([
    getUsers(),
    getInvites(),
    getAdminAccounts(),
    getAccountPasswords(),
  ]);
  return (
    <UsersClient
      initialUsers={users}
      initialInvites={invites}
      initialAdmins={admins}
      accountPasswords={passwords}
    />
  );
}
