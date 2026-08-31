// Saluturile agentului vocal, după ora Chișinăului.
// Stau AICI, nu în route.ts: un fișier de rută Next.js poate exporta doar
// handlerele HTTP și câmpurile lui de configurare — orice alt export oprește
// build-ul («greetingRu is not a valid Route export field», dpl_AZCiyotb, 25.08).

// Anunțul legal de înregistrare. Sursa unică pentru cod: îl folosesc și saluturile
// de mai jos, și controlerul, care raportează drift dacă salutul viu nu-l conține.
// A patra copie trăiește în scripts/voice-agent/agent-config.mjs (script separat,
// nu importă din apps/admin) — se schimbă manual, în același commit.
export const RECORDING_NOTICE_RO = 'Convorbirea este înregistrată';
export const RECORDING_NOTICE_RU = 'Разговор записывается';

function hourInChisinau(): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Chisinau',
      hour: 'numeric',
      hour12: false,
    }).format(new Date()),
  );
}

export function greetingRo(): string {
  const hour = hourInChisinau();
  const salut = hour >= 5 && hour < 11 ? 'Bună dimineața' : hour >= 11 && hour < 18 ? 'Bună ziua' : 'Bună seara';
  return `${salut}! Ați sunat la TRANSLUX. ${RECORDING_NOTICE_RO}. Cu ce vă pot ajuta?`;
}

// Păstrat pentru agentul RUSESC: dacă i se va cere vreodată salut după oră,
// textul e deja aici, cu brandul fonetic corect. Nu se folosește pe ruta init —
// acolo preia apelul agentul românesc.
export function greetingRu(): string {
  const hour = hourInChisinau();
  const salut = hour >= 5 && hour < 11 ? 'Доброе утро' : hour >= 11 && hour < 18 ? 'Добрый день' : 'Добрый вечер';
  // Brandul FONETIC în rusă — TTS-ul citește greșit literele latine (lecția TLX).
  return `${salut}! Вы позвонили в ТрансЛюкс. ${RECORDING_NOTICE_RU}. Чем могу помочь?`;
}
