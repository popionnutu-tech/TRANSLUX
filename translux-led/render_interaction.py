import sys, os, math, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageChops, ImageFilter
import imageio_ffmpeg

W, H = 4096, 546
FPS = 30
DUR = 15.0
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

# ---------- EDINET word layer (forward italic, max size) ----------
def load_font(size):
    for p in ["/System/Library/Fonts/Supplemental/Arial Black.ttf",
              "/System/Library/Fonts/Supplemental/Impact.ttf",
              "/Users/ionpop/Desktop/TRANSLUX/apps/web/public/fonts/OpenSans-Bold.ttf"]:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

CAP = int(0.74 * H)
fs = CAP; font = load_font(fs)
for _ in range(8):
    bb = font.getbbox("EDINEȚ"); th = bb[3] - bb[1]
    if th == 0: break
    fs = max(8, int(fs * CAP / th)); font = load_font(fs)
bb = font.getbbox("EDINEȚ")
layer = Image.new("RGBA", (bb[2] - bb[0] + 60, bb[3] - bb[1] + 60), (0, 0, 0, 0))
ImageDraw.Draw(layer).text((30 - bb[0], 30 - bb[1]), "EDINEȚ", font=font, fill=(255, 255, 255, 255))
slant = 0.22
layer = layer.transform((layer.width + int(slant * layer.height), layer.height),
                        Image.AFFINE, (1, slant, -slant * layer.height, 0, 1, 0), resample=Image.BICUBIC)
txt = layer
TW, TH = txt.size
txt_alpha = txt.split()[3]
txt_alpha_np = np.asarray(txt_alpha).astype(np.float32) / 255.0
glow = Image.new("RGBA", txt.size, (255, 232, 212, 0)); glow.putalpha(txt_alpha)
glow = glow.filter(ImageFilter.GaussianBlur(20))
glow.putalpha(glow.split()[3].point(lambda v: int(v * 0.25)))   # subtle halo, keep letters crisp
ex = (W - TW) // 2
ey = road_top + int(0.10 * H) - TH     # comma sits just over the road, caps near the top

def ease_out(x): x = max(0.0, min(1.0, x)); return 1 - (1 - x) ** 3
def ease_out_back(x):
    x = max(0.0, min(1.0, x)); c1 = 1.70158; c3 = c1 + 1
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2

BUS_CYCLE = 5.0
DASH_GAP = 230
INTRO = 1.2

def render_frame(t):
    fr = Image.new("RGB", (W, H), BG)
    busX = -busw + ((t % BUS_CYCLE) / BUS_CYCLE) * (W + 2 * busw)

    # EDINET: intro rise-from-road once, then persistent
    if t < INTRO:
        p = t / INTRO
        off = int((1 - ease_out_back(p)) * (TH + road_h))
        fade = min(1.0, p * 2.2)
        l = txt.copy(); l.putalpha(l.split()[3].point(lambda v: int(v * fade)))
        fr.paste(l, (ex, ey + off), l)
    else:
        fr.paste(glow, (ex, ey), glow)
        fr.paste(txt, (ex, ey), txt)
        # warm "headlight" shine that follows the bus across the letters
        center = busX - ex
        if -300 < center < TW + 300:
            xs = np.arange(TW)
            g = np.exp(-((xs - center) ** 2) / (2 * 210.0 ** 2)) * 100.0
            bandA = (np.tile(g, (TH, 1)) * txt_alpha_np).astype(np.uint8)
            shine = Image.new("RGBA", (TW, TH), (255, 244, 230, 0))
            shine.putalpha(Image.fromarray(bandA))
            fr.paste(shine, (ex, ey), shine)

    # road + scrolling dashes
    d = ImageDraw.Draw(fr)
    d.rectangle([0, road_top, W, H], fill=ROADC)
    off = int((t * 360) % DASH_GAP)
    dy = road_top + road_h // 2
    for xx in range(-DASH_GAP, W + DASH_GAP, DASH_GAP):
        d.rounded_rectangle([xx - off, dy - 6, xx - off + 120, dy + 6], radius=6, fill=(232, 222, 202))

    # bus on the road, in front
    fr.paste(bus_r, (int(busX), bus_y), bus_r)
    return fr

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "keys"
    if mode == "keys":
        for t in [0.5, 1.4, 2.6, 4.0, 7.0, 11.0]:
            render_frame(t).save(f"/tmp/k_{t:04.1f}.png"); print("key", t)
    else:
        os.makedirs(FRAMES, exist_ok=True)
        n = int(DUR * FPS)
        for i in range(n):
            render_frame(i / FPS).save(f"{FRAMES}/f_{i:04d}.png")
            if i % 60 == 0: print("frame", i, "/", n)
        ff = imageio_ffmpeg.get_ffmpeg_exe()
        out = SCRATCH + "/TRANSLUX-edinet-4096x546.mp4"
        subprocess.run([ff, "-y", "-framerate", str(FPS), "-i", f"{FRAMES}/f_%04d.png",
                        "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p",
                        "-crf", "16", "-preset", "medium", "-movflags", "+faststart", out], check=True)
        print("ENCODED", out)
