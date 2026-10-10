"use client";

import React, { useEffect, useRef, useState } from 'react';

// Fundalul de rezervă, când WebGL lipsește: același gradient ca al «loading»-ului din home-page.tsx.
const STATIC_STYLE: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0,
  background: 'linear-gradient(135deg, #fff 0%, #f5f5f6 100%)',
};

/**
 * Fără animație (ION-204/211): omul a cerut «reduce motion», sau telefonul e cu adevărat slab (≤ 2 GB RAM,
 * deviceMemory, doar Chrome îl dă). Atunci serpentina se desenează o singură dată și stă.
 */
function prefersStill(): boolean {
  if (typeof window === 'undefined') return true;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2) return true;
  return false;
}

const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}';

/*
 * «Serpentina de sus» (Ion, 09.10.2026: «pune serpentina de sus pe site la ambele, mobile și desktop»): drumul văzut
 * de sus printre lanurile nordului, cu un autobuz TRANSLUX care stă pe loc în partea de jos a ecranului; la derulare
 * drumul și câmpurile curg sub el. Gândit pentru telefon (97 % din vizite): forme mari care arată bine și blurate prin
 * carduri, marcaje clare în golurile dintre ele, alb liniștit sus, lângă logo.
 * U = unitatea lumii în pixeli: lățimea ecranului pe telefon, plafonată pe desktop; acolo bucla drumului se lărgește (m).
 * Desktop (Ion, 09.10: «lasă shader-ul cum este pentru mobile, actualizează-l un pic pentru desktop»): când lângă coloana
 * de 720 px rămâne loc, drumul șerpuiește doar în golul din dreapta (uD = activ, centrul golului, amplitudinea, în
 * unități ale lumii) — nu mai trece pe sub carduri, iar autobuzul stă lângă conținut, nu sub text.
 */
const FS = `precision highp float;
uniform vec2 R; uniform float T; uniform float uS; uniform vec3 uD;
const vec3 RED=vec3(0.608,0.106,0.188);
float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
// centrul drumului și panta lui la înălțimea y; 0.33 = abaterea maximă a sumei de sinusuri
vec2 path(float y,float m){
  float a=0.25*sin(y*1.15)+0.08*sin(y*2.7+1.7);
  float d=0.2875*cos(y*1.15)+0.216*cos(y*2.7+1.7);
  if(uD.x>0.5){ float k=uD.z/0.33; return vec2(uD.y+k*a,k*d); }
  return vec2(0.5+m*a,m*d);
}
void main(){
  float U=min(R.x,R.y*0.62); float px=1.0/U;
  vec2 uv=gl_FragCoord.xy/R;
  float Wd=R.x/U; float m=clamp(1.0+0.5*(Wd-1.0),1.0,2.2);
  float x=gl_FragCoord.x/U-(Wd-1.0)*0.5;
  float yw=gl_FragCoord.y/U+uS+T*0.035;
  vec2 p=vec2(x,yw);
  float an=0.42; vec2 pr=vec2(p.x*cos(an)-p.y*sin(an),p.x*sin(an)+p.y*cos(an))*vec2(2.3,1.5);
  vec2 cell=floor(pr); vec2 fr=fract(pr); float hc=h(cell);
  vec3 col=hc<0.25?vec3(0.988,0.972,0.962):hc<0.5?vec3(0.975,0.958,0.952):hc<0.75?vec3(0.993,0.985,0.98):vec3(0.982,0.952,0.955);
  float ang=hc*3.1416; float fu=fract(dot(fr,vec2(cos(ang),sin(ang)))*16.0);
  col*=1.0-0.018*smoothstep(0.35,0.5,abs(fu-0.5));
  float bd=min(min(fr.x,1.0-fr.x)/2.3,min(fr.y,1.0-fr.y)/1.5);
  col=mix(col,vec3(0.90,0.84,0.85),(1.0-smoothstep(0.0,0.006,bd))*0.6);
  vec2 rp=path(yw,m); float c=rp.x; float sl=rp.y;
  float ad=abs(x-c)/sqrt(1.0+sl*sl);
  float W=0.085;
  col=mix(col,vec3(0.86,0.78,0.80),exp(-(ad-W)*(ad-W)/0.0006)*0.35*step(W,ad));
  float road=1.0-smoothstep(W,W+px*1.5,ad);
  col=mix(col,vec3(0.835,0.775,0.785),road);
  col=mix(col,vec3(1.0),(1.0-smoothstep(px*1.2,px*2.4,abs(ad-(W-0.012))))*road);
  col=mix(col,vec3(1.0),(1.0-smoothstep(px*1.2,px*2.4,ad))*step(0.45,fract(yw*7.0)));
  float by=0.2*R.y/U+uS+T*0.035;
  vec2 bp=path(by,m); float bc=bp.x; float bs=bp.y;
  vec2 tng=normalize(vec2(bs,1.0)); vec2 nrm=vec2(tng.y,-tng.x);
  vec2 q=p-(vec2(bc,by)+nrm*0.04); float bu=dot(q,tng), bv=dot(q,nrm);
  vec2 bq=abs(vec2(bu,bv))-vec2(0.062,0.019);
  float box=length(max(bq+0.008,0.0))+min(max(bq.x+0.008,bq.y+0.008),0.0)-0.008;
  vec2 sbq=abs(vec2(bu+0.006,bv-0.009))-vec2(0.062,0.019);
  float sh=length(max(sbq+0.008,0.0))+min(max(sbq.x+0.008,sbq.y+0.008),0.0)-0.008;
  col=mix(col,vec3(0.70,0.62,0.64),(1.0-smoothstep(-0.004,0.01,sh))*0.35);
  float body=1.0-smoothstep(0.0,px*1.5,box);
  col=mix(col,RED,body);
  float win=step(abs(bv),0.011)*step(-0.05,bu)*step(bu,0.045)*step(0.5,fract(bu*55.0));
  col=mix(col,vec3(0.98,0.85,0.88),win*body*0.55);
  col=mix(col,vec3(0.99,0.92,0.93),step(0.044,bu)*step(bu,0.056)*step(abs(bv),0.014)*0.85);
  col=mix(col,vec3(1.0),smoothstep(0.80,0.95,uv.y)*0.85);
  gl_FragColor=vec4(col,1.0);
}`;

