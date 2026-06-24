import 'server-only';
import { redirect } from 'next/navigation';
import { verifySession } from './auth';

// Operațiunile de depozit (prihod / rashod / mutări / inventar / magazin) rămân doar ADMIN.
// CONTABIL are acces de citire la modulul piese (+ fiscal/1C), dar nu poate face mișcări de stoc.
// Apelată în paginile de scriere ca să redirecteze rolurile non-ADMIN spre o pagină de citire.
export async function requirePieseWrite() {
  const session = await verifySession();
  if (!session || session.role !== 'ADMIN') redirect('/piese/stoc');
  return session;
}
