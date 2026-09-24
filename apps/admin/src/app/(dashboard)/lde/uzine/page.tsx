export const dynamic = 'force-dynamic';

import { getUzine } from './actions';
import UzineClient from './UzineClient';
import { getCurse, getUzinas } from './_rute/actions';
import CurseClient from './_rute/CurseClient';
import RegulaLear from './_regula/RegulaLear';

// «Uzine» cuprinde tot ce descrie o uzină (Ion, 24.09, ION-54): setările ei, rutele cu ture
// și mașini (fosta «Curse uzine», doar citire) și regula de livrare (fosta «Reguli livrări LEAR»,
// se editează pe /lde/livrare-reguli).
export default async function UzinePage() {
  const [uzine, curse, uzinas] = await Promise.all([getUzine(), getCurse(), getUzinas()]);
  return (
    <>
      <UzineClient initialUzine={uzine} />
      <CurseClient initialCurse={curse} uzinas={uzinas} />
      <RegulaLear />
    </>
  );
}
