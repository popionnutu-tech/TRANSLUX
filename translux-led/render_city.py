import sys, os, math, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import imageio_ffmpeg

MODE = sys.argv[1] if len(sys.argv) > 1 else "keys"
WORD = sys.argv[2] if len(sys.argv) > 2 else "EDINEȚ"
DUR = float(sys.argv[3]) if len(sys.argv) > 3 else 15.0
OUTNAME = sys.argv[4] if len(sys.argv) > 4 else "TRANSLUX-edinet"

W, H = 4096, 546
FPS = 30
BG = (155, 27, 48)
ROADC = (78, 13, 23)
SCRATCH = "/Users/ionpop/Desktop/translux-intro"
FRAMES = SCRATCH + "/frames"

# ---------- plain white bus ----------
src = Image.open("/tmp/bus_white.png").convert("RGB")
a = np.asarray(src).astype(np.float32)
R, G, B = a[..., 0], a[..., 1], a[..., 2]
greenness = G - np.maximum(R, B)
alpha = np.clip(1 - (greenness - 40) / 100.0, 0, 1)
busimg = Image.fromarray(np.stack([R, np.minimum(G, np.maximum(R, B)), B, alpha * 255], axis=-1).astype(np.uint8))
busimg = busimg.crop(Image.fromarray((alpha * 255).astype(np.uint8)).getbbox())
bush = int(0.56 * H); busw = int(busimg.width * bush / busimg.height)
bus_r = busimg.resize((busw, bush), Image.LANCZOS)
road_h = int(0.15 * H); road_top = H - road_h
wheel_bottom = int(0.68 * bush + 0.052 * busw)
bus_y = road_top - wheel_bottom

# ---------- word layer (cap-aligned, forward italic) ----------
def load_font(size):
    for p in ["/System/Library/Fonts/Supplemental/Arial Black.ttf",
              "/System/Library/Fonts/Supplemental/Impact.ttf",
              "/Users/ionpop/Desktop/TRANSLUX/apps/web/public/fonts/OpenSans-Bold.ttf"]:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

TARGET = int(0.58 * H); MAXW = int(0.90 * W)
fs = TARGET; font = load_font(fs)
for _ in range(8):
    cb = font.getbbox("H"); ch = cb[3] - cb[1]
    if ch == 0: break
    fs = max(8, int(fs * TARGET / ch)); font = load_font(fs)
wb = font.getbbox(WORD); ww = wb[2] - wb[0]
if ww > MAXW:
    fs = int(fs * MAXW / ww); font = load_font(fs)
asc, desc = font.getmetrics()
b = font.getbbox(WORD)
LW = (b[2] - b[0]) + 60; LH = asc + desc + 40
layer = Image.new("RGBA", (LW, LH), (0, 0, 0, 0))
ImageDraw.Draw(layer).text((30 - b[0], 20), WORD, font=font, fill=(255, 255, 255, 255))
baseline_y = 20 + asc
slant = 0.22
layer = layer.transform((LW + int(slant * LH), LH),
                        Image.AFFINE, (1, slant, -slant * LH, 0, 1, 0), resample=Image.BICUBIC)
txt = layer; TW, TH = txt.size
txt_alpha = txt.split()[3]
txt_alpha_np = np.asarray(txt_alpha).astype(np.uint8)
DIM = np.array([231, 198, 191], np.float32); WHITE = np.array([255, 255, 255], np.float32)
glow_base = Image.new("RGBA", txt.size, (255, 240, 222, 0)); glow_base.putalpha(txt_alpha)
glow_base = glow_base.filter(ImageFilter.GaussianBlur(24))
GLOW_A = np.asarray(glow_base.split()[3]).astype(np.float32)   # base halo alpha
GLOW_RGB = np.array([255, 240, 222], np.float32)

# per-letter centres (for the twinkle wave)
centres = []
xcur = 30 - b[0]
for c in WORD:
    adv = font.getlength(c)
    centres.append(xcur + adv / 2 + slant * LH / 2)
    xcur += adv
