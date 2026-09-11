// Textul reclamației trebuie să spună CE s-a întâmplat (Ion, 11.09: «Păi nici ce
// fel de reclamație?»). Apelul conv_8301m28fm61cexbs1dfz9hpb0h8z: la «am o
// reclamație despre un șofer» agentul a chemat tool-ul cu textul «Reclamație
// despre șofer» — eticheta, nu povestea — și dosarul a plecat în grupa șoferilor
// fără conținut. Promptul cere acum «întâi ce s-a întâmplat», dar promptul se
// poate rescrie din dashboard; poarta de aici nu.

/**
 * Textul e o etichetă goală («Reclamație despre șofer», «Жалоба на водителя»,
 * «plângere»), nu o poveste. Pragul de lungime e mic dinadins: «a luat 250 în
 * loc de 68» sau «a fumat la volan» sunt reclamații întregi în puține cuvinte.
 */
export function esteReclamatieGoala(text: string | null | undefined): boolean {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length < 12) return true;
  // «Reclamație despre/pe/la …», «Жалоба на/о …», «Претензия к …» — scurte: eticheta
  // cu obiectul ei, fără nicio faptă. Peste 60 de semne e deja o propoziție.
  // Fără `\b`: în JS granița de cuvânt e doar ASCII, deci după «на» n-ar găsi-o.
  return t.length < 60
    && /^(o\s+|am\s+o\s+|у\s+меня\s+)?(reclama[țt]i[ea]|pl[âa]ngere|жалоб[аы]|претензи[яи])\s+(despre|pe|la|cu|на|о|об|про|к)(?=\s)/i.test(t);
}
