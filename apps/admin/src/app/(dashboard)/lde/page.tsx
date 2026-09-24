import { redirect } from 'next/navigation';

// Tabloul LDE a fost scos (Ion, 24.09, ION-53: «Tablou zilnic, tablou scoate») — citea aceleași
// date de GPS și motorină ca «Km & motorină», iar blocurile de numerar și alerte arătau mereu zero.
// Linkul modulului din meniu duce tot la /lde, deci pagina trimite mai departe.
export default function LdePage() {
  redirect('/lde/km-zilnic');
}
