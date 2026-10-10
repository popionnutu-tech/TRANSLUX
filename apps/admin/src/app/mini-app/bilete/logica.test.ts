import { describe, expect, it } from 'vitest';
// Logica mini app-ului e un modul ES static (servit din public/), fără DOM — se testează în node.
import {
  adaugaInCoada, alegeCursa, alegeCursaDinOra, alegeVizualizare, aplicaRezultate, clasificaLocal, confirmaGrupLocal, confirmaLocal, coduriGrup,
  contoare, etichetaZi, formatTelefon, grupeazaPeOpriri, hartaLocuri, limbaInitiala, listaVeche, locuriText, minuteDinOra,
  momentChisinau, normalizeazaCod, numeFamilie, ordineOpriri, randuriLocuri, scoateDinCoada, sensRuta, telHref, textBanda,
  titluRuta, urmatoareaCursa, verdictDinServer,
} from '../../../../public/mini-app/bilete/logica.js';

type Bilet = { cod_qr: string; nr: number; loc_nr: number | null; status: string; urcat_at?: string };
type Pasager = { comanda: string; nume: string; telefon: string; de_la_order: number; de_la: string; pana_la: string; locuri: number; bilete: Bilet[]; neprezentat?: boolean };
type Cursa = { cheie: string; crm_route_id: number; going_north: boolean; ruta: string; plecare: string; sosire: string; opriri: Array<{ stop_order: number; nume: string; ora: string }>; pasageri: Pasager[]; capacitate: number };

const B = (cod: string, loc: number | null, status = 'valid', urcat_at?: string): Bilet => ({ cod_qr: cod, nr: 1, loc_nr: loc, status, urcat_at });
const P = (id: string, nume: string, order: number, de_la: string, bilete: Bilet[], extra: Partial<Pasager> = {}): Pasager => ({
  comanda: id, nume, telefon: '37369123456', de_la_order: order, de_la, pana_la: 'Briceni', locuri: bilete.length, bilete, ...extra,
});

const TUR: Cursa = {
  cheie: '2026-10-05|7|false', crm_route_id: 7, going_north: false, ruta: 'Briceni – Chișinău', plecare: '06:00', sosire: '10:20',
  opriri: [{ stop_order: 1, nume: 'Briceni', ora: '06:00' }, { stop_order: 2, nume: 'Edineț', ora: '06:40' }, { stop_order: 5, nume: 'Chișinău', ora: '10:20' }],
  pasageri: [P('n1', 'Svetlana Moraru', 1, 'Briceni', [B('N1', 2, 'urcat', '2026-10-05T05:52:00+03:00'), B('N2', 3, 'urcat', '2026-10-05T05:52:20+03:00')])],
  capacitate: 20,
};
const RETUR: Cursa = {
  cheie: '2026-10-05|7|true', crm_route_id: 7, going_north: true, ruta: 'Chișinău – Briceni', plecare: '14:00', sosire: '18:20',
  opriri: [{ stop_order: 1, nume: 'Chișinău', ora: '14:00' }, { stop_order: 2, nume: 'Orhei', ora: '14:45' }, { stop_order: 3, nume: 'Bălți', ora: '16:30' }],
  pasageri: [
    P('p5', 'Natalia Cojocaru', 3, 'Bălți', [B('C1', 8), B('C2', 9), B('C3', 10)]),
    P('p1', 'Elena Rusu', 1, 'Chișinău', [B('R1', 1), B('R2', 2)], { pana_la: 'Edineț' }),
    P('p3', 'Maria Popa', 1, 'Chișinău', [B('M1', 4, 'urcat', '2026-10-05T13:58:00+03:00')]),
    P('p2', 'Victor Ceban', 1, 'Chișinău', [B('V1', 3)]),
    P('p4', 'Andrei Lungu', 2, 'Orhei', [B('L1', 5)]),
    P('p7', 'Fără Loc', 2, 'Orhei', [B('F1', null)]),
    P('p8', 'Anulat Om', 2, 'Orhei', [B('A1', 6, 'anulat')]),
  ],
  capacitate: 20,
};
const DATE = { sofer: { id: 's', nume: 'Munteanu Vasile' }, zi: '2026-10-05', curse: [TUR, RETUR], curenta: RETUR.cheie, motiv_curenta: 'orar', maine: [{ ...TUR, cheie: '2026-10-06|7|false' }] };
const la = (hhmm: string, zi = '2026-10-05') => `${zi}T${hhmm}:00+03:00`;

