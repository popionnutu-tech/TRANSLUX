import { NextRequest, NextResponse } from 'next/server';
import { validateVoiceApiKey } from '../auth';
import { phoneSpoken } from '@/lib/phone-spoken';
import { COMPANY_PHONE } from '@/lib/company-phone';
const COMPANY_INFO = {
  name: 'TRANSLUX',
  description_ro: 'Companie de transport pasageri pe ruta Chișinău–Bălți și localitățile intermediare',
  description_ru: 'Компания пассажирских перевозок по маршруту Кишинёв–Бельцы и промежуточные населённые пункты',
  phone: COMPANY_PHONE,
  phone_spoken_ru: phoneSpoken(COMPANY_PHONE)?.ru ?? null,
  phone_spoken_ro: phoneSpoken(COMPANY_PHONE)?.ro ?? null,
  stations: {
    chisinau: {
      name_ro: 'Stația Chișinău (Autogara TRANSLUX)',
      name_ru: 'Станция Кишинёв (автовокзал ТРАНСЛЮКС)',
      // address_* — text (FB bot); address_spoken_* — vocea le citește DOSLOVEN (TTS strică «2/a»)
      address_ro: 'str. Calea Moșilor 2/a, Chișinău',
      address_ru: 'ул. Каля Мошилор 2/а, Кишинёв',
      address_spoken_ro: 'strada Calea Moșilor doi a',
      address_spoken_ru: 'улица Каля Мошилор, два а',
    },
    balti: {
      name_ro: 'Stația Bălți (Autogara, peroanele 15–16)',
      name_ru: 'Станция Бельцы (автовокзал, перроны 15–16)',
      address_ro: 'Autogara Bălți, str. Independenței, peroanele 15–16',
      address_ru: 'автовокзал Бельцы, ул. Индепенденцей, перроны 15–16',
      address_spoken_ro: 'Autogara Bălți, strada Independenței, peroanele cincisprezece și șaisprezece',
      address_spoken_ru: 'автовокзал Бельцы, улица Индепенденцей, перроны пятнадцать и шестнадцать',
    },
  },
  policies: {
    baggage_ro: 'Un bagaj de mână gratuit. Bagaj suplimentar — 20 MDL.',
    baggage_ru: 'Одна ручная кладь бесплатно. Дополнительный багаж — 20 MDL.',
    children_ro: 'Copiii sub 5 ani călătoresc gratuit fără loc separat.',
    children_ru: 'Дети до 5 лет ездят бесплатно без отдельного места.',
    cancellation_ro: 'Anularea gratuită cu minim 2 ore înainte de plecare.',
    cancellation_ru: 'Бесплатная отмена не менее чем за 2 часа до отправления.',
  },
  working_hours: '05:00 — 22:00',
  website: 'translux.md',
};

export async function POST(req: NextRequest) {
  const authError = validateVoiceApiKey(req);
  if (authError) return authError;

  return NextResponse.json(COMPANY_INFO);
}
