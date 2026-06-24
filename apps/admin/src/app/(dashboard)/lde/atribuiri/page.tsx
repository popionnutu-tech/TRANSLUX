export const dynamic = 'force-dynamic';

import { getAssignments, getCreateOptions } from './actions';
import AtribuiriClient from './AtribuiriClient';

export default async function AtribuiriPage() {
  const [assignments, options] = await Promise.all([
    getAssignments({ active_only: true }),
    getCreateOptions(),
  ]);
  return <AtribuiriClient initialAssignments={assignments} options={options} />;
}
