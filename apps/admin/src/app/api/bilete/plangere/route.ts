import { NextRequest, NextResponse, after } from 'next/server';
import { cheieBotValida } from '@/lib/bilete/bot-auth';
import { inregistreazaPlangerea, valideazaCererePlangere, type DepsPlangere } from '@/lib/bilete/plangere';
import { repoPlangeri } from '@/lib/bilete/plangere-repo';
import { chisinauDayStartIso, chisinauTimeOf, chisinauTodayIso } from '@/lib/chisinau-time';
import { complaintTypeLabel, FALLBACK_CODE } from '@/lib/voice/complaint-types';
import { markComplaintGroupNotified } from '@/lib/voice/complaints';
import { formatComplaintForGroup, notifyDriversGroup, notifyDriversGroupPhoto } from '@/lib/voice/drivers-group';
import { normalizePhone } from '@/lib/voice/phone';

// POST /api/bilete/plangere {telegram_id, mesaj_id, text, cod?, foto_file_id?} — plângerea clientului din botul Telegram
// (ION-252 / ION-247). Doar botul (BILETE_BOT_API_KEY). Răspunsuri: 200 {ok:true} · 429 {ok:false, cod:'plafon'} (3/zi/cont)
// · 400 {ok:false, cod:'text'|'telegram_id'|'mesaj_id'} · 401 · 503 (baza). Mesajul în grupă pleacă după răspuns.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const FARA_CACHE = { 'Cache-Control': 'no-store' };

/** Textul și poza în grupa reclamațiilor: mesajul întâi, poza după el (subtitlul arată spre mesaj). */
async function trimiteInGrupa(text: string, fotoFileId: string | null): Promise<boolean> {
  const ok = await notifyDriversGroup(text);
  if (ok && fotoFileId) await notifyDriversGroupPhoto(fotoFileId, '📷 Фото клиента к жалобе выше.');
  return ok;
}

function depsPlangere(): DepsPlangere {
  return {
    repo: repoPlangeri,
    inceputulZilei: chisinauDayStartIso(chisinauTodayIso()),
    oraChisinau: chisinauTimeOf,
    normalizeazaTelefon: normalizePhone,
    tipImplicit: FALLBACK_CODE,
    eticheta: async (code) => {
      const t = await complaintTypeLabel(code);
      return t ? { name_ru: t.name_ru, culprit: t.culprit } : null;
    },
    trimiteInGrupa,
    marcheazaGrupa: markComplaintGroupNotified,
    formateaza: (c) => formatComplaintForGroup(c),
  };
}

export async function POST(req: NextRequest) {
  if (!cheieBotValida(req.headers.get('authorization'))) return NextResponse.json({ ok: false, cod: 'neautorizat' }, { status: 401 });
  const v = valideazaCererePlangere(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ ok: false, cod: v.eroare }, { status: 400, headers: FARA_CACHE });
  try {
    const r = await inregistreazaPlangerea(v.cerere, depsPlangere());
    const notifica = r.notifica;
    if (notifica) {
      after(() => notifica().catch((e) => console.error('[bilete/plangere] grupa:', e instanceof Error ? e.message : e)));
    }
    return NextResponse.json(r.corp, { status: r.status, headers: FARA_CACHE });
  } catch (e) {
    console.error('[bilete/plangere]', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, cod: 'indisponibil' }, { status: 503, headers: FARA_CACHE });
  }
}
