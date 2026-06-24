export const dynamic = 'force-dynamic';
// Agregarea snapshot-urilor (GPS + Benzol + numerar pe un set de vehicule) poate
// atinge perioade lungi când datele sunt conectate. 60s = maxim pe Hobby, valid și pe Pro.
export const maxDuration = 60;

import { getExperiments } from './actions';
import ExperimenteClient from './ExperimenteClient';

export default async function ExperimentePage() {
  const { experiments, vehicles } = await getExperiments();
  return <ExperimenteClient initialExperiments={experiments} vehicles={vehicles} />;
}
