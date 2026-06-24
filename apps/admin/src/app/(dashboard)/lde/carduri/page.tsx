export const dynamic = 'force-dynamic';

import { getCardSuggestions } from './actions';
import CarduriClient from './CarduriClient';

export default async function LdeCarduriPage() {
  const initial = await getCardSuggestions();
  return <CarduriClient initial={initial} />;
}
