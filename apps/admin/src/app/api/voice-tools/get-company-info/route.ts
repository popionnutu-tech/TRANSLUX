import { NextRequest, NextResponse } from 'next/server';
import { validateVoiceApiKey } from '../auth';

const COMPANY_INFO = {
  name: 'TRANSLUX',
  description_ro: 'Companie de transport pasageri pe ruta Chișinău–Bălți și localitățile intermediare',
  description_ru: 'Компания пассажирских перевозок по маршруту Кишинёв–Бельцы и промежуточные населённые пункты',
  phone: '+37360401010',
  stations: {
    chisinau: {
      name_ro: 'Stația Chișinău (Autogara Nord)',
      name_ru: 'Станция Кишинёв (Северный автовокзал)',
      address: 'str. Calea Moșilor 2, Chișinău',
    },
    balti: {
      name_ro: 'Stația Bălți (Autogara)',
      name_ru: 'Станция Бельцы (Автовокзал)',
      address: 'str. Independenței, Bălți',
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
