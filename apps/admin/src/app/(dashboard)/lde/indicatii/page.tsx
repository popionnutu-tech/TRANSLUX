export const dynamic = 'force-dynamic';
// generateIndications batch-procesează toate vehiculele LDE pe o lună (alimentări + GPS).
// 60s = maxim pe Hobby, valid și pe Pro.
export const maxDuration = 60;

import { getIndications } from './actions';
import IndicatiiClient from './IndicatiiClient';

export default async function IndicatiiPage() {
  // Default: doar indicațiile active (ne-închise), cele mai recente întâi.
  const indications = await getIndications({ active_only: true });
  return <IndicatiiClient initialIndications={indications} />;
}
