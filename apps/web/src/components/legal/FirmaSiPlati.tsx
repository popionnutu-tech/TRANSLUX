import type { Locale } from '@/lib/i18n';
import { OPERATOR } from './legal-content';

/**
 * Datele firmei și logourile plăților (ION-235, cerințele maib pentru site, 05.10.2026):
 * «date de contact: IDNO, denumirea juridică, adresa juridică» și logourile maib + sistemelor internaționale
 * de plăți (recomandat în subsol). Logourile sunt din pachetul oficial maib (docs.maibmerchants.md).
 */
export function FirmaSiPlati({ locale }: { locale: Locale }) {
  const ru = locale === 'ru';
  return (
    <div style={{ display: 'grid', gap: 8, justifyItems: 'center', textAlign: 'center', fontSize: 11, color: '#888', lineHeight: 1.5 }}>
      <div>
        {OPERATOR.name} · IDNO {OPERATOR.idno} · {OPERATOR.address} · {OPERATOR.phone}
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }} aria-label={ru ? 'Принимаем к оплате' : 'Acceptăm plata cu'}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/plati/maib.png" alt="maib" width={78} height={22} style={{ height: 22, width: 'auto' }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/plati/visa.png" alt="Visa" width={56} height={18} style={{ height: 18, width: 'auto' }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/plati/mastercard.png" alt="Mastercard" width={37} height={23} style={{ height: 23, width: 'auto' }} />
      </div>
    </div>
  );
}
