export const dynamic = 'force-dynamic';

import { listaPlati, stareMaib } from './actions';
import { sincronizeazaStare } from '@/lib/maib/sincronizare';
import { biletPublic } from '@/lib/bilete/public';
import PlatiClient from './PlatiClient';

interface Props {
  searchParams: Promise<{ checkout?: string; rezultat?: string; bilet?: string; plata?: string }>;
}

export default async function PlatiPage({ searchParams }: Props) {
  const sp = await searchParams;
  // Întoarcerea de la o comandă de test de bilete (ION-193): arătăm comanda și biletele prin același API ca site-ul.
  const bilet = sp.bilet ? await biletPublic(sp.bilet) : null;
  // Întoarcerea de la maib (successUrl/failUrl): sincronizăm întâi, callback-ul poate întârzia.
  // Fără revalidatePath aici — pagina e deja dynamic și Next interzice revalidarea în randare.
  let banner: { ok: boolean; text: string } | null = null;
  if (sp.checkout) {
    const r = await sincronizeazaStare(sp.checkout);
    if (!r.ok) banner = { ok: false, text: `Nu s-a putut citi starea sesiunii ${sp.checkout}: ${r.eroare}` };
    else if (sp.rezultat === 'ok') banner = { ok: true, text: `Plata ${sp.checkout}: ${r.rand?.status ?? '?'} / ${r.rand?.payment_status ?? 'fără plată încă'}` };
    else banner = { ok: false, text: `Plata ${sp.checkout} nu s-a încheiat: ${r.rand?.status ?? r.mesaj ?? '?'}` };
  }
  const [rows, stare] = await Promise.all([listaPlati(), stareMaib()]);
  return <PlatiClient rows={rows} stare={stare} banner={banner} bilet={bilet} plataNereusita={sp.plata === 'nu'} />;
}
