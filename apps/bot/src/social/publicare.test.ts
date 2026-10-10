import '../test/mocks.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installMocks, alerts } from '../test/mocks.js';
import type { FakeSupabase, Row } from '../test/fakeSupabase.js';

// Mașina de stări a publicatorului (dezbaterea 10.10, BL-5 / SBE-6): luarea atomică, reîncercările, deblocarea, proba,
// lista albă la ora publicării, clipul schimbat, mutarea în timpul trecerii (C1). Supabase, Telegram, descărcarea și
// Upload-Post sunt false; logica stărilor e cea reală.

vi.mock('../supabase.js', () => import('../test/mocks.js').then((m) => m.supabaseModuleFactory()));
vi.mock('../services/adminAlert.js', () => import('../test/mocks.js').then((m) => m.adminAlertModuleFactory()));

const h = vi.hoisted(() => ({
  descarca: vi.fn(),
  publica: vi.fn(),
  stare: vi.fn(),
  /** când e pus, citirea topicului / a listei aruncă (bază căzută) */
  topicCade: false,
  listaCade: false,
  ffmpeg: false,
  analiza: vi.fn(),
  conversie: vi.fn(),
}));

vi.mock('./descarcare.js', async (orig) => {
  const real = await orig<typeof import('./descarcare.js')>();
  return { ...real, descarcaClip: h.descarca, stergeTemporar: async () => {} };
});
vi.mock('./uploadPost.js', async (orig) => {
  const real = await orig<typeof import('./uploadPost.js')>();
  return { ...real, publica: h.publica, stareaPublicarii: h.stare };
});
// tokenul botului (setup-ul testelor îl lasă gol, ca nimic să nu ajungă la Telegram)
vi.mock('./comun.js', async (orig) => {
  const real = await orig<typeof import('./comun.js')>();
  return {
    ...real,
    tokenBot: () => 'token-test',
    topicDupaId: async (id: string) => { if (h.topicCade) throw new Error('social_topics: timeout'); return real.topicDupaId(id); },
    esteBlogger: async (t: string, u: number) => { if (h.listaCade) throw new Error('social_bloggers: timeout'); return real.esteBlogger(t, u); },
  };
});
vi.mock('./conversie.js', async (orig) => {
  const real = await orig<typeof import('./conversie.js')>();
  return { ...real, ffmpegDisponibil: () => h.ffmpeg, analizeaza: h.analiza, converteste: h.conversie };
});
vi.mock('./texte.js', async (orig) => {
  const real = await orig<typeof import('./texte.js')>();
  return { ...real, scrieText: async () => ({ text: 'Text nou', ai: true }) };
});
vi.mock('node:fs', async (orig) => {
  const real = await orig<typeof import('node:fs')>();
  return { ...real, openAsBlob: async () => new Blob(['video']) };
});

const { trecerePublicare, BLOCAT_DUPA_MS, textRezultat, complet } = await import('./publicare.js');
const { initSocial } = await import('./comun.js');
const { ClipSchimbat } = await import('./descarcare.js');
const { EroareUploadPost } = await import('./uploadPost.js');
const { primesteClip, trateazaMesajSocial } = await import('./primire.js');
const { dejaVazuta } = await import('./index.js');

const trimise: string[] = [];
const apiFals = {
  sendMessage: async (_chat: number, text: string) => { trimise.push(text); return { message_id: trimise.length }; },
  editMessageReplyMarkup: async () => true,
  editMessageText: async () => true,
};

const TOPIC = 'aaaaaaaa-0000-4000-8000-000000000001';
const BLOGGER = 5001;

function topic(extra: Row = {}): Row {
  return {
    id: TOPIC, bot: 'translux', chat_id: -1001, thread_id: 7, nume: 'Translux 1', upload_post_user: 'translux1',
    platforme: ['tiktok', 'facebook'], facebook_page_id: null, descriere: null, hashtags: [], ore: ['12:30'],
    decalaj_min: 0, max_pe_zi: 1, primul_comentariu: null, activ: true, ...extra,
  };
}

