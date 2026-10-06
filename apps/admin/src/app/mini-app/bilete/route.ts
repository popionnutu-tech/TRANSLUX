import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

// Mini app-ul șoferului pentru biletele online (ION-240, ION-190 pașii 7–8): o singură pagină HTML,
// fără React și fără layout-ul panoului. Sursele stau în public/mini-app/bilete/ (app.js, logica.js, stil.css,
// mock.json); scriptul Telegram vine de pe telegram.org (permis de CSP-ul din next.config.js). `/mini-app/` e
// prefix public în middleware; pagina se apără prin initData la API (X-Telegram-Init-Data → /api/bilete-sofer/azi).
// `?mock=1` deschide pagina în browser cu date fixe din mock.json (fără Telegram, fără API).
//
// ION-271 («Telegram ultrafast» P1): pe 3G lanțul HTML → app.js → logica.js + stil.css + logo PNG (4 fișiere, ~115 KB,
// revalidate la fiecare deschidere) costa 2–4 s. Acum: CSS-ul e inline aici, JS-ul e UN bundle minificat cu hash de
// conținut în nume (scripts/build-mini-app.mjs, la prebuild/predev; `dist/manifest.json` spune numele), logo-ul e WebP;
// fișierele din dist/ pleacă cu `Cache-Control: immutable` (next.config.js) — HTML-ul rămâne `no-store` și poartă versiunea.

export const dynamic = 'force-dynamic';

const DIR = path.join(process.cwd(), 'public', 'mini-app', 'bilete');

interface Manifest { app: string; logo: string | null }

let cache: { manifest: Manifest; css: string } | null = null;
function fisiere(): { manifest: Manifest; css: string } | null {
  if (cache) return cache;
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'dist', 'manifest.json'), 'utf8')) as Manifest;
    const css = fs.readFileSync(path.join(DIR, 'stil.css'), 'utf8');
    if (!manifest.app) return null;
    cache = { manifest, css };
    return cache;
  } catch {
    return null;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export async function GET() {
  const f = fisiere();
  if (!f) {
    // Build-ul n-a rulat scripts/build-mini-app.mjs (prebuild/predev): mai bine o eroare clară decât o pagină goală.
    return new NextResponse('mini-app: lipsește public/mini-app/bilete/dist/manifest.json — rulează `npm run build` (prebuild) sau `npm run dev` (predev) în apps/admin', { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
  const bot = (process.env.NEXT_PUBLIC_BOT_USERNAME || 'TransluxMoldova_bot').replace(/^@/, '');
  const v = f.manifest.app.replace(/^app-|\.js$/g, '');
  const logo = f.manifest.logo ? `/mini-app/bilete/dist/${f.manifest.logo}` : '/mini-app/bilete/logo-white.png';
  const html = `<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#9B1B30">
<title>Biletele cursei · TRANSLUX</title>
<style>${f.css.replace(/<\/style/gi, '<\\/style')}</style>
<link rel="modulepreload" href="/mini-app/bilete/dist/${f.manifest.app}">
<script>
// ION-272: cererea /azi pleacă ACUM, înaintea JS-ului și a SDK-ului, cu initData din hash (ca Telegram îl pune) — doar dacă e acolo
// și nu e modul mock; app.js o consumă (window.__azi) și, la 401, reîncearcă cu initData din SDK.
(function(){try{if(location.search.indexOf('mock=1')>=0)return;var d=new URLSearchParams(location.hash.slice(1)).get('tgWebAppData');if(!d)return;window.__azi=fetch('/api/bilete-sofer/azi',{headers:{'X-Telegram-Init-Data':d},cache:'no-store'});}catch(e){}})();
</script>
<script defer src="https://telegram.org/js/telegram-web-app.js"></script>
</head>
<body data-bot="${escapeHtml(bot)}" data-v="${escapeHtml(v)}" data-logo="${escapeHtml(logo)}">
<div id="app"><div class="incarc">Se încarcă…</div></div>
<script type="module" src="/mini-app/bilete/dist/${f.manifest.app}"></script>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
