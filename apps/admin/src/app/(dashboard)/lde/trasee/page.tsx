export const dynamic = 'force-dynamic';

import { getTrasee, getImpacare, getPropuneri, getGranite } from './actions';
import TraseeClient from './TraseeClient';

export default async function LdeTraseePage() {
  const [trasee, impacare, propuneri, granite] = await Promise.all([getTrasee(), getImpacare(), getPropuneri(), getGranite()]);
  return <TraseeClient trasee={trasee} impacare={impacare} propuneri={propuneri} granite={granite} />;
}
