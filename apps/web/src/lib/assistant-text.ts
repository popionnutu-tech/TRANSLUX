import { phoneTel } from './phone';

// Textul asistentului, desfăcut în bucăți pe care le desenează widget-ul.
// Fără HTML din model: tot ce vine de la server devine text React sau un link
// verificat aici (doar https), deci un răspuns ciudat nu poate injecta nimic.

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'link'; href: string; label: string }
  | { kind: 'tel'; href: string; label: string };

export type Block =
  | { kind: 'para'; parts: Inline[] }
  | { kind: 'bullet'; parts: Inline[] }
  | { kind: 'map'; provider: 'google' | 'waze'; href: string };

const URL_RE = /https:\/\/[^\s)<>\]]+/g;
// Numerele moldovenești scrise de asistent: 069 123 456, 060401010, +373 69 123 456.
const PHONE_RE = /(?:\+373[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{3}|\b0\d{2}[\s-]?\d{3}[\s-]?\d{3}\b)/g;

function mapProvider(href: string): 'google' | 'waze' | null {
  try {
    const u = new URL(href);
    if (u.hostname === 'www.google.com' && u.pathname.startsWith('/maps')) return 'google';
    if (u.hostname === 'waze.com' || u.hostname === 'www.waze.com') return 'waze';
  } catch { /* nu e URL */ }
  return null;
}

// Linkul cu «+373», ca să sune și de peste hotare (lib/phone).
const telHref = phoneTel;

function splitPlain(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  const hits: { at: number; end: number; node: Inline }[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const href = m[0].replace(/[.,;:!?]+$/, '');
    hits.push({ at: m.index!, end: m.index! + href.length, node: { kind: 'link', href, label: href } });
  }
  for (const m of text.matchAll(PHONE_RE)) {
    if (hits.some((h) => m.index! >= h.at && m.index! < h.end)) continue;
    hits.push({ at: m.index!, end: m.index! + m[0].length, node: { kind: 'tel', href: telHref(m[0]), label: m[0] } });
  }
  hits.sort((a, b) => a.at - b.at);
  for (const h of hits) {
    if (h.at < last) continue;
    if (h.at > last) out.push({ kind: 'text', text: text.slice(last, h.at) });
    out.push(h.node);
    last = h.end;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

export function parseInline(line: string): Inline[] {
  const out: Inline[] = [];
  const parts = line.split(/\*\*(.+?)\*\*/g);
  parts.forEach((p, i) => {
    if (!p) return;
    if (i % 2 === 1) out.push({ kind: 'bold', text: p });
    else out.push(...splitPlain(p));
  });
  return out;
}

export function parseAssistantText(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    // Eticheta singură pe rând («Google Maps:» și linkul dedesubt, cum scrie modelul):
    // butonul de sub ea o spune deja.
    if (/^[-•*]?\s*(google\s*maps|waze)\s*:?\s*$/i.test(line)) continue;
    // Un rând care e doar un link de hartă (cu sau fără «Google Maps:» în față)
    // devine buton — așa l-a cerut clientul: «link Google Maps sau Waze pentru comoditate».
    const urls = line.match(URL_RE) ?? [];
    const rest = line.replace(URL_RE, '').replace(/^[-•*]\s*/, '').replace(/(google\s*maps|waze)\s*:?/gi, '').trim();
    if (urls.length === 1 && rest.length === 0) {
      const href = urls[0].replace(/[.,;:!?]+$/, '');
      const provider = mapProvider(href);
      if (provider) { blocks.push({ kind: 'map', provider, href }); continue; }
    }
    const bullet = /^[-•*]\s+/.test(line);
    const body = bullet ? line.replace(/^[-•*]\s+/, '') : line;
    blocks.push({ kind: bullet ? 'bullet' : 'para', parts: parseInline(body) });
  }
  return blocks;
}
