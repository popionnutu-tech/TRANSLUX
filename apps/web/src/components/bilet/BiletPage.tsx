import { notFound } from 'next/navigation';
import type { Locale } from '@/lib/i18n';
import { biletPublic, type ComandaPublica } from '@/lib/bilete-api';
import { AsteaptaPlata, SalveazaBilet } from './BiletActiuni';

// Pagina biletului (ION-197): /ro/bilet/<cod>, /ru/bilet/<cod>. Codul din link e secretul comenzii (128 de biți);
// pagina nu se indexează, nu se cache-uiește, nu trimite referrer (next.config) și nu intră în page_views.
// Conținutul vine de la panou; aici doar se arată. Fără anulare pe pagină (decizia lui Ion, 03.10: doar prin Telegram).

const RED = '#9B1B30';
const BOT = process.env.NEXT_PUBLIC_BOT_USERNAME || 'TransluxMoldova_bot';

const TXT = {
  ro: {
    titlu: 'Biletul tău', astepta: 'În așteptarea plății', platit: 'Plătit', anulat: 'Anulat', returnat: 'Returnat',
    expirat: 'Plata nu a fost finalizată', eroare: 'Plata nu a putut fi pornită', fara_bilet: 'Plata a sosit după expirarea comenzii. Dispecerul o verifică și te sună.',
    plataNu: 'Plata nu a trecut. Poți încerca din nou de pe site.',
    cursa: 'Cursa', pasager: 'Pasager', locuri: 'Locuri', total: 'Total', loc: 'Loc', urcat: 'urcat',
    arata: 'Arată codul QR șoferului la urcare. Fiecare cod e un loc.',
    salveaza: 'Salvează / tipărește', telegram: '📍 Vezi biletul și autobuzul tău în Telegram',
    telegramSub: 'Biletul e mereu la îndemână, iar în ziua cursei vezi pe hartă unde e autobuzul tău și când ajunge la tine.',
    retur: 'Returnarea biletului se cere prin botul nostru din Telegram. Întârzierea la cursă nu se returnează.',
    indisponibil: 'Biletul nu poate fi afișat acum. Reîncarcă pagina peste un minut.', acasa: '← Pagina principală',
  },
  ru: {
    titlu: 'Ваш билет', astepta: 'Ожидает оплаты', platit: 'Оплачен', anulat: 'Отменён', returnat: 'Возвращён',
    expirat: 'Оплата не завершена', eroare: 'Не удалось начать оплату', fara_bilet: 'Оплата пришла после истечения заказа. Диспетчер проверит её и позвонит вам.',
    plataNu: 'Оплата не прошла. Можно попробовать ещё раз на сайте.',
    cursa: 'Рейс', pasager: 'Пассажир', locuri: 'Мест', total: 'Итого', loc: 'Место', urcat: 'посадка',
    arata: 'Покажите QR-код водителю при посадке. Каждый код — одно место.',
    salveaza: 'Сохранить / распечатать', telegram: '📍 Билет и ваш автобус в Telegram',
    telegramSub: 'Билет всегда под рукой, а в день поездки на карте видно, где ваш автобус и когда он подъедет.',
    retur: 'Возврат билета оформляется через наш бот в Telegram. Опоздание на рейс не возвращается.',
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

export async function BiletPage({ cod, locale, plataNu }: { cod: string; locale: Locale; plataNu: boolean }) {
  const tx = TXT[locale];
  const c = await biletPublic(cod);
  if (c === null) notFound();

  return (
    <div className="legal-page">
      <style>{`
        .bilet-qr svg { width: 100%; height: auto; display: block; }
        @media print { .bilet-no-print { display: none !important; } .site-header { display: none !important; } body { background: #fff; } }
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
        <h1>{tx.titlu}</h1>
        {c === 'indisponibil' ? (
          <p>{tx.indisponibil}</p>
        ) : (() => {
          const et = eticheta(c, tx);
          const valide = c.bilete.filter((b) => b.status === 'valid' || b.status === 'urcat');
          const nume = c.ruta ? (locale === 'ru' ? c.ruta.nume_ru : c.ruta.nume_ro) : null;
          return (
            <>
              <p style={{ fontWeight: 700, color: et.culoare, fontSize: 16 }}>{et.text}</p>
              {plataNu && c.status === 'noua' && <p style={{ color: RED }}>{tx.plataNu}</p>}

              <div style={{ display: 'grid', gap: 6, padding: 14, borderRadius: 14, background: '#fff', border: '1px solid #eee', fontSize: 14 }}>
                <div><span style={{ color: '#888' }}>{tx.cursa}: </span><b>{c.from_name} → {c.to_name}</b>{nume && <span style={{ color: '#888' }}> ({nume})</span>}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: RED }}>{dataOra(c.departure_at, locale)}</div>
                <div><span style={{ color: '#888' }}>{tx.pasager}: </span>{c.passenger_name}</div>
                <div><span style={{ color: '#888' }}>{tx.locuri}: </span>{c.seats} · <span style={{ color: '#888' }}>{tx.total}: </span><b>{Number(c.total).toFixed(2)} lei</b></div>
              </div>

              {c.status === 'platita' && valide.length > 0 && (
                <>
                  <p style={{ fontSize: 13, color: '#555' }}>{tx.arata}</p>
                  <div style={{ display: 'grid', gap: 14 }}>
                    {valide.map((b) => (
                      <div key={b.nr} style={{ padding: 14, borderRadius: 14, background: '#fff', border: '1px solid #eee', textAlign: 'center', breakInside: 'avoid' }}>
                        <div style={{ fontSize: 12, color: '#888' }}>{tx.loc} {b.nr}/{c.seats}{b.status === 'urcat' ? ` · ${tx.urcat}` : ''}</div>
                        {/* SVG-ul vine de la panou, generat de biblioteca qrcode din codul biletului (nu din text de la utilizator). */}
                        <div className="bilet-qr" style={{ maxWidth: 260, margin: '8px auto', opacity: b.status === 'urcat' ? 0.35 : 1 }} dangerouslySetInnerHTML={{ __html: b.qr_svg }} />
                        <code style={{ fontSize: 13, letterSpacing: 1 }}>{b.cod_qr}</code>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {c.status === 'noua' && <AsteaptaPlata locale={locale} />}

              {c.status === 'platita' && (
                <div className="bilet-no-print" style={{ display: 'grid', gap: 10, marginTop: 8 }}>
                  {/* Momeala spre bot (Ion, 03.10): biletul la îndemână + unde e autobuzul în ziua cursei. */}
                  <a href={`https://t.me/${BOT}?start=bilet_${c.cod}`} target="_blank" rel="noopener noreferrer" style={{
                    display: 'block', padding: '14px 16px', borderRadius: 14, background: '#229ED9', color: '#fff', textDecoration: 'none',
                    boxShadow: '0 4px 14px rgba(34,158,217,0.3)',
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{tx.telegram}</div>
                    <div style={{ fontSize: 13, opacity: 0.92, marginTop: 4, lineHeight: 1.4 }}>{tx.telegramSub}</div>
                  </a>
                  <SalveazaBilet text={tx.salveaza} />
                </div>
              )}

              <p style={{ fontSize: 12, color: '#888', marginTop: 16 }}>{tx.retur}</p>
            </>
          );
        })()}
        <p className="bilet-no-print"><a href={`/${locale}`} style={{ color: RED }}>{tx.acasa}</a></p>
      </main>
    </div>
  );
}
