export const dynamic = 'force-dynamic';

import { getCurse, getUzinas } from './actions';
import CurseClient from './CurseClient';

export default async function CursePage() {
  const [curse, uzinas] = await Promise.all([getCurse(), getUzinas()]);
  return <CurseClient initialCurse={curse} uzinas={uzinas} />;
}