describe('timp', () => {
  it('minuteDinOra și momentChisinau', () => {
    expect(minuteDinOra('06:00')).toBe(360);
    expect(minuteDinOra('6:05')).toBe(365);
    expect(minuteDinOra('25:00')).toBeNull();
    expect(minuteDinOra(undefined)).toBeNull();
    expect(momentChisinau('2026-10-05T11:05:00+03:00')).toEqual({ zi: '2026-10-05', minute: 665, ora: '11:05' });
    // UTC → ora Chișinăului (vara +3)
    expect(momentChisinau('2026-10-05T22:30:00Z')?.ora).toBe('01:30');
    expect(momentChisinau('2026-10-05T22:30:00Z')?.zi).toBe('2026-10-06');
  });
  it('listaVeche: peste 5 minute sau necunoscută', () => {
    expect(listaVeche(la('14:00'), la('14:04'))).toBe(false);
    expect(listaVeche(la('14:00'), la('14:06'))).toBe(true);
    expect(listaVeche(null, la('14:06'))).toBe(true);
  });
});

describe('cursa curentă (C1)', () => {
  const curse = [TUR, RETUR];
  it('intervalul [plecare−60, sosire+30] conține ora', () => {
    expect(alegeCursaDinOra(curse, 5 * 60 + 10)).toBe(TUR.cheie); // 05:10
    expect(alegeCursaDinOra(curse, 10 * 60 + 40)).toBe(TUR.cheie); // 10:40 (sosire 10:20 + 20)
    expect(alegeCursaDinOra(curse, 13 * 60 + 30)).toBe(RETUR.cheie); // 13:30
  });
  it('între curse → următoarea plecare; după toate → ultima', () => {
    expect(alegeCursaDinOra(curse, 12 * 60)).toBe(RETUR.cheie); // 12:00
    expect(alegeCursaDinOra(curse, 23 * 60)).toBe(RETUR.cheie); // 23:00
    expect(alegeCursaDinOra(curse, 3 * 60)).toBe(TUR.cheie); // 03:00 → prima plecare
  });
  it('la suprapunere câștigă plecarea cea mai apropiată', () => {
    const a = { ...TUR, cheie: 'a', plecare: '14:00', sosire: '18:00' };
    const b = { ...TUR, cheie: 'b', plecare: '14:30', sosire: '18:30' };
    expect(alegeCursaDinOra([a, b], 14 * 60 + 20)).toBe('b');
    expect(alegeCursaDinOra([a, b], 14 * 60 + 10)).toBe('a');
  });
  it('sosirea după miezul nopții nu rupe intervalul', () => {
    const n = { ...TUR, cheie: 'n', plecare: '22:00', sosire: '01:30' };
    expect(alegeCursaDinOra([n], 23 * 60 + 50)).toBe('n');
  });
  it('alegeCursa: serverul când lista e proaspătă, C1 local când e veche', () => {
    expect(alegeCursa(DATE, la('07:00'), la('06:58'))?.cheie).toBe(RETUR.cheie); // proaspătă → curenta din server
    expect(alegeCursa(DATE, la('07:00'), la('06:30'))?.cheie).toBe(TUR.cheie); // veche → C1 la 07:00
    expect(alegeCursa({ ...DATE, motiv_curenta: 'gps' }, la('07:00'), la('06:30'))?.cheie).toBe(RETUR.cheie); // GPS bate
    expect(alegeCursa({ ...DATE, curenta: 'nu-exista' }, la('07:00'), la('06:58'))?.cheie).toBe(TUR.cheie);
    expect(alegeCursa({ ...DATE, curse: [] }, la('07:00'), null)).toBeNull();
    // altă zi decât lista (cache de ieri): rămâne a serverului
    expect(alegeCursa({ ...DATE }, la('07:00', '2026-10-06'), la('06:30'))?.cheie).toBe(RETUR.cheie);
  });
  it('urmatoareaCursa: azi după curentă, apoi mâine, apoi nimic', () => {
    expect(urmatoareaCursa(DATE, TUR)).toEqual({ cursa: RETUR, maine: false });
    const u = urmatoareaCursa(DATE, RETUR);
    expect(u?.maine).toBe(true); expect(u?.cursa.plecare).toBe('06:00');
    expect(urmatoareaCursa({ ...DATE, maine: [] }, RETUR)).toBeNull();
  });
});

