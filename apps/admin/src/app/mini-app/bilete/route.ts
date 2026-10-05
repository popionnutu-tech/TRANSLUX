import { NextResponse } from 'next/server';

// Mini app-ul șoferului pentru biletele online (ION-240, ION-190 pașii 7–8): o singură pagină HTML,
// fără React și fără layout-ul panoului. CSS-ul și JS-ul stau în public/mini-app/bilete/ (stil.css,
// app.js, logica.js, mock.json); scriptul Telegram vine de pe telegram.org (permis de CSP-ul din
// next.config.js: script-src https://telegram.org). `/mini-app/` e prefix public în middleware;
// pagina se apără prin initData la API (X-Telegram-Init-Data → /api/bilete-sofer/azi, ION-239).
// `?mock=1` deschide pagina în browser cu date fixe din mock.json (fără Telegram, fără API).

export const dynamic = 'force-dynamic';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export async function GET() {
  const bot = (process.env.NEXT_PUBLIC_BOT_USERNAME || 'TransluxMoldova_bot').replace(/^@/, '');
  // Versiunea fișierelor statice: sha-ul desfășurării, ca telefonul să nu țină un app.js vechi după deploy.
  const v = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 8) || 'dev';
  const html = `<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#9B1B30">
<title>Biletele cursei · TRANSLUX</title>
<link rel="stylesheet" href="/mini-app/bilete/stil.css?v=${v}">
<script src="https://telegram.org/js/telegram-web-app.js"></script>
</head>
<body data-bot="${escapeHtml(bot)}" data-v="${v}">
<div id="app"><div class="incarc">Se încarcă…</div></div>
<script type="module" src="/mini-app/bilete/app.js?v=${v}"></script>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