let seq = 0;
function post(extra: Row = {}): Row {
  seq++;
  return {
    id: `bbbbbbbb-0000-4000-8000-${String(seq).padStart(12, '0')}`, topic_id: TOPIC, tip: 'video', chat_id: -1001, thread_id: 7,
    message_id: 100 + seq, file_unique_id: `u${seq}`, file_size: 1000, durata_s: 30, mime: 'video/mp4',
    autor_telegram_id: BLOGGER, autor_nume: 'B', nota_autor: null, text_final: 'Text', text_ai: true,
    planificat_la: new Date(Date.now() - 60_000).toISOString(), stare: 'planificat', incercari: 0, luat_la: null,
    upload_request_id: null, rezultate: null, eroare: null, mesaj_confirmare_id: 9, anulat_de: null, publicat_la: null,
    upload_post_user: 'translux1', platforme: ['tiktok', 'facebook'], facebook_page_id: null, in_proba: false, trimis_posibil: false,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...extra,
  };
}

let fake: FakeSupabase;
const rand = (id: string) => fake._tables.social_posts.find((r) => r.id === id)!;

function instaleaza(posts: Row[], t: Row = topic()): void {
  fake = installMocks({
    tables: {
      social_topics: [t],
      social_bloggers: [{ topic_id: TOPIC, telegram_id: BLOGGER, nume: 'B', adaugat_de: 1, created_at: new Date().toISOString() }],
      social_posts: posts,
      users: [],
    },
  });
}

beforeEach(() => {
  h.topicCade = false;
  h.ffmpeg = false;
  h.analiza.mockReset();
  h.conversie.mockReset().mockResolvedValue(250 * 1024 * 1024);
  h.listaCade = false;
  trimise.length = 0;
  h.descarca.mockReset().mockResolvedValue('/tmp/x.mp4');
  h.publica.mockReset().mockResolvedValue('req-1');
  h.stare.mockReset().mockResolvedValue({ stare: 'in_lucru', rezultate: [], brut: {} });
  process.env.UPLOAD_POST_API_KEY = 'k';
  process.env.TELEGRAM_API_ID = '1';
  process.env.TELEGRAM_API_HASH = 'h';
  initSocial(apiFals as never);
});

