import { describe, it, expect, vi, beforeEach } from 'vitest';

// Nomenclatorul tipurilor (migr. 310). Două invariante contează:
//  1) codul scris de model nu ajunge NICIODATĂ nevalidat în coloana cu cheie
//     străină — un cod inventat ar respinge tot rândul și reclamația s-ar pierde;
//  2) blocul de prompt conține exact codurile active, altfel modelul alege dintr-o
//     listă care nu mai există.
type Row = { code: string; ord: number; name_ro: string; name_ru: string; culprit: string; note: string | null; active: boolean };

let rows: Row[] = [];
let readError: { message: string } | null = null;

// `.order()` se poate înlănțui (ord, apoi code): obiectul întors e și „thenable",
// ca `await` să meargă oriunde s-ar opri lanțul.
vi.mock('../supabase', () => {
  const q: Record<string, unknown> = {};
  q.order = () => q;
  q.then = (res: (v: unknown) => unknown) => res({ data: rows, error: readError });
  return { getSupabase: () => ({ from: () => ({ select: () => q }) }) };
});

const t = (code: string, culprit = 'SOFER', active = true): Row =>
  ({ code, ord: 1, name_ro: `ro ${code}`, name_ru: `ru ${code}`, culprit, note: null, active });

import {
  complaintTypesBlockRo, complaintTypesBlockRu, spliceTypesBlock,
  TYPES_MARKER_RO, TYPES_MARKER_RU, TYPES_END, type ComplaintType,
} from './complaint-types';

// Cache-ul de proces (TTL 5 min) ar duce rândurile primului test în toate
// celelalte: fiecare test pornește cu modulul reîncărcat.
beforeEach(() => { vi.resetModules(); readError = null; });

async function proaspat() {
  return (await import('./complaint-types')) as typeof import('./complaint-types');
}

describe('resolveComplaintType', () => {
  it('acceptă codul exact din nomenclator', async () => {
    rows = [t('FUMAT'), t('ALTUL', 'NECLAR')];
    const m = await proaspat();
    expect((await m.resolveComplaintType('FUMAT'))?.code).toBe('FUMAT');
  });

  it('normalizează ce scrie modelul: litere mici, spații, ghilimele', async () => {
    rows = [t('STARE_MASINA', 'PARC'), t('ALTUL', 'NECLAR')];
    const m = await proaspat();
    expect((await m.resolveComplaintType(' stare masina '))?.code).toBe('STARE_MASINA');
  });

  it('codul necunoscut cade pe ALTUL, nu se scrie ca atare', async () => {
    rows = [t('FUMAT'), t('ALTUL', 'NECLAR')];
    const m = await proaspat();
    expect((await m.resolveComplaintType('INVENTAT_DE_MODEL'))?.code).toBe('ALTUL');
  });

  it('tipul stins nu se mai pune pe dosare noi', async () => {
    rows = [t('FUMAT', 'SOFER', false), t('ALTUL', 'NECLAR')];
    const m = await proaspat();
    expect((await m.resolveComplaintType('FUMAT'))?.code).toBe('ALTUL');
  });

  it('lipsa parametrului dă ALTUL, nu null', async () => {
    rows = [t('ALTUL', 'NECLAR')];
    const m = await proaspat();
    expect((await m.resolveComplaintType(undefined))?.code).toBe('ALTUL');
  });

  it('baza mută → null, ca dosarul să se scrie fără tip', async () => {
    rows = [];
    readError = { message: 'connection refused' };
    const m = await proaspat();
    expect(await m.resolveComplaintType('FUMAT')).toBeNull();
  });

  it('duce mai departe cine răspunde de tip', async () => {
    rows = [t('INFO_SITE', 'SITE'), t('ALTUL', 'NECLAR')];
    const m = await proaspat();
    expect((await m.resolveComplaintType('INFO_SITE'))?.culprit).toBe('SITE');
  });
});

