import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { verifyCronSecret } from '@/lib/cron-auth';
import { chisinauTodayIso } from '@/lib/chisinau-time';
import { graficGroupChatId } from '@/lib/grafic-group';
import { deleteTelegramMessage, pinTelegramMessage, sendTelegram, sendTelegramPhoto, sendTelegramText, sendTelegramVideoId } from '@/lib/telegram-notify';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// ION-189 (Ion, 02.10.2026): anunț zilnic în grupa Mejgorod, în rusă, despre lansarea vânzării de bilete online
// (după 12 octombrie): verificarea și confirmarea biletelor se fac prin Telegram, șoferul fără cont Telegram și
// telefon nu pleacă în cursă. Ion, 02.10 seara: «И телефона важно» → telefonul e punct separat, îngroșat; apoi formularea lui: «Без аккаунта и современного телефона». «După ce vom lansa plata online, mesajul să nu mai plece» → se oprește când
// app_config.bilete_online_lansat are o dată ≤ azi.
//
// Cron: VPS root@217.26.149.23, crontab 0 8 * * * (Vercel Hobby are doar 2 cron-uri, ambele ocupate).
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://central-hub-md.vercel.app/api/cron/anunt-bilete-online
// ?dry=1 arată textul fără să trimită; ?force=1 retrimite azi; ?lansat=YYYY-MM-DD pune data lansării (oprește anunțul).

const ULTIMA = 'anunt_bilete_online_ultima';
const LANSAT = 'bilete_online_lansat';
// ION-234 (Ion, 05.10): «trimite mesaj în rusă în grupă zilnic până pe 12 că șoferul trebuie să se lege în bot».
const LEGARE_ULTIMA = 'anunt_legare_sofer_ultima';
const BOT = process.env.NEXT_PUBLIC_BOT_USERNAME || 'TransluxMoldova_bot';
const LINK_LEGARE = `https://t.me/${BOT}?start=sofer`;
// Ion, 06.10: anunțul zilnic = videoul «Мои билеты — пошагово» (1:44) cu textul de mai jos sub el, într-un singur mesaj.
// Videoul e încărcat o dată la Telegram; file_id-ul stă în app_config (fără el pleacă doar textul).
const VIDEO_KEY = 'video_sofer_bilete_file_id';
// Ion, 07.10: «unește aceste 2 mesaje în unul și scurt să fie, nu așa de lung, și de la mine să fie doar 1» —
// anunțul lung (TEXT_ANUNT) și videoul cu legarea au devenit UN singur mesaj zilnic: videoul + textul ăsta.
const TEXT_ANUNT_ZILNIC = [
  '🎫 <b>Онлайн-билеты TRANSLUX — после 12 октября</b>',
  '',
  '📱 Каждому водителю нужен <b>смартфон с интернетом и Telegram</b>. Без них и без умения сканировать билет <b>к рейсу не допускаем.</b>',
  '',
  '1️⃣ Один раз: «🔗 Привязать мой Telegram» → «Отправить мой номер».',
  '2️⃣ При посадке: «🎫 Мои билеты» → «Сканировать билет».',
  '',
  'Сначала — Бричаны и Единец, позже Бельцы. Продажа закрывается за 2 часа до рейса, билеты оплачены заранее.',
  '🎬 На видео — пошагово.',
].join('\n');
const TEXT_LEGARE = [
  '🔗 <b>Привяжите свой Telegram — один раз</b>',
  '',
  'Чтобы онлайн-билеты работали, система должна знать, какой водитель за каким телефоном. Нажмите кнопку ниже, затем в боте — «Отправить мой номер». Это занимает 10 секунд.',
  '',
  'Сканирование билетов пассажиров будет здесь, в этом боте.',
  '',
  'Если бот ответил, что номер не найден — скажите диспетчеру.',
].join('\n');
// ION-241: al doilea rând — intrarea în mini app-ul biletelor. În grupă nu merge `web_app`, deci linkul duce în
// privat (`/start bilete_azi`): botul dă butonul web_app șoferului legat, iar celui nelegat îi cere contactul.
const LINK_BILETE = `https://t.me/${BOT}?start=bilete_azi`;
const BUTON_LEGARE = { inline_keyboard: [
  [{ text: '🔗 Привязать мой Telegram', url: LINK_LEGARE }],
  [{ text: '🎫 Мои билеты', url: LINK_BILETE }],
] };
// Ion, 05.10: «butonul pentru șofer să fie și în Mejgorod, și în bot» → un mesaj FIXAT în grupă cu ambele butoane
// (legare + «Мои билеты»), trimis o dată cu ?fixeaza=1; id-ul în app_config ca să se poată șterge/înlocui.
const FIXAT_ID = 'mesaj_fixat_bilete_sofer_id';
const TEXT_FIXAT = [
  '🎫 <b>Мои билеты — для водителей</b>',
  '',
  '1. Один раз: «Привязать мой Telegram» → «Отправить мой номер».',
  '2. Каждый день: кнопка «Мои билеты» → список пассажиров с онлайн-билетами на ваш рейс.',
  '3. При посадке: «Сканировать билет» → навести камеру. Зелёный и оранжевый — садится, красный — нет.',
].join('\n');
// Ion, 05.10: «dă-mi mie zilnic raport câți șoferi din cei care stabil apar în grafic sunt legați sau nu».
// Stabil = cel puțin 3 zile cu cursă INTERURBANĂ în ultimele 14 (tur sau retur), din daily_assignments. Raportul merge adminilor
// (privatul lui Ion) o dată pe zi, cât timp mai e cineva nelegat.
const RAPORT_ULTIMA = 'raport_legare_sofer_ultima';
// id-urile mesajelor raportului trimise azi: {ziua, mesaje:[{chat,id}]} — ca retrimiterea să le poată șterge.
const RAPORT_MESAJE = 'raport_legare_sofer_mesaje';
// Ion, 05.10: «trimite lui Iura zilnic mesaj câți s-au logat și cine nu s-a logat» — Iurie, executorul sarcinilor
// (users.id 34936fff…, rol DIGITAL, are Telegram), primește același raport ca adminii.
const IURIE_USER_ID = '34936fff-947e-4328-bcd9-7c99ceefe176';
const ZILE_GRAFIC = 14;
const PRAG_STABIL = 3;