describe('publicatorul', () => {
  it('o postare ajunsă la oră pleacă o singură dată, cu destinația de pe postare și id-ul ca cheie', async () => {
    const p = post({ upload_post_user: 'vechi1' });
    instaleaza([p], topic({ upload_post_user: 'nou2' }));
    await trecerePublicare();
    await trecerePublicare();
    expect(h.publica).toHaveBeenCalledTimes(1);
    const cerere = h.publica.mock.calls[0][1];
    expect(cerere.user).toBe('vechi1'); // C2: relegarea topicului nu mută clipul confirmat
    expect(cerere.idPostare).toBe(p.id);
    expect(rand(p.id as string)).toMatchObject({ stare: 'trimis', upload_request_id: 'req-1', incercari: 1 });
  });

  it('eroare trecătoare → înapoi în calendar peste 15 min; a treia → eșuat + alertă', async () => {
    const p = post();
    instaleaza([p]);
    h.publica.mockRejectedValue(new EroareUploadPost('HTTP 502', 502, false));
    h.stare.mockResolvedValue({ stare: 'negasit', rezultate: [], brut: {} }); // R3-2: întrebat înainte, nu are cererea
    for (let i = 1; i <= 3; i++) {
      rand(p.id as string).planificat_la = new Date(Date.now() - 1000).toISOString();
      await trecerePublicare();
    }
    expect(h.publica).toHaveBeenCalledTimes(3);
    expect(rand(p.id as string).stare).toBe('esuat');
    expect(alerts.some((a) => a.includes('Clip nepublicat'))).toBe(true);
    // după ce fișierul a plecat spre Upload-Post, topicul nu primește «nepublicat» sec, ci avertismentul
    expect(trimise.some((t) => t.includes('e posibil să fi plecat'))).toBe(true);
  });

  it('eroare definitivă (4xx) → eșuat din prima', async () => {
    const p = post();
    instaleaza([p]);
    h.publica.mockRejectedValue(new EroareUploadPost('profil necunoscut', 404, true));
    await trecerePublicare();
    expect(rand(p.id as string).stare).toBe('esuat');
  });

  it('clipul schimbat (ClipSchimbat) → eșuat, fără trimitere și fără reîncercare', async () => {
    const p = post();
    instaleaza([p]);
    h.descarca.mockRejectedValue(new ClipSchimbat('clipul din mesaj a fost înlocuit după planificare'));
    await trecerePublicare();
    expect(h.publica).not.toHaveBeenCalled();
    expect(rand(p.id as string).stare).toBe('esuat');
  });

  it('postarea primită în probă rămâne probă și după ce apar cheile (BL-2)', async () => {
    const p = post({ in_proba: true });
    instaleaza([p]);
    await trecerePublicare();
    expect(h.descarca).not.toHaveBeenCalled();
    expect(h.publica).not.toHaveBeenCalled();
    expect(rand(p.id as string).stare).toBe('proba');
  });

  it('autorul scos de pe listă sau topicul oprit → anulat la ora publicării (SEC-3)', async () => {
    const p = post({ autor_telegram_id: 999 });
    instaleaza([p]);
    await trecerePublicare();
    expect(h.publica).not.toHaveBeenCalled();
    expect(rand(p.id as string)).toMatchObject({ stare: 'anulat' });

    const q = post();
    instaleaza([q], topic({ activ: false }));
    await trecerePublicare();
    expect(rand(q.id as string).stare).toBe('anulat');
  });

  it('«se_publica» rămas de la o repornire → înapoi «planificat» după prag', async () => {
    const p = post({ stare: 'se_publica', incercari: 1, luat_la: new Date(Date.now() - BLOCAT_DUPA_MS - 60_000).toISOString(),
      planificat_la: new Date(Date.now() + 86_400_000).toISOString() });
    instaleaza([p]);
    await trecerePublicare();
    expect(rand(p.id as string).stare).toBe('planificat');
  });

  it('C1: clipul mutat cât publicatorul lucra la cel dinainte NU pleacă', async () => {
    const a = post();
    const b = post();
    instaleaza([a, b]);
    h.descarca.mockImplementationOnce(async () => {
      // adminul apasă «Mută mai târziu» pe B în timpul descărcării lui A
      rand(b.id as string).planificat_la = new Date(Date.now() + 86_400_000).toISOString();
      return '/tmp/a.mp4';
    });
    await trecerePublicare();
    expect(h.publica).toHaveBeenCalledTimes(1);
    expect(rand(b.id as string).stare).toBe('planificat');
  });

  it('starea de la Upload-Post: gata → publicat cu link-uri; platformă sărită → alertă de publicare incompletă (C6)', async () => {
    const p = post({ stare: 'trimis', upload_request_id: 'req-9', luat_la: new Date().toISOString() });
    instaleaza([p]);
    h.stare.mockResolvedValue({
      stare: 'gata',
      rezultate: [
        { platforma: 'tiktok', reusit: true, url: 'https://tiktok.com/v/1', mesaj: null, inCiorne: false, sarit: false },
        { platforma: 'facebook', reusit: true, url: null, mesaj: null, inCiorne: false, sarit: true },
      ],
      brut: {},
    });
    await trecerePublicare();
    expect(rand(p.id as string).stare).toBe('publicat');
    expect(trimise.at(-1)).toContain('Facebook: nepublicat — contul nu e conectat');
    expect(alerts.some((a) => a.includes('publicat incomplet'))).toBe(true);
  });
});

describe('citiri căzute (C4, BL2-2)', () => {
  it('topicul nu se poate citi → înapoi în calendar, nu «eșuat»', async () => {
    const p = post();
    instaleaza([p]);
    h.topicCade = true;
    await trecerePublicare();
    expect(rand(p.id as string).stare).toBe('planificat');
    expect(new Date(rand(p.id as string).planificat_la as string).getTime()).toBeGreaterThan(Date.now());
    expect(h.publica).not.toHaveBeenCalled();
  });

  it('lista bloggerilor nu se poate citi → înapoi în calendar, fără să consume o încercare', async () => {
    const p = post();
    instaleaza([p]);
    h.listaCade = true;
    await trecerePublicare();
    expect(rand(p.id as string)).toMatchObject({ stare: 'planificat', incercari: 0 });
    expect(h.publica).not.toHaveBeenCalled();
  });
});

