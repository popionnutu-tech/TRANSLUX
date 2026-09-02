import { describe, it, expect } from 'vitest';
import { formatComplaintForGroup, formatLostItemForGroup, formatComplaintRetraction } from './drivers-group';

// Grupa șoferilor (Ion, 02.09). Mesajele le citesc douăzeci de oameni, deci
// contează exact două lucruri: să nu apară acolo ce n-are voie (telefonul
// clientului) și să se vadă că acuzația e încă necercetată.

const bazaReclamatie = {
  driver_name: 'Burlacu Iurii',
  plate: 'ANT344',
  identified: true,
  route: 'Bălți – Criva',
  departure: '01:30',
  trip_date: '2026-09-02',
  complaint: 'a fumat tot drumul',
  type_name: 'Fumat la volan',
  evidence: 'plate' as const,
};

describe('formatComplaintForGroup', () => {
  it('numește omul și mașina — decizia lui Ion', () => {
    const t = formatComplaintForGroup(bazaReclamatie);
    expect(t).toContain('Burlacu Iurii · ANT344');
    expect(t).toContain('Bălți – Criva · 01:30 · 2026-09-02');
    expect(t).toContain('Fumat la volan');
  });

  it('spune cine a verificat și CE anume — cursa și șoferul, nu acuzația', () => {
    // Ion (02.09): «reclamatiile sunt verificat de ai call centru intodeauna».
    // «Neverificată» a fost scos la cererea lui. Complementul e obligatoriu:
    // fără el, rândul afirma că ACUZAȚIA e confirmată (review 02.09).
    expect(formatComplaintForGroup(bazaReclamatie)).toContain('Verificată de call-centrul AI: cursa și șoferul');
    expect(formatComplaintForGroup(bazaReclamatie)).not.toContain('neverificată');
    // Fără șofer identificat nu s-a verificat nimic — ștampila nu apare.
    expect(formatComplaintForGroup({ ...bazaReclamatie, identified: false }))
      .not.toContain('Verificată');
  });

  it('fără șofer identificat cere ajutorul grupei, nu numește pe nimeni', () => {
    const t = formatComplaintForGroup({ ...bazaReclamatie, identified: false, driver_name: null, plate: null });
    expect(t).toContain('Șofer neidentificat');
    expect(t).toContain('Bălți – Criva');
    expect(t).not.toContain('Burlacu');
  });

  it('corectarea se distinge de primul mesaj', () => {
    // Clientul a dat altă plăcuță: în grupă rămăsese numit un om nevinovat.
    expect(formatComplaintForGroup(bazaReclamatie, true)).toContain('CORECTARE');
    expect(formatComplaintForGroup(bazaReclamatie)).not.toContain('CORECTARE');
  });

  it('escapează textul venit de la client prin model', () => {
    const t = formatComplaintForGroup({ ...bazaReclamatie, complaint: '<b>x</b>' });
    expect(t).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(t).not.toContain('<b>x</b>');
  });

  it('ascunde numerele din textul reclamației — grupa nu e locul telefonului clientului', () => {
    // Textul îl scrie modelul din povestea clientului, deci poate căra numărul
    // lui înăuntru. Adminii îl primesc întreg; grupa, nu.
    const t = formatComplaintForGroup({ ...bazaReclamatie, complaint: 'sunați-mă la 069 123 456, am plătit dublu' });
    expect(t).not.toContain('069 123 456');
    expect(t).toContain('[număr ascuns]');
    expect(t).toContain('am plătit dublu');
  });

  it('taie textul lung — peste limita Telegram mesajul s-ar pierde întreg', () => {
    const t = formatComplaintForGroup({ ...bazaReclamatie, complaint: 'x'.repeat(1000) });
    expect(t.length).toBeLessThan(700);
    expect(t).toContain('…');
  });

  it('spune pe ce se sprijină acuzația — orarul e public, numele nu e o probă', () => {
    // 78,8% din perechile rută+zi au un singur șofer. Fără rândul ăsta, o
    // acuzație scoasă din orar arată în grupă identic cu una probată de client.
    const dinOrar = formatComplaintForGroup({ ...bazaReclamatie, evidence: 'trip_only' });
    expect(dinOrar).toContain('NU a dat nici mașina, nici numele');
    expect(formatComplaintForGroup(bazaReclamatie)).toContain('a dat numărul mașinii');
    expect(formatComplaintForGroup({ ...bazaReclamatie, evidence: 'name' })).toContain('a dat numele șoferului');
    // Fără om numit, temeiul n-are ce sprijini.
    expect(formatComplaintForGroup({ ...bazaReclamatie, identified: false, evidence: 'trip_only' }))
      .not.toContain('dedusă din orar');
  });

  it('corectarea îl disculpă pe cel numit înainte', () => {
    const t = formatComplaintForGroup(
      { ...bazaReclamatie, driver_name: 'Vasile Rusu', plate: 'BNQ085' },
      true,
      { driver_name: 'Burlacu Iurii', plate: 'ANT344' },
    );
    expect(t).toContain('Nu mai e vorba de Burlacu Iurii · ANT344');
    expect(t).toContain('Vasile Rusu · BNQ085');
  });

  it('ascunde numărul și când clientul îl dictează cu alte separatoare', () => {
    for (const scris of ['069/12/34/56', '069:12:34:56', '069_123_456', '069.123.456']) {
      const t = formatComplaintForGroup({ ...bazaReclamatie, complaint: `sunați la ${scris}` });
      expect(t, scris).toContain('[număr ascuns]');
    }
  });

  it('redactează și ruta scrisă de model, nu doar textul reclamației', () => {
    const t = formatComplaintForGroup({ ...bazaReclamatie, route: 'Bălți – 069 123 456' });
    expect(t).not.toContain('069 123 456');
  });

  it('un dosar identificat dar fără nume și fără plăcuță nu minte că știe cine e', () => {
    const t = formatComplaintForGroup({ ...bazaReclamatie, driver_name: null, plate: null });
    expect(t).toContain('Șofer neidentificat');
  });
});

