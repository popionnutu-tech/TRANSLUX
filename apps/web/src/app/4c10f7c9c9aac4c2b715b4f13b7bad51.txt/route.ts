// Cheia IndexNow (ION-153): Bing și Yandex verifică aici că trimiterea paginilor vine de la translux.md.
// Aceeași cheie e în apps/web/scripts/indexnow.mjs.
export function GET() {
  return new Response('4c10f7c9c9aac4c2b715b4f13b7bad51', { headers: { 'Content-Type': 'text/plain' } });
}
