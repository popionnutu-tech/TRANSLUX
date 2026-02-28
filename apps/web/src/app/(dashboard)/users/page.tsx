export const dynamic = 'force-dynamic';

import { getUsers } from './actions';
import UsersClient from './UsersClient';

export default async function UsersPage() {
  const users = await getUsers();
  return <UsersClient initialUsers={users} />;
}
