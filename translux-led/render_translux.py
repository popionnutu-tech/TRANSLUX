import sys, os, math, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageChops, ImageFilter
import imageio_ffmpeg

W, H = 4096, 546
FPS = 30
DUR = 15.0
BG = (155, 27, 48)
SCRATCH = "/Users/ionpop/Desktop/translux-intro"
FRAMES = SCRATCH + "/frames"

logo = Image.open("/Users/ionpop/Desktop/TRANSLUX/apps/web/public/translux-logo-white.png").convert("RGBA")
lw = int(0.80 * W); lh = int(logo.height * lw / logo.width)
logo = logo.resize((lw, lh), Image.LANCZOS)
lx = (W - lw) // 2; ly = (H - lh) // 2
LA = logo.split()[3]
LA_np = np.asarray(LA).astype(np.float32) / 255.0
la_arr = (LA_np * 255).astype(np.uint8)
glow = Image.new("RGBA", logo.size, (255, 235, 215, 0)); glow.putalpha(LA)
glow = glow.filter(ImageFilter.GaussianBlur(26))
GLOWA = np.asarray(glow.split()[3]).astype(np.float32)
DIM = np.array([231, 198, 191], np.float32); WHITE = np.array([255, 255, 255], np.float32)
COLS = np.arange(lw, dtype=np.float32)

def ease_out(x): x = max(0.0, min(1.0, x)); return 1 - (1 - x) ** 3

def render_frame(t):
    fr = Image.new("RGB", (W, H), BG)

    # red speed streaks during the entrance
    if t < 1.4:
        ov = Image.new("RGBA", (W, H), (0, 0, 0, 0)); od = ImageDraw.Draw(ov)
        for i, w in enumerate([110, 60, 170, 80]):
            tt = (t - i * 0.13) / 0.7
            if 0 <= tt <= 1:
                sx = int(-260 + tt * (W + 520))
                od.polygon([(sx, -40), (sx + w, -40), (sx + w - 200, H + 40), (sx - 200, H + 40)], fill=(212, 32, 39, 165))
        fr = Image.alpha_composite(fr.convert("RGBA"), ov.filter(ImageFilter.GaussianBlur(3))).convert("RGB")

    # the STRONG sparkle is active from the start; during the reveal it shows only the drawn part
    rev = ease_out((t - 0.8) / 3.2)
    revX = int(rev * lw) if t < 4.0 else lw
    if revX > 2:
        wave = 0.5 + 0.5 * np.sin(2 * math.pi * t * 0.9 - COLS / (lw * 0.07))
        wave = np.clip(wave, 0, 1)
        ga = (GLOWA * (0.30 + 1.05 * wave)[None, :]).clip(0, 255).astype(np.uint8)
        g = np.dstack([np.full((lh, lw), 255, np.uint8), np.full((lh, lw), 240, np.uint8),
                       np.full((lh, lw), 222, np.uint8), ga])
        gimg = Image.fromarray(g).crop((0, 0, revX, lh)); fr.paste(gimg, (lx, ly), gimg)
        col = DIM[None, :] + (WHITE - DIM)[None, :] * wave[:, None]
        rgb = np.broadcast_to(col[None, :, :], (lh, lw, 3))
        lt = np.dstack([rgb, la_arr]).astype(np.uint8)
        limg = Image.fromarray(lt).crop((0, 0, revX, lh)); fr.paste(limg, (lx, ly), limg)
        if t < 4.0:                      # bright "drawing" edge during the reveal
            ed = Image.new("RGBA", (160, lh), (0, 0, 0, 0))
            for xx in range(160):
                aa = max(0, 1 - abs(xx - 130) / 60) * 200
                ImageDraw.Draw(ed).line([(xx, 0), (xx, lh)], fill=(255, 245, 230, int(aa)))
            fr.paste(ed, (lx + revX - 130, ly), ed)

    # climax light sweep across the locked wordmark (4..5.6s)
    if 4.0 <= t < 5.6:
        sp = (t - 4.0) / 1.6
        bw = int(lw * 0.16); bx = int(-bw + sp * (lw + bw))
        band = Image.new("RGBA", (lw, lh), (0, 0, 0, 0)); bd = ImageDraw.Draw(band)
        for xx in range(max(0, bx), min(lw, bx + bw)):
            aa = (1 - abs((xx - (bx + bw / 2)) / (bw / 2))) * 220
            bd.line([(xx, 0), (xx, lh)], fill=(255, 255, 255, int(max(0, aa))))
        band.putalpha(ImageChops.multiply(band.split()[3], LA))
        fr.paste(band, (lx, ly), band)
    return fr

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "keys"
    if mode == "keys":
        for t in [0.6, 2.2, 4.8, 8.0, 12.0]:
            render_frame(t).save(f"/tmp/kt_{t:04.1f}.png"); print("key", t)
    else:
        os.makedirs(FRAMES, exist_ok=True)
        n = int(DUR * FPS)
        for i in range(n):
            render_frame(i / FPS).save(f"{FRAMES}/f_{i:04d}.png")
            if i % 90 == 0: print("frame", i, "/", n)
        ff = imageio_ffmpeg.get_ffmpeg_exe()
        out = SCRATCH + "/TRANSLUX-intro-4096x546.mp4"
        subprocess.run([ff, "-y", "-framerate", str(FPS), "-i", f"{FRAMES}/f_%04d.png",
                        "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p",
                        "-crf", "16", "-preset", "medium", "-movflags", "+faststart", out], check=True)
        for f in os.listdir(FRAMES):
            os.remove(os.path.join(FRAMES, f))
        print("ENCODED", out)
