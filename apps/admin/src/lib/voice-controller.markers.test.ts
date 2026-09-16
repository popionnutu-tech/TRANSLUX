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

/**
 * Ion, 16.09: «Niciodată nimeni nu va fi contactat de cineva din companie».
 *
 * Nu e o regulă de stil, e una de adevăr: până acum promptul interzicea PROMISIUNEA
 * apelului înapoi, dar OFEREA apelul în cinci locuri. Testul păzește exact asta —
 * blocul nou e livrat, iar cele cinci rânduri vechi sunt trecute la pietre de mormânt.
 */
describe('nimeni nu e contactat de companie', () => {
  const bloc = corpuri.get('NIMENI_BLOCK') ?? '';
  const blocRu = corpuri.get('NIMENI_BLOCK_RU') ?? '';

  it('blocul spune regula fără portiță', () => {
    expect(bloc).toContain('nu contactează pe nimeni, niciodată');
    expect(bloc).toContain('nu OFERI și nu SUGEREZI');
    expect(blocRu).toContain('никому и никогда не звонит первой');
  });

  it('interzice și formulările prin care s-a scurs în apeluri reale', () => {
    // «vă conectez» e din apelul conv_6801m2md81f0fk8saysqs0tr8rh9 (16.09).
    for (const fraza of ['vă conectez', 'vă fac legătura', 'am transmis mai departe', 'se ocupă cineva']) {
      expect(bloc).toContain(fraza);
    }
    expect(blocRu).toContain('соединю вас');
  });

  it('lasă tool-ul viu, dar tăcut — evidența internă nu se anunță clientului', () => {
    expect(bloc).toContain('request_callback');
    expect(bloc).toContain('evidență internă');
    expect(bloc).toContain('NICIODATĂ nu spui că ai transmis ceva');
  });

  it('spune ce face agentul în loc de apel înapoi', () => {
    // Fără o ieșire alternativă, interdicția ar lăsa apelul în aer.
    expect(bloc).toContain('recauți cu alt nume de localitate');
    expect(bloc).toContain('numărul șoferului');
  });

  it('blocul vechi, care încă oferea apelul, nu se mai livrează', () => {
    // Redenumit în …_OBSOLETE: dacă cineva îl repune în HEALABLE, testul cade.
    expect(sursa).not.toMatch(/block:\s*CALLBACK_ORDER_BLOCK/);
    expect(corpuri.has('CALLBACK_ORDER_BLOCK')).toBe(false);
  });

  it('cele cinci rânduri vechi sunt trecute la pietre de mormânt', () => {
    const obsolete = sursa.slice(sursa.indexOf('const OBSOLETE_BLOCKS = ['));
    for (const nume of [
      'CALLBACK_ORDER_OBSOLETE',
      'CALLBACK_RUTARE_OBSOLETE',
      'CALLBACK_REGULA_OM_OBSOLETE',
      'CALLBACK_REGULA_INFO_OBSOLETE',
      'CALLBACK_RECLAMATII_OBSOLETE',
    ]) {
      expect(obsolete).toContain(`  ${nume},`);
    }
  });

  it('reperul nou e în lista de repere, cel vechi a ieșit', () => {
    expect(PROMPT_MARKERS_RO).toContain('NIMENI NU SUNĂ ÎNAPOI — NICIODATĂ, IAR «AM NOTAT» NU E O PROMISIUNE');
    expect(PROMPT_MARKERS_RO).not.toContain('APEL ÎNAPOI — NICIO PROMISIUNE');
    expect(PROMPT_MARKERS_RU).toContain('НИКТО НЕ ПЕРЕЗВАНИВАЕТ — НИКОГДА, А «ЗАПИСАЛА» — НЕ ОБЕЩАНИЕ');
  });
});

describe('«am notat» nu se ceartă cu secțiunile ANGAJARE și SUGESTII', () => {
  const bloc = corpuri.get('NIMENI_BLOCK') ?? '';

  it('permite confirmarea scurtă acolo unde promptul o cere, fără urmări promise', () => {
    expect(bloc).toContain('La ANGAJARE și la o PROPUNERE poți confirma scurt că ai notat-o');
    expect(bloc).toContain('fără nicio urmare promisă');
  });

  it('dar interzice «am notat» ca ieșire dintr-o discuție fără răspuns', () => {
    expect(bloc).toContain('nu se folosește ca să închizi o discuție');
  });

  it('v1, livrat și retras în aceeași zi, e piatră de mormânt pe amândoi agenții', () => {
    const obsolete = sursa.slice(sursa.indexOf('const OBSOLETE_BLOCKS = ['));
    expect(obsolete).toContain('  NIMENI_OBSOLETE_V1,');
    expect(sursa).toContain('healed.replace(NIMENI_OBSOLETE_V1_RU');
  });
});
