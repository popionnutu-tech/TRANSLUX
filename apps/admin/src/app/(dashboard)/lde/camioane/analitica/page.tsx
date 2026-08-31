export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth';
import { poateAccesa } from '@/lib/lde/camioane-nav';

// Analitica reală (traseu real vs ideal, punctualitate, utilizare, km goi) vine în
// etapa 3, după workerul nocturn care umple lde_truck_trip_metrics. Până atunci fila
// spune cinstit ce lipsește — mai bine decât un 404 sau cifre inventate.
export default async function AnaliticaPage() {
  const session = await verifySession();
  if (!session || !poateAccesa(session.role, '/lde/camioane/analitica')) redirect('/login');

  return (
    <div className="page">
      <div className="page-header">
        <h1>Analitică livrări și trasee</h1>
      </div>
      <div className="card">
        <p>
          Se calculează din GPS, noaptea, pentru cursele deja planificate. Cât timp nu există
          curse cu metrici, nu are ce afișa.
        </p>
        <p className="text-muted">
          Va conține: traseu real vs ideal (km în plus, ocoluri, opriri lungi), planificat vs real
          la încărcare și descărcare, utilizarea flotei pe camion și lună, km goi față de km încărcați.
        </p>
      </div>
    </div>
  );
}
