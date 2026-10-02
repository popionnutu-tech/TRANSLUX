export const dynamic = 'force-dynamic';

import { listaPlati, stareMaib } from './actions';
import { sincronizeazaStare } from '@/lib/maib/sincronizare';
import PlatiClient from './PlatiClient';

interface Props {
  searchParams: Promise<{ checkout?: string; rezultat?: string }>;
}

export default async function PlatiPage({ searchParams }: Props) {
  const sp = await searchParams;
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
  return <PlatiClient rows={rows} stare={stare} banner={banner} />;
}