async function raportLegare(sb: ReturnType<typeof getSupabase>, azi: string): Promise<{ text: string; stabili: number; legati: number } | null> {
  const de = new Date(`${azi}T00:00:00Z`);
  de.setUTCDate(de.getUTCDate() - ZILE_GRAFIC);
  const deLa = de.toISOString().slice(0, 10);
  const [{ data: da }, { data: dr }, { data: rute }] = await Promise.all([
    sb.from('daily_assignments').select('assignment_date, driver_id, driver_id_retur, crm_route_id, retur_route_id').gte('assignment_date', deLa).lte('assignment_date', azi),
    sb.from('drivers').select('id, full_name, telegram_id').eq('active', true).neq('is_test', true),
    sb.from('crm_routes').select('id').eq('route_type', 'interurban'),
  ]);
  if (!da || !dr || !rute) return null;
  // Ion, 07.10: «o mare parte din șoferi nu sunt în general la interurban, de ce apar în grafic?» — biletele online
  // sunt doar pe interurban, deci contează DOAR zilele pe o rută interurbană. Suburbanul umplea lista cu 9 șoferi
  // care n-au nicio cursă interurbană (Gusevatii, Crestianov, Tichem…).
  const interurban = new Set((rute as { id: number }[]).map(r => r.id));
  const zile = new Map<string, Set<string>>();
  for (const r of da as { assignment_date: string; driver_id: string | null; driver_id_retur: string | null; crm_route_id: number | null; retur_route_id: number | null }[]) {
    for (const [d, ruta] of [[r.driver_id, r.crm_route_id], [r.driver_id_retur, r.retur_route_id]] as const) {
      if (!d || ruta == null || !interurban.has(ruta)) continue;
      if (!zile.has(d)) zile.set(d, new Set());
      zile.get(d)!.add(r.assignment_date);
    }
  }
  const soferi = (dr as { id: string; full_name: string; telegram_id: number | null }[])
    .map(x => ({ ...x, zile: zile.get(x.id)?.size ?? 0 }))
    .filter(x => x.zile >= PRAG_STABIL)
    .sort((a, b) => b.zile - a.zile || a.full_name.localeCompare(b.full_name, 'ro'));
  const legati = soferi.filter(x => x.telegram_id != null);
  const nelegati = soferi.filter(x => x.telegram_id == null);
  const [y, m, d] = azi.split('-');
  const text = [
    `🔗 <b>Legare Telegram șoferi — ${d}.${m}.${y}</b>`,
    `Interurban stabil (≥${PRAG_STABIL} zile din ${ZILE_GRAFIC}): <b>${soferi.length}</b> · legați: <b>${legati.length}</b> · nelegați: <b>${nelegati.length}</b>`,
    '',
    nelegati.length ? '<b>Nelegați</b> (zile în grafic):' : '✅ Toți șoferii stabili sunt legați.',
    ...nelegati.map(x => `• ${x.full_name} — ${x.zile}`),
    legati.length ? `\n<b>Legați:</b> ${legati.map(x => x.full_name).join(', ')}` : '',
  ].filter(l => l !== '').join('\n');
  return { text, stabili: soferi.length, legati: legati.length };
}


