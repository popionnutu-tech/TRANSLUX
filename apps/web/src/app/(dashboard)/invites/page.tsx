export const dynamic = 'force-dynamic';

import { getInvites } from './actions';
import InvitesClient from './InvitesClient';

export default async function InvitesPage() {
  const invites = await getInvites();
  return <InvitesClient initialInvites={invites} />;
}
