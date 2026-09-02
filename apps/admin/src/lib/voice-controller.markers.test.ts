import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROMPT_MARKERS_RO, PROMPT_MARKERS_RU } from './voice/prompt-markers';

// Testul-frate al celui din prompt-markers.test.ts. Acela verifică reperele
// între ele; NU prinde cazul real din 02.09: un bloc nou care CITA în corpul
// lui markerul altui bloc («regula din ZIUA — DOSLOVEN DIN TOOL rămâne
// întreagă»). Citatul face `prompt.includes(marker)` mereu adevărat, deci dacă
// blocul citat dispare din promptul viu, controlerul nici nu-l vindecă, nici
// nu-l raportează ca drift (markerii HEALABLE sunt filtrați din drift-uri).
// Pierdere tăcută și permanentă.
//
// Verificăm pe CORPURILE blocurilor, nu pe fișierul întreg: un marker citat
// într-un comentariu de cod nu ajunge niciodată în promptul agentului, deci nu
// orbește nimic — o verificare pe tot fișierul ar da alarme false.
const sursa = readFileSync(join(__dirname, 'voice-controller.ts'), 'utf-8');

/** Corpurile literalelor `const X_BLOCK = ` … `;` din controler. */
function corpuriDeBloc(): Map<string, string> {
  const corpuri = new Map<string, string>();
  const re = /const\s+([A-Z0-9_]*BLOCK[A-Z0-9_]*)\s*=\s*`([\s\S]*?)`;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sursa)) !== null) corpuri.set(m[1], m[2]);
  return corpuri;
}

const corpuri = corpuriDeBloc();

describe('reperele în corpul blocurilor', () => {
  it('sursa chiar conține blocuri de prompt', () => {
    expect(corpuri.size).toBeGreaterThan(8);
  });

  for (const marker of [...PROMPT_MARKERS_RO, ...PROMPT_MARKERS_RU]) {
    it(`«${marker}» apare doar în blocul lui`, () => {
      const purtatoare = [...corpuri.entries()]
        .filter(([, corp]) => corp.includes(marker))
        .map(([nume]) => nume);
      // Zero e legitim: unii markeri sunt doar-detectare (text scris de om în
      // dashboard, fără bloc în cod). Doi sau mai mulți înseamnă citat străin.
      expect(purtatoare.length).toBeLessThanOrEqual(1);
    });
  }
});
