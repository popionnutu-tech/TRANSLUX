import { notFound } from 'next/navigation';
import type { Locale } from '@/lib/i18n';
import { biletPublic, type ComandaPublica } from '@/lib/bilete-api';
import { linkHarta } from '@/lib/bilete-reguli';
import { AsteaptaPlata, EcranCompletTelegram, ReturDupaTur, SalveazaBilet } from './BiletActiuni';
import { FirmaSiPlati } from '@/components/legal/FirmaSiPlati';
import { BILET_CARD_CSS, BiletCard, bileteDeAratat, numeRuta } from './BiletCard';
import LogoTranslux from '../logo-translux';

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

// ION-248 (Ion, 05.10: «când se deschide biletul actual trebuie să fie doar biletul — fără toată informația adițională»):
// `?doar=1` (butonul «🎫 Bilete» din bot) arată doar cardul (cardurile) cu QR — fără antet, cardul Telegram, retur, firmă.
export async function BiletPage({ cod, locale, plataNu, doar = false }: { cod: string; locale: Locale; plataNu: boolean; doar?: boolean }) {
  const tx = TXT[locale];
  const c = await biletPublic(cod);
  if (c === null) notFound();

  return (
    <div className="legal-page">
      {doar && <EcranCompletTelegram />}
      <style>{`
        ${BILET_CARD_CSS}
        @media print { .bilet-no-print { display: none !important; } .site-header { display: none !important; } body { background: #fff; } .bilet-card { box-shadow: none !important; border: 1px solid #ddd; } }
      `}</style>
      {!doar && <header className="site-header bilet-no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px' }}>
        <a href={`/${locale}`} aria-label="TRANSLUX">
          <LogoTranslux height={30} />
        </a>
      </header>}

      <main className="legal-main" style={{ maxWidth: 520 }}>
        {!doar && <h1 className="bilet-no-print">{tx.titlu}</h1>}
        {c === 'indisponibil' ? (
          <p>{tx.indisponibil}</p>
        ) : (() => {
          const et = eticheta(c, tx);
          const valide = bileteDeAratat(c);
          const nume = numeRuta(c, locale);
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
                  {valide.map((b) => <BiletCard key={b.nr} comanda={c} bilet={b} locale={locale} />)}
                  {!doar && <p style={{ fontSize: 13, color: '#555', margin: 0 }}>{tx.arata}</p>}
                  {!doar && c.punct_urcare && (
                    <p style={{ fontSize: 13, color: '#555', margin: 0 }}><span style={{ color: '#888' }}>{tx.urcare}: </span><b>{locale === 'ru' ? c.punct_urcare.nume_ru : c.punct_urcare.nume_ro}</b>{' '}
                      <a href={linkHarta(c.punct_urcare)} target="_blank" rel="noopener noreferrer" style={{ color: RED, fontSize: 12 }}>{tx.harta} ↗</a></p>
                  )}
                </div>
              )}

              {/* 548: celălalt bilet din tur-retur (plătit o dată). */}
              {!doar && c.pachet && (
                <a href={`/${locale}/bilet/${c.pachet.cod}`} className="bilet-no-print" style={{ display: 'block', marginTop: 14, padding: 14, borderRadius: 16, background: '#fdf3e7', border: '2px solid #d98a2b', color: '#231A1C', textDecoration: 'none' }}>
                  <b style={{ fontSize: 16 }}>{c.pachet.sens === 'retur' ? (locale === 'ru' ? 'Обратный билет' : 'Biletul de retur') : (locale === 'ru' ? 'Билет туда' : 'Biletul tur')} →</b>
                  <div style={{ fontSize: 14, marginTop: 4 }}>{c.pachet.from_name} → {c.pachet.to_name} · {dataOra(c.pachet.departure_at, locale)}</div>
                </a>
              )}
              {!doar && !c.pachet && c.status === 'platita' && c.cod_retur && !c.proba && <div className="bilet-no-print" style={{ marginTop: 14 }}><ReturDupaTur codRetur={c.cod_retur} paidAt={c.paid_at} rutaId={c.ruta?.id ?? null} tripDate={c.trip_date} de={c.from_name} spre={c.to_name} locale={locale} /></div>}

              {c.status === 'noua' && <AsteaptaPlata locale={locale} />}

              {!doar && c.status === 'platita' && (
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
              {!doar && platit && c.numar && (
                <p style={{ fontSize: 12, color: '#888', marginTop: 12 }}>{tx.comanda} <b>{c.numar}</b>{c.paid_at && <> · {tx.platitaPe} {dataOra(c.paid_at, locale)}</>} · {tx.total}: <b>{Number(c.total).toFixed(2)} lei</b></p>
              )}
              {!doar && <p style={{ fontSize: 12, color: '#888', marginTop: 8 }}>{tx.retur}</p>}
            </>
          );
        })()}
        {!doar && <p className="bilet-no-print"><a href={`/${locale}`} style={{ color: RED }}>{tx.acasa}</a></p>}
        {/* ION-235: datele firmei și logourile plăților (cerințele maib). */}
        {!doar && <div style={{ marginTop: 16 }}><FirmaSiPlati locale={locale} /></div>}
      </main>
    </div>
  );
}
