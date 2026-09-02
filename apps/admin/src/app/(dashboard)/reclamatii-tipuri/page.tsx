export const dynamic = 'force-dynamic';

import { getComplaintTypes } from './actions';
import TipuriClient from './TipuriClient';

export default async function ReclamatiiTipuriPage() {
  const tipuri = await getComplaintTypes();
  return <TipuriClient tipuri={tipuri} />;
}
