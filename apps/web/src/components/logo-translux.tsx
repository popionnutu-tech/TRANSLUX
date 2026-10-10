import type { CSSProperties } from 'react';

/*
 * Logo-ul cu halou deschis (Ion, 10.10.2026: «folosim halou deschis»): literele bordo cu un contur roz-pal în jur.
 * translux-logo-halou.webp = translux-logo-red.png + conturul de 34 px (din 1318×192) pe fiecare parte, deci
 * imaginea iese din cutie cu atât; cutia rămâne cât literele, ca antetul să nu se mute.
 */
const W = 1318, H = 192, PAD = 34;
const IMG: CSSProperties = {
  position: 'absolute', display: 'block', maxWidth: 'none',
  top: `${(-PAD / H) * 100}%`, left: `${(-PAD / W) * 100}%`,
  width: `${((W + 2 * PAD) / W) * 100}%`, height: `${((H + 2 * PAD) / H) * 100}%`,
};

export default function LogoTranslux({ height, className, style }: { height: number; className?: string; style?: CSSProperties }) {
  return (
    <span className={className} style={{ display: 'inline-block', position: 'relative', height, aspectRatio: `${W}/${H}`, ...style }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/translux-logo-halou.webp" alt="" style={IMG} />
    </span>
  );
}
