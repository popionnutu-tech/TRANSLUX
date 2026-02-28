export const dynamic = 'force-dynamic';

import { getUsers, getInvites } from './actions';
import UsersClient from './UsersClient';

export default async function UsersPage() {
  const [users, invites] = await Promise.all([getUsers(), getInvites()]);
  return <UsersClient initialUsers={users} initialInvites={invites} />;
}
