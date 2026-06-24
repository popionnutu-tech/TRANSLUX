export const dynamic = 'force-dynamic';

import { getLdeSoferi, getLdeUzine } from './actions';
import LdeSoferiClient from './LdeSoferiClient';

export default async function LdeSoferiPage() {
  const [soferi, uzine] = await Promise.all([getLdeSoferi(), getLdeUzine()]);
  return <LdeSoferiClient initialSoferi={soferi} uzine={uzine} />;
}
