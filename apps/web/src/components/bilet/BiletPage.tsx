import { notFound } from 'next/navigation';
import type { Locale } from '@/lib/i18n';
import { biletPublic, type ComandaPublica } from '@/lib/bilete-api';
import { linkHarta } from '@/lib/bilete-reguli';
import { AsteaptaPlata, EcranCompletTelegram, SalveazaPoza, SpreUrmatorul, type PozaLoc } from './BiletActiuni';
import { OPERATOR } from '@/components/legal/legal-content';
import { FirmaSiPlati } from '@/components/legal/FirmaSiPlati';
import { BILET_CARD_CSS, BiletCard, TXT_CARD, bileteDeAratat, biletulQr, dataScurta, nfPret, numeRuta, oraHHMM, textLocuri } from './BiletCard';
import LogoTranslux from '../logo-translux';
import { ReiaPlata } from './ReiaPlata';
import { AnuleazaBilet } from './AnuleazaBilet';

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
    plataNu: 'Plata nu a trecut. Alegerea ta e păstrată — reia plata dintr-o apăsare.',
    comanda: 'Comanda nr.', platitaPe: 'plătită pe', cursa: 'Cursa', urcare: 'Urcare', harta: 'pe hartă', pasager: 'Pasager', locuri: 'Locuri', total: 'Total', loc: 'Loc', urcat: 'urcat',
    arata: 'Arată codul QR șoferului la urcare. Un cod pentru toți din comandă — șoferul îl scanează o dată.',
    salveaza: 'Salvează / tipărește', telegram: '📍 Vezi biletul și autobuzul tău în Telegram',
    telegramSub: 'Biletul e mereu la îndemână, iar în ziua cursei vezi pe hartă unde e autobuzul tău și când ajunge la tine.',
    tgTitlu: 'Pasul următor: ia biletul în Telegram',
    tgMotive: ['biletul cu codul QR mereu în telefon', 'cu 12 ore și cu o oră înainte îți amintim de cursă', 'vezi pe hartă unde e autobuzul și când ajunge'],
    tgStart: 'Se deschide Telegram: apasă START și biletul apare acolo.',
    tgButon: '📍 În Telegram', tgScurt: 'În Telegram: amintire înainte de cursă și autobuzul pe hartă.',
    retur: 'Returnarea se cere prin botul nostru din Telegram sau la telefon +373 60 401 010: integral cu peste 24 de ore înainte de plecare, apoi tot mai puțin; cu mai puțin de 4 ore nu se restituie. Detalii: translux.md/ro/conditii-vanzare.',
    indisponibil: 'Biletul nu poate fi afișat acum. Reîncarcă pagina peste un minut.', acasa: '← Pagina principală',
  },
  ru: {
    titlu: 'Ваш билет', astepta: 'Ожидает оплаты', platit: 'Оплачен', anulat: 'Отменён', returnat: 'Возвращён',
    expirat: 'Оплата не завершена', eroare: 'Не удалось начать оплату', fara_bilet: 'Оплата пришла после истечения заказа. Диспетчер проверит её и позвонит вам.',
    plataNu: 'Оплата не прошла. Ваш выбор сохранён — повторите оплату одним нажатием.',
    comanda: 'Заказ №', platitaPe: 'оплачен', cursa: 'Рейс', urcare: 'Посадка', harta: 'на карте', pasager: 'Пассажир', locuri: 'Мест', total: 'Итого', loc: 'Место', urcat: 'посадка',
    arata: 'Покажите QR-код водителю при посадке. Один код на весь заказ — водитель сканирует его один раз.',
    salveaza: 'Сохранить / распечатать', telegram: '📍 Билет и ваш автобус в Telegram',
    telegramSub: 'Билет всегда под рукой, а в день поездки на карте видно, где ваш автобус и когда он подъедет.',
    tgTitlu: 'Следующий шаг: билет в Telegram',
    tgMotive: ['билет с QR-кодом всегда в телефоне', 'за 12 часов и за час напомним о поездке', 'на карте видно, где автобус и когда он подъедет'],
    tgStart: 'Откроется Telegram: нажмите START, и билет появится там.',
    tgButon: '📍 В Telegram', tgScurt: 'В Telegram: напоминание о поездке и автобус на карте.',
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
  // O poză pe comandă: un QR pentru toate locurile ei (Ion, 10.10.2026).
  const poze = (k: ComandaPublica): PozaLoc[] => {
    const valide = bileteDeAratat(k);
    const v = biletulQr(valide);
    if (!v) return [];
    const urcat = valide.every((x) => x.status === 'urcat');
    return [{
      loc: textLocuri(valide),
      eticheta: textLocuri(valide) ? (valide.length > 1 ? TXT_CARD[locale].locurile : TXT_CARD[locale].locul).toUpperCase() : '',
      bilete: valide.length > 1 ? `${valide.length} ${locale === 'ru' ? (valide.length <= 4 ? 'БИЛЕТА' : 'БИЛЕТОВ') : 'BILETE'}` : null,
      cod: v.cod_qr.replace(/(.{4})(?=.)/g, '$1 '), qrSvg: v.qr_svg,
      ora: oraHHMM(k.departure_at), sosire: k.sosire ?? null, ruta: `${k.from_name} → ${k.to_name}`, numeRuta: numeRuta(k, locale), data: dataScurta(k.trip_date, locale),
      jos: `${k.passenger_name} · ${valide.length > 1 ? `${valide.length} × ` : ''}${nfPret.format(Number(k.price_per_seat))} MDL · ${urcat ? TXT_CARD[locale].urcat : TXT_CARD[locale].achitat}`,
      operator: `${OPERATOR.brand} · ${OPERATOR.name} · IDNO ${OPERATOR.idno}`,
      banda: k.proba ? TXT_CARD[locale].proba : k.reducere ? (k.reducere.tip === 'student' ? TXT_CARD[locale].student20 : TXT_CARD[locale].retur20) : null,
      bandaProba: Boolean(k.proba), urcat,
    }];
  };
  // Biletul plătit pe un singur ecran (Ion, 10.10.2026: «biletul final să fie o pagină fără scroll»): fără antetul cu
  // logo și fără titlu — logoul e pe bilet; dedesubt doar ce cere maib (comanda, firma, plățile).
  const ecranBilet = c !== 'indisponibil' && c.status === 'platita' && bileteDeAratat(c).length > 0;
  // Tur-retur (548) pe o singură pagină (Ion, 10.10.2026: «dacă sunt cumpărate 2 bilete, ambele trebuie să apară»):
  // celălalt bilet al perechii se aduce aici, cu QR-ul lui; turul întâi, returul după.
  const p = ecranBilet && c.pachet ? await biletPublic(c.pachet.cod) : null;
  const pereche = p && p !== 'indisponibil' && p.status === 'platita' && bileteDeAratat(p).length > 0 ? p : null;

  return (
    <div className="legal-page">
      {doar && <EcranCompletTelegram />}
      <style>{`
        ${BILET_CARD_CSS}
        @media print { .bilet-no-print { display: none !important; } .site-header { display: none !important; } body { background: #fff; } .bilet-card { box-shadow: none !important; border: 1px solid #ddd; } }
      `}</style>
      {!doar && !ecranBilet && <header className="site-header bilet-no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px' }}>
        <a href={`/${locale}`} aria-label="TRANSLUX">
          <LogoTranslux height={30} />
        </a>
      </header>}

      <main className="legal-main" style={{ maxWidth: 520, ...(ecranBilet && !doar ? { paddingTop: 14 } : {}) }}>
        {!doar && !ecranBilet && <h1 className="bilet-no-print">{tx.titlu}</h1>}
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
              {plataNu && (c.status === 'noua' || c.status === 'expirata') && <ReiaPlata locale={locale} platit={false} />}
              {platit && <ReiaPlata locale={locale} platit />}

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

              {platit && (() => {
                // Turul întâi: dacă pagina e a returului, perechea (turul) vine sus.
                const grupuri = pereche ? (c.pachet?.sens === 'tur' ? [pereche, c] : [c, pereche]) : [c];
                const sens = (k: ComandaPublica) => (k === c ? (c.pachet?.sens === 'tur' ? 'retur' : 'tur') : (c.pachet?.sens ?? 'retur'));
                const toate = grupuri.flatMap(poze);
                return (
                  <div style={{ display: 'grid', gap: pereche ? 12 : 18 }}>
                    {/* Biletul și trecerea în Telegram într-un singur bloc (Ion, 10.10.2026: «biletul și Telegram trecere unește»);
                        «Salvează/tipărește» a devenit poza biletului în galerie (Ion, 10.10.2026). */}
                    {grupuri.map((k, gi) => (
                      <div key={k.cod} id={`bilet-${gi + 1}`} style={{ display: 'grid', gap: 8, scrollMarginTop: 12 }}>
                        {[biletulQr(bileteDeAratat(k))!].map((b) => <BiletCard key={b.nr} comanda={k} bilet={b} grup={bileteDeAratat(k)} compact={Boolean(pereche)} sens={pereche ? (sens(k) === 'tur' ? (locale === 'ru' ? 'ТУДА' : 'TUR') : (locale === 'ru' ? 'ОБРАТНО' : 'RETUR')) : undefined} locale={locale} jos={!doar && gi === 0 ? (
                          <div className="bilet-no-print" style={{ padding: '6px 16px 14px', display: 'grid', gap: 6 }}>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <a href={`https://t.me/${BOT}?start=bilet_${c.cod}`} target="_blank" rel="noopener noreferrer" style={{
                                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 48, padding: '0 10px', borderRadius: 14,
                                background: '#1b7fb0', color: '#fff', textDecoration: 'none', fontWeight: 800, fontSize: 15, textAlign: 'center',
                              }}>{tx.tgButon}</a>
                              <SalveazaPoza locale={locale} stil={{ flex: 1 }} locuri={toate} />
                            </div>
                            {!pereche && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', textAlign: 'center', lineHeight: 1.35 }}>{tx.tgScurt}</span>}
                          </div>
                        ) : undefined} />)}
                        {!doar && k.punct_urcare && (
                          <p style={{ fontSize: 13, color: '#555', margin: 0 }}><span style={{ color: '#888' }}>{tx.urcare}: </span><b>{locale === 'ru' ? k.punct_urcare.nume_ru : k.punct_urcare.nume_ro}</b>{' '}
                            <a href={linkHarta(k.punct_urcare)} target="_blank" rel="noopener noreferrer" style={{ color: RED, fontSize: 12 }}>{tx.harta} ↗</a></p>
                        )}
                      </div>
                    ))}
                    {!doar && <p style={{ fontSize: 13, color: '#555', margin: 0 }}>{tx.arata}</p>}
                    {grupuri.length > 1 && <SpreUrmatorul tinta="bilet-2" text={sens(grupuri[1]) === 'retur' ? (locale === 'ru' ? 'Обратный билет — ниже' : 'Biletul de retur — mai jos') : (locale === 'ru' ? 'Второй билет — ниже' : 'Al doilea bilet — mai jos')} />}
                    {/* Anularea pe site (557): linkul + 4 cifre ale telefonului; tur-returul întreg. */}
                    {!doar && <AnuleazaBilet cod={c.cod} locale={locale} />}
                  </div>
                );
              })()}

              {/* 548: celălalt bilet din tur-retur, când nu s-a putut aduce pe pagină — rămâne linkul. */}
              {!doar && c.pachet && !pereche && (
                <a href={`/${locale}/bilet/${c.pachet.cod}`} className="bilet-no-print" style={{ display: 'block', marginTop: 14, padding: 14, borderRadius: 16, background: '#fdf3e7', border: '2px solid #d98a2b', color: '#231A1C', textDecoration: 'none' }}>
                  <b style={{ fontSize: 16 }}>{c.pachet.sens === 'retur' ? (locale === 'ru' ? 'Обратный билет' : 'Biletul de retur') : (locale === 'ru' ? 'Билет туда' : 'Biletul tur')} →</b>
                  <div style={{ fontSize: 14, marginTop: 4 }}>{c.pachet.from_name} → {c.pachet.to_name} · {dataOra(c.pachet.departure_at, locale)}</div>
                </a>
              )}

              {c.status === 'noua' && <AsteaptaPlata locale={locale} />}


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