describe('vizualizarea', () => {
  it('tur mereu lista; retur locuri până la plecare + 10 min', () => {
    expect(alegeVizualizare(TUR, la('05:30'))).toBe('lista');
    expect(alegeVizualizare(RETUR, la('13:20'))).toBe('locuri');
    expect(alegeVizualizare(RETUR, la('14:10'))).toBe('locuri');
    expect(alegeVizualizare(RETUR, la('14:11'))).toBe('lista');
    expect(alegeVizualizare(null, la('14:00'))).toBe('lista');
  });
});

describe('lista pe opriri', () => {
  it('grupează în ordinea de mers, scoate urcații și anulații, arată parțialul', () => {
    const { grupe, neprezentati } = grupeazaPeOpriri(RETUR, { urcate: { R1: { la: la('13:59'), sincronizat: false } } });
    expect(grupe.map((g) => g.oprire)).toEqual(['Chișinău', 'Orhei', 'Bălți']);
    expect(grupe[0].ora).toBe('14:00');
    expect(grupe[0].items.map((p: { nume: string }) => p.nume)).toEqual(['Elena Rusu', 'Victor Ceban']); // Popa urcată → dispare
    expect(grupe[0].n).toBe(2); // Rusu 1 rămas + Ceban 1
    expect(grupe[0].items[0]).toMatchObject({ deUrcat: 1, total: 2, partial: { urcate: 1, total: 2 }, nesincronizate: 1 });
    expect(grupe[1].items.map((p: { nume: string }) => p.nume)).toEqual(['Andrei Lungu', 'Fără Loc']); // anulatul lipsește
    expect(grupe[2].n).toBe(3);
    expect(neprezentati).toEqual([]);
  });
  it('neprezentații ies din grupe', () => {
    const c = { ...RETUR, pasageri: [{ ...RETUR.pasageri[4], neprezentat: true }, RETUR.pasageri[3]] };
    const r = grupeazaPeOpriri(c, {});
    expect(r.grupe.map((g) => g.oprire)).toEqual(['Chișinău']);
    expect(r.neprezentati.map((p) => p.nume)).toEqual(['Andrei Lungu']);
    expect(contoare(c, {})).toEqual({ deUrcat: 1, urcati: 0, neprezentati: 1 });
  });
  it('ordineOpriri: după oră când există (retur cu stop_order inversat)', () => {
    const inv = [{ stop_order: 6, nume: 'Briceni', ora: '18:20' }, { stop_order: 1, nume: 'Chișinău', ora: '14:00' }];
    expect(ordineOpriri(inv, '14:00').map((s) => s.nume)).toEqual(['Chișinău', 'Briceni']);
    expect(ordineOpriri(inv).map((s) => s.nume)).toEqual(['Chișinău', 'Briceni']);
    // cursă de noapte: oprirea de la 00:30 vine după cea de la 23:00
    expect(ordineOpriri([{ stop_order: 1, nume: 'X', ora: '00:30' }, { stop_order: 2, nume: 'Y', ora: '23:00' }], '22:00').map((s) => s.nume)).toEqual(['Y', 'X']);
    expect(ordineOpriri([{ stop_order: 2, nume: 'B' }, { stop_order: 1, nume: 'A' }]).map((s) => s.nume)).toEqual(['B', 'A']);
  });
  it('contoare în locuri', () => {
    expect(contoare(RETUR, {})).toEqual({ deUrcat: 8, urcati: 1, neprezentati: 0 });
    expect(contoare(RETUR, { urcate: { R1: { la: la('13:59'), sincronizat: true } } })).toEqual({ deUrcat: 7, urcati: 2, neprezentati: 0 });
    expect(contoare(TUR, {})).toEqual({ deUrcat: 0, urcati: 2, neprezentati: 0 });
  });
});

