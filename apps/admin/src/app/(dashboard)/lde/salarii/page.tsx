export const dynamic = 'force-dynamic';

import { getSalaryRuns } from './actions';
import SalariiClient from './SalariiClient';

export default async function SalariiPage() {
  const runs = await getSalaryRuns();
  return <SalariiClient initialRuns={runs} />;
}
