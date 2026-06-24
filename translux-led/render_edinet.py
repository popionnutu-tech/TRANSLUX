import sys, os, math, subprocess
from PIL import Image, ImageDraw, ImageFont, ImageChops, ImageFilter
import imageio_ffmpeg

W, H = 4096, 546
FPS = 30
DUR = 15.0
BG = (155, 27, 48)
ROAD = (92, 16, 28)
SCRATCH = "/Users/ionpop/Desktop/translux-intro"
FRAMES = SCRATCH + "/frames"

# ---------- bus ----------
bus = Image.open("/tmp/bus_translux_v3.png").convert("RGBA")
bW, bH = bus.size
bush = int(0.80 * H)
busw = int(bW * bush / bH)
bus_r = bus.resize((busw, bush), Image.LANCZOS)
bus_x = int(0.985 * W) - busw
bus_y = int(0.99 * H) - bush

WHEELS = [(0.29, 0.68), (0.83, 0.68)]      # fractions of busw,bush (hub centers)
WR = int(0.052 * busw)                      # tire radius (for road placement)
WSPIN = int(0.036 * busw)                   # only the rim+spokes spin; black tire stays static
wheel_cy = bus_y + int(0.68 * bush)
road_top = wheel_cy + WR

# extract just the rim+spokes disc (well inside the dark tire -> no white-arch artifacts)
wheel_sprites = []
for fx, fy in WHEELS:
    cx, cy = int(fx * busw), int(fy * bush)
    crop = bus_r.crop((cx - WSPIN, cy - WSPIN, cx + WSPIN, cy + WSPIN)).convert("RGBA")
    m = Image.new("L", crop.size, 0)
    ImageDraw.Draw(m).ellipse([0, 0, crop.size[0] - 1, crop.size[1] - 1], fill=255)
    crop.putalpha(ImageChops.multiply(crop.split()[3], m))
    wheel_sprites.append(crop)

# ---------- EDINET text (bigger) ----------
def load_font(size):
    for p in ["/System/Library/Fonts/Supplemental/Arial Black.ttf",
              "/System/Library/Fonts/Supplemental/Impact.ttf",
              "/Users/ionpop/Desktop/TRANSLUX/apps/web/public/fonts/OpenSans-Bold.ttf"]:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

target_cap = int(0.72 * H)
fs = target_cap; font = load_font(fs)
for _ in range(8):
    b = font.getbbox("EDINEȚ"); th = b[3] - b[1]
    if th == 0: break
    fs = max(8, int(fs * target_cap / th)); font = load_font(fs)
b = font.getbbox("EDINEȚ"); tw, th = b[2] - b[0], b[3] - b[1]
txt = Image.new("RGBA", (tw + 60, th + 60), (0, 0, 0, 0))
ImageDraw.Draw(txt).text((30 - b[0], 30 - b[1]), "EDINEȚ", font=font, fill=(255, 255, 255, 255))
shear = -0.18
txt = txt.transform((txt.width + int(abs(shear) * txt.height), txt.height),
                    Image.AFFINE, (1, shear, 0, 0, 1, 0), resample=Image.BICUBIC)
TW, TH = txt.size
txt_alpha = txt.split()[3]
glow = Image.new("RGBA", txt.size, (255, 235, 215, 0)); glow.putalpha(txt_alpha)
glow = glow.filter(ImageFilter.GaussianBlur(24))

edi_right = bus_x - int(0.05 * W)
zone_left = int(0.025 * W)
ex = zone_left + ((edi_right - zone_left) - TW) // 2
ey = (H - TH) // 2

# ---------- static base ----------
base = Image.new("RGB", (W, H), BG)
bd = ImageDraw.Draw(base)
bd.rectangle([0, road_top, W, H], fill=ROAD)
dash_y = (road_top + H) // 2
for x in range(0, W, 220):
    bd.rounded_rectangle([x, dash_y - 5, x + 110, dash_y + 5], radius=5, fill=(230, 220, 200))