describe('harta locurilor', () => {
  it('stări și contoare (online = toate, libere = capacitate − online, fără loc separat)', () => {
    const h = hartaLocuri(RETUR, {});
    expect(h.capacitate).toBe(20);
    expect(h.locuri[0]).toEqual({ nr: 1, stare: 'online', nume: 'Rusu' });
    expect(h.locuri[3]).toEqual({ nr: 4, stare: 'urcat', nume: 'Popa' });
    expect(h.locuri[5].stare).toBe('liber'); // anulatul nu ocupă
    expect(h.locuri[9]).toEqual({ nr: 10, stare: 'online', nume: 'Cojocaru' });
    expect(h.online).toBe(9); expect(h.urcati).toBe(1); expect(h.libere).toBe(11); expect(h.faraLoc).toBe(1);
  });
  it('confirmarea locală colorează verde', () => {
    const h = hartaLocuri(RETUR, { urcate: { V1: { la: la('14:01'), sincronizat: false } } });
    expect(h.locuri[2].stare).toBe('urcat'); expect(h.urcati).toBe(2);
  });
  it('randuriLocuri: 1 + 5×3 + 4', () => {
    const r = randuriLocuri(hartaLocuri(RETUR, {}).locuri);
    expect(r).toHaveLength(7);
    expect(r[0].locuri.map((l) => l?.nr)).toEqual([1]);
    expect(r[1].locuri.map((l) => l?.nr)).toEqual([2, 3, 4]);
    expect(r[5].locuri.map((l) => l?.nr)).toEqual([14, 15, 16]);
    expect(r[6].locuri.map((l) => l?.nr)).toEqual([17, 18, 19, 20]);
  });
  it('numeFamilie: ultimul cuvânt', () => {
    expect(numeFamilie('Elena Rusu')).toBe('Rusu');
    expect(numeFamilie('  Ion  ')).toBe('Ion');
    expect(numeFamilie('')).toBe('');
  });
});

describe('matricea verdictelor (C3)', () => {
  it('cod în listă valid → ok; urcat → deja_urcat cu ora; anulat → anulat', () => {
    expect(clasificaLocal(RETUR, {}, 'R1', true)).toMatchObject({ verdict: 'ok', pasager: { nume: 'Elena Rusu' } });
    expect(clasificaLocal(RETUR, {}, 'M1', true)).toMatchObject({ verdict: 'deja_urcat', urcat_at: '2026-10-05T13:58:00+03:00' });
    expect(clasificaLocal(RETUR, { urcate: { R1: { la: la('14:01'), sincronizat: false } } }, 'R1', false)).toMatchObject({ verdict: 'deja_urcat', urcat_at: la('14:01') });
    expect(clasificaLocal(RETUR, {}, 'A1', true).verdict).toBe('anulat');
  });
  it('cod lipsă: online → verifica (serverul decide), offline → neconfirmat (portocaliu, urcă)', () => {
    expect(clasificaLocal(RETUR, {}, 'XYZ', true).verdict).toBe('verifica');
    expect(clasificaLocal(RETUR, {}, 'XYZ', false).verdict).toBe('neconfirmat');
    expect(clasificaLocal(RETUR, {}, '', true).verdict).toBe('verifica');
  });
  it('verdictDinServer', () => {
    expect(verdictDinServer({ rezultat: 'ok' })).toBe('ok');
    expect(verdictDinServer({ rezultat: 'alta_cursa' })).toBe('alta_cursa');
    expect(verdictDinServer({ rezultat: 'ceva' })).toBe('necunoscut');
    expect(verdictDinServer(undefined)).toBe('necunoscut');
  });
  it('normalizeazaCod: cod gol, link de bilet, spații', () => {
    expect(normalizeazaCod(' 7k2m9qxart4p8wzd1001 ')).toBe('7K2M9QXART4P8WZD1001');
    expect(normalizeazaCod('https://translux.md/ro/bilet/7K2M9QXART4P8WZD1001?x=1')).toBe('7K2M9QXART4P8WZD1001');
    expect(normalizeazaCod('')).toBe('');
  });
});

