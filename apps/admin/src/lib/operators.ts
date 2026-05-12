// Operator display names mapped by Telegram ID
export const OPERATOR_NAMES: Record<number, string> = {
  448654456: 'Ion Pop',
  7115941429: 'Vitalie (Pepsi)',
  1407418059: 'Iurie',
  8688366642: 'Aurel',
  8272266229: 'Ion',
};

// Iurie's telegram_id — used for TikTok bonus calculation
export const IURIE_TELEGRAM_ID = 1407418059;

export function getOperatorName(telegramId: number | null, username: string | null): string {
  if (telegramId && OPERATOR_NAMES[telegramId]) {
    return OPERATOR_NAMES[telegramId];
  }
  return username ? `@${username}` : '—';
}
