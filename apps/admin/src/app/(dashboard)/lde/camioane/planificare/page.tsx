import { redirect } from 'next/navigation';

// Grila de planificare s-a contopit în bandă (Ion, 01.09). Ruta rămâne ca să nu
// se rupă semnele salvate și linkurile din mesaje vechi.
export default function PlanificareMutata() {
  redirect('/lde/camioane');
}
