export const dynamic = 'force-dynamic';
// recomputeDtAlerts poate procesa multe ferestre plin→plin (88 vehicule × alimentări/lună)
// când GPS+Benzol sunt conectate. 60s = maxim pe Hobby, valid și pe Pro.
export const maxDuration = 60;

import { getDtAlerts } from './actions';
import AlerteClient from './AlerteClient';

export default async function AlertePage() {
  const alerts = await getDtAlerts();
  return <AlerteClient initialAlerts={alerts} />;
}