describe('blocul de prompt', () => {
  const lista: ComplaintType[] = [
    { code: 'FUMAT', ord: 9, name_ro: 'Fumat la volan', name_ru: 'Курение за рулём', culprit: 'SOFER', note: null, active: true },
    { code: 'ALTUL', ord: 99, name_ro: 'Altceva', name_ru: 'Другое', culprit: 'NECLAR', note: null, active: true },
  ];

  it('poartă markerul, codurile și sfârșitul — reperele după care se sincronizează', () => {
    const b = complaintTypesBlockRo(lista);
    expect(b).toContain(TYPES_MARKER_RO);
    expect(b).toContain('FUMAT = Fumat la volan');
    expect(b.trimEnd().endsWith(TYPES_END)).toBe(true);
  });

  it('varianta rusă dă numele rusești sub același sfârșit', () => {
    const b = complaintTypesBlockRu(lista);
    expect(b).toContain(TYPES_MARKER_RU);
    expect(b).toContain('FUMAT = Курение за рулём');
    expect(b).toContain(TYPES_END);
  });

  it('o denumire pe două rânduri nu rupe lista', () => {
    const b = complaintTypesBlockRo([{ ...lista[0], name_ro: 'Fumat\nla volan' }, lista[1]]);
    expect(b).toContain('FUMAT = Fumat la volan');
  });
});

// Singura bucată din proiect care taie promptul viu al agentului după indici.
describe('spliceTypesBlock', () => {
  const bloc = complaintTypesBlockRo([
    { code: 'FUMAT', ord: 9, name_ro: 'Fumat la volan', name_ru: 'Курение', culprit: 'SOFER', note: null, active: true },
  ]);
  const blocNou = complaintTypesBlockRo([
    { code: 'FUMAT', ord: 9, name_ro: 'Fumat la volan', name_ru: 'Курение', culprit: 'SOFER', note: null, active: true },
    { code: 'ALTUL', ord: 99, name_ro: 'Altceva', name_ru: 'Другое', culprit: 'NECLAR', note: null, active: true },
  ]);

  it('adaugă blocul în coadă când markerul lipsește', () => {
    const r = spliceTypesBlock('PROMPT VECHI', bloc, TYPES_MARKER_RO);
    expect(r.changed).toBe(true);
    expect(r.failed).toBe(false);
    expect(r.prompt.startsWith('PROMPT VECHI')).toBe(true);
    expect(r.prompt).toContain(TYPES_MARKER_RO);
  });

  it('a doua rulare nu schimbă nimic — altfel PATCH la fiecare prognon', () => {
    const unu = spliceTypesBlock('PROMPT', bloc, TYPES_MARKER_RO);
    const doi = spliceTypesBlock(unu.prompt, bloc, TYPES_MARKER_RO);
    expect(doi.changed).toBe(false);
    expect(doi.prompt).toBe(unu.prompt);
  });

  it('înlocuiește lista veche păstrând textul din jur', () => {
    const viu = `${spliceTypesBlock('ÎNAINTE', bloc, TYPES_MARKER_RO).prompt}\n\nDUPĂ BLOC`;
    const r = spliceTypesBlock(viu, blocNou, TYPES_MARKER_RO);
    expect(r.changed).toBe(true);
    expect(r.prompt.startsWith('ÎNAINTE')).toBe(true);
    expect(r.prompt.endsWith('DUPĂ BLOC')).toBe(true);
    expect(r.prompt).toContain('ALTUL = Altceva');
    // Un singur bloc, nu două.
    expect(r.prompt.split(TYPES_MARKER_RO).length - 1).toBe(1);
    expect(r.prompt.split(TYPES_END).length - 1).toBe(1);
  });

  it('bloc rupt de mână (marker fără sfârșit) → nu atingem promptul', () => {
    const rupt = `PROMPT\n\n${TYPES_MARKER_RO}:\nFUMAT = ceva`;
    const r = spliceTypesBlock(rupt, bloc, TYPES_MARKER_RO);
    expect(r.failed).toBe(true);
    expect(r.changed).toBe(false);
    expect(r.prompt).toBe(rupt);
  });

  it('listă orfană (sfârșit fără marker) → nu adăugăm a doua listă', () => {
    const orfan = `PROMPT\nFUMAT = ceva\n${TYPES_END}`;
    const r = spliceTypesBlock(orfan, bloc, TYPES_MARKER_RO);
    expect(r.failed).toBe(true);
    expect(r.prompt).toBe(orfan);
  });
});
