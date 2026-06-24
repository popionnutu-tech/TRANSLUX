import { redirect } from 'next/navigation';

// Unificat cu «Mașini (tip & normă)» — vezi /lde/vehicule (tab «Tipuri de mașini»).
// Păstrăm ruta ca redirect ca să nu rupem link-uri vechi.
export default function TipuriMasiniPage() {
  redirect('/lde/vehicule');
}
