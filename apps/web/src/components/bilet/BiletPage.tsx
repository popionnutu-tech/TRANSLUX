import { notFound } from 'next/navigation';
import type { Locale } from '@/lib/i18n';
import { biletPublic, type ComandaPublica } from '@/lib/bilete-api';
import { linkHarta } from '@/lib/bilete-reguli';
import { AsteaptaPlata, SalveazaBilet } from './BiletActiuni';
import { FirmaSiPlati } from '@/components/legal/FirmaSiPlati';
import { OPERATOR } from '@/components/legal/legal-content';

// Pagina biletului (ION-197): /ro/bilet/<cod>, /ru/bilet/<cod>. Codul din link e secretul comenzii (128 de biți);
// pagina nu se indexează, nu se cache-uiește, nu trimite referrer (next.config) și nu intră în page_views.
// Conținutul vine de la panou; aici doar se arată. Fără anulare pe pagină (decizia lui Ion, 03.10: doar prin Telegram).
// ION-236 (Ion, 05.10: «biletul trebuie să fie frumos, ca aici fix în fix»): biletul plătit e un card ca în aplicațiile
// de bilete — pastila «BILET ONLINE», ora plecării și a sosirii mari, orașele, locul și prețul, linia de rupere, QR-ul,
// pastila verde «Achitat online». Un card pe fiecare loc (fiecare cod QR = un loc).

const RED = '#9B1B30';
const BOT = process.env.NEXT_PUBLIC_BOT_USERNAME || 'TransluxMoldova_bot';

const TXT = {
  ro: {
    titlu: 'Biletul tău', astepta: 'În așteptarea plății', platit: 'Plătit', anulat: 'Anulat', returnat: 'Returnat',
    expirat: 'Plata nu a fost finalizată', eroare: 'Plata nu a putut fi pornită', fara_bilet: 'Plata a sosit după expirarea comenzii. Dispecerul o verifică și te sună.',
    plataNu: 'Plata nu a trecut. Poți încerca din nou de pe site.',
    comanda: 'Comanda nr.', platitaPe: 'plătită pe', cursa: 'Cursa', urcare: 'Urcare', harta: 'pe hartă', pasager: 'Pasager', locuri: 'Locuri', total: 'Total', loc: 'Loc', urcat: 'urcat',
    biletOnline: 'BILET ONLINE', azi: 'Azi', locul: 'Locul', pret: 'Preț', achitat: '✓ Achitat online', urcatPastila: '✓ Urcat',
    arata: 'Arată codul QR șoferului la urcare. Fiecare cod e un loc.',
    salveaza: 'Salvează / tipărește', telegram: '📍 Vezi biletul și autobuzul tău în Telegram',
    telegramSub: 'Biletul e mereu la îndemână, iar în ziua cursei vezi pe hartă unde e autobuzul tău și când ajunge la tine.',
    tgTitlu: 'Pasul următor: ia biletul în Telegram',
    tgMotive: ['biletul cu codul QR mereu în telefon', 'cu 12 ore și cu o oră înainte îți amintim de cursă', 'vezi pe hartă unde e autobuzul și când ajunge'],
    tgStart: 'Se deschide Telegram: apasă START și biletul apare acolo.',
    retur: 'Returnarea se cere prin botul nostru din Telegram sau la telefon +373 60 401 010: integral cu peste 24 de ore înainte de plecare, apoi tot mai puțin; cu mai puțin de 4 ore nu se restituie. Detalii: translux.md/ro/conditii-vanzare.',
    indisponibil: 'Biletul nu poate fi afișat acum. Reîncarcă pagina peste un minut.', acasa: '← Pagina principală',
  },
  ru: {
    titlu: 'Ваш билет', astepta: 'Ожидает оплаты', platit: 'Оплачен', anulat: 'Отменён', returnat: 'Возвращён',
    expirat: 'Оплата не завершена', eroare: 'Не удалось начать оплату', fara_bilet: 'Оплата пришла после истечения заказа. Диспетчер проверит её и позвонит вам.',
    plataNu: 'Оплата не прошла. Можно попробовать ещё раз на сайте.',
    comanda: 'Заказ №', platitaPe: 'оплачен', cursa: 'Рейс', urcare: 'Посадка', harta: 'на карте', pasager: 'Пассажир', locuri: 'Мест', total: 'Итого', loc: 'Место', urcat: 'посадка',
    biletOnline: 'ОНЛАЙН-БИЛЕТ', azi: 'Сегодня', locul: 'Место', pret: 'Цена', achitat: '✓ Оплачено онлайн', urcatPastila: '✓ Посадка выполнена',
    arata: 'Покажите QR-код водителю при посадке. Каждый код — одно место.',
    salveaza: 'Сохранить / распечатать', telegram: '📍 Билет и ваш автобус в Telegram',
    telegramSub: 'Билет всегда под рукой, а в день поездки на карте видно, где ваш автобус и когда он подъедет.',
    tgTitlu: 'Следующий шаг: билет в Telegram',
    tgMotive: ['билет с QR-кодом всегда в телефоне', 'за 12 часов и за час напомним о поездке', 'на карте видно, где автобус и когда он подъедет'],
    tgStart: 'Откроется Telegram: нажмите START, и билет появится там.',
    retur: 'Возврат — через наш бот в Telegram или по телефону +373 60 401 010: полностью более чем за 24 часа до отправления, затем меньше; менее чем за 4 часа не возвращается. Подробно: translux.md/ru/conditii-vanzare.',
    indisponibil: 'Билет сейчас недоступен. Обновите страницу через минуту.', acasa: '← Главная',
  },
} as const;

