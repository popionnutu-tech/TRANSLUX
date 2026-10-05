'use server';

import { bileteleClientuluiTelegram, type ComandaPublica, type EroareBileteClient } from '@/lib/bilete-api';
import { parseazaContact, type ContactPrecompletat } from '@/lib/telegram-client';

// Mini app-ul clientului din Telegram (ION-249): pagina trimite initData-ul Telegram, serverul site-ului îl dă mai departe
// panoului, care îl verifică (HMAC cu tokenul botului) și întoarce doar biletele contului. Export din 'use server' =
// acțiune apelabilă de oricine: fără initData valid panoul nu întoarce nimic, aici doar se taie intrările absurde.

/** initData real are câteva sute de caractere; o limită largă oprește corpurile uriașe înainte de rețea. */
const INIT_DATA_MAX = 4096;

export type StareBileteleMele =
  | { ok: true; bilete: ComandaPublica[]; contact: ContactPrecompletat | null }
  | { ok: false; eroare: EroareBileteClient };

export async function bileteleMeleTelegram(initData: unknown): Promise<StareBileteleMele> {
  if (typeof initData !== 'string' || !initData || initData.length > INIT_DATA_MAX) return { ok: false, eroare: 'neautentificat' };
  const r = await bileteleClientuluiTelegram(initData);
  if (!r.ok) return r;
  return { ok: true, bilete: r.bilete, contact: parseazaContact(r.contact) };
}
