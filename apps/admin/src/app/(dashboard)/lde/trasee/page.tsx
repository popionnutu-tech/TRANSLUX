export const dynamic = 'force-dynamic';

import { getTrasee, getImpacare, getPropuneri } from './actions';
import TraseeClient from './TraseeClient';

export default async function LdeTraseePage() {
  const [trasee, impacare, propuneri] = await Promise.all([getTrasee(), getImpacare(), getPropuneri()]);
  return <TraseeClient trasee={trasee} impacare={impacare} propuneri={propuneri} />;
}
