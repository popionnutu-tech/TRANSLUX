export const dynamic = 'force-dynamic';

import { getUsers, getInvites, getAdminAccounts } from './actions';
import UsersClient from './UsersClient';

export default async function UsersPage() {
  const [users, invites, admins] = await Promise.all([getUsers(), getInvites(), getAdminAccounts()]);
  return <UsersClient initialUsers={users} initialInvites={invites} initialAdmins={admins} />;
}
