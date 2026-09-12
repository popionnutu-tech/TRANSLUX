import type { Locale } from '@/lib/i18n';
import { cookiesDoc, privacyDoc, type LegalDoc } from './legal-content';

type Kind = 'privacy' | 'cookies';

const SLUG: Record<Kind, string> = { privacy: 'confidentialitate', cookies: 'cookies' };

const NAV = {
  ro: { home: '← Pagina principală', privacy: 'Politica de confidențialitate', cookies: 'Politica cookie', settings: 'Setări cookie' },
  ru: { home: '← Главная', privacy: 'Политика конфиденциальности', cookies: 'Политика cookie', settings: 'Настройки cookie' },
} as const;

export function legalDoc(kind: Kind, locale: Locale): LegalDoc {
  return kind === 'privacy' ? privacyDoc(locale) : cookiesDoc(locale);
}

/** Pagină juridică statică (server component) — aceeași coajă pentru ambele politici și limbi. */
export function LegalPage({ kind, locale }: { kind: Kind; locale: Locale }) {
  const doc = legalDoc(kind, locale);
  const nav = NAV[locale];
  const other: Kind = kind === 'privacy' ? 'cookies' : 'privacy';
  const otherLocale: Locale = locale === 'ro' ? 'ru' : 'ro';

  return (
    <div className="legal-page">
      <header className="site-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 40px' }}>
        <a href={`/${locale}`} aria-label="TRANSLUX">
          <span style={{
            display: 'inline-block', height: 30, aspectRatio: '1318/192',
            backgroundColor: '#9B1B30',
            WebkitMaskImage: 'url(/translux-logo-red.png)', WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat',
            maskImage: 'url(/translux-logo-red.png)', maskSize: 'contain', maskRepeat: 'no-repeat',
          }} />
        </a>
        <a href={`/${otherLocale}/${SLUG[kind]}`} className="legal-lang">{otherLocale.toUpperCase()}</a>
      </header>

      <main className="legal-main">
        <h1>{doc.title}</h1>
        <p className="legal-intro">{doc.intro}</p>
        {doc.sections.map((s) => (
          <section key={s.title}>
            <h2>{s.title}</h2>
            {renderBody(s.body)}
          </section>
        ))}
        <nav className="legal-nav">
          <a href={`/${locale}`}>{nav.home}</a>
          <a href={`/${locale}/${SLUG[other]}`}>{nav[other]}</a>
        </nav>
      </main>
    </div>
  );
}

/** Paragrafele consecutive care încep cu «- » devin o singură listă. */
function renderBody(body: string[]) {
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      out.push(<ul key={`l${out.length}`}>{list.map((li) => <li key={li}>{li}</li>)}</ul>);
      list = [];
    }
  };
  for (const p of body) {
    if (p.startsWith('- ')) list.push(p.slice(2));
    else { flush(); out.push(<p key={`p${out.length}`}>{p}</p>); }
  }
  flush();
  return out;
}
