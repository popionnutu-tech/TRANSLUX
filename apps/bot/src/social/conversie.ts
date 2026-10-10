import { spawn, spawnSync } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { IG_REELS_MAX_OCTETI, IG_STORY_MAX_OCTETI, type Platforma } from './uploadPost.js';

// Conversia cu ffmpeg (Ion, 10.10.2026: «ce va fi cu fișierele de 800 MB?» → «ok» la varianta ffmpeg pe Railway).
// Planul de la 09.10 («Calitatea»): clipul pleacă NEMODIFICAT; botul intervine doar când trebuie — 4K devine 1080p,
// HEVC devine H.264, iar pentru Instagram (Reels ≤ 300 MB, Story ≤ 100 MB) clipul se aduce sub limită. Un singur fișier
// pleacă la toate platformele postării: o singură cerere Upload-Post, o singură cheie de idempotență.
// ffmpeg rulează ca proces separat, omorât la limită; în imagine îl pune Dockerfile-ul (apt ffmpeg).

export const CONVERSIE_MAX_MS = 30 * 60_000;
/** Latura lungă maximă: 1080p vertical = 1080×1920. */
export const LATURA_MAX = 1920;
/** Ținta sub limita Instagram, cu loc pentru antetul MP4 și pentru depășirea unui singur pas. */
const MARJA = 0.9;
const AUDIO_KBPS = 128;
/** Sub atât un clip 1080p arată rău: atunci se trece pe 720p. */
const VIDEO_MIN_KBPS_1080 = 2_500;

export interface InfoClip {
  codec: string;
  latime: number;
  inaltime: number;
  durataS: number;
  octeti: number;
}

export interface PlanConversie {
  motive: string[];
  /** null = calitate constantă (CRF 18); altfel bitrate video țintă (kbps) ca fișierul să încapă sub limită. */
  videoKbps: number | null;
  laturaMax: number;
  /** Mărimea maximă a rezultatului (octeți), dacă e o limită de respectat. */
  maxOcteti: number | null;
}

/** Ce trebuie făcut cu clipul pentru platformele postării. null = pleacă nemodificat. Pur, testat. */
export function planConversie(info: InfoClip, platforme: Platforma[], tip: 'video' | 'story'): PlanConversie | null {
  const motive: string[] = [];
  if (info.codec !== 'h264') motive.push(`${info.codec.toUpperCase()} → H.264`);
  if (Math.max(info.latime, info.inaltime) > LATURA_MAX) motive.push(`${info.latime}×${info.inaltime} → 1080p`);
  const limitaIg = platforme.includes('instagram') ? (tip === 'story' ? IG_STORY_MAX_OCTETI : IG_REELS_MAX_OCTETI) : null;
  const preaMare = limitaIg !== null && info.octeti > limitaIg;
  if (preaMare) motive.push(`${Math.round(info.octeti / 1048576)} MB → sub ${Math.round(limitaIg! / 1048576)} MB pentru Instagram`);
  if (!motive.length) return null;
  if (!preaMare) return { motive, videoKbps: null, laturaMax: LATURA_MAX, maxOcteti: null };
  const totalKbps = (limitaIg! * MARJA * 8) / 1000 / Math.max(1, info.durataS);
  const videoKbps = Math.floor(totalKbps - AUDIO_KBPS);
  return { motive, videoKbps, laturaMax: videoKbps < VIDEO_MIN_KBPS_1080 ? 1280 : LATURA_MAX, maxOcteti: limitaIg };
}

/** Argumentele ffmpeg pentru plan. Pur, testat. */
export function argumenteFfmpeg(intrare: string, iesire: string, plan: PlanConversie, factor = 1): string[] {
  const L = plan.laturaMax;
  // Latura lungă ≤ L, proporțiile păstrate, dimensiuni pare (H.264 cere asta); un clip mai mic nu se mărește.
  const scale = `scale='if(gte(iw,ih),min(${L},iw),-2)':'if(gte(iw,ih),-2,min(${L},ih))'`;
  const video = plan.videoKbps === null
    ? ['-crf', '18']
    : (() => { const k = Math.max(500, Math.floor(plan.videoKbps * factor)); return ['-b:v', `${k}k`, '-maxrate', `${Math.floor(k * 1.3)}k`, '-bufsize', `${k * 2}k`]; })();
  return [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', intrare,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-vf', scale, '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'high', '-pix_fmt', 'yuv420p', ...video,
    '-c:a', 'aac', '-b:a', `${AUDIO_KBPS}k`, '-movflags', '+faststart', iesire,
  ];
}

let disponibil: boolean | null = null;
/** ffmpeg + ffprobe există în imagine? (o singură verificare pe proces) */
export function ffmpegDisponibil(): boolean {
  if (disponibil === null) {
    disponibil = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0
      && spawnSync('ffprobe', ['-version'], { stdio: 'ignore' }).status === 0;
  }
  return disponibil;
}

function ruleaza(cmd: string, args: string[], limitaMs: number): Promise<string> {
  return new Promise((da, nu) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (b: Buffer) => { out += b.toString(); });
    p.stderr.on('data', (b: Buffer) => { err = (err + b.toString()).slice(-2_000); });
    const ceas = setTimeout(() => { p.kill('SIGKILL'); nu(new Error(`${cmd} a depășit ${Math.round(limitaMs / 60_000)} minute`)); }, limitaMs);
    p.on('error', (e) => { clearTimeout(ceas); nu(e); });
    p.on('close', (cod) => {
      clearTimeout(ceas);
      if (cod === 0) da(out);
      else nu(new Error(`${cmd} a ieșit cu ${cod}: ${err.trim().split('\n').pop() ?? ''}`));
    });
  });
}

export async function analizeaza(cale: string): Promise<InfoClip> {
  const j = JSON.parse(await ruleaza('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height:format=duration,size', '-of', 'json', cale,
  ], 60_000)) as { streams?: Array<{ codec_name?: string; width?: number; height?: number }>; format?: { duration?: string; size?: string } };
  const v = j.streams?.[0];
  if (!v?.codec_name) throw new Error('fișierul nu are pistă video');
  return {
    codec: v.codec_name, latime: v.width ?? 0, inaltime: v.height ?? 0,
    durataS: Number(j.format?.duration ?? 0), octeti: Number(j.format?.size ?? (await stat(cale)).size),
  };
}

/**
 * Convertește după plan. Dacă un pas cu bitrate țintă tot iese peste limită (ffmpeg depășește ușor), încă unul cu 80 %.
 * Întoarce mărimea rezultatului.
 */
export async function converteste(intrare: string, iesire: string, plan: PlanConversie, limitaMs = CONVERSIE_MAX_MS): Promise<number> {
  const start = Date.now();
  for (const factor of plan.maxOcteti ? [1, 0.8] : [1]) {
    const ramas = limitaMs - (Date.now() - start);
    if (ramas <= 0) throw new Error(`conversia a depășit ${Math.round(limitaMs / 60_000)} minute`);
    await ruleaza('ffmpeg', argumenteFfmpeg(intrare, iesire, plan, factor), ramas);
    const marime = (await stat(iesire)).size;
    if (!plan.maxOcteti || marime <= plan.maxOcteti) return marime;
  }
  throw new Error('nici după conversie clipul nu încape sub limita Instagram');
}
