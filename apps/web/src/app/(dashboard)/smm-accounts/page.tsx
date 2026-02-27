export const dynamic = 'force-dynamic';

import { getSmmAccounts } from './actions';
import SmmAccountsClient from './SmmAccountsClient';

export default async function SmmAccountsPage() {
  const accounts = await getSmmAccounts();
  return <SmmAccountsClient initialAccounts={accounts} />;
}