describe('sincronizarea', () => {
  // Un cod QR = toată comanda (Ion, 10.10.2026: «1 QR cod pentru mai mulți»).
  it('o scanare confirmă local toată comanda; locurile urcate sau anulate nu se ating', () => {
    const cursa = JSON.parse(JSON.stringify(RETUR)) as Cursa;
    const nat = cursa.pasageri[0];
    expect(coduriGrup(nat, { urcate: {} }, 'C2')).toEqual(['C2', 'C1', 'C3']);
    const st = confirmaGrupLocal({ urcate: {} }, nat, 'C2', la('14:01'));
    expect(Object.keys(st.urcate).sort()).toEqual(['C1', 'C2', 'C3']);
    expect(clasificaLocal(cursa, st, 'C3', true).verdict).toBe('deja_urcat');
    nat.bilete[2].status = 'anulat';
    expect(coduriGrup(nat, { urcate: {} }, 'C1')).toEqual(['C1', 'C2']);
  });
  it('ok de la server pe un cod → toată comanda urcată și sincronizată', () => {
    const cursa = JSON.parse(JSON.stringify(RETUR)) as Cursa;
    const local = confirmaGrupLocal({ urcate: {} }, cursa.pasageri[0], 'C1', la('14:01'));
    const r = aplicaRezultate(local, cursa, [{ cod: 'C1', rezultat: 'ok', urcat_at: la('14:01') }], []);
    expect(cursa.pasageri[0].bilete.map((b) => b.status)).toEqual(['urcat', 'urcat', 'urcat']);
    expect(['C1', 'C2', 'C3'].every((c) => r.local.urcate[c]?.sincronizat === true)).toBe(true);
  });
  it('codul respins de server → cad și locurile grupului confirmate odată cu el', () => {
    const cursa = JSON.parse(JSON.stringify(RETUR)) as Cursa;
    const local = confirmaGrupLocal({ urcate: {} }, cursa.pasageri[0], 'C1', la('14:01'));
    const r = aplicaRezultate(local, cursa, [{ cod: 'C1', rezultat: 'deja_urcat', urcat_de_altul: true, urcat_at: la('13:59') }], []);
    expect(r.local.urcate).toEqual({});
    expect(r.alerte).toHaveLength(1);
  });
  it('confirmaLocal nu mută starea', () => {
    const s0 = { urcate: {} };
    const s1 = confirmaLocal(s0, 'R1', la('14:01'));
    expect(s0.urcate).toEqual({});
    expect(s1.urcate.R1).toEqual({ la: la('14:01'), sincronizat: false });
  });
  it('ok de la server → sincronizat și biletul devine urcat în lista descărcată', () => {
    const cursa = JSON.parse(JSON.stringify(RETUR)) as Cursa;
    const local = confirmaLocal({ urcate: {} }, 'R1', la('14:01'));
    const r = aplicaRezultate(local, cursa, [{ cod: 'R1', rezultat: 'ok', urcat_at: la('14:01') }], []);
    expect(r.alerte).toEqual([]);
    expect(r.local.urcate.R1.sincronizat).toBe(true);
    expect(cursa.pasageri[1].bilete[0].status).toBe('urcat');
  });
  it('portocaliul respins după → alertă persistentă; codul iese din confirmările locale', () => {
    const cursa = JSON.parse(JSON.stringify(RETUR)) as Cursa;
    const coada = adaugaInCoada([], { cod: 'XYZ', moment_client: la('14:02'), offline: true });
    const r = aplicaRezultate({ urcate: {} }, cursa, [{ cod: 'XYZ', rezultat: 'necunoscut' }], coada);
    expect(r.alerte).toEqual([{ cod: 'XYZ', verdict: 'necunoscut', nume: '', cursa_bilet: '', urcat_at: null, urcat_de_altul: false }]);
    expect(scoateDinCoada(coada, [{ cod: 'XYZ' }])).toEqual([]);
  });
  it('verde local pierdut la sincronizare (urcat în cealaltă mașină) → alertă cu numele', () => {
    const cursa = JSON.parse(JSON.stringify(RETUR)) as Cursa;
    const local = confirmaLocal({ urcate: {} }, 'V1', la('14:01'));
    const r = aplicaRezultate(local, cursa, [{ cod: 'V1', rezultat: 'deja_urcat', urcat_de_altul: true, urcat_at: la('13:59') }], []);
    expect(r.local.urcate.V1).toBeUndefined();
    expect(r.alerte[0]).toMatchObject({ cod: 'V1', verdict: 'deja_urcat', nume: 'Victor Ceban', urcat_de_altul: true });
  });
  it('răspuns la un cod străin de telefon (nici local, nici în coadă) nu face alertă', () => {
    const r = aplicaRezultate({ urcate: {} }, JSON.parse(JSON.stringify(RETUR)), [{ cod: 'Q', rezultat: 'necunoscut' }], []);
    expect(r.alerte).toEqual([]);
  });
  it('coada fără dubluri pe cod', () => {
    const c = adaugaInCoada(adaugaInCoada([], { cod: 'A', moment_client: '1', offline: false }), { cod: 'A', moment_client: '2', offline: true });
    expect(c).toEqual([{ cod: 'A', moment_client: '2', offline: true }]);
  });
});