export async function GET(req: NextRequest) {
  const authError = verifyCronSecret(req);
  if (authError) return authError;
  const q = req.nextUrl.searchParams;
  const sb = getSupabase();
  const azi = chisinauTodayIso();
  const acum = new Date().toISOString();

  // Ion, 05.10: «poza infografică pune pin în grupa Mejgorod» — imaginea cu cei 6 pași (servită de panou), trimisă și fixată o dată.
  if (q.get('infografica') === '1') {
    const chatId = await graficGroupChatId();
    if (!chatId) return NextResponse.json({ error: 'Grupa Mejgorod nu e legată (/lega_grafic).' }, { status: 500 });
    const origine = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'https://central-hub-md.vercel.app';
    const img = await fetch(`${origine}/mini-app/bilete/infografica-ru.png`, { signal: AbortSignal.timeout(10000) });
    if (!img.ok) return NextResponse.json({ error: `imaginea: ${img.status}` }, { status: 502 });
    const png = Buffer.from(await img.arrayBuffer());
    const foto = await sendTelegramPhoto(chatId, png, '🎫 <b>Мои билеты — 6 шагов для водителя</b>\nСохраните картинку: что нажать и что увидите.', 'moi-bilety-6-shagov.png');
    const mid = foto.messageId;
    if (!mid) return NextResponse.json({ error: 'Telegram nu a primit imaginea' }, { status: 502 });
    const fixat = await pinTelegramMessage(chatId, mid);
    await sb.from('app_config').upsert({ key: 'mesaj_fixat_infografica_sofer_id', value: String(mid), updated_at: acum }, { onConflict: 'key' });
    return NextResponse.json({ ok: true, message_id: mid, fixat });
  }

  if (q.get('fixeaza') === '1') {
    const chatId = await graficGroupChatId();
    if (!chatId) return NextResponse.json({ error: 'Grupa Mejgorod nu e legată (/lega_grafic).' }, { status: 500 });
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return NextResponse.json({ error: 'fără TELEGRAM_BOT_TOKEN' }, { status: 500 });
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: TEXT_FIXAT, parse_mode: 'HTML', reply_markup: BUTON_LEGARE }),
      signal: AbortSignal.timeout(10000),
    });
    const j = (await resp.json().catch(() => null)) as { ok?: boolean; result?: { message_id?: number }; description?: string } | null;
    const mid = j?.ok ? j.result?.message_id ?? null : null;
    if (!mid) return NextResponse.json({ error: j?.description ?? 'Telegram nu a primit mesajul' }, { status: 502 });
    const fixat = await pinTelegramMessage(chatId, mid);
    await sb.from('app_config').upsert({ key: FIXAT_ID, value: String(mid), updated_at: acum }, { onConflict: 'key' });
    return NextResponse.json({ ok: true, message_id: mid, fixat });
  }

  const lansatParam = q.get('lansat');
  if (lansatParam) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lansatParam)) return NextResponse.json({ error: 'lansat=YYYY-MM-DD' }, { status: 400 });
    const { error } = await sb.from('app_config').upsert({ key: LANSAT, value: lansatParam, updated_at: acum }, { onConflict: 'key' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, lansat: lansatParam });
  }

  const { data: cfg } = await sb.from('app_config').select('key, value').in('key', [ULTIMA, LANSAT, LEGARE_ULTIMA, RAPORT_ULTIMA]);
  const val = (k: string) => (cfg ?? []).find(r => r.key === k)?.value?.trim() || null;
  const lansat = val(LANSAT);
  if (lansat && lansat <= azi) return NextResponse.json({ skipped: 'lansat', lansat });
  if (q.get('dry') === '1') return NextResponse.json({ dry: true, azi, lansat, text: TEXT_ANUNT_ZILNIC, caractere: TEXT_ANUNT_ZILNIC.replace(/<[^>]+>/g, '').length, video: VIDEO_KEY, reply_markup: BUTON_LEGARE, raport: await raportLegare(sb, azi) });
  const force = q.get('force') === '1';
  const doarRaport = q.get('raport') === '1'; // retrimite doar raportul (ex. după ce s-a adăugat un destinatar)
  const chatId = await graficGroupChatId();
  if (!chatId) return NextResponse.json({ error: 'Grupa Mejgorod nu e legată (/lega_grafic).' }, { status: 500 });

  const out: Record<string, unknown> = { azi };
  // UN singur mesaj pe zi (Ion, 07.10): videoul + TEXT_ANUNT_ZILNIC + butoanele, până la lansare. Anunțul lung
  // de dinainte (TEXT_ANUNT) nu mai pleacă separat; legarea nu mai expiră pe 12.10, rămâne în același mesaj.
  if (doarRaport || ((val(ULTIMA) === azi || val(LEGARE_ULTIMA) === azi) && !force)) out.anunt = 'azi';
  else {
    const { data: vid } = await sb.from('app_config').select('value').eq('key', VIDEO_KEY).maybeSingle();
    const ok = vid?.value
      ? await sendTelegramVideoId(chatId, String(vid.value), TEXT_ANUNT_ZILNIC, BUTON_LEGARE)
      : await sendTelegram(chatId, TEXT_ANUNT_ZILNIC, BUTON_LEGARE);
    if (!ok) return NextResponse.json({ ...out, error: 'Telegram nu a primit anunțul' }, { status: 502 });
    await sb.from('app_config').upsert([
      { key: ULTIMA, value: azi, updated_at: acum },
      { key: LEGARE_ULTIMA, value: azi, updated_at: acum },
    ], { onConflict: 'key' });
    out.anunt = 'trimis';
  }
  // câți șoferi interurbani activi sunt legați (doar în răspuns, nu în grupă)
  const { data: dr } = await sb.from('drivers').select('telegram_id').eq('active', true).neq('is_test', true).eq('is_lde', false);
  out.soferi = { legati: (dr ?? []).filter(r => r.telegram_id != null).length, activi: (dr ?? []).length };

  // Raportul zilnic pentru Ion: șoferii stabili din grafic, legați / nelegați (o dată pe zi, cât mai e cineva nelegat)
  if (val(RAPORT_ULTIMA) === azi && !force && !doarRaport) out.raport = 'azi';
  else {
    const r = await raportLegare(sb, azi);
    if (!r) out.raport = 'fara_date';
    else {
      // Ion, 07.10: «șterge lista dată azi dimineață și pune încă o dată corectat» — retrimiterea din aceeași zi
      // șterge întâi mesajele trimise azi (id-urile stau în app_config), ca să nu rămână două liste diferite.
      const { data: prev } = await sb.from('app_config').select('value').eq('key', RAPORT_MESAJE).maybeSingle();
      let vechi: { ziua?: string; mesaje?: { chat: number; id: number }[] } = {};
      try { vechi = JSON.parse(prev?.value ?? '{}'); } catch { /* valoare stricată = nimic de șters */ }
      if (vechi.ziua === azi) {
        await Promise.all((vechi.mesaje ?? []).map(m => deleteTelegramMessage(m.chat, m.id)));
      }
      const [{ data: admini }, { data: iurie }] = await Promise.all([
        sb.from('users').select('telegram_id').eq('role', 'ADMIN').eq('active', true).not('telegram_id', 'is', null),
        sb.from('users').select('telegram_id').eq('id', IURIE_USER_ID).eq('active', true).maybeSingle(),
      ]);
      const destinatari = [...new Set([
        ...(admini ?? []).map(a => Number(a.telegram_id)),
        ...(iurie?.telegram_id ? [Number(iurie.telegram_id)] : []),
      ].filter(Boolean))];
      const ids = await Promise.all(destinatari.map(chat => sendTelegramText(chat, r.text)));
      const mesaje = destinatari.flatMap((chat, i) => (ids[i] ? [{ chat, id: ids[i] as number }] : []));
      const ok = mesaje.length > 0;
      out.raport_iurie = !!iurie?.telegram_id && mesaje.some(m => m.chat === Number(iurie.telegram_id));
      if (ok) {
        await sb.from('app_config').upsert([
          { key: RAPORT_ULTIMA, value: azi, updated_at: acum },
          { key: RAPORT_MESAJE, value: JSON.stringify({ ziua: azi, mesaje }), updated_at: acum },
        ], { onConflict: 'key' });
      }
      out.raport = ok ? { trimis: true, stabili: r.stabili, legati: r.legati, sterse: vechi.ziua === azi ? vechi.mesaje?.length ?? 0 : 0 } : 'netrimis';
    }
  }
  return NextResponse.json({ ok: true, ...out });
}