describe('primirea clipului', () => {
  const msg = (extra: Row = {}) => ({
    message_id: 555, chat: { id: -1001, type: 'supergroup' }, message_thread_id: 7, is_topic_message: true,
    from: { id: BLOGGER, is_bot: false, first_name: 'B' }, date: 0,
    video: { file_id: 'f', file_unique_id: 'clip-1', file_size: 1000, duration: 30, width: 1080, height: 1920 },
    ...extra,
  });
  const T = () => topic() as never;
  const apiCu = (merge: boolean) => ({
    sendMessage: async (_c: number, text: string) => { if (!merge) throw new Error('Telegram 502'); trimise.push(text); return { message_id: 77 }; },
    sendChatAction: async () => true,
    getFile: async () => ({}),
  });

  it('confirmarea nu ajunge în topic → clipul nu rămâne în calendar (C5)', async () => {
    instaleaza([]);
    await primesteClip('translux', apiCu(false) as never, msg() as never, T());
    expect(fake._tables.social_posts).toHaveLength(1);
    expect(fake._tables.social_posts[0].stare).toBe('anulat');
  });

  it('primit cu cheile puse → real, cu destinația topicului; fără chei → probă', async () => {
    instaleaza([]);
    await primesteClip('translux', apiCu(true) as never, msg() as never, T());
    expect(fake._tables.social_posts[0]).toMatchObject({ stare: 'planificat', in_proba: false, upload_post_user: 'translux1', mesaj_confirmare_id: 77 });
    delete process.env.UPLOAD_POST_API_KEY;
    instaleaza([]);
    await primesteClip('translux', apiCu(true) as never, msg() as never, T());
    expect(fake._tables.social_posts[0].in_proba).toBe(true);
  });

  it('repostare după trimitere incertă → ACELAȘI rând (aceeași cheie); după eșec sigur → rând nou (BL-4, BL2-1)', async () => {
    const incert = post({ file_unique_id: 'clip-1', stare: 'esuat', trimis_posibil: true });
    instaleaza([incert]);
    await primesteClip('translux', apiCu(true) as never, msg() as never, T());
    expect(fake._tables.social_posts).toHaveLength(1);
    expect(fake._tables.social_posts[0]).toMatchObject({ id: incert.id, stare: 'planificat' });

    const sigur = post({ file_unique_id: 'clip-1', stare: 'esuat', trimis_posibil: false });
    instaleaza([sigur]);
    await primesteClip('translux', apiCu(true) as never, msg() as never, T());
    expect(fake._tables.social_posts).toHaveLength(1);
    expect(fake._tables.social_posts[0].id).not.toBe(sigur.id);
    expect(fake._tables.social_posts[0].stare).toBe('planificat');
  });

  it('clipul deja planificat nu intră a doua oară', async () => {
    instaleaza([post({ file_unique_id: 'clip-1' })]);
    await primesteClip('translux', apiCu(true) as never, msg() as never, T());
    expect(fake._tables.social_posts).toHaveLength(1);
    expect(trimise.at(-1)).toContain('deja în calendar');
  });
});

describe('pagina Facebook pe brand (Ion, 10.10)', () => {
  it('/lega_social pune singur pagina TLX în grupul TLX și pagina Translux în grupul Translux', async () => {
    initSocial({ ...apiFals, sendMessage: async (_c: number, t: string) => { trimise.push(t); return { message_id: 1 }; } } as never);
    const { initSocial: _i } = await import('./comun.js');
    void _i;
    fake = installMocks({
      tables: { social_topics: [], social_bloggers: [], social_posts: [], users: [{ id: 'u1', telegram_id: 42, role: 'ADMIN', active: true }] },
    });
    const cmd = (chat: number, text: string) => ({ message_id: 1, chat: { id: chat, type: 'supergroup' }, message_thread_id: 7, is_topic_message: true,
      from: { id: 42, is_bot: false, first_name: 'Ion' }, date: 0, text });
    await trateazaMesajSocial('translux', cmd(-1001, '/lega_social translux tiktok,facebook') as never);
    expect(fake._tables.social_topics[0]).toMatchObject({ bot: 'translux', facebook_page_id: '522481397952192' });
    process.env.TLX_BOT_TOKEN = '1:tlx';
    initSocial(apiFals as never);
    await trateazaMesajSocial('tlx', cmd(-1002, '/lega_social tlx_balti tiktok,facebook,instagram') as never);
    expect(fake._tables.social_topics.find((t) => t.bot === 'tlx')).toMatchObject({ facebook_page_id: '101326344887435' });
    await trateazaMesajSocial('translux', cmd(-1003, '/lega_social translux_balti tiktok') as never);
    expect(fake._tables.social_topics.find((t) => t.upload_post_user === 'translux_balti')).toMatchObject({ facebook_page_id: null });
    delete process.env.TLX_BOT_TOKEN;
  });
});

