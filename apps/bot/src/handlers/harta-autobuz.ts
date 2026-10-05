import type { InlineKeyboardMarkup } from 'grammy/types';
import type { Limba } from '../types.js';
import type { ComandaHarta, RepoMesajeBilet } from '../services/bileteTelegram.js';
import { alegePozitie, oraChisinau, type CursaAcum, type PozitieAutobuz, type SursaPozitii } from '../services/pozitiiAutobuz.js';
import { BUTOANE, buton } from './retur-texte.js';
import { urlMiniAppClient } from './bilet.js';

// ION-251 (Ion, 05.10: «ok» la demonstrație): cu o oră înainte de plecare clientul primește UN mesaj cu harta
// autobuzului (venue: harta + titlu + adresă) și butonul spre mini app, o singură dată pe comandă. Fără punct GPS
// proaspăt nu se trimite nimic: tickul următor reîncearcă, până la 5 minute după plecare.

/** Textele mesajului cu harta (venue). Pur, testat. */
export function mesajHarta(
  c: Pick<ComandaHarta, 'from_name' | 'departure_at' | 'lang'>,
  p: PozitieAutobuz,
): { titlu: string; adresa: string; buton: string; url: string } {
  const lang: Limba = c.lang === 'ru' ? 'ru' : 'ro';
  const ora = oraChisinau(c.departure_at);
  const echipaj = [p.driver, p.plate].filter((x): x is string => !!x);
  const titlu = lang === 'ru'
    ? `🚌 Ваш автобус сейчас${p.near ? `: около ${p.near}` : ''} (${p.at})`
    : `🚌 Autobuzul tău acum${p.near ? `: lângă ${p.near}` : ''} (${p.at})`;
  const plecare = lang === 'ru' ? `отправление из ${c.from_name} в ${ora}` : `pleacă din ${c.from_name} la ${ora}`;
  return {
    titlu,
    adresa: [...echipaj, plecare].join(' · '),
    buton: buton(BUTOANE.undeAutobuz, lang),
    url: urlMiniAppClient(lang),
  };
}

/** Partea din Bot API de care are nevoie harta (grammY `Api` o satisface). */
export interface ApiHarta {
  sendVenue(
    chatId: number, latitude: number, longitude: number, title: string, address: string,
    other?: { reply_markup?: InlineKeyboardMarkup; disable_notification?: boolean },
  ): Promise<unknown>;
}

export interface DepsHarta {
  repo: RepoMesajeBilet;
  pozitii: SursaPozitii;
  api: ApiHarta;
  nowMs: number;
  jurnal?: (mesaj: string) => void;
}

export interface BilantHarta { trimise: number; faraPunct: number; erori: number }

/** Cursele «Acum» cerute o singură dată pe perechea de localități, într-un tick. */
function cacheCurse(pozitii: SursaPozitii): (from: string, to: string) => Promise<CursaAcum[]> {
  const cerute = new Map<string, Promise<CursaAcum[]>>();
  return (from, to) => {
    const cheie = `${from}\u0000${to}`;
    let p = cerute.get(cheie);
    if (!p) { p = pozitii.curse(from, to); cerute.set(cheie, p); }
    return p;
  };
}

async function trimiteHarta(c: ComandaHarta, p: PozitieAutobuz, deps: DepsHarta): Promise<void> {
  const m = mesajHarta(c, p);
  await deps.api.sendVenue(c.telegram_id, p.lat, p.lon, m.titlu, m.adresa, {
    reply_markup: { inline_keyboard: [[{ text: m.buton, web_app: { url: m.url } }]] },
  });
}

/**
 * Tickul hărții: comenzile din fereastră, fiecare cu punctul ei proaspăt → mesajul; marcajul în bază abia după
 * trimiterea reușită. O comandă căzută nu le oprește pe celelalte.
 */
export async function trimiteHartileScadente(deps: DepsHarta): Promise<BilantHarta> {
  const jurnal = deps.jurnal ?? ((m: string) => console.warn(m));
  const curse = cacheCurse(deps.pozitii);
  const bilant: BilantHarta = { trimise: 0, faraPunct: 0, erori: 0 };
  for (const c of await deps.repo.comenziPentruHarta(deps.nowMs)) {
    try {
      const p = alegePozitie(await curse(c.from_name, c.to_name), oraChisinau(c.departure_at), deps.nowMs);
      if (!p) { bilant.faraPunct++; continue; }
      await trimiteHarta(c, p, deps);
      await deps.repo.marcheazaHartaTrimisa(c.cod);
      bilant.trimise++;
    } catch (e) {
      bilant.erori++;
      jurnal(`[bilete/harta] ${c.cod.slice(0, 8)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return bilant;
}
