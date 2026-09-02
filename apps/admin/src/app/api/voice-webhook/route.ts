import { NextRequest, NextResponse, after } from 'next/server';
import { verifyElevenLabsSignature } from '@/lib/voice/webhook-verify';
import { extractCall, saveVoiceCall, hasCallbackRequest, formatCallReport, type VoiceCallRow } from '@/lib/voice/calls';
import { getComplaintSummary } from '@/lib/voice/complaints';
import { claimLostItemForGroup, releaseLostItemClaim, getLostItemSummary } from '@/lib/voice/lost-items';
import { notifyDriversGroup, formatLostItemForGroup, driversGroupChatId } from '@/lib/voice/drivers-group';
import { alertAdmins, escapeHtml } from '@/lib/telegram-notify';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Coada `after()` face acum două apeluri Telegram (admini + grupa șoferilor).
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
        const callbackAlerted = await hasCallbackRequest(row.conversation_id);
        if (callbackAlerted) {
          // Держим voice_calls.callback_requested в синхроне с voice_callback_requests.
          await getSupabase().from('voice_calls')
            .update({ callback_requested: true })
            .eq('conversation_id', row.conversation_id);
        }
        const complaint = await getComplaintSummary(row.conversation_id);
        await raporteaza(row, callbackAlerted, complaint);
      } catch (err) {
        console.error('voice-webhook notify failed:', err);
      }
    });
  }
  return NextResponse.json({ outcome });
}

/**
 * Raportul apelului: administratorilor și, dacă e cazul, grupei șoferilor.
 *
 * Lucrul uitat pleacă în grupă ACUM, la închiderea apelului (Ion, 02.09). De ce
 * aici și nu din tool: find_past_trip e chemat de 1-3 ori pe convorbire și nu
 * știe când s-a terminat — din el ar pleca trei mesaje pentru același obiect.
 * Rândul se ia cu UPDATE condiționat, deci un webhook repetat nu dublează.
 *
 * Cele două mesaje au try/catch PROPRIU: puse unul după altul într-un singur
 * bloc, o cădere la primul stingea tăcut al doilea, iar repetarea webhook-ului
 * n-ar mai ajunge aici (apelul e deja salvat, deci `duplicate`).
 */
async function raporteaza(
  row: VoiceCallRow,
  callbackAlerted: boolean,
  complaint: Awaited<ReturnType<typeof getComplaintSummary>>,
): Promise<void> {
  // Grupa nelegată: rândul NU se revendică. Altfel prima zi de după deploy —
  // fereastra în care Ion încă n-a scris /lega_reclamatii — ar arde tăcut exact
  // obiectele pentru care s-a făcut totul. Adminii află din raportul apelului.
  const grupaLegata = (await driversGroupChatId()) !== null;
  let lostItem: Awaited<ReturnType<typeof claimLostItemForGroup>> = null;
  if (grupaLegata) {
    try {
      lostItem = await claimLostItemForGroup(row.conversation_id);
    } catch (err) {
      console.error('voice-webhook: claim lost item', err);
    }
  }
  // Linia lucrului uitat pentru ADMINI, mereu — nu doar când grupa lipsește.
  // «Vi-l predăm la birou» e singura promisiune din tot fluxul care cere o
  // acțiune a companiei, iar fără rândul ăsta n-o citea nimeni de la birou.
  const obiect = await getLostItemSummary(row.conversation_id);
  let liniaObiect = '';
  if (obiect) {
    // Escapat ca tot restul mesajului: un singur «&» într-un nume ar face
    // Telegram să respingă ÎNTREG raportul apelului.
    const cine = [obiect.driver_name, obiect.plate]
      .filter((x): x is string => !!x).map(escapeHtml).join(' · ');
    liniaObiect = obiect.identified
      ? (obiect.phone_withheld
        ? `\n🎒 Lucru uitat — la ${cine || 'șofer'}; clientul NU are numărul (avea reclamație): obiectul se predă LA BIROU.`
        : `\n🎒 Lucru uitat — la ${cine || 'șofer'}; clientul are numărul și sună direct.`)
      : '\n🎒 Lucru uitat — cursă neidentificată; obiectul rămâne la șofer.';
    if (!grupaLegata) {
      liniaObiect += '\n⚠️ Grupa șoferilor nu e legată — scrieți /lega_reclamatii în grupă.';
    }
  }
  // Independente: în serie, două taimauturi Telegram de câte 5 secunde s-ar
  // aduna în bugetul invocării.
  const [, grupOk] = await Promise.all([
    alertAdmins(formatCallReport(row, callbackAlerted, complaint) + liniaObiect)
      .catch((err) => { console.error('voice-webhook: alertAdmins', err); return false; }),
    lostItem
      // `complaint !== null` = același apel are și o reclamație. Poarta din
      // find-past-trip acoperă doar ordinea «reclamație → obiect»; în ordinea
      // inversă numărul a plecat deja, iar mesajul măcar îl spune cinstit.
      ? notifyDriversGroup(formatLostItemForGroup(lostItem, complaint !== null))
        .catch((err) => { console.error('voice-webhook: grup', err); return false; })
      : Promise.resolve(true),
  ]);
  // Trimiterea a picat: rândul se dă înapoi, altfel paza contra dublurii ar
  // transforma o cădere de moment în pierdere definitivă.
  if (lostItem && !grupOk) await releaseLostItemClaim(row.conversation_id);
}
