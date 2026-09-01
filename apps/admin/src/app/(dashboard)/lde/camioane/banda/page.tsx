import { redirect } from 'next/navigation';

// Banda a devenit pagina principală a modulului. Ruta scurtă rămâne activă.
export default function BandaMutata() {
  redirect('/lde/camioane');
}
