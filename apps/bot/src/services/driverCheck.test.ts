/**
 * Parsarea răspunsului modelului la poza șoferului (spec peron-app-driver-verdict, S01):
 * cadrul încălțăminte → cap, cele trei verdicte, descrierea compusă. Fără model, fără rețea.
 */
import { describe, expect, it } from 'vitest';
import { config } from '../config.js';
import { DRIVER_FRAME_HINT, DRIVER_SYSTEM_PROMPT, describeDriverVerdicts, parseDriverAnswer } from './driverCheck.js';

const full = (o: Partial<Record<string, unknown>> = {}) =>
  JSON.stringify({ cadru_complet: true, persoana_vizibila: true, uniforma: true, barbierit: true, aspect_ingrijit: true, descriere: 'Cămașă albă TRANSLUX, pantofi negri, bărbierit.', ...o });

describe('parseDriverAnswer', () => {
  it('cadru complet → OK cu cele trei verdicte și descrierea «uniformă · bărbierit · aspect · …»', () => {
    expect(parseDriverAnswer(full({ uniforma: false }))).toEqual({
      verdict: 'OK',
      frameOk: true,
      personVisible: true,
      uniformOk: false,
      shavedOk: true,
      groomedOk: true,
      description: 'uniformă: nu · bărbierit: da · aspect: da · Cămașă albă TRANSLUX, pantofi negri, bărbierit.',
    });
    expect(parseDriverAnswer(full({ barbierit: false, aspect_ingrijit: false, descriere: '  Tricou, nebărbierit.  ' }))).toMatchObject({
      shavedOk: false,
      groomedOk: false,
      description: 'uniformă: da · bărbierit: nu · aspect: nu · Tricou, nebărbierit.',
    });
    expect(parseDriverAnswer(full({ descriere: '' })).description).toBe('uniformă: da · bărbierit: da · aspect: da');
  });

  it('cadru_complet=false → frameOk false, verdictele false, descrierea brută (ce lipsește)', () => {
    expect(parseDriverAnswer(full({ cadru_complet: false, descriere: 'Nu se vede încălțămintea.' }))).toEqual({
      verdict: 'OK',
      frameOk: false,
      personVisible: true,
      uniformOk: false,
      shavedOk: false,
      groomedOk: false,
      description: 'Nu se vede încălțămintea.',
    });
  });

  it('persoana_vizibila=false → frameOk false chiar dacă modelul a zis cadru_complet=true', () => {
    expect(parseDriverAnswer(full({ persoana_vizibila: false, cadru_complet: true, descriere: 'Nimeni în cadru.' }))).toEqual({
      verdict: 'OK',
      frameOk: false,
      personVisible: false,
      uniformOk: false,
      shavedOk: false,
      groomedOk: false,
      description: 'Nimeni în cadru.',
    });
  });

  it('câmp lipsă / tip greșit / JSON stricat / nu obiect → EROARE', () => {
    for (const k of ['cadru_complet', 'persoana_vizibila', 'uniforma', 'barbierit', 'aspect_ingrijit'] as const) {
      const o = JSON.parse(full()) as Record<string, unknown>;
      delete o[k];
      expect(parseDriverAnswer(JSON.stringify(o)), `fără ${k}`).toMatchObject({ verdict: 'EROARE', description: `Răspunsul modelului nu are câmpul ${k}.` });
      expect(parseDriverAnswer(full({ [k]: 'da' })).verdict, `${k} text`).toBe('EROARE');
    }
    expect(parseDriverAnswer(full({ descriere: 42 }))).toMatchObject({ verdict: 'EROARE', description: 'Răspunsul modelului nu are descrierea.' });
    expect(parseDriverAnswer('nu e json').verdict).toBe('EROARE');
    expect(parseDriverAnswer('[]').verdict).toBe('EROARE');
    expect(parseDriverAnswer('null').verdict).toBe('EROARE');
  });
});

describe('describeDriverVerdicts', () => {
  it('cele trei verdicte ca text, apoi descrierea', () => {
    expect(describeDriverVerdicts({ uniformOk: true, shavedOk: false, groomedOk: true }, 'Cămașă TRANSLUX.')).toBe('uniformă: da · bărbierit: nu · aspect: da · Cămașă TRANSLUX.');
  });
  it('hint-ul cadrului spune încălțăminte și cap', () => {
    expect(DRIVER_FRAME_HINT).toContain('încălțămintea');
    expect(DRIVER_FRAME_HINT).toContain('capul');
  });
});

describe('promptul șoferului — criteriile lui Ion (interviu 09.09, spec peron-app-criteria-v2)', () => {
  it('uniforma: tricou vișiniu cu emblema TRANSLUX SAU cămașă albă/bleu uni băgată în pantaloni', () => {
    expect(config.DRIVER_UNIFORM_DESCRIPTION).toContain('tricou vișiniu');
    expect(config.DRIVER_UNIFORM_DESCRIPTION).toContain('emblema TRANSLUX');
    expect(config.DRIVER_UNIFORM_DESCRIPTION).toContain('cămașă albă');
    expect(config.DRIVER_UNIFORM_DESCRIPTION).toContain('bleu');
    expect(config.DRIVER_UNIFORM_DESCRIPTION).toContain('băgată în pantaloni');
    expect(config.DRIVER_UNIFORM_DESCRIPTION).toContain('fără carouri');
    expect(DRIVER_SYSTEM_PROMPT).toContain(config.DRIVER_UNIFORM_DESCRIPTION);
    expect(DRIVER_SYSTEM_PROMPT).toContain('SAU o cămașă albă ori bleu');
    expect(DRIVER_SYSTEM_PROMPT).toContain('băgată în pantaloni');
    expect(DRIVER_SYSTEM_PROMPT).toContain('carouri');
  });

  it('încălțăminte: fără șlapi, restul acceptat dacă e curat', () => {
    expect(DRIVER_SYSTEM_PROMPT).toContain('șlapi');
    expect(DRIVER_SYSTEM_PROMPT).toContain('flip-flops → uniforma=false');
    expect(DRIVER_SYSTEM_PROMPT).toContain('Sandale, pantofi, adidași, ghete sunt în regulă dacă sunt curate');
    expect(DRIVER_SYSTEM_PROMPT).toContain('vizibil murdară');
  });

  it('șapcă, ochelari, mască OK; cu mască barbierit=true; barbă îngrijită OK', () => {
    expect(DRIVER_SYSTEM_PROMPT).toContain('Șapca, ochelarii de soare și masca sunt în regulă');
    expect(DRIVER_SYSTEM_PROMPT).toContain('ochelari');
    expect(DRIVER_SYSTEM_PROMPT).toContain('mască și barba nu se vede, barbierit=true');
    expect(DRIVER_SYSTEM_PROMPT).toContain('barba îngrijită');
  });

  it('aspect neîngrijit = haine rupte, murdare sau pantaloni scurți; poză neclară = cadru_complet false', () => {
    expect(DRIVER_SYSTEM_PROMPT).toContain('rupte');
    expect(DRIVER_SYSTEM_PROMPT).toContain('murdare');
    expect(DRIVER_SYSTEM_PROMPT).toContain('pantaloni scurți');
    expect(DRIVER_SYSTEM_PROMPT).toContain('Culoarea pantalonilor nu contează');
    expect(DRIVER_SYSTEM_PROMPT).toContain('contralumină');
    expect(DRIVER_SYSTEM_PROMPT).toContain('mișcată');
    expect(DRIVER_SYSTEM_PROMPT).toContain('o dată pe zi');
  });
});