describe('texte', () => {
  it('formatTelefon și telHref', () => {
    expect(formatTelefon('37369123456')).toBe('+373 69 123 456');
    expect(formatTelefon('+373 69 123 456')).toBe('+373 69 123 456');
    expect(formatTelefon('69123456')).toBe('+373 69 123 456');
    expect(formatTelefon('')).toBe('');
    expect(telHref('37369123456')).toBe('tel:+37369123456');
    expect(telHref('69123456')).toBe('tel:+37369123456');
  });
  it('etichetaZi RO/RU', () => {
    expect(etichetaZi('2026-10-05', 'ro')).toBe('luni, 5 oct.');
    expect(etichetaZi('2026-10-05', 'ru')).toBe('пн, 5 окт.');
  });
  it('sensRuta și titluRuta', () => {
    expect(sensRuta('Chișinău – Briceni')).toBe('Chișinău → Briceni');
    expect(titluRuta([TUR, RETUR])).toBe('Briceni – Chișinău – Briceni');
    expect(titluRuta([RETUR])).toBe('Chișinău – Briceni');
    expect(titluRuta([])).toBe('');
  });
  it('limbaInitiala și locuriText', () => {
    expect(limbaInitiala(null, 'ru')).toBe('ru');
    expect(limbaInitiala(null, 'ro')).toBe('ro');
    expect(limbaInitiala('ro', 'ru')).toBe('ro');
    expect(limbaInitiala(null, undefined)).toBe('ro');
    expect(locuriText(1, 'ro')).toBe('1 loc'); expect(locuriText(3, 'ro')).toBe('3 locuri');
    expect(locuriText(1, 'ru')).toBe('1 место'); expect(locuriText(3, 'ru')).toBe('3 места'); expect(locuriText(11, 'ru')).toBe('11 мест');
  });
  it('textBanda pe fiecare verdict', () => {
    expect(textBanda('ok', { nume: 'Elena Rusu', ramase: 1, total: 2 }, 'ro')).toEqual({ fel: 'ok', titlu: 'Urcă', sub: 'Elena Rusu · 1 loc confirmat · mai scanează 1' });
    expect(textBanda('ok', { nume: 'Elena Rusu', ramase: 0, total: 2 }, 'ro').sub).toBe('Elena Rusu · 2 din 2 locuri · gata');
    expect(textBanda('ok', { nume: 'Victor Ceban', ramase: 0, total: 1 }, 'ru').sub).toBe('Victor Ceban · 1 место');
    expect(textBanda('neconfirmat', {}, 'ro').fel).toBe('warn');
    expect(textBanda('deja_urcat', { nume: 'Maria Popa', urcat_at: '2026-10-05T13:58:00+03:00' }, 'ro').sub).toBe('Maria Popa · scanat la 13:58');
    expect(textBanda('deja_urcat', { nume: 'Maria Popa', urcat_at: '2026-10-05T13:58:00+03:00', urcat_de_altul: true }, 'ro').sub).toBe('Maria Popa · urcat în cealaltă mașină la 13:58');
    expect(textBanda('alta_cursa', { cursa_bilet: 'Lipcani – Chișinău 14:50, 06.10' }, 'ro').sub).toBe('biletul e pentru Lipcani – Chișinău 14:50, 06.10');
    expect(textBanda('anulat', {}, 'ru').titlu).toBe('Не садится · билет отменён');
    expect(textBanda('necunoscut', {}, 'ro').titlu).toBe('Nu urcă · cod necunoscut');
  });
});