centres = [c for c, ch in zip(centres, WORD) if ch != " "]
sigma = max(40.0, (TW / max(1, len(centres))) * 0.42)
COLX = np.arange(TW, dtype=np.float32)

ex = (W - TW) // 2
ey = (road_top - int(0.10 * H)) - baseline_y     # RAISED above the road (clear gap)

def ease_out_back(x):
    x = max(0.0, min(1.0, x)); c1 = 1.70158; c3 = c1 + 1
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2

BUS_CYCLE = 5.0; DASH_GAP = 230; INTRO = 1.2
TW_PERIOD = 2.4; TW_PHASE = 0.7

def col_intensity(t):
    inten = np.full(TW, 0.18, np.float32)            # base glow so letters never go fully dark
    for i, cx in enumerate(centres):
        g = 0.5 + 0.5 * math.sin(2 * math.pi * t / TW_PERIOD - i * TW_PHASE)
        inten += g * np.exp(-((COLX - cx) ** 2) / (2 * sigma ** 2))
    return np.clip(inten, 0, 1.15)

def render_frame(t):
    fr = Image.new("RGB", (W, H), BG)
    busX = -busw + ((t % BUS_CYCLE) / BUS_CYCLE) * (W + 2 * busw)

    # intro = rise + fade in; twinkle glow is ACTIVE from the very start (glows while appearing)
    if t < INTRO:
        p = t / INTRO
        yoff = int((1 - ease_out_back(p)) * (TH + road_h))
        fade = min(1.0, p * 2.2)
    else:
        yoff, fade = 0, 1.0
    inten = col_intensity(t)
    ga = (GLOW_A * np.clip(inten, 0, 1.15)[None, :] * fade).clip(0, 255).astype(np.uint8)
    glow = np.zeros((TH, TW, 4), np.uint8)
    glow[..., 0] = int(GLOW_RGB[0]); glow[..., 1] = int(GLOW_RGB[1]); glow[..., 2] = int(GLOW_RGB[2])
    glow[..., 3] = ga
    gimg = Image.fromarray(glow)
    fr.paste(gimg, (ex, ey + yoff), gimg)
    lt = np.clip(inten, 0, 1)[:, None]
    col = DIM[None, :] + (WHITE - DIM)[None, :] * lt
    rgb = np.broadcast_to(col[None, :, :], (TH, TW, 3))
    la = (txt_alpha_np.astype(np.float32) * fade).astype(np.uint8)
    letter = np.dstack([rgb, la]).astype(np.uint8)
    limg = Image.fromarray(letter)
    fr.paste(limg, (ex, ey + yoff), limg)

    d = ImageDraw.Draw(fr)
    d.rectangle([0, road_top, W, H], fill=ROADC)
    off = int((t * 360) % DASH_GAP); dy = road_top + road_h // 2
    for xx in range(-DASH_GAP, W + DASH_GAP, DASH_GAP):
        d.rounded_rectangle([xx - off, dy - 6, xx - off + 120, dy + 6], radius=6, fill=(232, 222, 202))
    fr.paste(bus_r, (int(busX), bus_y), bus_r)
    return fr

if __name__ == "__main__":
    if MODE == "keys":
        for t in [0.5, 2.0, 3.2, 4.5]:
            render_frame(t).save(f"/tmp/kc_{t:04.1f}.png"); print("key", t, WORD)
    else:
        os.makedirs(FRAMES, exist_ok=True)
        n = int(DUR * FPS)
        for i in range(n):
            render_frame(i / FPS).save(f"{FRAMES}/f_{i:04d}.png")
            if i % 90 == 0: print("frame", i, "/", n)
        ff = imageio_ffmpeg.get_ffmpeg_exe()
        out = f"{SCRATCH}/{OUTNAME}-4096x546.mp4"
        subprocess.run([ff, "-y", "-framerate", str(FPS), "-i", f"{FRAMES}/f_%04d.png",
                        "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p",
                        "-crf", "16", "-preset", "medium", "-movflags", "+faststart", out], check=True)
        for f in os.listdir(FRAMES):
            os.remove(os.path.join(FRAMES, f))
        print("ENCODED", out)
