import { redirect } from 'next/navigation';

// Comasată în /lde/parc (Ion, 24.09, ION-54: nomenclatorul LDE de la 9 pagini la 3). Adresa veche trimite mai departe.
export default function Redirect() {
  redirect('/lde/parc');
}
