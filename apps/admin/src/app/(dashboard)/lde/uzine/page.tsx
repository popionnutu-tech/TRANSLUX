export const dynamic = 'force-dynamic';

import { getUzine } from './actions';
import UzineClient from './UzineClient';

export default async function UzinePage() {
  const uzine = await getUzine();
  return <UzineClient initialUzine={uzine} />;
}
