export const dynamic = 'force-dynamic';

import { getTrasee, getImpacare } from './actions';
import TraseeClient from './TraseeClient';

export default async function LdeTraseePage() {
  const [trasee, impacare] = await Promise.all([getTrasee(), getImpacare()]);
  return <TraseeClient trasee={trasee} impacare={impacare} />;
}