def smoothstep(x):
    x = max(0.0, min(1.0, x)); return x * x * (3 - 2 * x)
def ease_out(x):
    x = max(0.0, min(1.0, x)); return 1 - (1 - x) ** 3

TOW = 10.0
START_DX = -(ex + TW + int(0.04 * W))   # EDINET starts just off the left edge, then is pulled to the middle
def group_dx(t):
    return 0.0 if t >= TOW else START_DX * (1 - smoothstep(t / TOW))

def render_frame(t):
    fr = base.copy()
    dx = group_dx(t)
    dist = group_dx(t) - START_DX
    ang = math.degrees(dist / WR)

    if t < 3.2:
        ov = Image.new("RGBA", (W, H), (0, 0, 0, 0)); od = ImageDraw.Draw(ov)
        for i, w in enumerate([90, 55, 140]):
            tt = (t - i * 0.18) / 0.9
            if 0 <= tt <= 1:
                sx = int(-200 + tt * (W + 400))
                od.polygon([(sx, -40), (sx + w, -40), (sx + w - 160, H + 40), (sx - 160, H + 40)],
                           fill=(212, 32, 39, 150))
        fr = Image.alpha_composite(fr.convert("RGBA"), ov.filter(ImageFilter.GaussianBlur(3))).convert("RGB")

    gx = int(ex + dx); gy = ey
    if t > 10.4:
        ga = ease_out((t - 10.4) / 1.2)
        gl = glow.copy(); gl.putalpha(gl.split()[3].point(lambda v: int(v * ga)))
        fr.paste(gl, (gx, gy), gl)
    fr.paste(txt, (gx, gy), txt)
    if 10.8 < t < 13.6:
        sp = (t - 10.8) / 2.4
        band = Image.new("RGBA", (TW, TH), (0, 0, 0, 0)); bdr = ImageDraw.Draw(band)
        bw = int(TW * 0.22); bx = int(-bw + sp * (TW + bw))
        for xx in range(max(0, bx), min(TW, bx + bw)):
            a = 1 - abs((xx - (bx + bw / 2)) / (bw / 2))
            bdr.line([(xx, 0), (xx, TH)], fill=(255, 255, 255, int(160 * max(0, a))))
        band.putalpha(ImageChops.multiply(band.split()[3], txt_alpha))
        fr.paste(band, (gx, gy), band)

    rope_x1 = bus_x + int(0.04 * busw) + dx
    rope_y1 = bus_y + int(0.66 * bush)
    rope_x0 = gx + TW - 30
    rope_y0 = gy + int(TH * 0.62)
    sway = 18 * math.sin(t * 2.2)
    pts = []
    for i in range(41):
        u = i / 40; mx = (rope_x0 + rope_x1) / 2; my = max(rope_y0, rope_y1) + 42 + sway
        x = (1 - u) ** 2 * rope_x0 + 2 * (1 - u) * u * mx + u ** 2 * rope_x1
        y = (1 - u) ** 2 * rope_y0 + 2 * (1 - u) * u * my + u ** 2 * rope_y1
        pts.append((x, y))
    rd = ImageDraw.Draw(fr)
    rd.line(pts, fill=(231, 207, 155), width=9, joint="curve")
    for cx0, cy0 in [(rope_x0, rope_y0), (rope_x1, rope_y1)]:
        rd.ellipse([cx0 - 11, cy0 - 11, cx0 + 11, cy0 + 11], fill=(255, 255, 255), outline=BG, width=3)

    fr.paste(bus_r, (int(bus_x + dx), bus_y), bus_r)
    for (fxw, fyw), spr in zip(WHEELS, wheel_sprites):
        rot = spr.rotate(-ang, resample=Image.BICUBIC)
        cx = int(bus_x + dx) + int(fxw * busw); cy = bus_y + int(fyw * bush)
        fr.paste(rot, (cx - WSPIN, cy - WSPIN), rot)
    return fr

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "keys"
    if mode == "keys":
        for t in [0.0, 3.0, 5.0, 8.0, 10.0, 12.0, 14.0]:
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