describe('cheile Upload-Post pe bot', () => {
  it('TLX publică cu cheia TLX, Translux cu cheia Translux; cheia comună e rezerva', async () => {
    const { cheieUploadPost } = await import('./comun.js');
    process.env.UPLOAD_POST_API_KEY_TLX = 'cheie-tlx';
    process.env.UPLOAD_POST_API_KEY_TRANSLUX = 'cheie-translux';
    expect(cheieUploadPost('tlx')).toBe('cheie-tlx');
    expect(cheieUploadPost('translux')).toBe('cheie-translux');
    delete process.env.UPLOAD_POST_API_KEY_TLX;
    process.env.UPLOAD_POST_API_KEY = 'comuna';
    expect(cheieUploadPost('tlx')).toBe('comuna');
    delete process.env.UPLOAD_POST_API_KEY_TRANSLUX;
  });
});

describe('runda 2 Codex', () => {
  it('C7: trimiterea posibilă rămâne marcată și după o eroare ulterioară înaintea trimiterii', async () => {
    const p = post();
    instaleaza([p]);
    h.publica.mockRejectedValueOnce(new EroareUploadPost('timeout', 504, false));
    await trecerePublicare();
    expect(rand(p.id as string)).toMatchObject({ stare: 'planificat', trimis_posibil: true });
    rand(p.id as string).planificat_la = new Date(Date.now() - 1000).toISOString();
    h.stare.mockResolvedValue({ stare: 'negasit', rezultate: [], brut: {} }); // Upload-Post nu are cererea
    h.descarca.mockRejectedValueOnce(new ClipSchimbat('mesajul cu clipul a fost editat după planificare'));
    await trecerePublicare();
    expect(rand(p.id as string)).toMatchObject({ stare: 'esuat', trimis_posibil: true });
    expect(trimise.at(-1)).toContain('e posibil să fi plecat'); // R3-2: mesajul ține cont de încercarea de dinainte
  });

  it('R3-2: dacă încercarea de dinainte a ajuns la Upload-Post, nu se mai descarcă și nu se retrimite', async () => {
    const p = post({ trimis_posibil: true, incercari: 1 });
    instaleaza([p]);
    h.stare.mockResolvedValue({ stare: 'in_lucru', rezultate: [], brut: {} });
    await trecerePublicare();
    expect(h.descarca).not.toHaveBeenCalled();
    expect(h.publica).not.toHaveBeenCalled();
    expect(rand(p.id as string)).toMatchObject({ stare: 'trimis', upload_request_id: p.id });
  });

  it('C12: refuzul de ACUM nu șterge îndoiala unei trimiteri de dinainte', async () => {
    const p = post({ trimis_posibil: true, incercari: 1 });
    instaleaza([p]);
    h.stare.mockRejectedValue(new EroareUploadPost('cheie revocată', 401, true)); // nici starea nu se poate afla
    h.publica.mockRejectedValue(new EroareUploadPost('cheie revocată', 401, true));
    await trecerePublicare();
    expect(rand(p.id as string)).toMatchObject({ stare: 'esuat', trimis_posibil: true });
    expect(trimise.at(-1)).toContain('e posibil să fi plecat');
  });

  it('R3-1: refuzul 4xx de la Upload-Post lămurește trimiterea', async () => {
    const p = post();
    instaleaza([p]);
    h.publica.mockRejectedValue(new EroareUploadPost('facebook_page_id invalid', 400, true));
    await trecerePublicare();
    expect(rand(p.id as string)).toMatchObject({ stare: 'esuat', trimis_posibil: false });
  });

  it('C7: doar eșecul raportat explicit de Upload-Post șterge marcajul', async () => {
    const p = post({ stare: 'trimis', upload_request_id: 'r', luat_la: new Date().toISOString(), trimis_posibil: true });
    instaleaza([p]);
    h.stare.mockResolvedValue({ stare: 'esuat', rezultate: [], brut: {} });
    await trecerePublicare();
    expect(rand(p.id as string)).toMatchObject({ stare: 'esuat', trimis_posibil: false });
  });

  it('C8: rândul «neconfirmat» nu se publică, iar după 10 min se închide ca anulat', async () => {
    const p = post({ stare: 'neconfirmat' });
    instaleaza([p]);
    await trecerePublicare();
    expect(h.descarca).not.toHaveBeenCalled();
    expect(rand(p.id as string).stare).toBe('neconfirmat');
    rand(p.id as string).updated_at = new Date(Date.now() - 11 * 60_000).toISOString();
    await trecerePublicare();
    expect(rand(p.id as string).stare).toBe('anulat');
    expect(h.descarca).not.toHaveBeenCalled();
  });

  it('C10: aceeași actualizare a releului se lucrează o singură dată; /social_oprit de două ori rămâne oprit', async () => {
    expect(dejaVazuta(9001)).toBe(false);
    expect(dejaVazuta(9001)).toBe(true);
    expect(dejaVazuta(undefined)).toBe(false);

    fake = installMocks({
      tables: {
        social_topics: [topic()], social_bloggers: [], social_posts: [],
        users: [{ id: 'u1', telegram_id: 42, role: 'ADMIN', active: true }],
      },
    });
    const cmd = { message_id: 1, chat: { id: -1001, type: 'supergroup' }, message_thread_id: 7, is_topic_message: true,
      from: { id: 42, is_bot: false, first_name: 'Ion' }, date: 0, text: '/social_oprit' };
    await trateazaMesajSocial('translux', cmd as never);
    await trateazaMesajSocial('translux', cmd as never);
    expect(fake._tables.social_topics[0].activ).toBe(false);
    await trateazaMesajSocial('translux', { ...cmd, text: '/social_porneste' } as never);
    expect(fake._tables.social_topics[0].activ).toBe(true);
  });
});

