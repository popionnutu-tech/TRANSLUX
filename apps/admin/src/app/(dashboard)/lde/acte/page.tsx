export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { getBilling, getActe } from './actions';
import ActeClient from './ActeClient';

export default async function ActePage() {
  const [billing, acte] = await Promise.all([getBilling(), getActe()]);
  return <ActeClient initialBilling={billing} initialActe={acte} />;
}
