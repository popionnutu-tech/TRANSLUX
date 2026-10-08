import type { Locale } from '@/lib/i18n';
import type { BiletPublic, ComandaPublica } from '@/lib/bilete-api';
import { OPERATOR } from '@/components/legal/legal-content';

// Cardul unui loc plătit (ION-236, Ion 05.10: «biletul trebuie să fie frumos, ca aici fix în fix»): pastila «BILET
// ONLINE», ora plecării și a sosirii mari, orașele, locul și prețul, linia de rupere, QR-ul, pastila «Achitat online».
// Extras din BiletPage (ION-249) ca mini app-ul clientului din Telegram să arate exact același bilet. Componentă fără
// stare: merge și pe server (pagina biletului), și în client (mini app-ul).

const RED = '#9B1B30';

const TXT = {
  ro: { biletOnline: 'BILET ONLINE', azi: 'Azi', locul: 'Locul', pret: 'Preț', achitat: '✓ Achitat online', urcat: '✓ Urcat', proba: 'BILET DE PROBĂ — NU E VALABIL LA URCARE' },
  ru: { biletOnline: 'ОНЛАЙН-БИЛЕТ', azi: 'Сегодня', locul: 'Место', pret: 'Цена', achitat: '✓ Оплачено онлайн', urcat: '✓ Посадка выполнена', proba: 'ТЕСТОВЫЙ БИЛЕТ — НЕ ДЕЙСТВИТЕЛЕН ДЛЯ ПОСАДКИ' },
} as const;

const nfPret = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 });

