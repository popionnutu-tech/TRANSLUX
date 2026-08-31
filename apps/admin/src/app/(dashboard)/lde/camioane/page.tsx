export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth';
import { poateAccesa } from '@/lib/lde/camioane-nav';

// Fila Dispecerat (kanban + hartă live) vine în etapa 2. Până atunci rădăcina
// modulului trimite la planificare, ca dispecerul să nu nimerească într-un ecran gol.
export default async function CamioanePage() {
  const session = await verifySession();
  if (!session || !poateAccesa(session.role, '/lde/camioane')) redirect('/login');
  redirect('/lde/camioane/planificare');
}