// ION-272 («Telegram ultrafast» P2+P3): contul din initData, cheile pe cont, cache-ul proaspăt, migrarea cheilor vechi, coada la eșec.
import { cacheProaspat, cheiCont, migreazaCheiVechi, trateazaEsecCoada, userIdDinInitData } from '../../../../public/mini-app/bilete/logica.js';

function stocareFalsa(init: Record<string, unknown>) {
  const m = new Map(Object.entries(init));
  return {
    m,
    get: (k: string) => (m.has(k) ? m.get(k) : null),
    set: (k: string, v: unknown) => { m.set(k, v); },
    del: (k: string) => { m.delete(k); },
    keys: () => [...m.keys()],
  };
}

describe('ION-272: contul și cheile localStorage pe cont', () => {
  const init = `auth_date=1&user=${encodeURIComponent(JSON.stringify({ id: 448654456, first_name: 'Ion' }))}&hash=abc`;
  it('userIdDinInitData citește user.id fără SDK; gunoi → null', () => {
    expect(userIdDinInitData(init)).toBe(448654456);
    expect(userIdDinInitData('')).toBeNull();
    expect(userIdDinInitData('user=%7Bgunoi')).toBeNull();
    expect(userIdDinInitData(`user=${encodeURIComponent('{"id":0}')}`)).toBeNull();
  });
  it('cheiCont: cu cont → prefix pe id; fără cont → cheile vechi; limba e comună', () => {
    const k = cheiCont(448654456);
    expect(k.cache).toBe('bilete-sofer:448654456:cache');
    expect(k.stare('2026-10-05|7|false')).toBe('bilete-sofer:448654456:stare:2026-10-05|7|false');
    expect(k.lang).toBe('bilete-sofer:lang');
    expect(cheiCont(null).coada).toBe('bilete-sofer:coada');
  });
  it('cacheProaspat: ≤ 12 h și cu curse → da; mai vechi sau fără curse → nu', () => {
    const acum = Date.parse('2026-10-06T12:00:00Z');
    expect(cacheProaspat({ date: { curse: [] }, descarcatLa: '2026-10-06T08:00:00Z' }, acum)).toBe(true);
    expect(cacheProaspat({ date: { curse: [] }, descarcatLa: '2026-10-05T08:00:00Z' }, acum)).toBe(false);
    expect(cacheProaspat({ date: {}, descarcatLa: '2026-10-06T08:00:00Z' }, acum)).toBe(false);
    expect(cacheProaspat(null, acum)).toBe(false);
  });
  it('migreazaCheiVechi: coada veche se ÎMBINĂ în a contului (fără dubluri), starea se copiază doar dacă lipsește, alt cont nu se atinge, limba rămâne', () => {
    const st = stocareFalsa({
      'bilete-sofer:lang': 'ru',
      'bilete-sofer:coada': [{ cod: 'A', cheie: 'c1' }, { cod: 'B', cheie: 'c1' }],
      'bilete-sofer:448654456:coada': [{ cod: 'B', cheie: 'c1' }, { cod: 'C', cheie: 'c2' }],
      'bilete-sofer:stare:c1': { urcate: { A: { la: 't' } } },
      'bilete-sofer:448654456:stare:c1': { urcate: { Z: { la: 'u' } } },
      'bilete-sofer:alerte:c1': [{ cod: 'A' }],
      'bilete-sofer:cache': { date: { curse: [] }, descarcatLa: 'x' },
      'bilete-sofer:999:cache': { date: { curse: [1] } },
    });
    const n = migreazaCheiVechi(st, 448654456);
    expect(n).toBe(4);
    expect((st.get('bilete-sofer:448654456:coada') as Array<{ cod: string }>).map((s) => s.cod)).toEqual(['B', 'C', 'A']);
    expect(st.get('bilete-sofer:448654456:stare:c1')).toEqual({ urcate: { Z: { la: 'u' } } });
    expect(st.get('bilete-sofer:448654456:alerte:c1')).toEqual([{ cod: 'A' }]);
    expect(st.get('bilete-sofer:448654456:cache')).toEqual({ date: { curse: [] }, descarcatLa: 'x' });
    expect(st.get('bilete-sofer:999:cache')).toEqual({ date: { curse: [1] } });
    expect(st.get('bilete-sofer:lang')).toBe('ru');
    expect(st.keys().filter((k) => /^bilete-sofer:(coada|stare:|alerte:|cache)/.test(k))).toEqual([]);
    expect(migreazaCheiVechi(st, null)).toBe(0);
  });
  it('trateazaEsecCoada: DOAR 403 cursa_straina scoate cheia; 401 → reauth; 429 → așteaptă Retry-After; restul păstrează tot', () => {
    const coada = [{ cod: 'A', cheie: 'c1' }, { cod: 'B', cheie: 'c2' }, { cod: 'C' }];
    const s403 = trateazaEsecCoada(403, { eroare: 'cursa_straina' }, 'c1', coada, null);
    expect(s403.actiune).toBe('scoate');
    expect(s403.coada.map((s) => s.cod)).toEqual(['B']);
    expect(s403.scoase.map((s) => s.cod)).toEqual(['A', 'C']);
    expect(trateazaEsecCoada(403, { eroare: 'altceva' }, 'c1', coada, null)).toMatchObject({ actiune: 'nimic', coada });
    expect(trateazaEsecCoada(401, null, 'c1', coada, null)).toMatchObject({ actiune: 'reauth', coada });
    expect(trateazaEsecCoada(429, null, 'c1', coada, '7')).toMatchObject({ actiune: 'asteapta', coada, asteaptaMs: 7000 });
    expect(trateazaEsecCoada(429, null, 'c1', coada, null).asteaptaMs).toBe(60_000);
    expect(trateazaEsecCoada(500, null, 'c1', coada, null)).toMatchObject({ actiune: 'nimic', coada });
    expect(trateazaEsecCoada(undefined, null, 'c1', coada, null)).toMatchObject({ actiune: 'nimic', coada });
  });
});
