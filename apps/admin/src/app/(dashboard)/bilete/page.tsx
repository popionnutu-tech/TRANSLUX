export const dynamic = 'force-dynamic';

import { alerteDeschise, contorNouaVechi, listaComenzi, type Filtre } from './actions';
import BileteClient from './BileteClient';

interface Props {
  searchParams: Promise<{ zi?: string; ruta?: string; stare?: string; test?: string }>;
}

export default async function BiletePage({ searchParams }: Props) {
  const sp = await searchParams;
  const filtre: Filtre = {
    zi: sp.zi || undefined,
    ruta: sp.ruta ? Number(sp.ruta) : undefined,
    stare: sp.stare || undefined,
    test: sp.test === 'da' || sp.test === 'nu' ? sp.test : 'toate',
  };
  const [comenzi, alerte, nouaVechi] = await Promise.all([listaComenzi(filtre), alerteDeschise(), contorNouaVechi()]);
  return <BileteClient comenzi={comenzi} alerte={alerte} nouaVechi={nouaVechi} filtre={filtre} />;
}
