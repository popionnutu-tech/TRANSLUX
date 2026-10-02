// Fereastra în care baza (instanța Supabase NANO) are voie să ducă munca grea: 23:00–05:00 ora Chișinăului (ION-166,
// după căderea din 01.10 19:33–20:20). Ziua rulează doar ce e ușor; refacerile grele așteaptă noaptea.
export function inFereastraDeNoapte(d: Date): boolean {
  const ora = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Chisinau', hour: '2-digit', hour12: false }).format(d));
  return ora >= 23 || ora < 5;
}
