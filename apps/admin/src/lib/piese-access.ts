import 'server-only';
import { redirect } from 'next/navigation';
import { verifySession } from './auth';

// Acces pe modulul „Piese", pe operațiuni:
//   • requirePieseWrite   → operațiuni de depozit (rashod / mutări / inventar / magazin): ADMIN, DEPOZITAR.
//   • requirePieseReceipt → recepție marfă (prihod): ADMIN, DEPOZITAR, CONTABIL (contabilul face intrările).
//   • requirePieseFiscal  → e-Factura / export 1C: ADMIN, CONTABIL.
// CONTABIL are în rest doar citire; MANAGER e doar citire pe tot modulul.
// Apelate în paginile de scriere ca să redirecteze rolurile fără drept spre o pagină de citire.

export async function requirePieseWrite() {
  const session = await verifySession();
  if (!session || (session.role !== 'ADMIN' && session.role !== 'DEPOZITAR')) redirect('/piese/stoc');
  return session;
}

export async function requirePieseReceipt() {
  const session = await verifySession();
  if (!session || (session.role !== 'ADMIN' && session.role !== 'DEPOZITAR' && session.role !== 'CONTABIL')) redirect('/piese/stoc');
  return session;
}

export async function requirePieseFiscal() {
  const session = await verifySession();
  if (!session || (session.role !== 'ADMIN' && session.role !== 'CONTABIL')) redirect('/piese/stoc');
  return session;
}

// Nomenclatoare (depozite/grupe/furnizori/clienți/mecanici/motive): ADMIN, DEPOZITAR, CONTABIL.
// Ce poate edita fiecare în interiorul paginii e decis per secțiune în nomenclator/actions.ts.
export async function requirePieseNomenclator() {
  const session = await verifySession();
  if (!session || (session.role !== 'ADMIN' && session.role !== 'DEPOZITAR' && session.role !== 'CONTABIL')) redirect('/piese/stoc');
  return session;
}