describe('formatComplaintRetraction', () => {
  it('retrage acuzația când tipul iese de sub șofer', () => {
    // Altfel în chat rămâne numit un om pentru ceva de care nu răspunde.
    const t = formatComplaintRetraction({
      driver_name: 'Burlacu Iurii', plate: 'ANT344', identified: true,
      route: 'Bălți – Criva', departure: '01:30', trip_date: '2026-09-02',
    }, 'Starea mașinii (scaune, curățenie)');
    expect(t).toContain('RETRASĂ');
    expect(t).toContain('Burlacu Iurii · ANT344');
    expect(t).toContain('Starea mașinii');
    expect(t).toContain('nu ține de șofer');
  });
});

describe('formatLostItemForGroup', () => {
  const bazaObiect = {
    driver_name: 'Matievici Serghei',
    plate: 'HMK139',
    identified: true,
    route: 'Chișinău – Bălți',
    departure: '14:00',
    trip_date: '2026-09-02',
  };

  it('numește șoferul la care a rămas obiectul', () => {
    const t = formatLostItemForGroup(bazaObiect);
    expect(t).toContain('Matievici Serghei · HMK139');
    expect(t).toContain('Clientul are numărul');
  });

  it('fără cursă identificată cere să se recunoască cineva', () => {
    const t = formatLostItemForGroup({ ...bazaObiect, identified: false, driver_name: null, plate: null });
    expect(t).toContain('Cursă neidentificată');
    expect(t).toContain('Chișinău – Bălți');
  });

  it('nu promite un telefon când clientul n-a primit numărul', () => {
    // Apel mixt: clientul a reclamat pe același apel, deci numărul nu i s-a dat.
    // Fără rândul ăsta, șoferul ar aștepta un apel care nu vine.
    const t = formatLostItemForGroup({ ...bazaObiect, phone_withheld: true });
    expect(t).toContain('se predă la birou');
    expect(t).not.toContain('Clientul are numărul');
  });

  it('nu poartă numele obiectului — nu există câmp pentru el', () => {
    // Decizia lui Ion din 30.08: obiectul poate fi orice, ASR-ul îl stâlcește.
    // Testul e o santinelă: dacă cineva adaugă câmpul, aici se vede.
    expect(Object.keys(bazaObiect)).not.toContain('item');
    expect(formatLostItemForGroup(bazaObiect)).not.toMatch(/geant|telefon|obiect uitat:/i);
  });
});