describe('conversia (Ion, «ce va fi cu fișierele de 800 MB?»)', () => {
  it('clip de 800 MB cu Instagram → se convertește și pleacă fișierul convertit, la toate platformele', async () => {
    const p = post({ platforme: ['tiktok', 'instagram'], file_size: 800 * 1024 * 1024, durata_s: 180 });
    instaleaza([p]);
    h.ffmpeg = true;
    h.analiza.mockResolvedValue({ codec: 'h264', latime: 1080, inaltime: 1920, durataS: 180, octeti: 800 * 1024 * 1024 });
    await trecerePublicare();
    expect(h.conversie).toHaveBeenCalledTimes(1);
    expect(h.conversie.mock.calls[0][1]).toMatch(/\.conv\.mp4$/);
    expect(h.publica).toHaveBeenCalledTimes(1);
    expect(h.publica.mock.calls[0][1].platforme).toEqual(['tiktok', 'instagram']);
  });

  it('clip H.264 1080p fără Instagram → pleacă nemodificat', async () => {
    const p = post({ platforme: ['tiktok', 'facebook'], file_size: 800 * 1024 * 1024 });
    instaleaza([p]);
    h.ffmpeg = true;
    h.analiza.mockResolvedValue({ codec: 'h264', latime: 1080, inaltime: 1920, durataS: 180, octeti: 800 * 1024 * 1024 });
    await trecerePublicare();
    expect(h.conversie).not.toHaveBeenCalled();
    expect(h.publica).toHaveBeenCalledTimes(1);
  });
});

describe('textRezultat / complet', () => {
  it('platforma cerută, dar neraportată, apare și strică «complet»', () => {
    const rez = [{ platforma: 'tiktok', reusit: true, url: null, mesaj: null, inCiorne: false, sarit: false }];
    expect(textRezultat(rez, ['tiktok', 'instagram'])).toContain('Instagram: Upload-Post n-a raportat nimic');
    expect(complet(rez, ['tiktok'])).toBe(true);
    expect(complet(rez, ['tiktok', 'instagram'])).toBe(false);
    expect(complet([{ ...rez[0], inCiorne: true }], ['tiktok'])).toBe(false);
  });
});