function dataOra(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleString(locale === 'ru' ? 'ru-RU' : 'ro-RO', {
    timeZone: 'Europe/Chisinau', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
/** «05:40» în ora Chișinăului. */
function oraHHMM(iso: string): string {
  return new Date(iso).toLocaleTimeString('ro-RO', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit', hour12: false });
}
/** Colțul din dreapta al cardului: «Azi» în ziua cursei, altfel «mar., 14.10». */
function dataScurta(tripDate: string, locale: Locale, azi: string): string {
  const aziChisinau = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Chisinau' });
  if (tripDate === aziChisinau) return azi;
  const [y, m, d] = tripDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'ro-RO', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit' });
}
const nfPret = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 });

function eticheta(c: ComandaPublica, tx: (typeof TXT)[Locale]): { text: string; culoare: string } {
  switch (c.status) {
    case 'platita': return { text: tx.platit, culoare: '#1b7f3b' };
    case 'noua': return { text: tx.astepta, culoare: '#8a6d00' };
    case 'anulata': return { text: tx.anulat, culoare: '#8a6d00' };
    case 'returnata': return { text: tx.returnat, culoare: '#8a6d00' };
    case 'platita_fara_bilet': return { text: tx.fara_bilet, culoare: RED };
    case 'eroare_creare': return { text: tx.eroare, culoare: RED };
    default: return { text: tx.expirat, culoare: '#777' };
  }
}

export async function BiletPage({ cod, locale, plataNu }: { cod: string; locale: Locale; plataNu: boolean }) {
  const tx = TXT[locale];
  const c = await biletPublic(cod);
  if (c === null) notFound();

  return (
    <div className="legal-page">
      <style>{`
        .bilet-qr svg { width: 100%; height: auto; display: block; }
        .bilet-card { break-inside: avoid; page-break-inside: avoid; }
        @media print { .bilet-no-print { display: none !important; } .site-header { display: none !important; } body { background: #fff; } .bilet-card { box-shadow: none !important; border: 1px solid #ddd; } }
      `}</style>
      <header className="site-header bilet-no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px' }}>
        <a href={`/${locale}`} aria-label="TRANSLUX">
          <span style={{
            display: 'inline-block', height: 30, aspectRatio: '1318/192', backgroundColor: RED,
            WebkitMaskImage: 'url(/translux-logo-red.png)', WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat',
            maskImage: 'url(/translux-logo-red.png)', maskSize: 'contain', maskRepeat: 'no-repeat',
          }} />
        </a>
      </header>

      <main className="legal-main" style={{ maxWidth: 520 }}>
        <h1 className="bilet-no-print">{tx.titlu}</h1>
        {c === 'indisponibil' ? (
          <p>{tx.indisponibil}</p>
        ) : (() => {
          const et = eticheta(c, tx);
          const valide = c.bilete.filter((b) => b.status === 'valid' || b.status === 'urcat');
          const nume = c.ruta ? (locale === 'ru' ? c.ruta.nume_ru : c.ruta.nume_ro) : null;
          const platit = c.status === 'platita' && valide.length > 0;
          return (
            <>
              {!platit && <p style={{ fontWeight: 700, color: et.culoare, fontSize: 16 }}>{et.text}</p>}
              {plataNu && c.status === 'noua' && <p style={{ color: RED }}>{tx.plataNu}</p>}

              {!platit && (
                <div style={{ display: 'grid', gap: 6, padding: 14, borderRadius: 14, background: '#fff', border: '1px solid #eee', fontSize: 14 }}>
                  <div><span style={{ color: '#888' }}>{tx.cursa}: </span><b>{c.from_name} → {c.to_name}</b>{nume && <span style={{ color: '#888' }}> ({nume})</span>}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: RED }}>{dataOra(c.departure_at, locale)}</div>
                  {c.punct_urcare && (
                    <div><span style={{ color: '#888' }}>{tx.urcare}: </span><b>{locale === 'ru' ? c.punct_urcare.nume_ru : c.punct_urcare.nume_ro}</b>{' '}
                      <a href={linkHarta(c.punct_urcare)} target="_blank" rel="noopener noreferrer" style={{ color: RED, fontSize: 12 }}>{tx.harta} ↗</a></div>
                  )}
                  <div><span style={{ color: '#888' }}>{tx.pasager}: </span>{c.passenger_name}</div>
                  <div><span style={{ color: '#888' }}>{tx.locuri}: </span>{c.seats} · <span style={{ color: '#888' }}>{tx.total}: </span><b>{Number(c.total).toFixed(2)} lei</b></div>
                  {c.numar && <div><span style={{ color: '#888' }}>{tx.comanda} </span><b>{c.numar}</b>{c.paid_at && <span style={{ color: '#888' }}> · {tx.platitaPe} {dataOra(c.paid_at, locale)}</span>}</div>}
                </div>
              )}

              {platit && (
                <div style={{ display: 'grid', gap: 18 }}>
                  {valide.map((b) => {
                    const urcat = b.status === 'urcat';
                    return (
                      <div key={b.nr} className="bilet-card" style={{ background: '#fff', borderRadius: 22, boxShadow: '0 6px 24px rgba(0,0,0,0.10)', overflow: 'hidden', fontFamily: 'var(--font-opensans), "Open Sans", system-ui, sans-serif', color: '#1a1a1a' }}>
                        {/* Partea de sus: cursa */}
                        <div style={{ padding: '18px 22px 14px' }}>
                          {/* Ion, 05.10: «sus la șoferi și la clienți pune logo-ul nostru» — logo-ul bordo în capul cardului. */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <span aria-label="TRANSLUX" style={{
                              display: 'inline-block', height: 26, aspectRatio: '1318/192', backgroundColor: RED,
                              WebkitMaskImage: 'url(/translux-logo-red.png)', WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat',
                              maskImage: 'url(/translux-logo-red.png)', maskSize: 'contain', maskRepeat: 'no-repeat',
                            }} />
                            <span style={{ fontSize: 15, color: '#555', fontWeight: 600 }}>{dataScurta(c.trip_date, locale, tx.azi)}</span>
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
                            {urcat ? tx.urcatPastila : tx.achitat}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  <p style={{ fontSize: 13, color: '#555', margin: 0 }}>{tx.arata}</p>
                  {c.punct_urcare && (
                    <p style={{ fontSize: 13, color: '#555', margin: 0 }}><span style={{ color: '#888' }}>{tx.urcare}: </span><b>{locale === 'ru' ? c.punct_urcare.nume_ru : c.punct_urcare.nume_ro}</b>{' '}
                      <a href={linkHarta(c.punct_urcare)} target="_blank" rel="noopener noreferrer" style={{ color: RED, fontSize: 12 }}>{tx.harta} ↗</a></p>
                  )}
                </div>
              )}

              {c.status === 'noua' && <AsteaptaPlata locale={locale} />}

              {c.status === 'platita' && (
                <div className="bilet-no-print" style={{ display: 'grid', gap: 10, marginTop: 14 }}>
                  {/* Toți spre Telegram (Ion, 05.10, ION-238): cardul e pasul principal de după plată; butonul rămâne cel de până acum. */}
                  <div style={{ display: 'grid', gap: 10, padding: 14, borderRadius: 16, background: '#eef6fb', border: '2px solid #1b7fb0' }}>
                    <div style={{ fontWeight: 700, fontSize: 17, color: '#17364a' }}>{tx.tgTitlu}</div>
                    <div style={{ display: 'grid', gap: 6, fontSize: 15, color: '#24485e' }}>
                      {tx.tgMotive.map((m) => <span key={m}>✓ {m}</span>)}
                    </div>
                    <a href={`https://t.me/${BOT}?start=bilet_${c.cod}`} target="_blank" rel="noopener noreferrer" style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 56, padding: '0 14px', borderRadius: 12,
                      background: '#1b7fb0', color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 16, textAlign: 'center',
                    }}>{tx.telegram}</a>
                    <div style={{ fontSize: 14, color: '#24485e' }}>{tx.tgStart}</div>
                  </div>
                  <SalveazaBilet text={tx.salveaza} />
                </div>
              )}

              {/* ION-235 (cerințele maib): numărul comenzii și data plății, sub bilet. */}
              {platit && c.numar && (
                <p style={{ fontSize: 12, color: '#888', marginTop: 12 }}>{tx.comanda} <b>{c.numar}</b>{c.paid_at && <> · {tx.platitaPe} {dataOra(c.paid_at, locale)}</>} · {tx.total}: <b>{Number(c.total).toFixed(2)} lei</b></p>
              )}
              <p style={{ fontSize: 12, color: '#888', marginTop: 8 }}>{tx.retur}</p>
            </>
          );
        })()}
        <p className="bilet-no-print"><a href={`/${locale}`} style={{ color: RED }}>{tx.acasa}</a></p>
        {/* ION-235: datele firmei și logourile plăților (cerințele maib). */}
        <div style={{ marginTop: 16 }}><FirmaSiPlati locale={locale} /></div>
      </main>
    </div>
  );
}