/** Lățimea coloanei de conținut din home-page.tsx (maxWidth 720) cu marginile ei, în px CSS. */
const COLOANA_CSS = 760;
/** Jumătatea lățimii drumului în shader (W), în unități ale lumii. */
const DRUM_W = 0.085;

/**
 * Drumul în golul din dreapta coloanei, pe desktop: [activ, centrul, amplitudinea] în unitățile lumii shader-ului
 * (x_lume = px/U − (w/U − 1)/2). Inactiv când golul nu încape drumul cu 24 px de margine și 30 px de șerpuire —
 * deci pe telefon și pe tabletă rămâne serpentina dintâi.
 */
export function drumDesktop(wCss: number, uCss: number): [number, number, number] {
  const gol = (wCss - COLOANA_CSS) / 2;
  const amp = gol / 2 - DRUM_W * uCss - 24;
  if (amp < 30) return [0, 0, 0];
  const centru = wCss - gol / 2;
  return [1, centru / uCss - (wCss / uCss - 1) / 2, amp / uCss];
}

const ShaderBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Componenta se încarcă doar în browser (ssr: false), deci decizia se ia la prima randare.
  const [still] = useState(prefersStill);
  const [noGl, setNoGl] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) { setNoGl(true); return; }

    const sh = (type: number, src: string) => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error('Shader compile error: ', gl.getShaderInfoLog(s)); return null; }
      return s;
    };
    const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) { setNoGl(true); return; }
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { setNoGl(true); return; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aP = gl.getAttribLocation(prog, 'p');
    gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aP);
    const uR = gl.getUniformLocation(prog, 'R'), uT = gl.getUniformLocation(prog, 'T'), uS = gl.getUniformLocation(prog, 'uS'), uD = gl.getUniformLocation(prog, 'uD');

    // Până la 2 pixeli pe pixel CSS pe desktop: autobuzul și marcajele ar ieși moi la 1. Pe telefon 1,5 (Ion, 11.10:
    // «la noi parcă un pic frânează»): la 2 fundalul plin de ecran costa 1,3 mil. pixeli pe cadru, sub carduri blurate,
    // iar derularea sărea cadre; la 1,5 sunt 0,74 mil. și diferența nu se vede prin sticla cardurilor.
    const plafon = window.matchMedia?.('(pointer: coarse)').matches ? 1.5 : 2;
    let scale = 1;
    const resize = () => {
      scale = Math.min(window.devicePixelRatio || 1, plafon);
      canvas.width = Math.round(window.innerWidth * scale);
      canvas.height = Math.round(window.innerHeight * scale);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();

    let elapsed = 10;
    const draw = () => {
      const w = canvas.width, h = canvas.height;
      const U = Math.min(w, h * 0.62);
      gl.uniform2f(uR, w, h);
      gl.uniform1f(uT, elapsed);
      // drumul curge cu jumătate din viteza derulării: pare mai departe decât pagina
      gl.uniform1f(uS, (window.scrollY * scale) / U * 0.5);
      gl.uniform3f(uD, ...drumDesktop(w / scale, U / scale));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    let dirty = true;
    const onResize = () => { resize(); dirty = true; if (still) draw(); };
    window.addEventListener('resize', onResize);
    if (still) { draw(); return () => window.removeEventListener('resize', onResize); }

    // La derulare: un cadru la fiecare pas al derulării. Pe loc (Ion, 09.10: «când merge mașinuța, parcă se blochează»):
    // la 10 cadre/s drumul sărea ~5 px pe desktop la fiecare cadru — acum fiecare cadru al ecranului pe desktop, 30/s pe
    // telefon (acolo pasul e sub 1 px). Nimic cât fila e ascunsă sau canvas-ul nu e în ecran (ION-204).
    const pas = window.matchMedia?.('(pointer: coarse)').matches ? 29 : 0;
    const onScroll = () => { dirty = true; };
    window.addEventListener('scroll', onScroll, { passive: true });
    let hidden = document.hidden, offscreen = false, alive = true, raf = 0, lastTs = 0, lastDraw = 0, running = false;
    const loop = (ts: number) => {
      if (!alive || hidden || offscreen) { running = false; return; }
      if (lastTs) elapsed += Math.min(ts - lastTs, 100) / 1000;
      lastTs = ts;
      if (dirty || ts - lastDraw >= pas) { draw(); dirty = false; lastDraw = ts; }
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!alive || running || hidden || offscreen) return;
      running = true; lastTs = 0; raf = requestAnimationFrame(loop);
    };
    const onVisibility = () => { hidden = document.hidden; start(); };
    document.addEventListener('visibilitychange', onVisibility);
    const io = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => { offscreen = !entries.some((e) => e.isIntersecting); start(); })
      : null;
    io?.observe(canvas);
    start();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      io?.disconnect();
    };
  }, [still]);

  if (noGl) return <div style={STATIC_STYLE} aria-hidden />;

  return (
    <canvas ref={canvasRef} aria-hidden style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0,
    }} />
  );
};

export default ShaderBackground;
