import { config } from '../config.js';
import { creeazaTransportPanou, TIMEOUT_IMPLICIT_MS, type OptiuniPanou, type RezultatPanou } from './panouBilete.js';

// ION-252 / ION-247: plângerea clientului din bot ajunge la panou (POST /api/bilete/plangere, cheia BILETE_BOT_API_KEY),
// care o scrie în voice_complaints și o trimite în grupa reclamațiilor, ca la telefon. Botul nu scrie singur în
// voice_complaints: identificarea șoferului și textul grupei stau într-un singur loc, în panou.
// `telegram_id` vine de la apelant, care îl ia DOAR din `ctx.from.id`.

/** Câte caractere din textul clientului pleacă la panou (panoul taie și el la fel). */
export const PLANGERE_TEXT_MAX = 2000;

export interface CererePlangere {
  telegramId: number;
  /** Comanda din care vine plângerea (cea de la 👎 sau biletul cel mai apropiat); panoul verifică legarea. */
  cod: string | null;
  text: string;
  /** file_id-ul pozei trimise de client (cea mai mare variantă), dacă a trimis una. */
  fotoFileId: string | null;
  /** message_id-ul mesajului cu plângerea: cheia de idempotență (reluarea aceluiași mesaj nu dublează plângerea). */
  mesajId: number;
}

/** Ce a răspuns panoul: primită, plafonul de 3 pe zi atins, sau textul respins (gol după curățare). */
export type RaspunsPlangere = { tip: 'primita' } | { tip: 'plafon' } | { tip: 'text_invalid' };

export interface PanouPlangeri {
  plangere(c: CererePlangere): Promise<RezultatPanou<RaspunsPlangere>>;
}

const esteObiect = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Corpul răspunsului → rezultatul; orice altă formă → null (eroare de contract). Pur, testat. */
export function citestePlangere(corp: unknown): RaspunsPlangere | null {
  if (!esteObiect(corp)) return null;
  if (corp.ok === true) return { tip: 'primita' };
  if (corp.ok !== false) return null;
  if (corp.cod === 'plafon') return { tip: 'plafon' };
  if (corp.cod === 'text') return { tip: 'text_invalid' };
  return null;
}

export function creeazaPanouPlangeri(opt: OptiuniPanou): PanouPlangeri {
  const cheama = creeazaTransportPanou(opt);
  return {
    plangere: (c) =>
      cheama(
        {
          metoda: 'POST',
          cale: '/api/bilete/plangere',
          corp: {
            telegram_id: c.telegramId,
            ...(c.cod ? { cod: c.cod } : {}),
            text: c.text.slice(0, PLANGERE_TEXT_MAX),
            ...(c.fotoFileId ? { foto_file_id: c.fotoFileId } : {}),
            mesaj_id: c.mesajId,
          },
          timeoutMs: TIMEOUT_IMPLICIT_MS,
        },
        citestePlangere,
      ),
  };
}

/** Clientul botului, din variabilele de mediu (ADMIN_BASE_URL, BILETE_BOT_API_KEY). */
export const panouPlangeri: PanouPlangeri = creeazaPanouPlangeri({ baseUrl: config.adminBaseUrl, apiKey: config.bileteBotApiKey });
