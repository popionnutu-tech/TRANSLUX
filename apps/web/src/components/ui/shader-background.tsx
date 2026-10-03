"use client";

import React, { useEffect, useRef, useState } from 'react';

// Fundalul static, același gradient ca al «loading»-ului din home-page.tsx: pe telefoanele
// slabe și la «reduce motion» stă în locul shader-ului (ION-204, 03.10).
const STATIC_STYLE: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0,
  background: 'linear-gradient(135deg, #fff 0%, #f5f5f6 100%)',
};

/**
 * Shader-ul nu pornește (ION-204): omul a cerut «reduce motion», sau aparatul e slab —
 * ≤ 4 nuclee ori ≤ 4 GB RAM (deviceMemory, unde browserul îl dă). Rula la fiecare cadru pe
 * orice telefon; acum pe astea rămâne gradientul.
 */
function prefersStatic(): boolean {
  if (typeof window === 'undefined') return true;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4) return true;
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4) return true;
  return false;
}

const ShaderBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Componenta se încarcă doar în browser (ssr: false), deci decizia se ia la prima randare.
  const [isStatic] = useState(prefersStatic);

  const vsSource = `
    attribute vec4 aVertexPosition;
    void main() {
      gl_Position = aVertexPosition;
    }
  `;

  const fsSource = `
    precision highp float;
    uniform vec2 iResolution;
    uniform float iTime;
    uniform float iVertical;

    const float overallSpeed = 0.2;
    const float gridSmoothWidth = 0.015;
    const float axisWidth = 0.05;
    const float majorLineWidth = 0.025;
    const float minorLineWidth = 0.0125;
    const float majorLineFrequency = 5.0;
    const float minorLineFrequency = 1.0;
    const vec4 gridColor = vec4(0.5);
    const float scale = 5.0;
    const vec4 lineColor = vec4(0.608, 0.106, 0.188, 1.0);
    const float minLineWidth = 0.01;
    const float maxLineWidth = 0.2;
    const float lineSpeed = 1.0 * overallSpeed;
    const float lineAmplitude = 1.0;
    const float lineFrequency = 0.2;
    const float warpSpeed = 0.2 * overallSpeed;
    const float warpFrequency = 0.5;
    const float warpAmplitude = 1.0;
    const float offsetFrequency = 0.5;
    const float offsetSpeed = 1.33 * overallSpeed;
    const float minOffsetSpread = 0.6;
    const float maxOffsetSpread = 2.0;
    const int linesPerGroup = 16;

    #define drawCircle(pos, radius, coord) smoothstep(radius + gridSmoothWidth, radius, length(coord - (pos)))
    #define drawSmoothLine(pos, halfWidth, t) smoothstep(halfWidth, 0.0, abs(pos - (t)))
    #define drawCrispLine(pos, halfWidth, t) smoothstep(halfWidth + gridSmoothWidth, halfWidth, abs(pos - (t)))
    #define drawPeriodicLine(freq, width, t) drawCrispLine(freq / 2.0, width, abs(mod(t, freq) - (freq) / 2.0))

    float drawGridLines(float axis) {
      return drawCrispLine(0.0, axisWidth, axis)
            + drawPeriodicLine(majorLineFrequency, majorLineWidth, axis)
            + drawPeriodicLine(minorLineFrequency, minorLineWidth, axis);
    }

    float drawGrid(vec2 space) {
      return min(1.0, drawGridLines(space.x) + drawGridLines(space.y));
    }

    float random(float t) {
      return (cos(t) + cos(t * 1.3 + 1.3) + cos(t * 1.4 + 1.4)) / 3.0;
    }

    float getPlasmaY(float x, float horizontalFade, float offset) {
      return random(x * lineFrequency + iTime * lineSpeed) * horizontalFade * lineAmplitude + offset;
    }

    void main() {
      vec2 fc = gl_FragCoord.xy;
      vec2 fragCoord = mix(fc, vec2(fc.y, iResolution.x - fc.x), iVertical);
      vec2 res = mix(iResolution, vec2(iResolution.y, iResolution.x), iVertical);
      vec4 fragColor;
      vec2 uv = fragCoord.xy / res.xy;
      vec2 space = (fragCoord - res.xy / 2.0) / res.x * 2.0 * scale;

      float horizontalFade = 1.0 - (cos(uv.x * 6.28) * 0.5 + 0.5);
      float verticalFade = 1.0 - (cos(uv.y * 6.28) * 0.5 + 0.5);

      space.y += random(space.x * warpFrequency + iTime * warpSpeed) * warpAmplitude * (0.5 + horizontalFade);
      space.x += random(space.y * warpFrequency + iTime * warpSpeed + 2.0) * warpAmplitude * horizontalFade;

      vec4 lines = vec4(0.0);
      vec4 bgColor1 = vec4(1.0, 1.0, 1.0, 1.0);
      vec4 bgColor2 = vec4(0.97, 0.97, 0.98, 1.0);

      for(int l = 0; l < linesPerGroup; l++) {
        float normalizedLineIndex = float(l) / float(linesPerGroup);
        float offsetTime = iTime * offsetSpeed;
        float offsetPosition = float(l) + space.x * offsetFrequency;
        float rand = random(offsetPosition + offsetTime) * 0.5 + 0.5;
        float halfWidth = mix(minLineWidth, maxLineWidth, rand * horizontalFade) / 2.0;
        float offset = random(offsetPosition + offsetTime * (1.0 + normalizedLineIndex)) * mix(minOffsetSpread, maxOffsetSpread, horizontalFade);
        float linePosition = getPlasmaY(space.x, horizontalFade, offset);
        float line = drawSmoothLine(linePosition, halfWidth, space.y) / 2.0 + drawCrispLine(linePosition, halfWidth * 0.15, space.y);

        float circleX = mod(float(l) + iTime * lineSpeed, 25.0) - 12.0;
        vec2 circlePosition = vec2(circleX, getPlasmaY(circleX, horizontalFade, offset));
        float circle = drawCircle(circlePosition, 0.01, space) * 4.0;

        line = line + circle;
        lines += line * lineColor * rand;
      }

      float lineIntensity = max(max(lines.r, lines.g), lines.b);
      float lineMask = clamp(lineIntensity * 3.0, 0.0, 1.0);
      fragColor = mix(bgColor1, bgColor2, uv.x);
      fragColor.rgb = mix(fragColor.rgb, lineColor.rgb, lineMask);
      fragColor.a = 1.0;

      gl_FragColor = fragColor;
    }
  `;

  const loadShader = (gl: WebGLRenderingContext, type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error: ', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  };

  const initShaderProgram = (gl: WebGLRenderingContext, vsSource: string, fsSource: string) => {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vertexShader || !fragmentShader) return null;

    const shaderProgram = gl.createProgram();
    if (!shaderProgram) return null;
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      console.error('Shader program link error: ', gl.getProgramInfoLog(shaderProgram));
      return null;
    }

    return shaderProgram;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || isStatic) return;

    const gl = canvas.getContext('webgl');
    if (!gl) {
      console.warn('WebGL not supported.');
      return;
    }

    const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
    if (!shaderProgram) return;

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = [
      -1.0, -1.0,
       1.0, -1.0,
      -1.0,  1.0,
       1.0,  1.0,
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    const programInfo = {
      program: shaderProgram,
      attribLocations: {
        vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
      },
      uniformLocations: {
        resolution: gl.getUniformLocation(shaderProgram, 'iResolution'),
        time: gl.getUniformLocation(shaderProgram, 'iTime'),
        vertical: gl.getUniformLocation(shaderProgram, 'iVertical'),
      },
    };

    // Canvas la cel mult 1 pixel pe pixel CSS (ION-204): pe ecranele Retina/telefon shader-ul
    // ar fi desenat de 4–9 ori mai mulți pixeli pentru linii oricum moi.
    const resizeCanvas = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 1);
      canvas.width = Math.round(window.innerWidth * scale);
      canvas.height = Math.round(window.innerHeight * scale);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Timpul shader-ului curge doar cât se desenează: la revenire animația continuă de unde
    // a rămas, fără salt.
    let elapsed = 0;
    let lastFrame = 0;
    let animationFrameId = 0;
    let alive = true;
    // Se desenează doar cât fila e vizibilă și canvas-ul e în ecran (ION-204).
    let hidden = document.hidden;
    let offscreen = false;
    let running = false;

    const render = (ts: number) => {
      if (!alive || hidden || offscreen) { running = false; return; }
      if (lastFrame) elapsed += Math.min(ts - lastFrame, 100);
      lastFrame = ts;
      const currentTime = elapsed / 1000;

      gl.clearColor(0.0, 0.0, 0.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(programInfo.program);

      gl.uniform2f(programInfo.uniformLocations.resolution, canvas.width, canvas.height);
      gl.uniform1f(programInfo.uniformLocations.time, currentTime);
      gl.uniform1f(programInfo.uniformLocations.vertical, canvas.height > canvas.width ? 1.0 : 0.0);

      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.vertexAttribPointer(
        programInfo.attribLocations.vertexPosition,
        2,
        gl.FLOAT,
        false,
        0,
        0
      );
      gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animationFrameId = requestAnimationFrame(render);
    };

    const start = () => {
      if (!alive || running || hidden || offscreen) return;
      running = true;
      lastFrame = 0;
      animationFrameId = requestAnimationFrame(render);
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
      cancelAnimationFrame(animationFrameId);
      document.removeEventListener('visibilitychange', onVisibility);
      io?.disconnect();
      window.removeEventListener('resize', resizeCanvas);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStatic]);

  if (isStatic) return <div style={STATIC_STYLE} aria-hidden />;

  return (
    <canvas ref={canvasRef} style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0,
    }} />
  );
};

export default ShaderBackground;