/** «05:40» în ora Chișinăului. */
function oraHHMM(iso: string): string {
  return new Date(iso).toLocaleTimeString('ro-RO', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Data cursei, OBLIGATORIE pe fiecare bilet (Ion, 07.10): «Azi, 07.10.2026» în ziua cursei, altfel «mar., 14.10.2026». */
function dataScurta(tripDate: string, locale: Locale): string {
  const aziChisinau = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
  const [y, m, d] = tripDate.split('-').map(Number);
  const data = `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
  if (tripDate === aziChisinau) return `${TXT[locale].azi}, ${data}`;
  const zi = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'ro-RO', { timeZone: 'UTC', weekday: 'short' });
  return `${zi}, ${data}`;
}

/** Locurile cu QR de arătat: valide sau deja urcate (anulatele/returnatele nu se arată). */
export function bileteDeAratat(c: ComandaPublica): BiletPublic[] {
  return c.bilete.filter((b) => b.status === 'valid' || b.status === 'urcat');
}

/** Numele cursei (ruta) în limba paginii, sau null. */
export function numeRuta(c: ComandaPublica, locale: Locale): string | null {
  return c.ruta ? (locale === 'ru' ? c.ruta.nume_ru : c.ruta.nume_ro) : null;
}

const LOGO_STIL = {
  display: 'inline-block', height: 26, aspectRatio: '1318/192', backgroundColor: RED,
  WebkitMaskImage: 'url(/translux-logo-red.png)', WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat',
  maskImage: 'url(/translux-logo-red.png)', maskSize: 'contain', maskRepeat: 'no-repeat',
} as const;

/** CSS-ul cardului (QR-ul pe toată lățimea, cardul nu se rupe la tipar); se pune o dată pe pagină. */
export const BILET_CARD_CSS = `
  .bilet-qr svg { width: 100%; height: auto; display: block; }
  .bilet-card { break-inside: avoid; page-break-inside: avoid; }
`;

export function BiletCard({ comanda: c, bilet: b, locale }: { comanda: ComandaPublica; bilet: BiletPublic; locale: Locale }) {
  const tx = TXT[locale];
  const urcat = b.status === 'urcat';
  const nume = numeRuta(c, locale);
  return (
    <div className="bilet-card" style={{ background: '#fff', borderRadius: 22, boxShadow: '0 6px 24px rgba(0,0,0,0.10)', overflow: 'hidden', fontFamily: 'var(--font-opensans), "Open Sans", system-ui, sans-serif', color: '#1a1a1a' }}>
      {/* Proba fizică (migr. 532): biletul de probă se vede de departe — nu e valabil pe o cursă reală. */}
      {c.proba && <div style={{ background: '#b91c1c', color: '#fff', textAlign: 'center', padding: '10px 14px', fontSize: 14, fontWeight: 800, letterSpacing: 0.5 }}>{tx.proba}</div>}
      {/* Partea de sus: cursa */}
      <div style={{ padding: '18px 22px 14px' }}>
        {/* Ion, 05.10: «sus la șoferi și la clienți pune logo-ul nostru» — logo-ul bordo în capul cardului. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span aria-label="TRANSLUX" style={LOGO_STIL} />
          <span style={{ fontSize: 15, color: '#555', fontWeight: 600 }}>{dataScurta(c.trip_date, locale)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ background: '#fbe9e3', color: '#d9532b', borderRadius: 999, padding: '6px 14px', fontSize: 12, fontWeight: 800, letterSpacing: 1.2 }}>{tx.biletOnline}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginTop: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 40, fontWeight: 800, lineHeight: 1, letterSpacing: -0.5 }}>{oraHHMM(c.departure_at)}</span>
            <span style={{ fontSize: 20, fontWeight: 800, marginTop: 6 }}>{c.from_name}</span>
          </div>
          <div aria-hidden="true" style={{ flex: 1, borderTop: '3px dotted #c9c9c9', marginTop: 20, minWidth: 24 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end', textAlign: 'right', minWidth: 0 }}>
            <span style={{ fontSize: 40, fontWeight: 800, lineHeight: 1, letterSpacing: -0.5, color: c.sosire ? '#1a1a1a' : '#bbb' }}>{c.sosire ?? '—:—'}</span>
            <span style={{ fontSize: 20, fontWeight: 800, marginTop: 6 }}>{c.to_name}</span>
          </div>
        </div>
        {nume && <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>{nume}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 4, marginTop: 14, fontSize: 16 }}>
          {/* ION-239: numărul locului din autobuz (loc_nr); până la migrație / fără loc dat rămâne «1 din 2» (nr). */}
          <span style={{ color: '#666' }}>{tx.locul}</span><span style={{ fontWeight: 800, textAlign: 'right' }}>{b.loc_nr ?? b.nr}</span>
          <span style={{ color: '#666' }}>{tx.pret}</span><span style={{ fontWeight: 800, textAlign: 'right' }}>{nfPret.format(Number(c.price_per_seat))} MDL</span>
        </div>
        <div style={{ fontSize: 13, color: '#666', marginTop: 8 }}>{c.passenger_name}</div>
        {/* Biletul arată operatorul și codul fiscal (nota ecc.md, 07.2025: «denumirea operatorului, codul fiscal, ruta, data, ora, locul»). */}
        <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>{OPERATOR.brand} · {OPERATOR.name} · IDNO {OPERATOR.idno}</div>
      </div>
      {/* Linia de rupere */}
      <div style={{ position: 'relative', height: 0, borderTop: '2px dashed #d9d9d9', margin: '0 14px' }}>
        <span style={{ position: 'absolute', left: -26, top: -12, width: 24, height: 24, borderRadius: '50%', background: 'var(--bg, #f1efef)' }} />
        <span style={{ position: 'absolute', right: -26, top: -12, width: 24, height: 24, borderRadius: '50%', background: 'var(--bg, #f1efef)' }} />
      </div>
      {/* Partea de jos: QR + pastila */}
      <div style={{ padding: '18px 22px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        {/* SVG-ul vine de la panou, generat de biblioteca qrcode din codul biletului (nu din text de la utilizator). */}
        <div className="bilet-qr" style={{ width: '100%', maxWidth: 230, opacity: urcat ? 0.3 : 1 }} dangerouslySetInnerHTML={{ __html: b.qr_svg }} />
        <code style={{ fontSize: 13, letterSpacing: 2, color: '#444' }}>{b.cod_qr}</code>
        <span style={{ width: '100%', textAlign: 'center', borderRadius: 14, padding: '12px 16px', fontSize: 17, fontWeight: 800, background: urcat ? '#ececec' : '#e3f3e8', color: urcat ? '#666' : '#1b7f3b' }}>
          {urcat ? tx.urcat : tx.achitat}
        </span>
      </div>
    </div>
  );
}
