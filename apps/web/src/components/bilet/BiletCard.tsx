import type { Locale } from '@/lib/i18n';
import type { BiletPublic, ComandaPublica } from '@/lib/bilete-api';
import { OPERATOR } from '@/components/legal/legal-content';
import { PlacaMD } from '@/components/ui/bilet-cursa';
import { placaAfisata } from '@/lib/bilet-afisare';

// Cardul unui loc plătit (ION-236, Ion 05.10: «biletul trebuie să fie frumos, ca aici fix în fix»): pastila «BILET
// ONLINE», ora plecării și a sosirii mari, orașele, locul și prețul, linia de rupere, QR-ul, pastila «Achitat online».
// Extras din BiletPage (ION-249) ca mini app-ul clientului din Telegram să arate exact același bilet. Componentă fără
// stare: merge și pe server (pagina biletului), și în client (mini app-ul).

const RED = '#9B1B30';

const TXT = {
  ro: { retur20: 'RETUR −20%', student20: 'STUDENT −20% · ARATĂ CARNETUL LA URCARE', biletOnline: 'BILET ONLINE', azi: 'Azi', locul: 'Locul', pret: 'Preț', achitat: 'achitat', urcat: 'urcat', proba: 'BILET DE PROBĂ — NU E VALABIL LA URCARE', sofer: 'șofer', astept: 'Mașina și șoferul apar după ce dispecerul face graficul zilei.', anulat: 'Cursa a fost anulată — sună la dispecerat +373 60 401 010.' },
  ru: { retur20: 'ОБРАТНЫЙ −20%', student20: 'СТУДЕНТ −20% · ПОКАЖИТЕ СТУДЕНЧЕСКИЙ', biletOnline: 'ОНЛАЙН-БИЛЕТ', azi: 'Сегодня', locul: 'Место', pret: 'Цена', achitat: 'оплачено', urcat: 'посадка выполнена', proba: 'ТЕСТОВЫЙ БИЛЕТ — НЕ ДЕЙСТВИТЕЛЕН ДЛЯ ПОСАДКИ', sofer: 'водитель', astept: 'Автобус и водитель появятся, когда диспетчер составит график дня.', anulat: 'Рейс отменён — звоните диспетчеру +373 60 401 010.' },
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

/**
 * Biletul plătit, varianta B de pe pânza de design (Ion, 09.10.2026: «B este super»): tichet bordo cu ora și ruta mari,
 * apoi «fereastra» albă cu locul, mașina și șoferul, QR-ul și codul; marginea de jos zimțată, ca un bilet rupt.
 */
export function BiletCard({ comanda: c, bilet: b, locale }: { comanda: ComandaPublica; bilet: BiletPublic; locale: Locale }) {
  const tx = TXT[locale];
  const urcat = b.status === 'urcat';
  const nume = numeRuta(c, locale);
  const e = c.echipaj;
  const placa = e?.stare === 'gata' ? placaAfisata(e.placa) : null;
  const cod = b.cod_qr.replace(/(.{4})(?=.)/g, '$1 ');
  return (
    <div className="bilet-card" style={{ background: RED, borderRadius: 26, boxShadow: '0 20px 50px rgba(60,20,30,0.22)', overflow: 'hidden', fontFamily: 'var(--font-opensans), "Open Sans", system-ui, sans-serif', color: '#fff' }}>
      {/* Proba fizică (migr. 532): biletul de probă se vede de departe — nu e valabil pe o cursă reală. */}
      {c.proba && <div style={{ background: '#fff', color: '#b91c1c', textAlign: 'center', padding: '10px 14px', fontSize: 14, fontWeight: 800, letterSpacing: 0.5 }}>{tx.proba}</div>}
      {/* 544: promoția se vede de departe; studentul arată carnetul șoferului la urcare. */}
      {c.reducere && <div style={{ background: '#FFD45C', color: '#231A1C', textAlign: 'center', padding: '8px 14px', fontSize: 13, fontWeight: 800, letterSpacing: 0.4 }}>{c.reducere.tip === 'student' ? tx.student20 : tx.retur20}</div>}
      <div style={{ padding: '20px 22px 6px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span aria-label="TRANSLUX" style={{ ...LOGO_STIL, backgroundColor: '#fff' }} />
          <span style={{ fontSize: 13, fontWeight: 700, padding: '5px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.16)', whiteSpace: 'nowrap' }}>{dataScurta(c.trip_date, locale)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 44, fontWeight: 800, lineHeight: 1, letterSpacing: -0.5 }}>{oraHHMM(c.departure_at)}</span>
          {c.sosire && <span style={{ fontSize: 18, opacity: 0.85 }}>&rarr; {c.sosire}</span>}
        </div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{c.from_name} &rarr; {c.to_name}</div>
        {nume && <div style={{ fontSize: 12, opacity: 0.75, marginTop: -8 }}>{nume}</div>}
      </div>
      <div style={{ margin: '14px 16px 0', padding: 18, borderRadius: '20px 20px 0 0', background: '#fff', color: '#231A1C', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#8A7A7D', letterSpacing: 0.5 }}>{tx.locul.toUpperCase()}</span>
            <span style={{ fontSize: 34, fontWeight: 800, color: RED, lineHeight: 1 }}>{b.loc_nr ?? b.nr}</span>
          </div>
          {/* Echipajul cursei (migr. 538): după bifa dispecerului; până atunci textul de așteptare. */}
          {e?.stare === 'gata' ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, minWidth: 0 }}>
              {placa && <PlacaMD numar={placa} mic />}
              <span style={{ fontSize: 12, color: '#6B5B5F', textAlign: 'right' }}>
                {e.sofer ? `${tx.sofer} ${e.sofer}` : ''}
                {e.telefon && <> · <a href={`tel:${e.telefon.replace(/[^+\d]/g, '')}`} style={{ color: '#1B7F3B', fontWeight: 700, textDecoration: 'none' }}>{e.telefon}</a></>}
              </span>
            </div>
          ) : e ? (
            <span style={{ fontSize: 12, color: e.stare === 'anulat' ? '#b42318' : '#8A7A7D', textAlign: 'right', maxWidth: 190 }}>{e.stare === 'anulat' ? tx.anulat : tx.astept}</span>
          ) : null}
        </div>
        {/* SVG-ul vine de la panou, generat de biblioteca qrcode din codul biletului (nu din text de la utilizator). */}
        <div className="bilet-qr" style={{ width: '100%', maxWidth: 230, opacity: urcat ? 0.3 : 1 }} dangerouslySetInnerHTML={{ __html: b.qr_svg }} />
        <code style={{ fontSize: 13, letterSpacing: 2, fontWeight: 700, color: '#4A3E41', fontFamily: 'inherit' }}>{cod}</code>
        <span style={{ fontSize: 13, color: '#6B5B5F', textAlign: 'center' }}>
          {c.passenger_name} · {c.reducere && <s style={{ color: '#A0939A' }}>{nfPret.format(c.reducere.pret_intreg)}</s>} {nfPret.format(Number(c.price_per_seat))} MDL · <b style={{ color: urcat ? '#6B5B5F' : '#1B7F3B' }}>{urcat ? tx.urcat : tx.achitat}</b>
        </span>
        {/* Biletul arată operatorul și codul fiscal (nota ecc.md, 07.2025). */}
        <span style={{ fontSize: 10, color: '#A0939A', textAlign: 'center' }}>{OPERATOR.brand} · {OPERATOR.name} · IDNO {OPERATOR.idno}</span>
      </div>
      <div aria-hidden="true" style={{ height: 16, margin: '0 16px', backgroundImage: 'radial-gradient(circle at 8px 16px, var(--bg, #f1efef) 7px, #fff 7.5px)', backgroundSize: '16px 16px' }} />
      <div style={{ height: 18 }} />
    </div>
  );
}
