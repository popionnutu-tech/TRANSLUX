import { NextRequest, NextResponse, after } from 'next/server';
import { verifyElevenLabsSignature } from '@/lib/voice/webhook-verify';
import { extractCall, saveVoiceCall, hasCallbackRequest, type VoiceCallRow } from '@/lib/voice/calls';
import {
  claimLostItemForGroup, releaseLostItemClaim, getLostItemSummary,
} from '@/lib/voice/lost-items';
import { notifyDriversGroup, formatLostItemForGroup, driversGroupChatId } from '@/lib/voice/drivers-group';
import { getComplaintSummary } from '@/lib/voice/complaints';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Coada `after()` face un singur apel Telegram (grupa șoferilor) din 21.09.
// Limita explicită, ca la celelalte rute grele: nu depindem de valoarea implicită
// a platformei, care s-ar putea schimba sub noi (performance review 02.09).
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'ELEVENLABS_WEBHOOK_SECRET missing' }, { status: 500 });
  }

  // Raw body ДО JSON.parse — иначе HMAC не сойдётся.
  const rawBody = await req.text();
  const sig = req.headers.get('elevenlabs-signature');
  if (!verifyElevenLabsSignature(rawBody, sig, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (payload?.type !== 'post_call_transcription') {
    return NextResponse.json({ ignored: payload?.type ?? 'unknown' });
  }

  const row = extractCall(payload);
  if (!row.conversation_id) {
    return NextResponse.json({ error: 'No conversation_id' }, { status: 400 });
  }

  const outcome = await saveVoiceCall(row, payload);
  if (outcome === 'inserted') {
    // ВАЖНО: уведомление — ПОСЛЕ ответа 200 и в try/catch. Если оно упадёт после
    // сохранения звонка, роут НЕ должен вернуть 500: ретрай ElevenLabs увидит
    // duplicate и отчёт не уйдёт уже никогда.
    after(async () => {
      try {
        if (await hasCallbackRequest(row.conversation_id)) {
          // Держим voice_calls.callback_requested в синхроне с voice_callback_requests.
          await getSupabase().from('voice_calls')
            .update({ callback_requested: true })
            .eq('conversation_id', row.conversation_id);
        }
        await raporteaza(row);
      } catch (err) {
        console.error('voice-webhook notify failed:', err);
      }
    });
  }
  return NextResponse.json({ outcome });
}

/**
 * Ce mai pleacă din apel la închiderea lui: DOAR lucrul uitat.
 *
 * Raportul pe fiecare apel («📞 Apel TRANSLUX») a ieșit pe 15.09 — Ion: «am nevoie
 * doar statistica săptămânală de sunete, câte sunete agentul a dat în bară și nu a
 * putut rezolva». Numărătoarea aceea se face acum o dată pe săptămână, în
 * lib/voice-weekly.ts. Reclamațiile pleacă în grupa șoferilor din tool-ul lor
 * (register-complaint); cererile de operator rămân doar evidență în bază.
 *
 * Lucrul uitat pleacă în grupă ACUM, la închiderea apelului (Ion, 02.09). De ce
 * aici și nu din tool: find_past_trip e chemat de 1-3 ori pe convorbire și nu
 * știe când s-a terminat — din el ar pleca trei mesaje pentru același obiect.
 * Rândul se ia cu UPDATE condiționat, deci un webhook repetat nu dublează.
 *
 * Copia pentru ADMINI a ieșit pe 21.09 (Ion: «nu am nevoie toate aceste să vină
 * la mine»; regula: «ce trebuie să plece în Mejgorod — pleacă, ce nu — rămâne în
 * bază»). Grupa șoferilor e legată și primește același obiect, deci mesajul din
 * privat era o dublură, nu singurul destinatar.
 */
async function raporteaza(row: VoiceCallRow): Promise<void> {
  const obiect = await getLostItemSummary(row.conversation_id);
  if (!obiect) return;

  // Grupa nelegată: rândul NU se revendică, ca să plece la prima rulare de după
  // legare. Din 21.09 nu mai există nici mesajul către admini care acoperea
  // fereastra asta — obiectul rămâne doar în voice_lost_items până atunci.
  const grupaLegata = (await driversGroupChatId()) !== null;
  if (!grupaLegata) return;
  let lostItem: Awaited<ReturnType<typeof claimLostItemForGroup>> = null;
  try {
    lostItem = await claimLostItemForGroup(row.conversation_id);
  } catch (err) {
    console.error('voice-webhook: claim lost item', err);
  }
  if (!lostItem) return;

  // Reclamația aceluiași apel: în grupă, numărul clientului se dă altfel când
  // omul a și reclamat (vezi formatLostItemForGroup).
  const complaint = await getComplaintSummary(row.conversation_id);

  // `complaint !== null` = același apel are și o reclamație. Poarta din
  // find-past-trip acoperă doar ordinea «reclamație → obiect»; în ordinea
  // inversă numărul a plecat deja, iar mesajul măcar îl spune cinstit.
  // Numărul vine din apelul însuși, nu din ce a scris modelul — aceeași
  // sursă ca la callback (măsurat 24.08: ce scrie modelul e adesea null).
  const grupOk = await notifyDriversGroup(
    formatLostItemForGroup({ ...lostItem, caller_phone: row.caller_phone }, complaint !== null),
  ).catch((err) => { console.error('voice-webhook: grup', err); return false; });
  // Trimiterea a picat: rândul se dă înapoi, altfel paza contra dublurii ar
  // transforma o cădere de moment în pierdere definitivă.
  if (!grupOk) await releaseLostItemClaim(row.conversation_id);
}
